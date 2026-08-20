/**
 * Abre la pantalla correcta al TOCAR una notificación.
 *
 * Sin esto, la notificación llegaba y al tocarla la app simplemente se abría
 * donde estuviera: había que ir a buscar la conversación a mano. El backend ya
 * manda en el aviso los datos necesarios para saber a dónde ir:
 *   { tipo: 'mensaje_chat', idChat, idRemitente }   → la conversación
 *   { tipo: 'nuevo_evento', idEvento }              → el evento
 *
 * DOS CAMINOS, no uno: si la app estaba abierta o en segundo plano el toque
 * llega por el listener; si estaba CERRADA, el toque ocurrió antes de que este
 * código existiera, y hay que ir a recogerlo con `getLastNotificationResponse`.
 * Cubrir solo el primero deja fuera justo el caso más común.
 *
 * El destino se navega SOLO cuando la app está lista (sesión restaurada e
 * institución hidratada). Navegar antes lo pisaría el redirector del arranque.
 * Si en ese momento no hay sesión, el destino se queda esperando: la persona
 * entra al login y, al terminar, aterriza en la conversación que tocó en vez de
 * en el inicio.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '@/store/auth';
import { useInstitucion } from '@/store/institucion';

type Destino =
  | { tipo: 'chat'; idChat: number }
  | { tipo: 'evento'; idEvento: number };

/** Traduce los datos del aviso a un destino, o null si no reconoce el tipo. */
function destinoDe(data: unknown): Destino | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  // Los datos del aviso viajan como JSON y el id puede llegar como texto.
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  if (d.tipo === 'mensaje_chat') {
    const idChat = num(d.idChat);
    return idChat ? { tipo: 'chat', idChat } : null;
  }
  if (d.tipo === 'nuevo_evento') {
    const idEvento = num(d.idEvento);
    return idEvento ? { tipo: 'evento', idEvento } : null;
  }
  return null;
}

export function usePushNavigation() {
  const router = useRouter();
  const bootstrapped = useAuth((s) => s.bootstrapped);
  const status = useAuth((s) => s.status);
  const hidratada = useInstitucion((s) => s.hydrated);

  // El destino vive en una ref y no en estado: el destino en sí no se pinta, y
  // guardarlo en estado obligaría a limpiarlo desde el efecto de navegación
  // (un `setState` dentro de un efecto, que encadena renders de más).
  // `aviso` es solo el pulso que despierta ese efecto.
  const pendiente = useRef<Destino | null>(null);
  const [aviso, setAviso] = useState(0);

  const anotar = useCallback((data: unknown) => {
    const d = destinoDe(data);
    if (!d) return;
    pendiente.current = d;
    setAviso((n) => n + 1);
  }, []);

  // Toque con la app abierta o en segundo plano.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      anotar(r.notification.request.content.data);
    });
    return () => sub.remove();
  }, [anotar]);

  // Toque con la app CERRADA: el toque es lo que la abrió, así que ya pasó.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let vivo = true;
    Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        if (vivo && r) anotar(r.notification.request.content.data);
      })
      .catch(() => {
        // sin módulo nativo o sin permiso: no hay nada que recoger
      });
    return () => {
      vivo = false;
    };
  }, [anotar]);

  useEffect(() => {
    const destino = pendiente.current;
    if (!destino) return;
    // `bootstrapped` e `hidratada` marcan que el arranque ya decidió a dónde va
    // la app; hasta entonces cualquier navegación se pierde.
    if (!bootstrapped || !hidratada) return;
    // Sin sesión no se puede abrir un chat: se deja pendiente para después de
    // entrar, en vez de descartarlo.
    if (status !== 'authed') return;

    pendiente.current = null;
    if (destino.tipo === 'chat') {
      router.push({ pathname: '/chat/[idChat]', params: { idChat: destino.idChat } });
    } else {
      router.push({ pathname: '/evento/[id]', params: { id: destino.idEvento } });
    }
  }, [aviso, bootstrapped, hidratada, status, router]);
}
