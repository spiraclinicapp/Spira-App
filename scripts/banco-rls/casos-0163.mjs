// Banco · los casos de la 0163 (sincronizar el cronograma sin pisar las fechas que se dieron a mano).
// Corre las migraciones reales HASTA LA 0162, siembra los perfiles, saca una foto, aplica la 0163 encima de
// esos datos y arma un estudio propio (TEST-0163) para que los conteos del sync no dependan del sembrado al
// azar. Queda fijado a la 0163 sin tocarlo cuando lleguen otras.
//
//   node scripts/banco-rls/casos-0163.mjs [copia-sin-comentarios.sql]
//
// Con un archivo, aplica ESE SQL en vez del de supabase/migrations/: así se prueba la copia que se le pasa al
// Director (`scripts/sql-sin-comentarios.mjs`), que es la que de verdad corre en prod.
//
// Prueba que la 0163 no escribe datos, la deducción de las filas viejas (D6 del plan), las cuatro clases, que
// preview y aplicar cuentan lo mismo clave por clave, lo que el sync conserva y lo que mueve, las salidas de
// una fecha a mano, los permisos y lo de la 0161 (la cancelada sigue sin fecha; sin randomización no
// revienta). Lo único que el banco no puede probar es el bloqueo contra otra sesión: PGlite es una sola
// conexión. Sale con código 1 si algún caso falla.
import { readFileSync } from 'node:fs'
import { crearBase, comoPerfil, migracion } from './base.mjs'
import { sembrar, PERFILES as P } from './sembrar.mjs'

const copia = process.argv[2]
const sql0163 = copia ? readFileSync(copia, 'utf8') : migracion(163).sql

const db = await crearBase({ hasta: 162 })
await sembrar(db)
const q = async (sql) => (await db.query(sql)).rows
const HOY = `((now() at time zone 'America/Argentina/Buenos_Aires')::date)`

// ── El mini-arnés (el de casos-0161) ────────────────────────────────────────────────────────────────
let ok = 0
const fallas = []
const caso = async (nombre, fn) => {
  try { await fn(); ok++; console.log(`  ✓ ${nombre}`) } catch (e) { fallas.push(nombre); console.log(`  ✗ ${nombre}\n      ${e.message}`) }
}
const igual = (a, b, que) => {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)]
  if (x !== y) throw new Error(`${que}: esperaba ${y} y vino ${x}`)
}
/** La llamada tiene que fallar con ese código (y, si se pasa, con ese texto). */
const rechaza = async (uid, sql, codigo, texto) => {
  try { await comoPerfil(db, uid, sql) } catch (e) {
    if (codigo && e.code !== codigo) throw new Error(`esperaba ${codigo} y vino ${e.code}: ${e.message}`)
    if (texto && !e.message.includes(texto)) throw new Error(`el mensaje no dice «${texto}»: ${e.message}`)
    return
  }
  throw new Error('no la rechazó')
}
const fecha = async (expr) => (await q(`select (${expr})::text as f`))[0].f

// ── La 0163 sobre los datos de antes: no escribe nada ───────────────────────────────────────────────
// La foto deja afuera la columna nueva (con ella, el texto de cada fila cambia aunque nadie escriba).
const fotoVisitas = async () => (await q(`select md5(string_agg(concat_ws(',', id, estimated_date, window_start,
    window_end, real_date, arrived_at, no_show_at, updated_at), '|' order by id)) as h from public.patient_visits`))[0].h
const auditoria = async () => (await q(`select count(*)::int as n from public.audit_log`))[0].n
const estados = async () => (await q(`select id::text, computed_status::text as s, operational_stage as e
  from public.v_patient_visits order by id`)).map((r) => `${r.id}:${r.s}:${r.e}`).join('\n')

const antes = { visitas: await fotoVisitas(), audit: await auditoria(), estados: await estados() }

