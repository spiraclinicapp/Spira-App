# Pharma: desplegable de "asignar medicación al paciente" → catálogo global · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan checkbox (`- [ ]`) syntax.

**Goal:** El desplegable de "Agregar" en la card "Medicación asignada" del paciente pasa de mostrar solo lo ya recibido en el protocolo (`protocol_medications`) a mostrar el catálogo global completo, con la cantidad de este protocolo como dato informativo (puede ser 0) — manteniendo el candado de coherencia protocolo↔medicamento, pero permitiendo avanzar después de un aviso explícito en vez de un bloqueo duro.

**Architecture:** Un RPC nuevo (`assign_patient_medication`, migración `0051`) reemplaza el `insert` directo de `assignPatientMedication()`. Si el medicamento nunca se recibió para el protocolo, el RPC no inserta nada y devuelve `needs_confirmation = true`; si el usuario confirma explícitamente, el RPC asocia el medicamento al protocolo (mismo upsert idempotente que ya hace recibir, migración 0040) y recién ahí asigna. El trigger `check_patient_med_protocol` (0050) y la RLS de `patient_medications` NO se tocan: siguen siendo el candado de última instancia para cualquier insert que no pase por este RPC. En la UI, la card cambia la fuente del desplegable de `useStock(protocolId)` a `useMedications()` (catálogo global) y agrega un estado de aviso inline que **reemplaza** la fila del buscador cuando `needsConfirmation` vuelve `true`.

**Tech Stack:** PostgreSQL / Supabase (PostgREST + RLS + triggers plpgsql) para el RPC. React + TypeScript (strict) para la capa de datos y la UI; `SearchableSelect` como desplegable de la casa.

**Spec:** [`docs/superpowers/specs/2026-07-14-pharma-medicacion-paciente-catalogo-global-design.md`](../specs/2026-07-14-pharma-medicacion-paciente-catalogo-global-design.md) (incluye la revisión de diseño resuelta: D1 el aviso reemplaza la fila, D2 tinte "Atención").

## Global Constraints (del proyecto, copiar verbatim)

- **Migraciones inmutables y numeradas.** Esta es la **`0051`** (la última aplicada es la 0050). Nunca editar ni renumerar una aplicada; todo cambio nuevo es un archivo nuevo.
- **No hay SQL programático a prod.** El schema se aplica **a mano en el dashboard de Supabase, en orden**, por el Director. El agente NUNCA asume que puede correr SQL contra prod — Task 2 tiene puntos de handoff explícitos.
- **Datos reales en prod.** Probar solo con registros prefijo `TEST-*` y borrar **exactamente** esos. Nunca borrado en lote por categoría.
- **Gate de verificación: no hay suite de tests** (`package.json` no tiene test runner). Para el RPC: harness SQL con checks explícitos (`raise notice '... PASS'` / `raise exception '... FALLÓ'`). Para TS: `npm run typecheck` (verde) + verificación manual en el navegador (preview en el puerto 5250, no el 5173).
- **Errores → mensajes serenos en castellano** vía `pharmaErrorMessage` (`src/data/pharma/errors.ts`) — ya cubre 42501/23505/23514, no hay que tocarlo.
- **Idioma:** comentarios, nombres de dominio y copy de UI en castellano rioplatense.
- **Stagear por ruta** (`git add <archivos>`), nunca `git add -A` — el working copy es compartido.

---

## File Structure

- **Create:** `supabase/migrations/0051_pharma_asignar_medicacion_catalogo_global.sql` — el RPC `assign_patient_medication`.
- **Create:** `docs/bitacora/2026-07-14-harness-0051.sql` — harness de verificación (4 checks + deja un 3er medicamento virgen para la Task 4).
- **Create:** `docs/bitacora/2026-07-14-harness-0051-cleanup.sql` — limpieza de los datos `TEST-*` del harness (se corre recién después de la Task 4).
- **Modify:** `supabase/README.md` — fila `0051` en el índice de migraciones.
- **Modify:** `src/data/pharma/patientMedications.ts` — `assignPatientMedication()` pasa de `.insert()` a `supabase.rpc(...)`.
- **Modify:** `src/views/pharma/PatientMedicationsCard.tsx` — desplegable con catálogo global + estado de confirmación.

---

### Task 1: Escribir la migración 0051 + harness de verificación (archivos, sin aplicar)

**Files:**
- Create: `supabase/migrations/0051_pharma_asignar_medicacion_catalogo_global.sql`
- Create: `docs/bitacora/2026-07-14-harness-0051.sql`
- Create: `docs/bitacora/2026-07-14-harness-0051-cleanup.sql`

**Interfaces (lo que produce, que consume la Task 3):**
- RPC `assign_patient_medication(p_enrollment_id uuid, p_medication_id uuid, p_notes text, p_confirm_new_to_protocol boolean default false) returns table(id uuid, needs_confirmation boolean)`.

