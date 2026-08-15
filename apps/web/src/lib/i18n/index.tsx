'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  estaCargado,
  getDict,
  loadDict,
  translateWith,
} from './dictionaries';
import { esIdiomaValido, LOCALES, type Dict, type Lang } from './types';

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
  // diccionario en uso; arranca en inglés (import estático) para que la
  // primera pintura nunca muestre claves crudas
  const [dict, setDict] = useState<Dict>(() => getDict('en'));

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (esIdiomaValido(saved)) setLangState(saved);
  }, []);

  // trae el diccionario del idioma activo; mientras llega seguimos en inglés
  useEffect(() => {
    if (estaCargado(lang)) {
      setDict(getDict(lang));
      return;
    }
    let vigente = true;
    void loadDict(lang).then((d) => {
      if (vigente) setDict(d);
    });
    return () => {
      vigente = false;
    };
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
    // adelanta la descarga para que el cambio se sienta inmediato
    void loadDict(l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translateWith(dict, key, vars),
    [dict],
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
