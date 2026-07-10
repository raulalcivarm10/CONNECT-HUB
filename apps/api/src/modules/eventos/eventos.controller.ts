import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { leerImagenMultipart } from '../archivos/multipart.util';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtUser, ROL } from '../../auth/types';
import { EventosService } from './eventos.service';
import { CrearCuponDto } from './dto/cupon.dto';
import {
  CreateEventoDto,
  DestacarDto,
  UpdateEventoDto,
} from './dto/evento.dto';

@ApiTags('eventos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROL.SYSTEM, ROL.EVENTOS)
@Controller('eventos')
export class EventosController {
  constructor(private readonly eventos: EventosService) {}

  @Get()
  @ApiOperation({ summary: 'Eventos de la institución (alimenta la app móvil)' })
  list(
    @CurrentUser() user: JwtUser,
    @Query('idInstitucion') idInstitucion?: string,
  ) {
    return this.eventos.list(
      user,
      idInstitucion ? Number(idInstitucion) : undefined,
    );
  }

  @Get('agenda')
  @ApiOperation({
    summary: 'Agenda de una fecha (horarios ocupados) por salón o por local',
  })
  agenda(
    @CurrentUser() user: JwtUser,
    @Query('fecha') fecha: string,
    @Query('idSalon') idSalon?: string,
    @Query('idLocal') idLocal?: string,
  ) {
    return this.eventos.agenda(
      user,
      {
        idSalon: idSalon ? Number(idSalon) : undefined,
        idLocal: idLocal ? Number(idLocal) : undefined,
      },
      fecha,
    );
  }

  @Post()
  @ApiOperation({
    summary:
      'Crear evento reservando salón completo, una configuración (modelo) o un subsalón',
  })
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateEventoDto) {
    return this.eventos.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar evento (revalida disponibilidad)' })
  update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEventoDto,
  ) {
    return this.eventos.update(user, id, dto);
  }

  @Patch(':id/destacar')
  @ApiOperation({ summary: 'Destacar/quitar destacado (aparece en la app móvil)' })
  destacar(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DestacarDto,
  ) {
    return this.eventos.destacar(user, id, dto.destacado, dto.orden);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar evento (bloqueado si tiene inscritos, entradas o pagos)',
  })
  remove(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.eventos.remove(user, id);
  }

  @Post(':id/imagen')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Subir imagen del evento al NAS (campos: file + tipoArchivo? PORTADA|BANNER|GALERIA)',
  })
  async subirImagen(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
  ) {
    const { archivo, campos } = await leerImagenMultipart(req);
    return this.eventos.subirImagen(
      user,
      id,
      archivo,
      campos.tipoArchivo ?? 'PORTADA',
    );
  }

  @Delete(':id/imagen')
  @ApiOperation({ summary: 'Quitar la imagen (portada) del evento' })
  eliminarImagen(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.eventos.eliminarImagen(user, id);
  }

  @Get(':id/cupones')
  @ApiOperation({ summary: 'Cupones de descuento del evento' })
  listarCupones(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.eventos.listarCupones(user, id);
  }

  @Post(':id/cupones')
  @ApiOperation({ summary: 'Crear cupón de descuento (código único por evento)' })
  crearCupon(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CrearCuponDto,
  ) {
    return this.eventos.crearCupon(user, id, dto);
  }

  @Delete(':id/cupones/:idCupon')
  @ApiOperation({ summary: 'Eliminar cupón de descuento' })
  eliminarCupon(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('idCupon', ParseIntPipe) idCupon: number,
  ) {
    return this.eventos.eliminarCupon(user, id, idCupon);
  }
}
