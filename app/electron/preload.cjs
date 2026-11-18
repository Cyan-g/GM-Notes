// The only bridge between the pages and the computer: a few named calls, nothing else.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dndesk', {
  read: (root, rel) => ipcRenderer.invoke('fs:read', root, rel),
  write: (root, rel, bytes) => ipcRenderer.invoke('fs:write', root, rel, bytes),
  list: (root, rel) => ipcRenderer.invoke('fs:list', root, rel),
  remove: (root, rel) => ipcRenderer.invoke('fs:remove', root, rel),
  getFolder: root => ipcRenderer.invoke('folder:get', root),
  pickFolder: root => ipcRenderer.invoke('folder:pick', root),
  showFolder: root => ipcRenderer.invoke('app:show-folder', root),
  info: () => ipcRenderer.invoke('app:info'),
  open: url => ipcRenderer.invoke('app:open', url),
  onUpdate: cb => ipcRenderer.on('update', (_e, info) => cb(info)),
  installUpdate: () => ipcRenderer.invoke('update:install'),
})
