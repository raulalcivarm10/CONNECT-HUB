'use client';

/**
 * ENTRADA de la web pública: código de institución.
 *
 * Aquí NO hay login, y es a propósito. La web pública es transaccional: se entra
 * con el código de la institución, se ve su cartelera y se compra como invitado.
 * Las cuentas (mis entradas, comunidad, chats) viven solo en la app móvil.
 *
 * El código se valida contra `/public/instituciones/resolver`, que ya existía
 * para la app móvil y es público — no hizo falta backend nuevo.
 */

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function EntradaPorCodigo() {
  const { t } = useI18n();
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function validar(e: FormEvent) {
    e.preventDefault();
    const cod = codigo.trim();
    if (!cod) return;

    setCargando(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/public/instituciones/resolver?codigo=${encodeURIComponent(cod)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        // 404 = código que no existe. Cualquier otro fallo se trata igual de cara
        // a quien entra: no puede hacer nada distinto con esa distinción.
        setError(t('pub.codeInvalid'));
        return;
      }
      // Se navega con el código, no con el id: así la URL es compartible y la
      // página de cartelera puede renderizarse en el servidor para que Google la
      // indexe.
      router.push(`/eventos/${encodeURIComponent(cod.toUpperCase())}`);
    } catch {
      setError(t('pub.codeError'));
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-alt px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-text sm:text-4xl">{t('pub.welcome')}</h1>
          <p className="mt-3 text-text-muted">{t('pub.welcomeSub')}</p>
        </div>

        <form
          onSubmit={validar}
          className="rounded-2xl border border-border-app bg-surface p-6 shadow-sm sm:p-8"
        >
          <label htmlFor="codigo" className="block text-sm font-medium text-text">
            {t('pub.codeLabel')}
          </label>
          <input
            id="codigo"
            value={codigo}
            onChange={(e) => {
              setCodigo(e.target.value);
              if (error) setError(null);
            }}
            // Los códigos se guardan en mayúsculas; se muestran así mientras se
            // escribe para que nadie dude de si importa.
            className="mt-2 w-full rounded-xl border border-border-app bg-surface-alt px-4 py-3 text-center text-lg font-semibold uppercase tracking-widest text-text outline-none focus:border-brand"
            placeholder={t('pub.codePlaceholder')}
            autoComplete="off"
            autoCapitalize="characters"
            autoFocus
            maxLength={32}
          />

          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={cargando || !codigo.trim()}
            className="mt-5 w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white transition disabled:opacity-50"
          >
            {cargando ? t('c.loading') : t('pub.codeSubmit')}
          </button>

          <p className="mt-4 text-center text-xs text-text-muted">{t('pub.codeHint')}</p>
        </form>
      </div>
    </main>
  );
}
