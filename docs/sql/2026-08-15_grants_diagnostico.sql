-- =====================================================================================
--  PERMISOS DE SOLO LECTURA PARA DIAGNOSTICO  --  proyecto CONNECT_HUB
--  Base: Oracle XE (18c/21c), CDB "XE", PDB "XEPDB1", 154.38.187.235:1521/XEPDB1
--  Base COMPARTIDA con el servicio externo "Evento-back". Nada aqui escribe datos.
--  v2 -- corregido tras revision adversarial (sintaxis / contenedor / seguridad)
--
--  COMO CONECTARSE (obligatorio: al SERVICIO DEL PDB, no al CDB raiz):
--     sqlplus sys/<clave>@154.38.187.235:1521/XEPDB1 as sysdba
--     @grants_diagnostico_connect_hub.sql
--
--  Si entra por el root (bequeath local o servicio del CDB), primero:
--     ALTER SESSION SET CONTAINER = XEPDB1;
--     SET SERVEROUTPUT ON SIZE UNLIMITED     <-- ALTER SESSION SET CONTAINER REINICIA
--                                                el estado de sesion: reponga los SET.
--
--  EJECUTAR EN UNA SESION LIMPIA. GRANT es DDL y lleva COMMIT implicito: si su sesion
--  tenia DML pendiente, la primera sentencia de la Seccion 2 lo confirmaria. El script
--  hace ROLLBACK explicito al arrancar y aborta con ROLLBACK, pero no puede deshacer
--  un COMMIT implicito posterior.
--
--  NO se usa la clausula CONTAINER en ningun GRANT: el beneficiario es un usuario LOCAL
--  del PDB y dentro del PDB el valor por defecto (CONTAINER=CURRENT) es el correcto.
--  Desde CDB$ROOT estos GRANT fallan con ORA-01917 (el usuario no existe alli: en el
--  root no puede haber usuarios locales). Anadir CONTAINER=ALL estando dentro de XEPDB1
--  tampoco vale: esa clausula solo se admite desde CDB$ROOT (ORA-65050). ORA-65030
--  (privilegio comun a usuario local) NO aplica a este escenario.
--
--  Este script NO otorga: escritura, DDL, DBA, ALTER SYSTEM, ALTER SESSION,
--  SELECT ANY TABLE, SELECT ANY DICTIONARY, SELECT_CATALOG_ROLE, ni acceso a ninguna
--  tabla de aplicacion de ningun otro esquema.
-- =====================================================================================

SET ECHO ON
SET FEEDBACK ON
SET LINESIZE 200
SET PAGESIZE 200
SET DEFINE ON
SET VERIFY OFF
SET SQLBLANKLINES ON
SET SERVEROUTPUT ON SIZE UNLIMITED
SPOOL grants_diagnostico_connect_hub.log

ROLLBACK;

-- ---------------------------------------------------------------------------------
--  PARAMETROS DEL SCRIPT
--
--  BENEFICIARIO POR DEFECTO = CONNECT_HUB_RO, una cuenta dedicada de solo lectura.
--  Motivo: CONNECT_HUB es la cuenta de la aplicacion expuesta a internet; todo lo que
--  se le otorgue queda al alcance de una SQL injection o de una dependencia npm
--  comprometida. La cuenta se crea en el PASO 0.3 (ejecutar UNA vez, aparte).
--
--  CONSECUENCIA OPERATIVA que hay que aceptar antes de elegir esta ruta: el agente de
--  diagnostico necesita una CREDENCIAL Y UN POOL PROPIOS. La app seguira usando
--  CONNECT_HUB para sus tablas y para USER_INDEXES / USER_SEGMENTS / EXPLAIN PLAN
--  (que no requieren ningun permiso nuevo), y esas consultas NO se pueden ejecutar
--  desde CONNECT_HUB_RO, que no tiene objetos propios.
--
--  Si el DBA prefiere otorgar sobre la cuenta de aplicacion, cambie esta unica linea
--  a "DEFINE usuario = CONNECT_HUB" y omita el paso 0.3. Que sea una excepcion
--  documentada, no un default silencioso.
-- ---------------------------------------------------------------------------------
DEFINE usuario = CONNECT_HUB_RO
DEFINE pdb     = XEPDB1


-- =====================================================================================
--  SECCION 0  --  PASOS PREVIOS Y GUARDA DE SEGURIDAD
-- =====================================================================================

-- ---------------------------------------------------------------------------------
--  0.1  PASO PREVIO OBLIGATORIO DEL DBA, DESDE CDB$ROOT  (NO desde XEPDB1)
--       CONDICION DE ACEPTACION DEL SCRIPT, no una nota al pie.
--
--       Todo el diseno asume que Evento-back corre DENTRO de XEPDB1. V$SESSION y
--       V$LOCK consultadas desde un PDB estan filtradas por CON_ID: si Evento-back
--       vive en otro PDB del mismo CDB, BLOCKING_SESSION nunca apuntara a sus
--       sesiones y el diagnostico dara "no hay bloqueos" cuando si los hay (falso
--       negativo silencioso sobre el objetivo principal). 18c XE admite 3 PDBs y
--       21c XE quito el limite, asi que un segundo PDB es perfectamente plausible.
--       Ninguna consulta lanzada DENTRO de XEPDB1 puede descartar esto.
--
--       ALTER SESSION SET CONTAINER = CDB$ROOT;
--
--       -- a) inventario de contenedores
--       SELECT con_id, name, open_mode FROM v$containers ORDER BY con_id;
--
--       -- b) EN QUE CONTENEDOR VIVE CADA SERVICIO  <-- lo decisivo
--       SELECT con_id, username, COUNT(*) AS sesiones
--         FROM v$session WHERE type = 'USER'
--        GROUP BY con_id, username ORDER BY 1, 2;
--       -- Si las sesiones de Evento-back aparecen con un CON_ID distinto al de
--       -- XEPDB1, estos GRANT NO cumplen el objetivo de bloqueos: hay que rehacer
--       -- el planteamiento (usuario comun en el root, o diagnostico hecho por el DBA).
--
--       -- c) margen REAL de sesiones/procesos (solo medible desde el root, ver 3G)
--       SELECT resource_name, current_utilization, max_utilization, limit_value
--         FROM v$resource_limit
--        WHERE resource_name IN ('processes','sessions');
--
--       -- d) foto UNICA del espacio total del CDB, para calibrar el desfase de la
--       --    medicion que hace este script (que solo ve XEPDB1)
--       SELECT ROUND(SUM(bytes)/1024/1024/1024,3) AS gb_asignado_cdb FROM cdb_data_files;
-- ---------------------------------------------------------------------------------

-- 0.2  Contexto de la sesion actual --------------------------------------------------
SELECT SYS_CONTEXT('USERENV','CON_NAME')     AS contenedor,
       SYS_CONTEXT('USERENV','SESSION_USER') AS usuario_conectado,
       SYS_CONTEXT('USERENV','ISDBA')        AS es_sysdba,
       SYS_CONTEXT('USERENV','DB_NAME')      AS base
  FROM dual;

WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
-- ROLLBACK explicito: el default de EXIT en SQL*Plus es COMMIT, y el camino de
-- aborto no debe confirmar transacciones ajenas pendientes en la sesion del DBA.

DECLARE
  v_con  VARCHAR2(128) := SYS_CONTEXT('USERENV','CON_NAME');
  v_user VARCHAR2(128) := SYS_CONTEXT('USERENV','SESSION_USER');
  v_dba  VARCHAR2(10)  := SYS_CONTEXT('USERENV','ISDBA');
  v_om   VARCHAR2(20);
BEGIN
  IF v_con <> '&pdb' THEN
    RAISE_APPLICATION_ERROR(-20001,
      'ABORTADO: esta usted en el contenedor "'||v_con||'". Ejecute '||
      'ALTER SESSION SET CONTAINER = &pdb; (y reponga SET SERVEROUTPUT ON).');
  END IF;

  -- SYSTEM NO sirve: GRANT ANY OBJECT PRIVILEGE, como todo privilegio ANY, no alcanza
  -- el esquema SYS mientras O7_DICTIONARY_ACCESSIBILITY sea FALSE (valor por defecto).
  -- Un SYSTEM que pasara la guarda vería fallar los 11 GRANT con ORA-01031.
  IF v_user <> 'SYS' OR v_dba <> 'TRUE' THEN
    RAISE_APPLICATION_ERROR(-20002,
      'ABORTADO: conectado como "'||v_user||'" (ISDBA='||v_dba||'). Se requiere SYS AS SYSDBA.');
  END IF;

  -- Un SYSDBA PUEDE conectarse a un PDB en MOUNTED: CON_NAME devolveria &pdb, la
  -- guarda pasaria y la siguiente consulta al diccionario reventaria con ORA-01219.
  SELECT open_mode INTO v_om FROM v$pdbs WHERE name = v_con;
  IF v_om <> 'READ WRITE' THEN
    RAISE_APPLICATION_ERROR(-20004,
      'ABORTADO: &pdb esta en "'||v_om||'". Abrala con '||
      'ALTER PLUGGABLE DATABASE &pdb OPEN;');
  END IF;

  DBMS_OUTPUT.PUT_LINE('Guarda A OK: contenedor='||v_con||' usuario='||v_user||
                       ' open_mode='||v_om);
END;
/

-- ---------------------------------------------------------------------------------
--  0.3  CUENTA DEDICADA DE SOLO LECTURA  --  EJECUTAR UNA SOLA VEZ, APARTE
--
--       DELIBERADAMENTE FUERA DEL FLUJO AUTOMATICO: este script arranca con
--       SET ECHO ON + SPOOL, y una sentencia CREATE USER ... IDENTIFIED BY dejaria
--       la contrasena EN TEXTO PLANO dentro del .log, que suele acabar adjunto en un
--       ticket o en un correo. Ejecutelo en una sesion SIN spool, o con el patron de
--       abajo (ACCEPT ... HIDE mas SPOOL OFF), y luego relance el script completo.
--
--       EJECUTAR CONECTADO A &pdb. En CDB$ROOT este CREATE USER falla con ORA-65096
--       y eso NO debe "arreglarse" anadiendo el prefijo C##: crearia un usuario COMUN
--       visible en todos los PDBs, justo lo contrario del aislamiento que se busca.
--
--   SPOOL OFF
--   SET ECHO OFF
--   ACCEPT clave CHAR PROMPT 'Clave para CONNECT_HUB_RO: ' HIDE
--   CREATE USER connect_hub_ro IDENTIFIED BY "&clave";
--   GRANT CREATE SESSION TO connect_hub_ro;
--   ALTER USER connect_hub_ro QUOTA 0 ON USERS;      -- no puede crear ni un segmento
--   UNDEFINE clave
--   -- Opcional, para acotar su consumo en una instancia XE con 2 GB de RAM:
--   -- CREATE PROFILE p_solo_lectura LIMIT SESSIONS_PER_USER 2 IDLE_TIME 15;
--   -- ALTER USER connect_hub_ro PROFILE p_solo_lectura;
--   SET ECHO ON
--   SPOOL grants_diagnostico_connect_hub.log APPEND
-- ---------------------------------------------------------------------------------

-- 0.4  Guarda B: el beneficiario existe y es LOCAL -----------------------------------
DECLARE
  v_n      NUMBER;
  v_common VARCHAR2(3);
BEGIN
  SELECT COUNT(*) INTO v_n FROM dba_users WHERE username = UPPER('&usuario');
  IF v_n = 0 THEN
    RAISE_APPLICATION_ERROR(-20003,
      'ABORTADO: el usuario &usuario no existe en &pdb. Ejecute el PASO 0.3 '||
      'para crearlo, o cambie la linea DEFINE usuario del encabezado.');
  END IF;

  SELECT common INTO v_common FROM dba_users WHERE username = UPPER('&usuario');
  IF v_common <> 'NO' THEN
    RAISE_APPLICATION_ERROR(-20005,
      'ABORTADO: &usuario NO es un usuario LOCAL (COMMON='||v_common||'). '||
      'Otorgar sobre un usuario comun cambia el alcance de todo el script.');
  END IF;

  DBMS_OUTPUT.PUT_LINE('Guarda B OK: beneficiario &usuario existe y es LOCAL.');
END;
/

WHENEVER SQLERROR CONTINUE
-- Seccion 1: son consultas informativas. Si alguna falla (p.ej. una columna que no
-- existe en esta version), el script debe seguir. En la Seccion 2 se vuelve a EXIT.


-- =====================================================================================
--  SECCION 1  --  ESTADO "ANTES" (solo consultas, no cambia nada)
-- =====================================================================================

-- 1.1  Version y edicion  (partido en tres: si VERSION_FULL no existiera en esta
--      version, un unico SELECT combinado se llevaria por delante tambien EDITION,
--      que es justo el dato que se quiere confirmar) --------------------------------
SELECT version, edition, host_name, startup_time FROM v$instance;
SELECT version_full FROM v$instance;                 -- ORA-00904 si es 12.1 o anterior
SELECT * FROM product_component_version;             -- siempre funciona, sin permisos

-- 1.2  Parametros que condicionan todo el diagnostico --------------------------------
SELECT name, value, isdefault
  FROM v$parameter
 WHERE name IN ('sessions','processes','cpu_count','sga_target',
                'pga_aggregate_target','open_cursors','statistics_level',
                'cursor_sharing','control_management_pack_access')  -- en XE: NONE
 ORDER BY name;

-- 1.3  Que tiene HOY el beneficiario (linea base para el diferencial de la 4.2) ------
SELECT owner, table_name, privilege, grantable
  FROM dba_tab_privs WHERE grantee = UPPER('&usuario') ORDER BY owner, table_name;

SELECT privilege, admin_option   FROM dba_sys_privs  WHERE grantee = UPPER('&usuario') ORDER BY 1;
SELECT granted_role, default_role FROM dba_role_privs WHERE grantee = UPPER('&usuario') ORDER BY 1;
SELECT username, common, account_status, profile FROM dba_users WHERE username = UPPER('&usuario');

