-- Spira · Migración 0016 — Ampliar v_track_visits + vista de KPIs de protocolo
-- ----------------------------------------------------------------------------
-- El tablero del protocolo y la ficha del paciente necesitan, además de lo que
-- ya trae v_track_visits (0013):
--   · offset_days       → para derivar la "Semana W#" del cronograma (round/7)
--   · enrollment_date   → fecha de ingreso del paciente al protocolo
--   · treating_physician→ médico tratante (del enrollment en contexto)
-- Son columnas de tablas YA unidas en la vista, así que solo se agregan al SELECT.
--
-- Además, v_protocol_kpis centraliza los KPIs del protocolo en SQL (mejor que
-- agregar en el front sobre datos parciales por RLS). security_invoker en ambas
-- → respetan la RLS de las tablas base.
-- ============================================================================

-- IMPORTANTE: `create or replace view` solo permite AGREGAR columnas al FINAL
-- (no reordenar ni renombrar las existentes). Por eso las 3 nuevas
-- (offset_days, enrollment_date, treating_physician) van al final, manteniendo
-- el orden de 0013 intacto. El front usa select('*') y mapea por nombre.
create or replace view public.v_track_visits
with (security_invoker = true) as
select
  v.id,
  v.enrollment_id,
  v.visit_def_id,
  v.estimated_date,
  v.real_date,
  v.window_start,
  v.window_end,
  v.notes,
  v.computed_status,
  vd.code        as visit_code,
  vd.name        as visit_name,
  vd.visit_type,
  vd.sort_order,
  e.protocol_id,
  e.patient_id,
  e.status       as enrollment_status,
  pr.code        as protocol_code,
  pr.name        as protocol_name,
  pa.code        as patient_code,
  pa.full_name   as patient_name,
  -- columnas nuevas (0016), al final:
  vd.offset_days,
  e.enrollment_date,
  e.treating_physician
from public.v_patient_visits v
join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e        on e.id  = v.enrollment_id
join public.protocols pr         on pr.id = e.protocol_id
join public.patients pa          on pa.id = e.patient_id;

comment on view public.v_track_visits is
  'Visita + definición + protocolo + paciente en una fila (Resumen/Agenda/Tablero/Ficha de Track). security_invoker: respeta RLS.';

-- Mismo criterio que 0013: nada para anon, solo lectura para autenticados.
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;


-- ── KPIs por protocolo (para la ficha lateral del Detalle de Protocolo) ─────
-- enrolled/active cuentan ENROLAMIENTOS (un paciente puede estar en varios
-- protocolos; acá cada par cuenta una vez gracias al group by por protocolo).
-- Los left join garantizan una fila por protocolo aunque no tenga enrolados/visitas
-- (los counts dan 0, no null).
create or replace view public.v_protocol_kpis
with (security_invoker = true) as
select
  pr.id as protocol_id,
  count(distinct e.id)                                          as enrolled,
  count(distinct e.id) filter (where e.status = 'activo')       as active,
  count(pv.id)                                                  as visits_total,
  count(pv.id) filter (where pv.real_date is not null)          as visits_done,
  count(pv.id) filter (
    where pv.real_date is null
      and pv.window_end between current_date and current_date + 7
  )                                                             as windows_due_7d
from public.protocols pr
left join public.enrollments e     on e.protocol_id = pr.id
left join public.patient_visits pv on pv.enrollment_id = e.id
group by pr.id;

comment on view public.v_protocol_kpis is
  'KPIs por protocolo: enrolados/activos, visitas hechas/total, ventanas por vencer (7d). security_invoker: respeta RLS.';

revoke all on public.v_protocol_kpis from anon;
grant select on public.v_protocol_kpis to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_protocol_kpis from authenticated;
