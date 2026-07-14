import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { OracleService } from '../../database/oracle.service';
import { JwtUser } from '../../auth/types';
import { ScopeService } from './scope.service';
import {
  CreateConfiguracionDto,
  UpdateConfiguracionDto,
} from './dto/operativa.dto';

@Injectable()
export class ConfiguracionesService {
  constructor(
    private readonly oracle: OracleService,
    private readonly scope: ScopeService,
  ) {}

  async listBySalon(actor: JwtUser, idSalon: number) {
    await this.scope.salon(actor, idSalon);
    return this.oracle.query(
      `SELECT c.ID_CONFIGURACION, c.ID_SALON, c.NOMBRE, c.ACTIVO, c.FECHA_REGISTRO,
              (SELECT LISTAGG(scs.ID_SUBSALON, ',') WITHIN GROUP (ORDER BY scs.ID_SUBSALON)
                 FROM SUBSALON_CONFIGURACION_SUBSALONES scs
                WHERE scs.ID_CONFIGURACION = c.ID_CONFIGURACION) AS SUBSALONES_IDS,
              (SELECT LISTAGG(ss.NOMBRE, ' + ') WITHIN GROUP (ORDER BY ss.NOMBRE)
                 FROM SUBSALON_CONFIGURACION_SUBSALONES scs
                 JOIN SUBSALONES ss ON ss.ID_SUBSALON = scs.ID_SUBSALON
                WHERE scs.ID_CONFIGURACION = c.ID_CONFIGURACION) AS SUBSALONES_NOMBRES
         FROM SUBSALON_CONFIGURACIONES c
        WHERE c.ID_SALON = :idSalon
        ORDER BY c.NOMBRE`,
      { idSalon },
    );
  }

  /**
   * Evita duplicados dentro del salón: mismo nombre o exactamente el mismo
   * conjunto de subsalones que otra configuración existente.
   */
  private async validarDuplicados(
    idSalon: number,
    nombre: string | undefined,
    subsalones: number[] | undefined,
    excluir?: number,
  ) {
    if (nombre) {
      const porNombre = await this.oracle.query<{ N: number }>(
        `SELECT COUNT(*) AS N FROM SUBSALON_CONFIGURACIONES
          WHERE ID_SALON = :idSalon AND UPPER(NOMBRE) = UPPER(:nombre)
            AND ID_CONFIGURACION != :excluir`,
        { idSalon, nombre, excluir: excluir ?? -1 },
      );
      if (porNombre[0].N > 0) {
        throw new ConflictException(
          `A configuration named '${nombre}' already exists in this hall.`,
        );
      }
    }
    if (subsalones?.length) {
      const set = [...subsalones].sort((a, b) => a - b).join(',');
      const existentes = await this.oracle.query<{
        ID_CONFIGURACION: number;
        NOMBRE: string | null;
        SUBS: string | null;
      }>(
        `SELECT c.ID_CONFIGURACION, c.NOMBRE,
                (SELECT LISTAGG(scs.ID_SUBSALON, ',') WITHIN GROUP (ORDER BY scs.ID_SUBSALON)
                   FROM SUBSALON_CONFIGURACION_SUBSALONES scs
                  WHERE scs.ID_CONFIGURACION = c.ID_CONFIGURACION) AS SUBS
           FROM SUBSALON_CONFIGURACIONES c
          WHERE c.ID_SALON = :idSalon AND c.ID_CONFIGURACION != :excluir`,
        { idSalon, excluir: excluir ?? -1 },
      );
      const igual = existentes.find((e) => e.SUBS === set);
      if (igual) {
        throw new ConflictException(
          `A configuration with exactly those sub-halls already exists: ` +
            `'${igual.NOMBRE ?? `#${igual.ID_CONFIGURACION}`}'.`,
        );
      }
    }
  }

