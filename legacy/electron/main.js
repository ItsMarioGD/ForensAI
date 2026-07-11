const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const isDev = require('electron-is-dev');
const log = require('electron-log');

log.transports.file.level = 'info';
autoUpdater.logger = log;

let mainWindow = null;
let backendProcess = null;
let backendPort = 8001;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'ForensIA - Reconstrucción Forense',
    icon: path.join(__dirname, 'resources/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: !isDev
    },
    show: false,
    backgroundColor: '#020508'
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl).catch(err => {
    log.error('Failed to load URL:', err);
    dialog.showErrorBox('Error de carga', `No se pudo cargar la aplicación:\n${err.message}`);
  });

  return mainWindow;
}

function getPythonExecutable() {
  const candidates = [
    path.join(process.resourcesPath, 'python', 'python.exe'),
    path.join(process.resourcesPath, 'api', 'venv', 'Scripts', 'python.exe'),
    'python',
    'python3'
  ];

  if (isDev) {
    return 'python';
  }

  for (const candidate of candidates) {
    try {
      if (candidate === 'python' || candidate === 'python3') {
        return candidate;
      }
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {}
  }
  return 'python';
}

function getBackendScript() {
  if (isDev) {
    return path.join(__dirname, '../api/main.py');
  }
  return path.join(process.resourcesPath, 'api', 'main.py');
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const pythonExe = getPythonExecutable();
    const backendScript = getBackendScript();
    const apiDir = isDev ? path.join(__dirname, '../api') : path.join(process.resourcesPath, 'api');

    log.info(`Starting backend: ${pythonExe} -m uvicorn main:app --host 127.0.0.1 --port ${backendPort}`);
    log.info(`Working directory: ${apiDir}`);

    const env = {
      ...process.env,
      PYTHONPATH: apiDir,
      OLLAMA_ORIGINS: '*'
    };

    backendProcess = spawn(pythonExe, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', backendPort.toString()], {
      cwd: apiDir,
      env,
      windowsHide: true
    });

    backendProcess.stdout.on('data', (data) => {
      const output = data.toString();
      log.info(`[Backend] ${output.trim()}`);
      if (output.includes('Application startup complete') || output.includes('Uvicorn running on')) {
        resolve();
      }
    });

    backendProcess.stderr.on('data', (data) => {
      log.error(`[Backend Error] ${data.toString()}`);
    });

    backendProcess.on('error', (err) => {
      log.error('Backend process error:', err);
      reject(err);
    });

    backendProcess.on('exit', (code, signal) => {
      log.info(`Backend exited with code ${code}, signal ${signal}`);
      if (!isQuitting && mainWindow) {
        dialog.showErrorBox('Error del Backend', 'El servidor backend se detuvo inesperadamente. La aplicación se cerrará.');
        app.quit();
      }
    });

    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        resolve();
      }
    }, 8000);
  });
}

function stopBackend() {
  if (backendProcess) {
    log.info('Stopping backend...');
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', backendProcess.pid, '/f', '/t']);
    } else {
      backendProcess.kill('SIGTERM');
    }
    backendProcess = null;
  }
}

async function checkBackendHealth() {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`http://127.0.0.1:${backendPort}/health`, { timeout: 2000 });
    return response.ok;
  } catch {
    return false;
  }
}

async function initializeApp() {
  try {
    await startBackend();

    let healthy = false;
    for (let i = 0; i < 10; i++) {
      healthy = await checkBackendHealth();
      if (healthy) break;
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!healthy) {
      throw new Error('Backend no responde después de 10 segundos');
    }

    log.info('Backend is healthy, creating window...');
    createWindow();
  } catch (err) {
    log.error('Initialization failed:', err);
    dialog.showErrorBox('Error de inicio', `No se pudo iniciar la aplicación:\n${err.message}\n\nVerifique que Python y las dependencias estén instaladas.`);
    app.quit();
  }
}

app.whenReady().then(async () => {
  autoUpdater.checkForUpdatesAndNotify().catch(err => log.warn('Auto-updater check failed:', err));

  await initializeApp();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await initializeApp();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isQuitting = true;
    stopBackend();
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBackend();
});

ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-backend-url', () => `http://127.0.0.1:${backendPort}`);
ipcMain.handle('open-external', (_, url) => shell.openExternal(url));
ipcMain.handle('show-save-dialog', async (_, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

autoUpdater.on('update-available', () => {
  mainWindow?.webContents.send('update-available');
});

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update-downloaded');
});

ipcMain.on('restart-and-install', () => {
  autoUpdater.quitAndInstall();
});

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});