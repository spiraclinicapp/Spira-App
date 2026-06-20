# Cronograma del protocolo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir definir el cronograma de visitas de cada protocolo dentro de la app y generar/actualizar las visitas programadas de los pacientes randomizados a partir de él (cierra el bug "Próximas visitas: 0").

**Architecture:** SQL-céntrico. CRUD de `visit_definitions` por RLS directa (gerencia/track-admin). Una RPC `SECURITY DEFINER` `sync_protocol_schedule(protocol_id, apply)` calcula y (opcionalmente) aplica el plan crear/mover/borrar sobre las visitas programadas, sin tocar las atendidas. UI en el Detalle de Protocolo.

**Tech Stack:** Vite + React 19 + TypeScript (strict) · Supabase (PostgreSQL + RLS) · CSS variables. Sin framework de tests → verificación por `tsc --noEmit`, script SQL de verificación, y QA en browser (gstack `/browse`).

**Spec:** `docs/superpowers/specs/2026-06-20-cronograma-protocolo-design.md`

---

## Notas para el ejecutor

- **No hay runner de tests.** Donde el template TDD pediría "escribir test que falle", acá se
  reemplaza por: para SQL, agregar el caso al script `2026-06-20-cronograma-verificacion.sql`
  y correrlo en el SQL Editor; para front, `npm run typecheck` + QA en browser.
- **Migraciones se aplican A MANO en prod** (sin acceso SQL programático). El commit incluye el
  archivo `0026`; aplicarlo es un paso manual del usuario.
- Helpers RLS existentes: `public.has_module('gerencia')`, `public.has_min_role('track','admin')`.
- Convención del repo: lecturas = hook `useXxx` con `useSupabaseQuery`; mutaciones = función
  `async` (RPC o `.from().update()`); tipos a mano; errores PG → mensaje sereno; "0 filas = sin permiso".

---

## Task 1: Migración 0026 — RLS de escritura sobre `visit_definitions`

**Files:**
- Create: `supabase/migrations/0026_protocol_schedule.sql`

- [ ] **Step 1: Confirmar el estado actual de RLS de visit_definitions**

En el SQL Editor (o `supabase db dump`), verificar si RLS está activa y si hay policy de SELECT:
```sql
select relrowsecurity from pg_class where relname = 'visit_definitions';
select polname, polcmd from pg_policy
 where polrelid = 'public.visit_definitions'::regclass;
```
Expected: anotar si `relrowsecurity` es true/false y qué policies existen. Esto decide si hay
que agregar una policy de SELECT (si RLS está activa y las vistas leen vía security_invoker,
ya debería haber acceso; si no, agregarla).

- [ ] **Step 2: Escribir la cabecera de la migración + RLS de escritura**

```sql
-- Spira · Migración 0026 — Gestión del cronograma del protocolo
-- Ver spec: docs/superpowers/specs/2026-06-20-cronograma-protocolo-design.md
-- RLS de escritura sobre visit_definitions + RPCs sync_protocol_schedule / delete_visit_definition.
-- ============================================================================

alter table public.visit_definitions enable row level security;

-- Lectura: si NO existe ya una policy de select (ver Step 1), habilitarla para autenticados.
-- (Las vistas security_invoker la necesitan; idempotente.)
drop policy if exists "ver visit_definitions" on public.visit_definitions;
create policy "ver visit_definitions" on public.visit_definitions for select
  using (auth.uid() is not null);

-- Escritura: gerencia o track-admin gestionan el cronograma del protocolo.
drop policy if exists "gestiona visit_definitions (insert)" on public.visit_definitions;
create policy "gestiona visit_definitions (insert)" on public.visit_definitions for insert
  with check (public.has_module('gerencia') or public.has_min_role('track','admin'));

drop policy if exists "gestiona visit_definitions (update)" on public.visit_definitions;
create policy "gestiona visit_definitions (update)" on public.visit_definitions for update
  using (public.has_module('gerencia') or public.has_min_role('track','admin'))
  with check (public.has_module('gerencia') or public.has_min_role('track','admin'));

-- El DELETE pasa por delete_visit_definition (SECURITY DEFINER, Task 3); no se da policy
-- de delete directo para forzar la regla de integridad (bloquear si hay atendidas).
```

