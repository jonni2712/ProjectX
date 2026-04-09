import { FastifyInstance, FastifyRequest } from 'fastify';
import { db } from '../db/database.js';
import { lockService } from '../services/lock.service.js';

export default async function projectRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /projects/recent
  fastify.get('/projects/recent', async () => {
    const projects = db.prepare(
      'SELECT * FROM recent_projects ORDER BY pinned DESC, last_opened DESC LIMIT 20'
    ).all();
    return { success: true, data: projects };
  });

  // POST /projects/open { path, name }
  fastify.post('/projects/open', async (request: FastifyRequest<{
    Body: { path: string; name: string }
  }>) => {
    const { path, name } = request.body;
    db.prepare(`
      INSERT INTO recent_projects (path, name, last_opened)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(path) DO UPDATE SET last_opened = datetime('now'), name = ?
    `).run(path, name, name);

    // Acquire project lock
    const lock = lockService.acquireProjectLock(path, request.user.userId);
    return { success: true, data: { lock } };
  });

  // POST /projects/pin { path }
  fastify.post('/projects/pin', async (request: FastifyRequest<{
    Body: { path: string; pinned: boolean }
  }>) => {
    const { path, pinned } = request.body;
    db.prepare('UPDATE recent_projects SET pinned = ? WHERE path = ?').run(pinned ? 1 : 0, path);
    return { success: true };
  });

  // DELETE /projects/recent?path=...
  fastify.delete('/projects/recent', async (request: FastifyRequest<{
    Querystring: { path: string }
  }>) => {
    db.prepare('DELETE FROM recent_projects WHERE path = ?').run(request.query.path);
    return { success: true };
  });

  // GET /projects/audit?limit=50
  fastify.get('/projects/audit', async (request: FastifyRequest<{
    Querystring: { limit?: string }
  }>) => {
    const limit = parseInt(request.query.limit || '50');
    const entries = db.prepare(
      'SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?'
    ).all(limit);
    return { success: true, data: entries };
  });
}
