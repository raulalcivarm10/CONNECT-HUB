import {
  BadRequestException,
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
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtUser, ROL } from '../../auth/types';
import { MapasService, NuevoMapa } from './mapas.service';
import { UpdateMapaDto } from './dto/operativa.dto';

@ApiTags('mapas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROL.SYSTEM, ROL.ADMINISTRATION, ROL.OPERATIONS_MANAGEMENT)
@Controller('mapas')
export class MapasController {
  constructor(private readonly mapas: MapasService) {}

  @Get()
  @ApiOperation({ summary: 'Mapas/croquis de la institución (sin binarios)' })
  list(
    @CurrentUser() user: JwtUser,
    @Query('idInstitucion') idInstitucion?: string,
  ) {
    return this.mapas.list(
      user,
      idInstitucion ? Number(idInstitucion) : undefined,
    );
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Subir mapa (multipart: file + nombreMapa, descripcion?, idLocal?, idSalon?, idSubsalon?, idConfiguracion?, subsalones? csv, idInstitucion? solo super)',
  })
  async create(@CurrentUser() user: JwtUser, @Req() req: FastifyRequest) {
    if (!req.isMultipart()) {
      throw new BadRequestException('Expected multipart/form-data');
    }
    const campos: Record<string, string> = {};
    let imagen: Buffer | undefined;
    let mimeType = '';
    let filename = '';

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        imagen = await part.toBuffer();
        mimeType = part.mimetype;
        filename = part.filename;
      } else {
        campos[part.fieldname] = String(part.value);
      }
    }
    if (!imagen?.length) {
      throw new BadRequestException("Missing image file (field 'file')");
    }
    if (!campos.nombreMapa?.trim()) {
      throw new BadRequestException("Missing field 'nombreMapa'");
    }

    const num = (v?: string) => (v ? Number(v) : undefined);
    const mapa: NuevoMapa = {
      nombreMapa: campos.nombreMapa.trim(),
      descripcion: campos.descripcion?.trim() || undefined,
      idInstitucion: num(campos.idInstitucion),
      idLocal: num(campos.idLocal),
      idSalon: num(campos.idSalon),
      idSubsalon: num(campos.idSubsalon),
      idConfiguracion: num(campos.idConfiguracion),
      subsalones: campos.subsalones
        ? campos.subsalones.split(',').map((s) => Number(s.trim()))
        : undefined,
      imagen,
      mimeType,
      filename,
    };
    return this.mapas.create(user, mapa);
  }

  @Get(':id/imagen')
  @ApiOperation({ summary: 'Imagen del mapa (caché Redis + ETag/304)' })
  async imagen(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const { buffer, mime, etag, filename } = await this.mapas.imagen(user, id);
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).send();
    }
    return res
      .header('Content-Type', mime)
      .header('ETag', etag)
      .header('Cache-Control', 'private, max-age=300')
      .header('Content-Disposition', `inline; filename="${filename}"`)
      .send(buffer);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar metadatos/asignación del mapa' })
  update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMapaDto,
  ) {
    return this.mapas.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar mapa' })
  remove(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.mapas.remove(user, id);
  }
}
