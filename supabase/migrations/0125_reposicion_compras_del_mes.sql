-- Spira · Migración 0125 — Reposición: compras del mes que viene.
-- Plan: docs/plan-reposicion-stock-minimo.md (D2-D4, D11, D12, D20, D25, D32, D37, D47).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0124.
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ✅ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. El front desplegado no pide nada de esto:
--    · columnas nuevas y nullable en protocol_medications y patient_medications (los select del front
--      piden columnas por nombre; ninguna fila vieja viola los checks: todo queda en null);
--    · dos tablas nuevas que ningún front viejo consulta. Sus FK a protocols, medications y users NO
--      dejan ambiguo ningún embed actual: el front no embebe protocols↔medications↔users entre sí
--      (buscado en src el 2026-09-14), y medication_lots ya unía protocols y medications desde la 0032;
--    · cuatro funciones nuevas.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- LA IDEA (plan, «La cuenta»). La card de Estadísticas dice cuántos envases comprar para el mes
-- siguiente. La cuenta vive en TypeScript con tests (reposicionModel.ts, D11); acá sólo se guarda lo que
-- Farmacia carga y se juntan los datos crudos en UNA función SECURITY DEFINER, porque Farmacia no tiene
-- select sobre patient_visits (0006:162) y una vista security_invoker le devolvería cero filas sin error.
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Cómo se repone cada medicamento del estudio (D2, D3, D4, D25) ------------------------------
alter table public.protocol_medications
  add column if not exists reposicion_modo text,
  add column if not exists envases_por_mes integer,
  add column if not exists stock_fijo integer;

alter table public.protocol_medications drop constraint if exists protocol_medications_reposicion_chk;
alter table public.protocol_medications add constraint protocol_medications_reposicion_chk check (
  (reposicion_modo is null and envases_por_mes is null and stock_fijo is null)
  or (reposicion_modo = 'mensual' and envases_por_mes is not null and envases_por_mes > 0 and stock_fijo is null)
  or (reposicion_modo = 'a_demanda' and stock_fijo is not null and stock_fijo >= 0 and envases_por_mes is null)
  or (reposicion_modo = 'no_se_compra' and envases_por_mes is null and stock_fijo is null)
);

comment on column public.protocol_medications.reposicion_modo is
  'Cómo se repone en este estudio: mensual (envases_por_mes por paciente), a_demanda (tener stock_fijo) o no_se_compra. NULL = sin cargar (la card no lo cuenta como cero). 0125.';


-- 2 · La excepción por paciente (D2, D27) --------------------------------------------------------
-- Update directo de Farmacia operator (policy 0050:151). El front no la ofrece en asignaciones con
-- habilitacion_id: el trigger de la 0124 limpiaría la marca de «una entrega».
alter table public.patient_medications
  add column if not exists envases_por_mes integer;
alter table public.patient_medications drop constraint if exists patient_medications_envases_por_mes_chk;
alter table public.patient_medications add constraint patient_medications_envases_por_mes_chk
  check (envases_por_mes is null or envases_por_mes > 0);

comment on column public.patient_medications.envases_por_mes is
  'Excepción del paciente a la cantidad mensual del estudio (protocol_medications.envases_por_mes). NULL = la del estudio. 0125.';


-- 3 · Ajustes de Farmacia: la demora de compra (D6) ----------------------------------------------
-- Una sola fila. `id` lo exige audit_row() (0003). Nace con la demora en NULL: la card la pide en vez
-- de inventar un número.
create table if not exists public.farmacia_ajustes (
  id                 uuid primary key default gen_random_uuid(),
  unica              boolean not null default true unique check (unica),
  demora_compra_dias integer check (demora_compra_dias between 0 and 365),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.users(id) on delete set null
);
comment on table public.farmacia_ajustes is 'Ajustes de Farmacia (una sola fila). demora_compra_dias: días desde que se pide hasta que llega una compra. 0125.';

insert into public.farmacia_ajustes (unica)
select true where not exists (select 1 from public.farmacia_ajustes);

-- Quién y cuándo los sella el servidor: el cliente no puede escribir otro autor (D32).
create or replace function public.sellar_farmacia_ajustes()
returns trigger language plpgsql set search_path = public as $fn$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$fn$;

drop trigger if exists trg_sellar_farmacia_ajustes on public.farmacia_ajustes;
create trigger trg_sellar_farmacia_ajustes
  before update on public.farmacia_ajustes
  for each row execute function public.sellar_farmacia_ajustes();

