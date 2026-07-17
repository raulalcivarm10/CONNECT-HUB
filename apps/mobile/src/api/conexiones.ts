/** Solicitudes y conexiones de networking. */
import { useQuery } from '@tanstack/react-query';
import type { SolicitudConexion, PersonaResumen, RelacionConexion } from '@connecthub/shared-types';
import { apiGet, apiPost } from './client';

export function useSolicitudes() {
  return useQuery({
    queryKey: ['solicitudes'],
    queryFn: () => apiGet<SolicitudConexion[]>('/public/conexiones/solicitudes', undefined, true),
    staleTime: 15_000,
  });
}

export function useConexiones() {
  return useQuery({
    queryKey: ['conexiones'],
    queryFn: () => apiGet<PersonaResumen[]>('/public/conexiones', undefined, true),
    staleTime: 15_000,
  });
}

export function solicitarConexion(idDestinatario: string) {
  return apiPost<{ relacion: RelacionConexion }>('/public/conexiones/solicitar', { idDestinatario }, true);
}

export function responderConexion(idConexion: number, aceptar: boolean) {
  return apiPost<{ estado: string }>('/public/conexiones/responder', { idConexion, aceptar }, true);
}
