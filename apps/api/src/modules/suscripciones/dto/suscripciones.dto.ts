import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FECHA_ISO_REGEX } from '../fechas-ecuador.util';

/**
 * DTOs en su PROPIO archivo a propósito: en este proyecto una clase de DTO
 * declarada DESPUÉS de la clase del controlador compila pero revienta al
 * arrancar con "Cannot access X before initialization" (los decoradores del
 * controlador se evalúan antes que la clase del DTO).
 */

export const ESTADOS_SUSCRIPCION = [
  'ACTIVA',
  'VENCIDA',
  'CANCELADA',
  'REEMPLAZADA',
] as const;
export type EstadoSuscripcion = (typeof ESTADOS_SUSCRIPCION)[number];

const MSG_FECHA = { message: 'must be a date in YYYY-MM-DD format' };

export class CrearSuscripcionDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  idInstitucion: number;

  @ApiPropertyOptional({ description: 'Plan del catálogo; de ahí salen los días' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idPlan?: number;

  @ApiPropertyOptional({ description: 'Días vendidos; si falta, los del plan' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36500)
  dias?: number;

  @ApiProperty({ example: 'mquintana@uees.edu.ec' })
  @IsEmail()
  @MaxLength(160)
  compradorEmail: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  compradorNombre?: string;

  @ApiProperty({ example: '2026-08-14' })
  @Matches(FECHA_ISO_REGEX, MSG_FECHA)
  fechaCompra: string;

  @ApiPropertyOptional({ description: 'Si falta, se usa fechaCompra' })
  @IsOptional()
  @Matches(FECHA_ISO_REGEX, MSG_FECHA)
  fechaInicio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monto?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  moneda?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenciaPago?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string;
}

/** Editar / MOVER FECHAS de una suscripción ya registrada. */
export class EditarSuscripcionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(FECHA_ISO_REGEX, MSG_FECHA)
  fechaInicio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(FECHA_ISO_REGEX, MSG_FECHA)
  fechaFin?: string;

  @ApiPropertyOptional({ enum: ESTADOS_SUSCRIPCION })
  @IsOptional()
  @IsIn(ESTADOS_SUSCRIPCION as unknown as string[])
  estado?: EstadoSuscripcion;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenciaPago?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monto?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  compradorEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  compradorNombre?: string;
}

export const TIPOS_LICENCIA = ['PRUEBA', 'PERMANENTE'] as const;
export type TipoLicencia = (typeof TIPOS_LICENCIA)[number];

export class CrearLicenciaDto {
  @ApiProperty({ enum: TIPOS_LICENCIA })
  @IsIn(TIPOS_LICENCIA as unknown as string[])
  tipo: TipoLicencia;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string;
}
