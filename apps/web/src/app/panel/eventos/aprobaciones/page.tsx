'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { useInstitucionFiltro } from '@/lib/institucion-context';
import { useI18n } from '@/lib/i18n';
import {
  puedeVer,
  ROLES_APROBAR_SALON,
  ROLES_PUBLICAR,
  ROLES_VER_APROBACIONES,
} from '@/lib/types';
import type { EventoRow } from '@/lib/types';
import {
  BadgeAprobacion,
  LineaResuelto,
  listoParaPublicar,
  RechazoModal,
} from '../aprobacion-ui';

/** espacio solicitado: LOCAL · SALÓN — configuración/salas (igual criterio que la lista de eventos) */
function espacioSolicitado(ev: EventoRow, t: (k: string) => string): string {
  if (!ev.SALON_NOMBRE) {
    return ev.LOCAL_NOMBRE
      ? `${ev.LOCAL_NOMBRE} — ${t('ev.wholeVenue')}`
      : '—';
  }
  const base = [ev.LOCAL_NOMBRE, ev.SALON_NOMBRE].filter(Boolean).join(' · ');
  if (ev.CONFIGURACION_NOMBRE) {
    return `${base} — ${ev.CONFIGURACION_NOMBRE}${ev.SUBSALONES_NOMBRES ? ` (${ev.SUBSALONES_NOMBRES})` : ''}`;
  }
  if (ev.SUBSALONES_NOMBRES) return `${base} — ${ev.SUBSALONES_NOMBRES}`;
  return `${base} — ${t('ev.hallComplete')}`;
}

