import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Edición de un cupón: SOLO el cupo (usos máximos). El monto y el tipo de
 * descuento son inmutables a propósito — si ya hay pagos hechos con ese
 * código, cambiarle el valor reescribiría las condiciones de compras pasadas.
 * Para "retirar" un cupón usado sin borrarlo: poner el cupo igual a los usos.
 */
export class EditarCuponDto {
  @ApiProperty({
    description: 'Nuevo cupo (usos máximos). null = ilimitado.',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUsos?: number | null;
}

export class CrearCuponDto {
  @ApiProperty({ description: 'Código del cupón (único por evento)' })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  codigo: string;

  @ApiProperty({
    description:
      'Valor del descuento: si tipoDescuento es "M" es USD, si es "P" es el porcentaje (0.01–100)',
  })
  @IsNumber()
  @Min(0.01)
  montoDescuento: number;

  @ApiPropertyOptional({
    enum: ['M', 'P'],
    default: 'M',
    description: 'Tipo de descuento: M = monto USD, P = porcentaje',
  })
  @IsOptional()
  @IsIn(['M', 'P'])
  tipoDescuento?: 'M' | 'P';

  @ApiPropertyOptional({
    description: 'Máximo de usos por código (vacío = ilimitado)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsos?: number;
}
