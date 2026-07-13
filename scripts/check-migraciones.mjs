#!/usr/bin/env node
// Chequeo de drift del schema: cada supabase/migrations/NNNN_*.sql tiene que tener su
// fila en el índice de supabase/README.md (y cada fila su archivo), sin huecos ni números
// repetidos. El índice quedó desactualizado más de una vez; esto corre en CI para que no
// vuelva a pasar. Sale con código 1 y el detalle si hay drift.
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const files = readdirSync(resolve(root, 'supabase/migrations'))
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort()

const readme = readFileSync(resolve(root, 'supabase/README.md'), 'utf8')
// Filas del índice: | NNNN | `nombre.sql` | …  (el nombre va sin el prefijo numérico)
const rows = new Map()
for (const m of readme.matchAll(/^\|\s*(\d{4})\s*\|\s*`([^`]+)`/gm)) rows.set(m[1], m[2])

const errores = []

// Numeración contigua desde 0001 (huecos o duplicados rompen el orden de aplicación).
files.forEach((f, i) => {
  const esperado = String(i + 1).padStart(4, '0')
  if (f.slice(0, 4) !== esperado) {
    errores.push(`Numeración: esperaba ${esperado} y encontré ${f} (hueco o número repetido).`)
  }
})

// Archivo sin fila, o fila que nombra otro archivo.
for (const f of files) {
  const num = f.slice(0, 4)
  const nombre = f.slice(5)
  if (!rows.has(num)) errores.push(`Falta en el índice de supabase/README.md: ${f}`)
  else if (rows.get(num) !== nombre) errores.push(`El índice dice ${num} = \`${rows.get(num)}\` pero el archivo es ${f}.`)
}

// Fila sin archivo.
for (const [num, nombre] of rows) {
  if (!files.includes(`${num}_${nombre}`)) errores.push(`El índice lista ${num} \`${nombre}\` pero el archivo no existe.`)
}

if (errores.length) {
  console.error('✗ Índice de migraciones desincronizado:\n  - ' + errores.join('\n  - '))
  process.exit(1)
}
console.log(`✓ ${files.length} migraciones, índice al día.`)
