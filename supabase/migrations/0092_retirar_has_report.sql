-- Spira · Migración 0092 — Track: retirar `has_report` (fase 3 de Cronograma · Reportes)
-- ============================================================================
-- Fase 3 y última de "Cronograma · Procedimientos y Reportes"
-- (docs/plan-cronograma-reportes.md + docs/plan-fase3-reportes.md).
--
-- La 0089 definió QUÉ reportes genera cada procedimiento en cada estudio; la 0090, en qué ANDA
-- cada uno en una visita (pendiente → descargado → evolucionado). Las dos convivieron con el
-- modelo viejo: el flag binario `procedures.has_report` + `report_eta_hours` (0064), que seguía
-- alimentando `v_patient_visits.computed_status` y `v_procedure_report_alerts`. Ésta lo retira.
--
--   1. v_patient_visits.computed_status pasa a derivarse de report_definitions × report_status.
--   2. v_track_visits, recreada (el drop de v_patient_visits la tira en cascada).
--   3. v_procedure_report_alerts: una fila por REPORTE vencido, no por procedimiento.
--   4. alert_dismissals: identidad nueva (report_definition_id) + expansión de los descartes viejos.
--   5. dismiss_alert, adaptado a esa identidad.
--   6. Drop de procedures.has_report y procedures.report_eta_hours.
--   7. visit_procedure_reports_ready queda RETIRADA por comentario. No se dropea.
--
-- ============================================================================
-- ORDEN DE DESPLIEGUE: **el front va PRIMERO y esta migración inmediatamente después.**
-- ============================================================================
-- Es la única de las tres fases en este orden. El front desplegado hoy nombra `has_report` y
-- `report_eta_hours` en sus `select(...)` de `procedures`: si la migración fuera primero, esas
-- consultas fallan y las listas de visitas quedan en blanco — es lo que pasó con la 0068 el
-- 2026-08-05. Las otras dos fases eran aditivas y por eso iban al revés.
--
-- En la ventana entre el deploy y esta migración el canal de alertas de reporte queda en cero: el
-- front nuevo descarta las filas de `v_procedure_report_alerts` que llegan sin
-- `report_definition_id` (ver el comentario de `useProcedureReportAlerts`). Con las alertas de
-- reporte vigentes medidas en prod el 2026-08-24 —ninguna— eso no oculta nada.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), en orden, DESPUÉS de la 0091.
-- IDEMPOTENTE. Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Las dos vistas de visitas, en orden de dependencia --------------------------------------
-- Patrón del asterisco congelado (0047/0064/0065/0079): v_patient_visits hace `pv.*`, así que
-- cualquier cambio obliga a recrearla, y v_track_visits cuelga de ella y cae en cascada.
--
-- v_track_visits se copia VERBATIM de la 0079 (la vigente). De v_patient_visits cambian SÓLO las
-- dos ramas que miraban `has_report`; las otras cinco y el `operational_stage` van tal cual.
--
-- LA BASE DEL CRUCE es la misma que la de `v_protocol_report_status` (0090) y por el mismo motivo:
-- arranca de lo ASIGNADO (protocol_activities) y las completions entran por LEFT JOIN o por un
-- exists aparte. Si arrancara de las completions, una visita con dos procedimientos donde uno
-- todavía no se hizo se leería como si todos sus reportes estuvieran evolucionados y se cerraría
-- sola, con trabajo pendiente adentro.
--
-- Las dos ramas nuevas espejan las funciones puras de `src/views/track/reportes/estados.ts`, que
-- son las que ya están testeadas (isOverdue y visitClosed). Si alguna vez divergen, el tablero de
-- Reportes y el estado de la visita se contradicen en pantalla.
drop view if exists public.v_track_visits;
drop view if exists public.v_patient_visits;

