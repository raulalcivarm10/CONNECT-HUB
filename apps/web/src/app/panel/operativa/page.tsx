'use client';

import Link from 'next/link';

const SECCIONES = [
  {
    href: '/panel/operativa/locales',
    titulo: 'Locales y salones',
    descripcion:
      'Administra los locales de la institución, sus salones, subsalones y configuraciones de subdivisión.',
  },
  // Mapas/croquis: pendiente de la integración con el NAS de archivos
];

export default function OperativaPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-text">Gestión Operativa</h1>
      <p className="mt-1 text-text-2">
        Infraestructura física de la institución. Los eventos llegan en la
        Fase 3.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {SECCIONES.map((s) => (
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
