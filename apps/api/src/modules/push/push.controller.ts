import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PushService } from './push.service';
import { AsistenteJwtGuard } from '../public/asistente-auth/asistente-auth.guard';
import { Asistente } from '../public/asistente-auth/asistente.decorator';
import type { AsistenteUser } from '../public/asistente-auth/asistente-jwt';

class RegistrarPushDto {
  @IsString()
  @MaxLength(255)
  expoToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  platform?: string;
}

@ApiTags('public-push')
@Controller('public/push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Post('registrar')
  @HttpCode(200)
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Registra el Expo push token del dispositivo' })
  registrar(@Asistente() user: AsistenteUser, @Body() dto: RegistrarPushDto) {
    return this.push.registrarToken(user.sub, dto.expoToken, dto.platform);
  }
}
