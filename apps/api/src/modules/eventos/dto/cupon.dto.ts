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
