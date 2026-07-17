# Checkout Paymentez — flujo de pago de la app móvil (paso a paso)

> Documento de integración: qué ejecuta la app, contra qué API, con qué datos y
> en qué orden, desde que el usuario toca **Pagar** hasta que queda inscrito.
> Última actualización: 2026-07-15.

## Servicios involucrados

| Servicio | Base URL | Rol |
|---|---|---|
| **Servicio de APIs de PAGOS** (externo, el mismo de la app Ionic) | `https://api-ligaprocorp.ec:3443/api` | **Dueño del checkout**: genera la referencia Paymentez, confirma el pago e **inscribe al usuario** |
| API ConnectHub (NestJS) | `http://localhost:4000` (dev) / `https://connecthub.fourstacklabs.com/api` (prod) | Catálogo, resumen de precio, tarjetas guardadas/débito directo, "Mis entradas" |
| Paymentez (SDK JS) | `cdn.paymentez.com/ccapi/sdk/payment_checkout_stable.min.js` | Modal de pago **dentro de la app** |

Configuración en `apps/mobile/.env`:

```
EXPO_PUBLIC_PAGOS_API_URL=https://api-ligaprocorp.ec:3443/api
EXPO_PUBLIC_PAGOS_LOGIN_PATH=/auth/login   # ← ruta del login del servicio (ajustable sin tocar código)
```

---

## Paso 0 — Sesión del servicio de pagos (login + refresh)

El servicio de pagos exige **su propio token** (`401 TOKEN_REQUIRED` sin él; el
JWT de ConnectHub **no** le sirve — "Token inválido"). El **login** devuelve:

```
{ "message": "Login exitoso",
  "usuario": { idUsuario, email, tipoUsuario, nombre, apellido, hasPassword, fotoUrl, perfilCompleto, onboardingCompleto },
  "token": "<access JWT ~1h — payload: idCliente, email, tipoUsuario>",
  "refreshToken": "<JWT ~30 días>" }
```

**Semántica de la sesión** (`src/api/pagos-session.ts`, enganchado en `store/auth.ts`):

1. Al hacer **login/registro en ConnectHub** (email + password), la app también hace
   login en el servicio de pagos y guarda `token` + `refreshToken` en la sesión
   (`SecureStore`/`localStorage`, claves `ch.pagos.token` / `ch.pagos.refresh`).
   Se restauran en el bootstrap y se limpian en el logout.
2. **`token` (access)** viaja SIEMPRE como `Authorization: Bearer` en los endpoints
   de pago. **`refreshToken` NUNCA** se envía en peticiones normales.
3. **401 → refresh transparente** (verificado contra el servicio):
   ```
   POST {PAGOS_API}/auth/refresh
   { "refreshToken": "..." }        ← campo confirmado
   ```
   Se actualizan ÚNICAMENTE `token` y `refreshToken` (el resto de la sesión se
   conserva, sin re-consultar el perfil) y la petición original se reintenta UNA
   vez. El usuario no nota la renovación.
4. **Single-flight**: si N peticiones reciben 401 a la vez, solo UNA llama a
   `/auth/refresh`; las demás esperan esa promesa y reutilizan el token nuevo.
5. **Si el refresh falla** (401/403/refresh inválido o expirado): se elimina la
   sesión de pagos y no se reintenta (sesión expirada). Un error de red NO borra
   la sesión (se puede reintentar después).

> ⚠️ **PENDIENTE (único bloqueante):** la **ruta del login** (Notion). Verificado
> que `/api/auth/refresh` existe, pero `/api/auth/login` y ~40 variantes dan 404.
> Al confirmarla, ajustar `EXPO_PUBLIC_PAGOS_LOGIN_PATH` en el `.env`.
>
> ⚠️ **Compatibilidad de contraseñas:** ConnectHub guarda `CLAVE_HASH` en formato
> `pbkdf2sha256$...`; los usuarios creados por la app Ionic usan otro formato (hex).
> Si el login del servicio valida con SU algoritmo, los usuarios registrados en
> ConnectHub podrían no validar ahí (y viceversa). Definir un formato común.
>
> ⚠️ **Google Sign-In:** sin password no hay login de pagos con credenciales —
> falta el contrato del login con Google de ese servicio (devuelve también token).

