'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useI18n } from '@/lib/i18n';

interface LightboxState {
  /** abre el visor con la imagen indicada */
  open: (src: string, alt?: string) => void;
}

const Ctx = createContext<LightboxState | null>(null);

export function LightboxProvider({ children }: { children: React.ReactNode }) {
  const [img, setImg] = useState<{ src: string; alt: string } | null>(null);
  const { t } = useI18n();

  const open = useCallback((src: string, alt = '') => {
    setImg({ src, alt });
  }, []);

  useEffect(() => {
    if (!img) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setImg(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [img]);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {img && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setImg(null)}
        >
          <button
            onClick={() => setImg(null)}
            aria-label={t('c.close')}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-2xl text-white transition hover:bg-white/25"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.src}
            alt={img.alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </Ctx.Provider>
  );
}

/** null-safe: si no hay provider, open() no hace nada */
export function useLightbox(): LightboxState {
  return useContext(Ctx) ?? { open: () => undefined };
}
