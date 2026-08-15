import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OracleService } from '../../database/oracle.service';
import { JwtUser } from '../../auth/types';
import {
  CrearSuscripcionDto,
  EditarSuscripcionDto,
} from './dto/suscripciones.dto';
import {
  diasEntre,
  esFechaValida,
  hoyEcuador,
  sumarDias,
} from './fechas-ecuador.util';

interface FilaSuscripcion {
  ID_SUSCRIPCION: number;
  ID_INSTITUCION: number;
  INSTITUCION: string | null;
  ID_PLAN: number | null;
  PLAN_NOMBRE: string | null;
  PLAN_CODIGO: string | null;
  COMPRADOR_EMAIL: string;
  COMPRADOR_NOMBRE: string | null;
  FECHA_COMPRA: string;
  FECHA_INICIO: string;
  FECHA_FIN: string;
  DIAS: number;
  MONTO: number | null;
  MONEDA: string | null;
  REFERENCIA_PAGO: string | null;
  ESTADO: string;
  DIAS_RESTANTES: number;
  NOTAS: string | null;
}

/** columnas + cálculo de días restantes; :hoy siempre es la fecha de Ecuador */
const SELECT_SUSCRIPCION = `
  SELECT s.ID_SUSCRIPCION, s.ID_INSTITUCION, i.NOMBRE AS INSTITUCION,
         -- PLAN_NOMBRE y no PLAN: "PLAN" es palabra clave de Oracle
         s.ID_PLAN, p.NOMBRE AS PLAN_NOMBRE, p.CODIGO AS PLAN_CODIGO,
         s.COMPRADOR_EMAIL, s.COMPRADOR_NOMBRE,
         TO_CHAR(s.FECHA_COMPRA, 'YYYY-MM-DD') AS FECHA_COMPRA,
         TO_CHAR(s.FECHA_INICIO, 'YYYY-MM-DD') AS FECHA_INICIO,
         TO_CHAR(s.FECHA_FIN,    'YYYY-MM-DD') AS FECHA_FIN,
         s.DIAS, s.MONTO, s.MONEDA, s.REFERENCIA_PAGO, s.ESTADO, s.NOTAS,
         TRUNC(s.FECHA_FIN) - TO_DATE(:hoy, 'YYYY-MM-DD') AS DIAS_RESTANTES
    FROM SUSCRIPCIONES s
    JOIN INSTITUCIONES i ON i.ID_INSTITUCION = s.ID_INSTITUCION
    LEFT JOIN PLANES p   ON p.ID_PLAN = s.ID_PLAN`;

/**
 * SUSCRIPCIONES — una fila POR COMPRA (nunca se sobrescribe: al renovar se
 * inserta otra y la anterior queda en REEMPLAZADA, así el historial de pagos
 * de cada cliente está completo).
 *
 * El corte por falta de pago NO recorre eventos ni usuarios: reutiliza el
 * mecanismo ya probado de poner INSTITUCIONES.ESTADO = 'SUSPENDIDA', que por sí
 * solo bloquea el login del panel (auth.service.ts) y oculta la institución y
 * sus eventos de las apps móviles (todo el catálogo público filtra por
 * ESTADO = 'APROBADA'). Reactivar = volver a 'APROBADA'. Por eso este módulo no
 * añade ninguna columna a INSTITUCIONES.
 */
@Injectable()
export class SuscripcionesService {
  private readonly logger = new Logger(SuscripcionesService.name);

  constructor(private readonly oracle: OracleService) {}

  /** La gestión de suscripciones es del proveedor, no del cliente. */
  private assertSuper(actor: JwtUser): void {
    if (!actor.esSuper) {
      throw new ForbiddenException(
        'Only the superadmin can manage subscriptions',
      );
    }
  }

  /** bind tipado para columnas NUMBER que pueden ir en NULL */
  private num(v: number | null | undefined) {
    return { val: v ?? null, type: this.oracle.NUMBER };
  }

