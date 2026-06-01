import React, { useState, useEffect, useCallback } from 'react';
import { Globe, AlertCircle, ExternalLink, RefreshCw, Loader2, QrCode, Power, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '../api';

interface CfStatus {
  installed: boolean;
  running: boolean;
  mode: 'quick' | 'named' | null;
  url: string | null;
  hostname: string | null;
}

export default function TunnelPage() {
  const [status, setStatus] = useState<CfStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showNamed, setShowNamed] = useState(false);
  const [named, setNamed] = useState({ apiToken: '', accountId: '', zoneId: '', hostname: '' });

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.cloudflareStatus();
      setStatus(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch remote-access status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    window.electronAPI?.getServerInfo().then(info => setLanUrls(info.urls)).catch(() => {});
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // The URL a phone should connect to: the live tunnel if up, else a LAN address.
  const pairingUrl =
    (status?.running && status?.url) ? status.url
    : (lanUrls.find(u => !u.includes('localhost')) || lanUrls[0] || 'http://localhost:3000');

  // Render the pairing QR. Payload matches what the mobile app parses
  // ({name,url}); a plain URL would also work.
  useEffect(() => {
    let cancelled = false;
    const payload = JSON.stringify({ name: 'ProjectX', url: pairingUrl });
    QRCode.toDataURL(payload, { width: 220, margin: 1, color: { dark: '#0F0F1A', light: '#FFFFFF' } })
      .then(d => { if (!cancelled) setQrDataUrl(d); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [pairingUrl]);

  async function quickStart() {
    setBusy(true); setError(null);
    try {
      await api.cloudflareQuickStart();
      setTimeout(fetchStatus, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to start the tunnel');
    } finally {
      setBusy(false);
    }
  }

  async function namedStart(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.cloudflareNamedStart(named);
      setShowNamed(false);
      setTimeout(fetchStatus, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to create the named tunnel');
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true); setError(null);
    try {
      await api.cloudflareStop();
      setTimeout(fetchStatus, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to stop the tunnel');
    } finally {
      setBusy(false);
    }
  }

  const running = status?.running ?? false;

  return (
    <div className="p-8 max-w-3xl">
      <div className="drag-area mb-8">
        <h1 className="text-2xl font-bold text-white">Remote Access</h1>
        <p className="text-sm text-gray-400 mt-1">Reach your server from your phone, anywhere</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertCircle size={18} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Pairing QR */}
      <div className="bg-[#1A1A2E] rounded-xl border border-white/5 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Smartphone size={18} className="text-[#4ECDC4]" />
          <h3 className="font-semibold text-white">Pair a device</h3>
        </div>
        <div className="flex items-center gap-6">
          <div className="bg-white rounded-xl p-3 shrink-0">
            {qrDataUrl
              ? <img src={qrDataUrl} alt="Pairing QR" width={180} height={180} />
              : <div className="w-[180px] h-[180px] flex items-center justify-center"><QrCode size={48} className="text-gray-300" /></div>}
          </div>
          <div className="text-sm text-gray-400">
            <p className="mb-3">Open the ProjectX app on your phone and scan this code to add this server.</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">URL</span>
              <code className="text-xs text-[#6C9EFF] break-all">{pairingUrl}</code>
            </div>
            {!running && (
              <p className="text-xs text-yellow-400/80 mt-3">
                This is a local-network address. Enable remote access below to get a public URL that works anywhere.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Remote access control */}
      <div className="bg-[#1A1A2E] rounded-xl border border-white/5 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${running ? 'bg-green-500/15' : 'bg-gray-500/15'}`}>
              {loading ? <Loader2 size={22} className="text-gray-400 animate-spin" /> : <Globe size={22} className={running ? 'text-green-400' : 'text-gray-500'} />}
            </div>
            <div>
              <h3 className="font-semibold text-white">{running ? 'Remote access on' : 'Remote access off'}</h3>
              <p className="text-sm text-gray-400">
                {running
                  ? `${status?.mode === 'named' ? 'Named tunnel' : 'Quick tunnel'} active`
                  : 'Your server is only reachable on the local network'}
              </p>
            </div>
          </div>
          <button onClick={fetchStatus} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white" title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>

        {running && status?.url && (
          <div className="flex items-center justify-between py-2 px-3 mb-4 bg-[#0F0F1A] rounded-lg">
            <a href={status.url} target="_blank" rel="noopener noreferrer" className="text-sm text-[#6C9EFF] hover:underline flex items-center gap-1.5 break-all">
              {status.url} <ExternalLink size={12} />
            </a>
          </div>
        )}

        {running ? (
          <button onClick={stop} disabled={busy} className="flex items-center gap-2 px-4 py-2.5 bg-red-500/15 text-red-300 rounded-lg text-sm font-medium hover:bg-red-500/25 disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />} Turn off remote access
          </button>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button onClick={quickStart} disabled={busy} className="flex items-center gap-2 px-5 py-2.5 bg-[#6C9EFF] text-white rounded-lg text-sm font-medium hover:bg-[#5A8BE6] disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />} Enable (quick tunnel)
            </button>
            <button onClick={() => setShowNamed(v => !v)} disabled={busy} className="px-5 py-2.5 bg-[#0F0F1A] border border-white/10 text-gray-300 rounded-lg text-sm hover:bg-white/5 disabled:opacity-50">
              Use my own domain
            </button>
          </div>
        )}

        {!running && showNamed && (
          <form onSubmit={namedStart} className="mt-5 space-y-3 border-t border-white/5 pt-5">
            <p className="text-xs text-gray-400">Create a persistent tunnel on your Cloudflare domain. Needs an API token with Tunnel + DNS edit permissions.</p>
            {(['hostname', 'apiToken', 'accountId', 'zoneId'] as const).map(field => (
              <input
                key={field}
                type={field === 'apiToken' ? 'password' : 'text'}
                value={named[field]}
                onChange={e => setNamed({ ...named, [field]: e.target.value })}
                placeholder={{
                  hostname: 'Hostname (e.g. dev.yourdomain.com)',
                  apiToken: 'Cloudflare API token',
                  accountId: 'Account ID',
                  zoneId: 'Zone ID',
                }[field]}
                className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-[#6C9EFF] focus:outline-none"
              />
            ))}
            <button type="submit" disabled={busy || !named.hostname || !named.apiToken || !named.accountId || !named.zoneId} className="flex items-center gap-2 px-5 py-2.5 bg-[#4ECDC4] text-[#0b0b16] rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />} Create &amp; start
            </button>
          </form>
        )}

        {!status?.installed && !running && (
          <p className="text-xs text-gray-500 mt-4">cloudflared isn't installed yet — it will be downloaded automatically the first time you enable remote access.</p>
        )}
      </div>
    </div>
  );
}
