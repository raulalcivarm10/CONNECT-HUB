import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Perfil editable de la institución. Las credenciales de pasarela son de
 * SOLO ESCRITURA: se actualizan si se envían pero jamás se devuelven en
 * ninguna respuesta de la API.
 */
export class EditarInstitucionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(250) direccion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) ciudad?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) pais?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) codigoConexion?: string;

  // pagos
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) proveedorPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) paymentEnvironment?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) urlCodPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) urlProcesoPago?: string;

  // credenciales de pasarela (write-only)
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) usuarioPasarela?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) contrasenaPasarela?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) tokenPasarela?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) appCodeTokenization?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) appKeyTokenization?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) appCodeCheckout?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) appKeyCheckout?: string;
}
