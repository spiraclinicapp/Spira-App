// Banco · los casos de la 0158 (cargar una visita en otro día). Corre las migraciones REALES, siembra los
// perfiles y arma una inscripción propia con dos visitas del cronograma y una suelta.
//
//   node scripts/banco-rls/casos-0158.mjs
//
// Prueba `registrar_visita_en_otra_fecha` (permisos por perfil, cada guarda, el camino feliz y lo que
// escribe), `fecha_minima_para_cargar_visita` y que `retroceder_etapa_visita` re-declarada deshace la
// carga del mismo día SIN cambiar lo que ya hacía la 0155. Sale con código 1 si algún caso falla.
import { crearBase, comoPerfil } from './base.mjs'
import { sembrar, PERFILES as P } from './sembrar.mjs'

// Hasta la 0158 inclusive: la 0158 tal como se escribió: la 0160 sacó el «sólo el mismo día» y deja cargar desde Concurrió (ver casos-0160.mjs).
const db = await crearBase({ hasta: 158 })
await sembrar(db)
const q = async (sql) => (await db.query(sql)).rows
const HOY = `((now() at time zone 'America/Argentina/Buenos_Aires')::date)`

// ── La inscripción de prueba, en el estudio que coordinan coordinadora1 y adminCoordinacion ──────────
const [{ protocol_id: PROTO }] = await q(`select protocol_id from public.protocol_coordinators where user_id = '${P.coordinadora1}' limit 1`)
const [{ id: PAC }] = await q(`insert into public.patients (full_name, created_by) values ('TEST-0158', '${P.gerencia}') returning id`)
const [{ id: INS }] = await q(`insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date)
  values ('${PAC}', '${PROTO}', '${P.gerencia}', ${HOY} - 60) returning id`)
const [{ id: VD1 }] = await q(`insert into public.visit_definitions (protocol_id, name, code, sort_order) values ('${PROTO}', 'Banco V1', 'BV1', 101) returning id`)
const [{ id: VD2 }] = await q(`insert into public.visit_definitions (protocol_id, name, code, sort_order) values ('${PROTO}', 'Banco V2', 'BV2', 102) returning id`)
const [{ id: V1 }] = await q(`insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date, real_date)
  values ('${INS}', '${VD1}', 'programada', ${HOY} - 20, ${HOY} - 20) returning id`)
const [{ id: V2 }] = await q(`insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date)
  values ('${INS}', '${VD2}', 'programada', ${HOY} - 7) returning id`)
const [{ id: SUELTA }] = await q(`insert into public.patient_visits (enrollment_id, kind, estimated_date)
  values ('${INS}', 'vnp', ${HOY} - 3) returning id`)

/** Deja la visita por llegar, como recién creada (y con un «no vino» si se pide). */
const reiniciar = (id, { noVino = false } = {}) => db.exec(`update public.patient_visits set
  arrived_at = null, real_date = null, attended_at = null, ready_at = null, left_at = null,
  cargada_en_otra_fecha_at = null, coordinator_id = null, coordinator_name = null,
  no_show_at = ${noVino ? 'now()' : 'null'}, wants_doctor = false, doctor_seen_at = null
  where id = '${id}'`)
const fila = async (id) => (await q(`select * from public.patient_visits where id = '${id}'`))[0]

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
const cargar = (visita, fecha, atendio) =>
  `select public.registrar_visita_en_otra_fecha('${visita}', ${fecha}, ${atendio ? `'${atendio}'` : 'null'})`
const volver = (visita, desde) => `select public.retroceder_etapa_visita('${visita}', '${desde}') as destino`

