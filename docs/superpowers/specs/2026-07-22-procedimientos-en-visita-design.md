# Procedimientos = checklist de la visita (con reporte + alertas) — Design

- **Fecha:** 2026-07-22
- **Estado:** aprobado (brainstorming), pendiente de plan de implementación
- **Módulo:** Track
- **Migración nueva:** `0064_procedimientos_checklist.sql` (aplicar a mano en prod)
- **Depende de:** 0061 (procedimientos por visita: `procedures` + `protocol_activities`) y
  0063 (checklist con reporte: `checklist_report_ready`, `v_report_alerts`, la campana + Alertas)

## Qué cambió respecto del primer borrador

El primer diseño trataba a los procedimientos como una **segunda lista** al lado del "Checklist
clínico" templado. Tras aclarar el uso real con el Director, el modelo es otro:

- **Los procedimientos SON el checklist de la visita.** No hay dos listas.
- **El checklist templado (plantillas → `checklist_items`) hoy NO se usa** (la vista de gestión
  `track/plantillas` ni siquiera está en el menú). Queda **dormido** (intacto en base y código,
  pero deja de renderizarse en el modal). No se borra: es reversible y sacar 0063 sería arriesgado.
- El flujo que se quiere es, casi exacto, el que 0063 ya construyó para ítems de checklist, pero
  **aplicado a procedimientos**: por eso se **reusa** ese mecanismo (estado "reporte listo" +
  alerta persistente), no se reinventa.

## Flujo del usuario (el objetivo)

1. Ver, fácil, en cada visita, qué **procedimientos** lleva (el cuadro / SoA del cronograma).
2. Marcar un procedimiento como **realizado** cuando se hizo.
3. Algunos procedimientos **generan un reporte** (ej. extracción → resultado de laboratorio) que se
   descarga, se hace **firmar por el médico** y se **archiva**. Al marcarse realizado, el modal marca
   ese procedimiento como **reporte pendiente** al instante; y una vez que **pasó la demora estimada**
   (ETA) sin marcarse listo, salta la **alerta persistente** en la campana + Alertas — mismo criterio
   de "vencido" que 0063 (no un aviso inmediato: el reporte recién existe después de la ETA).
4. Cuando el reporte se descargó/firmó/archivó, se marca **"reporte listo"** → el pendiente y la
   alerta se apagan.
5. La visita queda en **realizada** mientras haya algo pendiente (procedimiento sin realizar o reporte
   sin marcar listo) y recién pasa a **completa** cuando está todo hecho (§1.6).

## Modelo mental

- **Asignación** (qué procedimientos lleva la visita): por `visit_definitions` en el cronograma
  (`protocol_activities`, 0061). Ya existe; no se toca acá salvo el atributo nuevo del catálogo.
- **Ejecución** (qué se hizo en la visita concreta): por `patient_visits`. Es lo nuevo, con DOS
  estados por procedimiento — **realizado** y **reporte listo** — calcados de 0063
  (`checklist_completions` + `checklist_report_ready`).
- **Reporte** es un **atributo del procedimiento** (del tipo, en el catálogo `procedures`), igual
  que `has_report` es propiedad del tipo de ítem en 0063.

Clave de los estados: **`(visit_id, procedure_id)`**, no `protocol_activities.id` — así el estado
sobrevive a que se reordene/reasigne el cuadro en el cronograma (`set_visit_procedures` borra e
inserta filas de `protocol_activities`).

## 1 · Base de datos — `0064_procedimientos_checklist.sql`

Aplicar a mano, en orden, DESPUÉS de la 0063. Idempotente. Registrar en `supabase/README.md`.

### 1.1 · Atributo de reporte en el catálogo `procedures`

Mismos nombres que 0063 (`has_report` / `report_eta_hours`) para reusar los presets y etiquetas de
`src/lib/checklist.ts` (`REPORT_ETA_OPTIONS`, `reportEtaLabel`).

