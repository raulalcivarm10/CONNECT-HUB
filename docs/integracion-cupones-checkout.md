# Cupones de descuento en el checkout — cambio requerido en Evento-back

**Para:** equipo de Evento-back
**De:** ConnectHub
**Fecha:** 2026-08-18

## El problema

La app móvil envía el código de cupón al pedir la referencia del checkout, pero
el servicio lo descarta y genera la referencia **siempre por el precio completo
del evento**. Resultado real (probado en producción): el usuario aplica un cupón
del 50% sobre un evento de $80, la app le muestra "Pay $40.00", y el widget de
Paymentez abre cobrando **USD $80.00**.

Evidencia en el código actual de `Evento-back` (rama principal):

- `src/modules/eventoUsuario/service.ts` — el monto del checkout se arma con
  `amount: precioEvento` (líneas ~216 y ~308). No existe ninguna referencia a
  cupones en todo el repositorio.

## Lo que la app ya envía (sin cambios pendientes de nuestro lado)

```
POST /evento-usuario/eventos/{idEvento}/checkout
Authorization: Bearer <token del servicio>
{
  "idUsuario": "<id>",
  "cupon": "SUMMIT002"        // opcional; solo viaja si el usuario aplicó uno
}
```

## Lo que debe hacer el servicio cuando llega `cupon`

1. **Buscarlo en `EVENTO_CUPONES`** (tabla compartida que ya existe; la gestiona
   el panel de ConnectHub):

   ```sql
   SELECT CODIGO, MONTO_DESCUENTO, TIPO_DESCUENTO, MAX_USOS, USOS, ACTIVO
     FROM EVENTO_CUPONES
    WHERE ID_EVENTO = :idEvento AND UPPER(CODIGO) = UPPER(:cupon)
   ```

2. **Validarlo**: existe, `ACTIVO = 'S'`, y `MAX_USOS IS NULL OR USOS < MAX_USOS`.
   Si no es válido → generar la referencia por el total sin descuento (o
   devolver error; a criterio del equipo, pero no cobrar de más en silencio).

3. **Calcular el descuento sobre el TOTAL CON IVA** (la misma aritmética que ve
   el usuario en la app):

   - `TIPO_DESCUENTO = 'P'` → porcentaje: `bruto = total * MONTO_DESCUENTO / 100`
   - `TIPO_DESCUENTO = 'M'` (o nulo) → monto fijo: `bruto = MONTO_DESCUENTO`
   - `descuento = MIN(bruto, total)` · `totalFinal = MAX(0, total - descuento)`
   - Ojo: `EVENTOS.MONTO_IVA` guarda el **porcentaje** de IVA (15 = 15%), no un
     monto.

4. **Generar la referencia de Paymentez con `totalFinal`**, no con
   `precioEvento`.

5. **Consumir el uso al aprobarse el pago** (no al validar), de forma atómica:

   ```sql
   UPDATE EVENTO_CUPONES
      SET USOS = NVL(USOS, 0) + 1
    WHERE ID_EVENTO = :idEvento AND UPPER(CODIGO) = UPPER(:cupon)
      AND NVL(ACTIVO,'S') = 'S'
      AND (MAX_USOS IS NULL OR NVL(USOS, 0) < MAX_USOS)
   ```

   Si `rowsAffected = 0`, el cupón se agotó entre la referencia y el cobro.

## Seguridad — importante

**El monto nunca debe viajar desde la app.** El cliente envía solo el CÓDIGO y
el servidor calcula. Un endpoint que acepte el valor final desde el dispositivo
permite pagar cualquier cantidad con una app modificada.

## Lo que NO les llega (ya resuelto en ConnectHub)

Los cupones que cubren el **100% del total** no pasan por el checkout: ConnectHub
los valida, los consume y registra la inscripción directamente (no hay nada que
cobrar). A su servicio solo llegarán cupones **parciales**.

Cualquier duda, quedamos atentos.
