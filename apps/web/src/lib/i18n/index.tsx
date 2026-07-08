'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Lang, LOCALES, translations } from './translations';

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** locale BCP-47 para fechas y moneda (Intl) */
  locale: string;
  /** traduce una clave, con interpolación: t('home.hello', { name }) */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nState | null>(null);
const STORAGE_KEY = 'ch_lang';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // inglés nativo por defecto; el guardado se aplica tras hidratar
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved && translations[saved]) setLangState(saved);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let texto = translations[lang][key] ?? translations.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          texto = texto.replaceAll(`{${k}}`, String(v));
        }
      }
      return texto;
    },
    [lang],
  );

  const value = useMemo<I18nState>(
    () => ({ lang, setLang, locale: LOCALES[lang], t }),
    [lang, setLang, t],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n debe usarse dentro de <I18nProvider>');
  return ctx;
}