- [ ] **Step 3: Auditar visit_definitions (espejo de 0022/0023)**

```sql
drop trigger if exists trg_audit_visit_definitions on public.visit_definitions;
create trigger trg_audit_visit_definitions
  after insert or update or delete on public.visit_definitions
  for each row execute function public.audit_row();
```

- [ ] **Step 4: Verificar sintaxis aplicando en el SQL Editor (entorno de prueba)**

Run: pegar el archivo hasta acá en el SQL Editor.
Expected: sin errores. (No commitear todavía; se commitea junto con Tasks 2-3.)

---

## Task 2: Migración 0026 — RPC `sync_protocol_schedule`

**Files:**
- Modify: `supabase/migrations/0026_protocol_schedule.sql` (append)

- [ ] **Step 1: Escribir la RPC (preview + apply en una sola función)**

```sql
-- Reconciliación del cronograma: calcula (apply=false) o aplica (apply=true) el plan
-- crear/mover/borrar de las visitas PROGRAMADAS de los pacientes randomizados del protocolo,
-- contra sus visit_definitions. NUNCA toca las atendidas (real_date no nulo).
create or replace function public.sync_protocol_schedule(p_protocol_id uuid, p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_creates int; v_moves int; v_deletes int; v_attended_div int;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')) then
    raise exception 'No tenés permiso para gestionar el cronograma' using errcode='42501';
  end if;

  -- Conteos del plan (dry-run). CTEs reutilizadas conceptualmente; acá solo para contar.
  with desired as (
    select e.id as enrollment_id, vd.id as visit_def_id,
           (e.randomization_date + vd.offset_days) as estimated_date,
           (e.randomization_date + vd.offset_days - vd.window_minus) as window_start,
           (e.randomization_date + vd.offset_days + vd.window_plus)  as window_end
    from public.enrollments e
    join public.visit_definitions vd on vd.protocol_id = e.protocol_id
    where e.protocol_id = p_protocol_id and e.status = 'activo'
      and e.randomization_date is not null
  ),
  existing as (
    select pv.id, pv.enrollment_id, pv.visit_def_id, pv.estimated_date,
           pv.window_start, pv.window_end, pv.real_date
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
    where e.protocol_id = p_protocol_id and pv.kind = 'programada'
  )
  select
    (select count(*) from desired d
       left join existing x on x.enrollment_id=d.enrollment_id and x.visit_def_id=d.visit_def_id
      where x.id is null),
    (select count(*) from existing x join desired d
       on d.enrollment_id=x.enrollment_id and d.visit_def_id=x.visit_def_id
      where x.real_date is null and (x.estimated_date is distinct from d.estimated_date
        or x.window_start is distinct from d.window_start
        or x.window_end is distinct from d.window_end)),
    (select count(*) from existing x
       left join desired d on d.enrollment_id=x.enrollment_id and d.visit_def_id=x.visit_def_id
      where d.enrollment_id is null and x.real_date is null),
    (select count(*) from existing x join desired d
       on d.enrollment_id=x.enrollment_id and d.visit_def_id=x.visit_def_id
      where x.real_date is not null and x.estimated_date is distinct from d.estimated_date)
  into v_creates, v_moves, v_deletes, v_attended_div;

  if p_apply then
    -- CREAR
    insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end)
    select e.id, vd.id, 'programada',
           e.randomization_date + vd.offset_days,
           e.randomization_date + vd.offset_days - vd.window_minus,
           e.randomization_date + vd.offset_days + vd.window_plus
    from public.enrollments e
    join public.visit_definitions vd on vd.protocol_id = e.protocol_id
    where e.protocol_id = p_protocol_id and e.status='activo' and e.randomization_date is not null
      and not exists (
        select 1 from public.patient_visits pv
        where pv.enrollment_id = e.id and pv.kind='programada' and pv.visit_def_id = vd.id);

    -- MOVER (solo no atendidas)
    update public.patient_visits pv
       set estimated_date = e.randomization_date + vd.offset_days,
           window_start   = e.randomization_date + vd.offset_days - vd.window_minus,
           window_end     = e.randomization_date + vd.offset_days + vd.window_plus
    from public.enrollments e, public.visit_definitions vd
    where pv.enrollment_id = e.id and pv.visit_def_id = vd.id
      and e.protocol_id = p_protocol_id and pv.kind='programada' and pv.real_date is null
      and (pv.estimated_date is distinct from e.randomization_date + vd.offset_days
        or pv.window_start  is distinct from e.randomization_date + vd.offset_days - vd.window_minus
        or pv.window_end    is distinct from e.randomization_date + vd.offset_days + vd.window_plus);

    -- BORRAR las programadas huérfanas no atendidas (su def ya no existe)
    delete from public.patient_visits pv
    using public.enrollments e
    where pv.enrollment_id = e.id and e.protocol_id = p_protocol_id
      and pv.kind='programada' and pv.real_date is null
      and not exists (select 1 from public.visit_definitions vd where vd.id = pv.visit_def_id);
  end if;

  return jsonb_build_object('creates', v_creates, 'moves', v_moves,
    'deletes', v_deletes, 'attended_divergent', v_attended_div, 'applied', p_apply);
end; $$;
revoke all on function public.sync_protocol_schedule(uuid, boolean) from public;
grant execute on function public.sync_protocol_schedule(uuid, boolean) to authenticated;
comment on function public.sync_protocol_schedule is
  'Calcula (apply=false) o aplica (apply=true) crear/mover/borrar de visitas programadas vs visit_definitions. No toca atendidas. gerencia/track-admin. SECURITY DEFINER.';
```

