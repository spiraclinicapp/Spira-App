-- Spira · Migración 0068 — Los dos ejes de la visita: 4 etapas operativas + 7 estados clínicos
-- ============================================================================
-- Cierra la tanda 0066 → 0067 → 0068. Acá recién se EMITEN los dos valores de enum que agregó
-- la 0066 ('en_atencion', 'por_reprogramar'): Postgres no deja usarlos en la misma transacción
-- que los crea, por eso viven en un archivo aparte y este se aplica DESPUÉS (mismo motivo 0053).
--
--   1. computed_status (eje CLÍNICO, "en qué está la visita") pasa de 6 a 7 estados en uso:
--      suma 'en_atencion' (arriba de todo) y 'por_reprogramar' (la falta marcada por la 0067).
--      'futura' deja de emitirse: se fusiona con 'proxima' en un único "Pendiente". El valor
--      queda en el enum porque Postgres no deja borrar valores de un enum.
--   2. operational_stage (eje OPERATIVO, "dónde está el paciente") pasa de 5 etapas a 4:
--      por_llegar → concurrio_al_centro (arrived_at) → inicio_atencion (real_date) →
--      fin_atencion (ready_at, terminal). La etapa 'fuera' (left_at) SALE del recorrido:
--      mark_left siempre exigió ready_at (0023:145), así que no existe ninguna fila con
--      left_at y sin ready_at, y toda visita vieja con salida marcada cae limpia en
--      'fin_atencion'. La columna left_at y el RPC mark_left quedan como histórico.
--   3. v_track_visits suma v.no_show_at (columna de la 0067). La necesita la fila de
--      "Visitas del día" para distinguir "Por reprogramar" de una visita nunca tocada.
--
-- SIN CAMBIO DE ESTADO PARA LO HISTÓRICO: las visitas cargadas retroactivamente tienen
-- real_date y NINGUNA marca operativa (arrived_at null, no_show_at null), así que no entran
-- en ninguna de las ramas nuevas y siguen resolviéndose por las mismas dos ramas exists(...)
-- de la 0064 — realizada / item_vencido / completa, exactamente igual que antes.
--
-- Las definiciones se copian VERBATIM de la 0065 (la vigente en prod, que es la 0064 + el
-- coordinador por visita). Patrón del `*` congelado: v_patient_visits expone pv.*, así que
-- hay que recrearla para que re-expanda las columnas nuevas de la 0067; v_track_visits, que
-- lista columnas explícitas, depende de ella → se dropea primero y se recrea después.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), en orden, DESPUÉS de la 0067.
-- IDEMPOTENTE (drop + create). Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

