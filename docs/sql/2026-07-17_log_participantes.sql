-- Registro de CONTROL de participantes al eliminar una cuenta.
-- El borrado de cuenta anonimiza al usuario (nombre/correo → NULL), lo que
-- borraba el rastro de QUIÉN participó en cada evento. Para no perder el
-- inventario de asistentes, ANTES de anonimizar se guarda aquí un snapshot del
-- participante y de cada evento en el que estaba inscrito. Solo lectura interna
-- (control/inventario/legal); no se expone a otros usuarios.
CREATE TABLE LOG_PARTICIPANTES_EVENTO (
  ID_LOG            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ID_CLIENTE        VARCHAR2(36),
  ID_EVENTO         NUMBER,
  NOMBRE            VARCHAR2(100),
  APELLIDO          VARCHAR2(100),
  EMAIL             VARCHAR2(255),
  TIPO_ID           VARCHAR2(5),
  NUMERO_ID         VARCHAR2(30),
  TITULO_EVENTO     VARCHAR2(500),
  ASISTIO           CHAR(1),
  ESTADO            VARCHAR2(30),
  FECHA_ENTRADA     TIMESTAMP,
  FECHA_ELIMINACION TIMESTAMP DEFAULT SYSTIMESTAMP
);

CREATE INDEX IX_LOG_PART_EVENTO ON LOG_PARTICIPANTES_EVENTO (ID_EVENTO);
