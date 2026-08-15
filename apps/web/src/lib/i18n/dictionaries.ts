import en from './en';
import { esIdiomaValido, type Dict, type Lang } from './types';

/**
 * Carga de diccionarios por idioma.
 *
 * `en` es el idioma por defecto y el fallback de toda clave, así que se importa
 * de forma estática: nunca hay un instante en el que `t()` devuelva la clave
 * cruda. Los otros tres se piden con `import()` dinámico y quedan en su propio
 * chunk, de modo que el usuario solo descarga el idioma que usa.
 */

const CARGADORES: Record<Lang, () => Promise<{ default: Dict }>> = {
  en: () => Promise.resolve({ default: en }),
  es: () => import('./es'),
  fr: () => import('./fr'),
  pt: () => import('./pt'),
};

const cargados: Partial<Record<Lang, Dict>> = { en };
const enVuelo: Partial<Record<Lang, Promise<Dict>>> = {};

/** true si el diccionario ya está en memoria (no hace falta esperar). */
export function estaCargado(lang: Lang): boolean {
  return cargados[lang] !== undefined;
}

/** Diccionario ya cargado; si aún no llega, el inglés como respaldo. */
export function getDict(lang: Lang): Dict {
  return cargados[lang] ?? en;
}

/** Carga el diccionario (una sola vez por idioma) y lo deja en caché. */
export function loadDict(lang: Lang): Promise<Dict> {
  const yaEsta = cargados[lang];
  if (yaEsta) return Promise.resolve(yaEsta);

  const pendiente = enVuelo[lang];
  if (pendiente) return pendiente;

  const promesa = CARGADORES[lang]()
    .then((mod) => {
      cargados[lang] = mod.default;
      delete enVuelo[lang];
      return mod.default;
    })
    .catch((err) => {
      // si el chunk falla, seguimos en inglés en vez de romper la UI
      delete enVuelo[lang];
      console.error(`[i18n] no se pudo cargar el idioma "${lang}"`, err);
      return en;
    });

  enVuelo[lang] = promesa;
  return promesa;
}

/**
 * Traduce con un diccionario concreto, cayendo a inglés y, en última
 * instancia, a la propia clave. Interpola `{var}` con `vars`.
 */
export function translateWith(
  dict: Dict,
  key: string,
  vars?: Record<string, string | number>,
): string {
  let texto = dict[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      texto = texto.replaceAll(`{${k}}`, String(v));
    }
  }
  return texto;
}

/** Idioma guardado en localStorage (utilidad fuera de React). */
export function idiomaGuardado(): Lang {
  if (typeof window === 'undefined') return 'en';
  try {
    const l = localStorage.getItem('ch_lang');
    return esIdiomaValido(l) ? l : 'en';
  } catch {
    return 'en';
  }
}

/**
 * Traducción síncrona fuera de React (validaciones, helpers). Usa el
 * diccionario que ya esté cargado para el idioma activo; si todavía no llegó,
 * devuelve el texto en inglés.
 */
export function translateSync(
  key: string,
  vars?: Record<string, string | number>,
): string {
  return translateWith(getDict(idiomaGuardado()), key, vars);
}
