-- Spira · Migración 0119 — El estado del producto en investigación, por visita.
-- Plan: docs/plan-dispensacion-base-e-imp.md (Tanda 1: D1, D3, D9, D10, D11 + correcciones 1-4).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0118.
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. Ningún front desplegado pide lo que esto agrega; el
--    que no funciona sin ella es el front nuevo. El cambio del estado de la visita (D2) NO está acá: va
--    en la 0120, que se aplica DESPUÉS del deploy y no se pushea hasta entonces.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071). Los cuerpos usan
--    etiqueta con nombre para que el conteo de marcadores quede par a simple vista.
--
-- QUÉ HACE, en seis partes:
--
--   1 · `dispensations.delivered_by` + `delivered_by_name`. Hoy la entrega sólo sella CUÁNDO
--       (`delivered_at`, 0003); la fila del IP tiene que decir QUIÉN confirmó. Lo sella el trigger que
--       ya sella la fecha, pisando lo que mande el cliente, y entra al candado de la 0073.
--   2 · `patient_visits.lleva_ip`: "esta visita lleva IP", SELLADO cuando la visita queda fechada o se
--       inicia su atención. El cronograma puede cambiar después (lo dice la 0071:77-78, y pasaba de
--       verdad); mirarlo en vivo reabriría visitas cerradas. Las visitas ya fechadas quedan en NULL:
--       ese NULL ES el corte de fecha de D2/D3 — "sellada" quiere decir "fechada después de la 0119",
--       sin literal de fecha y sin la trampa del huso horario.
--   3 · `visit_ip_closures`: las dos salidas explícitas de una visita con IP que no va a tener su
--       entrega propia — "No corresponde" (D2) y "Entregado en otra visita" (D11).
--   4 · Arreglo de un bug que ya está en prod (D9): `create_dispensation_request` copiaba
--       `dispenses_ip` en CADA pedido, así que el segundo pedido de una visita con IP —el que nace
--       cuando Farmacia ya tomó el primero— salía "con IP" aunque fuera de pura base, y el mostrador le
--       pedía constancia impresa y kits que no existen. Misma firma: `create or replace`.
--   5 · `v_visit_ip_status`: LA regla (D10). Una fila por visita que lleva IP, con su estado. La leen
--       la fila del panel, la alerta (abajo) y el estado de la visita (0120). Nadie más la reescribe.
--   6 · `v_ip_delivery_alerts`: la alerta «IP sin entregar» (D3), 48 h después de la atención o del
--       pedido, lo que haya pasado primero. Agrupada por visita (patrón 0103), no descartable.
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Quién confirmó la entrega -----------------------------------------------------------------

alter table public.dispensations
  add column if not exists delivered_by uuid references public.users(id),
  add column if not exists delivered_by_name text;

comment on column public.dispensations.delivered_by is
  'Quién pasó la dispensación a entregada (0119). Lo sella trg_dispensation_delivered_at con auth.uid(), pisando lo que mande el cliente; el candado de la 0073 lo congela después. NULL en las entregas anteriores a la 0119.';
comment on column public.dispensations.delivered_by_name is
  'Snapshot del nombre de delivered_by (0119). Va copiado porque la RLS de users sólo deja ver el perfil propio: Coordinación no podría resolverlo.';

-- Reescrita entera (misma firma, el trigger de la 0003 sigue apuntando acá). SECURITY DEFINER para
-- resolver el nombre sin depender de la RLS de users; search_path fijo por lo mismo.
create or replace function public.set_delivered_at()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.status = 'entregada' and old.status is distinct from 'entregada' then
    if new.delivered_at is null then
      new.delivered_at := now();
    end if;
    -- Se PISA siempre: quién entrega no lo declara el cliente (anti-spoofing, como executed_by).
    new.delivered_by := auth.uid();
    new.delivered_by_name := (select u.full_name from public.users u where u.id = auth.uid());
  end if;
  return new;
