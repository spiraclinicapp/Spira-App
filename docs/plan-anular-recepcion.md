# Plan · Recepción — anular una recepción

**Origen:** entrada de [`TODOS.md`](../TODOS.md) *"Pharma · anular una recepción cargada mal"*, abierta por
el `/impeccable critique` del reskin "2c" (2026-08-17), donde la heurística de **control y libertad
del usuario** bajó a 2/4. Se descubrió de la peor manera: creé una recepción de prueba para poder
mirar la card pendiente y **no pude borrarla desde la app** — hubo que escribirle
[`_borrar_test_reskin_2c.sql`](../supabase/_borrar_test_reskin_2c.sql) al Director para que lo corriera a mano.

**Decidido con el Director** (2026-08-17): las cinco decisiones de dominio de abajo.

---

## El problema

Hoy la pantalla de Recepción **no tiene ninguna salida**. Ni anular, ni editar, ni borrar: no hay
función en el front ni RPC en la base. Un lote tipeado mal o una cantidad equivocada quedan para
siempre, y la única corrección posible es un ajuste manual de stock — que es otra pantalla, otro
motivo escrito, y deja los dos registros conviviendo sin que nada los vincule.

En una app auditable **no borrar es correcto; no poder anular no lo es**. Una anulación es un hecho
registrable, como cualquier otro.

---

## Qué ya existe (no se reconstruye)

| Pieza | Estado |
|---|---|
| `medication_receptions` con `status` (`pendiente`/`verificada`) y auditoría por `audit_row()` | ✅ `0002`, `0003:371` |
| `verify_reception` — `security definer`, `pharma leader+`, rechaza la segunda pasada | ✅ `0032:272`, reescrita en `0085:102` |
| Ingreso de stock por trigger `apply_reception_stock` (upsert de lote + movimiento `+`) | ✅ `0003:97`, extendido en `0035`/`0037`/`0040` |
| `stock_movements` con `reason`, `reference_id` y `reference_type` (ya admite `'reception'`) | ✅ `0002:328` |
| Confirmación modal antes de verificar, con el número delante | ✅ `recepcion/ConfirmarVerificacion.tsx` |
| Motivo por desplegable + nota opcional | ✅ patrón de `AdjustStockModal.tsx` |
| Error por recepción mostrado en la banda de **su** card | ✅ `RecepcionView.tsx` (`errorPorId`) |

**El net-new es la salida**: un estado, una RPC y un modal. Nada del reskin se rehace.

---

## Decisiones cerradas (no re-discutir)

| # | Decisión |
|---|---|
| **D1** | **Alcance: pendiente siempre, verificada sólo si el ingreso sigue intacto.** Anular una pendiente es gratis (nunca entró a stock). Anular una verificada revierte el stock **sólo si las unidades que ingresó siguen enteras**; si de ese lote ya se dispensó algo, la app bloquea y explica. No se admite anular dejando el stock en descubierto: una anulación no puede contradecir una dispensación ya entregada a un paciente. |
| **D2** | **Permiso: `pharma leader+`**, el mismo que verifica y el mismo que ya puede mover cualquier lote con `adjust_stock`. Poner la anulación más arriba sería incoherente: la farmacéutica ya puede corregir ese stock por la puerta de al lado, sólo que sin dejarlo vinculado a la recepción. **El control es el registro (quién, cuándo, por qué), no el rango.** |
| **D3** | **La anulada queda VISIBLE en su día**, con banda gris neutra, rótulo *Anulada*, motivo y quién/cuándo. Es el remito anulado que sigue en el talonario: si alguien busca el folio 11 lo encuentra y entiende qué pasó, en vez de toparse con un hueco en la numeración. El filtro de estado pasa de un toggle a dos, excluyentes (ninguno tildado = todas). |
| **D4** | **El compensatorio se llama por su nombre en el libro: `anulacion_recepcion`.** No un `ajuste_manual` disfrazado. Cuesta una migración aparte (un `alter type ... add value` no puede usarse en la misma transacción — trampa de la `0053`), y el riesgo es bajo: **el front no lee `stock_movements` en ninguna pantalla** (verificado por grep) y las vistas de reportes de la `0083` filtran por igualdad a `'dispensacion'`, así que un valor nuevo no las toca. |
| **D5** | **La banda de la anulada va en gris neutro, no en rojo.** El rojo de esta card está tomado por *"No se pudo verificar"*, que sí es una falla. Una anulación es una decisión deliberada de la farmacéutica, y pintarla de error la acusa de algo que no pasó. |

---

## Las tres ramas de la anulación

