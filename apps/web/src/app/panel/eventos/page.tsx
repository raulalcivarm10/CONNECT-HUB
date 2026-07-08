'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { nasImagenUrl, type NasEntidad } from '@/lib/nas';
import { FORMATOS_LEYENDA, validarImagen } from '@/lib/imagenes';
import { useLightbox } from '@/lib/lightbox';
import { useInstitucionFiltro } from '@/lib/institucion-context';
import { useI18n } from '@/lib/i18n';
import type {
  ConfiguracionRow,
  EventoRow,
  LocalRow,
  SalonRow,
  SubsalonRow,
} from '@/lib/types';

const money = (v: number) =>
  new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(
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

const toMin = (h: string) => {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
};
const toHora = (min: number) => {
  const m = Math.max(0, Math.min(min, 24 * 60 - 1));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

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

export default function EventosPage() {
  const { qs, nombreFiltro } = useInstitucionFiltro();
  const { t } = useI18n();
  const [eventos, setEventos] = useState<EventoRow[]>([]);
  const [editar, setEditar] = useState<EventoRow | null>(null);
  const [ver, setVer] = useState<EventoRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // sube al guardar una portada: remonta las miniaturas del listado
  // (rompe la caché y reintenta las que estaban ocultas por error)
  const [imgVersion, setImgVersion] = useState(0);

  const cargar = useCallback(async () => {
    setEventos(await api.get<EventoRow[]>(`/eventos${qs}`));
  }, [qs]);

  useEffect(() => {
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
    setError(null);
    setOk(null);
    try {
      await api.del(`/eventos/${ev.ID_EVENTO}`);
      setOk(t('ev.deleted', { name: ev.TITULO }));
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
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
      setError(e instanceof Error ? e.message : 'Error');
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
        <DetalleEvento
          evento={ver}
          imgVersion={imgVersion}
          onEditar={() => {
            setEditar(ver);
            setVer(null);
          }}
          onCerrar={() => setVer(null)}
        />
      )}

      {(showForm || editar) && (
        <EventoForm
          evento={editar}
          fechaInicial={fechaNueva}
          onImagenSubida={() => setImgVersion(Date.now())}
          onDone={(msg) => {
            setOk(msg);
            setShowForm(false);
            setEditar(null);
            void cargar();
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
            {eventos.map((ev) => (
              <tr key={ev.ID_EVENTO} className="border-b border-border-app/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={`${ev.ID_EVENTO}-${imgVersion}`}
                      src={nasImagenUrl('EVENTO', ev.ID_EVENTO, 'PORTADA', imgVersion)}
                      alt=""
                      className="h-10 w-14 shrink-0 rounded-lg border border-border-app object-cover"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.visibility = 'hidden';
                      }}
                    />
                    <div>
                      <div className="font-medium text-text">{ev.TITULO}</div>
                      <div className="text-xs text-text-muted">
                        {ev.INSTITUCION ?? ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-text-2">
                  {ev.FECHA_EVENTO}
                  <div className="text-xs text-text-muted">
                    {ev.HORA_INICIO}–{ev.HORA_FIN}
                    {ev.TIEMPO_SETUP_MIN || ev.TIEMPO_CLEAN_MIN
                      ? ` ${t('ev.prepClean', { s: ev.TIEMPO_SETUP_MIN ?? 0, c: ev.TIEMPO_CLEAN_MIN ?? 0 })}`
                      : ''}
                  </div>
                </td>
                <td className="px-4 py-3 text-text-2">{espacio(ev)}</td>
                <td className="px-4 py-3 text-text">
                  {ev.PRECIO > 0 ? money(ev.PRECIO) : t('c.free')}
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
            {eventos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                  {t('ev.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
  imgVersion: number;
  onEditar: () => void;
  onCerrar: () => void;
}) {
  const [sinImagen, setSinImagen] = useState(false);
  const { t } = useI18n();
  const lightbox = useLightbox();
  const datos: Array<[string, string]> = [
    [t('ev.date'), evento.FECHA_EVENTO],
    [t('ev.schedule'), `${evento.HORA_INICIO ?? '—'}–${evento.HORA_FIN ?? '—'}`],
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
    [t('ev.price'), evento.PRECIO > 0 ? money(evento.PRECIO) : t('c.free')],
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
            alt="Portada"
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
  fechaInicial,
  onDone,
  onCancel,
  onImagenSubida,
}: {
  evento: EventoRow | null;
  /** fecha prellenada al crear (viene del calendario) */
  fechaInicial?: string;
  onDone: (msg: string) => void;
  onCancel: () => void;
  onImagenSubida?: () => void;
}) {
  const { idInstitucion } = useInstitucionFiltro();
  const { t } = useI18n();
  const [titulo, setTitulo] = useState(evento?.TITULO ?? '');
  const [descripcion, setDescripcion] = useState(evento?.DESCRIPCION ?? '');
  const [fecha, setFecha] = useState(
    evento?.FECHA_EVENTO ?? fechaInicial ?? '',
  );
  const [horaInicio, setHoraInicio] = useState(evento?.HORA_INICIO ?? '09:00');
  const [horaFin, setHoraFin] = useState(evento?.HORA_FIN ?? '13:00');
  const [precio, setPrecio] = useState(String(evento?.PRECIO ?? '0'));
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

  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // imagen de portada (solo al editar: el evento ya tiene ID en el NAS)
  const [imagenFile, setImagenFile] = useState<File | null>(null);
  const [imagenVersion, setImagenVersion] = useState(0);
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [imagenOk, setImagenOk] = useState<string | null>(null);

  const [imagenError, setImagenError] = useState<string | null>(null);

  function elegirImagen(file: File | null) {
    setImagenError(null);
    setImagenOk(null);
    if (!file) {
      setImagenFile(null);
      return;
    }
    const problema = validarImagen(file);
    if (problema) {
      setImagenError(problema);
      setImagenFile(null);
      return;
    }
    setImagenFile(file);
  }

  async function subirImagen() {
    if (!evento || !imagenFile || subiendoImagen) return;
    setError(null);
    setImagenError(null);
    setImagenOk(null);
    setSubiendoImagen(true);
    try {
      const fd = new FormData();
      fd.append('file', imagenFile, imagenFile.name);
      fd.append('tipoArchivo', 'PORTADA');
      await api.upload(`/eventos/${evento.ID_EVENTO}/imagen`, fd);
      setImagenVersion(Date.now());
      setImagenFile(null);
      setImagenOk(t('ev.coverOk'));
      onImagenSubida?.(); // refresca las miniaturas del listado de atrás
    } catch (err) {
      setImagenError(
        err instanceof Error
          ? err.message
          : 'No se pudo subir la imagen. Inténtalo de nuevo.',
      );
    } finally {
      setSubiendoImagen(false);
    }
  }

  // locales (respeta el filtro global del superadmin)
  useEffect(() => {
    const q = idInstitucion != null ? `?idInstitucion=${idInstitucion}` : '';
    api.get<LocalRow[]>(`/locales${q}`).then(setLocales).catch(() => undefined);
  }, [idInstitucion]);

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

  // agenda de la fecha elegida (horarios ya ocupados): por salón o por local
  useEffect(() => {
    setAgenda([]);
    if (!fecha || (!idSalon && !idLocal)) return;
    const filtro = idSalon ? `idSalon=${idSalon}` : `idLocal=${idLocal}`;
    api
      .get<AgendaItem[]>(`/eventos/agenda?${filtro}&fecha=${fecha}`)
      .then(setAgenda)
      .catch(() => undefined);
  }, [idSalon, idLocal, fecha]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    const data = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || undefined,
      fechaEvento: fecha,
      horaInicio,
      horaFin,
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
      publicoEsperado: publico ? Number(publico) : undefined,
      tiempoSetupMin: Number(setupMin) || 0,
      tiempoCleanMin: Number(cleanMin) || 0,
      codItem: codItem.trim() || undefined,
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
      setError(err instanceof Error ? err.message : 'Error');
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
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          className={inputCls}
        />
      </div>
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
      </div>

      <div>
        <label className={labelCls}>{t('ev.itemCode')}</label>
        <input
          maxLength={50}
          value={codItem}
          onChange={(e) => setCodItem(e.target.value)}
          placeholder="p. ej. ITM-0001"
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

      <div>
        <label className={labelCls}>{t('ev.date')}</label>
        <input
          type="date"
          required
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>{t('ev.startTime')}</label>
        <input
          type="time"
          required
          value={horaInicio}
          onChange={(e) => setHoraInicio(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>{t('ev.endTime')}</label>
        <input
          type="time"
          required
          value={horaFin}
          onChange={(e) => setHoraFin(e.target.value)}
          className={inputCls}
        />
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

      <div>
        <label className={labelCls}>{t('ev.venue')}</label>
        <select
          required
          value={idLocal}
          onChange={(e) => {
            setIdLocal(e.target.value);
            setIdSalon('');
            setIdConfiguracion('');
            setIdSubsalon('');
          }}
          className={inputCls}
        >
          <option value="">Seleccionar…</option>
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
              {s.NOMBRE} (cap. {s.CAPACIDAD_MAX ?? 's/d'})
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
            value={idConfiguracion}
            onChange={(e) => setIdConfiguracion(e.target.value)}
            className={inputCls}
          >
            <option value="">Seleccionar…</option>
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
            value={idSubsalon}
            onChange={(e) => setIdSubsalon(e.target.value)}
            className={inputCls}
          >
            <option value="">Seleccionar…</option>
            {subsalones.map((s) => (
              <option key={s.ID_SUBSALON} value={s.ID_SUBSALON}>
                {s.NOMBRE} (cap. {s.CAPACIDAD_MAX ?? 's/d'})
              </option>
            ))}
          </select>
        </div>
      )}

      {evento && (
        <div className="rounded-lg border border-border-app bg-surface-2 p-3 sm:col-span-2 lg:col-span-3">
          <div className="mb-1 text-sm font-medium text-text-2">
            {t('ev.cover')}
          </div>
          <div className="mb-2 text-xs text-text-muted">
            {FORMATOS_LEYENDA()}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={imagenVersion}
              src={nasImagenUrl('EVENTO', evento.ID_EVENTO, 'PORTADA', imagenVersion)}
              alt="Portada actual"
              className="h-20 w-32 rounded-lg border border-border-app object-cover"
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden';
              }}
            />
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={(e) => elegirImagen(e.target.files?.[0] ?? null)}
              className="text-sm text-text-2 file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand"
            />
            <button
              type="button"
              onClick={subirImagen}
              disabled={!imagenFile || subiendoImagen}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {subiendoImagen ? t('ev.uploading') : t('ev.uploadCover')}
            </button>
          </div>
          {imagenError && (
            <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              {imagenError}
            </p>
          )}
          {imagenOk && (
            <p className="mt-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
              {imagenOk}
            </p>
          )}
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

      {agenda.length > 0 && (
        <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 text-sm sm:col-span-2 lg:col-span-3">
          <div className="mb-1 font-semibold text-brand">
            {t('ev.agendaTitle', { n: agenda.length })}
          </div>
          {agenda.map((a) => (
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
      )}

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
          Cancelar
        </button>
      </div>
    </form>
  );
}
