# Manual de ConnectHub — Indice general

Ultima actualizacion: 2026-07-19

> **Regla de seguridad de todo este manual:** estos documentos **se suben a GitHub**.
> En ninguno de ellos se escribe un solo valor secreto (contrasenas, tokens, cadenas de
> conexion con password, claves privadas, client secrets, contenido de `.env`).
> Se documenta **el nombre** de cada credencial, **para que sirve**, **donde vive** y
> **como se restaura**. Los valores reales viven fuera del repo: en
> `C:/proyectos/CONNECTHUB-RESPALDO`, en `/root/app/.env` del servidor y en el gestor
> de contrasenas.

---

## 1. Que es ConnectHub

**ConnectHub** es una plataforma multi-institucion para la gestion y el consumo de eventos
presenciales. Por un lado hay un **panel administrativo web** donde cada institucion
organizadora (universidades, camaras, empresas de eventos) administra su recinto fisico
—locales, salones, subsalones y configuraciones de subdivision—, publica eventos con su
horario por dia, precio, cupones y expositores, controla el aforo, imprime gafetes con QR,
consulta la recaudacion y la asistencia, y emite **certificados-imagen verificables**
estilo Credly. Por el otro hay una **app movil de asistentes** (iOS y Android) donde el
usuario final se registra, se engancha a una institucion escribiendo un **codigo de
conexion**, descubre los eventos publicados, se inscribe (gratis o pagando con tarjeta via
Nuvei/Paymentez), recibe su entrada con QR, hace check-in en la puerta, obtiene su
certificado y participa en la **comunidad y el networking** del evento (muro, solicitudes
de conexion y chats privados 1-a-1).

El publico es doble y esta deliberadamente separado, hasta en los secretos que firman sus
sesiones: los **usuarios administrativos** de cada institucion (roles `SYSTEM`,
`ADMINISTRATIVO`, `FINANCIERO`, `GESTION OPERATIVA`, `EVENTOS`, mas un superadministrador
de plataforma) trabajan en el panel web; los **asistentes** viven en la app movil y jamas
tocan el panel. El sistema es multi-tenant sobre una **base Oracle preexistente y
compartida** con otra aplicacion externa, lo que condiciona buena parte del diseno: no hay
migrador automatico, casi no hay foreign keys, el aislamiento entre instituciones se
verifica por JOIN en el codigo, y los cambios de esquema son scripts SQL manuales que
deben ser aditivos. El operador comercial de la plataforma es **FourStackLabs**, que da de
alta instituciones automaticamente por webhook firmado (HMAC).

---

## 2. Arquitectura en bloque

```
                                  Internet
                                     |
                   +-----------------+------------------+
                   |                                    |
          navegador (panel admin)              app movil (iOS/Android)
          apps/web · Next.js 16                apps/mobile · Expo SDK 57
                   |                                    |
                   |  https://connecthub.fourstacklabs.com
                   |  (:80 -> :443, TLS automatico Let's Encrypt)
                   v                                    v
        +===================================================================+
        |  SERVIDOR 209.126.77.72   ·   /root/app   ·   docker compose      |
        |                                                                   |
        |   +---------+                                                     |
        |   |  caddy  |  reverse proxy + TLS + headers de seguridad         |
        |   +----+----+                                                     |
        |        |  handle_path /api/*  -> api:4000   (QUITA el prefijo)    |
        |        |  handle (todo lo demas) -> web:3000                      |
        |        |                                                          |
        |   +----v-----+    +----------+    +-----------+                   |
        |   |   api    |    |   web    |    |   redis   |                   |
        |   | NestJS   |    | Next.js  |    | cache +   |                   |
        |   | Fastify  |    | stand-   |    | rate      |                   |
        |   | :4000    |    | alone    |    | limit     |                   |
        |   | (expose) |    | :3000    |    | :6379     |                   |
        |   +----+-----+    +----------+    +-----------+                   |
        +========|==========================================================+
                 |
    +------------+-------------+--------------------+-------------------+
    v                          v                    v                   v
 ORACLE 21c XE            NAS de archivos      Nuvei / Paymentez    Evento-back
 <host-oracle>:1521      api-ligaprocorp.ec   ccapi/noccapi        (identidad)
 esquema <ver ORACLE_USER en .env>      :3443/api            .paymentez.com       api-ligaprocorp.ec
 COMPARTIDO con app       imagenes de          cobro real           login usuario/clave,
 externa                  eventos, logos,      (llaves POR          Google y Apple
                          planos, fotos        INSTITUCION,             |
                                               en Oracle)          Expo Push (exp.host)
                                                                   Apple JWKS / Google
                                                                   tokeninfo / SMTP
```

