'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api/client';

/**
 * Suscripciones (vigencia de cada institución) y licencias on-premise.
 *
 * Contrato del API en camelCase (a diferencia de las filas SCREAMING_CASE del
 * resto del panel). Las fechas viajan como 'YYYY-MM-DD'.
 */

export type EstadoSuscripcion =
  | 'ACTIVA'
  | 'VENCIDA'
  | 'CANCELADA'
  | 'REEMPLAZADA';

export const ESTADOS_SUSCRIPCION: readonly EstadoSuscripcion[] = [
  'ACTIVA',
  'VENCIDA',
  'CANCELADA',
  'REEMPLAZADA',
];

export interface SuscripcionRow {
  idSuscripcion: number;
  idInstitucion: number;
  institucion: string;
  idPlan: number | null;
  plan: string | null;
  planCodigo: string | null;
  compradorEmail: string;
  compradorNombre: string | null;
  /** 'YYYY-MM-DD' */
  fechaCompra: string;
  fechaInicio: string;
  fechaFin: string;
  dias: number;
  monto: number | null;
  moneda: string | null;
  referenciaPago: string | null;
  estado: EstadoSuscripcion;
  /** puede ser negativo: la vigencia ya pasó */
  diasRestantes: number;
  notas: string | null;
}

export interface SuscripcionesResp {
  items: SuscripcionRow[];
  total: number;
}

export interface PlanRow {
  idPlan: number;
  codigo: string;
  nombre: string;
  dias: number;
  precio: number | null;
  moneda: string | null;
  /** el API puede mandarlo como boolean, 1/0 o 'S'/'N' */
  esOnpremise: boolean | number | string | null;
}

/** GET /suscripciones/mia — vigencia de la institución del usuario */
export interface MiSuscripcion {
  tiene: boolean;
  fechaFin: string | null;
  diasRestantes: number | null;
  estado: EstadoSuscripcion | null;
  institucion: string | null;
}

/** LICENCIAS_ONPREMISE.TIPO — conjunto cerrado */
export type TipoLicencia = 'PRUEBA' | 'PERMANENTE';

/** LICENCIAS_ONPREMISE.ESTADO — conjunto cerrado */
export type EstadoLicencia = 'ACTIVA' | 'VENCIDA' | 'REVOCADA';

export interface LicenciaRow {
  idLicencia: number;
  tipo: TipoLicencia;
  /** solo el prefijo: el token en claro se muestra una única vez al emitirlo */
  tokenPrefijo: string;
  fechaEmision: string;
  fechaExp: string | null;
  dias: number | null;
  estado: EstadoLicencia;
  emitidoPor: string | null;
}

/** POST /instituciones/:id/licencias — la fila más el token en claro (una vez) */
export interface LicenciaCreada extends LicenciaRow {
  token: string;
}

/**
 * Etiqueta traducida de un valor de catálogo cerrado (estado, tipo…).
 *
 * Respaldo a prueba de sorpresas: `t()` devuelve la propia clave cuando no la
 * encuentra, así que si el API mandara un valor fuera del conjunto conocido se
 * muestra el valor crudo en vez de dejar a la vista una clave sin resolver
 * ("lic.st.LO_QUE_SEA") o una celda vacía.
 */
export function etiquetaCatalogo(
  t: (k: string) => string,
  prefijo: string,
  valor: string | null | undefined,
): string {
  if (!valor) return '—';
  const clave = `${prefijo}.${valor}`;
  const texto = t(clave);
  return texto === clave ? valor : texto;
}

/** Normaliza los booleanos del API (true / 1 / 'S' / 'Y'). */
export function esVerdadero(valor: unknown): boolean {
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return valor === 1;
  if (typeof valor === 'string') {
    const v = valor.toUpperCase();
    return v === 'S' || v === 'Y' || v === '1' || v === 'TRUE';
  }
  return false;
}

/** Umbrales del aviso de vencimiento, en días restantes. */
export const DIAS_ALERTA_ROJA = 3;
export const DIAS_ALERTA_AMBAR = 7;

export type TonoVencimiento = 'danger' | 'warning' | null;

/**
 * Color según lo que queda de vigencia: rojo si ya venció o quedan ≤3 días,
 * ámbar si quedan ≤7, y null cuando no hay nada que avisar.
 *
 * Las canceladas y reemplazadas no urgen: su vigencia ya no está viva, así que
 * no se pintan (si no, una cancelada de hace un año saldría en rojo).
 */
export function tonoVencimiento(
  diasRestantes: number | null | undefined,
  estado?: EstadoSuscripcion | null,
): TonoVencimiento {
  if (diasRestantes == null) return null;
  if (estado === 'CANCELADA' || estado === 'REEMPLAZADA') return null;
  if (diasRestantes <= DIAS_ALERTA_ROJA) return 'danger';
  if (diasRestantes <= DIAS_ALERTA_AMBAR) return 'warning';
  return null;
}

/**
 * 'YYYY-MM-DD' → fecha legible en el idioma activo.
 *
 * Se construye con los componentes sueltos a propósito: `new Date('2026-08-15')`
 * se interpreta como medianoche UTC y en zonas al oeste de Greenwich (Ecuador,
 * la nuestra) se mostraría el día anterior.
 */
export function fechaLegible(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return iso;
  return new Date(a, m - 1, d).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Hoy en 'YYYY-MM-DD' (hora local), para los valores por defecto del formulario. */
export function hoyISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export const claveSuscripcion = {
  mia: ['suscripcion', 'mia'] as const,
  planes: ['suscripcion', 'planes'] as const,
};

/** referencia estable para el fallback: evita romper memos aguas abajo */
const SIN_PLANES: PlanRow[] = [];

/**
 * Vigencia de la institución del usuario, cacheada con react-query: el aviso
 * vive en el layout y se montaría en cada navegación, pero solo se pide una vez.
 */
export function useMiSuscripcion(habilitado = true) {
  const q = useQuery({
    queryKey: claveSuscripcion.mia,
    queryFn: () => api.get<MiSuscripcion>('/suscripciones/mia'),
    enabled: habilitado,
  });
  return { ...q, suscripcion: q.data ?? null };
}

/** Catálogo de planes de suscripción (lo usa el superadmin al registrar compras). */
export function usePlanesCatalogo(habilitado = true) {
  const q = useQuery({
    queryKey: claveSuscripcion.planes,
    queryFn: () => api.get<PlanRow[]>('/suscripciones/planes'),
    enabled: habilitado,
  });
  return { ...q, planes: q.data ?? SIN_PLANES };
}
