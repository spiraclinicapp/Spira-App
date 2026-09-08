# Plan · Reasignar stock entre ámbitos (Farmacia › Stock)

> Pasado por `/plan-eng-review` el **2026-09-07**. Seis decisiones cerradas antes de la primera
> línea de código. Estado: **listo para implementar**, en dos commits.

---

## El pedido

> *"Que en stock, dentro de protocolo por ejemplo o ambulatoria, se pueda mover X cantidad de X
> medicamento a otro protocolo o a ambulatoria. Lo había pensado dentro del panqueque de cada
> medicamento, un renglón más que diga reasignar."*

Hoy el stock entra por recepción y sale por dispensación o por `adjust_stock`. **No hay forma de
moverlo entre ámbitos**: si llegó medicación a un estudio y hay que pasarla a otro (o al ámbito
ambulatorio), el único camino es un ajuste negativo acá y uno positivo allá — dos operaciones sin
relación entre sí, que en el libro de auditoría parecen una pérdida y una ganancia.

---

## Decisiones tomadas (no re-discutir)

1. **El renglón vive en el kebab del MEDICAMENTO** y el modal trae un selector de lote ordenado por
   vencimiento (FEFO). De yapa, el mismo renglón en cada fila de lote con ese lote ya elegido.
2. **En el libro va un tipo propio, `reasignacion`**, con dos asientos (−N en origen, +N en destino)
   emparejados por un `reference_id` compartido. No se reusa `ajuste_manual`: un traslado no es una
   corrección, y sumarlos mentiría.
3. **Un lote vencido SE PUEDE reasignar**, con el aviso a la vista en el modal. Consolidar stock
   vencido antes de darlo de baja es una operación real; bloquearla haría que la base mienta sobre
   dónde está físicamente la medicación.
4. **Entra el arreglo del mensaje de `anular_recepcion`** (0088): hoy atribuye el faltante a
   "dispensaciones o ajustes" y a partir de acá hay una tercera causa.
5. **El destino no ofrece protocolos cerrados.** Mover medicación a un estudio cerrado es un
   hallazgo de auditoría, y hoy nada lo impediría.
6. **El agrupador de la lista se arregla PRIMERO**, en un commit aislado (ver §"Commit 1").

## Lo que NO entra (dicho en voz alta para que no se caiga en silencio)

- **Investigación (IP) queda afuera, y es estructural.** Desde la 0038 el IP se lleva **macro por
  cantidad**, agregado desde las recepciones verificadas en `v_ip_stock`; **no vive en
  `medication_lots`**. No hay lote que mover ni `stock_movements` que escribir. "Reasignar kits de
  IP" es otro modelo y otro pedido.
- **Reportes no aprende a mostrar los movimientos entre ámbitos.** Queda una entrada en `TODOS.md`:
  los reportes cuentan ingresos **por recepción**, así que después de una reasignación el reporte va
  a seguir diciendo que las unidades entraron en el ámbito original. No es un bug — el reporte
  responde *"qué entró"*, no *"dónde está"*.
- Reasignar **varios medicamentos** de una sola vez.
- Una pantalla de **historial de reasignaciones**. El `reference_id` compartido deja la base lista
  para construirla el día que se pida.

---

## Lo que ya existe y se reusa (casi todo)

| Necesidad | Ya existe |
|---|---|
| Grano por lote con vencimiento y EAN | `v_medication_lots_detail` (0041) |
| Escribir stock con motivo + auditoría | `adjust_stock` (0032) — patrón a copiar |
| Mover cantidades con locks y dos pasadas | `anular_recepcion` (0088) — patrón a copiar |
| Asignar el medicamento al protocolo destino | Regla de la **0040**: asignar es *consecuencia*, no un gate |
| Modal con motivo desplegable + nota | `AdjustStockModal.tsx` |
| Lista de protocolos | `useProtocols()`, ya montado en la vista (línea 174) |

No hay clase ni servicio nuevo. El net-new son: un RPC, un módulo de reglas puras, un modal y una
función `async` en la capa de datos.

---

## Arquitectura

### La regla dura: NO se mueve la fila del lote

Lo primero que uno escribiría es `update medication_lots set protocol_id = <destino>`. **Eso
corrompe la trazabilidad**, por tres motivos independientes:

