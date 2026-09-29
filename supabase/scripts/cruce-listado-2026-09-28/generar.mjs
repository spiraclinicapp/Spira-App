// generar.mjs — cruce del listado del sitio del 2026-09-28 con lo que ya tiene producción.
//
// TERCERA PASADA sobre la prueba real (LTS17231, ACT18301, 222714 = ENDURA, CKJX839D12302 = Victorion). Las dos
// anteriores (pacientes-prueba-real/ y entregas-y-procedimientos/, 2026-09-15) cargaron el listado de entonces.
// Desde ese día la app se usa en serio: las coordinadoras fechan visitas, tildan procedimientos y piden
// medicación desde Spira. Por eso esto NO es una recarga: cruza el listado nuevo contra la base y sólo completa
// lo que falta, sin pisar lo que alguien registró en la app.
//
// Lee el CSV de la hoja «Listado de visitas» (misma forma que la del Excel del 15/09, fechas dd/mm/aaaa) y
// escribe en out/ dos SQL para el editor de Supabase, en este orden:
//
//   1-simular.sql  Hace todo y al final lo deshace a propósito (raise exception): el editor muestra como
//                  «error» el informe de lo que va a cambiar. No guarda nada.
//   2-aplicar.sql  El mismo código, sin el deshacer. Termina con una consulta de control.
//
// Los dos salen del mismo molde con una sola diferencia (v_aplicar), así que lo que simula es lo que aplica.
//
// ⚠️ out/ está en .gitignore: el informe trae nombres. El CSV no se copia al repo (queda en Descargas).
//
// Uso:  node supabase/scripts/cruce-listado-2026-09-28/generar.mjs "C:/…/Listado_pacientes_y_visitas  - Listado de visitas.csv"
//
// ── Lo que pidió el Director (2026-09-28) ─────────────────────────────────────────────────────────────
//
//   1 · Las visitas nuevas que el listado trae realizadas, y la medicación nueva que registra.
//   2 · En TODAS las visitas realizadas: los procedimientos tildados.
//   3 · El IP como entregado, con un comprobante simulado.
//   4 · Los reportes evolucionados, MENOS en la última visita de cada paciente: ésos los actualiza él a mano
//       al día siguiente. Quedan con el procedimiento tildado y el reporte pendiente, o sea, en el tablero.
//
// ── Cómo se resolvió lo que el pedido no decía (preguntado y elegido por el Director) ──────────────────
//
//   · «LA ÚLTIMA VISITA» ES LA ÚLTIMA DE CADA INSCRIPCIÓN, por fecha real, entre las que deben algún
//     procedimiento. Por inscripción y no por persona, por lo mismo que el 15/09: los pacientes que están en
//     dos protocolos tienen dos recorridos, y contar una en total le cerraría un estudio entero sin mirar.
//     Entre las que deben procedimientos, porque una visita suelta sin nada (una VNP vacía) no tiene reportes
//     que dejar abiertos, y ponerla primera le cerraría al Director justo la que quería revisar.
//
//   · EL IP SE ENTREGA SÓLO DONDE SPIRA LO DA POR ABIERTO: visitas selladas (fechadas desde la 0119, el
//     2026-09-13) cuyo cronograma lleva IP y que no tienen entrega ni cierre. Las históricas no muestran estado
//     de IP (lleva_ip NULL, a propósito: ver pacientes-prueba-real/) y cada entrega resta kits del stock de IP
//     de Farmacia (v_ip_stock), así que cargarlas descontaría kits que nunca salieron de esta farmacia.
//     La visita con un pedido de IP ABIERTO en Farmacia (solicitada / preparando) no se toca: ese pedido lo
//     está atendiendo una persona, y crearle otro al lado lo dejaría colgado. Sale en el informe.
//
//   · SI SPIRA TIENE OTRA FECHA REAL QUE EL LISTADO, GANA SPIRA y se informa. El 15/09 mandaba el Excel,
//     pero entonces la app todavía no se usaba; hoy esa fecha la puso una coordinadora. Lo mismo al revés: una
//     visita que Spira tiene hecha y el listado no, se conserva y se informa.
//
//   · Victorion 4022001 y 4022016: el 2026-09-16 el Director dijo que sus reportes NO estaban evolucionados
//     (cerrar-victorion/). Nada de lo que dijo hoy lo contradice de forma explícita, así que a esos dos se les
//     tildan los procedimientos —eso sí lo pidió para todas— pero los reportes quedan como están, y salen en el
//     informe. Dar por evolucionado un reporte que no lo está es un dato falso en una base auditada; dejarlo
//     pendiente es trabajo a la vista. Si él confirma que ya están, se vacía EXCLUIR_REPORTES y se regenera.
//
// ── Qué es el «comprobante simulado» ──────────────────────────────────────────────────────────────────
//
//   El mismo que deja una entrega de verdad: pedido 'atendida' con includes_ip + dispensación 'entregada' con
//   ip_kits, N° correlativo (serial) y código D-{n}-{ddmmaa}-{iniciales}. Las iniciales son «SIM», no las de
//   nadie: el código queda a la vista en el ticket y en el historial, y así nadie lo confunde con una entrega
//   que hizo una farmacéutica. El correlativo del día sale del mismo contador que usa mark_dispensation_ready
//   (dispensation_daily_counters, 0055), así que no puede chocar con uno real.
//   Un kit por visita: el listado no dice cuántos, y 1 es lo que entrega una visita típica. El informe muestra
//   cómo queda el stock de IP de cada estudio después.
//   SIN CONSTANCIA DEL IRT: la constancia es un archivo en el bucket ip-docs y desde el editor SQL no se puede
//   subir uno. Una fila apuntando a un archivo que no existe rompería el visor. El ticket queda sin adjunto,
//   que es la verdad: no hay papel.
//   Los candados que esto esquiva son los mismos del 15/09 (apply_dispensation_stock y mark_dispensation_ready
//   corren en UPDATE; un insert directo en 'entregada' no los despierta) y por el mismo motivo: no hay stock
//   de base que mover. La marca en las notas deja encontrar después todo lo que entró por acá.
//
// ── Reglas que se fijan acá (cada una con su porqué en el SQL) ────────────────────────────────────────
//
//   · Una visita nueva queda con llegada 09:00 y fin de atención 10:00 de su día, como las dos cargas
//     anteriores. El sello de IP (0119) queda ENCENDIDO: estas visitas son de septiembre de 2026, posteriores
//     a la 0119, y el sello es justamente lo que hace que su IP cuente.
//   · Se tilda la LISTA EFECTIVA de cada visita (v_visit_procedures, 0144/0145): sin lo que pasó a otra visita
//     ni lo que una coordinadora dejó marcado para otro día. Tildar eso lo frena guard_tildar_diferido y, peor,
//     desharía una decisión que alguien tomó en la app. Lo marcado sale en el informe.
//   · Un reporte que alguien ya movió en la app a otra etapa se pasa a 'evolucionado' igual (el pedido es
//     «todos»), pero se cuenta aparte en el informe.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const CSV = process.argv[2]
if (!CSV) {
  console.error('Uso: node generar.mjs "<ruta al CSV «Listado de visitas»>"')
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

// Ver la cabecera. Por IVRS y sin nombre, para que este archivo no lleve datos personales.
const EXCLUIR_REPORTES = [{ protocolo: 'CKJX839D12302', ivrs: '4022001' }, { protocolo: 'CKJX839D12302', ivrs: '4022016' }]

// El paréntesis de «Medicacion Real» → nombre EXACTO del catálogo. Copia de entregas-y-procedimientos/ (mismo
// listado, mismos textos). El script se frena si un token no cae en ninguna, así que un texto nuevo no pasa en
// silencio.
const TOKENS = [
  [/^frevia/, 'Frevia 160/4,5 mcg'],
  [/^salbutamol/, 'Salbutral 100 mcg'],
  [/^salbutral/, 'Salbutral 100 mcg'],
  [/^neumocort\s*plus/, 'Neumocort Plus 200/6 mcg'],
  [/^neumoterol\s*160/, 'Neumoterol 160/4,5 mcg'],
  [/^neumoterol\s*200/, 'Neumoterol 200/6 mcg'],
  [/^neumoterol\s*aerosol/, 'Neumoterol 160/4,5 mcg'],
  [/^trelegy/, 'Trelegy Ellipta (92) 92/55/22 mcg'],
  [/^seretide/, 'Seretide Diskus 250/50 mcg'],
  [/^symbicort/, 'Symbicort 160/4,5 mcg'],
  [/^norgestrel/, 'Norgestrel Plus 0,15/0,03 mg'],
]

// Marca de esta carga: idempotencia (un pedido que ya la tiene no se repite) y rastro para encontrar después
// todo lo que entró por acá. No cambiarla entre corridas.
const MARCA = 'Carga del listado del sitio (2026-09-28)'
const PORQUE =
  'Comprobante simulado: la entrega se registró desde el listado del sitio y no desde Farmacia. ' +
  'Sin renglones de stock ni lotes, y sin constancia del IRT adjunta.'
// Las iniciales del código del comprobante. Ver la cabecera.
const INICIALES = 'SIM'
const KITS_POR_VISITA = 1

// ---- Lectura ---------------------------------------------------------------------------------

function parseCSV(t) {
  const filas = []
  let fila = [], campo = '', comillas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (comillas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++ } else comillas = false
      } else campo += c
    } else if (c === '"') comillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n') { fila.push(campo.replace(/\r$/, '')); filas.push(fila); fila = []; campo = '' }
    else campo += c
  }
  if (campo || fila.length) { fila.push(campo.replace(/\r$/, '')); filas.push(fila) }
  return filas
}

