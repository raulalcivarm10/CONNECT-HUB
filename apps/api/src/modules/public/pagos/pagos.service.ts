import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { OracleService } from '../../../database/oracle.service';
import { EntradasService } from '../entradas/entradas.service';
import { AsistenteMailerService } from '../asistente-auth/asistente-mailer.service';
import { NuveiClient, NuveiCreds } from './nuvei.client';

interface EventoPagoRow {
  ID_EVENTO: number;
  TITULO: string;
  PRECIO: number | null;
  INCLUYE_IVA: string | null;
  MONTO_IVA: number | null;
  ID_EVENTO_PADRE: number | null;
  NO_PUBLICAR: string | null;
  ID_INSTITUCION: number | null;
}

interface TarjetaRow {
  ID_TARJETA: number;
  ID_CLIENTE: string;
  TOKEN: string;
  TIPO: string | null;
  LAST4: string | null;
  BIN: string | null;
  HOLDER_NAME: string | null;
  STATUS: string;
  PREDETERMINADO: number;
  ID_INSTITUCION: number | null;
  EXPIRY_MONTH: number;
  EXPIRY_YEAR: number;
}

/** Datos de una tarjeta nueva enviados por la app (PAN nunca se persiste). */
export interface NuevaTarjeta {
  idInstitucion: number;
  numero: string;
  holderName: string;
  expiryMonth: number;
  expiryYear: number;
  cvc: string;
}

// Imágenes vía NUESTRO proxy con caché Redis (no directo al NAS: ver archivos-proxy.controller)
const PROXY_BASE = `${process.env.APP_URL ?? 'https://connecthub.fourstacklabs.com'}/api`;

/**
 * Cobro de eventos de pago vía Nuvei/Paymentez. El servidor recalcula el monto
 * (nunca confía en el cliente), cobra con las credenciales de la institución y,
 * al aprobar, emite la entrada (misma tabla que el flujo gratis). No altera la
 * app externa: respeta trigger de ID_PAGO, convenciones de estado y TARJETAS.
 */
@Injectable()
export class PagosService {
  private readonly logger = new Logger(PagosService.name);

  constructor(
    private readonly oracle: OracleService,
    private readonly entradas: EntradasService,
    private readonly mailer: AsistenteMailerService,
  ) {}

  /**
   * Envía el correo de confirmación de pago (best-effort). Como el cobro real lo
   * hace el servicio externo, este método lo dispara la app tras confirmar OK.
   * Toma nombre + título del evento de la BD compartida; el monto/transacción los
   * pasa la app (es un correo informativo, no una autoridad financiera).
   */
  async enviarCorreoConfirmacion(
    idCliente: string,
    email: string,
    idEvento: number,
    transactionId: string,
    monto: number,
  ): Promise<{ sent: boolean }> {
    const u = await this.oracle.query<{
      NOMBRE: string | null;
      APELLIDO: string | null;
      EMAIL_FACTURA: string | null;
    }>(
      `SELECT NOMBRE, APELLIDO, EMAIL_FACTURA FROM USUARIOS WHERE ID_CLIENTE = :c`,
      { c: idCliente },
    );
    // El comprobante va al correo de FACTURACIÓN (el de login puede ser el relay
    // privado de Apple, que el usuario no revisa). Fallback: correo de la cuenta.
    const destino = u[0]?.EMAIL_FACTURA?.trim() || email;
    const nombre = [u[0]?.NOMBRE, u[0]?.APELLIDO].filter(Boolean).join(' ').trim() || destino;
    const ev = await this.oracle.query<{ TITULO: string }>(
      `SELECT TITULO FROM EVENTOS WHERE ID_EVENTO = :e`,
      { e: idEvento },
    );
    const titulo = ev[0]?.TITULO ?? 'Evento';
    const sent = await this.mailer.enviarConfirmacionPago(destino, nombre, titulo, monto, transactionId);
    return { sent };
  }

  /* ---------- credenciales / institución ---------- */

  private async credenciales(idInstitucion: number): Promise<NuveiCreds> {
    const rows = await this.oracle.query<{
      PROVEEDOR_PAGO: string | null;
      PAYMENT_ENVIROMENT: string | null;
      USUARIO_PASARELA: string | null;
      CONTRASENA_PASARELA: string | null;
      APP_CODE_CHECKOUT: string | null;
      APP_KEY_CHECKOUT: string | null;
      APP_CODE_TOKENIZATION: string | null;
      APP_KEY_TOKENIZATION: string | null;
    }>(
      `SELECT PROVEEDOR_PAGO, PAYMENT_ENVIROMENT,
              USUARIO_PASARELA, CONTRASENA_PASARELA,
              APP_CODE_CHECKOUT, APP_KEY_CHECKOUT,
              APP_CODE_TOKENIZATION, APP_KEY_TOKENIZATION
         FROM INSTITUCIONES WHERE ID_INSTITUCION = :id`,
      { id: idInstitucion },
    );
    const r = rows[0];
    // Modelo Paymentez/Nuvei (verificado con las creds demo):
    //  - card/add (tokenización)     → APP_*_TOKENIZATION  (…-CLIENT)
    //  - débito/verify/list/delete   → USUARIO/CONTRASENA_PASARELA (…-SERVER, mismo app)
    //  - checkout hospedado (link)   → APP_*_CHECKOUT
    const serverCode = r?.USUARIO_PASARELA ?? r?.APP_CODE_CHECKOUT ?? null;
    const serverKey = r?.CONTRASENA_PASARELA ?? r?.APP_KEY_CHECKOUT ?? null;
    if (!r || !serverCode || !serverKey || !r.APP_CODE_TOKENIZATION || !r.APP_KEY_TOKENIZATION) {
      throw new BadRequestException('Payment gateway not configured for this institution');
    }
    const env = String(r.PAYMENT_ENVIROMENT ?? 'stg')
      .toLowerCase()
      .startsWith('prod')
      ? 'prod'
      : 'stg';
    return {
      serverAppCode: serverCode,
      serverAppKey: serverKey,
      clientAppCode: r.APP_CODE_TOKENIZATION,
      clientAppKey: r.APP_KEY_TOKENIZATION,
      checkoutAppCode: r.APP_CODE_CHECKOUT ?? serverCode,
      checkoutAppKey: r.APP_KEY_CHECKOUT ?? serverKey,
      env,
    };
  }

