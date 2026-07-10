# Spec para la app móvil: eventos privados (NO_PUBLICAR)

Se agregó la columna `EVENTOS.NO_PUBLICAR CHAR(1) DEFAULT 'N'` ('S' = reserva
privada del panel que ocupa el espacio pero NO debe mostrarse en la app).

**Cambio requerido en las consultas de eventos de la app:**
```sql
WHERE NVL(E.NO_PUBLICAR, 'N') = 'N'
```
Sin este filtro, las reservas privadas aparecerían publicadas. Nada más cambia.
