-- Spira · Migración 0096 — La consola de accesos ("Equipo y accesos")
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0095. IDEMPOTENTE.
-- ----------------------------------------------------------------------------
-- ADITIVA: dos vistas y una función, todas nuevas. Ningún front desplegado las consulta, así que
-- se aplica ANTES del deploy.
--
-- Es la superficie más delicada de la app: acá se decide quién ve qué. Tres notas antes de leer.
--
-- 1 · LAS VISTAS VAN CON security_invoker. Sin eso, una vista corre con los permisos de su DUEÑO y
--     saltea la RLS de las tablas base: cualquier usuario autenticado leería el equipo entero. Con
--     él, la policy que ya existe desde la 0006 —"perfil propio: ver", que es
--     `id = auth.uid() or has_module('gerencia')`— hace todo el trabajo sola. Mismo criterio que el
--     resto de las vistas del repo (ver 0004).
--
-- 2 · LA FUNCIÓN ES SECURITY DEFINER, Y POR ESO CHEQUEA EL PERMISO A MANO. La RLS no protege un
--     SECURITY DEFINER, así que `has_module('gerencia')` va como PRIMERA verificación real. Es el
--     agujero que un review adversarial busca primero.
--
-- 3 · LA AUDITORÍA YA EXISTE. `trg_audit_module_roles` (migración 0003) escribe en audit_log cada
--     alta, cambio y baja de user_module_roles, sellando el actor con auth.uid() — que dentro de un
--     SECURITY DEFINER sigue siendo la persona real, porque sale del JWT y no del rol de base. Esta
--     migración NO escribe auditoría a mano: sólo la LEE.
-- ============================================================================

-- 1 · El equipo con sus accesos ----------------------------------------------
-- Una fila por persona, con sus accesos en un jsonb {modulo: nivel}. Se eligió el jsonb sobre una
-- fila por (persona, módulo) porque el front pinta UNA tarjeta por persona: devolver la matriz ya
-- agrupada evita que la vista tenga que reagruparla, y hace imposible el caso raro de una persona
-- que aparece dos veces por una carrera de datos.
-- Sin `where`: quien no es gerencia ve UNA fila (la propia) porque la RLS lo filtra, no porque acá
-- se lo pida. Es la diferencia entre una regla que se cumple y una que se recuerda.
create or replace view public.v_team_access
with (security_invoker = true) as
select
  u.id,
  u.full_name,
  u.email,
  u.puesto,
  u.centro,
  u.is_active,
  u.created_at,
  coalesce(
    (
      select jsonb_object_agg(r.module::text, r.role::text)
      from public.user_module_roles r
      where r.user_id = u.id
    ),
    '{}'::jsonb
  ) as accesos
from public.users u;

comment on view public.v_team_access is
  'El equipo del centro con sus accesos por módulo, ya agrupados. security_invoker: quien no es gerencia ve sólo su propia fila, por la RLS de public.users. 0096.';

-- 2 · El historial de cambios de acceso --------------------------------------
-- Lee audit_log, que ya viene llenándose desde la 0003. Dos cuidados:
--   · El `where entity_type` va PRIMERO y sobre una columna indexada (idx_audit_log_entity, 0005):
--     audit_log crece sin techo y es transversal a toda la app, así que filtrar por el jsonb sin
--     acotar antes sería un scan completo que empeora cada mes.
--   · `entity_id` es el id de la FILA de user_module_roles, no el de la persona. A quién le
--     cambiaron el acceso hay que sacarlo del payload — y del `after` o del `before` según la
--     acción, porque un DELETE no tiene after.
-- El cast a uuid es seguro porque el payload lo produce `to_jsonb(user_module_roles)` y ahí user_id
-- es uuid por definición de la tabla; no hay forma de que llegue otra cosa.
create or replace view public.v_access_audit
with (security_invoker = true) as
select
  l.id,
  l.occurred_at,
  l.action,
  coalesce(l.after_data ->> 'user_id', l.before_data ->> 'user_id')::uuid as target_user_id,
  coalesce(l.after_data ->> 'module',  l.before_data ->> 'module')        as module,
  l.before_data ->> 'role' as role_before,
  l.after_data  ->> 'role' as role_after,
  l.actor_id,
  actor.full_name  as actor_name,
  target.full_name as target_name
from public.audit_log l
left join public.users actor
       on actor.id = l.actor_id
left join public.users target
       on target.id = coalesce(l.after_data ->> 'user_id', l.before_data ->> 'user_id')::uuid
where l.entity_type = 'user_module_roles';

