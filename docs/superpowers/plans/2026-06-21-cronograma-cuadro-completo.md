# Cronograma = cuadro de actividades completo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el cronograma del protocolo modele el **cuadro de actividades completo** (selección → screening → randomización → tratamiento → seguimiento) con título "código - nombre", y que la randomización/screening se **confirmen al cerrar la visita** ("Listo para irse"), capturando IVRS y permitiendo reintentos.

**Architecture:** SQL-céntrico. `visit_definitions` gana `role` (screening/randomizacion/comun) y usa `date_mode` (libre = pre-rando manual / automatica = post-rando autogenerada). Las visitas del cuadro pasan a `kind='programada'` con `visit_def_id`; VNP/retest siguen sueltas. La generación automática toma solo `automatica`. La confirmación clínica vive en `mark_ready` (extendida). Display unificado "código - nombre".

**Tech Stack:** Vite + React 19 + TypeScript strict · Supabase (PostgreSQL + RLS) · CSS variables. Sin runner de tests → verificación por `tsc --noEmit`, script SQL de verificación, y QA en browser (gstack `/browse`).

**Spec:** `docs/superpowers/specs/2026-06-21-cronograma-cuadro-completo-design.md`

---

## Notas para el ejecutor

- **No hay runner de tests.** Donde el template TDD pide "test que falle", acá se reemplaza por: para SQL, agregar el caso al script `supabase/scripts/2026-06-21-cuadro-verificacion.sql` y correrlo en el SQL Editor; para front, `npm run typecheck` + QA en browser.
- **Migraciones se aplican A MANO en prod** (sin SQL programático). El commit incluye el archivo; aplicarlo es paso manual del usuario, en orden. La última aplicada es **0028**; estas son **0029** (Fase 1) y **0030** (Fase 2).
- **No editar migraciones ya aplicadas.** Cada cambio es un archivo nuevo numerado.
- Helpers RLS/authz existentes: `has_module('gerencia')`, `has_min_role('track','admin'|'operator')`, `is_assigned_coordinator(protocol_id)`.
- Convención: lecturas = hook `useXxx` con `useSupabaseQuery`; mutaciones = `async` (RPC o `.from().update()`); tipos a mano; errores PG → mensaje sereno; "0 filas = sin permiso"; estilo SIN punto y coma; `btnPrimary(accentSolid)` es función; inputs con `fieldInput`.

## Estructura de archivos

| Archivo | Fase | Responsabilidad |
|---|---|---|
| `supabase/migrations/0029_visit_role_y_generacion.sql` | 1 | `role` en `visit_definitions`; `v_track_visits` expone `role`/`date_mode`; `generate_patient_visits` solo `automatica` + guard por-def |
| `src/data/visitDefinitions.ts` | 1 | `VisitDefinition`/`DefinitionInput` += `role`, `date_mode` |
| `src/data/visits.ts` | 1 | `TrackVisitRow` += `role`, `date_mode` |
| `src/views/track/ScheduleDefinitionForm.tsx` | 1 | form: selector de etapa (libre/automatica) + rol |
| `src/views/track/ScheduleEditor.tsx` | 1 | columna "Etapa/Rol" + pasar nuevos campos |
| `src/lib/visits.ts` | 1 | helpers `visitTitle(v)` y `visitCode(v,n)` |
| (13 vistas) | 1 | usar `visitTitle`/`visitCode` |
| `supabase/migrations/0030_flujo_randomizacion.sql` | 2 | constraint/singleton; `schedule_protocol_visit`; `mark_ready_with_outcome`; `register_visit_event` deja de anclar la rando |
| `src/data/dayVisits.ts` | 2 | `markReadyWithOutcome` |
| `src/data/visitDefinitions.ts` | 2 | `scheduleProtocolVisit`, `useSchedulableDefinitions` |
| `src/views/track/RegisterVisitFlow.tsx` | 2 | agendar eligiendo definición del cuadro |
| `src/views/DayVisitsView.tsx` + nuevo `ReadyOutcomeModal.tsx` | 2 | alerta IVRS/¿randomizó? al pasar a "Listo" |

---

# FASE 1 — Modelo base + display

## Task 1: Migración 0029 — `role`, vistas, generación

**Files:**
- Create: `supabase/migrations/0029_visit_role_y_generacion.sql`

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Spira · Migración 0029 — visit_definitions.role + generación solo 'automatica'
-- Ver spec: docs/superpowers/specs/2026-06-21-cronograma-cuadro-completo-design.md
-- ============================================================================

