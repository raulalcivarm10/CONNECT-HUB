'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { useI18n } from '@/lib/i18n';
import { propsValidacion } from '@/lib/validacion';
import { PasswordInput } from '@/components/ui/password-input';
import { LoginArt } from '@/components/login/login-art';

type Vista = 'login' | 'recuperar';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [vista, setVista] = useState<Vista>('login');

  // login
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // recuperación
  const [usuarioRec, setUsuarioRec] = useState('');
  const [recResultado, setRecResultado] = useState<{
    mensaje: string;
    passwordTemporal?: string;
  } | null>(null);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const user = await login(usuario.trim(), password);
      router.replace(user.debeCambiarClave ? '/cambiar-clave' : '/panel');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error'));
      setSending(false);
    }
  }

  async function onRecuperar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setRecResultado(null);
    setSending(true);
    try {
      const res = await api.post<{ mensaje: string; passwordTemporal?: string }>(
        '/auth/recuperar',
        { usuario: usuarioRec.trim() },
      );
      setRecResultado(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.recoverError'));
    } finally {
      setSending(false);
    }
  }

  const inputCls =
    'w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand';

  return (
    <main className="flex min-h-screen">
      <LoginArt />

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:text-left">
            <div className="text-sm font-semibold uppercase tracking-widest text-brand">
              Connect-Hub
            </div>
            <h1 className="mt-1 text-2xl font-bold text-text">
              {vista === 'login' ? t('login.title') : t('login.recoverTitle')}
            </h1>
            {vista === 'recuperar' && (
              <p className="mt-1 text-sm text-text-2">
                {t('login.recoverHint')}
              </p>
            )}
          </div>

          {vista === 'login' ? (
            <form
              onSubmit={onLogin}
              className="space-y-4 rounded-2xl border border-border-app bg-surface p-6 shadow-sm"
            >
              <div>
                <label
                  htmlFor="usuario"
                  className="mb-1 block text-sm font-medium text-text-2"
                >
                  {t('login.user')}
                </label>
                <input
                  id="usuario"
                  type="email"
                  autoComplete="username"
                  required
                  {...propsValidacion(t('common.requiredField'))}
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  className={inputCls}
                  placeholder={t('login.emailPh')}
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-text-2"
                  >
                    {t('login.password')}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setVista('recuperar');
                      setError(null);
                      setRecResultado(null);
                      setUsuarioRec(usuario);
                    }}
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    {t('login.forgot')}
                  </button>
                </div>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={setPassword}
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
                {sending ? t('login.signingIn') : t('login.signIn')}
              </button>
            </form>
          ) : (
            <form
              onSubmit={onRecuperar}
              className="space-y-4 rounded-2xl border border-border-app bg-surface p-6 shadow-sm"
            >
              <div>
                <label
                  htmlFor="usuarioRec"
                  className="mb-1 block text-sm font-medium text-text-2"
                >
                  {t('login.yourUser')}
                </label>
                <input
                  id="usuarioRec"
                  type="email"
                  required
                  {...propsValidacion(t('common.requiredField'))}
                  value={usuarioRec}
                  onChange={(e) => setUsuarioRec(e.target.value)}
                  className={inputCls}
                  placeholder={t('login.emailPh')}
                />
              </div>

              {recResultado && (
                <div className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
                  {recResultado.mensaje}
                  {recResultado.passwordTemporal && (
                    <div className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-center font-mono text-base font-bold tracking-widest text-text">
                      {recResultado.passwordTemporal}
                    </div>
                  )}
                </div>
              )}
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
                {sending ? t('login.sendingTemp') : t('login.sendTemp')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setVista('login');
                  setError(null);
                }}
                className="w-full rounded-lg border border-border-app px-4 py-2 text-sm text-text-2 transition hover:bg-surface-2"
              >
                {t('login.backToLogin')}
              </button>
            </form>
          )}

          <p className="mt-4 text-center text-xs text-text-muted">
            {t('login.footer')}
          </p>
        </div>
      </div>
    </main>
  );
}