**Lo que hay que retener de este diagrama:**

- Solo `caddy` publica puertos al exterior (80 y 443). `api`, `web` y `redis` viven en la
  red interna de Docker. Que `http://209.126.77.72:4000` responda seria una alarma.
- Caddy **quita** el prefijo `/api` antes de pasar la peticion. Por eso los controladores
  de NestJS no llevan prefijo: `@Controller('health')` es `/health` dentro y
  `/api/health` fuera.
- La app movil **no vive en Docker**: se compila en la nube con EAS y se distribuye por
  las tiendas.
- El servidor **no administra** la base de datos, ni el NAS, ni la pasarela, ni el
  servicio de identidad. Todo eso es externo.

---

## 3. Tabla de contenidos

| # | Documento | De que trata |
|---|---|---|
| 00 | **`00-INDICE.md`** (este archivo) | Punto de entrada: que es ConnectHub, arquitectura, mapa de URLs y estado del proyecto. |
| 01 | [`01-backend-api.md`](01-backend-api.md) | La API NestJS + Fastify: estructura, los **dos** sistemas de autenticacion separados (panel vs. asistente), catalogo completo de endpoints admin y publicos, acceso a Oracle, integraciones (SMTP, NAS, webhooks FSL, pagos). |
| 02 | [`02-panel-web.md`](02-panel-web.md) | El panel administrativo Next.js: mapa de rutas, paginas legales exigidas por las tiendas (`/privacy`, `/eliminar-cuenta`), login y refresh de sesion, cliente HTTP tipado, roles y permisos, y cada pantalla del panel una por una. |
| 03 | [`03-app-movil.md`](03-app-movil.md) | La app Expo / React Native: puesta en marcha, estructura, navegacion por pestanas, doble sesion, checkout de pago, entradas QR, certificados, comunidad, configuracion nativa y procedimiento de build con EAS. |
| 04 | [`04-infraestructura-y-deploy.md`](04-infraestructura-y-deploy.md) | Docker Compose, los **tres** archivos compose (y por que el `override` jamas debe llegar a produccion), Caddy y TLS, variables de entorno de infraestructura, procedimiento de deploy, operacion, rollback, entorno local y troubleshooting. |
| 05 | [`05-modelo-de-datos.md`](05-modelo-de-datos.md) | El esquema Oracle `<ver ORACLE_USER en .env>`: catalogo de tablas por dominio, que es preexistente y que se creo aqui, por que casi no hay foreign keys, idempotencia, indice de migraciones y como aplicar una migracion nueva en produccion. |
| 06 | [`06-tiendas-ios-android.md`](06-tiendas-ios-android.md) | Publicacion en App Store y Google Play: identificadores, estado de la revision, declaraciones de privacidad y Data safety, assets, firma de aplicaciones, cuentas demo para revisores y procedimiento repetible de release. |
| 07 | [`07-credenciales-y-accesos.md`](07-credenciales-y-accesos.md) | Inventario **sin valores** de cuentas, consolas, variables de entorno y archivos sensibles: para que sirve cada credencial, donde vive y como se restaura. |
| 08 | [`08-RECUPERACION-DESDE-CERO.md`](08-RECUPERACION-DESDE-CERO.md) | **Runbook** paso a paso para el escenario "se formateo la PC": que instalar, como clonar, como restaurar los secretos desde el respaldo, como verificar el entorno, como recuperar cada consola y como volver a desplegar. |

**Por donde empezar segun tu caso:**

| Si vienes a... | Lee, en este orden |
|---|---|
| Retomar el proyecto tras formatear la PC | **08** → 04 §10 → 07 |
| Tocar el backend | 01 → 05 → 04 |
| Tocar el panel web | 02 → 01 (seccion de endpoints admin) |
| Tocar la app movil | 03 → 01 (seccion `/public/*`) → 06 |
| Desplegar o diagnosticar produccion | 04 → 07 |
| Publicar una version en las tiendas | 06 → 03 §10 |
| Cambiar el esquema de la base | 05 → 01 §7 |

