'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api/client';
import { useInstitucionFiltro } from '@/lib/institucion-context';
import { useI18n } from '@/lib/i18n';

interface Resumen {
  idInstitucion: number | null;
  totales: {
    recaudado: number;
    pendiente: number;
    numPagos: number;
    numGratuitos: number;
  };
  porEvento: Array<{
    ID_EVENTO: number;
    TITULO: string | null;
    FECHA_EVENTO: string | null;
    RECAUDADO: number;
    PENDIENTE: number;
    NUM_PAGOS: number;
  }>;
  porEstado: Array<{ ESTADO: string; N: number; TOTAL: number }>;
  ultimosPagos: Array<{
    ID_PAGO: number;
    TITULO: string | null;
    MONTO: number;
    MONEDA: string;
    ESTADO: string;
    METODO_PAGO: string | null;
    ULTIMOS_4: string | null;
    FECHA: string | null;
  }>;
}

const ESTADO_COLOR: Record<string, string> = {
  APPROVED: 'text-success',
  PENDIENTE: 'text-brand',
  GRATUITO: 'text-text-muted',
};

function Card({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-2xl border border-border-app bg-surface p-5">
      <div className="text-sm text-text-muted">{titulo}</div>
      <div className="mt-1 text-2xl font-bold text-text">{valor}</div>
      {nota && <div className="mt-1 text-xs text-text-muted">{nota}</div>}
    </div>
  );
}

export default function FinancieroPage() {
  const { qs, nombreFiltro } = useInstitucionFiltro();
  const { t, locale } = useI18n();
  const [datos, setDatos] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);

  const money = (v: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
    }).format(v ?? 0);

  const estadoPago = (estado: string) => {
    const traducido = t(`pay.${estado}`);
    return traducido === `pay.${estado}` ? estado : traducido;
  };

  const cargar = useCallback(async () => {
    setDatos(await api.get<Resumen>(`/finanzas/resumen${qs}`));
  }, [qs]);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  const grafico =
    datos?.porEvento
      .filter((e) => e.RECAUDADO > 0 || e.PENDIENTE > 0)
      .map((e) => ({
        nombre:
          (e.TITULO ?? t('fin.eventN', { id: e.ID_EVENTO })).length > 22
            ? `${(e.TITULO ?? '').slice(0, 22)}…`
            : (e.TITULO ?? t('fin.eventN', { id: e.ID_EVENTO })),
        [t('fin.collectedSeries')]: e.RECAUDADO,
        [t('fin.pendingSeries')]: e.PENDIENTE,
      })) ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-text">{t('fin.title')}</h1>
      <p className="text-sm text-text-2">
        {nombreFiltro
          ? t('us.filtering', { name: nombreFiltro })
          : t('fin.subtitle')}
      </p>

      {error && (
        <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          titulo={t('fin.collected')}
          valor={money(datos?.totales.recaudado ?? 0)}
        />
        <Card
          titulo={t('fin.pending')}
          valor={money(datos?.totales.pendiente ?? 0)}
        />
        <Card
          titulo={t('fin.payments')}
          valor={String(datos?.totales.numPagos ?? 0)}
        />
        <Card
          titulo={t('fin.freeTickets')}
          valor={String(datos?.totales.numGratuitos ?? 0)}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-border-app bg-surface p-5">
        <h2 className="mb-4 font-semibold text-text">{t('fin.byEvent')}</h2>
        {grafico.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={grafico}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="nombre"
                tick={{ fill: 'var(--text-2)', fontSize: 12 }}
              />
              <YAxis tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
              <Tooltip
                formatter={(v) => money(Number(v ?? 0))}
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text)',
                }}
              />
              <Bar dataKey={t('fin.collectedSeries')} fill="var(--success)" radius={[4, 4, 0, 0]} />
              <Bar dataKey={t('fin.pendingSeries')} fill="var(--brand)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-text-muted">
            {t('fin.noData')}
          </p>
        )}
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
              <th className="px-4 py-3">{t('c.state')}</th>
              <th className="px-4 py-3">{t('fin.method')}</th>
              <th className="px-4 py-3">{t('fin.date')}</th>
            </tr>
          </thead>
          <tbody>
            {datos?.ultimosPagos.map((p) => (
              <tr key={p.ID_PAGO} className="border-b border-border-app/60">
                <td className="px-4 py-3 font-medium text-text">
                  {p.TITULO ?? '—'}
                </td>
                <td className="px-4 py-3 text-text">
                  {money(p.MONTO)}
                </td>
                <td className={`px-4 py-3 ${ESTADO_COLOR[p.ESTADO] ?? 'text-text-2'}`}>
                  {estadoPago(p.ESTADO)}
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
            {(!datos || datos.ultimosPagos.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
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
