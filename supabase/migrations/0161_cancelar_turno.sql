-- Spira · Migración 0161 — Coordinación: cancelar el turno de una visita del cronograma
-- ============================================================================
-- Plan: `docs/plan-cancelar-turno.md` (revisado con /plan-eng-review el 2026-10-15; las seis preguntas de
-- producto, decididas por el Director el 2026-10-16 con la recomendada).
--
-- EL PEDIDO. Sacar una visita del turnero (la lista del día en Visitas) SIN borrarla del cronograma: queda
-- pendiente, sin fecha, lista para reprogramar. Hasta hoy no había forma: «No vino» la deja en su día como
-- falta, «Reprogramar» siempre la manda a OTRA fecha, y «Eliminar» sólo existe para las sueltas.
--
-- LA DECISIÓN DE FONDO (D1 del plan): la fecha se VACÍA (`estimated_date = NULL`), no se marca encima de
-- una fecha que sigue puesta. Así la visita sale del turnero POR CONSTRUCCIÓN: ninguna consulta por fecha
-- la toma (motivosDelDia, Semana, Mes, la cola del médico, Próximas visitas), sin que cada pantalla tenga
-- que acordarse de un sello. Lo que evita que desaparezca en silencio es el estado: pasa a 'por_reprogramar'.
--
-- Suma:
--   1. Tres columnas en patient_visits: turno_cancelado_at (cuándo), turno_cancelado_by (quién; la campana lo
--      usa para no avisarle a uno su propia cancelación) y citacion_cancelada (la fecha que tenía: ordena la
--      fila en el cronograma, la propone «Reprogramar» y fija el período de Estadísticas).
--   2. Dos CHECK. `patient_visits_kind_shape` se afloja SÓLO para el caso cancelado (una programada puede
--      quedar sin fecha si tiene el sello), y `patient_visits_turno_cancelado` dice que un turno cancelado
--      no tiene fecha ni marcas. Juntos: en una programada, «sin fecha» es exactamente «turno cancelado».
--      Las funciones que marcan la llegada, la falta o el inicio (mark_arrived, mark_no_show,
--      start_visit_attention, registrar_llegada_adelantada, registrar_visita_en_otra_fecha) rebotan sobre
--      una cancelada en vez de dejarla «cancelada y atendida»: primero se le da fecha.
--   3. Un trigger que limpia el sello cuando la visita vuelve a tener fecha sin marcas. Así TODA salida anda
--      sin tocarla (Reprogramar, «Una visita pendiente del estudio», la fecha del encabezado, y también una
--      pestaña con el front viejo): es el mismo UPDATE de estimated_date de siempre.
--   4. v_patient_visits RE-DECLARADA: la rama 3 del estado pasa a «faltó O se canceló el turno»
--      → 'por_reprogramar'. Mismas columnas (el bloque format() de la 0144, tal cual).
--   5. v_track_visits con las tres columnas AL FINAL (la definición de la 0158, tal cual).
--   6. sync_protocol_schedule RE-DECLARADA (la de la 0029): no le devuelve la fecha teórica a un turno
--      cancelado (la visita volvería al turnero en un día que nadie acordó). La ventana sí se mueve. De paso,
--      el MOVER pide la fecha de randomización, como ya la pedía el preview (sin eso reventaba, ver § 6).
--   7. dismiss_alert RE-DECLARADA (la de la 0107): el ancla de un turno cancelado es el MOMENTO de la
--      cancelación. Con estimated_date NULL el ancla era '-infinity', y archivar una cancelación tapaba todas
--      las siguientes de esa visita.
--   8. estadisticas_equipo_track RE-DECLARADA (la de la 0143): una cancelada cuenta en el período de su
--      citación vieja (pendiente, o perdida si la ventana vence) y devuelve citacion_cancelada AL FINAL.
--   9. cancelar_turno_visita(visita): la acción.
--
-- QUIÉN: gerencia, o un operador de Coordinación que coordina el estudio. Es el permiso de mover fechas (la
-- policy de UPDATE «track modifica visitas propias», 0146) y el de registrar_llegada_adelantada (0155). No
-- habilita a nadie nuevo.
--
-- GUARDAS de la RPC (rechaza con un mensaje en castellano): sólo programadas —una suelta se elimina, y la
-- randomización legacy (kind 'randomizacion', estudios sin cuadro) fija la fecha del tratamiento al
-- agendarse (register_visit_event, 0145), así que se reprograma—; sólo por llegar; sin «no vino» (ya está
-- por reprogramar, y cancelarla le borraría la falta del día en que faltó); sin procedimientos realizados;
-- sin un pedido de medicación en curso (Farmacia prepararía medicación para una visita sin fecha).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0160. IDEMPOTENTE: reintentar es
-- volver a correr el archivo entero. Si el editor avisa de una «tabla nueva sin RLS», correrlo SIN activarla:
-- es el `select … into` de PL/pgSQL, no una tabla (quinta trampa de CLAUDE.md).
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. Ningún front viejo puede crear un turno cancelado (sólo la
-- RPC nueva lo hace), así que hasta el front nuevo ninguna fila cambia de estado; los CHECK sólo aflojan o
-- hablan de columnas nuevas; el trigger sólo actúa sobre filas con el sello; las vistas y la función de
-- Estadísticas suman columnas al final; sync y dismiss_alert hacen lo mismo de antes con todo lo que no
-- está cancelado. Registrar en supabase/README.md recién con la sonda del final en verde (decisión 101).
-- ============================================================================