create view public.v_patient_visits with (security_invoker = true) as
select
  pv.*,
  ( case
      -- 1 · El paciente está HOY en el centro y no se cerró la atención. Gana sobre todo lo demás.
      --     Acotado al día en curso a propósito: si nadie marca el fin, al día siguiente la visita
      --     no queda congelada acá, se resuelve por lo que tenga marcado.
      --     No mira real_date: con la llegada marcada hoy y sin ready_at está siendo atendida,
      --     se haya registrado o no la visita.
      when pv.ready_at is null and pv.arrived_at is not null
       and (pv.arrived_at at time zone 'America/Argentina/Buenos_Aires')::date
         = (now()          at time zone 'America/Argentina/Buenos_Aires')::date
        then 'en_atencion'
      -- 2 · Ventana vencida le gana a "Por reprogramar": es la más severa y la que mira el sponsor.
      --     OJO con el `current_date`: es la hora del servidor (UTC), así que adelanta el día a
      --     partir de las 21:00 hora argentina, mientras que la rama de arriba se ancla a mano a
      --     America/Argentina/Buenos_Aires. La inconsistencia es PREEXISTENTE (viene de la 0004) y
      --     sigue sin tocarse acá, por el mismo motivo que en la 0068/0069/0079: cambiarla movería
      --     de estado visitas ya cargadas, que es justo lo que esta migración se compromete a no hacer.
      when pv.real_date is null and current_date > pv.window_end then 'ventana_vencida'
      -- 3 · Se marcó la falta y todavía no tiene fecha nueva (el reagendado limpia no_show_at).
      when pv.real_date is null and pv.no_show_at is not null    then 'por_reprogramar'
      -- 4 · "Pendiente" fusiona lo que antes eran `futura` (>7 días) y `proxima`. La vista ya no
      --     emite 'futura'; el valor queda en el enum porque Postgres no deja borrarlo.
      when pv.real_date is null                                  then 'proxima'
      -- 5 · Vencido = un REPORTE del estudio (0089) cuyo procedimiento está realizado, que sigue
      --     en 'pendiente' y ya pasó su plazo. Espeja `isOverdue`: sin plazo (eta_hours nulo) no
      --     vence nunca, y una vez descargado el plazo dejó de correr.
      --     El join a completions es INNER acá: sin el procedimiento realizado el plazo no arrancó.
      when exists (
        select 1
        from public.protocol_activities pa
        join public.enrollments e          on e.id  = pv.enrollment_id
        join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                          and pp.procedure_id = pa.procedure_id
        join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
        join public.visit_procedure_completions vpc
             on vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id
        left join public.report_status rs
             on rs.visit_id = pv.id and rs.report_definition_id = rd.id
        where pa.visit_def_id = pv.visit_def_id
          and rd.eta_hours is not null
          and coalesce(rs.stage, 'pendiente') = 'pendiente'
          and now() > vpc.completed_at + (rd.eta_hours * interval '1 hour')
      ) then 'item_vencido'
      -- 6 · Atendida pero con pendientes: procedimientos sin realizar, o reportes sin evolucionar.
      --     El segundo exists espeja `visitClosed`: la visita cierra cuando TODOS sus reportes
      --     están en 'evolucionado'. No exige que el procedimiento esté realizado, porque un
      --     reporte de un procedimiento sin hacer tampoco está evolucionado — y ese caso ya lo
      --     toma el primer exists igual. `coalesce(stage, 'pendiente')`: sin fila = pendiente (0090).
      when exists (
        select 1 from public.protocol_activities pa
        where pa.visit_def_id = pv.visit_def_id
          and not exists (select 1 from public.visit_procedure_completions vpc
                          where vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id)
      ) or exists (
        select 1
        from public.protocol_activities pa
        join public.enrollments e          on e.id  = pv.enrollment_id
        join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                          and pp.procedure_id = pa.procedure_id
        join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
        left join public.report_status rs
             on rs.visit_id = pv.id and rs.report_definition_id = rd.id
        where pa.visit_def_id = pv.visit_def_id
          and coalesce(rs.stage, 'pendiente') <> 'evolucionado'
      ) then 'realizada'
      else 'completa'
    end )::visit_status as computed_status,
  ( case
      -- `left_at` sale del recorrido: mark_left siempre exigió ready_at (0023:145), así que toda
      -- fila con salida marcada tiene ready_at y cae limpia acá. La columna queda como histórico.
      when pv.ready_at   is not null then 'fin_atencion'
      when pv.real_date  is not null then 'inicio_atencion'
      when pv.arrived_at is not null then 'concurrio_al_centro'
      else 'por_llegar'
    end ) as operational_stage
