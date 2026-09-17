-- Spira · Migración 0128 — Reposición de corte a corte: día de corte, pedidos de medicación y recepción
-- de un pedido.
-- Spec: docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md (R4, R8-R11, R13).
-- Plan: docs/superpowers/plans/2026-09-16-reposicion-parte-1-modelo-y-base.md.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0127.
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ✅ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. Nada de esto rompe lo que el front desplegado pide:
--    · farmacia_ajustes.dia_corte es nueva y nullable (el front pide demora_compra_dias por nombre);
--    · dos tablas nuevas que ningún front consulta;
--    · medication_receptions.pedido_id, nullable. Su FK NO deja ambiguo ningún embed actual (buscado en
--      src el 2026-09-16): el único embed desde medication_receptions es protocol:protocols(code), y
--      pedidos_medicacion no referencia a medication_receptions, así que no es un puente entre las dos;
--    · create_reception suma p_pedido_id con default null AL FINAL. El front desplegado la llama por
--      nombre con cinco argumentos y resuelve a la nueva por el default. La firma vieja se BORRA antes:
--      create or replace con otra firma deja una sobrecarga viva y PostgREST contestaría PGRST203
--      (ambigua) a la llamada vieja. Entre el drop y el create no hay transacción que abarque las dos
--      (el editor no comparte sesión): si el create fallara, Recepción queda sin función hasta volver a
--      correr el archivo. Por eso se probó entera en PGlite antes de pasarla;
--    · insumos_de_reposicion y reposicion_pedidos (0125), que usa la card de Estadísticas, NO se tocan:
--      se borran en la 0129, DESPUÉS del deploy del front.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · El día de corte (R4) -----------------------------------------------------------------------
-- Se escribe con update directo de operator: la policy y el trigger que sella al autor ya existen (0125).
alter table public.farmacia_ajustes
  add column if not exists dia_corte integer;
alter table public.farmacia_ajustes drop constraint if exists farmacia_ajustes_dia_corte_chk;
alter table public.farmacia_ajustes add constraint farmacia_ajustes_dia_corte_chk
  check (dia_corte is null or dia_corte between 1 and 31);

comment on column public.farmacia_ajustes.dia_corte is
  'Día del mes en que corta el período de reposición (R4). En un mes sin ese día, corta el último (lo resuelve src/data/pharma/periodoDeCorte.ts). NULL = sin cargar: la pantalla lo pide. 0128.';


-- 2 · Pedidos de medicación (R8, R9) -------------------------------------------------------------
-- Número correlativo y legible, como el folio de las recepciones (0085): el uuid no se puede dictar
-- por teléfono ni escribir en una hoja. Un pedido rechazado a mitad de camino consume un número: los
-- huecos en la numeración no significan nada.
create sequence if not exists public.pedidos_medicacion_numero_seq;

create table if not exists public.pedidos_medicacion (
  id                 uuid primary key default gen_random_uuid(),
  numero             integer not null unique default nextval('public.pedidos_medicacion_numero_seq'),
  protocol_id        uuid not null references public.protocols(id) on delete restrict,
  periodo_desde      date not null,
  periodo_hasta      date not null,
  emitido_el         date not null,
  emitido_por        uuid not null references public.users(id) on delete restrict,
  emitido_por_nombre text,
  anulado_at         timestamptz,
  anulado_por_nombre text,
  anulado_motivo     text,
  created_at         timestamptz not null default now(),
  constraint pedidos_medicacion_periodo_chk check (periodo_desde <= periodo_hasta),
  constraint pedidos_medicacion_anulado_chk check (
    (anulado_at is null and anulado_motivo is null)
    or (anulado_at is not null and anulado_motivo in ('por_error', 'rehecho'))
  )
);
alter sequence public.pedidos_medicacion_numero_seq owned by public.pedidos_medicacion.numero;

comment on table public.pedidos_medicacion is
  'Pedido de medicación de un estudio, impreso con número (R8). periodo_desde/hasta = el período para el que se pidió. El estado se deduce de las recepciones con pedido_id. Sin escritura directa. 0128.';

