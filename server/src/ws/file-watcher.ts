import { watch } from 'chokidar';
import { basename } from 'path';
import { config } from '../config.js';
import { relativePath } from '../utils/path-guard.js';
import { broadcastFileEvent } from './handler.js';
import type { WsMessage } from '../utils/types.js';

let watcher: ReturnType<typeof watch> | null = null;
let debounceTimers = new Map<string, NodeJS.Timeout>();

/**
 * Defense-in-depth filter for sensitive filenames. Chokidar already ignores
 * dotfiles via the `ignored` pattern, but if that config ever changes we still
 * want to stop secret filenames from leaking into file events.
 */
function isSensitiveBasename(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower === '.env' || lower.startsWith('.env.')) return true;
  if (['.git', '.ssh', '.aws', '.gnupg', '.npmrc', '.netrc'].includes(lower)) return true;
  return false;
}

export function startFileWatcher() {
  if (watcher) return;

  watcher = watch(config.workspaceRoot, {
    ignored: [
      /(^|[\/\\])\./,        // Hidden files
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/__pycache__/**',
    ],
    persistent: true,
    ignoreInitial: true,
    depth: 3,
    usePolling: false,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  const emitEvent = (eventType: string, filePath: string) => {
    const key = `${eventType}:${filePath}`;

    // Debounce: only send last event per file within the window
    const existing = debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    debounceTimers.set(key, setTimeout(() => {
      debounceTimers.delete(key);
      try {
        // Skip sensitive basenames even though chokidar's ignore pattern should
        // already block them (defense in depth).
        if (isSensitiveBasename(basename(filePath))) return;
        const relPath = relativePath(filePath);
        // Also block events whose relative path contains a sensitive segment.
        const segments = relPath.split(/[/\\]/);
        if (segments.some(isSensitiveBasename)) return;
        const msg: WsMessage = {
          channel: 'files',
          type: eventType,
          data: { path: relPath },
        };
        // broadcastFileEvent respects per-client subscribedPaths, so clients
        // that opted into scoping only receive events under their prefix.
        broadcastFileEvent(msg, relPath);
      } catch {
        // Path might be outside workspace (race condition), ignore
      }
    }, config.watcherDebounce));
  };

  watcher.on('add', (path) => emitEvent('created', path));
  watcher.on('change', (path) => emitEvent('changed', path));
  watcher.on('unlink', (path) => emitEvent('deleted', path));
  watcher.on('addDir', (path) => emitEvent('dir_created', path));
  watcher.on('unlinkDir', (path) => emitEvent('dir_deleted', path));

  console.log(`File watcher started on: ${config.workspaceRoot}`);
}

export function stopFileWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer);
    }
    debounceTimers.clear();
  }
}
