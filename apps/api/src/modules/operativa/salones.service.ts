import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { OracleService } from '../../database/oracle.service';
import { JwtUser } from '../../auth/types';
import { ScopeService } from './scope.service';
import {
  CreateSalonDto,
  CreateSubsalonDto,
  UpdateSalonDto,
  UpdateSubsalonDto,
} from './dto/operativa.dto';

@Injectable()
export class SalonesService {
  constructor(
    private readonly oracle: OracleService,
    private readonly scope: ScopeService,
  ) {}

  async listByLocal(actor: JwtUser, idLocal: number) {
    await this.scope.local(actor, idLocal);
    return this.oracle.query(
      `SELECT s.ID_SALON, s.ID_LOCAL, s.NOMBRE, s.ES_SUBDIVISIBLE, s.CAPACIDAD_MAX,
              s.FECHA_REGISTRO,
              (SELECT COUNT(*) FROM SUBSALONES ss WHERE ss.ID_SALON = s.ID_SALON) AS TOTAL_SUBSALONES,
              (SELECT COUNT(*) FROM SUBSALON_CONFIGURACIONES c WHERE c.ID_SALON = s.ID_SALON) AS TOTAL_CONFIGURACIONES
         FROM SALONES s
        WHERE s.ID_LOCAL = :idLocal
        ORDER BY s.NOMBRE`,
      { idLocal },
    );
  }

