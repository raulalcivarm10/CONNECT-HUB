import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OracleService } from '../../database/oracle.service';
import { RedisService } from '../../redis/redis.service';
import { JwtUser } from '../../auth/types';
import { ScopeService } from './scope.service';
import { UpdateMapaDto } from './dto/operativa.dto';

export interface NuevoMapa {
  idInstitucion?: number;
  nombreMapa: string;
  descripcion?: string;
  idLocal?: number;
  idSalon?: number;
  idSubsalon?: number;
  idConfiguracion?: number;
  subsalones?: number[];
  imagen: Buffer;
  mimeType: string;
  filename: string;
}

const MIMES_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const CACHE_TTL = 3600; // 1 hora

@Injectable()
export class MapasService {
  constructor(
    private readonly oracle: OracleService,
    private readonly redis: RedisService,
    private readonly scope: ScopeService,
  ) {}

  list(actor: JwtUser, idInstitucion?: number) {
    const filtro = this.scope.institucionForRead(actor, idInstitucion);
    return this.oracle.query(
      `SELECT m.ID_MAPA, m.ID_INSTITUCION, m.NOMBRE_MAPA, m.DESCRIPCION,
              m.ID_LOCAL, m.ID_SALON, m.ID_SUBSALON, m.ID_CONFIGURACION,
              m.ASIGNADO, m.ACTIVO, m.FECHA_REGISTRO,
              m.IMAGEN_MIME_TYPE, m.IMAGEN_FILENAME, m.IMAGEN_LAST_UPDATE,
              i.NOMBRE AS INSTITUCION, l.NOMBRE AS LOCAL_NOMBRE,
              s.NOMBRE AS SALON_NOMBRE, ss.NOMBRE AS SUBSALON_NOMBRE,
              c.NOMBRE AS CONFIGURACION_NOMBRE,
              (SELECT LISTAGG(ims.ID_SUBSALON, ',') WITHIN GROUP (ORDER BY ims.ID_SUBSALON)
                 FROM INSTITUCION_MAPA_SUBSALONES ims
                WHERE ims.ID_MAPA = m.ID_MAPA) AS SUBSALONES_IDS
         FROM INSTITUCION_MAPAS m
         JOIN INSTITUCIONES i ON i.ID_INSTITUCION = m.ID_INSTITUCION
         LEFT JOIN LOCALES l ON l.ID_LOCAL = m.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = m.ID_SALON
         LEFT JOIN SUBSALONES ss ON ss.ID_SUBSALON = m.ID_SUBSALON
         LEFT JOIN SUBSALON_CONFIGURACIONES c ON c.ID_CONFIGURACION = m.ID_CONFIGURACION
        WHERE (:filtro IS NULL OR m.ID_INSTITUCION = :filtro)
        ORDER BY m.FECHA_REGISTRO DESC`,
      { filtro },
    );
  }

