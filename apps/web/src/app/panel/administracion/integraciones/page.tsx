'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { useDialogo } from '@/lib/dialogo';
import { useI18n } from '@/lib/i18n';
import { propsValidacion } from '@/lib/validacion';
import { puedeVer, ROL } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Roles que gestionan las llaves de integración */
const ROLES_INTEGRACIONES: readonly string[] = [ROL.SYSTEM, ROL.ADMINISTRATION];

interface ApiKeyRow {
  ID_API_KEY: number;
  NOMBRE: string;
  PREFIJO: string;
  ACTIVO: 'S' | 'N';
  CREADO_POR: string | null;
  FECHA_REGISTRO: string | null;
  ULTIMO_USO: string | null;
  USOS: number;
}

/** respuesta de POST /api-keys: la clave en claro llega UNA sola vez */
interface ClaveNueva {
  clave: string;
  prefijo: string;
  nombre: string;
  aviso?: string;
}

/** Bloque de código con botón de copiar (el contenido va literal, sin traducir) */
function BloqueCodigo({ codigo }: { codigo: string }) {
  const { t } = useI18n();
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin permiso de portapapeles: el usuario puede seleccionar el texto */
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={copiar}
        className="absolute right-2 top-2 rounded-lg border border-border-app bg-surface px-2 py-1 text-xs font-semibold text-text-2 hover:bg-surface-2"
      >
        {copiado ? t('int.copied') : t('int.copy')}
      </button>
      <pre className="overflow-x-auto rounded-lg border border-border-app bg-surface-2 p-3 pr-20 text-xs leading-relaxed text-text-2">
        <code>{codigo}</code>
      </pre>
    </div>
  );
}

