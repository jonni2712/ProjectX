import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { Server, Users, FolderOpen, Globe, Activity, Settings, LogOut, WifiOff, Loader2, Download, ShieldAlert } from 'lucide-react';
import { AuthProvider, useAuth } from './AuthContext';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/Users';
import FilesPage from './pages/Files';
import TunnelPage from './pages/Tunnel';
import LogsPage from './pages/Logs';
import SettingsPage from './pages/Settings';
import SetupWizard from './pages/SetupWizard';

// On macOS the window uses hiddenInset traffic lights that sit over the top-left
// of the sidebar, so we pad the sidebar header to the right of them.
const isMac = typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin';

// adminOnly pages hit endpoints guarded by requireAdmin on the server (user CRUD,
// audit log, cloudflare/tunnel control, config writes). We hide them from non-admin
// users so they never see a wall of 403s, and guard the routes too (below) in case
// someone navigates by URL.
const navItems = [
  { to: '/', icon: Server, label: 'Dashboard' },
  { to: '/users', icon: Users, label: 'Users', adminOnly: true },
  { to: '/files', icon: FolderOpen, label: 'Files' },
  { to: '/tunnel', icon: Globe, label: 'Remote', adminOnly: true },
  { to: '/logs', icon: Activity, label: 'Logs', adminOnly: true },
  { to: '/settings', icon: Settings, label: 'Settings', adminOnly: true },
];

function LoginScreen() {
  const { login, serverOnline, refresh } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  async function retryConnection() {
    setRetrying(true);
    await refresh();           // re-probe the server without a full window reload
    setRetrying(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const err = await login(username, password);
    if (err) setError(err);
    setLoading(false);
  }

  if (!serverOnline) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0F0F1A]">
        <div className="bg-[#1A1A2E] rounded-2xl border border-white/5 p-10 w-96 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6">
            <WifiOff size={32} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Server Offline</h2>
          <p className="text-sm text-gray-400 mb-6">
            Cannot connect to ProjectX server at http://localhost:3000
          </p>
          <button
            onClick={retryConnection}
            disabled={retrying}
            className="px-6 py-2.5 bg-[#6C9EFF] text-white rounded-lg text-sm font-medium hover:bg-[#5A8BE6] transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {retrying && <Loader2 size={16} className="animate-spin" />}
            {retrying ? 'Connecting…' : 'Retry Connection'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen bg-[#0F0F1A]">
      <div className="bg-[#1A1A2E] rounded-2xl border border-white/5 p-10 w-96">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6C9EFF] to-[#4ECDC4] flex items-center justify-center">
            <Server size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">ProjectX</h2>
            <p className="text-xs text-gray-400">Admin Login</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-[#6C9EFF] focus:outline-none"
              placeholder="admin"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-[#6C9EFF] focus:outline-none"
              placeholder="Enter password"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-2.5 bg-[#6C9EFF] text-white rounded-lg text-sm font-medium hover:bg-[#5A8BE6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-[#0F0F1A]">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6C9EFF] to-[#4ECDC4] flex items-center justify-center mx-auto mb-4 animate-pulse">
          <Server size={24} className="text-white" />
        </div>
        <p className="text-sm text-gray-400">Connecting to server...</p>
      </div>
    </div>
  );
}

// Renders admin-only routes for non-admins as a friendly notice instead of a raw
// 403 from the underlying API calls.
function AdminGate({ isAdmin, children }: { isAdmin: boolean; children: React.ReactNode }) {
  if (isAdmin) return <>{children}</>;
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={28} className="text-amber-400" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-1">Administrator access required</h2>
        <p className="text-sm text-gray-400">This section is only available to admin accounts. Ask an administrator if you need access.</p>
      </div>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading, needsSetup, refresh, user, logout, isAdmin } = useAuth();
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI?.getAppVersion().then(setAppVersion).catch(() => {});
  }, []);

  if (isLoading) return <LoadingScreen />;
  // Fresh install: the server is up but unconfigured — run first-run setup.
  if (needsSetup) return <SetupWizard onComplete={refresh} />;
  if (!isAuthenticated) return <LoginScreen />;

  const visibleNav = navItems.filter(item => isAdmin || !item.adminOnly);

  return (
    <div className="flex h-screen bg-[#0F0F1A]">
      {/* Sidebar */}
      <aside className="w-56 bg-[#12122A] border-r border-white/5 flex flex-col">
        {/* App title + drag area (padded right of the macOS traffic lights) */}
        <div className={`drag-area h-12 flex items-center border-b border-white/5 ${isMac ? 'pl-[78px] pr-4' : 'px-4'}`}>
          <div className="no-drag flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#6C9EFF] to-[#4ECDC4] flex items-center justify-center">
              <Server size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm text-white">ProjectX</span>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-2 px-2">
          {visibleNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User + server status footer */}
        <div className="p-3 border-t border-white/5 space-y-2">
          {user && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[#6C9EFF]/20 flex items-center justify-center">
                  <span className="text-xs font-medium text-[#6C9EFF]">{user.username[0].toUpperCase()}</span>
                </div>
                <span className="text-xs text-gray-300">{user.username}</span>
              </div>
              <button onClick={logout} className="p-1 rounded hover:bg-white/10 transition-colors" title="Logout">
                <LogOut size={14} className="text-gray-400" />
              </button>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-gray-400">Server running</span>
            </div>
            {appVersion && <span className="text-xs text-gray-600">v{appVersion}</span>}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/users" element={<AdminGate isAdmin={isAdmin}><UsersPage /></AdminGate>} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/tunnel" element={<AdminGate isAdmin={isAdmin}><TunnelPage /></AdminGate>} />
          <Route path="/logs" element={<AdminGate isAdmin={isAdmin}><LogsPage /></AdminGate>} />
          <Route path="/settings" element={<AdminGate isAdmin={isAdmin}><SettingsPage /></AdminGate>} />
          <Route path="/setup" element={<SetupWizard />} />
        </Routes>
      </main>
    </div>
  );
}

// Thin bar shown on top of every screen (including first-run setup) when the
// auto-updater finds a new version. While downloading it just informs; once the
// update is downloaded it offers a one-click restart-to-update.
function UpdateBanner() {
  const [available, setAvailable] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI?.onUpdateAvailable((v) => setAvailable(v));
    window.electronAPI?.onUpdateDownloaded((v) => setDownloaded(v));
  }, []);

  if (!available && !downloaded) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-[#6C9EFF] text-[#0b0b16] text-sm px-4 py-2 flex items-center justify-center gap-3 shadow-lg">
      <Download size={15} />
      {downloaded ? (
        <>
          <span>Update {downloaded} ready.</span>
          <button
            onClick={() => window.electronAPI?.quitAndInstall()}
            className="font-semibold underline underline-offset-2 hover:opacity-80"
          >
            Restart &amp; update
          </button>
        </>
      ) : (
        <span>Update {available} available — downloading…</span>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <UpdateBanner />
      <AppContent />
    </AuthProvider>
  );
}
