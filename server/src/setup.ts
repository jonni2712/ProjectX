import bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import { createInterface, type Interface } from 'readline';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import {
  loadStoredConfig,
  saveStoredConfig,
  configFileExists,
  CONFIG_PATH,
  type StoredConfig,
} from './config-store.js';

// ProjectX setup wizard.
//
// Runs BEFORE a valid configuration exists, so it must not pull in config.ts
// (which validates on import and process.exit()s on a weak JWT secret or a
// missing workspace). It therefore:
//   1. collects settings interactively,
//   2. writes data/config.json directly via config-store (no validation), and
//   3. ONLY THEN dynamically imports the DB layer to seed the admin user —
//      by which point config.ts validates cleanly against the file we wrote.

const rl: Interface = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string, def?: string): Promise<string> {
  const suffix = def !== undefined && def !== '' ? ` [${def}]` : '';
  return new Promise(resolve => {
    rl.question(`${question}${suffix}: `, answer => {
      const trimmed = answer.trim();
      resolve(trimmed || def || '');
    });
  });
}

// Read input without echoing it to the terminal (for passwords / API keys).
function askHidden(question: string): Promise<string> {
  return new Promise(resolve => {
    const rlAny = rl as unknown as { _writeToOutput: (s: string) => void };
    const original = rlAny._writeToOutput.bind(rl);
    let primed = false;
    // Print the prompt once, then swallow every subsequent echoed character.
    rlAny._writeToOutput = (s: string) => {
      if (!primed) { original(s); primed = true; return; }
      if (s.includes('\n')) original('\n');
    };
    rl.question(`${question}: `, answer => {
      rlAny._writeToOutput = original;
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function askYesNo(question: string, defYes = false): Promise<boolean> {
  const hint = defYes ? 'Y/n' : 'y/N';
  const answer = (await ask(`${question} (${hint})`)).toLowerCase();
  if (!answer) return defYes;
  return answer === 'y' || answer === 'yes';
}

// Mirror the server's password policy (see routes/auth.ts validatePasswordStrength).
const MIN_PASSWORD_LENGTH = 8;
function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (new Set(password).size < 4) return 'is too repetitive (needs at least 4 distinct characters)';
  return null;
}

function parseOrigins(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

// First non-empty value among the given environment variable names.
function envStr(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k];
    if (v !== undefined && v !== '') return v;
  }
  return undefined;
}

// Run without prompts when there is no TTY (Docker / CI), or when explicitly
// requested. In that mode every value comes from the environment.
function isNonInteractive(): boolean {
  if (process.argv.includes('--non-interactive') || process.argv.includes('--ci')) return true;
  const flag = process.env.PROJECTX_NONINTERACTIVE;
  if (flag && flag !== '0' && flag.toLowerCase() !== 'false') return true;
  return !process.stdin.isTTY;
}

// Non-interactive setup, driven entirely by environment variables. Used by the
// Docker image and CI. Recognised vars (PROJECTX_* take precedence):
//   PROJECTX_WORKSPACE_ROOT / WORKSPACE_ROOT   (default ~/projectx-workspace)
//   PROJECTX_PORT / PORT                       (default 3000)
//   PROJECTX_HOST / HOST                       (default 0.0.0.0 — containers expose externally)
//   PROJECTX_PUBLIC_ORIGINS / PUBLIC_ORIGINS   (comma-separated)
//   PROJECTX_ANTHROPIC_API_KEY / ANTHROPIC_API_KEY
//   JWT_SECRET                                 (generated if missing/weak)
//   PROJECTX_ADMIN_USERNAME / AUTH_USERNAME    (default admin)
//   PROJECTX_ADMIN_PASSWORD                    (plaintext, hashed here) OR AUTH_PASSWORD_HASH
async function runNonInteractive(): Promise<void> {
  const existing: StoredConfig = configFileExists() ? loadStoredConfig() : {};

  const workspaceRoot = resolve(
    envStr('PROJECTX_WORKSPACE_ROOT', 'WORKSPACE_ROOT') || existing.workspaceRoot || resolve(homedir(), 'projectx-workspace')
  );
  if (!existsSync(workspaceRoot)) {
    mkdirSync(workspaceRoot, { recursive: true });
    console.log(`[setup] Created workspace root ${workspaceRoot}`);
  }

  const port = parseInt(envStr('PROJECTX_PORT', 'PORT') || String(existing.port ?? 3000), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`[setup] Invalid port: ${port}`);
    process.exit(1);
  }
  const host = envStr('PROJECTX_HOST', 'HOST') || existing.host || '0.0.0.0';
  const originsRaw = envStr('PROJECTX_PUBLIC_ORIGINS', 'PUBLIC_ORIGINS');
  const publicOrigins = originsRaw !== undefined ? parseOrigins(originsRaw) : (existing.publicOrigins ?? []);
  const anthropicApiKey = envStr('PROJECTX_ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY') || existing.anthropicApiKey || '';

  const jwtFromEnv = envStr('JWT_SECRET');
  const jwtSecret =
    jwtFromEnv && jwtFromEnv.length >= 32 ? jwtFromEnv
    : existing.jwt?.secret && existing.jwt.secret.length >= 32 ? existing.jwt.secret
    : randomBytes(32).toString('hex');

  const stored: StoredConfig = {
    port,
    host,
    workspaceRoot,
    jwt: {
      secret: jwtSecret,
      expiresIn: existing.jwt?.expiresIn || '24h',
      refreshExpiresIn: existing.jwt?.refreshExpiresIn || '7d',
    },
    anthropicApiKey,
    rateLimit: {
      loginMax: existing.rateLimit?.loginMax ?? 5,
      loginWindow: existing.rateLimit?.loginWindow ?? 300000,
    },
    watcherDebounce: existing.watcherDebounce ?? 500,
    publicOrigins,
    cloudflaredExpectedHashes: existing.cloudflaredExpectedHashes ?? [],
  };
  saveStoredConfig(stored);
  console.log(`[setup] Wrote configuration to ${CONFIG_PATH}`);

  // Resolve the admin password: plaintext (hashed here) or a pre-computed hash.
  const username = envStr('PROJECTX_ADMIN_USERNAME', 'AUTH_USERNAME') || 'admin';
  const passwordPlain = envStr('PROJECTX_ADMIN_PASSWORD');
  let passwordHash = envStr('AUTH_PASSWORD_HASH');
  if (passwordPlain) {
    const problem = passwordProblem(passwordPlain);
    if (problem) {
      console.error(`[setup] PROJECTX_ADMIN_PASSWORD ${problem}.`);
      process.exit(1);
    }
    passwordHash = await bcrypt.hash(passwordPlain, 12);
  }

  const { getUserByUsername, createUser, updateUser } = await import('./db/database.js');
  const existingUser = getUserByUsername(username);
  if (existingUser) {
    if (passwordHash) {
      updateUser(existingUser.id, { password_hash: passwordHash, role: 'admin', active: 1 });
      console.log(`[setup] Updated admin user "${username}".`);
    } else {
      console.log(`[setup] Admin user "${username}" already exists; no password provided, left unchanged.`);
    }
  } else if (passwordHash) {
    createUser(randomUUID(), username, passwordHash, 'admin');
    console.log(`[setup] Created admin user "${username}".`);
  } else {
    console.error('[setup] No admin user exists and neither PROJECTX_ADMIN_PASSWORD nor AUTH_PASSWORD_HASH was provided — cannot create admin.');
    process.exit(1);
  }
  console.log('[setup] Non-interactive setup complete.');
}

async function main(): Promise<void> {
  if (isNonInteractive()) {
    await runNonInteractive();
    rl.close();
    return;
  }

  console.log('\n  ProjectX Server Setup\n  =====================\n');

  const reconfiguring = configFileExists();
  const existing: StoredConfig = reconfiguring ? loadStoredConfig() : {};

  if (reconfiguring) {
    console.log(`  Existing configuration found at:\n    ${CONFIG_PATH}\n`);
    const proceed = await askYesNo('  Reconfigure? This will overwrite config.json', false);
    if (!proceed) {
      console.log('\n  Setup cancelled — nothing changed.\n');
      rl.close();
      return;
    }
    console.log('');
  }

  // --- Workspace ---
  const defaultWorkspace = existing.workspaceRoot || resolve(homedir(), 'projectx-workspace');
  const workspaceRoot = resolve(await ask('  Workspace root (where your repos live)', defaultWorkspace));
  if (!existsSync(workspaceRoot)) {
    const create = await askYesNo(`  "${workspaceRoot}" does not exist. Create it?`, true);
    if (!create) {
      console.error('\n  Workspace root must exist before the server can start. Aborting.\n');
      rl.close();
      process.exit(1);
    }
    mkdirSync(workspaceRoot, { recursive: true });
    console.log(`  Created ${workspaceRoot}`);
  }

  // --- Network ---
  const portStr = await ask('  Port', String(existing.port ?? 3000));
  const port = parseInt(portStr, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('\n  Invalid port. Aborting.\n');
    rl.close();
    process.exit(1);
  }

  console.log('\n  Bind address: use 127.0.0.1 for loopback-only (safest, pair with a Cloudflare tunnel),');
  console.log('  or 0.0.0.0 to expose on your LAN (then you must set public origins below).');
  const host = await ask('  Host', existing.host || '127.0.0.1');

  let publicOrigins = existing.publicOrigins ?? [];
  if (host === '0.0.0.0' || publicOrigins.length) {
    const raw = await ask('  Public origins for CORS (comma-separated, e.g. https://x.trycloudflare.com)', publicOrigins.join(','));
    publicOrigins = parseOrigins(raw);
  }

  // --- Anthropic API key (optional fallback when the Claude CLI is unavailable) ---
  console.log('\n  Anthropic API key is optional — used only as a fallback when the Claude CLI');
  console.log('  is not available on the server. Leave blank to skip.');
  const anthropicKeyInput = await askHidden('  Anthropic API key (hidden, optional)');
  const anthropicApiKey = anthropicKeyInput.trim() || existing.anthropicApiKey || '';

  // --- Admin account ---
  console.log('\n  Create the admin account (stored in the database, not in config.json):');
  const username = (await ask('  Admin username', 'admin')) || 'admin';

  let password = '';
  for (;;) {
    password = await askHidden('  Admin password (hidden)');
    const problem = passwordProblem(password);
    if (problem) {
      console.log(`  Password ${problem}. Try again.`);
      continue;
    }
    const confirm = await askHidden('  Confirm password');
    if (confirm !== password) {
      console.log('  Passwords do not match. Try again.');
      continue;
    }
    break;
  }

  // --- JWT secret: keep the existing one when reconfiguring (so live sessions
  // survive), otherwise generate a strong random one. ---
  const jwtSecret = existing.jwt?.secret && existing.jwt.secret.length >= 32
    ? existing.jwt.secret
    : randomBytes(32).toString('hex');

  // --- Persist config.json (created with 0600 perms by config-store) ---
  const stored: StoredConfig = {
    port,
    host,
    workspaceRoot,
    jwt: {
      secret: jwtSecret,
      expiresIn: existing.jwt?.expiresIn || '24h',
      refreshExpiresIn: existing.jwt?.refreshExpiresIn || '7d',
    },
    anthropicApiKey,
    rateLimit: {
      loginMax: existing.rateLimit?.loginMax ?? 5,
      loginWindow: existing.rateLimit?.loginWindow ?? 300000,
    },
    watcherDebounce: existing.watcherDebounce ?? 500,
    publicOrigins,
    cloudflaredExpectedHashes: existing.cloudflaredExpectedHashes ?? [],
  };
  saveStoredConfig(stored);
  console.log(`\n  Wrote configuration to ${CONFIG_PATH}`);

  // --- Seed the admin user. Import the DB layer ONLY now: it pulls in config.ts,
  // which validates against the config.json we just wrote (strong secret +
  // existing workspace), so it no longer exits. ---
  const passwordHash = await bcrypt.hash(password, 12);
  const { getUserByUsername, createUser, updateUser } = await import('./db/database.js');

  const existingUser = getUserByUsername(username);
  if (existingUser) {
    const overwrite = await askYesNo(`  User "${username}" already exists. Reset its password and make it admin?`, true);
    if (overwrite) {
      updateUser(existingUser.id, { password_hash: passwordHash, role: 'admin', active: 1 });
      console.log(`  Updated existing admin user "${username}".`);
    } else {
      console.log(`  Kept existing user "${username}" unchanged.`);
    }
  } else {
    createUser(randomUUID(), username, passwordHash, 'admin');
    console.log(`  Created admin user "${username}".`);
  }

  console.log('\n  Setup complete. Start the server with:\n');
  console.log('    npm start        (or: npm run dev for hot-reload)\n');
  console.log(`  It will listen on http://${host}:${port}\n`);
  rl.close();
}

main().catch(err => {
  console.error('\n  Setup failed:', err instanceof Error ? err.message : err);
  rl.close();
  process.exit(1);
});
