-- Spira · Migración 0094 — Consultar la ventana de cambio de correo (sin sellarla)
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0093. IDEMPOTENTE.
-- ----------------------------------------------------------------------------
-- ADITIVA: función nueva. Ningún front desplegado la llama, así que se aplica ANTES del deploy.
--
-- EL PROBLEMA QUE ARREGLA. La 0045 dejó la regla "un cambio de correo cada 30 días" en
-- `stamp_email_change()`, que la valida y la SELLA en la misma llamada. Como el sello tiene que
-- correr DESPUÉS de disparar el cambio en Auth (para no quemar la ventana si el correo es inválido
-- o ya está en uso), el front terminaba llamándola al final y **descartando su error** — con lo
-- cual el `raise` del servidor no llegaba a ningún lado y la regla no se aplicaba nunca. Lo único
-- que frenaba era el `disabled` del input, o sea nada para quien abra la consola del navegador.
--
-- LA SOLUCIÓN es separar preguntar de sellar. Esta función solo PREGUNTA (es `stable`, no escribe),
-- así se la puede llamar antes sin consumir nada. `stamp_email_change()` queda igual que en 0045 y
-- sigue siendo la guarda dura: si dos pestañas corren a la vez, la segunda choca contra ella.
--
-- NO se usa `create or replace` sobre `stamp_email_change` para "devolver" la fecha: cambiarle el
-- tipo de retorno a una función existente falla, y cambiarle la firma dejaría viva una sobrecarga
-- resolviendo las llamadas viejas con el cuerpo viejo, en silencio. Función nueva, nombre nuevo.
-- ============================================================================

-- Devuelve CUÁNDO se va a poder cambiar el correo de nuevo, o null si se puede ahora.
-- Null cubre los dos casos en que "se puede": nunca se cambió, y ya pasaron los 30 días.
create or replace function public.email_change_locked_until()
returns timestamptz
language plpgsql
security definer
stable
set search_path = public
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_last timestamptz;
begin
  if v_uid is null then
    raise exception 'Tu sesión venció.' using errcode = '28000';
  end if;

  -- La columna se califica con el alias (u.email_changed_at) por costumbre dura de este repo: en
  -- plpgsql, un nombre sin calificar puede resolver contra una variable en vez de contra la columna,
  -- y ese error ya costó dos migraciones (0056 y 0058).
  select u.email_changed_at into v_last
  from public.users u
  where u.id = v_uid;

  if v_last is null then
    return null;
  end if;

  if v_last > now() - interval '30 days' then
    return v_last + interval '30 days';
  end if;

  return null;
end;
$fn$;

comment on function public.email_change_locked_until is
  'Cuándo vuelve a estar disponible el cambio de correo (null = ahora). Solo consulta, NO sella: el sello sigue siendo stamp_email_change (0045). 0094.';

grant execute on function public.email_change_locked_until() to authenticated;
