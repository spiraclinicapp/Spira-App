-- 0143 · Estadísticas de Coordinación: la ZONA DE EQUIPO (jefatura).
--
-- ADITIVA. Va ANTES del deploy del front: ningún front viejo pide estas columnas ni esta función,
-- y el front nuevo sin ellas no puede abrir la zona de equipo.
--
-- Tres piezas, decididas con el Director el 2026-09-23 (handoff `design_handoff_coordinacion_estadisticas`):
--
--   1 · QUIÉN MARCÓ cada sello. `arrived_at`, `ready_at` y `left_at` guardaban sólo la hora (0023);
--       el inicio de atención ya guarda quién en `coordinator_id` (0102). Tres columnas nuevas, las
--       llena un trigger BEFORE (no se reescribe ninguno de los cuatro RPC que marcan: el trigger
--       cubre a todos, y a cualquiera que escriba esas columnas en el futuro). Una vez puesto, el
--       autor no se edita: sólo cambia si el sello cambia.
--   2 · EL PASADO se completa UNA vez desde `audit_log`, que guarda la fila entera antes y después
--       de cada update junto con el actor (0002/0003). Se toma la transición null → valor actual.
--   3 · UNA FUNCIÓN para la zona de equipo, `security definer`, que chequea jefatura (Coordinación
--       nivel líder o más, o gerencia) y recién ahí devuelve las visitas de TODO el centro. Es lo que
--       pide el handoff: "el endpoint no debe devolver datos por coordinadora a quien no tiene el
--       permiso". La RLS de `patient_visits` NO cambia: un líder sigue viendo en el resto de la app
--       sólo sus estudios asignados (0028).
--
-- Se puede correr dos veces: `if not exists`, `create or replace`, y el relleno sólo toca filas
-- con el autor en null.

-- ─── 1 · Columnas ────────────────────────────────────────────────────────────────────────────
-- FK con `on delete set null`, igual que `coordinator_id` (0065) y `no_show_by` (0067). No hay embed
-- de `users` desde `patient_visits` en el front, así que la FK nueva no deja nada ambiguo.
alter table public.patient_visits
  add column if not exists arrived_by uuid references public.users(id) on delete set null,
  add column if not exists ready_by   uuid references public.users(id) on delete set null,
  add column if not exists left_by    uuid references public.users(id) on delete set null;

comment on column public.patient_visits.arrived_by is 'Quién marcó la llegada (arrived_at). Lo pone el trigger trg_sello_autor. 0143.';
comment on column public.patient_visits.ready_by   is 'Quién marcó el fin de atención (ready_at). Lo pone el trigger trg_sello_autor. 0143.';
comment on column public.patient_visits.left_by    is 'Quién marcó la salida (left_at). Lo pone el trigger trg_sello_autor. 0143.';

-- ─── 2 · Relleno del pasado, desde audit_log ─────────────────────────────────────────────────
-- En UN bloque `do`: es una sola sentencia, así que si algo falla no queda el trigger de
-- `updated_at` apagado (el editor de Supabase no comparte transacción entre sentencias).
-- El trigger de `updated_at` se apaga por lo mismo que en la 0084: completar un autor no es una
-- modificación de la visita y no tiene que moverle la fecha. El de auditoría queda PRENDIDO: el
-- relleno deja su rastro, firmado por el sistema.
-- Se hace ANTES de crear el trigger de la sección 3, que después no deja escribir el autor a mano.
do $relleno$
begin
  alter table public.patient_visits disable trigger trg_patient_visits_updated_at;

  -- Sólo se escriben las filas donde de verdad se RECUPERA un autor. Sin el filtro del final, una
  -- visita cuyo autor no está en la auditoría recibía null sobre null: una línea vacía en
  -- `audit_log` por visita, y otra más en cada corrida.
  with rec as (
    select pv.id,
      coalesce(pv.arrived_by, (
        select a.actor_id from public.audit_log a
         where a.entity_type = 'patient_visits' and a.entity_id = pv.id and a.action = 'UPDATE'
           and a.before_data ->> 'arrived_at' is null
           and (a.after_data ->> 'arrived_at')::timestamptz = pv.arrived_at
         order by a.occurred_at desc limit 1)) as a_by,
      coalesce(pv.ready_by, (
        select a.actor_id from public.audit_log a
         where a.entity_type = 'patient_visits' and a.entity_id = pv.id and a.action = 'UPDATE'
           and a.before_data ->> 'ready_at' is null
           and (a.after_data ->> 'ready_at')::timestamptz = pv.ready_at
         order by a.occurred_at desc limit 1)) as r_by,
      coalesce(pv.left_by, (
        select a.actor_id from public.audit_log a
         where a.entity_type = 'patient_visits' and a.entity_id = pv.id and a.action = 'UPDATE'
           and a.before_data ->> 'left_at' is null
           and (a.after_data ->> 'left_at')::timestamptz = pv.left_at
         order by a.occurred_at desc limit 1)) as l_by
    from public.patient_visits pv
    where (pv.arrived_at is not null and pv.arrived_by is null)
       or (pv.ready_at   is not null and pv.ready_by   is null)
       or (pv.left_at    is not null and pv.left_by    is null)
  )
  update public.patient_visits pv
     set arrived_by = rec.a_by, ready_by = rec.r_by, left_by = rec.l_by
    from rec
   where rec.id = pv.id
     and (rec.a_by is distinct from pv.arrived_by
       or rec.r_by is distinct from pv.ready_by
       or rec.l_by is distinct from pv.left_by);

  alter table public.patient_visits enable trigger trg_patient_visits_updated_at;
