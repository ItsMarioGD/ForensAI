const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
  restartAndInstall: () => ipcRenderer.send('restart-and-install'),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
};

contextBridge.exposeInMainWorld('electronAPI', api);