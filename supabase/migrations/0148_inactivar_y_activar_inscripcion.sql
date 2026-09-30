-- 0148 · Inscripción · pasar a inactivo y activar
-- ============================================================================
-- REQUIERE la 0147 aplicada ANTES (el valor 'inactivo' del enum), en otra corrida.
--
-- Dos RPC y no un `update` directo, por lo mismo que el cierre (0127): la authz se valida en el
-- servidor —gerencia, track-admin u operator asignado al protocolo, calcada de close_enrollment— y la
-- transición se controla acá, no en el front.
--
--   inactivar_inscripcion  screening | activo  → inactivo    No toca visitas ni medicación.
--   activar_inscripcion    inactivo            → activo      Tampoco: vuelve todo como estaba.
--
-- Una inactiva se puede CERRAR con close_enrollment (sólo rechaza las ya cerradas), y reabrirla la
-- devuelve a inactivo por closed_from_status. No hace falta tocar la 0127.
--
-- ADITIVA: dos funciones nuevas que ningún front viejo llama. Va antes del deploy del front.
-- ============================================================================

create or replace function public.inactivar_inscripcion(p_enrollment_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_protocol uuid;
  v_status   public.enrollment_status;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select e.protocol_id, e.status into v_protocol, v_status
  from public.enrollments e where e.id = p_enrollment_id;
  if v_protocol is null then
    raise exception 'La inscripción no existe' using errcode = '23503';
  end if;

  if not (public.has_module('gerencia') or public.has_min_role('track', 'admin')
          or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso para cambiar esta inscripción' using errcode = '42501';
  end if;

  if v_status not in ('screening', 'activo') then
    raise exception 'Sólo una participación en curso se puede pasar a inactiva' using errcode = '23514';
  end if;

  update public.enrollments set status = 'inactivo' where id = p_enrollment_id;
end
$fn$;

comment on function public.inactivar_inscripcion(uuid) is
  'Pasa una inscripción en curso (screening o activo) a inactivo: cargada, sin empezar y sin cerrar. No toca visitas ni medicación. Misma authz que close_enrollment. 0148.';

revoke all    on function public.inactivar_inscripcion(uuid) from public;
grant execute on function public.inactivar_inscripcion(uuid) to authenticated;


create or replace function public.activar_inscripcion(p_enrollment_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_protocol uuid;
  v_status   public.enrollment_status;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select e.protocol_id, e.status into v_protocol, v_status
  from public.enrollments e where e.id = p_enrollment_id;
  if v_protocol is null then
    raise exception 'La inscripción no existe' using errcode = '23503';
  end if;

  if not (public.has_module('gerencia') or public.has_min_role('track', 'admin')
          or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso para cambiar esta inscripción' using errcode = '42501';
  end if;

  if v_status <> 'inactivo' then
    raise exception 'Esa participación no está inactiva' using errcode = '23514';
  end if;

  update public.enrollments set status = 'activo' where id = p_enrollment_id;
end
$fn$;

comment on function public.activar_inscripcion(uuid) is
  'Pasa una inscripción inactiva a activo. No toca visitas ni medicación. Misma authz que close_enrollment. 0148.';

revoke all    on function public.activar_inscripcion(uuid) from public;
grant execute on function public.activar_inscripcion(uuid) to authenticated;

notify pgrst, 'reload schema';
