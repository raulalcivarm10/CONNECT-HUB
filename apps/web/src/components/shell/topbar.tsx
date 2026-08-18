'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { useInstitucionFiltro } from '@/lib/institucion-context';
import { useI18n } from '@/lib/i18n';
import { LANGS } from '@/lib/i18n/translations';
import { useTheme } from '@/lib/theme';

export function Topbar() {
  const { user, logout } = useAuth();
  const { idInstitucion, setIdInstitucion, instituciones } =
    useInstitucionFiltro();
  const { lang, setLang, t } = useI18n();
  const { tema, toggle } = useTheme();
  const router = useRouter();

  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // cierra el menú al hacer clic fuera
  useEffect(() => {
    if (!menuAbierto) return;
    function onClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuAbierto(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuAbierto]);

  async function onLogout() {
    await logout();
    router.replace('/login');
  }

  const iniciales =
    (user?.nombres?.[0] ?? '') + (user?.apellidos?.[0] ?? '') || '?';

  return (
    <header className="flex h-14 items-center justify-between border-b border-border-app bg-surface px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 pr-4 text-sm text-text-muted">
        {user?.esSuper ? (
          <>
            <span className="hidden shrink-0 sm:inline">
              {t('top.viewing')}
            </span>
            <select
              value={idInstitucion ?? ''}
              onChange={(e) =>
                setIdInstitucion(e.target.value ? Number(e.target.value) : null)
              }
              className="w-full min-w-0 max-w-[42rem] rounded-lg border border-border-app bg-surface-2 px-3 py-1.5 text-sm font-medium text-text"
              title={
                idInstitucion != null
                  ? (instituciones.find(
                      (i) => i.ID_INSTITUCION === idInstitucion,
                    )?.NOMBRE ?? t('top.globalFilter'))
                  : t('top.globalFilter')
              }
            >
              <option value="">{t('top.allInstitutions')}</option>
              {instituciones.map((i) => (
                <option key={i.ID_INSTITUCION} value={i.ID_INSTITUCION}>
                  {i.NOMBRE} {i.ESTADO !== 'APROBADA' ? `(${t(`st.${i.ESTADO}`)})` : ''}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className="truncate" title={user?.institucion ?? ''}>
            {user?.institucion ?? ''}
          </span>
        )}
      </div>

      <div className="relative flex items-center gap-3" ref={menuRef}>
        <div className="hidden text-right sm:block">
          <div className="text-sm font-semibold leading-tight text-text">
            {user?.nombreCompleto}
          </div>
          <div className="text-xs leading-tight text-text-muted">
            {user?.esSuper
              ? t('top.superadmin')
              : user?.roles
                  .map((r) => {
                    const label = t(`role.${r}`);
                    return label === `role.${r}` ? r : label;
                  })
                  .join(' · ')}
          </div>
        </div>
        <button
          onClick={() => setMenuAbierto((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white transition hover:ring-2 hover:ring-brand/40"
          title={t('top.language') + ' · ' + t('top.theme')}
        >
          {iniciales.toUpperCase()}
        </button>

        {menuAbierto && (
          <div className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-border-app bg-surface p-2 shadow-xl">
            {/* idioma */}
            <div className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t('top.language')}
            </div>
            <div className="grid grid-cols-2 gap-1 px-1">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={`rounded-lg px-2 py-1.5 text-left text-sm transition ${
                    lang === l.code
                      ? 'bg-brand/15 font-semibold text-brand'
                      : 'text-text-2 hover:bg-surface-2'
                  }`}
                >
                  {l.flag} {l.label}
                </button>
              ))}
            </div>

            {/* tema */}
            <div className="mt-2 px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t('top.theme')}
            </div>
            <button
              onClick={toggle}
              className="mx-1 w-[calc(100%-0.5rem)] rounded-lg px-2 py-1.5 text-left text-sm text-text-2 transition hover:bg-surface-2"
            >
              {tema === 'dark' ? t('top.themeLight') : t('top.themeDark')}
            </button>

            {/* Manual de producto. Es un PDF estatico servido desde /public: se
                abre en pestaña nueva (los navegadores lo previsualizan y desde
                ahi se guarda) en vez de forzar la descarga. El documento esta
                en INGLES a proposito; lo que se traduce es esta etiqueta. */}
            <a
              href="/connecthub-manual.pdf"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuAbierto(false)}
              className="mx-1 mt-2 block w-[calc(100%-0.5rem)] rounded-lg px-2 py-1.5 text-left text-sm text-text-2 transition hover:bg-surface-2"
            >
              📘 {t('top.manual')}
            </a>

            <div className="my-2 border-t border-border-app" />

            <button
              onClick={onLogout}
              className="mx-1 w-[calc(100%-0.5rem)] rounded-lg px-2 py-1.5 text-left text-sm font-medium text-danger transition hover:bg-danger/10"
            >
              ⏻ {t('top.logout')}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
