-- Spira · Migración 0145 — Pendientes por retomar y retest atado a una visita
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-09-27-pendientes-por-retomar-design.md
-- Plan: docs/superpowers/plans/2026-09-27-pendientes-por-retomar.md
--
-- QUÉ RESUELVE. Un procedimiento que no se hizo en una visita finalizada no quedaba registrado
-- como pendiente en ningún lado: si tenía reporte, la visita no cerraba nunca; si no, se perdía en
-- silencio. Y pasarlo a otro día (0144) obligaba a poner la fecha en el momento, cuando al cierre de
-- la visita casi nunca se sabe cuándo vuelve el paciente. Además, el retest era suelto: no sabía
-- qué visita repetía.
--
-- CÓMO. Una marca explícita, «este procedimiento de esta visita queda para otro día», sin fecha
-- (visit_pending_procedures). La lista efectiva (v_visit_procedures, 0144) la resta, así la visita
-- cierra con lo que se hizo y las vistas que ya leen de ahí lo heredan sin tocarlas. Retomar crea
-- la continuación de la 0144 con fecha y consume la marca. El retest gana su origen en
-- patient_visits.retest_of_visit_id, validado en register_visit_event.
--
-- «HECHO». En la app sólo se tildan los procedimientos que dejan reporte. Uno sin reporte se da por
-- hecho cuando la visita se atendió, salvo que se lo haya dejado para otro día (decisión 9 del
-- spec): lo pregunta procedimiento_hecho().
--
-- ORDEN DE DESPLIEGUE: ADITIVA, va PRIMERO. Sin marcas, la lista efectiva es la misma de antes. El
-- front viejo llama a register_visit_event con cinco parámetros por nombre, que siguen andando: el
-- sexto tiene default. v_track_visits suma columnas AL FINAL. El front nuevo (PR B) NO anda sin
-- esta migración.
--
-- APLICAR a mano en el SQL Editor de Supabase, después de la 0144. IDEMPOTENTE: si algo corta a
-- la mitad, se vuelve a correr el archivo entero. Las sondas del final se MIRAN, no alcanza con el
-- "Success". Registrar en supabase/README.md al confirmarse en prod.
--
-- Probada con PGlite sobre un esquema de juguete, contra las versiones vivas de las vistas y la 0144.
-- ============================================================================

-- 1 · La marca: «este procedimiento de esta visita queda para otro día» ------------------------------
-- Sin fecha a propósito: la fecha la pone la continuación el día que se retoma (continuar_pendientes).
--   · vpp_visita_fk, CASCADE: la marca es de la visita. Si la visita se borra, no queda nada que
--     retomar de ella.
--   · vpp_procedimiento_fk, RESTRICT: como visit_procedure_completions (0064) y la 0144.
-- Sin UPDATE: una marca se pone o se quita. `id` es la clave aunque la unicidad sea (visita,
-- procedimiento): audit_row() resuelve `old.id` al planificar (0003, pasó con la 0111). Las
-- constraints van NOMBRADAS: el front embebe el procedimiento por `vpp_procedimiento_fk`.
create table if not exists public.visit_pending_procedures (
  id           uuid primary key default gen_random_uuid(),
  visit_id     uuid not null,
  procedure_id uuid not null,
  marked_by    uuid not null default auth.uid(),
  marked_at    timestamptz not null default now(),
  constraint vpp_visita_fk          foreign key (visit_id)     references public.patient_visits(id) on delete cascade,
  constraint vpp_procedimiento_fk   foreign key (procedure_id) references public.procedures(id)     on delete restrict,
  constraint vpp_marcado_por_fk     foreign key (marked_by)    references public.users(id),
  constraint vpp_visita_procedimiento_unico unique (visit_id, procedure_id)
);
comment on table public.visit_pending_procedures is
  'Procedimientos que una visita deja para otro día, sin fecha todavía. Se escriben sólo por RPC; retomarlos (continuar_pendientes) los consume. 0145.';

-- RLS: se ve si se ve la visita, igual que visit_added_procedures (0144). El subselect corre con la
-- RLS de patient_visits de quien consulta, así que el alcance es el de la visita, sin copiar su regla.
alter table public.visit_pending_procedures enable row level security;
drop policy if exists "ver procedimientos para otro dia" on public.visit_pending_procedures;
create policy "ver procedimientos para otro dia" on public.visit_pending_procedures for select using (
  exists (select 1 from public.patient_visits pv where pv.id = visit_pending_procedures.visit_id));
