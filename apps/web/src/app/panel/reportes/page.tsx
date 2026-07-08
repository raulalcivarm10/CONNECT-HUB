'use client';

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
import { useI18n } from '@/lib/i18n';
import { useInstitucionFiltro } from '@/lib/institucion-context';

interface EventoRep {
  ID_EVENTO: number;
  TITULO: string;
  FECHA: string;
  PUBLICO_ESPERADO: number | null;
  INSCRITOS: number;
  ASISTIERON: number;
  NO_ASISTIERON: number;
  CANCELADOS: number;
  PENDIENTES: number;
}
interface Resumen {
  idInstitucion: number | null;
  totales: {
    eventos: number;
    inscritos: number;
    asistieron: number;
    noAsistieron: number;
    cancelados: number;
    pendientes: number;
    tasaAsistencia: number;
  };
  porEvento: EventoRep[];
  aniosDisponibles: number[];
}
interface Inscrito {
  NOMBRE: string | null;
  APELLIDO: string | null;
  EMAIL: string | null;
  NUMERO_CELULAR: string | null;
  ASISTENCIA: 'ASISTIO' | 'NO_ASISTIO' | 'PENDIENTE' | 'CANCELADO';
  FECHA_REGISTRO: string | null;
  FECHA_ENTRADA: string | null;
}

const AT_STYLE: Record<string, string> = {
  ASISTIO: 'bg-success/15 text-success',
  NO_ASISTIO: 'bg-danger/15 text-danger',
  PENDIENTE: 'bg-brand/10 text-brand',
  CANCELADO: 'bg-surface-2 text-text-muted',
};

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

