# Procedimientos tildables en el modal de visita — Design

- **Fecha:** 2026-07-22
- **Estado:** aprobado (brainstorming), pendiente de plan de implementación
- **Módulo:** Track
- **Migración nueva:** `0064_procedimientos_completados.sql` (aplicar a mano en prod)
- **Depende de:** 0061 (procedimientos por visita / `procedures` + `protocol_activities` revivida)

## Contexto y objetivo

La migración 0061 introdujo el cuadro de procedimientos por **definición de visita** (Schedule
of Assessments): en el cronograma del protocolo, cada `visit_definitions` declara qué
procedimientos lleva, vía `protocol_activities` (join a `procedures`, catálogo global). El commit
de 0061 dejó explícitamente **diferida** la "superficie en ejecución": ver y registrar esos
procedimientos en la visita concreta del paciente.

Este trabajo cubre esa superficie: en el **modal de detalle de visita** (`VisitDetail`), dentro de
la sección plegable del checklist, mostrar el listado de procedimientos que el cronograma le asigna
a esa visita y permitir **tildarlos como realizados** en esa visita concreta.

## Decisiones tomadas (brainstorming)

1. **Mostrar y tildar** (no solo lectura). Cada procedimiento se puede marcar como hecho en la
   visita. Esto exige estado de completado por visita.
2. **El estado vive en una tabla nueva** (`visit_procedure_completions`, migración 0064) que espeja
   `checklist_completions`. Se descartó `patient_timeline` (la idea diferida original) porque es un
   log insert-only/inmutable y el tilde es un toggle on/off: insert para tildar, delete para
   destildar encaja con una tabla de completado, no con un log de auditoría.

## Modelo mental

- **Asignación** (qué procedimientos lleva la visita): por `visit_definitions`, ya existe
  (`protocol_activities.visit_def_id → procedure_id`, con orden en `suggested_order`). Se edita en
  el cronograma. **No se toca acá.**
- **Ejecución** (qué se hizo en la visita del paciente): por `patient_visits`. Es lo nuevo.

La clave del completado es **`(visit_id, procedure_id)`**, NO `protocol_activities.id`. Razón: el
tilde debe sobrevivir a que se reordene o reasigne el cronograma. `set_visit_procedures` borra e
inserta filas de `protocol_activities`; atar el completado a esas filas perdería el estado ante
cualquier edición del cuadro. Atado a `procedure_id` + `visit_id`, el completado es estable y sólo
desaparece si se borra la visita o el procedimiento del catálogo (cascade correcto).

## 1 · Base de datos — `0064_procedimientos_completados.sql`

Tabla nueva, espejo de `checklist_completions` (0002). SQL previsto (listo para correr tal cual,
idempotente; la tabla es nueva así que no hay filas legacy que endurecer):

```sql
-- Spira · Migración 0064 — Track: procedimientos completados por visita
-- Superficie en EJECUCIÓN de los procedimientos del cuadro (0061). Estado de "hecho" por
-- visita concreta (patient_visits), toggleable. Espeja checklist_completions.
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), en orden, DESPUÉS de la 0063.
-- IDEMPOTENTE: re-ejecutable. Registrar en supabase/README.md al confirmarse en prod.

create table if not exists public.visit_procedure_completions (
  id            uuid primary key default uuid_generate_v4(),
  visit_id      uuid not null references public.patient_visits(id) on delete cascade,
  procedure_id  uuid not null references public.procedures(id)     on delete cascade,
  completed_by  uuid not null default auth.uid() references public.users(id),  -- default = quien tilda (anti-spoofing)
  completed_at  timestamptz not null default now(),
  unique (visit_id, procedure_id)   -- un procedimiento se tilda una sola vez por visita
);
comment on table public.visit_procedure_completions is
  'Procedimientos del cuadro (0061) realizados en una visita concreta. Clave (visit_id, procedure_id): estable ante ediciones del cronograma. Espeja checklist_completions.';

create index if not exists ix_vpc_visit on public.visit_procedure_completions (visit_id);

alter table public.visit_procedure_completions enable row level security;

-- SELECT: gerencia o quien coordina la visita (mismo criterio que checklist_completions).
drop policy if exists "ver procedimientos completados" on public.visit_procedure_completions;
create policy "ver procedimientos completados" on public.visit_procedure_completions for select using (
  public.has_module('gerencia') or public.coordina_visita(visit_id)
);

-- INSERT (tildar): completed_by = auth.uid() (anti-spoofing) y coordina la visita / gerencia.
drop policy if exists "track tilda procedimiento" on public.visit_procedure_completions;
create policy "track tilda procedimiento" on public.visit_procedure_completions for insert with check (
  completed_by = auth.uid() and (public.has_module('gerencia') or public.coordina_visita(visit_id))
);

-- DELETE (destildar): coordina la visita / gerencia.
drop policy if exists "track destilda procedimiento" on public.visit_procedure_completions;
create policy "track destilda procedimiento" on public.visit_procedure_completions for delete using (
  public.has_module('gerencia') or public.coordina_visita(visit_id)
);

-- Auditoría: el completado de un procedimiento deja rastro (igual que procedures/protocol_activities en 0061).
drop trigger if exists trg_audit_visit_procedure_completions on public.visit_procedure_completions;
create trigger trg_audit_visit_procedure_completions after insert or update or delete
  on public.visit_procedure_completions for each row execute function public.audit_row();
```

