'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from './api/client';
import { useAuth } from './auth/auth-context';
import type { InstitucionRow } from './types';

/**
 * Filtro global de institución.
 * - Superadmin: selector visible en el topbar; null = todas las instituciones.
 * - Usuarios de institución: siempre su propia institución (la API lo impone
 *   de todos modos: cada registro se guarda con el código de su institución).
 */
interface InstitucionFilterState {
  /** null = todas (solo tiene sentido para el superadmin) */
  idInstitucion: number | null;
  setIdInstitucion: (id: number | null) => void;
  /** catálogo para el selector (solo cargado para el superadmin) */
  instituciones: InstitucionRow[];
  /** query string listo para anexar a la API: '' o '?idInstitucion=N' */
  qs: string;
  /** nombre de la institución filtrada, para mostrar qué se está viendo */
  nombreFiltro: string | null;
}

const Ctx = createContext<InstitucionFilterState | null>(null);

const STORAGE_KEY = 'ch_inst_filtro';

export function InstitucionFilterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [idInstitucion, setId] = useState<number | null>(null);
  const [instituciones, setInstituciones] = useState<InstitucionRow[]>([]);

  useEffect(() => {
    if (!user?.esSuper) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setId(Number(saved) || null);
    api
      .get<InstitucionRow[]>('/instituciones')
      .then(setInstituciones)
      .catch(() => undefined);
  }, [user?.esSuper]);

  const setIdInstitucion = (id: number | null) => {
    setId(id);
    if (id == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(id));
  };

  const value = useMemo<InstitucionFilterState>(() => {
    const efectivo = user?.esSuper ? idInstitucion : null;
    return {
      idInstitucion: efectivo,
      setIdInstitucion,
      instituciones,
      qs: efectivo != null ? `?idInstitucion=${efectivo}` : '',
      nombreFiltro:
        efectivo != null
          ? (instituciones.find((i) => i.ID_INSTITUCION === efectivo)?.NOMBRE ??
            `Institución ${efectivo}`)
          : null,
    };
  }, [user?.esSuper, idInstitucion, instituciones]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInstitucionFiltro(): InstitucionFilterState {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      'useInstitucionFiltro debe usarse dentro de <InstitucionFilterProvider>',
    );
  }
  return ctx;
}