-- 1.4  COMPROBAR QUE LAS VISTAS EXISTEN ANTES DE OTORGARLAS --------------------------
--      Cualquier nombre que NO aparezca aqui no existe en esta version: ignore su GRANT.
SELECT object_name, object_type, status
  FROM dba_objects
 WHERE owner = 'SYS'
   AND object_name IN ('V_$SESSION','V_$LOCK','V_$PROCESS','V_$PARAMETER','V_$INSTANCE',
                       'V_$MYSTAT','V_$STATNAME','V_$SESSION_EVENT','V_$SYSTEM_EVENT',
                       'DBA_DATA_FILES','DBA_FREE_SPACE',
                       'V_$SESSTAT','V_$SYSSTAT','V_$TRANSACTION','V_$LOCKED_OBJECT',
                       'V_$SGASTAT','V_$PGASTAT','V_$SESSION_BLOCKERS','V_$SESSION_WAIT',
                       'V_$SYS_TIME_MODEL','V_$SESS_TIME_MODEL','V_$SESSIONS_COUNT',
                       'V_$RESOURCE_LIMIT','V_$OPEN_CURSOR','V_$SESSION_LONGOPS',
                       'V_$SQL','V_$SQLAREA','V_$SQLSTATS','V_$SQL_PLAN',
                       'V_$SQL_PLAN_STATISTICS_ALL',
                       'V_$DATAFILE','V_$TABLESPACE','V_$DATABASE',
                       'DBA_SEGMENTS','DBA_TABLESPACES','DBA_TEMP_FILES',
                       'DBA_TABLESPACE_USAGE_METRICS')
 ORDER BY object_name;

-- 1.5  Foto actual de sesiones y procesos, CON SU ALCANCE DE CONTENEDOR --------------
SELECT con_id, COUNT(*) AS sesiones FROM v$session GROUP BY con_id ORDER BY 1;
SELECT con_id, COUNT(*) AS procesos FROM v$process GROUP BY con_id ORDER BY 1;
-- Lo anterior responde empiricamente si V$PROCESS esta o no filtrada por contenedor.
-- 'sessions' y 'processes' NO son parametros modificables por PDB: V$PARAMETER
-- devuelve el valor de la INSTANCIA. Si arriba solo aparecen CON_ID 0 y el de &pdb,
-- el cociente compara consumo de un PDB contra un tope de instancia.

SELECT (SELECT value FROM v$parameter WHERE name='sessions')  AS sessions_max_instancia,
       (SELECT value FROM v$parameter WHERE name='processes') AS processes_max_instancia,
       (SELECT COUNT(*) FROM v$session WHERE type='USER')     AS sesiones_usuario_visibles,
       (SELECT COUNT(*) FROM v$process)                       AS procesos_visibles
  FROM dual;

SELECT NVL(username,'(background)') AS usuario, machine, program, status, COUNT(*) AS sesiones
  FROM v$session GROUP BY username, machine, program, status ORDER BY sesiones DESC;

-- 1.6  Espacio  --  COTA INFERIOR: solo ve &pdb, NO ve SYSTEM/SYSAUX/UNDO de CDB$ROOT.
--      Compare con el gb_asignado_cdb del paso 0.1(d) para calibrar el desfase.
SELECT ROUND(SUM(df.bytes)/1024/1024/1024,3)                     AS gb_asignado_permanente,
       ROUND(SUM(DECODE(df.autoextensible,'YES',
                        GREATEST(df.maxbytes,df.bytes),df.bytes))
             /1024/1024/1024,3)                                  AS gb_techo_autoextend,
       ROUND(100*SUM(df.bytes)/(12*1024*1024*1024),1)            AS pct_estimado_pdb
  FROM dba_data_files df
  JOIN dba_tablespaces ts ON ts.tablespace_name = df.tablespace_name
 WHERE ts.contents = 'PERMANENT';   -- excluye UNDO local, coherente con la consulta
                                    -- de segmentos de abajo (que ya excluye UNDO/TEMP)

SELECT NVL(owner,'*** TOTAL ***') AS propietario,
       ROUND(SUM(bytes)/1024/1024/1024,3) AS gb_segmentos
  FROM dba_segments
 WHERE tablespace_name <> 'TEMP'
   AND segment_type NOT LIKE '%UNDO%'
 GROUP BY ROLLUP(owner) ORDER BY 2 DESC NULLS LAST;

-- 1.7  (OPCIONAL, ejecutar como CONNECT_HUB desde la app, SIN ningun permiso nuevo)
--      Confirma lo que YA funciona hoy y por tanto no hay que pedir:
--        SELECT * FROM session_privs;
--        SELECT * FROM user_tab_privs;
--        SELECT * FROM product_component_version;
--        SELECT COUNT(*) FROM user_indexes;
--        SELECT ROUND(SUM(bytes)/1024/1024,1) FROM user_segments;
--        EXPLAIN PLAN FOR SELECT 1 FROM dual;
--        SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);     -- plan ESTIMADO, no el real


-- =====================================================================================
--  SECCION 2  --  GRANTS MINIMOS  (11 sentencias, todas SELECT, todas solo lectura)
--
--  Nombre del objeto: SIEMPRE SYS.V_$XXX con guion bajo. "GRANT ... ON V$SESSION"
--  falla con ORA-02030 porque V$SESSION es un sinonimo publico a una fixed view.
--  Una vez otorgado, la aplicacion puede seguir consultando "FROM v$session".
--
--  Se vuelve a EXIT: el fallo plausible aqui NO es ORA-00942 (las 11 vistas existen
--  con certeza en 18c/21c) sino ORA-01031. Con CONTINUE el script terminaria
--  anunciando exito con un estado parcialmente aplicado.
-- =====================================================================================

WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

-- --- Bloqueos y sesiones -------------------------------------------------------------
GRANT SELECT ON SYS.V_$SESSION TO &usuario;
--   Unica forma de saber quien bloquea a quien (BLOCKING_SESSION, FINAL_BLOCKING_SESSION),
--   mas EVENT / WAIT_CLASS / SECONDS_IN_WAIT y salud del pool.
--   EXPOSICION REAL, declarada: ademas de SID/USERNAME/STATUS, esta vista incluye
--   CLIENT_IDENTIFIER, CLIENT_INFO, MODULE, ACTION, OSUSER, MACHINE, TERMINAL y PROGRAM.
--   CLIENT_IDENTIFIER es el sitio canonico donde un middle tier con pool escribe la
--   identidad del usuario final (correo, cedula, id). Si Evento-back instrumenta su
--   codigo con DBMS_SESSION.SET_IDENTIFIER o DBMS_APPLICATION_INFO -- practica que la
--   propia Oracle recomienda -- aqui se leen identificadores de SUS usuarios finales.
--   NO contiene texto SQL (solo SQL_ID, opaco sin V$SQL).
--   Si esa exposicion no es aceptable, use la VARIANTE ENDURECIDA 2.B en su lugar.

