import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { RedisService } from '../../redis/redis.service';
import { NasService, TipoEntidad } from './nas.service';

const ENTIDADES: TipoEntidad[] = [
  'EVENTO',
  'INSTITUCION',
  'LOCAL',
  'SALON',
  'SUBSALON',
  'EXPOSITOR',
  'USUARIO',
];
const TIPOS_ARCHIVO = ['PORTADA', 'BANNER', 'GALERIA', 'LOGO', 'CROQUIS', 'FOTO', 'PERFIL'];
const CACHE_TTL = 600; // 10 min
const NAS_TIMEOUT_MS = 10_000;

/**
 * PROXY CON CACHÉ de las imágenes del NAS externo. El navegador/app cargan
 * desde NUESTRO API (Redis, respuesta en ms) en vez de golpear el NAS en cada
 * imagen: si el NAS anda lento o se cae, lo cacheado sigue sirviéndose.
 * Público (sin guard): las URLs del NAS ya son públicas hoy — no cambia la
 * exposición, solo la velocidad y la fiabilidad.
 */
@ApiTags('archivos')
@Controller('archivos')
export class ArchivosProxyController {
  constructor(
    private readonly nas: NasService,
    private readonly redis: RedisService,
  ) {}

  @Get('proxy')
  @ApiOperation({ summary: 'Imagen activa del NAS vía caché Redis (rápida y resiliente)' })
  async proxy(
    @Res() res: FastifyReply,
    @Query('tipoEntidad') tipoEntidad?: string,
    @Query('id') id?: string,
    @Query('tipoArchivo') tipoArchivo?: string,
    @Query('v') v?: string,
  ) {
    if (!tipoEntidad || !ENTIDADES.includes(tipoEntidad as TipoEntidad)) {
      throw new BadRequestException('Invalid tipoEntidad');
    }
    if (!tipoArchivo || !TIPOS_ARCHIVO.includes(tipoArchivo)) {
      throw new BadRequestException('Invalid tipoArchivo');
    }
    if (!id || !/^[\w-]{1,64}$/.test(id)) {
      throw new BadRequestException('Invalid id');
    }

    // La versión (v = timestamp de la última carga) forma parte de la clave:
    // subir una imagen nueva cambia la URL → clave nueva → sin caché rancio.
    const key = `nasimg:${tipoEntidad}:${id}:${tipoArchivo}:${v ?? '0'}`;
    const [cached, mimeCached] = await Promise.all([
      this.redis.client.getBuffer(key),
      this.redis.client.get(`${key}:mime`),
    ]);
    if (cached) {
      return res
        .header('Content-Type', mimeCached ?? 'image/jpeg')
        .header('Cache-Control', 'public, max-age=300')
        .send(cached);
    }

    const url = this.nas.urlActivo(tipoEntidad as TipoEntidad, id, tipoArchivo);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), NAS_TIMEOUT_MS);
    let upstream: Response;
    try {
      upstream = await fetch(v ? `${url}&v=${encodeURIComponent(v)}` : url, {
        signal: ctrl.signal,
      });
    } catch {
      throw new BadGatewayException('The file server is unavailable');
    } finally {
      clearTimeout(timer);
    }
    if (upstream.status === 404) throw new NotFoundException('Image not found');
    if (!upstream.ok) {
      throw new BadGatewayException(`The file server answered ${upstream.status}`);
    }
    const mime = upstream.headers.get('content-type') ?? 'image/jpeg';
    const buffer = Buffer.from(await upstream.arrayBuffer());

    await Promise.all([
      this.redis.client.set(key, buffer, 'EX', CACHE_TTL),
      this.redis.client.set(`${key}:mime`, mime, 'EX', CACHE_TTL),
    ]);
    return res
      .header('Content-Type', mime)
      .header('Cache-Control', 'public, max-age=300')
      .send(buffer);
  }
}
