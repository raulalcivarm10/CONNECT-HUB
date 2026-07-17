import { Injectable, NotFoundException } from '@nestjs/common';
import { OracleService } from '../../../database/oracle.service';

const NAS_URL = process.env.NAS_URL ?? 'https://api-ligaprocorp.ec:3443/api';

/**
 * URL pública de una imagen del NAS (usable directo en <Image>). Con `version`
 * (timestamp de la última carga en ARCHIVOS) agrega `&v=...` como cache-bust:
 * al reemplazar la imagen en el panel la URL cambia → el cliente muestra la nueva.
 */
function nasUrl(tipoEntidad: string, id: number, tipoArchivo = 'PORTADA', version?: string | null) {
  const base = `${NAS_URL}/archivos/activo?tipoEntidad=${tipoEntidad}&id=${id}&tipoArchivo=${tipoArchivo}`;
  return version ? `${base}&v=${version}` : base;
}

/** Subquery correlacionada que devuelve la versión (YYYYMMDDHH24MISS) de la portada activa. */
const V_EVENTO_PORTADA =
  `TO_CHAR((SELECT MAX(a.FECHA_REGISTRO) FROM ARCHIVOS a ` +
  `WHERE a.ID_EVENTO = e.ID_EVENTO AND a.TIPO_ARCHIVO = 'PORTADA' AND NVL(a.ACTIVO,'S') = 'S'),'YYYYMMDDHH24MISS')`;
const V_EXPOSITOR_PORTADA =
  `TO_CHAR((SELECT MAX(a.FECHA_REGISTRO) FROM ARCHIVOS a ` +
  `WHERE a.ID_EXPOSITOR = ee.ID_EXPOSITOR AND a.TIPO_ARCHIVO = 'PORTADA' AND NVL(a.ACTIVO,'S') = 'S'),'YYYYMMDDHH24MISS')`;

