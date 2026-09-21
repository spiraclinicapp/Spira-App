#!/usr/bin/env node
// Chequeo del recorte por estudio en Farmacia (docs/plan-estudios-en-farmacia.md, 0139 a 0142).
//
// Recorre las migraciones y resuelve cada objeto por su DEFINICIÓN VIVA —el último evento en orden de
// aplicación: una policy o función redefinida o dropeada después manda sobre la primera—, y sale con
// código 1 si encuentra algo que se escaparía del recorte:
//
//   1. una policy que nombra a Farmacia (has_module / has_role / has_min_role 'pharma') y no lleva
//      pharma_alcanza_*, sobre una tabla que no es de las EXCEPCIONES de abajo;
//   2. una vista viva sobre datos de estudios SIN security_invoker (se saltearía la RLS entera);
//   3. una función security definer que Farmacia puede llamar, sin guarda de alcance, que no está en
//      FUNCIONES_SIN_ALCANCE.
//
// POR QUÉ UN SCRIPT Y NO DOS GREPS: el grep ve la PRIMERA definición y no la viva, no distingue una
// policy de una tabla ya borrada, y no ve funciones. Las cuatro PRs del recorte encontraron las tres
// cosas: policies redefinidas en migraciones posteriores, una tabla dropeada en la 0136, y RPC
// security definer que la RLS no alcanzaba.
//
// Si agregás una tabla o un RPC de Farmacia y esto falla, lo normal es que falte el recorte. Si de
// verdad no cuelga de ningún estudio (un catálogo global), sumalo a la lista con el motivo.
//
// Corre en el CI de cada PR, en su propio job («Alcance de Farmacia», .github/workflows/ci.yml).
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Tablas que no cuelgan de ningún protocolo (0139, "Lo que queda afuera a propósito").
const EXCEPCIONES = new Set([
  'medications', 'drugs', 'medication_codes', 'laboratorios', 'laboratorio_codes', // catálogo global (0032/0033)
  'farmacia_ajustes',                                                               // ajustes del centro (0125)
  'report_definitions', 'report_platforms', 'visit_definitions', 'procedures',       // catálogos de Coordinación
])
// Funciones security definer de Farmacia que no devuelven ni tocan datos de un estudio.
const FUNCIONES_SIN_ALCANCE = new Set([
  'create_drug', 'create_laboratorio', 'create_medication', // catálogo global
  'farmaceuticas_disponibles',                              // devuelve personas (0077)
])
const TABLAS_ESTUDIO = /\b(medication_lots|medication_receptions|reception_items|stock_movements|ip_units|ambulatory_dispensations|dispensation_requests|dispensation_request_items|dispensations|dispensation_items|patient_medications|dispensation_ip_documents|dispensation_habilitaciones|pedidos_medicacion|pedido_medicacion_items|protocol_medications|enrollments|patients|patient_visits|protocols)\b/
const PHARMA = /has_module\('pharma'\)|has_min_role\('pharma'|has_role\('pharma'/

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'supabase/migrations')
const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()

const pol = new Map(), fn = new Map(), vistas = new Map(), tablas = new Set()
const reFn = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?as\s+(\$\w*\$)([\s\S]*?)\3/gi
for (const f of files) {
  const sql = readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n')
  const num = f.slice(0, 4)
  const ev = []
  for (const m of sql.matchAll(reFn)) {
    const cab = m[0].slice(0, m[0].indexOf(m[3]))
    ev.push({ i: m.index, k: 'fn', n: m[1], v: { num, cuerpo: m[4], definer: /security\s+definer/i.test(cab), trigger: /returns\s+trigger/i.test(cab) } })
  }
  for (const m of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?public\.(\w+)\s*\(/gi)) ev.push({ i: m.index, k: 'fn', n: m[1], v: null })
  // Los cuerpos de función tienen `;` adentro: se tapan (con espacios, para no mover las posiciones).
  const s = sql.replace(reFn, (x) => ' '.repeat(x.length))
  for (const m of s.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi)) ev.push({ i: m.index, k: 'tabla', n: m[1], v: true })
  for (const m of s.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?public\.(\w+)/gi)) ev.push({ i: m.index, k: 'tabla', n: m[1], v: null })
  // `storage.objects` también: las constancias de IP y las recetas son archivos, y su policy (0071, en un
  // bloque `do` que NO se tapa arriba) le abría el bucket entero a Farmacia. Fue el único hueco del recorte
  // que no estaba en `public`, y por eso ningún barrido del schema lo veía hasta la 0142.
  for (const m of s.matchAll(/drop\s+policy\s+if\s+exists\s+"([^"]+)"\s+on\s+(public|storage)\.(\w+)/gi)) ev.push({ i: m.index, k: 'pol', n: `${m[2] === 'storage' ? 'storage.' : ''}${m[3]}|${m[1]}`, v: null })
  for (const m of s.matchAll(/(?:create|alter)\s+policy\s+"([^"]+)"\s+on\s+(public|storage)\.(\w+)[^;]*;/gi)) ev.push({ i: m.index, k: 'pol', n: `${m[2] === 'storage' ? 'storage.' : ''}${m[3]}|${m[1]}`, v: { num, texto: m[0] } })
  for (const m of s.matchAll(/create\s+(?:or\s+replace\s+)?view\s+public\.(\w+)([^;]*);/gi)) ev.push({ i: m.index, k: 'vista', n: m[1], v: { num, inv: /security_invoker\s*=\s*(true|on)/i.test(m[2]), texto: m[2] } })
  for (const m of s.matchAll(/drop\s+view\s+(?:if\s+exists\s+)?public\.(\w+)/gi)) ev.push({ i: m.index, k: 'vista', n: m[1], v: null })
  for (const m of s.matchAll(/alter\s+view\s+public\.(\w+)\s+set\s*\(\s*security_invoker\s*=\s*(true|on)/gi)) ev.push({ i: m.index, k: 'invoker', n: m[1] })
  ev.sort((a, b) => a.i - b.i)
  for (const e of ev) {
    if (e.k === 'tabla') { e.v ? tablas.add(e.n) : tablas.delete(e.n); continue }
    if (e.k === 'invoker') { const v = vistas.get(e.n); if (v) v.inv = true; continue }
    const mapa = e.k === 'fn' ? fn : e.k === 'pol' ? pol : vistas
    e.v === null ? mapa.delete(e.n) : mapa.set(e.n, e.v)
  }
}

