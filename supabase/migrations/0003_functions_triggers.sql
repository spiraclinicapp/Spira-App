-- Spira · Migración 0003 — Funciones, triggers, validaciones y auditoría

-- ============================================================================
-- 10 · FUNCIONES Y TRIGGERS
-- Las funciones del sistema son SECURITY DEFINER: corren como su OWNER (postgres,
-- dueño de las tablas) y por lo tanto BYPASSEAN RLS. Eso permite que los triggers
-- generen filas del sistema (patient_visits, stock_movements, checklist_items,
-- audit_log) sin necesidad de policies INSERT abiertas al cliente. Requiere que
-- el owner sea postgres (lo es al correr este script como tal en el SQL Editor).
-- ============================================================================

-- 10.1 · updated_at automático ----------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated_at                before update on public.users                  for each row execute function public.set_updated_at();
create trigger trg_protocols_updated_at            before update on public.protocols              for each row execute function public.set_updated_at();
create trigger trg_patients_updated_at             before update on public.patients               for each row execute function public.set_updated_at();
create trigger trg_enrollments_updated_at          before update on public.enrollments            for each row execute function public.set_updated_at();
create trigger trg_patient_visits_updated_at       before update on public.patient_visits         for each row execute function public.set_updated_at();
create trigger trg_medications_updated_at          before update on public.medications            for each row execute function public.set_updated_at();
create trigger trg_medication_lots_updated_at      before update on public.medication_lots        for each row execute function public.set_updated_at();
create trigger trg_receptions_updated_at           before update on public.medication_receptions  for each row execute function public.set_updated_at();
create trigger trg_requests_updated_at             before update on public.dispensation_requests  for each row execute function public.set_updated_at();
create trigger trg_dispensations_updated_at        before update on public.dispensations          for each row execute function public.set_updated_at();


-- 10.2 · Generación automática de visitas al enrolar ------------------------
create or replace function public.generate_patient_visits()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.patient_visits
    (enrollment_id, visit_def_id, estimated_date, window_start, window_end)
  select
    new.id,
    vd.id,
    new.enrollment_date + vd.offset_days,
    new.enrollment_date + vd.offset_days - vd.window_minus,
    new.enrollment_date + vd.offset_days + vd.window_plus
  from public.visit_definitions vd
  where vd.protocol_id = new.protocol_id;
  return new;
end;
$$;

create trigger trg_generate_visits
  after insert on public.enrollments
  for each row execute function public.generate_patient_visits();


-- 10.3 · Materialización del checklist al marcar visita realizada -----------
-- Copia ítems de la plantilla global + la del protocolo a checklist_items.
create or replace function public.materialize_checklist()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_protocol_id uuid; v_template_id uuid;
begin
  if new.real_date is not null and old.real_date is null then
    -- evitar duplicar si ya hay ítems materializados
    if exists (select 1 from public.checklist_items where visit_id = new.id) then
      return new;
    end if;

    select e.protocol_id into v_protocol_id
    from public.enrollments e where e.id = new.enrollment_id;

    -- usar la plantilla DEL PROTOCOLO si existe; si no, la global madre.
    -- (no se unen para no duplicar ítems con el mismo nombre)
    select id into v_template_id from public.checklist_templates
      where protocol_id = v_protocol_id order by created_at limit 1;
    if v_template_id is null then
      select id into v_template_id from public.checklist_templates
        where protocol_id is null order by created_at limit 1;
    end if;

    if v_template_id is not null then
      insert into public.checklist_items (visit_id, template_item_id, description, deadline_hours, mandatory, sort_order)
      select new.id, ti.id, ti.description, ti.deadline_hours, ti.mandatory, ti.sort_order
      from public.checklist_template_items ti
      where ti.template_id = v_template_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_materialize_checklist
  after update on public.patient_visits
  for each row execute function public.materialize_checklist();


-- 10.4 · Recepción verificada → ingresa stock -------------------------------
create or replace function public.apply_reception_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_lot_id uuid;
begin
  if new.status = 'verificada' and old.status is distinct from 'verificada' then
    for r in select * from public.reception_items where reception_id = new.id loop
      -- el medicamento debe pertenecer al protocolo de la recepción (evita cruce de protocolos)
      if not exists (select 1 from public.medications m
                     where m.id = r.medication_id and m.protocol_id = new.protocol_id) then
        raise exception 'El medicamento % no pertenece al protocolo % de la recepción',
          r.medication_id, new.protocol_id using errcode = 'check_violation';
      end if;

      -- upsert del lote
      insert into public.medication_lots (medication_id, lot_number, expiry_date, quantity_on_hand)
      values (r.medication_id, r.lot_number, r.expiry_date, r.quantity)
      on conflict (medication_id, lot_number) do update
        set quantity_on_hand = medication_lots.quantity_on_hand + excluded.quantity,
            expiry_date       = coalesce(medication_lots.expiry_date, excluded.expiry_date)
      returning id into v_lot_id;

      -- movimiento de stock (+) atribuido a quien VERIFICÓ (no a quien creó la recepción)
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

