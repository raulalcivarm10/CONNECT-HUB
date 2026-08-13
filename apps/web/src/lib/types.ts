/** Nombres EXACTOS del catálogo ROLES_INSTITUCIONES (en inglés) */
export const ROL = {
  SYSTEM: 'SYSTEM',
  ADMINISTRATION: 'ADMINISTRATION',
  FINANCE: 'FINANCE',
  OPERATIONS_MANAGEMENT: 'OPERATIONS MANAGEMENT',
  EVENT: 'EVENT',
  VENUE_APPROVER: 'VENUE_APPROVER',
  PUBLISHER: 'PUBLISHER',
} as const;

/** Flujo de aprobación de eventos (EVENTOS.ESTADO_APROBACION); null = evento legado (tratar como publicado) */
export type EstadoAprobacion =
  | 'BORRADOR'
  | 'SALON_APROBADO'
  | 'PUBLICADO'
  | 'RECHAZADO';

/** Roles que aprueban el salón de un evento (BORRADOR → SALON_APROBADO) */
export const ROLES_APROBAR_SALON: readonly string[] = [
  ROL.SYSTEM,
  ROL.ADMINISTRATION,
  ROL.VENUE_APPROVER,
];

/** Roles que publican un evento (SALON_APROBADO → PUBLICADO) */
export const ROLES_PUBLICAR: readonly string[] = [
  ROL.SYSTEM,
  ROL.ADMINISTRATION,
  ROL.PUBLISHER,
];

export interface Usuario {
  sub: string;
  email: string;
  nombres: string | null;
  apellidos: string | null;
  nombreCompleto: string;
  esSuper: boolean;
  idInstitucion: number | null;
  institucion: string | null;
  roles: string[];
  grupo?: string | null;
  debeCambiarClave: boolean;
}

export interface UsuarioRow {
  COD_USUARIO: string;
  EMAIL: string;
  NOMBRES: string | null;
  APELLIDOS: string | null;
  NOMBRE_USUARIO: string;
  ESTADOS: 'A' | 'I';
  ES_SUPER: 'S' | 'N';
  ID_INSTITUCION: number | null;
  INSTITUCION: string | null;
  ROLES: string | null;
  /** grupo/área del usuario (p. ej. facultad); el API lo expone como `grupo` */
  GRUPO?: string | null;
  grupo?: string | null;
  FECHA_REGISTRO: string | null;
}

export interface InstitucionRow {
  ID_INSTITUCION: number;
  NOMBRE: string;
  DIRECCION: string | null;
  CIUDAD: string | null;
  PAIS: string | null;
  ESTADO: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'SUSPENDIDA';
  FECHA_REGISTRO: string | null;
  FECHA_APROBACION: string | null;
  APROBADO_POR: string | null;
  TOTAL_USUARIOS: number;
}

export interface PerfilInstitucion {
  ID_INSTITUCION: number;
  NOMBRE: string;
  DIRECCION: string | null;
  CIUDAD: string | null;
  PAIS: string | null;
  ESTADO: string;
  CODIGO_CONEXION: string | null;
  PROVEEDOR_PAGO: string | null;
  PAYMENT_ENVIROMENT: string | null;
  URL_COD_PAGO: string | null;
  URL_PROCESO_PAGO: string | null;
  FECHA_REGISTRO: string | null;
  FECHA_APROBACION: string | null;
  /** banderas: 1 = credencial configurada (el valor nunca se expone) */
  TIENE_USUARIO_PASARELA: number;
  TIENE_CONTRASENA_PASARELA: number;
  TIENE_TOKEN_PASARELA: number;
  TIENE_APP_CODE_TOKENIZATION: number;
  TIENE_APP_KEY_TOKENIZATION: number;
  TIENE_APP_CODE_CHECKOUT: number;
  TIENE_APP_KEY_CHECKOUT: number;
}

export interface RolRow {
  ID_ROL: number;
  NOMBRE: string;
  DESCRIPCION: string | null;
}

export interface LocalRow {
  ID_LOCAL: number;
  ID_INSTITUCION: number;
  NOMBRE: string;
  UBICACION: string | null;
  DESCRIPCION: string | null;
  FECHA_REGISTRO: string | null;
  INSTITUCION: string;
  TOTAL_SALONES: number;
}

export interface SalonRow {
  ID_SALON: number;
  ID_LOCAL: number;
  NOMBRE: string;
  ES_SUBDIVISIBLE: 'S' | 'N';
  CAPACIDAD_MAX: number | null;
  PRECIO: number | null;
  FECHA_REGISTRO: string | null;
  TOTAL_SUBSALONES: number;
  TOTAL_CONFIGURACIONES: number;
}

export interface SubsalonRow {
  ID_SUBSALON: number;
  ID_SALON: number;
  NOMBRE: string;
  CAPACIDAD_MAX: number | null;
  PRECIO: number | null;
}

export interface ConfiguracionRow {
  ID_CONFIGURACION: number;
  ID_SALON: number;
  NOMBRE: string | null;
  ACTIVO: 'Y' | 'N';
  SUBSALONES_IDS: string | null;
  SUBSALONES_NOMBRES: string | null;
}

