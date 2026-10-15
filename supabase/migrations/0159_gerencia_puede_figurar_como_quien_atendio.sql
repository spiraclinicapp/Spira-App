-- Spira · Migración 0159 — «Vino otro día»: alguien de gerencia también puede figurar como quien atendió
-- ============================================================================
-- Regla del Director (2026-10-14): **gerencia puede hacer todo lo que pueden hacer los roles inferiores.**
--
-- La 0158 pedía que quien atendió una visita cargada en otra fecha coordinara el estudio
-- (`protocol_coordinators`). En un estudio sin coordinadores asignados —TEST-QA, en el QA de la 0158—
-- «Vino otro día» no se podía usar, y alguien de gerencia que atendió la visita no podía nombrarse a sí
-- mismo. Desde ésta, quien la atendió puede ser un coordinador del estudio **o alguien de gerencia**.
--
-- Cambia UNA cosa: la guarda de `p_atendio` en `registrar_visita_en_otra_fecha`. El resto de la función es
-- la 0158 tal cual (marcado con «0159» lo que cambia). Quién puede LLAMARLA no cambia: ya era gerencia o un
-- operador que coordina el estudio.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0158. IDEMPOTENTE.
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. La firma no cambia y la función sólo acepta más casos: el
-- front desplegado sigue andando igual. El front nuevo ofrece a gerencia en «¿Quién la atendió?»; sin esta
-- migración, elegirla respondería «Esa persona no coordina este estudio».
-- ============================================================================

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

  -- AUTHZ A MANO: la función es SECURITY DEFINER y la RLS no la mira (ver la cabecera de la 0158).
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

  -- Quien la atendió tiene que coordinar el estudio (como set_visit_coordinator, 0065) o ser de gerencia
  -- (0159: gerencia puede todo lo que pueden los roles inferiores). Pertenencia y nombre por separado: un
  -- usuario sin nombre cargado vale igual, y el front trata un coordinator_name nulo como «sin asignar».
  if p_atendio is null then
    raise exception 'Elegí quién atendió la visita.' using errcode = 'check_violation';
  end if;
  if not (
    exists (select 1 from public.protocol_coordinators pc
             where pc.protocol_id = v_protocol and pc.user_id = p_atendio)
    or exists (select 1 from public.user_module_roles umr                                   -- 0159
                where umr.user_id = p_atendio and umr.module = 'gerencia')
  ) then
    raise exception 'Esa persona no coordina este estudio ni es de gerencia.' using errcode = '23514';  -- 0159
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
  'Carga una visita POR LLEGAR con una fecha pasada (0158): real_date = la fecha, sin hora de inicio (attended_at NULL), a nombre de quien la atendió —un coordinador del estudio o, desde la 0159, alguien de gerencia—, sin el «no vino», y sella cargada_en_otra_fecha_at. La fecha: anterior a hoy y no anterior a fecha_minima_para_cargar_visita. No cierra la visita. Authz: gerencia o quien coordina el estudio. SECURITY DEFINER.';

notify pgrst, 'reload schema';

-- Verificación · tras aplicar, el comentario de la función tiene que nombrar la 0159:
--   select obj_description('public.registrar_visita_en_otra_fecha(uuid, date, uuid)'::regprocedure);
