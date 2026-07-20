# Modelo de datos (Oracle)

Ultima actualizacion: 2026-07-19

Este documento describe el esquema Oracle completo sobre el que corre CONNECT-HUB:
qué tablas existían antes del proyecto (y no se deben alterar), cuáles creamos
nosotros, cómo se relacionan, y cómo se aplica una migración nueva en producción.

Fuentes contrastadas para escribirlo:

- `docs/modelo-datos.md` (análisis original del esquema, 2026-07-04).
- Todos los scripts de `docs/sql/*.sql` (18 archivos).
- Las consultas SQL reales de `apps/api/src/**/*.ts` (NestJS + `oracledb` en modo thin).

---

## 1. Datos de conexión y entorno

| Concepto | Valor |
|---|---|
| Motor | Oracle Database 21c XE |
| Esquema / usuario | `<ver ORACLE_USER en .env>` |
| Host de producción | `<ver ORACLE_CONNECT_STRING en .env>` (servidor de BD **distinto** al de la app) |
| Servidor de la app | `209.126.77.72`, código en `/root/app` |
| Driver | `node-oracledb` en **modo thin** (sin Instant Client) — ver `apps/api/src/database/oracle.service.ts` |
| Pool | `poolMin=2`, `poolMax=10`, `poolIncrement=1`, `poolTimeout=60` |

Variables de entorno que usa la API para conectarse (los **valores** viven en el
`.env` del servidor y en el respaldo fuera del repo; aquí solo los nombres):

| Variable | Para qué sirve |
|---|---|
| `ORACLE_USER` | usuario del esquema (obligatoria, `getOrThrow`) |
| `ORACLE_PASSWORD` | contraseña del esquema (obligatoria) |
| `ORACLE_CONNECT_STRING` | cadena `host:puerto/servicio` (obligatoria) |
| `ORACLE_POOL_MIN` | mínimo de conexiones del pool (opcional, def. 2) |
| `ORACLE_POOL_MAX` | máximo de conexiones del pool (opcional, def. 10) |

Comportamiento del pool: si Oracle no responde al arrancar, **la API igual levanta**;
`/health` reporta el estado y el pool se reintenta en el primer uso.

Configuración global del driver (fijada en `oracle.service.ts`):

- `outFormat = OUT_FORMAT_OBJECT` → cada fila es un objeto con las columnas **en MAYÚSCULAS**.
- `fetchAsString = [CLOB]` → los CLOB llegan como `string` (no como stream).
- `fetchAsBuffer = [BLOB]` → los BLOB llegan como `Buffer`.

> La BD **no** se despliega con la app: ya vive en la Oracle remota. `deploy.sh` solo
> hace `git reset --hard origin/main` + `docker compose up -d --build`. Las migraciones
> se aplican a mano (sección 8).

---

## 2. La regla más importante: esquema COMPARTIDO

El esquema `<ver ORACLE_USER en .env>` es **preexistente y compartido** con una aplicación
externa (la app móvil original / backend de terceros). Esto condiciona todo:

1. **Las tablas preexistentes NO se alteran de forma destructiva.** Solo se
   permiten cambios **aditivos** (columnas nuevas nullable, índices nuevos,
   triggers nuevos). Nunca `DROP COLUMN`, nunca cambiar un tipo, nunca renombrar,
   nunca cambiar una columna a `NOT NULL` sin default.
2. **Las tablas creadas por este proyecto** sí son nuestras y podemos evolucionarlas,
   pero incluso ahí se prefiere lo aditivo por si la app externa empieza a leerlas.
3. Cuando un cambio nuestro obliga a la app externa a hacer algo (por ejemplo el
   filtro `NO_PUBLICAR`), se documenta como **nota para el equipo externo** dentro
   del propio `.sql`, y se les comunica.

---

## 3. Catálogo de tablas por dominio

Leyenda de la columna **Origen**:

- 🟦 **PREEXISTENTE** — venía en el esquema, compartida con la app externa. **No alterar** salvo aditivo.
- 🟩 **NUEVA** — creada por este proyecto.

### 3.1 Instituciones y espacios físicos 🟦

Toda la jerarquía de espacios es preexistente.

| Tabla | Origen | PK | Propósito y columnas clave |
|---|---|---|---|
| `INSTITUCIONES` | 🟦 | `ID_INSTITUCION` | El tenant. `NOMBRE`, `DIRECCION`, `CIUDAD`, `PAIS`, logo en BLOB. Añadido por nosotros (aditivo): `ESTADO` (`PENDIENTE`/`APROBADA`/`RECHAZADA`/`SUSPENDIDA`), `FECHA_APROBACION`, `APROBADO_POR`. Contiene además `CODIGO_CONEXION` (el código que el asistente teclea en la app móvil, estilo Whova) y las **credenciales de pasarela**. |
| `LOCALES` | 🟦 | `ID_LOCAL` | Sede física. `ID_INSTITUCION` sin FK declarada. |
| `SALONES` | 🟦 | `ID_SALON` | `ID_LOCAL`, `ES_SUBDIVISIBLE` (`S`/`N`), `CAPACIDAD_MAX`. Sin FK. |
| `SUBSALONES` | 🟦 | `ID_SUBSALON` | Subdivisión de un salón. `ID_SALON` sin FK. |
| `SUBSALON_CONFIGURACIONES` | 🟦 | `ID_CONFIGURACION` | Particiones nombradas de un salón (p.ej. "Salón A+B"). |
| `SUBSALON_CONFIGURACION_SUBSALONES` | 🟦 | compuesta | M:N configuración ↔ subsalón. **Sí tiene FKs.** |
| `INSTITUCION_MAPAS` | 🟦 | `ID_MAPA` | Croquis en BLOB. FKs completas a institución/local/salón/subsalón/configuración. `ASIGNADO` y `ACTIVO` (`Y`/`N`). |
| `INSTITUCION_MAPA_SUBSALONES` | 🟦 | compuesta | M:N mapa ↔ subsalón. |
| `PAIS` | 🟦 | `COD_PAIS` | Catálogo de 178 países. |

**Credenciales de pasarela en `INSTITUCIONES`** — modelo de 3 credenciales Nuvei/Paymentez
(ver `apps/api/src/modules/public/pagos/pagos.service.ts`). Se documentan los **nombres**
de columna; los valores **jamás** salen de la BD ni aparecen en API/UI/logs:

| Columna | Uso |
|---|---|
| `PROVEEDOR_PAGO` | identificador del proveedor |
| `PAYMENT_ENVIROMENT` | `stg` / `prod` (nótese el typo original: *ENVIROMENT*) |
| `APP_CODE_TOKENIZATION` / `APP_KEY_TOKENIZATION` | tokenización de tarjeta (`card/add`) — credencial `…-CLIENT` |
| `USUARIO_PASARELA` / `CONTRASENA_PASARELA` | débito / verify / list / delete — credencial `…-SERVER` |
| `APP_CODE_CHECKOUT` / `APP_KEY_CHECKOUT` | checkout hospedado (link de pago) |

> Regla de API: **ningún endpoint devuelve estas columnas.** El fallback implementado es
> `serverCode = USUARIO_PASARELA ?? APP_CODE_CHECKOUT`.

### 3.2 Usuarios administradores del panel

⚠️ **Trampa de nombres.** Hay dos tablas casi homónimas y significan cosas distintas:

- `USUARIOS_INSTITUCIONES` (plural-plural) = **administradores del panel web**.
- `USUARIO_INSTITUCIONES` (singular-plural) = **vínculo cliente final ↔ institución**.

| Tabla | Origen | PK | Propósito y columnas clave |
|---|---|---|---|
| `USUARIOS_INSTITUCIONES` | 🟦 (muy ampliada) | `COD_USUARIO` `VARCHAR2(150)` | Admin del panel. `COD_USUARIO` **es el correo de login** (ampliado de 10 a 150 chars). `CLAVE` + `SALT` (PBKDF2-SHA256, 100 000 iteraciones: `CLAVE = base64(dk 32 bytes)`, `SALT = 'pbkdf2sha256$100000$<salt hex>'`). Añadidos: `NOMBRES`, `APELLIDOS`, `ES_SUPER` (`S`/`N`, superadmin de plataforma), `FECHA_REGISTRO`, `DEBE_CAMBIAR_CLAVE` (`S`/`N`). `ID_INSTITUCION` pasó a **NULLABLE** (el superadmin no pertenece a ninguna institución). |
| `ROLES_INSTITUCIONES` | 🟦 | `ID_ROL` | Catálogo de roles. Poblado por nosotros con 5 filas: `SYSTEM`, `ADMINISTRATIVO`, `FINANCIERO`, `GESTION OPERATIVA`, `EVENTOS`. |
| `USUARIO_ROL_INSTITUCION` | 🟦 | `ID_USUARIO_ROL` | M:N admin ↔ rol. **Sí tiene FKs.** `COD_USUARIO` también ampliado a 150. |

Constraints añadidos: `CHK_USUARIOS_INST_ES_SUPER` (`ES_SUPER IN ('S','N')`) y
`CHK_USR_INST_CAMBIAR_CLAVE` (`DEBE_CAMBIAR_CLAVE IN ('S','N')`).

