// Banco · los casos de la 0162 (Coordinación lee quién coordina el estudio: list_protocol_coordinators).
// Corre las migraciones reales HASTA LA 0161, siembra los perfiles, pregunta con cada uno, aplica la 0162
// encima de esos MISMOS datos y vuelve a preguntar. Queda fijado a la 0162 sin tocarlo cuando lleguen otras.
//
//   node scripts/banco-rls/casos-0162.mjs
//
// Cada caso dice qué respondía antes y qué responde después: «lee» (y entonces compara la lista entera, en
// orden, contra protocol_coordinators leída como superusuario) o el mensaje del 42501. Que los «antes» den
// lo esperado es lo que prueba que el banco reproduce el problema de prod; sin eso, el «después» en verde
// no diría nada. Sale con código 1 si algún caso falla.
import { crearBase, comoPerfil, migracion } from './base.mjs'
import { sembrar, PERFILES as P } from './sembrar.mjs'

const db = await crearBase({ hasta: 161 })
await sembrar(db)
const q = async (sql) => (await db.query(sql)).rows

// ── El mini-arnés (el de casos-0160) ────────────────────────────────────────────────────────────────
let ok = 0
const fallas = []
const caso = async (nombre, fn) => {
  try { await fn(); ok++; console.log(`  ✓ ${nombre}`) } catch (e) { fallas.push(nombre); console.log(`  ✗ ${nombre}\n      ${e.message}`) }
}
const igual = (a, b, que) => { if (a !== b) throw new Error(`${que}: esperaba ${JSON.stringify(b)} y vino ${JSON.stringify(a)}`) }

// ── Los estudios, por orden de creación (ASIGNACIONES de sembrar.mjs) ──────────────────────────────
// 0: coordinadora1 + adminCoordinacion; Farmacia de mixta. 1: coordinadora23; Farmacia de farmaciaAcotada.
// 2: coordinadora23 + mixta. 4: nadie. Se comprueba abajo, antes de usarlos: si el sembrado cambia, el
// caso de las precondiciones lo dice en vez de dejar pasar una prueba que ya no prueba lo que dice.
const PROTOS = (await q(`select id from public.protocols order by created_at, id`)).map((r) => r.id)
const [P0, P1, P2, , P4] = PROTOS
const coordinaQ = async (uid, proto) => (await q(`select exists (select 1 from public.protocol_coordinators
  where user_id = '${uid}' and protocol_id = '${proto}') as si`))[0].si

// Dos personas más, que el sembrado no tiene: una de Coordinación VIEWER que coordina el estudio 0, y
// una cuenta dada de baja que también figura como coordinadora del 0 (la lista no la tiene que traer).
// La fila de public.users la crea el trigger de auth.users: acá sólo se le pone el nombre.
const VIEWER = '00000000-0000-4000-8000-0000000001a0'
const DE_BAJA = '00000000-0000-4000-8000-0000000001a1'
await db.exec(`
  insert into auth.users (id, email) values ('${VIEWER}', 'viewer@banco.test'), ('${DE_BAJA}', 'baja@banco.test');
  insert into public.users (id, full_name) values ('${VIEWER}', 'Perfil viewer'), ('${DE_BAJA}', 'Perfil de baja')
    on conflict (id) do update set full_name = excluded.full_name;
  insert into public.user_module_roles (user_id, module, role) values ('${VIEWER}', 'track', 'viewer'), ('${DE_BAJA}', 'track', 'operator');
  insert into public.protocol_coordinators (protocol_id, user_id) values ('${P0}', '${VIEWER}'), ('${P0}', '${DE_BAJA}');
  update public.users set is_active = false where id = '${DE_BAJA}';
`)

/** La lista que tiene que devolver, leída como superusuario: coordinadores ACTIVOS, por nombre. */
const esperada = async (proto) => (await q(`select u.id::text from public.protocol_coordinators pc
  join public.users u on u.id = pc.user_id where pc.protocol_id = '${proto}' and u.is_active
  order by u.full_name`)).map((r) => r.id).join(',')

