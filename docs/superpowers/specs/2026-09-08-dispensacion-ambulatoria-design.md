# Salida ambulatoria — diseño

**Fecha:** 2026-09-08 · **Estado:** aprobado, sin implementar
**Origen:** `TODOS.md` › "Pharma · dispensación ambulatoria", abierta desde el 2026-08-15 y
re-pedida el 2026-09-08.
**Contexto previo:** [`2026-09-08-dispensacion-libre-vnp.md`](../plans/2026-09-08-dispensacion-libre-vnp.md)
— la tanda que salió ese día **no** resuelve este caso, y por qué.

---

## El problema, en las palabras del Director

> *"Viene el director y te dice dale un Seretide a él. Para estos casos se utilizaría la farmacia
> ambulatoria, pero no estaría asociado a ningún paciente activo; puede que sea el hijo del
> director, por ejemplo, que no figura en ningún lado."*

Hoy **el stock ambulatorio entra y no sale nunca.** Desde la `0035` la recepción está tipada
(`protocolo` / `investigacion` / `ambulatoria`) y los lotes ambulatorios existen con
`protocol_id IS NULL`; se los puede recibir, ajustar, reasignar y mirar. Lo único que no se puede
hacer es **entregarlos**, porque toda dispensación de la app cuelga de
`dispensation_requests.visit_id`, que es `not null` contra `patient_visits`.

**Por qué la VNP no lo resuelve.** La tanda del mismo día hizo que Farmacia pueda dispensar fuera
de cronograma registrando una visita no programada. Eso cubre *"el paciente enrolado vino sin
cita"*: sigue habiendo paciente, enrolamiento y protocolo. El caso de arriba **no tiene ninguna de
las tres cosas**, y dar de alta al destinatario como paciente de investigación para poder
entregarle un inhalador sería meter dato falso en una base auditable — el mismo argumento por el
que en agosto se descartó el "protocolo sintético".

## Qué es y qué no es

Es un **acto único**: alguien pide, la farmacéutica entrega, queda registrado. Una fila y su
asiento en el libro.

**No es** una dispensación de protocolo. No tiene los cuatro estados
(`solicitada → preparando → lista → entregada`), ni escaneo de código de barras, ni comprobante
numerado, ni pasa por `dispensation_requests`. Toda esa ceremonia existe porque el producto de
investigación tiene que ser rastreable unidad por unidad ante ANMAT. La medicación ambulatoria es
stock común de farmacia: copiarle la ceremonia haría que no se use, y el stock volvería a salir
sin registrarse — que es peor que hoy.

## Decisiones (tomadas con el Director el 2026-09-08)

| # | Decisión | Alternativas descartadas |
|---|---|---|
| D1 | **Tabla propia `ambulatory_dispensations`**, no aflojar `dispensation_requests` | El FEFO de la `0050:316` filtra `ml.protocol_id = v_protocol_id`, que con NULL nunca matchea (decisión del 2026-08-15, reconfirmada) |
| D2 | **Destinatario: nombre obligatorio + documento opcional**, texto en la fila | Nada (deja al inventario sin respuesta); ficha de persona reutilizable (entidad nueva que nadie pidió) |
| D3 | **Autorizante obligatorio, FK a `users`** por desplegable | Texto libre (no se puede cruzar); no registrarlo (deja sola a la farmacéutica, que es la única que no decidió) |
| D4 | **Acto único, un modal** | Comprobante imprimible (YAGNI); mismo flujo que protocolo (ceremonia sin su razón) |
| D5 | **Vive en el kebab de Farmacia Ambulatoria**, junto a "Reasignar stock" | Dispensaciones (es un tablero de otra cosa, y la salida no tendría dónde aparecer); submódulo nuevo (navegación para un modal) |
| D6 | **Lista de últimas salidas en el mismo apartado** | Sumarlo a Reportes (no es gratis, ver abajo); nada (un registro que no se puede mirar deja de usarse) |
| D7 | **Solo lotes ambulatorios** (`protocol_id IS NULL`) | Cualquier lote sería entregar producto de un sponsor a alguien que no es su paciente. Para mover stock de un estudio a ambulatoria ya está Reasignar (`0113`) |

## Modelo de datos

