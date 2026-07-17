/** Chats privados 1-a-1. */
import { useQuery } from '@tanstack/react-query';
import type { ChatResumen, ChatDetalle, ChatMensaje, PersonaResumen } from '@connecthub/shared-types';
import { apiGet, apiPost } from './client';

export function useChats() {
  return useQuery({
    queryKey: ['chats'],
    queryFn: () => apiGet<ChatResumen[]>('/public/chats', undefined, true),
    staleTime: 10_000,
  });
}

export function useChatMensajes(idChat: number | null) {
  return useQuery({
    queryKey: ['chat', idChat],
    enabled: idChat != null,
    queryFn: () => apiGet<ChatDetalle>(`/public/chats/${idChat}/mensajes`, { size: 50 }, true),
    staleTime: 5_000,
  });
}

export function abrirChat(idCliente: string) {
  return apiPost<{ idChat: number; otro: PersonaResumen }>('/public/chats/abrir', { idCliente }, true);
}

export function enviarPrivado(idChat: number, mensaje: string) {
  return apiPost<ChatMensaje>(`/public/chats/${idChat}/mensajes`, { mensaje }, true);
}
