-- 0054 · Dispensación · el flujo de un paso se abre en cuatro estados
-- ============================================================================
-- REQUIERE la 0053 aplicada (valor 'preparando' del enum request_status).
--
-- Hasta acá, resolve_dispensation (0050) hacía todo en una transacción: creaba
-- la dispensación, elegía el lote FEFO, descontaba stock y cerraba la solicitud.
-- Los estados intermedios de dispensation_status existían desde la 0001 pero no
-- se materializaban nunca.
--
-- El rediseño del tablero necesita que cada paso sea un momento real, con
-- trabajo humano y tiempo entre uno y otro:
--
--     solicitada ──start_dispensation_preparation()──► preparando ──┐
--         ▲                                                │        │
--         │                                     scan/unscan_item()  │
--         │                                          × N ítems      │
--         │                                                │        │
--         └──cancel_dispensation_preparation()──────────────┘        │
--                                                                    │
--                                            mark_dispensation_ready()
--                                                                    ▼
--                                                    dispensations.status
--                                                       en_preparacion
--                                                             │ (mismo statement)
--                                                             ▼
--                                                          lista  ← stock DESCONTADO acá
--                                                             │     correlativo asignado
--                                             deliver_dispensation()
--                                                             ▼
--                                                         entregada  ← solo sella delivered_at
--
-- DOS DECISIONES QUE EXPLICAN LA FORMA DE TODO ESTO:
--
-- 1 · El estado "preparando" vive en dispensation_requests, NO en dispensations.
--     dispensations.correlative_number es un serial (0002_tables.sql:302): se
--     consume en el INSERT. Si la fila naciera al empezar a preparar, cada
--     preparación cancelada quemaría un número de comprobante y dejaría huecos
--     en la numeración de la nota fuente. Inaceptable para ANMAT. Por eso la
--     fila nace recién al marcar lista.
--
-- 2 · Cancelar desde "lista" NO borra la fila dispensations.
--     Borrarla reintroduciría el hueco de correlativo. En vez de eso, la fila
--     vuelve a 'en_preparacion' (el trigger devuelve el stock) y se le vacían
--     los renglones. mark_dispensation_ready es idempotente sobre esa fila: si
--     ya existe una en 'en_preparacion' para la solicitud, la reusa. Cancelar y
--     volver a marcar lista conserva el MISMO N° de comprobante.
-- ============================================================================


-- 1 · Escaneo persistido -----------------------------------------------------
-- El tablero muestra "1/2 escaneados" en la card, FUERA del drawer. Si el
-- escaneo viviera solo en el estado de React (como hasta ahora), el contador
-- mentiría apenas se recarga la página. En un sistema auditable eso no va.
alter table public.dispensation_request_items
  add column if not exists scanned_at timestamptz,
  add column if not exists scanned_by uuid references public.users(id);

comment on column public.dispensation_request_items.scanned_at is
  'Cuándo se confirmó por escaneo este renglón. NULL = pendiente. Las filas previas a la 0054 quedan NULL, que es la verdad: no se escanearon.';


-- 2 · Quién prepara y desde cuándo -------------------------------------------
-- Dos farmacéuticas pueden abrir el tablero a la vez. Saber quién tomó la
-- solicitud evita que dos preparen lo mismo en paralelo.
alter table public.dispensation_requests
  add column if not exists prepared_by uuid references public.users(id),
  add column if not exists preparation_started_at timestamptz;


