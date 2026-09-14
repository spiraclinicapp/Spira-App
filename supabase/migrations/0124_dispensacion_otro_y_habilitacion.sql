-- Spira · Migración 0124 — «Otro medicamento»: pedido de habilitación con receta, para una entrega.
-- Plan: docs/plan-dispensacion-base-e-imp.md (Tanda 3c: D7, D12, D20, D22, D23, D26, D28 y R3-R6, R12, R13).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0123.
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. El front desplegado sigue andando con esto:
--    · no pide la tabla nueva ni llama a las funciones nuevas;
--    · create_dispensation_request, remove_dispensation_item, mark_dispensation_ready,
--      saldo_restante_de_indicacion y dispensation_audit_trail conservan firma y comportamiento
--      mientras no exista ninguna habilitación (y no puede existir: sólo la crea el front nuevo);
--    · contexto_dispensacion suma UNA columna al final (se recrea): el front viejo lee por nombre y
--      no la pide;
--    · las FK nuevas NO forman un camino alternativo a ningún embed que el front ya pide (la tabla
--      nueva no tiene FK a dispensation_request_items, a propósito: sería una tabla puente entre
--      pedido y renglón y podría dejar ambiguo `items:dispensation_request_items`, lección 0076).
--    · lo único que se CIERRA es `resolve_dispensation` (0050), deprecada y sin llamadas en el front.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- EL CIRCUITO (plan, «Cómo fluye Otro»):
--   Coordinación elige un medicamento del catálogo del protocolo con stock (candidatos_otro), sube la
--   receta a ip-docs/{protocolo}/habilitaciones/{uuid}.{ext} y llama a solicitar_habilitacion: se suma
--   al pedido solicitado o, si no hay (o Farmacia ya lo tomó), nace un pedido nuevo con la habilitación
--   en la MISMA transacción. Farmacia, al preparar, la habilita (se activa en patient_medications y se
--   suma el renglón) o no la habilita (motivo de lista; si el pedido queda vacío, se rechaza). «Marcar
--   lista» espera a que no quede ninguna pendiente. Cuando el pedido termina, la medicación habilitada
--   por la receta se vuelve a desactivar: la receta habilita UNA entrega (decisión del Director, R6).
--
--   El candado de la 0050 (patient_medications activa para pedir y entregar) NO se afloja (0076:21).
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · La tabla ------------------------------------------------------------------------------------
-- `id` lo exige audit_row() (0003), que resuelve old.id al planificar (0111). gen_random_uuid(), que
-- vive en pg_catalog (la lección de la 0113). Los nombres van como snapshot: Coordinación no puede leer `users`.
create table if not exists public.dispensation_habilitaciones (
  id                     uuid primary key default gen_random_uuid(),
  request_id             uuid not null references public.dispensation_requests(id) on delete restrict,
  medication_id          uuid not null references public.medications(id) on delete restrict,
  quantity               integer not null check (quantity > 0),
  quantity_indicated     integer,
  -- «Pedir el saldo» de un «Otro»: el renglón original del que completa el saldo.
  saldo_de_item_id       uuid,
  receta_path            text not null,
  receta_file_name       text not null,
  receta_mime            text not null,
  receta_size            integer not null check (receta_size > 0 and receta_size <= 10485760),
  -- La habilitación ORIGINAL cuya receta ya aprobada reusa un saldo (R6). NULL = trae receta propia.
  origen_habilitacion_id uuid references public.dispensation_habilitaciones(id) on delete restrict,
  requested_by           uuid not null default auth.uid() references public.users(id) on delete restrict,
  requested_by_name      text,
  requested_at           timestamptz not null default now(),
  -- Sólo la DECISIÓN de Farmacia (R4). «Anulada» no se guarda: se deduce de una pendiente en un pedido
  -- cancelado, rechazado o atendido.
  estado                 text not null default 'pendiente',
  motivo_codigo          text,
  motivo_texto           text,
  decided_by             uuid references public.users(id) on delete restrict,
  decided_by_name        text,
  decided_at             timestamptz,
  -- El renglón que sumó «Habilitar». Sin FK a propósito (ver el encabezado): se resuelve por
  -- (pedido, medicamento), que desde la 0123 es un renglón por medicamento.
  item_id                uuid,
  constraint dh_estado_chk check (estado in ('pendiente', 'habilitada', 'no_habilitada')),
  constraint dh_motivo_chk check (
    motivo_codigo is null
    or motivo_codigo in ('receta_ilegible', 'receta_sin_firma', 'no_corresponde', 'sin_stock', 'otro')
  ),
  constraint dh_decision_chk check (
    (estado = 'pendiente' and decided_at is null and motivo_codigo is null)
    or (estado = 'habilitada' and decided_at is not null and motivo_codigo is null)
    or (estado = 'no_habilitada' and decided_at is not null and motivo_codigo is not null
        and (motivo_codigo <> 'otro' or nullif(btrim(coalesce(motivo_texto, '')), '') is not null))
  ),
  constraint dh_indicado_chk check (quantity_indicated is null or quantity_indicated > quantity),
  constraint dh_saldo_chk check (saldo_de_item_id is null or quantity_indicated is null)
);

comment on table public.dispensation_habilitaciones is
  'Pedido de habilitación de un medicamento no habilitado para el paciente («Otro», 0124): medicamento del catálogo del protocolo, con receta obligatoria. Farmacia lo habilita al preparar (patient_medications + renglón) o no lo habilita con motivo de lista. La receta habilita UNA entrega (R6). Filas sin escritura directa: todo por funciones.';

-- Una receta sube una vez. Los saldos de un «Otro» la REUSAN (R6), así que el único es sobre las que
-- traen receta propia.
create unique index if not exists dispensation_habilitaciones_receta_uq
  on public.dispensation_habilitaciones (receta_path) where origen_habilitacion_id is null;
create index if not exists dispensation_habilitaciones_request_idx
  on public.dispensation_habilitaciones (request_id);

drop trigger if exists trg_audit_dispensation_habilitaciones on public.dispensation_habilitaciones;
create trigger trg_audit_dispensation_habilitaciones
  after insert or update or delete on public.dispensation_habilitaciones
  for each row execute function public.audit_row();

alter table public.dispensation_habilitaciones enable row level security;

-- Lectura como las constancias del IP (0071): Farmacia, gerencia y quien coordina la visita.
drop policy if exists "ver habilitaciones" on public.dispensation_habilitaciones;
create policy "ver habilitaciones" on public.dispensation_habilitaciones for select using (
  public.has_min_role('pharma', 'viewer')
  or public.has_module('gerencia')
  or exists (
    select 1 from public.dispensation_requests r
     where r.id = dispensation_habilitaciones.request_id
       and public.coordina_visita(r.visit_id)
  )
);

