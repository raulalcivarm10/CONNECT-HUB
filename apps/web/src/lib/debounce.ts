'use client';

import { useEffect, useState } from 'react';

/**
 * Devuelve `valor` con retardo: solo se actualiza cuando pasan `ms`
 * sin cambios. Sirve para que un input de texto no dispare un request
 * por cada tecla.
 */
export function useDebounce<T>(valor: T, ms = 350): T {
  const [diferido, setDiferido] = useState(valor);

  useEffect(() => {
    const id = setTimeout(() => setDiferido(valor), ms);
    return () => clearTimeout(id);
  }, [valor, ms]);

  return diferido;
}
