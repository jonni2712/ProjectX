import 'dotenv/config';
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import authPlugin from './plugins/auth.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import fileRoutes from './routes/files.js';
import gitRoutes from './routes/git.js';
import projectRoutes from './routes/projects.js';
import wsHandler from './ws/handler.js';
import { startFileWatcher, stopFileWatcher } from './ws/file-watcher.js';
import { destroyAllTerminals } from './services/terminal.service.js';
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
await fastify.register(fastifyCors, {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Electron)
    if (!origin) return callback(null, true);
    // Allow localhost
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      return callback(null, true);
    }
    // Allow any https origin (tunnel domains)
    if (origin.startsWith('https://')) return callback(null, true);
    callback(new Error('CORS not allowed'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  preflight: true,
  strictPreflight: false,
});

await fastify.register(fastifyRateLimit, {
  global: false, // Only apply where configured
});

await fastify.register(fastifyMultipart, {
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB upload limit
});

await fastify.register(authPlugin);
await fastify.register(fastifyWebsocket);

// --- Error handler ---
fastify.setErrorHandler((error, request, reply) => {
  if (error instanceof PathTraversalError) {
    return reply.status(403).send({ success: false, error: 'Access denied: path outside workspace' });
  }
  fastify.log.error(error);
  reply.status(error.statusCode || 500).send({
    success: false,
    error: error.message || 'Internal server error',
  });
});

// --- Routes ---
await fastify.register(healthRoutes);
await fastify.register(authRoutes);
await fastify.register(fileRoutes);
await fastify.register(gitRoutes);
await fastify.register(projectRoutes);
await fastify.register(wsHandler);

// --- Periodic cleanup ---
setInterval(() => {
  cleanExpiredLocks();
  cleanExpiredRefreshTokens();
}, 5 * 60 * 1000); // Every 5 minutes

// --- Startup ---
try {
  await fastify.listen({ port: config.port, host: config.host });
  startFileWatcher();
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