drop trigger if exists trg_audit_farmacia_ajustes on public.farmacia_ajustes;
create trigger trg_audit_farmacia_ajustes
  after insert or update or delete on public.farmacia_ajustes
  for each row execute function public.audit_row();

alter table public.farmacia_ajustes enable row level security;

drop policy if exists "ver ajustes de farmacia" on public.farmacia_ajustes;
create policy "ver ajustes de farmacia" on public.farmacia_ajustes for select
  using (public.has_min_role('pharma', 'viewer') or public.has_module('gerencia'));

drop policy if exists "farmacia edita ajustes" on public.farmacia_ajustes;
create policy "farmacia edita ajustes" on public.farmacia_ajustes for update
  using (public.has_min_role('pharma', 'operator'))
  with check (public.has_min_role('pharma', 'operator'));

revoke all on public.farmacia_ajustes from anon;
revoke insert, delete, truncate on public.farmacia_ajustes from authenticated;
grant select, update on public.farmacia_ajustes to authenticated;


-- 4 · Pedidos de compra en camino (D20, D47) -----------------------------------------------------
-- «Ya lo pedí» guarda una fila por renglón a comprar, todas con el mismo `grupo`. Se netean solas contra
-- las recepciones verificadas desde `pedido_el` (en el front, reposicionModel.pedidosAbiertos).
-- «Deshacer» borra el grupo (queda en audit_log). Sin escritura directa: sólo por las funciones.
create table if not exists public.reposicion_pedidos (
  id              uuid primary key default gen_random_uuid(),
  grupo           uuid not null,
  protocol_id     uuid not null references public.protocols(id) on delete restrict,
  medication_id   uuid not null references public.medications(id) on delete restrict,
  cantidad        integer not null check (cantidad > 0),
  pedido_el       date not null,
  created_by      uuid not null default auth.uid() references public.users(id) on delete restrict,
  created_by_name text,
  created_at      timestamptz not null default now()
);
comment on table public.reposicion_pedidos is 'Pedidos de compra marcados con «Ya lo pedí» (una fila por renglón, mismo grupo). Se descuentan de la compra hasta que se reciben. 0125.';

create index if not exists reposicion_pedidos_prot_med_idx on public.reposicion_pedidos (protocol_id, medication_id);
create index if not exists reposicion_pedidos_grupo_idx on public.reposicion_pedidos (grupo);

drop trigger if exists trg_audit_reposicion_pedidos on public.reposicion_pedidos;
create trigger trg_audit_reposicion_pedidos
  after insert or update or delete on public.reposicion_pedidos
  for each row execute function public.audit_row();

alter table public.reposicion_pedidos enable row level security;

drop policy if exists "ver pedidos de reposicion" on public.reposicion_pedidos;
create policy "ver pedidos de reposicion" on public.reposicion_pedidos for select
  using (public.has_min_role('pharma', 'viewer') or public.has_module('gerencia'));

revoke all on public.reposicion_pedidos from anon;
revoke insert, update, delete, truncate on public.reposicion_pedidos from authenticated;
grant select on public.reposicion_pedidos to authenticated;


-- 5 · configurar_reposicion: Farmacia operator carga cómo se repone (D12) ------------------------
-- protocol_medications exige leader para escribir (0032:193). Esto abre a operator SÓLO estas tres
-- columnas; asignar y quitar medicamentos del estudio sigue siendo de leader.
create or replace function public.configurar_reposicion(
  p_protocol_medication_id uuid,
  p_modo                   text,
  p_envases_por_mes        integer,
  p_stock_fijo             integer
)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para cambiar cómo se repone' using errcode = '42501';
  end if;
  if p_modo is not null and p_modo not in ('mensual', 'a_demanda', 'no_se_compra') then
    raise exception 'Modo de reposición inválido' using errcode = '22023';
  end if;

  update public.protocol_medications pmx
     set reposicion_modo = p_modo,
         envases_por_mes = case when p_modo = 'mensual' then p_envases_por_mes end,
         stock_fijo      = case when p_modo = 'a_demanda' then p_stock_fijo end
   where pmx.id = p_protocol_medication_id;
  if not found then
    raise exception 'Ese medicamento ya no está en el estudio' using errcode = 'P0002';
  end if;
end;
$fn$;
revoke all on function public.configurar_reposicion(uuid, text, integer, integer) from public;
grant execute on function public.configurar_reposicion(uuid, text, integer, integer) to authenticated;


