/** Endpoints tipados de inscripción y entradas (auth). */
import { useQuery } from '@tanstack/react-query';
import type { Certificado, InscripcionResult, MiEntrada } from '@connecthub/shared-types';
import { apiGet, apiPost } from './client';

/** Inscribe al asistente en un evento (gratis directo; pago→requierePago). */
export function inscribirEvento(idEvento: number) {
  return apiPost<InscripcionResult>(`/public/eventos/${idEvento}/inscripcion`, undefined, true);
}

export function misEntradas() {
  return apiGet<MiEntrada[]>('/public/mis-entradas', undefined, true);
}

export function useMisEntradas(enabled = true) {
  return useQuery({
    queryKey: ['mis-entradas'],
    queryFn: misEntradas,
    enabled,
    staleTime: 30_000,
  });
}

export function getEntradaQr(idEventoUsuario: number) {
  return apiGet<{ qrToken: string; titulo: string; asistio: boolean }>(
    `/public/entradas/${idEventoUsuario}/qr`,
    undefined,
    true,
  );
}

export function useEntradaQr(idEventoUsuario: number) {
  return useQuery({
    queryKey: ['qr', idEventoUsuario],
    queryFn: () => getEntradaQr(idEventoUsuario),
  });
}

export function getCertificado(codigo: string) {
  return apiGet<Certificado>(`/public/certificados/${encodeURIComponent(codigo)}`);
}

export function useCertificado(codigo: string) {
  return useQuery({
    queryKey: ['cert', codigo],
    queryFn: () => getCertificado(codigo),
  });
}

/** Estructura del error 409 cuando un workshop requiere el evento padre. */
export interface ParentRequired {
  code: 'PARENT_REQUIRED';
  message: string;
  padre: { id: number; titulo: string; precio: number | null };
}
