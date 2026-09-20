-- Spira · Migración 0136 — Coordinación: la visita cierra por sus REPORTES, no por cada tilde
-- ============================================================================
-- Plan: docs/plan-resumen-de-visita.md (PR 3; decisiones D1, D13, D15, D18).
--
-- QUÉ CAMBIA. La rama `realizada` de `computed_status` (0120) tenía tres condiciones: (1) algún
-- procedimiento del cuadro sin completar, (2) algún reporte sin evolucionar, (3) IP abierto en una
-- visita sellada. Esta migración SACA LA (1).
--
-- POR QUÉ. Con el rediseño del modal de visita (PR #245), el tilde vive sólo en el panel «Reportes
-- pendientes» y por lo tanto SÓLO se tildan los procedimientos que dejan informe. Los demás —signos
-- vitales, examen físico, cuestionarios— ya no tienen dónde marcarse: con la condición (1) puesta,
-- cualquier visita que los lleve quedaría «con pendientes» para siempre, sin forma de cerrarla.
--
-- NO SE PIERDE NADA PARA LOS PROCEDIMIENTOS CON REPORTE. Uno sin tildar ya lo atrapa la condición
-- (2): su reporte tampoco puede estar evolucionado, porque `set_report_stage` (0090) exige el
-- procedimiento realizado y el guard `guard_uncomplete_with_reports` impide destildarlo una vez que
-- el reporte avanzó. Lo que queda es exactamente la regla de `visitClosed` en
-- `src/views/track/reportes/estados.ts`, que es su espejo en el front.
--
-- LO QUE SÍ SE MUEVE, dicho de frente: las visitas ya atendidas cuyo único pendiente era un tilde de
-- un procedimiento SIN reporte pasan de «Visita realizada» a «Completa» (ficha, cronograma y la
-- pelotita de `dotVisual`). Se contó antes de escribir esto: son **3 visitas de LTS17231** (28-07 al
-- 24-08-2026), las tres sin ningún reporte definido, o sea que con la regla vieja no iban a cerrar
-- nunca. Con ese número, el Director eligió UNA SOLA REGLA para todas y descartó el corte por fecha
-- (D15, 2026-09-20): por tres visitas no vale que la vista arrastre dos reglas para siempre. Es
-- estado DERIVADO: no se reescribe ni se borra ninguna fila.
--
-- Y LO QUE DEJA DE REGISTRARSE: un procedimiento sin reporte que NO se hizo ya no deja señal en
-- Spira. Ese caso se documenta como desviación de protocolo (0130) o en el eCRF del sponsor.
--
-- FORMA: `create or replace view` y NO `drop ... cascade`. `patient_visits` no cambió desde la 0120
-- (verificado hasta la 0135), así que `pv.*` expande igual y la lista de columnas es idéntica; no
-- hay que recrear `v_track_visits` ni nada que cuelgue de ella. Si el `create or replace` fallara
-- por columnas, NO se fuerza con un cascade: se corta y se revisa.
--
-- ⚠️ EL `with (security_invoker = true)` VA SÍ O SÍ. `create or replace view` REEMPLAZA las opciones
-- de la vista por las que se escriben: omitirlo la dejaría corriendo con los permisos del dueño y
-- salteándose la RLS por protocolo, en silencio y sin ningún error. La sonda del final lo verifica.
--
-- ORDEN DE DESPLIEGUE: va DESPUÉS del deploy del front (PR #245, ya en prod). El front nuevo no la
-- necesita para funcionar; lo que esta migración hace es dejar de pedir un tilde que ya no existe.
--
-- APLICAR: a mano en el SQL Editor de Supabase, DESPUÉS de la 0135. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
--
-- Probada con PGlite sobre un esquema de juguete: los cuatro casos de la tabla del plan y la sonda
-- de `reloptions`.
-- ============================================================================

-- Copia VERBATIM de la 0120 salvo el PRIMER `exists` de la rama 6, que se retira.
create or replace view public.v_patient_visits with (security_invoker = true) as
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
      --     sigue sin tocarse acá, por el mismo motivo que en la 0068/0069/0079/0092/0120: cambiarla
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
      -- 6 · Atendida pero con pendientes: un REPORTE sin evolucionar, o el IP abierto.
      --     0136 · Se retiró el `exists` de «algún procedimiento del cuadro sin completar». Desde el
      --     rediseño del modal sólo se tildan los procedimientos que dejan informe, así que esa
      --     condición dejaba abiertas para siempre las visitas con procedimientos sin reporte. Para
      --     los que SÍ lo dejan no cambia nada: uno sin tildar lo toma igual el exists de abajo,
      --     porque su reporte tampoco llega a 'evolucionado' (set_report_stage exige el
      --     procedimiento realizado, 0090).
      --     `coalesce(stage, 'pendiente')`: sin fila = pendiente (0090).
      when exists (
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
      ) or exists (
        -- 0120 · La entrega del producto en investigación, abierta, en una visita sellada. La regla
        --        vive en v_visit_ip_status (0119); `sellada` es el corte que deja lo viejo quieto.
        select 1 from public.v_visit_ip_status s
        where s.visit_id = pv.id and s.sellada and s.abierto
      ) then 'realizada'
      else 'completa'
    end )::visit_status as computed_status,
  ( case
      -- `left_at` sale del recorrido: mark_left siempre exigió ready_at (0023:145), así que toda
      -- fila con salida marcada tiene ready_at y cae limpia acá. La columna queda como histórico.
      --
      -- OJO: la etapa sigue derivándose de `real_date` y NO del `attended_at`. Es a propósito:
      -- cambiarla movería de etapa a las visitas viejas.
      when pv.ready_at   is not null then 'fin_atencion'
      when pv.real_date  is not null then 'inicio_atencion'
      when pv.arrived_at is not null then 'concurrio_al_centro'
      else 'por_llegar'
    end ) as operational_stage
from public.patient_visits pv;

comment on view public.v_patient_visits is
  'patient_visits + estado clínico de 7 estados + recorrido operativo de 4 etapas. Recreada por la 0136: la rama `realizada` ya NO mira los procedimientos sin completar (desde el rediseño del modal sólo se tildan los que dejan informe); quedan el reporte sin evolucionar y el IP abierto. Resto verbatim de la 0120.';

-- Los permisos no se tocan, pero se repiten por si la vista se recrea en una base nueva.
revoke all on public.v_patient_visits from anon;
grant select on public.v_patient_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_patient_visits from authenticated;

notify pgrst, 'reload schema';

-- Sonda 1: la vista tiene que seguir corriendo con los permisos de QUIEN CONSULTA.
-- Tiene que devolver {security_invoker=true}.
select reloptions from pg_class where oid = 'public.v_patient_visits'::regclass;