revoke all on public.visit_pending_procedures from anon;
revoke insert, update, delete, truncate, references, trigger on public.visit_pending_procedures from authenticated;
grant select on public.visit_pending_procedures to authenticated;

drop trigger if exists trg_audit_vpp on public.visit_pending_procedures;
create trigger trg_audit_vpp after insert or update or delete
  on public.visit_pending_procedures for each row execute function public.audit_row();


-- 2 · Si una visita dejó un procedimiento para otro día ---------------------------------------------
-- SECURITY DEFINER: responde igual para cualquiera que pregunte, sin depender de su RLS. Las otras
-- dos preguntas de esta migración van más abajo, cada una después de lo que lee: procedimiento_hecho
-- lee la lista efectiva (sección 3) y visita_tiene_retests la columna nueva (sección 7). Un
-- `language sql` valida lo que nombra al crearse.
create or replace function public.procedimiento_marcado(p_visit_id uuid, p_procedure_id uuid)
returns boolean language sql security definer stable set search_path = pg_catalog, public as $fn$
  select exists (select 1 from public.visit_pending_procedures m
                 where m.visit_id = p_visit_id and m.procedure_id = p_procedure_id);
$fn$;


-- 3 · La LISTA EFECTIVA, ahora sin lo marcado para otro día ----------------------------------------
-- Copia de la 0144 con UNA condición más en cada rama: lo que esta visita dejó para otro día no lo
-- debe. Con eso la visita cierra aunque el reporte del procedimiento marcado siga en 'pendiente', y
-- v_patient_visits, v_procedure_report_alerts y v_protocol_report_status —que leen de acá desde la
-- 0144— lo heredan sin tocarlas. Mismas columnas y mismo orden: `create or replace`, sin drop.
-- Al retomar, la marca se borra y pasa a restar la fila diferida (0144): nunca restan las dos a la
-- vez, y si lo hicieran el resultado sería el mismo.
create or replace view public.v_visit_procedures with (security_invoker = true) as
select
  pv.id               as visit_id,
  pa.procedure_id,
  pa.suggested_order,
  'cronograma'::text  as origen,
  null::uuid          as deferred_from_visit_id,
  p.code              as procedure_code,
  p.name              as procedure_name,
  p.category          as procedure_category
from public.patient_visits pv
join public.protocol_activities pa on pa.visit_def_id = pv.visit_def_id
join public.procedures p           on p.id = pa.procedure_id
where not exists (select 1 from public.visit_added_procedures d
                  where d.deferred_from_visit_id = pv.id and d.procedure_id = pa.procedure_id)
  and not exists (select 1 from public.visit_pending_procedures m
                  where m.visit_id = pv.id and m.procedure_id = pa.procedure_id)
union all
select
  a.visit_id,
  a.procedure_id,
  null::integer,
  case when a.deferred_from_visit_id is null then 'agregado' else 'diferido' end,
  a.deferred_from_visit_id,
  p.code,
  p.name,
  p.category
from public.visit_added_procedures a
join public.procedures p on p.id = a.procedure_id
where not exists (select 1 from public.visit_added_procedures d
                  where d.deferred_from_visit_id = a.visit_id and d.procedure_id = a.procedure_id)
  and not exists (select 1 from public.visit_pending_procedures m
                  where m.visit_id = a.visit_id and m.procedure_id = a.procedure_id);

comment on view public.v_visit_procedures is
  'Lista efectiva de procedimientos de cada visita: cronograma − lo que pasó a otra visita − lo dejado para otro día + lo agregado. Única fuente de «qué debe esta visita». 0144, 0145.';
revoke all on public.v_visit_procedures from anon;
grant select on public.v_visit_procedures to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_visit_procedures from authenticated;

-- «Hecho» (decisión 9 del spec). En la app sólo se tildan los procedimientos que dejan reporte: el
-- tilde vive en el panel «Reportes pendientes». Uno sin reporte no tiene casilla en ningún lado,
-- así que se da por hecho cuando la visita se atendió — si sigue en su lista efectiva, o sea, si no
-- se lo pasó ni se lo dejó para otro día. Lo usan el retest (sólo repite lo hecho) y nada más: el
-- cierre de la visita sigue siendo el de v_patient_visits.
create or replace function public.procedimiento_hecho(p_visit_id uuid, p_procedure_id uuid)
returns boolean language sql security definer stable set search_path = pg_catalog, public as $fn$
  select exists (select 1 from public.visit_procedure_completions c
                 where c.visit_id = p_visit_id and c.procedure_id = p_procedure_id)
      or (
        exists (select 1 from public.patient_visits pv where pv.id = p_visit_id and pv.real_date is not null)
        and exists (select 1 from public.v_visit_procedures vp
                    where vp.visit_id = p_visit_id and vp.procedure_id = p_procedure_id)
        and not exists (select 1
                        from public.patient_visits pv
                        join public.enrollments e          on e.id = pv.enrollment_id
                        join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                                          and pp.procedure_id = p_procedure_id
                        join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
                        where pv.id = p_visit_id)
      );
