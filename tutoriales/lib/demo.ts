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