  async create(actor: JwtUser, mapa: NuevoMapa) {
    const idInstitucion = this.scope.institucionForWrite(
      actor,
      mapa.idInstitucion,
    );
    if (!MIMES_PERMITIDOS.includes(mapa.mimeType)) {
      throw new BadRequestException(
        `Image type not allowed (${mapa.mimeType}). Use a JPG, PNG, WebP or SVG image.`,
      );
    }
    if (mapa.idLocal) await this.scope.local(actor, mapa.idLocal);
    if (mapa.idSalon) await this.scope.salon(actor, mapa.idSalon);
    if (mapa.idSubsalon) await this.scope.subsalon(actor, mapa.idSubsalon);
    if (mapa.idConfiguracion)
      await this.scope.configuracion(actor, mapa.idConfiguracion);

    return this.oracle.withConnection(async (conn) => {
      const result = await conn.execute(
        `INSERT INTO INSTITUCION_MAPAS
           (ID_INSTITUCION, NOMBRE_MAPA, DESCRIPCION, ID_LOCAL, ID_SALON,
            ID_SUBSALON, ID_CONFIGURACION, IMAGEN, IMAGEN_MIME_TYPE,
            IMAGEN_FILENAME, IMAGEN_LAST_UPDATE, ASIGNADO, ACTIVO)
         VALUES (:idInstitucion, :nombre, :descripcion, :idLocal, :idSalon,
                 :idSubsalon, :idConfiguracion, :imagen, :mime,
                 :filename, SYSDATE, :asignado, 'Y')
         RETURNING ID_MAPA INTO :out`,
        {
          idInstitucion,
          nombre: mapa.nombreMapa,
          descripcion: mapa.descripcion ?? null,
          idLocal: mapa.idLocal ?? null,
          idSalon: mapa.idSalon ?? null,
          idSubsalon: mapa.idSubsalon ?? null,
          idConfiguracion: mapa.idConfiguracion ?? null,
          imagen: mapa.imagen,
          mime: mapa.mimeType,
          filename: mapa.filename,
          asignado:
            mapa.idLocal || mapa.idSalon || mapa.idSubsalon || mapa.idConfiguracion
              ? 'Y'
              : 'N',
          out: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER },
        },
      );
      const idMapa = (result.outBinds as { out: number[] }).out[0];
      for (const idSubsalon of mapa.subsalones ?? []) {
        await conn.execute(
          `INSERT INTO INSTITUCION_MAPA_SUBSALONES (ID_MAPA, ID_SUBSALON)
           VALUES (:idMapa, :idSubsalon)`,
          { idMapa, idSubsalon },
        );
      }
      await conn.commit();
      return { idMapa, idInstitucion };
    });
  }

  /** Imagen del mapa con caché Redis keyed por IMAGEN_LAST_UPDATE */
  async imagen(
    actor: JwtUser,
    idMapa: number,
  ): Promise<{ buffer: Buffer; mime: string; etag: string; filename: string }> {
    await this.scope.mapa(actor, idMapa);
    const meta = await this.oracle.query<{
      IMAGEN_MIME_TYPE: string | null;
      IMAGEN_FILENAME: string | null;
      IMAGEN_LAST_UPDATE: Date | null;
    }>(
      `SELECT IMAGEN_MIME_TYPE, IMAGEN_FILENAME, IMAGEN_LAST_UPDATE
         FROM INSTITUCION_MAPAS WHERE ID_MAPA = :id`,
      { id: idMapa },
    );
    if (!meta[0]) throw new NotFoundException('Map not found');
    const etag = `"m${idMapa}-${meta[0].IMAGEN_LAST_UPDATE?.getTime() ?? 0}"`;
    const mime = meta[0].IMAGEN_MIME_TYPE ?? 'application/octet-stream';
    const filename = meta[0].IMAGEN_FILENAME ?? `mapa-${idMapa}`;

    const cacheKey = `mapa:img:${idMapa}:${etag}`;
    const cached = await this.redis.client.getBuffer(cacheKey);
    if (cached) return { buffer: cached, mime, etag, filename };

    const rows = await this.oracle.query<{ IMAGEN: Buffer }>(
      `SELECT IMAGEN FROM INSTITUCION_MAPAS WHERE ID_MAPA = :id`,
      { id: idMapa },
    );
    const buffer = rows[0]?.IMAGEN;
    if (!buffer) throw new NotFoundException('The map has no image');
    await this.redis.client.set(cacheKey, buffer, 'EX', CACHE_TTL);
    return { buffer, mime, etag, filename };
  }

  async update(actor: JwtUser, idMapa: number, dto: UpdateMapaDto) {
    await this.scope.mapa(actor, idMapa);
    if (dto.idLocal) await this.scope.local(actor, dto.idLocal);
    if (dto.idSalon) await this.scope.salon(actor, dto.idSalon);
    if (dto.idSubsalon) await this.scope.subsalon(actor, dto.idSubsalon);
    if (dto.idConfiguracion)
      await this.scope.configuracion(actor, dto.idConfiguracion);

    await this.oracle.withConnection(async (conn) => {
      await conn.execute(
        `UPDATE INSTITUCION_MAPAS SET
           NOMBRE_MAPA = NVL(:nombre, NOMBRE_MAPA),
           DESCRIPCION = COALESCE(:descripcion, DESCRIPCION),
           ID_LOCAL = COALESCE(:idLocal, ID_LOCAL),
           ID_SALON = COALESCE(:idSalon, ID_SALON),
           ID_SUBSALON = COALESCE(:idSubsalon, ID_SUBSALON),
           ID_CONFIGURACION = COALESCE(:idConfiguracion, ID_CONFIGURACION),
           ACTIVO = NVL(:activo, ACTIVO),
           ASIGNADO = CASE
             WHEN COALESCE(:idLocal, ID_LOCAL) IS NOT NULL
               OR COALESCE(:idSalon, ID_SALON) IS NOT NULL
               OR COALESCE(:idSubsalon, ID_SUBSALON) IS NOT NULL
               OR COALESCE(:idConfiguracion, ID_CONFIGURACION) IS NOT NULL
             THEN 'Y' ELSE 'N' END
         WHERE ID_MAPA = :id`,
        {
          nombre: dto.nombreMapa ?? null,
          descripcion: dto.descripcion ?? null,
          idLocal: dto.idLocal ?? null,
          idSalon: dto.idSalon ?? null,
          idSubsalon: dto.idSubsalon ?? null,
          idConfiguracion: dto.idConfiguracion ?? null,
          activo: dto.activo == null ? null : dto.activo ? 'Y' : 'N',
          id: idMapa,
        },
      );
      if (dto.subsalones) {
        await conn.execute(
          `DELETE FROM INSTITUCION_MAPA_SUBSALONES WHERE ID_MAPA = :id`,
          { id: idMapa },
        );
        for (const idSubsalon of dto.subsalones) {
          await conn.execute(
            `INSERT INTO INSTITUCION_MAPA_SUBSALONES (ID_MAPA, ID_SUBSALON)
             VALUES (:id, :idSubsalon)`,
            { id: idMapa, idSubsalon },
          );
        }
      }
      await conn.commit();
    });
    return { idMapa };
  }

  async remove(actor: JwtUser, idMapa: number) {
    await this.scope.mapa(actor, idMapa);
    await this.oracle.withConnection(async (conn) => {
      await conn.execute(
        `DELETE FROM INSTITUCION_MAPA_SUBSALONES WHERE ID_MAPA = :id`,
        { id: idMapa },
      );
      await conn.execute(
        `DELETE FROM INSTITUCION_MAPAS WHERE ID_MAPA = :id`,
        { id: idMapa },
      );
      await conn.commit();
    });
    await this.redis.invalidate(`mapa:img:${idMapa}:*`);
    return { idMapa, eliminado: true };
  }
}
