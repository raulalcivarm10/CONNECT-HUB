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
  return { archivo, campos };
}
