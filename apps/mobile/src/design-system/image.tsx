import { Image, type ImageProps } from 'expo-image';

/**
 * Blurhash neutro (gris azulado). Sirve como primer frame visible en las
 * imágenes de contenido (portadas), para que la tarjeta nunca quede en blanco
 * mientras la imagen viaja por la red.
 */
export const IMAGE_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

/** Placeholder por defecto para imágenes de contenido (portadas de evento). */
export const IMAGE_PLACEHOLDER = { blurhash: IMAGE_BLURHASH } as const;

/**
 * Política de caché de la app.
 *
 * expo-image (SDK 57) usa `'disk'` POR DEFECTO. En iOS eso se traduce a
 * SDWebImage con `queryCacheType = storeCacheType = .disk`, es decir: la caché
 * en memoria se salta por completo. Cada vez que una imagen vuelve a aparecer
 * (scroll, reciclaje de fila en la FlatList, volver del detalle al Home) hay
 * otra lectura de disco + decodificación en cada aparición.
 *
 * `'memory-disk'` mantiene la persistencia entre arranques (disco) y además
 * evita ese trabajo repetido dentro de la sesión (memoria). Es lo que hace que
 * el `Cache-Control` del proxy del servidor no se desperdicie.
 */
export const IMAGE_CACHE_POLICY = 'memory-disk' as const;

/**
 * `expo-image` con los defaults de la app: caché en memoria + disco y una
 * transición corta. Todo se puede sobreescribir por props (el spread va al
 * final). `placeholder` NO se fuerza: las fotos de personas y los logos se ven
 * mejor sobre un color plano, y las portadas pasan `IMAGE_PLACEHOLDER`.
 */
export function AppImage(props: ImageProps) {
  return <Image cachePolicy={IMAGE_CACHE_POLICY} transition={200} {...props} />;
}

/**
 * Precarga acotada (fire-and-forget) para imágenes que aún NO están montadas.
 * Deduplica y corta en `limit`: precargar de más compite por red y memoria con
 * lo que el usuario sí está mirando.
 */
export function prefetchImages(urls: (string | null | undefined)[], limit = 4): void {
  const list = Array.from(new Set(urls.filter((u): u is string => !!u))).slice(0, limit);
  if (!list.length) return;
  void Image.prefetch(list, { cachePolicy: IMAGE_CACHE_POLICY }).catch(() => {});
}
