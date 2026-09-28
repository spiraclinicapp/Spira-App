// Banco de pruebas de la RLS · datos sintéticos en TODAS las tablas de public, y los perfiles.
//
// El sembrado es genérico, por catálogo, y no por tabla escrita a mano: recorre las tablas en orden
// topológico de sus FKs y arma cada fila con lo que dice el esquema —padres existentes para las FKs,
// valores del enum, las listas de los `check … in (…)`—. Así una tabla nueva queda sembrada sin tocar
// este archivo. Las pocas excepciones (abajo, `patient_visits`) son formas que ningún generador
// adivina.
//
// Es DETERMINISTA (PRNG con semilla): dos corridas dan los mismos datos, y un "antes" y un "después"
// sembrados por separado son comparables.
//
// Dos pasadas por tabla: la segunda, sólo si la primera no metió ninguna fila, apaga los triggers
// (`session_replication_role = replica`) y usa más nulos. La traban reglas de dominio que viven en
// triggers —"el medicamento no está asignado al protocolo"— y que no tienen nada que ver con la RLS.
//
// ⚠️ Cortar pronto los intentos fallidos: muchas inserciones fallidas seguidas agotan la pila de PGlite
// (`54001 stack depth limit exceeded`), y la que revienta es la consulta SIGUIENTE, aunque sea de
// catálogo — lejísimo de la causa.

let semilla = 12345
const rnd = () => ((semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const elegir = (a) => a[Math.floor(rnd() * a.length)]
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = Math.floor(rnd() * 16)
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
})

/**
 * Los perfiles. Cubren cada rama de las policies: gerencia (ve todo), coordinación con y sin
 * protocolos, los niveles de Coordinación, Farmacia sin recorte / acotada a uno / acotada a ninguno,
 * contable, nadie, una cuenta con dos módulos y sin sesión. Las coordinaciones y los alcances de
 * Farmacia se asignan sobre los protocolos sembrados (ver ASIGNACIONES).
 */
export const PERFILES = {
  gerencia: '00000000-0000-4000-8000-000000000001',
  coordinadora1: '00000000-0000-4000-8000-000000000002',
  coordinadora23: '00000000-0000-4000-8000-000000000003',
  liderCoordinacion: '00000000-0000-4000-8000-000000000004',
  adminCoordinacion: '00000000-0000-4000-8000-000000000005',
  farmacia: '00000000-0000-4000-8000-000000000006',
  farmaciaAcotada: '00000000-0000-4000-8000-000000000007',
  farmaciaSinEstudios: '00000000-0000-4000-8000-000000000008',
  contable: '00000000-0000-4000-8000-000000000009',
  sinModulos: '00000000-0000-4000-8000-00000000000a',
  mixta: '00000000-0000-4000-8000-00000000000b',
  sinSesion: '',
}
const P = PERFILES

// [persona, módulo, rol, ve_todos_los_estudios]
const ROLES = [
  [P.gerencia, 'gerencia', 'admin', true],
  [P.coordinadora1, 'track', 'operator', true],
  [P.coordinadora23, 'track', 'operator', true],
  [P.liderCoordinacion, 'track', 'leader', true],
  [P.adminCoordinacion, 'track', 'admin', true],
  [P.farmacia, 'pharma', 'operator', true],
  [P.farmaciaAcotada, 'pharma', 'viewer', false],
  [P.farmaciaSinEstudios, 'pharma', 'operator', false],
  [P.contable, 'contable', 'viewer', true],
  [P.mixta, 'track', 'operator', true],
  [P.mixta, 'pharma', 'leader', false],
]

// Sobre los protocolos sembrados, por orden de creación: [persona, índices].
const ASIGNACIONES = {
  protocol_coordinators: [[P.coordinadora1, [0]], [P.coordinadora23, [1, 2]], [P.adminCoordinacion, [0]], [P.mixta, [2]]],
  pharma_protocol_access: [[P.farmaciaAcotada, [1]], [P.mixta, [0]]],
}

// Columnas que guardan a una persona: se llenan con un perfil y no con un uuid al azar, así las
// policies del tipo `user_id = auth.uid()` tienen filas propias que encontrar.
const COLUMNAS_DE_PERSONA = /^(user_id|created_by|dismissed_by|recorded_by|completed_by|ready_by|actor_id|executed_by|dispensed_by|requested_by|verified_by|updated_by|assigned_by|marked_by|closed_by|uploaded_by|doctor_marked_by|coordinator_id|delivered_by)$/

/** Cuántas filas por tabla con el volumen de prod al 2026-09-28 (~1.000 visitas). */
export const VOLUMEN_PROD = { protocols: 5, patients: 65, enrollments: 75, patient_visits: 1000, visit_procedure_completions: 300, report_status: 300, protocol_activities: 120 }
/** Chico, para comparar rápido: alcanza para cubrir cada rama. */
export const VOLUMEN_CHICO = { protocols: 5, patients: 20, enrollments: 30, patient_visits: 80 }

