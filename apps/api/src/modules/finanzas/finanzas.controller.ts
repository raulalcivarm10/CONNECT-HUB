import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtUser, ROL } from '../../auth/types';
import { FinanzasService } from './finanzas.service';

@ApiTags('finanzas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROL.SYSTEM, ROL.FINANCIERO)
@Controller('finanzas')
export class FinanzasController {
  constructor(private readonly finanzas: FinanzasService) {}

  @Get('resumen')
  @ApiOperation({
    summary:
      'Resumen de recaudación por eventos de la institución (super: todas o filtrada)',
  })
  resumen(
    @CurrentUser() user: JwtUser,
    @Query('idInstitucion') idInstitucion?: string,
  ) {
    return this.finanzas.resumen(
      user,
      idInstitucion ? Number(idInstitucion) : undefined,
    );
  }
}
