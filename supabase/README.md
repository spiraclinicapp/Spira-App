# Spira · Base de datos (Supabase / PostgreSQL)

La **fuente de verdad del schema son las migraciones** en `migrations/`, numeradas y
aplicadas en orden. No hay un `schema.sql` monolítico a propósito (para no tener dos
copias que diverjan). Para una vista combinada: `cat migrations/*.sql` o `supabase db dump`.

## Orden de migraciones

| # | Archivo | Contenido |
|---|---------|-----------|
| 0001 | `extensions_enums.sql` | extensiones (`uuid-ossp`, `pgcrypto`) + todos los enums |
| 0002 | `tables.sql` | 26 tablas: identidad/RBAC, Track, Pharma, auditoría |
| 0003 | `functions_triggers.sql` | `updated_at`, generación de visitas, materialización de checklist, stock (recepción/dispensación), auditoría genérica, validaciones e inmutabilidad |
| 0004 | `views.sql` | `v_patient_visits` (estado calculado), `v_medication_stock`, `v_billing_dispensations` |
| 0005 | `indexes.sql` | índices de uso frecuente |
| 0006 | `rls_policies.sql` | `enable RLS` + helpers `auth.*` + todas las policies |
| 0007 | `realtime_grants.sql` | publicación realtime + `replica identity` + revoke de `anon` |
| 0008 | `handle_new_user.sql` | trigger `auth.users → public.users` (perfil automático al registrarse, sin roles) |
| 0009 | `role_levels.sql` | niveles de rol estrictos (viewer<operator<leader<admin) + `role_rank` / `has_min_role` |
| 0010 | `pharma_read_enrollments.sql` | pharma puede LEER enrollments (read-only) para la vista protocolo→pacientes |
| 0011 | `protocols_description.sql` | columna `description` (libre, nullable) en `protocols` + seed demo — pista corta para la card del selector |
| 0012 | `create_patient_with_enrollment.sql` | RPC de alta atómica paciente+enrolamiento (SECURITY DEFINER con authz a mano, actor server-side) |
| 0013 | `v_track_visits.sql` | vista plana visita+definición+protocolo+paciente (security_invoker) para Resumen/Agenda de Track |
| 0014 | `checklist_templates_scoping.sql` | scoping de plantillas: global → track admin/gerencia; por protocolo → coordinadora asignada (operator+); + cierra la lectura de ítems sin scopear |
| 0015 | `track_rpcs.sql` | RPCs de Track: alta de paciente con bypass gerencia/track-admin + `create_protocol_template` (atómica) + `swap_template_item_order` (atómica) |
| 0016 | `v_track_visits_extend_and_kpis.sql` | amplía `v_track_visits` (offset_days, enrollment_date, treating_physician) + crea `v_protocol_kpis` (tablero del protocolo) |
| 0017 | `protocols_patients_new_columns.sql` | columnas nuevas: protocols (investigador/especialidad/código interno), patients (sex, fertility) |
| 0018 | `create_patient_with_enrollment_v2.sql` | RPC de alta v2: suma `p_sex`/`p_fertility` (drop+recreate de la de 6 params) |
| 0019 | `enrollments_update_gerencia.sql` | gerencia puede editar el enrolamiento (médico tratante); alinea la policy de UPDATE de `enrollments` con el resto (gerencia OR coordinadora asignada). **Superada por 0020** (queda inocua) |
| 0020 | `treating_physician_to_patients.sql` | mueve `treating_physician` de `enrollments` a `patients` (es atributo de la persona): columna + backfill + recrea `v_track_visits` y el RPC de alta + dropea la columna vieja |
| 0021 | `deferred_visits_optional_ivrs.sql` | visitas ancladas en `randomization_date` (generación diferida: al cargarla); `enrollments += screening_date/randomization_date`; `patients.code` opcional (IVRS se asigna en randomización); RPC de alta v4 |
| 0022 | `visitas_unificadas.sql` | modelo de visitas unificado: enum `visit_kind` + columna `kind` (`programada` vs sueltas pre-randomización); recrea las vistas en orden de dependencia |
| 0023 | `track_visita_dia.sql` | "Visitas del día": etapas operativas (marcas timestamptz) sobre `patient_visits` + flag `dispenses` en `visit_definitions` + tabla mínima `track_dispensations` |
| 0024 | `delete_patient.sql` | RPC `delete_patient` (gerencia o track leader/admin): borra el paciente en cascada (FK `ON DELETE CASCADE`), auditado |
| 0025 | `register_as_schedule.sql` | registrar una visita suelta = AGENDAR (`estimated_date`, `real_date` NULL); la atención se marca después en "Visitas del día" |
| 0026 | `protocol_schedule.sql` | gestión del cronograma del protocolo: endurece la RLS de `visit_definitions` (edición gerencia/track-admin, cierra el borrado directo) + RPCs `sync_protocol_schedule` y `delete_visit_definition` |
| 0027 | `count_deletable_visits.sql` | RPC `count_deletable_visits` (SECURITY DEFINER): impacto de borrar una definición `{deletable, attended}` con la authz del borrado (no bajo la RLS de lectura del caller) |
| 0028 | `track_admin_ve_protocolos.sql` | suma una rama `has_min_role('track','admin')` a la SELECT de `protocols` (era `leader` exacto): alinea la visibilidad de protocolos con quién gestiona el cronograma. Aditivo; no toca la visibilidad de patients/visits |
| 0029 | `visit_role_y_generacion.sql` | cuadro de actividades completo (Fase 1): `visit_definitions.role` (screening/randomizacion/comun); recrea `v_track_visits` (+`role`/`date_mode`) y `v_protocol_kpis`; `generate_patient_visits` y `sync_protocol_schedule` toman solo `date_mode='automatica'` |
| 0030 | `flujo_randomizacion.sql` | flujo operativo (Fase 2): el constraint de forma permite `programada` libre (sin ventanas); RPCs `schedule_protocol_visit` (agendar libre del cuadro), `mark_ready_with_outcome` (cierre clínico idempotente: IVRS de screening / confirma randomización), `discontinue_enrollment`; `register_visit_event` reescrito con **cutover** (cierra sueltas firma/screening/rando cuando hay cuadro); recrea `v_track_visits` (+`enrollment_randomization_date` para la salvaguarda). **Aplicada en prod (2026-06-22).** |
| 0031 | `doctor_seen.sql` | `patient_visits.doctor_seen_at` (marca "Atendido por el médico", persistente) + RPC `mark_doctor_seen`; recrea `v_track_visits` (+`doctor_seen_at`, recreando también `v_patient_visits` para que el `pv.*` re-exponga la columna). La cola "Para ver médico" deja al atendido visible (no desaparece) y suma el indicador "Médico" en Visitas del día. **Aplicada en prod (2026-06-22).** |
| 0032 | `pharma_catalogo_global.sql` | Pharma 1a: `medications` global (drop `protocol_id`, + `drug_id`→`drugs`), stock por protocolo (`medication_lots.protocol_id` + nuevo unique), `protocol_medications` (asignación), `medication_codes` (GTIN único); reescribe `apply_reception_stock`/`check_*_item_protocol`/`v_medication_stock`; RPCs `create_drug`/`create_medication`/`assign_medication_to_protocol`/`create_reception`/`verify_reception`/`adjust_stock`. Corrige de paso un bug latente de `apply_reception_stock` (0003 usaba `excluded.quantity`, columna inexistente; nunca se había ejecutado por falta de UI). **Aplicada en prod (2026-06-25).** |
| 0033 | `pharma_laboratorios.sql` | laboratorio en el catálogo: tablas `laboratorios` + `laboratorio_codes` (prefijo de empresa GS1 del GTIN → laboratorio, aprendido on-demand al escanear, espejo de `medication_codes`); `medications.laboratorio_id`; RPC `create_laboratorio` + `create_medication` re-firmado para aceptar el laboratorio. **Aplicada en prod (2026-06-28).** |
| 0034 | `pharma_dosis.sql` | `medications.dosis` como campo propio (vivía pegada al `name`; el `name` sigue compuesto para no romper los desplegables) + `create_medication` re-firmado para aceptar la dosis. **Aplicada en prod (2026-06-28).** |
| 0035 | `pharma_recepcion_tipos.sql` | recepción tipada: enum `reception_kind` (`protocolo`/`investigacion`/`ambulatoria`); `tipo` en `medication_receptions` y `medication_lots` con `protocol_id` ahora nullable + CHECK (`ambulatoria` ⇔ sin protocolo) + unique parcial de lote ambulatorio; reescribe `apply_reception_stock`, `create_reception` y `v_medication_stock` para ramificar por ámbito. **Aplicada en prod (2026-06-29).** |
| 0036 | `pharma_v_stock_fix.sql` | fix salido del review de la 0035: `v_medication_stock` agrupaba por `ml.tipo` (fan-out latente si un protocolo mezclara tipos de lote); vuelve a la invariante "una fila por (medicamento, protocolo)" con `tipo` fijo `protocolo`, rama ambulatoria intacta. **Aplicada en prod (2026-06-29).** |
| 0037 | `pharma_ip_units.sql` | Producto de Investigación (IP) por UNIDAD: tabla `ip_units` (una fila = un kit; identidad protocolo+`kit_number`; ganchos de dispensación nullable para Tajada 2) + enum `ip_unit_status` + RLS/auditoría + RPC `create_ip_reception` (por unidades) + vista `v_ip_units` + rama IP de `apply_reception_stock`. **Superada por 0038** (pivote al modelo macro; la tabla queda dormida). **Aplicada en prod (2026-06-30).** |
| 0038 | `pharma_ip_macro.sql` | PIVOTE del IP a ingreso MACRO por cantidad (definición del Director: la traza por kit la lleva el sponsor/IRT, Spira no la duplica): columnas macro en `medication_receptions` (coordinador, `temperature_ok`, `total_kits`, rango de kits, `storage_location`, doble check docs+IRT, `started_at`); RPC `create_ip_reception` re-firmado (crea la recepción directamente `verificada`: el doble check ES la verificación); vista `v_ip_stock` (kits por protocolo, excluye recepciones IP viejas sin cantidad); RPC `list_protocol_coordinators`; dropea `v_ip_units` y el RPC por-unidad; `ip_units` queda DORMIDA (no se dropea por regla de datos reales). **Aplicada en prod (2026-07-02).** |
| 0039 | `pharma_ip_storage_unificar.sql` | unifica el almacenamiento del IP a `heladera` \| `ambiente` ('estante' era operativamente lo mismo que ambiente): convierte los datos existentes, recrea el CHECK y acota la validación del RPC `create_ip_reception`. **Aplicada en prod (2026-07-02).** |
| 0040 | `pharma_recepcion_autoasocia.sql` | catálogo global + asignación como CONSECUENCIA de recibir: `create_reception` y el trigger `apply_reception_stock` hacen upsert idempotente en `protocol_medications` (asocian) en vez de rechazar. Sin migración de datos. **Aplicada en prod (2026-07-04).** |
| 0041 | `pharma_v_lotes_detail.sql` | vista `v_medication_lots_detail`: una fila por LOTE (join lots→meds→drugs→codes) con EAN13 (un código por med), lote, vencimiento y flags de estado (`vencido` / `por_vencer` <30d) en SQL; ramas protocolo (protocol_id no null) y ambulatoria (null). Backing de la vista Medicamentos rediseñada. `v_medication_stock` no se toca. **Aplicada en prod (2026-07-05).** |
| 0042 | `pharma_medicamento_unico.sql` | anti-duplicado del catálogo: índice único `(lower(btrim(name)), unit)` — un medicamento por (nombre normalizado, presentación). Pre-requisito: limpiar duplicados existentes antes de aplicar (el índice falla si hay). **Aplicada en prod (2026-07-05).** |
| 0043 | `pharma_clase.sql` | `medications.clase` (clase/indicación, opcional) + `create_medication` re-firmado para aceptar `p_clase`. **Aplicada en prod (2026-07-05).** |
| 0044 | `feedback.sql` | tabla `feedback` (sugerencia/problema/idea + contexto autoadjuntado; actor server-side vía `auth.uid()`) + RLS SELECT solo gerencia + RPC `submit_feedback` (SECURITY DEFINER, rate-limit 10s). Backend del modal "Dar feedback". **Aplicada en prod (2026-07-05).** |
| 0045 | `profile_editable.sql` | "Mi cuenta" editable: columnas `puesto`/`centro`/`name_changed_at`/`email_changed_at` en `users`; **saca la policy de UPDATE del perfil propio** (0006) y enruta todo por RPCs SECURITY DEFINER `update_my_name` (regla dura 1 cambio/30 días), `update_my_puesto` (catálogo cosmético, **no toca el acceso**) y `stamp_email_change` (guarda 30 días del correo). `centro` con default → forzado y de solo lectura. **Aplicada en prod (2026-07-06).** |
| 0046 | `profile_rpc_search_path.sql` | hardening: `create or replace` de las 3 RPCs de 0045 con `set search_path = pg_catalog, public` (estándar del repo, 0006) en vez de solo `public`. Defensa en profundidad para SECURITY DEFINER. Solo cambia el search_path. **Aplicada en prod (2026-07-06).** |
| 0047 | `visit_doctor_motivo.sql` | "Marcar para ver médico" con MOTIVO: columna `patient_visits.doctor_motivo` + RPC `mark_wants_doctor(p_visit_id, p_motivo)` (setea `wants_doctor` + motivo atómico; authz espejo de `mark_doctor_seen`). Recrea `v_patient_visits`/`v_track_visits` (patrón del `*` congelado, espejo de 0031). Base del detalle de visita unificado. **Aplicada en prod (2026-07-06).** |
| 0048 | `visit_comments.sql` | comentarios de visita (hilo plano): tabla `visit_comments` con autor **desnormalizado** (`author_name`/`author_role` snapshot en la fila — la RLS de `users` solo muestra la fila propia y un join ocultaría en silencio los comentarios ajenos; además queda registrado el puesto DE ENTONCES, correcto para app auditable) + RPC `add_visit_comment` (SECURITY DEFINER; authz de escritura espejo de la lectura: gerencia o coordinador asignado) + vista `v_visit_comments` + recrea `v_track_visits`. Backend de Comentarios en `VisitDetail` y el Drawer de la cola del médico. **Aplicada en prod (2026-07-12).** |
| 0049 | `pvm_wait_and_demographics.sql` | rediseño de "Para ver médico": columnas `patient_visits.wants_doctor_at`/`doctor_marked_by` (reloj de espera + procedencia REALES, no inventados), estampadas SOLO en la transición false→true por `mark_wants_doctor` (0047) y `toggle_wants_doctor` (0023). Expone `patients.sex`/`birth_date` en `v_track_visits`. Recrea `v_patient_visits` (el `*` congelado, patrón 0047) **y agrega el `revoke` de escritura que le faltaba desde su origen en 0023** (era *automatically updatable* por ser una vista simple sobre una sola relación, con la RLS amplia de `patient_visits` detrás — hallazgo de la revisión adversarial). **Aplicada en prod (2026-07-12).** |
| 0050 | `pharma_dispensacion.sql` | dispensación (v1): tabla `patient_medications` (medicación habilitada por paciente/enrolamiento; RLS Pharma-escribe / Track-lee scopeado / gerencia-borra; trigger de coherencia con `protocol_medications`). **Doble enforcement** extendiendo `check_request_item_protocol` (al solicitar exige `patient_medications` activa) y `check_dispensation_item_protocol` (al entregar exige que el med figure en la solicitud **y siga activo**). 4 RPCs SECURITY DEFINER: `create_dispensation_request`/`cancel_dispensation_request` (Track, authz espejo de la RLS: operator+coordinador), `reject_dispensation_request`/`resolve_dispensation` (Pharma operator; FEFO atómico con desempate determinístico `expiry,created_at,lot_number`, un lote por med, sin partición ni override en v1) + índice `idx_med_lots_fefo`. Infra base (`dispensation_requests`→`dispensations` + triggers de stock) verificada con harness antes de construir; la 0050 verificada con harness end-to-end (enforcement + FEFO + RPCs con simulación de JWT). **Aplicada en prod (2026-07-14).** |
| 0051 | `pharma_asignar_medicacion_catalogo_global.sql` | RPC `assign_patient_medication`: el desplegable de "asignar medicación al paciente" pasa a listar el catálogo global (antes, solo lo recibido en `protocol_medications`). Si el medicamento nunca se recibió para el protocolo, devuelve `needs_confirmation` en vez de rechazar; confirmando, asocia (mismo upsert de 0040) y recién ahí asigna. No toca el trigger `check_patient_med_protocol` ni la RLS existentes. Verificada con harness (4 checks + simulación de JWT). **Aplicada en prod (2026-07-15).** |

