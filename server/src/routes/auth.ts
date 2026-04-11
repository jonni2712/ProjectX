import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { v4 as uuid } from 'uuid';
import { config } from '../config.js';
import { db, audit, getUserByUsername, getUserById, createUser, updateUser, listUsers, deleteUser, bumpTokenVersion } from '../db/database.js';
import { issueWsTicket } from '../plugins/auth.js';

const MIN_PASSWORD_LENGTH = 12;

/**
 * Returns null if the password is acceptable, or an error message string.
 * We deliberately don't enforce complex character classes (which often push
 * users toward "Password1!" patterns). Instead we just enforce a length floor —
 * 12 chars of any kind has more entropy than 8 with mixed classes.
 */
function validatePasswordStrength(password: string): string | null {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  // Reject all-same character passwords (length doesn't help "aaaaaaaaaaaa").
  if (new Set(password).size < 4) {
    return 'Password is too repetitive';
  }
  return null;
}

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /auth/login
  fastify.post('/auth/login', {
    config: {
      rateLimit: {
        max: config.rateLimit.loginMax,
        timeWindow: config.rateLimit.loginWindow,
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string };

    const user = getUserByUsername(username);
    if (!user || !user.active) {
      audit('anonymous', 'login_failed', username, 'Unknown user');
      return reply.status(401).send({ success: false, error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      audit('anonymous', 'login_failed', username, 'Bad password');
      return reply.status(401).send({ success: false, error: 'Invalid credentials' });
    }

    const token = fastify.jwt.sign({
      userId: user.id,
      username: user.username,
      role: user.role as 'admin' | 'user',
      tv: user.token_version,
    });

    // Update last_login
    updateUser(user.id, { last_login: new Date().toISOString() });

    // Generate refresh token
    const refreshToken = randomBytes(64).toString('hex');
    const refreshExpiresAt = new Date(Date.now() + parseDuration(config.jwt.refreshExpiresIn)).toISOString();
    db.prepare('INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)')
      .run(refreshToken, user.id, refreshExpiresAt);

    audit(user.id, 'login', username);

    return { success: true, data: { token, refreshToken, expiresIn: config.jwt.expiresIn, user: { id: user.id, username: user.username, role: user.role } } };
  });

  // POST /auth/refresh
  fastify.post('/auth/refresh', {
    config: {
      // Rate limit: prevent abuse of a stolen refresh token to generate unlimited JWTs.
      // Same window as login by default (5 attempts / 5 minutes).
      rateLimit: {
        max: config.rateLimit.loginMax,
        timeWindow: config.rateLimit.loginWindow,
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };

    const row = db.prepare(
      "SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > datetime('now')"
    ).get(refreshToken) as any;

    if (!row) {
      return reply.status(401).send({ success: false, error: 'Invalid or expired refresh token' });
    }

    // Look up the user to get current role
    const user = getUserById(row.user_id);
    if (!user || !user.active) {
      db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
      return reply.status(401).send({ success: false, error: 'User account is inactive' });
    }

    // Rotate refresh token
    db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
    const newRefreshToken = randomBytes(64).toString('hex');
    const refreshExpiresAt = new Date(Date.now() + parseDuration(config.jwt.refreshExpiresIn)).toISOString();
    db.prepare('INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)')
      .run(newRefreshToken, row.user_id, refreshExpiresAt);

    const token = fastify.jwt.sign({
      userId: user.id,
      username: user.username,
      role: user.role as 'admin' | 'user',
      tv: user.token_version,
    });

    return { success: true, data: { token, refreshToken: newRefreshToken } };
  });

  // POST /auth/logout — revoke current session and all refresh tokens for this user
  fastify.post('/auth/logout', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const userId = request.user.userId;
    // Bump token_version so all JWTs for this user immediately become invalid
    bumpTokenVersion(userId);
    // Wipe every refresh token for this user
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
    audit(userId, 'logout', request.user.username);
    return { success: true, data: { message: 'Logged out' } };
  });

  // POST /auth/ws-ticket (get a single-use ticket for WebSocket auth)
  fastify.post('/auth/ws-ticket', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const { userId, username } = request.user;
    const ticket = issueWsTicket(userId, username);
    return { success: true, data: { ticket } };
  });

  // GET /auth/me — return current user info
  fastify.get('/auth/me', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const user = getUserById(request.user.userId);
    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }
    return {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.created_at,
        lastLogin: user.last_login,
        active: !!user.active,
      },
    };
  });

  // PATCH /auth/password — change own password
  fastify.patch('/auth/password', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body as { currentPassword: string; newPassword: string };

    const weakness = validatePasswordStrength(newPassword);
    if (weakness !== null) {
      return reply.status(400).send({ success: false, error: weakness });
    }

    const user = getUserById(request.user.userId);
    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ success: false, error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    updateUser(user.id, { password_hash: newHash });
    // Invalidate all existing JWTs/refresh tokens after a password change
    bumpTokenVersion(user.id);
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(user.id);
    audit(user.id, 'password_changed', user.username);

    return { success: true, data: { message: 'Password updated' } };
  });

  // GET /auth/users — admin only, list all users
  fastify.get('/auth/users', {
    onRequest: [fastify.requireAdmin],
  }, async () => {
    const users = listUsers().map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      createdAt: u.created_at,
      lastLogin: u.last_login,
      active: !!u.active,
    }));
    return { success: true, data: users };
  });

  // POST /auth/users — admin only, create new user
  fastify.post('/auth/users', {
    onRequest: [fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password', 'role'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'user'] },
        },
      },
    },
  }, async (request, reply) => {
    const { username, password, role } = request.body as { username: string; password: string; role: 'admin' | 'user' };

    const weakness = validatePasswordStrength(password);
    if (weakness !== null) {
      return reply.status(400).send({ success: false, error: weakness });
    }

    const existing = getUserByUsername(username);
    if (existing) {
      return reply.status(409).send({ success: false, error: 'Username already exists' });
    }

    const id = uuid();
    const passwordHash = await bcrypt.hash(password, 12);
    createUser(id, username, passwordHash, role);
    audit(request.user.userId, 'user_created', username, `role=${role}`);

    return { success: true, data: { id, username, role } };
  });

  // PATCH /auth/users/:id — admin only, update user role or active status
  fastify.patch('/auth/users/:id', {
    onRequest: [fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['admin', 'user'] },
          active: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { role?: 'admin' | 'user'; active?: boolean };

    const user = getUserById(id);
    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    const fields: Record<string, any> = {};
    if (body.role !== undefined) fields.role = body.role;
    if (body.active !== undefined) fields.active = body.active ? 1 : 0;

    if (Object.keys(fields).length === 0) {
      return reply.status(400).send({ success: false, error: 'No fields to update' });
    }

    updateUser(id, fields);
    // Role changes or deactivation must invalidate existing JWTs
    if (body.role !== undefined || body.active === false) {
      bumpTokenVersion(id);
      db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(id);
    }
    audit(request.user.userId, 'user_updated', user.username, JSON.stringify(fields));

    return { success: true, data: { id, ...fields, active: fields.active !== undefined ? !!fields.active : undefined } };
  });

  // DELETE /auth/users/:id — admin only, deactivate user
  fastify.delete('/auth/users/:id', {
    onRequest: [fastify.requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const user = getUserById(id);
    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    deleteUser(id);
    audit(request.user.userId, 'user_deleted', user.username);

    return { success: true, data: { message: `User "${user.username}" deactivated` } };
  });
}

function parseDuration(str: string): number {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7d
  const val = parseInt(match[1]);
  switch (match[2]) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    default: return val * 1000;
  }
}
