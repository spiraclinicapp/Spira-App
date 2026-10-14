#!/usr/bin/env node
// `npm run demo:migrar` — aplica al proyecto DEMO las migraciones que le falten, en orden, desde
// supabase/migrations/ (la misma fuente de verdad que prod). Plan: docs/plan-tutoriales.md, «El ambiente demo».
//
// ── POR QUÉ ACÁ SÍ HAY TRANSACCIÓN Y EN EL EDITOR DE SUPABASE NO ──
// CLAUDE.md avisa que las sentencias de un bloque del editor NO comparten sesión ni transacción. Esto no pasa por
// el editor: es una conexión propia, así que cada archivo va entre BEGIN y COMMIT junto con su fila en el
// registro. Si falla, ROLLBACK: ni la migración queda a medias ni el registro la da por aplicada.
//
// ── LA PRIMERA VEZ ──
// Con la base vacía (cerrojo 2 = 'base-vacia') se crea el schema `demo` con la centinela y el registro, ANTES de
// la primera migración: desde ahí, cualquier corrida exige la centinela. Y el bucket privado `ip-docs`, que la
// 0071 pide como requisito previo (en prod se creó a mano desde Storage).
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { conectarDemo } from './db.mjs'
import { verificarCentinela } from './guardia.mjs'
import { ordenarMigraciones, pendientes } from './migraciones.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = join(RAIZ, 'supabase', 'migrations')

const PRIMERA_VEZ = `
create schema if not exists demo;
revoke all on schema demo from public, anon, authenticated;
create table if not exists demo.centinela (
  id int primary key default 1 check (id = 1),
  creada_en timestamptz not null default now(),
  nota text not null
);
insert into demo.centinela (nota)
values ('Proyecto DEMO de Spira: datos ficticios para tutoriales y práctica. Si esta tabla aparece en prod, algo salió muy mal.')
on conflict (id) do nothing;
create table if not exists demo.migraciones (
  nombre text primary key,
  aplicada_en timestamptz not null default now()
);`

const BUCKET_IP = `
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ip-docs', 'ip-docs', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;`

/** El renglón del archivo donde cae la posición (en caracteres) que reporta Postgres. */
function renglon(sql, posicion) {
  return posicion ? sql.slice(0, Number(posicion)).split('\n').length : null
}

/** Aplica lo que falte. Se exporta para que `resetear.mjs` lo reuse sobre la misma conexión. */
export async function migrar({ cliente, consultar }, { log = console.log } = {}) {
  const estado = await verificarCentinela(consultar)
  if (estado === 'base-vacia') {
    log('· Base vacía: creo el schema demo (centinela + registro) antes de migrar.')
    await cliente.query(PRIMERA_VEZ)
  }
  await cliente.query(BUCKET_IP)

  const todas = ordenarMigraciones(readdirSync(DIR))
  const aplicadas = (await consultar('select nombre from demo.migraciones')).map((f) => f.nombre)
  const faltan = pendientes(todas, aplicadas)
  if (faltan.length === 0) { log(`✓ El demo ya tiene las ${todas.length} migraciones.`); return { aplicadas: 0 } }

  const avisos = []
  const alAviso = (n) => avisos.push(n.message)
  cliente.on('notice', alAviso)
  try {
    for (const m of faltan) {
      const sql = readFileSync(join(DIR, m), 'utf8')
      avisos.length = 0
      try {
        await cliente.query('begin')
        await cliente.query(sql)
        await cliente.query('insert into demo.migraciones (nombre) values ($1)', [m])
        await cliente.query('commit')
      } catch (e) {
        await cliente.query('rollback').catch(() => {})
        const donde = renglon(sql, e.position)
        throw new Error(`Falló ${m}${donde ? `, renglón ~${donde}` : ''}: ${e.code ?? ''} ${e.message}`)
      }
      const pendienteAMano = avisos.filter((a) => /PENDIENTE A MANO/i.test(a))
      log(`  ✓ ${m}${pendienteAMano.length ? `  ⚠ ${pendienteAMano.join(' | ')}` : ''}`)
    }
  } finally {
    cliente.off('notice', alAviso)
  }
  log(`✓ ${faltan.length} migraciones aplicadas (el demo tiene las ${todas.length}).`)
  return { aplicadas: faltan.length }
}

// Corrido como script (no importado por resetear.mjs).
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/scripts/demo/migrar.mjs')) {
  const db = await conectarDemo().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1) })
  try {
    await migrar(db)
  } catch (e) {
    console.error(`✗ ${e.message}`)
    process.exitCode = 1
  } finally {
    await db.cliente.end()
  }
}
