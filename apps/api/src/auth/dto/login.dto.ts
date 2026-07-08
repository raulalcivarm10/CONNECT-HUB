import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'usuario@institucion.com', description: 'COD_USUARIO (correo de login)' })
  @IsEmail()
  usuario: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  password: string;
}

export class RecuperarDto {
  @ApiProperty({ description: 'Correo de login del usuario' })
  @IsEmail()
  usuario: string;
}

export class CambiarClaveDto {
  @ApiProperty({ description: 'Contraseña actual (o la temporal recibida)' })
  @IsString()
  @MinLength(6)
  claveActual: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  claveNueva: string;
}