/** Modal: pide el nombre y luego muestra la clave en claro (única vez) */
function NuevaClaveModal({
  onCreada,
  onClose,
}: {
  onCreada: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [nombre, setNombre] = useState('');
  const [creada, setCreada] = useState<ClaveNueva | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      const res = await api.post<ClaveNueva>('/api-keys', {
        nombre: nombre.trim(),
      });
      setCreada(res);
      onCreada();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('c.error'));
      setSending(false);
    }
  }

  async function copiarClave() {
    if (!creada) return;
    try {
      await navigator.clipboard.writeText(creada.clave);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin portapapeles: la clave está visible para copiarla a mano */
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-border-app bg-surface p-6 shadow-2xl"
      >
        {creada ? (
          <>
            <h2 className="text-lg font-semibold text-text">
              {t('int.createdTitle', { name: creada.nombre })}
            </h2>
            <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-500">
              ⚠ {t('int.saveNow')}
            </p>
            <div className="mt-3 rounded-lg border-2 border-brand/40 bg-surface-2 p-3">
              <code className="block break-all font-mono text-sm text-text">
                {creada.clave}
              </code>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={copiarClave}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                {copiado ? t('int.copied') : t('int.copyKey')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border-app px-4 py-2 text-sm font-medium text-text-2 hover:bg-surface-2"
              >
                {t('c.close')}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <h2 className="text-lg font-semibold text-text">
              {t('int.newTitle')}
            </h2>
            <label className="mt-3 mb-1 block text-sm font-medium text-text-2">
              {t('int.keyName')}
            </label>
            <input
              autoFocus
              required
              maxLength={100}
              {...propsValidacion(t('common.requiredField'))}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={t('int.keyNamePh')}
              className="w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand"
            />
            <p className="mt-1 text-xs text-text-muted">{t('int.keyNameHint')}</p>
            {error && (
              <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border-app px-4 py-2 text-sm font-medium text-text-2 hover:bg-surface-2"
              >
                {t('c.cancel')}
              </button>
              <button
                type="submit"
                disabled={sending}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {sending ? t('c.saving') : t('int.generate')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function IntegracionesPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const dialogo = useDialogo();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  const tieneAcceso = puedeVer(user, ROLES_INTEGRACIONES);

  const cargar = useCallback(async () => {
    setKeys(await api.get<ApiKeyRow[]>('/api-keys'));
  }, []);

  useEffect(() => {
    if (!tieneAcceso) return;
    cargar().catch((e) => setError(e.message));
  }, [cargar, tieneAcceso]);

  async function revocar(k: ApiKeyRow) {
    const confirmado = await dialogo.confirmar({
      titulo: t('int.revokeTitle', { name: k.NOMBRE }),
      mensaje: t('int.revokeMsg'),
      tono: 'danger',
      confirmar: t('int.revoke'),
    });
    if (!confirmado) return;
    setError(null);
    setOk(null);
    try {
      await api.del(`/api-keys/${k.ID_API_KEY}`);
      setOk(t('int.revoked', { name: k.NOMBRE }));
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('c.error'));
    }
  }

  if (!tieneAcceso) {
    return <p className="text-text-muted">{t('int.noAccess')}</p>;
  }

  const curl = `curl -X POST "${API_URL}/integracion/checkin" \\
  -H "X-API-Key: chk_tu_clave_aqui" \\
  -H "Content-Type: application/json" \\
  -d '{"qrToken":"TCK-XXXX-XXXX","idEvento":262}'`;

  const respPermitido = `{
  "acceso": "PERMITIDO",
  "participante": { "nombre": "ANA PEREZ", "email": "ana@uni.edu", "documento": "0912345678" },
  "evento": { "id": 262, "titulo": "INNOVATION SUMMIT", "fecha": "2026-08-25" },
  "fechaIngreso": "2026-08-25 09:14"
}`;

  const respYaRegistrado = `{
  "acceso": "YA_REGISTRADO",
  "motivo": "El ticket ya fue usado",
  "participante": { "nombre": "ANA PEREZ", "email": "ana@uni.edu", "documento": "0912345678" },
  "evento": { "id": 262, "titulo": "INNOVATION SUMMIT", "fecha": "2026-08-25" },
  "fechaIngreso": "2026-08-25 09:14"
}`;

  const respDenegado = `{
  "acceso": "DENEGADO",
  "motivo": "El ticket no corresponde a este evento"
}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('int.title')}</h1>
          <p className="text-sm text-text-2">{t('int.subtitle')}</p>
        </div>
        <button
          onClick={() => setNueva(true)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          {t('int.generate')}
        </button>
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

      <h2 className="mt-6 text-lg font-semibold text-text">{t('int.keys')}</h2>
      <div className="mt-2 overflow-x-auto rounded-2xl border border-border-app bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-app text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-4 py-3">{t('c.name')}</th>
              <th className="px-4 py-3">{t('int.prefix')}</th>
              <th className="px-4 py-3">{t('c.state')}</th>
              <th className="px-4 py-3">{t('int.createdBy')}</th>
              <th className="px-4 py-3">{t('aud.date')}</th>
              <th className="px-4 py-3">{t('int.lastUse')}</th>
              <th className="px-4 py-3">{t('int.uses')}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.ID_API_KEY} className="border-b border-border-app/60">
                <td className="px-4 py-3 font-medium text-text">{k.NOMBRE}</td>
                <td className="px-4 py-3 font-mono text-xs text-text-2">
                  {k.PREFIJO}…
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      k.ACTIVO === 'S' ? 'text-success' : 'text-text-muted'
                    }
                  >
                    ● {k.ACTIVO === 'S' ? t('int.active') : t('int.revokedState')}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-2">{k.CREADO_POR ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-text-2">
                  {k.FECHA_REGISTRO ?? '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-text-2">
                  {k.ULTIMO_USO ?? t('int.neverUsed')}
                </td>
                <td className="px-4 py-3 text-text-2">{k.USOS}</td>
                <td className="px-4 py-3 text-right">
                  {k.ACTIVO === 'S' && (
                    <button
                      onClick={() => revocar(k)}
                      className="rounded-lg border border-border-app px-3 py-1 text-xs text-danger hover:bg-surface-2"
                    >
                      {t('int.revoke')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-text-muted">
                  {t('int.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Documentación breve para el equipo que integra su propia app */}
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setDocsOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-left text-sm font-semibold text-text-2 transition hover:bg-surface"
        >
          <span className="text-brand">{docsOpen ? '▾' : '▸'}</span>
          {t('int.howTo')}
        </button>
        {docsOpen && (
          <div className="mt-3 flex flex-col gap-4 rounded-2xl border border-border-app bg-surface p-5">
            <p className="text-sm text-text-2">{t('int.howToIntro')}</p>

            <div>
              <div className="mb-1 text-sm font-semibold text-text">
                {t('int.endpoint')}
              </div>
              <BloqueCodigo codigo={`POST ${API_URL}/integracion/checkin`} />
              <p className="mt-1 text-xs text-text-muted">
                {t('int.endpointHint')}
              </p>
            </div>

            <div>
              <div className="mb-1 text-sm font-semibold text-text">
                {t('int.header')}
              </div>
              <BloqueCodigo codigo={'X-API-Key: chk_tu_clave_aqui'} />
            </div>

            <div>
              <div className="mb-1 text-sm font-semibold text-text">
                {t('int.example')}
              </div>
              <BloqueCodigo codigo={curl} />
            </div>

            <div>
              <div className="mb-1 text-sm font-semibold text-text">
                {t('int.respAllowed')}
              </div>
              <BloqueCodigo codigo={respPermitido} />
            </div>

            <div>
              <div className="mb-1 text-sm font-semibold text-text">
                {t('int.respAlready')}
              </div>
              <BloqueCodigo codigo={respYaRegistrado} />
            </div>

            <div>
              <div className="mb-1 text-sm font-semibold text-text">
                {t('int.respDenied')}
              </div>
              <BloqueCodigo codigo={respDenegado} />
            </div>

            <p className="text-sm text-text-2">{t('int.verifyHint')}</p>
          </div>
        )}
      </div>

      {nueva && (
        <NuevaClaveModal
          onCreada={() => void cargar()}
          onClose={() => setNueva(false)}
        />
      )}
    </div>
  );
}