-- 1 · role: qué alerta dispara la visita al cerrarse. 'comun' = sin alerta.
alter table public.visit_definitions
  add column if not exists role text not null default 'comun'
    check (role in ('screening','randomizacion','comun'));
comment on column public.visit_definitions.role is
  'Rol clínico de la visita: screening (captura IVRS al cerrar) / randomizacion (confirma rando → ancla y genera tratamiento) / comun. Migración 0029.';

-- date_mode YA existe (0002): 'libre' = pre-rando manual (offset es referencia) /
-- 'automatica' = post-rando autogenerada. Lo activamos en la generación (paso 3).

-- 2 · v_track_visits expone role + date_mode (v_patient_visits no cambia; solo
--     dropeamos/recreamos v_track_visits que es la que joinea visit_definitions).
drop view if exists public.v_track_visits;
create view public.v_track_visits with (security_invoker = true) as
select
  v.id, v.enrollment_id, v.visit_def_id, v.estimated_date, v.real_date,
  v.window_start, v.window_end, v.notes, v.computed_status,
  vd.code as visit_code, vd.name as visit_name,
  coalesce(vd.visit_type, 'presencial') as visit_type, vd.sort_order,
  e.protocol_id, e.patient_id, e.status as enrollment_status,
  pr.code as protocol_code, pr.name as protocol_name,
  pa.code as patient_code, pa.full_name as patient_name,
  vd.offset_days, e.enrollment_date, pa.treating_physician,
  v.kind,
  v.arrived_at, v.ready_at, v.left_at, v.wants_doctor,
  coalesce(vd.dispenses, false) as dispenses,
  v.operational_stage,
  -- nuevas (0029):
  vd.role, vd.date_mode
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id;
comment on view public.v_track_visits is 'Visita + def + protocolo + paciente + marcas + etapa + dispensa + rol/date_mode. security_invoker.';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;

-- 3 · generate_patient_visits: solo definiciones 'automatica' + guard POR-DEFINICIÓN
--     (las 'libre' pre-rando también son kind='programada' desde Fase 2 y no deben
--     bloquear ni autogenerarse).
create or replace function public.generate_patient_visits()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.randomization_date is null then return new; end if;
  insert into public.patient_visits
    (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end)
  select
    new.id, vd.id, 'programada',
    new.randomization_date + vd.offset_days,
    new.randomization_date + vd.offset_days - vd.window_minus,
    new.randomization_date + vd.offset_days + vd.window_plus
  from public.visit_definitions vd
  where vd.protocol_id = new.protocol_id
    and vd.date_mode = 'automatica'
    and not exists (
      select 1 from public.patient_visits pv
      where pv.enrollment_id = new.id and pv.kind = 'programada' and pv.visit_def_id = vd.id);
  return new;
end; $$;

-- 4 · sync_protocol_schedule: restringir el conjunto 'desired' a definiciones
--     'automatica' (las libres no entran en la reconciliación automática).
--     Recreamos la función de 0026 sumando "and vd.date_mode='automatica'" en los
--     tres lugares donde se joinea visit_definitions para construir desired/insert/update.
-- (El cuerpo completo se copia de 0026 con ese filtro agregado; ver 0026 líneas 64-130.)
-- >>> El ejecutor: copiar create-or-replace de 0026 y agregar `and vd.date_mode = 'automatica'`
-- >>> en: el JOIN de `desired` (CTE), el INSERT de CREAR, y el FROM del UPDATE de MOVER.

notify pgrst, 'reload schema';
```

> Nota: el paso 4 requiere copiar el cuerpo de `sync_protocol_schedule` de `0026_protocol_schedule.sql:54-135` agregando `and vd.date_mode = 'automatica'` en los tres joins a `visit_definitions`. Pegarlo completo en 0029 (las migraciones son self-contained).

- [ ] **Step 2: Verificar sintaxis en el SQL Editor (entorno de prueba)** — pegar el archivo. Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0029_visit_role_y_generacion.sql
git commit -m "feat(track): 0029 role en visit_definitions + generación solo automatica"
```

## Task 2: Capa de datos — role + date_mode en tipos

**Files:**
- Modify: `src/data/visitDefinitions.ts`
- Modify: `src/data/visits.ts`

- [ ] **Step 1: Tipos en visitDefinitions.ts**