- [ ] **Step 1 — Escribir la migración:**

```sql
-- Spira · Migración 0051 — Pharma: asignar medicación al paciente desde el catálogo global
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0050. IDEMPOTENTE (create or replace).
-- ============================================================================
-- El desplegable de "asignar medicación al paciente" (PatientMedicationsCard) pasa de mostrar solo
-- lo ya recibido en este protocolo (protocol_medications) a mostrar el catálogo global completo,
-- con la cantidad de este protocolo como dato informativo. El trigger check_patient_med_protocol
-- (0050) sigue exigiendo que el medicamento esté en protocol_medications antes de habilitarlo para
-- un paciente — este RPC reemplaza el insert directo de assignPatientMedication() y, cuando el
-- medicamento NUNCA se recibió para este protocolo, en vez de rechazar devuelve needs_confirmation
-- = true (sin insertar nada). Si el usuario confirma explícitamente (p_confirm_new_to_protocol =
-- true), asocia el medicamento al protocolo (mismo upsert idempotente que ya hace recibir, 0040)
-- y recién ahí asigna. No toca el trigger ni las políticas RLS existentes: siguen siendo el
-- candado de última instancia para cualquier insert que no pase por este RPC.
-- ============================================================================

create or replace function public.assign_patient_medication(
  p_enrollment_id uuid,
  p_medication_id uuid,
  p_notes text,
  p_confirm_new_to_protocol boolean default false
) returns table(id uuid, needs_confirmation boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_protocol_id uuid;
  v_new_id uuid;
  v_associated boolean;
begin
  if not public.has_min_role('pharma','operator') then
    raise exception 'Sin permiso para asignar medicación' using errcode = '42501';
  end if;

  select e.protocol_id into v_protocol_id from public.enrollments e where e.id = p_enrollment_id;

  select exists(
    select 1 from public.protocol_medications pm
    where pm.protocol_id = v_protocol_id and pm.medication_id = p_medication_id
  ) into v_associated;

  if not v_associated and not p_confirm_new_to_protocol then
    return query select null::uuid, true;
    return;
  end if;

  if not v_associated then
    -- Mismo patrón que apply_reception_stock / create_reception (0040): asociar en vez de rechazar,
    -- pero acá SOLO después de confirmación explícita del usuario (no automático como al recibir).
    insert into public.protocol_medications (protocol_id, medication_id)
    values (v_protocol_id, p_medication_id)
    on conflict (protocol_id, medication_id) do nothing;
  end if;

  insert into public.patient_medications (enrollment_id, medication_id, notes)
  values (p_enrollment_id, p_medication_id, p_notes)
  returning patient_medications.id into v_new_id;

  return query select v_new_id, false;
end;
$$;
grant execute on function public.assign_patient_medication(uuid, uuid, text, boolean) to authenticated;

comment on function public.assign_patient_medication(uuid, uuid, text, boolean) is
  'Asigna medicación a un paciente (patient_medications). Si el medicamento nunca se recibió para el protocolo del enrolamiento, devuelve needs_confirmation=true sin insertar nada; con p_confirm_new_to_protocol=true, asocia (protocol_medications, mismo upsert que 0040) y asigna. Migración 0051.';
```

- [ ] **Step 2 — Escribir el harness de verificación:**

