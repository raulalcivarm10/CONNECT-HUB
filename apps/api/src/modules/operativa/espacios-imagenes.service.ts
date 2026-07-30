import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtUser } from '../../auth/types';
import { OracleService } from '../../database/oracle.service';
import { RedisService } from '../../redis/redis.service';
import { ArchivosService } from '../archivos/archivos.service';
import { ArchivoSubido } from '../archivos/multipart.util';
import { TipoEntidad } from '../archivos/nas.service';
import { ScopeService } from './scope.service';

const CACHE_TTL = 600; // 10 min

/**
 * Imágenes de referencia de la jerarquía física (local → salón → subsalón →
 * configuración). LOCAL/SALON/SUBSALON van al NAS (tabla ARCHIVOS) como hasta
 * ahora. CONFIGURACION se guarda EN NUESTRA BD (SUBSALON_CONFIGURACIONES.IMAGEN,
 * patrón de INSTITUCION_MAPAS): el NAS desplegado no soporta esa entidad
 * (docs/nas-espacios.md sigue pendiente con su equipo) y así funciona hoy sin
 * depender de ellos, con las MISMAS rutas del panel.
 */
@Injectable()
export class EspaciosImagenesService {
  constructor(
    private readonly scope: ScopeService,
    private readonly archivos: ArchivosService,
    private readonly oracle: OracleService,
    private readonly redis: RedisService,
  ) {}

  private async verificarAmbito(
    actor: JwtUser,
    tipoEntidad: TipoEntidad,
    id: number,
  ) {
    switch (tipoEntidad) {
      case 'LOCAL':
        return this.scope.local(actor, id);
      case 'SALON':
        return this.scope.salon(actor, id);
      case 'SUBSALON':
        return this.scope.subsalon(actor, id);
      case 'CONFIGURACION':
        return this.scope.configuracion(actor, id);
      default:
        throw new Error(`Entidad no soportada aquí: ${tipoEntidad}`);
    }
  }

  async subir(
    actor: JwtUser,
    tipoEntidad: TipoEntidad,
    id: number,
    archivo: ArchivoSubido,
  ) {
    await this.verificarAmbito(actor, tipoEntidad, id);
    if (tipoEntidad === 'CONFIGURACION') {
      await this.oracle.execute(
        `UPDATE SUBSALON_CONFIGURACIONES SET
           IMAGEN = :imagen, IMAGEN_MIME_TYPE = :mime,
           IMAGEN_FILENAME = :filename, IMAGEN_LAST_UPDATE = SYSDATE
         WHERE ID_CONFIGURACION = :id`,
        {
          imagen: archivo.buffer,
          mime: archivo.mimetype,
          filename: archivo.filename,
          id,
        },
      );
      await this.redis.invalidate(`config:img:${id}:*`);
      return { tipoEntidad, id, url: `/configuraciones/${id}/imagen` };
    }
    const resultado = await this.archivos.subirYReemplazar({
      tipoEntidad,
      id,
      tipoArchivo: 'CROQUIS',
      archivo,
    });
    return { tipoEntidad, id, ...resultado };
  }

  async eliminar(actor: JwtUser, tipoEntidad: TipoEntidad, id: number) {
    await this.verificarAmbito(actor, tipoEntidad, id);
    if (tipoEntidad === 'CONFIGURACION') {
      await this.oracle.execute(
        `UPDATE SUBSALON_CONFIGURACIONES SET
           IMAGEN = NULL, IMAGEN_MIME_TYPE = NULL,
           IMAGEN_FILENAME = NULL, IMAGEN_LAST_UPDATE = SYSDATE
         WHERE ID_CONFIGURACION = :id`,
        { id },
      );
      await this.redis.invalidate(`config:img:${id}:*`);
      return { tipoEntidad, id, eliminado: true };
    }
    const r = await this.archivos.eliminarImagen(tipoEntidad, id, 'CROQUIS');
    return { tipoEntidad, id, ...r };
  }

  /**
   * Imagen de una configuración (lectura PÚBLICA — los croquis no son
   * sensibles, igual que las URLs públicas del NAS). Caché Redis + ETag.
   */
  async imagenConfiguracion(
    id: number,
  ): Promise<{ buffer: Buffer; mime: string; etag: string; filename: string }> {
    const meta = await this.oracle.query<{
      IMAGEN_MIME_TYPE: string | null;
      IMAGEN_FILENAME: string | null;
      IMAGEN_LAST_UPDATE: Date | null;
    }>(
      `SELECT IMAGEN_MIME_TYPE, IMAGEN_FILENAME, IMAGEN_LAST_UPDATE
         FROM SUBSALON_CONFIGURACIONES
        WHERE ID_CONFIGURACION = :id AND IMAGEN IS NOT NULL`,
      { id },
    );
    if (!meta[0]) throw new NotFoundException('The layout has no image');
    const etag = `"c${id}-${meta[0].IMAGEN_LAST_UPDATE?.getTime() ?? 0}"`;
    const mime = meta[0].IMAGEN_MIME_TYPE ?? 'application/octet-stream';
    const filename = meta[0].IMAGEN_FILENAME ?? `configuracion-${id}`;

    const cacheKey = `config:img:${id}:${etag}`;
    const cached = await this.redis.client.getBuffer(cacheKey);
    if (cached) return { buffer: cached, mime, etag, filename };

    const rows = await this.oracle.query<{ IMAGEN: Buffer }>(
      `SELECT IMAGEN FROM SUBSALON_CONFIGURACIONES WHERE ID_CONFIGURACION = :id`,
      { id },
    );
    const buffer = rows[0]?.IMAGEN;
    if (!buffer) throw new NotFoundException('The layout has no image');
    await this.redis.client.set(cacheKey, buffer, 'EX', CACHE_TTL);
    return { buffer, mime, etag, filename };
  }
}
