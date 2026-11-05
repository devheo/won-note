const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wonNoteElectron', Object.freeze({
  isElectron: true,
  platform: process.platform,
  notify: (title, body = '') => ipcRenderer.invoke('notification:send', title, body),
}));
