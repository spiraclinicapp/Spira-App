// Banco · los casos de la 0161 (cancelar el turno de una visita del cronograma).
// Corre las migraciones reales HASTA LA 0160, siembra los perfiles, saca una foto, aplica la 0161 encima de
// esos datos y arma una inscripción propia con dos visitas del cronograma, como `casos-0160.mjs`. Queda
// fijado a la 0161 sin tocarlo cuando lleguen otras.
//
//   node scripts/banco-rls/casos-0161.mjs
//
// Además de la RPC nueva prueba las tres funciones re-declaradas (sync_protocol_schedule, dismiss_alert,
// estadisticas_equipo_track), el candado y el trigger de salida, y COMPARA el antes y el después sobre los
// MISMOS datos: la 0161 entra sobre filas viejas, y el estado de cada visita y lo que devuelve Estadísticas
// no cambian. (Dos bases sembradas por separado no sirven para comparar: la FK nueva de turno_cancelado_by
// le cambia el azar al sembrado de patient_visits.) Sale con código 1 si algún caso falla.
import { crearBase, comoPerfil, migracion } from './base.mjs'
import { sembrar, PERFILES as P } from './sembrar.mjs'

const db = await crearBase({ hasta: 160 })
await sembrar(db)
const q = async (sql) => (await db.query(sql)).rows
const HOY = `((now() at time zone 'America/Argentina/Buenos_Aires')::date)`

// ── El mini-arnés (el de casos-0160) ────────────────────────────────────────────────────────────────
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
/** Lo mismo como superusuario (UPDATE directo, sin RLS): para probar el CHECK y el trigger solos. */
const rechazaDirecto = async (sql, codigo, texto) => {
  try { await db.exec(sql) } catch (e) {
    if (codigo && e.code !== codigo) throw new Error(`esperaba ${codigo} y vino ${e.code}: ${e.message}`)
    if (texto && !e.message.includes(texto)) throw new Error(`el mensaje no dice «${texto}»: ${e.message}`)
    return
  }
  throw new Error('no la rechazó')
}
const fecha = async (expr) => (await q(`select (${expr})::text as f`))[0].f

// ── El antes y el después de la 0161, sobre los mismos datos ────────────────────────────────────────
const estados = async () => (await q(`select id::text, computed_status::text as s, operational_stage as e
  from public.v_patient_visits order by id`)).map((r) => `${r.id}:${r.s}:${r.e}`).join('\n')
const estadisticas = async () => (await comoPerfil(db, P.gerencia, `select id::text, computed_status, estimated_date::text as est,
    real_date::text as rd from public.estadisticas_equipo_track(${HOY} - 400, ${HOY} + 400) order by id`))
  .map((r) => `${r.id}:${r.computed_status}:${r.est}:${r.rd}`).join('\n')
const visitasQueVe = async (uid) => (await comoPerfil(db, uid, `select count(*)::int as n from public.v_track_visits`))[0].n

const antes = { estados: await estados(), estadisticas: await estadisticas(), coordinadora: await visitasQueVe(P.coordinadora1) }

console.log('\nla 0161 sobre los datos de antes')
await caso('entra sobre las filas sembradas (los dos CHECK con datos viejos) y su sonda da todo en true', async () => {
  const resultados = await db.exec(migracion(161).sql)
  const sonda = resultados[resultados.length - 1].rows[0]
  const falsas = Object.entries(sonda).filter(([, v]) => v !== true).map(([k]) => k)
  if (falsas.length) throw new Error(`la sonda dio false en: ${falsas.join(', ')}`)
})
await caso('el estado y la etapa de cada visita sembrada son los mismos', async () => {
  if (!antes.estados.length) throw new Error('no hay visitas sembradas: la comparación no prueba nada')
  igual(await estados(), antes.estados, 'estados')
})
await caso('Estadísticas devuelve las mismas visitas, con los mismos datos', async () => {
  if (!antes.estadisticas.length) throw new Error('Estadísticas no devolvió nada: la comparación no prueba nada')
  igual(await estadisticas(), antes.estadisticas, 'estadísticas')
})
await caso('la coordinadora ve las mismas visitas en v_track_visits', async () => {
  igual(await visitasQueVe(P.coordinadora1), antes.coordinadora, 'visitas que ve')
})

