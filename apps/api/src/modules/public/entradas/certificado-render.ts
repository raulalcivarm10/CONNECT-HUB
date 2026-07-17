import sharp from 'sharp';

/** Posición/estilo de un texto del overlay, en FRACCIONES de la imagen. */
export interface OverlayCampo {
  /** 0..1 fracción del ancho (punto de anclaje horizontal). */
  x: number;
  /** 0..1 fracción del alto (línea base del texto). */
  y: number;
  /** Font-size como fracción del alto (p.ej. 0.06 = 6% del alto). */
  size: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  weight?: 'normal' | 'bold';
}

/** Campos de datos que puede llevar un certificado (todos OPCIONALES). */
export type CampoCert = 'nombre' | 'evento' | 'fecha' | 'tipo' | 'hora' | 'institucion' | 'codigo';
export const CAMPOS_CERT: CampoCert[] = ['nombre', 'evento', 'fecha', 'tipo', 'hora', 'institucion', 'codigo'];

/** Overlay: posición/estilo por campo. Solo se dibujan los campos presentes. */
export type CertOverlayConfig = Partial<Record<CampoCert, OverlayCampo>>;

// Config por defecto si el evento aún no guardó una (los 3 core, centrados).
const DEF: CertOverlayConfig = {
  nombre: { x: 0.5, y: 0.46, size: 0.06, color: '#1e293b', align: 'center', weight: 'bold' },
  evento: { x: 0.5, y: 0.6, size: 0.035, color: '#334155', align: 'center' },
  fecha: { x: 0.5, y: 0.72, size: 0.028, color: '#334155', align: 'center' },
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textSvg(campo: OverlayCampo, texto: string, W: number, H: number): string {
  const x = Math.round(campo.x * W);
  const y = Math.round(campo.y * H);
  const fs = Math.max(8, Math.round(campo.size * H));
  const anchor = campo.align === 'left' ? 'start' : campo.align === 'right' ? 'end' : 'middle';
  const fill = campo.color ?? '#1e293b';
  const weight = campo.weight === 'bold' ? '700' : '400';
  // La `y` del SVG es la LÍNEA BASE, pero el editor del panel centra el texto
  // verticalmente en (x,y) (translate -50%). Bajamos la baseline ~0.35em para
  // que el CENTRO visual del glifo caiga en campo.y → WYSIWYG con el panel.
  // Se usa px (no "em") porque librsvg no siempre resuelve unidades em en dy.
  const dy = Math.round(fs * 0.35);
  // Liberation Sans (instalada en la imagen) es métricamente compatible con
  // Arial, que es lo que el panel muestra en el navegador del admin → mismos
  // anchos de glifo en ambos lados. Sin esta fuente, Arial cae a DejaVu (más ancho).
  return `<text x="${x}" y="${y}" dy="${dy}" font-family="'Liberation Sans', Arial, Helvetica, sans-serif" font-size="${fs}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(texto)}</text>`;
}

/**
 * Compone el certificado: sobre la imagen plantilla escribe el nombre del
 * participante y el título del evento según `config` (o defaults centrados).
 * Devuelve un PNG. Resolución-independiente (coords en fracciones).
 */
/**
 * Compone el certificado: por cada campo presente en `config` con un valor en
 * `datos`, escribe el texto en su posición. Los campos ausentes (o sin dato) no
 * se dibujan → el overlay es totalmente parametrizable por evento.
 */
export async function renderCertificado(
  plantilla: Buffer,
  config: CertOverlayConfig | null,
  datos: Partial<Record<CampoCert, string>>,
): Promise<Buffer> {
  const base = sharp(plantilla);
  const meta = await base.metadata();
  const W = meta.width ?? 1000;
  const H = meta.height ?? 700;
  const cfg = config && Object.keys(config).length ? config : DEF;
  const partes = CAMPOS_CERT.map((k) => {
    const campo = cfg[k];
    const texto = datos[k];
    return campo && texto ? textSvg(campo, texto, W, H) : '';
  }).join('');
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${partes}</svg>`;
  return base
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
