-- Spira · Migración 0098 — Baja de cuentas y resumen de actividad
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0097. IDEMPOTENTE.
-- ----------------------------------------------------------------------------
-- ADITIVA: dos funciones nuevas, nada existente se toca. Ningún front desplegado las consulta, así
-- que se aplica ANTES del deploy: el que no funciona sin ellas es el front nuevo.
--
-- Primer PR de "Alta, restablecimiento y baja de cuentas desde el panel"
-- (docs/plan-alta-de-cuentas.md). Acá va SÓLO la parte que vive en la base; el alta y el link de
-- restablecimiento necesitan la Admin API de Auth y van por Edge Function en el PR siguiente.
--
-- TRES NOTAS ANTES DE LEER
--
-- 1 · POR QUÉ "ELIMINAR" NO PUEDE SER UN DELETE. public.users tiene 38 claves foráneas apuntándole
--     y casi todas sin `on delete`, o sea NO ACTION: audit_log.actor_id, dispensations.executed_by,
--     medication_receptions.received_by, patients.enrolled_by, patient_timeline.actor_id… Borrar a
--     alguien que alguna vez tocó el sistema falla con 23503, y está bien que falle: si funcionara,
--     borraría el rastro de quién dispensó qué. Una cuenta virgen sí se puede borrar; una con
--     historia sólo se da de baja. Es el mismo muro que ya se documentó en Medicamentos.
--
-- 2 · is_active NO BLOQUEA NADA HOY. Existe desde la 0002, pero `has_module` (0006) sólo mira si hay
--     fila en user_module_roles, y el login de Auth ni siquiera pasa por nuestra RLS. Por eso la
--     baja de acá REVOCA LOS MÓDULOS —que es lo que corta la RLS de verdad— y deja is_active como
--     el reflejo de eso en la pantalla, no como la causa. El corte del ingreso es el ban en Auth y
--     lo hace la Edge Function, DESPUÉS de esta función: si el ban fallara, la persona podría
--     entrar pero no vería nada. Al revés dejaría permisos vivos con la pantalla diciendo "de baja".
--
-- 3 · LA AUDITORÍA DE LA BAJA SE ESCRIBE A MANO, Y ES LA EXCEPCIÓN. La 0096 pudo no escribir nada
--     porque trg_audit_module_roles (0003) ya cubría user_module_roles. Pero public.users NO tiene
--     trigger de auditoría —sólo trg_users_updated_at—, así que el is_active se apagaría sin dejar
--     rastro. Se registra explícitamente. No se le agrega el trigger genérico a public.users a
--     propósito: auditaría también cada cambio de nombre, puesto y la sincronización de correo que
--     corre en cada login (0095), y un historial con ruido es un historial que nadie lee.
-- ============================================================================

