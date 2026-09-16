// generar.mjs — las entregas de medicación del listado y el cierre de procedimientos de las visitas viejas.
//
// SEGUNDA PASADA sobre la carga de la prueba real. La primera (pacientes-prueba-real/) trajo pacientes,
// inscripciones, visitas y qué medicación tiene asignada cada uno. Ésta usa dos cosas que aquélla no toca:
//
//   1. La columna «Medicacion Real» que el Director sumó al listado el 2026-09-15: el texto del sitio que
//      dice, visita por visita, qué medicación se entregó. Son 70 visitas en 15 pacientes.
//   2. Los procedimientos y reportes de las visitas ya realizadas, que en Spira están todos sin tildar y
//      dejan cada visita en «con pendientes» para siempre.
//
// Escribe en out/ dos SQL para el editor de Supabase, en este orden:
//
//   1-simular.sql  Hace todo y al final lo deshace a propósito (raise exception): el editor muestra como
//                  «error» el informe de lo que va a cambiar. No guarda nada.
//   2-aplicar.sql  El mismo código, sin el deshacer. Termina con una consulta de control.
//
// Los dos salen del mismo molde con una sola diferencia (v_aplicar), así que lo que simula es lo que aplica.
//
// ⚠️ out/ y el Excel están en .gitignore: traen nombres y fechas de nacimiento. Al repo va sólo esto.
//
// Uso:  node supabase/scripts/entregas-y-procedimientos/generar.mjs "<ruta al Excel de pacientes>"
//
// ⚠️ ORDEN EN PROD — esto va ÚLTIMO, después de:
//     0. renumerar-lts17231/          (los seis IVRS nuevos de LTS17231)
//     1. pacientes-prueba-real/       (las cinco fechas reales nuevas y el cronograma de la 707408)
//     2. esto
// Fuera de orden, los IVRS nuevos no existen todavía y el script se frena en la precondición — que es lo
// que tiene que pasar, pero es media hora perdida.
//
// ── Decisiones del Director (2026-09-15) ──────────────────────────────────────────────────────────────
//
//   · LA ENTREGA SE REGISTRA COMO PEDIDO + DISPENSACIÓN ENTREGADA, SIN LOTES. No hay renglones de
//     dispensación ni movimientos de stock: la entrega ocurrió antes de que Farmacia llevara el circuito en
//     Spira y nadie anotó el lote. Inventar un lote sería meter inventario falso en una base auditada.
//
//     ⚠️ Esto esquiva un candado del propio sistema, y conviene tenerlo a la vista: apply_dispensation_stock
//     (0003) corta la entrega sin renglones — «dejaría stock sin mover». Es un trigger AFTER UPDATE, así que
//     un insert directo en estado 'entregada' no lo despierta. El candado protege el circuito VIVO, donde hay
//     stock que mover; acá no hay stock que mover porque la entrega no salió de esta farmacia. Es el mismo
//     criterio con el que la carga de ayer apagó el sello de IP (0119) para las visitas históricas.
//     Cada pedido lleva escrito ese porqué en `notes`, y ese texto es además la marca de idempotencia.
//
//   · LOS PROCEDIMIENTOS SE CIERRAN SOBRE LO QUE HOY TIENE PRODUCCIÓN, no sobre el listado. Eso incluye las
//     246 visitas de Victorion que la carga de ayer creó con fecha real provisoria. El alcance se calcula
//     DENTRO del SQL (no acá) justamente por eso: el dato manda desde la base, no desde el Excel.
//
//   · SE EXCLUYEN LAS ÚLTIMAS DOS VISITAS DE CADA INSCRIPCIÓN, por fecha real descendente. El Director las
//     revisa a mano para ver si están evolucionadas. Por INSCRIPCIÓN y no por persona: los ocho pacientes que
//     están en dos protocolos tienen dos recorridos con reportes propios, y contar dos en total le dejaría
//     un estudio entero cerrado sin mirar. Además es el corte conservador (excluye más, cierra menos).
//
//   · «Neumoterol aerosol» (una visita de Aguero) se mapea a Neumoterol 160/4,5 mcg: es la presentación en
//     aerosol, y es lo que dicen las otras visitas del mismo paciente. Queda avisado en el informe.
//
// ── Reglas que el Excel no dice y se fijan acá ────────────────────────────────────────────────────────
//
//   · La entrega se fecha a las 09:30 del día de la visita: entre la llegada (09:00) y el fin de atención
//     (10:00) con que la carga de ayer selló las visitas realizadas. Una entrega fuera de la atención sería
//     un dato que se contradice con el recorrido de la misma visita.
//   · Los dos triggers de la 0050 exigen que el medicamento esté asignado al protocolo Y habilitado y ACTIVO
//     para el paciente. Tres pacientes de ACT18301 terminaron el estudio y hoy no tienen ninguna asignada: se
//     les da de alta lo que el listado dice que recibieron y se apaga al cerrar el bloque — que es exactamente
//     lo que pasó (la tuvieron, ya no). Sólo se apaga lo que encendió este script, y sólo si la inscripción
//     no sigue activa: a un paciente en curso al que le falte una asignación hay que dejársela puesta.
//   · El reporte se cierra en 'evolucionado', que es la etapa final (0090) y la que hace que la visita pase a
//     «completa». El sello queda fechado en la fecha real + el plazo del reporte, nunca después de ahora: un
//     reporte evolucionado en el futuro es una fecha que no ocurrió.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSheets } from '../carga-visitas-historicas/parse-xlsx.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const XLSX = process.argv[2]
if (!XLSX) {
  console.error('Uso: node generar.mjs "<ruta al Excel de pacientes>"')
  process.exit(1)
}