Una sola RPC, tres caminos según lo que la recepción ya hizo:

### 1 · Pendiente → sella y termina

Nunca tocó stock. Cambia el estado y guarda motivo/quién/cuándo. No hay nada que revertir.

### 2 · Verificada, medicación base (protocolo / ambulatoria) → revierte

**Dos pasadas sobre los renglones, a propósito:**

1. **Validación completa**, sin mover nada: por cada `reception_items` se busca su lote por
   `(medication_id, protocol_id, lot_number)` — `reception_items` no guarda `lot_id`, y ésa es la
   clave del upsert que hace el trigger de ingreso. **El protocolo no es opcional en esa búsqueda**:
   la 0032 dropeó el unique de dos columnas al volverse global el catálogo, así que el mismo
   medicamento con el mismo lote de fábrica puede tener una fila por protocolo, y buscar sin él
   podía restarle stock al equivocado en silencio (lo encontró el review de la Task 1; el spec
   citaba `0002:241`, que quedó viejo). Se compara con `is not distinct from`, no con `=`: en
   ambulatoria el protocolo es `NULL` y `= NULL` no matchea nunca. Si en alguno
   `quantity_on_hand < quantity`, **aborta antes del primer `update`**, con el detalle: medicamento,
   lote, cuánto queda y cuánto haría falta.
2. **Aplicación**: resta el lote e inserta el movimiento compensatorio.

La segunda pasada existe **para el mensaje, no para la corrección**: un `raise` dentro de un único
loop revierte igual toda la transacción, pero abortaría en el primer renglón que falle y el usuario
vería un problema por vez. Validar todo primero hace el error determinista y completo.

**El lote no se borra aunque quede en cero.** El libro tiene los dos asientos y la fila del lote es
su percha; borrarla produciría exactamente el descuadre que el script de limpieza del reskin evitó
a mano — un movimiento apuntando a algo que ya no existe.

### 3 · Verificada, Producto de Investigación → sólo cambia de estado

**El IP no tiene libro.** `create_ip_reception` (`0038:59`) nace **ya verificada** y el stock de IP
es *derivado*: [`v_ip_stock`](../supabase/migrations/0071_dispensacion_ip.sql) calcula
`recibido − entregado` sumando las recepciones verificadas del protocolo y restando los `ip_kits`
de las dispensaciones entregadas. No hay `medication_lots` ni `stock_movements` de por medio.

Consecuencia: **anular una recepción IP es sacarla del conjunto que la vista suma**, y el stock se
recalcula solo. Lo que sí hay que validar antes es que los kits disponibles del protocolo alcancen
para descontar los de esta recepción; si no, el mismo bloqueo que en la rama base. El cálculo se
replica dentro de la RPC en vez de leer la vista: `v_ip_stock` es `security_invoker` y agrega **por
protocolo**, no por recepción.

**No se escribe movimiento compensatorio para IP**, porque no hay tabla dónde escribirlo. Esto es
una asimetría real del modelo y va comentada en la migración para que nadie la lea como un olvido.

---

## Migraciones

### `0086_reception_anulada_enum.sql` — sólo los dos valores nuevos

```sql
alter type public.reception_status    add value if not exists 'anulada';
alter type public.stock_movement_type add value if not exists 'anulacion_recepcion';
```

Archivo propio y aplicado **antes**: un valor de enum recién creado **no se puede usar en la misma
transacción**, y la `0087` lo usa en un `check` y en un `insert`. Ya nos mordió en la `0053`.

`reception_status` tiene además un `'con_observaciones'` que nadie usa desde la `0001`. **No se
recicla**: "con observaciones" no es "anulada", y darle un segundo significado a un valor muerto es
la clase de atajo que se cobra un año después.

### `0087_anular_recepcion.sql` — columnas, constraint y RPC

**Columnas** (aditivas, `if not exists`):

| Columna | Por qué |
|---|---|
| `voided_at timestamptz` | cuándo |
| `voided_by uuid references users(id)` | quién, auditable |
| `voided_by_name text` | quién, **mostrable**. Mismo muro que la `0085`: la RLS de `users` es `id = auth.uid() or has_module('gerencia')`, así que un join dejaría a la farmacéutica viendo su nombre y `null` en el resto. Lo escribe la RPC, que es `security definer`. Quinta vez de este patrón. |
| `void_reason text` | por qué, obligatorio |

⚠️ `voided_by` es una **tercera FK de `medication_receptions` a `users`** (ya están `received_by` y
`verified_by`). Verificado que es seguro: **nadie embebe `users` desde `medication_receptions`** en
ningún `select` del front — de hecho la `0085` desnormalizó el nombre justamente para no hacerlo.
Sin embed, no hay ambigüedad que romper (`PGRST201`, trampa de la `0076`).

