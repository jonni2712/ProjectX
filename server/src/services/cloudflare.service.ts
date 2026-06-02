import { spawn, execSync, ChildProcess } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync, chmodSync, createWriteStream } from 'fs';
import { join } from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { config } from '../config.js';

// Cloudflare tunnel automation.
//
// Two modes:
//  - "quick":  `cloudflared tunnel --url ...` → an ephemeral *.trycloudflare.com
//              URL, no Cloudflare account needed. Great for instant access; the
//              URL changes on every restart.
//  - "named":  a persistent tunnel bound to the user's own domain, created via
//              the Cloudflare API (tunnel + remote ingress config + DNS CNAME),
//              then run with `cloudflared tunnel run --token`.
//
// This complements tunnel.service.ts (which runs a pre-existing ~/.cloudflared
// config.yml tunnel). The binary is auto-installed under ~/.projectx/bin if not
// already on PATH.

const BIN_DIR = join(os.homedir(), '.projectx', 'bin');
const PID_FILE = join(os.homedir(), '.projectx', 'cf-tunnel.pid');
const STATE_FILE = join(os.homedir(), '.projectx', 'cf-tunnel.json');
const CF_API = 'https://api.cloudflare.com/client/v4';
const GH_RELEASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download';

export type TunnelMode = 'quick' | 'named';

interface TunnelState {
  mode: TunnelMode;
  url: string | null;
  hostname?: string;
  tunnelId?: string;
  // Connector token for a named tunnel — lets us resume after a restart without
  // re-hitting the API. Persisted to a 0600 file alongside the pid.
  token?: string;
}

interface ActionResult {
  success: boolean;
  message: string;
  url?: string | null;
  mode?: TunnelMode;
}

let tunnelProcess: ChildProcess | null = null;
let current: TunnelState | null = null;

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing without network/spawn)
// ---------------------------------------------------------------------------

/**
 * Map a Node platform/arch to the cloudflared release asset name and whether it
 * is a tarball (macOS ships .tgz, Linux/Windows ship a bare binary/exe).
 */
export function cloudflaredAsset(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): { asset: string; isTarball: boolean } {
  const archMap: Record<string, string> = { x64: 'amd64', arm64: 'arm64', arm: 'arm', ia32: '386' };
  const a = archMap[arch] ?? 'amd64';
  if (platform === 'win32') return { asset: `cloudflared-windows-${a === 'arm64' ? 'amd64' : a}.exe`, isTarball: false };
  if (platform === 'darwin') return { asset: `cloudflared-darwin-${a === 'arm64' ? 'arm64' : 'amd64'}.tgz`, isTarball: true };
  return { asset: `cloudflared-linux-${a}`, isTarball: false };
}

/** Extract the assigned https://<x>.trycloudflare.com URL from cloudflared output. */
export function parseQuickTunnelUrl(text: string): string | null {
  const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  return m ? m[0] : null;
}

// ---------------------------------------------------------------------------
// Binary management
// ---------------------------------------------------------------------------

