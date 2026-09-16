-- Spira · Cerrar los procedimientos de Victorion, menos la última de cada paciente — 2 · APLICAR
-- ============================================================================
-- GENERADO por supabase/scripts/cerrar-victorion/generar.mjs. No editar a mano.
--
-- ORDEN: out/1-simular.sql → leer el informe (sale como «error» a propósito: es el deshacer) →
-- out/2-aplicar.sql.
--
-- APLICA. Un único bloque do: o entra entero o no entra nada. Idempotente: correrlo dos veces deja lo mismo.
--
-- QUÉ HACE: tilda los procedimientos y da por evolucionados los reportes de las visitas realizadas
-- de CKJX839D12302 (Victorion), **menos la última de cada inscripción**, que el Director revisa a mano.
-- Sólo ese protocolo: ACT18301 y ENDURA varían entre sí y los mira él.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
-- ============================================================================

do $victorion$
declare
  v_aplicar boolean := true;
  v_proto   text := 'CKJX839D12302';
  v_pid     uuid;
  v_by      uuid;
  v_by_name text;
  v_n       int;
  v_abiertas int;
  v_informe text;
begin
  select id into v_pid from public.protocols where code = v_proto;
  if v_pid is null then
    raise exception 'No encontré el protocolo %. No se cambió nada.', v_proto;
  end if;

  -- Autor de las filas nuevas: el editor corre como postgres, sin auth.uid(). Mismo criterio que las
  -- migraciones y que la carga del 2026-09-15.
  select u.id, u.full_name into v_by, v_by_name
  from public.users u join public.user_module_roles r on r.user_id = u.id
  where r.module = 'gerencia' order by u.created_at limit 1;
  if v_by is null then select u.id, u.full_name into v_by, v_by_name from public.users u order by u.created_at limit 1; end if;
  if v_by is null then raise exception 'No hay usuarios a quién atribuir el cierre.'; end if;
  v_by_name := coalesce(v_by_name, 'Sistema');

  create temp table _linea (n serial, texto text) on commit drop;

  -- El alcance: las visitas realizadas de Victorion, rankeadas por fecha real DESCENDENTE dentro de
  -- cada inscripción. rn = 1 es la última de cada paciente y es la que NO se toca. El desempate por
  -- sort_order importa cuando dos visitas comparten el día.
  create temp table _cierre on commit drop as
  select pv.id as visit_id, pv.enrollment_id, pv.visit_def_id, e.ivrs_code, pa.full_name,
         pv.real_date, coalesce(upper(btrim(vd.code)), '(suelta)') as code,
         row_number() over (partition by pv.enrollment_id
                            order by pv.real_date desc, coalesce(vd.sort_order, 0) desc, pv.id) as rn
  from public.patient_visits pv
  join public.enrollments e on e.id = pv.enrollment_id and e.protocol_id = v_pid
  join public.patients pa   on pa.id = e.patient_id
  left join public.visit_definitions vd on vd.id = pv.visit_def_id
  where pv.real_date is not null;

  select count(*) into v_n from _cierre where rn > 1;
  if v_n = 0 then
    raise exception 'No hay ninguna visita de % para cerrar. ¿Ya se corrió? No se cambió nada.', v_proto;
  end if;

  /* Cuántas de las alcanzadas están ABIERTAS hoy. Hay que contarlo ANTES de escribir, y hay que
     contarlo aparte: el alcance (rn > 1) incluye las que la carga del 2026-09-15 ya cerró, así que
     informar el alcance a secas diría «288 visitas» cuando las que cambian son 48. Un número que
     asusta al leerlo hace que nadie lea el resto del informe. */
  select count(*) into v_abiertas from _cierre c
  where c.rn > 1 and (
    exists (select 1 from public.protocol_activities pa
            where pa.visit_def_id = c.visit_def_id
              and not exists (select 1 from public.visit_procedure_completions vpc
                              where vpc.visit_id = c.visit_id and vpc.procedure_id = pa.procedure_id))
    or exists (select 1 from public.protocol_activities pa
               join public.protocol_procedures pp on pp.protocol_id = v_pid and pp.procedure_id = pa.procedure_id
               join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
               left join public.report_status rs  on rs.visit_id = c.visit_id and rs.report_definition_id = rd.id
               where pa.visit_def_id = c.visit_def_id
                 and coalesce(rs.stage, 'pendiente') <> 'evolucionado'));

  -- Tildar los procedimientos. completed_at = la fecha real a las 10:00 (el fin de atención con que
  -- quedaron selladas): el plazo de los reportes se cuenta desde ahí, así que ponerlo en now() haría
  -- nacer vencido todo lo que se cierre.
  insert into public.visit_procedure_completions (visit_id, procedure_id, completed_by, completed_at)
  select c.visit_id, pa.procedure_id, v_by,
         (c.real_date + time '10:00') at time zone 'America/Argentina/Buenos_Aires'
  from _cierre c
  join public.protocol_activities pa on pa.visit_def_id = c.visit_def_id
  where c.rn > 1
  on conflict (visit_id, procedure_id) do nothing;
  get diagnostics v_n = row_count;
  insert into _linea (texto) values (format('%s procedimientos tildados', v_n));

  -- Los reportes, a 'evolucionado': es la etapa final (0090) y la única que deja la visita en
  -- «completa». El sello va en la fecha real más el plazo del reporte, nunca después de ahora — un
  -- reporte evolucionado con fecha futura es una fecha que no ocurrió.
  insert into public.report_status (visit_id, report_definition_id, stage, updated_by, updated_by_name, updated_at)
  select c.visit_id, rd.id, 'evolucionado', v_by, v_by_name,
         least(((c.real_date + time '10:00') at time zone 'America/Argentina/Buenos_Aires')
               + (coalesce(rd.eta_hours, 0) * interval '1 hour'), now())
  from _cierre c
  join public.protocol_activities pa  on pa.visit_def_id = c.visit_def_id
  join public.protocol_procedures pp  on pp.protocol_id = v_pid and pp.procedure_id = pa.procedure_id
  join public.report_definitions rd   on rd.protocol_procedure_id = pp.id
  where c.rn > 1
  on conflict (visit_id, report_definition_id) do update
    set stage = 'evolucionado', updated_by = excluded.updated_by,
        updated_by_name = excluded.updated_by_name, updated_at = excluded.updated_at
    where public.report_status.stage is distinct from 'evolucionado';
  get diagnostics v_n = row_count;
  insert into _linea (texto) values (format('%s reportes dados por evolucionados', v_n));

  select concat_ws(E'\n',
    case when v_aplicar then 'CIERRE APLICADO.' else 'SIMULACIÓN — NO SE GUARDÓ NADA. Si el informe está bien, corré out/2-aplicar.sql.' end,
    '',
    '== Lo que se cierra ==',
    coalesce((select string_agg(texto, E'\n' order by n) from _linea), '(nada)'),
    format('visitas que estaban abiertas y se cierran: %s · ya cerradas de antes: %s · quedan para vos: %s',
           v_abiertas,
           (select count(*) from _cierre where rn > 1) - v_abiertas,
           (select count(*) from _cierre where rn = 1)),
    '',
    '== Lo que queda para revisar a mano (la última de cada paciente) ==',
    coalesce((select string_agg(format('%s · %s · %s del %s', c.ivrs_code, c.full_name, c.code,
                                       to_char(c.real_date, 'DD/MM/YYYY')), E'\n' order by c.ivrs_code)
              from _cierre c where c.rn = 1), '(ninguna)')
  ) into v_informe;

  if not v_aplicar then
    raise exception '%', v_informe;
  end if;
end
$victorion$;

-- Control. `con_pendientes` tiene que quedar en 48: una por paciente, la última de cada uno.
select count(*) filter (where v.computed_status = 'completa')  as completas,
       count(*) filter (where v.computed_status = 'realizada') as con_pendientes
from public.patient_visits pv
join public.v_patient_visits v on v.id = pv.id
join public.enrollments e      on e.id = pv.enrollment_id
join public.protocols p        on p.id = e.protocol_id
where p.code = 'CKJX839D12302' and pv.real_date is not null;