-- 1 · Las columnas ---------------------------------------------------------------------------------

alter table public.patient_visits
  add column if not exists turno_cancelado_at timestamptz,
  add column if not exists turno_cancelado_by uuid references public.users(id) on delete set null,
  add column if not exists citacion_cancelada date;

comment on column public.patient_visits.turno_cancelado_at is
  'Cuándo se canceló el turno (cancelar_turno_visita, 0161): la visita sigue en el cronograma, sin fecha y por reprogramar. NULL = no está cancelado. Lo limpia el trigger trg_limpia_turno_cancelado cuando la visita vuelve a tener fecha.';
comment on column public.patient_visits.turno_cancelado_by is
  'Quién canceló el turno (0161). La campana lo usa para no avisarle a uno su propia cancelación; el nombre no se muestra (RLS de users).';
comment on column public.patient_visits.citacion_cancelada is
  'La fecha programada (estimated_date) que tenía la visita cuando se canceló el turno (0161). Ordena la fila en el cronograma, la propone Reprogramar y fija el período de Estadísticas. NULL = no está cancelado.';


-- 2 · La forma del dato ------------------------------------------------------------------------------
-- kind_shape: la de la 0030, salvo que una programada puede quedar sin fecha SI tiene el turno cancelado.

alter table public.patient_visits drop constraint if exists patient_visits_kind_shape;
alter table public.patient_visits add constraint patient_visits_kind_shape check (
  (kind =  'programada' and visit_def_id is not null
     and (estimated_date is not null or turno_cancelado_at is not null))
  or
  (kind <> 'programada' and visit_def_id is null and window_start is null and window_end is null)
);

-- Un turno cancelado no tiene fecha ni marcas, y el sello y la citación van juntos. Las filas de antes de
-- esta migración tienen las dos columnas en NULL: entran por la primera rama sin tocar datos.
alter table public.patient_visits drop constraint if exists patient_visits_turno_cancelado;
alter table public.patient_visits add constraint patient_visits_turno_cancelado check (
  (turno_cancelado_at is null and citacion_cancelada is null)
  or
  (turno_cancelado_at is not null and citacion_cancelada is not null and estimated_date is null
     and arrived_at is null and real_date is null and ready_at is null and no_show_at is null)
);


-- 3 · La salida: volver a tener fecha limpia el sello ----------------------------------------------
-- Corre ANTES del CHECK. Sólo si la fila nueva tiene fecha y sigue sin marcas: registrar_llegada_adelantada
-- pone fecha Y llegada a la vez, así que no limpia y el CHECK la rechaza, que es lo buscado.

create or replace function public.limpia_turno_cancelado()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $fn$
begin
  if new.turno_cancelado_at is not null
     and new.estimated_date is not null
     and new.arrived_at is null and new.real_date is null and new.ready_at is null then
    new.turno_cancelado_at := null;
    new.turno_cancelado_by := null;
    new.citacion_cancelada := null;
  end if;
  return new;
end;
$fn$;

comment on function public.limpia_turno_cancelado() is
  'Trigger BEFORE UPDATE de patient_visits (0161): si un turno cancelado vuelve a tener fecha, sin llegada, inicio ni fin, limpia turno_cancelado_at, turno_cancelado_by y citacion_cancelada. Es la salida de «Cancelar turno» por cualquier camino que le ponga fecha.';

drop trigger if exists trg_limpia_turno_cancelado on public.patient_visits;
create trigger trg_limpia_turno_cancelado
  before update on public.patient_visits
  for each row execute function public.limpia_turno_cancelado();


