import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { validateWsTicket } from '../plugins/auth.js';
import { isOriginAllowed } from '../config.js';
import {
  createTerminal, getTerminal, writeToTerminal, resizeTerminal,
  destroyTerminal, listTerminals, addTerminalListener, removeTerminalListener,
  getTerminalBuffer,
} from '../services/terminal.service.js';
import {
  startClaudeCliSession, addClaudeCliListener, removeClaudeCliListener,
  stopClaudeCliSession, isClaudeCliAvailable,
} from '../services/claude-cli.js';
import { streamClaudeApi, isApiAvailable } from '../services/claude-api.js';
import type { WsMessage } from '../utils/types.js';

interface AuthenticatedSocket {
  ws: WebSocket;
  userId: string;
  username: string;
  terminalListeners: Map<string, (data: string) => void>;
  claudeListeners: Map<string, (event: any) => void>;
  // Null = no path filter (client gets every file event for backwards compat).
  // Non-empty = only receive events whose relPath starts with one of these prefixes.
  subscribedPaths: string[] | null;
}

const connectedClients = new Set<AuthenticatedSocket>();

/**
 * Broadcast to every connected client. Used for system-wide notifications.
 * Wrapped in try/catch to prevent a single broken socket from crashing the loop.
 */
export function broadcastToAll(message: WsMessage) {
  const payload = JSON.stringify(message);
  for (const client of connectedClients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      try { client.ws.send(payload); } catch { /* dead socket */ }
    }
  }
}

/**
 * Broadcast a file event only to clients whose subscription covers `relPath`.
 * Clients with subscribedPaths === null get every event (opt-out scoping).
 */
export function broadcastFileEvent(message: WsMessage, relPath: string) {
  const payload = JSON.stringify(message);
  for (const client of connectedClients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    const paths = client.subscribedPaths;
    if (paths !== null && !paths.some(prefix => relPath === prefix || relPath.startsWith(prefix + '/') || relPath.startsWith(prefix + '\\'))) {
      continue;
    }
    try { client.ws.send(payload); } catch { /* dead socket */ }
  }
}

