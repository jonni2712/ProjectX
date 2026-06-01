import React, { useState } from 'react';
import { FolderOpen, Loader2, Check } from 'lucide-react';
import { api } from '../api';

// First-run setup. Shown when the server reports configured:false. Posts to the
// server's /setup endpoint (which writes config.json + seeds the admin and then
// hands off to the real server), then polls until the server is ready and calls
// onComplete so the app switches to the login screen.
export default function SetupWizard({ onComplete }: { onComplete?: () => void }) {
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [publicOrigins, setPublicOrigins] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'form' | 'starting' | 'done'>('form');

  async function browse() {
    const dir = await window.electronAPI?.selectDirectory();
    if (dir) setWorkspaceRoot(dir);
  }

  async function waitForReady() {
    // The server writes config, seeds the admin, then restarts into normal mode.
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 700));
      try {
        const status = await api.setupStatus();
        if (status?.configured) return true;
      } catch { /* server momentarily down during handoff */ }
    }
    return false;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!workspaceRoot.trim()) return setError('Workspace root is required');
    if (adminPassword.length < 8) return setError('Password must be at least 8 characters');
    if (adminPassword !== confirm) return setError('Passwords do not match');

    setPhase('starting');
    try {
      await api.submitSetup({
        workspaceRoot: workspaceRoot.trim(),
        adminUsername: adminUsername.trim() || 'admin',
        adminPassword,
        publicOrigins: publicOrigins.trim(),
        anthropicApiKey: anthropicApiKey.trim(),
      });
      await waitForReady();
      setPhase('done');
      setTimeout(() => onComplete?.(), 800);
    } catch (err: any) {
      setError(err.message || 'Setup failed');
      setPhase('form');
    }
  }

  if (phase === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-green-400" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-1">All set!</h2>
          <p className="text-sm text-gray-400">Connecting to your server…</p>
        </div>
      </div>
    );
  }

  const busy = phase === 'starting';

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6C9EFF] to-[#4ECDC4] flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold text-white">P</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome to ProjectX</h1>
          <p className="text-sm text-gray-400 mt-2">Let's set up your remote development server</p>
        </div>

        <form onSubmit={submit} className="bg-[#1A1A2E] rounded-xl border border-white/5 p-8 space-y-5">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Workspace root</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={workspaceRoot}
                onChange={e => setWorkspaceRoot(e.target.value)}
                placeholder="/path/to/your/projects"
                className="flex-1 bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white font-mono placeholder-gray-600 focus:border-[#6C9EFF] focus:outline-none"
              />
              <button type="button" onClick={browse} className="px-3 py-2.5 bg-[#0F0F1A] border border-white/10 rounded-lg text-sm text-gray-300 hover:bg-white/5 flex items-center gap-1.5">
                <FolderOpen size={15} /> Browse
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Admin username</label>
            <input
              type="text"
              value={adminUsername}
              onChange={e => setAdminUsername(e.target.value)}
              className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-[#6C9EFF] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Password</label>
              <input
                type="password"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-[#6C9EFF] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Confirm</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-[#6C9EFF] focus:outline-none"
              />
            </div>
          </div>

          <button type="button" onClick={() => setShowAdvanced(v => !v)} className="text-xs text-gray-400 hover:text-gray-200">
            {showAdvanced ? '− Hide' : '+ Show'} advanced options
          </button>

          {showAdvanced && (
            <div className="space-y-4 pt-1">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Public origins (CORS, comma-separated)</label>
                <input
                  type="text"
                  value={publicOrigins}
                  onChange={e => setPublicOrigins(e.target.value)}
                  placeholder="https://projectx.example.com"
                  className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-[#6C9EFF] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Anthropic API key (optional)</label>
                <input
                  type="password"
                  value={anthropicApiKey}
                  onChange={e => setAnthropicApiKey(e.target.value)}
                  className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-[#6C9EFF] focus:outline-none"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 bg-[#6C9EFF] text-white rounded-lg text-sm font-medium hover:bg-[#5A8BE6] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy ? 'Setting up…' : 'Complete setup'}
          </button>
        </form>
      </div>
    </div>
  );
}
