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
import sharp from 'sharp';
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
/**
 * Anchos permitidos para `?w=`. Lista CERRADA a propósito: si se aceptara
 * cualquier numero, cada valor generaria su propia entrada en Redis y bastaria
 * pedir w=1..2000 para llenar la cache. Cubren los usos reales de la app:
 * avatar/miniatura de fila, tarjeta de lista y portada a ancho completo (x2
 * para pantallas de alta densidad).
 */
const ANCHOS = [96, 200, 400, 800, 1200];

const CACHE_TTL = 600; // 10 min

// Las tablas montan una imagen por fila, así que el caché del navegador es lo
// que evita re-descargarlas al navegar. Se mantiene el máximo corto A PROPÓSITO:
// el `?v=` de la URL lo pone el panel en memoria y se reinicia al recargar, así
// que un máximo largo dejaría al admin viendo su portada anterior mucho rato.
// `stale-while-revalidate` da lo mejor de ambos: pinta al instante desde caché
// y revalida por detrás, de modo que la imagen nueva entra en la carga siguiente.
const CACHE_HEADER = 'private, max-age=300, stale-while-revalidate=3600';
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
    @Query('w') w?: string,
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

    // Ancho pedido: solo de la lista cerrada; cualquier otro valor se ignora y
    // se sirve el original (no se falla, para no romper URLs ya existentes).
    const ancho = w && ANCHOS.includes(Number(w)) ? Number(w) : null;

    // La versión (v = timestamp de la última carga) forma parte de la clave:
    // subir una imagen nueva cambia la URL → clave nueva → sin caché rancio.
    // El ancho TAMBIÉN va en la clave: cada tamaño se cachea por separado, si
    // no la miniatura y la portada grande se pisarían entre sí.
    const key =
      `nasimg:${tipoEntidad}:${id}:${tipoArchivo}:${v ?? '0'}` +
      (ancho ? `:w${ancho}` : '');
    const [cached, mimeCached] = await Promise.all([
      this.redis.client.getBuffer(key),
      this.redis.client.get(`${key}:mime`),
    ]);
    if (cached) {
      return res
        .header('Content-Type', mimeCached ?? 'image/jpeg')
        .header('Cache-Control', CACHE_HEADER)
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
    let mime = upstream.headers.get('content-type') ?? 'image/jpeg';
    let buffer = Buffer.from(await upstream.arrayBuffer());

    // Redimensionado. Sin esto, una miniatura de fila descargaba y decodificaba
    // la foto a resolución completa tal como la subió el admin: era el mayor
    // coste real en datos móviles y en tiempo de pintado de la app.
    // `withoutEnlargement` evita estirar una imagen ya pequeña, y se convierte a
    // WebP por peso. Si sharp falla (formato raro), se sirve el original: una
    // imagen sin optimizar es mucho mejor que un error.
    if (ancho) {
      try {
        buffer = await sharp(buffer)
          .rotate() // respeta la orientación EXIF de fotos de móvil
          .resize({ width: ancho, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        mime = 'image/webp';
      } catch {
        // se queda el original
      }
    }

    await Promise.all([
      this.redis.client.set(key, buffer, 'EX', CACHE_TTL),
      this.redis.client.set(`${key}:mime`, mime, 'EX', CACHE_TTL),
    ]);
    return res
      .header('Content-Type', mime)
      .header('Cache-Control', CACHE_HEADER)
      .send(buffer);
  }
}