En `VisitDefinition` (interface) agregar:
```ts
  /** Rol clínico (0029): screening/randomizacion disparan alerta al cerrar; comun no. */
  role: 'screening' | 'randomizacion' | 'comun'
  /** 'libre' = pre-rando manual (offset es referencia) / 'automatica' = post-rando autogenerada. */
  date_mode: 'libre' | 'automatica'
```
En `DefinitionInput` agregar los mismos dos campos (`role`, `date_mode`). En `createDefinition`/`updateDefinition` no hace falta tocar nada: el `insert({ ...input, ... })` / `update(input)` ya los incluye.

- [ ] **Step 2: TrackVisitRow en visits.ts**

Agregar al final de la interface `TrackVisitRow`:
```ts
  /** Rol de la definición (0029); null para sueltas sin def. */
  role: 'screening' | 'randomizacion' | 'comun' | null
  /** Modo de fecha de la definición (0029); null para sueltas. */
  date_mode: 'libre' | 'automatica' | null
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck` → PASS.
```bash
git add src/data/visitDefinitions.ts src/data/visits.ts
git commit -m "feat(track): role/date_mode en tipos de definiciones y v_track_visits"
```

## Task 3: Editor — configurar rol + etapa (date_mode)

**Files:**
- Modify: `src/views/track/ScheduleDefinitionForm.tsx`
- Modify: `src/views/track/ScheduleEditor.tsx`

- [ ] **Step 1: Form — selects de Etapa y Rol**

En `ScheduleDefinitionForm.tsx`, estado:
```ts
  const [dateMode, setDateMode] = useState<'libre' | 'automatica'>(initial?.date_mode ?? 'automatica')
  const [role, setRole] = useState<'screening' | 'randomizacion' | 'comun'>(initial?.role ?? 'comun')
```
En el `onSubmit({...})` agregar `date_mode: dateMode, role`.
Antes del checkbox "Entrega medicación", agregar dos `FormField` con `select` (estilo `fieldInput`):
```tsx
        <FormField label="Cuándo se agenda">
          <select value={dateMode} onChange={(e) => setDateMode(e.target.value as 'libre' | 'automatica')} style={fieldInput}>
            <option value="automatica">Automática (se genera desde la randomización)</option>
            <option value="libre">Manual (se agenda a mano · pre-randomización)</option>
          </select>
        </FormField>
        <FormField label="Rol">
          <select value={role} onChange={(e) => setRole(e.target.value as 'screening' | 'randomizacion' | 'comun')} style={fieldInput}>
            <option value="comun">Común (sin pregunta al cerrar)</option>
            <option value="screening">Screening (pregunta el IVRS al cerrar)</option>
            <option value="randomizacion">Randomización (pregunta si randomizó al cerrar)</option>
          </select>
        </FormField>
```
La etiqueta del campo "Día" debe matizar que es referencia cuando es libre — cambiar su label a `Día (offset desde randomización; referencia si es manual)`.

- [ ] **Step 2: Editor — mostrar la etapa/rol en la tabla**

En `ScheduleEditor.tsx`, en la celda de "Tipo" (la que hoy muestra `presencial · dispensa`), anteponer el rol/etapa cuando no sea común:
```tsx
                {d.date_mode === 'libre' ? 'Manual' : 'Auto'}
                {d.role !== 'comun' ? ` · ${d.role === 'screening' ? 'Screening' : 'Randomización'}` : ''}
                {' · '}{d.visit_type === 'telefonica' ? 'Telefónica' : 'Presencial'}{d.dispenses ? ' · dispensa' : ''}
```
(Ajustar el ancho de la columna `COLS` si hace falta.)

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck` → PASS.
```bash
git add src/views/track/ScheduleDefinitionForm.tsx src/views/track/ScheduleEditor.tsx
git commit -m "feat(track): editor del cronograma configura rol y etapa (date_mode)"
```

## Task 4: Display "código - nombre" en todos los puntos

**Files:**
- Modify: `src/lib/visits.ts`
- Modify: los 13 puntos de render (tabla abajo)

- [ ] **Step 1: Helpers en lib/visits.ts**

```ts
import { KIND_LABELS, KIND_SHORT } from '../data/visitEvents'