revoke all on public.dispensation_habilitaciones from anon;
revoke insert, update, delete, truncate on public.dispensation_habilitaciones from authenticated;
grant select on public.dispensation_habilitaciones to authenticated;


-- 2 · La marca de «habilitado por una receta» en patient_medications (R6) -------------------------
-- FK sobre la tabla nueva. patient_medications se embebe sólo hacia medications (patientMedications.ts),
-- que no gana un camino nuevo.
alter table public.patient_medications
  add column if not exists habilitacion_id uuid;
alter table public.patient_medications
  drop constraint if exists patient_medications_habilitacion_id_fkey;
alter table public.patient_medications
  add constraint patient_medications_habilitacion_id_fkey
  foreign key (habilitacion_id) references public.dispensation_habilitaciones(id) on delete set null;

comment on column public.patient_medications.habilitacion_id is
  'La habilitación («Otro», 0124) que activó este medicamento para UNA entrega. Mientras apunte ahí, cuando ese pedido termina el medicamento se vuelve a desactivar (R6). Una escritura directa de Farmacia (activar a mano desde la ficha) la limpia: habilitado a mano queda habilitado.';

-- La marca la escribe sólo el servidor. Una escritura directa (roles `authenticated`/`anon`, la ficha
-- del paciente activando o desactivando a mano) la LIMPIA: es Farmacia decidiendo, y lo que decide a
-- mano no lo deshace el cierre de un pedido. Mismo criterio de `current_user` que la 0122. SECURITY
-- INVOKER a propósito: si fuera definer, `current_user` sería siempre el dueño.
create or replace function public.limpiar_marca_habilitacion_manual()
returns trigger language plpgsql set search_path = public as $fn$
begin
  if current_user in ('authenticated', 'anon') then
    new.habilitacion_id := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_limpiar_marca_habilitacion_manual on public.patient_medications;
create trigger trg_limpiar_marca_habilitacion_manual
  before insert or update on public.patient_medications
  for each row execute function public.limpiar_marca_habilitacion_manual();


-- 3 · El saldo restante cuenta las habilitaciones pendientes de un saldo ---------------------------
-- Cuerpo de la 0123 + un término: un «Pedir el saldo» de un «Otro» todavía no es renglón (lo será al
-- habilitar), pero ya está en camino. Sin él, dos saldos de la misma indicación pasarían los dos.
-- Misma firma → create or replace. Interna y revocada, como en la 0123.
create or replace function public.saldo_restante_de_indicacion(p_original_item_id uuid, p_excluir_item_id uuid default null)
returns integer language sql stable set search_path = public as $fn$
  select coalesce(o.quantity_indicated, 0)
         - case when exists (select 1 from public.dispensations d
                              where d.request_id = o.request_id and d.status = 'entregada')
                then o.quantity else 0 end
         - coalesce((
             select sum(s.quantity)
               from public.dispensation_request_items s
               join public.dispensation_requests sdr on sdr.id = s.request_id
              where s.saldo_de_item_id = o.id
                and s.id is distinct from p_excluir_item_id
                and (sdr.status in ('solicitada', 'preparando')
                     or exists (select 1 from public.dispensations sd
                                 where sd.request_id = sdr.id and sd.status = 'entregada'))
           ), 0)
         - coalesce((
             select sum(h.quantity)
               from public.dispensation_habilitaciones h
               join public.dispensation_requests hdr on hdr.id = h.request_id
              where h.saldo_de_item_id = o.id
                and h.estado = 'pendiente'
                and hdr.status in ('solicitada', 'preparando')
           ), 0)
    from public.dispensation_request_items o
   where o.id = p_original_item_id;
$fn$;
revoke all on function public.saldo_restante_de_indicacion(uuid, uuid) from public;
revoke execute on function public.saldo_restante_de_indicacion(uuid, uuid) from authenticated, anon;


-- 4 · El alta del pedido, en una función interna (R3) ---------------------------------------------
-- Sale del cuerpo de create_dispensation_request (0123) para que solicitar_habilitacion cree el pedido
-- con las MISMAS reglas (permisos, protocolo, origen, IP). Repite auth.uid() y permisos adentro: aunque
-- esté revocada, no confía en quien la llama.
--
-- `p_lleva_habilitacion`: un pedido que nace sólo con una habilitación es un pedido (D26), aunque no
-- tenga renglones ni IP todavía.
create or replace function public.alta_pedido_interna(
  p_visit_id            uuid,
  p_notes               text,
  p_origen              text,
  p_off_schedule_reason text,
  p_n_items             integer,
  p_lleva_habilitacion  boolean)
returns uuid language plpgsql set search_path = public as $fn$
declare
  v_request_id   uuid;
  v_dispenses    boolean;
  v_dispenses_ip boolean;
  v_includes_ip  boolean;
  v_off          boolean;
  v_protocol_id  uuid;
  v_puede_track  boolean;
  v_puede_pharma boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  if p_origen is null or p_origen not in ('track','pharma') then
    raise exception 'Origen de solicitud inválido' using errcode = 'check_violation';
  end if;

  v_puede_track := public.has_module('gerencia')
                   or public.has_min_role('track','admin')
                   or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id));
  v_puede_pharma := public.has_min_role('pharma','operator');

  if not (v_puede_track or v_puede_pharma) then
    raise exception 'No tenés permiso para solicitar dispensación de esta visita' using errcode = '42501';
  end if;
  if p_origen = 'pharma' and not v_puede_pharma then
    raise exception 'No podés registrar una solicitud como alta de farmacia' using errcode = '42501';
  end if;
  if p_origen = 'track' and not v_puede_track then
    raise exception 'No podés registrar una solicitud como pedido de coordinación' using errcode = '42501';
  end if;

  select coalesce(vd.dispenses, false), coalesce(vd.dispenses_ip, false), e.protocol_id
    into v_dispenses, v_dispenses_ip, v_protocol_id
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
    left join public.visit_definitions vd on vd.id = pv.visit_def_id
   where pv.id = p_visit_id;
  if not found then
    raise exception 'Visita inexistente' using errcode = '23503';
  end if;

  v_includes_ip := v_dispenses_ip
    and not exists (select 1 from public.dispensation_requests dr
                     where dr.visit_id = p_visit_id and dr.includes_ip
                       and dr.status in ('solicitada', 'preparando', 'atendida'))
    and not exists (select 1 from public.visit_ip_closures c where c.visit_id = p_visit_id);

  v_off := p_off_schedule_reason is not null and btrim(p_off_schedule_reason) <> '';

  if not v_off and p_n_items = 0 and not v_includes_ip and not coalesce(p_lleva_habilitacion, false) then
    raise exception 'Un pedido sin renglones y sin producto en investigación no es un pedido'
      using errcode = 'check_violation';
  end if;

  insert into public.dispensation_requests
      (visit_id, protocol_id, requested_by, status, source, notes, requested_by_module,
       includes_ip, off_schedule, off_schedule_reason, base_sin_cronograma)
    values
      (p_visit_id, v_protocol_id, auth.uid(), 'solicitada', 'manual',
       nullif(btrim(coalesce(p_notes,'')),''), p_origen,
       v_includes_ip, v_off, nullif(btrim(coalesce(p_off_schedule_reason,'')),''),
       p_n_items > 0 and not v_dispenses)
    returning id into v_request_id;

  return v_request_id;
