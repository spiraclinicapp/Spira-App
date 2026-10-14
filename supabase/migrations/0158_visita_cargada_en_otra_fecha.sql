-- Spira · Migración 0158 — Coordinación: cargar una visita en otro día
-- ============================================================================
-- Plan: `docs/plan-visita-cargada-otro-dia.md` (revisado con /plan-eng-review el 2026-10-14).
--
-- EL PROBLEMA. Una visita que pasó y no se marcó en su día no tenía cómo cargarse con su fecha. Los
-- botones de etapa sellan con now() (llegada, inicio, fin), y corregir después la «Fecha realizada»
-- dejaba la visita en DOS días de la lista (el de la fecha y el de las marcas), con horas de hoy, a
-- nombre de quien la cargó (start_visit_attention pisa el coordinador, 0102) y con la alerta de IP
-- contando desde la carga (se ancla en attended_at, 0119).
--
-- Suma:
--   1. patient_visits.cargada_en_otra_fecha_at (timestamptz, nullable): CUÁNDO se cargó la visita con
--      una fecha pasada. Sólo la escribe la RPC 3; la lee `retroceder_etapa_visita` para deshacer la
--      carga el mismo día, y el front para decir «cargada el 14 oct». Quién la cargó queda en audit_log.
--   2. fecha_minima_para_cargar_visita(visita): la fecha más temprana posible, que es la de la última
--      visita del cronograma ya realizada que va antes que ésta en la misma inscripción. La usan la RPC
--      (guarda) y el modal (el mínimo del selector): una sola regla en los dos lados. Importa sobre todo
--      en la randomización, donde la fecha genera el tratamiento entero al finalizar (0030).
--   3. registrar_visita_en_otra_fecha(visita, fecha, atendio): la visita pasa a «En atención» con su
--      fecha real, a nombre de quien la atendió, en un solo paso:
--        · real_date = la fecha. attended_at queda NULL: no se sabe a qué hora empezó y no se inventa
--          (igual que las visitas anteriores a la 0102). Con eso la alerta de IP se ancla en la fecha
--          real (0119: coalesce(attended_at, real_date)), y ni los sellos ni las duraciones de Equipo
--          muestran una hora que no ocurrió;
--        · coordinador = `atendio`, validado contra protocol_coordinators (como set_visit_coordinator,
--          0065), y no quien hace el clic: Equipo cuenta una visita atendida como de su coordinador;
--        · limpia el «no vino»: el paciente vino.
--      No cierra la visita: se finaliza con el botón de siempre, que lleva el cierre clínico de
--      screening y de randomización.
--   4. retroceder_etapa_visita (0155) RE-DECLARADA, con la misma firma: el inicio de atención se deshace
--      también si lo que se hizo HOY fue una carga en otra fecha (la marca pasa a ser
--      coalesce(attended_at, cargada_en_otra_fecha_at)), y al deshacerlo se limpia la columna. El resto
--      es la 0155 tal cual.
--   5. v_track_visits suma cargada_en_otra_fecha_at AL FINAL (la definición de la 0145, tal cual). La lee
--      de la tabla por el id (`self`), como retest_of_visit_id: v_patient_visits no se toca, porque su
--      lista de columnas quedó fija en la 0144.
--
-- QUIÉN: gerencia, o un operador de Coordinación que coordina el estudio. Es el permiso de
-- registrar_llegada_adelantada (0155) y el de `coordinaElEstudio` en el front. No habilita a nadie
-- nuevo: start_visit_attention ya dejaba fechar una visita con cualquier día a quien coordina el estudio.
--
-- GUARDAS (rechaza con un mensaje en castellano): la visita tiene que estar por llegar (sin llegada,
-- sin fecha real, sin fin); la fecha tiene que ser ANTERIOR a hoy (día argentino) y no anterior a la
-- fecha mínima; quien la atendió tiene que coordinar el estudio.
--
-- Deshacer la carga NO devuelve el «no vino» ni el coordinador anterior: es la decisión de la 0155, el
-- valor anterior sólo está en audit_log. `lleva_ip` se sella al fecharse (trg_seal_visit_lleva_ip, 0119)
-- y al deshacer queda como estaba, igual que con el inicio de atención de siempre.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0157. IDEMPOTENTE:
-- reintentar es volver a correr el archivo entero.
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. Ningún front desplegado llama a las funciones nuevas ni
-- lee la columna, y `retroceder_etapa_visita` conserva firma y comportamiento para todo lo que ya
-- existía. El front nuevo sin esta migración respondería PGRST202 en «Vino otro día». Registrar en
-- supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Cuándo se cargó en otra fecha ----------------------------------------------------------------