  private mapear(r: FilaSuscripcion) {
    return {
      idSuscripcion: r.ID_SUSCRIPCION,
      idInstitucion: r.ID_INSTITUCION,
      institucion: r.INSTITUCION,
      idPlan: r.ID_PLAN,
      plan: r.PLAN_NOMBRE,
      planCodigo: r.PLAN_CODIGO,
      compradorEmail: r.COMPRADOR_EMAIL,
      compradorNombre: r.COMPRADOR_NOMBRE,
      fechaCompra: r.FECHA_COMPRA,
      fechaInicio: r.FECHA_INICIO,
      fechaFin: r.FECHA_FIN,
      dias: r.DIAS,
      monto: r.MONTO,
      moneda: r.MONEDA,
      referenciaPago: r.REFERENCIA_PAGO,
      estado: r.ESTADO,
      // negativo = ya venció; 0 = hoy es el último día de servicio
      diasRestantes: r.DIAS_RESTANTES,
      notas: r.NOTAS,
    };
  }

  /**
   * Valor efectivo de un campo OPCIONAL Y BORRABLE en un PATCH: el panel manda
   * `null` explícito cuando el usuario vacía la casilla (quiere borrarlo) y
   * omite la clave cuando no la toca (quiere conservarlo). Con `??` los dos
   * casos se confundirían y el campo no se podría borrar nunca.
   */
  private efectivo<T>(enviado: T | null | undefined, actual: T | null): T | null {
    return enviado === undefined ? actual : enviado;
  }

  private validarFecha(valor: string, campo: string): string {
    if (!esFechaValida(valor)) {
      throw new BadRequestException(`${campo} is not a valid date (YYYY-MM-DD)`);
    }
    return valor;
  }

  /* ------------------------------------------------------------ consultas */

  async listar(
    actor: JwtUser,
    filtros: { idInstitucion?: number; estado?: string },
  ) {
    this.assertSuper(actor);
    const rows = await this.oracle.query<FilaSuscripcion>(
      `${SELECT_SUSCRIPCION}
        WHERE (:inst IS NULL OR s.ID_INSTITUCION = :inst)
          AND (:estado IS NULL OR s.ESTADO = :estado)
        ORDER BY s.FECHA_FIN DESC, s.ID_SUSCRIPCION DESC`,
      {
        hoy: hoyEcuador(),
        inst: filtros.idInstitucion ?? null,
        estado: filtros.estado?.trim().toUpperCase() || null,
      },
    );
    const items = rows.map((r) => this.mapear(r));
    return { items, total: items.length };
  }

  /** Catálogo de planes vendibles (los ACTIVO='S'). */
  async planes() {
    const rows = await this.oracle.query<{
      ID_PLAN: number;
      CODIGO: string;
      NOMBRE: string;
      DIAS: number;
      MAX_EVENTOS: number | null;
      MAX_USUARIOS: number | null;
      MAX_PARTICIPANTES: number | null;
      PRECIO: number | null;
      MONEDA: string | null;
      ES_ONPREMISE: string | null;
    }>(
      `SELECT ID_PLAN, CODIGO, NOMBRE, DIAS, MAX_EVENTOS, MAX_USUARIOS,
              MAX_PARTICIPANTES, PRECIO, MONEDA, ES_ONPREMISE
         FROM PLANES
        WHERE NVL(ACTIVO, 'S') = 'S'
        ORDER BY ES_ONPREMISE, DIAS`,
    );
    return rows.map((p) => ({
      idPlan: p.ID_PLAN,
      codigo: p.CODIGO,
      nombre: p.NOMBRE,
      dias: p.DIAS,
      maxEventos: p.MAX_EVENTOS,
      maxUsuarios: p.MAX_USUARIOS,
      maxParticipantes: p.MAX_PARTICIPANTES,
      precio: p.PRECIO,
      moneda: p.MONEDA,
      esOnpremise: (p.ES_ONPREMISE ?? 'N') === 'S',
    }));
  }

  /** Una suscripción por id, ya mapeada (uso interno y respuesta de las mutaciones). */
  private async obtener(id: number) {
    const rows = await this.oracle.query<FilaSuscripcion>(
      `${SELECT_SUSCRIPCION} WHERE s.ID_SUSCRIPCION = :id`,
      { hoy: hoyEcuador(), id },
    );
    if (!rows[0]) throw new NotFoundException('Subscription not found');
    return this.mapear(rows[0]);
  }

