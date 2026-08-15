'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { descargarExcel } from '@/lib/excel';
import { useI18n } from '@/lib/i18n';
import { useInstitucionFiltro } from '@/lib/institucion-context';

// recharts (~300-400 KB) fuera del first-load: el gráfico está bajo el fold.
const AsistenciaBarChart = dynamic(
  () => import('@/components/charts/asistencia-bar-chart'),
  {
    ssr: false,
    loading: () => (
      <div className="h-80 animate-pulse rounded-xl bg-surface-2" />
    ),
  },
);

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
  cargando,
}: {
  label: string;
  value: string | number;
  accent?: string;
  cargando?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border-app bg-surface p-5">
      <div className="text-sm text-text-muted">{label}</div>
      {cargando ? (
        // sin datos aún: barra en vez de un "0" que después salta al valor real
        <div className="mt-1 h-8 w-24 animate-pulse rounded bg-surface-2" />
      ) : (
        <div className={`mt-1 text-2xl font-bold ${accent ?? 'text-text'}`}>
          {value}
        </div>
      )}
    </div>
  );
}

export default function ReportesPage() {
  const { t } = useI18n();
  const { idInstitucion, nombreFiltro } = useInstitucionFiltro();
  const [datos, setDatos] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [anio, setAnio] = useState<string>('');
  const [meses, setMeses] = useState<number[]>([]);
  const [idEvento, setIdEvento] = useState<string>('');
  const [detalle, setDetalle] = useState<{
    titulo: string;
    inscritos: Inscrito[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // La red solo depende de institución + año: el backend devuelve una fila por
  // evento, así que meses e idEvento se resuelven en cliente (ver `porEvento`).
  // Antes cada mes marcado disparaba una recarga completa.
  const cargar = useCallback(() => {
    const params = new URLSearchParams();
    if (idInstitucion != null) params.set('idInstitucion', String(idInstitucion));
    if (anio) params.set('anio', anio);
    const q = params.toString();
    return api.get<Resumen>(`/reportes/asistencia${q ? `?${q}` : ''}`);
  }, [idInstitucion, anio]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    cargar()
      .then((r) => {
        if (!vivo) return;
        setDatos(r);
        setError(null);
      })
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [cargar]);

  /** Filas visibles: filtros de mes/evento aplicados en cliente, sin red. */
  const porEvento = useMemo(() => {
    const filas = datos?.porEvento ?? [];
    if (!meses.length && !idEvento) return filas;
    return filas.filter((e) => {
      if (idEvento && String(e.ID_EVENTO) !== idEvento) return false;
      if (meses.length) {
        // FECHA llega como 'YYYY-MM-DD'; sin fecha el evento queda fuera
        // (igual que el EXTRACT(MONTH ...) del backend con NULL).
        const mes = Number(String(e.FECHA ?? '').slice(5, 7));
        if (!mes || !meses.includes(mes)) return false;
      }
      return true;
    });
  }, [datos, meses, idEvento]);

  /** Mismos totales que calcula el backend, recompuestos sobre lo filtrado. */
  const totales = useMemo(() => {
    const acc = porEvento.reduce(
      (a, e) => ({
        inscritos: a.inscritos + Number(e.INSCRITOS ?? 0),
        asistieron: a.asistieron + Number(e.ASISTIERON ?? 0),
        noAsistieron: a.noAsistieron + Number(e.NO_ASISTIERON ?? 0),
        cancelados: a.cancelados + Number(e.CANCELADOS ?? 0),
        pendientes: a.pendientes + Number(e.PENDIENTES ?? 0),
      }),
      {
        inscritos: 0,
        asistieron: 0,
        noAsistieron: 0,
        cancelados: 0,
        pendientes: 0,
      },
    );
    const base = acc.asistieron + acc.noAsistieron;
    return {
      ...acc,
      eventos: porEvento.length,
      // tasa sobre quienes tienen check-in registrado (asistió + no asistió)
      tasaAsistencia: base > 0 ? Math.round((acc.asistieron / base) * 100) : 0,
    };
  }, [porEvento]);

  /** Exporta el reporte visible: hoja de resumen + hoja por evento. */
  function exportarExcel() {
    if (!datos) return;
    const resumen = [
      { [t('x.metric')]: t('rep.events'), [t('x.value')]: totales.eventos },
      { [t('x.metric')]: t('rep.registered'), [t('x.value')]: totales.inscritos },
      { [t('x.metric')]: t('rep.attended'), [t('x.value')]: totales.asistieron },
      { [t('x.metric')]: t('rep.noShow'), [t('x.value')]: totales.noAsistieron },
      { [t('x.metric')]: t('rep.pending'), [t('x.value')]: totales.pendientes },
      {
        [t('x.metric')]: t('rep.rate'),
        [t('x.value')]: `${totales.tasaAsistencia}%`,
      },
    ];
    const filas = porEvento.map((e) => {
      const base = e.ASISTIERON + e.NO_ASISTIERON;
      return {
        [t('rep.event')]: e.TITULO,
        [t('rep.date')]: e.FECHA,
        [t('rep.expected')]: e.PUBLICO_ESPERADO,
        [t('rep.registered')]: e.INSCRITOS,
        [t('rep.attended')]: e.ASISTIERON,
        [t('rep.noShow')]: e.NO_ASISTIERON,
        [t('rep.pending')]: e.PENDIENTES,
        [t('rep.rate')]: base > 0 ? `${Math.round((e.ASISTIERON / base) * 100)}%` : '0%',
      };
    });
    void descargarExcel('attendance-report', [
      { nombre: t('x.summary'), filas: resumen },
      { nombre: t('x.byEvent'), filas },
    ]);
  }

  /** Exporta el detalle de inscritos del modal (incluye fechas no mostradas). */
  function exportarDetalle() {
    if (!detalle) return;
    const filas = detalle.inscritos.map((u) => ({
      [t('rep.name')]: [u.NOMBRE, u.APELLIDO].filter(Boolean).join(' '),
      [t('rep.email')]: u.EMAIL,
      [t('rep.phone')]: u.NUMERO_CELULAR,
      [t('rep.status')]: t(`at.${u.ASISTENCIA}`),
      [`${t('rep.date')} (${t('rep.registered')})`]: u.FECHA_REGISTRO,
      [`${t('rep.date')} (${t('rep.attended')})`]: u.FECHA_ENTRADA,
    }));
    void descargarExcel('attendees', [{ nombre: t('x.attendees'), filas }]);
  }

  async function verDetalle(ev: EventoRep) {
    setError(null);
    try {
      const inscritos = await api.get<Inscrito[]>(
        `/reportes/asistencia/${ev.ID_EVENTO}/inscritos`,
      );
      setDetalle({ titulo: ev.TITULO, inscritos });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('c.error'));
    }
  }

  function toggleMes(m: number) {
    setMeses((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b),
    );
  }

  const grafico = useMemo(
    () =>
      porEvento
        .slice()
        .reverse()
        .map((e) => ({
          nombre: e.TITULO.length > 18 ? `${e.TITULO.slice(0, 18)}…` : e.TITULO,
          [t('rep.attended')]: e.ASISTIERON,
          [t('rep.noShow')]: e.NO_ASISTIERON,
          [t('rep.pending')]: e.PENDIENTES,
        })),
    [porEvento, t],
  );

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
        <button
          onClick={exportarExcel}
          disabled={cargando || porEvento.length === 0}
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
            {t('rep.event')}
          </label>
          {/* opciones desde la respuesta SIN filtrar: antes, al elegir un evento
              la respuesta solo traía ese evento y el desplegable se quedaba con
              una única opción. */}
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
        <Card label={t('rep.events')} value={nf(totales.eventos)} cargando={cargando} />
        <Card
          label={t('rep.registered')}
          value={nf(totales.inscritos)}
          cargando={cargando}
        />
        <Card
          label={t('rep.attended')}
          value={nf(totales.asistieron)}
          accent="text-success"
          cargando={cargando}
        />
        <Card
          label={t('rep.noShow')}
          value={nf(totales.noAsistieron)}
          accent="text-danger"
          cargando={cargando}
        />
        <Card
          label={t('rep.pending')}
          value={nf(totales.pendientes)}
          accent="text-brand"
          cargando={cargando}
        />
        <Card
          label={t('rep.rate')}
          value={`${totales.tasaAsistencia}%`}
          accent="text-success"
          cargando={cargando}
        />
      </div>

      {/* gráfico */}
      <div className="mt-6 rounded-2xl border border-border-app bg-surface p-5">
        <h2 className="mb-4 font-semibold text-text">{t('rep.byEvent')}</h2>
        {cargando ? (
          <div className="h-80 animate-pulse rounded-xl bg-surface-2" />
        ) : grafico.length ? (
          <AsistenciaBarChart
            data={grafico}
            keyAsistieron={t('rep.attended')}
            keyNoAsistieron={t('rep.noShow')}
            keyPendientes={t('rep.pending')}
          />
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
            {cargando &&
              Array.from({ length: 4 }, (_, i) => (
                <tr key={`sk${i}`} className="border-b border-border-app/60">
                  <td colSpan={8} className="px-4 py-3">
                    <div className="h-4 animate-pulse rounded bg-surface-2" />
                  </td>
                </tr>
              ))}
            {!cargando &&
              porEvento.map((e) => {
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
            {!cargando && porEvento.length === 0 && (
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
              <div className="flex items-center gap-2">
                <button
                  onClick={exportarDetalle}
                  disabled={detalle.inscritos.length === 0}
                  className="rounded-lg bg-success/15 px-3 py-1 text-sm font-semibold text-success hover:bg-success/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ⬇️ {t('c.excel')}
                </button>
                <button
                  onClick={() => setDetalle(null)}
                  className="rounded-lg border border-border-app px-3 py-1 text-sm text-text-2 hover:bg-surface-2"
                >
                  ✕
                </button>
              </div>
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
