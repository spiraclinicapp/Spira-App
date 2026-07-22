// generar.mjs — transforma el Excel de visitas históricas en el script SQL de carga
// + el informe de discrepancias. Node puro, sin dependencias. NO embebe datos.
//
// Uso:  node generar.mjs "<Excel>.xlsx"            -> imprime stats (check rápido)
//       node generar.mjs "<Excel>.xlsx" --build    -> escribe out/ (SQL + discrepancias)
//
// Los artefactos con PII (out/, el .xlsx) están gitignored: al repo va solo esta lógica.
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { readSheets } from './parse-xlsx.mjs'
import { clasificarVisitaExcel, PROTOCOLOS } from './mapeo.mjs'
import { CORRECCIONES_FECHA_REAL, CORRECCIONES_ANCLA, NOTAS_VISITA, ENROLLMENT_STATUS, MAPEO_CODIGO_PROTOCOLO } from './correcciones.mjs'

// Excel "protocolo" -> code real de protocols en Spira. undefined = sin mapear (se omite de la carga).
const codProd = (proto) => MAPEO_CODIGO_PROTOCOLO[proto]

const isISO = (v) => /^\d{4}-\d{2}-\d{2}/.test(v)
// Parser tolerante: ISO (YYYY-MM-DD) o DD/MM/AAAA con espacios (las V1 de LTS vienen así).
// Devuelve ISO o null. Las notas de texto y los typos irrecuperables caen a null (van al informe).
function parseFecha(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  const plausible = (y) => y >= 2020 && y <= 2035   // descarta artefactos de fórmula (1900-xx = INICIO vacío + offset)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return plausible(+s.slice(0, 4)) ? s.slice(0, 10) : null
  const m = s.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/)
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3]
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && plausible(y))
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return null
}
const toISO = parseFecha
// normaliza nombre para deduplicar personas (rollover: 2 IVRS = 1 persona)
const normNombre = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`)
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const diffDays = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)

// ---- Extracción del modelo normalizado ----
export function extraer(path) {
  const R = readSheets(path)['Visitas'].rows
  let lastProto = ''
  const filas = []
  for (let i = 1; i < R.length; i++) {
    const [proto, ivrs, nombre, visita, etEst, fEst, etReal, fReal] = R[i]
    if (!ivrs && !nombre) continue
    const p = proto || lastProto; if (proto) lastProto = proto
    filas.push({ proto: (p || '').trim(), ivrs: String(ivrs).trim(), nombre: nombre.trim(), visita: String(visita).trim(), etEst, fEst, etReal, fReal })
  }
  // enrollments por (ivrs, proto)
  const enrollments = new Map()
  for (const f of filas) {
    const key = `${f.ivrs}|${f.proto}`
    if (!enrollments.has(key)) enrollments.set(key, { ivrs: f.ivrs, proto: f.proto, nombre: f.nombre, visitas: [] })
    const cls = clasificarVisitaExcel(f.proto, f.etReal, f.etEst, f.visita)
    const ck = `${f.proto}|${f.ivrs}|${f.visita}`
    let estExcel = toISO(f.fEst)
    let realExcel = toISO(f.fReal)
    let corregido = null
    if (CORRECCIONES_ANCLA[ck]) { estExcel = CORRECCIONES_ANCLA[ck]; corregido = 'ancla' }        // ancla ilegible → fecha confirmada
    if (CORRECCIONES_FECHA_REAL[ck]) { realExcel = CORRECCIONES_FECHA_REAL[ck]; corregido = 'fecha-real' } // typo de año → corregido
    enrollments.get(key).visitas.push({
      visitaCol: f.visita,
      defCode: cls?.defCode ?? null,
      role: cls?.role ?? null,
      offsetDays: cls?.offsetDays ?? null,
      esAncla: cls?.esAncla ?? false,
      estExcel, realExcel,
      crudoReal: f.fReal,   // se conserva el crudo para el informe (notas, typos)
      nota: NOTAS_VISITA[ck] ?? null,
      corregido,
    })
  }
  // ancla: fecha real de la visita ancla (si falta la real, la estimada)
  // primeraFecha: la fecha parseable más temprana del enrollment (fallback para enrollment_date
  //   cuando no hay ancla pero sí hubo alguna visita, p. ej. solo screening).
  for (const e of enrollments.values()) {
    const a = e.visitas.find((v) => v.esAncla)
    e.anclaFecha = a ? (a.realExcel || a.estExcel) : null
    const fechas = e.visitas.flatMap((v) => [v.realExcel, v.estExcel]).filter(Boolean).sort()
    e.primeraFecha = fechas[0] ?? null
    e.status = ENROLLMENT_STATUS[`${e.proto}|${e.ivrs}`] ?? 'activo'
  }
  // personas: dedup por nombre normalizado (rollover)
  const personas = new Map()
  for (const e of enrollments.values()) {
    const nk = normNombre(e.nombre)
    if (!personas.has(nk)) personas.set(nk, { nombre: e.nombre, ivrsMadre: e.ivrs, nombreKey: nk })
  }
  // cada enrollment apunta al code (IVRS madre) de su persona → linkeo robusto por code único
  // (no por full_name, que puede venir escrito distinto entre estudios del rollover).
  for (const e of enrollments.values()) e.ivrsMadre = personas.get(normNombre(e.nombre)).ivrsMadre
  const stats = {
    filas: filas.length,
    enrollments: enrollments.size,
    personas: personas.size,
    reales: filas.filter((f) => isISO(f.fReal)).length,
    sinAncla: [...enrollments.values()].filter((e) => !e.anclaFecha).length,
    sinDef: [...enrollments.values()].reduce((n, e) => n + e.visitas.filter((v) => !v.defCode).length, 0),
  }
  return { personas, enrollments: [...enrollments.values()], stats }
}

// ---- Emisión SQL (el script corre como superusuario en el SQL editor de Supabase) ----

// 1) visit_definitions (cronograma). Idempotente vía WHERE NOT EXISTS (no hay unique en code).
export function sqlDefiniciones() {
  const out = ['-- 1) visit_definitions (cronograma) por protocolo. Idempotente. --']
  for (const [proto, cfg] of Object.entries(PROTOCOLOS)) {
    const cp = codProd(proto)
    if (!cp) { out.push(`-- (protocolo "${proto}" sin mapear a un code de prod → se omite)`); continue }
    cfg.visitas.forEach((v, i) => {
      out.push(
`insert into public.visit_definitions (protocol_id, code, name, visit_type, date_mode, offset_days, window_minus, window_plus, sort_order, role)
select p.id, ${q(v.code)}, ${q(v.code)}, 'presencial', 'automatica', ${v.offsetDays}, ${v.winMinus}, ${v.winPlus}, ${i}, ${q(v.role)}
from public.protocols p
where p.code = ${q(cp)}
  and not exists (select 1 from public.visit_definitions vd where vd.protocol_id = p.id and vd.code = ${q(v.code)});`)
    })
  }
  return out.join('\n')
}

// 2) patients (dedup) + 3) enrollments (link por code=ivrsMadre; randomization_date genera visitas).
export function sqlPersonasYEnrollments(model) {
  const out = ['-- 2) patients (21 personas; birth_date/sex quedan NULL, no vienen en el Excel) --']
  for (const per of model.personas.values())
    out.push(`insert into public.patients (code, full_name, status) values (${q(per.ivrsMadre)}, ${q(per.nombre)}, 'activo') on conflict (code) do nothing;`)
  out.push('', '-- 3) enrollments. enrolled_by = usuario más antiguo como "sistema" (cambialo por tu id si querés). --')
  const sysUser = '(select id from public.users order by created_at limit 1)'
  for (const e of model.enrollments) {
    const cp = codProd(e.proto)
    if (!cp) { out.push(`-- OMITIDO (protocolo "${e.proto}" sin mapear en prod): IVRS ${e.ivrs}`); continue }
    if (e.anclaFecha) {
      out.push(
`insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date, randomization_date, ivrs_code, status)
select pa.id, pr.id, ${sysUser}, ${q(e.anclaFecha)}, ${q(e.anclaFecha)}, ${q(e.ivrs)}, ${q(e.status)}
from public.patients pa, public.protocols pr
where pa.code = ${q(e.ivrsMadre)} and pr.code = ${q(cp)}
on conflict (patient_id, protocol_id) do update set randomization_date = excluded.randomization_date, ivrs_code = excluded.ivrs_code, status = excluded.status;`)
    } else if (e.primeraFecha) {
      out.push(`-- SIN RANDOMIZAR: ${e.proto} IVRS ${e.ivrs} (status ${e.status}) — sin cronograma generado; su(s) visita(s) real(es) se cargan sueltas abajo.`)
      out.push(
`insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date, ivrs_code, status)
select pa.id, pr.id, ${sysUser}, ${q(e.primeraFecha)}, ${q(e.ivrs)}, ${q(e.status)}
from public.patients pa, public.protocols pr
where pa.code = ${q(e.ivrsMadre)} and pr.code = ${q(cp)}
on conflict (patient_id, protocol_id) do update set ivrs_code = excluded.ivrs_code, status = excluded.status;`)
    } else {
      out.push(`-- DIFERIDO (no cargable): ${e.proto} IVRS ${e.ivrs} — sin ninguna fecha válida (ver informe). NO se enrola.`)
    }
  }
  return out.join('\n')
}

// 4) backfill de real_date sobre las visitas generadas (match por ivrs_code del enrollment + code de la def).
export function sqlBackfill(model) {
  const out = ['-- 4) backfill de real_date (mismo efecto que registerVisit; dispara materialize_checklist) --']
  let n = 0
  for (const e of model.enrollments) {
    if (!codProd(e.proto)) continue
    for (const v of e.visitas) {
      if (!v.realExcel || !v.defCode) continue
      n++
      out.push(
`update public.patient_visits pv set real_date = ${q(v.realExcel)}
from public.enrollments en, public.visit_definitions vd
where pv.enrollment_id = en.id and vd.id = pv.visit_def_id
  and en.ivrs_code = ${q(e.ivrs)} and vd.code = ${q(v.defCode)};`)
    }
  }
  out.unshift(`-- (${n} updates de real_date)`)
  return out.join('\n')
}

// 4b) visitas reales de enrollments SIN randomizar (p. ej. falla de screening): como no hay
// cronograma generado, se insertan directo, kind='programada' con estimated=real (desvío 0).
export function sqlVisitasSueltas(model) {
  const out = []
  let n = 0
  for (const e of model.enrollments) {
    const cp = codProd(e.proto)
    if (!cp || e.anclaFecha || !e.primeraFecha) continue   // solo los enrolados sin randomizar y mapeados
    for (const v of e.visitas) {
      if (!v.realExcel || !v.defCode) continue
      n++
      out.push(
`insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date, real_date${v.nota ? ', notes' : ''})
select en.id, vd.id, 'programada', ${q(v.realExcel)}, ${q(v.realExcel)}${v.nota ? ', ' + q(v.nota) : ''}
from public.enrollments en
  join public.protocols pr on pr.id = en.protocol_id
  join public.visit_definitions vd on vd.protocol_id = pr.id