// ── La inscripción de prueba, en el estudio que coordinan coordinadora1 y adminCoordinacion ──────────
const [{ protocol_id: PROTO }] = await q(`select protocol_id from public.protocol_coordinators where user_id = '${P.coordinadora1}' limit 1`)
const [{ id: PAC }] = await q(`insert into public.patients (full_name, created_by) values ('TEST-0161', '${P.gerencia}') returning id`)
const [{ id: INS }] = await q(`insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date)
  values ('${PAC}', '${PROTO}', '${P.gerencia}', ${HOY} - 60) returning id`)
const [{ id: VDA }] = await q(`insert into public.visit_definitions (protocol_id, name, code, sort_order, date_mode, offset_days, window_minus, window_plus)
  values ('${PROTO}', 'Banco A', 'BA', 101, 'automatica', 7, 2, 2) returning id`)
const [{ id: VDB }] = await q(`insert into public.visit_definitions (protocol_id, name, code, sort_order, date_mode, offset_days, window_minus, window_plus)
  values ('${PROTO}', 'Banco B', 'BB', 102, 'automatica', 14, 2, 2) returning id`)
const [{ id: VA }] = await q(`insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end)
  values ('${INS}', '${VDA}', 'programada', ${HOY} + 5, ${HOY} + 3, ${HOY} + 7) returning id`)
const [{ id: VB }] = await q(`insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end)
  values ('${INS}', '${VDB}', 'programada', ${HOY} + 12, ${HOY} + 10, ${HOY} + 14) returning id`)

/** Deja la visita por llegar, con turno para dentro de `dias` días y la ventana alrededor. */
const reiniciar = (id, dias) => db.exec(`update public.patient_visits set
  arrived_at = null, real_date = null, attended_at = null, ready_at = null, left_at = null,
  no_show_at = null, no_show_by = null, citacion_antes_de_adelantar = null, cargada_en_otra_fecha_at = null,
  turno_cancelado_at = null, turno_cancelado_by = null, citacion_cancelada = null,
  estimated_date = ${HOY} + ${dias}, window_start = ${HOY} + ${dias - 2}, window_end = ${HOY} + ${dias + 2}
  where id = '${id}'`)
const fila = async (id) => (await q(`select *, estimated_date::text as citada_txt, citacion_cancelada::text as cancelada_txt
  from public.patient_visits where id = '${id}'`))[0]
const estado = async (id) => (await q(`select computed_status::text as s from public.v_patient_visits where id = '${id}'`))[0].s
const cancelar = (id) => `select public.cancelar_turno_visita('${id}')`
/** Inserta sin triggers (las guardas de procedimientos y pedidos no son lo que se prueba acá) y devuelve el id. */
const sinTriggers = async (sql) => {
  await db.exec(`set session_replication_role = replica`)
  try { return (await q(sql))[0]?.id } finally { await db.exec(`set session_replication_role = origin`) }
}
const borrarSinTriggers = async (sql) => {
  await db.exec(`set session_replication_role = replica`)
  try { await db.exec(sql) } finally { await db.exec(`set session_replication_role = origin`) }
}

