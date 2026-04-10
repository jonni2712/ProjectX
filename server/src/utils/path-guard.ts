import { resolve, relative, normalize } from 'path';
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

  return absolute;
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
