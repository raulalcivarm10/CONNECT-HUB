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
 * Barras apiladas de asistencia por evento (reportes/asistencia).
 *
 * Vive en su propio módulo para poder cargarse con `next/dynamic({ ssr:false })`:
 * recharts pesa ~300-400 KB y el gráfico está bajo el fold, así que no debe
 * entrar en el first-load de la ruta. Las claves de serie llegan ya traducidas
 * desde la página (deben coincidir con las claves de `data`).
 */
export default function AsistenciaBarChart({
  data,
  keyAsistieron,
  keyNoAsistieron,
  keyPendientes,
}: {
  data: Array<Record<string, string | number>>;
  keyAsistieron: string;
  keyNoAsistieron: string;
  keyPendientes: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="nombre" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
        <YAxis
          tick={{ fill: 'var(--text-2)', fontSize: 12 }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text)',
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey={keyAsistieron}
          stackId="a"
          fill="var(--success)"
          radius={[0, 0, 0, 0]}
        />
        <Bar dataKey={keyNoAsistieron} stackId="a" fill="var(--danger)" />
        <Bar
          dataKey={keyPendientes}
          stackId="a"
          fill="var(--brand)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
