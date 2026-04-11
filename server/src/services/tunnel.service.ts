import { execSync, spawn, ChildProcess } from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import os from 'os';
import { config } from '../config.js';

interface TunnelStatus {
  configured: boolean;
  running: boolean;
  domain: string | null;
  tunnelId: string | null;
}

const CONFIG_PATH = join(os.homedir(), '.cloudflared', 'config.yml');
// We track the PID of the tunnel we spawned so that on server restart we can
// clean up orphans left behind by a previous crash. Without this a crashed
// server leaves cloudflared running, keeping the public hostname alive and
// pointing at a dead/new process.
const PID_DIR = join(os.homedir(), '.projectx');
const PID_FILE = join(PID_DIR, 'tunnel.pid');

function writeTunnelPid(pid: number): void {
  try {
    mkdirSync(PID_DIR, { recursive: true });
    writeFileSync(PID_FILE, String(pid), 'utf-8');
  } catch {
    // Non-fatal: we just won't be able to auto-clean on next restart.
  }
}

function readTunnelPid(): number | null {
  try {
    const raw = readFileSync(PID_FILE, 'utf-8').trim();
    const pid = parseInt(raw, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function clearTunnelPid(): void {
  try { unlinkSync(PID_FILE); } catch { /* not there */ }
}

/**
 * Kill any cloudflared process left behind by a previous run of this server.
 * Called once at startup from index.ts.
 */
export function killOrphanTunnel(): void {
  const pid = readTunnelPid();
  if (pid === null) return;
  try {
    // Verify it's still alive — process.kill with signal 0 just checks existence.
    process.kill(pid, 0);
    // If we get here the PID is alive. Kill it.
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore', timeout: 5000 });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    console.log(`[tunnel] Killed orphan cloudflared process (pid=${pid})`);
  } catch {
    // Either the pid is stale (not running) or we don't have permission — either
    // way we just clear the pidfile and move on.
  }
  clearTunnelPid();
}

// Resolve cloudflared binary path
function getCloudflaredPath(): string {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || join(os.homedir(), 'AppData', 'Local');
    return join(localAppData, 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe');
  }
  return 'cloudflared';
}

// Cache the computed hash per-path so we don't rehash the binary on every
// tunnel start. If the user upgrades cloudflared, restarting the server picks
// up the new hash.
const hashCache = new Map<string, string>();

/**
 * Compute the SHA256 of the cloudflared binary at the given path.
 * Returns null if the binary isn't a real file (e.g. just "cloudflared" on
 * Linux where we rely on PATH resolution by the kernel).
 */
function computeCloudflaredHash(binaryPath: string): string | null {
  // Only hash when we have an absolute path to a real file. The Linux fallback
  // of "cloudflared" is a PATH lookup at spawn time, not a real file path.
  if (!binaryPath.includes('/') && !binaryPath.includes('\\')) return null;
  if (!existsSync(binaryPath)) return null;

  const cached = hashCache.get(binaryPath);
  if (cached) return cached;

  try {
    const buf = readFileSync(binaryPath);
    const hash = createHash('sha256').update(buf).digest('hex');
    hashCache.set(binaryPath, hash);
    return hash;
  } catch {
    return null;
  }
}

/**
 * Verify the cloudflared binary against the user-configured hash allowlist.
 * Returns null on success (or when verification is disabled), or an error
 * message describing the mismatch.
 */
function verifyCloudflaredHash(binaryPath: string): string | null {
  const expected = config.cloudflaredExpectedHashes;

  const actual = computeCloudflaredHash(binaryPath);

  // Always log the detected hash for observability so users can compare it
  // against Cloudflare's published checksums without enabling enforcement.
  if (actual) {
    console.log(`[tunnel] cloudflared SHA256: ${actual}`);
  }

  // No allowlist configured = observability only, no enforcement.
  if (expected.length === 0) return null;

  if (!actual) {
    return `cloudflared binary not found or not readable at ${binaryPath} — cannot verify hash`;
  }

  if (!expected.includes(actual)) {
    return `cloudflared binary hash mismatch: detected ${actual}, ` +
      `expected one of [${expected.join(', ')}]. ` +
      `Refusing to start tunnel. Update CLOUDFLARED_EXPECTED_SHA256 in .env ` +
      `after verifying the new hash against Cloudflare's release page.`;
  }

  return null;
}

function readTunnelConfig(): { tunnelId: string | null; domain: string | null } {
  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    const tunnelMatch = content.match(/^tunnel:\s*(.+)$/m);
    const hostnameMatch = content.match(/hostname:\s*(.+)$/m);
    return {
      tunnelId: tunnelMatch ? tunnelMatch[1].trim() : null,
      domain: hostnameMatch ? hostnameMatch[1].trim() : null,
    };
  } catch {
    return { tunnelId: null, domain: null };
  }
}

function isCloudflaredRunning(): boolean {
  try {
    if (process.platform === 'win32') {
      const output = execSync('tasklist /FI "IMAGENAME eq cloudflared.exe" /NH', {
        encoding: 'utf-8',
        timeout: 5000,
      });
      return output.toLowerCase().includes('cloudflared.exe');
    } else {
      execSync('pgrep cloudflared', { timeout: 5000 });
      return true;
    }
  } catch {
    return false;
  }
}

export function getTunnelStatus(): TunnelStatus {
  const { tunnelId, domain } = readTunnelConfig();
  const configured = tunnelId !== null && domain !== null;
  const running = isCloudflaredRunning();
  return { configured, running, domain, tunnelId };
}

let tunnelProcess: ChildProcess | null = null;

export function startTunnel(): { success: boolean; message: string } {
  if (isCloudflaredRunning()) {
    return { success: true, message: 'Tunnel is already running' };
  }

  const { tunnelId } = readTunnelConfig();
  if (!tunnelId) {
    return { success: false, message: 'No tunnel configured in cloudflared config' };
  }

  const cloudflared = getCloudflaredPath();

  // Supply-chain hardening: if the user has pinned an expected hash list,
  // refuse to spawn a cloudflared that doesn't match. No-op when empty.
  const hashError = verifyCloudflaredHash(cloudflared);
  if (hashError) {
    return { success: false, message: hashError };
  }

  try {
    tunnelProcess = spawn(cloudflared, ['tunnel', '--config', CONFIG_PATH, 'run', tunnelId], {
      detached: true,
      stdio: 'ignore',
    });
    tunnelProcess.unref();
    if (tunnelProcess.pid) {
      writeTunnelPid(tunnelProcess.pid);
    }
    return { success: true, message: 'Tunnel started' };
  } catch (err: any) {
    return { success: false, message: `Failed to start tunnel: ${err.message}` };
  }
}

export function stopTunnel(): { success: boolean; message: string } {
  if (!isCloudflaredRunning()) {
    return { success: true, message: 'Tunnel is not running' };
  }

  try {
    // Prefer killing the exact PID we tracked (doesn't nuke other cloudflared
    // instances the user may be running for other purposes). Fall back to the
    // broad killswitch only if we have no tracked PID.
    const trackedPid = readTunnelPid();
    if (trackedPid !== null) {
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${trackedPid} /F`, { stdio: 'ignore', timeout: 5000 });
      } else {
        try { process.kill(trackedPid, 'SIGTERM'); } catch { /* already gone */ }
      }
    } else {
      if (process.platform === 'win32') {
        execSync('taskkill /IM cloudflared.exe /F', { timeout: 5000 });
      } else {
        execSync('pkill cloudflared', { timeout: 5000 });
      }
    }
    clearTunnelPid();
    tunnelProcess = null;
    return { success: true, message: 'Tunnel stopped' };
  } catch (err: any) {
    return { success: false, message: `Failed to stop tunnel: ${err.message}` };
  }
}
