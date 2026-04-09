import { db, cleanExpiredLocks } from '../db/database.js';
import { v4 as uuid } from 'uuid';
import type { FileLock } from '../utils/types.js';

const DEFAULT_LOCK_TTL_MINUTES = 30;

export class LockService {
  constructor() {
    // Clean expired locks every 60s
    setInterval(() => cleanExpiredLocks(), 60000);
    cleanExpiredLocks(); // Clean on startup
  }

  acquireFileLock(path: string, userId: string, ttlMinutes: number = DEFAULT_LOCK_TTL_MINUTES): FileLock | null {
    cleanExpiredLocks();

    // Check for existing lock
    const existing = db.prepare(
      "SELECT * FROM locks WHERE path = ? AND expires_at > datetime('now')"
    ).get(path) as any;

    if (existing) {
      if (existing.user_id === userId) {
        // Extend lock
        const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
        db.prepare('UPDATE locks SET expires_at = ? WHERE id = ?').run(expiresAt, existing.id);
        return { ...this.rowToLock(existing), expiresAt };
      }
      return null; // Locked by another user
    }

    const lock: FileLock = {
      id: uuid(),
      path,
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

    const existing = db.prepare(
      "SELECT * FROM locks WHERE path = ? AND type = 'project' AND expires_at > datetime('now')"
    ).get(projectPath) as any;

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
      path: projectPath,
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
    const result = db.prepare('DELETE FROM locks WHERE path = ? AND user_id = ?').run(path, userId);
    return result.changes > 0;
  }

  releaseAllUserLocks(userId: string): number {
    const result = db.prepare('DELETE FROM locks WHERE user_id = ?').run(userId);
    return result.changes;
  }

  getLock(path: string): FileLock | null {
    cleanExpiredLocks();
    const row = db.prepare(
      "SELECT * FROM locks WHERE path = ? AND expires_at > datetime('now')"
    ).get(path) as any;
    return row ? this.rowToLock(row) : null;
  }

  getLocksForProject(projectPath: string): FileLock[] {
    cleanExpiredLocks();
    const rows = db.prepare(
      "SELECT * FROM locks WHERE (path = ? OR path LIKE ? || '/%') AND expires_at > datetime('now')"
    ).all(projectPath, projectPath) as any[];
    return rows.map(r => this.rowToLock(r));
  }

  isLocked(path: string, excludeUserId?: string): boolean {
    cleanExpiredLocks();
    if (excludeUserId) {
      const row = db.prepare(
        "SELECT 1 FROM locks WHERE path = ? AND user_id != ? AND expires_at > datetime('now')"
      ).get(path, excludeUserId);
      return !!row;
    }
    const row = db.prepare(
      "SELECT 1 FROM locks WHERE path = ? AND expires_at > datetime('now')"
    ).get(path);
    return !!row;
  }

  refreshLock(path: string, userId: string, ttlMinutes: number = DEFAULT_LOCK_TTL_MINUTES): boolean {
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
    const result = db.prepare(
      'UPDATE locks SET expires_at = ? WHERE path = ? AND user_id = ?'
    ).run(expiresAt, path, userId);
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
