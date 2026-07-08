import { Injectable, Logger } from '@nestjs/common';
import { OracleService } from '../../database/oracle.service';
import { NasService, TipoEntidad } from './nas.service';
import { ArchivoSubido } from './multipart.util';

const COLUMNA_ID: Record<TipoEntidad, string> = {
  EVENTO: 'ID_EVENTO',
  INSTITUCION: 'ID_INSTITUCION',
  LOCAL: 'ID_LOCAL',
  SALON: 'ID_SALON',
  SUBSALON: 'ID_SUBSALON',
  CONFIGURACION: 'ID_CONFIGURACION',
};

interface FilaArchivo {
  ID_ARCHIVO: number;
  NOMBRE_ORIGINAL: string;
  NOMBRE_FISICO: string;
  MIME_TYPE: string | null;
  TAMANIO_BYTES: number | null;
  URL_ARCHIVO: string;
}

/**
 * Sube al NAS manteniendo UN registro único y ESTABLE por ítem
 * (entidad + id + tipoArchivo): la primera subida crea el registro; las
 * ediciones conservan el mismo ID_ARCHIVO actualizando sus datos con el
 * archivo nuevo, y se elimina la fila extra que crea el NAS en cada carga.
 * Así el ID del registro es único y no cambia cuando se le llama.
 */
@Injectable()
export class ArchivosService {
  private readonly logger = new Logger(ArchivosService.name);

  constructor(
    private readonly oracle: OracleService,
    private readonly nas: NasService,
  ) {}

  async subirYReemplazar(opts: {
    tipoEntidad: TipoEntidad;
    id: number;
    tipoArchivo: string;
    archivo: ArchivoSubido;
  }): Promise<{ idArchivo: number | null; url: string; nas: unknown }> {
    const columna = COLUMNA_ID[opts.tipoEntidad];
    const binds = {
      id: opts.id,
      tipoEntidad: opts.tipoEntidad,
      tipoArchivo: opts.tipoArchivo,
    };

    // registro actual del ítem (si existe): su ID se conserva para siempre
    const actual = await this.oracle.query<{ ID_ARCHIVO: number }>(
      `SELECT ID_ARCHIVO FROM ARCHIVOS
        WHERE ${columna} = :id AND TIPO_ENTIDAD = :tipoEntidad
          AND TIPO_ARCHIVO = :tipoArchivo AND ACTIVO = 'S'`,
      binds,
    );
    const idOriginal = actual[0]?.ID_ARCHIVO ?? null;

    const respuestaNas = await this.nas.subir({
      tipoEntidad: opts.tipoEntidad,
      id: opts.id,
      tipoArchivo: opts.tipoArchivo,
      ...opts.archivo,
    });

    let idArchivo = idOriginal;
    await this.oracle.withConnection(async (conn) => {
      if (idOriginal != null) {
        // datos de la fila nueva que creó el NAS
        const nuevo = await conn.execute<FilaArchivo>(
          `SELECT ID_ARCHIVO, NOMBRE_ORIGINAL, NOMBRE_FISICO, MIME_TYPE,
                  TAMANIO_BYTES, URL_ARCHIVO
             FROM ARCHIVOS
            WHERE ${columna} = :id AND TIPO_ENTIDAD = :tipoEntidad
              AND TIPO_ARCHIVO = :tipoArchivo AND ACTIVO = 'S'`,
          binds,
        );
        const filaNueva = nuevo.rows?.[0];
        if (filaNueva && filaNueva.ID_ARCHIVO !== idOriginal) {
          // edición: el registro original absorbe el archivo nuevo (mismo ID)
          await conn.execute(
            `UPDATE ARCHIVOS SET
               NOMBRE_ORIGINAL = :nombreOriginal,
               NOMBRE_FISICO = :nombreFisico,
               MIME_TYPE = :mimeType,
               TAMANIO_BYTES = :tamanio,
               URL_ARCHIVO = :urlArchivo,
               ACTIVO = 'S',
               FECHA_REGISTRO = SYSDATE
             WHERE ID_ARCHIVO = :idOriginal`,
            {
              nombreOriginal: filaNueva.NOMBRE_ORIGINAL,
              nombreFisico: filaNueva.NOMBRE_FISICO,
              mimeType: filaNueva.MIME_TYPE,
              tamanio: {
                val: filaNueva.TAMANIO_BYTES,
                type: this.oracle.NUMBER,
              },
              urlArchivo: filaNueva.URL_ARCHIVO,
              idOriginal,
            },
          );
          await conn.execute(`DELETE FROM ARCHIVOS WHERE ID_ARCHIVO = :id`, {
            id: filaNueva.ID_ARCHIVO,
          });
          this.logger.log(
            `${opts.tipoEntidad} ${opts.id} ${opts.tipoArchivo}: registro ` +
              `${idOriginal} actualizado en sitio (fila temporal ${filaNueva.ID_ARCHIVO} eliminada)`,
          );
        }
      }
      // purga defensiva de inactivos residuales del ítem
      await conn.execute(
        `DELETE FROM ARCHIVOS
          WHERE ${columna} = :id AND TIPO_ENTIDAD = :tipoEntidad
            AND TIPO_ARCHIVO = :tipoArchivo AND ACTIVO = 'N'`,
        binds,
      );
      await conn.commit();
    });

    if (idArchivo == null) {
      // primera subida: el registro creado por el NAS es el definitivo
      const creado = await this.oracle.query<{ ID_ARCHIVO: number }>(
        `SELECT ID_ARCHIVO FROM ARCHIVOS
          WHERE ${columna} = :id AND TIPO_ENTIDAD = :tipoEntidad
            AND TIPO_ARCHIVO = :tipoArchivo AND ACTIVO = 'S'`,
        binds,
      );
      idArchivo = creado[0]?.ID_ARCHIVO ?? null;
    }

    return {
      idArchivo,
      url: this.nas.urlActivo(opts.tipoEntidad, opts.id, opts.tipoArchivo),
      nas: respuestaNas,
    };
  }

  /**
   * Elimina el registro de la imagen del ítem (la tabla queda limpia y la URL
   * pública pasa a 404). El archivo físico queda en el disco del NAS hasta que
   * exista su endpoint de borrado.
   */
  async eliminarImagen(
    tipoEntidad: TipoEntidad,
    id: number,
    tipoArchivo: string,
  ): Promise<{ eliminados: number }> {
    const columna = COLUMNA_ID[tipoEntidad];
    const result = await this.oracle.execute(
      `DELETE FROM ARCHIVOS
        WHERE ${columna} = :id AND TIPO_ENTIDAD = :tipoEntidad
          AND TIPO_ARCHIVO = :tipoArchivo`,
      { id, tipoEntidad, tipoArchivo },
    );
    return { eliminados: result.rowsAffected ?? 0 };
  }
}
