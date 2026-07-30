const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * URL de la imagen activa, SIEMPRE a través de NUESTRO API:
 *  - CONFIGURACION → se guarda en nuestra BD (el NAS no soporta esa entidad).
 *  - Resto → proxy con caché Redis del NAS (/archivos/proxy): mucho más rápido
 *    y sigue sirviendo aunque el NAS ande lento o caído.
 * `version` fuerza recarga tras subir una imagen nueva (rompe caché del navegador).
 */
export type NasEntidad =
  | 'EVENTO'
  | 'INSTITUCION'
  | 'LOCAL'
  | 'SALON'
  | 'SUBSALON'
  | 'CONFIGURACION'
  | 'EXPOSITOR';

export function nasImagenUrl(
  tipoEntidad: NasEntidad,
  id: number,
  tipoArchivo:
    | 'PORTADA'
    | 'BANNER'
    | 'GALERIA'
    | 'LOGO'
    | 'CROQUIS'
    | 'FOTO' = 'PORTADA',
  version?: number,
): string {
  if (tipoEntidad === 'CONFIGURACION') {
    return `${API_URL}/configuraciones/${id}/imagen${version ? `?v=${version}` : ''}`;
  }
  return (
    `${API_URL}/archivos/proxy?tipoEntidad=${tipoEntidad}&id=${id}` +
    `&tipoArchivo=${tipoArchivo}${version ? `&v=${version}` : ''}`
  );
}