alter table public.patient_visits
  add column if not exists cargada_en_otra_fecha_at timestamptz;
comment on column public.patient_visits.cargada_en_otra_fecha_at is
  'Cuándo se cargó la visita con una fecha pasada (registrar_visita_en_otra_fecha, 0158). La escribe sólo esa RPC; la consume retroceder_etapa_visita para deshacer la carga el mismo día. NULL = la visita se marcó en su día con los botones de etapa, o nunca se fechó.';


-- 2 · La fecha mínima ------------------------------------------------------------------------------

create or replace function public.fecha_minima_para_cargar_visita(p_visit_id uuid)
returns date
language sql
stable
set search_path = pg_catalog, public
as $fn$
  -- La última visita del CRONOGRAMA ya realizada que va antes que ésta (por el orden de su definición),
  -- en la misma inscripción. Una visita suelta (retest, continuación, no programada) no tiene un «antes»
  -- en el cronograma: NULL, sin mínimo. SECURITY INVOKER: desde el front responde con la RLS de quien
  -- pregunta; desde la RPC 3, que es SECURITY DEFINER, con todo.
  select max(o.real_date)
    from public.patient_visits pv
    join public.visit_definitions vd  on vd.id = pv.visit_def_id
    join public.patient_visits o      on o.enrollment_id = pv.enrollment_id
                                     and o.id <> pv.id
                                     and o.real_date is not null
    join public.visit_definitions ovd on ovd.id = o.visit_def_id
   where pv.id = p_visit_id
     and ovd.sort_order < vd.sort_order
$fn$;

revoke all on function public.fecha_minima_para_cargar_visita(uuid) from public;
revoke all on function public.fecha_minima_para_cargar_visita(uuid) from anon;
grant execute on function public.fecha_minima_para_cargar_visita(uuid) to authenticated;
comment on function public.fecha_minima_para_cargar_visita(uuid) is
  'La fecha más temprana con la que se puede cargar una visita en otra fecha (0158): la de la última visita del cronograma ya realizada que va antes, en la misma inscripción. NULL = sin mínimo (visita suelta, o nada realizado antes).';


-- 3 · Cargar la visita en otra fecha ---------------------------------------------------------------

