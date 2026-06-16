# Spec · Modelo de visitas: hitos pre-randomización + cronograma post-randomización

**Fecha:** 2026-06-15
**Autor:** Lautaro Molina (con Claude)
**Módulo:** Spira Track
**Estado:** Diseño aprobado (**enfoque A — tabla unificada**). Pendiente: review del usuario → plan.

---

## 1. Objetivo

Modelar el ciclo real de visitas de un paciente en un protocolo, que tiene **dos etapas**:

1. **Pre-randomización** — visitas sueltas que se registran a medida que pasan (firma, screening,
   visitas no programadas), sin cronograma fijo.
2. **Post-randomización** — el cronograma del protocolo (V1, V2, V3…), que aparece anclado en la fecha
   de randomización y avanza visita por visita, con la posibilidad de registrar extras (VNP, retest).

El alta de paciente deja de pedir fechas de estudio: el paciente nace **sin visitas** y todo se va
registrando desde la ficha. **Toda visita** (programada o suelta) lleva su checklist.

---

## 2. Modelo de dominio (reglas)

### Tipo de visita (`kind`)
`programada · firma · screening · firma_screening · randomizacion · vnp · retest`
(`programada` = visita del cronograma del protocolo; el resto = visitas sueltas.)

### Reglas de las visitas sueltas

| Tipo | Etapa | Cantidad | Notas |
|---|---|---|---|
| **Firma** | pre-rando | 1 | mutuamente excluyente con `firma_screening` |
| **Screening** | pre-rando | 1 (por ahora) | mutuamente excluyente con `firma_screening` |
| **Firma y Screening** | pre-rando | 1 | combo; excluye `firma` y `screening` sueltos |
| **VNP** (Visita No Programada) | pre y post | ilimitadas | — |
| **Randomización** | pre-rando | 1 | **exige** firma + screening previos (sueltos o combo). Cierra la etapa |
| **Retest** | **post-rando** | ilimitadas | repetición de una evaluación |

- "Firma satisfecha" = existe `firma` **o** `firma_screening`. "Screening satisfecho" = existe
  `screening` **o** `firma_screening`. La randomización exige ambas.
- **Etapa** se determina por `enrollments.randomization_date`: `null` = pre-rando; con valor = post-rando.
- **No** contemplamos re-randomización (caso raro → manual; ver §10).

---

## 3. Arquitectura (enfoque A — aprobado)

**Todo en `patient_visits`**, con una columna `kind` que distingue la visita programada de las sueltas.
Motivo del cambio respecto del primer borrador (que proponía una tabla aparte): el sistema de
**checklists** ya está pegado a `patient_visits` (trigger de materialización). Como el usuario definió
que **todas** las visitas llevan checklist, una tabla aparte obligaría a duplicar el aparato de
checklist (tabla de ítems polimórfica + segundo trigger) y a mezclar dos fuentes en el tracker.
Unificando: un solo origen, un solo trigger de checklist, un solo tracker. El costo es aflojar unas
columnas de `patient_visits` (las sueltas no tienen ventana ni definición) y ajustar el cálculo de
estado para ellas.

---

## 4. Esquema de datos

### 4.1 Enum + columna `kind`
```sql
create type visit_kind as enum
  ('programada', 'firma', 'screening', 'firma_screening', 'randomizacion', 'vnp', 'retest');

alter table public.patient_visits add column kind visit_kind not null default 'programada';
```
- Las filas existentes quedan en `programada` (el default + backfill explícito).

### 4.2 Aflojar columnas (las visitas sueltas son point-in-time, sin ventana ni definición)
```sql
alter table public.patient_visits
  alter column visit_def_id  drop not null,
  alter column estimated_date drop not null,
  alter column window_start  drop not null,
  alter column window_end    drop not null;

-- Consistencia: programada ⟺ tiene definición y ventana; suelta ⟺ no.
alter table public.patient_visits add constraint patient_visits_kind_shape check (
  (kind = 'programada' and visit_def_id is not null and estimated_date is not null
     and window_start is not null and window_end is not null)
  or
  (kind <> 'programada' and visit_def_id is null)
);
```
- Las sueltas guardan `real_date` (la fecha en que pasaron) y opcional `notes`; `estimated_date`/
  ventana en `null`.

