# Spec · Modelo de visitas: hitos pre-randomización + cronograma post-randomización

**Fecha:** 2026-06-15
**Autor:** Lautaro Molina (con Claude)
**Módulo:** Spira Track
**Estado:** Diseño aprobado (enfoque B). Pendiente: review del usuario → plan de implementación.

---

## 1. Objetivo

Modelar el ciclo real de visitas de un paciente en un protocolo, que tiene **dos etapas**:

1. **Pre-randomización** — eventos sueltos que se registran a medida que pasan (firma, screening,
   visitas no programadas), sin cronograma fijo.
2. **Post-randomización** — el cronograma del protocolo (V1, V2, V3…), que aparece anclado en la fecha
   de randomización y avanza visita por visita, con la posibilidad de registrar extras (VNP, retest).

El alta de paciente deja de pedir fechas de estudio: el paciente nace sin visitas y todo se va
registrando desde la ficha.

---

## 2. Modelo de dominio (reglas)

### Tipos de evento (`kind`)
`firma · screening · firma_screening · randomizacion · vnp · retest`

### Reglas

| Tipo | Etapa | Cantidad | Notas |
|---|---|---|---|
| **Firma** | pre-rando | 1 | mutuamente excluyente con `firma_screening` |
| **Screening** | pre-rando | 1 (por ahora) | mutuamente excluyente con `firma_screening` |
| **Firma y Screening** | pre-rando | 1 | combo; excluye `firma` y `screening` sueltos |
| **VNP** (Visita No Programada) | pre y post | ilimitadas | — |
| **Randomización** | pre-rando | 1 | **exige** firma + screening previos (sueltos o combo). Cierra la etapa |
| **Retest** | **post-rando** | ilimitadas | repetición de una evaluación |

- "Firma satisfecha" = existe `firma` **o** `firma_screening`. "Screening satisfecho" = existe
  `screening` **o** `firma_screening`. La randomización exige ambas satisfechas.
- **Etapa** se determina por `enrollments.randomization_date`: `null` = pre-rando; con valor = post-rando.
- **No** contemplamos re-randomización (caso raro → manual; ver §10).

---

## 3. Arquitectura (enfoque B — aprobado)

Dos almacenamientos separados, una sola experiencia de usuario:

- **`enrollment_events`** (tabla nueva): los hitos y extras (todos los `kind`).
- **`patient_visits`** (intacta): el cronograma de visitas programadas, generado desde
  `visit_definitions`.
- **Puente:** registrar la **Randomización** setea `enrollments.randomization_date = event_date`, lo
  que dispara el trigger `generate_patient_visits` (ya existente, migración 0021) y genera el
  cronograma anclado en esa fecha.

Por qué B y no "todo en `patient_visits`": no desestabiliza la maquinaria del cronograma (ventanas,
estado calculado en `v_patient_visits`/`v_track_visits`, checklists). Los eventos son point-in-time
(se registran después de ocurrir, siempre "realizados"), no encajan en el modelo de ventana/estado de
las visitas programadas. La separación es más simple y de menor riesgo.

---

## 4. Esquema de datos

### 4.1 Enum
```sql
create type enrollment_event_kind as enum
  ('firma', 'screening', 'firma_screening', 'randomizacion', 'vnp', 'retest');
```

### 4.2 Tabla `enrollment_events`
```sql
create table public.enrollment_events (
  id            uuid primary key default uuid_generate_v4(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  kind          enrollment_event_kind not null,
  event_date    date not null,
  notes         text,
  created_by    uuid not null references public.users(id),
  created_at    timestamptz not null default now()
);
```
- Índice por `(enrollment_id, event_date)`.
- Auditada por el trigger genérico de auditoría (como el resto).
- Sin `updated_at`: los eventos son inmutables salvo borrado (ver §8 para política de edición/borrado —
  decisión abierta menor).

### 4.3 Ajustes a `enrollments`
- Se **mantiene** `randomization_date` (anclaje del cronograma, seteado por el RPC al registrar la
  randomización; también sirve para saber si está randomizado).
