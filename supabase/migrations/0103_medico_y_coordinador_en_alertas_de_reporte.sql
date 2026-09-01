-- ============================================================================
-- 0103 · Médico tratante y coordinador en las alertas de reporte
--
-- QUÉ HACE: agrega tres columnas al final de `v_procedure_report_alerts`
--   · treating_physician  (el de la visita, con el del paciente como respaldo)
--   · coordinator_id
--   · coordinator_name
--
-- PARA QUÉ: la vista de Alertas suma los filtros Médico y Coordinador, iguales a los de
-- "Visitas del día". Esa pantalla lista DOS cosas —alertas de visita y reportes pendientes— y el
-- filtro tiene que poder decidir sobre las dos. Las alertas de visita ya traen los dos datos
-- (`v_track_visits` los expone desde la 0065 y la 0079); las de reporte, no. Con la vista como
-- está, tildar un médico dejaría los reportes SIEMPRE adentro o SIEMPRE afuera: en un caso el
-- filtro no filtra, en el otro esconde alertas sin decirlo. Las dos cosas son inaceptables en la
-- pantalla cuyo trabajo es que no se pase un desvío.
--
-- DE DÓNDE SALEN LOS DATOS: las tres columnas ya viven en `patient_visits` (coordinador desde la
-- 0065, médico de visita desde la 0079) y la vista ya tiene esa tabla joineada como `pv`. No se
-- crea ni se backfillea nada: esto sólo las PROYECTA. Una visita sin coordinador asignado devuelve
-- null, que es la verdad — el front lo trata como "sin coordinador", igual que Visitas del día.
--
-- El `coalesce` del médico replica EXACTO lo que hace `v_track_visits` (0079): manda el médico
-- anotado en la visita y, si no hay, el tratante del paciente. Si acá se resolviera distinto, la
-- misma persona aparecería bajo dos médicos según de qué lista viniera su alerta, y el filtro
-- devolvería resultados que no cierran entre sí.
--
-- CREATE OR REPLACE Y NO DROP + CREATE, a diferencia de la 0102: esa tenía que reordenar columnas
-- (el `*` re-expandido metía la nueva en el medio) y `replace` no lo permite. Acá las columnas son
-- todas explícitas y las tres nuevas van AL FINAL, que es el único cambio que `replace` sí acepta.
-- Se prefiere porque no deja ninguna ventana con la vista inexistente.
--
-- QUÉ MÁS LEE ESTA VISTA, verificado antes de tocarla:
--   · el front, con `select('*')` — recibir tres campos de más es inofensivo: el tipo de
--     TypeScript simplemente no los declara hasta que el front nuevo los use;
--   · `dismiss_alert` (0092), que hace `select ra.report_due_at ... where ra.report_definition_id`
--     — columnas concretas, no `*`, así que agregar campos no la afecta. (La versión vieja de esa
--     función en la 0070 leía `ra.completion_id`; la 0092 ya la reemplazó.)
--   Ninguna otra vista cuelga de ésta.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0102.
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. Ningún front desplegado pide estas columnas;
-- el que no funciona sin ellas es el front nuevo. (Regla de CLAUDE.md: el orden lo decide si el
-- cambio altera lo que el front YA pide, no si agrega o quita.)
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

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
  pac.code as patient_code,  pac.full_name as patient_name,
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
  'v_procedure_report_alerts (0064/0090/0092) ampliada por la 0103: suma treating_physician, coordinator_id y coordinator_name, para que los filtros de Médico y Coordinador de la vista de Alertas puedan decidir también sobre los reportes pendientes. La RLS sigue siendo la de las tablas de abajo (security_invoker).';

-- Los grants se repiten porque `create or replace view` no los pierde, pero sí los perdería un
-- futuro drop + create: dejarlos acá hace que este archivo sea suficiente por sí solo si alguna
-- vez hay que recrear la vista desde cero a partir de él.
revoke all on public.v_procedure_report_alerts from anon;
grant select on public.v_procedure_report_alerts to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_procedure_report_alerts from authenticated;