-- 3 · El descuento de stock se corre de "entregada" a "lista" ----------------
-- Decisión del Director: al marcar lista el lote ya sale del stock (la
-- medicación está físicamente apartada en el mostrador). "Entregar" solo sella
-- y fecha. Cancelar desde lista devuelve el stock.
--
-- Reemplaza a la versión de 0003_functions_triggers.sql:151, que descontaba al
-- pasar a 'entregada'. Las filas ya 'entregada' no se re-procesan: el trigger
-- mira la transición, no el estado.
create or replace function public.apply_dispensation_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare it record; v_stock integer;
begin
  -- 3.1 · en_preparacion → lista : DESCUENTA
  if new.status = 'lista' and old.status is distinct from 'lista' then
    if not exists (select 1 from public.dispensation_items where dispensation_id = new.id) then
      raise exception 'No se puede marcar lista la dispensación % sin renglones (dispensation_items)',
        new.id using errcode = 'check_violation';
    end if;

    for it in select * from public.dispensation_items where dispensation_id = new.id loop
      -- lockear el lote para evitar carrera entre dispensaciones simultáneas del mismo lote
      select quantity_on_hand into v_stock
        from public.medication_lots where id = it.lot_id for update;
      if v_stock is null then
        raise exception 'Lote % inexistente', it.lot_id using errcode = 'foreign_key_violation';
      end if;
      if v_stock < it.quantity then
        raise exception 'Stock insuficiente en lote % (% disponible, % requerido)',
          it.lot_id, v_stock, it.quantity using errcode = 'check_violation';
      end if;

      update public.medication_lots
        set quantity_on_hand = quantity_on_hand - it.quantity
        where id = it.lot_id;

      insert into public.stock_movements
        (medication_id, lot_id, movement_type, quantity_delta, reference_id, reference_type, created_by)
      values
        (it.medication_id, it.lot_id, 'dispensacion', -it.quantity, new.id, 'dispensation', new.executed_by);
    end loop;
  end if;

  -- 3.2 · lista → en_preparacion : DEVUELVE (se canceló la preparación)
  -- Los renglones todavía existen acá; cancel_dispensation_preparation los borra
  -- DESPUÉS de este update, justamente para que el trigger sepa qué devolver.
  if old.status = 'lista' and new.status = 'en_preparacion' then
    for it in select * from public.dispensation_items where dispensation_id = new.id loop
      update public.medication_lots
        set quantity_on_hand = quantity_on_hand + it.quantity
        where id = it.lot_id;

      insert into public.stock_movements
        (medication_id, lot_id, movement_type, quantity_delta, reference_id, reference_type, created_by)
      values
        (it.medication_id, it.lot_id, 'devolucion', it.quantity, new.id, 'dispensation', auth.uid());
    end loop;
  end if;

  -- 3.3 · lista → entregada : NO mueve stock. Ya salió al marcar lista.
  -- (set_delivered_at, 0003:136, sella delivered_at en esta misma transición)

  return new;
end;
$$;


