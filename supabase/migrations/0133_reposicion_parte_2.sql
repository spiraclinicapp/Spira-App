-- Spira · Migración 0133 — Reposición, parte 2: pedido sin duplicados, reabrir «No va a llegar», las
-- recepciones de cada pedido y la lista de «Recibir un pedido».
-- Spec: docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md (revisión de diseño: RD2, RD17,
-- RD18 y la decisión abierta del doble pedido). Revisión de ingeniería del plan (2026-09-19): 1A, 7A, 12A
-- y 15A, anotadas en cada sección.
-- Plan: docs/superpowers/plans/2026-09-18-reposicion-parte-2-pantallas.md (Task 5).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0132 (la guarda de Recepción).
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ✅ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT (el que no anda sin ella es el front nuevo):
--    · pedidos_medicacion.intento es nueva y nullable: ningún front la pide;
--    · emitir_pedido_medicacion suma p_intento y p_ultimo_visto con default null AL FINAL. Se BORRA antes la
--      firma de cinco: create or replace con otra firma deja una sobrecarga viva y PostgREST contestaría
--      PGRST203. Ningún front desplegado la llama todavía (la Parte 1 no tiene pantallas), y aunque la
--      llamara con cinco argumentos por nombre, resolvería a la nueva por los defaults. La fecha de emisión
--      pasa a tener que ser la de hoy: tampoco rompe a nadie, por lo mismo;
--    · cerrar_faltante_pedido conserva la firma y suma un rechazo (lo que falta ya llegó y está sin verificar);
--    · reabrir_faltante_pedido y pedidos_por_recibir son nuevas;
--    · reposicion_del_periodo conserva la firma y SUMA la clave «recepciones» al JSON: nadie la pide todavía.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Un pedido por intento (decisión abierta de la revisión de diseño: el doble pedido) ------------
-- «Armar pedido» manda un uuid propio por cada vez que se abre. Si la red se corta DESPUÉS de guardar y
-- la farmacéutica reintenta, la función devuelve el pedido que ya quedó, en vez de emitir otro con otro
-- número y la misma medicación.
alter table public.pedidos_medicacion add column if not exists intento uuid;
create unique index if not exists pedidos_medicacion_intento_uq
  on public.pedidos_medicacion (intento) where intento is not null;


-- 2 · emitir_pedido_medicacion con intento y con lo que vio la pantalla -----------------------------
-- · p_intento: un reintento del mismo «Armar pedido» devuelve el pedido ya guardado. Si llega con OTRAS
--   cantidades (se editó después del corte de red) no se devuelve callado: la farmacéutica se quedaría con
--   una hoja que no es la que se guardó (revisión de ingeniería, 1A).
-- · p_ultimo_visto: el número del último pedido de ese período que mostraba la pantalla (0 si ninguno).
--   Si mientras tanto alguien emitió otro para el mismo estudio y período, se frena y se lo nombra: dos
--   personas con el estudio abierto no emiten dos pedidos por lo mismo (7A). El candado por estudio hace
--   que dos emisiones simultáneas se vean entre sí. null = no se controla (llamadas viejas).
-- · p_emitido_el tiene que ser hoy en Argentina: la hoja lleva esa fecha y una pantalla abierta desde ayer
--   emitiría con la de ayer (15A).
-- · Si el pedido del intento está anulado, el reintento se rechaza en vez de devolverlo: la pantalla no
--   puede imprimir una hoja de un pedido que ya no existe como si la emisión hubiera salido bien.
drop function if exists public.emitir_pedido_medicacion(uuid, date, date, date, jsonb);

