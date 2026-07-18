-- 0058 · Fix · "column reference dispensation_id is ambiguous" al re-marcar lista
-- ============================================================================
-- Segundo bug de la MISMA CLASE que la 0056, en otra línea. La 0056 arregló
-- `correlative_number` pero no revisó `dispensation_id`, que también es nombre de
-- variable de salida del `returns table`.
--
-- Solo se dispara en la rama de REUSO de la fila (cuando ya existe una dispensación
-- en preparación, es decir después de cancelar y volver a marcar lista). Por eso el
-- primer marcado del QA pasó y el segundo falló: recién con la 0057 quedó habilitado
-- ese camino.
--
--     delete from public.dispensation_items where dispensation_id = v_disp_id;
--                                                ^^^^^^^^^^^^^^^^ ¿columna o variable de salida?
--
-- FIX: alias explícito en el DELETE.
--
-- AUDITORÍA COMPLETA de las tres variables de salida (dispensation_id,
-- correlative_number, dispensation_code) contra cada uso de la función, para no
-- dejar una tercera:
--   línea  70 · select d.id, d.correlative_number, d.dispensation_code  → calificado con alias d
--   línea  81 · returning dispensations.id, dispensations.correlative_number → calificado (0056)
--   línea  84 · delete ... where dispensation_id = v_disp_id            → AMBIGUO, se arregla acá
--   línea 100 · update ... set dispensation_code = v_code               → seguro: el lado izquierdo
--                                                                         de un SET siempre resuelve
--                                                                         como columna
--   línea 127 · insert into dispensation_items (dispensation_id, ...)   → seguro: lista de columnas
-- No queda ningún otro uso sin calificar.
--
-- Nota para el futuro: cualquier función con `returns table (...)` en este schema
-- hereda este riesgo. Al escribir una nueva, calificar SIEMPRE los nombres de
-- columna que coincidan con los de salida, o darles nombres que no colisionen.
-- ============================================================================

create or replace function public.mark_dispensation_ready(p_request_id uuid)
returns table (dispensation_id uuid, correlative_number integer, dispensation_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_status      request_status;
  v_protocol_id uuid;
  v_pending     integer;
  v_disp_id     uuid;
  v_corr        integer;
  v_code        text;
  v_daily       integer;
  v_item        record;
  v_lot         record;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede marcar lista una dispensación' using errcode = '42501';
  end if;

  select dr.status, e.protocol_id
    into v_status, v_protocol_id
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

  -- Reusar la dispensación si ya existe. Conserva el correlativo (numeración legal
  -- sin huecos); el código puede venir en null si se liberó al cancelar (0057), y en
  -- ese caso se sella de nuevo más abajo con quien dispensa ahora.
  select d.id, d.correlative_number, d.dispensation_code
    into v_disp_id, v_corr, v_code
  from public.dispensations d
  where d.request_id = p_request_id and d.status = 'en_preparacion'
  for update;

  if not found then
    insert into public.dispensations (request_id, executed_by, status)
      values (p_request_id, auth.uid(), 'en_preparacion')
      returning dispensations.id, dispensations.correlative_number
      into v_disp_id, v_corr;
  else
    -- ALIAS EXPLÍCITO (fix 0058): sin `di.`, `dispensation_id` choca con la variable
    -- de salida homónima del returns table.
    delete from public.dispensation_items di where di.dispensation_id = v_disp_id;
  end if;

  -- Sellar el código solo si no lo tiene (primera vez, o se liberó al cancelar).
  if v_code is null then
    insert into public.dispensation_daily_counters (day, last_number)
      values (current_date, 1)
      on conflict (day) do update
        set last_number = public.dispensation_daily_counters.last_number + 1
      returning last_number into v_daily;

    v_code := 'D-' || v_daily
           || '-' || to_char(current_date, 'DDMMYY')
           || '-' || public.user_initials(auth.uid());

    update public.dispensations
      set daily_number = v_daily, dispensation_code = v_code
      where id = v_disp_id;
  end if;

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
  end loop;

  update public.dispensations set status = 'lista' where id = v_disp_id;

  return query select v_disp_id, v_corr, v_code;
end; $$;
revoke all on function public.mark_dispensation_ready(uuid) from public;
grant execute on function public.mark_dispensation_ready(uuid) to authenticated;
