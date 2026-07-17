import { Module } from '@nestjs/common';
import { CatalogoController } from './catalogo/catalogo.controller';
import { CatalogoService } from './catalogo/catalogo.service';
import { AsistenteAuthController } from './asistente-auth/asistente-auth.controller';
import { AsistenteAuthService } from './asistente-auth/asistente-auth.service';
import { AsistenteMailerService } from './asistente-auth/asistente-mailer.service';
import { AsistenteJwtGuard } from './asistente-auth/asistente-auth.guard';
import { EntradasController } from './entradas/entradas.controller';
import { EntradasService } from './entradas/entradas.service';
import { ComunidadController } from './comunidad/comunidad.controller';
import { ComunidadService } from './comunidad/comunidad.service';
import { PagosController } from './pagos/pagos.controller';
import { PagosService } from './pagos/pagos.service';
import { PerfilController } from './perfil/perfil.controller';
import { PerfilService } from './perfil/perfil.service';
import { ConexionesController } from './conexiones/conexiones.controller';
import { ConexionesService } from './conexiones/conexiones.service';
import { ChatsController } from './chats/chats.controller';
import { ChatsService } from './chats/chats.service';
import { NasService } from '../archivos/nas.service';
import { RateLimitGuard } from '../../auth/rate-limit.guard';

/**
 * Módulo PÚBLICO (app móvil de asistentes). Todo bajo /public/*.
 * OracleService, JwtService, ConfigService y RedisService son @Global, así que
 * no hace falta importar sus módulos. El auth de asistente está aislado del
 * admin (secretos y clases propios); solo reutiliza utilidades puras y el
 * RateLimitGuard (que resuelve RedisService global).
 */
@Module({
  controllers: [
    CatalogoController,
    AsistenteAuthController,
    EntradasController,
    ComunidadController,
    PagosController,
    PerfilController,
    ConexionesController,
    ChatsController,
  ],
  providers: [
    CatalogoService,
    AsistenteAuthService,
    AsistenteMailerService,
    AsistenteJwtGuard,
    EntradasService,
    ComunidadService,
    PagosService,
    PerfilService,
    ConexionesService,
    ChatsService,
    NasService,
    RateLimitGuard,
  ],
})
export class PublicModule {}
