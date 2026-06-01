import { FastifyInstance } from 'fastify';
import {
  getCloudflareStatus,
  ensureCloudflared,
  startQuickTunnel,
  startNamedTunnel,
  stopCloudflareTunnel,
} from '../services/cloudflare.service.js';

// Automated Cloudflare tunnel control. Quick tunnels need no credentials;
// named tunnels are created via the Cloudflare API from a token the admin
// supplies. All mutating endpoints are admin-only.
export default async function cloudflareRoutes(fastify: FastifyInstance) {
  fastify.get('/cloudflare/status', {
    onRequest: [fastify.authenticate],
  }, async () => {
    return { success: true, data: getCloudflareStatus() };
  });

  fastify.post('/cloudflare/install', {
    onRequest: [fastify.requireAdmin],
  }, async () => {
    const result = await ensureCloudflared();
    return { success: result.success, data: result };
  });

  fastify.post('/cloudflare/quick-start', {
    onRequest: [fastify.requireAdmin],
  }, async () => {
    const result = await startQuickTunnel();
    return { success: result.success, data: result };
  });

  fastify.post('/cloudflare/named-start', {
    onRequest: [fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['apiToken', 'accountId', 'zoneId', 'hostname'],
        properties: {
          apiToken: { type: 'string' },
          accountId: { type: 'string' },
          zoneId: { type: 'string' },
          hostname: { type: 'string' },
          name: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const body = request.body as {
      apiToken: string;
      accountId: string;
      zoneId: string;
      hostname: string;
      name?: string;
    };
    const result = await startNamedTunnel(body);
    return { success: result.success, data: result };
  });

  fastify.post('/cloudflare/stop', {
    onRequest: [fastify.requireAdmin],
  }, async () => {
    const result = stopCloudflareTunnel();
    return { success: result.success, data: result };
  });
}