$fn$;

-- `from public, anon`: Supabase le da EXECUTE a anon explícitamente en cada función nueva.
revoke all on function public.procedimiento_marcado(uuid, uuid) from public, anon;
revoke all on function public.procedimiento_hecho(uuid, uuid) from public, anon;
grant execute on function public.procedimiento_marcado(uuid, uuid) to authenticated;
grant execute on function public.procedimiento_hecho(uuid, uuid) to authenticated;


-- 4 · Dejar para otro día, y quitar la marca ------------------------------------------------------
-- dejar_pendientes sólo acepta lo que la visita todavía DEBE (su lista efectiva) y NO hizo. Lo que ya
-- estaba marcado se ignora (idempotente): no está en la lista efectiva justamente porque ya se marcó.
-- El lock serializa dos marcados simultáneos sobre la misma visita.
create or replace function public.dejar_pendientes(p_visit_id uuid, p_procedure_ids uuid[])
returns void language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_uid uuid := auth.uid();
  v_protocol uuid;
  v_procs uuid[] := coalesce(array(select distinct t.x from unnest(p_procedure_ids) as t(x) where t.x is not null), '{}');
begin
  if v_uid is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if cardinality(v_procs) = 0 then
    raise exception 'Elegí qué procedimientos quedan para otro día' using errcode = 'check_violation';
  end if;

  select e.protocol_id into v_protocol
  from public.patient_visits pv
  join public.enrollments e on e.id = pv.enrollment_id
  where pv.id = p_visit_id
  for update of pv;
  if v_protocol is null then raise exception 'Esa visita ya no existe' using errcode = '23503'; end if;
  if not public.puede_registrar_visitas(v_protocol) then
    raise exception 'No tenés permiso para cambiar las visitas de este paciente' using errcode = '42501';
  end if;

  if exists (
    select 1 from unnest(v_procs) as t(x)
    where not public.procedimiento_marcado(p_visit_id, t.x)
      and (not exists (select 1 from public.v_visit_procedures vp
                       where vp.visit_id = p_visit_id and vp.procedure_id = t.x)
           or exists (select 1 from public.visit_procedure_completions c
                      where c.visit_id = p_visit_id and c.procedure_id = t.x))
  ) then
    raise exception 'Solo quedan para otro día los procedimientos que esta visita todavía no hizo' using errcode = 'check_violation';
  end if;

  insert into public.visit_pending_procedures (visit_id, procedure_id, marked_by)
  select p_visit_id, t.x, v_uid from unnest(v_procs) as t(x)
  on conflict on constraint vpp_visita_procedimiento_unico do nothing;
end $fn$;

