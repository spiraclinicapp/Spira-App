-- Spira · Migración 0091 — asignar un procedimiento a una visita lo suma al estudio
-- ============================================================================
-- Cierra un hueco que dejó la 0089. Desde entonces hay DOS caminos para que un procedimiento
-- entre a un protocolo, y sólo uno dejaba rastro en la tabla nueva:
--
--   Procedimientos del estudio  → escribe `protocol_procedures`  ✓
--   Cronograma › Visitas        → escribe `protocol_activities`  ✗ (no tocaba la otra)
--
-- Como los reportes cuelgan de `protocol_procedures`, un procedimiento sumado por el segundo
-- camino quedaba EN la visita pero FUERA del estudio: no aparecía en "Procedimientos del estudio",
-- no se le podían definir reportes, y la vista `v_protocol_report_status` (0090) nunca emitía una
-- fila para él — o sea que sus reportes no existían y nadie se enteraba. Falla silenciosa.
--
-- Acá `set_visit_procedures` pasa a asegurar la fila del estudio antes de asignar. El front ya lo
-- venía tapando al abrir el lápiz, pero eso sólo cubría a quien pasara por ese botón; el rastro
-- tiene que quedar igual se llegue por donde se llegue.
--
-- `create or replace` con la MISMA firma (uuid, uuid[]): distinta habría dejado una sobrecarga
-- viva y Postgres seguiría resolviendo las llamadas viejas con la función vieja, en silencio.
--
-- ORDEN DE DESPLIEGUE: aditiva y compatible hacia atrás — la función acepta lo mismo y devuelve lo
-- mismo, sólo escribe una fila más. Va ANTES del front, o sola: el front actual funciona igual.
--
-- NOTA DE NUMERACIÓN: la 0091 estaba anotada en el plan para la fase 3 (retirar `has_report`).
-- Se le da a este arreglo porque es aditivo y puede salir ya, mientras que la fase 3 es rompiente
-- y necesita el front desplegado primero. La fase 3 pasa a la 0092.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0090. IDEMPOTENTE.
-- ============================================================================


-- 1 · Backfill: los que ya entraron por el camino de las visitas -----------------------------
-- Entre la 0089 y hoy pudo asignarse algún procedimiento a una visita sin pasar por el estudio.
-- Idempotente: `on conflict do nothing`, y `created_by` se resuelve a un usuario real porque el
-- bloque corre como postgres, sin auth.uid().
do $mig$
declare v_by uuid;
begin
  if not exists (
    select 1 from public.protocol_activities pa
    left join public.protocol_procedures pp
           on pp.protocol_id = pa.protocol_id and pp.procedure_id = pa.procedure_id
    where pp.id is null
  ) then
    raise notice 'Sin procedimientos huérfanos: no hace falta backfill';
    return;
  end if;

  select u.id into v_by
  from public.users u
  join public.user_module_roles r on r.user_id = u.id
  where r.module = 'gerencia'
  order by u.created_at limit 1;
  if v_by is null then select id into v_by from public.users order by created_at limit 1; end if;
  if v_by is null then
    raise notice 'Sin usuarios: se omite el backfill';
    return;
  end if;

  insert into public.protocol_procedures (protocol_id, procedure_id, created_by)
  select distinct pa.protocol_id, pa.procedure_id, v_by
  from public.protocol_activities pa
  on conflict (protocol_id, procedure_id) do nothing;
end $mig$;


-- 2 · La RPC, con el upsert al estudio -------------------------------------------------------
-- Cuerpo idéntico al de la 0061 salvo el bloque marcado. Se repite entero y no se "parchea"
-- porque una función se reemplaza completa: no hay forma de agregarle una sentencia sin reescribirla.
create or replace function public.set_visit_procedures(p_visit_def_id uuid, p_procedure_ids uuid[])
returns void language plpgsql security definer set search_path = public as $fn$
declare v_protocol_id uuid;
begin
  select vd.protocol_id into v_protocol_id
  from public.visit_definitions vd where vd.id = p_visit_def_id;
  if v_protocol_id is null then
    raise exception 'La definición de visita no existe' using errcode = '23503';
  end if;
  if not (public.has_module('gerencia') or public.has_min_role('track', 'operator')) then
    raise exception 'Sin permiso para editar el cronograma' using errcode = '42501';
  end if;

  -- quitar los que ya no están (array vacío o null = quitar todos)
  delete from public.protocol_activities pa
   where pa.visit_def_id = p_visit_def_id
     and (p_procedure_ids is null or pa.procedure_id <> all (p_procedure_ids));

  if p_procedure_ids is not null then
    -- ── NUEVO EN 0091 ──────────────────────────────────────────────────────────────────────
    -- Asignar un procedimiento a una visita implica que el estudio lo usa. Sin esta fila, sus
    -- reportes no tendrían de dónde colgar y la vista del tablero no lo vería nunca.
    -- `auth.uid()` sigue resolviendo al que llama aunque la función sea SECURITY DEFINER: el rol
    -- cambia, el JWT de la sesión no. Por eso el autor queda bien sellado.
    -- Sólo se AGREGA: quitar el procedimiento de todas las visitas no lo saca del estudio, porque
    -- sus definiciones de reporte tienen que sobrevivir a un cambio de cronograma.
    insert into public.protocol_procedures (protocol_id, procedure_id)
    select distinct v_protocol_id, t.pid
    from unnest(p_procedure_ids) as t(pid)
    on conflict (protocol_id, procedure_id) do nothing;
    -- ───────────────────────────────────────────────────────────────────────────────────────

    -- insertar/actualizar el orden de los presentes (orden = posición en el array)
    insert into public.protocol_activities (protocol_id, visit_def_id, procedure_id, suggested_order)
    select v_protocol_id, p_visit_def_id, t.pid, t.ord::int
    from unnest(p_procedure_ids) with ordinality as t(pid, ord)
    on conflict (visit_def_id, procedure_id) do update set suggested_order = excluded.suggested_order;
  end if;
end $fn$;

comment on function public.set_visit_procedures(uuid, uuid[]) is
  'Reemplaza atómicamente el set ordenado de procedimientos de una visita, y asegura que cada uno esté en el estudio (protocol_procedures, 0089). authz: gerencia o track-operator. 0091.';

revoke all   on function public.set_visit_procedures(uuid, uuid[]) from public;
grant execute on function public.set_visit_procedures(uuid, uuid[]) to authenticated;
