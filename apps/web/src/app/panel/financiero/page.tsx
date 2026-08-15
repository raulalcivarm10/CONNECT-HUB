'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { descargarExcel } from '@/lib/excel';
import { useInstitucionFiltro } from '@/lib/institucion-context';
import { useI18n } from '@/lib/i18n';

// recharts (~300-400 KB) fuera del first-load: el gráfico está bajo el fold.
const FinancieroBarChart = dynamic(
  () => import('@/components/charts/financiero-bar-chart'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] animate-pulse rounded-xl bg-surface-2" />
    ),
  },
);

interface Resumen {
  idInstitucion: number | null;
  totales: {
    recaudado: number;
    numPagos: number;
    numGratuitos: number;
  };
  porEvento: Array<{
    ID_EVENTO: number;
    TITULO: string | null;
    FECHA_EVENTO: string | null;
    RECAUDADO: number;
    NUM_PAGOS: number;
  }>;
  porMes: Array<{ MES: string; RECAUDADO: number; NUM_PAGOS: number }>;
  eventos: Array<{ ID_EVENTO: number; TITULO: string | null }>;
  ultimosPagos: Array<{
    ID_PAGO: number;
    TITULO: string | null;
    MONTO: number;
    MONEDA: string;
    METODO_PAGO: string | null;
    ULTIMOS_4: string | null;
    FECHA: string | null;
  }>;
}

function Card({
  titulo,
  valor,
  nota,
  cargando,
}: {
  titulo: string;
  valor: string;
  nota?: string;
  cargando?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border-app bg-surface p-5">
      <div className="text-sm text-text-muted">{titulo}</div>
      {cargando ? (
        // sin datos aún: barra en vez de un "0" que después salta al valor real
        <div className="mt-1 h-8 w-32 animate-pulse rounded bg-surface-2" />
      ) : (
        <div className="mt-1 text-2xl font-bold text-text">{valor}</div>
      )}
      {nota && <div className="mt-1 text-xs text-text-muted">{nota}</div>}
    </div>
  );
}

/** Filas fantasma mientras llega la respuesta (evita el flash de "sin datos"). */
function FilasSkeleton({ cols, filas = 4 }: { cols: number; filas?: number }) {
  return (
    <>
      {Array.from({ length: filas }, (_, i) => (
        <tr key={i} className="border-b border-border-app/60">
          <td colSpan={cols} className="px-4 py-3">
            <div className="h-4 animate-pulse rounded bg-surface-2" />
          </td>
        </tr>
      ))}
    </>
  );
}