function managedBinaryPath(): string {
  return join(BIN_DIR, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
}

/** Locate cloudflared: PATH first, then the managed copy. Returns null if absent. */
export function resolveCloudflared(): string | null {
  // Prefer a system install (kernel/`where` resolves it at spawn time).
  try {
    if (process.platform === 'win32') {
      execSync('where cloudflared', { stdio: 'ignore', timeout: 5000 });
    } else {
      execSync('command -v cloudflared', { stdio: 'ignore', timeout: 5000 });
    }
    return 'cloudflared';
  } catch {
    // not on PATH
  }
  const managed = managedBinaryPath();
  return existsSync(managed) ? managed : null;
}

/** Download cloudflared into ~/.projectx/bin if it isn't already available. */
export async function ensureCloudflared(): Promise<{ success: boolean; path?: string; message: string }> {
  const existing = resolveCloudflared();
  if (existing) return { success: true, path: existing, message: 'cloudflared already installed' };

  const { asset, isTarball } = cloudflaredAsset();
  const url = `${GH_RELEASE}/${asset}`;
  mkdirSync(BIN_DIR, { recursive: true });

  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return { success: false, message: `Download failed: HTTP ${res.status} for ${url}` };
    const buf = Buffer.from(await res.arrayBuffer());

    const dest = managedBinaryPath();
    if (isTarball) {
      // macOS: write the tgz, extract the binary with the system `tar`.
      const tgz = join(BIN_DIR, 'cloudflared.tgz');
      writeFileSync(tgz, buf);
      execSync(`tar -xzf "${tgz}" -C "${BIN_DIR}"`, { timeout: 30000 });
      try { unlinkSync(tgz); } catch { /* ignore */ }
      if (!existsSync(dest)) return { success: false, message: 'Extracted archive did not contain cloudflared' };
    } else {
      writeFileSync(dest, buf);
    }
    // Verify integrity against the operator's pinned hash list BEFORE making it
    // executable, if one is configured. Without a pin we can only trust the
    // HTTPS download from the official release (logged for manual verification).
    const sha = createHash('sha256').update(readFileSync(dest)).digest('hex');
    const expected = config.cloudflaredExpectedHashes;
    if (expected.length > 0 && !expected.includes(sha)) {
      try { unlinkSync(dest); } catch { /* ignore */ }
      return { success: false, message: `Refusing to install cloudflared: sha256 ${sha} not in the pinned allowlist (CLOUDFLARED_EXPECTED_SHA256).` };
    }

    if (process.platform !== 'win32') chmodSync(dest, 0o755);
    if (expected.length === 0) {
      console.warn(`[cloudflare] Installed cloudflared UNVERIFIED (sha256: ${sha}). Pin it via CLOUDFLARED_EXPECTED_SHA256 to enforce integrity.`);
    } else {
      console.log(`[cloudflare] Installed cloudflared (sha256 ${sha}, matches pin)`);
    }
    return { success: true, path: dest, message: `Installed cloudflared (sha256 ${sha})` };
  } catch (err) {
    return { success: false, message: `Install failed: ${(err as Error).message}` };
  }
}

// Reuse the operator's optional supply-chain pin (config.cloudflaredExpectedHashes).
function verifyBinaryHash(binaryPath: string): string | null {
  const expected = config.cloudflaredExpectedHashes;
  if (binaryPath === 'cloudflared') return null; // PATH lookup, not a real file
  if (expected.length === 0) return null;
  if (!existsSync(binaryPath)) return `cloudflared not found at ${binaryPath}`;
  const actual = createHash('sha256').update(readFileSync(binaryPath)).digest('hex');
  if (!expected.includes(actual)) {
    return `cloudflared hash mismatch: ${actual} not in pinned allowlist`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Process / state tracking
// ---------------------------------------------------------------------------

function writePid(pid: number): void {
  try {
    mkdirSync(join(os.homedir(), '.projectx'), { recursive: true });
    writeFileSync(PID_FILE, String(pid), 'utf-8');
  } catch { /* non-fatal */ }
}

function readPid(): number | null {
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function saveState(state: TunnelState | null): void {
  try {
    if (state === null) { if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE); return; }
    mkdirSync(join(os.homedir(), '.projectx'), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state), { mode: 0o600 });
  } catch { /* non-fatal */ }
}

function loadState(): TunnelState | null {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as TunnelState;
  } catch {
    return null;
  }
}

/** Kill a managed cloudflared left running by a previous (crashed) server. */
export function killOrphanCloudflare(): void {
  const pid = readPid();
  if (pid === null) return;
  try {
    process.kill(pid, 0);
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore', timeout: 5000 });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    console.log(`[cloudflare] Killed orphan cloudflared (pid=${pid})`);
  } catch { /* stale pid or no permission */ }
  try { unlinkSync(PID_FILE); } catch { /* ignore */ }
}

