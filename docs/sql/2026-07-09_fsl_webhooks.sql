-- Webhook de FourStackLabs: provisión de institución al pagar el servicio
-- (aplicado 2026-07-09). Tabla de idempotencia de eventos recibidos.
CREATE TABLE FSL_WEBHOOK_EVENTS (
  EVENT_ID     VARCHAR2(100) PRIMARY KEY,   -- X-FSL-Event-Id (dedupe)
  EVENT_TYPE   VARCHAR2(60),
  STATUS       VARCHAR2(30),                -- PROCESSED | SKIPPED_USER_EXISTS
  RECEIVED_AT  DATE DEFAULT SYSDATE,
  PROCESSED_AT DATE
);

-- Flujo (POST /api/fsl/webhooks, público, firma HMAC X-FSL-Signature):
--   subscription.created -> genera CODIGO_CONEXION, crea INSTITUCIONES (APROBADA,
--   APROBADO_POR='FSL-WEBHOOK'), crea usuario SYSTEM (DEBE_CAMBIAR_CLAVE='S') y
--   envía correo de bienvenida con credenciales + código de conexión + link.
-- Requiere FSL_WEBHOOK_SECRET en el .env (secreto compartido con FSL).
