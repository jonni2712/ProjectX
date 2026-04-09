import { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { getTunnelStatus, startTunnel, stopTunnel } from '../services/tunnel.service.js';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
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

  // POST /config/update — update server config (requires server restart)
  fastify.post('/config/update', async (request: FastifyRequest<{
    Body: { workspaceRoot?: string; port?: number; host?: string }
  }>) => {
    const { workspaceRoot, port, host } = request.body;
    const { writeFileSync, readFileSync, existsSync } = await import('fs');
    const { resolve } = await import('path');
    const envPath = resolve(import.meta.dirname || '.', '../../.env');

    if (!existsSync(envPath)) {
      return { success: false, error: '.env file not found' };
    }

    let env = readFileSync(envPath, 'utf-8');
    if (workspaceRoot) env = env.replace(/WORKSPACE_ROOT=.*/, `WORKSPACE_ROOT=${workspaceRoot}`);
    if (port) env = env.replace(/PORT=.*/, `PORT=${port}`);
    if (host) env = env.replace(/HOST=.*/, `HOST=${host}`);
    writeFileSync(envPath, env, 'utf-8');

    return { success: true, data: { message: 'Config updated. Restart server to apply.' } };
  });

  fastify.get('/tunnel/status', async () => {
    const status = getTunnelStatus();
    return { success: true, data: status };
  });

  fastify.post('/tunnel/start', async () => {
    const result = startTunnel();
    return { success: result.success, data: result };
  });

  fastify.post('/tunnel/stop', async () => {
    const result = stopTunnel();
    return { success: result.success, data: result };
  });
}
