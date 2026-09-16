-- Spira · Migración 0126 — El IVRS que se muestra es el del ESTUDIO de la fila
-- ============================================================================
-- EL PROBLEMA, visto en prod el 2026-09-15: el listado de pacientes de LTS17231 mostraba los IVRS de
-- ACT18301 (032001500001…) en vez de los suyos (032001520001…). Los seis pacientes están en los dos
-- estudios, y en investigación clínica **el número de sujeto es por estudio**: mostrar el del otro
-- estudio en una pantalla —o peor, en un comprobante que se firma— es un dato equivocado sobre una
-- persona, no un detalle de presentación.
--
-- LA CAUSA: la columna correcta ya existe desde la 0062 (`enrollments.ivrs_code`, con índice único
-- por protocolo) y el script de carga la escribe, pero NINGUNA vista la proyecta: las seis de abajo
-- devuelven `patients.code`, que es el IVRS del estudio madre, sin mirar de qué inscripción es la
-- fila. Y las seis YA joinean `enrollments` (alias `e`), así que el arreglo es una línea en cada una:
--
--     pa.code as patient_code   →   coalesce(e.ivrs_code, pa.code) as patient_code
--
-- EL `coalesce` NO ES COSMÉTICO: `ivrs_code` es nullable (puede faltar antes de la randomización y
-- las filas anteriores a la 0062 no lo tienen). Sin él, esas pantallas pasarían de mostrar un número
-- equivocado a no mostrar ninguno, que en una lista de pacientes es peor. Y hace falta por una razón
-- más: en `v_pharma_report_items` la inscripción entra por LEFT JOIN, porque una salida AMBULATORIA
-- no tiene enrolamiento (0116/0117). Ahí `e.ivrs_code` es null por diseño y la fila sigue mostrando
-- el código del paciente, que es lo correcto: no pertenece a ningún estudio.
--
-- QUÉ NO CAMBIA: `patients.code` sigue siendo el IVRS del estudio madre y no se toca; ninguna vista
-- cambia de columnas (mismo nombre, tipo y orden), así que va `create or replace` —sin drop— y los
-- permisos se conservan. No hay que recrear nada que dependa de ellas.
--
-- ORDEN DE DESPLIEGUE: es INDIFERENTE. El front ya lee `patient_code` y lo muestra tal cual; esta
-- migración sólo cambia el valor que le llega. Aplicala cuando quieras.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0125. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

-- v_track_visits — Visitas de Coordinación: la lista del día, el modal, Pendientes, el cronograma, la campana y el CSV.
-- Copia verbatim de 0120_visita_espera_entrega_ip.sql, con el código del paciente cambiado.
create or replace view public.v_track_visits with (security_invoker = true) as
select
  v.id, v.enrollment_id, v.visit_def_id, v.estimated_date, v.real_date,
  v.window_start, v.window_end, v.notes, v.computed_status,
  vd.code as visit_code, vd.name as visit_name,
  coalesce(vd.visit_type, 'presencial') as visit_type, vd.sort_order,
  e.protocol_id, e.patient_id, e.status as enrollment_status,
  e.randomization_date as enrollment_randomization_date,
  pr.code as protocol_code, pr.name as protocol_name,
  coalesce(e.ivrs_code, pa.code) as patient_code, pa.full_name as patient_name,
  pa.sex, pa.birth_date,
  pa.fertility,                                           -- 0079
  vd.offset_days, e.enrollment_date,
  coalesce(v.treating_physician, pa.treating_physician) as treating_physician,  -- 0079
  v.coordinator_id, v.coordinator_name,                   -- 0065
  v.kind,
  v.arrived_at, v.ready_at, v.left_at, v.no_show_at,      -- no_show_at: 0067
  v.attended_at,                                          -- 0102
  v.wants_doctor,
  v.doctor_seen_at,
  v.doctor_motivo,
  v.wants_doctor_at, v.doctor_marked_by,
  coalesce(vd.dispenses, false) as dispenses,
  coalesce(vd.dispenses_ip, false) as dispenses_ip,       -- 0071
  v.operational_stage,
  vd.role, vd.date_mode,
  (select count(*) from public.visit_comments vc where vc.visit_id = v.id) as comments_count
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id;

comment on view public.v_track_visits is
  'patient_code = IVRS de la INSCRIPCIÓN (enrollments.ivrs_code, 0062), con fallback a patients.code para las filas legacy. 0126.';

-- v_ip_delivery_alerts — Avisos de entrega de IP pendiente.
-- Copia verbatim de 0119_ip_estado_por_visita.sql, con el código del paciente cambiado.
create or replace view public.v_ip_delivery_alerts with (security_invoker = true) as
select
  s.visit_id,
  s.estado,
  s.ancla,
  (s.ancla + interval '48 hours')        as vence_at,
  s.pedido_at,
  s.solicitantes,
  e.protocol_id, e.patient_id,
  pr.code  as protocol_code, pr.name as protocol_name,
  coalesce(e.ivrs_code, pac.code) as patient_code,  pac.full_name as patient_name,
  vd.name  as visit_name,    vd.code as visit_code,
  pv.real_date,
  coalesce(pv.treating_physician, pac.treating_physician) as treating_physician,
  pv.coordinator_id,
  pv.coordinator_name
