# Estados de la visita (4 etapas operativas + 7 estados clínicos) — Implementation Plan

> **Para quien lo ejecute:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para ir tarea por tarea. Los pasos usan checkbox
> (`- [ ]`) para el seguimiento.

**Goal:** Renombrar y recortar el recorrido operativo de la visita a 4 etapas, y sumar al eje
clínico dos estados nuevos — "Siendo atendido" (el paciente está en el centro) y "Por reprogramar"
(marca de ausente que hoy se pierde).

**Architecture:** Los dos ejes se calculan en `v_patient_visits` y bajan resueltos al cliente; se
quedan ahí porque la campana y Alertas filtran server-side por `computed_status`. Tres migraciones
(enum sola → marca de no-show → vistas) y después la UI, que hereda etiquetas y colores de un solo
archivo (`visitStates.tsx`). Ningún dato existente se modifica.

**Tech Stack:** Postgres/Supabase (SQL a mano en el dashboard), React 18 + TypeScript strict, Vite,
CSS con variables (`tokens.css`).

**Spec:** [`docs/superpowers/specs/2026-08-05-estados-visita-design.md`](../specs/2026-08-05-estados-visita-design.md)

---

## Cómo se verifica acá (leer antes de empezar)

**Este repo no tiene suite de tests.** No inventes una: el `CLAUDE.md` del proyecto manda sobre el
flujo TDD por defecto de la skill. El gate de cada tarea es:

```bash
npm run typecheck
```

verde, y al final `npm run build` verde + QA logueado en el preview (puerto **5250**, ver
`.claude/launch.json`). Las credenciales de QA están en `.claude/qa-creds.local.md` — **nunca** las
pidas ni las pegues en el chat.

**Las migraciones no se aplican solas.** No hay acceso SQL a producción: los tres archivos SQL se
escriben, se le pasan al Director para que los corra **en orden** en el dashboard de Supabase, y
recién cuando confirma "aplicada" se registra la fecha en `supabase/README.md`. **La UI de las
Fases B–D no funciona en el navegador hasta que la 0068 esté aplicada** (el typecheck sí pasa).

**Rama:** el trabajo va en `feat/estados-visita`, que ya existe y ya tiene el spec commiteado.
Verificá con `git branch --show-current` antes de cada commit — hay un hook que bloquea `main`.
Stageá **siempre por ruta** (`git add <archivo>`), nunca `git add -A`: el árbol es compartido.

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0066_visit_status_nuevos_estados.sql` | Los dos valores nuevos del enum. Solos, sin nada más. |
| `supabase/migrations/0067_visita_no_show.sql` | `no_show_at`/`no_show_by` + RPC `mark_no_show` + `mark_arrived` limpia la marca. |
| `supabase/migrations/0068_estados_visita.sql` | Recrea `v_patient_visits` / `v_track_visits` con los dos ejes nuevos. |

**Se modifican:**

| Archivo | Qué cambia |
|---|---|
| `src/data/dayVisits.ts` | Tipo `OperationalStage`, orden, `no_show_at` en la fila, `markNoShow()`. |
| `src/data/visits.ts` | Tipo `VisitStatus`, `rescheduleVisit` limpia la marca de ausente. |
| `src/views/visitStates.tsx` | Etiquetas y colores de los dos ejes (único lugar donde viven). |
| `src/views/track/advanceStep.ts` | 3 saltos en vez de 4; quién marca cada uno. |
| `src/views/track/VisitDetail.tsx` | Etapa terminal. |
| `src/views/track/DayVisitRowItem.tsx` | CTA terminal, chip de "Por reprogramar", menú ⋯. |
| `src/views/DayVisitsView.tsx` | Despacho de marcas, contadores, orden, "no vino" y reprogramar. |
| `supabase/README.md` | Índice de migraciones. |

`VisitStepper.tsx` **no se toca**: lee `STAGE_ORDER`, así que pasa de 5 puntos a 4 solo.

---

## Fase A · Base de datos

### Task 1: Migración 0066 — valores nuevos del enum

**Files:**
- Create: `supabase/migrations/0066_visit_status_nuevos_estados.sql`

- [ ] **Step 1: Escribir el archivo, con esto y nada más**

Va solo en su archivo porque Postgres **no permite usar un valor de enum recién creado en la misma
transacción** — es la trampa que hizo fallar la 0053. Si se mezcla con la vista de la 0068, la
migración falla entera.

```sql
-- 0066 · Estados clínicos nuevos: "Siendo atendido" y "Por reprogramar".
--
-- VA SOLO EN ESTE ARCHIVO, A PROPÓSITO. Postgres no deja usar un valor de enum recién agregado
-- en la misma transacción que lo crea, así que la vista que los emite vive en la 0068 y se aplica
-- DESPUÉS de esta. Mismo motivo que la 0053.
--
--   en_atencion      → el paciente está hoy en el centro y no se cerró la atención.
--   por_reprogramar  → alguien marcó "No vino" y la visita todavía no tiene fecha nueva.

