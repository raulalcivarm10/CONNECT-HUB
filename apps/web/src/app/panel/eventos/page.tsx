'use client';

import Link from 'next/link';
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from '@/lib/api/client';
import { AgendaEvento } from './agenda-evento';
import { CertificadosEvento } from './certificados-evento';
import {
  BadgeAprobacion,
  esPendiente,
  ESTILO_APROBACION,
  LineaResuelto,
  listoParaPublicar,
  RechazoModal,
  SuspenderModal,
} from './aprobacion-ui';
import { nasImagenUrl, type NasEntidad } from '@/lib/nas';
import { useLightbox } from '@/lib/lightbox';
import { useDialogo } from '@/lib/dialogo';
import { useAuth } from '@/lib/auth/auth-context';
import { useInstitucionFiltro } from '@/lib/institucion-context';
import { ImagenNas } from '@/components/ui/imagen-nas';
import { useI18n } from '@/lib/i18n';
import { propsValidacion } from '@/lib/validacion';
import {
  esEventoRestringido,
  esPublicadoSuspendible,
  puedeVer,
  ROL,
  ROLES_APROBAR_SALON,
  ROLES_PUBLICAR,
} from '@/lib/types';
import type {
  ConfiguracionRow,
  EspacioHistorial,
  EventoRow,
  HistorialEspacioRow,
  LocalRow,
  SalonRow,
  SubsalonRow,
} from '@/lib/types';

