# Inventario de credenciales y accesos (SIN valores)

Ultima actualizacion: 2026-07-19

> **REGLA ABSOLUTA DE ESTE DOCUMENTO**
> Este archivo **se sube a GitHub**. Aqui NO se escribe ni un solo valor secreto:
> nada de contrasenas, tokens, cadenas de conexion con password, claves privadas,
> client secrets ni contenido de `.env`.
> Lo que si se documenta: **el nombre** de cada credencial, **para que sirve**,
> **donde vive el valor real** y **como se restaura** si se pierde.
> Los valores reales se respaldan **fuera del repo** (gestor de contrasenas +
> copia cifrada offline).

Publico objetivo: un desarrollador nuevo, o tu mismo con la PC recien formateada.
Con este documento debe poder listar todo lo que necesita pedir/recuperar antes de
poder compilar, desplegar y publicar ConnectHub.

Documentos relacionados (leelos, no los repito entero aqui):

| Tema | Documento |
|---|---|
| Levantar el servidor desde cero | `SERVER_SETUP.md` (raiz del repo) |
| Publicar en tiendas (paso a paso) | `docs/publicar-tiendas.md`, `docs/entrega-tiendas-equipo.md` |
| SMTP / App Passwords de Google | `docs/smtp-setup.md` |
| Webhooks FSL (firma HMAC) | `docs/fsl-webhooks-connecthub.md` |
| Pagos / checkout | `docs/checkout-paymentez.md` |
| Que apunta a localhost y que no | `docs/inventario-localhost.md` |
| NAS de archivos | `docs/nas-espacios.md` |

---

## 0. Resumen: los 8 secretos que realmente duelen si se pierden

| # | Que | Se puede regenerar? | Consecuencia de perderlo |
|---|---|---|---|
| 0 | **Llaves Nuvei/Paymentez en la tabla `INSTITUCIONES`** (Oracle) | Si, por institucion | 🔴 **No estan en el `.env`, viven en la BD.** Sin ellas ninguna institucion puede cobrar. Si se **filtran**, se filtran llaves de cobro en vivo de todos los clientes. Ver §1.9. |
| 1 | `/root/app/.env` del servidor de produccion | Parcialmente | Reconstruible **solo** si tienes las credenciales de Oracle, SMTP y el secreto FSL. Los JWT si se regeneran (cierra sesiones). |
| 2 | Password de Oracle (`ORACLE_PASSWORD`) | No por ti | Solo el DBA de la base compartida lo puede resetear. **Sin esto la API no arranca.** |
| 3 | `PAGOS_JWT_SECRET` (compartido con Evento-back) | No por ti | Debe **coincidir exacto** con el `JWT_SECRET` de Evento-back. Lo entrega el equipo de pagos. |
| 4 | `FSL_WEBHOOK_SECRET` | Si, coordinado | Se rota con el equipo FSL; mientras tanto no entran altas de institucion por webhook. |
| 5 | Acceso SSH a `209.126.77.72` | Si (via panel del proveedor) | Sin el no hay deploy. Recuperable con la consola del proveedor de VPS. |
| 6 | Keystore Android (upload key) | Si, **lo custodia EAS** | Ver §5. Si tambien se pierde en EAS, Google resetea la upload key. La app no se pierde. |
| 7 | Apple ID / App Store Connect | Si (2FA) | Sin el no se sube ni se actualiza la app iOS. |

**Lo unico verdaderamente irrecuperable por cuenta propia son las credenciales de terceros (Oracle, pagos, SMTP).** Todo lo demas tiene camino de recuperacion.

> ⚠️ **Corolario que se pasa por alto:** el backup de secretos **no es solo `/root/app/.env`**.
> Las llaves de cobro viven en la tabla `INSTITUCIONES` de Oracle (§1.9). Un plan de
> recuperacion que solo respalde el `.env` deja a todas las instituciones sin cobrar.

---

## 1. Cuentas y consolas

Para cada una: que es, para que sirve, donde vive el acceso real, como se restaura.

### 1.1 GitHub — repositorio del monorepo

| Campo | Detalle |
|---|---|
| **Que es** | Repositorio `github.com/raulalcivarm10/CONNECT-HUB`, rama principal `main`. |
| **Para que sirve** | Unica fuente de verdad del codigo. El deploy en produccion es literalmente `git pull` sobre este repo. |
| **Donde vive el acceso** | Cuenta personal de GitHub del owner (`raulalcivarm10`). Autenticacion desde la PC: token PAT o clave SSH en `~/.ssh/`. En el **servidor** hay una *deploy key* (read-only) en `~/.ssh/github` del usuario de deploy. |
| **Como se restaura** | Login en github.com (2FA + codigos de respaldo) → *Settings → Developer settings → Personal access tokens* para un PAT nuevo, o `ssh-keygen -t ed25519` y subir la publica en *Settings → SSH keys*. Para el servidor: regenerar deploy key segun `SERVER_SETUP.md` §4 y pegar la publica en *Repo → Settings → Deploy keys*. |
| **Nombres de secreto involucrados** | PAT de GitHub (en el gestor de contrasenas), clave privada `~/.ssh/github` (nunca en el repo). |

