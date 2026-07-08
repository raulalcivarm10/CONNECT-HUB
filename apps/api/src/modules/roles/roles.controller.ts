import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OracleService } from '../../database/oracle.service';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly oracle: OracleService) {}

  @Get()
  @ApiOperation({ summary: 'Catálogo de roles de institución' })
  list() {
    return this.oracle.query(
      `SELECT ID_ROL, NOMBRE, DESCRIPCION FROM ROLES_INSTITUCIONES ORDER BY ID_ROL`,
    );
  }
}
