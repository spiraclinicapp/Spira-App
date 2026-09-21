#!/usr/bin/env node
// Pone el tag de un release, pero SÓLO si `origin/main` ya lo tiene. Parte del ritual de la skill
// `cierre-jornada`, después de que el Director mergea la PR del cierre.
//
// Uso: node scripts/tag-release.mjs [X.Y.Z] [--dry]
//   Sin versión: la toma del package.json de origin/main (que es lo que hay que taggear).
//   --dry: corre todos los chequeos y dice qué haría, sin tocar nada.
//
// POR QUÉ EXISTE. El release se perdió DOS veces en su propio merge (#228 el 2026-09-15, #250 el
// 2026-09-20): la PR se mergeó con el commit del cierre justo antes de que llegara el push del
// release, así que `main` siguió en la versión vieja. De las tres cosas que se rompen cuando eso
// pasa, dos son molestas y se arreglan solas —una PR de seguimiento y un cherry-pick—, pero la
// tercera es cara: **el tag queda apuntando a un commit que no está en `main`**, y deshacer eso es
// BORRAR UN TAG DE `origin`, que es destructivo y necesita el visto bueno del Director.
//
// Y esa tercera es enteramente evitable, porque taggear es el ÚLTIMO paso: para cuando se pone el
// tag ya se sabe si el commit entró. Lo que fallaba era de dónde salía esa certeza — de lo que la
// sesión creía ("mi commit está en la rama, así que va a estar en main") en vez de `origin/main`.
// La regla que había quedado escrita —"avisá que el push ya está arriba antes de que mergee"—
// depende de que un mensaje llegue antes de un clic, y por eso falló dos veces.
//
// Mismo patrón que `check-migraciones.mjs`: algo que se olvidó dos veces deja de confiarse a la
// memoria y pasa a ser un comando que se niega a hacer la macana.
import { execSync } from 'node:child_process'

const dry = process.argv.includes('--dry')
const pedida = process.argv.slice(2).find((a) => a !== '--dry')

if (pedida && !/^\d+\.\d+\.\d+$/.test(pedida)) {
  console.error('Uso: node scripts/tag-release.mjs [X.Y.Z] [--dry]')
  process.exit(1)
}

const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim()
const ok = (msg) => console.log(`  ✓ ${msg}`)
const frenar = (titulo, detalle) => {
  console.error(`\n✗ NO se pone el tag: ${titulo}\n\n${detalle}\n`)
  process.exit(1)
}
const versionEn = (ref) => {
  try {
    return JSON.parse(git(`show ${ref}:package.json`)).version
  } catch {
    return null
  }
}

// 0 · Fetch propio. El chequeo entero se apoya en `origin/main`, así que no se le puede pedir al
//     que corre esto que haya fetcheado: hoy mismo un fetch viejo hizo parecer que una PR mergeada
//     no lo estaba.
git('fetch --quiet origin --tags')
ok('fetch de origin, recién hecho')

// 1 · Árbol limpio. Si hay cosas sin commitear, esta copia está a mitad de algo y el tag puede no
//     ser lo que quien la dejó así esperaba.
const sucio = git('status --porcelain')
if (sucio) frenar('el árbol de trabajo tiene cambios sin commitear', sucio)
ok('árbol limpio')

// 2 · Qué versión dice `origin/main`. Es la fuente de verdad: lo que está desplegado sale de ahí.
const enMain = versionEn('origin/main')
if (!enMain) frenar('no puedo leer el package.json de origin/main', 'Probá `git fetch origin`.')
const version = pedida ?? enMain

if (version !== enMain) {
  frenar(
    `origin/main está en ${enMain}, no en ${version}`,
    `Es exactamente la carrera de merges: el commit del release NO entró con su PR.\n` +
    `Arreglalo ANTES de taggear —cherry-pick sobre main y PR nueva— y volvé a correr esto.\n` +
    `Si el tag ya existiera apuntando a ese commit huérfano, hay que borrarlo de origin,\n` +
    `y eso se le pregunta al Director.`,
  )
}
ok(`origin/main está en ${version}`)

