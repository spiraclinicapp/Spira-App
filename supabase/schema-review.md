# Reporte de Remediación — Schema Spira (Supabase/Postgres)

> ✅ **ESTADO: RESUELTO (2026-06-06).** Todos los hallazgos de abajo se aplicaron sobre
> `schema.sql` (decisión Pharma central). Una segunda ronda de verificación adversarial
> detectó además un bug introducido al aplicar (faltaba la columna `audit_log.db_role`),
> 2 huecos de anti-spoofing/flujo y 8 residuales de endurecimiento — todos corregidos.
> Veredicto final de verificación: **GO** (ejecutable, sin fugas de RLS conocidas).
>
> ---

> Generado por revisión adversarial multi-agente (2026-06-06): 6 revisores por dimensión
> (2 de RLS), verificación adversarial de cada hallazgo, crítico de completitud y síntesis.
> 57 hallazgos brutos → **26 confirmados** + **13 adicionales** del crítico.
> Línea de referencia = `supabase/schema.sql`.
>
> **Patrón raíz dominante:** *aislamiento multi-protocolo ausente*. Casi todas las policies
> `track`/`pharma`/`contable` validan solo el módulo (`auth.has_module(...)`) sin validar
> pertenencia al protocolo coordinado, y varias inserciones permiten falsificar el actor
> (`actor_id`/`user_id`/`completed_by`).

---

## ALTO

### Seguridad / RLS

**A1. `patient_visits` UPDATE sin scoping ni WITH CHECK** — policy línea 903.
Cualquier usuario `track` puede modificar `real_date`/`notes`/`enrollment_id` de visitas de cualquier protocolo, falsificando registros y disparando materialización de checklist.
```sql
drop policy if exists "track modifica visitas" on public.patient_visits;
create policy "track modifica visitas propias" on public.patient_visits for update
  using (auth.has_module('gerencia') or exists (
    select 1 from public.enrollments e
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
    where e.id = patient_visits.enrollment_id and pc.user_id = auth.uid()))
  with check (auth.has_module('gerencia') or exists (
    select 1 from public.enrollments e
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
    where e.id = patient_visits.enrollment_id and pc.user_id = auth.uid()));
```

**A2. `checklist_completions` INSERT permite marcar ítems de cualquier protocolo + spoofing de `completed_by`** — policy línea 914.
Corrompe el audit trail y el cálculo de estado en `v_patient_visits`.
```sql
drop policy "track completa items" on public.checklist_completions;
create policy "track completa items validado" on public.checklist_completions for insert
  with check (
    completed_by = auth.uid() and (
      auth.has_module('gerencia') or exists (
        select 1 from public.checklist_items ci
        join public.patient_visits pv on pv.id = ci.visit_id
        join public.enrollments e on e.id = pv.enrollment_id
        join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
        where ci.id = checklist_completions.item_id and pc.user_id = auth.uid())));
```
Defensa en profundidad: trigger `BEFORE INSERT` que fuerce `completed_by := auth.uid()`, `completed_at := now()`.

**A3. `patient_timeline` INSERT sin validación de protocolo + spoofing de `actor_id`** — policy líneas 924-925.
Permite contaminar audit trails de protocolos ajenos y suplantar al actor. (El cambio de FK que sugirió un revisor era innecesario; el fix real es la policy.)
```sql
drop policy "track/pharma registran eventos" on public.patient_timeline;
create policy "track/pharma registran eventos validado" on public.patient_timeline for insert
  with check (
    actor_id = auth.uid() and (
      (auth.has_module('track') and exists (
        select 1 from public.patient_visits pv
        join public.enrollments e on e.id = pv.enrollment_id
        join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
        where pv.id = patient_timeline.visit_id and pc.user_id = auth.uid()))
      or auth.has_module('pharma')   -- farmacia central, no romper handoff de dispensación
      or auth.has_module('gerencia')));
```

