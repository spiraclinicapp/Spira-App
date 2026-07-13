#!/usr/bin/env node
// Bump de versión atómico del release: package.json + package-lock.json (la versión vive
// en DOS lugares del lock — el gotcha clásico del Edit con 2 matches) + entrada nueva en
// el changelog de src/lib/version.ts. Parte del ritual de la skill `cierre-jornada`.
//
// Uso: node scripts/release.mjs X.Y.Z "Texto del changelog en una línea." [--dry]
//   --dry: muestra qué tocaría sin escribir nada.
//   Sin texto de changelog: bumpea versiones y avisa que version.ts queda a mano.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dry = process.argv.includes('--dry')
const [version, changelog] = process.argv.slice(2).filter((a) => a !== '--dry')

if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Uso: node scripts/release.mjs X.Y.Z "Texto del changelog." [--dry]')
  process.exit(1)
}

const read = (p) => readFileSync(resolve(root, p), 'utf8')
const save = (p, s) => {
  if (!dry) writeFileSync(resolve(root, p), s)
  console.log(`${dry ? '[dry] ' : ''}✓ ${p}`)
}

// 1 · package.json
const pkg = JSON.parse(read('package.json'))
const prev = pkg.version
pkg.version = version
save('package.json', JSON.stringify(pkg, null, 2) + '\n')

// 2 · package-lock.json — raíz Y packages[""] (los famosos 2 matches).
const lock = JSON.parse(read('package-lock.json'))
lock.version = version
if (lock.packages && lock.packages['']) lock.packages[''].version = version
save('package-lock.json', JSON.stringify(lock, null, 2) + '\n')

// 3 · src/lib/version.ts — entrada nueva arriba de todo (versión corta X.Y, como el resto).
if (changelog) {
  const short = version.split('.').slice(0, 2).join('.')
  const vts = read('src/lib/version.ts')
  const eol = vts.includes('\r\n') ? '\r\n' : '\n' // el repo suele estar en CRLF (Windows)
  const idx = vts.indexOf('changelog: [')
  if (idx === -1) {
    console.error('No encuentro `changelog: [` en src/lib/version.ts — agregá la entrada a mano.')
    process.exit(1)
  }
  if (vts.includes(`{ version: '${short}'`)) {
    console.log(`· version.ts ya tiene entrada ${short} — no la duplico.`)
  } else {
    const lineEnd = vts.indexOf('\n', idx) + 1 // insertar después de la línea del marcador
    const entry = `    { version: '${short}', text: '${changelog.replace(/'/g, "\\'")}' },${eol}`
    save('src/lib/version.ts', vts.slice(0, lineEnd) + entry + vts.slice(lineEnd))
  }
} else {
  console.log('· Sin texto de changelog → src/lib/version.ts no se toca (entrada a mano).')
}

console.log(`${prev} → ${version}${dry ? '  (dry-run: no se escribió nada)' : ''}`)
