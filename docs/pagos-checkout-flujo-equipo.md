# Flujo de Checkout de pago — ConnectHub (app) ↔ Paymentez ↔ Servidor de pagos (Evento-back)

**Para:** Equipo de desarrollo del servidor de pagos (Evento-back / api-ligaprocorp)
**De:** Equipo ConnectHub (app móvil)
**Fecha:** 2026-07-25
**Asunto:** Confirmación de qué endpoint ejecuta la app al abrir/procesar el checkout y por qué NO se está registrando el código de pago en los datos del cliente.

---

> **ACTUALIZACIÓN (2026-07-25) — RESUELTO.** Se aplicó la Opción B (§5): la app volvió a
> llamar **directo** a su endpoint `POST /evento-usuario/eventos/:idEvento/checkout` (como
> iOS), y se corrigió el formato de `CLAVE_HASH` en ConnectHub para que su login del checkout
> (`/auth/login-user-password`) acepte claves creadas/reseteadas desde ConnectHub (mismo
> `salt:hash` pbkdf2-sha512 de `SHA256(clave)`). Este documento describe el diagnóstico que
> llevó a esa decisión; se conserva como referencia del flujo.

---

## 0. Resumen ejecutivo (TL;DR — diagnóstico original)

Ustedes tienen razón: **la app hoy NO está llamando a su endpoint** `POST /evento-usuario/eventos/:idEvento/checkout`.

- La app genera el checkout llamando a **nuestro propio backend ConnectHub**:
  `POST https://connecthub.fourstacklabs.com/api/public/pagos/checkout/iniciar`
  con body `{ "idEvento": <n> }` y `Authorization: Bearer <JWT de ConnectHub>`.
- Nuestro backend llama **directo** a Paymentez `init_reference` con una `dev_reference` **generada por nosotros** (`CH-XXXX-XXXX`), NO con el `codigoPago` de la institución.
- Resultado: el cobro **sí** se hace en Paymentez y **sí** queda en las tablas de ConnectHub (PAGOS, EVENTOS_USUARIOS) y se envía el correo de confirmación — **pero** como no pasamos por su endpoint, **nunca se ejecutan** `generarDevReference()` (`URL_COD_PAGO`) ni `procesarPagoInstitucion()` (`URL_PROCESO_PAGO`). Por eso **el código de pago no queda registrado en el sistema de la institución** ("los datos del cliente").

**Motivo por el que se cambió:** al llamar a su endpoint aparecía el error **`"token no proporcionado"`** (su `authMiddleware`, código `TOKEN_REQUIRED`). Esto pasa porque, tras usar "recuperar contraseña" en ConnectHub, la cuenta queda con la clave en **nuestro** formato y ya no se obtiene la sesión de pagos (JWT de Evento-back) que su endpoint exige. Sin ese JWT, su endpoint responde 401.

Lo que necesitamos definir con ustedes está en la **§5 (Opciones)**.

---

## 1. Lo que ejecuta la APP hoy (Android e iOS — es el mismo código)

### 1.1 ¿Cuándo se dispara?
La generación del checkout **NO** ocurre automáticamente al abrir la pantalla. Ocurre así:
1. El usuario abre la pantalla del evento → solo se pide el desglose de precio (`GET /public/pagos/resumen/:idEvento`). Esto **no** genera checkout.
2. El usuario toca **"Pagar $X"** → se abre un modal que pide datos de facturación (nombre/apellido, cédula/RUC/pasaporte, email de factura). Aún **no** se llama al API.
3. El usuario toca **"Guardar y continuar"** → se guarda el perfil y **recién ahí** se llama a la función que **genera el checkout**.

### 1.2 Request de GENERAR checkout (paso 1) — lo que realmente se ejecuta hoy
```
POST https://connecthub.fourstacklabs.com/api/public/pagos/checkout/iniciar
Headers:
  Content-Type: application/json
  Accept: application/json
  Authorization: Bearer <accessToken de ConnectHub (asistente)>
Body:
  { "idEvento": <number> }
```
> ⚠️ Este es **nuestro** backend, NO el de ustedes. El cupón se ignora en este flujo (se cobra el monto del evento).

### 1.3 Respuesta que la app espera
```json
{
  "yaAdquirido": false,
  "referencia": "CH-XXXX-XXXX",          // nuestra dev_reference (para confirmar/polling)
  "reference": "<referencia Paymentez>", // la que abre el widget: modal.open({ reference })
  "envMode": "stg" | "prod",
  "checkoutUrl": "<url o null>"
}
```

