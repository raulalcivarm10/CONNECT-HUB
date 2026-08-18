import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsInt, IsNumber, IsString, Length, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import type { FastifyRequest } from 'fastify';
import { PagosService } from './pagos.service';
import { AsistenteJwtGuard } from '../asistente-auth/asistente-auth.guard';
import { Asistente } from '../asistente-auth/asistente.decorator';
import type { AsistenteUser } from '../asistente-auth/asistente-jwt';

class NuevaTarjetaDto {
  @Type(() => Number)
  @IsInt()
  idInstitucion!: number;

  @IsString()
  @Length(13, 25)
  numero!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  holderName!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expiryMonth!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  expiryYear!: number;

  @IsString()
  @Length(3, 4)
  cvc!: string;
}

class PagarDto {
  @Type(() => Number)
  @IsInt()
  idEvento!: number;

  @Type(() => Number)
  @IsInt()
  idTarjeta!: number;
}

class CheckoutDto {
  @Type(() => Number)
  @IsInt()
  idEvento!: number;
}

class ValidarCuponDto {
  @IsString()
  @Length(3, 50)
  codigo!: string;
}

class ConfirmacionEmailDto {
  @Type(() => Number)
  @IsInt()
  idEvento!: number;

  @IsString()
  @Length(1, 100)
  transactionId!: string;

  @Type(() => Number)
  @IsNumber()
  monto!: number;
}

class ConfirmarCheckoutDto {
  @Type(() => Number)
  @IsInt()
  idEvento!: number;

  @IsString()
  @Length(6, 100)
  referencia!: string;

  @IsString()
  @Length(1, 100)
  transactionId!: string;
}

@ApiTags('public-pagos')
@Controller('public/pagos')
export class PagosController {
  constructor(private readonly pagos: PagosService) {}

  /* -------- tarjetas (auth) -------- */

  @Get('tarjetas')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tarjetas guardadas del asistente por institución' })
  listarTarjetas(@Asistente() u: AsistenteUser, @Query('idInstitucion') idInstitucion: string) {
    return this.pagos.listarTarjetas(u.sub, Number(idInstitucion));
  }

  @Post('tarjetas')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agrega (tokeniza) una tarjeta' })
  agregarTarjeta(@Asistente() u: AsistenteUser, @Body() dto: NuevaTarjetaDto) {
    return this.pagos.agregarTarjeta(u.sub, u.email, dto);
  }

  @Delete('tarjetas/:id')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Elimina una tarjeta guardada' })
  eliminarTarjeta(@Asistente() u: AsistenteUser, @Param('id', ParseIntPipe) id: number) {
    return this.pagos.eliminarTarjeta(u.sub, id);
  }

  /* -------- pago (auth) -------- */

  @Get('resumen/:idEvento')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resumen de precio (subtotal, IVA, total) antes de pagar' })
  resumen(@Asistente() u: AsistenteUser, @Param('idEvento', ParseIntPipe) idEvento: number) {
    return this.pagos.resumenPago(u.sub, idEvento);
  }

  @Post('debito')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cobro directo con tarjeta guardada → emite entrada si aprueba' })
  debito(@Asistente() u: AsistenteUser, @Body() dto: PagarDto) {
    return this.pagos.pagarDirecto(u.sub, u.email, dto.idEvento, dto.idTarjeta);
  }

  @Post('cupon/:idEvento')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Valida un cupón del evento (existe/activo/usos) y devuelve el descuento' })
  validarCupon(
    @Asistente() u: AsistenteUser,
    @Param('idEvento', ParseIntPipe) idEvento: number,
    @Body() dto: ValidarCuponDto,
  ) {
    return this.pagos.validarCupon(u.sub, idEvento, dto.codigo);
  }

  @Post('inscripcion-cupon/:idEvento')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Inscripción SIN pasar por la pasarela cuando el cupón cubre el 100% del total (se revalida y consume en el servidor)',
  })
  inscripcionCupon(
    @Asistente() u: AsistenteUser,
    @Param('idEvento', ParseIntPipe) idEvento: number,
    @Body() dto: ValidarCuponDto,
  ) {
    return this.pagos.inscribirConCupon(u.sub, idEvento, dto.codigo);
  }

  @Post('confirmacion-email')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Envía el correo de confirmación de pago del asistente (best-effort)' })
  confirmacionEmail(@Asistente() u: AsistenteUser, @Body() dto: ConfirmacionEmailDto) {
    return this.pagos.enviarCorreoConfirmacion(u.sub, u.email, dto.idEvento, dto.transactionId, dto.monto);
  }

  @Post('checkout')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Genera un checkout hospedado (Link to Pay) → payment_url' })
  checkout(@Asistente() u: AsistenteUser, @Body() dto: CheckoutDto) {
    return this.pagos.crearCheckout(u.sub, u.email, dto.idEvento);
  }

  @Post('checkout/iniciar')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inicia un Checkout embebido (widget PaymentCheckout) → reference + envMode' })
  iniciarCheckout(@Asistente() u: AsistenteUser, @Body() dto: CheckoutDto) {
    return this.pagos.iniciarCheckout(u.sub, u.email, dto.idEvento);
  }

  @Post('checkout/confirmar')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirma el Checkout embebido tras onResponse (verify → emite entrada)' })
  confirmarCheckout(@Asistente() u: AsistenteUser, @Body() dto: ConfirmarCheckoutDto) {
    return this.pagos.confirmarCheckout(u.sub, dto.idEvento, dto.referencia, dto.transactionId);
  }

  @Get('estado/:referencia')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Estado de un pago propio (polling del checkout)' })
  estado(@Asistente() u: AsistenteUser, @Param('referencia') referencia: string) {
    return this.pagos.estadoPago(u.sub, referencia);
  }

  /* -------- webhook (sin auth: lo llama la pasarela) -------- */

  @Post('webhook')
  @ApiOperation({ summary: 'Confirmación asíncrona de la pasarela (idempotente)' })
  webhook(@Req() req: FastifyRequest) {
    return this.pagos.webhook(req.body);
  }
}
