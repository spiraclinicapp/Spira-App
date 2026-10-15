// Banco · los casos de la 0159 (gerencia también puede figurar como quien atendió una visita cargada en otra
// fecha). Corre las migraciones REALES y arma una visita por llegar en un estudio SIN coordinadores, como
// TEST-QA en prod.
//
//   node scripts/banco-rls/casos-0159.mjs
//
// Lo de la 0158 sigue en `casos-0158.mjs` (correlo también: la función se re-declara entera).
import { crearBase, comoPerfil } from './base.mjs'
import { sembrar, PERFILES as P } from './sembrar.mjs'

// Hasta la 0159 inclusive: la 0159 tal como se escribió: la 0160 re-declara la función (ver casos-0160.mjs).
const db = await crearBase({ hasta: 159 })
await sembrar(db)
const q = async (sql) => (await db.query(sql)).rows
const HOY = `((now() at time zone 'America/Argentina/Buenos_Aires')::date)`

// Un estudio NUEVO, sin nadie en protocol_coordinators (el caso de TEST-QA).
const [{ id: PROTO }] = await q(`insert into public.protocols (code, name, legal_entity, created_by)
  select 'TEST-0159', 'Banco 0159', (enum_range(null::legal_entity))[1], '${P.gerencia}' returning id`)
await db.exec(`delete from public.protocol_coordinators where protocol_id = '${PROTO}'`) // por si la 0154 lo asignó
const [{ id: PAC }] = await q(`insert into public.patients (full_name, created_by) values ('TEST-0159', '${P.gerencia}') returning id`)
const [{ id: INS }] = await q(`insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date)
  values ('${PAC}', '${PROTO}', '${P.gerencia}', ${HOY} - 60) returning id`)
const [{ id: V }] = await q(`insert into public.patient_visits (enrollment_id, kind, estimated_date)
  values ('${INS}', 'vnp', ${HOY} - 7) returning id`)
// Un estudio CON coordinadora (el de coordinadora1, sembrado), para ver que lo de antes sigue.
const [{ protocol_id: PROTO1 }] = await q(`select protocol_id from public.protocol_coordinators where user_id = '${P.coordinadora1}' limit 1`)
const [{ id: INS1 }] = await q(`insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date)
  values ('${PAC}', '${PROTO1}', '${P.gerencia}', ${HOY} - 60) returning id`)
const [{ id: V1 }] = await q(`insert into public.patient_visits (enrollment_id, kind, estimated_date)
  values ('${INS1}', 'vnp', ${HOY} - 7) returning id`)

const reiniciar = (id) => db.exec(`update public.patient_visits set arrived_at = null, real_date = null, attended_at = null,
  ready_at = null, cargada_en_otra_fecha_at = null, coordinator_id = null, coordinator_name = null where id = '${id}'`)
const cargar = (visita, atendio) => `select public.registrar_visita_en_otra_fecha('${visita}', ${HOY} - 7, '${atendio}')`

let ok = 0
const fallas = []
const caso = async (nombre, fn) => {
  try { await fn(); ok++; console.log(`  ✓ ${nombre}`) } catch (e) { fallas.push(nombre); console.log(`  ✗ ${nombre}\n      ${e.message}`) }
}
const rechaza = async (uid, sql, codigo, texto) => {
  try { await comoPerfil(db, uid, sql) } catch (e) {
    if (codigo && e.code !== codigo) throw new Error(`esperaba ${codigo} y vino ${e.code}: ${e.message}`)
    if (texto && !e.message.includes(texto)) throw new Error(`el mensaje no dice «${texto}»: ${e.message}`)
    return
  }
  throw new Error('no la rechazó')
}
const quien = async (id) => (await q(`select coordinator_id, real_date is not null as fechada from public.patient_visits where id = '${id}'`))[0]

console.log('\n0159 · quién la atendió')
await caso('estudio SIN coordinadores: gerencia se nombra a sí misma', async () => {
  await reiniciar(V)
  await comoPerfil(db, P.gerencia, cargar(V, P.gerencia))
  const f = await quien(V)
  if (f.coordinator_id !== P.gerencia || !f.fechada) throw new Error(`quedó ${JSON.stringify(f)}`)
})
await caso('estudio SIN coordinadores: alguien que tampoco es de gerencia (la cuenta mixta) → rechaza', async () => {
  await reiniciar(V)
  await rechaza(P.gerencia, cargar(V, P.mixta), '23514', 'ni es de gerencia')
})
await caso('alguien que no coordina el estudio ni es de gerencia → rechaza con el mensaje nuevo', async () => {
  await reiniciar(V1)
  await rechaza(P.coordinadora1, cargar(V1, P.coordinadora23), '23514', 'no coordina este estudio ni es de gerencia')
})
await caso('lo de la 0158 sigue: la coordinadora del estudio se nombra a sí misma', async () => {
  await reiniciar(V1)
  await comoPerfil(db, P.coordinadora1, cargar(V1, P.coordinadora1))
  const f = await quien(V1)
  if (f.coordinator_id !== P.coordinadora1) throw new Error(`quedó ${JSON.stringify(f)}`)
})
await caso('una coordinadora del estudio puede nombrar a alguien de gerencia', async () => {
  await reiniciar(V1)
  await comoPerfil(db, P.coordinadora1, cargar(V1, P.gerencia))
  const f = await quien(V1)
  if (f.coordinator_id !== P.gerencia) throw new Error(`quedó ${JSON.stringify(f)}`)
})
await caso('quién puede LLAMARLA no cambió: una coordinadora de otro estudio sigue sin poder', async () => {
  await reiniciar(V1)
  await rechaza(P.coordinadora23, cargar(V1, P.gerencia), '42501')
})

console.log(`\n${ok} de ${ok + fallas.length} casos bien.`)
if (fallas.length) { console.log('Fallaron:', fallas); process.exit(1) }
