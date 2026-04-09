import { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { getTunnelStatus, startTunnel, stopTunnel } from '../services/tunnel.service.js';

export default async function healthRoutes(fastify: FastifyInstance) {
  // Public health check — minimal info
  fastify.get('/health', async () => {
    return {
      success: true,
      data: {
        status: 'ok',
        uptime: process.uptime(),
        version: '1.0.0',
      },
    };
  });

  // Authenticated health — full info
  fastify.get('/health/full', {
    onRequest: [fastify.authenticate],
  }, async () => {
    const tunnel = getTunnelStatus();
    return {
      success: true,
      data: {
        status: 'ok',
        uptime: process.uptime(),
        version: '1.0.0',
        nodeVersion: process.version,
        workspaceRoot: config.workspaceRoot,
        port: config.port,
        host: config.host,
        tunnelDomain: tunnel.configured ? tunnel.domain : null,
      },
    };
  });

  // POST /config/update — admin only
  fastify.post('/config/update', {
    onRequest: [fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          workspaceRoot: { type: 'string' },
          port: { type: 'number' },
          host: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<{
    Body: { workspaceRoot?: string; port?: number; host?: string }
  }>) => {
    const { workspaceRoot, port, host } = request.body;
    const { writeFileSync, readFileSync, existsSync } = await import('fs');
    const { resolve } = await import('path');
    const envPath = resolve(import.meta.dirname || '.', '../../.env');

    if (!existsSync(envPath)) {
      return { success: false, error: '.env file not found' };
    }

    // Validate no newlines in values (prevent .env injection)
    const vals = [workspaceRoot, host].filter(Boolean);
    if (vals.some(v => v && /[\n\r]/.test(v))) {
      return { success: false, error: 'Invalid characters in config value' };
    }

    let env = readFileSync(envPath, 'utf-8');
    if (workspaceRoot) env = env.replace(/WORKSPACE_ROOT=.*/, `WORKSPACE_ROOT=${workspaceRoot}`);
    if (port) env = env.replace(/PORT=.*/, `PORT=${port}`);
    if (host) env = env.replace(/HOST=.*/, `HOST=${host}`);
    writeFileSync(envPath, env, 'utf-8');

    return { success: true, data: { message: 'Config updated. Restart server to apply.' } };
  });

  // Tunnel endpoints — admin only
  fastify.get('/tunnel/status', {
    onRequest: [fastify.authenticate],
  }, async () => {
    const status = getTunnelStatus();
    return { success: true, data: status };
  });

  fastify.post('/tunnel/start', {
    onRequest: [fastify.requireAdmin],
  }, async () => {
    const result = startTunnel();
    return { success: result.success, data: result };
  });

  fastify.post('/tunnel/stop', {
    onRequest: [fastify.requireAdmin],
  }, async () => {
    const result = stopTunnel();
    return { success: result.success, data: result };
  });
}
