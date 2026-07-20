# RUNBOOK — Recuperacion desde cero

Ultima actualizacion: 2026-07-19

**Escenario que cubre este documento:** se formateo la PC (o es una maquina nueva, o un
desarrollador nuevo) y hay que volver a trabajar en ConnectHub: compilar, desplegar y
publicar. Cero herramientas instaladas.

> **Regla de seguridad:** este runbook **no contiene ni un solo valor secreto**. Solo
> indica **de donde se restaura cada cosa**. Los valores reales estan en
> `C:/proyectos/CONNECTHUB-RESPALDO` (fuera del repo), en `/root/app/.env` del servidor y
> en el gestor de contrasenas.

> **Antes de empezar, verifica que tienes acceso a al menos una de estas tres fuentes.**
> Si no tienes ninguna, salta directo al [Paso 5](#paso-5--recuperar-el-acceso-a-cada-consola):
> primero hay que recuperar cuentas.
>
> 1. La carpeta `C:/proyectos/CONNECTHUB-RESPALDO` (en un USB, en el disco, en el vault).
> 2. Acceso SSH al servidor `209.126.77.72` (ahi vive `/root/app/.env`, que es la copia de
>    respaldo de facto).
> 3. El gestor de contrasenas.

**Tiempo estimado:** 2-3 horas hasta tener el entorno local corriendo; medio dia si hay
que recuperar cuentas con 2FA.

---

## Indice

- [Paso 0 — Inventario previo](#paso-0--inventario-previo)
- [Paso 1 — Instalar el software](#paso-1--instalar-el-software)
- [Paso 2 — Clonar el repositorio](#paso-2--clonar-el-repositorio)
- [Paso 3 — Restaurar los archivos secretos desde el respaldo](#paso-3--restaurar-los-archivos-secretos-desde-el-respaldo)
- [Paso 4 — Levantar y verificar el entorno local](#paso-4--levantar-y-verificar-el-entorno-local)
- [Paso 5 — Recuperar el acceso a cada consola](#paso-5--recuperar-el-acceso-a-cada-consola)
- [Paso 6 — Recuperar las credenciales de firma de Android desde EAS](#paso-6--recuperar-las-credenciales-de-firma-de-android-desde-eas)
- [Paso 7 — Conectarse al servidor de produccion y desplegar](#paso-7--conectarse-al-servidor-de-produccion-y-desplegar)
- [Paso 8 — Checklist final de verificacion](#paso-8--checklist-final-de-verificacion)
- [Apendice A — Si el respaldo tambien se perdio](#apendice-a--si-el-respaldo-tambien-se-perdio)
- [Apendice B — Problemas frecuentes](#apendice-b--problemas-frecuentes)

---

## Paso 0 — Inventario previo

**0.1** Localiza la carpeta de respaldo. Deberia estar en `C:/proyectos/CONNECTHUB-RESPALDO`
o en el USB cifrado / vault donde la copiaste.

```powershell
Get-ChildItem -Recurse C:\proyectos\CONNECTHUB-RESPALDO
```

Estructura esperada:

```
CONNECTHUB-RESPALDO/
├─ LEEME-PRIMERO.md      <- leelo antes que nada
├─ env/
│  ├─ raiz.env           -> va a CONNECT-HUB/.env
│  ├─ mobile.env         -> va a CONNECT-HUB/apps/mobile/.env
│  └─ eas.json           -> va a CONNECT-HUB/apps/mobile/eas.json
├─ firma-nativa/         (vacia a proposito: la firma la custodia EAS)
└─ tiendas/
```

**0.2** Desbloquea el **gestor de contrasenas**. Todo lo demas depende de el: sin las
contrasenas de las consolas no puedes recuperar Play, App Store, EAS ni el servidor. Si
tambien perdiste el acceso al gestor, empieza por su propia recuperacion (codigo de
emergencia impreso / clave de recuperacion).

**0.3** Ten a mano el **segundo factor**: telefono de confianza de Apple, codigos de
respaldo de Google, dispositivo con la app de autenticacion.

**0.4** Lee [`00-INDICE.md`](00-INDICE.md) §5 para saber en que estado quedo el proyecto
(al 2026-07-19: ambas tiendas en revision, app vieja de Android retirada).

---

## Paso 1 — Instalar el software

Todos los comandos asumen **Windows** con PowerShell. Las rutas se escriben con `/` o `\`
indistintamente salvo donde se indique.

### 1.1 Gestor de paquetes (opcional pero recomendado)

`winget` viene preinstalado en Windows 10/11 actualizados. Verifica:

```powershell
winget --version
```

### 1.2 Git

```powershell
winget install --id Git.Git -e --source winget
```

Cierra y reabre la terminal, y configura tu identidad:

```powershell
git --version
git config --global user.name  "Tu Nombre"
git config --global user.email "tu@correo.com"
git config --global core.autocrlf true
```

> `core.autocrlf true` en Windows evita que todo el repo aparezca modificado por finales
> de linea.

### 1.3 Node.js 22 LTS

El `package.json` raiz declara `engines: { node: ">=20" }`. La app movil se ha estado
corriendo con **Node 22**.

```powershell
winget install --id OpenJS.NodeJS.LTS -e --source winget
```

Verifica (nueva terminal):

```powershell
node -v      # debe ser v22.x (o >= v20.19)
npm -v
```

> **Alternativa portable.** En el equipo original se usaba un Node portable en
> `~/nodejs/node-v22.23.1-win-x64`. Si prefieres esa via, descomprime la distribucion
> portable y anade su carpeta al `PATH` de la sesion. No es necesario si instalas el LTS
> del sistema.

### 1.4 Docker Desktop

Es lo que corre **API + panel web + Redis**. No hace falta instalar Oracle Instant Client:
el driver `node-oracledb` va en modo *thin*.

```powershell
winget install --id Docker.DockerDesktop -e --source winget
```

Despues de instalar:

1. Reinicia Windows si el instalador lo pide.
2. Abre Docker Desktop → *Settings → General* → activa **"Use the WSL 2 based engine"**.
3. *Settings → Resources → WSL Integration* → activa la distribucion que uses.
4. Espera a que el icono de la ballena diga "Docker Desktop is running".

Verifica:

```powershell
docker --version
docker compose version
docker run --rm hello-world
```

### 1.5 Editor

```powershell
winget install --id Microsoft.VisualStudioCode -e --source winget
```

Extensiones utiles: ESLint, Prettier, Tailwind CSS IntelliSense, Docker.

### 1.6 EAS CLI (builds de la app movil)

⚠️ El paquete se llama **`eas-cli`**, no `eas`. Y `npx eas …` a secas **falla** con
*"could not determine executable to run"* — usa `npx eas-cli …` o instala global.

```powershell
npm install -g eas-cli
eas --version        # debe ser >= 12.0.0 (lo exige eas.json: cli.version ">= 12.0.0")
```

### 1.7 Cliente SSH (para el servidor de produccion)

Windows 10/11 trae OpenSSH cliente. Verifica:

```powershell
ssh -V
```

Si no esta:

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
```

Si vas a generar una clave nueva (ver [Paso 5](#paso-5--recuperar-el-acceso-a-cada-consola)):

```powershell
ssh-keygen -t ed25519 -C "connecthub-$env:COMPUTERNAME"
```

### 1.8 Herramientas opcionales pero utiles

| Herramienta | Para que | Comando |
|---|---|---|
| `keytool` | Leer el SHA-1 de un keystore Android | Viene con cualquier JDK: `winget install --id EclipseAdoptium.Temurin.21.JDK -e` |
| `openssl` | Generar secretos (`openssl rand -hex 32`) | Ya viene con Git for Windows (usar la terminal **Git Bash**) |
| `curl` | Verificaciones HTTP | Preinstalado en Windows 10+ |
| 7-Zip | Cifrar el respaldo (`7z a -p -mhe=on`) | `winget install --id 7zip.7zip -e` |

---

## Paso 2 — Clonar el repositorio

**2.1** Autenticate contra GitHub. Dos opciones:

*Opcion A — clave SSH (recomendada):*

```powershell
ssh-keygen -t ed25519 -C "github-$env:COMPUTERNAME"
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | Set-Clipboard
```

Pega la clave publica en **GitHub → Settings → SSH and GPG keys → New SSH key**. Prueba:

```powershell
ssh -T git@github.com
```

*Opcion B — Personal Access Token:* **GitHub → Settings → Developer settings → Personal
access tokens** → generar uno con scope `repo`. Git lo pedira como contrasena en el primer
`push` y Windows Credential Manager lo recordara.

**2.2** Clona en la ruta canonica del proyecto:

```powershell
git clone https://github.com/raulalcivarm10/CONNECT-HUB.git C:\proyectos\CONNECT-HUB
# o por SSH:
# git clone git@github.com:raulalcivarm10/CONNECT-HUB.git C:\proyectos\CONNECT-HUB

cd C:\proyectos\CONNECT-HUB
git branch --show-current     # debe decir: main
git log --oneline -5
```

**2.3** Verifica que el `.gitignore` esta en su sitio **antes** de restaurar secretos. Es
lo que impide que un `.env` acabe en GitHub:

```powershell
Select-String -Path .gitignore -Pattern "^\.env$|keystore|\.p8|\.p12|google-services|override"
```

Debe listar, como minimo: `.env`, `*.keystore`, `*.jks`, `*.p8`, `*.p12`,
`google-services.json`, `GoogleService-Info.plist`, `docker-compose.override.yml`.

**2.4** Instala dependencias de la app movil (la API y el panel se instalan solos dentro
de Docker, no hace falta `npm install` en ellos):

```powershell
cd C:\proyectos\CONNECT-HUB\apps\mobile
npm install
```

---

## Paso 3 — Restaurar los archivos secretos desde el respaldo

Estos archivos **no estan en Git a proposito**. Vienen de
`C:/proyectos/CONNECTHUB-RESPALDO`.

### 3.1 Que es cada archivo y donde va

| Archivo en el respaldo | Que contiene | Destino | Secreto |
|---|---|---|---|
| `env/raiz.env` | Variables del backend y del panel: Oracle, los 4 secretos JWT + `COOKIE_SECRET`, SMTP, NAS, `PAGOS_*`, `FSL_WEBHOOK_SECRET`, OAuth, `DOMAIN`, `NEXT_PUBLIC_*` | `C:/proyectos/CONNECT-HUB/.env` | 🔴 **SI** |
| `env/mobile.env` | Variables `EXPO_PUBLIC_*` de la app movil (URLs y client IDs de Google) | `C:/proyectos/CONNECT-HUB/apps/mobile/.env` | ⚪ No (publicas por diseno) |
| `env/eas.json` | Perfiles de build EAS (`development` / `preview` / `production`) con sus `EXPO_PUBLIC_*` | `C:/proyectos/CONNECT-HUB/apps/mobile/eas.json` | ⚪ No (esta versionado en el repo) |
| `firma-nativa/` | **Vacia a proposito.** Las claves de firma las custodia EAS en la nube (ver [Paso 6](#paso-6--recuperar-las-credenciales-de-firma-de-android-desde-eas)) | — | — |

> **Por que `eas.json` esta en el respaldo si tambien esta en el repo:** porque es la
> unica fuente de las `EXPO_PUBLIC_*` que se hornean en los **builds de tienda**. El
> `apps/mobile/.env` solo aplica a `expo start` en local. Si el repo y el respaldo
> difieren, gana el respaldo si es mas reciente — comparalos antes de sobrescribir.

### 3.2 Restaurar (PowerShell)

```powershell
$R = "C:\proyectos\CONNECTHUB-RESPALDO"
$P = "C:\proyectos\CONNECT-HUB"

Copy-Item "$R\env\raiz.env"   "$P\.env"                  -Force
Copy-Item "$R\env\mobile.env" "$P\apps\mobile\.env"      -Force
Copy-Item "$R\env\eas.json"   "$P\apps\mobile\eas.json"  -Force
```

Equivalente en Git Bash:

```bash
R=/c/proyectos/CONNECTHUB-RESPALDO
P=/c/proyectos/CONNECT-HUB
cp "$R/env/raiz.env"   "$P/.env"
cp "$R/env/mobile.env" "$P/apps/mobile/.env"
cp "$R/env/eas.json"   "$P/apps/mobile/eas.json"
```

### 3.3 Verificar que los secretos NO quedaron trackeados

```powershell
cd C:\proyectos\CONNECT-HUB
git status --short
```

**No debe aparecer `.env` ni `apps/mobile/.env` como archivos nuevos.** Si aparecen, el
`.gitignore` no se aplico: detente y arreglalo antes de hacer ningun commit.

Confirmacion adicional:

```powershell
git check-ignore -v .env apps/mobile/.env
```

Debe responder con la regla del `.gitignore` que los ignora.

### 3.4 Comprobar que el `.env` tiene lo minimo

Sin abrir valores, verifica que las claves esperadas **existen y no estan vacias**:

```powershell
Select-String -Path .env -Pattern "^(ORACLE_USER|ORACLE_PASSWORD|ORACLE_CONNECT_STRING|JWT_SECRET|JWT_REFRESH_SECRET|JWT_ASISTENTE_SECRET|JWT_ASISTENTE_REFRESH_SECRET|COOKIE_SECRET|CORS_ORIGIN|PAGOS_API_URL|PAGOS_JWT_SECRET|NAS_URL|FSL_WEBHOOK_SECRET|DOMAIN)=." | Select-Object -ExpandProperty Line | ForEach-Object { ($_ -split "=")[0] }
```

Deberian salir las 14. Presta especial atencion a dos que fallan **en silencio**:

- **`COOKIE_SECRET` ausente** → la API arranca igual usando la cadena literal `'dev-secret'`
  (valor publico en el repo). Sin error ni warning.
- **`CORS_ORIGIN` ausente** → la API cae a `origin: true`, es decir **refleja cualquier
  origen** con `credentials: true`.

### 3.5 Si el `.env` local no aparece o esta incompleto

La copia de respaldo de facto es el **`.env` de produccion del servidor**:

```bash
scp root@209.126.77.72:/root/app/.env C:/proyectos/CONNECTHUB-RESPALDO/env/produccion.env
```

⚠️ **No lo copies tal cual a tu `.env` local sin revisarlo.** Diferencias que debes ajustar
para desarrollo:

| Variable | En produccion | En tu `.env` local |
|---|---|---|
| `CORS_ORIGIN` | el dominio publico | `http://localhost:3000` (y los puertos de Expo si trabajas con la movil) |
| `APP_URL` | `https://connecthub.fourstacklabs.com` | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | `https://connecthub.fourstacklabs.com/api` | `http://localhost:4000` |
| `COOKIE_SECURE` | `true` | `false` (en local no hay HTTPS) |
| `JWT_*` y `COOKIE_SECRET` | los de produccion | **genera los tuyos**, no reutilices los de prod |

Para generar los tuyos (Git Bash), uno por uno, **sin repetir valores**:

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
openssl rand -hex 32   # JWT_ASISTENTE_SECRET
openssl rand -hex 32   # JWT_ASISTENTE_REFRESH_SECRET
openssl rand -hex 32   # COOKIE_SECRET
```

**Lo que NO puedes generar tu** (hay que pedirlo — ver [Apendice A](#apendice-a--si-el-respaldo-tambien-se-perdio)):
`ORACLE_PASSWORD`, `PAGOS_JWT_SECRET`, `SMTP_PASS`, `FSL_WEBHOOK_SECRET`.

### 3.6 Aviso: las llaves de cobro NO estan en ningun `.env`

Las credenciales de Nuvei/Paymentez (`APP_CODE_*`, `APP_KEY_*`, `USUARIO_PASARELA`,
`CONTRASENA_PASARELA`) viven **en la tabla `INSTITUCIONES` de Oracle**, una fila por
institucion, y se editan desde el panel administrativo. No las busques en el `.env` ni las
restaures desde aqui. Ver `07-credenciales-y-accesos.md` §1.9.

---

## Paso 4 — Levantar y verificar el entorno local

### 4.1 Arrancar backend + panel con hot-reload

```powershell
cd C:\proyectos\CONNECT-HUB
docker compose -f docker-compose.dev.yml up --build
```

La primera vez tarda varios minutos (descarga `node:22-alpine` e instala dependencias de
ambas apps). Las siguientes son rapidas por la cache de capas.

En background, con logs aparte:

```powershell
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml logs -f api
```

### 4.2 URLs del entorno local

| Servicio | URL |
|---|---|
| Panel web | http://localhost:3000 |
| API | http://localhost:4000 |
| Health de la API | http://localhost:4000/health |
| Swagger | http://localhost:4000/docs |

### 4.3 Verificar que la API esta sana

```bash
curl -s http://localhost:4000/health
```

Respuesta esperada:

```json
{
  "status": "ok",
  "oracle": { "ok": true, "latencyMs": 12 },
  "redis":  { "ok": true, "latencyMs": 1 },
  "nas":    { "ok": true, "latencyMs": 210 },
  "smtp":   { "configured": true },
  "timestamp": "..."
}
```

Interpretacion:

| Sintoma | Causa mas probable | Que hacer |
|---|---|---|
| `oracle.ok = false` con timeout | Tu IP no esta autorizada para llegar a `<host-oracle>:1521`, o el password cambio | Pedir autorizacion de IP / reseteo de clave al DBA |
| `oracle.ok = false` con error de credenciales | `ORACLE_PASSWORD` incorrecto | Ver [Apendice A](#apendice-a--si-el-respaldo-tambien-se-perdio) |
| `redis.ok = false` | El contenedor `redis` no levanto | `docker compose -f docker-compose.dev.yml ps` |
| `nas.ok = false` | NAS externo caido (no bloquea) | La API sigue operativa, solo sin imagenes |
| `smtp.configured = false` | No hay `SMTP_HOST` | Aceptable en dev: la clave temporal se muestra en pantalla |

> `status` es `'ok'` solo si **Oracle y Redis** responden. El NAS caido no baja el status.

### 4.4 Verificar el panel web

Abre http://localhost:3000. Debe redirigir a `/login`. Inicia sesion con una cuenta real
del panel.

Tambien puedes usar la pagina de estado local: http://localhost:3000/estado — refresca
cada 10 s y pinta API / Oracle / Redis.

> **Gotcha:** las paginas `/verify` y `/reset` usan rutas **relativas** `/api/public/auth/*`
> y en `localhost:3000` **no funcionan**, porque no hay Caddy delante. Para probarlas hay
> que levantar el stack completo (`docker compose up --build`).

### 4.5 Levantar la app movil

La movil **no entra en Docker**: corre en el host con Node.

```powershell
cd C:\proyectos\CONNECT-HUB\apps\mobile
npm run web       # = expo start --web --port 8100
```

Abre http://localhost:8100.

> 🔴 **El puerto 8100 no es negociable.** Es el unico `localhost` autorizado como redirect
> URI en el client OAuth web de Google (herencia de cuando la app corria con `ionic serve`).
> En cualquier otro puerto, **Google Sign-In falla** con error de `redirect_uri`.

Otras formas de correrla:

```powershell
npm start          # Metro en 8100 (Expo Go / dev client)
npm run android    # emulador o dispositivo Android
npm run ios        # simulador iOS (requiere macOS)
```

Salud de la configuracion de Expo:

```powershell
npx expo-doctor    # deberia pasar 20/20
```

> Si vas a desarrollar contra el backend local, en `apps/mobile/.env` debe estar
> `EXPO_PUBLIC_API_URL=http://localhost:4000`. **El `.env.example` apunta a produccion.**

### 4.6 Orden recomendado de arranque diario

```powershell
# Terminal 1 — backend + panel
cd C:\proyectos\CONNECT-HUB
docker compose -f docker-compose.dev.yml up

# Terminal 2 — movil (solo si trabajas en ella)
cd C:\proyectos\CONNECT-HUB\apps\mobile
npm run web
```

### 4.7 Cuando SI hay que reconstruir en dev

Al cambiar `package.json` (nueva dependencia), porque `node_modules` vive en un volumen:

```powershell
docker compose -f docker-compose.dev.yml down
docker volume rm connect-hub-dev_api_node_modules    # o web_node_modules
docker compose -f docker-compose.dev.yml up --build
```

---

## Paso 5 — Recuperar el acceso a cada consola

Orden pensado para desbloquear lo antes posible. Los primeros dos son los que impiden
trabajar; el resto solo hace falta para publicar.

### 5.1 GitHub

| | |
|---|---|
| **Donde** | https://github.com — repo `raulalcivarm10/CONNECT-HUB`, rama `main` |
| **Como se recupera** | Login con 2FA + codigos de respaldo. Luego: *Settings → SSH and GPG keys* para una clave nueva (`ssh-keygen -t ed25519`), o *Settings → Developer settings → Personal access tokens* para un PAT con scope `repo`. |
| **En el servidor** | Hay una *deploy key* read-only en `~/.ssh/github` del usuario de deploy. Si se pierde: regenerarla segun `SERVER_SETUP.md` §4 y pegar la publica en *Repo → Settings → Deploy keys*. |

### 5.2 Servidor de produccion (209.126.77.72)

| | |
|---|---|
| **Donde** | `ssh root@209.126.77.72`, la app vive en `/root/app` |
| **Si tienes la clave privada** | Colocala en `~/.ssh/`, con permisos restringidos, y conecta. |
| **Si perdiste la clave privada** | Entra por la **consola web / VNC del proveedor del VPS** y anade tu clave publica nueva a `/root/.ssh/authorized_keys`. |
| **Si perdiste tambien el acceso al proveedor** | Recuperacion de cuenta por email del proveedor del VPS. |
| **Ultimo recurso** | Reconstruir el servidor completo con `SERVER_SETUP.md`. **Es viable**: todo el estado de negocio vive en Oracle y en el NAS, no en este servidor. Lo unico que se pierde es la cache de Redis y los certificados TLS (que Caddy reemite solo). |

Generar y subir una clave nueva:

```powershell
ssh-keygen -t ed25519 -C "connecthub-$env:COMPUTERNAME"
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | Set-Clipboard
# pegar el contenido en /root/.ssh/authorized_keys via consola del proveedor
```

Prueba:

```bash
ssh root@209.126.77.72 'hostname && docker compose -f /root/app/docker-compose.yml ps'
```

> 📌 **Haz esto en cuanto entres:** respalda el `.env` de produccion, que probablemente es
> la razon por la que estas leyendo este documento.
> ```bash
> scp root@209.126.77.72:/root/app/.env C:/proyectos/CONNECTHUB-RESPALDO/env/produccion.env
> ```

### 5.3 Expo / EAS

| | |
|---|---|
| **Donde** | https://expo.dev — proyecto **`alcivator/connecthub`**, projectId `2a694ac0-ff07-434e-96ee-e508e498facb` |
| **Como se entra** | `eas login` (usuario/password de la cuenta Expo, **no** la de Apple). La sesion queda en `~/.expo/state.json`. |
| **Como se recupera** | Recuperacion por email en expo.dev. |
| **Si hay que usar OTRA cuenta Expo** | Cambiar `owner` en `apps/mobile/app.json` y correr `eas init` → se genera un **projectId nuevo** y hay que **volver a subir las credenciales de firma**. Evitalo si puedes. |

```powershell
eas login
eas whoami      # debe responder: alcivator
```

### 5.4 Google Play Console

| | |
|---|---|
| **Donde** | https://play.google.com/console |
| **Cuenta** | Organizacion **QuadraTech SA**, developerId `7448208356938367193` |
| **App vigente** | appId `4975218640913412885`, package `com.fourstacklabs.connecthub` |
| **App anulada** | appId `4973167685542698921`, package `com.quadratech.connecthub` — **no tocar** |
| **Como se recupera** | Recuperacion de la cuenta Google propietaria (2FA, codigos de respaldo, telefono/email de recuperacion). Si cambia el propietario, Play admite **transferencia de cuenta de desarrollador** (proceso formal con soporte de Google). |
| **Ojo** | El **JSON de cuenta de servicio** para `eas submit android` solo lo puede generar el **propietario** en *Setup → API access*. Una invitacion normal de colaborador **no** da acceso a esa pantalla. |

### 5.5 App Store Connect / Apple Developer

| | |
|---|---|
| **Donde** | https://appstoreconnect.apple.com |
| **App** | bundle `com.fourstacklabs.connecthub`, SKU `connecthub-ios-001`, nombre en tienda **"ConnectHub+"** |
| **Como se entra** | Apple ID + password + **2FA obligatorio** (dispositivo de confianza) |
| **Como se recupera** | https://iforgot.apple.com — **puede tardar dias** si se perdio el dispositivo de confianza. Manten **siempre** un segundo numero de telefono de confianza registrado. |
| **Roles** | *App Manager* o *Developer* para subir builds; **Admin** para generar una App Store Connect API Key. |
| **⚠️ El `.p8`** | La App Store Connect API Key (`.p8` + **Key ID** + **Issuer ID**) **solo se puede descargar UNA vez**. Si se perdio: *Users and Access → Integrations → App Store Connect API* → **revocar** la vieja y **generar una nueva**. |

### 5.6 Google Cloud (OAuth de Google Sign-In)

| | |
|---|---|
| **Donde** | https://console.cloud.google.com/apis/credentials?project=338617760077 |
| **Proyecto** | **338617760077**, informalmente "pagos" |
| **🔴 Error recurrente** | Los client IDs de ConnectHub **NO estan en el proyecto "ueesApp"**. Estan en el 338617760077. Es el fallo mas comun al retomar el proyecto. |
| **Que hay ahi** | 3 client IDs OAuth (web, iOS, Android). **No son secretos**: estan versionados a proposito en `apps/mobile/.env.example` y `apps/mobile/eas.json`, y se compilan dentro del binario. |
| **Como se recupera** | Los client IDs se vuelven a **leer** en la consola (no se pierden). Un client secret perdido se **regenera** en la misma pantalla — aunque hoy ConnectHub **no usa ningun client secret de Google**. |
| **Gotcha** | El client ID web correcto tiene 32 chars en el sufijo (`ncr1fcr5SOSEgoev…`). Si Google Sign-In falla con `invalid_client`, casi siempre se copio uno del proyecto equivocado. |

### 5.7 Google Workspace (SMTP)

| | |
|---|---|
| **Donde** | https://admin.google.com — buzon `support@fourstacklabs.com` |
| **Que se necesita** | `SMTP_PASS` = **App Password de 16 caracteres** (requiere verificacion en 2 pasos activada). **La contrasena normal de la cuenta NO funciona** (`535 Username and Password not accepted`). |
| **Como se recupera** | Cuenta de Google del buzon → *Security → 2-Step Verification → App passwords* → generar una nueva para "Mail", y revocar la vieja. Los App Passwords **no se pueden volver a ver**, solo generar de nuevo. |

### 5.8 Oracle (base de datos)

| | |
|---|---|
| **Donde** | `<ver ORACLE_CONNECT_STRING en .env>`, esquema `<ver ORACLE_USER en .env>` |
| **Como se recupera** | **No lo puedes hacer tu.** Pedir al **DBA / dueno del servidor Oracle** que resetee la clave del esquema. Sin esto la API no levanta. |
| **Recordatorio** | El esquema es **compartido con una app externa**. Y contiene **las llaves de cobro Nuvei** de cada institucion: tratalo como almacen de credenciales, no solo como base de datos. |

### 5.9 Nuvei / Paymentez y FSL

| Que | Como se recupera |
|---|---|
| **Llaves Nuvei** | No se piden a nadie ni van al `.env`: ya estan en la tabla `INSTITUCIONES` de Oracle, por institucion. Verificar en el panel (perfil de institucion) que cada una muestre sus banderas `TIENE_*` en verde. Si falta alguna, la regenera esa institucion en su back-office de Nuvei y se recarga por el panel. |
| **`PAGOS_JWT_SECRET`** | Se pide al equipo de **Evento-back**. **No lo generes tu**: debe coincidir exactamente con su `JWT_SECRET` o el login de la app movil se rompe. |
| **`FSL_WEBHOOK_SECRET`** | Rotacion coordinada con el equipo de **FourStackLabs**. El header acepta multiples `v1`, precisamente para rotar sin downtime. |

---

## Paso 6 — Recuperar las credenciales de firma de Android desde EAS

**Esta es la parte que mas asusta y en realidad es la mas segura del proyecto.** No hay
keystore en la PC, y esta bien: no debe haberlo.

### 6.1 Las dos claves, y por que no se pierde la app

| Clave | Quien la tiene | Que firma | Si se pierde |
|---|---|---|---|
| **Upload key** (keystore generado por EAS en el primer build) | **EAS** (nube) + tu copia offline | El `.aab` que **subes** a Play | **Recuperable.** Google resetea la upload key a peticion. La app **NO se pierde**. |
| **App Signing key** | **Google** (Play App Signing, **ACTIVADO**) | El APK que **reciben los usuarios** | Nunca la pierdes tu: nunca la tuviste. |

Antes de Play App Signing, perder el keystore significaba no poder actualizar la app nunca
mas. Con Play App Signing activado **eso ya no puede pasar**.

### 6.2 Descargar el keystore que custodia EAS

```powershell
npm install -g eas-cli
eas login                 # cuenta Expo, owner: alcivator
eas whoami                # confirma
cd C:\proyectos\CONNECT-HUB\apps\mobile

eas credentials
#   -> plataforma: Android
#   -> Keystore: "Manage everything needed to build your project"
#        - "Download existing keystore"  -> descarga el .jks Y te muestra
#          keystore password, key alias y key password
#        - "Set up a new keystore"       -> SOLO si vas a rotar (obliga a
#                                          registrar la nueva upload key en Play)
```

Atajo directo:

```powershell
eas credentials -p android
```

Tambien se ven desde la web: **expo.dev → proyecto `alcivator/connecthub` → Credentials**.

> 🔴 **Al descargar el `.jks`, guarda las TRES cosas juntas** en el vault cifrado:
> el archivo `.jks`, la **keystore password**, y el **key alias + key password**.
> El archivo solo no sirve para nada.
>
> Y **no lo dejes dentro de `C:/proyectos/CONNECT-HUB`.** Aunque `*.jks` esta en el
> `.gitignore`, la practica correcta es que viva en `CONNECTHUB-RESPALDO/firma-nativa/`
> o directamente en el vault.

### 6.3 Verificar el SHA-1

```powershell
keytool -list -v -keystore <archivo>.jks -alias <alias>
```

SHA-1 conocido de la **upload key**:
`50:6A:79:AB:71:C1:B1:4D:15:27:FE:EB:8A:22:D7:66:0D:2A:73:34` (es una huella publica, no
es un secreto).

> ⚠️ **Para Google Sign-In en produccion importa el SHA-1 de la *App Signing key*, no el
> de la upload key.** Se lee en **Play Console → Integridad de la app → Firma de apps**.
> Este es exactamente el pendiente 🔴 abierto del proyecto (ver `06-tiendas-ios-android.md` §12).

### 6.4 Si la upload key se perdio en todas partes (EAS incluida)

1. Genera un keystore nuevo: `eas credentials -p android` → *Set up a new keystore*.
2. Extrae su SHA-1: `keytool -list -v -keystore nuevo.jks -alias <alias>`.
3. Play Console → *Integridad de la app → Firma de apps* → **solicitar reseteo de la
   upload key**, adjuntando el certificado nuevo (`.pem`).
4. Google la reemplaza en ~48 h. La app y sus usuarios **no se ven afectados**.
5. Registra el nuevo SHA-1 en el client OAuth Android **solo si** ese client usaba el de
   la upload key (recuerda: en produccion el que importa es el de la App Signing key, que
   no cambia).

### 6.5 iOS

Las credenciales iOS (Distribution Certificate y Provisioning Profile) tambien las
custodia EAS y son **totalmente desechables**: si se pierden, `eas build` las regenera
contra la cuenta Apple Developer sin consecuencia alguna.

```powershell
eas credentials -p ios
```

El **unico** artefacto iOS irrecuperable es el **`.p8` de App Store Connect API**: no se
puede volver a descargar, hay que revocarlo y crear otro (rol Admin).

> ⚠️ Hay **dos `.p8` distintos** en este proyecto y se confunden facil: el de **App Store
> Connect API** (para `eas submit`) y el de **APNs** (para push en iOS, que gestiona EAS).
> Mismo formato, uso distinto. No los mezcles en el vault.

---

## Paso 7 — Conectarse al servidor de produccion y desplegar

### 7.1 Datos del entorno

| Dato | Valor |
|---|---|
| Servidor | `209.126.77.72` |
| Ruta de la app | `/root/app` |
| Usuario | `root` |
| Rama desplegada | `main` |
| Dominio | https://connecthub.fourstacklabs.com |
| Tipo de deploy | **Manual.** No hay CI/CD ni GitHub Actions |

### 7.2 Conectar y mirar antes de tocar

```bash
ssh root@209.126.77.72
cd /root/app

git branch --show-current       # debe decir: main
git rev-parse --short HEAD      # ANOTA ESTE HASH: es tu punto de retorno
docker compose ps               # 4 servicios Up, api debe decir (healthy)
```

### 7.3 Chequeo de seguridad obligatorio antes de desplegar

```bash
test -f /root/app/docker-compose.override.yml \
  && echo "PELIGRO: override presente en produccion" \
  || echo "OK: sin override"
```

**Si aparece, borralo antes de continuar.** Ese archivo expone la API en el puerto 4000 sin
TLS, reemplaza el CORS de produccion por `localhost` y activa `ASISTENTE_DEV_TOKENS`, que
**devuelve tokens de reset de contrasena en la respuesta HTTP** (toma de cuentas trivial).
Docker Compose lo mergea **automaticamente y sin avisar**, sin ningun flag.

### 7.4 Pre-vuelo desde tu maquina

```bash
cd /c/proyectos/CONNECT-HUB
git status
git log --oneline -5
git push origin main
git ls-remote origin main       # confirma que el remoto tiene tu commit
```

### 7.5 Desplegar

*Opcion A — el script (recomendada):*

```bash
ssh root@209.126.77.72 'cd /root/app && ./deploy.sh'
```

`deploy.sh` hace, en orden: `git fetch origin main` → **`git reset --hard origin/main`** →
imprime el commit → `docker compose up -d --build` → `docker compose ps`.

> ⚠️ `git reset --hard` **descarta cualquier edicion hecha a mano en el servidor** sobre
> archivos versionados. Es intencional: el servidor debe ser un espejo de `main`. El `.env`
> sobrevive porque no esta trackeado.

*Opcion B — paso a paso:*

```bash
ssh root@209.126.77.72
cd /root/app
git pull origin main
git log --oneline -3
docker compose up -d --build     # --build es OBLIGATORIO
docker compose ps
```

> **Por que `--build` nunca es opcional:** Next.js **hornea las variables `NEXT_PUBLIC_*`
> dentro del bundle en tiempo de compilacion**. Sin `--build`, `web` sigue sirviendo el
> bundle viejo con los valores antiguos, y `api` sigue con el `dist/` anterior.

### 7.6 Verificacion post-deploy (obligatoria)

```bash
# a) Contenedores: los 4 Up, api (healthy). Espera ~15-20 s (start_period: 15s)
ssh root@209.126.77.72 'cd /root/app && docker compose ps'

# b) Health interno (el puerto 4000 NO esta publicado: hay que preguntarle al contenedor)
ssh root@209.126.77.72 'cd /root/app && docker compose exec -T api node -e "fetch(\"http://localhost:4000/health\").then(r=>r.json()).then(j=>console.log(JSON.stringify(j,null,2)))"'

# c) Health publico, atravesando Caddy
curl -s https://connecthub.fourstacklabs.com/api/health

# d) Panel y paginas legales
curl -s -o /dev/null -w "%{http_code}\n" https://connecthub.fourstacklabs.com/login
curl -s -o /dev/null -w "%{http_code}\n" https://connecthub.fourstacklabs.com/privacy
curl -s -o /dev/null -w "%{http_code}\n" https://connecthub.fourstacklabs.com/eliminar-cuenta
curl -s -o /dev/null -w "%{http_code}\n" https://connecthub.fourstacklabs.com/estado

# e) TLS valido
echo | openssl s_client -connect connecthub.fourstacklabs.com:443 -servername connecthub.fourstacklabs.com 2>/dev/null | openssl x509 -noout -dates

# f) Headers de seguridad
curl -sI https://connecthub.fourstacklabs.com | grep -iE 'strict-transport|x-frame|x-content-type|referrer-policy'

# g) La API directa sigue CERRADA (control anti-override)
curl -s -m 5 http://209.126.77.72:4000/health && echo "PELIGRO: API expuesta" || echo "OK: 4000 cerrado"

# h) Logs sin errores
ssh root@209.126.77.72 'cd /root/app && docker compose logs --tail=50 api'
```

Ademas, **abre `/estado` en el navegador**: es la comprobacion de punta a punta de que
`NEXT_PUBLIC_API_URL` quedo bien horneado. Si `/api/health` responde `ok` por curl pero
`/estado` muestra las dependencias caidas, el problema es la variable horneada, no la
infraestructura.

### 7.7 Rollback si algo sale mal

```bash
ssh root@209.126.77.72
cd /root/app
git log --oneline -10
git checkout <hash_del_commit_bueno>     # el que anotaste en 7.2
docker compose up -d --build
```

Queda en *detached HEAD* — correcto y funcional, pero **temporal**: el siguiente
`./deploy.sh` vuelve a `origin/main`. La correccion real se hace en `main`:

```bash
# en tu maquina
git revert <hash_del_commit_malo>
git push origin main
# en el servidor
ssh root@209.126.77.72 'cd /root/app && ./deploy.sh'
```

### 7.8 Tras cambiar una variable del `.env` en produccion

```bash
cd /root/app
nano .env
docker compose up -d api          # RECREA el contenedor (restart NO relee env_file)
docker compose up -d --build web  # solo si cambiaste alguna NEXT_PUBLIC_*
```

> ⚠️ **Nunca** uses `docker compose down -v` en produccion: borraria el volumen
> `caddy_data` con los certificados TLS, y Let's Encrypt tiene rate limit de 5
> certificados por dominio por semana.

---

## Paso 8 — Checklist final de verificacion

### Bloque A — Herramientas

- [ ] `git --version` responde, y `user.name` / `user.email` configurados
- [ ] `node -v` >= v20.19 (idealmente v22.x)
- [ ] `docker compose version` responde y Docker Desktop esta corriendo con backend WSL2
- [ ] `eas --version` >= 12.0.0
- [ ] `ssh -V` responde
- [ ] Editor instalado

### Bloque B — Repositorio y secretos

- [ ] `C:/proyectos/CONNECT-HUB` clonado, en rama `main`, `git log` muestra historia
- [ ] `.env` restaurado en la raiz del repo
- [ ] `apps/mobile/.env` restaurado
- [ ] `apps/mobile/eas.json` restaurado (o el del repo verificado como vigente)
- [ ] `apps/mobile` con `npm install` ejecutado
- [ ] 🔴 **`git status` NO muestra ningun `.env`, `.jks`, `.p8`, `.p12` ni `google-services.json`**
- [ ] `COOKIE_SECRET` y `CORS_ORIGIN` existen y **no estan vacios** en el `.env` (fallan en silencio)
- [ ] `ASISTENTE_DEV_TOKENS` **no** esta en `true` en ningun `.env` que vaya a produccion

### Bloque C — Entorno local funcionando

- [ ] `docker compose -f docker-compose.dev.yml up -d --build` levanta sin errores
- [ ] `curl http://localhost:4000/health` → `"status":"ok"` con `oracle` y `redis` en `true`
- [ ] http://localhost:3000 redirige a `/login` y se puede iniciar sesion
- [ ] http://localhost:3000/estado pinta las tres filas en verde
- [ ] `cd apps/mobile && npm run web` arranca en **el puerto 8100** y carga
- [ ] `npx expo-doctor` pasa 20/20

### Bloque D — Accesos recuperados

- [ ] GitHub: `ssh -T git@github.com` o PAT funcionando; puedes hacer `push`
- [ ] Servidor: `ssh root@209.126.77.72` conecta
- [ ] **`/root/app/.env` respaldado a `CONNECTHUB-RESPALDO/env/produccion.env`**
- [ ] Expo: `eas whoami` → `alcivator`, y se ve el proyecto `alcivator/connecthub`
- [ ] Play Console: acceso a la app `4975218640913412885` (QuadraTech SA)
- [ ] App Store Connect: acceso a `connecthub-ios-001`
- [ ] Google Cloud: acceso al proyecto **338617760077** (no "ueesApp")
- [ ] Google Workspace: acceso al buzon `support@fourstacklabs.com`

### Bloque E — Firma y publicacion (solo cuando toque un release)

- [ ] `eas credentials -p android` lista el keystore
- [ ] `.jks` descargado + **keystore password + key alias + key password** guardados juntos en el vault
- [ ] `.jks` guardado **fuera** del repo (`CONNECTHUB-RESPALDO/firma-nativa/` o vault)
- [ ] `.p8` de App Store Connect disponible (o revocado y regenerado) con su **Key ID** e **Issuer ID**
- [ ] JSON de service account de Google Play disponible (o regenerado por el propietario)
- [ ] SHA-1 de la **App Signing key** leido en Play Console → Integridad de la app

### Bloque F — Produccion sana

- [ ] `docker compose ps` en el servidor: 4 servicios `Up`, `api` `(healthy)`
- [ ] `curl https://connecthub.fourstacklabs.com/api/health` → `"status":"ok"`
- [ ] `/login`, `/privacy`, `/eliminar-cuenta`, `/estado` → 200
- [ ] TLS valido y sin vencer
- [ ] Headers de seguridad presentes (HSTS, X-Frame-Options, etc.)
- [ ] `http://209.126.77.72:4000` **no responde**
- [ ] `docker-compose.override.yml` **no existe** en `/root/app`
- [ ] `COOKIE_SECURE=true` y `NODE_ENV=production` en el servidor

### Bloque G — Higiene post-recuperacion

- [ ] Si hubo **cualquier sospecha de filtracion**, rotar los 5 secretos propios
      (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ASISTENTE_SECRET`,
      `JWT_ASISTENTE_REFRESH_SECRET`, `COOKIE_SECRET`). Cuesta que todos los usuarios
      vuelvan a iniciar sesion, y nada mas. **No rotes `PAGOS_JWT_SECRET`**: es acordado
      con Evento-back.
- [ ] Respaldo actualizado en `CONNECTHUB-RESPALDO` y copiado a USB cifrado / vault
- [ ] Completar los pendientes de `CONNECTHUB-RESPALDO/LEEME-PRIMERO.md` §4:
      `.env` de produccion, clave SSH, `.p8`, contrasenas de consolas, codigos 2FA
- [ ] Revisar el estado de las tiendas: al 2026-07-19, iOS build 1.0(13) y Android
      versionCode 2 **ambas en revision** (ver `00-INDICE.md` §5)

---

## Apendice A — Si el respaldo tambien se perdio

Se puede reconstruir casi todo. Este es el orden y a quien hay que pedir cada cosa.

### A.1 La ruta corta

Si conservas acceso SSH al servidor, **el `.env` de produccion es el respaldo de facto**:

```bash
scp root@209.126.77.72:/root/app/.env C:/proyectos/CONNECTHUB-RESPALDO/env/produccion.env
```

Con eso tienes Oracle, SMTP, `PAGOS_JWT_SECRET` y `FSL_WEBHOOK_SECRET`, que son
precisamente los que **no puedes generar tu**. Ajusta las variables de entorno local segun
la tabla de [3.5](#35-si-el-env-local-no-aparece-o-esta-incompleto).

### A.2 Lo que generas tu mismo

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
openssl rand -hex 32   # JWT_ASISTENTE_SECRET
openssl rand -hex 32   # JWT_ASISTENTE_REFRESH_SECRET
openssl rand -hex 32   # COOKIE_SECRET
openssl rand -hex 32   # FSL_WEBHOOK_SECRET  (coordinar el cambio con FSL)
```

Nunca reutilices el mismo valor en dos variables.

### A.3 Lo que hay que pedir (por canal seguro, nunca por chat)

| Secreto | A quien |
|---|---|
| `ORACLE_PASSWORD` | DBA / dueno del servidor Oracle `<host-oracle>` |
| `PAGOS_JWT_SECRET` | Equipo de **Evento-back** / pagos. **No lo generes tu** |
| `SMTP_PASS` | Se autogenera en Google Workspace (App Password de 16 chars), pero requiere acceso al buzon `support@` |
| `FSL_WEBHOOK_SECRET` | Rotacion coordinada con **FourStackLabs** |
| JSON de service account de Play | **Propietario** de la cuenta Google Play (QuadraTech SA) |
| `.p8` de App Store Connect | Un usuario con rol **Admin** en App Store Connect |

### A.4 Lo que se vuelve a leer o descargar (no se pierde)

| Elemento | De donde |
|---|---|
| Client IDs de Google OAuth | Google Cloud Console, proyecto **338617760077**. Ademas estan versionados en `apps/mobile/.env.example` y `apps/mobile/eas.json` |
| `google-services.json` / `GoogleService-Info.plist` | Firebase / Google Cloud Console |
| Keystore de Android + su password y alias | **EAS** (`eas credentials -p android`) |
| Certificados y perfiles de iOS | **EAS** (`eas credentials -p ios`), o se regeneran solos |
| Clave de servicio FCM V1 (push Android) | Firebase Console → *Configuracion del proyecto → Cuentas de servicio* → generar nueva y resubir a EAS |
| Certificados TLS | No hay que respaldarlos: Caddy los reemite solo |
| `apps/mobile/.env` | `cp .env.example .env` — no tiene secretos |

### A.5 Lo unico verdaderamente irrecuperable por cuenta propia

Las credenciales de **terceros**: Oracle, `PAGOS_JWT_SECRET` y SMTP. Todo lo demas tiene
camino de recuperacion.

Y un caso especial: el **`.p8` de App Store Connect** no se puede volver a descargar, pero
si se puede **revocar y crear uno nuevo**, asi que tampoco bloquea.

---

## Apendice B — Problemas frecuentes

| Sintoma | Causa | Solucion |
|---|---|---|
| `npx eas …` → *"could not determine executable to run"* | El paquete se llama `eas-cli`, no `eas` | `npm i -g eas-cli` o `npx eas-cli …` |
| Google Sign-In falla en web con error de `redirect_uri` | Metro arranco en un puerto distinto de **8100** | `npm run web` (ya trae `--port 8100` fijo) |
| Google Sign-In falla con `invalid_client` | Se copio un client ID del proyecto Google equivocado | Usar el del proyecto **338617760077**; el web correcto tiene 32 chars de sufijo (`ncr1fcr5SOSEgoev…`) |
| `/health` reporta `oracle.ok=false` con timeout | La IP no esta autorizada en la Oracle remota | Pedir autorizacion de IP al DBA |
| `/verify` y `/reset` no funcionan en `localhost:3000` | Usan rutas relativas `/api/*` y en dev no hay Caddy delante | Levantar el stack completo con `docker compose up --build` |
| Cambie `NEXT_PUBLIC_API_URL` y no pasa nada | Next **hornea** las `NEXT_PUBLIC_*` en el build | `docker compose up -d --build web` |
| Cambie una variable del `.env` y la API sigue igual | `restart` **no** relee `env_file` | `docker compose up -d api` (recrea el contenedor) |
| El hot-reload no funciona en dev | Falta el polling de filesystem (Windows/WSL2) | Ya esta configurado en `docker-compose.dev.yml` (`CHOKIDAR_USEPOLLING`, `WATCHPACK_POLLING`); verifica que usas ese compose |
| Instale una dependencia nueva y el contenedor no la ve | `node_modules` vive en un volumen | `down` + `docker volume rm connect-hub-dev_api_node_modules` + `up --build` |
| Los certificados salen sin texto | Faltan las fuentes en la imagen Docker | El `Dockerfile` de la API instala `fontconfig ttf-dejavu ttf-liberation` en **ambos** stages. No quitar esa linea |
| El NAS rechaza una entidad nueva | El NAS solo soporta **6 entidades** | Para imagenes nuevas usar **columna URL** en la tabla, no `ImagenNas`. Ver `docs/nas-espacios.md` |
| `docker compose ps` muestra la API expuesta en 4000 en produccion | Hay un `docker-compose.override.yml` en `/root/app` | **Borrarlo inmediatamente** y redesplegar. Ver [7.3](#73-chequeo-de-seguridad-obligatorio-antes-de-desplegar) |
| Las rutas `/mapas/*` devuelven 404 | `MapasController` no esta registrado en `OperativaModule` | Es el estado actual conocido. Anadirlo al modulo si se necesitan |

---

## Referencias

| Tema | Documento |
|---|---|
| Indice del manual y estado del proyecto | [`00-INDICE.md`](00-INDICE.md) |
| Backend, endpoints y autenticacion | [`01-backend-api.md`](01-backend-api.md) |
| Panel web y paginas legales | [`02-panel-web.md`](02-panel-web.md) |
| App movil y builds de EAS | [`03-app-movil.md`](03-app-movil.md) |
| Infraestructura, deploy y troubleshooting | [`04-infraestructura-y-deploy.md`](04-infraestructura-y-deploy.md) |
| Modelo de datos y migraciones | [`05-modelo-de-datos.md`](05-modelo-de-datos.md) |
| Publicacion en tiendas | [`06-tiendas-ios-android.md`](06-tiendas-ios-android.md) |
| Inventario de credenciales (sin valores) | [`07-credenciales-y-accesos.md`](07-credenciales-y-accesos.md) |
| Montar el servidor desde cero | `SERVER_SETUP.md` (raiz del repo) |
| Contenido y estado del respaldo | `C:/proyectos/CONNECTHUB-RESPALDO/LEEME-PRIMERO.md` |
