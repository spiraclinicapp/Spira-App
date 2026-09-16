// generar.mjs — cerrar los procedimientos y reportes de Victorion, salvo dos pacientes.
//
// POR QUÉ EXISTE. La carga del 2026-09-15 cerró los procedimientos de todas las visitas realizadas
// MENOS las dos últimas de cada inscripción, que quedaban para revisar a mano. En Victorion eso dejó
// 96 abiertas.
//
// ⚠️ DE DÓNDE SALE LA AFIRMACIÓN, que en una base auditada importa más que el SQL: el Director
// revisó Victorion contra los registros del sitio el 2026-09-16 y confirmó que **todos los pacientes
// tienen los procedimientos hechos y los reportes evolucionados, incluida la última visita**, con dos
// excepciones — los dos de EXCLUIDOS, cuyos reportes todavía no están evolucionados. No es una
// inferencia del script: es un dato que él trajo.
//
// Por eso esto cierra TODO Victorion salvo esos dos, y no «todo menos la última», que era el alcance
// anterior (y quedó chico con la información nueva).
//
// A los dos excluidos NO SE LES TOCA NADA —ni procedimientos ni reportes—, aunque de alguno ya estén
// tildados los procedimientos: mezclar «lo cerró el script» con «lo cerró él» en las mismas dos
// fichas que son la excepción es justo donde después nadie sabe qué pasó.
//
// Escribe en out/ dos SQL para el editor de Supabase, en este orden:
//   1-simular.sql  Hace todo y al final lo deshace a propósito (raise exception): el informe sale
//                  como «error». No guarda nada.
//   2-aplicar.sql  El mismo código, sin el deshacer. Termina con una consulta de control.
//
// Este script NO lleva datos personales (sólo códigos de protocolo e IVRS), así que out/ va al repo.
//
// Uso:  node supabase/scripts/cerrar-victorion/generar.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const PROTOCOLO = 'CKJX839D12302'

// Los dos que el Director revisó y NO tienen los reportes evolucionados. Quedan intactos.
// Van por IVRS y sin nombre a propósito: así este archivo no lleva datos personales y puede vivir
// en el repo. El informe sí los nombra, porque lo lee él contra la base.
const EXCLUIDOS = ['4022001', '4022016']

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