Trigger de protección añadido: **`TRG_PROTEGE_SUPERADMIN`** — `BEFORE DELETE ... WHEN (OLD.ES_SUPER='S')`
lanza `ORA-20099`. Es la garantía de último nivel: ni el panel ni una sesión SQL suelta
pueden borrar al dueño del sistema.

### 3.3 Usuarios finales (asistentes) y auth móvil

| Tabla | Origen | PK | Propósito y columnas clave |
|---|---|---|---|
| `USUARIOS` | 🟦 (ampliada) | `ID_CLIENTE` `VARCHAR2(36)` | Cliente final / asistente. El ID es un **UUID generado por la API** (`randomUUID()`), no una secuencia. |
| `USUARIO_INSTITUCIONES` | 🟦 | `ID_USUARIO_INSTITUCIONES` | Vínculo asistente ↔ institución (se crea al canjear el `CODIGO_CONEXION`). Columnas usadas: `ID_CLIENTE`, `ID_INSTITUCION`, `ESTADO` (`'A'`), `FECHA_REGISTRO`. Sin FKs. |

Columnas de `USUARIOS` verificadas contra el código:

| Columna | Notas |
|---|---|
| `ID_CLIENTE` | UUID v4, `VARCHAR2(36)` |
| `EMAIL` | único; al eliminar cuenta se sustituye por el centinela `deleted-<id>@deleted.connecthub.local` |
| `NOMBRE`, `APELLIDO` | del **dueño** de la cuenta; van al certificado. Se bloquean cuando ya hay certificado emitido |
| `CLAVE_HASH` | hash empaquetado (PBKDF2); `NULL` en cuentas solo-social |
| `TIPO_USUARIO` | `'CLIENTE'` en los registros de la app |
| `IS_VERIFIED` | `NUMBER(38)`, se usa como 0/1 (tipo débil heredado) |
| `VERIFICATION_TOKEN`, `TOKEN_EXPIRA` | verificación de correo (`SYSTIMESTAMP + INTERVAL '1' DAY`) |
| `REFRESH_TOKEN` | refresh de sesión |
| `PERFIL_COMPLETO`, `ONBOARDING_COMPLETO` | `S`/`N` |
| `GOOGLE_ID` | Google Sign-In (preexistente) |
| `APPLE_ID` | 🟩 **añadida por nosotros** (`2026-07-16_apple_id.sql`) — claim `sub` del token de Apple; índice único `UX_USUARIOS_APPLE_ID` |
| `EMAIL_FACTURA` | 🟩 **añadida por nosotros** (`2026-07-17_email_factura.sql`) — correo de **facturación**, puede diferir del de la cuenta |
| `FOTO_URL` | URL de la foto en el NAS (`tipoEntidad=USUARIO`, `tipoArchivo=PERFIL`) con cache-bust `&v=<timestamp>` |
| `NUMERO_CELULAR`, `DIRECCION`, `FECHA_NACIMIENTO`, `GENERO`, `TIPO_ID`, `NUMERO_ID` | datos personales |
| `FECHA_CREACION`, `FECHA_ACTUALIZACION` | timestamps |

**Eliminación de cuenta (cumplimiento Apple 5.1.1(v))** — `DELETE /public/auth/me` no borra
la fila: **anonimiza**. Ver `asistente-auth.service.ts`. El orden importa y todo va en una
sola transacción (`withConnection` + `commit`):

1. `INSERT INTO LOG_PARTICIPANTES_EVENTO SELECT ...` → snapshot de participación **antes** de perder el nombre.
2. `DELETE` en cascada manual: `MENSAJE_PRIVADO` (por `ID_CHAT`) → `CHAT_PRIVADO` → `CONEXIONES` → `COMUNIDAD_MENSAJES` → `COMUNIDAD_MIEMBROS` → `PERFIL_ASISTENTE` → `USUARIO_PUSH_TOKENS` → `TARJETAS_USUARIO` → `USUARIO_INSTITUCIONES` → `ARCHIVOS`.
3. Retener lo financiero/asistencia quitando PII: `TARJETAS_EVENTOS_LOG.EMAIL = NULL`, `CERTIFICADOS.NOMBRE_ASISTENTE = 'Cuenta eliminada'`.
4. `UPDATE USUARIOS` → email centinela y `NULL` en nombre, apellido, foto, celular, `GOOGLE_ID`, `APPLE_ID`, dirección, fecha de nacimiento, género, tipo/número de ID, `CLAVE_HASH`, `REFRESH_TOKEN`, `VERIFICATION_TOKEN`, `TOKEN_EXPIRA`. Además **resetea los flags de estado**: `IS_VERIFIED = 0`, `PERFIL_COMPLETO = 'N'`, `ONBOARDING_COMPLETO = 'N'`, `FECHA_ACTUALIZACION = SYSTIMESTAMP`.

El flujo es **idempotente**: antes de nada lee el `EMAIL` y, si ya es el centinela,
devuelve `{ deleted: true }` sin tocar la BD. Ojo con el orden: `EMAIL_FACTURA` **no** se
anula hoy (revisar si debe considerarse PII a borrar).

La fila de `USUARIOS` **se conserva** para no romper las referencias financieras
(`PAGOS`, `EVENTOS_USUARIOS`). Las consultas de comunidad filtran cuentas eliminadas con
`LOWER(u.EMAIL) NOT LIKE '%@deleted.connecthub.local'`.

### 3.4 Eventos y su jerarquía

| Tabla | Origen | PK | Propósito |
|---|---|---|---|
| `EVENTOS` | 🟦 (muy ampliada) | `ID_EVENTO` | La entidad central. |
| `EVENTO_SUBSALONES` | 🟦 | (`ID_EVENTO`,`ID_SUBSALON`) | M:N evento ↔ subsalón ocupado. **Sí tiene FKs.** |
| `EVENTO_HORAS` | 🟩 | `ID_HORA` (identity) | **Horario por día** de eventos multi-día. |
| `EVENTO_DETALLE` | 🟩 | `ID_DETALLE` (identity) | Ficha formativa 1:1 con el evento. |
| `EVENTO_EXPOSITORES` | 🟩 | `ID_EXPOSITOR` (identity) | Ponentes del evento (1:N). |
| `EVENTO_CUPONES` | 🟩 | `ID_CUPON` (identity) | Cupones de descuento por evento. |
| `EVENTO_CERT_PLANTILLA` | 🟩 | `ID_EVENTO` | Plantilla-imagen del certificado del evento. |

#### `EVENTOS` — columnas

Preexistentes: `ID_EVENTO`, `TITULO`, `DESCRIPCION`, `FECHA_EVENTO`, `HORA_INICIO`,
`HORA_FIN` (ambas `VARCHAR2(20)` — tipo débil heredado), `ID_LOCAL`, `ID_SALON`,
`ID_SUBSALON`, `ID_CONFIGURACION`, `PRECIO`, `PUBLICO_ESPERADO`, `TIEMPO_SETUP_MIN`,
`TIEMPO_CLEAN_MIN`, `COD_ITEM`, `IMAGEN` (BLOB), `IMAGEN_URL`, `DESTACADO`, `ORDEN`.

Añadidas por este proyecto (todas aditivas y retrocompatibles):

| Columna | Migración | Semántica |
|---|---|---|
| `INCLUYE_IVA` `CHAR(1)` `S`/`N` | `2026-07-10_cupones_iva.sql` | si el precio ya incluye IVA |
| `MONTO_IVA` `NUMBER` | `2026-07-10_cupones_iva.sql` | monto de IVA |
| `NO_PUBLICAR` `CHAR(1)` `S`/`N` | `2026-07-10_no_publicar.sql` | reserva privada: ocupa el espacio pero **no** se muestra en la app |
| `FECHA_FIN` `DATE` | `2026-07-14_multidia_workshops.sql` | último día del evento |
| `ID_EVENTO_PADRE` `NUMBER` | `2026-07-14_multidia_workshops.sql` | **workshop**: apunta al evento principal. `NULL` = evento principal |

**Jerarquía padre/hijo (workshops).** Un workshop **es un `EVENTOS` más**, con
`ID_EVENTO_PADRE` apuntando al evento principal. Consecuencias implementadas:

- FK real `FK_EVENTO_PADRE` (auto-referencia) + índice `IX_EVENTOS_PADRE`.
- Validación de choque de espacio: el evento **principal** (sin padre) SÍ se valida
  contra otros eventos; el **hijo** NO se valida (ni contra el padre ni contra hermanos).
- Regla de inscripción (`entradas.service.ts::inscribir`): para inscribirse a un
  workshop hay que estar inscrito al padre. Si el padre es **gratis**, la API lo
  inscribe automáticamente; si es **de pago**, devuelve `409 PARENT_REQUIRED`.
  La misma regla se re-aplica **antes de pagar** (`pagos.service.ts::exigirPadre`),
  y allí el padre se consulta con un `SELECT` directo sobre `EVENTOS` **sin** el filtro
  de publicación: un padre en borrador debe bloquear igual la compra del hijo
  (falla "cerrado", no "abierto"). Si `ID_EVENTO_PADRE` está huérfano, no se exige nada.

**Multi-día.** `EVENTOS.FECHA_EVENTO` sigue siendo la fecha de **inicio** y
`HORA_INICIO`/`HORA_FIN` las del **primer día** (compatibilidad con la app externa).
El detalle real vive en `EVENTO_HORAS`, y `FECHA_EVENTO`/`FECHA_FIN` se sincronizan
desde el min/max de esa tabla.

