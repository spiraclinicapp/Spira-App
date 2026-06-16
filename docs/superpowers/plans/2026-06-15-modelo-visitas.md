# Modelo de visitas (pre/post randomización) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar las visitas de Track en una sola tabla `patient_visits` con un campo `kind`, de modo que se registren visitas sueltas pre-randomización (firma/screening/firma_screening/vnp) y, al registrar la Randomización, se ancle y genere el cronograma del protocolo; post-rando se registran las programadas + extras (vnp/retest). Toda visita lleva checklist.

**Architecture:** Enfoque A de la spec `docs/superpowers/specs/2026-06-15-modelo-visitas-design.md`. Las sueltas son filas de `patient_visits` con `kind <> 'programada'`, `visit_def_id`/ventana nulos y `real_date` cargado. Las programadas las sigue generando el trigger de 0021 cuando se setea `enrollments.randomization_date` (lo hace el RPC al registrar la randomización). `v_patient_visits` calcula el estado igual (las sueltas caen en estado-por-checklist porque tienen `real_date`). `v_track_visits` pasa a `left join` y expone `kind`.

**Tech Stack:** PostgreSQL/Supabase (RLS + SECURITY DEFINER), React 19 + TS strict + Vite. **Sin framework de tests**: la verificación es `npm run build` (tsc + vite), aplicar la migración + queries de verificación en el SQL Editor, y el preview MCP (login con la cuenta demo, navegar, leer estilos/estado). El usuario aplica las migraciones a mano.

**Verificación previa a cada commit:** `cd "Spira App" && npm run build` debe terminar en `✓ built`. Las migraciones se entregan al usuario para aplicar; la verificación en vivo va después de que confirme.

---

## Estructura de archivos

**Crear:**
- `supabase/migrations/0022_visitas_unificadas.sql` — enum `visit_kind`, columna `kind`, aflojar columnas + check, recrear `v_patient_visits`/`v_track_visits`, extender `materialize_checklist`, drop `enrollments.screening_date`, RPC `register_visit_event`, policy DELETE de sueltas.
- `src/data/visitEvents.ts` — `registerVisitEvent`, `editVisitEvent`, `deleteVisitEvent` + tipo `VisitKind` y labels.
- `src/views/track/RegisterVisitFlow.tsx` — modal único de "Registrar visita" (selector de tipo por etapa).

**Modificar:**
- `src/data/visits.ts` — `TrackVisitRow += kind`; `visit_def_id/estimated_date/window_*` nullables; `visit_type` nullable.
- `src/data/patients.ts` — sacar `screening_date` del embed y de `PatientEnrollment`; sacar `EnrollmentDatesInput`/`updateEnrollmentDates`; `NewPatientInput` sin `screening_date`/`randomization_date`; `createPatientWithEnrollment` → RPC v5.
- `src/views/NewPatientForm.tsx` — sacar campos de fecha de estudio.
- `src/views/EditPatientForm.tsx` — sacar sección "Datos del estudio" + props/estado relacionados.
- `src/views/PatientFichaView.tsx` — quitar props de fecha a EditPatientForm; integrar el nuevo "Registrar visita" por etapa; mostrar sueltas.
- `src/lib/visits.ts` — `KIND_LABELS`; ajustar `currentVisit`/`prevCurrentNext`/`adherence`/`orderVisits` para considerar `kind` (adherencia solo `programada`; orden por fecha).
- `src/views/track/PdVisitFlow.tsx` y `PdFullSchedule.tsx` — etiquetar sueltas por `kind`, ordenar por fecha.
- `supabase/README.md`, `docs/bitacora/2026-06-15.md` — índice 0022 + bitácora.

**Reusar sin tocar la lógica:** `generate_patient_visits` (0021), `registerVisit`/`rescheduleVisit`, checklists.

---

## Fase 1 — Migración 0022 (base de datos)

### Task 1: Escribir la migración 0022

**Files:**
- Create: `supabase/migrations/0022_visitas_unificadas.sql`

- [ ] **Step 1: Escribir el archivo completo**

