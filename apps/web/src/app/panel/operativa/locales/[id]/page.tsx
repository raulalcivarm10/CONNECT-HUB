'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { ImagenNas } from '@/components/ui/imagen-nas';
import { useDialogo } from '@/lib/dialogo';
import type { ConfiguracionRow, SalonRow, SubsalonRow } from '@/lib/types';

export default function LocalDetallePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const idLocal = Number(params.id);
  const nombreLocal = search.get('nombre') ?? `Local ${idLocal}`;
  const dialogo = useDialogo();

  const [salones, setSalones] = useState<SalonRow[]>([]);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editar, setEditar] = useState<SalonRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setSalones(await api.get<SalonRow[]>(`/locales/${idLocal}/salones`));
  }, [idLocal]);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  async function eliminar(s: SalonRow) {
    const ok = await dialogo.confirmar({
      titulo: `¿Eliminar «${s.NOMBRE}»?`,
      mensaje: 'Esta acción no se puede deshacer.',
      tono: 'danger',
      confirmar: 'Eliminar',
    });
    if (!ok) return;
    setError(null);
    try {
      await api.del(`/salones/${s.ID_SALON}`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  return (
    <div>
      <div className="mb-1 text-sm text-text-muted">
        <Link href="/panel/operativa/locales" className="hover:text-brand">
          Locales
        </Link>{' '}
        / {nombreLocal}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-text">
          Salones de {nombreLocal}
        </h1>
        <button
          onClick={() => {
            setEditar(null);
            setShowForm((v) => !v);
          }}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          {showForm && !editar ? 'Cerrar' : '+ Nuevo salón'}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {(showForm || editar) && (
        <SalonForm
          idLocal={idLocal}
          salon={editar}
          onDone={() => {
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

      <div className="mt-5 space-y-3">
        {salones.map((s) => (
          <div
            key={s.ID_SALON}
            className="rounded-2xl border border-border-app bg-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <ImagenNas
                  tipoEntidad="SALON"
                  id={s.ID_SALON}
                  tipoArchivo="CROQUIS"
                  uploadPath={`/salones/${s.ID_SALON}/imagen`}
                  deletePath={`/salones/${s.ID_SALON}/imagen`}
                  etiqueta="Imagen"
                  className="h-14 w-20"
                />
                <div>
                  <div className="font-semibold text-text">
                    {s.NOMBRE}
                    {s.ES_SUBDIVISIBLE === 'S' && (
                      <span className="ml-2 rounded bg-brand/15 px-1.5 py-0.5 text-xs font-semibold text-brand">
                        SUBDIVISIBLE
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-text-2">
                    Capacidad: {s.CAPACIDAD_MAX ?? 's/d'} · Subsalones:{' '}
                    {s.TOTAL_SUBSALONES} · Configuraciones:{' '}
                    {s.TOTAL_CONFIGURACIONES}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setAbierto(abierto === s.ID_SALON ? null : s.ID_SALON)
                  }
                  className="rounded-lg bg-brand/10 px-3 py-1 text-xs font-semibold text-brand hover:bg-brand/20"
                >
                  {abierto === s.ID_SALON ? 'Cerrar' : 'Gestionar'}
                </button>
                <button
                  onClick={() => {
                    setEditar(s);
                    setShowForm(false);
                  }}
                  className="rounded-lg border border-border-app px-3 py-1 text-xs text-text-2 hover:bg-surface-2"
                >
                  Editar
                </button>
                <button
                  onClick={() => eliminar(s)}
                  className="rounded-lg border border-border-app px-3 py-1 text-xs text-danger hover:bg-surface-2"
                >
                  Eliminar
                </button>
              </div>
            </div>
            {abierto === s.ID_SALON && <SalonPanel salon={s} />}
          </div>
        ))}
        {salones.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border-app bg-surface p-10 text-center text-text-muted">
            Este local aún no tiene salones
          </div>
        )}
      </div>
    </div>
  );
}

function SalonForm({
  idLocal,
  salon,
  onDone,
  onCancel,
}: {
  idLocal: number;
  salon: SalonRow | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(salon?.NOMBRE ?? '');
  const [capacidad, setCapacidad] = useState(
    salon?.CAPACIDAD_MAX ? String(salon.CAPACIDAD_MAX) : '',
  );
  const [subdivisible, setSubdivisible] = useState(
    salon?.ES_SUBDIVISIBLE === 'S',
  );
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    const data = {
      nombre: nombre.trim(),
      esSubdivisible: subdivisible,
      ...(capacidad ? { capacidadMax: Number(capacidad) } : {}),
    };
    try {
      if (salon) await api.patch(`/salones/${salon.ID_SALON}`, data);
      else await api.post('/salones', { ...data, idLocal });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border-app bg-surface p-4"
    >
      <div className="min-w-48 flex-1">
        <label className="mb-1 block text-sm font-medium text-text-2">
          Nombre del salón
        </label>
        <input
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-text-2">
          Capacidad máx.
        </label>
        <input
          type="number"
          min={1}
          value={capacidad}
          onChange={(e) => setCapacidad(e.target.value)}
          className="w-32 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand"
        />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm text-text-2">
        <input
          type="checkbox"
          checked={subdivisible}
          onChange={(e) => setSubdivisible(e.target.checked)}
        />
        Subdivisible
      </label>
      <button
        type="submit"
        disabled={sending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {salon ? 'Guardar' : 'Crear salón'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg border border-border-app px-3 py-2 text-sm text-text-2 hover:bg-surface-2"
      >
        Cancelar
      </button>
      {error && (
        <p className="w-full rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function SalonPanel({ salon }: { salon: SalonRow }) {
  const [tab, setTab] = useState<'subsalones' | 'configuraciones'>('subsalones');
  return (
    <div className="border-t border-border-app p-4">
      <div className="mb-3 flex gap-2">
        {(['subsalones', 'configuraciones'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 text-sm capitalize transition ${
              tab === t
                ? 'bg-brand/15 font-semibold text-brand'
                : 'text-text-2 hover:bg-surface-2'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'subsalones' ? (
        <SubsalonesPanel idSalon={salon.ID_SALON} />
      ) : (
        <ConfiguracionesPanel idSalon={salon.ID_SALON} />
      )}
    </div>
  );
}

function SubsalonesPanel({ idSalon }: { idSalon: number }) {
  const dialogo = useDialogo();
  const [items, setItems] = useState<SubsalonRow[]>([]);
  const [nombre, setNombre] = useState('');
  const [capacidad, setCapacidad] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const cargar = useCallback(async () => {
    setItems(await api.get<SubsalonRow[]>(`/salones/${idSalon}/subsalones`));
  }, [idSalon]);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      await api.post('/subsalones', {
        idSalon,
        nombre: nombre.trim(),
        ...(capacidad ? { capacidadMax: Number(capacidad) } : {}),
      });
      setNombre('');
      setCapacidad('');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSending(false);
    }
  }

  async function eliminar(id: number, nombre: string) {
    const ok = await dialogo.confirmar({
      titulo: `¿Eliminar «${nombre}»?`,
      mensaje: 'Esta acción no se puede deshacer.',
      tono: 'danger',
      confirmar: 'Eliminar',
    });
    if (!ok) return;
    setError(null);
    try {
      await api.del(`/subsalones/${id}`);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <div>
      <form onSubmit={crear} className="mb-3 flex flex-wrap items-end gap-2">
        <input
          required
          placeholder="Nombre del subsalón"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="min-w-48 flex-1 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-brand"
        />
        <input
          type="number"
          min={1}
          placeholder="Capacidad"
          value={capacidad}
          onChange={(e) => setCapacidad(e.target.value)}
          className="w-28 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-brand"
        />
        <button
          disabled={sending}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {sending ? 'Agregando…' : '+ Agregar'}
        </button>
      </form>
      {error && (
        <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((ss) => (
          <SubsalonItem
            key={ss.ID_SUBSALON}
            subsalon={ss}
            onEliminar={() => eliminar(ss.ID_SUBSALON, ss.NOMBRE)}
            onGuardado={() => void cargar()}
            onError={setError}
          />
        ))}
        {items.length === 0 && (
          <p className="text-sm text-text-muted">Sin subsalones</p>
        )}
      </div>
    </div>
  );
}

function SubsalonItem({
  subsalon,
  onEliminar,
  onGuardado,
  onError,
}: {
  subsalon: SubsalonRow;
  onEliminar: () => void;
  onGuardado: () => void;
  onError: (msg: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(subsalon.NOMBRE);
  const [capacidad, setCapacidad] = useState(
    subsalon.CAPACIDAD_MAX ? String(subsalon.CAPACIDAD_MAX) : '',
  );
  const [sending, setSending] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      await api.patch(`/subsalones/${subsalon.ID_SUBSALON}`, {
        nombre: nombre.trim(),
        ...(capacidad ? { capacidadMax: Number(capacidad) } : {}),
      });
      setEditando(false);
      onGuardado();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSending(false);
    }
  }

  if (editando) {
    return (
      <form
        onSubmit={guardar}
        className="flex items-center gap-2 rounded-lg border border-brand/50 bg-surface-2 px-2 py-1.5 text-sm"
      >
        <input
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="min-w-0 flex-1 rounded border border-border-app bg-surface px-2 py-1 text-sm text-text outline-none focus:border-brand"
        />
        <input
          type="number"
          min={1}
          placeholder="cap."
          value={capacidad}
          onChange={(e) => setCapacidad(e.target.value)}
          className="w-16 rounded border border-border-app bg-surface px-2 py-1 text-sm text-text outline-none focus:border-brand"
        />
        <button
          disabled={sending}
          className="text-xs font-semibold text-brand hover:underline disabled:opacity-50"
        >
          {sending ? '…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={() => setEditando(false)}
          className="text-xs text-text-muted hover:underline"
        >
          ✕
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <ImagenNas
          tipoEntidad="SUBSALON"
          id={subsalon.ID_SUBSALON}
          tipoArchivo="CROQUIS"
          uploadPath={`/subsalones/${subsalon.ID_SUBSALON}/imagen`}
          deletePath={`/subsalones/${subsalon.ID_SUBSALON}/imagen`}
          etiqueta="Img"
          className="h-9 w-12"
        />
        <span className="truncate text-text">
          {subsalon.NOMBRE}
          <span className="ml-2 text-xs text-text-muted">
            cap. {subsalon.CAPACIDAD_MAX ?? 's/d'}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 gap-2">
        <button
          onClick={() => setEditando(true)}
          className="text-xs text-brand hover:underline"
        >
          Editar
        </button>
        <button onClick={onEliminar} className="text-xs text-danger hover:underline">
          Eliminar
        </button>
      </span>
    </div>
  );
}

function ConfiguracionesPanel({ idSalon }: { idSalon: number }) {
  const dialogo = useDialogo();
  const [items, setItems] = useState<ConfiguracionRow[]>([]);
  const [subsalones, setSubsalones] = useState<SubsalonRow[]>([]);
  const [nombre, setNombre] = useState('');
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [editando, setEditando] = useState<ConfiguracionRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const cargar = useCallback(async () => {
    const [conf, subs] = await Promise.all([
      api.get<ConfiguracionRow[]>(`/salones/${idSalon}/configuraciones`),
      api.get<SubsalonRow[]>(`/salones/${idSalon}/subsalones`),
    ]);
    setItems(conf);
    setSubsalones(subs);
  }, [idSalon]);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  function toggle(id: number) {
    setSeleccion((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function empezarEdicion(c: ConfiguracionRow) {
    setEditando(c);
    setNombre(c.NOMBRE ?? '');
    setSeleccion(
      (c.SUBSALONES_IDS ?? '')
        .split(',')
        .filter(Boolean)
        .map((x) => Number(x)),
    );
  }

  function cancelarEdicion() {
    setEditando(null);
    setNombre('');
    setSeleccion([]);
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      if (editando) {
        await api.patch(`/configuraciones/${editando.ID_CONFIGURACION}`, {
          nombre: nombre.trim(),
          subsalones: seleccion,
        });
      } else {
        await api.post('/configuraciones', {
          idSalon,
          nombre: nombre.trim(),
          subsalones: seleccion,
        });
      }
      cancelarEdicion();
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSending(false);
    }
  }

  async function toggleActivo(c: ConfiguracionRow) {
    setError(null);
    try {
      await api.patch(`/configuraciones/${c.ID_CONFIGURACION}`, {
        activo: c.ACTIVO !== 'Y',
      });
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  async function eliminar(id: number, nombre: string) {
    const ok = await dialogo.confirmar({
      titulo: `¿Eliminar «${nombre}»?`,
      mensaje: 'Esta acción no se puede deshacer.',
      tono: 'danger',
      confirmar: 'Eliminar',
    });
    if (!ok) return;
    setError(null);
    try {
      await api.del(`/configuraciones/${id}`);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <div>
      <form
        onSubmit={crear}
        className="mb-3 rounded-lg border border-border-app bg-surface-2 p-3"
      >
        {editando && (
          <div className="mb-2 text-xs font-semibold text-brand">
            Editando «{editando.NOMBRE}»
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <input
            required
            placeholder="Nombre de la configuración (p. ej. Salón A+B)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="min-w-56 flex-1 rounded-lg border border-border-app bg-surface px-3 py-2 text-sm text-text outline-none focus:border-brand"
          />
          <button
            disabled={seleccion.length === 0 || sending}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {sending
              ? 'Guardando…'
              : editando
                ? 'Guardar cambios'
                : '+ Crear configuración'}
          </button>
          {editando && (
            <button
              type="button"
              onClick={cancelarEdicion}
              className="rounded-lg border border-border-app px-3 py-2 text-sm text-text-2 hover:bg-surface"
            >
              Cancelar
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {subsalones.map((ss) => (
            <button
              key={ss.ID_SUBSALON}
              type="button"
              onClick={() => toggle(ss.ID_SUBSALON)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                seleccion.includes(ss.ID_SUBSALON)
                  ? 'border-brand bg-brand/15 font-semibold text-brand'
                  : 'border-border-app text-text-2 hover:bg-surface'
              }`}
            >
              {ss.NOMBRE}
            </button>
          ))}
          {subsalones.length === 0 && (
            <span className="text-xs text-text-muted">
              Crea subsalones primero para combinarlos
            </span>
          )}
        </div>
      </form>
      {error && (
        <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="space-y-2">
        {items.map((c) => (
          <div
            key={c.ID_CONFIGURACION}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-sm"
          >
            <div className="flex min-w-0 items-center gap-2">
              <ImagenNas
                tipoEntidad="CONFIGURACION"
                id={c.ID_CONFIGURACION}
                tipoArchivo="CROQUIS"
                uploadPath={`/configuraciones/${c.ID_CONFIGURACION}/imagen`}
                deletePath={`/configuraciones/${c.ID_CONFIGURACION}/imagen`}
                etiqueta="Img"
                className="h-9 w-12"
              />
              <span className="min-w-0">
                <span className="font-medium text-text">{c.NOMBRE}</span>
                <span className="ml-2 text-xs text-text-muted">
                  {c.SUBSALONES_NOMBRES ?? 'sin subsalones'}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleActivo(c)}
                className={`text-xs font-semibold ${c.ACTIVO === 'Y' ? 'text-success' : 'text-text-muted'}`}
              >
                {c.ACTIVO === 'Y' ? '● Activa' : '○ Inactiva'}
              </button>
              <button
                onClick={() => empezarEdicion(c)}
                className="text-xs text-brand hover:underline"
              >
                Editar
              </button>
              <button
                onClick={() =>
                  eliminar(c.ID_CONFIGURACION, c.NOMBRE ?? 'esta configuración')
                }
                className="text-xs text-danger hover:underline"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-text-muted">Sin configuraciones</p>
        )}
      </div>
    </div>
  );
}
