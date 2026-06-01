import { resolve } from 'path';
import { existsSync } from 'fs';
import { loadStoredConfig, saveStoredConfig, configFileExists } from './config-store.js';

// Parse PUBLIC_ORIGIN(S): comma-separated list of tunnel/public origins allowed by CORS.
// Example: PUBLIC_ORIGINS=https://myapp.trycloudflare.com,https://projectx.mydomain.com
function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

// Persistent config store (data/config.json). Resolution precedence for every
// value is: environment variable (override) > config.json > built-in default.
// This keeps existing .env-based deployments working unchanged while making
// config.json the durable source of truth for fresh installs and the wizard.
const stored = loadStoredConfig();

// An env var counts as "set" only when present AND non-empty — an empty string
// (common with a stub .env line like `JWT_SECRET=`) must NOT shadow config.json.
function pickStr(env: string | undefined, fromStore: string | undefined, def: string): string {
  if (env !== undefined && env !== '') return env;
  if (fromStore !== undefined && fromStore !== '') return fromStore;
  return def;
}

function pickInt(env: string | undefined, fromStore: number | undefined, def: number): number {
  if (env !== undefined && env !== '') return parseInt(env, 10);
  if (fromStore !== undefined) return fromStore;
  return def;
}

function pickList(env: string | undefined, fromStore: string[] | undefined): string[] {
  if (env !== undefined && env !== '') return parseOrigins(env);
  if (Array.isArray(fromStore)) return fromStore;
  return [];
}

export const config = {
  port: pickInt(process.env.PORT, stored.port, 3000),
  // Default to loopback only. Users who want LAN/tunnel exposure must opt in
  // by setting HOST=0.0.0.0 explicitly.
  host: pickStr(process.env.HOST, stored.host, '127.0.0.1'),
  workspaceRoot: resolve(pickStr(process.env.WORKSPACE_ROOT, stored.workspaceRoot, '/github')),
  jwt: {
    secret: pickStr(process.env.JWT_SECRET, stored.jwt?.secret, 'change-me-in-production'),
    expiresIn: pickStr(process.env.JWT_EXPIRES_IN, stored.jwt?.expiresIn, '24h'),
    refreshExpiresIn: pickStr(process.env.REFRESH_TOKEN_EXPIRES_IN, stored.jwt?.refreshExpiresIn, '7d'),
  },
  // Auth credentials remain env-only and are NOT persisted to config.json: they
  // exist solely to seed the first admin into the users table on a fresh DB
  // (see db/database.ts). The users table is the source of truth thereafter.
  auth: {
    username: process.env.AUTH_USERNAME || 'admin',
    passwordHash: process.env.AUTH_PASSWORD_HASH || '',
  },
  anthropicApiKey: pickStr(process.env.ANTHROPIC_API_KEY, stored.anthropicApiKey, ''),
  rateLimit: {
    loginMax: pickInt(process.env.LOGIN_RATE_LIMIT_MAX, stored.rateLimit?.loginMax, 5),
    loginWindow: pickInt(process.env.LOGIN_RATE_LIMIT_WINDOW, stored.rateLimit?.loginWindow, 300000),
  },
  watcherDebounce: pickInt(process.env.WATCHER_DEBOUNCE, stored.watcherDebounce, 500),
  // CORS: list of extra origins allowed in addition to localhost/127.0.0.1.
  // Set this to your Cloudflare tunnel domain (or custom domain).
  publicOrigins: pickList(process.env.PUBLIC_ORIGINS, stored.publicOrigins),
  // Optional supply-chain hardening for cloudflared: comma-separated list of
  // SHA256 hashes (lowercase hex) that the local cloudflared binary MUST match
  // before the server will start the tunnel. If empty, no verification is
  // performed but the detected hash is logged for observability.
  cloudflaredExpectedHashes: pickList(process.env.CLOUDFLARED_EXPECTED_SHA256, stored.cloudflaredExpectedHashes)
    .map(h => h.toLowerCase()),
} as const;