console.log('\nla 0163 sobre los datos de antes')
await caso('entra sobre las filas sembradas y su sonda da las cinco en true', async () => {
  const resultados = await db.exec(sql0163)
  const sonda = resultados.at(-1).rows[0]
  for (const [k, v] of Object.entries(sonda)) igual(v, true, `sonda.${k}`)
})
await caso('…no escribe ninguna visita ni deja líneas en audit_log', async () => {
  igual(await fotoVisitas(), antes.visitas, 'patient_visits')
  igual(await auditoria(), antes.audit, 'audit_log')
})
await caso('…el estado y la etapa de cada visita sembrada son los mismos', async () => {
  igual(await estados(), antes.estados, 'v_patient_visits')
})
await caso('…la columna nueva nace vacía en todas', async () => {
  igual((await q(`select count(*)::int as n from public.patient_visits where fecha_del_cronograma is not null`))[0].n, 0, 'con fecha')
})
await caso('correrla dos veces: igual (idempotente, sin escribir)', async () => {
  await db.exec(sql0163)
  igual(await fotoVisitas(), antes.visitas, 'patient_visits')
  igual(await auditoria(), antes.audit, 'audit_log')
})

// ── El estudio de prueba ────────────────────────────────────────────────────────────────────────────
// Dos definiciones automáticas: A (día 10, ±2) y B (día 20, ±3). coordinadora1 lo coordina.
const [{ id: PROTO }] = await q(`insert into public.protocols (code, name, legal_entity, created_by)
  select 'TEST-0163', 'Banco 0163', legal_entity, '${P.gerencia}' from public.protocols limit 1 returning id`)
await q(`insert into public.protocol_coordinators (protocol_id, user_id) values ('${PROTO}', '${P.coordinadora1}')`)
const nuevaDef = async (code, orden, modo, dia, menos, mas) => (await q(`insert into public.visit_definitions
  (protocol_id, name, code, sort_order, date_mode, offset_days, window_minus, window_plus)
  values ('${PROTO}', 'Banco ${code}', '${code}', ${orden}, '${modo}', ${dia}, ${menos}, ${mas}) returning id`))[0].id
const VDA = await nuevaDef('A', 101, 'automatica', 10, 2, 2)
const VDB = await nuevaDef('B', 102, 'automatica', 20, 3, 3)

let nPac = 0
/** Una inscripción activa en TEST-0163, randomizada hace `hace` días (dispara generate_patient_visits). */
const inscribir = async (hace) => {
  nPac++
  const [{ id: pac }] = await q(`insert into public.patients (full_name, created_by) values ('TEST-0163-${nPac}', '${P.gerencia}') returning id`)
  const [{ id: ins }] = await q(`insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date)
    values ('${pac}', '${PROTO}', '${P.gerencia}', ${HOY} - ${hace} - 30) returning id`)
  await db.exec(`update public.enrollments set randomization_date = ${HOY} - ${hace} where id = '${ins}'`)
  return ins
}
const visita = async (ins, def) => (await q(`select id from public.patient_visits
  where enrollment_id = '${ins}' and visit_def_id = '${def}' and kind = 'programada'`))[0].id
const fila = async (id) => (await q(`select estimated_date::text as fecha, window_start::text as desde,
  window_end::text as hasta, fecha_del_cronograma::text as anotada, turno_cancelado_at
  from public.patient_visits where id = '${id}'`))[0]
const sync = async (aplicar, quien = P.gerencia) =>
  (await comoPerfil(db, quien, `select public.sync_protocol_schedule('${PROTO}', ${aplicar}) as r`))[0].r
/** La clase que le da la clasificación (como superusuario: a la app no se le deja llamarla). */
const clase = async (id) => (await q(`select clase from public.cronograma_por_sincronizar('${PROTO}') where visita_id = '${id}'`))[0]?.clase ?? null
/** «Reprogramar» como lo hace el front (rescheduleVisit): UPDATE directo con la RLS de coordinadora1. */
const reprogramar = (id, expr) => comoPerfil(db, P.coordinadora1,
  `update public.patient_visits set estimated_date = ${expr}, no_show_at = null, no_show_by = null where id = '${id}' returning id`)
/** Preview y aplicar, comparados clave por clave (menos `applied`). Devuelve lo aplicado. */
const aplicarIgualQuePreview = async () => {
  const previa = await sync(false)
  const hecha = await sync(true)
  for (const k of ['creates', 'moves', 'deletes', 'attended_divergent', 'fechas', 'respetadas', 'con_marcas', 'fuera_de_ventana']) {
    igual(hecha[k], previa[k], `${k} (preview = aplicar)`)
  }
  return hecha
}