/** Lo que responde la RPC con la sesión de `uid`: { lee: 'id,id' } o { error: 'mensaje' }. */
const llamar = async (uid, proto) => {
  try {
    const filas = await comoPerfil(db, uid, `select id::text from public.list_protocol_coordinators('${proto}')`)
    return { lee: filas.map((r) => r.id).join(',') }
  } catch (e) {
    if (e.code !== '42501') throw new Error(`esperaba 42501 y vino ${e.code}: ${e.message}`)
    return { error: e.message }
  }
}
/** Lo mismo con el rol anon (sin sesión y sin `authenticated`), como llama la API sin sesión. */
const llamarComoAnon = async (proto) => {
  await db.exec(`set role anon`)
  try {
    await db.query(`select * from public.list_protocol_coordinators('${proto}')`)
    return { lee: 'anon pudo llamarla' }
  } catch (e) {
    if (e.code !== '42501') throw new Error(`esperaba 42501 y vino ${e.code}: ${e.message}`)
    return { error: e.message }
  } finally { await db.exec(`reset role`) }
}

const LEE = 'lee'
const SIN_PERMISO = 'Sin permiso'
const FUERA_DE_ALCANCE = 'No tenés acceso a este estudio.'
const NO_AUTENTICADO = 'No autenticado'
const DENEGADA = 'permission denied for function list_protocol_coordinators'

// [quién, uid, estudio, antes, después]. Las que cambian salen marcadas con [cambia].
const MATRIZ = [
  ['gerencia', P.gerencia, P0, LEE, LEE],
  ['coordinadora1 (operador que coordina el 0)', P.coordinadora1, P0, SIN_PERMISO, LEE],
  ['adminCoordinacion (admin que coordina el 0, como Lautaro)', P.adminCoordinacion, P0, SIN_PERMISO, LEE],
  ['viewer de Coordinación que coordina el 0', VIEWER, P0, SIN_PERMISO, LEE],
  ['liderCoordinacion (no coordina el 0)', P.liderCoordinacion, P0, SIN_PERMISO, LEE],
  ['coordinadora23 (no coordina el 0)', P.coordinadora23, P0, SIN_PERMISO, SIN_PERMISO],
  ['farmacia sin recorte', P.farmacia, P0, LEE, LEE],
  ['farmaciaAcotada, fuera de su alcance', P.farmaciaAcotada, P0, FUERA_DE_ALCANCE, FUERA_DE_ALCANCE],
  ['farmaciaSinEstudios', P.farmaciaSinEstudios, P0, FUERA_DE_ALCANCE, FUERA_DE_ALCANCE],
  ['mixta, por su alcance de Farmacia', P.mixta, P0, LEE, LEE],
  ['contable', P.contable, P0, SIN_PERMISO, SIN_PERMISO],
  ['sinModulos', P.sinModulos, P0, SIN_PERMISO, SIN_PERMISO],
  ['sin sesión (authenticated sin uid)', P.sinSesion, P0, SIN_PERMISO, NO_AUTENTICADO],

  ['coordinadora23 en el 1, que coordina', P.coordinadora23, P1, SIN_PERMISO, LEE],
  ['farmaciaAcotada en el 1, dentro de su alcance', P.farmaciaAcotada, P1, LEE, LEE],
  ['mixta en el 1: ni lo coordina ni está en su alcance', P.mixta, P1, FUERA_DE_ALCANCE, FUERA_DE_ALCANCE],

  ['mixta en el 2, que coordina fuera de su alcance de Farmacia (la 0142 la cortaba)', P.mixta, P2, FUERA_DE_ALCANCE, LEE],
  ['coordinadora1 en el 2, que no coordina', P.coordinadora1, P2, SIN_PERMISO, SIN_PERMISO],

  ['adminCoordinacion en el 4, sin coordinadores: lista vacía', P.adminCoordinacion, P4, SIN_PERMISO, LEE],
  ['gerencia en el 4, sin coordinadores: lista vacía', P.gerencia, P4, LEE, LEE],
  ['coordinadora1 en el 4', P.coordinadora1, P4, SIN_PERMISO, SIN_PERMISO],
]

const comprobar = async (uid, proto, espera) => {
  const r = uid === 'anon' ? await llamarComoAnon(proto) : await llamar(uid, proto)
  if (espera === LEE) {
    if (r.error) throw new Error(`esperaba leer y rebotó: «${r.error}»`)
    igual(r.lee, await esperada(proto), 'la lista')
  } else {
    if (!r.error) throw new Error(`esperaba «${espera}» y leyó: ${r.lee || '(lista vacía)'}`)
    if (!r.error.includes(espera)) throw new Error(`esperaba «${espera}» y vino «${r.error}»`)
  }
}

