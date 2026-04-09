import React, { useState, useEffect, useRef } from 'react';
import { Server, Users, HardDrive, Globe, QrCode, Clock, RefreshCw } from 'lucide-react';
import { api } from '../api';
import QRCode from 'qrcode';

function StatCard({ icon: Icon, label, value, color, loading }: { icon: any; label: string; value: string; color: string; loading?: boolean }) {
  return (
    <div className="bg-[#1A1A2E] rounded-xl border border-white/5 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      {loading ? (
        <div className="h-8 w-24 bg-white/5 rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-white">{value}</p>
      )}
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function Dashboard() {
  const [health, setHealth] = useState<any>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const [healthData, usersData] = await Promise.all([
        api.health(),
        api.listUsers().catch(() => []),
      ]);
      setHealth(healthData);
      setUserCount(Array.isArray(usersData) ? usersData.length : 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (canvasRef.current && health) {
      const url = health.tunnelDomain
        ? `https://${health.tunnelDomain}`
        : `http://localhost:${health.port || 3000}`;
      QRCode.toCanvas(canvasRef.current, url, {
        width: 160,
        margin: 2,
        color: { dark: '#1A1A2E', light: '#FFFFFF' },
      });
    }
  }, [health, canvasRef.current]);

  const localUrl = health ? `http://localhost:${health.port || 3000}` : 'http://localhost:3000';
  const tunnelUrl = health?.tunnelDomain ? `https://${health.tunnelDomain}` : null;
  const workspace = health?.workspaceRoot || '--';

  return (
    <div className="p-8">
      {/* Header */}
      <div className="drag-area mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">Server overview and quick actions</p>
        </div>
        <button
          onClick={fetchData}
          className="no-drag p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white"
          title="Refresh"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400 mb-6">
          {error}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard icon={Server} label="Status" value={health ? 'Online' : '--'} color="#4ECDC4" loading={loading} />
        <StatCard icon={Users} label="Users" value={userCount !== null ? String(userCount) : '--'} color="#6C9EFF" loading={loading} />
        <StatCard icon={HardDrive} label="Workspace" value={workspace} color="#FFE66D" loading={loading} />
        <StatCard icon={Clock} label="Uptime" value={health?.uptime ? formatUptime(health.uptime) : '--'} color="#4ECDC4" loading={loading} />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {/* QR Code card */}
        <div className="bg-[#1A1A2E] rounded-xl border border-white/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <QrCode size={20} className="text-[#6C9EFF]" />
            <h3 className="font-semibold text-white">Connect Mobile App</h3>
          </div>
          <p className="text-sm text-gray-400 mb-4">Scan this QR code with the ProjectX app to connect</p>
          <div className="bg-white rounded-lg p-2 w-44 h-44 mx-auto flex items-center justify-center">
            <canvas ref={canvasRef} />
          </div>
          <p className="text-xs text-gray-500 text-center mt-3 font-mono">{tunnelUrl || localUrl}</p>
        </div>

        {/* Connection info */}
        <div className="bg-[#1A1A2E] rounded-xl border border-white/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Globe size={20} className="text-[#4ECDC4]" />
            <h3 className="font-semibold text-white">Connection</h3>
          </div>
          <div className="space-y-3">
            {tunnelUrl && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Tunnel URL (use this on mobile)</p>
                <code className="text-sm text-[#4ECDC4] bg-[#0F0F1A] px-3 py-1.5 rounded-md block font-mono">
                  {tunnelUrl}
                </code>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 mb-1">Local URL</p>
              <code className="text-sm text-gray-400 bg-[#0F0F1A] px-3 py-1.5 rounded-md block font-mono">
                {localUrl}
              </code>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <p className="text-xs text-gray-500 mb-1">Version</p>
                <code className="text-sm text-[#6C9EFF] bg-[#0F0F1A] px-3 py-1.5 rounded-md block font-mono">
                  {health?.version || '--'}
                </code>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Node.js</p>
                <code className="text-sm text-[#FFE66D] bg-[#0F0F1A] px-3 py-1.5 rounded-md block font-mono">
                  {health?.nodeVersion || '--'}
                </code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
