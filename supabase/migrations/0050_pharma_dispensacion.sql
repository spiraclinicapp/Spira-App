-- Spira · Migración 0050 — Pharma: dispensación (medicación asignada + doble enforcement + RPCs)
-- ============================================================================
-- Cablea el submódulo de dispensación sobre la infraestructura que ya existe en la base
-- (dispensation_requests/_items → dispensations/_items + triggers de stock, verificada con el
-- harness de 2026-07-13). Agrega:
--   1. patient_medications: qué medicación habilitó la farmacéutica para CADA paciente.
--   2. Doble enforcement en la base (no solo la UI): la solicitud (Track) y la entrega (Pharma)
--      solo aceptan medicación habilitada para ese paciente / pedida en esa solicitud.
--   3. RPCs de flujo: solicitar (Track) · cancelar (Track) · rechazar (Pharma) · resolver en un
--      paso con FEFO atómico (Pharma).
--
-- Alcance v1 (ver design doc de dispensación): un paso, un lote sugerido por FEFO SIN partición
-- entre lotes ni override manual (diferidos a v1.1). Producto de Investigación e IVRS fuera de
-- alcance.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), en orden, DESPUÉS de la 0049.
-- IDEMPOTENTE: re-ejecutable (if not exists + create or replace + drop/create de triggers y
-- policies). Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Medicación asignada por paciente -------------------------------------------------------
-- FK a enrollment_id (NO patient_id): un paciente puede tener varios enrolamientos/protocolos y
-- la habilitación es POR protocolo, igual que protocol_medications. active permite desactivar
-- sin borrar (regla de datos reales + ANMAT). unique impide duplicar la misma medicación.
create table if not exists public.patient_medications (
  id            uuid primary key default uuid_generate_v4(),
  enrollment_id uuid not null references public.enrollments(id)  on delete restrict,
  medication_id uuid not null references public.medications(id)  on delete restrict,
  assigned_by   uuid not null default auth.uid() references public.users(id),
  active        boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (enrollment_id, medication_id)
);
comment on table public.patient_medications is 'Medicación habilitada por paciente (enrolamiento). La asigna Pharma; Track la ve de solo lectura. La dispensación solo permite medicación habilitada acá.';

-- Coherencia: el medicamento tiene que estar asignado al protocolo del enrolamiento
-- (protocol_medications). Espeja el patrón de check_request_item_protocol.
create or replace function public.check_patient_med_protocol()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_protocol_id uuid;
begin
  select e.protocol_id into v_protocol_id from public.enrollments e where e.id = new.enrollment_id;
  if not exists (select 1 from public.protocol_medications pm
                 where pm.medication_id = new.medication_id and pm.protocol_id = v_protocol_id) then
    raise exception 'El medicamento % no está asignado al protocolo % del paciente',
      new.medication_id, v_protocol_id using errcode = 'check_violation';
  end if;
  return new;
end; $$;

drop trigger if exists trg_check_patient_med_protocol on public.patient_medications;
create trigger trg_check_patient_med_protocol
  before insert or update of medication_id, enrollment_id on public.patient_medications
  for each row execute function public.check_patient_med_protocol();

drop trigger if exists trg_patient_medications_updated_at on public.patient_medications;
create trigger trg_patient_medications_updated_at
  before update on public.patient_medications
  for each row execute function public.set_updated_at();

drop trigger if exists trg_audit_patient_medications on public.patient_medications;
create trigger trg_audit_patient_medications
  after insert or update or delete on public.patient_medications
  for each row execute function public.audit_row();


-- 2 · Doble enforcement en los triggers EXISTENTES ------------------------------------------
-- (a) SOLICITUD (Track): además de protocol_medications, exigir patient_medications ACTIVA.
create or replace function public.check_request_item_protocol()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_protocol_id uuid; v_enrollment_id uuid;
begin
  select e.protocol_id, e.id into v_protocol_id, v_enrollment_id
  from public.dispensation_requests dr
  join public.patient_visits pv on pv.id = dr.visit_id
  join public.enrollments e     on e.id  = pv.enrollment_id
  where dr.id = new.request_id;
  if not exists (select 1 from public.protocol_medications pm
                 where pm.medication_id = new.medication_id and pm.protocol_id = v_protocol_id) then
    raise exception 'Medicamento % no está asignado al protocolo % de la solicitud',
      new.medication_id, v_protocol_id using errcode = 'check_violation';
  end if;
  -- (0050) tiene que estar habilitado ESPECÍFICAMENTE para este paciente (medicación asignada activa)
  if not exists (select 1 from public.patient_medications pmed
                 where pmed.enrollment_id = v_enrollment_id
                   and pmed.medication_id = new.medication_id
                   and pmed.active) then
    raise exception 'Medicamento % no está habilitado para este paciente (medicación asignada)',
      new.medication_id using errcode = 'check_violation';
  end if;
  return new;
