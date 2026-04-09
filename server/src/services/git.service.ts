import simpleGit, { SimpleGit } from 'simple-git';
import { safePath } from '../utils/path-guard.js';
import type { GitStatus, GitFileStatus, GitLogEntry } from '../utils/types.js';

function getGit(repoPath: string): SimpleGit {
  const absPath = safePath(repoPath);
  return simpleGit(absPath);
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
  const git = getGit(repoPath);
  await git.add(files);
}

export async function gitCommit(repoPath: string, message: string, files?: string[]): Promise<string> {
  const git = getGit(repoPath);
  if (files && files.length > 0) {
    await git.add(files);
  }
  const result = await git.commit(message);
  return result.commit;
}

export async function gitPush(repoPath: string, remote: string = 'origin', branch?: string): Promise<void> {
  const git = getGit(repoPath);
  if (branch) {
    await git.push(remote, branch);
  } else {
    await git.push();
  }
}

export async function gitPull(repoPath: string, remote: string = 'origin', branch?: string): Promise<string> {
  const git = getGit(repoPath);
  const result = branch
    ? await git.pull(remote, branch)
    : await git.pull();
  return `${result.summary.changes} changes, ${result.summary.insertions} insertions, ${result.summary.deletions} deletions`;
}

export async function gitLog(repoPath: string, maxCount: number = 20): Promise<GitLogEntry[]> {
  const git = getGit(repoPath);
  const log = await git.log({ maxCount });
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
  const git = getGit(repoPath);
  await git.checkout(branch);
}

export async function gitDiscard(repoPath: string, files: string[]): Promise<void> {
  const git = getGit(repoPath);
  await git.checkout(['--', ...files]);
}

export async function gitDiff(repoPath: string, file?: string): Promise<string> {
  const git = getGit(repoPath);
  if (file) {
    return await git.diff([file]);
  }
  return await git.diff();
}

export async function gitDiffStaged(repoPath: string, file?: string): Promise<string> {
  const git = getGit(repoPath);
  if (file) {
    return await git.diff(['--cached', file]);
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

  async function scan(dir: string, depth: number) {
    if (depth > maxDepth) return;
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
