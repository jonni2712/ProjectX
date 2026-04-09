import React, { useState, useEffect } from 'react';
import { Users as UsersIcon, Plus, Shield, User, MoreHorizontal, Trash2, Edit3, X, Loader2, RefreshCw, Power } from 'lucide-react';
import { api } from '../api';

interface UserItem {
  id: string;
  username: string;
  role: 'admin' | 'user';
  active: boolean;
  lastLogin: string | null;
  createdAt?: string;
}

function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.createUser(username, password, role);
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#1A1A2E] rounded-2xl border border-white/10 p-8 w-[420px]">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">Create User</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-[#6C9EFF] focus:outline-none"
              placeholder="johndoe"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-[#6C9EFF] focus:outline-none"
              placeholder="Min 6 characters"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-[#6C9EFF] focus:outline-none"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-white/5 text-gray-300 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="flex-1 py-2.5 bg-[#6C9EFF] text-white rounded-lg text-sm font-medium hover:bg-[#5A8BE6] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [actionMenu, setActionMenu] = useState<string | null>(null);

  async function fetchUsers() {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handleToggleActive(user: UserItem) {
    try {
      await api.updateUser(user.id, { active: !user.active });
      fetchUsers();
    } catch (e: any) {
      setError(e.message);
    }
    setActionMenu(null);
  }

  async function handleToggleRole(user: UserItem) {
    try {
      await api.updateUser(user.id, { role: user.role === 'admin' ? 'user' : 'admin' });
      fetchUsers();
    } catch (e: any) {
      setError(e.message);
    }
    setActionMenu(null);
  }

  async function handleDelete(user: UserItem) {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try {
      await api.deleteUser(user.id);
      fetchUsers();
    } catch (e: any) {
      setError(e.message);
    }
    setActionMenu(null);
  }

  return (
    <div className="p-8">
      <div className="drag-area flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-sm text-gray-400 mt-1">Manage server access</p>
        </div>
        <div className="no-drag flex items-center gap-2">
          <button
            onClick={fetchUsers}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#6C9EFF] text-white rounded-lg text-sm font-medium hover:bg-[#5A8BE6] transition-colors"
          >
            <Plus size={16} />
            Add User
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400 mb-6">
          {error}
        </div>
      )}

      {/* Users table */}
      <div className="bg-[#1A1A2E] rounded-xl border border-white/5 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">User</th>
              <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">Role</th>
              <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">Status</th>
              <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">Last Login</th>
              <th className="text-left text-xs text-gray-500 font-medium px-6 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <Loader2 size={24} className="animate-spin text-gray-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Loading users...</p>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <p className="text-sm text-gray-500">No users found</p>
                </td>
              </tr>
            ) : (
              users.map(user => (
                <tr key={user.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#6C9EFF]/20 flex items-center justify-center">
                        <span className="text-sm font-medium text-[#6C9EFF]">{user.username[0].toUpperCase()}</span>
                      </div>
                      <span className="text-sm font-medium text-white">{user.username}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.role === 'admin'
                        ? 'bg-[#6C9EFF]/15 text-[#6C9EFF]'
                        : 'bg-[#4ECDC4]/15 text-[#4ECDC4]'
                    }`}>
                      {user.role === 'admin' ? <Shield size={12} /> : <User size={12} />}
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${user.active ? 'bg-green-400' : 'bg-gray-500'}`} />
                      <span className="text-sm text-gray-400">{user.active ? 'Active' : 'Inactive'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-400">{user.lastLogin || 'Never'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="relative">
                      <button
                        onClick={() => setActionMenu(actionMenu === user.id ? null : user.id)}
                        className="p-1 rounded hover:bg-white/10 transition-colors"
                      >
                        <MoreHorizontal size={16} className="text-gray-400" />
                      </button>

                      {actionMenu === user.id && (
                        <div className="absolute right-0 top-8 bg-[#12122A] border border-white/10 rounded-lg shadow-xl py-1 w-48 z-10">
                          <button
                            onClick={() => handleToggleRole(user)}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 transition-colors"
                          >
                            <Edit3 size={14} />
                            {user.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                          </button>
                          <button
                            onClick={() => handleToggleActive(user)}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 transition-colors"
                          >
                            <Power size={14} />
                            {user.active ? 'Deactivate' : 'Activate'}
                          </button>
                          <div className="border-t border-white/5 my-1" />
                          <button
                            onClick={() => handleDelete(user)}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 size={14} />
                            Delete User
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateUserDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchUsers(); }}
        />
      )}
    </div>
  );
}
