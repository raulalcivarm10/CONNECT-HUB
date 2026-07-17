# Inventario de `localhost` — CONNECT-HUB

> Auditoría de todos los puntos del monorepo que apuntan a `localhost` (o equivalentes) y qué debe usarse en **producción**. Generado 2026-07-17.

---

## 🚨 Resumen ejecutivo

Solo **UN** punto rompe producción de verdad:

| Prioridad | Archivo | Hoy | Debe ser (prod) |
|---|---|---|---|
| 🔴 **CRÍTICO** | `apps/mobile/.env` → `EXPO_PUBLIC_API_URL` | `http://localhost:4000` | `https://connecthub.fourstacklabs.com/api` |

La **app móvil** apunta a `localhost`. En un build de tienda, "localhost" es el propio teléfono → no llega al backend. **Este es el único cambio obligatorio** para que la app funcione en producción.

Todo lo demás es: (a) valores de **dev local** (correctos en dev), (b) **fallbacks** en código que solo se usan si falta la variable de entorno (en prod la variable está seteada), o (c) `localhost` **interno de un contenedor** (correcto). Detalle abajo.

---

## 1. Runtime `.env` (valores reales que se usan al ejecutar)

Los `.env` están gitignoreados (no viajan al repo). Cada entorno tiene el suyo.

### `apps/mobile/.env` — app móvil (Expo)
| Variable | Valor actual (dev) | Prod | Nota |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://localhost:4000` | **`https://connecthub.fourstacklabs.com/api`** | 🔴 API ConnectHub. **Cambiar para el build de tienda** (o setear en `eas.json`/EAS secrets, porque `.env` no viaja al build EAS). |
| `EXPO_PUBLIC_WEB_URL` | `https://connecthub.fourstacklabs.com` | (igual) | ✅ Ya apunta a prod. Se usa en el link "Añadir a LinkedIn" del certificado. |
| `EXPO_PUBLIC_PAGOS_API_URL` | `https://api-ligaprocorp.ec:3443/api` | (igual) | ✅ Servicio de pagos externo. No es localhost. |
| `EXPO_PUBLIC_PAGOS_LOGIN_PATH` | `/auth/login-user-password` | (igual) | Ruta del servicio externo. |
| `EXPO_PUBLIC_PAGOS_GOOGLE_PATH` | `/auth/register-google` | (igual) | Ruta del servicio externo. |
| `EXPO_PUBLIC_PAGOS_REFRESH_PATH` | `/auth/refresh` | (igual) | Ruta del servicio externo. |
| `EXPO_PUBLIC_GOOGLE_{WEB,IOS,ANDROID}_CLIENT_ID` | (client IDs) | (iguales) | IDs públicos de Google Sign-In. |

### `.env` raíz — panel web + API (dev local vs prod)
| Variable | Dev local | Prod (`/root/app/.env`) | Nota |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://localhost/api` | `https://connecthub.fourstacklabs.com/api` | Build-arg horneado en el web. En prod ya es el dominio real. |
| `CORS_ORIGIN` | `https://localhost` | dominio real | Origen permitido para el navegador. |
| `DOMAIN` | `localhost` | `connecthub.fourstacklabs.com` | Lo usa Caddy (cert TLS). |
| `APP_URL` | `https://localhost` | dominio real | |
| `NAS_URL` / `NEXT_PUBLIC_NAS_URL` | `https://api-ligaprocorp.ec:3443/api` | (igual) | ✅ NAS externo. No es localhost. |
| `PAGOS_API_URL` | `https://api-ligaprocorp.ec:3443/api` | (igual) | ✅ Pasarela externa. |
| `REDIS_URL` | `redis://redis:6379` | (igual) | Hostname interno de Docker (no localhost). |
| `ORACLE_CONNECT_STRING` | `154.38.187.235:1521/XEPDB1` | (igual) | Oracle remota compartida. |

> El `.env` de dev local usa `localhost` **a propósito** (es dev). El `.env` de prod ya tiene el dominio real. **No hay que tocar el `.env` local.**

---

## 2. Código — fallbacks a `localhost` (solo si falta la env var)

Estos `?? 'http://localhost:4000'` son **defensivos**: solo aplican si la variable de entorno NO está definida. En prod la variable siempre está seteada, así que el fallback **no se usa**. No son un problema, pero conviene conocerlos.