---

## 4. Mapa rapido: URLs de produccion y consolas

### 4.1 Produccion

| Que | URL |
|---|---|
| Panel administrativo | https://connecthub.fourstacklabs.com |
| API publica (tras Caddy) | https://connecthub.fourstacklabs.com/api |
| Swagger de la API | https://connecthub.fourstacklabs.com/api/docs |
| Healthcheck | https://connecthub.fourstacklabs.com/api/health |
| Pagina de estado (API / Oracle / Redis) | https://connecthub.fourstacklabs.com/estado |
| Politica de privacidad (exigida por tiendas) | https://connecthub.fourstacklabs.com/privacy |
| Eliminacion de cuenta (exigida por tiendas) | https://connecthub.fourstacklabs.com/eliminar-cuenta |
| Verificacion publica de un certificado | https://connecthub.fourstacklabs.com/c/&lt;CODIGO&gt; |
| Verificacion de correo del asistente | https://connecthub.fourstacklabs.com/verify?token=… |
| Reset de contrasena del asistente | https://connecthub.fourstacklabs.com/reset?token=… |
| Receptor de webhooks FSL | https://connecthub.fourstacklabs.com/api/fsl/webhooks |

### 4.2 Consolas y paneles externos

| Servicio | Donde se entra | Identificador clave |
|---|---|---|
| Repositorio | https://github.com/raulalcivarm10/CONNECT-HUB | rama `main` |
| Servidor de produccion | `ssh root@209.126.77.72` | app en `/root/app` |
| Google Play Console | https://play.google.com/console | QuadraTech SA · developerId `7448208356938367193` · appId `4975218640913412885` |
| App Store Connect | https://appstoreconnect.apple.com | SKU `connecthub-ios-001` · bundle `com.fourstacklabs.connecthub` |
| Expo / EAS | https://expo.dev · `eas login` | `alcivator/connecthub` · projectId `2a694ac0-ff07-434e-96ee-e508e498facb` |
| Google Cloud (OAuth) | https://console.cloud.google.com/apis/credentials?project=338617760077 | proyecto **338617760077** ("pagos"), **NO** "ueesApp" |
| Google Workspace (SMTP) | https://admin.google.com | buzon `support@fourstacklabs.com` |
| Oracle | `<ver ORACLE_CONNECT_STRING en .env>` | esquema `<ver ORACLE_USER en .env>` (lo administra el DBA externo) |
| NAS de archivos | `https://api-ligaprocorp.ec:3443/api` | operado por equipo externo, sin credencial propia |
| Nuvei / Paymentez | back-office **por institucion** | llaves en la tabla `INSTITUCIONES` de Oracle, no en el `.env` |

### 4.3 Rutas locales importantes

| Que | Ruta |
|---|---|
| Monorepo | `C:/proyectos/CONNECT-HUB` |
| **Respaldo de secretos (fuera del repo)** | `C:/proyectos/CONNECTHUB-RESPALDO` |
| Capturas de App Store (1284x2778) | `C:/proyectos/capturas-appstore` |
| Capturas de Play Store (1080x2160 + icon-512 + feature graphic) | `C:/proyectos/capturas-playstore` |
| App bundle Android de produccion | `C:/proyectos/connecthub-1.0-android.aab` |

---

## 5. Estado del proyecto al 2026-07-19

### 5.1 Publicacion en tiendas — **ambas en revision**

| Tienda | Identificador | Version enviada | Estado |
|---|---|---|---|
| **App Store (iOS)** | `com.fourstacklabs.connecthub` · SKU `connecthub-ios-001` | **1.0 build (13)** | 🟡 **En revision de Apple** |
| **Google Play (Android)** | `com.fourstacklabs.connecthub` · appId `4975218640913412885` | **1.0.0 versionCode 2** | 🟡 **Enviada a revision**, 177 paises |

Detalles que importan para el momento de la aprobacion:

- **Android:** la *publicacion administrada* (managed publishing) esta **DESACTIVADA**. En
  cuanto Google apruebe, la app queda **visible al publico automaticamente** en los 177
  paises, sin paso manual. Todo lo que deba estar listo (datos demo limpios, eventos
  correctos) tiene que estarlo **antes** de la aprobacion.