-- 4 · v_patient_visits: la rama 3 también para el turno cancelado ------------------------------------
-- El bloque de la 0144 tal cual (la lista de columnas sale de la vista viva, nunca `pv.*`: ver el
-- comentario de la 0144), salvo la rama 3 del estado, marcada con «0161». Mismas columnas: create or
-- replace, y v_track_visits no se entera.
do $mig$
declare
  v_columnas text;
begin
  select string_agg('pv.' || quote_ident(a.attname), ', ' order by a.attnum)
    into v_columnas
  from pg_attribute a
  where a.attrelid = 'public.v_patient_visits'::regclass
    and a.attnum > 0 and not a.attisdropped
    and a.attname not in ('computed_status', 'operational_stage');

  execute format($vista$
create or replace view public.v_patient_visits with (security_invoker = true) as
select
  %s,
  ( case
      -- 1 · En el centro hoy y sin cerrar la atención (anclado a la hora argentina, 0120).
      when pv.ready_at is null and pv.arrived_at is not null
       and (pv.arrived_at at time zone 'America/Argentina/Buenos_Aires')::date
         = (now()          at time zone 'America/Argentina/Buenos_Aires')::date
        then 'en_atencion'
      -- 2 · Ventana vencida. `current_date` es UTC: inconsistencia PREEXISTENTE (0004), sin tocar.
      when pv.real_date is null and current_date > pv.window_end then 'ventana_vencida'
      -- 3 · Sin fecha nueva: faltó (0067) o se canceló el turno (0161).
      when pv.real_date is null
       and (pv.no_show_at is not null or pv.turno_cancelado_at is not null) then 'por_reprogramar'
      -- 4 · Pendiente.
      when pv.real_date is null                                  then 'proxima'
      -- 5 · Un reporte de un procedimiento hecho, en 'pendiente' y fuera de plazo.
      when exists (
        select 1
        from public.v_visit_procedures vp
        join public.enrollments e          on e.id  = pv.enrollment_id
        join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                          and pp.procedure_id = vp.procedure_id
        join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
        join public.visit_procedure_completions vpc
             on vpc.visit_id = pv.id and vpc.procedure_id = vp.procedure_id
        left join public.report_status rs
             on rs.visit_id = pv.id and rs.report_definition_id = rd.id
        where vp.visit_id = pv.id
          and rd.eta_hours is not null
          and coalesce(rs.stage, 'pendiente') = 'pendiente'
          and now() > vpc.completed_at + (rd.eta_hours * interval '1 hour')
      ) then 'item_vencido'
      -- 6 · Atendida con pendientes: un reporte sin evolucionar, o el IP abierto (0120).
      when exists (
        select 1
        from public.v_visit_procedures vp
        join public.enrollments e          on e.id  = pv.enrollment_id
        join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                          and pp.procedure_id = vp.procedure_id
        join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
        left join public.report_status rs
             on rs.visit_id = pv.id and rs.report_definition_id = rd.id
        where vp.visit_id = pv.id
          and coalesce(rs.stage, 'pendiente') <> 'evolucionado'
      ) or exists (
        select 1 from public.v_visit_ip_status s
        where s.visit_id = pv.id and s.sellada and s.abierto
      ) then 'realizada'
      else 'completa'
    end )::visit_status as computed_status,
  ( case
      when pv.ready_at   is not null then 'fin_atencion'
      when pv.real_date  is not null then 'inicio_atencion'
      when pv.arrived_at is not null then 'concurrio_al_centro'
      else 'por_llegar'
    end ) as operational_stage
from public.patient_visits pv
$vista$, v_columnas);
end $mig$;

comment on view public.v_patient_visits is
  'patient_visits + estado clínico + recorrido operativo. 0144: los reportes que la visita debe salen de v_visit_procedures (lista efectiva), no del cronograma. 0161: un turno cancelado también es por_reprogramar. Resto como la 0137.';
revoke all on public.v_patient_visits from anon;
grant select on public.v_patient_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_patient_visits from authenticated;


