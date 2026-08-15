# 1. SCRIPT SQL FINAL

Guardar como `grants_diagnostico_connect_hub.sql` y ejecutar con SQL\*Plus / SQLcl **conectado a XEPDB1 como SYS AS SYSDBA**.

[--- ver 2026-08-15_grants_diagnostico.sql ---]

---

## Qué habilita cada permiso (Sección 2, 11 sentencias)

| Objeto | Objetivo que cubre | Qué expone de Evento-back |
|---|---|---|
| `SYS.V_$SESSION` | Bloqueos (`BLOCKING_SESSION`, `FINAL_BLOCKING_SESSION`), esperas en curso, salud del pool | **Sí expone**: `CLIENT_IDENTIFIER`, `CLIENT_INFO`, `MODULE`, `ACTION`, `OSUSER`, `MACHINE`, `TERMINAL`, `PROGRAM`. Puede contener identidad del usuario final del otro servicio. No texto SQL |
| `SYS.V_$LOCK` | Tipo/modo de enqueue (TX vs TM) | Nada |
| `SYS.V_$PROCESS` | Procesos servidor vs `processes`; fuga del pool | **Sí expone**: SPID, usuario del SO, `TRACEFILE` (rutas del servidor) |
| `SYS.V_$PARAMETER` | Topes y `control_management_pack_access` | **Sí expone**: `control_files`, `diagnostic_dest`, `audit_file_dest`, `spfile` (rutas) |
| `SYS.V_$INSTANCE` | Edición, versión, `STARTUP_TIME` | Nada |
| `SYS.V_$MYSTAT` | Coste de una consulta propia antes/después de un índice | Nada (solo la propia sesión) |
| `SYS.V_$STATNAME` | Catálogo de nombres de estadística | Nada |
| `SYS.V_$SESSION_EVENT` | Dónde se va el tiempo de cada sesión | Nada |
| `SYS.V_$SYSTEM_EVENT` | Esperas agregadas de la instancia | Nada |
| `SYS.DBA_DATA_FILES` | Consumo frente a los 12 GB (cota inferior: solo XEPDB1) | Nombres de fichero y tamaños |
| `SYS.DBA_FREE_SPACE` | Anticipar `ORA-01653` | Tablespace, file_id, bytes |

**Cubierto con cero permisos nuevos** (ejecutándolo como `CONNECT_HUB`): `USER_INDEXES` / `USER_IND_COLUMNS` / `USER_CONSTRAINTS` / `USER_TAB_MODIFICATIONS`; **plan ESTIMADO** con `EXPLAIN PLAN` + `DBMS_XPLAN.DISPLAY`; `USER_SEGMENTS` / `USER_TS_QUOTAS`; `PRODUCT_COMPONENT_VERSION` / `DBMS_DB_VERSION`; `SESSION_PRIVS` / `SESSION_ROLES` / `USER_TAB_PRIVS`.
**NO cubierto sin permisos**: el plan **realmente ejecutado** (`DBMS_XPLAN.DISPLAY_CURSOR`) — requiere el bloque 3A o la función 3D.

---

## Texto de justificación para el DBA