---

## Paso 1 — Pantalla de pago (`/checkout/{idEvento}`)

Al abrir, la app pinta el resumen con datos de **ConnectHub** (no del cliente):

```
GET {API_CH}/public/pagos/resumen/{idEvento}      Authorization: Bearer <token ConnectHub>
→ { titulo, subtotal, iva, total, idInstitucion, yaAdquirido, portadaUrl }

GET {API_CH}/public/pagos/tarjetas?idInstitucion= Authorization: Bearer <token ConnectHub>
→ tarjetas guardadas (para el método secundario)
```

UI: **botón principal = "Pagar $X" (Checkout Paymentez)**; abajo, separador
"o usa una tarjeta guardada" con el débito directo como método secundario.

## Paso 2 — Generar referencia (botón "Pagar $X")

```
POST {PAGOS_API}/evento-usuario/eventos/{idEvento}/checkout
Authorization: Bearer <token del servicio de pagos>
Content-Type: application/json

{ "idUsuario": "<ID_CLIENTE del usuario logueado>" }
```

**Respuesta REAL verificada contra el servicio (evento 149, 2026-07-15):**

```
{ "reference": "6576577224419700630", "envMode": "stg",
  "urlCheckout": "https://ccapi-stg.paymentez.com/v2/transaction/checkout?reference=..." }
```

Errores de negocio verificados: `401 {"message":"Token inválido"}` (sin sesión de
pagos) y `{"success":false,"message":"El usuario ya está suscrito a este evento"}`.

- `reference` → lo único que consume el SDK (`open({reference})`).
- `envMode` → `'stg' | 'prod'`, decide el entorno del SDK. **Dinámico**: sale de
  la configuración de la institución en el servicio; si cargas credenciales de
  producción, se consume producción sin tocar código.

Código: `iniciarCheckout(idEvento, idUsuario)` en `src/api/pagos.ts`.

## Paso 3 — Abrir el Checkout (SDK oficial, DENTRO de la app)

Con `{ reference, envMode }` la app renderiza `<CheckoutWidget/>`:

- **Web** (`checkout-widget.web.tsx`): carga el SDK del CDN y ejecuta el patrón
  oficial (idéntico al servicio Angular):
  ```js
  const modal = new PaymentCheckout.modal({
    env_mode: envMode,            // 'stg' | 'prod'
    locale: 'es',
    onOpen:    () => {},
    onClose:   () => resultado('cancelled'),
    onResponse: (resp) => resultado(resp),   // ← respuesta del pago
  });
  modal.open({ reference });
  ```
  Además cierra el modal en `popstate` (recomendación SPA de la doc).
- **Nativo iOS/Android** (`checkout-widget.tsx`): un `Modal` + `WebView` hospeda
  un documento HTML con el **mismo SDK** y puentea `onResponse` a React Native
  vía `postMessage`. Mismo flujo, misma referencia, dentro de la app.

El usuario paga **sin salir de la app** (no hay enlaces ni pestañas externas).

## Paso 4 — Respuesta del SDK

`onResponse` entrega (formato oficial):

```
{ "transaction": { "status": "success", "id": "DF-2064384", "status_detail": 3 } }
```

- `transaction.id` → **transactionId** (solo se usa como puntero; la decisión
  real la toma el backend re-consultando a Paymentez).
- `status: success | pending | failure`; `status_detail 3` = pagado.
- Si el usuario cierra sin pagar → `onClose` → la app vuelve a la pantalla de pago.

## Paso 5 — Confirmar el pago (procesa e inscribe)

```
POST {PAGOS_API}/evento-usuario/eventos/{idEvento}/checkout/confirmar
Authorization: Bearer <token del servicio de pagos>
Content-Type: application/json

{
  "idUsuario": "<ID_CLIENTE>",
  "transactionId": "DF-2064384",
  "checkoutResponse": { ...respuesta cruda del SDK... }
}
```

El **servicio de pagos** valida contra Paymentez (verify), registra el pago y
**crea la inscripción** del usuario al evento (con QR incluido).

