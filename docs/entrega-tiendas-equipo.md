# ConnectHub — Entrega al equipo: publicar en App Store y Google Play

Guía **de principio a fin** para el equipo que ya clonó el repositorio y va a publicar la app **ConnectHub** (Expo SDK 57) en **App Store (iOS)** y **Google Play (Android)**.

- **Bundle id / package:** `com.fourstacklabs.connecthub`
- **Versión:** `1.0.0`
- **Proyecto EAS:** `alcivator/connecthub` (projectId `2a694ac0-ff07-434e-96ee-e508e498facb`)
- **Política de privacidad:** https://connecthub.fourstacklabs.com/privacy
- **Eliminación de cuenta (web):** https://connecthub.fourstacklabs.com/eliminar-cuenta

> El backend ya está en producción (`https://connecthub.fourstacklabs.com`). Esta guía cubre **solo la app móvil**; no hay que desplegar nada del servidor.
>
> **⚠️ Lee primero la Sección 0:** sin ciertos accesos/datos del responsable te vas a trabar a mitad de camino.

---

## 0. Qué necesitan pedirle al responsable ANTES de empezar

**Accesos**
- [ ] **Colaborador en el repo** de GitHub.
- [ ] **Miembro del proyecto Expo** `alcivator/connecthub` (expo.dev → proyecto → *Members*), o usar su propia cuenta Expo (entonces cambien `owner` en `app.json` y corran `eas init`).
- [ ] **Apple Developer** — invitación en [App Store Connect](https://appstoreconnect.apple.com). La app **ya existe** ahí (fue rechazada como 1.0(3)). Rol **App Manager o Developer** para subir builds. *(Para generar una App Store Connect API Key — ver §4.3 — se necesita rol **Admin**.)*
- [ ] **Google Play Console** — invitación con permiso de *Releases*. ⚠️ **Verificar si la app YA está creada** en Play Console con el package `com.fourstacklabs.connecthub`; si no, hay que crearla (§5.1).

**Secretos / datos (compartir por canal seguro, nunca por chat/email plano)**
- [ ] **Cuenta demo con acceso a un evento** (email + clave) para el App Review de Apple. Además, el **código de institución** para el onboarding — usar **`DEMO123`** (verificado: resuelve a "Demo Institution" con 4 eventos en prod). Ver §4.6 — esto es **obligatorio** o Apple rechaza de nuevo.
- [ ] **JSON de cuenta de servicio de Google Play** — lo genera el **propietario** de la cuenta (Play Console → *Setup → API access*). Una invitación normal NO da acceso a API access. Necesario para `eas submit android` (§5.2).
- [ ] Contenido real de **`/.env`** (raíz) — **solo** si van a correr backend/panel localmente. Para *solo publicar la app móvil NO se necesita*.

> `apps/mobile/.env` **no** tiene secretos: el `apps/mobile/.env.example` ya trae los valores (`EXPO_PUBLIC_*`, públicos por diseño).

---

## 1. Requisitos (una sola vez)

| Requisito | Detalle |
|---|---|
| **Node 20.19+ o 22.x** | Para Expo SDK 57 / RN 0.86. Versiones 20.0–20.18 pueden fallar. |
| **Git** | Ya lo tienen. |
| **Cuenta Apple Developer** | US$99/año. |
| **Cuenta Google Play Developer** | US$25 pago único. ⚠️ Si es cuenta **personal** creada después del 13-nov-2023, Google exige un **test cerrado con ≥20 testers durante 14 días** antes de poder publicar en Producción (las cuentas de **organización** están exentas) — ver §5.5. |
| **Cuenta Expo** | Gratis, en [expo.dev](https://expo.dev). |
| **EAS CLI** | Se instala en el paso 3. |

> Mac **no** es necesaria: EAS compila iOS en la nube.

---

## 2. Preparar el proyecto (desde el clone)

```bash
git clone https://github.com/raulalcivarm10/CONNECT-HUB.git
cd CONNECT-HUB/apps/mobile
cp .env.example .env      # (PowerShell: cp funciona; en cmd.exe: copy .env.example .env)
npm install
npx expo-doctor           # debe decir "20/20 checks passed"
```

---

## 3. Instalar y vincular EAS

> **Todos los comandos `eas ...` de las secciones 3–5 se ejecutan desde `apps/mobile`** (donde están `app.json` y `eas.json`). Si abres una terminal nueva, primero `cd CONNECT-HUB/apps/mobile`.

```bash
npm install -g eas-cli    # el paquete es eas-cli, NO eas
eas login                 # cuenta Expo
eas whoami                # confirma sesión
```

> Si usan una cuenta Expo distinta a `alcivator`, corran `eas init` para revincular y ajusten `owner` en `app.json`.

---

## 4. iOS — App Store

### 4.1 Contexto: es una **resubmisión**
La app fue rechazada por 2 puntos, **ambos ya resueltos en el código**:

| Guideline | Qué pedían | Estado |
|---|---|---|
| **4.8** Login Services | *Sign in with Apple* junto a Google | ✅ Botón oficial en el login (solo iOS) |
| **5.1.1(v)** Data | **Eliminar la cuenta** desde la app | ✅ Perfil → Eliminar cuenta |

Hay que subir un **build nuevo** con número **mayor a 3** y **responder al App Review**.

### 4.2 Fijar el build number (¡importante, hazlo una vez!)
El proyecto usa versionado **remoto** (`appVersionSource: remote` + `autoIncrement`). Como este es un **proyecto EAS nuevo**, su contador arranca en 1 y **no conoce** el build 3 que ya existe en App Store Connect. Si subes con build ≤ 3, Apple lo rechaza (*"The build number must be higher than the previously uploaded build"*).

**Antes del primer build**, fija el contador:
```bash
eas build:version:set
```
Elige **iOS** y ponlo en **4**. (Verifica luego que el build salga con número > 3.)

### 4.3 Compilar (.ipa)
```bash
eas build --platform ios --profile production
```
Responde a los prompts:
- **"Log in to your Apple account?"** → `Y`. Apple ID + contraseña + **2FA**.
  - *(Alternativa sin 2FA interactivo: una App Store Connect API Key. OJO: crearla requiere rol **Admin**; si solo tienes App Manager/Developer, pídele al responsable que la genere y comparta el `.p8` + Key ID + Issuer ID.)*
- **Bundle identifier** `com.fourstacklabs.connecthub` → usar el existente.
- **Certificados y perfiles** → dejar que **EAS los administre** ("Let EAS handle it").
- **Sign in with Apple / Push Notifications** → si pregunta por habilitar capacidades, **acepta**. Luego verifica en developer.apple.com → *Certificates, IDs & Profiles → Identifiers →* `com.fourstacklabs.connecthub` que **"Sign In with Apple"** esté activada (es el pilar del punto 4.8).

Build ~15–25 min en la nube.

### 4.4 Subir a TestFlight
```bash
eas submit --platform ios --latest
```
Autentican con el mismo Apple ID (o la API Key). Detecta la app por bundle id. Esperar "Submitted" + procesamiento de Apple (~10–30 min).

Luego, en App Store Connect → **ConnectHub → TestFlight** (no pedirá Export Compliance: ya está declarado). **Internal Testing** → crear grupo → agregar testers (deben estar en *Users and Access*) → en el iPhone instalar la app **TestFlight** → instalar ConnectHub.

### 4.5 Probar el flujo del revisor (y grabar el video)
⚠️ La app tiene un **gate de código de institución** entre el login y el contenido: una cuenta nueva (incluida la de *Sign in with Apple*) cae en **Onboarding** y **no** llega a las pestañas hasta ingresar un código. El flujo completo es:

1. Login (Apple o cuenta demo).
2. **Onboarding → ingresar el código `DEMO123`** (verificado en prod).
3. Pestaña **Perfil → Eliminar cuenta → confirmar**.

Graba un video **corto** (solo *Sign in with Apple* + *Perfil → Eliminar cuenta*), exporta `.mp4`/`.mov` **< 50 MB** (el adjunto de App Review tiene ese límite).

### 4.6 Ficha + App Review Information (¡clave por el rechazo!)
- **Ficha:** screenshots iPhone 6.7" (1290×2796, mín. 1), descripción, categoría, **URL de privacidad** (`/privacy`), y completar **App Privacy** (declarar email, nombre, documento, etc.). Seleccionar el **build nuevo**.
- **App Review Information:**
  - **Cuenta demo** (email + clave) **y el código de institución `DEMO123`** — escríbelo explícito en las Notes, si no el revisor se queda en el gate.
  - **Notes** (texto sugerido):
    > *To reach the app content, sign in and enter institution code **DEMO123** on the onboarding screen. Sign in with Apple is offered on the login screen alongside Google (4.8). Account deletion is available in Profile → "Delete account" and permanently removes the user's personal data (5.1.1v). A screen recording of both flows is attached.*
  - **Adjuntar el video** (§4.5).
  - ⚠️ Eliminar la cuenta la **anonimiza**: si el revisor borra la única cuenta demo, esas credenciales dejan de servir. Ten lista una **segunda cuenta demo** o confía en el video adjunto.
- **Responder el hilo del rechazo** citando los 2 puntos + **Submit for Review**.

---

## 5. Android — Google Play

### 5.1 Crear la app en Play Console (primera vez)
Si el package `com.fourstacklabs.connecthub` **no existe aún** en Play Console: créalo (**Create app**), fija el **package name exactamente** como en `app.json` (es irreversible para esa ficha) y completa los datos iniciales.

> ⚠️ **Antes de compilar Android** hay que corregir dos restos de plantilla en `app.json` (requieren un **nuevo build**, no se arreglan en Play Console):
> - **Quitar `android.permission.RECORD_AUDIO`** si la app no graba audio (declararlo obliga a poner "Audio" en Data safety y puede gatillar revisión de permisos sensibles).
> - **Reemplazar el ícono adaptativo** (`android-icon-*`), que todavía es el de la plantilla de Expo, por el de marca.
> *(Coordinar con quien mantiene el repo; en iOS esto no aplica.)*

### 5.2 Compilar (.aab) y subir la PRIMERA versión (manual)
```bash
eas build --platform android --profile production
```
- En el **primer build**, EAS pregunta si genera el **keystore** → **sí**. Este keystore es la **clave de subida (upload key)**, no la clave de firma final: Google usa **Play App Signing** y custodia la clave de firma. **Respáldalo** (`eas credentials`) como buena práctica; si se pierde, se puede **solicitar a Google un reseteo de la upload key** (no se pierde la app).
- **La primera subida a Play DEBE ser manual:** la Play Developer API (y por tanto `eas submit`) **no puede crear el primer release** de un package nuevo. Descarga el `.aab` del link de EAS y súbelo en **Play Console → (pista de prueba o Producción) → Crear versión**.

**A partir de la 2ª versión** ya puedes automatizar con:
```bash
eas submit --platform android --latest
```
Esto requiere el **JSON de cuenta de servicio** (§0). Configúralo en `eas.json` (`submit.production.serviceAccountKeyPath` y `track`) o pásalo cuando EAS lo pida. Si no especificas `track`, EAS usa **`internal`** (no Producción) — promover a Producción es un paso aparte en Play Console.

### 5.3 Cuenta de servicio (para `eas submit`, opcional en la 1ª entrega)
Flujo real (lo hace el propietario de la cuenta): Google Cloud → crear/vincular proyecto → crear *service account* → generar **clave JSON** → en **Play Console → Setup → API access** vincular esa cuenta y **concederle permisos de release** (esperar propagación). Compartir el JSON por canal seguro.

### 5.4 Ficha y cumplimiento (Play Console)
- **Ficha:** título, descripción, ícono 512×512, gráfico destacado 1024×500, screenshots de teléfono.
- **Clasificación de contenido** (cuestionario).
- **Política de privacidad:** https://connecthub.fourstacklabs.com/privacy
- **App content → Eliminación de datos (Data deletion):** declarar **(a)** la ruta en la app (*Perfil → Eliminar cuenta*) **y (b)** la **URL web pública** de solicitud de borrado — **obligatoria**, ya disponible: **https://connecthub.fourstacklabs.com/eliminar-cuenta**
- **Seguridad de los datos (Data safety):** declarar los datos recolectados (email, nombre, documento, fotos) y que se pueden eliminar.

### 5.5 Test cerrado obligatorio (solo cuentas personales)
Si la cuenta de Play es **personal** (post 13-nov-2023): antes de habilitar Producción, corre un **test cerrado con ≥20 testers durante 14 días continuos**. Plan de tiempo real: **≥2 semanas**. Cuentas de **organización**: exentas.

### 5.6 Probar antes (rápido)
```bash
eas build --platform android --profile preview   # .apk instalable directo (QR/link de EAS)
```

---

## 6. Assets a preparar (ambas tiendas)

- [ ] **Screenshots** — iOS 6.7" (1290×2796) y teléfono Android. Mín. 2–3 por tienda.
- [ ] **Ícono** — iOS 1024 (ya en el build); Android 512×512 (ficha) + **adaptativo de marca** (pendiente, §5.1).
- [ ] **Gráfico destacado** Android 1024×500.
- [ ] **Descripción / subtítulo / palabras clave.**
- [ ] **Video** de *Sign in with Apple* + *Eliminar cuenta* (< 50 MB) para Apple Review.
- [ ] **URLs** — privacidad (`/privacy`) y **eliminación de cuenta** (`/eliminar-cuenta`).

---

## 7. Lo que YA está hecho (no repetir)

- ✅ `app.json`: bundle id, `usesAppleSignIn:true`, `supportsTablet:false`, `usesNonExemptEncryption:false`, plugins, **ícono iOS y splash de marca**.
  - ⏳ **Pendiente Android:** el **ícono adaptativo** todavía es de plantilla y `RECORD_AUDIO` sobra (§5.1) — requieren un nuevo build de Android.
- ✅ `eas.json`: perfiles con URLs de prod horneadas.
- ✅ Sign in with Apple + Eliminar cuenta implementados y verificados.
- ✅ Backend + pagos (incl. Apple) en prod.
- ✅ Páginas web de **privacidad** y **eliminación de cuenta** en línea.
- ✅ `expo-doctor` 20/20 y `tsc` limpio.

---

## 8. Checklist final

**iOS**
- [ ] `eas build:version:set` → iOS = 4 (build > 3)
- [ ] Verificar capacidad "Sign in with Apple" en el App ID
- [ ] `eas build --platform ios --profile production` OK
- [ ] `eas submit --platform ios --latest` → TestFlight
- [ ] Probado en iPhone (login → **DEMO123** → Perfil → eliminar) + **video < 50 MB**
- [ ] Ficha + build seleccionado + URL privacidad + App Privacy
- [ ] App Review: **cuenta demo + código DEMO123** + notas + video (+ 2ª cuenta demo de respaldo)
- [ ] Responder el hilo del rechazo + **Submit for Review**

**Android**
- [ ] App creada en Play Console con el package exacto
- [ ] (Pre-build) quitar `RECORD_AUDIO` + ícono adaptativo de marca
- [ ] `eas build --platform android --profile production` OK (keystore respaldado; es upload key)
- [ ] **Primera versión: subir el `.aab` MANUALMENTE** en Play Console
- [ ] Data safety + **App content → Data deletion** con URL `/eliminar-cuenta` + clasificación
- [ ] (Cuenta personal) test cerrado 20 testers / 14 días
- [ ] Crear versión de Producción → revisar → publicar
- [ ] (2ª versión en adelante) `eas submit --platform android --latest` con service account

---

## 9. Problemas comunes

- **`npx eas ...` → "could not determine executable to run"**: el paquete es **`eas-cli`**. Usa `npm install -g eas-cli` + `eas ...`, o `npx eas-cli ...`. `npx eas` a secas **no** funciona.
- **`npm install` muestra "N vulnerabilities"**: ruido de dependencias de desarrollo. **No** correr `npm audit fix --force`.
- **`eas submit --platform android` falla en la primera entrega**: normal — la 1ª subida es manual (§5.2).
- **Apple rechaza el build por número**: no fijaste el build number > 3 (§4.2).
- **El revisor de Apple no llega a "Eliminar cuenta"**: falta el código `DEMO123` en las notas (§4.6).
- **`eas whoami` sin sesión**: `eas login`.
- **Detalle adicional de publicación:** ver también [publicar-tiendas.md](publicar-tiendas.md).
