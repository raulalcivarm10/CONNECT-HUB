/**
 * FECHAS EN HORARIO DE ECUADOR — leer antes de tocar nada de este módulo.
 *
 * El contenedor del API corre en UTC, pero los clientes (y la facturación)
 * viven en Ecuador: America/Guayaquil = UTC-5 TODO el año, sin horario de
 * verano. Eso significa que entre las 19:00 y las 23:59 de Ecuador el
 * calendario UTC ya está en el día siguiente. Si se calculara "hoy" con
 * `new Date().toISOString()` dentro del contenedor, el corte nocturno cortaría
 * un día antes de lo debido. Es un error que se comete solo: todo el módulo
 * usa `hoyEcuador()` y NUNCA la fecha UTC cruda ni SYSDATE para decidir
 * vencimientos.
 *
 * Al ser un offset fijo no hace falta Intl/tzdata: basta con desplazar el
 * instante 5 horas y leer el calendario UTC resultante.
 */

/** America/Guayaquil = UTC-5 fijo (Ecuador continental no cambia de hora) */
const OFFSET_ECUADOR_MS = -5 * 60 * 60 * 1000;

export const FECHA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha de HOY en Ecuador, como 'YYYY-MM-DD'. */
export function hoyEcuador(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() + OFFSET_ECUADOR_MS).toISOString().slice(0, 10);
}

/** Suma (o resta, con negativos) días a una fecha 'YYYY-MM-DD'. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Días calendario de `desde` a `hasta` ('YYYY-MM-DD'); negativo si ya pasó. */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** ¿La cadena es una fecha 'YYYY-MM-DD' real (no 2026-02-31)? */
export function esFechaValida(fecha: string): boolean {
  if (!FECHA_ISO_REGEX.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}
