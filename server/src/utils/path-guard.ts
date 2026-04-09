import { resolve, relative, normalize } from 'path';
import { config } from '../config.js';

/**
 * Resolves a user-provided path to an absolute path within the workspace root.
 * Throws if the resolved path escapes the workspace root.
 */
export function safePath(userPath: string): string {
  // Treat "/" or empty as workspace root
  if (!userPath || userPath === '/' || userPath === '\\') {
    return config.workspaceRoot;
  }

  // Reject absolute paths with drive letters
  if (/^[a-zA-Z]:/.test(userPath)) {
    throw new PathTraversalError(userPath);
  }

  // Strip leading slashes so resolve treats it as relative to workspace
  const stripped = userPath.replace(/^[/\\]+/, '');
  const normalized = normalize(stripped).replace(/^(\.\.(\/|\\|$))+/, '');
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
