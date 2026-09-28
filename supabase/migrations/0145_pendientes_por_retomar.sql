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