-- 1 · Qué dejó atrás una persona ----------------------------------------------
-- Responde dos preguntas de una sola pasada: "¿se puede borrar esta cuenta?" y "¿por qué no?".
--
-- RECORRE EL CATÁLOGO EN VEZ DE ENUMERAR TABLAS A MANO. Con 38 claves foráneas, una lista escrita
-- a mano nace incompleta y envejece peor: la tabla número 39 la agrega otra migración dentro de seis
-- meses y nadie se acuerda de volver acá. Preguntándole a pg_constraint, la respuesta es
-- automáticamente exacta y sigue siéndolo sin mantenimiento.
--
-- SÓLO CUENTAN LAS QUE BLOQUEAN: confdeltype 'a' (no action) y 'r' (restrict). Las que cascadean
-- ('c'), o ponen null ('n') o el default ('d') no impiden el borrado — user_module_roles,
-- user_preferences y feedback se van solas con la persona, y coordinator_id queda en null.
--
-- SECURITY DEFINER porque tiene que contar en tablas que quien pregunta podría no poder leer por
-- RLS (una dispensación de un protocolo que no coordina). Devuelve CANTIDADES, nunca datos: el
-- número de dispensaciones de una persona no filtra nada clínico, y sin él la pantalla no puede
-- explicar por qué el botón está gris.
create or replace function public.user_activity_summary(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_fk           record;
  v_n            bigint;
  v_total        bigint := 0;
  v_referencias  jsonb  := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Tu sesión venció.' using errcode = '28000';
  end if;

  -- Mismo criterio que set_module_access (0096): la RLS no protege un SECURITY DEFINER, así que el
  -- permiso se chequea acá y como primera verificación real.
  if not public.has_module('gerencia') then
    raise exception 'No tenés permiso para ver la actividad de una cuenta.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'Esa cuenta ya no existe. Refrescá la lista.' using errcode = '23503';
  end if;

  for v_fk in
    select ns.nspname as esquema, rel.relname as tabla, att.attname as columna
    from   pg_constraint con
    join   pg_class      rel on rel.oid = con.conrelid
    join   pg_namespace  ns  on ns.oid  = rel.relnamespace
    join   lateral unnest(con.conkey) as k(attnum) on true
    join   pg_attribute  att on att.attrelid = con.conrelid and att.attnum = k.attnum
    where  con.contype    = 'f'
      and  con.confrelid  = 'public.users'::regclass
      and  con.confdeltype in ('a', 'r')
    order by ns.nspname, rel.relname, att.attname
  loop
    -- %I escapa los identificadores y el id viaja como parámetro: nada de esto se concatena crudo,
    -- aunque los nombres salgan del catálogo y no de una entrada del usuario.
    execute format('select count(*) from %I.%I where %I = $1', v_fk.esquema, v_fk.tabla, v_fk.columna)
    into v_n
    using p_user_id;

    if v_n > 0 then
      v_total       := v_total + v_n;
      -- Se acumula por TABLA y no por columna: una misma tabla puede referenciar a la persona por
      -- dos caminos (received_by y verified_by en las recepciones) y para la pantalla eso es una
      -- sola cosa, "recepciones".
      v_referencias := v_referencias || jsonb_build_object(
        v_fk.tabla, coalesce((v_referencias ->> v_fk.tabla)::bigint, 0) + v_n
      );
    end if;
  end loop;

  return jsonb_build_object(
    'puede_eliminarse', v_total = 0,
    'total',            v_total,
    'referencias',      v_referencias
  );
end;
$fn$;

comment on function public.user_activity_summary is
  'Cuántos registros bloqueantes dejó una persona, por tabla, y si su cuenta se puede eliminar. Recorre pg_constraint en vez de una lista a mano, así no envejece. Sólo gerencia. Devuelve cantidades, nunca datos. 0098.';

grant execute on function public.user_activity_summary(uuid) to authenticated;


-- 2 · Dar de baja ------------------------------------------------------------
-- Revoca TODOS los módulos (lo que corta la RLS) y apaga is_active (lo que lo cuenta en pantalla).
-- El ingreso lo corta el ban en Auth, que hace la Edge Function después de esta llamada.
--
-- Las dos guardas son las mismas que las de set_module_access, por el mismo motivo: que no se pueda
-- dejar al centro sin nadie que administre los accesos. Acá pesan más todavía, porque una baja se
-- lleva TODOS los módulos de una y no de a uno.
create or replace function public.dar_de_baja(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid       uuid := auth.uid();
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

  -- Sin este guard, un click distraído te saca de la única pantalla desde la que podrías volver a
  -- entrar, y el arreglo sería por el dashboard de Supabase.
  if p_user_id = v_uid then
    raise exception 'No podés darte de baja a vos mismo.' using errcode = 'P0001';
  end if;

  -- Y tiene que quedar alguien administrando. Cubre el caso de dos administradoras que se dan de
  -- baja mutuamente, y el de dar de baja a la única que queda.
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

  -- Ya estaba de baja: se sale sin escribir, para no dejar una línea de auditoría de un cambio que
  -- no ocurrió (mismo criterio que el 3.5 de set_module_access).
  if not v_activa then
    return;
  end if;

  -- 2.1 · Revocar los accesos. Una línea de auditoría por módulo la escribe trg_audit_module_roles
  -- (0003), sellando el actor con auth.uid() — que dentro de un SECURITY DEFINER sigue siendo la
  -- persona real, porque sale del JWT y no del rol de base.
  delete from public.user_module_roles r
  where  r.user_id = p_user_id;

  -- 2.2 · Marcar la baja.
  update public.users u
  set    is_active = false
  where  u.id = p_user_id;

  -- 2.3 · Y registrarla. public.users no tiene trigger de auditoría (ver la nota 3 de arriba), así
  -- que sin esto el hecho de la baja no quedaría en ningún lado: se verían los accesos revocados,
  -- pero no que fue una baja de cuenta ni quién la decidió. actor_id se deja en su default
  -- (auth.uid()) a propósito, que es el mismo anti-spoofing que usa el resto del audit_log, y
  -- db_role se llena igual que en audit_row (0003) para que la fila se lea como todas las demás.
  insert into public.audit_log (action, entity_type, entity_id, before_data, after_data, db_role)
  values (
    'BAJA',
    'users',
    p_user_id,
    jsonb_build_object('is_active', true),
    jsonb_build_object('is_active', false),
    session_user
  );

  /* POR QUÉ ESTA FILA TODAVÍA NO SE VE EN NINGUNA PANTALLA, Y ES A PROPÓSITO.
     v_access_audit (0096) filtra por entity_type = 'user_module_roles', así que el historial de la
     persona va a mostrar las revocaciones una por una pero no la baja que las causó. Ensanchar esa
     vista acá la volvería BREAKING para el front desplegado —empezaría a emitir filas con module y
     role en null, que el código de hoy no sabe pintar— y esta migración dejaría de poder aplicarse
     antes del deploy. Es exactamente lo que pasó con la 0068 y con la 0092.
     El ensanche va en el PR-3, junto con el front que lo sabe leer. Mientras tanto el hecho QUEDA
     REGISTRADO, que es lo que la auditoría necesita; lo que falta es mostrarlo. */
end;
$fn$;

comment on function public.dar_de_baja is
  'Da de baja una cuenta: revoca todos sus módulos y apaga is_active. Sólo gerencia. No a uno mismo y no la última gerencia. El corte del ingreso es el ban en Auth y lo hace la Edge Function después. Registra la baja a mano porque public.users no tiene trigger de auditoría. 0098.';

grant execute on function public.dar_de_baja(uuid) to authenticated;
