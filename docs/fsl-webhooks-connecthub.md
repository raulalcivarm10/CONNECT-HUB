# Webhooks FSL → ConnectHub — Documentación de integración

**Para:** equipo de la página principal / plataforma FSL (quien dispara los eventos)
**Receptor:** panel administrativo ConnectHub
**Endpoint:** `POST https://connecthub.fourstacklabs.com/api/fsl/webhooks`

---

## 1. Cómo funciona (visión general)

ConnectHub expone **un solo endpoint** que recibe eventos firmados desde la página
principal. Según el `type` del evento, hace una de dos cosas:

```
Página principal (FSL)                      ConnectHub
─────────────────────                       ──────────

[Cliente pide DEMO] ──── demo.requested ──────▶ envía correo con credenciales
                                                del entorno demo (5 usuarios,
                                                uno por rol) + link al panel.
                                                NO crea nada en la BD.

[Cliente PAGA] ───── subscription.created ────▶ 1. genera CÓDIGO DE CONEXIÓN
                                                2. crea la INSTITUCIÓN (aprobada)
                                                3. crea el usuario SYSTEM
                                                   (contraseña autogenerada,
                                                   cambio obligatorio al entrar)
                                                4. envía correo de bienvenida con
                                                   credenciales + código de
                                                   conexión + link al panel
```

- El **código de conexión** (ej. `uees2026`) se genera en ConnectHub (iniciales
  del nombre + año, único, máx. 20 caracteres). Es el código que la institución
  ingresa en la app móvil para ver sus eventos. **No lo envíes en el payload.**
- Todos los correos salen desde `ConnectHub <support@fourstacklabs.com>` en inglés.

---

## 2. Request

```
POST /api/fsl/webhooks
Content-Type: application/json
X-FSL-Event-Id: evt_9s2a1f4c            ← id ÚNICO del evento (idempotencia)
X-FSL-Signature: t=1783300000,v1=3b8f…  ← firma HMAC (ver §3)
```

## 3. Firma (obligatoria)

Secreto compartido: el mismo valor debe estar configurado en FSL y en ConnectHub
(en ConnectHub vive en `FSL_WEBHOOK_SECRET` del `.env` de producción; pedirlo al
administrador — **nunca** ponerlo en un repo).

**Algoritmo:**

1. `t` = timestamp unix en segundos (momento del envío).
2. `signedPayload` = `"${t}.${rawBody}"` — el body **crudo, byte a byte**.
3. `v1` = `HMAC_SHA256(secret, signedPayload)` en hex.
4. Header: `X-FSL-Signature: t=${t},v1=${v1}`.

ConnectHub rechaza si la firma no coincide (**401**) o si `|now − t| > 300 s`
(**400**, anti-replay). Se aceptan múltiples `v1` en el header (rotación de secreto).

### Ejemplo (Node.js)

```js
import { createHmac } from 'node:crypto';

const t = Math.floor(Date.now() / 1000);
const raw = JSON.stringify(payload);            // enviar EXACTAMENTE este string
const v1 = createHmac('sha256', SECRET).update(`${t}.${raw}`).digest('hex');

await fetch('https://connecthub.fourstacklabs.com/api/fsl/webhooks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-FSL-Event-Id': eventId,                  // único por evento
    'X-FSL-Signature': `t=${t},v1=${v1}`,
  },
  body: raw,
});
```

### Postman (Pre-request Script)

```js
const secret = pm.environment.get('FSL_SECRET');
const t = Math.floor(Date.now() / 1000);
const raw = pm.request.body.raw;                // body sin {{variables}} adentro
const v1 = CryptoJS.HmacSHA256(t + '.' + raw, secret).toString(CryptoJS.enc.Hex);
pm.request.headers.upsert({ key: 'X-FSL-Signature', value: 't=' + t + ',v1=' + v1 });
pm.request.headers.upsert({ key: 'X-FSL-Event-Id', value: 'evt_' + t });
```

---

## 4. Evento `demo.requested` — solicitud de demo

Cuando alguien cotiza/pide una demo en la página principal.

**Payload:**

```json
{
  "id": "evt_demo_001",
  "type": "demo.requested",
  "livemode": true,
  "data": {
    "requester": {
      "email": "prospecto@empresa.com",     // REQUERIDO — destino del correo
      "firstNames": "María José",           // opcional (personaliza el saludo)
      "lastNames": "Pérez"                  // opcional
    }
  }
}
```

