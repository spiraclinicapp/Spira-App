# Checklist con reporte + edición en el modal — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los ítems del checklist se puedan editar en el lugar (plantilla y modal de visita) y que, como propiedad del tipo, marquen si generan un reporte y su demora, con una alerta persistente hasta marcarlo listo.

**Architecture:** Dos columnas nuevas en la plantilla del checklist (`has_report`, `report_eta_hours`), materializadas al ítem de cada visita; un estado "reporte listo" por visita en tabla propia (`checklist_report_ready`, aparte del tilde de completado); y una vista dedicada `v_report_alerts` que alimenta una alerta persistente en campana + Alertas. Front en 4 fases sobre la capa de datos existente (`templates.ts`, `dayVisits.ts`) y las vistas de Track.

**Tech Stack:** React 18 + TypeScript strict (Vite), Supabase (PostgREST + RLS + RPC), CSS con tokens (`src/styles/tokens.css`), íconos Lucide vía `components/Icon.tsx`, dropdowns vía `components/SearchableSelect.tsx`. Sin react-router/react-query. **Sin suite de tests.**

**Spec:** [`docs/superpowers/specs/2026-07-21-checklist-reportes-y-edicion-design.md`](../specs/2026-07-21-checklist-reportes-y-edicion-design.md)

## Global Constraints

Toda tarea hereda estas reglas (de `CLAUDE.md` y del spec):

- **No hay tests.** La verificación de cada tarea es `npm run typecheck` **verde** + verificación en el preview (login QA) cuando el cambio se vea en el navegador. No afirmar "anda" sin eso. (Esto sustituye el ciclo TDD por defecto de la skill: `CLAUDE.md` manda.)
- **Migraciones inmutables y contiguas.** El archivo va con el **siguiente número contiguo** tras la última mergeada a **main** (probablemente `0063`, pero **`git fetch` + confirmar**; en la rama de la carga hay un hueco en 0061). CI (`scripts/check-migraciones.mjs`) exige contigüidad + fila en el índice de `supabase/README.md`. **Ramificar de main**, no de `feat/carga-visitas-historicas`.
- **Sin acceso SQL a prod.** La migración la aplica **a mano el Director**; tiene que correr tal cual, sin placeholders `<...>`, legacy-safe (columnas nullable / `default false`).
- **Working copy compartido.** Verificar rama antes de cada commit; **stagear por ruta** (nunca `git add -A`/`.`); `git fetch` antes de razonar sobre el remoto.
- **RLS filtra en silencio:** tras `update`/`delete`/`insert` directo, **0 filas = sin permiso**, no éxito. Traducir a mensaje sereno en castellano.
- **`report_eta_hours` es independiente de `deadline_hours`** (dos relojes: reporte vs. tilde). No mezclarlos.
- **Estilo:** castellano rioplatense en copy/comentarios; tokens CSS (sin Tailwind); `SearchableSelect` para desplegables (sin texto libre); tipos a mano por archivo de `data/` citando la migración.
- **Auditable:** la tabla nueva se audita con `audit_row()`; `ready_by`/`completed_by` con default `auth.uid()` (anti-spoofing), nunca desde el cliente.
- **Commits:** terminar el mensaje con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `supabase/migrations/00NN_checklist_reportes.sql` | **Crear** — todo el schema (cols + tabla + RLS + audit + materialize + vista) | 1 |
| `supabase/README.md` | **Modificar** — fila del índice de migraciones | 1 |
| `src/lib/checklist.ts` | **Crear** — presets/labels compartidos (`REPORT_ETA_OPTIONS`, `reportEtaLabel`, `DEADLINE_OPTIONS`, `deadlineLabel`) | 2 |
| `src/data/templates.ts` | **Modificar** — `has_report`/`report_eta_hours` en tipos + select + create/update | 2 |
| `src/views/TemplatesView.tsx` | **Modificar** — campos de reporte en `ItemForm` + píldora en la fila | 2 |
| `src/data/dayVisits.ts` | **Modificar** — tipo + hook (3ª consulta) + `setReportReady` + `updateChecklistItem` | 3, 4 |
| `src/views/track/VisitChecklist.tsx` | **Modificar** — estado del reporte + marcar listo (T3) + edición inline (T4) | 3, 4 |
| `src/data/reports.ts` | **Crear** — `useReportAlerts()` sobre `v_report_alerts` | 5 |
| `src/views/TrackAlertsView.tsx` | **Modificar** — sumar la fuente de alertas de reporte | 5 |
| `src/shell/NotificationsMenu.tsx` | **Modificar** — sumar reportes al feed + al badge | 5 |

---

## Task 1: Migración de schema (00NN_checklist_reportes.sql)

**Files:**
- Create: `supabase/migrations/00NN_checklist_reportes.sql` (NN = siguiente contiguo tras main)
- Modify: `supabase/README.md` (índice de migraciones)

**Interfaces:**
- Produces (para las tareas de front):
  - `checklist_template_items.has_report boolean`, `.report_eta_hours integer`
  - `checklist_items.has_report boolean`, `.report_eta_hours integer`
  - tabla `checklist_report_ready(id, item_id, ready_by, ready_at, notes)` con `unique(item_id)`
  - vista `v_report_alerts(item_id, visit_id, description, report_eta_hours, real_date, report_due_at, protocol_id, patient_id, protocol_code, protocol_name, patient_code, patient_name, visit_name, visit_code)`

- [ ] **Step 1: `git fetch` y confirmar el número contiguo**

```bash
git fetch
git log origin/main --oneline -- supabase/migrations | head -3
ls supabase/migrations | sort | tail -3
```
Elegí `NN` = último número en **main** + 1 (probablemente `0063`). Si en el working copy hay un archivo con ese número de otra feature, coordiná con el Director — no reutilices ni renumeres uno ajeno.

- [ ] **Step 2: Escribir la migración**

Create `supabase/migrations/00NN_checklist_reportes.sql`:

```sql
-- 00NN_checklist_reportes.sql
-- Ítems de checklist con reporte (propiedad del tipo) + estado "reporte listo" por visita
-- (aparte del tilde) + fuente dedicada de alerta persistente de reporte pendiente.
-- Legacy-safe: columnas nullable / default false; tabla, índice y vista nuevos; no toca datos.
-- Spec: docs/superpowers/specs/2026-07-21-checklist-reportes-y-edicion-design.md

-- 1 · Campos de reporte en la PLANTILLA (propiedad del tipo de ítem).
alter table public.checklist_template_items
  add column if not exists has_report boolean not null default false;
alter table public.checklist_template_items
  add column if not exists report_eta_hours integer;
alter table public.checklist_template_items
  add constraint checklist_template_items_report_eta_chk
  check (report_eta_hours is null or report_eta_hours in (24, 48, 72, 168, 336, 720));
comment on column public.checklist_template_items.has_report is
  'El ítem genera un reporte (ej. laboratorio) que llega diferido. Propiedad del tipo. 00NN.';
comment on column public.checklist_template_items.report_eta_hours is
  'Demora estimada del reporte en horas (preset 24/48/72/168/336/720). Nullable; solo aplica si has_report. 00NN.';

-- 2 · Snapshot de esos campos en el ítem MATERIALIZADO de la visita.
alter table public.checklist_items
  add column if not exists has_report boolean not null default false;
alter table public.checklist_items
  add column if not exists report_eta_hours integer;
comment on column public.checklist_items.has_report is
  'Snapshot de checklist_template_items.has_report al materializar. 00NN.';
comment on column public.checklist_items.report_eta_hours is
  'Snapshot de checklist_template_items.report_eta_hours al materializar. 00NN.';

-- 3 · Estado "reporte listo" por visita (APARTE del tilde de completado). Calcado de
--     checklist_completions: unique(item_id), ready_by con default anti-spoofing, auditable.
create table if not exists public.checklist_report_ready (
  id         uuid primary key default uuid_generate_v4(),
  item_id    uuid not null references public.checklist_items(id) on delete cascade,
  ready_by   uuid not null default auth.uid() references public.users(id),
  ready_at   timestamptz not null default now(),
  notes      text,
  unique (item_id)
);
comment on table public.checklist_report_ready is
  'Reporte de un ítem marcado LISTO (firmado y evolucionado). Estado aparte del tilde. Auditable. 00NN.';

alter table public.checklist_report_ready enable row level security;

-- RLS: espejo de checklist_completions (0006:202-212 + 0023:262-263).
create policy "ver report_ready" on public.checklist_report_ready for select using (
  public.has_module('gerencia') or exists (
    select 1 from public.checklist_items ci
    where ci.id = checklist_report_ready.item_id and public.coordina_visita(ci.visit_id))
);
create policy "track marca report_ready" on public.checklist_report_ready for insert with check (
  ready_by = auth.uid() and (
    public.has_module('gerencia') or exists (
      select 1 from public.checklist_items ci
      where ci.id = checklist_report_ready.item_id and public.coordina_visita(ci.visit_id)))
);
create policy "track reabre report_ready" on public.checklist_report_ready for delete using (
  public.has_module('gerencia') or exists (
    select 1 from public.checklist_items ci
    where ci.id = checklist_report_ready.item_id and public.coordina_visita(ci.visit_id))
);

revoke all on public.checklist_report_ready from anon;
grant select, insert, delete on public.checklist_report_ready to authenticated;

-- Auditoría (espejo de trg_audit_checklist_completions, 0003:368).
create trigger trg_audit_checklist_report_ready
  after insert or update or delete on public.checklist_report_ready
  for each row execute function public.audit_row();

-- 4 · materialize_checklist: copiar también has_report / report_eta_hours al materializar.
--     Cuerpo idéntico al vigente (0022:89-111) + las dos columnas en el insert...select.
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
      insert into public.checklist_items
        (visit_id, template_item_id, description, deadline_hours, mandatory, sort_order,
         has_report, report_eta_hours)
      select new.id, ti.id, ti.description, ti.deadline_hours, ti.mandatory, ti.sort_order,
         ti.has_report, ti.report_eta_hours
      from public.checklist_template_items ti where ti.template_id = v_template_id;
    end if;
  end if;
  return new;
end; $$;
-- (No se recrea el trigger: create or replace conserva el binding trg_materialize_checklist.)

-- 5 · Fuente dedicada de alertas de reporte pendiente y vencido. security_invoker → RLS scopea.
--     Anclada a hora local AR, mismo criterio que 0049 (item_vencido).
create view public.v_report_alerts with (security_invoker = true) as
select
  ci.id            as item_id,
  ci.visit_id,
  ci.description,
  ci.report_eta_hours,
  pv.real_date,
  (pv.real_date::timestamp + (ci.report_eta_hours * interval '1 hour'))
     at time zone 'America/Argentina/Buenos_Aires'  as report_due_at,
  e.protocol_id, e.patient_id,
  pr.code as protocol_code, pr.name as protocol_name,
  pa.code as patient_code, pa.full_name as patient_name,
  vd.name as visit_name, vd.code as visit_code
from public.checklist_items ci
join public.patient_visits pv on pv.id = ci.visit_id
join public.enrollments e     on e.id = pv.enrollment_id
join public.protocols pr      on pr.id = e.protocol_id
join public.patients pa       on pa.id = e.patient_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
left join public.checklist_report_ready rr on rr.item_id = ci.id
where ci.has_report
  and ci.report_eta_hours is not null
  and pv.real_date is not null
  and rr.id is null
  and now() > (pv.real_date::timestamp + (ci.report_eta_hours * interval '1 hour'))
              at time zone 'America/Argentina/Buenos_Aires';
comment on view public.v_report_alerts is
  'Ítems con reporte que ya deberían haber llegado (visita hecha + pasó la ETA) y no están listos. Fuente de la alerta persistente. security_invoker → RLS scopea. 00NN.';
revoke all on public.v_report_alerts from anon;
grant select on public.v_report_alerts to authenticated;
```