function isAlive(): boolean {
  const pid = readPid();
  if (pid === null) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function getCloudflareStatus(): {
  installed: boolean;
  running: boolean;
  mode: TunnelMode | null;
  url: string | null;
  hostname: string | null;
} {
  const running = isAlive();
  const state = current ?? loadState();
  return {
    installed: resolveCloudflared() !== null,
    running,
    mode: state?.mode ?? null,
    url: running ? (state?.url ?? null) : null,
    hostname: state?.hostname ?? null,
  };
}

function localTargetUrl(): string {
  const host = config.host === '0.0.0.0' ? '127.0.0.1' : config.host;
  return `http://${host}:${config.port}`;
}

function spawnTunnel(bin: string, args: string[]): ChildProcess {
  const child = spawn(bin, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  tunnelProcess = child;
  if (child.pid) writePid(child.pid);
  child.unref();
  return child;
}

// ---------------------------------------------------------------------------
// Quick tunnel
// ---------------------------------------------------------------------------

export async function startQuickTunnel(): Promise<ActionResult> {
  if (isAlive()) return { success: false, message: 'A tunnel is already running. Stop it first.' };

  const ensured = await ensureCloudflared();
  if (!ensured.success || !ensured.path) return { success: false, message: ensured.message };
  const bin = ensured.path;
  const hashErr = verifyBinaryHash(bin);
  if (hashErr) return { success: false, message: hashErr };

  const target = localTargetUrl();
  return new Promise<ActionResult>(resolve => {
    let settled = false;
    const child = spawnTunnel(bin, ['tunnel', '--no-autoupdate', '--url', target]);

    const onData = (chunk: Buffer) => {
      const url = parseQuickTunnelUrl(chunk.toString());
      if (url && !settled) {
        settled = true;
        current = { mode: 'quick', url };
        saveState(current);
        console.log(`[cloudflare] Quick tunnel up: ${url} -> ${target}`);
        resolve({ success: true, message: 'Quick tunnel started', url, mode: 'quick' });
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', err => {
      if (!settled) { settled = true; resolve({ success: false, message: `Failed to start cloudflared: ${err.message}` }); }
    });

    // cloudflared prints the URL within a few seconds; bail out if it doesn't.
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ success: false, message: 'Timed out waiting for the trycloudflare URL (is cloudflared able to reach the internet?)' });
      }
    }, 30000);
  });
}

// ---------------------------------------------------------------------------
// Named tunnel (Cloudflare API)
// ---------------------------------------------------------------------------

interface NamedTunnelParams {
  apiToken: string;
  accountId: string;
  zoneId: string;
  hostname: string;
  name?: string;
}

async function cfApi(token: string, method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${CF_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json && json.success === false)) {
    const errs = json?.errors?.map((e: any) => `${e.code} ${e.message}`).join('; ') || `HTTP ${res.status}`;
    throw new Error(errs);
  }
  return json;
}

