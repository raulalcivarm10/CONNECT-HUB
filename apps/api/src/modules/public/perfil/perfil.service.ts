import { Injectable, NotFoundException } from '@nestjs/common';
import { OracleService } from '../../../database/oracle.service';
import { NasService } from '../../archivos/nas.service';

export type Relacion =
  | 'yo'
  | 'conectado'
  | 'pendiente_enviada'
  | 'pendiente_recibida'
  | 'ninguna';

export interface ActualizarPerfilDto {
  nombre?: string;
  apellido?: string;
  fotoUrl?: string | null;
  numeroCelular?: string | null;
  tipoId?: string | null;
  numeroId?: string | null;
  profesion?: string | null;
  empresa?: string | null;
  bio?: string | null;
  linkedinUrl?: string | null;
  visibilidad?: 'PUBLICO' | 'PRIVADO';
}

/**
 * Perfil de asistente para networking. Los datos básicos (nombre, foto, celular)
 * viven en USUARIOS; los de networking + privacidad en PERFIL_ASISTENTE (tabla
 * nueva, no se altera USUARIOS). El perfil es PÚBLICO por defecto; si es PRIVADO
 * otros solo ven lo mínimo hasta que exista una conexión aceptada.
 */
@Injectable()
export class PerfilService {
  constructor(
    private readonly oracle: OracleService,
    private readonly nas: NasService,
  ) {}

  /**
   * Sube/actualiza la foto de perfil en el NAS (mismo estándar que el panel:
   * tipoEntidad=USUARIO, idUsuario=ID_CLIENTE, tipoArchivo=PERFIL) y guarda la
   * URL activa en USUARIOS.FOTO_URL (con cache-bust para refrescar la imagen).
   */
  async subirFoto(idCliente: string, archivo: { buffer: Buffer; filename: string; mimetype: string }) {
    await this.nas.subir({
      tipoEntidad: 'USUARIO',
      id: idCliente,
      tipoArchivo: 'PERFIL',
      ...archivo,
    });
    const url = `${this.nas.urlActivo('USUARIO', idCliente, 'PERFIL')}&v=${Date.now()}`;
    await this.oracle.execute(
      `UPDATE USUARIOS SET FOTO_URL = :url, FECHA_ACTUALIZACION = SYSTIMESTAMP WHERE ID_CLIENTE = :id`,
      { url, id: idCliente },
    );
    return this.miPerfil(idCliente);
  }

  /** Relación de conexión entre el que mira y el objetivo. */
  async relacion(me: string, target: string): Promise<Relacion> {
    if (me === target) return 'yo';
    const rows = await this.oracle.query<{ ID_SOLICITANTE: string; ESTADO: string }>(
      `SELECT ID_SOLICITANTE, ESTADO FROM CONEXIONES
        WHERE (ID_SOLICITANTE = :me AND ID_DESTINATARIO = :t)
           OR (ID_SOLICITANTE = :t AND ID_DESTINATARIO = :me)`,
      { me, t: target },
    );
    if (rows.some((r) => r.ESTADO === 'ACEPTADA')) return 'conectado';
    const pend = rows.find((r) => r.ESTADO === 'PENDIENTE');
    if (pend) return pend.ID_SOLICITANTE === me ? 'pendiente_enviada' : 'pendiente_recibida';
    return 'ninguna';
  }

