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
-- andando: el quinto tiene default, y un retest sin procedimientos se sigue aceptando (la regla
-- «al menos uno» la pone el front nuevo). El front nuevo (PR B) NO anda sin esta migración.
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
--   · vap_origen_fk, SET NULL: los borrados del SISTEMA no se traban. delete_patient (0024) se lleva
--     en cascada la inscripción con el origen y la continuación juntos; close_enrollment (0127),
--     delete_visit_definition (0026) y sync_protocol_schedule (0029) borran visitas programadas
--     pendientes, y una de ésas puede haber pasado procedimientos a otra. Con RESTRICT, cualquiera de
--     las cuatro reventaba. Con SET NULL, si el sistema borra el origen, la continuación se queda con
--     lo suyo como propio (figura como 'agregado'): no queda nadie a quien devolvérselo.
--     La APP, en cambio, no puede borrar una visita que pasó procedimientos a otra: lo ataja la guarda
--     de la sección 10. En una cadena V3 → C1 → C2, borrar C1 dejaría el procedimiento pendiente en dos
--     visitas a la vez: la V3 lo recuperaría (ya nadie lo trae de ella) y C2 lo seguiría teniendo.
-- Las constraints van NOMBRADAS: el front embebe la visita destino por `vap_visita_fk` (con dos FK a
-- la misma tabla, el embed sin nombre es ambiguo).
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
  constraint vap_origen_fk         foreign key (deferred_from_visit_id) references public.patient_visits(id) on delete set null,
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


-- 2 · Cuatro preguntas que se hacen las RPC y las guardas ------------------------------------------
-- SECURITY DEFINER las cuatro: responden igual para cualquiera que pregunte, sin depender de qué
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

-- Si la visita pasó algún procedimiento a otra.
create or replace function public.visita_paso_procedimientos(p_visit_id uuid)
returns boolean language sql security definer stable set search_path = pg_catalog, public as $fn$
  select exists (select 1 from public.visit_added_procedures a where a.deferred_from_visit_id = p_visit_id);
$fn$;

-- `from public, anon`: Supabase le da EXECUTE a anon explícitamente en cada función nueva, así que
-- sacárselo a public no alcanza.
revoke all on function public.puede_registrar_visitas(uuid) from public, anon;
revoke all on function public.procedimiento_diferido(uuid, uuid) from public, anon;
revoke all on function public.visita_tiene_realizados(uuid) from public, anon;
revoke all on function public.visita_paso_procedimientos(uuid) from public, anon;
grant execute on function public.puede_registrar_visitas(uuid) to authenticated;
grant execute on function public.procedimiento_diferido(uuid, uuid) to authenticated;
grant execute on function public.visita_tiene_realizados(uuid) to authenticated;
grant execute on function public.visita_paso_procedimientos(uuid) to authenticated;


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
--
-- POR QUÉ LA LISTA DE COLUMNAS SE ARMA SOLA. La 0143 (ya aplicada) sumó arrived_by, ready_by y
-- left_by a patient_visits SIN recrear esta vista. Postgres guarda el `*` expandido al crear la
-- vista, así que la viva sigue con las columnas de la 0137; un `pv.*` escrito hoy metería las tres
-- nuevas ANTES de computed_status, y `create or replace` no deja correr ni renombrar columnas:
-- 42P16 «cannot change name of view column». En el editor de Supabase, sin transacción que abarque
-- el archivo, eso deja la migración a medias: la tabla y v_visit_procedures creadas, las vistas sin
-- recablear. Por eso la lista sale de la vista TAL COMO ESTÁ AHORA (pg_attribute), en su orden, y
-- el cuerpo se arma con format(). Es idempotente: volver a correrlo lee la vista ya recreada.
-- NINGUNA migración futura debería volver a escribir `pv.*` en esta vista: o repite este bloque, o
-- lista las columnas a mano. Sumar las de la 0143 es un cambio aparte, AL FINAL, cuando alguien
-- las necesite.
do $mig$
declare
  v_columnas text;
