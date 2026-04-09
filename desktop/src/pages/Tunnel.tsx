import React, { useState, useEffect, useCallback } from 'react';
import { Globe, Check, AlertCircle, ExternalLink, RefreshCw, Loader2 } from 'lucide-react';
import { api } from '../api';

interface TunnelStatus {
  configured: boolean;
  running: boolean;
  domain: string | null;
  tunnelId: string | null;
}

export default function TunnelPage() {
  const [status, setStatus] = useState<TunnelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.tunnelStatus();
      setStatus(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch tunnel status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleToggle = async () => {
    if (!status || toggling) return;
    setToggling(true);
    try {
      if (status.running) {
        await api.tunnelStop();
      } else {
        await api.tunnelStart();
      }
      // Wait a moment for the process to start/stop, then refresh
      setTimeout(fetchStatus, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to toggle tunnel');
    } finally {
      setToggling(false);
    }
  };

  const running = status?.running ?? false;
  const configured = status?.configured ?? false;

  return (
    <div className="p-8">
      <div className="drag-area mb-8">
        <h1 className="text-2xl font-bold text-white">Cloudflare Tunnel</h1>
        <p className="text-sm text-gray-400 mt-1">Access your server from anywhere</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertCircle size={18} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Status card */}
      <div className="bg-[#1A1A2E] rounded-xl border border-white/5 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${running ? 'bg-green-500/15' : 'bg-gray-500/15'}`}>
              {loading ? (
                <Loader2 size={24} className="text-gray-400 animate-spin" />
              ) : (
                <Globe size={24} className={running ? 'text-green-400' : 'text-gray-500'} />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-white">
                {loading ? 'Checking...' : running ? 'Tunnel Active' : 'Tunnel Inactive'}
              </h3>
              <p className="text-sm text-gray-400">
                {loading
                  ? 'Fetching tunnel status'
                  : running
                    ? 'Your server is accessible from the internet'
                    : configured
                      ? 'Tunnel is configured but not running'
                      : 'No tunnel configuration found'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchStatus}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
              title="Refresh status"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={handleToggle}
              disabled={!configured || toggling || loading}
              className={`relative w-12 h-7 rounded-full transition-colors ${
                !configured || loading
                  ? 'bg-gray-700 opacity-50 cursor-not-allowed'
                  : running
                    ? 'bg-[#4ECDC4]'
                    : 'bg-gray-600'
              }`}
            >
              {toggling ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 size={14} className="text-white animate-spin" />
                </div>
              ) : (
                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${running ? 'left-6' : 'left-1'}`} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Connection info */}
      {status && (
        <div className="bg-[#1A1A2E] rounded-xl border border-white/5 p-6 mb-6">
          <h3 className="font-semibold text-white mb-4">Connection Details</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-sm text-gray-400">Status</span>
              <span className={`text-sm font-medium flex items-center gap-1.5 ${running ? 'text-green-400' : 'text-gray-500'}`}>
                <span className={`w-2 h-2 rounded-full ${running ? 'bg-green-400' : 'bg-gray-500'}`} />
                {running ? 'Running' : 'Stopped'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-sm text-gray-400">Domain</span>
              {status.domain ? (
                <a
                  href={`https://${status.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#6C9EFF] hover:underline flex items-center gap-1"
                >
                  {status.domain}
                  <ExternalLink size={12} />
                </a>
              ) : (
                <span className="text-sm text-gray-500">Not configured</span>
              )}
            </div>
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-sm text-gray-400">Tunnel ID</span>
              <span className="text-sm text-gray-300 font-mono">
                {status.tunnelId || 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-400">Configuration</span>
              <span className={`text-sm flex items-center gap-1.5 ${configured ? 'text-green-400' : 'text-yellow-400'}`}>
                {configured ? <Check size={14} /> : <AlertCircle size={14} />}
                {configured ? 'Valid' : 'Missing'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="bg-[#1A1A2E] rounded-xl border border-white/5 p-6">
        <h3 className="font-semibold text-white mb-3">About Cloudflare Tunnel</h3>
        <p className="text-sm text-gray-400 leading-relaxed">
          Cloudflare Tunnel creates a secure, outbound-only connection between your server and Cloudflare's network.
          When active, your ProjectX server is accessible at your configured domain without exposing any ports
          or requiring a public IP address.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <a
            href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#6C9EFF] hover:underline flex items-center gap-1"
          >
            Learn more
            <ExternalLink size={10} />
          </a>
        </div>
      </div>
    </div>
  );
}