### 1.4 Apertura del widget de Paymentez
Con `reference` + `envMode`, la app abre el SDK oficial de Paymentez
(`payment_checkout_3.0.0.min.js`) dentro de un WebView (Android/iOS) y hace
`new PaymentCheckout.modal({ env_mode, locale, onResponse }).open({ reference })`.
El resultado del pago llega por `onResponse`.

### 1.5 Request de CONFIRMAR (paso 2) — al terminar el pago
```
POST https://connecthub.fourstacklabs.com/api/public/pagos/checkout/confirmar
Headers: Authorization: Bearer <accessToken de ConnectHub>
Body:
  { "idEvento": <number>, "referencia": "CH-XXXX-XXXX", "transactionId": "<id Paymentez>" }
```

---

## 2. Lo que hace NUESTRO backend con esa llamada (para que vean qué sí se ejecuta)

### 2.1 `iniciar` → Paymentez `init_reference` (payload exacto que enviamos)
```
POST https://ccapi.paymentez.com/v2/transaction/init_reference/   (stg: ccapi-stg)
Headers:
  Content-Type: application/json
  Auth-Token: base64("APP_CODE;UNIX_TS;sha256(APP_KEY+UNIX_TS)")   // credenciales SERVER de la institución
Body:
{
  "locale": "es",
  "order": {
    "amount": <total con IVA>,
    "description": "<TITULO del evento, máx 100 chars>",
    "dev_reference": "CH-XXXX-XXXX",     // ← GENERADA POR NOSOTROS (no es el codigoPago de la institución)
    "vat": <monto IVA>,
    "tax_percentage": <porcentaje>,
    "installments_type": -1,
    "currency": "USD"
  },
  "user": {
    "id": "<ID_CLIENTE>",
    "email": "<email de factura>",
    "name": "<nombre>",
    "last_name": "<apellido>"
  }
}
```
Credenciales SERVER = `INSTITUCIONES.USUARIO_PASARELA` / `CONTRASENA_PASARELA`
(fallback `APP_CODE_CHECKOUT` / `APP_KEY_CHECKOUT`). Env = `INSTITUCIONES.PAYMENT_ENVIROMENT`.

### 2.2 INSERT en nuestra tabla PAGOS (BD ConnectHub, misma Oracle)
Antes de pedir la reference:
```sql
INSERT INTO PAGOS
  (REFERENCIA, PASARELA, MONTO, MONEDA, ESTADO, TIPO_PAGO, ULTIMOS_4, MARCA_TARJETA,
   ES_GRATIS, FECHA_REGISTRO, ID_EVENTO, ID_CLIENTE, ORIGEN_PAGO, METODO_PAGO)
VALUES
  ('CH-XXXX-XXXX','paymentez', :monto,'USD','PENDIENTE','PENDIENTE', NULL, NULL,
   'N', SYSDATE, :idEvento, :idCliente, 'CHECKOUT', '0');
```
> `REFERENCIA` = nuestra `CH-...`, **no** el `codigoPago` de la institución.

### 2.3 `confirmar` → verify + emisión de entrada
1. `GET /v2/transaction/<transactionId>/` (verify server-side, credenciales SERVER).
2. Anti-fraude: `dev_reference == referencia` y `amount == PAGOS.MONTO`.
3. Si `APPROVED`: `UPDATE PAGOS SET ESTADO='APPROVED'...` + `INSERT INTO EVENTOS_USUARIOS (... QR_TOKEN ...)`.
4. Se dispara el correo de confirmación.

> **Nada de esto toca `URL_COD_PAGO` ni `URL_PROCESO_PAGO`.** Ahí está el faltante.

---

## 3. Lo que hace SU endpoint (Evento-back) — el que NO se está llamando

Rutas (código en `C:\proyectos\Evento-back`):
- `src/app.routes.ts` → mount `/evento-usuario`
- `src/modules/eventoUsuario/route.ts` → `POST /eventos/:idEvento/checkout` y `.../checkout/confirmar`
- `src/common/utils/dev_reference.utils.ts` → `generarDevReference()` + `procesarPagoInstitucion()`
- `src/modules/payments/providers/paymentez.ts` → `init_reference` / `debit` / `refund`