end;
$fn$;

-- Cuerpo verbatim de la 0073 + delivered_by y delivered_by_name en el bloque de "ya entregada".
create or replace function public.guard_dispensation_immutable()
returns trigger language plpgsql as $fn$
begin
  if new.executed_by is distinct from old.executed_by
     or new.request_id is distinct from old.request_id
     or new.correlative_number is distinct from old.correlative_number then
    raise exception 'No se pueden modificar executed_by/request_id/correlative_number de una dispensación';
  end if;

  if old.status = 'entregada' and new.status is distinct from 'entregada' then
    raise exception 'No se puede revertir una dispensación ya entregada';
  end if;

  if old.status = 'entregada' then
    if new.ip_kits is distinct from old.ip_kits then
      raise exception 'No se pueden corregir los kits de IP de una dispensación ya entregada'
        using errcode = 'check_violation';
    end if;
    if new.delivered_at is distinct from old.delivered_at then
      raise exception 'No se puede cambiar la fecha de entrega de una dispensación ya entregada'
        using errcode = 'check_violation';
    end if;
    -- 0119: quién entregó también es el papel.
    if new.delivered_by is distinct from old.delivered_by
       or new.delivered_by_name is distinct from old.delivered_by_name then
      raise exception 'No se puede cambiar quién entregó una dispensación ya entregada'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$fn$;

comment on function public.guard_dispensation_immutable() is
  'Inmutabilidad de la dispensación: identidad (executed_by/request_id/correlative_number), no-reversión del estado, y una vez entregada ip_kits, delivered_at (0073), delivered_by y delivered_by_name (0119).';


-- 2 · El sello "esta visita lleva IP" -----------------------------------------------------------

alter table public.patient_visits
  add column if not exists lleva_ip boolean;

comment on column public.patient_visits.lleva_ip is
  'Si la visita lleva producto en investigación según el cronograma, SELLADO al quedar fechada (real_date) o al iniciar la atención (attended_at). Lo escribe sólo trg_seal_visit_lleva_ip (0119). NULL = la visita ya estaba fechada antes de la 0119: es el corte que usan v_visit_ip_status, la alerta de IP y el estado de la visita.';

create or replace function public.seal_visit_lleva_ip()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_se_fecha boolean;
begin
  -- La columna es del servidor. En un UPDATE, lo sellado no se toca y lo que nunca se selló tampoco
  -- se inventa: el cliente no puede apagar ni prender una alerta escribiendo este campo.
  --
  -- Dos ramas de plpgsql y NO una sola expresión con `tg_op = 'INSERT' or old.real_date ...`: en un
  -- INSERT no hay OLD, y una expresión se planifica entera sin importar por qué lado del OR vaya a
  -- salir (la misma trampa de audit_row, ver CLAUDE.md). Adentro de un IF de plpgsql, en cambio, la
  -- rama que no corre no se evalúa.
  if tg_op = 'UPDATE' then
    new.lleva_ip := old.lleva_ip;
    v_se_fecha := old.real_date is null and old.attended_at is null
                  and (new.real_date is not null or new.attended_at is not null);
  else
    new.lleva_ip := null;
    v_se_fecha := new.real_date is not null or new.attended_at is not null;
  end if;

  -- Se sella en la transición "sin fecha → fechada", y sólo ahí. Cubre los dos caminos que fechan
  -- una visita: start_visit_attention (0102, sella attended_at y real_date) y el registro que escribe
  -- real_date directo desde el front.
  if new.lleva_ip is null and v_se_fecha then
    new.lleva_ip := coalesce(
      (select vd.dispenses_ip from public.visit_definitions vd where vd.id = new.visit_def_id),
      false);
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_seal_visit_lleva_ip on public.patient_visits;
create trigger trg_seal_visit_lleva_ip
  before insert or update on public.patient_visits
  for each row execute function public.seal_visit_lleva_ip();


