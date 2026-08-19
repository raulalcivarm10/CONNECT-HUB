import { BadRequestException, Logger } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import sharp from 'sharp';
import '@fastify/multipart';

const log = new Logger('ImagenSubida');

/**
 * Lado mayor máximo que se guarda en el NAS.
 *
 * POR QUÉ: no había ningún límite de DIMENSIONES (solo de peso), y entró una
 * portada real de 11384x11384 px y 1,4 MB. Ninguna pantalla de la app ni del
 * panel muestra una imagen a más de ~1200 px, así que todo lo que exceda es
 * peso muerto: ocupa NAS, y la primera petición de cada tamaño tiene que
 * bajarla entera para reducirla.
 *
 * 2000 deja margen de sobra para pantallas de alta densidad y para recortes
 * futuros, sin guardar barbaridades.
 */
const LADO_MAX = 2000;

/**
 * Normaliza la imagen recibida ANTES de guardarla: reduce el lado mayor si hace
 * falta, respeta la orientación EXIF (fotos de móvil salían giradas) y mantiene
 * la proporción — nunca recorta.
 *
 * Si sharp no puede procesarla se devuelve tal cual: es preferible guardar una
 * imagen sin optimizar a rechazarle la subida al organizador.
 */
async function normalizar(archivo: ArchivoSubido): Promise<ArchivoSubido> {
  try {
    const img = sharp(archivo.buffer);
    const { width = 0, height = 0 } = await img.metadata();
    if (width <= LADO_MAX && height <= LADO_MAX) return archivo;

    const buffer = Buffer.from(
      await img
        .rotate()
        .resize({ width: LADO_MAX, height: LADO_MAX, fit: 'inside', withoutEnlargement: true })
        .toBuffer(),
    );
    log.log(
      `${archivo.filename}: ${width}x${height} -> max ${LADO_MAX} ` +
        `(${Math.round(archivo.buffer.length / 1024)} KB -> ${Math.round(buffer.length / 1024)} KB)`,
    );
    return { ...archivo, buffer };
  } catch {
    return archivo; // formato que sharp no entiende: se guarda el original
  }
}

export interface ArchivoSubido {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

export const MIMES_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGEN_MB = 25; // debe coincidir con limits.fileSize de main.ts

/** Lee un multipart con un archivo (campo `file`) y campos de texto */
export async function leerImagenMultipart(req: FastifyRequest): Promise<{
  archivo: ArchivoSubido;
  campos: Record<string, string>;
}> {
  if (!req.isMultipart()) {
    throw new BadRequestException('Expected multipart/form-data');
  }
  let archivo: ArchivoSubido | undefined;
  const campos: Record<string, string> = {};
  try {
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        archivo = {
          buffer: await part.toBuffer(),
          filename: part.filename,
          mimetype: part.mimetype,
        };
      } else {
        campos[part.fieldname] = String(part.value);
      }
    }
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (
      e.code === 'FST_REQ_FILE_TOO_LARGE' ||
      e.message?.includes('file too large')
    ) {
      throw new BadRequestException(
        `The image exceeds the maximum size of ${MAX_IMAGEN_MB} MB. ` +
          `Compress it or use a lower resolution.`,
      );
    }
    throw err;
  }
  if (!archivo?.buffer.length) {
    throw new BadRequestException("Missing image file (field 'file')");
  }
  if (!MIMES_IMAGEN.includes(archivo.mimetype)) {
    throw new BadRequestException(
      `The file "${archivo.filename}" is not an allowed format. ` +
        `Use a PNG, JPG/JPEG or WebP image.`,
    );
  }
  // Se normaliza aquí, en un único punto: así vale para portadas, logos,
  // croquis, fotos de expositor y de perfil sin tocar cada controlador.
  return { archivo: await normalizar(archivo), campos };
}
