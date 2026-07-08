-- Fase 1 — Autenticación y flujo de aprobación de instituciones
-- Aplicado el 2026-07-04 contra CONNECT_HUB@XEPDB1 (aprobado por el usuario).
-- Cambios ADITIVOS: no alteran datos existentes ni rompen la aplicación previa.
-- Script idempotente real: scratchpad fase1_auth_migration.py (verifica existencia antes de cada paso).

-- COD_USUARIO pasa a ser el correo de login (el campo EMAIL puede ser otro correo de contacto)
ALTER TABLE USUARIOS_INSTITUCIONES MODIFY COD_USUARIO VARCHAR2(150);
ALTER TABLE USUARIO_ROL_INSTITUCION MODIFY COD_USUARIO VARCHAR2(150);

ALTER TABLE USUARIOS_INSTITUCIONES ADD (
  NOMBRES        VARCHAR2(100),
  APELLIDOS      VARCHAR2(100),
  ES_SUPER       CHAR(1) DEFAULT 'N' NOT NULL,   -- 'S' = superadmin de plataforma (sin institución)
  FECHA_REGISTRO DATE DEFAULT SYSDATE
);
ALTER TABLE USUARIOS_INSTITUCIONES MODIFY EMAIL VARCHAR2(150);
ALTER TABLE USUARIOS_INSTITUCIONES MODIFY ID_INSTITUCION NULL;  -- superadmin no pertenece a institución
ALTER TABLE USUARIOS_INSTITUCIONES ADD CONSTRAINT CHK_USUARIOS_INST_ES_SUPER CHECK (ES_SUPER IN ('S','N'));

-- Flujo de negocio: la institución se registra y paga en otra app; aquí se aprueba.
-- Al aprobar se crea automáticamente su usuario genérico con rol SYSTEM.
ALTER TABLE INSTITUCIONES ADD (
  ESTADO           VARCHAR2(20) DEFAULT 'APROBADA' NOT NULL,  -- las 3 existentes quedan APROBADA
  FECHA_APROBACION DATE,
  APROBADO_POR     VARCHAR2(150)
);
ALTER TABLE INSTITUCIONES ADD CONSTRAINT CHK_INSTITUCIONES_ESTADO
  CHECK (ESTADO IN ('PENDIENTE','APROBADA','RECHAZADA','SUSPENDIDA'));

-- Roles (IDs asignados por TRG_ROLES_INSTITUCIONES_BI): quedaron 1..4
INSERT INTO ROLES_INSTITUCIONES (NOMBRE, DESCRIPCION) VALUES ('SYSTEM', 'Usuario sistema de la institucion: acceso total y creacion de usuarios');
INSERT INTO ROLES_INSTITUCIONES (NOMBRE, DESCRIPCION) VALUES ('ADMINISTRATIVO', 'Modulo de administracion de la institucion');
INSERT INTO ROLES_INSTITUCIONES (NOMBRE, DESCRIPCION) VALUES ('FINANCIERO', 'Modulo financiero: pagos y reportes');
INSERT INTO ROLES_INSTITUCIONES (NOMBRE, DESCRIPCION) VALUES ('GESTION OPERATIVA', 'Modulo de gestion operativa: locales, salones y eventos');

-- Superadmin de plataforma (clave PBKDF2-SHA256, 100000 iteraciones:
--   CLAVE = base64(dk 32 bytes), SALT = 'pbkdf2sha256$100000$<salt hex>')
INSERT INTO USUARIOS_INSTITUCIONES
  (COD_USUARIO, NOMBRE_USUARIO, EMAIL, ESTADOS, CLAVE, SALT, ID_INSTITUCION, NOMBRES, APELLIDOS, ES_SUPER)
VALUES
  ('RAUL.ALCIVARM10@GMAIL.COM', 'RAUL ALCIVAR MOREIRA', 'RAUL.ALCIVARM10@GMAIL.COM',
   'A', '<hash>', '<salt-meta>', NULL, 'RAUL', 'ALCIVAR MOREIRA', 'S');

COMMIT;
