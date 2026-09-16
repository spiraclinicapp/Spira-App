// generar.mjs — PASO 0: renumerar los IVRS de LTS17231 en prod.
//
// POR QUÉ EXISTE. El listado del sitio del 2026-09-15 trae LTS17231 con la numeración corrida (001…008),
// mientras que Spira tiene la vieja (001, 002, 005…010 — el mismo hueco que ACT18301, que era de donde se
// había copiado). El Director confirmó que la buena es la del listado.
//
// No alcanza con dejar que lo haga pacientes-prueba-real/2-aplicar.sql, aunque ese script sepa cambiar el
// ivrs_code: para saber DE QUIÉN es cada inscripción, primero resuelve la PERSONA, y lo hace mirando —entre
// otras cosas— a qué paciente apunta cada IVRS del listado. Durante la transición eso es ambiguo: el listado
// dice que Gossuin es LTS17231 «032001520007», pero en Spira ese número todavía es de Ríos. El script lo
// detecta y se frena antes de tocar nada:
//
//   P0001: El listado junta en una persona a pacientes distintos de Spira (IVRS 032001500009, 032001520007).
//
// Que se frene está bien: es el candado haciendo su trabajo. Lo que hay que hacer es sacarle la ambigüedad
// de adelante, renumerando primero. Después, cada IVRS del listado apunta a quien tiene que apuntar.
//
// CÓMO IDENTIFICA A CADA UNO. No por el número viejo ni por el nombre, sino por el **IVRS de ACT18301**, que
// no cambió: los seis pacientes están en los dos estudios. El número viejo va igual, pero sólo como control
// —si no coincide, el script se frena—, así que una sorpresa en prod no pasa en silencio.
//
// NO TOCA NADA MÁS: ni visitas, ni fechas, ni medicación, ni las inscripciones 001 y 002 (que no cambian).
// Un `update` de ivrs_code no dispara ninguna generación de visitas (eso cuelga de randomization_date).
//
// Uso:  node supabase/scripts/renumerar-lts17231/generar.mjs
//
// Este script NO lleva datos personales (sólo códigos), así que out/ va al repo y se puede revisar en el diff.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))

// ancla = IVRS del paciente en ACT18301 (no cambia) · viejo = lo que tiene Spira hoy · nuevo = lo que dice el listado
const MAPA = [
  { ancla: '032001500005', viejo: '032001520005', nuevo: '032001520003' },
  { ancla: '032001500006', viejo: '032001520006', nuevo: '032001520004' },
  { ancla: '032001500007', viejo: '032001520007', nuevo: '032001520005' },
  { ancla: '032001500008', viejo: '032001520008', nuevo: '032001520006' },
  { ancla: '032001500009', viejo: '032001520009', nuevo: '032001520007' },
  { ancla: '032001500010', viejo: '032001520010', nuevo: '032001520008' },
]

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

