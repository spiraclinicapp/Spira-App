// Semilla NARRATIVA del proyecto DEMO (T2b): el centro ficticio que se ve en los tutoriales. La corre `resetear.mjs`
// al final, sobre la base recién migrada. Receta y citas: docs/plan-tutoriales-semilla.md; plan:
// docs/plan-tutoriales.md, «Semilla narrativa».
//
// ── CON LAS RPC REALES, NO CON INSERTS ──
// Cada paso corre COMO una de las cuentas del demo: `set local role authenticated` + los claims del JWT en
// `request.jwt.claims`, que es lo que lee `auth.uid()`. Así pasa por las mismas guardas, triggers y policies que la
// app, y si una migración cambia una RPC de la que vive la semilla, el reset falla nombrando el paso y la cuenta
// (docs/plan-tutoriales.md, «Modos de falla»). Donde la app escribe directo (el protocolo, el cronograma, el
// catálogo de procedimientos), la semilla también, pero con el rol `authenticated`: la RLS mira igual.
//
// ── LAS TRES EXCEPCIONES, HECHAS COMO `postgres` A PROPÓSITO ──
//   1. La primera gerencia. `set_module_access` exige gerencia, y alguien tiene que ser la primera (hallazgo F).
//   2. Las marcas de hora de las visitas históricas. `mark_arrived`, `start_visit_attention` y
//      `mark_ready_with_outcome` sellan con `now()`, y Visitas del día filtra por esas marcas: sin corregirlas, las
//      visitas de hace un mes aparecerían HOY (hallazgo D). Se corrigen con los claims de la coordinadora puestos,
//      porque `sello_autor` vuelve a sellar `arrived_by`/`ready_by` en cada cambio de marca y, sin `auth.uid()`,
//      los dejaría en null.
//   3. La fecha de alta de las inscripciones. `create_patient_with_enrollment` la fija con `current_date` y
//      `guard_enrollment_immutable` no deja cambiarla nunca. La ficha la muestra: un alta de HOY con un screening de
//      hace seis semanas desentona en un video. Se apaga el guard sólo dentro de esa transacción.
//
// ── POR QUÉ LAS FECHAS SON RELATIVAS ──
// Para que el Resumen y el calendario se vean vivos el día que se graba. Todo sale de `hoyEnAR()` y de
// `planDePacientes(hoy)`, que son puras y tienen sus tests: si la cuenta de días queda mal, la app no se ve rota,
// se ve con el paciente equivocado en el día equivocado.
import { GuardiaError, verificarCentinela } from './guardia.mjs'

/** Las cuentas del demo. Los mails son ficticios (dominio inventado) y nadie entra con contraseña: ver sesion.mjs. */
export const CUENTAS = [
  { alias: 'coord', email: 'coord@demo.spira', nombre: 'Valeria Sosa', accesos: [['track', 'leader']] },
  // La de los tutoriales de Farmacia: operator, como la mayoría del equipo.
  { alias: 'farma', email: 'farma@demo.spira', nombre: 'Julieta Paz', accesos: [['pharma', 'operator']] },
  // Operator no alcanza para el catálogo ni el stock (hallazgo A): `create_drug`, `create_medication`,
  // `assign_medication_to_protocol`, `create_reception` y `verify_reception` exigen leader.
  { alias: 'farmaresp', email: 'farmaresp@demo.spira', nombre: 'Martín Ibarra', accesos: [['pharma', 'leader']] },
  { alias: 'dir', email: 'dir@demo.spira', nombre: 'Dr. Andrés Ferro', accesos: [['gerencia', 'admin'], ['track', 'admin']] },
]

export const ESTUDIO = {
  code: 'ACME-301',
  name: 'Estudio fase III de ACME-301 en EPOC',
  sponsor: 'ACME Pharma',
  description: 'EPOC',
  medico: 'Dr. Pablo Ruiz',
}

/* El catálogo base de procedimientos: el mismo que siembra la 0061 en prod. En un proyecto nuevo esa siembra se
   saltea porque todavía no hay usuarios (hallazgo C), así que la semilla lo carga después de crear las cuentas. */
