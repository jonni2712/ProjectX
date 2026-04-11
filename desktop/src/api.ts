const API_BASE = 'http://localhost:3000';

let token: string | null = null;

// Callback registered by AuthContext to force a logout when the server tells
// us our session was revoked (HTTP 401 on a previously-valid token).
let onUnauthenticated: (() => void) | null = null;
export function setOnUnauthenticated(cb: (() => void) | null) {
  onUnauthenticated = cb;
}

async function request(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // 401 on an authenticated request = stale/revoked token. Force the UI
  // back to the login screen so the user can re-auth.
  if (res.status === 401 && token) {
    token = null;
    if (onUnauthenticated) onUnauthenticated();
    let errMsg = 'Session expired';
    try {
      const data = await res.json();
      errMsg = data.error || errMsg;
    } catch { /* not JSON */ }
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
    token = data.token;
    return data;
  },

  async getMe() {
    return request('/auth/me');
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
    token = null;
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
};