| Archivo:línea | Código | Para qué | ¿Riesgo? |
|---|---|---|---|
| `apps/mobile/src/api/client.ts:10` | `EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'` | Cliente HTTP de la app móvil | ⚠️ Si el build no define `EXPO_PUBLIC_API_URL`, cae a localhost → app rota. **Asegurar la env var en el build.** |
| `apps/web/src/lib/api/client.ts:3` | `NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'` | Cliente del panel admin | ✅ Bajo, en prod la var está horneada. |
| `apps/web/src/app/estado/page.tsx:17` | `NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'` | Página de estado/health del panel | ✅ Bajo. |
| `apps/web/src/app/c/[codigo]/page.tsx:6` | `API_INTERNAL_URL ?? NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'` | Fetch SSR de la landing de certificados | ✅ En prod usa `API_INTERNAL_URL=http://api:4000` (hostname interno). |
| `apps/web/src/app/c/[codigo]/page.tsx:7` | `NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'` | URL pública para la imagen OG del certificado | ✅ En prod es el dominio. |

---

## 3. Build / Docker / config

| Archivo:línea | Valor | Qué es | ¿Riesgo? |
|---|---|---|---|
| `docker-compose.yml:36` | `fetch('http://localhost:4000/health')` | Healthcheck del contenedor `api` | ✅ **Correcto**: `localhost` aquí = el propio contenedor api. |
| `docker-compose.yml:48` | `NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:4000}` | Build-arg del web (default) | ✅ En prod lo sobreescribe el `.env` del server. |
| `apps/web/Dockerfile:16` | `ARG NEXT_PUBLIC_API_URL=http://localhost:4000` | Default del build-arg | ✅ Sobrescrito por compose. |
| `docker-compose.dev.yml:30` | `NEXT_PUBLIC_API_URL: http://localhost:4000` | Compose de **dev** (no se usa en prod) | ✅ Solo dev. |
| `.env.example:10,46` | `CORS_ORIGIN=http://localhost:3000`, `NEXT_PUBLIC_API_URL=http://localhost:4000` | Plantilla de ejemplo | ✅ Solo ejemplo. |

---

## 4. Documentación (informativo, sin efecto en runtime)

| Archivo | Referencia |
|---|---|
| `README.md:21-22` | URLs de dev (web :3000, api :4000). |
| `SERVER_SETUP.md:112-138` | Comandos de verificación + ejemplo de reverse-proxy. |
| `docs/checkout-paymentez.md:12` | Tabla que ya documenta dev (`localhost:4000`) vs prod (`connecthub.fourstacklabs.com/api`). |

---

## 5. Mapa de URLs — quién apunta a quién

```
                          DEV local                         PRODUCCIÓN
─────────────────────────────────────────────────────────────────────────────────
API ConnectHub (NestJS)   http://localhost:4000       →   https://connecthub.fourstacklabs.com/api
   (directo)              https://localhost/api            (Caddy: /api/* → api:4000)
Panel web (Next.js)       http://localhost:3000       →   https://connecthub.fourstacklabs.com
   (o via Caddy)          https://localhost
App móvil (Expo)          EXPO_PUBLIC_API_URL         →   (DEBE ser) https://connecthub.fourstacklabs.com/api
   ⚠️ hoy: localhost:4000

SIEMPRE IGUAL (externos, nunca localhost):
  NAS (imágenes)          https://api-ligaprocorp.ec:3443/api
  Pasarela de pagos       https://api-ligaprocorp.ec:3443/api
  Oracle (BD)             154.38.187.235:1521/XEPDB1  (compartida dev+prod)

HOSTNAMES INTERNOS DE DOCKER (no son localhost, resuelven dentro de la red compose):
  redis://redis:6379          API_INTERNAL_URL=http://api:4000 (SSR landing cert)      web:3000
```

---

## 6. Checklist para producción

- [ ] 🔴 **App móvil**: setear `EXPO_PUBLIC_API_URL=https://connecthub.fourstacklabs.com/api` en el build (perfil `production` de `eas.json` o EAS secrets — **NO** basta el `.env` local porque no viaja al build EAS). Ídem `EXPO_PUBLIC_PAGOS_API_URL` (ya apunta a externo) y los `EXPO_PUBLIC_GOOGLE_*`.
- [x] **Panel web prod**: `NEXT_PUBLIC_API_URL` ya = dominio real en el `.env` del server (build-arg horneado).
- [x] **Landing certificados**: `API_INTERNAL_URL=http://api:4000` ya está en `docker-compose.yml` (SSR).
- [ ] **Nada que cambiar** en los `.env` locales ni en los fallbacks de código (son dev / defensivos).
