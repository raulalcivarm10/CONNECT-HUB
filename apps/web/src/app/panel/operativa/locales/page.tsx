'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { useI18n } from '@/lib/i18n';
import { propsValidacion } from '@/lib/validacion';
import { useDialogo } from '@/lib/dialogo';
import { useInstitucionFiltro } from '@/lib/institucion-context';
import { ImagenNas } from '@/components/ui/imagen-nas';
import type { InstitucionRow, LocalRow } from '@/lib/types';

export default function LocalesPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const dialogo = useDialogo();
  const { qs, instituciones, nombreFiltro } = useInstitucionFiltro();
  const [locales, setLocales] = useState<LocalRow[]>([]);
  const [editar, setEditar] = useState<LocalRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLocales(await api.get<LocalRow[]>(`/locales${qs}`));
  }, [qs]);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  async function eliminar(l: LocalRow) {
    const ok = await dialogo.confirmar({
      titulo: t('dlg.deleteTitle', { name: l.NOMBRE }),
      mensaje: t('dlg.deleteMsg'),
      tono: 'danger',
      confirmar: t('c.delete'),
    });
    if (!ok) return;
    setError(null);
    try {
      await api.del(`/locales/${l.ID_LOCAL}`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('loc.title')}</h1>
          <p className="text-sm text-text-2">
            {nombreFiltro
              ? t('us.filtering', { name: nombreFiltro })
              : t('loc.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditar(null);
              setShowForm((v) => !v);
            }}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            {showForm && !editar ? t('c.close') : t('loc.new')}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {(showForm || editar) && (
        <LocalForm
          key={editar ? `local-${editar.ID_LOCAL}` : 'nuevo'}
          local={editar}
          instituciones={instituciones}
          esSuper={!!user?.esSuper}
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

      <div className="mt-5 overflow-x-auto rounded-2xl border border-border-app bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-app text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-4 py-3">{t('loc.plan')}</th>
              <th className="px-4 py-3">{t('loc.venue')}</th>
              <th className="px-4 py-3">{t('loc.location')}</th>
              {user?.esSuper && (
                <th className="px-4 py-3">{t('in.institution')}</th>
              )}
              <th className="px-4 py-3">{t('loc.halls')}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {locales.map((l) => (
              <tr key={l.ID_LOCAL} className="border-b border-border-app/60">
                <td className="px-4 py-3">
                  <ImagenNas
                    tipoEntidad="LOCAL"
                    id={l.ID_LOCAL}
                    tipoArchivo="CROQUIS"
                    uploadPath={`/locales/${l.ID_LOCAL}/plano`}
                    deletePath={`/locales/${l.ID_LOCAL}/plano`}
                    etiqueta={t('loc.plan')}
                  />
                </td>
                <td className="px-4 py-3 font-medium text-text">{l.NOMBRE}</td>
                <td className="px-4 py-3 text-text-2">{l.UBICACION ?? '—'}</td>
                {user?.esSuper && (
                  <td className="px-4 py-3 text-text-2">{l.INSTITUCION}</td>
                )}
                <td className="px-4 py-3 text-text-2">{l.TOTAL_SALONES}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/panel/operativa/locales/${l.ID_LOCAL}?nombre=${encodeURIComponent(l.NOMBRE)}`}
                      className="rounded-lg bg-brand/10 px-3 py-1 text-xs font-semibold text-brand hover:bg-brand/20"
                    >
                      {t('loc.hallsBtn')}
                    </Link>
                    <button
                      onClick={() => {
                        setEditar(l);
                        setShowForm(false);
                      }}
                      className="rounded-lg border border-border-app px-3 py-1 text-xs text-text-2 hover:bg-surface-2"
                    >
                      {t('c.edit')}
                    </button>
                    <button
                      onClick={() => eliminar(l)}
                      className="rounded-lg border border-border-app px-3 py-1 text-xs text-danger hover:bg-surface-2"
                    >
                      {t('c.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {locales.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                  {t('loc.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LocalForm({
  local,
  instituciones,
  esSuper,
  onDone,
  onCancel,
}: {
  local: LocalRow | null;
  instituciones: InstitucionRow[];
  esSuper: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [nombre, setNombre] = useState(local?.NOMBRE ?? '');
  const [ubicacion, setUbicacion] = useState(local?.UBICACION ?? '');
  const [descripcion, setDescripcion] = useState(local?.DESCRIPCION ?? '');
  const [idInstitucion, setIdInstitucion] = useState(
    local ? String(local.ID_INSTITUCION) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      if (local) {
        await api.patch(`/locales/${local.ID_LOCAL}`, {
          nombre: nombre.trim(),
          ubicacion: ubicacion.trim() || undefined,
          descripcion: descripcion.trim() || undefined,
        });
      } else {
        await api.post('/locales', {
          nombre: nombre.trim(),
          ubicacion: ubicacion.trim() || undefined,
          descripcion: descripcion.trim() || undefined,
          ...(esSuper && idInstitucion
            ? { idInstitucion: Number(idInstitucion) }
            : {}),
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-5 grid gap-4 rounded-2xl border border-border-app bg-surface p-5 sm:grid-cols-2"
    >
      <div className="sm:col-span-2 font-semibold text-text">
        {local ? t('loc.editing', { name: local.NOMBRE }) : t('loc.newTitle')}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-text-2">
          {t('c.name')}
        </label>
        <input
          required
          {...propsValidacion(t('common.requiredField'))}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand"
        />
      </div>
      {esSuper && !local && (
        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('in.institution')}
          </label>
          <select
            required
            {...propsValidacion(t('common.requiredField'))}
            value={idInstitucion}
            onChange={(e) => setIdInstitucion(e.target.value)}
            className="w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text"
          >
            <option value="">{t('c.select')}</option>
            {instituciones
              .filter((i) => i.ESTADO === 'APROBADA')
              .map((i) => (
                <option key={i.ID_INSTITUCION} value={i.ID_INSTITUCION}>
                  {i.NOMBRE}
                </option>
              ))}
          </select>
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-text-2">
          {t('loc.location')}
        </label>
        <input
          value={ubicacion}
          onChange={(e) => setUbicacion(e.target.value)}
          className="w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-text-2">
          {t('loc.description')}
        </label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand"
        />
      </div>
      {error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={sending}
          className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {sending ? t('c.saving') : t('c.save')}
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