function fallar(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

// ---- Configuración ---------------------------------------------------------------------------

const PROTOCOLOS = {
  ACT18301: 'ACT18301',
  LTS17231: 'LTS17231',
  ENDURA: '222714',
  Victorion: 'CKJX839D12302',
}

// Misma errata que corrige pacientes-prueba-real/generar.mjs, por el mismo motivo: la V1 de AGUERO en
// LTS17231 trae el IVRS de MUÑOZ PAMPILLON. Acá importa igual, porque esa visita lleva medicación.
// Si se corrige en origen, la entrada deja de encontrar filas y no hace nada.
const ERRATAS_IVRS = {
  'LTS17231|032001520002|AGUERO': '032001520003',
}

// Lo que se lee DENTRO del paréntesis de «Medicacion Real» → nombre EXACTO del catálogo de Farmacia.
// El orden importa: se prueba de arriba abajo y gana el primero, así que «neumoterol 160» tiene que estar
// antes que cualquier regla más corta que también empiece con «neumoterol».
// El script se frena si un token no cae en ninguna, así que un texto nuevo no pasa en silencio.
const TOKENS = [
  [/^frevia/, 'Frevia 160/4,5 mcg'],
  [/^salbutamol/, 'Salbutral 100 mcg'],
  [/^salbutral/, 'Salbutral 100 mcg'],
  [/^neumocort\s*plus/, 'Neumocort Plus 200/6 mcg'],
  [/^neumoterol\s*160/, 'Neumoterol 160/4,5 mcg'],
  [/^neumoterol\s*200/, 'Neumoterol 200/6 mcg'],
  // Neumoterol viene en 160/4,5 (aerosol) y 200/6 (cápsulas). «aerosol» es la primera, y es la que dicen
  // las otras visitas del mismo paciente. Decisión del Director; sale en el informe.
  [/^neumoterol\s*aerosol/, 'Neumoterol 160/4,5 mcg'],
  [/^trelegy/, 'Trelegy Ellipta (92) 92/55/22 mcg'],
  [/^seretide/, 'Seretide Diskus 250/50 mcg'],
  [/^symbicort/, 'Symbicort 160/4,5 mcg'],
  [/^norgestrel/, 'Norgestrel Plus 0,15/0,03 mg'],
]

// El token que se mapeó por la regla del aerosol, para avisarlo. Se llena al parsear.
const AVISOS = []

// Marca de la carga: es lo que hace idempotente al script (un pedido que ya la tiene no se vuelve a crear)
// y lo que deja encontrar después TODO lo que entró por acá. No cambiarla entre corridas.
const MARCA = 'Carga histórica de entregas (listado del sitio, 2026-09-15)'
const PORQUE_SIN_LOTES =
  'Sin renglones ni movimiento de stock: la entrega ocurrió antes de que Farmacia llevara el circuito en ' +
  'Spira y el listado no registra el lote. El comprobante no tiene código porque nunca se emitió.'

// ---- Lectura ---------------------------------------------------------------------------------

const hojas = readSheets(XLSX)
const filasDe = (nombre) => {
  const h = hojas[nombre]
  if (!h) fallar(`El Excel no tiene la hoja «${nombre}».`)
  return h.rows.slice(1).filter((r) => r.some((c) => String(c).trim()))
}
const listado = filasDe('Listado de visitas')

/** «Se entrega medicación de mantenimiento (Frevia + salbutamol).» → ['Frevia 160/4,5 mcg', 'Salbutral 100 mcg'] */
function medicamentosDe(texto, donde) {
  const m = /\(([^)]*)\)/.exec(texto)
  if (!m) fallar(`${donde}: no encuentro el paréntesis con la medicación en «${texto}».`)
  const tokens = m[1]
    .split(/\s*\+\s*|\s+y\s+/i)
    .map((s) => s.trim().replace(/\.$/, '').toLowerCase())
    .filter(Boolean)
  if (!tokens.length) fallar(`${donde}: el paréntesis vino vacío en «${texto}».`)
  const nombres = []
  for (const t of tokens) {
    const hit = TOKENS.find(([re]) => re.test(t))
    if (!hit) fallar(`${donde}: no sé qué medicamento es «${t}» (de «${texto}»). Sumalo a TOKENS.`)
    if (/^neumoterol\s*aerosol/.test(t)) AVISOS.push(`${donde} · «${t}» se mapea a ${hit[1]}`)
    if (!nombres.includes(hit[1])) nombres.push(hit[1])
  }
  return nombres
}