> Estimado/a [nombre]:
>
> CONNECT_HUB comparte la instancia Oracle XE (PDB `XEPDB1`) con el servicio Evento-back. Necesito diagnosticar lentitud y anticipar incidentes de capacidad sin tocar los datos del otro equipo. Le adjunto un script listo para ejecutar, con guardas que abortan si algo no cuadra.
>
> **Antes de nada le pido tres consultas desde `CDB$ROOT`** (paso 0.1 del script, treinta segundos): el inventario de contenedores, el reparto de sesiones por `CON_ID` y el total de `cdb_data_files`. Son condición de aceptación, no un detalle: las vistas `V$SESSION` y `V$LOCK` consultadas desde un PDB están filtradas por contenedor, así que si Evento-back no corre dentro de `XEPDB1`, estos permisos no detectarían jamás un bloqueo entre ambos servicios y yo concluiría "no hay bloqueos" cuando sí los hay.
>
> **Pido once permisos de SELECT** sobre vistas de rendimiento y espacio: `V_$SESSION` y `V_$LOCK` (quién bloquea a quién), `V_$PROCESS` y `V_$PARAMETER` (margen de `sessions`/`processes` y fuga del pool de Node), `V_$INSTANCE`, `V_$MYSTAT`, `V_$STATNAME`, `V_$SESSION_EVENT` y `V_$SYSTEM_EVENT` (dónde se va el tiempo; sin ellas el diagnóstico se queda en una foto instantánea), y `DBA_DATA_FILES` con `DBA_FREE_SPACE`, porque el tope de 12 GB de XE es de toda la base: si cualquiera de los dos servicios lo agota, los dos dejamos de escribir a la vez.
>
> **Le declaro la exposición real, sin adornos.** `V$SESSION` incluye `CLIENT_IDENTIFIER`, `CLIENT_INFO`, `MODULE`, `ACTION`, `OSUSER`, `MACHINE` y `TERMINAL`. Si Evento-back instrumenta su código con `DBMS_SESSION.SET_IDENTIFIER` —práctica que la propia Oracle recomienda—, ahí puede haber identificadores de sus usuarios finales. `V$PROCESS` devuelve rutas del servidor en `TRACEFILE`, y `V$PARAMETER` devuelve `control_files` y `diagnostic_dest`. Por eso el script trae una **variante endurecida (2.B)**: tres vistas filtradas por columna que crea usted, que cubren el mismo caso de uso sin un solo campo de texto libre ni una sola ruta. Si le parece bien, prefiero esa variante.
>
> **El beneficiario por defecto es una cuenta nueva, `CONNECT_HUB_RO`**, sin objetos ni cuota, no la cuenta de la aplicación: `CONNECT_HUB` está expuesta a internet y todo lo que se le otorgue queda al alcance de una SQL injection o de una dependencia comprometida. Asumo el coste de mantener una credencial y un pool aparte.
>
> **Dos precisiones para ahorrarle una ida y vuelta:** el GRANT debe ir sobre `SYS.V_$…` con guion bajo (sobre `V$…` da ORA-02030 por ser sinónimo público), y debe ejecutarse conectado a `XEPDB1` sin `CONTAINER=ALL` (desde el root daría ORA-01917; la cláusula `CONTAINER=ALL` solo se admite en `CDB$ROOT`). El ORA-00942 que veo hoy es falta de privilegio, no ausencia de la vista. Ejecútelo en una sesión limpia: `GRANT` es DDL y lleva commit implícito.
>
> **Lo que NO pido:** ni `DBA`, ni `SELECT ANY TABLE`, ni `SELECT ANY DICTIONARY`, ni `SELECT_CATALOG_ROLE`, ni `ALTER SYSTEM`, ni `ALTER SESSION`, ni `DBA_USERS`, ni `DBA_INDEXES`, ni ningún privilegio con `ANY`, ni `WITH ADMIN/GRANT OPTION`, ni una sola operación de escritura. Descarto `SELECT_CATALOG_ROLE` a propósito aunque le costaría una línea: me daría `DBA_SOURCE` y las estadísticas de columna, con valores reales decodificables.
>
> **Tampoco pido `V$SQL` ni `V$SQLAREA`.** El texto SQL conserva los literales; si el otro servicio concatena valores, ahí quedan datos personales de los que ellos son responsables. Si más adelante necesito el plan realmente ejecutado, le pediré que cree usted una **función con derechos de definidor** filtrada por `PARSING_SCHEMA_NAME = 'CONNECT_HUB'` (viene escrita en el bloque 3D). Aviso de que unas vistas filtradas no bastarían: `DBMS_XPLAN` es `AUTHID CURRENT_USER` y comprueba el privilegio sobre las fixed views reales.
>
> **Dos cosas que le digo por adelantado porque no quedan cubiertas.** Primera: `V$RESOURCE_LIMIT` no devuelve filas dentro de un PDB, así que `MAX_UTILIZATION` —el dato que de verdad anticipa un ORA-00020— no es medible desde `XEPDB1` por mucho privilegio que me dé; o me lo mira usted desde el root de vez en cuando, o crea un usuario común solo para eso (bloque 3G), o me quedo con una estimación que etiquetaré como tal. Segunda: desde el PDB solo veo el espacio de `XEPDB1`, no `SYSTEM`/`SYSAUX`/`UNDO` del CDB; mis cifras son una cota inferior y por eso le pido esa foto única de `cdb_data_files`.
>
> `DBA_SEGMENTS` va en un bloque aparte, comentado, porque revelaría los nombres (nunca el contenido) de las tablas del otro equipo. El script incluye estado previo, verificación posterior y un bloque de revocación que **revierte los privilegios de objeto sobre SYS de las secciones 2, 3A, 3B, 3C y 3G**; las vistas y la cuenta auxiliar, si se crean, se limpian con los `DROP` que van al final, comentados. Quedo a disposición para reducir aún más el alcance.