create or replace function public.registrar_visita_en_otra_fecha(p_visit_id uuid, p_fecha date, p_atendio uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_protocol  uuid;
  v_arrived   timestamptz;
  v_real      date;
  v_ready     timestamptz;
  v_minima    date;
  v_nombre    text;
  v_hoy       date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  -- Columnas SIEMPRE calificadas (0056/0058). `for update`: una llegada marcada en otra pestaña al
  -- mismo tiempo se ordena con ésta, y la segunda ve la etapa nueva.
  select e.protocol_id, pv.arrived_at, pv.real_date, pv.ready_at
    into v_protocol, v_arrived, v_real, v_ready
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id
     for update of pv;
  if v_protocol is null then
    raise exception 'Esa visita ya no existe' using errcode = '23503';
  end if;

  -- AUTHZ A MANO: la función es SECURITY DEFINER y la RLS no la mira (ver la cabecera).
  if not (
    public.has_module('gerencia')
    or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(v_protocol))
  ) then
    raise exception 'No tenés permiso para cargar esta visita' using errcode = '42501';
  end if;

  if v_arrived is not null or v_real is not null or v_ready is not null then
    raise exception 'La visita ya no está por llegar. Actualizá y probá de nuevo.' using errcode = 'check_violation';
  end if;

  -- El día ARGENTINO y no `current_date`, que es UTC: después de las 21:00 sería mañana (ver 0102).
  if p_fecha is null or p_fecha >= v_hoy then
    raise exception 'La fecha tiene que ser anterior a hoy. Si vino hoy, marcá la llegada.' using errcode = 'check_violation';
  end if;
  v_minima := public.fecha_minima_para_cargar_visita(p_visit_id);
  if v_minima is not null and p_fecha < v_minima then
    raise exception 'No puede ser anterior al %, el día de la visita anterior del cronograma.', to_char(v_minima, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

  -- Quien la atendió tiene que coordinar el estudio (como set_visit_coordinator, 0065). Pertenencia y
  -- nombre por separado: un usuario sin nombre cargado coordina igual, y el front trata un
  -- coordinator_name nulo como «sin asignar».
  if p_atendio is null then
    raise exception 'Elegí quién atendió la visita.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.protocol_coordinators pc
                  where pc.protocol_id = v_protocol and pc.user_id = p_atendio) then
    raise exception 'Esa persona no coordina este estudio.' using errcode = '23514';
  end if;
  select u.full_name into v_nombre from public.users u where u.id = p_atendio;

  update public.patient_visits pv
     set real_date                = p_fecha,
         coordinator_id           = p_atendio,
         coordinator_name         = v_nombre,
         no_show_at               = null,
         no_show_by               = null,
         cargada_en_otra_fecha_at = now()
   where pv.id = p_visit_id;
end;
$fn$;

revoke all on function public.registrar_visita_en_otra_fecha(uuid, date, uuid) from public;
revoke all on function public.registrar_visita_en_otra_fecha(uuid, date, uuid) from anon;
grant execute on function public.registrar_visita_en_otra_fecha(uuid, date, uuid) to authenticated;
comment on function public.registrar_visita_en_otra_fecha(uuid, date, uuid) is
  'Carga una visita POR LLEGAR con una fecha pasada (0158): real_date = la fecha, sin hora de inicio (attended_at NULL), a nombre de quien la atendió (validado contra protocol_coordinators), sin el «no vino», y sella cargada_en_otra_fecha_at. La fecha: anterior a hoy y no anterior a fecha_minima_para_cargar_visita. No cierra la visita. Authz: gerencia o quien coordina el estudio. SECURITY DEFINER.';


-- 4 · Volver a la etapa anterior, también desde una carga en otra fecha ----------------------------
-- La 0155 tal cual, salvo lo marcado con «0158»: leer la columna, usarla como marca del inicio y
-- limpiarla al deshacer. Los comentarios que decían «ver la cabecera» ahora nombran la de la 0155.

