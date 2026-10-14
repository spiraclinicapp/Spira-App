// `npm run demo:sesion` — sesiones SIN CONTRASEÑA de las cuentas del demo, para que la fábrica de tutoriales entre a
// la app ya logueada. Plan: docs/plan-tutoriales.md, «Sesión sin contraseña». Lo corre también `resetear.mjs` al
// final, después de la semilla.
//
// ── CÓMO ──
// `generate_link` (API admin, con la secret key del demo) devuelve el token de un magic link SIN mandar ningún mail;
// `verify` lo canjea por una sesión, igual que si alguien hubiera hecho clic en el link. Nadie tipea una contraseña
// (tampoco el agente, que no puede hacerlo contra un host que no es local), y el login, con su iframe de YouTube,
// no se graba.
//
// ── POR QUÉ NO ES UN `storageState` DE PLAYWRIGHT ──
// La app guarda la sesión en `sessionStorage` (src/lib/supabase.ts: sesión efímera, por los datos clínicos), y el
// `storageState` de Playwright sólo lleva cookies y `localStorage`: cargado tal cual, la app abriría en el login.
// Se guarda la entrada de `sessionStorage` (clave y valor, exactamente lo que escribiría supabase-js) y la fábrica
// la pone con `addInitScript` antes de que cargue la página (tutoriales/lib/sesion.ts).
//
// ── POR QUÉ SE REGENERA EN CADA RESET ──
// El refresh token es de un solo uso: si una grabación lo gasta (la app refresca sola cuando vence el access token,
// a la hora), la siguiente que use el mismo archivo arranca con un token ya canjeado. Cada guion arranca de un reset
// (plan, «Guion»), así que cada uno estrena sesiones.
//
// Los archivos van a %USERPROFILE%\.spira\demo-sesiones\, al lado de demo.env y fuera del repo por lo mismo que
// él (config.mjs): se ven igual desde cualquier worktree, y son credenciales (de cuentas ficticias, pero credenciales).
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { leerConfigDemo } from './config.mjs'
import { verificarDestino } from './guardia.mjs'
import { CUENTAS } from './semilla.mjs'

export const DIR_SESIONES = join(homedir(), '.spira', 'demo-sesiones')

/** La clave con la que supabase-js guarda la sesión: `sb-<primer tramo del host>-auth-token` (su default, que la
 *  app no cambia). */
export function claveDeSesion(url) {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
}

/** Lo que va al archivo de cada cuenta. `valor` es el JSON de la sesión, tal como lo escribe supabase-js. */
export function entradaDeSesion(url, cuenta, sesion) {
  return {
    cuenta: cuenta.alias,
    email: cuenta.email,
    venceElAccessToken: new Date(sesion.expires_at * 1000).toISOString(),
    sessionStorage: { [claveDeSesion(url)]: JSON.stringify(sesion) },
  }
}

/** Una sesión nueva de `email`, sin contraseña. Nunca se imprime: tiene tokens. */
export async function generarSesion(cfg, email) {
  const admin = { apikey: cfg.secretKey, Authorization: `Bearer ${cfg.secretKey}`, 'Content-Type': 'application/json' }
  const r1 = await fetch(`${cfg.url}/auth/v1/admin/generate_link`, { method: 'POST', headers: admin, body: JSON.stringify({ type: 'magiclink', email }) })
  const link = await r1.json().catch(() => ({}))
  const tokenHash = link.hashed_token ?? link.properties?.hashed_token
  if (!r1.ok || !tokenHash) throw new Error(`No se pudo generar el link de ${email} (HTTP ${r1.status}): ${link.msg ?? link.message ?? ''}`)

  const r2 = await fetch(`${cfg.url}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
  })
  const sesion = await r2.json().catch(() => ({}))
  if (!r2.ok || !sesion.access_token || !sesion.refresh_token) {
    throw new Error(`No se pudo canjear el link de ${email} por una sesión (HTTP ${r2.status}): ${sesion.msg ?? sesion.message ?? ''}`)
  }
  return sesion
}

/** Genera y guarda la sesión de cada cuenta del demo. Devuelve la carpeta. */
export async function guardarSesiones(cfg, { log = console.log, dir = DIR_SESIONES } = {}) {
  mkdirSync(dir, { recursive: true })
  for (const cuenta of CUENTAS) {
    const sesion = await generarSesion(cfg, cuenta.email)
    writeFileSync(join(dir, `${cuenta.alias}.json`), JSON.stringify(entradaDeSesion(cfg.url, cuenta, sesion), null, 2))
  }
  log(`· Sesiones sin contraseña en ${dir} (${CUENTAS.map((c) => c.alias).join(', ')}).`)
  return dir
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/scripts/demo/sesion.mjs')) {
  try {
    const cfg = leerConfigDemo()
    verificarDestino({ demoRef: cfg.ref, apiUrl: cfg.url, dbUrl: cfg.dbUrl })
    await guardarSesiones(cfg)
  } catch (e) {
    console.error(`✗ ${e.message}`)
    process.exitCode = 1
  }
}
