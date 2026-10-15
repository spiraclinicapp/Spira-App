-- Spira · Migración 0160 — Coordinación: volver atrás una marca de otro día, y «Vino otro día» desde Concurrió
-- ============================================================================
-- Pedido del Director (2026-10-14), sobre una visita que llegó el 10 y quedó en «Concurrió»:
-- «¿La opción de hacer la visita otro día? Y que el volver a por llegar tire aviso y todo pero que te deje».
-- Plan: `docs/plan-visita-cargada-otro-dia.md` (§ «0160»).
--
-- Dos cambios, los dos sólo ACEPTAN más casos:
--
--   1. retroceder_etapa_visita (0155, re-declarada en la 0158) — SIN el «sólo el mismo día». La 0155
--      deshacía únicamente la marca hecha HOY («volver atrás corrige un clic, no reescribe la historia»,
--      decisión 84 del handoff del 14). En la práctica dejaba sin salida a una visita marcada mal otro
--      día: la llegada del 10 de una visita que no se atendió quedaba ahí para siempre. Desde ésta se
--      deshace también una marca de otro día; el AVISO lo da el front, que pide confirmar diciendo de qué
--      día es lo que se borra. Lo que sigue igual —y es lo que de verdad protege—: las guardas (procedimientos
--      realizados, pendientes para otro día, continuación, retest, dispensación, IP, atención médica), el
--      permiso de quien hace la marca, el `p_desde` y que una visita completa no vuelve atrás. Lo que se
--      borra queda en audit_log (trg_audit_patient_visits, 0022), como siempre.
--      Qué implica deshacer el inicio de una visita vieja (lo que la 0155 quería evitar): se borra su
--      `real_date`, así que vuelve a contar como no hecha (ventana, KPI) y `sync_protocol_schedule` puede
--      volver a fecharla. Es lo que dice la confirmación del front: «se borra la fecha realizada».
--
--   2. registrar_visita_en_otra_fecha (0158/0159) — acepta también una visita EN CONCURRIÓ cuya llegada
--      fue OTRO DÍA (anterior a hoy). Es el caso de la captura: llegó el 10, no se inició la atención ese
--      día y hoy se quiere cargar. La fecha tiene que ser la del DÍA DE LA LLEGADA: el paciente vino ese
--      día y la atención fue ese día; otra fecha dejaría «llegó el 10, atendida el 8», o la visita en dos
--      días de la lista (el de la llegada y el de la fecha). La llegada (`arrived_at`) queda como estaba.
--      Llegada de HOY → se rechaza: para eso está «Iniciar atención». El resto es la 0159 tal cual.
--
-- La etapa de la visita queda igual que con la carga desde Por llegar: «En atención» con su fecha, sin
-- hora de inicio inventada (attended_at NULL), a nombre de quien la atendió y con cargada_en_otra_fecha_at
-- sellada. «Volver» desde ahí la devuelve a Concurrió (hubo llegada), con su llegada del día que era.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0159. IDEMPOTENTE: reintentar
-- es volver a correr el archivo entero.
--
-- ⚠️ SI EL EDITOR AVISA «tabla sin RLS», CORRERLA **SIN** ACTIVAR RLS. No crea ninguna tabla: el aviso toma
-- el `select … into` de PL/pgSQL por un SELECT INTO, y al activar RLS mete un ALTER TABLE en medio del
-- cuerpo de la función (así falló el primer intento de la 0159). Verificación por el cuerpo, al pie.
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. Las firmas no cambian y las dos funciones sólo aceptan
-- más casos: el front desplegado apaga «Volver» para una marca de otro día y no ofrece «Vino otro día» en
-- Concurrió, así que nunca llega a los casos nuevos. El front nuevo, sin esta migración, rebotaría con «Se
-- registró otro día» y «ya no está por llegar». Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Volver a la etapa anterior, también desde una marca de otro día ------------------------------
-- La 0158 tal cual, salvo lo marcado con «0160»: sin el bloque del mismo día y sin las variables que sólo
-- servían para él (attended_at, cargada_en_otra_fecha_at, la marca y el día de hoy).