`EVENTO_HORAS`: `ID_HORA`, `ID_EVENTO` (FK real), `FECHA`, `HORA_INICIO`, `HORA_FIN`,
`ORDEN`. Restricción `UQ_HORA_EVENTO_FECHA UNIQUE (ID_EVENTO, FECHA)` — un registro por día.

**Validación de disponibilidad.** El trigger `TRG_VALIDAR_EVENTO` existe pero **su cuerpo
está comentado (no valida nada)**. La validación real se hace en la API,
`eventos.service.ts::validarDisponibilidad`: mismo día + mismo salón o subsalones
compartidos + ventanas `[inicio - setup, fin + limpieza]` cruzadas.

#### `EVENTO_DETALLE` (1:1, `UNIQUE(ID_EVENTO)`)

`DESCRIPCION_CORTA`, `DESCRIPCION_LARGA` (CLOB), y arrays JSON validados con
`IS JSON`: `QUE_APRENDERAS`, `TEMAS`, `REQUISITOS`, `PUBLICO_OBJETIVO`,
`BIBLIOGRAFIA` (`[{tipo,titulo,autor,url}]`).
Clasificación: `NIVEL` (`PRINCIPIANTE`/`INTERMEDIO`/`AVANZADO`), `MODALIDAD`
(`PRESENCIAL`/`ONLINE`/`HIBRIDO`), `RITMO` (`EN_VIVO`/`A_TU_RITMO`),
`DURACION_VALOR` + `DURACION_UNIDAD` (`HORAS`/`SEMANAS`/`SESIONES`/`DIAS`),
`ESFUERZO_HS_SEMANA`, `IDIOMA` (def. `es`), `IMAGEN_URL`, `VIDEO_PROMO_URL`.
Config de certificado: `CERT_HABILITADO` (0/1), `CERT_TIPO`
(`ASISTENCIA`/`PARTICIPACION`/`FINALIZACION`), `CERT_ENTREGA`
(`DESCARGA`/`EMAIL`/`APP`), `CERT_UMBRAL_ASISTENCIA` (0–100).

#### `EVENTO_EXPOSITORES` (1:N)

`NOMBRE_COMPLETO` (obligatorio), `CARGO`, `ORGANIZACION`, `TAGLINE`, `BIO` (CLOB),
`BIBLIOGRAFIA` (CLOB), `FOTO_URL`, `EMAIL` (**interno — nunca exponer en API/UI pública**),
`UBICACION`, `SITIO_WEB_URL`, `REDES_SOCIALES` (JSON `[{tipo,url}]`),
`ROL` (`EXPOSITOR`/`CO_EXPOSITOR`/`MODERADOR`/`KEYNOTE`), `ES_DESTACADO` (0/1),
`ORDEN`, `IS_ACTIVE` (0/1), `FECHA_REGISTRO`.
Índice `IX_EXPOSITOR_EVENTO (ID_EVENTO, ORDEN)`.

> Decisión de diseño: los expositores están **embebidos en el evento** (no se
> reutilizan entre eventos). Si más adelante hace falta reutilizarlos, se promueve
> a entidad propia + tabla puente sin romper lo existente.

#### `EVENTO_CUPONES`

`ID_CUPON`, `ID_EVENTO` (FK real `FK_CUPON_EVENTO`), `CODIGO`, `MONTO_DESCUENTO`,
`ACTIVO` (`S`/`N`), `FECHA_REGISTRO`. Único: `UQ_CUPON_EVENTO_CODIGO (ID_EVENTO, CODIGO)`.

Ampliación (`2026-07-14_cupones_porcentaje_maxusos.sql`):

| Columna | Semántica |
|---|---|
| `TIPO_DESCUENTO` `CHAR(1)` | `'M'` = monto fijo USD (default, retrocompatible), `'P'` = porcentaje (0.01–100) |
| `MAX_USOS` `NUMBER` | `NULL` = ilimitado; `N` = se agota tras N canjes |
| `USOS` `NUMBER` | contador, se incrementa en cada canje |

`MONTO_DESCUENTO` pasa a leerse como "el valor del descuento", interpretado según
`TIPO_DESCUENTO`. Los cupones creados antes quedan como `'M'` sin tope.

### 3.5 Inscripciones y entradas

| Tabla | Origen | PK | Propósito |
|---|---|---|---|
| `EVENTOS_USUARIOS` | 🟦 | `ID_EVENTO_USUARIO` | **La fuente única de verdad de inscripciones y entradas.** |
| `ENTRADAS_EVENTO` | 🟦 | `ID_ENTRADA` (identity) | Tabla de entradas QR del esquema original. **En la práctica está vacía y este proyecto NO la usa.** |

`EVENTOS_USUARIOS` — columnas usadas por la API:

| Columna | Notas |
|---|---|
| `ID_EVENTO_USUARIO` | PK asignada por trigger + secuencia → **el INSERT no envía el ID** |
| `ID_EVENTO`, `ID_CLIENTE` | sin FK declarada |
| `ESTADO` | `S`=Suscrito, `C`=Cancelado, `A`=Asistió, `N`=No asistió. La API inserta `'S'` |
| `QR_TOKEN` | token secreto del QR, formato `TCK-XXXX-XXXX` en base32 sin caracteres ambiguos (alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) |
| `ASISTIO` | `S`/`N`; el check-in lo pone en `'S'` |
| `FECHA_ENTRADA` | momento del check-in |
| `FECHA_REGISTRO` | `SYSDATE` al inscribirse |

Flujo de check-in (`entradas.service.ts::validar`): se busca por `QR_TOKEN`, si
`ASISTIO<>'S'` se marca asistencia **y se emite el certificado**. Es idempotente:
volver a escanear devuelve `yaAsistio: true` sin duplicar nada.

> **Precondición de datos para inscribirse.** `entradas.service.ts::exigirNombreCompleto`
> bloquea la inscripción —**gratis o de pago**— si `USUARIOS.NOMBRE`/`APELLIDO` están
> vacíos: son el nombre que se imprimirá en el certificado. Es la contrapartida del
> `409 NAME_LOCKED` de §3.7 (una vez emitido un certificado el nombre ya no se cambia).

> ⚠️ Divergencia consciente entre el esquema y el proyecto: existe `ENTRADAS_EVENTO`
> (con `QR_TOKEN` único, `QR_HASH`, `INTENTOS_VALIDACION` y FKs reales), pero el flujo
> implementado usa `EVENTOS_USUARIOS.QR_TOKEN` porque es lo que la app externa ya lee.
> Si algún día se migra a `ENTRADAS_EVENTO`, hay que migrar ambas apps a la vez.

### 3.6 Pagos y tarjetas 🟦

| Tabla | Origen | PK | Propósito |
|---|---|---|---|
| `PAGOS` | 🟦 | `ID_PAGO` | Cabecera del pago. `REFERENCIA` es única. FK real solo a `EVENTOS_USUARIOS`. |
| `TARJETAS_USUARIO` | 🟦 | `ID_TARJETA` (identity) | Tarjetas tokenizadas. FKs reales a `USUARIOS` e `INSTITUCIONES`. |
| `TARJETAS_EVENTOS_LOG` | 🟦 | `ID_LOG` (identity) | Auditoría de operaciones con tarjeta, `RESPONSE_JSON` CLOB. |

`PAGOS` — columnas escritas/leídas por la API:

`REFERENCIA` (única), `PASARELA` (`'paymentez'`), `MONTO`, `MONEDA` (`'USD'`),
`ESTADO` (`PENDIENTE` → `APPROVED`, además `GRATUITO`), `TIPO_PAGO`
(`PENDIENTE` → `EXITOSO`; default de esquema `DEBITO`), `ULTIMOS_4`,
`MARCA_TARJETA`, `ES_GRATIS` (`S`/`N`), `FECHA_REGISTRO`, `FECHA_PAGO`,
`ID_EVENTO`, `ID_CLIENTE` (`VARCHAR2(100)` aquí vs `VARCHAR2(36)` en `USUARIOS`
— inconsistencia heredada), `ID_EVENTO_USUARIO`, `ORIGEN_PAGO`, `METODO_PAGO`,
`TRANSACCION_ID`, `DETALLE_ESTADO`, `RESPONSE_JSON` (CLOB).

**Patrón anti-doble-emisión.** La aprobación usa un UPDATE condicional atómico
que serializa `confirm` / webhook / reintentos por bloqueo de fila:

```sql
UPDATE PAGOS
   SET ESTADO = 'APPROVED', TIPO_PAGO = 'EXITOSO',
       TRANSACCION_ID = COALESCE(:tid, TRANSACCION_ID),
       DETALLE_ESTADO = :det, RESPONSE_JSON = :resp, FECHA_PAGO = SYSDATE
 WHERE ID_PAGO = :id AND ESTADO = 'PENDIENTE'
```

Solo el proceso que obtiene `rowsAffected = 1` emite la entrada; después enlaza
con `UPDATE PAGOS SET ID_EVENTO_USUARIO = :eu`.

**Lectura desde el panel — dashboard financiero** (`finanzas.service.ts`). Es el otro
consumidor de `PAGOS` además del flujo de pago. Reglas que fija ese módulo:

