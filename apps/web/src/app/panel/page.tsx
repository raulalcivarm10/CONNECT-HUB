'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-context';
import { useI18n } from '@/lib/i18n';
import { MODULE_ICONS } from '@/components/ui/icons';
import { MODULOS, puedeVer } from '@/lib/types';

export default function PanelHome() {
  const { user } = useAuth();
  const { t } = useI18n();
  const visibles = MODULOS.filter((m) => puedeVer(user, m.roles));

  return (
    <div>
      <h1 className="text-2xl font-bold text-text">
        {t('home.hello', { name: user?.nombres ?? user?.nombreCompleto ?? '' })}
      </h1>
      <p className="mt-1 text-text-2">
        {user?.esSuper
          ? t('home.superAccess')
          : t('home.rolesAccess', { roles: user?.roles.join(', ') ?? '' })}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibles.map((m) => {
          const Ico = MODULE_ICONS[m.id];
          return (
            <Link
              key={m.id}
              href={m.href}
              className="rounded-2xl border border-border-app bg-surface p-5 shadow-sm transition hover:border-brand"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  {Ico && <Ico width={20} height={20} />}
                </span>
                <div className="text-lg font-semibold text-text">
                  {t(m.nombreKey)}
                </div>
              </div>
              <p className="mt-2 text-sm text-text-2">{t(m.descKey)}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
