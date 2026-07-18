import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { OracleService } from '../../../database/oracle.service';
import { renderCertificado, type CertOverlayConfig } from './certificado-render';

const NAS_URL = process.env.NAS_URL ?? 'https://api-ligaprocorp.ec:3443/api';
function portadaUrl(id: number) {
  return `${NAS_URL}/archivos/activo?tipoEntidad=EVENTO&id=${id}&tipoArchivo=PORTADA`;
}

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
/** 'YYYY-MM-DD' → '16 de julio de 2026' (para el certificado). */
function fechaLarga(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} de ${MESES_ES[m - 1]} de ${y}`;
}

/** Etiqueta legible del tipo de certificado (CERTIFICADOS.TIPO / EVENTO_DETALLE.CERT_TIPO). */
const TIPO_CERT_LABEL: Record<string, string> = {
  ASISTENCIA: 'Asistencia',
  PARTICIPACION: 'Participación',
  FINALIZACION: 'Finalización',
  APROBACION: 'Aprobación',
};

/** Token de QR con el formato del ecosistema: TCK-XXXX-XXXX (base32). */
function genQrToken(): string {
  const alf = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const chunk = () =>
    Array.from(randomBytes(4))
      .map((b) => alf[b % alf.length])
      .join('');
  return `TCK-${chunk()}-${chunk()}`;
}

interface EventoLite {
  ID_EVENTO: number;
  TITULO: string;
  PRECIO: number | null;
  ID_EVENTO_PADRE: number | null;
  NO_PUBLICAR: string | null;
}

/**
 * Inscripción a eventos + entradas con QR + check-in. Fuente única:
 * EVENTOS_USUARIOS (ESTADO='S', QR_TOKEN, ASISTIO). No toca la app externa.
 * El cobro real (eventos de pago) lo maneja el módulo de pagos (Nuvei); aquí
 * solo se inscriben los GRATIS y se aplica la regla workshop→evento padre.
 */
@Injectable()
export class EntradasService {
  constructor(private readonly oracle: OracleService) {}

  private async eventoLite(id: number): Promise<EventoLite> {
    const rows = await this.oracle.query<EventoLite>(
      `SELECT ID_EVENTO, TITULO, PRECIO, ID_EVENTO_PADRE, NO_PUBLICAR
         FROM EVENTOS WHERE ID_EVENTO = :id`,
      { id },
    );
    const ev = rows[0];
    if (!ev || (ev.NO_PUBLICAR ?? 'N') === 'S') {
      throw new NotFoundException('Event not found');
    }
    return ev;
  }

  private async inscripcionExistente(idCliente: string, idEvento: number) {
    const rows = await this.oracle.query<{
      ID_EVENTO_USUARIO: number;
      QR_TOKEN: string | null;
      ESTADO: string | null;
      ASISTIO: string | null;
    }>(
      `SELECT ID_EVENTO_USUARIO, QR_TOKEN, ESTADO, ASISTIO
         FROM EVENTOS_USUARIOS
        WHERE ID_EVENTO = :e AND ID_CLIENTE = :c`,
      { e: idEvento, c: idCliente },
    );
    return rows[0] ?? null;
  }

  /** Crea (o devuelve) la inscripción a un evento. El PK lo pone el trigger. */
  private async crearInscripcion(idCliente: string, idEvento: number) {
    const ya = await this.inscripcionExistente(idCliente, idEvento);
    if (ya) return ya;
    const qr = genQrToken();
    await this.oracle.execute(
      `INSERT INTO EVENTOS_USUARIOS
         (ID_EVENTO, ID_CLIENTE, ESTADO, FECHA_REGISTRO, QR_TOKEN, ASISTIO)
       VALUES (:e, :c, 'S', SYSDATE, :qr, 'N')`,
      { e: idEvento, c: idCliente, qr },
    );
    const nuevo = await this.inscripcionExistente(idCliente, idEvento);
    return nuevo!;
  }

  /**
   * Inscribe al asistente en un evento. Reglas:
   *  - evento de pago (precio>0) → { requierePago } (lo cierra el módulo de pagos);
   *  - workshop (hijo) → primero el padre: si el padre es gratis se inscribe
   *    automáticamente; si es de pago, exige inscribir/pagar el padre antes.
   */
  async inscribir(idCliente: string, idEvento: number) {
    const ev = await this.eventoLite(idEvento);
    const precio = ev.PRECIO ?? 0;

    // regla workshop → evento padre
    if (ev.ID_EVENTO_PADRE) {
      const padreInsc = await this.inscripcionExistente(idCliente, ev.ID_EVENTO_PADRE);
      if (!padreInsc) {
        const padre = await this.eventoLite(ev.ID_EVENTO_PADRE);
        if ((padre.PRECIO ?? 0) > 0) {
          throw new ConflictException({
            code: 'PARENT_REQUIRED',
            message: 'You must register for the main event first',
            padre: { id: padre.ID_EVENTO, titulo: padre.TITULO, precio: padre.PRECIO },
          });
        }
        await this.crearInscripcion(idCliente, ev.ID_EVENTO_PADRE); // padre gratis → auto
      }
    }

    if (precio > 0) {
      // evento de pago: no se inscribe aquí; el móvil va al checkout
      return {
        requierePago: true,
        evento: { id: ev.ID_EVENTO, titulo: ev.TITULO, precio },
      };
    }

    const insc = await this.crearInscripcion(idCliente, idEvento);
    return {
      requierePago: false,
      idEventoUsuario: insc.ID_EVENTO_USUARIO,
      qrToken: insc.QR_TOKEN,
      asistio: (insc.ASISTIO ?? 'N') === 'S',
    };
  }

  /**
   * Emite (o asegura) la entrada tras un pago aprobado. Usa exactamente el mismo
   * mecanismo que el flujo gratis (EVENTOS_USUARIOS + QR_TOKEN) para que Mis
   * Entradas, el QR, el check-in y los certificados funcionen igual. Idempotente.
   */
  async emitirPorPago(idCliente: string, idEvento: number) {
    const insc = await this.crearInscripcion(idCliente, idEvento);
    return { idEventoUsuario: insc.ID_EVENTO_USUARIO, qrToken: insc.QR_TOKEN };
  }

  /** Entradas del asistente (eventos adquiridos) con datos para renderizar. */
  async misEntradas(idCliente: string) {
    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT eu.ID_EVENTO_USUARIO, eu.ID_EVENTO, eu.ESTADO, eu.QR_TOKEN,
              eu.ASISTIO, TO_CHAR(eu.FECHA_ENTRADA,'YYYY-MM-DD"T"HH24:MI') AS FECHA_ENTRADA,
              e.TITULO, e.PRECIO,
              TO_CHAR(e.FECHA_EVENTO,'YYYY-MM-DD') AS FECHA_EVENTO,
              e.HORA_INICIO, e.HORA_FIN, e.ID_EVENTO_PADRE,
              s.NOMBRE AS SALON_NOMBRE, l.NOMBRE AS LOCAL_NOMBRE,
              cert.CODIGO AS CERTIFICADO_CODIGO,
              (SELECT LISTAGG(TO_CHAR(h.FECHA,'YYYY-MM-DD'),',') WITHIN GROUP (ORDER BY h.FECHA)
                 FROM EVENTO_HORAS h WHERE h.ID_EVENTO = e.ID_EVENTO) AS DIAS
         FROM EVENTOS_USUARIOS eu
         JOIN EVENTOS e ON e.ID_EVENTO = eu.ID_EVENTO
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN CERTIFICADOS cert
                ON cert.ID_CLIENTE = eu.ID_CLIENTE AND cert.ID_EVENTO = eu.ID_EVENTO
        WHERE eu.ID_CLIENTE = :c
        ORDER BY e.FECHA_EVENTO DESC`,
      { c: idCliente },
    );
    return rows.map((r) => ({
      idEventoUsuario: Number(r.ID_EVENTO_USUARIO),
      idEvento: Number(r.ID_EVENTO),
      titulo: r.TITULO as string,
      precio: r.PRECIO == null ? null : Number(r.PRECIO),
      fechaInicio: r.FECHA_EVENTO as string,
      horaInicio: (r.HORA_INICIO as string) ?? null,
      horaFin: (r.HORA_FIN as string) ?? null,
      dias: r.DIAS ? String(r.DIAS).split(',') : [r.FECHA_EVENTO as string],
      salonNombre: (r.SALON_NOMBRE as string) ?? null,
      localNombre: (r.LOCAL_NOMBRE as string) ?? null,
      esWorkshop: r.ID_EVENTO_PADRE != null,
      qrToken: (r.QR_TOKEN as string) ?? null,
      asistio: (r.ASISTIO ?? 'N') === 'S',
      fechaEntrada: (r.FECHA_ENTRADA as string) ?? null,
      certificadoCodigo: (r.CERTIFICADO_CODIGO as string) ?? null,
      portadaUrl: portadaUrl(Number(r.ID_EVENTO)),
    }));
  }

  /** Payload del QR de una entrada del propio asistente. */
  async getQr(idCliente: string, idEventoUsuario: number) {
    const rows = await this.oracle.query<{
      QR_TOKEN: string | null;
      TITULO: string;
      ASISTIO: string | null;
    }>(
      `SELECT eu.QR_TOKEN, eu.ASISTIO, e.TITULO
         FROM EVENTOS_USUARIOS eu JOIN EVENTOS e ON e.ID_EVENTO = eu.ID_EVENTO
        WHERE eu.ID_EVENTO_USUARIO = :id AND eu.ID_CLIENTE = :c`,
      { id: idEventoUsuario, c: idCliente },
    );
    const r = rows[0];
    if (!r?.QR_TOKEN) throw new NotFoundException('Ticket not found');
    return { qrToken: r.QR_TOKEN, titulo: r.TITULO, asistio: (r.ASISTIO ?? 'N') === 'S' };
  }

  /**
   * Check-in: marca asistencia por QR_TOKEN. Lo llama el escáner del staff.
   * Idempotente (si ya asistió lo indica). El token es secreto (va solo en el QR).
   */
  async validar(qrToken: string) {
    const rows = await this.oracle.query<{
      ID_EVENTO_USUARIO: number;
      ID_EVENTO: number;
      ID_CLIENTE: string;
      ASISTIO: string | null;
      TITULO: string;
      NOMBRE: string | null;
      APELLIDO: string | null;
      EMAIL: string;
      INSTITUCION: string | null;
    }>(
      `SELECT eu.ID_EVENTO_USUARIO, eu.ID_EVENTO, eu.ID_CLIENTE, eu.ASISTIO,
              e.TITULO, u.NOMBRE, u.APELLIDO, u.EMAIL, i.NOMBRE AS INSTITUCION
         FROM EVENTOS_USUARIOS eu
         JOIN EVENTOS e ON e.ID_EVENTO = eu.ID_EVENTO
         JOIN USUARIOS u ON u.ID_CLIENTE = eu.ID_CLIENTE
         LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
         LEFT JOIN INSTITUCIONES i
                ON i.ID_INSTITUCION = COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION)
        WHERE eu.QR_TOKEN = :qr`,
      { qr: qrToken.trim() },
    );
    const r = rows[0];
    if (!r) throw new BadRequestException('Invalid ticket');
    const nombre = [r.NOMBRE, r.APELLIDO].filter(Boolean).join(' ') || r.EMAIL;
    const yaAsistio = (r.ASISTIO ?? 'N') === 'S';
    let certificadoCodigo: string | null = null;
    if (!yaAsistio) {
      await this.oracle.execute(
        `UPDATE EVENTOS_USUARIOS
            SET ASISTIO = 'S', FECHA_ENTRADA = SYSDATE
          WHERE ID_EVENTO_USUARIO = :id`,
        { id: r.ID_EVENTO_USUARIO },
      );
      // al asistir → emite certificado digital (simple por ahora)
      certificadoCodigo = await this.emitirCertificado({
        idCliente: r.ID_CLIENTE,
        idEvento: r.ID_EVENTO,
        idEventoUsuario: r.ID_EVENTO_USUARIO,
        nombre,
        titulo: r.TITULO,
        institucion: r.INSTITUCION ?? null,
      });
    }
    return {
      ok: true,
      yaAsistio,
      certificadoCodigo,
      evento: { id: r.ID_EVENTO, titulo: r.TITULO },
      asistente: { nombre, email: r.EMAIL },
    };
  }

  /** Emite (idempotente) un certificado al asistir. Devuelve el CODIGO. */
  private async emitirCertificado(d: {
    idCliente: string;
    idEvento: number;
    idEventoUsuario: number;
    nombre: string;
    titulo: string;
    institucion: string | null;
  }): Promise<string> {
    const existe = await this.oracle.query<{ CODIGO: string }>(
      `SELECT CODIGO FROM CERTIFICADOS WHERE ID_CLIENTE = :c AND ID_EVENTO = :e`,
      { c: d.idCliente, e: d.idEvento },
    );
    if (existe[0]) return existe[0].CODIGO;
    const codigo = `CERT-${randomBytes(6).toString('hex').toUpperCase()}`;
    try {
      await this.oracle.execute(
        `INSERT INTO CERTIFICADOS
           (ID_CLIENTE, ID_EVENTO, ID_EVENTO_USUARIO, CODIGO, TIPO,
            NOMBRE_ASISTENTE, TITULO_EVENTO, INSTITUCION)
         VALUES (:c, :e, :eu, :codigo, 'ASISTENCIA', :nombre, :titulo, :inst)`,
        {
          c: d.idCliente,
          e: d.idEvento,
          eu: d.idEventoUsuario,
          codigo,
          nombre: d.nombre,
          titulo: d.titulo,
          inst: d.institucion,
        },
      );
      return codigo;
    } catch (err) {
      if (String(err).includes('ORA-00001')) {
        const again = await this.oracle.query<{ CODIGO: string }>(
          `SELECT CODIGO FROM CERTIFICADOS WHERE ID_CLIENTE = :c AND ID_EVENTO = :e`,
          { c: d.idCliente, e: d.idEvento },
        );
        return again[0]?.CODIGO ?? codigo;
      }
      throw err;
    }
  }

  /** Certificados del asistente. */
  async misCertificados(idCliente: string) {
    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT c.CODIGO, c.TIPO, c.NOMBRE_ASISTENTE, u.NOMBRE AS U_NOMBRE, u.APELLIDO AS U_APELLIDO,
              c.TITULO_EVENTO, c.INSTITUCION, c.ID_EVENTO,
              TO_CHAR(c.FECHA_EMISION,'YYYY-MM-DD') AS FECHA_EMISION
         FROM CERTIFICADOS c
         LEFT JOIN USUARIOS u ON u.ID_CLIENTE = c.ID_CLIENTE
        WHERE c.ID_CLIENTE = :c ORDER BY c.FECHA_EMISION DESC`,
      { c: idCliente },
    );
    return rows.map((r) => this.mapCert(r));
  }

  /** Verificación pública de un certificado por su código. */
  async getCertificado(codigo: string) {
    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT c.CODIGO, c.TIPO, c.NOMBRE_ASISTENTE, u.NOMBRE AS U_NOMBRE, u.APELLIDO AS U_APELLIDO,
              c.TITULO_EVENTO, c.INSTITUCION, c.ID_EVENTO,
              TO_CHAR(c.FECHA_EMISION,'YYYY-MM-DD') AS FECHA_EMISION
         FROM CERTIFICADOS c
         LEFT JOIN USUARIOS u ON u.ID_CLIENTE = c.ID_CLIENTE
        WHERE c.CODIGO = :codigo AND c.ESTADO = 'EMITIDO'`,
      { codigo: codigo.trim() },
    );
    if (!rows[0]) throw new NotFoundException('Certificate not found');
    return this.mapCert(rows[0]);
  }

  /** Render on-demand del certificado como PNG (plantilla del evento + overlay). */
  async renderCertificadoImagen(codigo: string): Promise<Buffer> {
    const cert = await this.oracle.query<{
      NOMBRE_ASISTENTE: string | null;
      U_NOMBRE: string | null;
      U_APELLIDO: string | null;
      TITULO_EVENTO: string | null;
      ID_EVENTO: number;
      TIPO: string | null;
      INSTITUCION: string | null;
      CODIGO: string;
      FECHA_EVENTO: string | null;
      HORA: string | null;
    }>(
      // Usa el nombre ACTUAL del perfil (u.NOMBRE/APELLIDO) y solo cae al
      // NOMBRE_ASISTENTE congelado si el perfil no tiene nombre. Así los
      // usuarios de Apple (que al registrarse no dan nombre) ven su nombre real
      // en cuanto lo completan en el perfil, no el correo de relay.
      `SELECT c.NOMBRE_ASISTENTE, u.NOMBRE AS U_NOMBRE, u.APELLIDO AS U_APELLIDO,
              c.TITULO_EVENTO, c.ID_EVENTO, c.TIPO, c.INSTITUCION, c.CODIGO,
              TO_CHAR(e.FECHA_EVENTO, 'YYYY-MM-DD') AS FECHA_EVENTO,
              (SELECT h.HORA_INICIO ||
                      CASE WHEN h.HORA_FIN IS NOT NULL THEN ' - ' || h.HORA_FIN END
                 FROM EVENTO_HORAS h
                WHERE h.ID_EVENTO = e.ID_EVENTO
                ORDER BY h.ORDEN NULLS LAST, h.FECHA
                FETCH FIRST 1 ROW ONLY) AS HORA
         FROM CERTIFICADOS c
         JOIN EVENTOS e ON e.ID_EVENTO = c.ID_EVENTO
         LEFT JOIN USUARIOS u ON u.ID_CLIENTE = c.ID_CLIENTE
        WHERE c.CODIGO = :c AND c.ESTADO = 'EMITIDO'`,
      { c: codigo.trim() },
    );
    if (!cert[0]) throw new NotFoundException('Certificate not found');
    const plant = await this.oracle.query<{ IMAGEN: Buffer; CONFIG_JSON: string | null }>(
      `SELECT IMAGEN, CONFIG_JSON FROM EVENTO_CERT_PLANTILLA WHERE ID_EVENTO = :e`,
      { e: cert[0].ID_EVENTO },
    );
    if (!plant[0]) throw new NotFoundException('No certificate template configured for this event');
    let config: CertOverlayConfig | null = null;
    try {
      config = plant[0].CONFIG_JSON ? (JSON.parse(plant[0].CONFIG_JSON) as CertOverlayConfig) : null;
    } catch {
      config = null;
    }
    const c = cert[0];
    // Nombre del perfil actual; si no hay, cae al congelado SOLO si no es un
    // correo (los usuarios de Apple traen un email de relay como NOMBRE_ASISTENTE
    // y el certificado nunca debe mostrar un correo).
    const frozen = c.NOMBRE_ASISTENTE && !c.NOMBRE_ASISTENTE.includes('@') ? c.NOMBRE_ASISTENTE : '';
    const nombreActual = [c.U_NOMBRE, c.U_APELLIDO].filter(Boolean).join(' ').trim() || frozen;
    return renderCertificado(plant[0].IMAGEN, config, {
      nombre: nombreActual,
      evento: c.TITULO_EVENTO ?? '',
      fecha: fechaLarga(c.FECHA_EVENTO),
      tipo: c.TIPO ? (TIPO_CERT_LABEL[c.TIPO] ?? c.TIPO) : '',
      hora: c.HORA ?? '',
      institucion: c.INSTITUCION ?? '',
      codigo: c.CODIGO,
    });
  }

  private mapCert(r: Record<string, unknown>) {
    return {
      codigo: r.CODIGO as string,
      tipo: (r.TIPO as string) ?? null,
      // nombre actual del perfil; cae al congelado solo si no es un correo
      // (nunca mostrar el email de relay de Apple como nombre del certificado)
      nombreAsistente:
        [r.U_NOMBRE, r.U_APELLIDO].filter(Boolean).join(' ').trim() ||
        (typeof r.NOMBRE_ASISTENTE === 'string' && !r.NOMBRE_ASISTENTE.includes('@')
          ? r.NOMBRE_ASISTENTE
          : null),
      tituloEvento: (r.TITULO_EVENTO as string) ?? null,
      institucion: (r.INSTITUCION as string) ?? null,
      idEvento: Number(r.ID_EVENTO),
      fechaEmision: r.FECHA_EMISION as string,
    };
  }
}