- Se **elimina** `screening_date` (agregada en 0021): el screening ahora es un evento; no hace falta
  denormalizar. (Si la ficha quiere mostrar la fecha de screening, la lee del evento.)

### 4.4 `patient_visits`
Sin cambios. El cronograma se genera vía el trigger de 0021 cuando se setea `randomization_date`.

---

## 5. RPC `register_enrollment_event` (SECURITY DEFINER)

Punto único de entrada server-side. Valida reglas + autoriza + (si randomización) setea el ancla.

```
register_enrollment_event(p_enrollment_id uuid, p_kind enrollment_event_kind,
                          p_event_date date, p_notes text) returns uuid
```

Lógica:
1. **Authz:** gerencia, track-admin, o coordinadora asignada (operator+) del protocolo del enrolamiento.
   (Mismo criterio que el alta / edición.)
2. **Etapa:** leer `randomization_date` del enrolamiento.
   - pre-rando (`null`): permitir `firma`, `screening`, `firma_screening`, `vnp`, `randomizacion`.
   - post-rando (con valor): permitir solo `vnp`, `retest`.
   - Rechazar lo no permitido con mensaje claro (errcode `42501`/`check_violation`).
3. **Singletons + exclusiones:** `firma`/`screening`/`firma_screening`/`randomizacion` máx. 1;
   `firma_screening` excluye `firma` y `screening` y viceversa.
4. **Randomización exige** firma satisfecha + screening satisfecha.
5. **Insertar** el evento (con `created_by = auth.uid()`).
6. **Si `kind = randomizacion`:** `update enrollments set randomization_date = p_event_date where id = …`
   → dispara `generate_patient_visits` (0021) → aparece el cronograma.

Errores con mensajes serenos en castellano (patrón ya usado en el resto de RPCs).

---

## 6. Flujo de UI

### 6.1 Alta de paciente (`NewPatientForm`)
- **Se quitan** los campos "Fecha de screening" y "Fecha de randomización" (agregados en 0021).
- Quedan: obligatorios (Nombre, Protocolo, Nacimiento, Sexo, Fertilidad) + opcionales (IVRS, Médico).
- El **RPC de alta pasa a v5**: se le sacan `p_screening_date`/`p_randomization_date`. Importante para
  correctitud: la randomización debe ocurrir **solo** vía `register_enrollment_event` (que valida
  firma+screening). Si el alta pudiera setear `randomization_date`, se saltearía esa regla y se
  generaría el cronograma sin firma/screening. El alta crea el paciente + enrolamiento **sin** visitas.

### 6.2 "Registrar visita" en la ficha (un solo botón, comportamiento por etapa)
- **Pre-rando:** abre un selector de tipo con los permitidos (Firma / Screening / Firma y Screening /
  VNP / Randomización, filtrando los ya usados según reglas) + fecha (default hoy) + nota →
  `register_enrollment_event`. Si es Randomización, al confirmar aparece el cronograma.
- **Post-rando:** propone la **próxima visita programada** (marca `real_date` vía `registerVisit`
  existente). Un control secundario permite registrar **VNP** o **Retest** → `register_enrollment_event`
  (no consume la visita programada).

### 6.3 Tracker ("pelotitas") — ficha
Se combinan en el front dos fuentes ordenadas por fecha:
- **eventos** (`enrollment_events`): firma, screening, rando, VNP, retest — siempre "realizados".
- **visitas programadas** (`patient_visits` vía `v_track_visits`): post-rando, con su estado/ventana.

Pre-rando: solo crecen los eventos. Post-rando: historial de eventos + el cronograma con su progreso.

### 6.4 Editar paciente (`EditPatientForm`)
- Se **quita** la sección "Datos del estudio" (inputs de fecha screening/randomización) agregada en la
  iteración anterior: esas fechas ahora son eventos. (El IVRS opcional y el resto quedan igual.)

