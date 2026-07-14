'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { useInstitucionFiltro } from '@/lib/institucion-context';
import { useI18n } from '@/lib/i18n';
import type { EventoRow } from '@/lib/types';

/** nombres de mes y día según el locale activo (2024-01-01 fue lunes) */
function nombresCalendario(locale: string) {
  const meses = Array.from({ length: 12 }, (_, m) =>
    new Date(2024, m, 1).toLocaleDateString(locale, { month: 'long' }),
  );
  const dias = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }),
  );
  return { meses, dias };
}

/** paleta por salón para distinguir eventos de un vistazo */
const COLORES = [
  { chip: 'bg-violet-500', borde: 'border-l-violet-500', punto: 'bg-violet-500' },
  { chip: 'bg-emerald-500', borde: 'border-l-emerald-500', punto: 'bg-emerald-500' },
  { chip: 'bg-sky-500', borde: 'border-l-sky-500', punto: 'bg-sky-500' },
  { chip: 'bg-amber-500', borde: 'border-l-amber-500', punto: 'bg-amber-500' },
  { chip: 'bg-rose-500', borde: 'border-l-rose-500', punto: 'bg-rose-500' },
  { chip: 'bg-indigo-500', borde: 'border-l-indigo-500', punto: 'bg-indigo-500' },
  { chip: 'bg-teal-500', borde: 'border-l-teal-500', punto: 'bg-teal-500' },
];
const colorSalon = (idSalon: number | null) =>
  COLORES[Math.abs(idSalon ?? 0) % COLORES.length];