end; $$;

-- (b) ENTREGA (Pharma): además de lote↔protocolo, exigir que el medicamento entregado sea uno
--     de los pedidos en la solicitud vinculada (cierra el enforcement del lado de mover stock).
create or replace function public.check_dispensation_item_protocol()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_protocol_id uuid; v_lot_protocol uuid; v_request_id uuid; v_enrollment_id uuid;
begin
  select e.protocol_id, d.request_id, e.id into v_protocol_id, v_request_id, v_enrollment_id
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
  -- (0050) el medicamento entregado debe figurar en los ítems de la solicitud
  if not exists (select 1 from public.dispensation_request_items dri
                 where dri.request_id = v_request_id and dri.medication_id = new.medication_id) then
    raise exception 'Medicamento % no figura en la solicitud vinculada',
      new.medication_id using errcode = 'check_violation';
  end if;
  -- (0050) la medicación debe SEGUIR habilitada al entregar: si Pharma la deshabilitó entre el
  -- pedido y la entrega, se bloquea (decisión clínica: no dispensar algo marcado deshabilitado).
  if not exists (select 1 from public.patient_medications pmed
                 where pmed.enrollment_id = v_enrollment_id
                   and pmed.medication_id = new.medication_id
                   and pmed.active) then
    raise exception 'Medicamento % ya no está habilitado para este paciente (fue deshabilitado)',
      new.medication_id using errcode = 'check_violation';
  end if;
  return new;
end; $$;


-- 3 · RLS de patient_medications ------------------------------------------------------------
-- Pharma (central): ve/asigna/modifica. Track: SOLO lectura, scopeado a sus protocolos.
-- Gerencia: borra (soft-delete vía active=false es lo normal; el DELETE duro queda a gerencia).
alter table public.patient_medications enable row level security;

drop policy if exists "ver medicación asignada"       on public.patient_medications;
drop policy if exists "pharma asigna medicación"       on public.patient_medications;
drop policy if exists "pharma modifica medicación"     on public.patient_medications;
drop policy if exists "gerencia elimina medicación"    on public.patient_medications;

create policy "ver medicación asignada" on public.patient_medications for select using (
  public.has_module('pharma') or public.has_module('gerencia')
  or exists (select 1 from public.enrollments e
             where e.id = patient_medications.enrollment_id
               and public.is_assigned_coordinator(e.protocol_id))          -- track scopeado
);
create policy "pharma asigna medicación" on public.patient_medications for insert
  with check (public.has_min_role('pharma','operator'));            -- escribir exige operator (viewer = solo lectura)
create policy "pharma modifica medicación" on public.patient_medications for update
  using (public.has_min_role('pharma','operator')) with check (public.has_min_role('pharma','operator'));
create policy "gerencia elimina medicación" on public.patient_medications for delete
  using (public.has_module('gerencia'));


-- 4 · Índice de apoyo para FEFO -------------------------------------------------------------
-- La resolución elige el lote que vence antes, por (medicamento, protocolo), con stock > 0.
-- Incluye created_at + lot_number para que el desempate del ORDER BY (ver resolve_dispensation)
-- quede cubierto por el índice y sea auditable/reproducible.
create index if not exists idx_med_lots_fefo
  on public.medication_lots (medication_id, protocol_id, expiry_date, created_at, lot_number)
  where quantity_on_hand > 0;


-- 5 · RPC · Track solicita dispensación desde una visita ------------------------------------
-- p_items: jsonb [{ "medication_id": "...", "quantity": N }, ...]. Los triggers validan que cada
-- medicamento esté habilitado para el paciente (nunca texto libre).
create or replace function public.create_dispensation_request(
  p_visit_id uuid, p_items jsonb, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_request_id uuid; v_item jsonb; v_dispenses boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  -- authz espeja la RLS de "track crea solicitudes" (0009): admin ve cualquier visita; operator
  -- solo las que coordina. coordina_visita "pelado" dejaría entrar a un viewer coordinador.
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id))) then
    raise exception 'No tenés permiso para solicitar dispensación de esta visita' using errcode = '42501';
  end if;

  select coalesce(vd.dispenses, false) into v_dispenses
    from public.patient_visits pv
    left join public.visit_definitions vd on vd.id = pv.visit_def_id
    where pv.id = p_visit_id;
  if not found then
    raise exception 'Visita inexistente' using errcode = '23503';
  end if;
  if not coalesce(v_dispenses, false) then
    raise exception 'Esta visita no entrega medicación' using errcode = 'check_violation';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La solicitud no tiene ítems' using errcode = 'check_violation';
  end if;

  insert into public.dispensation_requests (visit_id, requested_by, status, source, notes)
    values (p_visit_id, auth.uid(), 'solicitada', 'manual', nullif(btrim(coalesce(p_notes,'')),''))
    returning id into v_request_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- validar forma ANTES del cast: una key ausente daría NULL y el check de cantidad no dispararía,
    -- cayendo en un 23502 crudo en vez del mensaje sereno. Exigir objeto con ambas keys no nulas.
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
    -- trg check_request_item_protocol valida asignación de protocolo + patient_medications
  end loop;

  return v_request_id;
