import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { spawn, ChildProcess, execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import os from 'os';
import { autoUpdater } from 'electron-updater';

// ── State ──────────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ChildProcess | null = null;
let serverStartTime: number | null = null;
let serverLogs: string[] = [];
const MAX_LOG_LINES = 5000;

// ── Single Instance Lock ───────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── Server helpers ─────────────────────────────────────────────────────────────

function getServerCwd(): string {
  // In packaged app, the server is in resources/server
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server');
  }
  // In development, the server is at ../../server relative to this file
  return path.resolve(__dirname, '../../server');
}

function appendLog(line: string): void {
  serverLogs.push(line);
  if (serverLogs.length > MAX_LOG_LINES) {
    serverLogs = serverLogs.slice(-MAX_LOG_LINES);
  }
}

function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (serverProcess) {
      resolve();
      return;
    }

    const serverCwd = getServerCwd();
    appendLog(`[desktop] Starting server in: ${serverCwd}`);

    const serverCwdResolved = serverCwd;

    // No .env is created here on purpose. On a fresh install the server boots
    // into first-run setup mode (answering /setup/status = configured:false),
    // and the dashboard's SetupWizard configures it.

    // Persist config.json + the SQLite DB in a writable, update-safe location
    // (the app bundle in /Applications is read-only and signed). The server
    // honours PROJECTX_DATA_DIR.
    const dataDir = path.join(app.getPath('userData'), 'data');
    try { fs.mkdirSync(dataDir, { recursive: true }); } catch { /* best effort */ }
    const baseEnv: NodeJS.ProcessEnv = { ...process.env, PROJECTX_DATA_DIR: dataDir };

    let spawnCmd: string;
    let spawnArgs: string[];
    let useShell = false;
    let serverEnv: NodeJS.ProcessEnv = baseEnv;

    if (app.isPackaged) {
      // Run the PRE-COMPILED server (dist/index.js) using Electron's OWN Node
      // (ELECTRON_RUN_AS_NODE). This removes any dependency on a system Node
      // install AND fixes native-module ABI mismatches: the bundled native
      // modules (better-sqlite3, node-pty, bcrypt) are rebuilt for Electron's
      // ABI at build time, and here they run against that exact same runtime.
      spawnCmd = process.execPath;
      spawnArgs = ['dist/index.js'];
      serverEnv = { ...baseEnv, ELECTRON_RUN_AS_NODE: '1' };
    } else if (process.platform === 'win32') {
      // Dev on Windows: system Node is on PATH.
      spawnCmd = 'npx';
      spawnArgs = ['tsx', 'src/index.ts'];
      useShell = true;
    } else {
      // Dev on macOS/Linux: launch through an interactive login shell so the
      // developer's PATH (nvm/fnm/Homebrew) is available.
      const loginShell = process.env.SHELL || '/bin/zsh';
      spawnCmd = loginShell;
      spawnArgs = ['-ilc', 'exec npx tsx src/index.ts'];
    }

    appendLog(`[desktop] Running: ${spawnCmd} ${spawnArgs.join(' ')} in ${serverCwdResolved} (data: ${dataDir})`);

    serverProcess = spawn(spawnCmd, spawnArgs, {
      cwd: serverCwdResolved,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: useShell,
      env: serverEnv,
    });

    serverStartTime = Date.now();

    serverProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        appendLog(`[stdout] ${text}`);
      }
    });

    serverProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        appendLog(`[stderr] ${text}`);
      }
    });

    serverProcess.on('error', (err: Error) => {
      appendLog(`[desktop] Server process error: ${err.message}`);
      serverProcess = null;
      serverStartTime = null;
    });

    serverProcess.on('exit', (code: number | null, signal: string | null) => {
      appendLog(`[desktop] Server exited with code=${code} signal=${signal}`);
      serverProcess = null;
      serverStartTime = null;
      updateTrayMenu();
    });

    // Poll /health until the server is ready
    pollServerHealth(30, 500)
      .then(() => {
        appendLog('[desktop] Server is ready.');
        updateTrayMenu();
        resolve();
      })
      .catch((err) => {
        appendLog(`[desktop] Server failed to become ready: ${err.message}`);
        reject(err);
      });
  });
}

