import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ChatsService } from './chats.service';
import { AsistenteJwtGuard } from '../asistente-auth/asistente-auth.guard';
import { Asistente } from '../asistente-auth/asistente.decorator';
import type { AsistenteUser } from '../asistente-auth/asistente-jwt';

class AbrirDto {
  @IsString()
  idCliente!: string;
}

class MensajeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  mensaje!: string;
}

@ApiTags('public-chats')
@Controller('public/chats')
@UseGuards(AsistenteJwtGuard)
@ApiBearerAuth()
export class ChatsController {
  constructor(private readonly chats: ChatsService) {}

  @Get()
  @ApiOperation({ summary: 'Mis chats privados' })
  mios(@Asistente() u: AsistenteUser) {
    return this.chats.misChats(u.sub);
  }

  @Post('abrir')
  @ApiOperation({ summary: 'Abrir (o reutilizar) chat con otro asistente' })
  abrir(@Asistente() u: AsistenteUser, @Body() dto: AbrirDto) {
    return this.chats.abrir(u.sub, dto.idCliente);
  }

  @Get(':idChat/mensajes')
  @ApiOperation({ summary: 'Mensajes de un chat privado' })
  mensajes(
    @Asistente() u: AsistenteUser,
    @Param('idChat', ParseIntPipe) idChat: number,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.chats.mensajes(u.sub, idChat, page ? Number(page) : undefined, size ? Number(size) : undefined);
  }

  @Post(':idChat/mensajes')
  @ApiOperation({ summary: 'Enviar mensaje privado' })
  enviar(@Asistente() u: AsistenteUser, @Param('idChat', ParseIntPipe) idChat: number, @Body() dto: MensajeDto) {
    return this.chats.enviar(u.sub, idChat, dto.mensaje);
  }
}
