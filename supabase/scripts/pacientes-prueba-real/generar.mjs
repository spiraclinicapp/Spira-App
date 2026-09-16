// generar.mjs — pacientes, visitas y medicación de la prueba real (LTS17231, ACT18301, 222714, CKJX839D12302).
//
// Lee el listado del sitio («Listado_pacientes_y_visitas .xlsx», hojas «Listado de visitas», «Resumen por
// paciente» y «Medicacion») y escribe en out/ dos SQL para el editor de Supabase, en este orden:
//
//   1-simular.sql  Hace TODA la carga y al final la deshace a propósito (raise exception): el editor muestra
//                  como «error» el informe de lo que va a cambiar. No guarda nada.
//   2-aplicar.sql  El mismo código, sin el deshacer. Termina con una consulta de control.
//
// Los dos salen del mismo molde con una sola diferencia (v_aplicar), así que lo que simula es lo que aplica.
//
// ⚠️ out/ y el Excel están en .gitignore: traen nombres y fechas de nacimiento. Al repo va sólo esto.
//
// Uso:  node supabase/scripts/pacientes-prueba-real/generar.mjs "C:/…/Listado_pacientes_y_visitas .xlsx"
//
// ANTES de correr lo generado, en prod: la versión nueva de cronograma-prueba-real/2-aplicar.sql (ENDURA con
// Día − 1 y hasta la V28; Victorion con el Día tal cual). El script se frena solo si falta.
//
// Decisiones del Director (2026-09-14):
//   · El Excel manda sobre lo que ya hay en Spira (nombre, nacimiento, estado, fechas reales). Nunca se borra
//     una fecha real que esté sólo en Spira: se conserva y se informa.
//   · Victorion: las visitas «Vencida s/ registro» (V2 a V7, 2024-2026) se crean REALIZADAS con la fecha real
//     igual a la estimada, «por ahora». Lo que se quería evitar eran las alertas, no las visitas. Como es una
//     fecha que nadie registró, cada una lleva una NOTA que lo dice: en un sistema auditable el dato provisorio
//     tiene que poder encontrarse y corregirse, y no confundirse con uno registrado.
//     Las vencidas de ENDURA (julio a septiembre de 2026) se cargan pendientes, y alertan.
//   · Los pacientes de estos protocolos que están en Spira y no en el Excel no se tocan: se listan.
//   · El 707401 de ENDURA es la misma persona que el paciente 032000740008, que ya existía en otro estudio: se
//     le suma la inscripción y conserva el nombre completo que tenía (el listado lo trae abreviado).
//   · «Salbutamol 100 mcg» es Salbutral 100 mcg.
//
// Reglas que el Excel no dice y se fijan acá (cada una con su porqué en el SQL):
//   · Una inscripción que no está Activa (Inactivo, Screen Fail) no deja visitas pendientes: las alertas no
//     filtran por estado de inscripción (0107, decisión del 2026-09-05), así que alertarían para siempre. Se
//     borran las que genera la aleatorización (sólo si no tienen nada colgado). Nada las recrea: la
//     sincronización del cronograma sólo mira inscripciones activas, y el trigger sólo corre al cambiar la fecha
//     de aleatorización. Si la inscripción se reactiva, sincronizar las vuelve a crear, que es lo correcto.
//   · Inactivo con la EOT realizada = «completado» (terminó y pasó a la extensión); si no, «discontinuado».
//   · Una visita realizada queda con llegada 09:00 y fin de atención 10:00 de su día, como la carga de julio:
//     sin fin de atención la app la muestra «Sin cerrar».
//   · El sello de IP (0119) se apaga durante la carga: una visita histórica queda con lleva_ip NULL, que es
//     exactamente lo que ese campo dice de las visitas fechadas fuera de Spira. Encendido, cada visita con IP
//     de 2023 a hoy nacería con «IP sin entregar».
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSheets } from '../carga-visitas-historicas/parse-xlsx.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const XLSX = process.argv[2]
if (!XLSX) {
  console.error('Uso: node generar.mjs "<ruta al Excel de pacientes>"')
  process.exit(1)
}

function fallar(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

const HOY = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })

// ---- Configuración ---------------------------------------------------------------------------

const PROTOCOLOS = {
  ACT18301: 'ACT18301',
  LTS17231: 'LTS17231',
  ENDURA: '222714',
  Victorion: 'CKJX839D12302',
}

// Visita de randomización de cada cronograma (cronograma-prueba-real). El SQL la vuelve a leer de la base (role
// 'randomizacion'); acá sólo decide si una inscripción inactiva llegó a aleatorizarse.
const RANDO = { ACT18301: 'V3', LTS17231: 'V1', '222714': 'V2', CKJX839D12302: 'V1' }

// Texto del Excel → nombre EXACTO en el catálogo de Farmacia (leído de prod el 2026-09-14). El script se frena
// si alguno no está, así que un renombre del catálogo no pasa en silencio.
const MEDICACION = {
  'Frevia 160, 4.5 mcg x 120 dosis': 'Frevia 160/4,5 mcg',
  'Salbutamol 100 mcg': 'Salbutral 100 mcg',
  'Salbutamol 100mcg': 'Salbutral 100 mcg',
  'Symbicort 160 x 120 dosis': 'Symbicort 160/4,5 mcg',
  'Neumoterol 200 /6 mcg 120 caps': 'Neumoterol 200/6 mcg',
  'Seretide Diskus 250 /50': 'Seretide Diskus 250/50 mcg',
  'Trelegy Ellipta (Furoato de fluticasona 92 mcg + Umeclidinio 55 mcg + Vilanterol 22 mcg)': 'Trelegy Ellipta (92) 92/55/22 mcg',
  'Salbutral (salbutamol 100 mcg)': 'Salbutral 100 mcg',
  'Neumoterol 200/6 mcg  2 inhalaciones cada 12 hs X120 CPS': 'Neumoterol 200/6 mcg',
  'ACO Norgestrel plus': 'Norgestrel Plus 0,15/0,03 mg',
  'Neumocort plus 200/6 mcg 2 inhalaciones cada 12 hs X 120 CPS': 'Neumocort Plus 200/6 mcg',
  'Neumoterol 160, 4.5 mcg X 120 DOSIS': 'Neumoterol 160/4,5 mcg',
}

// Misma persona que ya existe con otro IVRS (confirmado por el Director).
const MISMA_PERSONA = {
  '222714|707401': { codigo: '032000740008', conservarNombre: true },
}