```
  medication_lots (tipo='ambulatoria', protocol_id IS NULL)
         │
         │  ambulatory_dispensations                    stock_movements
         └──► id                    ← audit_row la      ┌─ movement_type  'dispensacion'
              medication_id ─┐        exige             ├─ reference_type 'ambulatoria'  ← NUEVO
              lot_id ────────┴─ FK compuesta            ├─ reference_id   = la fila de al lado
              quantity         (coherencia lote↔med)    ├─ quantity_delta (negativo)
              recipient_name       NOT NULL             └─ created_by
              recipient_document   nullable                    ▲
              authorized_by  → users  NOT NULL                 │ lo escribe el RPC,
              dispensed_by   → users  default auth.uid()       │ nunca el front
              notes                nullable                    │
              created_at ──────────────────────────────────────┘
```

### `reference_type = 'ambulatoria'`, no `'dispensation'`

Es la trampa que `TODOS.md` ya tenía identificada: reusar `'dispensation'` dejaría `reference_id`
apuntando a **dos tablas distintas** (`dispensations` y `ambulatory_dispensations`), y cualquier
join que resuelva ese id por una de ellas devolvería basura o filas de menos, en silencio.

El CHECK de `stock_movements.reference_type` (`0002:335`) es una lista cerrada. **Ensancharlo tiene
receta**, escrita por la `0113:54-85`: buscar la constraint por `pg_get_constraintdef(...) ilike
'%reference_type%'` en vez de por nombre, dropearla y recrearla con el valor nuevo.

### `movement_type` reusa `'dispensacion'`

No se agrega un valor nuevo al enum. Es honesto —una salida ambulatoria **es** una entrega— y
evita el `ALTER TYPE ... ADD VALUE`, que no puede usar el valor nuevo en la misma transacción y
obliga a un archivo aparte aplicado antes (precedente `0053`, repetido en la `0112`).

La separación queda a cargo de `reference_type`, que es suficiente: el índice parcial de Reportes
es `where reference_type = 'dispensation' and movement_type = 'dispensacion'`, así que las filas
ambulatorias no lo tocan.

> **A verificar al implementar:** barrer el repo por `movement_type = 'dispensacion'` y confirmar
> que ningún consumidor esté usándolo con el significado "de protocolo". Si aparece alguno,
> calificarlo también por `reference_type`.

### La columna `id`

La tabla lleva `id uuid primary key` aunque la PK pudiera ser otra cosa. `audit_row()` (`0003`)
hace `case when tg_op = 'DELETE' then old.id else new.id end`, y Postgres resuelve `old.id`
**al planificar**: sin esa columna, la primera escritura revienta con `42703` señalando el cuerpo
de la función de auditoría y no esta tabla. Pasó con la `0111`.

### Atomicidad

El alta va por un RPC `SECURITY DEFINER` que en una transacción: valida, inserta la fila, descuenta
`medication_lots.quantity_on_hand` y escribe el asiento. El front nunca escribe `stock_movements`
directo. Mismo patrón que `reassign_lot_stock` (`0113`).

## La pantalla

```
  Farmacia › Medicamentos › Farmacia Ambulatoria
       │
       ├─ kebab ⋯ del medicamento ──► "Entregar" ──► modal
       │      (o del lote: el lote viene elegido)         │
       │                                                  │
       │   ┌──────────────────────────────────────────────┴────┐
       │   │  Seretide 25/250 · lote L-4471 · vence 03/2027     │
       │   │  Disponible: 14 u.                                 │
       │   │                                                    │
       │   │  Cantidad          [ 1 ]                           │
       │   │  Quién recibe      [ nombre                     ]  │  ← obligatorio
       │   │  Documento         [ opcional                   ]  │
       │   │  Quién autoriza    [ ▾ desplegable de usuarios  ]  │  ← obligatorio
       │   │  Notas             [ opcional                   ]  │
       │   │                              [Cancelar] [Entregar] │
       │   └────────────────────────────────────────────────────┘
       │
       └─ debajo del stock: últimas salidas
             08 Sep · Seretide 25/250 · 1 u. · a Juan Pérez · autorizó L. Molina
```

- Abierto desde el **grupo del medicamento**, el lote se elige con el mismo selector FEFO que
  estrenó `ReasignarStockModal`. Abierto desde una **fila de lote**, ya viene puesto.
