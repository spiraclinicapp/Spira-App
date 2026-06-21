# Spira · Diseño — Cronograma = cuadro de actividades completo + flujo de randomización

- **Fecha:** 2026-06-21
- **Estado:** aprobado (brainstorming) — pendiente plan de implementación
- **Módulo:** Track
- **Sucesor de:** `docs/superpowers/specs/2026-06-20-cronograma-protocolo-design.md` (que limitó el cronograma a post-randomización; esto lo amplía al cuadro completo)

## Contexto

El cronograma actual (migraciones 0026/0027) modela **solo las visitas post-randomización** (tratamiento), ancladas a `enrollments.randomization_date`. Las visitas previas (selección, screening, randomización) y las no planificadas (VNP, retest) viven como **visitas "sueltas"** (`patient_visits.kind`, sin `visit_def_id`). Dos limitaciones que el usuario quiere cerrar:

1. **El cuadro de actividades real es uno solo** (selección → screening → randomización → tratamiento 52 sem → seguimiento), numerado V1, V2, V3… El editor debe modelar **todo** ese cuadro, y la UI mostrar el **título "código - nombre"** ("V1 - Screening", "V2 - Randomización", "V3"…), con la **burbuja** del tracker mostrando el **número** (orden cronológico = cuántas veces vino el paciente).

2. **La randomización (y el screening) se confirman al terminar la visita, no al agendarla.** Hoy `register_visit_event` fija `randomization_date` **al agendar** la randomización. Pero un paciente puede venir a randomizar y **no poder randomizarse** (se recita → cuenta como otra visita). La fecha debe fijarse cuando la visita realmente terminó, y aprovechar ese momento para **capturar el IVRS** (en screening) y **confirmar la randomización** (en randomización).

**Aclaración clave de etapas** (Visitas del día): `por_llegar → en_el_sitio (arrived_at) → atendido (real_date) → listo (ready_at) → fuera (left_at)`. "Completar" (terminar el checklist, estado `completa`) es **otra cosa**, sirve para las alertas y **no** indica fin de visita. El paso operativo donde el clínico/coordinador cierra la parte clínica es **"Listo para irse"** (`mark_ready`); ahí van la alerta y la fijación de la fecha. "Fuera del sitio" (Recepción) es solo el check-out.

## Decisiones (del brainstorming)

1. **A — Cronograma = cuadro completo.** Las visitas planificadas (selección, screening, randomización, tratamiento, seguimiento) pasan a ser **definiciones** (`visit_definitions`). Las **no planificadas** (VNP, retest) siguen siendo sueltas (`kind`, sin def).
2. **B1 — Pre-randomización manuales.** Las definiciones pre-rando se agendan a mano (el `offset_days` queda como **referencia/ventana** del protocolo, no como fecha autocalculada). Solo las **post-rando se autogeneran** desde la randomización.
3. **Confirmación en "Listo para irse"** (`mark_ready`), a cargo del clínico/coordinador. Screening → "¿El IVRS te asignó número de paciente?" (captura `patients.code`). Randomización → "¿El paciente randomizó?" (Sí → fija `randomization_date` = fecha de la visita y genera el tratamiento; No → se recita, cuenta como otra visita).
4. **Un solo IVRS**, capturado en el screening.
5. **Agendar visita** elige de la lista de definiciones del protocolo (no de tipos genéricos). Reintentos permitidos (varias instancias de una misma definición pre-rando).
6. **Display "código - nombre"**; la burbuja sigue siendo el número cronológico.

## Modelo de datos

### `visit_definitions`
- **Nueva columna `role`** (`text`/enum: `'screening' | 'randomizacion' | 'comun'`, default `'comun'`). Solo determina **qué alerta** dispara la visita al cerrarse. La selección, el tratamiento, EOT/EOS y el seguimiento son `'comun'` (sin alerta especial).
- **Usa `date_mode`** (ya existe, latente: `'libre' | 'automatica'`, default `'automatica'`):
  - `'libre'` → pre-randomización: se agenda a mano; `offset_days` es referencia.
  - `'automatica'` → post-randomización: se autogenera (`estimated_date = randomization_date + offset_days`).
