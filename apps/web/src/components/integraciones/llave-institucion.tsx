'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useDialogo } from '@/lib/dialogo';
import { useAuth } from '@/lib/auth/auth-context';
import { useI18n } from '@/lib/i18n';

/** GET /api-keys/institucion — la llave propia de la institución */
export interface LlaveInstitucionResp {
  idInstitucion: number;
  institucion: string;
  apiKey: string;
  desde: string | null;
}

/** Valor en mono, seleccionable, con botón de copiar y feedback */
export function ValorCopiable({
  valor,
  destacado = false,
}: {
  valor: string;
  /** borde de marca (tarjeta principal) vs. borde neutro (uso compacto) */
  destacado?: boolean;
}) {
  const { t } = useI18n();
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin permiso de portapapeles: el valor está visible para copiarlo a mano */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code
        className={`min-w-0 flex-1 select-all break-all rounded-lg border bg-surface-2 px-3 py-2 font-mono text-sm text-text ${
          destacado ? 'border-brand/40' : 'border-border-app'
        }`}
      >
        {valor}
      </code>
      <button
        type="button"
        onClick={copiar}
        className="shrink-0 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        {copiado ? t('int.copied') : t('int.copy')}
      </button>
    </div>
  );
}

/**
 * Tarjeta de la API key propia de la institución (columna API_KEY_CHECKIN).
 * A diferencia de las llaves adicionales, esta SIEMPRE se puede consultar:
 * es la que se entrega al equipo/proveedor del lector de QR.
 *
 * `compacta` la muestra sin el botón de regenerar (con enlace a Integraciones),
 * para incrustarla en Mi institución.
 */
export function LlaveInstitucion({
  compacta = false,
  idInstitucion,
  onRegenerada,
}: {
  compacta?: boolean;
  /** superadmin: opera sobre otra institución */
  idInstitucion?: number;
  onRegenerada?: (msg: string) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const dialogo = useDialogo();
  const [llave, setLlave] = useState<LlaveInstitucionResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const qs = idInstitucion != null ? `?idInstitucion=${idInstitucion}` : '';
  // El superadmin no tiene institución propia: hasta que el selector superior
  // resuelva una (el contexto la restaura de localStorage en un efecto, así
  // que el primer render llega vacío) NO se pide nada — si no, el error del
  // intento en vacío quedaba pegado en pantalla.
  const esperandoInstitucion = !!user?.esSuper && idInstitucion == null;

  const cargar = useCallback(async () => {
    setLlave(await api.get<LlaveInstitucionResp>(`/api-keys/institucion${qs}`));
  }, [qs]);

  useEffect(() => {
    if (esperandoInstitucion) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null); // cada recarga parte limpia
    cargar()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCargando(false));
  }, [cargar, esperandoInstitucion]);

  async function regenerar() {
    const confirmado = await dialogo.confirmar({
      titulo: t('int.instRegenTitle'),
      mensaje: t('int.instRegenMsg'),
      tono: 'danger',
      confirmar: t('int.instRegen'),
    });
    if (!confirmado) return;
    setError(null);
    try {
      await api.post(
        '/api-keys/institucion/regenerar',
        idInstitucion != null ? { idInstitucion } : {},
      );
      await cargar();
      onRegenerada?.(t('int.instRegenOk'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('c.error'));
    }
  }

  if (esperandoInstitucion) {
    return (
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-text-muted">
        {t('int.instPickFirst')}
      </p>
    );
  }
  if (cargando) {
    return <p className="text-sm text-text-muted">{t('c.loading')}</p>;
  }
  if (error) {
    return (
      <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
        {error}
      </p>
    );
  }
  if (!llave) return null;

  if (compacta) {
    return (
      <div className="rounded-2xl border border-border-app bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-text">{t('int.instTitle')}</div>
          <Link
            href="/panel/administracion/integraciones"
            className="rounded-lg border border-border-app px-3 py-1 text-xs font-semibold text-text-2 hover:bg-surface-2"
          >
            {t('int.instManage')}
          </Link>
        </div>
        <p className="mt-1 text-xs text-text-muted">{t('int.instHint')}</p>
        <div className="mt-2">
          <ValorCopiable valor={llave.apiKey} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-brand/40 bg-brand/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-bold text-text">
            {t('int.instTitle')}
          </div>
          <p className="mt-0.5 text-sm text-text-2">{t('int.instHint')}</p>
        </div>
        <button
          type="button"
          onClick={regenerar}
          className="rounded-lg border border-danger/40 px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/10"
        >
          {t('int.instRegen')}
        </button>
      </div>
      <div className="mt-3">
        <ValorCopiable valor={llave.apiKey} destacado />
      </div>
      <p className="mt-2 text-xs text-text-muted">
        {llave.desde
          ? t('int.instSince', { date: llave.desde })
          : t('int.instSinceUnknown')}
      </p>
    </div>
  );
}
