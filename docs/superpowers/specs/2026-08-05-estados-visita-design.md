# Estados de la visita: recorrido operativo de 4 etapas + 7 estados clínicos — Design

- **Fecha:** 2026-08-05
- **Estado:** aprobado (brainstorming), pendiente de plan de implementación
- **Módulo:** Track
- **Migraciones nuevas:** `0066` (enum), `0067` (marca de no-show), `0068` (vistas) — aplicar a mano en prod, **en ese orden**
- **Depende de:** 0023 (marcas operativas + RPCs `mark_*`), 0030 (desenlace en `ready_at`),
  0063 / 0064 (checklist + procedimientos con reporte, que definen `realizada` vs `completa`)

## Por qué

Los nombres del recorrido operativo no coinciden con cómo se habla en el centro, y el eje clínico
tiene un hueco: **mientras el paciente está siendo atendido no hay estado que lo diga**, y **cuando
un paciente falta no queda registro** — hoy "No vino" es un botón que abre directo el modal de
reprogramar y solo mueve `estimated_date` ([`visits.ts:190`](../../../src/data/visits.ts)), así que
la falta se pierde y la visita vuelve a "pendiente" como si nada.

El modelo de **dos ejes en paralelo** no cambia: es el que ya tiene la app y es el que el Director
describió. Lo que cambia son los cortes y los nombres de cada eje, más dos estados clínicos nuevos.

## Modelo mental

- **Eje operativo** (`operational_stage`): dónde está el paciente **durante** la visita. Lineal,
  derivado de marcas de tiempo. Es el que manda en la lista de Visitas del día.
- **Eje clínico** (`computed_status`): en qué está la **visita** como registro. Es el que manda en
  la ficha del paciente, el cronograma, el resumen y las alertas.

Los dos se calculan en `v_patient_visits` y bajan resueltos al cliente. Se quedan ahí: la campana y
la vista Alertas filtran **server-side** por `computed_status`
([`visits.ts:83`](../../../src/data/visits.ts)); mover el cálculo al cliente rompería ese filtro y
duplicaría la regla en dos lugares.

## 1 · Eje operativo — 4 etapas

| Etapa | Valor | Marca | Quién la pone |
|---|---|---|---|
| Por llegar | `por_llegar` | (ninguna) | — |
| En el sitio | `en_el_sitio` | `arrived_at` | recepción (`mark_arrived`) |
| Inicio de atención | `inicio_atencion` | `real_date` | clínico (`registerVisit`) |
| Fin de atención | `fin_atencion` | `ready_at` + desenlace | clínico (`mark_ready` / `mark_ready_with_outcome`) |

"Fin de atención" es **terminal**: recepción ya no cierra la visita, la cierra el clínico al
terminar.

### 1.1 · Qué pasa con "Fuera del sitio" (`left_at`)

Sale del recorrido. `mark_left` siempre exigió `ready_at`
([0023:145](../../../supabase/migrations/0023_track_visita_dia.sql)), así que **no existe ninguna
fila con `left_at` y sin `ready_at`**: todas las visitas viejas con salida marcada caen limpias en
"Fin de atención". La columna y el RPC quedan intactos (histórico auditable); lo que se retira es
el botón y el paso del stepper.

### 1.2 · `real_date` no se mueve

`real_date` marca el **inicio de la atención**, no el fin. Es lo que dispara
`materialize_checklist` ([0063:79](../../../supabase/migrations/0063_checklist_reportes.sql)) y lo
que ancla los `deadline_hours` de cada ítem: si se moviera al final, el checklist no existiría
mientras se atiende al paciente.

### 1.3 · Derivación

```sql
( case
    when pv.ready_at   is not null then 'fin_atencion'
    when pv.real_date  is not null then 'inicio_atencion'
    when pv.arrived_at is not null then 'en_el_sitio'
    else 'por_llegar'
  end ) as operational_stage
```

## 2 · Eje clínico — 7 estados

Se evalúan **en este orden**; el primero que da verdadero manda.

| # | Estado | Valor | Cuándo |
|---|---|---|---|
| 1 | Siendo atendido | `en_atencion` **(nuevo)** | el paciente llegó **hoy** y no se marcó el fin de atención |
| 2 | Ventana vencida | `ventana_vencida` | sin visita y `current_date > window_end` |
| 3 | Por reprogramar | `por_reprogramar` **(nuevo)** | sin visita, con `no_show_at` y sin fecha nueva |
| 4 | Pendiente | `proxima` | sin visita, ventana vigente |
| 5 | Ítem vencido | `item_vencido` | ya realizada, con ítem obligatorio o reporte fuera de plazo |
| 6 | Visita realizada | `realizada` | la atención terminó, quedan pendientes de checklist / procedimientos / reportes |
| 7 | Completa | `completa` | todo tildado y los reportes guardados |

Decisiones que quedan fijadas en ese orden:

- **"Ventana vencida" le gana a "Por reprogramar"** (rama 2 antes que la 3). Es la más severa, es la
  que le importa al sponsor y ya alimenta la campana; el "no vino" se sigue leyendo en el detalle.
