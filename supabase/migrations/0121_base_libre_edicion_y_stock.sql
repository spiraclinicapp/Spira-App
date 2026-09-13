-- Spira · Migración 0121 — Medicación de base: libre del cronograma, editable y con stock a la vista.
-- Plan: docs/plan-dispensacion-base-e-imp.md (Tanda 2: D4, D5, D6, D9 + correcciones 6-10).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0120.
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. El front desplegado sigue andando con esto:
--    · manda motivo para la base fuera de cronograma, y el motivo se sigue aceptando;
--    · nunca escribe directo en dispensation_requests / dispensation_request_items (todo va por RPC
--      SECURITY DEFINER), así que cerrar esas policies no le quita nada;
--    · `dispensation_audit_trail` conserva firma y columnas.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- QUÉ HACE:
--   1 · Dos columnas en el pedido: `base_sin_cronograma` (el sello informativo de D4/D9, que NO es
--       `off_schedule`: ese sigue siendo "excepción declarada con motivo" y la única puerta del IP) y
--       `prepared_by_name` (Coordinación no puede leer nombres de `users`).
--   2 · La base ya no exige cronograma: create_dispensation_request y add_dispensation_items, misma
--       firma. Sellan `base_sin_cronograma` cuando la visita no la tenía prevista.
--   3 · Editar el pedido mientras está `solicitada`: cambiar cantidad y quitar un renglón (D5).
--   4 · Auditoría de los renglones del pedido: nunca la tuvieron (0003 no la creó). Sin el escaneo.
--   5 · El historial de Farmacia encuentra también los renglones BORRADOS.
--   6 · Se cierra la escritura directa de Track sobre el pedido y sus renglones.
--   7 · `stock_de_la_visita`: el stock que Coordinación puede ver, sin lotes ni vencimientos (D6).
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Columnas ------------------------------------------------------------------------------------

alter table public.dispensation_requests
  add column if not exists base_sin_cronograma boolean not null default false,
  add column if not exists prepared_by_name text;

comment on column public.dispensation_requests.base_sin_cronograma is
  'true = el pedido lleva medicación de base en una visita cuyo cronograma no la preveía (0121, D4). Lo sella el servidor; es un DATO para el comprobante y el historial, no una excepción: no pide motivo y NO habilita adjuntar IP (eso sigue siendo off_schedule + motivo).';
comment on column public.dispensation_requests.prepared_by_name is
  'Snapshot del nombre de prepared_by (0121). Lo mantiene trg_seal_prepared_by_name en cada cambio de prepared_by. Existe porque la RLS de users sólo deja ver el perfil propio y Coordinación tiene que poder decir quién tiene el pedido.';

create or replace function public.seal_prepared_by_name()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  -- Un solo lugar para las tres funciones que mueven prepared_by (tomar, reasignar, liberar), en vez
  -- de reescribir cada una: si mañana aparece una cuarta, el nombre la sigue sola.
  if new.prepared_by is null then
    new.prepared_by_name := null;
  elsif tg_op = 'INSERT' then
    new.prepared_by_name := (select u.full_name from public.users u where u.id = new.prepared_by);
  elsif new.prepared_by is distinct from old.prepared_by or new.prepared_by_name is null then
    new.prepared_by_name := (select u.full_name from public.users u where u.id = new.prepared_by);
  else
    new.prepared_by_name := old.prepared_by_name;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_seal_prepared_by_name on public.dispensation_requests;
create trigger trg_seal_prepared_by_name
  before insert or update on public.dispensation_requests
  for each row execute function public.seal_prepared_by_name();

-- Los pedidos que ya tienen preparador hoy: se completan una vez. El UPDATE pasa por el trigger de
-- arriba (prepared_by_name null → lo resuelve) y queda en audit_log.
-- `trg_requests_updated_at` se apaga alrededor, como en la 0071 y la 0082: `updated_at` ordena el
-- historial de Farmacia (0117) y completar un nombre no es una novedad del pedido.
alter table public.dispensation_requests disable trigger trg_requests_updated_at;
update public.dispensation_requests dr
   set prepared_by_name = (select u.full_name from public.users u where u.id = dr.prepared_by)
 where dr.prepared_by is not null and dr.prepared_by_name is null;
