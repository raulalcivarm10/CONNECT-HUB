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
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';
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
import {
  EventoDetalleDto,
  CreateExpositorDto,
  UpdateExpositorDto,
} from './dto/detalle.dto';

class GenerarCertDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  idsClientes?: string[];
}

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

  @Get(':id/dias')
  @ApiOperation({ summary: 'Days and time ranges of the event (EVENTO_HORAS)' })
  listarDias(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.eventos.listarDias(user, id);
  }

  @Get(':id/detalle')
  @ApiOperation({ summary: 'Event detail (returns {} if not created yet)' })
  getDetalle(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.eventos.getDetalle(user, id);
  }

  @Put(':id/detalle')
  @ApiOperation({ summary: 'Create or update the event detail (upsert 1:1)' })
  upsertDetalle(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EventoDetalleDto,
  ) {
    return this.eventos.upsertDetalle(user, id, dto);
  }

  @Get(':id/expositores')
  @ApiOperation({ summary: 'Speakers of the event (ordered)' })
  listarExpositores(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.eventos.listarExpositores(user, id);
  }

  @Post(':id/expositores')
  @ApiOperation({ summary: 'Add a speaker to the event' })
  crearExpositor(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateExpositorDto,
  ) {
    return this.eventos.crearExpositor(user, id, dto);
  }

  @Patch(':id/expositores/:idExp')
  @ApiOperation({ summary: 'Edit a speaker of the event' })
  actualizarExpositor(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('idExp', ParseIntPipe) idExp: number,
    @Body() dto: UpdateExpositorDto,
  ) {
    return this.eventos.actualizarExpositor(user, id, idExp, dto);
  }

  @Delete(':id/expositores/:idExp')
  @ApiOperation({ summary: 'Delete a speaker of the event' })
  eliminarExpositor(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('idExp', ParseIntPipe) idExp: number,
  ) {
    return this.eventos.eliminarExpositor(user, id, idExp);
  }

  @Post(':id/expositores/:idExp/imagen')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: "Upload a speaker's photo to the NAS (field: file; tipoArchivo FOTO)",
  })
  async subirImagenExpositor(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('idExp', ParseIntPipe) idExp: number,
    @Req() req: FastifyRequest,
  ) {
    const { archivo, campos } = await leerImagenMultipart(req);
    return this.eventos.subirImagenExpositor(
      user,
      id,
      idExp,
      archivo,
      campos.tipoArchivo ?? 'PORTADA',
    );
  }

  @Delete(':id/expositores/:idExp/imagen')
  @ApiOperation({ summary: "Remove the speaker's photo" })
  eliminarImagenExpositor(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('idExp', ParseIntPipe) idExp: number,
  ) {
    return this.eventos.eliminarImagenExpositor(user, id, idExp);
  }

  // ---- Certificados: plantilla + generación en lote (admin) --------------

  @Post(':id/certificados/plantilla')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Sube la plantilla-imagen del certificado + config del overlay (campo file; campo config JSON)' })
  async subirPlantillaCert(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
  ) {
    const { archivo, campos } = await leerImagenMultipart(req);
    return this.eventos.guardarPlantillaCert(user, id, archivo, campos.config);
  }

  @Get(':id/certificados/plantilla')
  @ApiOperation({ summary: 'Config + dimensiones de la plantilla del certificado' })
  getPlantillaCert(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.eventos.getPlantillaCert(user, id);
  }

  @Get(':id/certificados/plantilla/imagen')
  @ApiOperation({ summary: 'Imagen cruda de la plantilla (para el editor)' })
  async plantillaCertImagen(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Res() reply: FastifyReply,
  ) {
    const { buffer, mime } = await this.eventos.plantillaCertImagen(user, id);
    void reply.header('Content-Type', mime).header('Cache-Control', 'no-store').send(buffer);
  }

  @Get(':id/certificados/asistentes')
  @ApiOperation({ summary: 'Asistentes del evento (para seleccionar y generar certificados)' })
  listarAsistentesCert(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.eventos.listarAsistentesCert(user, id);
  }

  @Get(':id/gafetes')
  @ApiOperation({ summary: 'Gafetes imprimibles: participantes con entrada + QR de check-in' })
  listarGafetes(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.eventos.listarGafetes(user, id);
  }

  @Post(':id/certificados/generar')
  @ApiOperation({ summary: 'Genera certificados en lote (idsClientes seleccionados o todos los que asistieron)' })
  generarCert(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GenerarCertDto,
  ) {
    return this.eventos.generarCertificadosLote(user, id, dto.idsClientes);
  }
}