end;
$fn$;
revoke all on function public.alta_pedido_interna(uuid, text, text, text, integer, boolean) from public;
revoke execute on function public.alta_pedido_interna(uuid, text, text, text, integer, boolean) from authenticated, anon;


-- Misma firma y mismo comportamiento que la 0123: ahora el alta pasa por la interna.
create or replace function public.create_dispensation_request(
  p_visit_id uuid,
  p_items    jsonb,
  p_notes    text default null,
  p_origen   text default 'track',
  p_off_schedule_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_request_id uuid;
  v_item       jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    raise exception 'La solicitud tiene ítems con un formato inválido' using errcode = 'check_violation';
  end if;

  v_request_id := public.alta_pedido_interna(
    p_visit_id, p_notes, p_origen, p_off_schedule_reason,
    jsonb_array_length(coalesce(p_items, '[]'::jsonb)), false);

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    perform public.alta_renglon_pedido(v_request_id, v_item);
  end loop;

  return v_request_id;
end;
$fn$;
revoke all on function public.create_dispensation_request(uuid, jsonb, text, text, text) from public;
grant execute on function public.create_dispensation_request(uuid, jsonb, text, text, text) to authenticated;


-- 5 · Los candidatos de «Otro» (R12, D20) ---------------------------------------------------------
-- Medicamentos del protocolo de la visita, con stock vigente (el predicado exacto del FEFO,
-- 0075:501-504) y que el paciente NO tiene habilitados ni pedidos para habilitar en un pedido abierto.
-- Sin lotes ni vencimientos (0074). Se ofrece sólo a quien puede subir la receta: Farmacia o quien
-- coordina la visita (R5); admin de Coordinación y gerencia no.
create or replace function public.candidatos_otro(p_visit_id uuid)
returns table (
  medication_id  uuid,
  nombre         text,
  dosis          text,
  unit           text,
  en_estante     integer,
  maximo_armable integer
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_protocol   uuid;
  v_enrollment uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select e.protocol_id, e.id into v_protocol, v_enrollment
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id;
  if not found then
    raise exception 'Visita inexistente' using errcode = '23503';
  end if;

  if not (public.has_min_role('pharma','operator')
          or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id))) then
    raise exception 'No tenés permiso para pedir otro medicamento en esta visita' using errcode = '42501';
  end if;

  -- Todo calificado: en plpgsql los nombres del `returns table` compiten con las columnas (0056/0058).
  return query
  with lotes as (
    select ml.medication_id as mid,
           sum(ml.quantity_on_hand) as total,
           max(ml.quantity_on_hand) as maximo
      from public.medication_lots ml
     where ml.protocol_id = v_protocol
       and ml.quantity_on_hand > 0
       and (ml.expiry_date is null or ml.expiry_date >= current_date)
     group by ml.medication_id
  )
  select m.id, m.name, m.dosis, m.unit, l.total::integer, l.maximo::integer
    from public.protocol_medications pm
    join public.medications m on m.id = pm.medication_id
    join lotes l              on l.mid = m.id
   where pm.protocol_id = v_protocol
     and not exists (select 1 from public.patient_medications pmed
                      where pmed.enrollment_id = v_enrollment
                        and pmed.medication_id = m.id
                        and pmed.active)
     and not exists (select 1 from public.dispensation_habilitaciones h
                       join public.dispensation_requests hdr on hdr.id = h.request_id
                       join public.patient_visits hpv        on hpv.id = hdr.visit_id
                      where hpv.enrollment_id = v_enrollment
                        and h.medication_id = m.id
                        and h.estado = 'pendiente'
                        and hdr.status in ('solicitada', 'preparando'))
   order by m.name;
end;
$fn$;
revoke all on function public.candidatos_otro(uuid) from public;
grant execute on function public.candidatos_otro(uuid) to authenticated;


