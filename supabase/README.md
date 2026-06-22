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
| 0030 | `flujo_randomizacion.sql` | flujo operativo (Fase 2): el constraint de forma permite `programada` libre (sin ventanas); RPCs `schedule_protocol_visit` (agendar libre del cuadro), `mark_ready_with_outcome` (cierre clínico idempotente: IVRS de screening / confirma randomización), `discontinue_enrollment`; `register_visit_event` reescrito con **cutover** (cierra sueltas firma/screening/rando cuando hay cuadro); recrea `v_track_visits` (+`enrollment_randomization_date` para la salvaguarda). **Creada, PENDIENTE de aplicar a mano en prod.** |

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
