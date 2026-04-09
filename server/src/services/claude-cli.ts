import { spawn, execSync, ChildProcess } from 'child_process';
import { v4 as uuid } from 'uuid';
import { safePath } from '../utils/path-guard.js';
import { db } from '../db/database.js';

interface ClaudeCliSession {
  id: string;
  process: ChildProcess;
  cwd: string;
  listeners: Set<(event: ClaudeEvent) => void>;
  active: boolean;
}

export interface ClaudeEvent {
  type: 'stream' | 'done' | 'error';
  data: string;
}

const activeSessions = new Map<string, ClaudeCliSession>();

export function isClaudeCliAvailable(): boolean {
  try {
    execSync('which claude', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function startClaudeCliSession(cwd: string, prompt: string): string {
  const absPath = safePath(cwd);
  const id = uuid();

  const proc = spawn('claude', ['--print', '--', prompt], {
    cwd: absPath,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const session: ClaudeCliSession = {
    id,
    process: proc,
    cwd: absPath,
    listeners: new Set(),
    active: true,
  };

  db.prepare(
    "INSERT INTO claude_sessions (id, mode, cwd) VALUES (?, 'cli', ?)"
  ).run(id, absPath);

  proc.stdout?.on('data', (data: Buffer) => {
    const text = data.toString();
    for (const listener of session.listeners) {
      listener({ type: 'stream', data: text });
    }
  });

  proc.stderr?.on('data', (data: Buffer) => {
    const text = data.toString();
    for (const listener of session.listeners) {
      listener({ type: 'error', data: text });
    }
  });

  proc.on('close', () => {
    session.active = false;
    for (const listener of session.listeners) {
      listener({ type: 'done', data: '' });
    }
    activeSessions.delete(id);
    db.prepare('UPDATE claude_sessions SET active = 0 WHERE id = ?').run(id);
  });

  activeSessions.set(id, session);
  return id;
}

export function addClaudeCliListener(id: string, listener: (event: ClaudeEvent) => void): boolean {
  const session = activeSessions.get(id);
  if (!session) return false;
  session.listeners.add(listener);
  return true;
}

export function removeClaudeCliListener(id: string, listener: (event: ClaudeEvent) => void): void {
  const session = activeSessions.get(id);
  if (session) session.listeners.delete(listener);
}

export function stopClaudeCliSession(id: string): boolean {
  const session = activeSessions.get(id);
  if (!session) return false;
  session.process.kill('SIGTERM');
  session.active = false;
  activeSessions.delete(id);
  db.prepare('UPDATE claude_sessions SET active = 0 WHERE id = ?').run(id);
  return true;
}

export function isSessionActive(id: string): boolean {
  return activeSessions.has(id) && activeSessions.get(id)!.active;
}