- Los **estados reales en BD son tres**: `APPROVED` (recaudado), `PENDIENTE`, `GRATUITO`.
- Todo lo que suma dinero filtra `ESTADO = 'APPROVED'` — **los pendientes nunca se
  cuentan como recaudo** (era un bug: mostraba pendientes como ingresos).
- Los `GRATUITO` se reportan aparte, como conteo (`numGratuitos`), no como monto.
- La institución del pago se deriva del evento con el `COALESCE` de §10.9
  (`EVENTOS.ID_LOCAL` o `EVENTOS.ID_SALON → SALONES.ID_LOCAL`), porque `PAGOS`
  no tiene `ID_INSTITUCION`.

`TARJETAS_USUARIO`: `ID_CLIENTE`, `EMAIL`, `TOKEN`, `BIN`, `LAST4`, `TIPO`, `BANCO`,
`HOLDER_NAME`, `EXPIRY_MONTH`, `EXPIRY_YEAR`, `STATUS` (`'A'` activa / `'X'` borrada
lógica), `ORIGIN` (`'Paymentez'`), `TRANSACTION_REFERENCE`, `PREDETERMINADO` (0/1),
`ID_INSTITUCION`, `FECHA_REGISTRO`. La primera tarjeta activa de un cliente por
institución queda `PREDETERMINADO = 1`; al borrar la predeterminada se promueve otra.

> **Enmascaramiento:** la API solo devuelve `LAST4`/`ULTIMOS_4` y la marca. `TOKEN` y
> credenciales no salen nunca.
>
> **Límite de pagos:** el cobro real lo ejecuta la app móvil/pasarela; el panel solo
> guarda configuración (precios, cupones, IVA).

### 3.7 Certificados

| Tabla | Origen | PK | Propósito |
|---|---|---|---|
| `CERTIFICADOS` | 🟩 (**sin script en `docs/sql/`** — ver §7) | `ID_CERTIFICADO` | Registro de emisión al asistir. |
| `EVENTO_CERT_PLANTILLA` | 🟩 | `ID_EVENTO` | Plantilla-imagen por evento + config del overlay. |

`CERTIFICADOS` — columnas verificadas contra el código
(`entradas.service.ts`, `eventos.service.ts`):
`ID_CLIENTE`, `ID_EVENTO`, `ID_EVENTO_USUARIO`, `CODIGO` (formato
`CERT-<12 hex mayúsculas>`, **único** — la emisión captura `ORA-00001` para ser
idempotente), `TIPO` (`ASISTENCIA`/`PARTICIPACION`/`FINALIZACION`/`APROBACION`),
`NOMBRE_ASISTENTE` (nombre "congelado" al emitir), `TITULO_EVENTO`, `INSTITUCION`,
`ESTADO` (se consulta `= 'EMITIDO'`), `FECHA_EMISION`.

Unicidad efectiva: **un certificado por (`ID_CLIENTE`, `ID_EVENTO`)**.

**Dos vías de emisión** (ambas insertan en `CERTIFICADOS` con las mismas 8 columnas y
ambas capturan `ORA-00001`):

| Vía | Dónde | `TIPO` |
|---|---|---|
| Automática al hacer check-in del QR | `entradas.service.ts::validar` | fijo `'ASISTENCIA'` |
| **En lote desde el panel** — `POST /eventos/:id/certificados/generar` | `eventos.service.ts::generarCertificadosLote` | variable (`ASISTENCIA`/`PARTICIPACION`/`FINALIZACION`/`APROBACION`) |

El lote acepta `idsClientes` seleccionados o, si no se envían, **todos los que asistieron**.
Endpoints del panel relacionados: `GET /eventos/:id/asistentes-certificados`
(lista con `certificadoCodigo` ya emitido) y `GET /eventos/:id/gafetes`
(participantes con entrada + QR de check-in, para imprimir).

`EVENTO_CERT_PLANTILLA`: `ID_EVENTO` (PK y FK), `IMAGEN` (BLOB, obligatorio),
`IMAGEN_MIME` (def. `image/png`), `ANCHO`, `ALTO`, `CONFIG_JSON` (CLOB), `FECHA_REGISTRO`.

`CONFIG_JSON` guarda la posición/estilo del overlay en **fracciones**
(resolución-independiente):

Los 7 campos posibles (`CAMPOS_CERT`) son `nombre`, `evento`, `fecha`, `tipo`, `hora`,
`institucion`, `codigo`; **todos opcionales** — solo se dibuja el que esté presente en la
config *y* tenga dato. Si el evento aún no guardó config, se usa el default de los **tres
core** centrados:

```json
{ "nombre": {"x":0.5,"y":0.46,"size":0.06,"color":"#1e293b","align":"center","weight":"bold"},
  "evento": {"x":0.5,"y":0.60,"size":0.035,"color":"#334155","align":"center"},
  "fecha":  {"x":0.5,"y":0.72,"size":0.028,"color":"#334155","align":"center"} }
```

`x`,`y` = fracción del ancho/alto (punto de anclaje); `size` = fracción del alto (font-size).

**El certificado renderizado NO se persiste:** se genera on-demand con `sharp`
(`apps/api/src/modules/public/entradas/certificado-render.ts`) combinando la plantilla +
los datos. La `fecha` se formatea como "16 de julio de 2026".

> **WYSIWYG panel ↔ PNG.** Dos detalles del render que hay que preservar al tocar esto:
> la `y` del SVG es la *línea base*, pero el editor del panel centra el texto en `(x,y)`,
> así que se baja la baseline `0.35 * font-size` (en px, no `em`: librsvg no siempre
> resuelve `em` en `dy`); y se fuerza **Liberation Sans** (instalada en la imagen Docker),
> métricamente compatible con la Arial que el navegador del admin usa. Sin esa fuente
> Arial cae a DejaVu, más ancha, y el PNG deja de coincidir con la vista previa.

**Regla de nombre en el certificado:** se usa el nombre **actual** del perfil
(`USUARIOS.NOMBRE`/`APELLIDO`) y solo se cae al `NOMBRE_ASISTENTE` congelado si el
perfil no tiene nombre **y ese valor congelado no es un correo** — porque las cuentas
de Apple llegan con un email de relay y el certificado nunca debe mostrar un correo.
Recíprocamente, una vez emitido un certificado el perfil **bloquea** el cambio de
nombre/apellido (`409 NAME_LOCKED`).

### 3.8 Comunidad, networking y chats 🟩

Todas nuevas. Ninguna tiene script en `docs/sql/` (ver §7).

| Tabla | PK | Propósito y columnas |
|---|---|---|
| `PERFIL_ASISTENTE` | `ID_CLIENTE` (1:1 con `USUARIOS`) | Extensión de perfil para networking sin tocar `USUARIOS`: `PROFESION`, `EMPRESA`, `BIO`, `LINKEDIN_URL`, `VISIBILIDAD` (`PUBLICO`/`PRIVADO`, se lee con `NVL(...,'PUBLICO')`), `FECHA_ACTUALIZACION`. |
| `CONEXIONES` | `ID_CONEXION` | Solicitudes de conexión: `ID_SOLICITANTE`, `ID_DESTINATARIO`, `ESTADO` (`PENDIENTE`/`ACEPTADA`/`RECHAZADA`), `FECHA_SOLICITUD`, `FECHA_RESPUESTA`. Único por par dirigido (se captura `ORA-00001`). |
| `COMUNIDAD_MIEMBROS` | (`ID_EVENTO`,`ID_CLIENTE`) | **Opt-out**: con entrada estás dentro salvo que exista fila con `ESTADO='SALIO'`. Columnas: `ID_EVENTO`, `ID_CLIENTE`, `ESTADO` (`ACTIVO`/`SALIO`), `FECHA_INGRESO`, `FECHA_SALIDA`. |
| `COMUNIDAD_MENSAJES` | `ID_MENSAJE` (identity) | Muro por evento: `ID_EVENTO`, `ID_CLIENTE`, `MENSAJE`, `ESTADO` (`'ACTIVO'`), `FECHA_REGISTRO`. |
| `CHAT_PRIVADO` | `ID_CHAT` (identity) | Conversación 1-a-1: `ID_CLIENTE_A`, `ID_CLIENTE_B`. **La pareja se normaliza (A < B lexicográficamente)** para deduplicar; único sobre el par. |
| `MENSAJE_PRIVADO` | `ID_MENSAJE` (identity) | `ID_CHAT`, `ID_REMITENTE`, `MENSAJE`, `LEIDO` (`S`/`N`), `FECHA_REGISTRO`. |

**Reglas de acceso implementadas:**

- La comunidad es **por evento**, y la única puerta es tener entrada:
  `EXISTS (SELECT 1 FROM EVENTOS_USUARIOS WHERE ID_CLIENTE=:c AND ID_EVENTO=:e)`.
- La lista de participantes muestra **solo perfiles públicos**, excluye al propio
  usuario, a los que salieron y a las cuentas anonimizadas.
- Chat privado: libre con perfiles `PUBLICO`; con `PRIVADO` requiere conexión
  `ACEPTADA`. El gate se **re-evalúa al enviar cada mensaje** (el otro puede haberse
  vuelto privado desde que se abrió el chat) → `403 CONEXION_REQUERIDA`.