/** Título completo de una visita: "V1 - Screening" (def) o el label del kind (suelta). */
export function visitTitle(v: TrackVisitRow): string {
  if (v.visit_code) return v.visit_name ? `${v.visit_code} - ${v.visit_name}` : v.visit_code
  return v.visit_name ?? KIND_LABELS[v.kind]
}

/** Código corto para el rótulo bajo la burbuja del tracker: "V1" (def) o el short del kind. */
export function visitCode(v: TrackVisitRow, n?: number | null): string {
  return v.visit_code ?? (KIND_SHORT[v.kind] || (n != null ? `V${n}` : ''))
}
```

- [ ] **Step 2: Reemplazar en cada punto (la burbuja sigue siendo el número)**

| Archivo:línea | Hoy | Cambiar a |
|---|---|---|
| `PdFullSchedule.tsx:26` | `n != null ? \`Visita ${n}\` : KIND_LABELS[v.kind]` | `visitTitle(v)` |
| `PdVisitFlow.tsx:30,71` | `n != null ? \`V${n}\` : KIND_SHORT[v.kind]` | `visitCode(v, n)` |
| `PdPatientRow.tsx:44` | `n != null ? \`V${n}\` : KIND_SHORT[v.kind]` | `visitCode(v, n)` |
| `DayVisitRowItem.tsx:33` | `visit.visit_name ?? KIND_LABELS[visit.kind]` | `visitTitle(visit)` |
| `DayVisitRowItem.tsx:73` | `visit_code · vName` | quitar el `visit_code ·` (ya va en `visitTitle`) |
| `DayVisitsView.tsx:182` | `openVisit.visit_name ?? 'Visita suelta'` | `visitTitle(openVisit)` |
| `TrackResumenView.tsx:155` | `a.visit_name ?? KIND_LABELS[a.kind]` | `visitTitle(a)` |
| `TrackAlertsView.tsx:136` | `a.visit_name ?? KIND_LABELS[a.kind]` | `visitTitle(a)` |
| `DoctorQueueView.tsx:95` | `v.visit_name ?? KIND_LABELS[v.kind]` | `visitTitle(v)` |
| `PatientFichaView.tsx:142` | `a.visit_name` | `visitTitle(a)` |
| `TrackResumenView.tsx:129`, `AgendaView.tsx:115` | `\` · ${v.visit_code}\`` (solo código) | dejar como está, o ` · ${visitCode(v)}` |

Importar `visitTitle`/`visitCode` en cada archivo. Ajustar firmas: donde hoy se pasa `KIND_SHORT[v.kind]`, ahora se usa el helper.

- [ ] **Step 3: Typecheck + build + commit**

Run: `npm run build` → PASS.
```bash
git add src/lib/visits.ts src/views
git commit -m "feat(track): título de visita 'código - nombre' en todos los puntos"
```

---

# FASE 2 — Flujo operativo (randomización / screening al cerrar)

## Task 5: Migración 0030 — constraint, RPCs del flujo

**Files:**
- Create: `supabase/migrations/0030_flujo_randomizacion.sql`

- [ ] **Step 1: Constraint + singleton (permitir libres-programadas + reintentos)**

```sql
-- Spira · Migración 0030 — flujo de randomización/screening + visitas libres del cuadro
-- ============================================================================

-- 1 · Relajar el shape: 'programada' ahora puede ser LIBRE (sin ventanas). Las
--     'automatica' siguen llenando ventanas (las pone generate_patient_visits).
alter table public.patient_visits drop constraint if exists patient_visits_kind_shape;
alter table public.patient_visits add constraint patient_visits_kind_shape check (
  (kind =  'programada' and visit_def_id is not null and estimated_date is not null)
  or
  (kind <> 'programada' and visit_def_id is null and window_start is null and window_end is null)
);
```

> El singleton `uq_pv_singleton_kind` (0022) es sobre `kind in (firma,screening,firma_screening,randomizacion)`. Como screening/randomización del cuadro pasan a `kind='programada'`, ese índice ya **no** las alcanza → reintentos permitidos sin tocar el índice. (Si quedaran sueltas legacy de esos kinds, el índice las sigue protegiendo; OK.)

- [ ] **Step 2: RPC `schedule_protocol_visit` (agendar una visita libre del cuadro)**