```
  ANTES                                    DESPUÉS de mover la FILA (mal)
  ─────                                    ──────────────────────────────
  lote L-2291 ─ protocolo A ─ 40 u.        lote L-2291 ─ protocolo B ─ 40 u.
      ▲   ▲                                    ▲   ▲
      │   └── stock_movements (recepción)      │   └── el ingreso dice A, el lote dice B
      └────── dispensation_items (paciente     └────── ¡una dispensación del protocolo A
              del protocolo A, histórico)              cuelga de un lote del protocolo B!
```

1. `check_dispensation_item_protocol` (0032) garantiza **al insertar** que
   `lote.protocol_id == protocolo de la dispensación`. Mutar la fila rompe esa invariante para
   **todas las filas históricas**, en silencio, sin que ningún trigger se entere.
2. `anular_recepcion` (0088) busca el lote por `(medication_id, lot_number, protocol_id de la
   recepción)`. Movida la fila, la anulación falla con *"El lote ya no existe"* — un mensaje falso.
3. Un movimiento **parcial** ("mové 10 de 40") es imposible por definición con un `update` de fila.

**La forma correcta es el doble asiento.** La fila origen se queda para siempre, aunque quede en
cero: es la que sostiene el historial.

### El RPC

```
reasignar_stock(lote_origen, protocolo_destino, cantidad, motivo)   [SECURITY DEFINER, leader+]
│
├─ 0. authz: has_min_role('pharma','leader')             → 42501 si no
│     motivo obligatorio (igual que adjust_stock / 0088) → 23514 si vacío
│
├─ 1. VALIDAR (pasada 1, locks en orden de id — evita deadlock, lección de 0088)
│     ├─ el lote existe y su tipo ∈ {protocolo, ambulatoria}   (investigación no tiene lote)
│     ├─ cantidad entera > 0 y ≤ quantity_on_hand
│     ├─ el destino NO es el ámbito actual del lote     (sería un no-op que igual
│     │                                                  escribiría dos asientos)
│     └─ el protocolo destino existe y NO está cerrado
│
├─ 2. APLICAR (atómico, misma secuencia de locks que la pasada 1)
│     ├─ protocol_medications ← upsert   (asignar es CONSECUENCIA, regla de 0040)
│     ├─ UPDATE origen  : quantity_on_hand -= cantidad
│     ├─ UPSERT destino : mismo lot_number + expiry_date
│     │     · si ya existe (medication_id, protocol_id, lot_number) → SUMA
│     │     · si no → INSERT con el tipo coherente con el CHECK de la 0035:
│     │         a protocolo   → protocol_id = X,    tipo = 'protocolo'
│     │         a ambulatoria → protocol_id = NULL, tipo = 'ambulatoria'
│     └─ INSERT stock_movements × 2, con el MISMO reference_id (uuid nuevo):
│           (origen,  'reasignacion', -cantidad, ref, 'reasignacion', motivo)
│           (destino, 'reasignacion', +cantidad, ref, 'reasignacion', motivo)
└─ 3. return void
```

El `reference_id` compartido es lo que hace que los dos asientos sean **un** hecho y no dos ajustes
sueltos. Sin él, reconstruir la transferencia obliga a machear por hora + cantidad + texto del
motivo: frágil.

**Las dos ramas del `tipo` se escriben a mano, explícitas.** Un `case` que lo "calcula" desde el
`protocol_id` es la clase de astucia que sobrevive hasta el día que aparezca un cuarto ámbito.

### Las migraciones son DOS, y el enum va primero

`ALTER TYPE ... ADD VALUE` no puede usarse en el mismo archivo que lo consume. Precedente exacto en
este repo: la **0086** agregó `anulacion_recepcion` y la **0087** lo usó.

- **`0112_stock_movement_reasignacion.sql`** — nada más que
  `alter type public.stock_movement_type add value if not exists 'reasignacion';`
- **`0113_reasignar_stock.sql`** — ensancha el CHECK de `stock_movements.reference_type` (agregar
  `'reasignacion'`; es una ampliación, ninguna fila vieja la viola), crea el RPC `reasignar_stock`,
  y recrea `anular_recepcion` con el mensaje corregido.

