import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateLocalDto {
  @ApiProperty() @IsString() @MaxLength(150) nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(250) ubicacion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) descripcion?: string;
  @ApiPropertyOptional({ description: 'Solo superadmin' })
  @IsOptional() @IsInt() idInstitucion?: number;
}

export class UpdateLocalDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(250) ubicacion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) descripcion?: string;
}

export class CreateSalonDto {
  @ApiProperty() @IsInt() idLocal: number;
  @ApiProperty() @IsString() @MaxLength(150) nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() esSubdivisible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsPositive() capacidadMax?: number;
}

export class UpdateSalonDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() esSubdivisible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsPositive() capacidadMax?: number;
}

export class CreateSubsalonDto {
  @ApiProperty() @IsInt() idSalon: number;
  @ApiProperty() @IsString() @MaxLength(150) nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsPositive() capacidadMax?: number;
}

export class UpdateSubsalonDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsPositive() capacidadMax?: number;
}

export class CreateConfiguracionDto {
  @ApiProperty() @IsInt() idSalon: number;
  @ApiProperty() @IsString() @MaxLength(200) nombre: string;
  @ApiProperty({ type: [Number], description: 'Subsalones que la componen' })
  @IsArray() @ArrayNotEmpty() @IsInt({ each: true }) subsalones: number[];
}

export class UpdateConfiguracionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional() @IsArray() @ArrayNotEmpty() @IsInt({ each: true }) subsalones?: number[];
}

export class UpdateMapaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) nombreMapa?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) descripcion?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() idLocal?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() idSalon?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() idSubsalon?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() idConfiguracion?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional() @IsArray() @IsInt({ each: true }) subsalones?: number[];
}
