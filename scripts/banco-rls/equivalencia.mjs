#!/usr/bin/env node
// Banco de pruebas de la RLS · ¿una migración cambia quién ve qué?
//
//   node scripts/banco-rls/equivalencia.mjs <NNNN> [--control] [--traza]
//
// Levanta las migraciones hasta la NNNN-1, siembra datos sintéticos (sembrar.mjs) y compara el ANTES y
// el DESPUÉS de aplicar la NNNN, con cada perfil de PERFILES:
//
//   1. POLICY POR POLICY. Evalúa la expresión de cada policy de public (`qual` y `with_check`) contra
//      una copia sin RLS de su tabla, fila por fila, con la RLS del perfil para todo lo que la expresión
//      consulte adentro. Después de aplicar, evalúa la expresión nueva de las que siguen existiendo.
//      Las filas aceptadas tienen que ser las mismas. Cubre también las de escritura: la expresión es
//      la misma pregunta aunque la policy sea de update o de insert.
//   2. LA FOTO. Lo que cada perfil VE en cada tabla con RLS y en cada vista de public (cantidad de
//      filas y un hash del contenido), antes y después.
//
// Es la prueba de una migración que dice "no cambia quién ve qué" (la 0146 la pasó: 1.944
// comparaciones y 816 fotos, cero diferencias). Si la migración SÍ cambia permisos a propósito, las
// diferencias que lista son la lista de lo que cambió: leéla contra lo que tenía que cambiar.
//
// --control  control negativo: niega a propósito la expresión nueva de una policy y exige que el banco
//            lo detecte. Si no lo detecta, el verde de arriba no vale nada (sale con código 1).
// --traza    muestra cuántas filas quedaron sembradas por tabla.
//
// Lo que NO cubre: storage.objects (las policies de archivos), y lo que no tenga filas sembradas —se
// listan al final—. Sale con código 1 si hay diferencias.
import { crearBase, comoPerfil, migracion } from './base.mjs'
import { sembrar, PERFILES, VOLUMEN_CHICO } from './sembrar.mjs'

const args = process.argv.slice(2)
const numero = args.find((a) => /^\d+$/.test(a))
if (!numero) {
  console.error('Uso: node scripts/banco-rls/equivalencia.mjs <NNNN> [--control] [--traza]')
  process.exit(2)
}
const conControl = args.includes('--control')
const m = migracion(numero)
const anterior = String(Number(m.numero) - 1).padStart(4, '0')

console.log(`Migración ${m.archivo}: base hasta la ${anterior}, sembrado…`)
const db = await crearBase({ hasta: anterior })
const conteo = await sembrar(db, { volumen: VOLUMEN_CHICO, traza: args.includes('--traza') })
const q = async (sql) => (await db.query(sql)).rows
const normal = (s) => (s == null ? null : s.replace(/\s+/g, ' ').trim())

const leerPolicies = async () => new Map((await q(`
  select tablename as tabla, policyname as nombre, cmd, qual, with_check
  from pg_policies where schemaname = 'public'`)).map((p) => [`${p.tabla} · ${p.nombre}`, p]))

// Copias sin RLS de las tablas con policies: la expresión se evalúa contra TODAS las filas, no sólo
// contra las que el perfil ya ve. El alias con el nombre de la tabla hace que `tabla.col` resuelva.
const antesPol = await leerPolicies()
const tablasConPolicies = [...new Set([...antesPol.values()].map((p) => p.tabla))]
await db.exec('create schema copia; grant usage on schema copia to authenticated;')
for (const t of tablasConPolicies) {
  await db.exec(`create table copia.${t} as select * from public.${t}; grant select on copia.${t} to authenticated;`)
}

const evaluar = async (tabla, expr, uid) => {
  try {
    const filas = await comoPerfil(db, uid, `select ctid::text as k from copia.${tabla} as ${tabla} where (${expr}) order by 1`)
    return filas.map((r) => r.k).join(',')
  } catch (e) {
    return `ERROR: ${e.message}`
  }
}

// La foto: tablas con RLS y vistas de public.
const objetosFoto = (await q(`
  select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and ((c.relkind = 'r' and c.relrowsecurity) or c.relkind = 'v') order by 1`))
const foto = async () => {
  const out = {}
  for (const [perfil, uid] of Object.entries(PERFILES)) {
    for (const o of objetosFoto) {
      try {
        const r = await comoPerfil(db, uid, `select count(*)::int n, coalesce(md5(string_agg(x::text, '|' order by x::text)), '-') h from public.${o.relname} x`)
        out[`${perfil} · ${o.relname}`] = `${r[0].n} filas · ${r[0].h.slice(0, 8)}`
      } catch (e) {
        out[`${perfil} · ${o.relname}`] = `ERROR: ${e.message.slice(0, 80)}`
      }
    }
  }
  return out
}

// 1 · Antes.
const antesExpr = {}
for (const [k, p] of antesPol) for (const campo of ['qual', 'with_check']) {
  if (p[campo] == null) continue
  for (const [perfil, uid] of Object.entries(PERFILES)) antesExpr[`${k} · ${campo} · ${perfil}`] = await evaluar(p.tabla, normal(p[campo]), uid)
}
const fotoAntes = await foto()

