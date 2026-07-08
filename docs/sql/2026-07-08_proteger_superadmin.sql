-- Protección del superadministrador dueño del sistema (aplicado 2026-07-08).
-- Impide, a nivel de base de datos, eliminar cualquier usuario con ES_SUPER='S'
-- de USUARIOS_INSTITUCIONES — ni siquiera por fuera del panel. El panel ya lo
-- bloquea (usuarios.service.ts), esto es la garantía de último nivel.
CREATE OR REPLACE TRIGGER TRG_PROTEGE_SUPERADMIN
BEFORE DELETE ON USUARIOS_INSTITUCIONES
FOR EACH ROW
WHEN (OLD.ES_SUPER = 'S')
BEGIN
  RAISE_APPLICATION_ERROR(
    -20099,
    'Prohibido: no se puede eliminar un superadministrador (dueno del sistema).'
  );
END;
/

-- NOTA: el 2026-07-08 se vació la base de datos de datos de prueba para el
-- arranque en producción. Se conservó únicamente: el superadmin
-- RAUL.ALCIVARM10@GMAIL.COM, el catálogo ROLES_INSTITUCIONES (5 roles) y el
-- catálogo PAIS (178 países). Los archivos físicos en el NAS quedaron
-- huérfanos (el NAS no expone borrado); son inofensivos.
