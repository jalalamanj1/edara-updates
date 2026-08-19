const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;

function waitForServer(url, retries = 30, interval = 500) {
  return new Promise((resolve) => {
    const attempt = (left) => {
      if (left <= 0) return resolve();
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        setTimeout(() => attempt(left - 1), interval);
      });
    };
    attempt(retries);
  });
}

// Handle secure external URL opening
ipcMain.on('openExternalDeveloperWebsite', (event, url) => {
  const ALLOWED_URL = 'https://jalalamanj.online';
  if (url === ALLOWED_URL || (typeof url === 'string' && url.startsWith('https://jalalamanj.online'))) {
    shell.openExternal(ALLOWED_URL);
  } else {
    console.warn('[EDARA IPC] Blocked unauthorized external URL request:', url);
  }
});

// Handle generic secure (https-only) external URL opening, e.g. update downloads
ipcMain.on('openExternalUrl', (event, url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') {
      // Opens in the OS DEFAULT browser (Chrome/Edge/etc.) — never an embedded window.
      console.log('[EDARA IPC] openExternalUrl -> shell.openExternal (system browser)');
      shell.openExternal(parsed.toString());
    } else {
      console.warn('[EDARA IPC] Blocked non-https external URL request:', url);
    }
  } catch (e) {
    console.warn('[EDARA IPC] Blocked invalid external URL request:', url);
  }
});

// Open a local generated document (docx/xlsx/pdf) in its associated application
ipcMain.on('openFile', (event, filePath) => {
  try {
    if (typeof filePath !== 'string' || !filePath.trim() || !fs.existsSync(filePath)) {
      console.warn('[EDARA IPC] openFile: invalid or missing path:', filePath);
      return;
    }
    shell.openPath(filePath);
  } catch (e) {
    console.warn('[EDARA IPC] openFile failed:', e && e.message);
  }
});

// Open a mailto: link in the system default mail client
ipcMain.on('mailto', (event, mailtoUrl) => {
  try {
    if (typeof mailtoUrl !== 'string' || !mailtoUrl.trim().toLowerCase().startsWith('mailto:')) {
      console.warn('[EDARA IPC] mailto: invalid mailto URL:', mailtoUrl);
      return;
    }
    shell.openExternal(mailtoUrl);
  } catch (e) {
    console.warn('[EDARA IPC] mailto failed:', e && e.message);
  }
});

// Reveal a local file in the system file manager (so the user can attach/share it)
ipcMain.on('showItemInFolder', (event, filePath) => {
  try {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      console.warn('[EDARA IPC] showItemInFolder: invalid path:', filePath);
      return;
    }
    shell.showItemInFolder(filePath);
  } catch (e) {
    console.warn('[EDARA IPC] showItemInFolder failed:', e && e.message);
  }
});

// Open a native directory picker (synchronous IPC)
ipcMain.on('selectDirectory', (event) => {
  try {
    const result = dialog.showOpenDialogSync({
      properties: ['openDirectory', 'createDirectory'],
    });
    event.returnValue = result && result.length > 0 ? result[0] : null;
  } catch (e) {
    event.returnValue = null;
  }
});

// Send a local generated document to the default printer
// (Windows: PowerShell Start-Process -Verb Print sends the file to the
// associated app which prints it using the default printer.)
ipcMain.on('printFile', (event, filePath) => {
  try {
    if (typeof filePath !== 'string' || !filePath.trim() || !fs.existsSync(filePath)) {
      console.warn('[EDARA IPC] printFile: invalid or missing path:', filePath);
      return;
    }
    if (process.platform === 'win32') {
      const escaped = String(filePath).replace(/'/g, "''");
      spawn(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', `Start-Process -FilePath '${escaped}' -Verb Print`],
        { windowsHide: true, stdio: 'ignore' }
      );
    } else {
      shell.openPath(filePath);
    }
  } catch (e) {
    console.warn('[EDARA IPC] printFile failed:', e && e.message);
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1280,
    minHeight: 720,
    title: 'Edara',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.maximize();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const isDev = !app.isPackaged;
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomFactor(0.9);
  });

  if (isDev) {
    waitForServer('http://localhost:3000').then(() => {
      mainWindow.loadURL('http://localhost:3000');
    });
  } else {
    mainWindow.loadURL('http://localhost:3000');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
