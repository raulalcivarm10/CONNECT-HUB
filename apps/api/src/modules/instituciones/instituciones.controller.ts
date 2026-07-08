import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtUser } from '../../auth/types';
import { InstitucionesService } from './instituciones.service';
import { AprobarInstitucionDto } from './dto/aprobar.dto';
import { EditarInstitucionDto } from './dto/editar-institucion.dto';

@ApiTags('instituciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('instituciones')
export class InstitucionesController {
  constructor(private readonly instituciones: InstitucionesService) {}

  @Get()
  @ApiOperation({ summary: 'Instituciones (superadmin: todas; usuario: la suya)' })
  list(@CurrentUser() user: JwtUser) {
    return this.instituciones.list(user);
  }

  @Post(':id/aprobar')
  @ApiOperation({
    summary:
      'Aprobar institución y crear su usuario genérico SYSTEM (solo superadmin)',
  })
  aprobar(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AprobarInstitucionDto,
  ) {
    return this.instituciones.aprobar(user, id, dto);
  }

  @Post(':id/rechazar')
  @ApiOperation({ summary: 'Rechazar institución (solo superadmin)' })
  rechazar(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.instituciones.cambiarEstado(user, id, 'RECHAZADA');
  }

  @Post(':id/suspender')
  @ApiOperation({ summary: 'Suspender institución (solo superadmin)' })
  suspender(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.instituciones.cambiarEstado(user, id, 'SUSPENDIDA');
  }

  @Post(':id/reactivar')
  @ApiOperation({ summary: 'Reactivar institución suspendida (solo superadmin)' })
  reactivar(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.instituciones.cambiarEstado(user, id, 'APROBADA');
  }

  @Get(':id/perfil')
  @ApiOperation({
    summary: 'Perfil de la institución (sin credenciales de pasarela)',
  })
  perfil(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.instituciones.perfil(user, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Editar perfil de la institución (super o SYSTEM/ADMINISTRATIVO propio; credenciales write-only)',
  })
  editar(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarInstitucionDto,
  ) {
    return this.instituciones.editarPerfil(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Eliminar institución (solo super; bloqueado si tiene usuarios, locales, mapas, tarjetas o clientes)',
  })
  eliminar(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.instituciones.eliminar(user, id);
  }

  @Post(':id/logo')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Subir logo de la institución al NAS (campo file)',
  })
  async subirLogo(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
  ) {
    const { archivo } = await leerImagenMultipart(req);
    return this.instituciones.subirLogo(user, id, archivo);
  }
}
