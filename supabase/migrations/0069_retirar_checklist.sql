-- ============================================================================
-- Spira · Migración 0069 — Retirar el checklist clínico del circuito vivo
--
-- El checklist por visita (0003 → 0014 → 0022 → 0063) fue reemplazado por el CUADRO DE
-- PROCEDIMIENTOS (0061/0064): el mismo gesto —tildar lo que se hizo y seguir el circuito de
-- reporte— pero atado al cronograma del protocolo en vez de a una plantilla aparte. El front ya
-- no tiene ninguna pantalla para tildar ítems ni para marcar sus reportes (se borraron
-- `VisitChecklist`, `TemplatesView` y `useReportAlerts` el 2026-08-06), así que lo que quedaba en
-- la base era una fábrica de pendientes que nadie podía resolver:
--   · el trigger seguía materializando ítems en cada visita registrada;
--   · un ítem obligatorio sin tildar dejaba la visita en `realizada` (nunca `completa`) y, pasado
--     su deadline, la mandaba a `item_vencido`;
--   · `v_report_alerts` levantaba alerta de reporte vencido sin forma de apagarla.
--
-- Esta migración corta esas tres puntas. NO BORRA NI UNA FILA: `checklist_templates`,
-- `checklist_template_items`, `checklist_items`, `checklist_completions` y
-- `checklist_report_ready` quedan intactas, con su RLS y su auditoría, como histórico auditable
-- (mismo criterio que `track_dispensations` cuando se retiró la dispensación vieja en 0050).
-- Retirar datos regulados para dejar el schema prolijo no es una opción.
--
-- ⚠️ ORDEN: EL FRONT VA PRIMERO. Al dropear `v_report_alerts`, el front vigente —que todavía
-- llama a `useReportAlerts()`— recibe un 404 de PostgREST y pinta "No pudimos cargar las
-- notificaciones" en la campana y el estado de error en Alertas. Esta migración se aplica
-- DESPUÉS de desplegar el front que ya no la consulta. Es la misma regla que se aprendió al
-- revés con la 0068 (2026-08-05), que dejó la Agenda y la ficha en blanco hasta el deploy.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0068 y del deploy
-- del front. IDEMPOTENTE (drop if exists + create). Registrar en supabase/README.md al
-- confirmarse en prod.
-- ============================================================================

-- PRECONDICIONES (correr ANTES de tocar nada; las tres tienen que dar 0).
-- Son las que prueban que sacar el checklist del cálculo NO mueve ningún estado: si no hay
-- ítems obligatorios pendientes ni alertas de reporte, las ramas que se borran hoy evalúan
-- falso para todas las filas, así que la vista nueva devuelve exactamente lo mismo que la vieja.
-- Si alguna diera > 0, PARAR: hay que decidir qué se hace con esas visitas antes de seguir
-- (las tres dieron 0 el 2026-08-06, verificadas por el Director).
--   select count(*) from public.checklist_items ci
--     left join public.checklist_completions cc on cc.item_id = ci.id
--    where ci.mandatory and cc.id is null;                          -- ítems obligatorios sin tildar
--   select count(*) from public.v_report_alerts;                    -- ¡ANTES del punto 3!
--   select count(*) from public.checklist_template_items where mandatory;  -- lo que generaría a futuro
--
-- FOTO PREVIA (correr también antes, y guardar el resultado para comparar al final):
--   select computed_status, count(*) from public.v_patient_visits group by 1 order by 1;


-- 1 · Cortar la fábrica ----------------------------------------------------------------------
-- El trigger (0003:91, rebindeado en 0022:112) copia los ítems de la plantilla a cada visita
-- cuando se le carga `real_date`. Sin él no se materializa ningún checklist nuevo. La función se
-- borra después del trigger (el trigger depende de ella).
drop trigger if exists trg_materialize_checklist on public.patient_visits;
drop function if exists public.materialize_checklist();


