import { Module } from '@nestjs/common';
import {
  LicenciasController,
  LicenciasInstitucionController,
} from './licencias.controller';
import { LicenciasService } from './licencias.service';
import { SuscripcionesController } from './suscripciones.controller';
import { SuscripcionesCron } from './suscripciones.cron';
import { SuscripcionesService } from './suscripciones.service';

/**
 * Suscripciones, planes y licencias on-premise.
 *
 * No importa nada: OracleService (OracleModule), MailerService/JwtAuthGuard
 * (AuthModule) y AuditoriaService (AuditoriaModule) son @Global. El cron
 * necesita ScheduleModule.forRoot(), que se registra una sola vez en AppModule.
 */
@Module({
  controllers: [
    SuscripcionesController,
    LicenciasInstitucionController,
    LicenciasController,
  ],
  providers: [SuscripcionesService, LicenciasService, SuscripcionesCron],
  exports: [SuscripcionesService],
})
export class SuscripcionesModule {}
