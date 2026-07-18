import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { PerfilService } from './perfil.service';
import { leerImagenMultipart } from '../../archivos/multipart.util';
import { AsistenteJwtGuard } from '../asistente-auth/asistente-auth.guard';
import { Asistente } from '../asistente-auth/asistente.decorator';
import type { AsistenteUser } from '../asistente-auth/asistente-jwt';

class ActualizarPerfilDto {
  @IsOptional() @IsString() @MaxLength(100) nombre?: string;
  @IsOptional() @IsString() @MaxLength(100) apellido?: string;
  @IsOptional() @IsString() @MaxLength(500) fotoUrl?: string;
  @IsOptional() @IsString() @MaxLength(20) numeroCelular?: string;
  @IsOptional() @IsString() @MaxLength(5) tipoId?: string;
  @IsOptional() @IsString() @MaxLength(30) numeroId?: string;
  // Correo de facturación (datos de facturación del pago; puede diferir del de la cuenta).
  @IsOptional() @IsEmail() @MaxLength(255) emailFactura?: string;
  @IsOptional() @IsString() @MaxLength(150) profesion?: string;
  @IsOptional() @IsString() @MaxLength(150) empresa?: string;
  @IsOptional() @IsString() @MaxLength(500) bio?: string;
  @IsOptional() @IsString() @MaxLength(300) linkedinUrl?: string;
  @IsOptional() @IsIn(['PUBLICO', 'PRIVADO']) visibilidad?: 'PUBLICO' | 'PRIVADO';
}

@ApiTags('public-perfil')
@Controller('public/perfil')
@UseGuards(AsistenteJwtGuard)
@ApiBearerAuth()
export class PerfilController {
  constructor(private readonly perfil: PerfilService) {}

  @Get('me')
  @ApiOperation({ summary: 'Mi perfil editable' })
  miPerfil(@Asistente() u: AsistenteUser) {
    return this.perfil.miPerfil(u.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Actualizar mi perfil' })
  actualizar(@Asistente() u: AsistenteUser, @Body() dto: ActualizarPerfilDto) {
    return this.perfil.actualizar(u.sub, dto);
  }

  @Post('me/foto')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir/actualizar mi foto de perfil (NAS)' })
  async subirFoto(@Asistente() u: AsistenteUser, @Req() req: FastifyRequest) {
    const { archivo } = await leerImagenMultipart(req);
    return this.perfil.subirFoto(u.sub, archivo);
  }

  @Get(':idCliente')
  @ApiOperation({ summary: 'Ver el perfil de otro asistente (respeta privacidad)' })
  verPerfil(@Asistente() u: AsistenteUser, @Param('idCliente') idCliente: string) {
    return this.perfil.perfilPublico(u.sub, idCliente);
  }
}