  async create(actor: JwtUser, dto: CreateSalonDto) {
    await this.scope.local(actor, dto.idLocal);
    const result = await this.oracle.execute(
      `INSERT INTO SALONES (ID_LOCAL, NOMBRE, ES_SUBDIVISIBLE, CAPACIDAD_MAX)
       VALUES (:idLocal, :nombre, :subdiv, :capacidad)
       RETURNING ID_SALON INTO :out`,
      {
        idLocal: dto.idLocal,
        nombre: dto.nombre,
        subdiv: dto.esSubdivisible ? 'S' : 'N',
        capacidad: dto.capacidadMax ?? null,
        out: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER },
      },
    );
    return { idSalon: (result.outBinds as { out: number[] }).out[0] };
  }

  /**
   * La suma de capacidades de los subsalones no puede superar la capacidad
   * máxima del salón. `excluirSubsalon` permite recalcular al editar uno.
   */
  private async validarCapacidad(
    idSalon: number,
    capacidadNueva: number | undefined,
    excluirSubsalon?: number,
  ) {
    if (capacidadNueva == null) return;
    const salon = await this.oracle.query<{
      NOMBRE: string;
      CAPACIDAD_MAX: number | null;
    }>(`SELECT NOMBRE, CAPACIDAD_MAX FROM SALONES WHERE ID_SALON = :id`, {
      id: idSalon,
    });
    const capSalon = salon[0]?.CAPACIDAD_MAX;
    if (capSalon == null) return; // salón sin límite definido
    const suma = await this.oracle.query<{ TOTAL: number }>(
      `SELECT NVL(SUM(CAPACIDAD_MAX), 0) AS TOTAL
         FROM SUBSALONES
        WHERE ID_SALON = :id AND ID_SUBSALON != :excluir`,
      { id: idSalon, excluir: excluirSubsalon ?? -1 },
    );
    const ocupado = suma[0].TOTAL;
    if (ocupado + capacidadNueva > capSalon) {
      const disponible = Math.max(0, capSalon - ocupado);
      throw new BadRequestException(
        `La capacidad del salón «${salon[0].NOMBRE}» es ${capSalon} y sus ` +
          `subsalones ya suman ${ocupado}: solo quedan ${disponible} de capacidad ` +
          `disponible, no puedes asignar ${capacidadNueva}.`,
      );
    }
  }

  async update(actor: JwtUser, idSalon: number, dto: UpdateSalonDto) {
    await this.scope.salon(actor, idSalon);
    // no permitir reducir la capacidad por debajo de lo que suman sus subsalones
    if (dto.capacidadMax != null) {
      const suma = await this.oracle.query<{ TOTAL: number }>(
        `SELECT NVL(SUM(CAPACIDAD_MAX), 0) AS TOTAL FROM SUBSALONES WHERE ID_SALON = :id`,
        { id: idSalon },
      );
      if (suma[0].TOTAL > dto.capacidadMax) {
        throw new BadRequestException(
          `No puedes fijar la capacidad del salón en ${dto.capacidadMax}: ` +
            `sus subsalones actuales suman ${suma[0].TOTAL}. ` +
            `Ajusta primero las capacidades de los subsalones.`,
        );
      }
    }
    await this.oracle.execute(
      `UPDATE SALONES SET
         NOMBRE = NVL(:nombre, NOMBRE),
         ES_SUBDIVISIBLE = NVL(:subdiv, ES_SUBDIVISIBLE),
         CAPACIDAD_MAX = COALESCE(:capacidad, CAPACIDAD_MAX)
       WHERE ID_SALON = :id`,
      {
        nombre: dto.nombre ?? null,
        subdiv:
          dto.esSubdivisible == null ? null : dto.esSubdivisible ? 'S' : 'N',
        // tipado explícito: bind numérico nulo dentro de COALESCE (ORA-00932)
        capacidad: { val: dto.capacidadMax ?? null, type: this.oracle.NUMBER },
        id: idSalon,
      },
    );
    return { idSalon };
  }

  private async nombreSalon(idSalon: number): Promise<string> {
    const r = await this.oracle.query<{ NOMBRE: string }>(
      `SELECT NOMBRE FROM SALONES WHERE ID_SALON = :id`,
      { id: idSalon },
    );
    return r[0]?.NOMBRE ?? `#${idSalon}`;
  }

  async remove(actor: JwtUser, idSalon: number) {
    await this.scope.salon(actor, idSalon);
    const nombre = await this.nombreSalon(idSalon);

    const eventos = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N FROM EVENTOS WHERE ID_SALON = :id`,
      { id: idSalon },
    );
    if (eventos[0].N > 0) {
      throw new ConflictException(
        `No se puede eliminar el salón «${nombre}»: tiene ${eventos[0].N} evento(s) creado(s). ` +
          `Un salón con eventos no puede eliminarse.`,
      );
    }
    const subsalones = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N FROM SUBSALONES WHERE ID_SALON = :id`,
      { id: idSalon },
    );
    if (subsalones[0].N > 0) {
      throw new ConflictException(
        `No se puede eliminar el salón «${nombre}»: tiene ${subsalones[0].N} subsalón(es). ` +
          `Elimina primero sus subsalones.`,
      );
    }
    const configuraciones = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N FROM SUBSALON_CONFIGURACIONES WHERE ID_SALON = :id`,
      { id: idSalon },
    );
    if (configuraciones[0].N > 0) {
      throw new ConflictException(
        `No se puede eliminar el salón «${nombre}»: tiene ${configuraciones[0].N} configuración(es) de subdivisión. ` +
          `Elimina primero sus configuraciones.`,
      );
    }
    await this.oracle.execute(`DELETE FROM SALONES WHERE ID_SALON = :id`, {
      id: idSalon,
    });
    return { idSalon, eliminado: true };
  }

  // ---------- Subsalones ----------

  async listSubsalones(actor: JwtUser, idSalon: number) {
    await this.scope.salon(actor, idSalon);
    return this.oracle.query(
      `SELECT ID_SUBSALON, ID_SALON, NOMBRE, CAPACIDAD_MAX, FECHA_REGISTRO
         FROM SUBSALONES WHERE ID_SALON = :idSalon ORDER BY NOMBRE`,
      { idSalon },
    );
  }

  async createSubsalon(actor: JwtUser, dto: CreateSubsalonDto) {
    await this.scope.salon(actor, dto.idSalon);
    await this.validarCapacidad(dto.idSalon, dto.capacidadMax);
    const result = await this.oracle.execute(
      `INSERT INTO SUBSALONES (ID_SALON, NOMBRE, CAPACIDAD_MAX)
       VALUES (:idSalon, :nombre, :capacidad)
       RETURNING ID_SUBSALON INTO :out`,
      {
        idSalon: dto.idSalon,
        nombre: dto.nombre,
        capacidad: dto.capacidadMax ?? null,
        out: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER },
      },
    );
    return { idSubsalon: (result.outBinds as { out: number[] }).out[0] };
  }

  async updateSubsalon(actor: JwtUser, idSubsalon: number, dto: UpdateSubsalonDto) {
    const { ID_SALON } = await this.scope.subsalon(actor, idSubsalon);
    await this.validarCapacidad(ID_SALON, dto.capacidadMax, idSubsalon);
    await this.oracle.execute(
      `UPDATE SUBSALONES SET
         NOMBRE = NVL(:nombre, NOMBRE),
         CAPACIDAD_MAX = COALESCE(:capacidad, CAPACIDAD_MAX)
       WHERE ID_SUBSALON = :id`,
      {
        nombre: dto.nombre ?? null,
        capacidad: { val: dto.capacidadMax ?? null, type: this.oracle.NUMBER },
        id: idSubsalon,
      },
    );
    return { idSubsalon };
  }

  async removeSubsalon(actor: JwtUser, idSubsalon: number) {
    await this.scope.subsalon(actor, idSubsalon);
    const nom = await this.oracle.query<{ NOMBRE: string }>(
      `SELECT NOMBRE FROM SUBSALONES WHERE ID_SUBSALON = :id`,
      { id: idSubsalon },
    );
    const nombre = nom[0]?.NOMBRE ?? `#${idSubsalon}`;

    const usos: Array<{ sql: string; msg: (n: number) => string }> = [
      {
        sql: `SELECT COUNT(*) AS N FROM SUBSALON_CONFIGURACION_SUBSALONES WHERE ID_SUBSALON = :id`,
        msg: (n) =>
          `No se puede eliminar el subsalón «${nombre}»: forma parte de ${n} configuración(es). ` +
          `Edita o elimina esas configuraciones primero.`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM EVENTO_SUBSALONES WHERE ID_SUBSALON = :id`,
        msg: (n) =>
          `No se puede eliminar el subsalón «${nombre}»: está reservado por ${n} evento(s) creado(s).`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM EVENTOS WHERE ID_SUBSALON = :id`,
        msg: (n) =>
          `No se puede eliminar el subsalón «${nombre}»: ${n} evento(s) lo usan como espacio principal.`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM INSTITUCION_MAPA_SUBSALONES WHERE ID_SUBSALON = :id`,
        msg: (n) =>
          `No se puede eliminar el subsalón «${nombre}»: está asignado a ${n} mapa(s)/croquis. ` +
          `Desasígnalo de los mapas primero.`,
      },
    ];
    for (const uso of usos) {
      const r = await this.oracle.query<{ N: number }>(uso.sql, {
        id: idSubsalon,
      });
      if (r[0].N > 0) throw new ConflictException(uso.msg(r[0].N));
    }

    await this.oracle.execute(
      `DELETE FROM SUBSALONES WHERE ID_SUBSALON = :id`,
      { id: idSubsalon },
    );
    return { idSubsalon, eliminado: true };
  }
}