> Los *Actions secrets* (`SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `DEPLOY_PATH`) estan **documentados pero NO configurados**: hoy no existe `.github/workflows/deploy.yml`. El deploy es manual.

### 1.2 Servidor de produccion (VPS) — 209.126.77.72

| Campo | Detalle |
|---|---|
| **Que es** | VPS Ubuntu/Debian que corre Docker con 4 contenedores: `caddy`, `web` (Next.js :3000), `api` (NestJS :4000), `redis`. |
| **Para que sirve** | Sirve `https://connecthub.fourstacklabs.com` (panel admin + API publica de la app movil + landing de certificados). |
| **Donde vive la app** | `/root/app` (clone del repo). El `.env` real de produccion es `/root/app/.env`. |
| **Donde vive el acceso** | Clave SSH privada del owner (`~/.ssh/`) y/o password de root en el gestor de contrasenas. Panel de control del proveedor del VPS (con su propio usuario/password). |
| **Como se restaura** | Si pierdes la clave SSH: entrar por la **consola web/VNC del proveedor** del VPS → agregar tu nueva clave publica a `/root/.ssh/authorized_keys`. Si pierdes tambien el acceso al proveedor: recuperacion de cuenta por email del proveedor. Ultimo recurso: reconstruir el servidor completo con `SERVER_SETUP.md` (todo el estado de negocio vive en Oracle y en el NAS, **no** en este server). |
| **Comandos de operacion** | `cd /root/app && git pull origin main && docker compose up -d --build`, o `./deploy.sh`, que **no** es equivalente: hace `git fetch origin main` + **`git reset --hard origin/main`** (descarta cualquier edicion hecha en el servidor sobre archivos trackeados; el `.env` no esta trackeado, asi que sobrevive). Estado: `docker compose ps`. Logs: `docker compose logs -f api`. |
| **Backup critico** | `/root/app/.env`. ⚠️ **Pero no es el unico secreto:** las llaves de pago viven en Oracle (§1.9). Las imagenes viven en el NAS. Redis es solo cache. |

**Salidas de red que el servidor necesita** (si hay firewall de egreso, abrir todas):

| Destino | Puerto | Para que |
|---|---|---|
| `<host-oracle>` | 1521 | Oracle |
| `api-ligaprocorp.ec` | 3443 | NAS de archivos + identidad (Evento-back) |
| `ccapi.paymentez.com` / `ccapi-stg.paymentez.com` | 443 | Nuvei: tokenizacion, debito, verify, delete |
| `noccapi.paymentez.com` / `noccapi-stg.paymentez.com` | 443 | Nuvei: link-to-pay (checkout hospedado) |
| `exp.host` | 443 | Envio de notificaciones push (Expo) — ver §1.11 |
| `appleid.apple.com` | 443 | JWKS de Sign in with Apple |
| `oauth2.googleapis.com` | 443 | Verificacion del `id_token` de Google |
| `smtp.gmail.com` | 587 | SMTP transaccional |
| `acme-v02.api.letsencrypt.org` | 443 | Emision/renovacion TLS de Caddy |

### 1.3 Google Play Console — QuadraTech SA

| Campo | Detalle |
|---|---|
| **Que es** | Cuenta de desarrollador de **organizacion** "QuadraTech SA", developerId `7448208356938367193`. |
| **App vigente** | appId `4975218640913412885`, package `com.fourstacklabs.connecthub`, app bundle versionCode 2 (1.0.0), 177 paises, **enviada a revision**. |
| **App anulada** | La vieja app Ionic (appId `4973167685542698921`, package `com.quadratech.connecthub`) quedo **anulada / no publicada**. No tocarla. |
| **Para que sirve** | Publicar y actualizar el APK/AAB de Android, gestionar fichas de tienda, testers y politicas. |
| **Donde vive el acceso** | Cuenta Google propietaria de la organizacion (usuario + password + 2FA) en el gestor de contrasenas. Colaboradores entran por invitacion con permiso de *Releases*. |
| **Como se restaura** | Recuperacion de cuenta de Google (2FA, codigos de respaldo, telefono/email de recuperacion). Si el propietario cambia, Play permite **transferencia de cuenta de desarrollador** (proceso formal, con soporte de Google). |
| **Secreto asociado** | **JSON de cuenta de servicio de Google Play** para `eas submit android` (ver §3 y §4). Solo lo puede generar el **propietario** de la cuenta en *Play Console → Setup → API access*; una invitacion normal NO da acceso a API access. |
| **Play App Signing** | **ACTIVADO**. Google custodia la clave de firma final; nosotros solo tenemos la **upload key** (ver §5). |
| **SHA-1 de la upload key** | `50:6A:79:AB:71:C1:B1:4D:15:27:FE:EB:8A:22:D7:66:0D:2A:73:34` (huella publica, no es secreto). ⚠️ **Para Google Sign-In en produccion importa el SHA-1 de la *App Signing key*, no el de la upload key** — se lee en *Play Console → Integridad de la app → Firma de apps*. |

### 1.4 App Store Connect / Apple Developer

| Campo | Detalle |
|---|---|
| **Que es** | Programa Apple Developer (US$99/ano) + App Store Connect. |
| **App vigente** | Bundle `com.fourstacklabs.connecthub`, SKU `connecthub-ios-001`, nombre en tienda **"ConnectHub+"**, build **1.0(13) en revision**. |
| **Para que sirve** | Publicar y actualizar la app iOS, gestionar TestFlight, capacidades (Sign in with Apple) y la ficha de tienda. |
| **Donde vive el acceso** | Apple ID del owner + password + **2FA obligatorio** (dispositivo de confianza) en el gestor de contrasenas. Guardar tambien los **codigos de recuperacion** de Apple. |
| **Como se restaura** | Recuperacion de Apple ID (iforgot.apple.com) — puede tardar dias si se pierde el dispositivo de confianza. **Manten SIEMPRE un segundo numero de telefono de confianza registrado.** |
| **Secreto asociado** | **App Store Connect API Key** = archivo **`.p8`** + **Key ID** + **Issuer ID**. Sirve para `eas submit ios` sin 2FA interactivo. Crearla requiere rol **Admin** (*App Store Connect → Users and Access → Integrations → App Store Connect API*). |
| **⚠️ Sobre el `.p8`** | Apple **solo permite descargarlo UNA vez**. Si lo pierdes: **revocar** la key y **generar una nueva** (la vieja no se puede volver a descargar). El `.p8` esta gitignoreado — nunca al repo. |
| **Sign in with Apple** | El *Service ID* / bundle aceptado como audiencia se declara en la variable `APPLE_CLIENT_IDS` (ver §2.7). La verificacion del `id_token` se hace contra el JWKS publico de Apple — **no requiere secreto** en el backend. |

### 1.5 Expo / EAS

| Campo | Detalle |
|---|---|
| **Que es** | Cuenta Expo, proyecto **`alcivator/connecthub`**, projectId `2a694ac0-ff07-434e-96ee-e508e498facb` (declarado en `apps/mobile/app.json` → `extra.eas.projectId`, y `owner: "alcivator"`). |
| **Para que sirve** | Compilar en la nube (`eas build`) para iOS y Android sin Mac, y enviar a tiendas (`eas submit`). **Custodia las credenciales de firma** (ver §5). |
| **Donde vive el acceso** | Usuario/password de la cuenta Expo en el gestor de contrasenas. En la PC, la sesion queda en `~/.expo/state.json` tras `eas login`. |
| **Como se restaura** | `npm i -g eas-cli && eas login`. Si se pierde la cuenta: recuperacion por email en expo.dev. Si hay que usar **otra** cuenta Expo: cambiar `owner` en `apps/mobile/app.json` y correr `eas init` (se genera un projectId nuevo, y hay que **re-subir las credenciales de firma**). |
| **Archivos relacionados** | `apps/mobile/eas.json` (perfiles `development`/`preview`/`production` — solo variables `EXPO_PUBLIC_*`, publicas). `apps/mobile/credentials.json` **si existe, esta gitignoreado**. |

### 1.6 Google Cloud — proyecto 338617760077 ("pagos")

| Campo | Detalle |
|---|---|
| **Que es** | Proyecto de Google Cloud numero **338617760077**, informalmente "pagos". ⚠️ **Los OAuth client IDs de ConnectHub viven AQUI, no en el proyecto "ueesApp".** Este es el error mas comun al retomar el proyecto. |
| **Para que sirve** | OAuth 2.0 para **Google Sign-In** de la app movil (3 client IDs: web, iOS, Android). |
| **Donde vive el acceso** | Cuenta Google con rol en el proyecto → https://console.cloud.google.com/apis/credentials?project=338617760077 |
| **Client IDs (PUBLICOS por diseno)** | Estan versionados a proposito en `apps/mobile/.env.example` y `apps/mobile/eas.json`: web `...-ncr1fcr5sosegoev...`, iOS `...-2kdidcrko33qet7g...`, Android `...-ma8eeeis1481u486...`. No son secretos: se compilan dentro del binario. |
| **Client secret** | El client secret del cliente **web** SI es secreto. **ConnectHub no lo usa** (flujo implicito + verificacion de `id_token`), asi que hoy no hay ningun client secret de Google en el `.env`. Si algun dia hace falta, va al gestor de contrasenas, nunca al repo. |
| **Como se restaura** | Los client IDs se vuelven a **leer** desde la consola (no se pierden). Un client secret perdido se **regenera** en la misma pantalla. Si se recrea el client Android hay que volver a registrar el **SHA-1 de la App Signing key** de Play. |
| **Gotcha conocido** | El client ID web correcto tiene 32 chars en el sufijo (`ncr1fcr5SOSEgoev...`). Si Google Sign-In falla con `invalid_client`, casi siempre es que se copio un client ID del proyecto equivocado. |

### 1.7 Proveedor SMTP (Google Workspace)

| Campo | Detalle |
|---|---|
| **Que es** | Buzon `support@fourstacklabs.com` en Google Workspace, usado como remitente transaccional. |
| **Para que sirve** | Correos de recuperacion de clave, entrega de credenciales de usuarios nuevos, y los correos disparados por los webhooks de FSL (demo y alta de institucion). |
| **Donde vive el acceso** | Consola de administracion de Google Workspace + la cuenta del buzon. El valor de `SMTP_PASS` es un **App Password de 16 caracteres** (requiere verificacion en 2 pasos activada), guardado en el gestor de contrasenas. |
| **Como se restaura** | Cuenta de Google del buzon → *Security* → *2-Step Verification* → *App passwords* → generar una nueva para "Mail". Los App Passwords **no se pueden volver a ver**, solo generar de nuevo; revocar el viejo. Cambiar la password de la cuenta **no** revoca los App Passwords existentes. |
| **Detalle importante** | La contrasena normal de la cuenta **NO funciona** para SMTP (error `535 Username and Password not accepted`). Ver `docs/smtp-setup.md`. |
| **Degradacion controlada** | Sin `SMTP_HOST` configurado, la API **no se cae**: devuelve la clave temporal en la respuesta (aceptable solo en desarrollo). |

### 1.8 NAS de archivos (servidor externo)

| Campo | Detalle |
|---|---|
| **Que es** | Servicio externo de archivos en `https://api-ligaprocorp.ec:3443/api`, operado por otro equipo. Guarda imagenes de EVENTO / INSTITUCION / LOCAL (y las 3 entidades pedidas: SALON / SUBSALON / CONFIGURACION). |
| **Para que sirve** | Subir y servir imagenes del panel. Se configura con `NAS_URL` (API) y `NEXT_PUBLIC_NAS_URL` (navegador). |
| **Donde vive el acceso** | **No hay credencial propia de ConnectHub**: hoy el NAS se consume por URL sin token dedicado. El acceso administrativo al NAS lo tiene el equipo externo. |
| **Como se restaura** | Contactar al equipo del NAS. La tabla `ARCHIVOS` del esquema `<ver ORACLE_USER en .env>` (nuestra Oracle) es la que lleva el registro; el binario vive alla. Ver `docs/nas-espacios.md`. |
| **Limitacion conocida** | El NAS solo soporta 6 entidades. Para imagenes nuevas (p. ej. foto de expositor) se usa **columna URL**, no `ImagenNas`. |

### 1.9 Pasarela de pagos — Nuvei / Paymentez (cobro PROPIO)

> ⚠️ **Corregido 2026-07-19.** Versiones anteriores de este documento decian que el
> cobro lo hacia un servicio externo y que las llaves Nuvei "no eran nuestras".
> **Eso ya no es cierto** (cambio con el checkout por pasarela propia). ConnectHub
> **cobra directamente contra Paymentez/Nuvei** y **custodia las llaves**.

| Campo | Detalle |
|---|---|
| **Que es** | ConnectHub llama **directo** a Paymentez/Nuvei desde la API: `ccapi(-stg).paymentez.com` (tokenizacion, debito, verify, list, delete) y `noccapi(-stg).paymentez.com` (`/linktopay/init_order/`, checkout hospedado). Cliente HTTP: `apps/api/src/modules/public/pagos/nuvei.client.ts`. |
| **Para que sirve** | Tokenizar tarjetas, cobrar, generar el link de checkout, confirmar el pago e inscribir al usuario al evento. |
| **Modelo de credenciales Nuvei** | Tres juegos por institucion: (1) **TOKENIZATION** (`…-CLIENT`) para `card/add`, (2) **USUARIO/CONTRASENA_PASARELA** (`…-SERVER`) para debito/verify/list/delete, (3) **CHECKOUT** para el link-to-pay. Cada uno es un par app-code / app-key. |
| **🔴 DONDE VIVEN (critico)** | **En NUESTRA base Oracle**, tabla **`INSTITUCIONES`**, columnas `USUARIO_PASARELA`, `CONTRASENA_PASARELA`, `APP_CODE_CHECKOUT`, `APP_KEY_CHECKOUT`, `APP_CODE_TOKENIZATION`, `APP_KEY_TOKENIZATION`, mas `PROVEEDOR_PAGO` y `PAYMENT_ENVIROMENT` (`stg`/`prod`). **Son por institucion, no globales, y NO estan en el `.env`.** Se leen en `apps/api/src/modules/public/pagos/pagos.service.ts` → `credenciales()`. |
| **Quien las edita** | El panel admin, en el perfil de institucion (`apps/web/src/components/instituciones/perfil-form.tsx`). La API **nunca devuelve los valores**: expone solo banderas `TIENE_APP_KEY_TOKENIZATION`, `TIENE_CONTRASENA_PASARELA`, etc. (write-only). Buen diseno — **no lo rompas**. |
| **Implicacion de backup** | El §1.2 dice que el unico backup critico es `/root/app/.env`. **Para pagos eso no alcanza**: estas llaves viven en Oracle. Si se restaura la BD desde un export viejo, las instituciones pueden quedar con credenciales de pago desactualizadas. |
| **Implicacion de fuga** | Un volcado de la tabla `INSTITUCIONES` **filtra llaves de cobro en vivo de todos los clientes**. Tratar cualquier acceso no autorizado a Oracle como un incidente de pagos, no solo de datos. |
| **Como se restaura** | Las regenera el **back-office de Nuvei/Paymentez de cada institucion** y se vuelven a cargar por el panel. No hay copia en el repo ni en el `.env`. |
| **Que sigue siendo externo** | Solo la **identidad**: `PAGOS_API_URL` (Evento-back) se usa **unicamente** para login usuario/clave, Google y Apple en `asistente-auth.service.ts:156`. **No interviene en el cobro.** |
| **Nota fiscal** | El calculo usa `vat` + `tax_percentage`. Hay tarjeta de prueba en el entorno **stg**; ver `docs/checkout-paymentez.md`. |

### 1.10 Oracle (base de datos compartida)

| Campo | Detalle |
|---|---|
| **Que es** | Oracle 21c XE en `<ver ORACLE_CONNECT_STRING en .env>`, esquema **`<ver ORACLE_USER en .env>`**. **Preexistente y compartido con una app externa** — no es "nuestra" base exclusiva. |
| **Para que sirve** | Toda la persistencia del negocio: instituciones, eventos, usuarios, entradas, certificados, comunidad, archivos. |
| **Donde vive el acceso** | Usuario/password del esquema, en el gestor de contrasenas y en `/root/app/.env` del servidor (`ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING`). |
| **Como se restaura** | **No lo puedes resetear tu.** Pedir al **DBA/dueno del servidor Oracle** que resetee la clave del esquema. No hay camino alternativo: sin esto la API no levanta (`/health` reporta el fallo de Oracle). |
| **Migraciones** | `docs/sql/*.sql`, aplicadas manualmente. No hay migrador automatico. |
| **Backups** | Los hace el DBA del servidor Oracle (RMAN/exports). **No** se respaldan desde nuestro VPS. |
| **Driver** | `node-oracledb` en modo **thin** (no requiere Instant Client instalado). |
| **🔴 Contiene secretos de terceros** | La tabla `INSTITUCIONES` guarda las **llaves de cobro Nuvei** de cada institucion (§1.9). Esta BD no es solo datos de negocio: es tambien un almacen de credenciales. Tratala como tal (acceso minimo, nada de exports a la PC de nadie). |

### 1.11 Notificaciones push (Expo + FCM)

Faltaba en versiones anteriores de este inventario.

| Campo | Detalle |
|---|---|
| **Que es** | La API envia push a `https://exp.host/--/api/v2/push/send` (`apps/api/src/modules/push/push.service.ts`). Los tokens de dispositivo (`ExponentPushToken…`) se guardan en Oracle por asistente. |
| **Credencial del backend** | **Ninguna hoy.** Se llama al servicio de Expo **sin access token**. Si algun dia se activa "Enhanced Security for Push Notifications" en expo.dev, hara falta un **Expo Access Token** → seria una variable de entorno nueva y **secreta**. |
| **Android (FCM)** | Expo necesita la **clave de servicio FCM V1** (JSON) de un proyecto Firebase, **subida a EAS** (`eas credentials` → Android → *Push Notifications*). Sin ella **no llegan push en Android**. Es un secreto: vive en EAS + el vault cifrado, nunca en el repo. `google-services.json` (gitignoreado, §3) es la contraparte del lado de la app. |
| **iOS (APNs)** | La **APNs key (`.p8`)** la genera y custodia **EAS** contra la cuenta Apple Developer. ⚠️ **Es un `.p8` distinto del de App Store Connect API** (§1.4) — mismo formato, uso distinto, no los confundas en el vault. |
| **Como se restaura** | FCM: volver a descargar el JSON desde Firebase Console → *Configuracion del proyecto → Cuentas de servicio* y resubirlo a EAS. APNs: `eas credentials` la regenera sola (Apple permite varias keys APNs activas). |

---

## 2. Variables de entorno

Fuentes reales leidas para esta seccion: `C:/proyectos/CONNECT-HUB/.env.example`,
`C:/proyectos/CONNECT-HUB/apps/mobile/.env.example`, `docker-compose.yml`, `Caddyfile`
y los `config.get(...)` del codigo de `apps/api/src`.

**Donde vive cada `.env` real:**

| Entorno | Ruta del archivo |
|---|---|
| Produccion (API + panel) | `/root/app/.env` en el servidor `209.126.77.72` |
| Desarrollo local (API + panel) | `C:/proyectos/CONNECT-HUB/.env` (gitignoreado) |
| App movil local | `C:/proyectos/CONNECT-HUB/apps/mobile/.env` (gitignoreado, **sin secretos**) |
| App movil en builds de tienda | `apps/mobile/eas.json` → `build.<perfil>.env` (versionado, publico) |

### 2.1 Oracle

| Variable | Para que sirve | Formato de ejemplo (NO real) | Obligatoria | Secreta |
|---|---|---|---|---|
| `ORACLE_USER` | Usuario/esquema de conexion | `<ver ORACLE_USER en .env>` | Si | No |
| `ORACLE_PASSWORD` | Password del esquema | `<cadena opaca>` | Si | **SI** |
| `ORACLE_CONNECT_STRING` | Host, puerto y servicio | `host:1521/servicio` | Si | Parcial (revela host) |
| `ORACLE_POOL_MIN` | Conexiones minimas del pool | `2` | No (default 2) | No |
| `ORACLE_POOL_MAX` | Conexiones maximas del pool | `10` | No (default 10) | No |

### 2.2 JWT y sesiones — los 4 secretos, y por que estan separados

ConnectHub maneja **dos poblaciones de usuarios completamente distintas**:

- **Panel admin (web)** → usuarios administrativos de instituciones.
- **App movil** → **asistentes** a eventos.

Estan separados **a proposito**: si se filtra el secreto de la app movil (superficie
mucho mas amplia: miles de telefonos, tiendas, dispositivos rooteados), **no** se
pueden falsificar tokens de administrador del panel, y viceversa. Ademas permiten
rotar uno sin cerrar las sesiones del otro. El guard lo deja explicito en
`apps/api/src/modules/public/asistente-auth/asistente-auth.guard.ts`:
*"verifica con `JWT_ASISTENTE_SECRET` (NO con `JWT_SECRET`)"*.

| Variable | Firma que tokens | Poblacion | Obligatoria | Como se genera |
|---|---|---|---|---|
| `JWT_SECRET` | Access token del **panel admin** | Admins | Si | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Refresh token del **panel admin** | Admins | Si | `openssl rand -hex 32` |
| `JWT_ASISTENTE_SECRET` | Access token de la **app movil** | Asistentes | Si | `openssl rand -hex 32` |
| `JWT_ASISTENTE_REFRESH_SECRET` | Refresh token de la **app movil** | Asistentes | Si | `openssl rand -hex 32` |
| `COOKIE_SECRET` | Firma de cookies (Fastify) | — | Si ⚠️ ver aviso | `openssl rand -hex 32` (32+ chars) |
| `COOKIE_SECURE` | Fuerza cookie `Secure` (solo HTTPS) | — | Si en prod (`true`) | Literal `true`/`false` |

> 🔴 **Dos fallbacks silenciosos e inseguros — la API arranca igual, sin avisar:**
> - `COOKIE_SECRET` ausente → `apps/api/src/main.ts:24` usa la cadena literal
>   **`'dev-secret'`**. Es un valor publico en el repo: cualquiera podria firmar
>   cookies validas. **No hay error ni warning.**
> - `CORS_ORIGIN` ausente → `main.ts:32` cae a `origin: true`, es decir
>   **refleja cualquier origen** con `credentials: true`.
>
> Ambas son "obligatorias" por seguridad, **no porque el arranque falle**. Verifica
> explicitamente que esten puestas en `/root/app/.env` (esta en el checklist §6-F).
> `CORS_ORIGIN` acepta **varios origenes separados por coma**.

Constantes en codigo: `apps/api/src/modules/public/asistente-auth/asistente-jwt.ts`
exporta `ASISTENTE_ACCESS_SECRET_ENV` y `ASISTENTE_REFRESH_SECRET_ENV`.

**Como se "restauran":** no se restauran, se **regeneran**. Los 4 son secretos
propios sin contraparte externa. Consecuencia de rotarlos: **todas las sesiones
activas se invalidan** (los usuarios vuelven a iniciar sesion). Es una rotacion
segura y barata — hazla ante cualquier sospecha de filtracion.

> ⚠️ **`PAGOS_JWT_SECRET` es la excepcion: NO lo regeneres.** Ver §2.5.

| Variable | Para que sirve | Formato de ejemplo | Obligatoria |
|---|---|---|---|
| `ASISTENTE_DEV_TOKENS` | Habilita tokens de desarrollo para la app movil. **Solo desarrollo.** Debe estar ausente o `false` en produccion. | `true` | No |

### 2.3 API y CORS

| Variable | Para que sirve | Formato de ejemplo | Obligatoria | Secreta |
|---|---|---|---|---|
| `API_PORT` | Puerto de escucha de NestJS | `4000` | No (default 4000) | No |
| `CORS_ORIGIN` | Origen del navegador permitido. En prod = URL publica del panel | `https://panel.ejemplo.com` | Si | No |
| `APP_URL` | URL publica usada en los enlaces de los correos | `https://panel.ejemplo.com` | Si (para correos) | No |
| `API_INTERNAL_URL` | URL interna que usa el `web` para fetch server-side (landing de certificados). **Se define en `docker-compose.yml`, no en `.env`** | `http://api:4000` | Si en Docker | No |
| `NODE_ENV` | Modo de ejecucion. Lo fija el compose | `production` | Si | No |
| `PUBLIC_API_URL` | ⚠️ **No documentada antes y AUSENTE de `.env.example`.** Base publica con la que se construyen las `success_url` / `failure_url` / `pending_url` que Nuvei usa para devolver al usuario tras el checkout (`pagos.service.ts:591`). Si falta, cae a `https://connecthub.fourstacklabs.com/api` **hardcodeado** — o sea, hoy funciona en prod por coincidencia, y en cualquier otro dominio (staging) los retornos de pago apuntarian al dominio equivocado | `https://connecthub.fourstacklabs.com/api` | Recomendada (critica si cambia el dominio) | No |

### 2.4 SMTP

| Variable | Para que sirve | Formato de ejemplo | Obligatoria | Secreta |
|---|---|---|---|---|
| `SMTP_HOST` | Host del servidor de correo. **Vacio = modo dev** (la clave se devuelve en la respuesta en vez de enviarse) | `smtp.ejemplo.com` | No (recomendada en prod) | No |
| `SMTP_PORT` | Puerto. 587 = STARTTLS, 465 = SSL | `587` | No (default 587) | No |
| `SMTP_USER` | Cuenta que autentica | `support@ejemplo.com` | Si (si hay host) | No |
| `SMTP_PASS` | **App Password de 16 chars sin espacios** (no la password de la cuenta) | `<16 caracteres>` | Si (si hay host) | **SI** |
| `SMTP_FROM` | Remitente con nombre visible | `MiApp <support@ejemplo.com>` | Si (si hay host) | No |

> Tras cambiar el `.env` hay que **recrear** el contenedor (`docker compose up -d api`); un `restart` **no** relee el `env_file`.

### 2.5 Pagos / servicio externo

| Variable | Para que sirve | Formato de ejemplo | Obligatoria | Secreta |
|---|---|---|---|---|
| `PAGOS_API_URL` | Base URL de Evento-back. **Solo IDENTIDAD** (login usuario/clave, Google, Apple), a pesar del nombre: **no se usa para cobrar**. Unico consumidor: `asistente-auth.service.ts:156` | `https://api.ejemplo.ec:3443/api` | Si | No |
| `PAGOS_JWT_SECRET` | Secreto con el que Evento-back firma sus tokens (login usuario/clave, Google y Apple). **Debe COINCIDIR EXACTAMENTE con el `JWT_SECRET` de Evento-back** o el intercambio de sesion falla | `<cadena opaca>` | Si | **SI** |

**Como se restaura `PAGOS_JWT_SECRET`:** pidiendoselo al equipo de Evento-back. **No lo generes tu**: no es un secreto propio, es un valor acordado. Si lo cambias unilateralmente rompes el login de la app movil. Usado en `apps/api/src/modules/public/asistente-auth/asistente-auth.service.ts`.

> ⚠️ **Las llaves de cobro Nuvei NO son variables de entorno.** No busques
> `APP_KEY_*` en el `.env`: viven en la tabla `INSTITUCIONES` de Oracle, una fila
> por institucion, y se editan desde el panel. Ver §1.9.

### 2.6 Webhooks FSL

| Variable | Para que sirve | Formato de ejemplo | Obligatoria | Secreta |
|---|---|---|---|---|
| `FSL_WEBHOOK_SECRET` | Secreto compartido con FourStackLabs para verificar la firma HMAC-SHA256 del header `X-FSL-Signature` en `POST /api/fsl/webhooks` | `<cadena opaca>` | Si (para altas automaticas) | **SI** |

Eventos que llegan: `demo.requested` (envia correo con credenciales del entorno demo) y `subscription.created` (genera codigo de conexion, crea institucion + usuario SYSTEM y envia correo de bienvenida). El endpoint rechaza con **401** si la firma no coincide y con **400** si `|now − t| > 300s` (anti-replay).

**Como se restaura:** rotacion coordinada con el equipo FSL. El formato del header acepta **multiples `v1`**, precisamente para poder rotar sin downtime: se publica el secreto nuevo, ambos lados firman con los dos durante la ventana, y luego se retira el viejo. Detalle en `docs/fsl-webhooks-connecthub.md`.

### 2.7 OAuth — Google y Apple (backend)

| Variable | Para que sirve | Formato de ejemplo | Obligatoria | Secreta |
|---|---|---|---|---|
| `GOOGLE_CLIENT_IDS` | Lista **separada por comas** de client IDs OAuth aceptados como audiencia al verificar el `id_token` de Google (web + iOS + Android del proyecto 338617760077) | `aaa.apps.googleusercontent.com,bbb.apps.googleusercontent.com` | Si (para Google Sign-In) | No |
| `APPLE_CLIENT_IDS` | Lista de bundle ids / Service IDs aceptados como audiencia del token de Sign in with Apple | `com.ejemplo.miapp` | Si (para Apple Sign-In) | No |

Ninguna de las dos es secreta: son identificadores publicos. La validacion se hace verificando la firma del `id_token` contra el **JWKS publico** del proveedor (`jose` + JWKS en el caso de Apple), no con un client secret.

**Como se restauran:** se releen desde Google Cloud Console (proyecto 338617760077) y desde `apps/mobile/eas.json` / `apps/mobile/.env.example`, donde ya estan versionados.

### 2.8 NAS

| Variable | Para que sirve | Formato de ejemplo | Obligatoria | Secreta |
|---|---|---|---|---|
| `NAS_URL` | Base URL que usa **la API** para subir/leer archivos | `https://api.ejemplo.ec:3443/api` | Si | No |
| `NEXT_PUBLIC_NAS_URL` | Misma URL, pero expuesta al **navegador** para pintar las imagenes | `https://api.ejemplo.ec:3443/api` | Si | No |

### 2.9 Redis

| Variable | Para que sirve | Formato de ejemplo | Obligatoria | Secreta |
|---|---|---|---|---|
| `REDIS_URL` | Cadena de conexion al Redis interno del compose. **Hostname de Docker, no `localhost`.** Sin password (no esta expuesto fuera de la red de Docker) | `redis://redis:6379` | Si | No |

Redis es **solo cache** (persistencia AOF en el volumen `redis_data`). Perderlo no pierde datos de negocio.

### 2.10 Next.js (variables publicas del panel)

⚠️ Las `NEXT_PUBLIC_*` se **hornean en el build** de la web: se reciben como `build.args` en el servicio `web` de `docker-compose.yml`. Cambiar el `.env` **no** basta — hay que **reconstruir** (`docker compose up -d --build web`). Y por definicion son **visibles en el navegador**: nunca metas un secreto aqui.

| Variable | Para que sirve | Formato de ejemplo | Obligatoria | Secreta |
|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | URL publica de la API que consume el panel. En prod, detras del proxy: `https://TU_DOMINIO/api` | `https://panel.ejemplo.com/api` | Si | No |
| `NEXT_PUBLIC_NAS_URL` | Ver §2.8 | `https://api.ejemplo.ec:3443/api` | Si | No |

### 2.11 Caddy / dominio / TLS

| Variable | Para que sirve | Formato de ejemplo | Obligatoria | Secreta |
|---|---|---|---|---|
| `DOMAIN` | Dominio que sirve Caddy y para el que emite el certificado TLS | `panel.ejemplo.com` | Si en prod | No |
| `ACME_EMAIL` | Email de contacto para Let's Encrypt (avisos de expiracion) | `admin@ejemplo.com` | Si en prod | No |

Los **certificados TLS** los emite y renueva Caddy solo, y se guardan en el volumen Docker `caddy_data`. **No hay que respaldarlos**: si se pierde el volumen, Caddy los reemite en el siguiente arranque (solo requiere que el DNS apunte al servidor y que 80/443 esten abiertos). Caddy tambien aplica los headers de seguridad (HSTS, `X-Frame-Options: DENY`, etc.) — ver `Caddyfile`.

### 2.12 App movil — `apps/mobile/.env` (todas publicas)

> **Ninguna variable de la app movil es secreta.** Todo lo que empieza por `EXPO_PUBLIC_` se **compila dentro del binario** y cualquiera puede extraerlo del APK/IPA. Por eso `apps/mobile/.env.example` trae los valores reales y `eas.json` los repite en los perfiles `preview`/`production`. **Nunca pongas un secreto real en una variable `EXPO_PUBLIC_*`.**

| Variable | Para que sirve | Obligatoria |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | API de ConnectHub. 🔴 **En builds de tienda DEBE ser la URL de produccion** (`https://.../api`), nunca `localhost` — es el fallo mas grave posible (`apps/mobile/src/api/client.ts:10` cae a `http://localhost:4000` si falta) | **Si** |
| `EXPO_PUBLIC_WEB_URL` | URL del sitio web (link "Anadir a LinkedIn" del certificado) | Si |
| `EXPO_PUBLIC_PAGOS_API_URL` | Base URL del servicio externo de pagos | Si |
| `EXPO_PUBLIC_PAGOS_LOGIN_PATH` | Ruta de login del servicio de pagos (`/auth/login-user-password`) | Si |
| `EXPO_PUBLIC_PAGOS_GOOGLE_PATH` | Ruta de registro/login con Google (`/auth/register-google`) | Si |
| `EXPO_PUBLIC_PAGOS_APPLE_PATH` | Ruta de registro/login con Apple (`/auth/register-apple`) | Si |
| `EXPO_PUBLIC_PAGOS_REFRESH_PATH` | Ruta de refresh del token de pagos (`/auth/refresh`) | Si |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Client ID web de Google Sign-In (proyecto 338617760077) | Si |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Client ID iOS de Google Sign-In | Si |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Client ID Android de Google Sign-In | Si |

Las rutas del servicio de pagos son variables (y no constantes en codigo) justamente para poder ajustarlas sin recompilar la app durante la integracion.

### 2.13 Cuentas de prueba para revisores de tienda

No son secretos de infraestructura, pero **sin ellas Apple rechaza la app**. Guardalas junto al resto en el gestor de contrasenas.

| Dato | Valor |
|---|---|
| Cuentas demo | `reviewer1@connecthub.fourstacklabs.com`, `reviewer2@connecthub.fourstacklabs.com` |
| Password | *(en el gestor de contrasenas — no se escribe aqui)* |
| Codigo de institucion | `DEMO123` → "Demo Institution", `idInstitucion` 104 |
| Eventos ocultos para capturas | 161 y 201 (`NO_PUBLICAR='S'`) |
| URLs legales exigidas | `https://connecthub.fourstacklabs.com/privacy` y `/eliminar-cuenta` |

---

## 3. Archivos sensibles que NUNCA van al repo

Todos estan ya cubiertos por `.gitignore` (raiz). **Verifica el `.gitignore` antes del primer commit tras un clone nuevo.**

| Archivo / patron | Que es | Donde debe vivir el original | Como se recupera si se pierde |
|---|---|---|---|
| `.env` (raiz) | Secretos reales del backend + panel (Oracle, JWT, SMTP, FSL, pagos) | `/root/app/.env` en produccion; copia cifrada en el gestor de contrasenas o vault | Reconstruir desde `.env.example` + valores del gestor. Los JWT se regeneran; Oracle/SMTP/pagos/FSL hay que pedirlos |
| `.env.local`, `.env.*.local` | Overrides locales de desarrollo | Solo en tu PC | Recrear a mano; no son criticos |
| `apps/mobile/.env` | Config de la app movil. **Sin secretos** | Se genera con `cp .env.example .env` | Trivial: copiar el `.example` (que si esta versionado) |
| `google-services.json` | Config de Firebase/Google para **Android** | Descarga desde Firebase/Google Cloud Console del proyecto | Volver a descargar desde la consola. **No es irrecuperable** |
| `GoogleService-Info.plist` | Config de Firebase/Google para **iOS** | Idem, consola de Firebase/Google Cloud | Volver a descargar desde la consola |
| `*.keystore`, `*.jks` | **Upload key de Android**. Firma el AAB antes de subirlo a Play | **Custodiado por EAS en la nube** (ver §5) + copia offline cifrada | `eas credentials` → descargar. Si tambien se perdio en EAS: pedir a Google **reseteo de upload key** |
| `*.p8` | **App Store Connect API Key** (private key). Permite `eas submit ios` sin 2FA | Gestor de contrasenas / vault. ⚠️ **Apple solo deja descargarlo UNA vez** | **NO se puede volver a descargar**: revocar la key vieja y generar una nueva (requiere rol Admin) |
| `*.p12` | Certificado de distribucion iOS exportado (con su password) | Custodiado por EAS + copia offline | `eas credentials` o regenerar desde el portal de Apple Developer |
| `*.mobileprovision`, `*.cer` | Provisioning profiles y certificados iOS | Custodiado por EAS | Se **regeneran** solos con `eas build` / `eas credentials` |
| `apps/mobile/credentials.json` | Mapa local de rutas y passwords de keystore/p12 para builds locales | Solo en tu PC, junto a los archivos que referencia | Se recrea con `eas credentials` (opcion de descargar credenciales al proyecto local) |
| JSON de **clave de servicio FCM V1** | Permite a Expo entregar **push en Android**. ⚠️ **No es el mismo JSON** que el de Google Play (distinto proposito, distinta consola) | Subido a EAS + copia en el vault | Firebase Console → *Configuracion del proyecto → Cuentas de servicio* → generar nueva y resubir a EAS (§1.11) |
| JSON de cuenta de servicio de **Google Play** | Autentica `eas submit android` contra Play | Gestor de contrasenas / vault. Tambien se puede subir a EAS | Generar uno nuevo: Play Console → *Setup → API access* (solo el **propietario** de la cuenta puede) + dar permisos a la service account. Los viejos se revocan sin drama |
| `docker-compose.override.yml` | Override **solo local** que expone puertos/CORS para dev movil | Solo en tu PC | Recrear a mano. ⚠️ **NUNCA en produccion** — expondria puertos internos |

**Donde respaldarlos (recomendacion):**

1. **Gestor de contrasenas** (1Password/Bitwarden/similar) → todos los valores de texto (`.env` completo como nota segura, passwords, Key IDs, Issuer IDs).
2. **Archivo cifrado offline** (p. ej. un `.7z` o volumen VeraCrypt en un disco externo + una copia en la nube) → los binarios: `.p8`, `.jks`, `.p12`, JSON de service account, `google-services.json`.
3. **Nunca**: chat, email plano, Google Drive sin cifrar, ni un repo privado ("privado" no es lo mismo que "cifrado").

---

## 4. Como generar / regenerar los secretos propios

Los unicos secretos que **generas tu** (no dependen de terceros):

```bash
# Cada uno de estos, por separado — nunca reutilices el mismo valor en dos variables:
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
openssl rand -hex 32   # JWT_ASISTENTE_SECRET
openssl rand -hex 32   # JWT_ASISTENTE_REFRESH_SECRET
openssl rand -hex 32   # COOKIE_SECRET
openssl rand -hex 32   # FSL_WEBHOOK_SECRET  (coordinar el cambio con FSL)
```

Los que **NO** generas tu, hay que pedirlos:

| Secreto | A quien se le pide |
|---|---|
| `ORACLE_PASSWORD` | DBA / dueno del servidor Oracle `<host-oracle>` |
| `PAGOS_JWT_SECRET` | Equipo de Evento-back / pagos |
| `SMTP_PASS` | Se autogenera en Google Workspace (App Password), pero requiere acceso al buzon |
| JSON de service account de Play | **Propietario** de la cuenta Google Play (QuadraTech SA) |
| `.p8` de App Store Connect | Un usuario con rol **Admin** en App Store Connect |

Tras cambiar cualquier variable en produccion:

```bash
cd /root/app
nano .env
docker compose up -d api          # RECREA el contenedor (restart NO relee env_file)
docker compose up -d --build web  # solo si cambiaste alguna NEXT_PUBLIC_*
curl -s http://localhost:4000/health
```

---

## 5. Credenciales de firma de Android: las custodia EAS

Esta es la parte que mas asusta y en realidad es la mas segura del proyecto. Hay **dos claves distintas** y conviene no confundirlas:

| Clave | Quien la tiene | Que firma | Si se pierde |
|---|---|---|---|
| **Upload key** (el keystore que genero EAS en el primer build) | **EAS** (nube) + tu copia offline | Firma el AAB que **subes** a Play | **Recuperable**: Google resetea la upload key a peticion. **La app NO se pierde.** |
| **App Signing key** | **Google** (Play App Signing, ACTIVADO en esta app) | Firma el APK que **reciben los usuarios** | Nunca la pierdes tu: nunca la tuviste. Google la custodia. |

Porque esto importa: antes de Play App Signing, perder el keystore significaba **no poder actualizar nunca mas la app** y tener que publicar una nueva con otro package. Con Play App Signing activado, eso **ya no puede pasar**.

### Como recuperar / inspeccionar las credenciales que guarda EAS

```bash
npm i -g eas-cli
eas login                       # cuenta Expo (owner: alcivator)
cd C:/proyectos/CONNECT-HUB/apps/mobile

eas credentials                 # menu interactivo
#   → elegir plataforma: Android
#   → Keystore: Manage everything needed to build your project
#       - "Download existing keystore"  → descarga el .jks + te muestra
#         keystore password, key alias y key password
#       - "Set up a new keystore"       → SOLO si vas a rotar (requiere
#                                         registrar la nueva upload key en Play)
#   → elegir plataforma: iOS
#       - Distribution certificate y Provisioning profile: EAS los regenera
#         solo si hace falta; tambien puedes descargarlos
```

Tambien se ven desde la web: **expo.dev → proyecto `alcivator/connecthub` → Credentials**.

**Al descargar el `.jks`, guarda las 3 cosas juntas** (keystore, keystore password, key alias + key password) en el vault cifrado. El archivo solo no sirve.

### Si la upload key se pierde en todas partes (EAS incluida)

1. Genera un keystore nuevo (`eas credentials` → *Set up a new keystore*).
2. Extrae su SHA-1: `keytool -list -v -keystore nuevo.jks -alias <alias>`.
3. Play Console → *Integridad de la app → Firma de apps* → **solicitar reseteo de la upload key**, adjuntando el certificado nuevo (`.pem`).
4. Google la reemplaza en ~48h. La app y sus usuarios **no se ven afectados**.
5. Registra el nuevo SHA-1 en el client OAuth Android de Google Cloud **solo si** ese client usaba el SHA-1 de la upload key (recuerda: en produccion el que importa es el de la **App Signing key**, que no cambia).

### iOS

En iOS las credenciales (Distribution Certificate y Provisioning Profile) tambien las custodia EAS y son **totalmente desechables**: si se pierden, `eas build` las regenera contra tu cuenta Apple Developer sin ninguna consecuencia. El unico artefacto iOS que **no** se puede volver a descargar es el **`.p8`** de App Store Connect API (se revoca y se crea otro).

---

## 6. CHECKLIST — "formatee la PC, que recupero primero"

Orden pensado para desbloquear lo mas rapido posible. Los primeros 6 puntos te devuelven un entorno de desarrollo funcional.

### Bloque A — Acceso (sin esto no haces nada)

- [ ] **Gestor de contrasenas**: instalar y desbloquear. **Todo lo demas depende de esto.** Si tambien perdiste el acceso al gestor, empieza por su recuperacion (codigo de emergencia impreso / clave de recuperacion).
- [ ] **Cuenta Google principal** (la de Play Console, Google Cloud y Workspace): verificar 2FA y tener a mano los codigos de respaldo.
- [ ] **Apple ID** con 2FA: confirmar que tienes un dispositivo o telefono de confianza operativo.
- [ ] **GitHub**: nuevo PAT o nueva clave SSH (`ssh-keygen -t ed25519`) y registrarla en *Settings → SSH keys*.

### Bloque B — Codigo y entorno local

- [ ] Instalar: **Node 20.19+ o 22.x**, **Git**, **Docker Desktop**, y `npm i -g eas-cli`.
- [ ] `git clone https://github.com/raulalcivarm10/CONNECT-HUB.git` → `cd CONNECT-HUB` → `npm install`.
- [ ] **Reconstruir `C:/proyectos/CONNECT-HUB/.env`**: `cp .env.example .env` y rellenar con los valores del gestor. Si no los tienes, la ruta corta es **copiar el `/root/app/.env` del servidor** (que sigue vivo) por SSH — es la copia de respaldo de facto.
- [ ] `cd apps/mobile && cp .env.example .env` → **listo, no tiene secretos**.
- [ ] Verificar: `docker compose -f docker-compose.dev.yml up -d` y `curl http://localhost:4000/health` (debe reportar `oracle` y `redis` OK). Si Oracle falla → password incorrecto, pide reseteo al DBA.
- [ ] `npx expo-doctor` en `apps/mobile` (debe pasar 20/20).

### Bloque C — Acceso al servidor de produccion

- [ ] **Clave SSH para `209.126.77.72`**: si perdiste la privada, entra por la **consola web del proveedor del VPS** y agrega tu clave publica nueva a `/root/.ssh/authorized_keys`.
- [ ] Verificar el deploy: `ssh root@209.126.77.72` → `cd /root/app && docker compose ps`.
- [ ] **Hacer una copia de `/root/app/.env`** al gestor de contrasenas AHORA (es el respaldo mas importante y probablemente por eso estas leyendo esto).

### Bloque D — Publicacion en tiendas (solo cuando toque un release)

- [ ] `eas login` con la cuenta Expo (owner `alcivator`). Verificar que ves el proyecto `alcivator/connecthub`.
- [ ] `eas credentials` → **descargar el keystore de Android** y guardarlo (con su password y alias) en el vault cifrado.
- [ ] **App Store Connect**: si el `.p8` se perdio → revocar la key vieja y generar una nueva (rol Admin), guardar `.p8` + **Key ID** + **Issuer ID**.
- [ ] **Google Play**: si el JSON de service account se perdio → el propietario genera uno nuevo en *Setup → API access*.
- [ ] Confirmar el estado de las apps: iOS build 1.0(13) y Android versionCode 2, ambas **en revision** al 2026-07-19.

### Bloque E — Terceros (pedir por canal seguro, no por chat)

- [ ] **Oracle**: password del esquema `<ver ORACLE_USER en .env>` → DBA del servidor `<host-oracle>`.
- [ ] **Identidad**: `PAGOS_JWT_SECRET` y URL vigente → equipo de Evento-back (login/Google/Apple; **no** es el cobro).
- [ ] **Pagos (Nuvei)**: **no se piden a nadie ni van al `.env`** — ya estan en la tabla `INSTITUCIONES` de Oracle, por institucion. Verificar con el panel (perfil de institucion) que cada institucion activa muestre `TIENE_*` en verde. Si falta alguna, la regenera esa institucion en su back-office de Nuvei y se recarga por el panel. Ver §1.9.
- [ ] **SMTP**: generar un App Password nuevo de 16 chars en la cuenta de Google Workspace del buzon `support@`.
- [ ] **FSL**: `FSL_WEBHOOK_SECRET` → coordinar rotacion con el equipo de FourStackLabs (soporta multiples `v1` para rotar sin downtime).
- [ ] **NAS**: no requiere credencial propia; contactar al equipo externo solo si cambia la URL.

### Bloque F — Higiene post-recuperacion

- [ ] Si hubo cualquier sospecha de filtracion, **rotar los 5 secretos propios** (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ASISTENTE_SECRET`, `JWT_ASISTENTE_REFRESH_SECRET`, `COOKIE_SECRET`) — cuesta una relogueada de todos los usuarios y nada mas.
- [ ] Confirmar que `ASISTENTE_DEV_TOKENS` **no** esta en `true` en produccion.
- [ ] Confirmar que `COOKIE_SECURE=true` y `NODE_ENV=production` en el servidor.
- [ ] Confirmar que `COOKIE_SECRET` y `CORS_ORIGIN` **existen y no estan vacios** en `/root/app/.env` — si faltan, la API arranca igual con `'dev-secret'` y CORS abierto, sin avisar (§2.2).
- [ ] Confirmar que `PUBLIC_API_URL` apunta al dominio real si se cambio el dominio (§2.3).
- [ ] Confirmar que `docker-compose.override.yml` **no** existe en `/root/app`.
- [ ] `git status` en el clone nuevo: que no aparezca ningun `.env`, `.jks`, `.p8`, `.p12` ni `google-services.json` como archivo sin trackear listo para commitear por accidente.