where en.ivrs_code = ${q(e.ivrs)} and pr.code = ${q(cp)} and vd.code = ${q(v.defCode)}
  and not exists (select 1 from public.patient_visits pv where pv.enrollment_id = en.id and pv.visit_def_id = vd.id);`)
    }
  }
  out.unshift(`-- 4b) visitas sueltas de enrollments sin randomizar (${n}) --`)
  return out.join('\n')
}

// 5) notas de visita (visitas que NO se hicieron: vacaciones / rollover). Van sobre la visita
// generada del cronograma (enrollment randomizado); las sueltas ya llevan su nota en 4b.
export function sqlNotas(model) {
  const out = []
  let n = 0
  for (const e of model.enrollments) {
    if (!e.anclaFecha || !codProd(e.proto)) continue
    for (const v of e.visitas) {
      if (!v.nota || !v.defCode) continue
      n++
      out.push(
`update public.patient_visits pv set notes = ${q(v.nota)}
from public.enrollments en, public.visit_definitions vd
where pv.enrollment_id = en.id and vd.id = pv.visit_def_id
  and en.ivrs_code = ${q(e.ivrs)} and vd.code = ${q(v.defCode)};`)
    }
  }
  out.unshift(`-- 5) notas de visita (${n}) --`)
  return out.join('\n')
}

// Informe de discrepancias (markdown): registro de lo aplicado + casos aceptados/diferidos.
export function informeDiscrepancias(model) {
  const L = ['# Informe de discrepancias — carga de visitas históricas', '',
    'Correcciones aplicadas (confirmadas por el Director, 2026-07-21) + casos aceptados/diferidos. Nada se carga con dato inventado.', '']
  const corrFecha = [], corrAncla = [], notas = [], inactivos = [], diferidos = [], hibrido = [], legitimo = []
  for (const e of model.enrollments) {
    if (e.status !== 'activo')
      inactivos.push(`- **${e.proto} / IVRS ${e.ivrs}**: enrollment cargado como **${e.status}**.`)
    if (!e.anclaFecha) {
      const conReal = e.visitas.filter((v) => v.realExcel).length
      diferidos.push(`- **${e.proto} / IVRS ${e.ivrs}**: sin ancla → ${e.primeraFecha ? `enrolado sin randomizar; ${conReal} visita(s) real cargada(s) suelta(s)` : 'NO enrolado (sin fecha)'}.`)
    }
    for (const v of e.visitas) {
      if (v.corregido === 'fecha-real') corrFecha.push(`- ${e.proto} / IVRS ${e.ivrs} / ${v.visitaCol}: typo de año corregido → real ${v.realExcel}`)
      if (v.corregido === 'ancla') corrAncla.push(`- ${e.proto} / IVRS ${e.ivrs} / ${v.visitaCol}: ancla ilegible corregida → ${v.estExcel}`)
      if (v.nota) notas.push(`- ${e.proto} / IVRS ${e.ivrs} / ${v.visitaCol}: nota "${v.nota}" (visita sin fecha real)`)
      if (v.estExcel && v.realExcel && v.estExcel.slice(0, 4) !== v.realExcel.slice(0, 4) && v.corregido !== 'fecha-real')
        legitimo.push(`- ${e.proto} / IVRS ${e.ivrs} / ${v.visitaCol}: est ${v.estExcel} vs real ${v.realExcel} — cruce legítimo de fin de año, se deja`)
      if (e.anclaFecha && v.estExcel && v.offsetDays !== null) {
        const d = diffDays(v.estExcel, addDays(e.anclaFecha, v.offsetDays))
        if (Math.abs(d) > 3) hibrido.push(`- ${e.proto} / IVRS ${e.ivrs} / ${v.visitaCol}: estimada Excel ${v.estExcel} vs Spira ${addDays(e.anclaFecha, v.offsetDays)} (${d > 0 ? '+' : ''}${d} d)`)
      }
    }
  }
  const sec = (t, arr, nota = '') => { L.push(`## ${t} — ${arr.length}`, ''); if (nota) L.push(nota, ''); L.push(arr.length ? arr.join('\n') : '_ninguna_', '') }
  sec('Correcciones de fecha real aplicadas (typos de año)', corrFecha)
  sec('Correcciones de ancla aplicadas (fecha ilegible)', corrAncla)
  sec('Notas guardadas (visitas no realizadas)', notas)
  sec('Enrollments cargados inactivos', inactivos)
  sec('Enrollments sin randomizar (diferidos)', diferidos, 'Sin ancla no hay cronograma; sus visitas reales se cargan sueltas (estimated=real).')
  sec('Cruce de fin de año legítimo (NO se corrige)', legitimo)
  sec('Desvío estimada Excel vs Spira > 3 días (ACEPTADO)', hibrido, 'Spira ancla en la randomización real; se acepta la versión de Spira.')
  return L.join('\n')
}