  /**
   * Aviso del panel: estado de la suscripción de la institución del usuario.
   * Lo llama CUALQUIER usuario autenticado en cada carga del panel, así que es
   * una sola fila por el índice (ID_INSTITUCION, FECHA_FIN DESC).
   */
  async mia(actor: JwtUser) {
    if (actor.idInstitucion == null) {
      // el superadmin no pertenece a ninguna institución: no hay aviso que dar
      return {
        tiene: false,
        fechaFin: null,
        diasRestantes: null,
        estado: null,
        institucion: actor.institucion ?? null,
      };
    }
    const rows = await this.oracle.query<{
      FECHA_FIN: string;
      ESTADO: string;
      DIAS_RESTANTES: number;
    }>(
      `SELECT TO_CHAR(FECHA_FIN, 'YYYY-MM-DD') AS FECHA_FIN, ESTADO,
              TRUNC(FECHA_FIN) - TO_DATE(:hoy, 'YYYY-MM-DD') AS DIAS_RESTANTES
         FROM SUSCRIPCIONES
        WHERE ID_INSTITUCION = :inst
          AND ESTADO IN ('ACTIVA', 'VENCIDA')
        ORDER BY FECHA_FIN DESC
        FETCH FIRST 1 ROWS ONLY`,
      { hoy: hoyEcuador(), inst: actor.idInstitucion },
    );
    const r = rows[0];
    return {
      tiene: !!r,
      fechaFin: r?.FECHA_FIN ?? null,
      diasRestantes: r?.DIAS_RESTANTES ?? null,
      estado: r?.ESTADO ?? null,
      institucion: actor.institucion ?? null,
    };
  }

  /* ------------------------------------------------------------ mutaciones */

  /**
   * Registra una COMPRA.
   *
   * FECHA_FIN = FECHA_INICIO + DIAS - 1 (decisión discutible, se deja explícita):
   * los días se cuentan INCLUSIVE, contando el primer día como día de servicio.
   * 30 días desde el 14/08 terminan el 12/09, no el 13/09. Si algún día se
   * prefiere el criterio contrario, este es el único sitio donde cambiarlo.
   */
  async crear(actor: JwtUser, dto: CrearSuscripcionDto) {
    this.assertSuper(actor);

    const inst = await this.oracle.query<{ ESTADO: string; NOMBRE: string }>(
      `SELECT ESTADO, NOMBRE FROM INSTITUCIONES WHERE ID_INSTITUCION = :id`,
      { id: dto.idInstitucion },
    );
    if (!inst[0]) throw new NotFoundException('Institution not found');

    let plan: {
      ID_PLAN: number;
      DIAS: number;
      PRECIO: number | null;
      MONEDA: string | null;
    } | null = null;
    if (dto.idPlan != null) {
      const rows = await this.oracle.query<{
        ID_PLAN: number;
        DIAS: number;
        PRECIO: number | null;
        MONEDA: string | null;
      }>(
        `SELECT ID_PLAN, DIAS, PRECIO, MONEDA FROM PLANES WHERE ID_PLAN = :id`,
        { id: dto.idPlan },
      );
      if (!rows[0]) throw new NotFoundException('Plan not found');
      plan = rows[0];
    }

    const dias = dto.dias ?? plan?.DIAS;
    if (!dias || dias < 1) {
      throw new BadRequestException(
        'Send "dias" or an "idPlan" whose plan defines the number of days',
      );
    }

    const fechaCompra = this.validarFecha(dto.fechaCompra, 'fechaCompra');
    const fechaInicio = this.validarFecha(
      dto.fechaInicio ?? fechaCompra,
      'fechaInicio',
    );
    const fechaFin = sumarDias(fechaInicio, dias - 1);

    // el panel MAYUSCULIZA todo lo que envía: el correo se guarda SIEMPRE en
    // minúsculas (aquí y con LOWER en el INSERT) o no vuelve a casar nunca
    const email = dto.compradorEmail.trim().toLowerCase();

    let idSuscripcion = 0;
    await this.oracle.withConnection(async (conn) => {
      // una sola suscripción vigente por institución: la anterior queda en el
      // historial como REEMPLAZADA (no se borra nada)
      await conn.execute(
        `UPDATE SUSCRIPCIONES
            SET ESTADO = 'REEMPLAZADA', MODIFICADO_POR = :actor,
                FECHA_MODIFICACION = SYSDATE
          WHERE ID_INSTITUCION = :inst AND ESTADO = 'ACTIVA'`,
        { actor: actor.sub.slice(0, 60), inst: dto.idInstitucion },
      );
      const r = await conn.execute(
        `INSERT INTO SUSCRIPCIONES
           (ID_INSTITUCION, ID_PLAN, COMPRADOR_EMAIL, COMPRADOR_NOMBRE,
            FECHA_COMPRA, FECHA_INICIO, FECHA_FIN, DIAS, MONTO, MONEDA,
            REFERENCIA_PAGO, ESTADO, NOTAS, CREADO_POR)
         VALUES
           (:inst, :plan, LOWER(:email), :nombre,
            TO_DATE(:compra, 'YYYY-MM-DD'), TO_DATE(:inicio, 'YYYY-MM-DD'),
            TO_DATE(:fin, 'YYYY-MM-DD'), :dias, :monto, :moneda,
            :ref, 'ACTIVA', :notas, :creadoPor)
         RETURNING ID_SUSCRIPCION INTO :out`,
        {
          inst: dto.idInstitucion,
          plan: this.num(plan?.ID_PLAN ?? dto.idPlan ?? null),
          email,
          nombre: dto.compradorNombre?.trim() || null,
          compra: fechaCompra,
          inicio: fechaInicio,
          fin: fechaFin,
          dias,
          monto: this.num(dto.monto ?? plan?.PRECIO ?? null),
          moneda: (dto.moneda ?? plan?.MONEDA ?? 'USD').toUpperCase().slice(0, 3),
          ref: dto.referenciaPago?.trim() || null,
          notas: dto.notas?.trim() || null,
          creadoPor: actor.sub.slice(0, 60),
          out: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER },
        },
      );
      await conn.commit();
      idSuscripcion = (r.outBinds as { out: number[] }).out[0];
    });

