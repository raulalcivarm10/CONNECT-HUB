import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ConexionesService } from './conexiones.service';
import { AsistenteJwtGuard } from '../asistente-auth/asistente-auth.guard';
import { Asistente } from '../asistente-auth/asistente.decorator';
import type { AsistenteUser } from '../asistente-auth/asistente-jwt';

class SolicitarDto {
  @IsString()
  idDestinatario!: string;
}

class ResponderDto {
  @Type(() => Number)
  @IsInt()
  idConexion!: number;

  @IsBoolean()
  aceptar!: boolean;
}

@ApiTags('public-conexiones')
@Controller('public/conexiones')
@UseGuards(AsistenteJwtGuard)
@ApiBearerAuth()
export class ConexionesController {
  constructor(private readonly conexiones: ConexionesService) {}

  @Post('solicitar')
  @ApiOperation({ summary: 'Enviar solicitud de conexión (o aceptar la recíproca)' })
  solicitar(@Asistente() u: AsistenteUser, @Body() dto: SolicitarDto) {
    return this.conexiones.solicitar(u.sub, dto.idDestinatario);
  }

  @Post('responder')
  @ApiOperation({ summary: 'Aceptar o rechazar una solicitud recibida' })
  responder(@Asistente() u: AsistenteUser, @Body() dto: ResponderDto) {
    return this.conexiones.responder(u.sub, dto.idConexion, dto.aceptar);
  }

  @Get('solicitudes')
  @ApiOperation({ summary: 'Solicitudes de conexión pendientes que recibí' })
  solicitudes(@Asistente() u: AsistenteUser) {
    return this.conexiones.solicitudesRecibidas(u.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Mis conexiones aceptadas' })
  mias(@Asistente() u: AsistenteUser) {
    return this.conexiones.misConexiones(u.sub);
  }
}
