'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { ImagenNas } from '@/components/ui/imagen-nas';
import { PerfilInstitucionForm } from '@/components/instituciones/perfil-form';
import type { InstitucionRow, PerfilInstitucion } from '@/lib/types';

const ESTADO_STYLE: Record<string, string> = {
  APROBADA: 'bg-success/10 text-success',
  PENDIENTE: 'bg-brand/10 text-brand',
  RECHAZADA: 'bg-danger/10 text-danger',
  SUSPENDIDA: 'bg-danger/10 text-danger',
};

export default function InstitucionesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<InstitucionRow[]>([]);
  const [aprobar, setAprobar] = useState<InstitucionRow | null>(null);
  const [editarPerfil, setEditarPerfil] = useState<PerfilInstitucion | null>(
    null,
  );
  const [credenciales, setCredenciales] = useState<{
    usuarioSistema: string;
    passwordTemporal: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setItems(await api.get<InstitucionRow[]>('/instituciones'));
  }, []);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  async function accion(id: number, tipo: 'rechazar' | 'suspender' | 'reactivar') {
    setError(null);
    try {
      await api.post(`/instituciones/${id}/${tipo}`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  async function abrirEdicion(id: number) {
    setError(null);
    try {
      setEditarPerfil(
        await api.get<PerfilInstitucion>(`/instituciones/${id}/perfil`),
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  async function eliminar(i: InstitucionRow) {
    if (
      !window.confirm(
        `¿Eliminar definitivamente la institución «${i.NOMBRE}»? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    setError(null);
    setOk(null);
    try {
      await api.del(`/instituciones/${i.ID_INSTITUCION}`);
      setOk(`Institución «${i.NOMBRE}» eliminada`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  if (!user?.esSuper) {
    return (
      <p className="text-text-muted">
        Solo el superadmin de la plataforma gestiona instituciones.
      </p>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-text">Instituciones</h1>
      <p className="text-sm text-text-2">
        La institución se registra y paga en la app de registro; aquí se
        aprueba y se genera su usuario del sistema.
      </p>

      {error && (
        <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {credenciales && (
        <div className="mt-4 rounded-2xl border border-success/40 bg-success/10 p-4">
          <div className="font-semibold text-success">
            Institución aprobada — credenciales del usuario del sistema
            (guárdalas, se muestran una sola vez):
          </div>
          <div className="mt-2 font-mono text-sm text-text">
            Usuario: {credenciales.usuarioSistema}
            <br />
            Contraseña temporal: {credenciales.passwordTemporal}
          </div>
          <button
            onClick={() => setCredenciales(null)}
            className="mt-3 rounded-lg border border-border-app px-3 py-1 text-xs text-text-2"
          >
            Entendido, ocultar
          </button>
        </div>
      )}

      {ok && (
        <p className="mt-4 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          {ok}
        </p>
      )}

      {editarPerfil && (
        <div className="mt-4">
          <div className="mb-2 font-semibold text-text">
            Editando perfil de «{editarPerfil.NOMBRE}»
          </div>
          <PerfilInstitucionForm
            perfil={editarPerfil}
            onSaved={(msg) => {
              setOk(msg);
              setEditarPerfil(null);
              void cargar();
            }}
            onCancel={() => setEditarPerfil(null)}
          />
        </div>
      )}

      {aprobar && (
        <AprobarForm
          institucion={aprobar}
          onClose={() => setAprobar(null)}
          onDone={(cred, idInstitucion) => {
            setCredenciales(cred);
            setAprobar(null);
            void cargar();
            // abre el perfil recién aprobado para completar credenciales de pasarela
            void abrirEdicion(idInstitucion);
          }}
        />
      )}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-border-app bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-app text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-4 py-3">Logo</th>
              <th className="px-4 py-3">Institución</th>
              <th className="px-4 py-3">Ciudad</th>
              <th className="px-4 py-3">Usuarios</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.ID_INSTITUCION} className="border-b border-border-app/60">
                <td className="px-4 py-3">
                  <ImagenNas
                    tipoEntidad="INSTITUCION"
                    id={i.ID_INSTITUCION}
                    tipoArchivo="LOGO"
                    uploadPath={`/instituciones/${i.ID_INSTITUCION}/logo`}
                    etiqueta="Logo"
                    className="h-10 w-10"
                  />
                </td>
                <td className="px-4 py-3 font-medium text-text">{i.NOMBRE}</td>
                <td className="px-4 py-3 text-text-2">
                  {[i.CIUDAD, i.PAIS].filter(Boolean).join(', ') || '—'}
                </td>
                <td className="px-4 py-3 text-text-2">{i.TOTAL_USUARIOS}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_STYLE[i.ESTADO] ?? ''}`}
                  >
                    {i.ESTADO}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => abrirEdicion(i.ID_INSTITUCION)}
                      className="rounded-lg border border-border-app px-3 py-1 text-xs text-text-2 hover:bg-surface-2"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => eliminar(i)}
                      className="rounded-lg border border-border-app px-3 py-1 text-xs text-danger hover:bg-surface-2"
                    >
                      Eliminar
                    </button>
                    {(i.ESTADO === 'PENDIENTE' || i.ESTADO === 'RECHAZADA') && (
                      <>
                        <button
                          onClick={() => setAprobar(i)}
                          className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
                        >
                          Aprobar
                        </button>
                        {i.ESTADO === 'PENDIENTE' && (
                          <button
                            onClick={() => accion(i.ID_INSTITUCION, 'rechazar')}
                            className="rounded-lg border border-border-app px-3 py-1 text-xs text-danger hover:bg-surface-2"
                          >
                            Rechazar
                          </button>
                        )}
                      </>
                    )}
                    {i.ESTADO === 'APROBADA' && (
                      <button
                        onClick={() => accion(i.ID_INSTITUCION, 'suspender')}
                        className="rounded-lg border border-border-app px-3 py-1 text-xs text-danger hover:bg-surface-2"
                      >
                        Suspender
                      </button>
                    )}
                    {i.ESTADO === 'SUSPENDIDA' && (
                      <button
                        onClick={() => accion(i.ID_INSTITUCION, 'reactivar')}
                        className="rounded-lg border border-border-app px-3 py-1 text-xs text-success hover:bg-surface-2"
                      >
                        Reactivar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                  Sin instituciones registradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AprobarForm({
  institucion,
  onClose,
  onDone,
}: {
  institucion: InstitucionRow;
  onClose: () => void;
  onDone: (
    cred: { usuarioSistema: string; passwordTemporal: string },
    idInstitucion: number,
  ) => void;
}) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const res = await api.post<{
        usuarioSistema: string;
        passwordTemporal: string;
      }>(`/instituciones/${institucion.ID_INSTITUCION}/aprobar`, {
        emailUsuarioSistema: email.trim(),
      });
      onDone(res, institucion.ID_INSTITUCION);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aprobar');
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-2xl border border-brand/40 bg-surface p-5"
    >
      <div className="font-semibold text-text">
        Aprobar «{institucion.NOMBRE}»
      </div>
      <p className="mt-1 text-sm text-text-2">
        Se creará automáticamente el usuario genérico con rol SYSTEM y una
        contraseña temporal.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label className="mb-1 block text-sm font-medium text-text-2">
            Correo de login del usuario del sistema
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand"
            placeholder="sistema@institucion.com"
          />
        </div>
        <button
          type="submit"
          disabled={sending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {sending ? 'Aprobando…' : 'Aprobar y crear usuario'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border-app px-4 py-2 text-sm text-text-2 hover:bg-surface-2"
        >
          Cancelar
        </button>
      </div>
      {error && (
        <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
