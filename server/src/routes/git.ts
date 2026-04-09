import { FastifyInstance, FastifyRequest } from 'fastify';
import * as gitService from '../services/git.service.js';
import { audit } from '../db/database.js';

export default async function gitRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /git/status?repo=/myproject
  fastify.get('/git/status', async (request: FastifyRequest<{ Querystring: { repo: string } }>) => {
    const status = await gitService.gitStatus(request.query.repo);
    return { success: true, data: status };
  });

  // GET /git/branch?repo=/myproject
  fastify.get('/git/branch', async (request: FastifyRequest<{ Querystring: { repo: string } }>) => {
    const current = await gitService.gitCurrentBranch(request.query.repo);
    return { success: true, data: { current } };
  });

  // GET /git/branches?repo=/myproject
  fastify.get('/git/branches', async (request: FastifyRequest<{ Querystring: { repo: string } }>) => {
    const result = await gitService.gitBranches(request.query.repo);
    return { success: true, data: result };
  });

  // POST /git/checkout { repo, branch }
  fastify.post('/git/checkout', async (request: FastifyRequest<{
    Body: { repo: string; branch: string }
  }>) => {
    const { repo, branch } = request.body;
    await gitService.gitCheckout(repo, branch);
    audit(request.user.userId, 'git_checkout', repo, branch);
    return { success: true };
  });

  // POST /git/add { repo, files }
  fastify.post('/git/add', async (request: FastifyRequest<{
    Body: { repo: string; files: string[] }
  }>) => {
    const { repo, files } = request.body;
    await gitService.gitAdd(repo, files);
    return { success: true };
  });

  // POST /git/commit { repo, message, files? }
  fastify.post('/git/commit', async (request: FastifyRequest<{
    Body: { repo: string; message: string; files?: string[] }
  }>) => {
    const { repo, message, files } = request.body;
    const hash = await gitService.gitCommit(repo, message, files);
    audit(request.user.userId, 'git_commit', repo, `${hash}: ${message}`);
    return { success: true, data: { hash } };
  });

  // POST /git/push { repo, remote?, branch? }
  fastify.post('/git/push', async (request: FastifyRequest<{
    Body: { repo: string; remote?: string; branch?: string }
  }>) => {
    const { repo, remote, branch } = request.body;
    await gitService.gitPush(repo, remote, branch);
    audit(request.user.userId, 'git_push', repo);
    return { success: true };
  });

  // POST /git/pull { repo, remote?, branch? }
  fastify.post('/git/pull', async (request: FastifyRequest<{
    Body: { repo: string; remote?: string; branch?: string }
  }>) => {
    const { repo, remote, branch } = request.body;
    const summary = await gitService.gitPull(repo, remote, branch);
    audit(request.user.userId, 'git_pull', repo, summary);
    return { success: true, data: { summary } };
  });

  // GET /git/log?repo=/myproject&max=20
  fastify.get('/git/log', async (request: FastifyRequest<{
    Querystring: { repo: string; max?: string }
  }>) => {
    const { repo, max } = request.query;
    const entries = await gitService.gitLog(repo, max ? parseInt(max) : 20);
    return { success: true, data: entries };
  });

  // GET /git/diff?repo=/myproject&file=src/app.ts
  fastify.get('/git/diff', async (request: FastifyRequest<{
    Querystring: { repo: string; file?: string; staged?: string }
  }>) => {
    const { repo, file, staged } = request.query;
    const diff = staged === 'true'
      ? await gitService.gitDiffStaged(repo, file)
      : await gitService.gitDiff(repo, file);
    return { success: true, data: { diff } };
  });

  // POST /git/discard { repo, files }
  fastify.post('/git/discard', async (request: FastifyRequest<{
    Body: { repo: string; files: string[] }
  }>) => {
    const { repo, files } = request.body;
    await gitService.gitDiscard(repo, files);
    audit(request.user.userId, 'git_discard', repo, files.join(', '));
    return { success: true };
  });

  // GET /git/is-repo?path=/myproject
  fastify.get('/git/is-repo', async (request: FastifyRequest<{ Querystring: { path: string } }>) => {
    const isRepo = await gitService.gitIsRepo(request.query.path);
    return { success: true, data: { isRepo } };
  });

  // GET /git/scan-repos?path=/&depth=3
  fastify.get('/git/scan-repos', async (request: FastifyRequest<{
    Querystring: { path?: string; depth?: string }
  }>) => {
    const path = request.query.path || '/';
    const depth = request.query.depth ? parseInt(request.query.depth) : 3;
    const repos = await gitService.scanForRepos(path, depth);
    return { success: true, data: repos };
  });
}