- [ ] **Step 2: Verificar que el dry-run no escribe**

Run en SQL Editor (con un protocolo real): `select public.sync_protocol_schedule('<protocol_id>', false);`
Expected: devuelve `{creates, moves, deletes, attended_divergent, applied:false}` y `select count(*) from patient_visits` NO cambia.

---

## Task 3: Migración 0026 — RPC `delete_visit_definition`

**Files:**
- Modify: `supabase/migrations/0026_protocol_schedule.sql` (append)

- [ ] **Step 1: Escribir la RPC de borrado con la regla de integridad**

```sql
-- Borra una definición de visita: bloquea si tiene visitas ATENDIDAS que la referencien;
-- si no, borra sus programadas no atendidas y luego la definición (atómico).
create or replace function public.delete_visit_definition(p_def_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_protocol uuid; v_attended int;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  select protocol_id into v_protocol from public.visit_definitions where id = p_def_id;
  if v_protocol is null then raise exception 'Definición inexistente' using errcode='23503'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')) then
    raise exception 'No tenés permiso para gestionar el cronograma' using errcode='42501';
  end if;
  select count(*) into v_attended
    from public.patient_visits where visit_def_id = p_def_id and real_date is not null;
  if v_attended > 0 then
    raise exception 'No se puede quitar una visita que ya ocurrió (% atendidas)', v_attended
      using errcode='check_violation';
  end if;
  delete from public.patient_visits where visit_def_id = p_def_id and real_date is null;
  delete from public.visit_definitions where id = p_def_id;
end; $$;
revoke all on function public.delete_visit_definition(uuid) from public;
grant execute on function public.delete_visit_definition(uuid) to authenticated;
comment on function public.delete_visit_definition is
  'Borra una visit_definition: bloquea si tiene visitas atendidas; si no, borra sus programadas no atendidas y la definición. gerencia/track-admin. SECURITY DEFINER.';
```

- [ ] **Step 2: Cerrar la migración**

```sql
notify pgrst, 'reload schema';
```

- [ ] **Step 3: Commit de la migración**

```bash
git add supabase/migrations/0026_protocol_schedule.sql
git commit -m "feat(track): migración 0026 — RLS + RPCs del cronograma del protocolo"
```

---

## Task 4: Capa de datos — `src/data/visitDefinitions.ts`

**Files:**
- Create: `src/data/visitDefinitions.ts`

- [ ] **Step 1: Tipos + hook de lectura**

