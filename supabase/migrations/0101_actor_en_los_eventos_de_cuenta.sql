-- Spira · Migración 0101 — El alta, la baja y la eliminación pierden al actor
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0100. IDEMPOTENTE.
-- ----------------------------------------------------------------------------
-- CORRECTIVA y aditiva para el front: `create or replace` de dos funciones, con la MISMA firma en
-- las dos (no queda ninguna sobrecarga viva, la trampa de la 0091). Se puede aplicar en cualquier
-- momento; el front no cambia.
--
-- EL BUG. `dar_de_baja` (0098) y `registrar_evento_de_cuenta` (0099) escriben en `audit_log` sin
-- nombrar la columna `actor_id`, confiando en un DEFAULT que NO EXISTE:
--
--     -- 0002, línea 205 · patient_timeline
--     actor_id uuid not null default auth.uid() references public.users(id)
--     -- 0002, línea 366 · audit_log     ← la que importa acá
--     actor_id uuid references public.users(id)     -- sin default
--
-- Son dos columnas con el mismo nombre y distinto comportamiento, y se confundieron al escribir la
-- 0098. Resultado: TODOS los eventos de cuenta quedaron con `actor_id` null y el historial los
-- redacta como "El sistema creó la cuenta de X" — en el registro de quién dio de alta a quién, que
-- es exactamente el dato que la auditoría existe para conservar.
--
-- Se detectó en el QA del 2026-08-25, comparando en la misma sesión una fila de
-- `user_module_roles` (actor cargado, la escribe el trigger) contra una de `users` (actor null).
--
-- LA CURA es la que el trigger `audit_row` (0003) venía usando desde el día uno: resolver el actor
-- a una variable y pasarlo EXPLÍCITO. Se copia su `coalesce` con la GUC `app.actor_id` para que las
-- dos rutas de escritura del log se comporten igual — si algún día un proceso confiable setea esa
-- GUC, estas funciones la respetan sin que haya que acordarse de tocarlas.
--
-- LAS FILAS YA ESCRITAS NO SE ARREGLAN, y no se tocan a propósito: `audit_log` es inmutable. Las
-- que quedaron con actor null son de la cuenta de prueba del QA y van a decir "El sistema" para
-- siempre. Reescribir el log para que diga algo más lindo sería peor que el bug.
-- ============================================================================

-- 1 · La baja ----------------------------------------------------------------
create or replace function public.dar_de_baja(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid       uuid := auth.uid();
  v_actor     uuid;
  v_activa    boolean;
  v_gerencias integer;
begin
  if v_uid is null then
    raise exception 'Tu sesión venció.' using errcode = '28000';
  end if;

  if not public.has_module('gerencia') then
    raise exception 'No tenés permiso para dar de baja una cuenta.' using errcode = '42501';
  end if;

  select u.is_active into v_activa
  from   public.users u
  where  u.id = p_user_id;

  if not found then
    raise exception 'Esa cuenta ya no existe. Refrescá la lista.' using errcode = '23503';
  end if;

  if p_user_id = v_uid then
    raise exception 'No podés darte de baja a vos mismo.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.user_module_roles r
    where  r.user_id = p_user_id and r.module = 'gerencia'
  ) then
    select count(*) into v_gerencias
    from   public.user_module_roles r
    where  r.module = 'gerencia';

    if v_gerencias <= 1 then
      raise exception 'Tiene que quedar al menos una persona administrando los accesos del centro.'
        using errcode = 'P0001';
    end if;
  end if;

  if not v_activa then
    return;
  end if;

  delete from public.user_module_roles r
  where  r.user_id = p_user_id;

  update public.users u
  set    is_active = false
  where  u.id = p_user_id;

  -- El actor, EXPLÍCITO. Mismo resolvedor que audit_row (0003): la columna no tiene default y sin
  -- esto la baja quedaba firmada por nadie.
  v_actor := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before_data, after_data, db_role)
  values (
    v_actor,
    'BAJA',
    'users',
    p_user_id,
    jsonb_build_object('is_active', true),
    jsonb_build_object('is_active', false),
    session_user
  );
end;
$fn$;

comment on function public.dar_de_baja is
  'Da de baja una cuenta: revoca todos sus módulos y apaga is_active. Sólo gerencia. No a uno mismo y no la última gerencia. El corte del ingreso es el ban en Auth y lo hace la Edge Function después. Registra la baja a mano (public.users no tiene trigger de auditoría) sellando el actor EXPLÍCITO, porque audit_log.actor_id no tiene default. 0098, corregida en 0101.';


-- 2 · El alta y la eliminación -----------------------------------------------
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
declare
  v_actor uuid;
begin
  if auth.uid() is null then
    raise exception 'Tu sesión venció.' using errcode = '28000';
  end if;

  if not public.has_module('gerencia') then
    raise exception 'No tenés permiso para administrar cuentas.' using errcode = '42501';
  end if;

  if p_accion not in ('ALTA', 'ELIMINACION') then
    raise exception 'Evento de cuenta desconocido.' using errcode = 'P0001';
  end if;

  -- Igual que arriba: explícito, porque la columna no tiene default.
  v_actor := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before_data, after_data, db_role)
  values (
    v_actor,
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
  'Deja en audit_log el alta o la eliminación de una cuenta, sellando el actor EXPLÍCITO con auth.uid() — audit_log.actor_id NO tiene default, a diferencia de otras columnas homónimas del schema. La llama el front con su propia sesión (NO la Edge Function, que corre con la clave de servicio y no tiene actor). Sólo gerencia, y sólo dos acciones posibles. 0099, corregida en 0101.';
