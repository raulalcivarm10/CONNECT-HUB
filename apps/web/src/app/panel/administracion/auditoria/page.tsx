'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { descargarExcel } from '@/lib/excel';
import { useI18n } from '@/lib/i18n';
import { ROL } from '@/lib/types';
import type { InstitucionRow } from '@/lib/types';

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

/** shape nuevo de GET /auditoria */
interface AuditoriaResp {
  items: LogRow[];
  total: number;
  limit: number;
  offset: number;
}

const ACCIONES = [
  'LOGIN_OK',
  'LOGIN_FAIL',
  'CREATE',
  'UPDATE',
  'DELETE',
  'ERROR',
  'APROBAR_SALON',
  'PUBLICAR',
  'RECHAZAR_EVENTO',
  'SUSPENDER_EVENTO',
  'REPUBLICAR',
  'DESTACAR',
  'CAMBIO_ROLES',
  'USUARIO_ESTADO',
  'INST_APROBAR',
  'INST_RECHAZAR',
  'INST_SUSPENDER',
  'INST_REACTIVAR',
];

const BADGE: Record<string, string> = {
  LOGIN_OK: 'bg-success/10 text-success',
  LOGIN_FAIL: 'bg-danger/10 text-danger',
  CREATE: 'bg-brand/10 text-brand',
  UPDATE: 'bg-amber-500/10 text-amber-500',
  DELETE: 'bg-danger/10 text-danger',
  ERROR: 'bg-danger/10 text-danger',
  // aprobaciones/publicación en verde; rechazos en rojo; cambios sensibles en ámbar
  APROBAR_SALON: 'bg-success/10 text-success',
  PUBLICAR: 'bg-success/10 text-success',
  RECHAZAR_EVENTO: 'bg-danger/10 text-danger',
  SUSPENDER_EVENTO: 'bg-amber-500/10 text-amber-500',
  REPUBLICAR: 'bg-success/10 text-success',
  DESTACAR: 'bg-amber-500/10 text-amber-500',
  CAMBIO_ROLES: 'bg-amber-500/10 text-amber-500',
  USUARIO_ESTADO: 'bg-amber-500/10 text-amber-500',
  INST_APROBAR: 'bg-success/10 text-success',
  INST_RECHAZAR: 'bg-danger/10 text-danger',
  INST_SUSPENDER: 'bg-danger/10 text-danger',
  INST_REACTIVAR: 'bg-success/10 text-success',
};

/** chips rápidos → conjunto de acciones (se filtra en cliente sobre las últimas 200) */
const GRUPOS: Record<string, readonly string[]> = {
  APROBACIONES: [
    'APROBAR_SALON',
    'PUBLICAR',
    'RECHAZAR_EVENTO',
    'SUSPENDER_EVENTO',
    'REPUBLICAR',
    'INST_APROBAR',
    'INST_RECHAZAR',
    'INST_SUSPENDER',
    'INST_REACTIVAR',
  ],
  LOGINS: ['LOGIN_OK', 'LOGIN_FAIL'],
  ERRORES: ['ERROR'],
};

const LIMIT = 50;
const LIMIT_GRUPO = 200;

/** recursos conocidos de las rutas CRUD → sufijo de key i18n */
const RECURSOS: Record<string, string> = {
  eventos: 'EVENTO',
  usuarios: 'USUARIO',
  instituciones: 'INSTITUCION',
  locales: 'LOCAL',
  salones: 'SALON',
};

/**
 * Frase legible de ACCION+METODO+RUTA (con la ruta decodificada):
 * "Aprobó el salón del evento #262", "Cambió los roles de raul@x.com", …
 * Fallback: ACCION + ruta cruda.
 */