create or replace function public.retroceder_etapa_visita(p_visit_id uuid, p_desde text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_protocol   uuid;
  v_arrived    timestamptz;
  v_attended   timestamptz;
  v_cargada    timestamptz;   -- 0158
  v_real       date;
  v_ready      timestamptz;
  v_wants      boolean;
  v_seen       timestamptz;
  v_etapa      text;
  v_destino    text;
  v_marca      timestamptz;
  v_hoy        date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  -- Columnas SIEMPRE calificadas: en PL/pgSQL los nombres sueltos compiten con las variables (0056/0058).
  -- `for update` sobre la visita: dos «Volver» simultáneos se ordenan, y el segundo ve la etapa nueva.
  select e.protocol_id, pv.arrived_at, pv.attended_at, pv.cargada_en_otra_fecha_at,   -- 0158
         pv.real_date, pv.ready_at, pv.wants_doctor, pv.doctor_seen_at
    into v_protocol, v_arrived, v_attended, v_cargada, v_real, v_ready, v_wants, v_seen
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id
     for update of pv;
  if v_protocol is null then
    raise exception 'Esa visita ya no existe' using errcode = '23503';
  end if;

  v_etapa := case
    when v_ready   is not null then 'fin_atencion'
    when v_real    is not null then 'inicio_atencion'
    when v_arrived is not null then 'concurrio_al_centro'
    else 'por_llegar'
  end;

  if p_desde is distinct from v_etapa then
    raise exception 'La visita cambió de etapa mientras la mirabas. Actualizá y probá de nuevo.' using errcode = 'check_violation';
  end if;
  if v_etapa = 'por_llegar' then
    raise exception 'Es la primera etapa: no hay a dónde volver.' using errcode = 'check_violation';
  end if;
  if v_etapa = 'fin_atencion' then
    raise exception 'Una visita completa no vuelve atrás. Si hay que repetir algo, pedí un retest.' using errcode = 'check_violation';
  end if;

  -- AUTHZ A MANO: la función es SECURITY DEFINER y la RLS no la mira. Cada marca se deshace con el
  -- permiso de quien la hace (ver la cabecera de la 0155).
  if v_etapa = 'concurrio_al_centro' then
    if not (public.has_module('gerencia') or public.has_min_role('track', 'operator')) then
      raise exception 'No tenés permiso para deshacer la llegada' using errcode = '42501';
    end if;
  elsif not (
    public.has_module('gerencia')
    or exists (select 1 from public.protocol_coordinators pc
                where pc.protocol_id = v_protocol and pc.user_id = auth.uid())
  ) then
    raise exception 'No tenés permiso para deshacer el inicio de atención de esta visita' using errcode = '42501';
  end if;

  -- Sólo la marca de HOY (ver la cabecera de la 0155). El inicio se marca con su sello attended_at
  -- (0102) o, si se cargó en otra fecha, con el momento de la carga (0158). Un inicio sin ninguno de
  -- los dos es anterior a la 0102.
  v_marca := case when v_etapa = 'concurrio_al_centro' then v_arrived else coalesce(v_attended, v_cargada) end;  -- 0158
  if v_marca is null or (v_marca at time zone 'America/Argentina/Buenos_Aires')::date <> v_hoy then
    raise exception 'Se registró otro día: ya no se deshace desde acá.' using errcode = 'check_violation';
  end if;

  -- Desde «En atención» se vuelve a «Concurrió» si hubo llegada, o a «Por llegar» si no.
  v_destino := case
    when v_etapa = 'inicio_atencion' and v_arrived is not null then 'concurrio_al_centro'
    else 'por_llegar'
  end;

  -- Las guardas: registros que dependen de que la etapa haya pasado (ver la cabecera de la 0155).
  if exists (select 1 from public.visit_procedure_completions c where c.visit_id = p_visit_id) then
    raise exception 'Tiene procedimientos marcados como realizados. Destildalos antes de volver atrás.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.visit_pending_procedures vpp where vpp.visit_id = p_visit_id) then
    raise exception 'Tiene procedimientos que quedaron para otro día. Quitá esa marca antes de volver atrás.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.visit_added_procedures vap where vap.deferred_from_visit_id = p_visit_id) then
    raise exception 'Tiene procedimientos que pasaron a otra visita. Deshacé esa continuación antes de volver atrás.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.patient_visits r where r.retest_of_visit_id = p_visit_id) then
    raise exception 'Tiene un retest pedido. Borralo antes de volver atrás.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.dispensation_requests dr
              where dr.visit_id = p_visit_id and dr.status in ('preparando', 'atendida'))
     or exists (select 1 from public.track_dispensations td where td.patient_visit_id = p_visit_id) then
    raise exception 'Tiene una dispensación preparándose o entregada: no se puede volver atrás.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.ip_units u where u.dispensed_visit_id = p_visit_id)
     or exists (select 1 from public.visit_ip_closures ic where ic.visit_id = p_visit_id) then
    raise exception 'Tiene el IP entregado o cerrado: no se puede volver atrás.' using errcode = 'check_violation';
  end if;
  if v_destino = 'por_llegar' and (coalesce(v_wants, false) or v_seen is not null) then
    raise exception 'Tiene atención médica pedida o dada. Quitá el pedido antes de deshacer la llegada.' using errcode = 'check_violation';
  end if;

  if v_etapa = 'concurrio_al_centro' then
    -- Si la llegada fue adelantada, la visita recupera su citación, salvo que alguien la haya movido
    -- después: entonces la fecha nueva es la que vale.
    update public.patient_visits pv
       set arrived_at = null,
           estimated_date = case
             when pv.citacion_antes_de_adelantar is not null
              and pv.estimated_date = (v_arrived at time zone 'America/Argentina/Buenos_Aires')::date
               then pv.citacion_antes_de_adelantar
             else pv.estimated_date
           end,
           citacion_antes_de_adelantar = null
     where pv.id = p_visit_id;
  else
    update public.patient_visits pv
       set real_date = null,
           attended_at = null,
           cargada_en_otra_fecha_at = null   -- 0158
     where pv.id = p_visit_id;
  end if;

  return v_destino;
