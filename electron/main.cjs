const { app, BrowserWindow, ipcMain, shell, dialog, Notification, Tray, Menu, nativeTheme } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');
const fs = require('fs');
const { spawn } = require('child_process');

// Force light theme - never inherit system dark mode
nativeTheme.themeSource = 'light';

let mainWindow = null;
let tray = null;
let isQuitting = false;

// ─── Backend state machine ──────────────────────────────────────────────────
// NOT_STARTED → STARTING → RUNNING → STOPPING → STOPPED
//                             ↓
//                           FAILED
let backendState = 'NOT_STARTED';
let backendStartupPromise = null;

// ─── Single instance lock ───────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log(`[EDARA INSTANCE] pid=${process.pid} lock NOT acquired, quitting`);
  app.quit();
} else {
  console.log(`[EDARA INSTANCE] pid=${process.pid} lock acquired`);
  app.on('second-instance', () => {
    console.log(`[EDARA INSTANCE] pid=${process.pid} second instance detected`);
    restoreMainWindow();
  });

  // ─── Lifecycle (only runs for the single instance) ──────────────────────
  app.whenReady().then(async () => {
    console.log(`[EDARA STARTUP] pid=${process.pid} packaged=${app.isPackaged} userData=${app.getPath('userData')} appPath=${app.getAppPath()} cwd=${process.cwd()}`);
    const backendReady = await startBackend();
    if (!backendReady) {
      dialog.showErrorBox(
        'Edara',
        'تعذر تشغيل الخادم. تأكد أن المنفذ 3000 غير مستخدم من برنامج آخر.\n\nFailed to start the server. Port 3000 may be in use by another application.'
      );
      app.quit();
      return;
    }

    createWindow();
    createTray();

    app.on('activate', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        restoreMainWindow();
      } else {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    // Keep app alive in tray on Windows/Linux
  });

  app.on('before-quit', async () => {
    if (isQuitting) return; // prevent re-entry
    isQuitting = true;
    await stopBackend();
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });
}

// ─── Restore MainWindow (hidden/minimized) ─────────────────────────────────
function restoreMainWindow() {
  console.log(`[EDARA INSTANCE] pid=${process.pid} restoring existing window`);

  if (!mainWindow || mainWindow.isDestroyed()) {
    console.log(`[EDARA INSTANCE] pid=${process.pid} mainWindow unavailable, skipping restore`);
    return;
  }

  if (mainWindow.isMinimized()) {
    console.log(`[EDARA INSTANCE] pid=${process.pid} window was minimized -> restore()`);
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    console.log(`[EDARA INSTANCE] pid=${process.pid} window was hidden -> show()`);
    mainWindow.show();
  }

  // On Windows, temporarily set alwaysOnTop to force the window to the foreground
  if (process.platform === 'win32') {
    mainWindow.setAlwaysOnTop(true);
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();
    mainWindow.setAlwaysOnTop(false);
  } else {
    mainWindow.focus();
    mainWindow.moveTop();
  }

  console.log(`[EDARA INSTANCE] pid=${process.pid} window focused`);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
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

function waitForHealth(url, retries = 40, interval = 500) {
  return new Promise((resolve) => {
    const attempt = (left) => {
      if (left <= 0) return resolve(false);
      const req = http.get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            setTimeout(() => attempt(left - 1), interval);
          }
        });
      });
      req.on('error', () => {
        setTimeout(() => attempt(left - 1), interval);
      });
      req.setTimeout(3000, () => {
        req.destroy();
        setTimeout(() => attempt(left - 1), interval);
      });
    };
    attempt(retries);
  });
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close(() => resolve(false));
    });
    server.listen(port, '127.0.0.1');
  });
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────
ipcMain.on('openExternalDeveloperWebsite', (event, url) => {
  const ALLOWED_URL = 'https://jalalamanj.online';
  if (url === ALLOWED_URL || (typeof url === 'string' && url.startsWith('https://jalalamanj.online'))) {
    shell.openExternal(ALLOWED_URL);
  }
});

