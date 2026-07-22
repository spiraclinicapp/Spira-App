# Diseño — Ítems de checklist con reporte + edición en el modal de la visita

**Fecha:** 2026-07-21
**Estado:** spec para revisión (pre-implementación)
**Origen:** pedido del Director — poder editar cada ítem del checklist (en vez de borrarlo y
rehacerlo) y sumarle, como propiedad del tipo de ítem, si **genera un reporte** y en cuánto
tiempo llega, con un **recordatorio persistente** hasta marcarlo listo.

---

## 1. Objetivo

Dos capacidades sobre el checklist clínico de Track:

1. **Editar ítems en el lugar**, tanto en la **plantilla** (`Track → Plantillas`) como en el
   **checklist materializado de la visita** (modal "Abrir"), sin tener que eliminarlos.
2. **Reporte por tipo de ítem:** marcar que un ítem *genera un reporte* y su *demora estimada*
   (ETA). Cuando la visita ya ocurrió y pasó la ETA sin que el reporte esté **listo (firmado y
   evolucionado)**, el sistema lo muestra como **alerta persistente** (campana + Alertas) hasta
   que se lo cierre. El "listo" del reporte es un **estado aparte** del tilde de completado.

Es sistema auditable (ANMAT/ICH-GCP): las reglas duras de `CLAUDE.md` aplican (migraciones
inmutables numeradas, aplicadas a mano por el Director, sin dato inventado).

## 2. Decisiones tomadas (con el Director)

| # | Decisión | Elegido |
|---|---|---|
| D1 | ¿Dónde cae la edición + campos de reporte? | **Ambas** capas (plantilla y modal de la visita) |
| D2 | ¿Qué describen "tiene reporte" / "tiempo del reporte"? | **Propiedad del tipo de ítem** (se define una vez, vale para toda visita) |
| D3 | ¿Cómo se hace el recordatorio? | **Alerta persistente en la app** (sin mail/push; reusa la maquinaria de alertas calculadas) |
| D4 | ¿Qué es "marcar reporte listo"? | **Estado aparte** del tilde de completado (tabla propia) |
| D5 | ¿Cómo se computa la alerta de reporte pendiente? | **Fuente dedicada aparte** (vista nueva; no toca `computed_status` ni recrea las vistas grandes) |
| D6 | ¿La edición en el modal a qué afecta? | **Override de esa visita** (toca el `checklist_items` materializado, no la plantilla ni otras visitas) |
| D7 | ¿Estados del reporte? | **Binario** (pendiente → listo). Sin intermedio "llegó pero sin firmar" (YAGNI) |

**Realidad asumida (D3):** Spira no tiene scheduler server-side (ni cron/mail/push). Todo lo que
"avisa" hoy —la campana y la vista Alertas— se **calcula al leer**. Por eso "recordatorio cada
48 h" se implementa como una **alerta que aparece cuando el reporte está para revisar y no se va
hasta marcarlo listo**: funcionalmente te lo recuerda cada vez que entrás. Un recordatorio
*programado de verdad* (mail/push aunque no estés en la app) es infra nueva y queda **fuera de
alcance**.

## 3. Modelo actual (contexto)

- **Plantilla:** `checklist_templates` (global + una por protocolo) → `checklist_template_items`
  (`description`, `deadline_hours ∈ {0,48,168}`, `mandatory`, `sort_order`). Se edita en
  [`TemplatesView.tsx`](../../../src/views/TemplatesView.tsx) (alta/edición/borrado/reorden ya
  existen). Capa de datos: [`src/data/templates.ts`](../../../src/data/templates.ts).
- **Materializado por visita:** `checklist_items` (snapshot copiado de la plantilla por el
  trigger `materialize_checklist()` al setear `real_date`) + `checklist_completions` (quién/cuándo
  completó, `unique(item_id)`). Se muestra en
  [`VisitChecklist.tsx`](../../../src/views/track/VisitChecklist.tsx) dentro de
  [`VisitDetail.tsx`](../../../src/views/track/VisitDetail.tsx). Capa de datos: hooks y mutaciones
  en [`src/data/dayVisits.ts`](../../../src/data/dayVisits.ts).
- **Alertas:** `v_patient_visits.computed_status` deriva `item_vencido` cuando un ítem
  **obligatorio** sin completar pasó `real_date + deadline_hours`
  ([0049:96-102](../../../supabase/migrations/0049_pvm_wait_and_demographics.sql)). La consumen
  [`TrackAlertsView.tsx`](../../../src/views/TrackAlertsView.tsx) y
  [`NotificationsMenu.tsx`](../../../src/shell/NotificationsMenu.tsx) vía `useVisitAlerts()`.

