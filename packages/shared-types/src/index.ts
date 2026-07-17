/**
 * Contratos compartidos entre la API pública (apps/api/src/modules/public) y la
 * app móvil (apps/mobile). Fuente única de verdad de los DTOs `/public/*`.
 * Todo en camelCase, fechas como 'YYYY-MM-DD', horas como 'HH:mm' (locales del
 * evento — sin zona horaria del dispositivo).
 */

/** Respuesta paginada genérica. */
export interface Paginated<T> {
  page: number;
  size: number;
  total: number;
  items: T[];
}

/** Institución resuelta desde un CODIGO_CONEXION (sin credenciales). */
export interface InstitucionResumen {
  idInstitucion: number;
  nombre: string;
  ciudad: string | null;
  pais: string | null;
  /** CODIGO_CONEXION (para consultar el catálogo de esta institución). */
  codigo: string;
  /** Ruta relativa al logo (BLOB) o null si no hay imagen cargada. */
  logoUrl: string | null;
}

/** Evento en listados (Home / búsqueda). */
export interface EventoResumen {
  id: number;
  titulo: string;
  descripcion: string | null;
  /** 'YYYY-MM-DD' */
  fechaInicio: string;
  /** 'YYYY-MM-DD' (== fechaInicio si es de un solo día) */
  fechaFin: string;
  /** 'HH:mm' */
  horaInicio: string | null;
  horaFin: string | null;
  precio: number | null;
  incluyeIva: boolean;
  montoIva: number | null;
  destacado: boolean;
  localNombre: string | null;
  salonNombre: string | null;
  /** Días reales del evento ('YYYY-MM-DD'), no un rango continuo. */
  dias: string[];
  /** URL directa a la portada en el NAS (usable en <Image>). */
  portadaUrl: string;
  /** Presentes solo en el feed agregado (eventos de todas mis instituciones). */
  idInstitucion?: number | null;
  institucionNombre?: string | null;
}

/** Un día de la agenda de un evento. */
export interface DiaEvento {
  id: number;
  fecha: string;
  horaInicio: string | null;
  horaFin: string | null;
  orden: number | null;
}

/** Expositor / ponente (datos públicos, sin email). */
export interface Expositor {
  id: number;
  nombreCompleto: string;
  cargo: string | null;
  organizacion: string | null;
  tagline: string | null;
  bio: string | null;
  sitioWebUrl: string | null;
  redesSociales: string[];
  rol: string | null;
  esDestacado: boolean;
  orden: number | null;
  fotoUrl: string;
}

/** Detalle enriquecido 1:1 del evento (puede ser null si no se configuró). */
export interface EventoDetalleExtra {
  descripcionCorta: string | null;
  descripcionLarga: string | null;
  queAprenderas: string[];
  temas: string[];
  requisitos: string[];
  publicoObjetivo: string[];
  bibliografia: string[];
  nivel: string | null;
  modalidad: string | null;
  ritmo: string | null;
  duracionValor: number | null;
  duracionUnidad: string | null;
  esfuerzoHsSemana: number | null;
  idioma: string | null;
  videoPromoUrl: string | null;
  certHabilitado: boolean;
  certTipo: string | null;
  certEntrega: string | null;
}

/** Workshop (evento hijo) dentro del detalle de un evento principal. */
export interface WorkshopResumen {
  id: number;
  titulo: string;
  descripcion: string | null;
  precio: number | null;
  fechaInicio: string;
  horaInicio: string | null;
  horaFin: string | null;
  salonNombre: string | null;
  dias: string[];
}

/** Detalle compuesto de un evento (pantalla de detalle). */
export interface EventoDetalle {
  id: number;
  titulo: string;
  descripcion: string | null;
  precio: number | null;
  incluyeIva: boolean;
  montoIva: number | null;
  publicoEsperado: number | null;
  codItem: string | null;
  fechaInicio: string;
  fechaFin: string;
  horaInicio: string | null;
  horaFin: string | null;
  idEventoPadre: number | null;
  localNombre: string | null;
  localUbicacion: string | null;
  salonNombre: string | null;
  institucion: string | null;
  portadaUrl: string;
  dias: DiaEvento[];
  expositores: Expositor[];
  detalle: EventoDetalleExtra | null;
  workshops: WorkshopResumen[];
}

