-- Spira · Migración 0013 — Vista plana de visitas para Track (Resumen + Agenda)
-- ----------------------------------------------------------------------------
-- Las vistas de Track (Resumen, Agenda) necesitan la visita CON su definición,
-- protocolo y paciente en una sola fila. Hacer ese join en el cliente exigiría
-- confiar en el embedding de PostgREST a través de vistas (frágil); esta vista
-- lo resuelve en SQL y queda como contrato de lectura estable para el front.
--
-- security_invoker → hereda la RLS de las tablas base: una coordinadora ve solo
-- las visitas de sus protocolos; gerencia ve todo; pharma no ve patient_visits.
-- ============================================================================

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
  vd.code   as visit_code,
  vd.name   as visit_name,
  vd.visit_type,
  vd.sort_order,
  e.protocol_id,
  e.patient_id,
  e.status  as enrollment_status,
  pr.code   as protocol_code,
  pr.name   as protocol_name,
  pa.code   as patient_code,
  pa.full_name as patient_name
from public.v_patient_visits v
join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e        on e.id  = v.enrollment_id
join public.protocols pr         on pr.id = e.protocol_id
join public.patients pa          on pa.id = e.patient_id;

comment on view public.v_track_visits is
  'Visita + definición + protocolo + paciente en una fila (para Resumen/Agenda de Track). security_invoker: respeta RLS.';

-- Mismo criterio que 0007: nada para anon, lectura para autenticados.
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
-- La vista es de SOLO LECTURA. Los `default privileges` de 0007 (`grant all on
-- tables`) le otorgan a `authenticated` también insert/update/delete al crearla;
-- como la vista es un join (no actualizable) eso es inerte, pero se revoca por
-- higiene y para que el contrato "solo lectura" sea explícito.
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;