alter type public.visit_status add value if not exists 'en_atencion';
alter type public.visit_status add value if not exists 'por_reprogramar';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0066_visit_status_nuevos_estados.sql
git commit -m "feat(db): 0066 — estados en_atencion y por_reprogramar en el enum"
```

---

### Task 2: Migración 0067 — marca de "No vino"

**Files:**
- Create: `supabase/migrations/0067_visita_no_show.sql`

- [ ] **Step 1: Escribir la migración**

`mark_no_show` calca la autorización de `mark_arrived` (`gerencia` o `track operator+`,
[0023:116](../../../supabase/migrations/0023_track_visita_dia.sql)). `mark_arrived` se reemplaza
para que limpie la marca: si el paciente aparece después de haber sido dado por ausente, gana
"Concurrió al centro".

```sql
-- 0067 · Marca de ausente ("No vino") por visita.
--
-- Hoy "No vino" es solo un botón que abre el modal de reprogramar y mueve estimated_date: la falta
-- no queda registrada en ningún lado. Con esta migración pasa a ser una marca persistida, que es
-- lo que alimenta el estado clínico "Por reprogramar" (0068).
--
-- Aditiva: las filas viejas quedan con no_show_at = null (nunca se marcó falta), así que ninguna
-- visita ya cargada cambia de estado. Aplicar DESPUÉS de la 0066.

-- 1 · Columnas
alter table public.patient_visits
  add column if not exists no_show_at timestamptz,
  add column if not exists no_show_by uuid references public.users(id) on delete set null;

comment on column public.patient_visits.no_show_at is
  'Cuándo se marcó que el paciente no vino. null = nunca se marcó. La limpia mark_arrived (si al final concurrió) y el reagendado (al asignar fecha nueva).';
comment on column public.patient_visits.no_show_by is
  'Quién marcó la falta. Solo para auditoría: no se muestra en la UI (la RLS de users oculta filas ajenas y las vistas son security_invoker).';