    // Si la institución estaba cortada por falta de pago y la compra cubre hoy,
    // vuelve a quedar operativa sin que nadie tenga que acordarse de hacerlo.
    const vigente = diasEntre(hoyEcuador(), fechaFin) >= 0;
    const reactivada = vigente
      ? await this.reactivarSiFueCortada(dto.idInstitucion, actor.sub)
      : false;

    this.logger.log(
      `Suscripción ${idSuscripcion} creada para institución ${dto.idInstitucion} ` +
        `(${fechaInicio} → ${fechaFin}, ${dias} días) por ${actor.sub}` +
        (reactivada ? ' — institución reactivada' : ''),
    );
    return { ...(await this.obtener(idSuscripcion)), reactivada };
  }

  /**
   * Edita la suscripción, incluido MOVER LAS FECHAS (es el caso de uso que se
   * pidió expresamente: correr el vencimiento cuando el cliente pagó tarde o se
   * negoció una prórroga). DIAS se recalcula siempre a partir del rango.
   */
  async editar(actor: JwtUser, id: number, dto: EditarSuscripcionDto) {
    this.assertSuper(actor);
    const actual = await this.obtener(id);

    const fechaInicio = this.validarFecha(
      dto.fechaInicio ?? actual.fechaInicio,
      'fechaInicio',
    );
    const fechaFin = this.validarFecha(dto.fechaFin ?? actual.fechaFin, 'fechaFin');
    if (diasEntre(fechaInicio, fechaFin) < 0) {
      throw new BadRequestException('fechaFin cannot be earlier than fechaInicio');
    }
    const dias = diasEntre(fechaInicio, fechaFin) + 1; // inclusive, igual que al crear
    const cambioFechaFin = fechaFin !== actual.fechaFin;
    const vigente = diasEntre(hoyEcuador(), fechaFin) >= 0;

    // Mover el fin hacia adelante REVIVE la suscripción vencida: una VENCIDA
    // con fecha de fin futura es un estado incoherente. Se condiciona a que la
    // fecha de fin haya cambiado en este PATCH, para no pisar el caso legítimo
    // de marcar VENCIDA a mano (corte anticipado) sin tocar las fechas — y
    // porque el formulario del panel reenvía el estado actual tal cual.
    let estado = dto.estado ?? actual.estado;
    if (estado === 'VENCIDA' && vigente && cambioFechaFin) estado = 'ACTIVA';

    await this.oracle.execute(
      `UPDATE SUSCRIPCIONES
          SET FECHA_INICIO     = TO_DATE(:inicio, 'YYYY-MM-DD'),
              FECHA_FIN        = TO_DATE(:fin, 'YYYY-MM-DD'),
              DIAS             = :dias,
              ESTADO           = :estado,
              NOTAS            = :notas,
              REFERENCIA_PAGO  = :ref,
              MONTO            = :monto,
              COMPRADOR_EMAIL  = LOWER(:email),
              COMPRADOR_NOMBRE = :nombre,
              -- al mover el vencimiento el aviso previo deja de valer: se
              -- limpia para que el trabajo nocturno vuelva a avisar
              AVISO_ENVIADO    = CASE WHEN :limpiaAviso = 1 THEN NULL ELSE AVISO_ENVIADO END,
              FECHA_CORTE      = CASE WHEN :estado2 = 'ACTIVA' THEN NULL ELSE FECHA_CORTE END,
              MODIFICADO_POR   = :actor,
              FECHA_MODIFICACION = SYSDATE
        WHERE ID_SUSCRIPCION = :id`,
      {
        inicio: fechaInicio,
        fin: fechaFin,
        dias,
        estado,
        estado2: estado,
        // borrables: null explícito = vaciar el campo (ver efectivo())
        notas: this.efectivo(dto.notas, actual.notas)?.trim() || null,
        ref: this.efectivo(dto.referenciaPago, actual.referenciaPago)?.trim() || null,
        monto: this.num(this.efectivo(dto.monto, actual.monto)),
        nombre:
          this.efectivo(dto.compradorNombre, actual.compradorNombre)?.trim() || null,
        // el correo NO es borrable: la columna es NOT NULL
        email: (dto.compradorEmail ?? actual.compradorEmail).trim().toLowerCase(),
        limpiaAviso: cambioFechaFin ? 1 : 0,
        actor: actor.sub.slice(0, 60),
        id,
      },
    );

    const reactivada =
      estado === 'ACTIVA' && vigente
        ? await this.reactivarSiFueCortada(actual.idInstitucion, actor.sub)
        : false;

    return { ...(await this.obtener(id)), reactivada };
  }

  /**
   * Cancela la suscripción (no borra: queda en el historial).
   * No suspende la institución a propósito — cancelar es una decisión
   * comercial; el corte del servicio se hace desde el propio panel de
   * instituciones o lo hace el trabajo nocturno al llegar el vencimiento.
   */
  async cancelar(actor: JwtUser, id: number) {
    this.assertSuper(actor);
    await this.obtener(id);
    await this.oracle.execute(
      `UPDATE SUSCRIPCIONES
          SET ESTADO = 'CANCELADA', MODIFICADO_POR = :actor,
              FECHA_MODIFICACION = SYSDATE
        WHERE ID_SUSCRIPCION = :id AND ESTADO <> 'CANCELADA'`,
      { actor: actor.sub.slice(0, 60), id },
    );
    return this.obtener(id);
  }

  /**
   * Devuelve la institución a 'APROBADA' SOLO si está SUSPENDIDA y el corte lo
   * hizo este módulo (existe alguna suscripción suya con FECHA_CORTE). Así una
   * institución suspendida a mano por otro motivo no se reactiva sola al
   * registrarle un pago. Va en un único UPDATE: sin lecturas previas, sin
   * carreras y idempotente.
   */
  async reactivarSiFueCortada(
    idInstitucion: number,
    actorSub: string,
  ): Promise<boolean> {
    const r = await this.oracle.execute(
      `UPDATE INSTITUCIONES
          SET ESTADO = 'APROBADA', FECHA_APROBACION = SYSDATE,
              APROBADO_POR = :actor
        WHERE ID_INSTITUCION = :inst
          AND ESTADO = 'SUSPENDIDA'
          AND EXISTS (SELECT 1 FROM SUSCRIPCIONES s
                       WHERE s.ID_INSTITUCION = :inst
                         AND s.FECHA_CORTE IS NOT NULL)`,
      { actor: actorSub.slice(0, 60), inst: idInstitucion },
    );
    return (r.rowsAffected ?? 0) > 0;
  }
}
