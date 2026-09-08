-- ============================================================================
-- 0116 — Salida ambulatoria: entregar medicación a alguien que no es paciente
--
-- Spec: docs/superpowers/specs/2026-09-08-dispensacion-ambulatoria-design.md
-- Plan: docs/superpowers/plans/2026-09-08-salida-ambulatoria.md
--
-- EL HUECO: desde la 0035 el stock ambulatorio ENTRA (recepción tipada, lotes con protocol_id
-- NULL) y no sale nunca, porque toda dispensación de la app cuelga de
-- dispensation_requests.visit_id, que es not null contra patient_visits. El caso real, en
-- palabras del Director: "viene el director y te dice dale un Seretide a él; puede que sea el
-- hijo del director, que no figura en ningún lado". No hay paciente, ni enrolamiento, ni
-- protocolo.
--
-- POR QUÉ NO ALCANZA LA VNP (0114/0115): esa tanda dejó dispensar fuera de cronograma
-- registrando una visita no programada, que cubre "el paciente enrolado vino sin cita". Sigue
-- habiendo paciente, enrolamiento y protocolo. Acá no hay ninguno de los tres.
--
-- TABLA PROPIA Y NO AFLOJAR dispensation_requests: el FEFO de la 0050:316 filtra
-- ml.protocol_id = v_protocol_id, que con NULL nunca matchea. Y dar de alta al destinatario como
-- paciente de investigación para poder entregarle un inhalador sería meter dato falso en una base
-- auditable. Decisión del 2026-08-15, reconfirmada el 2026-09-08.
--
-- ADITIVA: ningún front desplegado consulta nada de esto. Va ANTES del deploy.
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0115. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · La tabla -------------------------------------------------------------------------------
-- `id` NO es decorativo: audit_row() (0003) hace `case when tg_op = 'DELETE' then old.id else
-- new.id end` y Postgres resuelve `old.id` AL PLANIFICAR, sin importar por qué rama vaya a pasar.
-- Sin esa columna, la primera escritura revienta con 42703 señalando el cuerpo de audit_row y no
-- esta tabla. Pasó con la 0111.
--
-- gen_random_uuid() y no uuid_generate_v4(): la primera vive en pg_catalog y no depende del
-- search_path. Como DEFAULT de columna daría igual (Postgres lo resuelve por OID al hacer el DDL,
-- que es por qué andan las ~60 del schema), pero deja el archivo entero libre de la trampa que
-- costó la 0113.
--
-- LOS NOMBRES VAN COMO SNAPSHOT además de la FK, igual que task_assignees.user_name (0108): si la
-- cuenta se da de baja o cambia de nombre, la salida sigue diciendo quién la autorizó el día que
-- pasó. La FK queda para poder preguntar "qué autorizó esta persona" sin parsear texto. El
-- snapshot es además lo que permite que la vista de lectura NO joinee `users`, que está cerrada.
create table if not exists public.ambulatory_dispensations (
  id                 uuid primary key default gen_random_uuid(),
  medication_id      uuid not null references public.medications(id) on delete restrict,
  lot_id             uuid not null references public.medication_lots(id) on delete restrict,
  quantity           integer not null check (quantity > 0),
  recipient_name     text not null check (btrim(recipient_name) <> ''),
  recipient_document text,
  authorized_by      uuid not null references public.users(id) on delete restrict,
  authorized_by_name text not null,
  dispensed_by       uuid not null default auth.uid() references public.users(id) on delete restrict,
  dispensed_by_name  text not null,
  notes              text,
  created_at         timestamptz not null default now(),
  -- El lote tiene que ser del MISMO medicamento. Mismo candado compuesto que dispensation_items,
  -- apoyado en el unique (id, medication_id) de medication_lots (0002:242).
  constraint fk_amb_disp_lot_med foreign key (lot_id, medication_id)
    references public.medication_lots (id, medication_id) on delete restrict
);

comment on table public.ambulatory_dispensations is
  'Entrega de medicación ambulatoria a alguien que NO es paciente de investigación. Acto único:
   no tiene estados, ni escaneo, ni comprobante — esa ceremonia existe por una razón regulatoria
   que acá no aplica. Inmutable: un error se corrige con un ajuste de stock. 0116.';

comment on column public.ambulatory_dispensations.recipient_name is
  'Nombre de quien retira. Texto libre y obligatorio: el destinatario puede no existir en el
   sistema (ese es el caso de uso), pero el inventario tiene que poder decir a dónde fue.';
