-- Feedback: el superadmin puede RESPONDER cada feedback.  (aplicado 2026-07-14)
-- Aditivo. La respuesta es visible para el autor del feedback.
ALTER TABLE FEEDBACK ADD (
  RESPUESTA       CLOB,           -- texto de la respuesta del superadmin
  FECHA_RESPUESTA DATE,           -- cuándo se respondió
  RESPONDIDO_POR  VARCHAR2(150)   -- COD_USUARIO del superadmin que respondió
);
-- "Respondido" se deriva de RESPUESTA IS NOT NULL; ESTADO se puede pasar a 'REVIEWED'/'DONE'.
