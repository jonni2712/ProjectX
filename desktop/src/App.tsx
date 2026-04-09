import React, { useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { Server, Users, FolderOpen, Globe, Activity, Settings, LogOut, WifiOff, Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './AuthContext';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/Users';
import FilesPage from './pages/Files';
import TunnelPage from './pages/Tunnel';
import LogsPage from './pages/Logs';
import SettingsPage from './pages/Settings';
import SetupWizard from './pages/SetupWizard';

const navItems = [
  { to: '/', icon: Server, label: 'Dashboard' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/files', icon: FolderOpen, label: 'Files' },
  { to: '/tunnel', icon: Globe, label: 'Tunnel' },
  { to: '/logs', icon: Activity, label: 'Logs' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

function LoginScreen() {
  const { login, serverOnline } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-[#6C9EFF] text-white rounded-lg text-sm font-medium hover:bg-[#5A8BE6] transition-colors"
          >
            Retry Connection
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

function AppContent() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <LoginScreen />;

  return (
    <div className="flex h-screen bg-[#0F0F1A]">
      {/* Sidebar */}
      <aside className="w-56 bg-[#12122A] border-r border-white/5 flex flex-col">
        {/* App title + drag area */}
        <div className="drag-area h-12 flex items-center px-4 border-b border-white/5">
          <div className="no-drag flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#6C9EFF] to-[#4ECDC4] flex items-center justify-center">
              <Server size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm text-white">ProjectX</span>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-2 px-2">
          {navItems.map(({ to, icon: Icon, label }) => (
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
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-gray-400">Server running</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/tunnel" element={<TunnelPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/setup" element={<SetupWizard />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