-- 6 · Pedir la habilitación (R3, R5, R6) ----------------------------------------------------------
-- UNA transacción: si hay un pedido `solicitada` que se indica, se suma ahí; si no (o Farmacia ya lo
-- tomó), nace un pedido nuevo con la habilitación adentro. Nunca queda un pedido sin su habilitación.
--
-- Dos formas:
--   · receta propia: `p_receta_*` con la ruta exacta ip-docs/{protocolo}/habilitaciones/{uuid}.{ext},
--     del protocolo de la visita, y el objeto tiene que EXISTIR en Storage (se sube antes de llamar).
--     Si esto falla después de subir, el archivo queda huérfano: el bucket no permite borrar, y se
--     acepta (TODOS.md).
--   · saldo de un «Otro» (R6): `p_origen_habilitacion_id` + `p_saldo_de_item_id`, sin receta: reusa
--     la de la habilitación original, ya aprobada.
--
-- Devuelve jsonb {request_id, habilitacion_id}: sin `returns table`, sin nombres que compitan.
create or replace function public.solicitar_habilitacion(
  p_visit_id               uuid,
  p_request_id             uuid,
  p_medication_id          uuid,
  p_quantity               integer,
  p_quantity_indicated     integer,
  p_receta_path            text,
  p_receta_file_name       text,
  p_receta_mime            text,
  p_receta_size            integer,
  p_origen_habilitacion_id uuid default null,
  p_saldo_de_item_id       uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_protocol   uuid;
  v_enrollment uuid;
  v_origen     text;
  v_request    uuid;
  v_status     request_status;
  v_hab_id     uuid;
  v_orig       record;
  v_restante   integer;
  v_path       text;
  v_file       text;
  v_mime       text;
  v_size       integer;
  v_nombre     text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select e.protocol_id, e.id into v_protocol, v_enrollment
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id;
  if not found then
    raise exception 'Visita inexistente' using errcode = '23503';
  end if;

  -- Sólo quien puede subir la receta (R5). El origen del pedido se deduce: la coordinadora de la
  -- visita pide como Coordinación; si no, es Farmacia.
  if public.has_min_role('track','operator') and public.coordina_visita(p_visit_id) then
    v_origen := 'track';
  elsif public.has_min_role('pharma','operator') then
    v_origen := 'pharma';
  else
    raise exception 'No tenés permiso para pedir otro medicamento en esta visita' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero' using errcode = 'check_violation';
  end if;
  if p_quantity_indicated is not null and p_quantity_indicated <= p_quantity then
    raise exception 'En partes, lo indicado tiene que ser más que lo que se entrega ahora.'
      using errcode = 'check_violation';
  end if;

  select m.name into v_nombre from public.medications m where m.id = p_medication_id;
  if not found then
    raise exception 'Medicamento inexistente' using errcode = '23503';
  end if;

  -- Un candidato de verdad (R12): del protocolo, no habilitado, sin otra habilitación pendiente.
  if not exists (select 1 from public.protocol_medications pm
                  where pm.protocol_id = v_protocol and pm.medication_id = p_medication_id) then
    raise exception '% no está en el catálogo de este protocolo.', v_nombre using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.patient_medications pmed
              where pmed.enrollment_id = v_enrollment and pmed.medication_id = p_medication_id and pmed.active) then
    raise exception '% ya está habilitado para este paciente: pedilo desde la lista.', v_nombre
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.dispensation_habilitaciones h
               join public.dispensation_requests hdr on hdr.id = h.request_id
               join public.patient_visits hpv        on hpv.id = hdr.visit_id
              where hpv.enrollment_id = v_enrollment
                and h.medication_id = p_medication_id
                and h.estado = 'pendiente'
                and hdr.status in ('solicitada', 'preparando')) then
    raise exception 'Ya hay un pedido de habilitación de % esperando a Farmacia.', v_nombre
      using errcode = 'check_violation';
  end if;

  if p_origen_habilitacion_id is null then
    -- Receta propia.
    if p_saldo_de_item_id is not null then
      raise exception 'Un saldo reusa la receta de la habilitación original.' using errcode = 'check_violation';
    end if;
    if nullif(btrim(coalesce(p_receta_file_name, '')), '') is null
       or p_receta_mime is null or p_receta_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
       or p_receta_size is null or p_receta_size <= 0 or p_receta_size > 10485760 then
      raise exception 'Falta la receta, o el archivo no es PDF, JPG, PNG o WEBP de hasta 10 MB.'
        using errcode = 'check_violation';
    end if;
    -- La forma EXACTA de la ruta y el protocolo de ESTA visita: la policy de Storage autoriza por el
    -- prefijo, y la receta tiene que quedar en la carpeta del estudio del paciente (mismo criterio que
    -- attach_ip_document, 0071).
    if p_receta_path is null
       or p_receta_path !~ ('^' || v_protocol::text
            || '/habilitaciones/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][a-z0-9]{2,5}\Z') then
      raise exception 'La receta no corresponde al protocolo de esta visita.' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from storage.objects so
                    where so.bucket_id = 'ip-docs' and so.name = p_receta_path) then
      raise exception 'No se encontró la receta subida. Probá de nuevo.' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.dispensation_habilitaciones h
                where h.receta_path = p_receta_path and h.origen_habilitacion_id is null) then
      raise exception 'Esa receta ya se usó en otro pedido.' using errcode = 'check_violation';
    end if;
    v_path := p_receta_path; v_file := btrim(p_receta_file_name); v_mime := p_receta_mime; v_size := p_receta_size;

  else
    -- Saldo de un «Otro» (R6): la habilitación original, ya aprobada, del mismo paciente y medicamento.
    if p_saldo_de_item_id is null or p_quantity_indicated is not null then
      raise exception 'El saldo se pide sobre el renglón original, sin indicación propia.' using errcode = 'check_violation';
    end if;

    select h.id, h.medication_id, h.estado, h.item_id, h.origen_habilitacion_id,
           h.receta_path, h.receta_file_name, h.receta_mime, h.receta_size,
           hpv.enrollment_id as enrollment_id
      into v_orig
      from public.dispensation_habilitaciones h
      join public.dispensation_requests hdr on hdr.id = h.request_id
      join public.patient_visits hpv        on hpv.id = hdr.visit_id
     where h.id = p_origen_habilitacion_id;
    if not found then
      raise exception 'No se encontró la habilitación original.' using errcode = '23503';
    end if;
    if v_orig.estado <> 'habilitada' or v_orig.origen_habilitacion_id is not null
       or v_orig.enrollment_id is distinct from v_enrollment
       or v_orig.medication_id is distinct from p_medication_id
       or v_orig.item_id is distinct from p_saldo_de_item_id then
      raise exception 'Ese saldo no corresponde a una habilitación aprobada de este paciente.'
        using errcode = 'check_violation';
    end if;

    -- Lock del renglón original: dos saldos de la misma indicación se ordenan acá (0123).
    perform 1 from public.dispensation_request_items o where o.id = p_saldo_de_item_id for update of o;
    if not exists (select 1 from public.dispensation_request_items o
                     join public.dispensations od on od.request_id = o.request_id and od.status = 'entregada'
                    where o.id = p_saldo_de_item_id and o.quantity_indicated is not null) then
      raise exception 'El saldo se puede pedir recién cuando se entregó la primera parte.' using errcode = 'check_violation';
    end if;
    v_restante := public.saldo_restante_de_indicacion(p_saldo_de_item_id, null);
    if v_restante <= 0 then
      raise exception 'Ese saldo ya está completo o ya está pedido.' using errcode = 'check_violation';
    end if;
    if p_quantity > v_restante then
      raise exception 'El saldo de % es de % %: no se puede pedir más.',
        v_nombre, v_restante, case when v_restante = 1 then 'envase' else 'envases' end
        using errcode = 'check_violation';
    end if;
    v_path := v_orig.receta_path; v_file := v_orig.receta_file_name; v_mime := v_orig.receta_mime; v_size := v_orig.receta_size;
  end if;

  -- El pedido: el indicado, si todavía acepta cambios; si no, uno nuevo con la habilitación adentro.
  if p_request_id is not null then
    select dr.status into v_status
      from public.dispensation_requests dr
     where dr.id = p_request_id and dr.visit_id = p_visit_id
     for update of dr;
    if found and v_status = 'solicitada' then
      v_request := p_request_id;
    end if;
  end if;
  if v_request is null then
    v_request := public.alta_pedido_interna(p_visit_id, null, v_origen, null, 0, true);
  end if;

  if exists (select 1 from public.dispensation_request_items dri
              where dri.request_id = v_request and dri.medication_id = p_medication_id) then
    raise exception '% ya está en el pedido.', v_nombre using errcode = 'check_violation';
  end if;

  insert into public.dispensation_habilitaciones
      (request_id, medication_id, quantity, quantity_indicated, saldo_de_item_id,
       receta_path, receta_file_name, receta_mime, receta_size, origen_habilitacion_id,
       requested_by, requested_by_name)
    values
      (v_request, p_medication_id, p_quantity, p_quantity_indicated, p_saldo_de_item_id,
       v_path, v_file, v_mime, v_size, p_origen_habilitacion_id,
       auth.uid(), (select u.full_name from public.users u where u.id = auth.uid()))
    returning id into v_hab_id;

  return jsonb_build_object('request_id', v_request, 'habilitacion_id', v_hab_id);