```sql
-- 2 · Agendar una visita LIBRE del cuadro como programada (manual, sin ventanas).
create or replace function public.schedule_protocol_visit(p_enrollment_id uuid, p_visit_def_id uuid, p_date date)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_protocol uuid; v_def_protocol uuid; v_mode text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if p_date is null then raise exception 'La fecha es obligatoria' using errcode='23502'; end if;
  select e.protocol_id into v_protocol from public.enrollments e where e.id = p_enrollment_id;
  if v_protocol is null then raise exception 'Enrolamiento inexistente' using errcode='23503'; end if;
  select vd.protocol_id, vd.date_mode into v_def_protocol, v_mode
    from public.visit_definitions vd where vd.id = p_visit_def_id;
  if v_def_protocol is null or v_def_protocol <> v_protocol then
    raise exception 'La definición no pertenece al protocolo' using errcode='check_violation';
  end if;
  if v_mode <> 'libre' then
    raise exception 'Solo se agendan a mano las visitas manuales (las automáticas se generan al randomizar)' using errcode='check_violation';
  end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso para agendar visitas de este paciente' using errcode='42501';
  end if;
  insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date)
  values (p_enrollment_id, p_visit_def_id, 'programada', p_date)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.schedule_protocol_visit(uuid, uuid, date) from public;
grant execute on function public.schedule_protocol_visit(uuid, uuid, date) to authenticated;
```

- [ ] **Step 3: RPC `mark_ready_with_outcome` (cierre clínico + IVRS/randomización)**

```sql
-- 3 · "Listo para irse" + outcome según el rol de la definición de la visita.
--     screening → setea patients.code (IVRS) si se pasó. randomizacion → si p_randomized,
--     fija enrollments.randomization_date = real_date de la visita (dispara la generación).
create or replace function public.mark_ready_with_outcome(
  p_visit_id uuid, p_ivrs text default null, p_randomized boolean default null
) returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_protocol uuid; v_enrollment uuid; v_patient uuid; v_role text; v_real date;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  select e.protocol_id, e.id, e.patient_id, vd.role, pv.real_date
    into v_protocol, v_enrollment, v_patient, v_role, v_real
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
    left join public.visit_definitions vd on vd.id = pv.visit_def_id
   where pv.id = p_visit_id;
  if v_protocol is null then raise exception 'Visita inexistente' using errcode='23503'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso' using errcode='42501';
  end if;

  update public.patient_visits set ready_at = coalesce(ready_at, now()) where id = p_visit_id;

  if v_role = 'screening' and nullif(btrim(coalesce(p_ivrs,'')),'') is not null then
    update public.patients set code = btrim(p_ivrs) where id = v_patient;   -- unique → 23505 si choca
  elsif v_role = 'randomizacion' and p_randomized is true then
    update public.enrollments set randomization_date = coalesce(v_real, current_date)
     where id = v_enrollment;     -- dispara trg_generate_visits → genera las 'automatica'
  end if;
end; $$;
revoke all on function public.mark_ready_with_outcome(uuid, text, boolean) from public;
grant execute on function public.mark_ready_with_outcome(uuid, text, boolean) to authenticated;
```

- [ ] **Step 4: `register_visit_event` deja de anclar la randomización**

```sql
-- 4 · register_visit_event: quitar el seteo de randomization_date (ahora se fija al
--     cerrar la visita de rol 'randomizacion' vía mark_ready_with_outcome). Se recrea
--     el cuerpo de 0022/0025 SIN el bloque "if p_kind='randomizacion' then update...".
-- >>> El ejecutor: copiar register_visit_event de 0025 (firma con estimated_date) y borrar
-- >>> el bloque final que hace `update enrollments set randomization_date`.
```

> Copiar el cuerpo vigente de `register_visit_event` (migración 0025) y eliminar el `if p_kind = 'randomizacion' then update ... end if;`. Mantener las validaciones de sueltas (VNP/retest siguen igual).

```sql
notify pgrst, 'reload schema';
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0030_flujo_randomizacion.sql
git commit -m "feat(track): 0030 agendar libre + cierre clínico con IVRS/randomización"
```

## Task 6: Capa de datos — agendar desde definiciones + cierre con outcome

**Files:**
- Modify: `src/data/visitDefinitions.ts`
- Modify: `src/data/dayVisits.ts`

- [ ] **Step 1: `scheduleProtocolVisit` + hook de definiciones agendables**

