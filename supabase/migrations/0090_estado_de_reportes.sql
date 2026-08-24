-- Spira · Migración 0090 — Track: estado de los reportes de una visita
-- ============================================================================
-- Fase 2 de "Cronograma · Procedimientos y Reportes" (docs/plan-cronograma-reportes.md).
-- La 0089 dejó DEFINIDO qué reportes genera cada procedimiento del estudio. Ésta agrega en qué
-- ANDA cada uno en una visita concreta: pendiente → descargado → evolucionado, con historial.
--
--   1. report_status: la etapa de un reporte en una visita.
--   2. report_status_history: el log de cambios, escrito por TRIGGER (nunca por el cliente).
--   3. set_report_stage: la única puerta de escritura (SECURITY DEFINER, authz server-side).
--   4. Guard: no se puede destildar "realizado" si algún reporte ya avanzó.
--   5. v_protocol_report_status: todo lo del tablero desnormalizado, una consulta por protocolo.
--
-- ORDEN DE DESPLIEGUE: esta migración va PRIMERO y el front después. Es aditiva — ningún front
-- desplegado consulta estas tablas. NO toca `has_report`, ni v_patient_visits, ni las alertas:
-- eso es la 0091.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), en orden, DESPUÉS de la 0089.
-- IDEMPOTENTE. Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · report_status: en qué anda un reporte de una visita ------------------------------------
-- SIN fila = 'pendiente'. La vista de abajo lo resuelve con un coalesce, así que un reporte que
-- nadie tocó todavía no ocupa una fila. Eso también arregla solo el caso de la definición de
-- reporte agregada DESPUÉS de que el procedimiento se marcó realizado: la tarjeta aparece igual,
-- porque el que manda es el cruce definición × procedimiento-realizado, no una fila precreada.
--
-- `updated_by_name` va DESNORMALIZADO, y no es redundancia: la RLS de `users` es
-- `id = auth.uid() or has_module('gerencia')` (0006:82), o sea que un coordinador sólo ve su
-- propio nombre. Joinear `users` desde la vista devolvería NULL para todos los demás y el
-- historial mostraría filas sin persona, en silencio. Es el mismo criterio que `dismissed_by_name`
-- en la 0070 (quinta vez que este muro obliga a desnormalizar un nombre).
create table if not exists public.report_status (
  id                   uuid primary key default uuid_generate_v4(),
  visit_id             uuid not null references public.patient_visits(id)    on delete cascade,
  report_definition_id uuid not null references public.report_definitions(id) on delete cascade,
  stage                text not null default 'pendiente',
  updated_by           uuid not null references public.users(id),
  updated_by_name      text not null,
  updated_at           timestamptz not null default now(),
  unique (visit_id, report_definition_id)
);
do $mig$ begin
  alter table public.report_status add constraint report_status_stage_chk
    check (stage in ('pendiente', 'descargado', 'evolucionado'));
exception when duplicate_object then null; end $mig$;
create index if not exists ix_rs_visit on public.report_status (visit_id);
create index if not exists ix_rs_def   on public.report_status (report_definition_id);
comment on table public.report_status is
  'Etapa de un reporte (0089) en una visita concreta. Sin fila = pendiente. Se escribe SOLO por set_report_stage. 0090.';


-- 2 · report_status_history: el log de etapas ------------------------------------------------
-- Lo escribe un TRIGGER y no el cliente. Con dos escrituras desde el front, el estado y su
-- historial divergen el día que una de las dos falla — y un historial que puede divergir del
-- estado deja de ser prueba, que es justamente para lo que existe en un sistema auditado.
create table if not exists public.report_status_history (
  id               uuid primary key default uuid_generate_v4(),
  report_status_id uuid not null references public.report_status(id) on delete cascade,
  stage            text not null,
  changed_by       uuid not null references public.users(id),
  changed_by_name  text not null,
  changed_at       timestamptz not null default now()
);
create index if not exists ix_rsh_status on public.report_status_history (report_status_id, changed_at);
comment on table public.report_status_history is
  'Log de cambios de etapa de un reporte, con quién y cuándo. Lo escribe el trigger trg_log_report_stage. 0090.';

create or replace function public.log_report_stage()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  -- El alta también se registra: la primera etapa a la que alguien lo movió es información.
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into public.report_status_history (report_status_id, stage, changed_by, changed_by_name)
    values (new.id, new.stage, new.updated_by, new.updated_by_name);
  end if;
  return new;
end $fn$;

drop trigger if exists trg_log_report_stage on public.report_status;
create trigger trg_log_report_stage after insert or update
  on public.report_status for each row execute function public.log_report_stage();


