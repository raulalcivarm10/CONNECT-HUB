export type Lang = 'en' | 'es' | 'fr' | 'pt';

/** Un diccionario completo: clave → texto (con marcadores {var} opcionales). */
export type Dict = Record<string, string>;

export const LANGS: Array<{ code: Lang; label: string; flag: string }> = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇨' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
];

export const LOCALES: Record<Lang, string> = {
  en: 'en-US',
  es: 'es-EC',
  fr: 'fr-FR',
  pt: 'pt-BR',
};

/** true si el string es uno de los 4 idiomas soportados. */
export function esIdiomaValido(valor: unknown): valor is Lang {
  return valor === 'en' || valor === 'es' || valor === 'fr' || valor === 'pt';
}