from public.v_visit_ip_status s
join public.patient_visits pv on pv.id = s.visit_id
join public.enrollments e     on e.id = pv.enrollment_id
join public.protocols pr      on pr.id = e.protocol_id
join public.patients pac      on pac.id = e.patient_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
where s.sellada
  and s.abierto
  and s.ancla is not null
  and now() > s.ancla + interval '48 hours';

comment on view public.v_ip_delivery_alerts is
  'patient_code = IVRS de la INSCRIPCIÓN (enrollments.ivrs_code, 0062), con fallback a patients.code para las filas legacy. 0126.';

-- v_pharma_report_items — Renglones del reporte de Farmacia (y su CSV).
-- Copia verbatim de 0084_reportes_visita.sql, con el código del paciente cambiado.
create or replace view public.v_pharma_report_items with (security_invoker = true) as
select
  d.id                                  as dispensation_id,
  d.correlative_number,
  d.dispensation_code,
  d.delivered_at,
  -- Fecha LOCAL. Sin esto una entrega de las 21:30 cae al día siguiente y la serie diaria
  -- queda corrida. Mismo criterio que v_patient_visits (0004:30) y el resto del repo.
  (d.delivered_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
  d.ip_kits,                            -- por DISPENSACIÓN: sumarlo sobre las filas duplica
  greatest(0, round(extract(epoch from (d.delivered_at - d.created_at)) / 60))::int
                                        as minutos_hasta_entrega,
  coalesce(sol.unidades, 0)             as unidades_solicitadas,
  dr.id                                 as request_id,
  dr.protocol_id,
  pr.code                               as protocol_code,
  pr.name                               as protocol_name,
  pr.sponsor,
  dr.visit_code,                        -- 0084
  dr.enrollment_id,
  e.patient_id,
  coalesce(e.ivrs_code, pa.code)                               as patient_code,
  pa.full_name                          as patient_name,
  mov.medication_id,
  m.name                                as medication_name,
  coalesce(mov.unidades, 0)             as unidades
from public.dispensations d
join public.dispensation_requests dr on dr.id = d.request_id
left join public.protocols   pr on pr.id = dr.protocol_id
left join public.enrollments e  on e.id  = dr.enrollment_id
left join public.patients    pa on pa.id = e.patient_id
left join lateral (
  select sum(dri.quantity)::int as unidades
    from public.dispensation_request_items dri
   where dri.request_id = dr.id
) sol on true
left join lateral (
  select sm.medication_id, sum(-sm.quantity_delta)::int as unidades
    from public.stock_movements sm
   where sm.reference_type = 'dispensation'
     and sm.reference_id   = d.id
     and sm.movement_type  = 'dispensacion'
   group by sm.medication_id
) mov on true
left join public.medications m on m.id = mov.medication_id
where d.status = 'entregada'
  and d.delivered_at is not null;

comment on view public.v_pharma_report_items is
  'patient_code = IVRS de la INSCRIPCIÓN (enrollments.ivrs_code, 0062), con fallback a patients.code para las filas legacy. 0126.';

-- v_procedure_report_alerts — Alertas de reportes de procedimiento.
-- Copia verbatim de 0103_medico_y_coordinador_en_alertas_de_reporte.sql, con el código del paciente cambiado.
create or replace view public.v_procedure_report_alerts with (security_invoker = true) as
select
  pv.id              as visit_id,
  rd.id              as report_definition_id,
  pa.procedure_id,
  rd.name            as report_name,
  rd.platform,
  p.name             as procedure_name,
  rd.eta_hours,
  vpc.completed_at,
  (vpc.completed_at + (rd.eta_hours * interval '1 hour')) as report_due_at,
  e.protocol_id, e.patient_id,
  pr.code  as protocol_code, pr.name as protocol_name,
  coalesce(e.ivrs_code, pac.code) as patient_code,  pac.full_name as patient_name,
  vd.name  as visit_name,    vd.code as visit_code,
  -- ── 0103: las tres nuevas, al final para no alterar el orden anterior ──
  -- Mismo coalesce que v_track_visits (0079): la visita manda, el paciente respalda.
  coalesce(pv.treating_physician, pac.treating_physician) as treating_physician,
  pv.coordinator_id,
  pv.coordinator_name
from public.patient_visits pv
join public.enrollments e          on e.id  = pv.enrollment_id
join public.protocol_activities pa on pa.visit_def_id = pv.visit_def_id
join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                  and pp.procedure_id = pa.procedure_id
join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
join public.procedures p           on p.id  = pa.procedure_id
join public.protocols pr           on pr.id = e.protocol_id
join public.patients pac           on pac.id = e.patient_id
join public.visit_procedure_completions vpc
     on vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
left join public.report_status rs     on rs.visit_id = pv.id and rs.report_definition_id = rd.id
where rd.eta_hours is not null
  and coalesce(rs.stage, 'pendiente') = 'pendiente'
  and now() > vpc.completed_at + (rd.eta_hours * interval '1 hour');

comment on view public.v_procedure_report_alerts is
  'patient_code = IVRS de la INSCRIPCIÓN (enrollments.ivrs_code, 0062), con fallback a patients.code para las filas legacy. 0126.';

-- v_protocol_report_status — Tablero «Reportes pendientes» del protocolo.
-- Copia verbatim de 0104_coordinador_en_estado_de_reportes.sql, con el código del paciente cambiado.
create or replace view public.v_protocol_report_status with (security_invoker = true) as
select
  pv.id as visit_id,
  rd.id                as report_definition_id,
  rd.name              as report_name,
  rd.platform,
  rd.link,
  rd.eta_hours,
  rd.notes,
  rd.sort_order,
  pa.procedure_id,
  p.name               as procedure_name,
  p.code               as procedure_code,
  p.category           as procedure_category,
  pa.suggested_order   as procedure_order,
  vpc.completed_at,
  (vpc.id is not null)                                as completed,
  (pv.real_date is not null or vpc.id is not null)    as visita_iniciada,
  case when rd.eta_hours is null or vpc.completed_at is null then null
       else vpc.completed_at + (rd.eta_hours * interval '1 hour') end as due_at,
  coalesce(rs.stage, 'pendiente') as stage,
  rs.id                as report_status_id,
  rs.updated_at,
  rs.updated_by_name,
  e.protocol_id,
  e.patient_id,
  pv.visit_def_id,
  pr.code              as protocol_code,
  coalesce(e.ivrs_code, pac.code)             as patient_code,
  pac.full_name        as patient_name,
  vd.code              as visit_code,
  vd.name              as visit_name,
  vd.sort_order        as visit_sort_order,
  (select count(*) from public.report_status_history h where h.report_status_id = rs.id) as history_count,
  -- ── 0104: las dos nuevas, al final para no alterar el orden anterior ──
  pv.coordinator_id,
  pv.coordinator_name
from public.patient_visits pv
join public.enrollments e             on e.id  = pv.enrollment_id
join public.protocol_activities pa    on pa.visit_def_id = pv.visit_def_id
join public.protocol_procedures pp    on pp.protocol_id = e.protocol_id and pp.procedure_id = pa.procedure_id
join public.report_definitions rd     on rd.protocol_procedure_id = pp.id
join public.procedures p              on p.id  = pa.procedure_id
join public.protocols pr              on pr.id = e.protocol_id
join public.patients pac              on pac.id = e.patient_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
left join public.visit_procedure_completions vpc
       on vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id
left join public.report_status rs     on rs.visit_id = pv.id and rs.report_definition_id = rd.id;

comment on view public.v_protocol_report_status is
  'patient_code = IVRS de la INSCRIPCIÓN (enrollments.ivrs_code, 0062), con fallback a patients.code para las filas legacy. 0126.';

-- v_report_alerts — Alertas de reporte del checklist (alimenta la campana).
-- Copia verbatim de 0063_checklist_reportes.sql, con el código del paciente cambiado.
create or replace view public.v_report_alerts with (security_invoker = true) as
select
  ci.id            as item_id,
  ci.visit_id,
  ci.description,
  ci.report_eta_hours,
  pv.real_date,
  (pv.real_date::timestamp + (ci.report_eta_hours * interval '1 hour'))
     at time zone 'America/Argentina/Buenos_Aires'  as report_due_at,
  e.protocol_id, e.patient_id,
  pr.code as protocol_code, pr.name as protocol_name,
  coalesce(e.ivrs_code, pa.code) as patient_code, pa.full_name as patient_name,
  vd.name as visit_name, vd.code as visit_code
from public.checklist_items ci
join public.patient_visits pv on pv.id = ci.visit_id
join public.enrollments e     on e.id = pv.enrollment_id
join public.protocols pr      on pr.id = e.protocol_id
join public.patients pa       on pa.id = e.patient_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
left join public.checklist_report_ready rr on rr.item_id = ci.id
where ci.has_report
  and ci.report_eta_hours is not null
  and pv.real_date is not null
  and rr.id is null
  and now() > (pv.real_date::timestamp + (ci.report_eta_hours * interval '1 hour'))
              at time zone 'America/Argentina/Buenos_Aires';

comment on view public.v_report_alerts is
  'patient_code = IVRS de la INSCRIPCIÓN (enrollments.ivrs_code, 0062), con fallback a patients.code para las filas legacy. 0126.';
