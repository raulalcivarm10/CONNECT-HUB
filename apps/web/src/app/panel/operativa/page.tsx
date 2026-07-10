'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

export default function OperativaPage() {
  const { t } = useI18n();
  // Mapas/croquis: pendiente de la integración con el NAS de archivos
  const secciones = [
    {
      href: '/panel/operativa/locales',
      titulo: t('op.venuesTitle'),
      descripcion: t('op.venuesDesc'),
    },
  ];
  return (
    <div>
      <h1 className="text-2xl font-bold text-text">{t('side.operations')}</h1>
      <p className="mt-1 text-text-2">{t('op.subtitle')}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {secciones.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-2xl border border-border-app bg-surface p-5 shadow-sm transition hover:border-brand"
          >
            <div className="text-lg font-semibold text-text">{s.titulo}</div>
            <p className="mt-1 text-sm text-text-2">{s.descripcion}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
