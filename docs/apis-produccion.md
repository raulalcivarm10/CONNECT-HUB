# APIs de Producción — CONNECT-HUB

> Inventario de todas las APIs en **producción**. Fuente: rutas mapeadas por el API NestJS al arrancar en el servidor (2026-07-17). `https://connecthub.fourstacklabs.com`.

---

## Base URLs y routing

| Servicio | URL base (prod) | Notas |
|---|---|---|
| **API ConnectHub** | `https://connecthub.fourstacklabs.com/api` | Caddy: `/api/*` → contenedor `api:4000` (quita el prefijo `/api`). |
| **Web (panel + landing)** | `https://connecthub.fourstacklabs.com` | Caddy: resto → `web:3000`. Ej: `/c/:codigo` (verificación cert), `/panel/*` (admin), `/login`. |
| **NAS (imágenes, externo)** | `https://api-ligaprocorp.ec:3443/api` | No es ConnectHub. Fotos/planos/logos. |
| **Pasarela de pagos (externo)** | `https://api-ligaprocorp.ec:3443/api` | Login del asistente + checkout Nuvei. No es ConnectHub. |
| **Oracle (BD)** | `154.38.187.235:1521/XEPDB1` | Compartida dev+prod. |

> Ejemplo: el endpoint `/public/auth/login` en prod es `https://connecthub.fourstacklabs.com/api/public/auth/login`.

## Modelo de autenticación

| Auth | Cómo | Dónde |
|---|---|---|
| **Pública** | sin token | catálogo, certificados, resolver código, webhook (firma). |
| **Asistente** (app) | `Authorization: Bearer <accessToken>` (`aud:asistente`, `typ:access`) | todo lo del usuario en `/public/*`. Access 15 min, refresh 30 días (en el body, no cookie). |
| **Admin** (panel) | `Authorization: Bearer <token admin>` (secreto distinto) | rutas sin prefijo `/public`. |

---

# 1. API PÚBLICA (app móvil) — `…/api/public/*`

### 1.1 Auth de asistente — `/public/auth`
Rate-limit 5/min por IP en los POST de credenciales.

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/public/auth/register` | pública | Registro email/clave. |
| POST | `/public/auth/login` | pública | Login email/clave (vía servicio de pagos + canje). |
| POST | `/public/auth/google` | pública | Login/registro con Google `idToken`. |
| POST | `/public/auth/apple` | pública | **Login/registro con Apple** (identity token, nativo). |
| POST | `/public/auth/pagos-exchange` | pública | Canjea el token del servicio de pagos por sesión ConnectHub. |
| POST | `/public/auth/verify` | pública | Verifica email con token. |
| POST | `/public/auth/refresh` | pública | Renueva tokens (refresh en el body). |
| POST | `/public/auth/forgot` | pública | Envía enlace de reset (no cambia la clave). |
| POST | `/public/auth/reset` | pública | Confirma reset de contraseña con el token. |
| GET | `/public/auth/me` | asistente | Perfil del asistente autenticado. |
| PATCH | `/public/auth/onboarding` | asistente | Completar/actualizar onboarding. |
| DELETE | `/public/auth/me` | asistente | **Eliminar cuenta** (anonimiza + retiene finanzas) — Apple 5.1.1v. |

### 1.2 Instituciones — `/public/instituciones`
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/public/instituciones/resolver?codigo=` | pública | Resuelve el código de conexión → institución. |
| GET | `/public/instituciones/:id/logo` | pública | Logo de la institución. |
| GET | `/public/instituciones/mias` | asistente | Mis instituciones vinculadas. |
| POST | `/public/instituciones/vincular` | asistente | Vincular otra institución por código. |

