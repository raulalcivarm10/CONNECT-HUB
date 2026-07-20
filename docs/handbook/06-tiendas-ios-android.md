# Publicación en tiendas (iOS y Android)

Ultima actualizacion: 2026-07-19

Este documento es la referencia unica para todo lo relativo a la publicacion de la app movil **ConnectHub** en la **App Store** y en **Google Play**. Cubre identificadores, estado de revision, fichas de tienda, declaraciones de cumplimiento, firma de aplicaciones, el procedimiento repetible para sacar una version nueva y los pendientes conocidos.

Complementa (y no contradice) a:
- [`docs/publicar-tiendas.md`](../publicar-tiendas.md) — guia original de compilacion con EAS.
- [`docs/entrega-tiendas-equipo.md`](../entrega-tiendas-equipo.md) — guia de entrega al equipo, accesos y problemas comunes.
- [`docs/eventos-no-publicar.md`](../eventos-no-publicar.md) — el flag `NO_PUBLICAR` usado para ocultar eventos durante la revision.

> **REGLA DE SEGURIDAD:** este archivo se sube a GitHub. Aqui **solo** se documentan **nombres** de variables, rutas y procedimientos. Ningun valor de secreto (contrasenas, tokens, claves privadas, `.env`, client secrets, JSON de service account) debe escribirse en este archivo ni en ningun otro documento del repo. Los valores reales viven fuera del repo, en el gestor de secretos del responsable.

---

