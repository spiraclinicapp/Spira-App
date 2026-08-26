-- Spira · Migración 0095 — El correo, al alcance de la RLS ("Equipo y accesos")
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0094. IDEMPOTENTE.
-- ----------------------------------------------------------------------------
-- ADITIVA: columna nueva + funciones nuevas. Ningún front desplegado las consulta, así que se
-- aplica ANTES del deploy (el que no funciona sin ellas es el front nuevo).
--
-- EL PROBLEMA. La sección "Equipo y accesos" necesita mostrar el correo de cada persona, y el
-- correo NO está en public.users: vive en auth.users, que `authenticated` no puede leer.
--
-- POR QUÉ SE COPIA Y NO SE JOINEA CON UNA VISTA PRIVILEGIADA. Una vista o función SECURITY DEFINER
-- sobre auth.users **saltea la RLS**, así que el permiso habría que chequearlo a mano adentro con un
-- `if has_module('gerencia')`. El día que ese if se caiga en un refactor, cualquier usuario
-- autenticado lee el correo de todo el centro y nada en la base lo frena. Copiando la columna a
-- public.users, la policy que YA existe desde la 0006 hace el trabajo sola:
--     "perfil propio: ver" → using (id = auth.uid() or public.has_module('gerencia'))
-- El guard pasa de ser algo que hay que acordarse de poner a ser estructural. Es además el patrón
-- que este repo ya eligió dos veces en Farmacia (desnormalizar en vez de joinear, por RLS).
--
-- ⚠️ SIN TRIGGER SOBRE auth.users. Es el único esquema de esta feature que no es nuestro, y un
-- trigger con un error ahí no rompe una pantalla: rompe el ingreso de todo el centro. El correo se
-- mantiene al día por otros dos caminos, los dos de bajo riesgo:
--   · las cuentas NUEVAS nacen con él (se extiende `handle_new_user`, que ya corría ahí y ya leía
--     new.email — se le agrega una columna al insert, no un trigger nuevo);
--   · las EXISTENTES lo sincronizan solas la próxima vez que entran, porque el front llama a
--     `sync_my_email()` al abrir sesión. Cada persona converge sin que nadie haga nada.
-- Para el caso raro (cambiaste un correo desde el dashboard y esa persona todavía no entró), al
-- final de este archivo queda la sentencia de resincronización, lista para volver a correr.
-- ============================================================================

-- 1 · La columna ------------------------------------------------------------
alter table public.users add column if not exists email text;

comment on column public.users.email is
  'Correo, copiado de auth.users para que la RLS de esta tabla lo proteja (ver 0095). Se mantiene al día con sync_my_email() al abrir sesión y con handle_new_user() en el alta. NO es la fuente de verdad: esa es auth.users.';

-- 2 · Backfill de lo que ya existe -------------------------------------------
-- Idempotente y repetible: es la MISMA sentencia que la resincronización manual del final.
update public.users u
set    email = a.email
from   auth.users a
where  a.id = u.id
  and  u.email is distinct from a.email;

-- 3 · Las cuentas nuevas nacen con el correo ---------------------------------
-- `create or replace` con la MISMA firma (returns trigger, sin parámetros): no queda ninguna
-- sobrecarga viva y el trigger `on_auth_user_created` de la 0008 sigue apuntando acá sin tocarse.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.users (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

comment on function public.handle_new_user is
  'Crea el perfil al darse de alta una cuenta. NO asigna roles (un usuario nuevo arranca sin acceso: default seguro). Desde 0095 copia también el correo.';

-- 4 · Cada quien sincroniza el suyo al entrar --------------------------------
-- SECURITY DEFINER porque tiene que leer auth.users, pero sólo puede tocar la fila del que llama:
-- el `where id = v_uid` no es un filtro de conveniencia, es el límite de lo que la función puede
-- hacer. No recibe parámetros a propósito — sin un id de entrada no hay forma de pedirle que
-- escriba en la fila de otro.
create or replace function public.sync_my_email()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    return; -- sin sesión no hay nada que sincronizar; se llama al abrirla, no vale la pena un raise
  end if;

  select a.email into v_email from auth.users a where a.id = v_uid;

  update public.users u
  set    email = v_email
  where  u.id = v_uid
    and  u.email is distinct from v_email;  -- sin cambio no se escribe: no ensucia updated_at
end;
$fn$;

comment on function public.sync_my_email is
  'Copia el correo del usuario actual desde auth.users a su fila de public.users. Sólo toca la fila propia (no recibe id). La llama el front al abrir sesión. 0095.';

grant execute on function public.sync_my_email() to authenticated;

-- 5 · Resincronización manual (para correr a mano cuando haga falta) ---------
-- Si cambiás el correo de alguien desde el dashboard de Supabase y esa persona todavía no volvió a
-- entrar, su fila muestra el correo viejo. Esta es la misma sentencia del backfill de arriba:
-- idempotente, se puede correr las veces que quieras.
--
--     update public.users u
--     set    email = a.email
--     from   auth.users a
--     where  a.id = u.id
--       and  u.email is distinct from a.email;
