import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { leerImagenMultipart } from '../archivos/multipart.util';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtUser, ROL } from '../../auth/types';
import { LocalesService } from './locales.service';
import { SalonesService } from './salones.service';
import { ConfiguracionesService } from './configuraciones.service';
import { EspaciosImagenesService } from './espacios-imagenes.service';
import type { TipoEntidad } from '../archivos/nas.service';
import {
  CreateConfiguracionDto,
  CreateLocalDto,
  CreateSalonDto,
  CreateSubsalonDto,
  UpdateConfiguracionDto,
  UpdateLocalDto,
  UpdateSalonDto,
  UpdateSubsalonDto,
} from './dto/operativa.dto';

@ApiTags('operativa')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROL.SYSTEM, ROL.ADMINISTRATION, ROL.OPERATIONS_MANAGEMENT)
@Controller()
export class OperativaController {
  constructor(
    private readonly locales: LocalesService,
    private readonly salones: SalonesService,
    private readonly configuraciones: ConfiguracionesService,
    private readonly espaciosImagenes: EspaciosImagenesService,
  ) {}

  // ---------- Imágenes de referencia de la jerarquía ----------

  private async subirImagenEspacio(
    user: JwtUser,
    tipoEntidad: TipoEntidad,
    id: number,
    req: FastifyRequest,
  ) {
    const { archivo } = await leerImagenMultipart(req);
    return this.espaciosImagenes.subir(user, tipoEntidad, id, archivo);
  }

  @Post('salones/:id/imagen')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir imagen de referencia del salón (campo file)' })
  subirImagenSalon(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
  ) {
    return this.subirImagenEspacio(user, 'SALON', id, req);
  }

  @Delete('salones/:id/imagen')
  @ApiOperation({ summary: 'Eliminar la imagen de referencia del salón' })
  eliminarImagenSalon(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.espaciosImagenes.eliminar(user, 'SALON', id);
  }

  @Post('subsalones/:id/imagen')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir imagen de referencia del subsalón (campo file)' })
  subirImagenSubsalon(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
  ) {
    return this.subirImagenEspacio(user, 'SUBSALON', id, req);
  }

  @Delete('subsalones/:id/imagen')
  @ApiOperation({ summary: 'Eliminar la imagen de referencia del subsalón' })
  eliminarImagenSubsalon(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.espaciosImagenes.eliminar(user, 'SUBSALON', id);
  }

  @Post('configuraciones/:id/imagen')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Subir imagen de referencia de la configuración (campo file)',
  })
  subirImagenConfiguracion(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
  ) {
    return this.subirImagenEspacio(user, 'CONFIGURACION', id, req);
  }

  @Delete('configuraciones/:id/imagen')
  @ApiOperation({ summary: 'Eliminar la imagen de referencia de la configuración' })
  eliminarImagenConfiguracion(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.espaciosImagenes.eliminar(user, 'CONFIGURACION', id);
  }

  @Delete('locales/:id/plano')
  @ApiOperation({ summary: 'Eliminar el plano/croquis del local' })
  eliminarPlanoLocal(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.espaciosImagenes.eliminar(user, 'LOCAL', id);
  }

  // ---------- Locales ----------

  @Get('locales')
  @ApiOperation({ summary: 'Locales de la institución' })
  listLocales(
    @CurrentUser() user: JwtUser,
    @Query('idInstitucion') idInstitucion?: string,
  ) {
    return this.locales.list(
      user,
      idInstitucion ? Number(idInstitucion) : undefined,
    );
  }

  @Post('locales')
  @ApiOperation({ summary: 'Crear local' })
  createLocal(@CurrentUser() user: JwtUser, @Body() dto: CreateLocalDto) {
    return this.locales.create(user, dto);
  }

  @Patch('locales/:id')
  @ApiOperation({ summary: 'Editar local' })
  updateLocal(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLocalDto,
  ) {
    return this.locales.update(user, id, dto);
  }

  @Delete('locales/:id')
  @ApiOperation({ summary: 'Eliminar local (si no tiene salones ni eventos)' })
  removeLocal(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.locales.remove(user, id);
  }

  @Post('locales/:id/plano')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir plano/croquis del local al NAS (campo file)' })
  async subirPlano(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
  ) {
    const { archivo } = await leerImagenMultipart(req);
    return this.locales.subirPlano(user, id, archivo);
  }

  // ---------- Salones ----------

  @Get('locales/:id/salones')
  @ApiOperation({ summary: 'Salones de un local' })
  listSalones(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.salones.listByLocal(user, id);
  }

  @Post('salones')
  @ApiOperation({ summary: 'Crear salón' })
  createSalon(@CurrentUser() user: JwtUser, @Body() dto: CreateSalonDto) {
    return this.salones.create(user, dto);
  }

  @Patch('salones/:id')
  @ApiOperation({ summary: 'Editar salón' })
  updateSalon(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalonDto,
  ) {
    return this.salones.update(user, id, dto);
  }

  @Delete('salones/:id')
  @ApiOperation({ summary: 'Eliminar salón (sin subsalones/configuraciones/eventos)' })
  removeSalon(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.salones.remove(user, id);
  }

  // ---------- Subsalones ----------

  @Get('salones/:id/subsalones')
  @ApiOperation({ summary: 'Subsalones de un salón' })
  listSubsalones(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.salones.listSubsalones(user, id);
  }

  @Post('subsalones')
  @ApiOperation({ summary: 'Crear subsalón' })
  createSubsalon(@CurrentUser() user: JwtUser, @Body() dto: CreateSubsalonDto) {
    return this.salones.createSubsalon(user, dto);
  }

  @Patch('subsalones/:id')
  @ApiOperation({ summary: 'Editar subsalón' })
  updateSubsalon(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSubsalonDto,
  ) {
    return this.salones.updateSubsalon(user, id, dto);
  }

  @Delete('subsalones/:id')
  @ApiOperation({ summary: 'Eliminar subsalón (si no está en uso)' })
  removeSubsalon(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.salones.removeSubsalon(user, id);
  }

  // ---------- Configuraciones ----------

  @Get('salones/:id/configuraciones')
  @ApiOperation({ summary: 'Configuraciones de subdivisión de un salón' })
  listConfiguraciones(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.configuraciones.listBySalon(user, id);
  }

  @Post('configuraciones')
  @ApiOperation({ summary: 'Crear configuración (combina subsalones)' })
  createConfiguracion(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateConfiguracionDto,
  ) {
    return this.configuraciones.create(user, dto);
  }

  @Patch('configuraciones/:id')
  @ApiOperation({ summary: 'Editar configuración' })
  updateConfiguracion(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConfiguracionDto,
  ) {
    return this.configuraciones.update(user, id, dto);
  }

  @Delete('configuraciones/:id')
  @ApiOperation({ summary: 'Eliminar configuración (si no la usan eventos)' })
  removeConfiguracion(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.configuraciones.remove(user, id);
  }
}