### 4.3 `enrollments`
- Se **mantiene** `randomization_date` (anclaje del cronograma + flag de "ya randomizado"). Lo setea
  el RPC al registrar la visita de randomización → dispara el trigger de 0021 (ver §5).
- Se **elimina** `screening_date` (agregada en 0021): el screening ahora es una visita suelta.

---

## 5. Triggers (cronograma + checklist + estado)

### 5.1 Generación del cronograma — reusar 0021
Sin cambios: el trigger `generate_patient_visits` se dispara cuando se setea
`enrollments.randomization_date` y genera las visitas `programada` ancladas en esa fecha.

### 5.2 Materialización del checklist — extender a INSERT
Hoy `materialize_checklist` corre `after update` cuando `real_date` pasa de null a un valor. Las
visitas sueltas se **insertan** con `real_date` ya cargado, así que el trigger debe correr también
`after insert` cuando `real_date is not null`. Misma plantilla (protocolo o global). Resultado: toda
visita (programada al registrarse, o suelta al crearse) materializa su checklist.

### 5.3 Estado calculado (`v_patient_visits` / `v_track_visits`)
- **`programada`:** lógica actual (futura/proxima/realizada/completa/item_vencido/ventana_vencida) por
  ventana + checklist.
- **suelta:** no tiene ventana → nunca `ventana_vencida`/`futura`/`proxima`. Siempre tiene `real_date`
  → estado por **checklist**: `realizada` → `completa` (todo el checklist ok) / `item_vencido` (ítem
  obligatorio vencido).
- **`v_track_visits`:** `left join visit_definitions` (antes inner) para no perder las sueltas; se
  expone `kind`; para las sueltas el "nombre" sale del `kind` (Firma, Screening, VNP…) y el orden por
  `real_date`.

---

## 6. RPC `register_visit_event` (SECURITY DEFINER) + edición/borrado

Las visitas `programada` se siguen registrando con el `registerVisit` actual (UPDATE `real_date`). Las
**sueltas** se crean/editan/borran por RPC, que centraliza reglas + authz:

```
register_visit_event(p_enrollment_id uuid, p_kind visit_kind, p_date date, p_notes text) returns uuid
```
1. **Authz:** gerencia, track-admin, o coordinadora asignada (operator+) del protocolo.
2. **Etapa** (por `randomization_date`): pre-rando permite firma/screening/firma_screening/vnp/
   randomizacion; post-rando solo vnp/retest. `programada` nunca se crea por este RPC.
3. **Singletons + exclusiones** (§2). **Randomización** exige firma + screening satisfechas.
4. **Insert** en `patient_visits` (`kind`, `real_date = p_date`, `visit_def_id null`, `created`…).
5. **Si `randomizacion`:** `update enrollments set randomization_date = p_date` → genera el cronograma.

- **Editar** una visita suelta (fecha/nota): `update patient_visits` (RLS de track). El `kind` no se
  edita: para cambiarlo se borra y se recrea.
- **Borrar** una visita suelta: permitido para `kind <> 'programada'` (RPC `delete_visit_event` o
  policy DELETE acotada por kind + coordinador/gerencia). **Excepción:** la `randomizacion` no se borra
  desde la UI una vez generado el cronograma (edge case → manual; ver §10).

---

## 7. Flujo de UI

### 7.1 Alta de paciente (`NewPatientForm`)
- Se quitan los campos "Fecha de screening" y "Fecha de randomización" (0021).
- El **RPC de alta pasa a v5** sin `p_screening_date`/`p_randomization_date`. La randomización ocurre
  **solo** vía `register_visit_event` (que valida firma+screening); el alta nunca genera cronograma.

### 7.2 "Registrar visita" en la ficha (un botón, comportamiento por etapa)
- **Pre-rando:** selector de tipo (permitidos según reglas) + fecha (default hoy) + nota →
  `register_visit_event`. Si es Randomización, al confirmar aparece el cronograma.
- **Post-rando:** propone la **próxima `programada`** (marca `real_date` con `registerVisit`); control
  secundario para **VNP/Retest** → `register_visit_event` (no consume la programada).

### 7.3 Tracker ("pelotitas")
Una sola fuente (`patient_visits` vía `v_track_visits`), ordenada por fecha. Pre-rando: solo las
sueltas. Post-rando: historial de sueltas + cronograma con su progreso. **Adherencia** = realizadas/
programadas cuenta **solo `kind = 'programada'`** (las sueltas son extras, no entran al denominador).

