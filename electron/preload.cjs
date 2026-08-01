const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('unison', {
  platform: process.platform,
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    remove: (id) => ipcRenderer.invoke('accounts:remove', id),
    loginGoogle: (config) => ipcRenderer.invoke('accounts:google', config),
    loginMicrosoft: (config) => ipcRenderer.invoke('accounts:microsoft', config),
    loginCalDav: (config) => ipcRenderer.invoke('accounts:caldav', config),
    syncCalDav: (id) => ipcRenderer.invoke('accounts:caldav-sync', id),
    subscribeIcs: (config) => ipcRenderer.invoke('accounts:ics', config),
    syncIcs: (id) => ipcRenderer.invoke('accounts:ics-sync', id),
    syncRemote: (id) => ipcRenderer.invoke('accounts:remote-sync', id)
  },
  events: { push: (config) => ipcRenderer.invoke('events:push', config) }
});
