# App móvil (Expo / React Native)

Última actualización: 2026-07-19

Documento de referencia de `apps/mobile` — la app de asistentes de **ConnectHub+** (Expo SDK 57 / React Native 0.86 / React 19). Cubre estructura, mapa de pantallas, autenticación, funcionalidades, i18n, configuración nativa y el procedimiento completo de build y envío a tiendas.

> Regla del handbook: aquí **no se escribe ningún valor secreto**. Solo nombres de variables, dónde viven y cómo se restauran.

---

## 1. Identidad del proyecto

| Dato | Valor |
|---|---|
| Ruta local | `C:/proyectos/CONNECT-HUB/apps/mobile` |
| Nombre interno / slug Expo | `ConnectHub` / `connecthub` |
| Nombre en tiendas | **ConnectHub+** |
| Versión | `1.0.0` (campo `expo.version` en `app.json`) |
| Bundle iOS | `com.fourstacklabs.connecthub` |
| Package Android | `com.fourstacklabs.connecthub` |
| Scheme (deep links) | `connecthub://` |
| Cuenta EAS (owner) | `alcivator` |
| EAS projectId | `2a694ac0-ff07-434e-96ee-e508e498facb` |
| SDK | Expo `~57.0.7`, React Native `0.86.0`, React `19.2.3` |
| TypeScript | `~6.0.3`, `strict: true` |

Archivos raíz relevantes: `app.json`, `eas.json`, `package.json`, `metro.config.js`, `tsconfig.json`, `.env.example`, `.env` (local, ignorado por git), `AGENTS.md`, `CLAUDE.md`.

> `AGENTS.md` contiene una nota importante: *"Expo HAS CHANGED — lee los docs versionados de https://docs.expo.dev/versions/v57.0.0/ antes de escribir código"*. La API de SDK 57 no coincide con la de SDK 50/51.

---

## 2. Puesta en marcha desde cero (PC recién formateada)

```bash
# 1) Node portable del proyecto (o Node 22 LTS del sistema)
#    En este equipo: ~/nodejs/node-v22.23.1-win-x64

# 2) Dependencias
cd C:\proyectos\CONNECT-HUB\apps\mobile
npm install

# 3) Variables locales (solo para correr en dev; los builds de tienda usan eas.json)
cp .env.example .env
#    OJO: .env.example apunta a PRODUCCIÓN. Para desarrollar contra el contenedor
#    local hay que cambiar a mano:  EXPO_PUBLIC_API_URL=http://localhost:4000
#    (así está el .env de este equipo; el resto de variables sí coinciden).

# 4) Arrancar Metro en el puerto 8100 (fijo por el redirect de Google OAuth en web)
npm start          # = expo start --port 8100
npm run web        # = expo start --web --port 8100
```

Scripts de `package.json`:

| Script | Comando real | Uso |
|---|---|---|
| `start` | `expo start --port 8100` | Metro (dev client / Expo Go) |
| `web` | `expo start --web --port 8100` | Verificación rápida en navegador |
| `android` | `expo start --android` | Abre en emulador/dispositivo Android |
| `ios` | `expo start --ios` | Abre en simulador iOS (requiere macOS) |
| `lint` | `expo lint` | Lint |
| `reset-project` | `node ./scripts/reset-project.js` | Script del template de Expo (**no usar**, borra el código) |

> **El puerto 8100 no es decorativo.** El client ID web de Google tiene autorizado `http://localhost:8100/auth` como redirect URI. Si arrancas en otro puerto, Google Sign-In en web falla.

### Monorepo "blando" y Metro

`metro.config.js` no usa workspaces de npm: resuelve módulos **solo** desde `apps/mobile/node_modules` (evita hoisting) y añade un alias manual para el paquete de tipos compartidos:

- `watchFolders`: el propio proyecto + `packages/`.
- `resolver.extraNodeModules['@connecthub/shared-types']` → `packages/shared-types` (su `main` apunta al TS fuente `src/index.ts`).
- Transformer de SVG (`react-native-svg-transformer`): los `.svg` se importan como componentes React (`import LogoMark from '@/assets/logo-mark.svg'`). `svg` sale de `assetExts` y entra en `sourceExts`.

Alias de `tsconfig.json`: `@/*` → `./src/*`, `@/assets/*` → `./assets/*`, `@connecthub/shared-types` → `../../packages/shared-types/src/index.ts`.

---

## 3. Estructura de carpetas

Todo el código vive bajo `src/` (expo-router detecta `src/app` automáticamente; **no hay carpeta `app/` en la raíz**).

```
apps/mobile/
├─ app.json              config Expo (nativo, plugins, iconos, permisos)
├─ eas.json              perfiles de build EAS + envs EXPO_PUBLIC_*
├─ metro.config.js       monorepo blando + SVG transformer
├─ assets/
│  ├─ images/            icon.png, splash-icon.png, favicon.png,
│  │                     android-icon-{foreground,background,monochrome}.png,
│  │                     tabIcons/, logo-glow.png, tutorial-web.png
│  └─ logo-icon.svg, logo-mark.svg, logo-wordmark.svg   (importados como componentes)
└─ src/
   ├─ app/               RUTAS (expo-router, file-based)
   ├─ api/               capa HTTP tipada + hooks de TanStack Query
   ├─ design-system/     tokens, temas, componentes base
   ├─ features/          lógica agrupada por dominio (auth, eventos, agenda, pagos, notifications)
   ├─ i18n/              diccionarios EN/ES/FR/PT + provider
   ├─ lib/               utilidades (fechas, almacenamiento de tokens, AppState)
   ├─ store/             estado global Zustand (auth, institución, agenda, ajustes)
   ├─ global.css         estilos para el target web
   └─ svg.d.ts           tipos de los .svg importados
```

### 3.1 `src/api` — capa de red

