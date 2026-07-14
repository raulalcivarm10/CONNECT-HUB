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
  | 'CONFIGURACION'
  | 'EXPOSITOR';

const CAMPO_ID: Record<TipoEntidad, string> = {
  EVENTO: 'idEvento',
  INSTITUCION: 'idInstitucion',
  LOCAL: 'idLocal',
  SALON: 'idSalon',
  SUBSALON: 'idSubsalon',
  CONFIGURACION: 'idConfiguracion',
  EXPOSITOR: 'idExpositor',
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
        'The file server is unavailable; please try again.',
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
          `The file server (NAS) does not yet support ${opts.tipoEntidad} images. ` +
            `Share the docs/nas-espacios.md specification with the NAS team to enable it.`,
        );
      }
      throw new BadGatewayException(
        `The file server rejected the upload (${res.status})` +
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
