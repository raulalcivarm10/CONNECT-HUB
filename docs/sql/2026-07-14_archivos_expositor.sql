-- ARCHIVOS: soporte de imágenes de EXPOSITOR (foto del ponente en el NAS).  (aplicado 2026-07-14)
-- Aditivo. Permite subir la foto del expositor al NAS con tipoEntidad='EXPOSITOR', tipoArchivo='FOTO'.
ALTER TABLE ARCHIVOS ADD (ID_EXPOSITOR NUMBER);
ALTER TABLE ARCHIVOS ADD CONSTRAINT FK_ARCHIVOS_EXPOSITOR
  FOREIGN KEY (ID_EXPOSITOR) REFERENCES EVENTO_EXPOSITORES (ID_EXPOSITOR);

-- Ampliar el CHECK de TIPO_ENTIDAD (se hizo drop del anterior CHK_ARCHIVOS_TIPO_ENTIDAD):
ALTER TABLE ARCHIVOS ADD CONSTRAINT CHK_ARCHIVOS_TIPO_ENT CHECK (
  TIPO_ENTIDAD IN ('EVENTO','INSTITUCION','LOCAL','SALON','SUBSALON','CONFIGURACION','EXPOSITOR')
);

-- ⚠️ PENDIENTE equipo NAS externo: habilitar la entidad 'EXPOSITOR' (validación, carpeta
--    expositores/{idExpositor}/, GET /archivos/activo). Igual que SALON/SUBSALON/CONFIGURACION,
--    el panel ya está listo pero el NAS debe soportarla o `nas.service.ts` avisará que no la soporta aún.