- **"Siendo atendido" le gana a todo** (rama 1). Si el paciente está en el centro, eso es lo que hay
  que ver, aunque la ventana esté vencida.

### 2.1 · "Pendiente" fusiona dos estados

Hoy el cronograma distingue `futura` (a más de 7 días) de `proxima`. Con el modelo nuevo **las dos
son "Pendiente"**: la vista emite siempre `proxima` y `futura` deja de emitirse. El valor sigue en
el enum porque Postgres no permite borrar valores; la anticipación se sigue leyendo por la fecha,
que está al lado del chip.

### 2.2 · "Siendo atendido" solo vale para el día en curso

La rama 1 exige que `arrived_at` sea **de hoy** (anclado a `America/Argentina/Buenos_Aires`, igual
que el resto de las ventanas de día). Si alguien marca la llegada y nadie marca el fin, al día
siguiente la visita **no queda congelada**: se resuelve sola por lo que tenga marcado — "Visita
realizada" si se llegó a iniciar la atención (`real_date`), "Ventana vencida" o "Pendiente" si
nunca se registró.

Corolario: `realizada` **no exige literalmente `ready_at`**. Exige tener `real_date` y no estar
siendo atendida en este momento. Es lo que hace que las visitas históricas (cargadas con `real_date`
y sin marcas operativas) sigan calculando exactamente como hoy.

### 2.3 · Derivación

```sql
( case
    -- 1 · El paciente está en el centro HOY y no se cerró la atención.
    when pv.ready_at is null and pv.arrived_at is not null
     and (pv.arrived_at at time zone 'America/Argentina/Buenos_Aires')::date
       = (now()          at time zone 'America/Argentina/Buenos_Aires')::date
      then 'en_atencion'
    when pv.real_date is null and current_date > pv.window_end then 'ventana_vencida'
    when pv.real_date is null and pv.no_show_at is not null    then 'por_reprogramar'
    when pv.real_date is null                                  then 'proxima'
    -- las dos ramas que siguen se copian TAL CUAL de la 0064 (líneas 128-159):
    --   exists(ítem obligatorio o reporte fuera de plazo)  then 'item_vencido'
    --   exists(falta algún ítem, procedimiento o reporte)  then 'realizada'
    else 'completa'
  end )::visit_status as computed_status
```

Las dos ramas de `item_vencido` / `realizada` se copian **tal cual** de la 0064: este diseño no
toca la definición de "qué falta", solo cuándo se empieza a evaluar.

## 3 · Base de datos

### 3.1 · `0066_visit_status_nuevos_estados.sql`

**Sola, sin nada más en el archivo.** Postgres no permite usar un valor de enum recién creado en la
misma transacción — es la trampa que ya hizo fallar la 0053.

```sql
alter type public.visit_status add value if not exists 'en_atencion';
alter type public.visit_status add value if not exists 'por_reprogramar';
```

### 3.2 · `0067_visita_no_show.sql`

```sql
alter table public.patient_visits
  add column if not exists no_show_at timestamptz,
  add column if not exists no_show_by uuid references public.users(id) on delete set null;
```

Aditiva y nullable: las filas viejas quedan en `null` = nunca se marcó falta.

RPC **`mark_no_show(p_visit_id uuid, p_value boolean)`**, `SECURITY DEFINER`, con la autorización
calcada de `mark_arrived` (`gerencia` o `track operator+`,
[0023:116](../../../supabase/migrations/0023_track_visita_dia.sql)):

- `p_value = true` → `no_show_at = coalesce(no_show_at, now())`, `no_show_by = auth.uid()`.
- `p_value = false` → ambas a `null` (deshacer una marca equivocada).
- Rechaza con `check_violation` si la visita ya tiene `real_date`: una visita atendida no puede
  marcarse como ausente.

`no_show_by` es FK a `users` y **no se muestra en la UI** (la RLS de `users` oculta filas ajenas y
las vistas son `security_invoker`; si en algún momento hay que mostrar el nombre, va desnormalizado
como `coordinator_name` en la 0065). Queda para auditoría.

**`rescheduleVisit` limpia la marca:** al asignar fecha nueva, el mismo `update` que mueve
`estimated_date` pone `no_show_at` y `no_show_by` en `null`. Es la única salida de "Por
reprogramar". No hace falta RPC: la policy de UPDATE de `patient_visits` ya cubre esas columnas.

**Marcar la llegada limpia la marca:** si el paciente aparece después de haber sido dado por
ausente, `mark_arrived` pone `no_show_at` en `null` (si no, la visita quedaría marcada como falta
y atendida a la vez).

### 3.3 · `0068_estados_visita.sql`

Recrea `v_patient_visits` y `v_track_visits` con los dos ejes de §1.3 y §2.3, siguiendo el patrón
del `*` congelado de la 0064: `drop view v_track_visits` → `drop view v_patient_visits` → crear las
dos, con `security_invoker = true`, los `revoke`/`grant` de siempre y **`no_show_at` expuesta en
`v_track_visits`** (la necesita la fila del día para el chip). Recordar calificar todos los nombres
de columna (la trampa de las 0056 / 0058).