```sql
-- ============================================================================
-- Spira · Harness de verificación — migración 0051 (assign_patient_medication)
-- ============================================================================
-- Verifica el RPC nuevo de la 0051 antes de cablear el frontend:
--   CHECK 1: medicamento YA asociado al protocolo → asigna directo, sin pedir confirmación.
--   CHECK 2: medicamento NUNCA asociado, sin confirmar → pide confirmación, NO inserta nada.
--   CHECK 2b: tampoco asocia al protocolo mientras no se confirma.
--   CHECK 3: mismo medicamento, confirmando → asocia al protocolo Y asigna al paciente.
--   CHECK 4: duplicado (misma medicación otra vez) → 23505 (unique violation), no rompe nada.
--
-- Deja un TERCER medicamento (TEST Med Sin Tocar 0051) deliberadamente virgen — nunca asociado
-- ni asignado — para la verificación EN VIVO del frontend (Task 4 del plan de implementación).
-- NO limpiar todavía: correr 2026-07-14-harness-0051-cleanup.sql recién después de esa
-- verificación (Task 5).
--
-- REQUISITO: aplicar la 0051 ANTES de correr esto. Correr TAL CUAL en el SQL Editor (rol postgres).
-- Requiere al menos un usuario con rol pharma>=operator (si no hay, falla con mensaje claro).
-- Bloque DO único = ATÓMICO salvo los checks de "debe fallar", que se atrapan inline.
-- Leer el resultado en la pestaña "Messages": cada 'CHECK ... PASS' confirma un comportamiento.
-- NO idempotente (protocolo/paciente con código único TEST-*): limpiar antes de re-correr.
-- ============================================================================

do $$
declare
  v_creator       uuid;
  v_protocol      uuid; v_patient uuid; v_enrollment uuid;
  v_med_assoc     uuid;  -- ya asociado al protocolo antes de correr el RPC
  v_med_new       uuid;  -- nunca asociado; se asocia vía confirmación (CHECK 2 → CHECK 3)
  v_med_untouched uuid;  -- nunca tocado; reservado para el frontend (Task 4)
  v_pharma_op     uuid;
  v_result_id     uuid;
  v_needs_conf    boolean;
  v_flag          boolean;
  v_count         integer;
begin
  raise notice '=== HARNESS 0051 — inicio % ===', clock_timestamp();
  select id into v_creator from public.users limit 1;
  if v_creator is null then raise exception 'No hay usuarios en public.users'; end if;

  select umr.user_id into v_pharma_op from public.user_module_roles umr
    where umr.module = 'pharma' and umr.role in ('operator','leader','admin') limit 1;
  if v_pharma_op is null then
    raise exception 'No hay usuario con rol pharma>=operator — assign_patient_medication lo exige';
  end if;

  -- ── Setup (datos TEST-*) ─────────────────────────────────────────────────
  insert into public.protocols (code, name, sponsor, legal_entity, status, created_by)
    values ('TEST-HARNESS-0051', 'TEST Harness 0051', 'TEST-SPONSOR', 'fuca', 'activo', v_creator)
    returning id into v_protocol;
  insert into public.patients (code, full_name, status, created_by)
    values ('TEST-PAC-0051-001', 'TEST Paciente 0051', 'activo', v_creator)
    returning id into v_patient;
  insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date, status)
    values (v_patient, v_protocol, v_creator, current_date, 'activo')
    returning id into v_enrollment;

  insert into public.medications (name, unit, low_stock_threshold, created_by)
    values ('TEST Med Asociado 0051', 'comprimidos', 5, v_creator) returning id into v_med_assoc;
  insert into public.medications (name, unit, low_stock_threshold, created_by)
    values ('TEST Med Nuevo 0051', 'comprimidos', 5, v_creator) returning id into v_med_new;
  insert into public.medications (name, unit, low_stock_threshold, created_by)
    values ('TEST Med Sin Tocar 0051', 'comprimidos', 5, v_creator) returning id into v_med_untouched;

  -- med_assoc YA asociado al protocolo (simula "recibido alguna vez"); med_new y med_untouched NO.
  insert into public.protocol_medications (protocol_id, medication_id) values (v_protocol, v_med_assoc);

  -- simular JWT del usuario pharma operator+ (assign_patient_medication exige el rol adentro)
  perform set_config('request.jwt.claims', json_build_object('sub', v_pharma_op)::text, true);
  if auth.uid() is distinct from v_pharma_op then
    raise exception 'La simulación de JWT no resolvió auth.uid() (esperado %, obtuvo %)', v_pharma_op, auth.uid();
  end if;

  -- CHECK 1 · medicamento YA asociado al protocolo → asigna directo, sin pedir confirmación
  select id, needs_confirmation into v_result_id, v_needs_conf
    from public.assign_patient_medication(v_enrollment, v_med_assoc, 'TEST nota', false);
  if v_result_id is not null and v_needs_conf = false then
    raise notice 'CHECK 1 — medicamento asociado asigna directo sin pedir confirmación: PASS';
  else raise exception 'CHECK 1 FALLÓ — id %, needs_confirmation %', v_result_id, v_needs_conf; end if;

  -- CHECK 2 · medicamento NUNCA asociado, sin confirmar → pide confirmación, no inserta nada
  select id, needs_confirmation into v_result_id, v_needs_conf
    from public.assign_patient_medication(v_enrollment, v_med_new, null, false);
  select count(*) into v_count from public.patient_medications
    where enrollment_id = v_enrollment and medication_id = v_med_new;
  if v_result_id is null and v_needs_conf = true and v_count = 0 then
    raise notice 'CHECK 2 — medicamento nunca asociado pide confirmación sin insertar nada: PASS';
  else raise exception 'CHECK 2 FALLÓ — id %, needs_confirmation %, filas patient_medications %',
    v_result_id, v_needs_conf, v_count; end if;

  select count(*) into v_count from public.protocol_medications
    where protocol_id = v_protocol and medication_id = v_med_new;
  if v_count = 0 then raise notice 'CHECK 2b — tampoco se asoció al protocolo sin confirmar: PASS';
  else raise exception 'CHECK 2b FALLÓ — se asoció al protocolo sin confirmación'; end if;

  -- CHECK 3 · mismo medicamento, CONFIRMANDO → asocia al protocolo Y asigna al paciente
  select id, needs_confirmation into v_result_id, v_needs_conf
    from public.assign_patient_medication(v_enrollment, v_med_new, null, true);
  select count(*) into v_count from public.protocol_medications
    where protocol_id = v_protocol and medication_id = v_med_new;
  if v_result_id is not null and v_needs_conf = false and v_count = 1 then
    raise notice 'CHECK 3 — confirmar asocia al protocolo y asigna al paciente: PASS';
  else raise exception 'CHECK 3 FALLÓ — id %, needs_confirmation %, filas protocol_medications %',
    v_result_id, v_needs_conf, v_count; end if;

  -- CHECK 4 · duplicado (misma medicación otra vez) → 23505, no rompe nada
  v_flag := false;
  begin
    perform public.assign_patient_medication(v_enrollment, v_med_assoc, null, false);
    v_flag := true;
  exception when unique_violation then null; end;
  if v_flag then raise exception 'CHECK 4 FALLÓ — se duplicó una medicación ya asignada al paciente';
  else raise notice 'CHECK 4 — duplicado (misma medicación) rechaza con unique_violation: PASS'; end if;

  perform set_config('request.jwt.claims', '', true);   -- reset

  raise notice '=== HARNESS 0051 — fin, todos los checks pasaron ===';
  raise notice 'IDs — protocolo: % | paciente: % | enrolamiento: % | med sin tocar: %',
    v_protocol, v_patient, v_enrollment, v_med_untouched;
end $$;
```

