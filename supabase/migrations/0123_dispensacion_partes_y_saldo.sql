-- Spira · Migración 0123 — Entregas en partes, saldo y contexto de entregas recientes.
-- Plan: docs/plan-dispensacion-base-e-imp.md (Tanda 3b: D8, D13, D14, D21, D24, D25, D27 y R2, R7, R8).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0122.
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. El front desplegado sigue andando con esto:
--    · no pide ninguna columna nueva ni llama a las funciones nuevas;
--    · create_dispensation_request, add_dispensation_items y update_dispensation_item_quantity
--      conservan firma y comportamiento para los renglones de siempre (sin indicado ni saldo);
--    · ninguna FK nueva apunta a una tabla que el front embeba desde otra: la de saldo_de_item_id es
--      de dispensation_request_items a sí misma, y nunca se anida (R8).
--    Lo único que el front viejo puede ver distinto es el guard de un renglón por medicamento, que
--    el panel ya respetaba: no ofrece un medicamento que ya está en el pedido abierto.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- QUÉ HACE:
--   1 · Dos columnas en el renglón: `quantity_indicated` (la N de «entregar M de N») y
--       `saldo_de_item_id` (el vínculo del renglón que pide el saldo con el renglón original, R2).
--   2 · Un medicamento, un renglón por pedido: guard por trigger (no índice, ver abajo por qué).
--   3 · El saldo restante de una indicación, calculado y nunca guardado (función interna).
--   4 · La alta de un renglón, validada en UN lugar (función interna) y usada por
--       create_dispensation_request y add_dispensation_items (misma firma).
--   5 · update_dispensation_item_quantity con los dos topes nuevos: lo indicado y el saldo.
--   6 · contexto_dispensacion(p_visit_id): las filas crudas para los avisos de la tarjeta (R7).
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Columnas ------------------------------------------------------------------------------------
-- Las dos nacen NULL: todos los renglones de hoy son «entrega completa, sin saldo», que es exactamente
-- lo que dice NULL. No hay backfill.

alter table public.dispensation_request_items
  add column if not exists quantity_indicated integer,
  add column if not exists saldo_de_item_id uuid;

-- `on delete restrict`: un renglón original que tiene saldos pedidos no se borra. Hoy nadie podría
-- (el original está entregado y remove_dispensation_item exige `solicitada`), pero la policy
-- «gerencia elimina items solicitud» (0006:276) sí borra directo, y un saldo colgando de un renglón
-- que ya no existe deja al paciente con un saldo sin origen.
alter table public.dispensation_request_items
  drop constraint if exists dispensation_request_items_saldo_de_item_id_fkey;
alter table public.dispensation_request_items
  add constraint dispensation_request_items_saldo_de_item_id_fkey
  foreign key (saldo_de_item_id) references public.dispensation_request_items(id) on delete restrict;

create index if not exists dispensation_request_items_saldo_de_idx
  on public.dispensation_request_items (saldo_de_item_id) where saldo_de_item_id is not null;

-- Lo indicado nunca es menos que lo que se entrega ahora, y un renglón de saldo no tiene indicación
-- propia: la indicación es del original, y el saldo sólo la completa.
alter table public.dispensation_request_items
  drop constraint if exists dri_indicado_coherente;
alter table public.dispensation_request_items
  add constraint dri_indicado_coherente check (
    (quantity_indicated is null or quantity_indicated >= quantity)
    and (saldo_de_item_id is null or quantity_indicated is null)
  );

comment on column public.dispensation_request_items.quantity_indicated is
  'Lo INDICADO cuando el medicamento se entrega en partes (0123, D8): «entregar quantity de quantity_indicated». NULL = entrega completa. El saldo no se guarda: lo calcula saldo_restante_de_indicacion.';
comment on column public.dispensation_request_items.saldo_de_item_id is
  'El renglón ORIGINAL (entregado en partes) del que este renglón pide el saldo (0123, R2). NULL = renglón normal. Vínculo al renglón y no a la droga: sigue a la sustitución. No se embebe desde PostgREST (R8).';


