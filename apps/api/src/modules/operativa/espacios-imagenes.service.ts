import { Injectable } from '@nestjs/common';
import { JwtUser } from '../../auth/types';
import { ArchivosService } from '../archivos/archivos.service';
import { ArchivoSubido } from '../archivos/multipart.util';
import { TipoEntidad } from '../archivos/nas.service';
import { ScopeService } from './scope.service';

/**
 * Imágenes de referencia de la jerarquía física (local → salón → subsalón →
 * configuración), guardadas en la tabla ARCHIVOS como CROQUIS de cada entidad.
 * Requiere que el NAS soporte las entidades SALON/SUBSALON/CONFIGURACION
 * (ver docs/nas-espacios.md); LOCAL ya funciona hoy.
 */
@Injectable()
export class EspaciosImagenesService {
  constructor(
    private readonly scope: ScopeService,
    private readonly archivos: ArchivosService,
  ) {}

  private async verificarAmbito(
    actor: JwtUser,
    tipoEntidad: TipoEntidad,
    id: number,
  ) {
    switch (tipoEntidad) {
      case 'LOCAL':
        return this.scope.local(actor, id);
      case 'SALON':
        return this.scope.salon(actor, id);
      case 'SUBSALON':
        return this.scope.subsalon(actor, id);
      case 'CONFIGURACION':
        return this.scope.configuracion(actor, id);
      default:
        throw new Error(`Entidad no soportada aquí: ${tipoEntidad}`);
    }
  }

  async subir(
    actor: JwtUser,
    tipoEntidad: TipoEntidad,
    id: number,
    archivo: ArchivoSubido,
  ) {
    await this.verificarAmbito(actor, tipoEntidad, id);
    const resultado = await this.archivos.subirYReemplazar({
      tipoEntidad,
      id,
      tipoArchivo: 'CROQUIS',
      archivo,
    });
    return { tipoEntidad, id, ...resultado };
  }

  async eliminar(actor: JwtUser, tipoEntidad: TipoEntidad, id: number) {
    await this.verificarAmbito(actor, tipoEntidad, id);
    const r = await this.archivos.eliminarImagen(tipoEntidad, id, 'CROQUIS');
    return { tipoEntidad, id, ...r };
  }
}
