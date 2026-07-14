-- Etapa 2: detalle del evento + expositores.  (pendiente de aplicar)
-- Basado en investigacion de plataformas de eventos/cursos (Sessionize, Coursera, Udemy, edX...).
-- Aditivo. El detalle es 1:1 con el evento; los expositores 1:N. Oracle 21c XE (IS JSON valido).
--
-- LIMITE DE PAGOS: ninguna columna aqui toca cobro/precio/cupon/inscripcion. La CONFIG de
-- certificado se guarda aqui, pero el computo de asistencia y la emision real los ejecuta la
-- app movil / backend externo (ver [[connecthub-payments-boundary]]).

-- 1) Detalle del evento (la "landing" formativa). 1:1 forzado con UNIQUE(ID_EVENTO).
CREATE TABLE EVENTO_DETALLE (
  ID_DETALLE        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ID_EVENTO         NUMBER NOT NULL UNIQUE,
  DESCRIPCION_CORTA VARCHAR2(500),
  DESCRIPCION_LARGA CLOB,
  QUE_APRENDERAS    CLOB CHECK (QUE_APRENDERAS IS JSON),   -- array JSON: experiencia/conocimiento a adquirir
  TEMAS             CLOB CHECK (TEMAS IS JSON),             -- array JSON: temas que se van a dar
  REQUISITOS        CLOB CHECK (REQUISITOS IS JSON),        -- array JSON de bullets
  PUBLICO_OBJETIVO  CLOB CHECK (PUBLICO_OBJETIVO IS JSON),  -- array JSON (opcional)
  BIBLIOGRAFIA      CLOB CHECK (BIBLIOGRAFIA IS JSON),      -- array JSON [{tipo,titulo,autor,url}]
  NIVEL             VARCHAR2(20) CHECK (NIVEL IN ('PRINCIPIANTE','INTERMEDIO','AVANZADO')),
  MODALIDAD         VARCHAR2(20) CHECK (MODALIDAD IN ('PRESENCIAL','ONLINE','HIBRIDO')),
  RITMO             VARCHAR2(20) CHECK (RITMO IN ('EN_VIVO','A_TU_RITMO')),
  DURACION_VALOR    NUMBER(5,1),
  DURACION_UNIDAD   VARCHAR2(15) CHECK (DURACION_UNIDAD IN ('HORAS','SEMANAS','SESIONES','DIAS')),
  ESFUERZO_HS_SEMANA NUMBER(4,1),
  IDIOMA            VARCHAR2(10) DEFAULT 'es',
  IMAGEN_URL        VARCHAR2(500),
  VIDEO_PROMO_URL   VARCHAR2(500),
  -- Config de certificado (solo configuracion; la emision/computo la hace la app/backend)
  CERT_HABILITADO   NUMBER(1) DEFAULT 0 CHECK (CERT_HABILITADO IN (0,1)),
  CERT_TIPO         VARCHAR2(20) CHECK (CERT_TIPO IN ('ASISTENCIA','PARTICIPACION','FINALIZACION')),
  CERT_ENTREGA      VARCHAR2(20) CHECK (CERT_ENTREGA IN ('DESCARGA','EMAIL','APP')),
  CERT_UMBRAL_ASISTENCIA NUMBER(3) CHECK (CERT_UMBRAL_ASISTENCIA BETWEEN 0 AND 100),
  FECHA_REGISTRO    DATE DEFAULT SYSDATE,
  CONSTRAINT FK_DETALLE_EVENTO FOREIGN KEY (ID_EVENTO) REFERENCES EVENTOS (ID_EVENTO)
);

-- 2) Expositores del evento (1:N). Embebidos en el evento (pragmatico; si luego se reutilizan
--    entre eventos se promueve a entidad + tabla puente sin romper esto).
CREATE TABLE EVENTO_EXPOSITORES (
  ID_EXPOSITOR      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ID_EVENTO         NUMBER NOT NULL,
  NOMBRE_COMPLETO   VARCHAR2(150) NOT NULL,
  CARGO             VARCHAR2(150),
  ORGANIZACION      VARCHAR2(150),
  TAGLINE           VARCHAR2(255),
  BIO               CLOB,
  BIBLIOGRAFIA      CLOB,
  FOTO_URL          VARCHAR2(500),
  EMAIL             VARCHAR2(150),                          -- INTERNO: nunca exponer en API/UI publica
  UBICACION         VARCHAR2(120),
  SITIO_WEB_URL     VARCHAR2(500),
  REDES_SOCIALES    CLOB CHECK (REDES_SOCIALES IS JSON),    -- JSON [{tipo,url}]
  ROL               VARCHAR2(20) DEFAULT 'EXPOSITOR'
                      CHECK (ROL IN ('EXPOSITOR','CO_EXPOSITOR','MODERADOR','KEYNOTE')),
  ES_DESTACADO      NUMBER(1) DEFAULT 0 CHECK (ES_DESTACADO IN (0,1)),
  ORDEN             NUMBER DEFAULT 0,
  IS_ACTIVE         NUMBER(1) DEFAULT 1 CHECK (IS_ACTIVE IN (0,1)),
  FECHA_REGISTRO    DATE DEFAULT SYSDATE,
  CONSTRAINT FK_EXPOSITOR_EVENTO FOREIGN KEY (ID_EVENTO) REFERENCES EVENTOS (ID_EVENTO)
);
CREATE INDEX IX_EXPOSITOR_EVENTO ON EVENTO_EXPOSITORES (ID_EVENTO, ORDEN);
