-- Spira · Migración 0032 — Pharma: catálogo global + stock por protocolo + asignación explícita
-- ----------------------------------------------------------------------------
-- Revierte medications.protocol_id: el catálogo pasa a ser GLOBAL (un producto, único
-- por GTIN). El protocolo vive ahora en el STOCK (medication_lots) y en una asignación
-- explícita (protocol_medications). La coherencia medicamento↔protocolo no se pierde:
-- se reubica a protocol_medications (en recepción/solicitud) y al lote (en dispensación),
-- lo cual es más preciso para la trazabilidad de ANMAT.
--
-- Las tablas de Pharma están VACÍAS en prod (confirmado 2026-06-25) → puro cambio de
-- schema, sin backfill. Aplicar a mano en el SQL Editor (como postgres), después de la 0031.
--
-- IDEMPOTENTE: se puede re-ejecutar sin error (if not exists + guardas), por si una corrida
-- previa aplicó parcial. ORDEN (respeta dependencias): tablas nuevas → ALTER lots →
-- ALTER medications(add) → reescribir triggers → recrear vista → DROP medications.protocol_id
-- → RLS/grants → RPCs → índices/auditoría. (Vista y triggers se recrean ANTES del drop.)
-- ============================================================================

-- 0 · Enum: asegurar el tipo de movimiento de ajuste manual (idempotente)
alter type public.stock_movement_type add value if not exists 'ajuste_manual';


-- 1 · Principio activo (global) ----------------------------------------------
create table if not exists public.drugs (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null unique,
  created_at timestamptz not null default now()
);
comment on table public.drugs is 'Principio activo / monodroga. Catálogo global, transversal a protocolos.';