const crudo = parseCSV(readFileSync(CSV, 'utf8').replace(/^\uFEFF/, ''))
const ENCABEZADO = ['Protocolo', 'N° IVRS', 'Apellido', 'Nombre', 'Estado paciente', 'Fecha nac.', 'Visita',
  'Día (cronograma)', 'Semana (cronograma)', 'Fecha estimada', 'Fecha real', 'Estado visita', 'Desvío (días)', 'Medicacion Real']
if (crudo[0].map((s) => s.trim()).join('|') !== ENCABEZADO.join('|'))
  fallar(`El CSV no tiene las columnas esperadas. Vino: ${crudo[0].join(' | ')}`)
const listado = crudo.slice(1).filter((r) => r.some((c) => c.trim()))

// dd/mm/aaaa → aaaa-mm-dd. Vacío → null.
function fecha(v, donde) {
  const s = String(v ?? '').trim()
  if (!s) return null
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s)
  if (!m) fallar(`${donde}: fecha que no entiendo, «${s}».`)
  return `${m[3]}-${m[2]}-${m[1]}`
}

function medicamentosDe(texto, donde) {
  const m = /\(([^)]*)\)/.exec(texto)
  if (!m) fallar(`${donde}: no encuentro el paréntesis con la medicación en «${texto}».`)
  const tokens = m[1].split(/\s*\+\s*|\s+y\s+/i).map((s) => s.trim().replace(/\.$/, '').toLowerCase()).filter(Boolean)
  if (!tokens.length) fallar(`${donde}: el paréntesis vino vacío en «${texto}».`)
  const nombres = []
  for (const t of tokens) {
    const hit = TOKENS.find(([re]) => re.test(t))
    if (!hit) fallar(`${donde}: no sé qué medicamento es «${t}» (de «${texto}»). Sumalo a TOKENS.`)
    if (!nombres.includes(hit[1])) nombres.push(hit[1])
  }
  return nombres
}

