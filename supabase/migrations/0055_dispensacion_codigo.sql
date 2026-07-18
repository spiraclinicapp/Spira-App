-- 0055 · Dispensación · el código legible de la dispensación
-- ============================================================================
-- El tablero muestra un identificador de dispensación que hasta ahora no existía
-- en la base: solo había `correlative_number` (el N° de comprobante) y el uuid.
--
-- Formato definido por el Director:
--
--     D - 1 - 180726 - YM
--     │   │      │      └── iniciales de la farmacéutica que dispensa
--     │   │      └───────── fecha de la dispensación (ddmmyy)
--     │   └──────────────── correlativo del día (REINICIA cada día)
--     └──────────────────── Dispensación
--
-- Los tres datos variables (correlativo, fecha, iniciales) solo existen cuando se
-- dispensa de verdad, así que el código se sella al MARCAR LISTA, junto con el
-- comprobante. Antes de eso la solicitud no tiene código, porque todavía no es una
-- dispensación: en las columnas Solicitadas y Preparando la card no muestra
-- ninguno, en vez de mostrar un provisorio que después cambiaría.
--
-- Es INMUTABLE una vez asignado (ver punto 4): es parte de la nota fuente.
-- ============================================================================


-- 1 · Contador diario --------------------------------------------------------
-- Un serial no sirve: no reinicia. El upsert con `returning` es atómico, así que
-- dos farmacéuticas marcando lista en el mismo instante no pueden sacar el mismo
-- número (la segunda espera el lock de fila del INSERT ... ON CONFLICT).
create table if not exists public.dispensation_daily_counters (
  day         date primary key,
  last_number integer not null
);
comment on table public.dispensation_daily_counters is
  'Correlativo diario de dispensaciones (reinicia cada día). Lo consume mark_dispensation_ready vía upsert atómico. 0055.';

alter table public.dispensation_daily_counters enable row level security;
-- Sin policies a propósito: solo lo toca mark_dispensation_ready, que es SECURITY
-- DEFINER. Ningún cliente lo lee ni lo escribe directo.


-- 2 · Columnas del código ----------------------------------------------------
alter table public.dispensations
  add column if not exists daily_number      integer,
  add column if not exists dispensation_code text;

comment on column public.dispensations.daily_number is
  'Correlativo del día (reinicia). Componente del dispensation_code. NULL mientras la dispensación no se marcó lista. 0055.';
comment on column public.dispensations.dispensation_code is
  'Código legible de la dispensación: D-{n}-{ddmmyy}-{iniciales}. Se sella al marcar lista y es inmutable. 0055.';

-- Único por si acaso: dos códigos iguales harían ambigua la nota fuente.
create unique index if not exists idx_dispensations_code
  on public.dispensations (dispensation_code) where dispensation_code is not null;


-- 3 · Iniciales de la farmacéutica -------------------------------------------
-- "María Yolanda Pérez" → "MP" (primera + última palabra). Una sola palabra → una
-- letra. Sin nombre → 'XX', que es honesto: no inventamos iniciales.
create or replace function public.user_initials(p_user_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_name text; v_parts text[];
begin
  select full_name into v_name from public.users where id = p_user_id;
  if v_name is null then return 'XX'; end if;
  -- separo por espacios, descarto vacíos
  v_parts := array_remove(regexp_split_to_array(btrim(v_name), '\s+'), '');
  if array_length(v_parts, 1) is null then return 'XX'; end if;
  if array_length(v_parts, 1) = 1 then return upper(left(v_parts[1], 1)); end if;
  return upper(left(v_parts[1], 1) || left(v_parts[array_length(v_parts, 1)], 1));
end; $$;
revoke all on function public.user_initials(uuid) from public;
grant execute on function public.user_initials(uuid) to authenticated;


-- 4 · Inmutabilidad ----------------------------------------------------------
-- Espeja el trigger de 0003:270 (executed_by / request_id / correlative_number):
-- el código es parte del comprobante impreso, así que no se toca una vez puesto.
create or replace function public.dispensation_code_immutable()
returns trigger language plpgsql as $$
begin
  if old.dispensation_code is not null
     and new.dispensation_code is distinct from old.dispensation_code then
    raise exception 'No se puede modificar el código de una dispensación ya emitida';
  end if;
  if old.daily_number is not null and new.daily_number is distinct from old.daily_number then
    raise exception 'No se puede modificar el correlativo diario de una dispensación';
  end if;
  return new;
end; $$;

drop trigger if exists trg_dispensation_code_immutable on public.dispensations;
create trigger trg_dispensation_code_immutable
  before update on public.dispensations
  for each row execute function public.dispensation_code_immutable();


-- 5 · mark_dispensation_ready sella el código --------------------------------
-- Igual que con correlative_number: si la fila se reusa (se canceló desde lista y
-- se rehace), el código NO se regenera. La dispensación conserva su identidad, y
-- el contador diario no se consume dos veces por la misma solicitud.
--
-- Va DROP + CREATE y no CREATE OR REPLACE: la firma cambia (el returns table suma
-- dispensation_code) y Postgres no deja cambiar el tipo de retorno de una función
-- existente ("cannot change return type of existing function").
drop function if exists public.mark_dispensation_ready(uuid);

create function public.mark_dispensation_ready(p_request_id uuid)
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

  -- Reusar la dispensación si ya existe (se canceló desde lista y se rehace).
  -- Conserva correlativo Y código → la numeración no deja huecos ni se duplica.
  select d.id, d.correlative_number, d.dispensation_code
    into v_disp_id, v_corr, v_code
  from public.dispensations d
  where d.request_id = p_request_id and d.status = 'en_preparacion'
  for update;

  if not found then
    insert into public.dispensations (request_id, executed_by, status)
      values (p_request_id, auth.uid(), 'en_preparacion')
      returning id, correlative_number into v_disp_id, v_corr;
  else
    delete from public.dispensation_items where dispensation_id = v_disp_id;
  end if;

  -- Sellar el código solo la primera vez.
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