**RLS relevante (ya existe, no hay que agregar para D6):** `checklist_items` tiene políticas
SELECT/INSERT/UPDATE/DELETE scopeadas por `public.coordina_visita(visit_id)` (+ gerencia)
([0006:191-200](../../../supabase/migrations/0006_rls_policies.sql)). O sea, la edición
por-visita del materializado (Fase C) queda cubierta por la política UPDATE existente.

## 4. Modelo destino

### 4.1 Campos de reporte (propiedad del tipo — D2)

Dos columnas nuevas, primero en la **plantilla** y luego materializadas al **ítem de la visita**:

- `has_report boolean not null default false` — "este ítem genera un reporte".
- `report_eta_hours integer` — demora estimada en horas (nullable; solo aplica si `has_report`).
  Presets de UI (dropdown, sin texto libre — ver [[ux-desplegables-sin-texto-libre]]):
  **24 h, 48 h (2 días), 72 h (3 días), 7 días (168 h), 14 días (336 h), 30 días (720 h)**.

Constraint **lenient** (legacy-safe): `report_eta_hours is null or report_eta_hours in
(24,48,72,168,336,720)`. La regla "si `has_report` ⇒ ETA obligatoria" se enforcea en el
**formulario** (default 48 h), no en un check duro, para no romper filas viejas ni ediciones
parciales. Si `has_report` y `report_eta_hours is null`, simplemente **no dispara alerta**.

> **`report_eta_hours` es independiente de `deadline_hours`.** Son dos relojes distintos:
> `deadline_hours` maneja el "ítem obligatorio fuera de plazo" (`item_vencido`, milestone del
> *tilde*); `report_eta_hours` maneja el *reporte* (milestone aparte, D4). Un ítem con reporte
> puede tener `deadline_hours = 0` (la acción en la visita fue al momento) y `report_eta_hours =
> 168` (el resultado llega a los 7 días).

### 4.2 Estado del reporte por visita (aparte del tilde — D4/D7)

Tabla nueva `checklist_report_ready`, **calcada de `checklist_completions`**:

```sql
create table public.checklist_report_ready (
  id         uuid primary key default uuid_generate_v4(),
  item_id    uuid not null references public.checklist_items(id) on delete cascade,
  ready_by   uuid not null default auth.uid() references public.users(id),  -- anti-spoofing
  ready_at   timestamptz not null default now(),
  notes      text,
  unique (item_id)                      -- un reporte se marca listo una sola vez
);
comment on table public.checklist_report_ready is
  'Reporte de un ítem marcado LISTO (firmado y evolucionado). Estado aparte del tilde de completado. Auditable.';
```

- **Marcar listo** = insert; **reabrir** = delete (patrón "0 filas afectadas = sin permiso").
- **RLS:** espejo exacto de `checklist_completions`
  ([0006:202-212](../../../supabase/migrations/0006_rls_policies.sql) +
  [0023:262-263](../../../supabase/migrations/0023_track_visita_dia.sql)):
  - SELECT: `has_module('gerencia')` o `exists(... coordina_visita(ci.visit_id))`.
  - INSERT: `ready_by = auth.uid()` **y** el scoping de arriba.
  - DELETE (reabrir): mismo scoping.
- **Auditoría:** `create trigger trg_audit_checklist_report_ready after insert or update or delete
  ... execute function public.audit_row();` (espejo de `trg_audit_checklist_completions`,
  [0003:368](../../../supabase/migrations/0003_functions_triggers.sql)).

### 4.3 Materialización

`create or replace function public.materialize_checklist()` (última versión en
[0022:89-111](../../../supabase/migrations/0022_visitas_unificadas.sql)) — agregar las dos
columnas al `insert ... select`:

```sql
insert into public.checklist_items
  (visit_id, template_item_id, description, deadline_hours, mandatory, sort_order,
   has_report, report_eta_hours)
select new.id, ti.id, ti.description, ti.deadline_hours, ti.mandatory, ti.sort_order,
   ti.has_report, ti.report_eta_hours
from public.checklist_template_items ti where ti.template_id = v_template_id;
```

Resto de la función **igual** (guard de idempotencia, resolución de template por protocolo/global).
Es `security definer`, así que copia sin importar la RLS.

### 4.4 Fuente dedicada de alertas de reporte (D5)

Vista nueva `v_report_alerts` con `security_invoker = true` (la RLS de las tablas base la scopea),
que lista **ítems con reporte pendiente y vencido** con lo necesario para la tarjeta de alerta:

```sql
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
  and rr.id is null                                 -- todavía no listo
  and now() > (pv.real_date::timestamp + (ci.report_eta_hours * interval '1 hour'))
              at time zone 'America/Argentina/Buenos_Aires';
comment on view public.v_report_alerts is
  'Ítems con reporte que ya deberían haber llegado (visita hecha + pasó la ETA) y no están listos. Fuente de la alerta persistente de reporte. security_invoker → RLS scopea.';
revoke all on public.v_report_alerts from anon;
grant select on public.v_report_alerts to authenticated;
```

Anclada a hora local AR (mismo criterio que la 0049). **No** toca el enum `visit_status`, **no**
recrea `v_track_visits`/`v_patient_visits` → cero colisión con 0061/0062.

## 5. Capa de datos (front)

### 5.1 `src/data/templates.ts`
- `TemplateItem` y `TemplateItemInput`: sumar `has_report: boolean` y `report_eta_hours: number |
  null`.
- `useTemplateItems`: agregar las columnas al `select`.
- `createTemplateItem` / `updateTemplateItem`: incluir los dos campos en el insert/update.

### 5.2 `src/data/dayVisits.ts`
- `VisitChecklistItem`: sumar `has_report`, `report_eta_hours` y el estado de reporte
  (`report_ready: boolean` + `report_ready_at` / `report_ready_by`, unidos en cliente como ya se
  hace con `checklist_completions`).
- `useVisitChecklist`: sumar las columnas nuevas al `select` de `checklist_items` y hacer una
  tercera consulta a `checklist_report_ready` (misma técnica de unión en cliente que las
  completions, para respetar la RLS de cada tabla).
- **Mutaciones nuevas:**
  - `setReportReady(itemId, ready: boolean)` — insert/delete en `checklist_report_ready`
    (patrón de `toggleChecklistItem`).
  - `updateChecklistItem(itemId, input)` — `update` directo sobre `checklist_items`
    (`description`, `deadline_hours`, `mandatory`, `has_report`, `report_eta_hours`); "0 filas =
    sin permiso". Cubierto por la policy UPDATE existente.

### 5.3 `src/data/` (alertas de reporte)
- Nuevo hook `useReportAlerts()` (en `visits.ts` o un `reports.ts` chico) que lee `v_report_alerts`
  ordenado por `report_due_at asc`. Tipo `ReportAlertRow` a mano (convención del repo).

## 6. UI — Fase A · Plantillas (`TemplatesView`)

En [`ItemForm`](../../../src/views/TemplatesView.tsx) (alta y edición comparten el form):
- Checkbox/toggle **"Genera un reporte"** (`has_report`).
- Cuando está activo, aparece el dropdown **"Demora estimada del reporte"** (`SearchableSelect`
  con los presets de §4.1). Cuando se apaga, `report_eta_hours` vuelve a `null`.
- En la fila del ítem (modo lectura), píldora sobria **"Reporte · ~48 h"** (ícono `clipboardCheck`
  o similar; on-brand Sereno, sin color-solo).

La edición del ítem ya existe (lápiz) → es sumar campos, no maquinaria nueva.

## 7. UI — Fases B/C · Modal de la visita (`VisitChecklist`)

El componente hoy es solo tildar. Se suma, por ítem:

**Fase B — reporte (ver + marcar listo):**
- Para ítems con `has_report`: una línea de estado bajo la descripción —
  **"Reporte pendiente"** / **"Reporte vencido · hace X"** / **"Reporte listo ✓"** (deriva de
  `report_ready` + `report_due_at`).
- Acción **"Marcar reporte listo (firmado y evolucionado)"** y su inverso **"Reabrir"**
  (`setReportReady`), con optimistic UI como el toggle existente.

**Fase C — editar el ítem en el lugar (override de esa visita, D6):**
- Ícono lápiz por ítem → panel de edición inline (reusar la forma del `ItemForm` de Plantillas,
  extraído a un componente compartido o replicado liviano) que edita el `checklist_items`
  materializado vía `updateChecklistItem`. Deja claro en copy que **aplica solo a esta visita**.
- (Opcional, si el Director lo quiere) borrar/agregar ítems de esa visita — la RLS lo permite
  (DELETE es gerencia-only). Se decide al implementar; el núcleo del pedido es **editar**.

## 8. UI — Fase D · Alerta persistente

- `TrackAlertsView` y `NotificationsMenu` suman la fuente `useReportAlerts()` a las alertas de
  `useVisitAlerts()`. Se unifica el render de filas para dos tipos de alerta:
  - Ventana vencida (roja) · Ítem vencido (ámbar) — existentes.
  - **Reporte pendiente de revisar · hace X** (nuevo; ícono `clipboardCheck`/`fileText`, color
    propio dentro de la paleta Sereno).
- El badge de la campana pasa a contar `alertas + reportes`. Al **marcar listo**, la fila
  desaparece en el próximo `refetch`.
- El pie de leyenda de `TrackAlertsView` suma la referencia del nuevo estado.