// Erratas de tipeo del listado, corregidas AL LEER. El listado manda sobre Spira, pero una celda mal
// tipeada no es un dato: es un error que rompe la carga entera y hay que poder nombrarlo.
//   · 2026-09-15 · La V1 de AGUERO en LTS17231 trae el IVRS de MUÑOZ PAMPILLON (…520002). Se ve en que
//     esa misma fila dice apellido AGUERO, y las 19 filas siguientes del mismo paciente dicen …520003.
//     Sin corregirlo, Muñoz Pampillón queda con dos V1 —y el script se frena por visita repetida— y
//     Aguero pierde la única visita que tiene hecha.
// La clave es protocolo|ivrs|APELLIDO: el apellido es lo que desempata, porque el IVRS es justo el
// que está mal. Si el listado se corrige en origen, la entrada deja de encontrar filas y no hace nada.
const ERRATAS_IVRS = {
  'LTS17231|032001520002|AGUERO': '032001520003',
}

// La nota de las visitas con fecha real provisoria. Es el texto por el que se las encuentra después.
const NOTA_PROVISORIA =
  'Fecha real provisoria: igual a la estimada. El listado del sitio no tiene registro de esta visita (carga del 2026-09-14).'

// ---- Lectura ---------------------------------------------------------------------------------

const hojas = readSheets(XLSX)
const filasDe = (nombre) => {
  const h = hojas[nombre]
  if (!h) fallar(`El Excel no tiene la hoja «${nombre}».`)
  return h.rows.slice(1).filter((r) => r.some((c) => String(c).trim()))
}
const resumen = filasDe('Resumen por paciente')
const listado = filasDe('Listado de visitas')
const medicacion = filasDe('Medicacion')

// Serial de Excel (días desde 1899-12-30) → ISO. Vacío → null.
function fecha(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) fallar(`Fecha que no es un número de Excel: «${v}».`)
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10)
}

// «MUÑOZ PAMPILLON» → «Muñoz Pampillon»; «Rosa del Carmen» → «Rosa del Carmen»; «DEL VALLE» → «Del Valle».
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y'])
function titulo(s) {
  return String(s)
    .trim()
    .split(/\s+/)
    .map((w, i) => {
      const l = w.toLocaleLowerCase('es')
      return i > 0 && PARTICULAS.has(l) ? l : l.charAt(0).toLocaleUpperCase('es') + l.slice(1)
    })
    .join(' ')
}

const clave = (proto, ivrs) => `${proto}|${ivrs}`
const inscripciones = new Map()

for (const [protoExcel, ivrs, apellido, nombre, estado, nac] of resumen) {
  const protocolo = PROTOCOLOS[protoExcel]
  if (!protocolo) fallar(`Protocolo desconocido en el resumen: «${protoExcel}».`)
  if (!['Activo', 'Inactivo', 'Screen Fail'].includes(estado)) fallar(`${protoExcel} ${ivrs}: estado «${estado}» desconocido.`)
  const k = clave(protocolo, String(ivrs).trim())
  if (inscripciones.has(k)) fallar(`IVRS repetido en el resumen: ${k}.`)
  inscripciones.set(k, {
    protocolo,
    ivrs: String(ivrs).trim(),
    nombre_completo: `${titulo(nombre)} ${titulo(apellido)}`,
    // La persona es apellido + nombre + nacimiento: así se juntan ACT18301 y LTS17231, que tienen IVRS distintos.
    persona: `${String(apellido).trim().toUpperCase()}|${String(nombre).trim().toUpperCase()}|${nac}`,
    nacimiento: fecha(nac),
    estado,
    visitas: [],
    medicacion: [],
  })
}

for (const [protoExcel, ivrs, apellido, , , , visita, , , estimada, real, estadoVisita] of listado) {
  const protocolo = PROTOCOLOS[protoExcel]
  const crudo = String(ivrs).trim()
  const corregido = ERRATAS_IVRS[`${protocolo}|${crudo}|${String(apellido).trim().toUpperCase()}`]
  if (corregido) console.warn(`  errata: ${protocolo} ${apellido} ${visita} · IVRS ${crudo} → ${corregido}`)
  const k = clave(protocolo, corregido ?? crudo)
  const ins = inscripciones.get(k)
  if (!ins) fallar(`Visita de un paciente que no está en el resumen: ${k}.`)
  if (visita === '(sin fechas cargadas)') continue
  const m = /^V(\d+)\b/.exec(visita)
  if (!m) fallar(`${k}: no reconozco la visita «${visita}».`)
  const code = `V${m[1]}`
  if (ins.visitas.some((v) => v.code === code)) fallar(`${k}: la visita ${code} aparece dos veces.`)
  ins.visitas.push({ code, etiqueta: visita, estimada: fecha(estimada), real: fecha(real), estado: estadoVisita })
}

for (const [protoExcel, ivrs, , , , texto] of medicacion) {
  const k = clave(PROTOCOLOS[protoExcel], String(ivrs).trim())
  const ins = inscripciones.get(k)
  if (!ins) fallar(`Medicación de un paciente que no está en el resumen: ${k}.`)
  const items = String(texto)
    .split(/\s,\s/)
    .map((s) => s.trim())
    .filter((s) => s && s !== '-')
  for (const it of items) {
    const nombre = MEDICACION[it]
    if (!nombre) fallar(`${k}: medicación sin mapear al catálogo: «${it}». Sumala a MEDICACION.`)
    if (!ins.medicacion.includes(nombre)) ins.medicacion.push(nombre)
  }
}

// ---- Reglas ----------------------------------------------------------------------------------