// ── generate_patient_visits ─────────────────────────────────────────────────────────────────────────
console.log('\ngenerate_patient_visits')
const I1 = await inscribir(5)
const V1A = await visita(I1, VDA)
const V1B = await visita(I1, VDB)
await caso('randomizar → las automáticas nacen con la fecha del cronograma anotada', async () => {
  const f = await fila(V1A)
  igual(f.anotada, f.fecha, 'fecha_del_cronograma = estimated_date')
  igual(f.fecha, await fecha(`${HOY} - 5 + 10`), 'estimated_date (rando + 10)')
})

// ── La clasificación ────────────────────────────────────────────────────────────────────────────────
console.log('\ncronograma_por_sincronizar')
await caso('recién generadas: del_cronograma, y nada que hacer', async () => {
  igual(await clase(V1A), 'del_cronograma', 'clase')
  const r = await sync(false)
  igual([r.creates, r.moves, r.fechas, r.respetadas, r.con_marcas, r.fuera_de_ventana], [0, 0, 0, 0, 0, []], 'preview')
})
await caso('desde la app nadie la puede llamar → 42501', async () => {
  await rechaza(P.gerencia, `select * from public.cronograma_por_sincronizar('${PROTO}')`, '42501')
  await rechaza(P.coordinadora1, `select * from public.cronograma_por_sincronizar('${PROTO}')`, '42501')
})

// ── Lo que el sync conserva ─────────────────────────────────────────────────────────────────────────
console.log('\nsync_protocol_schedule · una fecha a mano se conserva')
await caso('reprogramada por la coordinadora → a_mano; el preview la cuenta y no la mueve', async () => {
  await reprogramar(V1A, `${HOY} - 5 + 11`)
  igual(await clase(V1A), 'a_mano', 'clase')
  const r = await sync(false)
  igual([r.moves, r.fechas, r.respetadas], [0, 0, 1], 'moves, fechas, respetadas')
})
await caso('sólo crear (una definición nueva): crea, conserva la reprogramada, preview = aplicar', async () => {
  const VDC = await nuevaDef('C', 103, 'automatica', 30, 2, 2)
  const r = await aplicarIgualQuePreview()
  igual([r.creates, r.moves, r.respetadas], [1, 0, 1], 'creates, moves, respetadas')
  igual((await fila(V1A)).fecha, await fecha(`${HOY} - 5 + 11`), 'la reprogramada, en su fecha')
  const nueva = await fila(await visita(I1, VDC))
  igual(nueva.anotada, nueva.fecha, 'la creada nace con la fecha anotada')
})
await caso('…y la siguiente vez sigue diciéndolo, sin nada que aplicar', async () => {
  const r = await sync(false)
  igual([r.creates, r.moves, r.respetadas], [0, 0, 1], 'creates, moves, respetadas')
})

console.log('\nsync_protocol_schedule · cambió la definición')
const I2 = await inscribir(5)
const V2A = await visita(I2, VDA)
await caso('el offset de A pasa de 10 a 14: la del cronograma se mueve, la reprogramada no', async () => {
  await db.exec(`update public.visit_definitions set offset_days = 14 where id = '${VDA}'`)
  const r = await aplicarIgualQuePreview()
  igual([r.fechas, r.respetadas], [1, 1], 'fechas, respetadas')
  igual(r.moves, 2, 'moves (una cambia de fecha, la otra sólo de ventana)')
  igual((await fila(V2A)).fecha, await fecha(`${HOY} - 5 + 14`), 'la del cronograma, a rando + 14')
})
await caso('…la reprogramada conserva su fecha, toma la ventana nueva y anota la teórica', async () => {
  const f = await fila(V1A)
  igual(f.fecha, await fecha(`${HOY} - 5 + 11`), 'estimated_date')
  igual([f.desde, f.hasta], [await fecha(`${HOY} - 5 + 12`), await fecha(`${HOY} - 5 + 16`)], 'ventana nueva')
  igual(f.anotada, await fecha(`${HOY} - 5 + 14`), 'fecha_del_cronograma')
  igual(await clase(V1A), 'a_mano', 'sigue a mano')
})
await caso('…y quedó fuera de su ventana nueva: el aviso la nombra una vez, cuando el cambio la deja afuera', async () => {
  // El aplicado de arriba ya la devolvió; acá se repite el cambio para mirar el preview.
  await db.exec(`update public.visit_definitions set offset_days = 15 where id = '${VDA}'`)
  const r = await sync(false)
  igual(r.fuera_de_ventana, [V1A], 'fuera_de_ventana')
  await sync(true)
  igual((await sync(false)).fuera_de_ventana, [], 'después de aplicar, ya no')
  await db.exec(`update public.visit_definitions set offset_days = 14 where id = '${VDA}'`)
  await sync(true)
})
await caso('el tamaño de la ventana de B cambia: 0 fechas, todas sólo de ventana, «Aplicar» habilitado', async () => {
  await db.exec(`update public.visit_definitions set window_minus = 4, window_plus = 4 where id = '${VDB}'`)
  const r = await aplicarIgualQuePreview()
  igual(r.fechas, 0, 'fechas')
  igual(r.moves, 2, 'moves (las dos B)')
  const f = await fila(V1B)
  igual([f.desde, f.hasta], [await fecha(`${HOY} - 5 + 16`), await fecha(`${HOY} - 5 + 24`)], 'ventana ±4')
})
await caso('después de aplicar, no queda nada «por mover» para siempre', async () => {
  const r = await sync(false)
  igual([r.creates, r.moves, r.deletes], [0, 0, 0], 'creates, moves, deletes')
})

