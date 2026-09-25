/**
 * FECHAS SIN HORA — leer antes de pintar cualquier fecha.
 *
 * `new Date('2026-10-01')` NO es el 1 de octubre: JavaScript lo interpreta como
 * medianoche UTC, y al pintarlo en Ecuador (UTC-5) sale el 30 de septiembre.
 * Lo mismo pasa con lo que Oracle devuelve como DATE, que se serializa a
 * '2026-10-01T00:00:00.000Z' y cae en la misma trampa.
 *
 * El error es silencioso y sistemático: corre TODAS las fechas un día hacia
 * atrás, así que no parece un fallo de zona horaria sino un dato mal guardado.
 *
 * Estas fechas son de CALENDARIO (el día del evento, el día del pago), no
 * instantes: no deben convertirse de zona horaria nunca. Por eso se parsean por
 * componentes y se construyen en hora local.
 */

/** 'YYYY-MM-DD' (o ISO con hora) → Date en hora LOCAL, sin corrimiento. */
export function parsearISOLocal(iso: string): Date | null {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d);
}

/** 'YYYY-MM-DD' → fecha corta del idioma activo ("25/9/2026"). */
export function fechaCorta(
  iso: string | null | undefined,
  locale: string,
  vacio = '—',
): string {
  if (!iso) return vacio;
  const d = parsearISOLocal(iso);
  return d ? d.toLocaleDateString(locale) : iso;
}

/** 'YYYY-MM-DD' → fecha con mes abreviado ("25 sept 2026"). */
export function fechaMedia(
  iso: string | null | undefined,
  locale: string,
  vacio = '—',
): string {
  if (!iso) return vacio;
  const d = parsearISOLocal(iso);
  return d
    ? d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
    : iso;
}
