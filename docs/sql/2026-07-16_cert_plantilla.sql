-- Certificados: PLANTILLA por evento (imagen + overlay dinámico) — 2026-07-16.
-- La tabla CERTIFICADOS ya existe (registro de emisión al asistir). Aquí se añade
-- SOLO la plantilla-imagen por evento para el render dinámico del certificado:
-- sobre la imagen subida por el admin se escribe el NOMBRE del participante y el
-- TITULO del evento (composición server-side con sharp). No se persiste la imagen
-- renderizada: se genera on-demand a partir de (plantilla + datos del certificado).
--
-- CONFIG_JSON: posición/estilo del overlay, en FRACCIONES (resolución-independiente):
--   { "nombre": {"x":0.5,"y":0.46,"size":0.06,"color":"#1e293b","align":"center","weight":"bold"},
--     "evento": {"x":0.5,"y":0.60,"size":0.035,"color":"#334155","align":"center"} }
--   x,y = fracción del ancho/alto (punto de anclaje);  size = fracción del alto (font-size).

CREATE TABLE EVENTO_CERT_PLANTILLA (
  ID_EVENTO      NUMBER NOT NULL,
  IMAGEN         BLOB NOT NULL,
  IMAGEN_MIME    VARCHAR2(50) DEFAULT 'image/png' NOT NULL,
  ANCHO          NUMBER,
  ALTO           NUMBER,
  CONFIG_JSON    CLOB,
  FECHA_REGISTRO DATE DEFAULT SYSDATE,
  CONSTRAINT PK_EVENTO_CERT_PLANTILLA PRIMARY KEY (ID_EVENTO),
  CONSTRAINT FK_CERTPLANT_EVENTO FOREIGN KEY (ID_EVENTO) REFERENCES EVENTOS (ID_EVENTO)
);