export default function ReportesPage() {
  const { t } = useI18n();
  const { qs, instituciones, idInstitucion, nombreFiltro } =
    useInstitucionFiltro();
  const [datos, setDatos] = useState<Resumen | null>(null);
  const [anio, setAnio] = useState<string>('');
  const [meses, setMeses] = useState<number[]>([]);
  const [idEvento, setIdEvento] = useState<string>('');
  const [detalle, setDetalle] = useState<{
    titulo: string;
    inscritos: Inscrito[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const params = new URLSearchParams();
    if (idInstitucion != null) params.set('idInstitucion', String(idInstitucion));
    if (anio) params.set('anio', anio);
    if (meses.length) params.set('meses', meses.join(','));
    if (idEvento) params.set('idEvento', idEvento);
    const q = params.toString();
    setDatos(
      await api.get<Resumen>(`/reportes/asistencia${q ? `?${q}` : ''}`),
    );
  }, [idInstitucion, anio, meses, idEvento]);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  // el filtro global de institución cambia qs; recargamos también con él
  useEffect(() => {
    cargar().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  async function verDetalle(ev: EventoRep) {
    setError(null);
    try {
      const inscritos = await api.get<Inscrito[]>(
        `/reportes/asistencia/${ev.ID_EVENTO}/inscritos`,
      );
      setDetalle({ titulo: ev.TITULO, inscritos });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  function toggleMes(m: number) {
    setMeses((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b),
    );
  }

  const grafico =
    datos?.porEvento
      .slice()
      .reverse()
      .map((e) => ({
        nombre:
          e.TITULO.length > 18 ? `${e.TITULO.slice(0, 18)}…` : e.TITULO,
        [t('rep.attended')]: e.ASISTIERON,
        [t('rep.noShow')]: e.NO_ASISTIERON,
        [t('rep.pending')]: e.PENDIENTES,
      })) ?? [];

  const nf = (n: number) => new Intl.NumberFormat().format(n);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('rep.title')}</h1>
          <p className="text-sm text-text-2">
            {nombreFiltro
              ? t('us.filtering', { name: nombreFiltro })
              : t('rep.subtitle')}
          </p>
        </div>
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
            {t('rep.event')}
          </label>
          <select
            value={idEvento}
            onChange={(e) => setIdEvento(e.target.value)}
            className="max-w-56 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-sm text-text"
          >
            <option value="">{t('rep.allEvents')}</option>
            {datos?.porEvento.map((e) => (
              <option key={e.ID_EVENTO} value={e.ID_EVENTO}>
                {e.TITULO}
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

      {/* KPIs */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card label={t('rep.events')} value={nf(datos?.totales.eventos ?? 0)} />
        <Card
          label={t('rep.registered')}
          value={nf(datos?.totales.inscritos ?? 0)}
        />
        <Card
          label={t('rep.attended')}
          value={nf(datos?.totales.asistieron ?? 0)}
          accent="text-success"
        />
        <Card
          label={t('rep.noShow')}
          value={nf(datos?.totales.noAsistieron ?? 0)}
          accent="text-danger"
        />
        <Card
          label={t('rep.pending')}
          value={nf(datos?.totales.pendientes ?? 0)}
          accent="text-brand"
        />
        <Card
          label={t('rep.rate')}
          value={`${datos?.totales.tasaAsistencia ?? 0}%`}
          accent="text-success"
        />
      </div>

      {/* gráfico */}
      <div className="mt-6 rounded-2xl border border-border-app bg-surface p-5">
        <h2 className="mb-4 font-semibold text-text">{t('rep.byEvent')}</h2>
        {grafico.length ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={grafico}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="nombre"
                tick={{ fill: 'var(--text-2)', fontSize: 12 }}
              />
              <YAxis tick={{ fill: 'var(--text-2)', fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey={t('rep.attended')} stackId="a" fill="var(--success)" radius={[0, 0, 0, 0]} />
              <Bar dataKey={t('rep.noShow')} stackId="a" fill="var(--danger)" />
              <Bar dataKey={t('rep.pending')} stackId="a" fill="var(--brand)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-10 text-center text-text-muted">{t('rep.empty')}</p>
        )}
      </div>

      {/* tabla por evento */}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-border-app bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-app text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-4 py-3">{t('rep.event')}</th>
              <th className="px-4 py-3">{t('rep.date')}</th>
              <th className="px-4 py-3 text-right">{t('rep.expected')}</th>
              <th className="px-4 py-3 text-right">{t('rep.registered')}</th>
              <th className="px-4 py-3 text-right">{t('rep.attended')}</th>
              <th className="px-4 py-3 text-right">{t('rep.noShow')}</th>
              <th className="px-4 py-3 text-right">{t('rep.rate')}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {datos?.porEvento.map((e) => {
              const base = e.ASISTIERON + e.NO_ASISTIERON;
              const tasa = base > 0 ? Math.round((e.ASISTIERON / base) * 100) : 0;
              return (
                <tr key={e.ID_EVENTO} className="border-b border-border-app/60">
                  <td className="px-4 py-3 font-medium text-text">{e.TITULO}</td>
                  <td className="px-4 py-3 text-text-2">{e.FECHA}</td>
                  <td className="px-4 py-3 text-right text-text-2">
                    {e.PUBLICO_ESPERADO ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-text">{e.INSCRITOS}</td>
                  <td className="px-4 py-3 text-right text-success">
                    {e.ASISTIERON}
                  </td>
                  <td className="px-4 py-3 text-right text-danger">
                    {e.NO_ASISTIERON}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-text">
                    {tasa}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => verDetalle(e)}
                      className="rounded-lg bg-brand/10 px-3 py-1 text-xs font-semibold text-brand hover:bg-brand/20"
                    >
                      {t('rep.detail')}
                    </button>
                  </td>
                </tr>
              );
            })}
            {(!datos || datos.porEvento.length === 0) && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-text-muted">
                  {t('rep.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* drill-down: listado de inscritos */}
      {detalle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDetalle(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-border-app bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border-app px-5 py-3">
              <h3 className="font-bold text-text">
                {t('rep.attendees', { name: detalle.titulo })}
              </h3>
              <button
                onClick={() => setDetalle(null)}
                className="rounded-lg border border-border-app px-3 py-1 text-sm text-text-2 hover:bg-surface-2"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border-app text-left text-xs uppercase tracking-wide text-text-muted">
                    <th className="px-4 py-2">{t('rep.name')}</th>
                    <th className="px-4 py-2">{t('rep.email')}</th>
                    <th className="px-4 py-2">{t('rep.phone')}</th>
                    <th className="px-4 py-2">{t('rep.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.inscritos.map((u, i) => (
                    <tr key={i} className="border-b border-border-app/50">
                      <td className="px-4 py-2 text-text">
                        {[u.NOMBRE, u.APELLIDO].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-4 py-2 text-text-2">{u.EMAIL ?? '—'}</td>
                      <td className="px-4 py-2 text-text-2">
                        {u.NUMERO_CELULAR ?? '—'}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${AT_STYLE[u.ASISTENCIA]}`}
                        >
                          {t(`at.${u.ASISTENCIA}`)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {detalle.inscritos.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-text-muted"
                      >
                        {t('rep.emptyList')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
