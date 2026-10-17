// Banco · los casos de la 0164 (el detalle del preview del sync del cronograma).
// Corre las migraciones reales HASTA LA 0163, siembra los perfiles, aplica la 0164 encima y arma un estudio propio
// (TEST-0164), como `casos-0163.mjs`. Queda fijado a la 0164.
//
//   node scripts/banco-rls/casos-0164.mjs [copia-sin-comentarios.sql]
//
// Prueba que el detalle trae un renglón por visita que se crea, cambia de fecha, conserva su fecha o sólo toma la
// ventana nueva; que cada visita sale una sola vez; que los grupos cuadran con los conteos de la 0163; que el motivo
// de las conservadas dice por qué; que preview y aplicar devuelven el mismo detalle; y que no trae nombres. Sale con
// código 1 si algún caso falla.
import { readFileSync } from 'node:fs'
import { crearBase, comoPerfil, migracion } from './base.mjs'
import { sembrar, PERFILES as P } from './sembrar.mjs'

const copia = process.argv[2]
const sql0164 = copia ? readFileSync(copia, 'utf8') : migracion(164).sql

const db = await crearBase({ hasta: 163 })
await sembrar(db)
const q = async (sql) => (await db.query(sql)).rows
const HOY = `((now() at time zone 'America/Argentina/Buenos_Aires')::date)`

// ── El mini-arnés (el de casos-0163) ────────────────────────────────────────────────────────────────
let ok = 0
const fallas = []
const caso = async (nombre, fn) => {
  try { await fn(); ok++; console.log(`  ✓ ${nombre}`) } catch (e) { fallas.push(nombre); console.log(`  ✗ ${nombre}\n      ${e.message}`) }
}
const igual = (a, b, que) => {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)]
  if (x !== y) throw new Error(`${que}: esperaba ${y} y vino ${x}`)
}
const fecha = async (expr) => (await q(`select (${expr})::text as f`))[0].f

console.log('\nla 0164 sobre los datos de antes')
const fotoVisitas = async () => (await q(`select md5(string_agg(concat_ws(',', id, estimated_date, window_start,
    window_end, fecha_del_cronograma, updated_at), '|' order by id)) as h from public.patient_visits`))[0].h
const antes = await fotoVisitas()
await caso('entra, su sonda da true y no escribe ninguna visita', async () => {
  const resultados = await db.exec(sql0164)
  igual(resultados.at(-1).rows[0].detalle, true, 'sonda.detalle')
  igual(await fotoVisitas(), antes, 'patient_visits')
})

// ── El estudio de prueba: A (día 10, ±2) y B (día 20, ±3); coordinadora1 lo coordina ──────────────────
const [{ id: PROTO }] = await q(`insert into public.protocols (code, name, legal_entity, created_by)
  select 'TEST-0164', 'Banco 0164', legal_entity, '${P.gerencia}' from public.protocols limit 1 returning id`)
await q(`insert into public.protocol_coordinators (protocol_id, user_id) values ('${PROTO}', '${P.coordinadora1}')`)
const nuevaDef = async (code, orden, dia, menos, mas) => (await q(`insert into public.visit_definitions
  (protocol_id, name, code, sort_order, date_mode, offset_days, window_minus, window_plus)
  values ('${PROTO}', 'Banco ${code}', '${code}', ${orden}, 'automatica', ${dia}, ${menos}, ${mas}) returning id`))[0].id
const VDA = await nuevaDef('A', 101, 10, 2, 2)
const VDB = await nuevaDef('B', 102, 20, 3, 3)
let nPac = 0
const inscribir = async (hace) => {
  nPac++
  const [{ id: pac }] = await q(`insert into public.patients (full_name, created_by) values ('TEST-0164-${nPac}', '${P.gerencia}') returning id`)
  const [{ id: ins }] = await q(`insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date)
    values ('${pac}', '${PROTO}', '${P.gerencia}', ${HOY} - ${hace} - 30) returning id`)
  await db.exec(`update public.enrollments set randomization_date = ${HOY} - ${hace} where id = '${ins}'`)
  return ins
}
const visita = async (ins, def) => (await q(`select id from public.patient_visits
  where enrollment_id = '${ins}' and visit_def_id = '${def}' and kind = 'programada'`))[0].id