alter table public.dispensation_requests enable trigger trg_requests_updated_at;


-- 2 · La base, libre del cronograma --------------------------------------------------------------
-- Cuerpo de la 0119 + D4/D9. Misma firma → create or replace, sin sobrecarga.

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
  v_includes_ip boolean;
  v_off        boolean;
  v_protocol_id uuid;
  v_puede_track boolean;
  v_puede_pharma boolean;
  v_n_items    integer;
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

  v_includes_ip := v_dispenses_ip
    and not exists (select 1 from public.dispensation_requests dr
                     where dr.visit_id = p_visit_id and dr.includes_ip
                       and dr.status in ('solicitada', 'preparando', 'atendida'))
    and not exists (select 1 from public.visit_ip_closures c where c.visit_id = p_visit_id);

  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    raise exception 'La solicitud tiene ítems con un formato inválido' using errcode = 'check_violation';
  end if;
  v_n_items := jsonb_array_length(coalesce(p_items, '[]'::jsonb));

  v_off := p_off_schedule_reason is not null and btrim(p_off_schedule_reason) <> '';

  -- 0121 · La medicación de BASE ya no pide cronograma (D4): el chequeo de `dispenses` se fue. Lo que
  -- queda es lo único que sigue siendo cierto sin motivo: un pedido tiene que llevar algo — renglones
  -- o el IP que el cronograma prevé. El IP fuera de cronograma sigue entrando sólo con motivo.
  if not v_off and v_n_items = 0 and not v_includes_ip then
    raise exception 'Un pedido sin renglones y sin producto en investigación no es un pedido'
      using errcode = 'check_violation';
  end if;

  insert into public.dispensation_requests
      (visit_id, protocol_id, requested_by, status, source, notes, requested_by_module,
       includes_ip, off_schedule, off_schedule_reason, base_sin_cronograma)
    values
      (p_visit_id, v_protocol_id, auth.uid(), 'solicitada', 'manual',
       nullif(btrim(coalesce(p_notes,'')),''), p_origen,
       v_includes_ip, v_off, nullif(btrim(coalesce(p_off_schedule_reason,'')),''),
       -- El sello: hay base y el cronograma no la preveía. Un dato, no una excepción.
       v_n_items > 0 and not v_dispenses)
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