```sql
-- Spira · Migración 0022 — Visitas unificadas (kind + sueltas pre-randomización)
-- Ver spec: docs/superpowers/specs/2026-06-15-modelo-visitas-design.md (enfoque A).
-- Idempotente donde se puede; recrea vistas (orden: track depende de patient_visits).

-- 1 · enum + columna kind
do $$ begin
  if not exists (select 1 from pg_type where typname = 'visit_kind') then
    create type visit_kind as enum
      ('programada','firma','screening','firma_screening','randomizacion','vnp','retest');
  end if;
end $$;
alter table public.patient_visits add column if not exists kind visit_kind not null default 'programada';

-- 2 · aflojar columnas para las sueltas + check de consistencia
alter table public.patient_visits
  alter column visit_def_id   drop not null,
  alter column estimated_date drop not null,
  alter column window_start   drop not null,
  alter column window_end     drop not null;

alter table public.patient_visits drop constraint if exists patient_visits_kind_shape;
alter table public.patient_visits add constraint patient_visits_kind_shape check (
  (kind =  'programada' and visit_def_id is not null and estimated_date is not null
     and window_start is not null and window_end is not null)
  or
  (kind <> 'programada' and visit_def_id is null)
);

-- 3 · recrear vistas para exponer kind (v_patient_visits usa pv.* → recrear;
--     v_track_visits depende de ella → dropear primero).
drop view if exists public.v_track_visits;
drop view if exists public.v_patient_visits;

create view public.v_patient_visits with (security_invoker = true) as
select
  pv.*,
  ( case
      when pv.real_date is null and current_date > pv.window_end           then 'ventana_vencida'
      when pv.real_date is null and (pv.estimated_date - current_date) > 7 then 'futura'
      when pv.real_date is null                                            then 'proxima'
      when exists (
        select 1 from public.checklist_items ci
        left join public.checklist_completions cc on cc.item_id = ci.id
        where ci.visit_id = pv.id and ci.mandatory and cc.id is null
          and now() > ((pv.real_date::timestamp + (ci.deadline_hours * interval '1 hour'))
                       at time zone 'America/Argentina/Buenos_Aires')
      ) then 'item_vencido'
      when exists (
        select 1 from public.checklist_items ci
        left join public.checklist_completions cc on cc.item_id = ci.id
        where ci.visit_id = pv.id and ci.mandatory and cc.id is null
      ) then 'realizada'
      else 'completa'
    end )::visit_status as computed_status
from public.patient_visits pv;
comment on view public.v_patient_visits is 'patient_visits + estado calculado al leer (no almacenado).';
revoke all on public.v_patient_visits from anon;
grant select on public.v_patient_visits to authenticated;

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
  v.kind
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id;
comment on view public.v_track_visits is 'Visita (programada o suelta) + def + protocolo + paciente. security_invoker.';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;

-- 4 · materialize_checklist también al INSERTAR una visita ya realizada (sueltas)
create or replace function public.materialize_checklist()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_protocol_id uuid; v_template_id uuid;
begin
  if new.real_date is not null and (tg_op = 'INSERT' or old.real_date is null) then
    if exists (select 1 from public.checklist_items where visit_id = new.id) then
      return new;
    end if;
    select e.protocol_id into v_protocol_id from public.enrollments e where e.id = new.enrollment_id;
    select id into v_template_id from public.checklist_templates
      where protocol_id = v_protocol_id order by created_at limit 1;
    if v_template_id is null then
      select id into v_template_id from public.checklist_templates
        where protocol_id is null order by created_at limit 1;
    end if;
    if v_template_id is not null then
      insert into public.checklist_items (visit_id, template_item_id, description, deadline_hours, mandatory, sort_order)
      select new.id, ti.id, ti.description, ti.deadline_hours, ti.mandatory, ti.sort_order
      from public.checklist_template_items ti where ti.template_id = v_template_id;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_materialize_checklist on public.patient_visits;
create trigger trg_materialize_checklist
  after insert or update on public.patient_visits
  for each row execute function public.materialize_checklist();

-- 5 · screening_date ya no se usa (el screening es una visita suelta)
alter table public.enrollments drop column if exists screening_date;

-- 6 · RPC: registrar una visita SUELTA (valida reglas + authz + ancla la rando)
create or replace function public.register_visit_event(
  p_enrollment_id uuid, p_kind visit_kind, p_date date, p_notes text default null
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_protocol uuid; v_rando date; v_visit uuid;
  v_has_firma boolean; v_has_screening boolean;
begin
  if v_uid is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if p_kind = 'programada' then raise exception 'Las visitas programadas no se crean por acá' using errcode='check_violation'; end if;
  if p_date is null then raise exception 'La fecha es obligatoria' using errcode='23502'; end if;

  select e.protocol_id, e.randomization_date into v_protocol, v_rando
    from public.enrollments e where e.id = p_enrollment_id;
  if v_protocol is null then raise exception 'Enrolamiento inexistente' using errcode='23503'; end if;

  if not (public.has_module('gerencia') or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso para registrar visitas de este paciente' using errcode='42501';
  end if;

  if v_rando is not null then
    if p_kind not in ('vnp','retest') then
      raise exception 'Después de la randomización solo se registran VNP o Retest' using errcode='check_violation';
    end if;
  else
    if p_kind = 'retest' then
      raise exception 'Retest es solo post-randomización' using errcode='check_violation';
    end if;
    if p_kind in ('firma','screening','firma_screening','randomizacion')
       and exists (select 1 from public.patient_visits where enrollment_id=p_enrollment_id and kind=p_kind) then
      raise exception 'Esa visita ya está registrada' using errcode='check_violation';
    end if;
    if p_kind in ('firma','screening')
       and exists (select 1 from public.patient_visits where enrollment_id=p_enrollment_id and kind='firma_screening') then
      raise exception 'Ya hay una visita de Firma y Screening' using errcode='check_violation';
    end if;
    if p_kind = 'firma_screening'
       and exists (select 1 from public.patient_visits where enrollment_id=p_enrollment_id and kind in ('firma','screening')) then
      raise exception 'Ya hay Firma o Screening por separado' using errcode='check_violation';
    end if;
    if p_kind = 'randomizacion' then
      select exists (select 1 from public.patient_visits where enrollment_id=p_enrollment_id and kind in ('firma','firma_screening')),
             exists (select 1 from public.patient_visits where enrollment_id=p_enrollment_id and kind in ('screening','firma_screening'))
        into v_has_firma, v_has_screening;
      if not (v_has_firma and v_has_screening) then
        raise exception 'Para randomizar tiene que haber firma y screening previos' using errcode='check_violation';
      end if;
    end if;
  end if;

  insert into public.patient_visits (enrollment_id, kind, real_date, notes)
  values (p_enrollment_id, p_kind, p_date, nullif(btrim(coalesce(p_notes,'')),''))
  returning id into v_visit;

  if p_kind = 'randomizacion' then
    update public.enrollments set randomization_date = p_date where id = p_enrollment_id;
  end if;

  return v_visit;
end; $$;
revoke all on function public.register_visit_event(uuid, visit_kind, date, text) from public;
grant execute on function public.register_visit_event(uuid, visit_kind, date, text) to authenticated;

-- 7 · borrar una visita SUELTA (no programada ni randomización). Editar usa la
--     policy de UPDATE existente ("track modifica visitas propias").
drop policy if exists "track borra visitas sueltas" on public.patient_visits;
create policy "track borra visitas sueltas" on public.patient_visits for delete using (
  kind <> 'programada' and kind <> 'randomizacion'
  and (public.has_module('gerencia') or exists (
    select 1 from public.enrollments e
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
    where e.id = patient_visits.enrollment_id and pc.user_id = auth.uid()))
);

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Actualizar el índice del README**

En `supabase/README.md`, agregar al final de la tabla:
```markdown
| 0022 | `visitas_unificadas.sql` | modelo de visitas unificado: columna `kind` en `patient_visits` (programada + sueltas), vistas con `kind`/left join, checklist en inserción, RPC `register_visit_event`, drop `enrollments.screening_date` |
```

- [ ] **Step 3: Commit**

```bash
cd "Spira App" && git add supabase/migrations/0022_visitas_unificadas.sql supabase/README.md
git commit -m "feat(db): migracion 0022 — visitas unificadas (kind + sueltas + RPC register_visit_event)"
```

- [ ] **Step 4: Entregar el SQL al usuario para aplicar en el SQL Editor.** No continuar la verificación en vivo hasta que confirme. Query de verificación a incluir:
```sql
select column_name, is_nullable from information_schema.columns
 where table_name='patient_visits' and column_name in ('kind','visit_def_id','window_start');  -- kind NO, resto YES