const sync = async (aplicar) =>
  (await comoPerfil(db, P.gerencia, `select public.sync_protocol_schedule('${PROTO}', ${aplicar}) as r`))[0].r
const reprogramar = (id, expr) => comoPerfil(db, P.coordinadora1,
  `update public.patient_visits set estimated_date = ${expr}, no_show_at = null, no_show_by = null where id = '${id}' returning id`)
const del = (r, grupo) => r.detalle.filter((d) => d.grupo === grupo)
/** Lo que vale siempre: cada visita una vez, los grupos cuadran con los conteos, y nada de nombres. */
const cuadra = (r) => {
  const ids = r.detalle.filter((d) => d.visita_id).map((d) => d.visita_id)
  igual(new Set(ids).size, ids.length, 'cada visita sale una sola vez')
  igual(del(r, 'crea').length, r.creates, 'crea = creates')
  igual(del(r, 'fecha').length, r.fechas, 'fecha = fechas')
  igual(del(r, 'conserva').length, r.respetadas + r.con_marcas, 'conserva = respetadas + con_marcas')
  const piso = del(r, 'fecha').length + del(r, 'ventana').length
  if (r.moves < piso || r.moves > piso + del(r, 'conserva').length) throw new Error(`moves ${r.moves} fuera de [${piso}, ${piso + del(r, 'conserva').length}]`)
  igual(r.detalle.filter((d) => d.fuera_de_ventana).map((d) => d.visita_id).sort(), [...r.fuera_de_ventana].sort(), 'fuera_de_ventana')
  const claves = new Set(r.detalle.flatMap((d) => Object.keys(d)))
  for (const k of claves) if (/name|nombre|paciente|full/i.test(k)) throw new Error(`trae un nombre: ${k}`)
}
const aplicarIgualQuePreview = async () => {
  const previa = await sync(false)
  const hecha = await sync(true)
  igual(hecha.detalle, previa.detalle, 'detalle (preview = aplicar)')
  return hecha
}

