import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leerConfigDemo } from '../../scripts/demo/config.mjs'
import { verificarBundle } from '../../scripts/demo/guardia.mjs'

/* ============================================================================
   El cerrojo 3 de la guardia del demo, del lado de la fábrica (docs/plan-tutoriales.md, «Guardia: tres
   cerrojos»): antes de grabar, la app servida tiene que apuntar al proyecto DEMO. Si apuntara a prod, el video
   publicaría nombres reales de pacientes — el peor escenario del plan.

   Se le pide al server el módulo que crea el cliente de Supabase, tal como lo sirve Vite (con las variables ya
   reemplazadas), y se exige la URL del demo. Es la misma pregunta que hace `npm run demo:app` al levantar, hecha
   otra vez acá porque la fábrica puede usar un server que ya estaba corriendo (`reuseExistingServer`).
   ============================================================================ */

export async function verificarAppDelDemo(baseURL: string): Promise<void> {
  const cfg = leerConfigDemo()
  const r = await fetch(new URL('/src/lib/supabase.ts', baseURL)).catch(() => null)
  if (!r?.ok) throw new Error(`La app en ${baseURL} no responde${r ? ` (HTTP ${r.status})` : ''}. ¿Está levantado \`npm run demo:app\`?`)
  const url = /https:\/\/[a-z0-9]+\.supabase\.co/.exec(await r.text())?.[0] ?? ''
  verificarBundle(url, cfg.ref)
}

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * El demo vuelve a cero antes de cada tutorial: cada guion GASTA lo que la semilla le deja (el de dispensar termina
 * con el pedido entregado), así que sin reset la segunda corrida no encuentra nada que preparar. Es el mismo
 * `npm run demo:resetear` de siempre, con sus cerrojos. `TUTORIALES_SIN_RESET=1` lo saltea (para iterar un guion
 * sobre un demo que ya está como hace falta).
 *
 * Ojo: el reset vuelve a aplicar las migraciones de ESTA copia del repo. Una migración nueva sin la anterior (un
 * hueco) lo frena; ver «T6» en docs/plan-tutoriales.md.
 */
export function resetearDemo(): void {
  if (process.env.TUTORIALES_SIN_RESET === '1') return
  try {
    execSync('npm run demo:resetear', { cwd: REPO, stdio: 'pipe', encoding: 'utf8' })
  } catch (e) {
    const salida = String((e as { stdout?: string; stderr?: string }).stderr || (e as { stdout?: string }).stdout || e)
    throw new Error(`No se pudo resetear el demo: ${salida.split(/\r?\n/).filter((l) => l.includes('✗')).join(' · ') || salida.slice(-400)}`)
  }
}