| Archivo | Qué contiene |
|---|---|
| `client.ts` | Cliente HTTP de la API pública ConnectHub. `API_BASE` desde `EXPO_PUBLIC_API_URL`. Helpers `apiGet/apiPost/apiPatch/apiDelete/apiUpload/apiUploadFile`. Clase `ApiError` (status + body) y `errorCode()` para leer `code` de los 409. Patrón **holder**: el cliente no importa el store (evita ciclos); el store le inyecta el token con `setAccessToken()` y el handler de refresh con `setRefreshHandler()` (`getAccessToken()` lo expone de vuelta). Ante **401 en ruta autenticada** hace refresh **una vez** y reintenta — también en `apiUpload`/`apiUploadFile`. `absoluteUrl()` convierte rutas relativas del API (logos, fotos) en URLs absolutas. |
| `auth.ts` | Endpoints `/public/auth/*`: `register`, `login`, `google`, `apple`, `verify`, `resend-verification`, `refresh`, `pagos-exchange`, `me`, `onboarding`, `forgot`, `reset`, y `DELETE /public/auth/me` (eliminar cuenta). |
| `pagos-session.ts` | Sesión contra el **servicio de pagos externo** (`api-ligaprocorp`). Login email/clave (clave hasheada con **SHA-256 hex** vía `expo-crypto`), Google y Apple. Refresh **single-flight** (N peticiones con 401 comparten una sola llamada a `/auth/refresh`). Tokens en SecureStore con claves `ch.pagos.token` / `ch.pagos.refresh`. `pagosUrl()` evita el `/api/api` duplicado. |
| `pagos.ts` | Dos grupos. **(a) Contra ConnectHub** (`/public/pagos/*`): `useResumenPago` → `GET /resumen/{id}`, `validarCupon` → `POST /cupon/{idEvento}`, `useTarjetas`/`agregarTarjeta`/`eliminarTarjeta` → `GET`/`POST`/`DELETE /tarjetas`, `enviarConfirmacionCorreo` → `POST /confirmacion-email`, y tres **heredados del flujo anterior y hoy sin uso en la UI**: `pagarDirecto` (`POST /debito`), `crearCheckout` (`POST /checkout`, Link to Pay) y `estadoPago` (`GET /estado/{referencia}`). **(b) Contra el servicio externo**: el **Checkout Paymentez** (`/evento-usuario/eventos/{id}/checkout` y `/checkout/confirmar`). `pagosPost()` reintenta una vez tras refresh; **nunca** manda el token de ConnectHub al servicio externo (⚠️ el JSDoc de `pagosPost` todavía dice lo contrario — está desactualizado, el código no hace ese fallback). |
| `catalogo.ts` | Instituciones (`resolver`, `vincular`, `mias`) y eventos (`destacados`, listado paginado, detalle, feed agregado `mis-eventos`). Hooks `useDestacados`, `useEventos`, `useEvento`, `useMisEventos`, `useMisInstituciones`. `PAGE_SIZE = 12`. |
| `entradas.ts` | Inscripción, `mis-entradas`, QR de entrada, certificado por código. Tipo `ParentRequired` para el 409 de workshops. |
| `comunidad.ts` | Muro por evento: `mis-comunidades`, feed, miembros, publicar, salir, ingresar. |
| `chats.ts` | Chats privados 1-a-1: listar, mensajes, abrir chat, enviar. |
| `conexiones.ts` | Solicitudes de conexión y lista de conexiones (networking). |
| `perfil.ts` | `GET /public/perfil/me`, `PATCH` de perfil, perfil público de otro asistente y **subida de foto** (web: Blob + `FormData`; nativo: `expo-file-system` `uploadAsync`, porque `fetch`+`FormData` con `{uri}` falla con *"Network request failed"* en la nueva arquitectura de RN). |
| `push.ts` | `POST /public/push/registrar` con el Expo push token. |

### 3.2 `src/store` — Zustand

| Store | Persistencia | Contenido |
|---|---|---|
| `auth.ts` | Tokens en SecureStore (**no** en el store persistido) | `user`, `refreshToken`, `status: 'idle'\|'authed'`, `bootstrapped`. Acciones: `bootstrap`, `register`, `login`, `google`, `apple`, `logout`, `deleteAccount`, `refresh`, `setUser`. |
| `institucion.ts` | AsyncStorage, clave `ch.institucion` | `institucion` (primaria; si es `null` → onboarding) y `filtro` (id de institución o `null` = "Todas"). Bandera `hydrated`. |
| `agenda.ts` | AsyncStorage, clave `ch.agenda` | Eventos "guardados" localmente (`SavedEvent`): id, título, portada, fechas, precio. Toggle desde el botón de marcador. |
| `settings.ts` | AsyncStorage, clave `ch.settings` | `lang` (default `'en'`) y `tema` (`'system'\|'light'\|'dark'`, default **`'dark'`**). |

### 3.3 `src/design-system`

| Archivo | Qué expone |
|---|---|
| `tokens.ts` | `palette` (marca morada `brand600 = #7E00DD`, escala brand50–900, violet/cyan/pink, neutros slate, verdes/ámbar/rojo), `spacing` (xs 4 → 4xl 64), `radius` (sm 8 → full 999), `fontSize` (xs 12 → 4xl 42), `fontWeight`, `shadow.card` / `shadow.floating`. |
| `theme.ts` | `lightTheme` / `darkTheme` con roles semánticos (`bg`, `bgElevated`, `surface`, `surfaceAlt`, `card`, `border`, `text`, `textMuted`, `textFaint`, `brand`, `brandSoft`, `brandText`, `onBrand`, `success`, `warning`, `danger`, `overlay`). Hooks `useThemeMode()` (resuelve preferencia vs. sistema) y `useTheme()`. |
| `components.tsx` | `Screen`, `AppText` (variantes `display`/`title`/`subtitle`/`body`/`bodyStrong`/`caption`/`label`), `Card`, `Chip`, `Button` (`primary`/`secondary`/`ghost`, estados loading/disabled), `Skeleton`. |
| `confirm.tsx` | `ConfirmProvider` + `useConfirm()` — diálogo propio con promesa. **Se usa en lugar de `Alert.alert`** donde importa web (Alert es no-op en web). |
| `avatar.tsx` | `Avatar` (foto o inicial sobre color de marca). |
| `image-viewer.tsx` | `ImageViewer` — visor a pantalla completa para ampliar portadas y fotos de expositores. |

### 3.4 `src/features`

| Archivo | Qué hace |
|---|---|
| `auth/useGoogleAuth.ts` | Hook de Google Sign-In con `expo-auth-session`. Flujo **híbrido implícito** (`responseType: 'id_token token'`), `usePKCE: false` y `nonce` manual. `available` es false si no hay ningún client ID configurado (el botón sale deshabilitado). |
| `auth/LoginHero.tsx` | Hero animado del login (logo, ondas, diamantes flotando) con Reanimated. |
| `eventos/cards.tsx` | `EventCard`, `FeaturedCard` (memoizadas) y `SaveButton` (guardar en agenda local). |
| `agenda/AgendaCalendario.tsx` | `AgendaCalendario` (grilla mensual empezando en lunes, 42 celdas, navegación de mes, día seleccionado) y `EntradaCard`. |
| `pagos/checkout-shared.ts` | `SDK_URL` del Checkout Paymentez **fijado** a `payment_checkout_3.0.0.min.js`, tipos `CheckoutWidgetResult` / `PaymentCheckoutResponse` y `mapResponse()` (éxito si `status === 'success'` **o** `status_detail === 3`). |
| `pagos/checkout-widget.tsx` | Widget **nativo**: hospeda el SDK oficial en un `WebView` dentro de la app y puentea `onResponse` con `postMessage`. `source` memoizado (si cambia su identidad, el WebView recarga y reinicia el modal **en pleno cobro**). Padding con insets reales porque `SafeAreaView` dentro de `<Modal>` devuelve 0. |
| `pagos/checkout-widget.web.tsx` | Misma interfaz para el target web (inyecta el script del SDK en el documento). |
| `notifications/usePushRegistration.ts` | Registra el Expo push token cuando hay sesión. Solo nativo y solo en dispositivo real (`Device.isDevice`). Pide permisos, obtiene el token con el `projectId` de EAS y llama `POST /public/push/registrar`. Falla en silencio. También fija el `setNotificationHandler` para mostrar la notificación en primer plano. |

### 3.5 `src/lib`