end;
$fn$;
revoke all on function public.solicitar_habilitacion(uuid, uuid, uuid, integer, integer, text, text, text, integer, uuid, uuid) from public;
grant execute on function public.solicitar_habilitacion(uuid, uuid, uuid, integer, integer, text, text, text, integer, uuid, uuid) to authenticated;


-- 7 · Farmacia resuelve (R4) ----------------------------------------------------------------------
-- Las dos exigen el pedido en `preparando` y que el comprobante NO se haya emitido: con la
-- dispensación en `lista` el pedido sigue en `preparando` (0071:352-358), y habilitar ahí sumaría un
-- renglón fuera del papel ya impreso.

-- Habilitar: activa el medicamento (con la marca de una entrega) y suma el renglón, en una transacción
-- (el patrón de substitute_dispensation_item, 0076).
create or replace function public.habilitar_medicamento_pedido(p_habilitacion_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_h          record;
  v_status     request_status;
  v_enrollment uuid;
  v_dispenses  boolean;
  v_item       jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Sólo Farmacia (operador) puede habilitar un medicamento pedido' using errcode = '42501';
  end if;

  select h.id, h.request_id, h.medication_id, h.quantity, h.quantity_indicated, h.saldo_de_item_id, h.estado
    into v_h
    from public.dispensation_habilitaciones h
   where h.id = p_habilitacion_id;
  if not found then
    raise exception 'No se encontró el pedido de habilitación.' using errcode = '23503';
  end if;

  select dr.status, pv.enrollment_id, coalesce(vd.dispenses, false)
    into v_status, v_enrollment, v_dispenses
    from public.dispensation_requests dr
    join public.patient_visits pv on pv.id = dr.visit_id
    left join public.visit_definitions vd on vd.id = pv.visit_def_id
   where dr.id = v_h.request_id
   for update of dr;

  perform 1 from public.dispensation_habilitaciones h where h.id = p_habilitacion_id for update of h;

  if v_status <> 'preparando' then
    raise exception 'La habilitación se resuelve al preparar el pedido.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.dispensations d
              where d.request_id = v_h.request_id and d.status in ('lista', 'entregada')) then
    raise exception 'El comprobante ya se emitió: cancelá la preparación para cambiar el pedido.'
      using errcode = 'check_violation';
  end if;
  if (select h.estado from public.dispensation_habilitaciones h where h.id = p_habilitacion_id) <> 'pendiente' then
    raise exception 'Esta habilitación ya se resolvió.' using errcode = 'check_violation';
  end if;

  -- La decisión va PRIMERO: así el saldo restante (que cuenta las pendientes) no se cuenta a sí mismo
  -- al sumar el renglón.
  update public.dispensation_habilitaciones h
     set estado = 'habilitada', decided_by = auth.uid(), decided_at = now(),
         decided_by_name = (select u.full_name from public.users u where u.id = auth.uid())
   where h.id = p_habilitacion_id;

  -- La habilitación. Si ya estaba activa (Farmacia la habilitó a mano mientras tanto), no se marca:
  -- la marca es lo que la vuelve a desactivar al terminar, y lo habilitado a mano queda habilitado.
  insert into public.patient_medications (enrollment_id, medication_id, active, notes, habilitacion_id)
    values (v_enrollment, v_h.medication_id, true, 'Habilitada por receta para una entrega', p_habilitacion_id)
  on conflict (enrollment_id, medication_id) do update
    set active = true,
        habilitacion_id = case when public.patient_medications.active
                               then public.patient_medications.habilitacion_id
                               else excluded.habilitacion_id end;

  -- El renglón, con las mismas validaciones de siempre (0123): guard de un renglón por medicamento,
  -- protocolo y habilitación (0050), y las reglas del saldo si lo es.
  v_item := jsonb_build_object('medication_id', v_h.medication_id, 'quantity', v_h.quantity);
  if v_h.quantity_indicated is not null then
    v_item := v_item || jsonb_build_object('quantity_indicated', v_h.quantity_indicated);
  end if;
  if v_h.saldo_de_item_id is not null then
    v_item := v_item || jsonb_build_object('saldo_de_item_id', v_h.saldo_de_item_id);
  end if;
  perform public.alta_renglon_pedido(v_h.request_id, v_item);

  update public.dispensation_habilitaciones h
     set item_id = (select dri.id from public.dispensation_request_items dri
                     where dri.request_id = v_h.request_id and dri.medication_id = v_h.medication_id)
   where h.id = p_habilitacion_id;

  if not v_dispenses then
    update public.dispensation_requests dr set base_sin_cronograma = true
     where dr.id = v_h.request_id and not dr.base_sin_cronograma;
  end if;
end;
$fn$;
revoke all on function public.habilitar_medicamento_pedido(uuid) from public;
grant execute on function public.habilitar_medicamento_pedido(uuid) to authenticated;


-- No habilitar: motivo de lista (D28). Si el pedido queda sin renglones, sin IP y sin otras pendientes,
-- se cierra rechazado con ese motivo (D26): un pedido vacío no se prepara.
create or replace function public.no_habilitar_medicamento_pedido(
  p_habilitacion_id uuid,
  p_motivo          text,
  p_detalle         text default null)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_h        record;
  v_status   request_status;
  v_ip       boolean;
  v_etiqueta text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Sólo Farmacia (operador) puede resolver un medicamento pedido' using errcode = '42501';
  end if;

  select h.id, h.request_id, h.estado, m.name as nombre
    into v_h
    from public.dispensation_habilitaciones h
    join public.medications m on m.id = h.medication_id
   where h.id = p_habilitacion_id;
  if not found then
    raise exception 'No se encontró el pedido de habilitación.' using errcode = '23503';
  end if;

  select dr.status, dr.includes_ip into v_status, v_ip
    from public.dispensation_requests dr
   where dr.id = v_h.request_id
   for update of dr;
  perform 1 from public.dispensation_habilitaciones h where h.id = p_habilitacion_id for update of h;

  if v_status <> 'preparando' then
    raise exception 'La habilitación se resuelve al preparar el pedido.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.dispensations d
              where d.request_id = v_h.request_id and d.status in ('lista', 'entregada')) then
    raise exception 'El comprobante ya se emitió: cancelá la preparación para cambiar el pedido.'
      using errcode = 'check_violation';
  end if;
  if (select h.estado from public.dispensation_habilitaciones h where h.id = p_habilitacion_id) <> 'pendiente' then
    raise exception 'Esta habilitación ya se resolvió.' using errcode = 'check_violation';
  end if;

  v_etiqueta := case p_motivo
    when 'receta_ilegible' then 'Receta ilegible o incompleta'
    when 'receta_sin_firma' then 'Receta sin firma del médico'
    when 'no_corresponde'  then 'No corresponde a este paciente'
    when 'sin_stock'       then 'Sin stock en el protocolo'
    when 'otro'            then nullif(btrim(coalesce(p_detalle, '')), '')
  end;
  if v_etiqueta is null then
    raise exception 'Elegí un motivo (con «Otro motivo», contalo).' using errcode = 'check_violation';
  end if;

  update public.dispensation_habilitaciones h
     set estado = 'no_habilitada', motivo_codigo = p_motivo,
         motivo_texto = case when p_motivo = 'otro' then v_etiqueta else null end,
         decided_by = auth.uid(), decided_at = now(),
         decided_by_name = (select u.full_name from public.users u where u.id = auth.uid())
   where h.id = p_habilitacion_id;

  if not v_ip
     and not exists (select 1 from public.dispensation_request_items dri where dri.request_id = v_h.request_id)
     and not exists (select 1 from public.dispensation_habilitaciones h
                      where h.request_id = v_h.request_id and h.estado = 'pendiente') then
    perform public.reject_dispensation_request(v_h.request_id, 'No se habilitó ' || v_h.nombre || ': ' || v_etiqueta);
  end if;
