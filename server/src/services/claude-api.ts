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

export async function streamClaudeApi(
  prompt: string,
  cwd: string,
  callbacks: ApiStreamCallbacks,
  systemPrompt?: string,
): Promise<string> {
  const anthropic = getClient();
  const id = uuid();

  db.prepare(
    "INSERT INTO claude_sessions (id, mode, cwd) VALUES (?, 'api', ?)"
  ).run(id, cwd);

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
      db.prepare('UPDATE claude_sessions SET active = 0 WHERE id = ?').run(id);
    });

    stream.on('error', (error) => {
      callbacks.onError(error.message);
      db.prepare('UPDATE claude_sessions SET active = 0 WHERE id = ?').run(id);
    });
  } catch (error: any) {
    callbacks.onError(error.message);
    db.prepare('UPDATE claude_sessions SET active = 0 WHERE id = ?').run(id);
  }

  return id;
}