- Un perfil privado sin conexión expone lo mínimo (`limitado: true`) y **nunca** deriva
  el nombre del email (fuga de privacidad); usa `'Asistente'` como fallback neutro.

### 3.9 Notificaciones push 🟩

`USUARIO_PUSH_TOKENS` — PK `ID_TOKEN`. Columnas: `ID_CLIENTE`, `EXPO_TOKEN`,
`PLATFORM`, `ESTADO` (`'ACTIVO'`), `FECHA_ACTUALIZACION`. `EXPO_TOKEN` es único
por dispositivo: al registrar, primero se borra el token si pertenecía a otro cliente
(re-asignación de dispositivo), luego update-o-insert.

Envío: al crear un evento publicable, se buscan los tokens de los usuarios vinculados
a esa institución vía `USUARIO_INSTITUCIONES` y se envía a la Expo Push API en lotes
de 100. Es **fire-and-forget y fail-soft**: nunca lanza, para no frenar la creación del
evento en el panel. Solo acepta tokens que empiecen por `ExponentPushToken`/`ExpoPushToken`.

### 3.10 Archivos / NAS 🟦

`ARCHIVOS` — PK `ID_ARCHIVO`. Tabla **polimórfica**: `TIPO_ENTIDAD` + una columna de
ID por cada tipo de entidad. Columnas de datos: `NOMBRE_ORIGINAL`, `NOMBRE_FISICO`,
`MIME_TYPE`, `TAMANIO_BYTES`, `URL_ARCHIVO`, `ACTIVO` (`S`/`N`), `TIPO_ARCHIVO`
(`PORTADA`, `GALERIA`, `LOGO`, `BANNER`, `DOCUMENTO`, `CROQUIS`, `FOTO`, `PERFIL`).

Mapeo entidad → columna de ID (`archivos.service.ts`):

| `TIPO_ENTIDAD` | Columna |
|---|---|
| `EVENTO` | `ID_EVENTO` |
| `INSTITUCION` | `ID_INSTITUCION` |
| `LOCAL` | `ID_LOCAL` |
| `SALON` | `ID_SALON` |
| `SUBSALON` | `ID_SUBSALON` |
| `CONFIGURACION` | `ID_CONFIGURACION` |
| `EXPOSITOR` | `ID_EXPOSITOR` (añadida por nosotros, con FK a `EVENTO_EXPOSITORES`) |
| `USUARIO` | `ID_CLIENTE` |

CHECK ampliado por nosotros (`CHK_ARCHIVOS_TIPO_ENT`, tras hacer drop del anterior
`CHK_ARCHIVOS_TIPO_ENTIDAD`):
`TIPO_ENTIDAD IN ('EVENTO','INSTITUCION','LOCAL','SALON','SUBSALON','CONFIGURACION','EXPOSITOR')`.

Comportamiento: se mantiene **un registro único y estable** por
(entidad + id + `TIPO_ARCHIVO`). La primera subida crea la fila; las ediciones
conservan el mismo `ID_ARCHIVO` y se borra la fila extra que el NAS crea en cada carga.

> ⚠️ **Límite del NAS externo:** solo soporta 6 entidades. `EXPOSITOR` está lista en el
> panel pero el NAS debe habilitarla; mientras tanto `nas.service.ts` avisa que no la
> soporta. Para imágenes nuevas (p.ej. foto de expositor) usar **columna URL**, no el NAS.
>
> ⚠️ **Inconsistencia detectada en el código:** el borrado de cuenta ejecuta
> `DELETE FROM ARCHIVOS WHERE ID_USUARIO = :id`, pero el mapeo de entidad `USUARIO`
> apunta a `ID_CLIENTE`. Una de las dos referencias está mal; verificar contra el
> esquema real antes de tocar (`asistente-auth.service.ts:689` vs `archivos.service.ts:14`).
> Si la columna correcta es `ID_CLIENTE`, ese `DELETE` **falla dentro de la transacción de
> borrado de cuenta** (ORA-00904) y tumba la anonimización entera. Prioridad alta.
>
> ⚠️ **Segunda contradicción, en el propio esquema:** `COLUMNA_ID` mapea la entidad
> `USUARIO`, pero `CHK_ARCHIVOS_TIPO_ENT` **solo admite 7 valores y `'USUARIO'` no está
> entre ellos**. Cualquier `INSERT` con `TIPO_ENTIDAD='USUARIO'` sería rechazado por el
> CHECK. En la práctica no explota porque la foto de perfil la registra el NAS directo
> (ver el comentario en `archivos.service.ts`), pero el mapa del código promete algo que
> la BD no acepta. Al habilitar `EXPOSITOR`/`USUARIO` en el NAS hay que ampliar el CHECK.

### 3.11 Auditoría, webhooks y feedback 🟩

| Tabla | PK | Propósito |
|---|---|---|
| `AUDITORIA_LOG` | `ID_LOG` (identity) | Actividad del panel. |
| `FSL_WEBHOOK_EVENTS` | `EVENT_ID` | Idempotencia de webhooks de FourStackLabs. |
| `FEEDBACK` | `ID_FEEDBACK` (identity) | Sugerencias y problemas reportados desde el panel. |
| `LOG_PARTICIPANTES_EVENTO` | `ID_LOG` (identity) | Snapshot de participación previo a anonimizar una cuenta. |

`AUDITORIA_LOG`: `FECHA` (`TIMESTAMP DEFAULT SYSTIMESTAMP`), `USUARIO` (`COD_USUARIO`
o el intento de login), `ID_INSTITUCION`, `ACCION` (`LOGIN_OK`/`LOGIN_FAIL`/`CREATE`/
`UPDATE`/`DELETE`/`ERROR`), `METODO`, `RUTA`, `STATUS` (HTTP), `IP`, `DETALLE`
(resumen del body **con campos sensibles redactados**, máx. 2000).
Índices: `IX_AUDITORIA_FECHA`, `IX_AUDITORIA_USUARIO`.

`FSL_WEBHOOK_EVENTS`: `EVENT_ID` (PK, viene del header `X-FSL-Event-Id` → dedupe),
`EVENT_TYPE`, `STATUS` (`PROCESSED`/`SKIPPED_USER_EXISTS`), `RECEIVED_AT`, `PROCESSED_AT`.
Flujo: `POST /api/fsl/webhooks` (público, firma HMAC `X-FSL-Signature`, secreto en la
variable `FSL_WEBHOOK_SECRET`). Al recibir `subscription.created` se genera un
`CODIGO_CONEXION`, se crea la `INSTITUCIONES` en estado `APROBADA` con
`APROBADO_POR='FSL-WEBHOOK'`, se crea el usuario `SYSTEM` con `DEBE_CAMBIAR_CLAVE='S'`
y se envía el correo de bienvenida.

`FEEDBACK`: `USUARIO` (`COD_USUARIO` del autor), `ID_INSTITUCION`, `TIPO`
(`SUGGESTION`/`PROBLEM`/`OTHER`), `MENSAJE` (máx. 2000), `ESTADO`
(`NEW`/`REVIEWED`/`PLANNED`/`DONE`), `FECHA_REGISTRO`, y añadidas después:
`RESPUESTA` (CLOB), `FECHA_RESPUESTA`, `RESPONDIDO_POR`. "Respondido" se **deriva** de
`RESPUESTA IS NOT NULL`. Índice `IX_FEEDBACK_FECHA`.

`LOG_PARTICIPANTES_EVENTO`: `ID_CLIENTE`, `ID_EVENTO`, `NOMBRE`, `APELLIDO`, `EMAIL`,
`TIPO_ID`, `NUMERO_ID`, `TITULO_EVENTO`, `ASISTIO`, `ESTADO`, `FECHA_ENTRADA`,
`FECHA_ELIMINACION` (`SYSTIMESTAMP`). Índice `IX_LOG_PART_EVENTO`.

**Uso real (importante):** no es solo un archivo muerto. El **panel** lo lee para
recuperar el nombre/correo de las cuentas dadas de baja, mediante el patrón

```sql
LEFT JOIN (SELECT ID_CLIENTE, ID_EVENTO, MAX(NOMBRE) AS NOMBRE,
                  MAX(APELLIDO) AS APELLIDO, MAX(EMAIL) AS EMAIL
             FROM LOG_PARTICIPANTES_EVENTO GROUP BY ID_CLIENTE, ID_EVENTO) lg
       ON lg.ID_CLIENTE = eu.ID_CLIENTE AND lg.ID_EVENTO = eu.ID_EVENTO
-- luego COALESCE(u.NOMBRE, lg.NOMBRE), y el email solo si u.EMAIL es centinela
```

Está en cuatro consultas: reporte de inscritos (`reportes.service.ts`), asistentes para
certificados, generación de certificados en lote y **gafetes imprimibles**
(`eventos.service.ts`). Reglas que se respetan en todas: si no hay snapshot (bajas
anteriores al log) se muestra `'Cuenta eliminada'`, y el email de una cuenta anonimizada
**no** se devuelve al panel (`email: ''`) salvo el valor del snapshot en el reporte.
Sigue siendo de **uso interno del panel** (multi-tenant por institución); nunca se expone
a otros asistentes en la app móvil.

### 3.12 Vista

`VW_DISPONIBILIDAD` — vista preexistente de disponibilidad de espacios. El proyecto
no depende de ella (la validación de choques se hace en la API).

---

