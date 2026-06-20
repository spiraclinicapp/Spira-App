# Eliminar paciente (líderes+) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir a líderes (gerencia o track leader/admin) eliminar un paciente por completo y en cascada desde *Editar paciente*, con resumen de impacto, type-to-confirm y auditoría recuperable.

**Architecture:** Un RPC `delete_patient` (SECURITY DEFINER, gateado) borra `enrollments` y `patients`; el resto de la cadena cae por las FK `ON DELETE CASCADE` y cada borrado deja `before_data` en `audit_log`. La capa de datos (`patients.ts`) expone `deletePatient` + `patientFootprint`. La UI agrega una "zona de peligro" a `EditPatientForm`, gateada en el cliente, que al confirmar llama al RPC y navega de vuelta al protocolo.

**Tech Stack:** React 19 + TypeScript + Vite + Supabase (PostgREST + RLS + RPCs plpgsql). **Sin framework de tests unitarios:** la verificación es `npm run build` (tsc + vite) verde + preview en vivo + chequeos SQL en Supabase.

**Spec:** `docs/superpowers/specs/2026-06-19-eliminar-paciente-design.md`

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `supabase/migrations/0024_delete_patient.sql` | RPC `delete_patient` + grants | Crear (lo aplica el USUARIO a mano en Supabase prod) |
| `src/data/patients.ts` | `deletePatient`, `patientFootprint`, mapeo de error | Modificar |
| `src/views/EditPatientForm.tsx` | Zona de peligro (gating, footprint, type-to-confirm, `onDeleted`) | Modificar |
| `src/views/PatientFichaView.tsx` | Pasar `onDeleted` (navegar al protocolo + refetch) | Modificar (1 línea) |

---

## Task 0: Línea base

**Files:** ninguno.

- [ ] **Step 1: Confirmar branch y árbol limpio**

Run: `cd "C:/Users/Tutuca/Desktop/Spira/Spira App" && git branch --show-current && git status --porcelain`
Expected: rama `feat/track-visitas-del-dia`; sin cambios sin commitear (o solo los de este plan).

- [ ] **Step 2: Build base verde**

Run: `cd "C:/Users/Tutuca/Desktop/Spira/Spira App" && npm run build`
Expected: tsc + vite sin errores (solo el warning preexistente de tamaño de chunk).

---

## Task 1: Migración 0024 — RPC `delete_patient`

**Files:**
- Create: `supabase/migrations/0024_delete_patient.sql`

> El USUARIO aplica este SQL a mano en el SQL Editor de Supabase (es prod). Pausar para que lo aplique antes de la verificación.

- [ ] **Step 1: Escribir la migración**

```sql
-- Spira · Migración 0024 — Eliminar paciente (líderes+)
-- Ver spec: docs/superpowers/specs/2026-06-19-eliminar-paciente-design.md
-- ----------------------------------------------------------------------------
-- RPC delete_patient: borra un paciente por completo y en cascada. Gateado a
-- gerencia o track leader/admin. Aprovecha las FK ON DELETE CASCADE
-- (enrollments → patient_visits → checklist_items + track_dispensations →
-- checklist_completions); solo enrollments.patient_id → patients es RESTRICT, por
-- eso enrollments se borra ANTES que el paciente. Cada borrado (directo o en
-- cascada) dispara su trigger de auditoría → before_data queda en audit_log
-- (recuperable). SECURITY DEFINER bypassa RLS; la authz es explícita acá.
-- ============================================================================

create or replace function public.delete_patient(p_patient_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_exists boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','leader')) then
    raise exception 'No tenés permiso' using errcode='42501';
  end if;
  select exists(select 1 from public.patients where id = p_patient_id) into v_exists;
  if not v_exists then raise exception 'Ese paciente ya no existe' using errcode='23503'; end if;
  -- Guarda Pharma: dispensation_requests.visit_id → patient_visits es ON DELETE RESTRICT
  -- (registros de dispensación de farmacia, regulados, NO se borran en cascada; sus
  -- propios hijos también son RESTRICT). Si el paciente tiene alguna solicitud de
  -- dispensación, bloquear con un mensaje claro en vez de fallar con un error de FK crudo.
  if exists (
    select 1 from public.dispensation_requests dr
    join public.patient_visits pv on pv.id = dr.visit_id
    join public.enrollments    e  on e.id = pv.enrollment_id
    where e.patient_id = p_patient_id
  ) then
    raise exception 'No se puede eliminar: el paciente tiene dispensaciones de farmacia registradas. Marcalo como Inactivo en lugar de borrarlo.'
      using errcode='check_violation';
  end if;
  -- enrollments es RESTRICT respecto de patients → borrar primero; la cascada se encarga de
  -- patient_visits → checklist_items / patient_timeline / track_dispensations → checklist_completions.
  delete from public.enrollments where patient_id = p_patient_id;
  delete from public.patients    where id = p_patient_id;
end; $$;
revoke all on function public.delete_patient(uuid) from public;
grant execute on function public.delete_patient(uuid) to authenticated;
comment on function public.delete_patient is
  'Borra un paciente y toda su cadena (enrollments→visitas→checklist/dispensaciones) en cascada. Gerencia o track leader+. SECURITY DEFINER. Auditado (before_data en audit_log).';

notify pgrst, 'reload schema';
```