  /** Los subsalones de una configuración deben pertenecer al mismo salón */
  private async validarSubsalones(idSalon: number, subsalones: number[]) {
    const binds: Record<string, number> = { idSalon };
    subsalones.forEach((s, i) => (binds[`s${i}`] = s));
    const placeholders = subsalones.map((_, i) => `:s${i}`).join(',');
    const rows = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N FROM SUBSALONES
        WHERE ID_SALON = :idSalon AND ID_SUBSALON IN (${placeholders})`,
      binds,
    );
    if (rows[0].N !== subsalones.length) {
      throw new BadRequestException(
        'All sub-halls must exist and belong to the same hall',
      );
    }
  }

  async create(actor: JwtUser, dto: CreateConfiguracionDto) {
    await this.scope.salon(actor, dto.idSalon);
    await this.validarSubsalones(dto.idSalon, dto.subsalones);
    await this.validarDuplicados(dto.idSalon, dto.nombre, dto.subsalones);
    return this.oracle.withConnection(async (conn) => {
      const result = await conn.execute(
        `INSERT INTO SUBSALON_CONFIGURACIONES (ID_SALON, NOMBRE, ACTIVO)
         VALUES (:idSalon, :nombre, 'Y')
         RETURNING ID_CONFIGURACION INTO :out`,
        {
          idSalon: dto.idSalon,
          nombre: dto.nombre,
          out: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER },
        },
      );
      const id = (result.outBinds as { out: number[] }).out[0];
      for (const idSubsalon of dto.subsalones) {
        await conn.execute(
          `INSERT INTO SUBSALON_CONFIGURACION_SUBSALONES (ID_CONFIGURACION, ID_SUBSALON)
           VALUES (:id, :idSubsalon)`,
          { id, idSubsalon },
        );
      }
      await conn.commit();
      return { idConfiguracion: id, subsalones: dto.subsalones };
    });
  }

  async update(actor: JwtUser, id: number, dto: UpdateConfiguracionDto) {
    const { ID_SALON } = await this.scope.configuracion(actor, id);
    if (dto.subsalones) {
      await this.validarSubsalones(ID_SALON, dto.subsalones);
    }
    await this.validarDuplicados(ID_SALON, dto.nombre, dto.subsalones, id);
    await this.oracle.withConnection(async (conn) => {
      await conn.execute(
        `UPDATE SUBSALON_CONFIGURACIONES SET
           NOMBRE = NVL(:nombre, NOMBRE),
           ACTIVO = NVL(:activo, ACTIVO)
         WHERE ID_CONFIGURACION = :id`,
        {
          nombre: dto.nombre ?? null,
          activo: dto.activo == null ? null : dto.activo ? 'Y' : 'N',
          id,
        },
      );
      if (dto.subsalones) {
        await conn.execute(
          `DELETE FROM SUBSALON_CONFIGURACION_SUBSALONES WHERE ID_CONFIGURACION = :id`,
          { id },
        );
        for (const idSubsalon of dto.subsalones) {
          await conn.execute(
            `INSERT INTO SUBSALON_CONFIGURACION_SUBSALONES (ID_CONFIGURACION, ID_SUBSALON)
             VALUES (:id, :idSubsalon)`,
            { id, idSubsalon },
          );
        }
      }
      await conn.commit();
    });
    return { idConfiguracion: id };
  }

  async remove(actor: JwtUser, id: number) {
    await this.scope.configuracion(actor, id);
    const nom = await this.oracle.query<{ NOMBRE: string | null }>(
      `SELECT NOMBRE FROM SUBSALON_CONFIGURACIONES WHERE ID_CONFIGURACION = :id`,
      { id },
    );
    const nombre = nom[0]?.NOMBRE ?? `#${id}`;

    const eventos = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N FROM EVENTOS WHERE ID_CONFIGURACION = :id`,
      { id },
    );
    if (eventos[0].N > 0) {
      throw new ConflictException(
        `Cannot delete configuration '${nombre}': ${eventos[0].N} created event(s) use it as their reserved space.`,
      );
    }
    const mapas = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N FROM INSTITUCION_MAPAS WHERE ID_CONFIGURACION = :id`,
      { id },
    );
    if (mapas[0].N > 0) {
      throw new ConflictException(
        `Cannot delete configuration '${nombre}': it is assigned to ${mapas[0].N} map(s)/floor plan(s). ` +
          `Unassign it from the maps first.`,
      );
    }
    await this.oracle.withConnection(async (conn) => {
      await conn.execute(
        `DELETE FROM SUBSALON_CONFIGURACION_SUBSALONES WHERE ID_CONFIGURACION = :id`,
        { id },
      );
      await conn.execute(
        `DELETE FROM SUBSALON_CONFIGURACIONES WHERE ID_CONFIGURACION = :id`,
        { id },
      );
      await conn.commit();
    });
    return { idConfiguracion: id, eliminado: true };
  }
}
