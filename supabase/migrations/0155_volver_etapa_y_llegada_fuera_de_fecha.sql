-- Spira · Migración 0155 — Coordinación: volver a la etapa anterior y registrar la llegada fuera de fecha
-- ============================================================================
-- Dos RPC nuevas para el botón de etapa dividido (handoff `docs/design_handoff_boton_etapa/`, plan en
-- `docs/plan-boton-etapa-dividido.md`). No se toca ninguna función, tabla ni vista existente.
--
--   1. retroceder_etapa_visita(visita, desde) — «Volver a Concurrió / Por llegar». Hasta hoy una marca
--      de etapa era irreversible desde la pantalla: si Recepción marcaba la llegada del paciente
--      equivocado, la visita quedaba «en curso» sin haber ocurrido. Era la parte (a) del TODO «Visitas ·
--      retroceder una etapa…»; la parte (b), el historial, sigue pendiente.
--
--   2. registrar_llegada_hoy(visita) — la llegada de una visita citada para OTRO día, que además mueve
--      la citación a hoy. Sin mover la fecha, `motivosDelDia` (front) sostiene la citación cuando la
--      llegada es anterior al día citado, y la visita salía en DOS días: hoy (llegó) y el día citado
--      (como si se la esperara). Si la citación es hoy, el front sigue usando `mark_arrived`.
--
-- QUIÉN PUEDE DESHACER UNA MARCA: el mismo que puede hacerla. Era lo que bloqueaba el TODO, y la regla
-- simétrica no habilita a nadie que hoy no pueda marcar:
--   · la llegada        → gerencia o track operator+            (como mark_arrived, 0023/0067)
--   · el inicio de atención → gerencia o quien coordina el estudio (como start_visit_attention, 0102)
--
-- QUÉ NO SE PUEDE DESHACER Y POR QUÉ (las guardas): volver atrás dice «esto no pasó». Si la visita ya
-- tiene registros que dependen de que haya pasado —procedimientos realizados, pendientes para otro día,
-- una continuación o un retest, una dispensación, IP entregado o cerrado, atención médica—, deshacer la
-- marca los dejaría colgados de algo que según la pantalla nunca ocurrió. Se rechaza con un mensaje en
-- castellano que dice qué hay que deshacer primero. Desde «Fin de atención» no se vuelve: el handoff pone
-- «Pedir retest» en ese lugar.
--
-- `p_desde` es la etapa que la pantalla MOSTRABA. Si la visita ya cambió (otra pestaña, un doble clic),
-- se rechaza en vez de retroceder dos etapas de una.
--
-- La etapa se deriva igual que en `v_patient_visits` (0068/0102): ready_at → fin, real_date → inicio,
-- arrived_at → concurrió. Por eso deshacer el inicio de atención borra `real_date` (y el sello
-- `attended_at`): es lo que la hace estar en esa etapa. El coordinador que selló la 0102 queda — no se
-- sabe cuál había antes. `lleva_ip` (0119) tampoco se toca: el trigger lo conserva, y al volver a fechar
-- no se resella. `arrived_by` lo limpia solo `sello_autor` (0143) cuando `arrived_at` vuelve a null.
-- Todo UPDATE de patient_visits queda en `audit_log` (trg_audit_patient_visits, 0022).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0154. IDEMPOTENTE: reintentar
-- es volver a correr el archivo entero.
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. Ningún front desplegado llama a estas funciones; el que
-- no funciona sin ellas es el nuevo («Volver a…» y la llegada fuera de fecha responderían PGRST202).
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Volver a la etapa anterior -----------------------------------------------------------------

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
  -- permiso de quien la hace (ver la cabecera).
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

  -- Desde «En atención» se vuelve a «Concurrió» si hubo llegada, o a «Por llegar» si no: las visitas
  -- fechadas antes de que existiera la marca de llegada no la tienen.
  v_destino := case
    when v_etapa = 'inicio_atencion' and v_arrived is not null then 'concurrio_al_centro'
    else 'por_llegar'
  end;

  -- Las guardas: registros que dependen de que la etapa haya pasado (ver la cabecera).
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
  if exists (select 1 from public.dispensation_requests dr where dr.visit_id = p_visit_id)
     or exists (select 1 from public.track_dispensations td where td.patient_visit_id = p_visit_id) then
    raise exception 'Tiene una dispensación registrada: no se puede volver atrás.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.ip_units u where u.dispensed_visit_id = p_visit_id)
     or exists (select 1 from public.visit_ip_closures ic where ic.visit_id = p_visit_id) then
    raise exception 'Tiene el IP entregado o cerrado: no se puede volver atrás.' using errcode = 'check_violation';
  end if;
  if v_destino = 'por_llegar' and (coalesce(v_wants, false) or v_seen is not null) then
    raise exception 'Tiene atención médica pedida o dada. Quitá el pedido antes de deshacer la llegada.' using errcode = 'check_violation';
  end if;

  if v_etapa = 'concurrio_al_centro' then
    update public.patient_visits pv
       set arrived_at = null
     where pv.id = p_visit_id;
  else
    update public.patient_visits pv
       set real_date = null,
           attended_at = null
     where pv.id = p_visit_id;
  end if;

  return v_destino;