end;
$fn$;
revoke all on function public.no_habilitar_medicamento_pedido(uuid, text, text) from public;
grant execute on function public.no_habilitar_medicamento_pedido(uuid, text, text) to authenticated;


-- Quitar una habilitación todavía pendiente, con el pedido `solicitada` (la ✕ de la fila «Por habilitar»,
-- mock 4). Las mismas reglas que remove_dispensation_item (0121): permiso, lock, guard de estado, y no
-- deja un pedido vacío (la salida honesta es cancelarlo). Se BORRA la fila: queda en audit_log, igual
-- que un renglón quitado. La receta queda huérfana en el bucket, que no permite borrar (TODOS.md).
create or replace function public.quitar_habilitacion(p_habilitacion_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_request_id  uuid;
  v_status      request_status;
  v_visit_id    uuid;
  v_includes_ip boolean;
  v_quien       text;
  v_estado      text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select dr.id, dr.status, dr.visit_id, dr.includes_ip, dr.prepared_by_name, h.estado
    into v_request_id, v_status, v_visit_id, v_includes_ip, v_quien, v_estado
    from public.dispensation_habilitaciones h
    join public.dispensation_requests dr on dr.id = h.request_id
   where h.id = p_habilitacion_id
   for update of dr, h;
  if not found then
    raise exception 'Ese pedido de habilitación ya no está. Actualizá la tarjeta.' using errcode = '23503';
  end if;

  if not (public.has_module('gerencia')
          or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.coordina_visita(v_visit_id))
          or public.has_min_role('pharma','operator')) then
    raise exception 'No tenés permiso para editar este pedido' using errcode = '42501';
  end if;

  if v_status = 'preparando' then
    raise exception 'Farmacia ya está preparando este pedido%: pedile que lo libere para cambiarlo.',
      coalesce(' (lo tiene ' || v_quien || ')', '') using errcode = 'check_violation';
  end if;
  if v_status <> 'solicitada' or v_estado <> 'pendiente' then
    raise exception 'Este pedido ya está cerrado: no se puede cambiar.' using errcode = 'check_violation';
  end if;

  if not v_includes_ip
     and not exists (select 1 from public.dispensation_request_items dri where dri.request_id = v_request_id)
     and not exists (select 1 from public.dispensation_habilitaciones h
                      where h.request_id = v_request_id and h.estado = 'pendiente' and h.id <> p_habilitacion_id) then
    raise exception 'Es lo único del pedido: cancelá el pedido en lugar de quitarlo.' using errcode = 'check_violation';
  end if;

  delete from public.dispensation_habilitaciones h where h.id = p_habilitacion_id;
end;
$fn$;
revoke all on function public.quitar_habilitacion(uuid) from public;
grant execute on function public.quitar_habilitacion(uuid) to authenticated;


-- 8 · Una entrega: al terminar el pedido, la receta deja de habilitar (R6) -------------------------
-- Cuando el pedido pasa a atendida, cancelada o rechazada, se desactiva lo que activó una habilitación
-- de ESE pedido, sólo si la marca sigue apuntando ahí (Farmacia no lo habilitó a mano después).
--
-- Y sólo si ningún OTRO pedido abierto del paciente lleva ese medicamento (renglón, o habilitación
-- pendiente o habilitada): desactivarlo ahí trabaría ese pedido en el mostrador, porque la 0050 exige
-- la habilitación también al entregar. En ese caso queda activo; se prefiere habilitado de más a un
-- pedido que no se puede entregar.
create or replace function public.cerrar_habilitaciones_del_pedido()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.status in ('atendida', 'cancelada', 'rechazada') and old.status is distinct from new.status then
    update public.patient_medications pm
       set active = false, habilitacion_id = null
     where pm.habilitacion_id in (select h.id from public.dispensation_habilitaciones h
                                   where h.request_id = new.id and h.estado = 'habilitada')
       and not exists (
         select 1
           from public.dispensation_request_items dri
           join public.dispensation_requests dr on dr.id = dri.request_id
           join public.patient_visits pv        on pv.id = dr.visit_id
          where pv.enrollment_id = pm.enrollment_id
            and dri.medication_id = pm.medication_id
            and dr.id <> new.id
            and dr.status in ('solicitada', 'preparando'))
       and not exists (
         select 1
           from public.dispensation_habilitaciones h2
           join public.dispensation_requests dr2 on dr2.id = h2.request_id
           join public.patient_visits pv2        on pv2.id = dr2.visit_id
          where pv2.enrollment_id = pm.enrollment_id
            and h2.medication_id = pm.medication_id
            and dr2.id <> new.id
            and h2.estado in ('pendiente', 'habilitada')
            and dr2.status in ('solicitada', 'preparando'));
  end if;
  return null;
end;
$fn$;

drop trigger if exists trg_cerrar_habilitaciones_del_pedido on public.dispensation_requests;
create trigger trg_cerrar_habilitaciones_del_pedido
  after update of status on public.dispensation_requests
  for each row execute function public.cerrar_habilitaciones_del_pedido();