from public.patient_visits pv;
comment on view public.v_patient_visits is
  'patient_visits + estado clínico de 7 estados + recorrido operativo de 4 etapas. Recreada por la 0092: item_vencido y realizada se derivan de report_definitions x report_status (0089/0090) y ya no de procedures.has_report. El resto, verbatim de la 0079.';
revoke all on public.v_patient_visits from anon;
grant select on public.v_patient_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_patient_visits from authenticated;

-- v_track_visits: copia VERBATIM de la 0079. Se recrea sólo porque el drop de arriba la tiró.
create view public.v_track_visits with (security_invoker = true) as
select
  v.id, v.enrollment_id, v.visit_def_id, v.estimated_date, v.real_date,
  v.window_start, v.window_end, v.notes, v.computed_status,
  vd.code as visit_code, vd.name as visit_name,
  coalesce(vd.visit_type, 'presencial') as visit_type, vd.sort_order,
  e.protocol_id, e.patient_id, e.status as enrollment_status,
  e.randomization_date as enrollment_randomization_date,
  pr.code as protocol_code, pr.name as protocol_name,
  pa.code as patient_code, pa.full_name as patient_name,
  pa.sex, pa.birth_date,
  pa.fertility,                                           -- 0079
  vd.offset_days, e.enrollment_date,
  coalesce(v.treating_physician, pa.treating_physician) as treating_physician,  -- 0079
  v.coordinator_id, v.coordinator_name,                   -- 0065
  v.kind,
  v.arrived_at, v.ready_at, v.left_at, v.no_show_at,      -- no_show_at: 0067
  v.wants_doctor,
  v.doctor_seen_at,
  v.doctor_motivo,
  v.wants_doctor_at, v.doctor_marked_by,
  coalesce(vd.dispenses, false) as dispenses,
  coalesce(vd.dispenses_ip, false) as dispenses_ip,       -- 0071
  v.operational_stage,
  vd.role, vd.date_mode,
  (select count(*) from public.visit_comments vc where vc.visit_id = v.id) as comments_count
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id;
comment on view public.v_track_visits is
  'v_track_visits (0065/0068/0069/0071/0079) recreada por la 0092 sin cambios propios: cayó en cascada con v_patient_visits.';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;


-- 2 · v_procedure_report_alerts: una fila por REPORTE vencido ---------------------------------
-- Antes emitía una por PROCEDIMIENTO realizado con la ETA cumplida. Un procedimiento que debe dos
-- reportes en dos portales era una sola alerta, y descartarla apagaba los dos.
--
-- La identidad es el par (visit_id, report_definition_id) y NO `report_status_id`: por diseño de
-- la 0090 "sin fila = pendiente", así que justo los reportes en alerta son los que suelen no tener
-- fila en report_status. Un id nulo no sirve de clave.
--
-- La condición es la misma que la rama `item_vencido` de arriba, y por eso las dos coinciden
-- siempre: una visita en 'item_vencido' tiene al menos una fila acá.
drop view if exists public.v_procedure_report_alerts;
create view public.v_procedure_report_alerts with (security_invoker = true) as
select
  pv.id              as visit_id,
  rd.id              as report_definition_id,
  pa.procedure_id,
  rd.name            as report_name,
  rd.platform,
  p.name             as procedure_name,
  rd.eta_hours,
  vpc.completed_at,
  (vpc.completed_at + (rd.eta_hours * interval '1 hour')) as report_due_at,
  e.protocol_id, e.patient_id,
  pr.code  as protocol_code, pr.name as protocol_name,
  pac.code as patient_code,  pac.full_name as patient_name,
  vd.name  as visit_name,    vd.code as visit_code
from public.patient_visits pv
join public.enrollments e          on e.id  = pv.enrollment_id
join public.protocol_activities pa on pa.visit_def_id = pv.visit_def_id
join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                  and pp.procedure_id = pa.procedure_id
join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
join public.procedures p           on p.id  = pa.procedure_id
join public.protocols pr           on pr.id = e.protocol_id
join public.patients pac           on pac.id = e.patient_id
join public.visit_procedure_completions vpc
     on vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