```ts
import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import type { VisitType } from './visits'

export interface VisitDefinition {
  id: string
  protocol_id: string
  code: string
  name: string
  visit_type: VisitType
  offset_days: number
  window_minus: number
  window_plus: number
  sort_order: number
  dispenses: boolean
}

/** Definiciones (cronograma) de un protocolo, ordenadas. */
export function useProtocolDefinitions(protocolId: string | null) {
  return useSupabaseQuery<VisitDefinition[]>(
    (c) =>
      protocolId
        ? c.from('visit_definitions').select('*').eq('protocol_id', protocolId)
            .order('sort_order', { ascending: true }).returns<VisitDefinition[]>()
        : Promise.resolve({ data: [], error: null }),
    [protocolId],
  )
}
```

- [ ] **Step 2: CRUD (insert/update directo, delete + reorder)**

```ts
export interface DefinitionInput {
  code: string
  name: string
  visit_type: VisitType
  offset_days: number
  window_minus: number
  window_plus: number
  dispenses: boolean
}

export async function createDefinition(
  protocolId: string, input: DefinitionInput, sortOrder: number,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('visit_definitions')
    .insert({ ...input, protocol_id: protocolId, sort_order: sortOrder }).select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar el cronograma.' }
  return { error: null }
}

export async function updateDefinition(
  id: string, input: DefinitionInput,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('visit_definitions')
    .update(input).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar el cronograma.' }
  return { error: null }
}

export async function deleteDefinition(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_visit_definition', { p_def_id: id })
  if (error) {
    if (error.code === '42501') return { error: 'No tenés permiso para editar el cronograma.' }
    return { error: error.message } // incluye el mensaje "no se puede quitar una visita que ya ocurrió"
  }
  return { error: null }
}

/** Reordena: persiste el sort_order de cada id en su nueva posición. */
export async function reorderDefinitions(ids: string[]): Promise<{ error: string | null }> {
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase.from('visit_definitions')
      .update({ sort_order: i }).eq('id', ids[i])
    if (error) return { error: error.message }
  }
  return { error: null }
}
```

- [ ] **Step 3: Preview / apply del sync**

```ts
export interface SchedulePlan {
  creates: number
  moves: number
  deletes: number
  attended_divergent: number
  applied: boolean
}

async function callSync(protocolId: string, apply: boolean): Promise<{ plan: SchedulePlan | null; error: string | null }> {
  const { data, error } = await supabase.rpc('sync_protocol_schedule', { p_protocol_id: protocolId, p_apply: apply })
  if (error) {
    if (error.code === '42501') return { plan: null, error: 'No tenés permiso para gestionar el cronograma.' }
    return { plan: null, error: error.message }
  }
  return { plan: data as SchedulePlan, error: null }
}

export const previewScheduleSync = (protocolId: string) => callSync(protocolId, false)
export const applyScheduleSync   = (protocolId: string) => callSync(protocolId, true)
```

- [ ] **Step 4: Typecheck + commit**

Run: `npm run typecheck` → Expected: PASS (exit 0).
```bash
git add src/data/visitDefinitions.ts
git commit -m "feat(track): capa de datos del cronograma (CRUD + sync)"
```

---

## Task 5: UI — `ScheduleDefinitionForm.tsx` (alta/edición de una visita)

**Files:**
- Create: `src/views/track/ScheduleDefinitionForm.tsx`

- [ ] **Step 1: Form en Modal (sigue el patrón de EditPatientForm/NewProtocolForm)**