## 9. Migración `0063_checklist_reportes.sql`

Una sola migración con todo el schema (el front va en fases, pero el Director aplica una vez):

1. `alter table checklist_template_items add column if not exists has_report boolean not null
   default false;` + `add column if not exists report_eta_hours integer;` + check lenient.
2. `alter table checklist_items add column ...` (las mismas dos, snapshot).
3. `create table checklist_report_ready` + policies (espejo de completions) + `grant` + trigger de
   auditoría.
4. `create or replace function materialize_checklist()` (copia las dos columnas).
5. `create view v_report_alerts` + grants.

**Numeración / coordinación:** en la rama actual (`feat/carga-visitas-historicas`) están 0060 y
**0062** (ivrs); la **0061** queda reservada para "Procedimientos por visita" (PR #16, sin
mergear acá). Esta feature toma **0063**. No recrea `v_track_visits`/`v_patient_visits` ni el enum
`visit_status`, así que no pisa a 0061/0062 aunque se apliquen en cualquier orden. **A confirmar
el número final con el Director** al momento de aplicar (regla dura #2/#3). Legacy-safe: columnas
nullable/`default false`, check lenient, tabla e índice nuevos → no rompe filas viejas.

Rama propia recomendada: `feat/checklist-reportes` (esta feature es independiente de la carga de
visitas históricas; stagear por ruta, verificar rama antes de commitear — working copy compartido).

## 10. Fases de entrega (shippables)

| Fase | Alcance | DB | Front |
|---|---|---|---|
| **A** | Tipo de ítem en Plantillas | cols en template_items + materialize | templates.ts, ItemForm |
| **B** | Ver/marcar reporte listo en el modal | tabla report_ready + RLS + audit | dayVisits.ts, VisitChecklist (estado + botón) |
| **C** | Edición inline del ítem en el modal | (RLS ya existe) | updateChecklistItem, panel de edición |
| **D** | Alerta persistente | vista v_report_alerts | useReportAlerts, TrackAlertsView, NotificationsMenu |

El schema de A+B+D va junto en la 0063 (aplicación única); el front se entrega por fase (typecheck
verde + verificación en preview por fase). C no necesita DB.

## 11. Verificación (sin suite de tests)

`npm run typecheck` verde + verificación en el preview (login QA) por fase:
- **A:** crear/editar un ítem de plantilla con reporte + ETA; ver la píldora.
- **B:** marcar una visita como atendida, abrir el modal, ver el ítem con "Reporte pendiente";
  marcar listo → pasa a "Listo ✓"; reabrir.
- **C:** editar la descripción/ETA de un ítem desde el modal; confirmar que **otra** visita del
  mismo protocolo no cambió (override por-visita).
- **D:** con una visita cuya ETA ya venció y reporte sin marcar, confirmar la alerta en campana +
  Alertas; marcar listo → desaparece.

## 12. Riesgos / fuera de alcance

- **Recordatorio programado real (mail/push):** fuera de alcance (necesita infra nueva). La alerta
  es persistente y calculada al leer (D3).
- **Estado intermedio "reporte llegó pero sin firmar":** fuera de alcance (D7, binario). La tabla
  `checklist_report_ready` deja lugar para sumarlo después sin rediseño.
- **Datos reales en prod:** la migración es legacy-safe; no toca datos, solo agrega estructura.
  Para probar, registros `TEST-*` propios (regla dura #1).
- **Colisión de migraciones:** mitigada por no recrear las vistas grandes ni el enum; confirmar el
  número final con el Director (regla dura #2/#3).
- **Doble reloj (deadline vs ETA):** documentar en UI que son cosas distintas para no confundir a
  la coordinadora (un ítem puede estar "completo" con el reporte aún pendiente, y al revés).

---

## Referencias

- Checklist materializado / completions: [0002:150-180](../../../supabase/migrations/0002_tables.sql),
  `materialize_checklist` [0022:89-111](../../../supabase/migrations/0022_visitas_unificadas.sql).
- RLS de checklist: [0006:188-212](../../../supabase/migrations/0006_rls_policies.sql),
  descompletar [0023:262-263](../../../supabase/migrations/0023_track_visita_dia.sql).
- `computed_status`/`item_vencido`: [0049:92-109](../../../supabase/migrations/0049_pvm_wait_and_demographics.sql).
- Alertas: [`useVisitAlerts`](../../../src/data/visits.ts),
  [`TrackAlertsView.tsx`](../../../src/views/TrackAlertsView.tsx),
  [`NotificationsMenu.tsx`](../../../src/shell/NotificationsMenu.tsx).
- Auditoría: `audit_row` [0003:195](../../../supabase/migrations/0003_functions_triggers.sql).