/** Listado de eventos = página de EventoResumen. */
export type EventosPage = Paginated<EventoResumen>;

/* ---------- Auth de asistente ---------- */

/** Perfil público del asistente (lo devuelve /public/auth/me). */
export interface AsistenteProfile {
  id: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
  fotoUrl: string | null;
  numeroCelular: string | null;
  /** Identificación (cédula) — requerida por el checkout del servicio de pagos. */
  tipoId: string | null;
  numeroId: string | null;
  isVerified: boolean;
  onboardingCompleto: boolean;
  tieneGoogle: boolean;
  tieneApple: boolean;
}

/** Respuesta de register/login/refresh. */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AsistenteProfile;
  /** Solo en dev sin SMTP: token para verificar sin correo. */
  devVerificationToken?: string;
}

/* ---------- Entradas / inscripción ---------- */

/** Una entrada (evento adquirido) del asistente. Un QR por entrada. */
export interface MiEntrada {
  idEventoUsuario: number;
  idEvento: number;
  titulo: string;
  precio: number | null;
  fechaInicio: string;
  horaInicio: string | null;
  horaFin: string | null;
  dias: string[];
  salonNombre: string | null;
  localNombre: string | null;
  esWorkshop: boolean;
  qrToken: string | null;
  asistio: boolean;
  fechaEntrada: string | null;
  /** Código del certificado emitido (si ya asistió). */
  certificadoCodigo: string | null;
  portadaUrl: string;
}

/* ---------- Comunidad / chat ---------- */

export interface ComunidadMensaje {
  id: number;
  /** Autor del mensaje (para abrir su perfil). */
  idCliente: string;
  mensaje: string;
  autor: string;
  fotoUrl: string | null;
  fecha: string;
  esMio: boolean;
}

/** Muro de la comunidad de UN evento. */
export interface ComunidadFeed {
  idEvento: number;
  titulo: string;
  portadaUrl: string;
  page: number;
  size: number;
  total: number;
  participantes: number;
  /** false si el asistente salió de la comunidad (puede volver a ingresar). */
  soyMiembro: boolean;
  items: ComunidadMensaje[];
}

/** Tarjeta del hub de comunidades (una por evento con entrada). */
export interface ComunidadResumen {
  idEvento: number;
  titulo: string;
  fechaInicio: string;
  portadaUrl: string;
  participantes: number;
  soyMiembro: boolean;
  total: number;
  ultimoMensaje: string | null;
  ultimaFecha: string | null;
}

/* ---------- Perfil / networking ---------- */

export type RelacionConexion =
  | 'yo'
  | 'conectado'
  | 'pendiente_enviada'
  | 'pendiente_recibida'
  | 'ninguna';

/** Mi perfil editable. */
export interface MiPerfil {
  idCliente: string;
  nombre: string | null;
  apellido: string | null;
  fotoUrl: string | null;
  email: string;
  numeroCelular: string | null;
  tipoId: string | null;
  numeroId: string | null;
  profesion: string | null;
  empresa: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  visibilidad: 'PUBLICO' | 'PRIVADO';
}

/** Perfil de otro asistente (respeta privacidad). */
export interface PerfilPublico {
  idCliente: string;
  nombre: string;
  fotoUrl: string | null;
  profesion: string | null;
  empresa: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  visibilidad: 'PUBLICO' | 'PRIVADO';
  esYo: boolean;
  relacion: RelacionConexion;
  /** true si es privado y aún no hay conexión (datos ocultos). */
  limitado: boolean;
  puedeChatear: boolean;
}

/** Persona resumida (listas de conexiones/solicitudes). */
export interface PersonaResumen {
  idCliente: string;
  nombre: string;
  fotoUrl: string | null;
  profesion: string | null;
}

/** Solicitud de conexión recibida. */
export interface SolicitudConexion extends PersonaResumen {
  idConexion: number;
  fecha: string;
}

/* ---------- Chats privados ---------- */

/** Tarjeta del hub de chats privados. */
export interface ChatResumen extends PersonaResumen {
  idChat: number;
  ultimoMensaje: string | null;
  ultimaFecha: string | null;
  noLeidos: number;
}

export interface ChatMensaje {
  id: number;
  idRemitente: string;
  mensaje: string;
  fecha?: string;
  esMio: boolean;
}