**Respuesta REAL verificada (pago STG aprobado DF-2064627):**

```
{ "message": "Pago realizado e inscripción confirmada",
  "data": { "idEvento": 149, "nombreEvento": "STARTUP NETWORKING NIGHT", "transaccionId": "DF-2064627" },
  "success": true }
```

En BD el servicio escribió: `EVENTOS_USUARIOS` (con `QR_TOKEN` formato TCK-XXXX-XXXX,
igual al nuestro) y `PAGOS` (`ESTADO='APPROVED'`, `REFERENCIA` numérica propia del
servicio, `TRANSACCION_ID`). "Mis entradas" de ConnectHub lo muestra sin cambios.

Código: `confirmarCheckout(idEvento, idUsuario, transactionId, checkoutResponse)`.

## Paso 6 — Cierre en la app

Si `success === true`:
1. Invalida las queries `mis-entradas` y `resumen-pago` (ConnectHub lee la misma BD Oracle).
2. Navega a **Mis Entradas** (`/(tabs)/entradas`) donde aparece la entrada/QR.

Errores manejados: `cancelled` (sin alerta, vuelve), `pending` (aviso "pago
pendiente"), `failure`/`success:false` (alerta "pago rechazado" con el mensaje
del servicio), fallo de red (alerta genérica, `paying` se libera siempre).

## Método secundario — tarjeta guardada (débito directo)

Sin cambios: usa el API ConnectHub (`POST /public/pagos/debito` con tarjeta
tokenizada, verificado E2E contra Paymentez STG). Es el bloque inferior de la
pantalla.

---

## Diagrama

```
App (tap "Pagar $X")
  │ POST {PAGOS_API}/evento-usuario/eventos/{id}/checkout   {idUsuario} + Bearer(pagos)
Servicio de pagos → Paymentez init_reference
  │ ← { reference, envMode }
App
  │ PaymentCheckout.modal({env_mode}) . open({reference})    ← DENTRO de la app
Usuario paga en el modal
  │ onResponse → { transaction: { id, status } }
App
  │ POST {PAGOS_API}/.../checkout/confirmar   {idUsuario, transactionId, checkoutResponse} + Bearer(pagos)
Servicio de pagos → verifica en Paymentez → registra pago → INSCRIBE
  │ ← { success: true, data }
App → refresca "Mis entradas" → muestra la entrada/QR
```

## Archivos

| Archivo | Qué hace |
|---|---|
| `apps/mobile/src/api/pagos-session.ts` | Login/token/persistencia de la sesión del servicio de pagos |
| `apps/mobile/src/api/pagos.ts` | `iniciarCheckout` + `confirmarCheckout` (rutas externas) + tarjetas/débito (ConnectHub) |
| `apps/mobile/src/features/pagos/checkout-shared.ts` | Tipos + mapeo del `onResponse` del SDK |
| `apps/mobile/src/features/pagos/checkout-widget.web.tsx` | SDK modal en web (patrón Angular) |
| `apps/mobile/src/features/pagos/checkout-widget.tsx` | SDK en WebView (nativo, in-app) |
| `apps/mobile/src/app/checkout/[idEvento].tsx` | Pantalla: resumen + Checkout principal + tarjeta secundaria |
| `apps/mobile/src/store/auth.ts` | Dispara el login de pagos junto al login/registro de ConnectHub |

## Pendientes

1. **Ruta real del login** del servicio de pagos → poner en `EXPO_PUBLIC_PAGOS_LOGIN_PATH`.
2. Definir el caso **Google Sign-In** (no hay password para el login de pagos —
   ¿el servicio acepta id_token de Google o un intercambio de token?).
3. Alinear el **formato de `CLAVE_HASH`** entre ConnectHub (`pbkdf2sha256$…`) y
   la app Ionic (hex) para que el mismo usuario valide en ambos logins.
4. Nota STG: con las credenciales demo (institución 104) el modal del SDK falla
   (Paymentez STG devuelve 500 en `init_checkout`); con credenciales de
   **producción** (como la app Angular) el modal funciona. El backend propio
   (`/public/pagos/checkout/*`) queda como referencia verificada del flujo.
