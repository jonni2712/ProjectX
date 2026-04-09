import React, { useState, useEffect } from 'react';
import { FolderOpen, Server, Shield, Loader2, RefreshCw, Save, Check } from 'lucide-react';
import { api } from '../api';

export default function SettingsPage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [workspace, setWorkspace] = useState('');
  const [port, setPort] = useState('3000');
  const [host, setHost] = useState('0.0.0.0');

  async function fetchConfig() {
    try {
      setLoading(true);
      setError(null);
      const data = await api.health();
      setHealth(data);
      setWorkspace(data.workspaceRoot || '');
      setPort(String(data.port || 3000));
      setHost(data.host || '0.0.0.0');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    try {
      setSaving(true);
      setError(null);
      setSaved(false);
      await api.updateConfig({ workspaceRoot: workspace, port: parseInt(port), host });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function selectDirectory() {
    if (window.electronAPI?.selectDirectory) {
      const dir = await window.electronAPI.selectDirectory();
      if (dir) setWorkspace(dir);
    }
  }

  useEffect(() => {
    fetchConfig();
  }, []);

  const hasChanges = health && (
    workspace !== (health.workspaceRoot || '') ||
    port !== String(health.port || 3000) ||
    host !== (health.host || '0.0.0.0')
  );

  if (loading) {
    return (
      <div className="p-8">
        <div className="drag-area mb-8">
          <h1 className="text-2xl font-bold text-white">Settings</h1>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-gray-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="drag-area flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-sm text-gray-400 mt-1">Server configuration</p>
        </div>
        <div className="no-drag flex items-center gap-2">
          <button
            onClick={fetchConfig}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white"
            title="Refresh"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400 mb-6">
          {error}
        </div>
      )}

      {saved && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 text-sm text-green-400 mb-6 flex items-center gap-2">
          <Check size={16} />
          Config saved. Restart server to apply changes.
        </div>
      )}

      <div className="space-y-6">
        {/* Workspace */}
        <div className="bg-[#1A1A2E] rounded-xl border border-white/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <FolderOpen size={20} className="text-[#FFE66D]" />
            <h3 className="font-semibold text-white">Workspace</h3>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Root Directory</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                className="flex-1 bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white font-mono focus:border-[#6C9EFF] focus:outline-none transition-colors"
              />
              <button
                onClick={selectDirectory}
                className="px-4 py-2.5 bg-[#0F0F1A] border border-white/10 rounded-lg text-sm text-gray-300 hover:bg-white/5 transition-colors"
              >
                Browse
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">All file operations will be restricted to this directory</p>
          </div>
        </div>

        {/* Server */}
        <div className="bg-[#1A1A2E] rounded-xl border border-white/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Server size={20} className="text-[#4ECDC4]" />
            <h3 className="font-semibold text-white">Server</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white font-mono focus:border-[#6C9EFF] focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Host</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white font-mono focus:border-[#6C9EFF] focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="bg-[#1A1A2E] rounded-xl border border-white/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Shield size={20} className="text-[#6C9EFF]" />
            <h3 className="font-semibold text-white">System Info</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Version</label>
              <div className="bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white font-mono">
                {health?.version || '--'}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Node.js</label>
              <div className="bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white font-mono">
                {health?.nodeVersion || '--'}
              </div>
            </div>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={saveConfig}
          disabled={!hasChanges || saving}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            hasChanges
              ? 'bg-[#6C9EFF] text-white hover:bg-[#5A8BE6]'
              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
          }`}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