-- 3 · Las dos salidas explícitas ----------------------------------------------------------------

create table if not exists public.visit_ip_closures (
  id               uuid primary key default gen_random_uuid(),
  visit_id         uuid not null unique references public.patient_visits(id) on delete cascade,
  kind             text not null check (kind in ('no_corresponde', 'entregado_en_otra_visita')),
  reason           text check (reason in ('discontinuo_tratamiento', 'retirado_por_sponsor', 'otro')),
  reason_detail    text,
  dispensation_id  uuid references public.dispensations(id) on delete restrict,
  closed_by        uuid not null default auth.uid() references public.users(id),
  closed_by_name   text,
  created_at       timestamptz not null default now(),
  constraint visit_ip_closures_forma_chk check (
    (kind = 'no_corresponde' and reason is not null and dispensation_id is null
      and (reason <> 'otro' or nullif(btrim(coalesce(reason_detail, '')), '') is not null))
    or (kind = 'entregado_en_otra_visita' and dispensation_id is not null and reason is null)
  )
);

comment on table public.visit_ip_closures is
  'Cierre explícito del IP de una visita que no va a tener su entrega propia (0119): "No corresponde" con motivo de lista (D2) o "Entregado en otra visita" apuntando a la dispensación que lo cubrió (D11). Una por visita. Se escribe sólo por close_visit_ip / reopen_visit_ip.';

-- Una entrega cubre UNA visita: sin esto, la misma entrega de una VNP cerraría dos V distintas.
create unique index if not exists visit_ip_closures_dispensation_uq
  on public.visit_ip_closures (dispensation_id) where dispensation_id is not null;

drop trigger if exists trg_audit_visit_ip_closures on public.visit_ip_closures;
create trigger trg_audit_visit_ip_closures
  after insert or update or delete on public.visit_ip_closures
  for each row execute function public.audit_row();

alter table public.visit_ip_closures enable row level security;

-- La lectura DELEGA en la RLS de patient_visits: ve el cierre quien ve la visita, y sigue siendo así
-- aunque esa policy cambie. Copiar su condición acá dejaría dos públicos que se separan con el tiempo.
drop policy if exists "ver cierre de ip" on public.visit_ip_closures;
create policy "ver cierre de ip" on public.visit_ip_closures for select using (
  exists (select 1 from public.patient_visits pv where pv.id = visit_ip_closures.visit_id)
);
revoke insert, update, delete, truncate on public.visit_ip_closures from authenticated, anon;
grant select on public.visit_ip_closures to authenticated;


-- 4 · includes_ip: sólo si ESTE pedido lleva IP (bug de prod) ------------------------------------
-- Cuerpo verbatim de la 0071 salvo `v_includes_ip`. Misma firma → create or replace, sin sobrecarga.