// 3 · Cuál es el commit que SUBIÓ la versión a ésta. No alcanza con "el último que tocó
//     package.json": se busca aquél cuyo padre todavía decía otra cosa.
const candidatos = git(`log origin/main --format=%H -n 80 -- package.json`).split('\n').filter(Boolean)
let release = null
for (const sha of candidatos) {
  if (versionEn(sha) !== version) continue
  const padres = git(`cat-file -p ${sha}`).split('\n').filter((l) => l.startsWith('parent ')).length
  // Un merge NO es el commit de release: el tag tiene que ir sobre el commit que hizo el bump,
  // para que la historia diga dónde nació la versión y no por dónde entró.
  if (padres !== 1) continue
  /* `~1` y NO `^`: en Windows `execSync` lanza a través de **cmd.exe**, donde `^` es el carácter
     de ESCAPE. `<sha>^:package.json` le llegaba a git como `<sha>:package.json`, así que esta
     comparación medía el commit contra sí mismo, nunca daba distinto y el script no encontraba
     ningún release. Falla en silencio y sólo en Windows: en Git Bash el mismo comando anda. */
  if (versionEn(`${sha}~1`) !== version) { release = sha; break }
}
if (!release) {
  frenar(
    `no encuentro en origin/main el commit que subió la versión a ${version}`,
    'Miré los últimos 80 commits que tocaron package.json. Si el release es más viejo que eso,\n' +
    'o el bump entró dentro de un commit de merge, hay que poner el tag a mano y mirar por qué.',
  )
}
ok(`commit de release: ${release.slice(0, 7)} — ${git(`log -1 --format=%s ${release}`)}`)

// 4 · ¿Ya existe el tag en origin? Pasó el 2026-09-20: dos sesiones fueron a taggear el mismo
//     release con segundos de diferencia. Si ya está y apunta bien, no hay nada que hacer.
const tag = `v${version}`
const remoto = git(`ls-remote --tags origin ${tag}`)
if (remoto) {
  const apunta = git(`rev-list -n 1 ${tag}`)
  if (apunta === release) {
    console.log(`\n· ${tag} ya está en origin y apunta a ${release.slice(0, 7)}. No hay nada que hacer.\n`)
    process.exit(0)
  }
  frenar(
    `${tag} YA EXISTE en origin y apunta a otro commit (${apunta.slice(0, 7)})`,
    'Reapuntarlo obliga a borrarlo del remoto, que es destructivo: preguntale al Director.',
  )
}
ok(`${tag} todavía no existe en origin`)

// 5 · El mensaje del tag sale del changelog de esa versión, que es el texto que el Director ya
//     revisó al sacar el release. Si no está, el tag va sin cuerpo antes que con uno inventado.
//
//     PERO NO EN UNA CODA. El changelog se indexa por versión CORTA (`0.86`) y una coda (`0.86.1`) no
//     agrega línea propia, así que buscar por versión corta devolvía la línea de la `0.86.0`: el tag de
//     la coda quedaba afirmando que introdujo algo que introdujo otra versión. Se vio en el ensayo de la
//     `v0.86.1` (2026-09-21), antes de taggear — un tag no se corrige sin borrarlo de origin. En una coda
//     el mensaje sale del commit de release, que es el que describe qué versiona.
const [, , parche] = version.split('.').map(Number)
const corta = version.split('.').slice(0, 2).join('.')
let texto
if (parche > 0) {
  texto = git(`log -1 --format=%b ${release}`)
    .split('\n')
    .filter((l) => !/^Co-Authored-By:/i.test(l))
    .join('\n')
    .trim() || undefined
} else {
  const linea = git(`show origin/main:src/lib/version.ts`)
    .split('\n')
    .find((l) => l.includes(`version: '${corta}'`))
  texto = linea?.match(/text: '(.*)'/)?.[1]?.replace(/\\'/g, "'")
}

if (dry) {
  console.log(`\n[dry] pondría ${tag} sobre ${release.slice(0, 7)}`)
  console.log(`[dry] mensaje: ${texto ?? '(sin changelog: iría sólo el número)'}\n`)
  process.exit(0)
}

const mensaje = texto ? `${tag}\n\n${texto}\n` : tag
execSync(`git tag -a ${tag} ${release} -F -`, { input: mensaje })
git(`push origin ${tag}`)

// 6 · Verificar contra el REMOTO, no contra lo local: pushear y dar por hecho que llegó es la
//     mitad del error que este script existe para evitar.
const confirmado = git(`ls-remote --tags origin ${tag}`)
if (!confirmado) frenar('el push del tag no llegó a origin', 'El tag quedó local. Reintentá.')
console.log(`\n✓ ${tag} puesto sobre ${release.slice(0, 7)} y confirmado en origin.\n`)
