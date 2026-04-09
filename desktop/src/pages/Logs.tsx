import React, { useState, useEffect, useRef } from 'react';
import { Activity, RefreshCw, Loader2 } from 'lucide-react';
import { api } from '../api';

interface AuditEntry {
  id?: string;
  timestamp: string;
  user?: string;
  username?: string;
  action: string;
  target?: string;
  details?: string;
  ip?: string;
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

export default function LogsPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchLogs() {
    try {
      setError(null);
      const data = await api.getAuditLog(100);
      setLogs(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 10000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh]);

  return (
    <div className="p-8">
      <div className="drag-area flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Activity Logs</h1>
          <p className="text-sm text-gray-400 mt-1">Monitor server activity</p>
        </div>
        <div className="no-drag flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded border-white/10"
            />
            Auto-refresh
          </label>
          <button
            onClick={() => { setLoading(true); fetchLogs(); }}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400 mb-6">
          {error}
        </div>
      )}

      <div className="bg-[#1A1A2E] rounded-xl border border-white/5 overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="p-12 text-center">
            <Loader2 size={24} className="animate-spin text-gray-500 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Loading logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <Activity size={48} className="text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No activity logs yet</p>
            <p className="text-sm text-gray-500 mt-1">Actions will appear here as they happen</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">Timestamp</th>
                <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">User</th>
                <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">Action</th>
                <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">Target</th>
                <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={log.id || i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-3">
                    <span className="text-xs text-gray-400 font-mono">{formatTimestamp(log.timestamp)}</span>
                  </td>
                  <td className="px-6 py-3">
                    <span className="text-sm text-gray-300">{log.username || log.user || '--'}</span>
                  </td>
                  <td className="px-6 py-3">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-[#6C9EFF]/15 text-[#6C9EFF]">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span className="text-sm text-gray-400 font-mono">{log.target || '--'}</span>
                  </td>
                  <td className="px-6 py-3">
                    <span className="text-sm text-gray-500 truncate block max-w-[200px]">
                      {log.details || log.ip || '--'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
