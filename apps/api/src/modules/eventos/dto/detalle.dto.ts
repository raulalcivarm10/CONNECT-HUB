import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const NIVELES = ['PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO'];
const MODALIDADES = ['PRESENCIAL', 'ONLINE', 'HIBRIDO'];
const RITMOS = ['EN_VIVO', 'A_TU_RITMO'];
const DURACION_UNIDADES = ['HORAS', 'SEMANAS', 'SESIONES', 'DIAS'];
const CERT_TIPOS = ['ASISTENCIA', 'PARTICIPACION', 'FINALIZACION'];
const CERT_ENTREGAS = ['DESCARGA', 'EMAIL', 'APP'];
const ROLES_EXPOSITOR = ['EXPOSITOR', 'CO_EXPOSITOR', 'MODERADOR', 'KEYNOTE'];

/** Detalle 1:1 del evento (EVENTO_DETALLE). Todos los campos son opcionales. */
export class EventoDetalleDto {
  @ApiPropertyOptional({ description: 'Short description (up to 500 chars)' })
  @IsOptional() @IsString() @MaxLength(500) descripcionCorta?: string;

  @ApiPropertyOptional({ description: 'Full rich description' })
  @IsOptional() @IsString() descripcionLarga?: string;

  @ApiPropertyOptional({
    type: [String],
    description: "What attendees will learn / experience",
  })
  @IsOptional() @IsArray() @IsString({ each: true }) queAprenderas?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Topics covered' })
  @IsOptional() @IsArray() @IsString({ each: true }) temas?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Requirements' })
  @IsOptional() @IsArray() @IsString({ each: true }) requisitos?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Target audience' })
  @IsOptional() @IsArray() @IsString({ each: true }) publicoObjetivo?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Bibliography' })
  @IsOptional() @IsArray() @IsString({ each: true }) bibliografia?: string[];

  @ApiPropertyOptional({ enum: NIVELES })
  @IsOptional() @IsIn(NIVELES) nivel?: string;

  @ApiPropertyOptional({ enum: MODALIDADES })
  @IsOptional() @IsIn(MODALIDADES) modalidad?: string;

  @ApiPropertyOptional({ enum: RITMOS })
  @IsOptional() @IsIn(RITMOS) ritmo?: string;

  @ApiPropertyOptional({ description: 'Duration value (e.g. 8.5)' })
  @IsOptional() @IsNumber() @Min(0) duracionValor?: number;

  @ApiPropertyOptional({ enum: DURACION_UNIDADES })
  @IsOptional() @IsIn(DURACION_UNIDADES) duracionUnidad?: string;

  @ApiPropertyOptional({ description: 'Effort in hours per week' })
  @IsOptional() @IsNumber() @Min(0) esfuerzoHsSemana?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) idioma?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) imagenUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) videoPromoUrl?: string;

  @ApiPropertyOptional({ description: 'Issue a certificate for this event' })
  @IsOptional() @IsBoolean() certHabilitado?: boolean;

  @ApiPropertyOptional({ enum: CERT_TIPOS })
  @IsOptional() @IsIn(CERT_TIPOS) certTipo?: string;

  @ApiPropertyOptional({ enum: CERT_ENTREGAS })
  @IsOptional() @IsIn(CERT_ENTREGAS) certEntrega?: string;

  @ApiPropertyOptional({ description: 'Attendance threshold (0..100)' })
  @IsOptional() @IsNumber() @Min(0) @Max(100) certUmbralAsistencia?: number;
}

/** Alta de un expositor (EVENTO_EXPOSITORES). */
export class CreateExpositorDto {
  @ApiProperty({ description: 'Full name (required)' })
  @IsString() @MaxLength(150) nombreCompleto: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) cargo?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) organizacion?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) tagline?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() bibliografia?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) fotoUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) email?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) ubicacion?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) sitioWebUrl?: string;

  @ApiPropertyOptional({ enum: ROLES_EXPOSITOR })
  @IsOptional() @IsIn(ROLES_EXPOSITOR) rol?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() esDestacado?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) orden?: number;
}

/** Edición de un expositor: todos los campos son opcionales. */
export class UpdateExpositorDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) nombreCompleto?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) cargo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) organizacion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) tagline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bibliografia?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) fotoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) ubicacion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) sitioWebUrl?: string;

  @ApiPropertyOptional({ enum: ROLES_EXPOSITOR })
  @IsOptional() @IsIn(ROLES_EXPOSITOR) rol?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() esDestacado?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) orden?: number;
}
