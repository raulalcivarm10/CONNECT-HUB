import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtUser } from '../../auth/types';
import { AuditoriaService } from './auditoria.service';

@ApiTags('auditoria')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  @ApiOperation({
    summary:
      'Registro de actividad por institución (SYSTEM ve la suya; superadmin todas)',
  })
  listar(
    @CurrentUser() user: JwtUser,
    @Query('accion') accion?: string,
    @Query('usuario') usuario?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('idInstitucion') idInstitucion?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.auditoria.listar(user, {
      accion,
      usuario,
      desde,
      hasta,
      idInstitucion: idInstitucion ? Number(idInstitucion) : undefined,
      limit,
      offset,
    });
  }
}