end;
$fn$;

revoke all on function public.retroceder_etapa_visita(uuid, text) from public;
revoke all on function public.retroceder_etapa_visita(uuid, text) from anon;
grant execute on function public.retroceder_etapa_visita(uuid, text) to authenticated;
comment on function public.retroceder_etapa_visita(uuid, text) is
  'Deshace la última marca de etapa (0155): concurrió → por llegar (borra arrived_at) o en atención → concurrió/por llegar (borra real_date y attended_at). p_desde = la etapa que mostraba la pantalla. Authz: la del que hace la marca. Rechaza si la visita tiene registros que dependen de la etapa. Devuelve la etapa destino. SECURITY DEFINER.';


-- 2 · Registrar la llegada de una visita citada para otro día -------------------------------------

create or replace function public.registrar_llegada_hoy(p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_existe  boolean;
  v_arrived timestamptz;
  v_real    date;
  v_ready   timestamptz;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  -- El permiso de la LLEGADA (mark_arrived): mover la citación es parte del mismo hecho —«vino hoy»—,
  -- no una reprogramación aparte.
  if not (public.has_module('gerencia') or public.has_min_role('track', 'operator')) then
    raise exception 'No tenés permiso para registrar la llegada' using errcode = '42501';
  end if;

  select true, pv.arrived_at, pv.real_date, pv.ready_at
    into v_existe, v_arrived, v_real, v_ready
    from public.patient_visits pv
   where pv.id = p_visit_id
     for update of pv;
  if v_existe is null then
    raise exception 'Esa visita ya no existe' using errcode = '23503';
  end if;
  if v_arrived is not null or v_real is not null or v_ready is not null then
    raise exception 'La visita ya no está por llegar. Actualizá y probá de nuevo.' using errcode = 'check_violation';
  end if;

  -- El día ARGENTINO y no `current_date`, que es UTC: después de las 21:00 sería mañana (ver 0102).
  -- Limpia la falta como mark_arrived (0067): si al final concurrió, gana sobre «No vino».
  update public.patient_visits pv
     set arrived_at     = now(),
         estimated_date = (now() at time zone 'America/Argentina/Buenos_Aires')::date,
         no_show_at     = null,
         no_show_by     = null
   where pv.id = p_visit_id;
end;
$fn$;

revoke all on function public.registrar_llegada_hoy(uuid) from public;
revoke all on function public.registrar_llegada_hoy(uuid) from anon;
grant execute on function public.registrar_llegada_hoy(uuid) to authenticated;
comment on function public.registrar_llegada_hoy(uuid) is
  'Registra la llegada de una visita citada para otro día y mueve su citación (estimated_date) a hoy, en un solo paso (0155). Sólo desde «por llegar». Authz: la de mark_arrived (gerencia o track operator+). SECURITY DEFINER.';


-- Verificación · tras aplicar, las dos tienen que existir:
--   select proname from pg_proc where proname in ('retroceder_etapa_visita', 'registrar_llegada_hoy');

notify pgrst, 'reload schema';
