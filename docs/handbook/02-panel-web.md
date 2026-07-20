# Panel administrativo (Next.js) — `apps/web`

Ultima actualizacion: 2026-07-19

Este documento describe de forma exhaustiva la aplicacion **`apps/web`** del monorepo CONNECT-HUB: el panel administrativo web (Next.js App Router) y, en el mismo despliegue, las **paginas publicas legales y de soporte** que exigen Apple App Store y Google Play.

Todo lo que aparece aqui esta verificado leyendo el codigo real del repositorio. Los nombres de variables de entorno se documentan, **nunca sus valores**.

---

## 1. Identidad de la aplicacion

| Dato | Valor |
| --- | --- |
| Ruta en el repo | `C:/proyectos/CONNECT-HUB/apps/web` |
| Nombre del paquete | `connect-hub-web` (`apps/web/package.json`) |
| Framework | Next.js `^16.0.0` — **App Router**, React `^19.2.0` |
| Lenguaje | TypeScript `^5.8.3`, modo `strict: true` |
| Estilos | Tailwind CSS `^4.1.0` via `@tailwindcss/postcss` (sin `tailwind.config`; los tokens viven en `globals.css`) |
| Graficas | `recharts` `^3.0.0` |
| QR | `qrcode` `^1.5.4` (gafetes imprimibles) |
| Dependencias declaradas pero **no usadas hoy** | `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `zod` (el codigo real usa `useState` + `fetch` propio) |
| Salida de build | `output: 'standalone'` (`apps/web/next.config.ts`) |
| Alias de imports | `@/*` → `./src/*` (`tsconfig.json`) |
| URL de produccion | https://connecthub.fourstacklabs.com |
| Puerto en dev | 3000 (`next dev -p 3000 -H 0.0.0.0`) |

El panel **no tiene backend propio**: no existe ninguna Route Handler (`app/api/**`) ni Server Action. Salvo la landing de certificados (`/c/[codigo]`, que hace un `fetch` en el servidor), todo es cliente que habla con la API NestJS (`apps/api`).

### Arbol de `apps/web`

```
apps/web/
├── Dockerfile              # multi-stage: deps → dev / build → prod (standalone)
├── .dockerignore           # node_modules, .next, *.log, .env
├── next.config.ts          # output: 'standalone'
├── postcss.config.mjs      # plugin @tailwindcss/postcss
├── tsconfig.json           # paths @/* → ./src/*
├── package.json
├── public/                 # vacio (.gitkeep); el icono va en src/app/icon.svg
└── src/
    ├── app/                # App Router (ver mapa de rutas)
    ├── components/         # UI compartida
    └── lib/                # cliente HTTP, contextos, tipos, i18n
```

---

## 2. Mapa completo de rutas (App Router)

Cada carpeta bajo `src/app` con `page.tsx` es una ruta. **Solo hay dos layouts**: el raiz (`src/app/layout.tsx`) y el del panel (`src/app/panel/layout.tsx`).

### 2.1 Zona publica (sin sesion)

| Ruta | Archivo | Render | Que es |
| --- | --- | --- | --- |
| `/privacy` | `app/privacy/page.tsx` | Server Component estatico | Politica de privacidad (exigida por Apple y Google) |
| `/eliminar-cuenta` | `app/eliminar-cuenta/page.tsx` | Server Component estatico | Instrucciones de eliminacion de cuenta (exigida por Apple y Google) |
| `/verify` | `app/verify/page.tsx` | Client | Confirma el correo de un asistente desde el enlace del email |
| `/reset` | `app/reset/page.tsx` | Client | Formulario de nueva contrasena desde el enlace del email |
| `/c/[codigo]` | `app/c/[codigo]/page.tsx` | Server (SSR, `cache: 'no-store'`) | Landing publica de verificacion de un certificado, con Open Graph |
| `/estado` | `app/estado/page.tsx` | Client | Panel de salud (API / Oracle / Redis), refresco cada 10 s |

### 2.2 Zona de sesion

| Ruta | Archivo | Que es |
| --- | --- | --- |
| `/` | `app/page.tsx` | Redirector: si hay sesion → `/panel`, si no → `/login` |
| `/login` | `app/login/page.tsx` | Login del panel + vista "olvide mi contrasena" |
| `/cambiar-clave` | `app/cambiar-clave/page.tsx` | Cambio de contrasena (obligatorio si `debeCambiarClave`) |

### 2.3 Panel (`/panel/**`, requiere sesion)

| Ruta | Archivo | Modulo |
| --- | --- | --- |
| `/panel` | `app/panel/page.tsx` | Home con tarjetas de los modulos visibles |
| `/panel/administracion/usuarios` | `.../usuarios/page.tsx` | Administracion |
| `/panel/administracion/instituciones` | `.../instituciones/page.tsx` | Administracion (solo superadmin) |
| `/panel/administracion/mi-institucion` | `.../mi-institucion/page.tsx` | Administracion (usuarios de institucion) |
| `/panel/administracion/auditoria` | `.../auditoria/page.tsx` | Administracion (solo superadmin) |
| `/panel/financiero` | `app/panel/financiero/page.tsx` | Financiero |
| `/panel/operativa` | `app/panel/operativa/page.tsx` | Operativa (indice) |
| `/panel/operativa/locales` | `.../locales/page.tsx` | Operativa |
| `/panel/operativa/locales/[id]` | `.../locales/[id]/page.tsx` | Operativa (salones/subsalones/configuraciones) |
| `/panel/reservas` | `app/panel/reservas/page.tsx` | Eventos |
| `/panel/eventos/calendario` | `.../calendario/page.tsx` | Eventos |
| `/panel/eventos` | `app/panel/eventos/page.tsx` | Eventos (pantalla mas grande, 2235 lineas) |
| `/panel/eventos/gafetes?ev=<id>` | `.../gafetes/page.tsx` | Eventos (vista imprimible) |
| `/panel/feedback` | `app/panel/feedback/page.tsx` | Transversal (todos los roles) |
| `/panel/reportes` | `app/panel/reportes/page.tsx` | Reportes de asistencia |

`app/panel/eventos/certificados-evento.tsx` **no es una ruta**: es un componente (`<CertificadosEvento>`) que se monta dentro del formulario de evento.

---

## 3. Paginas publicas legales y de soporte (critico para tiendas)

Estas paginas son el motivo por el que el dominio del panel es tambien el dominio "corporativo" de la app movil. **Si se caen o cambian de URL, la app deja de cumplir y las tiendas la rechazan.** Se sirven desde el mismo contenedor `web` y el mismo Caddy que el panel.

### 3.1 `/privacy` — Politica de Privacidad

- **URL de produccion:** `https://connecthub.fourstacklabs.com/privacy`
- **Archivo:** `apps/web/src/app/privacy/page.tsx` (Server Component, sin dependencias de la API, estilos inline → funciona aunque el API este caido).
- **Metadatos:** `title: 'Política de Privacidad · ConnectHub'`.
- **Constantes editables al inicio del archivo:** `VIGENCIA` (fecha visible, hoy `17 de julio de 2026`) y `CONTACTO` (`support@fourstacklabs.com`).
- **Contenido (11 secciones):**
  1. Responsable del tratamiento (FourStackLabs) y correo de contacto.
  2. **Datos que recopilamos**: cuenta (nombre, apellido, correo, contrasena cifrada); inicio de sesion con Apple/Google (incluye el correo privado de retransmision de Apple); perfil opcional (foto, telefono, profesion, empresa, biografia, LinkedIn, visibilidad publico/privado); documento de identidad (tipo y numero, exigido por la pasarela); datos de eventos (inscripciones, entradas QR, asistencia); datos de pago **tokenizados** (solo ultimos 4, marca, vencimiento y token; nunca el PAN completo); comunidad y networking (mensajes, solicitudes de conexion, chats privados); token de notificaciones push de Expo; datos tecnicos. Declara explicitamente que **no se recopila GPS ni contactos del dispositivo**.
  3. Como usamos los datos.
  4. Con quien se comparten: pasarela de pago, Apple/Google (solo autenticacion), almacenamiento de archivos (NAS), Expo (push), instituciones organizadoras y autoridades. Declara que **no se venden datos**.
  5. Perfiles publicos y networking (efecto de la preferencia publico/privado).
  6. **Retencion y eliminacion**: como borrar la cuenta desde la app (*Perfil → Eliminar cuenta*), que se borra y que se conserva (registro de participacion + transacciones por obligaciones contables y control de asistencia).
  7. Seguridad (cifrado de contrasenas, tokenizacion, control por roles, HTTPS).
  8. Derechos del titular.
  9. Menores de 13 anos.
  10. Cambios a la politica.
  11. Contacto.
- **Por que la exigen las tiendas:**
  - **Apple** — *App Store Review Guideline 5.1.1(i)*: toda app debe enlazar una politica de privacidad; la URL se carga en App Store Connect (campo *Privacy Policy URL*) y debe coincidir con las respuestas del *App Privacy Nutrition Label*.
  - **Google Play** — *User Data policy*: la politica de privacidad es obligatoria en la ficha de Play Console (*Politica de privacidad*) y para el formulario de **Data safety**; debe declarar recopilacion, uso, terceros y retencion.
  - Ambas revisan que la URL sea **publica, accesible sin login y no caducada**. Por eso esta pagina es estatica y no depende del API.

### 3.2 `/eliminar-cuenta` — Eliminacion de cuenta y datos

- **URL de produccion:** `https://connecthub.fourstacklabs.com/eliminar-cuenta`
- **Archivo:** `apps/web/src/app/eliminar-cuenta/page.tsx` (Server Component estatico).
- **Metadatos:** `title: 'Eliminar cuenta · ConnectHub'`.
- **Contenido:**
  - **Opcion 1 (recomendada, in-app):** abrir ConnectHub → pestana **Perfil** → **Eliminar cuenta** → confirmar. Se aplica de inmediato y se bloquea el acceso con ese correo. Corresponde al endpoint `DELETE /public/auth/me` del API (anonimizacion).
  - **Opcion 2 (por correo, sin la app):** enlace `mailto:` prearmado a `support@fourstacklabs.com` con asunto y cuerpo prellenados (asunto «Solicitud de eliminación de cuenta ConnectHub»), mas un boton morado grande con el mismo `mailto:`. Plazo declarado: **maximo 30 dias**.
  - **Que se elimina:** correo de contacto, telefono, foto, datos de perfil (profesion, empresa, biografia, LinkedIn), preferencias, conexiones, mensajes de comunidad y chats privados; y se bloquea el acceso con ese correo.
  - **Que se conserva:** registro de participacion (nombre + eventos en los que se inscribio/asistio) y transacciones (pagos, entradas), por obligaciones contables/legales y control de asistencia. Se aclara que es control interno del organizador, no visible para otros usuarios ni usado con fines comerciales.
  - Enlace cruzado a `/privacy`.
- **Por que la exigen las tiendas:**
  - **Apple** — *Guideline 5.1.1(v) Account Deletion*: si la app permite crear cuenta, debe permitir **iniciar la eliminacion desde dentro de la app**. La pagina web es el respaldo documental que el revisor consulta y el destino del enlace "eliminar cuenta" en la ficha.
  - **Google Play** — politica de **Data deletion** (desde 2023): la ficha de Play Console exige una **URL publica de solicitud de eliminacion de cuenta** accesible sin instalar la app, que explique que datos se borran y cuales se retienen. Esta pagina es exactamente esa URL.
  - Ambas URLs (`/privacy` y `/eliminar-cuenta`) estan ya registradas en App Store Connect y Play Console para el bundle/package `com.fourstacklabs.connecthub`.

### 3.3 `/verify` — Verificacion de correo del asistente

- **URL de produccion:** `https://connecthub.fourstacklabs.com/verify?token=<token>`
- **Archivo:** `apps/web/src/app/verify/page.tsx` (Client Component).
- Lee `?token=` de la query, hace `POST /api/public/auth/verify` con `{ token }` y muestra tres estados: `verificando` (⏳), `ok` (✅ "¡Correo verificado!") o `error` (⚠️ enlace invalido/expirado, "vuelve a la app y solicita un nuevo correo").
- El enlace lo genera el API en el correo de bienvenida (`APP_URL` + `/verify?token=...`).

### 3.4 `/reset` — Nueva contrasena del asistente

- **URL de produccion:** `https://connecthub.fourstacklabs.com/reset?token=<token>`
- **Archivo:** `apps/web/src/app/reset/page.tsx` (Client Component).
- Formulario de una sola caja (contrasena, minimo 8 caracteres, validado en cliente) que hace `POST /api/public/auth/reset` con `{ token, password }`. Al exito muestra "Contrasena actualizada"; si el token expiro, mensaje de error y sugerencia de solicitar uno nuevo desde la app.
- **Es para asistentes de la app movil**, no para usuarios del panel (esos usan `/login` → "olvide mi contrasena").

> **Gotcha importante:** `/verify` y `/reset` usan rutas **relativas** `/api/public/auth/*`. Eso funciona en produccion porque **Caddy** hace `handle_path /api/* → api:4000`. En `localhost:3000` sin Caddy **no funcionan** (Next no tiene rewrites configurados). Para probarlas en local hay que levantar el stack completo con `docker-compose.yml` o apuntar a mano al API.

### 3.5 `/c/[codigo]` — Verificacion publica de certificados

- **URL de produccion:** `https://connecthub.fourstacklabs.com/c/<CODIGO>`
- **Archivo:** `apps/web/src/app/c/[codigo]/page.tsx` (Server Component asincrono).
- Es la URL que va impresa en el certificado y detras del boton "compartir" de la app. Sirve para que un tercero (un empleador, por ejemplo) valide un certificado sin cuenta.
- **Doble URL del API, a proposito:**
  - `API_INTERNAL_URL` (fijada a `http://api:4000` en `docker-compose.yml`) para el `fetch` **server-side** de `GET /public/certificados/:codigo`. La cadena real de respaldo en el codigo es `API_INTERNAL_URL ?? NEXT_PUBLIC_API_URL ?? http://localhost:4000`: si se olvida definirla en el contenedor, el servidor de Next intentaria llamarse **a si mismo** por la URL publica (`https://.../api`) y el certificado se renderiza vacio sin error visible.
  - `NEXT_PUBLIC_API_URL` para la **imagen** (`/public/certificados/:codigo/imagen`) y las etiquetas Open Graph, porque esas URLs las resuelven el navegador y los crawlers.
- Genera `generateMetadata` con Open Graph (`images` 1200x850) y Twitter `summary_large_image` → el certificado se ve como tarjeta en LinkedIn/WhatsApp (estilo Credly).
- Si el codigo no existe muestra "Certificado no encontrado". Si existe muestra la imagen, un badge "✓ Certificado verificado" y una ficha con participante, evento, institucion organizadora, fecha de emision y codigo.

### 3.6 `/estado` — Salud del sistema

- **URL de produccion:** `https://connecthub.fourstacklabs.com/estado`
- **Archivo:** `apps/web/src/app/estado/page.tsx` (Client Component).
- Hace `GET {NEXT_PUBLIC_API_URL}/health` cada 10 segundos (`setInterval`) y pinta tres filas: **API**, **Oracle (<ver ORACLE_USER en .env>)** y **Redis**, con latencia en ms cuando estan OK y "offline" (con el error en el `title`) cuando fallan.
- Util para diagnosticar caidas sin entrar por SSH. No expone datos sensibles.

---

## 4. Login, sesion y refresh contra la API

### 4.1 Piezas involucradas

| Pieza | Archivo | Rol |
| --- | --- | --- |
| `AuthProvider` / `useAuth()` | `src/lib/auth/auth-context.tsx` | Estado de sesion en React |
| `api`, `refreshSession`, `setAccessToken` | `src/lib/api/client.ts` | Transporte HTTP y token en memoria |
| `LoginPage` | `src/app/login/page.tsx` | Formulario de acceso y recuperacion |
| `CambiarClavePage` | `src/app/cambiar-clave/page.tsx` | Cambio obligatorio/voluntario de clave |
| `PanelLayout` | `src/app/panel/layout.tsx` | Guarda de ruta del panel |
| `AuthController` (API) | `apps/api/src/auth/auth.controller.ts` | Emision de tokens y cookie |

### 4.2 Modelo de tokens

- **Access token (JWT, `expiresIn: '15m'`)**: vive **solo en una variable de modulo en memoria** (`let accessToken` en `client.ts`). No se guarda en `localStorage` ni en `sessionStorage` → inmune a robo por XSS persistente. Se pierde al recargar la pagina, y eso es intencional.
- **Refresh token (JWT, `expiresIn: '7d'`)**: viaja en la cookie **`ch_refresh`**, emitida por el API con `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, `maxAge: 7 * 24 * 3600` y `secure` controlado por la variable `COOKIE_SECURE` (en produccion `true`, porque Caddy termina TLS). El `path: '/'` es deliberado para que la cookie viaje tambien cuando la API va bajo el prefijo `/api` del proxy.
- Todas las peticiones del cliente usan `credentials: 'include'` para que la cookie viaje incluso cross-origin en desarrollo (`localhost:3000` → `localhost:4000`).

### 4.3 Flujo de inicio de sesion

1. El usuario abre `/` → `HomePage` espera a que `useAuth()` termine de cargar y redirige a `/login` o `/panel`.
2. En `/login` el formulario envia `usuario` (correo, se le aplica `.trim()`) y `password`.
3. `login()` hace `POST /auth/login` (con rate limiting en el API via `RateLimitGuard`) y recibe `{ accessToken, user }`. El API ademas fija la cookie `ch_refresh`.
4. Se llama `setAccessToken(session.accessToken)` y se guarda `user` en el contexto.
5. Redireccion: si `user.debeCambiarClave` → `/cambiar-clave`; si no → `/panel`.

### 4.4 Rehidratacion al recargar

`AuthProvider` monta un `useEffect` que llama `refreshSession()` una sola vez:

```ts
refreshSession()
  .then((s) => setUser(s?.user ?? null))
  .finally(() => setLoading(false));
```

`refreshSession()` hace `POST /auth/refresh` con `credentials: 'include'`; si la cookie es valida devuelve `{ accessToken, user }`, guarda el token en memoria y rota la cookie (el API vuelve a fijarla). Si falla, devuelve `null` sin lanzar excepcion. Mientras `loading === true` el panel muestra el texto de carga; nunca parpadea el login.

### 4.5 Reintento automatico ante 401

En `request()` de `client.ts`:

```ts
if (res.status === 401 && retry && !path.startsWith('/auth/')) {
  const session = await refreshSession();
  if (session) return request<T>(path, options, false);
}
```

- Se excluyen las rutas `/auth/*` para no entrar en bucle (un login fallido con 401 no debe intentar refrescar).
- El reintento es **uno solo** (`retry = false` en la llamada recursiva).
- Los helpers `upload`, `blob` y `blobUrl` implementan el mismo patron a mano (un `doFetch()` reutilizable + un reintento si el primer intento da 401).

### 4.6 Guardas de ruta

`app/panel/layout.tsx`:

```ts
if (loading) return;
if (!user) router.replace('/login');
else if (user.debeCambiarClave) router.replace('/cambiar-clave');
```

Mientras `loading || !user`, renderiza solo un mensaje de carga; el shell (Sidebar + Topbar) nunca llega a montarse sin usuario. **Es una guarda de UX, no de seguridad**: la seguridad real la impone el API con `JwtAuthGuard` + `RolesGuard` en cada endpoint.

### 4.7 Cambio de contrasena

- `/cambiar-clave` envia `POST /auth/cambiar-clave` con `{ claveActual, claveNueva }`. Valida en cliente que la nueva coincida con la confirmacion y que sea distinta de la actual.
- Tras el exito hace `window.location.assign('/panel')` — **recarga completa, a proposito**: asi el `AuthProvider` vuelve a montar y `refreshSession()` trae al usuario ya sin el flag `debeCambiarClave`.
- Tiene un boton "salir" que hace `logout()` y va a `/login`.

### 4.8 Recuperacion de contrasena (panel)

La vista `recuperar` del login hace `POST /auth/recuperar` con `{ usuario }`. El API genera una contrasena temporal aleatoria y la envia por correo (SMTP), marcando el usuario para que deba cambiarla al ingresar. En entornos sin SMTP la respuesta puede incluir `passwordTemporal`, y el panel la muestra en un bloque monoespaciado — **eso es comportamiento de desarrollo**; en produccion el correo es el canal.

### 4.9 Cierre de sesion

`logout()` hace `POST /auth/logout` (el API borra la cookie con `clearCookie`), luego `setAccessToken(null)` y `setUser(null)`. El error del POST se traga a proposito (`.catch(() => undefined)`) para que el usuario siempre quede deslogueado en el cliente.

---

## 5. El cliente HTTP tipado — `src/lib/api/client.ts`

Un unico archivo de 160 lineas es toda la capa de red del panel. No hay Axios, ni React Query, ni SWR.

### 5.1 Base URL

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
```

Al ser `NEXT_PUBLIC_*`, el valor se **incrusta en el bundle en tiempo de build** (ver seccion 9).

### 5.2 Superficie publica

| Metodo | Firma | Notas |
| --- | --- | --- |
| `api.get<T>(path)` | `Promise<T>` | Sin body → sin `Content-Type` |
| `api.post<T>(path, data?)` | `Promise<T>` | JSON, pasa por `aMayusculas()` |
| `api.patch<T>(path, data?)` | `Promise<T>` | Idem |
| `api.put<T>(path, data?)` | `Promise<T>` | Idem |
| `api.del<T>(path)` | `Promise<T>` | Sin body |
| `api.upload<T>(path, form)` | `Promise<T>` | `multipart/form-data`; **no** fija `Content-Type` (el navegador arma el boundary) |
| `api.blob(path)` | `Promise<Blob>` | Descarga binaria autenticada |
| `api.blobUrl(path)` | `Promise<string>` | `URL.createObjectURL()` del blob, para `<img src>` |
| `setAccessToken(token \| null)` | `void` | Fija el token en memoria |
| `refreshSession()` | `Promise<Session \| null>` | `POST /auth/refresh` |
| `ApiError` | `class extends Error` | Lleva `status: number` |

`interface Session { accessToken: string; user: Usuario }`.

### 5.3 Detalles de implementacion que importan

- **`Content-Type` condicional:** solo se anade `application/json` **si hay body**. El comentario del codigo lo explica: *"Fastify rechaza JSON vacio con 400"*. Un `POST` sin body con `Content-Type: application/json` fallaria.
- **Authorization:** `Bearer ${accessToken}` cuando hay token.
- **`credentials: 'include'`** siempre, para la cookie de refresh.
- **204 sin cuerpo:** `res.status === 204 ? null : await res.json().catch(() => null)` — no revienta con respuestas vacias ni con HTML de error.
- **Mensajes de error:** toma `body.message`; si es un array (validacion de `class-validator` en NestJS) lo une con comas. Si no hay mensaje, `Error <status>`. Se lanza como `ApiError` con el `status` accesible.

### 5.4 Politica global de MAYUSCULAS

Es la peculiaridad mas importante del cliente. Todo texto que se envia a la API en `POST`/`PATCH`/`PUT` se convierte a mayusculas recursivamente (objetos y arrays incluidos) antes de serializar, porque el esquema Oracle compartido almacena en mayusculas.

```ts
const SIN_MAYUSCULAS =
  /pass|clave|pasarela|appcode|appkey|key|token|secret|url|codigoconexion/i;
```

Se **exceptuan** por nombre de campo: contrasenas, credenciales de pasarela, `appCode`/`appKey`, tokens, secretos, URLs y el codigo de conexion (que el sistema genera en minusculas). Si se anade un campo nuevo donde el case importe, **hay que anadir su patron a esa expresion regular** o el valor se corrompera.

La contraparte visual esta en `globals.css`: todos los `input` (excepto `password`, `date`, `time`, `file`, `checkbox`, `radio`) y los `textarea` llevan `text-transform: uppercase`, con los `::placeholder` exentos. Los campos sensibles usan la clase `normal-case` para escapar de la regla.

### 5.5 Ejemplo de uso real

```ts
const eventos = await api.get<EventoRow[]>(`/eventos${qs}`);
await api.patch(`/eventos/${id}/destacar`, { destacado: true });
await api.upload(`/eventos/${id}/imagen`, form);
const url = await api.blobUrl(`/eventos/${id}/certificados/plantilla/imagen`);
```

---

## 6. Roles y permisos

### 6.1 Catalogo de roles — `src/lib/types.ts`

```ts
export const ROL = {
  SYSTEM: 'SYSTEM',
  ADMINISTRATIVO: 'ADMINISTRATIVO',
  FINANCIERO: 'FINANCIERO',
  GESTION_OPERATIVA: 'GESTION OPERATIVA',   // ojo: con ESPACIO, no guion bajo
  EVENTOS: 'EVENTOS',
} as const;
```

Ademas del array `roles: string[]`, el usuario trae el flag **`esSuper: boolean`** (superadministrador de plataforma). El superadmin **ve y puede todo**, y ademas es el unico con acceso a Instituciones, Auditoria y al selector global de institucion.

### 6.2 Forma del usuario en sesion

```ts
interface Usuario {
  sub: string;                 // COD_USUARIO (el correo)
  email: string;
  nombres: string | null;
  apellidos: string | null;
  nombreCompleto: string;
  esSuper: boolean;
  idInstitucion: number | null; // null para el superadmin
  institucion: string | null;
  roles: string[];
  debeCambiarClave: boolean;
}
```

### 6.3 Matriz modulo → rol

Declarada en la constante `MODULOS` de `src/lib/types.ts`:

| Modulo | `id` | Destino | Roles que lo ven |
| --- | --- | --- | --- |
| Administracion | `administracion` | `/panel/administracion/usuarios` | `SYSTEM`, `ADMINISTRATIVO` (+ `esSuper`) |
| Financiero | `financiero` | `/panel/financiero` | `SYSTEM`, `FINANCIERO` (+ `esSuper`) |
| Operativa | `operativa` | `/panel/operativa/locales` | `SYSTEM`, `GESTION OPERATIVA` (+ `esSuper`) |
| Eventos | `eventos` | `/panel/eventos` | `SYSTEM`, `EVENTOS` (+ `esSuper`) |

Fuera de `MODULOS`, la Sidebar aplica dos reglas mas:

- **Reportes** (`/panel/reportes`): visible para `SYSTEM`, `ADMINISTRATIVO` y `EVENTOS`.
- **Feedback** (`/panel/feedback`): visible para **todos** los usuarios con sesion, sin filtro de rol.

### 6.4 La funcion de permisos

```ts
export function puedeVer(user: Usuario | null, roles: readonly string[]): boolean {
  if (!user) return false;
  if (user.esSuper) return true;
  return user.roles.some((r) => roles.includes(r));
}
```

Se usa en `app/panel/page.tsx` (que tarjetas se pintan) y en `components/shell/sidebar.tsx` (que secciones del menu aparecen).

### 6.5 Guardas dentro de las paginas

Algunas pantallas aplican una comprobacion adicional en su cuerpo:

| Pagina | Guarda | Efecto |
| --- | --- | --- |
| `administracion/instituciones` | `if (!user?.esSuper)` | Muestra `t('in.onlySuper')` y no renderiza nada mas |
| `administracion/auditoria` | `if (!user?.esSuper)` | Idem |
| `administracion/mi-institucion` | `if (user?.idInstitucion == null)` | Muestra pista para el superadmin (que no tiene institucion propia) |
| `administracion/usuarios` | `puedeCrear = esSuper \|\| roles.includes('SYSTEM')` | Oculta el boton "nuevo usuario"; el selector de roles asignables filtra `SYSTEM` si no es superadmin |
| `operativa/locales` | Campo institucion solo si `esSuper` | El resto de usuarios crean en su institucion |
| `feedback` | `esSuper` alterna vista | Superadmin ve todos los feedbacks y puede responder/cambiar estado; el resto solo envia y ve los suyos |

> **Todo esto es cosmetico.** El servidor es la autoridad: `apps/api/src/auth/roles.guard.ts` aplica la misma logica (`esSuper` pasa siempre; si no, interseccion de roles) y lanza `ForbiddenException` si no hay permiso. Nunca confiar en la ocultacion del panel para proteger datos.

### 6.6 Filtro global de institucion (multi-tenant)

`src/lib/institucion-context.tsx` expone `useInstitucionFiltro()`:

| Campo | Que es |
| --- | --- |
| `idInstitucion` | `number \| null`; `null` = todas (solo tiene sentido para superadmin) |
| `setIdInstitucion(id)` | Cambia el filtro y lo persiste en `localStorage` bajo `ch_inst_filtro` |
| `instituciones` | Catalogo (`GET /instituciones`) — **solo se carga si `esSuper`** |
| `qs` | `''` o `'?idInstitucion=N'`, listo para concatenar a la ruta del API |
| `nombreFiltro` | Nombre legible de la institucion filtrada, para los subtitulos |

Para usuarios de institucion, `idInstitucion` efectivo es siempre `null` y por tanto `qs === ''`: **el API impone el alcance por el token**, no por el query string. El selector solo aparece en el Topbar cuando `user.esSuper`.

---

## 7. Las pantallas del panel, una por una

Todas usan `api` de `client.ts`, `useI18n()` para textos y, cuando aplica, `useInstitucionFiltro()` para el `qs`.

### 7.1 `/panel` — Home

`app/panel/page.tsx`. Saluda al usuario e indica si tiene "acceso total" (superadmin) o lista sus roles. Pinta una tarjeta por cada modulo de `MODULOS` que pase `puedeVer()`, con icono de `components/ui/icons.tsx` (`MODULE_ICONS`).

### 7.2 Administracion → Usuarios

`app/panel/administracion/usuarios/page.tsx` (505 lineas). Roles: `SYSTEM`, `ADMINISTRATIVO`, superadmin.

- Lista `GET /usuarios{qs}` con columnas de correo, nombre, estado, roles, fecha y (solo superadmin) institucion.
- Carga el catalogo `GET /roles` para el selector.
- **Crear** (`NuevoUsuarioForm`): `POST /usuarios` con `{ usuario, nombres, apellidos, roles, idInstitucion? }`; si es superadmin permite elegir institucion; filtra el rol `SYSTEM` de la lista de asignables cuando el actor no es superadmin.
  - La respuesta es `{ passwordTemporal, correoEnviado }`. Si `correoEnviado` es `true` el panel solo confirma el envio; si es `false` (entorno **sin SMTP**) muestra la **contrasena temporal en pantalla** para entregarla a mano. Mismo patron que la aprobacion de instituciones (7.3): el valor se ve **una sola vez** y no se vuelve a poder consultar.
- **Editar** (`EditarUsuarioForm`): `PATCH /usuarios/:codUsuario`.
- **Activar/desactivar:** `PATCH /usuarios/:codUsuario/estado` con `{ estado: 'A' | 'I' }`.
- **Eliminar:** `DELETE /usuarios/:codUsuario`, previa confirmacion con `useDialogo()`.
- El `COD_USUARIO` va siempre `encodeURIComponent()` porque es un correo.

### 7.3 Administracion → Instituciones (solo superadmin)

`app/panel/administracion/instituciones/page.tsx` (483 lineas).

- Lista `GET /instituciones` con badge de estado (`APROBADA` / `PENDIENTE` / `RECHAZADA` / `SUSPENDIDA`) y total de usuarios.
- **Crear:** `POST /instituciones` (`NuevaInstitucionForm`); al crear, abre automaticamente el panel de aprobacion de la nueva institucion.
- **Aprobar:** `POST /instituciones/:id/aprobar` con body **`{ emailUsuarioSistema }`** (el correo que sera el administrador de esa institucion) → devuelve `usuarioSistema` + `passwordTemporal` del usuario que se crea junto con la institucion; el panel las muestra una sola vez para entregarselas al cliente.
- **Rechazar / suspender / reactivar:** `POST /instituciones/:id/{rechazar|suspender|reactivar}`.
- **Editar perfil:** `GET /instituciones/:id/perfil` → abre `<PerfilInstitucionForm>` (ver 7.4).
- **Logo:** `<ImagenNas tipoEntidad="INSTITUCION" tipoArchivo="LOGO">` sobre `/instituciones/:id/logo`.
- **Eliminar:** `DELETE /instituciones/:id`.

### 7.4 Administracion → Mi institucion

`app/panel/administracion/mi-institucion/page.tsx`. Es la version "para el cliente" de la pantalla anterior: carga `GET /instituciones/{user.idInstitucion}/perfil` y renderiza el mismo `<PerfilInstitucionForm>`, mas el logo editable.

**`components/instituciones/perfil-form.tsx`** (329 lineas) es el formulario compartido:

- Datos generales: nombre, direccion, ciudad, pais.
- `CODIGO_CONEXION` en **solo lectura**: es el codigo que los asistentes escriben en la app movil para engancharse a la institucion. Lo genera el sistema, el formulario solo lo muestra y **nunca lo envia** de vuelta. Los codigos reales de cada institucion (incluido el que se entrego a los revisores de las tiendas) viven en `docs/handbook/07-credenciales-y-accesos.md`, **no aqui**.
- Configuracion de pago: `PROVEEDOR_PAGO`, `PAYMENT_ENVIROMENT` (stg/prod), `URL_COD_PAGO`, `URL_PROCESO_PAGO`. **Los dos campos de URL solo se renderizan cuando el proveedor es `NUVEI`**; para el resto estan ocultos porque no aplican.
- **Catalogo de proveedores (`PROVEEDORES`, tipos quemados en el componente).** Cada proveedor declara **sus propios campos de credencial**, mapeados sobre las columnas genericas que ya existen en la BD (`CredKey` → `TIENE_*`). Cambiar el selector cambia que inputs se pintan y como se etiquetan:

  | Proveedor (`PROVEEDOR_PAGO`) | Campos que pide | Columna generica destino |
  | --- | --- | --- |
  | `NUVEI` | App Code/Key (tokenization), App Code/Key (checkout), Server App Code, Server App Key | `appCode/KeyTokenization`, `appCode/KeyCheckout`, `usuarioPasarela`, `contrasenaPasarela` |
  | `PAYPAL` | Client ID, Client Secret, Webhook ID | `appCodeTokenization`, `appKeyTokenization`, `tokenPasarela` |
  | `PAYPHONE` | API Token, Store ID | `tokenPasarela`, `usuarioPasarela` |
  | `STRIPE` | Publishable Key, Secret Key, Webhook Signing Secret | `appCodeTokenization`, `appKeyTokenization`, `tokenPasarela` |
  | `SQUARE` | Application ID, Access Token, Location ID | `appCodeTokenization`, `appKeyTokenization`, `usuarioPasarela` |
  | `AUTHNET` | API Login ID, Transaction Key | `appCodeTokenization`, `appKeyTokenization` |

  > **En produccion solo Nuvei procesa pagos de verdad.** Los otros cinco estan cableados en la UI y guardan sus credenciales, pero no hay integracion real detras. Si el `PROVEEDOR_PAGO` guardado no existe en el catalogo, el formulario cae a `NUVEI`.
- **Credenciales de pasarela:** son **write-only**. El API **nunca devuelve los valores**; el perfil trae solo banderas `TIENE_USUARIO_PASARELA`, `TIENE_CONTRASENA_PASARELA`, `TIENE_TOKEN_PASARELA`, `TIENE_APP_CODE_TOKENIZATION`, `TIENE_APP_KEY_TOKENIZATION`, `TIENE_APP_CODE_CHECKOUT`, `TIENE_APP_KEY_CHECKOUT` (1 = configurada). El formulario muestra "configurada / no configurada" y permite sobrescribir escribiendo un valor nuevo (campo vacio = no tocar). Estos campos estan en la lista de excepciones de `aMayusculas()`.
- Guarda con `PATCH /instituciones/:id`.

> Recordatorio de alcance: el panel **solo guarda configuracion de pago** (precios, cupones, credenciales). El **cobro real lo ejecuta la app movil** contra la pasarela.

### 7.5 Administracion → Auditoria (solo superadmin)

`app/panel/administracion/auditoria/page.tsx`. Consulta `GET /auditoria?...` con filtros de **accion** (`LOGIN_OK`, `LOGIN_FAIL`, `CREATE`, `UPDATE`, `DELETE`, `ERROR`), **usuario**, **desde**, **hasta** y `limit=200` fijo. Cada fila muestra fecha, usuario, institucion, accion (con badge de color), metodo, ruta, status HTTP e IP; al hacer clic se expande el campo `DETALLE`.

### 7.6 Financiero

`app/panel/financiero/page.tsx`. Roles: `SYSTEM`, `FINANCIERO`, superadmin.

- `GET /finanzas/resumen?...` con filtros de evento, mes y ano.
- Tarjetas de totales: recaudado (formato moneda USD con `Intl.NumberFormat` y el `locale` activo), numero de pagos, numero de inscripciones gratuitas.
- Grafica de barras (`recharts`) de recaudacion por mes y desglose por evento.
- Tabla de ultimos pagos: evento, monto, moneda, metodo de pago y **ultimos 4 digitos** de la tarjeta (nunca el numero completo).

### 7.7 Operativa → indice

`app/panel/operativa/page.tsx`. Pagina de aterrizaje con una sola tarjeta ("Locales"). El comentario del codigo deja constancia de que **mapas/croquis quedan pendientes** de la integracion con el NAS.

### 7.8 Operativa → Locales

`app/panel/operativa/locales/page.tsx`. Lista `GET /locales{qs}` con nombre, ubicacion, institucion (solo superadmin) y total de salones. Permite crear/editar (`POST` / `PATCH /locales/:id`), eliminar (`DELETE`) y subir el plano (`/locales/:id/plano` via `<ImagenNas>`). Cada fila enlaza a `/panel/operativa/locales/{id}?nombre=<nombre>` (el nombre viaja por query solo para el breadcrumb, evitando un fetch extra).

### 7.9 Operativa → Detalle de local

`app/panel/operativa/locales/[id]/page.tsx` (733 lineas). Es el editor de la jerarquia fisica del recinto:

- **Salones:** `GET /locales/:idLocal/salones`, crear/editar (`POST` / `PATCH /salones/:id`), eliminar, imagen (`/salones/:id/imagen`). Cada salon tiene `ES_SUBDIVISIBLE` y `CAPACIDAD_MAX`.
- **Subsalones** (si el salon es subdivisible): `GET /salones/:idSalon/subsalones`, CRUD sobre `/subsalones/:id`, imagen (`/subsalones/:id/imagen`).
- **Configuraciones** (combinaciones de subsalones que se venden como un espacio): `GET /salones/:idSalon/configuraciones`, CRUD sobre `/configuraciones/:id`, imagen (`/configuraciones/:id/imagen`), flag `ACTIVO`.

Ese arbol Local → Salon → (Subsalon | Configuracion) es exactamente lo que el formulario de evento ofrece como "espacio".

### 7.10 Eventos → Reservas

`app/panel/reservas/page.tsx`. Vista de **ocupacion mensual por espacio**: carga `GET /eventos{qs}` y `GET /locales{qs}`, permite filtrar por local y salon (`GET /locales/:id/salones`), y pinta una grilla de calendario (semana que empieza en **lunes**: `offset = (primerDia.getDay() + 6) % 7`).

Al hacer clic en un dia se abre el `DiaPanel`, que hace dos cosas:

- **Lista los eventos de esa fecha**, cada uno con un badge que distingue **publico** de **privado** (la leyenda de colores esta sobre el calendario). El criterio es `NO_PUBLICAR === 'S'`.
- **Crea una reserva privada en linea.** Es un mini-formulario (titulo, `horaInicio` por defecto `09:00`, `horaFin` por defecto `12:00`) que hace `POST /eventos` con **`noPublicar: true`** y el `idLocal` / `idSalon` del filtro activo. Sirve para **bloquear el espacio** (mantenimiento, montaje, uso interno) sin publicar nada en la app movil. Si no hay local seleccionado, muestra `t('rsv.pick')` y no envia.
- Ademas hay un enlace **"evento completo"** a `/panel/eventos?nuevo=YYYY-MM-DD`, para cuando la reserva si debe ser un evento de verdad con precio, cupones y expositores.

> Es decir: **Reservas tambien escribe**, no es una vista de solo lectura. Todo lo que crea nace con `NO_PUBLICAR = 'S'`.

### 7.11 Eventos → Calendario

`app/panel/eventos/calendario/page.tsx` (369 lineas). Calendario mensual mas rico:

- Nombres de mes y dia generados con `toLocaleDateString(locale)` → cambian con el idioma del panel.
- **Color por salon** (paleta de 7 colores indexada por `ID_SALON`) para distinguir de un vistazo.
- Muestra la **ventana real** de ocupacion = `HORA_INICIO - TIEMPO_SETUP_MIN` a `HORA_FIN + TIEMPO_CLEAN_MIN`.
- Precio formateado en USD segun el `locale`.
- Clic en un evento → `/panel/eventos?editar=<id>`; boton "crear evento este dia" → `/panel/eventos?nuevo=<fecha>`.

### 7.12 Eventos → Eventos

`app/panel/eventos/page.tsx` (2235 lineas). Es el corazon del panel. Roles: `SYSTEM`, `EVENTOS`, superadmin.

**Listado:** `GET /eventos{qs}`, con miniatura de portada (NAS), titulo, dias, espacio resuelto en texto legible (local · salon — configuracion (subsalones)), precio, inscritos y acciones. Incluye un `imgVersion` que se incrementa al subir una portada para romper la cache del navegador.

**Deep links** (los consume una sola vez con un `useRef` centinela):
- `?editar=<id>` → abre el formulario de edicion de ese evento (o avisa que no es visible con el filtro actual).
- `?nuevo=<YYYY-MM-DD>` → abre el formulario de creacion con la fecha prellenada.

**Acciones rapidas:** destacar/quitar destacado (`PATCH /eventos/:id/destacar`), eliminar (`DELETE /eventos/:id`, con confirmacion), ver detalle (`<DetalleEvento>`), imprimir gafetes.

**`EventoForm`** (crear = `POST /eventos`, editar = `PATCH /eventos/:id`) maneja:

- Titulo y descripcion.
- **Horario por dia:** un evento tiene 1..N dias, cada uno con su rango horario (tabla `EVENTO_HORAS`). Un evento de un solo dia es el caso degenerado.
  - **Lectura:** `GET /eventos/:id/dias` (solo al editar, para rehidratar el formulario).
  - **Escritura:** **no hay `PUT /eventos/:id/dias`**. Los dias viajan como el array `dias: [{ fecha, horaInicio, horaFin }]` dentro del payload de `POST /eventos` / `PATCH /eventos/:id`, y reemplazan por completo a los antiguos `fechaEvento` / `horaInicio` / `horaFin`.
- **Evento padre:** si se elige uno, este evento pasa a ser un **workshop** (evento hijo). Los candidatos son los eventos principales (sin padre), excluyendo el propio.
- **Precio, IVA:** `PRECIO`, `INCLUYE_IVA` ('S'/'N'), `MONTO_IVA`.
- **Publico esperado**, `TIEMPO_SETUP_MIN` y `TIEMPO_CLEAN_MIN` (por defecto 30 y 30).
- **Destacado** + `ORDEN_DESTACADO` (orden en el carrusel de la app movil).
- **`NO_PUBLICAR`** ('S'/'N'): oculta el evento de la app publica sin borrarlo. Es la bandera usada para los eventos 161 y 201 durante la revision de tiendas (ver `docs/eventos-no-publicar.md`).
- **`COD_ITEM`**: codigo del item para la facturacion externa.
- **Espacio:** cascada Local → Salon → (`salon` completo | `configuracion` | `subsalon`), con carga encadenada de `/locales`, `/locales/:id/salones`, `/salones/:id/configuraciones` y `/salones/:id/subsalones`.
  - **Local completo:** dejar el salon **sin elegir** es una opcion valida y reserva el recinto entero. Al **editar** un evento en ese estado, el payload incluye ademas `localCompleto: true` para que el API sepa que es intencional y no un salon que se perdio.
- **Deteccion de choques:** consulta `GET /eventos/agenda?...&fecha=<f>` por cada fecha del evento y muestra la ocupacion existente de ese espacio, para no doble-reservar.
- **Portada:** `<ImagenNas tipoEntidad="EVENTO" tipoArchivo="PORTADA">` sobre `/eventos/:id/imagen`.

**Secciones colapsables del formulario** (colapsadas por defecto):

| Seccion | Componente | Endpoints |
| --- | --- | --- |
| Cupones | `CuponesEvento` | `GET/POST /eventos/:id/cupones`, `DELETE /eventos/:id/cupones/:idCupon` — **no hay edicion**: un cupon se borra y se vuelve a crear |
| Detalle (agenda, ponentes, listas editables) | `EventoDetalleForm` | `GET/PUT /eventos/:id/detalle` |
| Expositores | `ExpositoresEvento`, `ExpositorForm`, `ExpositorAvatar` | `GET/POST /eventos/:id/expositores`, `PATCH/DELETE /eventos/:id/expositores/:idExpositor`, imagen en `/eventos/:id/expositores/:idExpositor/imagen` |
| Certificados | `CertificadosEvento` | ver 7.13 |

> Nota NAS: el NAS solo soporta 6 entidades; la **foto del expositor** se resuelve por columna URL (`EXPOSITOR` esta declarado en `lib/nas.ts` como tipo con `tipoArchivo: 'FOTO'`, pero la ruta real de subida va por la API). Ver la nota de memoria `connecthub-nas-entidades`.

### 7.13 Eventos → Certificados (componente `CertificadosEvento`)

`app/panel/eventos/certificados-evento.tsx` (404 lineas). Editor **WYSIWYG** de certificados estilo Credly:

- **Plantilla-imagen por evento:** subida/lectura en `/eventos/:id/certificados/plantilla` y `/eventos/:id/certificados/plantilla/imagen` (se descarga con `api.blobUrl()` porque requiere sesion).
- **Overlay parametrizable:** siete campos opcionales — `nombre`, `evento`, `fecha`, `tipo`, `hora`, `institucion`, `codigo`. Cada uno tiene `x`, `y` (**coordenadas relativas 0..1**), `size` (relativo al alto), `color`, `align` y `weight`. Por defecto se activan `nombre`, `evento` y `fecha`.
- Los campos se **arrastran** sobre el preview. El preview usa el **ratio real de la imagen** (no uno fijo) para que coincida pixel a pixel con el PNG que genera el backend con `sharp`.
- **Asistentes:** `GET /eventos/:id/certificados/asistentes` (nombre, email, si asistio, codigo de certificado si ya lo tiene) con seleccion multiple.
- **Generacion en lote:** `POST /eventos/:id/certificados/generar` → devuelve `{ generados, total }`.
- Cada certificado emitido es verificable publicamente en `/c/<codigo>` (seccion 3.5).

### 7.14 Eventos → Gafetes (imprimible)

`app/panel/eventos/gafetes/page.tsx`. Se abre como `/panel/eventos/gafetes?ev=<idEvento>` (usa `useSearchParams()` dentro de un `<Suspense>`, obligatorio en App Router).

- `GET /eventos/:id/gafetes` → `{ titulo, asistentes: [{ idCliente, nombre, qrToken, asistio }] }`.
- Genera el QR **en el navegador** con `QRCode.toDataURL(qrToken)`.
- Renderiza una grilla de credenciales con bordes punteados para cortar, boton "🖨 Imprimir" (`window.print()`) y una clase `no-print` para la barra de controles.
- El QR es **el mismo del ticket**, asi que sirve para el check-in en la puerta.

### 7.15 Reportes de asistencia

`app/panel/reportes/page.tsx` (410 lineas). Roles: `SYSTEM`, `ADMINISTRATIVO`, `EVENTOS`, superadmin.

- `GET /reportes/asistencia?...` (filtro por ano, con `aniosDisponibles` devuelto por el API).
- Totales: eventos, inscritos, asistieron, no asistieron, cancelados, pendientes y **tasa de asistencia**.
- Grafica de barras comparando inscritos vs. asistieron por evento.
- Al desplegar un evento: `GET /reportes/asistencia/:idEvento/inscritos` con nombre, apellido, email, celular, estado (`ASISTIO` / `NO_ASISTIO` / `PENDIENTE` / `CANCELADO`, con badge de color), fecha de registro y fecha de entrada.

### 7.16 Feedback

`app/panel/feedback/page.tsx`. Visible para **todos** los usuarios del panel.

- Cualquiera envia feedback: `POST /feedback` con `tipo` (`SUGGESTION` / `PROBLEM` / `OTHER`) y `mensaje`.
- El **superadmin** ve todos los feedbacks (con institucion y usuario), filtra por estado (`NEW` / `REVIEWED` / `PLANNED` / `DONE`), cambia el estado (`PATCH /feedback/:id/estado`) y responde (`PATCH /feedback/:id/responder`).
- Los demas usuarios ven sus envios y la respuesta cuando llega.

---

## 8. Infraestructura de UI compartida

### 8.1 Providers (orden de anidamiento)

`src/app/layout.tsx`:

```
<ThemeProvider>
  <I18nProvider>
    <AuthProvider>{children}</AuthProvider>
  </I18nProvider>
</ThemeProvider>
```

`src/app/panel/layout.tsx` anade, solo para el panel:

```
<InstitucionFilterProvider>
  <LightboxProvider>
    <DialogoProvider>
      <Sidebar /> + <Topbar /> + <main>{children}</main>
```

| Provider | Archivo | Hook | Estado persistido |
| --- | --- | --- | --- |
| `ThemeProvider` | `lib/theme.tsx` | `useTheme()` | `localStorage['ch_theme']` = `light` \| `dark` |
| `I18nProvider` | `lib/i18n/index.tsx` | `useI18n()` | `localStorage['ch_lang']` = `en` \| `es` \| `fr` \| `pt` |
| `AuthProvider` | `lib/auth/auth-context.tsx` | `useAuth()` | Nada (token en memoria + cookie httpOnly) |
| `InstitucionFilterProvider` | `lib/institucion-context.tsx` | `useInstitucionFiltro()` | `localStorage['ch_inst_filtro']` |
| `LightboxProvider` | `lib/lightbox.tsx` | `useLightbox()` | — |
| `DialogoProvider` | `lib/dialogo.tsx` | `useDialogo()` | — |

### 8.2 Tema claro/oscuro

- Los tokens son **variables CSS** en `src/app/globals.css`: `--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-2`, `--text-muted`, `--brand` (`#7c3aed` claro / `#8b5cf6` oscuro), `--success`, `--danger`. Se exponen a Tailwind 4 con `@theme inline` como `bg-surface`, `text-text-2`, `border-border-app`, `text-brand`, etc.
- El modo oscuro se activa con la clase `.dark` en `<html>`.
- **Anti-parpadeo:** `layout.tsx` inyecta un `<script>` inline que lee `ch_theme` (o `prefers-color-scheme`) y anade la clase **antes del primer pintado**; tambien fija `document.documentElement.lang` desde `ch_lang`. `<html suppressHydrationWarning>` evita el warning de React por esa mutacion.

### 8.3 Internacionalizacion

- `src/lib/i18n/translations.ts` (2541 lineas) contiene un diccionario plano por idioma. `LANGS` = **English (en-US), Español (es-EC), Français (fr-FR), Português (pt-BR)**; `LOCALES` mapea cada idioma a su BCP-47 para `Intl`.
- `t(key, vars?)` interpola `{var}` y hace **fallback** en cadena: idioma activo → ingles → la clave literal. Si ves una clave cruda en pantalla (`ev.title`), falta la traduccion.
- El idioma por defecto es **ingles**; el guardado se aplica tras hidratar para no romper el SSR.
- `src/lib/imagenes.ts` reimplementa `tt()` fuera de React (lee `localStorage` directamente) porque valida archivos en callbacks donde no hay hook disponible.

### 8.4 Componentes

| Componente | Archivo | Que hace |
| --- | --- | --- |
| `Sidebar` | `components/shell/sidebar.tsx` | Menu lateral de 15rem con secciones por rol; marca el activo comparando `usePathname()` (con opcion `exact`) |
| `Topbar` | `components/shell/topbar.tsx` | Selector global de institucion (solo superadmin), nombre y roles del usuario, menu de avatar con idioma, tema y cerrar sesion (cierra al hacer clic fuera) |
| `ImagenNas` | `components/ui/imagen-nas.tsx` | Miniatura + subir/reemplazar/eliminar imagen; valida antes de subir; el boton ✕ y el zoom solo aparecen cuando la `<img>` carga bien; `version` rompe la cache tras subir |
| `PerfilInstitucionForm` | `components/instituciones/perfil-form.tsx` | Formulario de perfil y pasarela (ver 7.4) |
| `PasswordInput` | `components/ui/password-input.tsx` | Input de contrasena con boton mostrar/ocultar |
| `LoginArt` | `components/login/login-art.tsx` | Panel decorativo animado del login (keyframes `ch-float` en `globals.css`) |
| Iconos | `components/ui/icons.tsx` | SVG inline: `IconHome`, `IconUsers`, `IconBuilding`, `IconBuildingProfile`, `IconFinance`, `IconVenue`, `IconCalendar`, `IconTicket`, `IconChart`, `IconChat` + el mapa `MODULE_ICONS` |
| `useDialogo()` | `lib/dialogo.tsx` | `confirmar()` / `alerta()` como promesas, con tonos `danger` \| `warning` \| `success` \| `info`. **Sustituye a `window.confirm`** en todo el panel |
| `useLightbox()` | `lib/lightbox.tsx` | Visor de imagen a pantalla completa |

### 8.5 Reglas de imagenes — `src/lib/imagenes.ts` y `src/lib/nas.ts`

- `MAX_IMAGEN_MB = 25`; MIME permitidos `image/jpeg`, `image/png`, `image/webp`; extensiones `.png`, `.jpg`, `.jpeg`, `.webp`. **Debe mantenerse en sincronia con `apps/api/.../multipart.util.ts`.**
- `validarImagen(file)` devuelve un mensaje traducido o `null`, antes de gastar ancho de banda.
- `nasImagenUrl(tipoEntidad, id, tipoArchivo, version?)` arma la URL de lectura directa del NAS: `{NEXT_PUBLIC_NAS_URL}/archivos/activo?tipoEntidad=..&id=..&tipoArchivo=..&v=..`. Entidades soportadas: `EVENTO`, `INSTITUCION`, `LOCAL`, `SALON`, `SUBSALON`, `CONFIGURACION`, `EXPOSITOR`. Tipos de archivo: `PORTADA`, `BANNER`, `GALERIA`, `LOGO`, `CROQUIS`, `FOTO`.
- **La lectura va directa al NAS; la escritura va siempre por la API propia** (que hace de proxy autenticado).

---

## 9. Build y despliegue en produccion

### 9.1 Dockerfile (`apps/web/Dockerfile`)

Multi-stage con cuatro etapas:

| Etapa | Base | Que hace |
| --- | --- | --- |
| `deps` | `node:22-alpine` | `COPY package.json package-lock.json*` + `npm install` |
| `dev` | `deps` | Copia el codigo, expone 3000, `npm run dev` (se usa con bind mount y hot-reload) |
| `build` | `deps` | Recibe `ARG NEXT_PUBLIC_API_URL` y `ARG NEXT_PUBLIC_NAS_URL`, los promueve a `ENV`, fija `NEXT_TELEMETRY_DISABLED=1` y corre `npm run build` |
| `prod` | `node:22-alpine` | Copia `.next/standalone`, `.next/static` y `public`; `NODE_ENV=production`, `HOSTNAME=0.0.0.0`, `PORT=3000`; arranca con `node server.js` |

> ⚠️ **La trampa numero uno del proyecto:** las variables `NEXT_PUBLIC_*` se **incrustan en el bundle durante `npm run build`**, no se leen en runtime. Cambiar `NEXT_PUBLIC_API_URL` en el `.env` del servidor **no tiene efecto** hasta que se reconstruya la imagen (`docker compose build web` o `up -d --build`). El `API_INTERNAL_URL` si es de runtime (lo usa el servidor Node de Next para `/c/[codigo]`).

### 9.2 Composicion en el servidor (`docker-compose.yml`)

Servicios: `caddy`, `api`, `web`, `redis`.

El servicio `web`:

```yaml
web:
  build:
    context: ./apps/web
    target: prod
    args:
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:4000}
      NEXT_PUBLIC_NAS_URL: ${NEXT_PUBLIC_NAS_URL:-https://api-ligaprocorp.ec:3443/api}
  expose: ["3000"]
  environment:
    NODE_ENV: production
    API_INTERNAL_URL: http://api:4000
  depends_on: [api]
  restart: unless-stopped
```

`expose` (no `ports`): el contenedor **no publica puerto al host**; solo Caddy lo alcanza por la red interna de compose.

### 9.3 Caddy (reverse proxy, `Caddyfile` en la raiz)

```
{$DOMAIN} {
  header { Strict-Transport-Security ...; X-Content-Type-Options nosniff;
           X-Frame-Options DENY; Referrer-Policy strict-origin-when-cross-origin;
           Permissions-Policy "camera=(), microphone=(), geolocation=()"; -Server }
  handle_path /api/* { reverse_proxy api:4000 }   # quita el prefijo /api
  handle             { reverse_proxy web:3000 }   # todo lo demas → Next
}
```

- HTTPS automatico con Let's Encrypt (`DOMAIN` y `ACME_EMAIL` desde el `.env`).
- `handle_path` **elimina** el prefijo `/api` antes de reenviar → `https://.../api/auth/login` llega al API como `POST /auth/login`.
- `X-Frame-Options: DENY` implica que el panel **no se puede embeber en un iframe**.

### 9.4 Despliegue

Manual, ejecutado en el servidor `209.126.77.72` dentro de `/root/app` (ver `SERVER_SETUP.md`):

```bash
cd /root/app
./deploy.sh          # git fetch + reset --hard origin/main + docker compose up -d --build + ps
```

O paso a paso:

```bash
git pull origin main
docker compose build web
docker compose up -d web
docker compose logs -f web
```

`deploy.sh` usa `git reset --hard origin/main`: **cualquier cambio local en el servidor se pierde**. Nunca editar archivos directamente alli.

### 9.5 Desarrollo local

Tres opciones, de menor a mayor fidelidad:

1. **Solo el web** (necesita un API corriendo en `localhost:4000`):
   ```bash
   cd apps/web
   npm install
   npm run dev            # http://localhost:3000
   ```
   Requiere `NEXT_PUBLIC_API_URL=http://localhost:4000` en el entorno.

2. **Stack de desarrollo con hot-reload** (`docker-compose.dev.yml`): monta `./apps/web` como volumen, con `WATCHPACK_POLLING` y `CHOKIDAR_USEPOLLING` activados (necesarios en Windows/WSL), volumenes nombrados para `node_modules` y `.next`, y publica 3000 y 4000 en el host.
   ```bash
   docker compose -f docker-compose.dev.yml up --build
   ```

3. **Stack completo con Caddy** (`docker-compose.yml`, que docker compose **mergea automaticamente** con `docker-compose.override.yml` si esta presente): incluye Caddy, asi que es **la unica forma de probar `/verify` y `/reset` en local**, ya que dependen del prefijo `/api`.

   > ⚠️ **`docker-compose.override.yml` es exclusivamente local y NO existe en el servidor de produccion** (su propia cabecera lo dice). Docker compose lo aplica solo, sin `-f`, asi que en tu maquina cambia el comportamiento del stack "de produccion" sin que lo pidas. Lo que aporta:
   > - publica el API en `localhost:4000` (para que Expo lo consuma directo);
   > - amplia `CORS_ORIGIN` a los origenes del bundler de Expo (`https://localhost`, `http://localhost:8100`, `8081`, `19006`, `19000`);
   > - activa **`ASISTENTE_DEV_TOKENS=true`**, que devuelve los tokens de verificacion/reset en la respuesta HTTP para poder probar sin SMTP. **Ese flag no existe en el servidor**; si alguna vez apareciera en prod, filtraria tokens de cuenta.

---

## 10. Variables de entorno (solo nombres)

Los valores viven en el `.env` de la raiz del repo (no versionado) y en el `.env` del servidor. **Nunca se documentan aqui.** La plantilla con los nombres esta en `.env.example`.

| Variable | Momento | Donde se usa en `apps/web` | Para que sirve |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | **Build** (`ARG` → `ENV`) | `lib/api/client.ts`, `app/estado/page.tsx`, `app/c/[codigo]/page.tsx` | URL base del API que usa el navegador. En produccion apunta al dominio con el prefijo `/api` |
| `NEXT_PUBLIC_NAS_URL` | **Build** | `lib/nas.ts` | Base del servicio NAS de archivos para leer imagenes directamente |
| `API_INTERNAL_URL` | Runtime | `app/c/[codigo]/page.tsx` | URL interna del API para el fetch server-side (`http://api:4000` en compose). Si falta, cae a `NEXT_PUBLIC_API_URL` y luego a `http://localhost:4000` |
| `NODE_ENV` | Runtime | Next | `production` en la imagen final |
| `PORT` | Runtime | Next standalone | Puerto de escucha (3000) |
| `HOSTNAME` | Runtime | Next standalone | `0.0.0.0`, imprescindible dentro de Docker |
| `NEXT_TELEMETRY_DISABLED` | Build | Next | Desactiva la telemetria de Vercel |
| `WATCHPACK_POLLING`, `CHOKIDAR_USEPOLLING` | Runtime (dev) | Webpack/Next dev | Hot-reload sobre volumenes montados en Windows |
| `ASISTENTE_DEV_TOKENS` | Runtime (dev) | API, via `docker-compose.override.yml` | **Solo local.** Devuelve los tokens de verificacion/reset en la respuesta HTTP para probar sin SMTP. **No existe en el servidor y no debe existir nunca.** |

Variables que **no** consume el web pero condicionan su comportamiento: `DOMAIN` y `ACME_EMAIL` (Caddy), `COOKIE_SECURE` y `CORS_ORIGIN` (API — si `CORS_ORIGIN` no incluye el origen del panel, todas las llamadas fallan por CORS), y `APP_URL` (API — es el dominio que se escribe en los enlaces `/verify` y `/reset` de los correos).

> **Ningun valor de estas variables se documenta en el handbook.** Los nombres estan en `.env.example`; los valores reales viven en el `.env` del servidor y en el respaldo seguro fuera del repo. Si necesitas un secreto concreto, la referencia de donde obtenerlo esta en `docs/handbook/07-credenciales-y-accesos.md`.

**Restauracion tras formatear una PC:** copiar el `.env` desde el respaldo seguro (fuera del repo), instalar Node 22 y Docker Desktop, `git clone` del repositorio, `npm install` dentro de `apps/web` y levantar el stack. No hay ningun secreto especifico del panel: el panel no tiene credenciales propias.

---

## 11. Convenciones y trampas conocidas

1. **Todo se guarda en MAYUSCULAS.** Si un campo nuevo debe conservar su case (una URL, una clave, un identificador externo), hay que sumarlo al regex `SIN_MAYUSCULAS` de `client.ts` y ponerle la clase `normal-case` al input.
2. **`NEXT_PUBLIC_*` es de build-time.** Cambiarlo exige `docker compose build web`.
3. **`/verify` y `/reset` solo funcionan tras Caddy** (usan `/api/...` relativo). Nunca en `npm run dev` a secas.
4. **El rol se llama `'GESTION OPERATIVA'` con espacio**, no con guion bajo. Escribirlo mal en una comparacion rompe la visibilidad del modulo en silencio.
5. **El panel oculta, el API prohibe.** Cualquier permiso nuevo debe implementarse en `apps/api` con `@Roles(...)`; hacerlo solo en el panel no protege nada.
6. **El access token se pierde al recargar**, por diseno. Si `/auth/refresh` falla (cookie expirada, `COOKIE_SECURE` mal configurado, dominio distinto), el usuario cae al login sin mensaje. Es la causa habitual de "me desloguea solo".
7. **Estados de imagen:** `<ImagenNas>` solo muestra el boton de borrar cuando la `<img>` cargo bien; si el NAS esta caido la miniatura desaparece pero la fila sigue funcionando.
8. **`useSearchParams()` requiere `<Suspense>`** en App Router — ver `gafetes/page.tsx` como referencia al crear paginas nuevas con query string.
9. **Las paginas legales usan estilos inline**, no Tailwind, para ser inmunes a cualquier cambio del sistema de diseno. Si se rediseñan, mantener las URLs `/privacy` y `/eliminar-cuenta` intactas: estan registradas en App Store Connect y Play Console.
10. **Dependencias no usadas** (`react-query`, `react-hook-form`, `zod`): estan en `package.json` pero el codigo no las importa. Si se van a usar, adoptarlas de forma consistente; si no, se pueden retirar en una limpieza.

---

## 12. Documentos relacionados

| Documento | Contenido |
| --- | --- |
| `docs/apis-produccion.md` | Endpoints del API que consume este panel |
| `docs/modelo-datos.md` | Esquema Oracle detras de `EventoRow`, `UsuarioRow`, etc. |
| `docs/nas-espacios.md` | Servicio NAS de archivos y sus entidades |
| `docs/checkout-paymentez.md` | Configuracion de pasarela que edita `PerfilInstitucionForm` |
| `docs/eventos-no-publicar.md` | Bandera `NO_PUBLICAR` y su uso en la revision de tiendas |
| `docs/publicar-tiendas.md`, `docs/entrega-tiendas-equipo.md` | Proceso de publicacion en App Store y Play Store |
| `docs/smtp-setup.md` | Correos que originan los enlaces `/verify` y `/reset` |
| `SERVER_SETUP.md`, `deploy.sh`, `Caddyfile` | Infraestructura y despliegue |