- [ ] **Step 3: Agregar la fila al índice de `supabase/README.md`**

Insertá, en orden, después de la fila de la última migración existente:

```markdown
| 00NN | `checklist_reportes.sql` | ítems de checklist con reporte (`has_report`/`report_eta_hours` en plantilla+materializado) + tabla `checklist_report_ready` (estado "reporte listo" aparte del tilde, auditable) + `materialize_checklist` copia los campos + vista `v_report_alerts` (alerta persistente de reporte pendiente) |
```

- [ ] **Step 4: Verificar contigüidad e índice**

Run: `node scripts/check-migraciones.mjs`
Expected: sin salida de error / exit 0 (si tira "hueco o número repetido", el `NN` está mal → volvé al Step 1).

- [ ] **Step 5: Verificar que compila el resto**

Run: `npm run typecheck`
Expected: sin errores (la migración no cambia TS, pero confirma que nada quedó a medias).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00NN_checklist_reportes.sql supabase/README.md
git commit -m "feat(db): 00NN checklist con reporte (has_report/eta) + report_ready + v_report_alerts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> **Handoff al Director:** pasale el archivo para aplicar a mano en Supabase, en orden. Cuando confirme "aplicada", registrar en `supabase/README.md` el **Aplicada en prod (fecha)** del índice (lo vigila CI). Las Tareas 2–5 se pueden **escribir** sin la migración aplicada (typecheck no la necesita), pero la **verificación en preview** de cada fase requiere la migración ya en la base.

---

## Task 2: Fase A — Campos de reporte en la plantilla (`TemplatesView`)

**Files:**
- Create: `src/lib/checklist.ts`
- Modify: `src/data/templates.ts` (tipos + `useTemplateItems` + `createTemplateItem` + `updateTemplateItem`)
- Modify: `src/views/TemplatesView.tsx` (`ItemForm` + fila del ítem)

**Interfaces:**
- Consumes: columnas de la Tarea 1 (`checklist_template_items.has_report`, `.report_eta_hours`).
- Produces:
  - `REPORT_ETA_OPTIONS: { value: number; label: string }[]`, `reportEtaLabel(hours: number): string`, `DEADLINE_OPTIONS: { value: number; label: string }[]`, `deadlineLabel(hours: number): string` (en `src/lib/checklist.ts`).
  - `TemplateItem` y `TemplateItemInput` con `has_report: boolean` y `report_eta_hours: number | null`.

- [ ] **Step 1: Crear `src/lib/checklist.ts` (presets/labels compartidos)**

```ts
// Presets y etiquetas del checklist, compartidos entre Plantillas y el modal de la visita.
// (Antes duplicados en TemplatesView y VisitChecklist.)

/** Plazo del ítem (deadline_hours). 0 = al momento; check en DB: {0,48,168}. */
export const DEADLINE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Al momento' },
  { value: 48, label: '48 horas' },
  { value: 168, label: '7 días' },
]

/** deadline_hours → etiqueta humana. */
export function deadlineLabel(hours: number): string {
  return DEADLINE_OPTIONS.find((o) => o.value === hours)?.label ?? `${hours} h`
}

/** Demora estimada del reporte (report_eta_hours). Dropdown, sin texto libre. */
export const REPORT_ETA_OPTIONS: { value: number; label: string }[] = [
  { value: 24, label: '24 horas' },
  { value: 48, label: '48 horas (2 días)' },
  { value: 72, label: '72 horas (3 días)' },
  { value: 168, label: '7 días' },
  { value: 336, label: '14 días' },
  { value: 720, label: '30 días' },
]

/** report_eta_hours → etiqueta corta para píldoras ("~2 días" / "~48 h"). */
export function reportEtaLabel(hours: number): string {
  if (hours % 24 === 0) {
    const d = hours / 24
    return d === 1 ? '~1 día' : `~${d} días`
  }
  return `~${hours} h`
}
```

- [ ] **Step 2: Extender los tipos y las mutaciones en `src/data/templates.ts`**

En `interface TemplateItem` agregá (con comentario citando la migración):

```ts
  /** El ítem genera un reporte diferido (ej. laboratorio). Migración 00NN. */
  has_report: boolean
  /** Demora estimada del reporte en horas (preset); null si no genera reporte. Migración 00NN. */
  report_eta_hours: number | null
```

En `useTemplateItems`, agregá las columnas al select:

```ts
        .select('id, template_id, description, deadline_hours, mandatory, sort_order, has_report, report_eta_hours')
```

En `interface TemplateItemInput` agregá:

```ts
  has_report: boolean
  report_eta_hours: number | null
```

En `createTemplateItem`, sumá los campos al insert:

```ts
  const { error } = await supabase.from('checklist_template_items').insert({
    template_id: templateId,
    description: input.description,
    deadline_hours: input.deadline_hours,
    mandatory: input.mandatory,
    sort_order: sortOrder,
    has_report: input.has_report,
    report_eta_hours: input.report_eta_hours,
  })
```

En `updateTemplateItem`, sumá los campos al update:

```ts
    .update({
      description: input.description,
      deadline_hours: input.deadline_hours,
      mandatory: input.mandatory,
      has_report: input.has_report,
      report_eta_hours: input.report_eta_hours,
    })
```

- [ ] **Step 3: Campos de reporte en `ItemForm` (`src/views/TemplatesView.tsx`)**

Reemplazá el `DEADLINE_OPTIONS`/`deadlineLabel` locales por el import compartido (borrá las definiciones locales de arriba del archivo):

```ts
import { DEADLINE_OPTIONS, deadlineLabel, REPORT_ETA_OPTIONS, reportEtaLabel } from '../lib/checklist'
```

