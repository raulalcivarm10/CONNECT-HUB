import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtUser, ROL } from '../../auth/types';
import { AgendaService } from './agenda.service';
// Los DTO viven en su propio archivo (dto/agenda.dto.ts): declarar una clase
// DTO DESPUÉS de la clase del controlador compila pero revienta al arrancar
// con "Cannot access X before initialization".
import { GuardarAgendaDto } from './dto/agenda.dto';

/**
 * Agenda detallada del evento (EVENTO_AGENDA) para el PANEL.
 *
 * Va aparte de EventosController para no seguir engordándolo, pero comparte el
 * prefijo /eventos, los guards, los roles y el ámbito por institución. El
 * parámetro se llama `:id` igual que en EventosController a propósito: el
 * router de Fastify se queja si dos rutas hermanas usan nombres de parámetro
 * distintos en la misma posición.
 *
 * OJO: /eventos/agenda (agenda de ocupación por fecha, en EventosController) es
 * OTRA cosa y no choca con /eventos/:id/agenda.
 */
@ApiTags('eventos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROL.SYSTEM, ROL.ADMINISTRATION, ROL.EVENT, ROL.OPERATIONS_MANAGEMENT)
@Controller('eventos')
export class EventosAgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get(':id/agenda')
  @ApiOperation({
    summary:
      'Agenda detallada del evento: filas PLANAS (una por línea del Excel) para editar',
  })
  listar(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.agenda.listar(user, id);
  }

  @Put(':id/agenda')
  @ApiOperation({
    summary:
      'Reemplaza la agenda COMPLETA del evento (borra e inserta en una transacción)',
  })
  reemplazar(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GuardarAgendaDto,
  ) {
    return this.agenda.reemplazar(user, id, dto.items);
  }

  @Delete(':id/agenda')
  @ApiOperation({ summary: 'Vacía la agenda detallada del evento' })
  vaciar(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.agenda.vaciar(user, id);
  }
}
