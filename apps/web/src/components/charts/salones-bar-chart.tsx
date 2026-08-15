'use client';

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

/**
 * Ranking de salones: días ocupados vs. reservas (reportes/salones).
 * Módulo aparte para cargar recharts con `next/dynamic({ ssr:false })` y
 * mantenerlo fuera del first-load de la ruta.
 */
export default function SalonesBarChart({
  data,
  keyDias,
  keyReservas,
}: {
  data: Array<Record<string, string | number>>;
  keyDias: string;
  keyReservas: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey={keyDias} fill="var(--brand)" radius={[4, 4, 0, 0]} />
        <Bar dataKey={keyReservas} fill="var(--success)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