left join public.report_status rs     on rs.visit_id = pv.id and rs.report_definition_id = rd.id
where rd.eta_hours is not null
  and coalesce(rs.stage, 'pendiente') = 'pendiente'
  and now() > vpc.completed_at + (rd.eta_hours * interval '1 hour');

comment on view public.v_procedure_report_alerts is
  'Un reporte del estudio (0089) que sigue en pendiente con el plazo cumplido. Una fila por reporte; identidad (visit_id, report_definition_id). Recreada por la 0092: antes era una fila por procedimiento con has_report.';
revoke all on public.v_procedure_report_alerts from anon;
grant select on public.v_procedure_report_alerts to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_procedure_report_alerts from authenticated;


-- 3 · alert_dismissals: la identidad nueva ----------------------------------------------------
-- Se AGREGA report_definition_id y se deja `completion_id` donde está. La columna vieja no se
-- borra: es el registro de descartes que ya se hicieron, en un sistema auditado. Queda nullable y
-- fuera de la lógica.
--
-- La FK nueva no puede disparar el PGRST201 que volteó el tablero de Farmacia con la 0076: ningún
-- `select(...)` del front embebe `report_definitions` desde `alert_dismissals` ni al revés
-- (alert_dismissals se lee con `select('*')` pelado; report_definitions, por `.in(...)`).
alter table public.alert_dismissals
  add column if not exists report_definition_id uuid references public.report_definitions(id) on delete cascade;
comment on column public.alert_dismissals.report_definition_id is
  'Qué reporte del estudio se archivó (solo kind=''reporte_procedimiento''). Junto con visit_id es la identidad de la alerta. 0092.';
comment on column public.alert_dismissals.completion_id is
  'RETIRADA por la 0092: era la identidad de la alerta de reporte cuando ésta se emitía por procedimiento. Se conserva por los descartes ya registrados; la lógica usa report_definition_id. 0070.';

-- Expansión de los descartes viejos a los reportes que les corresponden.
--
-- Medido en prod el 2026-08-24: CERO descartes de kind='reporte_procedimiento', así que hoy esto
-- es un no-op. Se escribe igual porque tiene que ser correcto si aparece alguno entre esa medición
-- y el día que se aplique. Un descarte viejo apuntaba a un procedimiento entero; en el modelo
-- nuevo eso puede ser más de un reporte, así que se abre en uno por definición, conservando autor,
-- motivo y fecha — es la misma decisión, dicha en el vocabulario nuevo.
--
-- El ancla se RECALCULA con el plazo de cada definición (rd.eta_hours) y no se copia la vieja: el
-- ancla es lo que hace que el descarte deje de aplicar si la condición cambia, y la condición de
-- este reporte es su propio vencimiento. Copiar la del flag viejo dejaría descartes que no
-- matchean nada, o peor, que matchean lo que no corresponde.
--
-- Idempotente por el `where ad.report_definition_id is null` + el `on conflict do nothing`.
do $mig$
declare v_n int;
begin
  with viejos as (
    select ad.id, ad.visit_id, ad.completion_id, ad.reason, ad.detail,
           ad.dismissed_by, ad.dismissed_by_name, ad.dismissed_by_role, ad.dismissed_at,
           rd.id as report_definition_id,
           vpc.completed_at + (rd.eta_hours * interval '1 hour') as due_at
      from public.alert_dismissals ad
      join public.visit_procedure_completions vpc on vpc.id = ad.completion_id
      join public.patient_visits pv      on pv.id = ad.visit_id
      join public.enrollments e          on e.id  = pv.enrollment_id
      join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                        and pp.procedure_id = vpc.procedure_id
      join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
     where ad.kind = 'reporte_procedimiento'
       and ad.report_definition_id is null
       and rd.eta_hours is not null
  )
  insert into public.alert_dismissals
    (kind, visit_id, completion_id, report_definition_id, status, anchor, reason, detail,
     dismissed_by, dismissed_by_name, dismissed_by_role, dismissed_at)
  select 'reporte_procedimiento', v.visit_id, v.completion_id, v.report_definition_id,
         null, v.due_at, v.reason, v.detail,
         v.dismissed_by, v.dismissed_by_name, v.dismissed_by_role, v.dismissed_at
    from viejos v
  on conflict do nothing;
  get diagnostics v_n = row_count;
  raise notice 'Descartes de reporte expandidos al modelo nuevo: %', v_n;

  -- Las filas viejas quedan como estaban: son el registro de la decisión original. Ya no matchean
  -- nada (la lógica pide report_definition_id) y el panel de "Descartadas" las muestra igual.
  select count(*) into v_n from public.alert_dismissals
   where kind = 'reporte_procedimiento' and report_definition_id is null;
  if v_n > 0 then
    raise notice 'Descartes de reporte sin equivalente en el modelo nuevo (quedan como histórico): %', v_n;
  end if;