GRANT SELECT ON SYS.V_$LOCK TO &usuario;
--   Tipo y modo de cada enqueue (TX, TM): distingue un bloqueo de fila de uno de tabla.
--   Solo SID, tipo e identificadores internos. Ningun dato de negocio.

-- --- Capacidad y procesos ------------------------------------------------------------
GRANT SELECT ON SYS.V_$PROCESS TO &usuario;
--   Contar procesos servidor frente al parametro 'processes' y detectar una fuga del
--   pool de node-oracledb (poolMax x replicas x numero de pools). Cobra mas peso porque
--   V$RESOURCE_LIMIT no es consultable desde el PDB (ver Seccion 3G).
--   EXPOSICION declarada: SPID, usuario del SISTEMA OPERATIVO, memoria PGA y TRACEFILE,
--   que devuelve RUTAS ABSOLUTAS del ADR del servidor. Es informacion de reconocimiento
--   del host; la variante 2.B la elimina y deja solo los contadores.

GRANT SELECT ON SYS.V_$PARAMETER TO &usuario;
--   Topes configurados (sessions, processes, open_cursors, cursor_sharing) y
--   control_management_pack_access. Leer un parametro no permite cambiarlo.
--   EXPOSICION declarada: tambien devuelve control_files, db_recovery_file_dest,
--   audit_file_dest, diagnostic_dest y spfile, es decir mas rutas del servidor, y toda
--   la configuracion de memoria/seguridad/auditoria de una instancia compartida.
--   La variante 2.B lo sustituye por una vista con los 9 parametros que hacen falta.

GRANT SELECT ON SYS.V_$INSTANCE TO &usuario;
--   Edicion (XE), VERSION, VERSION_FULL y STARTUP_TIME. Cubre por completo lo que se
--   pedia con V$VERSION, que por eso se ha ELIMINADO del minimo.

-- --- Donde se va el tiempo (sin ningun dato de negocio ni texto SQL) -----------------
GRANT SELECT ON SYS.V_$MYSTAT TO &usuario;
--   Estadisticas de la PROPIA sesion (gets, reads, sorts): permite medir el coste de una
--   consulta antes y despues de crear un indice. Riesgo nulo: solo se ve a si misma.
GRANT SELECT ON SYS.V_$STATNAME TO &usuario;
--   Catalogo estatico que traduce los numeros de estadistica a nombres. Sin el, las dos
--   vistas anteriores son ilegibles.
GRANT SELECT ON SYS.V_$SESSION_EVENT TO &usuario;
--   Acumulado de esperas por sesion: dice si el tiempo se va en I/O, en locks o en red.
GRANT SELECT ON SYS.V_$SYSTEM_EVENT TO &usuario;
--   Lo mismo agregado por instancia: punto de partida clasico de un diagnostico de
--   lentitud. Sin estas dos, "diagnosticar lentitud" se queda en una foto instantanea.

-- --- Espacio -------------------------------------------------------------------------
GRANT SELECT ON SYS.DBA_DATA_FILES TO &usuario;
--   Tamano actual, MAXBYTES y AUTOEXTENSIBLE. Es la medida del consumo frente al tope de
--   12 GB de datos de usuario de XE, que es de TODA la base y no del esquema.
--   ALCANCE: desde el PDB solo ve &pdb -- COTA INFERIOR (ver 1.6 y paso 0.1d).
--   Devuelve nombres de fichero y bytes, ningun contenido.
GRANT SELECT ON SYS.DBA_FREE_SPACE TO &usuario;
--   Espacio libre real por tablespace: anticipa un ORA-01653 "unable to extend".
--   Solo tablespace, file_id y bytes.

-- (No hace falta COMMIT: GRANT es DDL y confirma implicitamente.)

WHENEVER SQLERROR CONTINUE


-- =====================================================================================
--  SECCION 2.B  --  VARIANTE ENDURECIDA (OPCIONAL, PREFERIDA SI EL DBA QUIERE LA
--  SUPERFICIE MINIMA).  Sustituye los GRANT sobre V_$SESSION, V_$PROCESS y V_$PARAMETER
--  por vistas filtradas POR COLUMNA que crea y mantiene el DBA. Cubre el 100 % del caso
--  de uso (bloqueos, fuga de pool, topes) sin exponer ni un campo de texto libre ni una
--  sola ruta del sistema de ficheros.
--  EJECUTAR CONECTADO A &pdb. Coste: tres vistas que mantener.
--  NUNCA crear estos objetos en el esquema SYS: no esta soportado y en un contenedor
--  compartido anade riesgo a datapatch y a los upgrades que tambien afectan a Evento-back.
-- -------------------------------------------------------------------------------------
-- CREATE USER ch_mon IDENTIFIED BY "<clave_fuerte>";     -- (crear sin spool, ver 0.3)
-- GRANT CREATE SESSION, CREATE VIEW TO ch_mon;
-- ALTER USER ch_mon QUOTA 0 ON USERS;
-- -- Grants DIRECTOS y WITH GRANT OPTION: por rol no se puede crear una vista sobre las
-- -- V$ (ORA-01031), y sin GRANT OPTION el propietario no puede ceder acceso a su vista.
-- GRANT SELECT ON SYS.V_$SESSION   TO ch_mon WITH GRANT OPTION;
-- GRANT SELECT ON SYS.V_$PROCESS   TO ch_mon WITH GRANT OPTION;
-- GRANT SELECT ON SYS.V_$PARAMETER TO ch_mon WITH GRANT OPTION;
--
-- CREATE OR REPLACE VIEW ch_mon.ch_session AS
--   SELECT sid, serial#, username, status, type, event, wait_class, seconds_in_wait,
--          blocking_session, final_blocking_session, last_call_et, sql_id, machine, program
--     FROM v$session;                     -- sin client_identifier/client_info/module/
--                                         -- action/osuser/terminal
-- CREATE OR REPLACE VIEW ch_mon.ch_procesos AS
--   SELECT COUNT(*) AS procesos_totales,
--          SUM(DECODE(background,NULL,1,0)) AS procesos_servidor
--     FROM v$process;                     -- sin spid, sin usuario del SO, sin tracefile
-- CREATE OR REPLACE VIEW ch_mon.ch_parametros AS
--   SELECT name, value, isdefault FROM v$parameter
--    WHERE name IN ('sessions','processes','cpu_count','sga_target',
--                   'pga_aggregate_target','open_cursors','statistics_level',
--                   'cursor_sharing','control_management_pack_access');
--
-- GRANT SELECT ON ch_mon.ch_session    TO &usuario;
-- GRANT SELECT ON ch_mon.ch_procesos   TO &usuario;
-- GRANT SELECT ON ch_mon.ch_parametros TO &usuario;
-- -- Y entonces REVOCAR de la Seccion 2 los tres grants directos que sustituyen:
-- -- REVOKE SELECT ON SYS.V_$SESSION   FROM &usuario;
-- -- REVOKE SELECT ON SYS.V_$PROCESS   FROM &usuario;
-- -- REVOKE SELECT ON SYS.V_$PARAMETER FROM &usuario;
-- -- AVISO: si mas adelante se habilita el bloque 3A, DBMS_XPLAN.DISPLAY_CURSOR exige
-- -- SELECT DIRECTO sobre SYS.V_$SESSION; una vista derivada no le sirve.


