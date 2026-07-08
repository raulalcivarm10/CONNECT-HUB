/** Nombres de rol tal como existen en ROLES_INSTITUCIONES */
export const ROL = {
  SYSTEM: 'SYSTEM',
  ADMINISTRATIVO: 'ADMINISTRATIVO',
  FINANCIERO: 'FINANCIERO',
  GESTION_OPERATIVA: 'GESTION OPERATIVA',
  EVENTOS: 'EVENTOS',
} as const;

export type RolNombre = (typeof ROL)[keyof typeof ROL];

export interface JwtUser {
  /** COD_USUARIO = correo de login */
  sub: string;
  email: string;
  nombres: string | null;
  apellidos: string | null;
  nombreCompleto: string;
  esSuper: boolean;
  idInstitucion: number | null;
  institucion: string | null;
  roles: string[];
  /** true = ingresó con clave temporal y debe cambiarla antes de usar el panel */
  debeCambiarClave: boolean;
}