/** Create (or reuse) a named tunnel, point a hostname at it, and run it. */
export async function startNamedTunnel(params: NamedTunnelParams): Promise<ActionResult> {
  if (isAlive()) return { success: false, message: 'A tunnel is already running. Stop it first.' };

  const ensured = await ensureCloudflared();
  if (!ensured.success || !ensured.path) return { success: false, message: ensured.message };
  const bin = ensured.path;
  const hashErr = verifyBinaryHash(bin);
  if (hashErr) return { success: false, message: hashErr };

  const { apiToken, accountId, zoneId, hostname } = params;
  const name = params.name || `projectx-${hostname.replace(/[^a-z0-9]+/gi, '-')}`;
  const target = localTargetUrl();

  // Track resources we create so we can roll them back if a later step fails
  // (a common case: an API token scoped for Tunnel but not DNS edit).
  let createdTunnelId: string | null = null;
  let createdDnsId: string | null = null;

  try {
    // 1. Create the tunnel (cloudflare-managed config so we can set ingress via API).
    const created = await cfApi(apiToken, 'POST', `/accounts/${accountId}/cfd_tunnel`, {
      name,
      config_src: 'cloudflare',
    });
    const tunnelId: string = created.result.id;
    createdTunnelId = tunnelId;

    // 2. Fetch the connector token used by `cloudflared tunnel run --token`.
    const tokenResp = await cfApi(apiToken, 'GET', `/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`);
    const connectorToken: string = tokenResp.result;

    // 3. Push the ingress rule: hostname -> local server, everything else 404.
    await cfApi(apiToken, 'PUT', `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
      config: {
        ingress: [
          { hostname, service: target },
          { service: 'http_status:404' },
        ],
      },
    });

    // 4. DNS CNAME hostname -> <tunnelId>.cfargotunnel.com (proxied). Update if it exists.
    const cname = `${tunnelId}.cfargotunnel.com`;
    const existing = await cfApi(apiToken, 'GET', `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`);
    if (existing.result && existing.result.length > 0) {
      await cfApi(apiToken, 'PUT', `/zones/${zoneId}/dns_records/${existing.result[0].id}`, {
        type: 'CNAME', name: hostname, content: cname, proxied: true,
      });
    } else {
      const dns = await cfApi(apiToken, 'POST', `/zones/${zoneId}/dns_records`, {
        type: 'CNAME', name: hostname, content: cname, proxied: true,
      });
      createdDnsId = dns?.result?.id ?? null;
    }

    // 5. Run the connector.
    const child = spawnTunnel(bin, ['tunnel', '--no-autoupdate', 'run', '--token', connectorToken]);
    const url = `https://${hostname}`;
    current = { mode: 'named', url, hostname, tunnelId, token: connectorToken };
    saveState(current);
    return new Promise<ActionResult>(resolve => {
      let settled = false;
      const done = (r: ActionResult) => { if (!settled) { settled = true; resolve(r); } };
      child.on('error', err => done({ success: false, message: `cloudflared failed to start: ${err.message}` }));
      // The connector takes a moment to register; assume success if it stays up briefly.
      setTimeout(() => done({ success: true, message: 'Named tunnel started', url, mode: 'named' }), 4000);
    });
  } catch (err) {
    // Roll back partially-created resources so we don't orphan a tunnel / DNS
    // record on the user's Cloudflare account.
    if (createdDnsId) {
      try { await cfApi(apiToken, 'DELETE', `/zones/${zoneId}/dns_records/${createdDnsId}`); } catch { /* best effort */ }
    }
    if (createdTunnelId) {
      try { await cfApi(apiToken, 'DELETE', `/accounts/${accountId}/cfd_tunnel/${createdTunnelId}`); } catch { /* best effort */ }
    }
    return { success: false, message: `Cloudflare API error: ${(err as Error).message}` };
  }
}

/** Resume a named tunnel from saved state after a server restart. */
export async function resumeTunnel(): Promise<void> {
  if (isAlive()) return;
  const state = loadState();
  if (!state || state.mode !== 'named' || !state.token) {
    if (state) saveState(null); // quick tunnels can't be resumed
    return;
  }
  const bin = resolveCloudflared();
  if (!bin) return;
  if (verifyBinaryHash(bin)) return;
  const child = spawnTunnel(bin, ['tunnel', '--no-autoupdate', 'run', '--token', state.token]);
  current = state;
  child.on('error', () => { /* leave state; status will report not-running */ });
  console.log(`[cloudflare] Resumed named tunnel for ${state.hostname}`);
}

export function stopCloudflareTunnel(): ActionResult {
  const pid = readPid();
  if (!isAlive()) {
    saveState(null);
    current = null;
    return { success: true, message: 'No managed tunnel running' };
  }
  try {
    if (pid !== null) {
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore', timeout: 5000 });
      } else {
        try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ }
      }
    }
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
    saveState(null);
    current = null;
    tunnelProcess = null;
    return { success: true, message: 'Tunnel stopped' };
  } catch (err) {
    return { success: false, message: `Failed to stop tunnel: ${(err as Error).message}` };
  }
}