-- 2 · Sacar el checklist del estado clínico --------------------------------------------------
-- Las definiciones se copian VERBATIM de la 0068 (la vigente en prod) MENOS las dos ramas que
-- miran `checklist_items`: la de `item_vencido` (que era un `or` de checklist + procedimientos)
-- y la de `realizada` (un `or` de tres, del que se van los ítems obligatorios). Todo lo demás
-- —las cuatro primeras ramas del case, el eje operativo, `v_track_visits` entera— queda igual.
-- Patrón del `*` congelado: v_patient_visits expone `pv.*`, así que hay que recrearla para que
-- re-expanda; v_track_visits, que lista columnas explícitas, depende de ella → se dropea primero
-- y se recrea después.
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
      --     OJO con el `current_date`: es la hora del servidor (UTC), así que adelanta el día a
      --     partir de las 21:00 hora argentina, mientras que la rama de arriba se ancla a mano a
      --     America/Argentina/Buenos_Aires. La inconsistencia es PREEXISTENTE (viene de la 0004) y
      --     sigue sin tocarse acá, por el mismo motivo que en la 0068: cambiarla movería de estado
      --     visitas ya cargadas, que es justo lo que esta migración se compromete a no hacer.
      when pv.real_date is null and current_date > pv.window_end then 'ventana_vencida'
      -- 3 · Se marcó la falta y todavía no tiene fecha nueva (el reagendado limpia no_show_at).
      when pv.real_date is null and pv.no_show_at is not null    then 'por_reprogramar'
      -- 4 · "Pendiente" fusiona lo que antes eran `futura` (>7 días) y `proxima`. La vista ya no
      --     emite 'futura'; el valor queda en el enum porque Postgres no deja borrarlo.
      when pv.real_date is null                                  then 'proxima'
      -- 5 · Vencido = reporte de PROCEDIMIENTO que pasó su ETA y no se marcó listo. Antes esta
      --     rama era un `or` con los ítems de checklist vencidos; se fue con el checklist. El
      --     rótulo del front ("Pendiente vencido") ya no menciona ítems.
      when exists (
        select 1 from public.protocol_activities pa
        join public.procedures p on p.id = pa.procedure_id
        join public.visit_procedure_completions vpc
             on vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id
        where pa.visit_def_id = pv.visit_def_id and p.has_report and p.report_eta_hours is not null
          and not exists (select 1 from public.visit_procedure_reports_ready rr
                          where rr.visit_id = pv.id and rr.procedure_id = pa.procedure_id)
          and now() > vpc.completed_at + (p.report_eta_hours * interval '1 hour')
      ) then 'item_vencido'
      -- 6 · Atendida pero con pendientes: procedimientos sin realizar, o reportes sin marcar
      --     listos. Era un `or` de tres; se fue el primero (ítems obligatorios sin tildar).
      when exists (
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
  'patient_visits + estado clínico de 7 estados + recorrido operativo de 4 etapas (0068). Desde la 0069, "qué falta" son solo procedimientos y sus reportes: el checklist salió del cálculo.';
revoke all on public.v_patient_visits from anon;
grant select on public.v_patient_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_patient_visits from authenticated;

-- v_track_visits: IDÉNTICA a la de la 0068 (no la toca este cambio; se recrea solo porque
-- depende de v_patient_visits, que se dropeó arriba).
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
  v.arrived_at, v.ready_at, v.left_at, v.no_show_at,      -- no_show_at: 0067
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
  'v_track_visits (0065/0068) recreada por 0069 sin cambios propios (depende de v_patient_visits).';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;


-- 3 · Bajar la alerta huérfana ---------------------------------------------------------------
-- `v_report_alerts` (0063) avisa "reporte de ítem vencido"; se apagaba insertando en
-- `checklist_report_ready` desde la pantalla del checklist, que ya no existe. Su gemela de
-- procedimientos, `v_procedure_report_alerts` (0064), NO se toca: es otro objeto, con su propio
-- hook en el front, y es la que sigue alimentando la campana y Alertas.
-- Ningún otro objeto de la base depende de esta vista (solo la nombran comentarios de 0063/0064).
drop view if exists public.v_report_alerts;


-- VERIFICACIÓN POSTERIOR · correr la MISMA consulta de la foto previa y comparar renglón por
--   renglón. Lo esperable con las precondiciones en 0: los conteos IDÉNTICOS, sin una sola visita
--   movida de estado. Cualquier diferencia es un hallazgo, no ruido — y significa que algo
--   dependía del checklist más de lo que decían las precondiciones.
--     select computed_status, count(*) from public.v_patient_visits group by 1 order by 1;
--
--   (No se listan consultas del tipo "confirmar que el trigger ya no está": después del drop no
--    puede estar, así que no verifican nada y dan falsa confianza.)
--
-- VUELTA ATRÁS (si hiciera falta): re-ejecutar, en este orden, el bloque de vistas de la
--   0068_estados_visita.sql (líneas 61-176), la sección 4 de la 0063_checklist_reportes.sql
--   (`materialize_checklist` + la vista `v_report_alerts`) y el binding del trigger de la
--   0022_visitas_unificadas.sql (líneas 112-115). Nada de esto perdió datos, así que la vuelta
--   atrás es completa: los ítems ya materializados siguen en sus tablas.