```sql
alter table public.procedures add column if not exists has_report boolean not null default false;
alter table public.procedures add column if not exists report_eta_hours integer;
do $$ begin
  alter table public.procedures add constraint procedures_report_eta_chk
    check (report_eta_hours is null or report_eta_hours in (24, 48, 72, 168, 336, 720));
exception when duplicate_object then null; end $$;
comment on column public.procedures.has_report is
  'El procedimiento genera un reporte (ej. laboratorio) a descargar/firmar/archivar. Propiedad del tipo. 0064.';
comment on column public.procedures.report_eta_hours is
  'Demora estimada del reporte en horas (preset 24/48/72/168/336/720). Nullable; solo si has_report. 0064.';
```

### 1.2 · Estado por visita — dos tablas insert/delete (calcadas de 0063)

```sql
-- Procedimiento REALIZADO en una visita concreta. Calcado de checklist_completions.
create table if not exists public.visit_procedure_completions (
  id           uuid primary key default uuid_generate_v4(),
  visit_id     uuid not null references public.patient_visits(id) on delete cascade,
  procedure_id uuid not null references public.procedures(id)     on delete cascade,
  completed_by uuid not null default auth.uid() references public.users(id),  -- default = quien tilda (anti-spoofing)
  completed_at timestamptz not null default now(),
  unique (visit_id, procedure_id)
);
create index if not exists ix_vpc_visit on public.visit_procedure_completions (visit_id);
comment on table public.visit_procedure_completions is
  'Procedimientos del cuadro (0061) realizados en una visita concreta. Clave (visit_id, procedure_id). 0064.';

-- Reporte del procedimiento marcado LISTO (descargado/firmado/archivado). Calcado de checklist_report_ready.
create table if not exists public.visit_procedure_reports_ready (
  id           uuid primary key default uuid_generate_v4(),
  visit_id     uuid not null references public.patient_visits(id) on delete cascade,
  procedure_id uuid not null references public.procedures(id)     on delete cascade,
  ready_by     uuid not null default auth.uid() references public.users(id),
  ready_at     timestamptz not null default now(),
  notes        text,
  unique (visit_id, procedure_id)
);
create index if not exists ix_vprr_visit on public.visit_procedure_reports_ready (visit_id);
comment on table public.visit_procedure_reports_ready is
  'Reporte de un procedimiento marcado LISTO en una visita. Estado aparte del tilde de realizado. 0064.';
```

### 1.3 · RLS (más simple que 0063: `visit_id` es columna directa, sin join por item)

Para **ambas** tablas, espejando `checklist_completions` (0006) pero sobre `visit_id` directo:

```sql
alter table public.visit_procedure_completions   enable row level security;
alter table public.visit_procedure_reports_ready enable row level security;

-- Patrón por tabla (repetir para las dos, cambiando el nombre de la policy):
--   SELECT: gerencia o coordina la visita.
--   INSERT: (completed_by|ready_by) = auth.uid() y (gerencia o coordina la visita).
--   DELETE: gerencia o coordina la visita.
-- Ej. completions:
create policy "ver procedimiento realizado" on public.visit_procedure_completions for select using (
  public.has_module('gerencia') or public.coordina_visita(visit_id));
create policy "track tilda procedimiento" on public.visit_procedure_completions for insert with check (
  completed_by = auth.uid() and (public.has_module('gerencia') or public.coordina_visita(visit_id)));
create policy "track destilda procedimiento" on public.visit_procedure_completions for delete using (
  public.has_module('gerencia') or public.coordina_visita(visit_id));
-- (idem visit_procedure_reports_ready con ready_by)

revoke all on public.visit_procedure_completions   from anon;
revoke all on public.visit_procedure_reports_ready from anon;
grant select, insert, delete on public.visit_procedure_completions   to authenticated;
grant select, insert, delete on public.visit_procedure_reports_ready to authenticated;
```

### 1.4 · Auditoría (espejo de 0063)

Trigger `audit_row()` after insert/update/delete en las dos tablas nuevas (`drop trigger if exists`
antes de `create`, por idempotencia).

### 1.5 · Alertas — vista paralela, sin tocar `v_report_alerts`

Se crea una vista **nueva** `v_procedure_report_alerts` (no se modifica la de 0063, más seguro),
misma forma de columnas que `v_report_alerts` para que el front las una fácil. `security_invoker`
→ la RLS scopea. Anclaje al **momento en que se marcó realizado** (`completed_at`, timestamptz;
no hace falta la gimnasia de zona horaria de 0063 porque no es un `date`):