const errores = []
let recortadas = 0, excepciones = 0
for (const [k, v] of pol) {
  const t = k.split('|')[0]
  // storage.objects no la crea ninguna migración (es de Supabase): está viva siempre.
  if (!PHARMA.test(v.texto) || !(tablas.has(t) || t.startsWith('storage.'))) continue
  if (/pharma_alcanza_/.test(v.texto)) recortadas++
  else if (EXCEPCIONES.has(t)) excepciones++
  else errores.push(`Policy sin recorte: ${t} · "${k.split('|')[1]}" (${v.num}). Sumale pharma_alcanza_* a la cláusula de Farmacia.`)
}
let vistasEstudio = 0
for (const [n, v] of vistas) {
  if (!TABLAS_ESTUDIO.test(v.texto)) continue
  vistasEstudio++
  if (!v.inv) errores.push(`Vista sin security_invoker: ${n} (${v.num}). Se saltearía la RLS; repetí el with (security_invoker = true).`)
}
let funcionesGuardadas = 0
for (const [n, v] of fn) {
  if (!v.definer || v.trigger || /^pharma_/.test(n) || !PHARMA.test(v.cuerpo)) continue
  if (/pharma_alcanza_/.test(v.cuerpo)) { funcionesGuardadas++; continue }
  if (!FUNCIONES_SIN_ALCANCE.has(n)) errores.push(`RPC de Farmacia sin guarda de alcance: ${n} (${v.num}). Es security definer: la RLS no lo alcanza.`)
}

if (errores.length) {
  console.error('✗ El recorte por estudio en Farmacia tiene huecos:\n  - ' + errores.join('\n  - '))
  process.exit(1)
}
console.log(`✓ Alcance de Farmacia: ${recortadas} policies recortadas, ${excepciones} de catálogo global, ` +
  `${vistasEstudio} vistas security_invoker, ${funcionesGuardadas} RPC con guarda o filtro.`)