## 4. Resumen: preexistente vs. nuevo

### Tablas PREEXISTENTES (22) — compartidas con la app externa, **no alterar** salvo aditivo

`INSTITUCIONES`, `LOCALES`, `SALONES`, `SUBSALONES`, `SUBSALON_CONFIGURACIONES`,
`SUBSALON_CONFIGURACION_SUBSALONES`, `INSTITUCION_MAPAS`, `INSTITUCION_MAPA_SUBSALONES`,
`EVENTOS`, `EVENTO_SUBSALONES`, `USUARIOS`, `EVENTOS_USUARIOS`, `ENTRADAS_EVENTO`,
`PAGOS`, `TARJETAS_USUARIO`, `TARJETAS_EVENTOS_LOG`, `USUARIOS_INSTITUCIONES`,
`ROLES_INSTITUCIONES`, `USUARIO_ROL_INSTITUCION`, `USUARIO_INSTITUCIONES`,
`ARCHIVOS`, `PAIS`. Más la vista `VW_DISPONIBILIDAD`.

Columnas que **nosotros** añadimos a tablas preexistentes (todas aditivas):

| Tabla | Columnas añadidas |
|---|---|
| `USUARIOS_INSTITUCIONES` | `NOMBRES`, `APELLIDOS`, `ES_SUPER`, `FECHA_REGISTRO`, `DEBE_CAMBIAR_CLAVE` (+ ampliación de `COD_USUARIO`/`EMAIL` a 150, `ID_INSTITUCION` nullable) |
| `USUARIO_ROL_INSTITUCION` | ampliación de `COD_USUARIO` a 150 |
| `INSTITUCIONES` | `ESTADO`, `FECHA_APROBACION`, `APROBADO_POR` |
| `EVENTOS` | `INCLUYE_IVA`, `MONTO_IVA`, `NO_PUBLICAR`, `FECHA_FIN`, `ID_EVENTO_PADRE` |
| `USUARIOS` | `APPLE_ID`, `EMAIL_FACTURA` |
| `ARCHIVOS` | `ID_EXPOSITOR` (+ CHECK ampliado de `TIPO_ENTIDAD`) |

### Tablas CREADAS por este proyecto (17)

Con script en `docs/sql/`: `AUDITORIA_LOG`, `FSL_WEBHOOK_EVENTS`, `EVENTO_CUPONES`,
`FEEDBACK`, `EVENTO_DETALLE`, `EVENTO_EXPOSITORES`, `EVENTO_HORAS`,
`EVENTO_CERT_PLANTILLA`, `LOG_PARTICIPANTES_EVENTO`.

**Sin script en `docs/sql/`** (creadas ad-hoc, ver §7): `CERTIFICADOS`,
`PERFIL_ASISTENTE`, `CONEXIONES`, `COMUNIDAD_MIEMBROS`, `COMUNIDAD_MENSAJES`,
`CHAT_PRIVADO`, `MENSAJE_PRIVADO`, `USUARIO_PUSH_TOKENS`.

Objetos no-tabla creados por nosotros: trigger `TRG_PROTEGE_SUPERADMIN`; índices
`IX_AUDITORIA_FECHA`, `IX_AUDITORIA_USUARIO`, `IX_FEEDBACK_FECHA`,
`IX_EXPOSITOR_EVENTO`, `IX_EVENTOS_PADRE`, `IX_HORA_EVENTO`, `IX_LOG_PART_EVENTO`,
`UX_USUARIOS_APPLE_ID`; y 5 filas de catálogo en `ROLES_INSTITUCIONES`.

---

## 5. Convención: por qué casi no hay foreign keys

El esquema original declara FKs solo en las tablas más nuevas
(`SUBSALON_CONFIGURACION_SUBSALONES`, `INSTITUCION_MAPAS`, `EVENTO_SUBSALONES`,
`ENTRADAS_EVENTO`, `TARJETAS_USUARIO`, `ARCHIVOS`, y `PAGOS` únicamente hacia
`EVENTOS_USUARIOS`). El resto de relaciones son **implícitas**.

Relaciones sin FK declarada (verificadas): `EVENTOS` → `SALONES`, `LOCALES`,
`SUBSALONES`, `SUBSALON_CONFIGURACIONES`, `INSTITUCION_MAPAS`; `EVENTOS_USUARIOS` →
`EVENTOS`, `USUARIOS`; `PAGOS` → `EVENTOS`, `USUARIOS`; `LOCALES` → `INSTITUCIONES`;
`SALONES` → `LOCALES`; `SUBSALONES` → `SALONES`; `SUBSALON_CONFIGURACIONES` →
`SALONES`; `USUARIO_INSTITUCIONES` → `USUARIOS`, `INSTITUCIONES`.

**Nosotros mantenemos esa convención**, con un matiz:

- Las tablas nuevas que referencian **entidades nuestras** sí declaran FK
  (`FK_CUPON_EVENTO`, `FK_DETALLE_EVENTO`, `FK_EXPOSITOR_EVENTO`, `FK_HORA_EVENTO`,
  `FK_EVENTO_PADRE`, `FK_CERTPLANT_EVENTO`, `FK_ARCHIVOS_EXPOSITOR`).
- Las tablas nuevas que referencian a **`USUARIOS`** (comunidad, chats, conexiones,
  perfil, push, certificados) **no** declaran FK, deliberadamente: el borrado de
  cuenta hace limpieza manual en orden explícito y una FK con `RESTRICT` rompería
  ese flujo; además evita acoplar nuestras tablas al ciclo de vida de una tabla
  compartida.

**Consecuencias prácticas que la API debe asumir:**

1. La integridad referencial la garantiza la aplicación, no la BD. Todo borrado
   hace su cascada manual y en el orden correcto (hijos antes que padres).
2. No hay `ON DELETE CASCADE` en el que apoyarse. Nunca asumir que borrar un padre
   limpia a los hijos.
3. Los JOINs se escriben a mano y hay que filtrar explícitamente (p.ej. el filtro
   `NVL(e.NO_PUBLICAR,'N') = 'N'` se repite en cada consulta pública).

---

## 6. Idempotencia: cómo se garantiza sin transacciones distribuidas

Regla del proyecto: **toda migración y toda operación de escritura repetible debe
poder ejecutarse dos veces sin romper nada.** Los mecanismos usados:

### 6.1 En las migraciones

- Los scripts de `docs/sql/` son **el registro de lo aplicado**, no ejecutables
  idempotentes por sí solos. La idempotencia real la aportaba el script auxiliar
  (p.ej. `fase1_auth_migration.py` para la fase 1) que **verifica existencia antes de
  cada paso** consultando `USER_TAB_COLUMNS` / `USER_TABLES` / `USER_CONSTRAINTS`.
- Todo cambio es **aditivo**: columnas nuevas nullable o con `DEFAULT`, para que
  re-ejecutar solo produzca `ORA-01430` (columna ya existe) sin dañar datos.
- Los backfills se escriben condicionados (`WHERE FECHA_FIN IS NULL`,
  `WHERE HORA_INICIO IS NOT NULL`) para que una segunda pasada no duplique.

### 6.2 En la aplicación

**Patrón "UPDATE → INSERT → UPDATE"** (upsert robusto sin `MERGE`). Se usa en
`COMUNIDAD_MIEMBROS`, `PERFIL_ASISTENTE`, `CONEXIONES` y `USUARIO_PUSH_TOKENS`:

1. Intentar `UPDATE`. Si `rowsAffected > 0`, listo.
2. Si no, `INSERT`.
3. Si el `INSERT` falla con **`ORA-00001`** (otro proceso ganó la carrera),
   reintentar el `UPDATE`.

Es seguro ante concurrencia y evita el `ORA-00001` visible al usuario en el primer
salir/ingresar simultáneo.

**Patrón "SELECT → INSERT → capturar ORA-00001 → SELECT"** en emisión de certificados:
se consulta si ya existe por (`ID_CLIENTE`,`ID_EVENTO`); si no, se inserta; si el
INSERT choca con el único, se vuelve a leer y se devuelve el código existente.

**Patrón "UPDATE condicional atómico"** en `PAGOS` (`WHERE ID_PAGO=:id AND ESTADO='PENDIENTE'`):
solo un proceso obtiene `rowsAffected = 1` y por tanto solo se emite una entrada,
aunque el webhook, el `confirm` del móvil y un reintento lleguen a la vez.

**Dedupe por clave natural** en `FSL_WEBHOOK_EVENTS`: el `EVENT_ID` del header es la
PK; reprocesar el mismo evento es imposible.

**Idempotencia de negocio** en inscripciones (`crearInscripcion`): primero busca una
inscripción existente por (`ID_EVENTO`,`ID_CLIENTE`) y la devuelve; solo inserta si no
hay. Lo mismo el check-in: si `ASISTIO='S'` no vuelve a escribir.

### 6.3 Claves primarias: dos estrategias conviviendo

- **Trigger + secuencia** (`TRG_*_BI` / `TRG_*_PK` + `SEQ_*`) en las tablas antiguas:
  `EVENTOS`, `EVENTOS_USUARIOS`, `ROLES_INSTITUCIONES`, `LOCALES`, `SALONES`…
  → **los INSERT no deben enviar el ID.**
