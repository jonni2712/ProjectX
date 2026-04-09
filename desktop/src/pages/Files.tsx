import React, { useState, useEffect } from 'react';
import { FolderOpen, File, Folder, ChevronRight, ArrowLeft, Loader2, RefreshCw, Home } from 'lucide-react';
import { api } from '../api';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  extension?: string;
}

function formatSize(bytes?: number): string {
  if (bytes == null) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function FilesPage() {
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchFiles(path: string) {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listFiles(path);
      const entries = Array.isArray(data) ? data : (data?.files || data?.entries || []);
      // Sort: folders first, then files, alphabetically
      entries.sort((a: FileEntry, b: FileEntry) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
      });
      setFiles(entries);
      setCurrentPath(path);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFiles('/');
  }, []);

  function navigateTo(folderName: string) {
    const newPath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;
    fetchFiles(newPath);
  }

  function navigateUp() {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parent = parts.length === 0 ? '/' : '/' + parts.join('/');
    fetchFiles(parent);
  }

  function navigateToBreadcrumb(index: number) {
    const parts = currentPath.split('/').filter(Boolean);
    const path = index < 0 ? '/' : '/' + parts.slice(0, index + 1).join('/');
    fetchFiles(path);
  }

  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <div className="p-8">
      <div className="drag-area flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Files</h1>
          <p className="text-sm text-gray-400 mt-1">Browse workspace files</p>
        </div>
        <button
          onClick={() => fetchFiles(currentPath)}
          className="no-drag p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white"
          title="Refresh"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 mb-4 bg-[#1A1A2E] rounded-lg border border-white/5 px-4 py-2.5">
        <button
          onClick={navigateUp}
          disabled={currentPath === '/'}
          className="p-1 rounded hover:bg-white/10 transition-colors text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed mr-2"
        >
          <ArrowLeft size={16} />
        </button>
        <button
          onClick={() => navigateToBreadcrumb(-1)}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <Home size={14} />
        </button>
        {pathParts.map((part, i) => (
          <React.Fragment key={i}>
            <ChevronRight size={14} className="text-gray-600" />
            <button
              onClick={() => navigateToBreadcrumb(i)}
              className={`text-sm transition-colors ${
                i === pathParts.length - 1
                  ? 'text-white font-medium'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {part}
            </button>
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400 mb-4">
          {error}
        </div>
      )}

      {/* File list */}
      <div className="bg-[#1A1A2E] rounded-xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 size={24} className="animate-spin text-gray-500 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Loading files...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="p-12 text-center">
            <FolderOpen size={48} className="text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">This folder is empty</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">Name</th>
                <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">Size</th>
                <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">Modified</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file, i) => (
                <tr
                  key={i}
                  className={`border-b border-white/5 transition-colors ${
                    file.type === 'directory' ? 'hover:bg-white/[0.04] cursor-pointer' : 'hover:bg-white/[0.02]'
                  }`}
                  onClick={() => file.type === 'directory' && navigateTo(file.name)}
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      {file.type === 'directory' ? (
                        <Folder size={18} className="text-[#FFE66D]" />
                      ) : (
                        <File size={18} className="text-gray-400" />
                      )}
                      <span className={`text-sm ${file.type === 'directory' ? 'text-white font-medium' : 'text-gray-300'}`}>
                        {file.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className="text-sm text-gray-500 font-mono">
                      {file.type === 'directory' ? '--' : formatSize(file.size)}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span className="text-sm text-gray-500">
                      {file.modified ? new Date(file.modified).toLocaleDateString() : '--'}
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
