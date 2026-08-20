import { useCallback, useState } from 'react';

/**
 * Estado para el "tirar para refrescar" de una lista.
 *
 * POR QUÉ NO SE USA `isRefetching` DE REACT QUERY DIRECTAMENTE: esa bandera se
 * enciende también cuando el refetch lo dispara el CÓDIGO (un `useFocusEffect`,
 * un `invalidateQueries`, o volver de segundo plano), no solo el gesto de la
 * persona. Atar el indicador nativo a esa bandera da dos fallos reales:
 *
 *  1. SE APAGA ANTES DE TIEMPO. Al arrastrar, `RefreshControl` de React Native
 *     marca el estado nativo como "refrescando" y fuerza un render ANTES de que
 *     la bandera de React Query llegue a true. En ese render ve `refreshing`
 *     todavía en false, cree que el JS quiere pararlo y manda pararlo.
 *
 *  2. SE QUEDA GIRANDO. En la arquitectura nueva (Fabric, la que compila Expo
 *     SDK 57) el visor nativo ya no comprueba si está en pantalla antes de
 *     arrancar y parar, guarda que la implementación anterior sí tenía. Un par
 *     arrancar+parar que ocurre entero con la lista FUERA de la ventana deja el
 *     indicador de UIKit encendido, y al volver sigue girando. Es justo lo que
 *     pasa al entrar a un chat: la pestaña Community sigue montada detrás y el
 *     chat invalida su consulta.
 *
 * Con un estado propio el indicador solo existe mientras la persona tira de la
 * lista, y el `finally` garantiza que siempre se apaga. Los refrescos que
 * dispara el código siguen ocurriendo igual, solo que en silencio.
 *
 * `refrescar` debe englobar TODAS las consultas de la pantalla; si se deja una
 * fuera, el indicador se apaga con esa petición todavía en vuelo.
 */
export function usePullToRefresh(refrescar: () => Promise<unknown>) {
  const [refrescando, setRefrescando] = useState(false);

  const onRefresh = useCallback(async () => {
    // Este `set` corre síncrono dentro del manejador, así que el render que
    // fuerza RefreshControl al soltar ya ve `refrescando` en true: sin esto
    // vuelve el fallo (1).
    setRefrescando(true);
    try {
      await refrescar();
    } finally {
      setRefrescando(false);
    }
  }, [refrescar]);

  return { refrescando, onRefresh };
}
