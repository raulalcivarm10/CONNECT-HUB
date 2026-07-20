# Backend API (NestJS)

Ultima actualizacion: 2026-07-19

Documento de referencia de `apps/api`: el servicio NestJS + Fastify que habla con Oracle
(driver `oracledb` en modo *thin*) y da servicio tanto al panel administrativo (`apps/web`)
como a la app movil de asistentes (`apps/mobile`).

> **Regla de seguridad de este documento:** aqui NUNCA se escriben valores de secretos.
> Solo se documenta el NOMBRE de cada variable, para que sirve y donde vive. Los valores
> reales estan en `/root/app/.env` del servidor de produccion y en el `.env` local
> (ambos ignorados por git). Ver la seccion [Variables de entorno](#variables-de-entorno).

---

## 1. Vista rapida

| Dato | Valor |
| --- | --- |
| Ruta en el monorepo | `C:/proyectos/CONNECT-HUB/apps/api` |
| Nombre del paquete | `connect-hub-api` (`apps/api/package.json`) |
| Framework | NestJS 11 sobre `@nestjs/platform-fastify` |
| Base de datos | Oracle (esquema preexistente, compartido con una app externa) via `oracledb` 6.x *thin* |
| Cache / rate limit | Redis 7 (`ioredis`), contenedor `redis` del compose |
| Puerto interno | `4000` (`API_PORT`) |
| URL publica | `https://connecthub.fourstacklabs.com/api/...` (Caddy hace `handle_path /api/*` y **quita** el prefijo antes de pasar a la API) |
| Swagger | `GET /docs` (en prod: `https://connecthub.fourstacklabs.com/api/docs`) |
| Healthcheck | `GET /health` |
| Imagen Docker | `apps/api/Dockerfile` — multi-stage `deps` → `dev` / `build` → `prod`, base `node:22-alpine` |

### Comandos

```bash
# Desarrollo local (dentro de apps/api)
npm install
npm run start:dev        # nest start --watch

# Build de produccion
npm run build            # nest build → dist/
npm start                # node dist/main.js

# Con Docker (desde la raiz del repo)
docker compose up -d --build api
docker compose logs -f api

# Deploy a produccion (servidor 209.126.77.72, app en /root/app)
# Via canonica: el script del repo, que se ejecuta EN el servidor.
./deploy.sh                # git fetch + reset --hard origin/main + docker compose up -d --build + ps

# Equivalente manual, si solo se quiere tocar la API
git pull && docker compose build api && docker compose up -d api
```

> `deploy.sh` hace `git reset --hard origin/main`: **descarta cualquier cambio local
> del servidor**. Si se editó algo a mano en `/root/app` (fuera de `.env`, que está
> gitignored), se pierde. Es intencional: el servidor debe ser un espejo de `main`.

Notas de la imagen Docker: en **ambas** etapas (`deps` y `prod`) se instala
`fontconfig ttf-dejavu ttf-liberation` con `apk`. No es opcional: `sharp` compone
texto SVG para renderizar los certificados y sin fuentes no dibuja glifos.
`ttf-liberation` (Liberation Sans) es metricamente compatible con Arial, que es la
fuente que usa el editor del panel — asi el PNG generado coincide con el WYSIWYG.

---

## 2. Estructura de carpetas

```
apps/api/
├── Dockerfile
├── package.json
└── src/
    ├── main.ts                     # bootstrap: Fastify, cookies, multipart, CORS, Swagger
    ├── app.module.ts               # raiz: importa todos los modulos
    ├── auth/                       # AUTH ADMIN (panel) — @Global
    │   ├── auth.controller.ts      # /auth/*
    │   ├── auth.service.ts         # login, refresh, recuperar, cambiar-clave
    │   ├── auth.module.ts
    │   ├── jwt-auth.guard.ts       # JwtAuthGuard (Bearer, JWT_SECRET)
    │   ├── roles.guard.ts          # RolesGuard (lee metadata @Roles)
    │   ├── roles.decorator.ts      # @Roles(...)
    │   ├── current-user.decorator.ts # @CurrentUser()
    │   ├── rate-limit.guard.ts     # 5 req/min por IP+ruta, contador en Redis
    │   ├── password.util.ts        # PBKDF2-SHA256 hash/verify
    │   ├── mailer.service.ts       # SMTP del panel (nodemailer)
    │   ├── types.ts                # ROL, JwtUser
    │   └── dto/login.dto.ts
    ├── database/
    │   ├── oracle.module.ts        # @Global
    │   └── oracle.service.ts       # pool, query(), execute(), withConnection(), ping()
    ├── redis/
    │   ├── redis.module.ts         # @Global
    │   └── redis.service.ts        # client ioredis, getJson/setJson/invalidate/ping
    ├── health/
    │   ├── health.module.ts
    │   └── health.controller.ts    # GET /health
    └── modules/
        ├── archivos/               # cliente del NAS externo + helper multipart
        │   ├── nas.service.ts      # POST /archivos, urlActivo()
        │   ├── archivos.service.ts # registro estable en tabla ARCHIVOS
        │   └── multipart.util.ts   # leerImagenMultipart()
        ├── auditoria/              # interceptor global + consulta del log
        ├── eventos/                # CRUD de eventos, detalle, expositores, cupones, certificados
        ├── feedback/               # sugerencias del panel
        ├── finanzas/               # resumen de recaudacion
        ├── fsl-webhooks/           # receptor de webhooks de FourStackLabs (HMAC)
        ├── instituciones/          # alta/aprobacion/perfil/logo de instituciones
        ├── operativa/              # locales, salones, subsalones, configuraciones, mapas
        ├── push/                   # Expo push (registro de token + notificar)
        ├── reportes/               # asistencia e inscritos
        ├── roles/                  # catalogo de roles
        ├── usuarios/               # usuarios del panel
        └── public/                 # TODO lo de la app movil, bajo /public/*
            ├── public.module.ts
            ├── asistente-auth/     # AUTH ASISTENTE (aislado del admin)
            │   ├── asistente-auth.controller.ts
            │   ├── asistente-auth.service.ts
            │   ├── asistente-auth.guard.ts   # AsistenteJwtGuard
            │   ├── asistente-jwt.ts          # contrato del token (aud, typ, TTLs)
            │   ├── asistente.decorator.ts    # @Asistente()
            │   ├── asistente-mailer.service.ts
            │   └── dto.ts
            ├── catalogo/           # instituciones, eventos publicos, vinculacion
            ├── chats/              # chats privados 1-a-1
            ├── comunidad/          # muro por evento (gate por entrada)
            ├── conexiones/         # solicitudes de conexion (networking)
            ├── entradas/           # inscripcion, QR, check-in, certificados
            │   └── certificado-render.ts     # overlay con sharp
            ├── pagos/              # Nuvei/Paymentez
            │   ├── nuvei.client.ts
            │   └── pagos.service.ts
            └── perfil/             # perfil del asistente
```

### Modulos registrados en `app.module.ts`

`ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })` — importante:
**la API no lee ningun `.env` por si misma**. Las variables llegan por el entorno del
contenedor (`env_file: .env` en `docker-compose.yml`). En desarrollo sin Docker hay que
exportarlas a mano o usar `docker compose -f docker-compose.dev.yml`.

Modulos: `OracleModule`, `RedisModule`, `HealthModule`, `AuthModule`, `UsuariosModule`,
`InstitucionesModule`, `RolesModule`, `OperativaModule`, `FinanzasModule`, `EventosModule`,
`ReportesModule`, `FslWebhooksModule`, `AuditoriaModule`, `FeedbackModule`, `PublicModule`,
`PushModule`.

Modulos marcados `@Global` (no hace falta importarlos en ningun sitio):
`OracleModule`, `RedisModule`, `AuthModule`, `AuditoriaModule`, `PushModule`.
`JwtModule.register({ global: true })` dentro de `AuthModule` hace que `JwtService`
tambien sea global — por eso `AsistenteJwtGuard` puede inyectarlo sin importar nada.

> **Nota historica en el codigo:** `operativa.module.ts` dice que `mapas.controller/service`
> quedan "sin registrar a proposito". Ese comentario esta **desactualizado respecto al
> comentario, no al codigo**: efectivamente `MapasController` NO figura en el array
> `controllers` de `OperativaModule`, asi que **las rutas `/mapas/*` no estan activas**
> aunque el codigo exista. Si se necesitan, hay que anadir `MapasController` y
> `MapasService` al modulo.

---

## 3. Arranque: `src/main.ts`

```ts
NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ trustProxy: 1 }),
  { rawBody: true },
);
```

Piezas y el porque de cada una:

| Pieza | Configuracion | Motivo |
| --- | --- | --- |
| `FastifyAdapter({ trustProxy: 1 })` | Confia en **un solo** hop (Caddy) | Hace que `req.ip` resuelva la IP real del cliente (la que Caddy anade a la derecha del `X-Forwarded-For`) y no la de la izquierda, que el cliente puede falsear. Sin esto se podia saltar el rate limit mandando un `X-Forwarded-For` inventado por request. |
| `{ rawBody: true }` | Expone `req.rawBody` (Buffer) | Necesario para verificar la firma HMAC de los webhooks FSL sobre el cuerpo **crudo**, antes de que Nest lo parsee. |
| `@fastify/cookie` | `secret: COOKIE_SECRET` (fallback `'dev-secret'`) | Cookie `ch_refresh` del panel. |
| `@fastify/multipart` | `limits: { fileSize: 25 MB, files: 1 }` | Subida de imagenes. Debe coincidir con `MAX_IMAGEN_MB` de `multipart.util.ts`. |
| CORS | `origin: CORS_ORIGIN.split(',')` o `true`; `credentials: true`; `methods: GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS` | La lista explicita de metodos es **obligatoria**: `@fastify/cors` solo permite `GET,HEAD,POST` por defecto y sin ella el navegador bloquea `PATCH`/`DELETE` con "Failed to fetch". |
| `ValidationPipe` global | `{ whitelist: true, transform: true }` | Valida los DTOs de `class-validator` y descarta propiedades no declaradas. |
| Swagger | `SwaggerModule.setup('docs', ...)`, titulo "CONNECT-HUB API", `addBearerAuth()` | Documentacion viva en `/docs`. |
| Listen | `app.listen(API_PORT ?? 4000, '0.0.0.0')` | `0.0.0.0` para que Caddy lo alcance desde otro contenedor. |

**No hay `setGlobalPrefix`.** Las rutas son literalmente `/auth/login`, `/eventos`,
`/public/...`. El prefijo `/api` lo pone y lo quita Caddy (`handle_path /api/*` →
`reverse_proxy api:4000`). Por eso la cookie de refresh se emite con `path: '/'`:
para que viaje aunque la API vaya tras `/api` en el proxy.

---

## 4. Modelo de autenticacion

Hay **dos sistemas de auth completamente separados** que conviven en el mismo proceso.
No comparten secreto, ni guard, ni tabla, ni clase. Un token de uno **nunca** vale en el otro.

| | Panel administrativo | App movil (asistente) |
| --- | --- | --- |
| Guard | `JwtAuthGuard` (`src/auth/jwt-auth.guard.ts`) | `AsistenteJwtGuard` (`src/modules/public/asistente-auth/asistente-auth.guard.ts`) |
| Secreto access | `JWT_SECRET` | `JWT_ASISTENTE_SECRET` |
| Secreto refresh | `JWT_REFRESH_SECRET` | `JWT_ASISTENTE_REFRESH_SECRET` |
| Claim `aud` | *ninguno* | **`aud: 'asistente'` obligatorio** |
| Claim `typ` | `typ: 'refresh'` solo en el refresh | `typ: 'access' \| 'refresh' \| 'reset'`, el guard exige `'access'` |
| Sujeto (`sub`) | `COD_USUARIO` (el correo de login) | `ID_CLIENTE` (UUID) |
| Tabla | `USUARIOS_INSTITUCIONES` | `USUARIOS` |
| TTL access | 15 min | 15 min (`ASISTENTE_ACCESS_TTL`) |
| TTL refresh | 7 dias | 30 dias (`ASISTENTE_REFRESH_TTL`) |
| Transporte del refresh | **Cookie** `ch_refresh` httpOnly | **Body** del `POST /public/auth/refresh` |
| Decorador de inyeccion | `@CurrentUser()` → `req.user` | `@Asistente()` → `req.asistente` |
| Roles | Si (`RolesGuard` + `@Roles`) | No hay roles |

### 4.1 Auth admin

**Payload del access token (`JwtUser`, `src/auth/types.ts`)** — se firma el objeto entero,
asi que el panel puede pintar el perfil sin llamar a `/auth/me`:

```ts
{
  sub: string;              // COD_USUARIO (correo)
  email: string;
  nombres, apellidos: string | null;
  nombreCompleto: string;
  esSuper: boolean;         // ES_SUPER = 'S'
  idInstitucion: number | null;
  institucion: string | null;
  roles: string[];          // nombres de ROLES_INSTITUCIONES
  debeCambiarClave: boolean;// DEBE_CAMBIAR_CLAVE = 'S'
}
```

**Roles** (`ROL` en `types.ts`, tal como existen en la tabla `ROLES_INSTITUCIONES`):
`SYSTEM`, `ADMINISTRATIVO`, `FINANCIERO`, `GESTION OPERATIVA` (con espacio), `EVENTOS`.

**`RolesGuard`**: si el handler/controller no declara `@Roles(...)`, pasa. Si los declara,
pasa el usuario si `esSuper === true` **o** si alguno de sus `roles` esta en la lista.
El superadmin siempre pasa cualquier `@Roles`.

**Contrasenas** (`password.util.ts`): formato compartido con el seed inicial de la BD.

- `CLAVE` = `base64(PBKDF2-SHA256(password, salt, 100000 iteraciones, 32 bytes))` — 44 chars.
- `SALT` = `pbkdf2sha256$<iteraciones>$<salt en hex>`.
- La comparacion usa `timingSafeEqual`.
- Las claves temporales se generan con `randomBytes(9).toString('base64url')`.

**Validaciones de `validateUser`** (en orden): credenciales correctas → `ESTADOS = 'A'` →
si no es superadmin, `INSTITUCIONES.ESTADO = 'APROBADA'` → si no es superadmin, debe tener
al menos un rol. Cada fallo lanza `Unauthorized`/`Forbidden` con mensaje distinto.

**Bloqueo por clave temporal**: si `debeCambiarClave` es true, `JwtAuthGuard` lanza 403 en
**todo** salvo `/auth/cambiar-clave`, `/auth/logout`, `/auth/me`, `/auth/refresh`.

**Cookie de refresh** (`AuthController.setRefreshCookie`):
nombre `ch_refresh`, `httpOnly: true`, `sameSite: 'lax'`, `secure: COOKIE_SECURE === 'true'`,
`path: '/'`, `maxAge: 7 * 24 * 3600`.

**Rotacion**: `POST /auth/refresh` verifica el refresh con `JWT_REFRESH_SECRET`, exige
`typ === 'refresh'`, y **relee el usuario de la BD** (para que roles, estado de institucion
y flags viajen frescos). Emite un access nuevo y **reescribe la cookie** con un refresh nuevo.
No hay lista de revocacion: los refresh son stateless, un logout solo borra la cookie del
navegador.

### 4.2 Auth de asistente

Contrato en `asistente-jwt.ts`. El guard rechaza el token si `aud !== 'asistente'`,
si `typ !== 'access'` o si falta `sub`. El chequeo de `typ` no es decorativo: sin el,
un token de **reset** de contrasena (mismo `aud`, mismo secreto) pasaria como access.

Metodos de ingreso soportados (`asistente-auth.service.ts`):

| Metodo | Endpoint | Como se valida |
| --- | --- | --- |
| Usuario/clave | `POST /public/auth/login` | Hash propio (`verifyPacked` sobre `CLAVE_HASH`), con `DUMMY_PACKED` para no filtrar por timing si el usuario no existe |
| Registro | `POST /public/auth/register` | Crea en `USUARIOS` + envia correo de verificacion |
| Google | `POST /public/auth/google` | `GET https://oauth2.googleapis.com/tokeninfo?id_token=...`; el `aud` debe estar en `GOOGLE_CLIENT_IDS` (lista separada por comas) |
| Apple | `POST /public/auth/apple` | `jwtVerify` de `jose` contra el JWKS de Apple: verifica firma + issuer + audience contra `APPLE_CLIENT_IDS` + expiracion |
| Canje del servicio de pagos | `POST /public/auth/pagos-exchange` | Preferido: verifica firma/expiracion localmente con `PAGOS_JWT_SECRET`. Respaldo (si no hay secreto): introspeccion `GET {PAGOS_API_URL}/usuario/me` con el token |

`ASISTENTE_DEV_TOKENS=true` es el **unico** flag que hace que los tokens de verificacion y
reset se devuelvan en la respuesta HTTP. Vive solo en el override local (gitignored) y
nunca depende de si hay SMTP configurado — asi en produccion jamas se filtra el secreto
al llamante aunque el correo falle.

---

## 5. Endpoints ADMIN (panel)

Todas estas rutas se consumen desde el navegador como `https://…/api/<ruta>`.
La columna "Guard / rol" indica lo que exige el codigo. Recordatorio: el
superadmin (`esSuper`) atraviesa cualquier `@Roles`.

### 5.1 `/auth` — `auth.controller.ts`

| Metodo | Ruta | Guard / rol | Para que sirve |
| --- | --- | --- | --- |
| POST | `/auth/login` | `RateLimitGuard` (5/min por IP) | Login con `usuario` (= `COD_USUARIO`, el correo) + `password`. Devuelve `{ accessToken, user }` y deja la cookie `ch_refresh` |
| POST | `/auth/refresh` | publico (usa la cookie) | Rota tokens releyendo el usuario de la BD |
| POST | `/auth/logout` | publico | Borra la cookie `ch_refresh` |
| GET | `/auth/me` | `JwtAuthGuard` | Devuelve el perfil tal cual viene en el token |
| POST | `/auth/recuperar` | `RateLimitGuard` | "Olvide mi clave": genera una temporal aleatoria, marca `DEBE_CAMBIAR_CLAVE='S'` y la envia por correo. Respuesta **generica** para no revelar que usuarios existen. Sin SMTP, devuelve la clave en la respuesta (modo desarrollo) |
| POST | `/auth/cambiar-clave` | `JwtAuthGuard` | Cambia la clave verificando la actual, exige que sea distinta, levanta el bloqueo y devuelve una sesion fresca |

### 5.2 `/usuarios` — `usuarios.controller.ts`

Controller: `@UseGuards(JwtAuthGuard, RolesGuard)`.

| Metodo | Ruta | Rol | Para que sirve |
| --- | --- | --- | --- |
| GET | `/usuarios?idInstitucion=` | `SYSTEM`, `ADMINISTRATIVO` | Usuarios de la institucion; el superadmin ve todas o filtra |
| POST | `/usuarios` | `SYSTEM` | Crear usuario con sus roles |
| PATCH | `/usuarios/:cod` | `SYSTEM` | Editar nombres, apellidos, email y contrasena (opcional) |
| DELETE | `/usuarios/:cod` | `SYSTEM` | Eliminar definitivamente (bloquea auto-borrado y borrar superadmins) |
| PATCH | `/usuarios/:cod/estado` | `SYSTEM` | Activar / desactivar |
| PATCH | `/usuarios/:cod/roles` | `SYSTEM` | Reemplazar el conjunto de roles |

### 5.3 `/instituciones` — `instituciones.controller.ts`

Controller: `@UseGuards(JwtAuthGuard)`. **No usa `RolesGuard`**: la autorizacion fina
("solo superadmin", "solo SYSTEM/ADMINISTRATIVO de la propia institucion") se hace dentro
de `InstitucionesService`.

| Metodo | Ruta | Autorizacion | Para que sirve |
| --- | --- | --- | --- |
| GET | `/instituciones` | autenticado | Superadmin: todas. Usuario normal: la suya |
| POST | `/instituciones` | solo super | Crear institucion en estado `PENDIENTE` |
| POST | `/instituciones/:id/aprobar` | solo super | Aprobar y crear su usuario generico `SYSTEM` |
| POST | `/instituciones/:id/rechazar` | solo super | Estado → `RECHAZADA` |
| POST | `/instituciones/:id/suspender` | solo super | Estado → `SUSPENDIDA` |
| POST | `/instituciones/:id/reactivar` | solo super | Estado → `APROBADA` |
| GET | `/instituciones/:id/perfil` | super o propio | Perfil **sin** las credenciales de la pasarela: en su lugar devuelve banderas `TIENE_USUARIO_PASARELA`, `TIENE_CONTRASENA_PASARELA`, `TIENE_TOKEN_PASARELA`, `TIENE_APP_CODE_*`, `TIENE_APP_KEY_*` (1/0), para que el panel muestre "configurado" sin ver el valor |
| PATCH | `/instituciones/:id` | super, o `SYSTEM`/`ADMINISTRATIVO` propio | Editar perfil. Las credenciales de pasarela son **write-only**: se escriben pero nunca se devuelven |
| DELETE | `/instituciones/:id` | solo super | Eliminar. Bloqueado si tiene usuarios, locales, mapas, tarjetas o clientes |
| POST | `/instituciones/:id/logo` | super o propio | Sube el logo al NAS (`multipart/form-data`, campo `file`) |
| DELETE | `/instituciones/:id/logo` | super o propio | Quita el logo |

### 5.4 `/roles` — `roles.controller.ts`

| Metodo | Ruta | Guard | Para que sirve |
| --- | --- | --- | --- |
| GET | `/roles` | `JwtAuthGuard` | Catalogo `ID_ROL, NOMBRE, DESCRIPCION` de `ROLES_INSTITUCIONES` |

### 5.5 Operativa — `operativa.controller.ts`

Controller sin prefijo (`@Controller()`), guards `JwtAuthGuard, RolesGuard` y
`@Roles(SYSTEM, GESTION_OPERATIVA)` a nivel de clase — **todas** las rutas de abajo exigen
uno de esos dos roles (o superadmin).

| Metodo | Ruta | Para que sirve |
| --- | --- | --- |
| GET | `/locales?idInstitucion=` | Locales de la institucion |
| POST | `/locales` | Crear local |
| PATCH | `/locales/:id` | Editar local |
| DELETE | `/locales/:id` | Eliminar (si no tiene salones ni eventos) |
| POST | `/locales/:id/plano` | Subir plano/croquis al NAS (`file`) |
| DELETE | `/locales/:id/plano` | Eliminar el plano |
| GET | `/locales/:id/salones` | Salones de un local |
| POST | `/salones` | Crear salon |
| PATCH | `/salones/:id` | Editar salon |
| DELETE | `/salones/:id` | Eliminar (sin subsalones/configuraciones/eventos) |
| POST | `/salones/:id/imagen` | Subir imagen de referencia del salon (`file`) |
| DELETE | `/salones/:id/imagen` | Eliminar imagen del salon |
| GET | `/salones/:id/subsalones` | Subsalones de un salon |
| POST | `/subsalones` | Crear subsalon |
| PATCH | `/subsalones/:id` | Editar subsalon |
| DELETE | `/subsalones/:id` | Eliminar (si no esta en uso) |
| POST | `/subsalones/:id/imagen` | Subir imagen del subsalon (`file`) |
| DELETE | `/subsalones/:id/imagen` | Eliminar imagen del subsalon |
| GET | `/salones/:id/configuraciones` | Configuraciones de subdivision de un salon |
| POST | `/configuraciones` | Crear configuracion (combina subsalones) |
| PATCH | `/configuraciones/:id` | Editar configuracion |
| DELETE | `/configuraciones/:id` | Eliminar (si no la usan eventos) |
| POST | `/configuraciones/:id/imagen` | Subir imagen de la configuracion (`file`) |
| DELETE | `/configuraciones/:id/imagen` | Eliminar imagen de la configuracion |

**`/mapas/*` (INACTIVO)** — `mapas.controller.ts` implementa `GET /mapas`, `POST /mapas`
(multipart con `nombreMapa`, `descripcion?`, `idLocal?`, `idSalon?`, `idSubsalon?`,
`idConfiguracion?`, `subsalones?` csv), `GET /mapas/:id/imagen` (con ETag/304 y cache Redis),
`PATCH /mapas/:id` y `DELETE /mapas/:id`, pero **el controller no esta registrado** en
`OperativaModule`, asi que estas rutas devuelven 404 hoy.

**`ScopeService`** (`operativa/scope.service.ts`) es la pieza clave de aislamiento
multi-institucion de este modulo. Como varias relaciones no tienen FK declarada en la BD,
el ambito se verifica **siempre por JOIN** hasta `LOCALES.ID_INSTITUCION`:

- `institucionForWrite(actor, requested?)` — el superadmin **debe** indicar `idInstitucion`; el resto usa la suya.
- `institucionForRead(actor, requested?)` — devuelve `null` (= todas) solo para el superadmin.
- `local()`, `salon()`, `subsalon()`, `configuracion()`, `mapa()` — cargan la fila, resuelven su institucion por JOIN y lanzan 403 si no coincide con la del actor.

### 5.6 `/eventos` — `eventos.controller.ts`

Guards `JwtAuthGuard, RolesGuard` + `@Roles(SYSTEM, EVENTOS)` a nivel de clase.

| Metodo | Ruta | Para que sirve |
| --- | --- | --- |
| GET | `/eventos?idInstitucion=` | Eventos de la institucion (es lo que alimenta la app movil) |
| GET | `/eventos/agenda?fecha=&idSalon=&idLocal=` | Horarios ocupados de una fecha, por salon o por local |
| POST | `/eventos` | Crear evento reservando salon completo, una configuracion (modelo) o un subsalon |
| PATCH | `/eventos/:id` | Editar (revalida disponibilidad) |
| PATCH | `/eventos/:id/destacar` | Destacar/quitar destacado (`destacado`, `orden`) — controla el hero de la app |
| DELETE | `/eventos/:id` | Eliminar. Bloqueado si tiene inscritos, entradas o pagos |
| POST | `/eventos/:id/imagen` | Subir imagen al NAS (`file` + `tipoArchivo?` = `PORTADA`\|`BANNER`\|`GALERIA`, default `PORTADA`) |
| DELETE | `/eventos/:id/imagen` | Quitar la portada |
| GET | `/eventos/:id/cupones` | Cupones de descuento del evento |
| POST | `/eventos/:id/cupones` | Crear cupon (codigo unico por evento) |
| DELETE | `/eventos/:id/cupones/:idCupon` | Eliminar cupon |
| GET | `/eventos/:id/dias` | Dias y rangos horarios (`EVENTO_HORAS`) |
| GET | `/eventos/:id/detalle` | Detalle del evento (`{}` si aun no existe) |
| PUT | `/eventos/:id/detalle` | Upsert 1:1 del detalle |
| GET | `/eventos/:id/expositores` | Expositores ordenados |
| POST | `/eventos/:id/expositores` | Anadir expositor |
| PATCH | `/eventos/:id/expositores/:idExp` | Editar expositor |
| DELETE | `/eventos/:id/expositores/:idExp` | Eliminar expositor |
| POST | `/eventos/:id/expositores/:idExp/imagen` | Subir foto del expositor al NAS (`file`) |
| DELETE | `/eventos/:id/expositores/:idExp/imagen` | Quitar la foto |
| POST | `/eventos/:id/certificados/plantilla` | Subir plantilla-imagen del certificado + `config` (JSON del overlay) |
| GET | `/eventos/:id/certificados/plantilla` | Config + dimensiones de la plantilla |
| GET | `/eventos/:id/certificados/plantilla/imagen` | Imagen cruda de la plantilla (para el editor, `Cache-Control: no-store`) |
| GET | `/eventos/:id/certificados/asistentes` | Asistentes del evento, para seleccionar y generar |
| POST | `/eventos/:id/certificados/generar` | Genera certificados en lote (`idsClientes?`; si se omite, todos los que asistieron) |
| GET | `/eventos/:id/gafetes` | Gafetes imprimibles: participantes con entrada + QR de check-in |

### 5.7 `/finanzas` — `finanzas.controller.ts`

Guards `JwtAuthGuard, RolesGuard` + `@Roles(SYSTEM, FINANCIERO)`.

| Metodo | Ruta | Para que sirve |
| --- | --- | --- |
| GET | `/finanzas/resumen?idInstitucion=&idEvento=&mes=&anio=` | Recaudacion por evento. El superadmin ve todas o filtra |

### 5.8 `/reportes` — `reportes.controller.ts`

Guards `JwtAuthGuard, RolesGuard` + `@Roles(SYSTEM, ADMINISTRATIVO, EVENTOS)`.

| Metodo | Ruta | Para que sirve |
| --- | --- | --- |
| GET | `/reportes/asistencia?idInstitucion=&anio=&meses=&idEvento=` | Resumen de asistencia por evento (`meses` es csv, ej. `1,2,3`) |
| GET | `/reportes/asistencia/:idEvento/inscritos` | Detalle de inscritos con su asistencia |

### 5.9 `/auditoria` — `auditoria.controller.ts`

| Metodo | Ruta | Autorizacion | Para que sirve |
| --- | --- | --- | --- |
| GET | `/auditoria?accion=&usuario=&desde=&hasta=&limit=&offset=` | `JwtAuthGuard` + **solo superadmin** (validado en el service) | Registro de actividad: logins, mutaciones y errores. `limit` se acota a 1..500 (default 100) |

### 5.10 `/feedback` — `feedback.controller.ts`

| Metodo | Ruta | Autorizacion | Para que sirve |
| --- | --- | --- | --- |
| POST | `/feedback` | `JwtAuthGuard` | Enviar sugerencia/recomendacion |
| GET | `/feedback?estado=` | `JwtAuthGuard` | Superadmin: todo. Usuario: solo el suyo |
| PATCH | `/feedback/:id/estado` | solo super | Cambiar estado |
| PATCH | `/feedback/:id/responder` | solo super | Responder |

### 5.11 `/health`

| Metodo | Ruta | Guard | Para que sirve |
| --- | --- | --- | --- |
| GET | `/health` | publico | Estado de la API y sus dependencias |

Respuesta: `{ status, oracle, redis, nas, smtp: { configured }, timestamp }`.
`status` es `'ok'` solo si **Oracle y Redis** responden; el NAS es externo, si cae la API
sigue operativa (solo degradada) y eso no baja el status a `degraded` por si solo.
Las tres sondas corren en paralelo con `Promise.allSettled`; el NAS se considera vivo si
responde HTTP (aunque sea 404) dentro de 4 s. Este endpoint es el que usa el `healthcheck`
del `docker-compose.yml`.

---

## 6. Endpoints PUBLICOS (`/public/*`, app movil)

Todos se consumen como `https://connecthub.fourstacklabs.com/api/public/...`.
En la columna "Auth", `AsistenteJwtGuard` significa `Authorization: Bearer <access token de asistente>`.

### 6.1 `/public/auth` — `asistente-auth.controller.ts`

| Metodo | Ruta | Auth | Para que sirve |
| --- | --- | --- | --- |
| POST | `/public/auth/register` | `RateLimitGuard` | Registro de asistente |
| POST | `/public/auth/login` | `RateLimitGuard` | Login usuario/clave |
| POST | `/public/auth/google` | `RateLimitGuard` | Login/registro con Google (`idToken`) |
| POST | `/public/auth/apple` | `RateLimitGuard` | Login/registro con Apple (`identityToken`) |
| POST | `/public/auth/pagos-exchange` | `RateLimitGuard` | Canjea el token del servicio de pagos externo por una sesion ConnectHub |
| POST | `/public/auth/verify` | publico | Verificar email con token |
| POST | `/public/auth/refresh` | publico | Renovar tokens — **el refresh va en el body**, no en cookie |
| POST | `/public/auth/forgot` | `RateLimitGuard` | Envia enlace de reset (NO cambia la clave) |
| POST | `/public/auth/reset` | `RateLimitGuard` | Confirma el reset con el token + nueva clave |
| GET | `/public/auth/me` | `AsistenteJwtGuard` | Perfil del asistente autenticado |
| POST | `/public/auth/resend-verification` | `AsistenteJwtGuard` | Reenvia el correo de verificacion |
| PATCH | `/public/auth/onboarding` | `AsistenteJwtGuard` | Completar/actualizar onboarding |
| DELETE | `/public/auth/me` | `AsistenteJwtGuard` | **Eliminar cuenta**: anonimiza el usuario reteniendo los datos financieros. Requisito de cumplimiento de Apple |

### 6.2 `/public` catalogo — `catalogo.controller.ts`

| Metodo | Ruta | Auth | Para que sirve |
| --- | --- | --- | --- |
| GET | `/public/instituciones/resolver?codigo=` | publico | Resuelve un `CODIGO_CONEXION` a su institucion (el flujo estilo Whova) |
| GET | `/public/instituciones/:id/logo` | publico | Logo de la institucion (imagen, `Cache-Control: public, max-age=86400`) |
| GET | `/public/eventos?codigo=&q=&page=&size=` | publico | Eventos publicos de una institucion (paginado) |
| GET | `/public/eventos/destacados?codigo=` | publico | Eventos destacados (hero), tope 10 |
| GET | `/public/eventos/:id` | publico | Detalle compuesto de un evento |
| GET | `/public/mis-eventos?q=&page=&size=` | `AsistenteJwtGuard` | Feed agregado: eventos de **todas** mis instituciones |
| POST | `/public/instituciones/vincular` | `AsistenteJwtGuard` | Vincula al asistente con una institucion por `codigo` |
| GET | `/public/instituciones/mias` | `AsistenteJwtGuard` | Instituciones a las que pertenece el asistente |

### 6.3 `/public` entradas y certificados — `entradas.controller.ts`

| Metodo | Ruta | Auth | Para que sirve |
| --- | --- | --- | --- |
| POST | `/public/eventos/:id/inscripcion` | `AsistenteJwtGuard` | Inscribirse. Gratis → directo; un workshop exige entrada del evento padre |
| GET | `/public/mis-entradas` | `AsistenteJwtGuard` | Eventos adquiridos |
| GET | `/public/entradas/:id/qr` | `AsistenteJwtGuard` | Payload del QR de una entrada |
| POST | `/public/entradas/validar` | **publico** | Check-in por QR (escaner del staff): marca asistencia y emite certificado |
| GET | `/public/certificados` | `AsistenteJwtGuard` | Certificados del asistente |
| GET | `/public/certificados/:codigo` | publico | Verificar un certificado por su codigo |
| GET | `/public/certificados/:codigo/imagen` | publico | PNG del certificado (plantilla + overlay), `Cache-Control: public, max-age=300` |

Los dos ultimos son **publicos a proposito**: son la landing de verificacion estilo Credly
que se comparte en LinkedIn. `POST /public/entradas/validar` tambien es publico porque lo
usa el escaner del staff, que no tiene sesion de asistente; la seguridad la da que el
`qrToken` es opaco e impredecible.

### 6.4 `/public/pagos` — `pagos.controller.ts`

| Metodo | Ruta | Auth | Para que sirve |
| --- | --- | --- | --- |
| GET | `/public/pagos/tarjetas?idInstitucion=` | `AsistenteJwtGuard` | Tarjetas guardadas del asistente en esa institucion |
| POST | `/public/pagos/tarjetas` | `AsistenteJwtGuard` | Agrega (tokeniza) una tarjeta |
| DELETE | `/public/pagos/tarjetas/:id` | `AsistenteJwtGuard` | Elimina una tarjeta guardada |
| GET | `/public/pagos/resumen/:idEvento` | `AsistenteJwtGuard` | Subtotal, IVA y total antes de pagar (calculado en el servidor) |
| POST | `/public/pagos/cupon/:idEvento` | `AsistenteJwtGuard` | Valida un cupon (existe/activo/usos) y devuelve el descuento |
| POST | `/public/pagos/debito` | `AsistenteJwtGuard` | Cobro directo con tarjeta guardada → emite entrada si aprueba |
| POST | `/public/pagos/checkout` | `AsistenteJwtGuard` | Checkout hospedado (Link to Pay) → `payment_url` |
| POST | `/public/pagos/checkout/iniciar` | `AsistenteJwtGuard` | Checkout embebido (widget PaymentCheckout) → `reference` + `envMode` |
| POST | `/public/pagos/checkout/confirmar` | `AsistenteJwtGuard` | Confirma tras el `onResponse` del widget: `verify` → emite entrada |
| GET | `/public/pagos/estado/:referencia` | `AsistenteJwtGuard` | Estado de un pago propio (polling) |
| POST | `/public/pagos/confirmacion-email` | `AsistenteJwtGuard` | Envia el correo de confirmacion de pago (best-effort) |
| POST | `/public/pagos/webhook` | **publico** | Confirmacion asincrona de la pasarela (idempotente) |

### 6.5 `/public/comunidad` — `comunidad.controller.ts`

Guard `AsistenteJwtGuard` a nivel de clase. El acceso a cada comunidad esta **gateado por
tener entrada al evento**.

| Metodo | Ruta | Para que sirve |
| --- | --- | --- |
| GET | `/public/comunidad/mis-comunidades` | Mis comunidades = eventos con entrada (hub de chats) |
| GET | `/public/comunidad/miembros?idEvento=` | Participantes (solo los de perfil publico) |
| GET | `/public/comunidad?idEvento=&page=&size=` | Muro de la comunidad del evento |
| POST | `/public/comunidad` | Publicar mensaje (`idEvento`, `mensaje` 1..1000) |
| POST | `/public/comunidad/salir` | Salir de la comunidad de un evento |
| POST | `/public/comunidad/ingresar` | Volver a ingresar |

### 6.6 `/public/conexiones` — `conexiones.controller.ts`

Guard `AsistenteJwtGuard` a nivel de clase.

| Metodo | Ruta | Para que sirve |
| --- | --- | --- |
| POST | `/public/conexiones/solicitar` | Enviar solicitud (o aceptar automaticamente la reciproca) |
| POST | `/public/conexiones/responder` | Aceptar o rechazar (`idConexion`, `aceptar`) |
| GET | `/public/conexiones/solicitudes` | Solicitudes pendientes recibidas |
| GET | `/public/conexiones` | Mis conexiones aceptadas |

### 6.7 `/public/chats` — `chats.controller.ts`

Guard `AsistenteJwtGuard` a nivel de clase.

| Metodo | Ruta | Para que sirve |
| --- | --- | --- |
| GET | `/public/chats` | Mis chats privados |
| POST | `/public/chats/abrir` | Abrir (o reutilizar) chat con otro asistente (`idCliente`) |
| GET | `/public/chats/:idChat/mensajes?page=&size=` | Mensajes del chat |
| POST | `/public/chats/:idChat/mensajes` | Enviar mensaje (1..1000 chars) |

### 6.8 `/public/perfil` — `perfil.controller.ts`

Guard `AsistenteJwtGuard` a nivel de clase.

| Metodo | Ruta | Para que sirve |
| --- | --- | --- |
| GET | `/public/perfil/me` | Mi perfil editable |
| PATCH | `/public/perfil/me` | Actualizar perfil (nombre, apellido, celular, `tipoId`/`numeroId`, `emailFactura`, profesion, empresa, bio, LinkedIn, `visibilidad` `PUBLICO`\|`PRIVADO`) |
| POST | `/public/perfil/me/foto` | Subir/actualizar la foto de perfil (NAS, campo `file`) |
| GET | `/public/perfil/:idCliente` | Ver el perfil de otro asistente (respeta la privacidad) |

### 6.9 `/public/push` — `push.controller.ts`

| Metodo | Ruta | Auth | Para que sirve |
| --- | --- | --- | --- |
| POST | `/public/push/registrar` | `AsistenteJwtGuard` | Registra el Expo push token del dispositivo (`expoToken`, `platform?`) |

### 6.10 `/fsl/webhooks` — `fsl-webhooks.controller.ts`

| Metodo | Ruta | Auth | Para que sirve |
| --- | --- | --- | --- |
| POST | `/fsl/webhooks` | **firma HMAC**, sin JWT | Receptor de webhooks de FourStackLabs |

Marcado con `@ApiExcludeController()` — no aparece en Swagger a proposito.

---

## 7. Acceso a Oracle

`src/database/oracle.service.ts`. El modulo es `@Global`, asi que `OracleService` se
inyecta en cualquier service sin importar nada.

### Configuracion global del driver

```ts
oracledb.outFormat    = oracledb.OUT_FORMAT_OBJECT;  // filas como { COLUMNA: valor }
oracledb.fetchAsString = [oracledb.CLOB];            // CLOB → string directo
oracledb.fetchAsBuffer = [oracledb.BLOB];            // BLOB → Buffer directo
```

Es **modo thin**: no hace falta Oracle Instant Client en la imagen. Por eso la imagen
Docker es un `node:22-alpine` limpio.

### Pool

Se crea en `onModuleInit`, pero **si Oracle no esta disponible al arrancar la API igual
levanta**: se loguea el error, `/health` reporta el estado y el pool se reintenta en el
primer uso (`createPool()` es idempotente y se llama desde `withConnection`).

| Opcion | Valor |
| --- | --- |
| `user` / `password` / `connectString` | `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING` (los tres con `getOrThrow`) |
| `poolMin` | `ORACLE_POOL_MIN` (default 2) |
| `poolMax` | `ORACLE_POOL_MAX` (default 10) |
| `poolIncrement` | 1 |
| `poolTimeout` | 60 s |

`onModuleDestroy` cierra el pool con `close(10)` (10 s de gracia).

### Patron de queries

```ts
// SELECT → array de objetos { COLUMNA: valor }
const rows = await this.oracle.query<{ ID_EVENTO: number }>(
  `SELECT ID_EVENTO FROM EVENTOS WHERE ID_LOCAL = :id`,
  { id: idLocal },
);

// INSERT/UPDATE/DELETE → autoCommit: true por defecto
await this.oracle.execute(
  `UPDATE USUARIOS_INSTITUCIONES SET ESTADOS = :e WHERE COD_USUARIO = :cod`,
  { e: 'I', cod },
);
```

Reglas de oro que sigue todo el codigo:

1. **Siempre binds nombrados** (`:nombre`), jamas interpolacion de strings — es la defensa
   contra inyeccion SQL.
2. Los nombres de columna vienen en MAYUSCULAS en el objeto resultado.
3. Para `INSERT ... RETURNING` se usan los atajos expuestos por el service:
   `this.oracle.BIND_OUT`, `this.oracle.NUMBER`, `this.oracle.BLOB`, `this.oracle.CLOB`.
4. Los `NULL` numericos se pasan tipados (`{ val: null, type: this.oracle.NUMBER }`) para
   que Oracle no se confunda con el tipo del bind (ver `auditoria.service.ts`).

### Transacciones

Cuando hay varias sentencias que deben ser atomicas se usa `withConnection` y se hace el
`commit()` explicito al final. `withConnection` garantiza el `conn.close()` en el `finally`,
y como no se pasa `autoCommit: true` a los `execute` internos, cualquier excepcion antes
del `commit` deja la transaccion sin confirmar (rollback implicito al cerrar la conexion).

```ts
await this.oracle.withConnection(async (conn) => {
  await conn.execute(sql1, binds1);
  await conn.execute(sql2, binds2);
  await conn.commit();     // <- explicito
});
```

Sitios que usan este patron: `eventos.service.ts` (4 bloques: crear/editar evento,
expositores, certificados), `instituciones.service.ts` (2: aprobar, eliminar),
`usuarios.service.ts` (3: crear, roles, eliminar), `operativa/configuraciones.service.ts` (3),
`operativa/locales.service.ts`, `operativa/mapas.service.ts` (3),
`archivos.service.ts`, `fsl-webhooks.service.ts` (aprovisionamiento de institucion),
`public/asistente-auth/asistente-auth.service.ts` (eliminacion/anonimizacion de cuenta).

### Redis

`src/redis/redis.service.ts` expone `client` (ioredis, `maxRetriesPerRequest: 2`) y
utilidades `getJson`, `setJson(key, value, ttl)`, `invalidate(pattern)` y `ping()`.
Usos actuales: el contador del `RateLimitGuard` y la cache de imagenes de mapas.
Un error de Redis se loguea pero no tumba el proceso.

---

## 8. Integraciones

### 8.1 SMTP / correo

Hay **dos** servicios de correo, deliberadamente separados, que **comparten las mismas
variables de entorno** pero tienen su propio `transporter`:

| Servicio | Archivo | Correos que envia |
| --- | --- | --- |
| `MailerService` (panel, `@Global` via AuthModule) | `src/auth/mailer.service.ts` | Clave temporal de recuperacion; credenciales de usuario nuevo; bienvenida de institucion (credenciales SYSTEM + codigo de conexion); credenciales del entorno demo |
| `AsistenteMailerService` (app movil) | `src/modules/public/asistente-auth/asistente-mailer.service.ts` | Verificacion de cuenta; reset de contrasena; confirmacion de compra/inscripcion |

Ambos: `nodemailer`, host `SMTP_HOST`, puerto `SMTP_PORT` (default 587), `secure` solo si
el puerto es 465, auth opcional (solo si hay `SMTP_USER`), remitente `SMTP_FROM`, y los
enlaces del cuerpo apuntan a `APP_URL`.

**Fail-soft**: si no hay `SMTP_HOST`, el transporter queda en `null`, los metodos devuelven
`false` y **nada lanza**. En el panel eso hace que `/auth/recuperar` devuelva la clave
temporal en la respuesta (modo desarrollo). En el asistente, los tokens solo se devuelven
si ademas `ASISTENTE_DEV_TOKENS=true`.

Con Google Workspace: `SMTP_HOST=smtp.gmail.com`, puerto 587, y `SMTP_PASS` tiene que ser
una **App Password de 16 caracteres** (requiere verificacion en 2 pasos), no la contrasena
normal de la cuenta. Ver `docs/smtp-setup.md`.

### 8.2 NAS de archivos

`src/modules/archivos/nas.service.ts` — cliente HTTP de un servidor de archivos **externo**
(`NAS_URL`, por defecto `https://api-ligaprocorp.ec:3443/api`). El NAS guarda el fichero
fisico y registra en la tabla `ARCHIVOS`, manteniendo **un solo activo** por
entidad + tipo (el anterior queda con `ACTIVO='N'`).

- Subida: `POST {NAS_URL}/archivos` con `FormData` — campos `tipoEntidad`, el campo de id
  correspondiente, `tipoArchivo` y `archivo`.
- Lectura: `urlActivo(tipoEntidad, id, tipoArchivo)` devuelve
  `{NAS_URL}/archivos/activo?tipoEntidad=..&id=..&tipoArchivo=..`, una URL publica usable
  directo en un `<img>`.

Mapa `TipoEntidad` → campo de id que espera el NAS:

| tipoEntidad | campo | columna en `ARCHIVOS` |
| --- | --- | --- |
| `EVENTO` | `idEvento` | `ID_EVENTO` |
| `INSTITUCION` | `idInstitucion` | `ID_INSTITUCION` |
| `LOCAL` | `idLocal` | `ID_LOCAL` |
| `SALON` | `idSalon` | `ID_SALON` |
| `SUBSALON` | `idSubsalon` | `ID_SUBSALON` |
| `CONFIGURACION` | `idConfiguracion` | `ID_CONFIGURACION` |
| `EXPOSITOR` | `idExpositor` | `ID_EXPOSITOR` |
| `USUARIO` | `idUsuario` (es el `ID_CLIENTE` UUID) | `ID_CLIENTE` |

> **Limitacion conocida (importante):** el NAS solo soporta 6 entidades. Si devuelve un
> error cuyo mensaje contiene "entidad", `NasService` lanza un `BadGatewayException` con un
> mensaje explicito pidiendo compartir `docs/nas-espacios.md` con el equipo del NAS. Para
> imagenes de entidades nuevas (p. ej. la foto de expositor) la practica establecida es
> **usar una columna URL en la tabla, no `ImagenNas`**.

Si el NAS es inalcanzable → `BadGatewayException` ("The file server is unavailable").
La API nunca muere por esto.

`ArchivosService` (`archivos.service.ts`) envuelve al NAS para mantener **un registro unico
y estable** por item: la primera subida crea la fila, las ediciones conservan el mismo
`ID_ARCHIVO` actualizando sus datos, y borra la fila extra que el NAS crea en cada carga.

**Helper de multipart** (`multipart.util.ts`): `leerImagenMultipart(req)` devuelve
`{ archivo, campos }`. Valida:
- que sea `multipart/form-data`;
- que exista el campo `file` con contenido;
- que el mime este en `['image/jpeg', 'image/png', 'image/webp']`;
- traduce `FST_REQ_FILE_TOO_LARGE` a un 400 legible con el limite (`MAX_IMAGEN_MB = 25`,
  que debe coincidir con `limits.fileSize` de `main.ts`).

### 8.3 Webhooks FSL (FourStackLabs)

`src/modules/fsl-webhooks/`. Endpoint `POST /fsl/webhooks`
(publico: `https://connecthub.fourstacklabs.com/api/fsl/webhooks`). Ver `docs/fsl-webhooks-connecthub.md`.

**Verificacion de firma** (`fsl-webhooks.util.ts`):

- Header `X-FSL-Signature` con formato `t=<timestamp>,v1=<hex>[,v1=<hex>...]`.
- `signedPayload = "${t}.${rawBody}"`, HMAC-SHA256 con `FSL_WEBHOOK_SECRET`.
- Tolerancia de timestamp: **300 s**. Fuera de ventana → 400 (`timestamp`).
- Se aceptan **varias** firmas `v1` para permitir rotacion del secreto; comparacion con
  `timingSafeEqual`.
- Firma invalida o ausente → 401. Sin `FSL_WEBHOOK_SECRET` configurado → 503.

**Idempotencia**: el `eventId` (header `X-FSL-Event-Id` o `event.id`) se busca en
`FSL_WEBHOOK_EVENTS`; si ya existe responde `200 { received: true, duplicate: true }`.

**Tipos de evento**:

| `type` | Que hace |
| --- | --- |
| `subscription.created` | Aprovisiona la institucion: la crea, genera su `CODIGO_CONEXION`, crea el usuario admin con rol `SYSTEM` y clave temporal, y envia el correo de bienvenida. Todo en una transaccion con `commit` explicito |
| `demo.requested` | Envia las credenciales del entorno demo (un usuario por rol) |
| cualquier otro | `200 { received: true, ignored: <type> }` — compatibilidad hacia adelante |

Tambien acepta el formato generico de la plataforma FSL (`data.customer`): deriva
institucion/admin del cliente, y si `data.subscription.demo` es true lo trata como demo.

**Codigo de conexion** (`generarCodigoConexion`): a partir del nombre de la institucion,
quita acentos, descarta stop-words (`de`, `la`, `of`, `the`…), toma la inicial de cada
palabra y anade el ano. Ej.: "Universidad de Especialidades Espiritu Santo" → `uees2026`.
Maximo 20 caracteres; la unicidad se resuelve en el service anadiendo un sufijo.

### 8.4 Pasarela de pagos Nuvei / Paymentez

`src/modules/public/pagos/nuvei.client.ts` + `pagos.service.ts`.
Ver tambien `docs/checkout-paymentez.md`.

**Principio**: el servidor es dueno del cobro. Nunca confia en montos que manda el cliente,
firma el header `Auth-Token` con las credenciales de la institucion y jamas las expone.

`Auth-Token = base64("APP_CODE;UNIX_TS;sha256(APP_KEY + UNIX_TS)")`, valido 15 s.
Timeout de cada llamada: 15 s (`AbortController`).

**Modelo de 3 pares de credenciales** — vive en columnas de la tabla `INSTITUCIONES`
(no en variables de entorno, porque es por institucion):

| Scope | Columnas en `INSTITUCIONES` | Se usa para |
| --- | --- | --- |
| `client` (tokenizacion, sufijo `-CLIENT`) | `APP_CODE_TOKENIZATION`, `APP_KEY_TOKENIZATION` | `POST /v2/card/add` (guardar tarjeta) |
| `server` (sufijo `-SERVER`, misma "application" que el client) | `USUARIO_PASARELA`, `CONTRASENA_PASARELA` | debito, verify, list, delete, `init_reference` |
| `checkout` | `APP_CODE_CHECKOUT`, `APP_KEY_CHECKOUT` | Link to Pay (checkout hospedado) |

Ambiente: columna `PAYMENT_ENVIROMENT` (sic, con la falta de ortografia tal cual esta en la
BD). Si empieza por `prod` → `prod`, si no → `stg`. Eso decide las bases:

| env | ccapi (tarjetas/debito) | noccapi (link to pay) |
| --- | --- | --- |
| `stg` | `https://ccapi-stg.paymentez.com` | `https://noccapi-stg.paymentez.com` |
| `prod` | `https://ccapi.paymentez.com` | `https://noccapi.paymentez.com` |

Fallbacks (`credenciales()` en `pagos.service.ts`), en **ambas direcciones**:

- si faltan `USUARIO_PASARELA`/`CONTRASENA_PASARELA`, el scope `server` cae a
  `APP_CODE_CHECKOUT`/`APP_KEY_CHECKOUT`;
- si faltan `APP_CODE_CHECKOUT`/`APP_KEY_CHECKOUT`, el scope `checkout` cae a las de
  `server` ya resueltas;
- si falta cualquiera de las de **tokenizacion** (`APP_CODE_TOKENIZATION` /
  `APP_KEY_TOKENIZATION`) no hay fallback: lanza
  `BadRequestException('Payment gateway not configured for this institution')`.

**Metodos del cliente**: `addCard` (scope client), `listCards`, `deleteCard`, `debit`,
`verify` (scope server), `initReference` (checkout embebido, scope server → `{ reference, checkout_url }`),
`linkToPay` (checkout hospedado, scope checkout → `payment_url`).

**IVA** (`montos()` en `pagos.service.ts`): la columna `EVENTOS.MONTO_IVA` guarda el
**porcentaje** (ej. `15` = 15%), no un monto fijo. Si `INCLUYE_IVA = 'S'` el precio ya lo
trae y se desglosa hacia atras (el total **no** cambia); si es `'N'`, el IVA se suma sobre
el precio. Paymentez exige `vat` (monto) y `tax_percentage` coherentes entre si — por eso
ambos se calculan juntos y siempre en el servidor.

**Anti-fraude y anti-doble-entrada** (`confirmarCheckout`):

1. Idempotencia previa: si el pago ya esta `APPROVED` o el asistente ya tiene entrada,
   devuelve la entrada existente.
2. `verify(transactionId)` contra la pasarela.
3. Si la verificacion falla por red/5xx o no devuelve transaccion, **no se concluye nada**:
   el pago queda `PENDIENTE` para que el webhook o el polling lo reconcilien. Nunca se niega
   una entrada por un fallo transitorio, porque el cargo puede haberse hecho.
4. Se exige que `tx.dev_reference` coincida con nuestra referencia **y** que el monto
   coincida con el recalculado en servidor (tolerancia 0.01). Si no, se marca `REJECTED`.
5. `reclamarPagoAprobado()` hace el reclamo **atomico** `PENDIENTE → APPROVED`: solo un
   proceso (este confirm, un reintento o el webhook) emite la entrada.

**Webhook de la pasarela**: `POST /public/pagos/webhook`, sin auth (lo llama la pasarela),
idempotente, reconcilia por `dev_reference` / `transaction.id`.

`PUBLIC_API_URL` (default `https://connecthub.fourstacklabs.com/api`) es la base que se le
da a la pasarela para las URLs de retorno del checkout.

> **Frontera de responsabilidad:** el cobro real lo maneja la app movil / el servicio
> externo de pagos. El panel administrativo **solo guarda configuracion** (precios, cupones,
> credenciales); no ejecuta cobros.

### 8.5 Notificaciones push (Expo)

`src/modules/push/push.service.ts`. `PushModule` es `@Global`, asi que `PushService` se
inyecta desde cualquier modulo (el de eventos lo usa al crear un evento).

- `registrarToken(idCliente, expoToken, platform?)` — idempotente. Un token pertenece a **un**
  dispositivo: si estaba asociado a otro cliente, primero lo borra y luego reasigna.
  Tabla `USUARIO_PUSH_TOKENS`.
- `notificarNuevoEvento(idEvento)` — busca la institucion del evento (por `LOCALES` o por
  `SALONES → LOCALES`), **ignora los eventos con `NO_PUBLICAR='S'`**, junta los tokens
  activos de los clientes vinculados en `USUARIO_INSTITUCIONES` y envia el push.
  **Fire-and-forget: nunca lanza**, para no frenar la creacion del evento en el panel.
- `enviarPush(tokens, title, body, data?)` — `POST https://exp.host/--/api/v2/push/send`
  en lotes de 100. Solo acepta tokens que empiecen por `ExponentPushToken` o `ExpoPushToken`.
  Fail-soft: loguea y sigue.

---

## 9. Manejo de errores, auditoria y rate limiting

### Errores

No hay `ExceptionFilter` global personalizado: se usa el de Nest por defecto, y los
services lanzan las excepciones HTTP tipadas de `@nestjs/common`. El vocabulario que sigue
todo el codigo:

| Excepcion | Cuando |
| --- | --- |
| `BadRequestException` (400) | DTO/negocio invalido, multipart malformado, imagen no permitida, pasarela sin configurar |
| `UnauthorizedException` (401) | Falta el Bearer, token invalido/expirado, credenciales incorrectas, sesion expirada |
| `ForbiddenException` (403) | Rol insuficiente, institucion no habilitada, recurso de otra institucion, clave temporal sin cambiar |
| `NotFoundException` (404) | Registro inexistente (local, salon, mapa, pago…) |
| `HttpException(429)` | Rate limit superado |
| `BadGatewayException` (502) | El NAS esta caido o rechazo la subida |
| `ServiceUnavailableException` (503) | Google/Apple sin configurar, servicio de pagos inalcanzable |

Los mensajes de error de cara al usuario estan en **ingles** en el codigo (la app y el
panel los muestran tal cual o los traducen). Los logs internos estan en espanol.

Politicas defensivas notables:
- **No revelar existencia de usuarios**: `/auth/recuperar` siempre responde el mismo mensaje generico.
- **No filtrar por timing**: `verifyPassword` usa `timingSafeEqual`; el login de asistente
  compara contra un `DUMMY_PACKED` cuando el usuario no existe.
- **Degradacion, no caida**: si Oracle no esta al arrancar la API levanta igual; si Redis
  cae el rate limit hace *fail-open*; si el NAS o el SMTP caen, el resto sigue funcionando.

### Auditoria

`src/modules/auditoria/` — `AuditoriaInterceptor` registrado como `APP_INTERCEPTOR` **global**
desde `AuditoriaModule` (`@Global`). Escribe en la tabla `AUDITORIA_LOG`.

Que registra:
- Logins: `LOGIN_OK` / `LOGIN_FAIL` (detecta la ruta `/auth/login`).
- Toda mutacion (`POST`, `PATCH`, `PUT`, `DELETE`) → `CREATE` / `UPDATE` / `DELETE`, y sus errores → `ERROR`.
- Los `GET` **solo** si fallan con 5xx (evita el ruido de tokens vencidos).

Que **no** registra (lista `OMITIR`): `/health`, `/auth/refresh`, `/auth/me`, `/auth/logout`.

Redaccion de secretos: `resumirBody()` reemplaza por `'***'` el valor de cualquier clave que
matchee `/pass|clave|secret|token|key|salt|credencial/i`, y recorta el JSON a 1900 chars.
La escritura es *fire-and-forget* (`void ... .catch(log)`): un fallo del log nunca rompe la API.

Consulta: `GET /auditoria`, **solo superadmin** (validado en `AuditoriaService.listar`).

### Rate limiting

`src/auth/rate-limit.guard.ts`. **No es global**: se aplica con `@UseGuards(RateLimitGuard)`
endpoint por endpoint.

- Limite: **5 intentos por minuto**, por clave `rl:<ruta sin querystring>:<ip>`.
- Contador en Redis: `INCR` y, si el resultado es 1, `EXPIRE 60`.
- La IP se toma de `req.ip`, que Fastify resuelve gracias a `trustProxy: 1`.
  **Nunca** se parsea `X-Forwarded-For` a mano aqui: su valor de la izquierda lo controla el
  cliente y permitia saltarse el limite con una IP falsa por request.
- **Fail-open**: si Redis esta caido, se loguea y se deja pasar — no se tumba el login por el limitador.

Endpoints protegidos hoy: `/auth/login`, `/auth/recuperar`, y en el asistente
`/public/auth/register`, `/login`, `/google`, `/apple`, `/pagos-exchange`, `/forgot`, `/reset`.

---

## 10. Variables de entorno

Se definen en `/root/app/.env` en produccion (servidor 209.126.77.72) y en `.env` en la raiz
del repo para local. `docker-compose.yml` las inyecta al contenedor `api` con `env_file: .env`,
y ademas **sobrescribe** tres desde el propio compose: `REDIS_URL=redis://redis:6379`,
`NODE_ENV=production` y `COOKIE_SECURE=true`. La plantilla sin valores es `.env.example`
(esa si esta versionada).

Recordatorio: `ConfigModule` corre con `ignoreEnvFile: true` — la API **no** lee ficheros
`.env`, solo el entorno del proceso.

| Variable | Proposito | Obligatoria | Donde se define |
| --- | --- | --- | --- |
| `ORACLE_USER` | Usuario del esquema Oracle | Si (`getOrThrow`) | `.env` |
| `ORACLE_PASSWORD` | Contrasena de ese usuario | Si (`getOrThrow`) | `.env` |
| `ORACLE_CONNECT_STRING` | `host:puerto/servicio` de la BD | Si (`getOrThrow`) | `.env` |
| `ORACLE_POOL_MIN` | Conexiones minimas del pool (default 2) | No | `.env` |
| `ORACLE_POOL_MAX` | Conexiones maximas del pool (default 10) | No | `.env` |
| `API_PORT` | Puerto de escucha (default 4000) | No | `.env` |
| `CORS_ORIGIN` | Origenes permitidos, separados por coma. Sin valor → `true` (permite todos) | Recomendada | `.env` |
| `JWT_SECRET` | Firma del **access token del panel** | Si (`getOrThrow`) | `.env` |
| `JWT_REFRESH_SECRET` | Firma del **refresh token del panel** | Si (`getOrThrow`) | `.env` |
| `COOKIE_SECRET` | Secreto de `@fastify/cookie` (fallback `'dev-secret'`) | Recomendada | `.env` |
| `COOKIE_SECURE` | `"true"` marca la cookie `ch_refresh` como `Secure`. Obligatorio detras de HTTPS | Si en prod | `docker-compose.yml` (forzado a `"true"`) |
| `JWT_ASISTENTE_SECRET` | Firma del **access token de asistente**. Generar con `openssl rand -hex 32` | Si (`getOrThrow`) | `.env` |
| `JWT_ASISTENTE_REFRESH_SECRET` | Firma del **refresh token de asistente** | Si (`getOrThrow`) | `.env` |
| `ASISTENTE_DEV_TOKENS` | `"true"` devuelve los tokens de verificacion/reset en la respuesta HTTP. **Solo desarrollo** — vive unicamente en el override local gitignored | No | override local |
| `PAGOS_API_URL` | Base del servicio externo de pagos/identidad (Evento-back). Default `https://api-ligaprocorp.ec:3443/api` | No | `.env` |
| `PAGOS_JWT_SECRET` | Secreto para verificar localmente los tokens de Evento-back en `/public/auth/pagos-exchange`. **Debe coincidir EXACTAMENTE** con el `JWT_SECRET` de Evento-back o el intercambio falla | Recomendada | `.env` |
| `GOOGLE_CLIENT_IDS` | Client IDs OAuth aceptados como `aud` del `id_token` de Google, separados por coma (web/ios/android). Sin valor → Google sign-in responde 503. **Viven en el proyecto Google Cloud 338617760077 ("pagos"), no en "ueesApp"** | Si para Google | `.env` |
| `APPLE_CLIENT_IDS` | Bundle IDs aceptados como audiencia del token de Sign in with Apple (ej. `com.fourstacklabs.connecthub`). Sin valor → Apple sign-in responde 503 | Si para Apple | `.env` |
| `REDIS_URL` | Conexion a Redis. Default `redis://redis:6379` | No | `docker-compose.yml` |
| `SMTP_HOST` | Host SMTP. **Sin el, el correo queda deshabilitado** (fail-soft) | Recomendada | `.env` |
| `SMTP_PORT` | Puerto SMTP (default 587). `secure` se activa solo si es 465 | No | `.env` |
| `SMTP_USER` | Usuario SMTP. Si esta vacio, se envia sin auth | No | `.env` |
| `SMTP_PASS` | Contrasena SMTP. Con Google Workspace debe ser una **App Password de 16 chars** | No | `.env` |
| `SMTP_FROM` | Remitente. Default `no-reply@connect-hub.local` | Recomendada | `.env` |
| `APP_URL` | URL publica usada en los enlaces de los correos. Default `https://connecthub.fourstacklabs.com` | Recomendada | `.env` |
| `PUBLIC_API_URL` | Base publica de la API para las URLs de retorno del checkout. Default `https://connecthub.fourstacklabs.com/api` | No | `.env` |
| `FSL_WEBHOOK_SECRET` | Secreto compartido con FourStackLabs para verificar el HMAC de `X-FSL-Signature`. **Sin el, `/fsl/webhooks` responde 503** | Si para webhooks | `.env` |
| `NAS_URL` | Base del servidor de archivos externo. Default `https://api-ligaprocorp.ec:3443/api` | Recomendada | `.env` |
| `DOMAIN` | Dominio que sirve Caddy | Si en prod | `.env` (lo consume `caddy`, no la API) |
| `ACME_EMAIL` | Email para Let's Encrypt | Si en prod | `.env` (lo consume `caddy`) |
| `NEXT_PUBLIC_API_URL` | Base de la API para el panel Next.js. En prod: `https://TU_DOMINIO/api` | Si | `.env` (build arg de `web`) |
| `NEXT_PUBLIC_NAS_URL` | Base del NAS para el panel | Si | `.env` (build arg de `web`) |
| `API_INTERNAL_URL` | URL **interna** de la API dentro de la red del compose (`http://api:4000`). La usa el panel Next.js para el fetch server-side de la landing publica de certificados (`apps/web/src/app/c/[codigo]/page.tsx`); si falta, cae a `NEXT_PUBLIC_API_URL` | No | `docker-compose.yml` (servicio `web`) |

**Credenciales que NO son variables de entorno**: las de la pasarela Nuvei/Paymentez viven
en columnas de la tabla `INSTITUCIONES` (`USUARIO_PASARELA`, `CONTRASENA_PASARELA`,
`TOKEN_PASARELA`, `APP_CODE_CHECKOUT`, `APP_KEY_CHECKOUT`, `APP_CODE_TOKENIZATION`,
`APP_KEY_TOKENIZATION`, `PAYMENT_ENVIROMENT`, `PROVEEDOR_PAGO`), porque son por
institucion. Se escriben desde
`PATCH /instituciones/:id` y son **write-only**: ningun endpoint las devuelve.

---

## 11. Como retomar el proyecto desde cero

1. `git clone https://github.com/raulalcivarm10/CONNECT-HUB` y `cd CONNECT-HUB`.
2. `cp .env.example .env` y rellenar los valores reales (respaldo fuera del repo).
   Como minimo: los tres `ORACLE_*`, los cuatro secretos JWT y `COOKIE_SECRET`.
   Generar cada secreto con `openssl rand -hex 32`.
3. `docker compose up -d --build` (levanta `caddy`, `api`, `web`, `redis`).
4. Verificar el health. **Ojo con el puerto**: en `docker-compose.yml` el servicio `api`
   solo hace `expose: 4000` (visible dentro de la red del compose), **no** publica el
   puerto en el host. Quien publica `4000:4000` es `docker-compose.override.yml`, que
   esta **gitignored** — en un clon recien hecho no existe. Asi que en un clon limpio
   `curl http://localhost:4000/health` **falla con connection refused**, y eso no
   significa que la API este mal. Opciones:

   ```bash
   # a) desde dentro del contenedor (funciona siempre)
   docker compose exec api node -e "fetch('http://localhost:4000/health').then(r=>r.text()).then(console.log)"

   # b) a traves de Caddy, que es como se accede de verdad
   curl -k https://localhost/api/health

   # c) para dev: recrear el override local (publica 4000, amplia CORS,
   #    activa ASISTENTE_DEV_TOKENS) o usar docker compose -f docker-compose.dev.yml up
   ```

   Debe dar `status: "ok"` con `oracle.ok` y `redis.ok` en `true`.
   `smtp.configured` dira si el correo esta activo. Si `status` es `degraded`, mirar
   cual de los dos fallo: el `nas` caido **no** baja el status por si solo.
5. Explorar la API en `/docs` (Swagger).
6. Migraciones y DDL: `docs/sql/*.sql`. El esquema es **compartido con una app externa**,
   asi que no se hacen cambios destructivos sin coordinar.

Documentos relacionados: `SERVER_SETUP.md`, `deploy.sh`, `docs/apis-produccion.md`,
`docs/modelo-datos.md`, `docs/nas-espacios.md`, `docs/checkout-paymentez.md`,
`docs/fsl-webhooks-connecthub.md`, `docs/smtp-setup.md`, `docs/inventario-localhost.md`,
`docs/eventos-no-publicar.md`.
