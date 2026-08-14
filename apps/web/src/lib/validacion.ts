import type { FormEvent } from 'react';

type CampoValidable =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement;

/**
 * Traduce los globos de validación HTML5 nativa al idioma del panel.
 * El navegador muestra sus mensajes en SU idioma (no el de la app), así que
 * al fallar la validación fijamos un mensaje traducido (setCustomValidity)
 * y lo limpiamos en cuanto el usuario corrige el campo.
 *
 * Uso: <input required {...propsValidacion(t('common.requiredField'))} … />
 *
 * Solo expone onInvalid/onInput: el evento nativo `input` también se dispara
 * en <select> y <textarea> al corregir, y así nunca pisamos (ni nos pisa)
 * un onChange propio del campo, sin importar el orden del spread.
 */
export function propsValidacion(mensaje: string): {
  onInvalid: (e: FormEvent<CampoValidable>) => void;
  onInput: (e: FormEvent<CampoValidable>) => void;
} {
  return {
    onInvalid: (e) => e.currentTarget.setCustomValidity(mensaje),
    onInput: (e) => e.currentTarget.setCustomValidity(''),
  };
}
