'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Caché de datos del panel (react-query).
 *
 * El QueryClient se crea una sola vez con `useState` (si se creara en el
 * cuerpo del componente se reharía en cada render y la caché se perdería).
 * Vive dentro del layout del panel, así que al cerrar sesión el layout se
 * desmonta y la caché muere con él (no se reutiliza entre usuarios).
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 min: navegar no vuelve a pedir
            gcTime: 30 * 60 * 1000, // 30 min en memoria tras dejar de usarse
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
