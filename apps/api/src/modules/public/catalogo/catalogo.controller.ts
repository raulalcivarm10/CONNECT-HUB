import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import type { FastifyReply } from 'fastify';
import { CatalogoService } from './catalogo.service';
import { AsistenteJwtGuard } from '../asistente-auth/asistente-auth.guard';
import { Asistente } from '../asistente-auth/asistente.decorator';
import type { AsistenteUser } from '../asistente-auth/asistente-jwt';

class VincularDto {
  @IsString()
  @MaxLength(60)
  codigo!: string;
}

/**
 * Catálogo PÚBLICO para la app móvil de asistentes. Sin autenticación:
 * el asistente entra con el CODIGO_CONEXION de su institución (estilo Whova).
 * Caddy publica estas rutas como /api/public/*.
 */
@ApiTags('public-catalogo')
@Controller('public')
export class CatalogoController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get('instituciones/resolver')
  @ApiOperation({ summary: 'Resuelve un CODIGO_CONEXION a su institución' })
  resolver(@Query('codigo') codigo: string) {
    return this.catalogo.resolverInstitucion((codigo ?? '').trim());
  }

  @Get('instituciones/:id/logo')
  @ApiOperation({ summary: 'Logo (imagen) de la institución' })
  async logo(
    @Param('id', ParseIntPipe) id: number,
    @Res() reply: FastifyReply,
  ) {
    const { buffer, mime } = await this.catalogo.logoInstitucion(id);
    reply
      .header('Content-Type', mime)
      .header('Cache-Control', 'public, max-age=86400')
      .send(buffer);
  }

  @Get('eventos')
  @ApiOperation({ summary: 'Eventos públicos de una institución (paginado)' })
  eventos(
    @Query('codigo') codigo: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.catalogo.listarEventos({
      codigo: (codigo ?? '').trim(),
      q,
      page: page ? Number(page) : undefined,
      size: size ? Number(size) : undefined,
    });
  }

  @Get('eventos/destacados')
  @ApiOperation({ summary: 'Eventos destacados (hero) de una institución' })
  destacados(@Query('codigo') codigo: string) {
    return this.catalogo.listarEventos({
      codigo: (codigo ?? '').trim(),
      destacados: true,
      size: 10,
    });
  }

  @Get('mis-eventos')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Feed agregado: eventos de TODAS mis instituciones' })
  misEventos(
    @Asistente() user: AsistenteUser,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.catalogo.misEventos({
      idCliente: user.sub,
      q,
      page: page ? Number(page) : undefined,
      size: size ? Number(size) : undefined,
    });
  }

  @Get('eventos/:id')
  @ApiOperation({ summary: 'Detalle compuesto de un evento público' })
  evento(@Param('id', ParseIntPipe) id: number) {
    return this.catalogo.getEvento(id);
  }

  @Post('instituciones/vincular')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vincula al asistente con una institución (por código)' })
  vincular(@Asistente() user: AsistenteUser, @Body() dto: VincularDto) {
    return this.catalogo.vincularInstitucion(user.sub, dto.codigo);
  }

  @Get('instituciones/mias')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Instituciones a las que el asistente pertenece' })
  mias(@Asistente() user: AsistenteUser) {
    return this.catalogo.misInstituciones(user.sub);
  }
}