**Guard** — agregado durante la implementación, a partir del review de la Task 1: la policy
`"pharma administra recepciones"` es `for all` y pide apenas `operator+` (`0006:247`, aflojada en
`0009:153`), así que un PATCH directo a PostgREST podía marcar `status = 'anulada'` **salteando la
RPC entera** — sin el permiso `leader+`, sin revertir el stock y sin asiento en el libro. Lo cierra
`trg_guard_reception_void`, un `before update` que rechaza esa transición cuando `current_user` no
es el owner de las funciones `security definer`. Mismo patrón que `guard_dispensation_immutable`
(0073), que cerró un agujero idéntico en `ip_kits`.

**Constraint** — una anulada siempre tiene fecha y motivo:

```sql
alter table public.medication_receptions
  add constraint medication_receptions_anulada_chk
  check (status <> 'anulada' or (voided_at is not null and void_reason is not null));
```

Ninguna fila existente la viola (no hay anuladas todavía), así que entra sin `not valid`.

**RPC `void_reception(p_reception_id uuid, p_reason text)`** — `returns void`, `language plpgsql`,
`security definer`, `set search_path = public`:

1. `has_min_role('pharma','leader')` → si no, `42501`.
2. Motivo vacío → `check_violation` (mismo criterio que `adjust_stock`).
3. `select status, tipo, protocol_id, total_kits ... for update` — lock anti-carrera con una
   verificación simultánea.
4. Inexistente → `foreign_key_violation`. Ya anulada → `check_violation` con su texto.
5. Rama por estado (las tres de arriba).
6. `update` final: `status = 'anulada'`, `voided_at = now()`, `voided_by = auth.uid()`,
   `voided_by_name` resuelto contra `users`, `void_reason = p_reason`.
7. `grant execute ... to authenticated` + `comment on function`.

**El movimiento compensatorio:**

```sql
insert into public.stock_movements
  (medication_id, lot_id, movement_type, quantity_delta, reference_id, reference_type, reason, created_by)
values
  (r.medication_id, v_lot_id, 'anulacion_recepcion', -r.quantity, p_reception_id, 'reception',
   p_reason, auth.uid());
```

`reference_type = 'reception'` ya está permitido por el check de `0002:335` — **el vínculo con la
recepción, que es lo que hoy falta, no necesita ninguna columna nueva.**

**Los triggers existentes no molestan.** `set_reception_verified` (`0003:232`) y
`apply_reception_stock` (`0003:97`) están los dos condicionados a
`new.status = 'verificada' and old.status is distinct from 'verificada'`; un update a `'anulada'`
no entra en ninguno. Y el camino inverso queda cerrado por `verify_reception`, que sólo acepta
`pendiente`: una anulada no se puede re-verificar, así que **el stock no puede re-ingresarse**.

En plpgsql, **todas las columnas van calificadas** (`r.quantity`, `l.quantity_on_hand`): un nombre
suelto puede resolverse contra una variable en vez de contra la columna. Fue el mismo error dos
veces, en la `0056` y en la `0058`.

---

## Front

### Capa de datos — `src/data/pharma/receptions.ts`

- `ReceptionStatus` suma `'anulada'`.
- `ReceptionRow` suma `voided_at`, `voided_by_name`, `void_reason`; las tres entran en
  `RECEPTION_COLS`.
- `voidReception(receptionId, reason)` → `supabase.rpc('void_reception', ...)`, traduciendo el
  código de Postgres con `pharmaErrorMessage`, igual que `verifyReception`.

### Lo que la app **no** puede prometer

El front no conoce `quantity_on_hand`, así que **no puede saber de antemano si una verificada es
anulable**. El botón se ofrece siempre (leader+, estado ≠ anulada) y el bloqueo llega del servidor
con su explicación, en la banda de esa card — el canal que el reskin ya construyó para el error de
verificación. Traer el stock de cada lote para pintar el botón sería una consulta más pesada para
adivinar algo que igual hay que revalidar server-side, y desactivar un botón sin poder decir por
qué es peor que dejarlo y explicar.

### `recepcion/AnularRecepcion.tsx` — el espejo de `ConfirmarVerificacion`

- Título: *"Anular la recepción Nº 11"*.
- **El número delante**, como en la confirmación de verificar: verificada → *"Van a salir de stock
  2 medicamentos · 15 unidades"*; pendiente → *"Esta recepción nunca entró a stock"*.
