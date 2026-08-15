import { Controller, Get, Param, ParseIntPipe, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { EspaciosImagenesService } from './espacios-imagenes.service';

/**
 * Lectura PÚBLICA de la imagen de una configuración (sin guard: se consume
 * desde <img> del panel y de la app, igual que las URLs públicas del NAS; los
 * croquis no contienen datos sensibles). La subida/borrado sí exigen sesión
 * (operativa.controller).
 */
@ApiTags('operativa')
@Controller('configuraciones')
export class ConfiguracionImagenController {
  constructor(private readonly espacios: EspaciosImagenesService) {}

  @Get(':id/imagen')
  @ApiOperation({ summary: 'Imagen de la configuración (caché Redis + ETag/304)' })
  async imagen(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const { buffer, mime, etag, filename } =
      await this.espacios.imagenConfiguracion(id);
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).send();
    }
    return res
      .header('Content-Type', mime)
      .header('ETag', etag)
      // `stale-while-revalidate`: pinta al instante desde caché y revalida por
      // detrás contra el ETag, sin bloquear el render en un 304.
      .header('Cache-Control', 'private, max-age=300, stale-while-revalidate=3600')
      .header('Content-Disposition', `inline; filename="${filename}"`)
      .send(buffer);
  }
}