-- 2 · Asignación protocolo ↔ medicamento (allow-list; ancla de coherencia) ----
create table if not exists public.protocol_medications (
  id            uuid primary key default uuid_generate_v4(),
  protocol_id   uuid not null references public.protocols(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete restrict,
  created_at    timestamptz not null default now(),
  unique (protocol_id, medication_id)
);
comment on table public.protocol_medications is 'Qué medicamentos usa cada protocolo. Allow-list; reubica la coherencia que estaba en medications.protocol_id.';

-- 3 · Mapeo código de barras → medicamento (GTIN único global) ----------------
create table if not exists public.medication_codes (
  id            uuid primary key default uuid_generate_v4(),
  medication_id uuid not null references public.medications(id) on delete cascade,
  code          text not null unique,
  code_type     text not null default 'ean13' check (code_type in ('ean13','gs1','interno')),
  created_at    timestamptz not null default now()
);
comment on table public.medication_codes is 'Código de barras (GTIN/EAN/interno) → medicamento. code único global: un GTIN = un producto.';


-- 4 · medication_lots: gana protocol_id; el unique pasa a incluir el protocolo --
alter table public.medication_lots add column if not exists protocol_id uuid references public.protocols(id) on delete restrict;
alter table public.medication_lots alter column protocol_id set not null;   -- seguro: tabla vacía

-- Dropear el unique(medication_id, lot_number) viejo buscándolo dinámicamente (sin depender del nombre)
do $$
declare v_con text;
begin
  select c.conname into v_con
  from pg_constraint c
  where c.conrelid = 'public.medication_lots'::regclass and c.contype = 'u'
    and (select array_agg(a.attname::text order by a.attname::text)
           from unnest(c.conkey) k join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
        = array['lot_number','medication_id']::text[];
  if v_con is not null then
    execute format('alter table public.medication_lots drop constraint %I', v_con);
  end if;
end $$;

-- Agregar el nuevo unique (si no está ya)
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.medication_lots'::regclass and conname = 'medication_lots_med_proto_lot_key') then
    alter table public.medication_lots add constraint medication_lots_med_proto_lot_key unique (medication_id, protocol_id, lot_number);
  end if;
end $$;
-- (el unique compuesto (id, medication_id) que soporta los FK de dispensation_items / stock_movements queda intacto)


-- 5 · medications: agrega drug_id (el drop de protocol_id va más abajo, tras recrear vista/triggers)
alter table public.medications add column if not exists drug_id uuid references public.drugs(id) on delete restrict;


-- 6 · Reescritura de triggers: coherencia por asignación (recepción/solicitud) y por lote (dispensación)
create or replace function public.apply_reception_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_lot_id uuid;
begin
  if new.status = 'verificada' and old.status is distinct from 'verificada' then
    for r in select * from public.reception_items where reception_id = new.id loop
      if not exists (select 1 from public.protocol_medications pm
                     where pm.medication_id = r.medication_id and pm.protocol_id = new.protocol_id) then
        raise exception 'El medicamento % no está asignado al protocolo % de la recepción',
          r.medication_id, new.protocol_id using errcode = 'check_violation';
      end if;
      insert into public.medication_lots (medication_id, protocol_id, lot_number, expiry_date, quantity_on_hand)
      values (r.medication_id, new.protocol_id, r.lot_number, r.expiry_date, r.quantity)
      on conflict (medication_id, protocol_id, lot_number) do update
        set quantity_on_hand = medication_lots.quantity_on_hand + excluded.quantity_on_hand,
            expiry_date       = coalesce(medication_lots.expiry_date, excluded.expiry_date)
      returning id into v_lot_id;
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

create or replace function public.check_request_item_protocol()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_protocol_id uuid;
begin
  select e.protocol_id into v_protocol_id
  from public.dispensation_requests dr
  join public.patient_visits pv on pv.id = dr.visit_id
  join public.enrollments e     on e.id  = pv.enrollment_id
  where dr.id = new.request_id;
  if not exists (select 1 from public.protocol_medications pm
                 where pm.medication_id = new.medication_id and pm.protocol_id = v_protocol_id) then
    raise exception 'Medicamento % no está asignado al protocolo % de la solicitud',
      new.medication_id, v_protocol_id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function public.check_dispensation_item_protocol()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_protocol_id uuid; v_lot_protocol uuid;
begin
  select e.protocol_id into v_protocol_id
  from public.dispensations d
  join public.dispensation_requests dr on dr.id = d.request_id
  join public.patient_visits pv on pv.id = dr.visit_id
  join public.enrollments e     on e.id  = pv.enrollment_id
  where d.id = new.dispensation_id;
  select protocol_id into v_lot_protocol from public.medication_lots where id = new.lot_id;
  if v_lot_protocol is distinct from v_protocol_id then
    raise exception 'El lote % (protocolo %) no corresponde al protocolo % de la dispensación',
      new.lot_id, v_lot_protocol, v_protocol_id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


-- 7 · Vista de stock: por (medicamento, protocolo), sobre la asignación (muestra stock cero)
--     Mismas columnas/orden que la vista anterior → create or replace es válido.
create or replace view public.v_medication_stock
with (security_invoker = true) as
select
  m.id                                       as medication_id,
  pm.protocol_id,
  m.name,
  m.unit,
  m.low_stock_threshold,
  coalesce(sum(ml.quantity_on_hand), 0)      as total_stock,
  coalesce(sum(ml.quantity_on_hand), 0) <= m.low_stock_threshold as is_low_stock
from public.protocol_medications pm
join public.medications m on m.id = pm.medication_id
left join public.medication_lots ml
  on ml.medication_id = pm.medication_id and ml.protocol_id = pm.protocol_id
group by m.id, pm.protocol_id;
comment on view public.v_medication_stock is 'Stock por (medicamento, protocolo) sobre la asignación; total = suma de lotes de ese protocolo + flag de stock bajo.';


-- 8 · Ahora sí, drop de medications.protocol_id (ya nada lo referencia: vista y triggers recreados)
drop index if exists public.idx_medications_protocol;          -- de la 0005
alter table public.medications drop column if exists protocol_id;


-- 9 · RLS + grants de las tablas nuevas (pharma central; catálogo lo administra leader, códigos operator)
alter table public.drugs                enable row level security;
alter table public.protocol_medications enable row level security;
alter table public.medication_codes     enable row level security;

drop policy if exists "ver drogas" on public.drugs;
create policy "ver drogas" on public.drugs for select
  using (public.has_module('pharma') or public.has_module('gerencia') or public.has_module('contable'));
drop policy if exists "pharma leader administra drogas" on public.drugs;
create policy "pharma leader administra drogas" on public.drugs for all
  using (public.has_min_role('pharma','leader')) with check (public.has_min_role('pharma','leader'));

drop policy if exists "ver asignacion" on public.protocol_medications;
create policy "ver asignacion" on public.protocol_medications for select
  using (public.has_module('pharma') or public.has_module('gerencia'));
drop policy if exists "pharma leader asigna" on public.protocol_medications;
create policy "pharma leader asigna" on public.protocol_medications for all
  using (public.has_min_role('pharma','leader')) with check (public.has_min_role('pharma','leader'));

drop policy if exists "ver codigos" on public.medication_codes;
create policy "ver codigos" on public.medication_codes for select
  using (public.has_module('pharma') or public.has_module('gerencia'));
drop policy if exists "pharma administra codigos" on public.medication_codes;
create policy "pharma administra codigos" on public.medication_codes for all
  using (public.has_min_role('pharma','operator')) with check (public.has_min_role('pharma','operator'));

-- Grants a authenticated (PostgREST necesita el grant aunque la RLS filtre; idempotente)
grant select, insert, update, delete on public.drugs                to authenticated;
grant select, insert, update, delete on public.protocol_medications to authenticated;
grant select, insert, update, delete on public.medication_codes     to authenticated;


-- 10 · RPCs (SECURITY DEFINER, authz a mano; actor server-side con auth.uid())
create or replace function public.create_drug(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para crear drogas' using errcode = '42501'; end if;
  insert into public.drugs (name) values (btrim(p_name)) returning id into v_id;
  return v_id;
end;
$$;
comment on function public.create_drug is 'Alta de droga (principio activo) global. pharma leader+. SECURITY DEFINER. 0032.';

create or replace function public.create_medication(
  p_drug_id uuid, p_name text, p_unit text, p_low_stock_threshold integer default 5, p_gtin text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para crear medicamentos' using errcode = '42501'; end if;
  insert into public.medications (drug_id, name, unit, low_stock_threshold, created_by)
  values (p_drug_id, p_name, p_unit, p_low_stock_threshold, auth.uid())
  returning id into v_id;
  if p_gtin is not null and btrim(p_gtin) <> '' then
    insert into public.medication_codes (medication_id, code, code_type) values (v_id, btrim(p_gtin), 'ean13');
  end if;
  return v_id;
end;
$$;
comment on function public.create_medication is 'Alta de medicamento global (sin protocolo) + GTIN opcional en medication_codes. pharma leader+. SECURITY DEFINER. 0032.';

create or replace function public.assign_medication_to_protocol(p_protocol_id uuid, p_medication_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para asignar medicamentos a protocolos' using errcode = '42501'; end if;
  insert into public.protocol_medications (protocol_id, medication_id)
  values (p_protocol_id, p_medication_id)
  on conflict (protocol_id, medication_id) do nothing;
end;
$$;
comment on function public.assign_medication_to_protocol is 'Asigna un medicamento a un protocolo (allow-list). pharma leader+. SECURITY DEFINER. 0032.';

create or replace function public.create_reception(
  p_protocol_id uuid, p_reception_date date, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_item jsonb;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para crear recepciones' using errcode = '42501'; end if;
  insert into public.medication_receptions (protocol_id, received_by, reception_date, status, notes)
  values (p_protocol_id, auth.uid(), p_reception_date, 'pendiente', p_notes)
  returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if not exists (select 1 from public.protocol_medications pm
                   where pm.medication_id = (v_item->>'medication_id')::uuid and pm.protocol_id = p_protocol_id) then
      raise exception 'Medicamento % no está asignado al protocolo', v_item->>'medication_id' using errcode = 'check_violation';
    end if;
    insert into public.reception_items (reception_id, medication_id, lot_number, expiry_date, quantity)
    values (v_id, (v_item->>'medication_id')::uuid, v_item->>'lot_number',
            nullif(v_item->>'expiry_date','')::date, (v_item->>'quantity')::integer);
  end loop;
  return v_id;
end;
$$;
comment on function public.create_reception is 'Crea recepción (pendiente) + ítems, atómico; valida asignación al protocolo. pharma leader+. SECURITY DEFINER. 0032.';

create or replace function public.verify_reception(p_reception_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status reception_status;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para verificar recepciones' using errcode = '42501'; end if;
  select status into v_status from public.medication_receptions where id = p_reception_id for update;
  if v_status is null then raise exception 'Recepción % inexistente', p_reception_id using errcode = 'foreign_key_violation'; end if;
  if v_status <> 'pendiente' then raise exception 'La recepción % no está pendiente (está %)', p_reception_id, v_status using errcode = 'check_violation'; end if;
  update public.medication_receptions set status = 'verificada' where id = p_reception_id;
  -- los triggers set_reception_verified (sella) + apply_reception_stock (ingresa stock) hacen el resto
end;
$$;
comment on function public.verify_reception is 'Verifica una recepción pendiente (una sola vez) → los triggers ingresan stock. pharma leader+. SECURITY DEFINER. 0032.';

create or replace function public.adjust_stock(p_lot_id uuid, p_quantity_delta integer, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_med uuid; v_stock integer;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para ajustar stock' using errcode = '42501'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'El ajuste manual requiere un motivo' using errcode = 'check_violation'; end if;
  select medication_id, quantity_on_hand into v_med, v_stock from public.medication_lots where id = p_lot_id for update;
  if v_med is null then raise exception 'Lote % inexistente', p_lot_id using errcode = 'foreign_key_violation'; end if;
  if v_stock + p_quantity_delta < 0 then
    raise exception 'El ajuste dejaría el stock por debajo de cero (% disponible, % ajuste)', v_stock, p_quantity_delta using errcode = 'check_violation';
  end if;
  update public.medication_lots set quantity_on_hand = quantity_on_hand + p_quantity_delta where id = p_lot_id;
  insert into public.stock_movements (medication_id, lot_id, movement_type, quantity_delta, reference_type, reason, created_by)
  values (v_med, p_lot_id, 'ajuste_manual', p_quantity_delta, 'ajuste_manual', p_reason, auth.uid());
end;
$$;
comment on function public.adjust_stock is 'Ajuste manual de stock de un lote (+/-) con motivo obligatorio → stock_movements; check >= 0. pharma leader+. SECURITY DEFINER. 0032.';

grant execute on function
  public.create_drug(text),
  public.create_medication(uuid, text, text, integer, text),
  public.assign_medication_to_protocol(uuid, uuid),
  public.create_reception(uuid, date, text, jsonb),
  public.verify_reception(uuid),
  public.adjust_stock(uuid, integer, text)
  to authenticated;


-- 11 · Índices + auditoría de las tablas nuevas
create index if not exists idx_medications_drug              on public.medications(drug_id);
create index if not exists idx_medication_lots_protocol      on public.medication_lots(protocol_id);
create index if not exists idx_protocol_medications_protocol on public.protocol_medications(protocol_id);
create index if not exists idx_medication_codes_medication   on public.medication_codes(medication_id);

drop trigger if exists trg_audit_protocol_medications on public.protocol_medications;
create trigger trg_audit_protocol_medications
  after insert or update or delete on public.protocol_medications
  for each row execute function public.audit_row();