create index if not exists pedidos_medicacion_protocol_idx on public.pedidos_medicacion (protocol_id);

drop trigger if exists trg_audit_pedidos_medicacion on public.pedidos_medicacion;
create trigger trg_audit_pedidos_medicacion
  after insert or update or delete on public.pedidos_medicacion
  for each row execute function public.audit_row();

alter table public.pedidos_medicacion enable row level security;
drop policy if exists "ver pedidos de medicacion" on public.pedidos_medicacion;
create policy "ver pedidos de medicacion" on public.pedidos_medicacion for select
  using (public.has_min_role('pharma', 'viewer') or public.has_module('gerencia'));

revoke all on public.pedidos_medicacion from anon;
revoke insert, update, delete, truncate on public.pedidos_medicacion from authenticated;
grant select on public.pedidos_medicacion to authenticated;


-- 3 · Renglones del pedido (R8, R11) -------------------------------------------------------------
-- calculado = lo que dio la cuenta al emitir (null si estaba sin cargar); pedido = lo que se pidió de
-- verdad. Lo recibido NO se guarda acá: se suma de las recepciones verificadas, así una recepción
-- anulada deja de contar sola.
create table if not exists public.pedido_medicacion_items (
  id                 uuid primary key default gen_random_uuid(),
  pedido_id          uuid not null references public.pedidos_medicacion(id) on delete restrict,
  medication_id      uuid not null references public.medications(id) on delete restrict,
  calculado          integer check (calculado is null or calculado >= 0),
  pedido             integer not null check (pedido > 0),
  cerrado_at         timestamptz,
  cerrado_por_nombre text,
  cerrado_motivo     text,
  constraint pedido_medicacion_items_unico unique (pedido_id, medication_id),
  constraint pedido_medicacion_items_cerrado_chk check (
    (cerrado_at is null and cerrado_motivo is null)
    or (cerrado_at is not null and cerrado_motivo in ('no_lo_tiene', 'discontinuado', 'no_hace_falta'))
  )
);

comment on table public.pedido_medicacion_items is
  'Renglones de un pedido de medicación: calculado (la cuenta al emitir) y pedido. cerrado_* = «No va a llegar» (R11). 0128.';

drop trigger if exists trg_audit_pedido_medicacion_items on public.pedido_medicacion_items;
create trigger trg_audit_pedido_medicacion_items
  after insert or update or delete on public.pedido_medicacion_items
  for each row execute function public.audit_row();

alter table public.pedido_medicacion_items enable row level security;
drop policy if exists "ver renglones de pedidos de medicacion" on public.pedido_medicacion_items;
create policy "ver renglones de pedidos de medicacion" on public.pedido_medicacion_items for select
  using (public.has_min_role('pharma', 'viewer') or public.has_module('gerencia'));

revoke all on public.pedido_medicacion_items from anon;
revoke insert, update, delete, truncate on public.pedido_medicacion_items from authenticated;
grant select on public.pedido_medicacion_items to authenticated;


-- 4 · La recepción sabe a qué pedido responde (R10) ----------------------------------------------
alter table public.medication_receptions
  add column if not exists pedido_id uuid references public.pedidos_medicacion(id) on delete restrict;
alter table public.medication_receptions drop constraint if exists medication_receptions_pedido_tipo_chk;
alter table public.medication_receptions add constraint medication_receptions_pedido_tipo_chk
  check (pedido_id is null or tipo = 'protocolo');
create index if not exists medication_receptions_pedido_idx
  on public.medication_receptions (pedido_id) where pedido_id is not null;

comment on column public.medication_receptions.pedido_id is
  'El pedido de medicación que se está recibiendo (R10). Sólo recepciones de protocolo. Lo pone create_reception. 0128.';


