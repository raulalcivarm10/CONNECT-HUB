import { useEffect, useRef } from 'react';
import {
  SDK_URL,
  mapResponse,
  type CheckoutWidgetProps,
  type CheckoutWidgetResult,
  type PaymentCheckoutResponse,
} from './checkout-shared';

interface PaymentCheckoutModal {
  open: (opts: { reference: string }) => void;
  close?: () => void;
}
interface PaymentCheckoutSdk {
  modal: new (opts: {
    env_mode: string;
    locale?: string;
    onOpen?: () => void;
    onClose?: () => void;
    onResponse?: (resp: PaymentCheckoutResponse) => void;
  }) => PaymentCheckoutModal;
}

/** Carga (una vez) el SDK oficial de Paymentez desde su CDN. */
function loadSdk(): Promise<PaymentCheckoutSdk> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { PaymentCheckout?: PaymentCheckoutSdk };
    if (w.PaymentCheckout) return resolve(w.PaymentCheckout);
    const done = () => (w.PaymentCheckout ? resolve(w.PaymentCheckout) : reject(new Error('SDK unavailable')));
    const existing = document.querySelector(`script[src="${SDK_URL}"]`);
    if (existing) {
      existing.addEventListener('load', done);
      existing.addEventListener('error', () => reject(new Error('SDK load error')));
      return;
    }
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = done;
    s.onerror = () => reject(new Error('SDK load error'));
    document.head.appendChild(s);
  });
}

/**
 * Web: abre el Checkout con el SDK oficial DENTRO de la app (mismo patrón que
 * la implementación Angular: modal + open({reference}) + onResponse). Cierra
 * el modal si el usuario navega atrás (popstate), como recomienda la doc SPA.
 */
export function CheckoutWidget({ reference, envMode, locale, onResult }: CheckoutWidgetProps) {
  const done = useRef(false);
  const cb = useRef(onResult);
  cb.current = onResult;

  useEffect(() => {
    let cancelled = false;
    let modal: PaymentCheckoutModal | null = null;
    const finish = (r: CheckoutWidgetResult) => {
      if (done.current) return;
      done.current = true;
      cb.current(r);
    };
    const onPop = () => modal?.close?.();
    loadSdk()
      .then((PC) => {
        if (cancelled) return;
        modal = new PC.modal({
          env_mode: envMode,
          locale: locale ?? 'es',
          onOpen: () => {},
          onClose: () => finish({ status: 'cancelled' }),
          onResponse: (resp) => finish(mapResponse(resp)),
        });
        window.addEventListener('popstate', onPop, { once: true });
        modal.open({ reference });
      })
      .catch(() => finish({ status: 'error' }));
    return () => {
      cancelled = true;
      window.removeEventListener('popstate', onPop);
    };
    // Solo al montar: la referencia es fija por intento de pago.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