-- «Se hace hoy». Quitar lo que no está marcado no es un error: dos pestañas pueden apretarlo a la vez.
create or replace function public.quitar_pendiente(p_visit_id uuid, p_procedure_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_uid uuid := auth.uid();
  v_protocol uuid;
begin
  if v_uid is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  select e.protocol_id into v_protocol
  from public.patient_visits pv
  join public.enrollments e on e.id = pv.enrollment_id
  where pv.id = p_visit_id
  for update of pv;
  if v_protocol is null then raise exception 'Esa visita ya no existe' using errcode = '23503'; end if;
  if not public.puede_registrar_visitas(v_protocol) then
    raise exception 'No tenés permiso para cambiar las visitas de este paciente' using errcode = '42501';
  end if;
  delete from public.visit_pending_procedures m
  where m.visit_id = p_visit_id and m.procedure_id = p_procedure_id;
end $fn$;


-- 5 · Retomar: la continuación con fecha, y la marca consumida --------------------------------------
-- Mismo resultado que diferir_procedimientos (0144): una VNP con fecha propia y sus filas con
-- deferred_from_visit_id. NO se llama a diferir: diferir exige que el procedimiento esté en la lista
-- efectiva del origen, y lo marcado ya no está (la sección 3 lo resta). Acá la validación es otra
-- —que esté marcado— y el insert se repite, que son dos sentencias. Todo en una transacción: la
-- continuación, sus filas y el borrado de las marcas. Lo que no se elige sigue marcado.
-- Deshacer la continuación devuelve la marca (sección 6 c).
create or replace function public.continuar_pendientes(
  p_visita_origen uuid, p_procedure_ids uuid[], p_fecha date
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_uid uuid := auth.uid();
  v_enrollment uuid; v_protocol uuid; v_visit uuid;
  v_procs uuid[] := coalesce(array(select distinct t.x from unnest(p_procedure_ids) as t(x) where t.x is not null), '{}');
begin
  if v_uid is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if p_fecha is null then raise exception 'La fecha es obligatoria' using errcode = '23502'; end if;
  if cardinality(v_procs) = 0 then
    raise exception 'Elegí qué procedimientos se retoman' using errcode = 'check_violation';
  end if;

  select pv.enrollment_id, e.protocol_id into v_enrollment, v_protocol
  from public.patient_visits pv
  join public.enrollments e on e.id = pv.enrollment_id
  where pv.id = p_visita_origen
  for update of pv;
  if v_enrollment is null then raise exception 'Esa visita ya no existe' using errcode = '23503'; end if;
  if not public.puede_registrar_visitas(v_protocol) then
    raise exception 'No tenés permiso para cambiar las visitas de este paciente' using errcode = '42501';
  end if;

  if exists (select 1 from unnest(v_procs) as t(x)
             where not public.procedimiento_marcado(p_visita_origen, t.x)) then
    raise exception 'Solo se retoman los procedimientos que quedaron para otro día' using errcode = 'check_violation';
  end if;

  insert into public.patient_visits (enrollment_id, kind, estimated_date)
  values (v_enrollment, 'vnp', p_fecha)
  returning id into v_visit;

  insert into public.visit_added_procedures (visit_id, procedure_id, deferred_from_visit_id, added_by)
  select v_visit, t.x, p_visita_origen, v_uid from unnest(v_procs) as t(x);

  delete from public.visit_pending_procedures m
  where m.visit_id = p_visita_origen and m.procedure_id = any (v_procs);

  return v_visit;
end $fn$;

revoke all on function public.dejar_pendientes(uuid, uuid[]) from public, anon;
revoke all on function public.quitar_pendiente(uuid, uuid) from public, anon;
revoke all on function public.continuar_pendientes(uuid, uuid[], date) from public, anon;
grant execute on function public.dejar_pendientes(uuid, uuid[]) to authenticated;
grant execute on function public.quitar_pendiente(uuid, uuid) to authenticated;
grant execute on function public.continuar_pendientes(uuid, uuid[], date) to authenticated;


-- 6 · Guardas: no tildar lo marcado, y no perder lo marcado al editar ---------------------------------
-- (a) guard_tildar_diferido (0144) suma el caso de lo marcado. Mismo nombre y mismo trigger: el
--     `create or replace` alcanza. Sin security definer (ver la sección 10 de la 0144): las
--     preguntas las hacen funciones definer.
create or replace function public.guard_tildar_diferido()
returns trigger language plpgsql set search_path = pg_catalog, public as $fn$
begin
  if public.procedimiento_diferido(new.visit_id, new.procedure_id) then
    raise exception 'Ese procedimiento pasó a otra visita: se marca allá' using errcode = 'check_violation';
  end if;
  if public.procedimiento_marcado(new.visit_id, new.procedure_id) then
    raise exception 'Quedó para otro día. Quitá la marca si se hace hoy.' using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

-- (b) set_added_procedures (0144, sección 9): la pantalla manda la lista EFECTIVA, que ya no trae lo
--     marcado. Sin la condición nueva del delete, guardar la edición de un retest borraba la fila del
--     procedimiento marcado y la marca quedaba colgando de algo que la visita ya no lleva. Se conserva,
--     igual que ya se conservaba lo diferido. Cuerpo copiado de la 0144; la línea nueva va señalada.
create or replace function public.set_added_procedures(p_visit_id uuid, p_procedure_ids uuid[])
returns void language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_uid uuid := auth.uid();
  v_kind visit_kind; v_def uuid; v_protocol uuid;
  v_procs uuid[] := coalesce(array(select distinct t.x from unnest(p_procedure_ids) as t(x) where t.x is not null), '{}');
begin
  if v_uid is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select pv.kind, pv.visit_def_id, e.protocol_id into v_kind, v_def, v_protocol
  from public.patient_visits pv
  join public.enrollments e on e.id = pv.enrollment_id
  where pv.id = p_visit_id
  for update of pv;
  if v_protocol is null then raise exception 'Esa visita ya no existe' using errcode = '23503'; end if;
  if not public.puede_registrar_visitas(v_protocol) then
    raise exception 'No tenés permiso para cambiar las visitas de este paciente' using errcode = '42501';
  end if;
  if v_def is not null then
    raise exception 'Los procedimientos de una visita del cronograma se editan en el cronograma del protocolo' using errcode = 'check_violation';
  end if;
  if v_kind not in ('vnp', 'retest') then
    raise exception 'Solo el retest y la VNP llevan procedimientos propios' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.visit_added_procedures a
             join public.visit_procedure_completions c on c.visit_id = a.visit_id and c.procedure_id = a.procedure_id
             where a.visit_id = p_visit_id and not (a.procedure_id = any (v_procs))) then
    raise exception 'No se puede quitar un procedimiento que ya está marcado como realizado' using errcode = 'check_violation';
  end if;
  -- Se valida contra el estudio sólo lo que se está AGREGANDO ahora: un procedimiento puede salir del
  -- estudio (se borra su protocol_procedures) después de que un retest ya lo llevaba. Si además está
  -- marcado como realizado, no se puede sacar (la regla de arriba) ni se podría volver a poner (ya no
  -- está en protocol_procedures) — sin este segundo `not exists`, esa visita queda imposible de editar
  -- para siempre. Lo que la visita YA lleva es historia y se conserva tal cual, sin re-validar.
  if exists (select 1 from unnest(v_procs) as t(x)
             where not exists (select 1 from public.protocol_procedures pp
                               where pp.protocol_id = v_protocol and pp.procedure_id = t.x)
               and not exists (select 1 from public.visit_added_procedures a
                               where a.visit_id = p_visit_id and a.procedure_id = t.x)) then
    raise exception 'Ese procedimiento no es de este estudio' using errcode = 'check_violation';
  end if;

  delete from public.visit_added_procedures a
  where a.visit_id = p_visit_id
    and not (a.procedure_id = any (v_procs))
    and not public.procedimiento_diferido(p_visit_id, a.procedure_id)
    and not public.procedimiento_marcado(p_visit_id, a.procedure_id);   -- 0145

  insert into public.visit_added_procedures (visit_id, procedure_id, added_by)
  select p_visit_id, t.x, v_uid from unnest(v_procs) as t(x)
  on conflict on constraint vap_visita_procedimiento_unico do nothing;

  if v_kind = 'retest' and not exists (select 1 from public.visit_added_procedures a where a.visit_id = p_visit_id) then
    raise exception 'Un retest lleva al menos un procedimiento' using errcode = 'check_violation';
  end if;
end $fn$;
revoke all on function public.set_added_procedures(uuid, uuid[]) from public, anon;
grant execute on function public.set_added_procedures(uuid, uuid[]) to authenticated;

-- (c) Deshacer devuelve la marca (decisión del Director). Si se borra una fila de
--     visit_added_procedures con deferred_from_visit_id no nulo —porque se deshace/borra la
--     continuación (cascade de vap_visita_fk) o porque set_added_procedures quita un diferido—, el
--     procedimiento vuelve a la visita de origen MARCADO para otro día, no libre: «deshacer» es «no
--     se retomó», no «se olvidó». Cadena V3 → C1 → C2: deshacer C2 devuelve la marca a C1 (no a V3:
--     old.visit_id es C1, y old.deferred_from_visit_id apunta al padre inmediato).
-- SECURITY DEFINER a propósito (no es una guarda que mire current_user: el gotcha del trigger-guarda
-- no aplica): escribe visit_pending_procedures, que authenticated no puede escribir directo.
create or replace function public.devolver_marca_al_deshacer()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $fn$
begin
  if old.deferred_from_visit_id is null then
    return old; -- lo agregado a mano no tiene adónde volver.
  end if;
  -- El origen puede haberse ido en la MISMA sentencia (delete_patient, close_enrollment lo borran
  -- junto con esta fila, por cascade): un insert contra un origen que ya no existe rompería el
  -- borrado entero por la FK. Y no se marca lo que el origen ya tiene tildado (no se puede marcar
  -- lo hecho).
  if exists (select 1 from public.patient_visits where id = old.deferred_from_visit_id)
     and not exists (select 1 from public.visit_procedure_completions c
                     where c.visit_id = old.deferred_from_visit_id and c.procedure_id = old.procedure_id)
  then
    -- auth.uid() es nulo desde el editor de Supabase o un borrado del sistema; marked_by es not null.
    insert into public.visit_pending_procedures (visit_id, procedure_id, marked_by)
    values (old.deferred_from_visit_id, old.procedure_id, coalesce(auth.uid(), old.added_by))
    on conflict on constraint vpp_visita_procedimiento_unico do nothing;
  end if;
  return old;
end $fn$;
drop trigger if exists trg_devolver_marca on public.visit_added_procedures;
create trigger trg_devolver_marca after delete on public.visit_added_procedures
  for each row execute function public.devolver_marca_al_deshacer();
-- Una función trigger no necesita grant a authenticated.
revoke all on function public.devolver_marca_al_deshacer() from public, anon;


-- 7 · El retest cuelga de una visita --------------------------------------------------------------
-- Un dato, una casilla: el origen del retest es de la VISITA, no de cada procedimiento (la
-- continuación, en cambio, deriva su origen de las filas de visit_added_procedures, como en la 0144).
-- ON DELETE SET NULL, por lo mismo que vap_origen_fk (0144): los borrados del SISTEMA (delete_patient,
-- close_enrollment, delete_visit_definition, sync_protocol_schedule) no se traban. La APP no puede
-- borrar una visita de la que cuelga un retest: lo ataja guard_borrar_visita (sección 9).
-- Los retests que ya existen quedan con el origen en nulo: no se les inventa uno.
-- Postgres no tiene `add constraint if not exists`: el `do` lo hace idempotente.
alter table public.patient_visits add column if not exists retest_of_visit_id uuid;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'pv_retest_de_fk') then
    alter table public.patient_visits add constraint pv_retest_de_fk
      foreign key (retest_of_visit_id) references public.patient_visits(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pv_retest_de_solo_retest') then
    alter table public.patient_visits add constraint pv_retest_de_solo_retest
      check (retest_of_visit_id is null or kind = 'retest');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pv_retest_de_distinto') then
    alter table public.patient_visits add constraint pv_retest_de_distinto
      check (retest_of_visit_id is distinct from id);
  end if;
end $mig$;
create index if not exists ix_pv_retest_de on public.patient_visits (retest_of_visit_id)
  where retest_of_visit_id is not null;
comment on column public.patient_visits.retest_of_visit_id is
  'La visita que este retest repite. Nulo en todo lo que no es retest y en los retests anteriores a la 0145.';

-- Si de esta visita cuelga algún retest. Va acá y no en la sección 2: un `language sql` valida las
-- columnas al crearse, y la columna recién existe desde la línea de arriba.
create or replace function public.visita_tiene_retests(p_visit_id uuid)
returns boolean language sql security definer stable set search_path = pg_catalog, public as $fn$
  select exists (select 1 from public.patient_visits r where r.retest_of_visit_id = p_visit_id);
$fn$;
revoke all on function public.visita_tiene_retests(uuid) from public, anon;
grant execute on function public.visita_tiene_retests(uuid) to authenticated;


-- 8 · register_visit_event: el retest recibe su visita de origen -----------------------------------
-- Cuerpo de la 0144 con tres cambios (señalados): un sexto parámetro con default, la validación del
-- origen, y el insert que lo guarda. La firma cambia, así que va el DROP de la de cinco: sin él queda
-- una sobrecarga viva y la llamada del front viejo resolvería a la vieja en silencio. El front viejo
-- llama con cinco parámetros POR NOMBRE, que la nueva acepta (el sexto tiene default).
-- Sin origen, el retest se sigue aceptando como antes: compatibilidad con el front desplegado y con
-- los retests viejos. Que el retest SIEMPRE cuelgue de una visita lo asegura el front nuevo.
drop function if exists public.register_visit_event(uuid, visit_kind, date, text, uuid[]);
create or replace function public.register_visit_event(
  p_enrollment_id uuid, p_kind visit_kind, p_date date, p_notes text default null,
  p_procedure_ids uuid[] default '{}',
  p_retest_of uuid default null                                                        -- 0145
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_uid uuid := auth.uid();
  v_protocol uuid; v_rando date; v_visit uuid;
  v_has_firma boolean; v_has_screening boolean;
  v_procs uuid[] := coalesce(array(select distinct t.x from unnest(p_procedure_ids) as t(x) where t.x is not null), '{}');
begin
  if v_uid is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if p_kind = 'programada' then raise exception 'Las visitas programadas no se crean por acá' using errcode = 'check_violation'; end if;
  if p_date is null then raise exception 'La fecha es obligatoria' using errcode = '23502'; end if;

  select e.protocol_id, e.randomization_date into v_protocol, v_rando
    from public.enrollments e where e.id = p_enrollment_id;
  if v_protocol is null then raise exception 'Enrolamiento inexistente' using errcode = '23503'; end if;

  if not public.puede_registrar_visitas(v_protocol) then
    raise exception 'No tenés permiso para registrar visitas de este paciente' using errcode = '42501';
  end if;

  if cardinality(v_procs) > 0 and p_kind not in ('vnp', 'retest') then
    raise exception 'Solo el retest y la VNP llevan procedimientos propios' using errcode = 'check_violation';
  end if;
  -- Un retest vacío SIN ORIGEN se acepta (compat, ver la 0144). Con origen lo manda el front nuevo, y
  -- ahí sí se exige al menos uno (abajo).
  if exists (select 1 from unnest(v_procs) as t(x)
             where not exists (select 1 from public.protocol_procedures pp
                               where pp.protocol_id = v_protocol and pp.procedure_id = t.x)) then
    raise exception 'Ese procedimiento no es de este estudio' using errcode = 'check_violation';
  end if;

  -- 0145 · El origen del retest: de la misma inscripción, ya atendido, y sólo lo que se hizo ahí
  -- (procedimiento_hecho: tildado, o sin reporte con la visita atendida).
  if p_retest_of is not null then
    -- Lock compartido del origen: que no cambie (fecha real, tilde) entre validar y el insert de abajo.
    perform 1 from public.patient_visits o where o.id = p_retest_of for share;
    if p_kind <> 'retest' then
      raise exception 'Solo un retest repite una visita' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.patient_visits o
                   where o.id = p_retest_of and o.enrollment_id = p_enrollment_id) then
      raise exception 'Esa visita no es de este paciente en este estudio' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.patient_visits o
                   where o.id = p_retest_of and o.real_date is not null) then
      raise exception 'Solo se repite una visita que ya se atendió' using errcode = 'check_violation';
    end if;
    if cardinality(v_procs) = 0 then
      raise exception 'Elegí al menos un procedimiento para el retest' using errcode = 'check_violation';
    end if;
    if exists (select 1 from unnest(v_procs) as t(x)
               where not public.procedimiento_hecho(p_retest_of, t.x)) then
      raise exception 'Solo se repiten los procedimientos que se hicieron en esa visita' using errcode = 'check_violation';
    end if;
  end if;

  -- Cutover de la 0030: con cuadro, firma/screening/randomización se agendan desde el cuadro.
  if p_kind in ('firma','screening','firma_screening','randomizacion')
     and exists (select 1 from public.visit_definitions vd
                 where vd.protocol_id = v_protocol and vd.role <> 'comun') then
    raise exception 'Este protocolo usa el cronograma: agendá screening/randomización desde el cuadro' using errcode = 'check_violation';
  end if;

  if v_rando is not null then
    if p_kind not in ('vnp','retest') then
      raise exception 'Después de la randomización solo se registran VNP o Retest' using errcode = 'check_violation';
    end if;
  else
    if p_kind in ('firma','screening','firma_screening','randomizacion')
       and exists (select 1 from public.patient_visits where enrollment_id = p_enrollment_id and kind = p_kind) then
      raise exception 'Esa visita ya está registrada' using errcode = 'check_violation';
    end if;
    if p_kind in ('firma','screening')
       and exists (select 1 from public.patient_visits where enrollment_id = p_enrollment_id and kind = 'firma_screening') then
      raise exception 'Ya hay una visita de Firma y Screening' using errcode = 'check_violation';
    end if;
    if p_kind = 'firma_screening'
       and exists (select 1 from public.patient_visits where enrollment_id = p_enrollment_id and kind in ('firma','screening')) then
      raise exception 'Ya hay Firma o Screening por separado' using errcode = 'check_violation';
    end if;
    if p_kind = 'randomizacion' then
      select exists (select 1 from public.patient_visits where enrollment_id = p_enrollment_id and kind in ('firma','firma_screening')),
             exists (select 1 from public.patient_visits where enrollment_id = p_enrollment_id and kind in ('screening','firma_screening'))
        into v_has_firma, v_has_screening;
      if not (v_has_firma and v_has_screening) then
        raise exception 'Para randomizar tiene que haber firma y screening previos' using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- La suelta nace AGENDADA (estimated_date), no atendida — modelo 0025.
  insert into public.patient_visits (enrollment_id, kind, estimated_date, notes, retest_of_visit_id)   -- 0145
  values (p_enrollment_id, p_kind, p_date, nullif(btrim(coalesce(p_notes, '')), ''), p_retest_of)
  returning id into v_visit;

  insert into public.visit_added_procedures (visit_id, procedure_id, added_by)
  select v_visit, t.x, v_uid from unnest(v_procs) as t(x);

  -- Anclaje legacy (sólo protocolos SIN cuadro: el cutover de arriba bloquea este kind si hay cuadro).
  if p_kind = 'randomizacion' then
    update public.enrollments set randomization_date = p_date where id = p_enrollment_id;
  end if;

  return v_visit;
