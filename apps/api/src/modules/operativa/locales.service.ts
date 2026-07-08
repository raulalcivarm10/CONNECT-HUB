import { ConflictException, Injectable } from '@nestjs/common';
import { OracleService } from '../../database/oracle.service';
import { JwtUser } from '../../auth/types';
import { ArchivosService } from '../archivos/archivos.service';
import { ArchivoSubido } from '../archivos/multipart.util';
import { ScopeService } from './scope.service';
import { CreateLocalDto, UpdateLocalDto } from './dto/operativa.dto';

@Injectable()
export class LocalesService {
  constructor(
    private readonly oracle: OracleService,
    private readonly scope: ScopeService,
    private readonly archivos: ArchivosService,
  ) {}

  list(actor: JwtUser, idInstitucion?: number) {
    const filtro = this.scope.institucionForRead(actor, idInstitucion);
    return this.oracle.query(
      `SELECT l.ID_LOCAL, l.ID_INSTITUCION, l.NOMBRE, l.UBICACION, l.DESCRIPCION,
              l.FECHA_REGISTRO, i.NOMBRE AS INSTITUCION,
              (SELECT COUNT(*) FROM SALONES s WHERE s.ID_LOCAL = l.ID_LOCAL) AS TOTAL_SALONES
         FROM LOCALES l
         JOIN INSTITUCIONES i ON i.ID_INSTITUCION = l.ID_INSTITUCION
        WHERE (:filtro IS NULL OR l.ID_INSTITUCION = :filtro)
        ORDER BY l.NOMBRE`,
      { filtro },
    );
  }

  async create(actor: JwtUser, dto: CreateLocalDto) {
    const idInstitucion = this.scope.institucionForWrite(actor, dto.idInstitucion);
    const result = await this.oracle.execute(
      `INSERT INTO LOCALES (ID_INSTITUCION, NOMBRE, UBICACION, DESCRIPCION)
       VALUES (:idInstitucion, :nombre, :ubicacion, :descripcion)
       RETURNING ID_LOCAL INTO :out`,
      {
        idInstitucion,
        nombre: dto.nombre,
        ubicacion: dto.ubicacion ?? null,
        descripcion: dto.descripcion ?? null,
        out: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER },
      },
    );
    const idLocal = (result.outBinds as { out: number[] }).out[0];
    return { idLocal, idInstitucion };
  }

  async update(actor: JwtUser, idLocal: number, dto: UpdateLocalDto) {
    await this.scope.local(actor, idLocal);
    await this.oracle.execute(
      `UPDATE LOCALES SET
         NOMBRE = NVL(:nombre, NOMBRE),
         UBICACION = COALESCE(:ubicacion, UBICACION),
         DESCRIPCION = COALESCE(:descripcion, DESCRIPCION)
       WHERE ID_LOCAL = :id`,
      {
        nombre: dto.nombre ?? null,
        ubicacion: dto.ubicacion ?? null,
        descripcion: dto.descripcion ?? null,
        id: idLocal,
      },
    );
    return { idLocal };
  }

  async remove(actor: JwtUser, idLocal: number) {
    await this.scope.local(actor, idLocal);
    const nom = await this.oracle.query<{ NOMBRE: string }>(
      `SELECT NOMBRE FROM LOCALES WHERE ID_LOCAL = :id`,
      { id: idLocal },
    );
    const nombre = nom[0]?.NOMBRE ?? `#${idLocal}`;

    // SALONES/EVENTOS no tienen FK declarada hacia LOCALES: verificar a mano
    const eventos = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N FROM EVENTOS WHERE ID_LOCAL = :id`,
      { id: idLocal },
    );
    if (eventos[0].N > 0) {
      throw new ConflictException(
        `No se puede eliminar el local «${nombre}»: tiene ${eventos[0].N} evento(s) creado(s). ` +
          `Un local con eventos no puede eliminarse.`,
      );
    }
    const salones = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N FROM SALONES WHERE ID_LOCAL = :id`,
      { id: idLocal },
    );
    if (salones[0].N > 0) {
      throw new ConflictException(
        `No se puede eliminar el local «${nombre}»: tiene ${salones[0].N} salón(es). ` +
          `Elimina primero sus salones.`,
      );
    }
    const mapas = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N FROM INSTITUCION_MAPAS WHERE ID_LOCAL = :id`,
      { id: idLocal },
    );
    if (mapas[0].N > 0) {
      throw new ConflictException(
        `No se puede eliminar el local «${nombre}»: tiene ${mapas[0].N} mapa(s)/croquis asignado(s). ` +
          `Desasígnalos primero.`,
      );
    }
    await this.oracle.withConnection(async (conn) => {
      // registros de ARCHIVOS del local (croquis/planos): FK, se eliminan aquí
      await conn.execute(`DELETE FROM ARCHIVOS WHERE ID_LOCAL = :id`, {
        id: idLocal,
      });
      await conn.execute(`DELETE FROM LOCALES WHERE ID_LOCAL = :id`, {
        id: idLocal,
      });
      await conn.commit();
    });
    return { idLocal, eliminado: true };
  }

  /** Plano/croquis del local → NAS (deja de usarse el BLOB de INSTITUCION_MAPAS) */
  async subirPlano(actor: JwtUser, idLocal: number, archivo: ArchivoSubido) {
    await this.scope.local(actor, idLocal);
    const resultado = await this.archivos.subirYReemplazar({
      tipoEntidad: 'LOCAL',
      id: idLocal,
      tipoArchivo: 'CROQUIS',
      archivo,
    });
    return { idLocal, ...resultado };
  }
}
