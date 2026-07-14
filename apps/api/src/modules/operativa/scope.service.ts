import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OracleService } from '../../database/oracle.service';
import { JwtUser } from '../../auth/types';

/**
 * Resolución de ámbito por institución para el módulo operativo.
 * Varias relaciones no tienen FK declarada en la BD, así que el ámbito se
 * verifica siempre por JOIN hasta LOCALES.ID_INSTITUCION.
 */
@Injectable()
export class ScopeService {
  constructor(private readonly oracle: OracleService) {}

  /** Institución destino de una escritura; el super debe indicarla */
  institucionForWrite(actor: JwtUser, requested?: number): number {
    if (actor.esSuper) {
      if (requested == null) {
        throw new BadRequestException(
          'As superadmin you must provide idInstitucion',
        );
      }
      return requested;
    }
    if (actor.idInstitucion == null) {
      throw new ForbiddenException('User has no institution');
    }
    return actor.idInstitucion;
  }

  /** Filtro de lectura: null = todas (solo super) */
  institucionForRead(actor: JwtUser, requested?: number): number | null {
    if (actor.esSuper) return requested ?? null;
    if (actor.idInstitucion == null) {
      throw new ForbiddenException('User has no institution');
    }
    return actor.idInstitucion;
  }

  private assertScope(actor: JwtUser, idInstitucion: number | null) {
    if (actor.esSuper) return;
    if (idInstitucion !== actor.idInstitucion) {
      throw new ForbiddenException('The resource belongs to another institution');
    }
  }

  async local(actor: JwtUser, idLocal: number): Promise<{ ID_INSTITUCION: number }> {
    const rows = await this.oracle.query<{ ID_INSTITUCION: number }>(
      `SELECT ID_INSTITUCION FROM LOCALES WHERE ID_LOCAL = :id`,
      { id: idLocal },
    );
    if (!rows[0]) throw new NotFoundException('Venue not found');
    this.assertScope(actor, rows[0].ID_INSTITUCION);
    return rows[0];
  }

  async salon(
    actor: JwtUser,
    idSalon: number,
  ): Promise<{ ID_INSTITUCION: number; ID_LOCAL: number }> {
    const rows = await this.oracle.query<{
      ID_INSTITUCION: number;
      ID_LOCAL: number;
    }>(
      `SELECT l.ID_INSTITUCION, s.ID_LOCAL
         FROM SALONES s JOIN LOCALES l ON l.ID_LOCAL = s.ID_LOCAL
        WHERE s.ID_SALON = :id`,
      { id: idSalon },
    );
    if (!rows[0]) throw new NotFoundException('Hall not found');
    this.assertScope(actor, rows[0].ID_INSTITUCION);
    return rows[0];
  }

  async subsalon(
    actor: JwtUser,
    idSubsalon: number,
  ): Promise<{ ID_INSTITUCION: number; ID_SALON: number }> {
    const rows = await this.oracle.query<{
      ID_INSTITUCION: number;
      ID_SALON: number;
    }>(
      `SELECT l.ID_INSTITUCION, ss.ID_SALON
         FROM SUBSALONES ss
         JOIN SALONES s ON s.ID_SALON = ss.ID_SALON
         JOIN LOCALES l ON l.ID_LOCAL = s.ID_LOCAL
        WHERE ss.ID_SUBSALON = :id`,
      { id: idSubsalon },
    );
    if (!rows[0]) throw new NotFoundException('Sub-hall not found');
    this.assertScope(actor, rows[0].ID_INSTITUCION);
    return rows[0];
  }

  async configuracion(
    actor: JwtUser,
    idConfiguracion: number,
  ): Promise<{ ID_INSTITUCION: number; ID_SALON: number }> {
    const rows = await this.oracle.query<{
      ID_INSTITUCION: number;
      ID_SALON: number;
    }>(
      `SELECT l.ID_INSTITUCION, c.ID_SALON
         FROM SUBSALON_CONFIGURACIONES c
         JOIN SALONES s ON s.ID_SALON = c.ID_SALON
         JOIN LOCALES l ON l.ID_LOCAL = s.ID_LOCAL
        WHERE c.ID_CONFIGURACION = :id`,
      { id: idConfiguracion },
    );
    if (!rows[0]) throw new NotFoundException('Configuration not found');
    this.assertScope(actor, rows[0].ID_INSTITUCION);
    return rows[0];
  }

  async mapa(
    actor: JwtUser,
    idMapa: number,
  ): Promise<{ ID_INSTITUCION: number }> {
    const rows = await this.oracle.query<{ ID_INSTITUCION: number }>(
      `SELECT ID_INSTITUCION FROM INSTITUCION_MAPAS WHERE ID_MAPA = :id`,
      { id: idMapa },
    );
    if (!rows[0]) throw new NotFoundException('Map not found');
    this.assertScope(actor, rows[0].ID_INSTITUCION);
    return rows[0];
  }
}
