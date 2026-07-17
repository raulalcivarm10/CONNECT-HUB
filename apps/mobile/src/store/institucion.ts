import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { InstitucionResumen } from '@connecthub/shared-types';

interface InstitucionState {
  /** Institución "primaria" (para el gate: si es null → onboarding). */
  institucion: InstitucionResumen | null;
  /** Filtro del Home: null = TODAS mis instituciones; o el id de una. */
  filtro: number | null;
  hydrated: boolean;
  setInstitucion: (institucion: InstitucionResumen) => void;
  setFiltro: (filtro: number | null) => void;
  clear: () => void;
  _setHydrated: () => void;
}

export const useInstitucion = create<InstitucionState>()(
  persist(
    (set) => ({
      institucion: null,
      filtro: null,
      hydrated: false,
      setInstitucion: (institucion) => set({ institucion }),
      setFiltro: (filtro) => set({ filtro }),
      clear: () => set({ institucion: null, filtro: null }),
      _setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'ch.institucion',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ institucion: s.institucion, filtro: s.filtro }),
      onRehydrateStorage: () => (state) => state?._setHydrated(),
    },
  ),
);