/** Parsea un CLOB JSON (array) de forma segura → [] si viene null/roto */
function parseJsonArray(v: unknown): string[] {
  if (v == null) return [];
  try {
    const parsed = JSON.parse(String(v));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toDias(dias: unknown, fallback: string): string[] {
  return dias ? String(dias).split(',') : [fallback];
}

interface EventoBaseRow {
  ID_EVENTO: number;
  ID_INSTITUCION: number | null;
  NO_PUBLICAR: string | null;
}

/**
 * Catálogo PÚBLICO para la app de asistentes (sin auth). Reutiliza el esquema
 * del panel pero SIEMPRE filtrando eventos privados (NO_PUBLICAR='S') y
 * limitando a la institución del CODIGO_CONEXION. Nunca expone credenciales de
 * pasarela ni datos internos (email de expositor, etc.). Devuelve DTOs limpios
 * en camelCase (contrato estable para el cliente móvil tipado).
 */
@Injectable()
export class CatalogoService {
  constructor(private readonly oracle: OracleService) {}

  /** CODIGO_CONEXION → institución (aprobada). Sin datos sensibles. */
  async resolverInstitucion(codigo: string) {
    const rows = await this.oracle.query<{
      ID_INSTITUCION: number;
      NOMBRE: string;
      CIUDAD: string | null;
      PAIS: string | null;
      CODIGO_CONEXION: string;
      TIENE_LOGO: number;
    }>(
      `SELECT ID_INSTITUCION, NOMBRE, CIUDAD, PAIS, CODIGO_CONEXION,
              CASE WHEN IMAGEN IS NOT NULL THEN 1 ELSE 0 END AS TIENE_LOGO
         FROM INSTITUCIONES
        WHERE UPPER(CODIGO_CONEXION) = UPPER(:codigo)
          AND ESTADO = 'APROBADA'`,
      { codigo },
    );
    const inst = rows[0];
    if (!inst) throw new NotFoundException('Connection code not found');
    return {
      idInstitucion: inst.ID_INSTITUCION,
      nombre: inst.NOMBRE,
      ciudad: inst.CIUDAD,
      pais: inst.PAIS,
      codigo: inst.CODIGO_CONEXION,
      logoUrl: inst.TIENE_LOGO
        ? `/public/instituciones/${inst.ID_INSTITUCION}/logo`
        : null,
    };
  }

  /** Logo (BLOB) de la institución para streaming. */
  async logoInstitucion(
    idInstitucion: number,
  ): Promise<{ buffer: Buffer; mime: string }> {
    const rows = await this.oracle.query<{
      IMAGEN: Buffer | null;
      IMAGEN_MIME_TYPE: string | null;
    }>(
      `SELECT IMAGEN, IMAGEN_MIME_TYPE FROM INSTITUCIONES
        WHERE ID_INSTITUCION = :id AND ESTADO = 'APROBADA'`,
      { id: idInstitucion },
    );
    const row = rows[0];
    if (!row?.IMAGEN) throw new NotFoundException('Logo not found');
    return { buffer: row.IMAGEN, mime: row.IMAGEN_MIME_TYPE ?? 'image/png' };
  }

  /** id de institución a partir del código (o NotFound). */
  private async idInstitucionPorCodigo(codigo: string): Promise<number> {
    const rows = await this.oracle.query<{ ID_INSTITUCION: number }>(
      `SELECT ID_INSTITUCION FROM INSTITUCIONES
        WHERE UPPER(CODIGO_CONEXION) = UPPER(:codigo) AND ESTADO = 'APROBADA'`,
      { codigo },
    );
    if (!rows[0]) throw new NotFoundException('Connection code not found');
    return rows[0].ID_INSTITUCION;
  }

  /**
   * Vincula un asistente a una institución al ingresar su código (idempotente).
   * Guarda (ID_CLIENTE, ID_INSTITUCION) en USUARIO_INSTITUCIONES; el PK lo pone
   * el trigger TRG_USUARIO_INSTITUCIONES.
   */
  async vincularInstitucion(idCliente: string, codigo: string) {
    const idInstitucion = await this.idInstitucionPorCodigo(codigo.trim());
    const ya = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N FROM USUARIO_INSTITUCIONES
        WHERE ID_CLIENTE = :c AND ID_INSTITUCION = :i`,
      { c: idCliente, i: idInstitucion },
    );
    if (!ya[0]?.N) {
      await this.oracle.execute(
        `INSERT INTO USUARIO_INSTITUCIONES
           (ID_CLIENTE, ID_INSTITUCION, ESTADO, FECHA_REGISTRO)
         VALUES (:c, :i, 'A', SYSDATE)`,
        { c: idCliente, i: idInstitucion },
      );
    }
    const rows = await this.oracle.query<{
      ID_INSTITUCION: number;
      NOMBRE: string;
      CIUDAD: string | null;
      PAIS: string | null;
      CODIGO_CONEXION: string;
      TIENE_LOGO: number;
    }>(
      `SELECT ID_INSTITUCION, NOMBRE, CIUDAD, PAIS, CODIGO_CONEXION,
              CASE WHEN IMAGEN IS NOT NULL THEN 1 ELSE 0 END AS TIENE_LOGO
         FROM INSTITUCIONES WHERE ID_INSTITUCION = :i`,
      { i: idInstitucion },
    );
    const inst = rows[0];
    return {
      idInstitucion: inst.ID_INSTITUCION,
      nombre: inst.NOMBRE,
      ciudad: inst.CIUDAD,
      pais: inst.PAIS,
      codigo: inst.CODIGO_CONEXION,
      logoUrl: inst.TIENE_LOGO
        ? `/public/instituciones/${inst.ID_INSTITUCION}/logo`
        : null,
    };
  }

  /** Instituciones a las que el asistente está vinculado. */
  async misInstituciones(idCliente: string) {
    const rows = await this.oracle.query<{
      ID_INSTITUCION: number;
      NOMBRE: string;
      CIUDAD: string | null;
      PAIS: string | null;
      CODIGO_CONEXION: string;
      TIENE_LOGO: number;
    }>(
      `SELECT i.ID_INSTITUCION, i.NOMBRE, i.CIUDAD, i.PAIS, i.CODIGO_CONEXION,
              CASE WHEN i.IMAGEN IS NOT NULL THEN 1 ELSE 0 END AS TIENE_LOGO
         FROM USUARIO_INSTITUCIONES ui
         JOIN INSTITUCIONES i ON i.ID_INSTITUCION = ui.ID_INSTITUCION
        WHERE ui.ID_CLIENTE = :c AND i.ESTADO = 'APROBADA'
        ORDER BY ui.FECHA_REGISTRO DESC`,
      { c: idCliente },
    );
    return rows.map((inst) => ({
      idInstitucion: inst.ID_INSTITUCION,
      nombre: inst.NOMBRE,
      ciudad: inst.CIUDAD,
      pais: inst.PAIS,
      codigo: inst.CODIGO_CONEXION,
      logoUrl: inst.TIENE_LOGO
        ? `/public/instituciones/${inst.ID_INSTITUCION}/logo`
        : null,
    }));
  }

  private mapEventoResumen(r: Record<string, unknown>) {
    return {
      id: Number(r.ID_EVENTO),
      titulo: r.TITULO as string,
      descripcion: (r.DESCRIPCION as string) ?? null,
      fechaInicio: r.FECHA_EVENTO as string,
      fechaFin: r.FECHA_FIN as string,
      horaInicio: (r.HORA_INICIO as string) ?? null,
      horaFin: (r.HORA_FIN as string) ?? null,
      precio: r.PRECIO == null ? null : Number(r.PRECIO),
      incluyeIva: (r.INCLUYE_IVA ?? 'N') === 'S',
      montoIva: r.MONTO_IVA == null ? null : Number(r.MONTO_IVA),
      destacado: (r.DESTACADO ?? 0) === 1,
      localNombre: (r.LOCAL_NOMBRE as string) ?? null,
      salonNombre: (r.SALON_NOMBRE as string) ?? null,
      dias: toDias(r.DIAS, r.FECHA_EVENTO as string),
      portadaUrl: nasUrl('EVENTO', Number(r.ID_EVENTO), 'PORTADA', (r.PORTADA_V as string) ?? null),
      // presente solo en el feed agregado (multi-institución)
      idInstitucion: r.ID_INSTITUCION == null ? null : Number(r.ID_INSTITUCION),
      institucionNombre: (r.INSTITUCION_NOMBRE as string) ?? null,
    };
  }

  /**
   * Feed AGREGADO: eventos principales públicos de TODAS las instituciones a las
   * que el asistente pertenece (USUARIO_INSTITUCIONES), cada uno etiquetado con
   * su institución. Paginado.
   */
  async misEventos(opts: {
    idCliente: string;
    q?: string;
    page?: number;
    size?: number;
  }) {
    const page = Math.max(1, Number(opts.page) || 1);
    const size = Math.min(50, Math.max(1, Number(opts.size) || 20));
    const offset = (page - 1) * size;
    const q = opts.q?.trim() ? opts.q.trim() : null;

    const where = `COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) IN (
             SELECT ID_INSTITUCION FROM USUARIO_INSTITUCIONES WHERE ID_CLIENTE = :cli)
         AND NVL(e.NO_PUBLICAR,'N') = 'N'
         AND e.ID_EVENTO_PADRE IS NULL
         AND (:q IS NULL OR UPPER(e.TITULO) LIKE '%' || UPPER(:q) || '%')`;
    const binds = { cli: opts.idCliente, q };

    const totalRows = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N
         FROM EVENTOS e
         LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
        WHERE ${where}`,
      binds,
    );
    const total = totalRows[0]?.N ?? 0;

    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT e.ID_EVENTO, e.TITULO, e.DESCRIPCION,
              TO_CHAR(e.FECHA_EVENTO, 'YYYY-MM-DD') AS FECHA_EVENTO,
              TO_CHAR(NVL(e.FECHA_FIN, e.FECHA_EVENTO), 'YYYY-MM-DD') AS FECHA_FIN,
              e.HORA_INICIO, e.HORA_FIN, e.PRECIO, e.INCLUYE_IVA, e.MONTO_IVA,
              e.DESTACADO, l.NOMBRE AS LOCAL_NOMBRE, s.NOMBRE AS SALON_NOMBRE,
              COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) AS ID_INSTITUCION,
              i.NOMBRE AS INSTITUCION_NOMBRE,
              (SELECT LISTAGG(TO_CHAR(h.FECHA, 'YYYY-MM-DD'), ',')
                        WITHIN GROUP (ORDER BY h.FECHA)
                 FROM EVENTO_HORAS h WHERE h.ID_EVENTO = e.ID_EVENTO) AS DIAS,
              ${V_EVENTO_PORTADA} AS PORTADA_V
         FROM EVENTOS e
         LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
         LEFT JOIN INSTITUCIONES i
                ON i.ID_INSTITUCION = COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION)
        WHERE ${where}
        ORDER BY e.DESTACADO DESC NULLS LAST, e.FECHA_EVENTO
        OFFSET :rowOffset ROWS FETCH NEXT :rowLimit ROWS ONLY`,
      { ...binds, rowOffset: offset, rowLimit: size },
    );

    return { page, size, total, items: rows.map((r) => this.mapEventoResumen(r)) };
  }

  /**
   * Lista de eventos PRINCIPALES públicos de una institución, paginada.
   * Los workshops (hijos) no aparecen sueltos: se ven dentro del detalle.
   */
  async listarEventos(opts: {
    codigo: string;
    q?: string;
    destacados?: boolean;
    page?: number;
    size?: number;
  }) {
    const idInst = await this.idInstitucionPorCodigo(opts.codigo);
    const page = Math.max(1, Number(opts.page) || 1);
    const size = Math.min(50, Math.max(1, Number(opts.size) || 20));
    const offset = (page - 1) * size;
    const q = opts.q?.trim() ? opts.q.trim() : null;

    const where =
      `COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) = :idInst
         AND NVL(e.NO_PUBLICAR,'N') = 'N'
         AND e.ID_EVENTO_PADRE IS NULL
         AND (:q IS NULL OR UPPER(e.TITULO) LIKE '%' || UPPER(:q) || '%')` +
      (opts.destacados ? ` AND e.DESTACADO = 1` : '');

    const binds = { idInst, q };

    const totalRows = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N
         FROM EVENTOS e
         LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
        WHERE ${where}`,
      binds,
    );
    const total = totalRows[0]?.N ?? 0;

    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT e.ID_EVENTO, e.TITULO, e.DESCRIPCION,
              TO_CHAR(e.FECHA_EVENTO, 'YYYY-MM-DD') AS FECHA_EVENTO,
              TO_CHAR(NVL(e.FECHA_FIN, e.FECHA_EVENTO), 'YYYY-MM-DD') AS FECHA_FIN,
              e.HORA_INICIO, e.HORA_FIN, e.PRECIO, e.INCLUYE_IVA, e.MONTO_IVA,
              e.DESTACADO, e.ORDEN_DESTACADO,
              l.NOMBRE AS LOCAL_NOMBRE, s.NOMBRE AS SALON_NOMBRE,
              (SELECT LISTAGG(TO_CHAR(h.FECHA, 'YYYY-MM-DD'), ',')
                        WITHIN GROUP (ORDER BY h.FECHA)
                 FROM EVENTO_HORAS h WHERE h.ID_EVENTO = e.ID_EVENTO) AS DIAS,
              ${V_EVENTO_PORTADA} AS PORTADA_V
         FROM EVENTOS e
         LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
        WHERE ${where}
        ORDER BY e.DESTACADO DESC NULLS LAST, e.ORDEN_DESTACADO NULLS LAST,
                 e.FECHA_EVENTO
        OFFSET :rowOffset ROWS FETCH NEXT :rowLimit ROWS ONLY`,
      { ...binds, rowOffset: offset, rowLimit: size },
    );

    return {
      page,
      size,
      total,
      items: rows.map((r) => this.mapEventoResumen(r)),
    };
  }

  /** Verifica que el evento sea público; devuelve su fila base o NotFound. */
  private async eventoPublico(id: number): Promise<EventoBaseRow> {
    const rows = await this.oracle.query<EventoBaseRow>(
      `SELECT e.ID_EVENTO,
              COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) AS ID_INSTITUCION,
              e.NO_PUBLICAR
         FROM EVENTOS e
         LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
        WHERE e.ID_EVENTO = :id`,
      { id },
    );
    const ev = rows[0];
    if (!ev || (ev.NO_PUBLICAR ?? 'N') === 'S') {
      throw new NotFoundException('Event not found');
    }
    return ev;
  }

  /** Días (agenda) de un evento. */
  private async diasEvento(id: number) {
    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT ID_HORA, TO_CHAR(FECHA, 'YYYY-MM-DD') AS FECHA,
              HORA_INICIO, HORA_FIN, ORDEN
         FROM EVENTO_HORAS WHERE ID_EVENTO = :id ORDER BY FECHA, HORA_INICIO`,
      { id },
    );
    return rows.map((r) => ({
      id: Number(r.ID_HORA),
      fecha: r.FECHA as string,
      horaInicio: (r.HORA_INICIO as string) ?? null,
      horaFin: (r.HORA_FIN as string) ?? null,
      orden: r.ORDEN == null ? null : Number(r.ORDEN),
    }));
  }

  /** Expositores públicos (sin email interno) + foto del NAS. */
  private async expositoresEvento(id: number) {
    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT ee.ID_EXPOSITOR, ee.NOMBRE_COMPLETO, ee.CARGO, ee.ORGANIZACION, ee.TAGLINE,
              ee.BIO, ee.FOTO_URL, ee.SITIO_WEB_URL, ee.REDES_SOCIALES, ee.ROL, ee.ES_DESTACADO,
              ee.ORDEN, ${V_EXPOSITOR_PORTADA} AS FOTO_V
         FROM EVENTO_EXPOSITORES ee
        WHERE ee.ID_EVENTO = :id AND NVL(ee.IS_ACTIVE,1) = 1
        ORDER BY ee.ORDEN, ee.FECHA_REGISTRO`,
      { id },
    );
    return rows.map((r) => ({
      id: Number(r.ID_EXPOSITOR),
      nombreCompleto: r.NOMBRE_COMPLETO as string,
      cargo: (r.CARGO as string) ?? null,
      organizacion: (r.ORGANIZACION as string) ?? null,
      tagline: (r.TAGLINE as string) ?? null,
      bio: (r.BIO as string) ?? null,
      sitioWebUrl: (r.SITIO_WEB_URL as string) ?? null,
      redesSociales: parseJsonArray(r.REDES_SOCIALES),
      rol: (r.ROL as string) ?? null,
      esDestacado: (r.ES_DESTACADO ?? 0) === 1,
      orden: r.ORDEN == null ? null : Number(r.ORDEN),
      fotoUrl: nasUrl('EXPOSITOR', Number(r.ID_EXPOSITOR), 'PORTADA', (r.FOTO_V as string) ?? null),
    }));
  }

  /** Detalle 1:1 con arrays JSON parseados. null si no existe. */
  private async detalleEvento(id: number) {
    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT DESCRIPCION_CORTA, DESCRIPCION_LARGA, QUE_APRENDERAS, TEMAS,
              REQUISITOS, PUBLICO_OBJETIVO, BIBLIOGRAFIA, NIVEL, MODALIDAD,
              RITMO, DURACION_VALOR, DURACION_UNIDAD, ESFUERZO_HS_SEMANA, IDIOMA,
              VIDEO_PROMO_URL, CERT_HABILITADO, CERT_TIPO, CERT_ENTREGA
         FROM EVENTO_DETALLE WHERE ID_EVENTO = :id`,
      { id },
    );
    const d = rows[0];
    if (!d) return null;
    return {
      descripcionCorta: (d.DESCRIPCION_CORTA as string) ?? null,
      descripcionLarga: (d.DESCRIPCION_LARGA as string) ?? null,
      queAprenderas: parseJsonArray(d.QUE_APRENDERAS),
      temas: parseJsonArray(d.TEMAS),
      requisitos: parseJsonArray(d.REQUISITOS),
      publicoObjetivo: parseJsonArray(d.PUBLICO_OBJETIVO),
      bibliografia: parseJsonArray(d.BIBLIOGRAFIA),
      nivel: (d.NIVEL as string) ?? null,
      modalidad: (d.MODALIDAD as string) ?? null,
      ritmo: (d.RITMO as string) ?? null,
      duracionValor: d.DURACION_VALOR == null ? null : Number(d.DURACION_VALOR),
      duracionUnidad: (d.DURACION_UNIDAD as string) ?? null,
      esfuerzoHsSemana:
        d.ESFUERZO_HS_SEMANA == null ? null : Number(d.ESFUERZO_HS_SEMANA),
      idioma: (d.IDIOMA as string) ?? null,
      videoPromoUrl: (d.VIDEO_PROMO_URL as string) ?? null,
      certHabilitado: (d.CERT_HABILITADO ?? 0) === 1,
      certTipo: (d.CERT_TIPO as string) ?? null,
      certEntrega: (d.CERT_ENTREGA as string) ?? null,
    };
  }

  /** Workshops (eventos hijos) públicos con su horario. */
  private async workshopsEvento(id: number) {
    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT e.ID_EVENTO, e.TITULO, e.DESCRIPCION, e.PRECIO,
              TO_CHAR(e.FECHA_EVENTO,'YYYY-MM-DD') AS FECHA_EVENTO,
              e.HORA_INICIO, e.HORA_FIN, s.NOMBRE AS SALON_NOMBRE,
              (SELECT LISTAGG(TO_CHAR(h.FECHA,'YYYY-MM-DD'), ',')
                        WITHIN GROUP (ORDER BY h.FECHA)
                 FROM EVENTO_HORAS h WHERE h.ID_EVENTO = e.ID_EVENTO) AS DIAS,
              ${V_EVENTO_PORTADA} AS PORTADA_V
         FROM EVENTOS e
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
        WHERE e.ID_EVENTO_PADRE = :id AND NVL(e.NO_PUBLICAR,'N') = 'N'
        ORDER BY e.FECHA_EVENTO, e.HORA_INICIO`,
      { id },
    );
    return rows.map((r) => ({
      id: Number(r.ID_EVENTO),
      titulo: r.TITULO as string,
      descripcion: (r.DESCRIPCION as string) ?? null,
      precio: r.PRECIO == null ? null : Number(r.PRECIO),
      fechaInicio: r.FECHA_EVENTO as string,
      horaInicio: (r.HORA_INICIO as string) ?? null,
      horaFin: (r.HORA_FIN as string) ?? null,
      salonNombre: (r.SALON_NOMBRE as string) ?? null,
      dias: toDias(r.DIAS, r.FECHA_EVENTO as string),
    }));
  }

  /** Detalle COMPUESTO de un evento público. */
  async getEvento(id: number) {
    await this.eventoPublico(id);
    const baseRows = await this.oracle.query<Record<string, unknown>>(
      `SELECT e.ID_EVENTO, e.TITULO, e.DESCRIPCION, e.PRECIO, e.INCLUYE_IVA,
              e.MONTO_IVA, e.PUBLICO_ESPERADO, e.COD_ITEM,
              TO_CHAR(e.FECHA_EVENTO,'YYYY-MM-DD') AS FECHA_EVENTO,
              TO_CHAR(NVL(e.FECHA_FIN,e.FECHA_EVENTO),'YYYY-MM-DD') AS FECHA_FIN,
              e.HORA_INICIO, e.HORA_FIN, e.ID_EVENTO_PADRE,
              l.NOMBRE AS LOCAL_NOMBRE, l.UBICACION AS LOCAL_UBICACION,
              s.NOMBRE AS SALON_NOMBRE, i.NOMBRE AS INSTITUCION,
              ${V_EVENTO_PORTADA} AS PORTADA_V
         FROM EVENTOS e
         LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
         LEFT JOIN INSTITUCIONES i
                ON i.ID_INSTITUCION = COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION)
        WHERE e.ID_EVENTO = :id`,
      { id },
    );
    const b = baseRows[0];
    const [dias, expositores, detalle, workshops] = await Promise.all([
      this.diasEvento(id),
      this.expositoresEvento(id),
      this.detalleEvento(id),
      this.workshopsEvento(id),
    ]);
    return {
      id: Number(b.ID_EVENTO),
      titulo: b.TITULO as string,
      descripcion: (b.DESCRIPCION as string) ?? null,
      precio: b.PRECIO == null ? null : Number(b.PRECIO),
      incluyeIva: (b.INCLUYE_IVA ?? 'N') === 'S',
      montoIva: b.MONTO_IVA == null ? null : Number(b.MONTO_IVA),
      publicoEsperado:
        b.PUBLICO_ESPERADO == null ? null : Number(b.PUBLICO_ESPERADO),
      codItem: (b.COD_ITEM as string) ?? null,
      fechaInicio: b.FECHA_EVENTO as string,
      fechaFin: b.FECHA_FIN as string,
      horaInicio: (b.HORA_INICIO as string) ?? null,
      horaFin: (b.HORA_FIN as string) ?? null,
      idEventoPadre: b.ID_EVENTO_PADRE == null ? null : Number(b.ID_EVENTO_PADRE),
      localNombre: (b.LOCAL_NOMBRE as string) ?? null,
      localUbicacion: (b.LOCAL_UBICACION as string) ?? null,
      salonNombre: (b.SALON_NOMBRE as string) ?? null,
      institucion: (b.INSTITUCION as string) ?? null,
      portadaUrl: nasUrl('EVENTO', id, 'PORTADA', (b.PORTADA_V as string) ?? null),
      dias,
      expositores,
      detalle,
      workshops,
    };
  }
}
