/**
 * Formateo de fechas del evento. Las fechas vienen 'YYYY-MM-DD' y se tratan
 * como locales del evento (sin zona horaria del dispositivo).
 */
import type { Lang } from '@/i18n';

const MESES: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
  fr: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'],
  pt: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
};

const DIAS_SEMANA: Record<Lang, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  fr: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
  pt: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
};

function parse(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

/** 'YYYY-MM-DD' → 'Aug 15' / '15 Ago' */
export function shortDate(iso: string, lang: Lang): string {
  const { m, d } = parse(iso);
  const mes = MESES[lang][m - 1] ?? '';
  return lang === 'es' ? `${d} ${mes}` : `${mes} ${d}`;
}

/** Día de la semana corto. Cálculo Zeller-free vía Date solo para weekday. */
export function weekday(iso: string, lang: Lang): string {
  const { y, m, d } = parse(iso);
  const idx = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return DIAS_SEMANA[lang][idx] ?? '';
}

/** Número de día del mes. */
export function dayNum(iso: string): number {
  return parse(iso).d;
}

/**
 * Resumen humano de los días reales del evento:
 *  - 1 día      → 'Aug 15'
 *  - contiguos  → 'Aug 15 – Aug 18'  (heurística: 2 días y consecutivos)
 *  - varios     → 'Aug 15 · Aug 22 · +1'
 */
export function resumenDias(dias: string[], lang: Lang): string {
  if (dias.length === 0) return '';
  if (dias.length === 1) return shortDate(dias[0], lang);
  const sorted = [...dias].sort();
  const first = shortDate(sorted[0], lang);
  const last = shortDate(sorted[sorted.length - 1], lang);
  if (dias.length === 2) return `${first} · ${last}`;
  return `${first} · ${last} · +${dias.length - 2}`;
}

/** Año de la primera fecha. */
export function year(iso: string): number {
  return parse(iso).y;
}
