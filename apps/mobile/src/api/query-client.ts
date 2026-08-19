/**
 * QueryClient único de la app + política de reintentos y de recuperación.
 *
 * Vivía inline en `app/_layout.tsx`; se movió aquí para que la capa de red esté
 * junta y documentada (el layout solo lo importa y lo pasa al Provider).
 *
 * Objetivo: que ninguna petición quede colgada ni muerta.
 *  1) `client.ts` pone un TECHO DE TIEMPO a cada fetch → nunca hay esperas
 *     infinitas; un corte de cobertura acaba en error, no en spinner eterno.
 *  2) Aquí decidimos QUÉ errores merece la pena reintentar y cuáles no.
 *  3) Al volver la app a primer plano se refrescan los datos rancios, que es
 *     como se recupera solo el usuario que se quedó sin señal un rato.
 */
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { QueryClient, focusManager } from '@tanstack/react-query';
import { ApiError, esTimeout } from './client';

/**
 * Reintentar SOLO lo que puede mejorar con otro intento:
 *  - 4xx (401, 403, 404, 409, 422…) NO se reintenta: la respuesta será idéntica
 *    y cada reintento son segundos de spinner regalados. El 401 ya lo resuelve
 *    el refresh single-flight dentro de `client.ts`, no React Query.
 *  - timeout: UN solo reintento. Ya esperamos el techo completo (15 s en
 *    lecturas); encadenar tres intentos sería casi un minuto mirando el spinner.
 *  - red caída (status 0) y 5xx: hasta 2 reintentos, que fallan rápido y son
 *    justo el caso de "se cayó un segundo la cobertura".
 */
function debeReintentar(failureCount: number, error: unknown): boolean {
  const status = error instanceof ApiError ? error.status : undefined;
  if (status !== undefined && status >= 400 && status < 500) return false;
  if (esTimeout(error)) return failureCount < 1;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: debeReintentar,
      // 1 s, 2 s (con techo). Espaciado suficiente para que una microcaída de
      // cobertura se resuelva sola, sin martillar el backend.
      retryDelay: (intento) => Math.min(1_000 * 2 ** intento, 8_000),
      staleTime: 60_000,
      // Antes 5 min (default): al volver a una pantalla ya visitada se perdía la
      // caché y todo se recargaba desde cero. Con 15 min se pinta al instante
      // desde caché y el refetch va por detrás → la app "se siente" rápida.
      gcTime: 15 * 60_000,
      // Refresca lo RANCIO al volver a primer plano (ver wiring de AppState
      // abajo). Con staleTime de 60 s no dispara una tormenta de peticiones:
      // solo se recargan las queries que ya caducaron.
      refetchOnWindowFocus: true,
      // Sin NetInfo instalado, `onlineManager` no recibe eventos y esto nunca
      // llega a dispararse en nativo; se deja activo porque en web sí funciona
      // y porque es lo correcto el día que se añada un proveedor de red.
      refetchOnReconnect: true,
    },
    mutations: {
      // NUNCA reintentar automáticamente una mutación. Aquí viven los cobros
      // (checkout/confirmar), la inscripción y el consumo de cupones: repetir a
      // ciegas un POST que quizá SÍ llegó al servidor puede duplicar un pago o
      // quemar un cupón. Si falla, decide el usuario.
      retry: false,
    },
  },
});

/**
 * React Query detecta el "foco" con `visibilitychange`, que en React Native no
 * existe: sin esto, `refetchOnWindowFocus` sería letra muerta en el móvil. Se
 * conecta al AppState para que volver de segundo plano (o de un rato sin
 * cobertura) refresque los datos caducados por sí solo.
 * En web se deja el comportamiento nativo del navegador.
 */
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (estado: AppStateStatus) => {
    focusManager.setFocused(estado === 'active');
  });
}