-- 2 · Un medicamento, un renglón por pedido --------------------------------------------------------
-- R2 lo pide para que el comprobante pueda cruzar lo preparado (dispensation_items, agrupado por
-- medicamento en mark_dispensation_ready) con lo pedido por (pedido, medicamento) y decir
-- «1 (de 2 indicados)».
--
-- GUARD Y NO ÍNDICE ÚNICO: un índice no se puede crear si en prod ya hay algún pedido viejo con el
-- mismo medicamento repetido (la base nunca lo impidió y el panel lo permitió hasta la Tanda 2), y
-- el CREATE fallaría a mitad del archivo. El guard sólo mira las escrituras NUEVAS. Las carreras las
-- cierran los locks que ya toman las funciones que escriben renglones (`for update of dr` sobre el
-- pedido en add, update, remove y substitute; create inserta en la misma transacción que crea el
-- pedido), y la escritura directa de Coordinación está cerrada desde la 0121.
create or replace function public.guard_un_renglon_por_medicamento()
returns trigger language plpgsql set search_path = public as $fn$
begin
  if exists (select 1 from public.dispensation_request_items o
              where o.request_id = new.request_id
                and o.medication_id = new.medication_id
                and o.id <> new.id) then
    if tg_op = 'INSERT' then
      raise exception 'Ese medicamento ya está en el pedido: cambiá la cantidad del renglón que ya existe.'
        using errcode = 'check_violation';
    else
      raise exception 'El pedido ya tiene un renglón de ese medicamento.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_guard_un_renglon_por_medicamento on public.dispensation_request_items;
create trigger trg_guard_un_renglon_por_medicamento
  before insert or update of medication_id, request_id on public.dispensation_request_items
  for each row execute function public.guard_un_renglon_por_medicamento();


-- 3 · El saldo restante de una indicación ----------------------------------------------------------
--
--   saldo = indicado del original
--           − lo ENTREGADO (el original y sus saldos cuya dispensación está entregada)
--           − lo EN CAMINO (saldos en pedidos solicitada / preparando, incluida «lista para retirar»,
--             que para la solicitud sigue siendo `preparando`)
--
-- Lo entregado se cuenta con la cantidad del renglón y no con dispensation_items: mark_dispensation_ready
-- arma cada medicamento con esa misma cantidad desde un solo lote, y con un renglón por medicamento
-- son el mismo número. Cancelados y rechazados no cuentan: su saldo vuelve a estar disponible.
--
-- `p_excluir_item_id` deja afuera un renglón de saldo: el que se está editando, para topear su
-- cantidad nueva contra lo que queda sin contarse a sí mismo.
--
-- INTERNA. La leen las funciones SECURITY DEFINER de abajo. Es SECURITY INVOKER y se revoca de
-- `authenticated`: la 0007 (línea 30) le da permiso de ejecución a toda función nueva, y sin el revoke
-- quedaría publicada en /rpc (R3).
create or replace function public.saldo_restante_de_indicacion(p_original_item_id uuid, p_excluir_item_id uuid default null)
returns integer language sql stable set search_path = public as $fn$
  select coalesce(o.quantity_indicated, 0)
         - case when exists (select 1 from public.dispensations d
                              where d.request_id = o.request_id and d.status = 'entregada')
                then o.quantity else 0 end
         - coalesce((
             select sum(s.quantity)
               from public.dispensation_request_items s
               join public.dispensation_requests sdr on sdr.id = s.request_id
              where s.saldo_de_item_id = o.id
                and s.id is distinct from p_excluir_item_id
                and (sdr.status in ('solicitada', 'preparando')
                     or exists (select 1 from public.dispensations sd
                                 where sd.request_id = sdr.id and sd.status = 'entregada'))
           ), 0)
    from public.dispensation_request_items o
   where o.id = p_original_item_id;
