# Setup del servidor (greenfield) + deploy de CONNECT-HUB

Guía para dejar un VPS **Ubuntu/Debian** vacío sirviendo el panel
(web Next.js + API NestJS + Redis, todo en Docker).

> **Qué NO se despliega aquí:** la base de datos (Oracle 21c XE ya corre en su
> propio servidor `154.38.187.235`) y el NAS de archivos
> (`api-ligaprocorp.ec:3443`). Este server solo corre el panel y se conecta a
> ambos. Los pasos con **claves/credenciales los haces tú** (Claude no maneja
> claves privadas ni entra al server con tus credenciales).

## 0. DNS

Apunta dos registros **A** de tu dominio a la IP del server:

| Registro | Uso |
|---|---|
| `panel.tu-dominio.com` | la web (puerto 3000) |
| `api-panel.tu-dominio.com` | la API (puerto 4000) |

Espera a que propague: `dig +short panel.tu-dominio.com`.

> Si prefieres un solo dominio con rutas (`/api`), hace falta un reverse proxy
> (Caddy/nginx) — ver la sección **HTTPS** al final.

## 1. Instalar Docker (en el server, como root/sudo)

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

## 2. Firewall

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
# Solo si expones los puertos directos sin proxy (no recomendado en producción):
# sudo ufw allow 3000 && sudo ufw allow 4000
```

⚠️ El server debe poder **salir** hacia `154.38.187.235:1521` (Oracle) y
`api-ligaprocorp.ec:3443` (NAS). Verifica desde el server:
`nc -zv 154.38.187.235 1521` y `curl -sI https://api-ligaprocorp.ec:3443`.

## 3. Usuario de deploy

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo -iu deploy   # entrar como deploy para los pasos siguientes
```

## 4. Deploy key del repo (para clonar el repo privado)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github -C "server-deploy-key" -N ""
cat ~/.ssh/github.pub
# Pega esa PÚBLICA en GitHub → CONNECT-HUB → Settings → Deploy keys → Add (read-only).
printf 'Host github.com\n  IdentityFile ~/.ssh/github\n  IdentitiesOnly yes\n' >> ~/.ssh/config
chmod 700 ~/.ssh
```

## 5. Clonar el repo

```bash
git clone git@github.com:raulalcivarm10/CONNECT-HUB.git ~/app
cd ~/app
```

## 6. Configurar `.env` (secrets reales — nunca se comitea)

```bash
cp .env.example .env
nano .env
```

Completa:

| Variable | Valor |
|---|---|
| `ORACLE_USER` / `ORACLE_PASSWORD` / `ORACLE_CONNECT_STRING` | credenciales reales de la BD (`154.38.187.235:1521/XEPDB1`) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` / `COOKIE_SECRET` | genera cada uno con `openssl rand -hex 32` (¡no reutilices los de dev!) |
| `CORS_ORIGIN` | `https://panel.tu-dominio.com` (la URL pública de la web) |
| `NAS_URL` | `https://api-ligaprocorp.ec:3443/api` |
| `NEXT_PUBLIC_API_URL` | `https://api-panel.tu-dominio.com` (URL pública de la API) |
| `NEXT_PUBLIC_NAS_URL` | `https://api-ligaprocorp.ec:3443/api` |
| SMTP (`SMTP_HOST/PORT/USER/PASS/FROM`) | para que la recuperación de contraseña llegue por correo (sin SMTP, la clave temporal se muestra en pantalla — solo aceptable en dev) |

⚠️ **Importante (Next.js):** las variables `NEXT_PUBLIC_*` se hornean en el
build de la web. En `docker-compose.yml`, el servicio `web` las recibe como
`build.args` — edita ahí `NEXT_PUBLIC_API_URL` con tu dominio real antes del
primer build (o pídele a Claude que las parametrice desde `.env`).

## 7. Primer deploy (manual)

```bash
docker compose up -d --build
```

Levanta 3 contenedores: `web` (:3000), `api` (:4000) y `redis` (interno).
No hay migraciones que correr: el esquema ya vive en la Oracle remota.

Verifica:

```bash
curl -s http://localhost:4000/health   # {"status":"ok","oracle":{...},"redis":{...}}
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login   # 200
```

## 8. Actualizar a una nueva versión

```bash
cd ~/app
git pull origin main
docker compose up -d --build
```

> **Deploy automático en cada push a `main`** (GitHub Actions → SSH →
> `docker compose`): aún no está configurado en este repo. Cuando lo quieras,
> pídele a Claude que agregue `.github/workflows/deploy.yml` + la clave SSH de
> CI, siguiendo el mismo patrón de esta guía (secrets `SSH_HOST`, `SSH_USER`,
> `SSH_PRIVATE_KEY`, `DEPLOY_PATH`).

## 9. HTTPS (recomendado antes de salir a producción)

El compose actual expone HTTP directo en 3000/4000. Para producción real,
pon un reverse proxy con certificados automáticos delante (Caddy es lo más
simple):

```
panel.tu-dominio.com     → localhost:3000
api-panel.tu-dominio.com → localhost:4000
```

y cierra 3000/4000 en el firewall. Pídele a Claude el overlay
`docker-compose.prod.yml` con Caddy cuando tengas el dominio definido.
Recuerda entonces poner `secure: true` en la cookie de refresh
(`apps/api/src/auth/auth.controller.ts`).

## Operación

```bash
cd ~/app
docker compose ps                # estado de los contenedores
docker compose logs -f api      # logs de la API
docker compose logs -f web      # logs de la web
docker compose restart api      # reiniciar un servicio
```

## Backups

- **Base de datos**: vive en la Oracle remota — el respaldo se hace allá
  (RMAN/exports del DBA), no en este server.
- **Archivos/imágenes**: viven en el NAS externo — respaldo del lado del NAS.
- **Redis**: solo caché (persistencia AOF en el volumen `redis_data`); perderlo
  no pierde datos de negocio.
- Lo único crítico de este server es el **`.env`** — guarda una copia segura.
