'use strict';

/**
 * Electron main process.
 *
 * In production the app is a packaged Next.js "standalone" server: we spawn it on a
 * free localhost port (using Electron's bundled Node via ELECTRON_RUN_AS_NODE), wait
 * until it answers, then load it into a Chromium BrowserWindow. Running a real server
 * — rather than loading static files — is required because the app has server-side API
 * routes (/api/profile, /api/games, /api/explorer) that proxy Lichess and Chess.com.
 */

const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

const isDev = !app.isPackaged;
const DEV_URL = process.env.ELECTRON_DEV_URL || 'http://localhost:3000';

let mainWindow = null;
let serverProcess = null;

// A single instance only — a second launch focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitForServer(url, timeoutMs = 40_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      request.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error('The internal server did not become ready in time.'));
        } else {
          setTimeout(attempt, 300);
        }
      });
    };
    attempt();
  });
}

async function startServer() {
  if (isDev) return DEV_URL;

  const port = await findFreePort();
  const serverDir = path.join(process.resourcesPath, 'app-standalone');
  const serverEntry = path.join(serverDir, 'server.js');

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: serverDir,
    env: {
      ...process.env,
      // Make the Electron binary behave as a plain Node runtime for the server.
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
    },
    stdio: 'ignore',
    windowsHide: true,
  });

  serverProcess.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start internal server:', err);
  });

  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  return url;
}

function errorPage(message) {
  const safe = String(message).replace(/[<>&]/g, '');
  return `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!doctype html><html><body style="background:#07090f;color:#e8ecf5;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><h1 style="font-weight:600">Chess Studio could not start</h1><p style="color:#98a3ba;max-width:34rem">${safe}</p></div></body></html>`,
  )}`;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: '#07090f',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The renderer only ever loads our own localhost origin.
      sandbox: false,
    },
  });

  Menu.setApplicationMenu(null);

  // External links (Lichess game links, etc.) open in the user's real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://127.0.0.1') && !url.startsWith('http://localhost')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  try {
    const url = await startServer();
    await mainWindow.loadURL(url);
  } catch (err) {
    await mainWindow.loadURL(errorPage(err instanceof Error ? err.message : String(err)));
    mainWindow.show();
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
}

app.on('before-quit', stopServer);
app.on('quit', stopServer);
process.on('exit', stopServer);