$fn$;
revoke all on function public.saldo_restante_de_indicacion(uuid, uuid) from public;
revoke execute on function public.saldo_restante_de_indicacion(uuid, uuid) from authenticated, anon;


-- 4 · La alta de un renglón, en un solo lugar --------------------------------------------------------
-- Antes create_dispensation_request y add_dispensation_items tenían cada una su copia del loop de
-- validación. Con el saldo son quince chequeos más, y dos copias son dos reglas esperando a divergir.
--
-- Qué acepta cada renglón del jsonb (todo lo nuevo es opcional; un renglón de siempre no cambia):
--   medication_id, quantity                      → como hasta ahora
--   quantity_indicated                           → «en partes»: tiene que ser MÁS que quantity
--   saldo_de_item_id                             → «Pedir el saldo» del renglón original
--
-- INTERNA y revocada, igual que la de arriba. Quien la llama ya lockeó el pedido y chequeó permisos.
create or replace function public.alta_renglon_pedido(p_request_id uuid, p_item jsonb)
returns void language plpgsql set search_path = public as $fn$
declare
  v_med        uuid;
  v_qty        integer;
  v_indicado   integer;
  v_saldo_de   uuid;
  v_enrollment uuid;
  v_orig       record;
  v_restante   integer;
  v_nombre     text;
begin
  if jsonb_typeof(p_item) <> 'object'
     or nullif(btrim(coalesce(p_item->>'medication_id','')),'') is null
     or nullif(btrim(coalesce(p_item->>'quantity','')),'') is null then
    raise exception 'Cada ítem necesita medicamento y cantidad' using errcode = 'check_violation';
  end if;
  v_med := (p_item->>'medication_id')::uuid;
  v_qty := (p_item->>'quantity')::integer;
  if v_qty <= 0 then
    raise exception 'La cantidad debe ser mayor a cero' using errcode = 'check_violation';
  end if;

  v_indicado := nullif(btrim(coalesce(p_item->>'quantity_indicated','')),'')::integer;
  v_saldo_de := nullif(btrim(coalesce(p_item->>'saldo_de_item_id','')),'')::uuid;

  if v_indicado is not null and v_saldo_de is not null then
    raise exception 'Un saldo no lleva cantidad indicada propia: la indicación es la del renglón original.'
      using errcode = 'check_violation';
  end if;

  if v_indicado is not null and v_indicado <= v_qty then
    raise exception 'En partes, lo indicado tiene que ser más que lo que se entrega ahora.'
      using errcode = 'check_violation';
  end if;

  if v_saldo_de is not null then
    select pv.enrollment_id into v_enrollment
      from public.dispensation_requests dr
      join public.patient_visits pv on pv.id = dr.visit_id
     where dr.id = p_request_id;

    -- Lock del ORIGINAL: dos pedidos del mismo saldo al mismo tiempo se ordenan acá, y el segundo ya
    -- ve al primero como «en camino».
    select o.id, o.medication_id, o.quantity_indicated, o.saldo_de_item_id, o.request_id,
           opv.enrollment_id as enrollment_id
      into v_orig
      from public.dispensation_request_items o
      join public.dispensation_requests odr on odr.id = o.request_id
      join public.patient_visits opv        on opv.id = odr.visit_id
     where o.id = v_saldo_de
     for update of o;
    if not found then
      raise exception 'El renglón del que sería este saldo ya no existe. Actualizá la tarjeta.'
        using errcode = '23503';
    end if;

    if v_orig.enrollment_id is distinct from v_enrollment then
      raise exception 'Ese saldo es de otro paciente o de otro estudio.' using errcode = 'check_violation';
    end if;
    if v_orig.saldo_de_item_id is not null then
      raise exception 'El saldo se pide sobre la indicación original, no sobre otro saldo.'
        using errcode = 'check_violation';
    end if;
    if v_orig.quantity_indicated is null then
      raise exception 'Ese medicamento no se entregó en partes: no tiene saldo.' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.dispensations d
                    where d.request_id = v_orig.request_id and d.status = 'entregada') then
      raise exception 'El saldo se puede pedir recién cuando se entregó la primera parte.'
        using errcode = 'check_violation';
    end if;
    if v_orig.medication_id is distinct from v_med then
      raise exception 'El saldo tiene que ser del mismo medicamento que se entregó.'
        using errcode = 'check_violation';
    end if;

    v_restante := public.saldo_restante_de_indicacion(v_orig.id, null);
    if v_restante <= 0 then
      raise exception 'Ese saldo ya está completo o ya está pedido.' using errcode = 'check_violation';
    end if;
    if v_qty > v_restante then
      select m.name into v_nombre from public.medications m where m.id = v_med;
      raise exception 'El saldo de % es de % %: no se puede pedir más.',
        coalesce(v_nombre, 'ese medicamento'), v_restante, case when v_restante = 1 then 'envase' else 'envases' end
        using errcode = 'check_violation';
    end if;
  end if;

  -- Los triggers de siempre siguen corriendo: protocolo y habilitación (0050) y el guard de arriba.
  insert into public.dispensation_request_items (request_id, medication_id, quantity, quantity_indicated, saldo_de_item_id)
    values (p_request_id, v_med, v_qty, v_indicado, v_saldo_de);
