import { Module } from '@nestjs/common';
import { OperativaModule } from '../operativa/operativa.module';
import { ArchivosModule } from '../archivos/archivos.module';
import { EventosController } from './eventos.controller';
import { EventosService } from './eventos.service';
import { EventosAgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';

@Module({
  imports: [OperativaModule, ArchivosModule],
  // EventosAgendaController va DESPUÉS: comparte el prefijo /eventos y su
  // ruta (/eventos/:id/agenda) no choca con /eventos/agenda del otro.
  controllers: [EventosController, EventosAgendaController],
  providers: [EventosService, AgendaService],
})
export class EventosModule {}
