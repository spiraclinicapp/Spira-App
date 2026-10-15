// Banco · los casos de la 0160 (volver atrás una marca de otro día, y «Vino otro día» desde Concurrió).
// Corre TODAS las migraciones reales, siembra los perfiles y arma una inscripción propia con dos visitas del
// cronograma, como `casos-0158.mjs`.
//
//   node scripts/banco-rls/casos-0160.mjs
//
// Las dos funciones se re-declaran enteras, así que además de lo nuevo se prueba lo que tenía que quedar
// igual: las guardas, los permisos, el `p_desde`, el camino de la 0158 desde Por llegar y el de la 0159
// (gerencia como quien atendió). `casos-0158.mjs` y `casos-0159.mjs` siguen probando su migración tal como
// se escribió (corren hasta ella). Sale con código 1 si algún caso falla.
import { crearBase, comoPerfil } from './base.mjs'
import { sembrar, PERFILES as P } from './sembrar.mjs'

const db = await crearBase()
await sembrar(db)
const q = async (sql) => (await db.query(sql)).rows
const HOY = `((now() at time zone 'America/Argentina/Buenos_Aires')::date)`

// ── La inscripción de prueba, en el estudio que coordinan coordinadora1 y adminCoordinacion ──────────
const [{ protocol_id: PROTO }] = await q(`select protocol_id from public.protocol_coordinators where user_id = '${P.coordinadora1}' limit 1`)
const [{ id: PAC }] = await q(`insert into public.patients (full_name, created_by) values ('TEST-0160', '${P.gerencia}') returning id`)
const [{ id: INS }] = await q(`insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date)
  values ('${PAC}', '${PROTO}', '${P.gerencia}', ${HOY} - 60) returning id`)
const [{ id: VD1 }] = await q(`insert into public.visit_definitions (protocol_id, name, code, sort_order) values ('${PROTO}', 'Banco V1', 'BV1', 101) returning id`)
const [{ id: VD2 }] = await q(`insert into public.visit_definitions (protocol_id, name, code, sort_order) values ('${PROTO}', 'Banco V2', 'BV2', 102) returning id`)
await q(`insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date, real_date)
  values ('${INS}', '${VD1}', 'programada', ${HOY} - 20, ${HOY} - 20)`)
const [{ id: V2 }] = await q(`insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date)
  values ('${INS}', '${VD2}', 'programada', ${HOY} - 7) returning id`)

/** Deja la visita por llegar, como recién creada. */
const reiniciar = (id) => db.exec(`update public.patient_visits set
  arrived_at = null, real_date = null, attended_at = null, ready_at = null, left_at = null,
  cargada_en_otra_fecha_at = null, coordinator_id = null, coordinator_name = null, citacion_antes_de_adelantar = null,
  estimated_date = ${HOY} - 7, no_show_at = null, wants_doctor = false, doctor_seen_at = null
  where id = '${id}'`)
/** La llegada, hace `dias` días (0 = ahora). Argentina no tiene horario de verano: restar 24 h es restar un día. */
const llego = (id, dias) => db.exec(`update public.patient_visits set arrived_at = now() - interval '${dias} days' where id = '${id}'`)
const fila = async (id) => (await q(`select *, real_date::text as real_txt, estimated_date::text as citada_txt
  from public.patient_visits where id = '${id}'`))[0]
const fecha = async (expr) => (await q(`select (${expr})::text as f`))[0].f
const etapa = async (id) => (await q(`select operational_stage from public.v_patient_visits where id = '${id}'`))[0].operational_stage

