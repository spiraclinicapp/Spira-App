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

const isISO = (v) => /^\d{4}-\d{2}-\d{2}/.test(v)
// Parser tolerante: ISO (YYYY-MM-DD) o DD/MM/AAAA con espacios (las V1 de LTS vienen así).
// Devuelve ISO o null. Las notas de texto y los typos irrecuperables caen a null (van al informe).
function parseFecha(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/)
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3]
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2020 && y <= 2035)
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
    enrollments.get(key).visitas.push({
      visitaCol: f.visita,
      defCode: cls?.defCode ?? null,
      role: cls?.role ?? null,
      offsetDays: cls?.offsetDays ?? null,
      esAncla: cls?.esAncla ?? false,
      estExcel: toISO(f.fEst),
      realExcel: toISO(f.fReal),
      crudoReal: f.fReal,   // se conserva el crudo para el informe (notas, typos)
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
    cfg.visitas.forEach((v, i) => {
      out.push(
`insert into public.visit_definitions (protocol_id, code, name, visit_type, date_mode, offset_days, window_minus, window_plus, sort_order, role)
select p.id, ${q(v.code)}, ${q(v.code)}, 'presencial', 'automatica', ${v.offsetDays}, ${v.winMinus}, ${v.winPlus}, ${i}, ${q(v.role)}
from public.protocols p
where p.code = ${q(proto)}
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
    if (e.anclaFecha) {
      out.push(
`insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date, randomization_date, ivrs_code, status)
select pa.id, pr.id, ${sysUser}, ${q(e.anclaFecha)}, ${q(e.anclaFecha)}, ${q(e.ivrs)}, 'activo'
from public.patients pa, public.protocols pr
where pa.code = ${q(e.ivrsMadre)} and pr.code = ${q(e.proto)}
on conflict (patient_id, protocol_id) do update set randomization_date = excluded.randomization_date, ivrs_code = excluded.ivrs_code;`)
    } else if (e.primeraFecha) {
      out.push(`-- SIN RANDOMIZAR (temprano): ${e.proto} IVRS ${e.ivrs} — se enrola sin randomization_date; sus visitas NO se generan (ver informe).`)
      out.push(
`insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date, ivrs_code, status)
select pa.id, pr.id, ${sysUser}, ${q(e.primeraFecha)}, ${q(e.ivrs)}, 'activo'
from public.patients pa, public.protocols pr
where pa.code = ${q(e.ivrsMadre)} and pr.code = ${q(e.proto)}
on conflict (patient_id, protocol_id) do update set ivrs_code = excluded.ivrs_code;`)
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

// Informe de discrepancias (markdown). Nada de esto se carga con dato inventado.
export function informeDiscrepancias(model) {
  const L = ['# Informe de discrepancias — carga de visitas históricas', '',
    'Revisar y resolver ANTES de correr con `commit;`. Nada acá se carga con dato inventado.', '']
  const anioMal = [], notas = [], fechaMala = [], hibrido = [], diferidos = []
  for (const e of model.enrollments) {
    if (!e.anclaFecha) {
      const conReal = e.visitas.filter((v) => v.realExcel).length
      diferidos.push(`- **${e.proto} / IVRS ${e.ivrs}**: sin visita ancla (randomización) con fecha válida → ${e.primeraFecha ? `enrolado sin randomizar (${conReal} visita(s) real no cargada(s))` : 'NO enrolado (ninguna fecha legible)'}.`)
    }
    for (const v of e.visitas) {
      if (v.estExcel && v.realExcel && v.estExcel.slice(0, 4) !== v.realExcel.slice(0, 4))
        anioMal.push(`- ${e.proto} / IVRS ${e.ivrs} / ${v.visitaCol}: est ${v.estExcel} vs real ${v.realExcel}`)
      const crudo = (v.crudoReal ?? '').toString().trim()
      if (crudo && !v.realExcel && !/^\d+$/.test(crudo))
        notas.push(`- ${e.proto} / IVRS ${e.ivrs} / ${v.visitaCol}: Fecha Real = "${crudo}"`)
      if (e.anclaFecha && v.estExcel && v.offsetDays !== null) {
        const d = diffDays(v.estExcel, addDays(e.anclaFecha, v.offsetDays))
        if (Math.abs(d) > 3) hibrido.push(`- ${e.proto} / IVRS ${e.ivrs} / ${v.visitaCol}: estimada del Excel ${v.estExcel} vs Spira ${addDays(e.anclaFecha, v.offsetDays)} (${d > 0 ? '+' : ''}${d} d)`)
      }
    }
  }
  const sec = (t, arr, nota = '') => { L.push(`## ${t} — ${arr.length}`, ''); if (nota) L.push(nota, ''); L.push(arr.length ? arr.join('\n') : '_ninguna_', '') }
  sec('Enrollments diferidos / sin randomizar', diferidos, 'Sin ancla no se genera el cronograma. Pasar la fecha correcta (LTS) o cargar el INICIO cuando ocurra.')
  sec('Año descuadrado (posible typo de año)', anioMal, 'Real un año distinto a la estimada. Confirmar la fecha real correcta.')
  sec('Notas de texto en Fecha Real (no se cargan como fecha)', notas)
  sec('Fechas mal escritas (no parseables)', fechaMala)
  sec('Desvío estimada Excel vs Spira > 3 días', hibrido, 'Spira ancla en la randomización real; el Excel usó otro baseline para estos casos. Revisar si se acepta.')
  return L.join('\n')
}

// 6) Ensamblado: transacción + verificación + dry-run.
export function main(path, outDir) {
  const model = extraer(path)
  const nombres = [...model.personas.values()].map((p) => q(p.nombre)).join(', ')
  const asserts =
`-- Verificación (aborta si los 4 protocolos no existen con esos códigos) --
do $$ declare faltan text;
begin
  select string_agg(c, ', ') into faltan from (values ('CEREN-2'),('ACT18301'),('THESEUS'),('LTS 17231')) as t(c)
    where not exists (select 1 from public.protocols p where p.code = t.c);
  if faltan is not null then raise exception 'Faltan protocolos con esos códigos: %', faltan; end if;
end $$;`
  const control =
`-- SELECTs de control (mirar antes de decidir commit) --
select 'personas'         as k, count(*) from public.patients where full_name in (${nombres})
union all select 'enrollments (4 protos)', count(*) from public.enrollments en join public.protocols p on p.id = en.protocol_id where p.code in ('CEREN-2','ACT18301','THESEUS','LTS 17231')
union all select 'defs (4 protos)',        count(*) from public.visit_definitions vd join public.protocols p on p.id = vd.protocol_id where p.code in ('CEREN-2','ACT18301','THESEUS','LTS 17231')
union all select 'visitas con real',       count(*) from public.patient_visits pv join public.enrollments en on en.id = pv.enrollment_id join public.protocols p on p.id = en.protocol_id where p.code in ('CEREN-2','ACT18301','THESEUS','LTS 17231') and pv.real_date is not null;`
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
