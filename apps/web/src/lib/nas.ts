const NAS_URL =
  process.env.NEXT_PUBLIC_NAS_URL ?? 'https://api-ligaprocorp.ec:3443/api';

/**
 * URL pública de la imagen activa en el NAS de archivos.
 * `version` fuerza recarga tras subir una imagen nueva (rompe caché del navegador).
 */
export type NasEntidad =
  | 'EVENTO'
  | 'INSTITUCION'
  | 'LOCAL'
  | 'SALON'
  | 'SUBSALON'
  | 'CONFIGURACION';

export function nasImagenUrl(
  tipoEntidad: NasEntidad,
  id: number,
  tipoArchivo: 'PORTADA' | 'BANNER' | 'GALERIA' | 'LOGO' | 'CROQUIS' = 'PORTADA',
  version?: number,
): string {
  return (
    `${NAS_URL}/archivos/activo?tipoEntidad=${tipoEntidad}&id=${id}` +
    `&tipoArchivo=${tipoArchivo}${version ? `&v=${version}` : ''}`
  );
}
