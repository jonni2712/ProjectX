import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { v4 as uuid } from 'uuid';
import { db } from '../db/database.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!config.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

export function isApiAvailable(): boolean {
  return !!config.anthropicApiKey;
}

export interface ApiStreamCallbacks {
  onStream: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

// Per-user cap on concurrent API streams, mirroring the CLI fork-bomb guard so
// a looped 'prompt' can't fan out unbounded in-flight requests.
const MAX_API_SESSIONS_PER_USER = 3;

export class ApiLimitError extends Error {
  constructor() {
    super(`Maximum of ${MAX_API_SESSIONS_PER_USER} concurrent Claude sessions per user reached`);
    this.name = 'ApiLimitError';
  }
}

// sessionId -> owning userId for live API streams.
const activeApiSessions = new Map<string, string>();

function countApiSessionsForUser(userId: string): number {
  let n = 0;
  for (const u of activeApiSessions.values()) {
    if (u === userId) n++;
  }
  return n;
}

/** Owner of a live API session, or undefined. */
export function getApiSessionOwner(id: string): string | undefined {
  return activeApiSessions.get(id);
}

export async function streamClaudeApi(
  prompt: string,
  cwd: string,
  callbacks: ApiStreamCallbacks,
  userId: string,
  systemPrompt?: string,
): Promise<string> {
  if (countApiSessionsForUser(userId) >= MAX_API_SESSIONS_PER_USER) {
    throw new ApiLimitError();
  }
  const anthropic = getClient();
  const id = uuid();

  db.prepare(
    "INSERT INTO claude_sessions (id, mode, cwd) VALUES (?, 'api', ?)"
  ).run(id, cwd);
  activeApiSessions.set(id, userId);

  // Single teardown path so the session is always released from the per-user
  // count and marked inactive exactly once, whatever ends the stream.
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    activeApiSessions.delete(id);
    db.prepare('UPDATE claude_sessions SET active = 0 WHERE id = ?').run(id);
  };

  try {
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt || `You are a coding assistant. The user is working in the directory: ${cwd}`,
      messages: [{ role: 'user', content: prompt }],
    });

    stream.on('text', (text) => {
      callbacks.onStream(text);
    });

    stream.on('end', () => {
      callbacks.onDone();
      finish();
    });

    stream.on('error', (error) => {
      callbacks.onError(error.message);
      finish();
    });
  } catch (error: any) {
    callbacks.onError(error.message);
    finish();
  }

  return id;
}
