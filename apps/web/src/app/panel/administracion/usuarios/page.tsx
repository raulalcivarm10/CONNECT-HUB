'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { useInstitucionFiltro } from '@/lib/institucion-context';
import { useI18n } from '@/lib/i18n';
import { useDialogo } from '@/lib/dialogo';
import type { InstitucionRow, RolRow, UsuarioRow } from '@/lib/types';
import { ROL } from '@/lib/types';

export default function UsuariosPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const dialogo = useDialogo();
  const { qs, instituciones, nombreFiltro } = useInstitucionFiltro();
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [roles, setRoles] = useState<RolRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editar, setEditar] = useState<UsuarioRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const puedeCrear = user?.esSuper || user?.roles.includes(ROL.SYSTEM);

  const cargar = useCallback(async () => {
    setUsuarios(await api.get<UsuarioRow[]>(`/usuarios${qs}`));
  }, [qs]);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
    api.get<RolRow[]>('/roles').then(setRoles).catch(() => undefined);
  }, [cargar]);

  async function toggleEstado(u: UsuarioRow) {
    setError(null);
    try {
      await api.patch(`/usuarios/${encodeURIComponent(u.COD_USUARIO)}/estado`, {
        estado: u.ESTADOS === 'A' ? 'I' : 'A',
      });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  async function eliminar(u: UsuarioRow) {
    const ok = await dialogo.confirmar({
      titulo: t('dlg.deleteTitle', { name: u.COD_USUARIO }),
      mensaje: t('us.deleteHint'),
      tono: 'danger',
      confirmar: t('c.delete'),
    });
    if (!ok) return;
    setError(null);
    setOk(null);
    try {
      await api.del(`/usuarios/${encodeURIComponent(u.COD_USUARIO)}`);
      setOk(t('us.deleted', { user: u.COD_USUARIO }));
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('us.title')}</h1>
          <p className="text-sm text-text-2">
            {nombreFiltro
              ? t('us.filtering', { name: nombreFiltro })
              : t('us.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {puedeCrear && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {showForm ? t('c.close') : t('us.new')}
            </button>
          )}
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

      {showForm && (
        <NuevoUsuarioForm
          roles={roles}
          instituciones={instituciones}
          esSuper={!!user?.esSuper}
          onDone={(msg) => {
            setOk(msg);
            setShowForm(false);
            void cargar();
          }}
        />
      )}

      {editar && (
        <EditarUsuarioForm
          key={editar.COD_USUARIO}
          usuario={editar}
          onDone={(msg) => {
            setOk(msg);
            setEditar(null);
            void cargar();
          }}
          onCancel={() => setEditar(null)}
        />
      )}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-border-app bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-app text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-4 py-3">{t('us.userCol')}</th>
              <th className="px-4 py-3">{t('c.name')}</th>
              <th className="px-4 py-3">{t('us.rolesCol')}</th>
              {user?.esSuper && <th className="px-4 py-3">{t('us.institution')}</th>}
              <th className="px-4 py-3">{t('c.state')}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.COD_USUARIO} className="border-b border-border-app/60">
                <td className="px-4 py-3 font-medium text-text">
                  {u.COD_USUARIO}
                  {u.ES_SUPER === 'S' && (
                    <span className="ml-2 rounded bg-brand/15 px-1.5 py-0.5 text-xs font-semibold text-brand">
                      SUPER
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-text-2">
                  {[u.NOMBRES, u.APELLIDOS].filter(Boolean).join(' ') ||
                    u.NOMBRE_USUARIO}
                </td>
                <td className="px-4 py-3 text-text-2">{u.ROLES ?? '—'}</td>
                {user?.esSuper && (
                  <td className="px-4 py-3 text-text-2">
                    {u.INSTITUCION ?? '—'}
                  </td>
                )}
                <td className="px-4 py-3">
                  <span
                    className={
                      u.ESTADOS === 'A' ? 'text-success' : 'text-danger'
                    }
                  >
                    {u.ESTADOS === 'A' ? `● ${t('c.active')}` : `● ${t('c.inactive')}`}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {puedeCrear && u.ES_SUPER !== 'S' && (
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditar(u);
                          setShowForm(false);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="rounded-lg border border-border-app px-3 py-1 text-xs text-text-2 hover:bg-surface-2"
                      >
                        {t('c.edit')}
                      </button>
                      <button
                        onClick={() => toggleEstado(u)}
                        className="rounded-lg border border-border-app px-3 py-1 text-xs text-text-2 hover:bg-surface-2"
                      >
                        {u.ESTADOS === 'A' ? t('us.deactivate') : t('us.activate')}
                      </button>
                      <button
                        onClick={() => eliminar(u)}
                        className="rounded-lg border border-border-app px-3 py-1 text-xs text-danger hover:bg-surface-2"
                      >
                        {t('c.delete')}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-text-muted"
                >
                  {t('us.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditarUsuarioForm({
  usuario,
  onDone,
  onCancel,
}: {
  usuario: UsuarioRow;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [nombres, setNombres] = useState(usuario.NOMBRES ?? '');
  const [apellidos, setApellidos] = useState(usuario.APELLIDOS ?? '');
  const [email, setEmail] = useState(usuario.EMAIL ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      await api.patch(`/usuarios/${encodeURIComponent(usuario.COD_USUARIO)}`, {
        nombres: nombres.trim() || undefined,
        apellidos: apellidos.trim() || undefined,
        email: email.trim() || undefined,
        ...(password ? { password } : {}),
      });
      onDone(
        password
          ? t('us.updatedPwd', { user: usuario.COD_USUARIO })
          : t('us.updated', { user: usuario.COD_USUARIO }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
      setSending(false);
    }
  }

  const inputCls =
    'w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand';

  return (
    <form
      onSubmit={onSubmit}
      className="mt-5 grid gap-4 rounded-2xl border border-border-app bg-surface p-5 sm:grid-cols-2"
    >
      <div className="font-semibold text-text sm:col-span-2">
        {t('us.editTitle', { user: usuario.COD_USUARIO })}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-text-2">
          {t('us.names')}
        </label>
        <input
          required
          value={nombres}
          onChange={(e) => setNombres(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-text-2">
          {t('us.lastNames')}
        </label>
        <input
          required
          value={apellidos}
          onChange={(e) => setApellidos(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-text-2">
          {t('us.contactEmail')}
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-text-2">
          {t('us.newPassword')}
        </label>
        <input
          type="password"
          minLength={8}
          autoComplete="new-password"
          placeholder={t('us.newPasswordPh')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
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
          {sending ? t('c.saving') : t('ld.saveChanges')}
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

function NuevoUsuarioForm({
  roles,
  instituciones,
  esSuper,
  onDone,
}: {
  roles: RolRow[];
  instituciones: InstitucionRow[];
  esSuper: boolean;
  onDone: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [usuario, setUsuario] = useState('');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [password, setPassword] = useState('');
  const [rolesSel, setRolesSel] = useState<string[]>([]);
  const [idInstitucion, setIdInstitucion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // el rol SYSTEM solo lo asigna el superadmin (es el usuario genérico de la institución)
  const asignables = roles.filter((r) => esSuper || r.NOMBRE !== 'SYSTEM');

  function toggleRol(nombre: string) {
    setRolesSel((prev) =>
      prev.includes(nombre)
        ? prev.filter((r) => r !== nombre)
        : [...prev, nombre],
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      await api.post('/usuarios', {
        usuario: usuario.trim(),
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        password,
        roles: rolesSel,
        ...(esSuper && idInstitucion
          ? { idInstitucion: Number(idInstitucion) }
          : {}),
      });
      onDone(t('us.created', { user: usuario.trim().toUpperCase() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear');
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-5 grid gap-4 rounded-2xl border border-border-app bg-surface p-5 sm:grid-cols-2"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-text-2">
          {t('us.loginEmail')}
        </label>
        <input
          type="email"
          required
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          className="w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand"
        />
      </div>
      {esSuper && (
        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('us.institution')}
          </label>
          <select
            required
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
          {t('us.names')}
        </label>
        <input
          required
          value={nombres}
          onChange={(e) => setNombres(e.target.value)}
          className="w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-text-2">
          {t('us.lastNames')}
        </label>
        <input
          required
          value={apellidos}
          onChange={(e) => setApellidos(e.target.value)}
          className="w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-text-2">
          {t('us.passwordMin')}
        </label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand"
        />
      </div>
      <div className="sm:col-span-2">
        <div className="mb-1 text-sm font-medium text-text-2">
          {t('us.roles')}
        </div>
        <div className="flex flex-wrap gap-2">
          {asignables.map((r) => (
            <button
              key={r.ID_ROL}
              type="button"
              onClick={() => toggleRol(r.NOMBRE)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                rolesSel.includes(r.NOMBRE)
                  ? 'border-brand bg-brand/15 font-semibold text-brand'
                  : 'border-border-app text-text-2 hover:bg-surface-2'
              }`}
            >
              {r.NOMBRE}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-2">
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={sending || rolesSel.length === 0}
          className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {sending ? t('us.creating') : t('us.create')}
        </button>
        {rolesSel.length === 0 && (
          <span className="ml-3 text-sm text-text-muted">
            {t('us.selectRole')}
          </span>
        )}
      </div>
    </form>
  );
}