```sql
create view public.v_procedure_report_alerts with (security_invoker = true) as
select
  vpc.id            as completion_id,
  vpc.visit_id,
  vpc.procedure_id,
  p.name            as description,
  p.report_eta_hours,
  vpc.completed_at,
  (vpc.completed_at + (p.report_eta_hours * interval '1 hour')) as report_due_at,
  e.protocol_id, e.patient_id,
  pr.code as protocol_code, pr.name as protocol_name,
  pa.code as patient_code, pa.full_name as patient_name,
  vd.name as visit_name, vd.code as visit_code
from public.visit_procedure_completions vpc
join public.procedures p        on p.id  = vpc.procedure_id
join public.patient_visits pv   on pv.id = vpc.visit_id
join public.enrollments e       on e.id  = pv.enrollment_id
join public.protocols pr        on pr.id = e.protocol_id
join public.patients pa         on pa.id = e.patient_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
left join public.visit_procedure_reports_ready rr
       on rr.visit_id = vpc.visit_id and rr.procedure_id = vpc.procedure_id
where p.has_report
  and p.report_eta_hours is not null
  and rr.id is null
  and now() > (vpc.completed_at + (p.report_eta_hours * interval '1 hour'));
revoke all on public.v_procedure_report_alerts from anon;
grant select on public.v_procedure_report_alerts to authenticated;
```

### 1.6 · Estado de la visita — recrear `v_patient_visits` + `v_track_visits`

**Los procedimientos manejan el estado clínico de la visita.** Regla: una visita con `real_date` es
`completa` solo cuando **todos** sus procedimientos están realizados **y** los que generan reporte
tienen el reporte listo; si queda algo pendiente, `realizada`; si un reporte ya venció su ETA sin
marcarse listo, `item_vencido`.

Se hace **sumando** (no reemplazando) la condición de procedimientos a la lógica de checklist ya
vigente (0049): como el checklist templado está dormido, en la práctica manda el procedimiento, pero
la lógica vieja queda intacta y reversible. Patrón del repo: `drop view v_track_visits; drop view
v_patient_visits;` y recrear **ambas** copiando su definición vigente de 0049 + el cambio en el CASE.

Predicados nuevos (por visita `pv`), a sumar con `or` a los `exists(...)` de checklist:

```sql
-- pendiente de realizar: hay un procedimiento asignado a la definición sin completar en esta visita
exists (select 1 from public.protocol_activities pa
        where pa.visit_def_id = pv.visit_def_id
          and not exists (select 1 from public.visit_procedure_completions vpc
                          where vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id))
-- pendiente de reporte: procedimiento con has_report sin "reporte listo" en esta visita
exists (select 1 from public.protocol_activities pa
        join public.procedures p on p.id = pa.procedure_id
        where pa.visit_def_id = pv.visit_def_id and p.has_report
          and not exists (select 1 from public.visit_procedure_reports_ready rr
                          where rr.visit_id = pv.id and rr.procedure_id = pa.procedure_id))
-- reporte vencido (→ item_vencido): realizado + has_report + no listo + pasó la ETA
exists (select 1 from public.protocol_activities pa
        join public.procedures p on p.id = pa.procedure_id
        join public.visit_procedure_completions vpc
             on vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id
        where pa.visit_def_id = pv.visit_def_id and p.has_report and p.report_eta_hours is not null
          and not exists (select 1 from public.visit_procedure_reports_ready rr
                          where rr.visit_id = pv.id and rr.procedure_id = pa.procedure_id)
          and now() > vpc.completed_at + (p.report_eta_hours * interval '1 hour'))
```

CASE resultante: `item_vencido` si (checklist vencido **o** reporte vencido); `realizada` si
(checklist pendiente **o** proc. pendiente de realizar **o** proc. pendiente de reporte); si no,
`completa`. Visitas sueltas / definición sin procedimientos → vacuamente `completa`, como hoy.

> ⚠️ `v_track_visits` tiene 40 columnas (0049) — el plan copia su definición **tal cual** y solo cambia
> el CASE de `v_patient_visits`. `create or replace view` no alcanza (cambia el cuerpo con vistas
> dependientes) → drop en cascada controlado y recrear las dos.