**A4. `dispensation_requests` INSERT sin WITH CHECK de protocolo** — policy líneas 949-950.
```sql
drop policy "track crea solicitudes" on public.dispensation_requests;
create policy "track crea solicitudes validado" on public.dispensation_requests for insert
  with check (
    auth.has_module('track') and requested_by = auth.uid() and exists (
      select 1 from public.patient_visits pv
      join public.enrollments e on e.id = pv.enrollment_id
      where pv.id = visit_id and auth.is_assigned_coordinator(e.protocol_id)));
```
Aplicar el mismo razonamiento al UPDATE (líneas 951-952).

**A5. `dispensations` UPDATE sin WITH CHECK** — policy línea 962. Un `pharma_operator` puede mutar `executed_by`/`notes` y camuflar quién ejecutó. Añadir `with check (auth.has_module('pharma'))` (ideal + trigger de transición de estado válida).

**A6. `protocol_activities` SELECT cross-protocol** — policy líneas 864-865.
```sql
create policy "ver actividades scoped" on public.protocol_activities for select using (
  auth.has_module('gerencia') or exists (
    select 1 from public.protocol_coordinators pc
    where pc.protocol_id = protocol_activities.protocol_id and pc.user_id = auth.uid()));
```

**A7. `visit_definitions` SELECT cross-protocol** — policy líneas 869-870. Mismo problema y fix que A6 (validar vía `protocol_coordinators`).

**A8. `v_billing_dispensations` / `dispensations` SELECT exponen todos los protocolos a `contable`** — vista 728-750, policy 959-960.
**Decisión de negocio requerida** (ver M14): si `contable`/`pharma` son roles centrales que legítimamente ven todo, documentarlo y bajar a info. Si no, aplicar el join `protocol_coordinators` en la policy SELECT de `dispensations` (la vista hereda el filtro de la tabla base).

**A9. `medication_receptions` INSERT sin WITH CHECK de acceso a protocolo** — policy línea 942. Depende de la decisión M14; mínimo inmediato `with check (auth.has_module('pharma'))`.

### Integridad referencial / lógica

**A10. `dispensation_items`: par (`medication_id`, `lot_id`) incoherente** — líneas 424-432.
```sql
alter table public.medication_lots
  add constraint uq_medication_lots_id_medication unique (id, medication_id);
alter table public.dispensation_items
  add constraint fk_dispensation_item_lot_medication
  foreign key (lot_id, medication_id)
  references public.medication_lots (id, medication_id) on delete restrict;
```

**A11. `apply_dispensation_stock` falla silencioso si la dispensación no tiene ítems** — líneas 622-633. `RAISE WARNING` NO sirve; usar:
```sql
if not exists (select 1 from public.dispensation_items where dispensation_id = new.id) then
  raise exception 'No se puede entregar la dispensacion % sin renglones', new.id using errcode = 'check_violation';
end if;
```

**A12. `apply_dispensation_stock` race condition en decremento de stock** — líneas 617-637. Lockear el lote (`perform 1 from medication_lots where id = it.lot_id for update;`) y validar antes de actualizar.

**A13. `apply_reception_stock` no valida `medication.protocol_id = reception.protocol_id`** — líneas 571-594.
```sql
if not exists (select 1 from public.medications m
               where m.id = r.medication_id and m.protocol_id = new.protocol_id) then
  raise exception 'medication % no pertenece al protocolo % de la recepcion', r.medication_id, new.protocol_id;
end if;
```

**A14. `dispensation_request_items` / `dispensation_items`: medicación de otro protocolo** — líneas 401-406 y 424-432. Trigger `BEFORE INSERT/UPDATE` que compare `medication.protocol_id` contra el protocolo derivado de la cadena `request/dispensation → visit → enrollment` (un CHECK con subquery no es válido en Postgres).

---

## MEDIO

**M1. `checklist_items` FOR ALL sin scoping** — policy línea 912. Reemplazar por INSERT/UPDATE/DELETE validando protocolo; helper recomendado:
```sql
create or replace function auth.coordina_visita(v_visit_id uuid)
returns boolean language sql security definer stable set search_path = pg_catalog, public as $$
  select exists (select 1 from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
    where pv.id = v_visit_id and pc.user_id = auth.uid());
$$;
```
(El trigger `materialize_checklist` es SECURITY DEFINER → no afectado por RLS.)