// ── El mini-arnés ───────────────────────────────────────────────────────────────────────────────────
let ok = 0
const fallas = []
const caso = async (nombre, fn) => {
  try { await fn(); ok++; console.log(`  ✓ ${nombre}`) } catch (e) { fallas.push(nombre); console.log(`  ✗ ${nombre}\n      ${e.message}`) }
}
const igual = (a, b, que) => { if (a !== b) throw new Error(`${que}: esperaba ${JSON.stringify(b)} y vino ${JSON.stringify(a)}`) }
/** La llamada tiene que fallar con ese código (y, si se pasa, con ese texto). */
const rechaza = async (uid, sql, codigo, texto) => {
  try { await comoPerfil(db, uid, sql) } catch (e) {
    if (codigo && e.code !== codigo) throw new Error(`esperaba ${codigo} y vino ${e.code}: ${e.message}`)
    if (texto && !e.message.includes(texto)) throw new Error(`el mensaje no dice «${texto}»: ${e.message}`)
    return
  }
  throw new Error('no la rechazó')
}
const cargar = (visita, f, atendio) =>
  `select public.registrar_visita_en_otra_fecha('${visita}', ${f}, ${atendio ? `'${atendio}'` : 'null'})`
const volver = (visita, desde) => `select public.retroceder_etapa_visita('${visita}', '${desde}') as destino`
const destino = async (uid, visita, desde) => (await comoPerfil(db, uid, volver(visita, desde)))[0].destino

// ── retroceder_etapa_visita · una marca de OTRO día ─────────────────────────────────────────────────
console.log('\nretroceder_etapa_visita · marcas de otro día (0160)')
await caso('la llegada de hace 4 días se deshace → Por llegar', async () => {
  await reiniciar(V2); await llego(V2, 4)
  igual(await destino(P.coordinadora1, V2, 'concurrio_al_centro'), 'por_llegar', 'destino')
  igual((await fila(V2)).arrived_at, null, 'arrived_at')
})
await caso('la llegada ADELANTADA de otro día devuelve la citación', async () => {
  await reiniciar(V2); await llego(V2, 4)
  await db.exec(`update public.patient_visits set estimated_date = ${HOY} - 4, citacion_antes_de_adelantar = ${HOY} + 10 where id = '${V2}'`)
  await destino(P.coordinadora1, V2, 'concurrio_al_centro')
  const f = await fila(V2)
  igual(f.citada_txt, await fecha(`${HOY} + 10`), 'estimated_date')
  igual(f.citacion_antes_de_adelantar, null, 'citacion_antes_de_adelantar')
})
await caso('el inicio de hace 3 días se deshace → Concurrió, sin fecha ni sello', async () => {
  await reiniciar(V2)
  await db.exec(`update public.patient_visits set arrived_at = now() - interval '3 days', attended_at = now() - interval '3 days',
    real_date = ${HOY} - 3 where id = '${V2}'`)
  igual(await destino(P.coordinadora1, V2, 'inicio_atencion'), 'concurrio_al_centro', 'destino')
  const f = await fila(V2)
  igual(f.real_date, null, 'real_date')
  igual(f.attended_at, null, 'attended_at')
  if (!f.arrived_at) throw new Error('se llevó también la llegada')
})
await caso('una carga de AYER se deshace (antes rebotaba) → Por llegar, y limpia la columna', async () => {
  await reiniciar(V2)
  await comoPerfil(db, P.coordinadora1, cargar(V2, `${HOY} - 7`, P.coordinadora1))
  await db.exec(`update public.patient_visits set cargada_en_otra_fecha_at = now() - interval '1 day' where id = '${V2}'`)
  igual(await destino(P.coordinadora1, V2, 'inicio_atencion'), 'por_llegar', 'destino')
  const f = await fila(V2)
  igual(f.real_date, null, 'real_date')
  igual(f.cargada_en_otra_fecha_at, null, 'cargada_en_otra_fecha_at')
})
await caso('un inicio sin sello ni carga (anterior a la 0102) se deshace', async () => {
  await reiniciar(V2)
  await db.exec(`update public.patient_visits set real_date = ${HOY} - 7 where id = '${V2}'`)
  igual(await destino(P.coordinadora1, V2, 'inicio_atencion'), 'por_llegar', 'destino')
})
await caso('lo deshecho queda en audit_log, a nombre de quien volvió', async () => {
  const r = await q(`select count(*)::int as n from public.audit_log
    where entity_id = '${V2}' and action = 'UPDATE' and actor_id = '${P.coordinadora1}'
      and before_data->>'real_date' is not null and after_data->>'real_date' is null`)
  if (r[0].n < 1) throw new Error('no hay un UPDATE auditado que borre la fecha')
})