// ── registrar_visita_en_otra_fecha · permisos ───────────────────────────────────────────────────────
console.log('\nregistrar_visita_en_otra_fecha · permisos')
await reiniciar(V2)
await caso('sin sesión → 42501', () => rechaza(P.sinSesion, cargar(V2, `${HOY} - 7`, P.coordinadora1), '42501'))
await caso('coordinadora de OTRO estudio → 42501', () => rechaza(P.coordinadora23, cargar(V2, `${HOY} - 7`, P.coordinadora1), '42501'))
await caso('líder de Coordinación que no coordina el estudio → 42501', () => rechaza(P.liderCoordinacion, cargar(V2, `${HOY} - 7`, P.coordinadora1), '42501'))
await caso('farmacia → 42501', () => rechaza(P.farmacia, cargar(V2, `${HOY} - 7`, P.coordinadora1), '42501'))
await caso('contable → 42501', () => rechaza(P.contable, cargar(V2, `${HOY} - 7`, P.coordinadora1), '42501'))

// ── guardas ─────────────────────────────────────────────────────────────────────────────────────────
console.log('\nregistrar_visita_en_otra_fecha · guardas')
await caso('fecha = hoy → rechaza', () => rechaza(P.coordinadora1, cargar(V2, HOY, P.coordinadora1), '23514', 'anterior a hoy'))
await caso('fecha = mañana → rechaza', () => rechaza(P.coordinadora1, cargar(V2, `${HOY} + 1`, P.coordinadora1), '23514', 'anterior a hoy'))
await caso('fecha nula → rechaza', () => rechaza(P.coordinadora1, cargar(V2, 'null', P.coordinadora1), '23514', 'anterior a hoy'))
await caso('fecha anterior a la visita anterior del cronograma → rechaza', () => rechaza(P.coordinadora1, cargar(V2, `${HOY} - 21`, P.coordinadora1), '23514', 'No puede ser anterior al'))
await caso('sin quién la atendió → rechaza', () => rechaza(P.coordinadora1, cargar(V2, `${HOY} - 7`, null), '23514', 'Elegí quién'))
await caso('quien la atendió no coordina el estudio → 23514', () => rechaza(P.coordinadora1, cargar(V2, `${HOY} - 7`, P.coordinadora23), '23514', 'no coordina este estudio'))
await caso('con la llegada marcada → rechaza', async () => {
  await db.exec(`update public.patient_visits set arrived_at = now() where id = '${V2}'`)
  await rechaza(P.coordinadora1, cargar(V2, `${HOY} - 7`, P.coordinadora1), '23514', 'ya no está por llegar')
  await reiniciar(V2)
})
await caso('visita inexistente → 23503', () => rechaza(P.coordinadora1, cargar('00000000-0000-4000-8000-0000000000ff', `${HOY} - 7`, P.coordinadora1), '23503'))
// `check_violation` es 23514: los mensajes de la base que el front muestra tal cual.