function molde(aplicar) {
  const titulo = aplicar ? '2 · APLICAR' : '1 · SIMULAR (no guarda nada)'
  return `-- Spira · Cerrar procedimientos y reportes de Victorion, salvo dos pacientes — ${titulo}
-- ============================================================================
-- GENERADO por supabase/scripts/cerrar-victorion/generar.mjs. No editar a mano.
--
-- ORDEN: out/1-simular.sql → leer el informe (sale como «error» a propósito: es el deshacer) →
-- out/2-aplicar.sql.
--
-- ${aplicar
    ? 'APLICA. Un único bloque do: o entra entero o no entra nada. Idempotente: correrlo dos veces deja lo mismo.'
    : 'SIMULA. Hace todo y lo deshace al final con raise exception: el mensaje ES el informe.'}
--
-- QUÉ HACE: tilda los procedimientos y da por evolucionados los reportes de TODAS las visitas
-- realizadas de ${PROTOCOLO} (Victorion), **salvo las de los IVRS ${EXCLUIDOS.join(' y ')}**.
--
-- ⚠️ EL PORQUÉ, que es lo que hay que poder responder dentro de seis meses: el Director revisó
-- Victorion contra los registros del sitio el 2026-09-16 y confirmó que todos los pacientes tienen
-- los procedimientos hechos y los reportes evolucionados —incluida la última visita— salvo esos dos,
-- cuyos reportes siguen pendientes. Este script transcribe ese hecho; no lo deduce.
--
-- NO TOCA los otros tres protocolos, ni a los dos excluidos (ni sus procedimientos ni sus reportes,
-- aunque alguno ya esté tildado a mano).
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
-- ============================================================================

do $victorion$
declare
  v_aplicar  boolean := ${aplicar};
  v_proto    text := ${lit(PROTOCOLO)};
  v_excluidos text[] := array[${EXCLUIDOS.map(lit).join(', ')}];
  v_pid      uuid;
  v_by       uuid;
  v_by_name  text;
  v_n        int;
  v_abiertas int;
  v_txt      text;
  v_informe  text;
begin
  select id into v_pid from public.protocols where code = v_proto;
  if v_pid is null then
    raise exception 'No encontré el protocolo %. No se cambió nada.', v_proto;
  end if;

  -- Los excluidos tienen que existir. Un IVRS mal tipeado acá no se nota en el resultado —el script
  -- cerraría de más y el informe diría un número plausible—, así que se frena antes de escribir.
  select string_agg(x, ', ') into v_txt from unnest(v_excluidos) as x
  where not exists (select 1 from public.enrollments e where e.protocol_id = v_pid and e.ivrs_code = x);
  if v_txt is not null then
    raise exception 'Estos IVRS excluidos no están en %: %. No se cambió nada.', v_proto, v_txt;
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

  -- El alcance: TODAS las visitas realizadas de Victorion menos las de los excluidos.
  create temp table _cierre on commit drop as
  select pv.id as visit_id, pv.visit_def_id, e.ivrs_code, pa.full_name, pv.real_date
  from public.patient_visits pv
  join public.enrollments e on e.id = pv.enrollment_id and e.protocol_id = v_pid
  join public.patients pa   on pa.id = e.patient_id
  where pv.real_date is not null
    and not (e.ivrs_code = any (v_excluidos));

  select count(*) into v_n from _cierre;
  if v_n = 0 then
    raise exception 'No hay ninguna visita de % para cerrar. No se cambió nada.', v_proto;
  end if;

  /* Cuántas de las alcanzadas están ABIERTAS hoy. Se cuenta ANTES de escribir y aparte del alcance:
     la mayoría ya la cerró la carga del 2026-09-15, así que informar el alcance a secas diría «280
     visitas» cuando las que cambian son muchas menos. Un número que asusta al leerlo hace que nadie
     lea el resto del informe. */
  select count(*) into v_abiertas from _cierre c
  where exists (select 1 from public.protocol_activities pa
                where pa.visit_def_id = c.visit_def_id
                  and not exists (select 1 from public.visit_procedure_completions vpc
                                  where vpc.visit_id = c.visit_id and vpc.procedure_id = pa.procedure_id))
     or exists (select 1 from public.protocol_activities pa
                join public.protocol_procedures pp on pp.protocol_id = v_pid and pp.procedure_id = pa.procedure_id
                join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
                left join public.report_status rs  on rs.visit_id = c.visit_id and rs.report_definition_id = rd.id
                where pa.visit_def_id = c.visit_def_id
                  and coalesce(rs.stage, 'pendiente') <> 'evolucionado');

  -- Tildar los procedimientos. completed_at = la fecha real a las 10:00 (el fin de atención con que
  -- quedaron selladas): el plazo de los reportes se cuenta desde ahí, así que ponerlo en now() haría
  -- nacer vencido todo lo que se cierre.
  insert into public.visit_procedure_completions (visit_id, procedure_id, completed_by, completed_at)
  select c.visit_id, pa.procedure_id, v_by,
         (c.real_date + time '10:00') at time zone 'America/Argentina/Buenos_Aires'
  from _cierre c
  join public.protocol_activities pa on pa.visit_def_id = c.visit_def_id
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
  on conflict (visit_id, report_definition_id) do update
    set stage = 'evolucionado', updated_by = excluded.updated_by,
        updated_by_name = excluded.updated_by_name, updated_at = excluded.updated_at
    where public.report_status.stage is distinct from 'evolucionado';
  get diagnostics v_n = row_count;
  insert into _linea (texto) values (format('%s reportes dados por evolucionados', v_n));

  select concat_ws(E'\\n',
    case when v_aplicar then 'CIERRE APLICADO.' else 'SIMULACIÓN — NO SE GUARDÓ NADA. Si el informe está bien, corré out/2-aplicar.sql.' end,
    '',
    '== Lo que se cierra ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea), '(nada)'),
    format('visitas que estaban abiertas y se cierran: %s · ya cerradas de antes: %s',
           v_abiertas, (select count(*) from _cierre) - v_abiertas),
    '',
    '== Los dos que NO se tocan ==',
    coalesce((select string_agg(format('%s · %s · %s visitas realizadas, %s todavía con pendientes',
                                       e.ivrs_code, pa.full_name,
                                       (select count(*) from public.patient_visits p2
                                         where p2.enrollment_id = e.id and p2.real_date is not null),
                                       (select count(*) from public.patient_visits p3
                                          join public.v_patient_visits v3 on v3.id = p3.id
                                         where p3.enrollment_id = e.id and p3.real_date is not null
                                           and v3.computed_status = 'realizada')),
                                E'\\n' order by e.ivrs_code)
              from public.enrollments e
              join public.patients pa on pa.id = e.patient_id
              where e.protocol_id = v_pid and e.ivrs_code = any (v_excluidos)), '(ninguno)')
  ) into v_informe;

  if not v_aplicar then
    raise exception '%', v_informe;
  end if;
end
$victorion$;
${aplicar ? `
-- Control. Lo único que tiene que quedar en «con pendientes» son las visitas de los dos excluidos.
-- Si aparece alguna de otro paciente, algo no cerró.
select coalesce(e.ivrs_code, '(sin IVRS)') as ivrs,
       pa.full_name                        as paciente,
       count(*)                            as visitas_con_pendientes
from public.patient_visits pv
join public.v_patient_visits v on v.id = pv.id
join public.enrollments e      on e.id = pv.enrollment_id
join public.protocols p        on p.id = e.protocol_id
join public.patients pa        on pa.id = e.patient_id
where p.code = ${lit(PROTOCOLO)}
  and pv.real_date is not null
  and v.computed_status = 'realizada'
group by e.ivrs_code, pa.full_name
order by e.ivrs_code;
` : ''}`
}

mkdirSync(resolve(aqui, 'out'), { recursive: true })
writeFileSync(resolve(aqui, 'out/1-simular.sql'), molde(false), 'utf8')
writeFileSync(resolve(aqui, 'out/2-aplicar.sql'), molde(true), 'utf8')
console.log('✓ out/1-simular.sql y out/2-aplicar.sql generados')
console.log(`  ${PROTOCOLO} · se cierra TODO salvo los IVRS ${EXCLUIDOS.join(' y ')}`)
