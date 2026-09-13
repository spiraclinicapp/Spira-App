-- Spira · Migración 0120 — La visita no se completa con el producto en investigación sin entregar.
-- Plan: docs/plan-dispensacion-base-e-imp.md (Tanda 1: D2, D10).
-- ============================================================================
-- Una visita atendida pasa a `completa` cuando todos sus procedimientos están realizados y sus
-- reportes evolucionados; si falta algo queda `realizada` (atendida con pendientes). Desde acá, la
-- entrega del IP cuenta como un pendiente más: una V con IP abierto (sin pedir, pedido o rechazado)
-- queda `realizada` hasta que Farmacia entrega, o hasta que Coordinación la cierra con "No
-- corresponde" / "Entregado en otra visita" (0119).
--
-- NADA DE LO CARGADO SE MUEVE. La condición mira `v_visit_ip_status.sellada`, que sólo es true en
-- visitas fechadas DESPUÉS de la 0119 (el sello `lleva_ip` queda NULL en las anteriores). Es el mismo
-- compromiso que la 0068/0069/0079/0092/0102: una migración de estado no reescribe la historia.
--
-- LA REGLA NO SE REPITE ACÁ: se lee de `v_visit_ip_status` (0119), la misma vista que alimenta la
-- fila del panel y la alerta. Si mañana cambia qué es "IP abierto", cambia en un solo lugar.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0119.
-- IDEMPOTENTE: reintentar es volver a correr el bloque entero.
--
-- ⚠️⚠️ VA **DESPUÉS** DEL DEPLOY DEL FRONT DE LA TANDA 1. Cambia un valor que el front desplegado YA
-- lee (`computed_status`): con el front viejo, una V con IP abierto diría "Realizada" sin ninguna
-- fila que explique por qué. No se pushea hasta que el front esté en producción (lección 0092).
--
-- ⚠️ Los dos `drop view` de abajo dejan la app sin visitas hasta que corran los `create`. Corré el
-- archivo ENTERO de una. `create or replace` no sirve: la 0119 sumó `patient_visits.lleva_ip`, y el
-- `pv.*` re-expandido la mete ANTES de computed_status — cambia el orden de columnas (mismo motivo
-- que la 0102).
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

drop view if exists public.v_track_visits;
drop view if exists public.v_patient_visits;

