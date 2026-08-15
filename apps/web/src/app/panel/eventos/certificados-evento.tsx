'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { useDialogo } from '@/lib/dialogo';
import { useI18n } from '@/lib/i18n';

interface OverlayCampo {
  x: number;
  y: number;
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
  weight?: 'normal' | 'bold';
}

/** Campos parametrizables del certificado (todos OPCIONALES). */
type CampoKey = 'nombre' | 'evento' | 'fecha' | 'tipo' | 'hora' | 'institucion' | 'codigo';
type Config = Partial<Record<CampoKey, OverlayCampo>>;

interface Asistente {
  idCliente: string;
  idEventoUsuario: number;
  nombre: string;
  email: string;
  asistio: boolean;
  certificadoCodigo: string | null;
}

/** Metadatos de cada campo: CLAVE i18n de la etiqueta, clave (o literal) del
 * texto de ejemplo del preview y default. t() devuelve la clave tal cual si no
 * existe, así que los ejemplos neutrales ('09:00 - 17:00') van como literales. */
const CAMPOS: { key: CampoKey; label: string; sample: string; def: OverlayCampo }[] = [
  { key: 'nombre', label: 'ct.name', sample: 'ct.sNombre', def: { x: 0.5, y: 0.46, size: 0.06, color: '#1e293b', align: 'center', weight: 'bold' } },
  { key: 'evento', label: 'ct.fEvento', sample: 'ct.sEvento', def: { x: 0.5, y: 0.6, size: 0.035, color: '#334155', align: 'center' } },
  { key: 'fecha', label: 'ct.fFecha', sample: 'ct.sFecha', def: { x: 0.5, y: 0.72, size: 0.028, color: '#334155', align: 'center' } },
  { key: 'tipo', label: 'ct.fTipo', sample: 'ct.sTipo', def: { x: 0.5, y: 0.34, size: 0.03, color: '#64748b', align: 'center' } },
  { key: 'hora', label: 'ct.fHora', sample: '09:00 - 17:00', def: { x: 0.5, y: 0.78, size: 0.024, color: '#64748b', align: 'center' } },
  { key: 'institucion', label: 'ct.fInst', sample: 'ct.sInst', def: { x: 0.5, y: 0.84, size: 0.024, color: '#64748b', align: 'center' } },
  { key: 'codigo', label: 'ct.fCodigo', sample: 'CERT-XXXXXX', def: { x: 0.5, y: 0.92, size: 0.02, color: '#94a3b8', align: 'center' } },
];
const META: Record<CampoKey, (typeof CAMPOS)[number]> = Object.fromEntries(CAMPOS.map((c) => [c.key, c])) as Record<
  CampoKey,
  (typeof CAMPOS)[number]
>;

// Config inicial: los 3 campos "core" activados por defecto.
const DEF: Config = {
  nombre: META.nombre.def,
  evento: META.evento.def,
  fecha: META.fecha.def,
};

