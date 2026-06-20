# Spec · Eliminar paciente (líderes+)

**Fecha:** 2026-06-19 · **Branch:** `feat/track-visitas-del-dia` · **Estado:** aprobado, pendiente de plan

## Contexto y motivación

Hoy no hay forma de **eliminar** un paciente desde la app: para sacar un alta equivocada,
un duplicado o un paciente de prueba (p. ej. `TEST-V01`) hay que ir al SQL Editor a mano.
El estado `Inactivo` (que ya existe en *Editar paciente*) cubre el cese clínico
("dejó el estudio", se conserva el historial), pero **no** sirve para limpiar entradas que
nunca debieron existir: esas hay que removerlas de verdad.

Esta feature agrega un **borrado real, limpio y en cascada**, restringido a líderes o
superiores, dentro de *Editar paciente*. Pensado para la beta: poder limpiar errores sin
tocar SQL, incluso si el paciente ya tiene actividad registrada.

## Decisiones tomadas

- **Hard delete en cascada** (no soft-delete con flag). El paciente desaparece por completo
  de toda la app; no quedan huérfanos ni residuo visible.
- **Se conserva el `audit_log`** (ledger oculto, append-only). Cada borrado deja `before_data`
  → un borrado por error es recuperable, como el incidente previo de pérdida de data. No es
  "suciedad": es invisible para el usuario y es la red de seguridad.
- **Gating a líderes+**: `gerencia` o `track` con rol `leader`/`admin`.
- **Se permite borrar pacientes con data clínica real** (visitas registradas, dispensaciones):
  el resumen de impacto + el reescribir-para-confirmar son el freno humano. No se bloquea.
- Migración nueva (siguiente número: **0024**), aplicada a mano por el usuario en el SQL
  Editor de Supabase (prod), igual que 0023.

## Backend

### RPC `public.delete_patient(p_patient_id uuid)`

`returns void`, `language plpgsql`, `security definer`, `set search_path = pg_catalog, public`.

1. **Authz**: si `not (public.has_module('gerencia') or public.has_min_role('track','leader'))`
   → `raise exception 'No tenés permiso' using errcode='42501'`.
2. **Existencia**: si el paciente no existe → `raise exception 'Ese paciente ya no existe' using errcode='23503'`.
3. **Borrado** (una transacción, aprovechando las FK en cascada):
   ```sql
   delete from public.enrollments where patient_id = p_patient_id;  -- CASCADE → patient_visits → checklist_items + track_dispensations → checklist_completions
   delete from public.patients    where id = p_patient_id;
   ```
4. `revoke all on function ... from public; grant execute ... to authenticated;`

### Por qué solo 2 deletes (cadena de FK verificada en 0002/0023)

| FK | On delete |
|---|---|
| `patient_visits.enrollment_id → enrollments` | CASCADE |
| `checklist_items.visit_id → patient_visits` | CASCADE |
| `checklist_completions.item_id → checklist_items` | CASCADE |
| `track_dispensations.patient_visit_id → patient_visits` | CASCADE |
| `patient_timeline.visit_id → patient_visits` | CASCADE |
| `enrollments.patient_id → patients` | **RESTRICT** → por eso enrollments se borra **antes** que el paciente |
| `dispensation_requests.visit_id → patient_visits` (Pharma) | **RESTRICT** → ver guarda abajo |

Borrar `enrollments` arrastra en cascada visitas, checklist, timeline y dispensaciones de
Track; después el paciente queda sin referencias y se borra. `track_dispensations.patient_id
→ patients` no tiene cascada, pero esas filas ya se eliminaron vía `patient_visit_id` antes de
tocar `patients`.

### Guarda Pharma (dispensation_requests es RESTRICT)

