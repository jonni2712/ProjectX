// WebSocket message protocol
export interface WsMessage {
  channel: string;   // e.g. "terminal:abc123", "claude:session1", "files"
  type: string;      // e.g. "input", "output", "stream", "done", "error", "changed"
  data?: any;
  meta?: Record<string, any>;
}

// File system types
export interface FileEntry {
  name: string;
  path: string;       // Relative to workspace root
  type: 'file' | 'directory';
  size?: number;
  modified?: string;   // ISO date
  locked?: boolean;
  lockedBy?: string;
}

// Lock types
export interface FileLock {
  id: string;
  path: string;         // File or project path
  userId: string;
  type: 'file' | 'project';
  acquiredAt: string;
  expiresAt: string;
}

// Terminal session
export interface TerminalSession {
  id: string;
  pid: number;
  cwd: string;
  createdAt: string;
  lastActivity: string;
  cols: number;
  rows: number;
}

// Claude session
export interface ClaudeSession {
  id: string;
  mode: 'cli' | 'api';
  cwd: string;
  createdAt: string;
  lastActivity: string;
}

// Git types
export interface GitStatus {
  current: string | null;
  tracking: string | null;
  files: GitFileStatus[];
  ahead: number;
  behind: number;
}

export interface GitFileStatus {
  path: string;
  index: string;    // Status in index
  working_dir: string; // Status in working dir
}

export interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
  author_name: string;
  author_email: string;
}

// Auth types
export interface JwtPayload {
  userId: string;
  username: string;
  role: 'admin' | 'user';
  tv: number;  // token_version — incremented on logout/deactivation to invalidate live JWTs
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: string;
  lastLogin: string | null;
  active: boolean;
}

// Audit log
export interface AuditEntry {
  id?: number;
  timestamp: string;
  userId: string;
  action: string;
  target: string;
  details?: string;
}

// API response wrappers
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