// Validate JWT secret: reject known defaults, require reasonable length AND
// reject low-entropy strings (e.g. "aaaaaaaa..." or "12345678..." which trivially
// pass a length check but offer no real security).
const KNOWN_DEFAULTS = new Set([
  'change-me-to-a-random-secret',
  'change-me-in-production',
  'secret',
  '',
]);

function shannonEntropy(str: string): number {
  if (str.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const c of str) counts.set(c, (counts.get(c) || 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function isJwtSecretWeak(secret: string): string | null {
  if (KNOWN_DEFAULTS.has(secret)) return 'matches a known default value';
  if (secret.length < 32) return 'is shorter than 32 characters';
  // A truly random hex string has ~4 bits of entropy per char (4 * 32 = 128).
  // We require >= 3 bits/char as a sanity floor — that catches things like
  // "aaaa...", "12345...", "passwordpasswordpassword..." but accepts any real
  // random output from openssl rand / crypto.randomBytes.
  const bitsPerChar = shannonEntropy(secret);
  if (bitsPerChar < 3.0) return `has too low entropy (${bitsPerChar.toFixed(2)} bits/char, need >= 3.0)`;
  return null;
}

const jwtWeakness = isJwtSecretWeak(config.jwt.secret);
if (jwtWeakness !== null) {
  console.error(
    `FATAL: JWT_SECRET ${jwtWeakness}.\n` +
    '       It must be a strong random string (at least 32 characters, high entropy).\n' +
    '       Generate one with:  openssl rand -hex 32\n' +
    '       Then set it in your .env file as JWT_SECRET=<value>.'
  );
  process.exit(1);
}

// Validate workspace root exists
if (!existsSync(config.workspaceRoot)) {
  console.error(`WORKSPACE_ROOT does not exist: ${config.workspaceRoot}`);
  process.exit(1);
}

// Warn (don't fail) when the server is bound to a public interface without any
// public origin configured — likely a misconfiguration.
if (config.host === '0.0.0.0' && config.publicOrigins.length === 0) {
  console.warn(
    '[config] WARNING: HOST is 0.0.0.0 but PUBLIC_ORIGINS is empty.\n' +
    '         The server will accept LAN connections but CORS will reject them.\n' +
    '         Set PUBLIC_ORIGINS=https://your-tunnel-domain in .env, or use HOST=127.0.0.1.'
  );
}

// First-run migration: snapshot the validated, effective configuration into
// data/config.json so future runs are self-contained and the setup wizard / web
// setup UI can read & write a single source of truth instead of editing .env by
// hand. Runs only when config.json does not yet exist, and only AFTER the JWT
// and workspace validations above have passed — so we never persist a config
// the server would refuse to start with. .env continues to override at runtime.
if (!configFileExists()) {
  try {
    saveStoredConfig({
      port: config.port,
      host: config.host,
      workspaceRoot: config.workspaceRoot,
      jwt: {
        secret: config.jwt.secret,
        expiresIn: config.jwt.expiresIn,
        refreshExpiresIn: config.jwt.refreshExpiresIn,
      },
      anthropicApiKey: config.anthropicApiKey,
      rateLimit: {
        loginMax: config.rateLimit.loginMax,
        loginWindow: config.rateLimit.loginWindow,
      },
      watcherDebounce: config.watcherDebounce,
      publicOrigins: [...config.publicOrigins],
      cloudflaredExpectedHashes: [...config.cloudflaredExpectedHashes],
    });
    console.log('[config] Migrated configuration to data/config.json — future runs no longer require .env for these values.');
  } catch (err) {
    console.warn(`[config] Could not write data/config.json (continuing with env/defaults): ${(err as Error).message}`);
  }
}

/**
 * Shared origin allowlist used by BOTH HTTP CORS and WebSocket handshake.
 * - no Origin header: accepted (native apps, curl, server-to-server — JWT still required)
 * - localhost / 127.0.0.1 (http or https): accepted
 * - anything listed in config.publicOrigins: accepted
 * - everything else: rejected
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return true;
  if (origin.startsWith('https://localhost') || origin.startsWith('https://127.0.0.1')) return true;
  return config.publicOrigins.includes(origin);
}
