# 🚀 Runbook — ConnectHub Android 1.0.1 (arreglo de Google Sign-In + Push)

Ultima actualizacion: 2026-07-19

> **Para que es esto.** El build en revision (versionCode 2 / 1.0.0) sale con dos fallos
> **solo de Android** que **no bloquean el uso** (email/clave y Apple funcionan) pero degradan la
> experiencia. Este documento deja **todo listo** para que, en cuanto Google apruebe la 1.0.0,
> publicar la 1.0.1 sea casi mecanico.
>
> **NO ejecutes nada de esto hasta que Google apruebe la 1.0.0.** Mientras la 1.0.0 este "en
> revision", no subas otra version: reiniciarias el reloj de revision.

---

## 0. Los dos bugs (resumen)

| # | Bug | Causa raiz (verificada) | Efecto en el usuario |
|---|---|---|---|
| 1 | **Google Sign-In roto** | `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` = `ma8ee…`, que es el client OAuth de la app Ionic **vieja** (`com.quadratech.connecthub`). El paquete real es `com.fourstacklabs.connecthub` firmado con la App Signing key de Google → no coinciden. | El boton "Entrar con Google" falla (`DEVELOPER_ERROR`). Email/Apple si funcionan. |
| 2 | **Push no llega en Android** | Falta la config de FCM: no hay `google-services.json` ni `android.googleServicesFile` en `app.json`, y no hay clave FCM V1 subida a EAS. Expo SDK 57 exige ambas. | El dispositivo Android no registra token → no recibe notificaciones. |

Los dos necesitan **recompilar** (los `EXPO_PUBLIC_*` se hornean en el binario). Se arreglan **en un solo build**.

---

## 1. Prerrequisitos — accesos que HOY estan bloqueados

Sin esto no se puede completar. Conseguirlos mientras Google revisa:

- [ ] **Acceso al proyecto Google Cloud `338617760077`** ("pagos"), con la cuenta **dueña** de ese
      proyecto. La cuenta del navegador (`developer@quadratechsa.com`) **no** lo tiene
      (falta `resourcemanager.projects.get`). Aqui viven los client IDs web/iOS que el backend ya
      acepta, por eso el nuevo client Android debe crearse **en este mismo proyecto** (no en uno nuevo).
- [ ] **Consola de Firebase** con permiso de editor sobre ese mismo proyecto (Firebase y Google Cloud
      comparten proyecto). Se entra en <https://console.firebase.google.com> y se elige el proyecto
      `338617760077`. Si el proyecto aun no esta "vinculado a Firebase", el owner lo vincula una vez.
- [ ] **Sesion de EAS** ya la tienes: cuenta `alcivator` (Owner). Verifica con `eas whoami`.

> **Por que en el proyecto 338617760077 y no en uno nuevo:** el backend valida el `id_token` de Google
> contra una lista de audiencias (`GOOGLE_CLIENT_IDS` en `.env`). Si el client Android nace en otro
> proyecto, su audiencia no estara en esa lista y el login fallaria del lado servidor aunque Google lo
> acepte. Manten todo en `338617760077`.

---

## 2. Datos exactos que vas a necesitar (copia-pega)

| Dato | Valor |
|---|---|
| Package / applicationId Android | `com.fourstacklabs.connecthub` |
| **SHA-1 de la App Signing key** (el que valida Google) | `27:B4:F1:89:9C:11:7F:91:F9:48:CD:50:2A:0C:D3:A9:28:7D:D5:2F` |
| SHA-1 de la upload key (opcional, para builds `preview`) | `50:6A:79:AB:71:C1:B1:4D:15:27:FE:EB:8A:22:D7:66:0D:2A:73:34` |
| Proyecto Google Cloud / Firebase | `338617760077` |
| Client viejo Ionic — **NO tocar** | `338617760077-ma8eeeis1481u486m00q3tovkjv43huu.apps.googleusercontent.com` |
| Client Web (audiencia principal, ya correcto) | `338617760077-ncr1fcr5sosegoevnjhns4rrskvamjuo.apps.googleusercontent.com` |