-- 3 · RLS: leer sí, escribir SOLO por la RPC -------------------------------------------------
-- No se dan grants de insert/update/delete a `authenticated` a propósito. Con la policy abierta,
-- un PATCH directo a PostgREST evitaría la RPC entera —con su verificación de permiso y su sello
-- de autor— igual que pasaba con la anulación de recepción antes del guard de la 0088.
alter table public.report_status         enable row level security;
alter table public.report_status_history enable row level security;

drop policy if exists "ver estado de reporte" on public.report_status;
create policy "ver estado de reporte" on public.report_status for select using (
  public.has_module('gerencia') or public.coordina_visita(visit_id));

drop policy if exists "ver historial de reporte" on public.report_status_history;
create policy "ver historial de reporte" on public.report_status_history for select using (
  exists (select 1 from public.report_status rs
          where rs.id = report_status_id
            and (public.has_module('gerencia') or public.coordina_visita(rs.visit_id))));

revoke all on public.report_status         from anon;
revoke all on public.report_status_history from anon;
grant select on public.report_status         to authenticated;
grant select on public.report_status_history to authenticated;

drop trigger if exists trg_audit_report_status on public.report_status;
create trigger trg_audit_report_status after insert or update or delete
  on public.report_status for each row execute function public.audit_row();


-- 4 · La única puerta de escritura -----------------------------------------------------------
-- El autor lo sella el servidor con auth.uid(). El handoff traía un selector de "Actuando como"
-- para elegir a quién se le atribuye cada cambio: en un sistema auditable ANMAT/ICH-GCP eso es lo
-- contrario de una traza, y en el prototipo estaba sólo para poder demostrar el historial.
create or replace function public.set_report_stage(
  p_visit_id             uuid,
  p_report_definition_id uuid,
  p_stage                text
)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_procedure_id uuid;
  v_name         text;
begin
  if p_stage not in ('pendiente', 'descargado', 'evolucionado') then
    raise exception 'Etapa inválida' using errcode = 'check_violation';
  end if;
  if not (public.has_module('gerencia') or public.coordina_visita(p_visit_id)) then
    raise exception 'Sin permiso para mover los reportes de esta visita' using errcode = '42501';
  end if;

  select pp.procedure_id into v_procedure_id
  from public.report_definitions rd
  join public.protocol_procedures pp on pp.id = rd.protocol_procedure_id
  where rd.id = p_report_definition_id;
  if v_procedure_id is null then
    raise exception 'Ese reporte no existe' using errcode = '23503';
  end if;

  -- Sin el procedimiento realizado el reporte no existe como tarjeta: mover algo que todavía no
  -- nació sería inventar un plazo que arranca de una fecha que no ocurrió.
  if not exists (
    select 1 from public.visit_procedure_completions vpc
    where vpc.visit_id = p_visit_id and vpc.procedure_id = v_procedure_id
  ) then
    raise exception 'El procedimiento todavía no está marcado como realizado' using errcode = 'check_violation';
  end if;

  -- Su propia fila de users siempre le es visible; además esto es SECURITY DEFINER.
  select u.full_name into v_name from public.users u where u.id = auth.uid();

  insert into public.report_status as rs
    (visit_id, report_definition_id, stage, updated_by, updated_by_name, updated_at)
  values
    (p_visit_id, p_report_definition_id, p_stage, auth.uid(), coalesce(nullif(btrim(v_name), ''), 'Equipo'), now())
  on conflict (visit_id, report_definition_id) do update
    set stage           = excluded.stage,
        updated_by      = excluded.updated_by,
        updated_by_name = excluded.updated_by_name,
        updated_at      = now();
end $fn$;

comment on function public.set_report_stage(uuid, uuid, text) is
  'Mueve un reporte de etapa en una visita. Sella el autor con auth.uid(). authz: gerencia o coordinador de la visita. 0090.';

revoke all   on function public.set_report_stage(uuid, uuid, text) from public;
grant execute on function public.set_report_stage(uuid, uuid, text) to authenticated;


