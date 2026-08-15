import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtUser } from '../../auth/types';
import { CrearLicenciaDto } from './dto/suscripciones.dto';
import { LicenciasService } from './licencias.service';

/**
 * Licencias on-premise colgadas de la institución.
 * Comparte prefijo con InstitucionesController pero son rutas distintas
 * (/instituciones/:id/licencias), así que no hay choque de rutas.
 */
@ApiTags('suscripciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('instituciones')
export class LicenciasInstitucionController {
  constructor(private readonly licencias: LicenciasService) {}

  @Get(':id/licencias')
  @ApiOperation({
    summary: 'Licencias on-premise de la institución, SIN el token (solo superadmin)',
  })
  listar(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.licencias.listar(user, id);
  }

  @Post(':id/licencias')
  @ApiOperation({
    summary:
      'Emite una licencia on-premise; el token se devuelve UNA sola vez (solo superadmin)',
  })
  crear(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CrearLicenciaDto,
  ) {
    return this.licencias.crear(user, id, dto);
  }
}

@ApiTags('suscripciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('licencias')
export class LicenciasController {
  constructor(private readonly licencias: LicenciasService) {}

  @Post(':id/revocar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoca la licencia (solo superadmin)' })
  revocar(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.licencias.revocar(user, id);
  }
}
