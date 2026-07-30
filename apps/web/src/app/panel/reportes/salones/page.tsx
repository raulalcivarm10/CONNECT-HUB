'use client';

/**
 * Reporte de INGRESOS Y OCUPACIÓN POR SALÓN. Ocupación = días reales
 * (EVENTO_HORAS) de eventos principales; ingreso de alquiler = snapshot
 * congelado de la tarifa del espacio (EVENTOS.PRECIO_ESPACIO_*); ingreso de
 * entradas = pagos APPROVED. Filtros: año, meses, local. Export a Excel.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api/client';
import { descargarExcel } from '@/lib/excel';
import { useI18n } from '@/lib/i18n';
import { useInstitucionFiltro } from '@/lib/institucion-context';
import type { LocalRow } from '@/lib/types';

interface SalonRep {
  idSalon: number;
  salon: string;
  local: string;
  reservas: number;
  diasOcupados: number;
  ingresoAlquiler: number;
  ingresoEntradas: number;
  tasaOcupacion: number;
}
interface DiaRep {
  fecha: string;
  reservas: number;
  salones: number;
  ingresoAlquiler: number;
}
interface Datos {
  idInstitucion: number | null;
  resumen: {
    reservas: number;
    diasOcupados: number;
    salonesUsados: number;
    totalSalones: number;
    ingresoAlquiler: number;
    ingresoEntradas: number;
    tasaOcupacion: number;
  };
  porSalon: SalonRep[];
  porDia: DiaRep[];
  aniosDisponibles: number[];
}

function Card({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-border-app bg-surface p-5">
      <div className="text-sm text-text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ?? 'text-text'}`}>
        {value}
      </div>
    </div>
  );
}

export default function ReporteSalonesPage() {
  const { t } = useI18n();
  const { idInstitucion, nombreFiltro } = useInstitucionFiltro();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [locales, setLocales] = useState<LocalRow[]>([]);
  const [anio, setAnio] = useState<string>('');
  const [meses, setMeses] = useState<number[]>([]);
  const [idLocal, setIdLocal] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<LocalRow[]>('/locales')
      .then(setLocales)
      .catch(() => setLocales([]));
  }, [idInstitucion]);

  const cargar = useCallback(async () => {
    const params = new URLSearchParams();
    if (idInstitucion != null) params.set('idInstitucion', String(idInstitucion));
    if (anio) params.set('anio', anio);
    if (meses.length) params.set('meses', meses.join(','));
    if (idLocal) params.set('idLocal', idLocal);
    const q = params.toString();
    setDatos(await api.get<Datos>(`/reportes/salones${q ? `?${q}` : ''}`));
  }, [idInstitucion, anio, meses, idLocal]);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  function toggleMes(m: number) {
    setMeses((prev) =>
      prev.includes(m)
        ? prev.filter((x) => x !== m)
        : [...prev, m].sort((a, b) => a - b),
    );
  }

  const money = (n: number) =>
    `$${new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)}`;
  const nf = (n: number) => new Intl.NumberFormat().format(n);

  /** Exporta el reporte visible: resumen + por salón + por día. */
  function exportarExcel() {
    if (!datos) return;
    const r = datos.resumen;
    const resumen = [
      { [t('x.metric')]: t('rsl.rentRevenue'), [t('x.value')]: r.ingresoAlquiler },
      { [t('x.metric')]: t('rsl.ticketRevenue'), [t('x.value')]: r.ingresoEntradas },
      { [t('x.metric')]: t('rsl.reservations'), [t('x.value')]: r.reservas },
      { [t('x.metric')]: t('rsl.daysBooked'), [t('x.value')]: r.diasOcupados },
      {
        [t('x.metric')]: t('rsl.hallsUsed'),
        [t('x.value')]: `${r.salonesUsados} / ${r.totalSalones}`,
      },
      { [t('x.metric')]: t('rsl.occupancy'), [t('x.value')]: `${r.tasaOcupacion}%` },
    ];
    const porSalon = datos.porSalon.map((s) => ({
      [t('rsl.hall')]: s.salon,
      [t('rsv.venue')]: s.local,
      [t('rsl.reservations')]: s.reservas,
      [t('rsl.daysBooked')]: s.diasOcupados,
      [t('rsl.occupancy')]: `${s.tasaOcupacion}%`,
      [t('rsl.rentRevenue')]: s.ingresoAlquiler,
      [t('rsl.ticketRevenue')]: s.ingresoEntradas,
    }));
    const porDia = datos.porDia.map((d) => ({
      [t('rsl.date')]: d.fecha,
      [t('rsl.halls')]: d.salones,
      [t('rsl.reservations')]: d.reservas,
      [t('rsl.rentRevenue')]: d.ingresoAlquiler,
    }));
    void descargarExcel('hall-report', [
      { nombre: t('x.summary'), filas: resumen },
      { nombre: t('x.byHall'), filas: porSalon },
      { nombre: t('x.byDay'), filas: porDia },
    ]);
  }

  const grafico =
    datos?.porSalon.map((s) => ({
      nombre: s.salon.length > 18 ? `${s.salon.slice(0, 18)}…` : s.salon,
      [t('rsl.daysBooked')]: s.diasOcupados,
      [t('rsl.reservations')]: s.reservas,
    })) ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('rsl.title')}</h1>
          <p className="text-sm text-text-2">
            {nombreFiltro
              ? t('us.filtering', { name: nombreFiltro })
              : t('rsl.subtitle')}
          </p>
        </div>
        <button
          onClick={exportarExcel}
          disabled={!datos || datos.porSalon.length === 0}
          className="rounded-lg bg-success/15 px-4 py-2 text-sm font-semibold text-success hover:bg-success/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ⬇️ {t('c.excel')}
        </button>
      </div>

      {/* filtros */}
      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border-app bg-surface p-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t('rep.year')}
          </label>
          <select
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            className="rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-sm text-text"
          >
            <option value="">{t('rep.allYears')}</option>
            {datos?.aniosDisponibles.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t('rep.months')}
          </label>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button
                key={m}
                onClick={() => toggleMes(m)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                  meses.includes(m)
                    ? 'bg-brand text-white'
                    : 'bg-surface-2 text-text-2 hover:bg-brand/10'
                }`}
              >
                {t(`mon.${m}`)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t('rsv.venue')}
          </label>
          <select
            value={idLocal}
            onChange={(e) => setIdLocal(e.target.value)}
            className="max-w-56 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-sm text-text"
          >
            <option value="">{t('rsl.allVenues')}</option>
            {locales.map((l) => (
              <option key={l.ID_LOCAL} value={l.ID_LOCAL}>
                {l.NOMBRE}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {datos && (
        <>
          {/* KPIs */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card
              label={t('rsl.rentRevenue')}
              value={money(datos.resumen.ingresoAlquiler)}
              accent="text-success"
            />
            <Card
              label={t('rsl.ticketRevenue')}
              value={money(datos.resumen.ingresoEntradas)}
              accent="text-success"
            />
            <Card label={t('rsl.reservations')} value={nf(datos.resumen.reservas)} />
            <Card label={t('rsl.daysBooked')} value={nf(datos.resumen.diasOcupados)} />
            <Card
              label={t('rsl.hallsUsed')}
              value={`${datos.resumen.salonesUsados} / ${datos.resumen.totalSalones}`}
            />
            <Card
              label={t('rsl.occupancy')}
              value={`${datos.resumen.tasaOcupacion}%`}
              accent="text-brand"
            />
          </div>

          {/* ranking de salones (gráfico) */}
          {grafico.length > 0 && (
            <div className="mt-4 rounded-2xl border border-border-app bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-text">
                {t('rsl.ranking')}
              </h2>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={grafico}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey={t('rsl.daysBooked')} fill="var(--brand)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey={t('rsl.reservations')} fill="var(--success)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* tabla por salón */}
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border-app bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-app text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-3">{t('rsl.hall')}</th>
                  <th className="px-4 py-3">{t('rsv.venue')}</th>
                  <th className="px-4 py-3 text-right">{t('rsl.reservations')}</th>
                  <th className="px-4 py-3 text-right">{t('rsl.daysBooked')}</th>
                  <th className="px-4 py-3 text-right">{t('rsl.occupancy')}</th>
                  <th className="px-4 py-3 text-right">{t('rsl.rentRevenue')}</th>
                  <th className="px-4 py-3 text-right">{t('rsl.ticketRevenue')}</th>
                </tr>
              </thead>
              <tbody>
                {datos.porSalon.map((s) => (
                  <tr
                    key={s.idSalon}
                    className="border-b border-border-app last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-text">{s.salon}</td>
                    <td className="px-4 py-3 text-text-2">{s.local}</td>
                    <td className="px-4 py-3 text-right text-text">{nf(s.reservas)}</td>
                    <td className="px-4 py-3 text-right text-text">
                      {nf(s.diasOcupados)}
                    </td>
                    <td className="px-4 py-3 text-right text-text">
                      {s.tasaOcupacion}%
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-success">
                      {money(s.ingresoAlquiler)}
                    </td>
                    <td className="px-4 py-3 text-right text-success">
                      {money(s.ingresoEntradas)}
                    </td>
                  </tr>
                ))}
                {datos.porSalon.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-text-muted"
                    >
                      {t('rsl.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ocupación por día */}
          {datos.porDia.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-border-app bg-surface">
              <h2 className="px-4 pt-4 text-sm font-semibold text-text">
                {t('rsl.byDayTitle')}
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-app text-left text-xs uppercase tracking-wide text-text-muted">
                    <th className="px-4 py-3">{t('rsl.date')}</th>
                    <th className="px-4 py-3 text-right">{t('rsl.halls')}</th>
                    <th className="px-4 py-3 text-right">{t('rsl.reservations')}</th>
                    <th className="px-4 py-3 text-right">{t('rsl.rentRevenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.porDia.map((d) => (
                    <tr
                      key={d.fecha}
                      className="border-b border-border-app last:border-0"
                    >
                      <td className="px-4 py-3 text-text">{d.fecha}</td>
                      <td className="px-4 py-3 text-right text-text">{d.salones}</td>
                      <td className="px-4 py-3 text-right text-text">{d.reservas}</td>
                      <td className="px-4 py-3 text-right text-success">
                        {money(d.ingresoAlquiler)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
