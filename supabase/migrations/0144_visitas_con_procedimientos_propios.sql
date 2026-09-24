-- Spira · Migración 0144 — Visitas con procedimientos propios: retest, VNP y continuación
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-09-23-visitas-retest-y-continuacion-design.md
-- Plan: docs/superpowers/plans/2026-09-23-visitas-retest-y-continuacion.md
--
-- QUÉ RESUELVE. Un retest o una VNP no podían llevar procedimientos: todo lo que calcula «qué debe
-- esta visita» salía del cronograma (protocol_activities por visit_def_id) y una visita suelta no
-- tiene definición. Y no había forma de desdoblar una visita: si la V3 se cortaba, lo pendiente no
-- tenía adónde ir.
--
-- CÓMO. Una tabla con lo que una visita lleva ADEMÁS de su cronograma, y de qué visita vino
-- (visit_added_procedures). Una vista con la LISTA EFECTIVA de cada visita (v_visit_procedures):
-- el cronograma, menos lo que esta visita pasó a otra, más lo agregado. Las cuatro vistas que
-- calculaban lo que una visita debe pasan a leer de ahí, sin cambiar sus columnas; dos suman
-- columnas AL FINAL. Así el retest hereda reportes, vencimientos y cierre sin reglas nuevas.
--
-- POR QUÉ DIFERIR SACA Y NO SÓLO ANOTA. Desde la 0137 una visita queda «Realizada» mientras tenga
-- un reporte sin evolucionar. Si la V3 siguiera debiendo el laboratorio que pasó a otro día, ese
-- reporte quedaría pendiente para siempre y la V3 no cerraría nunca.
--
-- ORDEN DE DESPLIEGUE: ADITIVA, va PRIMERO. El front viejo lee las vistas con select('*') (las
-- columnas nuevas le sobran) y llama a register_visit_event con cuatro parámetros, que siguen
-- andando: el quinto tiene default. El front nuevo (PR B) NO anda sin esta migración.
--
-- APLICAR a mano en el SQL Editor de Supabase, después de la 0143. IDEMPOTENTE: si algo corta a
-- la mitad, se vuelve a correr el archivo entero. Las sondas del final se MIRAN, no alcanza con el
-- "Success". Registrar en supabase/README.md al confirmarse en prod.
--
-- Probada con PGlite sobre un esquema de juguete, contra las versiones vivas de las vistas.
-- ============================================================================

-- 1 · La tabla: lo que una visita lleva ADEMÁS de su cronograma -----------------------------------
-- Para una visita suelta (retest, VNP), que no tiene cronograma, es todo lo que lleva.
-- `deferred_from_visit_id` = la visita de la que vino: nulo si se agregó a mano.
--
-- LAS DOS FK A patient_visits TIRAN PARA LADOS OPUESTOS, y a propósito:
--   · vap_visita_fk, CASCADE: borrar la continuación borra sus filas, y con eso lo diferido vuelve a
--     figurar pendiente en la visita de origen. Nadie tiene que acordarse de devolverlo.
--   · vap_origen_fk, RESTRICT: en una cadena V3 → C1 → C2, borrar C1 dejaría a C2 con un origen
--     que no existe mientras la V3 recupera el procedimiento: el mismo procedimiento pendiente en
--     dos visitas. No se borra una visita que pasó cosas a otra mientras la otra exista.
-- Las constraints van NOMBRADAS: el front reconoce el bloqueo por `vap_origen_fk` y embebe la
-- visita destino por `vap_visita_fk` (con dos FK a la misma tabla, el embed sin nombre es ambiguo).
-- `id` es la clave aunque la unicidad sea (visita, procedimiento): audit_row() resuelve `old.id`
-- al planificar (0003, pasó con la 0111).
create table if not exists public.visit_added_procedures (
  id                     uuid primary key default gen_random_uuid(),
  visit_id               uuid not null,
  procedure_id           uuid not null,
  deferred_from_visit_id uuid,
  added_by               uuid not null default auth.uid() references public.users(id),
  added_at               timestamptz not null default now(),
  constraint vap_visita_fk         foreign key (visit_id)               references public.patient_visits(id) on delete cascade,
  constraint vap_origen_fk         foreign key (deferred_from_visit_id) references public.patient_visits(id) on delete restrict,
  constraint vap_procedimiento_fk  foreign key (procedure_id)           references public.procedures(id)     on delete restrict,
  constraint vap_visita_procedimiento_unico unique (visit_id, procedure_id),
  constraint vap_origen_distinto   check (deferred_from_visit_id is distinct from visit_id)
);
create index if not exists ix_vap_origen on public.visit_added_procedures (deferred_from_visit_id)
  where deferred_from_visit_id is not null;