end;
$fn$;
revoke all on function public.alta_renglon_pedido(uuid, jsonb) from public;
revoke execute on function public.alta_renglon_pedido(uuid, jsonb) from authenticated, anon;


-- Cuerpo de la 0121 salvo el loop de renglones, que pasa a alta_renglon_pedido. Misma firma.
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
       v_n_items > 0 and not v_dispenses)
    returning id into v_request_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    perform public.alta_renglon_pedido(v_request_id, v_item);
  end loop;

  return v_request_id;
end;
$fn$;
revoke all on function public.create_dispensation_request(uuid, jsonb, text, text, text) from public;
grant execute on function public.create_dispensation_request(uuid, jsonb, text, text, text) to authenticated;


-- Cuerpo de la 0121 salvo el loop de renglones. Misma firma.
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

  if not v_dispenses then
    update public.dispensation_requests set base_sin_cronograma = true
     where id = p_request_id and not base_sin_cronograma;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    perform public.alta_renglon_pedido(p_request_id, v_item);
  end loop;
end;
$fn$;
revoke all on function public.add_dispensation_items(uuid, jsonb) from public;
grant execute on function public.add_dispensation_items(uuid, jsonb) to authenticated;


-- 5 · Cambiar la cantidad, con los dos topes nuevos ------------------------------------------------
-- Cuerpo de la 0121 + dos chequeos antes del update. Misma firma.
create or replace function public.update_dispensation_item_quantity(p_item_id uuid, p_quantity integer)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_request_id uuid;
  v_status     request_status;
  v_visit_id   uuid;
  v_quien      text;
  v_indicado   integer;
  v_saldo_de   uuid;
  v_restante   integer;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select dr.id, dr.status, dr.visit_id, dr.prepared_by_name, dri.quantity_indicated, dri.saldo_de_item_id
    into v_request_id, v_status, v_visit_id, v_quien, v_indicado, v_saldo_de
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

  -- 0123 · En partes: lo que se entrega ahora no pasa lo indicado.
  if v_indicado is not null and p_quantity > v_indicado then
    raise exception 'Se indicaron % %: no se puede entregar más que eso.',
      v_indicado, case when v_indicado = 1 then 'envase' else 'envases' end using errcode = 'check_violation';
  end if;

  -- 0123 · Un saldo no pasa lo que queda, sin contarse a sí mismo (R2). Lock del original, como al pedirlo.
  if v_saldo_de is not null then
    perform 1 from public.dispensation_request_items o where o.id = v_saldo_de for update of o;
    v_restante := public.saldo_restante_de_indicacion(v_saldo_de, p_item_id);
    if p_quantity > v_restante then
      raise exception 'El saldo es de % %: no se puede pedir más.',
        greatest(v_restante, 0), case when v_restante = 1 then 'envase' else 'envases' end
        using errcode = 'check_violation';
    end if;
  end if;

  update public.dispensation_request_items dri set quantity = p_quantity where dri.id = p_item_id;