> El SHA-1 de la App Signing key se re-lee cuando quieras en:
> Play Console → **Protegido con Play** → *Proteccion de Play Store* → **Administrar la firma de apps de Play** (ruta `/keymanagement`).

---

## 3. Montaje en Firebase + Google Cloud (arregla los DOS bugs de una)

### 3.1 Firebase → app Android (genera google-services.json y, de paso, el client OAuth)

1. <https://console.firebase.google.com> → proyecto **`338617760077`** (vincularlo a Firebase si hace falta).
2. **Agregar app → Android.**
   - Nombre del paquete: **`com.fourstacklabs.connecthub`**
   - Huella SHA-1: **`27:B4:F1:89:…:D5:2F`** (la de App Signing). Anade tambien la de la upload key si vas a probar builds `preview`.
3. **Descarga `google-services.json`.**
4. Comprueba en el JSON que aparece un `client_id` de tipo 3 (Android). Firebase suele crear el
   **client OAuth Android** automaticamente en el proyecto Cloud. Si no aparece, crealo a mano (paso 3.2).

### 3.2 (Solo si Firebase no lo creo) Client OAuth Android manual

Google Cloud Console → proyecto `338617760077` → **APIs y servicios → Credenciales** →
**Crear credenciales → ID de cliente de OAuth → Android**:
- Nombre del paquete: `com.fourstacklabs.connecthub`
- SHA-1: `27:B4:F1:89:…:D5:2F`
- **No borres ni edites** el client `ma8ee…` (sigue sirviendo a la app vieja).

Copia el **nuevo client ID** resultante → lo usaras en el paso 4.2.
Formato: `338617760077-XXXXXXXX.apps.googleusercontent.com`.

### 3.3 Sube la clave FCM V1 a EAS (para que el server pueda ENVIAR push)

1. Firebase → **Configuracion del proyecto → Cuentas de servicio → Generar nueva clave privada** → descarga el JSON.
2. En `apps/mobile`:
   ```bash
   eas credentials -p android
   # elegir: production → Google Service Account → FCM V1 → subir el JSON descargado
   ```
   (o subelo desde el dashboard de EAS: Project → Credentials → Android → FCM V1).