En `ItemForm`, sumá estado y controles. Estado nuevo:

```tsx
  const [hasReport, setHasReport] = useState(initial?.has_report ?? false)
  const [reportEta, setReportEta] = useState<number>(initial?.report_eta_hours ?? 48)
```

En `submit`, mandá los campos (ETA solo si `hasReport`):

```tsx
    onSave({
      description: desc,
      deadline_hours: deadline,
      mandatory,
      has_report: hasReport,
      report_eta_hours: hasReport ? reportEta : null,
    })
```

En el JSX del form, después del checkbox "Obligatorio", agregá el toggle de reporte y, condicional, el dropdown de ETA:

```tsx
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--spira-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        <input type="checkbox" checked={hasReport} onChange={(e) => setHasReport(e.target.checked)} />
        Genera un reporte
      </label>
      {hasReport && (
        <div style={{ width: 170, flex: '0 0 auto' }}>
          <SearchableSelect
            value={String(reportEta)}
            onChange={(v) => setReportEta(Number(v))}
            options={REPORT_ETA_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
            placeholder="Demora del reporte"
            entity="demora"
          />
        </div>
      )}
```

- [ ] **Step 4: Píldora "Reporte" en la fila del ítem (modo lectura)**

En el `return` de la fila (el bloque con la píldora de plazo y la de obligatorio), agregá —cuando `it.has_report`— una píldora sobria:

```tsx
                    {it.has_report && (
                      <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-primary)', background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', padding: '3px 9px', borderRadius: 'var(--spira-radius-pill)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Icon name="clipboardCheck" size={12} color="var(--spira-primary)" />
                        Reporte {it.report_eta_hours != null ? `· ${reportEtaLabel(it.report_eta_hours)}` : ''}
                      </span>
                    )}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 6: Verificar en preview** (requiere la migración aplicada por el Director)

Abrí `Track → Plantillas`, editá o creá un ítem, activá "Genera un reporte", elegí una demora, Guardá. Confirmá que la píldora "Reporte · ~2 días" aparece en la fila y que persiste al recargar. Verificá por snapshot/DOM (no por screenshot; ver `CLAUDE.md`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/checklist.ts src/data/templates.ts src/views/TemplatesView.tsx
git commit -m "feat(track): reporte por tipo de ítem en las plantillas de checklist

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Fase B — Ver y marcar reporte listo en el modal (`VisitChecklist`)

**Files:**
- Modify: `src/data/dayVisits.ts` (`VisitChecklistItem` + `useVisitChecklist` + `setReportReady`)
- Modify: `src/views/track/VisitChecklist.tsx` (row → contenedor con 2 acciones; estado del reporte + botón)

**Interfaces:**
- Consumes: `checklist_items.has_report/.report_eta_hours` y la tabla `checklist_report_ready` (Tarea 1); `reportEtaLabel` (Tarea 2).
- Produces: `setReportReady(itemId: string, ready: boolean): Promise<{ error: string | null }>`; `VisitChecklistItem` con `has_report`, `report_eta_hours`, `report_ready`, `report_ready_at`, `report_ready_by`.

- [ ] **Step 1: Extender `VisitChecklistItem` y el hook en `src/data/dayVisits.ts`**

En `interface VisitChecklistItem` sumá:

```ts
  /** Snapshot: el ítem genera un reporte diferido. Migración 00NN. */
  has_report: boolean
  /** Snapshot: demora estimada del reporte en horas; null si no genera. Migración 00NN. */
  report_eta_hours: number | null
  /** Reporte marcado LISTO (firmado y evolucionado). Estado aparte del tilde. Migración 00NN. */
  report_ready: boolean
  report_ready_at: string | null
  report_ready_by: string | null
```

Agregá el tipo de fila cruda de la tabla nueva (junto a `ChecklistCompletionRow`):

```ts
/** Fila cruda de checklist_report_ready para unir en el cliente. */
interface ReportReadyRow {
  item_id: string
  ready_at: string
  ready_by: string
}
```

En `useVisitChecklist`: (a) sumá las dos columnas al select de `checklist_items`; (b) sumá una **tercera consulta** a `checklist_report_ready` (misma técnica de unión en cliente que las completions, para respetar la RLS de cada tabla). Reemplazá el bloque desde el select de items hasta el `merged`:

```ts
      const itemsRes = await c
        .from('checklist_items')
        .select('id, visit_id, description, deadline_hours, mandatory, sort_order, has_report, report_eta_hours')
        .eq('visit_id', visitId)
        .order('sort_order', { ascending: true })
      if (itemsRes.error) return { data: null, error: itemsRes.error }
      const items = (itemsRes.data ?? []) as Omit<
        VisitChecklistItem,
        'completed' | 'completed_at' | 'completed_by' | 'report_ready' | 'report_ready_at' | 'report_ready_by'
      >[]
      if (items.length === 0) return { data: [], error: null }

      const ids = items.map((i) => i.id)
      const compRes = await c
        .from('checklist_completions')
        .select('item_id, completed_at, completed_by')
        .in('item_id', ids)
      if (compRes.error) return { data: null, error: compRes.error }
      const byItem = new Map<string, ChecklistCompletionRow>(
        ((compRes.data ?? []) as ChecklistCompletionRow[]).map((r) => [r.item_id, r]),
      )

      const readyRes = await c
        .from('checklist_report_ready')
        .select('item_id, ready_at, ready_by')
        .in('item_id', ids)
      if (readyRes.error) return { data: null, error: readyRes.error }
      const readyByItem = new Map<string, ReportReadyRow>(
        ((readyRes.data ?? []) as ReportReadyRow[]).map((r) => [r.item_id, r]),
      )

      const merged: VisitChecklistItem[] = items.map((i) => {
        const comp = byItem.get(i.id)
        const rr = readyByItem.get(i.id)
        return {
          ...i,
          completed: comp != null,
          completed_at: comp?.completed_at ?? null,
          completed_by: comp?.completed_by ?? null,
          report_ready: rr != null,
          report_ready_at: rr?.ready_at ?? null,
          report_ready_by: rr?.ready_by ?? null,
        }
      })
      return { data: merged, error: null }