/** Detalle de un chat privado (mensajes + el otro participante). */
export interface ChatDetalle {
  idChat: number;
  otro: PersonaResumen;
  items: ChatMensaje[];
}

/** Certificado digital emitido al asistir. */
export interface Certificado {
  codigo: string;
  tipo: string | null;
  nombreAsistente: string | null;
  tituloEvento: string | null;
  institucion: string | null;
  idEvento: number;
  fechaEmision: string;
}

/** Resultado de inscribirse: gratis (entrada emitida) o requiere pago. */
export interface InscripcionResult {
  requierePago: boolean;
  idEventoUsuario?: number;
  qrToken?: string;
  asistio?: boolean;
  evento?: { id: number; titulo: string; precio: number };
}

/* ---------- Pagos (Nuvei/Paymentez) ---------- */

/** Tarjeta guardada (tokenizada). El PAN nunca se almacena ni se devuelve. */
export interface Tarjeta {
  id: number;
  tipo: string | null; // marca: vi, mc, ...
  last4: string | null;
  bin: string | null;
  holderName: string | null;
  expiryMonth: number;
  expiryYear: number;
  predeterminado: boolean;
}

/** Datos que la app envía para tokenizar una tarjeta nueva. */
export interface NuevaTarjetaInput {
  idInstitucion: number;
  numero: string;
  holderName: string;
  expiryMonth: number;
  expiryYear: number;
  cvc: string;
}

/** Resultado de validar un cupón de descuento para un evento. */
export interface CuponValidacion {
  valido: boolean;
  /** Solo si !valido: por qué falló. */
  motivo?: 'not_found' | 'exhausted';
  /** Código normalizado (mayúsculas), si es válido. */
  codigo?: string;
  /** 'M' = monto USD, 'P' = porcentaje. */
  tipoDescuento?: 'M' | 'P';
  /** Valor configurado del cupón (USD si 'M', porcentaje si 'P'). */
  montoDescuento?: number;
  /** Monto descontado en USD. */
  descuento?: number;
  /** Total sin descuento. */
  total: number;
  /** Total final con el descuento aplicado. */
  totalConDescuento?: number;
}

/** Desglose de precio de un evento de pago (antes de cobrar). */
export interface ResumenPago {
  idEvento: number;
  titulo: string;
  idInstitucion: number;
  moneda: string;
  subtotal: number;
  iva: number;
  total: number;
  incluyeIva: boolean;
  yaAdquirido: boolean;
  portadaUrl: string;
}

/** Resultado de un cobro directo con tarjeta guardada. */
export interface PagoResult {
  aprobado: boolean;
  yaAdquirido?: boolean;
  pendiente?: boolean;
  idEventoUsuario?: number;
  qrToken?: string | null;
  transaccionId?: string | null;
  monto?: number;
  referencia?: string;
  motivo?: string;
}

/** Respuesta al crear un checkout hospedado (Link to Pay). */
export interface CheckoutResult {
  yaAdquirido: boolean;
  referencia?: string;
  paymentUrl?: string;
}

/** Respuesta al iniciar un Checkout embebido (widget PaymentCheckout / init_reference). */
export interface IniciarCheckoutResult {
  yaAdquirido: boolean;
  /** Nuestra dev_reference (para confirmar/polling). */
  referencia?: string;
  /** Referencia Paymentez para abrir el widget: modal.open({ reference }). */
  reference?: string;
  /** Entorno del SDK: 'stg' | 'prod'. */
  envMode?: 'stg' | 'prod';
  /** URL del checkout hospedado (fallback / navegador). */
  checkoutUrl?: string | null;
}

/** Resultado de confirmar el Checkout embebido tras onResponse. */
export interface ConfirmarCheckoutResult {
  aprobado: boolean;
  yaAdquirido?: boolean;
  pendiente?: boolean;
  idEventoUsuario?: number;
  qrToken?: string | null;
  transaccionId?: string | null;
  monto?: number;
  referencia?: string;
  motivo?: string;
}

/** Estado de un pago consultado por referencia (polling del checkout). */
export interface EstadoPago {
  estado: string;
  aprobado: boolean;
  idEvento: number;
  idEventoUsuario: number | null;
  qrToken: string | null;
}
