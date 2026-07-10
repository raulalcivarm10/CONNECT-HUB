import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class CreateEventoDto {
  @ApiProperty() @IsString() @MaxLength(200) titulo: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(2000) descripcion?: string;

  @ApiProperty({ example: '2026-08-15' })
  @Matches(FECHA_REGEX, { message: 'fechaEvento debe ser YYYY-MM-DD' })
  fechaEvento: string;

  @ApiProperty({ example: '09:00' })
  @Matches(HORA_REGEX, { message: 'horaInicio debe ser HH:MM (24h)' })
  horaInicio: string;

  @ApiProperty({ example: '13:00' })
  @Matches(HORA_REGEX, { message: 'horaFin debe ser HH:MM (24h)' })
  horaFin: string;

  @ApiProperty() @IsInt() idLocal: number;

  @ApiPropertyOptional({
    description: 'Sin salón = se reserva el local completo',
  })
  @IsOptional() @IsInt() idSalon?: number;

  @ApiPropertyOptional({ description: 'Modelo/configuración de subsalones a reservar' })
  @IsOptional() @IsInt() idConfiguracion?: number;

  @ApiPropertyOptional({ description: 'Un solo subsalón a reservar' })
  @IsOptional() @IsInt() idSubsalon?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsNumber() @Min(0) precio?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @IsPositive() publicoEsperado?: number;

  @ApiPropertyOptional({ default: 0, description: 'Minutos de preparación' })
  @IsOptional() @IsInt() @Min(0) tiempoSetupMin?: number;

  @ApiPropertyOptional({ default: 0, description: 'Minutos de limpieza' })
  @IsOptional() @IsInt() @Min(0) tiempoCleanMin?: number;

  @ApiPropertyOptional({ description: 'Código de ítem (facturación/catálogo)' })
  @IsOptional() @IsString() @MaxLength(50) codItem?: string;

  @ApiPropertyOptional({ description: 'true = evento privado, no se publica en la app' })
  @IsOptional() @IsBoolean() noPublicar?: boolean;

  @ApiPropertyOptional({ description: 'URL de imagen (hasta integrar el NAS)' })
  @IsOptional() @IsString() @MaxLength(500) imagenUrl?: string;
}

export class UpdateEventoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) titulo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) descripcion?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(FECHA_REGEX) fechaEvento?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(HORA_REGEX) horaInicio?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(HORA_REGEX) horaFin?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() idLocal?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() idSalon?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() idConfiguracion?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() idSubsalon?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) precio?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsPositive() publicoEsperado?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) tiempoSetupMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) tiempoCleanMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) codItem?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() noPublicar?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) imagenUrl?: string;

  @ApiPropertyOptional({
    description: 'true = quitar salón/modelo y reservar el local completo',
  })
  @IsOptional() @IsBoolean() localCompleto?: boolean;
}

export class DestacarDto {
  @ApiProperty() @IsBoolean() destacado: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) orden?: number;
}