En `visitDefinitions.ts`:
```ts
/** Definiciones LIBRES del protocolo (las que se agendan a mano), ordenadas. */
export function useSchedulableDefinitions(protocolId: string | null) {
  return useSupabaseQuery<VisitDefinition[]>(
    (c) => protocolId
      ? c.from('visit_definitions').select('*').eq('protocol_id', protocolId)
          .eq('date_mode', 'libre').order('sort_order', { ascending: true }).returns<VisitDefinition[]>()
      : Promise.resolve({ data: [], error: null }),
    [protocolId],
  )
}

export async function scheduleProtocolVisit(enrollmentId: string, visitDefId: string, date: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('schedule_protocol_visit', { p_enrollment_id: enrollmentId, p_visit_def_id: visitDefId, p_date: date })
  if (error) {
    if (error.code === '42501') return { error: 'No tenés permiso para agendar esta visita.' }
    return { error: error.message }
  }
  return { error: null }
}
```

- [ ] **Step 2: `markReadyWithOutcome` en dayVisits.ts**

```ts
export async function markReadyWithOutcome(
  visitId: string, opts: { ivrs?: string; randomized?: boolean },
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_ready_with_outcome', {
    p_visit_id: visitId,
    p_ivrs: opts.ivrs ?? null,
    p_randomized: opts.randomized ?? null,
  })
  if (error) {
    if (error.code === '23505') return { error: 'Ese número de IVRS ya está asignado a otro paciente.' }
    if (error.code === '42501') return { error: 'No tenés permiso.' }
    return { error: error.message }
  }
  return { error: null }
}
```
(Mantener `markReady` para visitas `role='comun'`.)

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck` → PASS.
```bash
git add src/data/visitDefinitions.ts src/data/dayVisits.ts
git commit -m "feat(track): capa de datos de agendar libre + cierre con outcome"
```

## Task 7: UI — agendar desde el cuadro + alerta al pasar a "Listo"

**Files:**
- Modify: `src/views/track/RegisterVisitFlow.tsx`
- Create: `src/views/track/ReadyOutcomeModal.tsx`
- Modify: `src/views/DayVisitsView.tsx`

- [ ] **Step 1: RegisterVisitFlow — elegir definición libre del protocolo**

Leer `RegisterVisitFlow.tsx` (hoy elige de `availableEventKinds`). Agregar, para visitas planificadas, un selector que liste `useSchedulableDefinitions(protocolId)` (V1 Screening, V2 Randomización…) → al confirmar llama `scheduleProtocolVisit(enrollmentId, def.id, date)`. Mantener VNP/retest por el camino viejo (`registerVisitEvent`). Ajustar a la firma real del componente (recibe `enrollmentId`, `protocolId`?, `accentSolid`, `onClose`, `onDone`).

- [ ] **Step 2: ReadyOutcomeModal — la alerta de cierre**

```tsx
import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'