-- 1 · Recrear las dos vistas en orden de dependencia (v_track_visits lee de v_patient_visits).
drop view if exists public.v_track_visits;
drop view if exists public.v_patient_visits;

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
      when pv.real_date is null and current_date > pv.window_end then 'ventana_vencida'
      -- 3 · Se marcó la falta y todavía no tiene fecha nueva (el reagendado limpia no_show_at).
      when pv.real_date is null and pv.no_show_at is not null    then 'por_reprogramar'
      -- 4 · "Pendiente" fusiona lo que antes eran `futura` (>7 días) y `proxima`. La vista ya no
      --     emite 'futura'; el valor queda en el enum porque Postgres no deja borrarlo.
      when pv.real_date is null                                  then 'proxima'
      -- Las dos ramas que siguen son las de la 0064/0065 TAL CUAL: este cambio no redefine
      -- "qué falta" en una visita ya atendida, solo cuándo se empieza a evaluar.
      when exists (
        select 1 from public.checklist_items ci
        left join public.checklist_completions cc on cc.item_id = ci.id
        where ci.visit_id = pv.id and ci.mandatory and cc.id is null
          and now() > ((pv.real_date::timestamp + (ci.deadline_hours * interval '1 hour'))
                       at time zone 'America/Argentina/Buenos_Aires')
      ) or exists (
        select 1 from public.protocol_activities pa
        join public.procedures p on p.id = pa.procedure_id
        join public.visit_procedure_completions vpc
             on vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id
        where pa.visit_def_id = pv.visit_def_id and p.has_report and p.report_eta_hours is not null
          and not exists (select 1 from public.visit_procedure_reports_ready rr
                          where rr.visit_id = pv.id and rr.procedure_id = pa.procedure_id)
          and now() > vpc.completed_at + (p.report_eta_hours * interval '1 hour')
      ) then 'item_vencido'
      when exists (
        select 1 from public.checklist_items ci
        left join public.checklist_completions cc on cc.item_id = ci.id
        where ci.visit_id = pv.id and ci.mandatory and cc.id is null
      ) or exists (
        select 1 from public.protocol_activities pa
        where pa.visit_def_id = pv.visit_def_id
          and not exists (select 1 from public.visit_procedure_completions vpc
                          where vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id)
      ) or exists (
        select 1 from public.protocol_activities pa
        join public.procedures p on p.id = pa.procedure_id
        where pa.visit_def_id = pv.visit_def_id and p.has_report
          and not exists (select 1 from public.visit_procedure_reports_ready rr
                          where rr.visit_id = pv.id and rr.procedure_id = pa.procedure_id)
      ) then 'realizada'
      else 'completa'
    end )::visit_status as computed_status,
  ( case
      -- `left_at` sale del recorrido: mark_left siempre exigió ready_at (0023:145), así que toda
      -- fila con salida marcada tiene ready_at y cae limpia acá. La columna queda como histórico.
      when pv.ready_at   is not null then 'fin_atencion'
      when pv.real_date  is not null then 'inicio_atencion'
      when pv.arrived_at is not null then 'concurrio_al_centro'
      else 'por_llegar'
    end ) as operational_stage
from public.patient_visits pv;
comment on view public.v_patient_visits is
  'patient_visits + estado clínico de 7 estados (0068) + recorrido operativo de 4 etapas (0068).';
revoke all on public.v_patient_visits from anon;
grant select on public.v_patient_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_patient_visits from authenticated;

-- 2 · v_track_visits: misma lista de columnas de la 0065 + v.no_show_at (0067). El estado
--     clínico y la etapa operativa llegan calculados de v_patient_visits — acá no se recalcula
--     nada, solo se pasan las columnas que consume la fila de "Visitas del día".
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
  vd.offset_days, e.enrollment_date, pa.treating_physician,
  v.coordinator_id, v.coordinator_name,                   -- 0065
  v.kind,
  v.arrived_at, v.ready_at, v.left_at, v.no_show_at,      -- no_show_at: nueva (0067)
  v.wants_doctor,
  v.doctor_seen_at,
  v.doctor_motivo,
  v.wants_doctor_at, v.doctor_marked_by,
  coalesce(vd.dispenses, false) as dispenses,
  v.operational_stage,
  vd.role, vd.date_mode,
  (select count(*) from public.visit_comments vc where vc.visit_id = v.id) as comments_count
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id;
comment on view public.v_track_visits is
  'v_track_visits (0065) recreada por 0068 (+ no_show_at; los dos ejes nuevos llegan de v_patient_visits).';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;

-- Verificación 1 · las etapas operativas que existen hoy tienen que ser SOLO las 4 nuevas
--   (ninguna 'fuera' / 'listo' / 'atendido' / 'en_el_sitio' suelta):
--   select operational_stage, count(*) from public.v_patient_visits group by 1 order by 2 desc;
--
-- Verificación 2 · no debe existir ninguna fila con salida marcada y sin fin de atención
--   (el supuesto que deja sacar 'fuera' del recorrido). Tiene que dar 0:
--   select count(*) from public.patient_visits where left_at is not null and ready_at is null;
--
-- Verificación 3 · el reparto de estados clínicos; 'futura' ya no puede aparecer:
--   select computed_status, count(*) from public.v_patient_visits group by 1 order by 2 desc;
--
-- Verificación 4 · v_track_visits conserva las columnas del coordinador y suma no_show_at:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'v_track_visits'
--      and column_name in ('coordinator_id', 'coordinator_name', 'no_show_at');

notify pgrst, 'reload schema';
