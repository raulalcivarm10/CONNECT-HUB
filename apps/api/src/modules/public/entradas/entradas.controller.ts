import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import type { FastifyReply } from 'fastify';
import { EntradasService } from './entradas.service';
import { AsistenteJwtGuard } from '../asistente-auth/asistente-auth.guard';
import { Asistente } from '../asistente-auth/asistente.decorator';
import type { AsistenteUser } from '../asistente-auth/asistente-jwt';

class ValidarDto {
  @IsString()
  @MaxLength(100)
  qrToken!: string;
}

@ApiTags('public-entradas')
@Controller('public')
export class EntradasController {
  constructor(private readonly entradas: EntradasService) {}

  @Post('eventos/:id/inscripcion')
  @HttpCode(200)
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inscribirse a un evento (gratis directo; workshop→padre)' })
  inscribir(@Asistente() user: AsistenteUser, @Param('id', ParseIntPipe) id: number) {
    return this.entradas.inscribir(user.sub, id);
  }

  @Get('mis-entradas')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eventos adquiridos (entradas) del asistente' })
  misEntradas(@Asistente() user: AsistenteUser) {
    return this.entradas.misEntradas(user.sub);
  }

  @Get('entradas/:id/qr')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Payload del QR de una entrada' })
  qr(@Asistente() user: AsistenteUser, @Param('id', ParseIntPipe) id: number) {
    return this.entradas.getQr(user.sub, id);
  }

  @Post('entradas/validar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Check-in por QR (escáner del staff): marca asistencia + emite certificado' })
  validar(@Body() dto: ValidarDto) {
    return this.entradas.validar(dto.qrToken);
  }

  @Get('certificados')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Certificados del asistente' })
  misCertificados(@Asistente() user: AsistenteUser) {
    return this.entradas.misCertificados(user.sub);
  }

  @Get('certificados/:codigo')
  @ApiOperation({ summary: 'Verificar un certificado por su código (público)' })
  certificado(@Param('codigo') codigo: string) {
    return this.entradas.getCertificado(codigo);
  }

  @Get('certificados/:codigo/imagen')
  @ApiOperation({ summary: 'Imagen PNG del certificado (plantilla + overlay), pública' })
  async imagenCertificado(@Param('codigo') codigo: string, @Res() reply: FastifyReply) {
    const png = await this.entradas.renderCertificadoImagen(codigo);
    void reply
      .header('Content-Type', 'image/png')
      .header('Cache-Control', 'public, max-age=300')
      .send(png);
  }
}
