import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtUser } from '../../auth/types';
import { CrearFeedbackDto, EstadoFeedbackDto } from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

@ApiTags('feedback')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  @ApiOperation({ summary: 'Enviar una sugerencia/recomendación' })
  crear(@CurrentUser() user: JwtUser, @Body() dto: CrearFeedbackDto) {
    return this.feedback.crear(user, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar feedback (superadmin: todo; usuario: el suyo)',
  })
  listar(@CurrentUser() user: JwtUser, @Query('estado') estado?: string) {
    return this.feedback.listar(user, estado);
  }

  @Patch(':id/estado')
  @ApiOperation({ summary: 'Cambiar estado (solo superadmin)' })
  cambiarEstado(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EstadoFeedbackDto,
  ) {
    return this.feedback.cambiarEstado(user, id, dto.estado);
  }
}
