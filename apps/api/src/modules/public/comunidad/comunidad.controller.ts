import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsInt, IsString, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ComunidadService } from './comunidad.service';
import { AsistenteJwtGuard } from '../asistente-auth/asistente-auth.guard';
import { Asistente } from '../asistente-auth/asistente.decorator';
import type { AsistenteUser } from '../asistente-auth/asistente-jwt';

class PublicarDto {
  @Type(() => Number)
  @IsInt()
  idEvento!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  mensaje!: string;
}

class EventoDto {
  @Type(() => Number)
  @IsInt()
  idEvento!: number;
}

@ApiTags('public-comunidad')
@Controller('public/comunidad')
@UseGuards(AsistenteJwtGuard)
@ApiBearerAuth()
export class ComunidadController {
  constructor(private readonly comunidad: ComunidadService) {}

  @Get('mis-comunidades')
  @ApiOperation({ summary: 'Mis comunidades = eventos con entrada (hub de chats)' })
  misComunidades(@Asistente() user: AsistenteUser) {
    return this.comunidad.misComunidades(user.sub);
  }

  @Get('miembros')
  @ApiOperation({ summary: 'Participantes de la comunidad (solo perfiles públicos)' })
  miembros(@Asistente() user: AsistenteUser, @Query('idEvento') idEvento: string) {
    return this.comunidad.listarMiembros(user.sub, Number(idEvento));
  }

  @Get()
  @ApiOperation({ summary: 'Muro de la comunidad de un evento' })
  listar(
    @Asistente() user: AsistenteUser,
    @Query('idEvento') idEvento: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.comunidad.listar(
      user.sub,
      Number(idEvento),
      page ? Number(page) : undefined,
      size ? Number(size) : undefined,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Publica un mensaje en la comunidad del evento' })
  publicar(@Asistente() user: AsistenteUser, @Body() dto: PublicarDto) {
    return this.comunidad.publicar(user.sub, dto.idEvento, dto.mensaje);
  }

  @Post('salir')
  @ApiOperation({ summary: 'Salir de la comunidad de un evento' })
  salir(@Asistente() user: AsistenteUser, @Body() dto: EventoDto) {
    return this.comunidad.salir(user.sub, dto.idEvento);
  }

  @Post('ingresar')
  @ApiOperation({ summary: 'Volver a ingresar a la comunidad de un evento' })
  ingresar(@Asistente() user: AsistenteUser, @Body() dto: EventoDto) {
    return this.comunidad.ingresar(user.sub, dto.idEvento);
  }
}