- **Identity columns** (`GENERATED ALWAYS AS IDENTITY`) en las tablas nuevas y en las
  más recientes del esquema original: `ENTRADAS_EVENTO`, `TARJETAS_USUARIO`,
  `TARJETAS_EVENTOS_LOG`, `INSTITUCION_MAPAS`, `ARCHIVOS`, y todas las nuestras.
  → tampoco se envía el ID; se recupera con `RETURNING ... INTO :out`.
- **UUID generado en la app**: solo `USUARIOS.ID_CLIENTE`.

---

## 7. ⚠️ Deuda conocida: tablas sin script de migración

Ocho tablas creadas por este proyecto **no tienen `.sql` en `docs/sql/`**. Se crearon
directamente contra la BD durante el desarrollo de las fases de app móvil:

`CERTIFICADOS`, `PERFIL_ASISTENTE`, `CONEXIONES`, `COMUNIDAD_MIEMBROS`,
`COMUNIDAD_MENSAJES`, `CHAT_PRIVADO`, `MENSAJE_PRIVADO`, `USUARIO_PUSH_TOKENS`.

**Impacto:** una PC recién formateada o un entorno nuevo **no puede reconstruir el
esquema completo solo con el repo**. La estructura de estas tablas está documentada en
las secciones 3.7–3.9 de este documento, reconstruida a partir de las consultas reales
de la API, pero **no está garantizado que los tipos y constraints exactos coincidan**.

**Cómo recuperar el DDL real** (ejecutar contra la BD y guardar el resultado en `docs/sql/`):

```sql
SET LONG 200000 PAGESIZE 0 LINESIZE 32767
SELECT DBMS_METADATA.GET_DDL('TABLE', table_name)
  FROM USER_TABLES
 WHERE table_name IN ('CERTIFICADOS','PERFIL_ASISTENTE','CONEXIONES',
                      'COMUNIDAD_MIEMBROS','COMUNIDAD_MENSAJES',
                      'CHAT_PRIVADO','MENSAJE_PRIVADO','USUARIO_PUSH_TOKENS');
```

**Tarea pendiente:** volcar ese DDL a `docs/sql/2026-XX-XX_baseline_tablas_moviles.sql`
para cerrar el hueco.

---

## 8. Índice cronológico de migraciones (`docs/sql/`)

18 scripts. Estado según la cabecera de cada archivo.

| # | Archivo | Estado | Qué hace |
|---|---|---|---|
| 1 | `2026-07-04_fase1_auth.sql` | aplicado | **Fase 1 — auth y aprobación de instituciones.** Amplía `COD_USUARIO` a 150 en `USUARIOS_INSTITUCIONES` y `USUARIO_ROL_INSTITUCION` (pasa a ser el correo de login); añade `NOMBRES`, `APELLIDOS`, `ES_SUPER`, `FECHA_REGISTRO`; `ID_INSTITUCION` nullable; añade `ESTADO`/`FECHA_APROBACION`/`APROBADO_POR` a `INSTITUCIONES` con CHECK; inserta 4 roles y el superadmin de plataforma. |
| 2 | `2026-07-06_recuperacion_clave.sql` | aplicado | Añade `DEBE_CAMBIAR_CLAVE` (`S`/`N`) + CHECK. Habilita el flujo de clave temporal: al ingresar con ella la API bloquea todo salvo `/auth/cambiar-clave`. |
| 3 | `2026-07-06_rol_eventos.sql` | aplicado | Inserta el rol `EVENTOS`. Deja constancia de que `TRG_VALIDAR_EVENTO` tiene el cuerpo comentado y la validación de choques vive en la API. |
| 4 | `2026-07-08_proteger_superadmin.sql` | aplicado | Crea `TRG_PROTEGE_SUPERADMIN` (`ORA-20099` al intentar borrar un `ES_SUPER='S'`). Registra además el vaciado de datos de prueba del 2026-07-08 (se conservaron superadmin + 5 roles + 178 países). |
| 5 | `2026-07-09_auditoria.sql` | aplicado | Crea `AUDITORIA_LOG` + índices `IX_AUDITORIA_FECHA`, `IX_AUDITORIA_USUARIO`. |
| 6 | `2026-07-09_fsl_webhooks.sql` | aplicado | Crea `FSL_WEBHOOK_EVENTS` (idempotencia de webhooks de FourStackLabs). |
| 7 | `2026-07-10_cupones_iva.sql` | aplicado | Añade `INCLUYE_IVA` y `MONTO_IVA` a `EVENTOS`; crea `EVENTO_CUPONES` con FK y único (`ID_EVENTO`,`CODIGO`). |
| 8 | `2026-07-10_feedback.sql` | aplicado | Crea `FEEDBACK` + índice `IX_FEEDBACK_FECHA`. |
| 9 | `2026-07-10_no_publicar.sql` | aplicado | Añade `EVENTOS.NO_PUBLICAR`. **Requiere acción del equipo externo**: filtrar `WHERE NVL(E.NO_PUBLICAR,'N') = 'N'` en sus consultas. |
| 10 | `2026-07-14_cupones_porcentaje_maxusos.sql` | **pendiente de aplicar** | Añade `TIPO_DESCUENTO` (`M`/`P`), `MAX_USOS` y `USOS` a `EVENTO_CUPONES`. Retrocompatible. |
| 11 | `2026-07-14_multidia_workshops.sql` | **pendiente de aplicar** | Añade `EVENTOS.FECHA_FIN` (+ backfill) y `EVENTOS.ID_EVENTO_PADRE` (+ FK auto-referencial + `IX_EVENTOS_PADRE`); crea `EVENTO_HORAS` + backfill de un día por evento. |
| 12 | `2026-07-14_evento_detalle_expositores.sql` | **pendiente de aplicar** | Crea `EVENTO_DETALLE` (1:1, con columnas JSON validadas y config de certificado) y `EVENTO_EXPOSITORES` + `IX_EXPOSITOR_EVENTO`. |
| 13 | `2026-07-14_archivos_expositor.sql` | aplicado | Añade `ARCHIVOS.ID_EXPOSITOR` + FK a `EVENTO_EXPOSITORES`; reemplaza el CHECK de `TIPO_ENTIDAD` por `CHK_ARCHIVOS_TIPO_ENT` con 7 valores. **Depende del #12.** ⚠️ Pendiente el equipo NAS externo. |
| 14 | `2026-07-14_feedback_respuesta.sql` | aplicado | Añade `RESPUESTA`, `FECHA_RESPUESTA`, `RESPONDIDO_POR` a `FEEDBACK`. |
| 15 | `2026-07-16_apple_id.sql` | aplicado | Añade `USUARIOS.APPLE_ID` + `UX_USUARIOS_APPLE_ID` (único; Oracle admite múltiples NULL). |
| 16 | `2026-07-16_cert_plantilla.sql` | aplicado | Crea `EVENTO_CERT_PLANTILLA` (BLOB de plantilla + `CONFIG_JSON` con posiciones en fracciones). |
| 17 | `2026-07-17_email_factura.sql` | aplicado | Añade `USUARIOS.EMAIL_FACTURA`. |
| 18 | `2026-07-17_log_participantes.sql` | aplicado | Crea `LOG_PARTICIPANTES_EVENTO` + `IX_LOG_PART_EVENTO`. |

> ⚠️ El estado "pendiente de aplicar" es el que declara la cabecera del archivo. Como
> el código de la API **ya consulta** `EVENTO_HORAS`, `EVENTO_DETALLE`,
> `EVENTO_EXPOSITORES`, `EVENTOS.ID_EVENTO_PADRE` y `EVENTO_CUPONES.TIPO_DESCUENTO`
> en producción, es casi seguro que #10, #11 y #12 **ya se aplicaron** y la cabecera
> quedó desactualizada. **Verificar antes de re-ejecutar** (sección 8.2) — nunca correr
> a ciegas un script marcado como pendiente.

### 8.1 Orden de dependencias

```
#12 (EVENTO_EXPOSITORES)  →  #13 (ARCHIVOS.ID_EXPOSITOR, FK)
#7  (EVENTO_CUPONES)      →  #10 (TIPO_DESCUENTO / MAX_USOS / USOS)
#8  (FEEDBACK)            →  #14 (RESPUESTA / FECHA_RESPUESTA / RESPONDIDO_POR)
#1  (ES_SUPER)            →  #4  (TRG_PROTEGE_SUPERADMIN)
```

El resto son independientes entre sí.

---

## 9. Procedimiento para aplicar una migración nueva en producción

No hay herramienta de migraciones (ni Flyway, ni Liquibase, ni TypeORM migrations):
el proceso es **manual y deliberado**, porque el esquema es compartido.

### 9.1 Escribir el script

1. Crear `docs/sql/YYYY-MM-DD_<tema>.sql`. La fecha es la de **aplicación prevista**.
2. Cabecera obligatoria, con este contenido:
   - qué hace y por qué;
   - si es **aditivo** o no (si no lo es, hay que justificarlo y avisar al equipo externo);
   - estado (`aplicado el YYYY-MM-DD` / `pendiente de aplicar`);
   - si obliga a la app externa a cambiar algo, una sección **"Nota app móvil (equipo externo)"**.
3. Solo cambios aditivos sobre tablas 🟦. Nada de `DROP`, `RENAME`, cambio de tipo o
   `NOT NULL` sin default.