export interface MapaRow {
  ID_MAPA: number;
  ID_INSTITUCION: number;
  NOMBRE_MAPA: string;
  DESCRIPCION: string | null;
  ID_LOCAL: number | null;
  ID_SALON: number | null;
  ID_SUBSALON: number | null;
  ID_CONFIGURACION: number | null;
  ASIGNADO: 'Y' | 'N';
  ACTIVO: 'Y' | 'N';
  IMAGEN_MIME_TYPE: string | null;
  IMAGEN_FILENAME: string | null;
  IMAGEN_LAST_UPDATE: string | null;
  INSTITUCION: string;
  LOCAL_NOMBRE: string | null;
  SALON_NOMBRE: string | null;
  SUBSALON_NOMBRE: string | null;
  CONFIGURACION_NOMBRE: string | null;
  SUBSALONES_IDS: string | null;
}

export interface EventoRow {
  ID_EVENTO: number;
  TITULO: string;
  DESCRIPCION: string | null;
  FECHA_EVENTO: string;
  /** fecha de fin (YYYY-MM-DD); NULL o = FECHA_EVENTO => evento de un solo día */
  FECHA_FIN?: string | null;
  /** días reales del evento: 'YYYY-MM-DD' coma-separados y ordenados (desde EVENTO_HORAS) */
  DIAS?: string | null;
  /** NULL => evento principal; con valor => es workshop (evento hijo) */
  ID_EVENTO_PADRE?: number | null;
  /** título del evento padre (solo si ID_EVENTO_PADRE != null) */
  PADRE_TITULO?: string | null;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  TIEMPO_SETUP_MIN: number | null;
  TIEMPO_CLEAN_MIN: number | null;
  PRECIO: number;
  PUBLICO_ESPERADO: number | null;
  DESTACADO: number;
  ORDEN_DESTACADO: number | null;
  COD_ITEM: string | null;
  NO_PUBLICAR?: string | null;
  INCLUYE_IVA?: string | null;
  MONTO_IVA?: number | null;
  IMAGEN_URL: string | null;
  ID_LOCAL: number | null;
  ID_SALON: number | null;
  ID_SUBSALON: number | null;
  ID_CONFIGURACION: number | null;
  LOCAL_NOMBRE: string | null;
  SALON_NOMBRE: string | null;
  SUBSALON_NOMBRE: string | null;
  CONFIGURACION_NOMBRE: string | null;
  SUBSALONES_NOMBRES: string | null;
  ID_INSTITUCION: number | null;
  INSTITUCION: string | null;
  INSCRITOS: number;
  /** flujo de aprobación (camelCase, contrato del API); undefined/null = evento legado */
  creadoPor?: string | null;
  grupo?: string | null;
  estadoAprobacion?: EstadoAprobacion | null;
  motivoRechazo?: string | null;
}

/** Módulos del panel y qué roles los ven (SYSTEM, ADMINISTRATION y superadmin ven todos) */
export const MODULOS = [
  {
    id: 'administracion',
    nombreKey: 'mod.admin.name',
    descKey: 'mod.admin.desc',
    href: '/panel/administracion/usuarios',
    roles: [ROL.SYSTEM, ROL.ADMINISTRATION],
  },
  {
    id: 'financiero',
    nombreKey: 'mod.fin.name',
    descKey: 'mod.fin.desc',
    href: '/panel/financiero',
    roles: [ROL.SYSTEM, ROL.ADMINISTRATION, ROL.FINANCE],
  },
  {
    id: 'operativa',
    nombreKey: 'mod.op.name',
    descKey: 'mod.op.desc',
    href: '/panel/operativa/locales',
    roles: [ROL.SYSTEM, ROL.ADMINISTRATION, ROL.OPERATIONS_MANAGEMENT],
  },
  {
    id: 'eventos',
    nombreKey: 'mod.ev.name',
    descKey: 'mod.ev.desc',
    href: '/panel/eventos',
    roles: [
      ROL.SYSTEM,
      ROL.ADMINISTRATION,
      ROL.EVENT,
      ROL.VENUE_APPROVER,
      ROL.PUBLISHER,
    ],
  },
] as const;

export function puedeVer(
  user: Usuario | null,
  roles: readonly string[],
): boolean {
  if (!user) return false;
  if (user.esSuper) return true;
  return user.roles.some((r) => roles.includes(r));
}

/**
 * Rol EVENT "raso": crea eventos pero sin SYSTEM/ADMINISTRATION.
 * Solo ve el módulo de Eventos (lista + calendario) y sus eventos pasan
 * por el flujo de aprobación (no puede decidir la publicación).
 */
export function esEventoRestringido(user: Usuario | null): boolean {
  if (!user || user.esSuper) return false;
  if (
    user.roles.includes(ROL.SYSTEM) ||
    user.roles.includes(ROL.ADMINISTRATION)
  ) {
    return false;
  }
  return user.roles.includes(ROL.EVENT);
}