ipcMain.on('openExternalUrl', (event, url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') {
      shell.openExternal(parsed.toString());
    }
  } catch {}
});

ipcMain.on('openFile', (event, filePath) => {
  try {
    if (typeof filePath === 'string' && filePath.trim() && fs.existsSync(filePath)) {
      shell.openPath(filePath);
    }
  } catch {}
});

ipcMain.on('mailto', (event, mailtoUrl) => {
  try {
    if (typeof mailtoUrl === 'string' && mailtoUrl.trim().toLowerCase().startsWith('mailto:')) {
      shell.openExternal(mailtoUrl);
    }
  } catch {}
});

ipcMain.on('showItemInFolder', (event, filePath) => {
  try {
    if (typeof filePath === 'string' && filePath.trim()) {
      shell.showItemInFolder(filePath);
    }
  } catch {}
});

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

ipcMain.handle('saveAttachment', async (event, { sourcePath, defaultName }) => {
  try {
    if (typeof sourcePath !== 'string' || !sourcePath.trim() || !fs.existsSync(sourcePath)) {
      return { success: false, error: 'الملف المصدر غير موجود.' };
    }
    const safeDefault = typeof defaultName === 'string' && defaultName.trim() ? defaultName.trim() : 'attachment';
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const result = await dialog.showSaveDialog(win || undefined, {
      defaultPath: safeDefault,
      title: 'حفظ المرفق',
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    fs.copyFileSync(sourcePath, result.filePath);
    return { success: true, filePath: result.filePath };
  } catch (e) {
    return { success: false, error: (e && e.message) || 'فشل حفظ المرفق.' };
  }
});

ipcMain.handle('saveAttachmentBuffer', async (event, { buffer, defaultName }) => {
  try {
    if (!buffer || buffer.byteLength === 0) {
      return { success: false, error: 'المرفق فارغ.' };
    }
    const safeDefault = typeof defaultName === 'string' && defaultName.trim() ? defaultName.trim() : 'attachment';
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const result = await dialog.showSaveDialog(win || undefined, {
      defaultPath: safeDefault,
      title: 'حفظ المرفق',
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    fs.writeFileSync(result.filePath, Buffer.from(buffer));
    return { success: true, filePath: result.filePath };
  } catch (e) {
    return { success: false, error: (e && e.message) || 'فشل حفظ المرفق.' };
  }
});

ipcMain.on('printFile', (event, filePath) => {
  try {
    if (typeof filePath !== 'string' || !filePath.trim() || !fs.existsSync(filePath)) return;
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
  } catch {}
});

ipcMain.on('showNotification', (event, { title, body, messageId }) => {
  try {
    if (typeof title !== 'string' || !title.trim()) return;
    const notification = new Notification({
      title: title.trim(),
      body: (typeof body === 'string' && body.trim()) || '',
      silent: false,
    });
    notification.on('click', () => {
      restoreMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('notification-click', { messageId: messageId || null });
      }
    });
    notification.show();
  } catch {}
});

// ─── Auto-Update: Download, Install & Restart ────────────────────────────────
let updateDownloadAbort = null;

ipcMain.on('cancelUpdateDownload', () => {
  if (updateDownloadAbort) {
    updateDownloadAbort.abort();
    updateDownloadAbort = null;
  }
});

ipcMain.handle('downloadUpdate', async (event, { url }) => {
  if (!url || typeof url !== 'string') return { success: false, error: 'Invalid URL' };

  const https = url.startsWith('https') ? require('https') : require('http');
  const tempDir = app.getPath('temp');
  const fileName = `Edara-Setup-${Date.now()}.exe`;
  const destPath = path.join(tempDir, fileName);

  updateDownloadAbort = new AbortController();

  return new Promise((resolve) => {
    const doRequest = (requestUrl) => {
      const mod = requestUrl.startsWith('https') ? require('https') : require('http');
      const req = mod.get(requestUrl, { signal: updateDownloadAbort.signal }, (res) => {
        // Follow redirects (301, 302, 307, 308)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doRequest(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          resolve({ success: false, error: `HTTP ${res.statusCode}` });
          return;
        }
        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        const fileStream = fs.createWriteStream(destPath);

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (mainWindow && !mainWindow.isDestroyed()) {
            const progress = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
            mainWindow.webContents.send('update-download-progress', { progress, downloadedBytes, totalBytes });
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            updateDownloadAbort = null;
            resolve({ success: true, filePath: destPath });
          });
        });

        fileStream.on('error', (err) => {
          updateDownloadAbort = null;
          try { fs.unlinkSync(destPath); } catch {}
          resolve({ success: false, error: err.message });
        });
      });

      req.on('error', (err) => {
        updateDownloadAbort = null;
        resolve({ success: false, error: err.message });
      });

      req.on('abort', () => {
        updateDownloadAbort = null;
        try { fs.unlinkSync(destPath); } catch {}
        resolve({ success: false, canceled: true });
      });
    };

    doRequest(url);
  });
});

