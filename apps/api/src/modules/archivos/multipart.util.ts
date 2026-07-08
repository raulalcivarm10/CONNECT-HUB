import { BadRequestException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';

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
    throw new BadRequestException('Se espera multipart/form-data');
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
        `La imagen supera el tamaño máximo de ${MAX_IMAGEN_MB} MB. ` +
          `Comprímela o usa una resolución menor.`,
      );
    }
    throw err;
  }
  if (!archivo?.buffer.length) {
    throw new BadRequestException('Falta el archivo de imagen (campo file)');
  }
  if (!MIMES_IMAGEN.includes(archivo.mimetype)) {
    throw new BadRequestException(
      `El archivo «${archivo.filename}» no es un formato permitido. ` +
        `Usa una imagen PNG, JPG/JPEG o WebP.`,
    );
  }
  return { archivo, campos };
}