export const PROCEDIMIENTOS = [
  ['SIGNOS', 'Signos vitales', 'Evaluación clínica', false],
  ['EXAMFIS', 'Examen físico', 'Evaluación clínica', false],
  ['ESPIRO', 'Espirometría', 'Cardio-respiratorio', false],
  ['ECG', 'Electrocardiograma (ECG)', 'Cardio-respiratorio', false],
  ['SAT', 'Saturometría', 'Cardio-respiratorio', false],
  ['EXTSANG', 'Extracción de sangre', 'Laboratorio', false],
  ['HEMATO', 'Hematología', 'Laboratorio', false],
  ['QUIMICA', 'Química sanguínea', 'Laboratorio', false],
  ['ORINA', 'Análisis de orina', 'Laboratorio', false],
  ['EMBARAZO', 'Test de embarazo', 'Laboratorio', false],
  ['CONSENT', 'Consentimiento informado', 'Elegibilidad', false],
  ['CRITERIOS', 'Criterios de inclusión/exclusión', 'Elegibilidad', false],
  ['CALVIDA', 'Cuestionario de calidad de vida', 'Cuestionarios', false],
  ['EVADVER', 'Registro de eventos adversos', 'Seguridad', false],
  ['MEDCONC', 'Medicación concomitante', 'Seguridad', false],
  ['DISPENSA', 'Dispensación de medicación', 'Medicación', true],
]

/* El cronograma de ACME-301. Las `libre` se agendan a mano; las `automatica` las genera `generate_patient_visits`
   al fijarse la fecha de randomización (offset desde ese día, ventana en días). */
export const CRONOGRAMA = [
  { name: 'V1 Screening', date_mode: 'libre', role: 'screening', offset_days: -14, window_minus: 0, window_plus: 0, dispenses: false,
    procedimientos: ['CONSENT', 'CRITERIOS', 'SIGNOS', 'EXAMFIS', 'ESPIRO', 'ECG', 'EXTSANG'] },
  { name: 'V2 Randomización · Día 1', date_mode: 'libre', role: 'randomizacion', offset_days: 0, window_minus: 0, window_plus: 0, dispenses: true,
    procedimientos: ['SIGNOS', 'EXAMFIS', 'ESPIRO', 'CALVIDA', 'DISPENSA'] },
  { name: 'V3 W4', date_mode: 'automatica', role: 'comun', offset_days: 28, window_minus: 3, window_plus: 3, dispenses: false,
    procedimientos: ['SIGNOS', 'ESPIRO', 'EVADVER', 'MEDCONC'] },
  { name: 'V4 W8', date_mode: 'automatica', role: 'comun', offset_days: 56, window_minus: 3, window_plus: 3, dispenses: false,
    procedimientos: ['SIGNOS', 'ESPIRO', 'EVADVER', 'MEDCONC', 'CALVIDA'] },
  { name: 'V5 W12 EOT', date_mode: 'automatica', role: 'comun', offset_days: 84, window_minus: 7, window_plus: 7, dispenses: false,
    procedimientos: ['SIGNOS', 'EXAMFIS', 'ESPIRO', 'ECG', 'EXTSANG', 'EVADVER', 'MEDCONC', 'CALVIDA'] },
]

export const MEDICACION = {
  droga: 'Budesonida/Formoterol',
  laboratorio: 'ACME Pharma',
  nombre: 'Bufomix 160/4.5 mcg',
  unidad: 'Aerosol (IDM)',
  umbral: 5,
  // Prefijo 200: GS1 lo reserva para uso interno y no lo asigna a ninguna empresa, así que no puede chocar con un
  // producto real. El último dígito es el verificador EAN-13 bien calculado (lo fija un test).
  gtin: '2000000123455',
  dosis: '160/4.5 mcg',
  clase: 'ICS/LABA',
  lote: 'L24A031',
  cantidad: 60,
}