- [ ] **Step 3 — Escribir la limpieza (se corre recién en la Task 5, después de verificar la UI):**

```sql
-- ============================================================================
-- Spira · Limpieza del harness 0051
-- ============================================================================
-- Borra TODO lo que creó 2026-07-14-harness-0051.sql (identificado por códigos/nombres TEST-*),
-- incluida la asignación hecha EN VIVO desde el frontend en la Task 4 del plan (mismo enrolamiento
-- y protocolo, así que cae dentro del mismo filtro). Correr DESPUÉS de esa verificación, TAL CUAL
-- en el SQL Editor (rol postgres): como authenticated, la RLS de audit_log dejaría el DELETE en 0
-- filas en silencio.
-- ============================================================================

do $$
declare
  v_protocol    uuid;
  v_patient     uuid;
  v_meds        uuid[];
  v_enrollments uuid[];
  v_pmeds       uuid[];
begin
  select id into v_protocol from public.protocols where code = 'TEST-HARNESS-0051';
  select id into v_patient  from public.patients  where code = 'TEST-PAC-0051-001';
  if v_protocol is null and v_patient is null then
    raise notice 'No se encontró nada del harness 0051 — nada para borrar.'; return;
  end if;

  select array_agg(id) into v_meds from public.medications
    where name in ('TEST Med Asociado 0051','TEST Med Nuevo 0051','TEST Med Sin Tocar 0051');
  select array_agg(id) into v_enrollments from public.enrollments where protocol_id = v_protocol;
  select array_agg(id) into v_pmeds from public.patient_medications where enrollment_id = any(v_enrollments);

  delete from public.patient_medications  where enrollment_id = any(v_enrollments);
  delete from public.enrollments          where protocol_id = v_protocol;
  delete from public.patients             where id = v_patient;
  delete from public.protocol_medications where protocol_id = v_protocol;
  delete from public.medications          where id = any(v_meds);
  delete from public.protocols            where id = v_protocol;

  -- audit_log de esta prueba (sin FK; incluye patient_medications, que trg_audit_* registra)
  delete from public.audit_log
    where entity_id = v_protocol or entity_id = v_patient
       or entity_id = any(v_meds) or entity_id = any(v_enrollments)
       or entity_id = any(v_pmeds);

  raise notice '=== LIMPIEZA DEL HARNESS 0051 — completa. Sin residuo TEST-HARNESS-0051. ===';
end $$;
```

No hay commit en esta tarea: los tres archivos recién se commitean en la Task 2, después de probar que el RPC funciona de verdad contra la base.

---

### Task 2: Aplicar la migración en prod (handoff al Director) + smoke test + registrar + commit

**Files:** ninguno nuevo — consume los 3 archivos de la Task 1; modifica `supabase/README.md`.

**Interfaces:** Consume el RPC `assign_patient_medication` de la Task 1. Produce: el RPC funcionando en prod, que consume la Task 3.

- [ ] **Step 1 — HANDOFF (STOP): aplicar la migración.** El agente no tiene acceso SQL directo a prod. Presentarle al Director el contenido completo de `supabase/migrations/0051_pharma_asignar_medicacion_catalogo_global.sql` para pegar y ejecutar TAL CUAL en el SQL Editor del dashboard de Supabase (rol `postgres`), después de la 0050. Esperar confirmación de que corrió sin errores antes de seguir.

