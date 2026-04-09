interface ElectronAPI {
  platform: string;
  getServerStatus: () => Promise<{ running: boolean; pid: number | null; uptime: number }>;
  getServerLogs: () => Promise<string>;
  restartServer: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  selectDirectory: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