-- 9 · Marcar lista espera la habilitación (D22, R4) -----------------------------------------------
-- Cuerpo verbatim de la 0075 (su última versión) + UN guard, después del chequeo de estado.
create or replace function public.mark_dispensation_ready(p_request_id uuid)
returns table (dispensation_id uuid, correlative_number integer, dispensation_code text)
language plpgsql security definer set search_path = public as $fn$
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
  v_habilitar   text;
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

  -- ── 0124: lo que cambia el comprobante se resuelve antes de emitirlo (D22) ──
  select m.name into v_habilitar
    from public.dispensation_habilitaciones h
    join public.medications m on m.id = h.medication_id
   where h.request_id = p_request_id and h.estado = 'pendiente'
   order by h.requested_at
   limit 1;
  if v_habilitar is not null then
    raise exception 'Falta resolver la habilitación de %', v_habilitar using errcode = 'check_violation';
  end if;

  select coalesce(sum(dri.quantity - dri.scanned_units), 0)::integer into v_pending
  from public.dispensation_request_items dri
  where dri.request_id = p_request_id;
  if v_pending > 0 then
    raise exception 'Faltan % unidades por escanear', v_pending using errcode = 'check_violation';
  end if;

  if (select r.includes_ip from public.dispensation_requests r where r.id = p_request_id) then
    if not exists (
      select 1 from public.dispensation_ip_documents d
      where d.request_id = p_request_id and d.superseded_at is null
    ) then
      raise exception 'Falta la constancia del producto en investigación' using errcode = 'check_violation';
    end if;

    if not exists (
      select 1 from public.dispensation_ip_documents d
      where d.request_id = p_request_id and d.superseded_at is null and d.printed_at is not null
    ) then
      raise exception 'Falta imprimir la constancia del producto en investigación'
        using errcode = 'check_violation';
    end if;
  end if;

  if not exists (select 1 from public.dispensation_request_items i where i.request_id = p_request_id)
     and not (select r.includes_ip from public.dispensation_requests r where r.id = p_request_id) then
    raise exception 'Este pedido no tiene medicación cargada ni constancia de producto en investigación: no hay nada que dispensar. Adjuntá la constancia del IRT o cargá la medicación.'
      using errcode = 'check_violation';
  end if;

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
    delete from public.dispensation_items di where di.dispensation_id = v_disp_id;
  end if;

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
    select ml.id, ml.lot_number, ml.expiry_date into v_lot
    from public.medication_lots ml
    where ml.medication_id = v_item.medication_id
      and ml.protocol_id   = v_protocol_id
      and ml.quantity_on_hand >= v_item.quantity
      and (ml.expiry_date is null or ml.expiry_date >= current_date)
    order by ml.expiry_date asc nulls last, ml.created_at asc, ml.lot_number asc
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
end;
$fn$;
revoke all on function public.mark_dispensation_ready(uuid) from public;
grant execute on function public.mark_dispensation_ready(uuid) to authenticated;


-- 10 · Quitar un renglón: una habilitación pendiente también «lleva algo» (R4) --------------------
-- Cuerpo de la 0121 + la habilitación pendiente en la regla del último renglón. Misma firma.
create or replace function public.remove_dispensation_item(p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_request_id  uuid;
  v_status      request_status;
  v_visit_id    uuid;
  v_includes_ip boolean;
  v_quien       text;
  v_restantes   integer;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select dr.id, dr.status, dr.visit_id, dr.includes_ip, dr.prepared_by_name
    into v_request_id, v_status, v_visit_id, v_includes_ip, v_quien
    from public.dispensation_request_items dri
    join public.dispensation_requests dr on dr.id = dri.request_id
   where dri.id = p_item_id
   for update of dr;
  if not found then
    raise exception 'Ese medicamento ya no está en el pedido. Actualizá la tarjeta.' using errcode = '23503';
  end if;

  if not (public.has_module('gerencia')
          or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.coordina_visita(v_visit_id))
          or public.has_min_role('pharma','operator')) then
    raise exception 'No tenés permiso para editar este pedido' using errcode = '42501';
  end if;

  if v_status = 'preparando' then
    raise exception 'Farmacia ya está preparando este pedido%: pedile que lo libere para cambiarlo.',
      coalesce(' (lo tiene ' || v_quien || ')', '') using errcode = 'check_violation';
  end if;
  if v_status <> 'solicitada' then
    raise exception 'Este pedido ya está cerrado: no se puede cambiar.' using errcode = 'check_violation';
  end if;

  select count(*) - 1 into v_restantes
    from public.dispensation_request_items dri where dri.request_id = v_request_id;
  if v_restantes = 0 and not v_includes_ip
     and not exists (select 1 from public.dispensation_habilitaciones h
                      where h.request_id = v_request_id and h.estado = 'pendiente') then
    raise exception 'Es el único medicamento del pedido: cancelá el pedido en lugar de quitarlo.'
      using errcode = 'check_violation';
  end if;

  delete from public.dispensation_request_items dri where dri.id = p_item_id;
end;
$fn$;
revoke all on function public.remove_dispensation_item(uuid) from public;
grant execute on function public.remove_dispensation_item(uuid) to authenticated;


-- 11 · La trazabilidad ve la habilitación (R13) ---------------------------------------------------
-- Cuerpo de la 0121 + dos ramas: las habilitaciones del pedido y los cambios de patient_medications
-- que las referencian (antes o después del cambio: al desactivar, la marca se limpia). Misma firma.
create or replace function public.dispensation_audit_trail(p_request_id uuid)
returns table (
  cuando   timestamptz,
  quien    text,
  entidad  text,
  accion   text,
  antes    jsonb,
  despues  jsonb
)
language plpgsql security definer set search_path = public as $fn$
declare v_disp_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_min_role('pharma','viewer') or public.has_min_role('gerencia','viewer')) then
    raise exception 'No tenés permiso para ver el historial de esta dispensación' using errcode = '42501';
  end if;

  select d.id into v_disp_id
  from public.dispensations d where d.request_id = p_request_id limit 1;

  return query
  select
    al.occurred_at,
    coalesce(u.full_name, case when al.actor_id is null then 'Sistema' else '—' end),
    al.entity_type,
    al.action,
    al.before_data,
    al.after_data
  from public.audit_log al
  left join public.users u on u.id = al.actor_id
  where (al.entity_type = 'dispensation_requests'      and al.entity_id = p_request_id)
     or (al.entity_type = 'dispensation_request_items'
         and coalesce(al.after_data, al.before_data)->>'request_id' = p_request_id::text)
     or (al.entity_type = 'dispensation_ip_documents'  and al.entity_id in (
           select d.id from public.dispensation_ip_documents d where d.request_id = p_request_id))
     or (v_disp_id is not null and al.entity_type = 'dispensations' and al.entity_id = v_disp_id)
     or (al.entity_type = 'dispensation_habilitaciones'
         and coalesce(al.after_data, al.before_data)->>'request_id' = p_request_id::text)
     or (al.entity_type = 'patient_medications'
         and (al.after_data->>'habilitacion_id' in (
                select h.id::text from public.dispensation_habilitaciones h where h.request_id = p_request_id)
              or al.before_data->>'habilitacion_id' in (
                select h.id::text from public.dispensation_habilitaciones h where h.request_id = p_request_id)))
  order by al.occurred_at desc
  limit 200;
end;
$fn$;
revoke all on function public.dispensation_audit_trail(uuid) from public;
grant execute on function public.dispensation_audit_trail(uuid) to authenticated;