`dispensation_requests` (solicitudes de dispensación de farmacia, que la coordinadora crea
desde Track) referencia `patient_visits` con **`ON DELETE RESTRICT`** —y sus propios hijos
también son RESTRICT— porque son registros de medicación regulados que no se borran en
cascada. Por eso el RPC, **antes** de borrar, chequea si el paciente tiene alguna
`dispensation_request`; si la tiene, **bloquea** el borrado con un mensaje claro
(`errcode='check_violation'`, mensaje que el front muestra vía el fallback `raw`): *"No se
puede eliminar: el paciente tiene dispensaciones de farmacia registradas. Marcalo como
Inactivo en lugar de borrarlo."* Los pacientes TEST/erróneos (el caso de uso) no tienen
solicitudes de farmacia → borran sin problema. (Hallazgo de la revisión de integración.)

### Auditoría (recuperabilidad)

Los triggers `trg_audit_*` (0003 + 0023) cubren `patients`, `enrollments`, `patient_visits`,
`checklist_completions` y `track_dispensations`. Los `DELETE` en cascada disparan los triggers
row-level → cada fila deja `before_data` en `audit_log`. (`checklist_items` no tiene trigger,
pero es material regenerable desde plantillas: no es crítico para recuperar.)

## UI/UX — "Zona de peligro" en `EditPatientForm`

- Nueva sección al final del modal, separada con borde/tinte danger, **renderizada solo si
  `hasMinRole('track','leader') || modules.includes('gerencia')`** (ambos de `useAuth()`;
  espeja la authz del RPC). La UI solo oculta el botón; el RPC es el enforcement real.
- Estado colapsado: botón outline danger **"Eliminar paciente"**.
- Al expandir, muestra el **confirm**:
  - **Resumen de impacto**: "Se eliminarán N visitas y N dispensaciones, y todo el checklist
    del paciente. Es permanente." (conteo liviano leído al expandir).
  - **Type-to-confirm**: reescribir el **código IVRS** del paciente; si no tiene IVRS, reescribir
    el **nombre completo**. Reusa el patrón existente del cambio de IVRS.
  - Botón **"Eliminar definitivamente"** habilitado solo cuando el texto coincide exactamente.
- **Tras borrar**: cerrar el modal, refetch de pacientes, y navegar de vuelta a la lista de
  pacientes del protocolo (la ficha del paciente borrado ya no es válida) → callback `onDeleted`.
- **Errores**: `42501` → "No tenés permiso para eliminar pacientes." · `23503` → "Ese paciente
  ya no existe." · otro → mensaje genérico.

### Capa de datos (`src/data/patients.ts`)

`export async function deletePatient(id: string): Promise<{ error: string | null }>`
→ `supabase.rpc('delete_patient', { p_patient_id: id })`, con mapeo de errores (espeja el
patrón de `createPatientWithEnrollment`/`updatePatient`).

El conteo de impacto sale de una consulta liviana (visitas del paciente vía `v_track_visits`
/ `patient_visits`, y dispensaciones por `patient_id`); el detalle exacto lo fija el plan.

## Casos borde

- **Gating UI ≠ enforcement**: el botón se oculta para no-líderes, pero el RPC rechaza igual.
- **Paciente con data real**: permitido; el freno es el resumen + reescribir-para-confirmar.
- **Id inválido / ya borrado**: `23503` → mensaje claro, sin romper la UI.
- **Concurrencia**: si dos líderes borran el mismo paciente, el segundo recibe `23503`.

## Fuera de alcance (YAGNI)

- Restaurar desde la UI (la recuperación es vía SQL sobre `audit_log`, manual).
- Borrado masivo / por lote.
- Variante "cero rastro" que también purgue el `audit_log` (se descartó: se conserva el ledger).
- Borrar pacientes de otros módulos no-Track (el gating es de `track`/`gerencia`).

## Verificación (sin tests unitarios)

- `npm run build` verde.
- Preview: la zona de peligro aparece solo para líderes; el flujo de confirmación funciona;
  tras borrar, el paciente desaparece de Pacientes/Visitas/Agenda/Alertas.
- SQL en Supabase (con un paciente `TEST-*`): la fila y toda su cadena desaparecen; `audit_log`
  conserva `before_data` de paciente/enrollment/visitas/dispensaciones; un no-líder recibe `42501`.