### 1.3 Catálogo de eventos — `/public/eventos`
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/public/eventos?codigo=&q=&categoria=&page=&size=` | pública | Lista paginada/filtrada (solo publicados). |
| GET | `/public/eventos/destacados?codigo=` | pública | Destacados (hero). |
| GET | `/public/eventos/:id` | pública | Detalle compuesto (base + detalle + días + expositores + workshops). |
| POST | `/public/eventos/:id/inscripcion` | asistente | Inscribirse (gratis → entrada directa; idempotente). |

### 1.4 Mis entradas / eventos
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/public/mis-entradas` | asistente | Entradas con QR. |
| GET | `/public/mis-eventos` | asistente | Eventos adquiridos (agenda). |
| GET | `/public/entradas/:id/qr` | asistente | QR de una entrada. |
| POST | `/public/entradas/validar` | check-in | Valida el QR (marca `ASISTIO`, emite certificado). |

### 1.5 Certificados (verificación pública)
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/public/certificados/:codigo` | pública | Datos del certificado por código (verificación). |
| GET | `/public/certificados/:codigo/imagen` | pública | Imagen PNG del certificado (render on-demand; OG de LinkedIn). |
| GET | `/public/certificados` | pública | Verificación por query. |

### 1.6 Pagos — `/public/pagos`
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/public/pagos/resumen/:idEvento` | asistente | Resumen de precio (subtotal, IVA, total). |
| POST | `/public/pagos/cupon/:idEvento` | asistente | Valida un cupón de descuento. |
| POST | `/public/pagos/checkout` | asistente | Inicia checkout. |
| POST | `/public/pagos/checkout/iniciar` | asistente | Inicia el checkout contra la pasarela. |
| POST | `/public/pagos/checkout/confirmar` | asistente | Confirma el checkout (transactionId). |
| POST | `/public/pagos/debito` | asistente | Pago con tarjeta guardada (débito directo). |
| POST | `/public/pagos/confirmacion-email` | asistente | Envía el correo de confirmación de pago. |
| GET | `/public/pagos/estado/:referencia` | asistente | Estado de un pago. |
| GET | `/public/pagos/tarjetas` | asistente | Tarjetas guardadas. |
| POST | `/public/pagos/tarjetas` | asistente | Guardar tarjeta (tokenizada). |
| DELETE | `/public/pagos/tarjetas/:id` | asistente | Eliminar tarjeta guardada. |
| POST | `/public/pagos/webhook` | firma | Webhook de la pasarela (confirma pendientes, idempotente). |

### 1.7 Comunidad — `/public/comunidad`
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/public/comunidad` | asistente | Muro de la comunidad del evento (gate por ticket). |
| POST | `/public/comunidad` | asistente | Publicar mensaje. |
| POST | `/public/comunidad/ingresar` | asistente | Entrar a la comunidad. |
| POST | `/public/comunidad/salir` | asistente | Salir de la comunidad. |
| GET | `/public/comunidad/mis-comunidades` | asistente | Hub de comunidades a las que entré. |

### 1.8 Conexiones (networking) — `/public/conexiones`
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/public/conexiones` | asistente | Mis conexiones. |
| GET | `/public/conexiones/solicitudes` | asistente | Solicitudes pendientes. |
| POST | `/public/conexiones/solicitar` | asistente | Enviar solicitud de conexión. |
| POST | `/public/conexiones/responder` | asistente | Aceptar/rechazar solicitud. |

### 1.9 Chats privados — `/public/chats`
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/public/chats` | asistente | Hub de chats privados. |
| POST | `/public/chats/abrir` | asistente | Abrir/crear chat 1-a-1. |
| GET | `/public/chats/:idChat/mensajes` | asistente | Mensajes de un chat. |
| POST | `/public/chats/:idChat/mensajes` | asistente | Enviar mensaje. |

### 1.10 Perfil de asistente — `/public/perfil`
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/public/perfil/me` | asistente | Mi perfil de networking. |
| PATCH | `/public/perfil/me` | asistente | Editar mi perfil (bio, profesión, privacidad…). |
| POST | `/public/perfil/me/foto` | asistente | Subir/cambiar foto. |
| GET | `/public/perfil/:idCliente` | asistente | Ver perfil de otro (respeta privacidad). |