export default async function wsHandler(fastify: FastifyInstance) {
  fastify.get('/ws', { websocket: true }, (socket, request) => {
    // WebSockets are NOT subject to CORS in browsers, so the server MUST verify
    // Origin manually to prevent cross-site WS hijacking.
    const origin = request.headers.origin as string | undefined;
    if (!isOriginAllowed(origin)) {
      socket.close(4000, 'Origin not allowed');
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host}`);
    const ticket = url.searchParams.get('ticket');

    if (!ticket) {
      socket.close(4001, 'Missing ticket');
      return;
    }

    const auth = validateWsTicket(ticket);
    if (!auth) {
      socket.close(4003, 'Invalid or expired ticket');
      return;
    }

    const client: AuthenticatedSocket = {
      ws: socket,
      userId: auth.userId,
      username: auth.username,
      terminalListeners: new Map(),
      claudeListeners: new Map(),
      subscribedPaths: null, // Default: receive all file events (backwards compat)
    };

    connectedClients.add(client);

    function send(msg: WsMessage) {
      if (socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify(msg));
      } catch (err) {
        // JSON.stringify can throw on circular refs; socket.send can throw if
        // the socket died between the readyState check and the send. Either
        // way we don't want to crash the message handler loop.
        fastify.log.warn({ err }, 'WS send failed');
      }
    }

    socket.on('message', async (raw) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send({ channel: 'system', type: 'error', data: 'Invalid JSON' });
        return;
      }

      try {
        await handleMessage(client, msg, send);
      } catch (error: any) {
        send({
          channel: msg.channel,
          type: 'error',
          data: error.message || 'Internal error',
        });
      }
    });

    socket.on('close', () => {
      // Clean up terminal listeners (but don't kill terminals — they persist)
      for (const [termId, listener] of client.terminalListeners) {
        removeTerminalListener(termId, listener);
      }
      // Clean up claude listeners
      for (const [sessionId, listener] of client.claudeListeners) {
        removeClaudeCliListener(sessionId, listener);
      }
      connectedClients.delete(client);
    });

    // Send welcome
    send({ channel: 'system', type: 'connected', data: `Welcome ${auth.username}` });
  });
}

async function handleMessage(
  client: AuthenticatedSocket,
  msg: WsMessage,
  send: (msg: WsMessage) => void,
) {
  const { channel, type, data, meta } = msg;

  // --- Terminal channels: "terminal:*" ---
  if (channel.startsWith('terminal:')) {
    const termId = channel.split(':')[1];
    await handleTerminal(client, termId, type, data, meta, send);
    return;
  }

  // --- Terminal management ---
  if (channel === 'terminal') {
    switch (type) {
      case 'create': {
        const cwd = data?.cwd || '/';
        const cols = data?.cols || 80;
        const rows = data?.rows || 24;
        try {
          const terminal = createTerminal(cwd, cols, rows, client.userId);
          const listener = (output: string) => {
            send({ channel: `terminal:${terminal.session.id}`, type: 'output', data: output });
          };
          addTerminalListener(terminal.session.id, listener);
          client.terminalListeners.set(terminal.session.id, listener);
          send({ channel: 'terminal', type: 'created', data: terminal.session });
        } catch (err: any) {
          send({ channel: 'terminal', type: 'error', data: err?.message || 'Failed to create terminal' });
        }
        break;
      }
      case 'list': {
        // Scope list to the current user — never leak other users' terminal ids.
        send({ channel: 'terminal', type: 'list', data: listTerminals(client.userId) });
        break;
      }
      case 'destroy': {
        const id = data?.id;
        if (id) {
          const terminal = getTerminal(id);
          if (terminal && terminal.userId !== client.userId) {
            send({ channel: 'terminal', type: 'error', data: 'Access denied: terminal belongs to another user' });
            break;
          }
          const listener = client.terminalListeners.get(id);
          if (listener) {
            removeTerminalListener(id, listener);
            client.terminalListeners.delete(id);
          }
          destroyTerminal(id);
          send({ channel: 'terminal', type: 'destroyed', data: { id } });
        }
        break;
      }
      case 'attach': {
        // Reattach to an existing terminal session
        const id = data?.id;
        const terminal = getTerminal(id);
        if (terminal) {
          if (terminal.userId !== client.userId) {
            send({ channel: 'terminal', type: 'error', data: 'Access denied: terminal belongs to another user' });
            break;
          }
          const listener = (output: string) => {
            send({ channel: `terminal:${id}`, type: 'output', data: output });
          };
          addTerminalListener(id, listener);
          client.terminalListeners.set(id, listener);
          // Send scrollback buffer
          const buffer = getTerminalBuffer(id);
          if (buffer) {
            send({ channel: `terminal:${id}`, type: 'output', data: buffer });
          }
          send({ channel: 'terminal', type: 'attached', data: terminal.session });
        } else {
          send({ channel: 'terminal', type: 'error', data: `Terminal ${id} not found` });
        }
        break;
      }
    }
    return;
  }

  // --- Specific terminal I/O ---
  // (handled by channel prefix above)

  // --- Claude channels ---
  if (channel === 'claude') {
    await handleClaude(client, type, data, meta, send);
    return;
  }

  // --- File watch subscription ---
  if (channel === 'files') {
    switch (type) {
      case 'subscribe': {
        // Opt-in to path-scoped file events. After subscribing, the client only
        // receives events whose relPath starts with one of the given prefixes.
        // Accepts either { path: "..." } or { paths: ["...", "..."] }.
        const paths: string[] = Array.isArray(data?.paths)
          ? data.paths.filter((p: any) => typeof p === 'string')
          : typeof data?.path === 'string' ? [data.path] : [];
        // Normalize: strip leading slashes so comparison matches relativePath() output.
        client.subscribedPaths = paths.map((p: string) => p.replace(/^[/\\]+/, ''));
        send({ channel: 'files', type: 'subscribed', data: { paths: client.subscribedPaths } });
        break;
      }
      case 'unsubscribe': {
        client.subscribedPaths = null;
        send({ channel: 'files', type: 'unsubscribed' });
        break;
      }
    }
    return;
  }

  send({ channel: 'system', type: 'error', data: `Unknown channel: ${channel}` });
}

async function handleTerminal(
  client: AuthenticatedSocket,
  termId: string,
  type: string,
  data: any,
  meta: any,
  send: (msg: WsMessage) => void,
) {
  // Verify the terminal belongs to this user
  const terminal = getTerminal(termId);
  if (!terminal) {
    send({ channel: `terminal:${termId}`, type: 'error', data: 'Terminal not found' });
    return;
  }
  if (terminal.userId !== client.userId) {
    send({ channel: `terminal:${termId}`, type: 'error', data: 'Access denied: terminal belongs to another user' });
    return;
  }

  switch (type) {
    case 'input':
      writeToTerminal(termId, data);
      break;
    case 'resize':
      if (data?.cols && data?.rows) {
        resizeTerminal(termId, data.cols, data.rows);
      }
      break;
  }
}

async function handleClaude(
  client: AuthenticatedSocket,
  type: string,
  data: any,
  meta: any,
  send: (msg: WsMessage) => void,
) {
  switch (type) {
    case 'prompt': {
      const { prompt, cwd, mode } = data;
      const workingDir = cwd || '/';

      // Try CLI first, then API fallback
      const useCliMode = mode === 'cli' || (mode !== 'api' && isClaudeCliAvailable());

      if (useCliMode) {
        const sessionId = startClaudeCliSession(workingDir, prompt);
        const listener = (event: any) => {
          send({ channel: 'claude', type: event.type, data: event.data, meta: { sessionId } });
        };
        addClaudeCliListener(sessionId, listener);
        client.claudeListeners.set(sessionId, listener);
        send({ channel: 'claude', type: 'started', data: { sessionId, mode: 'cli' } });
      } else if (isApiAvailable()) {
        const sessionId = await streamClaudeApi(prompt, workingDir, {
          onStream: (text) => send({ channel: 'claude', type: 'stream', data: text, meta: { sessionId } }),
          onDone: () => send({ channel: 'claude', type: 'done', meta: { sessionId } }),
          onError: (err) => send({ channel: 'claude', type: 'error', data: err, meta: { sessionId } }),
        });
        send({ channel: 'claude', type: 'started', data: { sessionId, mode: 'api' } });
      } else {
        send({ channel: 'claude', type: 'error', data: 'Neither Claude CLI nor API is available' });
      }
      break;
    }
    case 'stop': {
      const sessionId = data?.sessionId;
      if (sessionId) {
        stopClaudeCliSession(sessionId);
        const listener = client.claudeListeners.get(sessionId);
        if (listener) {
          removeClaudeCliListener(sessionId, listener);
          client.claudeListeners.delete(sessionId);
        }
        send({ channel: 'claude', type: 'stopped', meta: { sessionId } });
      }
      break;
    }
  }
}