- **Motivo por desplegable** (`SearchableSelect`), sin texto libre obligatorio:
  `Cargada por error` · `Duplicada` · `Cargamento rechazado` · `Datos incorrectos (lote o vencimiento)` · `Otro`.
  Nota opcional; el `reason` que viaja es `motivo — nota`, igual que en `AdjustStockModal`. Ese
  armado sale a una función pura exportada (`armarMotivo(motivo, nota)`) en vez de quedar inline
  como en `AdjustStockModal`: es el texto que queda asentado en el libro para siempre, y un
  separador de más o una nota vacía pegada al guión no se ven mal en pantalla — se leen mal seis
  meses después, en la auditoría.
- Acento y botón de confirmación en `--spira-danger`; `Cancelar` en `btnOutline`.
- Aviso sereno de qué implica: para una verificada, que el stock vuelve atrás y queda asentado en
  el libro; para una pendiente, que la recepción queda registrada como anulada y no se puede
  reactivar.

### `recepcion/ReceptionCard.tsx`

- **Banda anulada**: fondo gris neutro (`--spira-surface`), tinta `--spira-ink-soft`, ícono **`x`**
  (el set de `Icon.tsx` no tiene `xCircle` y no vale agregar un glifo por esto; `x` con el rótulo al
  lado se lee sin ambigüedad),
  rótulo `ANULADA`, y de contexto *"Anulada por Fulana · 17 ago 2026 14:22 · Duplicada"* — armado
  por un helper hermano de `ingresadaPor`, con el mismo cuidado de fecha: `formatDayMonthYear` sobre
  el `Date`, **nunca** `slice(0,10)` sobre el ISO en UTC (fecha corrida después de las 21:00 AR).
- **Sin botón de verificar** en la anulada, y sin botón de anular tampoco.
- **Botón "Anular"** en la banda para `canManage` y estado ≠ anulada: `btnOutline` discreto a la
  derecha. En una pendiente convive con el verde de verificar (primaria y secundaria, jerarquía
  clara por peso, no por color); en una verificada es la única acción de la banda. Sin color de
  peligro hasta el modal: la card es una lista, no un formulario de borrado.
- **La tabla de renglones queda visible y a opacidad plena.** Es lo único que explica qué se había
  cargado mal, y atenuarla la volvería ilegible justo cuando alguien la audita.

### `RecepcionView.tsx`

- `soloPendientes: boolean` → `estado: 'todas' | 'pendientes' | 'anuladas'` (D3), manejado por **dos
  chips toggle excluyentes** (`Pendientes` · `Anuladas`), ninguno tildado = todas. No un radiogroup
  de tres: pondría un segundo *"Todas"* pegado al *"Todas"* del eje de ámbito, que ya existe. Dos
  toggles dan los mismos tres estados y reusan el patrón que la toolbar ya tiene en el rango 7/30.
- `confirmandoAnulacion: ReceptionRow | null` + reuso de `busyId`/`errorPorId`/`Toast`
  (*"Recepción Nº 11 anulada"*).
- El error de anulación entra por el mismo `errorPorId` que el de verificación; la banda ya sabe
  mostrarlo.

### `recepcion/derivados.ts` — las dos fallas silenciosas

Este archivo existe justamente porque es lo único del reskin que **falla en silencio**, y la
anulación le agrega dos casos:

1. `totalesDelDia` sumaría las unidades de una anulada al total del día. Un conteo equivocado se lee
   tan prolijo como uno correcto. **Cuenta todas las recepciones** —la anulada sigue a la vista, y
   decir "2 recepciones" con tres cards en pantalla se lee como un bug— pero **no suma sus
   unidades**, y **nombra el descuento**: *"3 recepciones · 15 unidades · 1 anulada"*. Esa última
   parte es lo único que explica por qué las dos cuentas no cierran entre sí.
2. `resumenContenido` diría *"trae 2 medicamentos · 15 unidades"* de algo que ya no trae nada: la
   rama del verbo mira `verificada(r)`, y una anulada cae en el `else` de pendiente. Gana su tercera
   voz, **en pasado**: *"traía 2 medicamentos · 15 unidades"*. Sin sufijo *"— anulada"*: el rótulo
   `ANULADA` de la banda está a dos centímetros, y el verbo ya es lo que distingue los tres estados.
3. Se extrae **`contenidoDe(r)`**, el cuerpo del resumen sin verbo. Hoy `ConfirmarVerificacion` se
   lo saca a la frase con `.replace(/^trae /, '')` y el modal de anulación necesita el mismo cuerpo
   para su *"van a salir de stock…"*. Un `replace` sobre una frase generada es un acoplamiento
   invisible: el día que cambie el verbo, deja de encontrarlo y el modal muestra el verbo adentro
   sin que falle nada.

