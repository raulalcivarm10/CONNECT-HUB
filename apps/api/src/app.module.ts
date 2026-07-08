import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    // las variables llegan por environment del contenedor (env_file en compose)
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
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
  ],
})
export class AppModule {}