- [ ] **Step 2 — HANDOFF (STOP): correr el harness.** Presentarle al Director el contenido completo de `docs/bitacora/2026-07-14-harness-0051.sql` para pegar y ejecutar TAL CUAL en el mismo SQL Editor. Pedirle que reporte lo que aparece en la pestaña "Messages". Expected: `CHECK 1` a `CHECK 4` (incluido `CHECK 2b`) todos con `PASS`, y la línea final `HARNESS 0051 — fin, todos los checks pasaron`. Si algún `CHECK` da `FALLÓ` o el bloque tira una excepción sin llegar al final, el bloque `DO` entero revierte solo (nada queda a medio commitear) — diagnosticar contra el mensaje de error exacto antes de reintentar.

  **No correr la limpieza todavía.** Los datos `TEST-HARNESS-0051` quedan a propósito para la verificación en vivo de la Task 4.

- [ ] **Step 3 — Actualizar el índice de migraciones.** Agregar esta fila a la tabla de `supabase/README.md` (después de la fila `0050`), con la fecha REAL en que el Director confirmó el Step 1 (formato `YYYY-MM-DD`, no un placeholder):

```markdown
| 0051 | `pharma_asignar_medicacion_catalogo_global.sql` | RPC `assign_patient_medication`: el desplegable de "asignar medicación al paciente" pasa a listar el catálogo global (antes, solo lo recibido en `protocol_medications`). Si el medicamento nunca se recibió para el protocolo, devuelve `needs_confirmation` en vez de rechazar; confirmando, asocia (mismo upsert de 0040) y recién ahí asigna. No toca el trigger `check_patient_med_protocol` ni la RLS existentes. **Aplicada en prod (YYYY-MM-DD).** |
```

- [ ] **Step 4 — Commit:**

```bash
git add supabase/migrations/0051_pharma_asignar_medicacion_catalogo_global.sql docs/bitacora/2026-07-14-harness-0051.sql docs/bitacora/2026-07-14-harness-0051-cleanup.sql supabase/README.md
git commit -m "feat(pharma): migración 0051 — RPC assign_patient_medication (catálogo global + candado con confirmación)"
```

---

### Task 3: Capa de datos — `assignPatientMedication()` pasa a usar el RPC

**Files:**
- Modify: `src/data/pharma/patientMedications.ts:49-67` (función `assignPatientMedication`)

**Interfaces:**
- Consume: RPC `assign_patient_medication` de la Task 2 (ya en prod).
- Produce: `assignPatientMedication(enrollmentId: string, medicationId: string, notes: string | null, confirmNewToProtocol = false): Promise<{ error: string | null; code?: string; needsConfirmation?: boolean }>` — lo consume la Task 4.

- [ ] **Step 1 — Reemplazar la función.** En `src/data/pharma/patientMedications.ts`, reemplazar el bloque actual (líneas 49-67, desde el comentario `/**\n * Habilita una medicación...` hasta el cierre de `assignPatientMedication`) por:

```ts
/**
 * Habilita una medicación para el paciente vía el RPC `assign_patient_medication` (migración
 * 0051). Si el medicamento nunca se recibió para el protocolo del enrolamiento, la base NO
 * inserta nada y devuelve `needsConfirmation: true` — la card muestra un aviso y, si el usuario
 * confirma, se reintenta con `confirmNewToProtocol: true` (recién ahí la base asocia al protocolo
 * y asigna). El trigger `check_patient_med_protocol` (0050) sigue intacto: para cuando el RPC
 * llega al insert, la asociación ya existe. El unique (enrollment, medicamento) evita duplicar
 * (23505 → mensaje sereno).
 */
export async function assignPatientMedication(
  enrollmentId: string,
  medicationId: string,
  notes: string | null,
  confirmNewToProtocol = false,
): Promise<{ error: string | null; code?: string; needsConfirmation?: boolean }> {
  const { data, error } = await supabase.rpc('assign_patient_medication', {
    p_enrollment_id: enrollmentId,
    p_medication_id: medicationId,
    p_notes: notes,
    p_confirm_new_to_protocol: confirmNewToProtocol,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  const [row] = data as { id: string | null; needs_confirmation: boolean }[]
  return row.needs_confirmation ? { error: null, needsConfirmation: true } : { error: null }
}
```

  (El resto del archivo — `PatientMedicationRow`, `usePatientMedications`, `setPatientMedicationActive` — no cambia.)

- [ ] **Step 2 — Typecheck:**

Run: `npm run typecheck`
Expected: sin errores. Si tira un error de tipos en `PatientMedicationsCard.tsx` sobre la firma vieja de `assignPatientMedication`, es esperado — se corrige en la Task 4.

- [ ] **Step 3 — Commit:**

```bash
git add src/data/pharma/patientMedications.ts
git commit -m "feat(pharma): assignPatientMedication llama al RPC (permite avanzar tras confirmar)"
```

---

### Task 4: UI — `PatientMedicationsCard.tsx` (catálogo global + aviso de confirmación) + verificación en vivo