ipcMain.handle('installUpdate', async (event, { filePath }) => {
  if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) {
    return { success: false, error: 'Installer not found' };
  }

  try {
    isQuitting = true;

    // Spawn the NSIS installer silently
    const child = spawn(filePath, ['/S'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();

    // Give the installer a moment to attach, then quit
    setTimeout(() => {
      if (tray) {
        tray.destroy();
        tray = null;
      }
      app.quit();
    }, 500);

    return { success: true };
  } catch (err) {
    isQuitting = false;
    return { success: false, error: err.message || 'Failed to start installer' };
  }
});

// ─── Tray ───────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Edara');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'فتح Edara',
      click: () => {
        console.log(`[EDARA INSTANCE] pid=${process.pid} tray restore requested`);
        restoreMainWindow();
      },
    },
    { type: 'separator' },
    {
      label: 'خروج',
      click: async () => {
        isQuitting = true;
        await stopBackend();
        if (tray) {
          tray.destroy();
          tray = null;
        }
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    console.log(`[EDARA INSTANCE] pid=${process.pid} tray double-click restore`);
    restoreMainWindow();
  });
}

// ─── Window ─────────────────────────────────────────────────────────────────
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

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomFactor(0.9);
  });

  // Close to tray instead of quitting
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      console.log(`[EDARA INSTANCE] pid=${process.pid} close-to-tray`);
      e.preventDefault();
      mainWindow.hide();
    } else {
      console.log(`[EDARA INSTANCE] pid=${process.pid} real quit requested`);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  waitForServer('http://127.0.0.1:3000').then(() => {
    if (mainWindow) {
      mainWindow.loadURL('http://127.0.0.1:3000');
    }
  });
}

// ─── Backend (packaged only) ────────────────────────────────────────────────
async function stopBackend() {
  if (backendState === 'STOPPING' || backendState === 'STOPPED' || backendState === 'NOT_STARTED') return;
  backendState = 'STOPPING';
  console.log(`[EDARA SHUTDOWN] pid=${process.pid} state=STOPPING`);

  // Clear the update check interval
  try {
    if (globalThis.__edaraUpdateInterval) {
      clearInterval(globalThis.__edaraUpdateInterval);
      globalThis.__edaraUpdateInterval = null;
    }
  } catch {}

  // Use the server's own shutdown function (handles DB save, DB close, server close)
  try {
    if (globalThis.__edaraShutdownServer) {
      await globalThis.__edaraShutdownServer();
    } else if (globalThis.__edaraHttpServer) {
      globalThis.__edaraHttpServer.closeAllConnections ? globalThis.__edaraHttpServer.closeAllConnections() : null;
      globalThis.__edaraHttpServer.close();
      globalThis.__edaraHttpServer = null;
    }
  } catch {}

  backendState = 'STOPPED';
  console.log(`[EDARA SHUTDOWN] pid=${process.pid} state=STOPPED`);
}

