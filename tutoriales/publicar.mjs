// `npm run tutoriales:publicar -- <id> <versión>` — sube a Storage de PROD los tres archivos de un video de la
// fábrica (`tutoriales/salida/<id>/<versión>/`) y comprueba que la URL pública devuelve exactamente lo mismo. Plan:
// docs/plan-tutoriales.md, «Publicar» (decisión del Director, 2026-10-14: antes la subía él a mano desde el dashboard).
//
// ── CON QUÉ ENTRA ──
// Con la cuenta dedicada `tutoriales@fabrica.spira`, que por la 0157 puede SUBIR al bucket `tutoriales` y nada más
// (no lee, no pisa, no borra, no toca `ip-docs` ni la base). Su contraseña va en
// %USERPROFILE%\.spira\prod-publicador.env (`TUTORIALES_PASSWORD=`), fuera del repo; la URL y la publishable key de
// prod, del `.env` de esta copia (las mismas de la app). La contraseña nunca se imprime.
//
// ── EL ORDEN ──
// Se corre ANTES de mergear el `tutoriales.meta.json` que publica esa versión: así, cuando la app la pide, ya está.
// La versión va explícita (no se lee del meta) porque el meta nuevo vive en una rama todavía sin mergear.
//
// ── --demo ──
// Lo mismo contra el proyecto DEMO, con la misma cuenta pero entrando sin contraseña (`generate_link`, como las otras
// cuentas del demo; se crea si no existe). Sirve para probar el script y la 0157 sin tocar prod.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leerConfigDemo, parsearEnv } from '../scripts/demo/config.mjs'
import { REF_PROD, verificarDestino } from '../scripts/demo/guardia.mjs'
import { generarSesion } from '../scripts/demo/sesion.mjs'
import { ARCHIVOS, BUCKET, CUENTA, claveDeObjeto, urlPublica } from './lib/publicar.mjs'

const FABRICA = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(FABRICA, '..')

function fallar(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

const args = process.argv.slice(2)
const demo = args.includes('--demo')
const [id, version] = args.filter((a) => a !== '--demo')
if (!id || !version) fallar('Uso: npm run tutoriales:publicar -- <id> <versión>   (p. ej. dispensar 02accad0)')
const carpeta = join(FABRICA, 'salida', id, version)
const claves = Object.keys(ARCHIVOS).map((archivo) => [archivo, claveDeObjeto(id, version, archivo)])
for (const [archivo] of claves) {
  if (!existsSync(join(carpeta, archivo))) fallar(`Falta tutoriales\\salida\\${id}\\${version}\\${archivo} en esta copia del repo.`)
}

/** El destino y una sesión de la cuenta dedicada. */
async function entrar() {
  if (demo) {
    const cfg = leerConfigDemo()
    verificarDestino({ demoRef: cfg.ref, apiUrl: cfg.url, env: { ...process.env, SPIRA_DEMO: '1' } })
    const admin = { apikey: cfg.secretKey, Authorization: `Bearer ${cfg.secretKey}`, 'Content-Type': 'application/json' }
    const r = await fetch(`${cfg.url}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email: CUENTA, email_confirm: true, user_metadata: { full_name: 'Fábrica de tutoriales' } }) })
    if (!r.ok && r.status !== 422) fallar(`No se pudo preparar la cuenta del demo (HTTP ${r.status}).`)
    const sesion = await generarSesion(cfg, CUENTA)
    return { ref: cfg.ref, url: cfg.url, apikey: cfg.publishableKey, token: sesion.access_token }
  }
  const app = parsearEnv(['.env', '.env.local'].map((f) => join(REPO, f)).filter(existsSync).map((f) => readFileSync(f, 'utf8')).join('\n'))
  const url = (app.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
  if (url !== `https://${REF_PROD}.supabase.co`) fallar('El .env de esta copia no apunta a prod (VITE_SUPABASE_URL). Corré esto desde la carpeta principal de Spira.')
  const rutaClave = join(homedir(), '.spira', 'prod-publicador.env')
  const password = existsSync(rutaClave) ? parsearEnv(readFileSync(rutaClave, 'utf8')).TUTORIALES_PASSWORD : null
  if (!password) fallar(`Falta TUTORIALES_PASSWORD en ${rutaClave}.`)
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: app.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: CUENTA, password }),
  })
  const s = await r.json().catch(() => ({}))
  if (!r.ok || !s.access_token) fallar(`No se pudo entrar con ${CUENTA} (HTTP ${r.status}): ${s.msg ?? s.error_description ?? ''}`)
  return { ref: REF_PROD, url, apikey: app.VITE_SUPABASE_PUBLISHABLE_KEY, token: s.access_token }
}

const destino = await entrar()
console.log(`· Publicando «${id}» ${version} en el Storage de ${demo ? 'DEMO' : 'PROD'} (bucket ${BUCKET}), como ${CUENTA}…`)
for (const [archivo, clave] of claves) {
  const cuerpo = readFileSync(join(carpeta, archivo))
  const r = await fetch(`${destino.url}/storage/v1/object/${BUCKET}/${clave}`, {
    method: 'POST',
    headers: {
      apikey: destino.apikey, Authorization: `Bearer ${destino.token}`, 'Content-Type': ARCHIVOS[archivo],
      // La ruta lleva la versión: un video regrabado es otra ruta, así que esto no cambia nunca.
      'cache-control': 'max-age=31536000',
    },
    body: cuerpo,
  })
  // Ya subido (otra corrida): la cuenta no puede pisar —y no hace falta—; alcanza con que sea el mismo archivo.
  const yaEstaba = !r.ok && /already exists|Duplicate/i.test(await r.clone().text().catch(() => ''))
  if (!r.ok && !yaEstaba) fallar(`No se pudo subir ${clave} (HTTP ${r.status}): ${(await r.text().catch(() => '')).slice(0, 200)}`)
  const bajada = await fetch(urlPublica(destino.ref, clave)).catch(() => null)
  const bajado = bajada?.ok ? Buffer.from(await bajada.arrayBuffer()) : null
  if (!bajado || !bajado.equals(cuerpo)) {
    fallar(yaEstaba
      ? `${clave} ya estaba en Storage y NO es igual al de esta copia. No se pisa: revisá cuál es el bueno.`
      : `${clave} se subió, pero la URL pública no devuelve lo mismo (HTTP ${bajada?.status ?? 'sin respuesta'}).`)
  }
  console.log(`  ✓ ${clave} · ${cuerpo.length} bytes${yaEstaba ? ' · ya estaba, idéntico' : ''}`)
}
console.log(`✓ «${id}» ${version} publicado${demo ? ' en el demo' : ''}. Ya se puede mergear el meta que lo publica.`)
