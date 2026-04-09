import { execSync, spawn, ChildProcess } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

interface TunnelStatus {
  configured: boolean;
  running: boolean;
  domain: string | null;
  tunnelId: string | null;
}

const CONFIG_PATH = join(os.homedir(), '.cloudflared', 'config.yml');

// Resolve cloudflared binary path
function getCloudflaredPath(): string {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || join(os.homedir(), 'AppData', 'Local');
    return join(localAppData, 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe');
  }
  return 'cloudflared';
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
  try {
    tunnelProcess = spawn(cloudflared, ['tunnel', '--config', CONFIG_PATH, 'run', tunnelId], {
      detached: true,
      stdio: 'ignore',
    });
    tunnelProcess.unref();
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
    if (process.platform === 'win32') {
      execSync('taskkill /IM cloudflared.exe /F', { timeout: 5000 });
    } else {
      execSync('pkill cloudflared', { timeout: 5000 });
    }
    tunnelProcess = null;
    return { success: true, message: 'Tunnel stopped' };
  } catch (err: any) {
    return { success: false, message: `Failed to stop tunnel: ${err.message}` };
  }
}
