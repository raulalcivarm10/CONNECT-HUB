'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useI18n } from '@/lib/i18n';
import { MODULOS, puedeVer } from '@/lib/types';

function NavLink({
  href,
  label,
  exact = false,
}: {
  href: string;
  label: string;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`block rounded-lg px-3 py-2 text-sm transition ${
        active
          ? 'bg-brand/15 font-semibold text-brand'
          : 'text-text-2 hover:bg-surface-2 hover:text-text'
      }`}
    >
      {label}
    </Link>
  );
}

export function Sidebar() {
  const { user } = useAuth();
  const { t } = useI18n();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border-app bg-surface">
      <div className="border-b border-border-app px-4 py-4">
        <div className="text-xs font-semibold uppercase tracking-widest text-brand">
          Connect-Hub
        </div>
        <div className="text-sm font-bold text-text">{t('brand.panel')}</div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto p-3">
        <div>
          <NavLink href="/panel" label={t('side.home')} exact />
        </div>

        {puedeVer(user, MODULOS[0].roles) && (
          <div>
            <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t('side.administration')}
            </div>
            <NavLink
              href="/panel/administracion/usuarios"
              label={t('side.users')}
            />
            {user?.esSuper ? (
              <NavLink
                href="/panel/administracion/instituciones"
                label={t('side.institutions')}
              />
            ) : (
              <NavLink
                href="/panel/administracion/mi-institucion"
                label={t('side.myInstitution')}
              />
            )}
          </div>
        )}

        {puedeVer(user, MODULOS[1].roles) && (
          <div>
            <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t('side.finance')}
            </div>
            <NavLink href="/panel/financiero" label={t('side.payments')} />
          </div>
        )}

        {puedeVer(user, MODULOS[2].roles) && (
          <div>
            <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t('side.operations')}
            </div>
            <NavLink
              href="/panel/operativa/locales"
              label={t('side.venues')}
            />
          </div>
        )}

        {puedeVer(user, MODULOS[3].roles) && (
          <div>
            <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t('side.events')}
            </div>
            <NavLink
              href="/panel/eventos/calendario"
              label={t('side.calendar')}
            />
            <NavLink href="/panel/eventos" label={t('side.events')} exact />
          </div>
        )}
      </nav>

      <div className="border-t border-border-app p-3 text-xs text-text-muted">
        {user?.esSuper ? t('side.superFooter') : (user?.institucion ?? '')}
      </div>
    </aside>
  );
}
