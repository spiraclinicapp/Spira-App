-- Spira · Migración 0102 — Track: el sello del inicio de atención
-- ============================================================================
-- "Iniciar atención" pasa a sellar TRES cosas de una sola vez, atómicamente:
-- la fecha real (si no la tenía), la HORA exacta del click, y el coordinador que lo apretó.
--
--   1. patient_visits.attended_at (timestamptz, nullable): cuándo se apretó el botón.
--      Las visitas ya atendidas quedan en NULL y NO se backfillean: `real_date` es un `date`
--      sin hora, así que inventarles las 00:00 sería fabricar un dato clínico que nadie
--      registró. La pantalla muestra sólo la fecha cuando el sello no está.
--   2. v_patient_visits / v_track_visits recreadas (el `*` congelado — patrón 0047/0064/0065):
--      `pv.*` re-expande para exponer la columna nueva; v_track_visits la pasa explícita.
--   3. RPC start_visit_attention(visit): la única ruta al inicio de atención. Reemplaza al
--      update suelto de `real_date` que hacía el front (registerVisit), que no podía escribir
--      `coordinator_name` — la RLS de `users` sólo expone la fila propia, así que el nombre
--      lo tiene que resolver una función SECURITY DEFINER (mismo motivo que la 0065).
--
-- POR QUÉ UN RPC Y NO TRES UPDATES DEL FRONT: son tres escrituras que significan UN hecho
-- ("acá empezó la atención"). Sueltas pueden quedar a medias —fecha sí, coordinador no— y la
-- visita queda diciendo que la atendió alguien que no fue, o que no la atendió nadie.
--
-- ⚠️ EL COORDINADOR SE PISA SIEMPRE, Y NO SE VALIDA CONTRA protocol_coordinators.
-- Es una decisión explícita del Director (2026-08-29), tomada sabiendo las dos consecuencias:
--   · si gerencia marca la atención (ve TODAS las visitas por RLS), queda escrita como
--     coordinadora de esa visita, aunque no tenga el protocolo a cargo;
--   · si alguien había asignado un coordinador a propósito, esta marca lo reemplaza.
-- Por eso NO se toca `set_visit_coordinator` (0065), que sigue validando: la asignación
-- deliberada conserva su regla; la automática tiene la suya, y viven en funciones distintas.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), en orden, DESPUÉS de la 0101.
-- IDEMPOTENTE: reintentar es volver a correr el bloque entero.
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. Ningún front desplegado consulta
-- `attended_at` ni llama a `start_visit_attention`; el que no funciona sin esto es el front
-- nuevo. (Regla de CLAUDE.md: el orden lo decide si el cambio altera lo que el front YA pide.)
--
-- ⚠️ Los dos `drop view` de abajo dejan la app sin visitas hasta que corran los `create`.
-- Corré el archivo ENTERO de una, no sentencia por sentencia: en el editor de Supabase cada
-- sentencia va en su propia transacción y no hay rollback que salve un corte en el medio.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · La columna del sello ---------------------------------------------------------------------
alter table public.patient_visits
  add column if not exists attended_at timestamptz;
comment on column public.patient_visits.attended_at is
  'Momento exacto en que se marcó "Inicio de atención" (lo sella start_visit_attention, 0102). NULL = la atención no se marcó, o se marcó antes de la 0102 (no se backfillea: real_date es un date sin hora y las 00:00 serían un dato inventado). La ETAPA operativa NO se deriva de acá: sigue saliendo de real_date (0068/0069). Ver la deuda "desacoplar la etapa operativa de la fecha real" en TODOS.md.';


-- 2 · Las vistas, recreadas para exponer la columna nueva ---------------------------------------
-- `v_patient_visits` usa `pv.*`, y en Postgres el `*` se expande al CREAR la vista: agregar una
-- columna a la tabla no la agrega a la vista. Y `create or replace view` no sirve acá porque el
-- `*` re-expandido mete `attended_at` ANTES de computed_status/operational_stage, o sea cambia el
-- orden de columnas — que es justo lo que `replace` no permite. Drop + create, como la 0065/0092.
--
-- Se dropea primero la que depende (v_track_visits) para no necesitar CASCADE: así, si algo más
-- colgara de estas vistas, el drop FALLA en vez de llevárselo puesto en silencio.
-- `v_procedure_report_alerts` no cuelga de acá (lee `patient_visits` directo, 0092), y las
-- funciones que las consultan no generan dependencia: se recompilan al llamarlas.
drop view if exists public.v_track_visits;
drop view if exists public.v_patient_visits;

-- v_patient_visits: copia VERBATIM de la 0092. Lo único que cambia es que el `pv.*` ahora
-- re-expande incluyendo `attended_at`. Ni el computed_status ni la etapa se tocan.
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
      --     sigue sin tocarse acá, por el mismo motivo que en la 0068/0069/0079/0092: cambiarla
      --     movería de estado visitas ya cargadas, que es lo que esta migración no hace.
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
      --
      -- OJO: la etapa sigue derivándose de `real_date` y NO del `attended_at` nuevo. Es a
      -- propósito: cambiarla movería de etapa a las visitas viejas (todas tienen real_date y
      -- ninguna tiene attended_at) y esta migración se compromete a no mover ninguna.
      when pv.ready_at   is not null then 'fin_atencion'
      when pv.real_date  is not null then 'inicio_atencion'
      when pv.arrived_at is not null then 'concurrio_al_centro'
      else 'por_llegar'
    end ) as operational_stage