-- 5 · v_track_visits con las tres columnas, al final ------------------------------------------------
-- La definición de la 0158, tal cual, más tres columnas al final: `create or replace view` sólo acepta
-- columnas nuevas AL FINAL, y la vista sigue con security_invoker (sin eso saltearía la RLS por estudio en
-- silencio). Ver la sonda del final.

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
  pa.fertility,
  vd.offset_days, e.enrollment_date,
  coalesce(v.treating_physician, pa.treating_physician) as treating_physician,
  v.coordinator_id, v.coordinator_name,
  v.kind,
  v.arrived_at, v.ready_at, v.left_at, v.no_show_at,
  v.attended_at,
  v.wants_doctor,
  v.doctor_seen_at,
  v.doctor_motivo,
  v.wants_doctor_at, v.doctor_marked_by,
  coalesce(vd.dispenses, false) as dispenses,
  coalesce(vd.dispenses_ip, false) as dispenses_ip,
  v.operational_stage,
  vd.role, vd.date_mode,
  (select count(*) from public.visit_comments vc where vc.visit_id = v.id) as comments_count,
  -- 0144: al final para no alterar el orden anterior.
  ori.visit_id as origin_visit_id,
  ovd.code     as origin_code,
  ovd.name     as origin_name,
  opv.kind     as origin_kind,
  -- 0145: el origen del retest, al final para no alterar el orden anterior.
  self.retest_of_visit_id as retest_of_visit_id,
  rvd.code     as retest_of_code,
  rvd.name     as retest_of_name,
  rpv.kind     as retest_of_kind,
  -- 0158: cuándo se cargó en otra fecha, al final para no alterar el orden anterior.
  self.cargada_en_otra_fecha_at as cargada_en_otra_fecha_at,
  -- 0161: el turno cancelado, al final para no alterar el orden anterior.
  self.turno_cancelado_at as turno_cancelado_at,
  self.turno_cancelado_by as turno_cancelado_by,
  self.citacion_cancelada as citacion_cancelada
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id
left join lateral (
  select a.deferred_from_visit_id as visit_id
  from public.visit_added_procedures a
  where a.visit_id = v.id and a.deferred_from_visit_id is not null
  order by a.added_at
  limit 1
) ori on true
left join public.patient_visits opv    on opv.id = ori.visit_id
left join public.visit_definitions ovd on ovd.id = opv.visit_def_id
-- v_patient_visits no trae retest_of_visit_id, cargada_en_otra_fecha_at ni las del turno cancelado (su
-- lista de columnas quedó fija en la 0144): se leen de la tabla por el id.
left join public.patient_visits self    on self.id = v.id
left join public.patient_visits rpv     on rpv.id = self.retest_of_visit_id
left join public.visit_definitions rvd on rvd.id = rpv.visit_def_id;

comment on view public.v_track_visits is
  'Visitas de Coordinación. patient_code = IVRS de la inscripción (0126). 0144: origin_* (continuación). 0145: retest_of_* (la visita que repite un retest), al final. 0158: cargada_en_otra_fecha_at, al final. 0161: turno_cancelado_at, turno_cancelado_by y citacion_cancelada, al final.';


-- 6 · sync_protocol_schedule: no re-fecha un turno cancelado ---------------------------------------
-- La de la 0029 tal cual, salvo lo marcado con «0161». Con el sello, el MOVER deja estimated_date en NULL
-- y sólo mueve la ventana (es del sponsor); el conteo del preview cuenta lo mismo que el UPDATE.
-- Y DE PASO, una guarda que faltaba desde la 0029: el MOVER no pedía que la inscripción tuviera fecha de
-- randomización, así que una inscripción activa sin ella y con automáticas pendientes (una definición
-- pasada de libre a automática, por ejemplo) recibía `NULL + offset` y el sync entero reventaba contra
-- kind_shape. El preview ya no la contaba (`desired` exige la fecha): ahora aplicar toca lo mismo.

