# CONNECT-HUB — Panel Administrativo

Panel de administración para instituciones sobre la base Oracle existente (esquema `CONNECT_HUB`): gestión de locales, salones, subsalones, mapas, eventos, inscripciones, entradas QR y pagos.

## Stack

- **API:** NestJS 11 + Fastify + `node-oracledb` (modo thin — sin cliente Oracle) — `apps/api`
- **Web:** Next.js App Router + Tailwind v4 + TanStack Query — `apps/web`
- **Caché:** Redis 7
- **BD:** Oracle 21c XE remota (no se administra desde este repo)

Todo corre en Docker: no se instala Node ni dependencias en la máquina local (los `node_modules` viven en volúmenes nombrados).

## Desarrollo

```bash
cp .env.example .env   # completar credenciales
docker compose -f docker-compose.dev.yml up --build
```

- Web: http://localhost:3000
- API: http://localhost:4000 — health: `/health`, Swagger: `/docs`

El código fuente está montado con hot-reload dentro de los contenedores.

## Producción (local)

```bash
docker compose up --build
```

## Documentación

- [docs/modelo-datos.md](docs/modelo-datos.md) — modelo de datos analizado, relaciones (declaradas e implícitas) y deficiencias detectadas.