comment on table public.visit_added_procedures is
  'Procedimientos que una visita lleva además de su cronograma, y de qué visita vinieron (continuación). Se escribe sólo por RPC. 0144.';

-- RLS: se ve si se ve la visita. El subselect corre con la RLS de patient_visits de quien consulta,
-- así que el alcance es exactamente el de la visita, sin copiar su regla.
alter table public.visit_added_procedures enable row level security;
drop policy if exists "ver procedimientos agregados" on public.visit_added_procedures;
create policy "ver procedimientos agregados" on public.visit_added_procedures for select using (
  exists (select 1 from public.patient_visits pv where pv.id = visit_added_procedures.visit_id));
revoke all on public.visit_added_procedures from anon;
revoke insert, update, delete, truncate, references, trigger on public.visit_added_procedures from authenticated;
grant select on public.visit_added_procedures to authenticated;

drop trigger if exists trg_audit_vap on public.visit_added_procedures;
create trigger trg_audit_vap after insert or update or delete
  on public.visit_added_procedures for each row execute function public.audit_row();


-- 2 · Tres preguntas que se hacen las RPC y las guardas --------------------------------------------
-- SECURITY DEFINER las tres: responden igual para cualquiera que pregunte, sin depender de qué
-- filas le deja ver su RLS.

-- Quién puede agendar o cambiar visitas de un estudio. Es la regla de register_visit_event (0030),
-- sacada a una función para que las tres RPC de esta migración digan lo mismo.
create or replace function public.puede_registrar_visitas(p_protocol_id uuid)
returns boolean language sql security definer stable set search_path = pg_catalog, public as $fn$
  select public.has_module('gerencia') or public.has_min_role('track', 'admin')
      or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(p_protocol_id));
$fn$;

-- Si esta visita pasó ESTE procedimiento a otra.
create or replace function public.procedimiento_diferido(p_visit_id uuid, p_procedure_id uuid)
returns boolean language sql security definer stable set search_path = pg_catalog, public as $fn$
  select exists (select 1 from public.visit_added_procedures a
                 where a.deferred_from_visit_id = p_visit_id and a.procedure_id = p_procedure_id);
$fn$;

-- Si la visita tiene algún procedimiento marcado como realizado.
create or replace function public.visita_tiene_realizados(p_visit_id uuid)
returns boolean language sql security definer stable set search_path = pg_catalog, public as $fn$
  select exists (select 1 from public.visit_procedure_completions c where c.visit_id = p_visit_id);
$fn$;

revoke all on function public.puede_registrar_visitas(uuid) from public;
revoke all on function public.procedimiento_diferido(uuid, uuid) from public;
revoke all on function public.visita_tiene_realizados(uuid) from public;
grant execute on function public.puede_registrar_visitas(uuid) to authenticated;
grant execute on function public.procedimiento_diferido(uuid, uuid) to authenticated;
grant execute on function public.visita_tiene_realizados(uuid) to authenticated;


-- 3 · La LISTA EFECTIVA de cada visita -------------------------------------------------------------
-- Lo del cronograma que esta visita NO pasó a otra, más lo agregado que esta visita NO pasó a otra.
-- La segunda condición es la que hace andar la cadena V3 → C1 → C2: la fila de C1 que vino de la V3
-- sigue existiendo (así la V3 sigue sin deberlo), pero C1 tampoco lo debe porque lo pasó a C2.
-- Trae el nombre del procedimiento para que el front no tenga que embeber sobre una vista con
-- `union`, donde PostgREST no puede inferir la relación.
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
                  where d.deferred_from_visit_id = a.visit_id and d.procedure_id = a.procedure_id);

comment on view public.v_visit_procedures is
  'Lista efectiva de procedimientos de cada visita: cronograma − lo que pasó a otra visita + lo agregado. Única fuente de «qué debe esta visita». 0144.';
revoke all on public.v_visit_procedures from anon;
grant select on public.v_visit_procedures to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_visit_procedures from authenticated;