/** Gestión de certificados por evento: plantilla-imagen + overlay parametrizable + generación en lote. */
export function CertificadosEvento({ idEvento, tituloEvento }: { idEvento: number; tituloEvento: string }) {
  const { t } = useI18n();
  const dialogo = useDialogo();
  const [config, setConfig] = useState<Config>(DEF);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [asistentes, setAsistentes] = useState<Asistente[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<CampoKey | null>(null);
  const [phPx, setPhPx] = useState(0);
  // Ratio REAL de la plantilla (ancho/alto). El preview debe usar el ratio de la
  // imagen — no uno fijo — para que `background: contain` la llene sin barras
  // (letterbox). Con barras, las fracciones del editor dejan de coincidir con las
  // del PNG y el texto se descuadra. Default A4-horizontal hasta que cargue la imagen.
  const [ratio, setRatio] = useState(1.414);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    const p = await api
      .get<{ tienePlantilla: boolean; config: Config | null }>(`/eventos/${idEvento}/certificados/plantilla`)
      .catch(() => null);
    if (p?.config && Object.keys(p.config).length) {
      // Normaliza cada campo guardado sobre su default (por si faltan props).
      const next: Config = {};
      for (const c of CAMPOS) {
        const saved = p.config[c.key];
        if (saved) next[c.key] = { ...c.def, ...saved };
      }
      setConfig(next);
    }
    if (p?.tienePlantilla) {
      try {
        const b = await api.blob(`/eventos/${idEvento}/certificados/plantilla/imagen`);
        setBlob(b);
        setPreview(URL.createObjectURL(b));
      } catch {
        /* sin plantilla */
      }
    }
    setAsistentes(await api.get<Asistente[]>(`/eventos/${idEvento}/certificados/asistentes`).catch(() => []));
  }, [idEvento]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // mide la altura renderizada del preview para escalar el texto (size = fracción del alto)
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setPhPx(entries[0].contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [preview]);

  // Lee las dimensiones naturales de la plantilla → ratio real del contenedor.
  // Así el editor mapea (x,y) 1:1 con el PNG del servidor (mismo ratio, sin barras).
  useEffect(() => {
    if (!preview) return;
    const img = new window.Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight);
    };
    img.src = preview;
  }, [preview]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBlob(f);
    setPreview(URL.createObjectURL(f));
    setMsg(null);
  }

  async function guardar() {
    if (!blob) {
      setMsg(t('ct.uploadFirst'));
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append('file', blob, 'plantilla.png');
      form.append('config', JSON.stringify(config));
      await api.upload(`/eventos/${idEvento}/certificados/plantilla`, form);
      setMsg(t('ct.saved'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('c.error'));
    } finally {
      setBusy(false);
    }
  }

  function onMove(e: React.MouseEvent) {
    if (!drag || !previewRef.current) return;
    const r = previewRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setConfig((c) => (c[drag] ? { ...c, [drag]: { ...c[drag]!, x, y } } : c));
  }

  function setCampo(k: CampoKey, patch: Partial<OverlayCampo>) {
    setConfig((c) => (c[k] ? { ...c, [k]: { ...c[k]!, ...patch } } : c));
  }

  function toggleCampo(k: CampoKey) {
    setConfig((c) => {
      const next = { ...c };
      if (next[k]) delete next[k];
      else next[k] = { ...META[k].def };
      return next;
    });
  }

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allSel = asistentes.length > 0 && sel.size === asistentes.length;
  const toggleAll = () => setSel(allSel ? new Set() : new Set(asistentes.map((a) => a.idCliente)));

  async function generar() {
    setBusy(true);
    setMsg(null);
    try {
      const ids = sel.size ? [...sel] : undefined; // vacío → backend genera para todos los que asistieron
      const res = await api.post<{ generados: number; total: number }>(
        `/eventos/${idEvento}/certificados/generar`,
        ids ? { idsClientes: ids } : {},
      );
      setMsg(t('ct.generated', { n: res.generados, total: res.total }));
      setSel(new Set());
      await cargar();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('c.error'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Asistencia MANUAL (respaldo si falla el lector de QR).
   * `ids` presente = acción sobre una sola fila (sin confirmación);
   * ausente = acción en lote sobre la selección (desmarcar sí confirma).
   * No toca certificados: desmarcar no borra uno ya emitido.
   */
  async function marcarAsistencia(asistio: boolean, ids?: string[]) {
    const objetivo = ids ?? [...sel];
    if (objetivo.length === 0 || busy) return;
    if (!asistio && !ids) {
      const confirmado = await dialogo.confirmar({
        titulo: t('ct.confirmUnattendTitle', { n: objetivo.length }),
        mensaje: t('ct.confirmUnattend'),
        tono: 'info',
        confirmar: t('ct.markNotAttended'),
      });
      if (!confirmado) return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ actualizados: number }>(
        `/eventos/${idEvento}/asistencia`,
        { idsClientes: objetivo, asistio },
      );
      setMsg(t('ct.attendanceOk', { n: res.actualizados }));
      if (!ids) setSel(new Set());
      await cargar();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('c.error'));
    } finally {
      setBusy(false);
    }
  }

  function sampleLabel(k: CampoKey): string {
    if (k === 'evento') return tituloEvento || t(META.evento.sample);
    return t(META[k].sample);
  }

  const activos = CAMPOS.filter((c) => config[c.key]);

  return (
    <div className="rounded-lg border border-border-app bg-surface-2 p-3 sm:col-span-2 lg:col-span-3">
      <p className="mb-2 text-sm font-semibold text-text">{t('ct.title')}</p>
      <p className="mb-3 text-xs text-text-muted">{t('ct.help')}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Editor de plantilla */}
        <div>
          <label className="inline-block cursor-pointer rounded-lg border border-border-app bg-surface px-3 py-2 text-sm text-text hover:border-brand">
            {preview ? t('ct.changeTemplate') : t('ct.uploadTemplate')}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} className="hidden" />
          </label>

          {preview ? (
            <>
              {/* Selector de campos a incluir */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CAMPOS.map((c) => {
                  const on = !!config[c.key];
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => toggleCampo(c.key)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        on
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-border-app bg-surface text-text-muted hover:border-brand'
                      }`}
                    >
                      {on ? '✓ ' : '+ '}
                      {t(c.label)}
                    </button>
                  );
                })}
              </div>

              <div
                ref={previewRef}
                onMouseMove={onMove}
                onMouseUp={() => setDrag(null)}
                onMouseLeave={() => setDrag(null)}
                className="relative mt-2 select-none overflow-hidden rounded-lg border border-border-app"
                style={{ background: `#f8fafc url(${preview}) center/contain no-repeat`, aspectRatio: `${ratio} / 1` }}
              >
                {activos.map((c) => {
                  const cfg = config[c.key]!;
                  return (
                    <div
                      key={c.key}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setDrag(c.key);
                      }}
                      style={{
                        position: 'absolute',
                        left: `${cfg.x * 100}%`,
                        top: `${cfg.y * 100}%`,
                        transform: 'translate(-50%,-50%)',
                        color: cfg.color,
                        // misma familia que el render del servidor (Liberation≈Arial) → mismos anchos
                        fontFamily: "'Liberation Sans', Arial, Helvetica, sans-serif",
                        fontSize: phPx ? `${cfg.size * phPx}px` : '16px',
                        fontWeight: cfg.weight === 'bold' ? 700 : 400,
                        whiteSpace: 'nowrap',
                        cursor: 'move',
                        textShadow: '0 0 2px rgba(255,255,255,.4)',
                      }}
                    >
                      {sampleLabel(c.key)}
                    </div>
                  );
                })}
              </div>

              {/* controles por campo activo */}
              {activos.map((c) => {
                const cfg = config[c.key]!;
                return (
                  <div key={c.key} className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <span className="w-24 font-semibold text-text">{t(c.label)}</span>
                    <label className="flex items-center gap-1">
                      {t('ct.size')}
                      <input
                        type="range"
                        min={1.5}
                        max={12}
                        step={0.5}
                        value={cfg.size * 100}
                        onChange={(e) => setCampo(c.key, { size: Number(e.target.value) / 100 })}
                      />
                    </label>
                    <input
                      type="color"
                      aria-label={`${t('ct.color')} ${t(c.label)}`}
                      value={cfg.color}
                      onChange={(e) => setCampo(c.key, { color: e.target.value })}
                      className="h-7 w-10 rounded border border-border-app"
                    />
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={cfg.weight === 'bold'}
                        onChange={(e) => setCampo(c.key, { weight: e.target.checked ? 'bold' : 'normal' })}
                      />
                      {t('ct.bold')}
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleCampo(c.key)}
                      className="ml-auto text-text-muted hover:text-red-500"
                      aria-label={`${t('ct.remove')} ${t(c.label)}`}
                    >
                      {t('ct.remove')}
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={guardar}
                disabled={busy}
                className="mt-3 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? t('c.saving') : t('ct.saveTemplate')}
              </button>
            </>
          ) : (
            <p className="mt-2 text-xs text-text-muted">{t('ct.noTemplate')}</p>
          )}
        </div>

        {/* Asistentes + generar */}
        <div>
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <div>
              <span className="text-sm font-semibold text-text">{t('ct.attendees', { n: asistentes.length })}</span>
              <p className="text-xs text-text-muted">{t('ct.attendanceHint')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Asistencia manual en lote sobre los seleccionados */}
              <button
                type="button"
                onClick={() => marcarAsistencia(true)}
                disabled={busy || sel.size === 0}
                title={sel.size === 0 ? t('ct.selectFirst') : undefined}
                className="rounded-lg bg-success/15 px-3 py-1.5 text-sm font-semibold text-success hover:bg-success/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('ct.markAttended')}
              </button>
              <button
                type="button"
                onClick={() => marcarAsistencia(false)}
                disabled={busy || sel.size === 0}
                title={sel.size === 0 ? t('ct.selectFirst') : undefined}
                className="rounded-lg border border-border-app px-3 py-1.5 text-sm font-semibold text-text-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('ct.markNotAttended')}
              </button>
              {/* Gafetes imprimibles (nombre + QR de check-in) para entregar en el evento */}
              <a
                href={`/panel/eventos/gafetes?ev=${idEvento}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-border-app px-3 py-1.5 text-sm font-semibold text-text hover:bg-surface-2"
              >
                {t('ct.printBadges')}
              </a>
              <button
                type="button"
                onClick={generar}
                disabled={busy || asistentes.length === 0}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {sel.size ? t('ct.generateN', { n: sel.size }) : t('ct.generateAll')}
              </button>
            </div>
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-border-app">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface-2 text-xs text-text-muted">
                <tr>
                  <th className="p-2">
                    <input type="checkbox" checked={allSel} onChange={toggleAll} aria-label={t('gaf.selectAll')} />
                  </th>
                  <th className="p-2">{t('ct.name')}</th>
                  <th className="p-2">{t('ct.attended')}</th>
                  <th className="p-2">{t('ct.certCol')}</th>
                </tr>
              </thead>
              <tbody>
                {asistentes.map((a) => (
                  <tr key={a.idCliente} className="border-t border-border-app">
                    <td className="p-2">
                      <input type="checkbox" checked={sel.has(a.idCliente)} onChange={() => toggle(a.idCliente)} aria-label={a.nombre} />
                    </td>
                    <td className="p-2">
                      <div className="text-text">{a.nombre}</div>
                      <div className="text-xs text-text-muted">{a.email}</div>
                    </td>
                    <td className="p-2">
                      {/* toggle individual: marca/desmarca solo a esta persona */}
                      <button
                        type="button"
                        onClick={() => marcarAsistencia(!a.asistio, [a.idCliente])}
                        disabled={busy}
                        title={a.asistio ? t('ct.markNotAttended') : t('ct.markAttended')}
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          a.asistio
                            ? 'bg-success/10 text-success hover:bg-success/20'
                            : 'bg-surface-2 text-text-muted hover:bg-surface'
                        }`}
                      >
                        {a.asistio ? `✓ ${t('ct.yes')}` : t('ct.no')}
                      </button>
                    </td>
                    <td className="p-2">{a.certificadoCodigo ? '🎓' : '—'}</td>
                  </tr>
                ))}
                {asistentes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-3 text-center text-xs text-text-muted">
                      {t('ct.noAttendees')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {msg && <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm text-text">{msg}</p>}
    </div>
  );
}
