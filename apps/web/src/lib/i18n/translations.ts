/**
 * Punto de entrada histórico de los textos.
 *
 * Los diccionarios ya NO viven aquí: están en `en.ts`, `es.ts`, `fr.ts` y
 * `pt.ts`, y se cargan por separado (ver `dictionaries.ts`). Este módulo se
 * mantiene para no romper los imports existentes y solo reexporta metadatos
 * ligeros — importarlo NO arrastra ningún diccionario al bundle.
 */
export { LANGS, LOCALES, esIdiomaValido } from './types';
export type { Dict, Lang } from './types';
export {
  estaCargado,
  getDict,
  loadDict,
  translateSync,
  translateWith,
} from './dictionaries';
