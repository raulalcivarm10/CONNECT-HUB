import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Datos mínimos de un evento guardado (para renderizar la agenda sin red). */
export interface SavedEvent {
  id: number;
  titulo: string;
  portadaUrl: string;
  fechaInicio: string;
  dias: string[];
  precio: number | null;
}

interface AgendaState {
  saved: SavedEvent[];
  toggle: (e: SavedEvent) => void;
  isSaved: (id: number) => boolean;
}

export const useAgenda = create<AgendaState>()(
  persist(
    (set, get) => ({
      saved: [],
      toggle: (e) =>
        set((s) => ({
          saved: s.saved.some((x) => x.id === e.id)
            ? s.saved.filter((x) => x.id !== e.id)
            : [e, ...s.saved],
        })),
      isSaved: (id) => get().saved.some((x) => x.id === id),
    }),
    {
      name: 'ch.agenda',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