// ── el camino feliz ─────────────────────────────────────────────────────────────────────────────────
console.log('\nregistrar_visita_en_otra_fecha · camino feliz')
await reiniciar(V2, { noVino: true })
await caso('coordinadora1 la carga a nombre de adminCoordinacion, con un «no vino» previo', async () => {
  await comoPerfil(db, P.coordinadora1, cargar(V2, `${HOY} - 7`, P.adminCoordinacion))
  const f = await fila(V2)
  const [{ esperada }] = await q(`select (${HOY} - 7)::text as esperada`)
  igual(String(f.real_date instanceof Date ? f.real_date.toISOString().slice(0, 10) : f.real_date).slice(0, 10), esperada, 'real_date')
  igual(f.attended_at, null, 'attended_at (sin hora inventada)')
  igual(f.arrived_at, null, 'arrived_at')
  igual(f.coordinator_id, P.adminCoordinacion, 'coordinator_id (quien la atendió, no quien clickea)')
  const [{ full_name }] = await q(`select full_name from public.users where id = '${P.adminCoordinacion}'`)
  igual(f.coordinator_name, full_name, 'coordinator_name (snapshot de public.users)')
  igual(f.no_show_at, null, 'no_show_at (vino)')
  if (!f.cargada_en_otra_fecha_at) throw new Error('cargada_en_otra_fecha_at quedó vacía')
  if (f.lleva_ip === null) throw new Error('lleva_ip no se selló al fecharse (trg_seal_visit_lleva_ip)')
})
await caso('la etapa derivada es «En atención»', async () => {
  const [{ operational_stage }] = await q(`select operational_stage from public.v_patient_visits where id = '${V2}'`)
  igual(operational_stage, 'inicio_atencion', 'operational_stage')
})
await caso('v_track_visits expone la columna, con la RLS de quien coordina', async () => {
  const r = await comoPerfil(db, P.coordinadora1, `select cargada_en_otra_fecha_at from public.v_track_visits where id = '${V2}'`)
  igual(r.length, 1, 'filas visibles')
  if (!r[0].cargada_en_otra_fecha_at) throw new Error('la vista no trae la columna')
})
await caso('v_track_visits no se la muestra a quien no coordina el estudio', async () => {
  const r = await comoPerfil(db, P.coordinadora23, `select 1 from public.v_track_visits where id = '${V2}'`)
  igual(r.length, 0, 'filas visibles para coordinadora23')
})
await caso('queda en audit_log, a nombre de quien la cargó', async () => {
  const r = await q(`select count(*)::int as n from public.audit_log
    where entity_id = '${V2}' and action = 'UPDATE' and actor_id = '${P.coordinadora1}'
      and after_data->>'cargada_en_otra_fecha_at' is not null`)
  if (r[0].n < 1) throw new Error('no hay un UPDATE auditado con la carga y su autor')
})
await caso('una segunda carga de la misma visita → rechaza', () => rechaza(P.coordinadora1, cargar(V2, `${HOY} - 6`, P.coordinadora1), '23514', 'ya no está por llegar'))
await caso('la fecha mínima exacta (la de la visita anterior) vale', async () => {
  await reiniciar(V2)
  await comoPerfil(db, P.coordinadora1, cargar(V2, `${HOY} - 20`, P.coordinadora1))
})
await caso('gerencia carga una suelta muy vieja: sin mínimo', async () => {
  await reiniciar(SUELTA)
  await comoPerfil(db, P.gerencia, cargar(SUELTA, `${HOY} - 300`, P.coordinadora1))
})
await caso('adminCoordinacion (asignado al estudio) también puede', async () => {
  await reiniciar(V2)
  await comoPerfil(db, P.adminCoordinacion, cargar(V2, `${HOY} - 7`, P.coordinadora1))
})

// ── fecha_minima_para_cargar_visita ─────────────────────────────────────────────────────────────────
console.log('\nfecha_minima_para_cargar_visita')
const minima = async (uid, id) => (await comoPerfil(db, uid, `select public.fecha_minima_para_cargar_visita('${id}')::text as m`))[0].m
await caso('V2 → la fecha de V1', async () => {
  const [{ v1 }] = await q(`select (${HOY} - 20)::text as v1`)
  igual(await minima(P.coordinadora1, V2), v1, 'mínima de V2')
})
await caso('V1 (la primera) → sin mínimo', async () => igual(await minima(P.coordinadora1, V1), null, 'mínima de V1'))
await caso('una suelta → sin mínimo', async () => igual(await minima(P.coordinadora1, SUELTA), null, 'mínima de la suelta'))
await caso('quien no ve la visita → sin mínimo (SECURITY INVOKER, no filtra datos)', async () => igual(await minima(P.coordinadora23, V2), null, 'mínima para coordinadora23'))
await caso('autenticado sin uid → sin mínimo (no ve nada)', async () => igual(await minima(P.sinSesion, V2), null, 'mínima sin uid'))
/** Como el rol `anon` de PostgREST (la API sin sesión): los `revoke … from anon` de la 0158. */
const comoAnon = async (sql) => {
  await db.exec(`set role anon`)
  try { await db.query(sql) } finally { await db.exec(`reset role`) }
}
const rechazaAnon = async (sql) => {
  try { await comoAnon(sql) } catch (e) {
    if (e.code !== '42501') throw new Error(`esperaba 42501 y vino ${e.code}: ${e.message}`)
    return
  }
  throw new Error('anon pudo llamarla')
}
await caso('anon no puede llamar fecha_minima_para_cargar_visita', () => rechazaAnon(`select public.fecha_minima_para_cargar_visita('${V2}')`))
await caso('anon no puede llamar registrar_visita_en_otra_fecha', () => rechazaAnon(cargar(V2, `${HOY} - 7`, P.coordinadora1)))
await caso('anon no puede llamar retroceder_etapa_visita', () => rechazaAnon(volver(V2, 'inicio_atencion')))