| Archivo | Qué hace |
|---|---|
| `tokenStorage.ts` | Almacenamiento **platform-aware**: `expo-secure-store` (keychain/keystore) en nativo, `localStorage` en web. Claves `ch.asist.access` y `ch.asist.refresh`. Expone además helpers genéricos (`setStoredItem`/`getStoredItem`/`removeStoredItem`) que usa la sesión de pagos. |
| `fecha.ts` | Formateo de fechas `YYYY-MM-DD` **sin zona horaria** (se tratan como locales del evento): `todayKey`, `keyOf`, `monthOf`, `monthLabel`, `weekdayHeadersMon`, `monthCells` (42 celdas), `shortDate`, `weekday`, `dayNum`, `resumenDias`, `year`. Meses y días traducidos a EN/ES/FR/PT. |
| `app-active.ts` | `useAppActive()` — `true` mientras la app está en primer plano. Se usa para **pausar animaciones infinitas de Reanimated** al ir a segundo plano; sin esto la nueva arquitectura de RN puede congelar la UI al desbloquear el teléfono. |

---

## 4. Mapa de pantallas y navegación

### 4.1 Layout raíz — `src/app/_layout.tsx`

Envuelve toda la app, de fuera hacia dentro:

```
GestureHandlerRootView
└─ SafeAreaProvider
   └─ QueryClientProvider   (retry: 1, staleTime 60s, sin refetchOnWindowFocus)
      └─ I18nProvider
         └─ ConfirmProvider
            └─ StatusBar + Stack (headerShown: false, animación slide_from_right)
```

Responsabilidades adicionales del layout raíz:

- Llama `bootstrap()` del store de auth al montar.
- Oculta el splash (`SplashScreen.hideAsync`) cuando el store de institución está hidratado (`preventAutoHideAsync` se llama a nivel de módulo).
- Monta `usePushRegistration()`.
- **Guardia global de sesión**: si `bootstrapped && status === 'idle'` y la pantalla actual no es `auth`/`onboarding`/raíz → `router.replace('/auth')`. Cubre el logout y el refresh expirado desde cualquier pantalla.
- Declara la presentación de cada ruta (modales, animaciones).

### 4.2 Flujo de entrada (el "gate")

`src/app/index.tsx` es un componente `Gate` que solo redirige:

```
                    ┌─ !authReady || !instHydrated → spinner
                    │
Gate (/)  ──────────┼─ !authed                     → /auth
                    │
                    ├─ user && !user.isVerified     → /verificar-correo
                    │
                    ├─ !institucion                 → /onboarding
                    │
                    └─ todo ok                      → /(tabs)
```

Orden real del flujo: **auth → verificación de correo → código de institución → tabs**. Google y Apple entran ya verificados (`isVerified === true`), así que solo los registros por correo/clave ven el muro de verificación.

### 4.3 Rutas (expo-router, `src/app/`)

| Ruta | Archivo | Presentación | Qué hace |
|---|---|---|---|
| `/` | `index.tsx` | — | Gate de entrada (solo redirige). |
| `/auth` | `auth.tsx` | fade | Registro / inicio de sesión. Alterna modo con `?mode=login`. Correo+clave, Google (no-iOS) y Sign in with Apple (solo iOS). Hero animado `LoginHero`. |
| `/verificar-correo` | `verificar-correo.tsx` | fade | Muro de verificación: "Ya verifiqué" (re-consulta `/me`), "Reenviar correo" y "Cerrar sesión". |
| `/onboarding` | `onboarding.tsx` | — | Ingreso del **código de institución** (`vincularInstitucion`). Hero con gradiente de marca, atajo visible "Demo: DEMO123", invalida `['mias']` y `['mis-eventos']` al vincular. |
| `/(tabs)` | `(tabs)/_layout.tsx` | — | Barra de 5 pestañas (ver abajo). |
| `/(tabs)/index` | `(tabs)/index.tsx` | tab | **Descubrir** (Home). |
| `/(tabs)/agenda` | `(tabs)/agenda.tsx` | tab | **Mi agenda**. |
| `/(tabs)/entradas` | `(tabs)/entradas.tsx` | tab | **Entradas**. |
| `/(tabs)/comunidad` | `(tabs)/comunidad.tsx` | tab | **Comunidad** (hub de chats + muros). |
| `/(tabs)/perfil` | `(tabs)/perfil.tsx` | tab | **Perfil** y ajustes. |
| `/evento/[id]` | `evento/[id].tsx` | card, slide desde abajo | Detalle del evento. |
| `/checkout/[idEvento]` | `checkout/[idEvento].tsx` | modal | Checkout de pago. |
| `/entrada/[id]` | `entrada/[id].tsx` | modal | Entrada con **QR**. |
| `/certificado/[codigo]` | `certificado/[codigo].tsx` | modal | Certificado (imagen + compartir en LinkedIn). |
| `/instituciones` | `instituciones.tsx` | modal | Mis instituciones / cambiar filtro / agregar código. |
| `/tarjetas` | `tarjetas.tsx` | modal | Tarjetas guardadas (agregar/eliminar). **Actualmente no está enlazada desde ninguna pantalla** — quedó del flujo de débito directo; el checkout hospedado la reemplazó. |
| `/muro/[idEvento]` | `muro/[idEvento].tsx` | slide | Muro de la comunidad del evento. |
| `/muro/miembros/[idEvento]` | `muro/miembros/[idEvento].tsx` | slide | Participantes de la comunidad. |
| `/chat/[idChat]` | `chat/[idChat].tsx` | slide | Chat privado 1-a-1. |
| `/asistente/[idCliente]` | `asistente/[idCliente].tsx` | slide | Perfil público de otro asistente. |
| `/mi-perfil` | `mi-perfil.tsx` | slide | Mi perfil de networking (lectura). |
| `/editar-perfil` | `editar-perfil.tsx` | modal | Editar perfil + foto + visibilidad. |
| `/conexiones` | `conexiones.tsx` | slide | Solicitudes recibidas y lista de conexiones. |

`experiments.typedRoutes: true` en `app.json` → las rutas están tipadas; navegar con un `pathname` inexistente es error de compilación.

### 4.4 Las 5 pestañas

`(tabs)/_layout.tsx` define la barra con iconos Ionicons, color activo `brand`, fondo `bgElevated`, altura 88 en iOS / 64 en Android y etiquetas traducidas (`tabs.home`, `tabs.agenda`, `tabs.tickets`, `tabs.community`, `tabs.profile`).

| Pestaña | Icono | Contenido |
|---|---|---|
| Descubrir | `compass` | Top bar (institución activa + selector de idioma cíclico), chips de institución si hay más de una, carrusel hero de destacados con paginación por puntos, 4 accesos rápidos (Programa / Destacados / Gratis / Entradas) y lista paginada infinita de eventos. |
| Mi agenda | `bookmark` | Entradas agrupadas por día, en modo **lista** (`SectionList`: próximos ascendente, pasados descendente y atenuados) o **calendario** (grilla mensual). |
| Entradas | `ticket` | Tarjetas de entradas compradas con portada, chips (workshop / asistió), acceso al QR y enlace al certificado si existe. |
| Comunidad | `chatbubbles` | Hub unificado: sección **Chats** (privados, con no leídos) y sección **Comunidades** (muros por evento con último mensaje y nº de participantes). |
| Perfil | `person-circle` | Cuenta, tema, idioma, networking, instituciones, privacidad y eliminar cuenta. |

---

## 5. Autenticación

### 5.1 Arquitectura de doble sesión

La app mantiene **dos sesiones en paralelo**:

1. **Sesión ConnectHub** (`/public/auth/*`) — access + refresh en SecureStore (`ch.asist.access` / `ch.asist.refresh`). Es la que autentica todo el catálogo, entradas, comunidad, perfil.
2. **Sesión del servicio de pagos externo** (`api-ligaprocorp`) — token + refresh en SecureStore (`ch.pagos.token` / `ch.pagos.refresh`). Es la **única** aceptada por los endpoints de checkout.

Por eso el login de correo/clave **no** llama a `/public/auth/login`: primero autentica contra el servicio de pagos y luego canjea ese token por una sesión ConnectHub con `POST /public/auth/pagos-exchange`. Así el checkout funciona desde el primer momento.

### 5.2 Flujos por método

| Método | Secuencia real (`store/auth.ts`) |
|---|---|
| **Registro (correo/clave)** | `POST /public/auth/register` → persiste tokens → dispara `loginPagos()` en segundo plano (`void`) → `syncInstitucion()`. Si el backend devuelve `devVerificationToken` (SMTP no configurado), la pantalla muestra una tarjeta para verificar en el acto. |
| **Login (correo/clave)** | `loginPagos(email, clave)` contra `/auth/login-user-password` con la clave hasheada **SHA-256 hex** → si falla, `ApiError(401)` → `pagosExchangeReq(token)` → persiste → `syncInstitucion()`. |
| **Google** | `useGoogleAuth` (expo-auth-session, híbrido `id_token token`) → `loginPagosGoogle(idToken, accessToken)` contra `/auth/register-google` con `tipoUsuario: 'GOOGLE'` → `pagos-exchange` → persiste. |
| **Apple** | `AppleAuthentication.signInAsync` (scopes FULL_NAME + EMAIL) → `loginPagosApple(identityToken, email, nombre, apellido)` contra `/auth/register-apple`. Si el externo responde OK → `pagos-exchange`; si **no** (404/red) → cae al Apple nativo de ConnectHub `POST /public/auth/apple` (permite el login para la revisión de Apple, pero **sin sesión de pagos**). Después `completarNombreApple()` guarda nombre/apellido en el perfil (Apple solo los entrega en el primer inicio de sesión, y hacen falta para el certificado). Cancelar el diálogo (`ERR_REQUEST_CANCELED`) no se trata como error. |

Visibilidad de botones en `/auth`: Google se muestra en **Android y web**; Sign in with Apple **solo en iOS** y solo si `AppleAuthentication.isAvailableAsync()` da true (requisito App Store 4.8). El botón de Apple usa el componente oficial, con estilo `WHITE` en tema oscuro y `BLACK` en claro.

### 5.3 Bootstrap y refresh

`bootstrap()` en el arranque:

1. `loadPagosToken()` — restaura la sesión de pagos persistida.
2. `loadTokens()` — si no hay, marca `bootstrapped` y termina (usuario sin sesión).
3. Inyecta el access en el cliente, llama `meReq()`.
4. Si `/me` falla → `refresh()` con el refresh token; si funciona, reintenta `/me`.
5. `syncInstitucion()` reconcilia la institución local con `/public/instituciones/mias`: sin instituciones limpia; activa inválida → usa la primera válida; filtro colgante → "Todas".
6. **`bootstrapped: true` se marca al final**, para que el gate no redirija antes de que la institución esté sincronizada.

El refresh se dispara desde `client.ts` ante cualquier 401 en ruta autenticada (`setRefreshHandler(() => useAuth.getState().refresh())`). Si el refresh falla, se limpian tokens y la sesión queda `idle` → el guardia del layout raíz manda a `/auth`.

El refresh de la **sesión de pagos** es independiente y **single-flight**: si varias peticiones reciben 401 a la vez, todas esperan la misma llamada a `/auth/refresh`. Un 401/403 en el refresh borra la sesión de pagos; un 5xx o error de red **no** la borra (podrá reintentar).

### 5.4 Verificación de correo

Pantalla `/verificar-correo` (bloqueante para registros con correo/clave):

- **"Ya verifiqué"** → `meReq()`; si `isVerified` va al gate, si no muestra un diálogo "sigue pendiente".
- **"Reenviar correo"** → `POST /public/auth/resend-verification`.
- **"Cerrar sesión"** → `logout()` + `replace('/auth')`.

### 5.5 Eliminar cuenta (App Store 5.1.1v)

En **Perfil → Eliminar cuenta** (fila roja, solo con sesión):

1. Diálogo de confirmación **destructivo** con `useConfirm()` (no `Alert.alert`, que es no-op en web). El texto avisa: perfil, conexiones, conversaciones y tarjetas se eliminan; los registros de pagos y entradas se conservan **anonimizados**; la acción es irreversible.
2. `deleteAccount()` → `DELETE /public/auth/me` (el backend anonimiza y retiene lo financiero).
3. `logout()` — limpia tokens ConnectHub, sesión de pagos y store de institución.
4. `router.replace({ pathname: '/auth', params: { mode: 'login' } })`.

También existe la URL pública de respaldo `https://connecthub.fourstacklabs.com/eliminar-cuenta`.

---

## 6. Funcionalidades clave

### 6.1 Catálogo (Descubrir)

- **Dos fuentes**: feed **agregado** `/public/mis-eventos` (todas mis instituciones, requiere auth) o feed **por institución** `/public/eventos?codigo=…`. Se usa el agregado cuando `filtro === null` **o** cuando la institución del filtro todavía no está en la lista (cargando) o ya no es mía — así el Home nunca queda vacío indebidamente.
- Paginación infinita con `useInfiniteQuery` (`size = 12`), `onEndReached` al 40 % del final, `RefreshControl` y refetch al enfocar la pantalla (`useFocusEffect`).
- Filtros cliente: **Programa** (todos), **Destacados**, **Gratis**. Con filtro activo se cargan páginas siguientes solo hasta llenar la pantalla (`items.length < 8 && pageCount < 6`) — antes cargaba el catálogo entero en cascada y congelaba el hilo JS.
- La animación de entrada (`FadeInDown`) se aplica **solo a las primeras 8 filas**: en una `FlatList` virtualizada las filas se reciclan y el `entering` se re-dispararía en cada reciclaje (parpadeo).
- Estados: skeletons al cargar, bloque de error con reintento, y vacío con icono + copy.

### 6.2 Detalle del evento

Ruta `/evento/[id]`. Hero de 330 px con **parallax** (Reanimated: translateY 0.5×/0.25× y escala al hacer overscroll), tocable para ampliar la portada. Cuerpo con esquinas redondeadas montado sobre el hero:

- Chips de fechas (`resumenDias`) y precio (o "Gratis").
- Título, institución, ubicación (`localNombre · salonNombre`) y horario.
- Secciones condicionales: **Acerca de** (`detalle.descripcionLarga` o `descripcion`), **Qué aprenderás** (bullets), **Temas** (chips), **Agenda** (una fila por día), **Expositores** (carrusel horizontal; al tocar abre una ficha inferior con foto ampliable, cargo, rol, tagline, bio, sitio web y redes), **Workshops** (filas navegables al detalle del workshop con su precio).
- Botón de guardar en agenda local (`SaveButton`) flotando sobre el hero.
- **CTA fija inferior** que cambia de estado: "Ver entrada" si ya tiene entrada, "Inscribirme" / "Comprar" según precio.