**Orden de despliegue: las migraciones PRIMERO, el front después.** Es puramente aditivo —
verificado que ningún archivo del front enumera `movement_type` (`actividadDeCuenta.ts:22` solo
traduce el nombre de la tabla). El que no funciona sin la migración es el front nuevo, no el
desplegado.

### El mensaje de `anular_recepcion` (0088)

```
ANTES:   "...Puede haber salidas posteriores de ese lote (dispensaciones o ajustes)."
DESPUÉS: "...Puede haber salidas posteriores de ese lote (dispensaciones, ajustes
          o reasignaciones a otro ámbito)."
```

`create or replace` de la misma firma. Si no entra, el día que alguien reasigne y después intente
anular, el mensaje lo manda a buscar una dispensación que no existe.

### Copy: "Reasignar" ya significa otra cosa en Farmacia

`ModalReasignar.tsx` (Dispensaciones) es *"Reasignar la preparación"* — pasarle un pedido a otra
farmacéutica. Misma palabra, mismo módulo, dos cosas distintas. Por eso el renglón dice
**"Reasignar stock"** y el modal se titula **"Reasignar stock · &lt;medicamento&gt;"**. Nunca
"Reasignar" pelado.

---

## Commit 1 — El agrupador: un grupo es (medicamento, protocolo)

**Bug preexistente, en producción, que bloquea la feature.**

`useProtocolLots()` se llama **sin argumento** (`MedicamentosView.tsx:181`): trae los lotes de
**todos** los protocolos en una query. Después `construirGrupos` los agrupa **solo por
`medication_id`**, y `ProtocoloGroups` reparte cada grupo por `g.protocolId`, que es
`primero.protocol_id` — el protocolo del **primer lote nomás** (`MedicamentosView.tsx:568`).

```
  Paracetamol 500  ── lote L-11 ── protocolo ONC-014 ── 40 u.
                  └─ lote L-22 ── protocolo CAR-007 ── 25 u.

  agruparPorMedicamento  →  clave = medication_id  →  UN grupo
  grupo.protocolId       =  'ONC-014'  (el del primer lote)

  En pantalla:
    ONC-014 ─ Estudio Vega
      └ Paracetamol 500 · 2 lotes · 65 u.   ← suma stock de DOS estudios
          ├ L-11  40 u.   (ONC-014)  ✓
          └ L-22  25 u.   (CAR-007)  ✗ dibujado bajo el estudio equivocado
    CAR-007 ─ Cardio Fase II
      (Paracetamol no aparece)              ✗ desapareció de su propio estudio
```

Es **alcanzable por diseño**: el catálogo es global desde la 0032 y desde la 0040 recibir un
medicamento lo asigna solo al protocolo, así que dos estudios que usen el mismo producto comercial
comparten `medication_id`. Si hoy está ocurriendo en prod no se pudo comprobar (no hay SQL contra
producción desde la sesión). Los fixtures de `agrupacion.test.ts` clavan `protocol_id: 'p1'` en
todos los lotes: el caso cruzado nunca se testeó.

**Por qué bloquea.** El renglón vive en el kebab del medicamento, y ese kebab tiene que saber de qué
ámbito sale el stock para calcular los destinos. Con grupos que abarcan dos protocolos, el origen es
ambiguo y "Reasignar" quedaría montado sobre el bug.

**El arreglo:**

- `agrupacion.ts` — `agruparPorMedicamento` pasa a agrupar por `(medication_id, protocol_id)`.
- `GrupoVisible` gana una `key` estable (`medicationId` + `protocolId`), y `protocolId` deja de ser
  "el del primer lote" para ser un hecho del grupo.
- `MedicamentosView.tsx` — `GrupoFila key={g.key}`. Hoy `key={g.medicationId}` daría **claves
  duplicadas de React** apenas los grupos se separen.
- `agrupacion.test.ts` — tres casos de regresión (abajo).

Va **aislado, sin una línea de la feature**: se verifica solo con `npm run build` verde + mirar la
lista con un medicamento en dos estudios.

---

## Commit 2 — La reasignación