- El desplegable de autorizante usa `SearchableSelect` con la lista de `users`, siguiendo la
  preferencia de valores preestablecidos sobre texto libre.
- El chip del ámbito ya tiene color propio: **Ambulatoria es azul** (`--spira-acc-deep-blue`,
  `#3A6B8C`), definido en `views/pharma/recepcion/ambitos.ts`. No se inventa ninguno.
- El realce de lo pulsable es **elevación**, nunca borde de color.

## Reglas y errores

| Regla | Dónde vive | Qué ve el usuario |
|---|---|---|
| Solo lotes ambulatorios | RPC (`protocol_id IS NULL`) | "Ese lote no es de la farmacia ambulatoria" |
| Stock insuficiente | La validación que ya existe | "Stock insuficiente en lote X (3 disponible, 5 requerido)" |
| Nombre de quien recibe no vacío | CHECK (`btrim(...) <> ''`) + el front | "Poné el nombre de quien retira la medicación." |
| Cantidad > 0 | CHECK | "La cantidad tiene que ser mayor que cero." |
| Authz | `has_min_role('pharma','operator')` | "No tenés permiso para esta acción." |

**La salida es inmutable**: no se edita ni se borra. Un error se corrige con un ajuste de stock,
igual que el resto del libro. Es la misma regla que ya rige para recepciones y dispensaciones.

## Tests

Lo que se testea es lo que puede fallar **en silencio** (criterio de `CLAUDE.md`):

- **El signo del asiento.** `quantity_delta` tiene que ser negativo. Si quedara positivo, una
  entrega SUMARÍA stock y el inventario se iría inflando sin que nada se vea mal en pantalla.
- **El filtro de ámbito** de los lotes ofrecidos: que un lote de protocolo nunca entre en la lista.
  Al revés se ve (lista vacía); así no.
- **El armado de la fila del historial** (fecha, cantidad, nombres), que es presentación pura.

Lo visible —que el modal abra, que el botón se bloquee sin nombre— se verifica mirando.

## Fuera de alcance

| Qué | Por qué |
|---|---|
| Comprobante imprimible | Nadie lo pidió. Si aparece el requisito es una tanda propia, con su formato |
| Ficha de persona ambulatoria reutilizable | Texto libre alcanza para el caso descrito; una entidad nueva es mucho más que esta pantalla, con su alta, búsqueda, edición y RLS |
| Que aparezca en Reportes de Farmacia | Ver abajo — **no es gratis**, y es su propia tanda |
| Editar o anular una salida | El libro es insert-only |
| Historial por persona | Depende de la ficha reutilizable, que está fuera de alcance |

### Corrección a `TODOS.md`

La entrada de dispensación ambulatoria afirma:

> *"Reportes ya lee del libro compartido, así que cuando esto exista aparece en el reporte sin
> tocar nada."*

**Es falso, verificado contra el `.sql`.** La vista de Reportes (`0083`) arranca
`from public.dispensations d` y llega al libro por un join con
`reference_type = 'dispensation'`; hasta el índice de apoyo (`0083:40-42`) es **parcial** sobre ese
valor. Una salida ambulatoria no tiene fila en `dispensations`, así que no aparecería.

Que aparezca exige **reescribir la vista para que salga del libro** en vez de la tabla — código que
alimenta números que se le muestran al sponsor. Es una tanda aparte, y así queda anotado.

Es la quinta vez en este proyecto que un "ya está resuelto / falta una migración" resulta falso por
haberse verificado contra el front y no contra el schema.

## Orden de despliegue

Todo el trabajo de base es **aditivo**: una tabla nueva, un RPC nuevo y un CHECK ensanchado que
sólo agrega un valor permitido. Ningún front desplegado consulta nada de eso.

**La migración va ANTES del deploy del front.** El que no funciona sin ella es el front nuevo.

## Qué queda abierto

**Ninguna decisión de producto.** Las siete están tomadas y no hay preguntas pendientes para el
Director.

Queda **un chequeo de implementación**, no una decisión: barrer el repo por
`movement_type = 'dispensacion'` y confirmar que ningún consumidor lo esté usando con el
significado "de protocolo" (ver la sección del modelo). Si aparece alguno, se lo califica también
por `reference_type`. Es un `grep` antes de escribir la migración, y su resultado no cambia nada de
lo decidido acá.