create trigger trg_apply_reception_stock
  after update on public.medication_receptions
  for each row execute function public.apply_reception_stock();


-- 10.5 · Dispensación entregada → descuenta stock + sella delivered_at ------
create or replace function public.set_delivered_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'entregada' and old.status is distinct from 'entregada'
     and new.delivered_at is null then
    new.delivered_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_dispensation_delivered_at
  before update on public.dispensations
  for each row execute function public.set_delivered_at();

create or replace function public.apply_dispensation_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare it record; v_stock integer;
begin
  if new.status = 'entregada' and old.status is distinct from 'entregada' then
    -- no se puede entregar una dispensación sin renglones (dejaría stock sin mover)
    if not exists (select 1 from public.dispensation_items where dispensation_id = new.id) then
      raise exception 'No se puede entregar la dispensación % sin renglones (dispensation_items)',
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

      -- movimiento de stock (-)
      insert into public.stock_movements
        (medication_id, lot_id, movement_type, quantity_delta, reference_id, reference_type, created_by)
      values
        (it.medication_id, it.lot_id, 'dispensacion', -it.quantity, new.id, 'dispensation', new.executed_by);
    end loop;
  end if;
  return new;
end;
$$;

create trigger trg_apply_dispensation_stock
  after update on public.dispensations
  for each row execute function public.apply_dispensation_stock();


-- 10.6 · Auditoría genérica (insert-only en audit_log) ----------------------
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid;
begin
  -- actor del JWT; si es NULL (DML directo/sistema) intenta una GUC seteada por procesos confiables
  v_actor := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
  insert into public.audit_log
    (actor_id, action, entity_type, entity_id, before_data, after_data, db_role)
  values (
    v_actor,
    tg_op,
    tg_table_name,
    (case when tg_op = 'DELETE' then old.id else new.id end),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    session_user        -- rol de sesión real (no afectado por SECURITY DEFINER): 'authenticator'=vía PostgREST | 'postgres'=DML directo
  );
  return coalesce(new, old);
end;
$$;

-- Aplicado a las tablas críticas (extender a más según haga falta).
create trigger trg_audit_protocols        after insert or update or delete on public.protocols             for each row execute function public.audit_row();
create trigger trg_audit_patients         after insert or update or delete on public.patients              for each row execute function public.audit_row();
create trigger trg_audit_enrollments      after insert or update or delete on public.enrollments           for each row execute function public.audit_row();
create trigger trg_audit_medications      after insert or update or delete on public.medications           for each row execute function public.audit_row();
create trigger trg_audit_requests         after insert or update or delete on public.dispensation_requests for each row execute function public.audit_row();
create trigger trg_audit_dispensations    after insert or update or delete on public.dispensations         for each row execute function public.audit_row();
create trigger trg_audit_module_roles     after insert or update or delete on public.user_module_roles     for each row execute function public.audit_row();


-- ============================================================================
-- 10.7 · VALIDACIONES DE NEGOCIO E INMUTABILIDAD
-- ============================================================================

-- Sella verified_by/verified_at al pasar la recepción a 'verificada'.
-- BEFORE UPDATE → corre antes del AFTER trg_apply_reception_stock (que lee verified_by).
create or replace function public.set_reception_verified()
returns trigger language plpgsql as $$
begin
  if new.status = 'verificada' and old.status is distinct from 'verificada' then
    if new.verified_at is null then new.verified_at := now(); end if;
    if new.verified_by is null then new.verified_by := auth.uid(); end if;
  end if;
  return new;
end;
$$;
create trigger trg_reception_verified
  before update on public.medication_receptions
  for each row execute function public.set_reception_verified();

-- No crear una dispensación contra una solicitud en estado terminal (rechazada/cancelada).
create or replace function public.validate_dispensation_request_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_req_status request_status;
begin
  select status into v_req_status from public.dispensation_requests
    where id = new.request_id for update;        -- lock anti-carrera con un UPDATE que cancele
  if v_req_status is null then
    raise exception 'Solicitud % inexistente', new.request_id using errcode = 'foreign_key_violation';
  end if;
  if v_req_status in ('rechazada','cancelada') then
    raise exception 'No se puede crear dispensación: la solicitud está en estado % (terminal)', v_req_status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger trg_validate_dispensation_request_status
  before insert on public.dispensations
  for each row execute function public.validate_dispensation_request_status();

