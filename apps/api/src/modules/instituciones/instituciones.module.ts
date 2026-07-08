import { Module } from '@nestjs/common';
import { ArchivosModule } from '../archivos/archivos.module';
import { InstitucionesController } from './instituciones.controller';
import { InstitucionesService } from './instituciones.service';

@Module({
  imports: [ArchivosModule],
  controllers: [InstitucionesController],
  providers: [InstitucionesService],
})
export class InstitucionesModule {}
