'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { ImagenNas } from '@/components/ui/imagen-nas';
import { useDialogo } from '@/lib/dialogo';
import { useI18n } from '@/lib/i18n';
import { propsValidacion } from '@/lib/validacion';
import type { ConfiguracionRow, SalonRow, SubsalonRow } from '@/lib/types';

export default function LocalDetallePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const idLocal = Number(params.id);
  const dialogo = useDialogo();
  const { t } = useI18n();
  const nombreLocal = search.get('nombre') ?? t('ld.venueN', { id: idLocal });

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
      titulo: t('dlg.deleteTitle', { name: s.NOMBRE }),
      mensaje: t('dlg.deleteMsg'),
      tono: 'danger',
      confirmar: t('c.delete'),
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
          {t('loc.title')}
        </Link>{' '}
        / {nombreLocal}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-text">
          {t('sal.title', { name: nombreLocal })}
        </h1>
        <button
          onClick={() => {
            setEditar(null);
            setShowForm((v) => !v);
          }}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          {showForm && !editar ? t('c.close') : t('sal.new')}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {(showForm || editar) && (
        <SalonForm
          key={editar ? `salon-${editar.ID_SALON}` : 'nuevo'}
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
                  etiqueta={t('sal.img')}
                  className="h-14 w-20"
                />
                <div>
                  <div className="font-semibold text-text">
                    {s.NOMBRE}
                    {s.ES_SUBDIVISIBLE === 'S' && (
                      <span className="ml-2 rounded bg-brand/15 px-1.5 py-0.5 text-xs font-semibold text-brand">
                        {t('sal.subdividable')}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-text-2">
                    {t('sal.stats', {
                      cap: s.CAPACIDAD_MAX ?? t('c.na'),
                      subs: s.TOTAL_SUBSALONES,
                      confs: s.TOTAL_CONFIGURACIONES,
                    })}
                    {s.PRECIO != null && (
                      <span className="ml-2 rounded bg-success/15 px-1.5 py-0.5 text-xs font-semibold text-success">
                        ${Number(s.PRECIO).toFixed(2)} / {t('sal.perDay')}
                      </span>
                    )}
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
                  {abierto === s.ID_SALON ? t('c.close') : t('sal.manage')}
                </button>
                <button
                  onClick={() => {
                    setEditar(s);
                    setShowForm(false);
                  }}
                  className="rounded-lg border border-border-app px-3 py-1 text-xs text-text-2 hover:bg-surface-2"
                >
                  {t('c.edit')}
                </button>
                <button
                  onClick={() => eliminar(s)}
                  className="rounded-lg border border-border-app px-3 py-1 text-xs text-danger hover:bg-surface-2"
                >
                  {t('c.delete')}
                </button>
              </div>
            </div>
            {abierto === s.ID_SALON && <SalonPanel salon={s} />}
          </div>
        ))}
        {salones.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border-app bg-surface p-10 text-center text-text-muted">
            {t('sal.empty')}
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
  const { t } = useI18n();
  const [nombre, setNombre] = useState(salon?.NOMBRE ?? '');
  const [capacidad, setCapacidad] = useState(
    salon?.CAPACIDAD_MAX ? String(salon.CAPACIDAD_MAX) : '',
  );
  const [precio, setPrecio] = useState(
    salon?.PRECIO != null ? String(salon.PRECIO) : '',
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
      ...(precio !== '' ? { precio: Number(precio) } : {}),
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
          {t('sal.name')}
        </label>
        <input
          required
          {...propsValidacion(t('common.requiredField'))}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-text-2">
          {t('sal.maxCap')}
        </label>
        <input
          type="number"
          min={1}
          value={capacidad}
          onChange={(e) => setCapacidad(e.target.value)}
          className="w-32 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-text-2">
          {t('sal.price')}
        </label>
        <input
          type="number"
          min={0}
          step={0.01}
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          placeholder="0.00"
          className="w-32 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand"
        />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm text-text-2">
        <input
          type="checkbox"
          checked={subdivisible}
          onChange={(e) => setSubdivisible(e.target.checked)}
        />
        {t('sal.subdivCheck')}
      </label>
      <button
        type="submit"
        disabled={sending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {salon ? t('c.save') : t('sal.create')}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg border border-border-app px-3 py-2 text-sm text-text-2 hover:bg-surface-2"
      >
        {t('c.cancel')}
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
  const { t } = useI18n();
  const [tab, setTab] = useState<'subsalones' | 'configuraciones'>('subsalones');
  return (
    <div className="border-t border-border-app p-4">
      <div className="mb-3 flex gap-2">
        {(['subsalones', 'configuraciones'] as const).map((tk) => (
          <button
            key={tk}
            onClick={() => setTab(tk)}
            className={`rounded-full px-3 py-1 text-sm transition ${
              tab === tk
                ? 'bg-brand/15 font-semibold text-brand'
                : 'text-text-2 hover:bg-surface-2'
            }`}
          >
            {tk === 'subsalones' ? t('sal.tabSubs') : t('sal.tabConfigs')}
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
  const { t } = useI18n();
  const [items, setItems] = useState<SubsalonRow[]>([]);
  const [nombre, setNombre] = useState('');
  const [capacidad, setCapacidad] = useState('');
  const [precio, setPrecio] = useState('');
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
        ...(precio !== '' ? { precio: Number(precio) } : {}),
      });
      setNombre('');
      setCapacidad('');
      setPrecio('');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSending(false);
    }
  }

  async function eliminar(id: number, nombre: string) {
    const ok = await dialogo.confirmar({
      titulo: t('dlg.deleteTitle', { name: nombre }),
      mensaje: t('dlg.deleteMsg'),
      tono: 'danger',
      confirmar: t('c.delete'),
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
          {...propsValidacion(t('common.requiredField'))}
          placeholder={t('sal.subName')}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="min-w-48 flex-1 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-brand"
        />
        <input
          type="number"
          min={1}
          placeholder={t('sal.capacity')}
          value={capacidad}
          onChange={(e) => setCapacidad(e.target.value)}
          className="w-28 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-brand"
        />
        <input
          type="number"
          min={0}
          step={0.01}
          placeholder={t('sal.price')}
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          className="w-28 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-brand"
        />
        <button
          disabled={sending}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {sending ? t('sal.adding') : t('sal.add')}
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
          <p className="text-sm text-text-muted">{t('sal.noSubs')}</p>
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
  const { t } = useI18n();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(subsalon.NOMBRE);
  const [capacidad, setCapacidad] = useState(
    subsalon.CAPACIDAD_MAX ? String(subsalon.CAPACIDAD_MAX) : '',
  );
  const [precio, setPrecio] = useState(
    subsalon.PRECIO != null ? String(subsalon.PRECIO) : '',
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
        ...(precio !== '' ? { precio: Number(precio) } : {}),
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
          {...propsValidacion(t('common.requiredField'))}
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
        <input
          type="number"
          min={0}
          step={0.01}
          placeholder="$"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          className="w-20 rounded border border-border-app bg-surface px-2 py-1 text-sm text-text outline-none focus:border-brand"
        />
        <button
          disabled={sending}
          className="text-xs font-semibold text-brand hover:underline disabled:opacity-50"
        >
          {sending ? '…' : t('c.save')}
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
            cap. {subsalon.CAPACIDAD_MAX ?? t('c.na')}
          </span>
          {subsalon.PRECIO != null && (
            <span className="ml-2 text-xs font-semibold text-success">
              ${Number(subsalon.PRECIO).toFixed(2)}
            </span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 gap-2">
        <button
          onClick={() => setEditando(true)}
          className="text-xs text-brand hover:underline"
        >
          {t('c.edit')}
        </button>
        <button onClick={onEliminar} className="text-xs text-danger hover:underline">
          {t('c.delete')}
        </button>
      </span>
    </div>
  );
}

function ConfiguracionesPanel({ idSalon }: { idSalon: number }) {
  const dialogo = useDialogo();
  const { t } = useI18n();
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
      titulo: t('dlg.deleteTitle', { name: nombre }),
      mensaje: t('dlg.deleteMsg'),
      tono: 'danger',
      confirmar: t('c.delete'),
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
            {t('sal.editing', { name: editando.NOMBRE ?? '' })}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <input
            required
            {...propsValidacion(t('common.requiredField'))}
            placeholder={t('sal.cfgName')}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="min-w-56 flex-1 rounded-lg border border-border-app bg-surface px-3 py-2 text-sm text-text outline-none focus:border-brand"
          />
          <button
            disabled={seleccion.length === 0 || sending}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {sending
              ? t('c.saving')
              : editando
                ? t('sal.cfgSave')
                : t('sal.cfgCreate')}
          </button>
          {editando && (
            <button
              type="button"
              onClick={cancelarEdicion}
              className="rounded-lg border border-border-app px-3 py-2 text-sm text-text-2 hover:bg-surface"
            >
              {t('c.cancel')}
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
              {t('sal.cfgFirst')}
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
                  {c.SUBSALONES_NOMBRES ?? t('sal.cfgNoSubs')}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleActivo(c)}
                className={`text-xs font-semibold ${c.ACTIVO === 'Y' ? 'text-success' : 'text-text-muted'}`}
              >
                {c.ACTIVO === 'Y' ? t('sal.active') : t('sal.inactive')}
              </button>
              <button
                onClick={() => empezarEdicion(c)}
                className="text-xs text-brand hover:underline"
              >
                {t('c.edit')}
              </button>
              <button
                onClick={() =>
                  eliminar(c.ID_CONFIGURACION, c.NOMBRE ?? t('sal.thisCfg'))
                }
                className="text-xs text-danger hover:underline"
              >
                {t('c.delete')}
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-text-muted">{t('ld.noLayouts')}</p>
        )}
      </div>
    </div>
  );
}
