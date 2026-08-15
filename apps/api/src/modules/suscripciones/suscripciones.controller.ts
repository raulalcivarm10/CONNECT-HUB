import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtUser } from '../../auth/types';
import {
  CrearSuscripcionDto,
  EditarSuscripcionDto,
} from './dto/suscripciones.dto';
import { SuscripcionesService } from './suscripciones.service';

/**
 * Suscripciones del proveedor a sus instituciones cliente.
 * Todo exige sesión; la GESTIÓN es solo del superadmin (el servicio lo
 * comprueba con esSuper, igual que InstitucionesService). La única excepción es
 * GET /suscripciones/mia, que cualquier usuario autenticado consulta sobre su
 * propia institución para pintar el aviso de vencimiento del panel.
 */
@ApiTags('suscripciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('suscripciones')
export class SuscripcionesController {
  constructor(private readonly suscripciones: SuscripcionesService) {}

  @Get('planes')
  @ApiOperation({ summary: 'Catálogo de planes activos' })
  planes() {
    return this.suscripciones.planes();
  }

  @Get('mia')
  @ApiOperation({
    summary:
      'Estado de la suscripción de MI institución (aviso del panel; cualquier usuario)',
  })
  mia(@CurrentUser() user: JwtUser) {
    return this.suscripciones.mia(user);
  }

  @Get()
  @ApiQuery({ name: 'idInstitucion', required: false })
  @ApiQuery({ name: 'estado', required: false })
  @ApiOperation({ summary: 'Suscripciones registradas (solo superadmin)' })
  listar(
    @CurrentUser() user: JwtUser,
    @Query('idInstitucion') idInstitucion?: string,
    @Query('estado') estado?: string,
  ) {
    return this.suscripciones.listar(user, {
      idInstitucion: idInstitucion ? Number(idInstitucion) : undefined,
      estado,
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Registra una compra (FECHA_FIN = inicio + días - 1)',
  })
  crear(@CurrentUser() user: JwtUser, @Body() dto: CrearSuscripcionDto) {
    return this.suscripciones.crear(user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita la suscripción, incluido MOVER LAS FECHAS' })
  editar(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarSuscripcionDto,
  ) {
    return this.suscripciones.editar(user, id, dto);
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancela la suscripción (no la borra)' })
  cancelar(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.suscripciones.cancelar(user, id);
  }
}
