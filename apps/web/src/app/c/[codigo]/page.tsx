import type { Metadata } from 'next';

// Fetch SSR: URL INTERNA del contenedor (dentro del web, https://localhost/api
// se apunta a sí mismo). Imagen/OG: URL PÚBLICA (la ven el navegador y el crawler).
const API_INTERNAL =
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const API_PUBLIC = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Cert {
  codigo: string;
  tipo: string | null;
  nombreAsistente: string | null;
  tituloEvento: string | null;
  institucion: string | null;
  idEvento: number;
  fechaEmision: string;
}

async function fetchCert(codigo: string): Promise<Cert | null> {
  try {
    const res = await fetch(`${API_INTERNAL}/public/certificados/${encodeURIComponent(codigo)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as Cert;
  } catch {
    return null;
  }
}

function imagenUrl(codigo: string) {
  return `${API_PUBLIC}/public/certificados/${encodeURIComponent(codigo)}/imagen`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigo: string }>;
}): Promise<Metadata> {
  const { codigo } = await params;
  const cert = await fetchCert(codigo);
  if (!cert) return { title: 'Certificado no encontrado · ConnectHub' };
  const img = imagenUrl(codigo);
  const title = `${cert.tituloEvento ?? 'Certificado'} · Certificado`;
  const desc = [cert.nombreAsistente, cert.institucion].filter(Boolean).join(' · ');
  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      type: 'website',
      images: [{ url: img, width: 1200, height: 850, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description: desc, images: [img] },
  };
}

export default async function CertificadoPublico({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const cert = await fetchCert(codigo);

  if (!cert) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-text">Certificado no encontrado</p>
          <p className="mt-2 text-text-muted">El código no corresponde a un certificado válido.</p>
        </div>
      </main>
    );
  }

  const fecha = new Date(cert.fechaEmision + 'T00:00:00').toLocaleDateString('es', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <main className="flex min-h-screen flex-col items-center bg-surface px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* imagen del certificado */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagenUrl(codigo)}
          alt={`Certificado de ${cert.nombreAsistente ?? ''}`}
          className="w-full rounded-xl border border-border-app shadow-lg"
        />

        {/* verificación */}
        <div className="mt-6 rounded-xl border border-border-app bg-surface-2 p-5">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-sm font-semibold text-success">
            <span>✓</span> Certificado verificado
          </div>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Participante</dt>
              <dd className="font-semibold text-text">{cert.nombreAsistente}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Evento</dt>
              <dd className="text-right font-semibold text-text">{cert.tituloEvento}</dd>
            </div>
            {cert.institucion && (
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Organiza</dt>
                <dd className="text-right text-text">{cert.institucion}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Emisión</dt>
              <dd className="text-text">{fecha}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Código</dt>
              <dd className="font-mono text-text">{cert.codigo}</dd>
            </div>
          </dl>
        </div>

        <p className="mt-6 text-center text-xs text-text-muted">
          Verificado por <span className="font-semibold text-brand">ConnectHub</span>
        </p>
      </div>
    </main>
  );
}
