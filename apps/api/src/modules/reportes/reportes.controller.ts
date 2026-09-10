import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtUser, ROL } from '../../auth/types';
import { ReportesService } from './reportes.service';

@ApiTags('reportes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROL.SYSTEM, ROL.ADMINISTRATION, ROL.EVENT)
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Get('asistencia')
  @ApiOperation({
    summary:
      'Resumen de asistencia por evento (filtros: idInstitucion, anio, meses csv, idEvento)',
  })
  asistencia(
    @CurrentUser() user: JwtUser,
    @Query('idInstitucion') idInstitucion?: string,
    @Query('anio') anio?: string,
    @Query('meses') meses?: string,
    @Query('idEvento') idEvento?: string,
  ) {
    return this.reportes.asistencia(user, {
      idInstitucion: idInstitucion ? Number(idInstitucion) : undefined,
      anio: anio ? Number(anio) : undefined,
      meses: meses
        ? meses
            .split(',')
            .map((m) => Number(m.trim()))
            .filter((m) => !Number.isNaN(m))
        : undefined,
      idEvento: idEvento ? Number(idEvento) : undefined,
    });
  }

  // SOLO SYSTEM (y el super, que el guard deja pasar siempre): son datos
  // personales de gente que no participó en ningún evento todavía, así que no
  // se abren al rol EVENT ni a ADMINISTRATION.
  @Get('vinculados')
  @Roles(ROL.SYSTEM)
  @ApiOperation({
    summary: 'Personas que entraron con el código de una institución (nombre y correo)',
  })
  vinculados(
    @CurrentUser() user: JwtUser,
    @Query('idInstitucion') idInstitucion?: string,
    @Query('q') q?: string,
  ) {
    return this.reportes.vinculados(user, {
      idInstitucion: idInstitucion ? Number(idInstitucion) : undefined,
      q,
    });
  }

  @Get('salones')
  @ApiOperation({
    summary:
      'Ingresos y ocupación por salón (filtros: idInstitucion, anio, meses csv, idLocal)',
  })
  salones(
    @CurrentUser() user: JwtUser,
    @Query('idInstitucion') idInstitucion?: string,
    @Query('anio') anio?: string,
    @Query('meses') meses?: string,
    @Query('idLocal') idLocal?: string,
  ) {
    return this.reportes.salones(user, {
      idInstitucion: idInstitucion ? Number(idInstitucion) : undefined,
      anio: anio ? Number(anio) : undefined,
      meses: meses
        ? meses
            .split(',')
            .map((m) => Number(m.trim()))
            .filter((m) => !Number.isNaN(m))
        : undefined,
      idLocal: idLocal ? Number(idLocal) : undefined,
    });
  }

  @Get('asistencia/:idEvento/inscritos')
  @ApiOperation({ summary: 'Detalle de inscritos de un evento con su asistencia' })
  inscritos(
    @CurrentUser() user: JwtUser,
    @Param('idEvento', ParseIntPipe) idEvento: number,
  ) {
    return this.reportes.inscritos(user, idEvento);
  }
}
