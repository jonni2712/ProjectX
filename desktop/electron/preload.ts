import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  getServerLogs: () => ipcRenderer.invoke('get-server-logs'),
  restartServer: () => ipcRenderer.invoke('restart-server'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getServerInfo: () => ipcRenderer.invoke('get-server-info'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // Auto-update events (emitted by the main process via electron-updater).
  onUpdateAvailable: (cb: (version: string) => void) =>
    ipcRenderer.on('update-available', (_e, version: string) => cb(version)),
  onUpdateDownloaded: (cb: (version: string) => void) =>
    ipcRenderer.on('update-downloaded', (_e, version: string) => cb(version)),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
});
