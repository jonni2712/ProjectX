import 'dotenv/config';
import Fastify, { type FastifyError } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import { config, isOriginAllowed } from './config.js';
import authPlugin from './plugins/auth.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import fileRoutes from './routes/files.js';
import gitRoutes from './routes/git.js';
import projectRoutes from './routes/projects.js';
import cloudflareRoutes from './routes/cloudflare.js';
import wsHandler from './ws/handler.js';
import { startFileWatcher, stopFileWatcher } from './ws/file-watcher.js';
import { destroyAllTerminals } from './services/terminal.service.js';
import { killOrphanTunnel } from './services/tunnel.service.js';
import { killOrphanCloudflare, resumeTunnel } from './services/cloudflare.service.js';
import { cleanExpiredLocks, cleanExpiredRefreshTokens } from './db/database.js';
import { PathTraversalError } from './utils/path-guard.js';

const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  },
});

// --- Plugins ---
// CORS uses the shared isOriginAllowed() from config.ts. Wildcard HTTPS is
// intentionally NOT accepted — that would let any attacker site make
// credentialed requests from a victim's browser.
await fastify.register(fastifyCors, {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) return callback(null, true);
    callback(new Error('CORS not allowed'), false);
  },
  // JWT is carried in Authorization header, not cookies, so credentials can be off.
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  preflight: true,
  strictPreflight: false,
});

await fastify.register(fastifyRateLimit, {
  global: false, // Only apply where configured
  // Behind a Cloudflare tunnel every request arrives from cloudflared/loopback,
  // so the default socket-IP key would lump all clients into one bucket. Key on
  // Cloudflare's CF-Connecting-IP when present (set by Cloudflare, not
  // spoofable through the tunnel); fall back to the socket IP. We deliberately
  // do NOT trust X-Forwarded-For.
  keyGenerator: (req) => {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.length > 0 && cf.length < 64) return cf;
    return req.ip;
  },
});

await fastify.register(fastifyMultipart, {
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB upload limit
});

await fastify.register(authPlugin);
await fastify.register(fastifyWebsocket);

// --- Error handler ---
fastify.setErrorHandler((error: FastifyError, request, reply) => {
  if (error instanceof PathTraversalError) {
    return reply.status(403).send({ success: false, error: 'Access denied: path outside workspace' });
  }
  const status = error.statusCode ?? 500;
  // Never leak internal error detail (fs paths, git stderr, stack) to clients on
  // 5xx — log it server-side and return a generic message. 4xx errors (e.g.
  // schema validation) carry safe, useful messages, so those pass through.
  if (status >= 500) {
    fastify.log.error(error);
    return reply.status(status).send({ success: false, error: 'Internal server error' });
  }
  reply.status(status).send({ success: false, error: error.message || 'Request failed' });
});

// --- Routes ---
await fastify.register(healthRoutes);
await fastify.register(authRoutes);
await fastify.register(fileRoutes);
await fastify.register(gitRoutes);
await fastify.register(projectRoutes);
await fastify.register(cloudflareRoutes);
await fastify.register(wsHandler);

// --- Periodic cleanup ---
setInterval(() => {
  cleanExpiredLocks();
  cleanExpiredRefreshTokens();
}, 5 * 60 * 1000); // Every 5 minutes

// --- Startup ---
try {
  // Clean up any cloudflared tunnel left running by a previous (crashed) server.
  // Otherwise the public hostname stays alive pointing at a dead process.
  killOrphanTunnel();
  killOrphanCloudflare();

  await fastify.listen({ port: config.port, host: config.host });
  startFileWatcher();
  // Resume a previously-running named tunnel (best-effort, non-blocking).
  void resumeTunnel();
  console.log(`\n  ProjectX Server running at http://${config.host}:${config.port}`);
  console.log(`  Workspace root: ${config.workspaceRoot}\n`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

// --- Graceful shutdown ---
const shutdown = async () => {
  console.log('\nShutting down...');
  stopFileWatcher();
  destroyAllTerminals();
  await fastify.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