```tsx
import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { FormField } from '../../components/FormField'
import { btnPrimary, btnOutline } from '../../components/buttons'
import type { VisitDefinition, DefinitionInput } from '../../data/visitDefinitions'
import type { VisitType } from '../../data/visits'

const TYPES: { value: VisitType; label: string }[] = [
  { value: 'presencial', label: 'Presencial' }, { value: 'telefonica', label: 'Telefónica' },
]

export function ScheduleDefinitionForm({ initial, accentSolid, onClose, onSubmit }: {
  initial: VisitDefinition | null
  accentSolid: string
  onClose: () => void
  onSubmit: (input: DefinitionInput) => Promise<{ error: string | null }>
}) {
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [visitType, setVisitType] = useState<VisitType>(initial?.visit_type ?? 'presencial')
  const [offset, setOffset] = useState(String(initial?.offset_days ?? 0))
  const [wMinus, setWMinus] = useState(String(initial?.window_minus ?? 0))
  const [wPlus, setWPlus] = useState(String(initial?.window_plus ?? 0))
  const [dispenses, setDispenses] = useState(initial?.dispenses ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true); setError(null)
    const res = await onSubmit({
      code: code.trim(), name: name.trim(), visit_type: visitType,
      offset_days: Number(offset), window_minus: Number(wMinus),
      window_plus: Number(wPlus), dispenses,
    })
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onClose()
  }

  return (
    <Modal title={initial ? 'Editar visita del cronograma' : 'Nueva visita del cronograma'} onClose={onClose} maxWidth={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FormField label="Código"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="V1" /></FormField>
        <FormField label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Visita 1" /></FormField>
        <FormField label="Tipo">
          <select value={visitType} onChange={(e) => setVisitType(e.target.value as VisitType)}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </FormField>
        <FormField label="Día (offset desde randomización)"><input type="number" value={offset} onChange={(e) => setOffset(e.target.value)} /></FormField>
        <div style={{ display: 'flex', gap: 12 }}>
          <FormField label="Ventana − (días)"><input type="number" min="0" value={wMinus} onChange={(e) => setWMinus(e.target.value)} /></FormField>
          <FormField label="Ventana + (días)"><input type="number" min="0" value={wPlus} onChange={(e) => setWPlus(e.target.value)} /></FormField>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
          <input type="checkbox" checked={dispenses} onChange={(e) => setDispenses(e.target.checked)} /> Entrega medicación
        </label>
        {error && <div style={{ fontSize: 13, color: 'var(--spira-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={btnOutline} onClick={onClose}>Cancelar</button>
          <button style={{ ...btnPrimary, background: accentSolid }} disabled={busy || !code.trim() || !name.trim()} onClick={submit}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → Expected: PASS. (Ajustar imports de `btnPrimary`/`FormField` a las firmas reales del repo si difieren.)

---

## Task 6: UI — `ScheduleSyncModal.tsx` (preview + aplicar)

**Files:**
- Create: `src/views/track/ScheduleSyncModal.tsx`

- [ ] **Step 1: Modal que muestra el plan y aplica**

```tsx
import { useEffect, useState } from 'react'
import { Modal } from '../../components/Modal'
import { btnPrimary, btnOutline } from '../../components/buttons'
import { previewScheduleSync, applyScheduleSync } from '../../data/visitDefinitions'
import type { SchedulePlan } from '../../data/visitDefinitions'

