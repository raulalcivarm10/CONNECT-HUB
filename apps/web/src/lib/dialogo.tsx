'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useI18n } from '@/lib/i18n';

type Tono = 'danger' | 'warning' | 'success' | 'info';

interface ConfirmarOpts {
  titulo: string;
  mensaje?: string;
  confirmar?: string;
  cancelar?: string;
  tono?: Tono;
}
interface AlertaOpts {
  titulo: string;
  mensaje?: string;
  boton?: string;
  tono?: Tono;
}

interface DialogoApi {
  /** confirma una acción; resuelve true si el usuario acepta */
  confirmar: (o: ConfirmarOpts) => Promise<boolean>;
  /** aviso simple con un solo botón */
  alerta: (o: AlertaOpts) => Promise<void>;
}

interface DialogoVista {
  titulo: string;
  mensaje?: string;
  tono: Tono;
  textoConfirmar: string;
  textoCancelar: string | null; // null = alerta (sin botón cancelar)
}

const Ctx = createContext<DialogoApi | null>(null);

const COLOR_BTN: Record<Tono, string> = {
  danger: 'bg-danger',
  warning: 'bg-amber-500',
  success: 'bg-success',
  info: 'bg-brand',
};
const COLOR_ICONO: Record<Tono, string> = {
  danger: 'bg-danger/10 text-danger',
  warning: 'bg-amber-500/10 text-amber-500',
  success: 'bg-success/10 text-success',
  info: 'bg-brand/10 text-brand',
};

const ICONO: Record<Tono, React.ReactNode> = {
  danger: (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
    </svg>
  ),
  success: (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
    </svg>
  ),
};

export function DialogoProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [vista, setVista] = useState<DialogoVista | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);
  const confirmarRef = useRef<HTMLButtonElement>(null);

  const cerrar = useCallback((v: boolean) => {
    resolverRef.current?.(v);
    resolverRef.current = null;
    setVista(null);
  }, []);

  const confirmar = useCallback(
    (o: ConfirmarOpts) =>
      new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setVista({
          titulo: o.titulo,
          mensaje: o.mensaje,
          tono: o.tono ?? 'danger',
          textoConfirmar: o.confirmar ?? t('c.confirm'),
          textoCancelar: o.cancelar ?? t('c.cancel'),
        });
      }),
    [t],
  );

  const alerta = useCallback(
    (o: AlertaOpts) =>
      new Promise<void>((resolve) => {
        resolverRef.current = () => resolve();
        setVista({
          titulo: o.titulo,
          mensaje: o.mensaje,
          tono: o.tono ?? 'info',
          textoConfirmar: o.boton ?? t('c.ok'),
          textoCancelar: null,
        });
      }),
    [t],
  );

  useEffect(() => {
    if (!vista) return;
    confirmarRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar(false);
      else if (e.key === 'Enter') cerrar(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [vista, cerrar]);

  return (
    <Ctx.Provider value={{ confirmar, alerta }}>
      {children}
      {vista && (
        <div
          className="anim-fade fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => cerrar(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="anim-pop w-full max-w-sm rounded-2xl border border-border-app bg-surface p-6 text-center shadow-2xl"
          >
            <div
              className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${COLOR_ICONO[vista.tono]}`}
            >
              {ICONO[vista.tono]}
            </div>
            <h2 className="text-lg font-semibold text-text">{vista.titulo}</h2>
            {vista.mensaje && (
              <p className="mt-1.5 text-sm text-text-2">{vista.mensaje}</p>
            )}
            <div className="mt-5 flex justify-center gap-2">
              {vista.textoCancelar && (
                <button
                  type="button"
                  onClick={() => cerrar(false)}
                  className="min-w-24 rounded-lg border border-border-app px-4 py-2 text-sm font-medium text-text-2 transition hover:bg-surface-2"
                >
                  {vista.textoCancelar}
                </button>
              )}
              <button
                ref={confirmarRef}
                type="button"
                onClick={() => cerrar(true)}
                className={`min-w-24 rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 ${COLOR_BTN[vista.tono]}`}
              >
                {vista.textoConfirmar}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** null-safe: si no hay provider, cae a los diálogos nativos del navegador */
export function useDialogo(): DialogoApi {
  return (
    useContext(Ctx) ?? {
      confirmar: async ({ titulo, mensaje }) =>
        window.confirm(mensaje ? `${titulo}\n\n${mensaje}` : titulo),
      alerta: async ({ titulo, mensaje }) =>
        window.alert(mensaje ? `${titulo}\n\n${mensaje}` : titulo),
    }
  );
}
