# Especificación para el NAS: entidades SALON, SUBSALON y CONFIGURACION

**Para:** equipo del servidor de archivos (`https://api-ligaprocorp.ec:3443`)
**Objetivo:** que salones, subsalones y configuraciones de salas tengan imagen
de referencia, igual que ya funcionan EVENTO / INSTITUCION / LOCAL.

## La base de datos YA está lista

La tabla `ARCHIVOS` (esquema CONNECT_HUB) ya tiene lo necesario (aplicado el
2026-07-07, ver `docs/sql/`):

- Columnas nuevas (nullable): `ID_SALON`, `ID_SUBSALON`, `ID_CONFIGURACION`
- FKs: `FK_ARCHIVOS_SALON → SALONES`, `FK_ARCHIVOS_SUBSALON → SUBSALONES`,
  `FK_ARCHIVOS_CONFIG → SUBSALON_CONFIGURACIONES`
- CHECK extendido: `TIPO_ENTIDAD IN ('EVENTO','INSTITUCION','LOCAL','SALON','SUBSALON','CONFIGURACION')`

**Nada del código actual del NAS se rompe** — solo se ampliaron valores permitidos
y columnas opcionales.

## Cambios requeridos en el servicio del NAS

### 1. POST /api/archivos — aceptar 3 entidades más

| tipoEntidad | campo del form | columna en ARCHIVOS | valida contra | carpeta física |
|---|---|---|---|---|
| `SALON` | `idSalon` | `ID_SALON` | `SALONES.ID_SALON` | `salones/{idSalon}/` |
| `SUBSALON` | `idSubsalon` | `ID_SUBSALON` | `SUBSALONES.ID_SUBSALON` | `subsalones/{idSubsalon}/` |
| `CONFIGURACION` | `idConfiguracion` | `ID_CONFIGURACION` | `SUBSALON_CONFIGURACIONES.ID_CONFIGURACION` | `configuraciones/{idConfiguracion}/` |

Misma lógica que las entidades existentes: validar que la entidad exista,
desactivar el archivo activo anterior del mismo (entidad + tipoArchivo),
mover a carpeta definitiva y registrar con `ACTIVO='S'`.

`tipoArchivo` usado por el panel para estas entidades: `CROQUIS`.

### 2. GET /api/archivos/activo — soportar las 3 entidades

`?tipoEntidad=SALON&id=128&tipoArchivo=CROQUIS` → busca el registro
`TIPO_ENTIDAD='SALON' AND ID_SALON=128 AND TIPO_ARCHIVO='CROQUIS' AND ACTIVO='S'`
y sirve el archivo, igual que hoy con LOCAL.

### 3. (Deseable, pendiente de antes) DELETE físico

Cuando se reemplaza o elimina una imagen, el panel elimina el registro de la
tabla pero el archivo físico queda huérfano en el disco. Ideal: endpoint
`DELETE /api/archivos/:idArchivo` que borre archivo físico + registro, o
sobrescribir con nombre determinístico `{tipoEntidad}-{id}-{tipoArchivo}.{ext}`.

### Límite de tamaño

El panel permite imágenes de hasta **25 MB** (PNG/JPG/JPEG/WebP). Alinear el
límite de Multer si es menor.

## El panel ya está listo

Los endpoints y pantallas del panel ya envían/leen estas entidades. Mientras el
NAS no se actualice, el panel muestra el aviso: *"El servidor de archivos (NAS)
aún no soporta imágenes de SALON…"*. Apenas se despliegue este cambio, todo
funciona sin tocar el panel.
