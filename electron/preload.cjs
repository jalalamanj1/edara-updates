const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('edaraDesktop', {
  isDesktop: true,
  appVersion: '1.0.2',
  openExternalWebsite: (url) => ipcRenderer.send('openExternalDeveloperWebsite', url),
  openExternalUrl: (url) => ipcRenderer.send('openExternalUrl', url),
  openFile: (filePath) => ipcRenderer.send('openFile', filePath),
  printFile: (filePath) => ipcRenderer.send('printFile', filePath),
  selectDirectory: () => ipcRenderer.sendSync('selectDirectory'),
  openMailTo: (mailtoUrl) => ipcRenderer.send('mailto', mailtoUrl),
  showItemInFolder: (filePath) => ipcRenderer.send('showItemInFolder', filePath),
  saveAttachment: (sourcePath, defaultName) => ipcRenderer.invoke('saveAttachment', { sourcePath, defaultName }),
  saveAttachmentBuffer: (buffer, defaultName) => ipcRenderer.invoke('saveAttachmentBuffer', { buffer, defaultName }),
  showNotification: (title, body, messageId) => ipcRenderer.send('showNotification', { title, body, messageId }),
  onNotificationClick: (callback) => ipcRenderer.on('notification-click', (event, data) => callback(data)),
});

