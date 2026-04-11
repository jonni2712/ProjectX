import * as pty from 'node-pty';
import { db } from '../db/database.js';
import { v4 as uuid } from 'uuid';
import { safePath } from '../utils/path-guard.js';
import type { TerminalSession } from '../utils/types.js';

interface ActiveTerminal {
  session: TerminalSession;
  pty: pty.IPty;
  outputBuffer: string; // Scrollback buffer for reconnection
  listeners: Set<(data: string) => void>;
  userId: string;
  // Timestamp when the last listener was removed. The sweeper kills terminals
  // that have been orphaned longer than ORPHAN_GRACE_MS. null = currently attached.
  orphanedAt: number | null;
}

const MAX_BUFFER_SIZE = 100_000; // ~100KB scrollback per terminal
const MAX_TERMINALS_PER_USER = 5; // Hard cap to prevent fork bombs
const ORPHAN_GRACE_MS = 60_000; // Kill orphaned terminals after 60s (allows brief reconnect)
const ORPHAN_SWEEP_INTERVAL_MS = 15_000; // Check for orphans every 15s
const activeTerminals = new Map<string, ActiveTerminal>();

// Periodic sweeper: destroy terminals that have been orphaned too long.
// Stored on globalThis so hot-reload doesn't duplicate intervals.
let orphanSweeperStarted = false;
function startOrphanSweeper() {
  if (orphanSweeperStarted) return;
  orphanSweeperStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [id, terminal] of activeTerminals) {
      if (terminal.orphanedAt !== null && now - terminal.orphanedAt > ORPHAN_GRACE_MS) {
        try {
          terminal.pty.kill();
        } catch { /* pty already dead */ }
        activeTerminals.delete(id);
        db.prepare('UPDATE terminal_sessions SET active = 0 WHERE id = ?').run(id);
      }
    }
  }, ORPHAN_SWEEP_INTERVAL_MS).unref();
}
startOrphanSweeper();

export class TerminalLimitError extends Error {
  constructor() {
    super(`Maximum of ${MAX_TERMINALS_PER_USER} terminals per user reached`);
    this.name = 'TerminalLimitError';
  }
}

function countTerminalsForUser(userId: string): number {
  let count = 0;
  for (const t of activeTerminals.values()) {
    if (t.userId === userId) count++;
  }
  return count;
}

export function createTerminal(cwd: string, cols: number = 80, rows: number = 24, userId: string = ''): ActiveTerminal {
  // Enforce per-user cap (an empty userId means anonymous and shares one bucket).
  if (countTerminalsForUser(userId) >= MAX_TERMINALS_PER_USER) {
    throw new TerminalLimitError();
  }

  const absPath = safePath(cwd);
  const id = uuid();
  const shell = process.env.SHELL || '/bin/zsh';

  // Filter out sensitive env vars before passing to pty
  const { JWT_SECRET, AUTH_PASSWORD_HASH, AUTH_PASSWORD, ANTHROPIC_API_KEY, ...safeEnv } = process.env;

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: absPath,
    env: {
      ...safeEnv,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    } as Record<string, string>,
  });

  const session: TerminalSession = {
    id,
    pid: ptyProcess.pid,
    cwd: absPath,
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    cols,
    rows,
  };

  const terminal: ActiveTerminal = {
    session,
    pty: ptyProcess,
    outputBuffer: '',
    listeners: new Set(),
    userId,
    // Newly created terminals start "orphaned" — they become attached as soon as
    // the first listener is added (immediately after creation in the WS handler).
    orphanedAt: Date.now(),
  };

  // Capture output for scrollback and listeners
  ptyProcess.onData((data: string) => {
    terminal.outputBuffer += data;
    if (terminal.outputBuffer.length > MAX_BUFFER_SIZE) {
      terminal.outputBuffer = terminal.outputBuffer.slice(-MAX_BUFFER_SIZE);
    }
    terminal.session.lastActivity = new Date().toISOString();
    for (const listener of terminal.listeners) {
      listener(data);
    }
  });

  ptyProcess.onExit(() => {
    activeTerminals.delete(id);
    db.prepare('UPDATE terminal_sessions SET active = 0 WHERE id = ?').run(id);
  });

  // Persist session metadata
  db.prepare(
    'INSERT INTO terminal_sessions (id, pid, cwd, cols, rows) VALUES (?, ?, ?, ?, ?)'
  ).run(id, ptyProcess.pid, absPath, cols, rows);

  activeTerminals.set(id, terminal);
  return terminal;
}

export function getTerminal(id: string): ActiveTerminal | undefined {
  return activeTerminals.get(id);
}

export function listTerminals(userId?: string): TerminalSession[] {
  const all = Array.from(activeTerminals.values());
  const filtered = userId ? all.filter(t => t.userId === userId) : all;
  return filtered.map(t => t.session);
}

/**
 * Return the ids of all terminals belonging to the given user.
 * Used by the WS handler to know which terminals to grace-kill on disconnect.
 */
export function listTerminalIdsForUser(userId: string): string[] {
  const ids: string[] = [];
  for (const [id, t] of activeTerminals) {
    if (t.userId === userId) ids.push(id);
  }
  return ids;
}

export function writeToTerminal(id: string, data: string): boolean {
  const terminal = activeTerminals.get(id);
  if (!terminal) return false;
  terminal.pty.write(data);
  terminal.session.lastActivity = new Date().toISOString();
  return true;
}

export function resizeTerminal(id: string, cols: number, rows: number): boolean {
  const terminal = activeTerminals.get(id);
  if (!terminal) return false;
  terminal.pty.resize(cols, rows);
  terminal.session.cols = cols;
  terminal.session.rows = rows;
  return true;
}

export function destroyTerminal(id: string): boolean {
  const terminal = activeTerminals.get(id);
  if (!terminal) return false;
  terminal.pty.kill();
  activeTerminals.delete(id);
  db.prepare('UPDATE terminal_sessions SET active = 0 WHERE id = ?').run(id);
  return true;
}

export function addTerminalListener(id: string, listener: (data: string) => void): boolean {
  const terminal = activeTerminals.get(id);
  if (!terminal) return false;
  terminal.listeners.add(listener);
  // A terminal with at least one listener is not orphaned.
  terminal.orphanedAt = null;
  return true;
}

export function removeTerminalListener(id: string, listener: (data: string) => void): void {
  const terminal = activeTerminals.get(id);
  if (terminal) {
    terminal.listeners.delete(listener);
    // When the last listener leaves, mark as orphaned and start the grace clock.
    if (terminal.listeners.size === 0) {
      terminal.orphanedAt = Date.now();
    }
  }
}

export function getTerminalBuffer(id: string): string {
  const terminal = activeTerminals.get(id);
  return terminal?.outputBuffer || '';
}

// Cleanup all terminals on shutdown
export function destroyAllTerminals(): void {
  for (const [id, terminal] of activeTerminals) {
    terminal.pty.kill();
    db.prepare('UPDATE terminal_sessions SET active = 0 WHERE id = ?').run(id);
  }
  activeTerminals.clear();
}