create or replace function public.create_dispensation_request(
  p_visit_id uuid,
  p_items    jsonb,
  p_notes    text default null,
  p_origen   text default 'track',
  p_off_schedule_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_request_id uuid;
  v_item       jsonb;
  v_dispenses  boolean;
  v_dispenses_ip boolean;
  v_includes_ip boolean;  -- 0119
  v_off        boolean;
  v_protocol_id uuid;
  v_puede_track boolean;
  v_puede_pharma boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  if p_origen is null or p_origen not in ('track','pharma') then
    raise exception 'Origen de solicitud inválido' using errcode = 'check_violation';
  end if;

  v_puede_track := public.has_module('gerencia')
                   or public.has_min_role('track','admin')
                   or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id));
  v_puede_pharma := public.has_min_role('pharma','operator');

  if not (v_puede_track or v_puede_pharma) then
    raise exception 'No tenés permiso para solicitar dispensación de esta visita' using errcode = '42501';
  end if;

  if p_origen = 'pharma' and not v_puede_pharma then
    raise exception 'No podés registrar una solicitud como alta de farmacia' using errcode = '42501';
  end if;
  if p_origen = 'track' and not v_puede_track then
    raise exception 'No podés registrar una solicitud como pedido de coordinación' using errcode = '42501';
  end if;

  select coalesce(vd.dispenses, false), coalesce(vd.dispenses_ip, false), e.protocol_id
    into v_dispenses, v_dispenses_ip, v_protocol_id
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
    left join public.visit_definitions vd on vd.id = pv.visit_def_id
    where pv.id = p_visit_id;
  if not found then
    raise exception 'Visita inexistente' using errcode = '23503';
  end if;

  -- 0119 · El IP del cronograma se pide UNA vez. Si ya hay un pedido de IP vivo en la visita
  -- (solicitado, en preparación o entregado) o la visita tiene su IP cerrado, el pedido que nace
  -- ahora es de pura base: antes heredaba `includes_ip` igual, y el mostrador le exigía una constancia
  -- del IRT y kits que no existen. Un pedido rechazado o cancelado NO cuenta: ahí el IP sigue sin
  -- pedir y el pedido nuevo tiene que poder llevarlo.
  v_includes_ip := v_dispenses_ip
    and not exists (select 1 from public.dispensation_requests dr
                     where dr.visit_id = p_visit_id and dr.includes_ip
                       and dr.status in ('solicitada', 'preparando', 'atendida'))
    and not exists (select 1 from public.visit_ip_closures c where c.visit_id = p_visit_id);

  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    raise exception 'La solicitud tiene ítems con un formato inválido' using errcode = 'check_violation';
  end if;

  v_off := p_off_schedule_reason is not null and btrim(p_off_schedule_reason) <> '';

  if not v_off then
    if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 and not v_dispenses then
      raise exception 'Esta visita no entrega medicación' using errcode = 'check_violation';
    end if;
    if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 and not v_includes_ip then
      raise exception 'Un pedido sin renglones y sin producto en investigación no es un pedido'
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.dispensation_requests
      (visit_id, protocol_id, requested_by, status, source, notes, requested_by_module,
       includes_ip, off_schedule, off_schedule_reason)
    values
      (p_visit_id, v_protocol_id, auth.uid(), 'solicitada', 'manual',
       nullif(btrim(coalesce(p_notes,'')),''), p_origen,
       v_includes_ip, v_off, nullif(btrim(coalesce(p_off_schedule_reason,'')),''))
    returning id into v_request_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if jsonb_typeof(v_item) <> 'object'
       or nullif(btrim(coalesce(v_item->>'medication_id','')),'') is null
       or nullif(btrim(coalesce(v_item->>'quantity','')),'') is null then
      raise exception 'Cada ítem necesita medicamento y cantidad' using errcode = 'check_violation';
    end if;
    if (v_item->>'quantity')::integer <= 0 then
      raise exception 'La cantidad debe ser mayor a cero' using errcode = 'check_violation';
    end if;
    insert into public.dispensation_request_items (request_id, medication_id, quantity)
      values (v_request_id, (v_item->>'medication_id')::uuid, (v_item->>'quantity')::integer);
  end loop;

  return v_request_id;
end;
$fn$;
revoke all on function public.create_dispensation_request(uuid, jsonb, text, text, text) from public;
grant execute on function public.create_dispensation_request(uuid, jsonb, text, text, text) to authenticated;


-- 5 · LA regla: estado del IP por visita --------------------------------------------------------
--
--   estado            cuándo (en este orden de prioridad)
--   entregado         hay una dispensación ENTREGADA con kits de un pedido de IP de esta visita
--   no_corresponde    / entregado_en_otra_visita: hay cierre explícito
--   pedido            hay un pedido de IP solicitado o en preparación
--   rechazado         el último intento terminó rechazado por Farmacia (y no hay otro vivo)
--   sin_pedir         nada de lo anterior
--
-- Qué visitas tienen fila: las que llevan IP. Una visita todavía sin fecha mira el cronograma VIVO
-- (es lo previsto, y así la fila aparece el día de la visita antes de apretar "Iniciar atención"); una
-- fechada mira el SELLO. Además, cualquier visita con un pedido de IP no cancelado (la excepción fuera
-- de cronograma prende `includes_ip` al adjuntar la constancia).
--
-- `sellada` = la visita se fechó después de la 0119. SÓLO las selladas cuentan para la alerta y para
-- el estado de la visita (0120): así nada de lo cargado antes cambia.
--
-- Sin agregados en el nivel de arriba (los agregados viven en los LATERAL): así el `where visit_id =`
-- de quien la consulta —la 0120 la usa fila por fila— se empuja hasta patient_visits.