comment on column public.ambulatory_dispensations.authorized_by is
  'Quién pidió la entrega. Obligatorio y distinto de dispensed_by: la farmacéutica ejecuta, no
   decide, y sin esta columna sería la única persona registrada en una decisión que no tomó.';

create index if not exists idx_amb_disp_created on public.ambulatory_dispensations (created_at desc);
create index if not exists idx_amb_disp_lot     on public.ambulatory_dispensations (lot_id);

drop trigger if exists trg_audit_ambulatory_dispensations on public.ambulatory_dispensations;
create trigger trg_audit_ambulatory_dispensations
  after insert or update or delete on public.ambulatory_dispensations
  for each row execute function public.audit_row();


-- 2 · RLS: se LEE con pharma o gerencia; no se escribe por tabla ------------------------------
-- Sin policies de insert/update/delete A PROPÓSITO: la única puerta de escritura es el RPC de
-- más abajo, que es SECURITY DEFINER y hace el descuento de stock en la misma transacción. Una
-- policy de insert dejaría crear la fila sin mover el stock, que es la incoherencia que este
-- diseño existe para impedir.
alter table public.ambulatory_dispensations enable row level security;

drop policy if exists "pharma ve las salidas ambulatorias" on public.ambulatory_dispensations;
create policy "pharma ve las salidas ambulatorias"
  on public.ambulatory_dispensations for select to authenticated
  using (public.has_module('pharma') or public.has_module('gerencia'));


-- 3 · stock_movements.reference_type acepta 'ambulatoria' -------------------------------------
-- NO se reusa 'dispensation': dejaría reference_id apuntando a DOS tablas distintas
-- (dispensations y ambulatory_dispensations), y cualquier join que resuelva ese id por una de
-- ellas devolvería filas de menos, en silencio. Es la trampa que TODOS.md ya tenía anotada.
--
-- Se busca la constraint por su DEFINICIÓN y no por nombre, que es el patrón de la 0113: el
-- nombre depende de cómo la generó Postgres, y dropear por un nombre que no existe NO FALLA —
-- deja la constraint vieja en pie y el insert de más abajo revienta recién en runtime.
do $mig$
declare v_con text;
begin
  select con.conname into v_con
    from pg_constraint con
    join pg_class     rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where nsp.nspname = 'public'
     and rel.relname = 'stock_movements'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) ilike '%reference_type%';
  if v_con is not null then
    execute format('alter table public.stock_movements drop constraint %I', v_con);
  end if;
end $mig$;

alter table public.stock_movements
  add constraint stock_movements_reference_type_valido
  check (reference_type is null or reference_type in
         ('reception', 'dispensation', 'ajuste_manual', 'devolucion', 'vencimiento',
          'reasignacion', 'ambulatoria'));

comment on column public.stock_movements.reference_type is
  'De qué tabla es reference_id. ambulatoria = ambulatory_dispensations (0116). OJO: el
   movement_type de una salida ambulatoria es dispensacion, porque es una entrega. Quien quiera
   SOLO las de protocolo tiene que filtrar también por reference_type = dispensation.';


-- 4 · La vista de lectura ---------------------------------------------------------------------
-- security_invoker: la RLS de la tabla ya decide quién ve qué, y no hace falta una segunda regla.
-- NO joinea `users` a propósito: los nombres viajan como snapshot en la propia fila, así que la
-- vista no depende de poder leer esa tabla — que es lo que rompería para una farmacéutica sin
-- gerencia, en silencio y por RLS.
create or replace view public.v_ambulatory_dispensations
with (security_invoker = true) as
select ad.id,
       ad.created_at,
       ad.quantity,
       ad.recipient_name,
       ad.recipient_document,
       ad.authorized_by_name,
       ad.dispensed_by_name,
       ad.notes,
       ad.medication_id,
       m.name       as medication_name,
       m.dosis      as medication_dosis,
       m.unit       as medication_unit,
       ml.lot_number
  from public.ambulatory_dispensations ad
  join public.medications     m  on m.id  = ad.medication_id
  join public.medication_lots ml on ml.id = ad.lot_id;

comment on view public.v_ambulatory_dispensations is
  'Las salidas ambulatorias con el nombre del medicamento y el lote, para la lista de "Últimas
   salidas" de Farmacia Ambulatoria. 0116.';

