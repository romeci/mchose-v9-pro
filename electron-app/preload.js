const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('mchose', {
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  exportFile: (name, b64) => ipcRenderer.invoke('export-file', name, b64),
  onHidList: (cb) => ipcRenderer.on('hid-list', (e, d) => cb(d)),
  copyText: (t) => ipcRenderer.invoke('copy-text', t),
});