console.log('\nsync_protocol_schedule · una visita con algo marcado conserva su fecha (D4)')
const I3 = await inscribir(2)
const V3A = await visita(I3, VDA)
await caso('«No vino» + cambio de offset: la fecha queda, la ventana se mueve, se anota la que tenía', async () => {
  await comoPerfil(db, P.coordinadora1, `select public.mark_no_show('${V3A}', true)`)
  await db.exec(`update public.visit_definitions set offset_days = 16 where id = '${VDA}'`)
  igual(await clase(V3A), 'marcada', 'clase')
  const r = await aplicarIgualQuePreview()
  igual(r.con_marcas, 1, 'con_marcas')
  const f = await fila(V3A)
  igual(f.fecha, await fecha(`${HOY} - 2 + 14`), 'estimated_date (el día que faltó)')
  igual([f.desde, f.hasta], [await fecha(`${HOY} - 2 + 14`), await fecha(`${HOY} - 2 + 18`)], 'ventana nueva')
  igual(f.anotada, await fecha(`${HOY} - 2 + 14`), 'fecha_del_cronograma (la que tenía, no la teórica)')
})
await caso('…se deshace el «No vino» → del_cronograma, y el próximo sync la acompaña', async () => {
  await comoPerfil(db, P.coordinadora1, `select public.mark_no_show('${V3A}', false)`)
  igual(await clase(V3A), 'del_cronograma', 'clase')
  await aplicarIgualQuePreview()
  igual((await fila(V3A)).fecha, await fecha(`${HOY} - 2 + 16`), 'estimated_date (rando + 16)')
})
await caso('llegada marcada (Concurrió) + cambio de offset: no sale de la lista del día', async () => {
  await db.exec(`update public.patient_visits set estimated_date = ${HOY}, window_start = ${HOY} - 2, window_end = ${HOY} + 2,
    fecha_del_cronograma = ${HOY} where id = '${V3A}'`)
  await comoPerfil(db, P.coordinadora1, `select public.mark_arrived('${V3A}')`)
  await db.exec(`update public.visit_definitions set offset_days = 18 where id = '${VDA}'`)
  igual(await clase(V3A), 'marcada', 'clase')
  await aplicarIgualQuePreview()
  igual((await fila(V3A)).fecha, await fecha(HOY), 'estimated_date (hoy)')
  await comoPerfil(db, P.coordinadora1, `select public.retroceder_etapa_visita('${V3A}', 'concurrio_al_centro')`)
})
await caso('llegada adelantada → marcada; «Volver» le devuelve la citación → del_cronograma otra vez', async () => {
  await aplicarIgualQuePreview() // V3A vuelve a la fecha del cronograma (rando + 18)
  const citada = (await fila(V3A)).fecha
  await comoPerfil(db, P.coordinadora1, `select public.registrar_llegada_adelantada('${V3A}')`)
  igual(await clase(V3A), 'marcada', 'clase con la llegada')
  await comoPerfil(db, P.coordinadora1, `select public.retroceder_etapa_visita('${V3A}', 'concurrio_al_centro')`)
  igual((await fila(V3A)).fecha, citada, 'recuperó la citación')
  igual(await clase(V3A), 'del_cronograma', 'clase después de «Volver»')
})