  private async cliente(idInstitucion: number): Promise<NuveiClient> {
    return new NuveiClient(await this.credenciales(idInstitucion));
  }

  /** Verifica que el asistente pertenezca a la institución (USUARIO_INSTITUCIONES). */
  private async exigirMembresia(idCliente: string, idInstitucion: number) {
    // La institución además debe estar APROBADA: si se suspende, se bloquean
    // pagos/tarjetas/checkout de sus eventos de inmediato (sin tocar las apps).
    const rows = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N
         FROM USUARIO_INSTITUCIONES ui
         JOIN INSTITUCIONES i ON i.ID_INSTITUCION = ui.ID_INSTITUCION
        WHERE ui.ID_CLIENTE = :c AND ui.ID_INSTITUCION = :i
          AND i.ESTADO = 'APROBADA'`,
      { c: idCliente, i: idInstitucion },
    );
    if ((rows[0]?.N ?? 0) === 0) {
      throw new ForbiddenException('You do not belong to this institution');
    }
  }

  /* ---------- tarjetas ---------- */

  async listarTarjetas(idCliente: string, idInstitucion: number) {
    await this.exigirMembresia(idCliente, idInstitucion);
    const rows = await this.oracle.query<TarjetaRow>(
      `SELECT ID_TARJETA, TIPO, LAST4, BIN, HOLDER_NAME, STATUS, PREDETERMINADO,
              EXPIRY_MONTH, EXPIRY_YEAR
         FROM TARJETAS_USUARIO
        WHERE ID_CLIENTE = :c AND ID_INSTITUCION = :i AND STATUS = 'A'
        ORDER BY PREDETERMINADO DESC, ID_TARJETA DESC`,
      { c: idCliente, i: idInstitucion },
    );
    return rows.map((r) => this.mapTarjeta(r));
  }

  async agregarTarjeta(idCliente: string, email: string, t: NuevaTarjeta) {
    await this.exigirMembresia(idCliente, t.idInstitucion);
    const numero = t.numero.replace(/\s+/g, '');
    if (!/^\d{13,19}$/.test(numero)) throw new BadRequestException('Invalid card number');
    if (!/^\d{3,4}$/.test(t.cvc)) throw new BadRequestException('Invalid CVC');

    const client = await this.cliente(t.idInstitucion);
    const res = await client.addCard(
      { id: idCliente, email },
      {
        number: numero,
        holder_name: t.holderName,
        expiry_month: Number(t.expiryMonth),
        expiry_year: Number(t.expiryYear),
        cvc: t.cvc,
      },
    );
    const card = res.data?.card;
    if (!res.ok || !card?.token) {
      throw new BadRequestException(res.error?.description ?? 'Card could not be added');
    }

    // ¿primera tarjeta de la institución? → predeterminada
    const prev = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N FROM TARJETAS_USUARIO
        WHERE ID_CLIENTE = :c AND ID_INSTITUCION = :i AND STATUS = 'A'`,
      { c: idCliente, i: t.idInstitucion },
    );
    const predeterminado = (prev[0]?.N ?? 0) === 0 ? 1 : 0;
    const last4 = card.number ?? numero.slice(-4);

