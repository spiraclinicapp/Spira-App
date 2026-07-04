-- Spira · Migración 0040 — Pharma: la asignación medicamento↔protocolo es CONSECUENCIA de recibir
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0039. IDEMPOTENTE.
-- ============================================================================
-- Cambio de modelo (decisión del Director): el catálogo de medicamentos es global y la lista
-- `protocol_medications` deja de ser un GATE previo ("asigná antes de poder recibir/ver"). Ahora
-- recibir un medicamento para un protocolo ES la asignación: si no estaba asociado, se asocia acá
-- en vez de rechazar. Reemplaza el `if not exists (...) raise check_violation` por un upsert
-- idempotente en los dos puntos donde vivía (el RPC `create_reception` y el trigger
-- `apply_reception_stock`). No hay migración de datos: las filas existentes de
-- `protocol_medications` se quedan; el cambio es aditivo. `v_medication_stock` NO cambia (sigue
-- FROM protocol_medications; como recibir ahora asocia, todo med recibido aparece en su protocolo).
-- Ambulatoria (protocol_id null) nunca validó; IP va por su propio RPC macro (0038).
-- ============================================================================

-- 1 · Trigger: asocia (upsert) en vez de rechazar, en la rama con protocolo
create or replace function public.apply_reception_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_lot_id uuid;
begin
  if new.status = 'verificada' and old.status is distinct from 'verificada' then
    for r in select * from public.reception_items where reception_id = new.id loop
      if new.protocol_id is not null then
        -- Asignación = consecuencia de recibir (0040): asociar si no estaba, en vez de rechazar.
        insert into public.protocol_medications (protocol_id, medication_id)
        values (new.protocol_id, r.medication_id)
        on conflict (protocol_id, medication_id) do nothing;
        insert into public.medication_lots (medication_id, protocol_id, tipo, lot_number, expiry_date, quantity_on_hand)
        values (r.medication_id, new.protocol_id, new.tipo, r.lot_number, r.expiry_date, r.quantity)
        on conflict (medication_id, protocol_id, lot_number) do update
          set quantity_on_hand = medication_lots.quantity_on_hand + excluded.quantity_on_hand,
              expiry_date       = coalesce(medication_lots.expiry_date, excluded.expiry_date)
        returning id into v_lot_id;
      else
        insert into public.medication_lots (medication_id, protocol_id, tipo, lot_number, expiry_date, quantity_on_hand)
        values (r.medication_id, null, new.tipo, r.lot_number, r.expiry_date, r.quantity)
        on conflict (medication_id, lot_number) where protocol_id is null do update
          set quantity_on_hand = medication_lots.quantity_on_hand + excluded.quantity_on_hand,
              expiry_date       = coalesce(medication_lots.expiry_date, excluded.expiry_date)
        returning id into v_lot_id;
      end if;
      insert into public.stock_movements
        (medication_id, lot_id, movement_type, quantity_delta, reference_id, reference_type, created_by)
      values
        (r.medication_id, v_lot_id, 'recepcion', r.quantity, new.id, 'reception',
         coalesce(new.verified_by, new.received_by));
    end loop;
  end if;
  return new;
end;
$$;

-- 2 · RPC create_reception: asocia (upsert) en vez de rechazar (misma firma que la 0035)
create or replace function public.create_reception(
  p_tipo public.reception_kind, p_protocol_id uuid, p_reception_date date, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_item jsonb;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para crear recepciones' using errcode = '42501'; end if;
  if (p_tipo = 'ambulatoria') <> (p_protocol_id is null) then
    raise exception 'El tipo % es incompatible con el protocolo indicado', p_tipo using errcode = 'check_violation';
  end if;
  insert into public.medication_receptions (tipo, protocol_id, received_by, reception_date, status, notes)
  values (p_tipo, p_protocol_id, auth.uid(), p_reception_date, 'pendiente', p_notes)
  returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Asignación = consecuencia de recibir (0040): si no estaba asociado, se asocia acá.
    -- Ambulatoria (protocol_id null) no asocia.
    if p_protocol_id is not null then
      insert into public.protocol_medications (protocol_id, medication_id)
      values (p_protocol_id, (v_item->>'medication_id')::uuid)
      on conflict (protocol_id, medication_id) do nothing;
    end if;
    insert into public.reception_items (reception_id, medication_id, lot_number, expiry_date, quantity)
    values (v_id, (v_item->>'medication_id')::uuid, v_item->>'lot_number',
            nullif(v_item->>'expiry_date','')::date, (v_item->>'quantity')::integer);
  end loop;
  return v_id;
end;
$$;
grant execute on function public.create_reception(public.reception_kind, uuid, date, text, jsonb) to authenticated;
