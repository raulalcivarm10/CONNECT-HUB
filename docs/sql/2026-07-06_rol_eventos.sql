-- Rol EVENTOS para el módulo de creación de eventos (aplicado 2026-07-06).
-- Los eventos creados en el panel alimentan directamente la app móvil
-- existente (tabla EVENTOS + EVENTO_SUBSALONES).
INSERT INTO ROLES_INSTITUCIONES (NOMBRE, DESCRIPCION)
VALUES ('EVENTOS', 'Modulo de eventos: creacion y gestion de eventos de la institucion');
COMMIT;

-- NOTA: el trigger TRG_VALIDAR_EVENTO existe pero su cuerpo está comentado
-- (no valida nada). La validación de choques de horario/espacio se hace en
-- la API (eventos.service.ts::validarDisponibilidad): mismo día + mismo salón
-- o subsalones compartidos + ventanas [inicio-setup, fin+limpieza] cruzadas.