function pollServerHealth(retries: number, intervalMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function check() {
      attempts++;
      const req = http.get('http://localhost:3000/health', (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (attempts < retries) {
          setTimeout(check, intervalMs);
        } else {
          reject(new Error(`Server returned status ${res.statusCode} after ${retries} attempts`));
        }
        res.resume(); // consume response data to free memory
      });
      req.on('error', () => {
        if (attempts < retries) {
          setTimeout(check, intervalMs);
        } else {
          reject(new Error(`Server not reachable after ${retries} attempts`));
        }
      });
      req.setTimeout(2000, () => {
        req.destroy();
        if (attempts < retries) {
          setTimeout(check, intervalMs);
        } else {
          reject(new Error(`Server health check timed out after ${retries} attempts`));
        }
      });
    }

    check();
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!serverProcess) {
      resolve();
      return;
    }

    appendLog('[desktop] Stopping server...');
    const proc = serverProcess;

    const killTimeout = setTimeout(() => {
      // Force kill if graceful shutdown takes too long
      try { proc.kill('SIGKILL'); } catch (_) { /* ignore */ }
      resolve();
    }, 5000);

    proc.once('exit', () => {
      clearTimeout(killTimeout);
      serverProcess = null;
      serverStartTime = null;
      appendLog('[desktop] Server stopped.');
      updateTrayMenu();
      resolve();
    });

    try {
      // On Windows, SIGTERM doesn't work well; use taskkill via tree-kill pattern
      if (process.platform === 'win32' && proc.pid) {
        spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], { shell: true });
      } else {
        proc.kill('SIGTERM');
      }
    } catch (_) {
      clearTimeout(killTimeout);
      serverProcess = null;
      serverStartTime = null;
      resolve();
    }
  });
}

async function restartServer(): Promise<void> {
  await stopServer();
  await startServer();
}

// ── Window ─────────────────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0F0F1A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: true,
    show: false,
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Hide to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!(app as any).isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
}

// ── Tray ───────────────────────────────────────────────────────────────────────

function updateTrayMenu(): void {
  if (!tray) return;

  const isRunning = serverProcess !== null;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: isRunning ? 'Stop Server' : 'Start Server',
      click: async () => {
        if (isRunning) {
          await stopServer();
        } else {
          await startServer();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: async () => {
        (app as any).isQuitting = true;
        await stopServer();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function createTray(): void {
  // Use a simple 16x16 tray icon (or empty if no icon file exists)
  const iconPath = path.join(__dirname, '../public/icon.png');
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch (_) {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('ProjectX Server');
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  updateTrayMenu();
}

// ── IPC Handlers ───────────────────────────────────────────────────────────────

function registerIpcHandlers(): void {
  ipcMain.handle('get-server-status', () => {
    return {
      running: serverProcess !== null,
      pid: serverProcess?.pid ?? null,
      uptime: serverStartTime ? Math.floor((Date.now() - serverStartTime) / 1000) : 0,
    };
  });

  ipcMain.handle('get-server-logs', () => {
    return serverLogs.join('\n');
  });

  ipcMain.handle('restart-server', async () => {
    await restartServer();
  });

  ipcMain.handle('open-external', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('quit-and-install', () => {
    (app as any).isQuitting = true;
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle('get-server-info', () => {
    const port = 3000;
    const urls: string[] = [`http://localhost:${port}`];
    // Enumerate LAN IPv4 addresses so the QR can encode a URL reachable from a
    // phone on the same network (before a tunnel is set up).
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const ni of ifaces[name] ?? []) {
        if (ni.family === 'IPv4' && !ni.internal) {
          urls.push(`http://${ni.address}:${port}`);
        }
      }
    }
    return { port, urls };
  });

  ipcMain.handle('select-directory', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
}

// ── Auto Updater ──────────────────────────────────────────────────────────────

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    appendLog(`[updater] Update available: v${info.version}`);
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info.version);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    appendLog(`[updater] Update downloaded: v${info.version}`);
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info.version);
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded. Restart to apply the update.`,
        buttons: ['Restart Now', 'Later'],
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    }
  });

  autoUpdater.on('error', (err) => {
    appendLog(`[updater] Error: ${err.message}`);
  });

  // Check for updates every 4 hours
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}

// ── App lifecycle ──────────────────────────────────────────────────────────────

// Track quitting state to differentiate close vs quit
(app as any).isQuitting = false;

app.on('before-quit', () => {
  (app as any).isQuitting = true;
});

app.whenReady().then(async () => {
  registerIpcHandlers();
  createTray();

  // First check if server is already running externally
  try {
    await pollServerHealth(3, 500);
    appendLog('[desktop] External server detected, connecting to it.');
  } catch {
    // Server not running, try to start it
    appendLog('[desktop] No server detected, attempting to start...');
    try {
      await startServer();
    } catch (err) {
      appendLog(`[desktop] Failed to start server: ${err}`);
      appendLog('[desktop] Opening dashboard anyway — start the server manually.');
    }
  }

  createWindow();

  // Check for updates after window is ready
  if (app.isPackaged) {
    setupAutoUpdater();
  }
});

app.on('activate', () => {
  // macOS: re-show window when dock icon is clicked
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  // Do nothing — keep running in tray
});
