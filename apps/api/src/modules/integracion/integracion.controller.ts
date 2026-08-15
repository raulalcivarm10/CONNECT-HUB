import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtUser, ROL } from '../../auth/types';
import { ApiKeyGuard, ReqConApiKey } from './api-key.guard';
import { IntegracionService } from './integracion.service';

class CheckinDto {
  @IsString()
  @MaxLength(200)
  qrToken!: string;

  /** opcional: puerta de un evento concreto (rechaza entradas de otro) */
  @IsOptional()
  @IsInt()
  idEvento?: number;
}

class CrearKeyDto {
  @IsString()
  @MaxLength(150)
  nombre!: string;

  @IsOptional()
  @IsInt()
  idInstitucion?: number;
}

/**
 * API de integración para lectores de QR externos (app de la institución).
 * Autenticación por API key en el header `X-API-Key` — cada llave pertenece a
 * una institución y solo puede registrar accesos a SUS eventos.
 */
@ApiTags('integracion')
@Controller('integracion')
export class IntegracionController {
  constructor(private readonly integracion: IntegracionService) {}

  @Post('checkin')
  @HttpCode(200)
  @UseGuards(ApiKeyGuard)
  @ApiHeader({ name: 'X-API-Key', required: true })
  @ApiOperation({
    summary:
      'Confirma el acceso del participante al evento (marca ingreso y emite certificado)',
  })
  checkin(@Req() req: ReqConApiKey, @Body() dto: CheckinDto) {
    return this.integracion.checkin(req.apiKey!, dto.qrToken, dto.idEvento);
  }

  @Post('verificar')
  @HttpCode(200)
  @UseGuards(ApiKeyGuard)
  @ApiHeader({ name: 'X-API-Key', required: true })
  @ApiOperation({ summary: 'Consulta la entrada SIN marcar el ingreso' })
  verificar(@Req() req: ReqConApiKey, @Body() dto: CheckinDto) {
    return this.integracion.verificar(req.apiKey!, dto.qrToken);
  }
}

/** Administración de las llaves desde el panel (SYSTEM / ADMINISTRATION). */
@ApiTags('integracion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROL.SYSTEM, ROL.ADMINISTRATION)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly integracion: IntegracionService) {}

  @Get('institucion')
  @ApiOperation({
    summary: 'Llave de check-in propia de la institución (existe para todas)',
  })
  llaveInstitucion(
    @CurrentUser() user: JwtUser,
    @Query('idInstitucion') idInstitucion?: string,
  ) {
    return this.integracion.llaveInstitucion(
      user,
      idInstitucion ? Number(idInstitucion) : undefined,
    );
  }

  @Post('institucion/regenerar')
  @ApiOperation({
    summary: 'Regenera la llave propia (la anterior deja de funcionar)',
  })
  regenerar(
    @CurrentUser() user: JwtUser,
    @Body() dto: { idInstitucion?: number },
  ) {
    return this.integracion.regenerarLlaveInstitucion(user, dto?.idInstitucion);
  }

  @Get()
  @ApiOperation({ summary: 'Llaves de integración adicionales de la institución' })
  listar(
    @CurrentUser() user: JwtUser,
    @Query('idInstitucion') idInstitucion?: string,
  ) {
    return this.integracion.listarKeys(
      user,
      idInstitucion ? Number(idInstitucion) : undefined,
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Genera una llave nueva (el valor se muestra UNA sola vez)',
  })
  crear(@CurrentUser() user: JwtUser, @Body() dto: CrearKeyDto) {
    return this.integracion.crearKey(user, dto.nombre, dto.idInstitucion);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoca una llave (deja de funcionar al instante)' })
  revocar(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.integracion.revocarKey(user, id);
  }
}