### 6.3 Inscripción

`handleInscribir()` en el detalle:

1. Si ya hay entrada → navega a `/entrada/[id]`.
2. Si el evento tiene precio → navega directo a `/checkout/[idEvento]`.
3. Si es gratis → `POST /public/eventos/{id}/inscripcion`. Si la respuesta trae `requierePago` → checkout; si no, invalida `['mis-entradas']` y abre el QR.

Errores contemplados:

| Caso | Manejo |
|---|---|
| `409 PROFILE_INCOMPLETE` | Se distingue por `errorCode(err)`. Falta nombre/apellido (van al certificado) → diálogo con acción "Completar perfil" → `/editar-perfil`. |
| Cualquier otro `409` | Se muestra `event.parentFirst` ("Compra primero el evento principal") con el `message` del backend. Ojo: el código **no** comprueba `PARENT_REQUIRED` explícitamente — todo 409 que no sea `PROFILE_INCOMPLETE` cae aquí, aunque el tipo `ParentRequired` de `entradas.ts` exista. |
| Otro | Diálogo genérico de error. |

> El aviso de evento padre también aparece en el checkout: `useResumenPago` devuelve `padreRequerido` y `/checkout/[idEvento]` muestra una fila navegable al evento principal.

### 6.4 Checkout de pago

Ruta `/checkout/[idEvento]`. Método principal: **Checkout hospedado de Paymentez** (SDK oficial 3.0.0) dentro de la app.

Secuencia completa:

1. `useResumenPago(idEvento)` → `GET /public/pagos/resumen/{id}`: portada, título, subtotal, IVA, total, `yaAdquirido`, `padreRequerido`.
2. **Cupón (opcional)**: `POST /public/pagos/cupon/{idEvento}` solo da **feedback en pantalla** (válido / agotado / inválido y descuento). El descuento real lo aplica el servicio externo al generar la referencia. Al validar OK el código se congela (con botón "quitar").
3. Al pulsar pagar se abre el modal de **datos de facturación**: nombre y apellido (van al certificado; bloqueados si ya hay certificado emitido, `nombreBloqueado`), tipo de identificación (**C**édula / **P**asaporte / **R**UC), número, y **correo de facturación** editable (el de login puede ser el relay privado de Apple). Se guardan con `PATCH /public/perfil/me`.
4. `iniciarCheckout(idEvento, idUsuario, cupon)` → `POST /evento-usuario/eventos/{id}/checkout` en el **servicio externo** → `{ reference, envMode }`.
5. Se monta `<CheckoutWidget>`: WebView con el SDK oficial → `new PaymentCheckout.modal({env_mode, locale, onOpen, onClose, onResponse})` → `modal.open({ reference })`. El `locale` se limita a `es|en|pt` (el SDK no soporta `fr`).
6. `onResponse` → `mapResponse()` → `success` / `pending` / `failure` / `cancelled` / `error`.
7. En éxito: `confirmarCheckout(idEvento, idUsuario, transactionId, raw)` → `POST /evento-usuario/eventos/{id}/checkout/confirmar` (el servicio externo procesa **e inscribe**). Luego `enviarConfirmacionCorreo()` (best-effort, no bloquea), invalidación de `['mis-entradas']` y `['resumen-pago']`, y `router.replace('/(tabs)/entradas')` dentro de `InteractionManager.runAfterInteractions`.

Detalles de robustez que **no hay que romper**:

- **Nada de diálogo de éxito** encima del modal del checkout que se está cerrando: encadenar modales nativos **congelaba la pantalla en iOS**. La entrada en "Mis entradas" es la confirmación.
- El overlay de "procesando" es una `View` absoluta, **no** un `<Modal>`, por la misma razón.
- En web, mientras `paying` está activo se registra `beforeunload` para evitar doble pago por recarga.
- El `source` del WebView está memoizado (ver §3.4).

### 6.5 Entradas y QR

`/(tabs)/entradas` lista `GET /public/mis-entradas` (refetch al enfocar). Cada tarjeta abre `/entrada/[id]`, que pide `GET /public/entradas/{idEventoUsuario}/qr` y muestra el `qrToken` como **QR de 240 px sobre tarjeta blanca** (`react-native-qrcode-svg`, negro sobre blanco para escaneo fiable), el título del evento, el chip "Asistió" si aplica y el token en texto como respaldo.

### 6.6 Agenda

`/(tabs)/agenda` con dos vistas sobre las mismas entradas:

- **Lista**: `SectionList` agrupada por día (una entrada aparece en cada día que abarca), ordenada por hora dentro del día; próximos ascendente, pasados descendente y con opacidad reducida más la etiqueta "pasado".
- **Calendario**: grilla mensual de 42 celdas empezando en **lunes**, navegación de mes, marcado de días con eventos, y lista del día seleccionado. Mes inicial = el del primer evento futuro (o el actual).

Ambas vistas permiten abrir el evento o el QR directamente.

### 6.7 Certificados

`/certificado/[codigo]`:

- Muestra la **imagen renderizada** por el backend: `${API_BASE}/public/certificados/{codigo}/imagen`, con `cachePolicy="none"` (el nombre del asistente puede cambiar al completar el perfil, así que siempre se pide fresco) y `aspectRatio` calculado del `onLoad`.
- Si el evento **no tiene plantilla** configurada (404), cae a una **tarjeta dibujada** en RN: cabecera con gradiente de marca y logo, "Se otorga a", nombre, "por asistir a", título del evento, institución, código y fecha de emisión.
- **Compartir en LinkedIn** estilo Credly: abre `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&…` prellenando nombre, organización, año/mes de emisión, `certUrl` (`${EXPO_PUBLIC_WEB_URL}/c/{codigo}`) y `certId`.
- **Descargar**: abre la URL de la imagen en el navegador.

### 6.8 Comunidad y chat

- **Hub** (`/(tabs)/comunidad`): `SectionList` con dos secciones — *Chats* (`GET /public/chats`, con avatar, último mensaje, hora y badge de no leídos) y *Comunidades* (`GET /public/comunidad/mis-comunidades`, con portada, último mensaje, nº de participantes y marca "saliste" si `!soyMiembro`). Refetch al enfocar.
- **Muro** (`/muro/[idEvento]`): feed de la comunidad del evento (acceso condicionado a tener entrada), burbujas propias vs. ajenas con avatar e inicial, composer con `KeyboardAvoidingView`, autoscroll solo si el usuario está al final de la lista, acceso a **miembros** y acciones **salir / volver a ingresar** en la comunidad. Tocar el autor abre su perfil público.
- **Miembros** (`/muro/miembros/[idEvento]`): lista de participantes con perfil público; cada fila abre `/asistente/[idCliente]`.
- **Chat privado** (`/chat/[idChat]`): mensajes 1-a-1 (`GET /public/chats/{id}/mensajes`, `size=50`, se invierten para render), burbujas memoizadas (teclear no re-renderiza toda la lista), envío con `POST`.
- **Networking**: desde el perfil ajeno se puede **conectar** (`POST /public/conexiones/solicitar`) o **enviar mensaje** (`POST /public/chats/abrir`; un **403** significa perfil privado sin conexión → mensaje "necesitas conectar primero"). `/conexiones` lista solicitudes recibidas (aceptar/rechazar) y conexiones aceptadas.

