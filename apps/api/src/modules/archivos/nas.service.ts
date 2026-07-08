import {
  BadGatewayException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type TipoEntidad =
  | 'EVENTO'
  | 'INSTITUCION'
  | 'LOCAL'
  | 'SALON'
  | 'SUBSALON'
  | 'CONFIGURACION';

const CAMPO_ID: Record<TipoEntidad, string> = {
  EVENTO: 'idEvento',
  INSTITUCION: 'idInstitucion',
  LOCAL: 'idLocal',
  SALON: 'idSalon',
  SUBSALON: 'idSubsalon',
  CONFIGURACION: 'idConfiguracion',
};

/**
 * Cliente del servidor de archivos externo (NAS). El NAS guarda el físico y
 * registra en la tabla ARCHIVOS (un solo activo por entidad+tipo; el anterior
 * queda con ACTIVO='N'). La imagen activa se lee por URL pública directa.
 */
@Injectable()
export class NasService {
  private readonly logger = new Logger(NasService.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl =
      config.get<string>('NAS_URL') ?? 'https://api-ligaprocorp.ec:3443/api';
  }

  async subir(opts: {
    tipoEntidad: TipoEntidad;
    id: number;
    tipoArchivo: string;
    buffer: Buffer;
    filename: string;
    mimetype: string;
  }): Promise<unknown> {
    const form = new FormData();
    form.append('tipoEntidad', opts.tipoEntidad);
    form.append(CAMPO_ID[opts.tipoEntidad], String(opts.id));
    form.append('tipoArchivo', opts.tipoArchivo);
    form.append(
      'archivo',
      new Blob([new Uint8Array(opts.buffer)], { type: opts.mimetype }),
      opts.filename,
    );

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/archivos`, {
        method: 'POST',
        body: form,
      });
    } catch (err) {
      this.logger.error(`NAS inalcanzable: ${String(err)}`);
      throw new BadGatewayException(
        'El servidor de archivos no está disponible; intenta de nuevo.',
      );
    }
    const body = (await res.json().catch(() => null)) as {
      mensaje?: string;
    } | null;
    if (!res.ok) {
      this.logger.error(`NAS ${res.status}: ${JSON.stringify(body)?.slice(0, 300)}`);
      // el NAS aún no soporta las entidades nuevas (SALON/SUBSALON/CONFIGURACION)
      if (body?.mensaje?.toLowerCase().includes('entidad')) {
        throw new BadGatewayException(
          `El servidor de archivos (NAS) aún no soporta imágenes de ${opts.tipoEntidad}. ` +
            `Comparte la especificación docs/nas-espacios.md con el equipo del NAS para habilitarlo.`,
        );
      }
      throw new BadGatewayException(
        `El servidor de archivos rechazó la carga (${res.status})` +
          `${body?.mensaje ? `: ${body.mensaje}` : '.'}`,
      );
    }
    return body;
  }

  /** URL pública de la imagen activa (usable directo en <img>) */
  urlActivo(tipoEntidad: TipoEntidad, id: number, tipoArchivo: string): string {
    return (
      `${this.baseUrl}/archivos/activo` +
      `?tipoEntidad=${tipoEntidad}&id=${id}&tipoArchivo=${tipoArchivo}`
    );
  }
}