// ── cancelar_turno_visita · lo que hace ─────────────────────────────────────────────────────────────
console.log('\ncancelar_turno_visita · lo que hace')
await caso('coordinadora1 cancela un turno: sin fecha, con la citación guardada y su sello', async () => {
  await reiniciar(VA, 5)
  await comoPerfil(db, P.coordinadora1, cancelar(VA))
  const f = await fila(VA)
  igual(f.estimated_date, null, 'estimated_date')
  igual(f.cancelada_txt, await fecha(`${HOY} + 5`), 'citacion_cancelada')
  igual(f.turno_cancelado_by, P.coordinadora1, 'turno_cancelado_by')
  if (!f.turno_cancelado_at) throw new Error('turno_cancelado_at quedó vacía')
  igual(f.citacion_antes_de_adelantar, null, 'citacion_antes_de_adelantar')
})
await caso('…queda por reprogramar, por llegar, y la ventana igual', async () => {
  igual(await estado(VA), 'por_reprogramar', 'computed_status')
  igual((await q(`select operational_stage from public.v_patient_visits where id = '${VA}'`))[0].operational_stage, 'por_llegar', 'etapa')
  igual(String((await fila(VA)).window_end), String((await q(`select (${HOY} + 7) as d`))[0].d), 'window_end')
})
await caso('…v_track_visits trae las tres columnas', async () => {
  const [t] = await comoPerfil(db, P.coordinadora1, `select turno_cancelado_at, turno_cancelado_by, citacion_cancelada::text as c
    from public.v_track_visits where id = '${VA}'`)
  if (!t) throw new Error('la coordinadora no ve la visita')
  if (!t.turno_cancelado_at) throw new Error('turno_cancelado_at no llega a la vista')
  igual(t.turno_cancelado_by, P.coordinadora1, 'turno_cancelado_by')
  igual(t.c, await fecha(`${HOY} + 5`), 'citacion_cancelada')
})
await caso('…lo hecho queda en audit_log, a nombre de quien canceló', async () => {
  const r = await q(`select count(*)::int as n from public.audit_log
    where entity_id = '${VA}' and action = 'UPDATE' and actor_id = '${P.coordinadora1}'
      and before_data->>'estimated_date' is not null and after_data->>'estimated_date' is null`)
  if (r[0].n < 1) throw new Error('no hay un UPDATE auditado que vacíe la fecha')
})
await caso('con la ventana ya vencida, gana «ventana vencida» (como con «no vino»)', async () => {
  await reiniciar(VA, -8)
  await db.exec(`update public.patient_visits set estimated_date = ${HOY} + 1 where id = '${VA}'`)
  await comoPerfil(db, P.coordinadora1, cancelar(VA))
  igual(await estado(VA), 'ventana_vencida', 'computed_status')
})
await caso('gerencia cancela (aunque no coordine el estudio)', async () => {
  await reiniciar(VA, 5)
  await comoPerfil(db, P.gerencia, cancelar(VA))
  igual((await fila(VA)).turno_cancelado_by, P.gerencia, 'turno_cancelado_by')
})
await caso('el admin de Coordinación que coordina el estudio cancela', async () => {
  await reiniciar(VA, 5)
  await comoPerfil(db, P.adminCoordinacion, cancelar(VA))
  igual((await fila(VA)).estimated_date, null, 'estimated_date')
})

// ── cancelar_turno_visita · permisos ────────────────────────────────────────────────────────────────
console.log('\ncancelar_turno_visita · permisos')
await caso('el líder de Coordinación que no coordina el estudio → 42501', async () => {
  await reiniciar(VA, 5)
  await rechaza(P.liderCoordinacion, cancelar(VA), '42501')
})
await caso('coordinadora de OTRO estudio → 42501', () => rechaza(P.coordinadora23, cancelar(VA), '42501'))
await caso('farmacia → 42501', () => rechaza(P.farmacia, cancelar(VA), '42501'))
await caso('sin sesión → 42501', () => rechaza(P.sinSesion, cancelar(VA), '42501'))
await caso('anon no puede llamarla', async () => {
  await db.exec(`set role anon`)
  try { await db.query(cancelar(VA)); throw new Error('anon pudo llamarla') } catch (e) {
    if (e.code !== '42501') throw e
  } finally { await db.exec(`reset role`) }
})