// 2 · La migración.
await db.exec(m.sql)
const despuesPol = await leerPolicies()

// 3 · Después.
let comparaciones = 0, conFilas = 0, diferencias = 0, reescritas = 0
const salida = []
for (const [k, p] of despuesPol) {
  const a = antesPol.get(k)
  if (!a) continue
  if (normal(a.qual) !== normal(p.qual) || normal(a.with_check) !== normal(p.with_check)) reescritas++
  for (const campo of ['qual', 'with_check']) {
    if (p[campo] == null && a[campo] == null) continue
    if ((p[campo] == null) !== (a[campo] == null)) { diferencias++; salida.push(`CAMBIÓ ${k} · ${campo}: una de las dos versiones no lo tiene`); continue }
    for (const [perfil, uid] of Object.entries(PERFILES)) {
      const clave = `${k} · ${campo} · ${perfil}`
      const nuevo = await evaluar(p.tabla, normal(p[campo]), uid)
      comparaciones++
      if (nuevo && !nuevo.startsWith('ERROR')) conFilas++
      if (nuevo !== antesExpr[clave]) {
        diferencias++
        salida.push(`DISTINTA ${clave}\n    antes:   ${(antesExpr[clave] || '(ninguna fila)').slice(0, 110)}\n    después: ${(nuevo || '(ninguna fila)').slice(0, 110)}`)
      }
    }
  }
}
const nuevas = [...despuesPol.keys()].filter((k) => !antesPol.has(k))
const borradas = [...antesPol.keys()].filter((k) => !despuesPol.has(k))

const fotoDespues = await foto()
// Una foto distinta con la MISMA cantidad de filas casi siempre es de esquema (la migración sumó una
// columna a la tabla o a la vista: la 0145 da eso en patient_visits y v_track_visits). Con OTRA cantidad
// es de permisos: alguien ve más o menos filas que antes.
let fotosDistintas = 0, fotosConOtraCantidad = 0
const filas = (f) => f?.split(' ')[0]
for (const k of Object.keys(fotoAntes)) {
  if (fotoAntes[k] === fotoDespues[k]) continue
  fotosDistintas++
  const otraCantidad = filas(fotoAntes[k]) !== filas(fotoDespues[k])
  if (otraCantidad) fotosConOtraCantidad++
  salida.push(`FOTO DISTINTA ${k}: ${fotoAntes[k]} → ${fotoDespues[k] ?? '(ya no existe)'}` +
    (otraCantidad ? '  ⚠️ CAMBIA LO QUE VE' : '  (mismas filas: columnas o contenido)'))
}

// 4 · Control negativo: una expresión negada a propósito TIENE que dar diferencias.
let controlOk = true
if (conControl) {
  const candidata = [...despuesPol.entries()].find(([k, p]) => p.qual && antesPol.has(k) &&
    Object.entries(PERFILES).some(([perfil]) => antesExpr[`${k} · qual · ${perfil}`]))
  if (!candidata) {
    controlOk = false
    salida.push('CONTROL: no hay ninguna policy con filas aceptadas para negar.')
  } else {
    const [k, p] = candidata
    let detectadas = 0
    for (const [perfil, uid] of Object.entries(PERFILES)) {
      if ((await evaluar(p.tabla, `not (${normal(p.qual)})`, uid)) !== antesExpr[`${k} · qual · ${perfil}`]) detectadas++
    }
    controlOk = detectadas > 0
    salida.push(`CONTROL: negar «${k}» se detectó en ${detectadas} de ${Object.keys(PERFILES).length} perfiles${controlOk ? '' : ' — EL BANCO NO LO VIO'}.`)
  }
}

for (const l of salida.slice(0, 40)) console.log(l)
if (salida.length > 40) console.log(`… y ${salida.length - 40} más.`)

const vacias = tablasConPolicies.filter((t) => conteo[t] === 0)
console.log(`
policies antes ${antesPol.size} · después ${despuesPol.size} · reescritas ${reescritas} · nuevas ${nuevas.length} · borradas ${borradas.length}
comparaciones policy × campo × perfil: ${comparaciones} (con alguna fila aceptada: ${conFilas}) · DIFERENCIAS: ${diferencias}
fotos (${objetosFoto.length} tablas y vistas × ${Object.keys(PERFILES).length} perfiles): ${Object.keys(fotoAntes).length} · DISTINTAS: ${fotosDistintas} (con otra cantidad de filas: ${fotosConOtraCantidad})
tablas con policies y SIN filas sembradas (no prueban nada): ${vacias.join(', ') || '—'}`)
if (nuevas.length) console.log(`policies nuevas (sin "antes" contra qué comparar; revisalas a mano): ${nuevas.join(' | ')}`)
if (borradas.length) console.log(`policies borradas: ${borradas.join(' | ')}`)

process.exit(diferencias || fotosDistintas || !controlOk ? 1 : 0)
