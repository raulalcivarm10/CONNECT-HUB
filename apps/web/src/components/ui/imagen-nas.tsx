'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { nasImagenUrl, type NasEntidad } from '@/lib/nas';
import { FORMATOS_LEYENDA, validarImagen } from '@/lib/imagenes';
import { useLightbox } from '@/lib/lightbox';
import { useDialogo } from '@/lib/dialogo';

/**
 * Miniatura de imagen del NAS + botón para subir/reemplazar, con leyenda de
 * formatos permitidos y mensajes de error amigables.
 */
export function ImagenNas({
  tipoEntidad,
  id,
  tipoArchivo,
  uploadPath,
  deletePath = null,
  etiqueta = 'Subir',
  className = 'h-10 w-14',
  onChanged,
}: {
  tipoEntidad: NasEntidad;
  id: number;
  tipoArchivo: 'PORTADA' | 'BANNER' | 'GALERIA' | 'LOGO' | 'CROQUIS';
  /** ruta de la API propia que hace proxy al NAS; null = solo lectura */
  uploadPath: string | null;
  /** ruta DELETE de la API para quitar la imagen; null = sin borrado */
  deletePath?: string | null;
  etiqueta?: string;
  className?: string;
  /** se dispara tras subir o eliminar con éxito (p. ej. refrescar una lista) */
  onChanged?: () => void;
}) {
  const [version, setVersion] = useState(0);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subidaOk, setSubidaOk] = useState(false);
  // arranca en false: solo se confirma que hay imagen cuando la <img> carga bien,
  // así el botón ✕ y el zoom no aparecen para ítems sin imagen ni tras borrar.
  const [tieneImagen, setTieneImagen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lightbox = useLightbox();
  const dialogo = useDialogo();
  const src = nasImagenUrl(tipoEntidad, id, tipoArchivo, version);

  async function eliminarImagen() {
    if (!deletePath || subiendo) return;
    const ok = await dialogo.confirmar({
      titulo: '¿Quitar la imagen de este elemento?',
      tono: 'warning',
      confirmar: 'Quitar',
    });
    if (!ok) return;
    setError(null);
    setSubidaOk(false);
    setSubiendo(true);
    try {
      await api.del(deletePath);
      setTieneImagen(false); // oculta ✕/zoom al instante, sin esperar el 404
      setVersion(Date.now()); // la img remonta y al dar 404 queda oculta
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo eliminar la imagen',
      );
    } finally {
      setSubiendo(false);
    }
  }

  async function onFile(file: File | null) {
    if (!file || !uploadPath || subiendo) return;
    setError(null);
    setSubidaOk(false);
    const problema = validarImagen(file);
    if (problema) {
      setError(problema);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      await api.upload(uploadPath, fd);
      setVersion(Date.now());
      setSubidaOk(true);
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo subir la imagen. Inténtalo de nuevo.',
      );
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* key=version remonta la img: recarga tras subir y reintenta el onError */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={version}
        src={src}
        alt=""
        loading="lazy"
        onClick={() => tieneImagen && lightbox.open(src)}
        className={`shrink-0 rounded-lg border border-border-app object-cover ${tieneImagen ? 'cursor-zoom-in' : ''} ${className}`}
        onLoad={() => setTieneImagen(true)}
        onError={(e) => {
          setTieneImagen(false);
          e.currentTarget.style.visibility = 'hidden';
        }}
      />
      {uploadPath && (
        <div className="min-w-0">
          <input
            ref={inputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={subiendo}
              className="rounded-lg border border-border-app px-2 py-1 text-xs text-text-2 transition hover:bg-surface-2 disabled:opacity-50"
            >
              {subiendo ? 'Procesando…' : etiqueta}
            </button>
            {deletePath && tieneImagen && (
              <button
                type="button"
                onClick={eliminarImagen}
                disabled={subiendo}
                title="Quitar imagen"
                className="rounded-lg border border-border-app px-1.5 py-1 text-xs text-danger transition hover:bg-surface-2 disabled:opacity-50"
              >
                ✕
              </button>
            )}
          </span>
          <div
            className={`mt-0.5 max-w-44 text-[10px] leading-tight ${
              error
                ? 'font-medium text-danger'
                : subidaOk
                  ? 'font-medium text-success'
                  : 'text-text-muted'
            }`}
            title={error ?? FORMATOS_LEYENDA()}
          >
            {error ?? (subidaOk ? '✓' : FORMATOS_LEYENDA())}
          </div>
        </div>
      )}
    </div>
  );
}