**Files:**
- Modify: `src/views/pharma/PatientMedicationsCard.tsx` (archivo completo — 163 líneas, reescritura acotada)

**Interfaces:**
- Consume: `assignPatientMedication(enrollmentId, medicationId, notes, confirmNewToProtocol)` de la Task 3; `useMedications()` de `src/data/pharma/medications.ts` (ya existe, exportado por el barrel `data/pharma`); `useStock(protocolId)` de `src/data/pharma/stock.ts` (sin cambios).

- [ ] **Step 1 — Reescribir el archivo completo:**

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { SearchableSelect } from '../../components/SearchableSelect'
import type { SelectOption } from '../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { formatAR } from '../../lib/dates'
import {
  usePatientMedications,
  assignPatientMedication,
  setPatientMedicationActive,
  useMedications,
  useStock,
} from '../../data/pharma'

const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, padding: '18px 20px',
}

// Tintes con rgba() literal: NO se puede concatenar alfa a un `var(--x)` (`var(--spira-good)14`
// es CSS inválido). Mismos hexes que los tokens --spira-good (#5C8A5A) / --spira-danger (#A6483B)
// / --spira-warn (#B0823F). WARN_BG/WARN_BORDER siguen la misma proporción de alfa que el par
// DANGER_BG/DANGER_BORDER de EditPatientForm.tsx (caja con borde, no solo un tinte de fondo).
const GOOD_TINT = 'rgba(92, 138, 90, 0.14)'
const DANGER_TINT = 'rgba(166, 72, 59, 0.10)'
const WARN_BG = 'rgba(176, 130, 63, 0.08)'
const WARN_BORDER = 'rgba(176, 130, 63, 0.30)'

/**
 * Card "Medicación asignada" de la ficha del paciente: la medicación que la farmacéutica habilitó
 * para este enrolamiento (`patient_medications`, 0050). Es la lista de la que el coordinador elige
 * al solicitar dispensación (nunca texto libre). La gestión (agregar / activar-desactivar) es SOLO
 * para Pharma operator+ (`canManage`); Track la ve de solo lectura. Nunca borra: desactivar deja la
 * fila (soft-delete) y además bloquea nuevas solicitudes y la entrega de las pendientes (0050).
 *
 * El desplegable de "Agregar" lista el catálogo GLOBAL (`useMedications`, 0051) — no solo lo ya
 * recibido en este protocolo — con la cantidad de este protocolo como dato informativo (puede ser
 * 0). Si el medicamento elegido nunca se recibió acá, `assignPatientMedication` devuelve
 * `needsConfirmation` en vez de fallar: la fila del buscador se reemplaza por un aviso ("Atención",
 * no un tinte plano) que, al confirmar, reintenta la llamada con `confirmNewToProtocol: true`.
 */