create or replace function public.sync_protocol_schedule(p_protocol_id uuid, p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare v_creates int; v_moves int; v_deletes int; v_attended_div int;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')) then
    raise exception 'No tenés permiso para gestionar el cronograma' using errcode='42501';
  end if;

  with desired as (
    select e.id as enrollment_id, vd.id as visit_def_id,
           (e.randomization_date + vd.offset_days) as estimated_date,
           (e.randomization_date + vd.offset_days - vd.window_minus) as window_start,
           (e.randomization_date + vd.offset_days + vd.window_plus)  as window_end
    from public.enrollments e
    join public.visit_definitions vd on vd.protocol_id = e.protocol_id and vd.date_mode = 'automatica'
    where e.protocol_id = p_protocol_id and e.status = 'activo' and e.randomization_date is not null
  ),
  existing as (
    select pv.id, pv.enrollment_id, pv.visit_def_id, pv.estimated_date,
           pv.window_start, pv.window_end, pv.real_date,
           pv.turno_cancelado_at                                                      -- 0161
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
    join public.visit_definitions vd on vd.id = pv.visit_def_id
    where e.protocol_id = p_protocol_id and pv.kind = 'programada' and vd.date_mode = 'automatica'
  )
  select
    (select count(*) from desired d
       left join existing x on x.enrollment_id=d.enrollment_id and x.visit_def_id=d.visit_def_id
      where x.id is null),
    (select count(*) from existing x join desired d
       on d.enrollment_id=x.enrollment_id and d.visit_def_id=x.visit_def_id
      where x.real_date is null
        and ((x.turno_cancelado_at is null and x.estimated_date is distinct from d.estimated_date)  -- 0161
          or x.window_start is distinct from d.window_start
          or x.window_end is distinct from d.window_end)),
    -- v_deletes cuenta EXACTAMENTE lo que borra el DELETE de abajo: programadas no
    -- atendidas cuya definición ya no existe (huérfanas). No cuenta las de defs vivas
    -- (incluidas las flipeadas a 'libre'), que el apply tampoco toca → preview == apply.
    (select count(*) from public.patient_visits pv2
       join public.enrollments e2 on e2.id = pv2.enrollment_id
      where e2.protocol_id = p_protocol_id and pv2.kind = 'programada' and pv2.real_date is null
        and not exists (select 1 from public.visit_definitions vd where vd.id = pv2.visit_def_id)),
    (select count(*) from existing x join desired d
       on d.enrollment_id=x.enrollment_id and d.visit_def_id=x.visit_def_id
      where x.real_date is not null and x.estimated_date is distinct from d.estimated_date)
  into v_creates, v_moves, v_deletes, v_attended_div;

  if p_apply then
    insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end)
    select e.id, vd.id, 'programada',
           e.randomization_date + vd.offset_days,
           e.randomization_date + vd.offset_days - vd.window_minus,
           e.randomization_date + vd.offset_days + vd.window_plus
    from public.enrollments e
    join public.visit_definitions vd on vd.protocol_id = e.protocol_id and vd.date_mode = 'automatica'
    where e.protocol_id = p_protocol_id and e.status='activo' and e.randomization_date is not null
      and not exists (select 1 from public.patient_visits pv
        where pv.enrollment_id = e.id and pv.kind='programada' and pv.visit_def_id = vd.id);

    update public.patient_visits pv
       set estimated_date = case when pv.turno_cancelado_at is null                       -- 0161
                                 then e.randomization_date + vd.offset_days end,
           window_start   = e.randomization_date + vd.offset_days - vd.window_minus,
           window_end     = e.randomization_date + vd.offset_days + vd.window_plus
    from public.enrollments e, public.visit_definitions vd
    where pv.enrollment_id = e.id and pv.visit_def_id = vd.id and vd.date_mode = 'automatica'
      and e.protocol_id = p_protocol_id and e.status='activo' and pv.kind='programada' and pv.real_date is null
      and e.randomization_date is not null                                                 -- 0161 (de paso)
      and ((pv.turno_cancelado_at is null                                                  -- 0161
            and pv.estimated_date is distinct from e.randomization_date + vd.offset_days)
        or pv.window_start  is distinct from e.randomization_date + vd.offset_days - vd.window_minus
        or pv.window_end    is distinct from e.randomization_date + vd.offset_days + vd.window_plus);

    delete from public.patient_visits pv
    using public.enrollments e
    where pv.enrollment_id = e.id and e.protocol_id = p_protocol_id and e.status='activo'
      and pv.kind='programada' and pv.real_date is null
      and not exists (select 1 from public.visit_definitions vd where vd.id = pv.visit_def_id);
  end if;

  return jsonb_build_object('creates', v_creates, 'moves', v_moves,
    'deletes', v_deletes, 'attended_divergent', v_attended_div, 'applied', p_apply);
end; $fn$;
revoke all on function public.sync_protocol_schedule(uuid, boolean) from public;
grant execute on function public.sync_protocol_schedule(uuid, boolean) to authenticated;
comment on function public.sync_protocol_schedule is
  'Reconcilia las programadas AUTOMÁTICAS (post-rando) vs visit_definitions; no toca atendidas ni libres. 0161: a un turno cancelado no le devuelve la fecha (sólo le mueve la ventana). gerencia/track-admin. SECURITY DEFINER.';


-- 7 · dismiss_alert: el ancla de un turno cancelado es la cancelación -------------------------------
-- La de la 0107 tal cual, salvo lo marcado con «0161». Firma igual: create or replace.