    const out = await this.oracle.execute<{ idOut: number[] }>(
      `INSERT INTO TARJETAS_USUARIO
         (ID_CLIENTE, EMAIL, TOKEN, BIN, TIPO, BANCO, EXPIRY_MONTH, EXPIRY_YEAR,
          STATUS, ORIGIN, TRANSACTION_REFERENCE, PREDETERMINADO, FECHA_REGISTRO,
          LAST4, HOLDER_NAME, ID_INSTITUCION)
       VALUES
         (:c, :email, :token, :bin, :tipo, :banco, :em, :ey,
          'A', 'Paymentez', :txref, :pred, SYSTIMESTAMP, :last4, :holder, :inst)
       RETURNING ID_TARJETA INTO :idOut`,
      {
        c: idCliente,
        email,
        token: card.token,
        bin: card.bin ?? numero.slice(0, 6),
        tipo: card.type ?? 'xx',
        banco: card.bank_name ?? null,
        em: Number(t.expiryMonth),
        ey: Number(t.expiryYear),
        txref: card.transaction_reference ?? null,
        pred: predeterminado,
        last4,
        holder: t.holderName,
        inst: t.idInstitucion,
        idOut: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER },
      },
    );
    const idTarjeta = out.outBinds?.idOut?.[0];
    return {
      id: Number(idTarjeta),
      tipo: card.type ?? null,
      last4,
      bin: card.bin ?? null,
      holderName: t.holderName,
      expiryMonth: Number(t.expiryMonth),
      expiryYear: Number(t.expiryYear),
      predeterminado: predeterminado === 1,
    };
  }

  async eliminarTarjeta(idCliente: string, idTarjeta: number) {
    const rows = await this.oracle.query<TarjetaRow>(
      `SELECT ID_TARJETA, TOKEN, ID_INSTITUCION, PREDETERMINADO
         FROM TARJETAS_USUARIO
        WHERE ID_TARJETA = :id AND ID_CLIENTE = :c AND STATUS = 'A'`,
      { id: idTarjeta, c: idCliente },
    );
    const card = rows[0];
    if (!card) throw new NotFoundException('Card not found');

    if (card.ID_INSTITUCION) {
      const client = await this.cliente(card.ID_INSTITUCION);
      // el borrado remoto es best-effort; localmente siempre la damos de baja
      await client.deleteCard(idCliente, card.TOKEN).catch(() => undefined);
    }
    await this.oracle.execute(
      `UPDATE TARJETAS_USUARIO SET STATUS = 'X' WHERE ID_TARJETA = :id AND ID_CLIENTE = :c`,
      { id: idTarjeta, c: idCliente },
    );
    // si era la predeterminada, promover otra
    if (card.PREDETERMINADO === 1) {
      await this.oracle.execute(
        `UPDATE TARJETAS_USUARIO SET PREDETERMINADO = 1
          WHERE ID_TARJETA = (
            SELECT ID_TARJETA FROM (
              SELECT ID_TARJETA FROM TARJETAS_USUARIO
               WHERE ID_CLIENTE = :c AND ID_INSTITUCION = :i AND STATUS = 'A'
               ORDER BY ID_TARJETA DESC
            ) WHERE ROWNUM = 1)`,
        { c: idCliente, i: card.ID_INSTITUCION },
      );
    }
    return { ok: true };
  }

  /* ---------- resolución de evento / monto ---------- */

  private async eventoParaPago(idEvento: number): Promise<EventoPagoRow> {
    const rows = await this.oracle.query<EventoPagoRow>(
      `SELECT e.ID_EVENTO, e.TITULO, e.PRECIO, e.INCLUYE_IVA, e.MONTO_IVA,
              e.ID_EVENTO_PADRE, e.NO_PUBLICAR,
              COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) AS ID_INSTITUCION
         FROM EVENTOS e
         LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
        WHERE e.ID_EVENTO = :id`,
      { id: idEvento },
    );
    const ev = rows[0];
    if (!ev || (ev.NO_PUBLICAR ?? 'N') === 'S') throw new NotFoundException('Event not found');
    if (!ev.ID_INSTITUCION) throw new BadRequestException('Event has no institution');
    return ev;
  }

  private montos(ev: EventoPagoRow) {
    const precio = ev.PRECIO ?? 0;
    if (precio <= 0) throw new BadRequestException('This event is free');
    // MONTO_IVA guarda el PORCENTAJE de IVA (p.ej. 15 = 15%), no un monto fijo.
    const pct = ev.MONTO_IVA ?? 0;
    const incluye = (ev.INCLUYE_IVA ?? 'N') === 'S';
    let subtotal: number;
    let iva: number;
    let total: number;
    if (incluye) {
      // El precio ya trae el IVA → se desglosa hacia atrás. El total NO cambia.
      total = precio;
      subtotal = pct > 0 ? precio / (1 + pct / 100) : precio;
      iva = precio - subtotal;
    } else {
      // El IVA se suma sobre el precio.
      subtotal = precio;
      iva = precio * (pct / 100);
      total = precio + iva;
    }
    // Paymentez exige vat (monto) + tax_percentage coherentes.
    return {
      subtotal: round2(subtotal),
      iva: round2(iva),
      total: round2(total),
      taxPct: Math.round(pct),
      incluyeIva: incluye,
    };
  }

  /** Ya tiene entrada para este evento (evita doble cobro). */
  private async yaTieneEntrada(idCliente: string, idEvento: number) {
    const rows = await this.oracle.query<{ ID_EVENTO_USUARIO: number; QR_TOKEN: string | null }>(
      `SELECT ID_EVENTO_USUARIO, QR_TOKEN FROM EVENTOS_USUARIOS
        WHERE ID_EVENTO = :e AND ID_CLIENTE = :c`,
      { e: idEvento, c: idCliente },
    );
    return rows[0] ?? null;
  }

  /** Regla workshop: exige el evento padre antes de pagar el hijo. */
  private async exigirPadre(idCliente: string, ev: EventoPagoRow) {
    if (!ev.ID_EVENTO_PADRE) return;
    const yaPadre = await this.yaTieneEntrada(idCliente, ev.ID_EVENTO_PADRE);
    if (yaPadre) return;
    // Precio/existencia del padre consultando la fila DIRECTO (sin el filtro de
    // publicado). Antes se usaba eventoParaPago, que LANZA en eventos no
    // publicados, y el .catch(()=>null) hacía que un padre en borrador dejara
    // comprar el hijo suelto (falla "abierto"). Ahora falla "cerrado".
    const prows = await this.oracle.query<{ ID_EVENTO: number; TITULO: string; PRECIO: number | null }>(
      `SELECT ID_EVENTO, TITULO, PRECIO FROM EVENTOS WHERE ID_EVENTO = :id`,
      { id: ev.ID_EVENTO_PADRE },
    );
    const padre = prows[0];
    if (!padre) return; // ID_EVENTO_PADRE huérfano → no hay padre que exigir
    if ((padre.PRECIO ?? 0) > 0) {
      throw new ConflictException({
        code: 'PARENT_REQUIRED',
        message: 'You must register for the main event first',
        padre: { id: padre.ID_EVENTO, titulo: padre.TITULO, precio: padre.PRECIO },
      });
    }
    // padre gratis → inscripción automática
    await this.entradas.emitirPorPago(idCliente, padre.ID_EVENTO);
  }

  /**
   * Datos de facturación del asistente para el cobro. EXIGE nombre+apellido del
   * DUEÑO (obligatorios antes de comprar cualquier curso) y usa EMAIL_FACTURA
   * como correo del comprobante si está definido (puede diferir del de la cuenta).
   */
  private async datosPago(idCliente: string, emailCuenta: string) {
    const rows = await this.oracle.query<{
      NOMBRE: string | null;
      APELLIDO: string | null;
      EMAIL_FACTURA: string | null;
    }>(
      `SELECT NOMBRE, APELLIDO, EMAIL_FACTURA FROM USUARIOS WHERE ID_CLIENTE = :c`,
      { c: idCliente },
    );
    const u = rows[0];
    const nombre = u?.NOMBRE?.trim();
    const apellido = u?.APELLIDO?.trim();
    if (!nombre || !apellido) {
      throw new ConflictException({
        code: 'PROFILE_INCOMPLETE',
        message: 'Complete your name and surname in your profile before purchasing',
      });
    }
    return { nombre, apellido, email: u?.EMAIL_FACTURA?.trim() || emailCuenta };
  }

  /** Detalle de precio para pintar el checkout antes de cobrar. */
  async resumenPago(idCliente: string, idEvento: number) {
    const ev = await this.eventoParaPago(idEvento);
    await this.exigirMembresia(idCliente, ev.ID_INSTITUCION!);
    const m = this.montos(ev);
    const ya = await this.yaTieneEntrada(idCliente, idEvento);

    // Regla workshop → evento principal. El cobro real lo hace el SERVICIO
    // EXTERNO (la app no pasa por nuestro /checkout/iniciar), así que la app
    // necesita saber AQUÍ si falta el padre para bloquear el pago y avisar.
    let padreRequerido: { id: number; titulo: string; precio: number } | null = null;
    if (ev.ID_EVENTO_PADRE && !(await this.yaTieneEntrada(idCliente, ev.ID_EVENTO_PADRE))) {
      const prows = await this.oracle.query<{ ID_EVENTO: number; TITULO: string; PRECIO: number | null }>(
        `SELECT ID_EVENTO, TITULO, PRECIO FROM EVENTOS WHERE ID_EVENTO = :id`,
        { id: ev.ID_EVENTO_PADRE },
      );
      const padre = prows[0];
      if (padre && (padre.PRECIO ?? 0) > 0) {
        padreRequerido = { id: padre.ID_EVENTO, titulo: padre.TITULO, precio: padre.PRECIO! };
      }
    }

    return {
      idEvento: ev.ID_EVENTO,
      titulo: ev.TITULO,
      idInstitucion: ev.ID_INSTITUCION!,
      moneda: 'USD',
      ...m,
      yaAdquirido: !!ya,
      padreRequerido,
      portadaUrl: `${PROXY_BASE}/archivos/proxy?tipoEntidad=EVENTO&id=${ev.ID_EVENTO}&tipoArchivo=PORTADA`,
    };
  }

  /**
   * Valida un cupón del evento (existe, activo, con usos disponibles) y calcula
   * el descuento sobre el total. Solo lee EVENTO_CUPONES (config del panel); NO
   * consume el cupón (eso lo hace el servicio de pagos al cobrar). Sirve para el
   * feedback del botón "validar" en la app.
   */
  async validarCupon(idCliente: string, idEvento: number, codigo: string) {
    const ev = await this.eventoParaPago(idEvento);
    await this.exigirMembresia(idCliente, ev.ID_INSTITUCION!);
    const m = this.montos(ev);
    const code = (codigo ?? '').trim().toUpperCase();
    const invalido = { valido: false as const, motivo: 'not_found' as const, total: m.total };
    if (code.length < 3) return invalido;
    const rows = await this.oracle.query<{
      CODIGO: string;
      MONTO_DESCUENTO: number;
      TIPO_DESCUENTO: string | null;
      MAX_USOS: number | null;
      USOS: number | null;
      ACTIVO: string | null;
    }>(
      `SELECT CODIGO, MONTO_DESCUENTO, TIPO_DESCUENTO, MAX_USOS, USOS, ACTIVO
         FROM EVENTO_CUPONES
        WHERE ID_EVENTO = :e AND UPPER(CODIGO) = :c`,
      { e: idEvento, c: code },
    );
    const cup = rows[0];
    if (!cup || (cup.ACTIVO ?? 'S') !== 'S') return invalido;
    if (cup.MAX_USOS != null && (cup.USOS ?? 0) >= cup.MAX_USOS) {
      return { valido: false as const, motivo: 'exhausted' as const, total: m.total };
    }
    const tipo: 'M' | 'P' = (cup.TIPO_DESCUENTO ?? 'M') === 'P' ? 'P' : 'M';
    const bruto = tipo === 'P' ? m.total * (cup.MONTO_DESCUENTO / 100) : cup.MONTO_DESCUENTO;
    const descuento = Math.min(round2(bruto), m.total);
    return {
      valido: true as const,
      codigo: cup.CODIGO,
      tipoDescuento: tipo,
      montoDescuento: cup.MONTO_DESCUENTO,
      descuento: round2(descuento),
      total: m.total,
      totalConDescuento: round2(Math.max(0, m.total - descuento)),
    };
  }

  /**
   * Inscripción con cupón del 100%: si el cupón cubre TODO el total, no hay
   * nada que cobrar y el flujo NO debe pasar por la pasarela (el servicio de
   * pagos externo ignora el cupón y cobraría el precio completo).
   *
   * El descuento se revalida AQUÍ, en el servidor, contra EVENTO_CUPONES: la
   * app solo manda el código, nunca "esto es gratis". El cupón se consume de
   * forma atómica (respetando MAX_USOS bajo concurrencia) y la inscripción
   * queda marcada con el código en EVENTOS_USUARIOS.CUPON_CODIGO para que
   * conste que esa entrada salió con descuento del 100%.
   */
  async inscribirConCupon(idCliente: string, idEvento: number, codigo: string) {
    const ev = await this.eventoParaPago(idEvento);
    await this.exigirMembresia(idCliente, ev.ID_INSTITUCION!);

    // idempotencia: si ya tiene la entrada, no consume el cupón otra vez
    const ya = await this.yaTieneEntrada(idCliente, idEvento);
    if (ya) {
      return {
        aprobado: true,
        yaAdquirido: true,
        idEventoUsuario: ya.ID_EVENTO_USUARIO,
        qrToken: ya.QR_TOKEN,
      };
    }
    await this.exigirPadre(idCliente, ev);
    // mismos requisitos de perfil que un pago (nombre+apellido → certificado)
    await this.datosPago(idCliente, '');

    // misma aritmética que ve la app (IVA incluido), nada recalculado a mano
    const val = await this.validarCupon(idCliente, idEvento, codigo);
    if (!val.valido) {
      throw new BadRequestException(
        val.motivo === 'exhausted' ? 'Coupon exhausted' : 'Invalid coupon',
      );
    }
    if (val.totalConDescuento > 0) {
      // cubre solo una parte: ese camino sigue siendo el checkout de pago
      throw new BadRequestException('Coupon does not cover the full amount');
    }

    // Consumo ATÓMICO: el WHERE repite las condiciones para que dos peticiones
    // simultáneas no gasten el mismo último uso (rowsAffected decide).
    const consumo = await this.oracle.execute(
      `UPDATE EVENTO_CUPONES
          SET USOS = NVL(USOS, 0) + 1
        WHERE ID_EVENTO = :e
          AND UPPER(CODIGO) = :c
          AND NVL(ACTIVO, 'S') = 'S'
          AND (MAX_USOS IS NULL OR NVL(USOS, 0) < MAX_USOS)`,
      { e: idEvento, c: (codigo ?? '').trim().toUpperCase() },
    );
    if (!consumo.rowsAffected) {
      throw new BadRequestException('Coupon exhausted');
    }

    // misma entrada que un pago aprobado (QR, Mis Entradas, check-in, certificados)
    const entrada = await this.entradas.emitirPorPago(idCliente, idEvento);
    await this.oracle.execute(
      `UPDATE EVENTOS_USUARIOS
          SET CUPON_CODIGO = :cup
        WHERE ID_EVENTO_USUARIO = :id AND CUPON_CODIGO IS NULL`,
      { cup: val.codigo, id: entrada.idEventoUsuario },
    );

    return {
      aprobado: true,
      gratis: true,
      cupon: val.codigo,
      idEventoUsuario: entrada.idEventoUsuario,
      qrToken: entrada.qrToken,
    };
  }

  /* ---------- pago directo (tarjeta tokenizada) ---------- */

  async pagarDirecto(idCliente: string, email: string, idEvento: number, idTarjeta: number) {
    const ev = await this.eventoParaPago(idEvento);
    await this.exigirMembresia(idCliente, ev.ID_INSTITUCION!);
    const m = this.montos(ev);

    // idempotencia: si ya tiene la entrada, no cobra de nuevo
    const ya = await this.yaTieneEntrada(idCliente, idEvento);
    if (ya) {
      return {
        aprobado: true,
        yaAdquirido: true,
        idEventoUsuario: ya.ID_EVENTO_USUARIO,
        qrToken: ya.QR_TOKEN,
      };
    }
    await this.exigirPadre(idCliente, ev);
    // Exige nombre+apellido y usa EMAIL_FACTURA para el comprobante.
    const pago = await this.datosPago(idCliente, email);

    const tarjeta = await this.tarjetaValida(idCliente, idTarjeta, ev.ID_INSTITUCION!);
    const referencia = genReferencia();
    const idPago = await this.insertarPagoPendiente({
      referencia,
      monto: m.total,
      idEvento: ev.ID_EVENTO,
      idCliente,
      last4: tarjeta.LAST4,
      marca: tarjeta.TIPO,
      origen: 'APP',
    });

    const client = await this.cliente(ev.ID_INSTITUCION!);
    const res = await client.debit(
      { id: idCliente, email: pago.email },
      {
        amount: m.total,
        description: ev.TITULO.slice(0, 100),
        dev_reference: referencia,
        vat: m.iva,
        tax_percentage: m.taxPct,
        currency: 'USD',
      },
      tarjeta.TOKEN,
    );

    const tx = res.data?.transaction;
    const estado = clasificar(tx);
    const respJson = safeJson(res.data ?? res.error);

    if (estado === 'APPROVED') {
      const entrada = await this.entradas.emitirPorPago(idCliente, ev.ID_EVENTO);
      await this.marcarPago(idPago, 'APPROVED', 'EXITOSO', tx?.id ?? null, tx?.message ?? 'Operation Successful', respJson, entrada.idEventoUsuario);
      return {
        aprobado: true,
        idEventoUsuario: entrada.idEventoUsuario,
        qrToken: entrada.qrToken,
        transaccionId: tx?.id != null ? String(tx.id) : null,
        monto: m.total,
      };
    }
    if (estado === 'PENDING') {
      await this.marcarPago(idPago, 'PENDIENTE', 'PENDIENTE', tx?.id ?? null, tx?.message ?? 'Pending', respJson, null);
      return {
        aprobado: false,
        pendiente: true,
        referencia,
        transaccionId: tx?.id != null ? String(tx.id) : null,
      };
    }
    await this.marcarPago(idPago, 'RECHAZADO', 'FALLIDO', tx?.id ?? null, tx?.message ?? res.error?.description ?? 'Rejected', respJson, null);
    return {
      aprobado: false,
      pendiente: false,
      motivo: tx?.message ?? res.error?.description ?? 'Payment rejected',
    };
  }

  private async tarjetaValida(idCliente: string, idTarjeta: number, idInstitucion: number) {
    const rows = await this.oracle.query<TarjetaRow>(
      `SELECT ID_TARJETA, TOKEN, TIPO, LAST4 FROM TARJETAS_USUARIO
        WHERE ID_TARJETA = :id AND ID_CLIENTE = :c AND ID_INSTITUCION = :i AND STATUS = 'A'`,
      { id: idTarjeta, c: idCliente, i: idInstitucion },
    );
    const t = rows[0];
    if (!t) throw new NotFoundException('Card not found for this institution');
    return t;
  }

  /* ---------- checkout hospedado (Link to Pay) ---------- */

  async crearCheckout(idCliente: string, email: string, idEvento: number) {
    const ev = await this.eventoParaPago(idEvento);
    await this.exigirMembresia(idCliente, ev.ID_INSTITUCION!);
    const m = this.montos(ev);

    const ya = await this.yaTieneEntrada(idCliente, idEvento);
    if (ya) return { yaAdquirido: true };
    await this.exigirPadre(idCliente, ev);

    // Exige nombre+apellido (obligatorios para el certificado) y usa EMAIL_FACTURA.
    const pago = await this.datosPago(idCliente, email);

    const referencia = genReferencia();
    await this.insertarPagoPendiente({
      referencia,
      monto: m.total,
      idEvento: ev.ID_EVENTO,
      idCliente,
      last4: null,
      marca: null,
      origen: 'CHECKOUT',
    });

    const base = process.env.PUBLIC_API_URL ?? 'https://connecthub.fourstacklabs.com/api';
    const client = await this.cliente(ev.ID_INSTITUCION!);
    const res = await client.linkToPay({
      user: { id: idCliente, email: pago.email, name: pago.nombre, last_name: pago.apellido },
      order: {
        dev_reference: referencia,
        description: ev.TITULO.slice(0, 100),
        amount: m.total,
        vat: m.iva,
        tax_percentage: m.taxPct,
        installments_type: 0,
        currency: 'USD',
      },
      configuration: {
        partial_payment: false,
        expiration_days: 1,
        allowed_payment_methods: ['All'],
        success_url: `${base}/public/pagos/retorno?ref=${referencia}&r=ok`,
        failure_url: `${base}/public/pagos/retorno?ref=${referencia}&r=fail`,
        pending_url: `${base}/public/pagos/retorno?ref=${referencia}&r=pending`,
        review_url: `${base}/public/pagos/retorno?ref=${referencia}&r=review`,
      },
    });
    const url = res.data?.data?.payment?.payment_url;
    if (!res.ok || !res.data?.success || !url) {
      throw new BadRequestException(res.error?.description ?? 'Checkout could not be created');
    }
    return { yaAdquirido: false, referencia, paymentUrl: url };
  }

  /* ---------- checkout embebido (widget PaymentCheckout / init_reference) ---------- */

  /**
   * Inicia un Checkout embebido: recalcula el monto, crea el PAGO pendiente y pide
   * a Paymentez una `reference` para abrir el widget en la app (modal.open({reference})).
   * Devuelve la referencia Paymentez + nuestra referencia (dev_reference) + el env.
   */
  async iniciarCheckout(idCliente: string, email: string, idEvento: number) {
    const ev = await this.eventoParaPago(idEvento);
    await this.exigirMembresia(idCliente, ev.ID_INSTITUCION!);
    const m = this.montos(ev);

    const ya = await this.yaTieneEntrada(idCliente, idEvento);
    if (ya) return { yaAdquirido: true as const };
    await this.exigirPadre(idCliente, ev);

    // Exige nombre+apellido (obligatorios para el certificado) y usa EMAIL_FACTURA.
    const pago = await this.datosPago(idCliente, email);

    const referencia = genReferencia();
    await this.insertarPagoPendiente({
      referencia,
      monto: m.total,
      idEvento: ev.ID_EVENTO,
      idCliente,
      last4: null,
      marca: null,
      origen: 'CHECKOUT',
    });

    const creds = await this.credenciales(ev.ID_INSTITUCION!);
    const client = new NuveiClient(creds);
    const res = await client.initReference(
      { id: idCliente, email: pago.email, name: pago.nombre, last_name: pago.apellido },
      {
        amount: m.total,
        description: ev.TITULO.slice(0, 100),
        dev_reference: referencia,
        vat: m.iva,
        tax_percentage: m.taxPct,
        installments_type: -1,
        currency: 'USD',
      },
    );
    const reference = res.data?.reference;
    if (!res.ok || !reference) {
      throw new BadRequestException(res.error?.description ?? 'Checkout could not be started');
    }
    return {
      yaAdquirido: false as const,
      referencia, // nuestra dev_reference (para confirmar/polling/webhook)
      reference, // referencia Paymentez (para el widget modal.open({reference}))
      envMode: creds.env, // 'stg' | 'prod'
      checkoutUrl: res.data?.checkout_url ?? null,
    };
  }

  /**
   * Confirma un Checkout embebido tras el onResponse del widget. Nunca confía en el
   * cliente: reconsulta la transacción a la pasarela (verify), la liga a NUESTRO pago
   * pendiente por dev_reference + monto y, si aprueba, emite la entrada (idempotente).
   */
  async confirmarCheckout(idCliente: string, idEvento: number, referencia: string, transactionId: string) {
    const ev = await this.eventoParaPago(idEvento);
    await this.exigirMembresia(idCliente, ev.ID_INSTITUCION!);

    const pagos = await this.oracle.query<{ ID_PAGO: number; ESTADO: string; MONTO: number }>(
      `SELECT ID_PAGO, ESTADO, MONTO FROM PAGOS
        WHERE REFERENCIA = :ref AND ID_CLIENTE = :c AND ID_EVENTO = :e`,
      { ref: referencia, c: idCliente, e: idEvento },
    );
    const pago = pagos[0];
    if (!pago) throw new NotFoundException('Payment not found');

    // idempotencia: ya emitida
    const ya = await this.yaTieneEntrada(idCliente, idEvento);
    if (pago.ESTADO === 'APPROVED' || ya) {
      return {
        aprobado: true,
        yaAdquirido: true,
        idEventoUsuario: ya?.ID_EVENTO_USUARIO,
        qrToken: ya?.QR_TOKEN ?? null,
      };
    }

    const client = await this.cliente(ev.ID_INSTITUCION!);
    const v = await client.verify(transactionId);
    const tx = v.data?.transaction;
    const respJson = safeJson(v.data ?? v.error);

    // Si la verificación falló (red/5xx) o no devolvió transacción, NO concluimos:
    // dejamos el pago PENDIENTE para que el webhook/polling lo reconcilie. Nunca
    // negamos una entrada por un fallo transitorio (el cargo puede haberse hecho).
    if (!v.ok || !tx) {
      return { aprobado: false, pendiente: true, referencia };
    }

    // Anti-fraude: la transacción debe pertenecer a NUESTRO pago (misma dev_reference)
    // y coincidir el monto recalculado en el server.
    const refOk = !tx.dev_reference || tx.dev_reference === referencia;
    const montoOk = tx.amount == null || Math.abs(Number(tx.amount) - Number(pago.MONTO)) < 0.01;
    const estado = refOk && montoOk ? clasificar(tx) : 'REJECTED';

    if (estado === 'APPROVED') {
      // Reclamo atómico del pago: solo UN proceso (este confirm, un reintento o el
      // webhook) pasa PENDIENTE→APPROVED y emite la entrada. Evita entradas dobles.
      const claimed = await this.reclamarPagoAprobado(pago.ID_PAGO, transactionId, tx.message ?? 'Confirmed by checkout', respJson);
      if (!claimed) {
        const ya2 = await this.yaTieneEntrada(idCliente, idEvento);
        return { aprobado: true, yaAdquirido: true, idEventoUsuario: ya2?.ID_EVENTO_USUARIO, qrToken: ya2?.QR_TOKEN ?? null };
      }
      const entrada = await this.entradas.emitirPorPago(idCliente, ev.ID_EVENTO);
      await this.enlazarEntrada(pago.ID_PAGO, entrada.idEventoUsuario);
      return {
        aprobado: true,
        idEventoUsuario: entrada.idEventoUsuario,
        qrToken: entrada.qrToken,
        transaccionId: transactionId,
        monto: Number(pago.MONTO),
      };
    }
    if (estado === 'PENDING') {
      await this.marcarPago(pago.ID_PAGO, 'PENDIENTE', 'PENDIENTE', transactionId, tx.message ?? 'Pending', respJson, null);
      return { aprobado: false, pendiente: true, referencia };
    }
    await this.marcarPago(pago.ID_PAGO, 'RECHAZADO', 'FALLIDO', transactionId, tx.message ?? v.error?.description ?? 'Rejected', respJson, null);
    return { aprobado: false, pendiente: false, motivo: tx.message ?? 'Payment rejected' };
  }

  /** Estado de un pago propio por referencia (para el polling del checkout). */
  async estadoPago(idCliente: string, referencia: string) {
    const rows = await this.oracle.query<{
      ESTADO: string;
      ID_EVENTO: number;
      ID_EVENTO_USUARIO: number | null;
    }>(
      `SELECT ESTADO, ID_EVENTO, ID_EVENTO_USUARIO FROM PAGOS
        WHERE REFERENCIA = :ref AND ID_CLIENTE = :c`,
      { ref: referencia, c: idCliente },
    );
    const p = rows[0];
    if (!p) throw new NotFoundException('Payment not found');
    let qrToken: string | null = null;
    if (p.ESTADO === 'APPROVED') {
      const ent = await this.yaTieneEntrada(idCliente, p.ID_EVENTO);
      qrToken = ent?.QR_TOKEN ?? null;
    }
    return {
      estado: p.ESTADO,
      aprobado: p.ESTADO === 'APPROVED',
      idEvento: p.ID_EVENTO,
      idEventoUsuario: p.ID_EVENTO_USUARIO,
      qrToken,
    };
  }

  /* ---------- webhook (confirmación asíncrona) ---------- */

  async webhook(body: unknown) {
    const tx = (body as { transaction?: { id?: string; dev_reference?: string; status?: string; current_status?: string } })?.transaction;
    const ref = tx?.dev_reference;
    const txId = tx?.id;
    if (!ref && !txId) return { ok: true, ignored: true };

    const rows = await this.oracle.query<{
      ID_PAGO: number;
      ESTADO: string;
      ID_EVENTO: number;
      ID_CLIENTE: string;
      ID_INSTITUCION: number | null;
    }>(
      `SELECT p.ID_PAGO, p.ESTADO, p.ID_EVENTO, p.ID_CLIENTE,
              COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) AS ID_INSTITUCION
         FROM PAGOS p
         JOIN EVENTOS e ON e.ID_EVENTO = p.ID_EVENTO
         LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
        WHERE ${ref ? 'p.REFERENCIA = :key' : 'p.TRANSACCION_ID = :key'}`,
      { key: ref ?? txId },
    );
    const pago = rows[0];
    if (!pago) return { ok: true, ignored: true };
    if (pago.ESTADO === 'APPROVED') return { ok: true, alreadyApproved: true }; // idempotente

    // Verificación anti-spoofing: reconsultamos el estado a la pasarela
    let confirmado = clasificar(tx);
    if (txId && pago.ID_INSTITUCION) {
      const client = await this.cliente(pago.ID_INSTITUCION);
      const v = await client.verify(txId);
      if (v.ok && v.data?.transaction) confirmado = clasificar(v.data.transaction);
    }

    if (confirmado === 'APPROVED') {
      // Reclamo atómico (mismo gate que confirmarCheckout) → una sola emisión.
      const claimed = await this.reclamarPagoAprobado(pago.ID_PAGO, txId ?? null, 'Confirmed by webhook', safeJson(body));
      if (!claimed) return { ok: true, alreadyApproved: true };
      const entrada = await this.entradas.emitirPorPago(pago.ID_CLIENTE, pago.ID_EVENTO);
      await this.enlazarEntrada(pago.ID_PAGO, entrada.idEventoUsuario);
      return { ok: true, approved: true };
    }
    if (confirmado === 'REJECTED') {
      await this.marcarPago(pago.ID_PAGO, 'RECHAZADO', 'FALLIDO', txId ?? null, 'Rejected by webhook', safeJson(body), null);
    }
    return { ok: true, approved: false };
  }

  /* ---------- helpers de PAGOS ---------- */

  private async insertarPagoPendiente(p: {
    referencia: string;
    monto: number;
    idEvento: number;
    idCliente: string;
    last4: string | null;
    marca: string | null;
    origen: string;
  }): Promise<number> {
    const out = await this.oracle.execute<{ idOut: number[] }>(
      `INSERT INTO PAGOS
         (REFERENCIA, PASARELA, MONTO, MONEDA, ESTADO, TIPO_PAGO, ULTIMOS_4,
          MARCA_TARJETA, ES_GRATIS, FECHA_REGISTRO, ID_EVENTO, ID_CLIENTE,
          ORIGEN_PAGO, METODO_PAGO)
       VALUES
         (:ref, 'paymentez', :monto, 'USD', 'PENDIENTE', 'PENDIENTE', :last4,
          :marca, 'N', SYSDATE, :idEvento, :idCli, :origen, '0')
       RETURNING ID_PAGO INTO :idOut`,
      {
        ref: p.referencia,
        monto: p.monto,
        last4: p.last4,
        marca: p.marca,
        idEvento: p.idEvento,
        idCli: p.idCliente,
        origen: p.origen,
        idOut: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER },
      },
    );
    return Number(out.outBinds?.idOut?.[0]);
  }

  /**
   * Reclama atómicamente un pago pendiente (PENDIENTE→APPROVED). Devuelve true si
   * ESTE proceso ganó la carrera (rowsAffected=1). El UPDATE condicional serializa
   * confirm/webhook/reintentos por bloqueo de fila, garantizando una sola emisión.
   */
  private async reclamarPagoAprobado(
    idPago: number,
    transaccionId: string | number | null,
    detalle: string,
    respJson: string,
  ): Promise<boolean> {
    const r = await this.oracle.execute(
      `UPDATE PAGOS
          SET ESTADO = 'APPROVED', TIPO_PAGO = 'EXITOSO',
              TRANSACCION_ID = COALESCE(:tid, TRANSACCION_ID),
              DETALLE_ESTADO = :det, RESPONSE_JSON = :resp, FECHA_PAGO = SYSDATE
        WHERE ID_PAGO = :id AND ESTADO = 'PENDIENTE'`,
      {
        tid: transaccionId != null ? String(transaccionId) : null,
        det: detalle?.slice(0, 255) ?? null,
        resp: respJson,
        id: idPago,
      },
    );
    return (r.rowsAffected ?? 0) > 0;
  }

  /** Enlaza la entrada emitida al pago (después del reclamo atómico). */
  private async enlazarEntrada(idPago: number, idEventoUsuario: number) {
    await this.oracle.execute(
      `UPDATE PAGOS SET ID_EVENTO_USUARIO = :eu WHERE ID_PAGO = :id`,
      { eu: { val: idEventoUsuario, type: this.oracle.NUMBER }, id: idPago },
    );
  }

  private async marcarPago(
    idPago: number,
    estado: string,
    tipoPago: string,
    transaccionId: string | number | null,
    detalle: string,
    respJson: string,
    idEventoUsuario: number | null,
  ) {
    await this.oracle.execute(
      `UPDATE PAGOS
          SET ESTADO = :estado, TIPO_PAGO = :tipo, TRANSACCION_ID = :tid,
              DETALLE_ESTADO = :detalle, RESPONSE_JSON = :resp,
              FECHA_PAGO = CASE WHEN :estado2 = 'APPROVED' THEN SYSDATE ELSE FECHA_PAGO END,
              ID_EVENTO_USUARIO = COALESCE(:ideu, ID_EVENTO_USUARIO)
        WHERE ID_PAGO = :id`,
      {
        estado,
        estado2: estado,
        tipo: tipoPago,
        // TRANSACCION_ID es VARCHAR2; la pasarela puede devolver el id como número
        tid: transaccionId != null ? String(transaccionId) : null,
        detalle: detalle?.slice(0, 255) ?? null,
        resp: respJson,
        // tipo explícito: si va null, node-oracledb lo bindea como CHAR y choca
        // con la columna NUMBER dentro del COALESCE (ORA-00932)
        ideu: { val: idEventoUsuario, type: this.oracle.NUMBER },
        id: idPago,
      },
    );
  }

  private mapTarjeta(r: TarjetaRow) {
    return {
      id: Number(r.ID_TARJETA),
      tipo: r.TIPO ?? null,
      last4: r.LAST4 ?? null,
      bin: r.BIN ?? null,
      holderName: r.HOLDER_NAME ?? null,
      expiryMonth: Number(r.EXPIRY_MONTH),
      expiryYear: Number(r.EXPIRY_YEAR),
      predeterminado: r.PREDETERMINADO === 1,
    };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function genReferencia(): string {
  return `CH-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

function clasificar(tx?: {
  status?: string;
  current_status?: string;
}): 'APPROVED' | 'PENDING' | 'REJECTED' {
  const s = (tx?.status ?? '').toLowerCase();
  const cs = (tx?.current_status ?? '').toUpperCase();
  if (s === 'success' || cs === 'APPROVED') return 'APPROVED';
  if (s === 'pending' || cs === 'PENDING') return 'PENDING';
  return 'REJECTED';
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v).slice(0, 3900);
  } catch {
    return '{}';
  }
}
