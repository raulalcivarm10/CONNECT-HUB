-- Eventos: multi-día con horario POR DÍA + workshops como evento hijo.  (pendiente de aplicar)
--
-- Aditivo y RETROCOMPATIBLE con la app móvil:
--   * EVENTOS.FECHA_EVENTO sigue siendo la fecha de INICIO; HORA_INICIO/HORA_FIN = las del primer día.
--   * FECHA_FIN = fecha del último día. Ambas se sincronizan desde EVENTO_HORAS (min/max).
--   * El detalle real de horarios por día vive en EVENTO_HORAS.
--
-- MODELO:
--   - Un evento tiene 1+ días, cada uno con su propio horario (día 1: 09-17, día 2: 10-13) -> EVENTO_HORAS.
--   - Un workshop es un EVENTO más, con ID_EVENTO_PADRE apuntando al evento principal.
--   - Validación de choque de espacio: evento principal (sin padre) SÍ se valida; evento hijo NO se valida
--     (ni contra el padre ni contra otros hijos) — la aplica la app móvil la regla de "inscríbete al padre".

-- 1) Fecha fin (último día) del evento.
ALTER TABLE EVENTOS ADD (FECHA_FIN DATE);
UPDATE EVENTOS SET FECHA_FIN = FECHA_EVENTO WHERE FECHA_FIN IS NULL;
COMMIT;

-- 2) Evento padre (workshops). NULL = evento principal; con valor = es un hijo/workshop.
ALTER TABLE EVENTOS ADD (ID_EVENTO_PADRE NUMBER);
ALTER TABLE EVENTOS ADD CONSTRAINT FK_EVENTO_PADRE
  FOREIGN KEY (ID_EVENTO_PADRE) REFERENCES EVENTOS (ID_EVENTO);
CREATE INDEX IX_EVENTOS_PADRE ON EVENTOS (ID_EVENTO_PADRE);

-- 3) Horario por día. Un registro por cada día del evento, con su rango horario propio.
CREATE TABLE EVENTO_HORAS (
  ID_HORA        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ID_EVENTO      NUMBER NOT NULL,
  FECHA          DATE NOT NULL,
  HORA_INICIO    VARCHAR2(20) NOT NULL,
  HORA_FIN       VARCHAR2(20) NOT NULL,
  ORDEN          NUMBER DEFAULT 0,
  CONSTRAINT FK_HORA_EVENTO FOREIGN KEY (ID_EVENTO) REFERENCES EVENTOS (ID_EVENTO),
  CONSTRAINT UQ_HORA_EVENTO_FECHA UNIQUE (ID_EVENTO, FECHA)
);
CREATE INDEX IX_HORA_EVENTO ON EVENTO_HORAS (ID_EVENTO);

-- Backfill: cada evento actual es de un solo día -> una fila en EVENTO_HORAS con su horario.
INSERT INTO EVENTO_HORAS (ID_EVENTO, FECHA, HORA_INICIO, HORA_FIN)
SELECT ID_EVENTO, FECHA_EVENTO, NVL(HORA_INICIO,'00:00'), NVL(HORA_FIN,'23:59')
  FROM EVENTOS
 WHERE HORA_INICIO IS NOT NULL;
COMMIT;

-- Nota app móvil (equipo externo): FECHA_EVENTO/HORA_INICIO/HORA_FIN siguen siendo el primer día
-- (compatibilidad). Para mostrar el horario completo, leer EVENTO_HORAS por ID_EVENTO.
-- Un workshop es un EVENTO con ID_EVENTO_PADRE != NULL (mismo precio/cupones/inscripción que un evento).