begin
  select string_agg('pv.' || quote_ident(a.attname), ', ' order by a.attnum)
    into v_columnas
  from pg_attribute a
  where a.attrelid = 'public.v_patient_visits'::regclass
    and a.attnum > 0 and not a.attisdropped
    and a.attname not in ('computed_status', 'operational_stage');

  execute format($vista$
create or replace view public.v_patient_visits with (security_invoker = true) as
select
  %s,
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
from public.patient_visits pv
$vista$, v_columnas);
end $mig$;

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
  pv.coordinator_name,
  -- 0144: al final para no alterar el orden anterior. Nombra la visita cuando no tiene definición.
  pv.kind            as visit_kind
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
  'Reportes vencidos. 0144: los procedimientos salen de v_visit_procedures (lista efectiva) y suma visit_kind al final. patient_code = IVRS de la inscripción (0126).';

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


-- 7 · register_visit_event: procedimientos propios, y el retest en cualquier etapa ------------------
-- Cuerpo de la 0030 con tres cambios: (a) la authz sale de puede_registrar_visitas (misma regla);
-- (b) se va el «Retest es solo post-randomización» — el retest de screening es el más común;
-- (c) recibe p_procedure_ids y los guarda en visit_added_procedures.
-- La firma cambia, así que va el DROP de la vieja: `create or replace` con un parámetro más deja
-- una sobrecarga viva, y la llamada de cuatro argumentos resolvería a la vieja en silencio. El
-- quinto parámetro tiene default: el front viejo, que manda cuatro, sigue andando con la nueva.
drop function if exists public.register_visit_event(uuid, visit_kind, date, text);
create or replace function public.register_visit_event(
  p_enrollment_id uuid, p_kind visit_kind, p_date date, p_notes text default null,
  p_procedure_ids uuid[] default '{}'
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
  -- Un retest vacío SE ACEPTA acá, a propósito. El front desplegado llama con cuatro parámetros y
  -- no manda procedimientos: exigirlos rompería el alta de retests entre esta migración y el front
  -- nuevo, y los retests legacy no tienen ninguno. La regla «al menos uno» la pone el front nuevo al
  -- crear; set_added_procedures sí la exige, porque sólo la llama el front nuevo.
  if exists (select 1 from unnest(v_procs) as t(x)
             where not exists (select 1 from public.protocol_procedures pp
                               where pp.protocol_id = v_protocol and pp.procedure_id = t.x)) then
    raise exception 'Ese procedimiento no es de este estudio' using errcode = 'check_violation';
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
  insert into public.patient_visits (enrollment_id, kind, estimated_date, notes)
  values (p_enrollment_id, p_kind, p_date, nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_visit;

  insert into public.visit_added_procedures (visit_id, procedure_id, added_by)
  select v_visit, t.x, v_uid from unnest(v_procs) as t(x);

  -- Anclaje legacy (sólo protocolos SIN cuadro: el cutover de arriba bloquea este kind si hay cuadro).
  if p_kind = 'randomizacion' then
    update public.enrollments set randomization_date = p_date where id = p_enrollment_id;
  end if;

  return v_visit;
end $fn$;
revoke all on function public.register_visit_event(uuid, visit_kind, date, text, uuid[]) from public, anon;
grant execute on function public.register_visit_event(uuid, visit_kind, date, text, uuid[]) to authenticated;


-- 8 · diferir_procedimientos: pasar lo pendiente de una visita a una continuación ------------------
-- Crea la continuación (una VNP con fecha propia) y sus filas en una sola transacción. Sólo acepta
-- lo que la visita todavía DEBE (su lista efectiva) y NO hizo: lo hecho ya tiene su reporte en
-- marcha, y lo que no lleva no tiene nada que pasar.
create or replace function public.diferir_procedimientos(
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
    raise exception 'Elegí qué procedimientos pasan a otro día' using errcode = 'check_violation';
  end if;

  -- El lock serializa dos «pasar a otro día» simultáneos sobre la misma visita: sin él, los dos
  -- verían el procedimiento pendiente y lo mandarían a dos continuaciones distintas.
  select pv.enrollment_id, e.protocol_id into v_enrollment, v_protocol
  from public.patient_visits pv
  join public.enrollments e on e.id = pv.enrollment_id
  where pv.id = p_visita_origen
  for update of pv;
  if v_enrollment is null then raise exception 'Esa visita ya no existe' using errcode = '23503'; end if;
  if not public.puede_registrar_visitas(v_protocol) then
    raise exception 'No tenés permiso para cambiar las visitas de este paciente' using errcode = '42501';
  end if;

  if exists (
    select 1 from unnest(v_procs) as t(x)
    where not exists (select 1 from public.v_visit_procedures vp
                      where vp.visit_id = p_visita_origen and vp.procedure_id = t.x)
       or exists (select 1 from public.visit_procedure_completions c
                  where c.visit_id = p_visita_origen and c.procedure_id = t.x)
  ) then
    raise exception 'Solo se pasan a otro día los procedimientos que esta visita todavía no hizo' using errcode = 'check_violation';
  end if;

  insert into public.patient_visits (enrollment_id, kind, estimated_date)
  values (v_enrollment, 'vnp', p_fecha)
  returning id into v_visit;

  insert into public.visit_added_procedures (visit_id, procedure_id, deferred_from_visit_id, added_by)
  select v_visit, t.x, p_visita_origen, v_uid from unnest(v_procs) as t(x);

  return v_visit;
end $fn$;
revoke all on function public.diferir_procedimientos(uuid, uuid[], date) from public, anon;
grant execute on function public.diferir_procedimientos(uuid, uuid[], date) to authenticated;


-- 9 · set_added_procedures: editar lo agregado a mano de un retest o una VNP ------------------------
-- Reemplaza la lista de un retest o una VNP (sin cronograma). Quitar un procedimiento que vino de
-- otra visita es devolvérselo (se borra la fila). Lo que ESTA visita ya pasó a otra no está en su
-- lista efectiva, así que la pantalla no lo manda: se conserva, porque borrarlo lo dejaría pendiente
-- en dos visitas a la vez. Lo agregado acá nunca trae origen: una continuación no junta dos.
-- Un protocolo LEGACY (sin cuadro) tiene firma/screening/firma_screening/randomización sueltas
-- (visit_def_id null, igual que un retest o una VNP): sin este chequeo de v_kind, esta RPC les
-- dejaba enchufar procedimientos que register_visit_event nunca les permitiría poner al crearlas.
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
  if exists (select 1 from unnest(v_procs) as t(x)
             where not exists (select 1 from public.protocol_procedures pp
                               where pp.protocol_id = v_protocol and pp.procedure_id = t.x)) then
    raise exception 'Ese procedimiento no es de este estudio' using errcode = 'check_violation';
  end if;

  delete from public.visit_added_procedures a
  where a.visit_id = p_visit_id
    and not (a.procedure_id = any (v_procs))
    and not public.procedimiento_diferido(p_visit_id, a.procedure_id);

  insert into public.visit_added_procedures (visit_id, procedure_id, added_by)
  select p_visit_id, t.x, v_uid from unnest(v_procs) as t(x)
  on conflict on constraint vap_visita_procedimiento_unico do nothing;

  if v_kind = 'retest' and not exists (select 1 from public.visit_added_procedures a where a.visit_id = p_visit_id) then
    raise exception 'Un retest lleva al menos un procedimiento' using errcode = 'check_violation';
  end if;
end $fn$;
revoke all on function public.set_added_procedures(uuid, uuid[]) from public, anon;
grant execute on function public.set_added_procedures(uuid, uuid[]) to authenticated;


-- 10 · Guardas --------------------------------------------------------------------------------------
-- NO son security definer: con definer, current_user sería siempre el dueño y la excepción de
-- postgres de la segunda dejaría pasar a todos. Las preguntas las hacen las funciones de la
-- sección 2, que sí son definer, así no dependen de la RLS de quien escribe.

-- (a) Lo que una visita pasó a otra no se tilda en ella. El tilde es un insert directo desde el
--     front (toggleVisitProcedure), así que la regla tiene que vivir en la base.
create or replace function public.guard_tildar_diferido()
returns trigger language plpgsql set search_path = pg_catalog, public as $fn$
begin
  if public.procedimiento_diferido(new.visit_id, new.procedure_id) then
    raise exception 'Ese procedimiento pasó a otra visita: se marca allá' using errcode = 'check_violation';
  end if;
  return new;
end $fn$;
drop trigger if exists trg_guard_tildar_diferido on public.visit_procedure_completions;
create trigger trg_guard_tildar_diferido before insert
  on public.visit_procedure_completions for each row execute function public.guard_tildar_diferido();

-- (b) Lo que la APP no borra de patient_visits:
--     · una visita que pasó procedimientos a otra: en una cadena V3 → C1 → C2, borrar C1 dejaría el
--       procedimiento pendiente en dos visitas (ver sección 1). Primero se deshace la continuación.
--     · una visita suelta con procedimientos hechos: el cascade se llevaría los tildes y sus
--       reportes sin que nadie lo decida.
--     postgres pasa, y la pregunta va PRIMERO, antes de leer nada: postgres es el SISTEMA — las RPC
--     definer de las que es dueño (delete_patient, close_enrollment, delete_visit_definition,
--     sync_protocol_schedule) y las limpiezas a mano desde el editor. Ésos borran el origen a
--     sabiendas, y vap_origen_fk (SET NULL) le deja a la continuación lo suyo.
--     Antes se llamaba guard_borrar_suelta_con_realizados / trg_guard_borrar_suelta: el nombre dejó de
--     decir lo que hace. Se borran los dos nombres viejos, por si una corrida anterior los dejó.
drop trigger if exists trg_guard_borrar_suelta on public.patient_visits;
drop function if exists public.guard_borrar_suelta_con_realizados();
create or replace function public.guard_borrar_visita()
returns trigger language plpgsql set search_path = pg_catalog, public as $fn$
begin
  if current_user = 'postgres' then return old; end if;
  if public.visita_paso_procedimientos(old.id) then
    raise exception 'Esta visita pasó procedimientos a otra. Deshacé primero esa continuación.' using errcode = 'check_violation';
  end if;
  if old.visit_def_id is null and public.visita_tiene_realizados(old.id) then
    raise exception 'Esta visita ya tiene procedimientos marcados como realizados. Desmarcalos antes de borrarla.' using errcode = 'check_violation';
  end if;
  return old;
end $fn$;
drop trigger if exists trg_guard_borrar_visita on public.patient_visits;
create trigger trg_guard_borrar_visita before delete
  on public.patient_visits for each row execute function public.guard_borrar_visita();


-- 11 · Recarga de PostgREST y sondas ----------------------------------------------------------------
notify pgrst, 'reload schema';

-- Sonda 1: las cinco vistas corren con los permisos de QUIEN CONSULTA. Las cinco tienen que decir
-- {security_invoker=true}; una sin eso saltea la RLS por estudio en silencio.
select c.relname, c.reloptions
from pg_class c
where c.oid in ('public.v_visit_procedures'::regclass, 'public.v_patient_visits'::regclass,
                'public.v_track_visits'::regclass, 'public.v_procedure_report_alerts'::regclass,
                'public.v_protocol_report_status'::regclass)
order by 1;

-- Sonda 2: ninguna vista calcula «qué debe la visita» por el camino viejo. Tiene que devolver UNA
-- sola fila, v_visit_procedures. Si aparece otra, es una vista que sigue leyendo el cronograma
-- directo: avisar antes de desplegar el front.
select viewname from pg_views
where schemaname = 'public' and definition ilike '%protocol_activities%'
order by 1;

-- Sonda 3: register_visit_event quedó con UNA sola firma (la de cinco parámetros). Tiene que dar 1.
select count(*) as firmas from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'register_visit_event';

-- Sonda 4: la guarda de borrado deja pasar al SISTEMA porque corre como postgres: las cascadas corren
-- con el dueño de patient_visits, y las RPC que borran visitas son SECURITY DEFINER de postgres. Las
-- cinco filas tienen que decir `postgres`; si alguna no, esa RPC va a chocar con la guarda y avisarlo.
select 'patient_visits (tabla)' as objeto, tableowner::text as dueno
from pg_tables where schemaname = 'public' and tablename = 'patient_visits'
union all
select p.proname::text, p.proowner::regrole::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('delete_patient', 'close_enrollment', 'delete_visit_definition', 'sync_protocol_schedule')
order by 1;