### 6.9 Perfil y privacidad

- `/(tabs)/perfil`: tarjeta de cuenta (avatar, nombre, correo, estado de verificación, cerrar sesión), selector de **tema** (sistema / claro / oscuro), selector de **idioma** (4 opciones), accesos a *Mi perfil* y *Conexiones*, *Mis instituciones*, enlace a la **política de privacidad** (`https://connecthub.fourstacklabs.com/privacy`, requisito de tiendas) y **Eliminar cuenta**.
- `/mi-perfil`: vista de lectura del perfil de networking con chip de visibilidad (**Público** / **Privado**), bio, teléfono, profesión, empresa, aviso de perfil incompleto y "ver como me ven los demás".
- `/editar-perfil`: nombre y apellido (bloqueados si ya hay certificado emitido — con texto explicativo), tipo y número de identificación, correo de facturación, profesión, empresa, bio, **interruptor de visibilidad** (`PUBLICO` / `PRIVADO`) y **cambio de foto** con `expo-image-picker` (si se deniega el permiso, se avisa con `photoPermTitle`/`photoPermBody`).

### 6.10 Instituciones (multi-tenant)

Un asistente puede pertenecer a varias instituciones. `/instituciones` (modal) lista `GET /public/instituciones/mias` con logo o inicial, ciudad/país, marca la activa y permite:

- Elegir **"Todas mis instituciones"** (filtro `null`, feed agregado) — solo aparece si hay más de una.
- Cambiar el filtro a una institución concreta (`replace('/(tabs)')`).
- **Agregar un código** → `/onboarding`.

En el Home, si hay más de una institución, se muestran chips horizontales con el mismo filtro.

---

## 7. Internacionalización (i18n)

Archivo único `src/i18n/index.tsx` (~1150 líneas).

- Idiomas: **`en` (por defecto), `es`, `fr`, `pt`** — `LANGS` expone `{ code, label }` con etiquetas nativas (English, Español, Français, Português).
- `en` es el diccionario **canónico**: `export type StringKey = keyof typeof en` y `type Dict = Record<StringKey, string>`. Los otros tres se tipan como `Dict`, así que **si añades una clave a `en` y no a los demás, TypeScript falla el build**. Ese es el mecanismo que garantiza que no falten traducciones.
- Resolución con fallback en cadena: `strings[lang]?.[k] ?? en[k] ?? k`.
- `I18nProvider` memoiza `t` (`useCallback`) y el value (`useMemo`): sin eso, cada render del `RootLayout` (que re-renderiza en **cada navegación** por `useSegments`) propagaría identidad nueva a todos los consumidores → re-render de toda la UI montada.
- Uso: `const { t: tr, lang } = useI18n(); tr('home.upcoming')`.
- El idioma se persiste en `store/settings.ts` y se cambia desde Perfil o desde el botón cíclico de la top bar del Home.
- Las fechas **no** usan `Intl`: `lib/fecha.ts` tiene sus propias tablas de meses/días para los 4 idiomas (evita el peso y las diferencias de ICU entre plataformas).

Familias de claves (18): `common.*`, `tabs.*`, `auth.*`, `verify.*`, `onboarding.*`, `inst.*`, `home.*`, `event.*`, `entradas.*`, `agenda.*`, `pay.*`, `cards.*` (pantalla `/tarjetas`), `cert.*`, `community.*`, `chat.*`, `connections.*`, `profile.*`, `account.*`.

---

## 8. Configuración nativa (`app.json`)

### 8.1 Bloque general

| Campo | Valor | Nota |
|---|---|---|
| `name` / `slug` | `ConnectHub` / `connecthub` | |
| `version` | `1.0.0` | Versión visible en tiendas. |
| `orientation` | `portrait` | Solo vertical. |
| `scheme` | `connecthub` | Deep links y retorno de OAuth. |
| `userInterfaceStyle` | `automatic` | Permite claro/oscuro. |
| `icon` | `./assets/images/icon.png` | Icono principal (iOS + fallback). |
| `owner` | `alcivator` | Cuenta EAS. |
| `experiments.typedRoutes` | `true` | Rutas tipadas. |
| `experiments.reactCompiler` | `true` | React Compiler activo. |
| `extra.eas.projectId` | `2a694ac0-…` | Necesario para push y builds. |

### 8.2 iOS

```json
"ios": {
  "bundleIdentifier": "com.fourstacklabs.connecthub",
  "usesAppleSignIn": true,
  "supportsTablet": false,
  "config": { "usesNonExemptEncryption": false }
}
```

- `usesAppleSignIn: true` hace que **EAS habilite solo la capacidad "Sign in with Apple"** en el App ID durante el primer build de producción.
- `supportsTablet: false` → solo iPhone; las capturas de iPad no son necesarias.
- `usesNonExemptEncryption: false` evita el cuestionario de exportación en cada envío.

### 8.3 Android

```json
"android": {
  "package": "com.fourstacklabs.connecthub",
  "adaptiveIcon": {
    "backgroundColor": "#4a0a80",
    "foregroundImage": "./assets/images/android-icon-foreground.png",
    "backgroundImage": "./assets/images/android-icon-background.png",
    "monochromeImage": "./assets/images/android-icon-monochrome.png"
  },
  "predictiveBackGestureEnabled": false,
  "blockedPermissions": [
    "android.permission.RECORD_AUDIO",
    "android.permission.CAMERA"
  ]
}
```

- **Icono adaptativo completo**: foreground + background + **monochrome** (para el tema dinámico de Android 13+), sobre morado `#4a0a80`.
- `predictiveBackGestureEnabled: false` — el gesto predictivo de Android 14 no se lleva bien con la pila de expo-router.
- **`blockedPermissions`** es clave para la ficha de Play: `expo-image-picker` declara CAMERA y RECORD_AUDIO por defecto, pero la app **solo usa la galería** (foto de perfil). Bloquearlos evita declarar permisos que no se usan en Data Safety y evita preguntas del revisor.

### 8.4 Plugins declarados

| Plugin | Para qué |
|---|---|
| `expo-router` | Navegación basada en archivos. |
| `expo-apple-authentication` | Sign in with Apple nativo. |
| `expo-splash-screen` (config) | Splash: fondo `#4a0a80`, imagen `splash-icon.png`, ancho 120. |
| `expo-notifications` | Push. |
| `expo-secure-store` | Keychain / Keystore para tokens. |
| `expo-image-picker` (config) | Foto de perfil. `photosPermission`: *"ConnectHub necesita acceso a tus fotos para actualizar tu foto de perfil."* (texto que ve el usuario en iOS). |
| `expo-image` | Imágenes con caché y transiciones. |
| `expo-status-bar` | Barra de estado. |
| `expo-web-browser` | Sesión de auth en navegador (Google). |

### 8.5 Web

`web.output: "static"`, favicon `./assets/images/favicon.png`. El target web se usa para **verificación rápida durante el desarrollo**, no es un producto publicado.

---

## 9. Perfiles de build (`eas.json`)

`cli.version >= 12.0.0`, `cli.appVersionSource: "remote"` (**los números de versión los lleva EAS en el servidor**, no el repo — por eso `eas build:version:set` es el comando para corregirlos).

