import { FastifyInstance, FastifyRequest } from 'fastify';
import {
  listDirectory, readFileContent, writeFileContent, createFile, createDirectory,
  deleteEntry, renameEntry, moveEntry, copyEntry, getFileInfo, searchFiles,
  zipDirectory, unzipToDirectory, readFileBinary,
} from '../services/filesystem.js';
import { lockService } from '../services/lock.service.js';
import { audit } from '../db/database.js';

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
    const { safePath: sp } = await import('../utils/path-guard.js');
    const { extname } = await import('path');
    const absPath = sp(path);
    const ext = extname(absPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown',
      '.xml': 'text/xml', '.ico': 'image/x-icon', '.woff': 'font/woff',
      '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4',
      '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const buffer = await readFileBinary(path);
    reply.header('Content-Type', contentType);
    reply.header('Access-Control-Allow-Origin', '*');
    return reply.send(buffer);
  });

  // GET /files/download?path=/src/app.ts
  fastify.get('/files/download', async (request: FastifyRequest<{ Querystring: { path: string } }>, reply) => {
    const { path } = request.query;
    const info = await getFileInfo(path);
    if (info.type === 'directory') {
      const buffer = await zipDirectory(path);
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="${info.name}.zip"`);
      return reply.send(buffer);
    }
    const buffer = await readFileBinary(path);
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="${info.name}"`);
    return reply.send(buffer);
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
  }>) => {
    const { path, content } = request.body;
    const userId = request.user.userId;

    // Check lock
    if (lockService.isLocked(path, userId)) {
      return { success: false, error: 'File is locked by another user' };
    }

    await writeFileContent(path, content);
    audit(userId, 'file_update', path);
    return { success: true };
  });

  // DELETE /files/delete?path=...
  fastify.delete('/files/delete', async (request: FastifyRequest<{ Querystring: { path: string } }>) => {
    const { path } = request.query;
    const userId = request.user.userId;

    if (lockService.isLocked(path, userId)) {
      return { success: false, error: 'File is locked by another user' };
    }

    await deleteEntry(path);
    audit(userId, 'file_delete', path);
    return { success: true };
  });

  // POST /files/rename { path, newName }
  fastify.post('/files/rename', async (request: FastifyRequest<{
    Body: { path: string; newName: string }
  }>) => {
    const { path, newName } = request.body;
    await renameEntry(path, newName);
    audit(request.user.userId, 'file_rename', path, `→ ${newName}`);
    return { success: true };
  });

  // POST /files/move { srcPath, destDir }
  fastify.post('/files/move', async (request: FastifyRequest<{
    Body: { srcPath: string; destDir: string }
  }>) => {
    const { srcPath, destDir } = request.body;
    await moveEntry(srcPath, destDir);
    audit(request.user.userId, 'file_move', srcPath, `→ ${destDir}`);
    return { success: true };
  });

  // POST /files/copy { srcPath, destPath }
  fastify.post('/files/copy', async (request: FastifyRequest<{
    Body: { srcPath: string; destPath: string }
  }>) => {
    const { srcPath, destPath } = request.body;
    await copyEntry(srcPath, destPath);
    audit(request.user.userId, 'file_copy', srcPath, `→ ${destPath}`);
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

    // Check if zip and should extract
    if ((request.query as any).extract === 'true' && data.filename.endsWith('.zip')) {
      await unzipToDirectory(buffer, destPath);
      audit(request.user.userId, 'file_upload_extract', destPath, data.filename);
    } else {
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
    const buffer = await zipDirectory(path);
    const info = await getFileInfo(path);
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${info.name}.zip"`);
    return reply.send(buffer);
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