// ── cancelar_turno_visita · guardas ─────────────────────────────────────────────────────────────────
console.log('\ncancelar_turno_visita · guardas')
await caso('ya cancelada → rechaza', async () => {
  await reiniciar(VA, 5)
  await comoPerfil(db, P.coordinadora1, cancelar(VA))
  await rechaza(P.coordinadora1, cancelar(VA), '23514', 'ya estaba cancelado')
})
await caso('concurrió → rechaza', async () => {
  await reiniciar(VA, 0)
  await db.exec(`update public.patient_visits set arrived_at = now() where id = '${VA}'`)
  await rechaza(P.coordinadora1, cancelar(VA), '23514', 'ya no está por llegar')
})
await caso('en atención → rechaza', async () => {
  await reiniciar(VA, 0)
  await db.exec(`update public.patient_visits set real_date = ${HOY} where id = '${VA}'`)
  await rechaza(P.coordinadora1, cancelar(VA), '23514', 'ya no está por llegar')
})
await caso('completa → rechaza', async () => {
  await reiniciar(VA, 0)
  await db.exec(`update public.patient_visits set real_date = ${HOY}, ready_at = now() where id = '${VA}'`)
  await rechaza(P.coordinadora1, cancelar(VA), '23514', 'ya no está por llegar')
})
await caso('con «no vino» → rechaza (ya está por reprogramar)', async () => {
  await reiniciar(VA, -1)
  await db.exec(`update public.patient_visits set no_show_at = now() where id = '${VA}'`)
  await rechaza(P.coordinadora1, cancelar(VA), '23514', 'no vino')
})
await caso('una cita que ya pasó, sin marcar, SÍ se cancela', async () => {
  await reiniciar(VA, -3)
  await comoPerfil(db, P.coordinadora1, cancelar(VA))
  igual((await fila(VA)).cancelada_txt, await fecha(`${HOY} - 3`), 'citacion_cancelada')
})
await caso('una visita suelta → rechaza (se elimina)', async () => {
  const [{ id: S }] = await q(`insert into public.patient_visits (enrollment_id, kind, estimated_date)
    values ('${INS}', 'vnp', ${HOY} + 3) returning id`)
  try { await rechaza(P.coordinadora1, cancelar(S), '23514', 'suelta') } finally {
    await db.exec(`delete from public.patient_visits where id = '${S}'`)
  }
})
await caso('la randomización legacy (kind randomizacion) → rechaza (se reprograma)', async () => {
  const [{ id: R }] = await q(`insert into public.patient_visits (enrollment_id, kind, estimated_date)
    values ('${INS}', 'randomizacion', ${HOY} + 3) returning id`)
  try { await rechaza(P.coordinadora1, cancelar(R), '23514', 'Fija la fecha del tratamiento') } finally {
    await db.exec(`delete from public.patient_visits where id = '${R}'`)
  }
})
await caso('con un procedimiento realizado → rechaza', async () => {
  await reiniciar(VA, 5)
  const [{ id: PR }] = await q(`insert into public.procedures (name, created_by) values ('Banco 0161', '${P.gerencia}') returning id`)
  const C = await sinTriggers(`insert into public.visit_procedure_completions (visit_id, procedure_id, completed_by)
    values ('${VA}', '${PR}', '${P.coordinadora1}') returning id`)
  try { await rechaza(P.coordinadora1, cancelar(VA), '23514', 'procedimientos marcados') } finally {
    await borrarSinTriggers(`delete from public.visit_procedure_completions where id = '${C}'`)
  }
})
for (const [estadoPedido, texto] of [['solicitada', 'pedido de medicación sin atender'], ['preparando', 'Farmacia ya está preparando'], ['atendida', 'ya se dispensó']]) {
  await caso(`con un pedido de medicación ${estadoPedido} → rechaza`, async () => {
    await reiniciar(VA, 5)
    const D = await sinTriggers(`insert into public.dispensation_requests (visit_id, requested_by, status)
      values ('${VA}', '${P.coordinadora1}', '${estadoPedido}') returning id`)
    try { await rechaza(P.coordinadora1, cancelar(VA), '23514', texto) } finally {
      await borrarSinTriggers(`delete from public.dispensation_requests where id = '${D}'`)
    }
  })
}
await caso('con un pedido rechazado o cancelado, SÍ se cancela', async () => {
  await reiniciar(VA, 5)
  const D = await sinTriggers(`insert into public.dispensation_requests (visit_id, requested_by, status)
    values ('${VA}', '${P.coordinadora1}', 'cancelada') returning id`)
  try {
    await comoPerfil(db, P.coordinadora1, cancelar(VA))
    igual((await fila(VA)).estimated_date, null, 'estimated_date')
  } finally {
    await borrarSinTriggers(`delete from public.dispensation_requests where id = '${D}'`)
  }
})

