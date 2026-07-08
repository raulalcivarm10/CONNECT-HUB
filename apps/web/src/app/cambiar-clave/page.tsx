'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { useI18n } from '@/lib/i18n';
import { PasswordInput } from '@/components/ui/password-input';

export default function CambiarClavePage() {
  const { user, loading, logout } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const [claveActual, setClaveActual] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center text-text-muted">
        Cargando…
      </main>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (claveNueva !== confirmar) {
      setError(t('clave.mismatch'));
      return;
    }
    if (claveNueva === claveActual) {
      setError('La contraseña nueva debe ser distinta de la actual');
      return;
    }
    setSending(true);
    try {
      await api.post('/auth/cambiar-clave', { claveActual, claveNueva });
      // recarga completa: la sesión se renueva sin el bloqueo de cambio
      window.location.assign('/panel');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar');
      setSending(false);
    }
  }

  async function onSalir() {
    await logout();
    router.replace('/login');
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-sm font-semibold uppercase tracking-widest text-brand">
            Connect-Hub
          </div>
          <h1 className="mt-1 text-2xl font-bold text-text">
            {t('clave.title')}
          </h1>
          <p className="mt-1 text-sm text-text-2">
            {user.debeCambiarClave
              ? 'Ingresaste con una contraseña temporal. Por seguridad, debes cambiarla para continuar.'
              : 'Actualiza tu contraseña de acceso.'}
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-border-app bg-surface p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-text-2">
              {t('clave.current')}
            </label>
            <PasswordInput value={claveActual} onChange={setClaveActual} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-2">
              {t('clave.new')}
            </label>
            <PasswordInput
              value={claveNueva}
              onChange={setClaveNueva}
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-2">
              {t('clave.confirm')}
            </label>
            <PasswordInput
              value={confirmar}
              onChange={setConfirmar}
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {sending ? t('clave.submitting') : t('clave.submit')}
          </button>
          <button
            type="button"
            onClick={onSalir}
            className="w-full rounded-lg border border-border-app px-4 py-2 text-sm text-text-2 transition hover:bg-surface-2"
          >
            Cancelar y salir
          </button>
        </form>
      </div>
    </main>
  );
}
