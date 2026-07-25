/** Pagos Nuvei/Paymentez: tarjetas guardadas + cobro directo/checkout (auth). */
import { useQuery } from '@tanstack/react-query';
import type {
  Tarjeta,
  NuevaTarjetaInput,
  ResumenPago,
  PagoResult,
  CheckoutResult,
  EstadoPago,
  CuponValidacion,
} from '@connecthub/shared-types';
import { apiGet, apiPost, apiDelete, ApiError } from './client';
import { getPagosToken, refreshPagos, pagosUrl } from './pagos-session';

/**
 * Servicio de APIs de pagos (externo — el mismo backend que usa la app Ionic).
 * El flujo de Checkout Paymentez se consume ÚNICAMENTE contra este servicio:
 *   POST /evento-usuario/eventos/{idEvento}/checkout            → { reference, envMode }
 *   POST /evento-usuario/eventos/{idEvento}/checkout/confirmar  → confirma + inscribe
 * El token lo emite el LOGIN de ese servicio (ver pagos-session.ts) y viaja en
 * el encabezado Authorization mientras la sesión esté activa.
 */

export interface CheckoutInicio {
  reference: string;
  envMode: 'stg' | 'prod';
  referencia: string; // dev_reference propia (para confirmar en NUESTRO backend)
}

export interface CheckoutConfirmacion {
  success: boolean;
  message?: string;
  data?: { transaccionId?: string; nombreEvento?: string } & Record<string, unknown>;
}

/**
 * POST al servicio de pagos externo con el token de SU login (sesión de pagos).
 * Ante 401 renueva el token con /auth/refresh (single-flight) y reintenta UNA
 * vez de forma transparente; si el refresh falla, la sesión de pagos se elimina
 * y el error llega al llamador. Si aún no hay sesión de pagos, cae al token de
 * ConnectHub como último recurso.
 */
async function pagosPost<T>(path: string, body: unknown): Promise<T> {
  const send = async (token: string | null) => {
    try {
      return await fetch(pagosUrl(path), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'network');
    }
  };

  // El servicio externo SOLO acepta SU token (el emitido por su login de pagos).
  // NUNCA se manda el token de ConnectHub como fallback: el externo lo rechaza (401).
  let token = getPagosToken();
  // Si no hay access en memoria pero sí un refresh persistido, restaura la sesión.
  if (!token) token = await refreshPagos();
  let res = await send(token);

  // 401 (token vencido) → refresh (single-flight) → reintento único.
  if (res.status === 401) {
    const nuevo = await refreshPagos();
    if (nuevo) res = await send(nuevo);
  }

  const json = (await res.json().catch(() => null)) as
    | ({ success?: boolean; message?: string; data?: unknown } & Record<string, unknown>)
    | null;
  if (!res.ok) {
    throw new ApiError(res.status, (json?.message as string) ?? res.statusText);
  }
  return json as T;
}

/** Tarjetas guardadas del asistente para una institución. */
export function useTarjetas(idInstitucion: number | null) {
  return useQuery({
    queryKey: ['tarjetas', idInstitucion],
    enabled: idInstitucion != null,
    queryFn: () => apiGet<Tarjeta[]>('/public/pagos/tarjetas', { idInstitucion }, true),
    staleTime: 30_000,
  });
}

/**
 * Valida un cupón contra ConnectHub (lee EVENTO_CUPONES del evento). Es solo
 * feedback para la UI (existe/activo/usos + descuento). El cobro con descuento
 * lo aplica el servicio de pagos externo al generar la referencia.
 */
export function validarCupon(idEvento: number, codigo: string) {
  return apiPost<CuponValidacion>(`/public/pagos/cupon/${idEvento}`, { codigo }, true);
}

/** Desglose de precio de un evento de pago. */
export function useResumenPago(idEvento: number) {
  return useQuery({
    queryKey: ['resumen-pago', idEvento],
    queryFn: () => apiGet<ResumenPago>(`/public/pagos/resumen/${idEvento}`, undefined, true),
    staleTime: 15_000,
  });
}

export function agregarTarjeta(input: NuevaTarjetaInput) {
  return apiPost<Tarjeta>('/public/pagos/tarjetas', input, true);
}

export function eliminarTarjeta(idTarjeta: number) {
  return apiDelete<{ ok: boolean }>(`/public/pagos/tarjetas/${idTarjeta}`, true);
}

/** Cobro directo con una tarjeta guardada. */
export function pagarDirecto(idEvento: number, idTarjeta: number) {
  return apiPost<PagoResult>('/public/pagos/debito', { idEvento, idTarjeta }, true);
}

/** Genera un checkout hospedado (Link to Pay). */
export function crearCheckout(idEvento: number) {
  return apiPost<CheckoutResult>('/public/pagos/checkout', { idEvento }, true);
}

/**
 * Genera la referencia del Checkout en NUESTRO backend (que cobra vía Nuvei del
 * lado servidor con las credenciales de la institución). Usa la sesión de
 * ConnectHub (@Asistente) — NO depende del token del servicio de pagos externo,
 * que no existe cuando la clave se creó/reseteó en nuestro formato.
 * POST /public/pagos/checkout/iniciar  { idEvento } → { reference, envMode, referencia }
 *
 * NOTA (pendiente): este flujo del modal aún NO aplica cupón del lado servidor;
 * cobra el monto del evento. El `cupon` se acepta por compatibilidad pero se ignora
 * hasta que el backend lo soporte en iniciarCheckout.
 */
export async function iniciarCheckout(idEvento: number, _cupon?: string): Promise<CheckoutInicio> {
  const r = await apiPost<{
    yaAdquirido?: boolean;
    reference?: string;
    envMode?: string;
    referencia?: string;
  }>('/public/pagos/checkout/iniciar', { idEvento }, true);
  if (!r.reference || !r.referencia) throw new ApiError(0, 'No reference returned');
  const envRaw = (r.envMode ?? 'prod').toLowerCase();
  return { reference: r.reference, envMode: envRaw.startsWith('prod') ? 'prod' : 'stg', referencia: r.referencia };
}

/**
 * Confirma el pago en NUESTRO backend (verifica en Nuvei e inscribe, idempotente).
 * POST /public/pagos/checkout/confirmar  { idEvento, referencia, transactionId }
 * → { aprobado, ... }  (lo mapeamos a { success }).
 */
export async function confirmarCheckout(
  idEvento: number,
  referencia: string,
  transactionId: string,
): Promise<CheckoutConfirmacion> {
  const r = await apiPost<{
    aprobado?: boolean;
    pendiente?: boolean;
    message?: string;
    mensaje?: string;
    nombreEvento?: string;
    transaccionId?: string;
  }>('/public/pagos/checkout/confirmar', { idEvento, referencia, transactionId }, true);
  return {
    success: r.aprobado === true,
    message: r.mensaje ?? r.message,
    data: { transaccionId: r.transaccionId ?? transactionId, nombreEvento: r.nombreEvento },
  };
}

/**
 * Dispara el correo de confirmación de pago en ConnectHub (best-effort).
 * La app lo llama tras confirmar OK con el servicio externo; no bloquea el flujo.
 */
export function enviarConfirmacionCorreo(idEvento: number, transactionId: string, monto: number) {
  return apiPost<{ sent: boolean }>('/public/pagos/confirmacion-email', { idEvento, transactionId, monto }, true);
}

/** Estado de un pago por referencia (para el polling del checkout). */
export function estadoPago(referencia: string) {
  return apiGet<EstadoPago>(`/public/pagos/estado/${referencia}`, undefined, true);
}
