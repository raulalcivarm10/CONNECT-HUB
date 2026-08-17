import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** TIPO de bloque (EVENTO_AGENDA.TIPO). Todo lo que no sea PONENCIA se publica
 *  como bloque sin charlas (coffee break, almuerzo, inauguración…). */
export const TIPOS_AGENDA = ['PONENCIA', 'DESCANSO', 'PROTOCOLO'];

/** Tope de filas por PUT. La agenda real de un congreso ronda las 100-200
 *  filas; el límite evita payloads absurdos (Fastify además corta en 1 MB). */
export const MAX_FILAS_AGENDA = 2000;

/**
 * Una LÍNEA del Excel del cliente (una fila de EVENTO_AGENDA), tal cual.
 * El agrupado en sesiones/charlas NO se guarda: se calcula al leer.
 *
 * OJO con las mayúsculas: el cliente HTTP del panel envía en MAYÚSCULAS todo
 * salvo las claves que casan /pass|clave|pasarela|appcode|appkey|key|token|
 * secret|url|codigoconexion/i, y aquí no hay ninguna. O sea que `tema`,
 * `conferencista`, `salon`, `area`, `nacionalidad` y `patrocinador` LLEGAN Y SE
 * GUARDAN EN MAYÚSCULAS. Es deliberado: el API no reescribe el texto, quien lo
 * muestre (panel, app, landing) decide la capitalización.
 */
export class AgendaItemDto {
  @ApiProperty({ description: 'Día del evento: 1 = primer día (NO es la fecha)' })
  @IsInt()
  @Min(1)
  diaOrden: number;

  @ApiPropertyOptional({ description: "Hora de inicio 'HH:MM'", example: '09:00' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  @Matches(/^\d{1,2}:\d{2}$/, { message: 'horaInicio must be HH:MM' })
  horaInicio?: string;

  @ApiPropertyOptional({ description: "Hora de fin 'HH:MM'", example: '11:00' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  @Matches(/^\d{1,2}:\d{2}$/, { message: 'horaFin must be HH:MM' })
  horaFin?: string;

  @ApiPropertyOptional({
    description:
      'Sala del centro de convenciones (texto libre: Aula Magna, Regente 1…)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  salon?: string;

  @ApiPropertyOptional({ description: 'Área temática (Ortodoncia, Endodoncia…)' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  area?: string;

  @ApiPropertyOptional({ description: 'Tema de la charla' })
  @IsOptional()
  @IsString()
  @MaxLength(600)
  tema?: string;

  @ApiPropertyOptional({
    description:
      'Ponente. En los bloques que no son PONENCIA aquí viene el rótulo ("COFFEE BREAK")',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  conferencista?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) nacionalidad?: string;

  @ApiPropertyOptional({ enum: TIPOS_AGENDA, default: 'PONENCIA' })
  @IsOptional()
  @IsIn(TIPOS_AGENDA)
  tipo?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) patrocinador?: string;
}

/**
 * Cuerpo del PUT: la agenda COMPLETA del evento. Reemplaza lo que hubiera
 * (borra + inserta en una sola transacción). El ORDEN de cada fila se asigna
 * por su posición en el array, así que mandarlo en el orden del Excel conserva
 * el agrupado de bloques (una fila sin hora ni salón continúa la anterior).
 */
export class GuardarAgendaDto {
  @ApiProperty({ type: [AgendaItemDto] })
  @IsArray()
  @ArrayMaxSize(MAX_FILAS_AGENDA)
  @ValidateNested({ each: true })
  @Type(() => AgendaItemDto)
  items: AgendaItemDto[];
}