-- Cuerpo de la 0072 + D4. Misma firma → create or replace.
create or replace function public.add_dispensation_items(p_request_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_status       request_status;
  v_visit_id     uuid;
  v_dispenses    boolean;
  v_item         jsonb;
  v_puede_track  boolean;
  v_puede_pharma boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select dr.status, dr.visit_id, coalesce(vd.dispenses, false)
    into v_status, v_visit_id, v_dispenses
    from public.dispensation_requests dr
    join public.patient_visits pv on pv.id = dr.visit_id
    left join public.visit_definitions vd on vd.id = pv.visit_def_id
   where dr.id = p_request_id
   for update of dr;
  if not found then
    raise exception 'No se encontró la solicitud' using errcode = '23503';
  end if;

  v_puede_track := public.has_module('gerencia')
                   or public.has_min_role('track','admin')
                   or (public.has_min_role('track','operator') and public.coordina_visita(v_visit_id));
  v_puede_pharma := public.has_min_role('pharma','operator');

  if not (v_puede_track or v_puede_pharma) then
    raise exception 'No tenés permiso para agregar medicación a esta solicitud' using errcode = '42501';
  end if;

  if v_status = 'preparando' then
    raise exception 'Farmacia ya está preparando este pedido: no se le puede agregar medicación. Pedile que cancele la preparación para sumarla.'
      using errcode = 'check_violation';
  end if;
  if v_status <> 'solicitada' then
    raise exception 'Este pedido ya está cerrado (%): no se le puede agregar medicación.', v_status
      using errcode = 'check_violation';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'La solicitud tiene ítems con un formato inválido' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'No hay medicación para agregar' using errcode = 'check_violation';
  end if;

  -- 0121 · Sin candado de cronograma (D4). Si la visita no preveía base, el pedido lo dice.
  if not v_dispenses then
    update public.dispensation_requests set base_sin_cronograma = true
     where id = p_request_id and not base_sin_cronograma;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or nullif(btrim(coalesce(v_item->>'medication_id','')),'') is null
       or nullif(btrim(coalesce(v_item->>'quantity','')),'') is null then
      raise exception 'Cada ítem necesita medicamento y cantidad' using errcode = 'check_violation';
    end if;
    if (v_item->>'quantity')::integer <= 0 then
      raise exception 'La cantidad debe ser mayor a cero' using errcode = 'check_violation';
    end if;
    insert into public.dispensation_request_items (request_id, medication_id, quantity)
      values (p_request_id, (v_item->>'medication_id')::uuid, (v_item->>'quantity')::integer);
  end loop;
end;
$fn$;
revoke all on function public.add_dispensation_items(uuid, jsonb) from public;
grant execute on function public.add_dispensation_items(uuid, jsonb) to authenticated;


-- 3 · Editar el pedido mientras está solicitado ---------------------------------------------------
-- Las dos lockean la SOLICITUD (`for update of dr`), igual que add_dispensation_items y que
-- start_dispensation_preparation: sin el lock, Farmacia podría tomar el pedido entre el chequeo y la
-- escritura, y la cantidad cambiaría adentro de un cajón que ya se está armando.

create or replace function public.update_dispensation_item_quantity(p_item_id uuid, p_quantity integer)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_request_id uuid;
  v_status     request_status;
  v_visit_id   uuid;
  v_quien      text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select dr.id, dr.status, dr.visit_id, dr.prepared_by_name
    into v_request_id, v_status, v_visit_id, v_quien
    from public.dispensation_request_items dri
    join public.dispensation_requests dr on dr.id = dri.request_id
   where dri.id = p_item_id
   for update of dr;
  if not found then
    raise exception 'Ese medicamento ya no está en el pedido. Actualizá la tarjeta.' using errcode = '23503';
  end if;

  if not (public.has_module('gerencia')
          or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.coordina_visita(v_visit_id))
          or public.has_min_role('pharma','operator')) then
    raise exception 'No tenés permiso para editar este pedido' using errcode = '42501';
  end if;

  if v_status = 'preparando' then
    raise exception 'Farmacia ya está preparando este pedido%: pedile que lo libere para cambiarlo.',
      coalesce(' (lo tiene ' || v_quien || ')', '') using errcode = 'check_violation';
  end if;
  if v_status <> 'solicitada' then
    raise exception 'Este pedido ya está cerrado: no se puede cambiar.' using errcode = 'check_violation';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero' using errcode = 'check_violation';
  end if;

  -- trg_check_request_item_protocol corre también en UPDATE: el medicamento sigue teniendo que estar
  -- habilitado para el paciente. Si lo deshabilitaron después de pedirlo, cambiar la cantidad falla
  -- con ese mensaje — y es correcto.
  update public.dispensation_request_items dri set quantity = p_quantity where dri.id = p_item_id;
end;
$fn$;
revoke all on function public.update_dispensation_item_quantity(uuid, integer) from public;
grant execute on function public.update_dispensation_item_quantity(uuid, integer) to authenticated;