- El editor (`ScheduleEditor`) configura, por definición: `code`, `name`, `role`, `date_mode` (presentado como "se agenda manual / se genera desde la randomización"), `offset_days`, ventana, tipo, dispensa, orden.

### `patient_visits`
- **Toda visita del cuadro es `kind='programada'` con `visit_def_id`** (tenga `date_mode` libre o automatica). Las sueltas ad-hoc (VNP/retest) siguen con `kind` propio y `visit_def_id` null. Así "programada" = "pertenece al cuadro / tiene definición".
- **`patient_visits_kind_shape`** (constraint, 0025) se **relaja**: para `kind='programada'` se exige `visit_def_id` y `estimated_date` no nulos, pero **las ventanas pasan a opcionales** (las `automatica` las llenan en la generación; las `libre` quedan en null → nunca `ventana_vencida`, consistente con "sueltas que no vencen"). Para `kind<>'programada'` se mantiene `visit_def_id`/ventanas null.
- **Índice único `uq_pv_singleton_kind`** (0022, sobre `kind in (firma,screening,firma_screening,randomizacion)`): como screening/randomización pasan a `kind='programada'`, el singleton deja de aplicarles → **se permiten reintentos** de forma natural. Se revisa/recrea el índice para que no bloquee el cuadro.

### Vistas
- `v_patient_visits` / `v_track_visits` exponen **`role`** (y `date_mode` si hace falta) desde `visit_definitions`, para que el front sepa qué alerta mostrar. `visit_code`/`visit_name`/`sort_order`/`offset_days` ya se exponen.

## Generación

- **`generate_patient_visits()`** (trigger al setear `randomization_date`): genera solo definiciones **`date_mode='automatica'`**, y cambia el guard de "existe alguna programada → no genero" por un **guard por-definición** (`not exists` por `visit_def_id`), porque ahora las pre-rando libres también son `kind='programada'` y no deben bloquear la generación de las automáticas.
- **`sync_protocol_schedule()`** (0026): el conjunto `desired` se restringe a definiciones **`automatica`**. Crear/mover/borrar sigue tocando solo programadas **no atendidas**; las libres (pre-rando) no entran en la reconciliación automática.

## Flujo operativo (Fase 2)

### Agendar una visita planificada
- "Agendar visita" lista las **definiciones del protocolo** (V1 Screening, V2 Randomización, …). Al elegir una `libre` y una fecha, se crea un `patient_visits` `kind='programada'`, `visit_def_id` = la def, `estimated_date` = fecha elegida, `real_date` null, ventanas null. (Nueva/extendida RPC server-side, p. ej. `schedule_protocol_visit(p_enrollment_id, p_visit_def_id, p_date)`, con la authz de coordinadora asignada/track-admin/gerencia.)
- VNP/retest siguen por `register_visit_event` (sueltas), sin cambios.
- **`register_visit_event` deja de fijar `randomization_date`** (esa lógica se mueve al cierre clínico).

### Confirmación al pasar a "Listo para irse" (`mark_ready`)
El front, antes de avanzar a `listo`, mira el `role` de la visita y muestra la alerta correspondiente; pasa la respuesta a una RPC (extender `mark_ready` o un wrapper `mark_ready_with_outcome(p_visit_id, p_ivrs, p_randomized)`):
- `role='screening'` → **"¿El IVRS te asignó número de paciente?"** [No] / [Sí → input]. Si Sí → set `patients.code` (respetando el unique; mismo cuidado que `updatePatient`).
- `role='randomizacion'` → **"¿El paciente randomizó?"** [Sí]/[No]. Si Sí → set `enrollments.randomization_date` = `real_date` de la visita → dispara la generación de las `automatica` (V3+). Si No → no se setea nada; el paciente queda para **re-citar** otra randomización (otra instancia de la def; cuenta como visita).
- `role='comun'` → `mark_ready` normal, sin alerta.