select proname from pg_proc where proname='register_visit_event';  -- 1 fila
```

---

## Fase 2 — Reverts del front (alta + edición sin fechas de estudio)

### Task 2: RPC de alta v5 + data layer de pacientes

**Files:**
- Modify: `src/data/patients.ts`
- Create (en la misma migración 0022 ya entregada, o nota): el RPC v5 va en una migración aparte si se quiere; **para este plan, el alta deja de mandar las fechas** y se acepta que el RPC v4 las ignore si llegan null. (Si se prefiere v5 estricto, ver nota al pie.)

- [ ] **Step 1:** En `src/data/patients.ts`, sacar de `PatientEnrollment` los campos `screening_date` y `randomization_date`… **PERO mantener `randomization_date`** (se usa para saber la etapa en la UI). Resultado:

```ts
export interface PatientEnrollment {
  id: string
  enrollment_date: string
  /** Ancla del cronograma / flag de etapa (null = pre-rando). Migración 0021. */
  randomization_date: string | null
  protocol: PatientProtocol | null
}
```

- [ ] **Step 2:** En `usePatients`, el embed: sacar `screening_date`, dejar `randomization_date`:
```ts
.select('id, code, full_name, status, birth_date, sex, fertility, treating_physician, enrollments(id, enrollment_date, randomization_date, protocol:protocols(id, code, name))')
```

- [ ] **Step 3:** En `NewPatientInput`, sacar `screening_date` y `randomization_date`. En `createPatientWithEnrollment`, dejar de pasarlos (no incluir `p_screening_date`/`p_randomization_date`). **Nota:** el RPC v4 (0021) los tiene con `default null`, así que omitirlos es válido. La randomización nunca se setea por el alta.

- [ ] **Step 4:** Sacar `EnrollmentDatesInput` y `updateEnrollmentDates` (ya no se usan; las fechas son visitas).

- [ ] **Step 5:** Verificar y commitear:
```bash
cd "Spira App" && npm run build   # ✓ built
git add src/data/patients.ts && git commit -m "refactor(track): sacar fechas de estudio del data layer de pacientes"
```

### Task 3: NewPatientForm sin fechas de estudio

**Files:**
- Modify: `src/views/NewPatientForm.tsx`

- [ ] **Step 1:** Sacar los estados `screeningDate`/`randomizationDate`, sus `FormField` (Fecha de screening / Fecha de randomización), y el aviso "Con la randomización cargada…". El bloque "Opcionales" queda con IVRS + Médico tratante. En el `submit`, sacar `screening_date`/`randomization_date` del objeto que se pasa a `createPatientWithEnrollment`.

- [ ] **Step 2:** Verificar + commit:
```bash
cd "Spira App" && npm run build
git add src/views/NewPatientForm.tsx && git commit -m "refactor(track): alta de paciente sin fechas de estudio (ahora son visitas)"
```

### Task 4: EditPatientForm sin "Datos del estudio"

**Files:**
- Modify: `src/views/EditPatientForm.tsx`, `src/views/PatientFichaView.tsx`

- [ ] **Step 1:** En `EditPatientForm.tsx`: sacar props `enrollmentId`/`screeningDate`/`randomizationDate`, los estados `screening`/`randomization`, la sección "Datos del estudio" (divider + inputs de fecha), el aviso `willGenerateVisits`, y la llamada a `updateEnrollmentDates` en `doSave` (queda solo `updatePatient`). El IVRS opcional y el type-to-confirm quedan igual. Sacar el import de `updateEnrollmentDates`.

- [ ] **Step 2:** En `PatientFichaView.tsx`: en el render de `EditPatientForm` sacar `enrollmentId`/`screeningDate`/`randomizationDate` (queda `patient`, `accentSolid`, `onClose`, `onUpdated`). La condición `modal === 'edit' && enrollment` puede quedar como `modal === 'edit'`.

- [ ] **Step 3:** Verificar + commit:
```bash
cd "Spira App" && npm run build
git add src/views/EditPatientForm.tsx src/views/PatientFichaView.tsx
git commit -m "refactor(track): editar paciente sin seccion de fechas de estudio"
```

---

## Fase 3 — Registrar visitas sueltas

### Task 5: TrackVisitRow += kind (nullables)

**Files:**
- Modify: `src/data/visits.ts`

> **Orden:** este task importa `VisitKind` de `src/data/visitEvents.ts` (Task 6). Hacer la **Task 6 primero** (o commitear ambos juntos) para que el build pase.

- [ ] **Step 1:** En `TrackVisitRow`: `visit_def_id: string | null`, `estimated_date: string | null`, `window_start: string | null`, `window_end: string | null`, `visit_type: VisitType | null`, `visit_name: string | null`, `visit_code: string | null` (ya era null), `sort_order: number | null`, `offset_days: number | null`; agregar `kind: VisitKind` (importar el tipo de `./visitEvents`). Revisar los usos que asumían no-null (la mayoría son display; los que comparen fechas deben tolerar null — ver Task 8).

- [ ] **Step 2:** Verificar + commit (puede fallar el build por usos null → se arreglan en Task 8/9; commitear junto si conviene). Si el build no pasa solo, dejar este cambio para el mismo commit que Task 8.

### Task 6: Data layer de eventos (`visitEvents.ts`)

**Files:**
- Create: `src/data/visitEvents.ts`

- [ ] **Step 1:** Escribir:
```ts
import { supabase } from '../lib/supabase'