```

- [ ] **Step 2: Mutación `setReportReady` en `src/data/dayVisits.ts`**

Debajo de `toggleChecklistItem`, agregá (mismo patrón "0 filas = sin permiso"):

```ts
/**
 * Marca (true) o reabre (false) el "reporte listo" (firmado y evolucionado) de un ítem.
 * Estado APARTE del tilde de completado (tabla checklist_report_ready, migración 00NN).
 * - listo:  insert (ready_by lo pone el default de la columna; lo exige la RLS).
 * - reabrir: delete por item_id.
 */
export async function setReportReady(itemId: string, ready: boolean): Promise<{ error: string | null }> {
  if (ready) {
    const { data, error } = await supabase
      .from('checklist_report_ready')
      .insert({ item_id: itemId })
      .select('id')
    if (error) return { error: error.message }
    if (!data || data.length === 0) return { error: 'No tenés permiso para marcar este reporte.' }
    return { error: null }
  }
  const { data, error } = await supabase
    .from('checklist_report_ready')
    .delete()
    .eq('item_id', itemId)
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'No tenés permiso para reabrir este reporte.' }
  return { error: null }
}
```

- [ ] **Step 3: Refactor de la fila en `VisitChecklist.tsx` (de `<button>` a contenedor)**

El ítem hoy es un `<button>` que togglea el completado. Para sumar una segunda acción (marcar reporte) sin anidar botones (HTML inválido), convertí la fila en un `<div>` con dos controles internos: el **tilde** (botón que ocupa el área del check + texto) y, para ítems con reporte, la **acción de reporte**. Importá el helper y los tipos nuevos arriba:

```tsx
import { reportEtaLabel } from '../../lib/checklist'
import { useVisitChecklist, toggleChecklistItem, setReportReady } from '../../data/dayVisits'
```

Sumá estado para la acción de reporte (junto a `pending`/`optimistic`):

```tsx
  const [reportPending, setReportPending] = useState<Set<string>>(new Set())
  const [reportOptimistic, setReportOptimistic] = useState<Record<string, boolean>>({})
```

Agregá el handler `onToggleReport` (espejo de `onToggle`, sobre `setReportReady`):

```tsx
  async function onToggleReport(item: VisitChecklistItem) {
    if (reportPending.has(item.id)) return
    const next = !(reportOptimistic[item.id] ?? item.report_ready)
    setActionError(null)
    setReportPending((s) => new Set(s).add(item.id))
    setReportOptimistic((o) => ({ ...o, [item.id]: next }))
    const { error: err } = await setReportReady(item.id, next)
    if (err) {
      setReportOptimistic((o) => { const c = { ...o }; delete c[item.id]; return c })
      setActionError(err)
    }
    setReportPending((s) => { const c = new Set(s); c.delete(item.id); return c })
    refetch()
    setReportOptimistic((o) => { const c = { ...o }; delete c[item.id]; return c })
  }
```

Reescribí el `items.map(...)` para que la fila sea un `<div>` con el tilde como botón interno y, debajo, la línea de estado del reporte + su botón. Reemplazá el `<button key={item.id} ...>...</button>` completo por:

```tsx
          const isDone = optimistic[item.id] ?? item.completed
          const isPending = pending.has(item.id)
          const reportReady = reportOptimistic[item.id] ?? item.report_ready
          const reportBusy = reportPending.has(item.id)
          return (
            <div
              key={item.id}
              style={{
                border: `1px solid ${isDone ? accent + '59' : 'var(--spira-line)'}`,
                background: isDone ? accent + '10' : 'var(--spira-white)',
                borderRadius: 12, padding: '4px 4px 4px 0',
              }}
            >
              {/* tilde de completado: botón que ocupa check + texto */}
              <button
                type="button" onClick={() => onToggle(item)} disabled={isPending}
                className="spira-no-press"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                  padding: '9px 9px 9px 13px', background: 'transparent', border: 'none',
                  cursor: isPending ? 'default' : 'pointer', opacity: isPending ? 0.6 : 1,
                  fontFamily: 'var(--spira-font-text)',
                }}
              >
                <span style={{ flex: '0 0 auto', width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center', border: `1.5px solid ${isDone ? accent : 'var(--spira-line-2)'}`, background: isDone ? accent : 'transparent' }}>
                  {isDone && <Icon name="check" size={13} color="var(--spira-on-accent)" stroke={2.4} />}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13.5, color: 'var(--spira-ink)', textDecoration: isDone ? 'line-through' : 'none', textDecorationColor: isDone ? 'var(--spira-faint)' : undefined }}>
                    {item.description}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 3, fontSize: 11.5, color: 'var(--spira-muted)' }}>
                    <Icon name="clock" size={12} color="var(--spira-faint)" />
                    {deadlineLabel(item.deadline_hours)}
                    {!item.mandatory && <span style={{ color: 'var(--spira-faint)' }}>· opcional</span>}
                  </span>
                </span>
                {item.mandatory && (
                  <span style={{ flex: '0 0 auto', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--spira-muted)', background: 'var(--spira-line)', padding: '2px 8px', borderRadius: 'var(--spira-radius-pill)' }}>
                    Obligatorio
                  </span>
                )}
              </button>

              {/* reporte: línea de estado + acción (solo ítems con reporte) */}
              {item.has_report && (
                <ReportRow
                  item={item} accent={accent} ready={reportReady} busy={reportBusy}
                  onToggle={() => onToggleReport(item)}
                />
              )}
            </div>
          )