- [ ] **Step 2: PAUSA — el usuario aplica la migración en Supabase**

Pedir al usuario que pegue y corra el archivo completo en el SQL Editor de Supabase. Esperar confirmación antes de seguir.

- [ ] **Step 3: Verificación (Supabase, con un paciente TEST-*)** — diferida a la Task 5 (e2e). Acá solo confirmar que la función existe:

```sql
select proname, prosecdef from pg_proc where proname = 'delete_patient';
```
Expected: una fila, `prosecdef = true` (SECURITY DEFINER).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0024_delete_patient.sql
git commit -m "feat(0024): RPC delete_patient — borrado en cascada gateado a líderes+"
```

---

## Task 2: Capa de datos — `deletePatient` + `patientFootprint`

**Files:**
- Modify: `src/data/patients.ts` (agregar al final, después de `updatePatient`)

- [ ] **Step 1: Agregar el conteo de impacto, el mapeo de error y el borrado**

Agregar al final de `src/data/patients.ts`:

```ts
/** Conteo de impacto del borrado (resumen para la zona de peligro). */
export interface PatientFootprint {
  visits: number
  dispensations: number
}

/**
 * Huella clínica del paciente: cantidad de visitas y de dispensaciones. Dos counts
 * PostgREST (head: true, sin traer filas), filtrando por patient_id (ambas fuentes lo
 * exponen: v_track_visits y track_dispensations). Scopeado por RLS (gerencia ve todo;
 * coordinadora ve lo suyo). Es informativo — el freno real del borrado es el
 * type-to-confirm — así que un conteo aproximado por RLS es aceptable.
 */
export async function patientFootprint(patientId: string): Promise<PatientFootprint> {
  const [visitsRes, dispRes] = await Promise.all([
    supabase.from('v_track_visits').select('id', { count: 'exact', head: true }).eq('patient_id', patientId),
    supabase.from('track_dispensations').select('id', { count: 'exact', head: true }).eq('patient_id', patientId),
  ])
  return { visits: visitsRes.count ?? 0, dispensations: dispRes.count ?? 0 }
}

/** Traduce el error del borrado a un mensaje sereno. */
function deleteErrorMessage(code: string | undefined, raw: string): string {
  if (code === '42501') return 'No tenés permiso para eliminar pacientes.'
  if (code === '23503') return 'Ese paciente ya no existe.'
  return raw || 'No pudimos eliminar el paciente. Probá de nuevo.'
}

/**
 * Elimina un paciente por completo vía RPC delete_patient (SECURITY DEFINER, gateado a
 * gerencia o track leader+). Borra en cascada toda su cadena clínica; queda el rastro en
 * audit_log (recuperable). Irreversible desde la UI.
 */