const datos = []
for (const ins of inscripciones.values()) {
  const realizadaEot = ins.visitas.some((v) => v.real && /EOT/.test(v.etiqueta))
  const estado_inscripcion =
    ins.estado === 'Activo' ? 'activo' : ins.estado === 'Inactivo' && realizadaEot ? 'completado' : 'discontinuado'
  const activa = estado_inscripcion === 'activo'

  for (const v of ins.visitas) {
    if (v.real) {
      if (v.estado !== 'Realizada') fallar(`${ins.protocolo} ${ins.ivrs} ${v.code}: tiene fecha real y dice «${v.estado}».`)
      v.accion = 'realizada'
    } else if (ins.protocolo === 'CKJX839D12302' && v.estado === 'Vencida s/ registro') {
      // Antes que la regla de inactivos: la visita ya pasó, también para quien hoy está inactivo.
      if (!v.estimada) fallar(`${ins.protocolo} ${ins.ivrs} ${v.code}: vencida sin fecha estimada, no hay de dónde sacar la real.`)
      if (v.estimada >= HOY) fallar(`${ins.protocolo} ${ins.ivrs} ${v.code}: vencida con la estimada en el futuro (${v.estimada}).`)
      v.accion = 'realizada'
      v.real = v.estimada
      v.nota = NOTA_PROVISORIA
    } else if (!activa) {
      v.accion = 'no_crear'
    } else if (v.estado === 'Realizada') {
      fallar(`${ins.protocolo} ${ins.ivrs} ${v.code}: dice Realizada y no tiene fecha real.`)
    } else {
      v.accion = 'pendiente'
    }
  }

  const misma = MISMA_PERSONA[clave(ins.protocolo, ins.ivrs)]
  datos.push({
    protocolo: ins.protocolo,
    ivrs: ins.ivrs,
    persona: ins.persona,
    nombre_completo: ins.nombre_completo,
    nacimiento: ins.nacimiento,
    estado_paciente: ins.estado,
    estado_inscripcion,
    screen_fail: ins.estado === 'Screen Fail',
    codigo_existente: misma?.codigo ?? null,
    conservar_nombre: misma?.conservarNombre ?? false,
    // Una inscripción que no sigue no deja pendiente NINGUNA visita del cronograma, figure o no en el listado.
    // Sólo importa si llegó a aleatorizarse: sin aleatorización no se genera nada.
    borrar_no_listadas: !activa && ins.visitas.some((v) => v.code === RANDO[ins.protocolo] && v.real),
    visitas: ins.visitas.map(({ etiqueta, ...v }) => v),
    medicacion: ins.medicacion,
  })
}

// Controles de forma antes de escribir nada.
const personas = new Map()
for (const d of datos) {
  const p = personas.get(d.persona) ?? []
  if (p.some((x) => x.protocolo === d.protocolo)) fallar(`La misma persona dos veces en ${d.protocolo}: ${d.ivrs}.`)
  p.push(d)
  personas.set(d.persona, p)
}
for (const [, p] of personas) {
  if (new Set(p.map((d) => d.nombre_completo)).size > 1) fallar(`Una persona con dos nombres: ${p.map((d) => d.ivrs).join(', ')}.`)
}

// ---- Resumen para la consola y los comentarios -----------------------------------------------

const porProtocolo = {}
for (const d of datos) {
  const r = (porProtocolo[d.protocolo] ??= { pacientes: 0, activas: 0, realizadas: 0, provisorias: 0, pendientes: 0, noCrear: 0, conMedicacion: 0 })
  r.pacientes++
  if (d.estado_inscripcion === 'activo') r.activas++
  r.realizadas += d.visitas.filter((v) => v.accion === 'realizada' && !v.nota).length
  r.provisorias += d.visitas.filter((v) => v.nota).length
  r.pendientes += d.visitas.filter((v) => v.accion === 'pendiente').length
  r.noCrear += d.visitas.filter((v) => v.accion === 'no_crear').length
  if (d.medicacion.length) r.conMedicacion++
}
const resumenTexto = Object.entries(porProtocolo)
  .map(([p, r]) => `${p.padEnd(14)} ${String(r.pacientes).padStart(2)} pacientes (${r.activas} activos) · ${String(r.realizadas).padStart(3)} realizadas · ${String(r.provisorias).padStart(3)} con fecha provisoria · ${String(r.pendientes).padStart(3)} pendientes · ${String(r.noCrear).padStart(2)} de inactivos sin crear · ${r.conMedicacion} con medicación`)
  .join('\n')

// ---- Emisión ---------------------------------------------------------------------------------

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
const codigos = [...new Set(datos.map((d) => d.protocolo))]

