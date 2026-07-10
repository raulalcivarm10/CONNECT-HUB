-- Eventos privados / reservas de espacio (aplicado 2026-07-10).
-- NO_PUBLICAR='S' marca eventos que ocupan el espacio (reservas privadas)
-- pero NO deben mostrarse en la app movil.
ALTER TABLE EVENTOS ADD (NO_PUBLICAR CHAR(1) DEFAULT 'N' CHECK (NO_PUBLICAR IN ('S','N')));

-- REQUERIDO EN LA APP MOVIL (equipo externo): filtrar en sus consultas de
-- eventos:  WHERE NVL(E.NO_PUBLICAR,'N') = 'N'
-- Sin ese filtro, las reservas privadas del panel aparecerian en la app.
