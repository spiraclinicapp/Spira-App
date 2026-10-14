// Guardia del ambiente DEMO: lo primero que corre cualquier script que escriba en el demo. Plan:
// docs/plan-tutoriales.md, «Guardia: tres cerrojos».
//
// Escribir pacientes ficticios en PROD es el peor escenario de todo el plan de tutoriales, así que no alcanza con
// un chequeo: son tres, y cada uno tapa un agujero distinto.
//
//   1. LISTA BLANCA, no lista negra (`verificarDestino`). El destino tiene que ser el ref del demo, mirando el
//      host Y el usuario de la cadena de conexión: en el pooler de Supabase el host es COMPARTIDO entre proyectos
//      (`aws-0-<región>.pooler.supabase.com`) y el ref viaja en el usuario (`postgres.<ref>`), así que una URL
//      copiada de prod pasaría un chequeo sólo por host. Exige además que lo haya lanzado un `npm run demo:…`
//      (npm deja el nombre en `npm_lifecycle_event`) o `SPIRA_DEMO=1` explícito: correr un script del demo
//      "a mano" con `node` sin querer no alcanza para escribir. Se usa la marca de npm y no un `SPIRA_DEMO=1` en
//      el `package.json` porque esa sintaxis no anda en `cmd`, y en esta máquina la terminal puede ser cualquiera.
//   2. TABLA CENTINELA (`verificarCentinela`). Ya conectado y antes de escribir: `demo.centinela` existe sólo en
//      el demo. La crea `migrar.mjs` la primera vez y NO es una migración, así que en prod no existe nunca. Única
//      excepción: la base vacía (sin `public.users`), que es la primera vez, cuando todavía no hubo dónde crearla.
//      Vive en su PROPIO schema (`demo`) y no en `public` (T2, 2026-10-13): el reset vacía `public`, y una
//      centinela ahí se iría con él, dejando al reset siguiente sin cerrojo.
//   3. EN EL NAVEGADOR (`verificarBundle`). El setup de Playwright lee la URL de Supabase del bundle cargado:
//      Vite completa lo que falte con `.env` / `.env.local`, y un `VITE_SUPABASE_URL` ausente haría que la app
//      grabada apunte a prod.
//
// El ref de prod va escrito acá a propósito, como cerrojo extra encima de la lista blanca: no es secreto (viaja
// en el bundle público de la app) y, si algún día el `demo.env` dijera el ref de prod como "demo", esto lo frena.
import { FORMA_REF } from './config.mjs'

export const REF_PROD = 'ojfgfolxfiltksblekgi'

export class GuardiaError extends Error {}

/** El ref de una URL de API de Supabase (`https://<ref>.supabase.co`), o `null`. */
export function refDeUrlApi(url) {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(String(url ?? '').trim())
  return m ? m[1] : null
}

/**
 * El ref al que apunta una cadena de conexión de Postgres de Supabase, o `null` si no se puede saber.
 *   · pooler: `postgresql://postgres.<ref>:…@aws-0-<región>.pooler.supabase.com:5432/postgres` → del USUARIO
 *   · directa: `postgresql://postgres:…@db.<ref>.supabase.co:5432/postgres`                    → del HOST
 * Si el host es el pooler y el usuario no trae ref, devuelve `null`: con el host solo no se sabe el proyecto.
 */
export function refDeDbUrl(dbUrl) {
  let u
  try { u = new URL(String(dbUrl ?? '').trim()) } catch { return null }
  if (!/^postgres(ql)?:$/.test(u.protocol)) return null
  const usuario = decodeURIComponent(u.username)
  const deUsuario = /^postgres\.([a-z0-9]+)$/.exec(usuario)?.[1] ?? null
  const deHost = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(u.hostname)?.[1] ?? null
  if (deUsuario && deHost && deUsuario !== deHost) return null // dos proyectos distintos en una URL: no se adivina
  return deUsuario ?? deHost
}

/**
 * Cerrojo 1. Tira `GuardiaError` si algo no es el demo. `dbUrl` es opcional: los scripts que sólo usan la API
 * no la tienen.
 */
export function verificarDestino({ demoRef, apiUrl, dbUrl = null, env = process.env }) {
  if (env.SPIRA_DEMO !== '1' && !String(env.npm_lifecycle_event ?? '').startsWith('demo:')) {
    throw new GuardiaError('Los scripts del demo se corren con su `npm run demo:…`, no a mano (o con SPIRA_DEMO=1 explícito).')
  }
  if (!FORMA_REF.test(String(demoRef ?? ''))) throw new GuardiaError('DEMO_REF vacío o con forma inválida.')
  if (demoRef === REF_PROD) throw new GuardiaError('DEMO_REF es el ref de PROD. Esto no es el demo.')

  const refApi = refDeUrlApi(apiUrl)
  if (!refApi) throw new GuardiaError('La URL de la API no tiene forma https://<ref>.supabase.co.')
  if (refApi === REF_PROD) throw new GuardiaError('La URL de la API apunta a PROD.')
  if (refApi !== demoRef) throw new GuardiaError('La URL de la API apunta a otro proyecto que no es el demo.')

  if (dbUrl != null) {
    const refDb = refDeDbUrl(dbUrl)
    if (!refDb) {
      throw new GuardiaError('No se puede saber a qué proyecto apunta DEMO_DB_URL (¿pooler sin `postgres.<ref>` en el usuario?).')
    }
    if (refDb === REF_PROD) throw new GuardiaError('DEMO_DB_URL apunta a PROD.')
    if (refDb !== demoRef) throw new GuardiaError('DEMO_DB_URL apunta a otro proyecto que no es el demo.')
  }
}

/**
 * Cerrojo 2. `consultar(sql)` devuelve las filas (se inyecta: `pg` en los scripts, un falso en los tests).
 * Devuelve `'presente'` (es el demo) o `'base-vacia'` (primera vez: el que llama puede crear la centinela).
 */
export async function verificarCentinela(consultar) {
  const [fila] = await consultar(
    "select to_regclass('demo.centinela') is not null as centinela, to_regclass('public.users') is not null as con_datos",
  )
  if (fila?.centinela) return 'presente'
  if (fila && !fila.con_datos) return 'base-vacia'
  throw new GuardiaError('La base tiene datos pero no la tabla demo.centinela: NO es el demo. No se escribe nada.')
}

/** Cerrojo 3. La URL de Supabase que de verdad usa la app cargada en el navegador. */
export function verificarBundle(urlEnElBundle, demoRef) {
  const ref = refDeUrlApi(urlEnElBundle)
  if (ref === REF_PROD) throw new GuardiaError('La app cargada apunta a PROD. No se graba.')
  if (ref !== demoRef) throw new GuardiaError('La app cargada no apunta al demo. No se graba.')
}
