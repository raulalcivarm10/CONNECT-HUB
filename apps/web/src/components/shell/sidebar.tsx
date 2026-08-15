'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { useI18n } from '@/lib/i18n';
import {
  esEventoRestringido,
  MODULOS,
  puedeVer,
  ROL,
  ROLES_VER_APROBACIONES,
} from '@/lib/types';
import {
  IconBuilding,
  IconChat,
  IconBuildingProfile,
  IconCalendar,
  IconChart,
  IconFinance,
  IconHome,
  IconKey,
  IconTicket,
  IconUsers,
  IconVenue,
} from '@/components/ui/icons';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

function NavLink({
  href,
  label,
  icon: Ico,
  exact = false,
}: {
  href: string;
  label: string;
  icon: Icon;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
        active
          ? 'bg-brand/15 font-semibold text-brand'
          : 'text-text-2 hover:bg-surface-2 hover:text-text'
      }`}
    >
      <Ico className="shrink-0" width={17} height={17} />
      <span>{label}</span>
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
          <NavLink href="/panel" label={t('side.home')} icon={IconHome} exact />
        </div>

        {puedeVer(user, MODULOS[0].roles) && (
          <div>
            <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t('side.administration')}
            </div>
            <NavLink
              href="/panel/administracion/usuarios"
              label={t('side.users')}
              icon={IconUsers}
            />
            {/* Auditoría: el superadmin ve todas las instituciones; el SYSTEM
                de una institución ve SOLO la suya (el API lo fuerza). */}
            <NavLink
              href="/panel/administracion/auditoria"
              label={t('side.audit')}
              icon={IconChart}
            />
            {/* llaves de API para que la app propia de la institución lea QR */}
            {puedeVer(user, [ROL.SYSTEM, ROL.ADMINISTRATION]) && (
              <NavLink
                href="/panel/administracion/integraciones"
                label={t('side.integrations')}
                icon={IconKey}
              />
            )}
            {user?.esSuper ? (
              <>
                <NavLink
                  href="/panel/administracion/instituciones"
                  label={t('side.institutions')}
                  icon={IconBuilding}
                />
                {/* vigencia de cada institución cliente: solo el superadmin */}
                <NavLink
                  href="/panel/administracion/suscripciones"
                  label={t('side.subscriptions')}
                  icon={IconFinance}
                />
              </>
            ) : (
              <NavLink
                href="/panel/administracion/mi-institucion"
                label={t('side.myInstitution')}
                icon={IconBuildingProfile}
              />
            )}
          </div>
        )}

        {puedeVer(user, MODULOS[1].roles) && (
          <div>
            <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t('side.finance')}
            </div>
            <NavLink
              href="/panel/financiero"
              label={t('side.payments')}
              icon={IconFinance}
            />
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
              icon={IconVenue}
            />
          </div>
        )}

        {puedeVer(user, MODULOS[3].roles) && (
          <div>
            <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t('side.events')}
            </div>
            {/* rol EVENT raso: solo lista + calendario (sin reservas privadas) */}
            {!esEventoRestringido(user) && (
              <NavLink
                href="/panel/reservas"
                label={t('side.reservations')}
                icon={IconVenue}
              />
            )}
            <NavLink
              href="/panel/eventos/calendario"
              label={t('side.calendar')}
              icon={IconCalendar}
            />
            <NavLink
              href="/panel/eventos"
              label={t('side.events')}
              icon={IconTicket}
              exact
            />
            {/* aprobación de salones: solo quien aprueba salones o publica */}
            {puedeVer(user, ROLES_VER_APROBACIONES) && (
              <NavLink
                href="/panel/eventos/aprobaciones"
                label={t('side.approvals')}
                icon={IconVenue}
              />
            )}
          </div>
        )}

        {puedeVer(user, [ROL.SYSTEM, ROL.ADMINISTRATION]) && (
          <div>
            <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t('side.reports')}
            </div>
            <NavLink
              href="/panel/reportes"
              label={t('side.attendance')}
              icon={IconChart}
              exact
            />
            <NavLink
              href="/panel/reportes/salones"
              label={t('side.venueUsage')}
              icon={IconChart}
            />
          </div>
        )}

        <div>
          <NavLink
            href="/panel/feedback"
            label={t('side.feedback')}
            icon={IconChat}
          />
        </div>
      </nav>

      <div className="border-t border-border-app p-3 text-xs text-text-muted">
        {user?.esSuper ? t('side.superFooter') : (user?.institucion ?? '')}
      </div>
    </aside>
  );
}