create or replace view public.v_visit_ip_status with (security_invoker = true) as
select
  pv.id                                  as visit_id,
  pv.enrollment_id,
  e.protocol_id,
  (pv.lleva_ip is not null)              as sellada,
  case
    when ent.dispensation_id is not null      then 'entregado'
    when c.kind is not null                   then c.kind
    when coalesce(ped.hay_abierto, false)     then 'pedido'
    when coalesce(ped.hay_rechazo, false)     then 'rechazado'
    else 'sin_pedir'
  end                                    as estado,
  (ent.dispensation_id is null and c.kind is null) as abierto,
  -- Ancla de la alerta: lo primero entre la atención (o, si no se apretó el botón, la fecha real a
  -- las 00:00 de Argentina) y el primer pedido de IP. `least` ignora los NULL.
  least(
    coalesce(pv.attended_at, (pv.real_date::timestamp at time zone 'America/Argentina/Buenos_Aires')),
    ped.pedido_at
  )                                      as ancla,
  ped.pedido_at,
  ped.solicitantes,
  ent.dispensation_id                    as entregado_dispensation_id,
  ent.delivered_at                       as entregado_at,
  ent.delivered_by_name                  as entregado_por_name,
  ent.ip_kits                            as entregado_ip_kits,
  c.kind                                 as cierre,
  c.reason                               as cierre_motivo,
  c.reason_detail                        as cierre_detalle,
  c.closed_by_name                       as cerrado_por_name,
  c.created_at                           as cerrado_at,
  od.delivered_at                        as otra_visita_entregado_at,
  od.ip_kits                             as otra_visita_ip_kits,
  ovd.code                               as otra_visita_code,
  ovd.name                               as otra_visita_name,
  ov.real_date                           as otra_visita_real_date
from public.patient_visits pv
join public.enrollments e on e.id = pv.enrollment_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
left join lateral (
  select
    min(dr.created_at) filter (where dr.status <> 'cancelada')              as pedido_at,
    bool_or(dr.status in ('solicitada', 'preparando'))                    as hay_abierto,
    bool_or(dr.status = 'rechazada')                                      as hay_rechazo,
    bool_or(dr.status <> 'cancelada')                                     as hay_vivo,
    array_agg(distinct dr.requested_by) filter (where dr.status <> 'cancelada') as solicitantes
  from public.dispensation_requests dr
  where dr.visit_id = pv.id and dr.includes_ip
) ped on true
left join lateral (
  select d.id as dispensation_id, d.delivered_at, d.delivered_by_name, d.ip_kits
  from public.dispensation_requests dr
  join public.dispensations d on d.request_id = dr.id
  where dr.visit_id = pv.id and dr.includes_ip
    and d.status = 'entregada' and d.ip_kits is not null
  order by d.delivered_at asc
  limit 1
) ent on true
left join public.visit_ip_closures c on c.visit_id = pv.id
left join public.dispensations od on od.id = c.dispensation_id
left join public.dispensation_requests odr on odr.id = od.request_id
left join public.patient_visits ov on ov.id = odr.visit_id
left join public.visit_definitions ovd on ovd.id = ov.visit_def_id
where
  (case
     when pv.real_date is null and pv.attended_at is null then coalesce(vd.dispenses_ip, false)
     else coalesce(pv.lleva_ip, false)
   end)
  or coalesce(ped.hay_vivo, false)
  or c.kind is not null;

