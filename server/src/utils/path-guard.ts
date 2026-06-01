import { resolve, relative, normalize, dirname, isAbsolute } from 'path';
import { realpathSync, existsSync } from 'fs';
import { config } from '../config.js';

/**
 * Protected path segments — these cannot appear at ANY depth in a user-supplied path.
 * Covers:
 *  - Syncthing markers (.stfolder/.stignore/.stversions)
 *  - Git internals (.git) — blocking nested .git prevents planting git hooks for RCE
 *  - Secrets commonly found in user workspaces (.env*, .ssh, .aws, .gnupg, .npmrc, .netrc)
 *  - node_modules is excluded intentionally: legitimate ops need to traverse it
 */
const PROTECTED_SEGMENTS = new Set([
  '.stfolder',
  '.stignore',
  '.stversions',
  '.git',
  '.ssh',
  '.aws',
  '.gnupg',
  '.npmrc',
  '.netrc',
]);

/**
 * Protected filename patterns (matched against each segment). These block files
 * whose name itself is sensitive even if the containing dir isn't (e.g. ".env",
 * ".env.local", ".env.production").
 */
function isProtectedFilename(segment: string): boolean {
  const lower = segment.toLowerCase();
  if (PROTECTED_SEGMENTS.has(lower)) return true;
  if (lower === '.env' || lower.startsWith('.env.')) return true;
  return false;
}

/**
 * Resolves a user-provided path to an absolute path within the workspace root.
 * Throws if the resolved path escapes the workspace root or touches a protected segment.
 */
export function safePath(userPath: string): string {
  // Treat "/" or empty as workspace root
  if (!userPath || userPath === '/' || userPath === '\\') {
    return config.workspaceRoot;
  }

  // Reject absolute paths with drive letters (C:\, D:/, ...)
  if (/^[a-zA-Z]:/.test(userPath)) {
    throw new PathTraversalError(userPath);
  }

  // Reject UNC / network paths on any OS:
  //   \\server\share, //server/share, \\?\C:\..., \\.\ namespace
  if (/^[\\/]{2}/.test(userPath)) {
    throw new PathTraversalError(userPath);
  }

  // Reject embedded NUL bytes — they can confuse downstream fs APIs
  if (userPath.includes('\0')) {
    throw new PathTraversalError(userPath);
  }

  // Strip leading slashes so resolve treats it as relative to workspace
  const stripped = userPath.replace(/^[/\\]+/, '');
  const normalized = normalize(stripped).replace(/^(\.\.(\/|\\|$))+/, '');

  // Check EVERY path segment against the protected list (not just the first).
  // This blocks traversal into nested .git/ dirs, nested .env files, etc.
  const segments = normalized.split(/[/\\]/).filter(Boolean);
  for (const segment of segments) {
    if (isProtectedFilename(segment)) {
      throw new PathTraversalError(`Protected path segment: ${segment}`);
    }
  }

  const absolute = resolve(config.workspaceRoot, normalized);
  const rel = relative(config.workspaceRoot, absolute);

  if (rel.startsWith('..') || resolve(absolute) !== absolute) {
    throw new PathTraversalError(userPath);
  }

  // Symlink escape check: a symlink INSIDE the workspace (e.g. created via the
  // terminal) could point OUTSIDE it (~/.ssh, /etc). The string checks above
  // only validate the literal path, not where symlinks resolve to. Resolve the
  // real path of the deepest existing component and assert it stays within the
  // (real) workspace root.
  assertNoSymlinkEscape(absolute);

  return absolute;
}

function assertNoSymlinkEscape(absolute: string): void {
  let realRoot: string;
  try {
    realRoot = realpathSync(config.workspaceRoot);
  } catch {
    return; // workspace root missing — startup validation covers this
  }
  // Walk up to the deepest path component that actually exists (the target may
  // be a not-yet-created file).
  let existing = absolute;
  while (!existsSync(existing) && existing !== dirname(existing)) {
    existing = dirname(existing);
  }
  let real: string;
  try {
    real = realpathSync(existing);
  } catch {
    return;
  }
  const rel = relative(realRoot, real);
  if (rel !== '' && (rel.startsWith('..') || isAbsolute(rel))) {
    throw new PathTraversalError(`symlink escapes workspace: ${absolute}`);
  }
}

/**
 * Returns the relative path from workspace root.
 */
export function relativePath(absolutePath: string): string {
  const rel = relative(config.workspaceRoot, absolutePath);
  if (rel.startsWith('..')) {
    throw new PathTraversalError(absolutePath);
  }
  return rel;
}

export class PathTraversalError extends Error {
  constructor(path: string) {
    super(`Path traversal detected: ${path}`);
    this.name = 'PathTraversalError';
  }
}
