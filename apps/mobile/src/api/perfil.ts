/** Perfil de asistente (mío y de otros) — networking. */
import { Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { MiPerfil, PerfilPublico } from '@connecthub/shared-types';
import { apiGet, apiPatch, apiUpload, apiUploadFile } from './client';

export function useMiPerfil() {
  return useQuery({
    queryKey: ['mi-perfil'],
    queryFn: () => apiGet<MiPerfil>('/public/perfil/me', undefined, true),
    staleTime: 30_000,
  });
}

export function usePerfil(idCliente: string | null) {
  return useQuery({
    queryKey: ['perfil', idCliente],
    enabled: idCliente != null,
    queryFn: () => apiGet<PerfilPublico>(`/public/perfil/${idCliente}`, undefined, true),
    staleTime: 10_000,
  });
}

export function actualizarPerfil(dto: Partial<MiPerfil>) {
  return apiPatch<MiPerfil>('/public/perfil/me', dto, true);
}

/** Sube la foto de perfil (multipart) al NAS y devuelve el perfil actualizado. */
export async function subirFotoPerfil(uri: string) {
  if (Platform.OS === 'web') {
    // en web el picker da un blob:/data: URI → convertir a Blob real + FormData
    const blob = await (await fetch(uri)).blob();
    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
    const form = new FormData();
    form.append('archivo', blob, `perfil.${ext}`);
    return apiUpload<MiPerfil>('/public/perfil/me/foto', form);
  }
  // en nativo (iOS/Android) usamos expo-file-system: fetch+FormData con { uri }
  // falla con "Network request failed" en la nueva arquitectura de RN.
  const name = uri.split('/').pop() || 'foto.jpg';
  const lower = name.toLowerCase();
  const mime = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return apiUploadFile<MiPerfil>('/public/perfil/me/foto', uri, 'archivo', mime);
}
