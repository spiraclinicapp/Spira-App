// `npm run demo:app` — la app contra el proyecto DEMO, en http://localhost:5290 (lejos de los que ya tienen dueño: el
// 5173 es del Director, el 5250 del preview y del 5251 en adelante los Vite de cada sesión). Lo que T6 va a usar como `webServer` de la fábrica, y la forma de mirar
// el demo a mano. Argumentos extra van a Vite: `npm run demo:app -- --port 5300`.
//
// ── POR QUÉ NO ALCANZA CON `npm run dev -- --mode demo` ──
// Las claves del demo viven fuera del repo (config.mjs), así que no hay `.env.demo` que Vite pueda leer, y Vite
// completa lo que falte con `.env` / `.env.local`, que apuntan a PROD (plan, cerrojo 3). Acá las variables se
// inyectan en el entorno del proceso, que a Vite le gana a cualquier archivo.
//
// ── Y SE COMPRUEBA, NO SE SUPONE ──
// Con el server arriba, se pide el módulo que crea el cliente de Supabase tal como lo sirve Vite (con las variables
// ya reemplazadas) y se exige la URL del demo y ningún rastro del ref de prod. Si no, se apaga el server.
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leerConfigDemo } from './config.mjs'
import { REF_PROD, verificarDestino } from './guardia.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const extra = process.argv.slice(2)
const puerto = extra.includes('--port') ? extra[extra.indexOf('--port') + 1] : '5290'

let cfg
try {
  cfg = leerConfigDemo()
  verificarDestino({ demoRef: cfg.ref, apiUrl: cfg.url })
} catch (e) {
  console.error(`✗ ${e.message}`)
  process.exit(1)
}

/* El puerto, ANTES de arrancar. Con `--strictPort` Vite se niega a usar uno ocupado, pero el chequeo de abajo le
   preguntaría igual al server que ya estaba ahí —el de otra sesión, que apunta a donde apunte— y diría «no apunta al
   demo» de un server que no es éste. Pasó el 2026-10-13 con el 5252, que era el default y una sesión ya lo usaba.
   Se prueba sobre `localhost`, como escucha Vite: el puerto en `::` puede estar libre con `::1` tomado. */
const libre = await new Promise((listo) => {
  const s = createServer().once('error', () => listo(false)).once('listening', () => s.close(() => listo(true)))
  s.listen(Number(puerto), 'localhost')
})
if (!libre) {
  console.error(`✗ El puerto ${puerto} está ocupado (¿otra sesión?). Elegí otro: npm run demo:app -- --port <otro>`)
  process.exit(1)
}

const vite = spawn(process.execPath, [join(RAIZ, 'node_modules', 'vite', 'bin', 'vite.js'), '--mode', 'demo', '--strictPort',
  ...(extra.includes('--port') ? [] : ['--port', puerto]), ...extra], {
  cwd: RAIZ,
  stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: cfg.url, VITE_SUPABASE_PUBLISHABLE_KEY: cfg.publishableKey },
})
let viteVivo = true
vite.on('exit', (codigo) => { viteVivo = false; process.exit(codigo ?? 0) })

// El chequeo, en cuanto el server responde, y sólo mientras sea el NUESTRO el que responde.
for (let i = 0; i < 60 && viteVivo; i++) {
  await new Promise((r) => setTimeout(r, 500))
  if (!viteVivo) break
  const r = await fetch(`http://localhost:${puerto}/src/lib/supabase.ts`).catch(() => null)
  if (!r?.ok) continue
  const modulo = await r.text()
  if (!modulo.includes(cfg.url) || modulo.includes(REF_PROD)) {
    console.error('✗ La app servida no apunta al demo. Apago el server.')
    vite.kill()
    process.exit(1)
  }
  console.log(`✓ La app en http://localhost:${puerto} apunta al demo. Las sesiones de las cuentas: npm run demo:sesion.`)
  break
}
