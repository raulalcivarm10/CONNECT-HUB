/** Comunidad/chat por evento (auth). */
import { useQuery } from '@tanstack/react-query';
import type {
  ComunidadFeed,
  ComunidadMensaje,
  ComunidadResumen,
  PersonaResumen,
} from '@connecthub/shared-types';
import { apiGet, apiPost } from './client';

/** Hub: mis comunidades = eventos con entrada. */
export function useMisComunidades() {
  return useQuery({
    queryKey: ['mis-comunidades'],
    queryFn: () => apiGet<ComunidadResumen[]>('/public/comunidad/mis-comunidades', undefined, true),
    staleTime: 15_000,
  });
}

/** Muro de la comunidad de un evento. */
export function useComunidad(idEvento: number | null) {
  return useQuery({
    queryKey: ['comunidad', idEvento],
    enabled: idEvento != null,
    queryFn: () => apiGet<ComunidadFeed>('/public/comunidad', { idEvento, size: 50 }, true),
    staleTime: 10_000,
  });
}

/** Participantes de la comunidad de un evento (solo perfiles públicos). */
export function useMiembrosComunidad(idEvento: number | null) {
  return useQuery({
    queryKey: ['comunidad-miembros', idEvento],
    enabled: idEvento != null,
    queryFn: () => apiGet<PersonaResumen[]>('/public/comunidad/miembros', { idEvento }, true),
    staleTime: 15_000,
  });
}

export function publicarMensaje(idEvento: number, mensaje: string) {
  return apiPost<ComunidadMensaje>('/public/comunidad', { idEvento, mensaje }, true);
}

export function salirComunidad(idEvento: number) {
  return apiPost<{ soyMiembro: boolean }>('/public/comunidad/salir', { idEvento }, true);
}

export function ingresarComunidad(idEvento: number) {
  return apiPost<{ soyMiembro: boolean }>('/public/comunidad/ingresar', { idEvento }, true);
}
