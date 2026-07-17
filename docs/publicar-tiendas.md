# Publicar ConnectHub en las tiendas (App Store + Google Play)

> Guía paso a paso para compilar con EAS y subir la app **ConnectHub** (Expo SDK 57) a la **App Store (iOS)** y **Google Play (Android)**. Bundle id / package: `com.fourstacklabs.connecthub`.

---

## 0. Contexto — resubmisión tras el rechazo de Apple

La app ya existe en App Store Connect (fue revisada como **1.0 (3)** y rechazada por 2 puntos). **Ambos ya están resueltos en el código:**

| Guideline | Qué pedían | Estado |
|---|---|---|
| **4.8** Login Services | Ofrecer **Sign in with Apple** junto a Google | ✅ Implementado (botón oficial en el login, solo iOS) |
| **5.1.1(v)** Data Collection | Permitir **eliminar la cuenta** desde la app | ✅ Implementado (Perfil → Eliminar cuenta) |

Entonces NO hay que crear la app de cero: hay que **subir un build nuevo** (número mayor) y **responder al App Review** con la nota + grabación.

---

## 1. Prerrequisitos (una sola vez)

| Requisito | Detalle |
|---|---|
| **Cuenta Apple Developer** | US$99/año — ya la tienes. |
| **Cuenta Google Play Developer** | US$25 pago único (para Android). |
| **Cuenta Expo** (gratis) | Para EAS Build. Crear en [expo.dev](https://expo.dev). |
| **EAS CLI** | El paquete es **`eas-cli`** (¡no `eas`!). Instálalo global una vez: `npm install -g eas-cli` → luego usa `eas ...`. (Alternativa sin instalar: `npx eas-cli ...`.) ⚠️ `npx eas ...` **falla** con *"could not determine executable to run"* porque `eas` es otro paquete. |
| **Node** | El portátil del proyecto (`~/nodejs`). |

**Backend ya listo** (no tocar): la plataforma corre en `https://connecthub.fourstacklabs.com`, con los secretos de auth configurados. El `eas.json` ya apunta los builds a prod.

---

## 2. Pre-vuelo (antes de compilar)

```bash
cd C:\proyectos\CONNECT-HUB\apps\mobile
npm install -g eas-cli     # instala la CLI (una sola vez). El paquete es eas-cli, NO eas.
eas login                  # inicia sesión con tu cuenta Expo (expo.dev, no Apple)
eas init                   # vincula el proyecto a tu cuenta (crea projectId en app.json)
npx expo-doctor            # revisa que la config esté sana (opcional pero recomendado)
```

> Si prefieres no instalar nada global, antepón `npx eas-cli` a cada comando (`npx eas-cli login`, `npx eas-cli build ...`). Lo que NO funciona es `npx eas` a secas.

> El `eas.json` ya tiene el perfil `production` con las URLs de prod horneadas (`EXPO_PUBLIC_API_URL=https://connecthub.fourstacklabs.com/api`, etc.). No hace falta tocar nada.

---

## 3. iOS — App Store

### 3.1 Capacidad "Sign in with Apple"
El App ID `com.fourstacklabs.connecthub` debe tener habilitada la capacidad **Sign in with Apple**. **EAS lo configura solo** durante el primer build de producción (cuando detecta `usesAppleSignIn: true` en `app.json`). Si prefieres verificar a mano: Apple Developer → Certificates, IDs & Profiles → Identifiers → tu App ID → marcar **Sign In with Apple** → Save.

### 3.2 Compilar el binario (.ipa)
```bash
eas build -p ios --profile production
```
Durante el build, EAS te pedirá:
- **Login de Apple** (o una App Store Connect API Key).
- Generar/gestionar **certificados y perfiles de aprovisionamiento** → deja que EAS los maneje (dile "yes").
- El **build number** se incrementa solo (autoIncrement en `eas.json`) → será mayor al (3) rechazado.

Al terminar (~15–25 min) te da un link al build. Descarga el `.ipa` si quieres (30 días de retención) o pasa directo al submit.

### 3.3 Subir a App Store Connect / TestFlight
```bash
eas submit -p ios
```
Sube el `.ipa` a **App Store Connect**. Tras ~10–30 min de procesamiento, el build aparece en **TestFlight** y disponible para seleccionar en la versión.

> Alternativa manual: descargar el `.ipa` y subirlo con la app **Transporter** (Mac App Store).

### 3.4 Probar en tu iPhone antes de enviar (recomendado)
- **TestFlight:** en App Store Connect → tu app → TestFlight → agrégate como *tester interno* → instala TestFlight en el iPhone → instala la app. (No requiere registrar el UDID.)
- **Prueba clave:** entrar con **Apple**, y **Perfil → Eliminar cuenta** (para grabar el video que pide Apple).

### 3.5 Preparar la ficha (App Store Connect → tu app → versión 1.0)
- **Screenshots** iPhone 6.7" (1290 × 2796) — mínimo 1, recomendable 3–5.
- **Ícono** 1024 × 1024 (sin transparencia).
- **Descripción, subtítulo, palabras clave, categoría.**
- **URL de política de privacidad** (obligatoria — ver §5).
- **App Privacy**: completar el cuestionario de datos (recolectas email, nombre, etc. — declararlo).
- **Selecciona el build nuevo** (el que subiste) para la versión.

### 3.6 App Review Information (¡lo más importante para tu rechazo!)
En **App Review Information** de la versión:
- **Cuenta demo** para el revisor (email + clave de un usuario de prueba con acceso a un evento).
- **Notes** con este texto (adáptalo):
  > *Sign in with Apple is now offered on the login screen alongside Google (4.8). Account deletion is available in Profile → "Delete account", which permanently removes the user's personal data (5.1.1v). A screen recording of both is attached.*
- **Adjunta la grabación** (video) que muestre: crear/iniciar sesión con **Apple** → ir a **Perfil → Eliminar cuenta** → flujo completo hasta la confirmación.

### 3.7 Responder al rechazo y reenviar
- En el **App Store Connect → App Review** (el hilo del rechazo), **responde** citando los 2 puntos y que ya están resueltos (mismo texto de arriba).
- **Submit for Review** con el build nuevo seleccionado.

---

## 4. Android — Google Play

### 4.1 Compilar el bundle (.aab)
```bash
eas build -p android --profile production
```
- En el **primer build**, EAS te pregunta si genera el **keystore** → dile **sí** (lo guarda EAS). ⚠️ **Respáldalo** (`eas credentials`), lo necesitas para TODAS las actualizaciones futuras.
- Genera un `.aab` (app bundle) para Play.

### 4.2 Subir a Google Play
```bash
eas submit -p android
```
Requiere un **JSON de cuenta de servicio** de Google Play (Play Console → Setup → API access). Alternativa: descargar el `.aab` y subirlo manual en **Play Console → Producción → Crear versión**.

### 4.3 Ficha de Play Console
- Ficha de tienda: título, descripción, ícono (512×512), gráfico destacado (1024×500), screenshots.
- **Clasificación de contenido** (cuestionario).
- **Seguridad de los datos** (Data safety): declarar los datos que recolectas + **cómo se eliminan** (Google también exige método de eliminación de cuenta — el de la app lo cumple; indica el flujo o una URL de solicitud).
- **Política de privacidad** (obligatoria, ver §5).

### 4.4 Probar antes (opcional, más rápido que subir a producción)
```bash
eas build -p android --profile preview   # genera un .apk instalable
```
El link/QR de EAS lo instalas directo en el teléfono Android.

---

## 5. Assets que debes preparar (ambas tiendas)

- [ ] **Ícono** 1024×1024 (iOS) y 512×512 (Android) — ya tienes `icon.png`, verifica tamaños.
- [ ] **Screenshots**: iOS 6.7" (1290×2796); Android teléfono. Mínimo 2–3 por tienda.
- [ ] **URL de política de privacidad** — OBLIGATORIA en ambas. Como recolectas email/nombre y usas Sign in with Apple, debe existir. Puede ser una página simple en tu dominio (ej. `connecthub.fourstacklabs.com/privacy`).
- [ ] **URL de soporte** (email o página).
- [ ] **Descripción, subtítulo/promo, palabras clave.**
- [ ] **Video de Eliminar cuenta** (para Apple Review).

---

## 6. Lo que YA está hecho (no repetir)

- ✅ `app.json`: bundle id/package, `usesAppleSignIn: true`, plugin `expo-apple-authentication`, versión 1.0.0.
- ✅ `eas.json`: perfil `production` (iOS Release / Android app-bundle) con URLs de prod.
- ✅ Backend + Sign in with Apple + Eliminar cuenta desplegados y verificados en prod.
- ✅ Toda la app compila limpio (`tsc`).

## 7. Solo para el PAGO con Apple (no bloquea la revisión)
Para que un usuario que entra con **Apple** pueda **pagar** eventos, el servicio externo **Evento-back** debe desplegar el endpoint `/auth/register-apple` (PR `feat/apple-signin`) + setear `APPLE_CLIENT_IDS`. Sin esto la app **igual pasa la revisión** (el login con Apple funciona por respaldo nativo); solo el checkout de pago para usuarios Apple se activa cuando eso esté arriba.

---

## 8. Checklist final antes de "Submit"

**iOS**
- [ ] `eas build -p ios --profile production` OK (build number > 3)
- [ ] `eas submit -p ios` → build en TestFlight
- [ ] Probado en iPhone (Apple sign-in + eliminar cuenta)
- [ ] Ficha completa + build seleccionado + política de privacidad
- [ ] App Review Information: cuenta demo + notas + **video**
- [ ] Responder el hilo del rechazo + Submit for Review

**Android**
- [ ] `eas build -p android --profile production` OK (keystore respaldado)
- [ ] `eas submit -p android` o subida manual del `.aab`
- [ ] Data safety + clasificación + política de privacidad
- [ ] Crear versión de Producción → revisar → publicar
