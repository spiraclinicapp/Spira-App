#!/usr/bin/env node
// Una copia de una migración SIN NINGÚN COMENTARIO `--`, para pegar en el editor de Supabase.
//
//   node scripts/sql-sin-comentarios.mjs supabase/migrations/NNNN_x.sql <salida.sql>
//
// Por qué existe: dos veces seguidas (la 0160 el 2026-10-14 y la 0161 el 2026-10-16) la copia pegada en el
// editor quedó TODA COMENTADA: el editor dio OK sin ejecutar nada y la sonda se leyó como verde. Una copia
// sin comentarios no puede quedar comentada, y se ve de un vistazo: el primer renglón es SQL, no `--`.
//
// Saca los renglones que son comentario y las colas `-- …` de los renglones con código, sin tocar lo que
// está adentro de un literal entre comillas simples (un `--` adentro de un texto se queda). Junta los
// renglones en blanco seguidos. El SQL que queda es el mismo: probalo en el banco antes de pasarlo
// (`scripts/banco-rls/`), y contá los dollar-quotes, que tienen que seguir en número par.
import { readFileSync, writeFileSync } from 'node:fs'

const [entrada, salida] = process.argv.slice(2)
if (!entrada || !salida) {
  console.error('Uso: node scripts/sql-sin-comentarios.mjs <entrada.sql> <salida.sql>')
  process.exit(2)
}

const fuera = []
for (const l of readFileSync(entrada, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
  if (l.trim().startsWith('--')) continue
  let enComillas = false
  let corte = -1
  for (let i = 0; i < l.length; i++) {
    if (l[i] === "'") enComillas = !enComillas
    else if (!enComillas && l[i] === '-' && l[i + 1] === '-') { corte = i; break }
  }
  const limpia = (corte >= 0 ? l.slice(0, corte) : l).replace(/\s+$/, '')
  if (limpia === '' && fuera.length && fuera[fuera.length - 1] === '') continue
  fuera.push(limpia)
}
while (fuera.length && fuera[0] === '') fuera.shift()
const texto = fuera.join('\n').trimEnd() + '\n'
writeFileSync(salida, texto)

const marcadores = texto.match(/\$[A-Za-z_]*\$/g) ?? []
const porTag = {}
for (const t of marcadores) porTag[t] = (porTag[t] ?? 0) + 1
const par = Object.values(porTag).every((n) => n % 2 === 0)
console.log(`${salida}: ${fuera.length} renglones, primer renglón: «${fuera[0]?.slice(0, 50) ?? ''}»`)
console.log(`dollar-quotes: ${marcadores.length} ${JSON.stringify(porTag)} → ${par ? 'en par' : 'IMPAR: revisar'}`)
if (!par) process.exit(1)