**M2. `agenda_notes` INSERT permite `user_id` arbitrario** — línea 299, policy 918.
```sql
drop policy "track crea notas" on public.agenda_notes;
create policy "track crea notas propias" on public.agenda_notes for insert
  with check (auth.has_module('track') and user_id = auth.uid());
alter table public.agenda_notes alter column user_id set default auth.uid();
```

**M3. `dispensation_request_items` / `dispensation_items` items sin scoping de protocolo** — líneas 955 y 965. Aplicar el join `…→visit→enrollment→protocol_coordinators`. Depende de scopear también las policies padre (A8).

**M4. `patients` UPDATE sin scoping** — policy línea 884.
```sql
drop policy "track edita pacientes" on public.patients;
create policy "track edita pacientes propios" on public.patients for update
  using (auth.has_module('gerencia') or exists (
    select 1 from public.enrollments e
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
    where e.patient_id = patients.id and pc.user_id = auth.uid()));
```

**M5. `enrollments` UPDATE permite mutar campos de auditoría** — policy líneas 891-892. Añadir WITH CHECK que congele `enrolled_by`/`patient_id`/`enrollment_date`, o restringir UPDATE a `status`/`notes`/`treating_physician`.

**M6. `checklist_templates` SELECT expone plantillas de otros protocolos** — policy línea 906.
```sql
... using (auth.has_module('gerencia') or protocol_id is null or exists (
  select 1 from public.protocol_coordinators pc
  where pc.protocol_id = checklist_templates.protocol_id and pc.user_id = auth.uid()));
```

**M7. Helpers RLS SECURITY DEFINER sin `search_path` fijo** — `auth.has_module` (811), `auth.has_role` (819), `auth.is_assigned_coordinator` (827).
```sql
alter function auth.has_module(spira_module) set search_path = pg_catalog, public;
alter function auth.has_role(spira_module, module_role) set search_path = pg_catalog, public;
alter function auth.is_assigned_coordinator(uuid) set search_path = pg_catalog, public;
```

**M8. Sin policies DELETE para gerencia en tablas críticas** — `protocols`, `patients`, `enrollments`, `dispensation_requests`, `dispensations`. Con RLS habilitado y sin policy DELETE, **nadie** puede borrar.
```sql
create policy "gerencia elimina protocolos"     on public.protocols             for delete using (auth.has_module('gerencia'));
create policy "gerencia elimina pacientes"      on public.patients              for delete using (auth.has_module('gerencia'));
create policy "gerencia elimina enrolamientos"  on public.enrollments           for delete using (auth.has_module('gerencia'));
create policy "gerencia elimina solicitudes"    on public.dispensation_requests for delete using (auth.has_module('gerencia'));
create policy "gerencia elimina dispensaciones" on public.dispensations         for delete using (auth.has_module('gerencia'));
```
**NO** agregar DELETE a `stock_movements`, `audit_log`, `patient_timeline` (insert-only por ANMAT).

**M9. `stock_movements.lot_id` con `ON DELETE SET NULL`** — línea 439. Cambiar a RESTRICT (no forzar NOT NULL — `ajuste_manual` puede no tener lote).

**M10. `reception_items` sin UNIQUE (`reception_id`, `medication_id`, `lot_number`)** — líneas 372-379. El mismo lote dos veces → `apply_reception_stock` suma duplicado.

**M11. Tablas sin trigger `audit_row()`** — `checklist_completions`, `patient_visits`, `dispensation_items`, `medication_receptions`.
```sql
create trigger trg_audit_checklist_completions after insert or update or delete on public.checklist_completions for each row execute function public.audit_row();
create trigger trg_audit_patient_visits        after update or delete            on public.patient_visits        for each row execute function public.audit_row();
create trigger trg_audit_dispensation_items    after insert or update or delete on public.dispensation_items    for each row execute function public.audit_row();
create trigger trg_audit_receptions            after insert or update or delete on public.medication_receptions for each row execute function public.audit_row();
```

**M12. Recepción verificada no registra quién verificó** — añadir `verified_by`/`verified_at` a `medication_receptions` + trigger BEFORE UPDATE (antes de `trg_apply_reception_stock`) + atribuir el `stock_movement` a quien verificó.