-- =====================================================================================
--  SECCION 3  --  BLOQUES OPCIONALES  --  NO EJECUTAR SIN APROBACION EXPLICITA DEL DBA
--  Todos comentados. Ordenados de menor a mayor sensibilidad.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
--  3B  DIAGNOSTICO AMPLIADO  (riesgo: bajo)
--      Ninguna de estas vistas expone texto SQL ni nombres de objetos de otros esquemas.
--      (V$OPEN_CURSOR se movio a 3A y V$SESSION_LONGOPS a 3C: no cumplian esa condicion.)
-- -------------------------------------------------------------------------------------
-- GRANT SELECT ON SYS.V_$SESSTAT          TO &usuario;  -- Estadisticas de cualquier sesion: comparar una sesion lenta con una sana.
-- GRANT SELECT ON SYS.V_$SYSSTAT          TO &usuario;  -- Contadores globales (parses, gets, redo): detecta hard parsing excesivo.
-- GRANT SELECT ON SYS.V_$TRANSACTION      TO &usuario;  -- Transacciones abiertas y su antiguedad: el commit olvidado que bloquea una fila horas.
-- GRANT SELECT ON SYS.V_$LOCKED_OBJECT    TO &usuario;  -- Que OBJECT_ID esta bloqueado y por que sesion. El ID es opaco salvo para objetos propios.
-- GRANT SELECT ON SYS.V_$SGASTAT          TO &usuario;  -- Reparto de la SGA; con 2 GB de RAM, detecta presion en la shared pool.
-- GRANT SELECT ON SYS.V_$PGASTAT          TO &usuario;  -- Si los sorts/hash joins se van a disco (temp), causa habitual de lentitud en XE.
-- GRANT SELECT ON SYS.V_$SESSION_BLOCKERS TO &usuario;  -- Cadena bloqueador->bloqueado ya resuelta. Documentada al menos desde 11.2; la consulta 1.4 lo confirma en su base.
-- GRANT SELECT ON SYS.V_$SESSION_WAIT     TO &usuario;  -- REDUNDANTE en 10g+: V$SESSION ya trae EVENT, WAIT_CLASS y SECONDS_IN_WAIT.
-- GRANT SELECT ON SYS.V_$SYS_TIME_MODEL   TO &usuario;  -- Descompone el DB time en CPU, parseo y PL/SQL. VERIFICAR LICENCIAMIENTO (ver notas finales).
-- GRANT SELECT ON SYS.V_$SESS_TIME_MODEL  TO &usuario;  -- Lo mismo por sesion. Misma reserva.
-- GRANT SELECT ON SYS.V_$SESSIONS_COUNT   TO &usuario;  -- Conteo de sesiones por contenedor que SI funciona dentro del PDB. OTORGAR SOLO SI APARECE EN LA CONSULTA 1.4: no he podido confirmar que exista en esta version.

-- -------------------------------------------------------------------------------------
--  3C  ESPACIO GLOBAL Y NOMBRES DE OBJETOS  (riesgo: MEDIO - expone NOMBRES ajenos)
--      Necesario SOLO para medir el tope de 12 GB, que es de toda la base. Nunca expone
--      contenido. Si no es aceptable: quedarse con USER_SEGMENTS y pedir al DBA un
--      chequeo periodico.
-- -------------------------------------------------------------------------------------
-- GRANT SELECT ON SYS.DBA_SEGMENTS                 TO &usuario;  -- Suma real por esquema: quien consume el cupo de los 12 GB. Revela nombres de tablas e indices de Evento-back.
-- GRANT SELECT ON SYS.DBA_TABLESPACE_USAGE_METRICS TO &usuario;  -- Porcentaje usado contando ya el autoextend hasta MAXBYTES: lo mas limpio para una alerta al 70 %.
-- GRANT SELECT ON SYS.DBA_TABLESPACES              TO &usuario;  -- Atributos de cada tablespace; necesario para excluir UNDO/TEMP de forma coherente.
-- GRANT SELECT ON SYS.DBA_TEMP_FILES               TO &usuario;  -- TEMP no cuenta hacia los 12 GB, pero puede agotarse por si solo.
-- GRANT SELECT ON SYS.V_$SESSION_LONGOPS           TO &usuario;  -- Progreso de operaciones largas. MOVIDO AQUI desde 3B: su columna TARGET devuelve el nombre OWNER.OBJETO de tablas ajenas, la misma exposicion por la que DBA_SEGMENTS es riesgo medio.
-- GRANT SELECT ON SYS.V_$DATAFILE                  TO &usuario;  -- Equivalente dinamico de DBA_DATA_FILES con estado en vivo.
-- GRANT SELECT ON SYS.V_$TABLESPACE                TO &usuario;  -- Mapear los TS# de las vistas dinamicas a nombres.
-- GRANT SELECT ON SYS.V_$DATABASE                  TO &usuario;  -- DBID, nombre y modo de log; requisito de algunas funciones de DBMS_XPLAN.

-- -------------------------------------------------------------------------------------
--  3A  TEXTO SQL Y PLANES REALES EN MEMORIA  (riesgo: ALTO - posible fuga de datos
--      personales de OTRO responsable de tratamiento)
--
--      QUE CUBRE Y QUE NO:
--       - Plan ESTIMADO de una consulta propia: EXPLAIN PLAN + DBMS_XPLAN.DISPLAY ya
--         funcionan HOY sin ningun permiso. PLAN_TABLE es un sinonimo publico a
--         SYS.PLAN_TABLE$, con privilegios a PUBLIC desde 10g.
--       - Plan REALMENTE EJECUTADO (E-Rows vs A-Rows): NO esta cubierto sin permisos.
--         El hint /*+ GATHER_PLAN_STATISTICS */ solo RECOLECTA las estadisticas; para
--         LEERLAS hay que llamar a DBMS_XPLAN.DISPLAY_CURSOR, que es AUTHID CURRENT_USER
--         y por tanto exige SELECT DIRECTO sobre V$SQL, V$SQL_PLAN,
--         V$SQL_PLAN_STATISTICS_ALL y V$SESSION. Sin ellos NO lanza excepcion: devuelve
--         una fila de texto "User has no SELECT privilege on V$SQL_PLAN".
--
--      RIESGO CONCRETO: SQL_TEXT / SQL_FULLTEXT y las columnas ACCESS_PREDICATES y
--      FILTER_PREDICATES conservan los literales tal como se parsearon. Si Evento-back
--      concatena literales en vez de usar bind variables, ahi quedan correos, cedulas...
--      PREFERIR EL BLOQUE 3D, que da lo mismo con el filtro puesto por el DBA.
-- -------------------------------------------------------------------------------------
-- -- Los TRES estrictamente necesarios para DISPLAY_CURSOR (V_$SESSION ya va en la Seccion 2):
-- GRANT SELECT ON SYS.V_$SQL                     TO &usuario;
-- GRANT SELECT ON SYS.V_$SQL_PLAN                TO &usuario;
-- GRANT SELECT ON SYS.V_$SQL_PLAN_STATISTICS_ALL TO &usuario;
-- -- NO son necesarios para DISPLAY_CURSOR; otorgar solo si se quieren las metricas agregadas:
-- GRANT SELECT ON SYS.V_$SQLAREA                 TO &usuario;  -- Filtra exactamente igual que V$SQL.
-- GRANT SELECT ON SYS.V_$SQLSTATS                TO &usuario;  -- Mas barata, pero SI expone SQL_TEXT (aunque no SQL_FULLTEXT): no es inmune a la fuga de literales.
-- GRANT SELECT ON SYS.V_$OPEN_CURSOR             TO &usuario;  -- MOVIDO AQUI desde 3B: detecta la fuga que acaba en ORA-01000, pero incluye SQL_TEXT (60 caracteres) de TODAS las sesiones del PDB, suficiente para capturar el arranque de un WHERE con literales.