from public.patient_visits pv;
comment on view public.v_patient_visits is
  'patient_visits + estado clínico de 7 estados + recorrido operativo de 4 etapas. Recreada por la 0102 sin cambios propios: el pv.* re-expande para incluir attended_at. Cuerpo verbatim de la 0092.';
revoke all on public.v_patient_visits from anon;
grant select on public.v_patient_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_patient_visits from authenticated;

-- v_track_visits: copia VERBATIM de la 0092 + la columna `attended_at`, que acá va explícita.
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
  v.attended_at,                                          -- 0102
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
  'v_track_visits (0065/0068/0069/0071/0079/0092) recreada por la 0102: suma attended_at, el sello horario del inicio de atención.';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;


-- 3 · El RPC del inicio de atención -------------------------------------------------------------
-- `p_real_date` NO es un adorno: "Visitas del día" marca la atención con **el día que se está
-- mirando**, que no siempre es hoy (se puede estar completando el recorrido de una visita de ayer).
-- Si el servidor impusiera `today` a secas, esa pantalla empezaría a fechar mal en silencio. Va
-- nullable: el modal manda hoy, y si llegara null el servidor pone el día argentino igual — una
-- visita no cambia de etapa sin quedar fechada.
create or replace function public.start_visit_attention(p_visit_id uuid, p_real_date date default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_enrollment uuid;
  v_name       text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  -- Calificamos SIEMPRE las columnas (pv.enrollment_id, no enrollment_id): en PL/pgSQL los
  -- nombres sueltos compiten con las variables locales. Es el error de la 0056 y la 0058, el
  -- mismo dos veces.
  select pv.enrollment_id into v_enrollment
    from public.patient_visits pv
   where pv.id = p_visit_id;
  if v_enrollment is null then
    raise exception 'Visita inexistente' using errcode = '23503';
  end if;

  -- AUTHZ A MANO, y como primera verificación real: la función es SECURITY DEFINER, así que la
  -- RLS de patient_visits NO la mira. Sin esto, cualquier usuario autenticado podría marcar la
  -- atención de una visita de otro protocolo con una llamada directa a PostgREST. Espeja la
  -- policy de UPDATE "track modifica visitas propias" (0006) — la misma que hoy gobierna el
  -- update suelto de real_date, así que no habilita a nadie que antes no pudiera.
  if not (
    public.has_module('gerencia')
    or exists (
      select 1
        from public.enrollments e
        join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
       where e.id = v_enrollment and pc.user_id = auth.uid()
    )
  ) then
    raise exception 'No tenés permiso para marcar la atención de esta visita' using errcode = '42501';
  end if;

  -- El nombre se resuelve ACÁ y no en el front: es un snapshot que queda escrito para siempre en
  -- la visita, y dejar que el cliente elija el string que se guarda en un campo auditado es peor
  -- que resolverlo con permisos elevados. Puede quedar NULL si el usuario no tiene fila en
  -- `users`; el front ya trata `coordinator_name` nulo como "sin asignar".
  select u.full_name into v_name
    from public.users u
   where u.id = auth.uid();

  update public.patient_visits pv
     set
       -- Prioridad, en este orden y por este motivo:
       --   1. la fecha real que YA tenga: es un dato clínico y reescribirlo cambiaría cuándo dice
       --      la historia que pasó la visita (misma regla que `fechaRealAlAvanzar` en el front);
       --   2. la que manda quien llama: "Visitas del día" marca con el día que se está mirando;
       --   3. el día argentino, como piso.
       --
       -- El piso sale de la hora ARGENTINA y no de `current_date`, que es UTC: a partir de las
       -- 21:00 hora local `current_date` ya es mañana, y la visita quedaría fechada un día adelante.
       real_date = coalesce(pv.real_date, p_real_date, (now() at time zone 'America/Argentina/Buenos_Aires')::date),
       -- El sello tampoco se pisa: marca cuándo EMPEZÓ la atención, y sólo empieza una vez.
       attended_at = coalesce(pv.attended_at, now()),
       -- El coordinador SÍ se pisa, siempre. Ver el aviso del encabezado.
       coordinator_id   = auth.uid(),
       coordinator_name = v_name
   where pv.id = p_visit_id;
end;
$fn$;

comment on function public.start_visit_attention(uuid, date) is
  'Marca el inicio de atención de una visita: sella real_date (si faltaba), attended_at (la hora del click) y el coordinador que la marcó, en una sola transacción. 0102. El coordinador se PISA siempre y NO se valida contra protocol_coordinators (decisión del Director, 2026-08-29); la asignación deliberada sigue en set_visit_coordinator (0065), que sí valida.';

revoke all on function public.start_visit_attention(uuid, date) from anon;
grant execute on function public.start_visit_attention(uuid, date) to authenticated;

notify pgrst, 'reload schema';