-- Inmutabilidad de campos sensibles de la dispensación + no revertir 'entregada'.
create or replace function public.guard_dispensation_immutable()
returns trigger language plpgsql as $$
begin
  if new.executed_by is distinct from old.executed_by
     or new.request_id is distinct from old.request_id
     or new.correlative_number is distinct from old.correlative_number then
    raise exception 'No se pueden modificar executed_by/request_id/correlative_number de una dispensación';
  end if;
  if old.status = 'entregada' and new.status is distinct from 'entregada' then
    raise exception 'No se puede revertir una dispensación ya entregada';
  end if;
  return new;
end;
$$;
create trigger trg_guard_dispensation_immutable
  before update on public.dispensations
  for each row execute function public.guard_dispensation_immutable();

-- Inmutabilidad de los campos de identidad/anclaje del enrolamiento.
create or replace function public.guard_enrollment_immutable()
returns trigger language plpgsql as $$
begin
  if new.patient_id is distinct from old.patient_id
     or new.protocol_id is distinct from old.protocol_id
     or new.enrolled_by is distinct from old.enrolled_by
     or new.enrollment_date is distinct from old.enrollment_date then
    raise exception 'No se pueden modificar patient_id/protocol_id/enrolled_by/enrollment_date (dar de baja y re-enrolar)';
  end if;
  return new;
end;
$$;
create trigger trg_guard_enrollment_immutable
  before update on public.enrollments
  for each row execute function public.guard_enrollment_immutable();

-- Inmutabilidad de la solicitud: ni track ni pharma pueden reasignar autor/visita.
-- (RLS WITH CHECK no puede comparar contra el valor anterior; por eso va en trigger.)
create or replace function public.guard_request_immutable()
returns trigger language plpgsql as $$
begin
  if new.requested_by is distinct from old.requested_by
     or new.visit_id is distinct from old.visit_id then
    raise exception 'No se pueden modificar requested_by/visit_id de una solicitud';
  end if;
  return new;
end;
$$;
create trigger trg_guard_request_immutable
  before update on public.dispensation_requests
  for each row execute function public.guard_request_immutable();

-- Coherencia de protocolo: la medicación solicitada/dispensada debe pertenecer
-- al MISMO protocolo del paciente (cadena request/dispensation → visit → enrollment).
create or replace function public.check_request_item_protocol()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_protocol_id uuid; v_med_protocol uuid;
begin
  select e.protocol_id into v_protocol_id
  from public.dispensation_requests dr
  join public.patient_visits pv on pv.id = dr.visit_id
  join public.enrollments e on e.id = pv.enrollment_id
  where dr.id = new.request_id;
  select protocol_id into v_med_protocol from public.medications where id = new.medication_id;
  if v_med_protocol is distinct from v_protocol_id then
    raise exception 'Medicamento % (protocolo %) no corresponde al protocolo % de la solicitud',
      new.medication_id, v_med_protocol, v_protocol_id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger trg_check_request_item_protocol
  before insert or update on public.dispensation_request_items
  for each row execute function public.check_request_item_protocol();

create or replace function public.check_dispensation_item_protocol()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_protocol_id uuid; v_med_protocol uuid;
begin
  select e.protocol_id into v_protocol_id
  from public.dispensations d
  join public.dispensation_requests dr on dr.id = d.request_id
  join public.patient_visits pv on pv.id = dr.visit_id
  join public.enrollments e on e.id = pv.enrollment_id
  where d.id = new.dispensation_id;
  select protocol_id into v_med_protocol from public.medications where id = new.medication_id;
  if v_med_protocol is distinct from v_protocol_id then
    raise exception 'Medicamento % (protocolo %) no corresponde al protocolo % de la dispensación',
      new.medication_id, v_med_protocol, v_protocol_id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger trg_check_dispensation_item_protocol
  before insert or update on public.dispensation_items
  for each row execute function public.check_dispensation_item_protocol();


-- ============================================================================
-- 10.8 · AUDITORÍA ADICIONAL (cierra "toda acción trazable")
-- ============================================================================
create trigger trg_audit_checklist_completions after insert or update or delete on public.checklist_completions  for each row execute function public.audit_row();
create trigger trg_audit_patient_visits        after update or delete            on public.patient_visits         for each row execute function public.audit_row();
create trigger trg_audit_dispensation_items    after insert or update or delete on public.dispensation_items     for each row execute function public.audit_row();
create trigger trg_audit_receptions            after insert or update or delete on public.medication_receptions  for each row execute function public.audit_row();
