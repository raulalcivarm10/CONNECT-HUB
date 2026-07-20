# Infraestructura, despliegue y operación

Ultima actualizacion: 2026-07-19

Este documento describe **cómo está montada la infraestructura de ConnectHub**, cómo se despliega a producción, cómo se opera (logs, reinicios, rollback) y cómo se levanta el entorno de desarrollo local **desde cero** en una máquina recién formateada.

Es el documento de referencia para: retomar el proyecto, reconstruir el servidor, o hacer un deploy sin supervisión.

> **Regla de seguridad:** en este documento se listan **nombres** de variables de entorno y su propósito. **Nunca** se escriben valores reales (contraseñas, tokens, cadenas de conexión, secretos). Los valores viven únicamente en `/root/app/.env` en el servidor y en el `.env` local de cada desarrollador, ambos fuera de Git.

---

## Índice

1. [Panorama general](#1-panorama-general)
2. [Arquitectura de contenedores](#2-arquitectura-de-contenedores)
3. [Los tres archivos compose](#3-los-tres-archivos-compose)
4. [Dockerfiles de cada app](#4-dockerfiles-de-cada-app)
5. [Caddy: enrutamiento y TLS](#5-caddy-enrutamiento-y-tls)
6. [Variables de entorno de infraestructura](#6-variables-de-entorno-de-infraestructura)
7. [Procedimiento de despliegue a producción](#7-procedimiento-de-despliegue-a-producción)
8. [Operación: logs, reinicios, estado](#8-operación-logs-reinicios-estado)
9. [Rollback](#9-rollback)
10. [Entorno de desarrollo local desde cero](#10-entorno-de-desarrollo-local-desde-cero)
11. [Healthchecks](#11-healthchecks)
12. [Troubleshooting de fallos comunes](#12-troubleshooting-de-fallos-comunes)
13. [Montar un servidor nuevo (greenfield)](#13-montar-un-servidor-nuevo-greenfield)
14. [Backups y qué es realmente crítico](#14-backups-y-qué-es-realmente-crítico)

---

## 1. Panorama general

ConnectHub es un **monorepo "blando"** en `C:/proyectos/CONNECT-HUB` (repo `github.com/raulalcivarm10/CONNECT-HUB`, rama `main`).

| Pieza | Qué es | Stack | Carpeta | ¿Va en Docker? |
|---|---|---|---|---|
| **API** | Backend: panel admin + API pública de la app de asistentes (`/public/*`) | NestJS 11 + Fastify + `node-oracledb` (modo *thin*) | `apps/api` | Sí |
| **Web** | Panel administrativo de instituciones + landings públicas (`/privacy`, `/c/[codigo]` certificados, `/eliminar-cuenta`, `/estado`, `/verify`, `/reset`, `/cambiar-clave`) | Next.js App Router + Tailwind v4 + TanStack Query | `apps/web` | Sí |
| **Mobile** | App de asistentes iOS + Android | Expo SDK 57 + React Native + Expo Router | `apps/mobile` | **No** (se compila en la nube con EAS) |
| **shared-types** | Tipos TypeScript compartidos | TS puro, consumido por *path-mapping* | `packages/shared-types` | N/A |

**Por qué el monorepo es "blando"** (explicado en el `comment` del `package.json` raíz): cada app se instala y compila **aislada** — `api` y `web` dentro de sus propias imágenes Docker, `mobile` en el host con Expo. No se usan npm workspaces, para evitar el *hoisting* de árboles de dependencias incompatibles entre NestJS, Next.js y React Native. `packages/shared-types` se consume por path-mapping en `tsconfig` y en Metro, no como paquete npm.

### Qué corre dónde

```
                        Internet
                           │  :80 / :443
                           ▼
        ┌──────────────────────────────────────────┐
        │  Servidor 209.126.77.72   (/root/app)    │
        │                                          │
        │   ┌────────┐                             │
        │   │ caddy  │  TLS + reverse proxy        │
        │   └───┬────┘                             │
        │       │ /api/*  →  api:4000              │
        │       │ resto   →  web:3000              │
        │   ┌───▼────┐   ┌───────┐   ┌─────────┐   │
        │   │  api   │   │  web  │   │  redis  │   │
        │   │ :4000  │   │ :3000 │   │  :6379  │   │
        │   └───┬────┘   └───────┘   └─────────┘   │
        └───────┼──────────────────────────────────┘
                │
     ┌──────────┴────────────┬──────────────────────┐
     ▼                       ▼                      ▼
 Oracle 21c XE          NAS de archivos      Evento-back (pagos/identidad)
 <host-oracle>:1521    api-ligaprocorp.ec   api-ligaprocorp.ec:3443/api
 (servidor externo)     :3443/api            (servicio externo)
```

**Lo que este servidor NO administra:**

- **La base de datos.** Oracle 21c XE vive en `<ver ORACLE_CONNECT_STRING en .env>`, es un esquema **preexistente y compartido** con una app externa. No hay migraciones automáticas: los cambios de esquema son scripts manuales en `docs/sql/*.sql`.
- **El NAS de archivos/imágenes** (`api-ligaprocorp.ec:3443`). Servicio externo.
- **El servicio de pagos/identidad "Evento-back"** (`api-ligaprocorp.ec:3443/api`). Externo; ConnectHub solo intercambia tokens con él.
- **La app móvil.** Se compila con EAS en la nube (proyecto `alcivator/connecthub`, projectId `2a694ac0-ff07-434e-96ee-e508e498facb`) y se distribuye por App Store / Google Play.

**Producción:** `https://connecthub.fourstacklabs.com` — el panel en la raíz, la API bajo `/api/*`.

---

## 2. Arquitectura de contenedores

Definida en `docker-compose.yml` (raíz del repo). Nombre del proyecto compose: `connect-hub`.

### 2.1 Tabla de servicios

| Servicio | Imagen / build | Puertos | Volúmenes | Depende de | Restart |
|---|---|---|---|---|---|
| `caddy` | `caddy:2-alpine` (imagen oficial, no se compila) | **`80:80`** y **`443:443`** (únicos puertos publicados al host) | `./Caddyfile:/etc/caddy/Caddyfile:ro`, `caddy_data:/data`, `caddy_config:/config` | `web`, `api` | `unless-stopped` |
| `api` | build `./apps/api`, target **`prod`** | `expose: 4000` (**solo red interna**, no publicado) | — | `redis` (`condition: service_healthy`) | `unless-stopped` |
| `web` | build `./apps/web`, target **`prod`** | `expose: 3000` (**solo red interna**) | — | `api` | `unless-stopped` |
| `redis` | `redis:7-alpine`, comando `redis-server --appendonly yes` | ninguno publicado | `redis_data:/data` | — | `unless-stopped` |

### 2.2 `expose` vs `ports` — por qué importa

- `ports:` publica el puerto **en la IP pública del host**.
- `expose:` solo lo hace visible **dentro de la red de compose**.

En producción **solo `caddy` usa `ports`** (80 y 443). `api` y `web` usan `expose`, así que **no son alcanzables desde Internet directamente**: todo el tráfico entra obligatoriamente por Caddy, que aplica TLS y los headers de seguridad. Redis no expone nada en absoluto.

Esto significa que `https://connecthub.fourstacklabs.com:4000` **no responde y no debe responder**. Si alguna vez responde, alguien publicó puertos que no debía (típicamente por dejar un `docker-compose.override.yml` en el servidor — ver §3.3).

### 2.3 Red

Compose crea automáticamente una red bridge del proyecto (`connect-hub_default`). Dentro de ella, **cada servicio se resuelve por su nombre DNS**:

- `api` → contenedor de la API (`http://api:4000`)
- `web` → contenedor de Next.js (`http://web:3000`)
- `redis` → `redis://redis:6379`

Por eso el `Caddyfile` dice `reverse_proxy api:4000` y no `localhost:4000`, y por eso `REDIS_URL` se sobreescribe a `redis://redis:6379` en el compose.

### 2.4 Volúmenes con nombre (persistencia)

| Volumen | Servicio | Qué guarda | ¿Se puede perder? |
|---|---|---|---|
| `caddy_data` | caddy | **Certificados TLS de Let's Encrypt** y estado ACME | Se puede, pero al recrearse Caddy vuelve a pedir certificados; hay **rate limits de Let's Encrypt** (5 certs/dominio/semana). **No borrar a la ligera.** |
| `caddy_config` | caddy | Config autogenerada de Caddy | Sí, irrelevante |
| `redis_data` | redis | AOF de Redis (caché, rate-limit, sesiones efímeras) | Sí. Es **solo caché**: perderlo no pierde datos de negocio, solo obliga a recalcular |

### 2.5 Variables inyectadas por el compose (producción)

El compose **sobreescribe** algunas variables por encima del `.env`:

En `api`:
- `REDIS_URL: redis://redis:6379` — apunta al contenedor interno.
- `NODE_ENV: production`
- `COOKIE_SECURE: "true"` — obligatorio: la cookie de refresh solo viaja por HTTPS.

En `web`:
- `NODE_ENV: production`
- `API_INTERNAL_URL: http://api:4000` — URL **interna** que usa Next.js para hacer fetch **server-side** (la landing pública de certificados renderiza en el servidor y llama a la API por la red de Docker, sin salir a Internet).

Y como **build args** de `web` (ver §4.2 para por qué son args y no env):
- `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`)
- `NEXT_PUBLIC_NAS_URL` (default `https://api-ligaprocorp.ec:3443/api`)

---

## 3. Los tres archivos compose

Hay **tres** archivos compose y cada uno cumple un rol distinto. Confundirlos es la causa más probable de un incidente de seguridad en este proyecto.

| Archivo | Proyecto compose | Uso | ¿Está en Git? | ¿Va al servidor? |
|---|---|---|---|---|
| `docker-compose.yml` | `connect-hub` | **Producción** (y "prod local") | Sí | **Sí** |
| `docker-compose.dev.yml` | `connect-hub-dev` | Desarrollo con hot-reload | Sí | No |
| `docker-compose.override.yml` | `connect-hub` | Parche **solo local** sobre el de prod | **No (`.gitignore`)** | **NUNCA** |

### 3.1 `docker-compose.yml` — producción

Ya detallado en §2. Levanta `caddy + api + web + redis`, con builds en target `prod`, healthcheck en la API y `restart: unless-stopped` en todo.

### 3.2 `docker-compose.dev.yml` — desarrollo

Nombre de proyecto distinto (`connect-hub-dev`), lo que permite **tener dev y prod-local coexistiendo** sin pisarse contenedores ni volúmenes.

Diferencias clave respecto a producción:

- **No hay Caddy.** En dev se accede directo: web en `localhost:3000`, API en `localhost:4000`.
- **Targets `dev`** en ambos builds → arrancan con `npm run start:dev` (Nest watch) y `npm run dev` (Next dev).
- **Bind mounts de código fuente**: `./apps/api:/app` y `./apps/web:/app`. Editas en Windows, el contenedor recompila.
- **Volúmenes con nombre para `node_modules`**: `api_node_modules:/app/node_modules`, `web_node_modules:/app/node_modules`, y `web_next_cache:/app/.next`. Están declarados en el bloque `volumes:` del compose de dev (no son anónimos: por eso se pueden borrar por nombre, ver §10.3). Esto **protege las dependencias instaladas dentro de Linux** de ser tapadas por el bind mount del host (donde no hay `node_modules`, y donde si los hubiera serían binarios de Windows, incompatibles).
- **Polling de filesystem activado**. Sin esto, **el hot-reload no funciona en Windows/WSL2**, porque los eventos inotify no cruzan el límite del filesystem montado. Ojo, **no es la misma variable en los dos servicios**:
  - `api`: solo `CHOKIDAR_USEPOLLING: "true"` (lo que observa el watcher de Nest).
  - `web`: `WATCHPACK_POLLING: "true"` **y** `CHOKIDAR_USEPOLLING: "true"` (Next/webpack usa Watchpack), más `NEXT_TELEMETRY_DISABLED: "1"`.
- **`web` en dev NO lee el `.env`.** El servicio `api` sí declara `env_file: .env`; el servicio `web` **no**, y fija `NEXT_PUBLIC_API_URL: http://localhost:4000` y `NEXT_PUBLIC_NAS_URL` **literalmente dentro de `docker-compose.dev.yml`**. Consecuencia práctica: **editar esas dos variables en el `.env` no tiene ningún efecto en dev**; hay que editarlas en el propio compose de dev.
- Los puertos **sí** se publican (`4000:4000`, `3000:3000`) porque en local se necesita acceder a ellos.
- **No hay healthcheck de `api` en dev** (solo en el compose de producción, §11.1). El de `redis` sí está en ambos.

### 3.3 `docker-compose.override.yml` — SOLO LOCAL, NUNCA EN PRODUCCIÓN

**Este es el archivo peligroso. Lee esta sección completa.**

Docker Compose tiene un comportamiento **automático e implícito**: si existe un archivo llamado `docker-compose.override.yml` en el directorio, `docker compose up` lo **mergea encima de `docker-compose.yml` sin que se lo pidas y sin avisar**. No hace falta ningún flag `-f`.

Contenido actual del override (parcheando el servicio `api`):

| Cambio | Qué hace | Por qué es inaceptable en producción |
|---|---|---|
| `ports: - "4000:4000"` | Publica la API directamente en el host | **Saltaría a Caddy por completo**: la API quedaría expuesta en `http://IP_PUBLICA:4000` en texto plano, sin TLS, sin los headers de seguridad, sin HSTS |
| `CORS_ORIGIN: "https://localhost,http://localhost:8100,http://localhost:8081,http://localhost:19006,http://localhost:19000"` | Amplía CORS a los orígenes de Expo | Reemplazaría el CORS de prod por una lista de `localhost` → el panel real dejaría de poder llamar a su propia API |
| `ASISTENTE_DEV_TOKENS: "true"` | **Devuelve los tokens de verificación y de reset de contraseña dentro de la respuesta HTTP** | **Fuga de secretos crítica.** Cualquiera podría pedir un reset de contraseña de otra cuenta y leer el token en la respuesta → toma de cuentas. Este flag existe solo porque en local no hay SMTP configurado |

**Salvaguardas que ya existen:**

1. `docker-compose.override.yml` está en `.gitignore` (con comentario explícito: *"override de docker SOLO local (expone puertos/CORS para dev móvil) — NUNCA en prod"*). Por lo tanto **no viaja en `git pull`**.
2. El archivo **no existe** en `/root/app` del servidor.
3. El propio archivo lleva la advertencia en su primera línea.

**Riesgo residual:** el archivo llegaría al servidor solo si alguien lo copia a mano (por `scp`, o pegándolo en un editor). También `git reset --hard` (que usa `deploy.sh`) **no** borra archivos ignorados, así que si alguna vez apareciera ahí, se quedaría.

**Chequeo obligatorio antes y después de cada deploy:**

```bash
ssh root@209.126.77.72 'test -f /root/app/docker-compose.override.yml && echo "PELIGRO: override presente en produccion" || echo "OK: sin override"'
```

Y como verificación de comportamiento (debe fallar / no conectar desde fuera):

```bash
curl -s -m 5 http://209.126.77.72:4000/health && echo "PELIGRO: API expuesta directo" || echo "OK: 4000 cerrado"
```

Nota adicional: el puerto 4000 tampoco está abierto en `ufw` (§13.2), así que hay defensa en profundidad. Pero no confíes solo en eso.

Nota sobre precedencia: el override usa `environment:` y no `env_file:`. En Docker Compose, `environment` **gana** sobre `env_file`, por eso el parche de `CORS_ORIGIN` efectivamente sobreescribe el valor del `.env`. Ese detalle está comentado en el propio archivo.

---

## 4. Dockerfiles de cada app

Ambos son **multi-stage** con targets nombrados (`deps`, `dev`, `build`, `prod`), que es lo que permite que dev y prod compartan la capa de dependencias.

### 4.1 `apps/api/Dockerfile`

Base: `node:22-alpine`.

| Stage | Qué hace |
|---|---|
| `deps` | `WORKDIR /app`; instala **fuentes del sistema**; copia `package.json` + `package-lock.json*`; `npm install` |
| `dev` | Hereda `deps`, copia el código, `EXPOSE 4000`, `CMD ["npm","run","start:dev"]` (Nest en watch) |
| `build` | Hereda `deps`, copia el código, `npm run build && npm prune --omit=dev` (compila a `dist/` y **poda devDependencies**) |
| `prod` | Imagen **limpia** `node:22-alpine`; reinstala las fuentes; copia solo `node_modules` (ya podado) y `dist` desde `build`; `CMD ["node","dist/main.js"]` |

**Detalle no obvio — las fuentes.** Ambos stages con Node ejecutan:

```dockerfile
RUN apk add --no-cache fontconfig ttf-dejavu ttf-liberation
```

Esto **no es decorativo**. El módulo de **certificados** usa `sharp` para componer texto SVG sobre la plantilla del evento. Sin `fontconfig` y sin fuentes instaladas, **sharp no renderiza ningún glifo** y los certificados salen con la plantilla pero sin nombres (o directamente falla el render).

`ttf-liberation` está elegido a propósito: **Liberation Sans es métricamente compatible con Arial**, que es la fuente que muestra el editor de plantillas del panel. Eso es lo que hace que el resultado sea **WYSIWYG** (lo que ves en el panel es lo que sale en el PNG). Si alguien quita esa línea "para adelgazar la imagen", los certificados se desalinean.

### 4.2 `apps/web/Dockerfile`

Base: `node:22-alpine`.

| Stage | Qué hace |
|---|---|
| `deps` | `npm install` sobre `package.json` + lock |
| `dev` | `EXPOSE 3000`, `CMD ["npm","run","dev"]` (script: `next dev -p 3000 -H 0.0.0.0`) |
| `build` | Declara `ARG NEXT_PUBLIC_API_URL` y `ARG NEXT_PUBLIC_NAS_URL`, los promueve a `ENV`, fija `NEXT_TELEMETRY_DISABLED=1`, copia el código y `npm run build` |
| `prod` | `node:22-alpine` limpio; `NODE_ENV=production`, `HOSTNAME=0.0.0.0`, `PORT=3000`; copia `.next/standalone`, `.next/static` y `public`; `CMD ["node","server.js"]` |

**Detalle crítico — `NEXT_PUBLIC_*` se hornea en el build.** Next.js **sustituye las variables `NEXT_PUBLIC_*` por su valor literal dentro del bundle JavaScript en tiempo de compilación**. No se leen en runtime. Consecuencia práctica:

> Cambiar `NEXT_PUBLIC_API_URL` en el `.env` **no tiene ningún efecto** si no vuelves a **construir** la imagen de `web`. Un `docker compose up -d` sin `--build` deja el valor viejo horneado.

Por eso el compose las pasa como `build.args` y por eso **todo deploy usa `--build`**.

**`output: 'standalone'`** en `apps/web/next.config.ts` es lo que hace posible el stage `prod`: Next genera un `server.js` autocontenido con solo las dependencias que realmente usa, así la imagen final no lleva el `node_modules` completo.

**`HOSTNAME=0.0.0.0`** es obligatorio: por defecto el server standalone escucharía en `localhost` **dentro del contenedor**, y Caddy (que está en otro contenedor) no podría alcanzarlo.

### 4.3 `.dockerignore`

Ambas apps tienen el suyo:

- `apps/api/.dockerignore`: `node_modules`, `dist`, `*.log`, `.env`
- `apps/web/.dockerignore`: `node_modules`, `.next`, `*.log`, `.env`

Excluir `.env` es deliberado: **los secretos no se hornean en la imagen**, se inyectan en runtime vía `env_file` del compose. Excluir `node_modules` evita subir binarios de Windows al contexto de build (y acelera muchísimo el `docker build`).

---

## 5. Caddy: enrutamiento y TLS

Archivo: `Caddyfile` en la raíz del repo, montado **read-only** en `/etc/caddy/Caddyfile`.

### 5.1 Contenido y lógica

```caddyfile
{
	email {$ACME_EMAIL}
}

{$DOMAIN} {
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
		-Server
	}

	handle_path /api/* {
		reverse_proxy api:4000
	}
	handle {
		reverse_proxy web:3000
	}
}
```

**Sustitución de variables.** `{$DOMAIN}` y `{$ACME_EMAIL}` se resuelven con las variables de entorno del **contenedor caddy**, que el compose inyecta desde el `.env` con defaults (`connecthub.fourstacklabs.com` y `admin@fourstacklabs.com`). Es decir: el Caddyfile es genérico, el dominio real viene del `.env` del servidor.

### 5.2 Enrutamiento — `handle_path` vs `handle`

Esta es la parte que más confusión genera:

- **`handle_path /api/*`** → hace `reverse_proxy api:4000` **quitando el prefijo `/api`**. Ese es exactamente el punto de `handle_path` (a diferencia de `handle`, que conserva la ruta completa).
- **`handle`** (sin matcher) → cajón de sastre: **todo lo demás** va a `web:3000`.

Traducción de rutas:

| El navegador pide | Caddy entrega a | La API/Next ve |
|---|---|---|
| `https://connecthub.fourstacklabs.com/api/health` | `api:4000` | `/health` |
| `https://connecthub.fourstacklabs.com/api/public/eventos` | `api:4000` | `/public/eventos` |
| `https://connecthub.fourstacklabs.com/api/docs` | `api:4000` | `/docs` (Swagger) |
| `https://connecthub.fourstacklabs.com/login` | `web:3000` | `/login` |
| `https://connecthub.fourstacklabs.com/privacy` | `web:3000` | `/privacy` |
| `https://connecthub.fourstacklabs.com/eliminar-cuenta` | `web:3000` | `/eliminar-cuenta` |
| `https://connecthub.fourstacklabs.com/estado` | `web:3000` | `/estado` |
| `https://connecthub.fourstacklabs.com/c/<codigo>` | `web:3000` | `/c/[codigo]` |

**Las dos rutas públicas que suelen olvidarse:**

- **`/estado`** — página pública de estado que consulta `/health` **desde el navegador** usando `NEXT_PUBLIC_API_URL`. Si esa variable quedó mal horneada (§4.2), esta página se ve caída aunque la API esté sana. Muestra Oracle y Redis.
- **`/c/[codigo]`** — landing pública de **certificados** (`apps/web/src/app/c/[codigo]/page.tsx`). Es **la** razón de ser de `API_INTERNAL_URL`: hace el fetch **server-side** por `http://api:4000` (red de Docker), pero construye la imagen y las etiquetas Open Graph con `NEXT_PUBLIC_API_URL` (la URL **pública**, que es la que ven el navegador y los crawlers de redes sociales). Si `API_INTERNAL_URL` faltara, el contenedor `web` intentaría llamarse a sí mismo por el dominio público y la landing daría error de render.

**Consecuencia para los controladores de NestJS:** los controladores **no** llevan prefijo `/api`. `@Controller('health')` responde en `/health` internamente y en `/api/health` públicamente. Si alguien agrega un `setGlobalPrefix('api')` en `main.ts`, las rutas públicas pasarían a ser `/api/api/...` y todo se rompe.

**Consecuencia para configurar clientes:** `NEXT_PUBLIC_API_URL` y `EXPO_PUBLIC_API_URL` en producción deben apuntar a `https://connecthub.fourstacklabs.com/api` (con `/api`), mientras que en local apuntan a `http://localhost:4000` (sin `/api`, porque en dev no hay Caddy delante).

### 5.3 TLS automático

Caddy emite y renueva certificados **solo**, sin intervención:

1. Al arrancar, ve `{$DOMAIN}` como nombre de sitio y detecta que es un dominio público.
2. Ejecuta el desafío **ACME** contra Let's Encrypt (por defecto HTTP-01 sobre el puerto 80, que está publicado).
3. Guarda el certificado y la clave privada en el volumen **`caddy_data`**.
4. **Renueva automáticamente** antes del vencimiento (~30 días antes). No hay cron que mantener.
5. Redirige **HTTP → HTTPS** automáticamente (por eso el puerto 80 debe seguir abierto aunque todo el tráfico real sea 443).

El `email` del bloque global es el de contacto ACME (avisos de expiración de Let's Encrypt).

**Requisitos para que la emisión funcione** (si falla, revisar en este orden):
- El registro **A** del dominio apunta a `209.126.77.72`.
- Los puertos **80 y 443** están abiertos en el firewall y **no ocupados por otro proceso** (nginx/apache residual).
- El contenedor `caddy` puede salir a Internet.

> **No borres el volumen `caddy_data`** en un `docker compose down -v` casual: perderías el certificado y Let's Encrypt tiene rate limit (5 certificados por dominio por semana). Recrearlo varias veces en un día te puede dejar sin HTTPS hasta la semana siguiente.

### 5.4 Headers de seguridad

Se aplican a **todas** las respuestas (API y web):

| Header | Efecto |
|---|---|
| `Strict-Transport-Security: max-age=31536000; includeSubDomains` | El navegador solo habla HTTPS con el dominio durante 1 año |
| `X-Content-Type-Options: nosniff` | Impide adivinar el MIME type |
| `X-Frame-Options: DENY` | Bloquea el embebido en iframes (anti-clickjacking) |
| `Referrer-Policy: strict-origin-when-cross-origin` | No filtra rutas completas a terceros |
| `Permissions-Policy: camera=(), microphone=(), geolocation=()` | Desactiva APIs sensibles del navegador |
| `-Server` | **Elimina** el header `Server` (no revela que hay Caddy) |

### 5.5 Confianza en el proxy (lado API)

En `apps/api/src/main.ts` el adaptador Fastify se crea con `trustProxy: 1`. Está comentado ahí y es importante entenderlo: confía **solo en un hop** (el de Caddy), de modo que `req.ip` resuelve la IP **real** del cliente — la que Caddy añade **a la derecha** del `X-Forwarded-For` — y no la de la izquierda, que el cliente puede falsificar para **saltarse el rate-limit**. Si algún día se mete otro proxy o un CDN delante de Caddy, este número debe subir a 2; si se pone en `true`, se reabre el bypass.

---

## 6. Variables de entorno de infraestructura

> **Solo nombres.** Los valores reales están únicamente en `/root/app/.env` (servidor) y en el `.env` local de cada desarrollador. La plantilla versionada, sin secretos, es `.env.example`.

### 6.1 Dónde vive cada archivo de entorno

| Entorno | Ruta del archivo | Cómo se crea | ¿En Git? |
|---|---|---|---|
| **Producción** | **`/root/app/.env`** (servidor `209.126.77.72`) | Se crea a mano la primera vez; **sobrevive a los `git pull`** porque está en `.gitignore` | No |
| Local (**solo api**) | `C:/proyectos/CONNECT-HUB/.env` | `cp .env.example .env` y pedir los valores al responsable | No |
| Local (**web en dev**) | — **no usa `.env`** | Sus `NEXT_PUBLIC_*` están escritas literalmente en `docker-compose.dev.yml` (§3.2) | El compose sí |
| Local (móvil) | `C:/proyectos/CONNECT-HUB/apps/mobile/.env` | `cp apps/mobile/.env.example apps/mobile/.env` — el ejemplo **ya trae valores** (son `EXPO_PUBLIC_*`, públicos por diseño) | El `.env.example` sí; el `.env` no |
| Plantilla | `C:/proyectos/CONNECT-HUB/.env.example` | Versionada, **sin secretos** | **Sí** |

Cómo lo consume Docker: en `docker-compose.yml` y `docker-compose.dev.yml` el servicio `api` declara `env_file: .env`, es decir, lee el `.env` **de la raíz del repo** (`/root/app/.env` en el servidor). Compose además usa ese mismo `.env` para resolver las interpolaciones `${DOMAIN}`, `${ACME_EMAIL}`, `${NEXT_PUBLIC_API_URL}`, `${NEXT_PUBLIC_NAS_URL}` del propio archivo compose.

### 6.2 Variables de infraestructura (`/.env`)

| Variable | Para qué sirve | Consumidor | Notas de restauración |
|---|---|---|---|
| `ORACLE_USER` | Usuario del esquema `<ver ORACLE_USER en .env>` | api | Lo provee el DBA de la Oracle remota |
| `ORACLE_PASSWORD` | Contraseña de ese usuario | api | Secreto. Respaldo fuera del repo |
| `ORACLE_CONNECT_STRING` | Cadena de conexión (host `<host-oracle>:1521`, servicio `XEPDB1`) | api | El servidor debe poder salir a ese host:puerto |
| `ORACLE_POOL_MIN` | Conexiones mínimas del pool | api | Numérico |
| `ORACLE_POOL_MAX` | Conexiones máximas del pool | api | Numérico. Subirlo de más puede agotar sesiones en la BD compartida |
| `API_PORT` | Puerto de escucha de NestJS (default 4000) | api | Si se cambia, hay que cambiar también `expose` y el `reverse_proxy` del Caddyfile |
| `CORS_ORIGIN` | Lista separada por comas de orígenes permitidos | api | En prod: el dominio público. **No debe contener `localhost`** |
| `JWT_SECRET` | Firma del access token del **panel** | api | Regenerar con `openssl rand -hex 32`. Rotarlo invalida sesiones del panel |
| `JWT_REFRESH_SECRET` | Firma del refresh token del panel | api | Ídem |
| `COOKIE_SECRET` | Firma de cookies (`@fastify/cookie`) | api | Ídem |
| `JWT_ASISTENTE_SECRET` | Firma del access token de la **app móvil** | api | Ídem. Rotarlo desloguea a todos los asistentes |
| `JWT_ASISTENTE_REFRESH_SECRET` | Firma del refresh token de asistentes | api | Ídem |
| `PAGOS_API_URL` | Base del servicio externo Evento-back | api | Servicio de pagos/identidad |
| `PAGOS_JWT_SECRET` | Secreto compartido con Evento-back | api | **Debe COINCIDIR EXACTAMENTE** con el `JWT_SECRET` de Evento-back o el intercambio de sesión falla. No se genera: se pide |
| `PUBLIC_API_URL` | Base **pública** de la API que se envía al servicio de pagos como URL de retorno/callback del checkout | api | **No está en `.env.example` ni en el `.env` actual**: el código cae al default `https://connecthub.fourstacklabs.com/api` (`apps/api/src/modules/public/pagos/pagos.service.ts`). En prod el default coincide, pero **si cambia el dominio hay que declararla explícitamente** o los callbacks de pago apuntarán al dominio viejo |
| `GOOGLE_CLIENT_IDS` | Client IDs OAuth aceptados al verificar el `id_token` (coma) | api | Del proyecto de Google Cloud **338617760077** ("pagos"), no de "ueesApp" |
| `APPLE_CLIENT_IDS` | Bundle id(s) aceptados como audiencia de Sign in with Apple | api | `com.fourstacklabs.connecthub` |
| `REDIS_URL` | URL de Redis | api | **Sobreescrita por el compose** a `redis://redis:6379` |
| `SMTP_HOST` | Host SMTP | api | Google Workspace: `smtp.gmail.com` |
| `SMTP_PORT` | Puerto SMTP | api | 587 con Workspace |
| `SMTP_USER` | Cuenta remitente | api | — |
| `SMTP_PASS` | Contraseña de aplicación | api | Debe ser una **"App Password" de 16 caracteres** (requiere verificación en 2 pasos), **no** la contraseña normal de la cuenta |
| `SMTP_FROM` | Remitente que ve el destinatario | api | — |
| `APP_URL` | URL pública usada en los enlaces de los correos | api | En prod, el dominio con `https://` |
| `FSL_WEBHOOK_SECRET` | Secreto compartido con FourStackLabs para verificar la firma HMAC `X-FSL-Signature` | api | Endpoint: `POST https://connecthub.fourstacklabs.com/api/fsl/webhooks`. Ver `docs/fsl-webhooks-connecthub.md` |
| `NAS_URL` | Base del NAS de archivos/imágenes | api | `https://api-ligaprocorp.ec:3443/api`. También lo usa el healthcheck del NAS |
| **`DOMAIN`** | **Dominio público que sirve Caddy** | **caddy** | Default `connecthub.fourstacklabs.com`. Debe coincidir con el registro DNS A |
| **`ACME_EMAIL`** | **Email de contacto ACME / Let's Encrypt** | **caddy** | Default `admin@fourstacklabs.com` |
| `COOKIE_SECURE` | Cookie de refresh solo por HTTPS | api | **Sobreescrita por el compose a `"true"` en prod** |
| **`NEXT_PUBLIC_API_URL`** | URL pública de la API que consume el navegador | **web (build arg)** | En prod: `https://<DOMAIN>/api`. **Requiere rebuild al cambiar** |
| **`NEXT_PUBLIC_NAS_URL`** | URL del NAS que consume el navegador | **web (build arg)** | Ídem, **requiere rebuild** |

### 6.3 Variables de la app móvil (`apps/mobile/.env`)

Todas son `EXPO_PUBLIC_*`, es decir **públicas por diseño** (quedan dentro del bundle de la app, cualquiera puede extraerlas). **Nunca pongas un secreto en una variable `EXPO_PUBLIC_*`.**

> **Importante — `apps/mobile/.env` solo aplica a `expo start` en local.** Las builds de tienda **no leen ese archivo**: los valores están **horneados en `apps/mobile/eas.json`**, dentro del bloque `env` de los perfiles `preview` y `production`. Si cambias una `EXPO_PUBLIC_*` y solo tocas el `.env`, **la app publicada seguirá con el valor viejo**. Hay que editar `eas.json` y volver a compilar con EAS.

| Variable | Para qué sirve |
|---|---|
| `EXPO_PUBLIC_API_URL` | Base de la API pública de ConnectHub |
| `EXPO_PUBLIC_WEB_URL` | Base del panel/landings (privacy, certificados) |
| `EXPO_PUBLIC_PAGOS_API_URL` | Base del servicio Evento-back |
| `EXPO_PUBLIC_PAGOS_LOGIN_PATH` | Ruta de login usuario/clave en Evento-back |
| `EXPO_PUBLIC_PAGOS_GOOGLE_PATH` | Ruta de login Google en Evento-back |
| `EXPO_PUBLIC_PAGOS_APPLE_PATH` | Ruta de login Apple en Evento-back |
| `EXPO_PUBLIC_PAGOS_REFRESH_PATH` | Ruta de refresh de sesión en Evento-back |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Client ID OAuth **web** (proyecto Google 338617760077) |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Client ID OAuth iOS |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Client ID OAuth Android |

### 6.4 Variables inyectadas solo por el override local (NUNCA en prod)

| Variable | Efecto | Recordatorio |
|---|---|---|
| `ASISTENTE_DEV_TOKENS` | Expone tokens de verificación/reset en la respuesta HTTP | **Solo local, sin SMTP.** Su ausencia en el servidor es lo que garantiza que el secreto no se filtre en prod |

---

## 7. Procedimiento de despliegue a producción

### 7.0 Datos del entorno

| Dato | Valor |
|---|---|
| Servidor | `209.126.77.72` |
| Ruta de la app | `/root/app` |
| Usuario | `root` (el `SERVER_SETUP.md` describe un usuario `deploy`; **la instalación real corre como root en `/root/app`**) |
| Rama desplegada | `main` |
| Dominio | `https://connecthub.fourstacklabs.com` |
| Tipo de deploy | **Manual.** No hay CI/CD ni GitHub Actions configurado |

### 7.1 Pre-vuelo (en tu máquina, antes de tocar el servidor)

```bash
cd /c/proyectos/CONNECT-HUB

# 1. Lo que vas a desplegar está commiteado y pusheado
git status
git log --oneline -5
git push origin main

# 2. Confirma que el remoto tiene tu commit
git ls-remote origin main
```

**Anota el commit actualmente en producción antes de nada** (lo necesitarás para un rollback):

```bash
ssh root@209.126.77.72 'cd /root/app && git rev-parse --short HEAD'
```

> Guarda ese hash. Es tu punto de retorno.

### 7.2 Deploy — opción A: con el script `deploy.sh` (recomendado)

`deploy.sh` vive en la raíz del repo, es ejecutable y corre **en el servidor**. Usa `set -euo pipefail` (aborta ante el primer error) y `cd "$(dirname "$0")"` (funciona sin importar desde dónde lo llames).

Lo que hace, en orden:
1. `git fetch --quiet origin main`
2. `git reset --hard --quiet origin/main` ← **descarta cualquier cambio local** en archivos versionados
3. Imprime el commit corto resultante
4. `docker compose up -d --build`
5. `docker compose ps`

Ejecución:

```bash
ssh root@209.126.77.72
cd /root/app
./deploy.sh
```

O en una sola línea desde tu máquina:

```bash
ssh root@209.126.77.72 'cd /root/app && ./deploy.sh'
```

> **Ojo con `git reset --hard`:** borra ediciones hechas a mano en el servidor sobre archivos versionados. **No** toca archivos ignorados, así que `.env` está a salvo — y `docker-compose.override.yml` también sobreviviría si alguien lo hubiera puesto ahí (ver §3.3).

### 7.3 Deploy — opción B: paso a paso manual

Útil cuando quieres inspeccionar entre pasos.

```bash
# 1. Conectar
ssh root@209.126.77.72

# 2. Ir a la app
cd /root/app

# 3. Confirmar rama y estado limpio
git branch --show-current          # debe decir: main
git status --short                 # idealmente vacío

# 4. Verificar que NO hay override (§3.3)
ls docker-compose.override.yml 2>/dev/null && echo "PELIGRO: borrar antes de continuar"

# 5. Traer cambios
git pull origin main
git log --oneline -3

# 6. Reconstruir y levantar (--build es OBLIGATORIO: ver §4.2)
docker compose up -d --build

# 7. Estado
docker compose ps
```

**`docker compose up -d --build` hace, en una sola orden:** reconstruye las imágenes que cambiaron, recrea solo los contenedores cuya imagen o config cambió, y los deja corriendo en background. Los servicios sin cambios **no se tocan** (Redis y Caddy normalmente sobreviven intactos).

**Por qué `--build` nunca es opcional:** sin él, `web` seguiría sirviendo el bundle viejo con los `NEXT_PUBLIC_*` horneados de antes (§4.2) y `api` seguiría con el `dist/` anterior.

### 7.4 Verificación post-deploy (obligatoria)

**a) Estado de los contenedores — deben estar los 4 `Up`, y `api` debe decir `(healthy)`:**

```bash
docker compose ps
```

Espera hasta ~15-20 s tras el arranque: el healthcheck de `api` tiene `start_period: 15s`.

**b) Health interno de la API (desde el servidor):**

Con el compose de producción el puerto 4000 **no** está publicado, así que `curl http://localhost:4000/health` **desde el host no funciona** (y que funcione sería una señal de alarma: ver §3.3). Lo correcto es preguntarle al contenedor:

```bash
docker compose exec api node -e "fetch('http://localhost:4000/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j,null,2)))"
```

**c) Health público (desde tu máquina, atravesando Caddy):**

```bash
curl -s https://connecthub.fourstacklabs.com/api/health
```

Respuesta esperada (estructura real que devuelve `HealthController`):

```json
{
  "status": "ok",
  "oracle": { "ok": true, "latencyMs": 12 },
  "redis":  { "ok": true, "latencyMs": 1 },
  "nas":    { "ok": true, "latencyMs": 210 },
  "smtp":   { "configured": true },
  "timestamp": "2026-07-19T18:00:00.000Z"
}
```

**d) Panel web responde:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://connecthub.fourstacklabs.com/login    # 200
curl -s -o /dev/null -w "%{http_code}\n" https://connecthub.fourstacklabs.com/privacy  # 200
curl -s -o /dev/null -w "%{http_code}\n" https://connecthub.fourstacklabs.com/estado   # 200
```

Además, abre `/estado` en el navegador: es la comprobación **de punta a punta** de que `NEXT_PUBLIC_API_URL` quedó bien horneado en el build (§4.2). Si `/api/health` responde `ok` por curl pero `/estado` muestra las dependencias caídas, el problema es la variable horneada, **no** la infraestructura.

**e) TLS válido:**

```bash
curl -sI https://connecthub.fourstacklabs.com | head -5
echo | openssl s_client -connect connecthub.fourstacklabs.com:443 -servername connecthub.fourstacklabs.com 2>/dev/null | openssl x509 -noout -dates
```

**f) Headers de seguridad presentes:**

```bash
curl -sI https://connecthub.fourstacklabs.com | grep -iE 'strict-transport|x-frame|x-content-type|referrer-policy'
```

**g) La API directa sigue cerrada (control anti-override):**

```bash
curl -s -m 5 http://209.126.77.72:4000/health && echo "PELIGRO" || echo "OK: cerrado"
```

**h) Sin errores en los logs de arranque:**

```bash
ssh root@209.126.77.72 'cd /root/app && docker compose logs --tail=50 api'
```

**i) Prueba funcional mínima** — entrar al panel con una cuenta real y, si el deploy tocó la app móvil o la API pública, probar el login de asistente. Las cuentas demo de revisores (`reviewer1@connecthub.fourstacklabs.com`, código de institución `DEMO123`) sirven para un smoke test.

### 7.5 Checklist de deploy (imprimible)

- [ ] Cambios commiteados y pusheados a `origin/main`
- [ ] Anotado el commit actual de producción (para rollback)
- [ ] `ssh root@209.126.77.72` → `cd /root/app`
- [ ] Verificado que **no** existe `docker-compose.override.yml`
- [ ] `./deploy.sh` (o `git pull` + `docker compose up -d --build`)
- [ ] `docker compose ps` → 4 servicios `Up`, `api` `(healthy)`
- [ ] `curl https://connecthub.fourstacklabs.com/api/health` → `"status":"ok"`
- [ ] `/login` y `/privacy` → 200
- [ ] Puerto 4000 público cerrado
- [ ] Logs sin errores
- [ ] Smoke test manual en el panel

---

## 8. Operación: logs, reinicios, estado

Todos los comandos se ejecutan desde `/root/app` en el servidor.

### 8.1 Estado

```bash
docker compose ps                 # estado, salud y puertos de cada servicio
docker compose ps -a              # incluye contenedores detenidos
docker stats --no-stream          # CPU / RAM / red por contenedor
docker compose images             # qué imagen (y qué tamaño) usa cada servicio
```

### 8.2 Logs

```bash
docker compose logs -f api                    # seguir logs de la API
docker compose logs -f web                    # panel Next.js
docker compose logs -f caddy                  # proxy: TLS, ACME, errores de ruteo
docker compose logs -f redis

docker compose logs --tail=200 api            # últimas 200 líneas
docker compose logs --since 30m api           # últimos 30 minutos
docker compose logs -f                        # TODOS los servicios entrelazados
docker compose logs --tail=500 api | grep -i error
```

Volcar logs a un archivo para analizarlos con calma:

```bash
docker compose logs --since 2h --no-color > /tmp/connecthub-$(date +%F-%H%M).log
```

> Los logs viven en el driver de logging de Docker, **no** en archivos del repo. Un `docker compose down` + `up` los borra (se crean contenedores nuevos). Si necesitas conservar evidencia de un incidente, vuélcala **antes** de reiniciar.

### 8.3 Reiniciar servicios

```bash
docker compose restart api                    # reinicia solo la API (sin rebuild)
docker compose restart web
docker compose restart caddy                  # recarga tras editar el Caddyfile
docker compose restart                        # todo

docker compose up -d --force-recreate api     # recrea el contenedor (aplica cambios de env del compose)
docker compose up -d --no-deps --build api    # reconstruye SOLO la api, sin tocar web/redis/caddy
```

Diferencias importantes:

| Comando | ¿Relee el `.env`? | ¿Reconstruye la imagen? | Cuándo usarlo |
|---|---|---|---|
| `restart <svc>` | **No** | No | Servicio colgado, fuga de memoria |
| `up -d --force-recreate <svc>` | Sí | No | Cambiaste una variable del `.env` que se lee en runtime |
| `up -d --build <svc>` | Sí | **Sí** | Cambió el código, o cambió un `NEXT_PUBLIC_*` |

> Recordatorio: cambiar `NEXT_PUBLIC_API_URL` o `NEXT_PUBLIC_NAS_URL` exige **`--build` de `web`**, no basta con recrear.

### 8.4 Entrar a un contenedor

```bash
docker compose exec api sh                    # shell en la API
docker compose exec redis redis-cli           # consola de Redis
docker compose exec redis redis-cli ping      # → PONG
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
```

### 8.5 Apagar / levantar

```bash
docker compose stop                # detiene sin borrar contenedores
docker compose start               # los vuelve a arrancar
docker compose down                # detiene Y BORRA contenedores (los volúmenes SOBREVIVEN)
docker compose up -d               # levanta de nuevo
```

> ⚠️ **`docker compose down -v` borra los volúmenes**, incluido `caddy_data` (los certificados TLS). **No lo uses en producción.**

### 8.6 Limpieza de disco

Los deploys repetidos acumulan imágenes huérfanas y llenan el disco:

```bash
df -h /                            # ver espacio antes
docker system df                   # cuánto ocupa Docker y en qué
docker image prune -f              # borra imágenes dangling (seguro)
docker builder prune -f            # limpia la caché de build (lo que más pesa)
```

> **No uses `docker system prune -a --volumes`**: borraría volúmenes y con ellos los certificados.

---

## 9. Rollback

No hay artefactos versionados ni registry de imágenes: **el rollback es por commit de Git + rebuild.**

### 9.1 Rollback rápido al commit anterior conocido

```bash
ssh root@209.126.77.72
cd /root/app

# 1. Ver el historial reciente
git log --oneline -10

# 2. Volver al commit bueno (el que anotaste en §7.1)
git checkout <hash_del_commit_bueno>

# 3. Reconstruir y levantar
docker compose up -d --build

# 4. Verificar (§7.4)
docker compose ps
curl -s https://connecthub.fourstacklabs.com/api/health
```

Tras un `git checkout <hash>` el repo queda en **detached HEAD**. Es correcto y funcional para producción, pero **el siguiente `./deploy.sh` te devolverá a `origin/main`** (porque hace `git reset --hard origin/main`). Es decir: el rollback es **temporal** hasta que se arregle `main`.

### 9.2 Rollback al último commit (deshacer el deploy que acabas de hacer)

```bash
cd /root/app
git checkout HEAD~1
docker compose up -d --build
```

### 9.3 Rollback definitivo (la forma correcta)

El rollback en el servidor es una tirita. **La corrección real se hace en `main`**, para que el próximo deploy no reintroduzca el fallo:

```bash
# En tu máquina
cd /c/proyectos/CONNECT-HUB
git revert <hash_del_commit_malo>      # crea un commit que deshace el cambio
git push origin main

# En el servidor
ssh root@209.126.77.72 'cd /root/app && ./deploy.sh'
```

`git revert` es preferible a `git reset --hard` + `push --force` sobre `main`: no reescribe historia compartida.

### 9.4 Volver a la rama tras un rollback temporal

```bash
cd /root/app
git checkout main
git pull origin main
docker compose up -d --build
```

### 9.5 Qué NO revierte un rollback de código

| Cosa | ¿Se revierte con git checkout? |
|---|---|
| Código de API y web | Sí |
| **Cambios de esquema en Oracle** (`docs/sql/*.sql` ya ejecutados) | **No.** Hay que revertirlos a mano con SQL. Y ojo: **el esquema es compartido con una app externa** |
| Datos ya escritos en Oracle | No |
| **La app móvil ya publicada** en las tiendas | No. Requiere una build y una release nuevas (o desactivar la versión en la consola de la tienda) |
| Certificados TLS | No aplica (viven en `caddy_data`, independientes del código) |

> Por eso, **antes de un deploy que incluya un script SQL, ten escrito el SQL de reversa.**

---

## 10. Entorno de desarrollo local desde cero

Escenario: PC Windows recién formateada, cero herramientas instaladas.

### 10.1 Requisitos

| Herramienta | Para qué | Notas |
|---|---|---|
| **Docker Desktop** | Corre API + Web + Redis | **No necesitas instalar Node ni Oracle client para el backend**: todo vive dentro de los contenedores. Activa el backend WSL2 |
| **Git** | Clonar el repo | — |
| **Node ≥ 20** | **Solo** para la app móvil (Expo) y comandos EAS | El `package.json` raíz declara `engines: { node: ">=20" }` |
| Cuenta **Expo** (EAS) | Compilar/publicar la móvil | Proyecto `alcivator/connecthub` |
| Cuentas **Apple Developer** y **Google Play Developer** | Publicar en tiendas | Solo si vas a hacer releases |
| Editor (VS Code) | — | — |

### 10.2 Clonar y configurar

```bash
git clone https://github.com/raulalcivarm10/CONNECT-HUB.git C:/proyectos/CONNECT-HUB
cd C:/proyectos/CONNECT-HUB

# Entorno del backend + web (REQUIERE SECRETOS REALES — pídelos al responsable)
cp .env.example .env

# Entorno de la móvil (el ejemplo ya trae los valores: son EXPO_PUBLIC_*, públicos)
cp apps/mobile/.env.example apps/mobile/.env
```

Abre `.env` y completa los valores. Los mínimos para que la API arranque:

- `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING` (sin esto la API arranca pero `/health` sale `degraded` y nada funciona).
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, `JWT_ASISTENTE_SECRET`, `JWT_ASISTENTE_REFRESH_SECRET` — genera cada uno tú mismo, **no reutilices los de producción**:
  ```bash
  openssl rand -hex 32
  ```
- `PAGOS_JWT_SECRET` — este **no se genera**, debe coincidir exactamente con el de Evento-back. Pídelo.
- SMTP: si lo dejas vacío, la clave temporal se muestra en pantalla en lugar de enviarse por correo (aceptable solo en dev).

> Tu IP puede necesitar estar autorizada para llegar a la Oracle remota (`<host-oracle>:1521`). Si `/health` reporta `oracle.ok=false` con timeout, es lo primero a revisar.

### 10.3 Levantar backend + web con hot-reload

```bash
cd C:/proyectos/CONNECT-HUB
docker compose -f docker-compose.dev.yml up --build
```

La primera vez tarda varios minutos (descarga `node:22-alpine`, instala dependencias de ambas apps). Las siguientes son rápidas gracias a la caché de capas.

| Servicio | URL |
|---|---|
| Panel web | http://localhost:3000 |
| API | http://localhost:4000 |
| Health de la API | http://localhost:4000/health |
| Swagger | http://localhost:4000/docs |

En background y con logs aparte:

```bash
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml logs -f api
docker compose -f docker-compose.dev.yml down
```

**El hot-reload ya está resuelto**: los bind mounts + `CHOKIDAR_USEPOLLING` / `WATCHPACK_POLLING` hacen que editar en Windows recompile dentro del contenedor. No necesitas reiniciar nada al tocar código.

**Cuándo SÍ tienes que reconstruir en dev:** cuando cambias `package.json` (nueva dependencia), porque `node_modules` vive en un volumen:

```bash
docker compose -f docker-compose.dev.yml down
docker volume rm connect-hub-dev_api_node_modules   # o web_node_modules
docker compose -f docker-compose.dev.yml up --build
```

### 10.4 Probar la build de producción en local

```bash
docker compose up --build
```

Esto usa `docker-compose.yml` **más el `docker-compose.override.yml` si existe** (merge automático). En local eso es lo que quieres: te publica el 4000 y amplía el CORS para Expo.

Sirve para verificar que el build de producción compila y que la imagen `standalone` de Next arranca — **antes** de descubrirlo en el servidor. Caddy intentará pedir certificados para `{$DOMAIN}`; en local eso falla (es normal) y accedes directo por `localhost:3000` / `localhost:4000`.

### 10.5 Correr la app móvil por web preview

La móvil **no entra en Docker**. Corre en el host con Node.

```bash
cd C:/proyectos/CONNECT-HUB/apps/mobile
npm install
npm run web        # => expo start --web --port 8100
```

Abre http://localhost:8100.

**El puerto 8100 no es negociable.** Es el **único `localhost` autorizado** en el proyecto de Google Cloud del servicio de pagos (herencia de cuando la app corría con `ionic serve`). Si arrancas Expo en otro puerto, **Google Sign-In falla** con un error de `redirect_uri` no autorizado. Por eso los scripts `start` y `web` del `package.json` de la móvil traen `--port 8100` fijo.

Ese mismo puerto está en la lista de `CORS_ORIGIN` del `docker-compose.override.yml`, junto con los puertos habituales de Metro/Expo (8081, 19006, 19000), para que el navegador no bloquee las llamadas a la API local.

Otras formas de correrla:

```bash
npm start          # Metro en 8100; abre con Expo Go o un dev build
npm run android    # emulador/dispositivo Android
npm run ios        # simulador iOS (requiere macOS)
```

### 10.6 Orden recomendado de arranque diario

```bash
# Terminal 1 — backend + web
cd C:/proyectos/CONNECT-HUB
docker compose -f docker-compose.dev.yml up

# Terminal 2 — móvil (solo si trabajas en ella)
cd C:/proyectos/CONNECT-HUB/apps/mobile
npm run web
```

### 10.7 Verificar que todo el entorno local está sano

```bash
curl -s http://localhost:4000/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login    # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/docs     # 200
```

---

## 11. Healthchecks

### 11.1 Healthcheck de Docker sobre `api` (solo en `docker-compose.yml`)

```yaml
healthcheck:
  test: ["CMD", "node", "-e", "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 15s
```

- Usa **`node -e` con `fetch` nativo** (Node 22) en vez de `curl`, porque la imagen `node:22-alpine` **no trae curl** y añadirlo solo para esto engordaría la imagen.
- `start_period: 15s` → los fallos durante los primeros 15 s **no cuentan** (la API necesita levantar el pool de Oracle).
- Tras 3 fallos consecutivos, `docker compose ps` marca el contenedor como `unhealthy`.

> Nota: `unhealthy` **no reinicia el contenedor por sí solo**. `restart: unless-stopped` solo actúa si el proceso muere. Un contenedor que responde mal pero no se cae se queda `unhealthy` indefinidamente — por eso hay que mirar `docker compose ps` tras cada deploy.

### 11.2 Healthcheck de Redis

```yaml
test: ["CMD", "redis-cli", "ping"]
interval: 5s
timeout: 3s
retries: 10
```

Presente en `docker-compose.yml` **y** en `docker-compose.dev.yml`. Lo usa `api` con `depends_on: { redis: { condition: service_healthy } }`: **la API no arranca hasta que Redis responde `PONG`**, evitando el clásico crash-loop de arranque.

### 11.3 El endpoint `/health` de la aplicación

Implementado en `apps/api/src/health/health.controller.ts`. Comprueba **cuatro** dependencias, tres de ellas con `Promise.allSettled` (los fallos no se propagan) y midiendo latencia:

| Dependencia | Cómo se comprueba | ¿Afecta el `status`? |
|---|---|---|
| **Oracle** | `oracle.ping()` | **Sí** — si falla, `degraded` |
| **Redis** | `redis.ping()` | **Sí** — si falla, `degraded` |
| **NAS** | `GET {NAS_URL}/archivos/activo?tipoEntidad=EVENTO&id=0&tipoArchivo=PORTADA` con timeout de **4 s**. Se considera vivo si responde **HTTP, aunque sea 404** | **No** — es externo; si cae, la API sigue operativa (solo degradada funcionalmente) |
| **SMTP** | Solo informa `{ configured: <bool> }` según si el mailer está habilitado | No |

Regla de estado:

```
status = (oracle.ok && redis.ok) ? "ok" : "degraded"
```

Rutas:

| Entorno | URL |
|---|---|
| Producción | `https://connecthub.fourstacklabs.com/api/health` |
| Dev local | `http://localhost:4000/health` |

### 11.4 Monitoreo externo sugerido

No hay monitoreo configurado. Lo mínimo recomendable: un check HTTP cada 5 minutos contra `https://connecthub.fourstacklabs.com/api/health` que alerte si el status HTTP no es 200 **o** si el cuerpo contiene `"degraded"`.

---

## 12. Troubleshooting de fallos comunes

### 12.1 El sitio no carga / 502 Bad Gateway

```bash
cd /root/app
docker compose ps                 # ¿están todos Up?
docker compose logs --tail=100 caddy
docker compose logs --tail=100 web
docker compose logs --tail=100 api
```

502 desde Caddy significa casi siempre que **el upstream (`web:3000` o `api:4000`) no responde**. Causas típicas:
- El contenedor `web` o `api` se está reiniciando en bucle (mira `docker compose ps -a` y el conteo de reinicios).
- El build de Next falló y quedó una imagen a medias → `docker compose up -d --build web`.
- Se perdió `HOSTNAME=0.0.0.0` en la imagen de web (escucha en localhost interno y Caddy no llega).

### 12.2 La API arranca y muere en bucle

```bash
docker compose logs --tail=200 api
```

Sospechosos, en orden:
1. **Falta el `.env` o una variable obligatoria.** `ls -la /root/app/.env`.
2. **Oracle inalcanzable.** Verifica salida de red: `nc -zv <host-oracle> 1521`.
3. **Redis no llegó a healthy** → `docker compose logs redis`.
4. Error de sintaxis en el código recién desplegado → rollback (§9).

### 12.3 `/health` responde `"status": "degraded"`

Mira **qué** dependencia trae `ok: false` y su `error`:

| Falla | Diagnóstico | Acción |
|---|---|---|
| `oracle.ok = false` | Credenciales cambiadas, BD caída, red bloqueada, o pool agotado | `nc -zv <host-oracle> 1521` desde el server; revisar `ORACLE_*` en el `.env`; contactar al DBA |
| `redis.ok = false` | Contenedor de Redis caído | `docker compose ps redis` → `docker compose restart redis` |
| `nas.ok = false` | NAS externo caído o lento (>4 s) | `curl -sI https://api-ligaprocorp.ec:3443` desde el server. **No afecta el status global**: las imágenes no cargarán, el resto sí funciona |
| `smtp.configured = false` | Faltan las variables `SMTP_*` | Completar el `.env` y `docker compose up -d --force-recreate api` |

### 12.4 Caddy no consigue certificado / navegador avisa "no seguro"

```bash
docker compose logs caddy | grep -iE 'acme|certificate|error|challenge'
```

Checklist:
1. **DNS**: `dig +short connecthub.fourstacklabs.com` debe devolver `209.126.77.72`.
2. **Puerto 80 abierto y libre** (el desafío ACME lo necesita): `sudo ufw status`, `sudo ss -tlnp | grep ':80'`. Un nginx/apache residual ocupando el 80 es la causa clásica.
3. **`DOMAIN` correcto** en el `.env` (si está mal, Caddy pide el certificado del dominio equivocado).
4. **Rate limit de Let's Encrypt** (5 certs/dominio/semana) por haber recreado el volumen muchas veces → los logs lo dicen explícitamente. Solo se resuelve esperando.
5. Validar el Caddyfile antes de reiniciar:
   ```bash
   docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
   docker compose restart caddy
   ```

### 12.5 Cambié `NEXT_PUBLIC_API_URL` y el panel sigue llamando a la URL vieja

**Causa esperada, no es un bug.** Los `NEXT_PUBLIC_*` se hornean en el build (§4.2).

```bash
docker compose build --no-cache web
docker compose up -d web
```

Y en el navegador: recarga forzada (`Ctrl+Shift+R`) para saltarse la caché del bundle.

### 12.6 Errores de CORS ("Failed to fetch") desde el panel o desde la móvil

1. Verifica que el origen del cliente esté en `CORS_ORIGIN` del `.env` (lista separada por comas, **sin espacios**, **sin barra final**).
2. `main.ts` ya declara explícitamente los métodos `GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS` — porque `@fastify/cors` **solo permite GET/HEAD/POST por defecto** y sin eso el navegador bloquea PATCH y DELETE con un genérico "Failed to fetch". Si ves ese error solo en operaciones de edición/borrado, es por ahí.
3. En local, el `docker-compose.override.yml` es el que añade los orígenes de Expo. Si no lo tienes, la móvil por web dará CORS.
4. Tras tocar `CORS_ORIGIN`: `docker compose up -d --force-recreate api`.

### 12.7 Hot-reload no funciona en local

- Confirma que usas `-f docker-compose.dev.yml` (el compose de prod no monta el código).
- Verifica que el proyecto esté en una ruta compartida con Docker Desktop (Settings → Resources → File Sharing).
- `CHOKIDAR_USEPOLLING` / `WATCHPACK_POLLING` ya están en `true` en el compose de dev; si aun así falla, reinicia Docker Desktop.
- Si instalaste una dependencia nueva, hay que recrear el volumen de `node_modules` (§10.3).

### 12.8 "Port is already allocated" al levantar en local

Otro proceso ocupa 3000, 4000 u 8100:

```powershell
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

O muy probablemente tienes el compose de **prod local** y el de **dev** corriendo a la vez:

```bash
docker compose down                              # baja el de prod (proyecto connect-hub)
docker compose -f docker-compose.dev.yml down    # baja el de dev (proyecto connect-hub-dev)
```

### 12.9 Google Sign-In falla en la app móvil por web

Casi siempre: **Expo no está en el puerto 8100**. Es el único `localhost` autorizado en el proyecto Google de pagos (§10.5). Usa `npm run web` (que ya fija `--port 8100`), no `expo start --web` a secas.

En Android en producción, recuerda además que **Play re-firma la app** (Play App Signing activado): el SHA-1 que importa para Google Sign-In es el de la **App Signing key** (Play Console → Integridad de la app), **no** el de la upload key.

### 12.10 El disco del servidor se llenó

```bash
df -h /
docker system df
docker image prune -f
docker builder prune -f
```

Síntoma típico: el build empieza a fallar con errores raros de escritura, o los contenedores no arrancan. La caché de build (`docker builder prune`) suele ser lo que más ocupa tras muchos deploys.

### 12.11 Los certificados salen sin texto / con la fuente equivocada

Falta `fontconfig` / `ttf-liberation` en la imagen de la API (§4.1). Verifica:

```bash
docker compose exec api fc-list | grep -i liberation
```

Si no lista nada, la imagen se construyó sin las fuentes: revisa que el `RUN apk add` siga en **ambos** stages (`deps` y `prod`) del `apps/api/Dockerfile` y reconstruye con `--no-cache`.

### 12.12 Después de un deploy, la API queda `unhealthy` pero responde

Revisa que el healthcheck apunte al puerto correcto: si alguien cambió `API_PORT` en el `.env` sin actualizar el `healthcheck`, el `expose` y el `reverse_proxy` del Caddyfile, la API escucha en un puerto y todo lo demás la busca en 4000.

---

## 13. Montar un servidor nuevo (greenfield)

Resumen operativo de `SERVER_SETUP.md`, actualizado a la realidad actual (dominio único + Caddy, no dos subdominios).

> Los pasos con **claves y credenciales los ejecuta una persona**. La documentación no incluye ni debe incluir valores.

### 13.1 DNS

Un registro **A** apuntando a la IP del servidor:

| Registro | Destino |
|---|---|
| `connecthub.fourstacklabs.com` | `209.126.77.72` |

Verificar propagación: `dig +short connecthub.fourstacklabs.com`.

> El `SERVER_SETUP.md` original describe **dos** subdominios (`panel.` y `api-panel.`) porque se escribió antes de que existiera Caddy. **La arquitectura vigente es un único dominio con `/api` por ruta.** Un solo registro A basta.

### 13.2 Instalar Docker (Ubuntu/Debian)

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc >/dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update && sudo apt-get install -y \
  docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 13.3 Firewall

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

**No abras 3000 ni 4000.** Con Caddy delante no hacen falta, y abrirlos anula el modelo de seguridad (§2.2).

Verifica la **salida** hacia las dependencias externas:

```bash
nc -zv <host-oracle> 1521               # Oracle
curl -sI https://api-ligaprocorp.ec:3443 # NAS / Evento-back
```

### 13.4 Acceso al repo

`SERVER_SETUP.md` describe crear un usuario `deploy` y una **deploy key** SSH read-only:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github -C "server-deploy-key" -N ""
cat ~/.ssh/github.pub
# Pegar la PÚBLICA en GitHub → CONNECT-HUB → Settings → Deploy keys → Add (read-only)
printf 'Host github.com\n  IdentityFile ~/.ssh/github\n  IdentitiesOnly yes\n' >> ~/.ssh/config
chmod 700 ~/.ssh
```

> **Desviación conocida:** la instalación actual corre como **root en `/root/app`**, no como usuario `deploy` en `~/app`. Un servidor nuevo debería seguir la recomendación de `SERVER_SETUP.md` (usuario dedicado, sin login por contraseña, en el grupo `docker`).

### 13.5 Clonar y configurar

```bash
git clone git@github.com:raulalcivarm10/CONNECT-HUB.git /root/app
cd /root/app
cp .env.example .env
nano .env      # completar TODOS los valores (§6.2). Nunca commitear.
```

Verifica que **no** exista el override:

```bash
ls docker-compose.override.yml 2>/dev/null && rm docker-compose.override.yml
```

### 13.6 Primer arranque

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f caddy      # observar la emisión del certificado ACME
```

**No hay migraciones que correr**: el esquema ya vive en la Oracle remota. Si el deploy incluye cambios de esquema, los scripts están en `docs/sql/*.sql` y se ejecutan **manualmente** contra la BD.

Verificación final: recorrer §7.4 completa.

### 13.7 CI/CD

**No configurado.** El deploy es manual. `SERVER_SETUP.md` deja anotado el camino si algún día se automatiza: un `.github/workflows/deploy.yml` que entre por SSH y ejecute `docker compose`, con los secrets `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `DEPLOY_PATH`.

---

## 14. Backups y qué es realmente crítico

| Activo | Dónde vive | Quién lo respalda |
|---|---|---|
| **Base de datos** | Oracle remota `<host-oracle>` | **El DBA de esa Oracle** (RMAN / exports). No se respalda desde este servidor |
| **Imágenes y archivos** | NAS externo `api-ligaprocorp.ec:3443` | Del lado del NAS |
| **Redis** | Volumen `redis_data` (AOF) | No hace falta: es **solo caché**. Perderlo no pierde datos de negocio |
| **Código** | GitHub (`raulalcivarm10/CONNECT-HUB`) | Git |
| **Certificados TLS** | Volumen `caddy_data` | No hace falta respaldarlo, pero **evita borrarlo** (rate limit de Let's Encrypt) |
| **`/root/app/.env`** | Solo en el servidor | **NADIE automáticamente. Es lo único verdaderamente crítico e irrecuperable de esta máquina.** |

### El `.env` es el único punto de fallo real

Si el servidor desaparece, se puede reconstruir entero en ~30 minutos siguiendo §13 — **excepto el `.env`**, que no está en ningún repositorio.

**Guarda una copia cifrada fuera del servidor**, en un gestor de secretos o en un archivo cifrado en almacenamiento personal. Nunca en el repo, nunca en un chat, nunca en esta documentación.

Para copiarlo de forma segura a tu máquina:

```bash
scp root@209.126.77.72:/root/app/.env ./connecthub-env-$(date +%F).backup
```

Cífralo inmediatamente después y **borra la copia en claro**.

**Cuándo actualizar el respaldo:** cada vez que se añada o rote una variable (nuevo proveedor, rotación de JWT, cambio de contraseña SMTP o de Oracle).

---

## Apéndice A — Referencia rápida de comandos

### Producción (`/root/app` en `209.126.77.72`)

```bash
./deploy.sh                                   # deploy completo (fetch + reset + build + up)
docker compose ps                             # estado
docker compose logs -f api                    # logs
docker compose restart api                    # reiniciar
docker compose up -d --build                  # rebuild + up
docker compose up -d --no-deps --build api    # rebuild solo la api
git checkout <hash> && docker compose up -d --build   # rollback
curl -s https://connecthub.fourstacklabs.com/api/health
```

### Local

```bash
docker compose -f docker-compose.dev.yml up --build     # dev con hot-reload
docker compose -f docker-compose.dev.yml down
docker compose up --build                               # prod local (+ override)
cd apps/mobile && npm run web                           # móvil en :8100
```

## Apéndice B — Puertos

| Puerto | Dónde | Publicado a Internet | Qué es |
|---|---|---|---|
| 80 | caddy | **Sí** | HTTP → redirige a HTTPS; desafío ACME |
| 443 | caddy | **Sí** | HTTPS público |
| 4000 | api | **No** (solo `expose`) | API NestJS/Fastify. En dev y con override local, sí publicado |
| 3000 | web | **No** (solo `expose`) | Next.js standalone. En dev, publicado |
| 6379 | redis | **No** | Redis, solo red interna de compose |
| 8100 | Expo (host) | No | Web preview de la móvil. **Puerto fijo obligatorio** por Google OAuth |
| 1521 | Oracle **remota** | N/A (saliente) | El servidor debe poder alcanzar `<host-oracle>:1521` |
| 3443 | NAS / Evento-back **remoto** | N/A (saliente) | `api-ligaprocorp.ec:3443` |

## Apéndice C — Documentos relacionados

| Documento | Tema |
|---|---|
| `SERVER_SETUP.md` | Setup del servidor greenfield (base de §13) |
| `README.md` | Visión general del monorepo y arranque rápido |
| `docs/apis-produccion.md` | Endpoints de producción |
| `docs/modelo-datos.md` | Esquema Oracle y relaciones |
| `docs/inventario-localhost.md` | Todos los usos de `localhost` en el código |
| `docs/publicar-tiendas.md` · `docs/entrega-tiendas-equipo.md` | Publicación iOS/Android |
| `docs/smtp-setup.md` | Configuración de SMTP |
| `docs/nas-espacios.md` | NAS de imágenes y sus límites |
| `docs/fsl-webhooks-connecthub.md` | Webhooks de provisión de instituciones |
| `docs/checkout-paymentez.md` | Pagos / checkout |
| `docs/sql/*.sql` | Migraciones manuales de esquema |
| `docs/handbook/07-credenciales-y-accesos.md` | **Dónde vive cada credencial** (no los valores) |
| `apps/mobile/eas.json` | Valores `EXPO_PUBLIC_*` horneados en las builds de tienda (§6.3) |