export function ScheduleSyncModal({ protocolId, accentSolid, onClose, onApplied }: {
  protocolId: string
  accentSolid: string
  onClose: () => void
  onApplied: () => void
}) {
  const [plan, setPlan] = useState<SchedulePlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    previewScheduleSync(protocolId).then((res) => {
      if (!active) return
      if (res.error) setError(res.error); else setPlan(res.plan)
      setLoading(false)
    })
    return () => { active = false }
  }, [protocolId])

  const apply = async () => {
    setBusy(true); setError(null)
    const res = await applyScheduleSync(protocolId)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onApplied(); onClose()
  }

  const nothing = plan && plan.creates === 0 && plan.moves === 0 && plan.deletes === 0

  return (
    <Modal title="Generar / actualizar cronograma" onClose={onClose} maxWidth={460}>
      {loading ? (
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>Calculando cambios…</div>
      ) : error ? (
        <div style={{ fontSize: 13.5, color: 'var(--spira-danger)' }}>{error}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {nothing ? (
            <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>El cronograma ya está al día. No hay cambios.</div>
          ) : (
            <ul style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
              <li><b>{plan!.creates}</b> visitas a crear</li>
              <li><b>{plan!.moves}</b> visitas a mover (no atendidas)</li>
              <li><b>{plan!.deletes}</b> visitas a borrar (no atendidas)</li>
              {plan!.attended_divergent > 0 && (
                <li style={{ color: 'var(--spira-warn)' }}>{plan!.attended_divergent} atendidas difieren del cronograma (se dejan intactas)</li>
              )}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button style={btnOutline} onClick={onClose}>Cancelar</button>
            <button style={{ ...btnPrimary, background: accentSolid }} disabled={busy || nothing} onClick={apply}>
              {busy ? 'Aplicando…' : 'Aplicar'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` → Expected: PASS.

---

## Task 7: UI — `ScheduleEditor.tsx` (tabla + acciones) e integración

**Files:**
- Create: `src/views/track/ScheduleEditor.tsx`
- Modify: `src/views/ProtocolDetailView.tsx`

- [ ] **Step 1: Componente editor (tabla de definiciones + botones)**

```tsx
import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { btnPrimary, btnOutline } from '../../components/buttons'
import {
  useProtocolDefinitions, createDefinition, updateDefinition, deleteDefinition,
} from '../../data/visitDefinitions'
import type { VisitDefinition, DefinitionInput } from '../../data/visitDefinitions'
import { ScheduleDefinitionForm } from './ScheduleDefinitionForm'
import { ScheduleSyncModal } from './ScheduleSyncModal'

export function ScheduleEditor({ protocolId, accent, accentSolid, canEdit }: {
  protocolId: string; accent: string; accentSolid: string; canEdit: boolean
}) {
  const defs = useProtocolDefinitions(protocolId)
  const [editing, setEditing] = useState<VisitDefinition | null | 'new'>(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rows = defs.data ?? []

  const onSubmit = async (input: DefinitionInput) => {
    if (editing === 'new') return createDefinition(protocolId, input, rows.length)
    if (editing) return updateDefinition(editing.id, input)
    return { error: 'Estado inválido.' }
  }
  const onDelete = async (d: VisitDefinition) => {
    setError(null)
    const res = await deleteDefinition(d.id)
    if (res.error) { setError(res.error); return }
    defs.refetch()
  }

  if (defs.loading) return <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>Cargando cronograma…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 16 }}>Cronograma</span>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnOutline} onClick={() => setSyncing(true)} disabled={rows.length === 0}>Generar / actualizar</button>
            <button style={{ ...btnPrimary, background: accentSolid }} onClick={() => setEditing('new')}>+ Visita</button>
          </div>
        )}
      </div>
      {error && <div style={{ fontSize: 13, color: 'var(--spira-danger)' }}>{error}</div>}

      {rows.length === 0 ? (
        <EmptyState accent={accent} icon="calendar" title="Sin cronograma"
          description="Agregá las visitas (V1, V2…) para generarlo en los pacientes randomizados." />
      ) : (
        <div>
          {rows.map((d) => (
            <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 90px 90px 110px auto', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--spira-line)', fontSize: 13.5 }}>
              <span className="spira-mono">{d.code}</span>
              <span>{d.name}</span>
              <span style={{ color: 'var(--spira-muted)' }}>día {d.offset_days}</span>
              <span style={{ color: 'var(--spira-muted)' }}>−{d.window_minus}/+{d.window_plus}</span>
              <span style={{ color: 'var(--spira-muted)' }}>{d.visit_type === 'telefonica' ? 'Telefónica' : 'Presencial'}{d.dispenses ? ' · dispensa' : ''}</span>
              {canEdit && (
                <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button style={btnOutline} onClick={() => setEditing(d)}><Icon name="edit" size={14} /></button>
                  <button style={btnOutline} onClick={() => onDelete(d)}><Icon name="trash" size={14} /></button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ScheduleDefinitionForm
          initial={editing === 'new' ? null : editing}
          accentSolid={accentSolid}
          onClose={() => { setEditing(null); defs.refetch() }}
          onSubmit={onSubmit}
        />
      )}
      {syncing && (
        <ScheduleSyncModal protocolId={protocolId} accentSolid={accentSolid}
          onClose={() => setSyncing(false)} onApplied={() => defs.refetch()} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Montar en ProtocolDetailView**

Leer `src/views/ProtocolDetailView.tsx`, localizar dónde se muestran las secciones del protocolo y el control de permisos (debe existir un `hasMinRole`/`useAuth`). Insertar:
```tsx
import { ScheduleEditor } from './track/ScheduleEditor'
// ...dentro del render, en una card/sección nueva:
<ScheduleEditor
  protocolId={protocol.id}
  accent={accent}
  accentSolid={accentSolid}
  canEdit={hasMinRole('track', 'admin') || hasModule('gerencia')}
/>
```
Ajustar nombres (`protocol.id`, `accent`, `hasMinRole`/`hasModule`) a los que ya use ese archivo.

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck` → Expected: PASS.
```bash
git add src/views/track/ScheduleEditor.tsx src/views/track/ScheduleDefinitionForm.tsx src/views/track/ScheduleSyncModal.tsx src/views/ProtocolDetailView.tsx
git commit -m "feat(track): UI del cronograma del protocolo (editor + preview/apply)"
```

---

## Task 8: Verificación SQL + QA + backfill

**Files:**
- Create: `supabase/scripts/2026-06-20-cronograma-verificacion.sql`

- [ ] **Step 1: Script de verificación**

```sql
-- Verificación del sync del cronograma. Correr en el SQL Editor con un protocolo de prueba.
-- 1) dry-run no escribe:
select public.sync_protocol_schedule('<PROTOCOL_ID>', false);  -- ver counts
-- (verificar que count(*) de patient_visits no cambió)
-- 2) aplicar y comprobar que crea/mueve sin tocar atendidas:
select count(*) filter (where real_date is not null) as atendidas_antes
  from public.patient_visits pv join public.enrollments e on e.id=pv.enrollment_id
  where e.protocol_id='<PROTOCOL_ID>' and pv.kind='programada';
select public.sync_protocol_schedule('<PROTOCOL_ID>', true);
select count(*) filter (where real_date is not null) as atendidas_despues
  from public.patient_visits pv join public.enrollments e on e.id=pv.enrollment_id
  where e.protocol_id='<PROTOCOL_ID>' and pv.kind='programada';
-- atendidas_antes == atendidas_despues (no se tocaron)
-- 3) borrar definición con atendidas bloquea:
-- select public.delete_visit_definition('<DEF_CON_ATENDIDAS>');  -- debe dar check_violation
```

- [ ] **Step 2: QA en browser (gstack /browse)**

Aplicar la migración 0026 en prod (manual). Luego, logueado:
- Detalle de Protocolo → Cronograma → agregar V1 (día 0), V2 (día 7, ventana ±3).
- "Generar / actualizar" → preview muestra creates > 0 → Aplicar.
- Ir a Resumen de Track → "Próximas visitas (7 días)" ahora debe ser > 0 (si algún paciente cae en la ventana).
- Ir a Agenda → ver las visitas generadas.

- [ ] **Step 3: Backfill de los protocolos actuales**

Por cada protocolo con pacientes randomizados: definir su cronograma real y correr "Generar / actualizar". (Esto resuelve los 12 randomizados sin cronograma.)

- [ ] **Step 4: Commit del script**

```bash
git add supabase/scripts/2026-06-20-cronograma-verificacion.sql
git commit -m "test(track): script de verificación del cronograma"
```

---

## Self-Review (cobertura del spec)

- Modelo sin cambios → Tasks usan `visit_definitions` tal cual ✓
- RLS escritura gerencia/track-admin → Task 1 ✓
- RPC sync preview/apply, no toca atendidas → Task 2 ✓
- Regla de borrado (bloquea atendidas) → Task 3 ✓
- CRUD + reorder → Task 4 ✓
- UI editor + preview en Detalle de Protocolo → Tasks 5-7 ✓
- Migración 0026 manual + backfill de los 12 → Tasks 1-3, 8 ✓
- Verificación (typecheck + SQL + browser) → cada task + Task 8 ✓
- Fuera de alcance (sueltas que no vencen, real_date futuro, cierre del día) → NO incluidos (correcto) ✓
