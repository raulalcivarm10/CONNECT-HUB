# ConnectHub

Plataforma de eventos para instituciones sobre una base **Oracle** existente (esquema `CONNECT_HUB`). Tres piezas en un monorepo:

| App | Qué es | Stack | Carpeta |
|---|---|---|---|
| **API** | Backend: panel admin + API pública de la app de asistentes | NestJS 11 + Fastify + `node-oracledb` (thin) | [`apps/api`](apps/api) |
| **Web** | Panel administrativo (instituciones) | Next.js App Router + Tailwind v4 + TanStack Query | [`apps/web`](apps/web) |
| **Mobile** | App de asistentes (iOS + Android) | Expo SDK 57 + React Native + Expo Router | [`apps/mobile`](apps/mobile) |

- **Caché:** Redis 7 · **BD:** Oracle 21c XE **remota** (no se administra desde este repo).
- **Dominio prod:** `https://connecthub.fourstacklabs.com` (API en `/api/*`).
- **Servicios externos:** pasarela/identidad **Evento-back** (`api-ligaprocorp.ec:3443/api`) y **NAS** de imágenes.

> ⚠️ **Secretos:** este repo **no** contiene credenciales reales. Los `.env` están en `.gitignore`. Pide los valores reales al responsable del proyecto y colócalos localmente (ver §2). Nunca los subas al repo.

---

## 1. Requisitos

- **Docker Desktop** (corre API + Web + Redis; no instalas Node para el backend).
- **Node ≥ 20** solo para la app **móvil** (Expo) y comandos EAS.
- **Git**.
- Para publicar la app: cuenta **Expo** (EAS), **Apple Developer** y **Google Play Developer**.

## 2. Configurar variables de entorno

```bash
cp .env.example .env                 # backend + web  → completa con los valores reales
cp apps/mobile/.env.example apps/mobile/.env   # app móvil (valores públicos ya incluidos)
```

- `/.env` — Oracle, JWT, SMTP, pagos, Google/Apple, etc. **Requiere secretos reales** (pídelos).
- `apps/mobile/.env` — solo variables `EXPO_PUBLIC_*` (públicas por diseño); el ejemplo ya trae los valores.

## 3. Correr en desarrollo

### Backend + Web (Docker, con hot-reload)
```bash
docker compose -f docker-compose.dev.yml up --build
```
- Web: http://localhost:3000
- API: http://localhost:4000 — health `/health`, Swagger `/docs`

### App móvil (Expo)
```bash
cd apps/mobile
npm install
npm run web        # previsualiza en el navegador (puerto 8100)
# o abre en un dispositivo/emulador con la app Expo Go / un dev build
```

## 4. Producción (local, imágenes optimizadas)
```bash
docker compose up --build
```
Detrás de Caddy: `/api/*` → API, resto → Web. La app móvil **no** entra a Docker (se compila con EAS en la nube).

## 5. Publicar la app a las tiendas

Guía paso a paso (build + submit + TestFlight): **[docs/publicar-tiendas.md](docs/publicar-tiendas.md)**.

Resumen desde `apps/mobile`:
```bash
npm install -g eas-cli
eas login
eas build --platform ios --profile production
eas submit --platform ios --latest
```
- Bundle id / package: `com.fourstacklabs.connecthub`.
- Requiere acceso al proyecto Expo (`alcivator/connecthub`) y a la cuenta Apple/Google.
- Política de privacidad (obligatoria en la ficha): https://connecthub.fourstacklabs.com/privacy

## 6. Despliegue del backend/panel a producción

Servidor propio (deploy manual): `git pull` + `docker compose up -d --build` en `/root/app`. Detalle interno con el equipo (no en el repo).

## 7. Documentación

| Doc | Tema |
|---|---|
| [docs/producto-connecthub.md](docs/producto-connecthub.md) | Visión de producto |
| [docs/modelo-datos.md](docs/modelo-datos.md) | Modelo de datos Oracle y relaciones |
| [docs/apis-produccion.md](docs/apis-produccion.md) | Endpoints de producción |
| [docs/publicar-tiendas.md](docs/publicar-tiendas.md) | Publicar iOS + Android |
| [docs/inventario-localhost.md](docs/inventario-localhost.md) | Usos de `localhost` |
| [docs/checkout-paymentez.md](docs/checkout-paymentez.md) | Pagos / checkout |
| [docs/fsl-webhooks-connecthub.md](docs/fsl-webhooks-connecthub.md) | Webhooks de provisión |
| [docs/nas-espacios.md](docs/nas-espacios.md) · [docs/smtp-setup.md](docs/smtp-setup.md) | NAS de imágenes · SMTP |

## 8. Estructura

```
CONNECT-HUB/
├── apps/api/      # NestJS (panel + API pública /public/*)
├── apps/web/      # Next.js (panel admin)
├── apps/mobile/   # Expo React Native (asistentes)
├── docs/          # documentación + docs/sql (migraciones)
├── docker-compose.dev.yml   # desarrollo (hot-reload)
├── docker-compose.yml       # producción local
└── .env.example             # plantilla de variables (sin secretos)
```
