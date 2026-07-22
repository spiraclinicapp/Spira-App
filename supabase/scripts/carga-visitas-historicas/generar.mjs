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

// check rápido por línea de comando (pathToFileURL para que ande en Windows: file:///)
const invocadoDirecto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invocadoDirecto && !process.argv.includes('--build')) {
  console.log(extraer(process.argv[2]).stats)
}
