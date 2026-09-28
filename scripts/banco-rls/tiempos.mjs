#!/usr/bin/env node
// Banco de pruebas de la RLS · ¿cuánto tardan las consultas de las pantallas, con cada perfil?
//
//   node scripts/banco-rls/tiempos.mjs            # la base con TODAS las migraciones
//   node scripts/banco-rls/tiempos.mjs <NNNN>     # antes y después de aplicar la NNNN
//
// Siembra con el volumen de prod al 2026-09-28 (~1.000 visitas, VOLUMEN_PROD) y mide, con la RLS de
// cada perfil, las consultas de CONSULTAS. Cada una se calienta una vez y se promedia sobre tres.
//
// Los números son de PGlite (Postgres en WASM, un solo hilo): sirven para comparar antes contra después,
// NO como tiempos de prod. Para prod, medí con la sesión real (red del navegador) y compará contra
// `explain analyze` en el editor, que corre SIN RLS: la diferencia es lo que cuesta la RLS. Así se
// encontró la 0146 — Pendientes, 96 ms sin RLS y 700–1.000 ms con sesión; en este banco, 509 → 116 ms.
import { crearBase, comoPerfil, migracion } from './base.mjs'
import { sembrar, PERFILES, VOLUMEN_PROD } from './sembrar.mjs'

// Lo que piden las pantallas (src/data/*). Sumá la de la pantalla que estés mirando.
const CONSULTAS = {
  'Pendientes · visitas en alerta': `select * from public.v_track_visits where computed_status in ('ventana_vencida','item_vencido','por_reprogramar') order by estimated_date`,
  'Pendientes · reportes vencidos': `select * from public.v_procedure_report_alerts order by report_due_at`,
  'Pendientes · IP sin entregar': `select * from public.v_ip_delivery_alerts order by vence_at`,
  'Visitas de la semana': `select * from public.v_track_visits where estimated_date between current_date - 3 and current_date + 4`,
  'Pacientes': `select * from public.patients`,
}
const QUIENES = { gerencia: PERFILES.gerencia, coordinadora: PERFILES.coordinadora23, farmacia: PERFILES.farmacia }

const numero = process.argv.slice(2).find((a) => /^\d+$/.test(a))
const m = numero ? migracion(numero) : null
const hasta = m ? String(Number(m.numero) - 1).padStart(4, '0') : undefined

console.log(m ? `Antes y después de ${m.archivo}, sembrado con volumen de prod…` : 'Todas las migraciones, sembrado con volumen de prod…')
const db = await crearBase({ hasta })
await sembrar(db, { volumen: VOLUMEN_PROD })
console.log(`visitas: ${(await db.query('select count(*)::int n from public.patient_visits')).rows[0].n}\n`)

async function medir() {
  const out = {}
  for (const [quien, uid] of Object.entries(QUIENES)) {
    for (const [nombre, sql] of Object.entries(CONSULTAS)) {
      await comoPerfil(db, uid, sql) // calentar
      const t0 = performance.now()
      for (let i = 0; i < 3; i++) await comoPerfil(db, uid, sql)
      out[`${quien} · ${nombre}`] = (performance.now() - t0) / 3
    }
  }
  return out
}

const antes = await medir()
const despues = m ? (await db.exec(m.sql), await medir()) : null
for (const k of Object.keys(antes)) {
  const a = antes[k]
  const linea = `${k.padEnd(48)} ${a.toFixed(0).padStart(6)} ms`
  console.log(despues ? `${linea} → ${despues[k].toFixed(0).padStart(5)} ms  (×${(a / despues[k]).toFixed(1)})` : linea)
}