-- 12 · El contexto de la visita sabe qué saldo es de un «Otro» (R6) --------------------------------
-- Cuerpo de la 0123 + una columna al final: `habilitacion_id`, en las filas `indicacion` cuyo renglón
-- original lo sumó una habilitación aprobada. Con ella el front ofrece «Pedir el saldo» aunque el
-- medicamento ya no esté habilitado (se desactivó al entregar la primera parte): el saldo viaja como una
-- habilitación nueva con la misma receta. Cambia el `returns table` → drop y create (no hay
-- `create or replace` que cambie columnas) y se vuelven a dar los permisos.
drop function if exists public.contexto_dispensacion(uuid);
create function public.contexto_dispensacion(p_visit_id uuid)
returns table (
  tipo            text,
  item_id         uuid,
  medication_id   uuid,
  medication_name text,
  dosis           text,
  unit            text,
  drug_id         uuid,
  drug_name       text,
  instante        timestamptz,
  protocol_code   text,
  visit_code      text,
  es_esta_visita  boolean,
  indicado        integer,
  entregado       integer,
  en_camino       integer,
  habilitado      boolean,
  ip_kits         integer,
  habilitacion_id uuid
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_enrollment uuid;
  v_patient    uuid;
  v_desde      timestamptz := now() - interval '31 days';
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select e.id, e.patient_id into v_enrollment, v_patient
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id;
  if not found then
    raise exception 'Visita inexistente' using errcode = '23503';
  end if;

  if not (public.has_module('gerencia')
          or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id))
          or public.has_min_role('pharma','viewer')) then
    raise exception 'No tenés permiso para ver las entregas de esta visita' using errcode = '42501';
  end if;

  return query
  select distinct on (d.id, di.medication_id)
         'entrega'::text, null::uuid, di.medication_id, m.name, m.dosis, m.unit, m.drug_id, dg.name,
         d.delivered_at, pr.code, dr.visit_code, (dr.visit_id = p_visit_id),
         null::integer, null::integer, null::integer, null::boolean, null::integer, null::uuid
    from public.dispensations d
    join public.dispensation_items di   on di.dispensation_id = d.id
    join public.dispensation_requests dr on dr.id = d.request_id
    join public.patient_visits pv        on pv.id = dr.visit_id
    join public.enrollments e            on e.id = pv.enrollment_id
    join public.medications m            on m.id = di.medication_id
    left join public.drugs dg            on dg.id = m.drug_id
    left join public.protocols pr        on pr.id = e.protocol_id
   where e.patient_id = v_patient
     and d.status = 'entregada'
     and d.delivered_at >= v_desde

  union all

  select 'abierto'::text, dri.id, dri.medication_id, m.name, m.dosis, m.unit, m.drug_id, dg.name,
         dr.created_at, pr.code, dr.visit_code, false,
         null::integer, null::integer, null::integer, null::boolean, null::integer, null::uuid
    from public.dispensation_request_items dri
    join public.dispensation_requests dr on dr.id = dri.request_id
    join public.patient_visits pv        on pv.id = dr.visit_id
    join public.enrollments e            on e.id = pv.enrollment_id
    join public.medications m            on m.id = dri.medication_id
    left join public.drugs dg            on dg.id = m.drug_id
    left join public.protocols pr        on pr.id = e.protocol_id
   where e.patient_id = v_patient
     and dr.visit_id <> p_visit_id
     and dr.status in ('solicitada', 'preparando')

  union all

  select 'indicacion'::text, o.id, o.medication_id, m.name, m.dosis, m.unit, m.drug_id, dg.name,
         ent.ultima, pr.code, odr.visit_code, (odr.visit_id = p_visit_id),
         o.quantity_indicated, ent.total::integer, (coalesce(cam.total, 0) + coalesce(hcam.total, 0))::integer,
         exists (select 1 from public.patient_medications pm
                  where pm.enrollment_id = v_enrollment and pm.medication_id = o.medication_id and pm.active),
         null::integer,
         (select h.id from public.dispensation_habilitaciones h
           where h.item_id = o.id and h.estado = 'habilitada' and h.origen_habilitacion_id is null
           limit 1)
    from public.dispensation_request_items o
    join public.dispensation_requests odr on odr.id = o.request_id
    join public.patient_visits opv        on opv.id = odr.visit_id
    join public.enrollments e             on e.id = opv.enrollment_id
    join public.medications m             on m.id = o.medication_id
    left join public.drugs dg             on dg.id = m.drug_id
    left join public.protocols pr         on pr.id = e.protocol_id
    cross join lateral (
      select sum(x.quantity) as total, max(xd.delivered_at) as ultima
        from public.dispensation_request_items x
        join public.dispensations xd on xd.request_id = x.request_id and xd.status = 'entregada'
       where x.id = o.id or x.saldo_de_item_id = o.id
    ) ent
    left join lateral (
      select sum(y.quantity) as total
        from public.dispensation_request_items y
        join public.dispensation_requests ydr on ydr.id = y.request_id
       where y.saldo_de_item_id = o.id
         and ydr.status in ('solicitada', 'preparando')
    ) cam on true
    -- 0124: un saldo de un «Otro» pedido y todavía sin habilitar ya está en camino.
    left join lateral (
      select sum(hh.quantity) as total
        from public.dispensation_habilitaciones hh
        join public.dispensation_requests hdr on hdr.id = hh.request_id
       where hh.saldo_de_item_id = o.id
         and hh.estado = 'pendiente'
         and hdr.status in ('solicitada', 'preparando')
    ) hcam on true
   where opv.enrollment_id = v_enrollment
     and o.saldo_de_item_id is null
     and o.quantity_indicated is not null
     and exists (select 1 from public.dispensations od
                  where od.request_id = o.request_id and od.status = 'entregada')
     and o.quantity_indicated > coalesce(ent.total, 0)

  union all

  (select 'ip'::text, null::uuid, null::uuid, null::text, null::text, null::text, null::uuid, null::text,
          d.delivered_at, null::text, dr.visit_code, (dr.visit_id = p_visit_id),
          null::integer, null::integer, null::integer, null::boolean, d.ip_kits, null::uuid
     from public.dispensations d
     join public.dispensation_requests dr on dr.id = d.request_id
     join public.patient_visits pv        on pv.id = dr.visit_id
    where pv.enrollment_id = v_enrollment
      and dr.includes_ip
      and d.status = 'entregada'
      and d.ip_kits is not null
      and d.delivered_at >= v_desde
    order by d.delivered_at desc
    limit 1);
end;
$fn$;
revoke all on function public.contexto_dispensacion(uuid) from public;
grant execute on function public.contexto_dispensacion(uuid) to authenticated;


-- 13 · Se cierra resolve_dispensation (R4) --------------------------------------------------------
-- Deprecada desde la 0054 y sin llamadas en el front (se borra `resolveDispensation`). Se deja de
-- publicar en /rpc; el cuerpo queda para no romper nada que la nombre. Existe desde la 0050.
revoke execute on function public.resolve_dispensation(uuid) from public, authenticated, anon;

notify pgrst, 'reload schema';