  private async cargar(idCliente: string) {
    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT u.ID_CLIENTE, u.NOMBRE, u.APELLIDO, u.FOTO_URL, u.EMAIL, u.NUMERO_CELULAR,
              u.TIPO_ID, u.NUMERO_ID,
              p.PROFESION, p.EMPRESA, p.BIO, p.LINKEDIN_URL,
              NVL(p.VISIBILIDAD,'PUBLICO') AS VISIBILIDAD
         FROM USUARIOS u
         LEFT JOIN PERFIL_ASISTENTE p ON p.ID_CLIENTE = u.ID_CLIENTE
        WHERE u.ID_CLIENTE = :id`,
      { id: idCliente },
    );
    if (!rows[0]) throw new NotFoundException('Profile not found');
    return rows[0];
  }

  private nombreDe(r: Record<string, unknown>): string {
    return (
      [r.NOMBRE, r.APELLIDO].filter(Boolean).join(' ').trim() ||
      String(r.EMAIL ?? '').split('@')[0]
    );
  }

  /** Mi perfil editable completo. */
  async miPerfil(idCliente: string) {
    const r = await this.cargar(idCliente);
    return {
      idCliente: r.ID_CLIENTE as string,
      nombre: (r.NOMBRE as string) ?? null,
      apellido: (r.APELLIDO as string) ?? null,
      fotoUrl: (r.FOTO_URL as string) ?? null,
      email: r.EMAIL as string,
      numeroCelular: (r.NUMERO_CELULAR as string) ?? null,
      tipoId: (r.TIPO_ID as string) ?? null,
      numeroId: (r.NUMERO_ID as string) ?? null,
      profesion: (r.PROFESION as string) ?? null,
      empresa: (r.EMPRESA as string) ?? null,
      bio: (r.BIO as string) ?? null,
      linkedinUrl: (r.LINKEDIN_URL as string) ?? null,
      visibilidad: (r.VISIBILIDAD as 'PUBLICO' | 'PRIVADO') ?? 'PUBLICO',
    };
  }

  /** Perfil de OTRO asistente respetando su privacidad + estado de conexión. */
  async perfilPublico(viewerId: string, targetId: string) {
    const r = await this.cargar(targetId);
    const relacion = await this.relacion(viewerId, targetId);
    const esYo = relacion === 'yo';
    const visibilidad = (r.VISIBILIDAD as string) ?? 'PUBLICO';
    const visible = esYo || visibilidad === 'PUBLICO' || relacion === 'conectado';

    // Nombre para el perfil público: NUNCA derivar del email (fuga de privacidad
    // en perfiles privados vistos por desconocidos) — usar nombre real o neutro.
    const nombreReal = [r.NOMBRE, r.APELLIDO].filter(Boolean).join(' ').trim();
    const base = {
      idCliente: r.ID_CLIENTE as string,
      nombre: nombreReal || 'Asistente',
      fotoUrl: (r.FOTO_URL as string) ?? null,
      profesion: (r.PROFESION as string) ?? null,
      visibilidad: visibilidad as 'PUBLICO' | 'PRIVADO',
      esYo,
      relacion,
      // puede chatear: público (cualquiera) o ya conectados
      puedeChatear: !esYo && (visibilidad === 'PUBLICO' || relacion === 'conectado'),
    };

    if (!visible) {
      // privado y sin conexión → solo lo mínimo (para decidir conectar)
      return { ...base, empresa: null, bio: null, linkedinUrl: null, limitado: true };
    }
    return {
      ...base,
      empresa: (r.EMPRESA as string) ?? null,
      bio: (r.BIO as string) ?? null,
      linkedinUrl: (r.LINKEDIN_URL as string) ?? null,
      limitado: false,
    };
  }

  /** Crea/actualiza mi perfil (USUARIOS básico + PERFIL_ASISTENTE extendido). */
  async actualizar(idCliente: string, dto: ActualizarPerfilDto) {
    // 1) USUARIOS (solo campos provistos)
    const sets: string[] = [];
    const binds: Record<string, string | null> = { id: idCliente };
    if (dto.nombre !== undefined) { sets.push('NOMBRE = :nombre'); binds.nombre = dto.nombre?.trim() || null; }
    if (dto.apellido !== undefined) { sets.push('APELLIDO = :apellido'); binds.apellido = dto.apellido?.trim() || null; }
    if (dto.fotoUrl !== undefined) { sets.push('FOTO_URL = :foto'); binds.foto = dto.fotoUrl?.trim() || null; }
    if (dto.numeroCelular !== undefined) { sets.push('NUMERO_CELULAR = :cel'); binds.cel = dto.numeroCelular?.trim() || null; }
    if (dto.tipoId !== undefined) { sets.push('TIPO_ID = :tipoId'); binds.tipoId = dto.tipoId?.trim() || null; }
    if (dto.numeroId !== undefined) { sets.push('NUMERO_ID = :numeroId'); binds.numeroId = dto.numeroId?.trim() || null; }
    if (sets.length) {
      sets.push('FECHA_ACTUALIZACION = SYSTIMESTAMP');
      await this.oracle.execute(
        `UPDATE USUARIOS SET ${sets.join(', ')} WHERE ID_CLIENTE = :id`,
        binds,
      );
    }

    // 2) PERFIL_ASISTENTE (upsert robusto)
    const hasExt =
      dto.profesion !== undefined || dto.empresa !== undefined || dto.bio !== undefined ||
      dto.linkedinUrl !== undefined || dto.visibilidad !== undefined;
    if (hasExt) {
      const pv = {
        id: idCliente,
        prof: dto.profesion !== undefined ? (dto.profesion?.trim() || null) : undefined,
        emp: dto.empresa !== undefined ? (dto.empresa?.trim() || null) : undefined,
        bio: dto.bio !== undefined ? (dto.bio?.trim() || null) : undefined,
        li: dto.linkedinUrl !== undefined ? (dto.linkedinUrl?.trim() || null) : undefined,
        vis: dto.visibilidad,
      };
      // construir SET solo con lo provisto; si no existe fila, INSERT con esos valores
      const upSets: string[] = [];
      const upBinds: Record<string, string | null> = { id: idCliente };
      if (pv.prof !== undefined) { upSets.push('PROFESION = :prof'); upBinds.prof = pv.prof; }
      if (pv.emp !== undefined) { upSets.push('EMPRESA = :emp'); upBinds.emp = pv.emp; }
      if (pv.bio !== undefined) { upSets.push('BIO = :bio'); upBinds.bio = pv.bio; }
      if (pv.li !== undefined) { upSets.push('LINKEDIN_URL = :li'); upBinds.li = pv.li; }
      if (pv.vis !== undefined) { upSets.push('VISIBILIDAD = :vis'); upBinds.vis = pv.vis; }
      upSets.push('FECHA_ACTUALIZACION = SYSTIMESTAMP');

      const upd = await this.oracle.execute(
        `UPDATE PERFIL_ASISTENTE SET ${upSets.join(', ')} WHERE ID_CLIENTE = :id`,
        upBinds,
      );
      if ((upd.rowsAffected ?? 0) === 0) {
        try {
          await this.oracle.execute(
            `INSERT INTO PERFIL_ASISTENTE (ID_CLIENTE, PROFESION, EMPRESA, BIO, LINKEDIN_URL, VISIBILIDAD)
             VALUES (:id, :prof, :emp, :bio, :li, :vis)`,
            {
              id: idCliente,
              prof: pv.prof ?? null,
              emp: pv.emp ?? null,
              bio: pv.bio ?? null,
              li: pv.li ?? null,
              vis: pv.vis ?? 'PUBLICO',
            },
          );
        } catch (e) {
          if (String(e).includes('ORA-00001')) {
            await this.oracle.execute(
              `UPDATE PERFIL_ASISTENTE SET ${upSets.join(', ')} WHERE ID_CLIENTE = :id`,
              upBinds,
            );
          } else throw e;
        }
      }
    }
    return this.miPerfil(idCliente);
  }
}
