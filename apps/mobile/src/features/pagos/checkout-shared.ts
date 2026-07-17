/** Tipos + mapeo compartidos del Checkout Paymentez (SDK oficial, in-app). */

/** SDK oficial de Checkout — versión FIJADA (la del ejemplo oficial docs/payments). */
export const SDK_URL = 'https://cdn.paymentez.com/ccapi/sdk/payment_checkout_3.0.0.min.js';

/** Resultado uniforme del widget en web y nativo. */
export interface CheckoutWidgetResult {
  status: 'success' | 'pending' | 'failure' | 'cancelled' | 'error';
  transactionId?: string;
  /** Respuesta cruda del SDK (se reenvía como checkoutResponse al confirmar). */
  raw?: unknown;
}

export interface CheckoutWidgetProps {
  /** Referencia devuelta por el servicio de pagos → modal.open({ reference }). */
  reference: string;
  /** Entorno del SDK devuelto por el servicio de pagos ('stg' | 'prod'). */
  envMode: 'stg' | 'prod';
  locale?: string;
  onResult: (r: CheckoutWidgetResult) => void;
}

/** Respuesta del SDK PaymentCheckout (onResponse). */
export interface PaymentCheckoutResponse {
  error?: { type?: string; help?: string; description?: string };
  transaction?: {
    id?: string | number;
    status?: string; // success | failure | pending
    status_detail?: number | string;
    message?: string;
  };
}

/** Traduce el onResponse del SDK a un CheckoutWidgetResult uniforme. */
export function mapResponse(resp: PaymentCheckoutResponse | null | undefined): CheckoutWidgetResult {
  if (!resp || resp.error) return { status: 'error', raw: resp };
  const tx = resp.transaction;
  const id = tx?.id != null ? String(tx.id) : undefined;
  const s = String(tx?.status ?? '').toLowerCase();
  const detail = Number(tx?.status_detail);
  // Éxito si el status es "success" O el status_detail es 3 (aprobado en Paymentez).
  if (s === 'success' || detail === 3) return { status: 'success', transactionId: id, raw: resp };
  if (s === 'pending') return { status: 'pending', transactionId: id, raw: resp };
  return { status: 'failure', transactionId: id, raw: resp };
}