-- -------------------------------------------------------------------------------------
--  3D  ALTERNATIVA RECOMENDADA A 3A  --  FUNCION PIPELINED CON DERECHOS DE DEFINIDOR
--
--      OJO: dos vistas filtradas NO sirven. Como DBMS_XPLAN es AUTHID CURRENT_USER,
--      comprueba el privilegio sobre las FIXED VIEWS reales, no sobre vistas derivadas:
--      con vistas seguiria respondiendo "User has no SELECT privilege on V$SQL_PLAN", y
--      ademas V$SQL_PLAN no contiene las cardinalidades reales (estan en
--      V$SQL_PLAN_STATISTICS_ALL). La unica forma de filtrar Y conservar el formateo es
--      una funcion con derechos de definidor en un esquema administrativo.
--      EJECUTAR CONECTADO A &pdb. Nunca crear estos objetos en SYS.
-- -------------------------------------------------------------------------------------
-- -- Preparacion (el esquema ch_mon de 2.B sirve; grants DIRECTOS, no por rol):
-- GRANT SELECT ON SYS.V_$SQL                     TO ch_mon;
-- GRANT SELECT ON SYS.V_$SQL_PLAN                TO ch_mon;
-- GRANT SELECT ON SYS.V_$SQL_PLAN_STATISTICS_ALL TO ch_mon;
-- GRANT SELECT ON SYS.V_$SESSION                 TO ch_mon;
-- GRANT CREATE PROCEDURE TO ch_mon;
--
-- CREATE OR REPLACE FUNCTION ch_mon.ch_plan (
--   p_sql_id VARCHAR2,
--   p_child  NUMBER   DEFAULT NULL,
--   p_fmt    VARCHAR2 DEFAULT 'ALLSTATS LAST'
-- ) RETURN sys.dbms_xplan_type_table
--   AUTHID DEFINER PIPELINED
-- IS
--   v_n PLS_INTEGER;
-- BEGIN
--   SELECT COUNT(*) INTO v_n FROM v$sql
--    WHERE sql_id = p_sql_id AND parsing_schema_name = 'CONNECT_HUB';
--   IF v_n = 0 THEN
--     RAISE_APPLICATION_ERROR(-20010,'sql_id ajeno a CONNECT_HUB o ya no esta en memoria');
--   END IF;
--   FOR r IN (SELECT plan_table_output
--               FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(p_sql_id, p_child, p_fmt))) LOOP
--     PIPE ROW (sys.dbms_xplan_type(r.plan_table_output));   -- construir el objeto:
--   END LOOP;                                                -- PIPE ROW(r) daria PLS-00382
--   RETURN;
-- END;
-- /
-- GRANT EXECUTE ON ch_mon.ch_plan TO &usuario;
-- -- Uso desde la aplicacion:  SELECT * FROM TABLE(ch_mon.ch_plan('<sql_id>'));

-- -------------------------------------------------------------------------------------
--  3E  CUENTA DEDICADA DE SOLO LECTURA  --  ver PASO 0.3 (es el default de este script).
--      Aqui solo queda el perfil opcional:
-- -------------------------------------------------------------------------------------
-- CREATE PROFILE p_solo_lectura LIMIT SESSIONS_PER_USER 2 IDLE_TIME 15;
-- ALTER USER connect_hub_ro PROFILE p_solo_lectura;

-- -------------------------------------------------------------------------------------
--  3G  MARGEN REAL DE SESIONES / PROCESOS  --  NO ES OBTENIBLE DESDE EL PDB
--
--      V$RESOURCE_LIMIT es informacion de nivel INSTANCIA: consultada desde dentro de un
--      PDB no devuelve filas. El GRANT se ejecuta sin error y la vista queda vacia EN
--      SILENCIO, que es peor que un ORA-00942 (que al menos avisa). MAX_UTILIZATION --el
--      unico dato que de verdad anticipa un ORA-00020-- es inalcanzable desde &pdb, y
--      ningun privilegio lo arregla porque el filtro es de contenedor, no de permiso.
--
--      Compruebelo usted mismo en 30 segundos, como SYS dentro de &pdb:
--        SELECT COUNT(*) FROM v$resource_limit;
--      Si devuelve filas (contra lo esperado), basta con descomentar:
-- GRANT SELECT ON SYS.V_$RESOURCE_LIMIT TO &usuario;
--
--      RUTA A) medicion EXACTA: usuario comun creado por el DBA en CDB$ROOT solo para
--      esto, y una SEGUNDA conexion del agente al servicio del CDB raiz (no a &pdb):
--        ALTER SESSION SET CONTAINER = CDB$ROOT;
--        CREATE USER c##ch_mon IDENTIFIED BY "<clave>" CONTAINER=ALL;
--        GRANT CREATE SESSION TO c##ch_mon CONTAINER=ALL;
--        GRANT SELECT ON SYS.V_$RESOURCE_LIMIT TO c##ch_mon CONTAINER=ALL;
--
--      RUTA B) ESTIMACION (la que cubre este script sin pedir nada mas): el Plan B de
--      la Seccion 4.4. Etiquetela SIEMPRE como estimacion, nunca como "margen".

