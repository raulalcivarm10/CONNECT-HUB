import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Lang } from '@/i18n';

/** Preferencia de tema: sigue el sistema o fuerza claro/oscuro. */
export type TemaPref = 'system' | 'light' | 'dark';

interface SettingsState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  tema: TemaPref;
  setTema: (tema: TemaPref) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      lang: 'en',
      setLang: (lang) => set({ lang }),
      // Modo oscuro por defecto (el usuario puede cambiar a claro/sistema en Perfil).
      tema: 'dark',
      setTema: (tema) => set({ tema }),
    }),
    {
      name: 'ch.settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
