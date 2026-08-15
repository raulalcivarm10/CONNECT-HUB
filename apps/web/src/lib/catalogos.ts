'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api/client';
import type { InstitucionRow, RolRow } from './types';

/**
 * Catálogos cacheados con react-query.
 *
 * Antes cada página los volvía a pedir en cada montaje (y el de roles incluso
 * en cada cambio de filtro de institución). Ahora comparten caché: la primera
 * página que los necesita dispara la petición y el resto la reutiliza.
 *
 * Las claves llevan el `idInstitucion` cuando el endpoint está acotado por
 * institución; `/instituciones` y `/roles` son catálogos globales (el backend
 * los acota por el token, no por query string), así que su clave no lo incluye.
 */
export const claveCatalogo = {
  instituciones: ['catalogo', 'instituciones'] as const,
  roles: (idInstitucion: number | null = null) =>
    ['catalogo', 'roles', idInstitucion] as const,
};

/** referencia estable para el fallback: evita romper memos aguas abajo */
const SIN_INSTITUCIONES: InstitucionRow[] = [];
const SIN_ROLES: RolRow[] = [];

/**
 * Catálogo de instituciones (solo superadmin).
 * @param habilitado normalmente `user.esSuper`; si es false no se pide nada.
 */
export function useInstitucionesCatalogo(habilitado = true) {
  const q = useQuery({
    queryKey: claveCatalogo.instituciones,
    queryFn: () => api.get<InstitucionRow[]>('/instituciones'),
    enabled: habilitado,
  });
  return { ...q, instituciones: q.data ?? SIN_INSTITUCIONES };
}

/** Catálogo de roles de institución. */
export function useRolesCatalogo(habilitado = true) {
  const q = useQuery({
    queryKey: claveCatalogo.roles(),
    queryFn: () => api.get<RolRow[]>('/roles'),
    enabled: habilitado,
  });
  return { ...q, roles: q.data ?? SIN_ROLES };
}
