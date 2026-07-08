'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { api, refreshSession, setAccessToken, Session } from '../api/client';
import type { Usuario } from '../types';

interface AuthState {
  user: Usuario | null;
  loading: boolean;
  login: (usuario: string, password: string) => Promise<Usuario>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // el access token vive solo en memoria; al recargar se renueva con la cookie
    refreshSession()
      .then((s) => setUser(s?.user ?? null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (usuario: string, password: string) => {
    const session = await api.post<Session>('/auth/login', {
      usuario,
      password,
    });
    setAccessToken(session.accessToken);
    setUser(session.user);
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
