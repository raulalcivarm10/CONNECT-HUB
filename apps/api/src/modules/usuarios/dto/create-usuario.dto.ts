import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUsuarioDto {
  @ApiProperty({ description: 'Correo de login (será el COD_USUARIO)' })
  @IsEmail()
  @MaxLength(150)
  usuario: string;

  @ApiPropertyOptional({ description: 'Correo de contacto si difiere del login' })
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  nombres: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  apellidos: string;

  @ApiPropertyOptional({
    minLength: 8,
    description:
      'Opcional. Si se omite, se autogenera y se envía por correo al usuario.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty({
    description: 'Nombres de rol de ROLES_INSTITUCIONES',
    example: ['ADMINISTRATION'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roles: string[];

  @ApiPropertyOptional({
    description: 'Solo superadmin: institución destino del usuario',
  })
  @IsOptional()
  @IsInt()
  idInstitucion?: number;

  @ApiPropertyOptional({
    description: 'Grupo/facultad del usuario (se hereda a los eventos que cree)',
    example: 'School of Medicine',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  grupo?: string;
}

export class UpdateUsuarioDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombres?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellidos?: string;

  @ApiPropertyOptional({ description: 'Correo de contacto' })
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({ minLength: 8, description: 'Nueva contraseña (opcional)' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({
    description: 'Grupo/facultad del usuario (vacío = quitar grupo)',
    example: 'School of Medicine',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  grupo?: string;
}

export class UpdateEstadoDto {
  @ApiProperty({ enum: ['A', 'I'], description: 'A = activo, I = inactivo' })
  @IsIn(['A', 'I'])
  estado: 'A' | 'I';
}

export class UpdateRolesDto {
  @ApiProperty({ description: 'Nombres de rol que reemplazan los actuales' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roles: string[];
}