-- 2 · RPC para marcar / deshacer
create or replace function public.mark_no_show(p_visit_id uuid, p_value boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_exists boolean; v_real date;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','operator')) then
    raise exception 'No tenés permiso' using errcode='42501';
  end if;
  select (true), pv.real_date into v_exists, v_real
    from public.patient_visits pv where pv.id = p_visit_id;
  if v_exists is null then raise exception 'Visita inexistente' using errcode='23503'; end if;
  if p_value and v_real is not null then
    raise exception 'La visita ya fue atendida' using errcode='check_violation';
  end if;
  update public.patient_visits
     set no_show_at = case when p_value then coalesce(no_show_at, now()) else null end,
         no_show_by = case when p_value then auth.uid() else null end
   where id = p_visit_id;
end; $$;
revoke all on function public.mark_no_show(uuid, boolean) from public;
grant execute on function public.mark_no_show(uuid, boolean) to authenticated;
comment on function public.mark_no_show is
  'Marca / deshace "No vino" (no_show_at + no_show_by). Rechaza visitas ya atendidas. Recepción/Admin: gerencia o track operator+. SECURITY DEFINER.';

-- 3 · Marcar la llegada limpia la falta (si el paciente concurrió, gana "Concurrió al centro").
--     Cuerpo idéntico al vigente (0023:116-129) + el reset de las dos columnas nuevas.
create or replace function public.mark_arrived(p_visit_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_exists boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','operator')) then
    raise exception 'No tenés permiso' using errcode='42501';
  end if;
  select exists(select 1 from public.patient_visits where id = p_visit_id) into v_exists;
  if not v_exists then raise exception 'Visita inexistente' using errcode='23503'; end if;
  update public.patient_visits
     set arrived_at = coalesce(arrived_at, now()),
         no_show_at = null,
         no_show_by = null
   where id = p_visit_id;
end; $$;
comment on function public.mark_arrived is
  'Marca "Concurrió al centro" (arrived_at) y limpia la marca de ausente. Recepción/Admin: gerencia o track operator+. SECURITY DEFINER.';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0067_visita_no_show.sql
git commit -m "feat(db): 0067 — marca de no-show por visita + RPC mark_no_show"
```

---

### Task 3: Migración 0068 — las dos vistas

**Files:**
- Create: `supabase/migrations/0068_estados_visita.sql`

- [ ] **Step 1: Armar el esqueleto copiando la 0064**

Abrí [`supabase/migrations/0064_procedimientos_checklist.sql`](../../../supabase/migrations/0064_procedimientos_checklist.sql)
en las líneas **118-200** y copiá **textualmente** el bloque que va desde
`drop view if exists public.v_track_visits;` hasta el final de la definición de `v_track_visits`
(con sus `comment on`, `revoke` y `grant`). Ese bloque es el patrón del `*` congelado y hay que
conservarlo tal cual: lo único que cambia son los dos `case` y una columna nueva en la lista.

Calificá **siempre** los nombres de columna con su alias (`pv.`, `v.`): en PL/pgSQL y en vistas con
subqueries los nombres sin calificar ya rompieron dos migraciones (0056 y 0058, el mismo error dos
veces).

- [ ] **Step 2: Reemplazar el `case` de `computed_status` en `v_patient_visits`**

Las dos ramas de `item_vencido` y `realizada` (los `exists(...)` de la 0064, líneas 128-159) se
copian **sin tocar**: este cambio no redefine "qué falta", solo cuándo se empieza a evaluar.

```sql
  ( case
      -- 1 · El paciente está HOY en el centro y no se cerró la atención. Gana sobre todo lo demás.
      --     Acotado al día en curso a propósito: si nadie marca el fin, al día siguiente la visita
      --     no queda congelada acá, se resuelve por lo que tenga marcado.
      when pv.ready_at is null and pv.arrived_at is not null
       and (pv.arrived_at at time zone 'America/Argentina/Buenos_Aires')::date
         = (now()          at time zone 'America/Argentina/Buenos_Aires')::date
        then 'en_atencion'
      -- 2 · Ventana vencida le gana a "Por reprogramar": es la más severa y la que mira el sponsor.
      when pv.real_date is null and current_date > pv.window_end then 'ventana_vencida'
      -- 3 · Se marcó la falta y todavía no tiene fecha nueva (el reagendado limpia no_show_at).
      when pv.real_date is null and pv.no_show_at is not null    then 'por_reprogramar'
      -- 4 · "Pendiente" fusiona lo que antes eran `futura` (>7 días) y `proxima`. La vista ya no
      --     emite 'futura'; el valor queda en el enum porque Postgres no deja borrarlo.
      when pv.real_date is null                                  then 'proxima'
      when exists ( /* … ramas de item_vencido, COPIADAS TAL CUAL de la 0064 … */ ) then 'item_vencido'
      when exists ( /* … ramas de realizada,     COPIADAS TAL CUAL de la 0064 … */ ) then 'realizada'
      else 'completa'
    end )::visit_status as computed_status,
```

- [ ] **Step 3: Reemplazar el `case` de `operational_stage` en `v_patient_visits`**

```sql
  ( case
      -- `left_at` sale del recorrido: mark_left siempre exigió ready_at (0023:145), así que toda
      -- fila con salida marcada tiene ready_at y cae limpia acá. La columna queda como histórico.
      when pv.ready_at   is not null then 'fin_atencion'
      when pv.real_date  is not null then 'inicio_atencion'
      when pv.arrived_at is not null then 'concurrio_al_centro'
      else 'por_llegar'
    end ) as operational_stage
```

- [ ] **Step 4: Exponer `no_show_at` en `v_track_visits`**

En la lista de columnas de `v_track_visits`, junto a `v.arrived_at, v.ready_at, v.left_at,`
(línea 188 de la 0064), agregar `v.no_show_at,`. La necesita la fila de Visitas del día.

- [ ] **Step 5: Actualizar el `comment on view`**

```sql
comment on view public.v_patient_visits is
  'patient_visits + estado clínico de 7 estados (0068) + recorrido operativo de 4 etapas (0068).';
```

- [ ] **Step 6: Releer el archivo entero buscando placeholders**

Ningún `<...>` ni `/* … */` puede quedar en el SQL final: el Director lo corre **tal cual** y ya se
corrió un placeholder literal una vez. Los dos `exists(...)` de los pasos anteriores tienen que
estar completos, copiados de la 0064.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0068_estados_visita.sql
git commit -m "feat(db): 0068 — vistas con 4 etapas operativas y 7 estados clínicos"
```

---

### Task 4: Registrar las migraciones y entregarlas

**Files:**
- Modify: `supabase/README.md` (tabla índice de migraciones, después de la fila `0065`)

- [ ] **Step 1: Agregar las tres filas al índice**

Seguí el formato de las filas existentes (una línea por migración, con el resumen de qué hace).
**Sin** la marca "Aplicada en prod": eso se agrega recién cuando el Director confirme.

- [ ] **Step 2: Verificar que el chequeo de CI pasa**

```bash
node scripts/check-migraciones.mjs
```

Esperado: sin errores (detecta migraciones sin entrada en el índice).

- [ ] **Step 3: Commit**

```bash
git add supabase/README.md
git commit -m "docs(db): índice de migraciones 0066-0068"
```

- [ ] **Step 4: Entregar al Director**

Pedirle que corra **en orden 0066 → 0067 → 0068** en el dashboard de Supabase, avisando que la
0066 y la 0068 tienen que ir en ejecuciones separadas (el enum y su uso no pueden compartir
transacción). Cuando confirme, agregar **"Aplicada en prod (fecha)"** a las tres filas del índice y
commitear.

---

## Fase B · Capa de datos y etiquetas

Esta fase compila y pasa el typecheck aunque las migraciones todavía no estén aplicadas.

### Task 5: Tipos y mutaciones del recorrido

**Files:**
- Modify: `src/data/dayVisits.ts:8-17` (tipo y orden), `:24-57` (fila), `:262-266` y `:322-327` (mutaciones)

- [ ] **Step 1: Reemplazar el tipo y el orden de etapas**

```ts
/** Etapa del recorrido del paciente en el centro (derivada de las marcas, NO clínica). */
export type OperationalStage = 'por_llegar' | 'concurrio_al_centro' | 'inicio_atencion' | 'fin_atencion'

/** Orden lineal de las etapas operativas (para el stepper y para avanzar a la siguiente). */
export const OPERATIONAL_STAGE_ORDER: OperationalStage[] = [
  'por_llegar',
  'concurrio_al_centro',
  'inicio_atencion',
  'fin_atencion',
]
```

- [ ] **Step 2: Sumar `no_show_at` a `DayVisitRow`**

Después de `coordinator_name` (línea 56), dentro de la interfaz:

```ts
  /**
   * Cuándo se marcó que el paciente no vino (migración 0067); null = nunca se marcó. La limpian
   * `mark_arrived` (si al final concurrió) y el reagendado. Es lo que sostiene el estado clínico
   * `por_reprogramar`.
   */
  no_show_at: string | null
```

- [ ] **Step 3: Agregar `markNoShow` junto a las demás mutaciones de etapa**

Ponela después de `markLeft` (línea 327):

```ts
/**
 * Marca (true) o deshace (false) "No vino" — `no_show_at` + `no_show_by`, RPC `mark_no_show`
 * (SECURITY DEFINER, migración 0067). Recepción/Admin o gerencia, igual que `mark_arrived`.
 * El server rechaza marcar como ausente una visita ya atendida (`real_date` puesta).
 */
export async function markNoShow(visitId: string, value = true): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_no_show', { p_visit_id: visitId, p_value: value })
  if (error) {
    if (error.code === '23514') return { error: 'La visita ya fue atendida: no se puede marcar como ausente.' }
    return { error: rpcError(error.code, error.message) }
  }
  return { error: null }
}
```

- [ ] **Step 4: Aclarar en el comentario de `markLeft` que sale del recorrido**

`markLeft` y su RPC **no se borran** (histórico auditable), pero dejan de usarse desde la UI.
Reemplazá su comentario por:

```ts
/**
 * Marca "Fuera del sitio" (left_at = now()). Requiere ready_at (handoff). Recepción/Admin o gerencia.
 * FUERA DEL RECORRIDO desde la 0068: la visita la cierra el clínico en "Fin de atención". Se
 * conserva —con su RPC y su columna— como histórico auditable, pero ninguna vista la llama.
 */
```

Y actualizá el comentario de `markArrived` para que diga "Concurrió al centro" en vez de "En el
sitio", y que limpia la marca de ausente.

- [ ] **Step 5: Verificar**

```bash
npm run typecheck
```

Esperado: **falla**, con errores en `visitStates.tsx`, `advanceStep.ts`, `DayVisitsView.tsx`,
`DayVisitRowItem.tsx` y `VisitDetail.tsx` por los literales viejos (`'en_el_sitio'`, `'atendido'`,
`'listo'`, `'fuera'`). Es lo esperado: el compilador está listando exactamente los sitios que faltan
migrar en las tareas 6 a 12. **No commitees todavía**: esta tarea se commitea junto con la 6 y la 7.

---

### Task 6: Estados clínicos en la capa de datos

**Files:**
- Modify: `src/data/visits.ts:7` (tipo), `:183-199` (reagendado)

- [ ] **Step 1: Sumar los dos estados al tipo**

```ts
export type VisitStatus =
  | 'futura' | 'proxima' | 'en_atencion' | 'realizada' | 'completa'
  | 'item_vencido' | 'ventana_vencida' | 'por_reprogramar'
```

- [ ] **Step 2: Que el reagendado limpie la marca de ausente**

Es la única salida de "Por reprogramar". No hace falta RPC: la policy de UPDATE de `patient_visits`
ya cubre esas columnas.

```ts
/**
 * Reagenda una visita moviendo SOLO `estimated_date` y limpiando la marca de ausente (0067): darle
 * fecha nueva es, justamente, la salida del estado "Por reprogramar". La ventana
 * (window_start/end) viene del esquema del sponsor y queda fija a propósito: el estado calculado
 * (`ventana_vencida`) sigue siendo auditable aunque la visita se mueva.
 * La RLS limita el UPDATE a la coordinadora asignada (operator+) o gerencia; si
 * filtra en silencio (0 filas afectadas), se devuelve un error claro.
 */
export async function rescheduleVisit(id: string, newDate: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('patient_visits')
    .update({ estimated_date: newDate, no_show_at: null, no_show_by: null })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'No tenés permiso para mover esta visita.' }
  return { error: null }
}
```

- [ ] **Step 3: Verificar**

```bash
npm run typecheck
```

Esperado: sigue fallando por los literales viejos en las vistas (se arreglan en la Task 7 en
adelante), pero **sin errores nuevos** en `src/data/`.

---

### Task 7: Etiquetas y colores de los dos ejes

**Files:**
- Modify: `src/views/visitStates.tsx:9-58`

Es el único lugar donde viven nombres y colores; el resto de las vistas hereda sin tocarse.

- [ ] **Step 1: Reemplazar `VISIT_STATES` y agregar `short`**

`short` es la etiqueta para columnas angostas, igual que en `OPERATIONAL_STAGES`. La usa la fila de
Visitas del día cuando muestra el chip clínico.

```ts
/**
 * Paleta de los estados CLÍNICOS de la visita (identidad visual, TrackContent.jsx). Constante en
 * ambos temas, igual que los acentos de módulo. Desde el rediseño de estados (0068):
 * - `futura` YA NO SE EMITE (la vista manda siempre `proxima`): "Pendiente" fusiona los dos. Queda
 *   acá con la misma cara para que una fila vieja en caché no se vea rota — el valor no se puede
 *   borrar del enum en Postgres.
 * - `item_vencido` conserva su valor en la base, pero se rotula "Pendiente vencido": ahora también
 *   cubre reportes de procedimientos, no solo ítems de checklist.
 */
export const VISIT_STATES: Record<VisitStatus, { label: string; short: string; color: string }> = {
  futura:          { label: 'Pendiente',         short: 'Pendiente',   color: '#7C8C87' },
  proxima:         { label: 'Pendiente',         short: 'Pendiente',   color: '#7C8C87' },
  en_atencion:     { label: 'Siendo atendido',   short: 'En atención', color: '#2E7D74' },
  realizada:       { label: 'Visita realizada',  short: 'Realizada',   color: '#3A6B8C' },
  completa:        { label: 'Completa',          short: 'Completa',    color: '#4E7A3F' },
  item_vencido:    { label: 'Pendiente vencido', short: 'Vencido',     color: '#B0823F' },
  ventana_vencida: { label: 'Ventana vencida',   short: 'Ventana',     color: '#A6483B' },
  por_reprogramar: { label: 'Por reprogramar',   short: 'No vino',     color: '#8A5A3C' },
}
```

Los seis colores viejos no se mueven salvo "Pendiente", que toma el gris sereno que antes tenía
`futura`: eso libera el petróleo de la marca (`#2E7D74`) para "Siendo atendido", que es el estado
vivo. `#8A5A3C` (terracota oscuro) es nuevo y da 5.5:1 sobre blanco — pasa AA para texto chico.

- [ ] **Step 2: Reemplazar `OPERATIONAL_STAGES` y `STAGE_ORDER`**

```ts
/**
 * Paleta/etiquetas de la ETAPA OPERATIVA (recorrido del paciente en el centro). Eje distinto de
 * VISIT_STATES (clínico): no mezclar. Orden lineal por_llegar → fin_atencion, que es terminal:
 * desde la 0068 la visita la cierra el clínico al terminar la atención, no recepción al ver salir
 * al paciente ("Fuera del sitio" salió del recorrido).
 */
export const OPERATIONAL_STAGES: Record<OperationalStage, { label: string; short: string; color: string }> = {
  por_llegar:          { label: 'Por llegar',          short: 'Por llegar',  color: '#7C8C87' },
  concurrio_al_centro: { label: 'Concurrió al centro', short: 'Concurrió',   color: '#2E7D74' },
  inicio_atencion:     { label: 'Inicio de atención',  short: 'En atención', color: '#3A6B8C' },
  fin_atencion:        { label: 'Fin de atención',     short: 'Finalizada',  color: '#4E7A3F' },
}

/** Orden lineal de las etapas operativas (para el stepper y el "siguiente paso"). */
export const STAGE_ORDER: OperationalStage[] = ['por_llegar', 'concurrio_al_centro', 'inicio_atencion', 'fin_atencion']
```

- [ ] **Step 3: Darle `compact` a `VisitChip`, igual que a `OperationalStageChip`**

```tsx
/** Chip de estado de visita: punto + etiqueta sobre el color del estado al 9 %. `compact` usa la
 *  etiqueta corta ("No vino", "Realizada") para columnas angostas — ver la fila de Visitas del día. */
export function VisitChip({ status, compact = false }: { status: VisitStatus; compact?: boolean }) {
  const e = VISIT_STATES[status] ?? VISIT_STATES.proxima
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
        color: e.color, whiteSpace: 'nowrap', background: e.color + '16', padding: '3px 10px',
        borderRadius: 'var(--spira-radius-pill)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.color }} />
      {compact ? e.short : e.label}
    </span>
  )
}
```

Ojo con el fallback: pasa de `VISIT_STATES.futura` a `VISIT_STATES.proxima`, porque `futura` ya no
se emite.

- [ ] **Step 4: Ajustar `dotColor`**

Usa el gris de `futura` como color de "todavía no pasó nada". Ese gris ahora es el de `proxima`:

```ts
export function dotColor(dv: DotVisual, accent: string): string {
  return dv === 'agendada' ? VISIT_STATES.proxima.color : accent
}
```

- [ ] **Step 5: Verificar y commitear la fase**

```bash
npm run typecheck
```

Esperado: quedan **solo** los errores de `advanceStep.ts`, `DayVisitsView.tsx`,
`DayVisitRowItem.tsx` y `VisitDetail.tsx` (los literales viejos de etapa). Si aparece un error en
otro archivo, es un consumidor que no estaba en el mapa: anotalo y arreglalo antes de seguir.

```bash
git add src/data/dayVisits.ts src/data/visits.ts src/views/visitStates.tsx
git commit -m "feat(track): tipos, mutaciones y etiquetas de los estados nuevos"
```

---

## Fase C · Recorrido en la UI

### Task 8: El paso siguiente y quién lo marca

**Files:**
- Modify: `src/views/track/advanceStep.ts` (archivo completo)

- [ ] **Step 1: Reemplazar el mapa y el rol**

```ts
import type { OperationalStage } from '../../data/dayVisits'

/**
 * Etiqueta corta del paso SIGUIENTE por etapa operativa, para el CTA de avanzar (fila del día y
 * detalle). Corta a propósito para que el botón no envuelva. 'fin_atencion' es terminal (no avanza).
 * Compartido para no repetir el mapa en la fila y en el detalle (DRY).
 */
export const NEXT_STEP: Record<OperationalStage, { label: string; next: OperationalStage } | null> = {
  por_llegar:          { label: 'Marcar llegada',     next: 'concurrio_al_centro' },
  concurrio_al_centro: { label: 'Iniciar atención',   next: 'inicio_atencion' },
  inicio_atencion:     { label: 'Finalizar atención', next: 'fin_atencion' },
  fin_atencion:        null,
}

/**
 * Quién marca la etapa SIGUIENTE: recepción (por_llegar→concurrio_al_centro) o clínico (las otras
 * dos). null en la etapa terminal. Desde la 0068 recepción solo abre el recorrido: el cierre pasó
 * a ser del clínico, que es quien sabe cuándo terminó la atención. Sirve para el gating del CTA y
 * para el rótulo "Acción de Recepción / Acción del clínico" del detalle.
 */
export function advanceRole(stage: OperationalStage): 'reception' | 'clinical' | null {
  if (stage === 'por_llegar') return 'reception'
  if (stage === 'concurrio_al_centro' || stage === 'inicio_atencion') return 'clinical'
  return null
}
```

- [ ] **Step 2: Verificar**

```bash
npm run typecheck
```

Esperado: desaparecen los errores de `advanceStep.ts`. `VisitStepper.tsx` **no da error y no se
toca**: lee `STAGE_ORDER`, así que pasa de 5 puntos a 4 solo.

- [ ] **Step 3: Commit**

```bash
git add src/views/track/advanceStep.ts
git commit -m "feat(track): 3 saltos del recorrido y recepción solo en la llegada"
```

---

### Task 9: Etapa terminal en el detalle de la visita

**Files:**
- Modify: `src/views/track/VisitDetail.tsx:432` y `:454`

- [ ] **Step 1: Cambiar las dos comparaciones de etapa terminal**

Línea 432:

```tsx
      {showCTA && visit.operational_stage !== 'fin_atencion' && (
```

Línea 454:

```tsx
      {visit.operational_stage === 'fin_atencion' && (
```

El bloque verde "Finalizada" y el resto del `VerticalRoute` no cambian: el stepper vertical mapea
`STAGE_ORDER`, así que dibuja 4 filas solo.

- [ ] **Step 2: Verificar**

```bash
npm run typecheck
```

Esperado: desaparecen los errores de `VisitDetail.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/views/track/VisitDetail.tsx
git commit -m "feat(track): fin de atención es la etapa terminal del detalle"
```

---

### Task 10: La fila de Visitas del día

**Files:**
- Modify: `src/views/track/DayVisitRowItem.tsx` — imports, `:74-77` (chip), `:135` (botón médico), `:157-177` (CTA), `:197-240` (menú ⋯)

- [ ] **Step 1: Importar `VisitChip`**

En el import de `../visitStates`, agregá `VisitChip`:

```tsx
import { OperationalStageChip, OPERATIONAL_STAGES, VisitChip } from '../visitStates'
```

- [ ] **Step 2: Mostrar el chip clínico cuando la visita está "Por reprogramar"**

Reemplazá el bloque de la columna izquierda (líneas 74-77):

```tsx
      {/* columna izquierda: chip de estado (reemplaza la hora, que no existe en el schema).
          Si la visita quedó "Por reprogramar" mandamos el chip CLÍNICO: operativamente sigue en
          "Por llegar", y dejar ese chip diría que el paciente está por llegar cuando ya se sabe
          que no viene. Se mira `computed_status` y no `no_show_at` porque la vista ya resuelve la
          precedencia (ventana vencida le gana a por reprogramar). */}
      <div style={{ flex: '0 0 auto', width: 96 }}>
        {visit.computed_status === 'por_reprogramar'
          ? <VisitChip status="por_reprogramar" compact />
          : <OperationalStageChip stage={stage} compact />}
      </div>
```

- [ ] **Step 3: Ajustar la elegibilidad del botón "Quiere médico"**

Línea 135. La etapa terminal ahora es `fin_atencion`:

```tsx
  const eligible = canClinical && visit.operational_stage !== 'por_llegar' && visit.operational_stage !== 'fin_atencion'
```

- [ ] **Step 4: Ajustar el CTA terminal**

En `AdvanceCTA`, cambiá el comentario y la comparación:

```tsx
/**
 * CTA de avanzar etapa. Ancho fijo (150), relleno de marca, siempre a la derecha. 'fin_atencion'
 * muestra el estado terminal "Finalizada"; sin paso o sin permiso deja un hueco del mismo ancho
 * (conserva la alineación de la columna derecha en las demás filas). El desenlace de
 * screening/randomización lo resuelve el padre en `onAdvance` (abre el cierre clínico).
 */
```

```tsx
  if (stage === 'fin_atencion') {
```

- [ ] **Step 5: Rehacer el menú ⋯**

"No vino" pasa a **guardar la marca** (ya no abre el modal), se le suma el deshacer, y
"Reprogramar" queda como acción propia. Reemplazá la firma y el cuerpo de `RowMenu`:

```tsx
/** Menú ⋯ de la fila: acciones que SÍ están cableadas (no vino · reprogramar · copiar N°). */
function RowMenu({ visit, canReception, busy, onNoShow, onReschedule }: {
  visit: DayVisitRow
  canReception: boolean
  busy: boolean
  /** Marca (true) o deshace (false) "No vino". */
  onNoShow: (visit: DayVisitRow, value: boolean) => void
  onReschedule: (visit: DayVisitRow) => void
}) {
```

Y dentro, reemplazá `canNoShow` y el bloque de items:

```tsx
  // Marcar la falta solo tiene sentido antes de que el paciente llegue; deshacerla, mientras siga
  // marcada. El server además rechaza marcar como ausente una visita ya atendida.
  const marcada = visit.no_show_at !== null
  const canNoShow = visit.operational_stage === 'por_llegar' && canReception
```

```tsx
          {canNoShow && !marcada && (
            <MenuItem label="Marcar como no vino" danger onClick={() => { if (!busy) onNoShow(visit, true); setOpen(false) }} />
          )}
          {canNoShow && marcada && (
            <MenuItem label="Deshacer “no vino”" onClick={() => { if (!busy) onNoShow(visit, false); setOpen(false) }} />
          )}
          <MenuItem label="Reprogramar" onClick={() => { if (!busy) onReschedule(visit); setOpen(false) }} />
          <MenuItem
            label="Copiar N° de paciente"
            disabled={!visit.patient_code}
            onClick={() => { if (visit.patient_code) navigator.clipboard?.writeText(visit.patient_code); setOpen(false) }}
          />
```

- [ ] **Step 6: Propagar las props nuevas**

En el `interface` de props del componente de la fila (arriba del archivo, donde hoy está
`onNoShow`), cambiá la firma a `(visit: DayVisitRow, value: boolean) => void` y agregá
`onReschedule: (visit: DayVisitRow) => void`. Pasalas a `<RowMenu … />` en el JSX.

- [ ] **Step 7: Verificar**

```bash
npm run typecheck
```

Esperado: quedan solo los errores de `DayVisitsView.tsx` (que todavía no pasa `onReschedule` ni la
firma nueva de `onNoShow`).

- [ ] **Step 8: Commit**

```bash
git add src/views/track/DayVisitRowItem.tsx
git commit -m "feat(track): la fila marca no-show, ofrece reprogramar y muestra Por reprogramar"
```

---

### Task 11: La vista de Visitas del día

**Files:**
- Modify: `src/views/DayVisitsView.tsx:15` (imports), `:38-39` (inCenter), `:62` (estado), `:136-140` (orden), `:154-158` (contadores), `:160-181` (advance), `:346-353` (modal), y el `renderRow`

- [ ] **Step 1: Actualizar imports**

Sacá `markLeft` (ya no se llama desde la UI) y sumá `markNoShow`:

```tsx
  useVisitsForDay, markArrived, markAttended, markReady, markNoShow,
```

- [ ] **Step 2: `inCenter` con las etapas nuevas**

```tsx
function inCenter(stage: OperationalStage): boolean {
  return stage === 'concurrio_al_centro' || stage === 'inicio_atencion'
}
```

"Fin de atención" ya **no** cuenta como en el centro: la atención terminó.

- [ ] **Step 3: Renombrar el estado del modal**

El estado `noShow` ya no representa "no vino" sino "qué visita estoy reprogramando":

```tsx
  const [reschedule, setReschedule] = useState<TrackVisitRow | null>(null)
```

- [ ] **Step 4: Orden y contadores**

```tsx
  /* Orden base: en el centro primero (más avanzada arriba: Inicio de atención → Concurrió), luego
     por llegar, luego las finalizadas; a igual etapa, por orden de llegada. Los grupos parten esta lista. */
  const byArrival = (a: DayVisitRow, b: DayVisitRow) => (a.arrived_at ?? '').localeCompare(b.arrived_at ?? '')
  const stageRank = (s: OperationalStage) => ['inicio_atencion', 'concurrio_al_centro', 'por_llegar', 'fin_atencion'].indexOf(s)
```

```tsx
  /* Contadores de cabecera, sobre la lista FILTRADA (coloreados). "No vino" no es una etapa del
     recorrido (es un estado clínico), así que no tiene contador propio. */
  const porLlegarCount = filtered.filter((v) => v.operational_stage === 'por_llegar').length
  const enCentroVisible = filtered.filter((v) => inCenter(v.operational_stage)).length
  const finalizadasCount = filtered.filter((v) => v.operational_stage === 'fin_atencion').length
```

- [ ] **Step 5: Despacho de marcas**

```tsx
  /* Despacha la mutación de la etapa SIGUIENTE. 'inicio_atencion' reusa markAttended con `date` (el
     día que se está mirando, no necesariamente hoy) porque es lo que setea real_date. El resto son
     eventos en vivo (now() server-side). "Fin de atención" de una visita de screening/randomización
     NO marca directo: abre el cierre clínico, que captura el IVRS o la randomización. */
  const advance = async (visit: DayVisitRow, next: OperationalStage) => {
    if (next === 'fin_atencion' && (visit.role === 'screening' || visit.role === 'randomizacion')) {
      setActionError(null)
      setFeedback(null)
      setReadyOutcome(visit)
      return
    }
    setBusyId(visit.id)
    setActionError(null)
    const res =
      next === 'concurrio_al_centro' ? await markArrived(visit.id)
      : next === 'inicio_atencion' ? await markAttended(visit.id, date)
      : next === 'fin_atencion' ? await markReady(visit.id)
      : { error: 'Etapa desconocida.' }
    setBusyId(null)
    if (res.error) { setActionError(res.error); return }
    day.refetch()
  }
```

- [ ] **Step 6: Handler de "no vino"**

Agregalo justo debajo de `advance`:

```tsx
  /* "No vino" ahora GUARDA una marca (no abre el modal): la visita queda en "Por reprogramar"
     hasta que alguien le dé fecha nueva, que es lo que la saca del estado. Mismo patrón de
     busy/error que `advance`. */
  const noShow = async (visit: DayVisitRow, value: boolean) => {
    setBusyId(visit.id)
    setActionError(null)
    const res = await markNoShow(visit.id, value)
    setBusyId(null)
    if (res.error) { setActionError(res.error); return }
    day.refetch()
  }
```

- [ ] **Step 7: Cablear la fila y el modal**

En `renderRow`, pasá `onNoShow={noShow}` y `onReschedule={setReschedule}`. Y el modal:

```tsx
      {reschedule && (
        <RescheduleModal
          visit={reschedule}
          accentSolid={accentSolid}
          onClose={() => setReschedule(null)}
          onDone={() => { setReschedule(null); day.refetch() }}
        />
      )}
```

- [ ] **Step 8: Verificar**

```bash
npm run typecheck
```

Esperado: **verde**, sin errores. Si queda alguno, es un consumidor fuera del mapa.

Nota: **el filtro "Estado" y el agrupador "por estado" no hay que tocarlos**. Los dos mapean
`STAGE_ORDER` (líneas 101 y 449), así que pasan de 5 opciones a 4 solos, con las etiquetas nuevas.

- [ ] **Step 9: Commit**

```bash
git add src/views/DayVisitsView.tsx
git commit -m "feat(track): Visitas del día con las 4 etapas y la marca de no-show"
```

---

## Fase D · Cierre

### Task 12: Verificación completa y QA logueado

- [ ] **Step 1: Gate de compilación**

```bash
npm run typecheck
```

Esperado: sin salida de errores.

```bash
npm run build
```

Esperado: build de producción exitoso. Si aparecen errores de consola raros después de editar, son
**stale de HMR**: reiniciá el server antes de diagnosticar.

- [ ] **Step 2: Confirmar que las migraciones estén aplicadas**

Sin la 0068 aplicada, la vista no emite las etapas nuevas y la UI se ve rota. Si el Director todavía
no confirmó, **frená acá** y avisale: el QA no se puede hacer.

```bash
node scripts/check-migraciones.mjs
```

- [ ] **Step 3: QA logueado en el preview**

Levantá el preview (puerto 5250, `.claude/launch.json`) y verificá, en este orden. Acordate de que
`preview_screenshot` se cuelga casi siempre: verificá por snapshot/eval/estilos computados.

1. **Recorrido completo.** Track → Visitas: una visita recorre Por llegar → Concurrió al centro →
   Inicio de atención → Fin de atención, y el stepper dibuja **4 puntos** (fila y modal).
2. **Estado clínico durante la atención.** Al marcar la llegada, la ficha del paciente muestra
   "Siendo atendido"; al marcar el fin, "Visita realizada"; al cerrar checklist y reportes,
   "Completa".
3. **No vino.** El menú ⋯ de una visita en "Por llegar" ofrece "Marcar como no vino" → la fila pasa
   a mostrar el chip **"No vino"**; el menú ahora ofrece "Deshacer". "Reprogramar" le da fecha nueva
   y la devuelve a "Pendiente".
4. **Concurrió gana.** Marcar una visita como no vino y después marcarle la llegada: queda en
   "Concurrió al centro", sin rastro de la falta en el chip.
5. **Desenlace clínico.** En una visita de screening o randomización, "Finalizar atención" abre el
   cierre clínico (IVRS / randomización), no marca directo.
6. **Visitas históricas.** Una visita vieja de la ficha de un paciente muestra el mismo estado que
   antes de la migración (no dice "Siendo atendido" ni "Por reprogramar").
7. **Contadores y grupos** de la cabecera: "en el centro" no incluye las finalizadas.
8. **Modo oscuro** en los chips nuevos (`#8A5A3C` y el petróleo de "Siendo atendido").

**Usá solo registros `TEST-*` creados por vos si necesitás datos nuevos, y borrá exactamente esos.**
El demo tiene datos reales.

- [ ] **Step 4: Pulido de color (opcional, si algo se ve fuera de tono)**

```bash
/impeccable critique src/views/visitStates.tsx
```

Los colores viven todos en ese archivo, así que un ajuste es una línea.

- [ ] **Step 5: Abrir la PR**

No hay `gh` en esta máquina: se usa la API REST de GitHub con `git credential fill` + script Node.
Vos creás la PR, **el Director mergea** (el clasificador bloquea el self-merge). En el cuerpo va el
checklist del Step 3 para que pueda repetir el QA.

---

## Fuera de alcance (no lo hagas en este plan)

- Cambiar qué hace que una visita esté `realizada` o `completa` (eso es de la 0064).
- Registrar el **motivo** de la falta. La marca es booleana; si hace falta un motivo, es otra tajada
  con el patrón de `doctor_motivo` (0047).
- Que "Por reprogramar" dispare alerta en la campana. Hoy `useVisitAlerts` filtra `ventana_vencida`
  + `item_vencido` y **no se toca**; sumarlo después es agregar el valor a ese `.in(...)`.
- Borrar `left_at` / `mark_left` de la base: quedan como histórico auditable.