end $fn$;
revoke all on function public.register_visit_event(uuid, visit_kind, date, text, uuid[], uuid) from public, anon;
grant execute on function public.register_visit_event(uuid, visit_kind, date, text, uuid[], uuid) to authenticated;


-- 9 · Lo que la app no borra, y el origen del retest en v_track_visits ------------------------------
-- guard_borrar_visita (0144) suma: la app no borra una visita de la que cuelga un retest. postgres
-- (el SISTEMA) sigue pasando primero, y pv_retest_de_fk (SET NULL) le deja al retest lo suyo.
create or replace function public.guard_borrar_visita()
returns trigger language plpgsql set search_path = pg_catalog, public as $fn$
begin
  if current_user = 'postgres' then return old; end if;
  if public.visita_paso_procedimientos(old.id) then
    raise exception 'Esta visita pasó procedimientos a otra. Deshacé primero esa continuación.' using errcode = 'check_violation';
  end if;
  if public.visita_tiene_retests(old.id) then                                             -- 0145
    raise exception 'Esta visita tiene un retest. Borralo primero.' using errcode = 'check_violation';
  end if;
  if old.visit_def_id is null and public.visita_tiene_realizados(old.id) then
    raise exception 'Esta visita ya tiene procedimientos marcados como realizados. Desmarcalos antes de borrarla.' using errcode = 'check_violation';
  end if;
  return old;
