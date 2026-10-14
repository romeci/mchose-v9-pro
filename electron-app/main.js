const {app, BrowserWindow, session, ipcMain, dialog} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 900,
    minWidth: 1024, minHeight: 720,
    title: 'MCHOSE V9 Pro — Assistente Portátil',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'wizard.html'));
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
}

app.whenReady().then(() => {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, cb) => {
    if (permission === 'hid') return cb(true);
    cb(false);
  });
  try {
    ses.setDevicePermissionHandler((details) => {
      if (details.deviceType === 'hid') return true;
      return false;
    });
  } catch (_) {}
  try {
    ses.setPermissionCheckHandler((wc, permission) => permission === 'hid' ? true : undefined);
  } catch (_) {}
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// Exportar arquivo gerado (noop/silenciado/log) — único acesso a disco
ipcMain.handle('export-file', async (e, suggestedName, b64) => {
  const r = await dialog.showSaveDialog(win, {defaultPath: path.join(os.homedir(), 'Downloads', suggestedName)});
  if (r.canceled || !r.filePath) return {ok: false};
  fs.writeFileSync(r.filePath, Buffer.from(b64, 'base64'));
  return {ok: true, path: r.filePath};
});
ipcMain.handle('get-platform', () => process.platform);