console.log('\nsync_protocol_schedule · las salidas de una fecha a mano')
await caso('reprogramada justo a la teórica nueva → vuelve a acompañar al cronograma', async () => {
  const [{ t }] = await q(`select fecha_teorica::text as t from public.cronograma_por_sincronizar('${PROTO}') where visita_id = '${V1A}'`)
  await reprogramar(V1A, `'${t}'::date`)
  await aplicarIgualQuePreview()
  igual(await clase(V1A), 'del_cronograma', 'clase')
})
await caso('turno cancelado + cambio de offset: sigue sin fecha, la ventana se mueve (regresión 0161)', async () => {
  await comoPerfil(db, P.coordinadora1, `select public.cancelar_turno_visita('${V2A}')`)
  await db.exec(`update public.visit_definitions set offset_days = 20 where id = '${VDA}'`)
  igual(await clase(V2A), 'cancelada', 'clase')
  await aplicarIgualQuePreview()
  const f = await fila(V2A)
  igual(f.fecha, null, 'estimated_date')
  if (!f.turno_cancelado_at) throw new Error('perdió el sello')
  igual([f.desde, f.hasta, f.anotada], [await fecha(`${HOY} - 5 + 18`), await fecha(`${HOY} - 5 + 22`), await fecha(`${HOY} - 5 + 20`)], 'ventana y anotada')
})
await caso('…reprogramada a su fecha vieja → a_mano: el próximo sync la conserva', async () => {
  const [{ c }] = await q(`select citacion_cancelada::text as c from public.patient_visits where id = '${V2A}'`)
  await reprogramar(V2A, `'${c}'::date`)
  igual((await fila(V2A)).turno_cancelado_at, null, 'el trigger de la 0161 limpió el sello')
  igual(await clase(V2A), 'a_mano', 'clase')
  await aplicarIgualQuePreview()
  igual((await fila(V2A)).fecha, c, 'estimated_date')
})
await caso('nació libre y la definición pasa a automática → conserva su fecha y toma ventana', async () => {
  const VDL = await nuevaDef('L', 104, 'libre', 40, 2, 2)
  const [{ v }] = await comoPerfil(db, P.coordinadora1, `select public.schedule_protocol_visit('${I1}', '${VDL}', ${HOY} + 50) as v`)
  igual((await fila(v)).desde, null, 'nace sin ventana')
  await db.exec(`update public.visit_definitions set date_mode = 'automatica' where id = '${VDL}'`)
  igual(await clase(v), 'a_mano', 'clase')
  await aplicarIgualQuePreview()
  const f = await fila(v)
  igual(f.fecha, await fecha(`${HOY} + 50`), 'estimated_date')
  igual([f.desde, f.anotada], [await fecha(`${HOY} - 5 + 38`), await fecha(`${HOY} - 5 + 40`)], 'ventana y anotada')
})

// ── D6 · las filas de antes de la 0163 (columna vacía): se deduce de la ventana ─────────────────────────
console.log('\nD6 · la deducción de las filas de antes')
const I4 = await inscribir(10)
const V4A = await visita(I4, VDA)
const V4B = await visita(I4, VDB)
/** Deja la visita como la habría dejado el cronograma de antes de la 0163, con un día teórico `t` y ±`m`/±`p`. */
const vieja = (id, t, m, p, fechaExpr) => db.exec(`update public.patient_visits set fecha_del_cronograma = null,
  window_start = ${HOY} - 10 + ${t} - ${m}, window_end = ${HOY} - 10 + ${t} + ${p},
  estimated_date = ${fechaExpr ?? `${HOY} - 10 + ${t}`} where id = '${id}'`)