---

# 2. Qué corregí respecto al borrador

**Seguridad y corrección de ejecución**
1. `WHENEVER SQLERROR EXIT SQL.SQLCODE` → **`… ROLLBACK`** y `ROLLBACK;` explícito al arrancar. El default de `EXIT` en SQL\*Plus es COMMIT: el camino de aborto confirmaba transacciones pendientes de la sesión del DBA. Añadido el aviso de que `GRANT` lleva commit implícito.
2. Añadido **`SET SERVEROUTPUT ON SIZE UNLIMITED`** (los `DBMS_OUTPUT` no imprimían nada) + nota de que `ALTER SESSION SET CONTAINER` reinicia el estado de sesión y hay que reponer los `SET`.
3. **`WHENEVER SQLERROR CONTINUE` ya no cubre la Sección 2**: EXIT durante los GRANT (el fallo plausible es ORA-01031, no ORA-00942), CONTINUE en la Sección 1 y a partir de la 3.
4. **Guarda endurecida**: exige `SYS` **y** `ISDBA='TRUE'` (SYSTEM no puede otorgar sobre SYS con `O7_DICTIONARY_ACCESSIBILITY=FALSE`), comprueba **`open_mode = 'READ WRITE'`** antes de tocar el diccionario (un SYSDBA puede conectarse a un PDB MOUNTED y reventar con ORA-01219) y comprueba que el beneficiario es **`COMMON='NO'`**. Partida en guarda A (contexto) y B (beneficiario).
5. **Fuga de contraseña al `.log`**: el `CREATE USER` sale del flujo con `SET ECHO ON` + `SPOOL`; se ejecuta aparte, con `ACCEPT … HIDE` y `SPOOL OFF`.
6. **Beneficiario por defecto invertido a `CONNECT_HUB_RO`**, con la consecuencia operativa declarada (credencial y pool propios; las consultas `USER_*` siguen en la cuenta de la app).
7. **Exposición declarada, no negada**: `V$SESSION` (`CLIENT_IDENTIFIER`, `CLIENT_INFO`, `MODULE`, `ACTION`, `OSUSER`, `MACHINE`, `TERMINAL`), `V$PROCESS` (SPID, usuario del SO, `TRACEFILE`) y `V$PARAMETER` (rutas del servidor). Añadida la **Sección 2.B** con vistas filtradas por columna como alternativa preferida.
8. **Reclasificación de riesgo**: `V$OPEN_CURSOR` → 3A (expone `SQL_TEXT` de 60 caracteres de todas las sesiones); `V$SESSION_LONGOPS` → 3C (`TARGET` da `OWNER.OBJETO` ajeno). La cabecera de 3B ahora es cierta.

**Contenedor / PDB**
9. **Nuevo paso 0.1 obligatorio desde `CDB$ROOT`** como condición de aceptación: `v$containers` y sesiones por `CON_ID` para verificar que Evento-back vive en `XEPDB1`, más `cdb_data_files` y `v$resource_limit`.
10. **`V$RESOURCE_LIMIT` fuera del mínimo** → bloque 3G, documentado como no obtenible desde el PDB, con la prueba de 30 segundos, la ruta del usuario común `c##ch_mon` y el plan B etiquetado como estimación.
11. **Códigos de error corregidos**: desde `CDB$ROOT` ambas formas dan ORA-01917; `CONTAINER=ALL` dentro del PDB se rechaza porque la cláusula solo se admite en el root (ORA-65050); ORA-65030 no aplica.
12. **Medición de espacio**: columna renombrada a `pct_estimado_pdb`, exclusión coherente de UNDO (`JOIN dba_tablespaces … contents='PERMANENT'`), salvedad de cota inferior movida al cuerpo del script y a la carta, y petición explícita de la foto del CDB.
13. **Alcance de contenedor verificado empíricamente**: `GROUP BY con_id` sobre `v$session` y `v$process` en 1.5 y en la prueba de humo; etiquetado diferenciado (sesiones = cota inferior; procesos = depende de lo que muestre esa consulta).
14. **3D y 2.B llevan su propia advertencia de contenedor** (ORA-65096 en el root y prohibición de "arreglarlo" con el prefijo `C##`), y **ya no se crean objetos en SYS**: esquema dedicado `ch_mon`.
15. **`SET CONTAINER` en la lista negra**: justificación corregida — es **inerte** para un usuario local, se excluye por higiene, no por riesgo de escalada.

