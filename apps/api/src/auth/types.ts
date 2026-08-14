/**
 * Nombres de rol tal como existen en ROLES_INSTITUCIONES (la BD los guarda en
 * INGLÉS: SYSTEM, ADMINISTRATION, FINANCE, OPERATIONS MANAGEMENT, EVENT,
 * — 5 roles). Las constantes DEBEN coincidir letra a letra:
 * RolesGuard compara por string exacto contra JwtUser.roles.
 */
export const ROL = {
  SYSTEM: 'SYSTEM',
  ADMINISTRATION: 'ADMINISTRATION',
  FINANCE: 'FINANCE',
  OPERATIONS_MANAGEMENT: 'OPERATIONS MANAGEMENT',
  EVENT: 'EVENT',
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
  /** Grupo/facultad del usuario (USUARIOS_INSTITUCIONES.GRUPO); hereda a sus eventos */
  grupo: string | null;
  /** true = ingresó con clave temporal y debe cambiarla antes de usar el panel */
  debeCambiarClave: boolean;
}

/** ¿El actor ve TODO (super, SYSTEM o ADMINISTRATION)? Si no, se escopa a sus eventos. */
export function veTodo(user: Pick<JwtUser, 'esSuper' | 'roles'>): boolean {
  return (
    user.esSuper ||
    user.roles.includes(ROL.SYSTEM) ||
    user.roles.includes(ROL.ADMINISTRATION)
  );
}

/** ¿El actor está limitado a SUS eventos (rol EVENT sin SYSTEM/ADMINISTRATION)? */
export function soloSusEventos(user: Pick<JwtUser, 'esSuper' | 'roles'>): boolean {
  return !veTodo(user) && user.roles.includes(ROL.EVENT);
}