create or replace function public.remove_dispensation_item(p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_request_id  uuid;
  v_status      request_status;
  v_visit_id    uuid;
  v_includes_ip boolean;
  v_quien       text;
  v_restantes   integer;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select dr.id, dr.status, dr.visit_id, dr.includes_ip, dr.prepared_by_name
    into v_request_id, v_status, v_visit_id, v_includes_ip, v_quien
    from public.dispensation_request_items dri
    join public.dispensation_requests dr on dr.id = dri.request_id
   where dri.id = p_item_id
   for update of dr;
  if not found then
    raise exception 'Ese medicamento ya no está en el pedido. Actualizá la tarjeta.' using errcode = '23503';
  end if;

  if not (public.has_module('gerencia')
          or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.coordina_visita(v_visit_id))
          or public.has_min_role('pharma','operator')) then
    raise exception 'No tenés permiso para editar este pedido' using errcode = '42501';
  end if;

  if v_status = 'preparando' then
    raise exception 'Farmacia ya está preparando este pedido%: pedile que lo libere para cambiarlo.',
      coalesce(' (lo tiene ' || v_quien || ')', '') using errcode = 'check_violation';
  end if;
  if v_status <> 'solicitada' then
    raise exception 'Este pedido ya está cerrado: no se puede cambiar.' using errcode = 'check_violation';
  end if;

  -- Un pedido sin renglones y sin IP no es un pedido (la misma regla que al crearlo). Quitar el último
  -- lo dejaría vacío en el tablero de Farmacia: la salida honesta es cancelarlo.
  select count(*) - 1 into v_restantes
    from public.dispensation_request_items dri where dri.request_id = v_request_id;
  if v_restantes = 0 and not v_includes_ip then
    raise exception 'Es el único medicamento del pedido: cancelá el pedido en lugar de quitarlo.'
      using errcode = 'check_violation';
  end if;

  delete from public.dispensation_request_items dri where dri.id = p_item_id;
end;
$fn$;
revoke all on function public.remove_dispensation_item(uuid) from public;
grant execute on function public.remove_dispensation_item(uuid) to authenticated;


-- 4 · Auditoría de los renglones ------------------------------------------------------------------
-- `update of quantity, medication_id` y NO todo UPDATE: el escaneo (`scanned_units`) mueve la fila
-- una vez por envase y llenaría el historial, que corta en 200. Quedan auditados: alta, baja, cambio
-- de cantidad y sustitución (que cambia medication_id). La tabla tiene `id` (audit_row lo exige).
drop trigger if exists trg_audit_request_items on public.dispensation_request_items;
create trigger trg_audit_request_items
  after insert or delete or update of quantity, medication_id on public.dispensation_request_items
  for each row execute function public.audit_row();


-- 5 · El historial encuentra también los renglones borrados ---------------------------------------
-- Cuerpo verbatim de la 0077 salvo la rama de los renglones: antes buscaba por `entity_id in (los
-- renglones que EXISTEN)`, así que un renglón quitado desaparecía de su propio historial. Ahora se
-- reconoce por el `request_id` guardado en la foto de antes o de después. Misma firma y columnas.
create or replace function public.dispensation_audit_trail(p_request_id uuid)
returns table (
  cuando   timestamptz,
  quien    text,
  entidad  text,
  accion   text,
  antes    jsonb,
  despues  jsonb
)
language plpgsql security definer set search_path = public as $fn$
declare v_disp_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_min_role('pharma','viewer') or public.has_min_role('gerencia','viewer')) then
    raise exception 'No tenés permiso para ver el historial de esta dispensación' using errcode = '42501';
  end if;

  select d.id into v_disp_id
  from public.dispensations d where d.request_id = p_request_id limit 1;

  return query
  select
    al.occurred_at,
    coalesce(u.full_name, case when al.actor_id is null then 'Sistema' else '—' end),
    al.entity_type,
    al.action,
    al.before_data,
    al.after_data
  from public.audit_log al
  left join public.users u on u.id = al.actor_id
  where (al.entity_type = 'dispensation_requests'      and al.entity_id = p_request_id)
     or (al.entity_type = 'dispensation_request_items'
         and coalesce(al.after_data, al.before_data)->>'request_id' = p_request_id::text)
     or (al.entity_type = 'dispensation_ip_documents'  and al.entity_id in (
           select d.id from public.dispensation_ip_documents d where d.request_id = p_request_id))
     or (v_disp_id is not null and al.entity_type = 'dispensations' and al.entity_id = v_disp_id)
  order by al.occurred_at desc
  limit 200;
end;
$fn$;
revoke all on function public.dispensation_audit_trail(uuid) from public;
grant execute on function public.dispensation_audit_trail(uuid) to authenticated;


