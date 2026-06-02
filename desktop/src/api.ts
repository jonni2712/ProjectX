const API_BASE = 'http://localhost:3000';

// Persisted so a window reload (or quitting/reopening the app) doesn't force a
// fresh login. localStorage is per-origin and survives reloads in Electron.
const TOKEN_KEY = 'projectx.token';
const REFRESH_KEY = 'projectx.refreshToken';

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* storage unavailable — fall back to in-memory only */ }
}

let token: string | null = readStorage(TOKEN_KEY);
let refreshToken: string | null = readStorage(REFRESH_KEY);

function setTokens(t: string | null, r: string | null) {
  token = t;
  refreshToken = r;
  writeStorage(TOKEN_KEY, t);
  writeStorage(REFRESH_KEY, r);
}

// Callback registered by AuthContext to force a logout when the server tells
// us our session is truly gone (a 401 that even a token refresh can't fix).
let onUnauthenticated: (() => void) | null = null;
export function setOnUnauthenticated(cb: (() => void) | null) {
  onUnauthenticated = cb;
}

// A single shared refresh promise so a burst of concurrent 401s triggers exactly
// one /auth/refresh round-trip instead of a stampede that would race-rotate the
// refresh token and invalidate itself.
let refreshInFlight: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.success || !data.data?.token) return false;
      // Server rotates the refresh token on every use; keep the new one.
      setTokens(data.data.token, data.data.refreshToken ?? refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function endSession() {
  setTokens(null, null);
  if (onUnauthenticated) onUnauthenticated();
}

async function request(path: string, options: RequestInit = {}, retried = false): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // 401 on an authenticated request usually just means the short-lived JWT
  // expired. Try a single silent refresh + retry before bouncing to login.
  if (res.status === 401 && token) {
    if (!retried) {
      const refreshed = await doRefresh();
      if (refreshed) return request(path, options, true);
    }
    // Refresh unavailable or the retried call still 401s (revoked, deactivated,
    // password changed) — the session is genuinely dead.
    endSession();
    let errMsg = 'Session expired';
    try { const data = await res.json(); errMsg = data.error || errMsg; } catch { /* not JSON */ }
    throw new Error(errMsg);
  }

  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data.data;
}

export const api = {
  // Auth
  async login(username: string, password: string) {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setTokens(data.token, data.refreshToken ?? null);
    return data;
  },

  async getMe() {
    return request('/auth/me');
  },

  /**
   * Re-establish a session from persisted tokens on app start / reload. Tries a
   * proactive refresh when only the (longer-lived) refresh token survived, then
   * validates by fetching the current user. Returns the user or null.
   */
  async restoreSession(): Promise<{ id: string; username: string; role: string } | null> {
    if (!token && refreshToken) {
      await doRefresh(); // JWT may have expired while the app was closed
    }
    if (!token) return null;
    try {
      const me = await request('/auth/me'); // auto-refreshes on a 401
      return { id: me.id, username: me.username, role: me.role };
    } catch {
      return null;
    }
  },

  /**
   * Best-effort logout: tells the server to bump our token_version so the
   * current JWT and any refresh tokens are immediately invalidated. We swallow
   * errors because the local logout must succeed even if the server is down.
   */
  async logout() {
    try {
      await request('/auth/logout', { method: 'POST', body: '{}' });
    } catch { /* server unreachable — local logout still proceeds */ }
    setTokens(null, null);
  },

  isAuthenticated() { return !!token; },

  // Users
  async listUsers() { return request('/auth/users'); },
  async createUser(username: string, password: string, role: string) {
    return request('/auth/users', {
      method: 'POST', body: JSON.stringify({ username, password, role })
    });
  },
  async updateUser(id: string, fields: { role?: string; active?: boolean }) {
    return request(`/auth/users/${id}`, {
      method: 'PATCH', body: JSON.stringify(fields)
    });
  },
  async deleteUser(id: string) {
    return request(`/auth/users/${id}`, { method: 'DELETE' });
  },

  // Health
  async health() { return request('/health/full'); },

  async ping() {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    return data.data;
  },

  // Files
  async listFiles(path: string = '/') {
    return request(`/files/list?path=${encodeURIComponent(path)}`);
  },

  // Git
  async scanRepos() { return request('/git/scan-repos?path=/&depth=3'); },

  // Audit
  async getAuditLog(limit: number = 50) {
    return request(`/projects/audit?limit=${limit}`);
  },

  // Tunnel
  async tunnelStatus() { return request('/tunnel/status'); },
  async tunnelStart() { return request('/tunnel/start', { method: 'POST', body: '{}' }); },
  async tunnelStop() { return request('/tunnel/stop', { method: 'POST', body: '{}' }); },

  // Config
  async updateConfig(config: { workspaceRoot?: string; port?: number; host?: string }) {
    return request('/config/update', { method: 'POST', body: JSON.stringify(config) });
  },

  // First-run setup (only meaningful while the server is unconfigured)
  async setupStatus(): Promise<{ configured: boolean }> {
    const res = await fetch(`${API_BASE}/setup/status`);
    const data = await res.json();
    return data.data;
  },
  async submitSetup(body: {
    workspaceRoot: string;
    adminUsername: string;
    adminPassword: string;
    publicOrigins?: string;
    anthropicApiKey?: string;
  }) {
    const res = await fetch(`${API_BASE}/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Setup failed');
    return data;
  },

  // Automated Cloudflare tunnels (admin-only)
  async cloudflareStatus() { return request('/cloudflare/status'); },
  async cloudflareQuickStart() { return request('/cloudflare/quick-start', { method: 'POST', body: '{}' }); },
  async cloudflareNamedStart(body: { apiToken: string; accountId: string; zoneId: string; hostname: string; name?: string }) {
    return request('/cloudflare/named-start', { method: 'POST', body: JSON.stringify(body) });
  },
  async cloudflareStop() { return request('/cloudflare/stop', { method: 'POST', body: '{}' }); },
};