-- v_patient_visits: copia VERBATIM de la 0102 salvo el tercer `exists` de la rama 6 (0120).
create view public.v_patient_visits with (security_invoker = true) as
select
  pv.*,
  ( case
      -- 1 · El paciente está HOY en el centro y no se cerró la atención. Gana sobre todo lo demás.
      --     Acotado al día en curso a propósito: si nadie marca el fin, al día siguiente la visita
      --     no queda congelada acá, se resuelve por lo que tenga marcado.
      --     No mira real_date: con la llegada marcada hoy y sin ready_at está siendo atendida,
      --     se haya registrado o no la visita.
      when pv.ready_at is null and pv.arrived_at is not null
       and (pv.arrived_at at time zone 'America/Argentina/Buenos_Aires')::date
         = (now()          at time zone 'America/Argentina/Buenos_Aires')::date
        then 'en_atencion'
      -- 2 · Ventana vencida le gana a "Por reprogramar": es la más severa y la que mira el sponsor.
      --     OJO con el `current_date`: es la hora del servidor (UTC), así que adelanta el día a
      --     partir de las 21:00 hora argentina, mientras que la rama de arriba se ancla a mano a
      --     America/Argentina/Buenos_Aires. La inconsistencia es PREEXISTENTE (viene de la 0004) y
      --     sigue sin tocarse acá, por el mismo motivo que en la 0068/0069/0079/0092: cambiarla
      --     movería de estado visitas ya cargadas, que es lo que esta migración no hace.
      when pv.real_date is null and current_date > pv.window_end then 'ventana_vencida'
      -- 3 · Se marcó la falta y todavía no tiene fecha nueva (el reagendado limpia no_show_at).
      when pv.real_date is null and pv.no_show_at is not null    then 'por_reprogramar'
      -- 4 · "Pendiente" fusiona lo que antes eran `futura` (>7 días) y `proxima`. La vista ya no
      --     emite 'futura'; el valor queda en el enum porque Postgres no deja borrarlo.
      when pv.real_date is null                                  then 'proxima'
      -- 5 · Vencido = un REPORTE del estudio (0089) cuyo procedimiento está realizado, que sigue
      --     en 'pendiente' y ya pasó su plazo. Espeja `isOverdue`: sin plazo (eta_hours nulo) no
      --     vence nunca, y una vez descargado el plazo dejó de correr.
      --     El join a completions es INNER acá: sin el procedimiento realizado el plazo no arrancó.
      when exists (
        select 1
        from public.protocol_activities pa
        join public.enrollments e          on e.id  = pv.enrollment_id
        join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                          and pp.procedure_id = pa.procedure_id
        join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
        join public.visit_procedure_completions vpc
             on vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id
        left join public.report_status rs
             on rs.visit_id = pv.id and rs.report_definition_id = rd.id
        where pa.visit_def_id = pv.visit_def_id
          and rd.eta_hours is not null
          and coalesce(rs.stage, 'pendiente') = 'pendiente'
          and now() > vpc.completed_at + (rd.eta_hours * interval '1 hour')
      ) then 'item_vencido'
      -- 6 · Atendida pero con pendientes: procedimientos sin realizar, o reportes sin evolucionar.
      --     El segundo exists espeja `visitClosed`: la visita cierra cuando TODOS sus reportes
      --     están en 'evolucionado'. No exige que el procedimiento esté realizado, porque un
      --     reporte de un procedimiento sin hacer tampoco está evolucionado — y ese caso ya lo
      --     toma el primer exists igual. `coalesce(stage, 'pendiente')`: sin fila = pendiente (0090).
      when exists (
        select 1 from public.protocol_activities pa
        where pa.visit_def_id = pv.visit_def_id
          and not exists (select 1 from public.visit_procedure_completions vpc
                          where vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id)
      ) or exists (
        select 1
        from public.protocol_activities pa
        join public.enrollments e          on e.id  = pv.enrollment_id
        join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                          and pp.procedure_id = pa.procedure_id
        join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
        left join public.report_status rs
             on rs.visit_id = pv.id and rs.report_definition_id = rd.id
        where pa.visit_def_id = pv.visit_def_id
          and coalesce(rs.stage, 'pendiente') <> 'evolucionado'
      ) or exists (
        -- 0120 · La entrega del producto en investigación, abierta, en una visita sellada. La regla
        --        vive en v_visit_ip_status (0119); `sellada` es el corte que deja lo viejo quieto.
        select 1 from public.v_visit_ip_status s
        where s.visit_id = pv.id and s.sellada and s.abierto
      ) then 'realizada'
      else 'completa'
    end )::visit_status as computed_status,
  ( case
      -- `left_at` sale del recorrido: mark_left siempre exigió ready_at (0023:145), así que toda
      -- fila con salida marcada tiene ready_at y cae limpia acá. La columna queda como histórico.
      --
      -- OJO: la etapa sigue derivándose de `real_date` y NO del `attended_at`. Es a propósito:
      -- cambiarla movería de etapa a las visitas viejas.
      when pv.ready_at   is not null then 'fin_atencion'
      when pv.real_date  is not null then 'inicio_atencion'
      when pv.arrived_at is not null then 'concurrio_al_centro'
      else 'por_llegar'
    end ) as operational_stage
from public.patient_visits pv;
comment on view public.v_patient_visits is
  'patient_visits + estado clínico de 7 estados + recorrido operativo de 4 etapas. Recreada por la 0120: la rama `realizada` suma el IP abierto de una visita sellada (v_visit_ip_status, 0119); el pv.* re-expande e incluye lleva_ip. Resto verbatim de la 0102.';
revoke all on public.v_patient_visits from anon;
grant select on public.v_patient_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_patient_visits from authenticated;

-- v_track_visits: copia VERBATIM de la 0102.
create view public.v_track_visits with (security_invoker = true) as
select
  v.id, v.enrollment_id, v.visit_def_id, v.estimated_date, v.real_date,
  v.window_start, v.window_end, v.notes, v.computed_status,
  vd.code as visit_code, vd.name as visit_name,
  coalesce(vd.visit_type, 'presencial') as visit_type, vd.sort_order,
  e.protocol_id, e.patient_id, e.status as enrollment_status,
  e.randomization_date as enrollment_randomization_date,
  pr.code as protocol_code, pr.name as protocol_name,
  pa.code as patient_code, pa.full_name as patient_name,
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
  'v_track_visits (0065/0068/0069/0071/0079/0092/0102) recreada por la 0120 sin cambios propios: su computed_status ahora espera la entrega del IP (ver v_patient_visits).';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;

notify pgrst, 'reload schema';