### 1.7 · Backfill de visitas históricas (dar por hechas)

Al pasar el estado a los procedimientos, las visitas ya realizadas (fecha real, cero procedimientos
tildados) caerían a `realizada`. Para preservar su estado, un **backfill idempotente y aditivo** (al
final de 0064) marca como realizados —y sus reportes como listos— los procedimientos de **toda visita
con `real_date`** al momento de aplicar la migración:

```sql
do $$ declare v_by uuid;
begin
  -- Autor del backfill: un usuario real (gerencia primero), igual que el seed de 0061.
  select u.id into v_by from public.users u
    join public.user_module_roles r on r.user_id = u.id
    where r.module = 'gerencia' order by u.created_at limit 1;
  if v_by is null then select id into v_by from public.users order by created_at limit 1; end if;
  if v_by is null then raise notice 'Sin usuarios: se omite el backfill'; return; end if;

  -- Realizados: un completion por (visita realizada, procedimiento asignado a su definición).
  insert into public.visit_procedure_completions (visit_id, procedure_id, completed_by, completed_at)
  select pv.id, pa.procedure_id, v_by, pv.real_date::timestamptz
  from public.patient_visits pv
  join public.protocol_activities pa on pa.visit_def_id = pv.visit_def_id
  where pv.real_date is not null
  on conflict (visit_id, procedure_id) do nothing;

  -- Reportes listos: se marcan para TODOS los procedimientos de las visitas ya realizadas (no solo
  -- los que hoy tienen has_report). Motivo: has_report se lee EN VIVO del catálogo, así que si mañana
  -- se marca un procedimiento como "genera reporte", las visitas históricas ya tienen su reporte listo
  -- y no caen en item_vencido/alerta. Filas extra en procedimientos sin reporte = inertes (nunca se consultan).
  insert into public.visit_procedure_reports_ready (visit_id, procedure_id, ready_by, ready_at)
  select pv.id, pa.procedure_id, v_by, pv.real_date::timestamptz
  from public.patient_visits pv
  join public.protocol_activities pa on pa.visit_def_id = pv.visit_def_id
  where pv.real_date is not null
  on conflict (visit_id, procedure_id) do nothing;
end $$;
```

Aditivo (solo `insert ... on conflict do nothing`), sin deletes ni updates → seguro sobre datos
reales. Las visitas nuevas de acá en adelante arrancan sin tildar (estado real).

## 2 · Capa de datos

**`src/data/procedures.ts`**
- `useVisitProcedureStatus(visitId, visitDefId)`: procedimientos de la visita con sus DOS estados.
  Tres consultas unidas en cliente (patrón de `useVisitChecklist`): `protocol_activities` por
  `visit_def_id` (con `procedure:procedures(...)`, incluyendo `has_report`/`report_eta_hours`) +
  `visit_procedure_completions` por `visit_id` + `visit_procedure_reports_ready` por `visit_id`.
  Devuelve `{ procedure_id, name, category, has_report, report_eta_hours, completed, completed_at,
  report_ready, report_ready_at }`. Con `visitId`/`visitDefId` null → `[]`.
- `toggleVisitProcedure(visitId, procedureId, completed)`: insert/delete en
  `visit_procedure_completions`. Clon de `toggleChecklistItem` ("0 filas = sin permiso").
- `toggleVisitProcedureReport(visitId, procedureId, ready)`: insert/delete en
  `visit_procedure_reports_ready`.
- Ampliar `useProceduresCatalog` / el alta-edición del catálogo para llevar `has_report` +
  `report_eta_hours`. `setVisitProcedures` (RPC 0061) no cambia; el atributo es del catálogo, se
  edita al crear/editar el procedimiento.

**`src/data/reports.ts`** (alertas, 0063): sumar la lectura de `v_procedure_report_alerts` y
unirla con la de `v_report_alerts` para la campana y la vista Alertas. Marcar cada fila con un
`kind: 'checklist' | 'procedimiento'` para que la UI las distinga si hace falta.

## 3 · UI

