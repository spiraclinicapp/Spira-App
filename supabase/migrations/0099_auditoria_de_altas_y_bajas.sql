-- Spira · Migración 0099 — La huella del alta y de la eliminación de una cuenta
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0098. IDEMPOTENTE.
-- ----------------------------------------------------------------------------
-- ADITIVA: una función nueva. Ningún front desplegado la consulta → va ANTES del deploy.
--
-- Segundo PR de docs/plan-alta-de-cuentas.md. Acompaña a la Edge Function `admin-usuarios`.
--
-- POR QUÉ HACE FALTA. La 0098 ya resolvió el rastro de la BAJA, pero quedaban dos huecos del mismo
-- origen: public.users no tiene trigger de auditoría, así que **crear** una cuenta y **eliminarla**
-- tampoco dejaban huella. El alta se podía deducir a medias (asignarle el primer módulo sí queda
-- registrado por trg_audit_module_roles), pero una cuenta creada y nunca habilitada no aparecía en
-- ningún lado, y una eliminada desaparecía sin dejar constancia de que existió. En un sistema
-- auditable, "quién dio de alta a quién" no es un detalle.
--
-- POR QUÉ NO LO ESCRIBE LA EDGE FUNCTION. Porque corre con la clave de servicio, y ahí auth.uid()
-- es NULL: la línea quedaría como "acción del sistema" y se perdería el actor, que es el dato
-- entero. Escribiéndolo desde un RPC que el front llama CON SU PROPIA SESIÓN, el actor se sella
-- solo con el default de la columna. Es el mismo anti-spoofing que usa el resto del audit_log.
--
-- POR QUÉ UNA FUNCIÓN Y NO UNA POLICY DE INSERT SOBRE audit_log. Abrir el insert al cliente
-- convertiría el log en escribible: cualquier autenticado podría fabricar líneas de auditoría. Acá
-- la acción viene de un conjunto CERRADO de dos valores y el resto de los campos los pone la
-- función, no quien llama.
-- ============================================================================

create or replace function public.registrar_evento_de_cuenta(
  p_accion  text,
  p_user_id uuid,
  p_datos   jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null then
    raise exception 'Tu sesión venció.' using errcode = '28000';
  end if;

  -- La RLS no protege un SECURITY DEFINER: el permiso va acá y como primera verificación real.
  if not public.has_module('gerencia') then
    raise exception 'No tenés permiso para administrar cuentas.' using errcode = '42501';
  end if;

  -- Conjunto cerrado. Sin esto, la función sería un "escribí lo que quieras en la auditoría".
  if p_accion not in ('ALTA', 'ELIMINACION') then
    raise exception 'Evento de cuenta desconocido.' using errcode = 'P0001';
  end if;

  -- No se valida que la cuenta exista: en ELIMINACION ya no existe, y ése es justamente el caso
  -- que hay que poder registrar. entity_id no es una clave foránea, así que apuntar a un id que ya
  -- no está es válido y es lo correcto — es la única constancia de que esa cuenta existió.
  insert into public.audit_log (action, entity_type, entity_id, before_data, after_data, db_role)
  values (
    p_accion,
    'users',
    p_user_id,
    case when p_accion = 'ELIMINACION' then p_datos else null end,
    case when p_accion = 'ALTA'        then p_datos else null end,
    session_user
  );
end;
$fn$;

comment on function public.registrar_evento_de_cuenta is
  'Deja en audit_log el alta o la eliminación de una cuenta, sellando el actor con auth.uid(). La llama el front con su propia sesión (NO la Edge Function, que corre con la clave de servicio y no tiene actor). Sólo gerencia, y sólo dos acciones posibles. 0099.';

grant execute on function public.registrar_evento_de_cuenta(text, uuid, jsonb) to authenticated;
