'use strict';

const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const HOST = '127.0.0.1';
const START_TIMEOUT_MS = 90_000;

let backend = null;
let mainWindow = null;
let shuttingDown = false;
let logStream = null;

app.setAppUserModelId('org.gurujibox.desktop');
app.setName('GURUJI BOX');

if (process.env.GURUJI_USER_DATA) {
  const customUserData = path.resolve(process.env.GURUJI_USER_DATA);
  fs.mkdirSync(customUserData, { recursive: true });
  app.setPath('userData', customUserData);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function dataDir() {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function logPath() {
  return path.join(dataDir(), 'backend.log');
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, HOST, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function backendLaunch(port) {
  const executable = path.join(process.resourcesPath, 'backend', 'GurujiBackend.exe');
  if (app.isPackaged && fs.existsSync(executable)) {
    return {
      command: executable,
      args: ['--port', String(port), '--data-dir', dataDir(), '--parent-pid', String(process.pid)],
      cwd: path.dirname(executable),
    };
  }

  const backendDir = path.resolve(__dirname, '..', '..', 'backend');
  if (!fs.existsSync(path.join(backendDir, 'app', 'desktop.py'))) {
    throw new Error(`Desktop backend not found. Build it with "npm run build:backend". Looked in ${backendDir}.`);
  }
  return {
    command: process.env.GURUJI_PYTHON || 'python',
    args: [
      '-m',
      'app.desktop',
      '--port',
      String(port),
      '--data-dir',
      dataDir(),
      '--parent-pid',
      String(process.pid),
    ],
    cwd: backendDir,
  };
}

function startBackend(port) {
  const { command, args, cwd } = backendLaunch(port);
  logStream = fs.createWriteStream(logPath(), { flags: 'a' });
  logStream.write(`\n--- ${new Date().toISOString()} starting ${command} ${args.join(' ')}\n`);

  backend = spawn(command, args, {
    cwd,
    windowsHide: true,
    env: {
      ...process.env,
      GURUJI_DATA_DIR: dataDir(),
      PYTHONUNBUFFERED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backend.stdout.pipe(logStream, { end: false });
  backend.stderr.pipe(logStream, { end: false });
  backend.on('error', (error) => {
    logStream.write(`spawn error: ${error.message}\n`);
  });
  backend.on('exit', (code, signal) => {
    if (logStream) logStream.write(`backend exited code=${code} signal=${signal}\n`);
    backend = null;
    if (!shuttingDown) {
      dialog.showErrorBox(
        'GURUJI BOX stopped',
        `The learning service closed unexpectedly.\n\nTechnical details are in:\n${logPath()}`,
      );
      app.quit();
    }
  });
}

async function waitForReady(origin) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!backend) throw new Error('The learning service exited during startup.');
    try {
      const response = await fetch(`${origin}/ready`);
      if (response.ok) return;
    } catch {
      // Service not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`The learning service did not start within ${START_TIMEOUT_MS / 1000}s.`);
}

function installMenu(origin) {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open data folder',
          click: () => shell.openPath(dataDir()),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About GURUJI BOX',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'GURUJI BOX',
              message: `GURUJI BOX ${app.getVersion()}`,
              detail:
                'Offline AI learning centre for every village.\n\n' +
                `Data folder: ${dataDir()}\nService: ${origin}`,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(origin) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b5d5f',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'clipboard-read' || permission === 'clipboard-sanitized-write');
  });

  installMenu(origin);
  mainWindow.loadURL(origin);
}

function stopBackend() {
  if (!backend) return;
  const child = backend;
  backend = null;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    // Process already gone.
  }
}

app.whenReady().then(async () => {
  try {
    const port = await findFreePort();
    const origin = `http://${HOST}:${port}`;
    startBackend(port);
    await waitForReady(origin);
    createWindow(origin);
  } catch (error) {
    dialog.showErrorBox(
      'GURUJI BOX could not start',
      `${error.message}\n\nTechnical details are in:\n${logPath()}`,
    );
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && mainWindow) mainWindow.show();
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  shuttingDown = true;
  stopBackend();
  if (logStream) {
    logStream.end();
    logStream = null;
  }
});