function molde(aplicar) {
  const titulo = aplicar ? '2 · APLICAR' : '1 · SIMULAR (no guarda nada)'
  return `-- Spira · PASO 0 — Renumerar los IVRS de LTS17231 — ${titulo}
-- ============================================================================
-- GENERADO por supabase/scripts/renumerar-lts17231/generar.mjs. No editar a mano.
--
-- ORDEN EN PROD:
--   1. out/1-simular.sql de ACÁ  → leer el informe (sale como «error» a propósito: es el deshacer)
--   2. out/2-aplicar.sql de ACÁ
--   3. pacientes-prueba-real/out/1-simular.sql y 2-aplicar.sql
--   4. entregas-y-procedimientos/out/1-simular.sql y 2-aplicar.sql
--
-- ${aplicar
    ? 'APLICA. Un único bloque do: o entra entero o no entra nada. Idempotente: correrlo dos veces deja lo mismo.'
    : 'SIMULA. Hace el cambio y lo deshace al final con raise exception: el mensaje ES el informe.'}
--
-- QUÉ HACE: le cambia el ivrs_code a seis inscripciones de LTS17231, y nada más. A cada paciente lo
-- encuentra por su IVRS de ACT18301, que no cambió; el número viejo se usa sólo como control.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
-- ============================================================================

do $renum$
declare
  v_aplicar boolean := ${aplicar};
  v_mapa    jsonb := ${lit(JSON.stringify(MAPA))}::jsonb;
  v_lts     uuid;
  v_act     uuid;
  v_m       record;
  v_pid     uuid;
  v_nombre  text;
  v_actual  text;
  v_otro    text;
  v_n       int;
  v_informe text;
begin
  select id into v_lts from public.protocols where code = 'LTS17231';
  select id into v_act from public.protocols where code = 'ACT18301';
  if v_lts is null or v_act is null then
    raise exception 'Falta LTS17231 o ACT18301 en protocols. No se cambió nada.';
  end if;

  create temp table _linea (n serial, texto text) on commit drop;

  for v_m in select * from jsonb_to_recordset(v_mapa) as x(ancla text, viejo text, nuevo text)
  loop
    -- El paciente, por su inscripción de ACT18301 (la que no se renumera).
    select e.patient_id, pa.full_name into v_pid, v_nombre
    from public.enrollments e
    join public.patients pa on pa.id = e.patient_id
    where e.protocol_id = v_act and e.ivrs_code = v_m.ancla;
    if v_pid is null then
      raise exception 'No encontré en ACT18301 al paciente con IVRS %. No se cambió nada.', v_m.ancla;
    end if;

    -- Su inscripción de LTS17231.
    select e.ivrs_code into v_actual
    from public.enrollments e where e.protocol_id = v_lts and e.patient_id = v_pid;
    if not found then
      raise exception '% (ACT18301 %) no tiene inscripción en LTS17231. No se cambió nada.', v_nombre, v_m.ancla;
    end if;

    if v_actual = v_m.nuevo then
      insert into _linea (texto) values (format('%s · ya estaba en %s', v_nombre, v_m.nuevo));
      continue;
    end if;

    -- El número viejo es CONTROL, no identidad: si prod dice otra cosa, algo no es lo que creemos.
    if v_actual is distinct from v_m.viejo then
      raise exception '% tiene en LTS17231 el IVRS «%», y esperaba «%» (o el nuevo «%»). No se cambió nada.',
        v_nombre, coalesce(v_actual, 'sin IVRS'), v_m.viejo, v_m.nuevo;
    end if;

    -- El número nuevo no puede estar ocupado por otro. No hay índice único sobre ivrs_code, así que este
    -- chequeo es la única red: sin él, dos inscripciones del mismo estudio podrían quedar con el mismo IVRS.
    select pa.full_name into v_otro
    from public.enrollments e join public.patients pa on pa.id = e.patient_id
    where e.protocol_id = v_lts and e.ivrs_code = v_m.nuevo and e.patient_id <> v_pid;
    if v_otro is not null then
      raise exception 'No puedo darle % a %: ese IVRS de LTS17231 ya es de %. No se cambió nada.',
        v_m.nuevo, v_nombre, v_otro;
    end if;

    update public.enrollments set ivrs_code = v_m.nuevo
    where protocol_id = v_lts and patient_id = v_pid;
    insert into _linea (texto) values (format('%s · %s → %s', v_nombre, v_m.viejo, v_m.nuevo));
  end loop;

  -- Control final: ningún IVRS repetido dentro de LTS17231.
  select count(*) into v_n from (
    select e.ivrs_code from public.enrollments e
    where e.protocol_id = v_lts and e.ivrs_code is not null
    group by e.ivrs_code having count(*) > 1) d;
  if v_n > 0 then
    raise exception 'Quedaron % IVRS repetidos en LTS17231. No se cambió nada.', v_n;
  end if;

  select concat_ws(E'\\n',
    case when v_aplicar then 'RENUMERACIÓN APLICADA.' else 'SIMULACIÓN — NO SE GUARDÓ NADA. Si el informe está bien, corré out/2-aplicar.sql.' end,
    '',
    '== Inscripciones de LTS17231 ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea), '(ninguna)'),
    '',
    '== Cómo queda LTS17231 ==',
    (select string_agg(format('%s · %s (%s)', e.ivrs_code, pa.full_name, e.status), E'\\n' order by e.ivrs_code)
     from public.enrollments e join public.patients pa on pa.id = e.patient_id where e.protocol_id = v_lts)
  ) into v_informe;

  if not v_aplicar then
    raise exception '%', v_informe;
  end if;
end
$renum$;
${aplicar ? `
-- Control. Los ocho IVRS de LTS17231 tienen que ser 032001520001 … 032001520008, sin huecos ni repetidos.
select e.ivrs_code, pa.full_name, e.status
from public.enrollments e
join public.protocols p on p.id = e.protocol_id
join public.patients pa on pa.id = e.patient_id
where p.code = 'LTS17231'
order by e.ivrs_code;
` : ''}`
}

mkdirSync(resolve(aqui, 'out'), { recursive: true })
writeFileSync(resolve(aqui, 'out/1-simular.sql'), molde(false), 'utf8')
writeFileSync(resolve(aqui, 'out/2-aplicar.sql'), molde(true), 'utf8')
console.log(`✓ out/1-simular.sql y out/2-aplicar.sql generados · ${MAPA.length} inscripciones a renumerar`)
for (const m of MAPA) console.log(`   ACT18301 ${m.ancla} · LTS17231 ${m.viejo} → ${m.nuevo}`)