// ── El candado: un turno cancelado no recibe marcas ─────────────────────────────────────────────────
console.log('\nel candado (patient_visits_turno_cancelado)')
const cancelada = async () => { await reiniciar(VA, 5); await comoPerfil(db, P.coordinadora1, cancelar(VA)) }
await caso('mark_arrived sobre una cancelada → 23514, y sigue cancelada', async () => {
  await cancelada()
  await rechaza(P.coordinadora1, `select public.mark_arrived('${VA}')`, '23514', 'patient_visits_turno_cancelado')
  if (!(await fila(VA)).turno_cancelado_at) throw new Error('perdió el sello')
})
await caso('mark_no_show sobre una cancelada → 23514', async () => {
  await cancelada()
  await rechaza(P.coordinadora1, `select public.mark_no_show('${VA}', true)`, '23514', 'patient_visits_turno_cancelado')
})
await caso('registrar_llegada_adelantada (fecha Y llegada a la vez) → 23514: el trigger no limpia', async () => {
  await cancelada()
  await rechaza(P.coordinadora1, `select public.registrar_llegada_adelantada('${VA}')`, '23514', 'patient_visits_turno_cancelado')
  igual((await fila(VA)).estimated_date, null, 'estimated_date (sin la fecha de hoy)')
})
await caso('registrar_visita_en_otra_fecha sobre una cancelada → 23514', async () => {
  await cancelada()
  await rechaza(P.coordinadora1, `select public.registrar_visita_en_otra_fecha('${VA}', ${HOY} - 7, '${P.coordinadora1}')`, '23514')
  igual((await fila(VA)).real_date, null, 'real_date')
})
await caso('start_visit_attention sobre una cancelada → 23514', async () => {
  await cancelada()
  await rechaza(P.coordinadora1, `select public.start_visit_attention('${VA}', ${HOY})`, '23514')
  igual((await fila(VA)).real_date, null, 'real_date')
})
await caso('un UPDATE directo de la llegada → 23514', async () => {
  await cancelada()
  await rechazaDirecto(`update public.patient_visits set arrived_at = now() where id = '${VA}'`, '23514', 'patient_visits_turno_cancelado')
})
await caso('el sello sin la citación → 23514', async () => {
  await reiniciar(VB, 12)
  await rechazaDirecto(`update public.patient_visits set turno_cancelado_at = now(), estimated_date = null where id = '${VB}'`,
    '23514', 'patient_visits_turno_cancelado')
})
await caso('el sello sobre una visita con fecha lo limpia el trigger (no queda «cancelada con fecha»)', async () => {
  await reiniciar(VB, 12)
  await db.exec(`update public.patient_visits set turno_cancelado_at = now(), citacion_cancelada = ${HOY} where id = '${VB}'`)
  const f = await fila(VB)
  igual(f.turno_cancelado_at, null, 'turno_cancelado_at')
  igual(f.citacion_cancelada, null, 'citacion_cancelada')
})
await caso('una programada sin fecha y sin sello → 23514 (kind_shape)', () =>
  rechazaDirecto(`update public.patient_visits set estimated_date = null where id = '${VB}'`, '23514', 'patient_visits_kind_shape'))