create or replace function public.emitir_pedido_medicacion(
  p_protocol_id  uuid,
  p_desde        date,
  p_hasta        date,
  p_emitido_el   date,
  p_renglones    jsonb,
  p_intento      uuid default null,
  p_ultimo_visto integer default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_id       uuid;
  v_numero   integer;
  v_protocol uuid;
  v_anulado  timestamptz;
  v_nombre   text;
  v_r        jsonb;
  v_otro     integer;
  v_hoy      date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para emitir pedidos' using errcode = '42501';
  end if;

  -- Un reintento del mismo «Armar pedido»: devuelve lo que ya quedó guardado, sin volver a validar (un
  -- reintento después de medianoche tiene que encontrar su pedido, no chocar con la fecha). Sólo si pide
  -- lo mismo: medicamento por medicamento, las mismas cantidades.
  if p_intento is not null then
    select pe.id, pe.numero, pe.protocol_id, pe.anulado_at into v_id, v_numero, v_protocol, v_anulado
      from public.pedidos_medicacion pe
     where pe.intento = p_intento;
    if found then
      if v_protocol <> p_protocol_id then
        raise exception 'Ese pedido ya se emitió para otro estudio' using errcode = '22023';
      end if;
      if v_anulado is not null then
        raise exception 'Ese pedido se anuló: cerrá esta ventana y armalo de nuevo' using errcode = '23514';
      end if;
      if exists (
        select 1
          from (select it.medication_id, it.pedido
                  from public.pedido_medicacion_items it
                 where it.pedido_id = v_id) guardado
          full join (select (r.value->>'medication_id')::uuid as medication_id, (r.value->>'pedido')::integer as pedido
                       from jsonb_array_elements(case when jsonb_typeof(p_renglones) = 'array' then p_renglones
                                                      else '[]'::jsonb end) r) llega
            on llega.medication_id = guardado.medication_id
         where guardado.medication_id is null
            or llega.medication_id is null
            or llega.pedido is distinct from guardado.pedido
      ) then
        raise exception 'Ese pedido ya quedó emitido con otras cantidades: fijate en la lista del estudio'
          using errcode = '22023';
      end if;
      return jsonb_build_object('id', v_id, 'numero', v_numero);
    end if;
  end if;

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período del pedido no es válido' using errcode = '22023';
  end if;
  if p_emitido_el is distinct from v_hoy then
    raise exception 'La pantalla quedó abierta desde otro día: recargala para emitir' using errcode = '22023';
  end if;
  if not exists (select 1 from public.protocols pr where pr.id = p_protocol_id and pr.status <> 'cerrado') then
    raise exception 'Ese estudio no existe o está cerrado' using errcode = 'P0002';
  end if;
  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El pedido está vacío' using errcode = '22023';
  end if;

  -- Un candado por estudio hasta el fin de la transacción: la segunda de dos emisiones simultáneas espera a
  -- la primera y, al seguir, ya ve su pedido.
  perform pg_advisory_xact_lock(hashtextextended('emitir_pedido_medicacion:' || p_protocol_id::text, 0));
  if p_ultimo_visto is not null then
    select max(pe.numero) into v_otro
      from public.pedidos_medicacion pe
     where pe.protocol_id = p_protocol_id
       and pe.anulado_at is null
       and pe.periodo_desde <= p_hasta
       and pe.periodo_hasta >= p_desde
       and pe.numero > p_ultimo_visto;
    if v_otro is not null then
      raise exception 'Ya hay un pedido para este período (Nº %): fijate en la lista del estudio', v_otro
        using errcode = '23514';
    end if;
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();

  begin
    insert into public.pedidos_medicacion (protocol_id, periodo_desde, periodo_hasta, emitido_el, emitido_por, emitido_por_nombre, intento)
    values (p_protocol_id, p_desde, p_hasta, p_emitido_el, auth.uid(), v_nombre, p_intento)
    returning id, numero into v_id, v_numero;
  exception when unique_violation then
    -- Dos llamadas con el mismo intento a la vez: la otra guardó primero. Se devuelve la suya.
    select pe.id, pe.numero into v_id, v_numero
      from public.pedidos_medicacion pe
     where pe.intento = p_intento;
    if v_id is null then raise; end if;
    return jsonb_build_object('id', v_id, 'numero', v_numero);
  end;

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
revoke all on function public.emitir_pedido_medicacion(uuid, date, date, date, jsonb, uuid, integer) from public;
grant execute on function public.emitir_pedido_medicacion(uuid, date, date, date, jsonb, uuid, integer) to authenticated;


-- 2b · cerrar_faltante_pedido: no se cierra lo que ya llegó (revisión de ingeniería, 12A) ------------
-- Misma firma y mismo cuerpo que la 0128, más un rechazo: si lo que falta del renglón ya está en una
-- recepción sin verificar, «No va a llegar» es falso — la medicación está en la casa y volvería a la
-- compra. La pantalla esconde el botón en ese caso; esto cubre la llamada directa y la pantalla vieja.
create or replace function public.cerrar_faltante_pedido(p_item_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_item          public.pedido_medicacion_items%rowtype;
  v_anulado       timestamptz;
  v_recibido      integer;
  v_sin_verificar integer;
  v_nombre        text;
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
  -- for share: mismo criterio que el resto de las funciones que leen un pedido antes de decidir (0128,
  -- secciones 5 y 7) — serializa contra anular_pedido_medicacion, que lo toma for update.
  select pe.anulado_at into v_anulado from public.pedidos_medicacion pe where pe.id = v_item.pedido_id for share;
  if v_anulado is not null then
    raise exception 'Ese pedido está anulado' using errcode = '23514';
  end if;
  if v_item.cerrado_at is not null then
    raise exception 'Lo que falta de ese renglón ya está cerrado' using errcode = '23514';
  end if;

  select coalesce(sum(ri.quantity) filter (where mr.status = 'verificada'), 0)::integer,
         coalesce(sum(ri.quantity) filter (where mr.status = 'pendiente'), 0)::integer
    into v_recibido, v_sin_verificar
    from public.reception_items ri
    join public.medication_receptions mr on mr.id = ri.reception_id
   where mr.pedido_id = v_item.pedido_id
     and ri.medication_id = v_item.medication_id;
  if v_recibido >= v_item.pedido then
    raise exception 'Ese renglón ya se recibió entero' using errcode = '23514';
  end if;
  if v_recibido + v_sin_verificar >= v_item.pedido then
    raise exception 'Ese renglón tiene una recepción sin verificar: verificala o anulala antes' using errcode = '23514';
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();
  update public.pedido_medicacion_items it
     set cerrado_at = now(), cerrado_por_nombre = v_nombre, cerrado_motivo = p_motivo
   where it.id = p_item_id;
end;
$fn$;
revoke all on function public.cerrar_faltante_pedido(uuid, text) from public;
grant execute on function public.cerrar_faltante_pedido(uuid, text) to authenticated;


-- 3 · reabrir_faltante_pedido: deshacer «No va a llegar» (RD2) ---------------------------------------
-- Si al final la farmacia lo manda, lo que faltaba vuelve a estar en camino y se recibe con el pedido.
-- Quién y cuándo lo reabrió queda en audit_log: el trigger de la tabla guarda el antes (con el motivo) y
-- el después, con el actor.
create or replace function public.reabrir_faltante_pedido(p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_item    public.pedido_medicacion_items%rowtype;
  v_anulado timestamptz;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para reabrir lo que falta de un pedido' using errcode = '42501';
  end if;

  select * into v_item from public.pedido_medicacion_items it where it.id = p_item_id for update;
  if not found then
    raise exception 'Ese renglón ya no está' using errcode = 'P0002';
  end if;
  -- for share: mismo criterio que cerrar_faltante_pedido (0128) — serializa contra anular_pedido_medicacion.
  select pe.anulado_at into v_anulado from public.pedidos_medicacion pe where pe.id = v_item.pedido_id for share;
  if v_anulado is not null then
    raise exception 'Ese pedido está anulado' using errcode = '23514';
  end if;
  if v_item.cerrado_at is null then
    raise exception 'Ese renglón no estaba cerrado' using errcode = '23514';
  end if;

  update public.pedido_medicacion_items it
     set cerrado_at = null, cerrado_por_nombre = null, cerrado_motivo = null
   where it.id = p_item_id;
end;
$fn$;
revoke all on function public.reabrir_faltante_pedido(uuid) from public;
grant execute on function public.reabrir_faltante_pedido(uuid) to authenticated;


-- 4 · reposicion_del_periodo con las recepciones de cada pedido (RD17) -------------------------------
-- Misma firma y mismo cuerpo que la 0128, más la CTE «recepciones»: las no anuladas de los pedidos que
-- trae, con su número, para decir «Llegó, falta verificar la recepción Nº 1051» y listarlas en el pedido.
create or replace function public.reposicion_del_periodo(
  p_desde       date,
  p_hasta       date,
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
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
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
  recepciones as (
    select mr.id, mr.pedido_id, mr.folio, mr.reception_date, mr.status::text as status, mr.verified_by_name,
           coalesce((select sum(ri.quantity) from public.reception_items ri where ri.reception_id = mr.id), 0)::integer as envases
      from public.medication_receptions mr
      join pedidos pe on pe.id = mr.pedido_id
     where mr.status in ('pendiente', 'verificada')
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
    'recepciones',    coalesce((select jsonb_agg(to_jsonb(x)) from recepciones x), '[]'::jsonb),
    'sin_medicacion', coalesce((select jsonb_agg(to_jsonb(x)) from sin_medicacion x), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$fn$;
revoke all on function public.reposicion_del_periodo(date, date, uuid) from public;
grant execute on function public.reposicion_del_periodo(date, date, uuid) to authenticated;


-- 5 · pedidos_por_recibir: la lista de «Recibir un pedido» (R10) ------------------------------------
-- Independiente del período (la Recepción no sabe de cortes): los pedidos no anulados con algún renglón
-- abierto que todavía no se recibió entero, con su estudio, sus renglones y sus recepciones no anuladas
-- (para avisar la que está sin verificar y no recibir dos veces).
create or replace function public.pedidos_por_recibir()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'viewer') then
    raise exception 'No tenés permiso para ver los pedidos' using errcode = '42501';
  end if;

  with
  items as (
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
      join public.pedidos_medicacion pe on pe.id = it.pedido_id
      join public.medications m on m.id = it.medication_id
     where pe.anulado_at is null
  ),
  pedidos as (
    select pe.id, pe.numero, pe.protocol_id, pe.periodo_desde, pe.periodo_hasta, pe.emitido_el,
           pe.emitido_por_nombre, pe.anulado_at, pe.anulado_por_nombre, pe.anulado_motivo
      from public.pedidos_medicacion pe
     where exists (
       select 1 from items i
        where i.pedido_id = pe.id and i.cerrado_at is null and i.recibido < i.pedido)
  ),
  estudios as (
    select pr.id, pr.code, pr.name
      from public.protocols pr
     where pr.id in (select p.protocol_id from pedidos p)
  ),
  recepciones as (
    select mr.id, mr.pedido_id, mr.folio, mr.reception_date, mr.status::text as status, mr.verified_by_name,
           coalesce((select sum(ri.quantity) from public.reception_items ri where ri.reception_id = mr.id), 0)::integer as envases
      from public.medication_receptions mr
     where mr.pedido_id in (select p.id from pedidos p)
       and mr.status in ('pendiente', 'verificada')
  )
  select jsonb_build_object(
    'estudios',     coalesce((select jsonb_agg(to_jsonb(x)) from estudios x), '[]'::jsonb),
    'pedidos',      coalesce((select jsonb_agg(to_jsonb(x)) from pedidos x), '[]'::jsonb),
    'pedido_items', coalesce((select jsonb_agg(to_jsonb(x)) from items x where x.pedido_id in (select p.id from pedidos p)), '[]'::jsonb),
    'recepciones',  coalesce((select jsonb_agg(to_jsonb(x)) from recepciones x), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$fn$;
revoke all on function public.pedidos_por_recibir() from public;
grant execute on function public.pedidos_por_recibir() to authenticated;
