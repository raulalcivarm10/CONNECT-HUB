# Modelo de datos — esquema `CONNECT_HUB` (Oracle 21c XE)

Análisis realizado el 2026-07-04 contra `154.38.187.235:1521/XEPDB1`.
**22 tablas · 1 vista (`VW_DISPONIBILIDAD`) · 17 secuencias · 12 triggers · 0 paquetes PL/SQL.**

## Dominio

Plataforma de gestión de eventos y ticketing multi-institución:

```
INSTITUCIONES ─┬─< LOCALES ──< SALONES ──< SUBSALONES
               │                  │             │
               │                  └──< SUBSALON_CONFIGURACIONES >──┐ (M:N)
               │                                                    ├─ SUBSALON_CONFIGURACION_SUBSALONES
               ├─< INSTITUCION_MAPAS >── INSTITUCION_MAPA_SUBSALONES (M:N con SUBSALONES)
               │
               └─< USUARIOS_INSTITUCIONES (admins) >──< USUARIO_ROL_INSTITUCION >── ROLES_INSTITUCIONES

EVENTOS ──< EVENTO_SUBSALONES (M:N con SUBSALONES)
   │  (referencias implícitas a SALONES, LOCALES, SUBSALONES, CONFIGURACIONES y MAPAS — sin FK)
   │
   ├─< EVENTOS_USUARIOS (inscripciones) >── USUARIOS (clientes finales)
   │        └─< PAGOS
   └─< ENTRADAS_EVENTO (entradas QR) >── USUARIOS

USUARIOS ──< TARJETAS_USUARIO (tokenizadas) · TARJETAS_EVENTOS_LOG (auditoría)
USUARIOS ──< USUARIO_INSTITUCIONES (vínculo cliente↔institución — ¡no confundir con USUARIOS_INSTITUCIONES!)
ARCHIVOS (polimórfica: EVENTO | INSTITUCION | LOCAL)      PAIS (catálogo, 178 filas)
```

## Tablas principales

| Tabla | Filas | PK | Notas |
|---|---|---|---|
| `INSTITUCIONES` | 3 | ID_INSTITUCION | Credenciales de pasarela (APP_CODE/APP_KEY tokenización+checkout, estilo Paymentez/Nuvei). **Nunca exponer por API.** Logo en BLOB. |
| `LOCALES` | 5 | ID_LOCAL | ID_INSTITUCION sin FK declarada |
| `SALONES` | 4 | ID_SALON | ES_SUBDIVISIBLE S/N, CAPACIDAD_MAX. ID_LOCAL sin FK |
| `SUBSALONES` | 8 | ID_SUBSALON | ID_SALON sin FK |
| `SUBSALON_CONFIGURACIONES` | 7 | ID_CONFIGURACION | Particiones de un salón; M:N con subsalones (`SUBSALON_CONFIGURACION_SUBSALONES`, con FKs ✓) |
| `INSTITUCION_MAPAS` | 9 | ID_MAPA | Croquis en BLOB; FKs ✓ a institución/local/salón/subsalón/configuración; ASIGNADO Y/N, ACTIVO Y/N |
| `EVENTOS` | 17 | ID_EVENTO | Fecha, TIEMPO_SETUP_MIN/CLEAN_MIN, PRECIO, imagen BLOB, DESTACADO+ORDEN. HORA_INICIO/FIN como VARCHAR2(20). Sin FKs |
| `EVENTO_SUBSALONES` | 11 | (ID_EVENTO, ID_SUBSALON) | FKs ✓ |
| `USUARIOS` | 5 | ID_CLIENTE VARCHAR2(36) | UUID, EMAIL único, GOOGLE_ID, CLAVE_HASH, refresh/verification tokens, PERFIL/ONBOARDING_COMPLETO S/N |
| `EVENTOS_USUARIOS` | 12 | ID_EVENTO_USUARIO | Inscripciones. ESTADO: S=Suscrito, C=Cancelado, A=Asistió, N=No asistió. QR_TOKEN, FECHA_ENTRADA. Sin FKs |
| `ENTRADAS_EVENTO` | 0 | ID_ENTRADA (identity) | QR_TOKEN único + QR_HASH, ESTADO (def. 'A'), INTENTOS_VALIDACION. FKs ✓ |
| `PAGOS` | 23 | ID_PAGO | REFERENCIA única, PASARELA, TRANSACCION_ID, RESPONSE_JSON CLOB, TIPO_PAGO (def. DEBITO). FK ✓ solo a EVENTOS_USUARIOS; ID_EVENTO/ID_CLIENTE sin FK |
| `TARJETAS_USUARIO` | 16 | ID_TARJETA (identity) | Tarjetas tokenizadas (TOKEN, BIN, LAST4, HOLDER). FKs ✓ a USUARIOS e INSTITUCIONES |
| `TARJETAS_EVENTOS_LOG` | 173 | ID_LOG (identity) | Auditoría de operaciones con tarjetas, RESPONSE_JSON CLOB |
| `USUARIOS_INSTITUCIONES` | 1 | COD_USUARIO VARCHAR2(10) | **Usuarios admin del panel**: CLAVE + SALT, ID_INSTITUCION |
| `ROLES_INSTITUCIONES` | 0 | ID_ROL | Roles con NOMBRE_APP/URL_APP |
| `USUARIO_ROL_INSTITUCION` | 0 | ID_USUARIO_ROL | M:N admin↔rol. FKs ✓ |
| `USUARIO_INSTITUCIONES` | 4 | ID_USUARIO_INSTITUCIONES | Vínculo **cliente final** ↔ institución. Sin FKs |
| `ARCHIVOS` | 0 | ID_ARCHIVO | Polimórfica TIPO_ENTIDAD ∈ {EVENTO, INSTITUCION, LOCAL}; TIPO_ARCHIVO ∈ {PORTADA, GALERIA, LOGO, BANNER, DOCUMENTO, CROQUIS}. FKs y CHECKs ✓ |
| `PAIS` | 178 | COD_PAIS | Catálogo de países |