-- 5 · Guard: destildar "realizado" con reportes ya avanzados ---------------------------------
-- El tilde de "realizado" es lo que hace nacer los reportes y arranca su plazo. Destildarlo
-- después de que alguien descargó o evolucionó un reporte borraría en cascada su historial —
-- tres etapas con nombre y hora— sin que nadie lo decida. Se bloquea y se dice cuántos son.
--
-- El guard va en la BASE y no sólo en la pantalla, por el mismo motivo que el de la 0088: la
-- policy de `visit_procedure_completions` permite el delete directo desde PostgREST, así que un
-- chequeo que viva únicamente en el front es evitable.
create or replace function public.guard_uncomplete_with_reports()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_n int;
begin
  select count(*) into v_n
  from public.report_status rs
  join public.report_definitions rd  on rd.id = rs.report_definition_id
  join public.protocol_procedures pp on pp.id = rd.protocol_procedure_id
  where rs.visit_id = old.visit_id
    and pp.procedure_id = old.procedure_id
    and rs.stage <> 'pendiente';

  if v_n > 0 then
    raise exception 'Este procedimiento tiene % reporte(s) ya avanzados. Retrocedelos a pendiente antes de desmarcarlo.', v_n
      using errcode = 'check_violation';
  end if;
  return old;
end $fn$;

drop trigger if exists trg_guard_uncomplete_with_reports on public.visit_procedure_completions;
create trigger trg_guard_uncomplete_with_reports before delete
  on public.visit_procedure_completions for each row execute function public.guard_uncomplete_with_reports();


-- 6 · La vista del tablero -------------------------------------------------------------------
-- Una consulta por protocolo trae TODO lo que el tablero dibuja. El front no arma esto con tres
-- consultas por visita: con cuarenta pacientes por ocho visitas eso son cientos de viajes. Mismo
-- criterio que `useDayProceduresSummary` en el front y que `v_procedure_report_alerts` (0064).
--
-- OJO CON LA BASE DEL CRUCE. La vista arranca de lo ASIGNADO (protocol_activities: qué
-- procedimientos lleva esa visita del cuadro) y no de lo realizado, con `visit_procedure_completions`
-- entrando por LEFT JOIN. La diferencia no es cosmética: si sólo emitiera reportes de
-- procedimientos ya realizados, una visita con dos procedimientos de los cuales uno todavía no se
-- hizo se vería, desde el tablero, como si sus reportes estuvieran todos evolucionados — y se
-- cerraría sola con trabajo pendiente adentro. Con la asignación como base, el procedimiento sin
-- realizar sigue presente (con `completed_at` nulo) y la visita no puede cerrarse.
--
-- `completed_at` nulo también es lo que deja al modal de visita mostrar la píldora "N reportes"
-- ANTES de tildar el procedimiento, con su aviso de que se habilita al marcarlo realizado.
--
-- `visita_iniciada` existe para que el tablero no se traiga las visitas que todavía no ocurrieron:
-- son la mayoría de las filas de un protocolo en curso y no tienen nada que gestionar. El modal de
-- una visita no usa ese filtro, porque ahí sí importa ver la píldora desde el minuto cero.
--
-- El estado entra por LEFT JOIN: un reporte que nadie tocó sale 'pendiente' sin tener fila.
-- Sin joinear `users`: los nombres salen de las columnas desnormalizadas (ver la nota del punto 1).
drop view if exists public.v_protocol_report_status;
create view public.v_protocol_report_status with (security_invoker = true) as
select
  pv.id as visit_id,
  rd.id                as report_definition_id,
  rd.name              as report_name,
  rd.platform,
  rd.link,
  rd.eta_hours,
  rd.notes,
  rd.sort_order,
  pa.procedure_id,
  p.name               as procedure_name,
  p.code               as procedure_code,
  p.category           as procedure_category,
  pa.suggested_order   as procedure_order,
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
  pac.code             as patient_code,
  pac.full_name        as patient_name,
  vd.code              as visit_code,
  vd.name              as visit_name,
  vd.sort_order        as visit_sort_order,
  (select count(*) from public.report_status_history h where h.report_status_id = rs.id) as history_count
from public.patient_visits pv
join public.enrollments e             on e.id  = pv.enrollment_id
join public.protocol_activities pa    on pa.visit_def_id = pv.visit_def_id
join public.protocol_procedures pp    on pp.protocol_id = e.protocol_id and pp.procedure_id = pa.procedure_id
join public.report_definitions rd     on rd.protocol_procedure_id = pp.id
join public.procedures p              on p.id  = pa.procedure_id
join public.protocols pr              on pr.id = e.protocol_id
join public.patients pac              on pac.id = e.patient_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
left join public.visit_procedure_completions vpc
       on vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id
left join public.report_status rs     on rs.visit_id = pv.id and rs.report_definition_id = rd.id;

comment on view public.v_protocol_report_status is
  'Una fila por reporte de una visita realizada: definición + etapa + vencimiento + paciente/visita desnormalizados. Alimenta el tablero de Reportes pendientes. 0090.';
revoke all on public.v_protocol_report_status from anon;
grant select on public.v_protocol_report_status to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_protocol_report_status from authenticated;