- **iOS:** verifica en App Store Connect → version 1.0 → *Version Release* si esta en
  *Automatically release* o *Manually release* antes de asumir que saldra sola.
- Un build anterior de iOS (1.0 (3)) fue **rechazado** por dos guidelines, **ambas ya
  resueltas**: 4.8 (falta de *Sign in with Apple*) y 5.1.1(v) (falta de eliminacion de
  cuenta desde la app).

### 5.2 La app vieja de Android quedo retirada

Existen **dos** apps en Play Console y confundirlas es facil:

| App | appId | Package | Estado |
|---|---|---|---|
| **Vigente (Expo)** | `4975218640913412885` | `com.fourstacklabs.connecthub` | ✅ **ACTIVA** — es la que se publica |
| Vieja (Ionic) | `4973167685542698921` | `com.quadratech.connecthub` | ⛔ **ANULADA / no publicada** — no tocar |

Todo el trabajo actual va contra el appId `4975218640913412885`.

### 5.3 Backend, panel e infraestructura

- ✅ **En produccion y estables.** No requieren despliegue para publicar la app movil.
- ✅ Play App Signing **activado** (Google custodia la clave de firma final; nosotros solo
  tenemos la upload key, custodiada por EAS).
- ✅ Cuentas demo para revisores creadas: `reviewer1@` y `reviewer2@connecthub.fourstacklabs.com`,
  codigo de institucion `DEMO123` → "Demo Institution" (`idInstitucion` 104).
- ✅ Eventos **161 y 201** ocultos (`NO_PUBLICAR='S'`) para las capturas y la revision.
- ✅ Respaldo de secretos creado en `C:/proyectos/CONNECTHUB-RESPALDO` (fuera del repo).

### 5.4 Pendientes conocidos al cierre

| Prioridad | Pendiente | Referencia |
|---|---|---|
| 🔴 | **Google Sign-In no funcionara en la version de Play**: falta registrar el client OAuth Android con el SHA-1 de la **App Signing key** (no el de la upload key). | `06-tiendas-ios-android.md` §12(1) |
| 🟠 | Falta la funcion **Reportar / Bloquear** en el chat privado (requisito de contenido generado por usuarios) — planificado para 1.0.1. | `06` §12(2) |
| 🟡 | Tras la aprobacion: **republicar los eventos 161 y 201**, limpiar datos demo y **eliminar las cuentas de revisor**. | `06` §12(3) |
| 🟡 | Falta subir el archivo de **mapping de R8** a Play Console. | `06` §12(4) |
| 🟡 | Completar el respaldo: **`.env` de produccion**, clave SSH del servidor, `.p8` de App Store Connect y codigos 2FA. | `CONNECTHUB-RESPALDO/LEEME-PRIMERO.md` §4 |
| ⚪ | Rutas `/mapas/*` implementadas pero **no registradas** en `OperativaModule` → hoy devuelven 404. | `01-backend-api.md` §2 |

---

## 6. Documentacion previa (sigue vigente)

Este manual **no reemplaza** los documentos anteriores de `docs/`; los organiza y los
resume. Consulta el original cuando necesites el detalle fino:

| Tema | Documento |
|---|---|
| Levantar el servidor desde cero | `SERVER_SETUP.md` (raiz del repo) |
| APIs en produccion | `docs/apis-produccion.md` |
| Modelo de datos (original) | `docs/modelo-datos.md` |
| Publicar en tiendas (paso a paso) | `docs/publicar-tiendas.md`, `docs/entrega-tiendas-equipo.md` |
| SMTP y App Passwords | `docs/smtp-setup.md` |
| Espacios y entidades del NAS | `docs/nas-espacios.md` |
| Checkout de pagos | `docs/checkout-paymentez.md` |
| Webhooks de FourStackLabs | `docs/fsl-webhooks-connecthub.md` |
| Vision de producto | `docs/producto-connecthub.md` |
| Que apunta a localhost y que no | `docs/inventario-localhost.md` |
| Eventos ocultos para la revision | `docs/eventos-no-publicar.md` |
| Migraciones SQL | `docs/sql/*.sql` |