// ── Fechas ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** El día de HOY en Argentina ('YYYY-MM-DD'). La app vive en hora AR; la base, en UTC (después de las 21 h ya es
 *  mañana para `current_date`). */
export function hoyEnAR(ahora = new Date()) {
  return ahora.toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
}

/** `iso` + `n` días. Al mediodía UTC, así ningún corrimiento de hora cruza la medianoche. */
export function sumarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Una marca de hora AR de ese día (AR no tiene horario de verano: −03:00 fijo, como `motivosDelDia`). */
export function marcaAR(iso, hhmm) {
  return `${iso}T${hhmm}:00-03:00`
}

/** Las visitas que generaría `generate_patient_visits` para una randomización: el espejo, para los tests. */
export function visitasAutomaticas(randomizacion) {
  return CRONOGRAMA.filter((v) => v.date_mode === 'automatica').map((v) => {
    const fecha = sumarDias(randomizacion, v.offset_days)
    return { name: v.name, estimated_date: fecha, window_start: sumarDias(fecha, -v.window_minus), window_end: sumarDias(fecha, v.window_plus) }
  })
}

/**
 * Los cuatro pacientes y lo que cada uno deja en pantalla:
 *   · P1 — V3 HOY, sin llegar (Visitas de hoy, «por venir»).
 *   · P2 — V2 de randomización HOY, ya llegó, con un pedido de dispensación pendiente (Farmacia).
 *   · P3 — V3 en dos días (la semana del calendario).
 *   · P4 — la V3 con la ventana vencida (la alerta de Pendientes).
 * Los randomizados hicieron la V1 catorce días antes de la V2, como dice el cronograma.
 */
export function planDePacientes(hoy) {
  const randomizado = (dias) => {
    const randomizacion = sumarDias(hoy, dias)
    return { screening: sumarDias(randomizacion, -14), randomizacion }
  }
  return [
    { alias: 'P1', ivrs: '301-0001', nombre: 'Rosa Medina', nacimiento: '1956-04-12', sexo: 'F', fertilidad: 'posmenopausica', ...randomizado(-28) },
    { alias: 'P2', ivrs: '301-0002', nombre: 'Héctor Quiroga', nacimiento: '1961-09-03', sexo: 'M', fertilidad: 'na',
      screening: sumarDias(hoy, -14), randomizacion: null, v2Hoy: hoy },
    { alias: 'P3', ivrs: '301-0003', nombre: 'Graciela Funes', nacimiento: '1959-11-27', sexo: 'F', fertilidad: 'posmenopausica', ...randomizado(-26) },
    { alias: 'P4', ivrs: '301-0004', nombre: 'Ernesto Villalba', nacimiento: '1950-06-08', sexo: 'M', fertilidad: 'na', ...randomizado(-54) },
  ]
}

/** Los claims que `auth.uid()` lee de `request.jwt.claims` (el `sub`). Nadie en el schema usa `auth.jwt()`. */
export function claimsDe(uid) {
  return JSON.stringify({ sub: uid, role: 'authenticated' })
}

// ── La carga ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Corre `fn(q)` en una transacción propia COMO `cuenta` (o como postgres, con `cuenta` null). `q(sql, params)`
 * devuelve las filas. Si algo falla, rollback y un error que dice el paso y quién lo hacía: es lo que se lee en
 * el cierre de jornada cuando una migración rompió la semilla.
 */
async function paso(db, cuenta, nombre, fn, { comoPostgres = false } = {}) {
  const { cliente } = db
  await cliente.query('begin')
  try {
    if (!comoPostgres) await cliente.query('set local role authenticated')
    if (cuenta) await cliente.query("select set_config('request.jwt.claims', $1, true)", [claimsDe(cuenta.id)])
    const r = await fn(async (sql, params) => (await cliente.query(sql, params)).rows)
    await cliente.query('commit')
    return r
  } catch (e) {
    await cliente.query('rollback').catch(() => {})
    const quien = comoPostgres ? 'postgres' : cuenta?.nombre ?? 'sin sesión'
    throw new Error(`La semilla falló en «${nombre}» (como ${quien}): ${e.code ?? ''} ${e.message}`)
  }
}

