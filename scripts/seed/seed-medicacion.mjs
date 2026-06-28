// Sembrado idempotente del catálogo de medicación de BASE (drogas + medicamentos).
// Lee scripts/seed/medicacion-base.json (curado del Excel del centro) y crea lo que falte
// vía las RPC create_drug / create_medication. Requiere sesión de un usuario pharma-leader.
//
// Uso (desde la raíz del repo):
//   node scripts/seed/seed-medicacion.mjs <email> <contraseña>
// con las credenciales de un usuario pharma-leader. (También sirven las variables de entorno
// SEED_EMAIL / SEED_PASSWORD si preferís no tipearlas en el comando.)
//
// Idempotente y aditivo: relee el catálogo actual y SOLO crea lo que no existe. No borra nada.
// Se puede correr las veces que haga falta. El laboratorio y el GTIN NO se siembran: se aprenden
// al escanear en recepción (linkCode + autodetección de laboratorio).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..')

// .env (claves VITE_*) leído a mano, sin dependencias extra.
function readEnv() {
  const out = {}
  try {
    const txt = readFileSync(join(repoRoot, '.env'), 'utf8')
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* sin .env: caemos a process.env */ }
  return out
}

const env = { ...readEnv(), ...process.env }
const URL = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!URL || !KEY) {
  console.error('Falta VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (en .env).')
  process.exit(1)
}

// Credenciales de un pharma-leader: argumentos del comando o variables de entorno.
const EMAIL = process.argv[2] || env.SEED_EMAIL
const PASSWORD = process.argv[3] || env.SEED_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('Falta el email y/o la contraseña de un usuario pharma-leader.')
  console.error('Uso: node scripts/seed/seed-medicacion.mjs <email> <contraseña>')
  process.exit(1)
}

const supabase = createClient(URL, KEY)
// .replace(/^﻿/, '') tolera el BOM que algunos editores/PowerShell agregan al inicio.
const { drugs, medications } = JSON.parse(readFileSync(join(__dirname, 'medicacion-base.json'), 'utf8').replace(/^﻿/, ''))

async function main() {
  const { error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (authErr) { console.error('No se pudo iniciar sesión:', authErr.message); process.exit(1) }

  // --- Drogas (idempotente: create_drug tiene unique(name); igual releemos para mapear ids) ---
  const { data: existingDrugs, error: dErr } = await supabase.from('drugs').select('id, name')
  if (dErr) { console.error('No se pudieron leer las drogas:', dErr.message); process.exit(1) }
  const drugId = new Map(existingDrugs.map((d) => [d.name, d.id]))
  let drugsCreated = 0
  for (const name of drugs) {
    if (drugId.has(name)) continue
    const { data, error } = await supabase.rpc('create_drug', { p_name: name })
    if (error) { console.error(`  ✗ droga "${name}": ${error.message}`); continue }
    drugId.set(name, data)
    drugsCreated++
    console.log(`  + droga: ${name}`)
  }

  // --- Medicamentos (idempotente por nombre; medications no tiene unique en name) ---
  const { data: existingMeds, error: mErr } = await supabase.from('medications').select('name')
  if (mErr) { console.error('No se pudieron leer los medicamentos:', mErr.message); process.exit(1) }
  const have = new Set(existingMeds.map((m) => m.name))
  let medsCreated = 0
  for (const med of medications) {
    if (have.has(med.name)) continue
    const did = drugId.get(med.drug)
    if (!did) { console.error(`  ✗ "${med.name}": no encontré la droga "${med.drug}"`); continue }
    const { error } = await supabase.rpc('create_medication', {
      p_drug_id: did, p_name: med.name, p_unit: med.unit, p_low_stock_threshold: 5, p_gtin: null,
    })
    if (error) { console.error(`  ✗ "${med.name}": ${error.message}`); continue }
    have.add(med.name)
    medsCreated++
    console.log(`  + medicamento: ${med.name}`)
  }

  console.log(`\nListo. Drogas nuevas: ${drugsCreated}/${drugs.length} · Medicamentos nuevos: ${medsCreated}/${medications.length}`)
  await supabase.auth.signOut()
}

main().catch((e) => { console.error(e); process.exit(1) })
