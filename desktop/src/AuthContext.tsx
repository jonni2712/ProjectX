import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, setOnUnauthenticated } from './api';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { username: string; role: string } | null;
  serverOnline: boolean;
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false, isLoading: true, user: null, serverOnline: false
  });

  useEffect(() => {
    checkServer();
    // Register a hook so api.ts can force the UI back to login if the server
    // ever rejects our token (revoked from another device, deactivated, etc.)
    setOnUnauthenticated(() => {
      setState(s => ({ ...s, isAuthenticated: false, user: null }));
    });
    return () => setOnUnauthenticated(null);
  }, []);

  async function checkServer() {
    try {
      await api.ping();
      setState(s => ({ ...s, isLoading: false, serverOnline: true }));
    } catch {
      setState(s => ({ ...s, isLoading: false, serverOnline: false }));
    }
  }

  async function login(username: string, password: string) {
    try {
      const data = await api.login(username, password);
      setState(s => ({ ...s, isAuthenticated: true, user: data.user }));
      return null;
    } catch (e: any) {
      return e.message;
    }
  }

  async function logout() {
    // Tell the server to revoke our session BEFORE clearing local state. This
    // bumps token_version so any other device still holding our JWT is kicked.
    await api.logout();
    setState(s => ({ ...s, isAuthenticated: false, user: null }));
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