/** días del evento en corto (DD/MM, …) + horario */
function diasTexto(ev: EventoRow): string {
  const dias = (ev.DIAS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const lista = dias.length > 0 ? dias : [ev.FECHA_EVENTO].filter(Boolean);
  const fechas = lista
    .map((f) => `${f.slice(8, 10)}/${f.slice(5, 7)}`)
    .join(', ');
  const horas =
    ev.HORA_INICIO && ev.HORA_FIN ? ` · ${ev.HORA_INICIO}–${ev.HORA_FIN}` : '';
  return fechas ? `${fechas}${horas}` : '—';
}

/** Tarjeta/fila de una solicitud: evento, solicitante, grupo, espacio y días */
function FilaSolicitud({
  ev,
  acciones,
}: {
  ev: EventoRow;
  acciones: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-app bg-surface p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-text">{ev.TITULO}</span>
          <BadgeAprobacion ev={ev} />
        </div>
        <div className="mt-1 text-sm text-text-2">
          {espacioSolicitado(ev, t)}
        </div>
        <div className="text-sm text-text-2">{diasTexto(ev)}</div>
        {/* confirmación del paso 1: quién aprobó/reubicó el salón y cuándo */}
        <LineaResuelto ev={ev} />
        <div className="mt-1 text-xs text-text-muted">
          {t('apr.requestedBy')}: {ev.creadoPor ?? '—'}
          {ev.grupo && (
            <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5">
              {ev.grupo}
            </span>
          )}
          {ev.INSTITUCION ? ` · ${ev.INSTITUCION}` : ''}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{acciones}</div>
    </div>
  );
}

export default function AprobacionesPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { qs, nombreFiltro } = useInstitucionFiltro();
  const [eventos, setEventos] = useState<EventoRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [rechazar, setRechazar] = useState<EventoRow | null>(null);

  const tieneAcceso = puedeVer(user, ROLES_VER_APROBACIONES);
  const puedeAprobarSalon = puedeVer(user, ROLES_APROBAR_SALON);
  const puedePublicar = puedeVer(user, ROLES_PUBLICAR);

  const cargar = useCallback(async () => {
    setEventos(await api.get<EventoRow[]>(`/eventos${qs}`));
  }, [qs]);

  useEffect(() => {
    if (!tieneAcceso) return;
    cargar().catch((e) => setError(e.message));
  }, [cargar, tieneAcceso]);

  async function aprobarSalon(ev: EventoRow) {
    setError(null);
    setOk(null);
    try {
      await api.post(`/eventos/${ev.ID_EVENTO}/aprobar-salon`);
      setOk(t('ev.aprVenueOk', { name: ev.TITULO }));
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('c.error'));
    }
  }

  async function aprobarPublicacion(ev: EventoRow) {
    setError(null);
    setOk(null);
    try {
      await api.post(`/eventos/${ev.ID_EVENTO}/aprobar-publicacion`);
      setOk(t('ev.aprPublishOk', { name: ev.TITULO }));
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('c.error'));
    }
  }

  async function rechazarEvento(ev: EventoRow, motivo: string) {
    setError(null);
    setOk(null);
    try {
      await api.post(`/eventos/${ev.ID_EVENTO}/rechazar`, { motivo });
      setOk(t('ev.aprRejectOk', { name: ev.TITULO }));
      setRechazar(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('c.error'));
    }
  }

  // la vista es solo para quien aprueba salones o publica (el sidebar ya la oculta)
  if (!tieneAcceso) return null;

  const pendientes = eventos.filter((e) => e.estadoAprobacion === 'BORRADOR');
  const listos = eventos.filter((e) => listoParaPublicar(e.estadoAprobacion));

  const linkAbrir = (ev: EventoRow) => (
    <Link
      href={`/panel/eventos?editar=${ev.ID_EVENTO}`}
      className="rounded-lg border border-border-app px-3 py-1.5 text-xs text-text-2 hover:bg-surface-2"
    >
      {t('apr.openEvent')}
    </Link>
  );

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-text">{t('side.approvals')}</h1>
        <p className="text-sm text-text-2">
          {nombreFiltro
            ? t('us.filtering', { name: nombreFiltro })
            : t('apr.subtitle')}
        </p>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {ok && (
        <p className="mt-4 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          {ok}
        </p>
      )}

      {/* ── 1. Pendientes de aprobación de salón (BORRADOR) ── */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold text-amber-500">
          {t('ev.aprPendingVenue')} ({pendientes.length})
        </h2>
        {puedeAprobarSalon && (
          <p className="mt-1 text-xs text-text-muted">{t('apr.moveHint')}</p>
        )}
        <div className="mt-3 flex flex-col gap-2">
          {pendientes.length === 0 && (
            <p className="rounded-xl border border-dashed border-border-app px-4 py-6 text-center text-sm text-text-muted">
              {t('apr.empty')}
            </p>
          )}
          {pendientes.map((ev) => (
            <FilaSolicitud
              key={ev.ID_EVENTO}
              ev={ev}
              acciones={
                <>
                  {linkAbrir(ev)}
                  {puedeAprobarSalon && (
                    <>
                      <button
                        onClick={() => aprobarSalon(ev)}
                        className="rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                      >
                        {t('ev.aprApproveVenue')}
                      </button>
                      <button
                        onClick={() => setRechazar(ev)}
                        className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10"
                      >
                        {t('ev.aprReject')}
                      </button>
                    </>
                  )}
                </>
              }
            />
          ))}
        </div>
      </section>

      {/* ── 2. Salón aprobado / reubicado: listos para publicar ── */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-sky-500">
          {t('apr.readyTitle')} ({listos.length})
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          {listos.length === 0 && (
            <p className="rounded-xl border border-dashed border-border-app px-4 py-6 text-center text-sm text-text-muted">
              {t('apr.empty')}
            </p>
          )}
          {listos.map((ev) => (
            <FilaSolicitud
              key={ev.ID_EVENTO}
              ev={ev}
              acciones={
                <>
                  {linkAbrir(ev)}
                  {puedePublicar && (
                    <button
                      onClick={() => aprobarPublicacion(ev)}
                      className="rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                    >
                      {t('ev.aprApprovePublish')}
                    </button>
                  )}
                </>
              }
            />
          ))}
        </div>
      </section>

      {rechazar && (
        <RechazoModal
          evento={rechazar}
          onConfirm={(motivo) => rechazarEvento(rechazar, motivo)}
          onCancel={() => setRechazar(null)}
        />
      )}
    </div>
  );
}