end $fn$;
create or replace view public.v_track_visits with (security_invoker = true) as
select
  v.id, v.enrollment_id, v.visit_def_id, v.estimated_date, v.real_date,
  v.window_start, v.window_end, v.notes, v.computed_status,
  vd.code as visit_code, vd.name as visit_name,
  coalesce(vd.visit_type, 'presencial') as visit_type, vd.sort_order,
  e.protocol_id, e.patient_id, e.status as enrollment_status,
  e.randomization_date as enrollment_randomization_date,
  pr.code as protocol_code, pr.name as protocol_name,
  coalesce(e.ivrs_code, pa.code) as patient_code, pa.full_name as patient_name,
  pa.sex, pa.birth_date,
  pa.fertility,
  vd.offset_days, e.enrollment_date,
  coalesce(v.treating_physician, pa.treating_physician) as treating_physician,
  v.coordinator_id, v.coordinator_name,
  v.kind,
  v.arrived_at, v.ready_at, v.left_at, v.no_show_at,
  v.attended_at,
  v.wants_doctor,
  v.doctor_seen_at,
  v.doctor_motivo,
  v.wants_doctor_at, v.doctor_marked_by,
  coalesce(vd.dispenses, false) as dispenses,
  coalesce(vd.dispenses_ip, false) as dispenses_ip,
  v.operational_stage,
  vd.role, vd.date_mode,
  (select count(*) from public.visit_comments vc where vc.visit_id = v.id) as comments_count,
  -- 0144: al final para no alterar el orden anterior.
  ori.visit_id as origin_visit_id,
  ovd.code     as origin_code,
  ovd.name     as origin_name,
  opv.kind     as origin_kind,
  -- 0145: el origen del retest, al final para no alterar el orden anterior.
  self.retest_of_visit_id as retest_of_visit_id,
  rvd.code     as retest_of_code,
  rvd.name     as retest_of_name,
  rpv.kind     as retest_of_kind
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id
left join lateral (
  select a.deferred_from_visit_id as visit_id
  from public.visit_added_procedures a
  where a.visit_id = v.id and a.deferred_from_visit_id is not null
  order by a.added_at
  limit 1
) ori on true
left join public.patient_visits opv    on opv.id = ori.visit_id
left join public.visit_definitions ovd on ovd.id = opv.visit_def_id
-- v_patient_visits no trae retest_of_visit_id (su lista de columnas quedó fija en la 0144): se lee de
-- la tabla por el id.
left join public.patient_visits self    on self.id = v.id
left join public.patient_visits rpv     on rpv.id = self.retest_of_visit_id
left join public.visit_definitions rvd on rvd.id = rpv.visit_def_id;

comment on view public.v_track_visits is
  'Visitas de Coordinación. patient_code = IVRS de la inscripción (0126). 0144: origin_* (continuación). 0145: retest_of_* (la visita que repite un retest), al final.';