const entregas = []
for (const [protoExcel, ivrs, apellido, , , , visita, , , , real, estadoVisita, , medicacion] of listado) {
  const texto = String(medicacion ?? '').trim()
  if (!texto) continue
  const protocolo = PROTOCOLOS[protoExcel]
  if (!protocolo) fallar(`Protocolo desconocido en el listado: «${protoExcel}».`)
  const crudo = String(ivrs).trim()
  const codigo = ERRATAS_IVRS[`${protocolo}|${crudo}|${String(apellido).trim().toUpperCase()}`] ?? crudo
  const m = /^V(\d+)\b/.exec(String(visita))
  if (!m) fallar(`${protocolo} ${codigo}: no reconozco la visita «${visita}».`)
  const code = `V${m[1]}`
  const donde = `${protocolo} ${codigo} ${code}`
  // Una entrega sin visita hecha no es una entrega: sería un comprobante colgado de una fecha que no pasó.
  if (!real) fallar(`${donde}: tiene medicación entregada y la visita no tiene fecha real.`)
  if (String(estadoVisita) !== 'Realizada') fallar(`${donde}: tiene medicación entregada y dice «${estadoVisita}».`)
  if (entregas.some((e) => e.protocolo === protocolo && e.ivrs === codigo && e.code === code))
    fallar(`${donde}: la visita aparece dos veces con medicación.`)
  entregas.push({ protocolo, ivrs: codigo, code, texto, medicamentos: medicamentosDe(texto, donde) })
}

if (!entregas.length) fallar('El listado no trae ninguna visita con medicación entregada.')

// ---- Resumen para la consola y los comentarios -----------------------------------------------

const porProtocolo = {}
for (const e of entregas) {
  const r = (porProtocolo[e.protocolo] ??= { entregas: 0, pacientes: new Set(), medicamentos: new Set() })
  r.entregas++
  r.pacientes.add(e.ivrs)
  for (const m of e.medicamentos) r.medicamentos.add(m)
}
const resumenTexto = Object.entries(porProtocolo)
  .map(([p, r]) => `${p.padEnd(14)} ${String(r.entregas).padStart(3)} entregas · ${r.pacientes.size} pacientes · ${r.medicamentos.size} medicamentos`)
  .join('\n')

// ---- Emisión ---------------------------------------------------------------------------------

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