---

## 7. Cambios al código existente

**Revertir de la iteración 0021/anterior (no eran necesarios bajo el modelo B):**
- `NewPatientForm`: sacar campos de fecha de estudio + sus props/estado.
- RPC de alta → **v5** sin `p_screening_date`/`p_randomization_date` (la randomización solo vía el RPC
  de eventos; el alta nunca genera cronograma).
- `EditPatientForm`: sacar la sección "Datos del estudio"; sacar `updateEnrollmentDates` y las props
  `screeningDate`/`randomizationDate`.
- `data/patients.ts`: sacar `screening_date`/`randomization_date` del embed de `usePatients` y de
  `PatientEnrollment` (la ficha lee randomización del enrolamiento si la necesita, screening de eventos);
  sacar `EnrollmentDatesInput`/`updateEnrollmentDates`; el RPC de alta deja de mandar las fechas.

**Reutilizar (no tocar):**
- `enrollments.randomization_date` + el trigger `generate_patient_visits` (0021).
- `patient_visits`, `v_track_visits`, `v_patient_visits`, ventanas, estados, checklists.
- `registerVisit` / `rescheduleVisit` para las visitas programadas post-rando.

**Nuevo:**
- Migración: enum + tabla `enrollment_events` + RLS + RPC `register_enrollment_event` + drop
  `enrollments.screening_date`.
- `data/enrollmentEvents.ts`: `useEnrollmentEvents(enrollmentId)` + `registerEnrollmentEvent(...)`.
- UI: selector de tipo + integración en la ficha y en el tracker.

---

## 8. Seguridad / auditoría / RLS

- **`enrollment_events` con RLS:** SELECT = gerencia o coordinadora asignada del protocolo (vía
  enrollment→protocol_coordinators); INSERT solo vía el RPC (SECURITY DEFINER); UPDATE/DELETE: gerencia
  o coordinadora asignada (o append-only — **decisión abierta menor**, ver §10).
- **Auditoría:** trigger genérico de auditoría sobre `enrollment_events` (before/after + actor).
- El RPC fija `created_by = auth.uid()` (anti-spoofing del actor).

---

## 9. Decisiones por defecto (a confirmar en review)

1. **Los eventos no llevan checklist** (solo fecha + nota). Los checklists siguen siendo de las visitas
   programadas.
2. **`event_date`** por defecto hoy, editable.
3. **El tracker mezcla en el front** (no se crea una vista SQL union por ahora).
4. **Edición/borrado de eventos:** permitir borrar un evento (con la misma RLS); editar la fecha/nota
   sí; cambiar el `kind` no (se borra y se recrea). *Alternativa:* append-only puro.

---

## 10. Pendientes / limitaciones conocidas

- **Re-randomización:** si se corrige la fecha de randomización después de generado el cronograma, hoy
  no se regenera (guard anti-duplicado de 0021). Manual por ahora.
- **Tracker del Detalle de Protocolo (`PdPatientRow`):** hoy muestra solo el cronograma. Para que
  refleje a los pacientes pre-rando (que solo tienen eventos) habrá que sumarle los eventos. Se puede
  hacer en una **segunda fase** (primero la ficha, después el tablero).
- **`visit_definitions` anclados en randomización:** las definiciones de visita del protocolo deben
  representar el cronograma **post-rando** (offset 0 = randomización). Revisar que los esquemas demo
  estén cargados con ese criterio.

---

## 11. Fases de implementación (sugerido)

1. **Base:** migración (enum + tabla + RLS + RPC + drop screening_date) + revertir las fechas del front
   (alta/edición/data layer).
2. **Registrar eventos:** `data/enrollmentEvents.ts` + selector de tipo + flujo "Registrar visita" por
   etapa en la ficha.
3. **Tracker ficha:** mezclar eventos + cronograma en `PdVisitFlow`/`PdFullSchedule`.
4. **(Fase 2)** Tracker del Detalle de Protocolo + ajustes finos.