const [{ dA }] = await q(`select offset_days as "dA" from public.visit_definitions where id = '${VDA}'`)
await caso('nunca se movió, definición sin cambios → del_cronograma', async () => {
  await vieja(V4A, dA, 2, 2)
  igual(await clase(V4A), 'del_cronograma', 'clase')
})
await caso('reprogramada (o con la fecha del listado), definición sin cambios → a_mano', async () => {
  await vieja(V4A, dA, 2, 2, `${HOY} - 10 + ${dA} + 3`)
  igual(await clase(V4A), 'a_mano', 'clase')
})
await caso('el offset cambió y no se sincronizó, sin mover → del_cronograma (se moverá, como antes)', async () => {
  await vieja(V4A, dA - 4, 2, 2)
  igual(await clase(V4A), 'del_cronograma', 'clase')
})
await caso('el offset cambió y no se sincronizó, y además se movió → a_mano', async () => {
  await vieja(V4A, dA - 4, 2, 2, `${HOY} - 10 + ${dA} - 1`)
  igual(await clase(V4A), 'a_mano', 'clase')
})
await caso('el tamaño de la ventana cambió y no se sincronizó → del_cronograma (no se puede saber: como antes)', async () => {
  await vieja(V4B, 20, 3, 3, `${HOY} - 10 + 22`) // B es ±4 desde arriba: la ventana ±3 ya no cierra
  igual(await clase(V4B), 'del_cronograma', 'clase')
})
await caso('una fila vieja donde sólo falta anotar: no se cuenta, y se escribe cuando se aplica otra cosa', async () => {
  await vieja(V4A, dA, 2, 2)
  await vieja(V4B, 20, 4, 4)
  const r = await sync(false)
  igual(r.moves, 0, 'moves')
  await nuevaDef('D', 105, 'automatica', 45, 2, 2)
  await aplicarIgualQuePreview()
  igual((await fila(V4A)).anotada, await fecha(`${HOY} - 10 + ${dA}`), 'anotada')
})

// ── Alcance, permisos y lo de la 0161 ───────────────────────────────────────────────────────────────
console.log('\nalcance y permisos')
await caso('fuera del alcance: atendida, de inscripción que no está activa', async () => {
  await db.exec(`update public.patient_visits set real_date = ${HOY}, attended_at = now() where id = '${V1B}'`)
  igual(await clase(V1B), null, 'atendida')
  const I5 = await inscribir(3)
  const V5A = await visita(I5, VDA)
  igual(await clase(V5A), 'del_cronograma', 'activa: adentro')
  await db.exec(`update public.enrollments set status = 'discontinuado' where id = '${I5}'`)
  igual(await clase(V5A), null, 'discontinuada')
})
await caso('una atendida que difiere sigue contando en attended_divergent', async () => {
  await db.exec(`update public.patient_visits set estimated_date = estimated_date - 1 where id = '${V1B}'`)
  if ((await sync(false)).attended_divergent < 1) throw new Error('no la contó')
})
await caso('una inscripción activa SIN randomización y con una automática pendiente no rompe el sync (0161)', async () => {
  const [{ id: pac }] = await q(`insert into public.patients (full_name, created_by) values ('TEST-0163-S', '${P.gerencia}') returning id`)
  const [{ id: ins }] = await q(`insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date)
    values ('${pac}', '${PROTO}', '${P.gerencia}', ${HOY} - 10) returning id`)
  const [{ id: v }] = await q(`insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end)
    values ('${ins}', '${VDA}', 'programada', ${HOY} + 4, ${HOY} + 2, ${HOY} + 6) returning id`)
  await sync(true)
  igual((await fila(v)).fecha, await fecha(`${HOY} + 4`), 'estimated_date (sin tocar)')
})
await caso('una coordinadora sin admin → 42501; sin sesión → 42501', async () => {
  await rechaza(P.coordinadora1, `select public.sync_protocol_schedule('${PROTO}', false)`, '42501', 'permiso')
  await rechaza(P.sinSesion, `select public.sync_protocol_schedule('${PROTO}', false)`, '42501')
})
await caso('el admin de Coordinación corre el sync, aunque no coordine el estudio', async () => {
  const r = await sync(false, P.adminCoordinacion)
  if (typeof r.respetadas !== 'number') throw new Error('respuesta sin las claves nuevas')
})

console.log(`\n${ok} de ${ok + fallas.length} casos bien.`)
if (fallas.length) {
  console.log('Fallaron:\n  - ' + fallas.join('\n  - '))
  process.exit(1)
}
