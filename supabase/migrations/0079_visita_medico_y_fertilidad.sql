-- Spira · Migración 0079 — Track: médico a cargo POR VISITA + fertilidad en la vista del día
-- ============================================================================
-- Las dos las pide el rediseño del encabezado de la visita
-- (docs/handoff-visitas-encabezado/), y las dos son ADITIVAS.
--
--   1. patient_visits.treating_physician (text, nullable). Hoy el médico a cargo es un campo de
--      texto libre del PACIENTE (patients.treating_physician, movido ahí por la 0020), así que
--      cambiarlo reescribe hacia atrás quién figuraba en TODAS sus visitas, incluidas las
--      cerradas. El encabezado nuevo lo muestra por visita y le pone candado cuando la visita se
--      concreta — un candado que solo es verdadero si el dato es de la visita: si fuera del
--      paciente, se cambiaría desde cualquier otra visita suya y no protegería nada.
--      Nullable a propósito: las visitas existentes quedan SIN médico propio y siguen mostrando
--      el del paciente por el coalesce de abajo. No hay backfill, y no hace falta.
--   2. v_track_visits pasa a devolver coalesce(visita, paciente) en treating_physician, y expone
--      pa.fertility. Lo segundo evita que el encabezado se recomponga a la vista del usuario: los
--      otros tres datos del paciente (sexo, nacimiento, edad) ya llegan en esta consulta desde la
--      0049, y la fertilidad era la única que obligaba a una segunda consulta que llega después.
--   3. RPC set_visit_physician(visita, texto|null). authz espejo de set_visit_coordinator (0065).
--
-- ORDEN DE DEPLOY: **esta migración va PRIMERO, el front después.** Es aditiva y el front
-- desplegado hace select('*'), así que ignora las columnas nuevas; y mientras la columna esté
-- vacía, el coalesce devuelve exactamente lo mismo que hoy (el médico del paciente), byte a byte.
-- El que no funciona sin esto es el front NUEVO. No agrega ninguna FK, así que no puede disparar
-- el PGRST201 que volteó el tablero de Farmacia con la 0076.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), en orden, DESPUÉS de la 0078.
-- IDEMPOTENTE. Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

-- 1 · Columna: médico a cargo de ESTA visita. Texto libre, igual que el del paciente (no hay
--     catálogo de médicos; el front autocompleta con los valores ya usados).
alter table public.patient_visits
  add column if not exists treating_physician text;
comment on column public.patient_visits.treating_physician is
  'Médico a cargo de ESTA visita (texto libre). null = sin médico propio, se cae al del paciente (patients.treating_physician) en v_track_visits. 0079.';


-- 2 · RPC: fijar/limpiar el médico de una visita. authz espejo de set_visit_coordinator (0065).
--     search_path fijo + columnas calificadas (trampa 0056/0058: en un plpgsql los nombres sin
--     calificar compiten con los parámetros y las variables).
--
--     El candado va TAMBIÉN acá y no solo en la pantalla: con la visita concretada el médico queda
--     congelado, que es lo que hace que el dato sea confiable hacia atrás. Corregirlo después es
--     tarea de soporte desde el dashboard, como dice el handoff.
--     `set_visit_coordinator` (0065) NO tiene este chequeo y no se lo agregamos acá: cambiarle el
--     comportamiento a una función en producción excede este trabajo. Por ahora el candado del
--     coordinador es solo de pantalla; el del médico, de los dos lados.
create or replace function public.set_visit_physician(p_visit_id uuid, p_physician text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $func$
declare
  v_protocol uuid;
  v_ready    timestamptz;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select e.protocol_id, pv.ready_at into v_protocol, v_ready
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id;
  if v_protocol is null then raise exception 'Visita inexistente' using errcode = '23503'; end if;

  if not (public.has_module('gerencia') or public.has_min_role('track', 'admin')
          or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso' using errcode = '42501';
  end if;

  -- Concretada = fin de atención marcado (misma condición con la que la vista deriva la etapa).
  if v_ready is not null then
    raise exception 'La visita ya está concretada: cambiar el médico es tarea de soporte'
      using errcode = 'check_violation';
  end if;

  update public.patient_visits pv
     set treating_physician = nullif(btrim(p_physician), '')
   where pv.id = p_visit_id;
end; $func$;
revoke all on function public.set_visit_physician(uuid, text) from public;
grant execute on function public.set_visit_physician(uuid, text) to authenticated;
comment on function public.set_visit_physician(uuid, text) is
  'Fija o limpia el médico a cargo de una visita (texto libre). Rechaza si la visita ya está concretada. Clínico/Coord. SECURITY DEFINER. 0079.';


-- 3 · Recrear las vistas en orden de dependencia (patrón del `*` congelado, espejo de 0047/0064/
--     0065): treating_physician es una columna de patient_visits, así que v_patient_visits (pv.*)
--     tiene que re-expandirse para exponerla, y v_track_visits depende de v_patient_visits.
--     v_patient_visits se copia VERBATIM de la 0069 (la vigente: nada de su cálculo cambia acá).
--     v_track_visits se copia VERBATIM de la 0071 (la vigente) con dos cambios y nada más:
--       · pa.treating_physician  →  coalesce(v.treating_physician, pa.treating_physician)
--       · + pa.fertility
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
      --     sigue sin tocarse acá, por el mismo motivo que en la 0068/0069: cambiarla movería de
      --     estado visitas ya cargadas, que es justo lo que esta migración se compromete a no hacer.
      when pv.real_date is null and current_date > pv.window_end then 'ventana_vencida'
      -- 3 · Se marcó la falta y todavía no tiene fecha nueva (el reagendado limpia no_show_at).
      when pv.real_date is null and pv.no_show_at is not null    then 'por_reprogramar'
      -- 4 · "Pendiente" fusiona lo que antes eran `futura` (>7 días) y `proxima`. La vista ya no
      --     emite 'futura'; el valor queda en el enum porque Postgres no deja borrarlo.
      when pv.real_date is null                                  then 'proxima'
      -- 5 · Vencido = reporte de PROCEDIMIENTO que pasó su ETA y no se marcó listo.
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
      -- 6 · Atendida pero con pendientes: procedimientos sin realizar, o reportes sin marcar listos.
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
  'patient_visits + estado clínico de 7 estados + recorrido operativo de 4 etapas (0068/0069). Recreada por la 0079 solo para re-expandir el asterisco con treating_physician; el cálculo es el de la 0069, verbatim.';
revoke all on public.v_patient_visits from anon;
grant select on public.v_patient_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_patient_visits from authenticated;

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
  pa.fertility,                                           -- nueva (0079)
  vd.offset_days, e.enrollment_date,
  -- El médico de la VISITA gana; si no tiene, se cae al del paciente. Mientras la columna nueva
  -- esté vacía, esto devuelve exactamente lo mismo que devolvía la 0071. (0079)
  coalesce(v.treating_physician, pa.treating_physician) as treating_physician,
  v.coordinator_id, v.coordinator_name,                   -- 0065
  v.kind,
  v.arrived_at, v.ready_at, v.left_at, v.no_show_at,      -- no_show_at: 0067
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
  'v_track_visits (0065/0068/0069/0071) recreada por 0079: suma fertility y el médico por visita con caída al del paciente. El resto, verbatim.';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;