---

## Tests (vitest)

Sobre lo que puede quedar al revés sin verse mal en pantalla:

- `totalesDelDia` con una anulada en el grupo — la cuenta como recepción, no suma sus unidades ni
  sus kits, y la nombra al final. Más el caso "sin anuladas", que tiene que seguir diciendo lo mismo
  que antes al carácter.
- `resumenContenido` en los tres estados, base e IP, y que una anulada **no** diga "ingresadas".
- `contenidoDe`: el cuerpo sin verbo, en base y en IP.
- El armado del `reason`: con nota y sin nota (ni rayas colgando ni espacios de más).
- `coincideBusqueda` sigue encontrando una anulada por folio y por lote (D3: tiene que aparecer).

Lo visual —banda gris, botón, modal— se verifica **mirando** en el preview, no con tests.

---

## NOT in scope

- **Editar una recepción.** Anular y volver a cargar es el camino; editar un documento ya emitido
  es otro problema.
- **Anular con unidades ya dispensadas** (D1). El bloqueo explica y deriva al ajuste manual, que
  sigue siendo la válvula para el descuadre real.
- **Anular una dispensación.** Es la entrada hermana de `TODOS.md` ("volver atrás de un paso") y
  tiene su propia complejidad: comprobante emitido y numeración reservada.
- **Verificación en lote / aflojar la confirmación previa.** Queda destrabado por este trabajo
  (entrada *"Recepción no escala al día de volumen"*), pero es otro PR.

---

## Modos de falla

| Falla | Qué pasa | Cobertura |
|---|---|---|
| Dos usuarios anulan la misma recepción a la vez | El `for update` serializa; el segundo ve *"ya está anulada"* | RPC |
| Anular mientras otro verifica | Mismo lock: uno de los dos gana y el otro recibe el estado que quedó | RPC |
| Verificada cuyo lote ya se dispensó parcialmente | Bloqueo con el detalle (queda N, hacen falta M) | RPC, validación en dos pasadas |
| Lote borrado a mano fuera de la app | `foreign_key_violation` con el lote nombrado | RPC |
| El lote quedaría en cero | Se permite; la fila del lote queda con 0 y el libro con los dos asientos | por diseño |
| Recepción IP con kits ya entregados | Bloqueo por kits disponibles del protocolo | RPC, rama IP |
| Front viejo contra base nueva | Ninguna fila `anulada` puede existir antes del deploy (no hay UI que la cree) | orden de despliegue |

---

## Orden de despliegue

**Migraciones primero (`0086`, después `0087`), front después.** Es puramente aditiva y quien no
funciona sin ella es el código nuevo (regla del `CLAUDE.md`: el orden no se decide por "agrega o
quita" sino por si el cambio altera lo que el front YA pide — y no lo altera).

El `status` del front desplegado no conoce `'anulada'`, pero **nadie puede anular sin la UI nueva**:
la RPC existirá sin botón que la llame. La ventana es teórica.

Al confirmar el Director *"aplicada"*, registrar las dos en el índice de
[`supabase/README.md`](../supabase/README.md) con su fecha — lo vigila `scripts/check-migraciones.mjs`.

---

## Implementation Tasks

1. **`0086`** — los dos `add value`. Archivo solo, nada más adentro.
2. **`0087`** — columnas + constraint + `void_reception` con sus tres ramas + grant + comment.
3. **Índice de migraciones** en `supabase/README.md`.
4. **`receptions.ts`** — tipo, columnas, `voidReception`.
5. **`derivados.ts`** — `contenidoDe` extraído, `totalesDelDia` y `resumenContenido` con la anulada,
   más `armarMotivo` (vive acá, con el resto de las reglas puras de la pantalla, no dentro del
   modal) + sus tests. `ConfirmarVerificacion` deja de usar el `replace`.
6. **`AnularRecepcion.tsx`** — el modal.
7. **`ReceptionCard.tsx`** — banda gris, botón Anular, helper `anuladaPor`.
8. **`RecepcionView.tsx`** — selector de tres estados, wiring del modal, toast.
9. **`npm run build`** verde (typecheck + tests + build) y verificación en el preview.
10. **`TODOS.md`** — borrar la entrada de anulación y actualizar la de volumen, que dependía de ésta.

**Paralelizable:** 1–3 (base) y 4–8 (front) sólo después de acordar los nombres de columna; 5 es
independiente de 6–8.
