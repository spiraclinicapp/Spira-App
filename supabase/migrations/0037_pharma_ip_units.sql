-- Spira · Migración 0037 — Pharma: Producto de Investigación (IP), rastreo por unidad.
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0036. IDEMPOTENTE.
-- Entidad nueva ip_units (una fila = un kit). NO toca la base (medications/medication_lots).
-- ⚠️ El AI del N° de kit no está confirmado: validar con un escaneo real antes de confiar el unique.
-- ============================================================================

-- 1 · Enum del estado de la unidad (extensible; Tajada 2 usa 'dispensada').
do $$ begin
  if not exists (select 1 from pg_type where typname = 'ip_unit_status') then
    create type public.ip_unit_status as enum ('pendiente','en_stock','dispensada','devuelta','baja');
  end if;
end $$;

-- 2 · Tabla ip_units. Identidad = protocolo + N° de kit. Ganchos de dispensación nullable (Tajada 2).
create table if not exists public.ip_units (
  id           uuid primary key default uuid_generate_v4(),
  protocol_id  uuid not null references public.protocols(id) on delete restrict,
  reception_id uuid not null references public.medication_receptions(id) on delete restrict,
  kit_number   text not null check (btrim(kit_number) <> ''),
  raw_code     text,
  gtin         text,
  lot_number   text,
  expiry_date  date,
  drug_id      uuid references public.drugs(id) on delete restrict,
  status       public.ip_unit_status not null default 'pendiente',
  dispensed_to_enrollment_id uuid references public.enrollments(id) on delete restrict,
  dispensed_visit_id         uuid references public.patient_visits(id) on delete restrict,
  dispensed_at               timestamptz,
  created_by   uuid not null references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (protocol_id, kit_number)
);
comment on table public.ip_units is 'Unidades de Producto de Investigación (kits). Una fila = una unidad rastreable. Identidad = protocolo + kit_number. 0037.';

create index if not exists ip_units_reception_idx on public.ip_units (reception_id);
create index if not exists ip_units_status_idx    on public.ip_units (status);
create index if not exists ip_units_expiry_idx    on public.ip_units (expiry_date);

-- 3 · Triggers espejo del patrón del repo (0003): updated_at + auditoría.
drop trigger if exists trg_ip_units_updated_at on public.ip_units;
create trigger trg_ip_units_updated_at before update on public.ip_units
  for each row execute function public.set_updated_at();
drop trigger if exists trg_audit_ip_units on public.ip_units;
create trigger trg_audit_ip_units after insert or update or delete on public.ip_units
  for each row execute function public.audit_row();

-- 4 · RLS: Pharma es central. Lectura pharma/gerencia; escritura operator+; borrado gerencia.
alter table public.ip_units enable row level security;
drop policy if exists "pharma/gerencia ven IP" on public.ip_units;
create policy "pharma/gerencia ven IP" on public.ip_units for select
  using (public.has_module('pharma') or public.has_module('gerencia'));
drop policy if exists "pharma inserta IP" on public.ip_units;
create policy "pharma inserta IP" on public.ip_units for insert
  with check (public.has_module('pharma'));
drop policy if exists "pharma edita IP" on public.ip_units;
create policy "pharma edita IP" on public.ip_units for update
  using (public.has_module('pharma')) with check (public.has_module('pharma'));
drop policy if exists "gerencia borra IP" on public.ip_units;
create policy "gerencia borra IP" on public.ip_units for delete
  using (public.has_module('gerencia'));
grant select, insert, update, delete on public.ip_units to authenticated;

-- 5 · Extensión del trigger apply_reception_stock: rama IP con RETURN temprano (no entra al loop de
-- reception_items ni toca stock_movements). La rama de base (0035) queda idéntica.
create or replace function public.apply_reception_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_lot_id uuid;
begin
  if new.status = 'verificada' and old.status is distinct from 'verificada' then
    -- Rama IP: promover las unidades pendientes de esta recepción a stock. Idempotente.
    if new.tipo = 'investigacion' then
      update public.ip_units set status = 'en_stock', updated_at = now()
       where reception_id = new.id and status = 'pendiente';
      return new;
    end if;
    -- Rama base (0035): cantidad por lote.
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

-- 6 · RPC create_ip_reception: atómico, leader+. Pre-valida kits duplicados en el protocolo.
create or replace function public.create_ip_reception(
  p_protocol_id uuid, p_reception_date date, p_notes text, p_units jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_unit jsonb; v_dupes text;
begin
  if not public.has_min_role('pharma','leader') then
    raise exception 'Sin permiso para crear recepciones de investigación' using errcode = '42501';
  end if;
  if p_protocol_id is null then
    raise exception 'El Producto de Investigación requiere un protocolo' using errcode = 'check_violation';
  end if;
  -- Pre-validar: listar los N° de kit que ya existan en el protocolo (accountability), antes de insertar.
  select string_agg(u.kit_number, ', ') into v_dupes
    from public.ip_units u
   where u.protocol_id = p_protocol_id
     and u.kit_number in (select btrim(e->>'kit_number') from jsonb_array_elements(p_units) e);
  if v_dupes is not null then
    raise exception 'Estos N° de kit ya están registrados en el protocolo: %', v_dupes using errcode = 'check_violation';
  end if;
  insert into public.medication_receptions (tipo, protocol_id, received_by, reception_date, status, notes)
  values ('investigacion', p_protocol_id, auth.uid(), p_reception_date, 'pendiente', p_notes)
  returning id into v_id;
  for v_unit in select * from jsonb_array_elements(p_units) loop
    insert into public.ip_units
      (protocol_id, reception_id, kit_number, raw_code, gtin, lot_number, expiry_date, drug_id, status, created_by)
    values (
      p_protocol_id, v_id,
      btrim(v_unit->>'kit_number'),
      nullif(v_unit->>'raw_code',''),
      nullif(v_unit->>'gtin',''),
      nullif(v_unit->>'lot_number',''),
      nullif(v_unit->>'expiry_date','')::date,
      nullif(v_unit->>'drug_id','')::uuid,
      'pendiente', auth.uid()
    );
  end loop;
  return v_id;
end;
$$;
grant execute on function public.create_ip_reception(uuid, date, text, jsonb) to authenticated;

-- 7 · Vista de stock del IP: fila por unidad. por_vencer excluye las ya vencidas.
create or replace view public.v_ip_units with (security_invoker = true) as
select
  u.id, u.protocol_id, p.code as protocol_code,
  u.kit_number, u.lot_number, u.expiry_date,
  u.drug_id, d.name as drug_name,
  u.status,
  (u.expiry_date is not null and u.expiry_date <  current_date)                             as vencida,
  (u.expiry_date is not null and u.expiry_date >= current_date
                             and u.expiry_date <  current_date + 30)                         as por_vencer
from public.ip_units u
join public.protocols p on p.id = u.protocol_id
left join public.drugs d on d.id = u.drug_id;
comment on view public.v_ip_units is 'Stock de IP: una fila por unidad (kit). drug_name NULL = cegado. 0037.';
