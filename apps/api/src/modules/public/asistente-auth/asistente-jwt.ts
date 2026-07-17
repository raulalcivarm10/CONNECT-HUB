/**
 * Contrato del JWT de ASISTENTE (app móvil). Totalmente separado del admin:
 * secretos propios y claim `aud: 'asistente'` obligatorio, de modo que un token
 * de asistente jamás pase el JwtAuthGuard admin y viceversa.
 */

/** Audiencia obligatoria en todo token de asistente. */
export const ASISTENTE_AUD = 'asistente' as const;

/** Env vars de los secretos (distintos de JWT_SECRET / JWT_REFRESH_SECRET). */
export const ASISTENTE_ACCESS_SECRET_ENV = 'JWT_ASISTENTE_SECRET';
export const ASISTENTE_REFRESH_SECRET_ENV = 'JWT_ASISTENTE_REFRESH_SECRET';

export const ASISTENTE_ACCESS_TTL = '15m';
export const ASISTENTE_REFRESH_TTL = '30d';
export const ASISTENTE_RESET_TTL = '1h';

/** Lo que viaja en el access token y se expone como req.asistente. */
export interface AsistenteUser {
  sub: string; // ID_CLIENTE (UUID)
  email: string;
  aud: typeof ASISTENTE_AUD;
  // `typ:'access'` distingue el access token del reset/refresh (mismo aud). El
  // guard lo EXIGE → un token de reset (firmado con el mismo secreto) no vale como access.
  typ: 'access';
}

/** Payload del refresh token de asistente. */
export interface AsistenteRefreshPayload {
  sub: string;
  aud: typeof ASISTENTE_AUD;
  typ: 'refresh';
}

/** Payload del reset token de contraseña (stateless, corto). */
export interface AsistenteResetPayload {
  sub: string;
  aud: typeof ASISTENTE_AUD;
  typ: 'reset';
}
