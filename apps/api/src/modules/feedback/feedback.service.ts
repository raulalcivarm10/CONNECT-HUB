import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OracleService } from '../../database/oracle.service';
import { JwtUser } from '../../auth/types';
import { CrearFeedbackDto } from './dto/feedback.dto';

const ESTADOS = ['NEW', 'REVIEWED', 'PLANNED', 'DONE'] as const;

@Injectable()
export class FeedbackService {
  constructor(private readonly oracle: OracleService) {}

  async crear(actor: JwtUser, dto: CrearFeedbackDto) {
    const r = await this.oracle.execute(
      `INSERT INTO FEEDBACK (USUARIO, ID_INSTITUCION, TIPO, MENSAJE)
       VALUES (:usuario, :idInstitucion, :tipo, :mensaje)
       RETURNING ID_FEEDBACK INTO :out`,
      {
        usuario: actor.sub,
        idInstitucion: {
          val: actor.idInstitucion ?? null,
          type: this.oracle.NUMBER,
        },
        tipo: dto.tipo ?? 'SUGGESTION',
        mensaje: dto.mensaje.trim(),
        out: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER },
      },
    );
    return { idFeedback: (r.outBinds as { out: number[] }).out[0] };
  }

  /** superadmin ve todo; los demás solo lo suyo */
  async listar(actor: JwtUser, estado?: string) {
    const soloDe = actor.esSuper ? null : actor.sub;
    return this.oracle.query(
      `SELECT f.ID_FEEDBACK, f.USUARIO, f.ID_INSTITUCION, f.TIPO, f.MENSAJE,
              f.ESTADO, TO_CHAR(f.FECHA_REGISTRO, 'YYYY-MM-DD HH24:MI') AS FECHA,
              i.NOMBRE AS INSTITUCION
         FROM FEEDBACK f
         LEFT JOIN INSTITUCIONES i ON i.ID_INSTITUCION = f.ID_INSTITUCION
        WHERE (:soloDe IS NULL OR f.USUARIO = :soloDe)
          AND (:estado IS NULL OR f.ESTADO = :estado)
        ORDER BY f.FECHA_REGISTRO DESC, f.ID_FEEDBACK DESC`,
      { soloDe, estado: estado?.trim() || null },
    );
  }

  /** triage del superadmin: cambia el estado de la recomendación */
  async cambiarEstado(actor: JwtUser, id: number, estado: string) {
    if (!actor.esSuper) {
      throw new ForbiddenException(
        'Solo el superadmin puede gestionar el feedback',
      );
    }
    if (!ESTADOS.includes(estado as (typeof ESTADOS)[number])) {
      throw new NotFoundException(`Estado inválido: ${estado}`);
    }
    const r = await this.oracle.execute(
      `UPDATE FEEDBACK SET ESTADO = :estado WHERE ID_FEEDBACK = :id`,
      { estado, id },
    );
    if (!r.rowsAffected) throw new NotFoundException('Feedback no encontrado');
    return { idFeedback: id, estado };
  }
}