-- 4 · v_patient_visits: las ramas 5 y 6 leen la lista efectiva ---------------------------------
-- Copia de la 0137 salvo los dos `exists` de reportes, que pasan de
--     protocol_activities pa ... where pa.visit_def_id = pv.visit_def_id
-- a  v_visit_procedures vp ... where vp.visit_id = pv.id.
-- Efecto: la V3 deja de deber lo que pasó a otro día (y cierra), y un retest pasa a deber lo suyo.
-- Mismas columnas: `create or replace`, sin drop, y v_track_visits no se entera.
create or replace view public.v_patient_visits with (security_invoker = true) as
select
  pv.*,
  ( case
      -- 1 · En el centro hoy y sin cerrar la atención (anclado a la hora argentina, 0120).
      when pv.ready_at is null and pv.arrived_at is not null
       and (pv.arrived_at at time zone 'America/Argentina/Buenos_Aires')::date
         = (now()          at time zone 'America/Argentina/Buenos_Aires')::date
        then 'en_atencion'
      -- 2 · Ventana vencida. `current_date` es UTC: inconsistencia PREEXISTENTE (0004), sin tocar.
      when pv.real_date is null and current_date > pv.window_end then 'ventana_vencida'
      -- 3 · Faltó y todavía no tiene fecha nueva.
      when pv.real_date is null and pv.no_show_at is not null    then 'por_reprogramar'
      -- 4 · Pendiente.
      when pv.real_date is null                                  then 'proxima'
      -- 5 · Un reporte de un procedimiento hecho, en 'pendiente' y fuera de plazo.
      when exists (
        select 1
        from public.v_visit_procedures vp
        join public.enrollments e          on e.id  = pv.enrollment_id
        join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                          and pp.procedure_id = vp.procedure_id
        join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
        join public.visit_procedure_completions vpc
             on vpc.visit_id = pv.id and vpc.procedure_id = vp.procedure_id
        left join public.report_status rs
             on rs.visit_id = pv.id and rs.report_definition_id = rd.id
        where vp.visit_id = pv.id
          and rd.eta_hours is not null
          and coalesce(rs.stage, 'pendiente') = 'pendiente'
          and now() > vpc.completed_at + (rd.eta_hours * interval '1 hour')
      ) then 'item_vencido'
      -- 6 · Atendida con pendientes: un reporte sin evolucionar, o el IP abierto (0120).
      when exists (
        select 1
        from public.v_visit_procedures vp
        join public.enrollments e          on e.id  = pv.enrollment_id
        join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                          and pp.procedure_id = vp.procedure_id
        join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
        left join public.report_status rs
             on rs.visit_id = pv.id and rs.report_definition_id = rd.id
        where vp.visit_id = pv.id
          and coalesce(rs.stage, 'pendiente') <> 'evolucionado'
      ) or exists (
        select 1 from public.v_visit_ip_status s
        where s.visit_id = pv.id and s.sellada and s.abierto
      ) then 'realizada'
      else 'completa'
    end )::visit_status as computed_status,
  ( case
      when pv.ready_at   is not null then 'fin_atencion'
      when pv.real_date  is not null then 'inicio_atencion'
      when pv.arrived_at is not null then 'concurrio_al_centro'
      else 'por_llegar'
    end ) as operational_stage
from public.patient_visits pv;

comment on view public.v_patient_visits is
  'patient_visits + estado clínico + recorrido operativo. 0144: los reportes que la visita debe salen de v_visit_procedures (lista efectiva), no del cronograma. Resto como la 0137.';
revoke all on public.v_patient_visits from anon;
grant select on public.v_patient_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_patient_visits from authenticated;


-- 5 · Las dos vistas de reportes leen la lista efectiva ------------------------------------------
-- Copias de la 0126 con el mismo cambio de join. v_protocol_report_status suma `visit_kind` AL
-- FINAL: el tablero nombraba la visita por su definición, y un retest no tiene.
create or replace view public.v_procedure_report_alerts with (security_invoker = true) as
select
  pv.id              as visit_id,
  rd.id              as report_definition_id,
  vp.procedure_id,
  rd.name            as report_name,
  rd.platform,
  p.name             as procedure_name,
  rd.eta_hours,
  vpc.completed_at,
  (vpc.completed_at + (rd.eta_hours * interval '1 hour')) as report_due_at,
  e.protocol_id, e.patient_id,
  pr.code  as protocol_code, pr.name as protocol_name,
  coalesce(e.ivrs_code, pac.code) as patient_code,  pac.full_name as patient_name,
  vd.name  as visit_name,    vd.code as visit_code,
  coalesce(pv.treating_physician, pac.treating_physician) as treating_physician,
  pv.coordinator_id,
  pv.coordinator_name