const money = (v: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(
    v ?? 0,
  );

interface AgendaItem {
  ID_EVENTO: number;
  TITULO: string;
  HORA_INICIO: string;
  HORA_FIN: string;
  TIEMPO_SETUP_MIN: number | null;
  TIEMPO_CLEAN_MIN: number | null;
  SALON_NOMBRE: string | null;
  SUBSALONES_NOMBRES: string | null;
}

/** Un día del evento (tabla EVENTO_HORAS) con su propio rango horario */
interface DiaRow {
  ID_HORA: number;
  FECHA: string; // YYYY-MM-DD
  HORA_INICIO: string;
  HORA_FIN: string;
  ORDEN: number;
}

/** Día en edición dentro del formulario (repetidor) */
interface DiaEditable {
  fecha: string;
  horaInicio: string;
  horaFin: string;
}

const toMin = (h: string) => {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
};
const toHora = (min: number) => {
  const m = Math.max(0, Math.min(min, 24 * 60 - 1));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** parsea 'YYYY-MM-DD' como fecha LOCAL (evita el corrimiento de zona de new Date(str)) */
function parseFechaLocal(f: string): Date {
  const [y, m, d] = f.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** suma un día a 'YYYY-MM-DD' con aritmética local y devuelve 'YYYY-MM-DD' */
function sumarUnDia(f: string): string {
  const [y, m, d] = f.split('-').map(Number);
  const nx = new Date(y, m - 1, d + 1);
  const yy = nx.getFullYear();
  const mm = String(nx.getMonth() + 1).padStart(2, '0');
  const dd = String(nx.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** fecha corta legible (p. ej. «14 jul») a partir de 'YYYY-MM-DD' */
function fechaCorta(f: string, locale: string): string {
  return parseFechaLocal(f).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  });
}

/** días reales del evento: usa ev.DIAS ('YYYY-MM-DD' coma-separados); fallback a FECHA_EVENTO */
function diasDeEvento(ev: {
  DIAS?: string | null;
  FECHA_EVENTO: string;
}): string[] {
  const dias = (ev.DIAS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return dias.length > 0 ? dias : [ev.FECHA_EVENTO].filter(Boolean);
}

/**
 * Muestra los DÍAS INDIVIDUALES del evento (NUNCA un rango con guion):
 *  - 1 día  -> esa fecha
 *  - varios -> fechas separadas por ', '
 *  - muchas (>3) -> las primeras + '+N' (p. ej. «14 jul, 19 jul +2»)
 */
function mostrarDias(dias: string[], locale: string): string {
  const fechas = dias.filter(Boolean);
  if (fechas.length === 0) return '—';
  if (fechas.length === 1) return fechaCorta(fechas[0], locale);
  if (fechas.length <= 3) {
    return fechas.map((f) => fechaCorta(f, locale)).join(', ');
  }
  const visibles = fechas.slice(0, 2).map((f) => fechaCorta(f, locale));
  return `${visibles.join(', ')} +${fechas.length - 2}`;
}

/** ventana real que ocupa un evento: inicio − preparación → fin + limpieza */
function ventanaReal(a: {
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  TIEMPO_SETUP_MIN: number | null;
  TIEMPO_CLEAN_MIN: number | null;
}): string | null {
  if (!a.HORA_INICIO || !a.HORA_FIN) return null;
  const ini = toMin(a.HORA_INICIO) - (a.TIEMPO_SETUP_MIN ?? 0);
  const fin = toMin(a.HORA_FIN) + (a.TIEMPO_CLEAN_MIN ?? 0);
  return `${toHora(ini)}–${toHora(fin)}`;
}

/** texto legible de un espacio del historial: LOCAL — SALON · sala/config · días */
function espacioTexto(e: EspacioHistorial): string {
  const lugar = [e.local, e.salon, e.configuracion ?? e.subsalon]
    .filter(Boolean)
    .join(' — ');
  const dias = (e.dias ?? [])
    .map(
      (d) =>
        `${d.fecha.slice(8, 10)}/${d.fecha.slice(5, 7)} ${d.horaInicio}–${d.horaFin}`,
    )
    .join(', ');
  return [lugar, dias].filter(Boolean).join(' · ') || '—';
}

/** Acordeón con la línea de tiempo de GET /eventos/:id/historial-espacio */
function HistorialEspacio({ idEvento }: { idEvento: number }) {
  const { t } = useI18n();
  const [abierto, setAbierto] = useState(false);
  const [items, setItems] = useState<HistorialEspacioRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!abierto || items !== null || error) return;
    api
      .get<HistorialEspacioRow[]>(`/eventos/${idEvento}/historial-espacio`)
      .then(setItems)
      .catch(() => setError(true));
  }, [abierto, items, error, idEvento]);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="text-sm font-semibold text-text-2 underline-offset-2 hover:underline"
      >
        <span className="mr-1">{abierto ? '▾' : '▸'}</span>
        {t('ev.histTitle')}
      </button>
      {abierto && (
        <div className="mt-2 flex flex-col gap-1.5 border-l-2 border-border-app pl-3">
          {error && <div className="text-sm text-danger">{t('c.error')}</div>}
          {items && items.length === 0 && (
            <div className="text-sm text-text-muted">{t('ev.histEmpty')}</div>
          )}
          {items === null && !error && (
            <div className="text-sm text-text-muted">{t('c.loading')}</div>
          )}
          {items?.map((h) => {
            const espacio = h.detalle?.solicitado ?? h.detalle?.a;
            return (
              <div key={h.id} className="text-sm text-text-2">
                <span className="font-semibold text-text">
                  {t(`ev.hist${h.tipo}`)}
                </span>
                {espacio && <>: {espacioTexto(espacio)}</>}
                {/* rechazo/suspensión: el motivo (si se registró) va tras el guion */}
                {!espacio && h.detalle?.motivo && <> — {h.detalle.motivo}</>}
                {h.tipo === 'MOVIDO' && h.detalle?.de && (
                  <span className="text-text-muted">
                    {' '}
                    ({t('ev.histFrom')}: {espacioTexto(h.detalle.de)})
                  </span>
                )}
                <span className="text-xs text-text-muted">
                  {' '}
                  — {h.usuario} · {h.fecha}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Banner prominente del flujo de aprobación: estado + acciones según rol,
 * nota de reubicación para Gestión Operativa e historial del espacio.
 */
function BannerAprobacion({
  evento,
  puedeAprobarSalon,
  puedePublicar,
  notaMover,
  onAprobarSalon,
  onAprobarPublicacion,
  onRechazar,
  onSuspender,
  onRepublicar,
}: {
  evento: EventoRow;
  puedeAprobarSalon: boolean;
  puedePublicar: boolean;
  /** el usuario es Gestión Operativa: mover = editar espacio + guardar */
  notaMover: boolean;
  onAprobarSalon: () => void;
  onAprobarPublicacion: () => void;
  onRechazar: () => void;
  onSuspender: () => void;
  onRepublicar: () => void;
}) {
  const { t } = useI18n();
  const estado = evento.estadoAprobacion;
  // publicado y suspendible (incluye legados con estado null): puede retirarse
  const suspendible = esPublicadoSuspendible(evento) && puedePublicar;
  // en legados (sin estado en BD) el banner solo aparece si aporta la acción
  if (estado == null && !suspendible) return null;
  const estilo = ESTILO_APROBACION[estado ?? 'PUBLICADO'];
  if (!estilo) return null;
  // progreso del flujo en 2 pasos: 1) salón, 2) publicación
  const pasoSalonHecho = listoParaPublicar(estado) || estado === 'PUBLICADO';
  const pasoPublicadoHecho = estado === 'PUBLICADO';
  // el indicador solo tiene sentido dentro del flujo (no en legados/rechazo/suspensión)
  const mostrarPasos =
    estado != null && estado !== 'RECHAZADO' && estado !== 'SUSPENDIDO';

  return (
    <div className={`mt-5 rounded-2xl border p-4 ${estilo.banner}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest opacity-80">
            {t('ev.aprStatus')}
          </div>
          <div className="text-lg font-bold">{t(estilo.labelKey)}</div>
          {mostrarPasos && (
            <div className="mt-1 flex items-center gap-2 text-xs font-semibold">
              <span className={pasoSalonHecho ? 'text-success' : ''}>
                {pasoSalonHecho ? '✓' : '1.'} {t('ev.aprStepVenue')}
              </span>
              <span className="opacity-60">→</span>
              <span className={pasoPublicadoHecho ? 'text-success' : 'opacity-70'}>
                {pasoPublicadoHecho ? '✓' : '2.'} {t('ev.aprStepPublish')}
              </span>
            </div>
          )}
          {estado === 'BORRADOR' && (
            <div className="mt-1 text-sm">{t('ev.aprStep1Pending')}</div>
          )}
          <div className="mt-1">
            <LineaResuelto ev={evento} />
          </div>
          {listoParaPublicar(estado) && (
            <div className="text-sm">{t('ev.aprWaitingPublish')}</div>
          )}
          {estado === 'SUSPENDIDO' && (
            <div className="mt-0.5 text-sm">{t('ev.aprSuspendedHint')}</div>
          )}
          {(estado === 'RECHAZADO' || estado === 'SUSPENDIDO') &&
            evento.motivoRechazo && (
              <div className="mt-0.5 text-sm">
                {t('ev.aprReason')}: {evento.motivoRechazo}
              </div>
            )}
        </div>
        <div className="flex flex-wrap gap-2">
          {estado === 'BORRADOR' && puedeAprobarSalon && (
            <button
              type="button"
              onClick={onAprobarSalon}
              className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {t('ev.aprApproveVenue')}
            </button>
          )}
          {/* ADMINISTRATION publica pero no aprueba salones: solo espera */}
          {estado === 'BORRADOR' && !puedeAprobarSalon && puedePublicar && (
            <span className="self-center text-sm font-semibold">
              {t('ev.aprWaitingVenue')}
            </span>
          )}
          {listoParaPublicar(estado) && puedePublicar && (
            <button
              type="button"
              onClick={onAprobarPublicacion}
              className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {t('ev.aprApprovePublish')}
            </button>
          )}
          {esPendiente(estado) && (puedeAprobarSalon || puedePublicar) && (
            <button
              type="button"
              onClick={onRechazar}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {t('ev.aprReject')}
            </button>
          )}
          {/* retirar de la app (no destructivo: conserva inscritos y pagos) */}
          {suspendible && (
            <button
              type="button"
              onClick={onSuspender}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {t('ev.aprSuspend')}
            </button>
          )}
          {estado === 'SUSPENDIDO' && puedePublicar && (
            <button
              type="button"
              onClick={onRepublicar}
              className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {t('ev.aprRepublish')}
            </button>
          )}
        </div>
      </div>
      {/* Gestión Operativa: editar es para organizarse, NO aprueba; solo el botón aprueba */}
      {notaMover && estado === 'BORRADOR' && (
        <p className="mt-2 text-sm text-text-2">
          {t('ev.aprApproveOrMoveHint')}
        </p>
      )}
      <HistorialEspacio idEvento={evento.ID_EVENTO} />
    </div>
  );
}

/**
 * Filas fantasma mientras llega la primera respuesta de GET /eventos (la
 * request más pesada del sistema): la tabla vacía se leía como «se colgó».
 * Puro esqueleto visual, sin texto (nada que traducir).
 */
function FilasEsqueleto({ filas = 5 }: { filas?: number }) {
  const barra = 'animate-pulse rounded bg-surface-2';
  return (
    <>
      {Array.from({ length: filas }, (_, i) => (
        <tr key={i} className="border-b border-border-app/60" aria-hidden="true">
          <td className="px-4 py-3">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-14 shrink-0 ${barra}`} />
              <div className="min-w-0 flex-1">
                <div className={`h-3.5 w-40 max-w-full ${barra}`} />
                <div className={`mt-2 h-2.5 w-24 max-w-full ${barra}`} />
              </div>
            </div>
          </td>
          <td className="px-4 py-3">
            <div className={`h-3.5 w-24 ${barra}`} />
            <div className={`mt-2 h-2.5 w-16 ${barra}`} />
          </td>
          <td className="px-4 py-3">
            <div className={`h-3.5 w-36 ${barra}`} />
          </td>
          <td className="px-4 py-3">
            <div className={`h-3.5 w-12 ${barra}`} />
          </td>
          <td className="px-4 py-3">
            <div className={`h-3.5 w-8 ${barra}`} />
          </td>
          <td className="px-4 py-3">
            <div className={`h-3.5 w-10 ${barra}`} />
          </td>
          <td className="px-4 py-3">
            <div className="flex justify-end gap-2">
              <div className={`h-6 w-14 ${barra}`} />
              <div className={`h-6 w-14 ${barra}`} />
              <div className={`h-6 w-14 ${barra}`} />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

export default function EventosPage() {
  const { qs, nombreFiltro } = useInstitucionFiltro();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const lightbox = useLightbox();
  const dialogo = useDialogo();
  const [eventos, setEventos] = useState<EventoRow[]>([]);
  // primera carga de la lista (la más pesada del sistema): pinta esqueleto
  const [cargando, setCargando] = useState(true);
  const [editar, setEditar] = useState<EventoRow | null>(null);
  const [ver, setVer] = useState<EventoRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // versión de portada POR EVENTO: al subir una imagen solo se remonta esa
  // miniatura (rompe su caché y la reintenta si estaba oculta por error),
  // en vez de re-descargar las N miniaturas del listado
  const [imgVersion, setImgVersion] = useState<Record<number, number>>({});
  const marcarImagen = useCallback((id: number) => {
    setImgVersion((v) => ({ ...v, [id]: Date.now() }));
  }, []);
  // flujo de aprobación: permisos según roles del JWT (superadmin ve todo)
  const puedeAprobarSalon = puedeVer(user, ROLES_APROBAR_SALON);
  const puedePublicar = puedeVer(user, ROLES_PUBLICAR);
  // evento en proceso de rechazo / de suspensión (abren su modal de motivo)
  const [rechazar, setRechazar] = useState<EventoRow | null>(null);
  const [suspender, setSuspender] = useState<EventoRow | null>(null);

  const cargar = useCallback(async () => {
    try {
      const list = await api.get<EventoRow[]>(`/eventos${qs}`);
      setEventos(list);
      return list;
    } finally {
      setCargando(false);
    }
  }, [qs]);

  /** tras aprobar/rechazar, sincroniza el evento abierto en editar/ver */
  function refrescarAbiertos(list: EventoRow[]) {
    setEditar((prev) =>
      prev ? (list.find((e) => e.ID_EVENTO === prev.ID_EVENTO) ?? null) : prev,
    );
    setVer((prev) =>
      prev ? (list.find((e) => e.ID_EVENTO === prev.ID_EVENTO) ?? null) : prev,
    );
  }

  useEffect(() => {
    // solo la carga inicial / cambio de filtro muestra esqueleto; los refrescos
    // tras guardar o aprobar reemplazan la tabla ya pintada sin parpadeo
    setCargando(true);
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  // abre el formulario de edición si llegan con /panel/eventos?editar=<id>
  // (p. ej. al hacer clic en una card del calendario)
  const editarConsumido = useRef(false);
  useEffect(() => {
    if (editarConsumido.current || eventos.length === 0) return;
    const id = Number(
      new URLSearchParams(window.location.search).get('editar'),
    );
    if (id) {
      const ev = eventos.find((e) => e.ID_EVENTO === id);
      if (ev) {
        setEditar(ev);
        setShowForm(false);
        window.scrollTo({ top: 0 });
      } else {
        setError(t('ev.notVisible'));
      }
    }
    editarConsumido.current = true;
  }, [eventos]);

  // abre el formulario de creación con fecha prellenada si llegan con
  // /panel/eventos?nuevo=<YYYY-MM-DD> (botón "Crear evento este día" del calendario)
  const [fechaNueva, setFechaNueva] = useState<string | undefined>(undefined);
  useEffect(() => {
    const nuevo = new URLSearchParams(window.location.search).get('nuevo');
    if (nuevo && /^\d{4}-\d{2}-\d{2}$/.test(nuevo)) {
      setFechaNueva(nuevo);
      setEditar(null);
      setShowForm(true);
      window.scrollTo({ top: 0 });
    }
  }, []);

  async function eliminar(ev: EventoRow) {
    const ok = await dialogo.confirmar({
      titulo: t('dlg.deleteTitle', { name: ev.TITULO }),
      mensaje: t('dlg.deleteMsg'),
      tono: 'danger',
      confirmar: t('c.delete'),
    });
    if (!ok) return;
    setError(null);
    setOk(null);
    try {
      await api.del(`/eventos/${ev.ID_EVENTO}`);
      setOk(t('ev.deleted', { name: ev.TITULO }));
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('c.error'));
    }
  }

  async function toggleDestacado(ev: EventoRow) {
    setError(null);
    try {
      await api.patch(`/eventos/${ev.ID_EVENTO}/destacar`, {
        destacado: ev.DESTACADO !== 1,
      });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('c.error'));
    }
  }

  async function aprobarSalon(ev: EventoRow) {
    setError(null);
    setOk(null);
    try {
      await api.post(`/eventos/${ev.ID_EVENTO}/aprobar-salon`);
      setOk(t('ev.aprVenueOk', { name: ev.TITULO }));
      refrescarAbiertos(await cargar());
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
      refrescarAbiertos(await cargar());
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
      refrescarAbiertos(await cargar());
    } catch (e) {
      setError(e instanceof Error ? e.message : t('c.error'));
    }
  }

  /** retira el evento de la app sin borrarlo (conserva inscritos/pagos) */
  async function suspenderEvento(ev: EventoRow, motivo: string) {
    setError(null);
    setOk(null);
    try {
      await api.post(
        `/eventos/${ev.ID_EVENTO}/suspender`,
        motivo ? { motivo } : {},
      );
      setOk(t('ev.aprSuspendOk', { name: ev.TITULO }));
      setSuspender(null);
      refrescarAbiertos(await cargar());
    } catch (e) {
      setError(e instanceof Error ? e.message : t('c.error'));
    }
  }

  async function republicarEvento(ev: EventoRow) {
    setError(null);
    setOk(null);
    try {
      await api.post(`/eventos/${ev.ID_EVENTO}/republicar`);
      setOk(t('ev.aprRepublishOk', { name: ev.TITULO }));
      refrescarAbiertos(await cargar());
    } catch (e) {
      setError(e instanceof Error ? e.message : t('c.error'));
    }
  }

  function espacio(ev: EventoRow): string {
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

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('ev.title')}</h1>
          <p className="text-sm text-text-2">
            {nombreFiltro
              ? t('us.filtering', { name: nombreFiltro })
              : t('ev.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/panel/eventos/calendario"
            className="rounded-lg border border-border-app px-4 py-2 text-sm text-text-2 hover:bg-surface-2"
          >
            {t('ev.calendarBtn')}
          </Link>
          <button
            onClick={() => {
              setEditar(null);
              setShowForm((v) => !v);
            }}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            {showForm && !editar ? t('c.close') : t('ev.new')}
          </button>
        </div>
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

      {ver && !editar && !showForm && (
        <>
          <BannerAprobacion
            evento={ver}
            puedeAprobarSalon={puedeAprobarSalon}
            puedePublicar={puedePublicar}
            notaMover={!!user?.roles.includes(ROL.OPERATIONS_MANAGEMENT)}
            onAprobarSalon={() => aprobarSalon(ver)}
            onAprobarPublicacion={() => aprobarPublicacion(ver)}
            onRechazar={() => setRechazar(ver)}
            onSuspender={() => setSuspender(ver)}
            onRepublicar={() => republicarEvento(ver)}
          />
          <DetalleEvento
            key={ver.ID_EVENTO}
            evento={ver}
            imgVersion={imgVersion[ver.ID_EVENTO]}
            onEditar={() => {
              setEditar(ver);
              setVer(null);
            }}
            onCerrar={() => setVer(null)}
          />
        </>
      )}

      {editar && (
        <BannerAprobacion
          evento={editar}
          puedeAprobarSalon={puedeAprobarSalon}
          puedePublicar={puedePublicar}
          notaMover={!!user?.roles.includes(ROL.OPERATIONS_MANAGEMENT)}
          onAprobarSalon={() => aprobarSalon(editar)}
          onAprobarPublicacion={() => aprobarPublicacion(editar)}
          onRechazar={() => setRechazar(editar)}
          onSuspender={() => setSuspender(editar)}
          onRepublicar={() => republicarEvento(editar)}
        />
      )}

      {(showForm || editar) && (
        <EventoForm
          key={editar ? `edit-${editar.ID_EVENTO}` : 'nuevo'}
          evento={editar}
          // la lista ya cargada alimenta el selector de evento padre
          // (evita repetir la request más pesada del sistema)
          eventos={eventos}
          fechaInicial={fechaNueva}
          onImagenSubida={() => {
            if (editar) marcarImagen(editar.ID_EVENTO);
          }}
          onDone={async (msg) => {
            // editar/mover NO aprueba: si el evento sigue en BORRADOR,
            // recuérdale al aprobador que el salón aún está pendiente
            const idEditado = editar?.ID_EVENTO ?? null;
            setShowForm(false);
            setEditar(null);
            const list = await cargar().catch(() => null);
            const actualizado =
              idEditado != null
                ? list?.find((e) => e.ID_EVENTO === idEditado)
                : null;
            if (
              actualizado?.estadoAprobacion === 'BORRADOR' &&
              puedeAprobarSalon
            ) {
              setOk(t('ev.aprMovedNotApproved'));
            } else {
              setOk(msg);
            }
          }}
          onCancel={() => {
            setShowForm(false);
            setEditar(null);
          }}
        />
      )}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-border-app bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-app text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-4 py-3">{t('ev.event')}</th>
              <th className="px-4 py-3">{t('ev.dateTime')}</th>
              <th className="px-4 py-3">{t('ev.space')}</th>
              <th className="px-4 py-3">{t('ev.price')}</th>
              <th className="px-4 py-3">{t('ev.enrolled')}</th>
              <th className="px-4 py-3">{t('ev.featured')}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {cargando && <FilasEsqueleto />}
            {!cargando && eventos.map((ev) => (
              <tr key={ev.ID_EVENTO} className="border-b border-border-app/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={`${ev.ID_EVENTO}-${imgVersion[ev.ID_EVENTO] ?? 0}`}
                      src={nasImagenUrl(
                        'EVENTO',
                        ev.ID_EVENTO,
                        'PORTADA',
                        imgVersion[ev.ID_EVENTO],
                      )}
                      alt=""
                      onClick={() =>
                        lightbox.open(
                          nasImagenUrl(
                            'EVENTO',
                            ev.ID_EVENTO,
                            'PORTADA',
                            imgVersion[ev.ID_EVENTO],
                          ),
                        )
                      }
                      className="h-10 w-14 shrink-0 cursor-zoom-in rounded-lg border border-border-app object-cover"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.visibility = 'hidden';
                      }}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text">
                          {ev.TITULO}
                        </span>
                        {ev.ID_EVENTO_PADRE != null && (
                          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                            {t('ev.workshopBadge')}
                          </span>
                        )}
                        <BadgeAprobacion ev={ev} />
                      </div>
                      <div className="text-xs text-text-muted">
                        {ev.ID_EVENTO_PADRE != null && ev.PADRE_TITULO
                          ? `↳ ${ev.PADRE_TITULO}`
                          : (ev.INSTITUCION ?? '')}
                      </div>
                      {ev.estadoAprobacion === 'RECHAZADO' &&
                        ev.motivoRechazo && (
                          <div className="text-xs text-danger">
                            {t('ev.aprReason')}: {ev.motivoRechazo}
                          </div>
                        )}
                      {ev.estadoAprobacion === 'SUSPENDIDO' &&
                        ev.motivoRechazo && (
                          <div className="text-xs text-text-muted">
                            {t('ev.aprReason')}: {ev.motivoRechazo}
                          </div>
                        )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-text-2">
                  {mostrarDias(diasDeEvento(ev), locale)}
                  <div className="text-xs text-text-muted">
                    {ev.HORA_INICIO}–{ev.HORA_FIN}
                    {ev.TIEMPO_SETUP_MIN || ev.TIEMPO_CLEAN_MIN
                      ? ` ${t('ev.prepClean', { s: ev.TIEMPO_SETUP_MIN ?? 0, c: ev.TIEMPO_CLEAN_MIN ?? 0 })}`
                      : ''}
                  </div>
                </td>
                <td className="px-4 py-3 text-text-2">{espacio(ev)}</td>
                <td className="px-4 py-3 text-text">
                  {ev.PRECIO > 0 ? money(ev.PRECIO, locale) : t('c.free')}
                </td>
                <td className="px-4 py-3 text-text-2">{ev.INSCRITOS}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleDestacado(ev)}
                    className={
                      ev.DESTACADO === 1
                        ? 'text-sm text-brand'
                        : 'text-sm text-text-muted'
                    }
                    title={t('ev.featuredTip')}
                  >
                    {ev.DESTACADO === 1 ? t('ev.featuredYes') : t('ev.featuredNo')}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {ev.estadoAprobacion === 'BORRADOR' && puedeAprobarSalon && (
                      <button
                        onClick={() => aprobarSalon(ev)}
                        className="rounded-lg bg-success/10 px-3 py-1 text-xs font-semibold text-success hover:bg-success/20"
                      >
                        {t('ev.aprApproveVenue')}
                      </button>
                    )}
                    {listoParaPublicar(ev.estadoAprobacion) &&
                      puedePublicar && (
                        <button
                          onClick={() => aprobarPublicacion(ev)}
                          className="rounded-lg bg-success/10 px-3 py-1 text-xs font-semibold text-success hover:bg-success/20"
                        >
                          {t('ev.aprApprovePublish')}
                        </button>
                      )}
                    {esPendiente(ev.estadoAprobacion) &&
                      (puedeAprobarSalon || puedePublicar) && (
                        <button
                          onClick={() => setRechazar(ev)}
                          className="rounded-lg border border-danger/40 px-3 py-1 text-xs font-semibold text-danger hover:bg-danger/10"
                        >
                          {t('ev.aprReject')}
                        </button>
                      )}
                    {esPublicadoSuspendible(ev) && puedePublicar && (
                      <button
                        onClick={() => setSuspender(ev)}
                        className="rounded-lg border border-amber-500/40 px-3 py-1 text-xs font-semibold text-amber-500 hover:bg-amber-500/10"
                      >
                        {t('ev.aprSuspend')}
                      </button>
                    )}
                    {ev.estadoAprobacion === 'SUSPENDIDO' && puedePublicar && (
                      <button
                        onClick={() => republicarEvento(ev)}
                        className="rounded-lg bg-success/10 px-3 py-1 text-xs font-semibold text-success hover:bg-success/20"
                      >
                        {t('ev.aprRepublish')}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setVer(ev);
                        setEditar(null);
                        setShowForm(false);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="rounded-lg bg-brand/10 px-3 py-1 text-xs font-semibold text-brand hover:bg-brand/20"
                    >
                      {t('c.view')}
                    </button>
                    <button
                      onClick={() => {
                        setEditar(ev);
                        setVer(null);
                        setShowForm(false);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="rounded-lg border border-border-app px-3 py-1 text-xs text-text-2 hover:bg-surface-2"
                    >
                      {t('c.edit')}
                    </button>
                    <button
                      onClick={() => eliminar(ev)}
                      className="rounded-lg border border-border-app px-3 py-1 text-xs text-danger hover:bg-surface-2"
                    >
                      {t('c.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!cargando && eventos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                  {t('ev.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rechazar && (
        <RechazoModal
          evento={rechazar}
          onConfirm={(motivo) => rechazarEvento(rechazar, motivo)}
          onCancel={() => setRechazar(null)}
        />
      )}

      {suspender && (
        <SuspenderModal
          evento={suspender}
          onConfirm={(motivo) => suspenderEvento(suspender, motivo)}
          onCancel={() => setSuspender(null)}
        />
      )}
    </div>
  );
}


type TipoEspacio = 'salon' | 'configuracion' | 'subsalon';

/** Vista de detalle (solo lectura) del evento con su portada */
function DetalleEvento({
  evento,
  imgVersion,
  onEditar,
  onCerrar,
}: {
  evento: EventoRow;
  /** versión de la portada de ESTE evento (undefined = sin subida en la sesión) */
  imgVersion?: number;
  onEditar: () => void;
  onCerrar: () => void;
}) {
  const [sinImagen, setSinImagen] = useState(false);
  const { t, locale } = useI18n();
  const lightbox = useLightbox();
  const datos: Array<[string, string]> = [
    [t('ev.date'), mostrarDias(diasDeEvento(evento), locale)],
    [t('ev.schedule'), `${evento.HORA_INICIO ?? '—'}–${evento.HORA_FIN ?? '—'}`],
    ...(evento.ID_EVENTO_PADRE != null
      ? [
          [
            t('ev.parentEvent'),
            evento.PADRE_TITULO ?? String(evento.ID_EVENTO_PADRE),
          ] as [string, string],
        ]
      : []),
    [
      t('ev.realOccupation'),
      ventanaReal(evento)
        ? t('ev.realOccDetail', {
            w: ventanaReal(evento)!,
            s: evento.TIEMPO_SETUP_MIN ?? 0,
            c: evento.TIEMPO_CLEAN_MIN ?? 0,
          })
        : '—',
    ],
    [t('ev.venue'), evento.LOCAL_NOMBRE ?? '—'],
    [t('ev.hall'), evento.SALON_NOMBRE ?? `— (${t('ev.wholeVenue')})`],
    [
      t('ev.reservedSpace'),
      !evento.ID_SALON
        ? t('ev.wholeVenueFull')
        : evento.CONFIGURACION_NOMBRE
          ? `${evento.CONFIGURACION_NOMBRE}${evento.SUBSALONES_NOMBRES ? ` (${evento.SUBSALONES_NOMBRES})` : ''}`
          : (evento.SUBSALONES_NOMBRES ?? t('ev.fullHallOpt')),
    ],
    [t('ev.itemCode'), evento.COD_ITEM ?? '—'],
    [t('ev.price'), evento.PRECIO > 0 ? money(evento.PRECIO, locale) : t('c.free')],
    [
      t('ev.expectedAudience'),
      evento.PUBLICO_ESPERADO ? String(evento.PUBLICO_ESPERADO) : '—',
    ],
    [t('ev.enrolled'), String(evento.INSCRITOS)],
    [
      t('ev.featured'),
      evento.DESTACADO === 1
        ? evento.ORDEN_DESTACADO
          ? t('ev.featuredOrder', { n: evento.ORDEN_DESTACADO })
          : t('ev.featuredYes')
        : t('ev.featuredNo'),
    ],
    [t('ev.institution'), evento.INSTITUCION ?? '—'],
  ];

  return (
    <div className="mt-5 rounded-2xl border border-border-app bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-bold text-text">
          {evento.DESTACADO === 1 && <span className="text-brand">★ </span>}
          {evento.TITULO}
          {evento.ID_EVENTO_PADRE != null && (
            <span className="ml-2 align-middle rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-brand">
              {t('ev.workshopBadge')}
            </span>
          )}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onEditar}
            className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            {t('c.edit')}
          </button>
          <button
            onClick={onCerrar}
            className="rounded-lg border border-border-app px-4 py-1.5 text-sm text-text-2 hover:bg-surface-2"
          >
            {t('c.close')}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-5 lg:flex-row">
        {sinImagen ? (
          <div className="flex h-48 w-full items-center justify-center rounded-xl border border-dashed border-border-app text-sm text-text-muted lg:w-80">
            {t('ev.noCover')}
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={nasImagenUrl('EVENTO', evento.ID_EVENTO, 'PORTADA', imgVersion)}
            alt={t('ev.coverAlt')}
            onClick={() =>
              lightbox.open(
                nasImagenUrl('EVENTO', evento.ID_EVENTO, 'PORTADA', imgVersion),
              )
            }
            className="h-48 w-full cursor-zoom-in rounded-xl border border-border-app object-cover lg:w-80"
            onError={() => setSinImagen(true)}
          />
        )}

        <div className="min-w-0 flex-1">
          {evento.DESCRIPCION && (
            <p className="mb-3 text-sm text-text-2">{evento.DESCRIPCION}</p>
          )}
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {datos.map(([k, v]) => (
              <div key={k} className="flex flex-col">
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {k}
                </dt>
                <dd className="text-sm text-text">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

/** Miniatura de referencia del espacio (imagen CROQUIS del NAS o placeholder) */
function RefEspacio({
  tipo,
  id,
  etiqueta,
}: {
  tipo: NasEntidad;
  id: number;
  etiqueta: string;
}) {
  const [sinImagen, setSinImagen] = useState(false);
  const { t } = useI18n();
  const lightbox = useLightbox();
  const src = nasImagenUrl(tipo, id, 'CROQUIS');
  return (
    <div className="text-center">
      {sinImagen ? (
        <div className="flex h-24 w-36 items-center justify-center rounded-lg border border-dashed border-border-app text-xs text-text-muted">
          {t('ev.noImage')}
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={etiqueta}
          onClick={() => lightbox.open(src, etiqueta)}
          className="h-24 w-36 cursor-zoom-in rounded-lg border border-border-app object-cover"
          onError={() => setSinImagen(true)}
        />
      )}
      <div className="mt-1 text-xs font-medium text-text-muted">{etiqueta}</div>
    </div>
  );
}

function EventoForm({
  evento,
  eventos,
  fechaInicial,
  onDone,
  onCancel,
  onImagenSubida,
}: {
  evento: EventoRow | null;
  /** lista ya cargada por la página: candidatos a evento padre (sin refetch) */
  eventos: EventoRow[];
  /** fecha prellenada al crear (viene del calendario) */
  fechaInicial?: string;
  onDone: (msg: string) => void;
  onCancel: () => void;
  onImagenSubida?: () => void;
}) {
  const { idInstitucion } = useInstitucionFiltro();
  const { t } = useI18n();
  const { user } = useAuth();
  // rol EVENT raso: no decide la publicación (el API la fuerza a revisión)
  const revisionObligatoria = esEventoRestringido(user);
  const [titulo, setTitulo] = useState(evento?.TITULO ?? '');
  const [descripcion, setDescripcion] = useState(evento?.DESCRIPCION ?? '');
  // Horario POR DÍA: un evento tiene 1+ días, cada uno con su rango horario.
  // Inicia con 1 día (al editar se reemplaza con GET /eventos/:id/dias).
  const [dias, setDias] = useState<DiaEditable[]>(
    evento
      ? [
          {
            fecha: evento.FECHA_EVENTO ?? '',
            horaInicio: evento.HORA_INICIO ?? '09:00',
            horaFin: evento.HORA_FIN ?? '13:00',
          },
        ]
      : [{ fecha: fechaInicial ?? '', horaInicio: '09:00', horaFin: '13:00' }],
  );
  // al editar, `dias` arranca con un día placeholder (el de la fila del listado)
  // que GET /eventos/:id/dias reemplaza enseguida. Hasta que llegue no se pide
  // la agenda: si no, se lanzaba una tanda de N requests por el placeholder y
  // otra por los días reales. Al crear no hay nada que esperar.
  const [diasListos, setDiasListos] = useState(!evento);
  // Evento padre (si se elige, este evento es un workshop / hijo)
  const [idEventoPadre, setIdEventoPadre] = useState(
    evento?.ID_EVENTO_PADRE ? String(evento.ID_EVENTO_PADRE) : '',
  );
  // Candidatos a padre: eventos PRINCIPALES (sin padre), excluyendo el actual.
  // Se derivan de la lista que la página ya tiene (misma query, mismo filtro
  // de institución): pedirla otra vez duplicaba la request más cara del sistema.
  const idActual = evento?.ID_EVENTO;
  const eventosPrincipales = useMemo(
    () =>
      eventos.filter(
        (e) => e.ID_EVENTO_PADRE == null && e.ID_EVENTO !== idActual,
      ),
    [eventos, idActual],
  );
  const [precio, setPrecio] = useState(String(evento?.PRECIO ?? '0'));
  const [incluyeIva, setIncluyeIva] = useState(evento?.INCLUYE_IVA === 'S');
  const [montoIva, setMontoIva] = useState(
    evento?.MONTO_IVA != null ? String(evento.MONTO_IVA) : '',
  );
  const [publico, setPublico] = useState(
    evento?.PUBLICO_ESPERADO ? String(evento.PUBLICO_ESPERADO) : '',
  );
  const [setupMin, setSetupMin] = useState(
    String(evento?.TIEMPO_SETUP_MIN ?? 30),
  );
  const [cleanMin, setCleanMin] = useState(
    String(evento?.TIEMPO_CLEAN_MIN ?? 30),
  );
  const [destacado, setDestacado] = useState(evento?.DESTACADO === 1);
  const [noPublicar, setNoPublicar] = useState(evento?.NO_PUBLICAR === 'S');
  const [ordenDestacado, setOrdenDestacado] = useState(
    evento?.ORDEN_DESTACADO ? String(evento.ORDEN_DESTACADO) : '',
  );
  const [codItem, setCodItem] = useState(evento?.COD_ITEM ?? '');

  const [locales, setLocales] = useState<LocalRow[]>([]);
  const [salones, setSalones] = useState<SalonRow[]>([]);
  const [configuraciones, setConfiguraciones] = useState<ConfiguracionRow[]>(
    [],
  );
  const [subsalones, setSubsalones] = useState<SubsalonRow[]>([]);

  const [idLocal, setIdLocal] = useState(
    evento?.ID_LOCAL ? String(evento.ID_LOCAL) : '',
  );
  const [idSalon, setIdSalon] = useState(
    evento?.ID_SALON ? String(evento.ID_SALON) : '',
  );
  const [tipoEspacio, setTipoEspacio] = useState<TipoEspacio>(
    evento?.ID_CONFIGURACION
      ? 'configuracion'
      : evento?.ID_SUBSALON
        ? 'subsalon'
        : 'salon',
  );
  const [idConfiguracion, setIdConfiguracion] = useState(
    evento?.ID_CONFIGURACION ? String(evento.ID_CONFIGURACION) : '',
  );
  const [idSubsalon, setIdSubsalon] = useState(
    evento?.ID_SUBSALON ? String(evento.ID_SUBSALON) : '',
  );

  // ocupación ya existente, agrupada por cada fecha del evento
  const [agendaPorDia, setAgendaPorDia] = useState<
    { fecha: string; items: AgendaItem[] }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // secciones colapsables (colapsadas por defecto), patrón igual a certOpen
  const [cuponesOpen, setCuponesOpen] = useState(false);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [expositoresOpen, setExpositoresOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [certGenOpen, setCertGenOpen] = useState(false);

  // clave estable de fechas: solo cambia al añadir/quitar/cambiar una fecha
  const fechasKey = dias
    .map((d) => d.fecha)
    .filter(Boolean)
    .join(',');

  function actualizarDia(i: number, campo: keyof DiaEditable, valor: string) {
    setDias((ds) => ds.map((d, j) => (j === i ? { ...d, [campo]: valor } : d)));
  }
  function agregarDia() {
    setDias((ds) => {
      const ultima = ds[ds.length - 1];
      // fecha del nuevo día = último día + 1 (aritmética local), editable;
      // si el último no tiene fecha, se deja vacío
      const fecha = ultima?.fecha ? sumarUnDia(ultima.fecha) : '';
      return [
        ...ds,
        {
          fecha,
          horaInicio: ultima?.horaInicio ?? '09:00',
          horaFin: ultima?.horaFin ?? '13:00',
        },
      ];
    });
  }
  function quitarDia(i: number) {
    setDias((ds) => (ds.length <= 1 ? ds : ds.filter((_, j) => j !== i)));
  }

  // locales (respeta el filtro global del superadmin)
  useEffect(() => {
    const q = idInstitucion != null ? `?idInstitucion=${idInstitucion}` : '';
    api.get<LocalRow[]>(`/locales${q}`).then(setLocales).catch(() => undefined);
  }, [idInstitucion]);

  // al editar, cargar los días reales del evento (tabla EVENTO_HORAS)
  useEffect(() => {
    if (!evento) return;
    let vivo = true;
    api
      .get<DiaRow[]>(`/eventos/${evento.ID_EVENTO}/dias`)
      .then((ds) => {
        if (!vivo || ds.length === 0) return;
        setDias(
          ds.map((d) => ({
            fecha: d.FECHA,
            horaInicio: d.HORA_INICIO,
            horaFin: d.HORA_FIN,
          })),
        );
      })
      .catch(() => undefined)
      .finally(() => {
        // aunque falle, se desbloquea la agenda con las fechas que haya
        if (vivo) setDiasListos(true);
      });
    return () => {
      vivo = false;
    };
  }, [evento]);

  // cascada local -> salones
  useEffect(() => {
    setSalones([]);
    if (!idLocal) return;
    api
      .get<SalonRow[]>(`/locales/${idLocal}/salones`)
      .then(setSalones)
      .catch(() => undefined);
  }, [idLocal]);

  // cascada salón -> configuraciones (modelos) y subsalones
  useEffect(() => {
    setConfiguraciones([]);
    setSubsalones([]);
    if (!idSalon) return;
    api
      .get<ConfiguracionRow[]>(`/salones/${idSalon}/configuraciones`)
      .then((c) => setConfiguraciones(c.filter((x) => x.ACTIVO === 'Y')))
      .catch(() => undefined);
    api
      .get<SubsalonRow[]>(`/salones/${idSalon}/subsalones`)
      .then(setSubsalones)
      .catch(() => undefined);
  }, [idSalon]);

  // agenda por cada día elegido (horarios ya ocupados): por salón o por local
  useEffect(() => {
    // espera a los días reales: evita la tanda de requests del placeholder
    if (!diasListos) return;
    setAgendaPorDia([]);
    if (!idSalon && !idLocal) return;
    const fechas = [...new Set(fechasKey.split(',').filter(Boolean))];
    if (fechas.length === 0) return;
    const filtro = idSalon ? `idSalon=${idSalon}` : `idLocal=${idLocal}`;
    let cancelado = false;
    Promise.all(
      fechas.map((f) =>
        api
          .get<AgendaItem[]>(`/eventos/agenda?${filtro}&fecha=${f}`)
          .then((items) => ({ fecha: f, items }))
          .catch(() => ({ fecha: f, items: [] as AgendaItem[] })),
      ),
    ).then((rs) => {
      if (!cancelado) setAgendaPorDia(rs.filter((r) => r.items.length > 0));
    });
    return () => {
      cancelado = true;
    };
  }, [idSalon, idLocal, fechasKey, diasListos]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // Validación de días: al menos 1 y cada horaFin > horaInicio (por minutos)
    if (dias.length < 1) {
      setError(t('c.error'));
      return;
    }
    for (const d of dias) {
      if (
        !d.fecha ||
        !d.horaInicio ||
        !d.horaFin ||
        toMin(d.horaFin) <= toMin(d.horaInicio)
      ) {
        setError(t('c.error'));
        return;
      }
    }
    setSending(true);
    const data = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || undefined,
      // horario POR DÍA (tabla EVENTO_HORAS); reemplaza fechaEvento/horaInicio/...
      dias: dias.map((d) => ({
        fecha: d.fecha,
        horaInicio: d.horaInicio,
        horaFin: d.horaFin,
      })),
      // si viene, este evento es un workshop (hijo); null = evento principal
      idEventoPadre: idEventoPadre ? Number(idEventoPadre) : null,
      idLocal: Number(idLocal),
      // sin salón = reservar el local completo
      idSalon: idSalon ? Number(idSalon) : undefined,
      ...(evento && !idSalon ? { localCompleto: true } : {}),
      idConfiguracion:
        idSalon && tipoEspacio === 'configuracion' && idConfiguracion
          ? Number(idConfiguracion)
          : undefined,
      idSubsalon:
        idSalon && tipoEspacio === 'subsalon' && idSubsalon
          ? Number(idSubsalon)
          : undefined,
      precio: Number(precio) || 0,
      incluyeIva,
      montoIva: incluyeIva && montoIva ? Number(montoIva) : undefined,
      publicoEsperado: publico ? Number(publico) : undefined,
      tiempoSetupMin: Number(setupMin) || 0,
      tiempoCleanMin: Number(cleanMin) || 0,
      codItem: codItem.trim() || undefined,
      noPublicar,
    };
    try {
      if (evento) {
        await api.patch(`/eventos/${evento.ID_EVENTO}`, data);
        await api.patch(`/eventos/${evento.ID_EVENTO}/destacar`, {
          destacado,
          ...(destacado && ordenDestacado
            ? { orden: Number(ordenDestacado) }
            : {}),
        });
        onDone(t('ev.updated', { name: data.titulo }));
      } else {
        const res = await api.post<{ idEvento: number }>('/eventos', data);
        if (destacado) {
          await api.patch(`/eventos/${res.idEvento}/destacar`, {
            destacado: true,
            ...(ordenDestacado ? { orden: Number(ordenDestacado) } : {}),
          });
        }
        onDone(t('ev.created', { name: data.titulo }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('c.error'));
      setSending(false);
    }
  }

  const inputCls =
    'w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand';
  const labelCls = 'mb-1 block text-sm font-medium text-text-2';

  return (
    <form
      onSubmit={onSubmit}
      className="mt-5 grid gap-4 rounded-2xl border border-border-app bg-surface p-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      {/* ── 1. Datos básicos ── */}
      <div className="font-semibold text-text sm:col-span-2 lg:col-span-3">
        {evento
          ? t('ev.editingTitle', { name: evento.TITULO })
          : t('ev.newTitle')}
      </div>

      <div className="sm:col-span-2">
        <label className={labelCls}>{t('ev.titleField')}</label>
        <input
          required
          maxLength={200}
          {...propsValidacion(t('common.requiredField'))}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="sm:col-span-2 lg:col-span-3">
        <label className={labelCls}>{t('ev.descField')}</label>
        <textarea
          rows={2}
          maxLength={2000}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Evento padre: si se elige, este evento es un workshop (hijo) */}
      <div className="sm:col-span-2 lg:col-span-3">
        <label className={labelCls}>{t('ev.parentEvent')}</label>
        <select
          value={idEventoPadre}
          onChange={(e) => setIdEventoPadre(e.target.value)}
          className={inputCls}
        >
          <option value="">{t('ev.parentNone')}</option>
          {eventosPrincipales.map((e) => (
            <option key={e.ID_EVENTO} value={e.ID_EVENTO}>
              {e.TITULO}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-text-muted">{t('ev.parentHint')}</p>
      </div>

      <div>
        <label className={labelCls}>{t('ev.itemCode')}</label>
        <input
          maxLength={50}
          value={codItem}
          onChange={(e) => setCodItem(e.target.value)}
          placeholder={t('ev.itemCodePh')}
          className={inputCls}
        />
      </div>

      {/* ── 2. Fechas: horario POR DÍA (repetidor de días) ── */}
      <div className="rounded-lg border border-border-app bg-surface-2 p-3 sm:col-span-2 lg:col-span-3">
        <div className="mb-1 text-sm font-medium text-text-2">
          {t('ev.days')}
        </div>
        <p className="mb-3 text-xs text-text-muted">{t('ev.daysHint')}</p>
        <div className="flex flex-col gap-2">
          {dias.map((d, i) => (
            <div
              key={i}
              className="flex flex-wrap items-end gap-2 rounded-lg border border-border-app bg-surface p-2"
            >
              <div className="min-w-40 flex-1">
                <label className="mb-1 block text-xs font-medium text-text-2">
                  {t('ev.day')} {i + 1}
                </label>
                <input
                  type="date"
                  required
                  {...propsValidacion(t('common.requiredField'))}
                  value={d.fecha}
                  onChange={(e) => actualizarDia(i, 'fecha', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="w-32">
                <label className="mb-1 block text-xs font-medium text-text-2">
                  {t('ev.startTime')}
                </label>
                <input
                  type="time"
                  required
                  {...propsValidacion(t('common.requiredField'))}
                  value={d.horaInicio}
                  onChange={(e) =>
                    actualizarDia(i, 'horaInicio', e.target.value)
                  }
                  className={inputCls}
                />
              </div>
              <div className="w-32">
                <label className="mb-1 block text-xs font-medium text-text-2">
                  {t('ev.endTime')}
                </label>
                <input
                  type="time"
                  required
                  {...propsValidacion(t('common.requiredField'))}
                  value={d.horaFin}
                  onChange={(e) => actualizarDia(i, 'horaFin', e.target.value)}
                  className={inputCls}
                />
              </div>
              <button
                type="button"
                onClick={() => quitarDia(i)}
                disabled={dias.length <= 1}
                className="rounded-lg border border-border-app px-3 py-2 text-xs text-danger hover:bg-surface-2 disabled:opacity-40"
              >
                {t('ev.removeDay')}
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={agregarDia}
          className="mt-3 rounded-lg bg-brand/10 px-3 py-2 text-sm font-semibold text-brand hover:bg-brand/20"
        >
          {t('ev.addDay')}
        </button>
      </div>

      {/* ── 3. Espacio + referencias visuales + agenda de ocupación ── */}
      <div>
        <label className={labelCls}>{t('ev.venue')}</label>
        <select
          required
          {...propsValidacion(t('common.requiredField'))}
          value={idLocal}
          onChange={(e) => {
            setIdLocal(e.target.value);
            setIdSalon('');
            setIdConfiguracion('');
            setIdSubsalon('');
          }}
          className={inputCls}
        >
          <option value="">{t('c.select')}</option>
          {locales.map((l) => (
            <option key={l.ID_LOCAL} value={l.ID_LOCAL}>
              {l.NOMBRE}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>{t('ev.hall')}</label>
        <select
          value={idSalon}
          onChange={(e) => {
            setIdSalon(e.target.value);
            setTipoEspacio('salon');
            setIdConfiguracion('');
            setIdSubsalon('');
          }}
          className={inputCls}
          disabled={!idLocal}
        >
          <option value="">{t('ev.wholeVenueOpt')}</option>
          {salones.map((s) => (
            <option key={s.ID_SALON} value={s.ID_SALON}>
              {s.NOMBRE} ({t('ld.cap')} {s.CAPACIDAD_MAX ?? t('c.na')})
            </option>
          ))}
        </select>
        {idLocal && !idSalon && (
          <p className="mt-1 text-xs text-text-muted">
            {t('ev.wholeVenueHint')}
            {salones.length === 0 ? t('ev.noHallsHint') : ''}
          </p>
        )}
      </div>
      <div>
        <label className={labelCls}>{t('ev.spaceToReserve')}</label>
        <select
          value={tipoEspacio}
          onChange={(e) => {
            setTipoEspacio(e.target.value as TipoEspacio);
            setIdConfiguracion('');
            setIdSubsalon('');
          }}
          className={inputCls}
          disabled={!idSalon}
        >
          <option value="salon">{t('ev.fullHallOpt')}</option>
          <option value="configuracion" disabled={configuraciones.length === 0}>
            {t('ev.layoutOpt', { n: configuraciones.length })}
          </option>
          <option value="subsalon" disabled={subsalones.length === 0}>
            {t('ev.subhallOpt', { n: subsalones.length })}
          </option>
        </select>
      </div>

      {tipoEspacio === 'configuracion' && (
        <div className="sm:col-span-2">
          <label className={labelCls}>{t('ev.layout')}</label>
          <select
            required
            {...propsValidacion(t('common.requiredField'))}
            value={idConfiguracion}
            onChange={(e) => setIdConfiguracion(e.target.value)}
            className={inputCls}
          >
            <option value="">{t('c.select')}</option>
            {configuraciones.map((c) => (
              <option key={c.ID_CONFIGURACION} value={c.ID_CONFIGURACION}>
                {c.NOMBRE} — {c.SUBSALONES_NOMBRES}
              </option>
            ))}
          </select>
        </div>
      )}
      {tipoEspacio === 'subsalon' && (
        <div className="sm:col-span-2">
          <label className={labelCls}>{t('ev.subhall')}</label>
          <select
            required
            {...propsValidacion(t('common.requiredField'))}
            value={idSubsalon}
            onChange={(e) => setIdSubsalon(e.target.value)}
            className={inputCls}
          >
            <option value="">{t('c.select')}</option>
            {subsalones.map((s) => (
              <option key={s.ID_SUBSALON} value={s.ID_SUBSALON}>
                {s.NOMBRE} ({t('ld.cap')} {s.CAPACIDAD_MAX ?? t('c.na')})
              </option>
            ))}
          </select>
        </div>
      )}

      {(idLocal || idSalon) && (
        <div className="rounded-lg border border-border-app bg-surface-2 p-3 sm:col-span-2 lg:col-span-3">
          <div className="mb-2 text-sm font-medium text-text-2">
            {t('ev.visualRef')}
          </div>
          <div className="flex flex-wrap gap-4">
            {idLocal && (
              <RefEspacio
                key={`L${idLocal}`}
                tipo="LOCAL"
                id={Number(idLocal)}
                etiqueta={t('ev.venue')}
              />
            )}
            {idSalon && (
              <RefEspacio
                key={`S${idSalon}`}
                tipo="SALON"
                id={Number(idSalon)}
                etiqueta={t('ev.hall')}
              />
            )}
            {tipoEspacio === 'configuracion' && idConfiguracion && (
              <RefEspacio
                key={`C${idConfiguracion}`}
                tipo="CONFIGURACION"
                id={Number(idConfiguracion)}
                etiqueta={t('ev.layout')}
              />
            )}
            {tipoEspacio === 'subsalon' && idSubsalon && (
              <RefEspacio
                key={`SS${idSubsalon}`}
                tipo="SUBSALON"
                id={Number(idSubsalon)}
                etiqueta={t('ev.subhall')}
              />
            )}
          </div>
        </div>
      )}

      {agendaPorDia.length > 0 && (
        <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 text-sm sm:col-span-2 lg:col-span-3">
          <div className="mb-1 font-semibold text-brand">
            {t('ev.agendaTitle', {
              n: agendaPorDia.reduce((s, g) => s + g.items.length, 0),
            })}
          </div>
          {agendaPorDia.map((g) => (
            <div key={g.fecha} className="mt-1">
              <div className="text-xs font-semibold text-text-2">{g.fecha}</div>
              {g.items.map((a) => (
                <div key={a.ID_EVENTO} className="text-text-2">
                  • «{a.TITULO}» {a.HORA_INICIO}–{a.HORA_FIN}
                  {ventanaReal(a) && (
                    <span className="font-semibold">
                      {' '}
                      {t('ev.occupies', { w: ventanaReal(a)! })}
                    </span>
                  )}
                  {!a.SALON_NOMBRE
                    ? ` ${t('ev.allVenue')}`
                    : a.SUBSALONES_NOMBRES
                      ? ` (${a.SALON_NOMBRE}: ${a.SUBSALONES_NOMBRES})`
                      : ` (${a.SALON_NOMBRE})`}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── 4. Precio y aforo ── */}
      <div>
        <label className={labelCls}>{t('ev.priceField')}</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          className={inputCls}
        />
        <label className="mt-2 flex items-center gap-2 text-sm text-text-2">
          <input
            type="checkbox"
            checked={incluyeIva}
            onChange={(e) => setIncluyeIva(e.target.checked)}
          />
          {t('ev.vatCheck')}
        </label>
        {incluyeIva && (
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            placeholder={t('ev.vatAmount')}
            value={montoIva}
            onChange={(e) => setMontoIva(e.target.value)}
            className={`${inputCls} mt-2`}
          />
        )}
      </div>
      <div>
        <label className={labelCls}>{t('ev.prepMin')}</label>
        <input
          type="number"
          min={0}
          value={setupMin}
          onChange={(e) => setSetupMin(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>{t('ev.cleanMin')}</label>
        <input
          type="number"
          min={0}
          value={cleanMin}
          onChange={(e) => setCleanMin(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>{t('ev.expected')}</label>
        <input
          type="number"
          min={1}
          value={publico}
          onChange={(e) => setPublico(e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="rounded-lg border border-border-app bg-surface-2 p-3 sm:col-span-2 lg:col-span-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text">
            <input
              type="checkbox"
              checked={destacado}
              onChange={(e) => setDestacado(e.target.checked)}
            />
            {t('ev.featuredCheck')}
          </label>
          {revisionObligatoria ? (
            <span className="text-sm text-text-muted">
              {t('ev.aprReviewNotice')}
            </span>
          ) : (
            <label className="flex items-center gap-2 text-sm text-text-2">
              <input
                type="checkbox"
                checked={noPublicar}
                onChange={(e) => setNoPublicar(e.target.checked)}
              />
              {t('ev.privateCheck')}
            </label>
          )}
          {destacado && (
            <label className="flex items-center gap-2 text-sm text-text-2">
              {t('ev.order')}
              <input
                type="number"
                min={1}
                placeholder={t('ev.orderPh')}
                value={ordenDestacado}
                onChange={(e) => setOrdenDestacado(e.target.value)}
                className="w-28 rounded-lg border border-border-app bg-surface px-3 py-1.5 text-text outline-none focus:border-brand"
              />
            </label>
          )}
          <span className="text-xs text-text-muted">
            {t('ev.orderHint')}
          </span>
        </div>
      </div>

      {/* ── 5. Portada ── */}
      {evento && (
        <div className="rounded-lg border border-border-app bg-surface-2 p-3 sm:col-span-2 lg:col-span-3">
          <div className="mb-2 text-sm font-medium text-text-2">
            {t('ev.cover')}
          </div>
          <ImagenNas
            tipoEntidad="EVENTO"
            id={evento.ID_EVENTO}
            tipoArchivo="PORTADA"
            uploadPath={`/eventos/${evento.ID_EVENTO}/imagen`}
            deletePath={`/eventos/${evento.ID_EVENTO}/imagen`}
            etiqueta={t('ev.uploadCover')}
            className="h-24 w-40"
            onChanged={onImagenSubida}
          />
        </div>
      )}

      {/* ── 6. Secciones colapsables (colapsadas por defecto) ── */}
      {evento && (
        <>
          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="button"
              onClick={() => setCuponesOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-left text-sm font-semibold text-text-2 transition hover:bg-surface"
            >
              <span className="text-brand">{cuponesOpen ? '▾' : '▸'}</span>
              {t('cup.title')}
            </button>
            {cuponesOpen && (
              <div className="mt-2">
                <CuponesEvento idEvento={evento.ID_EVENTO} />
              </div>
            )}
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="button"
              onClick={() => setDetalleOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-left text-sm font-semibold text-text-2 transition hover:bg-surface"
            >
              <span className="text-brand">{detalleOpen ? '▾' : '▸'}</span>
              {t('ev.detailSection')}
            </button>
            {detalleOpen && (
              <div className="mt-2">
                <EventoDetalleForm idEvento={evento.ID_EVENTO} />
              </div>
            )}
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="button"
              onClick={() => setExpositoresOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-left text-sm font-semibold text-text-2 transition hover:bg-surface"
            >
              <span className="text-brand">{expositoresOpen ? '▾' : '▸'}</span>
              {t('exp.section')}
            </button>
            {expositoresOpen && (
              <div className="mt-2">
                <ExpositoresEvento idEvento={evento.ID_EVENTO} />
              </div>
            )}
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="button"
              onClick={() => setAgendaOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-left text-sm font-semibold text-text-2 transition hover:bg-surface"
            >
              <span className="text-brand">{agendaOpen ? '▾' : '▸'}</span>
              {t('ag.section')}
            </button>
            {agendaOpen && (
              <div className="mt-2">
                <AgendaEvento idEvento={evento.ID_EVENTO} />
              </div>
            )}
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="button"
              onClick={() => setCertGenOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-left text-sm font-semibold text-text-2 transition hover:bg-surface"
            >
              <span className="text-brand">{certGenOpen ? '▾' : '▸'}</span>
              {t('ct.title')}
            </button>
            {certGenOpen && (
              <div className="mt-2">
                <CertificadosEvento idEvento={evento.ID_EVENTO} tituloEvento={evento.TITULO} />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── 7. Cierre: error + acciones ── */}
      {error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-2 lg:col-span-3">
          {error}
        </p>
      )}

      <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          disabled={sending}
          className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {sending ? t('c.saving') : evento ? t('ld.saveChanges') : t('ev.create')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border-app px-4 py-2 text-text-2 hover:bg-surface-2"
        >
          {t('c.cancel')}
        </button>
      </div>
    </form>
  );
}

interface CuponRow {
  ID_CUPON: number;
  CODIGO: string;
  MONTO_DESCUENTO: number;
  TIPO_DESCUENTO: 'M' | 'P';
  MAX_USOS: number | null;
  USOS: number;
}

function CuponesEvento({ idEvento }: { idEvento: number }) {
  const { t, locale } = useI18n();
  const dialogo = useDialogo();
  const [cupones, setCupones] = useState<CuponRow[]>([]);
  const [codigo, setCodigo] = useState('');
  const [monto, setMonto] = useState('');
  const [tipo, setTipo] = useState<'M' | 'P'>('M');
  const [maxUsos, setMaxUsos] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const cargar = useCallback(async () => {
    setCupones(await api.get<CuponRow[]>(`/eventos/${idEvento}/cupones`));
  }, [idEvento]);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  async function crear() {
    if (sending) return;
    if (!codigo.trim() || !monto) return;
    setError(null);
    setSending(true);
    try {
      await api.post(`/eventos/${idEvento}/cupones`, {
        codigo: codigo.trim(),
        montoDescuento: Number(monto),
        tipoDescuento: tipo,
        maxUsos: maxUsos ? Number(maxUsos) : null,
      });
      setCodigo('');
      setMonto('');
      setTipo('M');
      setMaxUsos('');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('c.error'));
    } finally {
      setSending(false);
    }
  }

  async function eliminar(c: CuponRow) {
    const ok = await dialogo.confirmar({
      titulo: t('dlg.deleteTitle', { name: c.CODIGO }),
      tono: 'danger',
      confirmar: t('c.delete'),
    });
    if (!ok) return;
    try {
      await api.del(`/eventos/${idEvento}/cupones/${c.ID_CUPON}`);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('c.error'));
    }
  }

  return (
    <div className="rounded-lg border border-border-app bg-surface-2 p-3 sm:col-span-2 lg:col-span-3">
      <div className="flex flex-wrap items-end gap-2">
        <input
          maxLength={50}
          placeholder={t('cup.code')}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          className="min-w-40 flex-1 rounded-lg border border-border-app bg-surface px-3 py-2 text-sm text-text outline-none focus:border-brand"
        />
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as 'M' | 'P')}
          aria-label={t('cup.type')}
          className="rounded-lg border border-border-app bg-surface px-3 py-2 text-sm text-text outline-none focus:border-brand"
        >
          <option value="M">{t('cup.typeAmount')}</option>
          <option value="P">{t('cup.typePercent')}</option>
        </select>
        <input
          type="number"
          min={0.01}
          max={tipo === 'P' ? 100 : undefined}
          step="0.01"
          placeholder={tipo === 'P' ? t('cup.typePercent') : t('cup.amount')}
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          className="w-32 rounded-lg border border-border-app bg-surface px-3 py-2 text-sm text-text outline-none focus:border-brand"
        />
        <input
          type="number"
          min={1}
          step="1"
          placeholder={t('cup.maxUses')}
          title={t('cup.maxUsesHint')}
          value={maxUsos}
          onChange={(e) => setMaxUsos(e.target.value)}
          className="w-32 rounded-lg border border-border-app bg-surface px-3 py-2 text-sm text-text outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={() => crear()}
          disabled={sending}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {sending ? t('c.saving') : t('cup.add')}
        </button>
      </div>
      {error && (
        <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {cupones.map((c) => (
          <span
            key={c.ID_CUPON}
            className="flex items-center gap-2 rounded-full border border-border-app bg-surface px-3 py-1 text-xs"
          >
            <span className="font-mono font-semibold text-text">{c.CODIGO}</span>
            <span className="text-success">
              {c.TIPO_DESCUENTO === 'P'
                ? `${c.MONTO_DESCUENTO}${t('cup.percentSuffix')}`
                : `-${money(c.MONTO_DESCUENTO, locale)}`}
            </span>
            {c.MAX_USOS != null && (
              <span className="text-text-muted">
                {t('cup.uses', { used: c.USOS ?? 0, max: c.MAX_USOS })}
              </span>
            )}
            <button
              type="button"
              onClick={() => eliminar(c)}
              className="text-danger hover:opacity-70"
              title={t('c.delete')}
            >
              &#10005;
            </button>
          </span>
        ))}
        {cupones.length === 0 && (
          <span className="text-xs text-text-muted">{t('cup.empty')}</span>
        )}
      </div>
    </div>
  );
}

/** Detalle 1:1 del evento (EVENTO_DETALLE): descripción, temas, nivel/modalidad,
 *  duración y config de certificado. Se guarda con PUT (upsert). Es un <div>
 *  (no <form>) porque vive dentro del <form> del evento. */
interface DetalleData {
  descripcionCorta?: string | null;
  descripcionLarga?: string | null;
  queAprenderas?: string[];
  temas?: string[];
  requisitos?: string[];
  nivel?: string | null;
  modalidad?: string | null;
  duracionValor?: number | null;
  duracionUnidad?: string | null;
  certHabilitado?: boolean;
  certTipo?: string | null;
  certEntrega?: string | null;
  [k: string]: unknown; // campos que el panel no edita se conservan tal cual
}

/** Lista editable de bullets (+Añadir / quitar) reutilizada por el detalle. */
function ListaEditable({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useI18n();
  const fieldCls =
    'w-full rounded-lg border border-border-app bg-surface px-3 py-2 text-sm text-text outline-none focus:border-brand';
  return (
    <div className="sm:col-span-2">
      <label className="mb-1 block text-sm font-medium text-text-2">{label}</label>
      <div className="flex flex-col gap-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={it}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
              className={fieldCls}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="shrink-0 rounded-lg border border-border-app px-2 py-2 text-xs text-danger hover:bg-surface-2"
            >
              {t('det.remove')}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...items, ''])}
          className="self-start rounded-lg border border-border-app px-3 py-1.5 text-xs font-medium text-brand hover:bg-surface-2"
        >
          {t('det.addItem')}
        </button>
      </div>
    </div>
  );
}

function EventoDetalleForm({ idEvento }: { idEvento: number }) {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<DetalleData>({});
  const [descCorta, setDescCorta] = useState('');
  const [descLarga, setDescLarga] = useState('');
  const [queAprenderas, setQueAprenderas] = useState<string[]>([]);
  const [temas, setTemas] = useState<string[]>([]);
  const [requisitos, setRequisitos] = useState<string[]>([]);
  const [nivel, setNivel] = useState('');
  const [modalidad, setModalidad] = useState('');
  const [duracionValor, setDuracionValor] = useState('');
  const [duracionUnidad, setDuracionUnidad] = useState('');
  const [certOpen, setCertOpen] = useState(false);
  const [certHabilitado, setCertHabilitado] = useState(false);
  const [certTipo, setCertTipo] = useState('');
  const [certEntrega, setCertEntrega] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<DetalleData>(`/eventos/${idEvento}/detalle`)
      .then((d) => {
        if (!alive) return;
        const data = d ?? {};
        setLoaded(data);
        setDescCorta(data.descripcionCorta ?? '');
        setDescLarga(data.descripcionLarga ?? '');
        setQueAprenderas(data.queAprenderas ?? []);
        setTemas(data.temas ?? []);
        setRequisitos(data.requisitos ?? []);
        setNivel(data.nivel ?? '');
        setModalidad(data.modalidad ?? '');
        setDuracionValor(
          data.duracionValor != null ? String(data.duracionValor) : '',
        );
        setDuracionUnidad(data.duracionUnidad ?? '');
        setCertHabilitado(!!data.certHabilitado);
        setCertTipo(data.certTipo ?? '');
        setCertEntrega(data.certEntrega ?? '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('c.error')))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [idEvento]);

  async function guardar() {
    if (sending) return;
    setError(null);
    setOkMsg(null);
    setSending(true);
    try {
      // se parte de lo cargado para no perder campos que el panel no edita
      const payload = {
        ...loaded,
        descripcionCorta: descCorta.trim() || null,
        descripcionLarga: descLarga.trim() || null,
        queAprenderas: queAprenderas.map((s) => s.trim()).filter(Boolean),
        temas: temas.map((s) => s.trim()).filter(Boolean),
        requisitos: requisitos.map((s) => s.trim()).filter(Boolean),
        nivel: nivel || null,
        modalidad: modalidad || null,
        duracionValor: duracionValor ? Number(duracionValor) : null,
        duracionUnidad: duracionUnidad || null,
        certHabilitado,
        certTipo: certTipo || null,
        certEntrega: certEntrega || null,
      };
      const res = await api.put<DetalleData>(
        `/eventos/${idEvento}/detalle`,
        payload,
      );
      setLoaded(res ?? {});
      setOkMsg(t('det.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('c.error'));
    } finally {
      setSending(false);
    }
  }

  const fieldCls =
    'w-full rounded-lg border border-border-app bg-surface px-3 py-2 text-sm text-text outline-none focus:border-brand';
  const lblCls = 'mb-1 block text-sm font-medium text-text-2';

  return (
    <div className="rounded-lg border border-border-app bg-surface-2 p-3 sm:col-span-2 lg:col-span-3">
      <p className="mb-3 mt-0.5 text-xs text-text-muted">{t('ev.detailDesc')}</p>

      {!loading && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={lblCls}>{t('det.shortDesc')}</label>
            <textarea
              rows={2}
              maxLength={500}
              value={descCorta}
              onChange={(e) => setDescCorta(e.target.value)}
              className={fieldCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={lblCls}>{t('det.longDesc')}</label>
            <textarea
              rows={4}
              value={descLarga}
              onChange={(e) => setDescLarga(e.target.value)}
              className={fieldCls}
            />
          </div>

          <ListaEditable
            label={t('det.learn')}
            items={queAprenderas}
            onChange={setQueAprenderas}
          />
          <ListaEditable
            label={t('det.topics')}
            items={temas}
            onChange={setTemas}
          />
          <ListaEditable
            label={t('det.requirements')}
            items={requisitos}
            onChange={setRequisitos}
          />

          <div>
            <label className={lblCls}>{t('det.level')}</label>
            <select
              value={nivel}
              onChange={(e) => setNivel(e.target.value)}
              className={fieldCls}
            >
              <option value="">{t('det.none')}</option>
              <option value="PRINCIPIANTE">{t('det.levelPRINCIPIANTE')}</option>
              <option value="INTERMEDIO">{t('det.levelINTERMEDIO')}</option>
              <option value="AVANZADO">{t('det.levelAVANZADO')}</option>
            </select>
          </div>
          <div>
            <label className={lblCls}>{t('det.modality')}</label>
            <select
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value)}
              className={fieldCls}
            >
              <option value="">{t('det.none')}</option>
              <option value="PRESENCIAL">{t('det.modPRESENCIAL')}</option>
              <option value="ONLINE">{t('det.modONLINE')}</option>
              <option value="HIBRIDO">{t('det.modHIBRIDO')}</option>
            </select>
          </div>
          <div>
            <label className={lblCls}>{t('det.duration')}</label>
            <input
              type="number"
              min={0}
              step="0.5"
              value={duracionValor}
              onChange={(e) => setDuracionValor(e.target.value)}
              className={fieldCls}
            />
          </div>
          <div>
            <label className={lblCls}>{t('det.unit')}</label>
            <select
              value={duracionUnidad}
              onChange={(e) => setDuracionUnidad(e.target.value)}
              className={fieldCls}
            >
              <option value="">{t('det.none')}</option>
              <option value="HORAS">{t('det.uHORAS')}</option>
              <option value="SEMANAS">{t('det.uSEMANAS')}</option>
              <option value="SESIONES">{t('det.uSESIONES')}</option>
              <option value="DIAS">{t('det.uDIAS')}</option>
            </select>
          </div>
        </div>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setCertOpen((v) => !v)}
          className="text-sm font-semibold text-brand hover:underline"
        >
          {certOpen ? '▾' : '▸'} {t('det.certSection')}
        </button>
        {certOpen && (
          <div className="mt-2 grid gap-3 rounded-lg border border-border-app bg-surface p-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-text-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={certHabilitado}
                onChange={(e) => setCertHabilitado(e.target.checked)}
                className="h-4 w-4 rounded border-border-app text-brand focus:ring-brand"
              />
              {t('det.certEnabled')}
            </label>
            <div>
              <label className={lblCls}>{t('det.certType')}</label>
              <select
                value={certTipo}
                onChange={(e) => setCertTipo(e.target.value)}
                className={fieldCls}
              >
                <option value="">{t('det.none')}</option>
                <option value="ASISTENCIA">{t('det.ctASISTENCIA')}</option>
                <option value="PARTICIPACION">{t('det.ctPARTICIPACION')}</option>
                <option value="FINALIZACION">{t('det.ctFINALIZACION')}</option>
              </select>
            </div>
            <div>
              <label className={lblCls}>{t('det.certDelivery')}</label>
              <select
                value={certEntrega}
                onChange={(e) => setCertEntrega(e.target.value)}
                className={fieldCls}
              >
                <option value="">{t('det.none')}</option>
                <option value="DESCARGA">{t('det.cdDESCARGA')}</option>
                <option value="EMAIL">{t('det.cdEMAIL')}</option>
                <option value="APP">{t('det.cdAPP')}</option>
              </select>
            </div>
            <p className="text-xs text-text-muted sm:col-span-2">
              {t('det.certNote')}
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => guardar()}
          disabled={sending || loading}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {sending ? t('c.saving') : t('det.save')}
        </button>
        {okMsg && <span className="text-xs font-medium text-success">{okMsg}</span>}
      </div>
    </div>
  );
}

/** Un expositor tal como lo devuelve la API (camelCase). */
interface ExpositorRow {
  idExpositor: number;
  nombreCompleto: string;
  cargo: string | null;
  organizacion: string | null;
  bio: string | null;
  fotoUrl: string | null;
  rol: string | null;
  esDestacado: boolean;
}

/** Sub-editor de un expositor (alta o edición). <div>, no <form>. */
function ExpositorForm({
  idEvento,
  expositor,
  onDone,
  onCancel,
}: {
  idEvento: number;
  expositor: ExpositorRow | null;
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [nombre, setNombre] = useState(expositor?.nombreCompleto ?? '');
  const [cargo, setCargo] = useState(expositor?.cargo ?? '');
  const [organizacion, setOrganizacion] = useState(expositor?.organizacion ?? '');
  const [rol, setRol] = useState(expositor?.rol ?? 'EXPOSITOR');
  const [bio, setBio] = useState(expositor?.bio ?? '');
  const [destacado, setDestacado] = useState(!!expositor?.esDestacado);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fieldCls =
    'w-full rounded-lg border border-border-app bg-surface px-3 py-2 text-sm text-text outline-none focus:border-brand';
  const lblCls = 'mb-1 block text-sm font-medium text-text-2';

  async function guardar() {
    if (sending) return;
    // validación en JS (sin 'required' HTML para no romper el submit del evento padre)
    if (!nombre.trim()) {
      setError(t('exp.name'));
      return;
    }
    setError(null);
    setSending(true);
    try {
      const payload = {
        nombreCompleto: nombre.trim(),
        cargo: cargo.trim() || null,
        organizacion: organizacion.trim() || null,
        rol: rol || null,
        bio: bio.trim() || null,
        esDestacado: destacado,
      };
      if (expositor) {
        await api.patch(
          `/eventos/${idEvento}/expositores/${expositor.idExpositor}`,
          payload,
        );
      } else {
        await api.post(`/eventos/${idEvento}/expositores`, payload);
      }
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('c.error'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-2 grid gap-3 rounded-lg border border-brand/30 bg-surface p-3 sm:grid-cols-2">
      <div>
        <label className={lblCls}>{t('exp.name')}</label>
        <input
          maxLength={150}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className={fieldCls}
        />
      </div>
      <div>
        <label className={lblCls}>{t('exp.role')}</label>
        <input
          maxLength={150}
          value={cargo}
          onChange={(e) => setCargo(e.target.value)}
          className={fieldCls}
        />
      </div>
      <div>
        <label className={lblCls}>{t('exp.org')}</label>
        <input
          maxLength={150}
          value={organizacion}
          onChange={(e) => setOrganizacion(e.target.value)}
          className={fieldCls}
        />
      </div>
      <div>
        <label className={lblCls}>{t('exp.roleType')}</label>
        <select
          value={rol}
          onChange={(e) => setRol(e.target.value)}
          className={fieldCls}
        >
          <option value="EXPOSITOR">{t('exp.rEXPOSITOR')}</option>
          <option value="CO_EXPOSITOR">{t('exp.rCO_EXPOSITOR')}</option>
          <option value="MODERADOR">{t('exp.rMODERADOR')}</option>
          <option value="KEYNOTE">{t('exp.rKEYNOTE')}</option>
        </select>
      </div>
      {/* Foto del expositor: solo botón de carga al NAS (como la portada del evento).
          Aparece únicamente al editar, cuando ya existe idExpositor para subir. */}
      {expositor ? (
        <div className="sm:col-span-2">
          <label className={lblCls}>{t('exp.photo')}</label>
          <ImagenNas
            tipoEntidad="EXPOSITOR"
            id={expositor.idExpositor}
            tipoArchivo="PORTADA"
            uploadPath={`/eventos/${idEvento}/expositores/${expositor.idExpositor}/imagen`}
            deletePath={`/eventos/${idEvento}/expositores/${expositor.idExpositor}/imagen`}
            etiqueta={t('exp.photo')}
            className="h-20 w-20 rounded-full"
          />
        </div>
      ) : (
        <div className="sm:col-span-2">
          <label className={lblCls}>{t('exp.photo')}</label>
          <p className="text-xs text-text-muted">{t('exp.photoSaveFirst')}</p>
        </div>
      )}
      <div className="sm:col-span-2">
        <label className={lblCls}>{t('exp.bio')}</label>
        <textarea
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className={fieldCls}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-text-2 sm:col-span-2">
        <input
          type="checkbox"
          checked={destacado}
          onChange={(e) => setDestacado(e.target.checked)}
          className="h-4 w-4 rounded border-border-app text-brand focus:ring-brand"
        />
        {t('exp.featured')}
      </label>

      {error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 sm:col-span-2">
        <button
          type="button"
          onClick={() => guardar()}
          disabled={sending}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {sending ? t('c.saving') : t('exp.save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border-app px-3 py-2 text-sm text-text-2 hover:bg-surface-2"
        >
          {t('c.cancel')}
        </button>
      </div>
    </div>
  );
}

/** Avatar del expositor: intenta la foto del NAS ('EXPOSITOR'/'PORTADA'); si falla
 *  cae a la fotoUrl externa; si esa también falla, muestra la inicial. */
function ExpositorAvatar({ expositor }: { expositor: ExpositorRow }) {
  const nasSrc = nasImagenUrl('EXPOSITOR', expositor.idExpositor, 'PORTADA');
  const [src, setSrc] = useState(nasSrc);
  const [fallbackUsado, setFallbackUsado] = useState(false);
  const [sinImagen, setSinImagen] = useState(false);

  if (sinImagen) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border-app bg-surface-2 text-sm font-semibold text-text-muted">
        {(expositor.nombreCompleto || '?').charAt(0)}
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt=""
      className="h-12 w-12 shrink-0 rounded-full border border-border-app object-cover"
      loading="lazy"
      onError={() => {
        if (!fallbackUsado && expositor.fotoUrl) {
          setFallbackUsado(true);
          setSrc(expositor.fotoUrl);
        } else {
          setSinImagen(true);
        }
      }}
    />
  );
}

function ExpositoresEvento({ idEvento }: { idEvento: number }) {
  const { t } = useI18n();
  const dialogo = useDialogo();
  const [lista, setLista] = useState<ExpositorRow[]>([]);
  const [editando, setEditando] = useState<ExpositorRow | 'nuevo' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLista(await api.get<ExpositorRow[]>(`/eventos/${idEvento}/expositores`));
  }, [idEvento]);

  useEffect(() => {
    cargar().catch((e) => setError(e instanceof Error ? e.message : t('c.error')));
  }, [cargar]);

  async function eliminar(e: ExpositorRow) {
    const ok = await dialogo.confirmar({
      titulo: t('exp.deleteTitle'),
      mensaje: t('exp.deleteMsg'),
      tono: 'danger',
      confirmar: t('c.delete'),
    });
    if (!ok) return;
    try {
      await api.del(`/eventos/${idEvento}/expositores/${e.idExpositor}`);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('c.error'));
    }
  }

  const roleLabel = (rol: string | null) => t(`exp.r${rol || 'EXPOSITOR'}`);

  return (
    <div className="rounded-lg border border-border-app bg-surface-2 p-3 sm:col-span-2 lg:col-span-3">
      <p className="mb-3 mt-0.5 text-xs text-text-muted">{t('exp.desc')}</p>

      {error && (
        <p className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {lista.map((e) => (
          <div
            key={e.idExpositor}
            className="flex items-center gap-3 rounded-lg border border-border-app bg-surface p-2"
          >
            <ExpositorAvatar expositor={e} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-text">{e.nombreCompleto}</span>
                <span className="rounded-full border border-border-app px-2 py-0.5 text-[10px] text-text-2">
                  {roleLabel(e.rol)}
                </span>
                {e.esDestacado && (
                  <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                    {t('exp.featured')}
                  </span>
                )}
              </div>
              {(e.cargo || e.organizacion) && (
                <div className="truncate text-xs text-text-muted">
                  {[e.cargo, e.organizacion].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => setEditando(e)}
                className="rounded-lg border border-border-app px-2 py-1 text-xs text-text-2 hover:bg-surface-2"
              >
                {t('c.edit')}
              </button>
              <button
                type="button"
                onClick={() => eliminar(e)}
                className="rounded-lg border border-border-app px-2 py-1 text-xs text-danger hover:bg-surface-2"
                title={t('c.delete')}
              >
                &#10005;
              </button>
            </div>
          </div>
        ))}
        {lista.length === 0 && !editando && (
          <span className="text-xs text-text-muted">{t('exp.empty')}</span>
        )}
      </div>

      {editando ? (
        <ExpositorForm
          idEvento={idEvento}
          expositor={editando === 'nuevo' ? null : editando}
          onCancel={() => setEditando(null)}
          onDone={async () => {
            setEditando(null);
            await cargar();
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditando('nuevo')}
          className="mt-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          {t('exp.add')}
        </button>
      )}
    </div>
  );
}
