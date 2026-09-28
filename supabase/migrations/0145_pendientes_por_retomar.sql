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