// ── retroceder_etapa_visita · lo que tenía que quedar igual ─────────────────────────────────────────
console.log('\nretroceder_etapa_visita · guardas y permisos (sin cambios)')
await caso('llegada de otro día con atención médica pedida → rechaza', async () => {
  await reiniciar(V2); await llego(V2, 4)
  await db.exec(`update public.patient_visits set wants_doctor = true where id = '${V2}'`)
  await rechaza(P.coordinadora1, volver(V2, 'concurrio_al_centro'), '23514', 'atención médica')
})
await caso('inicio de otro día con un retest pedido → rechaza', async () => {
  await reiniciar(V2)
  await db.exec(`update public.patient_visits set real_date = ${HOY} - 7 where id = '${V2}'`)
  const [{ id: R }] = await q(`insert into public.patient_visits (enrollment_id, kind, estimated_date, retest_of_visit_id)
    values ('${INS}', 'retest', ${HOY} + 2, '${V2}') returning id`)
  try {
    await rechaza(P.coordinadora1, volver(V2, 'inicio_atencion'), '23514', 'retest')
  } finally {
    await db.exec(`delete from public.patient_visits where id = '${R}'`)
  }
})
await caso('una visita completa de otro día no vuelve', async () => {
  await reiniciar(V2)
  await db.exec(`update public.patient_visits set real_date = ${HOY} - 7, ready_at = now() - interval '7 days' where id = '${V2}'`)
  await rechaza(P.coordinadora1, volver(V2, 'fin_atencion'), '23514', 'completa')
})
await caso('«desde» viejo → rechaza (no retrocede dos etapas)', async () => {
  await reiniciar(V2); await llego(V2, 4)
  await rechaza(P.coordinadora1, volver(V2, 'inicio_atencion'), '23514', 'cambió de etapa')
})
await caso('coordinadora de OTRO estudio no deshace un inicio de otro día → 42501', async () => {
  await reiniciar(V2)
  await db.exec(`update public.patient_visits set real_date = ${HOY} - 7 where id = '${V2}'`)
  await rechaza(P.coordinadora23, volver(V2, 'inicio_atencion'), '42501')
})
await caso('farmacia no deshace una llegada de otro día → 42501', async () => {
  await reiniciar(V2); await llego(V2, 4)
  await rechaza(P.farmacia, volver(V2, 'concurrio_al_centro'), '42501')
})
await caso('sin sesión → 42501', () => rechaza(P.sinSesion, volver(V2, 'concurrio_al_centro'), '42501'))
await caso('anon no puede llamarla', async () => {
  await db.exec(`set role anon`)
  try { await db.query(volver(V2, 'concurrio_al_centro')); throw new Error('anon pudo llamarla') } catch (e) {
    if (e.code !== '42501') throw e
  } finally { await db.exec(`reset role`) }
})