-- 6 · registrar_pedido_reposicion / anular_pedido_reposicion: «Ya lo pedí» y «Deshacer» (D47) -----
-- Todo el pedido en una llamada: o entran todas las filas o ninguna.
-- p_renglones: [{ "protocol_id": uuid, "medication_id": uuid, "cantidad": int }, …]
create or replace function public.registrar_pedido_reposicion(p_renglones jsonb, p_pedido_el date)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_grupo  uuid := gen_random_uuid();
  v_nombre text;
  v_r      jsonb;
  v_hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para marcar pedidos' using errcode = '42501';
  end if;
  if p_pedido_el is null or p_pedido_el > v_hoy then
    raise exception 'La fecha del pedido no puede ser futura' using errcode = '22023';
  end if;
  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El pedido está vacío' using errcode = '22023';
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();

  for v_r in select value from jsonb_array_elements(p_renglones) loop
    if not exists (
      select 1 from public.protocol_medications pmx
       where pmx.protocol_id = (v_r->>'protocol_id')::uuid
         and pmx.medication_id = (v_r->>'medication_id')::uuid
    ) then
      raise exception 'Un medicamento del pedido ya no está en su estudio' using errcode = 'P0002';
    end if;
    if coalesce((v_r->>'cantidad')::integer, 0) <= 0 then
      raise exception 'Cada renglón del pedido necesita una cantidad' using errcode = '22023';
    end if;
    insert into public.reposicion_pedidos (grupo, protocol_id, medication_id, cantidad, pedido_el, created_by, created_by_name)
    values (v_grupo, (v_r->>'protocol_id')::uuid, (v_r->>'medication_id')::uuid, (v_r->>'cantidad')::integer,
            p_pedido_el, auth.uid(), v_nombre);
  end loop;

  return v_grupo;
end;
$fn$;
revoke all on function public.registrar_pedido_reposicion(jsonb, date) from public;
grant execute on function public.registrar_pedido_reposicion(jsonb, date) to authenticated;

create or replace function public.anular_pedido_reposicion(p_grupo uuid)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para deshacer pedidos' using errcode = '42501';
  end if;
  delete from public.reposicion_pedidos rp where rp.grupo = p_grupo;
  if not found then
    raise exception 'Ese pedido ya no está' using errcode = 'P0002';
  end if;
end;
$fn$;
revoke all on function public.anular_pedido_reposicion(uuid) from public;
grant execute on function public.anular_pedido_reposicion(uuid) to authenticated;