```

Nota: `deadlineLabel` ahora viene del import compartido; borrá la copia local del archivo y sumala al import `from '../../lib/checklist'`.

- [ ] **Step 4: Sub-componente `ReportRow` en `VisitChecklist.tsx`**

Al final del archivo, agregá el sub-componente que muestra el estado (pendiente / vencido hace X / listo) y el botón:

```tsx
/** Línea de reporte de un ítem: estado (pendiente/vencido/listo) + acción de marcar/reabrir. */
function ReportRow({ item, accent, ready, busy, onToggle }: {
  item: VisitChecklistItem; accent: string; ready: boolean; busy: boolean; onToggle: () => void
}) {
  // "vencido" = pasó la ETA desde la fecha real de la visita y no está listo.
  const dueMs = item.real_date && item.report_eta_hours != null
    ? new Date(item.real_date).getTime() + item.report_eta_hours * 3600_000
    : null
  const overdue = !ready && dueMs != null && Date.now() > dueMs
  const label = ready
    ? 'Reporte listo'
    : overdue ? 'Reporte vencido' : 'Reporte pendiente'
  const color = ready ? 'var(--spira-good)' : overdue ? 'var(--spira-warn)' : 'var(--spira-muted)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 9px 8px 45px', flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color }}>
        <Icon name={ready ? 'check' : 'clipboardCheck'} size={13} color={color} />
        {label}
        {item.report_eta_hours != null && !ready && (
          <span style={{ color: 'var(--spira-faint)' }}>· {reportEtaLabel(item.report_eta_hours)}</span>
        )}
      </span>
      <button
        type="button" onClick={onToggle} disabled={busy}
        style={{ marginLeft: 'auto', height: 30, padding: '0 11px', borderRadius: 8, cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12, opacity: busy ? 0.6 : 1,
          border: `1px solid ${ready ? 'var(--spira-line-2)' : accent + '59'}`,
          background: ready ? 'var(--spira-white)' : accent + '12',
          color: ready ? 'var(--spira-muted)' : accent }}
      >
        {ready ? 'Reabrir' : 'Marcar reporte listo'}
      </button>
    </div>
  )
}
```

> `VisitChecklistItem` necesita `real_date` para calcular "vencido". Ese campo **no** está hoy en el tipo (el hook lee de `checklist_items`, que no tiene `real_date`). Traelo desde la visita: `VisitChecklist` ya recibe `visitId`; pasale también la `real_date` de la visita como prop desde `VisitDetail` (que tiene `visit.real_date`), y usala en `ReportRow` en vez de `item.real_date`. Ajuste concreto en el Step 5.

- [ ] **Step 5: Pasar `realDate` de la visita a `VisitChecklist`**

En `VisitChecklist.tsx`, cambiá la firma para recibir `realDate`:

```tsx
export function VisitChecklist({ visitId, accent, realDate }: { visitId: string | null; accent: string; realDate: string | null }) {
```

Pasá `realDate` a `ReportRow` (`realDate={realDate}`) y en `ReportRow` reemplazá `item.real_date` por la prop `realDate` (sacá `real_date` de `VisitChecklistItem`; no hace falta sumarlo al tipo). En `VisitDetail.tsx`, en el uso de `<VisitChecklist visitId={visit.id} accent={accent} />`, pasá `realDate={visit.real_date}`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 7: Verificar en preview** (migración aplicada)

Con una visita atendida cuyo protocolo tenga un ítem con reporte: abrí el modal ("Abrir"), desplegá el checklist. Confirmá "Reporte pendiente · ~2 días"; tocá "Marcar reporte listo" → pasa a "Reporte listo ✓"; recargá y confirmá que persiste; "Reabrir" lo revierte. Verificá por snapshot/DOM.

- [ ] **Step 8: Commit**

```bash
git add src/data/dayVisits.ts src/views/track/VisitChecklist.tsx src/views/track/VisitDetail.tsx
git commit -m "feat(track): estado de reporte por visita en el checklist del modal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Fase C — Edición inline del ítem en el modal (override por-visita)

**Files:**
- Modify: `src/data/dayVisits.ts` (`updateChecklistItem`)
- Modify: `src/views/track/VisitChecklist.tsx` (lápiz + panel de edición inline)

**Interfaces:**
- Consumes: la fila `VisitChecklistItem` (Tarea 3); `DEADLINE_OPTIONS`/`REPORT_ETA_OPTIONS` (Tarea 2); policy UPDATE de `checklist_items` (ya existe, 0006).
- Produces: `updateChecklistItem(itemId, input): Promise<{ error: string | null }>` con `input: { description; deadline_hours; mandatory; has_report; report_eta_hours }`.

- [ ] **Step 1: Mutación `updateChecklistItem` en `src/data/dayVisits.ts`**

```ts
/** Datos editables de un ítem materializado (override de ESA visita, no toca la plantilla). */
export interface ChecklistItemEdit {
  description: string
  deadline_hours: number
  mandatory: boolean
  has_report: boolean
  report_eta_hours: number | null
}

/**
 * Edita un ítem del checklist de UNA visita (override por-visita; no afecta la plantilla ni
 * otras visitas). UPDATE directo sobre checklist_items; la policy de 0006 lo scopea a la
 * coordinadora asignada o gerencia. "0 filas = sin permiso".
 */
export async function updateChecklistItem(itemId: string, input: ChecklistItemEdit): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('checklist_items')
    .update({
      description: input.description,
      deadline_hours: input.deadline_hours,
      mandatory: input.mandatory,
      has_report: input.has_report,
      report_eta_hours: input.has_report ? input.report_eta_hours : null,
    })
    .eq('id', itemId)
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar este ítem.' }
  return { error: null }
}
```

- [ ] **Step 2: Panel de edición inline en `VisitChecklist.tsx`**

Importá lo necesario y sumá los controles de dropdown:

```tsx
import { fieldInput } from '../../components/FormField'
import { SearchableSelect } from '../../components/SearchableSelect'
import { DEADLINE_OPTIONS, REPORT_ETA_OPTIONS, reportEtaLabel, deadlineLabel } from '../../lib/checklist'
import { useVisitChecklist, toggleChecklistItem, setReportReady, updateChecklistItem } from '../../data/dayVisits'
import type { VisitChecklistItem, ChecklistItemEdit } from '../../data/dayVisits'
```

Sumá estado de edición y guardado:

```tsx
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function onSaveEdit(item: VisitChecklistItem, input: ChecklistItemEdit) {
    setSaving(true); setActionError(null)
    const { error: err } = await updateChecklistItem(item.id, input)
    setSaving(false)
    if (err) { setActionError(err); return }
    setEditing(null)
    refetch()
  }
```

En el `items.map`, cuando `editing === item.id`, renderizá `<ChecklistItemEditForm>` en lugar de la fila normal; y en la fila normal, sumá un lápiz que setea `editing`. Insertá el botón lápiz dentro del contenedor `<div>` de la fila (fuera del `<button>` del tilde, para no anidar), a la derecha:

```tsx
              {editing === item.id ? (
                <ChecklistItemEditForm
                  item={item} accent={accent} busy={saving}
                  onSave={(input) => void onSaveEdit(item, input)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <>
                  {/* ...el <button> del tilde y el <ReportRow> de la Tarea 3... */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 9px 6px' }}>
                    <button type="button" onClick={() => { setEditing(item.id); setActionError(null) }} aria-label="Editar ítem" title="Editar (solo esta visita)" style={{ width: 28, height: 28, border: 'none', borderRadius: 7, background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                      <Icon name="pencil" size={14} color="var(--spira-muted)" />
                    </button>
                  </div>
                </>
              )}
```

- [ ] **Step 3: Sub-componente `ChecklistItemEditForm`**

Al final del archivo, agregá el form (mismos campos que `ItemForm` de Plantillas, adaptado al ítem materializado; deja claro que aplica solo a esta visita):

```tsx
/** Edición de un ítem del checklist DE ESTA VISITA (override; no toca la plantilla). */
function ChecklistItemEditForm({ item, accent, busy, onSave, onCancel }: {
  item: VisitChecklistItem; accent: string; busy: boolean
  onSave: (input: ChecklistItemEdit) => void; onCancel: () => void
}) {
  const [description, setDescription] = useState(item.description)
  const [deadline, setDeadline] = useState(item.deadline_hours)
  const [mandatory, setMandatory] = useState(item.mandatory)
  const [hasReport, setHasReport] = useState(item.has_report)
  const [reportEta, setReportEta] = useState<number>(item.report_eta_hours ?? 48)

  const submit = () => {
    const desc = description.trim()
    if (!desc) return
    onSave({ description: desc, deadline_hours: deadline, mandatory, has_report: hasReport, report_eta_hours: hasReport ? reportEta : null })
  }

  return (
    <div style={{ padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--spira-faint)' }}>
        Editar · solo esta visita
      </div>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción del ítem" autoFocus style={{ ...fieldInput, height: 38 }} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ width: 150 }}>
          <SearchableSelect value={String(deadline)} onChange={(v) => setDeadline(Number(v))} options={DEADLINE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))} placeholder="Plazo" entity="plazo" />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--spira-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} /> Obligatorio
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--spira-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={hasReport} onChange={(e) => setHasReport(e.target.checked)} /> Genera un reporte
        </label>
        {hasReport && (
          <div style={{ width: 170 }}>
            <SearchableSelect value={String(reportEta)} onChange={(v) => setReportEta(Number(v))} options={REPORT_ETA_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))} placeholder="Demora del reporte" entity="demora" />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} disabled={busy} style={{ height: 36, padding: '0 14px', borderRadius: 9, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-ink)', cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13 }}>Cancelar</button>
        <button type="button" onClick={submit} disabled={busy} style={{ height: 36, padding: '0 14px', borderRadius: 9, border: 'none', background: accent, color: 'var(--spira-on-accent)', cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 700, fontSize: 13, opacity: busy ? 0.6 : 1 }}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Verificar en preview** (migración aplicada)

Abrí el modal de una visita, tocá el lápiz de un ítem, cambiá la descripción y/o la demora del reporte, Guardá. Confirmá que cambió en esa visita. Abrí **otra** visita del mismo protocolo y confirmá que **no** cambió (override por-visita). Verificá por snapshot/DOM.

- [ ] **Step 6: Commit**

```bash
git add src/data/dayVisits.ts src/views/track/VisitChecklist.tsx
git commit -m "feat(track): edición inline de ítems del checklist en el modal (override por-visita)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Fase D — Alerta persistente de reporte pendiente

**Files:**
- Create: `src/data/reports.ts` (`useReportAlerts`)
- Modify: `src/views/TrackAlertsView.tsx` (sumar la fuente de reportes)
- Modify: `src/shell/NotificationsMenu.tsx` (sumar reportes al feed + al badge)

**Interfaces:**
- Consumes: vista `v_report_alerts` (Tarea 1).
- Produces: `ReportAlertRow`, `useReportAlerts(): QueryResult<ReportAlertRow[]>`.

- [ ] **Step 1: Crear `src/data/reports.ts`**

```ts
import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'

/** Fila de v_report_alerts (migración 00NN): ítem con reporte vencido y sin marcar listo. */
export interface ReportAlertRow {
  item_id: string
  visit_id: string
  description: string
  report_eta_hours: number
  real_date: string
  report_due_at: string
  protocol_id: string
  patient_id: string
  protocol_code: string
  protocol_name: string
  patient_code: string | null
  patient_name: string
  visit_name: string | null
  visit_code: string | null
}

/** Reportes pendientes de revisar (visita hecha + pasó la ETA + no listos). RLS scopea. */
export function useReportAlerts(): QueryResult<ReportAlertRow[]> {
  return useSupabaseQuery<ReportAlertRow[]>(
    (c) =>
      c
        .from('v_report_alerts')
        .select('*')
        .order('report_due_at', { ascending: true })
        .returns<ReportAlertRow[]>(),
    [],
  )
}
```

- [ ] **Step 2: Sumar la fuente de reportes a `TrackAlertsView.tsx`**

Importá `useReportAlerts` y `formatAR`/`daysDiffISO` (ya está `daysDiffISO`). Agregá el hook y un bloque de filas de reporte **arriba** de las alertas de visita (o intercaladas; para el mínimo, una sección propia). Concretamente:

```tsx
import { useReportAlerts } from '../data/reports'
```

Dentro del componente:

```tsx
  const reports = useReportAlerts()
  const reportRows = useMemo(() => reports.data ?? [], [reports.data])
```

Sumá `reports.loading`/`reports.error` a los `loading`/`error` combinados. En el `card`, antes de la lista de `filtered`, renderizá las filas de reporte (respetando el filtro de protocolo):

```tsx
            {reportRows
              .filter((r) => protocolFilter === 'all' || r.protocol_id === protocolFilter)
              .map((r) => {
                const c = 'var(--spira-primary)'
                const days = daysDiffISO(r.report_due_at.slice(0, 10), todayISO())
                return (
                  <div key={r.item_id} style={{ display: 'flex', gap: 11, padding: '12px 13px', borderRadius: 11, background: c + '0E', border: `1px solid ${c}30` }}>
                    <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="clipboardCheck" size={18} color={c} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <PrivacyAvatar fullName={r.patient_name} size={22} color={c} />
                        <span style={code}>{r.patient_code ?? '—'}</span>
                        <span style={{ color: 'var(--spira-faint)', fontWeight: 400 }}>· <span style={code}>{r.protocol_code}</span></span>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>
                        Reporte pendiente de revisar · {r.description}{days > 0 ? ` · hace ${days} d` : ''}
                      </div>
                    </div>
                  </div>
                )
              })}
```

Actualizá el contador del header y el "Sin alertas" para contemplar `reportRows.length` (p. ej. el vacío total es `allRows.length === 0 && reportRows.length === 0`). Sumá al pie de leyenda: `· Reporte pendiente (petróleo)`.

- [ ] **Step 3: Sumar reportes al `NotificationsMenu.tsx`**

Importá y usá `useReportAlerts`; sumá su conteo al badge y sus filas al feed:

```tsx
import { useReportAlerts } from '../data/reports'
```

```tsx
  const reports = useReportAlerts()
  const reportRows = useMemo(() => reports.data ?? [], [reports.data])
  const count = rows.length + reportRows.length
```

En el cuerpo, antes de las filas de `rows`, mapeá `reportRows` a filas con el mismo `rowStyle` (ícono `clipboardCheck`, color `--spira-primary`, texto "Reporte pendiente de revisar — {description}"). Ajustá la condición de vacío a `rows.length === 0 && reportRows.length === 0`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Verificar en preview** (migración aplicada)

Necesitás una visita con `real_date` viejo (o un ítem con ETA corta ya vencida) y su reporte sin marcar listo. Confirmá que aparece en la campana (con el conteo) y en `Track → Alertas` como "Reporte pendiente de revisar". Marcá el reporte listo desde el modal → confirmá que desaparece de ambos al recargar. Verificá por snapshot/DOM.

- [ ] **Step 6: Commit**

```bash
git add src/data/reports.ts src/views/TrackAlertsView.tsx src/shell/NotificationsMenu.tsx
git commit -m "feat(track): alerta persistente de reporte pendiente (campana + Alertas)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (cobertura del spec)

- **§4.1 campos de reporte (plantilla + materializado):** Tareas 1 (schema) + 2 (front plantilla). ✔
- **§4.2 estado report_ready aparte:** Tarea 1 (tabla+RLS+audit) + Tarea 3 (`setReportReady`, UI). ✔
- **§4.3 materialización copia los campos:** Tarea 1, Step 2 (`materialize_checklist`). ✔
- **§4.4 vista dedicada de alertas:** Tarea 1 (`v_report_alerts`) + Tarea 5 (consumo). ✔
- **§5 capa de datos:** `templates.ts` (T2), `dayVisits.ts` (T3/T4), `reports.ts` (T5). ✔
- **§6 UI Plantillas:** Tarea 2. ✔
- **§7 UI modal (ver/marcar T3, editar T4):** Tareas 3 y 4. ✔ (D6 override por-visita explícito; D7 binario.)
- **§8 alerta persistente:** Tarea 5. ✔
- **§9 migración 00NN legacy-safe + contigüidad CI:** Tarea 1 (Steps 1/4). ✔
- **§11 verificación por fase (typecheck + preview):** cada tarea, Steps de verificación. ✔

**Placeholders:** el único `00NN`/`NN` es a propósito (número contiguo a confirmar con `git fetch`, §Global Constraints + T1 Step 1). Sin TODO/TBD.

**Consistencia de tipos:** `has_report`/`report_eta_hours` (mismos nombres en plantilla, materializado y snapshot); `setReportReady(itemId, ready)`, `updateChecklistItem(itemId, ChecklistItemEdit)`, `useReportAlerts()/ReportAlertRow` usados igual entre tareas. `deadlineLabel`/`DEADLINE_OPTIONS` centralizados en `src/lib/checklist.ts` (T2) y consumidos por T2/T3/T4.

## Notas de coordinación

- **Rama:** crear `feat/checklist-reportes` **desde main** (con 0061/0062 ya integradas). No trabajar sobre `feat/carga-visitas-historicas` (hueco de numeración → CI en rojo).
- **Aplicación de la migración:** el Director la corre a mano; las Tareas 2–5 se **escriben** sin ella, pero su **verificación en preview** la necesita aplicada. Orden sugerido: T1 (migración + handoff) → mientras el Director aplica, escribir T2–T5 → verificar en preview cuando esté aplicada → PR.
- **PRs:** no puedo self-mergear; creo la PR (API REST + `git credential fill`) y el Director mergea.
