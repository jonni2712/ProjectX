import {
  readdir, readFile, writeFile, mkdir, rm, rename, cp, stat, access,
} from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { resolve, join, basename, dirname, extname } from 'path';
import { pipeline } from 'stream/promises';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { safePath, relativePath } from '../utils/path-guard.js';
import { config } from '../config.js';
import type { FileEntry } from '../utils/types.js';

export async function listDirectory(dirPath: string): Promise<FileEntry[]> {
  const absPath = safePath(dirPath);
  const entries = await readdir(absPath, { withFileTypes: true });

  const results: FileEntry[] = [];
  const hiddenSystemFiles = new Set(['.stfolder', '.stignore', '.stversions', '.git', '.DS_Store', 'Thumbs.db']);
  for (const entry of entries) {
    // Skip Syncthing markers, .git, and system files
    if (hiddenSystemFiles.has(entry.name)) continue;
    const fullPath = join(absPath, entry.name);
    try {
      const stats = await stat(fullPath);
      results.push({
        name: entry.name,
        path: relativePath(fullPath),
        type: entry.isDirectory() ? 'directory' : 'file',
        size: entry.isFile() ? stats.size : undefined,
        modified: stats.mtime.toISOString(),
      });
    } catch {
      // Skip inaccessible entries
    }
  }

  return results.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function readFileContent(filePath: string): Promise<{ content: string; encoding: string; isBinary: boolean }> {
  const absPath = safePath(filePath);
  const stats = await stat(absPath);
  if (stats.size > 50 * 1024 * 1024) {
    throw new Error('File too large to read (max 50MB)');
  }
  const buffer = await readFile(absPath);

  // Check if binary by looking for null bytes in first 8KB
  const sample = buffer.subarray(0, 8192);
  const isBinary = sample.includes(0);

  if (isBinary) {
    return { content: buffer.toString('base64'), encoding: 'base64', isBinary: true };
  }
  return { content: buffer.toString('utf-8'), encoding: 'utf-8', isBinary: false };
}

export async function readFileBinary(filePath: string): Promise<Buffer> {
  const absPath = safePath(filePath);
  return readFile(absPath);
}

export async function writeFileContent(filePath: string, content: string): Promise<void> {
  const absPath = safePath(filePath);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, 'utf-8');
}

export async function createFile(filePath: string, content: string = ''): Promise<void> {
  const absPath = safePath(filePath);
  await mkdir(dirname(absPath), { recursive: true });
  // Check file doesn't already exist
  try {
    await access(absPath);
    throw new Error(`File already exists: ${filePath}`);
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }
  await writeFile(absPath, content, 'utf-8');
}

export async function createDirectory(dirPath: string): Promise<void> {
  const absPath = safePath(dirPath);
  await mkdir(absPath, { recursive: true });
}

export async function deleteEntry(entryPath: string): Promise<void> {
  const absPath = safePath(entryPath);
  // Prevent deleting the workspace root itself
  if (absPath === config.workspaceRoot) {
    throw new Error('Cannot delete workspace root');
  }
  await rm(absPath, { recursive: true, force: true });
}

export async function renameEntry(oldPath: string, newName: string): Promise<void> {
  const absOld = safePath(oldPath);
  const newPath = join(dirname(absOld), newName);
  safePath(relativePath(newPath)); // Validate new path is still in workspace
  await rename(absOld, newPath);
}

export async function moveEntry(srcPath: string, destDir: string): Promise<void> {
  const absSrc = safePath(srcPath);
  const absDest = safePath(destDir);
  const target = join(absDest, basename(absSrc));
  safePath(relativePath(target)); // Validate
  await rename(absSrc, target);
}

export async function copyEntry(srcPath: string, destPath: string): Promise<void> {
  const absSrc = safePath(srcPath);
  const absDest = safePath(destPath);
  await cp(absSrc, absDest, { recursive: true });
}

export async function getFileInfo(filePath: string): Promise<FileEntry> {
  const absPath = safePath(filePath);
  const stats = await stat(absPath);
  return {
    name: basename(absPath),
    path: relativePath(absPath),
    type: stats.isDirectory() ? 'directory' : 'file',
    size: stats.isFile() ? stats.size : undefined,
    modified: stats.mtime.toISOString(),
  };
}

export async function zipDirectory(dirPath: string): Promise<Buffer> {
  const absPath = safePath(dirPath);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    archive.directory(absPath, basename(absPath));
    archive.finalize();
  });
}

export async function unzipToDirectory(zipBuffer: Buffer, destPath: string): Promise<void> {
  const absDest = safePath(destPath);
  await mkdir(absDest, { recursive: true });
  const directory = await unzipper.Open.buffer(zipBuffer);
  for (const file of directory.files) {
    const targetPath = join(absDest, file.path);
    // Validate each extracted path
    const rel = relativePath(targetPath);
    if (rel.startsWith('..')) continue; // Skip path traversal attempts
    if (file.type === 'Directory') {
      await mkdir(targetPath, { recursive: true });
    } else {
      await mkdir(dirname(targetPath), { recursive: true });
      const content = await file.buffer();
      await writeFile(targetPath, content);
    }
  }
}

export async function searchFiles(
  rootPath: string,
  query: string,
  maxResults: number = 50
): Promise<FileEntry[]> {
  const absRoot = safePath(rootPath);
  const results: FileEntry[] = [];
  const lowerQuery = query.toLowerCase();

  async function walk(dir: string, depth: number = 0): Promise<void> {
    if (depth > 10 || results.length >= maxResults) return;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = join(dir, entry.name);
        if (entry.name.toLowerCase().includes(lowerQuery)) {
          const stats = await stat(fullPath);
          results.push({
            name: entry.name,
            path: relativePath(fullPath),
            type: entry.isDirectory() ? 'directory' : 'file',
            size: entry.isFile() ? stats.size : undefined,
            modified: stats.mtime.toISOString(),
          });
        }
        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
        }
      }
    } catch { /* skip inaccessible dirs */ }
  }

  await walk(absRoot);
  return results;
}