create or replace function public.retroceder_etapa_visita(p_visit_id uuid, p_desde text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_protocol   uuid;
  v_arrived    timestamptz;
  v_real       date;
  v_ready      timestamptz;
  v_wants      boolean;
  v_seen       timestamptz;
  v_etapa      text;
  v_destino    text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  -- Columnas SIEMPRE calificadas: en PL/pgSQL los nombres sueltos compiten con las variables (0056/0058).
  -- `for update` sobre la visita: dos «Volver» simultáneos se ordenan, y el segundo ve la etapa nueva.
  select e.protocol_id, pv.arrived_at, pv.real_date, pv.ready_at, pv.wants_doctor, pv.doctor_seen_at
    into v_protocol, v_arrived, v_real, v_ready, v_wants, v_seen
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

  -- 0160: ya no hay «sólo la marca de HOY». Una marca de otro día se deshace igual; el front lo confirma
  -- antes diciendo de qué día es (ver la cabecera).

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
  'Deshace la última marca de etapa (0155): concurrió → por llegar (borra arrived_at y devuelve la citación si se había adelantado) o en atención → concurrió/por llegar (borra real_date, attended_at y cargada_en_otra_fecha_at). 0160: también una marca de OTRO día (antes, sólo la de hoy); el front lo confirma. p_desde = la etapa que mostraba la pantalla. Authz: la del que hace la marca. Rechaza si la visita tiene registros que dependen de la etapa. Devuelve la etapa destino. SECURITY DEFINER.';


-- 2 · Cargar en otra fecha, también desde Concurrió ------------------------------------------------
-- La 0159 tal cual, salvo lo marcado con «0160»: la guarda de etapa deja pasar una llegada de otro día, y
-- con llegada la fecha tiene que ser la de ese día.

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
  v_llego     date;   -- 0160: el día (argentino) de la llegada, si la hubo
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

  -- AUTHZ A MANO: la función es SECURITY DEFINER y la RLS no la mira (ver la cabecera de la 0158).
  if not (
    public.has_module('gerencia')
    or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(v_protocol))
  ) then
    raise exception 'No tenés permiso para cargar esta visita' using errcode = '42501';
  end if;

  -- 0160: por llegar, o en Concurrió con la llegada de OTRO día. Ya fechada o completa, no.
  if v_real is not null or v_ready is not null then
    raise exception 'La visita ya está en atención o completa. Actualizá y probá de nuevo.' using errcode = 'check_violation';
  end if;
  if v_arrived is not null then
    v_llego := (v_arrived at time zone 'America/Argentina/Buenos_Aires')::date;
    if v_llego >= v_hoy then
      raise exception 'Llegó hoy: iniciá la atención con el botón de siempre.' using errcode = 'check_violation';
    end if;
    -- Vino ese día: la atención fue ese día (ver la cabecera).
    if p_fecha is distinct from v_llego then
      raise exception 'Llegó el %: la visita se carga con esa fecha.', to_char(v_llego, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;
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

  -- Quien la atendió tiene que coordinar el estudio (como set_visit_coordinator, 0065) o ser de gerencia
  -- (0159: gerencia puede todo lo que pueden los roles inferiores). Pertenencia y nombre por separado: un
  -- usuario sin nombre cargado vale igual, y el front trata un coordinator_name nulo como «sin asignar».
  if p_atendio is null then
    raise exception 'Elegí quién atendió la visita.' using errcode = 'check_violation';
  end if;
  if not (
    exists (select 1 from public.protocol_coordinators pc
             where pc.protocol_id = v_protocol and pc.user_id = p_atendio)
    or exists (select 1 from public.user_module_roles umr
                where umr.user_id = p_atendio and umr.module = 'gerencia')
  ) then
    raise exception 'Esa persona no coordina este estudio ni es de gerencia.' using errcode = '23514';
  end if;
  select u.full_name into v_nombre from public.users u where u.id = p_atendio;

  -- La llegada, si la hubo, queda como estaba (0160).
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
  'Carga con una fecha pasada una visita POR LLEGAR (0158) o, desde la 0160, EN CONCURRIÓ con la llegada de otro día (la fecha es entonces la del día de la llegada, que queda como estaba): real_date = la fecha, sin hora de inicio (attended_at NULL), a nombre de quien la atendió —un coordinador del estudio o alguien de gerencia (0159)—, sin el «no vino», y sella cargada_en_otra_fecha_at. La fecha: anterior a hoy y no anterior a fecha_minima_para_cargar_visita. No cierra la visita. Authz: gerencia o quien coordina el estudio. SECURITY DEFINER.';

comment on column public.patient_visits.cargada_en_otra_fecha_at is
  'Cuándo se cargó la visita con una fecha pasada (registrar_visita_en_otra_fecha, 0158; desde la 0160 también desde Concurrió). La escribe sólo esa RPC y la limpia retroceder_etapa_visita al deshacer la carga. NULL = la visita se marcó en su día con los botones de etapa, o nunca se fechó.';

notify pgrst, 'reload schema';

-- Verificación · tras aplicar, los dos cuerpos tienen que ser los nuevos (no te fíes del comentario: puede
-- haber corrido aunque la función no). Las dos columnas tienen que decir true:
--   select
--     (select prosrc not like '%Se registró otro día%' from pg_proc where proname = 'retroceder_etapa_visita') as volver_0160,
--     (select prosrc like '%v_llego%' from pg_proc where proname = 'registrar_visita_en_otra_fecha') as cargar_0160;
