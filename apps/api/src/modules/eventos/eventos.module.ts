import { Module } from '@nestjs/common';
import { OperativaModule } from '../operativa/operativa.module';
import { ArchivosModule } from '../archivos/archivos.module';
import { EventosController } from './eventos.controller';
import { EventosService } from './eventos.service';

@Module({
  imports: [OperativaModule, ArchivosModule],
  controllers: [EventosController],
  providers: [EventosService],
})
export class EventosModule {}
