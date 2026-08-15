'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { useI18n } from '@/lib/i18n';

interface Gafete {
  idCliente: string;
  nombre: string;
  email: string;
  numeroId: string;
  qrToken: string;
  asistio: boolean;
}

/** Un día del evento (GET /eventos/:id/dias) — para la vigencia del carnet */
interface DiaRow {
  FECHA: string;
}

type Plantilla = 'classic' | 'idcard' | 'compact';

const MORADO = '#7e00dd';

/** Comparación sin tildes ni mayúsculas (los nombres llegan en MAYÚSCULAS). */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Iniciales elegantes (no hay foto): primera letra de las dos primeras palabras */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const ini = `${partes[0]?.[0] ?? ''}${partes[1]?.[0] ?? ''}`;
  return (ini || '?').toUpperCase();
}

/** 'YYYY-MM-DD' → fecha corta legible en el locale del panel */
function fechaLegible(f: string, locale: string): string {
  const [y, m, d] = f.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Mini-preview CSS de cada plantilla para el selector */
function MiniPreview({ p }: { p: Plantilla }) {
  if (p === 'idcard') {
    return (
      <span style={{ display: 'flex', flexDirection: 'column', width: 30, height: 44, border: '1px solid #ccc', borderRadius: 4, overflow: 'hidden', background: '#fff' }}>
        <span style={{ height: 8, background: MORADO }} />
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#e9dcf7', margin: '3px auto 0' }} />
        <span style={{ width: 18, height: 3, background: '#bbb', margin: '3px auto 0', borderRadius: 2 }} />
        <span style={{ width: 10, height: 10, background: '#333', margin: '3px auto 0', borderRadius: 1 }} />
      </span>
    );
  }
  if (p === 'compact') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, width: 44, height: 30, border: '1px solid #ccc', borderRadius: 4, padding: 4, background: '#fff' }}>
        <span style={{ width: 16, height: 16, background: '#333', borderRadius: 1, flexShrink: 0 }} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
          <span style={{ height: 4, background: '#888', borderRadius: 2 }} />
          <span style={{ height: 3, background: '#ccc', borderRadius: 2 }} />
        </span>
      </span>
    );
  }
  // classic
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, width: 44, height: 30, border: '1px dashed #ccc', borderRadius: 4, padding: 4, background: '#fff' }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
        <span style={{ width: 8, height: 4, background: MORADO, borderRadius: 1 }} />
        <span style={{ height: 4, background: '#888', borderRadius: 2 }} />
        <span style={{ height: 3, background: '#ccc', borderRadius: 2 }} />
      </span>
      <span style={{ width: 14, height: 14, background: '#333', borderRadius: 1, flexShrink: 0 }} />
    </span>
  );
}

/**
 * Página imprimible de GAFETES del evento: un carné por participante con
 * entrada (nombre + nombre del evento + QR de check-in). Permite BUSCAR
 * (nombre/cédula/correo), SELECCIONAR qué participantes imprimir y ELEGIR
 * la plantilla (Classic / ID Card / Compact) antes de imprimir. Al imprimir
 * solo sale el área de gafetes (nunca el menú del panel) y únicamente los
 * seleccionados — aunque el buscador los tenga ocultos en pantalla.
 */
