import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import { config } from '../config.js';
import { randomBytes } from 'crypto';
import type { JwtPayload } from '../utils/types.js';

// In-memory ticket store for secure WebSocket auth
const wsTickets = new Map<string, { userId: string; username: string; expiresAt: number }>();

// Clean expired tickets every 30s
setInterval(() => {
  const now = Date.now();
  for (const [ticket, data] of wsTickets) {
    if (data.expiresAt < now) wsTickets.delete(ticket);
  }
}, 30000);

export function issueWsTicket(userId: string, username: string): string {
  const ticket = randomBytes(32).toString('hex');
  wsTickets.set(ticket, { userId, username, expiresAt: Date.now() + 60000 }); // 60s TTL
  return ticket;
}

export function validateWsTicket(ticket: string): { userId: string; username: string } | null {
  const data = wsTickets.get(ticket);
  if (!data || data.expiresAt < Date.now()) {
    wsTickets.delete(ticket);
    return null;
  }
  wsTickets.delete(ticket); // Single-use
  return { userId: data.userId, username: data.username };
}

async function authPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifyJwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: config.jwt.expiresIn },
  });

  // Decorator to protect routes
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
  });

  // Decorator to require admin role
  fastify.decorate('requireAdmin', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
      if (request.user.role !== 'admin') {
        reply.status(403).send({ success: false, error: 'Admin access required' });
      }
    } catch (err) {
      reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
  });
}

export default fp(authPlugin, { name: 'auth' });

// Type augmentation
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}
