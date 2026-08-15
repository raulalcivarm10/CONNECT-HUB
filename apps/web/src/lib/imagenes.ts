import { translateSync } from './i18n/translations';

/** Reglas de imágenes (mantener en sincronía con la API: multipart.util.ts) */
export const MAX_IMAGEN_MB = 25;

const MIMES_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
const EXTENSIONES = ['.png', '.jpg', '.jpeg', '.webp'];

/**
 * Traducción fuera de React (los hooks usan useI18n). Resuelve el idioma
 * activo desde localStorage y usa el diccionario ya cargado; si todavía no
 * llegó, cae a inglés.
 */
function tt(key: string, vars?: Record<string, string | number>): string {
  return translateSync(key, vars);
}

/** leyenda de formatos permitidos, en el idioma activo */
export function FORMATOS_LEYENDA(): string {
  return tt('img.legend', { mb: MAX_IMAGEN_MB });
}

/**
 * Valida tipo y tamaño ANTES de subir. Devuelve un mensaje amigable en el
 * idioma activo si el archivo no cumple, o null si está OK.
 */
export function validarImagen(file: File): string | null {
  const nombre = file.name.toLowerCase();
  const extensionOk = EXTENSIONES.some((ext) => nombre.endsWith(ext));
  if (!MIMES_PERMITIDOS.includes(file.type) && !extensionOk) {
    return tt('img.badType', { file: file.name });
  }
  if (file.size > MAX_IMAGEN_MB * 1024 * 1024) {
    return tt('img.tooBig', {
      size: (file.size / 1024 / 1024).toFixed(1),
      mb: MAX_IMAGEN_MB,
    });
  }
  return null;
}