- **`src/views/track/VisitProcedures.tsx` (nuevo)** — el checklist de procedimientos de la visita
  (espeja el visual de `VisitChecklist`): lista siempre visible (viene del cronograma, no espera
  Atendida), cada fila tildable "realizada". Las que `has_report`, al marcarse realizadas, muestran
  el segundo control **"reporte listo"** y un indicador de pendiente (con la ETA / si está vencido).
  Tilde optimista con rollback. `readOnly` (ficha) → solo lectura.
- **`src/views/track/VisitDetail.tsx`** — la sección plegable pasa a mostrar `VisitProcedures` en
  lugar de `VisitChecklist`. El checklist templado deja de renderizarse en el modal (el componente
  y su data quedan en el repo, sin uso).
- **`src/views/track/VisitProceduresModal.tsx`** (asignación/catálogo del cronograma) — sumar al
  alta/edición del catálogo el toggle **"genera reporte"** + selector de demora estimada, reusando
  `DEADLINE`/`REPORT_ETA_OPTIONS` de `src/lib/checklist.ts` (mismo control que la vista Plantillas).
- **Alertas** (campana + `TrackAlertsView`): sin rediseño; solo consumen la fuente ampliada (§2).
  Copy que mencione el circuito descargar/firmar/archivar.

## Alcance / bordes

- **Checklist templado dormido:** no se borra 0063 ni las tablas de checklist; solo dejan de tener
  superficie en el modal. Reversible.
- **Estado de la visita (en scope, §1.6):** los procedimientos manejan `computed_status`. Una visita
  no pasa a `completa` hasta que todos sus procedimientos estén realizados y sus reportes listos.
  Cambia una vista central → parte grande y delicada de la migración. Las históricas se preservan con
  el backfill (§1.7).
- **Visitas sueltas** (`visit_def_id` null) o **definición sin procedimientos** → no se muestra el
  bloque (el hook devuelve `[]`).
- **`report_ready` sin `completed`**: la UI solo ofrece "reporte listo" una vez marcado realizado
  (no se puede tener el reporte antes de hacer el procedimiento).
- **RLS silenciosa:** 0 filas en un toggle = sin permiso, mensaje sereno.

## Fuera de alcance (YAGNI)

- `patient_timeline`, grilla SoA cross-visita, herencia de procedimientos entre visitas (diferidos de 0061).
- Notas por completado/reporte visibles en la UI (la tabla `notes` existe; la UI v1 no las muestra).
- Retiro/migración definitiva del checklist templado (se decide si alguna vez se necesita).
- Adjuntar el archivo del reporte en la app (hoy el reporte vive fuera; solo se marca el circuito).

## Verificación

- `npm run typecheck` verde.
- **Aplicar 0064 en prod antes de probar escritura** (el tilde falla sin las tablas). Registrar en
  `supabase/README.md`.
- Navegador: abrir una visita con procedimientos → ver la lista → tildar "realizada"; en un
  procedimiento con `has_report`, marcar realizado y confirmar que aparece en la campana/Alertas tras
  la ETA; marcar "reporte listo" y confirmar que la alerta se apaga; recargar y confirmar persistencia.
  Verificar que una visita suelta no muestra bloque y que la ficha (`readOnly`) es solo lectura.
- **Estado:** una visita con procedimientos sin tildar debe mostrarse `realizada`; al tildar todos (y
  marcar los reportes listos) debe pasar a `completa`. Un reporte pasado de ETA → `item_vencido`.
- **Backfill:** tras aplicar 0064, confirmar que las visitas históricas ya realizadas **siguen**
  `completa` (no cayeron a pendiente) y que los números del tablero se mantienen.

## Archivos afectados

- `supabase/migrations/0064_procedimientos_checklist.sql` (nuevo) — atributo + 2 tablas + RLS +
  audit + vista de alertas + **recreación de `v_patient_visits` y `v_track_visits`** (estado, §1.6) +
  **backfill** de históricas (§1.7). Migración grande.
- `supabase/README.md` (índice de migraciones)
- `src/data/procedures.ts` (status + toggles + atributo de catálogo)
- `src/data/reports.ts` (unir la fuente de alertas de procedimientos)
- `src/views/track/VisitProcedures.tsx` (nuevo)
- `src/views/track/VisitDetail.tsx` (mostrar procedimientos en lugar del checklist templado)
- `src/views/track/VisitProceduresModal.tsx` (toggle "genera reporte" en el catálogo)