end $mig$;

-- El check de coherencia pasa a mirar la identidad nueva. Se afloja lo justo: un descarte de
-- reporte necesita report_definition_id; uno de visita no lleva ninguna de las dos. Los históricos
-- (reporte + completion_id + sin definición) siguen siendo válidos, si no la migración fallaría
-- contra sus propias filas — la trampa de las constraints nuevas sobre datos legacy.
alter table public.alert_dismissals drop constraint if exists alert_dismissals_kind_chk;
alter table public.alert_dismissals add constraint alert_dismissals_kind_chk
  check (
    case when kind = 'reporte_procedimiento'
         then report_definition_id is not null or completion_id is not null
         else report_definition_id is null and completion_id is null
    end
  );

-- La unicidad pasa a ser por (visita, reporte). El índice viejo era por completion_id, que ahora
-- se repite entre los hermanos expandidos.
drop index if exists public.ux_alert_dismissal_reporte;
create unique index if not exists ux_alert_dismissal_reporte
  on public.alert_dismissals (visit_id, report_definition_id)
  where kind = 'reporte_procedimiento' and report_definition_id is not null;


-- 4 · dismiss_alert, con la identidad nueva ---------------------------------------------------
-- Va DROP + CREATE y no `create or replace`: Postgres no deja RENOMBRAR un parámetro de entrada
-- ('cannot change name of input parameter'), y acá p_completion_id pasa a ser
-- p_report_definition_id. La lista de tipos es la MISMA (text, uuid, text, uuid, text), así que el
-- drop se lleva la única versión y no queda ninguna sobrecarga viva resolviendo llamadas viejas en
-- silencio (la trampa de `create or replace` con firma distinta).
--
-- El resto es la 0070 verbatim: la huella la calcula el servidor, y se rechaza archivar algo que
-- no está en alerta.
drop function if exists public.dismiss_alert(text, uuid, text, uuid, text);

create function public.dismiss_alert(
  p_kind                 text,
  p_visit_id             uuid,
  p_reason               text,
  p_report_definition_id uuid default null,
  p_detail               text default null
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_status     text;
  v_window_end date;
  v_due        timestamptz;
  v_anchor     timestamptz;
  v_name       text;
  v_role       text;
  v_id         uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_module('gerencia') or public.coordina_visita(p_visit_id)) then
    raise exception 'No tenés permiso' using errcode = '42501';
  end if;
  if p_kind not in ('visita', 'reporte_procedimiento') then
    raise exception 'Tipo de alerta desconocido' using errcode = '22023';
  end if;

  if p_kind = 'visita' then
    if p_report_definition_id is not null then
      raise exception 'Una alerta de visita no lleva reporte' using errcode = '22023';
    end if;
    -- Calificamos tv.* siempre: en PL/pgSQL los nombres sueltos compiten con las variables
    -- locales (el error de 0056 y 0058, dos veces el mismo).
    select tv.computed_status, tv.window_end
      into v_status, v_window_end
      from public.v_track_visits tv
     where tv.id = p_visit_id;
    if v_status is null then
      raise exception 'Visita inexistente' using errcode = '23503';
    end if;
    if v_status not in ('ventana_vencida', 'item_vencido') then
      raise exception 'Esa visita no está en alerta' using errcode = 'check_violation';
    end if;
    v_anchor := coalesce(v_window_end::timestamptz, '-infinity'::timestamptz);
  else
    if p_report_definition_id is null then
      raise exception 'Falta el reporte de la alerta' using errcode = '23502';
    end if;
    select ra.report_due_at
      into v_due
      from public.v_procedure_report_alerts ra
     where ra.report_definition_id = p_report_definition_id
       and ra.visit_id             = p_visit_id;
    if v_due is null then
      raise exception 'Ese reporte no está en alerta' using errcode = 'check_violation';
    end if;
    v_status := null;
    v_anchor := v_due;
  end if;

  -- Snapshot de quién archiva: su propia fila de users (siempre visible para él; además esto es
  -- SECURITY DEFINER). Mismo criterio que add_visit_comment en 0048.
  select u.full_name, coalesce(nullif(btrim(u.puesto), ''), 'Equipo')
    into v_name, v_role
    from public.users u where u.id = auth.uid();

  insert into public.alert_dismissals
    (kind, visit_id, report_definition_id, status, anchor, reason, detail,
     dismissed_by, dismissed_by_name, dismissed_by_role)
  values
    (p_kind, p_visit_id, p_report_definition_id, v_status, v_anchor, p_reason,
     nullif(btrim(coalesce(p_detail, '')), ''), auth.uid(),
     coalesce(v_name, 'Usuario'), coalesce(v_role, 'Equipo'))
  returning id into v_id;

  return v_id;