**M13. `auth.uid()` NULL en `audit_row()` para DML directo** — línea 650. Añadir `db_role text` y `actor = coalesce(auth.uid(), nullif(current_setting('app.actor_id',true),'')::uuid)`.

**M14. Sin segregación pharma↔protocolo** — diseño global (no existe `pharma_assignments`). **Decisión de negocio bloqueante**: si la farmacia es central por diseño, documentarlo (degrada A8/A9/M3 a info). Si no, crear `pharma_assignments(user_id, protocol_id, assigned_at)` análoga a `protocol_coordinators`.

---

## BAJO

**B1. `medication_lots` FOR ALL permite DELETE a pharma** — línea 937. Separar INSERT/UPDATE (pharma) de DELETE (gerencia).

**B2. `stock_movements.reference_type` TEXT sin constraint** — líneas 442-443.
```sql
alter table public.stock_movements add constraint check_stock_movement_reference_type
  check (reference_type is null or reference_type in ('reception','dispensation','ajuste_manual','devolucion','vencimiento'));
```

**B3. `dispensations` permite dispensar contra request en estado terminal** — línea 411. Trigger `BEFORE INSERT` que rechace `request.status IN ('rechazada','cancelada')` (con `FOR UPDATE`).

**B4. Funciones helper en schema `auth` en lugar de `public`** — líneas 811-833. Mover a `public` + actualizar referencias, o mínimo aplicar el hardening de `search_path` (M7).

---

## INFO

**I1. Sin GRANTs explícitos en vistas** — los default privileges de Supabase ya cubren `authenticated` y RLS es el control efectivo. Lo valioso: **revocar de `anon`**: `revoke all on all tables in schema public from anon;`.

---

## Veredicto

**NO está listo para producción.** Defecto sistémico de aislamiento multi-protocolo: casi todas las policies de escritura de `track`/`pharma` validan solo el módulo y no el protocolo coordinado, y varias inserciones de auditoría permiten falsificar el actor. Un coordinador puede leer, falsificar registros y disparar flujos de farmacia sobre protocolos ajenos de extremo a extremo — incompatible con la trazabilidad ANMAT exigida.

**Bloqueantes para liberar:** (1) cerrar el bloque RLS Alto (A1-A9) + M1/M4/M5; (2) resolver la decisión M14 (¿pharma central o segregado?), que define el alcance de A8/A9/M3; (3) las correcciones de integridad/auditoría A10-A14 y M9-M13 para un audit trail íntegro. El hardening (M7), los DELETE de gerencia (M8) y los constraints menores (Bajo) son obligatorios pero no condicionan la arquitectura.

---

# Ronda 2 — Traspaso de Track (2026-06-12)

> ✅ **ESTADO: RESUELTO.** Revisión adversarial de los cambios SQL del traspaso de Track
> (migraciones `0013` `v_track_visits`, `0014` scoping de plantillas, y el script
> `scripts/etapa0-preparacion.sql`) **antes** de aplicarlos en prod. Dos revisores
> independientes (RLS/privilegios + integridad/idempotencia), cada hallazgo verificado a
> mano. Veredicto: los cambios **no introducen fuga de aislamiento ni escalada**; se
> aplicaron 4 endurecimientos. Quedan 2 mejoras de atomicidad del cliente (no-RLS) como
> recomendación.

## Verificado sin agujero (falsos positivos descartados)

- **Vista `v_track_visits` (0013) NO filtra el aislamiento por protocolo.** `security_invoker = true`
  encadenado con `v_patient_visits` (también invoker): cada tabla base del join
  (patient_visits, enrollments, protocols, patients, visit_definitions) tiene su SELECT
  scopeado por `protocol_coordinators`. El INNER JOIN colapsa a vacío para protocolos no
  coordinados. **Pharma ve la vista vacía** (no tiene SELECT en patient_visits). Correcto.
- **0014 no afloja la escritura.** Un operator no-asignado NO puede crear/editar la plantilla
  global ni una de protocolo ajeno; no puede colgar ítems de un template ajeno ni crear un
  template con `protocol_id null` "disfrazado". Admin/gerencia conservan acceso. El trigger
  `materialize_checklist` (SECURITY DEFINER) no se ve afectado.
