import { Module } from '@nestjs/common';
import { OperativaModule } from '../operativa/operativa.module';
import { ArchivosModule } from '../archivos/archivos.module';
import { EventosController } from './eventos.controller';
import { EventosService } from './eventos.service';
import { EventosAgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';
import { EventosCron } from './eventos.cron';

@Module({
  imports: [OperativaModule, ArchivosModule],
  // EventosAgendaController va DESPUÉS: comparte el prefijo /eventos y su
  // ruta (/eventos/:id/agenda) no choca con /eventos/agenda del otro.
  controllers: [EventosController, EventosAgendaController],
  // EventosCron solo necesita OracleService y AuditoriaService (ambos @Global);
  // ScheduleModule.forRoot() ya está registrado una sola vez en AppModule.
  providers: [EventosService, AgendaService, EventosCron],
})
export class EventosModule {}
