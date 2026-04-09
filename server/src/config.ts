import { resolve } from 'path';
import { existsSync } from 'fs';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  workspaceRoot: resolve(process.env.WORKSPACE_ROOT || '/github'),
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  },
  auth: {
    username: process.env.AUTH_USERNAME || 'admin',
    passwordHash: process.env.AUTH_PASSWORD_HASH || '',
  },
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  rateLimit: {
    loginMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '5', 10),
    loginWindow: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW || '300000', 10),
  },
  watcherDebounce: parseInt(process.env.WATCHER_DEBOUNCE || '500', 10),
} as const;

// Validate workspace root exists
if (!existsSync(config.workspaceRoot)) {
  console.error(`WORKSPACE_ROOT does not exist: ${config.workspaceRoot}`);
  process.exit(1);
}
