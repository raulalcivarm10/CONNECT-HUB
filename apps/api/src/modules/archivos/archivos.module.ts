import { Module } from '@nestjs/common';
import { NasService } from './nas.service';
import { ArchivosService } from './archivos.service';
import { ArchivosProxyController } from './archivos-proxy.controller';

@Module({
  controllers: [ArchivosProxyController],
  providers: [NasService, ArchivosService],
  exports: [NasService, ArchivosService],
})
export class ArchivosModule {}
