-- Cupones de descuento: soporte de PORCENTAJE + tope de usos por codigo.  (pendiente de aplicar)
--
-- Aditivo sobre EVENTO_CUPONES (creada el 2026-07-10 en 2026-07-10_cupones_iva.sql).
-- RETROCOMPATIBLE: los cupones existentes quedan como monto fijo (TIPO_DESCUENTO='M')
-- y sin tope (MAX_USOS NULL). MONTO_DESCUENTO pasa a ser "el valor del descuento":
--   TIPO_DESCUENTO='M' => valor en USD (como hasta hoy)
--   TIPO_DESCUENTO='P' => valor en PORCENTAJE (0.01 a 100)

ALTER TABLE EVENTO_CUPONES ADD (
  TIPO_DESCUENTO CHAR(1) DEFAULT 'M' CHECK (TIPO_DESCUENTO IN ('M','P')),
  MAX_USOS       NUMBER,            -- NULL = usos ilimitados; N = se agota tras N canjes
  USOS           NUMBER DEFAULT 0   -- lo incrementa la app movil en cada canje/compra
);

-- Nota app movil (equipo externo) — al canjear un codigo con ACTIVO='S':
--   1) Si TIPO_DESCUENTO='P': descontar MONTO_DESCUENTO % del precio del evento.
--      Si 'M': descontar MONTO_DESCUENTO USD.
--   2) Respetar MAX_USOS: rechazar el canje si USOS >= MAX_USOS; si se aplica, USOS = USOS + 1.
--   3) El descuento se aplica al COMPRAR EL EVENTO.
