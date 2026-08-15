'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useDialogo } from '@/lib/dialogo';
import { useI18n } from '@/lib/i18n';
import {
  etiquetaCatalogo,
  fechaLegible,
  type LicenciaCreada,
  type LicenciaRow,
  type TipoLicencia,
} from '@/lib/suscripciones';
import { ValorCopiable } from '@/components/integraciones/llave-institucion';

/** LICENCIAS_ONPREMISE.ESTADO: ACTIVA | VENCIDA | REVOCADA */
const ESTADO_STYLE: Record<string, string> = {
  ACTIVA: 'bg-success/10 text-success',
  VENCIDA: 'bg-amber-500/10 text-amber-500',
  REVOCADA: 'bg-danger/10 text-danger',
};

/**
 * Diálogo del token recién emitido.
 *
 * El token en claro llega UNA sola vez: si se cierra sin copiarlo, se pierde y
 * hay que emitir otra licencia. Por eso no se cierra al hacer clic fuera ni con
 * Escape — solo con el botón, que va debajo de la advertencia.
 *
 * Reutiliza el lenguaje visual de `lib/dialogo.tsx` (mismo overlay, mismo
 * contenedor) y el `ValorCopiable` de integraciones para el botón de copiar.
 */
function DialogoToken({
  licencia,
  onClose,
}: {
  licencia: LicenciaCreada;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="anim-fade fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        className="anim-pop w-full max-w-lg rounded-2xl border border-border-app bg-surface p-6 shadow-2xl"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-7 w-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
          </svg>
        </div>
        <h2 className="text-center text-lg font-semibold text-text">
          {t('lic.tokenTitle')}
        </h2>
        <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-center text-sm font-semibold text-amber-500">
          {t('lic.tokenWarn')}
        </p>
        <div className="mt-3">
          <ValorCopiable valor={licencia.token} destacado />
        </div>
        <p className="mt-2 text-xs text-text-muted">
          {t('lic.tokenAfter', { prefix: licencia.tokenPrefijo })}
        </p>
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="min-w-32 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {t('lic.tokenSaved')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Licencias on-premise de una institución: las emite el superadmin, se listan
 * por prefijo y se pueden revocar. La de PRUEBA dura 5 días; la PERMANENTE
 * habilita el on-premise sin caducidad.
 */
export function LicenciasOnpremise({
  idInstitucion,
  nombre,
}: {
  idInstitucion: number;
  nombre: string;
}) {
  const { t, locale } = useI18n();
  const dialogo = useDialogo();
  const [items, setItems] = useState<LicenciaRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emitiendo, setEmitiendo] = useState<TipoLicencia | null>(null);
  const [nueva, setNueva] = useState<LicenciaCreada | null>(null);

  const cargar = useCallback(async () => {
    setItems(
      await api.get<LicenciaRow[]>(`/instituciones/${idInstitucion}/licencias`),
    );
  }, [idInstitucion]);

  useEffect(() => {
    setCargando(true);
    setError(null);
    cargar()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCargando(false));
  }, [cargar]);

  async function emitir(tipo: TipoLicencia) {
    const confirmado = await dialogo.confirmar({
      titulo:
        tipo === 'PRUEBA'
          ? t('lic.issueTrialTitle', { name: nombre })
          : t('lic.issuePermTitle', { name: nombre }),
      mensaje: t('lic.issueMsg'),
      tono: tipo === 'PRUEBA' ? 'info' : 'warning',
      confirmar: t('lic.issueDo'),
    });
    if (!confirmado) return;
    setError(null);
    setEmitiendo(tipo);
    try {
      const res = await api.post<LicenciaCreada>(
        `/instituciones/${idInstitucion}/licencias`,
        { tipo },
      );
      setNueva(res);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('c.error'));
    } finally {
      setEmitiendo(null);
    }
  }

  async function revocar(l: LicenciaRow) {
    const confirmado = await dialogo.confirmar({
      titulo: t('lic.revokeTitle', { prefix: l.tokenPrefijo }),
      mensaje: t('lic.revokeMsg'),
      tono: 'danger',
      confirmar: t('lic.revokeDo'),
    });
    if (!confirmado) return;
    setError(null);
    try {
      await api.post(`/licencias/${l.idLicencia}/revocar`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('c.error'));
    }
  }

  return (
    <div className="rounded-xl border border-border-app bg-surface-2/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-text">{t('lic.title')}</div>
          <p className="mt-0.5 text-xs text-text-muted">{t('lic.hint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => emitir('PRUEBA')}
            disabled={emitiendo !== null}
            className="rounded-lg border border-border-app px-3 py-1.5 text-xs font-semibold text-text-2 hover:bg-surface-2 disabled:opacity-50"
          >
            {emitiendo === 'PRUEBA' ? t('c.saving') : t('lic.newTrial')}
          </button>
          <button
            type="button"
            onClick={() => emitir('PERMANENTE')}
            disabled={emitiendo !== null}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {emitiendo === 'PERMANENTE' ? t('c.saving') : t('lic.newPerm')}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-3 overflow-x-auto rounded-lg border border-border-app bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-app text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2">{t('lic.type')}</th>
              <th className="px-3 py-2">{t('lic.key')}</th>
              <th className="px-3 py-2">{t('lic.issued')}</th>
              <th className="px-3 py-2">{t('lic.expires')}</th>
              <th className="px-3 py-2">{t('c.state')}</th>
              <th className="px-3 py-2">{t('lic.issuedBy')}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={7} className="px-3 py-3">
                  <div className="h-4 animate-pulse rounded bg-surface-2" />
                </td>
              </tr>
            )}
            {!cargando &&
              items.map((l) => (
                <tr key={l.idLicencia} className="border-b border-border-app/60">
                  <td className="px-3 py-2 font-medium text-text">
                    {etiquetaCatalogo(t, 'lic.tipo', l.tipo)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-2">
                    {l.tokenPrefijo}…
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-text-2">
                    {fechaLegible(l.fechaEmision, locale)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-text-2">
                    {l.fechaExp ? fechaLegible(l.fechaExp, locale) : t('lic.never')}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_STYLE[l.estado] ?? 'bg-surface-2 text-text-2'}`}
                    >
                      {etiquetaCatalogo(t, 'lic.st', l.estado)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-text-muted">
                    {l.emitidoPor ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {l.estado !== 'REVOCADA' && (
                      <button
                        type="button"
                        onClick={() => revocar(l)}
                        className="rounded-lg border border-border-app px-3 py-1 text-xs text-danger hover:bg-surface-2"
                      >
                        {t('lic.revokeDo')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            {!cargando && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-text-muted">
                  {t('lic.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {nueva && (
        <DialogoToken licencia={nueva} onClose={() => setNueva(null)} />
      )}
    </div>
  );
}
