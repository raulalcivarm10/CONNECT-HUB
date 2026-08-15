import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { OracleModule } from './database/oracle.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { InstitucionesModule } from './modules/instituciones/instituciones.module';
import { RolesModule } from './modules/roles/roles.module';
import { OperativaModule } from './modules/operativa/operativa.module';
import { FinanzasModule } from './modules/finanzas/finanzas.module';
import { EventosModule } from './modules/eventos/eventos.module';
import { ReportesModule } from './modules/reportes/reportes.module';
import { FslWebhooksModule } from './modules/fsl-webhooks/fsl-webhooks.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { PublicModule } from './modules/public/public.module';
import { PushModule } from './modules/push/push.module';
import { IntegracionModule } from './modules/integracion/integracion.module';
import { SuscripcionesModule } from './modules/suscripciones/suscripciones.module';

@Module({
  imports: [
    // las variables llegan por environment del contenedor (env_file en compose)
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    // tareas programadas (hoy: el corte nocturno de suscripciones, 04:00 UTC =
    // 23:00 en Ecuador). Se registra una sola vez, aquí.
    ScheduleModule.forRoot(),
    OracleModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsuariosModule,
    InstitucionesModule,
    RolesModule,
    OperativaModule,
    FinanzasModule,
    EventosModule,
    ReportesModule,
    FslWebhooksModule,
    AuditoriaModule,
    FeedbackModule,
    PublicModule,
    PushModule,
    IntegracionModule,
    SuscripcionesModule,
  ],
})
export class AppModule {}