4. Los backfills, siempre condicionados (`WHERE <col> IS NULL`) y con `COMMIT` explícito.
5. Si el cambio necesita datos, incluir el `INSERT` y su `COMMIT`.

### 9.2 Verificar el estado real ANTES de ejecutar

Nunca asumir el estado por la cabecera del archivo. Comprobar contra el diccionario:

```sql
-- ¿existe la tabla?
SELECT table_name FROM USER_TABLES WHERE table_name = 'MI_TABLA';

-- ¿existe la columna?
SELECT column_name, data_type, nullable, data_default
  FROM USER_TAB_COLUMNS
 WHERE table_name = 'EVENTOS' AND column_name = 'ID_EVENTO_PADRE';

-- ¿existe el constraint / índice?
SELECT constraint_name, constraint_type, status
  FROM USER_CONSTRAINTS WHERE table_name = 'EVENTO_CUPONES';
SELECT index_name, uniqueness FROM USER_INDEXES WHERE table_name = 'EVENTOS';
```

Si el objeto ya existe → marcar el script como aplicado y **no ejecutarlo**.

### 9.3 Respaldo previo

La BD **no vive en el servidor de la app** (`209.126.77.72`), vive en
`<host-oracle>`. El respaldo se hace allá, antes de tocar nada:

```bash
# en el host de Oracle
expdp <ver ORACLE_USER en .env>/<clave>@XEPDB1 \
  schemas=<ver ORACLE_USER en .env> \
  directory=DATA_PUMP_DIR \
  dumpfile=connecthub_$(date +%Y%m%d_%H%M).dmp \
  logfile=connecthub_$(date +%Y%m%d_%H%M).log
```

Para un cambio pequeño y aditivo, basta con respaldar las tablas afectadas:

```sql
CREATE TABLE EVENTO_CUPONES_BAK_20260719 AS SELECT * FROM EVENTO_CUPONES;
```

### 9.4 Ejecutar

Desde el servidor de Oracle (o cualquier máquina con acceso al puerto 1521):

```bash
sqlplus <ver ORACLE_USER en .env>/<clave>@//<ver ORACLE_CONNECT_STRING en .env> @docs/sql/2026-07-19_mi_cambio.sql
```

Reglas de ejecución:

- Ejecutar **sentencia por sentencia**, leyendo el resultado de cada una. Un `ORA-01430`
  ("column being added already exists") significa que ese paso ya estaba hecho: se salta
  y se sigue, no se aborta.
- Los `CREATE OR REPLACE TRIGGER` necesitan `/` en línea propia para cerrar el bloque PL/SQL.
- `COMMIT` explícito al final del bloque DML. El DDL en Oracle hace commit implícito.

### 9.5 Verificar después

```sql
-- estructura
DESC EVENTO_CUPONES;
-- objetos inválidos tras el cambio
SELECT object_name, object_type FROM USER_OBJECTS WHERE status = 'INVALID';
-- datos de muestra
SELECT * FROM EVENTO_CUPONES FETCH FIRST 5 ROWS ONLY;
```

Si hay objetos `INVALID`, recompilarlos (`ALTER ... COMPILE`) antes de continuar.

### 9.6 Desplegar el código que usa el cambio

Después de la migración, y solo después:

```bash
ssh root@209.126.77.72
cd /root/app
./deploy.sh          # git fetch + reset --hard origin/main + docker compose up -d --build
curl -s http://localhost:4000/health
```

`/health` reporta el estado de Oracle y Redis. Si Oracle falla, la API igual levanta
pero `/health` lo muestra.

### 9.7 Cerrar el ciclo

1. Actualizar la cabecera del `.sql`: `pendiente de aplicar` → `aplicado el YYYY-MM-DD`.
2. Actualizar la tabla de la sección 8 de este documento.
3. Si el cambio afecta a la app externa, notificar al equipo con la nota del `.sql`.
4. Commit + push a `main`.

### 9.8 Rollback

No hay rollback automático. Como todos los cambios son aditivos, el rollback normal es:

- **columna nueva** → dejarla (una columna nullable sin usar es inofensiva) o
  `ALTER TABLE ... SET UNUSED COLUMN` (nunca `DROP` en tabla compartida sin coordinar);
- **tabla nueva** → `DROP TABLE ... PURGE` (solo tablas 🟩, nunca 🟦);
- **datos** → restaurar desde la tabla `_BAK_<fecha>`;
- **desastre** → `impdp` del dump de 9.3.

---

## 10. Reglas de la API contra este esquema

Resumen operativo de lo que todo endpoint debe cumplir:

1. **Bind variables siempre.** Cero concatenación de valores en SQL. Los únicos
   fragmentos interpolados son nombres de columna provenientes de mapas cerrados
   del código (p.ej. `COLUMNA_ID` en `archivos.service.ts`).
2. **Paginación** con `OFFSET :off ROWS FETCH NEXT :lim ROWS ONLY`, con tope
   (los listados de comunidad y chats limitan `size` a 50).
3. **Sin BLOB/CLOB en listados.** Los binarios se sirven por endpoint dedicado con
   streaming y caché.
4. **Multi-tenant:** todo endpoint del panel filtra por el `ID_INSTITUCION` del token
   JWT (ver `scope.service.ts`). El superadmin (`ES_SUPER='S'`) es la única excepción.
5. **Filtro de publicación:** toda consulta pública de eventos añade
   `NVL(e.NO_PUBLICAR,'N') = 'N'`.
6. **Enmascarar:** solo `LAST4`/`ULTIMOS_4` de tarjetas. Credenciales de pasarela,
   `TOKEN`, `CLAVE`, `SALT`, `CLAVE_HASH`, `REFRESH_TOKEN` y `VERIFICATION_TOKEN`
   jamás salen de la BD.
7. **Errores de trigger:** capturar los `ORA-20xxx` y traducirlos a HTTP legibles
   (`ORA-20099` = intento de borrar superadmin).
8. **`ORA-00001`** (violación de único) es un caso **esperado** en los flujos
   concurrentes, no un error: se captura y se resuelve releyendo (ver §6.2).
9. **Institución de un evento**: se deriva con
   `COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION)` donde `l` viene de `EVENTOS.ID_LOCAL`
   y `l2` de `EVENTOS.ID_SALON → SALONES.ID_LOCAL`. Un evento puede tener local
   directo o solo salón; hay que contemplar ambos.

---

## 11. Deficiencias heredadas (documentadas, no bloquean)

1. **FKs faltantes** — ver sección 5.
2. **Nombres confusos** — `USUARIOS_INSTITUCIONES` (admins) vs `USUARIO_INSTITUCIONES`
   (clientes). Fuente recurrente de errores; leer dos veces.
3. **Tipos débiles** — `HORA_INICIO`/`HORA_FIN` como `VARCHAR2(20)`; `ID_CLIENTE` es
   `VARCHAR2(36)` en `USUARIOS` pero `VARCHAR2(100)` en `PAGOS`; `IS_VERIFIED` es
   `NUMBER(38)` usado como booleano.
4. **Imágenes duplicadas** — BLOBs embebidos en `EVENTOS`/`INSTITUCIONES`/
   `INSTITUCION_MAPAS` conviven con `ARCHIVOS` y con columnas `*_URL` apuntando al NAS.
   Migración a medio camino; para lo nuevo, usar **columna URL**.
5. **Seguridad heredada** — credenciales de pasarela en texto plano en `INSTITUCIONES`;
   `CLAVE VARCHAR2(50)` en `USUARIOS_INSTITUCIONES` sugiere hash truncado.
6. **Dos estrategias de PK** conviviendo (triggers+secuencias vs identity).
7. **Typo en el esquema**: `PAYMENT_ENVIROMENT` (falta la N). Se respeta tal cual.
8. **`ENTRADAS_EVENTO` sin usar** — ver §3.5.
9. **8 tablas sin script de migración** — ver §7. Es la deuda más urgente.
10. **`ARCHIVOS`: `ID_USUARIO` vs `ID_CLIENTE` y `'USUARIO'` fuera del CHECK** — ver
    §3.10. Es la única de esta lista que puede romper un flujo en caliente (el borrado
    de cuenta), no solo incomodar.
11. **`USUARIOS.EMAIL_FACTURA` sobrevive a la anonimización** — el `UPDATE` de §3.3 no
    lo pone a `NULL`. Si se considera PII (lo es: es un correo del titular), hay que
    añadirlo a ese `UPDATE`.

---

## Referencias

- `docs/modelo-datos.md` — análisis original del esquema (2026-07-04).
- `docs/sql/*.sql` — las 18 migraciones, cada una con su cabecera explicativa.
- `docs/apis-produccion.md` — endpoints que consumen este modelo.
- `docs/checkout-paymentez.md` — detalle del flujo de pago sobre `PAGOS`/`TARJETAS_USUARIO`.
- `docs/fsl-webhooks-connecthub.md` — webhook de provisión sobre `FSL_WEBHOOK_EVENTS`.
- `docs/nas-espacios.md` — entidades soportadas por el NAS (`ARCHIVOS`).
- `docs/eventos-no-publicar.md` — semántica de `EVENTOS.NO_PUBLICAR`.
- `SERVER_SETUP.md` — variables de entorno y despliegue.
- `apps/api/src/database/oracle.service.ts` — pool, tipos y helpers de acceso.
