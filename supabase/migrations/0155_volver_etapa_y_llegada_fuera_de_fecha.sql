-- Spira · Migración 0155 — Coordinación: volver a la etapa anterior y adelantar la llegada
-- ============================================================================
-- Lo que necesita el botón de etapa dividido (handoff `docs/design_handoff_boton_etapa/`, plan en
-- `docs/plan-boton-etapa-dividido.md`). Suma una columna y dos RPC; no cambia nada de lo existente.
--
--   1. patient_visits.citacion_antes_de_adelantar (date, nullable): la citación que tenía la visita
--      antes de que se registrara la llegada ADELANTADA. Sólo la escribe la RPC 3 y sólo la lee la 2,
--      para devolverle su fecha a la visita si la llegada se deshace. No se expone en las vistas.
--
--   2. retroceder_etapa_visita(visita, desde) — «Volver a Concurrió / Por llegar». Hasta hoy una marca
--      de etapa era irreversible desde la pantalla: si Recepción marcaba la llegada del paciente
--      equivocado, la visita quedaba «en curso» sin haber ocurrido. Es la parte (a) del TODO «Visitas ·
--      retroceder una etapa…»; la parte (b), el historial, sigue pendiente.
--
--   3. registrar_llegada_adelantada(visita) — el paciente llega ANTES del día citado: se registra la
--      llegada y la citación pasa a hoy, en un solo paso. Sin mover la fecha, `motivosDelDia` (front)
--      sostiene la citación (la llegada es anterior a ella) y la visita salía en dos días: hoy, que
--      vino, y el día citado, como si se lo esperara. Una citación PASADA no se toca: llegar tarde da
--      la citación por cumplida (#460) y «citada el 8, vino el 10» es un dato. Citada hoy o antes, el
--      front sigue usando `mark_arrived`.
--
-- QUIÉN PUEDE DESHACER UNA MARCA: el mismo que puede hacerla, y no habilita a nadie nuevo:
--   · la llegada            → gerencia o track operator+              (como mark_arrived, 0023/0067)
--   · el inicio de atención → gerencia o quien coordina el estudio    (como start_visit_attention, 0102)
-- Adelantar la llegada MUEVE LA CITACIÓN, y mover fechas es de quien coordina el estudio (la policy
-- de UPDATE «track modifica visitas propias», 0009/0146): ése es su permiso. El resto de Recepción
-- sigue registrando la llegada con `mark_arrived`, sin mover la fecha.
--
-- SÓLO EL MISMO DÍA. Volver atrás corrige un clic equivocado; no reescribe la historia. Deshacer el
-- inicio de atención de una visita vieja borraría su `real_date`: volvería a encender la ventana
-- vencida, bajaría los KPI de visitas hechas y le devolvería la fecha a `sync_protocol_schedule`. Así
-- que se deshace la marca hecha HOY (día argentino): la llegada por `arrived_at`, el inicio por su
-- sello `attended_at` (0102) — un inicio sin sello es anterior a la 0102 y no se deshace desde acá.
--
-- QUÉ NO SE PUEDE DESHACER Y POR QUÉ (las guardas): volver atrás dice «esto no pasó». Si la visita ya
-- tiene registros que dependen de que haya pasado —procedimientos realizados, pendientes para otro día,
-- una continuación o un retest, una dispensación preparándose o entregada, IP entregado o cerrado,
-- atención médica—, deshacer la marca los dejaría colgados de algo que según la pantalla nunca ocurrió.
-- Se rechaza con un mensaje que dice qué hay que deshacer primero. Un pedido de dispensación SOLICITADO,
-- rechazado o cancelado no frena: se puede pedir antes de que el paciente llegue. Desde «Fin de
-- atención» no se vuelve: el handoff pone «Pedir retest» en ese lugar.
--
-- `p_desde` es la etapa que la pantalla MOSTRABA. Si la visita ya cambió (otra pestaña, un doble clic),
-- se rechaza en vez de retroceder dos etapas de una.
--
-- La etapa se deriva igual que en `v_patient_visits` (0068/0102): ready_at → fin, real_date → inicio,
-- arrived_at → concurrió. Por eso deshacer el inicio de atención borra `real_date` (y el sello
-- `attended_at`): es lo que la hace estar en esa etapa. El coordinador que selló la 0102 queda: el
-- anterior sólo está en `audit_log`, y una RPC que lee la auditoría para reescribir datos es frágil.
-- `lleva_ip` (0119) tampoco se toca: el trigger lo conserva y `v_ip_delivery_alerts` exige fecha, así
-- que no dispara nada. `arrived_by` lo limpia `sello_autor` (0143) cuando `arrived_at` vuelve a null.
-- Todo UPDATE de patient_visits queda en `audit_log` (trg_audit_patient_visits, 0022).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0154. IDEMPOTENTE: reintentar
-- es volver a correr el archivo entero.
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. Ningún front desplegado lee la columna ni llama a
-- estas funciones; el que no funciona sin ellas es el nuevo («Volver a…» y la llegada adelantada
-- responderían PGRST202). Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · La citación de antes de adelantar ------------------------------------------------------------

alter table public.patient_visits
  add column if not exists citacion_antes_de_adelantar date;
comment on column public.patient_visits.citacion_antes_de_adelantar is
  'La citación (estimated_date) que tenía la visita antes de registrar la llegada adelantada (0155). La escribe sólo registrar_llegada_adelantada y la consume retroceder_etapa_visita para devolverle la fecha si la llegada se deshace. NULL = no se adelantó.';


-- 2 · Volver a la etapa anterior -----------------------------------------------------------------

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
  select e.protocol_id, pv.arrived_at, pv.attended_at, pv.real_date, pv.ready_at, pv.wants_doctor, pv.doctor_seen_at
    into v_protocol, v_arrived, v_attended, v_real, v_ready, v_wants, v_seen
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

  -- Sólo la marca de HOY (ver la cabecera). Un inicio sin sello es anterior a la 0102.
  v_marca := case when v_etapa = 'concurrio_al_centro' then v_arrived else v_attended end;
  if v_marca is null or (v_marca at time zone 'America/Argentina/Buenos_Aires')::date <> v_hoy then
    raise exception 'Se registró otro día: ya no se deshace desde acá.' using errcode = 'check_violation';
  end if;

  -- Desde «En atención» se vuelve a «Concurrió» si hubo llegada, o a «Por llegar» si no.
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
    -- Si la llegada fue adelantada, la visita recupera su citación — salvo que alguien la haya movido
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
  'Deshace la marca de etapa hecha HOY (0155): concurrió → por llegar (borra arrived_at y devuelve la citación si se había adelantado) o en atención → concurrió/por llegar (borra real_date y attended_at). p_desde = la etapa que mostraba la pantalla. Authz: la del que hace la marca. Rechaza si la visita tiene registros que dependen de la etapa. Devuelve la etapa destino. SECURITY DEFINER.';


-- 3 · Registrar la llegada adelantada --------------------------------------------------------------

create or replace function public.registrar_llegada_adelantada(p_visit_id uuid)
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
  v_citacion  date;
  v_hoy       date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select e.protocol_id, pv.arrived_at, pv.real_date, pv.ready_at, pv.estimated_date
    into v_protocol, v_arrived, v_real, v_ready, v_citacion
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id
     for update of pv;
  if v_protocol is null then
    raise exception 'Esa visita ya no existe' using errcode = '23503';
  end if;

  -- Mover la citación es de quien coordina el estudio (o gerencia): la regla de la policy de UPDATE.
  if not (
    public.has_module('gerencia')
    or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(v_protocol))
  ) then
    raise exception 'No tenés permiso para mover la fecha de esta visita' using errcode = '42501';
  end if;

  if v_arrived is not null or v_real is not null or v_ready is not null then
    raise exception 'La visita ya no está por llegar. Actualizá y probá de nuevo.' using errcode = 'check_violation';
  end if;
  if v_citacion is not null and v_citacion <= v_hoy then
    raise exception 'La visita no está citada para más adelante: registrá la llegada directamente.' using errcode = 'check_violation';
  end if;

  -- El día ARGENTINO y no `current_date`, que es UTC: después de las 21:00 sería mañana (ver 0102).
  -- Limpia la falta como mark_arrived (0067): si al final concurrió, gana sobre «No vino».
  update public.patient_visits pv
     set arrived_at                  = now(),
         citacion_antes_de_adelantar = pv.estimated_date,
         estimated_date              = v_hoy,
         no_show_at                  = null,
         no_show_by                  = null
   where pv.id = p_visit_id;
end;
$fn$;

revoke all on function public.registrar_llegada_adelantada(uuid) from public;
revoke all on function public.registrar_llegada_adelantada(uuid) from anon;
grant execute on function public.registrar_llegada_adelantada(uuid) to authenticated;
comment on function public.registrar_llegada_adelantada(uuid) is
  'Registra la llegada de una visita citada para MÁS ADELANTE (o sin fecha) y mueve su citación a hoy, en un solo paso; guarda la anterior en citacion_antes_de_adelantar (0155). Sólo desde «por llegar». Authz: gerencia o quien coordina el estudio (mover fechas). SECURITY DEFINER.';


-- Verificación · tras aplicar, las dos funciones y la columna tienen que existir:
--   select proname from pg_proc where proname in ('retroceder_etapa_visita', 'registrar_llegada_adelantada');
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'patient_visits' and column_name = 'citacion_antes_de_adelantar';

notify pgrst, 'reload schema';