-- -------------------------------------------------------------------------------------
--  3F  LISTA NEGRA  --  NO OTORGAR NUNCA EN ESTE ESCENARIO
-- -------------------------------------------------------------------------------------
--   DBA                       : incluye DROP ANY TABLE, BECOME USER y CREATE ANY DIRECTORY.
--   SELECT ANY TABLE          : lee todas las filas de todas las tablas de Evento-back.
--   SELECT ANY DICTIONARY     : da DBA_SOURCE (PL/SQL ajeno en texto plano) y los
--                               LOW_VALUE/HIGH_VALUE de cada columna, que son valores
--                               REALES decodificables. Sigue activo dentro de PL/SQL
--                               definer's rights, asi que es mas dificil de acotar.
--   SELECT_CATALOG_ROLE       : mismo problema en la practica; ademas, por ser ROL queda
--                               deshabilitado en procedimientos con derechos de definidor
--                               y no permite CREATE VIEW sobre las V$ (ORA-01031).
--   ALTER SYSTEM              : KILL SESSION sobre sesiones del otro equipo y FLUSH
--                               SHARED_POOL: en 2 CPU es un DoS directo.
--   ALTER SESSION             : habilita ALTER SESSION SET EVENTS y trazas que escriben
--                               ficheros en el servidor. No hace falta.
--   SET CONTAINER             : innecesario e INERTE para un usuario LOCAL, que no puede
--                               cambiar a CDB$ROOT ni a otro PDB bajo ninguna
--                               circunstancia. Se excluye por higiene, NO por riesgo de
--                               escalada (la version anterior de esta nota decia que
--                               "romperia el aislamiento del PDB": era incorrecto).
--   DBA_USERS                 : censo completo de cuentas, estado y perfil.
--   DBA_INDEXES / ALL_INDEXES : solo servirian para ver indices ajenos. Para los propios
--                               bastan USER_INDEXES y USER_IND_COLUMNS, ya disponibles.
--   V$SQL_BIND_CAPTURE        : contiene los VALORES REALES de las bind variables. La peor
--                               vista posible en una base compartida: filtra datos incluso
--                               del codigo bien escrito.
--   -- LICENCIAMIENTO (Diagnostics Pack / Tuning Pack, NO incluidos en XE) --
--   V$ACTIVE_SESSION_HISTORY, DBA_HIST_* (salvo DBA_HIST_SNAPSHOT, DBA_HIST_DATABASE_INSTANCE,
--   DBA_HIST_SNAP_ERROR, DBA_HIST_SEG_STAT, DBA_HIST_SEG_STAT_OBJ, DBA_HIST_UNDOSTAT),
--   DBMS_WORKLOAD_REPOSITORY, DBMS_ADDM, DBMS_SQLTUNE, DBMS_SQL_MONITOR, V$SQL_MONITOR,
--   DBMS_XPLAN.DISPLAY_AWR, awrrpt.sql / ashrpt.sql / addmrpt.sql
--     -> En XE ambos packs figuran como no disponibles y control_management_pack_access
--        viene en NONE, por lo que ademas estarian VACIAS. El manual de licenciamiento
--        dice que cualquier metodo de acceso, incluido el acceso directo a los datos
--        subyacentes, requiere la licencia. Alternativa gratuita para historico:
--        Statspack (no requiere Diagnostics Pack), pero instalarlo es una operacion de
--        escritura de SYS, fuera de este alcance.


-- =====================================================================================
--  SECCION 4  --  VERIFICACION
-- =====================================================================================

-- 4.1  Que quedo otorgado exactamente (como SYS) --------------------------------------
SELECT owner, table_name, privilege, grantable
  FROM dba_tab_privs
 WHERE grantee = UPPER('&usuario') AND owner = 'SYS'
 ORDER BY table_name;

-- 4.2  Conteo acotado a la LISTA CERRADA de la Seccion 2 (esperado: 11) ---------------
--      Se filtra por nombre y no se cuenta el total: si el beneficiario ya tenia algun
--      SELECT sobre otro objeto de SYS, un COUNT global no seria 11 y se leeria como fallo.
SELECT COUNT(*) AS privilegios_seccion2_otorgados
  FROM dba_tab_privs
 WHERE grantee = UPPER('&usuario') AND owner = 'SYS' AND privilege = 'SELECT'
   AND table_name IN ('V_$SESSION','V_$LOCK','V_$PROCESS','V_$PARAMETER','V_$INSTANCE',
                      'V_$MYSTAT','V_$STATNAME','V_$SESSION_EVENT','V_$SYSTEM_EVENT',
                      'DBA_DATA_FILES','DBA_FREE_SPACE');

-- 4.3  CONTROL DE NO-ESCALADA: no debe aparecer nada peligroso ------------------------
--      En CONNECT_HUB_RO se espera UNICAMENTE CREATE SESSION y ningun rol.
--      Si aparece DBA, SELECT ANY TABLE, SELECT ANY DICTIONARY, ALTER SYSTEM o
--      SELECT_CATALOG_ROLE, algo se colo.
SELECT privilege    AS privilegio_sistema, admin_option FROM dba_sys_privs  WHERE grantee = UPPER('&usuario') ORDER BY 1;
SELECT granted_role AS rol, default_role, admin_option  FROM dba_role_privs WHERE grantee = UPPER('&usuario') ORDER BY 1;

-- 4.4  PRUEBA DE HUMO  --  ejecutar CONECTADO COMO &usuario
--      Los GRANT de objeto surten efecto de inmediato: no hace falta reconectar el pool
--      (a diferencia de los roles, que si exigen reconexion).
--
--      SELECT COUNT(*) FROM v$session;      -- ya no debe dar ORA-00942
--      SELECT COUNT(*) FROM v$lock;
--      SELECT COUNT(*) FROM v$process;
--      SELECT name,value FROM v$parameter WHERE name IN ('sessions','processes');
--      SELECT version, edition FROM v$instance;
--      SELECT COUNT(*) FROM v$system_event;
--      SELECT ROUND(SUM(bytes)/1024/1024/1024,3) FROM dba_data_files;
--
--      -- Estas funcionan como CONNECT_HUB (la cuenta con objetos), SIN permisos nuevos:
--      SELECT COUNT(*) FROM user_indexes;
--      SELECT ROUND(SUM(bytes)/1024/1024,1) FROM user_segments;
--      EXPLAIN PLAN FOR SELECT 1 FROM dual;
--      SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);
--        PLAN_TABLE es una GLOBAL TEMPORARY TABLE con ON COMMIT PRESERVE ROWS: el COMMIT
--        (incluido el autoCommit de node-oracledb) NO borra el plan. Lo que rompe el flujo
--        es que las filas de una GTT son POR SESION: con un pool hay que ejecutar
--        EXPLAIN PLAN y DBMS_XPLAN.DISPLAY sobre el MISMO objeto connection, sin
--        devolverlo al pool entre medias. (No hace falta crear una PLAN_TABLE local; si
--        se crea con un utlxplan.sql antiguo, de ahi sale "PLAN_TABLE is old version".)
--
--      -- ALCANCE DE CONTENEDOR (verificacion empirica, imprescindible antes de fiarse
--      -- de cualquier cifra de capacidad):
--      SELECT con_id, COUNT(*) FROM v$session GROUP BY con_id ORDER BY 1;
--      SELECT con_id, COUNT(*) FROM v$process GROUP BY con_id ORDER BY 1;
--
--      -- ESTIMACION de capacidad (Ruta B de 3G):
--      SELECT (SELECT value FROM v$parameter WHERE name='sessions')  AS sessions_max_instancia,
--             (SELECT value FROM v$parameter WHERE name='processes') AS processes_max_instancia,
--             (SELECT COUNT(*) FROM v$session WHERE type='USER')     AS sesiones_visibles,
--             (SELECT COUNT(*) FROM v$process)                       AS procesos_visibles
--        FROM dual;
--      Etiquetado correcto de ese resultado:
--        - sesiones: COTA INFERIOR. V$SESSION esta filtrada por contenedor y el tope es
--          de instancia. Sirve para detectar una fuga del pool, NUNCA para afirmar que
--          hay margen.
--        - procesos: si la consulta de con_id de arriba muestra procesos de mas de un
--          contenedor, es una medida COMPLETA frente al parametro 'processes'; si solo
--          muestra &pdb, tratela tambien como cota inferior.
--
--      -- Salud del pool de node-oracledb (poolMax x replicas x numero de pools):
--      SELECT status, COUNT(*) AS n, ROUND(AVG(last_call_et)) AS seg_inactiva_prom,
--             MAX(last_call_et) AS seg_inactiva_max
--        FROM v$session WHERE username = 'CONNECT_HUB' GROUP BY status;
--
--      -- Cadenas de bloqueo (no requiere ningun pack):
--      SELECT s.sid, s.serial#, s.username, s.machine, s.status,
--             s.blocking_session AS bloqueado_por, s.event AS esperando,
--             s.seconds_in_wait, s.sql_id
--        FROM v$session s
--       WHERE s.blocking_session IS NOT NULL
--          OR s.sid IN (SELECT blocking_session FROM v$session WHERE blocking_session IS NOT NULL)
--       ORDER BY s.blocking_session NULLS FIRST, s.seconds_in_wait DESC;
--
--      -- Esperas acumuladas de la instancia (el punto de partida de "va lento"):
--      SELECT event, total_waits, ROUND(time_waited_micro/1e6) AS seg_esperados
--        FROM v$system_event WHERE wait_class <> 'Idle'
--       ORDER BY time_waited_micro DESC FETCH FIRST 15 ROWS ONLY;


