import 'dotenv/config';
import { configFileExists } from './config-store.js';

// Bootstrap. On a fresh install with no data/config.json and no JWT_SECRET in
// the environment, the main app can't even start (config.ts refuses to boot
// without a strong secret). Instead of failing, we launch a minimal web setup
// server so the user can configure everything from a browser — no terminal
// required (the desktop "install and go" path). Once configured it hands off
// to the real server.
//
// When config.json exists, or JWT_SECRET is provided via env (Docker / CI /
// .env deployments), we skip setup mode and start the server normally.
async function boot(): Promise<void> {
  const hasEnvSecret = !!(process.env.JWT_SECRET && process.env.JWT_SECRET.length > 0);
  const needsSetup = !configFileExists() && !hasEnvSecret;

  if (needsSetup) {
    const { runSetupServer } = await import('./setup-server.js');
    await runSetupServer();
  } else {
    await import('./app.js');
  }
}

boot();
