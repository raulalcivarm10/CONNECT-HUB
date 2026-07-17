/**
 * Endpoints tipados del catálogo público + hooks de TanStack Query.
 */
import {
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import type {
  EventoDetalle,
  EventosPage,
  InstitucionResumen,
} from '@connecthub/shared-types';
import { apiGet, apiPost } from './client';

const PAGE_SIZE = 12;

export const qk = {
  institucion: (codigo: string) => ['institucion', codigo] as const,
  destacados: (codigo: string) => ['destacados', codigo] as const,
  eventos: (codigo: string, q: string) => ['eventos', codigo, q] as const,
  evento: (id: number) => ['evento', id] as const,
};

export function resolverInstitucion(codigo: string) {
  return apiGet<InstitucionResumen>('/public/instituciones/resolver', { codigo });
}

/** Vincula al asistente autenticado con la institución del código (auth). */
export function vincularInstitucion(codigo: string) {
  return apiPost<InstitucionResumen>('/public/instituciones/vincular', { codigo }, true);
}

/** Instituciones a las que el asistente pertenece (auth). */
export function misInstituciones() {
  return apiGet<InstitucionResumen[]>('/public/instituciones/mias', undefined, true);
}

export function useMisInstituciones(enabled = true) {
  return useQuery({
    queryKey: ['mias'],
    queryFn: misInstituciones,
    enabled,
    staleTime: 0,
  });
}

/** Resolución de código (para el onboarding: manual, no en render). */
export function useInstitucionQuery(codigo: string | null) {
  return useQuery({
    queryKey: qk.institucion(codigo ?? ''),
    queryFn: () => resolverInstitucion(codigo as string),
    enabled: !!codigo,
  });
}

export function useDestacados(codigo: string | null) {
  return useQuery({
    queryKey: qk.destacados(codigo ?? ''),
    queryFn: () => apiGet<EventosPage>('/public/eventos/destacados', { codigo }),
    enabled: !!codigo,
    select: (p) => p.items,
  });
}

export function useEventos(codigo: string | null, q: string) {
  return useInfiniteQuery({
    queryKey: qk.eventos(codigo ?? '', q),
    enabled: !!codigo,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      apiGet<EventosPage>('/public/eventos', {
        codigo,
        q: q || undefined,
        page: pageParam,
        size: PAGE_SIZE,
      }),
    getNextPageParam: (last) =>
      last.page * last.size < last.total ? last.page + 1 : undefined,
  });
}

export function useEvento(id: number) {
  return useQuery({
    queryKey: qk.evento(id),
    queryFn: () => apiGet<EventoDetalle>(`/public/eventos/${id}`),
  });
}

/** Feed AGREGADO: eventos de todas mis instituciones (auth). */
export function useMisEventos(q: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['mis-eventos', q],
    enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      apiGet<EventosPage>(
        '/public/mis-eventos',
        { q: q || undefined, page: pageParam, size: PAGE_SIZE },
        true,
      ),
    getNextPageParam: (last) =>
      last.page * last.size < last.total ? last.page + 1 : undefined,
  });
}
