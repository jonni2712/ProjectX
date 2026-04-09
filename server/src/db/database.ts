import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { v4 as uuid } from 'uuid';
import { config } from '../config.js';

// Ensure data directory exists
const dataDir = resolve(import.meta.dirname || '.', '../../data');
mkdirSync(dataDir, { recursive: true });

const dbPath = resolve(dataDir, 'projectx.db');
export const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS locks (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'file',
    acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recent_projects (
    path TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    last_opened TEXT NOT NULL DEFAULT (datetime('now')),
    pinned INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    details TEXT
  );

  CREATE TABLE IF NOT EXISTS terminal_sessions (
    id TEXT PRIMARY KEY,
    pid INTEGER NOT NULL,
    cwd TEXT NOT NULL,
    cols INTEGER NOT NULL DEFAULT 80,
    rows INTEGER NOT NULL DEFAULT 24,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS claude_sessions (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    cwd TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login TEXT,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_locks_path ON locks(path);
  CREATE INDEX IF NOT EXISTS idx_locks_expires ON locks(expires_at);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
  CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
`);

// --- Helper functions ---

export function audit(userId: string, action: string, target?: string, details?: string): void {
  db.prepare(
    'INSERT INTO audit_log (user_id, action, target, details) VALUES (?, ?, ?, ?)'
  ).run(userId, action, target || null, details || null);
}

export function cleanExpiredLocks(): void {
  db.prepare("DELETE FROM locks WHERE expires_at <= datetime('now')").run();
}

export function cleanExpiredRefreshTokens(): void {
  db.prepare("DELETE FROM refresh_tokens WHERE expires_at <= datetime('now')").run();
}

// --- User helper functions ---

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  created_at: string;
  last_login: string | null;
  active: number;
}

export function getUserByUsername(username: string): UserRow | null {
  return (db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow) || null;
}

export function getUserById(id: string): UserRow | null {
  return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow) || null;
}

export function createUser(id: string, username: string, passwordHash: string, role: string): void {
  db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(id, username, passwordHash, role);
}

export function updateUser(id: string, fields: Partial<{ username: string; password_hash: string; role: string; last_login: string; active: number }>): void {
  const ALLOWED_COLUMNS = new Set(['username', 'password_hash', 'role', 'last_login', 'active']);
  const keys = (Object.keys(fields) as (keyof typeof fields)[]).filter(k => ALLOWED_COLUMNS.has(k));
  if (keys.length === 0) return;
  const setClauses = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => fields[k]);
  db.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...values, id);
}

export function listUsers(): UserRow[] {
  return db.prepare('SELECT * FROM users').all() as UserRow[];
}

export function deleteUser(id: string): void {
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
}

export function migrateEnvUser(): void {
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  if (count > 0) return;

  if (config.auth.username && config.auth.passwordHash) {
    const id = uuid();
    createUser(id, config.auth.username, config.auth.passwordHash, 'admin');
    console.log(`[db] Migrated env user "${config.auth.username}" as admin (id=${id})`);
  }
}

// Run migration on module load
migrateEnvUser();
