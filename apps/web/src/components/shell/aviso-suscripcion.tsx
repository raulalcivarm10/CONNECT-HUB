'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useI18n } from '@/lib/i18n';
import {
  fechaLegible,
  tonoVencimiento,
  useMiSuscripcion,
} from '@/lib/suscripciones';

/**
 * Franja de aviso de vencimiento en la parte superior del panel.
 *
 * Solo aparece cuando la vigencia aprieta: ámbar con ≤7 días, roja con ≤3 o si
 * ya venció. Con todo en orden no se pinta nada, y el superadmin global (sin
 * institución propia) ni siquiera dispara la petición.
 */
export function AvisoSuscripcion() {
  const { user } = useAuth();
  const { t, locale } = useI18n();

  // el superadmin sin institución no tiene vigencia que avisar
  const habilitado = !!user && user.idInstitucion != null;
  const { suscripcion } = useMiSuscripcion(habilitado);

  if (!habilitado || !suscripcion?.tiene) return null;

  const dias = suscripcion.diasRestantes;
  if (dias == null) return null;

  const tono = tonoVencimiento(dias, suscripcion.estado);
  if (!tono) return null; // vigencia holgada: sin franja

  const fecha = fechaLegible(suscripcion.fechaFin, locale);
  const texto =
    dias < 0
      ? t('sub.banExpired', { date: fecha, days: Math.abs(dias) })
      : dias === 0
        ? t('sub.banToday', { date: fecha })
        : dias === 1
          ? t('sub.banOne', { date: fecha })
          : t('sub.banSoon', { date: fecha, days: dias });

  // el tema oscuro se aplica con la clase `.dark` y no hay variante `dark:`
  // configurada en Tailwind, así que se usan colores que sirven en ambos temas
  const estilo =
    tono === 'danger'
      ? 'border-danger/40 bg-danger/10 text-danger'
      : 'border-amber-500/40 bg-amber-500/10 text-amber-500';

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2.5 text-sm ${estilo}`}
    >
      <span aria-hidden="true">{tono === 'danger' ? '⛔' : '⚠️'}</span>
      <span className="font-semibold">
        {tono === 'danger' ? t('sub.banTitleRed') : t('sub.banTitleAmber')}
      </span>
      <span>{texto}</span>
      <span className="text-text-2">{t('sub.banContact')}</span>
    </div>
  );
}
