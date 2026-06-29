-- Spira · Migración 0035 — Pharma: recepción tipada (protocolo / investigacion / ambulatoria)
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0034. IDEMPOTENTE.
-- Reabre el ámbito del stock: el "tipo" vive en la recepción y el lote; ambulatoria no lleva
-- protocolo. Las tablas de Pharma ya tienen datos (catálogo + verificación TEST-*): el default
-- 'protocolo' backfillea y los protocol_id existentes (no nulos) cumplen el CHECK.
-- ============================================================================

-- 1 · Enum del tipo de recepción/ámbito
do $$ begin
  if not exists (select 1 from pg_type where typname = 'reception_kind') then
    create type public.reception_kind as enum ('protocolo', 'investigacion', 'ambulatoria');
  end if;
end $$;

-- 2 · medication_receptions: tipo + protocol_id nullable + CHECK
alter table public.medication_receptions
  add column if not exists tipo public.reception_kind not null default 'protocolo';
alter table public.medication_receptions alter column protocol_id drop not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'medication_receptions_tipo_protocol_chk') then
    alter table public.medication_receptions add constraint medication_receptions_tipo_protocol_chk
      check ((tipo = 'ambulatoria') = (protocol_id is null));
  end if;
end $$;

-- 3 · medication_lots: tipo + protocol_id nullable + CHECK + índice parcial para ambulatoria
alter table public.medication_lots
  add column if not exists tipo public.reception_kind not null default 'protocolo';
alter table public.medication_lots alter column protocol_id drop not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'medication_lots_tipo_protocol_chk') then
    alter table public.medication_lots add constraint medication_lots_tipo_protocol_chk
      check ((tipo = 'ambulatoria') = (protocol_id is null));
  end if;
end $$;
-- El unique (medication_id, protocol_id, lot_number) de la 0032 sigue valiendo para protocol_id no-null
-- (los NULL no participan). Agregamos el parcial para ambulatoria:
create unique index if not exists medication_lots_ambulatoria_lot_key
  on public.medication_lots (medication_id, lot_number) where protocol_id is null;

-- 4 · Trigger: copia tipo + protocolo; allow-list solo con protocolo; upsert ramificado
create or replace function public.apply_reception_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_lot_id uuid;
begin
  if new.status = 'verificada' and old.status is distinct from 'verificada' then
    for r in select * from public.reception_items where reception_id = new.id loop
      if new.protocol_id is not null then
        if not exists (select 1 from public.protocol_medications pm
                       where pm.medication_id = r.medication_id and pm.protocol_id = new.protocol_id) then
          raise exception 'El medicamento % no está asignado al protocolo % de la recepción',
            r.medication_id, new.protocol_id using errcode = 'check_violation';
        end if;
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

-- 5 · RPC create_reception re-firmada (drop de la vieja firma + nueva con p_tipo)
drop function if exists public.create_reception(uuid, date, text, jsonb);
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
    if p_protocol_id is not null then
      if not exists (select 1 from public.protocol_medications pm
                     where pm.medication_id = (v_item->>'medication_id')::uuid and pm.protocol_id = p_protocol_id) then
        raise exception 'Medicamento % no está asignado al protocolo', v_item->>'medication_id' using errcode = 'check_violation';
      end if;
    end if;
    insert into public.reception_items (reception_id, medication_id, lot_number, expiry_date, quantity)
    values (v_id, (v_item->>'medication_id')::uuid, v_item->>'lot_number',
            nullif(v_item->>'expiry_date','')::date, (v_item->>'quantity')::integer);
  end loop;
  return v_id;
end;
$$;
grant execute on function public.create_reception(public.reception_kind, uuid, date, text, jsonb) to authenticated;

-- 6 · Vista de stock: gana columna 'tipo' (al final) + ámbito ambulatoria por UNION ALL
create or replace view public.v_medication_stock
with (security_invoker = true) as
select
  m.id as medication_id, pm.protocol_id, m.name, m.unit, m.low_stock_threshold,
  coalesce(sum(ml.quantity_on_hand), 0)                                   as total_stock,
  coalesce(sum(ml.quantity_on_hand), 0) <= m.low_stock_threshold          as is_low_stock,
  coalesce(ml.tipo, 'protocolo')::public.reception_kind                   as tipo
from public.protocol_medications pm
join public.medications m on m.id = pm.medication_id
left join public.medication_lots ml
  on ml.medication_id = pm.medication_id and ml.protocol_id = pm.protocol_id
group by m.id, pm.protocol_id, ml.tipo
union all
select
  m.id, null::uuid, m.name, m.unit, m.low_stock_threshold,
  coalesce(sum(ml.quantity_on_hand), 0),
  coalesce(sum(ml.quantity_on_hand), 0) <= m.low_stock_threshold,
  'ambulatoria'::public.reception_kind
from public.medications m
join public.medication_lots ml on ml.medication_id = m.id and ml.protocol_id is null
group by m.id;
comment on view public.v_medication_stock is 'Stock por (medicamento, ámbito): protocolo sobre la asignación + ambulatoria (protocol_id null). Columna tipo. 0035.';