const literal = (v) => `'${String(v).replace(/'/g, "''")}'`
const fechaAlAzar = () => new Date(Date.now() + (rnd() - 0.6) * 200 * 864e5)

/**
 * Siembra la base. `volumen` pisa las filas por tabla (25 por defecto). Devuelve cuántas filas quedaron
 * en cada tabla: una en 0 quiere decir que sus policies no se pueden probar con estos datos.
 */
export async function sembrar(db, { volumen = VOLUMEN_CHICO, filasPorTabla = 25, traza = false } = {}) {
  semilla = 12345
  const q = async (sql) => (await db.query(sql)).rows
  await db.exec(`set spira.uid = '${P.gerencia}'`)

  for (const id of Object.values(P).filter(Boolean)) {
    await db.exec(`insert into auth.users (id, email) values ('${id}', '${id.slice(-2)}@banco.test')`)
  }
  await db.exec(`insert into public.users (id, full_name) select id, 'Perfil ' || right(id::text, 2) from auth.users on conflict (id) do nothing`)
  for (const [u, m, r, todos] of ROLES) {
    await db.exec(`insert into public.user_module_roles (user_id, module, role, ve_todos_los_estudios) values ('${u}', '${m}', '${r}', ${todos})`)
  }

  const tablas = (await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'public' and c.relkind = 'r' order by 1`)).map((r) => r.relname)
  const fks = await q(`select con.conrelid::regclass::text as tabla, con.confrelid::regclass::text as padre,
      (select array_agg(a.attname order by k.o) from unnest(con.conkey) with ordinality k(n, o)
         join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n) as cols,
      (select array_agg(a.attname order by k.o) from unnest(con.confkey) with ordinality k(n, o)
         join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n) as cols_padre
    from pg_constraint con join pg_namespace n on n.oid = con.connamespace
    where con.contype = 'f' and n.nspname = 'public'`)
  const checks = await q(`select con.conrelid::regclass::text as tabla, pg_get_constraintdef(con.oid) as def,
      (select array_agg(a.attname) from unnest(con.conkey) k(n) join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n) as cols
    from pg_constraint con join pg_namespace n on n.oid = con.connamespace where con.contype = 'c' and n.nspname = 'public'`)
  const sinEsquema = (t) => t.replace(/^public\./, '')

  // Orden topológico por FKs (las autorreferencias se ignoran: esas columnas van en NULL).
  const deps = new Map(tablas.map((t) => [t, new Set()]))
  for (const f of fks) {
    const a = sinEsquema(f.tabla), b = sinEsquema(f.padre)
    if (a !== b && deps.has(a) && deps.has(b)) deps.get(a).add(b)
  }
  const orden = [], visto = new Set()
  const visitar = (t) => { if (visto.has(t)) return; visto.add(t); for (const d of deps.get(t) ?? []) visitar(d); orden.push(t) }
  for (const t of deps.keys()) visitar(t)

  const A_MANO = new Set(['users', 'user_module_roles', 'audit_log'])
  const conteo = {}
  for (const t of orden) {
    if (ASIGNACIONES[t]) {
      const protocolos = (await q(`select id from public.protocols order by created_at, id`)).map((r) => r.id)
      for (const [persona, indices] of ASIGNACIONES[t]) {
        for (const i of indices) if (protocolos[i]) await db.exec(`insert into public.${t} (protocol_id, user_id) values ('${protocolos[i]}', '${persona}')`)
      }
      continue
    }
    if (A_MANO.has(t)) continue

    const cols = await q(`select a.attname as col, t.typtype, a.atttypid::regtype::text as tipo, not a.attnotnull as nulo,
        d.adbin is not null as tiene_default, a.attidentity <> '' or a.attgenerated <> '' as automatica
      from pg_attribute a join pg_type t on t.oid = a.atttypid
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = 'public.${t}'::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum`)
    const misFks = fks.filter((f) => sinEsquema(f.tabla) === t && sinEsquema(f.padre) !== t)
    const autoRef = new Set(fks.filter((f) => sinEsquema(f.tabla) === t && sinEsquema(f.padre) === t).flatMap((f) => f.cols))
    const padres = {}
    for (const f of misFks) padres[f.cols.join(',')] = await q(`select ${f.cols_padre.join(', ')} from ${f.padre}`)
    const listas = {}
    for (const c of checks.filter((c) => sinEsquema(c.tabla) === t && c.cols?.length === 1)) {
      const vals = [...c.def.matchAll(/'([^']*)'/g)].map((m) => m[1])
      if (vals.length > 1 && /ANY|IN \(/i.test(c.def)) listas[c.cols[0]] = vals
      // `check (unica)`: la fila única de una tabla de ajustes (farmacia_ajustes, 0125).
      if (/^CHECK \(\w+\)$/.test(c.def)) listas[c.cols[0]] = [true]
    }
    const enums = {}
    for (const c of cols.filter((c) => c.typtype === 'e')) {
      enums[c.col] = (await q(`select enumlabel from pg_enum where enumtypid = '${c.tipo}'::regtype order by enumsortorder`)).map((r) => r.enumlabel)
    }

    const n = volumen[t] ?? filasPorTabla
    let ok = 0, fallos = 0, ultimoError = ''
    for (const pasada of [1, 2]) {
      if (pasada === 2) {
        if (ok > 0) break
        await db.exec('set session_replication_role = replica')
        fallos = 0
      }
      const probNulo = pasada === 1 ? 0.4 : 0.75
      for (let i = 0; ok < n && fallos < 12 + ok * 2; i++) {
        const fila = {}
        for (const [clave, filasPadre] of Object.entries(padres)) {
          const ks = clave.split(',')
          const c0 = cols.find((c) => c.col === ks[0])
          if (filasPadre.length === 0 || (c0?.nulo && rnd() < 0.2)) { for (const k of ks) fila[k] = null; continue }
          const p = elegir(filasPadre)
          const f = misFks.find((f) => f.cols.join(',') === clave)
          ks.forEach((k, j) => { fila[k] = p[f.cols_padre[j]] })
        }
        // patient_visits_kind_shape: una «programada» lleva definición, fecha estimada y ventana;
        // cualquier otra, ninguna de las tres. El retest necesita su origen: queda afuera.
        if (t === 'patient_visits') {
          const dia = () => fechaAlAzar().toISOString().slice(0, 10)
          if (rnd() < 0.7 && padres.visit_def_id?.length) {
            fila.visit_def_id = elegir(padres.visit_def_id).id
            fila.kind = 'programada'
            fila.estimated_date = dia()
            const w = dia()
            fila.window_start = w
            fila.window_end = new Date(Date.parse(w) + 7 * 864e5).toISOString().slice(0, 10)
          } else {
            fila.visit_def_id = null
            fila.kind = elegir(enums.kind.filter((k) => k !== 'programada' && k !== 'retest'))
            fila.window_start = null
            fila.window_end = null
          }
          fila.retest_of_visit_id = null
        }

        const nombres = [], valores = []
        for (const c of cols) {
          if (c.automatica) continue
          let v
          if (c.col in fila) v = fila[c.col]
          else if (autoRef.has(c.col)) v = null
          else if (c.tiene_default && rnd() < 0.5) continue
          else if (c.nulo && rnd() < probNulo) v = null
          else if (listas[c.col]) v = elegir(listas[c.col])
          else if (enums[c.col]) v = elegir(enums[c.col])
          else if (COLUMNAS_DE_PERSONA.test(c.col) && c.tipo === 'uuid') v = elegir(Object.values(P).filter(Boolean))
          else if (c.tipo === 'uuid') v = uuid()
          else if (c.tipo === 'boolean') v = rnd() < 0.5
          else if (/int|numeric|real|double/.test(c.tipo)) v = 1 + Math.floor(rnd() * 20)
          else if (c.tipo === 'date') v = fechaAlAzar().toISOString().slice(0, 10)
          else if (/timestamp/.test(c.tipo)) v = fechaAlAzar().toISOString()
          else if (/json/.test(c.tipo) || /\[\]$/.test(c.tipo)) v = '{}' // objeto json vacío o arreglo vacío
          else if (c.tipo === 'interval') v = '1 day'
          else if (c.tipo === 'time without time zone') v = '10:00'
          // Sólo [a-z0-9_]: hay claves con `check (key ~ '^[a-z0-9_]+$')` (report_platforms, 0111).
          else v = `${c.col}_${t}_${i}_${Math.floor(rnd() * 1e6)}`
          nombres.push(c.col)
          valores.push(v === null ? 'null' : `${literal(v)}::${c.tipo}`)
        }
        try {
          await db.exec(`insert into public.${t} (${nombres.join(', ')}) values (${valores.join(', ')})`)
          ok++
        } catch (e) {
          fallos++
          ultimoError = e.message
        }
      }
    }
    await db.exec('set session_replication_role = origin')
    // Las filas REALES, no las que metió el sembrado: hay tablas que ya trae una migración (la fila
    // única de farmacia_ajustes la inserta la 0125, y por eso el sembrado choca con su unique).
    conteo[t] = (await q(`select count(*)::int n from public.${t}`))[0].n
    if (traza) console.error(`  ${t}: ${conteo[t]}${ok === 0 ? ` (el sembrado no agregó ninguna: ${ultimoError.slice(0, 100)})` : ''}`)
  }
  await db.exec('reset spira.uid')
  return conteo
}