create or replace function public.dismiss_alert(
  p_kind                 text,
  p_visit_id             uuid,
  p_reason               text,
  p_report_definition_id uuid default null,
  p_detail               text default null
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_status         text;
  v_window_end     date;
  v_estimated_date date;   -- 0107: el ancla de 'por_reprogramar'
  v_cancelado      timestamptz;   -- 0161: el ancla de un turno cancelado
  v_due            timestamptz;
  v_anchor         timestamptz;
  v_name           text;
  v_role           text;
  v_id             uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_module('gerencia') or public.coordina_visita(p_visit_id)) then
    raise exception 'No tenés permiso' using errcode = '42501';
  end if;
  if p_kind not in ('visita', 'reporte_procedimiento') then
    raise exception 'Tipo de alerta desconocido' using errcode = '22023';
  end if;

  if p_kind = 'visita' then
    if p_report_definition_id is not null then
      raise exception 'Una alerta de visita no lleva reporte' using errcode = '22023';
    end if;
    -- Calificamos tv.* siempre: en PL/pgSQL los nombres sueltos compiten con las variables
    -- locales (el error de 0056 y 0058, dos veces el mismo).
    select tv.computed_status, tv.window_end, tv.estimated_date, tv.turno_cancelado_at   -- 0161
      into v_status, v_window_end, v_estimated_date, v_cancelado
      from public.v_track_visits tv
     where tv.id = p_visit_id;
    if v_status is null then
      raise exception 'Visita inexistente' using errcode = '23503';
    end if;
    -- 0107: entra 'por_reprogramar'.
    if v_status not in ('ventana_vencida', 'item_vencido', 'por_reprogramar') then
      raise exception 'Esa visita no está en alerta' using errcode = 'check_violation';
    end if;
    -- 0107: el ancla, por estado. 0161: un turno cancelado no tiene fecha; su ancla es el momento de la
    -- cancelación, así cada cancelación es un hecho nuevo y archivar una no tapa la siguiente.
    v_anchor := case
      when v_status = 'por_reprogramar'
        then coalesce(v_estimated_date::timestamptz, v_cancelado, '-infinity'::timestamptz)   -- 0161
      else   coalesce(v_window_end::timestamptz,     '-infinity'::timestamptz)
    end;
  else
    if p_report_definition_id is null then
      raise exception 'Falta el reporte de la alerta' using errcode = '23502';
    end if;
    select ra.report_due_at
      into v_due
      from public.v_procedure_report_alerts ra
     where ra.report_definition_id = p_report_definition_id
       and ra.visit_id             = p_visit_id;
    if v_due is null then
      raise exception 'Ese reporte no está en alerta' using errcode = 'check_violation';
    end if;
    v_status := null;
    v_anchor := v_due;
  end if;

  -- Snapshot de quién archiva: su propia fila de users (siempre visible para él; además esto es
  -- SECURITY DEFINER). Mismo criterio que add_visit_comment en 0048.
  select u.full_name, coalesce(nullif(btrim(u.puesto), ''), 'Equipo')
    into v_name, v_role
    from public.users u where u.id = auth.uid();

  insert into public.alert_dismissals
    (kind, visit_id, report_definition_id, status, anchor, reason, detail,
     dismissed_by, dismissed_by_name, dismissed_by_role)
  values
    (p_kind, p_visit_id, p_report_definition_id, v_status, v_anchor, p_reason,
     nullif(btrim(coalesce(p_detail, '')), ''), auth.uid(),
     coalesce(v_name, 'Usuario'), coalesce(v_role, 'Equipo'))
  returning id into v_id;

  return v_id;
end $fn$;

comment on function public.dismiss_alert(text, uuid, text, uuid, text) is
  'Archiva una alerta vigente con motivo de catálogo. Calcula la huella (status+anchor) en el '
  'servidor para que un descarte no pueda tapar una alerta futura. Las de visita cubren '
  'ventana_vencida, item_vencido y por_reprogramar (0107); el ancla es window_end salvo en '
  'por_reprogramar, donde es estimated_date o, con el turno cancelado, el momento de la cancelación '
  '(0161). Las de reporte se identifican por (visit_id, report_definition_id) desde la 0092. '
  'Authz: gerencia o coordinador de la visita.';

revoke all   on function public.dismiss_alert(text, uuid, text, uuid, text) from anon, public;
grant execute on function public.dismiss_alert(text, uuid, text, uuid, text) to authenticated;


-- 8 · estadisticas_equipo_track: la cancelada, en el período de su citación vieja -------------------
-- La de la 0143 tal cual, salvo lo marcado con «0161»: el filtro mira coalesce(estimated_date,
-- citacion_cancelada), y el resultado suma citacion_cancelada AL FINAL. Cambiar el `returns table` no se
-- puede con create or replace: drop + create + los grant, seguidos. Un front viejo ignora la columna.

drop function if exists public.estadisticas_equipo_track(date, date);

