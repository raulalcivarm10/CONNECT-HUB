import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CrearFeedbackDto {
  @ApiPropertyOptional({ enum: ['SUGGESTION', 'PROBLEM', 'OTHER'] })
  @IsOptional()
  @IsIn(['SUGGESTION', 'PROBLEM', 'OTHER'])
  tipo?: 'SUGGESTION' | 'PROBLEM' | 'OTHER';

  @ApiProperty({ description: 'Qué necesitas o qué le falta a la aplicación' })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  mensaje: string;
}

export class EstadoFeedbackDto {
  @ApiProperty({ enum: ['NEW', 'REVIEWED', 'PLANNED', 'DONE'] })
  @IsIn(['NEW', 'REVIEWED', 'PLANNED', 'DONE'])
  estado: 'NEW' | 'REVIEWED' | 'PLANNED' | 'DONE';
}

export class ResponderFeedbackDto {
  @ApiProperty({ description: 'Respuesta del superadmin al feedback' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  respuesta: string;
}