Además, `seed_smoke_test.sql` (en `supabase/`, fuera de `migrations/`) carga datos demo
para validar el aislamiento de RLS. NO es para producción — ver instrucciones en su cabecera.
En `scripts/etapa0-preparacion.sql` hay un script idempotente para el SQL Editor que aplica
la 0012 y deja datos demo de Track (coordinaciones, esquema de visitas, plantilla global).
En `scripts/tablero-protocolo.sql` hay otro script idempotente que aplica 0016+0017+0018
(vistas ampliadas + columnas nuevas + RPC v2) para el tablero de protocolo y la ficha de paciente.

El orden respeta dependencias: enums → tablas → funciones → vistas → índices → RLS → realtime.

## Cómo aplicar

**Opción A — Supabase CLI (recomendada):**
```bash
supabase db push        # aplica las migraciones pendientes en orden
```

**Opción B — SQL Editor del dashboard:** pegar y ejecutar los archivos `0001` → `0007` en orden.

> Requiere correr como `postgres` (es el caso en el SQL Editor). Varias funciones son
> `SECURITY DEFINER` y dependen de que su owner sea `postgres` para bypassear RLS al
> generar filas del sistema (visitas, movimientos de stock, auditoría).

## Decisiones de diseño clave

1. **Timeline = log de eventos genérico.** `patient_timeline { actor, event_type, occurred_at, metadata }`. El orden vive en el log ("zona sin orden impuesto"); los hitos viejos (checkin/farmacia/coordinación/checkout) son `event_type`.
2. **Estado de visita = calculado al leer, NO almacenado.** Se deriva en `v_patient_visits` (réplica de `calcVisitState` de Spira Track). `patient_visits` no tiene columna `status`.
3. **Estado de dispensación = almacenado + realtime.** Lo actualiza la farmacéutica; se refleja en vivo vía Supabase Realtime.
4. **Stock por LOTE** (`medication_lots`), no por medicamento. `stock_movements` es inmutable (audit trail ANMAT).
5. **Aislamiento por protocolo en el lado Track** (vía `protocol_coordinators` / `auth.coordina_visita`). **Pharma es CENTRAL** (ve todos los protocolos) — decisión de negocio. Si se segrega por sponsor, crear `pharma_assignments`.
6. **Auditoría transversal** (`audit_log`) + anti-spoofing de actor + inmutabilidad de campos sensibles.

## Seguridad

El schema pasó dos rondas de revisión adversarial multi-agente. Reporte y estado en
[`schema-review.md`](./schema-review.md). Veredicto: **GO**.

## Próximos pasos (no incluidos acá)

- Seed inicial: usuarios demo + roles por módulo (`user_module_roles`).
- Migrar datos de los MVPs (localStorage de Track y Pharma).
- Edge Function de IVRS (PDF → Claude API) que pre-llena `dispensation_requests`.
- Verificar contra `App.jsx` de Track la elección de plantilla al materializar checklist.
