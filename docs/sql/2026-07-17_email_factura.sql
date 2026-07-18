-- Correo de FACTURACIÓN del asistente (datos de facturación del pago).
-- Puede ser distinto al correo de la cuenta: la cuenta puede pertenecer a una
-- empresa u otra persona. Es el correo al que se envía el comprobante/proceso
-- del pago. Nombre y apellido de USUARIOS siguen siendo del DUEÑO (certificado).
ALTER TABLE USUARIOS ADD (EMAIL_FACTURA VARCHAR2(255));