### 3.1 `POST /evento-usuario/eventos/:idEvento/checkout`
- **Auth:** `authMiddleware` → `Authorization: Bearer <JWT de Evento-back>` (si falta → **"token no proporcionado"**).
- **Body:** `{ "idUsuario": "<id>" }` (toma `idUsuario` del body, no del token).
- **Efecto crítico ANTES de responder:**
  1. `generarDevReference()` → **`axios.post(URL_COD_PAGO, { numId, nombres, valorFinal, itemPago, codItem })`** → toma `response.data.codigoPago`. **← Este es "el código de pago".**
  2. `INSERT INTO PAGOS (... REFERENCIA = codigoPago, ESTADO='PENDIENTE', ORIGEN_PAGO='CHECKOUT' ...)`.
  3. Paymentez `init_reference` usando ese `codigoPago` como `dev_reference`.
- **Devuelve:** `{ reference, envMode, urlCheckout }`.

### 3.2 `POST /evento-usuario/eventos/:idEvento/checkout/confirmar`
- **Body:** `{ idUsuario, transactionId, checkoutResponse }` (el objeto completo del widget).
- Valida `dev_reference` + `amount` contra la fila PAGOS PENDIENTE.
- Crea inscripción en `EVENTOS_USUARIOS`.
- **Efecto crítico:** `procesarPagoInstitucion()` → **`axios.post(URL_PROCESO_PAGO, { codPago, respuesta, descripcionRespuesta, idTransaccion, fecha, nombreFactura, emailFactura, tipoIdFactura, idFactura, iva, valorPago, valorDescuento, codItem, incluyeIva })`** → **este es el registro del pago en el sistema de la institución** ("los datos del cliente").

`URL_COD_PAGO` y `URL_PROCESO_PAGO` salen de la tabla `INSTITUCIONES`
(`src/modules/eventoUsuario/query.ts`, `obtenerDatosInstitucion`).

---

## 4. El GAP en una línea

> Como la app llama a **nuestro** `/public/pagos/checkout/iniciar` en vez de **su** `/evento-usuario/eventos/:idEvento/checkout`, **nunca se generan las llamadas a `URL_COD_PAGO` ni a `URL_PROCESO_PAGO`**, así que el pago existe en Paymentez y en ConnectHub pero **no queda registrado el código de pago en el sistema de la institución.**

---

## 5. Opciones para resolverlo (necesitamos su criterio)

### Opción A — La app vuelve a llamar SU endpoint `/evento-usuario/.../checkout`
Es el flujo correcto de su lado (genera código de pago + registra en la institución).
**Bloqueante a resolver juntos:** el error `"token no proporcionado"`. Tras "recuperar contraseña" en ConnectHub, no obtenemos el JWT de Evento-back.
Preguntas para ustedes:
- ¿Cómo obtenemos un JWT válido de Evento-back para una cuenta cuya clave se cambió por ConnectHub? (¿mismo hash de `USUARIOS`? ¿endpoint de login/refresh que podamos usar?)
- ¿Aceptarían una **autenticación servicio-a-servicio** para que **nuestro backend** llame a su checkout con un token de servicio (y así no dependemos de la sesión en el móvil)? Su endpoint ya toma `idUsuario` del body, lo que lo haría directo.

### Opción B — Replicar en NUESTRO backend las 2 llamadas a la institución
Mantendríamos el login por ConnectHub y, dentro de nuestro `iniciar`/`confirmar`, llamaríamos nosotros a `URL_COD_PAGO` y `URL_PROCESO_PAGO`.
Para esto necesitamos de ustedes el **contrato exacto**:
- `URL_COD_PAGO`: request/response exactos (campos, tipos, ejemplo real) y método de auth.
- `URL_PROCESO_PAGO`: payload exacto (confirmar los 14 campos de arriba), respuesta, e idempotencia.
- Cómo mapear `itemPago` / `codItem` / `valorDescuento` por evento/institución.

**Nuestra recomendación:** Opción A con auth servicio-a-servicio (menos duplicación y ustedes siguen siendo dueños del código de pago). Pero decidimos según lo que prefieran.

---

## 6. Datos de referencia
- **Backend ConnectHub (prod):** `https://connecthub.fourstacklabs.com/api` (Caddy quita `/api`).
- **Servidor de pagos (prod):** `https://api-ligaprocorp.ec:3443/api` (código = `Evento-back`).
- **Ejemplo de pago reciente por el flujo actual (quedó en ConnectHub, NO en la institución):**
  Paymentez `transactionId = DF-2073088`, monto $75, evento "TECH INNOVATION SUMMIT 2026".
- **Tablas compartidas (misma Oracle):** `USUARIOS`, `PAGOS`, `EVENTOS_USUARIOS`, `INSTITUCIONES`.