function GafetesInner() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const params = useSearchParams();
  const idEvento = Number(params.get('ev'));
  const [titulo, setTitulo] = useState('');
  const [items, setItems] = useState<(Gafete & { qrUrl: string })[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [plantilla, setPlantilla] = useState<Plantilla>('classic');
  // vigencia del evento (primer y último día) para el pie del ID Card
  const [vigencia, setVigencia] = useState<{ desde: string; hasta: string } | null>(null);

  const institucion = user?.institucion ?? 'ConnectHub';

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
    // vigencia (best-effort: si falla, el carnet sale sin pie de fechas)
    api
      .get<DiaRow[]>(`/eventos/${idEvento}/dias`)
      .then((ds) => {
        const fechas = ds.map((d) => d.FECHA).filter(Boolean).sort();
        if (fechas.length > 0) {
          setVigencia({ desde: fechas[0], hasta: fechas[fechas.length - 1] });
        }
      })
      .catch(() => undefined);
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

  const textoVigencia = vigencia
    ? vigencia.desde === vigencia.hasta
      ? t('gaf.validOne', { date: fechaLegible(vigencia.desde, locale) })
      : t('gaf.valid', {
          from: fechaLegible(vigencia.desde, locale),
          to: fechaLegible(vigencia.hasta, locale),
        })
    : null;

  /** checkbox de selección superpuesto (común a las 3 plantillas; no se imprime) */
  const checkSel = (g: Gafete) => (
    <span className="no-print" style={{ position: 'absolute', top: 6, right: 6 }}>
      <input
        type="checkbox"
        checked={sel.has(g.idCliente)}
        onChange={() => toggle(g.idCliente)}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 18, height: 18, accentColor: MORADO }}
      />
    </span>
  );

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
            background: sel.size === 0 ? '#c9b3e0' : MORADO,
            color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px',
            fontWeight: 700, cursor: sel.size === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          🖨 {t('gaf.print')} ({sel.size})
        </button>
      </div>

      {/* Selector de plantilla (antes de imprimir; no sale en la impresión) */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px', borderBottom: '1px solid #e5e5e5', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#444' }}>{t('gaf.template')}:</span>
        {(
          [
            ['classic', 'gaf.tplClassic'],
            ['idcard', 'gaf.tplIdCard'],
            ['compact', 'gaf.tplCompact'],
          ] as const
        ).map(([p, key]) => (
          <button
            key={p}
            onClick={() => setPlantilla(p)}
            aria-pressed={plantilla === p}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, background: '#fff',
              border: plantilla === p ? `2px solid ${MORADO}` : '1.5px solid #e5e5e5',
              borderRadius: 10, padding: '6px 12px', cursor: 'pointer',
              fontSize: 13, fontWeight: plantilla === p ? 700 : 500,
              color: plantilla === p ? MORADO : '#444',
            }}
          >
            <MiniPreview p={p} />
            {t(key)}
          </button>
        ))}
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
          const claseGafete = `gafete${marcado ? '' : ' gafete-off'}${visible ? '' : ' oculto-pantalla'}`;

          if (plantilla === 'idcard') {
            // Carnet vertical tipo credencial (proporción CR80 ~54×86mm)
            return (
              <div
                key={g.idCliente}
                className={claseGafete}
                onClick={() => toggle(g.idCliente)}
                style={{
                  width: '5.4cm',
                  height: '8.6cm',
                  border: '1px dashed #999',
                  borderRadius: '0.25cm',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  boxSizing: 'border-box',
                  breakInside: 'avoid',
                  pageBreakInside: 'avoid',
                  position: 'relative',
                  cursor: 'pointer',
                }}
              >
                {checkSel(g)}
                <div
                  style={{
                    background: MORADO,
                    color: '#fff',
                    padding: '0.22cm 0.25cm',
                    textAlign: 'center',
                    fontWeight: 800,
                    fontSize: '0.28cm',
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    lineHeight: 1.2,
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact',
                  }}
                >
                  {institucion}
                </div>
                <div
                  style={{
                    margin: '0.32cm auto 0',
                    width: '1.9cm',
                    height: '1.9cm',
                    borderRadius: '50%',
                    background: '#f1e8fb',
                    color: MORADO,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7cm',
                    fontWeight: 800,
                    letterSpacing: 1,
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact',
                  }}
                >
                  {iniciales(g.nombre)}
                </div>
                <div style={{ padding: '0.18cm 0.3cm 0', textAlign: 'center', fontWeight: 800, fontSize: '0.4cm', lineHeight: 1.15, wordBreak: 'break-word' }}>
                  {g.nombre}
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.26cm', color: '#555', padding: '0.08cm 0.3cm 0', lineHeight: 1.2 }}>
                  {titulo}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.qrUrl} alt={`QR ${g.nombre}`} style={{ width: '2.3cm', height: '2.3cm', margin: 'auto auto 0', display: 'block' }} />
                <div style={{ textAlign: 'center', fontSize: '0.23cm', color: '#777', padding: '0.12cm 0.2cm 0.22cm' }}>
                  {textoVigencia ?? ''}
                </div>
              </div>
            );
          }

          if (plantilla === 'compact') {
            // Etiqueta horizontal sin adornos: QR a la izquierda, texto a la derecha
            return (
              <div
                key={g.idCliente}
                className={claseGafete}
                onClick={() => toggle(g.idCliente)}
                style={{
                  width: '8.6cm',
                  height: '5.4cm',
                  border: '1px dashed #999',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35cm',
                  padding: '0.35cm',
                  boxSizing: 'border-box',
                  breakInside: 'avoid',
                  pageBreakInside: 'avoid',
                  position: 'relative',
                  cursor: 'pointer',
                }}
              >
                {checkSel(g)}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.qrUrl} alt={`QR ${g.nombre}`} style={{ width: '3.2cm', height: '3.2cm', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.12cm' }}>
                  <div style={{ fontSize: '0.5cm', fontWeight: 800, lineHeight: 1.15, wordBreak: 'break-word' }}>{g.nombre}</div>
                  <div style={{ fontSize: '0.3cm', color: '#444', lineHeight: 1.2 }}>{titulo}</div>
                </div>
              </div>
            );
          }

          // Classic: la plantilla original, sin cambios
          return (
            <div
              key={g.idCliente}
              className={claseGafete}
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
              {checkSel(g)}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.15cm' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: MORADO, display: 'inline-block' }} />
                  <span style={{ fontSize: '0.28cm', fontWeight: 700, color: MORADO, letterSpacing: 0.5 }}>ConnectHub</span>
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
            /* colores de marca (banda morada / círculo de iniciales) sí se imprimen */
            .gafete, .gafete * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
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
