# Eventos de pago incobrables: la institución no se resuelve si el evento no tiene salón

**Para:** equipo de `Evento-back`
**Archivo:** `src/modules/eventoUsuario/query.ts` → `obtenerDatosInstitucion` (línea ~113)
**Prioridad:** alta — hoy hay eventos publicados y de pago que nadie puede pagar.

## Qué pasa

Al intentar pagar un evento, la app recibe:

```
404 — "Institución no encontrada para el evento"
```

El evento se ve bien en la app, con su precio correcto. Falla solo al llegar al pago.

## Por qué

`obtenerDatosInstitucion` resuelve la institución **únicamente a través del salón**:

```ts
.from("EVENTOS", "e")
.innerJoin("SALONES", "s", "s.ID_SALON = e.ID_SALON")
.innerJoin("LOCALES", "l", "l.ID_LOCAL = s.ID_LOCAL")
.innerJoin("INSTITUCIONES", "i", "i.ID_INSTITUCION = l.ID_INSTITUCION")
```

Pero un evento puede colgar de un **salón** *o* directamente de un **local**: `EVENTOS` tiene las dos columnas, `ID_SALON` e `ID_LOCAL`, y el panel permite crear el evento con solo el local. En ese caso `e.ID_SALON` es `NULL`, el `INNER JOIN` no encuentra fila, `getRawOne()` devuelve `undefined` y se lanza el 404.

Comprobado en producción:

| Evento | ID_SALON | ID_LOCAL | Resultado |
|---|---|---|---|
| 163 · EVENTO DEL GOBERNADOR | 201 | 161 | cobra bien |
| 321 · PRUEBAS PAGOS | **NULL** | 201 | 404 |
| 281 · IV CONGRESO … ODONTOLÓGICAS UEES | **NULL** | 201 | 404 — publicado, $300 |

## El arreglo

Aceptar los dos caminos y quedarse con el que exista. Es lo mismo que ya hace el API del panel en `pagos.service.ts`:

```ts
const result = await manager
  .createQueryBuilder()
  .select([
    // ... el mismo select, sin cambios ...
  ])
  .from("EVENTOS", "e")
  // Un evento puede colgar de un SALÓN o directamente de un LOCAL.
  // Los tres joins van en LEFT para que ninguno de los dos casos descarte la fila.
  .leftJoin("LOCALES", "l", "l.ID_LOCAL = e.ID_LOCAL")
  .leftJoin("SALONES", "s", "s.ID_SALON = e.ID_SALON")
  .leftJoin("LOCALES", "l2", "l2.ID_LOCAL = s.ID_LOCAL")
  .innerJoin(
    "INSTITUCIONES",
    "i",
    "i.ID_INSTITUCION = COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION)",
  )
  .where("e.ID_EVENTO = :idEvento", { idEvento })
  .getRawOne();
```

El `INNER JOIN` final se mantiene a propósito: si el evento no llega a ninguna institución por ninguno de los dos caminos, el 404 sigue siendo la respuesta correcta.

En SQL plano, por si ayuda a probarlo:

```sql
SELECT i.*
  FROM EVENTOS e
  LEFT JOIN LOCALES l  ON l.ID_LOCAL  = e.ID_LOCAL
  LEFT JOIN SALONES s  ON s.ID_SALON  = e.ID_SALON
  LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
  JOIN INSTITUCIONES i
    ON i.ID_INSTITUCION = COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION)
 WHERE e.ID_EVENTO = :idEvento;
```

## Cómo comprobarlo

Crear un evento de pago con **local y sin salón** e intentar pagarlo. Antes del cambio da 404; después debe llegar a la pasarela.

Los eventos 321 y 281 ya se corrigieron a mano asignándoles un salón, así que hoy cobran. Eso tapa el síntoma, no la causa: **cualquier evento nuevo creado sin salón volverá a fallar** mientras la consulta no cambie.

## Nota

Es una sola ocurrencia en todo el backend (`grep` sobre `src`), así que el cambio queda contenido a esa función.
