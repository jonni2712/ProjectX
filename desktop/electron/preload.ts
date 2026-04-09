import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  getServerLogs: () => ipcRenderer.invoke('get-server-logs'),
  restartServer: () => ipcRenderer.invoke('restart-server'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
});
