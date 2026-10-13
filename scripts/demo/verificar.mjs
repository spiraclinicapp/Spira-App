#!/usr/bin/env node
// `npm run demo:verificar` — revisa el ambiente DEMO sin escribir nada y sin mostrar ningún valor: que
// %USERPROFILE%\.spira\demo.env esté completo, que pase la guardia (cerrojo 1) y que las dos claves respondan
// contra el proyecto demo. Es lo primero que conviene correr si algo del demo "no anda", y lo que se le pide al
// Director después de tocar el archivo de claves. Sale con código 1 y el motivo si algo falla.
import { leerConfigDemo } from './config.mjs'
import { verificarDestino } from './guardia.mjs'

const linea = (ok, texto) => console.log(`${ok ? '✓' : '✗'} ${texto}`)

try {
  const cfg = leerConfigDemo()
  linea(true, 'demo.env completo')
  verificarDestino({ demoRef: cfg.ref, apiUrl: cfg.url, dbUrl: cfg.dbUrl })
  linea(true, `apunta al demo, no a prod${cfg.dbUrl ? ' (API y base)' : ' (API; DEMO_DB_URL todavía vacía)'}`)

  const pub = await fetch(cfg.url + '/auth/v1/settings', { headers: { apikey: cfg.publishableKey } }).catch(() => null)
  if (!pub) throw new Error('El demo no responde. ¿Está pausado? Despausalo desde el dashboard de Supabase.')
  if (!pub.ok) throw new Error(`La publishable key no corresponde al demo (HTTP ${pub.status}).`)
  linea(true, 'la publishable key responde')

  const sec = await fetch(cfg.url + '/auth/v1/admin/users?per_page=1', {
    headers: { apikey: cfg.secretKey, Authorization: `Bearer ${cfg.secretKey}` },
  }).catch(() => null)
  if (!sec?.ok) throw new Error(`La secret key no corresponde al demo (HTTP ${sec?.status ?? 'sin respuesta'}).`)
  linea(true, 'la secret key responde')
} catch (e) {
  linea(false, e.message)
  process.exit(1)
}