-- 5 · emitir_pedido_medicacion (R8) --------------------------------------------------------------
-- Todo el pedido en una llamada: cabecera y renglones entran juntos o no entra nada.
-- p_desde/p_hasta: el período para el que se pide. p_emitido_el: el día en hora AR (lo manda el front).
-- p_renglones: [{ "medication_id": uuid, "calculado": int | null, "pedido": int }, …]
create or replace function public.emitir_pedido_medicacion(
  p_protocol_id uuid,
  p_desde       date,
  p_hasta       date,
  p_emitido_el  date,
  p_renglones   jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_id     uuid;
  v_numero integer;
  v_nombre text;
  v_r      jsonb;
  v_hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para emitir pedidos' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período del pedido no es válido' using errcode = '22023';
  end if;
  if p_emitido_el is null or p_emitido_el > v_hoy then
    raise exception 'La fecha del pedido no puede ser futura' using errcode = '22023';
  end if;
  if not exists (select 1 from public.protocols pr where pr.id = p_protocol_id and pr.status <> 'cerrado') then
    raise exception 'Ese estudio no existe o está cerrado' using errcode = 'P0002';
  end if;
  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El pedido está vacío' using errcode = '22023';
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();

  insert into public.pedidos_medicacion (protocol_id, periodo_desde, periodo_hasta, emitido_el, emitido_por, emitido_por_nombre)
  values (p_protocol_id, p_desde, p_hasta, p_emitido_el, auth.uid(), v_nombre)
  returning id, numero into v_id, v_numero;

  for v_r in select value from jsonb_array_elements(p_renglones) loop
    if not exists (
      select 1 from public.protocol_medications pmx
       where pmx.protocol_id = p_protocol_id
         and pmx.medication_id = (v_r->>'medication_id')::uuid
    ) then
      raise exception 'Un medicamento del pedido no es de este estudio' using errcode = 'P0002';
    end if;
    if coalesce((v_r->>'pedido')::integer, 0) <= 0 then
      raise exception 'Cada renglón del pedido necesita una cantidad' using errcode = '22023';
    end if;
    insert into public.pedido_medicacion_items (pedido_id, medication_id, calculado, pedido)
    values (v_id, (v_r->>'medication_id')::uuid, (v_r->>'calculado')::integer, (v_r->>'pedido')::integer);
  end loop;

  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$fn$;
revoke all on function public.emitir_pedido_medicacion(uuid, date, date, date, jsonb) from public;
grant execute on function public.emitir_pedido_medicacion(uuid, date, date, date, jsonb) to authenticated;


-- 6 · anular_pedido_medicacion (R9) --------------------------------------------------------------
-- Sólo sin recepciones (salvo anuladas): lo que ya entró al estante tiene que poder rastrearse a su pedido.
-- El for update serializa contra create_reception, que toma el pedido for share.
create or replace function public.anular_pedido_medicacion(p_pedido_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_anulado timestamptz;
  v_nombre  text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para anular pedidos' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('por_error', 'rehecho') then
    raise exception 'Elegí un motivo para anular' using errcode = '22023';
  end if;

  select pe.anulado_at into v_anulado from public.pedidos_medicacion pe where pe.id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido ya no está' using errcode = 'P0002';
  end if;
  if v_anulado is not null then
    raise exception 'Ese pedido ya está anulado' using errcode = '23514';
  end if;
  if exists (select 1 from public.medication_receptions mr where mr.pedido_id = p_pedido_id and mr.status <> 'anulada') then
    raise exception 'Este pedido ya tiene recepciones: no se puede anular' using errcode = '23514';
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();
  update public.pedidos_medicacion pe
     set anulado_at = now(), anulado_por_nombre = v_nombre, anulado_motivo = p_motivo
   where pe.id = p_pedido_id;
end;
$fn$;
revoke all on function public.anular_pedido_medicacion(uuid, text) from public;
grant execute on function public.anular_pedido_medicacion(uuid, text) to authenticated;


-- 7 · cerrar_faltante_pedido: «No va a llegar» (R11) ---------------------------------------------
create or replace function public.cerrar_faltante_pedido(p_item_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_item     public.pedido_medicacion_items%rowtype;
  v_anulado  timestamptz;
  v_recibido integer;
  v_nombre   text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para cerrar lo que falta de un pedido' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('no_lo_tiene', 'discontinuado', 'no_hace_falta') then
    raise exception 'Elegí un motivo' using errcode = '22023';
  end if;

  select * into v_item from public.pedido_medicacion_items it where it.id = p_item_id for update;
  if not found then
    raise exception 'Ese renglón ya no está' using errcode = 'P0002';
  end if;
  select pe.anulado_at into v_anulado from public.pedidos_medicacion pe where pe.id = v_item.pedido_id;
  if v_anulado is not null then
    raise exception 'Ese pedido está anulado' using errcode = '23514';
  end if;
  if v_item.cerrado_at is not null then
    raise exception 'Lo que falta de ese renglón ya está cerrado' using errcode = '23514';
  end if;

  select coalesce(sum(ri.quantity), 0)::integer into v_recibido
    from public.reception_items ri
    join public.medication_receptions mr on mr.id = ri.reception_id
   where mr.pedido_id = v_item.pedido_id
     and mr.status = 'verificada'
     and ri.medication_id = v_item.medication_id;
  if v_recibido >= v_item.pedido then
    raise exception 'Ese renglón ya se recibió entero' using errcode = '23514';
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();
  update public.pedido_medicacion_items it
     set cerrado_at = now(), cerrado_por_nombre = v_nombre, cerrado_motivo = p_motivo
   where it.id = p_item_id;
end;
$fn$;
revoke all on function public.cerrar_faltante_pedido(uuid, text) from public;
grant execute on function public.cerrar_faltante_pedido(uuid, text) to authenticated;


-- 8 · create_reception con pedido (R10) ----------------------------------------------------------
-- Cuerpo de la 0040 sin cambios, más la validación del pedido y la columna pedido_id.
drop function if exists public.create_reception(public.reception_kind, uuid, date, text, jsonb);

create or replace function public.create_reception(
  p_tipo           public.reception_kind,
  p_protocol_id    uuid,
  p_reception_date date,
  p_notes          text,
  p_items          jsonb,
  p_pedido_id      uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id              uuid;
  v_item            jsonb;
  v_pedido_protocol uuid;
  v_pedido_anulado  timestamptz;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para crear recepciones' using errcode = '42501'; end if;
  if (p_tipo = 'ambulatoria') <> (p_protocol_id is null) then
    raise exception 'El tipo % es incompatible con el protocolo indicado', p_tipo using errcode = 'check_violation';
  end if;
  if p_pedido_id is not null then
    select pe.protocol_id, pe.anulado_at into v_pedido_protocol, v_pedido_anulado
      from public.pedidos_medicacion pe where pe.id = p_pedido_id for share;
    if not found then
      raise exception 'Ese pedido ya no está' using errcode = 'P0002';
    end if;
    if v_pedido_anulado is not null then
      raise exception 'Ese pedido está anulado: no se puede recibir' using errcode = 'check_violation';
    end if;
    if p_tipo <> 'protocolo' or v_pedido_protocol is distinct from p_protocol_id then
      raise exception 'La recepción tiene que ser del mismo estudio que el pedido' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.medication_receptions (tipo, protocol_id, received_by, reception_date, status, notes, pedido_id)
  values (p_tipo, p_protocol_id, auth.uid(), p_reception_date, 'pendiente', p_notes, p_pedido_id)
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
$fn$;
revoke all on function public.create_reception(public.reception_kind, uuid, date, text, jsonb, uuid) from public;
grant execute on function public.create_reception(public.reception_kind, uuid, date, text, jsonb, uuid) to authenticated;


-- 9 · reposicion_del_periodo: los datos crudos de la pantalla (D11, R3, R6) -----------------------
-- La FORMA del JSON es la de InsumosDelPeriodo en src/data/pharma/reposicionPeriodoModel.ts: si se
-- cambia una, se cambia la otra. SECURITY DEFINER porque Farmacia no tiene select sobre patient_visits
-- (0006:162): una vista security_invoker le devolvería cero pacientes sin ningún error.
-- p_hoy y los bordes del período los manda el front en hora AR (current_date en Supabase es UTC), y los
-- movimientos se cortan por su día EN HORA AR: uno de las 23:30 del día de corte es de ese período.
-- p_protocol_id null = todos los estudios no cerrados (la grilla); con valor = uno (la pantalla del estudio).
create or replace function public.reposicion_del_periodo(
  p_desde       date,
  p_hasta       date,
  p_hoy         date,
  p_protocol_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_min_role('pharma', 'viewer') or public.has_module('gerencia')) then
    raise exception 'No tenés permiso para ver la reposición' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hoy is null or p_desde > p_hasta then
    raise exception 'El período no es válido' using errcode = '22023';
  end if;

  with
  estudios as (
    select p.id, p.code, p.name, p.status::text as status
      from public.protocols p
     where p.status <> 'cerrado'
       and (p_protocol_id is null or p.id = p_protocol_id)
  ),
  -- Movimientos de protocolo con su día en hora AR. El protocolo sale del LOTE: stock_movements no lo
  -- tiene (D32). Un ajuste sin lote no se puede atribuir a un estudio y queda afuera.
  movs as (
    select ml.protocol_id, sm.medication_id, sm.movement_type, sm.quantity_delta, sm.reference_type,
           sm.reference_id,
           (sm.created_at at time zone 'America/Argentina/Buenos_Aires')::date as dia
      from public.stock_movements sm
      join public.medication_lots ml on ml.id = sm.lot_id
      join estudios es on es.id = ml.protocol_id
     where ml.tipo = 'protocolo'
  ),
  -- Lo dispensado por enrolamiento: «ya retiró» (D14), dicho del período.
  retiros as (
    select mv.medication_id, dr.enrollment_id, -mv.quantity_delta as neto, mv.dia
      from movs mv
      left join public.dispensations d on d.id = mv.reference_id
      left join public.dispensation_requests dr on dr.id = d.request_id
     where mv.reference_type = 'dispensation'
       and mv.movement_type in ('dispensacion', 'devolucion')
  ),
  renglones as (
    select pmx.id as protocol_medication_id, pmx.protocol_id, pmx.medication_id,
           m.name as medication_name, m.unit as presentacion, m.drug_id,
           pmx.reposicion_modo as modo, pmx.envases_por_mes, pmx.stock_fijo
      from public.protocol_medications pmx
      join estudios es on es.id = pmx.protocol_id
      join public.medications m on m.id = pmx.medication_id
  ),
  cronograma as (
    select pv.enrollment_id, max(pv.estimated_date) as ultima
      from public.patient_visits pv
      join public.visit_definitions vd on vd.id = pv.visit_def_id
      join public.enrollments e on e.id = pv.enrollment_id
      join estudios es on es.id = e.protocol_id
     where pv.kind = 'programada'
       and vd.date_mode = 'automatica'
     group by pv.enrollment_id
  ),
  pacientes as (
    select pm.id as patient_medication_id, pm.enrollment_id, e.protocol_id, pm.medication_id, m.drug_id,
           pa.full_name as patient_name, e.status::text as enrollment_status,
           pm.envases_por_mes, pm.habilitacion_id, pm.created_at as asignado_el,
           (cr.enrollment_id is not null) as tiene_cronograma, cr.ultima as ultima_programada,
           coalesce((select sum(rt.neto) from retiros rt
                      where rt.enrollment_id = pm.enrollment_id and rt.medication_id = pm.medication_id
                        and rt.dia between p_desde and p_hasta), 0)::integer as retirado_periodo,
           (select max(rt.dia) from retiros rt
             where rt.enrollment_id = pm.enrollment_id and rt.medication_id = pm.medication_id
               and rt.neto > 0) as ultimo_retiro
      from public.patient_medications pm
      join public.enrollments e on e.id = pm.enrollment_id
      join estudios es on es.id = e.protocol_id
      join public.patients pa on pa.id = e.patient_id
      join public.medications m on m.id = pm.medication_id
      left join cronograma cr on cr.enrollment_id = pm.enrollment_id
     where pm.active
  ),
  -- Vencidos incluidos: el libro cuenta lo físico y la boleta filtra lo vigente en TypeScript.
  lotes as (
    select ml.protocol_id, ml.medication_id, ml.lot_number, ml.expiry_date, ml.quantity_on_hand as quantity
      from public.medication_lots ml
      join estudios es on es.id = ml.protocol_id
     where ml.tipo = 'protocolo'
       and ml.quantity_on_hand > 0
  ),
  movimientos as (
    select mv.protocol_id, mv.medication_id,
           coalesce(sum(mv.quantity_delta) filter (
             where mv.movement_type in ('recepcion', 'anulacion_recepcion') and mv.dia <= p_hasta), 0)::integer as entro,
           coalesce(-sum(mv.quantity_delta) filter (
             where mv.movement_type in ('dispensacion', 'devolucion') and mv.dia <= p_hasta), 0)::integer as salio,
           coalesce(sum(mv.quantity_delta) filter (
             where mv.movement_type in ('ajuste_manual', 'reasignacion', 'vencimiento') and mv.dia <= p_hasta), 0)::integer as ajustes,
           coalesce(sum(mv.quantity_delta), 0)::integer as desde_inicio
      from movs mv
     where mv.dia >= p_desde
     group by mv.protocol_id, mv.medication_id
  ),
  pedidos as (
    select pe.id, pe.numero, pe.protocol_id, pe.periodo_desde, pe.periodo_hasta, pe.emitido_el,
           pe.emitido_por_nombre, pe.anulado_at, pe.anulado_por_nombre, pe.anulado_motivo
      from public.pedidos_medicacion pe
      join estudios es on es.id = pe.protocol_id
  ),
  pedido_items as (
    select it.id, it.pedido_id, it.medication_id, m.name as medication_name, m.unit as presentacion,
           it.calculado, it.pedido, it.cerrado_at, it.cerrado_por_nombre, it.cerrado_motivo,
           coalesce((select sum(ri.quantity) from public.reception_items ri
                       join public.medication_receptions mr on mr.id = ri.reception_id
                      where mr.pedido_id = it.pedido_id and mr.status = 'verificada'
                        and ri.medication_id = it.medication_id), 0)::integer as recibido,
           coalesce((select sum(ri.quantity) from public.reception_items ri
                       join public.medication_receptions mr on mr.id = ri.reception_id
                      where mr.pedido_id = it.pedido_id and mr.status = 'pendiente'
                        and ri.medication_id = it.medication_id), 0)::integer as sin_verificar
      from public.pedido_medicacion_items it
      join pedidos pe on pe.id = it.pedido_id
      join public.medications m on m.id = it.medication_id
  ),
  sin_medicacion as (
    select e.protocol_id, count(*)::integer as enrolamientos
      from public.enrollments e
      join estudios es on es.id = e.protocol_id
     where e.status in ('screening', 'activo')
       and not exists (
         select 1 from public.patient_medications pm
          where pm.enrollment_id = e.id and pm.active and pm.habilitacion_id is null)
     group by e.protocol_id
  )
  select jsonb_build_object(
    'estudios',       coalesce((select jsonb_agg(to_jsonb(x)) from estudios x), '[]'::jsonb),
    'renglones',      coalesce((select jsonb_agg(to_jsonb(x)) from renglones x), '[]'::jsonb),
    'pacientes',      coalesce((select jsonb_agg(to_jsonb(x)) from pacientes x), '[]'::jsonb),
    'lotes',          coalesce((select jsonb_agg(to_jsonb(x)) from lotes x), '[]'::jsonb),
    'movimientos',    coalesce((select jsonb_agg(to_jsonb(x)) from movimientos x), '[]'::jsonb),
    'pedidos',        coalesce((select jsonb_agg(to_jsonb(x)) from pedidos x), '[]'::jsonb),
    'pedido_items',   coalesce((select jsonb_agg(to_jsonb(x)) from pedido_items x), '[]'::jsonb),
    'sin_medicacion', coalesce((select jsonb_agg(to_jsonb(x)) from sin_medicacion x), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$fn$;
revoke all on function public.reposicion_del_periodo(date, date, date, uuid) from public;
grant execute on function public.reposicion_del_periodo(date, date, date, uuid) to authenticated;