end;
$fn$;

revoke all on function public.retroceder_etapa_visita(uuid, text) from public;
revoke all on function public.retroceder_etapa_visita(uuid, text) from anon;
grant execute on function public.retroceder_etapa_visita(uuid, text) to authenticated;
comment on function public.retroceder_etapa_visita(uuid, text) is
  'Deshace la marca de etapa hecha HOY (0155): concurrió → por llegar (borra arrived_at y devuelve la citación si se había adelantado) o en atención → concurrió/por llegar (borra real_date y attended_at). 0158: el inicio también se deshace si HOY se cargó la visita en otra fecha (borra cargada_en_otra_fecha_at). p_desde = la etapa que mostraba la pantalla. Authz: la del que hace la marca. Rechaza si la visita tiene registros que dependen de la etapa. Devuelve la etapa destino. SECURITY DEFINER.';


-- 5 · v_track_visits con la columna, al final -------------------------------------------------------
-- La definición de la 0145, tal cual, más una columna al final: `create or replace view` sólo acepta
-- columnas nuevas AL FINAL, y la vista sigue con security_invoker (corre con los permisos de quien
-- consulta; sin eso saltearía la RLS por estudio en silencio). Ver la sonda de abajo.

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
  self.cargada_en_otra_fecha_at as cargada_en_otra_fecha_at
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
-- v_patient_visits no trae retest_of_visit_id ni cargada_en_otra_fecha_at (su lista de columnas quedó
-- fija en la 0144): se leen de la tabla por el id.
left join public.patient_visits self    on self.id = v.id
left join public.patient_visits rpv     on rpv.id = self.retest_of_visit_id
left join public.visit_definitions rvd on rvd.id = rpv.visit_def_id;

comment on view public.v_track_visits is
  'Visitas de Coordinación. patient_code = IVRS de la inscripción (0126). 0144: origin_* (continuación). 0145: retest_of_* (la visita que repite un retest), al final. 0158: cargada_en_otra_fecha_at, al final.';


-- 6 · Recarga de PostgREST y sondas ------------------------------------------------------------------
notify pgrst, 'reload schema';

-- Sonda 1: la vista recreada corre con los permisos de QUIEN CONSULTA. Tiene que decir
-- {security_invoker=true}; sin eso saltea la RLS por estudio en silencio.
select c.relname, c.reloptions
from pg_class c
where c.oid = 'public.v_track_visits'::regclass;

-- Verificación · tras aplicar, las funciones y la columna tienen que existir:
--   select proname from pg_proc
--    where proname in ('registrar_visita_en_otra_fecha', 'fecha_minima_para_cargar_visita', 'retroceder_etapa_visita');
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'v_track_visits' and column_name = 'cargada_en_otra_fecha_at';