end; $$;
revoke all on function public.create_dispensation_request(uuid, jsonb, text) from public;
grant execute on function public.create_dispensation_request(uuid, jsonb, text) to authenticated;


-- 6 · RPC · Track cancela su solicitud (solo si sigue pendiente) -----------------------------
create or replace function public.cancel_dispensation_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_visit_id uuid; v_status request_status;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  select visit_id, status into v_visit_id, v_status
    from public.dispensation_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.coordina_visita(v_visit_id))) then
    raise exception 'No tenés permiso para cancelar esta solicitud' using errcode = '42501';
  end if;
  if v_status <> 'solicitada' then
    raise exception 'Solo se puede cancelar una solicitud pendiente (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;
  update public.dispensation_requests set status = 'cancelada' where id = p_request_id;
end; $$;
revoke all on function public.cancel_dispensation_request(uuid) from public;
grant execute on function public.cancel_dispensation_request(uuid) to authenticated;


-- 7 · RPC · Pharma rechaza una solicitud (con motivo obligatorio) ----------------------------
create or replace function public.reject_dispensation_request(p_request_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status request_status;
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
  if v_status <> 'solicitada' then
    raise exception 'Solo se puede rechazar una solicitud pendiente (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;
  update public.dispensation_requests
    set status = 'rechazada', rejection_reason = btrim(p_reason) where id = p_request_id;
end; $$;
revoke all on function public.reject_dispensation_request(uuid, text) from public;
grant execute on function public.reject_dispensation_request(uuid, text) to authenticated;


-- 8 · RPC · Pharma resuelve en UN PASO (FEFO, atómico) ---------------------------------------
-- Crea la dispensación (en_preparacion) + ítems eligiendo el lote FEFO por medicamento, la pasa a
-- entregada (dispara apply_dispensation_stock → descuenta stock + stock_movements) y cierra la
-- solicitud (atendida). Todo en una transacción: si algo falla, se revierte entero.
-- v1: un lote por medicamento, SIN partición (si el lote FEFO no alcanza, bloquea).
create or replace function public.resolve_dispensation(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_status      request_status;
  v_protocol_id uuid;
  v_dispensation_id uuid;
  v_item        record;
  v_lot         record;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then                -- viewer = solo lectura, no dispensa
    raise exception 'Solo Pharma (operador) puede resolver dispensaciones' using errcode = '42501';
  end if;

  -- lock la solicitud + resolver su protocolo
  select dr.status, e.protocol_id into v_status, v_protocol_id
  from public.dispensation_requests dr
  join public.patient_visits pv on pv.id = dr.visit_id
  join public.enrollments e     on e.id  = pv.enrollment_id
  where dr.id = p_request_id
  for update of dr;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;
  if v_status <> 'solicitada' then
    raise exception 'Esta solicitud ya fue % (no está pendiente)', v_status using errcode = 'check_violation';
  end if;

  insert into public.dispensations (request_id, executed_by, status)
    values (p_request_id, auth.uid(), 'en_preparacion')
    returning id into v_dispensation_id;

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
      (v_dispensation_id, v_item.medication_id, v_lot.id, v_item.quantity, v_lot.lot_number, v_lot.expiry_date);
    -- trg check_dispensation_item_protocol valida lote↔protocolo + medicamento↔solicitud
  end loop;

  -- entregar (dispara el descuento de stock) + cerrar la solicitud
  update public.dispensations set status = 'entregada' where id = v_dispensation_id;
  update public.dispensation_requests set status = 'atendida' where id = p_request_id;

  return v_dispensation_id;
end; $$;
revoke all on function public.resolve_dispensation(uuid) from public;
grant execute on function public.resolve_dispensation(uuid) to authenticated;