**Qué hace ConnectHub:** envía al `requester.email` el correo *"Your ConnectHub
demo access"* con los 5 usuarios demo (uno por rol: SYSTEM, Administración,
Finanzas, Operaciones, Eventos), la contraseña común, el botón al panel y la
nota de entorno compartido. No modifica ninguna tabla de negocio.

**Respuesta OK:**

```json
{ "received": true, "demo": true, "correoEnviado": true }
```

## 5. Evento `subscription.created` — compra del servicio

Cuando el cliente paga la suscripción.

**Payload:**

```json
{
  "id": "evt_9s2a1f4c",
  "type": "subscription.created",
  "livemode": true,
  "data": {
    "institution": {
      "name": "Universidad de Especialidades Espíritu Santo",  // REQUERIDO
      "address": "Av. Samborondón km 2.5",                     // opcional
      "city": "Samborondón",                                   // opcional
      "country": "Ecuador"                                     // opcional
    },
    "admin": {
      "email": "sysadmin@uees.edu.ec",     // REQUERIDO — login y destino del correo
      "firstNames": "María José",          // REQUERIDO
      "lastNames": "Pérez"                 // opcional
    }
  }
}
```

**Qué hace ConnectHub (transaccional — todo o nada):**

1. Genera el **código de conexión** único a partir del nombre (`uees2026`).
2. Crea la institución en estado `APROBADA` (aprobada por `FSL-WEBHOOK`).
3. Crea el usuario **SYSTEM** con `admin.email` como login, contraseña
   autogenerada y cambio obligatorio en el primer ingreso.
4. Envía el correo de bienvenida con: usuario, contraseña temporal, **código de
   conexión** (para la app móvil) y botón *Sign in to ConnectHub*.

**Respuesta OK:**

```json
{
  "received": true,
  "idInstitucion": 105,
  "codigoConexion": "uees2026",
  "usuarioSistema": "SYSADMIN@UEES.EDU.EC",
  "correoEnviado": true
}
```

**Caso especial:** si ya existe un usuario con ese email de login, responde
`200 { "received": true, "note": "user_already_exists" }` y no crea nada
(el evento queda registrado; no se reintenta).

---

## 6. Idempotencia y reintentos

- Cada evento se deduplica por `X-FSL-Event-Id`. Reenviar el **mismo id**
  responde `200 { "received": true, "duplicate": true }` sin repetir nada
  (no se crea otra institución ni se reenvía el correo).
- Por eso los reintentos de FSL deben reusar el mismo `X-FSL-Event-Id`.
- Un `id` **nuevo** con los mismos datos SÍ se procesa de nuevo (en demo,
  reenvía el correo — útil si el prospecto lo pide otra vez).

## 7. Códigos de respuesta

| Código | Significado | ¿FSL reintenta? |
| --- | --- | --- |
| **200** | Procesado, duplicado o tipo desconocido (ignorado) | No |
| **400** | Timestamp fuera de rango (±5 min), JSON inválido o faltan campos requeridos | No — corregir |
| **401** | Firma inválida o ausente | No — revisar secreto |
| **500** | Error interno (ej. BD caída) | Sí, con backoff |
| **503** | Webhook sin configurar en el servidor | Sí |

Tipos de evento desconocidos responden `200 { "ignored": "<type>" }`
(compatibilidad hacia adelante).

## 8. Notas de operación

- Solo HTTPS. El endpoint es público pero **nada se procesa sin firma válida**.
- Todos los eventos recibidos quedan registrados en la tabla
  `FSL_WEBHOOK_EVENTS` (auditoría) con su estado:
  `PROCESSED`, `SKIPPED_USER_EXISTS`, `DEMO_SENT`, `DEMO_EMAIL_FAILED`.
- Si el SMTP fallara, `correoEnviado` llega `false` en la respuesta; en
  `subscription.created` la institución igual queda creada (el admin puede
  recuperar contraseña con "Forgot my password" en el login).
- Rotación de secreto: ConnectHub acepta varias firmas `v1` en el header,
  así que se puede firmar con el secreto viejo y el nuevo durante la transición.

## 9. Prueba rápida sin firmar (verificar que el endpoint vive)

```bash
curl -X POST https://connecthub.fourstacklabs.com/api/fsl/webhooks \
  -H 'Content-Type: application/json' -d '{}'
# → 401 {"error":"missing_signature"}   ← correcto: está vivo y exige firma
```