**Sintaxis y funcionalidad**
16. **Plan real vs estimado**: eliminada la fila falsa de "cero permisos"; `GATHER_PLAN_STATISTICS` solo recolecta, `DISPLAY_CURSOR` es `AUTHID CURRENT_USER` y devuelve una fila de texto en vez de error. Mínimo real para 3A: `V_$SQL`, `V_$SQL_PLAN`, `V_$SQL_PLAN_STATISTICS_ALL` (más `V_$SESSION`, ya en la 2); `V$SQLAREA`/`V$SQLSTATS` marcados como no necesarios.
17. **3D reescrito como función pipelined `AUTHID DEFINER`** (las vistas filtradas no funcionan con `DBMS_XPLAN`), **con dos correcciones sobre la propuesta del revisor**: `AUTHID DEFINER` va antes de `PIPELINED` en el encabezado, y `PIPE ROW(r)` daría **PLS-00382** porque el cursor devuelve un registro con la columna `PLAN_TABLE_OUTPUT`, no un objeto — hay que construirlo: `PIPE ROW(sys.dbms_xplan_type(r.plan_table_output))`.
18. **Cuatro vistas promovidas al mínimo** (`V_$MYSTAT`, `V_$STATNAME`, `V_$SESSION_EVENT`, `V_$SYSTEM_EVENT`): sin ellas, "diagnosticar lentitud" y "medir el efecto de un índice" quedaban sobre el papel, y no cambian el perfil de exposición.
19. **`V_$VERSION` eliminado**: `V$INSTANCE` ya trae `VERSION`, `VERSION_FULL` y `EDITION`, y `PRODUCT_COMPONENT_VERSION` no requiere permiso.
20. **1.1 partida en tres** para que un fallo de `VERSION_FULL` no arrastre `EDITION`.
21. **1.4** incluye ahora `V_$SESSION_WAIT`, `V_$SESSIONS_COUNT`, `V_$RESOURCE_LIMIT` y `V_$SESSION_LONGOPS`.
22. **4.2 acotado a la lista cerrada** de 11 nombres (antes un `COUNT` global daba falso negativo si ya existía cualquier otro SELECT sobre SYS).
23. **`PLAN_TABLE` explicado bien**: GTT `ON COMMIT PRESERVE ROWS`, el commit no borra el plan; lo que rompe el flujo es cambiar de conexión del pool. Corregida también la afirmación sobre "PLAN\_TABLE is old version".
24. **Sección 5**: alcance reformulado honestamente, handler `IF SQLCODE NOT IN (-1927,-942) THEN RAISE; END IF;` con traza por objeto, lista ampliada (incluye lo que pudo otorgar la v1) y `DROP` de las vistas/función/cuenta auxiliares.

---

# 3. Qué descarté o apliqué solo en parte

1. **Eliminar `V_$PROCESS` del mínimo** (hallazgo "baja/seguridad"): **descartado como eliminación, aplicado como divulgación.** Su argumento —que la salud del pool se mide con `v$session`— se cae precisamente por el otro hallazgo: si `V$SESSION` está filtrada por contenedor y `V$RESOURCE_LIMIT` no devuelve filas, `V$PROCESS` es lo único que puede compararse contra el parámetro `processes` de la instancia. Lo que sí acepto es la exposición (SPID, usuario del SO, `TRACEFILE`), así que queda declarada en el propio GRANT y la variante 2.B la sustituye por una vista de contadores.
2. **Sustituir `V_$PARAMETER` por una vista filtrada como opción única**: aplicado como **alternativa (2.B)**, no como default. Obligar al DBA a crear un esquema y tres vistas antes de poder ejecutar nada convierte una petición de once líneas en un mini-proyecto, y eso reduce la probabilidad de que la apruebe. El default es el grant directo con la exposición declarada; la variante endurecida está escrita y lista para quien prefiera pagar ese coste.
3. **Añadir `GRANT SELECT ON SYS.V_$SESSIONS_COUNT` a la Sección 2**: **no aplicado en el mínimo.** No he podido confirmar que esa vista exista; ponerla en el mínimo haría fallar el bloque completo bajo `WHENEVER SQLERROR EXIT`. Queda en 3B con la instrucción explícita de otorgarla solo si aparece en la consulta 1.4, y en 1.4 ya se comprueba.
4. **Eliminar la incertidumbre nº3 sobre `V$SESSION_BLOCKERS`**: **aplicado a medias.** He suavizado el texto ("documentada al menos desde 11.2"), pero no la doy por confirmada de memoria; la comprobación de 1.4 no cuesta nada y decide el asunto en su base, que es el único sitio donde importa.
5. **`CREATE USER connect_hub_ro` como paso ejecutado y no comentado dentro del script**: **descartado.** Con `SET ECHO ON` + `SPOOL` activos, o filtra la contraseña al log o hay que apagar y encender el spool en mitad del flujo; además un `ACCEPT` obliga a introducir contraseña en cada relanzamiento y un segundo `CREATE USER` daría ORA-01920 bajo `EXIT`. Lo he dejado como paso 0.3 muy visible, con la guarda B abortando con un mensaje que apunta exactamente a él.
6. **Corrección del código de error del tope de 12 GB (ORA-12954 vs 12952 vs 12592)**: no lo he tocado porque **he retirado toda mención a un código concreto**. Ninguno de los tres especialistas lo tenía verificado y el script no depende de ello; afirmar un código de error sin comprobarlo era exactamente el tipo de detalle que hace que un DBA desconfíe del resto.

