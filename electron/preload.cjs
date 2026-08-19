const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('edaraDesktop', {
  isDesktop: true,
  appVersion: '1.0.0',
  openExternalWebsite: (url) => ipcRenderer.send('openExternalDeveloperWebsite', url),
  openExternalUrl: (url) => ipcRenderer.send('openExternalUrl', url),
  openFile: (filePath) => ipcRenderer.send('openFile', filePath),
  printFile: (filePath) => ipcRenderer.send('printFile', filePath),
  selectDirectory: () => ipcRenderer.sendSync('selectDirectory'),
  openMailTo: (mailtoUrl) => ipcRenderer.send('mailto', mailtoUrl),
  showItemInFolder: (filePath) => ipcRenderer.send('showItemInFolder', filePath),
});

