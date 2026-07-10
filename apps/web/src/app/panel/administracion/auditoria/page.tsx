'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { useI18n } from '@/lib/i18n';

interface LogRow {
  ID_LOG: number;
  FECHA: string;
  USUARIO: string | null;
  ID_INSTITUCION: number | null;
  ACCION: string;
  METODO: string;
  RUTA: string;
  STATUS: number;
  IP: string | null;
  DETALLE: string | null;
}

const ACCIONES = ['LOGIN_OK', 'LOGIN_FAIL', 'CREATE', 'UPDATE', 'DELETE', 'ERROR'];

const BADGE: Record<string, string> = {
  LOGIN_OK: 'bg-success/10 text-success',
  LOGIN_FAIL: 'bg-danger/10 text-danger',
  CREATE: 'bg-brand/10 text-brand',
  UPDATE: 'bg-amber-500/10 text-amber-500',
  DELETE: 'bg-danger/10 text-danger',
  ERROR: 'bg-danger/10 text-danger',
};

export default function AuditoriaPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [accion, setAccion] = useState('');
  const [usuario, setUsuario] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    const qs = new URLSearchParams();
    if (accion) qs.set('accion', accion);
    if (usuario.trim()) qs.set('usuario', usuario.trim());
    if (desde) qs.set('desde', desde);
    if (hasta) qs.set('hasta', hasta);
    qs.set('limit', '200');
    setRows(await api.get<LogRow[]>(`/auditoria?${qs.toString()}`));
  }, [accion, usuario, desde, hasta]);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  if (!user?.esSuper) {
    return <p className="text-text-muted">{t('in.onlySuper')}</p>;
  }

  const inputCls =
    'rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-brand';

  return (
    <div>
      <h1 className="text-2xl font-bold text-text">{t('aud.title')}</h1>
      <p className="text-sm text-text-2">{t('aud.subtitle')}</p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <select value={accion} onChange={(e) => setAccion(e.target.value)} className={inputCls}>
          <option value="">{t('aud.all')}</option>
          {ACCIONES.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input
          placeholder={t('aud.user')}
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          className={`${inputCls} min-w-52`}
        />
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} title={t('aud.from')} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} title={t('aud.to')} />
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border-app bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-app text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-3 py-3">{t('aud.date')}</th>
              <th className="px-3 py-3">{t('aud.user')}</th>
              <th className="px-3 py-3">{t('aud.action')}</th>
              <th className="px-3 py-3">{t('aud.route')}</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <>
                <tr
                  key={r.ID_LOG}
                  onClick={() => setAbierto((a) => (a === r.ID_LOG ? null : r.ID_LOG))}
                  className="cursor-pointer border-b border-border-app/60 hover:bg-surface-2"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-text-2">{r.FECHA}</td>
                  <td className="max-w-56 truncate px-3 py-2 text-text">{r.USUARIO ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${BADGE[r.ACCION] ?? 'bg-surface-2 text-text-2'}`}>
                      {r.ACCION}
                    </span>
                  </td>
                  <td className="max-w-72 truncate px-3 py-2 font-mono text-xs text-text-2">
                    {r.METODO} {r.RUTA}
                  </td>
                  <td className={`px-3 py-2 font-semibold ${r.STATUS >= 400 ? 'text-danger' : 'text-success'}`}>
                    {r.STATUS}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-text-muted">{r.IP ?? '—'}</td>
                </tr>
                {abierto === r.ID_LOG && r.DETALLE && (
                  <tr key={`${r.ID_LOG}-d`} className="border-b border-border-app/60 bg-surface-2/60">
                    <td colSpan={6} className="px-4 py-2">
                      <code className="block max-w-full whitespace-pre-wrap break-all text-xs text-text-2">
                        {r.DETALLE}
                      </code>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                  {t('aud.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
