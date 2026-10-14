// `npm run demo:app` — la app contra el proyecto DEMO, en http://localhost:5252 (otro puerto: el 5173 es del dev
// server del Director y el 5250 del preview). Lo que T6 va a usar como `webServer` de la fábrica, y la forma de mirar
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
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leerConfigDemo } from './config.mjs'
import { REF_PROD, verificarDestino } from './guardia.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const extra = process.argv.slice(2)
const puerto = extra.includes('--port') ? extra[extra.indexOf('--port') + 1] : '5252'

let cfg
try {
  cfg = leerConfigDemo()
  verificarDestino({ demoRef: cfg.ref, apiUrl: cfg.url })
} catch (e) {
  console.error(`✗ ${e.message}`)
  process.exit(1)
}

const vite = spawn(process.execPath, [join(RAIZ, 'node_modules', 'vite', 'bin', 'vite.js'), '--mode', 'demo', '--strictPort',
  ...(extra.includes('--port') ? [] : ['--port', puerto]), ...extra], {
  cwd: RAIZ,
  stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: cfg.url, VITE_SUPABASE_PUBLISHABLE_KEY: cfg.publishableKey },
})
vite.on('exit', (codigo) => process.exit(codigo ?? 0))

// El chequeo, en cuanto el server responde.
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 500))
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
