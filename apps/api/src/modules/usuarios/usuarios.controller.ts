import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtUser, ROL } from '../../auth/types';
import { UsuariosService } from './usuarios.service';
import {
  CreateUsuarioDto,
  UpdateEstadoDto,
  UpdateRolesDto,
  UpdateUsuarioDto,
} from './dto/create-usuario.dto';

@ApiTags('usuarios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  @Roles(ROL.SYSTEM)
  @ApiOperation({ summary: 'Usuarios de la institución (superadmin: todas)' })
  list(
    @CurrentUser() user: JwtUser,
    @Query('idInstitucion') idInstitucion?: string,
  ) {
    return this.usuarios.list(
      user,
      idInstitucion ? Number(idInstitucion) : undefined,
    );
  }

  @Post()
  @Roles(ROL.SYSTEM)
  @ApiOperation({ summary: 'Crear usuario de la institución con sus roles' })
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateUsuarioDto) {
    return this.usuarios.create(user, dto);
  }

  @Patch(':cod')
  @Roles(ROL.SYSTEM)
  @ApiOperation({
    summary: 'Editar usuario (nombres, apellidos, email, contraseña opcional)',
  })
  update(
    @CurrentUser() user: JwtUser,
    @Param('cod') cod: string,
    @Body() dto: UpdateUsuarioDto,
  ) {
    return this.usuarios.update(user, cod, dto);
  }

  @Delete(':cod')
  @Roles(ROL.SYSTEM)
  @ApiOperation({
    summary: 'Eliminar usuario definitivamente (no a ti mismo ni superadmins)',
  })
  remove(@CurrentUser() user: JwtUser, @Param('cod') cod: string) {
    return this.usuarios.remove(user, cod);
  }

  @Patch(':cod/estado')
  @Roles(ROL.SYSTEM)
  @ApiOperation({ summary: 'Activar / desactivar usuario' })
  setEstado(
    @CurrentUser() user: JwtUser,
    @Param('cod') cod: string,
    @Body() dto: UpdateEstadoDto,
  ) {
    return this.usuarios.setEstado(user, cod, dto.estado);
  }

  @Patch(':cod/roles')
  @Roles(ROL.SYSTEM)
  @ApiOperation({ summary: 'Reemplazar los roles del usuario' })
  setRoles(
    @CurrentUser() user: JwtUser,
    @Param('cod') cod: string,
    @Body() dto: UpdateRolesDto,
  ) {
    return this.usuarios.setRoles(user, cod, dto.roles);
  }
}