### 1.11 Push
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/public/push/registrar` | asistente | Registrar token de push (Expo). |

---

# 2. API ADMIN (panel) — `…/api/*` (sin prefijo `/public`)

> Requieren token **admin** (guard distinto). Es el backend del panel existente.

### 2.1 Auth admin — `/auth`
`POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/refresh` · `POST /auth/recuperar` · `POST /auth/cambiar-clave`

### 2.2 Eventos — `/eventos`
`GET|POST /eventos` · `PATCH|DELETE /eventos/:id` · `GET /eventos/agenda` · `PATCH /eventos/:id/destacar` · `POST|DELETE /eventos/:id/imagen` · `GET|PUT /eventos/:id/detalle` · `GET /eventos/:id/dias` · `GET|POST /eventos/:id/expositores` · `PATCH|DELETE /eventos/:id/expositores/:idExp` (+ `/imagen`) · `GET|POST /eventos/:id/cupones` · `DELETE /eventos/:id/cupones/:idCupon`

**Certificados (admin):** `GET|POST /eventos/:id/certificados/plantilla` · `GET /eventos/:id/certificados/plantilla/imagen` · `GET /eventos/:id/certificados/asistentes` · `POST /eventos/:id/certificados/generar`

### 2.3 Instituciones — `/instituciones`
`GET|POST /instituciones` · `PATCH|DELETE /instituciones/:id` · `GET /instituciones/:id/perfil` · `POST|DELETE /instituciones/:id/logo` · `POST /instituciones/:id/{aprobar,rechazar,suspender,reactivar}`

### 2.4 Locales / salones / subsalones / configuraciones
`GET|POST /locales` · `PATCH|DELETE /locales/:id` · `POST|DELETE /locales/:id/plano` · `GET /locales/:id/salones` · `POST /salones` · `PATCH|DELETE /salones/:id` · `POST|DELETE /salones/:id/imagen` · `GET /salones/:id/{subsalones,configuraciones}` · `POST /subsalones` · `PATCH|DELETE /subsalones/:id` (+ `/imagen`) · `POST /configuraciones` · `PATCH|DELETE /configuraciones/:id` · `POST|DELETE /configuraciones/:id/imagen`

### 2.5 Usuarios / roles
`GET|POST /usuarios` · `PATCH|DELETE /usuarios/:cod` · `PATCH /usuarios/:cod/{estado,roles}` · `GET /roles`

### 2.6 Reportes / finanzas / feedback / auditoría
`GET /reportes/asistencia` · `GET /reportes/asistencia/:idEvento/inscritos` · `GET /finanzas/resumen` · `GET|POST /feedback` · `PATCH /feedback/:id/{estado,responder}` · `GET /auditoria`

### 2.7 Infra
`GET /health` (público) · `POST /fsl/webhooks` (firma HMAC)

---

# 3. Servicios externos (no ConnectHub)

| Servicio | Base | Endpoints usados |
|---|---|---|
| **NAS** | `https://api-ligaprocorp.ec:3443/api` | Subida/lectura de imágenes (fotos, planos, logos). |
| **Pasarela de pagos** | `https://api-ligaprocorp.ec:3443/api` | `/auth/login-user-password`, `/auth/register-google`, `/auth/refresh` (login del asistente) + checkout Nuvei. |

---

# 4. Notas de producción

- **Secretos configurados en el `.env` de prod:** `JWT_ASISTENTE_SECRET`, `JWT_ASISTENTE_REFRESH_SECRET`, `GOOGLE_CLIENT_IDS`, `APPLE_CLIENT_IDS`, `PAGOS_API_URL`. Pendiente opcional: `PAGOS_JWT_SECRET` (sin él, `pagos-exchange` usa introspección contra el servicio externo).
- **Swagger:** `https://connecthub.fourstacklabs.com/api/docs` (documentación viva de la API).
- **Health:** `https://connecthub.fourstacklabs.com/api/health`.
- **Rate-limit:** 5 req/min por IP real (trustProxy) en los endpoints de auth.
- **App móvil** apunta a esta API vía `EXPO_PUBLIC_API_URL=https://connecthub.fourstacklabs.com/api` (en `eas.json`).