// 6) Ensamblado: transacción + verificación + dry-run.
export function main(path, outDir) {
  const model = extraer(path)
  const nombres = [...model.personas.values()].map((p) => q(p.nombre)).join(', ')
  const activos = [...new Set(Object.keys(PROTOCOLOS).map(codProd).filter(Boolean))]   // codes de prod que se cargan
  const inList = activos.map(q).join(', ')
  const asserts =
`-- Verificación (aborta si algún protocolo mapeado no existe en prod) --
do $$ declare faltan text;
begin
  select string_agg(c, ', ') into faltan from (values ${activos.map((c) => `(${q(c)})`).join(', ')}) as t(c)
    where not exists (select 1 from public.protocols p where p.code = t.c);
  if faltan is not null then raise exception 'Faltan protocolos con esos códigos: %', faltan; end if;
end $$;`
  const control =
`-- SELECTs de control (mirar antes de decidir commit) --
select 'personas'         as k, count(*) from public.patients where full_name in (${nombres})
union all select 'enrollments', count(*) from public.enrollments en join public.protocols p on p.id = en.protocol_id where p.code in (${inList})
union all select 'defs',        count(*) from public.visit_definitions vd join public.protocols p on p.id = vd.protocol_id where p.code in (${inList})
union all select 'visitas con real', count(*) from public.patient_visits pv join public.enrollments en on en.id = pv.enrollment_id join public.protocols p on p.id = en.protocol_id where p.code in (${inList}) and pv.real_date is not null;`
  const sql = [
    '-- ============================================================================',
    '-- CARGA DE VISITAS HISTÓRICAS — GENERADO por generar.mjs. NO editar a mano.',
    '-- CONTIENE PII (nombres de paciente): NO commitear este archivo.',
    '-- Requiere la migración 0062 (enrollments.ivrs_code) aplicada.',
    '-- Dry-run: dejar el rollback del final. Para aplicar: cambiar "rollback;" por "commit;".',
    `-- Stats: ${JSON.stringify(model.stats)}`,
    '-- ============================================================================',
    'begin;', '',
    asserts, '',
    sqlDefiniciones(), '',
    sqlPersonasYEnrollments(model), '',
    sqlBackfill(model), '',
    sqlVisitasSueltas(model), '',
    sqlNotas(model), '',
    control, '',
    'rollback; -- <<< cambiar a commit; cuando los conteos cierren',
    '',
  ].join('\n')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(`${outDir}/carga-visitas-historicas.sql`, sql)
  fs.writeFileSync(`${outDir}/discrepancias.md`, informeDiscrepancias(model))
  return model.stats
}

// ---- CLI (pathToFileURL para que ande en Windows: file:///) ----
const invocadoDirecto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invocadoDirecto) {
  const path = process.argv[2]
  if (process.argv.includes('--build')) {
    const outDir = process.argv[4] || new URL('./out', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
    console.log('Escrito en', outDir, '—', main(path, outDir))
  } else {
    console.log(extraer(path).stats)
  }
}