from public.patient_visits pv
join public.enrollments e          on e.id  = pv.enrollment_id
join public.v_visit_procedures vp  on vp.visit_id = pv.id
join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                  and pp.procedure_id = vp.procedure_id
join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
join public.procedures p           on p.id  = vp.procedure_id
join public.protocols pr           on pr.id = e.protocol_id
join public.patients pac           on pac.id = e.patient_id
join public.visit_procedure_completions vpc
     on vpc.visit_id = pv.id and vpc.procedure_id = vp.procedure_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
left join public.report_status rs     on rs.visit_id = pv.id and rs.report_definition_id = rd.id
where rd.eta_hours is not null
  and coalesce(rs.stage, 'pendiente') = 'pendiente'
  and now() > vpc.completed_at + (rd.eta_hours * interval '1 hour');

comment on view public.v_procedure_report_alerts is
  'Reportes vencidos. 0144: los procedimientos salen de v_visit_procedures (lista efectiva). patient_code = IVRS de la inscripción (0126).';

create or replace view public.v_protocol_report_status with (security_invoker = true) as
select
  pv.id as visit_id,
  rd.id                as report_definition_id,
  rd.name              as report_name,
  rd.platform,
  rd.link,
  rd.eta_hours,
  rd.notes,
  rd.sort_order,
  vp.procedure_id,
  p.name               as procedure_name,
  p.code               as procedure_code,
  p.category           as procedure_category,
  vp.suggested_order   as procedure_order,
  vpc.completed_at,
  (vpc.id is not null)                                as completed,
  (pv.real_date is not null or vpc.id is not null)    as visita_iniciada,
  case when rd.eta_hours is null or vpc.completed_at is null then null
       else vpc.completed_at + (rd.eta_hours * interval '1 hour') end as due_at,
  coalesce(rs.stage, 'pendiente') as stage,
  rs.id                as report_status_id,
  rs.updated_at,
  rs.updated_by_name,
  e.protocol_id,
  e.patient_id,
  pv.visit_def_id,
  pr.code              as protocol_code,
  coalesce(e.ivrs_code, pac.code)             as patient_code,
  pac.full_name        as patient_name,
  vd.code              as visit_code,
  vd.name              as visit_name,
  vd.sort_order        as visit_sort_order,
  (select count(*) from public.report_status_history h where h.report_status_id = rs.id) as history_count,
  pv.coordinator_id,
  pv.coordinator_name,
  -- 0144: al final para no alterar el orden anterior. Nombra la visita cuando no tiene definición.
  pv.kind              as visit_kind
from public.patient_visits pv
join public.enrollments e             on e.id  = pv.enrollment_id
join public.v_visit_procedures vp     on vp.visit_id = pv.id
join public.protocol_procedures pp    on pp.protocol_id = e.protocol_id and pp.procedure_id = vp.procedure_id
join public.report_definitions rd     on rd.protocol_procedure_id = pp.id
join public.procedures p              on p.id  = vp.procedure_id
join public.protocols pr              on pr.id = e.protocol_id
join public.patients pac              on pac.id = e.patient_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
left join public.visit_procedure_completions vpc
       on vpc.visit_id = pv.id and vpc.procedure_id = vp.procedure_id
left join public.report_status rs     on rs.visit_id = pv.id and rs.report_definition_id = rd.id;

comment on view public.v_protocol_report_status is
  'Tablero «Reportes pendientes». 0144: los procedimientos salen de v_visit_procedures (lista efectiva) y suma visit_kind al final. patient_code = IVRS de la inscripción (0126).';


-- 6 · v_track_visits: la visita de origen de una continuación, al final --------------------------
-- Copia de la 0126 + cuatro columnas AL FINAL, para que el front arme «Continuación de V3» sin una
-- segunda consulta. Una continuación tiene un solo origen (set_added_procedures no agrega con
-- origen), así que el `limit 1` no elige entre dos.
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
  opv.kind     as origin_kind
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
left join public.visit_definitions ovd on ovd.id = opv.visit_def_id;

comment on view public.v_track_visits is
  'Visitas de Coordinación. patient_code = IVRS de la inscripción (0126). 0144: suma origin_* al final (la visita de la que viene una continuación).';