// ── retroceder_etapa_visita re-declarada ────────────────────────────────────────────────────────────
console.log('\nretroceder_etapa_visita (0158)')
await caso('deshace la carga hecha HOY → Por llegar, y limpia la columna', async () => {
  await reiniciar(V2)
  await comoPerfil(db, P.coordinadora1, cargar(V2, `${HOY} - 7`, P.coordinadora1))
  const [{ destino }] = await comoPerfil(db, P.coordinadora1, volver(V2, 'inicio_atencion'))
  igual(destino, 'por_llegar', 'destino')
  const f = await fila(V2)
  igual(f.real_date, null, 'real_date')
  igual(f.attended_at, null, 'attended_at')
  igual(f.cargada_en_otra_fecha_at, null, 'cargada_en_otra_fecha_at')
})
await caso('una carga de AYER ya no se deshace', async () => {
  await reiniciar(V2)
  await comoPerfil(db, P.coordinadora1, cargar(V2, `${HOY} - 7`, P.coordinadora1))
  await db.exec(`update public.patient_visits set cargada_en_otra_fecha_at = now() - interval '1 day' where id = '${V2}'`)
  await rechaza(P.coordinadora1, volver(V2, 'inicio_atencion'), '23514', 'Se registró otro día')
})
await caso('quien no coordina el estudio no la deshace → 42501', async () => {
  await reiniciar(V2)
  await comoPerfil(db, P.coordinadora1, cargar(V2, `${HOY} - 7`, P.coordinadora1))
  await rechaza(P.coordinadora23, volver(V2, 'inicio_atencion'), '42501')
})
await caso('«desde» viejo → rechaza (no retrocede dos etapas)', () => rechaza(P.coordinadora1, volver(V2, 'concurrio_al_centro'), '23514', 'cambió de etapa'))
await caso('0155 intacta: un inicio sin sello ni carga (anterior a la 0102) no se deshace', async () => {
  await reiniciar(V2)
  await db.exec(`update public.patient_visits set real_date = ${HOY} - 7 where id = '${V2}'`)
  await rechaza(P.coordinadora1, volver(V2, 'inicio_atencion'), '23514', 'Se registró otro día')
})
await caso('0155 intacta: el inicio de hoy (start_visit_attention) se deshace y vuelve a Concurrió', async () => {
  await reiniciar(V2)
  await db.exec(`update public.patient_visits set arrived_at = now() where id = '${V2}'`)
  await comoPerfil(db, P.coordinadora1, `select public.start_visit_attention('${V2}', ${HOY})`)
  const [{ destino }] = await comoPerfil(db, P.coordinadora1, volver(V2, 'inicio_atencion'))
  igual(destino, 'concurrio_al_centro', 'destino')
})
await caso('0155 intacta: la llegada de hoy se deshace', async () => {
  const [{ destino }] = await comoPerfil(db, P.coordinadora1, volver(V2, 'concurrio_al_centro'))
  igual(destino, 'por_llegar', 'destino')
})
await caso('0155 intacta: con atención médica pedida no se vuelve a Por llegar', async () => {
  await reiniciar(V2)
  await comoPerfil(db, P.coordinadora1, cargar(V2, `${HOY} - 7`, P.coordinadora1))
  await db.exec(`update public.patient_visits set wants_doctor = true where id = '${V2}'`)
  await rechaza(P.coordinadora1, volver(V2, 'inicio_atencion'), '23514', 'atención médica')
})

console.log(`\n${ok} de ${ok + fallas.length} casos bien.`)
if (fallas.length) { console.log('Fallaron:', fallas); process.exit(1) }
