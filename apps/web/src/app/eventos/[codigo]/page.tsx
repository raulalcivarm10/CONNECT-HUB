/**
 * CARTELERA pública de una institución.
 *
 * Se renderiza EN EL SERVIDOR a propósito: es la página que se comparte por
 * WhatsApp y la que debe indexar Google para que la gente llegue a comprar. Con
 * render en cliente el buscador vería una página vacía.
 *
 * Consume endpoints que ya existían para la app móvil y son públicos, así que
 * esta pantalla no necesitó backend nuevo.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

// Dentro del contenedor la URL pública apunta a sí mismo, así que para el fetch
// del servidor se usa la interna. La pública solo sirve para lo que ve el
// navegador (imágenes) y para las etiquetas que lee el crawler.
const API_INTERNAL =
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const API_PUBLIC = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Institucion {
  idInstitucion: number;
  nombre: string;
  logoUrl: string | null;
}

interface EventoLista {
  idEvento: number;
  titulo: string;
  descripcion: string | null;
  fechaInicio: string;
  fechaFin: string;
  horaInicio: string | null;
  horaFin: string | null;
  precio: number | null;
  destacado: boolean;
  localNombre: string | null;
  salonNombre: string | null;
  portadaUrl: string | null;
}

async function getInstitucion(codigo: string): Promise<Institucion | null> {
  try {
    const res = await fetch(
      `${API_INTERNAL}/public/instituciones/resolver?codigo=${encodeURIComponent(codigo)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    return (await res.json()) as Institucion;
  } catch {
    return null;
  }
}

async function getEventos(codigo: string): Promise<EventoLista[]> {
  try {
    const res = await fetch(
      `${API_INTERNAL}/public/eventos?codigo=${encodeURIComponent(codigo)}&size=50`,
      { cache: 'no-store' },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: EventoLista[] } | EventoLista[];
    return Array.isArray(data) ? data : (data.items ?? []);
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigo: string }>;
}): Promise<Metadata> {
  const { codigo } = await params;
  const inst = await getInstitucion(codigo);
  if (!inst) return { title: 'Eventos' };
  return {
    title: `Eventos · ${inst.nombre}`,
    description: `Consulta y compra entradas para los eventos de ${inst.nombre}.`,
    openGraph: {
      title: `Eventos · ${inst.nombre}`,
      description: `Consulta y compra entradas para los eventos de ${inst.nombre}.`,
      images: inst.logoUrl ? [`${API_PUBLIC}${inst.logoUrl}`] : undefined,
    },
  };
}

/** Rango de fechas legible; si empieza y acaba el mismo día, muestra una sola. */
function rangoFechas(desde: string, hasta: string) {
  const f = (s: string) =>
    new Date(s).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' });
  const a = f(desde);
  const b = f(hasta);
  return a === b ? a : `${a} – ${b}`;
}

function Precio({ precio }: { precio: number | null }) {
  if (precio == null || precio <= 0) {
    return (
      <span className="rounded-full bg-success/15 px-3 py-1 text-sm font-semibold text-success">
        Gratis
      </span>
    );
  }
  return (
    <span className="text-lg font-bold text-text">
      ${precio.toFixed(2)}
    </span>
  );
}

export default async function Cartelera({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const inst = await getInstitucion(codigo);
  // Código inexistente → 404 de verdad, no una página vacía: importa para que
  // Google no indexe URLs basura.
  if (!inst) notFound();

  const eventos = await getEventos(codigo);

  return (
    <main className="min-h-screen bg-surface-alt">
      <header className="border-b border-border-app bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-6 sm:px-6">
          {inst.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${API_PUBLIC}${inst.logoUrl}`}
              alt={inst.nombre}
              className="h-12 w-12 rounded-xl object-cover sm:h-14 sm:w-14"
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-text sm:text-2xl">{inst.nombre}</h1>
            <p className="text-sm text-text-muted">
              {eventos.length === 1 ? '1 evento disponible' : `${eventos.length} eventos disponibles`}
            </p>
          </div>
          <Link
            href="/eventos"
            className="ml-auto shrink-0 text-sm text-text-muted underline underline-offset-4"
          >
            Cambiar
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {eventos.length === 0 ? (
          <p className="py-16 text-center text-text-muted">
            Esta institución todavía no tiene eventos publicados.
          </p>
        ) : (
          // 1 columna en móvil, 2 en tableta, 3 en escritorio: la web se diseña
          // para pantalla grande y baja bien, no al revés.
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {eventos.map((ev) => (
              <li key={ev.idEvento}>
                <Link
                  href={`/eventos/${encodeURIComponent(codigo)}/${ev.idEvento}`}
                  className="flex h-full flex-col overflow-hidden rounded-2xl border border-border-app bg-surface transition hover:border-brand"
                >
                  <div className="aspect-[16/9] w-full bg-surface-alt">
                    {ev.portadaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${API_PUBLIC}${ev.portadaUrl}&w=800`}
                        alt={ev.titulo}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <h2 className="line-clamp-2 font-semibold text-text">{ev.titulo}</h2>
                    <p className="text-sm text-text-muted">
                      {rangoFechas(ev.fechaInicio, ev.fechaFin)}
                    </p>
                    {ev.salonNombre || ev.localNombre ? (
                      <p className="line-clamp-1 text-sm text-text-muted">
                        {[ev.localNombre, ev.salonNombre].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                    <div className="mt-auto pt-2">
                      <Precio precio={ev.precio} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
