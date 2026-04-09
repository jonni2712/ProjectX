import { watch } from 'chokidar';
import { config } from '../config.js';
import { relativePath } from '../utils/path-guard.js';
import { broadcastToAll } from './handler.js';
import type { WsMessage } from '../utils/types.js';

let watcher: ReturnType<typeof watch> | null = null;
let debounceTimers = new Map<string, NodeJS.Timeout>();

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
        const relPath = relativePath(filePath);
        const msg: WsMessage = {
          channel: 'files',
          type: eventType,
          data: { path: relPath },
        };
        broadcastToAll(msg);
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