### 3.4 · Datos existentes: no se toca ninguno

- Las visitas históricas no tienen `arrived_at` → nunca caen en "Siendo atendido".
- Ninguna fila tiene `no_show_at` → nunca caen en "Por reprogramar".
- Las que tienen `left_at` tienen `ready_at` → caen en "Fin de atención".

Sin backfill, sin `update` sobre datos reales, y el estado clínico de todo lo ya cargado queda
idéntico al de hoy.

## 4 · Aplicación

### 4.1 · Tipos y etiquetas

- [`src/data/dayVisits.ts`](../../../src/data/dayVisits.ts): `OperationalStage` pasa a
  `'por_llegar' | 'en_el_sitio' | 'inicio_atencion' | 'fin_atencion'`; `OPERATIONAL_STAGE_ORDER`
  queda en 4; `DayVisitRow` suma `no_show_at`; se agrega `markNoShow()` y se retira `markLeft()`
  de la UI.
- [`src/data/visits.ts`](../../../src/data/visits.ts): `VisitStatus` suma `'en_atencion'` y
  `'por_reprogramar'`; `rescheduleVisit` limpia la marca de falta.
- [`src/views/visitStates.tsx`](../../../src/views/visitStates.tsx): `OPERATIONAL_STAGES` y
  `VISIT_STATES` con las etiquetas nuevas + dos colores nuevos de la paleta Sereno. Es el único
  lugar donde viven nombres y colores, así que el resto de las vistas hereda sin tocarse.

### 4.2 · Recorrido y acciones

- [`advanceStep.ts`](../../../src/views/track/advanceStep.ts): `NEXT_STEP` queda en 3 saltos
  ("Marcar en sitio" → "Iniciar atención" → "Finalizar atención"); `advanceRole` pasa a
  **recepción** solo en el primero y **clínico** en los otros dos.
- [`VisitStepper.tsx`](../../../src/views/track/VisitStepper.tsx): 4 puntos en vez de 5. Sin
  cambios de lógica (lee `STAGE_ORDER`).
- El desenlace clínico (IVRS de screening / randomización, `mark_ready_with_outcome`) pasa a colgar
  de **"Finalizar atención"**, que es la misma marca `ready_at` de antes: no cambia nada del flujo,
  solo el rótulo del botón que lo abre.
- [`DayVisitRowItem.tsx`](../../../src/views/track/DayVisitRowItem.tsx): el "No vino" del menú ⋯
  **guarda la marca** (`markNoShow`) en vez de abrir el modal de reprogramar. Reprogramar sigue
  disponible como acción aparte, en la fila y en la ficha.

### 4.3 · Visitas del día

- [`DayVisitsView.tsx`](../../../src/views/DayVisitsView.tsx): `inCenter` = `en_el_sitio` +
  `inicio_atencion`; el contador de "finalizadas" pasa a contar `fin_atencion`; los filtros por
  estado y el agrupador toman las 4 etapas nuevas.
- **Una visita marcada "No vino" muestra el chip clínico "Por reprogramar"** en lugar del operativo:
  operativamente sigue en "Por llegar", y dejar ese chip diría que el paciente está por llegar
  cuando ya se sabe que no viene.

### 4.4 · Alertas

No cambian: `useVisitAlerts` sigue filtrando `ventana_vencida` + `item_vencido`. **"Por reprogramar"
no entra en la campana** en esta tajada — es un estado de trabajo visible en la lista y en la ficha,
no una alerta. Si después se quiere que alerte, es agregar el valor a ese `.in(...)`.

## 5 · Nombres a confirmar antes de implementar

Ninguno cambia el diseño; son rótulos en `visitStates.tsx`.

- **"En el sitio"** vs. "Concurrió al centro" (así lo nombró el Director en el primer mensaje).
- **"Ítem vencido"**: ahora también cubre reportes de procedimientos, podría ser "Pendiente vencido".

## 6 · Fuera de alcance

- Tocar la definición de qué hace que una visita esté `realizada` o `completa` (es de la 0064).
- Registrar el motivo de la falta (por qué no vino). La marca es booleana; si hace falta un motivo,
  es una tajada aparte con el patrón de `doctor_motivo` (0047).
- Que "Por reprogramar" dispare alerta en la campana (§4.4).
- Borrar `left_at` / `mark_left` de la base: quedan como histórico.

## 7 · Verificación

No hay tests: el gate es `npm run typecheck` verde + `npm run build` verde + QA logueado en el
preview. Lo que hay que ver con los ojos, en este orden:

1. Una visita del día recorre las 4 etapas y el stepper dibuja 4 puntos.
2. Al marcar la llegada, el chip clínico pasa a "Siendo atendido" en la ficha del paciente.
3. Al marcar "Finalizar atención", pasa a "Visita realizada"; al cerrar checklist + reportes, a
   "Completa".
4. "No vino" deja la visita en "Por reprogramar"; reprogramarla la devuelve a "Pendiente".
5. Una visita histórica (con `real_date` y sin marcas) muestra el mismo estado que antes de la
   migración.