/** Tipo de visita (enum visit_kind, migración 0022). */
export type VisitKind = 'programada' | 'firma' | 'screening' | 'firma_screening' | 'randomizacion' | 'vnp' | 'retest'

/** Etiqueta legible por tipo (para tracker y selector). */
export const KIND_LABELS: Record<VisitKind, string> = {
  programada: 'Programada',
  firma: 'Firma',
  screening: 'Screening',
  firma_screening: 'Firma y Screening',
  randomizacion: 'Randomización',
  vnp: 'VNP',
  retest: 'Retest',
}

function eventError(code?: string, raw?: string): string {
  if (code === '42501') return raw || 'No tenés permiso para registrar esta visita.'
  if (code === '23502') return 'La fecha es obligatoria.'
  return raw || 'No pudimos registrar la visita. Probá de nuevo.'
}

/** Registra una visita suelta (firma/screening/…/vnp/retest). Si es randomización,
 *  setea el ancla y genera el cronograma. Reglas validadas server-side. */
export async function registerVisitEvent(
  enrollmentId: string, kind: VisitKind, date: string, notes: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('register_visit_event', {
    p_enrollment_id: enrollmentId, p_kind: kind, p_date: date, p_notes: notes,
  })
  if (error) return { error: eventError(error.code, error.message) }
  return { error: null }
}