### 7.4 Editar paciente (`EditPatientForm`)
- Se quita la sección "Datos del estudio" (inputs de fecha) agregada antes: esas fechas ahora son
  visitas. (IVRS opcional y el resto quedan igual.)

---

## 8. Cambios al código

**Revertir de la iteración 0021/anterior:**
- `NewPatientForm`: sacar campos de fecha de estudio; RPC de alta → **v5** sin esas fechas.
- `EditPatientForm`: sacar sección "Datos del estudio"; sacar `updateEnrollmentDates` y props
  `screeningDate`/`randomizationDate`.
- `data/patients.ts`: sacar `screening_date` del embed/`PatientEnrollment`; **mantener**
  `randomization_date` (para saber etapa en la UI); sacar `EnrollmentDatesInput`/`updateEnrollmentDates`.

**Reutilizar (no tocar la lógica, solo extender donde dice §5):**
- `enrollments.randomization_date` + `generate_patient_visits` (0021).
- `registerVisit`/`rescheduleVisit` para las `programada`.

**Nuevo:**
- Migración: enum `visit_kind` + columna + aflojar columnas + check + drop `screening_date` + extender
  `materialize_checklist` a insert + ajustar `v_patient_visits`/`v_track_visits` (left join + estado de
  sueltas + exponer `kind`) + RPC `register_visit_event` (+ borrado de sueltas).
- `data/visits.ts`: `TrackVisitRow += kind`, columnas nullables; `registerVisitEvent`/`editVisitEvent`/
  `deleteVisitEvent`; ajustar helpers de `lib/visits.ts` (current/próxima/adherencia consideran `kind`).
- UI: selector de tipo + integración del "Registrar visita" por etapa en la ficha; el tracker
  (`PdVisitFlow`/`PdFullSchedule`) muestra `kind` y las sueltas.

---

## 9. Seguridad / auditoría / RLS

- INSERT de visitas sueltas: **solo vía RPC** (SECURITY DEFINER). UPDATE: RLS de track existente
  (coordinadora asignada/gerencia). DELETE: acotado a `kind <> 'programada'` + coordinadora/gerencia.
- `materialize_checklist` y `generate_patient_visits` ya son SECURITY DEFINER (owner postgres).
- Auditoría: `patient_visits` ya está auditada (trigger genérico). El cambio de `kind`/inserción queda
  registrado.

---

## 10. Pendientes / limitaciones

- **Re-randomización:** corregir la fecha de rando con cronograma ya generado no regenera (guard
  anti-duplicado de 0021). Manual. Tampoco se borra la visita de randomización desde la UI.
- **Tracker del Detalle de Protocolo (`PdPatientRow`):** **2ª fase** (primero la ficha). Pre-rando
  muestra las sueltas; hasta entonces puede decir "sin cronograma todavía".
- **`visit_definitions` anclados en randomización:** las definiciones del protocolo representan el
  cronograma **post-rando** (offset 0 = randomización). Revisar que los esquemas demo estén así.
- **Estado de las sueltas:** se asume que una visita suelta está "realizada" al registrarse (se carga
  después de que pasó). No tienen ventana.

---

## 11. Decisiones tomadas (review del usuario)

1. **Checklist en TODAS las visitas** (sueltas incluidas) → motivó el enfoque A. Misma plantilla del
   protocolo por ahora (checklists por tipo de visita = futuro).
2. **Visitas sueltas editables** (fecha/nota) **y borrables** (salvo randomización post-cronograma).
3. **Tracker del Detalle de Protocolo = 2ª fase.**
4. `event_date`/`real_date` por defecto hoy, editable.

---

## 12. Fases de implementación (sugerido)

1. **Base de datos:** migración completa (enum + columna + aflojar + check + drop screening_date +
   triggers/vistas + RPCs). Verificar en vivo.
2. **Reverts de front:** alta (v5, sin fechas) + editar paciente (sin "Datos del estudio") + data layer.
3. **Registrar visitas sueltas:** data layer (`registerVisitEvent`/edit/delete) + selector de tipo +
   flujo "Registrar visita" por etapa en la ficha + checklist de la suelta.
4. **Tracker de la ficha:** `PdVisitFlow`/`PdFullSchedule` muestran sueltas + programadas + `kind`.
5. **(Fase 2)** Tracker del Detalle de Protocolo.
