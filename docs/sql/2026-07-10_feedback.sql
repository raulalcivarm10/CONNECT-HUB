-- Panel de ayuda y recomendaciones (aplicado 2026-07-10).
-- Los usuarios del panel envían sugerencias/necesidades; el superadmin las
-- revisa y gestiona por estado para planear mejoras futuras.
CREATE TABLE FEEDBACK (
  ID_FEEDBACK    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  USUARIO        VARCHAR2(150) NOT NULL,          -- COD_USUARIO del autor
  ID_INSTITUCION NUMBER,
  TIPO           VARCHAR2(20) DEFAULT 'SUGGESTION'
                 CHECK (TIPO IN ('SUGGESTION','PROBLEM','OTHER')),
  MENSAJE        VARCHAR2(2000) NOT NULL,
  ESTADO         VARCHAR2(20) DEFAULT 'NEW'
                 CHECK (ESTADO IN ('NEW','REVIEWED','PLANNED','DONE')),
  FECHA_REGISTRO DATE DEFAULT SYSDATE
);
CREATE INDEX IX_FEEDBACK_FECHA ON FEEDBACK (FECHA_REGISTRO);