/** Edita fecha/nota de una visita suelta (UPDATE directo; RLS de track). */
export async function editVisitEvent(
  id: string, date: string, notes: string | null,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('patient_visits')
    .update({ real_date: date, notes }).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar esta visita.' }
  return { error: null }
}

/** Borra una visita suelta (policy DELETE acotada a kind <> programada/randomizacion). */
export async function deleteVisitEvent(id: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('patient_visits').delete().eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'No se pudo borrar (¿es una visita programada o no tenés permiso?).' }
  return { error: null }
}
```

- [ ] **Step 2:** `npm run build` (debería pasar). Commit:
```bash
git add src/data/visitEvents.ts && git commit -m "feat(track): data layer de visitas sueltas (registerVisitEvent/edit/delete)"
```

### Task 7: Modal "Registrar visita" por etapa (`RegisterVisitFlow.tsx`)

**Files:**
- Create: `src/views/track/RegisterVisitFlow.tsx`

- [ ] **Step 1:** Componente con un `Modal` que recibe `enrollmentId`, `randomizationDate` (string|null para saber etapa), la lista de `kinds` ya usados (para filtrar singletons), `nextScheduled` (la próxima `programada` pendiente, opcional, para el caso post-rando), `accentSolid`, `onClose`, `onDone`. Lógica:
  - Calcular `allowedKinds`:
    - pre-rando (`randomizationDate == null`): empezar de `['firma','screening','firma_screening','vnp','randomizacion']`; sacar los singletons ya usados; si existe `firma_screening`, sacar `firma`+`screening`; si existe `firma` o `screening`, sacar `firma_screening`; dejar `randomizacion` **solo** si firma-satisfecha && screening-satisfecha.
    - post-rando: `['vnp','retest']` (+ la opción "Registrar V_next" que marca la programada).
  - Campos: `<select>` de tipo (labels de `KIND_LABELS`), `<input type=date>` (default hoy), `<textarea>` nota.
  - Submit:
    - si la opción es "programada" (post-rando, registrar la próxima): `registerVisit(nextScheduled.id, date)`.
    - si no: `registerVisitEvent(enrollmentId, kind, date, notes)`.
  - Errores en callout; al ok → `onDone()`.

- [ ] **Step 2:** `npm run build`. Commit:
```bash
git add src/views/track/RegisterVisitFlow.tsx && git commit -m "feat(track): modal Registrar visita con selector de tipo por etapa"
```

### Task 8: Integrar el flujo en la ficha + helpers

**Files:**
- Modify: `src/views/PatientFichaView.tsx`, `src/lib/visits.ts`

- [ ] **Step 1 (lib/visits):** Agregar al ordenar/calcular:
  - `orderVisits`: ordenar por fecha efectiva `real_date ?? estimated_date` ascendente (las sueltas por `real_date`).
  - `adherence`: denominador = visitas con `kind === 'programada'`; numerador = esas con `real_date`. Las sueltas no cuentan.
  - `currentVisit`/`prevCurrentNext`: operar **solo sobre `kind === 'programada'`** (el tracker de "anterior/actual/próxima" es del cronograma). Las sueltas se listan aparte como historial.
  - Tolerar `estimated_date`/`offset_days` null (usar `real_date` cuando falte).

- [ ] **Step 2 (PatientFichaView):** Reemplazar `RegisterVisitModal`/`modal==='register'` por `RegisterVisitFlow`. El botón "Registrar visita" del header abre el flow siempre (pre y post). Calcular `randomizationDate = enrollment?.randomization_date ?? null`, `usedKinds = rows.map(r => r.kind)`, `nextScheduled = currentVisit(programadas)`. Pasar a `RegisterVisitFlow`. En `onDone`: `visitsQ.refetch()`.

- [ ] **Step 3:** `npm run build` (acá deben quedar resueltos los null de Task 5). Commit:
```bash
git add src/lib/visits.ts src/views/PatientFichaView.tsx src/data/visits.ts
git commit -m "feat(track): registrar visitas sueltas desde la ficha + helpers por kind"
```

---

## Fase 4 — Tracker de la ficha muestra sueltas

### Task 9: PdVisitFlow / PdFullSchedule con kind

**Files:**
- Modify: `src/views/track/PdVisitFlow.tsx`, `src/views/track/PdFullSchedule.tsx`

- [ ] **Step 1:** Donde se muestra "Visita N"/nombre, para `kind !== 'programada'` usar `KIND_LABELS[kind]` en vez del nombre de definición; ordenar la lista por fecha efectiva. Las sueltas se ven como pelotitas "realizadas" (siempre tienen real_date) con su label. Las programadas siguen igual.

- [ ] **Step 2:** `npm run build`. Commit:
```bash
git add src/views/track/PdVisitFlow.tsx src/views/track/PdFullSchedule.tsx
git commit -m "feat(track): tracker de la ficha muestra visitas sueltas por tipo"
```

---

## Verificación en vivo (después de aplicar 0022)

Con la cuenta demo, en el preview:
1. Crear un paciente nuevo (sin fechas en el alta). Aparece sin visitas, "Sin IVRS" si no se cargó.
2. En la ficha, "Registrar visita" → Firma → Screening → intentar Randomización antes de tenerlas (debe bloquear) → con firma+screening, Randomización OK → aparece el cronograma anclado en esa fecha.
3. Registrar una `programada`; cambiar a VNP/Retest (no consume la programada).
4. Verificar que cada visita registró su checklist.
5. Editar/borrar una suelta; intentar borrar la randomización (debe estar bloqueado).
6. Adherencia cuenta solo programadas.

---

## Fase 2 (futuro, fuera de este plan)
Tracker del **Detalle de Protocolo** (`PdPatientRow`): mostrar sueltas para pacientes pre-rando (hoy diría "sin cronograma todavía").

---

## Nota: RPC de alta v5 estricto (opcional)
Si se quiere impedir por completo que el alta reciba fechas de estudio (en vez de omitirlas), agregar a 0022 un `drop function … (text,text,uuid,date,text,text,text,date,date)` + recrear `create_patient_with_enrollment` sin `p_screening_date`/`p_randomization_date`, y ajustar `createPatientWithEnrollment` a la nueva firma. No es necesario para la correctitud (el front ya no las manda), pero cierra la puerta a randomizar-en-alta por API.