create function public.estadisticas_equipo_track(p_desde date, p_hasta date)
returns table (
  id uuid,
  protocol_id uuid,
  protocol_code text,
  protocol_name text,
  patient_id uuid,
  patient_name text,
  patient_code text,
  kind text,
  role text,
  visit_name text,
  real_date date,
  estimated_date date,
  window_start date,
  window_end date,
  no_show_at timestamptz,
  computed_status text,
  coordinator_id uuid,
  coordinator_name text,
  arrived_at timestamptz,
  arrived_by_name text,
  attended_at timestamptz,
  ready_at timestamptz,
  ready_by_name text,
  left_at timestamptz,
  left_by_name text,
  citacion_cancelada date   -- 0161
)
language plpgsql stable security definer set search_path = pg_catalog, public as $equipo$
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not (public.has_module('gerencia') or public.has_min_role('track', 'leader')) then
    raise exception 'No tenés permiso' using errcode = '42501';
  end if;

  return query
  select
    t.id::uuid,
    t.protocol_id::uuid,
    t.protocol_code::text,
    t.protocol_name::text,
    t.patient_id::uuid,
    t.patient_name::text,
    t.patient_code::text,
    t.kind::text,
    t.role::text,
    t.visit_name::text,
    t.real_date::date,
    t.estimated_date::date,
    t.window_start::date,
    t.window_end::date,
    t.no_show_at::timestamptz,
    t.computed_status::text,
    t.coordinator_id::uuid,
    t.coordinator_name::text,
    t.arrived_at::timestamptz,
    ua.full_name::text,
    t.attended_at::timestamptz,
    t.ready_at::timestamptz,
    ur.full_name::text,
    t.left_at::timestamptz,
    ul.full_name::text,
    t.citacion_cancelada::date   -- 0161
  from public.v_track_visits t
  join public.patient_visits pv on pv.id = t.id
  left join public.users ua on ua.id = pv.arrived_by
  left join public.users ur on ur.id = pv.ready_by
  left join public.users ul on ul.id = pv.left_by
  where (t.real_date between p_desde and p_hasta)
     or (t.real_date is null and coalesce(t.estimated_date, t.citacion_cancelada) between p_desde and p_hasta);  -- 0161
end
$equipo$;

revoke all on function public.estadisticas_equipo_track(date, date) from public;
revoke all on function public.estadisticas_equipo_track(date, date) from anon;
grant execute on function public.estadisticas_equipo_track(date, date) to authenticated;

comment on function public.estadisticas_equipo_track(date, date) is
  'Zona de equipo de Estadísticas de Coordinación: visitas del período de TODO el centro, con quién marcó cada sello. Sólo jefatura (gerencia o track leader+). 0161: un turno cancelado cuenta en el período de su citación vieja, y se devuelve citacion_cancelada al final. SECURITY DEFINER. 0143.';


-- 9 · Cancelar el turno -----------------------------------------------------------------------------

