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
}

const MAX_BUFFER_SIZE = 100_000; // ~100KB scrollback per terminal
const activeTerminals = new Map<string, ActiveTerminal>();

export function createTerminal(cwd: string, cols: number = 80, rows: number = 24): ActiveTerminal {
  const absPath = safePath(cwd);
  const id = uuid();
  const shell = process.env.SHELL || '/bin/zsh';

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: absPath,
    env: {
      ...process.env,
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

export function listTerminals(): TerminalSession[] {
  return Array.from(activeTerminals.values()).map(t => t.session);
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
  return true;
}

export function removeTerminalListener(id: string, listener: (data: string) => void): void {
  const terminal = activeTerminals.get(id);
  if (terminal) {
    terminal.listeners.delete(listener);
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
