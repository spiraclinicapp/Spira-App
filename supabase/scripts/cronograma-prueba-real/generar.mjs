// generar.mjs — cronograma de la prueba real (LTS17231, ACT18301, 222714, CKJX839D12302).
//
// Lee la hoja «Resumen unificado por visita» del Excel del Director y escribe dos SQL para correr a
// mano en el editor de Supabase, en este orden:
//
//   1-sonda.sql    SÓLO LECTURA. Muestra qué hay hoy y qué va a cambiar, antes de tocar nada.
//   2-aplicar.sql  Pisa el cronograma (visitas, semana/día, ventana, IP) y los procedimientos de las
//                  visitas de los cuatro estudios. Un solo bloque `do`: o entra entero o no entra nada.
//
// El Excel NO trae datos de pacientes (sólo el cronograma del protocolo), por eso vive en el repo. El
// que traiga pacientes no: se ignora en .gitignore, igual que los de carga-visitas-historicas/.
//
// Uso:  node supabase/scripts/cronograma-prueba-real/generar.mjs
//
// Decisiones del Director (2026-09-14), que el Excel no resolvía:
//   · ENDURA es el 222714. El Excel lo rotula con CKJX839D12302, que es el código de Victorion.
//   · «Entrega producto en investigación» se marca donde la hoja CRUDA («Cronograma») dice
//     «Administración del IMP» o «Administración del tratamiento del estudio».
//   · Ventana ±3 días en las visitas de tratamiento (la que ya usaban ACT18301 y LTS17231).
//   · Los procedimientos viejos de los cuatro estudios se BORRAN aunque tengan reportes configurados.
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSheets } from '../carga-visitas-historicas/parse-xlsx.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const XLSX = resolve(aqui, 'cronograma-procedimientos-y-dias.xlsx')
const VENTANA_TRATAMIENTO = 3

// Los once procedimientos que pidió el Director, en el orden en que se listan dentro de cada visita.
// `excel` es cómo aparece en la hoja cuando difiere del nombre que va a la base: el Excel escribe
// «Oscilometria» sin tilde y en el catálogo va con tilde. La categoría es una de las siete del
// desplegable (CATEGORIAS en src/views/track/procedimientos/reportes.ts): con otra, no lleva punto.
const PROCEDIMIENTOS = [
  { nombre: 'Cuestionarios', categoria: 'Cuestionarios' },
  { nombre: 'Laboratorio', categoria: 'Laboratorio' },
  { nombre: 'IVRS y Administración del IMP', categoria: 'Medicación' },
  { nombre: 'Cuestionario de HCRU', categoria: 'Cuestionarios' },
  { nombre: 'ECG de 12 derivaciones', categoria: 'Cardio-respiratorio' },
  { nombre: 'Espirometría (Pre)', categoria: 'Cardio-respiratorio' },
  { nombre: 'Espirometría (Post)', categoria: 'Cardio-respiratorio' },
  { nombre: 'FeNO', categoria: 'Cardio-respiratorio' },
  { nombre: 'Oscilometría (Pre)', categoria: 'Cardio-respiratorio', excel: 'Oscilometria (Pre)' },
  { nombre: 'Oscilometría (Post)', categoria: 'Cardio-respiratorio', excel: 'Oscilometria (Post)' },
  { nombre: 'Examen físico completo', categoria: 'Evaluación clínica' },
]