// ── El trigger: volver a tener fecha limpia el sello ────────────────────────────────────────────────
console.log('\nel trigger de salida (trg_limpia_turno_cancelado)')
await caso('el UPDATE de rescheduleVisit (fecha + sin «no vino») la saca de cancelada → próxima', async () => {
  await cancelada()
  await comoPerfil(db, P.coordinadora1, `update public.patient_visits set estimated_date = ${HOY} + 20, no_show_at = null, no_show_by = null
    where id = '${VA}' returning id`)
  const f = await fila(VA)
  igual(f.citada_txt, await fecha(`${HOY} + 20`), 'estimated_date')
  igual(f.turno_cancelado_at, null, 'turno_cancelado_at')
  igual(f.turno_cancelado_by, null, 'turno_cancelado_by')
  igual(f.citacion_cancelada, null, 'citacion_cancelada')
  igual(await estado(VA), 'proxima', 'computed_status')
})
await caso('el UPDATE de setEstimatedDate (sólo la fecha) también', async () => {
  await cancelada()
  await comoPerfil(db, P.coordinadora1, `update public.patient_visits set estimated_date = ${HOY} + 9 where id = '${VA}' returning id`)
  igual((await fila(VA)).turno_cancelado_at, null, 'turno_cancelado_at')
})
await caso('otro UPDATE sobre una cancelada (las notas) no la saca de cancelada', async () => {
  await cancelada()
  await db.exec(`update public.patient_visits set notes = 'nota del banco' where id = '${VA}'`)
  const f = await fila(VA)
  if (!f.turno_cancelado_at) throw new Error('perdió el sello')
  igual(f.estimated_date, null, 'estimated_date')
})
await caso('en una visita sin sello, un cambio de fecha no toca nada más', async () => {
  await reiniciar(VB, 12)
  await db.exec(`update public.patient_visits set estimated_date = ${HOY} + 13 where id = '${VB}'`)
  const f = await fila(VB)
  igual(f.turno_cancelado_at, null, 'turno_cancelado_at')
  igual(f.citada_txt, await fecha(`${HOY} + 13`), 'estimated_date')
})

// ── dismiss_alert: el ancla de un turno cancelado es la cancelación ─────────────────────────────────
console.log('\ndismiss_alert · el ancla (0161)')
const descartar = (id) => `select public.dismiss_alert('visita', '${id}', 'no_aplica')`
const descartesQueCoinciden = async (id) => (await q(`select count(*)::int as n from public.alert_dismissals d
  join public.patient_visits pv on pv.id = d.visit_id
  where d.visit_id = '${id}' and d.status = 'por_reprogramar'
    and d.anchor = coalesce(pv.estimated_date::timestamptz, pv.turno_cancelado_at, '-infinity'::timestamptz)`))[0].n
await caso('archivar un turno cancelado guarda como ancla el momento de la cancelación', async () => {
  await reiniciar(VB, 12)
  await comoPerfil(db, P.coordinadora1, cancelar(VB))
  // Una hora antes, para que la cancelación siguiente sea con seguridad otro instante.
  await db.exec(`update public.patient_visits set turno_cancelado_at = turno_cancelado_at - interval '1 hour' where id = '${VB}'`)
  await comoPerfil(db, P.coordinadora1, descartar(VB))
  const [d] = await q(`select d.anchor = pv.turno_cancelado_at as igual from public.alert_dismissals d
    join public.patient_visits pv on pv.id = d.visit_id where d.visit_id = '${VB}' order by d.dismissed_at desc limit 1`)
  igual(d.igual, true, 'anchor = turno_cancelado_at')
  igual(await descartesQueCoinciden(VB), 1, 'el descarte tapa ESTA cancelación')
})
await caso('…se reprograma y se vuelve a cancelar: el descarte viejo NO tapa la cancelación nueva', async () => {
  await db.exec(`update public.patient_visits set estimated_date = ${HOY} + 15 where id = '${VB}'`)
  await comoPerfil(db, P.coordinadora1, cancelar(VB))
  igual(await estado(VB), 'por_reprogramar', 'computed_status')
  igual(await descartesQueCoinciden(VB), 0, 'descartes que coinciden')
})
await caso('el ancla de un «no vino» sigue siendo la fecha de la cita (como la 0107)', async () => {
  await reiniciar(VA, 5)
  await db.exec(`update public.patient_visits set no_show_at = now() where id = '${VA}'`)
  await comoPerfil(db, P.coordinadora1, descartar(VA))
  const [d] = await q(`select d.anchor = (${HOY} + 5)::timestamptz as igual from public.alert_dismissals d
    where d.visit_id = '${VA}' order by d.dismissed_at desc limit 1`)
  igual(d.igual, true, 'anchor = estimated_date')
})

