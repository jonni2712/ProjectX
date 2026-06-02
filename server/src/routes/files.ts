import { FastifyInstance, FastifyRequest } from 'fastify';
import { extname } from 'path';
import {
  listDirectory, readFileContent, writeFileContent, createFile, createDirectory,
  deleteEntry, renameEntry, moveEntry, copyEntry, getFileInfo, searchFiles,
  createDirectoryZipStream, unzipToDirectory, openFileForStreaming,
} from '../services/filesystem.js';
import { lockService } from '../services/lock.service.js';
import { audit } from '../db/database.js';

// Build a safe Content-Disposition value. A raw filename containing a quote,
// backslash, or CR/LF could break the header or inject a second header; we emit
// a sanitized ASCII fallback plus an RFC 5987 UTF-8 form for the real name.
function contentDisposition(name: string): string {
  const asciiFallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export default async function fileRoutes(fastify: FastifyInstance) {
  // All file routes require auth
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /files/list?path=/
  fastify.get('/files/list', async (request: FastifyRequest<{ Querystring: { path?: string } }>) => {
    const dirPath = request.query.path || '/';
    const entries = await listDirectory(dirPath);

    // Annotate with lock info
    for (const entry of entries) {
      const lock = lockService.getLock(entry.path);
      if (lock) {
        entry.locked = true;
        entry.lockedBy = lock.userId;
      }
    }

    return { success: true, data: entries };
  });

  // GET /files/read?path=/src/app.ts
  fastify.get('/files/read', async (request: FastifyRequest<{ Querystring: { path: string } }>) => {
    const { path } = request.query;
    const result = await readFileContent(path);
    return { success: true, data: result };
  });

  // GET /files/serve?path=/project/index.html — serve file with correct MIME type for preview
  fastify.get('/files/serve', async (request: FastifyRequest<{ Querystring: { path: string } }>, reply) => {
    const { path } = request.query;
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown',
      '.xml': 'text/xml', '.ico': 'image/x-icon', '.woff': 'font/woff',
      '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4',
      '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
    };
    // Stream the file instead of buffering it — large media previews no longer
    // pin the whole file in heap.
    const { stream, size, absPath } = await openFileForStreaming(path);
    const ext = extname(absPath).toLowerCase();
    reply.header('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    reply.header('Content-Length', size);
    // No wildcard CORS here — workspace file bytes must follow the same origin
    // policy as the rest of the API (handled by the global CORS plugin).
    return reply.send(stream);
  });

  // GET /files/download?path=/src/app.ts
  fastify.get('/files/download', async (request: FastifyRequest<{ Querystring: { path: string } }>, reply) => {
    const { path } = request.query;
    const info = await getFileInfo(path);
    if (info.type === 'directory') {
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', contentDisposition(`${info.name}.zip`));
      // Streamed archive (chunked) — never materializes the whole zip in memory.
      return reply.send(createDirectoryZipStream(path));
    }
    const { stream, size } = await openFileForStreaming(path);
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Length', size);
    reply.header('Content-Disposition', contentDisposition(info.name));
    return reply.send(stream);
  });

  // POST /files/create { path, content?, isDirectory? }
  fastify.post('/files/create', async (request: FastifyRequest<{
    Body: { path: string; content?: string; isDirectory?: boolean }
  }>) => {
    const { path, content, isDirectory } = request.body;
    if (isDirectory) {
      await createDirectory(path);
    } else {
      await createFile(path, content || '');
    }
    audit(request.user.userId, 'file_create', path);
    return { success: true };
  });

  // PUT /files/update { path, content }
  fastify.put('/files/update', async (request: FastifyRequest<{
    Body: { path: string; content: string }
  }>, reply) => {
    const { path, content } = request.body;
    const userId = request.user.userId;

    // Locked by someone else → 409 so clients can't mistake it for success.
    if (lockService.isLocked(path, userId)) {
      return reply.status(409).send({ success: false, error: 'File is locked by another user' });
    }

    await writeFileContent(path, content);
    audit(userId, 'file_update', path);
    return { success: true };
  });

  // DELETE /files/delete?path=...
  fastify.delete('/files/delete', async (request: FastifyRequest<{ Querystring: { path: string } }>, reply) => {
    const { path } = request.query;
    const userId = request.user.userId;

    if (lockService.isLocked(path, userId)) {
      return reply.status(409).send({ success: false, error: 'File is locked by another user' });
    }

    await deleteEntry(path);
    audit(userId, 'file_delete', path);
    return { success: true };
  });

  // POST /files/rename { path, newName }
  fastify.post('/files/rename', async (request: FastifyRequest<{
    Body: { path: string; newName: string }
  }>, reply) => {
    const { path, newName } = request.body;
    const userId = request.user.userId;
    if (lockService.isLocked(path, userId)) {
      return reply.status(409).send({ success: false, error: 'File is locked by another user' });
    }
    await renameEntry(path, newName);
    // The lock should follow the file to its new path.
    const renamedTo = path.replace(/\/+$/, '').replace(/[^/]+$/, '') + newName;
    lockService.relocateLock(path, renamedTo);
    audit(userId, 'file_rename', path, `→ ${newName}`);
    return { success: true };
  });

  // POST /files/move { srcPath, destDir }
  fastify.post('/files/move', async (request: FastifyRequest<{
    Body: { srcPath: string; destDir: string }
  }>, reply) => {
    const { srcPath, destDir } = request.body;
    const userId = request.user.userId;
    if (lockService.isLocked(srcPath, userId)) {
      return reply.status(409).send({ success: false, error: 'File is locked by another user' });
    }
    await moveEntry(srcPath, destDir);
    const base = srcPath.replace(/\/+$/, '').split('/').filter(Boolean).pop() || '';
    lockService.relocateLock(srcPath, destDir.replace(/\/+$/, '') + '/' + base);
    audit(userId, 'file_move', srcPath, `→ ${destDir}`);
    return { success: true };
  });

  // POST /files/copy { srcPath, destPath }
  fastify.post('/files/copy', async (request: FastifyRequest<{
    Body: { srcPath: string; destPath: string }
  }>, reply) => {
    const { srcPath, destPath } = request.body;
    const userId = request.user.userId;
    // Don't overwrite a destination locked by someone else.
    if (lockService.isLocked(destPath, userId)) {
      return reply.status(409).send({ success: false, error: 'Destination is locked by another user' });
    }
    await copyEntry(srcPath, destPath);
    audit(userId, 'file_copy', srcPath, `→ ${destPath}`);
    return { success: true };
  });

  // GET /files/info?path=...
  fastify.get('/files/info', async (request: FastifyRequest<{ Querystring: { path: string } }>) => {
    const { path } = request.query;
    const info = await getFileInfo(path);
    const lock = lockService.getLock(info.path);
    if (lock) {
      info.locked = true;
      info.lockedBy = lock.userId;
    }
    return { success: true, data: info };
  });

  // GET /files/search?path=/&query=app
  fastify.get('/files/search', async (request: FastifyRequest<{
    Querystring: { path?: string; query: string; max?: string }
  }>) => {
    const { path, query, max } = request.query;
    const results = await searchFiles(path || '/', query, max ? parseInt(max) : 50);
    return { success: true, data: results };
  });

  // POST /files/upload (multipart)
  fastify.post('/files/upload', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ success: false, error: 'No file uploaded' });
    }
    const destPath = (request.query as any).path || '/';
    const fullPath = destPath.endsWith('/') ? destPath + data.filename : destPath;

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const userId = request.user.userId;
    // Check if zip and should extract
    if ((request.query as any).extract === 'true' && data.filename.endsWith('.zip')) {
      if (lockService.isLocked(destPath, userId)) {
        return reply.status(409).send({ success: false, error: 'Target directory is locked by another user' });
      }
      await unzipToDirectory(buffer, destPath);
      audit(userId, 'file_upload_extract', destPath, data.filename);
    } else {
      if (lockService.isLocked(fullPath, userId)) {
        return reply.status(409).send({ success: false, error: 'Target file is locked by another user' });
      }
      const { writeFile } = await import('fs/promises');
      const { safePath } = await import('../utils/path-guard.js');
      const { dirname } = await import('path');
      const { mkdir } = await import('fs/promises');
      const absPath = safePath(fullPath);
      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, buffer);
      audit(request.user.userId, 'file_upload', fullPath, `${buffer.length} bytes`);
    }

    return { success: true };
  });

  // POST /files/zip { path }
  fastify.post('/files/zip', async (request: FastifyRequest<{
    Body: { path: string }
  }>, reply) => {
    const { path } = request.body;
    const info = await getFileInfo(path);
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', contentDisposition(`${info.name}.zip`));
    // Streamed archive — see /files/download.
    return reply.send(createDirectoryZipStream(path));
  });

  // --- Lock endpoints ---

  // POST /files/lock { path, type? }
  fastify.post('/files/lock', async (request: FastifyRequest<{
    Body: { path: string; type?: 'file' | 'project'; ttlMinutes?: number }
  }>) => {
    const { path, type, ttlMinutes } = request.body;
    const userId = request.user.userId;

    const lock = type === 'project'
      ? lockService.acquireProjectLock(path, userId, ttlMinutes)
      : lockService.acquireFileLock(path, userId, ttlMinutes);

    if (!lock) {
      return { success: false, error: 'Resource is already locked by another user' };
    }

    audit(userId, 'lock_acquire', path, type || 'file');
    return { success: true, data: lock };
  });

  // DELETE /files/lock?path=...
  fastify.delete('/files/lock', async (request: FastifyRequest<{ Querystring: { path: string } }>) => {
    const { path } = request.query;
    const released = lockService.releaseLock(path, request.user.userId);
    if (released) {
      audit(request.user.userId, 'lock_release', path);
    }
    return { success: true, data: { released } };
  });

  // POST /files/lock/refresh { path }
  fastify.post('/files/lock/refresh', async (request: FastifyRequest<{
    Body: { path: string; ttlMinutes?: number }
  }>) => {
    const { path, ttlMinutes } = request.body;
    const refreshed = lockService.refreshLock(path, request.user.userId, ttlMinutes);
    return { success: true, data: { refreshed } };
  });

  // GET /files/locks?path=...
  fastify.get('/files/locks', async (request: FastifyRequest<{ Querystring: { path: string } }>) => {
    const { path } = request.query;
    const locks = lockService.getLocksForProject(path);
    return { success: true, data: locks };
  });
}
