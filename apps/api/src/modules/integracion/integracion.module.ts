import { Module } from '@nestjs/common';
import { PublicModule } from '../public/public.module';
import { ApiKeyGuard } from './api-key.guard';
import { IntegracionService } from './integracion.service';
import {
  ApiKeysController,
  IntegracionController,
} from './integracion.controller';

/**
 * Integración con sistemas externos del cliente (hoy: lectores de QR).
 * Reutiliza el check-in oficial de EntradasService; autentica por API key.
 */
@Module({
  imports: [PublicModule],
  controllers: [IntegracionController, ApiKeysController],
  providers: [IntegracionService, ApiKeyGuard],
})
export class IntegracionModule {}