// ── estadisticas_equipo_track: en el período de la citación vieja ───────────────────────────────────
console.log('\nestadisticas_equipo_track · el turno cancelado (0161)')
await caso('cuenta en el período de su citación vieja, con citacion_cancelada', async () => {
  await reiniciar(VB, 12)
  await comoPerfil(db, P.coordinadora1, cancelar(VB))
  const filas = await comoPerfil(db, P.gerencia, `select estimated_date, citacion_cancelada::text as c, computed_status
    from public.estadisticas_equipo_track(${HOY} + 10, ${HOY} + 14) where id = '${VB}'`)
  igual(filas.length, 1, 'filas en el período')
  igual(filas[0].estimated_date, null, 'estimated_date')
  igual(filas[0].c, await fecha(`${HOY} + 12`), 'citacion_cancelada')
  igual(filas[0].computed_status, 'por_reprogramar', 'computed_status')
})
await caso('…y no en otro período', async () => {
  const filas = await comoPerfil(db, P.gerencia, `select 1 from public.estadisticas_equipo_track(${HOY} + 20, ${HOY} + 30) where id = '${VB}'`)
  igual(filas.length, 0, 'filas fuera del período')
})
await caso('sigue siendo sólo de jefatura: una coordinadora → 42501', () =>
  rechaza(P.coordinadora1, `select 1 from public.estadisticas_equipo_track(${HOY}, ${HOY} + 30)`, '42501'))

// ── sync_protocol_schedule: no le devuelve la fecha a un turno cancelado ────────────────────────────
// Va al final: randomizar la inscripción genera el resto de su cronograma y no se deshace.
console.log('\nsync_protocol_schedule · el turno cancelado (0161)')
const sync = async (aplicar) => (await comoPerfil(db, P.gerencia, `select public.sync_protocol_schedule('${PROTO}', ${aplicar}) as r`))[0].r
await caso('preview y aplicar cuentan igual, y después no queda nada que mover', async () => {
  await reiniciar(VA, 5)
  await reiniciar(VB, 12)
  await comoPerfil(db, P.coordinadora1, cancelar(VA))
  await db.exec(`update public.enrollments set randomization_date = ${HOY} where id = '${INS}'`)
  const previa = await sync(false)
  const hecha = await sync(true)
  igual(hecha.moves, previa.moves, 'moves (preview = apply)')
  igual(hecha.creates, previa.creates, 'creates (preview = apply)')
  igual((await sync(false)).moves, 0, 'moves después de aplicar (la cancelada no queda «por mover» para siempre)')
})
await caso('…la cancelada sigue sin fecha, con su sello, y la ventana se movió', async () => {
  const f = await fila(VA)
  igual(f.estimated_date, null, 'estimated_date')
  if (!f.turno_cancelado_at) throw new Error('perdió el sello')
  igual(f.cancelada_txt, await fecha(`${HOY} + 5`), 'citacion_cancelada (sin tocar)')
  const [w] = await q(`select window_start::text as a, window_end::text as b from public.patient_visits where id = '${VA}'`)
  igual(w.a, await fecha(`${HOY} + 5`), 'window_start (rando + 7 - 2)')
  igual(w.b, await fecha(`${HOY} + 9`), 'window_end (rando + 7 + 2)')
})
await caso('…la otra se movió como siempre', async () => {
  igual((await fila(VB)).citada_txt, await fecha(`${HOY} + 14`), 'estimated_date (rando + 14)')
})
await caso('una inscripción activa SIN randomización y con una automática pendiente no rompe el sync (0161, de paso)', async () => {
  const [{ id: PAC2 }] = await q(`insert into public.patients (full_name, created_by) values ('TEST-0161-B', '${P.gerencia}') returning id`)
  const [{ id: INS2 }] = await q(`insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date)
    values ('${PAC2}', '${PROTO}', '${P.gerencia}', ${HOY} - 10) returning id`)
  const [{ id: V2 }] = await q(`insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end)
    values ('${INS2}', '${VDA}', 'programada', ${HOY} + 4, ${HOY} + 2, ${HOY} + 6) returning id`)
  await sync(true) // la 0029 reventaba acá contra kind_shape (NULL + offset)
  igual((await fila(V2)).citada_txt, await fecha(`${HOY} + 4`), 'estimated_date (sin tocar)')
})

console.log(`\n${ok} de ${ok + fallas.length} casos bien.`)
if (fallas.length) { console.log('Fallaron:', fallas); process.exit(1) }
