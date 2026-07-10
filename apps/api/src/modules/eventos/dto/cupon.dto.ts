import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CrearCuponDto {
  @ApiProperty({ description: 'Código del cupón (único por evento)' })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  codigo: string;

  @ApiProperty({ description: 'Monto del descuento en USD' })
  @IsNumber()
  @Min(0.01)
  montoDescuento: number;
}
