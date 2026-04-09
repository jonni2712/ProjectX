const API_BASE = 'http://localhost:3000';

let token: string | null = null;

async function request(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
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
  async health() { return request('/health'); },

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
  async tunnelStart() { return request('/tunnel/start', { method: 'POST' }); },
  async tunnelStop() { return request('/tunnel/stop', { method: 'POST' }); },

  // Config
  async updateConfig(config: { workspaceRoot?: string; port?: number; host?: string }) {
    return request('/config/update', { method: 'POST', body: JSON.stringify(config) });
  },
};