## Display (Fase 1)

- Helper único en `src/lib/visits.ts` (p. ej. `visitTitle(v, n)`): si hay `visit_code` → **`"{visit_code} - {visit_name}"`** ("V1 - Screening"); si es suelta sin código → `KIND_LABELS[kind]` ("VNP", "Retest"). La **burbuja** sigue mostrando el número cronológico (`visitIndex`).
- Aplicar en los ~13 puntos de render (mapeados): `PdFullSchedule.tsx:26`, `PdVisitFlow.tsx:30,71`, `PdPatientRow.tsx:44`, `DayVisitRowItem.tsx:33,73`, `DayVisitsView.tsx:182`, `TrackResumenView.tsx:129,155`, `AgendaView.tsx:115`, `TrackAlertsView.tsx:136`, `DoctorQueueView.tsx:95`, `PatientFichaView.tsx:142`.

## Datos existentes / migración

- Los pacientes afectados por el backfill de 0021 los **borra el usuario** (decisión ya tomada; ver `supabase/scripts/2026-06-21-randomizacion-backfill-cleanup.sql`).
- Para las sueltas legacy de screening/randomización que se quieran conservar: el plan define si se **convierten** a `kind='programada'` + `visit_def_id` (atadas a las definiciones nuevas) o se dejan **legacy** (se muestran con `KIND_LABELS`). Recomendación: dado que la base es chica y se está curando, definir el cuadro por protocolo y, si hace falta, convertir a mano por script acotado (mismo patrón review-first que el resto).

## Fases

- **Fase 1 — Modelo base + display (cierra el pedido 2 en su mecánica):** `role` en `visit_definitions`; exponer `role`/`date_mode` en las vistas; generación/sync solo `automatica` + guard por-def; editor que configura `role`+`date_mode` y permite definir las pre-rando; relajar constraint y revisar el singleton; "código - nombre" en los 13 puntos. *(Bajo riesgo; las visitas pre-rando todavía pueden crearse por el flujo viejo hasta Fase 2.)*
- **Fase 2 — Flujo operativo (cierra el pedido 1):** agendar desde definiciones (`schedule_protocol_visit`); confirmación en `mark_ready` (IVRS en screening, "¿randomizó?" en randomización → fecha + generación); reintentos; quitar el seteo de `randomization_date` de `register_visit_event`.

## Fuera de alcance (YAGNI)

- Anclaje relativo entre definiciones (`anchor_visit_def_id` sigue latente).
- Ventanas/vencimiento para visitas pre-rando libres (no vencen).
- Números de IVRS múltiples (screening vs randomización): es uno solo.
- Reescritura del sistema de sueltas VNP/retest (se mantiene tal cual).

## Verificación

- `npm run typecheck` + `npm run build` verdes.
- Script SQL de verificación (patrón `supabase/scripts/*-verificacion.sql`): que la generación automática tome solo `automatica`; que el singleton no bloquee reintentos; que la confirmación en `mark_ready` fije `randomization_date` y genere V3+; que el screening capture el IVRS.
- QA en browser: definir un cuadro completo en un protocolo; agendar screening → "Listo" → capturar IVRS; agendar randomización → "Listo" → "Sí randomizó" → ver V3+ generadas y "Próximas visitas" poblado; probar el reintento ("No randomizó" → recitar).

## Riesgos / a resolver en el plan

- **Constraint `patient_visits_kind_shape` y singleton**: recrearlos sin invalidar datos existentes (migración nueva, inmutable).
- **`generate_patient_visits` guard por-def**: asegurar idempotencia (no duplicar) y no regenerar lo borrado a propósito.
- **`mark_ready` extendida vs wrapper**: decidir firma; mantener la authz actual (clínico/coordinador).
- **Permisos del IVRS**: setear `patients.code` desde el cierre de visita respetando RLS/unique.
- **Migración de sueltas legacy**: decidir convertir vs dejar legacy.
