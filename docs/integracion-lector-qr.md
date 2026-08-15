# ConnectHub+ · Integración de lector de QR (check-in de asistentes)

**Para:** equipo de desarrollo del cliente (app lectora de QR)
**Objetivo:** que al escanear un QR de ConnectHub, la app confirme el acceso del
participante al evento y su estado quede marcado como **ingresado**.

---

## 1. Resumen

Su app lee el QR → envía el contenido a nuestro endpoint → recibe una respuesta
lista para mostrar en pantalla (**acceso permitido / ya registrado / denegado**)
con el nombre del participante y el evento. Nosotros marcamos la asistencia y
emitimos el certificado automáticamente.

- **Base URL:** `https://connecthub.fourstacklabs.com/api`
- **Autenticación:** header `X-API-Key: <clave>` (una clave por institución)
- **Formato:** JSON (`Content-Type: application/json`)

> La clave se genera desde el panel de ConnectHub:
> **Administración → Integraciones → Generate key**. Se muestra **una sola vez**;
> si se pierde, se revoca y se genera otra. Cada clave solo permite registrar
> accesos a los eventos de **su propia institución**.

---

## 2. Confirmar acceso (check-in)

```
POST /integracion/checkin
X-API-Key: chk_xxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "qrToken": "TCK-UZFW-U47J",
  "idEvento": 262          // OPCIONAL: puerta de un evento concreto
}
```

`qrToken` = el contenido tal cual del QR. Si su lector entrega el texto dentro de
una URL, también lo aceptamos: extraemos el token automáticamente.

### Respuestas

**Acceso permitido** (primer escaneo — se marca el ingreso):
```json
{
  "acceso": "PERMITIDO",
  "participante": { "nombre": "Francisco Andrade", "email": "f@x.com", "documento": "C0912345678" },
  "evento": { "id": 262, "titulo": "TECH INNOVATION SUMMIT 2026", "fecha": "2026-09-30" },
  "fechaIngreso": null,
  "certificado": "CERT-A1B2C3D4E5F6"
}
```

**Ya registrado** (segundo escaneo — informativo, no bloquea):
```json
{
  "acceso": "YA_REGISTRADO",
  "participante": { "nombre": "Francisco Andrade", "email": "f@x.com", "documento": "C0912345678" },
  "evento": { "id": 262, "titulo": "TECH INNOVATION SUMMIT 2026", "fecha": "2026-09-30" },
  "fechaIngreso": "2026-09-30 09:12"
}
```

**Denegado**:
```json
{ "acceso": "DENEGADO", "motivo": "Ticket not found" }
```
Motivos posibles: `Ticket not found` (QR inválido), `The ticket belongs to another
institution`, `The ticket is for a different event` (cuando se envía `idEvento`).

### Sugerencia de UI en su app
| `acceso` | Mostrar |
|---|---|
| `PERMITIDO` | ✅ verde — "Acceso confirmado" + nombre y evento |
| `YA_REGISTRADO` | ⚠️ ámbar — "Ya ingresó a las {fechaIngreso}" + nombre |
| `DENEGADO` | ⛔ rojo — el `motivo` |

---

## 3. Verificar sin marcar (opcional)

Para validar antes de abrir la puerta, sin registrar el ingreso:

```
POST /integracion/verificar
X-API-Key: chk_...
{ "qrToken": "TCK-UZFW-U47J" }
```
```json
{
  "valido": true,
  "yaRegistrado": false,
  "fechaIngreso": null,
  "participante": { "nombre": "...", "email": "...", "documento": "..." },
  "evento": { "id": 262, "titulo": "...", "fecha": "2026-09-30" }
}
```

---

## 4. Ejemplo (curl)

```bash
curl -X POST https://connecthub.fourstacklabs.com/api/integracion/checkin \
  -H "X-API-Key: chk_xxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"qrToken":"TCK-UZFW-U47J"}'
```

---

## 5. Errores de autenticación

| HTTP | Cuerpo | Causa |
|---|---|---|
| 401 | `Missing API key (header X-API-Key)` | No se envió la cabecera |
| 401 | `Invalid or revoked API key` | Clave incorrecta o revocada |

---

## 6. Notas de operación

- **Idempotente:** escanear dos veces no duplica nada; la segunda vez responde
  `YA_REGISTRADO` con la hora del primer ingreso.
- **Certificado:** al confirmar el acceso, el participante recibe automáticamente
  su certificado de asistencia (código en `certificado`).
- **Sin conexión:** si su app pierde red, reintente el mismo `qrToken` cuando
  vuelva — es seguro repetirlo.
- **Auditoría:** cada uso de la clave queda registrado (fecha del último uso y
  número de usos, visibles en el panel).
- **Formato del token:** `TCK-XXXX-XXXX` (alfabeto sin caracteres ambiguos).
