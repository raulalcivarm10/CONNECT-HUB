'use client';

/**
 * Quiénes entraron con el CÓDIGO de la institución: nombre y correo.
 *
 * SOLO SYSTEM y super. Son datos personales de gente que puede no haber
 * participado en ningún evento todavía, así que no se abren al resto de roles
 * (el endpoint del API también lo restringe; esto es la puerta visual).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { descargarExcel } from '@/lib/excel';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth/auth-context';
import { useInstitucionFiltro } from '@/lib/institucion-context';
import { puedeVer, ROL } from '@/lib/types';

interface Vinculado {
  idCliente: string;
  idInstitucion: number;
  institucion: string;
  codigo: string | null;
  nombre: string;
  email: string | null;
  emailFactura: string | null;
  estado: string | null;
  fechaVinculo: string | null;
  plataforma: string | null;
}

interface Datos {
  total: number;
  conDispositivo: number;
  items: Vinculado[];
}

export default function ReporteVinculados() {
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const { idInstitucion } = useInstitucionFiltro();

  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const autorizado = puedeVer(user, [ROL.SYSTEM]);

  useEffect(() => {
    if (user && !autorizado) router.replace('/panel');
  }, [user, autorizado, router]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (idInstitucion) p.set('idInstitucion', String(idInstitucion));
      const q = p.toString();
      setDatos(await api.get<Datos>(`/reportes/vinculados${q ? `?${q}` : ''}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('c.error'));
    } finally {
      setCargando(false);
    }
  }, [idInstitucion, t]);

  useEffect(() => {
    if (autorizado) void cargar();
  }, [autorizado, cargar]);

  // El filtro de texto se hace en el navegador: la lista es de cientos, no de
  // miles, y así escribir no dispara una petición por tecla.
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q || !datos) return datos?.items ?? [];
    return datos.items.filter(
      (v) =>
        v.nombre.toLowerCase().includes(q) ||
        (v.email ?? '').toLowerCase().includes(q),
    );
  }, [busqueda, datos]);

  async function exportar() {
    await descargarExcel('institution-code-signups', [
      {
        nombre: 'Signups',
        filas: filtrados.map((v) => ({
          [t('vin.colInstitution')]: v.institucion,
          [t('vin.colCode')]: v.codigo ?? '',
          [t('vin.colName')]: v.nombre,
          [t('vin.colEmail')]: v.email ?? '',
          [t('vin.colBillingEmail')]: v.emailFactura ?? '',
          [t('vin.colJoined')]: v.fechaVinculo ?? '',
          [t('vin.colDevice')]: v.plataforma ?? '',
        })),
      },
    ]);
  }

  if (!autorizado) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('vin.title')}</h1>
          <p className="text-sm text-text-muted">{t('vin.subtitle')}</p>
        </div>
        <button
          onClick={exportar}
          disabled={!filtrados.length}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {t('c.excel')}
        </button>
      </div>

      {datos ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border-app bg-surface p-4">
            <div className="text-3xl font-bold text-text">{datos.total}</div>
            <div className="text-sm text-text-muted">{t('vin.statTotal')}</div>
          </div>
          <div className="rounded-xl border border-border-app bg-surface p-4">
            <div className="text-3xl font-bold text-text">{datos.conDispositivo}</div>
            <div className="text-sm text-text-muted">{t('vin.statDevice')}</div>
            {/* Aviso honesto: hoy solo se detecta iOS. Sin esto el número se lee
                como "solo N tienen la app", que es falso. */}
            <div className="mt-1 text-xs text-text-muted">{t('vin.statDeviceNote')}</div>
          </div>
        </div>
      ) : null}

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder={t('vin.search')}
        className="w-full max-w-sm rounded-lg border border-border-app bg-surface-alt px-3 py-2 text-sm text-text outline-none focus:border-brand"
      />

      {error ? (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border-app bg-surface">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border-app text-xs uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-4 py-3">{t('vin.colName')}</th>
              <th className="px-4 py-3">{t('vin.colEmail')}</th>
              <th className="px-4 py-3">{t('vin.colInstitution')}</th>
              <th className="px-4 py-3">{t('vin.colJoined')}</th>
              <th className="px-4 py-3">{t('vin.colDevice')}</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-muted">
                  {t('c.loading')}
                </td>
              </tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-muted">
                  {t('vin.empty')}
                </td>
              </tr>
            ) : (
              filtrados.map((v) => (
                <tr key={`${v.idCliente}-${v.idInstitucion}`} className="border-b border-border-app/60">
                  <td className="px-4 py-3 font-medium text-text">{v.nombre}</td>
                  <td className="px-4 py-3 text-text-muted">{v.email ?? '—'}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {v.institucion}
                    {v.codigo ? (
                      <span className="ml-2 rounded bg-surface-alt px-1.5 py-0.5 text-xs">
                        {v.codigo}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {v.fechaVinculo?.replace('T', ' ') ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{v.plataforma ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