// Etapas, con la misma derivación que el formulario del cronograma (ScheduleDefinitionForm.tsx):
//   screening      role screening,     libre       → nombre «Screening»
//   randomizacion  role randomizacion, libre       → nombre «Randomización» (ancla: offset 0)
//   manual         role comun,         libre       → nombre libre
//   tratamiento    role comun,         automatica  → nombre «W{semana}», se genera al randomizar
//
// `tratamiento` dice de dónde sale el offset de las visitas automáticas. La regla la fija el listado de
// pacientes del sitio (2026-09-14): sus «Fecha estimada» son la fecha de aleatorización + este offset, en
// todos los pacientes, así que Spira calcula las mismas fechas que ya usa el equipo.
//   'semana'      semana × 7. ACT18301 (semana 2 = Día 15 = rando + 14) y LTS17231 (semana 4 = rando + 28).
//   'diaMenosUno' Día − 1. ENDURA: semana 4 = Día 28 = rando + 27 en el listado.
//   'dia'         Día tal cual. Victorion: la columna «Semana» son MESES (3, 9, 15…) y el listado estima
//                 la V2 a rando + 90, la V5 a rando + 630.
//
// Las visitas que no están en `visitas` tienen que ser «Vn» o «Vn (EOT…)»: son de tratamiento.
//
// `extras`: visitas que el Excel del cronograma no trae y el listado de pacientes sí. ENDURA llega en el
// listado hasta la V28 (semana 104) y el resumen de procedimientos corta en la V16: esas doce entran sin
// procedimientos y sin marca de IP, que el Excel no dice.
const PROTOCOLOS = [
  {
    codigo: 'ACT18301',
    etiqueta: /^ACT18301 /,
    tratamiento: 'semana',
    visitas: {
      'Selección': { code: 'V1', etapa: 'screening' },
      'V2 (Parte A - inclusión)': { code: 'V2', etapa: 'manual', nombre: 'Inclusión (Parte A)' },
      'V3 (Inicio Parte B / Aleatorización)': { code: 'V3', etapa: 'randomizacion' },
      'ETD (Discontinuación anticipada)': { code: 'ETD', etapa: 'manual', nombre: 'Discontinuación anticipada' },
    },
  },
  {
    codigo: 'LTS17231',
    etiqueta: /^LTS17231 /,
    tratamiento: 'semana',
    // Extensión de ACT18301: no hay screening, la V1 (semana 0) es el inicio.
    visitas: { 'V1': { code: 'V1', etapa: 'randomizacion' } },
  },
  {
    codigo: 'CKJX839D12302',
    etiqueta: /^Victorion /,
    tratamiento: 'dia',
    visitas: {
      // El Excel no le da código a la selección. «V0» por paralelo con ENDURA, que sí lo trae.
      'Selección': { code: 'V0', etapa: 'screening' },
      'V1 (Período basal)': { code: 'V1', etapa: 'randomizacion' },
      'FdE (Fin del estudio)': { code: 'FdE', etapa: 'manual', nombre: 'Fin del estudio' },
    },
  },
  {
    codigo: '222714',
    etiqueta: /^ENDURA /,
    tratamiento: 'diaMenosUno',
    extras: {
      despuesDe: 'V16',
      // [visita, día, semana] del listado de pacientes.
      visitas: [
        ['V17', 392, 56], ['V18', 420, 60], ['V19', 448, 64], ['V20', 476, 68], ['V21', 504, 72], ['V22', 546, 78],
        ['V23', 574, 82], ['V24', 602, 86], ['V25', 630, 90], ['V26', 658, 94], ['V27', 686, 98], ['V28', 728, 104],
      ],
    },
    visitas: {
      'V0 (Selección)': { code: 'V0', etapa: 'screening' },
      'Visita 1 (Selección/Preinclusión)': { code: 'V1', etapa: 'manual', nombre: 'Selección / Preinclusión' },
      'V2 (Aleatorización)': { code: 'V2', etapa: 'randomizacion' },
      'WS (Retiro del estudio)': { code: 'WS', etapa: 'manual', nombre: 'Retiro del estudio' },
    },
  },
]

const ETAPAS = {
  screening: { role: 'screening', date_mode: 'libre' },
  randomizacion: { role: 'randomizacion', date_mode: 'libre' },
  manual: { role: 'comun', date_mode: 'libre' },
  tratamiento: { role: 'comun', date_mode: 'automatica' },
}

const entero = (s) => (/^-?\d+$/.test(String(s).trim()) ? Number(s) : null)

// «-59 a -28» → {desde: -59, hasta: -28}; «-28» → {desde: -28, hasta: -28}; «-», «FdE» → null.
function rangoDeDias(s) {
  const t = String(s).trim()
  const m = /^(-?\d+)\s+a\s+(-?\d+)$/.exec(t)
  if (m) return { desde: Number(m[1]), hasta: Number(m[2]) }
  const n = entero(t)
  return n === null ? null : { desde: n, hasta: n }
}

