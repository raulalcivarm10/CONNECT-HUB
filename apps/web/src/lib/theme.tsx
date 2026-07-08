'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type Tema = 'light' | 'dark';

interface ThemeState {
  tema: Tema;
  setTema: (t: Tema) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeState | null>(null);
const STORAGE_KEY = 'ch_theme';

function aplicar(tema: Tema) {
  document.documentElement.classList.toggle('dark', tema === 'dark');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [tema, setTemaState] = useState<Tema>('light');

  useEffect(() => {
    // el script inline del layout ya aplicó la clase antes de pintar;
    // aquí solo sincronizamos el estado de React
    const guardado = localStorage.getItem(STORAGE_KEY) as Tema | null;
    const preferido: Tema =
      guardado ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light');
    setTemaState(preferido);
    aplicar(preferido);
  }, []);

  const setTema = useCallback((t: Tema) => {
    setTemaState(t);
    localStorage.setItem(STORAGE_KEY, t);
    aplicar(t);
  }, []);

  const toggle = useCallback(
    () => setTema(tema === 'dark' ? 'light' : 'dark'),
    [tema, setTema],
  );

  const value = useMemo(() => ({ tema, setTema, toggle }), [tema, setTema, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  return ctx;
}