comment on view public.v_visit_ip_status is
  'Estado del producto en investigación de cada visita que lo lleva (0119, D10): entregado · no_corresponde · entregado_en_otra_visita · pedido · rechazado · sin_pedir. ÚNICA fuente de la regla: la leen la fila del panel de Procedimientos, v_ip_delivery_alerts y el estado de la visita (0120). `sellada` = fechada después de la 0119; sólo esas cuentan para la alerta y el cierre de la visita.';

revoke all on public.v_visit_ip_status from anon;
grant select on public.v_visit_ip_status to authenticated;


-- 6 · La alerta «IP sin entregar» ---------------------------------------------------------------
-- Una fila por visita (la vista de arriba ya lo es): un pedido cancelado + uno nuevo no la duplican.
-- Columnas espejo de v_procedure_report_alerts (0103) para que los filtros de Pendientes decidan
-- igual sobre las tres listas.

create or replace view public.v_ip_delivery_alerts with (security_invoker = true) as
select
  s.visit_id,
  s.estado,
  s.ancla,
  (s.ancla + interval '48 hours')        as vence_at,
  s.pedido_at,
  s.solicitantes,
  e.protocol_id, e.patient_id,
  pr.code  as protocol_code, pr.name as protocol_name,
  pac.code as patient_code,  pac.full_name as patient_name,
  vd.name  as visit_name,    vd.code as visit_code,
  pv.real_date,
  coalesce(pv.treating_physician, pac.treating_physician) as treating_physician,
  pv.coordinator_id,
  pv.coordinator_name
from public.v_visit_ip_status s
join public.patient_visits pv on pv.id = s.visit_id
join public.enrollments e     on e.id = pv.enrollment_id
join public.protocols pr      on pr.id = e.protocol_id
join public.patients pac      on pac.id = e.patient_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
where s.sellada
  and s.abierto
  and s.ancla is not null
  and now() > s.ancla + interval '48 hours';

comment on view public.v_ip_delivery_alerts is
  'Alerta «IP sin entregar» (0119, D3): visita sellada con el IP abierto (sin pedir, pedido o rechazado) 48 h después de la atención o del primer pedido de IP, lo que haya pasado primero. No se descarta: la apagan la entrega, "No corresponde" o "Entregado en otra visita". RLS de las tablas de abajo (security_invoker).';

revoke all on public.v_ip_delivery_alerts from anon;
grant select on public.v_ip_delivery_alerts to authenticated;


-- 7 · RPCs de cierre ----------------------------------------------------------------------------
-- AUTHZ espejo de create_dispensation_request: gerencia, admin de Track, u operador de Track que
-- coordina la visita. `coordina_visita` pelado dejaría entrar a un viewer.