end;
$fn$;
revoke all on function public.update_dispensation_item_quantity(uuid, integer) from public;
grant execute on function public.update_dispensation_item_quantity(uuid, integer) to authenticated;


-- 6 · El contexto de entregas de la visita (R7) ------------------------------------------------------
-- Una llamada por panel. Devuelve FILAS CRUDAS marcadas por tipo; la ventana exacta de 30 días en huso
-- argentino, la resta del saldo en pantalla y qué va en rojo o informativo viven en el front, en reglas
-- puras con test (avisoReciente.ts, saldoModel.ts). La autoridad de la escritura del saldo sigue acá
-- (alta_renglon_pedido): el QA verifica que las dos cuentas coincidan.
--
--   tipo         qué es                                                      qué columnas trae
--   entrega      lo entregado en los últimos 31 días al PACIENTE, en todas    droga, medicamento,
--                sus visitas y protocolos, incluida esta                     presentación, instante,
--                                                                             protocolo, visita
--   abierto      renglones de pedidos abiertos del paciente (solicitada /    ídem, con el instante
--                preparando) en OTRAS visitas                                del pedido
--   indicacion   indicaciones en partes del ENROLAMIENTO con la primera      item_id del original,
--                parte entregada y saldo sin completar                       indicado, entregado,
--                                                                             en_camino, habilitado
--   ip           la última entrega de IP del enrolamiento en 31 días         instante, kits, visita
--
-- Lo que NUNCA sale de otro protocolo: lote, cantidad, nombre del estudio ni del paciente. Una
-- coordinadora de PROT-A ve «omeprazol · 05/09 · PROT-B» y nada más.
--
-- 31 días y no 30: la ventana exacta (30 días en hora argentina) la corta el front; acá sólo se trae
-- un poco de margen para que el borde no dependa del huso del servidor.
--
-- Permiso: el mismo que stock_de_la_visita (0121). Todo calificado: en plpgsql los nombres del
-- `returns table` compiten con las columnas sin calificar (0056/0058).
create or replace function public.contexto_dispensacion(p_visit_id uuid)
returns table (
  tipo            text,
  item_id         uuid,
  medication_id   uuid,
  medication_name text,
  dosis           text,
  unit            text,
  drug_id         uuid,
  drug_name       text,
  instante        timestamptz,
  protocol_code   text,
  visit_code      text,
  es_esta_visita  boolean,
  indicado        integer,
  entregado       integer,
  en_camino       integer,
  habilitado      boolean,
  ip_kits         integer
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_enrollment uuid;
  v_patient    uuid;
  v_desde      timestamptz := now() - interval '31 days';
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select e.id, e.patient_id into v_enrollment, v_patient
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
    raise exception 'No tenés permiso para ver las entregas de esta visita' using errcode = '42501';
  end if;

  return query
  -- entrega: lo que salió de verdad (dispensation_items), no lo pedido. Distinct por dispensación y
  -- medicamento: un medicamento sale de un solo lote, pero la fila no puede repetirse si algún día no.
  select distinct on (d.id, di.medication_id)
         'entrega'::text, null::uuid, di.medication_id, m.name, m.dosis, m.unit, m.drug_id, dg.name,
         d.delivered_at, pr.code, dr.visit_code, (dr.visit_id = p_visit_id),
         null::integer, null::integer, null::integer, null::boolean, null::integer
    from public.dispensations d
    join public.dispensation_items di   on di.dispensation_id = d.id
    join public.dispensation_requests dr on dr.id = d.request_id
    join public.patient_visits pv        on pv.id = dr.visit_id
    join public.enrollments e            on e.id = pv.enrollment_id
    join public.medications m            on m.id = di.medication_id
    left join public.drugs dg            on dg.id = m.drug_id
    left join public.protocols pr        on pr.id = e.protocol_id
   where e.patient_id = v_patient
     and d.status = 'entregada'
     and d.delivered_at >= v_desde

  union all

  select 'abierto'::text, dri.id, dri.medication_id, m.name, m.dosis, m.unit, m.drug_id, dg.name,
         dr.created_at, pr.code, dr.visit_code, false,
         null::integer, null::integer, null::integer, null::boolean, null::integer
    from public.dispensation_request_items dri
    join public.dispensation_requests dr on dr.id = dri.request_id
    join public.patient_visits pv        on pv.id = dr.visit_id
    join public.enrollments e            on e.id = pv.enrollment_id
    join public.medications m            on m.id = dri.medication_id
    left join public.drugs dg            on dg.id = m.drug_id
    left join public.protocols pr        on pr.id = e.protocol_id
   where e.patient_id = v_patient
     and dr.visit_id <> p_visit_id
     and dr.status in ('solicitada', 'preparando')

  union all

  select 'indicacion'::text, o.id, o.medication_id, m.name, m.dosis, m.unit, m.drug_id, dg.name,
         ent.ultima, pr.code, odr.visit_code, (odr.visit_id = p_visit_id),
         o.quantity_indicated, ent.total::integer, coalesce(cam.total, 0)::integer,
         exists (select 1 from public.patient_medications pm
                  where pm.enrollment_id = v_enrollment and pm.medication_id = o.medication_id and pm.active),
         null::integer
    from public.dispensation_request_items o
    join public.dispensation_requests odr on odr.id = o.request_id
    join public.patient_visits opv        on opv.id = odr.visit_id
    join public.enrollments e             on e.id = opv.enrollment_id
    join public.medications m             on m.id = o.medication_id
    left join public.drugs dg             on dg.id = m.drug_id
    left join public.protocols pr         on pr.id = e.protocol_id
    -- Lo entregado: el original más sus saldos cuya dispensación ya está entregada.
    cross join lateral (
      select sum(x.quantity) as total, max(xd.delivered_at) as ultima
        from public.dispensation_request_items x
        join public.dispensations xd on xd.request_id = x.request_id and xd.status = 'entregada'
       where x.id = o.id or x.saldo_de_item_id = o.id
    ) ent
    -- Lo en camino: saldos en pedidos todavía abiertos.
    left join lateral (
      select sum(y.quantity) as total
        from public.dispensation_request_items y
        join public.dispensation_requests ydr on ydr.id = y.request_id
       where y.saldo_de_item_id = o.id
         and ydr.status in ('solicitada', 'preparando')
    ) cam on true
   where opv.enrollment_id = v_enrollment
     and o.saldo_de_item_id is null
     and o.quantity_indicated is not null
     and exists (select 1 from public.dispensations od
                  where od.request_id = o.request_id and od.status = 'entregada')
     and o.quantity_indicated > coalesce(ent.total, 0)

  union all

  (select 'ip'::text, null::uuid, null::uuid, null::text, null::text, null::text, null::uuid, null::text,
          d.delivered_at, null::text, dr.visit_code, (dr.visit_id = p_visit_id),
          null::integer, null::integer, null::integer, null::boolean, d.ip_kits
     from public.dispensations d
     join public.dispensation_requests dr on dr.id = d.request_id
     join public.patient_visits pv        on pv.id = dr.visit_id
    where pv.enrollment_id = v_enrollment
      and dr.includes_ip
      and d.status = 'entregada'
      and d.ip_kits is not null
      and d.delivered_at >= v_desde
    order by d.delivered_at desc
    limit 1);
end;
$fn$;
revoke all on function public.contexto_dispensacion(uuid) from public;
grant execute on function public.contexto_dispensacion(uuid) to authenticated;

notify pgrst, 'reload schema';
