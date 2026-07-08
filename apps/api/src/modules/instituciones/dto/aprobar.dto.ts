import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class AprobarInstitucionDto {
  @ApiProperty({
    description:
      'Correo de login del usuario genérico SYSTEM que se crea al aprobar',
  })
  @IsEmail()
  @MaxLength(150)
  emailUsuarioSistema: string;

  @ApiPropertyOptional({ default: 'USUARIO' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombres?: string;

  @ApiPropertyOptional({ default: 'SISTEMA' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellidos?: string;
}
