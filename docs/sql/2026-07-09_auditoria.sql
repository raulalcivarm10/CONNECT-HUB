-- Auditoría de actividad del panel (aplicado 2026-07-09).
-- Registra logins (OK/FAIL), mutaciones (CREATE/UPDATE/DELETE) y errores,
-- con usuario, IP, ruta y detalle (campos sensibles redactados).
CREATE TABLE AUDITORIA_LOG (
  ID_LOG         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  FECHA          TIMESTAMP DEFAULT SYSTIMESTAMP,
  USUARIO        VARCHAR2(150),   -- COD_USUARIO (o intento de login)
  ID_INSTITUCION NUMBER,
  ACCION         VARCHAR2(20),    -- LOGIN_OK | LOGIN_FAIL | CREATE | UPDATE | DELETE | ERROR
  METODO         VARCHAR2(10),
  RUTA           VARCHAR2(300),
  STATUS         NUMBER,          -- HTTP status
  IP             VARCHAR2(60),
  DETALLE        VARCHAR2(2000)   -- resumen del body (redactado) o mensaje de error
);
CREATE INDEX IX_AUDITORIA_FECHA ON AUDITORIA_LOG (FECHA);
CREATE INDEX IX_AUDITORIA_USUARIO ON AUDITORIA_LOG (USUARIO);