-- =====================================================================================
--  SECCION 5  --  REVOCAR  (rollback de los PRIVILEGIOS DE OBJETO sobre SYS)
--
--  ALCANCE EXACTO: revoca los privilegios de objeto sobre SYS que otorgan las Secciones
--  2, 3A, 3B, 3C y 3G (lista cerrada, incluye tambien los de la version anterior del
--  script). NO revoca: las vistas y la funcion de 2.B / 3D, ni la cuenta CONNECT_HUB_RO
--  ni su perfil. Esos objetos se limpian al final, a mano.
--  ESTA COMENTADO A PROPOSITO: descomentar solo para revertir.
-- =====================================================================================

-- SET SERVEROUTPUT ON SIZE UNLIMITED
-- DECLARE
--   TYPE t_lista IS TABLE OF VARCHAR2(128);
--   v_obj t_lista := t_lista(
--     -- Seccion 2
--     'V_$SESSION','V_$LOCK','V_$PROCESS','V_$PARAMETER','V_$INSTANCE',
--     'V_$MYSTAT','V_$STATNAME','V_$SESSION_EVENT','V_$SYSTEM_EVENT',
--     'DBA_DATA_FILES','DBA_FREE_SPACE',
--     -- retirados del minimo en v2, pero pudieron otorgarse con la v1
--     'V_$VERSION','V_$RESOURCE_LIMIT',
--     -- Seccion 3B
--     'V_$SESSTAT','V_$SYSSTAT','V_$TRANSACTION','V_$LOCKED_OBJECT','V_$SGASTAT',
--     'V_$PGASTAT','V_$SESSION_BLOCKERS','V_$SESSION_WAIT','V_$SYS_TIME_MODEL',
--     'V_$SESS_TIME_MODEL','V_$SESSIONS_COUNT',
--     -- Seccion 3C
--     'DBA_SEGMENTS','DBA_TABLESPACE_USAGE_METRICS','DBA_TABLESPACES','DBA_TEMP_FILES',
--     'V_$SESSION_LONGOPS','V_$DATAFILE','V_$TABLESPACE','V_$DATABASE',
--     -- Seccion 3A
--     'V_$SQL','V_$SQL_PLAN','V_$SQL_PLAN_STATISTICS_ALL','V_$SQLAREA','V_$SQLSTATS',
--     'V_$OPEN_CURSOR');
--   v_revocados PLS_INTEGER := 0;
-- BEGIN
--   FOR i IN 1 .. v_obj.COUNT LOOP
--     BEGIN
--       EXECUTE IMMEDIATE 'REVOKE SELECT ON SYS."'||v_obj(i)||'" FROM &usuario';
--       v_revocados := v_revocados + 1;
--       DBMS_OUTPUT.PUT_LINE('  revocado  '||v_obj(i));
--     EXCEPTION
--       WHEN OTHERS THEN
--         -- ORA-01927 = no estaba otorgado ; ORA-00942 = la vista no existe aqui.
--         -- Cualquier otro error (p.ej. ORA-01031) DEBE ser ruidoso.
--         IF SQLCODE NOT IN (-1927, -942) THEN RAISE; END IF;
--         DBMS_OUTPUT.PUT_LINE('  omitido   '||v_obj(i)||': '||SQLERRM);
--     END;
--   END LOOP;
--   DBMS_OUTPUT.PUT_LINE('Privilegios revocados a &usuario: '||v_revocados);
-- END;
-- /
--
-- -- Objetos de 2.B y 3D (si se llegaron a crear):
-- -- REVOKE SELECT  ON ch_mon.ch_session    FROM &usuario;
-- -- REVOKE SELECT  ON ch_mon.ch_procesos   FROM &usuario;
-- -- REVOKE SELECT  ON ch_mon.ch_parametros FROM &usuario;
-- -- REVOKE EXECUTE ON ch_mon.ch_plan       FROM &usuario;
-- -- DROP VIEW ch_mon.ch_session; DROP VIEW ch_mon.ch_procesos;
-- -- DROP VIEW ch_mon.ch_parametros; DROP FUNCTION ch_mon.ch_plan;
-- -- DROP USER ch_mon CASCADE;
--
-- -- Cuenta dedicada de 0.3 / 3E (si se creo):
-- -- DROP USER connect_hub_ro CASCADE;
-- -- DROP PROFILE p_solo_lectura;                 -- solo si no lo usa nadie mas
--
-- -- Comprobacion posterior: no debe quedar nada de owner SYS
-- SELECT owner, table_name, privilege FROM dba_tab_privs
--  WHERE grantee = UPPER('&usuario') AND owner = 'SYS' ORDER BY table_name;
--
-- -- Generador manual alternativo (imprime un REVOKE por linea para revisarlos uno a uno):
-- SELECT 'REVOKE '||privilege||' ON '||owner||'.'||table_name||' FROM &usuario;'
--   FROM dba_tab_privs WHERE grantee = UPPER('&usuario') AND owner = 'SYS';

SPOOL OFF
SET ECHO OFF
-- =====================================================================================
--  FIN
-- =====================================================================================
