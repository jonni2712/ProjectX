import { FastifyInstance } from 'fastify';
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

  // Public setup-status: the real (configured) server always reports true. The
  // first-run setup server reports false at this same path, so clients can
  // detect which mode the server is in without authenticating.
  fastify.get('/setup/status', async () => ({
    success: true,
    data: { configured: true },
  }));

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
  }, async (request, reply) => {
    const { workspaceRoot, port, host } = request.body as { workspaceRoot?: string; port?: number; host?: string };
    const { existsSync } = await import('fs');
    const { loadStoredConfig, saveStoredConfig } = await import('../config-store.js');

    if (workspaceRoot !== undefined) {
      if (/[\n\r\0]/.test(workspaceRoot)) {
        return reply.status(400).send({ success: false, error: 'Invalid characters in workspaceRoot' });
      }
      if (!existsSync(workspaceRoot)) {
        return reply.status(400).send({ success: false, error: 'Workspace root does not exist' });
      }
    }
    if (host !== undefined && /[\n\r\0]/.test(host)) {
      return reply.status(400).send({ success: false, error: 'Invalid characters in host' });
    }
    if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      return reply.status(400).send({ success: false, error: 'Invalid port' });
    }

    // Persist into the real source of truth (data/config.json), not the legacy
    // .env (which is only an override and is absent on most installs).
    const stored = loadStoredConfig();
    if (workspaceRoot !== undefined) stored.workspaceRoot = workspaceRoot;
    if (port !== undefined) stored.port = port;
    if (host !== undefined) stored.host = host;
    saveStoredConfig(stored);

    return { success: true, data: { message: 'Config updated. Restart the server to apply.' } };
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