-- 7 · insumos_de_reposicion: los datos crudos de la card (D11, D37) ------------------------------
-- La FORMA del JSON es la de InsumosReposicion en src/views/pharma/reportes/reposicionModel.ts: si se
-- cambia una, se cambia la otra. Siempre todos los estudios no cerrados (D37: ningún filtro la mueve).
-- p_hoy lo manda el front en hora AR: current_date en Supabase es UTC.
create or replace function public.insumos_de_reposicion(p_hoy date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_mes_desde date;
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_min_role('pharma', 'viewer') or public.has_module('gerencia')) then
    raise exception 'No tenés permiso para ver las compras' using errcode = '42501';
  end if;
  if p_hoy is null then raise exception 'Falta la fecha' using errcode = '22023'; end if;
  v_mes_desde := date_trunc('month', p_hoy)::date;

  with
  estudios as (
    select p.id, p.code, p.name, p.status::text as status
      from public.protocols p
     where p.status <> 'cerrado'
       and exists (select 1 from public.protocol_medications pmx where pmx.protocol_id = p.id)
  ),
  -- Movimientos de dispensación netos (dispensación − devolución), con el día en hora AR, el protocolo
  -- por el LOTE (stock_movements no tiene protocolo, D32) y el enrolamiento por el pedido.
  movs as (
    select sm.medication_id,
           ml.protocol_id,
           dr.enrollment_id,
           -sm.quantity_delta as neto,
           (sm.created_at at time zone 'America/Argentina/Buenos_Aires')::date as dia
      from public.stock_movements sm
      join public.medication_lots ml on ml.id = sm.lot_id
      left join public.dispensations d on d.id = sm.reference_id
      left join public.dispensation_requests dr on dr.id = d.request_id
     where sm.reference_type = 'dispensation'
       and sm.movement_type in ('dispensacion', 'devolucion')
  ),
  renglones as (
    select pmx.id as protocol_medication_id, pmx.protocol_id, pmx.medication_id,
           m.name as medication_name, m.unit as presentacion, m.drug_id,
           pmx.reposicion_modo as modo, pmx.envases_por_mes, pmx.stock_fijo,
           coalesce((select sum(mv.neto) from movs mv
                      where mv.protocol_id = pmx.protocol_id and mv.medication_id = pmx.medication_id
                        and mv.dia > p_hoy - 90), 0)::integer as salidas_90d
      from public.protocol_medications pmx
      join estudios es on es.id = pmx.protocol_id
      join public.medications m on m.id = pmx.medication_id
  ),
  cronograma as (
    select pv.enrollment_id, max(pv.estimated_date) as ultima
      from public.patient_visits pv
      join public.visit_definitions vd on vd.id = pv.visit_def_id
     where pv.kind = 'programada'
       and vd.date_mode = 'automatica'
     group by pv.enrollment_id
  ),
  pacientes as (
    select pm.id as patient_medication_id, pm.enrollment_id, e.protocol_id, pm.medication_id, m.drug_id,
           pa.full_name as patient_name, e.status::text as enrollment_status,
           pm.envases_por_mes, pm.habilitacion_id, pm.created_at as asignado_el,
           (cr.enrollment_id is not null) as tiene_cronograma, cr.ultima as ultima_programada,
           coalesce((select sum(mv.neto) from movs mv
                      where mv.enrollment_id = pm.enrollment_id and mv.medication_id = pm.medication_id
                        and mv.dia >= v_mes_desde), 0)::integer as retirado_mes,
           (select max(mv.dia) from movs mv
             where mv.enrollment_id = pm.enrollment_id and mv.medication_id = pm.medication_id
               and mv.neto > 0) as ultimo_retiro
      from public.patient_medications pm
      join public.enrollments e on e.id = pm.enrollment_id
      join estudios es on es.id = e.protocol_id
      join public.patients pa on pa.id = e.patient_id
      join public.medications m on m.id = pm.medication_id
      left join cronograma cr on cr.enrollment_id = pm.enrollment_id
     where pm.active
  ),
  lotes as (
    select ml.protocol_id, ml.medication_id, ml.lot_number, ml.expiry_date, ml.quantity_on_hand as quantity
      from public.medication_lots ml
      join estudios es on es.id = ml.protocol_id
     where ml.tipo = 'protocolo'
       and ml.quantity_on_hand > 0
       and (ml.expiry_date is null or ml.expiry_date >= p_hoy)
  ),
  pedidos as (
    select rp.id, rp.grupo, rp.protocol_id, rp.medication_id, rp.cantidad, rp.pedido_el
      from public.reposicion_pedidos rp
      join estudios es on es.id = rp.protocol_id
     where rp.pedido_el > p_hoy - 365
  ),
  recepciones as (
    select mr.protocol_id, ri.medication_id, ri.quantity as cantidad,
           (coalesce(mr.verified_at, mr.created_at) at time zone 'America/Argentina/Buenos_Aires')::date as recibido_el
      from public.reception_items ri
      join public.medication_receptions mr on mr.id = ri.reception_id
      join estudios es on es.id = mr.protocol_id
     where mr.status = 'verificada'
       and (coalesce(mr.verified_at, mr.created_at) at time zone 'America/Argentina/Buenos_Aires')::date
           >= coalesce((select min(pe.pedido_el) from pedidos pe), p_hoy + 1)
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
    'demora_compra_dias', (select fa.demora_compra_dias from public.farmacia_ajustes fa limit 1),
    'estudios',       coalesce((select jsonb_agg(to_jsonb(x)) from estudios x), '[]'::jsonb),
    'renglones',      coalesce((select jsonb_agg(to_jsonb(x)) from renglones x), '[]'::jsonb),
    'pacientes',      coalesce((select jsonb_agg(to_jsonb(x)) from pacientes x), '[]'::jsonb),
    'lotes',          coalesce((select jsonb_agg(to_jsonb(x)) from lotes x), '[]'::jsonb),
    'pedidos',        coalesce((select jsonb_agg(to_jsonb(x)) from pedidos x), '[]'::jsonb),
    'recepciones',    coalesce((select jsonb_agg(to_jsonb(x)) from recepciones x), '[]'::jsonb),
    'sin_medicacion', coalesce((select jsonb_agg(to_jsonb(x)) from sin_medicacion x), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$fn$;
revoke all on function public.insumos_de_reposicion(date) from public;
grant execute on function public.insumos_de_reposicion(date) to authenticated;