function fallar(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

// ---- Lectura ---------------------------------------------------------------------------------

const hojas = readSheets(XLSX)
const resumen = hojas['Resumen unificado por visita']?.rows
const crudo = hojas['Cronograma']?.rows
if (!resumen || !crudo) fallar('El Excel no tiene las hojas «Resumen unificado por visita» y «Cronograma».')

const porExcel = new Map(PROCEDIMIENTOS.map((p) => [p.excel ?? p.nombre, p.nombre]))

function construir(cfg) {
  const filas = resumen.slice(1).filter((r) => cfg.etiqueta.test(r[0]))
  if (filas.length === 0) fallar(`${cfg.codigo}: no hay filas en el resumen.`)

  // Visitas en el orden en que aparecen (la hoja ya viene cronológica).
  const visitas = new Map()
  for (const [, visita, semana, dia, proc] of filas) {
    if (!visitas.has(visita)) visitas.set(visita, { etiqueta: visita, semana, dia, procs: [] })
    const nombre = porExcel.get(proc.replace(/\s*\(\d+\)\s*$/, '').trim())
    if (!nombre) fallar(`${cfg.codigo} ${visita}: procedimiento desconocido «${proc}».`)
    const v = visitas.get(visita)
    if (!v.procs.includes(nombre)) v.procs.push(nombre)
  }

  // IP: la hoja cruda, que todavía distingue la administración del IVRS.
  const conIp = new Set(
    crudo.slice(1).filter((r) => cfg.etiqueta.test(r[0]) && /^Administración del (IMP|tratamiento del estudio)$/.test(r[4])).map((r) => r[1]),
  )

  let orden = [...visitas.values()]
  if (cfg.extras) {
    const i = orden.findIndex((v) => v.etiqueta === cfg.extras.despuesDe)
    if (i < 0) fallar(`${cfg.codigo}: no está la visita «${cfg.extras.despuesDe}» para colgarle los extras.`)
    const extras = cfg.extras.visitas.map(([etiqueta, dia, semana]) => {
      if (visitas.has(etiqueta)) fallar(`${cfg.codigo}: «${etiqueta}» ya viene en el Excel; sacala de extras.`)
      return { etiqueta, semana, dia, procs: [] }
    })
    orden = [...orden.slice(0, i + 1), ...extras, ...orden.slice(i + 1)]
  }

  const salida = []
  for (const v of orden) {
    let def = cfg.visitas[v.etiqueta]
    if (!def) {
      const m = /^V(\d+)(\s+\((EOT|EOS|EOT\/ETD|EOS\/ESD)\))?$/.exec(v.etiqueta)
      if (!m) fallar(`${cfg.codigo}: no sé qué etapa es la visita «${v.etiqueta}».`)
      def = { code: `V${m[1]}`, etapa: 'tratamiento' }
    }

    let offset, wMenos, wMas, nombre
    if (def.etapa === 'tratamiento') {
      if (cfg.tratamiento === 'semana') {
        const s = entero(v.semana)
        if (s === null) fallar(`${cfg.codigo} ${v.etiqueta}: semana «${v.semana}» no es un número.`)
        offset = s * 7
      } else {
        const d = entero(v.dia)
        if (d === null) fallar(`${cfg.codigo} ${v.etiqueta}: día «${v.dia}» no es un número.`)
        offset = cfg.tratamiento === 'dia' ? d : d - 1
      }
      wMenos = wMas = VENTANA_TRATAMIENTO
      nombre = `W${Math.round(offset / 7)}`
    } else if (def.etapa === 'randomizacion') {
      offset = 0
      wMenos = wMas = 0
      nombre = 'Randomización'
    } else {
      // Libres: el día es referencia. Un rango se guarda entero como offset = inicio y ventana
      // −0/+largo, que es exactamente lo que dice el protocolo. Sin día (ETD, WS, FdE) → 0.
      const r = rangoDeDias(v.dia)
      offset = r ? r.desde : 0
      wMenos = 0
      wMas = r ? r.hasta - r.desde : 0
      nombre = def.etapa === 'screening' ? 'Screening' : def.nombre
    }

    salida.push({
      etiqueta: v.etiqueta,
      code: def.code,
      nombre,
      ...ETAPAS[def.etapa],
      offset_days: offset,
      window_minus: wMenos,
      window_plus: wMas,
      dispenses_ip: conIp.has(v.etiqueta),
      procedimientos: PROCEDIMIENTOS.map((p) => p.nombre).filter((n) => v.procs.includes(n)),
    })
  }

  // Controles: códigos únicos, IP sólo en visitas que existen, tratamiento en orden creciente.
  const codes = salida.map((v) => v.code)
  if (new Set(codes).size !== codes.length) fallar(`${cfg.codigo}: códigos repetidos (${codes.join(', ')}).`)
  for (const e of conIp) if (!visitas.has(e)) fallar(`${cfg.codigo}: la hoja cruda da IP en «${e}», que no está en el resumen.`)
  const auto = salida.filter((v) => v.date_mode === 'automatica').map((v) => v.offset_days)
  if (auto.some((o, i) => i > 0 && o <= auto[i - 1])) fallar(`${cfg.codigo}: los días de tratamiento no crecen (${auto.join(', ')}).`)
  const randos = salida.filter((v) => v.role === 'randomizacion')
  if (randos.length !== 1) fallar(`${cfg.codigo}: tiene que haber exactamente una visita de randomización.`)

  return { codigo: cfg.codigo, visitas: salida.map((v, i) => ({ ...v, orden: i })) }
}

const datos = PROTOCOLOS.map(construir)

// ---- Emisión ---------------------------------------------------------------------------------

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
const codigos = datos.map((p) => lit(p.codigo)).join(', ')
// Normalización de nombres para comparar contra el catálogo: sin tildes, sin mayúsculas, sin
// espacios de más. Así «Oscilometria (Pre)» cargado a mano antes no se duplica.
const norm = (col) => `lower(translate(btrim(${col}), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu'))`

// Guardamos sólo lo que la base necesita: la etiqueta del Excel viaja en los comentarios.
const jsonDatos = JSON.stringify(datos.map((p) => ({ ...p, visitas: p.visitas.map(({ etiqueta, ...v }) => v) })))
const jsonProcs = JSON.stringify(PROCEDIMIENTOS.map(({ nombre, categoria }) => ({ nombre, categoria })))

const resumenComentario = datos
  .map((p) => {
    const lineas = p.visitas.map((v) => {
      const dia = v.date_mode === 'automatica' ? `día ${v.offset_days} ±${v.window_plus}` : `ref ${v.offset_days}${v.window_plus ? ` a ${v.offset_days + v.window_plus}` : ''}`
      return `--   ${v.code.padEnd(4)} ${v.nombre.padEnd(27)} ${v.role.padEnd(13)} ${v.date_mode.padEnd(10)} ${dia.padEnd(16)} ${v.dispenses_ip ? 'IP ' : '   '} ${v.procedimientos.length} proc.  ← ${v.etiqueta}`
    })
    return [`-- ${p.codigo}`, ...lineas].join('\n')
  })
  .join('\n--\n')

const esperado = datos.map((p) => ({
  codigo: p.codigo,
  visitas: p.visitas.length,
  asignados: p.visitas.reduce((n, v) => n + v.procedimientos.length, 0),
  ip: p.visitas.filter((v) => v.dispenses_ip).map((v) => v.code).join(', '),
}))
const esperadoComentario = esperado
  .map((e) => `--   ${e.codigo.padEnd(14)} ${String(e.visitas).padStart(2)} visitas · ${String(e.asignados).padStart(3)} procedimientos asignados · ${PROCEDIMIENTOS.length} del estudio · IP en ${e.ip}`)
  .join('\n')

const valoresDeseados = datos.flatMap((p) => p.visitas.map((v) => `(${lit(p.codigo)}, ${lit(v.code)})`)).join(',\n    ')
const valoresProcs = PROCEDIMIENTOS.map((p) => `(${lit(p.nombre)})`).join(', ')

const cabecera = (titulo) => `-- Spira · Cronograma de la prueba real — ${titulo}
-- ============================================================================
-- GENERADO por supabase/scripts/cronograma-prueba-real/generar.mjs desde
-- cronograma-procedimientos-y-dias.xlsx (hoja «Resumen unificado por visita»). No editar a mano:
-- cambiar el generador y volver a generar.
--
-- Protocolos: ${datos.map((p) => p.codigo).join(', ')}.
-- ============================================================================
`

const sonda = `${cabecera('1 · SONDA (sólo lectura)')}
-- QUÉ HACE: nada. Sólo LEE y muestra, por protocolo, qué hay hoy y qué va a cambiar cuando se corra
-- 2-aplicar.sql. Correla primero y mirá sobre todo:
--   · «Protocolo»: los cuatro tienen que decir «existe». Si uno no existe, el script 2 se frena sin
--     tocar nada; la fila «parecidos» muestra con qué código está cargado.
--   · «Visitas que quedan fuera y NO se borran»: tienen visitas de pacientes colgando, así que el
--     script no puede borrarlas. Las deja al final del cronograma, como manuales (dejan de generarse).
--   · «Reportes que se borran» y «Estados de reporte que se borran»: lo que se pierde al sacar los
--     procedimientos viejos del estudio (decisión del Director).
--
-- Es UNA sola consulta a propósito: el editor de Supabase muestra sólo el resultado de la última.

with deseado(protocolo, code) as (
  values
    ${valoresDeseados}
),
nuevos(nombre) as (
  values ${valoresProcs}
),
proto as (
  select d.protocolo, p.id, p.name
  from (select distinct protocolo from deseado) d
  left join public.protocols p on p.code = d.protocolo
),
defs as (
  select pr.protocolo, vd.id, vd.code, vd.sort_order,
         (select count(*) from public.patient_visits pv where pv.visit_def_id = vd.id) as n_visitas,
         exists (select 1 from deseado d
                 where d.protocolo = pr.protocolo and upper(d.code) = upper(btrim(vd.code))) as sigue
  from proto pr
  join public.visit_definitions vd on vd.protocol_id = pr.id
),
-- El procedimiento que el script 2 va a usar para cada nombre: el más viejo con la misma clave (sin
-- tildes ni mayúsculas). Con el mismo criterio que el script, así lo que la sonda dice que sale del
-- estudio es exactamente lo que sale, aunque el catálogo tenga duplicados.
elegidos as (
  select n.nombre,
         (select p.id from public.procedures p where ${norm('p.name')} = ${norm('n.nombre')}
          order by p.created_at, p.id limit 1) as id
  from nuevos n
),
viejos as (
  select pr.protocolo, pp.id, p.name
  from proto pr
  join public.protocol_procedures pp on pp.protocol_id = pr.id
  join public.procedures p on p.id = pp.procedure_id
  where not exists (select 1 from elegidos e where e.id = pp.procedure_id)
)
select orden, seccion, protocolo, detalle, cantidad from (
  select 1 as orden, 'Protocolo' as seccion, pr.protocolo,
         case when pr.id is null
              then 'NO EXISTE: el script 2 se va a frenar sin tocar nada. Parecidos: '
                   || coalesce((select string_agg(p2.code, ', ') from public.protocols p2
                                where p2.code ilike '%' || regexp_replace(pr.protocolo, '^[A-Za-z]+', '') || '%'
                                   or p2.name ilike '%' || pr.protocolo || '%'), 'ninguno')
              else 'existe · ' || pr.name end as detalle,
         null::bigint as cantidad
  from proto pr

  union all
  select 2, 'Cronograma hoy', pr.protocolo,
         coalesce((select string_agg(coalesce(d.code, '(sin código)'), ', ' order by d.sort_order) from defs d where d.protocolo = pr.protocolo), '(vacío)'),
         (select count(*) from defs d where d.protocolo = pr.protocolo)
  from proto pr

  union all
  select 3, 'Visitas que se actualizan (mismo código)', pr.protocolo,
         coalesce((select string_agg(d.code, ', ' order by d.sort_order) from defs d where d.protocolo = pr.protocolo and d.sigue), '—'),
         (select count(*) from defs d where d.protocolo = pr.protocolo and d.sigue)
  from proto pr

  union all
  select 4, 'Visitas nuevas', pr.protocolo,
         coalesce((select string_agg(x.code, ', ') from deseado x
                   where x.protocolo = pr.protocolo
                     and not exists (select 1 from defs d where d.protocolo = pr.protocolo and upper(btrim(d.code)) = upper(x.code))), '—'),
         (select count(*) from deseado x
           where x.protocolo = pr.protocolo
             and not exists (select 1 from defs d where d.protocolo = pr.protocolo and upper(btrim(d.code)) = upper(x.code)))
  from proto pr

  union all
  select 5, 'Visitas que se borran (sin pacientes)', pr.protocolo,
         coalesce((select string_agg(coalesce(d.code, '(sin código)'), ', ' order by d.sort_order) from defs d
                   where d.protocolo = pr.protocolo and not d.sigue and d.n_visitas = 0), '—'),
         (select count(*) from defs d where d.protocolo = pr.protocolo and not d.sigue and d.n_visitas = 0)
  from proto pr

  union all
  select 6, 'Visitas que quedan fuera y NO se borran (tienen visitas de pacientes)', pr.protocolo,
         coalesce((select string_agg(coalesce(d.code, '(sin código)') || ' (' || d.n_visitas || ')', ', ' order by d.sort_order) from defs d
                   where d.protocolo = pr.protocolo and not d.sigue and d.n_visitas > 0), '—'),
         (select count(*) from defs d where d.protocolo = pr.protocolo and not d.sigue and d.n_visitas > 0)
  from proto pr

  union all
  select 7, 'Pacientes inscriptos (no se tocan)', pr.protocolo,
         'activos: ' || (select count(*) from public.enrollments e where e.protocol_id = pr.id and e.status = 'activo'),
         (select count(*) from public.enrollments e where e.protocol_id = pr.id)
  from proto pr

  union all
  select 8, 'Visitas de pacientes (no se tocan)', pr.protocolo,
         'realizadas: ' || (select count(*) from public.patient_visits pv join public.enrollments e on e.id = pv.enrollment_id
                            where e.protocol_id = pr.id and pv.real_date is not null),
         (select count(*) from public.patient_visits pv join public.enrollments e on e.id = pv.enrollment_id where e.protocol_id = pr.id)
  from proto pr

  union all
  select 9, 'Procedimientos que salen del estudio', pr.protocolo,
         coalesce((select string_agg(v.name, ', ' order by v.name) from viejos v where v.protocolo = pr.protocolo), '—'),
         (select count(*) from viejos v where v.protocolo = pr.protocolo)
  from proto pr

  union all
  select 10, 'Reportes que se borran', pr.protocolo,
         coalesce((select string_agg(v.name || ' › ' || rd.name || ' (' || rd.platform || ')', ', ' order by v.name, rd.name)
                   from viejos v join public.report_definitions rd on rd.protocol_procedure_id = v.id
                   where v.protocolo = pr.protocolo), '—'),
         (select count(*) from viejos v join public.report_definitions rd on rd.protocol_procedure_id = v.id where v.protocolo = pr.protocolo)
  from proto pr

  union all
  select 11, 'Estados de reporte que se borran (de visitas de pacientes)', pr.protocolo,
         'no pendientes: ' || (select count(*) from viejos v join public.report_definitions rd on rd.protocol_procedure_id = v.id
                               join public.report_status rs on rs.report_definition_id = rd.id
                               where v.protocolo = pr.protocolo and rs.stage <> 'pendiente'),
         (select count(*) from viejos v join public.report_definitions rd on rd.protocol_procedure_id = v.id
          join public.report_status rs on rs.report_definition_id = rd.id where v.protocolo = pr.protocolo)
  from proto pr

  union all
  select 12, 'Catálogo global', 'todos',
         'se reusan: ' || coalesce((select string_agg(case when p.name = e.nombre then e.nombre
                                                            else p.name || ' (pasa a «' || e.nombre || '»)' end, ', ')
                                    from elegidos e join public.procedures p on p.id = e.id), '—')
         || ' · se crean: ' || coalesce((select string_agg(e.nombre, ', ') from elegidos e where e.id is null), '—'),
         (select count(*) from elegidos e where e.id is null)
) s
order by orden, protocolo;
`

const aplicar = `${cabecera('2 · APLICAR')}
-- ANTES: correr 1-sonda.sql y leerla.
--
-- QUÉ HACE, por cada uno de los cuatro protocolos:
--   1. Asegura los ${PROCEDIMIENTOS.length} procedimientos en el catálogo global. Si ya hay uno con el mismo nombre
--      —sin importar tildes ni mayúsculas— lo reusa y le deja la grafía pedida.
--   2. Deja esos ${PROCEDIMIENTOS.length} —y sólo esos— como «Procedimientos del estudio». Los viejos se borran CON
--      sus reportes y el estado de esos reportes (decisión del Director, 2026-09-14).
--   3. Pisa el cronograma: cada visita del Excel actualiza la que ya tiene su mismo código (así las
--      visitas de pacientes que cuelgan de ella siguen enganchadas) o se crea. Visita, semana/día,
--      ventana, etapa y la marca de IP quedan como dice el Excel. «Entrega medicación» (base) no se toca.
--   4. Las visitas viejas que no están en el Excel se borran si no tienen visitas de pacientes. Las que
--      sí tienen NO se borran (regla dura: nunca se borran datos de pacientes): pasan al final como
--      manuales, para que no se generen en las randomizaciones nuevas. Aparecen en el resultado.
--   5. Reemplaza los procedimientos de cada visita por los del Excel.
--
-- NO TOCA pacientes, inscripciones ni visitas de pacientes. Las visitas YA generadas no cambian de
-- fecha: si hiciera falta recalcularlas, es el botón de sincronizar del cronograma en la app.
--
-- ATÓMICO: todo va en un único bloque \`do\`, así que o entra entero o no entra nada (en el editor
-- de Supabase las sentencias sueltas NO comparten transacción). IDEMPOTENTE: correrlo dos veces
-- deja lo mismo.
--
-- EL CRONOGRAMA QUE CARGA (código · nombre · rol · modo · día · IP · procedimientos ← Excel):
${resumenComentario}
--
-- RESULTADO ESPERADO (la consulta del final tiene que dar esto):
${esperadoComentario}
--   quedaron_fuera vacío, salvo lo que la sonda haya mostrado en «quedan fuera y NO se borran».

do $cron$
declare
  v_datos jsonb := ${lit(jsonDatos)}::jsonb;
  v_procs jsonb := ${lit(jsonProcs)}::jsonb;
  v_by        uuid;
  v_faltan    text;
  v_mapa      jsonb := '{}'::jsonb;
  v_ids       uuid[] := '{}';
  v_pid       uuid;
  v_x         record;
  v_p         record;
  v_v         record;
  v_proto_id  uuid;
  v_def_id    uuid;
  v_keep      uuid[];
  v_want      uuid[];
  v_n         int;
begin
  -- 0 · Autor de las filas nuevas. El editor corre como postgres, sin auth.uid(), y created_by es
  --     NOT NULL: se resuelve a un usuario real con el mismo criterio que las migraciones (0061, 0089).
  --     El audit_log igual registra db_role = postgres, que es la verdad.
  select u.id into v_by
  from public.users u
  join public.user_module_roles r on r.user_id = u.id
  where r.module = 'gerencia'
  order by u.created_at limit 1;
  if v_by is null then
    select u.id into v_by from public.users u order by u.created_at limit 1;
  end if;
  if v_by is null then
    raise exception 'No hay usuarios en la base: no tengo a quién atribuir los procedimientos nuevos.';
  end if;

  -- 1 · Los cuatro protocolos tienen que existir. Si falta uno se frena ACÁ, antes de escribir nada.
  select string_agg(x.codigo, ', ') into v_faltan
  from jsonb_to_recordset(v_datos) as x(codigo text)
  where not exists (select 1 from public.protocols p where p.code = x.codigo);
  if v_faltan is not null then
    raise exception 'No encontré estos protocolos en Spira: %. No se cambió nada (ver la sonda).', v_faltan;
  end if;

  -- 2 · Catálogo global. Si el nombre ya existe (más de una vez, incluso), se reusa el más viejo.
  for v_x in select * from jsonb_to_recordset(v_procs) as x(nombre text, categoria text) loop
    select p.id into v_pid
    from public.procedures p
    where ${norm('p.name')} = ${norm('v_x.nombre')}
    order by p.created_at, p.id
    limit 1;
    if v_pid is null then
      insert into public.procedures (name, category, requires_dispensation, created_by)
      values (v_x.nombre, v_x.categoria, false, v_by)
      returning id into v_pid;
    else
      -- Reusado: queda con la grafía pedida («LABORATORIO» → «Laboratorio»). Sólo cambia tildes y
      -- mayúsculas —es la misma clave—, así que no le cambia el significado a otro protocolo que lo use.
      -- La categoría se completa si no tenía; si tenía una, se respeta. El where evita escribir (y
      -- dejar una fila en audit_log) cuando ya está bien, para que correrlo dos veces no deje rastro.
      update public.procedures p
         set name     = v_x.nombre,
             category = coalesce(p.category, v_x.categoria)
       where p.id = v_pid
         and (p.name is distinct from v_x.nombre or p.category is null);
    end if;
    v_mapa := v_mapa || jsonb_build_object(v_x.nombre, v_pid);
    v_ids  := v_ids || v_pid;
  end loop;

  -- 3 · Protocolo por protocolo.
  for v_p in select * from jsonb_to_recordset(v_datos) as x(codigo text, visitas jsonb) loop
    select p.id into v_proto_id from public.protocols p where p.code = v_p.codigo;

    -- 3a · Procedimientos del estudio: los once adentro…
    insert into public.protocol_procedures (protocol_id, procedure_id, created_by)
    select v_proto_id, t.pid, v_by
    from unnest(v_ids) as t(pid)
    on conflict (protocol_id, procedure_id) do nothing;

    -- 3b · Las visitas del Excel. Cada escritura compara antes de escribir: correrlo dos veces no
    --      tiene que dejar cientos de filas idénticas en audit_log, que es la traza regulatoria.
    v_keep := '{}';
    for v_v in
      select * from jsonb_to_recordset(v_p.visitas) as y(
        code text, nombre text, role text, date_mode text, offset_days int,
        window_minus int, window_plus int, dispenses_ip boolean, procedimientos jsonb, orden int)
      order by y.orden
    loop
      -- Mismo código = misma visita. Si hubiera dos con el mismo código, se usa la primera del
      -- cronograma y la otra cae en 3c como sobrante.
      v_def_id := null;
      select vd.id into v_def_id
      from public.visit_definitions vd
      where vd.protocol_id = v_proto_id
        and upper(btrim(vd.code)) = upper(v_v.code)
        and vd.id <> all (v_keep)
      order by vd.sort_order, vd.created_at
      limit 1;

      if v_def_id is null then
        insert into public.visit_definitions
          (protocol_id, code, name, visit_type, date_mode, role, offset_days, window_minus, window_plus, sort_order, dispenses_ip)
        values
          (v_proto_id, v_v.code, v_v.nombre, 'presencial', v_v.date_mode, v_v.role, v_v.offset_days,
           v_v.window_minus, v_v.window_plus, v_v.orden, v_v.dispenses_ip)
        returning id into v_def_id;
      else
        update public.visit_definitions vd
           set code         = v_v.code,
               name         = v_v.nombre,
               visit_type   = 'presencial',
               date_mode    = v_v.date_mode,
               role         = v_v.role,
               offset_days  = v_v.offset_days,
               window_minus = v_v.window_minus,
               window_plus  = v_v.window_plus,
               sort_order   = v_v.orden,
               dispenses_ip = v_v.dispenses_ip
         where vd.id = v_def_id
           and (vd.code, vd.name, vd.visit_type, vd.date_mode, vd.role, vd.offset_days,
                vd.window_minus, vd.window_plus, vd.sort_order, vd.dispenses_ip)
               is distinct from
               (v_v.code, v_v.nombre, 'presencial', v_v.date_mode, v_v.role, v_v.offset_days,
                v_v.window_minus, v_v.window_plus, v_v.orden, v_v.dispenses_ip);
      end if;
      v_keep := v_keep || v_def_id;

      -- Procedimientos de la visita: fuera los que no van (y cualquier fila con protocol_id
      -- desalineado de su visita), adentro los que faltan, y el orden sólo si cambió.
      select coalesce(array_agg((v_mapa ->> t.nombre)::uuid), '{}') into v_want
      from jsonb_array_elements_text(v_v.procedimientos) as t(nombre);

      delete from public.protocol_activities pa
      where pa.visit_def_id = v_def_id
        and (pa.procedure_id <> all (v_want) or pa.protocol_id <> v_proto_id);

      insert into public.protocol_activities as pa (protocol_id, visit_def_id, procedure_id, suggested_order)
      select v_proto_id, v_def_id, (v_mapa ->> t.nombre)::uuid, t.ord::int
      from jsonb_array_elements_text(v_v.procedimientos) with ordinality as t(nombre, ord)
      on conflict (visit_def_id, procedure_id) do update
        set suggested_order = excluded.suggested_order
        where pa.suggested_order is distinct from excluded.suggested_order;

      select count(*) into v_n from public.protocol_activities pa where pa.visit_def_id = v_def_id;
      if v_n <> jsonb_array_length(v_v.procedimientos) then
        raise exception '% %: la visita quedó con % procedimientos y tenían que ser %.', v_p.codigo, v_v.code, v_n, jsonb_array_length(v_v.procedimientos);
      end if;
    end loop;

    -- 3c · Visitas viejas que no están en el Excel. Primero se vacían de procedimientos (incluida
    --      cualquier fila con este protocol_id colgada de una visita ajena). Sin visitas de pacientes → se borran. Con
    --      visitas de pacientes → quedan, al final y como manuales: una automática seguiría
    --      generándose en cada randomización nueva, y un screening/randomización seguiría
    --      disparando su alerta al cerrar.
    delete from public.protocol_activities pa
    where (pa.protocol_id = v_proto_id
           or pa.visit_def_id in (select vd.id from public.visit_definitions vd where vd.protocol_id = v_proto_id))
      and pa.visit_def_id <> all (v_keep);

    delete from public.visit_definitions vd
    where vd.protocol_id = v_proto_id
      and vd.id <> all (v_keep)
      and not exists (select 1 from public.patient_visits pv where pv.visit_def_id = vd.id);

    update public.visit_definitions vd
       set date_mode  = 'libre',
           role       = 'comun',
           sort_order = 1000 + vd.sort_order
     where vd.protocol_id = v_proto_id
       and vd.id <> all (v_keep)
       and vd.sort_order < 1000;

    -- 3d · Procedimientos viejos fuera del estudio. Recién ahora: ninguna visita los tiene ya (3b, 3c).
    --      El borrado arrastra en cascada report_definitions → report_status → report_status_history
    --      y alert_dismissals (decisión del Director).
    delete from public.protocol_procedures pp
    where pp.protocol_id = v_proto_id
      and pp.procedure_id <> all (v_ids);
  end loop;
end
$cron$;

-- Control. Comparalo con el RESULTADO ESPERADO de arriba.
select p.code as protocolo,
       (select count(*) from public.visit_definitions vd where vd.protocol_id = p.id and vd.sort_order < 1000) as visitas,
       (select count(*) from public.protocol_activities pa where pa.protocol_id = p.id) as procedimientos_asignados,
       (select count(*) from public.protocol_procedures pp where pp.protocol_id = p.id) as procedimientos_del_estudio,
       (select string_agg(vd.code, ', ' order by vd.sort_order) from public.visit_definitions vd
         where vd.protocol_id = p.id and vd.dispenses_ip and vd.sort_order < 1000) as visitas_con_ip,
       (select string_agg(vd.code || ' ' || vd.name, ' · ' order by vd.sort_order) from public.visit_definitions vd
         where vd.protocol_id = p.id and vd.sort_order < 1000) as cronograma,
       coalesce((select string_agg(coalesce(vd.code, '(sin código)'), ', ' order by vd.sort_order) from public.visit_definitions vd
                  where vd.protocol_id = p.id and vd.sort_order >= 1000), '') as quedaron_fuera
from public.protocols p
where p.code in (${codigos})
order by p.code;
`

// El editor de Supabase rastrea el dollar-quoting SIN ignorar comentarios (CLAUDE.md, 0071): un
// marcador impar parte los cuerpos de función. Se cuenta sobre el texto crudo.
for (const [nombre, sql] of [['1-sonda.sql', sonda], ['2-aplicar.sql', aplicar]]) {
  const marcadores = sql.match(/\$[A-Za-z_]*\$/g) ?? []
  if (marcadores.length % 2 !== 0) fallar(`${nombre}: ${marcadores.length} marcadores de dollar-quote (tiene que ser par).`)
  if (/<[a-z]+>/i.test(sql.replace(/<-|<>|<=|>=/g, ''))) fallar(`${nombre}: quedó un placeholder <...>.`)
  writeFileSync(resolve(aqui, nombre), sql.replace(/\r?\n/g, '\n'))
}

console.log('✓ 1-sonda.sql y 2-aplicar.sql generados.\n')
for (const e of esperado) console.log(`  ${e.codigo.padEnd(14)} ${String(e.visitas).padStart(2)} visitas · ${String(e.asignados).padStart(3)} asignados · IP en ${e.ip}`)
console.log('')
console.log(resumenComentario.replace(/^-- ?/gm, ''))