---

# 4. Afirmaciones que siguen sin poder confirmarse

1. **Versión exacta del motor.** `XEPDB1` sugiere XE 18c o 21c (23ai Free usa `FREEPDB1`), pero es inferencia. La consulta 1.1 lo resuelve.
2. **`V$RESOURCE_LIMIT` desde el PDB.** Doy por buena la posición de dos revisores (0 filas, información de nivel instancia) y he diseñado en consecuencia, pero **no lo he ejecutado en esta base**. La comprobación es una línea (`SELECT COUNT(*) FROM v$resource_limit;` como SYS dentro de XEPDB1) y decide si el bloque 3G es necesario.
3. **Existencia de `V_$SESSIONS_COUNT`.** No la he podido confirmar en la referencia de 18c/21c. La consulta 1.4 lo dirime.
4. **Existencia de `V_$SESSION_BLOCKERS`** en esta versión concreta. Muy probable, verificable en 1.4.
5. **Alcance de contenedor de `V$PROCESS`.** El etiquetado del plan B depende de si está o no filtrada por `CON_ID`. Lo resuelve el `GROUP BY con_id` de 1.5 y de la prueba de humo; hasta entonces, trátela como cota inferior.
6. **Licenciamiento de `V$SYS_TIME_MODEL` / `V$SESS_TIME_MODEL`.** Son vistas dinámicas base y no figuran en la enumeración del Diagnostics Pack, pero no tengo cita literal que las declare libres. Siguen en el bloque opcional marcadas como "verificar".
7. **Qué cuenta exactamente hacia los 12 GB.** La documentación dice "user data" sin definirlo; hay evidencia empírica publicada (no oficial) de que se evalúan los segmentos de `DBA_SEGMENTS` y de que TEMP y UNDO no cuentan, frente a hilos que sostienen que cuenta el tamaño asignado de los datafiles. El script mide las dos cosas; alerte con la más pesimista al 70 %.
8. **Comportamiento al llegar al tope.** Que los `SELECT` sigan funcionando y solo fallen los `INSERT/UPDATE` que necesiten extender un segmento es inferencia sobre la semántica de asignación de espacio, no está documentado.
9. **Tabla de packs de 21c XE.** Solo está publicada la tabla "Diagnostics Pack = N" del manual de 18c XE. Que 21c mantenga el mismo estado es inferencia respaldada por el default `NONE` de `control_management_pack_access`, que la consulta 1.2 confirma empíricamente.
10. **`SELECT ANY DICTIONARY` y las exclusiones de `SYS.USER$`/`ENC$`/`LINK$`.** La lista ha cambiado entre versiones; no conviene apoyarse en ella como garantía — razón adicional para no pedirlo.
11. **`SET DEFINE` fuera de SQL\*Plus/SQLcl.** Si el script se pega en un IDE que no procesa `DEFINE`, `&usuario` y `&pdb` no se sustituyen: haga un buscar-y-reemplazar antes de ejecutar.
12. **La función `ch_mon.ch_plan` (3D) no la he ejecutado.** He corregido dos errores de la propuesta original (orden de `AUTHID`/`PIPELINED` y construcción del objeto en `PIPE ROW`), pero el bloque necesita una compilación real antes de dárselo al DBA como definitivo.