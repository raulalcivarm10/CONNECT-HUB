'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * Recaudado por evento (financiero). Módulo aparte para cargar recharts con
 * `next/dynamic({ ssr:false })` y no arrastrarlo al first-load de la ruta.
 * `formatearMonto` llega desde la página para respetar el locale activo.
 */
export default function FinancieroBarChart({
  data,
  keyRecaudado,
  formatearMonto,
}: {
  data: Array<Record<string, string | number>>;
  keyRecaudado: string;
  formatearMonto: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="nombre" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
        <YAxis tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
        <Tooltip
          formatter={(v) => formatearMonto(Number(v ?? 0))}
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text)',
          }}
        />
        <Bar dataKey={keyRecaudado} fill="var(--success)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