// ── Las precondiciones del sembrado ─────────────────────────────────────────────────────────────────
console.log('\nel sembrado tiene la forma que la matriz supone')
await caso('las asignaciones y los alcances de los estudios 0, 1, 2 y 4', async () => {
  const debe = [
    [P.coordinadora1, P0, true], [P.adminCoordinacion, P0, true], [VIEWER, P0, true],
    [P.liderCoordinacion, P0, false], [P.coordinadora23, P0, false], [P.mixta, P0, false],
    [P.coordinadora23, P1, true], [P.mixta, P1, false], [P.mixta, P2, true], [P.coordinadora1, P2, false],
  ]
  for (const [uid, proto, si] of debe) igual(await coordinaQ(uid, proto), si, `coordina ${uid.slice(-3)} el ${PROTOS.indexOf(proto)}`)
  igual(await esperada(P4), '', 'el estudio 4 no tiene coordinadores')
  igual((await esperada(P0)).split(',').length, 3, 'el 0 tiene tres coordinadores activos (sin la cuenta de baja)')
  const acceso = (await q(`select user_id::text || ':' || protocol_id::text as k from public.pharma_protocol_access`)).map((r) => r.k)
  if (!acceso.includes(`${P.mixta}:${P0}`) || !acceso.includes(`${P.farmaciaAcotada}:${P1}`)) throw new Error('los alcances de Farmacia no son los del sembrado')
})

// ── Antes: la 0161, lo que hay en prod ──────────────────────────────────────────────────────────────
console.log('\nANTES (hasta la 0161): reproduce lo de prod')
for (const [quien, uid, proto, antes, despues] of MATRIZ) {
  await caso(`${quien} → ${antes}${antes !== despues ? "   [cambia]" : ""}`, () => comprobar(uid, proto, antes))
}
await caso('anon → Sin permiso (lo que respondía prod el 2026-10-16)', () => comprobar('anon', P0, SIN_PERMISO))

// ── La 0162 ─────────────────────────────────────────────────────────────────────────────────────────
console.log('\nla 0162 sobre los mismos datos')
await caso('entra, y entra dos veces (idempotente)', async () => {
  await db.exec(migracion(162).sql)
  await db.exec(migracion(162).sql)
})
await caso('la función nueva es la que quedó (prosrc), con la guarda de alcance de Farmacia', async () => {
  const [f] = await q(`select prosrc from pg_proc where proname = 'list_protocol_coordinators'`)
  if (!f.prosrc.includes('is_assigned_coordinator')) throw new Error('el cuerpo no es el de la 0162')
  if (!f.prosrc.includes('pharma_alcanza_protocolo')) throw new Error('se perdió la guarda de alcance de Farmacia')
  igual((await q(`select count(*)::int as n from pg_proc where proname = 'list_protocol_coordinators'`))[0].n, 1, 'versiones (sin sobrecargas)')
})
await caso('authenticated la puede llamar; anon y public, no', async () => {
  const [r] = await q(`select has_function_privilege('authenticated', 'public.list_protocol_coordinators(uuid)', 'execute') as auth,
    has_function_privilege('anon', 'public.list_protocol_coordinators(uuid)', 'execute') as anon`)
  igual(r.auth, true, 'authenticated')
  igual(r.anon, false, 'anon')
})

// ── Después ─────────────────────────────────────────────────────────────────────────────────────────
console.log('\nDESPUÉS (con la 0162)')
for (const [quien, uid, proto, antes, despues] of MATRIZ) {
  await caso(`${quien} → ${despues}${antes !== despues ? "   [cambia]" : ""}`, () => comprobar(uid, proto, despues))
}
await caso('anon → permission denied (la sonda sin sesión que distingue la vieja de la nueva)', () => comprobar('anon', P0, DENEGADA))

console.log(`\n${ok} de ${ok + fallas.length} casos bien.`)
if (fallas.length) { console.log('Fallaron:', fallas); process.exit(1) }