function molde(aplicar) {
  const titulo = aplicar ? '2 · APLICAR' : '1 · SIMULAR (no guarda nada)'
  return `-- Spira · Pacientes de la prueba real — ${titulo}
-- ============================================================================
-- GENERADO por supabase/scripts/pacientes-prueba-real/generar.mjs desde el listado del sitio. No editar a
-- mano. ⚠️ TRAE DATOS PERSONALES: no se commitea ni se comparte (out/ está en .gitignore).
--
-- ORDEN EN PROD:
--   1. supabase/scripts/cronograma-prueba-real/2-aplicar.sql (la versión con ENDURA hasta la V28)
--   2. out/1-simular.sql → leer el informe (sale como «error» a propósito: es el deshacer)
--   3. out/2-aplicar.sql
--
-- ${aplicar
    ? 'APLICA. Un único bloque do: o entra entero o no entra nada. Idempotente: correrlo dos veces deja lo mismo.'
    : 'SIMULA. Hace la carga completa y la deshace al final con raise exception: el mensaje ES el informe.'}
--
-- LO QUE TRAE EL LISTADO:
${resumenTexto.replace(/^/gm, '--   ')}
--
-- NO TOCA: pacientes de estos protocolos que no están en el listado (se informan), visitas sueltas (VNP,
-- retest), comentarios, procedimientos tildados, pedidos de dispensación ni fechas reales que sólo tenga Spira.
-- ============================================================================

do $carga$
declare
  v_aplicar  boolean := ${aplicar};
  v_datos    jsonb := ${lit(JSON.stringify(datos))}::jsonb;
  v_hoy      date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_by       uuid;
  v_txt      text;
  v_n        int;
  v_x        record;
  v_e        record;
  v_v        record;
  v_row      record;
  v_def      record;
  v_pid      uuid;
  v_eid      uuid;
  v_proto_id uuid;
  v_rando    date;
  v_rando_cod text;
  v_est      date;
  v_ids      uuid[];
  v_listadas text[];
  v_informe  text;
begin
  -- 0 · Precondiciones. Todo lo que puede frenar la carga se revisa ANTES de escribir una fila.
  select string_agg(distinct x.protocolo, ', ') into v_txt
  from jsonb_to_recordset(v_datos) as x(protocolo text)
  where not exists (select 1 from public.protocols p where p.code = x.protocolo);
  if v_txt is not null then
    raise exception 'No encontré estos protocolos: %. No se cambió nada.', v_txt;
  end if;

  -- Cada visita del listado tiene que existir en el cronograma de su protocolo.
  select string_agg(distinct x.protocolo || ' ' || v.code, ', ') into v_txt
  from jsonb_to_recordset(v_datos) as x(protocolo text, visitas jsonb)
  cross join lateral jsonb_to_recordset(x.visitas) as v(code text)
  where not exists (select 1 from public.visit_definitions vd join public.protocols p on p.id = vd.protocol_id
                    where p.code = x.protocolo and upper(btrim(vd.code)) = v.code and vd.sort_order < 1000);
  if v_txt is not null then
    raise exception 'Estas visitas no están en el cronograma: %. ¿Corriste la versión nueva de cronograma-prueba-real/2-aplicar.sql? No se cambió nada.', v_txt;
  end if;

  create temp table _linea  (n serial, seccion int, texto text) on commit drop;
  create temp table _cuenta (protocolo text, cosa text) on commit drop;
  create temp table _persona (persona text primary key, patient_id uuid, nuevo boolean) on commit drop;

  -- El cronograma tiene que dar las fechas del listado: una visita automática PENDIENTE cae en aleatorización +
  -- offset. Si en un protocolo NO cuadra la mayoría, el cronograma de prod es el viejo (Victorion con Día − 1,
  -- ENDURA con semana × 7) y se frena. Si no cuadran unas pocas es el sitio, no el cronograma: en LTS17231 a
  -- quien todavía no tenía la V1 le estimó todo desde la V1 ESTIMADA, un día después de la real. Ahí manda la
  -- fecha del listado y queda en el informe.
  for v_x in
    select x.protocolo, count(*) as total,
           count(*) filter (where v.estimada <> r.real + vd.offset_days) as distintas,
           string_agg(distinct x.ivrs, ', ') filter (where v.estimada <> r.real + vd.offset_days) as ivrs
    from jsonb_to_recordset(v_datos) as x(protocolo text, ivrs text, visitas jsonb)
    cross join lateral jsonb_to_recordset(x.visitas) as v(code text, estimada date, accion text)
    join public.protocols p on p.code = x.protocolo
    join public.visit_definitions vd on vd.protocol_id = p.id and upper(btrim(vd.code)) = v.code and vd.date_mode = 'automatica'
    cross join lateral (
      select r2.real from jsonb_to_recordset(x.visitas) as r2(code text, real date)
      join public.visit_definitions vr on vr.protocol_id = p.id and upper(btrim(vr.code)) = r2.code and vr.role = 'randomizacion'
      where r2.real is not null
    ) r
    where v.accion = 'pendiente' and v.estimada is not null
    group by x.protocolo
  loop
    if v_x.distintas * 2 > v_x.total then
      raise exception '%: % de % fechas estimadas del listado no dan con el cronograma de prod. Corré la versión nueva de cronograma-prueba-real/2-aplicar.sql. No se cambió nada.', v_x.protocolo, v_x.distintas, v_x.total;
    elsif v_x.distintas > 0 then
      insert into _linea (seccion, texto) values (5, format('%s · %s visitas pendientes con la estimada del listado distinta de la del protocolo (IVRS %s): se usa la del listado', v_x.protocolo, v_x.distintas, v_x.ivrs));
    end if;
  end loop;

  select string_agg(distinct m.nombre, ', ') into v_txt
  from jsonb_to_recordset(v_datos) as x(medicacion jsonb)
  cross join lateral jsonb_array_elements_text(x.medicacion) as m(nombre)
  where not exists (select 1 from public.medications md where lower(btrim(md.name)) = lower(btrim(m.nombre)));
  if v_txt is not null then
    raise exception 'Estos medicamentos no están en el catálogo de Farmacia: %. No se cambió nada.', v_txt;
  end if;

  select string_agg(x.codigo_existente, ', ') into v_txt
  from jsonb_to_recordset(v_datos) as x(codigo_existente text)
  where x.codigo_existente is not null
    and not exists (select 1 from public.patients pa where pa.code = x.codigo_existente);
  if v_txt is not null then
    raise exception 'No encontré el paciente existente con IVRS %. No se cambió nada.', v_txt;
  end if;

  -- Autor de las filas nuevas: el editor corre como postgres, sin auth.uid(). Mismo criterio que las
  -- migraciones (0061, 0089). El audit_log igual registra db_role = postgres.
  select u.id into v_by
  from public.users u join public.user_module_roles r on r.user_id = u.id
  where r.module = 'gerencia' order by u.created_at limit 1;
  if v_by is null then select u.id into v_by from public.users u order by u.created_at limit 1; end if;
  if v_by is null then raise exception 'No hay usuarios a quién atribuir la carga.'; end if;

  -- El sello de IP (0119) se apaga para la carga y se vuelve a prender al final del bloque. Si algo falla en
  -- el medio, el rollback lo deja prendido igual: el alter table es parte de la misma transacción.
  alter table public.patient_visits disable trigger trg_seal_visit_lleva_ip;


  -- 1 · Personas ---------------------------------------------------------------------------------------------
  for v_x in
    select x.persona,
           array_agg(x.ivrs order by x.protocolo) as ivrs,
           array_agg(x.protocolo order by x.protocolo) as protocolos,
           min(x.codigo_existente) as codigo_existente,
           bool_or(x.conservar_nombre) as conservar_nombre,
           min(x.nombre_completo) as nombre_completo,
           min(x.nacimiento) as nacimiento,
           bool_or(x.estado_inscripcion = 'activo') as alguna_activa,
           (array_agg(x.ivrs order by (x.codigo_existente is null), x.protocolo))[1] as ivrs_principal
    from jsonb_to_recordset(v_datos) as x(persona text, ivrs text, protocolo text, codigo_existente text,
                                          conservar_nombre boolean, nombre_completo text, nacimiento date,
                                          estado_inscripcion text)
    group by x.persona
  loop
    -- Candidatos: el paciente que se nombró a mano, el que tiene la inscripción con ese IVRS en ese
    -- protocolo, y el que tiene alguno de esos IVRS como código. Tienen que coincidir.
    select array_agg(distinct c.id) into v_ids from (
      select pa.id from public.patients pa where pa.code = v_x.codigo_existente
      union
      select e.patient_id from unnest(v_x.ivrs, v_x.protocolos) as t(ivrs, protocolo)
      join public.protocols p on p.code = t.protocolo
      join public.enrollments e on e.protocol_id = p.id and e.ivrs_code = t.ivrs
      union
      select pa.id from public.patients pa where pa.code = any (v_x.ivrs)
    ) c;

    if coalesce(array_length(v_ids, 1), 0) > 1 then
      raise exception 'El listado junta en una persona a pacientes distintos de Spira (IVRS %). No se cambió nada.', array_to_string(v_x.ivrs, ', ');
    end if;

    if v_ids is null then
      insert into public.patients (code, full_name, birth_date, status, created_by)
      values (v_x.ivrs_principal, v_x.nombre_completo, v_x.nacimiento,
              case when v_x.alguna_activa then 'activo' else 'inactivo' end::patient_status, v_by)
      returning id into v_pid;
      insert into _persona values (v_x.persona, v_pid, true);
      insert into _cuenta select unnest(v_x.protocolos), 'pacientes nuevos';
    else
      v_pid := v_ids[1];
      insert into _persona values (v_x.persona, v_pid, false);
      select pa.* into v_row from public.patients pa where pa.id = v_pid;

      if not v_x.conservar_nombre and v_row.full_name is distinct from v_x.nombre_completo then
        insert into _linea (seccion, texto) values (2, format('%s · nombre «%s» → «%s»', v_row.code, v_row.full_name, v_x.nombre_completo));
        update public.patients set full_name = v_x.nombre_completo where id = v_pid;
      end if;
      -- Nunca se borra un nacimiento: el listado sólo lo completa o lo corrige.
      if v_x.nacimiento is not null and v_row.birth_date is distinct from v_x.nacimiento then
        if v_row.birth_date is not null then
          insert into _linea (seccion, texto) values (2, format('%s · nacimiento %s → %s', v_row.code, to_char(v_row.birth_date, 'DD/MM/YYYY'), to_char(v_x.nacimiento, 'DD/MM/YYYY')));
        end if;
        update public.patients set birth_date = v_x.nacimiento where id = v_pid;
        insert into _cuenta select unnest(v_x.protocolos), 'nacimientos completados o corregidos';
      end if;
      -- Activo si alguna inscripción del listado sigue. Si ninguna, inactivo, salvo que el paciente siga activo en
      -- un estudio que el listado no trae (patients.status es de la persona, no de la inscripción).
      if not v_x.alguna_activa and v_row.status = 'activo' and not exists (
           select 1 from public.enrollments e join public.protocols p on p.id = e.protocol_id
           where e.patient_id = v_pid and e.status = 'activo' and p.code <> all (v_x.protocolos)) then
        insert into _linea (seccion, texto) values (2, format('%s · paciente activo → inactivo', v_row.code));
        update public.patients set status = 'inactivo' where id = v_pid;
      elsif v_x.alguna_activa and v_row.status <> 'activo' then
        insert into _linea (seccion, texto) values (2, format('%s · paciente inactivo → activo', v_row.code));
        update public.patients set status = 'activo' where id = v_pid;
      end if;
    end if;
  end loop;


  -- 2 · Inscripción por inscripción ---------------------------------------------------------------------------
  for v_e in
    select x.* from jsonb_to_recordset(v_datos) as x(
      protocolo text, ivrs text, persona text, nombre_completo text, estado_inscripcion text, screen_fail boolean,
      borrar_no_listadas boolean, visitas jsonb, medicacion jsonb)
    order by x.protocolo, x.ivrs
  loop
    select p.id into v_proto_id from public.protocols p where p.code = v_e.protocolo;
    select ps.patient_id into v_pid from _persona ps where ps.persona = v_e.persona;
    select array_agg(v.code) into v_listadas from jsonb_to_recordset(v_e.visitas) as v(code text);

    -- 2a · La inscripción. Nace sin aleatorización: la fecha se fija en 2b, y ahí el trigger genera el tratamiento.
    if exists (select 1 from public.enrollments e where e.protocol_id = v_proto_id and e.ivrs_code = v_e.ivrs and e.patient_id <> v_pid) then
      raise exception '% %: ese IVRS ya es de otro paciente en el protocolo. No se cambió nada.', v_e.protocolo, v_e.ivrs;
    end if;

    select e.* into v_row from public.enrollments e where e.patient_id = v_pid and e.protocol_id = v_proto_id;
    if v_row.id is null then
      insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date, status, ivrs_code, notes)
      select v_pid, v_proto_id, v_by,
             coalesce((select min(coalesce(v.real, v.estimada)) from jsonb_to_recordset(v_e.visitas) as v(real date, estimada date)), v_hoy),
             v_e.estado_inscripcion::enrollment_status, v_e.ivrs,
             case when v_e.screen_fail then '[fallo] Screen fail' end
      returning id into v_eid;
      insert into _cuenta values (v_e.protocolo, 'inscripciones nuevas');
    else
      v_eid := v_row.id;
      if v_row.status::text is distinct from v_e.estado_inscripcion then
        insert into _linea (seccion, texto) values (3, format('%s %s · inscripción %s → %s', v_e.protocolo, v_e.ivrs, v_row.status, v_e.estado_inscripcion));
        update public.enrollments set status = v_e.estado_inscripcion::enrollment_status where id = v_eid;
      end if;
      if v_row.ivrs_code is distinct from v_e.ivrs then
        update public.enrollments set ivrs_code = v_e.ivrs where id = v_eid;
      end if;
      if v_e.screen_fail and position('[fallo] Screen fail' in coalesce(v_row.notes, '')) = 0 then
        update public.enrollments set notes = concat_ws(E'\\n', nullif(v_row.notes, ''), '[fallo] Screen fail') where id = v_eid;
      end if;
    end if;

    -- 2b · Aleatorización = fecha real de la visita de randomización del listado.
    select vd.code into v_rando_cod from public.visit_definitions vd
    where vd.protocol_id = v_proto_id and vd.role = 'randomizacion' and vd.sort_order < 1000;
    select v.real into v_rando from jsonb_to_recordset(v_e.visitas) as v(code text, real date) where v.code = upper(btrim(v_rando_cod));
    select e.randomization_date into v_est from public.enrollments e where e.id = v_eid;

    if v_rando is not null then
      if v_est is distinct from v_rando then
        if v_est is not null then
          insert into _linea (seccion, texto) values (3, format('%s %s · aleatorización %s → %s', v_e.protocolo, v_e.ivrs, to_char(v_est, 'DD/MM/YYYY'), to_char(v_rando, 'DD/MM/YYYY')));
        end if;
        update public.enrollments set randomization_date = v_rando where id = v_eid;   -- dispara la generación
      end if;
      -- Crear lo que falte aunque la fecha no haya cambiado (p. ej. las V17-V28 nuevas de ENDURA), con la regla del
      -- trigger: automáticas y sin fila. A una inscripción que no sigue no se le crea nada: lo que generó el trigger
      -- se limpia en 2c, y crearlo acá para borrarlo después dejaría dos filas en audit_log en cada corrida.
      if v_e.estado_inscripcion = 'activo' then
        insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end)
        select v_eid, vd.id, 'programada', v_rando + vd.offset_days,
               v_rando + vd.offset_days - vd.window_minus, v_rando + vd.offset_days + vd.window_plus
        from public.visit_definitions vd
        where vd.protocol_id = v_proto_id and vd.date_mode = 'automatica' and vd.sort_order < 1000
          and not exists (select 1 from public.patient_visits pv where pv.enrollment_id = v_eid and pv.kind = 'programada' and pv.visit_def_id = vd.id);
      end if;
    elsif v_est is not null then
      -- Spira la tenía aleatorizada con una fecha estimada y el listado dice que la visita todavía no ocurrió
      -- (LTS17231: los que aún no pasaron de ACT). Sin fecha, confirmar la randomización al cerrar la visita la
      -- fija y genera el tratamiento; con fecha, la app responde «ya está randomizado».
      insert into _linea (seccion, texto) values (3, format('%s %s · se quita la aleatorización del %s: la %s todavía no se hizo', v_e.protocolo, v_e.ivrs, to_char(v_est, 'DD/MM/YYYY'), v_rando_cod));
      update public.enrollments set randomization_date = null where id = v_eid;
      for v_row in
        select pv.id, vd.code,
               (pv.arrived_at is null and pv.attended_at is null and pv.ready_at is null and pv.no_show_at is null
                and nullif(btrim(coalesce(pv.notes, '')), '') is null
                and not exists (select 1 from public.visit_comments t where t.visit_id = pv.id)
                and not exists (select 1 from public.visit_procedure_completions t where t.visit_id = pv.id)
                and not exists (select 1 from public.visit_procedure_reports_ready t where t.visit_id = pv.id)
                and not exists (select 1 from public.report_status t where t.visit_id = pv.id)
                and not exists (select 1 from public.dispensation_requests t where t.visit_id = pv.id)
                and not exists (select 1 from public.visit_ip_closures t where t.visit_id = pv.id)
                and not exists (select 1 from public.ip_units t where t.dispensed_visit_id = pv.id)
                and not exists (select 1 from public.tasks t where t.visit_id = pv.id)
                and not exists (select 1 from public.alert_dismissals t where t.visit_id = pv.id)
                and not exists (select 1 from public.patient_timeline t where t.visit_id = pv.id)
                and not exists (select 1 from public.track_dispensations t where t.patient_visit_id = pv.id)) as libre
        from public.patient_visits pv
        join public.visit_definitions vd on vd.id = pv.visit_def_id and vd.date_mode = 'automatica'
        where pv.enrollment_id = v_eid and pv.kind = 'programada' and pv.real_date is null
      loop
        if v_row.libre then
          delete from public.patient_visits where id = v_row.id;
          insert into _cuenta values (v_e.protocolo, 'visitas de tratamiento borradas (se generan al randomizar)');
        else
          insert into _linea (seccion, texto) values (5, format('%s %s · %s pendiente NO se borró: tiene registros en Spira', v_e.protocolo, v_e.ivrs, v_row.code));
        end if;
      end loop;
    end if;

    -- 2c · Una inscripción que no sigue no deja visitas pendientes: las del listado sin fecha y, si llegó a
    --      aleatorizarse, toda automática del cronograma que no figure. Se borra sólo la fila sin NADA colgado (ni
    --      llegada, ausencia, comentarios, tildes, reportes, pedidos, IP, tareas ni alertas archivadas); la que
    --      tiene algo se queda y se informa. Si tenía una nota, pasa a las notas de la inscripción.
    if v_e.estado_inscripcion <> 'activo' then
      for v_row in
        select pv.id, vd.code, pv.notes,
               (pv.arrived_at is null and pv.attended_at is null and pv.ready_at is null and pv.no_show_at is null
                and not exists (select 1 from public.visit_comments t where t.visit_id = pv.id)
                and not exists (select 1 from public.visit_procedure_completions t where t.visit_id = pv.id)
                and not exists (select 1 from public.visit_procedure_reports_ready t where t.visit_id = pv.id)
                and not exists (select 1 from public.report_status t where t.visit_id = pv.id)
                and not exists (select 1 from public.dispensation_requests t where t.visit_id = pv.id)
                and not exists (select 1 from public.visit_ip_closures t where t.visit_id = pv.id)
                and not exists (select 1 from public.ip_units t where t.dispensed_visit_id = pv.id)
                and not exists (select 1 from public.tasks t where t.visit_id = pv.id)
                and not exists (select 1 from public.alert_dismissals t where t.visit_id = pv.id)
                and not exists (select 1 from public.patient_timeline t where t.visit_id = pv.id)
                and not exists (select 1 from public.track_dispensations t where t.patient_visit_id = pv.id)) as libre
        from public.patient_visits pv
        join public.visit_definitions vd on vd.id = pv.visit_def_id
        left join jsonb_to_recordset(v_e.visitas) as v(code text, accion text) on v.code = upper(btrim(vd.code))
        where pv.enrollment_id = v_eid and pv.kind = 'programada' and pv.real_date is null
          and (v.accion = 'no_crear' or (v_e.borrar_no_listadas and vd.date_mode = 'automatica' and v.code is null))
      loop
        if v_row.libre then
          if nullif(btrim(coalesce(v_row.notes, '')), '') is not null then
            update public.enrollments e
               set notes = concat_ws(E'\\n', nullif(e.notes, ''), format('[%s, visita borrada en la carga del 2026-09-14] %s', v_row.code, btrim(v_row.notes)))
             where e.id = v_eid;
          end if;
          delete from public.patient_visits where id = v_row.id;
          insert into _cuenta values (v_e.protocolo, 'visitas pendientes de inscripciones inactivas borradas');
        else
          insert into _linea (seccion, texto) values (5, format('%s %s · %s pendiente de una inscripción inactiva NO se borró: tiene registros en Spira (queda con alerta)', v_e.protocolo, v_e.ivrs, v_row.code));
        end if;
      end loop;
    end if;

    -- 2d · Las visitas del listado.
    for v_v in
      select v.* from jsonb_to_recordset(v_e.visitas) as v(code text, estimada date, real date, estado text, accion text, nota text)
      where v.accion in ('realizada', 'pendiente')
    loop
      select vd.* into v_def from public.visit_definitions vd
      where vd.protocol_id = v_proto_id and upper(btrim(vd.code)) = v_v.code and vd.sort_order < 1000;

      -- Si hubiera dos filas de la misma visita, se trabaja sobre la que ya coincide con el listado o, si no,
      -- sobre la que tiene fecha; la otra se informa.
      select pv.* into v_row from public.patient_visits pv
      where pv.enrollment_id = v_eid and pv.visit_def_id = v_def.id and pv.kind = 'programada'
      order by (pv.real_date = v_v.real) desc nulls last, (pv.real_date is not null) desc, pv.created_at
      limit 1;
      select count(*) into v_n from public.patient_visits pv
      where pv.enrollment_id = v_eid and pv.visit_def_id = v_def.id and pv.kind = 'programada';
      if v_n > 1 then
        insert into _linea (seccion, texto) values (5, format('%s %s · %s está %s veces en Spira: se usó una y el resto queda como está', v_e.protocolo, v_e.ivrs, v_v.code, v_n));
      end if;

      select e.randomization_date into v_rando from public.enrollments e where e.id = v_eid;
      if v_def.date_mode = 'automatica' and v_rando is null then
        -- Sin aleatorización no hay tratamiento: estas visitas nacen cuando se confirma la randomización.
        if v_v.accion = 'realizada' then
          raise exception '% %: % tiene fecha real pero no hay aleatorización. No se cambió nada.', v_e.protocolo, v_e.ivrs, v_v.code;
        end if;
        continue;
      end if;
      -- Estimada: la del listado; si no trae, la del protocolo; para una libre sin estimada, la real.
      v_est := coalesce(v_v.estimada,
                        case when v_def.date_mode = 'automatica' then v_rando + v_def.offset_days end,
                        v_v.real);

      if v_v.accion = 'realizada' and v_v.nota is not null and v_row.real_date is not null then
        -- Una fecha provisoria nunca pisa una registrada: si Spira ya tiene la visita hecha, gana Spira.
        insert into _linea (seccion, texto) values (4, format('%s %s · %s: el listado no tiene registro y Spira la tiene realizada el %s (se conserva, sin fecha provisoria)', v_e.protocolo, v_e.ivrs, v_v.code, to_char(v_row.real_date, 'DD/MM/YYYY')));
        continue;
      end if;

      if v_v.accion = 'realizada' then
        if v_row.id is null then
          insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end,
                                             real_date, arrived_at, ready_at, notes)
          values (v_eid, v_def.id, 'programada', v_est,
                  case when v_def.date_mode = 'automatica' then v_rando + v_def.offset_days - v_def.window_minus end,
                  case when v_def.date_mode = 'automatica' then v_rando + v_def.offset_days + v_def.window_plus end,
                  v_v.real,
                  (v_v.real + time '09:00') at time zone 'America/Argentina/Buenos_Aires',
                  (v_v.real + time '10:00') at time zone 'America/Argentina/Buenos_Aires',
                  v_v.nota);
          insert into _cuenta values (v_e.protocolo, case when v_v.nota is null then 'visitas realizadas cargadas'
                                                          else 'visitas con fecha real provisoria (= estimada, con nota)' end);
        else
          if v_row.real_date is distinct from v_v.real then
            if v_row.real_date is not null then
              insert into _linea (seccion, texto) values (4, format('%s %s · %s fecha real %s → %s%s', v_e.protocolo, v_e.ivrs, v_v.code,
                to_char(v_row.real_date, 'DD/MM/YYYY'), to_char(v_v.real, 'DD/MM/YYYY'),
                case when v_row.attended_at is not null then ' (en Spira se atendió el ' || to_char(v_row.attended_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM') || ')' else '' end));
            else
              insert into _cuenta values (v_e.protocolo, case when v_v.nota is null then 'visitas realizadas cargadas'
                                                              else 'visitas con fecha real provisoria (= estimada, con nota)' end);
            end if;
          end if;
          update public.patient_visits pv
             set real_date      = v_v.real,
                 estimated_date = v_est,
                 arrived_at     = coalesce(pv.arrived_at, (v_v.real + time '09:00') at time zone 'America/Argentina/Buenos_Aires'),
                 ready_at       = coalesce(pv.ready_at,   (v_v.real + time '10:00') at time zone 'America/Argentina/Buenos_Aires'),
                 notes          = case when v_v.nota is null or position(v_v.nota in coalesce(pv.notes, '')) > 0 then pv.notes
                                       else concat_ws(E'\\n', nullif(pv.notes, ''), v_v.nota) end
           where pv.id = v_row.id
             and (pv.real_date is distinct from v_v.real or pv.estimated_date is distinct from v_est
                  or pv.arrived_at is null or pv.ready_at is null
                  or (v_v.nota is not null and position(v_v.nota in coalesce(pv.notes, '')) = 0));
        end if;

      else  -- pendiente
        if v_row.id is null then
          if v_est is null then
            insert into _linea (seccion, texto) values (5, format('%s %s · %s pendiente sin fecha estimada: no se agendó', v_e.protocolo, v_e.ivrs, v_v.code));
            continue;
          end if;
          insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end)
          values (v_eid, v_def.id, 'programada', v_est,
                  case when v_def.date_mode = 'automatica' then v_rando + v_def.offset_days - v_def.window_minus end,
                  case when v_def.date_mode = 'automatica' then v_rando + v_def.offset_days + v_def.window_plus end);
          insert into _cuenta values (v_e.protocolo, 'visitas pendientes agendadas');
        elsif v_row.real_date is not null then
          -- Nunca se borra una fecha real: Spira sabe algo que el listado todavía no.
          insert into _linea (seccion, texto) values (4, format('%s %s · %s: Spira la tiene realizada el %s y el listado no (se conserva)', v_e.protocolo, v_e.ivrs, v_v.code, to_char(v_row.real_date, 'DD/MM/YYYY')));
        else
          -- Una libre pendiente va SIN ventana, como la agenda schedule_protocol_visit (0030). Importa en la V1 de
          -- LTS17231: nació automática con la ventana de una aleatorización estimada que ya no existe, y esa
          -- ventana vieja la mostraría vencida.
          update public.patient_visits pv
             set estimated_date = v_est,
                 window_start   = case when v_def.date_mode = 'automatica' then v_rando + v_def.offset_days - v_def.window_minus end,
                 window_end     = case when v_def.date_mode = 'automatica' then v_rando + v_def.offset_days + v_def.window_plus  end
           where pv.id = v_row.id
             and (pv.estimated_date is distinct from v_est
                  or pv.window_start is distinct from case when v_def.date_mode = 'automatica' then v_rando + v_def.offset_days - v_def.window_minus end
                  or pv.window_end   is distinct from case when v_def.date_mode = 'automatica' then v_rando + v_def.offset_days + v_def.window_plus end);
          get diagnostics v_n = row_count;
          if v_n > 0 then insert into _cuenta values (v_e.protocolo, 'visitas pendientes reprogramadas'); end if;
        end if;
      end if;
    end loop;

    -- 2e · Pendientes automáticas que el listado no nombra (la V18 de ACT, las V21-V26 de LTS): a la fecha del
    --      protocolo. Recoge también el cambio de offsets del cronograma nuevo.
    select e.randomization_date into v_rando from public.enrollments e where e.id = v_eid;
    if v_rando is not null then
      update public.patient_visits pv
         set estimated_date = v_rando + vd.offset_days,
             window_start   = v_rando + vd.offset_days - vd.window_minus,
             window_end     = v_rando + vd.offset_days + vd.window_plus
        from public.visit_definitions vd
       where pv.visit_def_id = vd.id and vd.date_mode = 'automatica'
         and pv.enrollment_id = v_eid and pv.kind = 'programada' and pv.real_date is null
         and upper(btrim(vd.code)) <> all (coalesce(v_listadas, '{}'))
         and (pv.estimated_date is distinct from v_rando + vd.offset_days
              or pv.window_start is distinct from v_rando + vd.offset_days - vd.window_minus
              or pv.window_end   is distinct from v_rando + vd.offset_days + vd.window_plus);
    end if;

    -- 2f · Medicación de base: la del listado activa, el resto desactivada (nunca borrada). Lo habilitado con
    --      receta para una entrega («Otro», habilitacion_id) no se toca.
    select coalesce(array_agg(md.id), '{}') into v_ids
    from jsonb_array_elements_text(v_e.medicacion) as m(nombre)
    join public.medications md on lower(btrim(md.name)) = lower(btrim(m.nombre));

    insert into public.protocol_medications (protocol_id, medication_id)
    select v_proto_id, t.mid from unnest(v_ids) as t(mid)
    on conflict (protocol_id, medication_id) do nothing;
    get diagnostics v_n = row_count;
    if v_n > 0 then insert into _cuenta select v_e.protocolo, 'medicamentos sumados al estudio' from generate_series(1, v_n); end if;

    insert into public.patient_medications as pm (enrollment_id, medication_id, assigned_by, active)
    select v_eid, t.mid, v_by, true from unnest(v_ids) as t(mid)
    on conflict (enrollment_id, medication_id) do update
      set active = true
      where pm.active is distinct from true;
    get diagnostics v_n = row_count;
    if v_n > 0 then insert into _cuenta select v_e.protocolo, 'medicaciones asignadas' from generate_series(1, v_n); end if;

    for v_row in
      update public.patient_medications pm set active = false
        from public.medications md
       where md.id = pm.medication_id and pm.enrollment_id = v_eid and pm.active and pm.habilitacion_id is null
         and pm.medication_id <> all (v_ids)
      returning md.name
    loop
      insert into _linea (seccion, texto) values (6, format('%s %s · se desactiva %s (no está en el listado)', v_e.protocolo, v_e.ivrs, v_row.name));
    end loop;
  end loop;

  alter table public.patient_visits enable trigger trg_seal_visit_lleva_ip;


  -- 3 · Lo que está en Spira y no en el listado (no se toca) -----------------------------------------------
  insert into _linea (seccion, texto)
  select 7, format('%s · %s «%s» (inscripción %s)', p.code, coalesce(pa.code, 'sin IVRS'), pa.full_name, e.status)
  from public.enrollments e
  join public.protocols p on p.id = e.protocol_id
  join public.patients pa on pa.id = e.patient_id
  where p.code in (${codigos.map(lit).join(', ')})
    and not exists (select 1 from _persona ps
                    join jsonb_to_recordset(v_datos) as x(persona text, protocolo text) on x.persona = ps.persona
                    where ps.patient_id = e.patient_id and x.protocolo = p.code);


  -- 4 · Informe ------------------------------------------------------------------------------------------------
  select concat_ws(E'\\n',
    case when v_aplicar then 'CARGA APLICADA.' else 'SIMULACIÓN — NO SE GUARDÓ NADA. Si el informe está bien, corré out/2-aplicar.sql.' end,
    '',
    '== Totales ==',
    coalesce((select string_agg(t.linea, E'\\n' order by t.protocolo) from (
       select c.protocolo, c.protocolo || ': ' || string_agg(c.cosa || ' ' || c.n, ' · ' order by c.cosa) as linea
       from (select protocolo, cosa, count(*) as n from _cuenta group by 1, 2) c group by c.protocolo) t), '(nada)'),
    '',
    '== Cambios en pacientes que ya estaban ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 2), '(ninguno)'),
    '',
    '== Cambios en inscripciones que ya estaban ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 3), '(ninguno)'),
    '',
    '== Fechas reales distintas entre Spira y el listado ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 4), '(ninguna)'),
    '',
    '== Para mirar ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 5), '(nada)'),
    '',
    '== Medicación que se desactiva ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 6), '(ninguna)'),
    '',
    '== En Spira y no en el listado (no se tocan) ==',
    coalesce((select string_agg(texto, E'\\n' order by n) from _linea where seccion = 7), '(ninguno)')
  ) into v_informe;

  if not v_aplicar then
    raise exception '%', v_informe;
  end if;
end
$carga$;
${aplicar ? `
-- Control. «vencidas» son las pendientes con la ventana cerrada: las alertas que la carga deja.
select p.code as protocolo,
       count(distinct e.id) filter (where e.status = 'activo')                                   as inscripciones_activas,
       count(distinct e.id)                                                                      as inscripciones,
       count(pv.id) filter (where pv.kind = 'programada' and pv.real_date is not null)           as visitas_realizadas,
       count(pv.id) filter (where pv.kind = 'programada' and pv.real_date is not null and pv.ready_at is null) as realizadas_sin_cerrar,
       count(pv.id) filter (where pv.kind = 'programada' and pv.real_date is null)               as visitas_pendientes,
       count(pv.id) filter (where pv.kind = 'programada' and pv.real_date is null and pv.window_end < (now() at time zone 'America/Argentina/Buenos_Aires')::date) as vencidas,
       count(pv.id) filter (where pv.kind = 'programada' and position(${lit(NOTA_PROVISORIA)} in coalesce(pv.notes, '')) > 0) as con_fecha_provisoria,
       (select count(*) from public.patient_medications pm join public.enrollments e3 on e3.id = pm.enrollment_id
         where e3.protocol_id = p.id and pm.active and pm.habilitacion_id is null)             as medicaciones_activas
from public.protocols p
left join public.enrollments e on e.protocol_id = p.id
left join public.patient_visits pv on pv.enrollment_id = e.id
where p.code in (${codigos.map(lit).join(', ')})
group by p.id, p.code
order by p.code;
` : ''}`
}

mkdirSync(resolve(aqui, 'out'), { recursive: true })
for (const [nombre, sql] of [['1-simular.sql', molde(false)], ['2-aplicar.sql', molde(true)]]) {
  const marcadores = sql.match(/\$[A-Za-z_]*\$/g) ?? []
  if (marcadores.length % 2 !== 0) fallar(`${nombre}: ${marcadores.length} marcadores de dollar-quote (tiene que ser par).`)
  writeFileSync(resolve(aqui, 'out', nombre), sql)
}

console.log('✓ out/1-simular.sql y out/2-aplicar.sql generados.\n')
console.log(resumenTexto)