// Vacío = la visita no aplica (p. ej. la V18 de alguien que dejó el estudio antes): no se hace nada con ella,
// salvo avisar si Spira la tiene realizada.
const ESTADOS = { Realizada: 'realizada', Programada: 'programada', 'Vencida s/ registro': 'vencida', '': 'sin estado' }
const HOY = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })

const filas = []
const vistas = new Set()
for (const [protoListado, ivrs, apellido, , , , visita, , , , real, estadoVisita, , medicacion] of listado) {
  const protocolo = PROTOCOLOS[protoListado.trim()]
  if (!protocolo) fallar(`Protocolo desconocido en el listado: «${protoListado}».`)
  const codigo = String(ivrs).trim()
  // Screen fail / inactivo sin ninguna visita: el listado deja una fila de relleno. No hay nada que cruzar.
  if (/^\(sin fechas cargadas\)$/i.test(String(visita).trim())) continue
  const m = /^V(\d+)\b/.exec(String(visita).trim())
  if (!m) fallar(`${protocolo} ${codigo}: no reconozco la visita «${visita}».`)
  const code = `V${m[1]}`
  const donde = `${protocolo} ${codigo} ${code}`
  if (vistas.has(donde)) fallar(`${donde}: la visita aparece dos veces en el listado (¿un IVRS mal tipeado? apellido ${apellido}).`)
  vistas.add(donde)
  const estado = ESTADOS[String(estadoVisita).trim()]
  if (!estado) fallar(`${donde}: estado de visita desconocido, «${estadoVisita}».`)
  const r = fecha(real, donde)
  if (estado === 'realizada' && !r) fallar(`${donde}: dice «Realizada» y no trae fecha real.`)
  if (estado !== 'realizada' && r) fallar(`${donde}: trae fecha real y dice «${estadoVisita}».`)
  if (r && r > HOY) fallar(`${donde}: fecha real en el futuro (${r}).`)
  const texto = String(medicacion ?? '').trim()
  // Una entrega sin visita hecha sería un comprobante colgado de una fecha que no pasó.
  if (texto && estado !== 'realizada') fallar(`${donde}: tiene medicación entregada y la visita dice «${estadoVisita}».`)
  filas.push({ p: protocolo, i: codigo, c: code, r, e: estado, t: texto || null, m: texto ? medicamentosDe(texto, donde) : [] })
}

// ---- Resumen para la consola ------------------------------------------------------------------

const resumen = {}
for (const f of filas) {
  const r = (resumen[f.p] ??= { filas: 0, realizadas: 0, entregas: 0 })
  r.filas++
  if (f.e === 'realizada') r.realizadas++
  if (f.t) r.entregas++
}
const resumenTexto = Object.entries(resumen)
  .map(([p, r]) => `${p.padEnd(14)} ${String(r.filas).padStart(4)} visitas · ${String(r.realizadas).padStart(4)} realizadas · ${String(r.entregas).padStart(3)} con medicación`)
  .join('\n')

// ---- Emisión ---------------------------------------------------------------------------------

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
const codigos = Object.values(PROTOCOLOS)