export async function deletePatient(patientId: string): Promise<{ error: string | null }> {
  if (!patientId) return { error: 'No se pudo identificar al paciente. Recargá la página e intentá de nuevo.' }
  const { error } = await supabase.rpc('delete_patient', { p_patient_id: patientId })
  if (error) return { error: deleteErrorMessage(error.code, error.message) }
  return { error: null }
}
```

- [ ] **Step 2: Verificación (build)**

Run: `cd "C:/Users/Tutuca/Desktop/Spira/Spira App" && npm run build`
Expected: verde. (`supabase` ya está importado en el archivo; no se agregan imports.)

- [ ] **Step 3: Commit**

```bash
git add src/data/patients.ts
git commit -m "feat(track): deletePatient + patientFootprint en la capa de datos"
```

---

## Task 3: UI — zona de peligro + wiring de navegación

**Files:**
- Modify: `src/views/EditPatientForm.tsx`
- Modify: `src/views/PatientFichaView.tsx:135-142`

> Los dos archivos se tocan en la misma task: `onDeleted` es un prop requerido, así que el build solo queda verde cuando `PatientFichaView` lo pasa. Un commit único.

- [ ] **Step 1: Imports y prop `onDeleted`**

En `src/views/EditPatientForm.tsx`, agregar imports y extender los props.

Cambiar el bloque de imports (líneas 1-9) para sumar `useAuth`, `deletePatient`, `patientFootprint` y el tipo `PatientFootprint`:

```tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { FormField, fieldInput } from '../components/FormField'
import { btnOutline, btnPrimary } from '../components/buttons'
import { updatePatient, deletePatient, patientFootprint } from '../data/patients'
import type { PatientRow, PatientStatus, PatientFootprint } from '../data/patients'
import { FERTILITY_OPTIONS } from '../lib/visits'
import { useAuth } from '../lib/auth'
```

Extender la interface de props (líneas 17-22):

```tsx
interface EditPatientFormProps {
  patient: PatientRow
  accentSolid: string
  onClose: () => void
  onUpdated: () => void
  /** Tras eliminar el paciente: cerrar, refetch y navegar fuera de la ficha (ya no existe). */
  onDeleted: () => void
}
```

- [ ] **Step 2: Estado y handlers de la zona de peligro**

En la firma del componente, sumar `onDeleted` a la desestructuración:

```tsx
export function EditPatientForm({ patient, accentSolid, onClose, onUpdated, onDeleted }: EditPatientFormProps) {
```

Después de las declaraciones de estado existentes (tras `const [confirmCode, setConfirmCode] = useState('')`, línea 45), agregar:

```tsx
  // ── Zona de peligro (eliminar paciente) ──
  const { hasMinRole, modules } = useAuth()
  const canDelete = hasMinRole('track', 'leader') || modules.includes('gerencia')
  const [deleting, setDeleting] = useState(false)
  const [footprint, setFootprint] = useState<PatientFootprint | null>(null)
  const [delConfirm, setDelConfirm] = useState('')
  const [delBusy, setDelBusy] = useState(false)
  const [delError, setDelError] = useState<string | null>(null)

  /* Type-to-confirm: se reescribe el IVRS si existe; si no, el nombre completo. */
  const delTarget = (patient.code ?? '').trim() || patient.full_name.trim()
  const delLabel = patient.code ? 'el número IVRS' : 'el nombre completo'
  const delReady = delConfirm.trim() === delTarget

  const openDanger = async () => {
    setDeleting(true)
    setDelError(null)
    setDelConfirm('')
    setFootprint(null)
    setFootprint(await patientFootprint(patient.id))
  }

  const doDelete = async () => {
    setDelBusy(true)
    setDelError(null)
    const res = await deletePatient(patient.id)
    setDelBusy(false)
    if (res.error) { setDelError(res.error); return }
    onDeleted()
  }
```

- [ ] **Step 3: Renderizar la zona de peligro dentro del Modal, después del `</form>`**

El componente cierra con `</form>` y luego `</Modal>` (líneas 176-177). Insertar la zona de peligro entre el `</form>` y el `</Modal>`:

```tsx
        )}
      </form>

      {canDelete && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--spira-line)' }}>
          {!deleting ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', lineHeight: 1.4 }}>
                <span style={{ fontWeight: 600, color: 'var(--spira-ink)' }}>Eliminar paciente.</span>{' '}
                Borra al paciente y todo su historial de forma permanente.
              </div>
              <button type="button" onClick={() => void openDanger()}
                style={{ ...btnOutline, flex: '0 0 auto', color: DANGER, borderColor: DANGER_BORDER }}>
                <Icon name="trash" size={15} color={DANGER} /> Eliminar paciente
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '13px 14px', borderRadius: 11, background: DANGER_BG, border: `1px solid ${DANGER_BORDER}` }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="alert" size={18} color={DANGER} /></span>
                <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--spira-ink)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 3 }}>Eliminar definitivamente</div>
                  {footprint == null ? (
                    'Calculando el impacto…'
                  ) : (
                    <>Se eliminarán <b>{footprint.visits}</b> {footprint.visits === 1 ? 'visita' : 'visitas'} y{' '}
                    <b>{footprint.dispensations}</b> {footprint.dispensations === 1 ? 'dispensación' : 'dispensaciones'},
                    y todo el checklist del paciente. Es permanente.</>
                  )}
                  <div style={{ marginTop: 8 }}>
                    Reescribí {delLabel} (<span className="spira-mono" style={{ fontWeight: 600 }}>{delTarget}</span>) para confirmar.
                  </div>
                </div>
              </div>
              <input value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)}
                placeholder={`Reescribí ${delTarget}`} autoFocus
                className={patient.code ? 'spira-mono' : undefined}
                style={{ ...fieldInput, ...(patient.code ? { fontVariantNumeric: 'tabular-nums' } : {}) }} />
              {delError && <div style={{ fontSize: 13, color: 'var(--spira-danger)' }}>{delError}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => setDeleting(false)} style={btnOutline}>Cancelar</button>
                <button type="button" onClick={() => void doDelete()} disabled={delBusy || !delReady}
                  style={{ height: 38, padding: '0 15px', borderRadius: 10, border: 'none', background: DANGER, color: '#fff', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, cursor: delBusy || !delReady ? 'default' : 'pointer', opacity: delBusy || !delReady ? 0.6 : 1 }}>
                  {delBusy ? 'Eliminando…' : 'Eliminar definitivamente'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
```

> Nota: `DANGER`, `DANGER_BG`, `DANGER_BORDER` ya están definidos arriba en el archivo (líneas 13-15) y `fieldInput`, `btnOutline`, `Icon` ya están importados. La zona de peligro es un hermano del `<form>` dentro del `<Modal>` (no se anida en el form para que sus botones no disparen el submit de edición).

- [ ] **Step 4: Conectar `onDeleted` en `PatientFichaView`**

En el render de `EditPatientForm` (`src/views/PatientFichaView.tsx:135-142`), agregar el callback `onDeleted` que cierra el modal, refetcha la lista de pacientes y vuelve al detalle del protocolo (la ficha del paciente borrado ya no existe):

```tsx
      {modal === 'edit' && (
        <EditPatientForm
          patient={patient}
          accentSolid={accentSolid}
          onClose={() => setModal(null)}
          onUpdated={() => { setModal(null); onPatientUpdated(); visitsQ.refetch() }}
          onDeleted={() => { setModal(null); onPatientUpdated(); onBack() }}
        />
      )}
```

- [ ] **Step 5: Verificación (build)**

Run: `cd "C:/Users/Tutuca/Desktop/Spira/Spira App" && npm run build`
Expected: verde (ahora `EditPatientForm` recibe el `onDeleted` requerido y `PatientFichaView` lo pasa).

- [ ] **Step 6: Commit**

```bash
git add src/views/EditPatientForm.tsx src/views/PatientFichaView.tsx
git commit -m "feat(track): zona de peligro para eliminar paciente (líderes+) en la ficha"
```

---

## Task 4: Verificación end-to-end

**Files:** ninguno (solo verificación). Requiere la migración 0024 aplicada.

- [ ] **Step 1: Build + preview**

Run: `cd "C:/Users/Tutuca/Desktop/Spira/Spira App" && npm run build`
Expected: verde.

- [ ] **Step 2: Verificación (preview) — visibilidad por rol**

Como usuario líder/gerencia: Track → Pacientes → un protocolo → ficha de un paciente → "Editar paciente". Al fondo del modal aparece la **zona de peligro** con el botón "Eliminar paciente". (Como `operator` puro, la sección no debe aparecer.)

- [ ] **Step 3: Verificación (preview) — flujo de confirmación**

Clic en "Eliminar paciente" → aparece el resumen de impacto (N visitas / N dispensaciones) + el input de type-to-confirm. El botón "Eliminar definitivamente" está deshabilitado hasta reescribir exactamente el IVRS (o nombre). Cancelar colapsa la sección.

- [ ] **Step 4: Verificación (preview + Supabase) — borrado real con un paciente TEST-***

Crear (o reutilizar) un paciente `TEST-*`. Confirmar su borrado desde la UI. Esperado: el modal cierra, se vuelve al detalle del protocolo y el paciente ya **no** aparece en Pacientes/Visitas/Agenda. Confirmar en SQL:

```sql
-- el paciente y su cadena ya no existen (esperado: 0 en todos)
select
  (select count(*) from public.patients  where code = 'TEST-V01')                                   as pacientes,
  (select count(*) from public.enrollments e join public.patients p on p.id=e.patient_id
     where p.code = 'TEST-V01')                                                                      as enrollments,
  (select count(*) from public.v_track_visits where patient_code = 'TEST-V01')                       as visitas;
```

- [ ] **Step 5: Verificación (Supabase) — auditoría recuperable**

```sql
-- el DELETE del paciente quedó en audit_log con before_data (recuperable)
select action, before_data->>'code' as code, before_data->>'full_name' as full_name, occurred_at
from public.audit_log
where entity_type = 'patients' and action = 'DELETE'
order by occurred_at desc limit 3;
```
Expected: una fila reciente con `before_data` del paciente TEST-* borrado.

- [ ] **Step 6: Verificación (Supabase) — permiso negativo**

Como usuario `track` `operator` (no leader) o sin rol track ni gerencia:
```sql
select public.delete_patient('<id_de_un_paciente_TEST>');
```
Expected: ERROR `No tenés permiso` (SQLSTATE 42501); el paciente sigue existiendo.

---

## Notas de ejecución

- **Orden:** Task 0 → 1 (pausa para que el usuario aplique el SQL) → 2 → 3 (toca los dos archivos de UI juntos; un solo build verde + commit) → 4 (e2e, requiere la migración aplicada).
- La migración 0024 la aplica el usuario a mano en Supabase (prod), igual que la 0023.
- No tocar pacientes/visitas que no sean `TEST-*` en las pruebas.