comment on view public.v_access_audit is
  'Historial legible de cambios de acceso, derivado de audit_log (que lo escribe trg_audit_module_roles desde 0003). Sólo lectura y sólo para gerencia, por la policy "gerencia ve auditoria" (0006). 0096.';

-- 3 · Cambiar el acceso de una persona a un módulo ---------------------------
-- p_role null = revocar el acceso a ese módulo.
-- p_expected_role = lo que el cliente creía vigente (null = "no tenía acceso"). SIEMPRE se manda:
--   es un compare-and-swap total. Sin él, dos administradoras editando a la vez se pisan y la que
--   guarda última gana en silencio — y en permisos, "en silencio" significa que alguien conserva un
--   acceso que se creyó revocado, sin nada en pantalla ni forma de reproducirlo después.
create or replace function public.set_module_access(
  p_user_id       uuid,
  p_module        spira_module,
  p_role          module_role,
  p_expected_role module_role
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid       uuid := auth.uid();
  v_actual    module_role;
  v_gerencias integer;
begin
  -- 3.1 · Sesión
  if v_uid is null then
    raise exception 'Tu sesión venció.' using errcode = '28000';
  end if;

  -- 3.2 · Permiso. VA ACÁ Y NO EN UNA POLICY: esta función es SECURITY DEFINER, así que corre con
  -- los permisos del dueño y la RLS no la mira. Si esta verificación no estuviera, cualquier
  -- usuario autenticado podría darse todos los módulos con una llamada a PostgREST.
  if not public.has_module('gerencia') then
    raise exception 'No tenés permiso para cambiar accesos.' using errcode = '42501';
  end if;

  -- 3.3 · Que la persona exista. Sin esto, el insert fallaría igual por la FK, pero con un mensaje
  -- de Postgres en inglés nombrando una constraint.
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'Esa cuenta ya no existe. Refrescá la lista.' using errcode = '23503';
  end if;

  select r.role into v_actual
  from   public.user_module_roles r
  where  r.user_id = p_user_id and r.module = p_module;

  -- 3.4 · Compare-and-swap. `is distinct from` y no `<>`: los dos lados pueden ser null ("no tenía
  -- acceso"), y con `<>` una comparación contra null da null, o sea el guard no dispararía nunca.
  if v_actual is distinct from p_expected_role then
    raise exception 'Alguien más cambió este acceso mientras lo editabas. Refrescá y volvé a mirar.'
      using errcode = 'P0001';
  end if;

  -- 3.5 · Nada que cambiar: se sale sin escribir, para no dejar una línea de auditoría de un cambio
  -- que no ocurrió. Un historial con ruido se vuelve un historial que nadie lee.
  if v_actual is not distinct from p_role then
    return;
  end if;

  -- 3.6 · No podés dejarte a vos mismo sin administración. Sin este guard, un click distraído te
  -- saca de la única pantalla desde la que podrías volver a entrar: el arreglo sería por el
  -- dashboard de Supabase.
  -- Se compara contra `is null` y no contra el nivel porque `has_module` mira si EXISTE la fila, sin
  -- importar el nivel: bajarte de admin a viewer en gerencia no te saca la administración.
  if p_module = 'gerencia' and p_user_id = v_uid and p_role is null then
    raise exception 'No podés quitarte a vos mismo la administración de accesos.'
      using errcode = 'P0001';
  end if;

  -- 3.7 · Y tiene que quedar alguien. El guard de arriba cubre el suicidio directo; éste cubre el
  -- caso de dos administradoras que se revocan mutuamente, o el de revocar a la única que queda.
  if p_module = 'gerencia' and p_role is null then
    select count(*) into v_gerencias
    from   public.user_module_roles r
    where  r.module = 'gerencia';

    if v_gerencias <= 1 then
      raise exception 'Tiene que quedar al menos una persona administrando los accesos del centro.'
        using errcode = 'P0001';
    end if;
  end if;

  -- 3.8 · Escribir. El trigger de auditoría (0003) se encarga del registro.
  if p_role is null then
    delete from public.user_module_roles r
    where  r.user_id = p_user_id and r.module = p_module;
  else
    insert into public.user_module_roles (user_id, module, role)
    values (p_user_id, p_module, p_role)
    on conflict (user_id, module) do update set role = excluded.role;
  end if;
end;
$fn$;

comment on function public.set_module_access is
  'Da, cambia o revoca (p_role null) el acceso de una persona a un módulo. Sólo gerencia. Con compare-and-swap contra p_expected_role y dos guardas que impiden dejar al centro sin administración. La auditoría la escribe trg_audit_module_roles (0003). 0096.';

grant execute on function public.set_module_access(uuid, spira_module, module_role, module_role) to authenticated;