/** Alerta al pasar a "Listo para irse" según el rol de la visita (screening/randomizacion). */
export function ReadyOutcomeModal({ role, accentSolid, onClose, onConfirm }: {
  role: 'screening' | 'randomizacion'
  accentSolid: string
  onClose: () => void
  onConfirm: (opts: { ivrs?: string; randomized?: boolean }) => Promise<{ error: string | null }>
}) {
  const [ivrsAssigned, setIvrsAssigned] = useState(false)
  const [ivrs, setIvrs] = useState('')
  const [randomized, setRandomized] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = role === 'screening'
    ? (!ivrsAssigned || ivrs.trim() !== '')
    : randomized !== null

  const confirm = async () => {
    setBusy(true); setError(null)
    const res = await onConfirm(role === 'screening'
      ? { ivrs: ivrsAssigned ? ivrs.trim() : undefined }
      : { randomized: randomized ?? false })
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onClose()
  }

  return (
    <Modal title={role === 'screening' ? 'Cierre de screening' : 'Cierre de randomización'} onClose={onClose} maxWidth={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {role === 'screening' ? (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
              <input type="checkbox" checked={ivrsAssigned} onChange={(e) => setIvrsAssigned(e.target.checked)} />
              ¿El IVRS te asignó número de paciente?
            </label>
            {ivrsAssigned && (
              <FormField label="Número de IVRS">
                <input value={ivrs} onChange={(e) => setIvrs(e.target.value)} className="spira-mono" style={fieldInput} />
              </FormField>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 13.5 }}>¿El paciente randomizó?</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setRandomized(true)} style={{ ...(randomized === true ? btnPrimary(accentSolid) : btnOutline) }}>Sí</button>
              <button type="button" onClick={() => setRandomized(false)} style={{ ...(randomized === false ? btnPrimary(accentSolid) : btnOutline) }}>No</button>
            </div>
          </div>
        )}
        {error && <div style={{ fontSize: 13, color: 'var(--spira-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" style={btnOutline} onClick={onClose}>Cancelar</button>
          <button type="button" style={{ ...btnPrimary(accentSolid), opacity: busy || !valid ? 0.6 : 1 }} disabled={busy || !valid} onClick={() => void confirm()}>
            {busy ? 'Guardando…' : 'Confirmar y marcar listo'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 3: Enganchar en DayVisitsView (advance a 'listo')**

En `DayVisitsView.tsx`, en `advance()` (línea ~70, donde hace `next === 'listo' ? await markReady(visit.id)`): si la visita tiene `visit.role === 'screening' || visit.role === 'randomizacion'`, en vez de `markReady` directo, **abrir `ReadyOutcomeModal`** y, al confirmar, llamar `markReadyWithOutcome(visit.id, opts)` + refetch. Para `role` común o sueltas, mantener `markReady`. (Agregar estado local `readyOutcome: DayVisitRow | null`.)

- [ ] **Step 4: Typecheck + build + commit**

Run: `npm run build` → PASS.
```bash
git add src/views/track/RegisterVisitFlow.tsx src/views/track/ReadyOutcomeModal.tsx src/views/DayVisitsView.tsx
git commit -m "feat(track): agendar desde el cuadro + alerta IVRS/randomización al cerrar"
```

## Task 8: Verificación SQL + QA

**Files:**
- Create: `supabase/scripts/2026-06-21-cuadro-verificacion.sql`

- [ ] **Step 1: Script de verificación**

```sql
-- Verificación del cuadro completo. Correr en el SQL Editor (0029 + 0030 aplicadas).
-- 1) generación toma solo 'automatica':
select public.sync_protocol_schedule('<PROTOCOL_ID>', false);  -- creates debería contar solo automaticas
-- 2) role/date_mode visibles:
select visit_code, role, date_mode from public.v_track_visits where protocol_id = '<PROTOCOL_ID>' limit 20;
-- 3) confirmar que mark_ready_with_outcome con p_randomized=true fija la fecha y genera:
--    (manual, sobre una visita role='randomizacion' atendida) — ver enrollments.randomization_date y patient_visits programadas.
```

- [ ] **Step 2: QA en browser (gstack /browse, con /setup-browser-cookies)**

Definir un cuadro (V1 Screening libre/screening, V2 Randomización libre/randomizacion, V3+ tratamiento automatica). Enrolar TEST-*. Agendar V1 → "Listo" → cargar IVRS → ver `code`. Agendar V2 → "Listo" → "Sí randomizó" → ver V3+ generadas y "Próximas visitas" > 0. Probar "No randomizó" → recitar V2.

- [ ] **Step 3: Commit**

```bash
git add supabase/scripts/2026-06-21-cuadro-verificacion.sql
git commit -m "test(track): verificación del cuadro completo"
```

---

## Self-Review (cobertura del spec)

- Modelo: `role` + `date_mode` en definiciones → Task 1-3 ✓
- Generación solo `automatica` + guard por-def → Task 1 ✓
- Vistas exponen `role`/`date_mode` → Task 1-2 ✓
- Display "código - nombre" (13 puntos) + burbuja = número → Task 4 ✓
- Agendar desde definiciones (libre) → Task 5-7 ✓
- Confirmación en "Listo": IVRS (screening) / ¿randomizó? (rando → fecha + genera) → Task 5-7 ✓
- Reintentos (singleton no aplica a programada) → Task 5 ✓
- `register_visit_event` deja de anclar la rando → Task 5 ✓
- Constraint relajada para libres-programadas → Task 5 ✓
- Verificación (typecheck + SQL + browser) → cada task + Task 8 ✓
- Fuera de alcance (anchor relativo, ventanas pre-rando, IVRS múltiple, reescritura VNP/retest) → NO incluidos ✓

## Migración de datos legacy (a decidir al ejecutar Fase 2)

Sueltas legacy de `kind='screening'/'randomizacion'` (de pacientes que se conservan): convertir a `kind='programada'` + `visit_def_id` de la def correspondiente del cuadro, vía script acotado review-first; o dejarlas legacy (se muestran con `KIND_LABELS`). Decidir por protocolo según el estado real.