export function PatientMedicationsCard({
  enrollmentId, protocolId, accent, accentSolid, canManage,
}: {
  enrollmentId: string | null
  protocolId: string
  accent: string
  accentSolid: string
  canManage: boolean
}) {
  const medsQ = usePatientMedications(enrollmentId)
  // Catálogo global (para el desplegable de agregar); stock de ESTE protocolo, solo como dato.
  const catalogQ = useMedications()
  const stockQ = useStock(canManage ? protocolId : null)
  const [adding, setAdding] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const rows = medsQ.data ?? []
  const assignedIds = new Set(rows.map((r) => r.medication_id))
  const stockByMed = new Map((stockQ.data ?? []).map((s) => [s.medication_id, s.total_stock]))
  // Ofrecer todo el catálogo global salvo lo que el paciente ya tiene; la cantidad de este
  // protocolo va en la etiqueta como dato, nunca como filtro (puede ser "sin stock" y elegirse igual).
  const options: SelectOption[] = (catalogQ.data ?? [])
    .filter((m) => !assignedIds.has(m.id))
    .map((m) => {
      const qty = stockByMed.get(m.id)
      const suffix = qty !== undefined ? `${qty} en stock` : 'sin stock en este protocolo'
      return { value: m.id, label: `${m.name} — ${suffix}` }
    })
  const pickedName = (catalogQ.data ?? []).find((m) => m.id === pick)?.name ?? 'Este medicamento'

  async function add() {
    if (!pick || !enrollmentId) return
    setBusy(true); setErr(null)
    const res = await assignPatientMedication(enrollmentId, pick, null)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    if (res.needsConfirmation) { setConfirming(true); return }
    setPick(''); setAdding(false); medsQ.refetch()
  }

  async function confirmAdd() {
    if (!pick || !enrollmentId) return
    setBusy(true); setErr(null)
    const res = await assignPatientMedication(enrollmentId, pick, null, true)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    setPick(''); setAdding(false); setConfirming(false); medsQ.refetch()
  }

  function backFromConfirm() {
    setConfirming(false)
    setPick('')
  }

  async function toggle(id: string, active: boolean) {
    setErr(null)
    const res = await setPatientMedicationActive(id, !active)
    if (res.error) { setErr(res.error); return }
    medsQ.refetch()
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon name="pill" size={17} color={accent} />
        <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 16 }}>Medicación asignada</span>
        {canManage && !adding && (
          <button
            onClick={() => { setAdding(true); setErr(null); setConfirming(false) }}
            style={{ marginLeft: 'auto', height: 32, borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink)', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 11px' }}
          >
            <Icon name="plus" size={14} color={accent} /> Agregar
          </button>
        )}
      </div>

      {adding && canManage && (
        confirming ? (
          <div style={{ display: 'flex', gap: 10, padding: '13px 14px', borderRadius: 11, background: WARN_BG, border: `1px solid ${WARN_BORDER}`, marginBottom: 12 }}>
            <Icon name="alertCircle" size={18} color="var(--spira-warn)" style={{ flex: '0 0 auto', marginTop: 1 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--spira-ink)' }}>
                <strong>{pickedName}</strong> nunca se recibió para este protocolo. ¿Confirmás que corresponde asignarlo igual?
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={backFromConfirm} style={{ ...btnOutline, height: 36 }}>Volver</button>
                <button
                  type="button" onClick={confirmAdd} disabled={busy}
                  style={{ ...btnPrimary(accentSolid), height: 36, opacity: busy ? 0.6 : 1 }}
                >
                  {busy ? 'Confirmando…' : 'Confirmar igual'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <SearchableSelect
                value={pick}
                onChange={setPick}
                options={options}
                placeholder={options.length ? 'Elegí un medicamento…' : 'No hay más medicamentos para asignar'}
                searchPlaceholder="Buscar medicamento…"
                disabled={options.length === 0}
              />
            </div>
            <button onClick={add} disabled={!pick || busy} style={{ ...btnPrimary(accentSolid), height: 44, opacity: !pick || busy ? 0.6 : 1 }}>
              {busy ? 'Guardando…' : 'Agregar'}
            </button>
            <button onClick={() => { setAdding(false); setPick(''); setErr(null) }} style={{ ...btnOutline, height: 44 }}>Cancelar</button>
          </div>
        )
      )}

      {err && (
        <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: DANGER_TINT, borderRadius: 8, padding: '9px 12px', marginBottom: 12 }}>
          {err}
        </div>
      )}

      {medsQ.loading && rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '8px 0' }}>Cargando…</div>
      ) : rows.length === 0 && !adding ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px' }}>
          <Icon name="pill" size={22} color="var(--spira-faint)" style={{ flex: '0 0 auto' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--spira-ink)' }}>Sin medicación asignada</div>
            <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 1 }}>
              {canManage ? 'Agregá la medicación que este paciente va a recibir.' : 'La farmacéutica todavía no habilitó ninguna.'}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((r, i) => (
            <div
              key={r.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i ? '1px solid var(--spira-line)' : 'none' }}
            >
              <div style={{ minWidth: 0, flex: 1, opacity: r.active ? 1 : 0.65 }}>
                <div style={{ fontSize: 14, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.medication?.name ?? 'Medicamento'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 2 }}>
                  Habilitada · {formatAR(r.created_at.slice(0, 10))}
                  {r.medication?.unit ? ` · ${r.medication.unit}` : ''}
                </div>
              </div>
              <span
                style={{
                  flex: '0 0 auto', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--spira-radius-pill)',
                  color: r.active ? 'var(--spira-good)' : 'var(--spira-muted)',
                  background: r.active ? GOOD_TINT : 'var(--spira-surface)',
                }}
              >
                {r.active ? 'Activa' : 'Inactiva'}
              </span>
              {canManage && (
                <button
                  onClick={() => toggle(r.id, r.active)}
                  style={{ flex: '0 0 auto', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', padding: '4px 6px' }}
                >
                  {r.active ? 'Desactivar' : 'Reactivar'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

  Nota respecto a la spec: la caja del aviso usa `WARN_BG`/`WARN_BORDER` (fondo + borde, misma
  proporción de alfa que el par `DANGER_BG`/`DANGER_BORDER` de `EditPatientForm.tsx`) en vez de un
  único `WARN_TINT` plano — es la forma correcta de replicar "mismo patrón visual que
  `EditPatientForm.tsx`" (esas cajas siempre llevan borde, los tintes planos `GOOD_TINT`/`DANGER_TINT`
  de este archivo son para pills, no para cajas). El botón "Confirmar igual" usa `btnPrimary(accentSolid)`
  — no un botón ámbar — porque en `EditPatientForm.tsx` el botón de confirmar SIEMPRE es el acento del
  módulo; el color semántico lo lleva la caja, no el botón.

- [ ] **Step 2 — Typecheck:**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 3 — Levantar el preview y verificar en el navegador.**

Iniciar el server (puerto 5250, fijado en `.claude/launch.json`) y loguearse con las credenciales de `.claude/qa-creds.local.md` (nunca pedirlas por chat). Navegar a un paciente con el enrolamiento `TEST-HARNESS-0051` (código de paciente `TEST-PAC-0051-001`, protocolo `TEST-HARNESS-0051`) — ya tiene, gracias al harness de la Task 2, dos medicamentos asignados (`TEST Med Asociado 0051`, `TEST Med Nuevo 0051`) y un tercero global nunca tocado (`TEST Med Sin Tocar 0051`).

Verificar, en la card "Medicación asignada":
1. Los dos medicamentos ya asignados por el harness aparecen listados como "Activa".
2. Click en "Agregar" → el desplegable ya NO está limitado a lo recibido en el protocolo: buscar "TEST Med Sin Tocar 0051" y confirmar que aparece, con la etiqueta "— sin stock en este protocolo".
3. Elegirlo y click en "Agregar" → la fila del buscador se reemplaza por el aviso ámbar (ícono `alertCircle`, texto con el nombre del medicamento en negrita, botones "Volver" / "Confirmar igual"). El buscador y los botones "Agregar"/"Cancelar" ya NO están visibles (reemplazo, no convivencia).
4. Click en "Volver" → reabre la fila del buscador, con la selección vacía (hay que elegir de nuevo).
5. Repetir: elegir "TEST Med Sin Tocar 0051" → "Agregar" → aparece el aviso otra vez → click en "Confirmar igual" → la card vuelve sola al estado de reposo (sin el aviso, sin la fila de agregar) y el medicamento ahora aparece en la lista como "Activa".
6. Capturar evidencia (screenshot o `read_page`) del aviso ámbar y de la lista final con los 3 medicamentos.

- [ ] **Step 4 — Commit:**

```bash
git add src/views/pharma/PatientMedicationsCard.tsx
git commit -m "feat(pharma): desplegable de asignar medicación usa el catálogo global + aviso de confirmación"
```

---

### Task 5: Limpieza de los datos `TEST-HARNESS-0051` (handoff al Director)

**Files:** ninguno — operación de dashboard.

**Interfaces:** Consume el estado dejado por la Task 2 (harness) + Task 4 (asignación hecha en vivo desde la UI).

- [ ] **Step 1 — HANDOFF (STOP): correr la limpieza.** Presentarle al Director el contenido completo de `docs/bitacora/2026-07-14-harness-0051-cleanup.sql` para pegar y ejecutar TAL CUAL en el SQL Editor del dashboard. Expected: en "Messages", la línea `LIMPIEZA DEL HARNESS 0051 — completa. Sin residuo TEST-HARNESS-0051.`.

- [ ] **Step 2 — Confirmar.** Pedirle al Director que confirme que no queda ningún registro con prefijo `TEST-HARNESS-0051` / `TEST-PAC-0051-001` / `TEST Med * 0051` (por ejemplo, buscando "TEST-HARNESS-0051" en Medicamentos → Protocolos o en el buscador de pacientes).

---

## Self-Review (hecho)

- **Cobertura de la spec:** RPC (§1) → Task 1/2. Capa de datos (§2) → Task 3. UI (§3, incluidas D1/D2 de la revisión de diseño) → Task 4. "Fuera de alcance" (`VisitDispensationPanel.tsx`, trigger, RLS) → ningún task los toca. ✔
- **Consistencia de tipos/nombres:** `assignPatientMedication(enrollmentId, medicationId, notes, confirmNewToProtocol)` — misma firma en el bloque "Interfaces" de la Task 3 y en el código real de la Task 3 y su consumo en la Task 4 (`confirmAdd` pasa `true` como 4° argumento). `needsConfirmation` (camelCase, capa TS) vs `needs_confirmation` (snake_case, columna SQL) — el mapeo pasa por un solo punto (`patientMedications.ts`), no se repite en la UI. ✔
- **Sin placeholders:** el único valor pendiente al momento de escribir el plan es la fecha real de aplicación en el índice de `supabase/README.md` (Task 2, Step 3) — es un dato que depende de cuándo se ejecuta el plan, no contenido sin definir; la fila completa (columnas, texto, formato) ya está escrita.
- **Huérfanos:** `useStock`/`useMedications` ya existen y están exportados por el barrel `data/pharma` — no hace falta tocar `index.ts`. `pharmaErrorMessage` ya traduce 42501/23505 — no hace falta tocarlo.
- **Gate del proyecto respetado:** no se inventó una suite de tests inexistente — Task 2 verifica el RPC con un harness SQL explícito (mismo patrón que 0050/0032); Task 3/4 verifican con `npm run typecheck` + verificación manual en el navegador, como exige `CLAUDE.md`.