## Indice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Identificadores y cuentas](#2-identificadores-y-cuentas)
3. [Estado actual de la revision](#3-estado-actual-de-la-revision)
4. [Configuracion del proyecto movil](#4-configuracion-del-proyecto-movil)
5. [iOS — App Store Connect](#5-ios--app-store-connect)
6. [Android — Google Play](#6-android--google-play)
7. [Declaraciones de cumplimiento](#7-declaraciones-de-cumplimiento)
8. [Assets de tienda](#8-assets-de-tienda)
9. [Firma de aplicaciones](#9-firma-de-aplicaciones)
10. [Datos y cuentas demo para revisores](#10-datos-y-cuentas-demo-para-revisores)
11. [Procedimiento repetible: publicar una version nueva](#11-procedimiento-repetible-publicar-una-version-nueva)
12. [Pendientes conocidos](#12-pendientes-conocidos)
13. [Problemas comunes](#13-problemas-comunes)
14. [Vacios de documentacion](#14-vacios-de-documentacion)

---

## 1. Resumen ejecutivo

**ConnectHub** es la app movil de asistentes a eventos del monorepo `CONNECT-HUB`. Esta construida con **Expo SDK 57 / React Native 0.86**, vive en `apps/mobile/`, se compila en la nube con **EAS Build** (no hace falta Mac) y consume la API de produccion en `https://connecthub.fourstacklabs.com/api`.

Al 2026-07-19, **ambas tiendas tienen una version enviada y en revision**:

| Tienda | Identificador de la app | Version enviada | Estado |
|---|---|---|---|
| App Store (iOS) | `com.fourstacklabs.connecthub` | 1.0 build (13) | **En revision de Apple** |
| Google Play (Android) | `com.fourstacklabs.connecthub` | 1.0.0 versionCode 2 | **Enviada a revision** |

El backend, el panel web y las paginas legales ya estan en produccion y **no requieren despliegue** para publicar la app. Ver [SERVER_SETUP.md](../../SERVER_SETUP.md) y [`deploy.sh`](../../deploy.sh) si necesitas tocar el servidor.

---

## 2. Identificadores y cuentas

### 2.1 Tabla maestra de identificadores

| Concepto | Valor | Donde vive / se comprueba |
|---|---|---|
| Nombre interno del proyecto Expo | `connecthub` (slug) | `apps/mobile/app.json` → `expo.slug` |
| Nombre mostrado en el dispositivo | `ConnectHub` | `apps/mobile/app.json` → `expo.name` |
| Nombre en la App Store | **ConnectHub+** | App Store Connect → App Information |
| Bundle identifier (iOS) | `com.fourstacklabs.connecthub` | `apps/mobile/app.json` → `expo.ios.bundleIdentifier` |
| Package name (Android) | `com.fourstacklabs.connecthub` | `apps/mobile/app.json` → `expo.android.package` |
| Version de marketing | `1.0.0` | `apps/mobile/app.json` → `expo.version` |
| SKU de App Store Connect | `connecthub-ios-001` | App Store Connect → App Information |
| appId de Google Play | `4975218640913412885` | URL de Play Console |
| developerId de Google Play | `7448208356938367193` | URL de Play Console |
| Titular de la cuenta Google Play | **QuadraTech SA** (cuenta de **organizacion**) | Play Console → Configuracion de la cuenta |
| Proyecto EAS | `alcivator/connecthub` | `apps/mobile/app.json` → `expo.owner` |
| projectId EAS | `2a694ac0-ff07-434e-96ee-e508e498facb` | `apps/mobile/app.json` → `expo.extra.eas.projectId` |
| Proyecto Google Cloud (OAuth) | `338617760077` — proyecto **"pagos"** | console.cloud.google.com |
| Repositorio | `github.com/raulalcivarm10/CONNECT-HUB`, rama `main` | — |
| Politica de privacidad | https://connecthub.fourstacklabs.com/privacy | `apps/web/src/app/privacy/page.tsx` |
| Eliminacion de cuenta (web) | https://connecthub.fourstacklabs.com/eliminar-cuenta | `apps/web/src/app/eliminar-cuenta/page.tsx` |

> ⚠️ **El proyecto Google Cloud correcto es el `338617760077` ("pagos"), NO "ueesApp".** Todos los client IDs de OAuth (web, iOS, Android) viven ahi. Es un error recurrente buscar en el proyecto equivocado.

### 2.2 Cuentas y accesos

| Cuenta | Titular / rol | Como se entra | Notas |
|---|---|---|---|
| **Apple Developer / App Store Connect** | Cuenta del responsable del proyecto | appstoreconnect.apple.com con Apple ID + 2FA | Se necesita rol **App Manager** o **Developer** para subir builds; rol **Admin** para generar una App Store Connect API Key. |
| **Google Play Console** | Organizacion **QuadraTech SA** (developerId `7448208356938367193`) | play.google.com/console | Se necesita permiso de *Releases* para publicar. El acceso a *Setup → API access* (para el JSON de service account) solo lo tiene el **propietario** de la cuenta. |
| **Expo / EAS** | Cuenta `alcivator` | expo.dev, `eas login` | Para usar otra cuenta Expo: cambiar `owner` en `app.json` y correr `eas init`. |
| **Google Cloud (OAuth)** | Proyecto `338617760077` ("pagos") | console.cloud.google.com | Ahi se administran los client IDs de Google Sign-In. |
| **GitHub** | `raulalcivarm10/CONNECT-HUB` | — | Se requiere ser colaborador. |

> **Los correos exactos con los que se entra a cada consola no estan documentados en el repo** (ver §14). Solicitalos al responsable por canal seguro; no los escribas aqui.

### 2.3 Historia de la ficha de Android (importante)

Existen **dos** apps en Play Console y es facil confundirlas:

| App | appId | Package | Estado |
|---|---|---|---|
| **App vigente (Expo)** | `4975218640913412885` | `com.fourstacklabs.connecthub` | **ACTIVA** — es la que se publica |
| App vieja (Ionic) | `4973167685542698921` | `com.quadratech.connecthub` | **ANULADA / no publicada** — no tocar |

La app antigua era una implementacion en Ionic con otro package. Se dejo anulada y sin publicar. **Todo el trabajo actual va contra el appId `4975218640913412885`.**

---

## 3. Estado actual de la revision

### 3.1 iOS

- **Build 1.0 (13)** enviado y **en revision de Apple**.
- Historial relevante: el build **1.0 (3)** fue **rechazado** por dos guidelines, ambas ya resueltas en codigo:

| Guideline | Que pedian | Como se resolvio |
|---|---|---|
| **4.8** — Login Services | Ofrecer *Sign in with Apple* junto a Google | Boton oficial de Apple en la pantalla de login (solo iOS). Plugin `expo-apple-authentication` + `usesAppleSignIn: true`. Backend con `jose` + JWKS. |
| **5.1.1(v)** — Data Collection | Permitir **eliminar la cuenta** desde la app | Perfil → *Eliminar cuenta*. Endpoint `DELETE /public/auth/me` que **anonimiza** al usuario. |

- El contador de build de EAS arranco en 1 y no conocia el build (3) que ya existia en App Store Connect; se fijo manualmente con `eas build:version:set`. Por eso la numeracion actual va en (13).

**Que pasa cuando Apple apruebe:** depende de como quedo configurada la **Version Release** de la version 1.0 en App Store Connect. Las opciones son *Automatically release this version* (sale a la tienda apenas se aprueba), *Manually release this version* (queda aprobada esperando que alguien pulse "Release") o *Automatically release after App Review, no earlier than [fecha]*. **Verifica cual esta seleccionada** en App Store Connect → version 1.0 → seccion *Version Release* antes de asumir que saldra sola.

### 3.2 Android

- **App bundle versionCode 2 (version de marketing 1.0.0)** enviado y **en revision de Google**.
- Distribucion: **177 paises**.
- **Play App Signing: ACTIVADO.**
- La cuenta es de **organizacion** (QuadraTech SA), por lo que **NO aplica** el requisito de test cerrado con 20 testers durante 14 dias que Google impone a las cuentas personales creadas despues del 13-nov-2023.

**Que pasa cuando Google apruebe:** la **publicacion administrada (managed publishing) esta DESACTIVADA**, lo que significa que **la app se publica automaticamente en cuanto pase la revision**. No hay un paso manual de "Publicar" que alguien tenga que pulsar. Consecuencia practica: en el momento en que Google apruebe, la app queda **visible al publico en los 177 paises** sin aviso previo. Todo lo que deba estar listo antes (datos demo limpios, eventos correctos) debe estarlo **antes** de la aprobacion, no despues.

> Si en el futuro quieres controlar el momento exacto de salida, activa *Managed publishing* en Play Console → **Publicacion → Descripcion general de la publicacion** antes de enviar la version.

---

## 4. Configuracion del proyecto movil

### 4.1 `apps/mobile/app.json`

Estado real del archivo (resumen de los campos que importan para las tiendas):

| Campo | Valor | Por que importa |
|---|---|---|
| `expo.name` | `ConnectHub` | Nombre en el dispositivo |
| `expo.slug` | `connecthub` | Identificador Expo |
| `expo.version` | `1.0.0` | Version de marketing en ambas tiendas |
| `expo.orientation` | `portrait` | Solo vertical; las capturas deben ser verticales |
| `expo.icon` | `./assets/images/icon.png` | Icono 1024x1024 (iOS lo toma de aqui) |
| `expo.scheme` | `connecthub` | Deep links / retorno de OAuth |
| `expo.ios.bundleIdentifier` | `com.fourstacklabs.connecthub` | — |
| `expo.ios.usesAppleSignIn` | `true` | **Obligatorio** para guideline 4.8; EAS habilita la capacidad en el App ID |
| `expo.ios.supportsTablet` | `false` | Evita tener que entregar capturas de iPad |
| `expo.ios.config.usesNonExemptEncryption` | `false` | Declara Export Compliance; evita que TestFlight lo pregunte en cada build |
| `expo.userInterfaceStyle` | `automatic` | La app sigue el tema claro/oscuro del sistema; **las capturas deben ser coherentes** entre si |
| `expo.android.package` | `com.fourstacklabs.connecthub` | — |
| `expo.android.predictiveBackGestureEnabled` | `false` | Desactiva el gesto predictivo de atras de Android 14+. Si se activa, hay que revalidar la navegacion antes de publicar |
| `expo.android.adaptiveIcon` | foreground / background / monochrome + `backgroundColor: "#4a0a80"` | Icono adaptativo **de marca** (ya no es el de plantilla de Expo) |
| `expo.android.blockedPermissions` | `RECORD_AUDIO`, `CAMERA` | **Clave para Data safety**: bloquea permisos que arrastraban las librerias y que obligarian a declarar audio/camara |
| `expo.plugins` | `expo-router`, `expo-apple-authentication`, `expo-splash-screen`, `expo-notifications`, `expo-secure-store`, `expo-image-picker`, `expo-image`, `expo-status-bar`, `expo-web-browser` | `expo-image-picker` declara el permiso de fotos con texto en espanol |
| `expo.owner` | `alcivator` | Cuenta Expo propietaria |
| `expo.extra.eas.projectId` | `2a694ac0-ff07-434e-96ee-e508e498facb` | Vinculo con EAS |
| `expo.experiments` | `typedRoutes: true`, `reactCompiler: true` | **Dos features experimentales activas en los builds de tienda.** El React Compiler puede cambiar el comportamiento en runtime; si aparece un bug que solo se ve en el build de produccion y no en dev, es el primer sospechoso |
| `expo.web.output` | `static` | Solo afecta al target web, no a las tiendas |

El commit `10cd18c` ("android: icono adaptativo de marca + quitar RECORD_AUDIO/CAMERA") es el que dejo Android listo; ambos pendientes que aparecen como abiertos en `entrega-tiendas-equipo.md` §5.1 **ya estan resueltos**.

### 4.2 `apps/mobile/eas.json`

Tres perfiles de build:

| Perfil | Uso | Android | iOS |
|---|---|---|---|
| `development` | Dev client, distribucion interna | — | — |
| `preview` | **Pruebas rapidas**: genera un `.apk` instalable por QR/link | `buildType: apk`, `distribution: internal` | — |
| `production` | **Lo que va a las tiendas** | `buildType: app-bundle` (`.aab`) | `buildConfiguration: Release` |

Configuracion global:
- `cli.version: ">= 12.0.0"` — **EAS CLI 12 o superior es obligatorio**; una CLI mas vieja aborta el build.
- `cli.appVersionSource: "remote"` — EAS lleva el contador de build/versionCode en la nube, **no** en `app.json`.
- `build.production.autoIncrement: true` — cada build de produccion incrementa solo el numero.

> ⚠️ **El perfil `development` NO tiene bloque `env`.** Solo `preview` y `production` llevan las variables horneadas. Un dev client no sabe a que API apuntar por si mismo: toma los valores de `apps/mobile/.env` (creado desde `.env.example`). Si te olvidas de ese `.env`, el dev client arranca pero **falla en todas las llamadas de red**, que es exactamente el sintoma que parece un backend caido.

**Variables de entorno horneadas en los perfiles `preview` y `production`** (todas son `EXPO_PUBLIC_*`, es decir **publicas por diseno** — quedan embebidas en el binario y cualquiera puede extraerlas; por eso estan en el repo y no son secretos):

| Variable | Para que sirve |
|---|---|
| `EXPO_PUBLIC_API_URL` | Base de la API de ConnectHub en produccion |
| `EXPO_PUBLIC_WEB_URL` | Base del panel/web (deep links, paginas legales) |
| `EXPO_PUBLIC_PAGOS_API_URL` | Base de la pasarela externa de pagos |
| `EXPO_PUBLIC_PAGOS_LOGIN_PATH` | Ruta de login usuario/clave en la pasarela |
| `EXPO_PUBLIC_PAGOS_GOOGLE_PATH` | Ruta de registro con Google en la pasarela |
| `EXPO_PUBLIC_PAGOS_APPLE_PATH` | Ruta de registro con Apple en la pasarela |
| `EXPO_PUBLIC_PAGOS_REFRESH_PATH` | Ruta de refresh de token en la pasarela |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Client ID **web** de OAuth (proyecto Cloud `338617760077`) |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Client ID **iOS** de OAuth |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Client ID **Android** de OAuth |

`submit.production` esta **vacio** — no hay JSON de service account configurado, por lo que `eas submit -p android` pedira las credenciales de forma interactiva o fallara. Ver §6.5.

### 4.3 Requisitos de entorno

| Requisito | Detalle |
|---|---|
| **Node** | 20.19+ o 22.x (Expo SDK 57 / RN 0.86). Las versiones 20.0–20.18 pueden fallar. El proyecto usa un Node portatil en `~/nodejs`. |
| **EAS CLI** | El paquete es **`eas-cli`**, NO `eas`. Instalar con `npm install -g eas-cli`, o usar `npx eas-cli ...`. **`npx eas ...` falla** con *"could not determine executable to run"*. |
| **Mac** | **No es necesaria.** EAS compila iOS en la nube. |
| **Directorio de trabajo** | Todos los comandos `eas ...` se ejecutan desde `C:\proyectos\CONNECT-HUB\apps\mobile` (donde estan `app.json` y `eas.json`). |

---

## 5. iOS — App Store Connect

### 5.1 Identificacion

| Campo | Valor |
|---|---|
| Bundle ID | `com.fourstacklabs.connecthub` |
| SKU | `connecthub-ios-001` |
| Nombre en la tienda | **ConnectHub+** |
| Version | 1.0, build (13) |
| Soporte de tablet | No (`supportsTablet: false`) |
| Orientacion | Solo vertical |

> El nombre en la tienda es **"ConnectHub+"** (con el signo mas), mientras que el nombre en el dispositivo es **"ConnectHub"**. La diferencia es intencional: el nombre exacto "ConnectHub" no estaba disponible en la App Store.

### 5.2 Ficha de la App Store

| Elemento | Valor / ubicacion |
|---|---|
| **Nombre** | ConnectHub+ |
| **Capturas de pantalla** | `C:\proyectos\capturas-appstore\` — 6 PNG de **1284x2778** (iPhone 6.5"/6.7"): `01-login.png`, `02-home.png`, `03-evento.png`, `04-ticket.png`, `05-agenda.png`, `06-comunidad.png` |
| **Icono** | `apps/mobile/assets/images/icon.png` — **1024x1024**, sin transparencia. Viaja dentro del binario; no se sube por separado. |
| **URL de politica de privacidad** | https://connecthub.fourstacklabs.com/privacy |
| **Soporte** | Pagina/correo de soporte (obligatorio) |
| **Categoria** | Ver §14 — no verificada en el repo |
| **Clasificacion por edad** | Se responde el cuestionario de Age Rating de Apple |

**Capacidad Sign in with Apple:** el App ID `com.fourstacklabs.connecthub` debe tener habilitada la capacidad **Sign In with Apple**. EAS la activa automaticamente durante el build de produccion al detectar `usesAppleSignIn: true`. Para verificarla a mano: developer.apple.com → *Certificates, IDs & Profiles → Identifiers →* `com.fourstacklabs.connecthub` → **Sign In with Apple** debe estar marcado.

### 5.3 App Privacy (equivalente de Data safety)

En App Store Connect → **App Privacy** hay que declarar los tipos de datos recolectados. Segun lo que la app efectivamente recoge:

| Tipo de dato | Se recolecta | Vinculado al usuario | Para rastreo |
|---|---|---|---|
| Correo electronico | Si | Si | No |
| Nombre | Si | Si | No |
| Numero de documento / identificacion | Si | Si | No |
| Fotos (foto de perfil) | Si | Si | No |
| Contenido de usuario (mensajes de comunidad/chat) | Si | Si | No |
| Identificadores de dispositivo (push token) | Si | Si | No |
| Datos de uso / analytics de terceros | No | — | — |
| Publicidad | No | — | — |

La app **no rastrea** al usuario entre apps ni sitios de terceros, por lo que **no requiere App Tracking Transparency (ATT)** ni el prompt de `NSUserTrackingUsageDescription`.

**Eliminacion de cuenta (5.1.1v):** declarada y funcional en *Perfil → Eliminar cuenta*, respaldada por `DELETE /public/auth/me`, que **anonimiza** el registro del usuario. Donde vive, por si hay que ensenarselo a un revisor o depurarlo:

| Pieza | Ruta |
|---|---|
| Endpoint | `apps/api/src/modules/public/asistente-auth/asistente-auth.controller.ts` → `@Delete('me')` bajo `@Controller('public/auth')`, protegido por `AsistenteJwtGuard` |
| Logica | `asistente-auth.service.ts` → `deleteAccount()`: **una sola transaccion atomica e idempotente** — email centinela, credenciales y PII a `NULL`, conservando la fila para no romper los FK financieros |
| UI movil | `apps/mobile/src/app/(tabs)/perfil.tsx` (~242) con dialogo de confirmacion; llamada en `apps/mobile/src/api/auth.ts` → `deleteAccountReq()` |

> Matiz importante para la ficha: el texto de las Notes dice *"permanently removes the user's personal data"*, y es exacto — la PII se destruye. Lo que **se retiene** es el registro financiero (pagos/entradas) asociado, anonimizado. Si un revisor pregunta por que la fila no desaparece, esa es la respuesta.

### 5.4 Export Compliance

Ya esta declarado en `app.json` con `ios.config.usesNonExemptEncryption: false`. Gracias a esto TestFlight **no** pregunta por Export Compliance en cada build.

### 5.5 App Review Information

Es la seccion que hizo fallar el primer intento. Debe llevar **siempre**:

1. **Cuenta demo** (correo + contrasena) — ver §10.
2. **El codigo de institucion `DEMO123` escrito explicitamente en las Notes.** Sin el, el revisor queda atrapado en el gate de onboarding y **no llega al contenido** de la app. Esta es la causa mas probable de un rechazo repetido.
3. **Notas para el revisor** (texto usado, en ingles):

   > *To reach the app content, sign in and enter institution code **DEMO123** on the onboarding screen. Sign in with Apple is offered on the login screen alongside Google (4.8). Account deletion is available in Profile → "Delete account" and permanently removes the user's personal data (5.1.1v). A screen recording of both flows is attached.*

4. **Video adjunto** mostrando *Sign in with Apple* y *Perfil → Eliminar cuenta*. Formato `.mp4`/`.mov`, **menos de 50 MB** (limite del adjunto de App Review).

> ⚠️ **Trampa conocida:** eliminar la cuenta la **anonimiza**. Si el revisor borra la unica cuenta demo, esas credenciales dejan de funcionar. Por eso existen **dos** cuentas demo (`reviewer1@` y `reviewer2@`).

### 5.6 Flujo del revisor (gate de institucion)

La app tiene un **gate de codigo de institucion** entre el login y el contenido. Una cuenta nueva —incluidas las de Sign in with Apple y Google— cae en **Onboarding** y no llega a las pestanas hasta ingresar un codigo valido. El recorrido completo es:

1. Login (Apple, Google o correo/clave con una cuenta demo).
2. **Onboarding → ingresar el codigo `DEMO123`** → resuelve a "Demo Institution" (`idInstitucion` 104).
3. Ya con acceso: Home / Evento / Ticket / Agenda / Comunidad.
4. **Perfil → Eliminar cuenta → confirmar.**

Este mismo recorrido es el que reproducen las capturas de pantalla.

---

## 6. Android — Google Play

### 6.1 Identificacion

| Campo | Valor |
|---|---|
| Package | `com.fourstacklabs.connecthub` |
| appId | `4975218640913412885` |
| developerId | `7448208356938367193` |
| Cuenta | **QuadraTech SA** (organizacion) |
| Version de marketing | 1.0.0 |
| versionCode | 2 |
| Formato | App Bundle (`.aab`) |
| Paises de distribucion | **177** |
| Play App Signing | **Activado** |
| Publicacion administrada | **Desactivada** (auto-publica al aprobar) |

El `.aab` de produccion que se envio esta en `C:\proyectos\connecthub-1.0-android.aab` (~79 MB).

### 6.2 Ficha de Play Store

| Elemento | Valor / ubicacion |
|---|---|
| **Capturas de telefono** | `C:\proyectos\capturas-playstore\` — 5 PNG de **1080x2160**: `02-home.png`, `03-evento.png`, `04-ticket.png`, `05-agenda.png`, `06-comunidad.png` |
| **Icono de la ficha** | `C:\proyectos\capturas-playstore\icon-512.png` — **512x512** |
| **Grafico destacado** | `C:\proyectos\capturas-playstore\feature-graphic-1024x500.png` — **1024x500** |
| **Icono adaptativo (en el binario)** | `apps/mobile/assets/images/android-icon-{foreground,background,monochrome}.png` — 1024x1024, fondo `#4a0a80` |
| **Politica de privacidad** | https://connecthub.fourstacklabs.com/privacy |
| **Eliminacion de datos (URL)** | https://connecthub.fourstacklabs.com/eliminar-cuenta |

> **Nota:** la carpeta de Play **no** incluye un `01-login.png` equivalente al de iOS. Play exige **minimo 2** capturas de telefono, asi que con 5 sobra; pero si quieres paridad visual con iOS, falta esa captura.

### 6.3 Requisitos minimos de la ficha (recordatorio de Play)

| Campo | Limite |
|---|---|
| Titulo de la app | 30 caracteres |
| Descripcion breve | 80 caracteres |
| Descripcion completa | 4000 caracteres |
| Capturas de telefono | 2–8, entre 320 px y 3840 px de lado |
| Icono | 512x512 PNG de 32 bits |
| Grafico destacado | 1024x500 |

Los textos exactos de titulo, descripcion breve y descripcion completa **no estan versionados en el repo** (ver §14). Viven unicamente en Play Console → *Presencia en Google Play → Ficha de Play Store principal*.

### 6.4 Test cerrado obligatorio: NO aplica

Google exige un **test cerrado con 20 testers durante 14 dias continuos** antes de habilitar Produccion **solo para cuentas personales** creadas despues del 13-nov-2023. La cuenta de ConnectHub es de **organizacion (QuadraTech SA)**, por lo que esta **exenta**. Por eso se pudo ir directo a Produccion.

### 6.5 Cuenta de servicio para `eas submit`

`eas.json` tiene `submit.production` **vacio**. Para automatizar las subidas hace falta:

1. Google Cloud → crear o vincular un proyecto → crear una **service account** → generar la **clave JSON**.
2. Play Console → *Setup → API access* → vincular esa service account y **concederle permisos de release**. Esperar la propagacion (puede tardar).
3. Guardar el JSON **fuera del repo** y referenciarlo en `eas.json` con `submit.production.android.serviceAccountKeyPath`, mas `track` (`internal`, `alpha`, `beta` o `production`).

> ⚠️ **Nunca commitear el JSON de la service account.** Es una credencial con permiso de publicar en la tienda. El repo tiene `.gitignore` de secretos, pero la responsabilidad es de quien lo maneja.
>
> Si no se especifica `track`, EAS usa **`internal`** — no Produccion. Promover a Produccion es un paso aparte en Play Console.
>
> **La primera subida de un package nuevo SIEMPRE es manual**: la Play Developer API no puede crear el primer release. Ese paso ya se hizo para `com.fourstacklabs.connecthub`, asi que de aqui en adelante `eas submit` es viable una vez configurada la service account.

---

## 7. Declaraciones de cumplimiento

### 7.1 Google Play — declaraciones una por una

Estas son las respuestas con las que se envio la version actual. Se encuentran en Play Console → **Politica → Contenido de la app**.

| Declaracion | Respuesta dada | Justificacion |
|---|---|---|
| **Seguridad de los datos** (Data safety) | **Se recolectan datos**: correo, nombre, numero de documento, fotos (foto de perfil), mensajes de usuario y token de push. Todos **vinculados al usuario**, transmitidos **cifrados** (HTTPS), y el usuario **puede solicitar su eliminacion**. **No** se comparten con terceros para publicidad. | La app requiere cuenta y perfil; la comunidad genera contenido de usuario. Bloquear `RECORD_AUDIO` y `CAMERA` en `app.json` evita tener que declarar audio y camara. |
| **Eliminacion de datos** (Data deletion) | Se declaran **las dos** vias: (a) ruta dentro de la app — *Perfil → Eliminar cuenta*; (b) **URL web publica** — https://connecthub.fourstacklabs.com/eliminar-cuenta | Google exige la URL web aunque exista el flujo in-app. Sin ella, rechazo automatico. |
| **ID de publicidad** (Advertising ID) | **No** — la app no usa el identificador de publicidad | No hay SDK de ads ni analytics publicitario. Declarar "si" sin usarlo obliga a anadir el permiso `AD_ID` y complica Data safety. |
| **Anuncios** (Ads) | **No** — la app no contiene anuncios | No hay monetizacion por publicidad. |
| **Apps de salud** (Health apps) | **No aplica** — no es una app de salud | No maneja datos medicos ni de bienestar. |
| **Apps gubernamentales** (Government apps) | **No** — no esta afiliada a ni representa a una entidad gubernamental | Es una plataforma privada de eventos. |
| **Funciones financieras** (Financial features) | **No** — la app no ofrece productos financieros (prestamos, inversiones, seguros, cripto) | Existe cobro de entradas, pero es **compra de un producto/servicio**, no un servicio financiero. El cobro lo procesa una pasarela externa. |
| **Detalles de acceso** (App access) | **Todo o parte de la app tiene acceso restringido** → se proporcionan credenciales: cuenta demo (`reviewer1@`/`reviewer2@`) + **instruccion explicita de ingresar el codigo `DEMO123`** en la pantalla de onboarding | Sin el codigo, el revisor de Google queda en el gate igual que el de Apple. Es obligatorio dejarlo escrito en las instrucciones. |
| **Clasificacion de contenido** (Content rating) | Cuestionario de IARC respondido; app de tipo **utilidad/productividad/social**, sin violencia, sexo, drogas ni juegos de azar. Se declara la presencia de **interaccion entre usuarios** (comunidad y chats). | Declarar la interaccion entre usuarios es obligatorio y afecta la clasificacion final. |
| **Publico objetivo y contenido** (Target audience) | **Publico adulto — no dirigida a ninos.** No se incluye a menores de 13 anos en los grupos de edad objetivo. | Marcar franjas infantiles activa las politicas de Families, mucho mas estrictas. |
| **App de noticias** | **No** | — |
| **App COVID-19 / rastreo de contactos** | **No** | — |

> ⚠️ **Interaccion entre usuarios y moderacion.** La app tiene comunidad por evento y chats privados 1-a-1. Google exige que las apps con contenido generado por usuarios ofrezcan un mecanismo de **reportar y bloquear**. Actualmente **no existe** — es el pendiente (2) de §12 y un riesgo real de rechazo o de retiro posterior.

### 7.2 Apple — equivalencias

| Declaracion de Google Play | Equivalente en Apple |
|---|---|
| Seguridad de los datos (Data safety) | **App Privacy** — cuestionario de tipos de datos, vinculacion y rastreo (§5.3) |
| Eliminacion de datos | **Guideline 5.1.1(v)** — eliminacion de cuenta obligatoria desde la app. No exige URL web, pero la tenemos igual. |
| ID de publicidad = No | **App Tracking Transparency** — al no rastrear, no se implementa ATT ni se declara "Data Used to Track You" |
| Anuncios = No | Se responde "No" en la seccion de publicidad de App Privacy |
| Apps de salud | Guidelines 1.4.1 / 5.1.3 — no aplican |
| Apps gubernamentales | Guideline 5.1.1 sobre apps de entidades gubernamentales — no aplica |
| Funciones financieras | Guideline 3.1.5 (b) sobre servicios financieros — no aplica |
| Detalles de acceso | **App Review Information** — cuenta demo + notas con `DEMO123` (§5.5) |
| Clasificacion de contenido | **Age Rating** — cuestionario de Apple |
| Publico objetivo | **Kids Category** — la app **NO** se registra en la categoria infantil |
| — | **Export Compliance** — `usesNonExemptEncryption: false` (no tiene equivalente directo en Play) |
| Reportar/bloquear en contenido de usuario | **Guideline 1.2 — User-Generated Content.** Apple exige filtrado de contenido objetable, mecanismo de reporte, capacidad de bloquear usuarios abusivos y datos de contacto del desarrollador. **Mismo riesgo abierto que en Play** (§12, pendiente 2). |

---

## 8. Assets de tienda

**Los assets de tienda YA ESTAN VERSIONADOS EN EL REPO**, en `docs/handbook/assets-tiendas/`. La copia original fuera del repo (`C:\proyectos\capturas-*`) sigue existiendo pero es **secundaria**: la fuente de verdad es la del repo.

| Asset | Ruta en el repo (fuente de verdad) | Copia original (fuera del repo) | Dimensiones | Tienda |
|---|---|---|---|---|
| Capturas iOS (6) | `docs/handbook/assets-tiendas/appstore/0{1..6}-*.png` | `C:\proyectos\capturas-appstore\` | **1284x2778** | App Store |
| Capturas Android (5) | `docs/handbook/assets-tiendas/playstore/0{2..6}-*.png` | `C:\proyectos\capturas-playstore\` | **1080x2160** | Google Play |
| Icono de ficha Android | `docs/handbook/assets-tiendas/playstore/icon-512.png` | idem | **512x512** | Google Play |
| Grafico destacado | `docs/handbook/assets-tiendas/playstore/feature-graphic-1024x500.png` | idem | **1024x500** | Google Play |
| Icono de la app (binario) | `apps/mobile/assets/images/icon.png` | — | **1024x1024** | Ambas (via build) |
| Icono adaptativo Android | `apps/mobile/assets/images/android-icon-foreground.png` (+ `-background`, `-monochrome`) | — | **1024x1024** | Android (via build) |
| Splash | `apps/mobile/assets/images/splash-icon.png` | — | **1024x1024** (se renderiza a `imageWidth: 120`, fondo `#4a0a80`) | Ambas (via build) |
| Favicon web | `apps/mobile/assets/images/favicon.png` | — | 48x48 | Web |
| App bundle enviado | — | `C:\proyectos\connecthub-1.0-android.aab` (~79 MB) | — | Google Play |

**Contenido de las capturas** (mismo orden conceptual en ambas tiendas): login (solo iOS), home con el hero de eventos, detalle de evento, entrada con QR, agenda y comunidad.

### 8.1 Scripts de generacion de assets

`docs/handbook/assets-tiendas/scripts/` contiene el utillaje real con el que se produjeron los assets. **No hay que rehacer las capturas a mano.**

| Script | Que hace |
|---|---|
| `capturas-android.js`, `capturas2.js` | Generan las capturas de tienda a partir de la app |
| `assets-playstore.js` | Produce el icono 512x512 y el grafico destacado 1024x500 de Play |
| `generate-android-icons.js` | Genera los tres PNG del icono adaptativo (foreground / background / monochrome) |
| `ocultar-eventos.js` | `UPDATE EVENTOS SET NO_PUBLICAR='S' WHERE ID_EVENTO IN (161, 201)` — oculta los eventos durante la revision (§10). Lee `ORACLE_USER` / `ORACLE_PASSWORD` / `ORACLE_CONNECT_STRING` del entorno; **no lleva credenciales dentro** |

> El `.aab` enviado (`C:\proyectos\connecthub-1.0-android.aab`, ~79 MB) **si** esta fuera del repo y no se versiona a proposito — es un artefacto reproducible desde EAS, no una fuente.

---

## 9. Firma de aplicaciones

### 9.1 Android — Play App Signing

**Play App Signing esta ACTIVADO.** Esto implica un modelo de **dos claves** que es la fuente de confusion mas cara del proyecto:

| Clave | Quien la tiene | Para que sirve |
|---|---|---|
| **Upload key** (clave de subida) | La genera y custodia **EAS** (keystore del proyecto) | Firmar el `.aab` que se sube a Play. Google verifica esta firma para aceptar el bundle. |
| **App Signing key** (clave de firma de la app) | La custodia **Google** | Con ella Google **re-firma** el APK que finalmente se instala en los dispositivos. Es la firma que ve el sistema operativo. |

**Huellas digitales de ambas claves** (leidas de Play Console el 2026-07-19). Son **certificados
publicos**, no secretos, por eso se documentan aqui:

| Clave | Huella | Algoritmo |
|---|---|---|
| 🟢 **App Signing key** | `27:B4:F1:89:9C:11:7F:91:F9:48:CD:50:2A:0C:D3:A9:28:7D:D5:2F` | SHA-1 |
| 🟢 **App Signing key** | `C0:C0:5F:A4:CA:85:55:5B:BA:84:E5:B9:91:07:1C:D8` | MD5 |
| 🟢 **App Signing key** | `70:8F:E0:A4:AA:99:A3:A7:90:8E:72:88:98:66:0B:09:B9:51:6A:27:AA:74:31:23:88:2D:AF:08:7C:AB:7D:75` | SHA-256 |
| ⚪ Upload key | `50:6A:79:AB:71:C1:B1:4D:15:27:FE:EB:8A:22:D7:66:0D:2A:73:34` | SHA-1 |

> 🔴 **CRITICO — la SHA-1 de la upload key NO sirve para OAuth en produccion.** Como Google **re-firma** la app, el certificado con el que se instala en el telefono del usuario final es el de la **App Signing key**. Cualquier servicio que valide la firma de la app —**Google Sign-In**, Maps, Firebase, App Links— debe registrar la **SHA-1 de la App Signing key** (la primera fila, `27:B4:F1:…`).
>
> Fijate en que las dos SHA-1 no se parecen en nada: confundirlas produce un fallo silencioso que solo aparece en la version descargada de Play, nunca en los builds locales.
>
> **Donde se obtiene:** Play Console → **Protegido con Play** → *Proteccion de Play Store* → **"Administrar la firma de apps de Play"** (ruta `/keymanagement`). Ojo: la antigua pagina *Integridad de la app* ya solo redirige aqui.
>
> Esto es la base del pendiente (1) de §12.

**Respaldo del keystore:** conviene respaldar la upload key con `eas credentials`. Aun asi, si se pierde **no se pierde la app**: se puede solicitar a Google un **reseteo de la upload key**. Lo que seria irrecuperable es la App Signing key, y esa la custodia Google.

### 9.2 iOS — firma via EAS

EAS administra automaticamente los certificados y perfiles de aprovisionamiento:

- **Distribution Certificate** y **Provisioning Profile** — generados y almacenados por EAS. Durante el build responder *"Let EAS handle it"*.
- Requiere autenticarse con el **Apple ID** (con 2FA) o con una **App Store Connect API Key** (`.p8` + Key ID + Issuer ID). Generar esa key requiere rol **Admin** en App Store Connect.
- La capacidad **Sign In with Apple** se habilita sola en el App ID gracias a `usesAppleSignIn: true`.

Para inspeccionar o respaldar las credenciales:

```bash
cd C:\proyectos\CONNECT-HUB\apps\mobile
eas credentials
```

> ⚠️ El `.p8` de una App Store Connect API Key es un **secreto**. Guardalo fuera del repo. Nunca lo pegues en documentacion ni en chat.

---

## 10. Datos y cuentas demo para revisores

| Elemento | Valor |
|---|---|
| Cuenta demo 1 | `reviewer1@connecthub.fourstacklabs.com` |
| Cuenta demo 2 | `reviewer2@connecthub.fourstacklabs.com` |
| Contrasena | *(en el gestor de contrasenas del responsable — **no se escribe en el repo**; ver [`07-credenciales-y-accesos.md`](07-credenciales-y-accesos.md) §2.13)* |
| Codigo de institucion | **`DEMO123`** |
| Institucion que resuelve | "Demo Institution", `idInstitucion` **104** |

> Estas credenciales se entregan a los revisores de Apple y Google por el formulario de cada tienda. Aunque el usuario demo no da acceso a datos de ningun cliente real, **la contrasena no se documenta aqui**: este archivo se sube a GitHub y la regla de §12 (la cabecera de este documento) aplica sin excepciones. El valor vive unicamente en el gestor de contrasenas. **Las cuentas deben eliminarse o rotarse una vez aprobadas las apps** (pendiente 3 de §12).

> ⚠️ **El codigo `DEMO123` esta visible dentro de la propia app.** `apps/mobile/src/app/onboarding.tsx` (~linea 155) pinta un atajo pulsable con el texto literal `Demo: DEMO123` que rellena el campo. Esto ayuda al revisor —no depende de que lea las Notes— pero significa que **cualquier usuario de produccion puede entrar al tenant de demostracion con un toque**. Tenlo presente al decidir el pendiente 3 de §12: desactivar el codigo obliga tambien a quitar ese atajo del binario (y por tanto a un rebuild).

**Por que hay dos cuentas:** eliminar una cuenta la **anonimiza**. Si el revisor prueba *Perfil → Eliminar cuenta* con `reviewer1@`, esas credenciales dejan de funcionar. `reviewer2@` es el respaldo para que el revisor pueda seguir explorando.

**Eventos ocultos durante la revision:** los eventos **161** (ODONTOLOGIA) y **201** (EVENTO DE PRUEBA PUSH) estan marcados con `NO_PUBLICAR='S'` para que no aparezcan en la app durante las capturas y la revision. Se ocultaron con `docs/handbook/assets-tiendas/scripts/ocultar-eventos.js`.

> **Ojo con el proposito de la columna.** `NO_PUBLICAR` **no** se creo para la revision de tiendas: segun `docs/sql/2026-07-10_no_publicar.sql` marca **reservas privadas** que ocupan el espacio en el panel pero no deben verse en la app. Usarla para ocultar eventos de revision es un uso oportunista de la misma bandera. Al revertir (pendiente 3 de §12) **no la pongas a `'N'` masivamente**: solo en 161 y 201, o republicaras reservas privadas de clientes.

El filtro que lo implementa es:

```sql
WHERE NVL(E.NO_PUBLICAR, 'N') = 'N'
```

Definido en `docs/sql/2026-07-10_no_publicar.sql`. **No esta solo en `catalogo.service.ts`** — se aplica en toda la API publica, y por eso ocultar un evento tambien lo saca de entradas, pagos, comunidad y push:

| Archivo (`apps/api/src/modules/public/`) | Donde |
|---|---|
| `catalogo/catalogo.service.ts` | Listados y detalle (`~232`, `~294`, `~356`) y sub-eventos (`~453`) |
| `entradas/entradas.service.ts` | `~71` — 404 al intentar sacar entrada de un evento oculto |
| `pagos/pagos.service.ts` | `~300` — 404 al intentar pagarlo |
| `comunidad/comunidad.service.ts` | `~108` — no aparece en la comunidad |
| `push/push.service.ts` (fuera de `public/`) | `~64` — no se envian push de eventos ocultos |

Para republicarlos tras la aprobacion, ver pendiente 3 de §12.

---

## 11. Procedimiento repetible: publicar una version nueva

### 11.0 Pre-vuelo (comun a ambas plataformas)

```bash
cd C:\proyectos\CONNECT-HUB
git pull
cd apps\mobile
npm install
npx expo-doctor          # debe decir "20/20 checks passed"
npx tsc --noEmit         # debe salir limpio
```

Si es una PC nueva, ademas:

```bash
cp .env.example .env      # apps/mobile/.env NO tiene secretos: son todas EXPO_PUBLIC_*
npm install -g eas-cli    # el paquete es eas-cli, NO eas
eas login                 # cuenta Expo (alcivator)
eas whoami                # confirmar sesion
```

**Decidir el numero de version:**
- **Cambios de funcionalidad** → subir `expo.version` en `app.json` (ej. `1.0.0` → `1.0.1`) y commitear.
- **Solo un rebuild** (mismo codigo de cara al usuario) → dejar `version` igual; `autoIncrement` sube solo el build/versionCode.

Recuerda que `appVersionSource: "remote"`: el contador vive en EAS, no en el repo. Para forzarlo:

```bash
eas build:version:set     # elegir plataforma y fijar el numero
```

---

### 11.1 iOS — publicar una version nueva

```bash
cd C:\proyectos\CONNECT-HUB\apps\mobile

# 1. Compilar (~15-25 min en la nube)
eas build --platform ios --profile production
```

Prompts esperados:
- *"Log in to your Apple account?"* → `Y` → Apple ID + contrasena + **2FA**. (Alternativa: App Store Connect API Key.)
- Bundle identifier `com.fourstacklabs.connecthub` → **usar el existente**.
- Certificados y perfiles → **"Let EAS handle it"**.
- Capacidades (Sign in with Apple, Push) → **aceptar**.

```bash
# 2. Subir a App Store Connect / TestFlight
eas submit --platform ios --latest
```

Esperar 10–30 min a que Apple procese el build. Luego, en App Store Connect:

3. **TestFlight** → *Internal Testing* → crear/usar un grupo → agregar testers (deben existir en *Users and Access*) → instalar la app **TestFlight** en el iPhone → instalar ConnectHub.
4. **Probar el flujo del revisor completo**: login → **`DEMO123`** → navegar → *Perfil → Eliminar cuenta*. Si el release incluye Sign in with Apple o cambios de cuenta, **grabar el video** (`.mp4`/`.mov`, **< 50 MB**).
5. **Crear la version nueva** en App Store Connect (*+ Version or Platform*), poner el numero de version y las **novedades de esta version** (What's New).
6. **Seleccionar el build nuevo** en la seccion *Build*.
7. Revisar la ficha: capturas, descripcion, URL de privacidad, **App Privacy** (actualizar si cambiaron los datos recolectados).
8. **App Review Information**: cuenta demo + contrasena + **`DEMO123` explicito en las Notes** + video si aplica.
9. Elegir **Version Release**: automatico o manual (§3.1).
10. **Submit for Review.**

> Si el envio anterior fue rechazado, **responder en el hilo de App Review** citando cada punto y como se resolvio, ademas de enviar el build nuevo.

---

### 11.2 Android — publicar una version nueva

```bash
cd C:\proyectos\CONNECT-HUB\apps\mobile

# 1. Compilar el .aab
eas build --platform android --profile production
```

El keystore ya existe en EAS; no volvera a preguntar por generarlo. Genera un `.aab` con el versionCode incrementado.

**Opcion A — subida manual** (la que se ha usado):

2. Descargar el `.aab` desde el link de EAS.
3. Play Console → app `4975218640913412885` → **Produccion → Crear version nueva**.
4. Subir el `.aab`. **Subir tambien el archivo de mapping de R8/ProGuard** (ver pendiente 4 de §12).
5. Escribir las **notas de la version** (release notes) por idioma.
6. Revisar el resumen → **Guardar → Revisar version → Iniciar el lanzamiento a Produccion**.

**Opcion B — subida automatizada** (requiere la service account de §6.5):

```bash
eas submit --platform android --latest
```

Sin `track` configurado va a **`internal`**, no a Produccion; promover es un paso aparte en Play Console.

7. Verificar que las declaraciones de **Contenido de la app** sigan vigentes (§7.1). Si el release agrega funcionalidad —por ejemplo reportar/bloquear, o un SDK nuevo— hay que **actualizar Data safety** antes de enviar.
8. Confirmar el **porcentaje de lanzamiento**: se puede hacer un *staged rollout* (ej. 20%) en vez de 100%. Para 1.0 se fue al 100%.

> ⚠️ Con **publicacion administrada desactivada**, la version **sale automaticamente** al aprobarse. No hay red de seguridad entre la aprobacion y los usuarios.

---

### 11.3 Build de prueba rapido (sin pasar por las tiendas)

```bash
cd C:\proyectos\CONNECT-HUB\apps\mobile
eas build --platform android --profile preview   # .apk instalable por QR/link
```

Es la forma mas rapida de validar un cambio en un dispositivo Android real. Para iOS, TestFlight sigue siendo el camino.

---

## 12. Pendientes conocidos

### (1) 🔴 Google Sign-In roto en Android — el build usa el client OAuth de la app VIEJA

> **Diagnostico VERIFICADO el 2026-07-19.** Una version anterior de este documento suponia que el
> client era propio pero con el SHA-1 equivocado. Al revisarlo se encontro algo peor (ver abajo).

**Problema.** El valor compilado en el build que esta en revision (versionCode 2) es:

```
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = 338617760077-ma8eeeis1481u486m00q3tovkjv43huu.apps.googleusercontent.com
```

Ese client `ma8ee…` es **el de la app Ionic ANTIGUA**, registrado contra el paquete
`com.quadratech.connecthub`. La app nueva se llama `com.fourstacklabs.connecthub` y se instala
firmada con la **App Signing key** de Google. Como un client OAuth de tipo Android esta atado a
**un unico par (paquete, SHA-1)**, ni el paquete ni la firma coinciden y Google rechaza el
intento de sign-in (tipicamente `DEVELOPER_ERROR` / codigo 10).

Los otros dos client IDs si parecen propios del proyecto — conviene igualmente **verificar que el
de iOS este atado al bundle `com.fourstacklabs.connecthub`**:

| Variable | Client ID | Estado |
|---|---|---|
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | `…-ncr1fcr5sosegoevnjhns4rrskvamjuo` | Correcto (verificado antes) |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | `…-2kdidcrko33qet7g3rfv1n5gd1jj4dlq` | ⚠️ Sin verificar el bundle |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | `…-ma8eeeis1481u486m00q3tovkjv43huu` | 🔴 **Es el de la app vieja** |

**Impacto.** Quien descargue la app de Play **no podra iniciar sesion con Google**. Email/clave y
Sign in with Apple si funcionan, asi que la app no queda inutilizable, pero se pierde el login
social principal de Android.

**Por que NO basta con tocar Google Cloud.** La app usa `expo-auth-session`
(`apps/mobile/src/features/auth/useGoogleAuth.ts`, flujo hibrido `id_token token`) y lee el client
ID desde `process.env.EXPO_PUBLIC_*`, que Expo **hornea en el binario en tiempo de build**. Cambiar
algo en Cloud no altera el `.aab` ya subido. **El rebuild es obligatorio.**

**Solucion:**

1. Google Cloud Console → proyecto **`338617760077`** ("pagos") → *APIs y servicios → Credenciales*.
2. Crear un **ID de cliente OAuth de tipo Android NUEVO** (no editar el `ma8ee…`, que sigue siendo
   de la app vieja) con:
   - Nombre del paquete: `com.fourstacklabs.connecthub`
   - Huella digital SHA-1: **`27:B4:F1:89:9C:11:7F:91:F9:48:CD:50:2A:0C:D3:A9:28:7D:D5:2F`**
     (App Signing key — ver §9.1; **no** la de la upload key)
3. Actualizar el nuevo client ID en `apps/mobile/eas.json` (aparece en los perfiles `preview` **y**
   `production`) y en `apps/mobile/.env`.
4. Recompilar y resubir como **versionCode 3**.

> Opcionalmente, registrar tambien un segundo client Android con el SHA-1 de la **upload key**
> (`50:6A:79:AB:…`) para que Google Sign-In funcione ademas en los builds locales y de `preview`.

**⛔ Bloqueo actual.** La cuenta de Google del navegador (`developer@quadratechsa.com`) **no tiene
acceso al proyecto `338617760077`** (falta `resourcemanager.projects.get`). Hay que entrar con la
cuenta propietaria del proyecto de pagos, o concederle acceso a esa cuenta, antes de poder crear
el client.

**Prioridad: la mas alta.** Resolver en la 1.0.1 y, si la app ya salio, tratarlo como hotfix.

---

### (2) 🟠 Falta la funcion Reportar/Bloquear en el chat — para 1.0.1

**Problema.** La app tiene **comunidad por evento** y **chats privados 1-a-1**, es decir, contenido generado por usuarios, pero **no ofrece un mecanismo para reportar contenido abusivo ni para bloquear a otro usuario**.

**Impacto.** Ambas tiendas lo exigen:
- **Apple Guideline 1.2 (User-Generated Content)**: filtrado de contenido objetable, mecanismo de reporte, capacidad de bloquear usuarios abusivos y datos de contacto del desarrollador. Es causa habitual de rechazo.
- **Google Play — politica de contenido generado por usuarios**: requiere sistema de reporte y moderacion.

**Solucion (alcance para 1.0.1):**
- Boton **Reportar** en cada mensaje y en el perfil de usuario, con motivo y envio al backend.
- Boton **Bloquear usuario**: oculta sus mensajes y evita nuevos chats privados.
- Tabla nueva en Oracle para reportes/bloqueos + migracion en `docs/sql/`.
- Vista de moderacion en el panel web para atender los reportes.
- Compromiso de responder los reportes en un plazo razonable (Apple espera 24 h).

---

### (3) 🟡 Tras la aprobacion: republicar eventos 161/201 y limpiar datos demo

**Problema.** Para las capturas y la revision se prepararon condiciones artificiales que **no deben quedarse en produccion**.

**Acciones, una vez aprobadas AMBAS tiendas** (no antes — un rechazo obliga a reenviar y se necesitan las mismas condiciones):

1. **Republicar los eventos ocultos:**

   ```sql
   UPDATE EVENTOS SET NO_PUBLICAR = 'N' WHERE ID_EVENTO IN (161, 201);
   COMMIT;
   ```

   La columna de PK es `ID_EVENTO` (confirmado en `assets-tiendas/scripts/ocultar-eventos.js`, que hace el `UPDATE` inverso sobre los mismos dos IDs). Tras el `COMMIT`, confirmar en la app que ambos eventos vuelven a aparecer. **Restringe siempre el `WHERE` a 161 y 201**: `NO_PUBLICAR` tambien marca reservas privadas de clientes (§10).

2. **Eliminar o rotar las cuentas demo** `reviewer1@` y `reviewer2@`, o al menos **cambiar su contrasena** (la actual quedo escrita en los formularios de App Review y de *Detalles de acceso* de ambas tiendas, que no son canales cifrados). El valor vigente esta en el gestor de contrasenas.

3. **Decidir que pasa con `DEMO123` / "Demo Institution" (`idInstitucion` 104).** No hace falta adivinarlo: **la propia pantalla de onboarding lo muestra** como atajo pulsable (`apps/mobile/src/app/onboarding.tsx`), asi que hoy cualquier usuario de produccion entra al tenant demo con un toque. Opciones: (a) dejarlo, asegurando que la institucion 104 no contiene datos reales de ningun cliente; (b) desactivar el codigo **y** quitar el atajo del onboarding — esto ultimo **exige rebuild y resubida**, asi que conviene agruparlo con el pendiente (1).

4. **Revisar que no queden otros datos de demostracion** (eventos, tickets o usuarios de prueba) visibles en produccion.

> ⚠️ Con la publicacion administrada desactivada en Android, la app **sale sola al aprobarse**. Si estos datos importan, ten el script listo y monitorea el estado de la revision.

---

### (4) 🟡 Falta subir el archivo de mapping de R8

**Problema.** Los builds de produccion de Android pasan por **R8** (ofuscacion y minificacion). Los stack traces de los crashes llegan ofuscados y son ilegibles. El archivo `mapping.txt` que los traduce **no se subio** con el versionCode 2.

**Impacto.** Play Console → *Calidad → Android vitals → Crashes y ANRs* mostrara trazas ininteligibles. Depurar un crash de produccion sera mucho mas dificil.

**Solucion:**
- El `mapping.txt` se genera dentro del build de EAS. Descargarlo desde los artefactos del build en expo.dev (o desde `android/app/build/outputs/mapping/release/mapping.txt` si se compila localmente).
- Play Console → *Produccion → seleccionar la version → Archivos de simbolos de depuracion / Deobfuscation file* → subir el `mapping.txt`.
- **Se puede subir a posteriori** para el versionCode 2 ya publicado; no hace falta un release nuevo.
- **Incorporarlo al procedimiento de §11.2** como paso fijo de cada release.

---

### Resumen de pendientes

| # | Pendiente | Prioridad | Requiere rebuild |
|---|---|---|---|
| 1 | Client OAuth Android con SHA-1 de la App Signing key | 🔴 Critica | **Si** |
| 2 | Reportar/Bloquear en chat (1.0.1) | 🟠 Alta | **Si** |
| 3 | Republicar eventos 161/201 + limpiar datos demo | 🟡 Media | No |
| 4 | Subir mapping de R8 | 🟡 Media | No |

---

## 13. Problemas comunes

| Sintoma | Causa | Solucion |
|---|---|---|
| `npx eas ...` → *"could not determine executable to run"* | El paquete se llama **`eas-cli`**, no `eas` | `npm install -g eas-cli` y usar `eas ...`, o `npx eas-cli ...` |
| Apple: *"The build number must be higher than the previously uploaded build"* | El contador remoto de EAS arranca en 1 y no conoce los builds previos | `eas build:version:set` y fijarlo por encima del ultimo subido |
| El revisor no llega a *Eliminar cuenta* / dice que la app no carga | Falta el codigo **`DEMO123`** en las notas — se queda en el gate de onboarding | Escribirlo explicito en App Review Information (iOS) y en Detalles de acceso (Android) |
| Las credenciales demo dejan de funcionar a mitad de la revision | El revisor uso *Eliminar cuenta*, que **anonimiza** | Por eso existen `reviewer1@` y `reviewer2@` |
| `eas submit --platform android` falla en la primera entrega de un package | La Play Developer API no puede crear el **primer** release | Subir el `.aab` manualmente esa primera vez (ya hecho para este package) |
| Google Sign-In falla solo en la version descargada de Play | SHA-1 de la App Signing key no registrado en OAuth | Pendiente (1) de §12 |
| `npm install` reporta "N vulnerabilities" | Ruido de dependencias de desarrollo | **No** correr `npm audit fix --force` — rompe versiones de Expo |
| `eas whoami` sin sesion | Sesion expirada | `eas login` |
| Data safety exige declarar audio o camara | Permisos arrastrados por librerias | Ya resueltos via `android.blockedPermissions` en `app.json` |
| No encuentro las capturas de tienda | Se buscan en `C:\proyectos\capturas-*` (copia local antigua) | **Ya viajan con el repo**: `docs/handbook/assets-tiendas/{appstore,playstore}/`. Para regenerarlas, los scripts estan en `.../assets-tiendas/scripts/` (§8.1) |

---

## 14. Vacios de documentacion

Lo siguiente **no pudo verificarse** en el repositorio ni en la documentacion existente. Vive unicamente en las consolas de las tiendas y **debe completarse aqui** en cuanto alguien con acceso lo consulte:

| Dato faltante | Donde se consulta |
|---|---|
| **Textos de la ficha de Play**: titulo (30 car.), descripcion breve (80 car.), descripcion completa (4000 car.) | Play Console → Presencia en Google Play → Ficha principal |
| **Textos de la ficha de App Store**: subtitulo, descripcion, palabras clave, texto promocional | App Store Connect → version 1.0 |
| **Categoria** de cada tienda (primaria y secundaria) | Ambas consolas |
| **Clasificacion de contenido definitiva** (rating IARC concreto y Age Rating de Apple) | Ambas consolas |
| **Correos exactos** con los que se accede a Apple Developer, Play Console y Expo | Preguntar al responsable — **no escribirlos en este archivo** |
| **Modo de Version Release en iOS** (automatico vs. manual) | App Store Connect → version 1.0 → Version Release |
| **URL/correo de soporte** declarado en las fichas | Ambas consolas |
| **Fecha exacta de envio** de cada version | Ambas consolas |

> **Sugerencia:** versionar los textos de ambas fichas en el repo, por ejemplo en `docs/handbook/assets-tiendas/listing-{ios,android}.md`, **junto a las capturas, que ya estan versionadas** ahi (§8). Hoy esos textos existen en un solo lugar —la consola— y se perderian si alguien los sobreescribe. Es el unico bloque de la ficha que sigue sin respaldo en el repo.