// OJO: el alcance del cierre de procedimientos son los CUATRO protocolos de la prueba real, y NO los que
// tienen entregas. No es lo mismo: Victorion no entrega nada y es justo el que más visitas viejas tiene para
// cerrar (las 246 con fecha provisoria). Sacar la lista de `entregas` lo dejaba afuera entero — lo encontró el
// banco de pruebas con PGlite, no la lectura.
const codigos = [...new Set(Object.values(PROTOCOLOS))]

function molde(aplicar) {
  const titulo = aplicar ? '2 · APLICAR' : '1 · SIMULAR (no guarda nada)'
  return `-- Spira · Entregas de medicación y cierre de procedimientos — ${titulo}
-- ============================================================================
-- GENERADO por supabase/scripts/entregas-y-procedimientos/generar.mjs desde el listado del sitio. No editar
-- a mano. ⚠️ TRAE DATOS PERSONALES: no se commitea ni se comparte (out/ está en .gitignore).
--
-- ORDEN EN PROD:
--   1. renumerar-lts17231/out/2-aplicar.sql      (los seis IVRS nuevos de LTS17231)
--   2. pacientes-prueba-real/out/2-aplicar.sql   (fechas reales nuevas y cronograma de la 707408)
--   3. out/1-simular.sql de acá → leer el informe (sale como «error» a propósito: es el deshacer)
--   4. out/2-aplicar.sql de acá
--   Si falta alguno de los anteriores, esto se frena solo en la precondición.
--
-- ${aplicar
    ? 'APLICA. Un único bloque do: o entra entero o no entra nada. Idempotente: correrlo dos veces deja lo mismo.'
    : 'SIMULA. Hace todo y lo deshace al final con raise exception: el mensaje ES el informe.'}
--
-- QUÉ HACE:
--   1 · Las entregas de medicación que el listado registra visita por visita, como pedido + dispensación
--       entregada SIN LOTES (ver el porqué en el generador y en las notas de cada pedido).
--   2 · Tilda TODOS los procedimientos y da por evolucionados TODOS los reportes de las visitas con fecha
--       real, MENOS las últimas dos de cada inscripción, que el Director revisa a mano.
--
-- LO QUE TRAE EL LISTADO:
${resumenTexto.replace(/^/gm, '--   ')}
--
-- NO TOCA: stock, lotes, recepciones, las fechas de las visitas, los comentarios, ni las visitas de
-- protocolos que no sean ${codigos.join(', ')}.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
-- ============================================================================

do $carga$
declare
  v_aplicar  boolean := ${aplicar};
  v_datos    jsonb := ${lit(JSON.stringify(entregas))}::jsonb;
  v_marca    text := ${lit(MARCA)};
  v_porque   text := ${lit(PORQUE_SIN_LOTES)};
  v_protos   text[] := array[${codigos.map(lit).join(', ')}];
  v_by       uuid;
  v_by_name  text;
  v_txt      text;
  v_n        int;
  v_e        record;
  v_vid      uuid;
  v_eid      uuid;
  v_fecha    date;
  v_ts       timestamptz;
  v_rid      uuid;
  v_mid      uuid;
  v_med      text;
  v_informe  text;
begin
  -- 0 · Precondiciones. Todo lo que puede frenar la carga se revisa ANTES de escribir una fila. -----------

  select string_agg(distinct c, ', ') into v_txt from unnest(v_protos) as c
  where not exists (select 1 from public.protocols p where p.code = c);
  if v_txt is not null then
    raise exception 'No encontré estos protocolos: %. No se cambió nada.', v_txt;
  end if;

  -- Cada entrega tiene que caer en una visita PROGRAMADA que exista y tenga fecha real. Si falla en masa,
  -- casi seguro falta correr pacientes-prueba-real (los IVRS de LTS17231 cambiaron el 2026-09-15).
  select string_agg(x.protocolo || ' ' || x.ivrs || ' ' || x.code, ', '), count(*) into v_txt, v_n
  from jsonb_to_recordset(v_datos) as x(protocolo text, ivrs text, code text)
  where not exists (
    select 1 from public.patient_visits pv
    join public.enrollments e        on e.id = pv.enrollment_id
    join public.protocols p          on p.id = e.protocol_id
    join public.visit_definitions vd on vd.id = pv.visit_def_id
    where p.code = x.protocolo and e.ivrs_code = x.ivrs
      and upper(btrim(vd.code)) = x.code and pv.kind = 'programada' and pv.real_date is not null);
  if v_txt is not null then
    raise exception 'Estas % visitas del listado no están en Spira con fecha real: %. ¿Corriste antes pacientes-prueba-real/out/2-aplicar.sql con el listado del 2026-09-15? No se cambió nada.', v_n, v_txt;
  end if;

  select string_agg(distinct m.nombre, ', ') into v_txt
  from jsonb_to_recordset(v_datos) as x(medicamentos jsonb)
  cross join lateral jsonb_array_elements_text(x.medicamentos) as m(nombre)
  where not exists (select 1 from public.medications md where lower(btrim(md.name)) = lower(btrim(m.nombre)));
  if v_txt is not null then
    raise exception 'Estos medicamentos no están en el catálogo de Farmacia: %. No se cambió nada.', v_txt;
  end if;

  -- Autor de las filas nuevas: el editor corre como postgres, sin auth.uid(). Mismo criterio que las
  -- migraciones (0061, 0089) y que la carga de ayer. El audit_log igual registra db_role = postgres.
  select u.id, u.full_name into v_by, v_by_name
  from public.users u join public.user_module_roles r on r.user_id = u.id
  where r.module = 'gerencia' order by u.created_at limit 1;
  if v_by is null then select u.id, u.full_name into v_by, v_by_name from public.users u order by u.created_at limit 1; end if;
  if v_by is null then raise exception 'No hay usuarios a quién atribuir la carga.'; end if;
  v_by_name := coalesce(v_by_name, 'Sistema');

  create temp table _linea      (n serial, seccion int, texto text) on commit drop;
  create temp table _cuenta     (protocolo text, cosa text) on commit drop;
  -- Lo que este script encendió, para poder apagar EXACTAMENTE eso y nada más.
  create temp table _encendidas (enrollment_id uuid, medication_id uuid) on commit drop;
  -- El alcance del cierre de procedimientos, resuelto una sola vez contra la base.
  create temp table _cierre (
    visit_id uuid primary key, enrollment_id uuid, visit_def_id uuid, protocolo text,
    ivrs text, paciente text, code text, real_date date, rn int) on commit drop;


  -- 1 · Asignaciones de medicación que faltan --------------------------------------------------------------
  -- Los dos triggers de la 0050 (check_request_item_protocol) exigen que el medicamento esté asignado al
  -- protocolo Y habilitado y ACTIVO para el paciente. Sin esto, el renglón del pedido no entra.

  insert into public.protocol_medications (protocol_id, medication_id)
  select distinct e.protocol_id, md.id
  from jsonb_to_recordset(v_datos) as x(protocolo text, ivrs text, medicamentos jsonb)
  cross join lateral jsonb_array_elements_text(x.medicamentos) as m(nombre)
  join public.protocols p    on p.code = x.protocolo
  join public.enrollments e  on e.protocol_id = p.id and e.ivrs_code = x.ivrs
  join public.medications md on lower(btrim(md.name)) = lower(btrim(m.nombre))
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 then insert into _linea (seccion, texto) values (1, format('%s medicamentos asignados a su protocolo', v_n)); end if;

  insert into _encendidas (enrollment_id, medication_id)
  select distinct e.id, md.id
  from jsonb_to_recordset(v_datos) as x(protocolo text, ivrs text, medicamentos jsonb)
  cross join lateral jsonb_array_elements_text(x.medicamentos) as m(nombre)
  join public.protocols p    on p.code = x.protocolo
  join public.enrollments e  on e.protocol_id = p.id and e.ivrs_code = x.ivrs
  join public.medications md on lower(btrim(md.name)) = lower(btrim(m.nombre))
  where not exists (select 1 from public.patient_medications pm
                    where pm.enrollment_id = e.id and pm.medication_id = md.id and pm.active);

  insert into public.patient_medications (enrollment_id, medication_id, assigned_by, active)
  select en.enrollment_id, en.medication_id, v_by, true from _encendidas en
  on conflict (enrollment_id, medication_id) do update set active = true;

  insert into _linea (seccion, texto)
  select 1, format('%s %s · se habilita %s para poder registrar la entrega%s',
                   p.code, e.ivrs_code, md.name,
                   case when e.status = 'activo' then ' (la inscripción sigue activa: queda habilitada)'
                        else ' y se vuelve a apagar al cerrar' end)
  from _encendidas en
  join public.enrollments e  on e.id = en.enrollment_id
  join public.protocols p    on p.id = e.protocol_id
  join public.medications md on md.id = en.medication_id;


  -- 2 · Las entregas --------------------------------------------------------------------------------------
  for v_e in
    select x.* from jsonb_to_recordset(v_datos) as x(protocolo text, ivrs text, code text, texto text, medicamentos jsonb)
    order by x.protocolo, x.ivrs, length(x.code), x.code
  loop
    select pv.id, pv.enrollment_id, pv.real_date into v_vid, v_eid, v_fecha
    from public.patient_visits pv
    join public.enrollments e        on e.id = pv.enrollment_id
    join public.protocols p          on p.id = e.protocol_id
    join public.visit_definitions vd on vd.id = pv.visit_def_id
    where p.code = v_e.protocolo and e.ivrs_code = v_e.ivrs
      and upper(btrim(vd.code)) = v_e.code and pv.kind = 'programada' and pv.real_date is not null;

    -- 09:30: entre la llegada (09:00) y el fin de atención (10:00) con que la carga de ayer selló las
    -- visitas realizadas. Una entrega fuera de la atención contradiría el recorrido de su propia visita.
    v_ts := (v_fecha + time '09:30') at time zone 'America/Argentina/Buenos_Aires';

    -- Idempotencia: la marca en las notas. Si ya está, esta visita ya pasó por acá.
    if exists (select 1 from public.dispensation_requests dr
               where dr.visit_id = v_vid and position(v_marca in coalesce(dr.notes, '')) > 0) then
      insert into _cuenta values (v_e.protocolo, 'entregas que ya estaban');
      continue;
    end if;

    -- El pedido queda 'atendida': la farmacéutica lo resolvió (hay dispensación colgando). El texto del
    -- sitio va primero, entero y sin tocar — es la fuente —, y debajo por qué esta carga no tiene lotes.
    insert into public.dispensation_requests (visit_id, requested_by, status, source, notes, created_at, updated_at)
    values (v_vid, v_by, 'atendida', 'manual',
            concat_ws(E'\\n', v_e.texto, v_marca || '. ' || v_porque), v_ts, v_ts)
    returning id into v_rid;

    for v_med in select m.nombre from jsonb_array_elements_text(v_e.medicamentos) as m(nombre) loop
      select md.id into v_mid from public.medications md where lower(btrim(md.name)) = lower(btrim(v_med));
      insert into public.dispensation_request_items (request_id, medication_id, quantity) values (v_rid, v_mid, 1);
      insert into _cuenta values (v_e.protocolo, 'renglones pedidos');
    end loop;

    -- La entrega. delivered_at explícito: set_delivered_at (0003) es BEFORE UPDATE y no corre en un insert.
    insert into public.dispensations (request_id, executed_by, status, delivered_at, notes, created_at, updated_at)
    values (v_rid, v_by, 'entregada', v_ts, v_marca || '. ' || v_porque, v_ts, v_ts);

    insert into _cuenta values (v_e.protocolo, 'entregas nuevas');
  end loop;


  -- 3 · Apagar lo que se encendió sólo para que entraran los renglones -------------------------------------
  -- Sólo lo que encendió este script, y sólo si la inscripción ya no sigue: a un paciente en curso al que le
  -- faltaba la asignación hay que dejársela puesta (y eso ya salió en el informe, arriba).
  update public.patient_medications pm set active = false
  from _encendidas en join public.enrollments e on e.id = en.enrollment_id
  where pm.enrollment_id = en.enrollment_id and pm.medication_id = en.medication_id and e.status <> 'activo';
  get diagnostics v_n = row_count;
  if v_n > 0 then insert into _linea (seccion, texto) values (1, format('%s asignaciones vuelven a quedar inactivas', v_n)); end if;


  -- 4 · El alcance del cierre de procedimientos ------------------------------------------------------------
  -- Sale de la BASE y no del Excel (decisión del Director): entran todas las visitas con fecha real, incluidas
  -- las 246 de Victorion que la carga de ayer creó con fecha provisoria.
  -- rn = 1 y 2 son las dos últimas de cada inscripción por fecha real: ésas las revisa el Director a mano.
  -- El desempate por sort_order importa cuando dos visitas comparten el día (pasa: V0 y V1 de la 707407).
  insert into _cierre (visit_id, enrollment_id, visit_def_id, protocolo, ivrs, paciente, code, real_date, rn)
  select pv.id, pv.enrollment_id, pv.visit_def_id, p.code, e.ivrs_code, pa.full_name,
         coalesce(upper(btrim(vd.code)), '(suelta)'), pv.real_date,
         row_number() over (partition by pv.enrollment_id
                            order by pv.real_date desc, coalesce(vd.sort_order, 0) desc, pv.id)
  from public.patient_visits pv
  join public.enrollments e on e.id = pv.enrollment_id
  join public.protocols p   on p.id = e.protocol_id
  join public.patients pa   on pa.id = e.patient_id
  left join public.visit_definitions vd on vd.id = pv.visit_def_id
  where p.code = any(v_protos) and pv.real_date is not null;

  -- Tildar los procedimientos. completed_at = la fecha real de la visita a las 10:00 (el fin de atención con
  -- que quedaron selladas): el plazo de los reportes se cuenta desde acá, así que ponerlo en now() haría nacer
  -- vencido todo lo que se cierre.
  insert into public.visit_procedure_completions (visit_id, procedure_id, completed_by, completed_at)
  select c.visit_id, pa.procedure_id, v_by, (c.real_date + time '10:00') at time zone 'America/Argentina/Buenos_Aires'
  from _cierre c
  join public.protocol_activities pa on pa.visit_def_id = c.visit_def_id
  where c.rn > 2
  on conflict (visit_id, procedure_id) do nothing;
  get diagnostics v_n = row_count;
  insert into _linea (seccion, texto) values (2, format('%s procedimientos tildados', v_n));

  -- Dar los reportes por evolucionados. 'evolucionado' es la etapa final (0090) y la única que deja la visita
  -- en «completa». La fecha del sello: la real + el plazo del reporte, nunca después de ahora — un reporte
  -- evolucionado con fecha futura es una fecha que no ocurrió.
  insert into public.report_status (visit_id, report_definition_id, stage, updated_by, updated_by_name, updated_at)
  select c.visit_id, rd.id, 'evolucionado', v_by, v_by_name,
         least(((c.real_date + time '10:00') at time zone 'America/Argentina/Buenos_Aires')
               + (coalesce(rd.eta_hours, 0) * interval '1 hour'), now())
  from _cierre c
  join public.protocol_activities pa  on pa.visit_def_id = c.visit_def_id
  join public.enrollments e           on e.id = c.enrollment_id
  join public.protocol_procedures pp  on pp.protocol_id = e.protocol_id and pp.procedure_id = pa.procedure_id
  join public.report_definitions rd   on rd.protocol_procedure_id = pp.id
  where c.rn > 2
  on conflict (visit_id, report_definition_id) do update
    set stage = 'evolucionado', updated_by = excluded.updated_by,
        updated_by_name = excluded.updated_by_name, updated_at = excluded.updated_at
    where public.report_status.stage is distinct from 'evolucionado';
  get diagnostics v_n = row_count;
  insert into _linea (seccion, texto) values (2, format('%s reportes dados por evolucionados', v_n));


  -- 5 · Lo que hay que mirar ------------------------------------------------------------------------------

  -- Visitas alcanzadas cuyo cronograma no tiene ningún procedimiento: no hay nada que tildar y la visita ya
  -- estaba «completa». No es un error; es para que el número de arriba no sorprenda.
  select count(*) into v_n from _cierre c
  where c.rn > 2 and not exists (select 1 from public.protocol_activities pa where pa.visit_def_id = c.visit_def_id);
  if v_n > 0 then
    insert into _linea (seccion, texto) values (3, format('%s visitas alcanzadas no tienen procedimientos en su cronograma: no había nada que tildar', v_n));
  end if;

  -- Visitas sueltas (VNP, retest) con fecha real: cuentan para las «últimas dos» porque son visitas que el
  -- paciente hizo, pero no cuelgan de un cronograma y por eso no tienen procedimientos que cerrar.
  select count(*) into v_n from _cierre c where c.visit_def_id is null;
  if v_n > 0 then
    insert into _linea (seccion, texto) values (3, format('%s visitas sueltas (sin cronograma) con fecha real: entran en el conteo de las últimas dos y no tienen procedimientos', v_n));
  end if;

${AVISOS.map((a) => `  insert into _linea (seccion, texto) values (3, ${lit(a)});`).join('\n')}

  -- Las dos últimas de cada inscripción, que quedan SIN cerrar para que el Director las revise.
  insert into _linea (seccion, texto)
  select 4, format('%s %s · %s · %s del %s', c.protocolo, c.ivrs, c.paciente, c.code, to_char(c.real_date, 'DD/MM/YYYY'))
  from _cierre c where c.rn <= 2;


  -- 6 · Informe -------------------------------------------------------------------------------------------
  select concat_ws(E'\\n',
    case when v_aplicar then 'CARGA APLICADA.' else 'SIMULACIÓN — NO SE GUARDÓ NADA. Si el informe está bien, corré out/2-aplicar.sql.' end,
    '',
    '== Entregas ==',
    coalesce((select string_agg(t.linea, E'\\n' order by t.protocolo) from (
       select c.protocolo, c.protocolo || ': ' || string_agg(c.cosa || ' ' || c.n, ' · ' order by c.cosa) as linea
       from (select protocolo, cosa, count(*) as n from _cuenta group by 1, 2) c group by c.protocolo) t), '(ninguna)'),
    '',
    '== Medicación asignada para poder registrarlas ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 1), '(ninguna)'),
    '',
    '== Procedimientos y reportes ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 2), '(nada)'),
    format('visitas con fecha real: %s · alcanzadas (se cierran): %s · excluidas por ser de las dos últimas: %s',
           (select count(*) from _cierre), (select count(*) from _cierre where rn > 2), (select count(*) from _cierre where rn <= 2)),
    '',
    '== Para mirar ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 3), '(nada)'),
    '',
    '== Las dos últimas de cada paciente, que quedan para revisar a mano ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 4), '(ninguna)')
  ) into v_informe;

  if not v_aplicar then
    raise exception '%', v_informe;
  end if;
end
$carga$;
${aplicar ? `
-- Control. Tiene que dar: las entregas cargadas, y ninguna visita vieja en «con pendientes» salvo las dos
-- últimas de cada inscripción (que son las que el Director revisa a mano).
select p.code as protocolo,
       count(distinct d.id)                                                          as entregas_cargadas,
       count(distinct d.id) filter (where d.delivered_at is null)                    as entregas_sin_fecha,
       count(distinct pv.id) filter (where pv.real_date is not null)                 as visitas_realizadas,
       count(distinct pv.id) filter (where vpv.computed_status = 'completa')         as visitas_completas,
       count(distinct pv.id) filter (where vpv.computed_status = 'realizada')        as visitas_con_pendientes
from public.protocols p
join public.enrollments e   on e.protocol_id = p.id
join public.patient_visits pv on pv.enrollment_id = e.id
join public.v_patient_visits vpv on vpv.id = pv.id
left join public.dispensation_requests dr on dr.visit_id = pv.id
     and position(${lit(MARCA)} in coalesce(dr.notes, '')) > 0
left join public.dispensations d on d.request_id = dr.id
where p.code in (${codigos.map(lit).join(', ')})
group by p.code
order by p.code;
` : ''}`
}

mkdirSync(resolve(aqui, 'out'), { recursive: true })
writeFileSync(resolve(aqui, 'out/1-simular.sql'), molde(false), 'utf8')
writeFileSync(resolve(aqui, 'out/2-aplicar.sql'), molde(true), 'utf8')

console.log('✓ out/1-simular.sql y out/2-aplicar.sql generados.\n')
console.log(resumenTexto)
console.log(`\n${entregas.length} entregas · ${entregas.reduce((a, e) => a + e.medicamentos.length, 0)} renglones`)
if (AVISOS.length) console.log('\nAvisos:\n' + AVISOS.map((a) => `  · ${a}`).join('\n'))
