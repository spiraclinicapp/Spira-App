#!/usr/bin/env node
// Banco de pruebas de la RLS · ¿las migraciones del repo dan las mismas policies que prod?
//
//   node scripts/banco-rls/comparar-con-prod.mjs <policies-de-prod.csv> [--hasta NNNN]
//
// `--hasta` corre las migraciones sólo hasta esa: para un CSV exportado antes de aplicar las últimas
// (o para ver una que está en el repo y todavía no en prod: sin `--hasta` sale como diferencia).
//
// El CSV sale del editor SQL de Supabase (límite en "No limit" y exportado a CSV; copiar desde la grilla
// corta los textos largos):
//
//   select schemaname as schema, tablename as tabla, policyname as nombre,
//          cmd, roles::text as roles, qual, with_check
//   from pg_policies
//   where schemaname in ('public', 'storage')
//   order by schemaname, tablename, policyname;
//
// POR QUÉ: el banco sólo sirve si es fiel. Una policy hecha a mano en el dashboard, o una migración que
// "se corrió" pero no tomó, dejan a prod distinto del repo sin que nada lo avise — y probar contra la
// versión equivocada da un verde que no vale nada. Correlo ANTES de confiar en equivalencia.mjs cada vez
// que pase tiempo desde la última comparación. El 2026-09-28: 136 de 136, cero diferencias.
//
// Sale con código 1 si hay diferencias.
import { readFileSync } from 'node:fs'
import { crearBase } from './base.mjs'

const args = process.argv.slice(2)
const iHasta = args.indexOf('--hasta')
const hasta = iHasta >= 0 ? args[iHasta + 1] : undefined
const archivo = args.find((a, i) => !a.startsWith('--') && i !== iHasta + 1)
if (!archivo) {
  console.error('Uso: node scripts/banco-rls/comparar-con-prod.mjs <policies-de-prod.csv> [--hasta NNNN]')
  process.exit(2)
}

// CSV con comillas dobles y saltos de línea adentro de los campos (los `qual` largos los traen).
function leerCsv(texto) {
  const s = texto.replace(/\r\n/g, '\n')
  const filas = []
  let fila = [], campo = '', entreComillas = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (entreComillas) {
      if (c === '"' && s[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') entreComillas = false
      else campo += c
    } else if (c === '"') entreComillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = '' }
    else campo += c
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila) }
  const [cabecera, ...datos] = filas
  return datos
    .filter((r) => r.length === cabecera.length)
    .map((r) => Object.fromEntries(cabecera.map((h, i) => [h, r[i] === 'null' || r[i] === '' ? null : r[i]])))
}

const clave = (p) => `${p.schema}.${p.tabla} · ${p.nombre}`
const normal = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

const prod = new Map(leerCsv(readFileSync(archivo, 'utf8')).map((p) => [clave(p), p]))
const db = await crearBase({ hasta })
const locales = new Map((await db.query(`
  select schemaname as schema, tablename as tabla, policyname as nombre, cmd, roles::text as roles, qual, with_check
  from pg_policies where schemaname in ('public', 'storage')`)).rows.map((p) => [clave(p), p]))

let diferencias = 0
for (const [k, p] of prod) {
  const l = locales.get(k)
  if (!l) { console.log(`SÓLO EN PROD: ${k}`); diferencias++; continue }
  for (const campo of ['cmd', 'roles', 'qual', 'with_check']) {
    if (normal(p[campo]) !== normal(l[campo])) {
      diferencias++
      console.log(`DISTINTA ${k} [${campo}]\n  prod:  ${normal(p[campo])}\n  repo:  ${normal(l[campo])}`)
    }
  }
}
for (const k of locales.keys()) if (!prod.has(k)) { console.log(`SÓLO EN EL REPO: ${k}`); diferencias++ }

console.log(`\nprod ${prod.size} · repo ${locales.size} · diferencias ${diferencias}`)
process.exit(diferencias ? 1 : 0)