-- 4 · RPC · tomar la solicitud y empezar a preparar --------------------------
create or replace function public.start_dispensation_preparation(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status request_status; v_prepared_by uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede preparar dispensaciones' using errcode = '42501';
  end if;

  select status, prepared_by into v_status, v_prepared_by
  from public.dispensation_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;

  -- ya la está preparando otra persona: no se la robamos
  if v_status = 'preparando' and v_prepared_by is distinct from auth.uid() then
    raise exception 'Otra persona ya está preparando esta solicitud' using errcode = 'check_violation';
  end if;
  -- volver a entrar a la propia preparación es válido (reabrir el cajón)
  if v_status = 'preparando' then return; end if;

  if v_status <> 'solicitada' then
    raise exception 'Solo se puede preparar una solicitud pendiente (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  update public.dispensation_requests
    set status = 'preparando', prepared_by = auth.uid(), preparation_started_at = now()
    where id = p_request_id;
end; $$;
revoke all on function public.start_dispensation_preparation(uuid) from public;
grant execute on function public.start_dispensation_preparation(uuid) to authenticated;


-- 5 · RPC · confirmar un renglón por escaneo ---------------------------------
-- Resuelve el código (EAN) contra medication_codes y lo matchea contra un
-- renglón pendiente. Devuelve qué se confirmó y cuánto falta, para que el front
-- no tenga que recontar.
create or replace function public.scan_dispensation_item(p_request_id uuid, p_code text)
returns table (item_id uuid, medication_name text, remaining integer)
language plpgsql security definer set search_path = public as $$
declare
  v_status        request_status;
  v_medication_id uuid;
  v_item_id       uuid;
  v_pending_name  text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede escanear' using errcode = '42501';
  end if;

  select status into v_status
  from public.dispensation_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;
  if v_status <> 'preparando' then
    raise exception 'Esta solicitud no está en preparación (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  -- ¿el código existe en el catálogo?
  select mc.medication_id into v_medication_id
  from public.medication_codes mc
  where mc.code = btrim(p_code);
  if not found then
    raise exception 'Ese código de barras no está en el catálogo' using errcode = 'no_data_found';
  end if;

  -- ¿corresponde a un renglón pendiente de ESTA solicitud?
  select dri.id into v_item_id
  from public.dispensation_request_items dri
  where dri.request_id = p_request_id
    and dri.medication_id = v_medication_id
    and dri.scanned_at is null
  limit 1;

  if not found then
    -- mensaje nominativo: decir QUÉ se escaneó y QUÉ falta ahorra el "¿y ahora qué?"
    select m.name into v_pending_name
    from public.dispensation_request_items dri
    join public.medications m on m.id = dri.medication_id
    where dri.request_id = p_request_id and dri.scanned_at is null
    limit 1;

    if v_pending_name is null then
      raise exception 'Todos los ítems de esta solicitud ya están escaneados'
        using errcode = 'check_violation';
    end if;

    raise exception 'Ese código es %, pero falta escanear %',
      (select name from public.medications where id = v_medication_id), v_pending_name
      using errcode = 'check_violation';
  end if;

  update public.dispensation_request_items
    set scanned_at = now(), scanned_by = auth.uid()
    where id = v_item_id;

  return query
    select v_item_id,
           (select m.name from public.medications m where m.id = v_medication_id),
           (select count(*)::integer from public.dispensation_request_items
             where request_id = p_request_id and scanned_at is null);
end; $$;
revoke all on function public.scan_dispensation_item(uuid, text) from public;
grant execute on function public.scan_dispensation_item(uuid, text) to authenticated;


-- 6 · RPC · deshacer un escaneo ----------------------------------------------
-- Sin esto, corregir un escaneo equivocado obliga a cancelar toda la preparación.
create or replace function public.unscan_dispensation_item(p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status request_status;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede modificar el escaneo' using errcode = '42501';
  end if;

  select dr.status into v_status
  from public.dispensation_request_items dri
  join public.dispensation_requests dr on dr.id = dri.request_id
  where dri.id = p_item_id
  for update of dr;
  if not found then raise exception 'Renglón inexistente' using errcode = '23503'; end if;
  if v_status <> 'preparando' then
    raise exception 'Solo se puede corregir el escaneo mientras se prepara (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  update public.dispensation_request_items
    set scanned_at = null, scanned_by = null
    where id = p_item_id;
end; $$;
revoke all on function public.unscan_dispensation_item(uuid) from public;
grant execute on function public.unscan_dispensation_item(uuid) to authenticated;


-- 7 · RPC · marcar lista para retirar (el corazón) ---------------------------
-- Exige todo escaneado. Crea (o reusa) la dispensación, elige el lote FEFO por
-- medicamento, y la pasa a 'lista' → el trigger descuenta el stock.
-- El bloque FEFO es el mismo de resolve_dispensation (0050:306-333), incluido el
-- desempate determinístico y el for update del lote.
create or replace function public.mark_dispensation_ready(p_request_id uuid)
returns table (dispensation_id uuid, correlative_number integer)
language plpgsql security definer set search_path = public as $$
declare
  v_status      request_status;
  v_protocol_id uuid;
  v_prepared_by uuid;
  v_pending     integer;
  v_disp_id     uuid;
  v_corr        integer;
  v_item        record;
  v_lot         record;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede marcar lista una dispensación' using errcode = '42501';
  end if;

  select dr.status, dr.prepared_by, e.protocol_id
    into v_status, v_prepared_by, v_protocol_id
  from public.dispensation_requests dr
  join public.patient_visits pv on pv.id = dr.visit_id
  join public.enrollments e     on e.id  = pv.enrollment_id
  where dr.id = p_request_id
  for update of dr;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;
  if v_status <> 'preparando' then
    raise exception 'Esta solicitud no está en preparación (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  select count(*)::integer into v_pending
  from public.dispensation_request_items
  where request_id = p_request_id and scanned_at is null;
  if v_pending > 0 then
    raise exception 'Faltan % ítems por escanear', v_pending using errcode = 'check_violation';
  end if;

  -- Reusar la dispensación si ya existe (se canceló desde lista y se rehace).
  -- Conserva el correlativo → la numeración del comprobante no deja huecos.
  select d.id, d.correlative_number into v_disp_id, v_corr
  from public.dispensations d
  where d.request_id = p_request_id and d.status = 'en_preparacion'
  for update;

  if not found then
    insert into public.dispensations (request_id, executed_by, status)
      values (p_request_id, auth.uid(), 'en_preparacion')
      returning id, correlative_number into v_disp_id, v_corr;
  else
    -- por las dudas: rehacer los renglones desde cero
    delete from public.dispensation_items where dispensation_id = v_disp_id;
  end if;

  -- un renglón por medicamento (agrego cantidades por si la solicitud repite el mismo)
  for v_item in
    select medication_id, sum(quantity)::integer as quantity
    from public.dispensation_request_items
    where request_id = p_request_id
    group by medication_id
  loop
    -- FEFO: el lote que vence antes, del protocolo, no vencido, con stock suficiente. Lock del lote.
    select ml.id, ml.lot_number, ml.expiry_date into v_lot
    from public.medication_lots ml
    where ml.medication_id = v_item.medication_id
      and ml.protocol_id   = v_protocol_id
      and ml.quantity_on_hand >= v_item.quantity
      and (ml.expiry_date is null or ml.expiry_date >= current_date)
    order by ml.expiry_date asc nulls last, ml.created_at asc, ml.lot_number asc  -- desempate determinístico/auditable
    limit 1
    for update of ml;

    if not found then
      raise exception 'No hay stock suficiente en un solo lote para el medicamento % (cantidad %). Reducí la cantidad (la partición entre lotes llega en v1.1).',
        v_item.medication_id, v_item.quantity using errcode = 'check_violation';
    end if;

    insert into public.dispensation_items
      (dispensation_id, medication_id, lot_id, quantity, lot_number, expiry_date)
    values
      (v_disp_id, v_item.medication_id, v_lot.id, v_item.quantity, v_lot.lot_number, v_lot.expiry_date);
    -- trg check_dispensation_item_protocol valida lote↔protocolo + medicamento↔solicitud
    -- y que la medicación siga habilitada para el paciente (0050:122-128)
  end loop;

  -- lista → dispara apply_dispensation_stock (descuenta)
  update public.dispensations set status = 'lista' where id = v_disp_id;

  return query select v_disp_id, v_corr;
end; $$;
revoke all on function public.mark_dispensation_ready(uuid) from public;
grant execute on function public.mark_dispensation_ready(uuid) to authenticated;


-- 8 · RPC · entregar al paciente ---------------------------------------------
-- No mueve stock (ya salió al marcar lista). Sella delivered_at vía trigger y
-- cierra la solicitud.
create or replace function public.deliver_dispensation(p_dispensation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status dispensation_status; v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede entregar' using errcode = '42501';
  end if;

  select status, request_id into v_status, v_request_id
  from public.dispensations where id = p_dispensation_id for update;
  if not found then raise exception 'Dispensación inexistente' using errcode = '23503'; end if;
  if v_status = 'entregada' then
    raise exception 'Esta dispensación ya fue entregada' using errcode = 'check_violation';
  end if;
  if v_status <> 'lista' then
    raise exception 'Solo se puede entregar una dispensación lista (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  update public.dispensations set status = 'entregada' where id = p_dispensation_id;
  update public.dispensation_requests set status = 'atendida' where id = v_request_id;
end; $$;
revoke all on function public.deliver_dispensation(uuid) from public;
grant execute on function public.deliver_dispensation(uuid) to authenticated;


-- 9 · RPC · cancelar la preparación ------------------------------------------
-- Distinto de rechazar: acá no pasó nada malo, se vuelve atrás. La solicitud
-- queda como llegó, disponible para que la tome cualquiera.
-- Si ya se había marcado lista, devuelve el stock y vacía los renglones, pero
-- NO borra la fila dispensations (ver nota 2 del encabezado).
create or replace function public.cancel_dispensation_preparation(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status request_status; v_disp_id uuid; v_disp_status dispensation_status;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede cancelar una preparación' using errcode = '42501';
  end if;

  select status into v_status
  from public.dispensation_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;
  if v_status <> 'preparando' then
    raise exception 'Esta solicitud no está en preparación (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  select id, status into v_disp_id, v_disp_status
  from public.dispensations
  where request_id = p_request_id and status in ('en_preparacion','lista')
  for update;

  if found and v_disp_status = 'lista' then
    -- devuelve el stock (trigger 3.2). Los renglones se borran DESPUÉS,
    -- porque el trigger los necesita para saber cuánto devolver.
    update public.dispensations set status = 'en_preparacion' where id = v_disp_id;
    delete from public.dispensation_items where dispensation_id = v_disp_id;
  end if;

  update public.dispensation_request_items
    set scanned_at = null, scanned_by = null
    where request_id = p_request_id;

  update public.dispensation_requests
    set status = 'solicitada', prepared_by = null, preparation_started_at = null
    where id = p_request_id;
end; $$;
revoke all on function public.cancel_dispensation_preparation(uuid) from public;
grant execute on function public.cancel_dispensation_preparation(uuid) to authenticated;


-- 10 · Rechazar también desde "preparando" -----------------------------------
-- El cajón de preparación tiene el botón Rechazar: si al abrir la caja la
-- farmacéutica ve que no puede cumplir, rechaza ahí mismo. Antes solo se podía
-- rechazar desde 'solicitada'.
-- Rechazar sigue siendo TERMINAL y con motivo obligatorio (queda en audit_log);
-- lo reversible es cancel_dispensation_preparation.
create or replace function public.reject_dispensation_request(p_request_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status request_status; v_disp_id uuid; v_disp_status dispensation_status;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then                -- viewer = solo lectura
    raise exception 'Solo Pharma (operador) puede rechazar solicitudes' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'El rechazo requiere un motivo' using errcode = 'check_violation';
  end if;

  select status into v_status from public.dispensation_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;
  if v_status not in ('solicitada','preparando') then
    raise exception 'Solo se puede rechazar una solicitud pendiente o en preparación (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  -- si ya se había marcado lista, devolver el stock antes de cerrar
  select id, status into v_disp_id, v_disp_status
  from public.dispensations
  where request_id = p_request_id and status in ('en_preparacion','lista')
  for update;

  if found and v_disp_status = 'lista' then
    update public.dispensations set status = 'en_preparacion' where id = v_disp_id;
    delete from public.dispensation_items where dispensation_id = v_disp_id;
  end if;

  update public.dispensation_request_items
    set scanned_at = null, scanned_by = null
    where request_id = p_request_id;

  update public.dispensation_requests
    set status = 'rechazada', rejection_reason = btrim(p_reason)
    where id = p_request_id;
end; $$;
revoke all on function public.reject_dispensation_request(uuid, text) from public;
grant execute on function public.reject_dispensation_request(uuid, text) to authenticated;


-- 11 · resolve_dispensation queda deprecada ----------------------------------
-- NO se borra acá: primero hay que confirmar que ningún cliente la llama.
-- El borrado va en una migración posterior.
comment on function public.resolve_dispensation(uuid) is
  'DEPRECADA (0054). Resolvía la dispensación en un paso. Reemplazada por start_dispensation_preparation → scan_dispensation_item → mark_dispensation_ready → deliver_dispensation. No usar en código nuevo.';