// ── registrar_visita_en_otra_fecha · desde Concurrió ───────────────────────────────────────────────
console.log('\nregistrar_visita_en_otra_fecha · desde Concurrió (0160)')
await caso('llegó hace 4 días: se carga con ESE día, la llegada queda', async () => {
  await reiniciar(V2); await llego(V2, 4)
  const antes = (await fila(V2)).arrived_at
  await comoPerfil(db, P.coordinadora1, cargar(V2, `${HOY} - 4`, P.adminCoordinacion))
  const f = await fila(V2)
  igual(f.real_txt, await fecha(`${HOY} - 4`), 'real_date')
  igual(String(f.arrived_at), String(antes), 'arrived_at (sin tocar)')
  igual(f.attended_at, null, 'attended_at (sin hora inventada)')
  igual(f.coordinator_id, P.adminCoordinacion, 'coordinator_id (quien la atendió)')
  if (!f.cargada_en_otra_fecha_at) throw new Error('cargada_en_otra_fecha_at quedó vacía')
  igual(await etapa(V2), 'inicio_atencion', 'operational_stage')
})
await caso('…y «Volver» la devuelve a Concurrió con su llegada', async () => {
  igual(await destino(P.coordinadora1, V2, 'inicio_atencion'), 'concurrio_al_centro', 'destino')
  const f = await fila(V2)
  igual(f.real_date, null, 'real_date')
  igual(f.cargada_en_otra_fecha_at, null, 'cargada_en_otra_fecha_at')
  if (!f.arrived_at) throw new Error('se llevó la llegada')
})
await caso('con otra fecha que la de la llegada → rechaza nombrando el día', async () => {
  await reiniciar(V2); await llego(V2, 4)
  await rechaza(P.coordinadora1, cargar(V2, `${HOY} - 5`, P.coordinadora1), '23514', 'Llegó el')
  await rechaza(P.coordinadora1, cargar(V2, `${HOY} - 3`, P.coordinadora1), '23514', 'Llegó el')
})
await caso('llegó HOY → rechaza (para eso está «Iniciar atención»)', async () => {
  await reiniciar(V2); await llego(V2, 0)
  await rechaza(P.coordinadora1, cargar(V2, `${HOY} - 1`, P.coordinadora1), '23514', 'Llegó hoy')
})
await caso('llegó antes de la visita anterior del cronograma → rechaza por el mínimo', async () => {
  await reiniciar(V2); await llego(V2, 25)
  await rechaza(P.coordinadora1, cargar(V2, `${HOY} - 25`, P.coordinadora1), '23514', 'No puede ser anterior al')
})
await caso('ya en atención → rechaza', async () => {
  await reiniciar(V2); await llego(V2, 4)
  await db.exec(`update public.patient_visits set real_date = ${HOY} - 4 where id = '${V2}'`)
  await rechaza(P.coordinadora1, cargar(V2, `${HOY} - 4`, P.coordinadora1), '23514', 'ya está en atención')
})
await caso('coordinadora de OTRO estudio → 42501', async () => {
  await reiniciar(V2); await llego(V2, 4)
  await rechaza(P.coordinadora23, cargar(V2, `${HOY} - 4`, P.coordinadora1), '42501')
})
await caso('gerencia la carga a su nombre (0159 sigue)', async () => {
  await reiniciar(V2); await llego(V2, 4)
  await comoPerfil(db, P.gerencia, cargar(V2, `${HOY} - 4`, P.gerencia))
  igual((await fila(V2)).coordinator_id, P.gerencia, 'coordinator_id')
})

// ── registrar_visita_en_otra_fecha · Por llegar, como en la 0158/0159 ──────────────────────────────
console.log('\nregistrar_visita_en_otra_fecha · desde Por llegar (sin cambios)')
await caso('por llegar: se carga con una fecha pasada', async () => {
  await reiniciar(V2)
  await comoPerfil(db, P.coordinadora1, cargar(V2, `${HOY} - 7`, P.coordinadora1))
  const f = await fila(V2)
  igual(f.real_txt, await fecha(`${HOY} - 7`), 'real_date')
  igual(f.arrived_at, null, 'arrived_at')
})
await caso('por llegar: fecha = hoy → rechaza', async () => {
  await reiniciar(V2)
  await rechaza(P.coordinadora1, cargar(V2, HOY, P.coordinadora1), '23514', 'anterior a hoy')
})
await caso('por llegar: sin quién la atendió → rechaza', () => rechaza(P.coordinadora1, cargar(V2, `${HOY} - 7`, null), '23514', 'Elegí quién'))
await caso('por llegar: quien la atendió no coordina ni es de gerencia → 23514', () =>
  rechaza(P.coordinadora1, cargar(V2, `${HOY} - 7`, P.coordinadora23), '23514', 'ni es de gerencia'))
await caso('anon no puede llamarla', async () => {
  await db.exec(`set role anon`)
  try { await db.query(cargar(V2, `${HOY} - 7`, P.coordinadora1)); throw new Error('anon pudo llamarla') } catch (e) {
    if (e.code !== '42501') throw e
  } finally { await db.exec(`reset role`) }
})

console.log(`\n${ok} de ${ok + fallas.length} casos bien.`)
if (fallas.length) { console.log('Fallaron:', fallas); process.exit(1) }