const toMin = (h: string) => {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
};
const toHora = (min: number) => {
  const m = Math.max(0, Math.min(min, 24 * 60 - 1));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

function ventanaReal(ev: EventoRow): string | null {
  if (!ev.HORA_INICIO || !ev.HORA_FIN) return null;
  const ini = toMin(ev.HORA_INICIO) - (ev.TIEMPO_SETUP_MIN ?? 0);
  const fin = toMin(ev.HORA_FIN) + (ev.TIEMPO_CLEAN_MIN ?? 0);
  return `${toHora(ini)} – ${toHora(fin)}`;
}

function claveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const money = (v: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(
    v ?? 0,
  );

export default function CalendarioPage() {
  const { qs, nombreFiltro } = useInstitucionFiltro();
  const { t, locale } = useI18n();
  const { meses: MESES, dias: DIAS } = nombresCalendario(locale);
  const [eventos, setEventos] = useState<EventoRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const hoy = useMemo(() => new Date(), []);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth()); // 0-11
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setEventos(await api.get<EventoRow[]>(`/eventos${qs}`));
  }, [qs]);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  const porDia = useMemo(() => {
    const map = new Map<string, EventoRow[]>();
    for (const ev of eventos) {
      // el evento ocupa SOLO sus días reales (EVENTO_HORAS), no un rango contiguo
      const dias = (ev.DIAS ? ev.DIAS.split(',') : [ev.FECHA_EVENTO]).filter(
        Boolean,
      );
      for (const clave of dias) {
        const lista = map.get(clave) ?? [];
        lista.push(ev);
        map.set(clave, lista);
      }
    }
    for (const lista of map.values()) {
      lista.sort((a, b) => (a.HORA_INICIO ?? '').localeCompare(b.HORA_INICIO ?? ''));
    }
    return map;
  }, [eventos]);

  // celdas del mes: semana empieza lunes
  const celdas = useMemo(() => {
    const primero = new Date(anio, mes, 1);
    const offset = (primero.getDay() + 6) % 7; // 0 = lunes
    const inicio = new Date(anio, mes, 1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      return d;
    });
  }, [anio, mes]);

  // cuenta cada evento UNA sola vez (por su fecha de inicio), aunque abarque
  // varios días en el calendario: se filtra el arreglo plano, no las celdas.
  const eventosDelMes = useMemo(() => {
    const pref = `${anio}-${String(mes + 1).padStart(2, '0')}`;
    return eventos.filter((e) => e.FECHA_EVENTO?.startsWith(pref)).length;
  }, [eventos, anio, mes]);

  function moverMes(delta: number) {
    const d = new Date(anio, mes + delta, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth());
    setDiaSeleccionado(null);
  }

  const seleccionados = diaSeleccionado
    ? (porDia.get(diaSeleccionado) ?? [])
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('cal.title')}</h1>
          <p className="text-sm text-text-2">
            {nombreFiltro
              ? t('cal.filtering', { name: nombreFiltro })
              : t('cal.subtitle')}
          </p>
        </div>
        <Link
          href="/panel/eventos"
          className="rounded-lg border border-border-app px-4 py-2 text-sm text-text-2 hover:bg-surface-2"
        >
          {t('cal.listView')}
        </Link>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-4 xl:flex-row">
        {/* calendario */}
        <div className="min-w-0 flex-1 rounded-2xl border border-border-app bg-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => moverMes(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-app text-text-2 hover:bg-surface-2"
                aria-label={t('cal.prevMonth')}
              >
                ‹
              </button>
              <button
                onClick={() => {
                  setAnio(hoy.getFullYear());
                  setMes(hoy.getMonth());
                  setDiaSeleccionado(claveDia(hoy));
                }}
                className="rounded-lg border border-border-app px-3 py-1.5 text-xs font-semibold text-text-2 hover:bg-surface-2"
              >
                {t('cal.today')}
              </button>
              <button
                onClick={() => moverMes(1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-app text-text-2 hover:bg-surface-2"
                aria-label={t('cal.nextMonth')}
              >
                ›
              </button>
            </div>
            <div className="text-lg font-bold text-text">
              {MESES[mes]} {anio}
            </div>
            <div className="text-sm text-text-muted">
              {t('cal.eventsCount', { n: eventosDelMes })}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {DIAS.map((d) => (
              <div
                key={d}
                className="pb-1 text-center text-xs font-semibold uppercase tracking-wide text-text-muted"
              >
                {d}
              </div>
            ))}
            {celdas.map((d) => {
              const clave = claveDia(d);
              const delMes = d.getMonth() === mes;
              const esHoy = claveDia(hoy) === clave;
              const lista = porDia.get(clave) ?? [];
              const seleccionado = diaSeleccionado === clave;
              return (
                <button
                  key={clave}
                  onClick={() => setDiaSeleccionado(seleccionado ? null : clave)}
                  className={`flex min-h-24 flex-col rounded-xl border p-1.5 text-left transition ${
                    seleccionado
                      ? 'border-brand bg-brand/10'
                      : esHoy
                        ? 'border-brand/50 bg-surface-2'
                        : 'border-border-app bg-surface-2/50 hover:border-brand/40'
                  } ${delMes ? '' : 'opacity-40'}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        esHoy ? 'bg-brand text-white' : 'text-text-2'
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    {lista.length > 0 && (
                      <span className="rounded-full bg-brand/15 px-1.5 text-[10px] font-bold text-brand">
                        {lista.length}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {lista.slice(0, 3).map((ev) => (
                      <span
                        key={ev.ID_EVENTO}
                        className={`truncate rounded px-1 py-0.5 text-[10px] font-medium text-white ${colorSalon(ev.ID_SALON).chip}`}
                        title={`${ev.TITULO} · ${ev.SALON_NOMBRE ?? ''}`}
                      >
                        {ev.HORA_INICIO ? `${ev.HORA_INICIO} ` : ''}
                        {ev.TITULO}
                      </span>
                    ))}
                    {lista.length > 3 && (
                      <span className="px-1 text-[10px] font-semibold text-text-muted">
                        {t('cal.more', { n: lista.length - 3 })}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* detalle del día */}
        <div className="w-full shrink-0 xl:w-96">
          <div className="rounded-2xl border border-border-app bg-surface p-4 xl:sticky xl:top-4">
            {!diaSeleccionado ? (
              <div className="py-12 text-center text-sm text-text-muted">
                {t('cal.clickDay')}
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-bold text-text">
                    {new Date(`${diaSeleccionado}T12:00:00`).toLocaleDateString(
                      locale,
                      {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      },
                    )}
                  </h2>
                  <span className="text-xs text-text-muted">
                    {t('cal.eventsCount', { n: seleccionados.length })}
                  </span>
                </div>

                {seleccionados.length === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-sm text-text-muted">
                      {t('cal.freeDay')}
                    </p>
                    <Link
                      href={`/panel/eventos?nuevo=${diaSeleccionado}`}
                      className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                    >
                      {t('cal.createThisDay')}
                    </Link>
                  </div>
                )}

                <div className="space-y-3">
                  {seleccionados.map((ev) => (
                    <Link
                      key={ev.ID_EVENTO}
                      href={`/panel/eventos?editar=${ev.ID_EVENTO}`}
                      title={t('cal.clickEdit')}
                      className={`group block cursor-pointer rounded-xl border border-border-app border-l-4 bg-surface-2 p-3 transition hover:border-brand hover:shadow-md ${colorSalon(ev.ID_SALON).borde}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-text">
                          {ev.DESTACADO === 1 && (
                            <span title={t('cal.featured')}>★ </span>
                          )}
                          {ev.TITULO}
                        </div>
                        <span className="whitespace-nowrap text-xs font-bold text-text">
                          {ev.PRECIO > 0 ? money(ev.PRECIO, locale) : t('c.free')}
                          <span className="ml-2 hidden font-semibold text-brand group-hover:inline">
                            {t('cal.editHover')}
                          </span>
                        </span>
                      </div>

                      <div className="mt-1.5 space-y-1 text-xs text-text-2">
                        <div>
                          🕐 {ev.HORA_INICIO}–{ev.HORA_FIN}
                          {ventanaReal(ev) && (
                            <span className="text-text-muted">
                              {' '}
                              {t('cal.occupies', { w: ventanaReal(ev)! })}
                            </span>
                          )}
                        </div>
                        <div>
                          📍 {[ev.LOCAL_NOMBRE, ev.SALON_NOMBRE]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </div>
                        <div>
                          🧩{' '}
                          {ev.CONFIGURACION_NOMBRE
                            ? `${ev.CONFIGURACION_NOMBRE}${ev.SUBSALONES_NOMBRES ? ` (${ev.SUBSALONES_NOMBRES})` : ''}`
                            : ev.SUBSALONES_NOMBRES
                              ? ev.SUBSALONES_NOMBRES
                              : ev.ID_SALON
                                ? t('ev.fullHallOpt')
                                : t('ev.wholeVenueFull')}
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('cal.enrolledN', { n: ev.INSCRITOS })}</span>
                          {ev.INSTITUCION && (
                            <span className="text-text-muted">
                              {ev.INSTITUCION}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>

                {seleccionados.length > 0 && (
                  <Link
                    href={`/panel/eventos?nuevo=${diaSeleccionado}`}
                    className="mt-3 block rounded-lg border border-dashed border-border-app px-4 py-2 text-center text-sm font-semibold text-brand transition hover:border-brand hover:bg-brand/5"
                  >
                    {t('cal.createAnother')}
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
