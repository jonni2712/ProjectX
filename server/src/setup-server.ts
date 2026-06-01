import Fastify from 'fastify';
import bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { saveStoredConfig, type StoredConfig } from './config-store.js';

// Minimal first-run web setup. Runs ONLY when the server is unconfigured, and
// deliberately does NOT import config.ts (which would refuse to boot without a
// strong JWT secret). It serves a configuration form, writes data/config.json,
// seeds the admin user (importing the DB layer only after config.json exists,
// so config.ts then validates cleanly), and hands off to the real server.

const MIN_PASSWORD_LENGTH = 12; // aligned with the configured server's policy
function passwordProblem(password: string): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (new Set(password).size < 4) return 'is too repetitive (needs at least 4 distinct characters)';
  return null;
}

function parseOrigins(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ProjectX — Setup</title>
<style>
  :root { --bg:#0F0F1A; --surface:#1A1A2E; --field:#16162A; --primary:#6C9EFF; --accent:#4ECDC4; --text:#E0E0E0; --muted:#999; --err:#FF6B6B; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; display:flex; min-height:100vh; align-items:center; justify-content:center; padding:24px; }
  .card { width:100%; max-width:460px; background:var(--surface); border-radius:16px; padding:32px; box-shadow:0 12px 40px rgba(0,0,0,.4); }
  h1 { margin:0 0 4px; font-size:24px; }
  .sub { color:var(--muted); margin:0 0 24px; font-size:14px; }
  label { display:block; font-size:13px; color:var(--muted); margin:16px 0 6px; }
  input { width:100%; background:var(--field); border:1px solid #2a2a44; border-radius:10px; padding:12px 14px; color:var(--text); font-size:15px; }
  input:focus { outline:none; border-color:var(--primary); }
  .hint { font-size:12px; color:var(--muted); margin-top:6px; }
  button { width:100%; margin-top:24px; background:var(--primary); color:#0b0b16; border:none; border-radius:10px; padding:14px; font-size:16px; font-weight:600; cursor:pointer; }
  button:disabled { opacity:.6; cursor:default; }
  .msg { margin-top:16px; padding:12px 14px; border-radius:10px; font-size:14px; display:none; }
  .msg.err { display:block; background:rgba(255,107,107,.12); color:var(--err); }
  .msg.ok { display:block; background:rgba(78,205,196,.12); color:var(--accent); }
  details { margin-top:16px; } summary { cursor:pointer; color:var(--muted); font-size:13px; }
</style>
</head>
<body>
  <div class="card">
    <h1>ProjectX</h1>
    <p class="sub">First-run setup — configure your server</p>
    <form id="f">
      <label>Workspace root <span class="hint">(where your repos live)</span></label>
      <input name="workspaceRoot" id="workspaceRoot" placeholder="/home/you/projectx-workspace" />

      <label>Admin username</label>
      <input name="adminUsername" id="adminUsername" value="admin" />

      <label>Admin password <span class="hint">(min 8 chars)</span></label>
      <input name="adminPassword" id="adminPassword" type="password" />

      <label>Confirm password</label>
      <input name="confirmPassword" id="confirmPassword" type="password" />

      <details>
        <summary>Advanced (optional)</summary>
        <label>Public origins <span class="hint">(CORS, comma-separated)</span></label>
        <input name="publicOrigins" id="publicOrigins" placeholder="https://projectx.example.com" />
        <label>Anthropic API key <span class="hint">(Claude CLI fallback)</span></label>
        <input name="anthropicApiKey" id="anthropicApiKey" type="password" />
      </details>

      <button type="submit" id="btn">Complete setup</button>
      <div class="msg" id="msg"></div>
    </form>
  </div>
<script>
  const f = document.getElementById('f'), btn = document.getElementById('btn'), msg = document.getElementById('msg');
  function show(t, ok){ msg.textContent = t; msg.className = 'msg ' + (ok ? 'ok' : 'err'); }
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      workspaceRoot: workspaceRoot.value.trim(),
      adminUsername: adminUsername.value.trim() || 'admin',
      adminPassword: adminPassword.value,
      publicOrigins: publicOrigins.value.trim(),
      anthropicApiKey: anthropicApiKey.value.trim(),
    };
    if (!body.workspaceRoot) return show('Workspace root is required', false);
    if (body.adminPassword.length < 8) return show('Password must be at least 8 characters', false);
    if (body.adminPassword !== confirmPassword.value) return show('Passwords do not match', false);
    btn.disabled = true; show('Setting up…', true);
    try {
      const r = await fetch('/setup', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.success) {
        show('Setup complete! The server is starting — you can now log in from the ProjectX app.', true);
      } else {
        btn.disabled = false; show(j.error || 'Setup failed', false);
      }
    } catch (err) {
      btn.disabled = false; show('Network error: ' + err.message, false);
    }
  });
</script>
</body>
</html>`;

export async function runSetupServer(): Promise<void> {
  const port = parseInt(process.env.PORT || '3000', 10);
  // Bind to loopback by default — the setup UI is reached from the same machine
  // (desktop app / local browser). Override with PROJECTX_SETUP_HOST if needed.
  const host = process.env.PROJECTX_SETUP_HOST || '127.0.0.1';

  // SECURITY: when setup is exposed beyond loopback, whoever reaches /setup first
  // would seize admin + choose the JWT secret. Require an out-of-band token
  // (printed to the server console) in the /setup body in that case. On loopback
  // we trust local access (the desktop/web first-run path).
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  const setupToken = isLoopback ? null : randomBytes(18).toString('hex');

  const fastify = Fastify({ logger: false });
  let handoffStarted = false;
  let configured = false;

  fastify.get('/', async (_req, reply) => {
    reply.type('text/html').send(PAGE);
  });

  fastify.get('/setup/status', async () => ({ success: true, data: { configured: false } }));

  // Mirror the real server's public health endpoint so desktop/mobile clients
  // (which poll /health) can tell the server is up but in setup mode.
  fastify.get('/health', async () => ({ success: true, data: { status: 'setup', configured: false } }));

  fastify.post('/setup', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string>;
    // When exposed beyond loopback, require the out-of-band setup token.
    if (setupToken && body.setupToken !== setupToken) {
      return reply.status(403).send({ success: false, error: 'Invalid or missing setup token' });
    }
    const workspaceRoot = resolve((body.workspaceRoot || '').trim() || resolve(homedir(), 'projectx-workspace'));
    const adminUsername = (body.adminUsername || 'admin').trim() || 'admin';
    const adminPassword = body.adminPassword || '';

    const problem = passwordProblem(adminPassword);
    if (problem) {
      return reply.send({ success: false, error: `Password ${problem}` });
    }

    try {
      if (!existsSync(workspaceRoot)) mkdirSync(workspaceRoot, { recursive: true });
    } catch (err) {
      return reply.send({ success: false, error: `Could not create workspace: ${(err as Error).message}` });
    }

    const stored: StoredConfig = {
      port,
      host,
      workspaceRoot,
      jwt: {
        secret: randomBytes(32).toString('hex'),
        expiresIn: '24h',
        refreshExpiresIn: '7d',
      },
      anthropicApiKey: (body.anthropicApiKey || '').trim(),
      rateLimit: { loginMax: 5, loginWindow: 300000 },
      watcherDebounce: 500,
      publicOrigins: body.publicOrigins ? parseOrigins(body.publicOrigins) : [],
      cloudflaredExpectedHashes: [],
    };
    saveStoredConfig(stored);

    // Now that config.json exists and the workspace is present, importing the DB
    // layer is safe (it pulls in config.ts, which validates against our file).
    try {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      const { getUserByUsername, createUser, updateUser } = await import('./db/database.js');
      const existing = getUserByUsername(adminUsername);
      if (existing) {
        updateUser(existing.id, { password_hash: passwordHash, role: 'admin', active: 1 });
      } else {
        createUser(randomUUID(), adminUsername, passwordHash, 'admin');
      }
    } catch (err) {
      return reply.send({ success: false, error: `Failed to create admin user: ${(err as Error).message}` });
    }

    configured = true;
    return reply.send({ success: true });
  });

  // After the success response is flushed, shut the setup server down and start
  // the real server on the same port. If anything goes wrong, the operator can
  // simply restart the process — config.json is already written.
  fastify.addHook('onResponse', async (request) => {
    if (configured && !handoffStarted) {
      handoffStarted = true;
      setTimeout(async () => {
        try {
          await fastify.close();
          await import('./app.js');
        } catch (err) {
          console.error('[setup] Handoff to main server failed — please restart ProjectX.', err);
          process.exit(0);
        }
      }, 600);
    }
  });

  await fastify.listen({ port, host });
  console.log(`\n  ProjectX is not configured yet.`);
  console.log(`  Open the setup page in your browser:  http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}\n`);
  if (setupToken) {
    console.warn(`  [security] Setup is exposed on a non-loopback interface (${host}).`);
    console.warn(`  [security] A setup token is REQUIRED to complete setup:\n`);
    console.warn(`      PROJECTX setup token: ${setupToken}\n`);
    console.warn(`  Paste it into the "setup token" field (or include "setupToken" in the POST body).\n`);
  }
}