3. **Guarda esa clave privada en el respaldo** `C:\proyectos\CONNECTHUB-RESPALDO\firma-nativa\` — NUNCA al repo.

---

## 4. Cambios en el codigo (exactos)

> Estos NO se han pre-aplicado a proposito: pondrian el build a apuntar a un `google-services.json`
> inexistente y romperian tanto el build como el `expo start` local. Aplicalos recien tengas los 2 valores.

### 4.1 Coloca el google-services.json

Copia el archivo descargado a: **`apps/mobile/google-services.json`**
(ya esta en `.gitignore` — NO se versiona; respaldalo en `CONNECTHUB-RESPALDO`).

### 4.2 `apps/mobile/app.json`

- Sube la version:
  ```diff
  -    "version": "1.0.0",
  +    "version": "1.0.1",
  ```
- Dentro del bloque `"android": { … }`, anade la referencia al archivo FCM:
  ```diff
       "android": {
         "package": "com.fourstacklabs.connecthub",
  +      "googleServicesFile": "./google-services.json",
         "adaptiveIcon": { … }
  ```
  (el versionCode NO se toca: `appVersionSource:"remote"` + `autoIncrement` lo sube EAS a 3).

### 4.3 `apps/mobile/eas.json` — reemplaza el client Android en LOS DOS perfiles

Sustituye el `ma8ee…` por el **nuevo** client ID en `build.preview.env` **y** `build.production.env`:
```diff
-        "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID": "338617760077-ma8eeeis1481u486m00q3tovkjv43huu.apps.googleusercontent.com"
+        "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID": "338617760077-<NUEVO_CLIENT_ANDROID>.apps.googleusercontent.com"
```

### 4.4 `apps/mobile/.env` (dev local)

Actualiza la misma variable con el nuevo client ID, para que `expo start` en Android tambien funcione.

### 4.5 (Recomendado) verifica el client iOS

De paso, confirma en Cloud que `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (`…-2kdidcrko…`) esta atado al
bundle `com.fourstacklabs.connecthub`. Si no, arreglalo igual — no se ha verificado.

---

## 5. Build y verificacion local

```bash
cd apps/mobile
npx tsc --noEmit          # typecheck en verde
npx expo-doctor           # sanity de config nativa
eas build -p android --profile production   # genera el .aab versionCode 3
```

> Opcional recomendado: antes del build de produccion, un build `preview` (APK) instalable en tu
> telefono para **probar de verdad** el boton de Google y una push, ya que la aprobacion de Google
> NO valida ninguno de los dos:
> ```bash
> eas build -p android --profile preview
> ```

---

## 6. Publicar la 1.0.1 en Google Play (el "solo subir el cambio")

> Este es el unico paso que ya no tiene bloqueos una vez hecho lo anterior.

1. Play Console → app **ConnectHub+** (`com.fourstacklabs.connecthub`) → **Produccion → Crear version nueva**.
2. **Sube el nuevo `.aab`** (versionCode 3) — manual, por el dialogo de Windows (yo no puedo operar ese cuadro ni subir archivos > 10 MB).
3. Notas de la version (en-US), por ejemplo:
   `Fixes Google sign-in and push notifications on Android.`
4. Paises/regiones: ya estan los 177, no se tocan.
5. **Enviar a revision.** Como la publicacion administrada esta desactivada, al aprobar se publica sola
   y los usuarios de 1.0.0 se actualizan automaticamente.

---

## 7. Verificacion post-publicacion (imprescindible)

La aprobacion de Google NO prueba esto — hay que hacerlo a mano con la app **descargada de Play**:

- [ ] Instalar ConnectHub+ desde Google Play en un telefono Android real.
- [ ] Pulsar **"Entrar con Google"** → debe completar el login (ya no `DEVELOPER_ERROR`).
- [ ] Crear un evento desde el panel → el dispositivo Android debe **recibir la push**.
- [ ] Revisar `adb logcat | grep push` — ya NO debe salir el warning `[push] no se pudo registrar el token`
      (ese warning lo anadi en el commit `afd52f2` justo para detectar este fallo).

---

## 8. Checklist maestro

```
Mientras Google revisa la 1.0.0:
  [ ] Conseguir acceso al proyecto Cloud/Firebase 338617760077 (cuenta owner)
  [ ] Firebase: app Android com.fourstacklabs.connecthub + SHA-1 27:B4:...:2F
  [ ] Descargar google-services.json  → apps/mobile/ + respaldo
  [ ] Confirmar/crear client OAuth Android en 338617760077 (NO tocar ma8ee…)
  [ ] eas credentials -p android → subir clave FCM V1
Cuando Google APRUEBE la 1.0.0:
  [ ] app.json: version 1.0.1 + android.googleServicesFile
  [ ] eas.json: nuevo client Android en preview y production
  [ ] apps/mobile/.env: nuevo client Android
  [ ] tsc --noEmit + expo-doctor en verde
  [ ] (opcional) build preview y probar Google + push en un telefono
  [ ] eas build -p android --profile production   (→ versionCode 3)
  [ ] Play Console → Produccion → subir .aab → enviar a revision
  [ ] Tras aprobar: verificacion §7 en un telefono real
```

---

## 9. Nota de alcance

- Esto es **solo Android**. iOS no tiene ninguno de los dos bugs (Apple usa APNs via EAS, y el login
  principal de iOS es Apple/email).
- No confundir las dos claves de firma Android: la **upload key** (`50:6A:…`) NO sirve para OAuth;
  usa siempre la **App Signing key** (`27:B4:…`). Detalle en `06-tiendas-ios-android.md` §9.1.