create or replace function public.cancelar_turno_visita(p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_protocol   uuid;
  v_kind       text;
  v_citacion   date;
  v_arrived    timestamptz;
  v_real       date;
  v_ready      timestamptz;
  v_no_show    timestamptz;
  v_cancelado  timestamptz;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  -- Columnas SIEMPRE calificadas (0056/0058). `for update`: una llegada marcada en otra pestaña al mismo
  -- tiempo se ordena con ésta, y la segunda ve la etapa nueva.
  select e.protocol_id, pv.kind::text, pv.estimated_date, pv.arrived_at, pv.real_date, pv.ready_at,
         pv.no_show_at, pv.turno_cancelado_at
    into v_protocol, v_kind, v_citacion, v_arrived, v_real, v_ready, v_no_show, v_cancelado
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id
     for update of pv;
  if v_protocol is null then
    raise exception 'Esa visita ya no existe' using errcode = '23503';
  end if;

  -- AUTHZ A MANO: la función es SECURITY DEFINER y la RLS no la mira. Es el permiso de mover fechas.
  if not (
    public.has_module('gerencia')
    or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(v_protocol))
  ) then
    raise exception 'No tenés permiso para cancelar el turno de esta visita' using errcode = '42501';
  end if;

  if v_kind = 'randomizacion' then
    raise exception 'Fija la fecha del tratamiento: reprogramala en vez de cancelar el turno.' using errcode = 'check_violation';
  end if;
  if v_kind <> 'programada' then
    raise exception 'Una visita suelta no tiene turno que cancelar: se elimina.' using errcode = 'check_violation';
  end if;
  if v_cancelado is not null then
    raise exception 'El turno ya estaba cancelado. Actualizá la pantalla.' using errcode = 'check_violation';
  end if;
  if v_arrived is not null or v_real is not null or v_ready is not null then
    raise exception 'La visita ya no está por llegar. Actualizá y probá de nuevo.' using errcode = 'check_violation';
  end if;
  if v_no_show is not null then
    raise exception 'Tiene «no vino» marcado: ya está por reprogramar.' using errcode = 'check_violation';
  end if;
  if v_citacion is null then
    raise exception 'La visita no tiene turno.' using errcode = 'check_violation';
  end if;

  -- Las guardas: lo que no puede quedar colgado de una visita sin fecha.
  if exists (select 1 from public.visit_procedure_completions c where c.visit_id = p_visit_id) then
    raise exception 'Tiene procedimientos marcados como realizados: no se puede cancelar el turno.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.dispensation_requests dr
              where dr.visit_id = p_visit_id and dr.status = 'solicitada') then
    raise exception 'Tiene un pedido de medicación sin atender: cancelalo antes de cancelar el turno.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.dispensation_requests dr
              where dr.visit_id = p_visit_id and dr.status = 'preparando') then
    raise exception 'Farmacia ya está preparando la medicación de esta visita: avisale antes de cancelar el turno.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.dispensation_requests dr
              where dr.visit_id = p_visit_id and dr.status = 'atendida')
     or exists (select 1 from public.track_dispensations td where td.patient_visit_id = p_visit_id) then
    raise exception 'La medicación de esta visita ya se dispensó: no se puede cancelar el turno.' using errcode = 'check_violation';
  end if;

  -- citacion_antes_de_adelantar no se toca: en Por llegar está siempre vacía (la limpia
  -- retroceder_etapa_visita al deshacer la llegada, 0155).
  update public.patient_visits pv
     set citacion_cancelada = pv.estimated_date,
         estimated_date     = null,
         turno_cancelado_at = now(),
         turno_cancelado_by = auth.uid()
   where pv.id = p_visit_id;
end;
$fn$;

revoke all on function public.cancelar_turno_visita(uuid) from public;
revoke all on function public.cancelar_turno_visita(uuid) from anon;
grant execute on function public.cancelar_turno_visita(uuid) to authenticated;
comment on function public.cancelar_turno_visita(uuid) is
  'Cancela el turno de una visita del cronograma (0161): queda en el cronograma, sin fecha (estimated_date NULL) y por reprogramar; guarda la fecha que tenía en citacion_cancelada, y sella turno_cancelado_at y turno_cancelado_by. Sólo programadas, por llegar, sin «no vino», sin procedimientos realizados ni pedido de medicación en curso. Authz: gerencia o quien coordina el estudio (mover fechas). SECURITY DEFINER.';


-- 10 · Recarga de PostgREST y la sonda ---------------------------------------------------------------
notify pgrst, 'reload schema';

-- LA SONDA (decisión 101): tienen que dar las diez en `true`. Hasta entonces la migración no está aplicada.
-- `forma` importa sola: si después del drop del kind_shape el add hubiera fallado, la tabla quedaría sin ese
-- CHECK y ninguna otra columna lo diría. `invoker`: las dos vistas corren con los permisos de quien consulta.
select
  (select count(*) from pg_proc where proname = 'cancelar_turno_visita') = 1                              as rpc,
  (select prosrc like '%turno_cancelado_at%' from pg_proc where proname = 'sync_protocol_schedule')       as sync,
  (select prosrc like '%turno_cancelado_at%' from pg_proc where proname = 'dismiss_alert')                as descarte,
  (select prosrc like '%citacion_cancelada%' from pg_proc where proname = 'estadisticas_equipo_track')    as estadisticas,
  pg_get_viewdef('public.v_patient_visits'::regclass) like '%turno_cancelado_at%'                         as estado,
  exists (select 1 from information_schema.columns where table_schema = 'public'
          and table_name = 'v_track_visits' and column_name = 'citacion_cancelada')                       as vista,
  (select pg_get_constraintdef(c.oid) like '%turno_cancelado_at%' from pg_constraint c
    where c.conname = 'patient_visits_kind_shape')                                                        as forma,
  exists (select 1 from pg_constraint where conname = 'patient_visits_turno_cancelado')                   as candado,
  exists (select 1 from pg_trigger where tgname = 'trg_limpia_turno_cancelado' and not tgisinternal)      as salida,
  (select bool_and(coalesce(c.reloptions::text like '%security_invoker=true%', false)) from pg_class c
    where c.oid in ('public.v_patient_visits'::regclass, 'public.v_track_visits'::regclass))              as invoker;