async function startBackend() {
  if (!app.isPackaged) return true;
  if (backendState === 'RUNNING') return true;
  if (backendState === 'STARTING' && backendStartupPromise) return backendStartupPromise;

  backendState = 'STARTING';
  console.log(`[EDARA STARTUP] pid=${process.pid} backendState=STARTING`);

  backendStartupPromise = (async () => {
    try {
      // Check if port 3000 is already in use
      const portInUse = await isPortInUse(3000);
      console.log(`[EDARA STARTUP] pid=${process.pid} port3000_in_use=${portInUse}`);
      if (portInUse) {
        // Port occupied — might be another Edara instance or another app
        // Try to reach the health endpoint
        try {
          const healthy = await new Promise((resolve) => {
            const req = http.get('http://127.0.0.1:3000/api/health', (res) => {
              res.resume();
              resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.setTimeout(2000, () => { req.destroy(); resolve(false); });
          });
          console.log(`[EDARA STARTUP] pid=${process.pid} existing_edara_healthy=${healthy}`);
          if (healthy) {
            // Another Edara instance is running — don't start another
            backendState = 'RUNNING';
            return true;
          }
        } catch {}
        // Port occupied by unrelated app
        console.log(`[EDARA STARTUP] pid=${process.pid} backendState=FAILED (port occupied by unrelated app)`);
        backendState = 'FAILED';
        return false;
      }

      const appPath = app.getAppPath();
      const dataDir = path.join(app.getPath('userData'), 'edara_data');
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch {}

      process.env.EDARA_DATA_DIR = dataDir;
      process.env.NODE_ENV = 'production';

      // Embedded env vars for the packaged server
      if (!process.env.VITE_SUPABASE_URL) process.env.VITE_SUPABASE_URL = 'https://oegdoqbmlvsgyafrlauv.supabase.co';
      if (!process.env.VITE_SUPABASE_ANON_KEY) process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_ieRNqSr-WSRfbRIceX7nug_l_KoeUDA';
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = '';
      if (!process.env.GOOGLE_APPS_SCRIPT_URL) process.env.GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbztnkuzpH5j_vObLnIFbi4woVdpvaOJT8850V-bH4J1HUzxB_C6ZPsSAix0ABBH_4Sb/exec';

      // Also attempt to load .env from the packaged app directory as a fallback
      try {
        const envPath = path.join(appPath, '.env');
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf8');
          for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) process.env[key] = val;
          }
        }
      } catch {}

      process.env.EDARA_DIST_DIR = path.join(appPath, 'dist');
      process.env.EDARA_TEMPLATES_DIR = path.join(appPath, 'templates');
      try {
        process.chdir(app.getPath('userData'));
      } catch {}

      // Load the server (runs startServer() which calls app.listen())
      console.log(`[EDARA STARTUP] pid=${process.pid} loading server.cjs...`);
      require(path.join(appPath, 'dist', 'server.cjs'));

      // Wait for the server to be healthy
      console.log(`[EDARA STARTUP] pid=${process.pid} waiting for health check...`);
      const ready = await waitForHealth('http://127.0.0.1:3000/api/health');
      console.log(`[EDARA STARTUP] pid=${process.pid} health_check=${ready}`);
      if (!ready) {
        console.log(`[EDARA STARTUP] pid=${process.pid} backendState=FAILED (health check timeout)`);
        backendState = 'FAILED';
        return false;
      }

      backendState = 'RUNNING';
      console.log(`[EDARA STARTUP] pid=${process.pid} backendState=RUNNING`);
      return true;
    } catch (err) {
      backendState = 'FAILED';
      return false;
    }
  })();

  return backendStartupPromise;
}
