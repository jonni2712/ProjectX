import { resolve } from 'path';
import { existsSync } from 'fs';

// Parse PUBLIC_ORIGIN(S): comma-separated list of tunnel/public origins allowed by CORS.
// Example: PUBLIC_ORIGINS=https://myapp.trycloudflare.com,https://projectx.mydomain.com
function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  // Default to loopback only. Users who want LAN/tunnel exposure must opt in
  // by setting HOST=0.0.0.0 explicitly in .env.
  host: process.env.HOST || '127.0.0.1',
  workspaceRoot: resolve(process.env.WORKSPACE_ROOT || '/github'),
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  },
  auth: {
    username: process.env.AUTH_USERNAME || 'admin',
    passwordHash: process.env.AUTH_PASSWORD_HASH || '',
  },
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  rateLimit: {
    loginMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '5', 10),
    loginWindow: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW || '300000', 10),
  },
  watcherDebounce: parseInt(process.env.WATCHER_DEBOUNCE || '500', 10),
  // CORS: list of extra origins allowed in addition to localhost/127.0.0.1.
  // Set this to your Cloudflare tunnel domain (or custom domain) in .env.
  publicOrigins: parseOrigins(process.env.PUBLIC_ORIGINS),
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