end $fn$;

comment on function public.dismiss_alert(text, uuid, text, uuid, text) is
  'Archiva una alerta vigente con motivo de catálogo. Calcula la huella (status+anchor) en el '
  'servidor para que un descarte no pueda tapar una alerta futura. Las de reporte se identifican '
  'por (visit_id, report_definition_id) desde la 0092. Authz: gerencia o coordinador de la visita.';

revoke all   on function public.dismiss_alert(text, uuid, text, uuid, text) from anon, public;
grant execute on function public.dismiss_alert(text, uuid, text, uuid, text) to authenticated;


-- 5 · Retirar el modelo viejo -----------------------------------------------------------------
-- Recién acá, cuando ya no queda ninguna vista que las nombre. El `procedures_report_eta_chk`
-- (0064) se va solo con la columna.
alter table public.procedures drop column if exists has_report;
alter table public.procedures drop column if exists report_eta_hours;

-- `visit_procedure_reports_ready` NO se dropea. Sus 19 filas —Consentimiento informado y
-- Espirometría, medidas el 2026-08-24— son el registro de lo que alguien marcó en su momento, y
-- en un sistema auditado eso no se borra porque el modelo cambió. Ninguno de esos dos
-- procedimientos define reportes hoy, así que no hay nada que migrar a `report_status`: marcar
-- descargado un reporte que no existía cuando se apretó el botón sería fabricar un registro.
-- Mismo criterio con el que la 0069 retiró el canal del checklist.
comment on table public.visit_procedure_reports_ready is
  'RETIRADA por la 0092. Era el "reporte listo" binario del modelo de la 0064; hoy la etapa de cada reporte vive en report_status (0090). Se conserva como registro histórico: ninguna vista ni función la lee.';


-- VERIFICACIÓN POSTERIOR ----------------------------------------------------------------------
-- Correr ANTES y DESPUÉS, y comparar renglón por renglón. Con los datos medidos el 2026-08-24
-- (0 alertas de reporte vigentes, 0 descartes de reporte) lo esperable es que los conteos por
-- estado NO se muevan salvo por visitas que el modelo nuevo ve y el viejo no:
--   select computed_status, count(*) from public.v_patient_visits group by 1 order by 1;
--   select count(*) from public.v_procedure_report_alerts;
--
-- Y que la columna ya no esté:
--   select column_name from information_schema.columns
--    where table_name = 'procedures' and column_name in ('has_report', 'report_eta_hours');
--   -- 0 filas.
--
-- VUELTA ATRÁS: re-ejecutar el bloque de vistas de la 0079 (líneas 90-196), la vista
--   v_procedure_report_alerts de la 0064 (líneas 89-116) y la función dismiss_alert de la 0070
--   (líneas 119-201), y volver a agregar las dos columnas con
--   `alter table public.procedures add column has_report boolean not null default false` +
--   `add column report_eta_hours integer`. Los valores se perdieron con el drop: eran tres
--   procedimientos (Análisis de orina, Cuestionario de calidad de vida, Electrocardiograma) y hay
--   que volver a marcarlos a mano. Nada más se pierde — ninguna tabla se tocó.