function descripcionLog(
  t: (k: string, v?: Record<string, string | number>) => string,
  r: LogRow,
): string {
  let ruta = r.RUTA;
  try {
    ruta = decodeURIComponent(r.RUTA);
  } catch {
    /* ruta con % inválido: se usa cruda */
  }
  const seg = ruta.split('?')[0].split('/').filter(Boolean);
  const id = seg[1] ?? '';
  // ids numéricos como "#262"; códigos/correos tal cual
  const disp = id ? (/^\d+$/.test(id) ? `#${id}` : id) : '—';
  switch (r.ACCION) {
    case 'LOGIN_OK':
      return t('aud.dLOGIN_OK');
    case 'LOGIN_FAIL':
      return t('aud.dLOGIN_FAIL');
    case 'APROBAR_SALON':
      return t('aud.dAPROBAR_SALON', { id: disp });
    case 'PUBLICAR':
      return t('aud.dPUBLICAR', { id: disp });
    case 'RECHAZAR_EVENTO':
      return t('aud.dRECHAZAR_EVENTO', { id: disp });
    case 'SUSPENDER_EVENTO':
      return t('aud.dSUSPENDER_EVENTO', { id: disp });
    case 'REPUBLICAR':
      return t('aud.dREPUBLICAR', { id: disp });
    case 'DESTACAR':
      return t('aud.dDESTACAR', { id: disp });
    case 'CAMBIO_ROLES':
      return t('aud.dCAMBIO_ROLES', { user: disp });
    case 'USUARIO_ESTADO':
      return t('aud.dUSUARIO_ESTADO', { user: disp });
    case 'INST_APROBAR':
      return t('aud.dINST_APROBAR', { id: disp });
    case 'INST_RECHAZAR':
      return t('aud.dINST_RECHAZAR', { id: disp });
    case 'INST_SUSPENDER':
      return t('aud.dINST_SUSPENDER', { id: disp });
    case 'INST_REACTIVAR':
      return t('aud.dINST_REACTIVAR', { id: disp });
    case 'CREATE':
    case 'UPDATE':
    case 'DELETE': {
      const res = RECURSOS[seg[0] ?? ''];
      if (res) {
        if (r.ACCION === 'CREATE' && !seg[1]) {
          return t('aud.dCREATE', { res: t(`aud.r${res}`) });
        }
        const frase = t(`aud.r${res}1`, { id: disp });
        return t(r.ACCION === 'DELETE' ? 'aud.dDELETE' : 'aud.dUPDATE', {
          res: frase,
        });
      }
      break;
    }
  }
  return `${r.ACCION} ${ruta}`;
}

