import { createHash } from 'node:crypto';

/**
 * Cliente HTTP para la pasarela Nuvei/Paymentez (LatAm). El servidor es dueño
 * del cobro: firma el header Auth-Token con las credenciales SERVER de cada
 * institución (APP_CODE_CHECKOUT / APP_KEY_CHECKOUT) y nunca las expone.
 *
 * Doc: https://developers.paymentez.com/api/
 *  - Auth-Token = base64("APP_CODE;UNIX_TS;sha256(APP_KEY+UNIX_TS)"), válido 15s.
 *  - Tarjetas + débito: ccapi(-stg).paymentez.com  · Link-to-Pay: noccapi(-stg).
 */
export interface NuveiCreds {
  /** SERVER de tokenización (USUARIO_PASARELA/CONTRASENA_PASARELA): débito, verify, list/delete. */
  serverAppCode: string;
  serverAppKey: string;
  /** CLIENT de tokenización (APP_*_TOKENIZATION): card/add. Mismo "application" que server. */
  clientAppCode: string;
  clientAppKey: string;
  /** Credenciales de CHECKOUT hospedado (APP_*_CHECKOUT): link-to-pay. */
  checkoutAppCode: string;
  checkoutAppKey: string;
  env: 'stg' | 'prod';
}

export interface NuveiUser {
  id: string;
  email: string;
  ip_address?: string;
  phone?: string;
}

export interface NuveiCardInput {
  number: string;
  holder_name: string;
  expiry_month: number;
  expiry_year: number;
  cvc: string;
}

export interface NuveiCard {
  token: string;
  bin: string | null;
  number: string | null; // últimos 4
  type: string | null;
  status: string | null;
  holder_name?: string | null;
  expiry_month?: string | number | null;
  expiry_year?: string | number | null;
  bank_name?: string | null;
  transaction_reference?: string | null;
}

export interface NuveiOrder {
  amount: number;
  description: string;
  dev_reference: string;
  vat: number;
  tax_percentage?: number;
  installments?: number;
  installments_type?: number;
  currency?: string;
}

export interface NuveiTransaction {
  status?: string; // success | failure | pending
  current_status?: string; // APPROVED | REJECTED | PENDING
  id?: string;
  authorization_code?: string;
  amount?: number;
  dev_reference?: string;
  payment_date?: string;
  status_detail?: number | string;
  message?: string;
}

export interface NuveiResponse<T = unknown> {
  ok: boolean;
  httpStatus: number;
  data: T;
  error?: { type?: string; help?: string; description?: string };
}

function authToken(appCode: string, appKey: string): string {
  const ts = String(Math.floor(Date.now() / 1000));
  const uniq = createHash('sha256').update(appKey + ts).digest('hex');
  return Buffer.from(`${appCode};${ts};${uniq}`).toString('base64');
}

export class NuveiClient {
  private readonly ccapi: string;
  private readonly noccapi: string;

  constructor(private readonly creds: NuveiCreds) {
    const prod = creds.env === 'prod';
    this.ccapi = prod ? 'https://ccapi.paymentez.com' : 'https://ccapi-stg.paymentez.com';
    this.noccapi = prod ? 'https://noccapi.paymentez.com' : 'https://noccapi-stg.paymentez.com';
  }

  private async call<T>(
    base: string,
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
    scope: 'server' | 'client' | 'checkout' = 'server',
  ): Promise<NuveiResponse<T>> {
    const pairs = {
      client: [this.creds.clientAppCode, this.creds.clientAppKey],
      checkout: [this.creds.checkoutAppCode, this.creds.checkoutAppKey],
      server: [this.creds.serverAppCode, this.creds.serverAppKey],
    } as const;
    const [code, key] = pairs[scope];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Auth-Token': authToken(code, key),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: ctrl.signal,
      });
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        /* respuesta sin cuerpo JSON */
      }
      const err = (data as { error?: NuveiResponse['error'] })?.error;
      return { ok: res.ok && !err, httpStatus: res.status, data: data as T, error: err };
    } catch (e) {
      return {
        ok: false,
        httpStatus: 0,
        data: null as T,
        error: { type: 'network', description: e instanceof Error ? e.message : 'network error' },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Tokeniza (guarda) una tarjeta. Usa credenciales CLIENT (PCI/tokenización). */
  addCard(user: NuveiUser, card: NuveiCardInput) {
    return this.call<{ card: NuveiCard }>(
      this.ccapi,
      '/v2/card/add',
      'POST',
      { user, card },
      'client',
    );
  }

  /** Lista las tarjetas tokenizadas del usuario. */
  listCards(uid: string) {
    return this.call<{ result_size: number; cards: NuveiCard[] }>(
      this.ccapi,
      `/v2/card/list?uid=${encodeURIComponent(uid)}`,
      'GET',
    );
  }

  /** Elimina una tarjeta tokenizada. */
  deleteCard(uid: string, token: string) {
    return this.call<{ message: string }>(this.ccapi, '/v2/card/delete/', 'POST', {
      user: { id: uid },
      card: { token },
    });
  }

  /** Cobra (débito) con una tarjeta tokenizada. */
  debit(user: NuveiUser, order: NuveiOrder, cardToken: string) {
    return this.call<{ transaction: NuveiTransaction; card?: NuveiCard }>(
      this.ccapi,
      '/v2/transaction/debit/',
      'POST',
      { user, order, card: { token: cardToken } },
    );
  }

  /** Consulta el estado de una transacción por su id. */
  verify(transactionId: string) {
    return this.call<{ transaction: NuveiTransaction }>(
      this.ccapi,
      `/v2/transaction/${encodeURIComponent(transactionId)}/`,
      'GET',
    );
  }

  /**
   * Genera una REFERENCIA de Checkout embebido (widget PaymentCheckout / initCheckout).
   * A diferencia de Link to Pay (que da un payment_url para redirigir), esto devuelve
   * un `reference` que el SDK abre en un modal dentro de la app: modal.open({reference}).
   * Usa credenciales SERVER (mismas de débito/verify) en ccapi.
   * Doc: POST /v2/transaction/init_reference/ → { reference, checkout_url }.
   */
  initReference(
    user: NuveiUser & { name?: string; last_name?: string },
    order: NuveiOrder & { currency: string },
    locale = 'es',
  ) {
    return this.call<{ reference: string; checkout_url: string }>(
      this.ccapi,
      '/v2/transaction/init_reference/',
      'POST',
      { locale, order, user },
      'server',
    );
  }

  /** Genera una orden de checkout hospedado (Link to Pay) → payment_url. */
  linkToPay(payload: {
    user: NuveiUser & { name?: string; last_name?: string };
    order: NuveiOrder & { currency: string };
    configuration: Record<string, unknown>;
  }) {
    return this.call<{
      success: boolean;
      detail?: unknown;
      data?: {
        order?: { id?: string; status?: string };
        payment?: { payment_url?: string; payment_qr?: string };
      };
    }>(this.noccapi, '/linktopay/init_order/', 'POST', payload, 'checkout');
  }
}
