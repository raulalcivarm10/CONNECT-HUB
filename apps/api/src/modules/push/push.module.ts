import { Global, Module } from '@nestjs/common';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { AsistenteJwtGuard } from '../public/asistente-auth/asistente-auth.guard';

/**
 * Push global: PushService inyectable en cualquier módulo (p.ej. el módulo de
 * eventos del panel lo usa para avisar al crear un evento). El controller
 * expone /public/push/registrar para que la app registre su token.
 */
@Global()
@Module({
  controllers: [PushController],
  providers: [PushService, AsistenteJwtGuard],
  exports: [PushService],
})
export class PushModule {}
