import {
  readdir, readFile, writeFile, mkdir, rm, rename, cp, stat, access,
} from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { resolve, join, basename, dirname, extname } from 'path';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { safePath, relativePath } from '../utils/path-guard.js';
import { config } from '../config.js';
import type { FileEntry } from '../utils/types.js';

export async function listDirectory(dirPath: string): Promise<FileEntry[]> {
  const absPath = safePath(dirPath);
  const entries = await readdir(absPath, { withFileTypes: true });

  const results: FileEntry[] = [];
  // Hide Syncthing markers, git internals, secrets, and OS junk from the listing.
  // NOTE: path-guard.ts is the real security boundary — this set only improves UX.
  const hiddenSystemFiles = new Set([
    '.stfolder', '.stignore', '.stversions',
    '.git',
    '.ssh', '.aws', '.gnupg', '.npmrc', '.netrc',
    '.DS_Store', 'Thumbs.db',
  ]);
  for (const entry of entries) {
    // Skip Syncthing markers, git, secrets, and system files
    if (hiddenSystemFiles.has(entry.name)) continue;
    // Skip .env and .env.* (common secret files)
    const lower = entry.name.toLowerCase();
    if (lower === '.env' || lower.startsWith('.env.')) continue;
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

/**
 * Open a single file for streaming rather than buffering it fully into memory.
 * Returns the read stream plus its size (for Content-Length) and resolved path
 * (for MIME sniffing). safePath validation happens here so callers can't bypass
 * it. Replaces the old readFileBinary, which readFile()'d the whole file — a few
 * concurrent serve/download of large files could exhaust the heap.
 */
export async function openFileForStreaming(
  filePath: string,
): Promise<{ stream: Readable; size: number; absPath: string }> {
  const absPath = safePath(filePath);
  const stats = await stat(absPath);
  if (!stats.isFile()) {
    throw new Error('Not a file');
  }
  return { stream: createReadStream(absPath), size: stats.size, absPath };
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

// fs.rename / fs.cp silently overwrite an existing destination on POSIX, so a
// rename/move/copy onto an occupied path destroys the victim file with no error
// and a 200 response. Guard every destination: throw a 409 (which the global
// error handler passes through with its message) when the target already exists.
async function assertNoOverwrite(targetAbsPath: string): Promise<void> {
  try {
    await access(targetAbsPath);
  } catch (e: any) {
    if (e.code === 'ENOENT') return; // free slot — safe to write
    throw e;
  }
  const err: any = new Error('Destination already exists');
  err.statusCode = 409;
  throw err;
}

export async function renameEntry(oldPath: string, newName: string): Promise<void> {
  // newName is a bare name, not a path — reject separators so a "rename" can't
  // silently relocate the file into another directory.
  if (/[/\\]/.test(newName)) {
    const err: any = new Error('New name cannot contain path separators');
    err.statusCode = 400;
    throw err;
  }
  const absOld = safePath(oldPath);
  const newPath = join(dirname(absOld), newName);
  safePath(relativePath(newPath)); // Validate new path is still in workspace
  await assertNoOverwrite(newPath);
  await rename(absOld, newPath);
}

export async function moveEntry(srcPath: string, destDir: string): Promise<void> {
  const absSrc = safePath(srcPath);
  const absDest = safePath(destDir);
  const target = join(absDest, basename(absSrc));
  safePath(relativePath(target)); // Validate
  await assertNoOverwrite(target);
  await rename(absSrc, target);
}

export async function copyEntry(srcPath: string, destPath: string): Promise<void> {
  const absSrc = safePath(srcPath);
  const absDest = safePath(destPath);
  await assertNoOverwrite(absDest);
  // errorOnExist+force:false is belt-and-suspenders against a race between the
  // check above and the copy.
  await cp(absSrc, absDest, { recursive: true, errorOnExist: true, force: false });
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

/**
 * Build a zip of a directory as a streaming archive. archiver honours
 * backpressure, so piping this straight into the HTTP reply never materializes
 * the whole archive in memory — the old zipDirectory Buffer.concat'd every chunk
 * of a potentially multi-GB directory tree before sending a single byte.
 */
export function createDirectoryZipStream(dirPath: string): ReturnType<typeof archiver> {
  const absPath = safePath(dirPath);
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.directory(absPath, basename(absPath));
  // Kick off production; archiver streams lazily under backpressure once piped.
  archive.finalize();
  return archive;
}

// Hard limits for archive extraction. A zip bomb is a small archive that
// expands to TBs of data; without these the server will fill the disk and OOM.
const MAX_EXTRACTED_TOTAL_BYTES = 500 * 1024 * 1024; // 500 MB total
const MAX_EXTRACTED_FILES = 10_000;
const MAX_EXTRACTED_FILE_BYTES = 100 * 1024 * 1024; // 100 MB per file

export async function unzipToDirectory(zipBuffer: Buffer, destPath: string): Promise<void> {
  const absDest = safePath(destPath);
  await mkdir(absDest, { recursive: true });
  const directory = await unzipper.Open.buffer(zipBuffer);

  let totalBytes = 0;
  let totalFiles = 0;

  for (const file of directory.files) {
    if (++totalFiles > MAX_EXTRACTED_FILES) {
      throw new Error(`Archive contains too many entries (max ${MAX_EXTRACTED_FILES})`);
    }

    // Note on symlinks: unzipper's type only exposes "Directory" | "File", so
    // symlinks (if present in the zip) are surfaced as plain files. writeFile
    // will write the link target as file content, NOT create a real symlink,
    // so we get safe behavior automatically.

    const targetPath = join(absDest, file.path);
    // safePath() would throw on traversal — use it instead of the previous
    // relativePath check, which silently swallowed traversal attempts.
    try {
      safePath(relativePath(targetPath));
    } catch {
      continue; // path tried to escape workspace, skip silently
    }

    if (file.type === 'Directory') {
      await mkdir(targetPath, { recursive: true });
    } else {
      // file.uncompressedSize is reported by the zip headers (untrusted, but a
      // useful early reject for obvious bombs).
      const declaredSize = (file as any).uncompressedSize ?? 0;
      if (declaredSize > MAX_EXTRACTED_FILE_BYTES) {
        throw new Error(`Archive entry "${file.path}" exceeds per-file size limit (${MAX_EXTRACTED_FILE_BYTES} bytes)`);
      }
      await mkdir(dirname(targetPath), { recursive: true });
      const content = await file.buffer();
      // Re-check the actual size in case the header lied.
      if (content.length > MAX_EXTRACTED_FILE_BYTES) {
        throw new Error(`Archive entry "${file.path}" exceeds per-file size limit when decompressed`);
      }
      totalBytes += content.length;
      if (totalBytes > MAX_EXTRACTED_TOTAL_BYTES) {
        throw new Error(`Archive total decompressed size exceeds limit (${MAX_EXTRACTED_TOTAL_BYTES} bytes)`);
      }
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
