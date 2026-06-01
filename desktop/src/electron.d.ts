interface ElectronAPI {
  platform: string;
  getServerStatus: () => Promise<{ running: boolean; pid: number | null; uptime: number }>;
  getServerLogs: () => Promise<string>;
  restartServer: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  selectDirectory: () => Promise<string | null>;
  getServerInfo: () => Promise<{ port: number; urls: string[] }>;
  onUpdateAvailable: (cb: (version: string) => void) => void;
  onUpdateDownloaded: (cb: (version: string) => void) => void;
  quitAndInstall: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