create or replace function public.close_visit_ip(
  p_visit_id        uuid,
  p_kind            text,
  p_reason          text default null,
  p_detail          text default null,
  p_dispensation_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id          uuid;
  v_enrollment  uuid;
  v_estado      text;
  v_disp_visit  uuid;
  v_disp_enr    uuid;
  v_disp_lleva  boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  if not (public.has_module('gerencia')
          or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id))) then
    raise exception 'No tenés permiso para cerrar el producto en investigación de esta visita'
      using errcode = '42501';
  end if;

  select s.estado, s.enrollment_id into v_estado, v_enrollment
    from public.v_visit_ip_status s where s.visit_id = p_visit_id;
  if not found then
    raise exception 'Esta visita no lleva producto en investigación' using errcode = 'check_violation';
  end if;
  if v_estado = 'entregado' then
    raise exception 'El producto en investigación de esta visita ya se entregó' using errcode = 'check_violation';
  end if;
  if v_estado in ('no_corresponde', 'entregado_en_otra_visita') then
    raise exception 'El producto en investigación de esta visita ya está cerrado. Deshacé el cierre para cambiarlo.'
      using errcode = 'check_violation';
  end if;
  if v_estado = 'pedido' then
    raise exception 'Hay un pedido de producto en investigación en curso: cancelalo o esperá que Farmacia lo resuelva.'
      using errcode = 'check_violation';
  end if;

  if p_kind = 'no_corresponde' then
    if p_reason is null or p_reason not in ('discontinuo_tratamiento', 'retirado_por_sponsor', 'otro') then
      raise exception 'Elegí un motivo' using errcode = 'check_violation';
    end if;
    if p_reason = 'otro' and nullif(btrim(coalesce(p_detail, '')), '') is null then
      raise exception 'Contá brevemente el motivo' using errcode = 'check_violation';
    end if;
    if p_dispensation_id is not null then
      raise exception 'Un "No corresponde" no apunta a una entrega' using errcode = 'check_violation';
    end if;

  elsif p_kind = 'entregado_en_otra_visita' then
    if p_dispensation_id is null then
      raise exception 'Elegí la entrega que cubrió esta visita' using errcode = 'check_violation';
    end if;
    select dr.visit_id, pv.enrollment_id, coalesce(pv.lleva_ip, false)
      into v_disp_visit, v_disp_enr, v_disp_lleva
      from public.dispensations d
      join public.dispensation_requests dr on dr.id = d.request_id
      join public.patient_visits pv on pv.id = dr.visit_id
     where d.id = p_dispensation_id
       and d.status = 'entregada' and d.ip_kits is not null;
    if not found then
      raise exception 'Esa entrega no existe o no es una entrega de producto en investigación'
        using errcode = 'check_violation';
    end if;
    if v_disp_enr is distinct from v_enrollment then
      raise exception 'Esa entrega es de otro enrolamiento' using errcode = 'check_violation';
    end if;
    if v_disp_visit = p_visit_id then
      raise exception 'Esa entrega es de esta misma visita' using errcode = 'check_violation';
    end if;
    -- Una V con IP propio por cronograma no le presta su entrega a otra: serían dos IP con un kit.
    if v_disp_lleva then
      raise exception 'Esa entrega corresponde al producto en investigación de su propia visita'
        using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.visit_ip_closures c where c.dispensation_id = p_dispensation_id) then
      raise exception 'Esa entrega ya cubre otra visita' using errcode = 'check_violation';
    end if;
    p_reason := null;
    p_detail := null;

  else
    raise exception 'Tipo de cierre inválido' using errcode = 'check_violation';
  end if;

  insert into public.visit_ip_closures
      (visit_id, kind, reason, reason_detail, dispensation_id, closed_by, closed_by_name)
    values
      (p_visit_id, p_kind, p_reason, nullif(btrim(coalesce(p_detail, '')), ''), p_dispensation_id,
       auth.uid(), (select u.full_name from public.users u where u.id = auth.uid()))
    returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.close_visit_ip(uuid, text, text, text, uuid) from public;
grant execute on function public.close_visit_ip(uuid, text, text, text, uuid) to authenticated;

-- Deshacer: un cierre equivocado no puede quedar para siempre en un registro clínico. El borrado
-- queda en audit_log (trigger de arriba), con quién y cuándo.
create or replace function public.reopen_visit_ip(p_visit_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  if not (public.has_module('gerencia')
          or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id))) then
    raise exception 'No tenés permiso para reabrir el producto en investigación de esta visita'
      using errcode = '42501';
  end if;

  delete from public.visit_ip_closures c where c.visit_id = p_visit_id;
  if not found then
    raise exception 'Esta visita no tiene un cierre de producto en investigación' using errcode = 'check_violation';
  end if;
end;
$fn$;

revoke all on function public.reopen_visit_ip(uuid) from public;
grant execute on function public.reopen_visit_ip(uuid) to authenticated;

notify pgrst, 'reload schema';