Notas:
- `coordina_visita(visit_id)` es el helper existente usado por las policies de `checklist_completions`
  (0006). Reusarlo mantiene un solo criterio de "quién opera esta visita".
- Sin UPDATE (no hay campos mutables; el toggle es insert/delete, como el checklist).
- Registrar en el índice de `supabase/README.md` (**Aplicada en prod (fecha)**) apenas el Director
  confirme; CI lo vigila con `scripts/check-migraciones.mjs`.

## 2 · Capa de datos — `src/data/procedures.ts`

Dos agregados, siguiendo el patrón del archivo (lecturas = hooks `useXxx`; mutaciones = async):

**`useVisitProcedureStatus(visitId, visitDefId)`** — lista de procedimientos de la visita con su
estado. Dos consultas unidas en el cliente (mismo enfoque que `useVisitChecklist`, que evita
acoplarse al embed de PostgREST y respeta la RLS de cada tabla):

1. `protocol_activities` por `visit_def_id`, con el catálogo embebido (reusa la forma de
   `useVisitProcedures`): `procedure_id, suggested_order, procedure:procedures(code, name, category, requires_dispensation)`, ordenado por `suggested_order` luego `created_at`.
2. `visit_procedure_completions` por `visit_id`: `procedure_id, completed_at, completed_by`.

Merge → `VisitProcedureStatus[]` con `{ procedure_id, code, name, category, requires_dispensation, completed, completed_at, completed_by }`. Con `visitId` o `visitDefId` en null → devuelve `[]` sin consultar (visitas sueltas o sin definición).

**`toggleVisitProcedure(visitId, procedureId, completed)`** — clon de `toggleChecklistItem`:
- tildar → `insert { visit_id, procedure_id }` en `visit_procedure_completions` (el `completed_by`
  lo pone el default de la columna; no se manda desde el cliente).
- destildar → `delete` por `visit_id` + `procedure_id`.
- Patrón "0 filas afectadas = sin permiso" con mensaje sereno (RLS filtra en silencio). Traducir
  códigos con el `proceduresErrorMessage` existente.

## 3 · UI — `src/views/track/VisitProcedures.tsx` (nuevo) + `VisitDetail.tsx`

**Componente nuevo `VisitProcedures.tsx`**, que espeja el visual e interacción de `VisitChecklist`:
- Recibe `{ visitId, visitDefId, accent, readOnly }`.
- Encabezado con eyebrow "Procedimientos" + contador `hechos/total` (como el checklist).
- Filas tildables: botón con caja de check (tilde = relleno acento + ✓; sin tildar = borde), nombre
  del procedimiento y, debajo, la categoría en muted. Badge sutil si `requires_dispensation`.
- Tilde **optimista** con rollback ante error y estado `pending` por fila (igual que `VisitChecklist`).
- `readOnly` → filas de solo lectura (sin toggle), para el contexto `patient` (ficha).
- Estados: cargando; error sereno; si no hay procedimientos asignados → el componente no renderiza
  nada (no muestra bloque vacío).

**Montaje en `VisitDetail.tsx`**: dentro de la sección plegable existente (el `showChecklist`),
arriba de `<VisitChecklist>`, se renderiza `<VisitProcedures visitId visitDefId={visit.visit_def_id} accent readOnly={readOnly} />`. A diferencia del checklist (que se materializa recién con la visita
Atendida), los procedimientos se ven siempre que la definición tenga alguno — son el plan de la
visita, conocido de antemano. `visit.visit_def_id` ya está disponible en `DayVisitRow`
(vía `TrackVisitRow`; nullable para sueltas).

## Bordes / edge cases

- **Visita suelta** (`visit_def_id` null) o **definición sin procedimientos** → el bloque no se
  muestra (el hook devuelve `[]`, el componente no renderiza).
- **Contexto `patient` (ficha, `readOnly`)** → procedimientos visibles pero no tildables.
- **RLS silenciosa** → toggle con 0 filas = sin permiso, mensaje calmo; no se asume éxito.
- **Edición del cronograma** (agregar/quitar procedimientos de la definición) → el completado atado a
  `(visit_id, procedure_id)` sobrevive; si se quita un procedimiento del cuadro, deja de aparecer en
  la lista (su completion queda huérfana pero inocua; no se borra en cascade porque no referencia
  `protocol_activities`).

## Fuera de alcance (YAGNI)

- Notas por procedimiento completado, hora/responsable visibles en la UI (la tabla los guarda; la UI
  v1 no los muestra).
- Registro en `patient_timeline` / grilla SoA cross-visita / herencia entre visitas (siguen diferidos
  de 0061).
- Bloquear el tilde según etapa de la visita (Atendida, etc.): v1 permite tildar siempre que se pueda
  operar la visita; la RLS ya acota a quién.

## Verificación

- `npm run typecheck` verde.
- **Aplicar 0064 en prod antes de probar la escritura** (el tilde falla sin la tabla). Registrar en
  `supabase/README.md`.
- Navegador: abrir una visita de una definición con procedimientos, tildar/destildar, recargar y
  confirmar persistencia; verificar que una visita suelta no muestra el bloque; verificar solo-lectura
  desde la ficha del paciente.

## Archivos afectados

- `supabase/migrations/0064_procedimientos_completados.sql` (nuevo)
- `supabase/README.md` (índice de migraciones)
- `src/data/procedures.ts` (hook + toggle)
- `src/views/track/VisitProcedures.tsx` (nuevo)
- `src/views/track/VisitDetail.tsx` (montaje del bloque)