/** Una sola fila, o error: un insert que la RLS filtra devuelve 0 filas sin quejarse (CLAUDE.md, «RLS filtra en
 *  silencio»). */
function una(filas, que) {
  if (filas.length !== 1) throw new Error(`se esperaba 1 fila de ${que} y volvieron ${filas.length}`)
  return filas[0]
}

/** Crea las cuentas por la API admin del demo: confirmadas, sin contraseña. `handle_new_user` copia el nombre. */
async function crearCuentas(cfg, log) {
  const headers = { apikey: cfg.secretKey, Authorization: `Bearer ${cfg.secretKey}`, 'Content-Type': 'application/json' }
  const cuentas = []
  for (const c of CUENTAS) {
    const r = await fetch(`${cfg.url}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: c.email, email_confirm: true, user_metadata: { full_name: c.nombre } }),
    })
    const cuerpo = await r.json().catch(() => ({}))
    if (!r.ok || !cuerpo.id) throw new Error(`No se pudo crear la cuenta ${c.email} (HTTP ${r.status}): ${cuerpo.msg ?? cuerpo.message ?? ''}`)
    cuentas.push({ ...c, id: cuerpo.id })
  }
  log(`· ${cuentas.length} cuentas creadas (${cuentas.map((c) => c.alias).join(', ')}).`)
  return Object.fromEntries(cuentas.map((c) => [c.alias, c]))
}

/**
 * La semilla entera. Exige el demo (centinela presente) y RECIÉN MIGRADO: sin cuentas ni protocolos, porque correrla
 * dos veces duplicaría todo. Si falla a la mitad, la salida es volver a resetear (que vuelve a sembrar).
 * `hoy` se inyecta para poder fijarlo; por defecto, el día AR.
 */
export async function sembrar(db, { log = console.log, hoy = hoyEnAR() } = {}) {
  const estado = await verificarCentinela(db.consultar)
  if (estado !== 'presente') throw new GuardiaError('La semilla exige la centinela del demo.')
  const [{ cuentas, protocolos }] = await db.consultar(
    'select (select count(*) from auth.users)::int as cuentas, (select count(*) from public.protocols)::int as protocolos',
  )
  if (cuentas || protocolos) {
    throw new Error(`La semilla va sobre un demo recién migrado y éste ya tiene ${cuentas} cuenta(s) y ${protocolos} protocolo(s). Corré \`npm run demo:resetear\`.`)
  }

  log(`· Semilla para el ${hoy}…`)
  const c = await crearCuentas(db.cfg, log)
  const pacientes = planDePacientes(hoy)

  // 1 · La primera gerencia (excepción 1). `app.actor_id` para que la auditoría no quede sin autor (0003).
  await paso(db, null, 'primera gerencia', async (q) => {
    await q("select set_config('app.actor_id', $1, true)", [c.dir.id])
    await q("insert into public.user_module_roles (user_id, module, role) values ($1, 'gerencia', 'admin')", [c.dir.id])
  }, { comoPostgres: true })

  // 2 · El resto de los accesos, por la consola de accesos (compare-and-swap: nadie tenía nada).
  await paso(db, c.dir, 'set_module_access', async (q) => {
    for (const cuenta of Object.values(c)) {
      for (const [modulo, rol] of cuenta.accesos) {
        if (cuenta.alias === 'dir' && modulo === 'gerencia') continue
        await q('select public.set_module_access($1::uuid, $2::spira_module, $3::module_role, null)', [cuenta.id, modulo, rol])
      }
    }
  })

  // 3 · El estudio lo crea la coordinadora, como desde la app (`createProtocol`): insert directo. El trigger de la
  //     0154 la deja asignada como coordinadora (con gerencia no lo haría).
  const protocolo = await paso(db, c.coord, 'alta del protocolo', async (q) => una(await q(
    `insert into public.protocols (code, name, sponsor, legal_entity, created_by, description)
     values ($1, $2, $3, 'protocolo_particular', $4, $5) returning id`,
    [ESTUDIO.code, ESTUDIO.name, ESTUDIO.sponsor, c.coord.id, ESTUDIO.description]), 'protocols').id)

  // 4 · Catálogo de procedimientos + cronograma + procedimientos por visita, como gerencia (la policy del
  //     cronograma pide gerencia o track admin, hallazgo B).
  const defs = await paso(db, c.dir, 'cronograma', async (q) => {
    const proc = {}
    for (const [code, name, category, requiresDispensation] of PROCEDIMIENTOS) {
      proc[code] = una(await q(
        'insert into public.procedures (code, name, category, requires_dispensation) values ($1, $2, $3, $4) returning id',
        [code, name, category, requiresDispensation]), `procedures ${code}`).id
    }
    const ids = {}
    for (const [orden, v] of CRONOGRAMA.entries()) {
      const id = una(await q(
        `insert into public.visit_definitions
           (protocol_id, code, name, date_mode, role, offset_days, window_minus, window_plus, dispenses, dispenses_ip, sort_order)
         values ($1, null, $2, $3, $4, $5, $6, $7, $8, false, $9) returning id`,
        [protocolo, v.name, v.date_mode, v.role, v.offset_days, v.window_minus, v.window_plus, v.dispenses, orden]), `visit_definitions ${v.name}`).id
      await q('select public.set_visit_procedures($1::uuid, $2::uuid[])', [id, v.procedimientos.map((p) => proc[p])])
      ids[v.role === 'comun' ? v.name : v.role] = id
    }
    return ids
  })

  // 5 · Medicación con stock: catálogo, asignación al estudio y una recepción verificada (dispara el stock, 0040).
  const medicamento = await paso(db, c.farmaresp, 'catálogo y recepción', async (q) => {
    const m = MEDICACION
    const [{ id: droga }] = await q('select public.create_drug($1) as id', [m.droga])
    const [{ id: lab }] = await q('select public.create_laboratorio($1) as id', [m.laboratorio])
    const [{ id: med }] = await q('select public.create_medication($1::uuid, $2, $3, $4, $5, $6::uuid, $7, $8) as id',
      [droga, m.nombre, m.unidad, m.umbral, m.gtin, lab, m.dosis, m.clase])
    await q('select public.assign_medication_to_protocol($1::uuid, $2::uuid)', [protocolo, med])
    const items = [{ medication_id: med, lot_number: m.lote, expiry_date: sumarDias(hoy, 540), quantity: m.cantidad }]
    const [{ id: recepcion }] = await q(
      "select public.create_reception('protocolo', $1::uuid, $2::date, $3, $4::jsonb) as id",
      [protocolo, sumarDias(hoy, -20), 'Envío inicial del sponsor', JSON.stringify(items)])
    await q('select public.verify_reception($1::uuid)', [recepcion])
    return med
  })

  // 6 · Los pacientes, por el recorrido de la coordinadora: alta → V1 atendida → V2 (randomización o llegada hoy).
  const visitas = await paso(db, c.coord, 'pacientes y visitas', async (q) => {
    const salida = {}
    for (const p of pacientes) {
      const [{ id: paciente }] = await q(
        'select public.create_patient_with_enrollment($1, $2, $3::uuid, $4::date, $5, $6, $7) as id',
        [p.ivrs, p.nombre, protocolo, p.nacimiento, ESTUDIO.medico, p.sexo, p.fertilidad])
      const { id: inscripcion } = una(await q('select id from public.enrollments where patient_id = $1', [paciente]), 'enrollments')

      const atender = async (def, fecha, opciones) => {
        const [{ id }] = await q('select public.schedule_protocol_visit($1::uuid, $2::uuid, $3::date) as id', [inscripcion, def, fecha])
        await q('select public.mark_arrived($1::uuid)', [id])
        await q('select public.start_visit_attention($1::uuid, $2::date)', [id, fecha])
        await q('select public.mark_ready_with_outcome($1::uuid, null, $2)', [id, opciones.randomiza ? true : null])
        return id
      }
      const v1 = await atender(defs.screening, p.screening, {})
      let v2
      if (p.randomizacion) {
        v2 = await atender(defs.randomizacion, p.randomizacion, { randomiza: true })
      } else {
        // P2: la V2 es hoy, llegó y espera la medicación. Sin randomizar todavía.
        const [{ id }] = await q('select public.schedule_protocol_visit($1::uuid, $2::uuid, $3::date) as id', [inscripcion, defs.randomizacion, p.v2Hoy])
        await q('select public.mark_arrived($1::uuid)', [id])
        v2 = id
      }
      salida[p.alias] = { paciente, inscripcion, v1, v2, historicas: p.randomizacion ? [[v1, p.screening], [v2, p.randomizacion]] : [[v1, p.screening]] }
    }
    return salida
  })

  // 7 · Correcciones (excepciones 2 y 3), con los claims de la coordinadora para que el autor no quede en null.
  await paso(db, c.coord, 'marcas de hora y fecha de alta', async (q) => {
    for (const p of pacientes) {
      for (const [visita, fecha] of visitas[p.alias].historicas) {
        await q('update public.patient_visits set arrived_at = $2, attended_at = $3, ready_at = $4 where id = $1',
          [visita, marcaAR(fecha, '09:00'), marcaAR(fecha, '09:15'), marcaAR(fecha, '10:00')])
      }
    }
    await q('alter table public.enrollments disable trigger trg_guard_enrollment_immutable')
    for (const p of pacientes) {
      await q('update public.enrollments set enrollment_date = $2 where id = $1', [visitas[p.alias].inscripcion, p.screening])
    }
    await q('alter table public.enrollments enable trigger trg_guard_enrollment_immutable')
  }, { comoPostgres: true })

  // 8 · Farmacia habilita la medicación de los cuatro (el pedido de P2 lo exige, trigger de la 0050/0151).
  await paso(db, c.farma, 'medicación de los pacientes', async (q) => {
    for (const p of pacientes) {
      await q('select * from public.assign_patient_medication($1::uuid, $2::uuid, $3, false)',
        [visitas[p.alias].inscripcion, medicamento, 'Indicación del protocolo'])
    }
  })

  // 9 · El pedido pendiente de P2, desde Coordinación: queda «solicitada».
  await paso(db, c.coord, 'pedido de dispensación', async (q) => {
    await q("select public.create_dispensation_request($1::uuid, $2::jsonb, $3, 'track') as id",
      [visitas.P2.v2, JSON.stringify([{ medication_id: medicamento, quantity: 2 }]), 'Día 1 · randomización'])
  })

  // 10 · Reposición lista para mostrar, como la deja Farmacia la primera vez: el día de corte (`guardarDiaCorte`,
  //      update directo) y cómo se repone el Bufomix (`configurarReposicion`: un envase por paciente por mes).
  //      Sin esto, Reposición es sólo «Falta el día de corte» o «Falta cargar cómo se repone», y el recorrido de
  //      Farmacia (tutorial `conocer-farmacia`) no tiene ninguna cuenta para mostrar.
  await paso(db, c.farma, 'reposición', async (q) => {
    una(await q('update public.farmacia_ajustes set dia_corte = 20 where unica returning id'), 'farmacia_ajustes')
    const { id: asignacion } = una(await q(
      'select id from public.protocol_medications where protocol_id = $1::uuid and medication_id = $2::uuid',
      [protocolo, medicamento]), 'protocol_medications')
    await q("select public.configurar_reposicion($1::uuid, 'mensual', 1, null)", [asignacion])
  })

  log(`✓ Semilla: ${ESTUDIO.code} con ${CRONOGRAMA.length} visitas en el cronograma, ${pacientes.length} pacientes, ${MEDICACION.cantidad} ${MEDICACION.nombre} en stock y un pedido pendiente.`)
  return { cuentas: c, protocolo, pacientes: visitas }
}