console.log('\nel detalle')
const I1 = await inscribir(5)
const V1A = await visita(I1, VDA)
const I2 = await inscribir(5)
const V2A = await visita(I2, VDA)
await caso('recién generadas: el detalle viene vacío', async () => {
  const r = await sync(false)
  igual(r.detalle, [], 'detalle')
  cuadra(r)
})
await caso('una reprogramada: un renglón «conserva», motivo a_mano, con su fecha y sin fecha nueva', async () => {
  await reprogramar(V1A, `${HOY} - 5 + 11`)
  const r = await sync(false)
  cuadra(r)
  igual(r.detalle.length, 1, 'renglones')
  const [d] = r.detalle
  igual([d.grupo, d.visita_id, d.inscripcion_id, d.visita, d.fecha, d.fecha_nueva, d.motivo],
    ['conserva', V1A, I1, 'A', await fecha(`${HOY} - 5 + 11`), null, 'a_mano'], 'renglón')
})
await caso('una definición nueva: un renglón «crea» por paciente, sin visita_id y con la fecha que va a tener', async () => {
  await nuevaDef('C', 103, 30, 2, 2)
  const r = await sync(false)
  cuadra(r)
  const crea = del(r, 'crea')
  igual(crea.length, 2, 'renglones crea')
  igual(crea.map((d) => [d.visita_id, d.visita, d.fecha, d.fecha_nueva]),
    [[null, 'C', null, await fecha(`${HOY} - 5 + 30`)], [null, 'C', null, await fecha(`${HOY} - 5 + 30`)]], 'crea')
  igual(crea.map((d) => d.inscripcion_id).sort(), [I1, I2].sort(), 'una por inscripción')
  igual(r.detalle[0].grupo, 'crea', 'las que se crean van primero')
  await aplicarIgualQuePreview()
})
await caso('cambia el offset de A: «fecha» con la fecha de hoy y la nueva; la reprogramada sigue en «conserva»', async () => {
  await db.exec(`update public.visit_definitions set offset_days = 14 where id = '${VDA}'`)
  const r = await sync(false)
  cuadra(r)
  const [f] = del(r, 'fecha')
  igual([f.visita_id, f.fecha, f.fecha_nueva], [V2A, await fecha(`${HOY} - 5 + 10`), await fecha(`${HOY} - 5 + 14`)], 'fecha')
  const [c] = del(r, 'conserva')
  igual([c.visita_id, c.motivo, c.fuera_de_ventana], [V1A, 'a_mano', true], 'conserva (y queda fuera de su ventana nueva)')
  igual(r.detalle.map((d) => d.grupo), ['fecha', 'conserva'], 'orden de los grupos')
  await aplicarIgualQuePreview()
})
await caso('cambia el tamaño de la ventana de B: un renglón «ventana» por visita, sin fecha nueva', async () => {
  await db.exec(`update public.visit_definitions set window_minus = 4, window_plus = 4 where id = '${VDB}'`)
  const r = await sync(false)
  cuadra(r)
  const v = del(r, 'ventana')
  igual(v.length, 2, 'renglones ventana')
  igual(v.every((d) => d.visita === 'B' && d.fecha_nueva === null && d.motivo === null), true, 'B, sin fecha nueva, sin motivo')
  await aplicarIgualQuePreview()
})
await caso('el motivo de una conservada con algo marcado: no_vino y llegada', async () => {
  const I3 = await inscribir(2)
  const V3A = await visita(I3, VDA)
  const I4 = await inscribir(1)
  const V4A = await visita(I4, VDA)
  await comoPerfil(db, P.coordinadora1, `select public.mark_no_show('${V3A}', true)`)
  await db.exec(`update public.patient_visits set estimated_date = ${HOY}, window_start = ${HOY} - 2, window_end = ${HOY} + 2,
    fecha_del_cronograma = ${HOY} where id = '${V4A}'`)
  await comoPerfil(db, P.coordinadora1, `select public.mark_arrived('${V4A}')`)
  await db.exec(`update public.visit_definitions set offset_days = 16 where id = '${VDA}'`)
  const r = await sync(false)
  cuadra(r)
  const motivo = (id) => r.detalle.find((d) => d.visita_id === id)?.motivo
  igual([motivo(V3A), motivo(V4A)], ['no_vino', 'llegada'], 'motivos')
  await aplicarIgualQuePreview()
})
await caso('un turno cancelado y un cambio de offset: «ventana», motivo cancelada, sin fecha', async () => {
  const I5 = await inscribir(5)
  const V5A = await visita(I5, VDA)
  await comoPerfil(db, P.coordinadora1, `select public.cancelar_turno_visita('${V5A}')`)
  await db.exec(`update public.visit_definitions set offset_days = 18 where id = '${VDA}'`)
  const r = await sync(false)
  cuadra(r)
  const d = r.detalle.find((x) => x.visita_id === V5A)
  igual([d.grupo, d.motivo, d.fecha], ['ventana', 'cancelada', null], 'la cancelada')
  await aplicarIgualQuePreview()
})
await caso('después de aplicar no queda nada que listar, salvo las que se conservan', async () => {
  const r = await sync(false)
  cuadra(r)
  igual([...new Set(r.detalle.map((d) => d.grupo))], ['conserva'], 'sólo conserva')
})
await caso('las claves de antes siguen ahí (el front de la 0163 no se entera)', async () => {
  const r = await sync(false)
  for (const k of ['creates', 'moves', 'deletes', 'attended_divergent', 'applied', 'fechas', 'respetadas', 'con_marcas', 'fuera_de_ventana']) {
    if (!(k in r)) throw new Error(`falta ${k}`)
  }
})

console.log(`\n${ok} de ${ok + fallas.length} casos bien.`)
if (fallas.length) {
  console.log('Fallaron:\n  - ' + fallas.join('\n  - '))
  process.exit(1)
}