export default function FinancieroPage() {
  const { qs, nombreFiltro } = useInstitucionFiltro();
  const { t, locale } = useI18n();
  const [datos, setDatos] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Filtros: evento / mes / año (vacío = todos)
  const [fEvento, setFEvento] = useState('');
  const [fMes, setFMes] = useState('');
  const [fAnio, setFAnio] = useState('');

  const money = useCallback(
    (v: number) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
      }).format(v ?? 0),
    [locale],
  );

  const cargar = useCallback(() => {
    // qs viene como '' o '?idInstitucion=N' → se le suman los filtros activos
    const p = new URLSearchParams(qs.startsWith('?') ? qs.slice(1) : qs);
    if (fEvento) p.set('idEvento', fEvento);
    if (fMes) p.set('mes', fMes);
    if (fAnio) p.set('anio', fAnio);
    const q = p.toString();
    return api.get<Resumen>(`/finanzas/resumen${q ? `?${q}` : ''}`);
  }, [qs, fEvento, fMes, fAnio]);

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

  // Nombres de mes en el idioma activo (sin listas hardcodeadas)
  const nombreMes = (m: number) => {
    const s = new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2026, m - 1, 1));
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  /** Exporta todo el reporte financiero visible (4 hojas). */
  function exportarExcel() {
    if (!datos) return;
    const resumen = [
      { [t('x.metric')]: t('fin.collected'), [t('x.value')]: datos.totales.recaudado },
      { [t('x.metric')]: t('fin.payments'), [t('x.value')]: datos.totales.numPagos },
      { [t('x.metric')]: t('fin.freeTickets'), [t('x.value')]: datos.totales.numGratuitos },
    ];
    const porEvento = datos.porEvento.map((e) => ({
      [t('ev.event')]: e.TITULO ?? `#${e.ID_EVENTO}`,
      [t('fin.date')]: e.FECHA_EVENTO ? new Date(e.FECHA_EVENTO).toLocaleDateString(locale) : '',
      [t('fin.collected')]: e.RECAUDADO,
      [t('fin.numPay')]: e.NUM_PAGOS,
    }));
    const porMes = datos.porMes.map((m) => ({
      [t('fin.month')]: m.MES,
      [t('fin.collected')]: m.RECAUDADO,
      [t('fin.numPay')]: m.NUM_PAGOS,
    }));
    const pagos = datos.ultimosPagos.map((p) => ({
      [t('ev.event')]: p.TITULO ?? '',
      [t('fin.amount')]: p.MONTO,
      [t('fin.method')]: `${p.METODO_PAGO ?? ''}${p.ULTIMOS_4 ? ` ••••${p.ULTIMOS_4}` : ''}`.trim(),
      [t('fin.date')]: p.FECHA ? new Date(p.FECHA).toLocaleDateString(locale) : '',
    }));
    void descargarExcel('finance-report', [
      { nombre: t('x.summary'), filas: resumen },
      { nombre: t('x.byEvent'), filas: porEvento },
      { nombre: t('x.byMonth'), filas: porMes },
      { nombre: t('x.payments'), filas: pagos },
    ]);
  }

  const grafico = useMemo(
    () =>
      datos?.porEvento
        .filter((e) => e.RECAUDADO > 0)
        .map((e) => ({
          nombre:
            (e.TITULO ?? t('fin.eventN', { id: e.ID_EVENTO })).length > 22
              ? `${(e.TITULO ?? '').slice(0, 22)}…`
              : (e.TITULO ?? t('fin.eventN', { id: e.ID_EVENTO })),
          [t('fin.collectedSeries')]: e.RECAUDADO,
        })) ?? [],
    [datos, t],
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('fin.title')}</h1>
          <p className="text-sm text-text-2">
            {nombreFiltro
              ? t('us.filtering', { name: nombreFiltro })
              : t('fin.subtitle')}
          </p>
        </div>
        <button
          onClick={exportarExcel}
          disabled={cargando || !datos}
          className="rounded-lg bg-success/15 px-4 py-2 text-sm font-semibold text-success hover:bg-success/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ⬇️ {t('c.excel')}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {/* Filtros: evento / mes / año */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <select
          value={fEvento}
          onChange={(e) => setFEvento(e.target.value)}
          className="rounded-lg border border-border-app bg-surface px-3 py-2 text-sm text-text"
        >
          <option value="">{t('fin.allEvents')}</option>
          {datos?.eventos.map((e) => (
            <option key={e.ID_EVENTO} value={String(e.ID_EVENTO)}>
              {e.TITULO ?? t('fin.eventN', { id: e.ID_EVENTO })}
            </option>
          ))}
        </select>
        <select
          value={fMes}
          onChange={(e) => setFMes(e.target.value)}
          className="rounded-lg border border-border-app bg-surface px-3 py-2 text-sm text-text"
        >
          <option value="">{t('fin.allMonths')}</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={String(m)}>{nombreMes(m)}</option>
          ))}
        </select>
        <select
          value={fAnio}
          onChange={(e) => setFAnio(e.target.value)}
          className="rounded-lg border border-border-app bg-surface px-3 py-2 text-sm text-text"
        >
          <option value="">{t('fin.allYears')}</option>
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((a) => (
            <option key={a} value={String(a)}>{a}</option>
          ))}
        </select>
        {(fEvento || fMes || fAnio) && (
          <button
            type="button"
            onClick={() => { setFEvento(''); setFMes(''); setFAnio(''); }}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-brand hover:bg-surface-2"
          >
            {t('fin.clear')}
          </button>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Card
          titulo={t('fin.collected')}
          valor={money(datos?.totales.recaudado ?? 0)}
          cargando={cargando}
        />
        <Card
          titulo={t('fin.payments')}
          valor={String(datos?.totales.numPagos ?? 0)}
          cargando={cargando}
        />
        <Card
          titulo={t('fin.freeTickets')}
          valor={String(datos?.totales.numGratuitos ?? 0)}
          cargando={cargando}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-border-app bg-surface p-5">
        <h2 className="mb-4 font-semibold text-text">{t('fin.byEvent')}</h2>
        {cargando ? (
          <div className="h-[300px] animate-pulse rounded-xl bg-surface-2" />
        ) : grafico.length ? (
          <FinancieroBarChart
            data={grafico}
            keyRecaudado={t('fin.collectedSeries')}
            formatearMonto={money}
          />
        ) : (
          <p className="py-8 text-center text-text-muted">
            {t('fin.noData')}
          </p>
        )}
      </div>

      {/* Listado de ingresos por evento */}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-border-app bg-surface">
        <div className="border-b border-border-app px-5 py-3 font-semibold text-text">
          {t('fin.byEvent')}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-app text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-4 py-3">{t('ev.event')}</th>
              <th className="px-4 py-3">{t('fin.date')}</th>
              <th className="px-4 py-3">{t('fin.collected')}</th>
              <th className="px-4 py-3">{t('fin.numPay')}</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <FilasSkeleton cols={4} />}
            {!cargando &&
              datos?.porEvento.map((e) => (
                <tr key={e.ID_EVENTO} className="border-b border-border-app/60">
                  <td className="px-4 py-3 font-medium text-text">{e.TITULO ?? `#${e.ID_EVENTO}`}</td>
                  <td className="px-4 py-3 text-text-2">
                    {e.FECHA_EVENTO ? new Date(e.FECHA_EVENTO).toLocaleDateString(locale) : '—'}
                  </td>
                  <td className="px-4 py-3 text-success">{money(e.RECAUDADO)}</td>
                  <td className="px-4 py-3 text-text-2">{e.NUM_PAGOS}</td>
                </tr>
              ))}
            {!cargando && (!datos || datos.porEvento.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-muted">{t('fin.noData')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Ingresos por mes (respeta los filtros activos) */}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-border-app bg-surface">
        <div className="border-b border-border-app px-5 py-3 font-semibold text-text">
          {t('fin.byMonth')}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-app text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-4 py-3">{t('fin.month')}</th>
              <th className="px-4 py-3">{t('fin.collected')}</th>
              <th className="px-4 py-3">{t('fin.numPay')}</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <FilasSkeleton cols={3} filas={3} />}
            {!cargando &&
              datos?.porMes.map((m) => (
                <tr key={m.MES} className="border-b border-border-app/60">
                  <td className="px-4 py-3 font-medium text-text">{m.MES}</td>
                  <td className="px-4 py-3 text-success">{money(m.RECAUDADO)}</td>
                  <td className="px-4 py-3 text-text-2">{m.NUM_PAGOS}</td>
                </tr>
              ))}
            {!cargando && (!datos || datos.porMes.length === 0) && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-text-muted">{t('fin.noData')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border-app bg-surface">
        <div className="border-b border-border-app px-5 py-3 font-semibold text-text">
          {t('fin.lastPayments')}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-app text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-4 py-3">{t('ev.event')}</th>
              <th className="px-4 py-3">{t('fin.amount')}</th>
              <th className="px-4 py-3">{t('fin.method')}</th>
              <th className="px-4 py-3">{t('fin.date')}</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <FilasSkeleton cols={4} />}
            {!cargando &&
              datos?.ultimosPagos.map((p) => (
                <tr key={p.ID_PAGO} className="border-b border-border-app/60">
                  <td className="px-4 py-3 font-medium text-text">
                    {p.TITULO ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-success">
                    {money(p.MONTO)}
                  </td>
                  <td className="px-4 py-3 text-text-2">
                    {p.METODO_PAGO ?? '—'}
                    {p.ULTIMOS_4 ? ` ••••${p.ULTIMOS_4}` : ''}
                  </td>
                  <td className="px-4 py-3 text-text-2">
                    {p.FECHA ? new Date(p.FECHA).toLocaleDateString(locale) : '—'}
                  </td>
                </tr>
              ))}
            {!cargando && (!datos || datos.ultimosPagos.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-muted">
                  {t('fin.noPayments')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
