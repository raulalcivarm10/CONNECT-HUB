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

const MESES_LARGO: Record<Lang, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  fr: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  pt: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
};

function parse(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

/** 'YYYY-MM-DD' de HOY en hora local (sin corrimiento de zona). */
export function todayKey(): string {
  const d = new Date();
  return keyOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Compone 'YYYY-MM-DD'. */
export function keyOf(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Mes de una fecha ISO. */
export function monthOf(iso: string): { y: number; m: number } {
  const { y, m } = parse(iso);
  return { y, m };
}

/** 'Julio 2026' — mes largo + año, por idioma. */
export function monthLabel(y: number, m: number, lang: Lang): string {
  return `${MESES_LARGO[lang][m - 1] ?? ''} ${y}`;
}

/** Encabezados de días de la semana empezando en LUNES. */
export function weekdayHeadersMon(lang: Lang): string[] {
  const d = DIAS_SEMANA[lang];
  return [d[1], d[2], d[3], d[4], d[5], d[6], d[0]];
}

/** 42 celdas 'YYYY-MM-DD' de la grilla del mes (empezando lunes; incluye días de meses vecinos). */
export function monthCells(y: number, m: number): string[] {
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // lunes = 0
  const start = new Date(Date.UTC(y, m - 1, 1 - offset));
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(start.getTime() + i * 86400000);
    cells.push(keyOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()));
  }
  return cells;
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
