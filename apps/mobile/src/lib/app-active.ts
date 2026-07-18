import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

/**
 * `true` mientras la app está en primer plano (activa).
 *
 * Se usa para PAUSAR las animaciones infinitas de Reanimated cuando la app pasa
 * a segundo plano (bloqueo de pantalla) y reanudarlas al volver. Sin esto, en la
 * nueva arquitectura de RN las animaciones en bucle pueden dejar el hilo de UI
 * en un estado que congela la app al desbloquear el teléfono.
 */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const onChange = (s: AppStateStatus) => setActive(s === 'active');
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);
  return active;
}