| Perfil | Distribución | Android | iOS | Envs |
|---|---|---|---|---|
| `development` | `internal`, `developmentClient: true` | — | — | ninguna (usa `.env` local) |
| `preview` | `internal` | `buildType: apk` (instalable directo por QR/link) | — | set completo `EXPO_PUBLIC_*` de producción |
| `production` | store | `buildType: app-bundle` (`.aab`) | `buildConfiguration: Release` | set completo `EXPO_PUBLIC_*` de producción |

`production.autoIncrement: true` → el build number sube solo en cada compilación.

### 9.1 Variables `EXPO_PUBLIC_*` (solo nombres)

Todo lo que empieza por `EXPO_PUBLIC_` se **compila dentro del binario**: **no son secretos y no deben usarse para nada sensible**. Están horneadas en `eas.json` (perfiles `preview` y `production`) y duplicadas en `.env` para desarrollo local.

| Variable | Para qué sirve | Dónde vive |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | Base de la API pública de ConnectHub (`/public/*`). Leída por `api/client.ts`. | `eas.json` (preview/production) + `.env` |
| `EXPO_PUBLIC_WEB_URL` | Base del sitio web (landing de certificados `/c/{codigo}`, privacidad). | idem |
| `EXPO_PUBLIC_PAGOS_API_URL` | Base del servicio de pagos/identidad externo. Leída por `api/pagos-session.ts`. | idem |
| `EXPO_PUBLIC_PAGOS_LOGIN_PATH` | Ruta de login email/clave del servicio de pagos. | idem |
| `EXPO_PUBLIC_PAGOS_GOOGLE_PATH` | Ruta de registro/login con Google del servicio de pagos. | idem |
| `EXPO_PUBLIC_PAGOS_APPLE_PATH` | Ruta de registro/login con Apple del servicio de pagos. | idem |
| `EXPO_PUBLIC_PAGOS_REFRESH_PATH` | Ruta de refresh del servicio de pagos. | idem |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Client ID OAuth **web** de Google (proyecto GCP de pagos, no "ueesApp"). | idem |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Client ID OAuth **iOS**. | idem |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Client ID OAuth **Android**. | idem |

Las rutas del servicio de pagos son variables (no constantes en el código) para poder cambiarlas sin recompilar lógica; todas tienen valor por defecto en `pagos-session.ts` si la env falta.

**Restauración**: si se pierde `.env`, `cp .env.example .env` deja el archivo completo (los valores de `.env.example` son públicos por diseño). `.env` está ignorado por el `.gitignore` de la raíz (regla `.env`), no por el de `apps/mobile`. Los builds de tienda no dependen de `.env`.

⚠️ `.env.example` apunta a **producción** (`https://connecthub.fourstacklabs.com/api`); el `.env` de desarrollo de este equipo usa `EXPO_PUBLIC_API_URL=http://localhost:4000` para pegarle al contenedor local. Es la **única** variable que difiere entre ambos archivos.

---

## 10. Procedimiento de build y envío

### 10.1 Requisitos

| Requisito | Detalle |
|---|---|
| EAS CLI | El paquete es **`eas-cli`**, no `eas`. `npm install -g eas-cli` (una vez) o `npx eas-cli …`. ⚠️ `npx eas …` a secas **falla** con *"could not determine executable to run"*. |
| Cuenta Expo | `eas login` (cuenta expo.dev, **no** la de Apple). |
| Apple Developer | US$99/año, para iOS. |
| Google Play Developer | Cuenta de organización **QuadraTech SA** (`developerId 7448208356938367193`). |
| Node | Portable del proyecto (`~/nodejs/node-v22.23.1-win-x64`) o Node 22 LTS. |

### 10.2 Pre-vuelo

```bash
cd C:\proyectos\CONNECT-HUB\apps\mobile
eas login
eas whoami                 # confirma la cuenta (debe ser alcivator)
npx expo-doctor            # revisión de salud de la config (recomendado)
eas build:version:set      # solo si hay que forzar version/build code concretos
```

> `appVersionSource: "remote"` significa que el `versionCode` de Android y el build number de iOS **los guarda EAS**, no el repo. Si Play o App Store Connect rechaza por número repetido, se corrige con `eas build:version:set`, no editando `app.json`.

### 10.3 iOS — App Store

```bash
# 1) Compilar el .ipa (~15–25 min)
eas build -p ios --profile production

# 2) Subir a App Store Connect / TestFlight
eas submit -p ios --latest
```

Durante el primer build, EAS pide credenciales de Apple (o una App Store Connect API Key) y ofrece **gestionar certificados y perfiles de aprovisionamiento** — decir que sí. También habilita solo la capacidad *Sign in with Apple* al detectar `usesAppleSignIn: true`.

Después del submit, el build tarda **10–30 min** en procesarse y aparece en TestFlight, desde donde se selecciona para la versión.

Alternativa manual: descargar el `.ipa` del link de EAS (retención 30 días) y subirlo con **Transporter** (Mac App Store).

**Estado al 2026-07-19**: App Store Connect, SKU `connecthub-ios-001`, build **1.0 (13)** en revisión de Apple. Nombre en tienda "ConnectHub+".

### 10.4 Android — Google Play

```bash
# 1) Compilar el app bundle (.aab)
eas build -p android --profile production

# 2) (segunda versión en adelante) subir con cuenta de servicio
eas submit -p android --latest
```

**Particularidades importantes:**

1. **La primera subida de un package nuevo DEBE ser manual.** La Play Developer API no puede crear el primer release, así que `eas submit -p android` falla en la entrega inicial. Hay que descargar el `.aab` del link de EAS y subirlo en **Play Console → Producción (o pista de prueba) → Crear versión**. Así se hizo con el `.aab` guardado en `C:/proyectos/connecthub-1.0-android.aab` (**76 MB**).
2. **`eas submit` con cuenta de servicio** requiere un JSON de service account que **solo puede generar el propietario** de la cuenta de Play (Play Console → Setup → API access). Una invitación normal de usuario no da acceso a *API access*.
3. **Play App Signing está ACTIVADO.** El keystore que genera EAS es la **upload key**, no la clave de firma final: Play **re-firma** el bundle con su propia App Signing key. Consecuencia práctica para Google Sign-In: el SHA-1 que hay que registrar en el client ID OAuth de Android es el de la **App Signing key** (Play Console → Integridad de la app), **no** el de la upload key.
   - SHA-1 de la upload key (extraído del `.aab`): `50:6A:79:AB:71:C1:B1:4D:15:27:FE:EB:8A:22:D7:66:0D:2A:73:34`.
4. **Respaldar el keystore de EAS**: `eas credentials` → exportar. Sin él no se pueden firmar futuras actualizaciones (aunque con Play App Signing se puede solicitar reset de upload key a Google).

Build de prueba rápido (APK instalable directo, sin pasar por tiendas):

```bash
eas build -p android --profile preview     # genera un .apk con envs de producción
```

**Estado al 2026-07-19**: app **nueva** `appId 4975218640913412885`, package `com.fourstacklabs.connecthub`, app bundle `versionCode 2` (1.0.0), 177 países, **enviada a revisión**. La app vieja de Ionic (`appId 4973167685542698921`, package `com.quadratech.connecthub`) quedó **anulada / no publicada**.

### 10.5 Assets de tienda

