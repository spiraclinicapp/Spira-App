-- 0077 · Dispensación · reasignar la preparación y leer su historial
-- ============================================================================
-- REQUIERE la 0076 aplicada.
--
-- Las dos entradas que le faltaban al menú ⋯ del cajón. El handoff lo anuncia
-- como "Rechazar, reasignar, historial" (§4.1) y solo la primera existía; el
-- criterio de la casa es que ningún botón finja acción, así que o se construyen
-- o no se dibujan.
--
-- 1 · REASIGNAR. Hoy pasar una preparación a otra farmacéutica se hace por el
--     camino largo: cancelarla (vuelve a Solicitadas, se pierden los escaneos y
--     se libera el código) y que la otra la tome de nuevo. Funciona, pero tira
--     trabajo hecho por un cambio de turno. Reasignar mueve `prepared_by` y no
--     toca ni un escaneo.
--
-- 2 · HISTORIAL. El `audit_log` ya registra todo lo que le pasó al pedido, pero
--     la única lectura que existe es la de gerencia (`historial_medicacion`,
--     0052). Para la farmacéutica —que es quien necesita saber por qué su
--     pedido volvió a la cola— no había ninguna. Esta función abre SOLO las
--     filas de ESE pedido y su cadena, con candado propio.
-- ============================================================================


-- 1 · Reasignar la preparación -------------------------------------------------
create or replace function public.reassign_dispensation_preparation(
  p_request_id uuid,
  p_user_id    uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare v_status request_status; v_actual uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede reasignar una preparación' using errcode = '42501';
  end if;

  select dr.status, dr.prepared_by into v_status, v_actual
  from public.dispensation_requests dr where dr.id = p_request_id for update;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;

  -- Solo mientras se prepara. Desde 'lista' el comprobante ya salió sellado con las iniciales de
  -- quien lo preparó (`dispensation_code`, 0055): cambiar de responsable después dejaría el papel
  -- impreso nombrando a una persona y la base a otra.
  if v_status <> 'preparando' then
    raise exception 'Solo se puede reasignar una preparación en curso (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  if p_user_id = v_actual then
    raise exception 'Esa preparación ya está asignada a esa persona' using errcode = 'check_violation';
  end if;

  -- Quien recibe tiene que PODER prepararla. Sin este control, reasignar a alguien de otro módulo
  -- dejaría el pedido en manos de quien no lo puede ni abrir, y en el tablero figuraría trabajado
  -- por alguien que no lo va a tocar nunca.
  if not exists (
    select 1 from public.user_module_roles umr
    where umr.user_id = p_user_id
      and umr.module = 'pharma'
      and umr.role in ('operator','leader','admin')
  ) then
    raise exception 'Esa persona no puede preparar dispensaciones' using errcode = 'check_violation';
  end if;

  update public.dispensation_requests dr
    set prepared_by = p_user_id
    where dr.id = p_request_id;
end; $$;
revoke all on function public.reassign_dispensation_preparation(uuid, uuid) from public;
grant execute on function public.reassign_dispensation_preparation(uuid, uuid) to authenticated;


-- 2 · A quién se le puede reasignar --------------------------------------------
-- Va por función y no por un select del cliente: `users` y `user_module_roles` no son legibles en
-- bloque para pharma, y hacerlo legible para dibujar un desplegable abriría bastante más de lo que
-- el desplegable necesita.
create or replace function public.farmaceuticas_disponibles()
returns table (user_id uuid, nombre text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede ver esta lista' using errcode = '42501';
  end if;

  return query
  select u.id, u.full_name
  from public.users u
  join public.user_module_roles umr on umr.user_id = u.id
  where umr.module = 'pharma'
    and umr.role in ('operator','leader','admin')
    and u.id <> auth.uid()          -- reasignarse a sí misma no es reasignar
  order by u.full_name;
end; $$;
revoke all on function public.farmaceuticas_disponibles() from public;
grant execute on function public.farmaceuticas_disponibles() to authenticated;


-- 3 · El historial del pedido ---------------------------------------------------
-- Lee del `audit_log`, que es inmutable y ya registra todo. Abre SOLO lo de ESTE pedido y su
-- cadena (renglones, dispensación, constancias), nunca la tabla entera: el audit_log tiene datos de
-- todos los módulos y una lectura amplia acá sería una puerta lateral a lo que la RLS protege.
-- OJO CON LOS NOMBRES: el audit_log (0002:364) NO usa los nombres "de manual". Son
-- `entity_type`/`entity_id` (no table_name/row_id), `occurred_at` (no created_at), y el autor es
-- `actor_id` (uuid, sin nombre desnormalizado) — hay que joinear `users` para mostrar a quién.
create or replace function public.dispensation_audit_trail(p_request_id uuid)
returns table (
  cuando   timestamptz,
  quien    text,
  entidad  text,
  accion   text,
  antes    jsonb,
  despues  jsonb
)
language plpgsql security definer set search_path = public as $$
declare v_disp_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  -- Farmacia y gerencia. Coordinación no: ve el estado de su pedido en Track, pero el detalle de
  -- quién lo preparó y con qué correcciones es operación de farmacia.
  if not (public.has_min_role('pharma','viewer') or public.has_min_role('gerencia','viewer')) then
    raise exception 'No tenés permiso para ver el historial de esta dispensación' using errcode = '42501';
  end if;

  select d.id into v_disp_id
  from public.dispensations d where d.request_id = p_request_id limit 1;

  return query
  select
    al.occurred_at,
    -- `actor_id` en null = acción del sistema (así lo documenta la 0002), no un dato faltante.
    coalesce(u.full_name, case when al.actor_id is null then 'Sistema' else '—' end),
    al.entity_type,
    al.action,
    al.before_data,
    al.after_data
  from public.audit_log al
  left join public.users u on u.id = al.actor_id
  where (al.entity_type = 'dispensation_requests'      and al.entity_id = p_request_id)
     or (al.entity_type = 'dispensation_request_items' and al.entity_id in (
           select dri.id from public.dispensation_request_items dri where dri.request_id = p_request_id))
     or (al.entity_type = 'dispensation_ip_documents'  and al.entity_id in (
           select d.id from public.dispensation_ip_documents d where d.request_id = p_request_id))
     or (v_disp_id is not null and al.entity_type = 'dispensations' and al.entity_id = v_disp_id)
  order by al.occurred_at desc
  limit 200;
end; $$;
revoke all on function public.dispensation_audit_trail(uuid) from public;
grant execute on function public.dispensation_audit_trail(uuid) to authenticated;