revoke all on public.v_ambulatory_dispensations from anon;
grant select on public.v_ambulatory_dispensations to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.v_ambulatory_dispensations from authenticated;


-- 5 · El RPC ----------------------------------------------------------------------------------
-- Atómico: valida, inserta, descuenta el lote y escribe el asiento en una sola transacción.
-- `for update` sobre la fila del lote cierra la carrera de dos entregas simultáneas del mismo
-- lote, que sin el lock podrían leer las dos el mismo disponible y dejar el stock en negativo.
create or replace function public.dispensar_ambulatoria(
  p_lot_id             uuid,
  p_quantity           integer,
  p_recipient_name     text,
  p_recipient_document text,
  p_authorized_by      uuid,
  p_notes              text default null
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public as $fn$
declare
  v_med        uuid;
  v_protocol   uuid;
  v_disponible integer;
  v_autoriza   text;
  v_dispensa   text;
  v_id         uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para entregar medicación' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero' using errcode = 'check_violation';
  end if;
  if p_recipient_name is null or btrim(p_recipient_name) = '' then
    raise exception 'Poné el nombre de quien retira la medicación' using errcode = 'check_violation';
  end if;

  -- Quien autoriza tiene que ser una cuenta ACTIVA. El padrón que ve el front sólo ofrece activas
  -- (v_team_roster, 0109), pero el candado va donde no se puede saltear.
  select u.full_name into v_autoriza
    from public.users u
   where u.id = p_authorized_by and u.is_active;
  if v_autoriza is null then
    raise exception 'Quien autoriza no es una cuenta activa' using errcode = '23503';
  end if;

  select u.full_name into v_dispensa from public.users u where u.id = auth.uid();

  select ml.medication_id, ml.protocol_id, ml.quantity_on_hand
    into v_med, v_protocol, v_disponible
    from public.medication_lots ml
   where ml.id = p_lot_id
     for update;
  if not found then
    raise exception 'Ese lote no existe' using errcode = '23503';
  end if;

  -- El ámbito ambulatorio son los lotes con protocol_id NULL (0035). Entregar producto de un
  -- sponsor a alguien que no es su paciente sería un desvío: el candado va acá y no en la UI.
  if v_protocol is not null then
    raise exception 'Ese lote no es de la farmacia ambulatoria' using errcode = 'check_violation';
  end if;
  if v_disponible < p_quantity then
    raise exception 'Stock insuficiente en el lote (% disponible, % requerido)',
      v_disponible, p_quantity using errcode = 'check_violation';
  end if;

  insert into public.ambulatory_dispensations
      (medication_id, lot_id, quantity, recipient_name, recipient_document,
       authorized_by, authorized_by_name, dispensed_by, dispensed_by_name, notes)
    values
      (v_med, p_lot_id, p_quantity, btrim(p_recipient_name),
       nullif(btrim(coalesce(p_recipient_document, '')), ''),
       p_authorized_by, v_autoriza, auth.uid(), coalesce(v_dispensa, 'Farmacia'),
       nullif(btrim(coalesce(p_notes, '')), ''))
    returning id into v_id;

  update public.medication_lots
     set quantity_on_hand = quantity_on_hand - p_quantity,
         updated_at = now()
   where id = p_lot_id;

  -- quantity_delta NEGATIVO: es una salida. Si quedara positivo, una entrega SUMARÍA stock y el
  -- inventario se iría inflando sin que nada se viera mal en pantalla. No hay test de vitest que
  -- cubra esto (el proyecto no puede testear su propio SQL): se verifica en el QA.
  insert into public.stock_movements
      (medication_id, lot_id, movement_type, quantity_delta,
       reference_id, reference_type, reason, created_by)
    values
      (v_med, p_lot_id, 'dispensacion', -p_quantity,
       v_id, 'ambulatoria', 'Entrega ambulatoria a ' || btrim(p_recipient_name), auth.uid());

  return v_id;
end; $fn$;

comment on function public.dispensar_ambulatoria(uuid, integer, text, text, uuid, text) is
  'Entrega ambulatoria: inserta la fila, descuenta el lote y escribe el asiento, todo atómico.
   Sólo lotes con protocol_id NULL. pharma operator+. 0116.';

revoke all on function public.dispensar_ambulatoria(uuid, integer, text, text, uuid, text) from public;
grant execute on function public.dispensar_ambulatoria(uuid, integer, text, text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
