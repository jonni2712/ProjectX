import { db, cleanExpiredLocks } from '../db/database.js';
import { v4 as uuid } from 'uuid';
import { safePath, relativePath } from '../utils/path-guard.js';
import type { FileLock } from '../utils/types.js';

const DEFAULT_LOCK_TTL_MINUTES = 30;

export class LockService {
  constructor() {
    // Clean expired locks every 60s
    setInterval(() => cleanExpiredLocks(), 60000);
    cleanExpiredLocks(); // Clean on startup
  }

  /**
   * Canonical lock key: the workspace-relative path of the safe-resolved path.
   * Without this, the same file referenced as "/a/b", "a/b", "/a/b/" or
   * "//a/b" would create DISTINCT lock rows, so a lock taken under one alias is
   * invisible when checked under another — silently defeating locking.
   */
  private key(path: string): string {
    return relativePath(safePath(path));
  }

  acquireFileLock(path: string, userId: string, ttlMinutes: number = DEFAULT_LOCK_TTL_MINUTES): FileLock | null {
    cleanExpiredLocks();
    const key = this.key(path);

    const existing = db.prepare(
      "SELECT * FROM locks WHERE path = ? AND expires_at > datetime('now')"
    ).get(key) as any;

    if (existing) {
      if (existing.user_id === userId) {
        const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
        db.prepare('UPDATE locks SET expires_at = ? WHERE id = ?').run(expiresAt, existing.id);
        return { ...this.rowToLock(existing), expiresAt };
      }
      return null; // Locked by another user
    }

    const lock: FileLock = {
      id: uuid(),
      path: key,
      userId,
      type: 'file',
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
    };

    db.prepare(
      'INSERT INTO locks (id, path, user_id, type, acquired_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(lock.id, lock.path, lock.userId, lock.type, lock.acquiredAt, lock.expiresAt);

    return lock;
  }

  acquireProjectLock(projectPath: string, userId: string, ttlMinutes: number = 60): FileLock | null {
    cleanExpiredLocks();
    const key = this.key(projectPath);

    const existing = db.prepare(
      "SELECT * FROM locks WHERE path = ? AND type = 'project' AND expires_at > datetime('now')"
    ).get(key) as any;

    if (existing) {
      if (existing.user_id === userId) {
        const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
        db.prepare('UPDATE locks SET expires_at = ? WHERE id = ?').run(expiresAt, existing.id);
        return { ...this.rowToLock(existing), expiresAt };
      }
      return null;
    }

    const lock: FileLock = {
      id: uuid(),
      path: key,
      userId,
      type: 'project',
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
    };

    db.prepare(
      'INSERT INTO locks (id, path, user_id, type, acquired_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(lock.id, lock.path, lock.userId, lock.type, lock.acquiredAt, lock.expiresAt);

    return lock;
  }

  releaseLock(path: string, userId: string): boolean {
    const result = db.prepare('DELETE FROM locks WHERE path = ? AND user_id = ?').run(this.key(path), userId);
    return result.changes > 0;
  }

  releaseAllUserLocks(userId: string): number {
    const result = db.prepare('DELETE FROM locks WHERE user_id = ?').run(userId);
    return result.changes;
  }

  /** Move a lock from one path to another (used on rename/move so the lock follows the file). */
  relocateLock(fromPath: string, toPath: string): void {
    const from = this.key(fromPath);
    const to = this.key(toPath);
    db.prepare('UPDATE locks SET path = ? WHERE path = ?').run(to, from);
  }

  getLock(path: string): FileLock | null {
    cleanExpiredLocks();
    const row = db.prepare(
      "SELECT * FROM locks WHERE path = ? AND expires_at > datetime('now')"
    ).get(this.key(path)) as any;
    return row ? this.rowToLock(row) : null;
  }

  getLocksForProject(projectPath: string): FileLock[] {
    cleanExpiredLocks();
    const key = this.key(projectPath);
    // Escape LIKE wildcards in the prefix so a path containing % or _ can't
    // match unrelated locks.
    const prefix = key.replace(/([%_\\])/g, '\\$1');
    const rows = db.prepare(
      "SELECT * FROM locks WHERE (path = ? OR path LIKE ? || '/%' ESCAPE '\\') AND expires_at > datetime('now')"
    ).all(key, prefix) as any[];
    return rows.map(r => this.rowToLock(r));
  }

  isLocked(path: string, excludeUserId?: string): boolean {
    cleanExpiredLocks();
    const key = this.key(path);
    if (excludeUserId) {
      const row = db.prepare(
        "SELECT 1 FROM locks WHERE path = ? AND user_id != ? AND expires_at > datetime('now')"
      ).get(key, excludeUserId);
      return !!row;
    }
    const row = db.prepare(
      "SELECT 1 FROM locks WHERE path = ? AND expires_at > datetime('now')"
    ).get(key);
    return !!row;
  }

  refreshLock(path: string, userId: string, ttlMinutes: number = DEFAULT_LOCK_TTL_MINUTES): boolean {
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
    const result = db.prepare(
      'UPDATE locks SET expires_at = ? WHERE path = ? AND user_id = ?'
    ).run(expiresAt, this.key(path), userId);
    return result.changes > 0;
  }

  private rowToLock(row: any): FileLock {
    return {
      id: row.id,
      path: row.path,
      userId: row.user_id,
      type: row.type,
      acquiredAt: row.acquired_at,
      expiresAt: row.expires_at,
    };
  }
}

export const lockService = new LockService();