| Archivo | Qué |
|---|---|
| `supabase/migrations/0112_stock_movement_reasignacion.sql` | el valor del enum, solo |
| `supabase/migrations/0113_reasignar_stock.sql` | CHECK + RPC `reasignar_stock` + `anular_recepcion` recreada |
| `src/views/pharma/stock/reasignacion.ts` | reglas puras: destinos, validación de cantidad, etiqueta |
| `src/views/pharma/stock/reasignacion.test.ts` | los tests de esas reglas |
| `src/data/pharma/stock.ts` | `reassignLotStock()` — `async`, llama al RPC, traduce el error |
| `src/data/pharma/index.ts` | export |
| `src/views/pharma/ReasignarStockModal.tsx` | el modal |
| `src/views/pharma/MedicamentosView.tsx` | el renglón en los kebabs + wiring + refetch |
| `supabase/README.md` | índice de las dos migraciones (CI lo vigila) |
| `TODOS.md` | el hueco de Reportes |

### El modal

```
  Reasignar stock · Paracetamol 500                                   [×]

  Lote      [ L-2291 · vence 31/12/2027 · 40 u.               ▾ ]   ← FEFO
  Cantidad  [ 10 ]  de 40 disponibles
  Destino   [ ONC-014 — Estudio Vega                          ▾ ]
  Motivo    [ Redistribución entre estudios                   ▾ ]
  Nota      [ opcional                                          ]

  ⚠ (solo si el lote está vencido o vence pronto)
    Este lote está vencido. Se puede reasignar, pero no se va a poder
    dispensar en el destino.

                                        [ Cancelar ]  [ Reasignar ]
```

- **El motivo es obligatorio y va por desplegable**, con nota libre opcional — mismo criterio y
  mismos huesos que `AdjustStockModal` (`adjust_stock` y `anular_recepcion` ya lo exigen).
- **El tope de la cantidad se valida en los dos lados**: el front para que el error sea inmediato y
  sereno, el RPC porque el front no es la autoridad. El `23514` del servidor pasa el texto tal cual
  por `pharmaErrorMessage`, que es lo que queremos.
- **DRY, hasta acá y no más.** El modal comparte con `AdjustStockModal` la cabecera del lote, el
  select de motivo, la caja de error y el pie. **No se extrae** un "modal de operación de stock":
  dos casos no son un patrón, y este tiene dos campos que el otro no. Lo único que sí valdría
  extraer es la caja de error (`acc-deep-danger` + fondo `.10` + radius 8 aparece **99 veces** en
  `src/views`) — y eso es una limpieza aparte, no de este PR.

### El refetch

Reasignar cambia **el otro apartado también**. No alcanza con refrescar el apartado actual: hay que
invalidar `useProtocolLots` **y** `useAmbulatoriaLots`, o el usuario que vuelve a "Ambulatoria" no ve
el lote que acaba de mover.

---

## Tests

Criterio del repo (fijado en `estados.test.ts`): se testea **lo que falla en silencio**. El modal se
verifica mirando; las reglas, no.

```
  agrupacion.test.ts  ─ REGRESIONES DEL COMMIT 1
  │
  ├─ mismo medication_id en p1 y p2  →  DOS grupos, uno por protocolo
  ├─ cada grupo suma solo SUS lotes  →  el resumen no cruza estudios
  └─ ambulatoria (protocol_id null)  →  sigue agrupando por medicamento (no regresiona R3)

  reasignacion.test.ts  ─ reglas puras, sin Supabase
  │
  ├─ destinosPara(lote, protocolos)
  │   ├─ lote de protocolo A  → NO incluye A            ← el no-op invisible
  │   ├─ lote de protocolo A  → incluye B, C y Ambulatoria
  │   ├─ lote ambulatorio     → NO incluye Ambulatoria
  │   ├─ lote ambulatorio     → incluye todos los protocolos activos
  │   ├─ excluye protocolos cerrados / finalizados       ← decisión 5
  │   └─ sin otros protocolos → solo Ambulatoria (o lista vacía → estado vacío sereno)
  │
  ├─ validarCantidad(texto, disponible)
  │   ├─ '' / '0' / '-3' / '2.5' / 'abc'  → error, cada uno con SU mensaje
  │   ├─ disponible + 1                   → error nombrando el disponible
  │   ├─ disponible (todo el lote)        → OK        ← el borde que la gente rompe
  │   └─ 1                                → OK
  │
  └─ etiquetaDestino(opcion)
      ├─ protocolo    → 'CÓDIGO — Nombre'  (mismo formato que el filtro del toolbar)
      └─ ambulatoria  → 'Ambulatoria'
```

