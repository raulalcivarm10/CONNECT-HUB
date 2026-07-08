-- Recuperación de contraseña con cambio obligatorio (aplicado 2026-07-06).
-- Flujo: POST /auth/recuperar genera clave temporal aleatoria (PBKDF2) y marca
-- DEBE_CAMBIAR_CLAVE='S'. Al ingresar con la temporal, la API bloquea todos los
-- endpoints excepto /auth/cambiar-clave hasta que el usuario cambie la clave.
ALTER TABLE USUARIOS_INSTITUCIONES ADD (DEBE_CAMBIAR_CLAVE CHAR(1) DEFAULT 'N' NOT NULL);
ALTER TABLE USUARIOS_INSTITUCIONES ADD CONSTRAINT CHK_USR_INST_CAMBIAR_CLAVE CHECK (DEBE_CAMBIAR_CLAVE IN ('S','N'));
