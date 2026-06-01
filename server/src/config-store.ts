import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// config.json lives alongside the SQLite database in server/data/. This module
// is the persistent configuration store: a single JSON file that is the source
// of truth for the server's settings. It replaces hand-editing .env on each
// machine and is what the upcoming setup wizard / web setup UI read and write.
//
// .env still works as an override at runtime (see config.ts precedence rules),
// but values are migrated into this file on first run so future runs are
// self-contained.
const dataDir = resolve(import.meta.dirname || '.', '../data');
export const CONFIG_PATH = resolve(dataDir, 'config.json');

export interface StoredConfig {
  port?: number;
  host?: string;
  workspaceRoot?: string;
  jwt?: {
    secret?: string;
    expiresIn?: string;
    refreshExpiresIn?: string;
  };
  anthropicApiKey?: string;
  rateLimit?: {
    loginMax?: number;
    loginWindow?: number;
  };
  watcherDebounce?: number;
  publicOrigins?: string[];
  cloudflaredExpectedHashes?: string[];
}

/** True if data/config.json exists. Used to decide whether to run first-run migration. */
export function configFileExists(): boolean {
  return existsSync(CONFIG_PATH);
}

/**
 * Read data/config.json. Returns an empty object if the file is missing,
 * unreadable, or not a JSON object — config.ts then falls back to env/defaults,
 * so a corrupt file never crashes startup.
 */
export function loadStoredConfig(): StoredConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as StoredConfig;
    }
    console.warn(`[config-store] ${CONFIG_PATH} is not a JSON object — ignoring.`);
    return {};
  } catch (err) {
    console.warn(`[config-store] Failed to read ${CONFIG_PATH}: ${(err as Error).message} — ignoring.`);
    return {};
  }
}

/**
 * Persist config to data/config.json with 0600 permissions — the file holds
 * secrets (JWT secret, Anthropic API key), so it must not be world-readable.
 */
export function saveStoredConfig(cfg: StoredConfig): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
}