## Triggers relevantes

- `TRG_VALIDAR_EVENTO` (EVENTOS): valida solapamientos/reglas al insertar o actualizar eventos → la API debe capturar los `ORA-20xxx` que lanza y traducirlos a errores HTTP legibles.
- `TRG_*_PK` / `TRG_*_BI`: asignan la PK desde secuencias (`SEQ_*`) en la mayoría de tablas → **los INSERT no deben enviar el ID**. Las tablas más nuevas (ENTRADAS_EVENTO, TARJETAS_*, INSTITUCION_MAPAS, ARCHIVOS…) usan identity columns (`ISEQ$$_*`).

## Deficiencias detectadas (no bloquean el desarrollo)

1. **FKs faltantes** (relaciones solo implícitas): EVENTOS→{SALONES, LOCALES, SUBSALONES, SUBSALON_CONFIGURACIONES, INSTITUCION_MAPAS}; EVENTOS_USUARIOS→{EVENTOS, USUARIOS}; PAGOS→{EVENTOS, USUARIOS}; LOCALES→INSTITUCIONES; SALONES→LOCALES; SUBSALONES→SALONES; SUBSALON_CONFIGURACIONES→SALONES; USUARIO_INSTITUCIONES→{USUARIOS, INSTITUCIONES}.
2. **Nombres confusos**: `USUARIOS_INSTITUCIONES` (admins del panel) vs `USUARIO_INSTITUCIONES` (clientes por institución).
3. **Tipos débiles**: HORA_INICIO/HORA_FIN como VARCHAR2(20); ID_CLIENTE es VARCHAR2(36) en USUARIOS pero VARCHAR2(100) en PAGOS; IS_VERIFIED como NUMBER(38).
4. **Imágenes duplicadas**: BLOBs embebidos en EVENTOS/INSTITUCIONES/INSTITUCION_MAPAS conviven con la tabla nueva `ARCHIVOS` (aún vacía) — aparente migración a medio camino.
5. **Seguridad**: credenciales de pasarela en texto plano en INSTITUCIONES; CLAVE VARCHAR2(50) en USUARIOS_INSTITUCIONES sugiere hash débil o truncado.
6. Mezcla de estrategias de PK (triggers+secuencias vs identity columns).

> La Fase 6 (opcional, requiere aprobación) propone un script SQL con las FKs e índices faltantes.

## Reglas para la API

- SELECT de listados **sin columnas BLOB/CLOB**; los binarios se sirven por endpoint dedicado con streaming + caché.
- Bind variables siempre; paginación `OFFSET :o ROWS FETCH NEXT :n ROWS ONLY`.
- Todo endpoint del panel filtra por el `ID_INSTITUCION` del token JWT.
- Enmascarar datos sensibles: solo `ULTIMOS_4`/`LAST4` de tarjetas; credenciales de pasarela jamás salen de la BD.