end
$relleno$;

-- ─── 3 · El trigger que pone el autor ────────────────────────────────────────────────────────
-- Por sello: si cambió, el autor es quien lo cambió (o null si se borró); si no cambió, el autor
-- queda como estaba — aunque el update intente escribirlo a mano.
-- El actor sale igual que en `audit_row()` (0003): el usuario de la sesión, o `app.actor_id`.
-- Sin `security definer`: no lee ninguna tabla, y así `auth.uid()` es siempre el de quien escribe.
create or replace function public.sello_autor()
returns trigger language plpgsql set search_path = pg_catalog, public as $sello$
declare
  v_actor uuid := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
begin
  if tg_op = 'INSERT' then
    new.arrived_by := case when new.arrived_at is null then null else v_actor end;
    new.ready_by   := case when new.ready_at   is null then null else v_actor end;
    new.left_by    := case when new.left_at    is null then null else v_actor end;
    return new;
  end if;

  if new.arrived_at is distinct from old.arrived_at then
    new.arrived_by := case when new.arrived_at is null then null else v_actor end;
  else
    new.arrived_by := old.arrived_by;
  end if;

  if new.ready_at is distinct from old.ready_at then
    new.ready_by := case when new.ready_at is null then null else v_actor end;
  else
    new.ready_by := old.ready_by;
  end if;

  if new.left_at is distinct from old.left_at then
    new.left_by := case when new.left_at is null then null else v_actor end;
  else
    new.left_by := old.left_by;
  end if;

  return new;
end
$sello$;

drop trigger if exists trg_sello_autor on public.patient_visits;
create trigger trg_sello_autor
  before insert or update on public.patient_visits
  for each row execute function public.sello_autor();

-- ─── 4 · La función de la zona de equipo ─────────────────────────────────────────────────────
-- Devuelve las visitas del período (atendidas por `real_date`, el resto por `estimated_date`: el
-- mismo criterio que `useTrackPeriodVisits`) de TODO el centro, sólo a jefatura.
-- Todas las columnas del resultado van con cast explícito: si un tipo no coincide, `return query`
-- falla recién al LLAMARLA, no al crearla, y eso en prod se ve como la pantalla caída.
-- Todas las referencias van calificadas: los nombres del `returns table` compiten con las
-- columnas sin calificar (0056, 0058).
create or replace function public.estadisticas_equipo_track(p_desde date, p_hasta date)
returns table (
  id uuid,
  protocol_id uuid,
  protocol_code text,
  protocol_name text,
  patient_id uuid,
  patient_name text,
  patient_code text,
  kind text,
  role text,
  visit_name text,
  real_date date,
  estimated_date date,
  window_start date,
  window_end date,
  no_show_at timestamptz,
  computed_status text,
  coordinator_id uuid,
  coordinator_name text,
  arrived_at timestamptz,
  arrived_by_name text,
  attended_at timestamptz,
  ready_at timestamptz,
  ready_by_name text,
  left_at timestamptz,
  left_by_name text
)
language plpgsql stable security definer set search_path = pg_catalog, public as $equipo$
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not (public.has_module('gerencia') or public.has_min_role('track', 'leader')) then
    raise exception 'No tenés permiso' using errcode = '42501';
  end if;

  return query
  select
    t.id::uuid,
    t.protocol_id::uuid,
    t.protocol_code::text,
    t.protocol_name::text,
    t.patient_id::uuid,
    t.patient_name::text,
    t.patient_code::text,
    t.kind::text,
    t.role::text,
    t.visit_name::text,
    t.real_date::date,
    t.estimated_date::date,
    t.window_start::date,
    t.window_end::date,
    t.no_show_at::timestamptz,
    t.computed_status::text,
    t.coordinator_id::uuid,
    t.coordinator_name::text,
    t.arrived_at::timestamptz,
    ua.full_name::text,
    t.attended_at::timestamptz,
    t.ready_at::timestamptz,
    ur.full_name::text,
    t.left_at::timestamptz,
    ul.full_name::text
  from public.v_track_visits t
  join public.patient_visits pv on pv.id = t.id
  left join public.users ua on ua.id = pv.arrived_by
  left join public.users ur on ur.id = pv.ready_by
  left join public.users ul on ul.id = pv.left_by
  where (t.real_date between p_desde and p_hasta)
     or (t.real_date is null and t.estimated_date between p_desde and p_hasta);
end
$equipo$;

revoke all on function public.estadisticas_equipo_track(date, date) from public;
revoke all on function public.estadisticas_equipo_track(date, date) from anon;
grant execute on function public.estadisticas_equipo_track(date, date) to authenticated;

comment on function public.estadisticas_equipo_track(date, date) is
  'Zona de equipo de Estadísticas de Coordinación: visitas del período de TODO el centro, con quién marcó cada sello. Sólo jefatura (gerencia o track leader+). SECURITY DEFINER. 0143.';

-- Para que la API vea la función nueva sin esperar (sin esto responde PGRST202 un rato).
notify pgrst, 'reload schema';

-- ─── Verificación ─────────────────────────────────────────────────────────────────────────────
-- Tiene que devolver una fila con tres `true`: las columnas, el trigger y la función existen.
select
  (select count(*) = 3 from information_schema.columns
    where table_schema = 'public' and table_name = 'patient_visits'
      and column_name in ('arrived_by', 'ready_by', 'left_by'))                 as columnas,
  exists (select 1 from pg_trigger where tgname = 'trg_sello_autor' and not tgisinternal) as trigger_autor,
  to_regprocedure('public.estadisticas_equipo_track(date, date)') is not null as funcion_equipo;
