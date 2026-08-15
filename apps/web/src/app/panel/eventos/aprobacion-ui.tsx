'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { EventoRow } from '@/lib/types';

/** Estados del flujo que aún no terminan en publicación */
export const ESTADOS_PENDIENTES = [
  'BORRADOR',
  'SALON_APROBADO',
  'REUBICADO',
] as const;

export const esPendiente = (e: EventoRow['estadoAprobacion']): boolean =>
  e != null && (ESTADOS_PENDIENTES as readonly string[]).includes(e);

/** REUBICADO equivale a salón resuelto: puede publicarse */
export const listoParaPublicar = (e: EventoRow['estadoAprobacion']): boolean =>
  e === 'SALON_APROBADO' || e === 'REUBICADO';

/** key i18n + clases de color por estado del flujo de aprobación */
export const ESTILO_APROBACION: Record<
  string,
  { labelKey: string; chip: string; banner: string }
> = {
  BORRADOR: {
    labelKey: 'ev.aprPendingVenue',
    chip: 'bg-amber-500/10 text-amber-500',
    banner: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
  },
  SALON_APROBADO: {
    labelKey: 'ev.aprPendingPublish',
    chip: 'bg-sky-500/10 text-sky-500',
    banner: 'border-sky-500/40 bg-sky-500/10 text-sky-500',
  },
  REUBICADO: {
    labelKey: 'ev.aprMoved',
    chip: 'bg-violet-500/10 text-violet-500',
    banner: 'border-violet-500/40 bg-violet-500/10 text-violet-500',
  },
  RECHAZADO: {
    labelKey: 'ev.aprRejected',
    chip: 'bg-danger/10 text-danger',
    banner: 'border-danger/40 bg-danger/10 text-danger',
  },
  /* retirado de la app temporalmente (conserva inscritos/pagos) */
  SUSPENDIDO: {
    labelKey: 'ev.aprSuspended',
    chip: 'bg-text-muted/15 text-text-muted',
    banner: 'border-text-muted/40 bg-text-muted/10 text-text-2',
  },
  /* solo para el banner (el badge de la lista oculta PUBLICADO) */
  PUBLICADO: {
    labelKey: 'ev.aprPublished',
    chip: 'bg-success/10 text-success',
    banner: 'border-success/40 bg-success/10 text-success',
  },
};

/**
 * Línea verde de confirmación del paso resuelto:
 * "✓ Salón aprobado/reubicado por X el fecha" o "✓ Publicado por X el fecha".
 */
export function LineaResuelto({ ev }: { ev: EventoRow }) {
  const { t } = useI18n();
  const estado = ev.estadoAprobacion;
  if (estado === 'SALON_APROBADO' || estado === 'REUBICADO') {
    return (
      <div className="text-sm font-medium text-success">
        {t(
          estado === 'REUBICADO'
            ? 'ev.aprRelocatedBy'
            : 'ev.aprVenueApprovedBy',
          {
            user: ev.salonAprobadoPor ?? '—',
            date: ev.fechaSalonAprobado ?? '—',
          },
        )}
      </div>
    );
  }
  if (estado === 'PUBLICADO') {
    return (
      <div className="text-sm font-medium text-success">
        {t('ev.aprPublishedBy', {
          user: ev.publicadoPor ?? '—',
          date: ev.fechaPublicado ?? '—',
        })}
      </div>
    );
  }
  return null;
}

/** Badge del flujo de aprobación (nada si es legado o ya está publicado) */
export function BadgeAprobacion({ ev }: { ev: EventoRow }) {
  const { t } = useI18n();
  const estado = ev.estadoAprobacion;
  if (estado == null || estado === 'PUBLICADO') return null;
  const estilo = ESTILO_APROBACION[estado];
  if (!estilo) return null;
  return (
    <span
      title={
        (estado === 'RECHAZADO' || estado === 'SUSPENDIDO') && ev.motivoRechazo
          ? `${t('ev.aprReason')}: ${ev.motivoRechazo}`
          : undefined
      }
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${estilo.chip}`}
    >
      {t(estilo.labelKey)}
    </span>
  );
}

/**
 * Modal genérico que pide un motivo antes de una acción sobre el evento.
 * `requerido` decide si el botón se habilita sin texto (rechazo = obligatorio,
 * suspensión = opcional) y `tono` el color del botón de confirmación.
 */
export function MotivoModal({
  evento,
  tituloKey,
  confirmarKey,
  requerido,
  tono = 'danger',
  onConfirm,
  onCancel,
}: {
  evento: EventoRow;
  tituloKey: string;
  confirmarKey: string;
  requerido: boolean;
  tono?: 'danger' | 'warning';
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [motivo, setMotivo] = useState('');
  const btn = tono === 'warning' ? 'bg-amber-500' : 'bg-danger';
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border-app bg-surface p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-text">
          {t(tituloKey, { name: evento.TITULO })}
        </h2>
        <label className="mt-3 mb-1 block text-sm font-medium text-text-2">
          {requerido ? t('ev.aprReason') : t('ev.aprReasonOptional')}
        </label>
        <textarea
          autoFocus
          rows={3}
          maxLength={500}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={t('ev.aprReasonPh')}
          className="w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border-app px-4 py-2 text-sm font-medium text-text-2 hover:bg-surface-2"
          >
            {t('c.cancel')}
          </button>
          <button
            type="button"
            disabled={requerido && !motivo.trim()}
            onClick={() => onConfirm(motivo.trim())}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 ${btn}`}
          >
            {t(confirmarKey)}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Modal para rechazar un evento pidiendo el motivo (obligatorio) */
export function RechazoModal({
  evento,
  onConfirm,
  onCancel,
}: {
  evento: EventoRow;
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
}) {
  return (
    <MotivoModal
      evento={evento}
      tituloKey="ev.aprRejectTitle"
      confirmarKey="ev.aprReject"
      requerido
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/** Modal para suspender (retirar de la app) con motivo OPCIONAL */
export function SuspenderModal({
  evento,
  onConfirm,
  onCancel,
}: {
  evento: EventoRow;
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
}) {
  return (
    <MotivoModal
      evento={evento}
      tituloKey="ev.aprSuspendTitle"
      confirmarKey="ev.aprSuspend"
      requerido={false}
      tono="warning"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
