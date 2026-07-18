'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { api } from '@/lib/api/client';

interface Gafete {
  idCliente: string;
  nombre: string;
  qrToken: string;
  asistio: boolean;
}

/**
 * Página imprimible de GAFETES del evento: un carné por participante con
 * entrada (nombre + nombre del evento + QR de check-in). Se abre desde el
 * detalle del evento y se manda directo a la impresora (tipo credencial,
 * bordes punteados para cortar). El QR es el mismo del ticket → sirve para
 * escanear la asistencia en la puerta.
 */
function GafetesInner() {
  const params = useSearchParams();
  const idEvento = Number(params.get('ev'));
  const [titulo, setTitulo] = useState('');
  const [items, setItems] = useState<(Gafete & { qrUrl: string })[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');

  useEffect(() => {
    if (!idEvento) { setEstado('error'); return; }
    (async () => {
      try {
        const res = await api.get<{ titulo: string | null; asistentes: Gafete[] }>(`/eventos/${idEvento}/gafetes`);
        setTitulo(res.titulo ?? '');
        const conQr = await Promise.all(
          res.asistentes.map(async (a) => ({
            ...a,
            qrUrl: await QRCode.toDataURL(a.qrToken, { margin: 0, width: 300 }),
          })),
        );
        setItems(conQr);
        setEstado('ok');
      } catch {
        setEstado('error');
      }
    })();
  }, [idEvento]);

  if (estado === 'cargando') return <p style={{ padding: 32 }}>Cargando gafetes…</p>;
  if (estado === 'error') return <p style={{ padding: 32 }}>No se pudo cargar el listado. Verifica tu sesión del panel.</p>;

  return (
    <div style={{ background: '#fff', minHeight: '100vh', color: '#111' }}>
      {/* Controles (no salen en la impresión) */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid #e5e5e5' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Gafetes · {titulo}</div>
          <div style={{ color: '#666', fontSize: 13 }}>{items.length} participante(s) con entrada — corta por la línea punteada</div>
        </div>
        <button
          onClick={() => window.print()}
          style={{ background: '#7e00dd', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}
        >
          🖨 Imprimir
        </button>
      </div>

      {/* Grilla de gafetes */}
      <div style={{ display: 'flex', flexWrap: 'wrap', padding: 16, gap: 0 }}>
        {items.map((g) => (
          <div
            key={g.idCliente}
            className="gafete"
            style={{
              width: '9cm',
              height: '5.5cm',
              border: '1px dashed #999',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4cm',
              padding: '0.45cm',
              boxSizing: 'border-box',
              breakInside: 'avoid',
              pageBreakInside: 'avoid',
            }}
          >
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.15cm' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: '#7e00dd', display: 'inline-block' }} />
                <span style={{ fontSize: '0.28cm', fontWeight: 700, color: '#7e00dd', letterSpacing: 0.5 }}>ConnectHub</span>
              </div>
              <div style={{ fontSize: '0.55cm', fontWeight: 800, lineHeight: 1.15, wordBreak: 'break-word' }}>{g.nombre}</div>
              <div style={{ fontSize: '0.3cm', color: '#444', lineHeight: 1.2 }}>{titulo}</div>
            </div>
            {/* QR de check-in (el mismo del ticket) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.qrUrl} alt={`QR ${g.nombre}`} style={{ width: '3.4cm', height: '3.4cm', flexShrink: 0 }} />
          </div>
        ))}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `@media print {
            .no-print { display: none !important; }
            body { background: #fff !important; }
            @page { margin: 0.8cm; }
          }`,
        }}
      />
    </div>
  );
}

export default function GafetesPage() {
  return (
    <Suspense fallback={<p style={{ padding: 32 }}>Cargando…</p>}>
      <GafetesInner />
    </Suspense>
  );
}
