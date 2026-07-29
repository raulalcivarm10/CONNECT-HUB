'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { api } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n';

interface Gafete {
  idCliente: string;
  nombre: string;
  email: string;
  numeroId: string;
  qrToken: string;
  asistio: boolean;
}

/** Comparación sin tildes ni mayúsculas (los nombres llegan en MAYÚSCULAS). */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Página imprimible de GAFETES del evento: un carné por participante con
 * entrada (nombre + nombre del evento + QR de check-in). Permite BUSCAR
 * (nombre/cédula/correo) y SELECCIONAR qué participantes imprimir. Al imprimir
 * solo sale el área de gafetes (nunca el menú del panel) y únicamente los
 * seleccionados — aunque el buscador los tenga ocultos en pantalla.
 */
function GafetesInner() {
  const { t } = useI18n();
  const params = useSearchParams();
  const idEvento = Number(params.get('ev'));
  const [titulo, setTitulo] = useState('');
  const [items, setItems] = useState<(Gafete & { qrUrl: string })[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');

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
        setSel(new Set(conQr.map((g) => g.idCliente))); // por defecto: todos
        setEstado('ok');
      } catch {
        setEstado('error');
      }
    })();
  }, [idEvento]);

  // Filtro de búsqueda: solo afecta la VISIBILIDAD en pantalla, nunca lo impreso.
  const filtrados = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return items;
    return items.filter(
      (g) => norm(g.nombre).includes(n) || norm(g.email ?? '').includes(n) || norm(g.numeroId ?? '').includes(n),
    );
  }, [items, q]);
  const visibles = useMemo(() => new Set(filtrados.map((g) => g.idCliente)), [filtrados]);

  const toggle = (id: string) =>
    setSel((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  const allSel = filtrados.length > 0 && filtrados.every((g) => sel.has(g.idCliente));
  const toggleAll = () =>
    setSel((prev) => {
      const s = new Set(prev);
      for (const g of filtrados) {
        if (allSel) s.delete(g.idCliente);
        else s.add(g.idCliente);
      }
      return s;
    });

  if (estado === 'cargando') return <p style={{ padding: 32 }}>{t('gaf.loading')}</p>;
  if (estado === 'error') return <p style={{ padding: 32 }}>{t('gaf.error')}</p>;

  return (
    <div style={{ background: '#fff', minHeight: '100vh', color: '#111' }}>
      {/* Controles (no salen en la impresión) */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid #e5e5e5', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{t('gaf.title')} · {titulo}</div>
          <div style={{ color: '#666', fontSize: 13 }}>
            {t('gaf.count', { sel: sel.size, total: items.length })}
          </div>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('gaf.search')}
          style={{ border: '1.5px solid #e5e5e5', borderRadius: 10, padding: '10px 14px', fontSize: 14, minWidth: 260 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#444', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={allSel} onChange={toggleAll} style={{ width: 16, height: 16 }} />
          {t('gaf.selectAll')}
        </label>
        <button
          onClick={() => window.print()}
          disabled={sel.size === 0}
          style={{
            background: sel.size === 0 ? '#c9b3e0' : '#7e00dd',
            color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px',
            fontWeight: 700, cursor: sel.size === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          🖨 {t('gaf.print')} ({sel.size})
        </button>
      </div>

      {/* Grilla de gafetes — SIEMPRE renderiza todos: el buscador solo oculta en
          pantalla (.oculto-pantalla) y la selección decide qué se imprime
          (.gafete-off se excluye de la impresión). */}
      <div className="gafetes-print-area" style={{ display: 'flex', flexWrap: 'wrap', padding: 16, gap: 0 }}>
        {filtrados.length === 0 ? (
          <p className="no-print" style={{ color: '#888', padding: 16 }}>{t('gaf.noMatch')}</p>
        ) : null}
        {items.map((g) => {
          const marcado = sel.has(g.idCliente);
          const visible = visibles.has(g.idCliente);
          return (
            <div
              key={g.idCliente}
              className={`gafete${marcado ? '' : ' gafete-off'}${visible ? '' : ' oculto-pantalla'}`}
              onClick={() => toggle(g.idCliente)}
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
                position: 'relative',
                cursor: 'pointer',
              }}
            >
              <span className="no-print" style={{ position: 'absolute', top: 6, right: 6 }}>
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => toggle(g.idCliente)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: 18, height: 18, accentColor: '#7e00dd' }}
                />
              </span>
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
          );
        })}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media screen {
            .gafete-off { opacity: 0.35; }
            .oculto-pantalla { display: none !important; }
          }
          @media print {
            /* SOLO se imprime el área de gafetes: el resto del panel (menú
               lateral, cabecera, controles) queda oculto. */
            body * { visibility: hidden !important; }
            .gafetes-print-area, .gafetes-print-area * { visibility: visible !important; }
            .gafetes-print-area { position: absolute !important; left: 0; top: 0; width: 100%; padding: 0 !important; overflow: visible !important; }
            main, .gafetes-print-area { overflow: visible !important; height: auto !important; }
            .no-print { display: none !important; }
            .gafete-off { display: none !important; }
            .gafete { opacity: 1 !important; cursor: default; }
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
    <Suspense fallback={<p style={{ padding: 32 }}>…</p>}>
      <GafetesInner />
    </Suspense>
  );
}
