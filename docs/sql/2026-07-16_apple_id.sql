-- Sign in with Apple (Apple 4.8) — 2026-07-16.
-- Se agrega APPLE_ID a USUARIOS, simétrico con GOOGLE_ID ya existente, para
-- vincular la cuenta al identificador estable de Apple (claim `sub` del token).
-- Alteración ADITIVA: columna nueva NULLABLE, no cambia datos ni columnas
-- existentes. Índice único: un Apple ID vincula a lo sumo un usuario (Oracle
-- permite múltiples NULL en índice único, así que las cuentas sin Apple no chocan).

ALTER TABLE USUARIOS ADD (APPLE_ID VARCHAR2(100));

CREATE UNIQUE INDEX UX_USUARIOS_APPLE_ID ON USUARIOS (APPLE_ID);
