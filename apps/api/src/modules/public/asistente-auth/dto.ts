import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(150)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellido?: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(150)
  email!: string;

  @IsString()
  @MaxLength(100)
  password!: string;
}

export class VerifyDto {
  @IsString()
  @MaxLength(500)
  token!: string;
}

export class GoogleDto {
  @IsString()
  @MaxLength(4000)
  idToken!: string;
}

export class AppleDto {
  // identity token JWT de Apple (se verifica firma/iss/aud/exp con las claves de Apple)
  @IsString()
  @MaxLength(6000)
  identityToken!: string;

  // Apple entrega email/nombre SOLO en la PRIMERA autorización → el móvil los reenvía
  // para enriquecer la cuenta al crearla. La identidad real es el `sub` del token.
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellido?: string;
}

export class RefreshDto {
  @IsString()
  @MaxLength(2000)
  refreshToken!: string;
}

export class PagosExchangeDto {
  @IsString()
  @MaxLength(4000)
  pagosToken!: string;
}

export class ForgotDto {
  @IsEmail()
  @MaxLength(150)
  email!: string;
}

export class ResetDto {
  @IsString()
  @MaxLength(2000)
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;
}

export class OnboardingDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellido?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  numeroCelular?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  genero?: string;

  // Identificación (cédula) — requerida por el checkout del servicio de pagos.
  @IsOptional()
  @IsString()
  @MaxLength(5)
  tipoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  numeroId?: string;
}
