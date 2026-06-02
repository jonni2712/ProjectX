import simpleGit, { SimpleGit } from 'simple-git';
import { safePath } from '../utils/path-guard.js';
import type { GitStatus, GitFileStatus, GitLogEntry } from '../utils/types.js';

function getGit(repoPath: string): SimpleGit {
  const absPath = safePath(repoPath);
  return simpleGit(absPath);
}

/**
 * Reject any user-supplied value that could be parsed by git as an OPTION
 * (e.g. `--upload-pack=...`, `--exec`, `-o`), which is the argument-injection
 * vector behind several git RCEs. Branch/remote/file/path values must never
 * start with "-". Defence-in-depth on top of the simple-git upgrade.
 */
function rejectOptionLike(...values: (string | undefined)[]): void {
  for (const v of values) {
    if (typeof v === 'string' && v.trimStart().startsWith('-')) {
      throw new Error('Invalid git argument: values must not start with "-"');
    }
  }
}

interface HttpError extends Error { statusCode?: number }

/**
 * Translate a git failure into a typed 4xx error (the global error handler
 * returns the message verbatim for <500, but masks 500s). Without this, an
 * everyday git failure (merge conflict, no upstream, auth) surfaces as an opaque
 * 500 with a leaked stderr blob.
 */
function mapGitError(err: unknown): HttpError {
  const msg = (err instanceof Error ? err.message : String(err)) || 'Git operation failed';
  const m = msg.toLowerCase();
  const e: HttpError = new Error(msg.split('\n')[0].slice(0, 300));
  if (m.includes('conflict') || m.includes('would be overwritten') || m.includes('not possible to fast-forward') || m.includes('non-fast-forward')) {
    e.statusCode = 409;
  } else if (m.includes('no upstream') || m.includes('no tracking') || m.includes('no configured push destination') || m.includes("couldn't find remote ref")) {
    e.statusCode = 422;
  } else if (m.includes('authentication failed') || m.includes('permission denied') || m.includes('could not read username') || m.includes('403')) {
    e.statusCode = 401;
  } else if (m.includes('not a git repository') || m.includes('does not exist') || m.includes('pathspec')) {
    e.statusCode = 404;
  } else {
    e.statusCode = 400;
  }
  return e;
}

export async function gitStatus(repoPath: string): Promise<GitStatus> {
  const git = getGit(repoPath);
  const status = await git.status();
  return {
    current: status.current,
    tracking: status.tracking,
    ahead: status.ahead,
    behind: status.behind,
    files: status.files.map(f => ({
      path: f.path,
      index: f.index,
      working_dir: f.working_dir,
    })),
  };
}

export async function gitAdd(repoPath: string, files: string[]): Promise<void> {
  rejectOptionLike(...files);
  const git = getGit(repoPath);
  await git.add(files);
}

export async function gitCommit(repoPath: string, message: string, files?: string[]): Promise<string> {
  rejectOptionLike(...(files ?? []));
  const git = getGit(repoPath);
  try {
    if (files && files.length > 0) {
      await git.add(files);
    }
    const result = await git.commit(message);
    return result.commit;
  } catch (err) { throw mapGitError(err); }
}

export async function gitPush(repoPath: string, remote: string = 'origin', branch?: string): Promise<void> {
  rejectOptionLike(remote, branch);
  const git = getGit(repoPath);
  try {
    if (branch) { await git.push(remote, branch); } else { await git.push(); }
  } catch (err) { throw mapGitError(err); }
}

export async function gitPull(repoPath: string, remote: string = 'origin', branch?: string): Promise<string> {
  rejectOptionLike(remote, branch);
  const git = getGit(repoPath);
  try {
    const result = branch ? await git.pull(remote, branch) : await git.pull();
    return `${result.summary.changes} changes, ${result.summary.insertions} insertions, ${result.summary.deletions} deletions`;
  } catch (err) { throw mapGitError(err); }
}

export async function gitLog(repoPath: string, maxCount: number = 20): Promise<GitLogEntry[]> {
  const git = getGit(repoPath);
  // NaN/Infinity/<=0 would make simple-git return the FULL history.
  const safeMax = Number.isFinite(maxCount) && maxCount > 0 ? Math.min(Math.floor(maxCount), 500) : 20;
  const log = await git.log({ maxCount: safeMax });
  return log.all.map(entry => ({
    hash: entry.hash,
    date: entry.date,
    message: entry.message,
    author_name: entry.author_name,
    author_email: entry.author_email,
  }));
}

export async function gitBranches(repoPath: string): Promise<{ current: string; branches: string[] }> {
  const git = getGit(repoPath);
  const result = await git.branchLocal();
  return {
    current: result.current,
    branches: result.all,
  };
}

export async function gitCheckout(repoPath: string, branch: string): Promise<void> {
  rejectOptionLike(branch);
  const git = getGit(repoPath);
  try {
    await git.checkout(branch);
  } catch (err) { throw mapGitError(err); }
}

export async function gitDiscard(repoPath: string, files: string[]): Promise<void> {
  // Consistency with every other file-taking helper: reject option-like values.
  // The leading `--` already neutralizes dash-prefixed names here, but keeping
  // the guard means the defence survives any future refactor that drops the `--`.
  rejectOptionLike(...(files ?? []));
  const git = getGit(repoPath);
  await git.checkout(['--', ...files]);
}

export async function gitDiff(repoPath: string, file?: string): Promise<string> {
  rejectOptionLike(file);
  const git = getGit(repoPath);
  if (file) {
    return await git.diff(['--', file]);
  }
  return await git.diff();
}

export async function gitDiffStaged(repoPath: string, file?: string): Promise<string> {
  rejectOptionLike(file);
  const git = getGit(repoPath);
  if (file) {
    return await git.diff(['--cached', '--', file]);
  }
  return await git.diff(['--cached']);
}

export async function gitCurrentBranch(repoPath: string): Promise<string> {
  const git = getGit(repoPath);
  const result = await git.branchLocal();
  return result.current;
}

export async function gitIsRepo(dirPath: string): Promise<boolean> {
  try {
    const git = getGit(dirPath);
    return await git.checkIsRepo();
  } catch {
    return false;
  }
}

export async function scanForRepos(rootPath: string, maxDepth: number = 3): Promise<string[]> {
  const { readdir, stat } = await import('fs/promises');
  const { join, relative } = await import('path');
  const { config } = await import('../config.js');

  const absRoot = safePath(rootPath);
  const repos: string[] = [];
  // NaN would make `depth > maxDepth` always false → unbounded recursion.
  const safeDepth = Number.isFinite(maxDepth) && maxDepth >= 0 ? Math.min(Math.floor(maxDepth), 10) : 3;

  async function scan(dir: string, depth: number) {
    if (depth > safeDepth) return;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      const hasGit = entries.some(e => e.name === '.git' && e.isDirectory());
      if (hasGit) {
        const relPath = relative(config.workspaceRoot, dir);
        repos.push(relPath || '/');
        return; // Don't recurse into git repos
      }
      // Skip common non-project directories
      const skip = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.stversions', '.stfolder']);
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && !skip.has(entry.name)) {
          await scan(join(dir, entry.name), depth + 1);
        }
      }
    } catch {
      // Permission denied or other error, skip
    }
  }

  await scan(absRoot, 0);
  return repos.sort();
}