-- 6 · Track deja de escribir directo --------------------------------------------------------------
-- Las tres policies dejaban a Coordinación insertar, cambiar y borrar pedidos y renglones por
-- PostgREST sin pasar por ningún guard: un pedido con el protocolo de otro estudio, un renglón
-- cambiado después de que Farmacia marcó listo. El front NUNCA las usó: todas sus escrituras van por
-- RPC SECURITY DEFINER (create, add, cancel, update/remove de arriba), que no dependen de la RLS.
-- La LECTURA no se toca ("ver solicitudes", "ver items solicitud" siguen), ni las de Farmacia y
-- gerencia.
drop policy if exists "track crea solicitudes" on public.dispensation_requests;
drop policy if exists "track gestiona solicitud propia" on public.dispensation_requests;
drop policy if exists "track administra items solicitud" on public.dispensation_request_items;


-- 7 · El stock que ve Coordinación ----------------------------------------------------------------
-- Tres números por medicamento habilitado del paciente, del stock del PROTOCOLO de la visita (el
-- mismo ámbito del que arma Farmacia):
--
--   en_estante       lo vigente: lotes del protocolo con stock y sin vencer. MISMO predicado que el
--                    FEFO de mark_dispensation_ready (0075:502-504), incluido `current_date`.
--   maximo_armable   el lote vigente más grande. Farmacia arma cada medicamento desde UN lote
--                    (0075:499-510): pedir más que esto revienta en el mostrador aunque el total
--                    alcance.
--   pedido_*         lo pedido en pedidos abiertos (solicitada/preparando) que TODAVÍA no se
--                    descontó: un pedido cuya dispensación ya está en lista/entregada ya salió del
--                    lote y contarlo de nuevo sería restarlo dos veces. Separado en esta visita y
--                    las demás.
--
-- No expone lotes, números de lote ni vencimientos: la 0074 cerró eso a propósito.
create or replace function public.stock_de_la_visita(p_visit_id uuid)
returns table (
  medication_id      uuid,
  en_estante         integer,
  maximo_armable     integer,
  pedido_esta_visita integer,
  pedido_otras       integer
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_protocol   uuid;
  v_enrollment uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select e.protocol_id, e.id into v_protocol, v_enrollment
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id;
  if not found then
    raise exception 'Visita inexistente' using errcode = '23503';
  end if;

  if not (public.has_module('gerencia')
          or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id))
          or public.has_min_role('pharma','viewer')) then
    raise exception 'No tenés permiso para ver el stock de esta visita' using errcode = '42501';
  end if;

  -- Todo calificado: en plpgsql los nombres del `returns table` compiten con las columnas sueltas
  -- (0056/0058, el mismo error dos veces).
  return query
  with meds as (
    select pm.medication_id as mid
      from public.patient_medications pm
     where pm.enrollment_id = v_enrollment and pm.active
  ),
  lotes as (
    select ml.medication_id as mid,
           sum(ml.quantity_on_hand) as total,
           max(ml.quantity_on_hand) as maximo
      from public.medication_lots ml
     where ml.protocol_id = v_protocol
       and ml.quantity_on_hand > 0
       and (ml.expiry_date is null or ml.expiry_date >= current_date)
     group by ml.medication_id
  ),
  pedidos as (
    select dri.medication_id as mid,
           sum(dri.quantity) filter (where dr.visit_id = p_visit_id)  as esta,
           sum(dri.quantity) filter (where dr.visit_id <> p_visit_id) as otras
      from public.dispensation_request_items dri
      join public.dispensation_requests dr on dr.id = dri.request_id
     where dr.protocol_id = v_protocol
       and dr.status in ('solicitada', 'preparando')
       and not exists (select 1 from public.dispensations d
                        where d.request_id = dr.id and d.status in ('lista', 'entregada'))
     group by dri.medication_id
  )
  select m.mid,
         coalesce(l.total, 0)::integer,
         coalesce(l.maximo, 0)::integer,
         coalesce(p.esta, 0)::integer,
         coalesce(p.otras, 0)::integer
    from meds m
    left join lotes l   on l.mid = m.mid
    left join pedidos p on p.mid = m.mid;
end;
$fn$;
revoke all on function public.stock_de_la_visita(uuid) from public;
grant execute on function public.stock_de_la_visita(uuid) to authenticated;

notify pgrst, 'reload schema';
