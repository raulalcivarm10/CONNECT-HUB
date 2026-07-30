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
              s.PRECIO, s.FECHA_REGISTRO,
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
      `INSERT INTO SALONES (ID_LOCAL, NOMBRE, ES_SUBDIVISIBLE, CAPACIDAD_MAX, PRECIO)
       VALUES (:idLocal, :nombre, :subdiv, :capacidad, :precio)
       RETURNING ID_SALON INTO :out`,
      {
        idLocal: dto.idLocal,
        nombre: dto.nombre,
        subdiv: dto.esSubdivisible ? 'S' : 'N',
        capacidad: dto.capacidadMax ?? null,
        precio: { val: dto.precio ?? null, type: this.oracle.NUMBER },
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
        `The capacity of hall '${salon[0].NOMBRE}' is ${capSalon} and its ` +
          `sub-halls already total ${ocupado}: only ${disponible} capacity ` +
          `remains, so you cannot assign ${capacidadNueva}.`,
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
          `You cannot set the hall capacity to ${dto.capacidadMax}: ` +
            `its current sub-halls total ${suma[0].TOTAL}. ` +
            `Adjust the sub-hall capacities first.`,
        );
      }
    }
    await this.oracle.execute(
      `UPDATE SALONES SET
         NOMBRE = NVL(:nombre, NOMBRE),
         ES_SUBDIVISIBLE = NVL(:subdiv, ES_SUBDIVISIBLE),
         CAPACIDAD_MAX = COALESCE(:capacidad, CAPACIDAD_MAX),
         PRECIO = COALESCE(:precio, PRECIO)
       WHERE ID_SALON = :id`,
      {
        nombre: dto.nombre ?? null,
        subdiv:
          dto.esSubdivisible == null ? null : dto.esSubdivisible ? 'S' : 'N',
        // tipado explícito: bind numérico nulo dentro de COALESCE (ORA-00932)
        capacidad: { val: dto.capacidadMax ?? null, type: this.oracle.NUMBER },
        precio: { val: dto.precio ?? null, type: this.oracle.NUMBER },
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
        `Cannot delete hall '${nombre}': it has ${eventos[0].N} created event(s). ` +
          `A hall with events cannot be deleted.`,
      );
    }
    const subsalones = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N FROM SUBSALONES WHERE ID_SALON = :id`,
      { id: idSalon },
    );
    if (subsalones[0].N > 0) {
      throw new ConflictException(
        `Cannot delete hall '${nombre}': it has ${subsalones[0].N} sub-hall(s). ` +
          `Delete its sub-halls first.`,
      );
    }
    const configuraciones = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N FROM SUBSALON_CONFIGURACIONES WHERE ID_SALON = :id`,
      { id: idSalon },
    );
    if (configuraciones[0].N > 0) {
      throw new ConflictException(
        `Cannot delete hall '${nombre}': it has ${configuraciones[0].N} subdivision configuration(s). ` +
          `Delete its configurations first.`,
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
      `SELECT ID_SUBSALON, ID_SALON, NOMBRE, CAPACIDAD_MAX, PRECIO, FECHA_REGISTRO
         FROM SUBSALONES WHERE ID_SALON = :idSalon ORDER BY NOMBRE`,
      { idSalon },
    );
  }

  async createSubsalon(actor: JwtUser, dto: CreateSubsalonDto) {
    await this.scope.salon(actor, dto.idSalon);
    await this.validarCapacidad(dto.idSalon, dto.capacidadMax);
    const result = await this.oracle.execute(
      `INSERT INTO SUBSALONES (ID_SALON, NOMBRE, CAPACIDAD_MAX, PRECIO)
       VALUES (:idSalon, :nombre, :capacidad, :precio)
       RETURNING ID_SUBSALON INTO :out`,
      {
        idSalon: dto.idSalon,
        nombre: dto.nombre,
        capacidad: dto.capacidadMax ?? null,
        precio: { val: dto.precio ?? null, type: this.oracle.NUMBER },
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
         CAPACIDAD_MAX = COALESCE(:capacidad, CAPACIDAD_MAX),
         PRECIO = COALESCE(:precio, PRECIO)
       WHERE ID_SUBSALON = :id`,
      {
        nombre: dto.nombre ?? null,
        capacidad: { val: dto.capacidadMax ?? null, type: this.oracle.NUMBER },
        precio: { val: dto.precio ?? null, type: this.oracle.NUMBER },
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
          `Cannot delete sub-hall '${nombre}': it is part of ${n} configuration(s). ` +
          `Edit or delete those configurations first.`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM EVENTO_SUBSALONES WHERE ID_SUBSALON = :id`,
        msg: (n) =>
          `Cannot delete sub-hall '${nombre}': it is reserved by ${n} created event(s).`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM EVENTOS WHERE ID_SUBSALON = :id`,
        msg: (n) =>
          `Cannot delete sub-hall '${nombre}': ${n} event(s) use it as their main space.`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM INSTITUCION_MAPA_SUBSALONES WHERE ID_SUBSALON = :id`,
        msg: (n) =>
          `Cannot delete sub-hall '${nombre}': it is assigned to ${n} map(s)/floor plan(s). ` +
          `Unassign it from the maps first.`,
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
