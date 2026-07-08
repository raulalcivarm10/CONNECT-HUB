import { Module } from '@nestjs/common';
import { ArchivosModule } from '../archivos/archivos.module';
import { OperativaController } from './operativa.controller';
import { ScopeService } from './scope.service';
import { LocalesService } from './locales.service';
import { SalonesService } from './salones.service';
import { ConfiguracionesService } from './configuraciones.service';
import { EspaciosImagenesService } from './espacios-imagenes.service';

// NOTA: mapas.controller/service quedan sin registrar a propósito.
// Las imágenes/archivos se guardarán en un NAS externo mediante endpoints
// que proveerá el usuario; esa integración reemplazará la lógica BLOB local.
@Module({
  imports: [ArchivosModule],
  controllers: [OperativaController],
  providers: [
    ScopeService,
    LocalesService,
    SalonesService,
    ConfiguracionesService,
    EspaciosImagenesService,
  ],
  exports: [ScopeService],
})
export class OperativaModule {}