export default function AuditoriaPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const esSuper = !!user?.esSuper;
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [accion, setAccion] = useState('');
  const [grupo, setGrupo] = useState<keyof typeof GRUPOS | null>(null);
  const [usuario, setUsuario] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [idInstitucion, setIdInstitucion] = useState('');
  const [instituciones, setInstituciones] = useState<InstitucionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);

  // SYSTEM de institución también puede ver (el server acota a su institución)
  const tieneAcceso = esSuper || !!user?.roles.includes(ROL.SYSTEM);

  const cargar = useCallback(async () => {
    const qs = new URLSearchParams();
    if (!grupo && accion) qs.set('accion', accion);
    if (usuario.trim()) qs.set('usuario', usuario.trim());
    if (desde) qs.set('desde', desde);
    if (hasta) qs.set('hasta', hasta);
    if (esSuper && idInstitucion) qs.set('idInstitucion', idInstitucion);
    // chip activo: trae las últimas 200 y filtra en cliente (el API filtra 1 sola acción)
    qs.set('limit', String(grupo ? LIMIT_GRUPO : LIMIT));
    qs.set('offset', String(grupo ? 0 : offset));
    const res = await api.get<AuditoriaResp>(`/auditoria?${qs.toString()}`);
    setRows(res.items);
    setTotal(res.total);
  }, [accion, grupo, usuario, desde, hasta, esSuper, idInstitucion, offset]);

  useEffect(() => {
    if (!tieneAcceso) return;
    cargar().catch((e) => setError(e.message));
  }, [cargar, tieneAcceso]);

  // cambiar cualquier filtro vuelve a la primera página
  useEffect(() => {
    setOffset(0);
  }, [accion, grupo, usuario, desde, hasta, idInstitucion]);

  // instituciones para el filtro (solo superadmin)
  useEffect(() => {
    if (!esSuper) return;
    api
      .get<InstitucionRow[]>('/instituciones')
      .then(setInstituciones)
      .catch(() => undefined);
  }, [esSuper]);

  if (!tieneAcceso) {
    return <p className="text-text-muted">{t('aud.noAccess')}</p>;
  }

  const mostrados = grupo
    ? rows.filter((r) => GRUPOS[grupo].includes(r.ACCION))
    : rows;
  const desde1 = total === 0 ? 0 : offset + 1;
  const hasta1 = offset + rows.length;

  const inputCls =
    'rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-brand';
  const chipCls = (activo: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
      activo
        ? 'border-brand bg-brand/15 text-brand'
        : 'border-border-app text-text-2 hover:bg-surface-2'
    }`;

  return (
    <div>
      <h1 className="text-2xl font-bold text-text">{t('aud.title')}</h1>
      <p className="text-sm text-text-2">{t('aud.subtitle')}</p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <select
          value={accion}
          onChange={(e) => {
            setAccion(e.target.value);
            setGrupo(null);
          }}
          className={inputCls}
        >
          <option value="">{t('aud.all')}</option>
          {ACCIONES.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        {esSuper && (
          <select
            value={idInstitucion}
            onChange={(e) => setIdInstitucion(e.target.value)}
            className={inputCls}
            title={t('us.institution')}
          >
            <option value="">{t('aud.allInst')}</option>
            {instituciones.map((i) => (
              <option key={i.ID_INSTITUCION} value={i.ID_INSTITUCION}>
                {i.NOMBRE}
              </option>
            ))}
          </select>
        )}
        <input
          placeholder={t('aud.user')}
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          className={`${inputCls} min-w-52`}
        />
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} title={t('aud.from')} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} title={t('aud.to')} />
        <button
          onClick={() =>
            void descargarExcel('audit-log', [
              {
                nombre: t('x.audit'),
                filas: mostrados.map((r) => ({
                  [t('aud.date')]: r.FECHA,
                  [t('aud.user')]: r.USUARIO,
                  [t('aud.action')]: r.ACCION,
                  [t('aud.desc')]: descripcionLog(t, r),
                  [t('aud.route')]: `${r.METODO} ${r.RUTA}`,
                  [t('aud.status')]: r.STATUS,
                  [t('aud.ip')]: r.IP,
                  Detail: r.DETALLE,
                })),
              },
            ])
          }
          disabled={mostrados.length === 0}
          className="rounded-lg bg-success/15 px-4 py-2 text-sm font-semibold text-success hover:bg-success/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ⬇️ {t('c.excel')}
        </button>
      </div>

      {/* chips rápidos */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {(
          [
            ['APROBACIONES', 'aud.chipApprovals'],
            ['LOGINS', 'aud.chipLogins'],
            ['ERRORES', 'aud.chipErrors'],
          ] as const
        ).map(([g, key]) => (
          <button
            key={g}
            onClick={() => {
              setGrupo((prev) => (prev === g ? null : g));
              setAccion('');
            }}
            className={chipCls(grupo === g)}
          >
            {t(key)}
          </button>
        ))}
        {grupo && (
          <span className="text-xs text-text-muted">{t('aud.chipNote')}</span>
        )}
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
              <th className="px-3 py-3">{t('aud.desc')}</th>
              <th className="px-3 py-3">{t('aud.status')}</th>
              <th className="px-3 py-3">{t('aud.ip')}</th>
            </tr>
          </thead>
          <tbody>
            {mostrados.map((r) => (
              <Fragment key={r.ID_LOG}>
                <tr
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
                  <td className="max-w-96 truncate px-3 py-2 text-text">
                    {descripcionLog(t, r)}
                  </td>
                  <td className={`px-3 py-2 font-semibold ${r.STATUS >= 400 ? 'text-danger' : 'text-success'}`}>
                    {r.STATUS}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-text-muted">{r.IP ?? '—'}</td>
                </tr>
                {abierto === r.ID_LOG && (
                  <tr className="border-b border-border-app/60 bg-surface-2/60">
                    <td colSpan={6} className="px-4 py-2">
                      <div className="font-mono text-xs text-text-2">
                        {r.METODO} {r.RUTA}
                      </div>
                      {r.DETALLE && (
                        <code className="mt-1 block max-w-full whitespace-pre-wrap break-all text-xs text-text-2">
                          {r.DETALLE}
                        </code>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {mostrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                  {t('aud.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* paginación (con chip activo se filtra en cliente y no hay páginas) */}
      {!grupo && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm text-text-2">
            {t('aud.range', { from: desde1, to: hasta1, total })}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}
              disabled={offset === 0}
              className="rounded-lg border border-border-app px-3 py-1.5 text-sm text-text-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ← {t('aud.prev')}
            </button>
            <button
              onClick={() => setOffset((o) => o + LIMIT)}
              disabled={offset + LIMIT >= total}
              className="rounded-lg border border-border-app px-3 py-1.5 text-sm text-text-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('aud.next')} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
