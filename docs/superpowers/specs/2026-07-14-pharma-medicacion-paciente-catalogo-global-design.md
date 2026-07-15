# Pharma: desplegable de "asignar medicación al paciente" → catálogo global

**Fecha:** 2026-07-14
**Módulo:** Pharma
**Toca:** 1 migración nueva (0051), `src/data/pharma/patientMedications.ts`, `src/views/pharma/PatientMedicationsCard.tsx`

## Problema

La card "Medicación asignada" de la ficha del paciente (`PatientMedicationsCard.tsx`) ofrece,
en su desplegable de "Agregar", `useStock(protocolId)` → la vista `v_medication_stock` filtrada
por el protocolo del enrolamiento. Esa vista sale de `protocol_medications` (allow-list
medicamento↔protocolo).

Desde la migración 0040 ("catálogo global"), `protocol_medications` dejó de tener un botón/form
manual de alta: se puebla **solo como consecuencia de recibir** ese medicamento para ese
protocolo (`create_reception` / `apply_reception_stock` hacen upsert). Es decir, el desplegable
hoy muestra "lo que alguna vez se recibió para este protocolo" — no el catálogo real disponible,
que puede variar bastante y no siempre coincide con lo ya recibido acá.

El Director quiere que el desplegable muestre el **catálogo global completo**, con la cantidad
en stock de este protocolo como dato informativo (puede ser 0), no como filtro. A la vez, quiere
**mantener el candado de seguridad** que impide asignarle a un paciente un medicamento ajeno a su
protocolo — pero permitir avanzar después de un aviso explícito, en vez de un bloqueo duro.

## Alcance

- Afecta **solo** `PatientMedicationsCard.tsx` — es el único consumidor de `useStock(protocolId)`
  en todo el repo (verificado por grep).
- **No** toca `VisitDispensationPanel.tsx` (panel de "Solicitar dispensación" en la visita): ese
  filtra sobre `patient_medications` activas del paciente, no depende de `protocol_medications`,
  y no tiene esta ambigüedad.
- **No** toca el trigger `check_patient_med_protocol` (0050) ni las políticas RLS de
  `patient_medications`: siguen siendo el candado de última instancia para cualquier escritura
  que no pase por el RPC nuevo.

## Diseño

### 1 · Backend — RPC `assign_patient_medication` (migración 0051)

Reemplaza el `insert` directo que hace hoy `assignPatientMedication()`. Firma:

```sql
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
```

Notas de diseño:

- **El trigger `check_patient_med_protocol` no se toca.** Para cuando llega al `insert` de
  `patient_medications`, la asociación en `protocol_medications` ya existe (por upsert previo o
  porque ya estaba) — el trigger pasa solo, sin cambios en su lógica.
- **El rol se re-valida adentro del RPC** (`has_min_role('pharma','operator')`), replicando la
  misma política que hoy vive en el `with check` de la policy de insert — mismo patrón que
  `create_reception` (0040) hace su propio chequeo de rol pese a ser `security definer`.
- **`protocol_medications` no tiene trigger de auditoría** (confirmado: no existe en ninguna
  migración) — el upsert nuevo desde este RPC queda con el mismo nivel de trazabilidad que ya
  tiene el upsert de recepción (0040). No es una regresión, es paridad con el patrón existente.
- El `23505` (duplicado en `patient_medications`) sigue funcionando igual que hoy — la unique
  constraint `(enrollment_id, medication_id)` no cambia.
- `needs_confirmation = true` **no es un error**: no dispara `pharmaErrorMessage`, es una rama de
  éxito que el front interpreta como "mostrar el aviso".

### 2 · Capa de datos — `patientMedications.ts`

`assignPatientMedication(enrollmentId, medicationId, notes)` pasa de `.insert()` directo a
`supabase.rpc('assign_patient_medication', {...})` con `p_confirm_new_to_protocol` por defecto
`false`. Firma nueva:

```ts
assignPatientMedication(
  enrollmentId: string,
  medicationId: string,
  notes: string | null,
  confirmNewToProtocol = false,
): Promise<{ error: string | null; code?: string; needsConfirmation?: boolean }>
```

Si la fila devuelta trae `needs_confirmation: true`, la función retorna
`{ error: null, needsConfirmation: true }` (sin insertar nada todavía). El resto de los códigos
de error (42501, 23505, etc.) siguen pasando por `pharmaErrorMessage` como hoy.

### 3 · UI — `PatientMedicationsCard.tsx`

- El desplegable "Agregar" pasa de `useStock(canManage ? protocolId : null)` a `useMedications()`
  (catálogo global — mismo hook que ya usa Medicamentos/Recepción). Mantiene el filtro de
  `assignedIds` (no reofrecer lo ya asignado a este paciente).
- Se conserva `useStock(protocolId)` en paralelo, pero solo como fuente de la cantidad: se arma
  un `Map<medication_id, total_stock>` y cada opción se etiqueta
  `"${nombre} — ${cantidad} en stock"`, o `"${nombre} — sin stock en este protocolo"` cuando no
  hay fila (0, sin distinguir "nunca recibido" de "recibido y agotado" — esa distinción la hace
  el paso de confirmación, no hace falta acá).
- Al confirmar "Agregar": si `needsConfirmation` vuelve `true`, la card no marca error — pasa a un
  estado de aviso inline (mismo patrón visual que `EditPatientForm.tsx`: caja con tinte +
  `alertCircle` + texto + botones "Volver" / "Confirmar igual"), con el texto:
  *"Este medicamento nunca se recibió para el protocolo [nombre]. ¿Confirmás que corresponde
  asignarlo igual?"*. Al confirmar, se reintenta la llamada con `confirmNewToProtocol: true`.
  "Volver" descarta el aviso y deja el desplegable como estaba (sin perder la selección).

## Fuera de alcance

- `VisitDispensationPanel.tsx` no cambia.
- No se agrega trigger de auditoría a `protocol_medications` (paridad con el patrón existente de
  recepción, no una regresión nueva).
- No se toca la RLS ni el trigger `check_patient_med_protocol` de `patient_medications`.