- **El script no rompe invariantes ni dispara guards.** Solo inserta (no UPDATE → guards de
  inmutabilidad no corren); `patient_visits` INSERT no dispara auditoría (su trigger es
  AFTER UPDATE/DELETE) ni materialización (es AFTER UPDATE de `real_date`). La aritmética de
  la retro-generación es idéntica al trigger `generate_patient_visits`. Nombres de columna y
  JOINs de la vista verificados contra el schema.

## Aplicado (4 endurecimientos)

**R2-1 (BAJO/higiene) · grant de escritura residual en `v_track_visits`.** Los `default
privileges` de 0007 (`grant all on tables`) le dan a `authenticated` insert/update/delete sobre
toda vista nueva; el `grant select` de 0013 no lo revocaba. Inerte hoy (la vista es un join, no
actualizable), pero se revocó por higiene y para que el contrato "solo lectura" sea explícito.
→ `revoke insert,update,delete,truncate,references,trigger ... from authenticated` en 0013 y en el script.

**R2-2 (MEDIO) · lectura de ítems de plantilla sin scopear (hueco preexistente de 0006).**
`"ver items plantilla"` era `has_module('track')` — cualquier viewer de track leía vía PostgREST
los ítems de la plantilla de cualquier protocolo ajeno (mientras que `"ver plantillas"`, la fila
template, sí scopeaba). 0014 endurecía la escritura pero dejaba esta lectura abierta. Se alineó con
`"ver plantillas"`: global visible a todo track; las de protocolo, solo a la coordinadora asignada;
admin/gerencia por el `using` de "lideres items plantilla". → nuevo `alter policy` en 0014.

**R2-3 (MEDIO) · retro-generación de `patient_visits` no scopeada a los protocolos demo.** El
INSERT de `visit_definitions` filtraba por los 3 códigos demo, pero el de `patient_visits` no:
iteraba sobre todo enrolamiento cuyo protocolo tuviera defs. Se agregó el mismo filtro de código
demo. → `where p.code in ('EFC18244','EFC18419','ACT18301')` en el script.

**R2-4 (MEDIO) · guard de la retro-generación a nivel enrolamiento entero.** El `not exists` por
enrolamiento saltea el enrolamiento completo si tiene visitas *parciales* → nunca completa las
faltantes (silencioso). Se cambió a guard por par `(enrollment_id, visit_def_id)`: idempotente y
self-healing. → en el script.

## Recomendado (atomicidad del cliente — NO es RLS, diferido a decisión del usuario)

**R2-5 (MEDIO) · `createProtocolTemplate` no atómico** (`src/data/templates.ts`). Inserta el
template y luego sus ítems en dos llamadas; si la 2ª falla queda un **template de protocolo vacío**.
Como `materialize_checklist` prioriza la plantilla del protocolo aunque esté vacía, suprime
silenciosamente el checklist global para ese protocolo → visitas que saltan a `completa` sin
checklist. Baja probabilidad (solo ante fallo de red entre las dos llamadas) y visible/recuperable
en la UI. **Fix propuesto:** RPC `SECURITY DEFINER` que inserte template+ítems en una transacción,
con authz a mano (mismo patrón que `create_patient_with_enrollment` 0012).

**R2-6 (BAJO) · `swapItemOrder` no atómico** (`src/data/templates.ts`). Dos UPDATEs de `sort_order`;
si el 2º falla quedan dos ítems con el mismo orden (orden no determinista entre ellos). Cosmético,
recuperable, sin pérdida de datos. **Fix propuesto:** RPC con un único `update ... set sort_order =
case id ...` (atómico).

## Veredicto Ronda 2

**Los cambios SQL del traspaso (0013, 0014, script) son seguros de aplicar en prod tras los 4
endurecimientos R2-1..R2-4** (ya incorporados). No introducen fuga de aislamiento por protocolo ni
escalada. R2-5/R2-6 son mejoras de atomicidad del cliente (no afectan la seguridad RLS de la SQL que
se pega) y quedan como recomendación para una migración 0015 con RPCs si se quiere cerrarlas.