function molde(aplicar) {
  const titulo = aplicar ? '2 · APLICAR' : '1 · SIMULAR (no guarda nada)'
  return `-- Spira · Cruce del listado del 2026-09-28 — ${titulo}
-- ============================================================================
-- GENERADO por supabase/scripts/cruce-listado-2026-09-28/generar.mjs desde el listado del sitio. No editar a
-- mano. ⚠️ El informe trae nombres: no se commitea ni se comparte (out/ está en .gitignore).
--
-- ORDEN: out/1-simular.sql → leer el informe (sale como «error» a propósito: es el deshacer) →
-- out/2-aplicar.sql.
--
-- ${aplicar
    ? 'APLICA. Un único bloque do: o entra entero o no entra nada. Idempotente: correrlo dos veces deja lo mismo.'
    : 'SIMULA. Hace todo y lo deshace al final con raise exception: el mensaje ES el informe.'}
--
-- QUÉ HACE (el porqué de cada regla está en el generador):
--   1 · Fecha las visitas que el listado trae realizadas y Spira tiene pendientes. No pisa ninguna fecha que
--       ya esté en Spira: las diferencias sólo se informan.
--   2 · Registra la medicación del listado que Spira no tiene entregada, y el IP de las visitas que Spira da
--       por «IP sin entregar», como pedido + dispensación entregada con comprobante simulado (código …-${INICIALES}).
--   3 · Tilda los procedimientos de TODAS las visitas realizadas de los cuatro estudios.
--   4 · Da por evolucionados los reportes de todas, MENOS la última visita de cada inscripción.
--
-- LO QUE TRAE EL LISTADO:
${resumenTexto.replace(/^/gm, '--   ')}
--
-- NO TOCA: stock de base, lotes, recepciones, comentarios, pedidos abiertos en Farmacia, ni visitas de
-- protocolos que no sean ${codigos.join(', ')}.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
-- ============================================================================

do $cruce$
declare
  v_aplicar   boolean := ${aplicar};
  v_datos     jsonb := ${lit(JSON.stringify(filas))}::jsonb;
  v_excluir   jsonb := ${lit(JSON.stringify(EXCLUIR_REPORTES))}::jsonb;
  v_marca     text := ${lit(MARCA)};
  v_porque    text := ${lit(PORQUE)};
  v_iniciales text := ${lit(INICIALES)};
  v_kits      int := ${KITS_POR_VISITA};
  v_protos    text[] := array[${codigos.map(lit).join(', ')}];
  v_by        uuid;
  v_by_name   text;
  v_txt       text;
  v_n         int;
  v_x         record;
  v_ts        timestamptz;
  v_dia       date;
  v_nro       int;
  v_rid       uuid;
  v_did       uuid;
  v_mid       uuid;
  v_med       text;
  v_informe   text;
begin
  -- 0 · Precondiciones --------------------------------------------------------------------------------

  select string_agg(distinct c, ', ') into v_txt from unnest(v_protos) as c
  where not exists (select 1 from public.protocols p where p.code = c);
  if v_txt is not null then
    raise exception 'No encontré estos protocolos: %. No se cambió nada.', v_txt;
  end if;

  select string_agg(distinct m.nombre, ', ') into v_txt
  from jsonb_to_recordset(v_datos) as x(m jsonb)
  cross join lateral jsonb_array_elements_text(x.m) as m(nombre)
  where not exists (select 1 from public.medications md where lower(btrim(md.name)) = lower(btrim(m.nombre)));
  if v_txt is not null then
    raise exception 'Estos medicamentos no están en el catálogo de Farmacia: %. No se cambió nada.', v_txt;
  end if;

  -- Autor de las filas nuevas: el editor corre como postgres, sin auth.uid(). Mismo criterio que las dos
  -- cargas anteriores y las migraciones (0061, 0089). El audit_log igual registra db_role = postgres.
  select u.id, u.full_name into v_by, v_by_name
  from public.users u join public.user_module_roles r on r.user_id = u.id
  where r.module = 'gerencia' order by u.created_at limit 1;
  if v_by is null then select u.id, u.full_name into v_by, v_by_name from public.users u order by u.created_at limit 1; end if;
  if v_by is null then raise exception 'No hay usuarios a quién atribuir la carga.'; end if;
  v_by_name := coalesce(v_by_name, 'Sistema');

  create temp table _linea (n serial, seccion int, texto text) on commit drop;
  create temp table _cuenta (protocolo text, cosa text) on commit drop;
  create temp table _encendidas (enrollment_id uuid, medication_id uuid) on commit drop;

  -- El listado, resuelto una sola vez contra la base: cada fila con su visita PROGRAMADA de Spira (o sin ella).
  create temp table _lst on commit drop as
  select x.p as protocolo, x.i as ivrs, x.c as code, x.r::date as real, x.e as estado, x.t as texto, x.m as meds,
         e.id as enrollment_id, pv.id as visit_id, pv.real_date as spira_real,
         (pv.arrived_at is not null or pv.attended_at is not null or pv.ready_at is not null
          or pv.no_show_at is not null) as spira_con_recorrido,
         pa.full_name as paciente
  from jsonb_to_recordset(v_datos) as x(p text, i text, c text, r text, e text, t text, m jsonb)
  left join public.protocols pr   on pr.code = x.p
  left join public.enrollments e  on e.protocol_id = pr.id and e.ivrs_code = x.i
  left join public.patients pa    on pa.id = e.patient_id
  left join lateral (
    select pv.* from public.patient_visits pv
    join public.visit_definitions vd on vd.id = pv.visit_def_id
    where pv.enrollment_id = e.id and pv.kind = 'programada' and upper(btrim(vd.code)) = x.c
    order by pv.real_date nulls last, pv.id limit 1
  ) pv on true;

  -- Un IVRS del listado que no está en Spira no es un error que frene: puede ser un alta que falta hacer.
  -- Pero sí se dice, porque todo lo de ese paciente queda afuera.
  insert into _linea (seccion, texto)
  select 1, format('%s %s · no hay inscripción con ese IVRS en Spira: se saltea (visitas en el listado: %s)', protocolo, ivrs, count(*))
  from _lst where enrollment_id is null group by protocolo, ivrs;


  -- 1 · Fechas reales -------------------------------------------------------------------------------------

  -- Realizada en el listado, pendiente y sin recorrido en Spira → se fecha. Llegada 09:00, fin de atención
  -- 10:00 (sin fin de atención la app la muestra «Sin cerrar»). El sello de IP (0119) queda encendido.
  with fechadas as (
    update public.patient_visits pv
       set real_date = l.real,
           arrived_at = (l.real + time '09:00') at time zone 'America/Argentina/Buenos_Aires',
           ready_at   = (l.real + time '10:00') at time zone 'America/Argentina/Buenos_Aires'
      from _lst l
     where pv.id = l.visit_id and l.estado = 'realizada' and l.spira_real is null and not l.spira_con_recorrido
    returning l.protocolo, l.ivrs, l.code, l.real, l.paciente
  )
  insert into _linea (seccion, texto)
  select 2, format('%s %s · %s · %s realizada el %s', protocolo, ivrs, paciente, code, to_char(real, 'DD/MM/YYYY'))
  from fechadas;

  insert into _linea (seccion, texto)
  select 3, format('%s %s · %s · %s: el listado dice %s y Spira %s — %s',
                   protocolo, ivrs, paciente, code,
                   case when estado = 'realizada' then 'realizada el ' || to_char(real, 'DD/MM/YYYY') else estado end,
                   case when spira_real is not null then 'la tiene realizada el ' || to_char(spira_real, 'DD/MM/YYYY')
                        when visit_id is null then 'no tiene esa visita'
                        else 'la tiene en curso (con llegada o atención registradas, sin fecha real)' end,
                   case when visit_id is null then 'no se crea'
                        else 'se conserva la de Spira' end)
  from _lst
  where enrollment_id is not null
    and ((estado = 'realizada' and (visit_id is null or (spira_real is distinct from real
                                                         and (spira_real is not null or spira_con_recorrido))))
      or (estado <> 'realizada' and spira_real is not null))
  order by protocolo, ivrs, length(code), code;


  -- 2 · Entregas: la medicación del listado y el IP abierto -----------------------------------------------

  -- Qué visita necesita un comprobante y por qué. La medicación: fila del listado con texto, visita fechada en
  -- Spira y sin ninguna dispensación entregada (si ya la tiene, la registró alguien o la carga del 15/09).
  create temp table _entrega (visit_id uuid primary key, enrollment_id uuid, protocolo text, ivrs text, paciente text,
                              code text, fecha date, texto text, meds jsonb, con_ip boolean) on commit drop;

  insert into _entrega
  select l.visit_id, l.enrollment_id, l.protocolo, l.ivrs, l.paciente, l.code, pv.real_date, l.texto, l.meds, false
  from _lst l
  join public.patient_visits pv on pv.id = l.visit_id
  where l.texto is not null and pv.real_date is not null
    and not exists (select 1 from public.dispensation_requests dr join public.dispensations d on d.request_id = dr.id
                    where dr.visit_id = l.visit_id and d.status = 'entregada')
    -- Un pedido en curso en Farmacia lo está atendiendo una persona: crearle una entrega al lado lo deja colgado.
    and not exists (select 1 from public.dispensation_requests dr
                    where dr.visit_id = l.visit_id and dr.status in ('solicitada', 'preparando'));

  insert into _linea (seccion, texto)
  select 4, format('%s %s · %s · %s: el listado registra medicación y Spira ya tiene %s en esa visita — no se repite', l.protocolo, l.ivrs, l.paciente, l.code,
                   case when exists (select 1 from public.dispensation_requests dr
                                     where dr.visit_id = l.visit_id and dr.status in ('solicitada', 'preparando'))
                        then 'un pedido abierto en Farmacia' else 'una entrega' end)
  from _lst l
  where l.texto is not null and l.visit_id is not null
    and not exists (select 1 from _entrega en where en.visit_id = l.visit_id)
    and exists (select 1 from public.patient_visits pv where pv.id = l.visit_id and pv.real_date is not null)
    and not exists (select 1 from public.dispensation_requests dr where dr.visit_id = l.visit_id and position(v_marca in coalesce(dr.notes, '')) > 0);

  insert into _linea (seccion, texto)
  select 4, format('%s %s · %s · %s: el listado registra medicación y la visita no está realizada en Spira — no se registra', l.protocolo, l.ivrs, l.paciente, l.code)
  from _lst l
  where l.texto is not null and l.enrollment_id is not null
    and not exists (select 1 from public.patient_visits pv where pv.id = l.visit_id and pv.real_date is not null);

  -- El IP: lo que v_visit_ip_status (0119, LA regla) da por abierto en una visita sellada y fechada. Se mira
  -- DESPUÉS de fechar, así las visitas nuevas del paso 1 entran. Un pedido de IP en curso en Farmacia se deja.
  insert into _linea (seccion, texto)
  select 5, format('%s %s · %s · %s: tiene un pedido de IP abierto en Farmacia — se deja para que lo entregue Farmacia',
                   p.code, coalesce(e.ivrs_code, pa.code), pa.full_name, coalesce(vd.code, 'visita suelta'))
  from public.v_visit_ip_status s
  join public.patient_visits pv on pv.id = s.visit_id
  join public.enrollments e     on e.id = s.enrollment_id
  join public.protocols p       on p.id = e.protocol_id
  join public.patients pa       on pa.id = e.patient_id
  left join public.visit_definitions vd on vd.id = pv.visit_def_id
  where p.code = any(v_protos) and s.sellada and s.abierto and s.estado = 'pedido';

  insert into _entrega as en
  select s.visit_id, s.enrollment_id, p.code, coalesce(e.ivrs_code, pa.code), pa.full_name,
         coalesce(upper(btrim(vd.code)), 'visita suelta'), pv.real_date, null, '[]'::jsonb, true
  from public.v_visit_ip_status s
  join public.patient_visits pv on pv.id = s.visit_id
  join public.enrollments e     on e.id = s.enrollment_id
  join public.protocols p       on p.id = e.protocol_id
  join public.patients pa       on pa.id = e.patient_id
  left join public.visit_definitions vd on vd.id = pv.visit_def_id
  where p.code = any(v_protos) and s.sellada and s.abierto and s.estado in ('sin_pedir', 'rechazado')
    and pv.real_date is not null
  on conflict (visit_id) do update set con_ip = true;

  -- Los dos triggers de la 0050 exigen que el medicamento esté asignado al protocolo Y habilitado y ACTIVO para
  -- el paciente. Mismo tratamiento que el 15/09: se enciende lo que falta y se apaga al final lo que encendió
  -- este script, salvo que la inscripción siga activa (ahí hay que dejársela puesta).
  insert into public.protocol_medications (protocol_id, medication_id)
  select distinct e.protocol_id, md.id
  from _entrega en
  cross join lateral jsonb_array_elements_text(en.meds) as m(nombre)
  join public.enrollments e  on e.id = en.enrollment_id
  join public.medications md on lower(btrim(md.name)) = lower(btrim(m.nombre))
  on conflict do nothing;

  insert into _encendidas (enrollment_id, medication_id)
  select distinct en.enrollment_id, md.id
  from _entrega en
  cross join lateral jsonb_array_elements_text(en.meds) as m(nombre)
  join public.medications md on lower(btrim(md.name)) = lower(btrim(m.nombre))
  where not exists (select 1 from public.patient_medications pm
                    where pm.enrollment_id = en.enrollment_id and pm.medication_id = md.id and pm.active);

  insert into public.patient_medications (enrollment_id, medication_id, assigned_by, active)
  select x.enrollment_id, x.medication_id, v_by, true from _encendidas x
  on conflict (enrollment_id, medication_id) do update set active = true;

  insert into _linea (seccion, texto)
  select 6, format('%s %s · se habilita %s para poder registrar la entrega%s', p.code, e.ivrs_code, md.name,
                   case when e.status = 'activo' then ' (la inscripción sigue activa: queda habilitada)'
                        else ' y se vuelve a apagar al cerrar' end)
  from _encendidas x
  join public.enrollments e  on e.id = x.enrollment_id
  join public.protocols p    on p.id = e.protocol_id
  join public.medications md on md.id = x.medication_id;

  for v_x in select * from _entrega order by protocolo, ivrs, fecha loop
    -- Idempotencia: si esta visita ya tiene un pedido con la marca, ya pasó por acá.
    if exists (select 1 from public.dispensation_requests dr
               where dr.visit_id = v_x.visit_id and position(v_marca in coalesce(dr.notes, '')) > 0) then
      insert into _cuenta values (v_x.protocolo, 'comprobantes que ya estaban');
      continue;
    end if;

    -- 09:30 del día de la visita: entre la llegada (09:00) y el fin de atención (10:00) de la carga. Si la
    -- visita la atendió alguien en la app, esa hora manda (una entrega antes de la llegada no tiene sentido).
    select coalesce(pv.attended_at, pv.arrived_at, (v_x.fecha + time '09:30') at time zone 'America/Argentina/Buenos_Aires')
      into v_ts from public.patient_visits pv where pv.id = v_x.visit_id;
    v_dia := (v_ts at time zone 'America/Argentina/Buenos_Aires')::date;

    insert into public.dispensation_requests (visit_id, requested_by, status, source, includes_ip, notes, created_at, updated_at)
    values (v_x.visit_id, v_by, 'atendida', 'manual', v_x.con_ip,
            concat_ws(E'\\n', v_x.texto, v_marca || '. ' || v_porque), v_ts, v_ts)
    returning id into v_rid;

    for v_med in select m.nombre from jsonb_array_elements_text(v_x.meds) as m(nombre) loop
      select md.id into v_mid from public.medications md where lower(btrim(md.name)) = lower(btrim(v_med));
      insert into public.dispensation_request_items (request_id, medication_id, quantity) values (v_rid, v_mid, 1);
      insert into _cuenta values (v_x.protocolo, 'renglones de medicación');
    end loop;

    -- El correlativo del día sale del MISMO contador que mark_dispensation_ready (0055): upsert atómico, no
    -- puede repetir un número que ya dio a una entrega real de ese día.
    insert into public.dispensation_daily_counters as c (day, last_number) values (v_dia, 1)
    on conflict (day) do update set last_number = c.last_number + 1
    returning c.last_number into v_nro;

    -- delivered_at y delivered_by explícitos: set_delivered_at (0003/0119) es BEFORE UPDATE y no corre en un insert.
    insert into public.dispensations (request_id, executed_by, status, ip_kits, delivered_at, delivered_by, delivered_by_name,
                                      daily_number, dispensation_code, notes, created_at, updated_at)
    values (v_rid, v_by, 'entregada', case when v_x.con_ip then v_kits end, v_ts, v_by, v_by_name,
            v_nro, format('D-%s-%s-%s', v_nro, to_char(v_dia, 'DDMMYY'), v_iniciales),
            v_marca || '. ' || v_porque, v_ts, v_ts)
    returning id into v_did;

    insert into _cuenta values (v_x.protocolo, case when v_x.con_ip and jsonb_array_length(v_x.meds) > 0 then 'comprobantes con IP y medicación'
                                                    when v_x.con_ip then 'comprobantes con IP'
                                                    else 'comprobantes con medicación' end);
    insert into _linea (seccion, texto)
    select 7, format('%s %s · %s · %s del %s · %s · %s', v_x.protocolo, v_x.ivrs, v_x.paciente, v_x.code,
                     to_char(v_x.fecha, 'DD/MM/YYYY'), d.dispensation_code,
                     concat_ws(' + ', case when v_x.con_ip then v_kits || ' kit de IP' end,
                               (select string_agg(m.nombre, ' + ') from jsonb_array_elements_text(v_x.meds) as m(nombre))))
    from public.dispensations d where d.id = v_did;
  end loop;

  update public.patient_medications pm set active = false
  from _encendidas x join public.enrollments e on e.id = x.enrollment_id
  where pm.enrollment_id = x.enrollment_id and pm.medication_id = x.medication_id and e.status <> 'activo';


  -- 3 · Procedimientos: TODAS las visitas realizadas --------------------------------------------------------
  -- La lista efectiva (v_visit_procedures): sin lo diferido ni lo marcado para otro día. completed_at = fecha
  -- real a las 10:00 (fin de atención): el plazo de los reportes se cuenta desde acá, así que now() haría nacer
  -- vencido todo lo que se cierre.
  create temp table _vis on commit drop as
  select pv.id as visit_id, pv.enrollment_id, p.code as protocolo, coalesce(e.ivrs_code, pa.code) as ivrs,
         pa.full_name as paciente, coalesce(upper(btrim(vd.code)), 'visita suelta') as code, pv.real_date,
         e.protocol_id,
         exists (select 1 from public.v_visit_procedures vp where vp.visit_id = pv.id) as debe_algo,
         exists (select 1 from jsonb_to_recordset(v_excluir) as z(protocolo text, ivrs text)
                 where z.protocolo = p.code and z.ivrs = e.ivrs_code) as excluida
  from public.patient_visits pv
  join public.enrollments e on e.id = pv.enrollment_id
  join public.protocols p   on p.id = e.protocol_id
  join public.patients pa   on pa.id = e.patient_id
  left join public.visit_definitions vd on vd.id = pv.visit_def_id
  where p.code = any(v_protos) and pv.real_date is not null;

  -- La última de cada inscripción, entre las que deben algo. El desempate por sort_order importa cuando dos
  -- visitas comparten el día.
  alter table _vis add column ultima boolean not null default false;
  update _vis v set ultima = true
  from (select distinct on (v2.enrollment_id) v2.visit_id
        from _vis v2
        join public.patient_visits pv on pv.id = v2.visit_id
        left join public.visit_definitions vd on vd.id = pv.visit_def_id
        where v2.debe_algo
        order by v2.enrollment_id, v2.real_date desc, coalesce(vd.sort_order, 0) desc, v2.visit_id desc) u
  where v.visit_id = u.visit_id;

  insert into public.visit_procedure_completions (visit_id, procedure_id, completed_by, completed_at)
  select v.visit_id, vp.procedure_id, v_by, (v.real_date + time '10:00') at time zone 'America/Argentina/Buenos_Aires'
  from _vis v
  join public.v_visit_procedures vp on vp.visit_id = v.visit_id
  on conflict (visit_id, procedure_id) do nothing;
  get diagnostics v_n = row_count;
  insert into _linea (seccion, texto) values (8, format('%s procedimientos tildados en %s visitas realizadas', v_n, (select count(*) from _vis)));

  insert into _linea (seccion, texto)
  select 8, format('%s procedimientos quedaron sin tildar porque una coordinadora los dejó marcados para otro día (se respeta)', count(*))
  from _vis v join public.visit_pending_procedures m on m.visit_id = v.visit_id
  having count(*) > 0;


  -- 4 · Reportes: evolucionados, menos la última visita de cada inscripción ----------------------------------
  create temp table _rep on commit drop as
  select v.visit_id, rd.id as report_definition_id, v.real_date, rd.eta_hours, rs.stage as etapa_previa
  from _vis v
  join public.v_visit_procedures vp  on vp.visit_id = v.visit_id
  join public.protocol_procedures pp on pp.protocol_id = v.protocol_id and pp.procedure_id = vp.procedure_id
  join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
  left join public.report_status rs  on rs.visit_id = v.visit_id and rs.report_definition_id = rd.id
  where not v.ultima and not v.excluida;

  insert into _linea (seccion, texto)
  select 8, format('%s reportes pasan a evolucionados (%s estaban pendientes sin fila · %s en otra etapa cargada en la app)',
                   count(*) filter (where etapa_previa is distinct from 'evolucionado'),
                   count(*) filter (where etapa_previa is null),
                   count(*) filter (where etapa_previa is not null and etapa_previa <> 'evolucionado'))
  from _rep;

  -- 'evolucionado' es la etapa final (0090) y la que deja la visita «completa». Sello: fecha real + plazo del
  -- reporte, nunca después de ahora (un reporte evolucionado en el futuro es una fecha que no ocurrió).
  insert into public.report_status (visit_id, report_definition_id, stage, updated_by, updated_by_name, updated_at)
  select r.visit_id, r.report_definition_id, 'evolucionado', v_by, v_by_name,
         least(((r.real_date + time '10:00') at time zone 'America/Argentina/Buenos_Aires')
               + (coalesce(r.eta_hours, 0) * interval '1 hour'), now())
  from _rep r
  where r.etapa_previa is distinct from 'evolucionado'
  on conflict (visit_id, report_definition_id) do update
    set stage = 'evolucionado', updated_by = excluded.updated_by,
        updated_by_name = excluded.updated_by_name, updated_at = excluded.updated_at
    where public.report_status.stage is distinct from 'evolucionado';

  -- La última de cada inscripción: procedimientos tildados, reportes como estaban → al tablero.
  insert into _linea (seccion, texto)
  select 9, format('%s %s · %s · %s del %s · %s reportes sin evolucionar', v.protocolo, v.ivrs, v.paciente, v.code,
                   to_char(v.real_date, 'DD/MM/YYYY'),
                   (select count(*) from public.v_visit_procedures vp
                    join public.protocol_procedures pp on pp.protocol_id = v.protocol_id and pp.procedure_id = vp.procedure_id
                    join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
                    left join public.report_status rs  on rs.visit_id = v.visit_id and rs.report_definition_id = rd.id
                    where vp.visit_id = v.visit_id and rs.stage is distinct from 'evolucionado'))
  from _vis v where v.ultima
  order by v.protocolo, v.ivrs;

  insert into _linea (seccion, texto)
  select 10, format('%s %s · %s: %s visitas con los procedimientos tildados y los reportes SIN tocar (el 16/09 dijiste que no estaban evolucionados)',
                    v.protocolo, v.ivrs, min(v.paciente), count(*))
  from _vis v where v.excluida group by v.protocolo, v.ivrs;


  -- 5 · Cómo queda --------------------------------------------------------------------------------------

  -- El stock de IP de cada estudio después de las entregas: si queda negativo es que Farmacia no cargó en
  -- Spira la recepción de esos kits. No frena la carga (la entrega pasó igual), pero hay que saberlo.
  insert into _linea (seccion, texto)
  select 11, format('%s · recibidos %s · entregados %s · disponibles %s%s', s.protocol_code, s.total_kits,
                    s.kits_entregados, s.kits_disponibles,
                    case when s.kits_disponibles < 0 then ' ⚠ negativo: falta cargar una recepción de IP' else '' end)
  from public.v_ip_stock s where s.protocol_code = any(v_protos);
  insert into _linea (seccion, texto)
  select 11, format('%s · sin ninguna recepción de IP cargada en Spira: sus entregas no se descuentan de ningún stock', c)
  from unnest(v_protos) as c
  where not exists (select 1 from public.v_ip_stock s where s.protocol_code = c);

  -- Visitas realizadas que siguen sin cerrar después de todo esto, fuera de las últimas y los excluidos.
  insert into _linea (seccion, texto)
  select 12, format('%s %s · %s · %s del %s sigue «%s»', v.protocolo, v.ivrs, v.paciente, v.code,
                    to_char(v.real_date, 'DD/MM/YYYY'), vpv.computed_status)
  from _vis v join public.v_patient_visits vpv on vpv.id = v.visit_id
  where not v.ultima and not v.excluida and vpv.computed_status <> 'completa'
  order by v.protocolo, v.ivrs, v.real_date;


  -- 6 · Informe ---------------------------------------------------------------------------------------------
  select concat_ws(E'\\n',
    case when v_aplicar then 'CRUCE APLICADO.' else 'SIMULACIÓN — NO SE GUARDÓ NADA. Si el informe está bien, corré out/2-aplicar.sql.' end,
    '',
    '== Pacientes del listado que no están en Spira ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 1), '(ninguno)'),
    '',
    '== Visitas nuevas que se fechan ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 2), '(ninguna)'),
    '',
    '== Diferencias con Spira (no se tocan) ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 3), '(ninguna)'),
    '',
    '== Comprobantes simulados ==',
    coalesce((select string_agg(t.linea, E'\\n' order by t.protocolo) from (
       select c.protocolo, c.protocolo || ': ' || string_agg(c.cosa || ' ' || c.n, ' · ' order by c.cosa) as linea
       from (select protocolo, cosa, count(*) as n from _cuenta group by 1, 2) c group by c.protocolo) t), '(ninguno)'),
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 7), ''),
    '',
    '== Medicación asignada para poder registrarlas ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 6), '(ninguna)'),
    '',
    '== Entregas que no se registran ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion in (4, 5)), '(ninguna)'),
    '',
    '== Procedimientos y reportes ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 8), '(nada)'),
    '',
    '== La última visita de cada inscripción: reportes para actualizar a mano ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 9), '(ninguna)'),
    '',
    '== Reportes que no se tocan a propósito ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 10), '(ninguno)'),
    '',
    '== Stock de IP después ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 11), '(sin datos)'),
    '',
    '== Visitas realizadas que siguen sin completar (fuera de las últimas y los excluidos) ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 12), '(ninguna)')
  ) into v_informe;

  if not v_aplicar then
    raise exception '%', v_informe;
  end if;
  raise notice '%', v_informe;
end
$cruce$;
${aplicar ? `
-- Control. Tiene que dar: los comprobantes de esta carga, ninguna visita realizada «sin cerrar» salvo la última de
-- cada inscripción (y las de los dos excluidos de Victorion), y ningún IP abierto salvo los que están en Farmacia.
select p.code as protocolo,
       count(distinct d.id)                                                       as comprobantes_de_esta_carga,
       count(distinct d.id) filter (where d.ip_kits is not null)                  as con_ip,
       count(distinct pv.id) filter (where pv.real_date is not null)              as visitas_realizadas,
       count(distinct pv.id) filter (where vpv.computed_status = 'completa')      as visitas_completas,
       count(distinct pv.id) filter (where pv.real_date is not null and vpv.computed_status <> 'completa') as realizadas_sin_completar,
       count(distinct s.visit_id) filter (where s.sellada and s.abierto)          as ip_abiertos
from public.protocols p
join public.enrollments e        on e.protocol_id = p.id
join public.patient_visits pv    on pv.enrollment_id = e.id
join public.v_patient_visits vpv on vpv.id = pv.id
left join public.v_visit_ip_status s on s.visit_id = pv.id
left join public.dispensation_requests dr on dr.visit_id = pv.id
     and position(${lit(MARCA)} in coalesce(dr.notes, '')) > 0
left join public.dispensations d on d.request_id = dr.id
where p.code in (${codigos.map(lit).join(', ')})
group by p.code
order by p.code;
` : ''}`
}

// --out <carpeta>: para el banco de pruebas, que no tiene que pisar lo generado con el listado real.
const iOut = process.argv.indexOf('--out')
const OUT = iOut > 0 ? resolve(process.argv[iOut + 1]) : resolve(aqui, 'out')
mkdirSync(OUT, { recursive: true })
writeFileSync(resolve(OUT, '1-simular.sql'), molde(false), 'utf8')
writeFileSync(resolve(OUT, '2-aplicar.sql'), molde(true), 'utf8')

console.log(`✓ 1-simular.sql y 2-aplicar.sql generados en ${OUT}.\n`)
console.log(resumenTexto)
console.log(`\n${filas.length} visitas en el listado · ${filas.filter((f) => f.t).length} con medicación`)