**Lo que NO se testea acá y se verifica mirando** (preview + `npm run build` verde): el renglón nuevo
en el kebab, que el modal cierre y la lista se recargue, y que el lote aparezca en el ámbito destino
con la cantidad correcta.

**Lo que no se puede testear desde el front y por eso vive en el RPC**: atomicidad, locks ordenados y
el `for update`. Eso se prueba con una corrida contra la base usando un `TEST-*` propio, no con un
vitest.

---

## Performance

Sin hallazgos.

- El destino sale de `useProtocols()`, que **la vista ya monta** (`MedicamentosView.tsx:174`). Cero
  queries nuevas.
- El RPC toca dos filas de `medication_lots` (por PK y por el unique compuesto) e inserta dos.
  Los índices ya existen desde 0032/0035 — incluido el parcial
  `medication_lots_ambulatoria_lot_key` que necesita la rama ambulatoria del upsert.
- Los reportes no se tocan: `v_pharma_report_items` filtra `movement_type = 'dispensacion'` y
  `v_pharma_report_receptions` lee `reception_items`. Un tipo nuevo no contamina ni duplica nada.

---

## Verificación antes de dar nada por hecho

1. `npm run build` verde (typecheck + vitest + build).
2. En el preview: crear un lote `TEST-*`, reasignar una parte, comprobar que **origen y destino**
   quedan con las cantidades correctas y que el lote aparece en el otro apartado.
3. Contra la base: los **dos** `stock_movements` con el mismo `reference_id`.
4. Las dos migraciones, comprobadas contra PostgREST antes de marcarlas aplicadas en
   `supabase/README.md` — llamando al RPC **con sus nombres de parámetro** (con `{}` PostgREST
   devuelve `PGRST202` aunque la función exista, y eso ya produjo un falso negativo con la 0108).

---

## GSTACK REVIEW REPORT

| Runs | Status | Findings |
|---|---|---|
| Step 0 · desafío de alcance | ✅ completo | 6 piezas reusables identificadas; IP excluido por modelo (0038); Reportes fuera de alcance |
| Sección 1 · Arquitectura | ✅ completo | 6 hallazgos (1 🔴, 2 🟠, 3 🟡) |
| Sección 2 · Calidad de código | ✅ completo | 4 hallazgos (1 🟠, 3 🟡) |
| Sección 3 · Tests | ✅ completo | Diagrama de cobertura; 2 archivos de test, 3 + 12 casos |
| Sección 4 · Performance | ✅ completo | Sin hallazgos |
| Hallazgo fuera de alcance | ✅ escalado | Bug preexistente del agrupador (fusiona protocolos) → Commit 1 |

**Hallazgos principales**

1. 🔴 `update medication_lots set protocol_id` corrompe la trazabilidad histórica por tres vías
   independientes (`check_dispensation_item_protocol`, `anular_recepcion`, movimientos parciales).
   → doble asiento.
2. 🔴 El agrupador de Stock puede fusionar dos protocolos en un grupo (bug preexistente en prod,
   sin cobertura de tests). → Commit 1, aislado y primero.
3. 🟠 Dos archivos de migración obligatorios: `ALTER TYPE ADD VALUE` va solo (precedente 0086/0087).
4. 🟠 El grano del pedido (medicamento) y el de la base (lote) no coinciden → selector de lote FEFO
   dentro del modal.
5. 🟡 El mensaje de `anular_recepcion` (0088) se vuelve incompleto el día que esto sale.
6. 🟡 "Reasignar" ya significa "pasar la preparación a otra farmacéutica" en Dispensaciones → el
   copy dice "Reasignar stock", nunca "Reasignar" pelado.

**VERDICT: GO** — dos commits, dos migraciones aditivas (migraciones primero), ~10 archivos de los
cuales 4 son código nuevo. Sin CODEX ni CROSS-MODEL en esta corrida.

NO UNRESOLVED DECISIONS
