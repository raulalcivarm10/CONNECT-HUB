import { Module } from '@nestjs/common';
import { NasService } from './nas.service';
import { ArchivosService } from './archivos.service';

@Module({
  providers: [NasService, ArchivosService],
  exports: [NasService, ArchivosService],
})
export class ArchivosModule {}