| Tienda | Ruta local | Formato |
|---|---|---|
| App Store | `C:/proyectos/capturas-appstore` | Capturas iPhone 6.7" **1284 × 2778**; icono 1024×1024 sin transparencia. |
| Google Play | `C:/proyectos/capturas-playstore` | Capturas **1080 × 2160**, `icon-512.png`, `feature-graphic-1024x500.png`. |

### 10.6 Datos para los revisores

| Dato | Valor |
|---|---|
| Cuentas demo | `reviewer1@connecthub.fourstacklabs.com` / `reviewer2@connecthub.fourstacklabs.com` |
| Contraseña | *(no se escribe aquí — vive en el gestor de contraseñas; ver `docs/handbook/07-credenciales-y-accesos.md` §2.13)* |
| Código de institución | **`DEMO123`** (institución "Demo Institution", `idInstitucion 104`) |
| Política de privacidad | `https://connecthub.fourstacklabs.com/privacy` |
| Eliminación de cuenta | `https://connecthub.fourstacklabs.com/eliminar-cuenta` |

> **Por qué hay dos cuentas:** *Perfil → Eliminar cuenta* **anonimiza** la cuenta. Si el revisor prueba esa función con `reviewer1@`, esas credenciales dejan de funcionar; `reviewer2@` es el respaldo.

> **Rotación pendiente:** la contraseña de estas cuentas quedó escrita en los formularios de App Store Connect y Play Console (canales no cifrados). Una vez aprobadas ambas apps hay que **rotarla o eliminar las cuentas demo** (ver §12 y `06-tiendas-ios-android.md` §12).

Los eventos **161** y **201** están ocultos (`NO_PUBLICAR='S'`) para que no aparezcan en las capturas ni en la revisión.

El código de institución está prellenable desde el propio onboarding (texto visible "Demo: DEMO123") para que el revisor no tenga que escribirlo.

### 10.7 Checklist de release

- [ ] `npm install` y `npx expo-doctor` sin errores.
- [ ] Diccionarios i18n completos (si TypeScript compila, están completos).
- [ ] `eas build -p ios --profile production` OK, build number mayor al anterior.
- [ ] `eas submit -p ios --latest` → build visible en TestFlight.
- [ ] Probar en TestFlight: login con **Apple**, compra de un evento de pago, **Perfil → Eliminar cuenta**.
- [ ] Ficha de App Store Connect: capturas, descripción, App Privacy, cuenta demo + notas de revisión.
- [ ] `eas build -p android --profile production` OK; keystore respaldado con `eas credentials`.
- [ ] `.aab` subido (manual la primera vez; `eas submit` después).
- [ ] Play Console: Data safety, clasificación de contenido, política de privacidad, ficha completa.
- [ ] SHA-1 de la **App Signing key** registrado en el client ID OAuth de Android.

---

## 11. Trampas conocidas (no volver a pisarlas)

| Síntoma | Causa / solución |
|---|---|
| `npx eas` falla con *"could not determine executable to run"* | El paquete es `eas-cli`. Usa `npx eas-cli …` o instálalo global. |
| Google Sign-In falla en web | Metro no está en el puerto **8100**; el redirect autorizado incluye la ruta `/auth`. |
| Google rechaza con *"Parameter not allowed for this message type"* | PKCE activo con response type híbrido. `usePKCE: false` + `nonce` manual (ya resuelto en `useGoogleAuth.ts`). |
| Google Sign-In funciona en el `.apk` de preview pero no en Play | El SHA-1 registrado es el de la upload key; hace falta el de la **App Signing key**. |
| Pantalla congelada en iOS tras pagar | Se encadenó un `Modal` con el cierre del modal del checkout. Usar `View` absoluta y navegar con `InteractionManager.runAfterInteractions`. |
| El pago se reinicia solo a mitad del cobro | El `source` del WebView cambió de identidad. Debe estar memoizado. |
| `"Network request failed"` al subir la foto de perfil en nativo | `fetch` + `FormData` con `{ uri }` no funciona en la nueva arquitectura. Usar `apiUploadFile` (`expo-file-system` `uploadAsync`). |
| `Alert.alert` no hace nada en web | Usar `useConfirm()` del design system. |
| La app se congela al desbloquear el teléfono | Animación infinita de Reanimated corriendo en background. Pausarla con `useAppActive()`. |
| Parpadeo de filas al hacer scroll | `entering` de Reanimated re-disparado al reciclar filas de la `FlatList`. Animar solo las primeras 8. |
| El Home queda vacío tras cambiar de institución | Filtro colgante hacia una institución que ya no es del usuario. `syncInstitucion()` y el efecto del Home lo resetean a `null`. |
| Faltan traducciones | Imposible en compilación: los diccionarios `es/fr/pt` son `Record<StringKey, string>`. Si falta una clave, TypeScript falla. |
| Doble `/api/api` en llamadas de pagos | `pagosUrl()` lo corrige, pero conviene revisar la env. |

---

## 12. Pendientes conocidos

- 🔴 **Google Sign-In NO funcionará en la versión descargada de Play.** El client OAuth de Android (`EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`) está asociado al SHA-1 de la **upload key**, pero Play App Signing **re-firma** la app, así que el APK que llega al usuario lleva la **App Signing key**. Google devuelve `DEVELOPER_ERROR` (código 10). Arreglo: registrar un client OAuth Android con el SHA-1 de la App Signing key (Play Console → *Integridad de la app → Firma de apps de Play*); se pueden registrar **ambos** SHA-1 como clients separados para que también siga funcionando el `.apk` de preview. Detalle completo en `06-tiendas-ios-android.md` §12 (1).
- 🟠 **Falta subir el `mapping.txt` de R8** para el `versionCode 2`: los builds de producción de Android van ofuscados y los stack traces de crashes llegan ilegibles. Se puede subir a posteriori, sin release nuevo.
- 🟠 **Rotar o eliminar las cuentas demo** (`reviewer1@` / `reviewer2@`) una vez aprobadas ambas apps: su contraseña quedó escrita en los formularios de las dos tiendas.
- `/tarjetas` (tarjetas guardadas + débito directo) está implementada pero **no enlazada** desde ninguna pantalla: el checkout hospedado la sustituyó. Sus endpoints en `pagos.ts` (`pagarDirecto`, `crearCheckout`, `estadoPago`) siguen en el código sin llamador. Decidir si se retoma o se elimina.
- El `README.md` de `apps/mobile` sigue siendo el **template genérico de `create-expo-app`** (habla de una carpeta `app/` que no existe y de `reset-project`, que borraría el código). Este documento es la referencia real.
- El fallback de Apple al endpoint nativo de ConnectHub deja al usuario **sin sesión de pagos**: podrá navegar pero no comprar hasta que el servicio externo tenga `register-apple` desplegado.

---

## 13. Referencias cruzadas

| Tema | Documento |
|---|---|
| API pública y endpoints `/public/*` | `docs/apis-produccion.md` |
| Modelo de datos Oracle | `docs/modelo-datos.md` |
| Checkout / pasarela | `docs/checkout-paymentez.md` |
| Publicación en tiendas (guía original) | `docs/publicar-tiendas.md`, `docs/entrega-tiendas-equipo.md` |
| Eventos ocultos para la revisión | `docs/eventos-no-publicar.md` |
| Infraestructura y despliegue | `SERVER_SETUP.md`, `deploy.sh` |
