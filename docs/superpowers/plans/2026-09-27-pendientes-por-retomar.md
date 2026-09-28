# Pendientes por retomar y retest atado a una visita — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que al finalizar una visita lo que no se hizo quede marcado «para otro día» (sin fecha), que se retome desde «Agendar visita» —en la ficha o en Visitas—, que aparezca en Pendientes mientras espera, y que el retest cuelgue siempre de la visita que repite.

**Architecture:** una tabla nueva `visit_pending_procedures` guarda las marcas; `v_visit_procedures` (la lista efectiva de la 0144) las resta, así la visita cierra sola y todo lo que ya lee de ahí lo hereda. Tres RPC nuevas (marcar, desmarcar, retomar) reusan el mecanismo de continuación de la 0144. Una columna `patient_visits.retest_of_visit_id` ata el retest a su origen, validado en `register_visit_event`. En el front: un aviso al finalizar, un flujo de «Agendar visita» con opciones nuevas en la ficha y en Visitas, y una cuarta lista en Pendientes.

**Tech Stack:** Postgres/Supabase (SQL a mano en el editor), React 18 + TypeScript strict, Vite, vitest. PGlite (Postgres en WASM) como banco descartable fuera del repo.

**Spec:** `docs/superpowers/specs/2026-09-27-pendientes-por-retomar-design.md`. Leelo antes de empezar. El antecedente directo es la 0144 (`supabase/migrations/0144_visitas_con_procedimientos_propios.sql`): este plan la extiende y copia de ahí varias funciones enteras.

## Global Constraints

- **Dos PRs, en este orden.** **PR A** = sólo la migración + su fila en el índice (Tareas 1-5). El Director la aplica en prod. **PR B** = el front (Tareas 6-15), que se mergea **después** de que la migración esté aplicada. La migración es **aditiva, va primero**: el front viejo no escribe marcas ni manda origen de retest, y `register_visit_event` conserva sus cinco parámetros con el sexto por defecto. El front nuevo **no** anda sin ella.
- **Numeración: no fijes el número en ningún documento.** Se toma el siguiente libre en `origin/main` al pushear (al escribir este plan, la última aplicada es la `0144`). En este plan, `NNNN` es ese número; la Tarea 1 lo resuelve y lo deja en `$MIG`. `NNNN` / `vNNNN` en SQL y en comentarios del front se reemplaza por el número real: `git grep -n "NNNN" -- supabase src` tiene que salir vacío antes de cada PR.
- **Migraciones inmutables.** Una vez que el Director la aplica, no se edita: toda corrección es un archivo nuevo.
- **Nunca dos signos peso pegados dentro de un comentario SQL** (el editor de Supabase invierte la paridad del dollar-quoting). Cuerpos de función con `$fn$`, bloques `do` con `$mig$`. La Tarea 5 cuenta los marcadores.
- **Toda vista que se recrea lleva `with (security_invoker = true)`**; si `create or replace view` falla por columnas, **no se fuerza con `cascade`**: se corta y se revisa.
- **Adentro de una función con `search_path` acotado, calificá todo con `public.`** y usá `gen_random_uuid()` (no `uuid_generate_v4()`).
- **Una firma que cambia se dropea explícitamente** antes del `create or replace` (si no, queda una sobrecarga viva).
- **Worktree propio, rama propia**, `git add` por ruta, nunca `-A`. El hook `branch-guard` mira la carpeta del proyecto salvo que el comando empiece con `cd`: commiteá con `cd "<ruta-del-worktree>" && git commit ...`.
- **Copy de UI** en castellano rioplatense; en la UI se dice **Coordinación** y **Farmacia**, nunca «Track»/«Pharma». Avisos de una frase, sin tecnicismos.
- **Realce = elevación** (levante ~1px + `--spira-shadow-sm/md`), nunca borde de color. Bordes inline en longhands. Nombre del paciente en tinta como identidad primaria + IVRS en mono como secundario.
- **Datos reales en prod.** El QA se hace sólo sobre el protocolo **TEST-QA** / paciente **TEST-001**, y se borra exactamente lo que se crea.
- **Gate de verificación:** `npm run build` en verde (tsc + vitest + vite build) y QA en el preview (puerto **5250**, `spira-dev` de `.claude/launch.json`; desde un worktree, verificá que el preview sirva TU código). `vitest` también corre los tests de otros worktrees: lo que importa es 0 fallas.

## Mapa de archivos

**PR A — base**
- Crear: `supabase/migrations/NNNN_pendientes_por_retomar.sql` — tabla de marcas, lista efectiva que las resta, «hecho», 3 RPC nuevas, `set_added_procedures` y `register_visit_event` recreadas, columna del retest, 2 guardas extendidas, `v_track_visits` con 4 columnas al final, sondas.
- Modificar: `supabase/README.md` — fila del índice (CI la exige).
- Banco descartable, **no se commitea**: `$BANCO/esquema.sql`, `$BANCO/verificar.mjs`.

**PR B — front**
- Crear: `docs/mock-pendientes-por-retomar.html` (Tarea 6, gate del Director).
- Modificar: `src/lib/visits.ts`, `src/lib/visitTitle.test.ts`, `src/data/visits.ts` (título «Retest de V1»).
- Modificar: `src/data/procedures.ts` (`tiene_reporte` y lectura suelta), `src/data/visitEvents.ts` (origen del retest).
- Crear: `src/data/pendientes.ts` (lecturas, RPC, mensajes).
- Crear: `src/views/track/retomar.ts` + `retomar.test.ts` (reglas puras).
- Crear: `src/views/track/CasillasDeProcedimientos.tsx`, `AvisoPendientesModal.tsx`, `useAvisoAlFinalizar.tsx`.
- Modificar: `src/views/DayVisitsView.tsx`, `src/views/track/VisitDetail.tsx` (el aviso al finalizar; «Agregar visita»).
- Modificar: `src/views/track/PasarPendientesModal.tsx` (→ «Dejar para otro día», sin fecha), `DesdoblamientoVisita.tsx`, `VisitProcedures.tsx`.
- Crear: `src/views/track/agendar/FormContinuarPendientes.tsx`, `FormRetest.tsx`, `FormTraerVisita.tsx`, `FormVnp.tsx`, `AgregarVisitaModal.tsx`, `AgendarDesdePendientes.tsx`.
- Modificar: `src/views/track/RegisterVisitFlow.tsx`, `src/views/PatientFichaView.tsx`.
- Modificar: `src/views/TrackAlertsView.tsx`, `src/views/pendientesPorProtocolo.ts` + `.test.ts`, `src/views/PendientesProtocoloCards.tsx`.

---

# PR A — La base

### Tarea 1: Rama, número y banco de pruebas PGlite

**Files:**
- Create: `$BANCO/esquema.sql`, `$BANCO/verificar.mjs` (fuera del repo)
- Create: `$MIG` (sólo la cabecera)

**Interfaces:**
- Produces: `$REPO` (raíz del worktree), `$BANCO`, `$MIG`, `N`. `verificar.mjs` se corre como `node verificar.mjs "$REPO" "$MIG"`: carga el esquema de juguete, las vistas vivas, **la 0144 entera** y después `$MIG`, y sale con código 1 si falla algún chequeo. Las Tareas 2-4 le agregan bloques al final. Expone los helpers `ok`, `falla`, `uno`, `lista`, `como`, `estado` y los ids `U`, `P`, `PAC`, `E`, `E2`, `D3`, `V3`, `PR`, `PP`.

- [ ] **Paso 1: Worktree y rama desde `origin/main`**

Desde la carpeta del proyecto:
```bash
git fetch origin && git worktree add -b feat/pendientes-por-retomar-base .claude/worktrees/retomar-base origin/main
```
Expected: `Preparing worktree (new branch 'feat/pendientes-por-retomar-base')`. Trabajá desde ahí de acá en adelante.

- [ ] **Paso 2: Resolver el número**

```bash
export REPO="$(git rev-parse --show-toplevel)" && git fetch origin && git ls-tree --name-only origin/main supabase/migrations/ | tail -1
```
Expected: la última migración de `origin/main` (al escribir este plan, `0144_visitas_con_procedimientos_propios.sql`). El número es el siguiente. Buscá que nadie lo tenga reservado, con el número pelado y en todo `docs/`, y en todas las ramas remotas:
```bash
N=0145; git grep -n "$N" origin/main -- docs supabase TODOS.md; for b in $(git branch -r | grep -v HEAD); do git ls-tree --name-only "$b" supabase/migrations/ | grep "^supabase/migrations/$N" && echo "  ↑ en $b"; done
```
(reemplazá `0145` por el que corresponda). Expected: sin resultados. Si aparece una reserva, **pará y preguntale al Director**.
```bash
export MIG="$REPO/supabase/migrations/${N}_pendientes_por_retomar.sql" && echo "MIG=$MIG"
```

- [ ] **Paso 3: Montar el banco**

PGlite no es dependencia del repo y no se agrega.
```bash
export BANCO="$(dirname "$(mktemp -u)")/pglite-retomar" && mkdir -p "$BANCO" && cd "$BANCO" && npm init -y >/dev/null && npm i @electric-sql/pglite --no-save && echo "BANCO=$BANCO"
```
Expected: instala sin errores. Si la shell se reinicia, volvé a exportar `$REPO`, `$BANCO`, `$MIG` y `N`.

- [ ] **Paso 4: El esquema de juguete**

Es el mismo del plan de la 0144. Extraelo tal cual del archivo del repo (es el primer bloque ```sql de su Tarea 1, Paso 4) y dejalo en `$BANCO/esquema.sql`:
```bash
cd "$BANCO" && node -e "
const fs=require('fs');
const t=fs.readFileSync(process.argv[1],'utf8').replace(/\r\n/g,'\n');
const i=t.indexOf('- [ ] **Paso 4: Escribir el esquema de juguete**');
const a=t.indexOf('\`\`\`sql\n',i)+7, b=t.indexOf('\n\`\`\`',a);
fs.writeFileSync('esquema.sql', t.slice(a,b)+'\n');
" "$REPO/docs/superpowers/plans/2026-09-23-visitas-retest-y-continuacion.md" && head -3 esquema.sql && tail -3 esquema.sql
```
Expected: arranca con `-- Roles de Supabase que PGlite no trae…` y termina con `grant delete on public.patient_visits to authenticated;`.

Agregale al final lo que esta migración necesita y la 0144 no pedía:
```sql

-- Para este plan: la app borra visitas y tilda como `authenticated`; los tests de la guarda de
-- borrado y del tilde corren con ese rol.
grant insert on public.patient_visits to authenticated;
```

- [ ] **Paso 5: El arnés `verificar.mjs`**

Crear `$BANCO/verificar.mjs`:

```js
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// node verificar.mjs "$REPO" "$MIG"
const [repo, mig] = process.argv.slice(2)
if (!repo || !mig) { console.error('Uso: node verificar.mjs "$REPO" "$MIG"'); process.exit(2) }

// CRLF → LF: el checkout de Windows es CRLF y las regex de abajo esperan \n.
const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n')
const migracion = (nombre) => leer(resolve(repo, 'supabase/migrations', nombre))
/** Un `create or replace view public.X ...;` sacado tal cual de una migración vieja. */
const vista = (texto, nombre) => {
  const m = texto.match(new RegExp(`create or replace view public\\.${nombre} [\\s\\S]*?;\\n`))
  if (!m) throw new Error(`No encontré la vista ${nombre}`)
  return m[0]
}

const db = new PGlite()
await db.exec(leer('esquema.sql'))
const m0126 = migracion('0126_ivrs_por_inscripcion.sql')
await db.exec(migracion('0137_cierre_sin_procedimientos_sin_reporte.sql')) // v_patient_visits viva
await db.exec(vista(m0126, 'v_track_visits'))
await db.exec(vista(m0126, 'v_procedure_report_alerts'))
await db.exec(vista(m0126, 'v_protocol_report_status'))
await db.exec(migracion('0144_visitas_con_procedimientos_propios.sql')) // lo que ya está en prod
await db.exec(leer(mig))

let fallas = 0
const ok = (nombre, cond, detalle = '') => {
  console.log(`${cond ? '✓' : '✗'} ${nombre}${cond ? '' : `   → ${detalle}`}`)
  if (!cond) fallas++
}
/** Tiene que fallar, y con ESTE texto: que falle por otra razón no prueba la regla. */
const falla = async (nombre, fn, texto) => {
  try { await fn(); ok(nombre, false, 'no falló') }
  catch (e) { ok(nombre, String(e.message).includes(texto), e.message) }
}
const uno = async (sql, params = []) => (await db.query(sql, params)).rows[0]
/** La lista efectiva de una visita como texto: 'LAB:cronograma,VIT:cronograma'. */
const lista = async (visita) => (await db.query(
  `select p.code, vp.origen from public.v_visit_procedures vp
   join public.procedures p on p.id = vp.procedure_id
   where vp.visit_id = $1 order by p.code`, [visita])).rows.map((r) => `${r.code}:${r.origen}`).join(',')
/** El `computed_status` de una visita. */
const estado = async (visita) =>
  (await uno(`select computed_status::text as s from public.v_patient_visits where id = $1`, [visita]))?.s
/** Corre `fn` como el rol de la app y con la persona dada; vuelve a superusuario al terminar. */
const como = async (uid, fn) => {
  await db.exec(`set spira.uid = '${uid}'; set role authenticated;`)
  try { return await fn() } finally { await db.exec(`reset role; set spira.uid = '${U.coord}';`) }
}

const U = { coord: '11111111-1111-1111-1111-111111111111', ajena: '22222222-2222-2222-2222-222222222222' }
const P = 'aaaaaaaa-0000-0000-0000-000000000001'
const PAC = 'bbbbbbbb-0000-0000-0000-000000000001'
const E = 'cccccccc-0000-0000-0000-000000000001'   // randomizado hace 60 días
const E2 = 'cccccccc-0000-0000-0000-000000000002'  // otra inscripción del mismo paciente
const D3 = 'dddddddd-0000-0000-0000-000000000003'
const V3 = 'eeeeeeee-0000-0000-0000-000000000003'
const PR = {
  lab: 'f0000000-0000-0000-0000-000000000001', vit: 'f0000000-0000-0000-0000-000000000002',
  hem: 'f0000000-0000-0000-0000-000000000003', ecg: 'f0000000-0000-0000-0000-000000000004',
}
const PP = {
  lab: 'f1000000-0000-0000-0000-000000000001', vit: 'f1000000-0000-0000-0000-000000000002',
  hem: 'f1000000-0000-0000-0000-000000000003',
}

await db.exec(`
  set spira.uid = '${U.coord}';
  insert into public.users values ('${U.coord}', 'Coordinadora'), ('${U.ajena}', 'Ajena');
  insert into public.modulos values ('${U.coord}', 'track', 'operator');
  insert into public.protocols values ('${P}', 'TEST-QA', 'Protocolo de prueba');
  insert into public.protocol_coordinators values ('${P}', '${U.coord}');
  insert into public.patients (id, code, full_name) values ('${PAC}', 'TEST-001', 'Paciente de prueba');
  insert into public.enrollments (id, protocol_id, patient_id, randomization_date)
    values ('${E}', '${P}', '${PAC}', current_date - 60);
  insert into public.enrollments (id, protocol_id, patient_id) values ('${E2}', '${P}', '${PAC}');
  insert into public.visit_definitions (id, protocol_id, code, name, sort_order, offset_days)
    values ('${D3}', '${P}', null, 'V3 W4', 3, 28);
  -- LAB y HEM dejan informe (48 h); VIT no. ECG existe en el catálogo pero NO es del estudio.
  insert into public.procedures values
    ('${PR.lab}', 'LAB', 'Laboratorio', 'Laboratorio'), ('${PR.vit}', 'VIT', 'Signos vitales', 'Clínica'),
    ('${PR.hem}', 'HEM', 'Hemograma', 'Laboratorio'), ('${PR.ecg}', 'ECG', 'Electrocardiograma', 'Clínica');
  insert into public.protocol_procedures (id, protocol_id, procedure_id) values
    ('${PP.lab}', '${P}', '${PR.lab}'), ('${PP.vit}', '${P}', '${PR.vit}'), ('${PP.hem}', '${P}', '${PR.hem}');
  insert into public.report_definitions (protocol_procedure_id, name, eta_hours) values
    ('${PP.lab}', 'Informe de laboratorio', 48), ('${PP.hem}', 'Informe de hemograma', 48);
  insert into public.protocol_activities (protocol_id, visit_def_id, procedure_id, suggested_order) values
    ('${P}', '${D3}', '${PR.lab}', 1), ('${P}', '${D3}', '${PR.vit}', 2);
  insert into public.patient_visits (id, enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end)
    values ('${V3}', '${E}', '${D3}', 'programada', current_date - 2, current_date - 5, current_date + 5);
`)

// ── Los bloques de las Tareas 2, 3 y 4 van ACÁ, en orden ──

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo en verde')
process.exit(fallas ? 1 : 0)
```

- [ ] **Paso 6: La cabecera de la migración y el banco vacío**

Crear `$MIG`:

```sql
-- Spira · Migración NNNN — Pendientes por retomar y retest atado a una visita
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-09-27-pendientes-por-retomar-design.md
-- Plan: docs/superpowers/plans/2026-09-27-pendientes-por-retomar.md
--
-- QUÉ RESUELVE. Un procedimiento que no se hizo en una visita finalizada no quedaba registrado
-- como pendiente en ningún lado: si tenía reporte, la visita no cerraba nunca; si no, se perdía en
-- silencio. Y pasarlo a otro día (0144) obligaba a poner la fecha en el momento, cuando al cierre de
-- la visita casi nunca se sabe cuándo vuelve el paciente. Además, el retest era suelto: no sabía
-- qué visita repetía.
--
-- CÓMO. Una marca explícita, «este procedimiento de esta visita queda para otro día», sin fecha
-- (visit_pending_procedures). La lista efectiva (v_visit_procedures, 0144) la resta, así la visita
-- cierra con lo que se hizo y las vistas que ya leen de ahí lo heredan sin tocarlas. Retomar crea
-- la continuación de la 0144 con fecha y consume la marca. El retest gana su origen en
-- patient_visits.retest_of_visit_id, validado en register_visit_event.
--
-- «HECHO». En la app sólo se tildan los procedimientos que dejan reporte. Uno sin reporte se da por
-- hecho cuando la visita se atendió, salvo que se lo haya dejado para otro día (decisión 9 del
-- spec): lo pregunta procedimiento_hecho().
--
-- ORDEN DE DESPLIEGUE: ADITIVA, va PRIMERO. Sin marcas, la lista efectiva es la misma de antes. El
-- front viejo llama a register_visit_event con cinco parámetros por nombre, que siguen andando: el
-- sexto tiene default. v_track_visits suma columnas AL FINAL. El front nuevo (PR B) NO anda sin
-- esta migración.
--
-- APLICAR a mano en el SQL Editor de Supabase, después de la NNNN-1. IDEMPOTENTE: si algo corta a
-- la mitad, se vuelve a correr el archivo entero. Las sondas del final se MIRAN, no alcanza con el
-- "Success". Registrar en supabase/README.md al confirmarse en prod.
--
-- Probada con PGlite sobre un esquema de juguete, contra las versiones vivas de las vistas y la 0144.
-- ============================================================================
```
Reemplazá `NNNN` y `NNNN-1` por los números reales. Correr:
```bash
cd "$BANCO" && node verificar.mjs "$REPO" "$MIG"
```
Expected: `Todo en verde` y código 0. Si falla al cargar la `0144`, al esquema de juguete le falta algo que esa migración usa (una columna, un rol, una función): agregalo en `esquema.sql` y volvé a correr. No toques la 0144.

No se commitea nada todavía: el banco no va al repo y la migración está vacía.

---

### Tarea 2: La tabla de marcas, «hecho» y la lista efectiva que resta lo marcado

**Files:**
- Modify: `$MIG` (secciones 1-3)
- Modify: `$BANCO/verificar.mjs` (bloque de la Tarea 2)

**Interfaces:**
- Produces (SQL): tabla `public.visit_pending_procedures (id, visit_id, procedure_id, marked_by, marked_at)` con constraints `vpp_visita_fk`, `vpp_procedimiento_fk`, `vpp_marcado_por_fk`, `vpp_visita_procedimiento_unico`. Funciones `public.procedimiento_marcado(uuid, uuid) → boolean`, `public.procedimiento_hecho(uuid, uuid) → boolean`, `public.visita_tiene_retests(uuid) → boolean` (definer). `v_visit_procedures` con las mismas 8 columnas de la 0144.

- [ ] **Paso 1: Los tests que tienen que fallar**

Agregá en `verificar.mjs`, en el lugar marcado:

```js
// ── Tarea 2 · marcas, «hecho» y lista efectiva ─────────────────────────────────────────────────
ok('T2.1 la V3 arranca con su cronograma', (await lista(V3)) === 'LAB:cronograma,VIT:cronograma', await lista(V3))

// La V3 atendida, sin tildar nada: LAB tiene reporte y no se hizo → «realizada» (rama 6).
await db.exec(`update public.patient_visits set real_date = current_date - 2 where id = '${V3}'`)
ok('T2.2 atendida sin tildar el laboratorio: realizada', (await estado(V3)) === 'realizada', await estado(V3))

// «Hecho»: VIT no tiene reporte y la visita se atendió → hecho; LAB sin tildar → no.
ok('T2.3 sin reporte + atendida = hecho', (await uno(`select public.procedimiento_hecho('${V3}', '${PR.vit}') as h`)).h === true)
ok('T2.4 con reporte sin tildar = no hecho', (await uno(`select public.procedimiento_hecho('${V3}', '${PR.lab}') as h`)).h === false)
ok('T2.5 fuera de la lista = no hecho', (await uno(`select public.procedimiento_hecho('${V3}', '${PR.hem}') as h`)).h === false)

// Marcar el laboratorio (a mano, como superusuario: las RPC son de la Tarea 3).
await db.exec(`insert into public.visit_pending_procedures (visit_id, procedure_id) values ('${V3}', '${PR.lab}')`)
ok('T2.6 la lista efectiva resta lo marcado', (await lista(V3)) === 'VIT:cronograma', await lista(V3))
ok('T2.7 la V3 CIERRA con el laboratorio marcado', (await estado(V3)) === 'completa', await estado(V3))
ok('T2.8 procedimiento_marcado lo ve', (await uno(`select public.procedimiento_marcado('${V3}', '${PR.lab}') as m`)).m === true)
ok('T2.9 lo marcado no está hecho', (await uno(`select public.procedimiento_hecho('${V3}', '${PR.lab}') as h`)).h === false)
const aud = await uno(`select count(*)::int as n from public.audit_log where table_name = 'visit_pending_procedures'`)
ok('T2.10 la marca queda auditada', aud.n === 1, `n=${aud.n}`)

// La RLS: se ve si se ve la visita; `authenticated` no escribe directo.
await falla('T2.11 la app no inserta marcas directo', () => como(U.coord, () => db.exec(
  `insert into public.visit_pending_procedures (visit_id, procedure_id) values ('${V3}', '${PR.vit}')`)), 'permission denied')

// Se deja la V3 como estaba para la Tarea 3.
await db.exec(`delete from public.visit_pending_procedures; update public.patient_visits set real_date = null where id = '${V3}';`)
```

Correr: `cd "$BANCO" && node verificar.mjs "$REPO" "$MIG"`.
Expected: FALLA — la primera sentencia que toca `procedimiento_hecho` o `visit_pending_procedures` revienta con `does not exist` (el script aborta antes del resumen). Eso es lo esperado.

- [ ] **Paso 2: La tabla y las funciones auxiliares**

Agregá a `$MIG`:

```sql

-- 1 · La marca: «este procedimiento de esta visita queda para otro día» ------------------------------
-- Sin fecha a propósito: la fecha la pone la continuación el día que se retoma (continuar_pendientes).
--   · vpp_visita_fk, CASCADE: la marca es de la visita. Si la visita se borra, no queda nada que
--     retomar de ella.
--   · vpp_procedimiento_fk, RESTRICT: como visit_procedure_completions (0064) y la 0144.
-- Sin UPDATE: una marca se pone o se quita. `id` es la clave aunque la unicidad sea (visita,
-- procedimiento): audit_row() resuelve `old.id` al planificar (0003, pasó con la 0111). Las
-- constraints van NOMBRADAS: el front embebe el procedimiento por `vpp_procedimiento_fk`.
create table if not exists public.visit_pending_procedures (
  id           uuid primary key default gen_random_uuid(),
  visit_id     uuid not null,
  procedure_id uuid not null,
  marked_by    uuid not null default auth.uid(),
  marked_at    timestamptz not null default now(),
  constraint vpp_visita_fk          foreign key (visit_id)     references public.patient_visits(id) on delete cascade,
  constraint vpp_procedimiento_fk   foreign key (procedure_id) references public.procedures(id)     on delete restrict,
  constraint vpp_marcado_por_fk     foreign key (marked_by)    references public.users(id),
  constraint vpp_visita_procedimiento_unico unique (visit_id, procedure_id)
);
comment on table public.visit_pending_procedures is
  'Procedimientos que una visita deja para otro día, sin fecha todavía. Se escriben sólo por RPC; retomarlos (continuar_pendientes) los consume. NNNN.';

-- RLS: se ve si se ve la visita, igual que visit_added_procedures (0144). El subselect corre con la
-- RLS de patient_visits de quien consulta, así que el alcance es el de la visita, sin copiar su regla.
alter table public.visit_pending_procedures enable row level security;
drop policy if exists "ver procedimientos para otro dia" on public.visit_pending_procedures;
create policy "ver procedimientos para otro dia" on public.visit_pending_procedures for select using (
  exists (select 1 from public.patient_visits pv where pv.id = visit_pending_procedures.visit_id));
revoke all on public.visit_pending_procedures from anon;
revoke insert, update, delete, truncate, references, trigger on public.visit_pending_procedures from authenticated;
grant select on public.visit_pending_procedures to authenticated;

drop trigger if exists trg_audit_vpp on public.visit_pending_procedures;
create trigger trg_audit_vpp after insert or update or delete
  on public.visit_pending_procedures for each row execute function public.audit_row();


-- 2 · Si una visita dejó un procedimiento para otro día ---------------------------------------------
-- SECURITY DEFINER: responde igual para cualquiera que pregunte, sin depender de su RLS. Las otras
-- dos preguntas de esta migración van más abajo, cada una después de lo que lee: procedimiento_hecho
-- lee la lista efectiva (sección 3) y visita_tiene_retests la columna nueva (sección 7). Un
-- `language sql` valida lo que nombra al crearse.
create or replace function public.procedimiento_marcado(p_visit_id uuid, p_procedure_id uuid)
returns boolean language sql security definer stable set search_path = pg_catalog, public as $fn$
  select exists (select 1 from public.visit_pending_procedures m
                 where m.visit_id = p_visit_id and m.procedure_id = p_procedure_id);
$fn$;
```

- [ ] **Paso 3: La lista efectiva que resta lo marcado, y «hecho»**

Agregá a `$MIG`:

```sql


-- 3 · La LISTA EFECTIVA, ahora sin lo marcado para otro día ----------------------------------------
-- Copia de la 0144 con UNA condición más en cada rama: lo que esta visita dejó para otro día no lo
-- debe. Con eso la visita cierra aunque el reporte del procedimiento marcado siga en 'pendiente', y
-- v_patient_visits, v_procedure_report_alerts y v_protocol_report_status —que leen de acá desde la
-- 0144— lo heredan sin tocarlas. Mismas columnas y mismo orden: `create or replace`, sin drop.
-- Al retomar, la marca se borra y pasa a restar la fila diferida (0144): nunca restan las dos a la
-- vez, y si lo hicieran el resultado sería el mismo.
create or replace view public.v_visit_procedures with (security_invoker = true) as
select
  pv.id               as visit_id,
  pa.procedure_id,
  pa.suggested_order,
  'cronograma'::text  as origen,
  null::uuid          as deferred_from_visit_id,
  p.code              as procedure_code,
  p.name              as procedure_name,
  p.category          as procedure_category
from public.patient_visits pv
join public.protocol_activities pa on pa.visit_def_id = pv.visit_def_id
join public.procedures p           on p.id = pa.procedure_id
where not exists (select 1 from public.visit_added_procedures d
                  where d.deferred_from_visit_id = pv.id and d.procedure_id = pa.procedure_id)
  and not exists (select 1 from public.visit_pending_procedures m
                  where m.visit_id = pv.id and m.procedure_id = pa.procedure_id)
union all
select
  a.visit_id,
  a.procedure_id,
  null::integer,
  case when a.deferred_from_visit_id is null then 'agregado' else 'diferido' end,
  a.deferred_from_visit_id,
  p.code,
  p.name,
  p.category
from public.visit_added_procedures a
join public.procedures p on p.id = a.procedure_id
where not exists (select 1 from public.visit_added_procedures d
                  where d.deferred_from_visit_id = a.visit_id and d.procedure_id = a.procedure_id)
  and not exists (select 1 from public.visit_pending_procedures m
                  where m.visit_id = a.visit_id and m.procedure_id = a.procedure_id);

comment on view public.v_visit_procedures is
  'Lista efectiva de procedimientos de cada visita: cronograma − lo que pasó a otra visita − lo dejado para otro día + lo agregado. Única fuente de «qué debe esta visita». 0144, NNNN.';
revoke all on public.v_visit_procedures from anon;
grant select on public.v_visit_procedures to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_visit_procedures from authenticated;

-- «Hecho» (decisión 9 del spec). En la app sólo se tildan los procedimientos que dejan reporte: el
-- tilde vive en el panel «Reportes pendientes». Uno sin reporte no tiene casilla en ningún lado,
-- así que se da por hecho cuando la visita se atendió — si sigue en su lista efectiva, o sea, si no
-- se lo pasó ni se lo dejó para otro día. Lo usan el retest (sólo repite lo hecho) y nada más: el
-- cierre de la visita sigue siendo el de v_patient_visits.
create or replace function public.procedimiento_hecho(p_visit_id uuid, p_procedure_id uuid)
returns boolean language sql security definer stable set search_path = pg_catalog, public as $fn$
  select exists (select 1 from public.visit_procedure_completions c
                 where c.visit_id = p_visit_id and c.procedure_id = p_procedure_id)
      or (
        exists (select 1 from public.patient_visits pv where pv.id = p_visit_id and pv.real_date is not null)
        and exists (select 1 from public.v_visit_procedures vp
                    where vp.visit_id = p_visit_id and vp.procedure_id = p_procedure_id)
        and not exists (select 1
                        from public.patient_visits pv
                        join public.enrollments e          on e.id = pv.enrollment_id
                        join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                                          and pp.procedure_id = p_procedure_id
                        join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
                        where pv.id = p_visit_id)
      );
$fn$;

-- `from public, anon`: Supabase le da EXECUTE a anon explícitamente en cada función nueva.
revoke all on function public.procedimiento_marcado(uuid, uuid) from public, anon;
revoke all on function public.procedimiento_hecho(uuid, uuid) from public, anon;
grant execute on function public.procedimiento_marcado(uuid, uuid) to authenticated;
grant execute on function public.procedimiento_hecho(uuid, uuid) to authenticated;
```

- [ ] **Paso 4: Correr el banco**

```bash
cd "$BANCO" && node verificar.mjs "$REPO" "$MIG"
```
Expected: `✓` en T2.1 a T2.11 y `Todo en verde`. Si T2.7 da `realizada`, la marca no se está restando en la rama que corresponde (el laboratorio de la V3 viene del cronograma: primera rama). Si T2.11 falla con otro texto, mirá el mensaje: tiene que ser el `permission denied` del `revoke`, no un error de RLS.

- [ ] **Paso 5: Commit**

```bash
cd "$REPO" && git add "supabase/migrations/${N}_pendientes_por_retomar.sql" && git commit -m "feat(base): marca de procedimientos para otro día y lista efectiva que la resta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 3: Marcar, desmarcar y retomar (RPC) y las guardas del tilde y de la edición

**Files:**
- Modify: `$MIG` (secciones 4-6)
- Modify: `$BANCO/verificar.mjs` (bloque de la Tarea 3)

**Interfaces:**
- Consumes: la tabla, `procedimiento_marcado`, `v_visit_procedures` (Tarea 2); `puede_registrar_visitas`, `procedimiento_diferido`, `set_added_procedures`, `guard_tildar_diferido` (0144).
- Produces (SQL):
  - `public.dejar_pendientes(p_visit_id uuid, p_procedure_ids uuid[]) → void`
  - `public.quitar_pendiente(p_visit_id uuid, p_procedure_id uuid) → void`
  - `public.continuar_pendientes(p_visita_origen uuid, p_procedure_ids uuid[], p_fecha date) → uuid` (id de la continuación)
  - Mensajes (errcode `23514` salvo que se diga): «Elegí qué procedimientos quedan para otro día», «Solo quedan para otro día los procedimientos que esta visita todavía no hizo», «Elegí qué procedimientos se retoman», «Solo se retoman los procedimientos que quedaron para otro día», «Quedó para otro día. Quitá la marca si se hace hoy.»; permiso `42501` «No tenés permiso para cambiar las visitas de este paciente»; fecha `23502` «La fecha es obligatoria»; visita inexistente `23503` «Esa visita ya no existe».

- [ ] **Paso 1: Los tests que tienen que fallar**

Agregá en `verificar.mjs`, después del bloque de la Tarea 2:

```js
// ── Tarea 3 · dejar, quitar, continuar y guardas ───────────────────────────────────────────────
// La V3 atendida hoy, con el laboratorio sin tildar.
await db.exec(`update public.patient_visits set real_date = current_date where id = '${V3}'`)
const rpc = (sql) => como(U.coord, () => db.query(sql))

await rpc(`select public.dejar_pendientes('${V3}', array['${PR.lab}']::uuid[])`)
ok('T3.1 dejar_pendientes marca', (await lista(V3)) === 'VIT:cronograma', await lista(V3))
await rpc(`select public.dejar_pendientes('${V3}', array['${PR.lab}']::uuid[])`)
ok('T3.2 marcar dos veces no duplica', (await uno(`select count(*)::int as n from public.visit_pending_procedures`)).n === 1)

await falla('T3.3 no se deja lo que no está en la lista', () =>
  rpc(`select public.dejar_pendientes('${V3}', array['${PR.hem}']::uuid[])`), 'todavía no hizo')
await falla('T3.4 no se deja nada vacío', () =>
  rpc(`select public.dejar_pendientes('${V3}', '{}'::uuid[])`), 'Elegí qué procedimientos quedan')
await falla('T3.5 sin permiso no se marca', () => como(U.ajena, () =>
  db.query(`select public.dejar_pendientes('${V3}', array['${PR.vit}']::uuid[])`)), 'No tenés permiso')

// No se tilda lo marcado (el tilde es un insert directo desde el front).
await falla('T3.6 no se tilda lo marcado', () => como(U.coord, () => db.exec(
  `insert into public.visit_procedure_completions (visit_id, procedure_id) values ('${V3}', '${PR.lab}')`)), 'Quedó para otro día')

// «Se hace hoy»: quitar la marca lo devuelve y se puede tildar.
await rpc(`select public.quitar_pendiente('${V3}', '${PR.lab}')`)
ok('T3.7 quitar_pendiente lo devuelve', (await lista(V3)) === 'LAB:cronograma,VIT:cronograma', await lista(V3))
await como(U.coord, () => db.exec(
  `insert into public.visit_procedure_completions (visit_id, procedure_id) values ('${V3}', '${PR.lab}')`))
await falla('T3.8 no se deja lo que ya se tildó', () =>
  rpc(`select public.dejar_pendientes('${V3}', array['${PR.lab}']::uuid[])`), 'todavía no hizo')
await db.exec(`delete from public.visit_procedure_completions where visit_id = '${V3}'`)

// Retomar una PARTE: se marcan los dos y se retoma sólo el laboratorio.
await rpc(`select public.dejar_pendientes('${V3}', array['${PR.lab}', '${PR.vit}']::uuid[])`)
ok('T3.9 con los dos marcados la V3 no debe nada', (await lista(V3)) === '', await lista(V3))
const c1 = (await rpc(`select public.continuar_pendientes('${V3}', array['${PR.lab}']::uuid[], current_date + 3) as id`)).rows[0].id
ok('T3.10 la continuación lleva lo retomado, como diferido', (await lista(c1)) === 'LAB:diferido', await lista(c1))
ok('T3.11 lo no retomado sigue marcado', (await uno(`select string_agg(p.code, ',') as c from public.visit_pending_procedures m join public.procedures p on p.id = m.procedure_id where m.visit_id = '${V3}'`)).c === 'VIT')
ok('T3.12 la V3 sigue sin deber nada', (await lista(V3)) === '', await lista(V3))
const cont = await uno(`select kind::text as k, estimated_date = current_date + 3 as f from public.patient_visits where id = '${c1}'`)
ok('T3.13 la continuación es una VNP con la fecha pedida', cont.k === 'vnp' && cont.f === true, JSON.stringify(cont))
await falla('T3.14 no se retoma lo que no quedó para otro día', () =>
  rpc(`select public.continuar_pendientes('${V3}', array['${PR.lab}']::uuid[], current_date + 4)`), 'quedaron para otro día')
await falla('T3.15 retomar exige fecha', () =>
  rpc(`select public.continuar_pendientes('${V3}', array['${PR.vit}']::uuid[], null)`), 'La fecha es obligatoria')
await falla('T3.16 no se tilda en la V3 lo que ya pasó a la continuación', () => como(U.coord, () => db.exec(
  `insert into public.visit_procedure_completions (visit_id, procedure_id) values ('${V3}', '${PR.lab}')`)), 'pasó a otra visita')

// Editar un retest o una VNP no borra lo marcado (set_added_procedures recreada).
const vnp = (await rpc(`select public.register_visit_event('${E}', 'vnp', current_date, null, array['${PR.hem}', '${PR.vit}']::uuid[]) as id`)).rows[0].id
await rpc(`select public.dejar_pendientes('${vnp}', array['${PR.hem}']::uuid[])`)
// La pantalla manda la lista efectiva, que ya no trae HEM.
await rpc(`select public.set_added_procedures('${vnp}', array['${PR.vit}']::uuid[])`)
ok('T3.17 editar conserva la fila de lo marcado', (await uno(`select count(*)::int as n from public.visit_added_procedures where visit_id = '${vnp}' and procedure_id = '${PR.hem}'`)).n === 1)
ok('T3.18 y la marca sigue', (await uno(`select public.procedimiento_marcado('${vnp}', '${PR.hem}') as m`)).m === true)

// Limpieza para la Tarea 4: sin marcas, sin continuaciones, V3 atendida con el laboratorio tildado.
await db.exec(`
  delete from public.visit_pending_procedures;
  delete from public.visit_added_procedures;
  delete from public.patient_visits where id <> '${V3}';
  insert into public.visit_procedure_completions (visit_id, procedure_id) values ('${V3}', '${PR.lab}');
`)
```

Correr: `cd "$BANCO" && node verificar.mjs "$REPO" "$MIG"`.
Expected: T2.x en verde y la primera línea de la Tarea 3 revienta con `function public.dejar_pendientes(...) does not exist`.

- [ ] **Paso 2: Las tres RPC**

Agregá a `$MIG`:

```sql


-- 4 · Dejar para otro día, y quitar la marca ------------------------------------------------------
-- dejar_pendientes sólo acepta lo que la visita todavía DEBE (su lista efectiva) y NO hizo. Lo que ya
-- estaba marcado se ignora (idempotente): no está en la lista efectiva justamente porque ya se marcó.
-- El lock serializa dos marcados simultáneos sobre la misma visita.
create or replace function public.dejar_pendientes(p_visit_id uuid, p_procedure_ids uuid[])
returns void language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_uid uuid := auth.uid();
  v_protocol uuid;
  v_procs uuid[] := coalesce(array(select distinct t.x from unnest(p_procedure_ids) as t(x) where t.x is not null), '{}');
begin
  if v_uid is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if cardinality(v_procs) = 0 then
    raise exception 'Elegí qué procedimientos quedan para otro día' using errcode = 'check_violation';
  end if;

  select e.protocol_id into v_protocol
  from public.patient_visits pv
  join public.enrollments e on e.id = pv.enrollment_id
  where pv.id = p_visit_id
  for update of pv;
  if v_protocol is null then raise exception 'Esa visita ya no existe' using errcode = '23503'; end if;
  if not public.puede_registrar_visitas(v_protocol) then
    raise exception 'No tenés permiso para cambiar las visitas de este paciente' using errcode = '42501';
  end if;

  if exists (
    select 1 from unnest(v_procs) as t(x)
    where not public.procedimiento_marcado(p_visit_id, t.x)
      and (not exists (select 1 from public.v_visit_procedures vp
                       where vp.visit_id = p_visit_id and vp.procedure_id = t.x)
           or exists (select 1 from public.visit_procedure_completions c
                      where c.visit_id = p_visit_id and c.procedure_id = t.x))
  ) then
    raise exception 'Solo quedan para otro día los procedimientos que esta visita todavía no hizo' using errcode = 'check_violation';
  end if;

  insert into public.visit_pending_procedures (visit_id, procedure_id, marked_by)
  select p_visit_id, t.x, v_uid from unnest(v_procs) as t(x)
  on conflict on constraint vpp_visita_procedimiento_unico do nothing;
end $fn$;

-- «Se hace hoy». Quitar lo que no está marcado no es un error: dos pestañas pueden apretarlo a la vez.
create or replace function public.quitar_pendiente(p_visit_id uuid, p_procedure_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_uid uuid := auth.uid();
  v_protocol uuid;
begin
  if v_uid is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  select e.protocol_id into v_protocol
  from public.patient_visits pv
  join public.enrollments e on e.id = pv.enrollment_id
  where pv.id = p_visit_id
  for update of pv;
  if v_protocol is null then raise exception 'Esa visita ya no existe' using errcode = '23503'; end if;
  if not public.puede_registrar_visitas(v_protocol) then
    raise exception 'No tenés permiso para cambiar las visitas de este paciente' using errcode = '42501';
  end if;
  delete from public.visit_pending_procedures m
  where m.visit_id = p_visit_id and m.procedure_id = p_procedure_id;
end $fn$;


-- 5 · Retomar: la continuación con fecha, y la marca consumida --------------------------------------
-- Mismo resultado que diferir_procedimientos (0144): una VNP con fecha propia y sus filas con
-- deferred_from_visit_id. NO se llama a diferir: diferir exige que el procedimiento esté en la lista
-- efectiva del origen, y lo marcado ya no está (la sección 3 lo resta). Acá la validación es otra
-- —que esté marcado— y el insert se repite, que son dos sentencias. Todo en una transacción: la
-- continuación, sus filas y el borrado de las marcas. Lo que no se elige sigue marcado.
create or replace function public.continuar_pendientes(
  p_visita_origen uuid, p_procedure_ids uuid[], p_fecha date
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_uid uuid := auth.uid();
  v_enrollment uuid; v_protocol uuid; v_visit uuid;
  v_procs uuid[] := coalesce(array(select distinct t.x from unnest(p_procedure_ids) as t(x) where t.x is not null), '{}');
begin
  if v_uid is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if p_fecha is null then raise exception 'La fecha es obligatoria' using errcode = '23502'; end if;
  if cardinality(v_procs) = 0 then
    raise exception 'Elegí qué procedimientos se retoman' using errcode = 'check_violation';
  end if;

  select pv.enrollment_id, e.protocol_id into v_enrollment, v_protocol
  from public.patient_visits pv
  join public.enrollments e on e.id = pv.enrollment_id
  where pv.id = p_visita_origen
  for update of pv;
  if v_enrollment is null then raise exception 'Esa visita ya no existe' using errcode = '23503'; end if;
  if not public.puede_registrar_visitas(v_protocol) then
    raise exception 'No tenés permiso para cambiar las visitas de este paciente' using errcode = '42501';
  end if;

  if exists (select 1 from unnest(v_procs) as t(x)
             where not public.procedimiento_marcado(p_visita_origen, t.x)) then
    raise exception 'Solo se retoman los procedimientos que quedaron para otro día' using errcode = 'check_violation';
  end if;

  insert into public.patient_visits (enrollment_id, kind, estimated_date)
  values (v_enrollment, 'vnp', p_fecha)
  returning id into v_visit;

  insert into public.visit_added_procedures (visit_id, procedure_id, deferred_from_visit_id, added_by)
  select v_visit, t.x, p_visita_origen, v_uid from unnest(v_procs) as t(x);

  delete from public.visit_pending_procedures m
  where m.visit_id = p_visita_origen and m.procedure_id = any (v_procs);

  return v_visit;
end $fn$;

revoke all on function public.dejar_pendientes(uuid, uuid[]) from public, anon;
revoke all on function public.quitar_pendiente(uuid, uuid) from public, anon;
revoke all on function public.continuar_pendientes(uuid, uuid[], date) from public, anon;
grant execute on function public.dejar_pendientes(uuid, uuid[]) to authenticated;
grant execute on function public.quitar_pendiente(uuid, uuid) to authenticated;
grant execute on function public.continuar_pendientes(uuid, uuid[], date) to authenticated;
```

- [ ] **Paso 3: Las dos guardas recreadas**

Agregá a `$MIG` la guarda del tilde:

```sql


-- 6 · Guardas: no tildar lo marcado, y no perder lo marcado al editar ---------------------------------
-- (a) guard_tildar_diferido (0144) suma el caso de lo marcado. Mismo nombre y mismo trigger: el
--     `create or replace` alcanza. Sin security definer (ver la sección 10 de la 0144): las
--     preguntas las hacen funciones definer.
create or replace function public.guard_tildar_diferido()
returns trigger language plpgsql set search_path = pg_catalog, public as $fn$
begin
  if public.procedimiento_diferido(new.visit_id, new.procedure_id) then
    raise exception 'Ese procedimiento pasó a otra visita: se marca allá' using errcode = 'check_violation';
  end if;
  if public.procedimiento_marcado(new.visit_id, new.procedure_id) then
    raise exception 'Quedó para otro día. Quitá la marca si se hace hoy.' using errcode = 'check_violation';
  end if;
  return new;
end $fn$;
```

`set_added_procedures` es **copia exacta de la 0144** (sección 9) con una sola condición más en el `delete`. No la reescribas de memoria: este script la saca del archivo aplicado, le suma la condición y la agrega al final de `$MIG` con su comentario y sus permisos:
```bash
cd "$REPO" && node -e "
const fs=require('fs');
const t=fs.readFileSync('supabase/migrations/0144_visitas_con_procedimientos_propios.sql','utf8').replace(/\r\n/g,'\n');
const a=t.indexOf('create or replace function public.set_added_procedures');
const b=t.indexOf('end \$fn\$;',a)+'end \$fn\$;'.length;
let f=t.slice(a,b);
const viejo='    and not public.procedimiento_diferido(p_visit_id, a.procedure_id);';
if(!f.includes(viejo)) throw new Error('No encontré la línea del delete');
f=f.replace(viejo,'    and not public.procedimiento_diferido(p_visit_id, a.procedure_id)\n    and not public.procedimiento_marcado(p_visit_id, a.procedure_id);   -- NNNN');
const cabeza=[
'',
'-- (b) set_added_procedures (0144, sección 9): la pantalla manda la lista EFECTIVA, que ya no trae lo',
'--     marcado. Sin la condición nueva del delete, guardar la edición de un retest borraba la fila del',
'--     procedimiento marcado y la marca quedaba colgando de algo que la visita ya no lleva. Se conserva,',
'--     igual que ya se conservaba lo diferido. Cuerpo copiado de la 0144; la línea nueva va señalada.',
].join('\n');
const pie='revoke all on function public.set_added_procedures(uuid, uuid[]) from public, anon;\ngrant execute on function public.set_added_procedures(uuid, uuid[]) to authenticated;\n';
fs.appendFileSync(process.argv[1], cabeza+'\n'+f+'\n'+pie);
" "$MIG" && grep -n "procedimiento_marcado(p_visit_id, a.procedure_id)" "$MIG"
```
Expected: una línea, la del `delete` de `set_added_procedures`. Si el script tira «No encontré la línea del delete», la 0144 cambió de forma: abrila y hacé el reemplazo a mano.

- [ ] **Paso 4: Correr el banco**

```bash
cd "$BANCO" && node verificar.mjs "$REPO" "$MIG"
```
Expected: T2.x y T3.1 a T3.18 en verde. Si T3.17 falla, el `delete` de `set_added_procedures` no quedó con la condición nueva.

- [ ] **Paso 5: Commit**

```bash
cd "$REPO" && git add "supabase/migrations/${N}_pendientes_por_retomar.sql" && git commit -m "feat(base): dejar para otro día, quitar la marca y retomar pendientes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 4: El retest atado a su visita

**Files:**
- Modify: `$MIG` (secciones 7-9)
- Modify: `$BANCO/verificar.mjs` (bloque de la Tarea 4)

**Interfaces:**
- Consumes: `procedimiento_hecho` (Tarea 2); `register_visit_event`, `guard_borrar_visita`, `v_track_visits` (0144).
- Produces (SQL):
  - columna `patient_visits.retest_of_visit_id uuid null` con constraints `pv_retest_de_fk` (`on delete set null`), `pv_retest_de_solo_retest`, `pv_retest_de_distinto`;
  - `public.visita_tiene_retests(uuid) → boolean`;
  - `public.register_visit_event(p_enrollment_id uuid, p_kind visit_kind, p_date date, p_notes text default null, p_procedure_ids uuid[] default '{}', p_retest_of uuid default null) → uuid` — UNA sola firma;
  - `v_track_visits` + 4 columnas al final: `retest_of_visit_id`, `retest_of_code`, `retest_of_name`, `retest_of_kind`.
  - Mensajes (`23514`): «Solo un retest repite una visita», «Esa visita no es de este paciente en este estudio», «Solo se repite una visita que ya se atendió», «Solo se repiten los procedimientos que se hicieron en esa visita», «Elegí al menos un procedimiento para el retest», «Esta visita tiene un retest. Borralo primero.».

- [ ] **Paso 1: Los tests que tienen que fallar**

Agregá en `verificar.mjs`, después del bloque de la Tarea 3:

```js
// ── Tarea 4 · retest con origen ────────────────────────────────────────────────────────────────
// Estado de partida: V3 atendida hoy, LAB tildado, VIT sin reporte (hecho por estar atendida).
const reg = (args) => rpc(`select public.register_visit_event(${args}) as id`)
const rt = (await reg(`'${E}', 'retest', current_date + 7, null, array['${PR.lab}', '${PR.vit}']::uuid[], '${V3}'`)).rows[0].id
ok('T4.1 retest de lo tildado y de lo sin reporte', (await lista(rt)) === 'LAB:agregado,VIT:agregado', await lista(rt))
ok('T4.2 el retest guarda su origen', (await uno(`select retest_of_visit_id = '${V3}' as o from public.patient_visits where id = '${rt}'`)).o === true)
const tv = await uno(`select retest_of_visit_id::text as id, retest_of_name, retest_of_kind::text as k from public.v_track_visits where id = '${rt}'`)
ok('T4.3 v_track_visits trae el origen', tv.id === V3 && tv.retest_of_name === 'V3 W4' && tv.k === 'programada', JSON.stringify(tv))

await falla('T4.4 no se repite lo que no se hizo', () =>
  reg(`'${E}', 'retest', current_date, null, array['${PR.hem}']::uuid[], '${V3}'`), 'se hicieron en esa visita')
await falla('T4.5 el origen es de la misma inscripción', () =>
  reg(`'${E2}', 'retest', current_date, null, array['${PR.lab}']::uuid[], '${V3}'`), 'no es de este paciente')
await falla('T4.6 una VNP no lleva origen de retest', () =>
  reg(`'${E}', 'vnp', current_date, null, '{}'::uuid[], '${V3}'`), 'Solo un retest')
await falla('T4.7 un retest con origen lleva algo', () =>
  reg(`'${E}', 'retest', current_date, null, '{}'::uuid[], '${V3}'`), 'al menos un procedimiento')
await db.exec(`update public.patient_visits set real_date = null where id = '${V3}'`)
await falla('T4.8 el origen tiene que estar atendido', () =>
  reg(`'${E}', 'retest', current_date, null, array['${PR.lab}']::uuid[], '${V3}'`), 'ya se atendió')
await db.exec(`update public.patient_visits set real_date = current_date where id = '${V3}'`)

// Compatibilidad con el front desplegado: cinco parámetros por nombre, sin origen.
const viejo = (await rpc(`select public.register_visit_event(p_enrollment_id => '${E}', p_kind => 'retest', p_date => current_date, p_notes => null, p_procedure_ids => '{}'::uuid[]) as id`)).rows[0].id
ok('T4.9 el retest sin origen se sigue aceptando', (await uno(`select retest_of_visit_id is null as n from public.patient_visits where id = '${viejo}'`)).n === true)
ok('T4.10 una sola firma de register_visit_event', (await uno(`select count(*)::int as n from pg_proc where proname = 'register_visit_event'`)).n === 1)

// La app no borra una visita de la que cuelga un retest; el sistema sí, y el retest queda sin origen.
await falla('T4.11 la app no borra el origen de un retest', () => como(U.coord, () =>
  db.exec(`delete from public.patient_visits where id = '${V3}'`)), 'tiene un retest')
await db.exec(`delete from public.visit_procedure_completions where visit_id = '${V3}'; delete from public.patient_visits where id = '${V3}'`)
ok('T4.12 el sistema borra y el retest queda sin origen', (await uno(`select retest_of_visit_id is null as n from public.patient_visits where id = '${rt}'`)).n === true)
// El check: un retest con origen no puede dejar de ser retest.
await db.exec(`update public.patient_visits set retest_of_visit_id = '${rt}' where id = '${viejo}'`)
await falla('T4.13 sólo un retest lleva origen', () =>
  db.exec(`update public.patient_visits set kind = 'vnp' where id = '${viejo}'`), 'pv_retest_de_solo_retest')
await falla('T4.14 un retest no se repite a sí mismo', () =>
  db.exec(`update public.patient_visits set retest_of_visit_id = '${rt}' where id = '${rt}'`), 'pv_retest_de_distinto')
```

Correr: `cd "$BANCO" && node verificar.mjs "$REPO" "$MIG"`.
Expected: T2.x y T3.x en verde; T4.1 revienta con `function public.register_visit_event(...) does not exist` (la firma de seis parámetros todavía no existe).

- [ ] **Paso 2: La columna**

Agregá a `$MIG`:

```sql


-- 7 · El retest cuelga de una visita --------------------------------------------------------------
-- Un dato, una casilla: el origen del retest es de la VISITA, no de cada procedimiento (la
-- continuación, en cambio, deriva su origen de las filas de visit_added_procedures, como en la 0144).
-- ON DELETE SET NULL, por lo mismo que vap_origen_fk (0144): los borrados del SISTEMA (delete_patient,
-- close_enrollment, delete_visit_definition, sync_protocol_schedule) no se traban. La APP no puede
-- borrar una visita de la que cuelga un retest: lo ataja guard_borrar_visita (sección 9).
-- Los retests que ya existen quedan con el origen en nulo: no se les inventa uno.
-- Postgres no tiene `add constraint if not exists`: el `do` lo hace idempotente.
alter table public.patient_visits add column if not exists retest_of_visit_id uuid;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'pv_retest_de_fk') then
    alter table public.patient_visits add constraint pv_retest_de_fk
      foreign key (retest_of_visit_id) references public.patient_visits(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pv_retest_de_solo_retest') then
    alter table public.patient_visits add constraint pv_retest_de_solo_retest
      check (retest_of_visit_id is null or kind = 'retest');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pv_retest_de_distinto') then
    alter table public.patient_visits add constraint pv_retest_de_distinto
      check (retest_of_visit_id is distinct from id);
  end if;
end $mig$;
create index if not exists ix_pv_retest_de on public.patient_visits (retest_of_visit_id)
  where retest_of_visit_id is not null;
comment on column public.patient_visits.retest_of_visit_id is
  'La visita que este retest repite. Nulo en todo lo que no es retest y en los retests anteriores a la NNNN.';

-- Si de esta visita cuelga algún retest. Va acá y no en la sección 2: un `language sql` valida las
-- columnas al crearse, y la columna recién existe desde la línea de arriba.
create or replace function public.visita_tiene_retests(p_visit_id uuid)
returns boolean language sql security definer stable set search_path = pg_catalog, public as $fn$
  select exists (select 1 from public.patient_visits r where r.retest_of_visit_id = p_visit_id);
$fn$;
revoke all on function public.visita_tiene_retests(uuid) from public, anon;
grant execute on function public.visita_tiene_retests(uuid) to authenticated;
```

**Agregar una columna a `patient_visits` no rompe `v_patient_visits`:** la 0144 la recreó con la lista de columnas leída de la vista viva (`pg_attribute`), y Postgres guarda cada vista con sus columnas expandidas. Lo comprueba T2.7 al correr contra el estado de antes, y la sonda de la Tarea 5.

- [ ] **Paso 3: `register_visit_event` con origen**

Agregá a `$MIG`. El cuerpo es el de la 0144 (sección 7) con tres cambios señalados con `-- NNNN`: la firma, el bloque de validación del origen, y el `insert` con la columna nueva.

```sql


-- 8 · register_visit_event: el retest recibe su visita de origen -----------------------------------
-- Cuerpo de la 0144 con tres cambios (señalados): un sexto parámetro con default, la validación del
-- origen, y el insert que lo guarda. La firma cambia, así que va el DROP de la de cinco: sin él queda
-- una sobrecarga viva y la llamada del front viejo resolvería a la vieja en silencio. El front viejo
-- llama con cinco parámetros POR NOMBRE, que la nueva acepta (el sexto tiene default).
-- Sin origen, el retest se sigue aceptando como antes: compatibilidad con el front desplegado y con
-- los retests viejos. Que el retest SIEMPRE cuelgue de una visita lo asegura el front nuevo.
drop function if exists public.register_visit_event(uuid, visit_kind, date, text, uuid[]);
create or replace function public.register_visit_event(
  p_enrollment_id uuid, p_kind visit_kind, p_date date, p_notes text default null,
  p_procedure_ids uuid[] default '{}',
  p_retest_of uuid default null                                                        -- NNNN
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_uid uuid := auth.uid();
  v_protocol uuid; v_rando date; v_visit uuid;
  v_has_firma boolean; v_has_screening boolean;
  v_procs uuid[] := coalesce(array(select distinct t.x from unnest(p_procedure_ids) as t(x) where t.x is not null), '{}');
begin
  if v_uid is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if p_kind = 'programada' then raise exception 'Las visitas programadas no se crean por acá' using errcode = 'check_violation'; end if;
  if p_date is null then raise exception 'La fecha es obligatoria' using errcode = '23502'; end if;

  select e.protocol_id, e.randomization_date into v_protocol, v_rando
    from public.enrollments e where e.id = p_enrollment_id;
  if v_protocol is null then raise exception 'Enrolamiento inexistente' using errcode = '23503'; end if;

  if not public.puede_registrar_visitas(v_protocol) then
    raise exception 'No tenés permiso para registrar visitas de este paciente' using errcode = '42501';
  end if;

  if cardinality(v_procs) > 0 and p_kind not in ('vnp', 'retest') then
    raise exception 'Solo el retest y la VNP llevan procedimientos propios' using errcode = 'check_violation';
  end if;
  -- Un retest vacío SIN ORIGEN se acepta (compat, ver la 0144). Con origen lo manda el front nuevo, y
  -- ahí sí se exige al menos uno (abajo).
  if exists (select 1 from unnest(v_procs) as t(x)
             where not exists (select 1 from public.protocol_procedures pp
                               where pp.protocol_id = v_protocol and pp.procedure_id = t.x)) then
    raise exception 'Ese procedimiento no es de este estudio' using errcode = 'check_violation';
  end if;

  -- NNNN · El origen del retest: de la misma inscripción, ya atendido, y sólo lo que se hizo ahí
  -- (procedimiento_hecho: tildado, o sin reporte con la visita atendida).
  if p_retest_of is not null then
    if p_kind <> 'retest' then
      raise exception 'Solo un retest repite una visita' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.patient_visits o
                   where o.id = p_retest_of and o.enrollment_id = p_enrollment_id) then
      raise exception 'Esa visita no es de este paciente en este estudio' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.patient_visits o
                   where o.id = p_retest_of and o.real_date is not null) then
      raise exception 'Solo se repite una visita que ya se atendió' using errcode = 'check_violation';
    end if;
    if cardinality(v_procs) = 0 then
      raise exception 'Elegí al menos un procedimiento para el retest' using errcode = 'check_violation';
    end if;
    if exists (select 1 from unnest(v_procs) as t(x)
               where not public.procedimiento_hecho(p_retest_of, t.x)) then
      raise exception 'Solo se repiten los procedimientos que se hicieron en esa visita' using errcode = 'check_violation';
    end if;
  end if;

  -- Cutover de la 0030: con cuadro, firma/screening/randomización se agendan desde el cuadro.
  if p_kind in ('firma','screening','firma_screening','randomizacion')
     and exists (select 1 from public.visit_definitions vd
                 where vd.protocol_id = v_protocol and vd.role <> 'comun') then
    raise exception 'Este protocolo usa el cronograma: agendá screening/randomización desde el cuadro' using errcode = 'check_violation';
  end if;

  if v_rando is not null then
    if p_kind not in ('vnp','retest') then
      raise exception 'Después de la randomización solo se registran VNP o Retest' using errcode = 'check_violation';
    end if;
  else
    if p_kind in ('firma','screening','firma_screening','randomizacion')
       and exists (select 1 from public.patient_visits where enrollment_id = p_enrollment_id and kind = p_kind) then
      raise exception 'Esa visita ya está registrada' using errcode = 'check_violation';
    end if;
    if p_kind in ('firma','screening')
       and exists (select 1 from public.patient_visits where enrollment_id = p_enrollment_id and kind = 'firma_screening') then
      raise exception 'Ya hay una visita de Firma y Screening' using errcode = 'check_violation';
    end if;
    if p_kind = 'firma_screening'
       and exists (select 1 from public.patient_visits where enrollment_id = p_enrollment_id and kind in ('firma','screening')) then
      raise exception 'Ya hay Firma o Screening por separado' using errcode = 'check_violation';
    end if;
    if p_kind = 'randomizacion' then
      select exists (select 1 from public.patient_visits where enrollment_id = p_enrollment_id and kind in ('firma','firma_screening')),
             exists (select 1 from public.patient_visits where enrollment_id = p_enrollment_id and kind in ('screening','firma_screening'))
        into v_has_firma, v_has_screening;
      if not (v_has_firma and v_has_screening) then
        raise exception 'Para randomizar tiene que haber firma y screening previos' using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- La suelta nace AGENDADA (estimated_date), no atendida — modelo 0025.
  insert into public.patient_visits (enrollment_id, kind, estimated_date, notes, retest_of_visit_id)   -- NNNN
  values (p_enrollment_id, p_kind, p_date, nullif(btrim(coalesce(p_notes, '')), ''), p_retest_of)
  returning id into v_visit;

  insert into public.visit_added_procedures (visit_id, procedure_id, added_by)
  select v_visit, t.x, v_uid from unnest(v_procs) as t(x);

  -- Anclaje legacy (sólo protocolos SIN cuadro: el cutover de arriba bloquea este kind si hay cuadro).
  if p_kind = 'randomizacion' then
    update public.enrollments set randomization_date = p_date where id = p_enrollment_id;
  end if;

  return v_visit;
end $fn$;
revoke all on function public.register_visit_event(uuid, visit_kind, date, text, uuid[], uuid) from public, anon;
grant execute on function public.register_visit_event(uuid, visit_kind, date, text, uuid[], uuid) to authenticated;
```

Antes de seguir, compará con la 0144 que no se te escapó nada del cuerpo:
```bash
cd "$REPO" && node -e "
const fs=require('fs'), n=s=>s.replace(/\r\n/g,'\n');
const cuerpo=(t)=>{const a=t.lastIndexOf('create or replace function public.register_visit_event');return t.slice(a,t.indexOf('end \$fn\$;',a)).split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('--'))};
const viejo=cuerpo(n(fs.readFileSync('supabase/migrations/0144_visitas_con_procedimientos_propios.sql','utf8')));
const nuevo=new Set(cuerpo(n(fs.readFileSync(process.argv[1],'utf8'))));
const faltan=viejo.filter(l=>!nuevo.has(l));
console.log(faltan.length?faltan.join('\n'):'OK: todo lo de la 0144 sigue');
" "$MIG"
```
Expected: sólo las tres líneas que cambiaron a propósito (`p_procedure_ids uuid[] default '{}'`, `insert into public.patient_visits (enrollment_id, kind, estimated_date, notes)`, `values (p_enrollment_id, p_kind, p_date, nullif(...))`). Cualquier otra línea es algo que se perdió al copiar.

- [ ] **Paso 4: La guarda de borrado y `v_track_visits`**

Agregá a `$MIG`. `guard_borrar_visita` es la de la 0144 (sección 10 b) con un `if` más. `v_track_visits` es la de la 0144 (sección 6) con cuatro columnas **al final** y dos joins: pegala desde el archivo, no de memoria, y sumá lo señalado.

```sql


-- 9 · Lo que la app no borra, y el origen del retest en v_track_visits ------------------------------
-- guard_borrar_visita (0144) suma: la app no borra una visita de la que cuelga un retest. postgres
-- (el SISTEMA) sigue pasando primero, y pv_retest_de_fk (SET NULL) le deja al retest lo suyo.
create or replace function public.guard_borrar_visita()
returns trigger language plpgsql set search_path = pg_catalog, public as $fn$
begin
  if current_user = 'postgres' then return old; end if;
  if public.visita_paso_procedimientos(old.id) then
    raise exception 'Esta visita pasó procedimientos a otra. Deshacé primero esa continuación.' using errcode = 'check_violation';
  end if;
  if public.visita_tiene_retests(old.id) then                                             -- NNNN
    raise exception 'Esta visita tiene un retest. Borralo primero.' using errcode = 'check_violation';
  end if;
  if old.visit_def_id is null and public.visita_tiene_realizados(old.id) then
    raise exception 'Esta visita ya tiene procedimientos marcados como realizados. Desmarcalos antes de borrarla.' using errcode = 'check_violation';
  end if;
  return old;
end $fn$;
```

Para `v_track_visits`, generala a partir de la 0144 y pegala en `$MIG`:
```bash
cd "$REPO" && node -e "
const fs=require('fs');
const t=fs.readFileSync('supabase/migrations/0144_visitas_con_procedimientos_propios.sql','utf8').replace(/\r\n/g,'\n');
const a=t.indexOf('create or replace view public.v_track_visits');
let v=t.slice(a,t.indexOf(';\n',a)+2);
const colFin='  opv.kind     as origin_kind\n';
if(!v.includes(colFin)) throw new Error('No encontré la última columna');
v=v.replace(colFin,'  opv.kind     as origin_kind,\n  -- NNNN: el origen del retest, al final para no alterar el orden anterior.\n  self.retest_of_visit_id as retest_of_visit_id,\n  rvd.code     as retest_of_code,\n  rvd.name     as retest_of_name,\n  rpv.kind     as retest_of_kind\n');
const joinFin='left join public.visit_definitions ovd on ovd.id = opv.visit_def_id;';
if(!v.includes(joinFin)) throw new Error('No encontré el último join');
v=v.replace(joinFin,'left join public.visit_definitions ovd on ovd.id = opv.visit_def_id\n-- v_patient_visits no trae retest_of_visit_id (su lista de columnas quedó fija en la 0144): se lee de\n-- la tabla por el id.\nleft join public.patient_visits self    on self.id = v.id\nleft join public.patient_visits rpv     on rpv.id = self.retest_of_visit_id\nleft join public.visit_definitions rvd on rvd.id = rpv.visit_def_id;');
console.log(v);
console.log(\"comment on view public.v_track_visits is\n  'Visitas de Coordinación. patient_code = IVRS de la inscripción (0126). 0144: origin_* (continuación). NNNN: retest_of_* (la visita que repite un retest), al final.';\");
" >> "$MIG" && tail -15 "$MIG"
```
Expected: el final de `$MIG` muestra los cuatro `retest_of_*` y los tres joins nuevos. Si el script tira «No encontré…», la 0144 cambió de forma: abrila y hacé el reemplazo a mano con el mismo contenido.

- [ ] **Paso 5: Correr el banco**

```bash
cd "$BANCO" && node verificar.mjs "$REPO" "$MIG"
```
Expected: todo en verde, T2.1 a T4.14. Si T4.3 falla con `column … does not exist`, un join de `v_track_visits` quedó mal. Si T4.10 da 2, falta el `drop function` de la firma de cinco.

- [ ] **Paso 6: Commit**

```bash
cd "$REPO" && git add "supabase/migrations/${N}_pendientes_por_retomar.sql" && git commit -m "feat(base): el retest guarda la visita que repite

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 5: Sondas, índice y PR A

**Files:**
- Modify: `$MIG` (sección 10)
- Modify: `supabase/README.md`

- [ ] **Paso 1: Las sondas**

Agregá a `$MIG`:

```sql


-- 10 · Recarga de PostgREST y sondas --------------------------------------------------------------
notify pgrst, 'reload schema';

-- Sonda 1: las vistas recreadas corren con los permisos de QUIEN CONSULTA. Las dos tienen que decir
-- {security_invoker=true}; una sin eso saltea la RLS por estudio en silencio.
select c.relname, c.reloptions
from pg_class c
where c.oid in ('public.v_visit_procedures'::regclass, 'public.v_track_visits'::regclass)
order by 1;

-- Sonda 2: la lista efectiva resta lo marcado en SUS DOS ramas. Tiene que dar 2.
select (length(definition) - length(replace(definition, 'visit_pending_procedures', ''))) / length('visit_pending_procedures') as ramas_que_restan
from pg_views where schemaname = 'public' and viewname = 'v_visit_procedures';

-- Sonda 3: register_visit_event quedó con UNA sola firma (la de seis parámetros). Tiene que dar 1.
select count(*) as firmas from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'register_visit_event';

-- Sonda 4: v_patient_visits no se enteró de la columna nueva (su lista quedó fija en la 0144). Tiene
-- que dar 0: si da 1, alguien la recreó con pv.* y el orden de columnas corrió.
select count(*) as tiene_retest_of from pg_attribute
where attrelid = 'public.v_patient_visits'::regclass and attname = 'retest_of_visit_id' and not attisdropped;
```

- [ ] **Paso 2: Chequeos del archivo**

```bash
cd "$REPO" && grep -c "NNNN" "$MIG"; node -e "const t=require('fs').readFileSync(process.argv[1],'utf8');const n=(t.match(/\\\$[a-z]*\\\$/g)||[]).length;console.log('marcadores de dollar-quote:',n,n%2?'IMPAR — NO APLICAR':'par')" "$MIG"
```
Expected: la primera línea da **el número de `NNNN` que todavía quedan**: reemplazalos todos por el número real (`sed` NO — usá Edit o Node: `sed -i` en Git Bash convierte CRLF). Después, `0`. Los marcadores tienen que dar **par**.

Volvé a correr el banco con el archivo final:
```bash
cd "$BANCO" && node verificar.mjs "$REPO" "$MIG"
```
Expected: `Todo en verde`.

- [ ] **Paso 3: La fila del índice**

En `supabase/README.md`, en el índice de migraciones, agregá la fila siguiente a la de la 0144 con el mismo formato que las demás (mirá la de la 0144 como molde): número, archivo `NNNN_pendientes_por_retomar.sql`, descripción «Pendientes por retomar (marca sin fecha, lista efectiva que la resta, dejar/quitar/continuar) y retest atado a su visita (`retest_of_visit_id`)», y el estado **pendiente de aplicar**. Corré el chequeo de CI:
```bash
cd "$REPO" && node scripts/check-migraciones.mjs
```
Expected: sale 0.

- [ ] **Paso 4: Commit, push y PR A**

```bash
cd "$REPO" && git add "supabase/migrations/${N}_pendientes_por_retomar.sql" supabase/README.md && git commit -m "feat(base): sondas de la ${N} y su fila en el índice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git fetch origin && git ls-tree --name-only origin/main supabase/migrations/ | tail -1
```
Expected: la última de `origin/main` sigue siendo la anterior a la tuya. Si alguien tomó tu número mientras trabajabas, **renumerá antes de pushear** (renombrar el archivo y reemplazar el número adentro) — la migración todavía no se aplicó.

Push y PR por la API REST (sin `gh`, ver la memoria `ci-y-pr-operativa`): base `main`, título «Base: pendientes por retomar y retest atado a una visita (NNNN)». En el cuerpo:
- qué hace, en tres renglones;
- **«Aditiva: va PRIMERO. El front nuevo (PR B) no anda sin ella; el viejo no ve diferencia.»**;
- las cuatro sondas con lo que tienen que dar (`{security_invoker=true}` ×2, `2`, `1`, `0`);
- el pie `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Avisale al Director **en el chat**, junto con el link: que la migración va primero, que es idempotente, y qué tienen que dar las sondas. Cuando confirme «aplicada», verificá desde la API sin sesión que existe (`probar-sintaxis-postgrest-sin-sesion`: un `rpc('continuar_pendientes', …)` sin sesión tiene que dar `42501`, no `PGRST202`) y registrá **Aplicada en prod (fecha)** en el índice, en la PR B.

**No arranques la PR B contra prod hasta que la migración esté aplicada.** Sí podés arrancar el código (Tareas 6-14) en paralelo.

---

# PR B — El front

Rama propia desde `origin/main` (la PR A puede no estar mergeada todavía: si no lo está, partí de su rama para tener la migración a mano, y reapuntá la PR B a `main` cuando la A entre — ver la memoria `gotcha-pr-apilada-no-se-reapunta`):
```bash
git fetch origin && git worktree add -b feat/pendientes-por-retomar-front .claude/worktrees/retomar-front origin/main && cd .claude/worktrees/retomar-front && npm install
```
De acá en adelante, `$REPO` es este worktree: `export REPO="$(git rev-parse --show-toplevel)"`.

### Tarea 6: Mock en el repo (gate del Director)

**Files:**
- Create: `docs/mock-pendientes-por-retomar.html`

- [ ] **Paso 1: Armar el mock**

Un HTML estático, autocontenido, con los tokens de `src/styles/tokens.css` copiados en `:root` (petróleo + papel cálido, Inter), al estilo de `docs/mock-visitas-continuacion.html` (abrilo y seguí su estructura). Cuatro pantallas, una debajo de la otra, cada una con su rótulo:

1. **Al finalizar** — el modal en sus dos pasos. Paso 1: «Esta visita tiene procedimientos sin marcar», subtítulo «Marcá los que se hicieron. Lo que no marques queda para otro día.», «¿Qué se hizo?» con dos casillas (Laboratorio tildado, Hemograma sin tildar) y los botones «Cancelar» (contorno) y «Continuar» (primario). Paso 2: «Van a quedar pendientes», subtítulo «Estos procedimientos quedan para otro día. Los vas a encontrar en Pendientes.», la lista (Hemograma) y los botones «Volver» / «Finalizar». Se tilda lo que SE HIZO (corrección del Director, 2026-09-27).
2. **La V3 con marcas** — el pie del panel «Resumen de la visita»: la caja «Queda para otro día · 2 procedimientos», un renglón por procedimiento con el botón chico «Se hace hoy», y abajo los botones «Dejar para otro día» y (si es suelta) «Editar procedimientos».
3. **Agregar visita (desde Visitas)** — modal con «Estudio», «¿Qué vas a hacer?» (desplegable abierto mostrando «Una visita del estudio (3)», «Continuar pendientes (2)», «Retest», «VNP»), y el caso «Continuar pendientes» elegido: el desplegable de la visita («V3 W4 · Juan Pérez · 12/9 · Hematología, ECG») y las casillas preseleccionadas. Botones «Cancelar» / «Agendar».
4. **Pendientes** — una fila de «Procedimientos por retomar» (tono neutro, ícono de reloj): nombre + IVRS + protocolo, la sublínea «V3 W4 · 12/9 · Hematología, ECG · espera hace 5 d» y el botón con nombre «Agendar» abajo a la derecha.

Nada de bordes de color para el realce (elevación), y nombre del paciente en tinta + IVRS en mono.

- [ ] **Paso 2: Gate**

Publicalo como artifact o mostralo en el preview, y **esperá el «sí» del Director**. No implementes UI antes. Si pide cambios, ajustá el mock y volvé a mostrarlo.

- [ ] **Paso 3: Commit**

```bash
cd "$REPO" && git add docs/mock-pendientes-por-retomar.html && git commit -m "docs(mock): pendientes por retomar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 7: El título del retest con origen

**Files:**
- Modify: `src/lib/visits.ts:23-35` (tipo), `:65-83` (título ancho), `:125-128` (compacto)
- Modify: `src/data/visits.ts:74-83` (tipo de fila)
- Modify: `src/views/track/VisitDetail.tsx:118-122` (rótulo del feedback)
- Test: `src/lib/visitTitle.test.ts`

**Interfaces:**
- Produces: `VisitTitleFields` y `TrackVisitRow` con `retest_of_visit_id?`, `retest_of_code?`, `retest_of_name?`, `retest_of_kind?` (todas `… | null`, opcionales). `visitTitle` → «Retest de V3 W4»; `visitCode` → «Retest V3 W4».

- [ ] **Paso 1: El test que falla**

Agregá al final de `src/lib/visitTitle.test.ts`:

```ts
/**
 * El retest con origen (vNNNN): repite procedimientos de una visita y se nombra por ella. Falla en
 * silencio si vuelve a decir «Retest» a secas: con dos retests en el día no se sabe cuál repite qué.
 */
describe('retest con origen', () => {
  const rt = (campos: Partial<TrackVisitRow>) =>
    v({ kind: 'retest', retest_of_visit_id: 'v1', retest_of_kind: 'programada', ...campos })

  it('se nombra por la visita que repite', () => {
    expect(visitTitle(rt({ retest_of_code: null, retest_of_name: 'V1 Screening' }))).toBe('Retest de V1 Screening')
    expect(visitTitle(rt({ retest_of_code: 'V1', retest_of_name: 'V1' }))).toBe('Retest de V1')
  })

  it('el rótulo compacto también', () => {
    expect(visitCode(rt({ retest_of_code: null, retest_of_name: 'V1 Screening' }))).toBe('Retest V1 Screening')
  })

  it('si el origen es una suelta, se nombra por su tipo', () => {
    expect(visitTitle(rt({ retest_of_kind: 'screening' }))).toBe('Retest de Screening')
    expect(visitCode(rt({ retest_of_kind: 'screening' }))).toBe('Retest Scr')
  })

  it('sin origen sigue siendo «Retest», y un origen a medio cargar no inventa nada', () => {
    expect(visitTitle(v({ kind: 'retest' }))).toBe('Retest')
    expect(visitTitle(v({ kind: 'retest', retest_of_visit_id: 'v1', retest_of_kind: null }))).toBe('Retest')
    expect(visitCode(v({ kind: 'retest' }))).toBe('Retest')
  })

  it('sólo el retest lee su origen: una VNP con esas columnas no se llama «Retest de…»', () => {
    expect(visitTitle(v({ kind: 'vnp', retest_of_visit_id: 'v1', retest_of_kind: 'programada', retest_of_name: 'V1' }))).toBe('VNP')
  })
})
```

Correr: `npx vitest run src/lib/visitTitle.test.ts`
Expected: FALLA en tsc/vitest por `retest_of_visit_id` inexistente en el tipo, o en los `expect` («Retest» en vez de «Retest de V1 Screening»).

- [ ] **Paso 2: El tipo**

En `src/lib/visits.ts`, dentro de `VisitTitleFields`, después de `origin_kind?: VisitKind | null`:

```ts
  /**
   * La visita que repite un retest (vNNNN). Opcionales por lo mismo que los `origin_*`: Farmacia y
   * varios tests arman filas sin ellos, y ahí un retest se lee «Retest», que es lo que es.
   */
  retest_of_visit_id?: string | null
  retest_of_code?: string | null
  retest_of_name?: string | null
  retest_of_kind?: VisitKind | null
```

En `src/data/visits.ts`, dentro de `TrackVisitRow`, después de `origin_kind?: VisitKind | null`:

```ts
  /**
   * Retest (vNNNN, `v_track_visits`): la visita que repite y su título. `null` en todo lo que no es
   * retest y en los retests anteriores a la NNNN. Opcionales por lo mismo que los `origin_*`.
   */
  retest_of_visit_id?: string | null
  retest_of_code?: string | null
  retest_of_name?: string | null
  retest_of_kind?: VisitKind | null
```

- [ ] **Paso 3: El título**

En `src/lib/visits.ts`, después de `origenDeContinuacion`:

```ts
/**
 * El nombre de la visita que repite un retest, o '' si no es un retest con origen. Misma regla que
 * `origenDeContinuacion`: «V1 Screening» dice lo mismo en el retest que en la V1. Sólo lo lee un
 * retest: el `check` de la NNNN no deja que otra cosa tenga origen, pero una fila armada a mano sí.
 */
function origenDeRetest(v: VisitTitleFields, corto: boolean): string {
  if (v.kind !== 'retest' || !v.retest_of_visit_id || !v.retest_of_kind) return ''
  const origen = { visit_code: v.retest_of_code ?? null, visit_name: v.retest_of_name ?? null, kind: v.retest_of_kind }
  return tituloDeDefinicion(origen) || (corto ? KIND_SHORT : KIND_LABELS)[v.retest_of_kind]
}
```

Reemplazá `visitTitle` por:

```ts
export function visitTitle(v: VisitTitleFields): string {
  const definicion = tituloDeDefinicion(v)
  if (definicion) return definicion
  const continuacion = origenDeContinuacion(v, false)
  if (continuacion) return `Continuación de ${continuacion}`
  const retest = origenDeRetest(v, false)
  if (retest) return `Retest de ${retest}`
  return KIND_LABELS[v.kind]
}
```

Y `visitCode` por:

```ts
export function visitCode(v: VisitTitleFields): string {
  const definicion = tituloDeDefinicion(v)
  if (definicion) return definicion
  const continuacion = origenDeContinuacion(v, true)
  if (continuacion) return `Cont. ${continuacion}`
  const retest = origenDeRetest(v, true)
  if (retest) return `Retest ${retest}`
  return KIND_SHORT[v.kind]
}
```

(Conservá los comentarios de encabezado de las dos funciones; sumales una línea: «Desde la NNNN, un retest con origen se nombra por la visita que repite.»)

- [ ] **Paso 4: El rótulo del feedback en la visita**

En `src/views/track/VisitDetail.tsx`, en el `useLugar`, el retest se titula entero igual que la continuación («Visita Retest V1» no es un nombre):

```ts
    /* Una continuación o un retest con origen se titulan enteros: «Visita Cont. V3» no es un nombre. */
    label: `${visitCode(visit) && !visit.origin_visit_id && !visit.retest_of_visit_id ? `Visita ${visitCode(visit)}` : visitTitle(visit)} · ${visit.patient_name}`,
```

- [ ] **Paso 5: Correr**

```bash
cd "$REPO" && npx vitest run src/lib/visitTitle.test.ts && npm run typecheck
```
Expected: PASS y tsc sin errores.

- [ ] **Paso 6: Commit**

```bash
cd "$REPO" && git add src/lib/visits.ts src/lib/visitTitle.test.ts src/data/visits.ts src/views/track/VisitDetail.tsx && git commit -m "feat(coordinacion): el retest se nombra por la visita que repite

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 8: Capa de datos — «tiene reporte», las marcas y el origen del retest

**Files:**
- Modify: `src/data/procedures.ts:150-234`
- Create: `src/data/pendientes.ts`
- Modify: `src/data/visitEvents.ts:67-81`

**Interfaces:**
- Produces:
  - `VisitProcedureStatus.tiene_reporte: boolean` (nuevo campo obligatorio).
  - `fetchVisitProcedureStatus(visitId: string, protocolId: string): Promise<{ data: VisitProcedureStatus[] | null; error: string | null }>` — lectura suelta, fuera de un hook.
  - En `src/data/pendientes.ts`:
    - `interface MarcadoRow { procedure_id: string; procedure_name: string; marked_at: string }`
    - `interface MarcaRow extends MarcadoRow { visit_id: string }`
    - `useMarcadosDeVisita(visitId: string | null)` → `useSupabaseQuery<MarcadoRow[]>`
    - `usePorRetomar()` → `useSupabaseQuery<{ marcas: MarcaRow[]; visitas: TrackVisitRow[] }>`
    - `dejarPendientes(visitId: string, procedureIds: string[]): Promise<{ error: string | null }>`
    - `quitarPendiente(visitId: string, procedureId: string): Promise<{ error: string | null }>`
    - `continuarPendientes(visitaOrigen: string, procedureIds: string[], fecha: string): Promise<{ id: string | null; error: string | null }>`
  - `registerVisitEvent(enrollmentId, kind, date, notes, procedureIds = [], retestOf: string | null = null)`.

- [ ] **Paso 1: `tiene_reporte` y la lectura suelta**

En `src/data/procedures.ts`, en `VisitProcedureStatus`, después de `draws_blood`:

```ts
  /**
   * Si el procedimiento deja reporte EN ESTE ESTUDIO (`report_definitions`, 0089). En la app sólo se
   * tildan los que dejan reporte; uno sin reporte se da por hecho cuando la visita se atendió
   * (decisión 9 del spec de la NNNN). De acá lo leen el aviso al finalizar y el retest.
   */
  tiene_reporte: boolean
```

Sacá el cuerpo de `useVisitProcedureStatus` a una función que reciba el cliente, y sumá el embed de reportes a la consulta de `protocol_procedures` (misma relación nombrada que `useDayProcedureRows`, por lo del embed ambiguo):

```ts
/**
 * La lectura de `useVisitProcedureStatus`, sacada a una función para poder hacerla también FUERA
 * de un hook: el aviso al finalizar (vNNNN) la necesita en el momento del clic, desde la fila del
 * día, donde no hay un hook por visita montado.
 */
async function cargarProcedimientosDeVisita(
  c: typeof supabase, visitId: string, protocolId: string | null,
): Promise<{ data: VisitProcedureStatus[] | null; error: PostgrestError | null }> {
  const [asg, compRes, sangreRes] = await Promise.all([
    c
      .from('v_visit_procedures')
      .select('procedure_id, suggested_order, origen, deferred_from_visit_id, procedure_code, procedure_name, procedure_category')
      .eq('visit_id', visitId)
      .order('suggested_order', { ascending: true, nullsFirst: false })
      .order('procedure_name', { ascending: true }),
    c.from('visit_procedure_completions').select('procedure_id, completed_at').eq('visit_id', visitId),
    protocolId
      ? c.from('protocol_procedures').select('procedure_id, draws_blood, report_definitions!protocol_procedure_id(id)').eq('protocol_id', protocolId)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (asg.error) return { data: null, error: asg.error }
  if (compRes.error) return { data: null, error: compRes.error }
  if (sangreRes.error) return { data: null, error: sangreRes.error }

  const rows = (asg.data ?? []) as unknown as {
    procedure_id: string
    suggested_order: number | null
    origen: OrigenProcedimiento
    deferred_from_visit_id: string | null
    procedure_code: string | null
    procedure_name: string
    procedure_category: string | null
  }[]
  const comp = new Map<string, string>(
    ((compRes.data ?? []) as { procedure_id: string; completed_at: string }[]).map((r) => [r.procedure_id, r.completed_at]),
  )
  const delEstudio = (sangreRes.data ?? []) as unknown as {
    procedure_id: string; draws_blood: boolean | null; report_definitions: { id: string }[] | null
  }[]
  const sangre = new Map<string, boolean | null>(delEstudio.map((r) => [r.procedure_id, r.draws_blood]))
  const conReporte = new Set(delEstudio.filter((r) => (r.report_definitions ?? []).length > 0).map((r) => r.procedure_id))

  return {
    data: rows.map((r) => ({
      procedure_id: r.procedure_id,
      code: r.procedure_code,
      name: r.procedure_name,
      category: r.procedure_category,
      suggested_order: r.suggested_order,
      origen: r.origen,
      deferred_from_visit_id: r.deferred_from_visit_id,
      completed: comp.has(r.procedure_id),
      completed_at: comp.get(r.procedure_id) ?? null,
      // `?? null` y no `?? false`: sin fila en el cuadro del estudio, la sangre está SIN DEFINIR.
      draws_blood: sangre.get(r.procedure_id) ?? null,
      tiene_reporte: conReporte.has(r.procedure_id),
    })),
    error: null,
  }
}
```

Y el hook queda:

```ts
export function useVisitProcedureStatus(
  visitId: string | null,
  /** El estudio de la visita: sin él no se puede saber si el procedimiento lleva sangre (0134),
   *  porque esa marca es POR ESTUDIO y el catálogo de procedimientos es global. */
  protocolId: string | null,
) {
  return useSupabaseQuery<VisitProcedureStatus[]>(
    async (c) => (visitId ? cargarProcedimientosDeVisita(c, visitId, protocolId) : { data: [], error: null }),
    [visitId, protocolId],
  )
}

/** Lo mismo, leído una vez y fuera de un hook (el aviso al finalizar, vNNNN). */
export async function fetchVisitProcedureStatus(
  visitId: string, protocolId: string,
): Promise<{ data: VisitProcedureStatus[] | null; error: string | null }> {
  const r = await cargarProcedimientosDeVisita(supabase, visitId, protocolId)
  return { data: r.data, error: r.error ? r.error.message : null }
}
```

Conservá el comentario de encabezado del hook (el de «Lee la LISTA EFECTIVA…») encima de `cargarProcedimientosDeVisita` o del hook, donde lea mejor. Sumá `import type { PostgrestError } from '@supabase/supabase-js'` si `procedures.ts` no lo importa.

Correr: `cd "$REPO" && npm run typecheck`
Expected: puede fallar en los lugares que arman un `VisitProcedureStatus` a mano (tests o mocks). En cada uno, agregá `tiene_reporte: false` (o `true` si el caso es de un procedimiento con reporte: mirá si el test le pone reportes). Volvé a correr hasta que dé limpio.

- [ ] **Paso 2: `src/data/pendientes.ts`**

```ts
import { supabase } from '../lib/supabase'
import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { TrackVisitRow } from './visits'

/**
 * Pendientes por retomar (vNNNN, `visit_pending_procedures`): lo que una visita dejó para otro día,
 * todavía sin fecha.
 *
 * Las escrituras van por RPC (`dejar_pendientes`, `quitar_pendiente`, `continuar_pendientes`): la
 * tabla no acepta escrituras directas, y las reglas —sólo lo que la visita debe y no hizo; retomar
 * sólo lo marcado— viven en el servidor.
 */

/** Un procedimiento que una visita dejó para otro día. */
export interface MarcadoRow {
  procedure_id: string
  procedure_name: string
  /** Cuándo se marcó: da el «espera hace N días» de Pendientes. */
  marked_at: string
}

/** Lo mismo, con la visita: la lectura de todo lo que espera. */
export interface MarcaRow extends MarcadoRow {
  visit_id: string
}

/** El procedimiento va EMBEBIDO por la FK nombrada `vpp_procedimiento_fk` (ver la NNNN). */
const SELECT_MARCA = 'visit_id, procedure_id, marked_at, procedure:procedures!vpp_procedimiento_fk(name)'

function aMarcas(data: unknown): MarcaRow[] {
  return ((data ?? []) as {
    visit_id: string; procedure_id: string; marked_at: string; procedure: { name: string } | null
  }[]).map((r) => ({
    visit_id: r.visit_id,
    procedure_id: r.procedure_id,
    procedure_name: r.procedure?.name ?? 'Procedimiento',
    marked_at: r.marked_at,
  }))
}

/** Lo que ESTA visita dejó para otro día. */
export function useMarcadosDeVisita(visitId: string | null) {
  return useSupabaseQuery<MarcadoRow[]>(
    async (c) => {
      if (!visitId) return { data: [], error: null }
      const { data, error } = await c
        .from('visit_pending_procedures').select(SELECT_MARCA)
        .eq('visit_id', visitId).order('marked_at', { ascending: true })
      if (error) return { data: null, error }
      return { data: aMarcas(data), error: null }
    },
    [visitId],
  )
}

/**
 * TODO lo que espera, con sus visitas, en dos consultas: las marcas y después las visitas de esas
 * marcas (`v_track_visits`, para el título, el paciente y los filtros de Pendientes). La RLS de
 * las dos acota lo que cada quien ve. La agrupación la hace `agruparPorRetomar`, que es pura.
 */
export function usePorRetomar() {
  return useSupabaseQuery<{ marcas: MarcaRow[]; visitas: TrackVisitRow[] }>(
    async (c) => {
      const m = await c.from('visit_pending_procedures').select(SELECT_MARCA).order('marked_at', { ascending: true })
      if (m.error) return { data: null, error: m.error }
      const marcas = aMarcas(m.data)
      const ids = [...new Set(marcas.map((x) => x.visit_id))]
      if (ids.length === 0) return { data: { marcas, visitas: [] }, error: null }
      const v = await c.from('v_track_visits').select('*').in('id', ids).returns<TrackVisitRow[]>()
      if (v.error) return { data: null, error: v.error }
      return { data: { marcas, visitas: v.data ?? [] }, error: null }
    },
    [],
  )
}

/** Traduce el error de las RPC de pendientes (patrón `*ErrorMessage` del repo). */
function pendientesErrorMessage(code?: string, raw?: string): string {
  if (code === '42501') return 'No tenés permiso para cambiar las visitas de este paciente.'
  if (code === '23502') return 'La fecha es obligatoria.'
  // 23503: la visita se borró entre que se abrió la pantalla y se guardó.
  if (code === '23503') return 'Esa visita ya no existe.'
  // 23514: las RPC ya hablan en castellano y en términos del dominio.
  if (code === '23514' && raw) return raw
  return 'No pudimos guardar el cambio. Probá de nuevo.'
}

/** Deja procedimientos de una visita para otro día, sin fecha. */
export async function dejarPendientes(visitId: string, procedureIds: string[]): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('dejar_pendientes', { p_visit_id: visitId, p_procedure_ids: procedureIds })
  return { error: error ? pendientesErrorMessage(error.code, error.message) : null }
}

/** «Se hace hoy»: saca la marca y el procedimiento vuelve a la visita. */
export async function quitarPendiente(visitId: string, procedureId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('quitar_pendiente', { p_visit_id: visitId, p_procedure_id: procedureId })
  return { error: error ? pendientesErrorMessage(error.code, error.message) : null }
}

/** Retoma lo marcado en una continuación con fecha. Devuelve el id de la continuación. */
export async function continuarPendientes(
  visitaOrigen: string, procedureIds: string[], fecha: string,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('continuar_pendientes', {
    p_visita_origen: visitaOrigen, p_procedure_ids: procedureIds, p_fecha: fecha,
  })
  if (error) return { id: null, error: pendientesErrorMessage(error.code, error.message) }
  return { id: data as string, error: null }
}
```

- [ ] **Paso 3: El origen del retest al agendar**

En `src/data/visitEvents.ts`, `registerVisitEvent`:

```ts
/**
 * Registra una visita suelta. El retest y la VNP pueden llevar procedimientos del estudio
 * (v0144); el retest, al menos uno. Desde la NNNN el retest lleva la visita que repite
 * (`retestOf`), y sólo lo que se hizo en ella. Las reglas las valida el RPC server-side.
 */
export async function registerVisitEvent(
  enrollmentId: string, kind: VisitKind, date: string, notes: string | null, procedureIds: string[] = [],
  retestOf: string | null = null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('register_visit_event', {
    p_enrollment_id: enrollmentId, p_kind: kind, p_date: date, p_notes: notes, p_procedure_ids: procedureIds,
    p_retest_of: retestOf,
  })
  if (error) return { error: eventError(error.code, error.message) }
  return { error: null }
}
```

En `deleteVisitEvent`, actualizá el comentario del `23514`: «…Deshacé primero esa continuación.», «…Borralo primero.» (retest, NNNN) o «…marcados como realizados…».

- [ ] **Paso 4: Correr y commit**

```bash
cd "$REPO" && npm run typecheck && npx vitest run
```
Expected: tsc limpio, 0 fallas.
```bash
cd "$REPO" && git add src/data/procedures.ts src/data/pendientes.ts src/data/visitEvents.ts && git commit -m "feat(datos): marcas para otro día, lectura suelta de procedimientos y origen del retest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Sumá al `git add` cualquier test que hayas tocado en el Paso 1.)

---

### Tarea 9: Las reglas puras

**Files:**
- Create: `src/views/track/retomar.ts`
- Test: `src/views/track/retomar.test.ts`

**Interfaces:**
- Consumes: `MarcaRow` (Tarea 8), `TrackVisitRow`, `inscripcionCerrada` (`src/data/deviationModel.ts`), `daysDiffISO`, `isoDayAR`, `formatAR` (`src/lib/dates.ts`), `visitTitle`.
- Produces (todas puras):
  - `interface ProcedimientoConEstado { procedure_id: string; name: string; completed: boolean; tiene_reporte: boolean }`
  - `interface ProcedimientoElegible { procedure_id: string; name: string }`
  - `pendientesAlFinalizar(items: readonly ProcedimientoConEstado[]): ProcedimientoElegible[]`
  - `procedimientosRepetibles(items: readonly ProcedimientoConEstado[], atendida: boolean): ProcedimientoElegible[]`
  - `const DIAS_DEL_RETEST = 60`
  - `visitasParaRetest(visitas: readonly TrackVisitRow[], hoy: string, dias?: number): TrackVisitRow[]`
  - `visitasParaTraer(visitas: readonly TrackVisitRow[], dia: string): TrackVisitRow[]`
  - `interface VisitaPorRetomar { visita: TrackVisitRow; procedimientos: ProcedimientoElegible[]; desde: string }`
  - `agruparPorRetomar(marcas: readonly MarcaRow[], visitas: readonly TrackVisitRow[]): VisitaPorRetomar[]`
  - `diasEsperando(desde: string, hoy: string): number`
  - `interface PacienteDelEstudio { enrollment_id: string; patient_name: string; patient_code: string | null }`
  - `pacientesDelEstudio(visitas: readonly TrackVisitRow[]): PacienteDelEstudio[]`
  - `rotuloDeVisita(v: TrackVisitRow): string` — «V3 W4 · Juan Pérez · 12/9/2026»

- [ ] **Paso 1: Los tests que fallan**

Crear `src/views/track/retomar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { TrackVisitRow } from '../../data/visits'
import type { MarcaRow } from '../../data/pendientes'
import {
  agruparPorRetomar, diasEsperando, pacientesDelEstudio, pendientesAlFinalizar, procedimientosRepetibles,
  visitasParaRetest, visitasParaTraer,
} from './retomar'

/**
 * Las reglas de «pendientes por retomar» y del retest con origen (vNNNN).
 *
 * Todas fallan EN SILENCIO si quedan al revés: un aviso al finalizar que salta en cada visita (o en
 * ninguna), un retest que ofrece lo que no se hizo, una lista de Pendientes que esconde o que
 * repite. Nada de eso se ve roto; se ve «raro», y lo raro no se reporta.
 *
 * Sin base y sin navegador: son funciones puras.
 */

const p = (procedure_id: string, completed: boolean, tiene_reporte: boolean) =>
  ({ procedure_id, name: procedure_id.toUpperCase(), completed, tiene_reporte })

const v = (campos: Partial<TrackVisitRow>) => ({
  id: 'v', enrollment_id: 'e1', kind: 'programada', visit_def_id: 'd', estimated_date: null, real_date: null,
  window_start: null, window_end: null, no_show_at: null, computed_status: 'proxima',
  enrollment_status: 'activo', patient_name: 'Ana', patient_code: 'A-1', protocol_id: 'p1',
  visit_code: null, visit_name: 'V3', ...campos,
}) as TrackVisitRow

describe('pendientesAlFinalizar', () => {
  it('lista sólo lo que tiene reporte y no se tildó', () => {
    const r = pendientesAlFinalizar([p('lab', false, true), p('hem', true, true), p('vit', false, false)])
    expect(r.map((x) => x.procedure_id)).toEqual(['lab'])
  })
  it('un procedimiento sin reporte nunca dispara el aviso', () => {
    expect(pendientesAlFinalizar([p('vit', false, false), p('ecg', false, false)])).toEqual([])
  })
})

describe('procedimientosRepetibles', () => {
  it('lo tildado y lo sin reporte, si la visita se atendió', () => {
    const r = procedimientosRepetibles([p('lab', true, true), p('hem', false, true), p('vit', false, false)], true)
    expect(r.map((x) => x.procedure_id)).toEqual(['lab', 'vit'])
  })
  it('nada si la visita no se atendió', () => {
    expect(procedimientosRepetibles([p('lab', true, true), p('vit', false, false)], false)).toEqual([])
  })
})

describe('visitasParaRetest', () => {
  const hoy = '2026-09-27'
  it('atendidas en los últimos 60 días, la más reciente primero', () => {
    const r = visitasParaRetest([
      v({ id: 'a', real_date: '2026-09-20' }),
      v({ id: 'b', real_date: '2026-09-25' }),
      v({ id: 'vieja', real_date: '2026-07-28' }),  // 61 días
      v({ id: 'limite', real_date: '2026-07-29' }), // 60 días: entra
      v({ id: 'sin', real_date: null }),
      v({ id: 'futura', real_date: '2026-09-30' }),
    ], hoy)
    expect(r.map((x) => x.id)).toEqual(['b', 'a', 'limite'])
  })
  it('deja afuera las inscripciones cerradas', () => {
    expect(visitasParaRetest([v({ id: 'c', real_date: '2026-09-20', enrollment_status: 'discontinuado' })], hoy)).toEqual([])
  })
})

describe('visitasParaTraer', () => {
  const dia = '2026-09-27'
  it('las próximas agendadas para después del día, por fecha', () => {
    const r = visitasParaTraer([
      v({ id: 'b', estimated_date: '2026-10-05' }),
      v({ id: 'a', estimated_date: '2026-10-02' }),
      v({ id: 'hoy', estimated_date: '2026-09-27' }),                         // ya es de este día
      v({ id: 'antes', estimated_date: '2026-09-20' }),
      v({ id: 'hecha', estimated_date: '2026-10-01', real_date: '2026-09-26' }),
      v({ id: 'falto', estimated_date: '2026-10-01', no_show_at: '2026-09-26T10:00:00+00:00' }),
      v({ id: 'vencida', estimated_date: '2026-10-01', computed_status: 'ventana_vencida' }),
      v({ id: 'cerrada', estimated_date: '2026-10-01', enrollment_status: 'completado' }),
      v({ id: 'sinfecha', estimated_date: null }),
    ], dia)
    expect(r.map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('agruparPorRetomar', () => {
  // El formato de fecha es el que devuelve PostgREST: con `+00:00`, no `-03:00` (ver el gotcha del
  // test con el dato de la forma equivocada).
  const m = (visit_id: string, procedure_id: string, marked_at: string): MarcaRow =>
    ({ visit_id, procedure_id, procedure_name: procedure_id.toUpperCase(), marked_at })

  it('una fila por visita, la que espera hace más primero, con la marca más vieja como «desde»', () => {
    const r = agruparPorRetomar(
      [m('v1', 'lab', '2026-09-20T13:00:00+00:00'), m('v2', 'ecg', '2026-09-18T13:00:00+00:00'), m('v1', 'hem', '2026-09-19T13:00:00+00:00')],
      [v({ id: 'v1', patient_name: 'Ana' }), v({ id: 'v2', patient_name: 'Beto' })],
    )
    expect(r.map((g) => g.visita.id)).toEqual(['v2', 'v1'])
    expect(r[1].procedimientos.map((x) => x.procedure_id)).toEqual(['hem', 'lab'])
    expect(r[1].desde).toBe('2026-09-19T13:00:00+00:00')
  })
  it('una marca sin su visita (la RLS no la deja ver) no arma fila', () => {
    expect(agruparPorRetomar([m('v9', 'lab', '2026-09-20T13:00:00+00:00')], [])).toEqual([])
  })
  it('una inscripción cerrada no aparece: no se puede descartar y quedaría para siempre', () => {
    expect(agruparPorRetomar([m('v1', 'lab', '2026-09-20T13:00:00+00:00')], [v({ id: 'v1', enrollment_status: 'completado' })])).toEqual([])
  })
})

describe('diasEsperando', () => {
  it('cuenta en días argentinos', () => {
    // 01:30 UTC del 20 es todavía el 19 en Argentina.
    expect(diasEsperando('2026-09-20T01:30:00+00:00', '2026-09-27')).toBe(8)
    expect(diasEsperando('2026-09-27T15:00:00+00:00', '2026-09-27')).toBe(0)
  })
})

describe('pacientesDelEstudio', () => {
  it('uno por inscripción, sin las cerradas, por nombre', () => {
    const r = pacientesDelEstudio([
      v({ id: '1', enrollment_id: 'e2', patient_name: 'Beto' }),
      v({ id: '2', enrollment_id: 'e1', patient_name: 'Ana' }),
      v({ id: '3', enrollment_id: 'e2', patient_name: 'Beto' }),
      v({ id: '4', enrollment_id: 'e3', patient_name: 'Carla', enrollment_status: 'discontinuado' }),
    ])
    expect(r.map((x) => x.enrollment_id)).toEqual(['e1', 'e2'])
  })
})
```

Correr: `cd "$REPO" && npx vitest run src/views/track/retomar.test.ts`
Expected: FALLA — `Failed to resolve import "./retomar"`.

- [ ] **Paso 2: Las reglas**

Crear `src/views/track/retomar.ts`:

```ts
import type { TrackVisitRow } from '../../data/visits'
import type { MarcaRow } from '../../data/pendientes'
import { inscripcionCerrada } from '../../data/deviationModel'
import { daysDiffISO, formatAR, isoDayAR } from '../../lib/dates'
import { visitTitle } from '../../lib/visits'

/**
 * Reglas puras de «pendientes por retomar» y del retest con origen (vNNNN). Tienen test
 * (`retomar.test.ts`): todas fallan en silencio si quedan al revés.
 *
 * «HECHO» (decisión 9 del spec): en la app sólo se tildan los procedimientos que dejan reporte. Uno
 * sin reporte no tiene casilla en ningún lado, así que se da por hecho cuando la visita se atendió.
 * Es la misma regla que `procedimiento_hecho()` en la base, que es la que manda: ésta sólo decide
 * qué se OFRECE, para no ofrecer algo que el servidor rechazaría.
 */

/** Lo que estas reglas necesitan de un procedimiento de la visita (`VisitProcedureStatus` lo cumple). */
export interface ProcedimientoConEstado {
  procedure_id: string
  name: string
  completed: boolean
  tiene_reporte: boolean
}

/** Un procedimiento que se puede elegir en una lista de casillas. */
export interface ProcedimientoElegible {
  procedure_id: string
  name: string
}

const elegible = ({ procedure_id, name }: ProcedimientoConEstado): ProcedimientoElegible => ({ procedure_id, name })

/**
 * Lo que dispara el aviso al finalizar: lo que deja reporte y no se tildó. Uno sin reporte nunca lo
 * dispara — casi todas las visitas llevan alguno (signos vitales), y el aviso saltaría siempre.
 */
export function pendientesAlFinalizar(items: readonly ProcedimientoConEstado[]): ProcedimientoElegible[] {
  return items.filter((p) => p.tiene_reporte && !p.completed).map(elegible)
}

/** Lo que un retest puede repetir de su visita de origen: lo que se hizo ahí. */
export function procedimientosRepetibles(items: readonly ProcedimientoConEstado[], atendida: boolean): ProcedimientoElegible[] {
  if (!atendida) return []
  return items.filter((p) => p.completed || !p.tiene_reporte).map(elegible)
}

/** Hasta cuántos días atrás se ofrece una visita como origen de un retest (decisión 8 del spec). */
export const DIAS_DEL_RETEST = 60

/** Las visitas que se pueden repetir: atendidas en los últimos `dias`, la más reciente primero. */
export function visitasParaRetest(visitas: readonly TrackVisitRow[], hoy: string, dias = DIAS_DEL_RETEST): TrackVisitRow[] {
  return visitas
    .filter((v) => {
      if (v.real_date === null || inscripcionCerrada(v.enrollment_status)) return false
      const hace = daysDiffISO(v.real_date, hoy)
      return hace >= 0 && hace <= dias
    })
    .sort((a, b) => (b.real_date ?? '').localeCompare(a.real_date ?? '') || a.patient_name.localeCompare(b.patient_name, 'es'))
}

/**
 * «Una visita del estudio» (decisión 7 del spec): las próximas ya agendadas para DESPUÉS del día que
 * se mira. Sin las faltas ni las de ventana vencida: ésas tienen su propia salida (Pendientes).
 */
export function visitasParaTraer(visitas: readonly TrackVisitRow[], dia: string): TrackVisitRow[] {
  return visitas
    .filter((v) => v.real_date === null && v.no_show_at === null && v.estimated_date !== null
      && v.estimated_date > dia && v.computed_status !== 'ventana_vencida' && !inscripcionCerrada(v.enrollment_status))
    .sort((a, b) => (a.estimated_date ?? '').localeCompare(b.estimated_date ?? '') || a.patient_name.localeCompare(b.patient_name, 'es'))
}

/** Una visita con lo que dejó para otro día. */
export interface VisitaPorRetomar {
  visita: TrackVisitRow
  procedimientos: ProcedimientoElegible[]
  /** La marca más vieja: desde cuándo espera. */
  desde: string
}

/**
 * Agrupa las marcas por visita. Deja afuera:
 *  · una marca cuya visita no llegó (la RLS de `v_track_visits` no la deja ver): sin visita no hay
 *    fila que dibujar;
 *  · las inscripciones cerradas: con el paciente fuera del estudio no hay nada que retomar, y como
 *    la fila no se puede descartar quedaría para siempre.
 */
export function agruparPorRetomar(marcas: readonly MarcaRow[], visitas: readonly TrackVisitRow[]): VisitaPorRetomar[] {
  const porId = new Map(visitas.map((v) => [v.id, v]))
  const acc = new Map<string, VisitaPorRetomar>()
  for (const m of marcas) {
    const visita = porId.get(m.visit_id)
    if (!visita || inscripcionCerrada(visita.enrollment_status)) continue
    const g = acc.get(m.visit_id) ?? { visita, procedimientos: [], desde: m.marked_at }
    g.procedimientos.push({ procedure_id: m.procedure_id, name: m.procedure_name })
    // ISO con el mismo huso (PostgREST devuelve `+00:00`): se compara como texto.
    if (m.marked_at < g.desde) g.desde = m.marked_at
    acc.set(m.visit_id, g)
  }
  const out = [...acc.values()]
  for (const g of out) g.procedimientos.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return out.sort((a, b) => a.desde.localeCompare(b.desde) || a.visita.patient_name.localeCompare(b.visita.patient_name, 'es'))
}

/** Hace cuántos días espera, contando en días argentinos (la marca es un timestamptz). */
export function diasEsperando(desde: string, hoy: string): number {
  return Math.max(0, daysDiffISO(isoDayAR(desde), hoy))
}

/** Un paciente del estudio, para elegirlo en una VNP. */
export interface PacienteDelEstudio {
  enrollment_id: string
  patient_name: string
  patient_code: string | null
}

/** Uno por inscripción, sin las cerradas, por nombre. Sale de las visitas del estudio. */
export function pacientesDelEstudio(visitas: readonly TrackVisitRow[]): PacienteDelEstudio[] {
  const acc = new Map<string, PacienteDelEstudio>()
  for (const v of visitas) {
    if (inscripcionCerrada(v.enrollment_status) || acc.has(v.enrollment_id)) continue
    acc.set(v.enrollment_id, { enrollment_id: v.enrollment_id, patient_name: v.patient_name, patient_code: v.patient_code })
  }
  return [...acc.values()].sort((a, b) => a.patient_name.localeCompare(b.patient_name, 'es'))
}

/** «V3 W4 · Juan Pérez · 12/9/2026»: cómo se nombra una visita en los desplegables de agendar. */
export function rotuloDeVisita(v: TrackVisitRow): string {
  const fecha = v.real_date ?? v.estimated_date
  return `${visitTitle(v)} · ${v.patient_name}${fecha ? ` · ${formatAR(fecha)}` : ''}`
}
```

- [ ] **Paso 3: Correr**

```bash
cd "$REPO" && npx vitest run src/views/track/retomar.test.ts
```
Expected: PASS. Si `diasEsperando` da 7 en vez de 8, `isoDayAR` no se está aplicando (la marca de las 01:30 UTC del 20 es del 19 en Argentina).

- [ ] **Paso 4: Commit**

```bash
cd "$REPO" && git add src/views/track/retomar.ts src/views/track/retomar.test.ts && git commit -m "feat(coordinacion): reglas puras de pendientes por retomar y del retest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 10: El aviso al finalizar la atención

**Files:**
- Create: `src/views/track/CasillasDeProcedimientos.tsx`, `src/views/track/AvisoPendientesModal.tsx`, `src/views/track/useAvisoAlFinalizar.tsx`
- Modify: `src/views/DayVisitsView.tsx:268-292` (`advance`) y el render
- Modify: `src/views/track/VisitDetail.tsx:207-249` (`ejecutar`) y el render

**Interfaces:**
- Consumes: `fetchVisitProcedureStatus` y `toggleVisitProcedure` (`src/data/procedures.ts`, Tarea 8), `dejarPendientes` (Tarea 8), `pendientesAlFinalizar`, `ProcedimientoElegible` (Tarea 9).
- Produces:
  - `CasillasDeProcedimientos({ items, elegidos, onChange, accent }: { items: readonly ProcedimientoElegible[]; elegidos: ReadonlySet<string>; onChange: (next: Set<string>) => void; accent: string })`
  - `useAvisoAlFinalizar(accent: string): { pedir: (visit: { id: string; protocol_id: string }, seguir: () => Promise<void> | void) => Promise<void>; modal: ReactNode }` — `pedir` resuelve cuando el flujo TERMINA (se finalizó o se canceló), no cuando se abre el modal.

- [ ] **Paso 1: Las casillas compartidas**

Crear `src/views/track/CasillasDeProcedimientos.tsx`:

```tsx
import type { ProcedimientoElegible } from './retomar'

/**
 * Una lista de casillas de procedimientos, sin preselección propia: quien la usa decide qué viene
 * tildado. La comparten el aviso al finalizar, «Dejar para otro día», «Continuar pendientes» y el
 * retest (vNNNN) — cuatro modales que eligen procedimientos igual y tienen que verse igual.
 */
export function CasillasDeProcedimientos({ items, elegidos, onChange, accent }: {
  items: readonly ProcedimientoElegible[]
  elegidos: ReadonlySet<string>
  onChange: (next: Set<string>) => void
  accent: string
}) {
  const alternar = (id: string) => {
    const next = new Set(elegidos)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {items.map((p) => (
        <label key={p.procedure_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 13.5, color: 'var(--spira-ink)', cursor: 'pointer' }}>
          <input type="checkbox" checked={elegidos.has(p.procedure_id)} onChange={() => alternar(p.procedure_id)} style={{ accentColor: accent }} />
          {p.name}
        </label>
      ))}
    </div>
  )
}
```

- [ ] **Paso 2: El modal del aviso**

Se tilda lo que **se hizo**, no lo que queda (corrección del Director sobre el mock, 2026-09-27). Dos pasos: «¿Qué se hizo?» y, si quedó algo sin tildar, el aviso de lo que va a quedar pendiente. Sin «Finalizar sin pasarlos».

Crear `src/views/track/AvisoPendientesModal.tsx`:

```tsx
import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { FormField } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { CasillasDeProcedimientos } from './CasillasDeProcedimientos'
import type { ProcedimientoElegible } from './retomar'

/**
 * El aviso al tocar «Finalizar atención» con procedimientos que dejan reporte sin tildar (v0145).
 *
 * SE TILDA LO QUE SE HIZO, no lo que queda (Director, 2026-09-27: «vos marcás los que sí hiciste y
 * si le das a continuar avisa que estos van a quedar pendientes»). Es la misma pregunta que ya hace
 * la visita —¿qué se hizo?—, así que tildar acá es tildar de verdad: arranca el plazo del reporte.
 * Lo que queda sin tildar pasa a «para otro día», con un segundo paso que lo nombra antes de
 * finalizar: marcar algo como pendiente sin decirlo sería la postergación silenciosa que esto viene
 * a evitar. No hay «finalizar sin pasarlos»: lo que no se hizo, queda.
 *
 * Mientras guarda no se cierra: un Esc a mitad de camino dejaría tildes o marcas puestas sin
 * finalizar. Cerrar antes de «Finalizar» cancela todo: no se tilda ni se marca nada.
 */
export function AvisoPendientesModal({ pendientes, accent, onFinalizar, onClose }: {
  pendientes: readonly ProcedimientoElegible[]
  accent: string
  /** Tilda `hechos`, deja el resto para otro día y finaliza. Devuelve el error a mostrar, o `null`. */
  onFinalizar: (hechos: string[]) => Promise<string | null>
  onClose: () => void
}) {
  const [hechos, setHechos] = useState<Set<string>>(new Set())
  const [paso, setPaso] = useState<'hechos' | 'aviso'>('hechos')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const quedan = pendientes.filter((p) => !hechos.has(p.procedure_id))

  const finalizar = async () => {
    setBusy(true); setError(null)
    const e = await onFinalizar([...hechos])
    setBusy(false)
    if (e) setError(e)
  }
  const continuar = () => {
    if (quedan.length === 0) { void finalizar(); return }
    setPaso('aviso')
  }

  const errorBox = error && (
    <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
  )
  const primario = { ...btnPrimary(accent), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }

  return (
    <Modal
      title={paso === 'hechos' ? 'Esta visita tiene procedimientos sin marcar' : 'Van a quedar pendientes'}
      subtitle={paso === 'hechos'
        ? 'Marcá los que se hicieron. Lo que no marques queda para otro día.'
        : 'Estos procedimientos quedan para otro día. Los vas a encontrar en Pendientes.'}
      onClose={busy ? () => {} : onClose}
      maxWidth={480}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {paso === 'hechos' ? (
          <FormField label="¿Qué se hizo?">
            <CasillasDeProcedimientos items={pendientes} elegidos={hechos} onChange={setHechos} accent={accent} />
          </FormField>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, color: 'var(--spira-ink)' }}>
            {quedan.map((p) => <li key={p.procedure_id}>{p.name}</li>)}
          </ul>
        )}
        {errorBox}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          {paso === 'hechos' ? (
            <>
              <button type="button" onClick={onClose} disabled={busy} style={btnOutline}>Cancelar</button>
              <button type="button" onClick={continuar} disabled={busy} style={primario}>
                {busy ? 'Guardando…' : 'Continuar'}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { setPaso('hechos'); setError(null) }} disabled={busy} style={btnOutline}>Volver</button>
              <button type="button" onClick={() => void finalizar()} disabled={busy} style={primario}>
                {busy ? 'Guardando…' : 'Finalizar'}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Paso 3: El hook que lo orquesta**

Crear `src/views/track/useAvisoAlFinalizar.tsx`:

```tsx
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchVisitProcedureStatus, toggleVisitProcedure } from '../../data/procedures'
import { dejarPendientes } from '../../data/pendientes'
import { pendientesAlFinalizar } from './retomar'
import type { ProcedimientoElegible } from './retomar'
import { AvisoPendientesModal } from './AvisoPendientesModal'

interface Aviso {
  visitId: string
  pendientes: ProcedimientoElegible[]
  seguir: () => Promise<void> | void
  /** Resuelve la promesa de `pedir`: el flujo terminó, se haya finalizado o no. */
  terminar: () => void
}

/**
 * El aviso al finalizar (v0145), para los DOS lugares desde donde se finaliza: la fila de Visitas y
 * el detalle de la visita. La regla de «hay pendientes» es una sola (`pendientesAlFinalizar`); acá
 * sólo se decide cuándo preguntar y qué hacer con la respuesta.
 *
 * `pedir` resuelve cuando el flujo TERMINA, no cuando se abre el modal: quien lo llama (el detalle
 * de la visita) refresca al volver, y si volviera antes de que la persona elija, refrescaría una
 * visita que todavía no se finalizó.
 *
 * El orden al finalizar es tildes → marcas → avance, y cada paso corta si falla: no se finaliza con
 * algo a medio guardar. Reintentar no vuelve a tildar lo ya tildado (`yaTildados`), que el servidor
 * rechazaría como duplicado.
 *
 * Si la lectura inicial falla, FINALIZA igual (falla abierta). El aviso es una ayuda, no una guarda:
 * frenar el cierre de la atención porque no se pudo leer la lista cortaría el recorrido del día.
 */
export function useAvisoAlFinalizar(accent: string): {
  pedir: (visit: { id: string; protocol_id: string }, seguir: () => Promise<void> | void) => Promise<void>
  modal: ReactNode
} {
  const [aviso, setAviso] = useState<Aviso | null>(null)
  /** Lo tildado desde este aviso, por si un paso posterior falla y se reintenta. */
  const yaTildados = useRef<Set<string>>(new Set())

  const pedir = async (visit: { id: string; protocol_id: string }, seguir: () => Promise<void> | void) => {
    const r = await fetchVisitProcedureStatus(visit.id, visit.protocol_id)
    const pendientes = r.data ? pendientesAlFinalizar(r.data) : []
    if (pendientes.length === 0) { await seguir(); return }
    yaTildados.current = new Set()
    await new Promise<void>((resolve) => setAviso({ visitId: visit.id, pendientes, seguir, terminar: resolve }))
  }

  const modal = aviso && (
    <AvisoPendientesModal
      pendientes={aviso.pendientes}
      accent={accent}
      onFinalizar={async (hechos) => {
        for (const id of hechos) {
          if (yaTildados.current.has(id)) continue
          const t = await toggleVisitProcedure(aviso.visitId, id, true)
          if (t.error) return t.error
          yaTildados.current.add(id)
        }
        const quedan = aviso.pendientes.map((p) => p.procedure_id).filter((id) => !hechos.includes(id))
        if (quedan.length > 0) {
          const res = await dejarPendientes(aviso.visitId, quedan)
          if (res.error) return res.error
        }
        setAviso(null)
        await aviso.seguir()
        aviso.terminar()
        return null
      }}
      onClose={() => { setAviso(null); aviso.terminar() }}
    />
  )

  return { pedir, modal }
}
```

Ojo con un caso: si se reintenta después de que `dejarPendientes` falló, y en el medio la persona **destildó** en el paso 1 algo que ya se había tildado, ese tilde queda puesto (el aviso no destilda). Es aceptable —se ve en la visita y se destilda ahí—, pero dejalo dicho en una línea del comentario de `yaTildados`.

- [ ] **Paso 4: En Visitas**

En `src/views/DayVisitsView.tsx`:

1. Import: `import { useAvisoAlFinalizar } from './track/useAvisoAlFinalizar'`.
2. Después de `const { canReception, canClinical, loading: permisosCargando } = useVisitPermissions()`: `const aviso = useAvisoAlFinalizar(accentSolid)`.
3. Renombrá la función `advance` actual a `avanzar` (mismo cuerpo, mismo comentario encima) y agregá debajo:

```ts
  /* Finalizar pasa antes por el aviso de pendientes (vNNNN): si la visita tiene procedimientos con
     reporte sin tildar, se pregunta si quedan para otro día. El resto de las etapas, derecho. La fila
     queda ocupada mientras se lee la lista, para que un doble clic no pida dos veces. */
  const advance = async (visit: DayVisitRow, next: OperationalStage) => {
    if (next !== 'fin_atencion') { await avanzar(visit, next); return }
    setBusyId(visit.id)
    await aviso.pedir(visit, () => { setBusyId(null); return avanzar(visit, next) })
    setBusyId(null)
  }
```

4. En el render, junto a los otros modales del final (después del bloque `{doctorFor && (…)}`): `{aviso.modal}`.

`advance` sigue siendo lo que reciben la fila (`onAdvance={advance}`) y el detalle (`onAdvance={advance}`): no cambies esos dos props.

- [ ] **Paso 5: En el detalle de la visita**

En `src/views/track/VisitDetail.tsx`:

1. Import: `import { useAvisoAlFinalizar } from './useAvisoAlFinalizar'`.
2. Después de `const [versionProcedimientos, …]`: `const aviso = useAvisoAlFinalizar(accent)`.
3. Renombrá la función `ejecutar` actual a `avanzarAhora` (mismo cuerpo) y agregá debajo:

```ts
  /**
   * Finalizar pasa antes por el aviso de pendientes (vNNNN). Si el padre pasó `onAdvance` (Visitas),
   * el aviso lo pone ÉL —ya lo hace en su `advance`— y acá no se pregunta dos veces.
   */
  const ejecutar = async (next: OperationalStage) => {
    if (!visit) return
    if (next === 'fin_atencion' && !onAdvance) {
      setConfirmando(null)
      setBusy(true)
      await aviso.pedir(visit, () => avanzarAhora(next))
      setBusy(false)
      return
    }
    await avanzarAhora(next)
  }
```

4. En el render, junto a los modales que van FUERA del backdrop (después de `{confirmando && visit && (…)}`): `{aviso.modal}`.

- [ ] **Paso 6: Correr**

```bash
cd "$REPO" && npm run typecheck && npx vitest run
```
Expected: tsc limpio y 0 fallas. El comportamiento se verifica en el QA de la Tarea 15 (es visible: no lleva test).

- [ ] **Paso 7: Commit**

```bash
cd "$REPO" && git add src/views/track/CasillasDeProcedimientos.tsx src/views/track/AvisoPendientesModal.tsx src/views/track/useAvisoAlFinalizar.tsx src/views/DayVisitsView.tsx src/views/track/VisitDetail.tsx && git commit -m "feat(coordinacion): aviso de pendientes al finalizar la atención

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 11: La visita de origen — «Dejar para otro día» y «Se hace hoy»

**Files:**
- Rename + rewrite: `src/views/track/PasarPendientesModal.tsx` → `src/views/track/DejarParaOtroDiaModal.tsx`
- Modify: `src/views/track/DesdoblamientoVisita.tsx`
- Modify: `src/views/track/VisitProcedures.tsx`
- Modify: `src/views/track/VisitDetail.tsx` (el prop `fechaVisita` que deja de usarse)

**Interfaces:**
- Consumes: `useMarcadosDeVisita`, `quitarPendiente`, `dejarPendientes`, `MarcadoRow` (Tarea 8); `CasillasDeProcedimientos` (Tarea 10).
- Produces: `DejarParaOtroDiaModal({ visitId, pendientes, accent, onClose, onDone })`; `DesdoblamientoVisita` con props nuevas `marcados: readonly MarcadoRow[]`, `quitando: string | null`, `onSeHaceHoy: (procedureId: string) => void`, `error?: string | null`.

- [ ] **Paso 1: El modal sin fecha**

```bash
cd "$REPO" && git mv src/views/track/PasarPendientesModal.tsx src/views/track/DejarParaOtroDiaModal.tsx
```

Reemplazá el contenido de `src/views/track/DejarParaOtroDiaModal.tsx`:

```tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { FormField } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { dejarPendientes } from '../../data/pendientes'
import { CasillasDeProcedimientos } from './CasillasDeProcedimientos'
import type { ProcedimientoElegible } from './retomar'

/**
 * «Dejar para otro día» (vNNNN; antes «Pasar pendientes a otro día», 0144, que pedía la fecha): marca
 * lo elegido como pendiente, SIN fecha. La fecha la pone la continuación el día que se retoma, desde
 * «Agendar visita → Continuar pendientes». Ninguna casilla viene marcada: se elige a propósito.
 * Sirve también antes de la visita («ya se sabe que va en dos días»).
 */
export function DejarParaOtroDiaModal({ visitId, pendientes, accent, onClose, onDone }: {
  visitId: string
  pendientes: readonly ProcedimientoElegible[]
  accent: string
  onClose: () => void
  onDone: () => void
}) {
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (elegidos.size === 0) { setError('Elegí qué procedimientos quedan para otro día.'); return }
    setBusy(true)
    setError(null)
    const res = await dejarPendientes(visitId, [...elegidos])
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone()
  }

  return (
    <Modal
      title="Dejar para otro día"
      subtitle="Quedan pendientes hasta que se retomen. Esta visita cierra con lo que se hizo."
      onClose={onClose}
      maxWidth={480}
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="¿Qué queda para otro día?">
          <CasillasDeProcedimientos items={pendientes} elegidos={elegidos} onChange={setElegidos} accent={accent} />
        </FormField>
        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accent), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Guardando…' : 'Dejar para otro día'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Paso 2: El bloque de lo marcado**

En `src/views/track/DesdoblamientoVisita.tsx`:

1. Import: `import type { MarcadoRow } from '../../data/pendientes'`.
2. Sumá a las props (y a la desestructuración) `marcados`, `quitando`, `onSeHaceHoy`:

```ts
  /** Lo que esta visita dejó para otro día, sin fecha todavía (vNNNN). */
  marcados: readonly MarcadoRow[]
  /** El procedimiento cuya marca se está quitando, para no dejar apretar dos veces. */
  quitando: string | null
  /** «Se hace hoy»: saca la marca y el procedimiento vuelve a la visita. */
  onSeHaceHoy: (procedureId: string) => void
```

3. La condición del `return null` suma lo marcado: `if (!origenVisitId && destinos.length === 0 && marcados.length === 0 && !hayAcciones) return null`.
4. Antes de `{destinos.map(…)}`, el bloque:

```tsx
      {marcados.length > 0 && (
        <div style={caja}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Icon name="clock" size={15} color="var(--spira-muted)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}>
              Queda para otro día · {marcados.length} {marcados.length === 1 ? 'procedimiento' : 'procedimientos'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            {marcados.map((m) => (
              <div key={m.procedure_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>{m.procedure_name}</span>
                {!readOnly && (
                  <button type="button" style={btnChico} disabled={quitando === m.procedure_id} onClick={() => onSeHaceHoy(m.procedure_id)}>
                    {quitando === m.procedure_id ? 'Quitando…' : 'Se hace hoy'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
```

5. El botón de acción cambia de rótulo: `Pasar pendientes a otro día` → `Dejar para otro día`.
6. En el comentario de cabecera del componente, sumá: «· lo que esta visita dejó para otro día, sin fecha, con su «Se hace hoy» (vNNNN)».

- [ ] **Paso 3: El contenedor**

En `src/views/track/VisitProcedures.tsx`:

1. Imports: cambiá `import { PasarPendientesModal } from './PasarPendientesModal'` por `import { DejarParaOtroDiaModal } from './DejarParaOtroDiaModal'`, y sumá `import { useMarcadosDeVisita, quitarPendiente } from '../../data/pendientes'`.
2. Sacá `fechaVisita` de las props y de su tipo (con su comentario): el modal ya no pide fecha.
3. Después de `const diferidos = useDiferidosDeVisita(visitId)`:

```ts
  /* Lo que esta visita dejó para otro día (vNNNN). Ya no está en la lista efectiva (`items`): la
     vista lo resta. Se lee aparte para mostrarlo en gris con su «Se hace hoy». */
  const marcados = useMarcadosDeVisita(visitId)
  const [quitando, setQuitando] = useState<string | null>(null)
```

4. Sumá `marcados.refetch()` en los TRES lugares donde hoy se hace `diferidos.refetch()`: el efecto de foco (y a sus deps, `marcados.refetch`), el de `refrescarCuando`, y `alCambiar`.
5. El handler, junto a `moverReporte`:

```ts
  /** «Se hace hoy»: saca la marca; el procedimiento vuelve a la lista y se puede tildar. */
  const seHaceHoy = async (procedureId: string) => {
    if (quitando) return
    setQuitando(procedureId)
    setActionError(null)
    const res = await quitarPendiente(visitId, procedureId)
    setQuitando(null)
    if (res.error) { setActionError(res.error); return }
    alCambiar()
  }
```

6. En `<DesdoblamientoVisita …>` sumá `marcados={marcados.data ?? []}`, `quitando={quitando}` y `onSeHaceHoy={(id) => void seHaceHoy(id)}`.
7. Reemplazá el bloque `{modal === 'pasar' && (<PasarPendientesModal … />)}` por:

```tsx
      {modal === 'pasar' && (
        <DejarParaOtroDiaModal
          visitId={visitId}
          pendientes={pendientes}
          accent={accent}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); alCambiar() }}
        />
      )}
```

8. El error de «Se hace hoy» se muestra donde ya se muestran los del tilde (`actionError` baja a `ReportesPendientes`). Si el procedimiento no tiene reporte, ese panel puede no estar a la vista: pasale también `actionError` al pie. Sumá a `DesdoblamientoVisita` un prop opcional `error?: string | null` y dibujalo arriba de los botones con el mismo estilo de error de los modales; pasale `error={actionError}`.

En `src/views/track/VisitDetail.tsx`, en el `<VisitProcedures …>`, sacá el prop `fechaVisita={…}`.

- [ ] **Paso 4: Correr**

```bash
cd "$REPO" && git grep -n "PasarPendientesModal\|Pasar pendientes a otro día" -- src; npm run typecheck && npx vitest run
```
Expected: el `git grep` no devuelve nada (salvo, si quedó, un comentario histórico que diga «antes “Pasar pendientes a otro día”»); tsc limpio; 0 fallas.

- [ ] **Paso 5: Commit**

```bash
cd "$REPO" && git add src/views/track/DejarParaOtroDiaModal.tsx src/views/track/PasarPendientesModal.tsx src/views/track/DesdoblamientoVisita.tsx src/views/track/VisitProcedures.tsx src/views/track/VisitDetail.tsx && git commit -m "feat(coordinacion): dejar para otro día sin fecha y «Se hace hoy»

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 12: Los formularios de agendar y la ficha del paciente

**Files:**
- Create: `src/views/track/agendar/FormContinuarPendientes.tsx`, `src/views/track/agendar/FormRetest.tsx`, `src/views/track/agendar/FormTraerVisita.tsx`, `src/views/track/agendar/FormVnp.tsx`
- Modify: `src/views/track/RegisterVisitFlow.tsx`
- Modify: `src/views/PatientFichaView.tsx:99-100` y `:184-195`

**Interfaces:**
- Consumes: `continuarPendientes`, `usePorRetomar` (Tarea 8), `registerVisitEvent` con `retestOf` (Tarea 8), `useVisitProcedureStatus` (Tarea 8), `rescheduleVisit` (`src/data/visits.ts`), reglas de la Tarea 9, `CasillasDeProcedimientos` (Tarea 10), `SelectorProcedimientos` (0144).
- Produces:
  - `FormContinuarPendientes({ candidatas, fecha, fechaEditable, preseleccion, accent, onCancel, onDone })`
  - `FormRetest({ candidatas, protocolId, fecha, fechaEditable, accent, onCancel, onDone })`
  - `FormTraerVisita({ candidatas, dia, accent, onCancel, onDone })`
  - `FormVnp({ pacientes, protocolId, fecha, accent, onCancel, onDone })`
  - Los cuatro: `onDone: (mensaje: string) => void`, `onCancel: () => void`; cada uno tiene sus propios botones.
  - `RegisterVisitFlow` con props nuevas opcionales `porRetomar?: readonly VisitaPorRetomar[]` y `preseleccion?: { accion: 'continuar'; origenId: string }`.

- [ ] **Paso 1: Continuar pendientes**

Crear `src/views/track/agendar/FormContinuarPendientes.tsx`:

```tsx
import { useState } from 'react'
import { FormField } from '../../../components/FormField'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { DateField } from '../../../components/DateField'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { continuarPendientes } from '../../../data/pendientes'
import { formatAR, yearsFromTodayISO } from '../../../lib/dates'
import { CasillasDeProcedimientos } from '../CasillasDeProcedimientos'
import { rotuloDeVisita } from '../retomar'
import type { VisitaPorRetomar } from '../retomar'

/**
 * «Continuar pendientes» (vNNNN): elegís la visita que dejó cosas para otro día y se crea la
 * continuación con lo que se retoma. Lo marcado viene TODO tildado (decisión 8 del spec: ya se
 * eligió a propósito al marcarlo); se destilda lo que hoy no se hace, y eso sigue esperando.
 */
export function FormContinuarPendientes({ candidatas, fecha, fechaEditable, preseleccion, accent, onCancel, onDone }: {
  candidatas: readonly VisitaPorRetomar[]
  fecha: string
  /** Desde la ficha se elige la fecha; desde Visitas es el día que se mira. */
  fechaEditable: boolean
  /** La visita que ya viene elegida (el «Agendar» de Pendientes). */
  preseleccion?: string | null
  accent: string
  onCancel: () => void
  onDone: (mensaje: string) => void
}) {
  const inicial = preseleccion && candidatas.some((c) => c.visita.id === preseleccion) ? preseleccion : candidatas[0]?.visita.id ?? ''
  const [origenId, setOrigenId] = useState(inicial)
  /* Lo elegido POR visita: cambiar de visita no arrastra la selección de otra, y volver a una
     conserva lo que se había destildado. Sin entrada = todo lo marcado. */
  const [elegidosPor, setElegidosPor] = useState<Record<string, string[]>>({})
  const [fechaElegida, setFechaElegida] = useState(fecha)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const origen = candidatas.find((c) => c.visita.id === origenId) ?? null
  const elegidos = new Set(elegidosPor[origenId] ?? origen?.procedimientos.map((p) => p.procedure_id) ?? [])

  if (candidatas.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', lineHeight: 1.5 }}>No hay procedimientos esperando.</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={btnOutline}>Cerrar</button>
        </div>
      </div>
    )
  }

  const agendar = async () => {
    if (!origen) return
    if (elegidos.size === 0) { setError('Elegí qué procedimientos se retoman.'); return }
    setBusy(true); setError(null)
    const res = await continuarPendientes(origen.visita.id, [...elegidos], fechaElegida)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone(`Listo. La continuación quedó para el ${formatAR(fechaElegida)}.`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <FormField label="¿De qué visita?">
        <SearchableSelect
          value={origenId}
          onChange={setOrigenId}
          options={candidatas.map((c) => ({
            value: c.visita.id,
            label: `${rotuloDeVisita(c.visita)} · ${c.procedimientos.map((p) => p.name).join(', ')}`,
          }))}
          placeholder="Elegí una visita"
          searchPlaceholder="Buscar paciente o visita…"
          entity="visita"
        />
      </FormField>
      {origen && (
        <FormField label="¿Qué se retoma?">
          <CasillasDeProcedimientos
            items={origen.procedimientos}
            elegidos={elegidos}
            onChange={(next) => setElegidosPor((m) => ({ ...m, [origenId]: [...next] }))}
            accent={accent}
          />
        </FormField>
      )}
      {fechaEditable && (
        <FormField label="Fecha de la visita">
          <DateField value={fechaElegida} onChange={setFechaElegida} min={yearsFromTodayISO(-2)} max={yearsFromTodayISO(2)} />
        </FormField>
      )}
      {error && (
        <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancel} style={btnOutline}>Cancelar</button>
        <button type="button" onClick={agendar} disabled={busy} style={{ ...btnPrimary(accent), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
          {busy ? 'Agendando…' : 'Agendar'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Paso 2: Retest**

Crear `src/views/track/agendar/FormRetest.tsx`:

```tsx
import { useState } from 'react'
import { FormField, fieldInput } from '../../../components/FormField'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { DateField } from '../../../components/DateField'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { registerVisitEvent } from '../../../data/visitEvents'
import { useVisitProcedureStatus } from '../../../data/procedures'
import type { TrackVisitRow } from '../../../data/visits'
import { formatAR, yearsFromTodayISO } from '../../../lib/dates'
import { CasillasDeProcedimientos } from '../CasillasDeProcedimientos'
import { DIAS_DEL_RETEST, procedimientosRepetibles, rotuloDeVisita } from '../retomar'

/**
 * «Retest» (vNNNN): siempre de una visita. Se elige la visita (atendida en los últimos
 * `DIAS_DEL_RETEST` días) y de ella sólo lo que se hizo: tildado, o sin reporte (decisión 9). Sin
 * preselección y al menos uno. El servidor valida lo mismo (`procedimiento_hecho`).
 */
export function FormRetest({ candidatas, protocolId, fecha, fechaEditable, accent, onCancel, onDone }: {
  /** Ya filtradas con `visitasParaRetest`. */
  candidatas: readonly TrackVisitRow[]
  protocolId: string
  fecha: string
  fechaEditable: boolean
  accent: string
  onCancel: () => void
  onDone: (mensaje: string) => void
}) {
  const [origenId, setOrigenId] = useState(candidatas[0]?.id ?? '')
  const [elegidosPor, setElegidosPor] = useState<Record<string, string[]>>({})
  const [notas, setNotas] = useState('')
  const [fechaElegida, setFechaElegida] = useState(fecha)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const origen = candidatas.find((v) => v.id === origenId) ?? null
  const procs = useVisitProcedureStatus(origen?.id ?? null, protocolId)
  const repetibles = procedimientosRepetibles(procs.data ?? [], origen?.real_date != null)
  const elegidos = new Set(elegidosPor[origenId] ?? [])

  if (candidatas.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', lineHeight: 1.5 }}>
          No hay visitas atendidas en los últimos {DIAS_DEL_RETEST} días.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={btnOutline}>Cerrar</button>
        </div>
      </div>
    )
  }

  const agendar = async () => {
    if (!origen) return
    if (elegidos.size === 0) { setError('Elegí al menos un procedimiento para el retest.'); return }
    setBusy(true); setError(null)
    const res = await registerVisitEvent(origen.enrollment_id, 'retest', fechaElegida, notas.trim() || null, [...elegidos], origen.id)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone(`Listo. El retest quedó para el ${formatAR(fechaElegida)}.`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <FormField label="¿Qué visita se repite?">
        <SearchableSelect
          value={origenId}
          onChange={setOrigenId}
          options={candidatas.map((v) => ({ value: v.id, label: rotuloDeVisita(v) }))}
          placeholder="Elegí una visita"
          searchPlaceholder="Buscar paciente o visita…"
          entity="visita"
        />
      </FormField>
      {origen && (
        <FormField label="¿Qué se repite?">
          {procs.loading && !procs.data ? (
            <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>Cargando procedimientos…</div>
          ) : procs.error ? (
            <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)' }}>No se pudieron cargar los procedimientos: {procs.error}</div>
          ) : repetibles.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>En esa visita no quedó nada hecho para repetir.</div>
          ) : (
            <CasillasDeProcedimientos
              items={repetibles}
              elegidos={elegidos}
              onChange={(next) => setElegidosPor((m) => ({ ...m, [origenId]: [...next] }))}
              accent={accent}
            />
          )}
        </FormField>
      )}
      {fechaEditable && (
        <FormField label="Fecha del retest">
          <DateField value={fechaElegida} onChange={setFechaElegida} min={yearsFromTodayISO(-2)} max={yearsFromTodayISO(2)} />
        </FormField>
      )}
      <FormField label="Nota">
        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" style={fieldInput} />
      </FormField>
      {error && (
        <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancel} style={btnOutline}>Cancelar</button>
        <button type="button" onClick={agendar} disabled={busy} style={{ ...btnPrimary(accent), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
          {busy ? 'Agendando…' : 'Agendar retest'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Paso 3: Traer una visita, y VNP (los dos sólo desde Visitas)**

Crear `src/views/track/agendar/FormTraerVisita.tsx`:

```tsx
import { useState } from 'react'
import { FormField } from '../../../components/FormField'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { rescheduleVisit } from '../../../data/visits'
import type { TrackVisitRow } from '../../../data/visits'
import { formatAR } from '../../../lib/dates'
import { fueraDeVentana } from '../../../lib/visits'
import { rotuloDeVisita } from '../retomar'

/**
 * «Una visita del estudio» (vNNNN): trae al día que se mira una visita ya agendada para después.
 * Es un reprogramar rápido: usa `rescheduleVisit`, la de siempre, y avisa si el día cae fuera de la
 * ventana (no lo impide: la ventana es del sponsor y el estado calculado lo va a decir igual).
 */
export function FormTraerVisita({ candidatas, dia, accent, onCancel, onDone }: {
  /** Ya filtradas con `visitasParaTraer`. */
  candidatas: readonly TrackVisitRow[]
  dia: string
  accent: string
  onCancel: () => void
  onDone: (mensaje: string) => void
}) {
  const [visitaId, setVisitaId] = useState(candidatas[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const visita = candidatas.find((v) => v.id === visitaId) ?? null

  if (candidatas.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', lineHeight: 1.5 }}>Este estudio no tiene visitas agendadas para más adelante.</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={btnOutline}>Cerrar</button>
        </div>
      </div>
    )
  }

  const traer = async () => {
    if (!visita) return
    setBusy(true); setError(null)
    const res = await rescheduleVisit(visita.id, dia)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone(`Listo. La visita pasó al ${formatAR(dia)}.`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <FormField label="¿Qué visita?">
        <SearchableSelect
          value={visitaId}
          onChange={setVisitaId}
          options={candidatas.map((v) => ({ value: v.id, label: rotuloDeVisita(v) }))}
          placeholder="Elegí una visita"
          searchPlaceholder="Buscar paciente o visita…"
          entity="visita"
        />
      </FormField>
      {visita && fueraDeVentana(dia, visita.window_start, visita.window_end) && visita.window_start && visita.window_end && (
        <div style={{ fontSize: 12.5, color: 'var(--spira-ink)', background: 'color-mix(in srgb, var(--spira-warn) 10%, transparent)', borderRadius: 8, padding: '8px 12px' }}>
          Ese día queda fuera de la ventana de la visita ({formatAR(visita.window_start)} al {formatAR(visita.window_end)}).
        </div>
      )}
      {error && (
        <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancel} style={btnOutline}>Cancelar</button>
        <button type="button" onClick={traer} disabled={busy} style={{ ...btnPrimary(accent), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
          {busy ? 'Guardando…' : 'Traer a este día'}
        </button>
      </div>
    </div>
  )
}
```

Crear `src/views/track/agendar/FormVnp.tsx`:

```tsx
import { useState } from 'react'
import { FormField, fieldInput } from '../../../components/FormField'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { registerVisitEvent } from '../../../data/visitEvents'
import { formatAR } from '../../../lib/dates'
import { SelectorProcedimientos } from '../SelectorProcedimientos'
import type { PacienteDelEstudio } from '../retomar'

/**
 * «VNP» desde Visitas (vNNNN): lo mismo que en la ficha, pero hay que elegir el paciente. Los
 * procedimientos son opcionales: una consulta es una VNP válida.
 */
export function FormVnp({ pacientes, protocolId, fecha, accent, onCancel, onDone }: {
  pacientes: readonly PacienteDelEstudio[]
  protocolId: string
  fecha: string
  accent: string
  onCancel: () => void
  onDone: (mensaje: string) => void
}) {
  const [enrollmentId, setEnrollmentId] = useState(pacientes[0]?.enrollment_id ?? '')
  const [procs, setProcs] = useState<string[]>([])
  const [notas, setNotas] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const agendar = async () => {
    if (!enrollmentId) { setError('Elegí el paciente.'); return }
    setBusy(true); setError(null)
    const res = await registerVisitEvent(enrollmentId, 'vnp', fecha, notas.trim() || null, procs)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone(`Listo. La VNP quedó para el ${formatAR(fecha)}.`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <FormField label="Paciente">
        <SearchableSelect
          value={enrollmentId}
          onChange={setEnrollmentId}
          options={pacientes.map((p) => ({ value: p.enrollment_id, label: p.patient_code ? `${p.patient_name} · ${p.patient_code}` : p.patient_name }))}
          placeholder="Elegí un paciente"
          searchPlaceholder="Buscar paciente…"
          entity="paciente"
        />
      </FormField>
      <FormField label="¿Qué lleva?">
        <SelectorProcedimientos protocolId={protocolId} value={procs} onChange={setProcs} accent={accent} />
      </FormField>
      <FormField label="Nota">
        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" style={fieldInput} />
      </FormField>
      {error && (
        <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancel} style={btnOutline}>Cancelar</button>
        <button type="button" onClick={agendar} disabled={busy} style={{ ...btnPrimary(accent), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
          {busy ? 'Agendando…' : 'Agendar VNP'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Paso 4: `RegisterVisitFlow` con las dos opciones nuevas**

En `src/views/track/RegisterVisitFlow.tsx`:

1. Imports:

```ts
import { FormContinuarPendientes } from './agendar/FormContinuarPendientes'
import { FormRetest } from './agendar/FormRetest'
import { visitasParaRetest } from './retomar'
import type { VisitaPorRetomar } from './retomar'
```

2. Props nuevas (tipo y desestructuración), después de `referenceVisits`:

```ts
  /**
   * Lo que ESTA inscripción dejó para otro día (vNNNN). Con algo adentro aparece «Continuar
   * pendientes». Sólo lo pasa la ficha (y el «Agendar» de Pendientes): el «recitar» no lo necesita.
   */
  porRetomar?: readonly VisitaPorRetomar[]
  /** Abrir ya en «Continuar pendientes» sobre esa visita (el «Agendar» de Pendientes). */
  preseleccion?: { accion: 'continuar'; origenId: string }
```

3. Las opciones. El retest suelto deja de ofrecerse (decisión 5 del spec): se reemplaza por `acc:retest`, que sólo existe con `referenceVisits` (la ficha). Reemplazá el armado de `options` por:

```ts
  /* El retest ya no es suelto (vNNNN): cuelga de una visita, y se agenda por `acc:retest`, que
     necesita las visitas del paciente (`referenceVisits`). Sin ellas —el «recitar»— no se ofrece. */
  const kindsSueltos = eventKinds.filter((k) => k !== 'retest')
  const hayPorRetomar = (porRetomar?.length ?? 0) > 0
  const options: { value: string; label: string }[] = [
    ...defOptions.map((d) => ({ value: `def:${d.id}`, label: d.code ? `${d.code} - ${d.name}` : d.name })),
    ...(hayPorRetomar ? [{ value: 'acc:continuar', label: 'Continuar pendientes' }] : []),
    ...(referenceVisits ? [{ value: 'acc:retest', label: 'Retest' }] : []),
    ...kindsSueltos.map((k) => ({ value: `evt:${k}`, label: KIND_LABELS[k] })),
  ]
```

4. `initialChoice` respeta la preselección:

```ts
  const initialChoice =
    preseleccion?.accion === 'continuar' && hayPorRetomar
      ? 'acc:continuar'
      : preselectDefId && defOptions.some((d) => d.id === preselectDefId)
        ? `def:${preselectDefId}`
        : options[0]?.value ?? ''
```

5. `llevaProcedimientos` queda sólo para la VNP: `const llevaProcedimientos = kindElegido === 'vnp'`. Sacá el import de `faltanProcedimientos` y el bloque que lo llama en `submit` (con la VNP no hay mínimo; el retest ya no pasa por acá). Actualizá el comentario de cabecera del componente: «Post-randomización: VNP suelta, y Retest / Continuar pendientes por sus formularios (vNNNN)».

6. El render: el desplegable «Tipo de visita» sale del `<form>` y queda arriba; debajo va el formulario que corresponda. Reemplazá el bloque `<form onSubmit={submit} …>…</form>` por:

```tsx
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormField label="Tipo de visita">
            <SearchableSelect
              value={choice}
              onChange={setPicked}
              options={options}
              placeholder="Elegí una visita"
              searchPlaceholder="Buscar visita…"
              entity="visita"
              autoFocus
            />
          </FormField>

          {choice === 'acc:continuar' ? (
            <FormContinuarPendientes
              candidatas={porRetomar ?? []}
              fecha={todayISO()}
              fechaEditable
              preseleccion={preseleccion?.origenId}
              accent={accentSolid}
              onCancel={onClose}
              onDone={() => onDone()}
            />
          ) : choice === 'acc:retest' ? (
            <FormRetest
              candidatas={visitasParaRetest(referenceVisits ?? [], todayISO())}
              protocolId={protocolId}
              fecha={todayISO()}
              fechaEditable
              accent={accentSolid}
              onCancel={onClose}
              onDone={() => onDone()}
            />
          ) : (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* …todo lo que había dentro del <form>, MENOS el FormField «Tipo de visita», que
                  ahora vive arriba: Fecha, Nota, «¿Qué lleva?», el aviso de randomización, el
                  error y los botones. Sin cambios. */}
            </form>
          )}
        </div>
```

(El comentario del `<form>` es para vos: pegá ahí adentro el contenido que ya tenía, sin el `FormField` del tipo. No lo dejes en el código.)

- [ ] **Paso 5: La ficha**

En `src/views/PatientFichaView.tsx`:

1. Imports: `import { usePorRetomar } from '../data/pendientes'` y `import { agruparPorRetomar } from './track/retomar'`.
2. Junto a `const usedKinds = rows.map((r) => r.kind)`:

```ts
  /* Lo que ESTA inscripción dejó para otro día (vNNNN): alimenta «Continuar pendientes» del
     «Agendar visita». Se lee todo lo que espera y se acota acá: una consulta chica, y la misma que
     usan Pendientes y Visitas. */
  const retomarQ = usePorRetomar()
  const porRetomar = agruparPorRetomar(retomarQ.data?.marcas ?? [], retomarQ.data?.visitas ?? [])
    .filter((g) => g.visita.enrollment_id === enrollment?.id)
```

3. En `<RegisterVisitFlow …>` del `modal === 'register'`: sumá `porRetomar={porRetomar}` y en `onDone` sumá `retomarQ.refetch()`: `onDone={() => { setModal(null); visitsQ.refetch(); retomarQ.refetch() }}`.

- [ ] **Paso 6: Correr y commit**

```bash
cd "$REPO" && npm run typecheck && npx vitest run
```
Expected: tsc limpio; 0 fallas. Si algún test de `continuacion.test.ts` usaba `faltanProcedimientos`, sigue andando: la función no se borra, sólo dejó de usarse acá (queda para `EditarProcedimientosModal`). Confirmalo con `git grep -n faltanProcedimientos -- src`.
```bash
cd "$REPO" && git add src/views/track/agendar src/views/track/RegisterVisitFlow.tsx src/views/PatientFichaView.tsx && git commit -m "feat(coordinacion): continuar pendientes y retest de una visita al agendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 13: «Agregar visita» en Visitas

**Files:**
- Create: `src/views/track/agendar/AgregarVisitaModal.tsx`
- Modify: `src/views/DayVisitsView.tsx` (header y render)

**Interfaces:**
- Consumes: los cuatro formularios (Tarea 12), `useProtocolVisits` (`src/data/visits.ts`), `usePorRetomar` (Tarea 8), reglas de la Tarea 9, `useProtocols` (`src/data/protocols.ts`), `canClinical` de `useVisitPermissions`.
- Produces: `AgregarVisitaModal({ dia, protocolos, accent, onClose, onDone }: { dia: string; protocolos: readonly { id: string; code: string; name: string }[]; accent: string; onClose: () => void; onDone: (mensaje: string) => void })`.

- [ ] **Paso 1: El modal**

Crear `src/views/track/agendar/AgregarVisitaModal.tsx`:

```tsx
import { useState } from 'react'
import { Modal } from '../../../components/Modal'
import { FormField } from '../../../components/FormField'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { btnOutline } from '../../../components/buttons'
import { useProtocolVisits } from '../../../data/visits'
import { usePorRetomar } from '../../../data/pendientes'
import { formatAR } from '../../../lib/dates'
import { agruparPorRetomar, pacientesDelEstudio, visitasParaRetest, visitasParaTraer } from '../retomar'
import { FormTraerVisita } from './FormTraerVisita'
import { FormContinuarPendientes } from './FormContinuarPendientes'
import { FormRetest } from './FormRetest'
import { FormVnp } from './FormVnp'

type Accion = 'traer' | 'continuar' | 'retest' | 'vnp'

/**
 * «Agregar visita» desde Visitas (vNNNN): «hoy voy a hacer tal cosa». Primero el estudio, después
 * qué se va a hacer, y las listas traen a todos los pacientes de ese estudio. La fecha es el día que
 * se está mirando, fija: para agendar a futuro está la ficha del paciente (mismo flujo, con fecha).
 * Los números de cada opción dicen cuántas hay ANTES de elegirla: una opción que lleva a una lista
 * vacía y no lo avisó es un clic perdido.
 */
export function AgregarVisitaModal({ dia, protocolos, accent, onClose, onDone }: {
  dia: string
  /** Los estudios en los que la persona puede agendar. */
  protocolos: readonly { id: string; code: string; name: string }[]
  accent: string
  onClose: () => void
  onDone: (mensaje: string) => void
}) {
  const [protocolId, setProtocolId] = useState(protocolos.length === 1 ? protocolos[0].id : '')
  const [accion, setAccion] = useState<Accion | ''>('')
  const visitasQ = useProtocolVisits(protocolId || null)
  const retomarQ = usePorRetomar()

  const visitas = visitasQ.data ?? []
  const traer = visitasParaTraer(visitas, dia)
  const retomar = agruparPorRetomar(retomarQ.data?.marcas ?? [], retomarQ.data?.visitas ?? [])
    .filter((g) => g.visita.protocol_id === protocolId)
  const retest = visitasParaRetest(visitas, dia)
  const pacientes = pacientesDelEstudio(visitas)

  const opciones: { value: Accion; label: string }[] = [
    { value: 'traer', label: `Una visita del estudio (${traer.length})` },
    { value: 'continuar', label: `Continuar pendientes (${retomar.length})` },
    { value: 'retest', label: 'Retest' },
    { value: 'vnp', label: 'VNP' },
  ]
  const cargando = !!protocolId && (visitasQ.loading || retomarQ.loading) && !visitasQ.data

  return (
    <Modal title="Agregar visita" subtitle={`Para el ${formatAR(dia)}.`} onClose={onClose} maxWidth={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="Estudio">
          <SearchableSelect
            value={protocolId}
            onChange={(id) => { setProtocolId(id); setAccion('') }}
            options={protocolos.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
            placeholder="Elegí un estudio"
            searchPlaceholder="Buscar estudio…"
            entity="estudio"
            autoFocus={protocolos.length > 1}
          />
        </FormField>

        {protocolId && (
          <FormField label="¿Qué vas a hacer?">
            <SearchableSelect
              value={accion}
              onChange={(a) => setAccion(a as Accion)}
              options={opciones}
              placeholder="Elegí qué vas a hacer"
              entity="opción"
              searchable="never"
            />
          </FormField>
        )}

        {cargando && <div style={{ fontSize: 13, color: 'var(--spira-muted)' }}>Cargando visitas del estudio…</div>}
        {(visitasQ.error || retomarQ.error) && (
          <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)' }}>No pudimos cargar las visitas del estudio. Probá de nuevo.</div>
        )}

        {!cargando && protocolId && accion === 'traer' && (
          <FormTraerVisita candidatas={traer} dia={dia} accent={accent} onCancel={onClose} onDone={onDone} />
        )}
        {!cargando && protocolId && accion === 'continuar' && (
          <FormContinuarPendientes candidatas={retomar} fecha={dia} fechaEditable={false} accent={accent} onCancel={onClose} onDone={onDone} />
        )}
        {!cargando && protocolId && accion === 'retest' && (
          <FormRetest candidatas={retest} protocolId={protocolId} fecha={dia} fechaEditable={false} accent={accent} onCancel={onClose} onDone={onDone} />
        )}
        {!cargando && protocolId && accion === 'vnp' && (
          <FormVnp pacientes={pacientes} protocolId={protocolId} fecha={dia} accent={accent} onCancel={onClose} onDone={onDone} />
        )}

        {(!protocolId || !accion) && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          </div>
        )}
      </div>
    </Modal>
  )
}
```

`searchable="never"`: son cuatro opciones fijas, un buscador ahí es ruido. `value=""` con `placeholder` es el mismo patrón que ya usa `RegisterVisitFlow`.

- [ ] **Paso 2: El botón en la cabecera de Visitas**

En `src/views/DayVisitsView.tsx`:

1. Imports: `import { AgregarVisitaModal } from './track/agendar/AgregarVisitaModal'`, `import { useProtocols } from '../data/protocols'` y `btnPrimary` junto a `btnOutline` desde `../components/buttons`.
2. Estado y lista de estudios, junto a los otros `useState`:

```ts
  const [agregando, setAgregando] = useState(false)
  const protocolsQ = useProtocols()
```

y después de `useVisitPermissions()`:

```ts
  /* Los estudios en los que se puede agendar desde acá (vNNNN): activos y en los que la persona
     tiene la parte clínica (la misma regla que `puede_registrar_visitas`, salvo gerencia, que no
     opera el día). Sin ninguno, el botón no se dibuja. */
  const protocolosParaAgregar = (protocolsQ.data ?? [])
    .filter((p) => p.status === 'activo' && canReception && canClinical({ protocol_id: p.id }))
    .map((p) => ({ id: p.id, code: p.code, name: p.name }))
```

3. El efecto del header suma el botón al lado de la fecha, y `protocolosParaAgregar.length` a las deps (el header es un elemento congelado: sin la dep, no aparece cuando carga la lista — ver la memoria `gotcha-elemento-congelado-en-estado`):

```tsx
  useEffect(() => {
    setHeader?.({
      content: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DateNavButton accent={accent} date={date} onChange={setDate} />
          {protocolosParaAgregar.length > 0 && (
            <button type="button" onClick={() => setAgregando(true)} style={{ ...btnPrimary(accentSolid), height: 36, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="plus" size={16} color="var(--spira-white)" />
              Agregar visita
            </button>
          )}
        </div>
      ),
    })
    return () => setHeader?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, setHeader, protocolosParaAgregar.length])
```

4. El modal, junto a los del final:

```tsx
      {agregando && (
        <AgregarVisitaModal
          dia={date}
          protocolos={protocolosParaAgregar}
          accent={accentSolid}
          onClose={() => setAgregando(false)}
          onDone={(mensaje) => {
            setAgregando(false)
            setActionError(null)
            setFeedback(mensaje)
            day.refetch()
            dayProcs.refetch()
          }}
        />
      )}
```

- [ ] **Paso 3: Correr y commit**

```bash
cd "$REPO" && npm run typecheck && npx vitest run
```
Expected: tsc limpio; 0 fallas.
```bash
cd "$REPO" && git add src/views/track/agendar/AgregarVisitaModal.tsx src/views/DayVisitsView.tsx && git commit -m "feat(coordinacion): agregar visita desde Visitas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 14: «Procedimientos por retomar» en Pendientes

**Files:**
- Modify: `src/views/pendientesPorProtocolo.ts` + `src/views/pendientesPorProtocolo.test.ts`
- Modify: `src/views/PendientesProtocoloCards.tsx`
- Create: `src/views/track/agendar/AgendarDesdePendientes.tsx`
- Modify: `src/views/TrackAlertsView.tsx`

**Interfaces:**
- Consumes: `usePorRetomar` (Tarea 8), `agruparPorRetomar`, `diasEsperando`, `VisitaPorRetomar` (Tarea 9), `RegisterVisitFlow` con `porRetomar`/`preseleccion` (Tarea 12), `usePatientVisits`.
- Produces: `pendientesPorProtocolo(visitas, reportes, ips = [], retomar = [])` con el campo nuevo `PendientesDeProtocolo.retomar: number`; `AgendarDesdePendientes({ grupo, accent, onClose, onDone })`.

- [ ] **Paso 1: El test del conteo que falla**

Agregá a `src/views/pendientesPorProtocolo.test.ts`, dentro del `describe('pendientesPorProtocolo', …)`:

```ts
  it('cuenta también lo que espera para otro día (vNNNN), en el total y aparte', () => {
    const [f] = pendientesPorProtocolo([v('A', 'item_vencido')], [r('A')], [], [r('A'), r('A')])
    expect(f.total).toBe(4)
    expect(f.retomar).toBe(2)
  })

  it('un protocolo con sólo pendientes por retomar tiene tarjeta, detrás de los que tienen alertas', () => {
    const filas = pendientesPorProtocolo([v('B', 'ventana_vencida')], [], [], [r('A')])
    expect(filas.map((x) => x.code)).toEqual(['B', 'A'])
    expect(filas[1].peor).toBeNull()
  })
```

Correr: `cd "$REPO" && npx vitest run src/views/pendientesPorProtocolo.test.ts`
Expected: FALLA — `f.retomar` es `undefined` y el total da 2.

- [ ] **Paso 2: El conteo**

En `src/views/pendientesPorProtocolo.ts`:

1. En `PendientesDeProtocolo`, después de `ips`: `/** Cuántas visitas con procedimientos para otro día (vNNNN). 0 = no se muestra. */ retomar: number`.
2. La firma suma el cuarto parámetro, con el mismo comentario que el tercero:

```ts
  /* La cuarta lista (vNNNN): una fila por VISITA que dejó procedimientos para otro día. Misma forma
     mínima. Con default, pero la pantalla la PASA: olvidarla es el modo de falla del encabezado. */
  retomar: readonly ReporteConProtocolo[] = [],
```

3. El acumulador suma `retomar: 0` (en el tipo del `Map` y en `nuevo`), el bucle `for (const r of retomar) entrada(r.protocol_id, r.protocol_code).retomar += 1`, y la fila `total: visitas + e.reportes + e.ips + e.retomar` y `retomar: e.retomar`.
4. Actualizá el encabezado del archivo: «cruza alertas de visita, reportes pendientes, IP sin entregar y procedimientos por retomar».

Correr: `npx vitest run src/views/pendientesPorProtocolo.test.ts`. Expected: PASS.

- [ ] **Paso 3: Las tarjetas**

En `src/views/PendientesProtocoloCards.tsx`:

1. Prop nueva, después de `ips`: `/** Procedimientos por retomar SIN filtrar, una fila por visita (vNNNN). */ retomar: readonly ReporteConProtocolo[]`, y en la desestructuración.
2. `const filas = pendientesPorProtocolo(visitas, reportes, ips, retomar)`.
3. En el desglose, después del de «Reporte»:

```tsx
                    {p.retomar > 0 && (
                      <span style={parte}>
                        <span style={{ ...punto, background: 'var(--spira-muted)' }} />
                        Por retomar <b style={cifra}>{p.retomar}</b>
                      </span>
                    )}
```

4. El ícono y el tono de una tarjeta que SÓLO tiene pendientes por retomar: extendé las dos líneas `icono`/`tono` para que, sin alerta, sin IP y sin reportes, usen `'clock'` y `'var(--spira-muted)'`:

```ts
          const icono = p.peor ? SEVERIDAD_ICONO[claseDeAlerta(p.peor)] : p.ips > 0 ? 'pill' : p.reportes > 0 ? ICONO_REPORTE : 'clock'
          const tono = p.peor ? VISIT_STATES[p.peor].color : p.ips > 0 ? 'var(--spira-acc-deep-warn)' : p.reportes > 0 ? 'var(--spira-acc-deep-blue)' : 'var(--spira-muted)'
```

- [ ] **Paso 4: Agendar desde Pendientes**

Crear `src/views/track/agendar/AgendarDesdePendientes.tsx`:

```tsx
import { Modal } from '../../../components/Modal'
import { usePatientVisits } from '../../../data/visits'
import { RegisterVisitFlow } from '../RegisterVisitFlow'
import type { VisitaPorRetomar } from '../retomar'

/**
 * El «Agendar» de una fila de «Procedimientos por retomar» (vNNNN): el MISMO «Agendar visita» de la
 * ficha, con el paciente fijo y «Continuar pendientes» ya elegido sobre esa visita. Carga las visitas
 * del paciente porque el flujo las necesita (el retest, la fecha estimada del cuadro).
 */
export function AgendarDesdePendientes({ grupo, todos, accent, onClose, onDone }: {
  grupo: VisitaPorRetomar
  /** Todo lo que espera (ya agrupado): se le pasan al flujo los de la MISMA inscripción. */
  todos: readonly VisitaPorRetomar[]
  accent: string
  onClose: () => void
  onDone: () => void
}) {
  const v = grupo.visita
  const q = usePatientVisits(v.patient_id, v.protocol_id)
  if (q.loading && !q.data) {
    return (
      <Modal title="Agendar visita" onClose={onClose} maxWidth={480}>
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', padding: '6px 0' }}>Cargando visitas…</div>
      </Modal>
    )
  }
  const rows = (q.data ?? []).filter((r) => r.enrollment_id === v.enrollment_id)
  return (
    <RegisterVisitFlow
      enrollmentId={v.enrollment_id}
      protocolId={v.protocol_id}
      randomizationDate={v.enrollment_randomization_date}
      usedKinds={rows.map((r) => r.kind)}
      referenceVisits={rows}
      porRetomar={todos.filter((g) => g.visita.enrollment_id === v.enrollment_id)}
      preseleccion={{ accion: 'continuar', origenId: v.id }}
      accentSolid={accent}
      onClose={onClose}
      onDone={onDone}
    />
  )
}
```

- [ ] **Paso 5: La lista en Pendientes**

En `src/views/TrackAlertsView.tsx`:

1. Imports: `import { usePorRetomar } from '../data/pendientes'`, `import { agruparPorRetomar, diasEsperando } from './track/retomar'`, `import type { VisitaPorRetomar } from './track/retomar'`, `import { AgendarDesdePendientes } from './track/agendar/AgendarDesdePendientes'`.
2. Constante junto a `IP_SIN_ENTREGAR`:

```ts
/** La opción del filtro Estado para los procedimientos por retomar (vNNNN). No es un `computed_status`. */
const POR_RETOMAR = 'por_retomar'
```

3. Datos, después de `const alertsQ = useActiveAlerts()`:

```ts
  /* La cuarta lista (vNNNN): visitas con procedimientos dejados para otro día. Consulta propia: no
     es una alerta de la visita (la visita ya cerró) sino trabajo que espera. Su error se muestra en
     línea, como el del IP: que falle no puede tirar la pantalla entera. */
  const retomarQ = usePorRetomar()
  const retomarRows = useMemo(
    () => agruparPorRetomar(retomarQ.data?.marcas ?? [], retomarQ.data?.visitas ?? []),
    [retomarQ.data],
  )
  const [agendando, setAgendando] = useState<VisitaPorRetomar | null>(null)
```

4. El filtro, después de `filteredIp`, con **los mismos cinco filtros** (la antigüedad es la espera):

```ts
  /* Los MISMOS cinco filtros que las otras tres: una lista que un filtro no alcanza queda siempre
     entera o siempre vacía, y las dos cosas mienten. */
  const filteredRetomar = useMemo(() => {
    const today = todayISO()
    return retomarRows.filter((g) => {
      const v = g.visita
      if (fEstado.length > 0 && !fEstado.includes(POR_RETOMAR)) return false
      if (protocolFilter.length > 0 && !protocolFilter.includes(v.protocol_id)) return false
      if (fMed.length > 0 && !fMed.includes(v.treating_physician ?? SIN_VALOR)) return false
      if (fCoord.length > 0 && !fCoord.includes(v.coordinator_id ?? SIN_VALOR)) return false
      if (!coincideBusqueda(v, q)) return false
      if (ageDays > 0 && diasEsperando(g.desde, today) > ageDays) return false
      return true
    })
  }, [retomarRows, fEstado, protocolFilter, fMed, fCoord, q, ageDays])
```

5. **El barrido de consumidores** (el aviso de la línea ~321 dice por qué: cada lista nueva que no se suma a estos lugares queda inalcanzable por filtro sin que nada falle):
   - `protoOptions`: `for (const g of retomarRows) byId.set(g.visita.protocol_id, g.visita.protocol_code)`.
   - `protoMultiOptions`, en el `count`: `+ retomarRows.filter((g) => g.visita.protocol_id === p.id).length`.
   - `estadoOptions`, al final: `{ value: POR_RETOMAR, label: 'Por retomar', count: retomarRows.length }`.
   - `medOptions` / `coordOptions`: sumá `retomarRows.map((g) => g.visita)` a la lista de listas.
   - `<PendientesProtocoloCards … retomar={retomarRows.map((g) => g.visita)} />`.
   - El recuento «N de M pendientes»: sumá `filteredRetomar.length` arriba y `retomarRows.length` abajo (las tres apariciones de `ipRows.length` en ese renglón).
   - El vacío: las dos condiciones del `filtered.length === 0 && …` suman `filteredRetomar.length === 0` y `retomarRows.length === 0`.
6. El error en línea, debajo del de `alertsQ.ipError`:

```tsx
        {retomarQ.error && (
          <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', padding: '8px 0 0' }}>
            No se pudieron cargar los procedimientos por retomar: {retomarQ.error}
          </div>
        )}
```

7. Las filas, al final de la lista (después de `filteredProc.map(…)`): tono **neutro** y **sin tacho** (no se descarta: se resuelve retomando o quitando la marca). La tarjeta lleva a SU entidad —la visita que dejó los procedimientos— y lo secundario va en un botón con nombre:

```tsx
            {filteredRetomar.map((g) => {
              /* Procedimientos por retomar (vNNNN). Tono NEUTRO: no es un desvío ni está vencido, es
                 trabajo que espera fecha. SIN tacho: sale de la lista retomando o con «Se hace hoy»
                 en la visita, no descartándolo. */
              const c = 'var(--spira-muted)'
              const v = g.visita
              const fecha = v.real_date ?? v.estimated_date
              const dias = diasEsperando(g.desde, todayISO())
              return (
                <div key={`retomar:${v.id}`} style={{ position: 'relative' }}>
                  <div
                    role="button"
                    tabIndex={0}
                    className="spira-card-link"
                    onClick={() => setOpenVisitId(v.id)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenVisitId(v.id) }
                    }}
                    aria-label={`Abrir la visita de ${v.patient_name} — procedimientos para otro día`}
                    style={alertItemStyle(c, { conBotonDesviacion: true })}
                  >
                    <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="clock" size={18} color={c} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="spira-link-group" style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                          <PatientLink onOpen={abrirFicha && (() => abrirFicha(v.patient_id, v.protocol_id))} label={`Abrir la ficha de ${v.patient_name}`}>
                            {v.patient_name}
                          </PatientLink>
                        </span>
                        <span style={code}>{v.patient_code ?? '—'}</span>
                        {abrirFicha && <PatientLinkArrow />}
                        <span style={{ color: 'var(--spira-muted)', fontWeight: 400 }}>· <span style={code}>{v.protocol_code}</span></span>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>
                        {visitTitle(v)}{fecha ? ` · ${formatAR(fecha)}` : ''} · {g.procedimientos.map((x) => x.name).join(', ')}
                        {dias > 0 ? ` · espera hace ${dias} d` : ' · desde hoy'}
                      </div>
                    </div>
                  </div>
                  <button type="button" style={deviationBtn} onClick={() => setAgendando(g)}>Agendar</button>
                </div>
              )
            })}
```

8. El modal, junto a los del final (`DismissModal`, `DocumentarDesviacionModal`):

```tsx
      {agendando && (
        <AgendarDesdePendientes
          grupo={agendando}
          todos={retomarRows}
          accent={module.accentSolid}
          onClose={() => setAgendando(null)}
          onDone={() => { setAgendando(null); retomarQ.refetch(); alertsQ.refetch() }}
        />
      )}
```

9. Al cerrar el `VisitDetail` abierto desde esta pantalla, refrescá también `retomarQ` (un «Se hace hoy» o un «Dejar para otro día» adentro cambia esta lista): buscá el `onClose`/`onChanged` del `<VisitDetail …>` de este archivo y sumá `retomarQ.refetch()` donde ya se llama `alertsQ.refetch()`.

- [ ] **Paso 6: Correr y commit**

```bash
cd "$REPO" && npm run typecheck && npx vitest run
```
Expected: tsc limpio; 0 fallas.
```bash
cd "$REPO" && git add src/views/pendientesPorProtocolo.ts src/views/pendientesPorProtocolo.test.ts src/views/PendientesProtocoloCards.tsx src/views/track/agendar/AgendarDesdePendientes.tsx src/views/TrackAlertsView.tsx && git commit -m "feat(coordinacion): procedimientos por retomar en Pendientes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 15: Build, QA en el navegador y PR B

**Files:**
- Modify: `supabase/README.md` (marcar la NNNN **Aplicada en prod (fecha)**, cuando el Director lo confirme)

- [ ] **Paso 1: El gate**

```bash
cd "$REPO" && git grep -n "NNNN" -- src supabase; npm run build
```
Expected: el `git grep` vacío (reemplazá cada `NNNN` por el número real con Edit); `npm run build` verde. Mirá el tamaño del bundle: si da ~300 kB en vez de ~1,5 MB, falta el `.env` y el build «verde» está roto (memoria `gotcha-build-sin-env-pasa-y-esta-roto`).

- [ ] **Paso 2: QA en el preview, contra prod, sobre TEST-QA / TEST-001**

Sólo con la migración **aplicada**. Desde el worktree, verificá que el preview sirva TU código (memoria `gotcha-preview-sirve-la-carpeta-del-director`: Vite propio en el 5251 + `preview_start({url})` si hace falta). El Director se loguea; vos no ingresás contraseñas. Con el panel oculto, verificá por DOM (`read_page`, `javascript_tool` con `element.click()` por selector) y esperá 4-5 s después de cada navegación.

Antes de empezar, anotá qué hay en TEST-001 (visitas, procedimientos del estudio): al final se deja igual. Si TEST-QA no tiene procedimientos con reporte, agregá temporalmente uno con reporte y uno sin reporte (como en el QA de la 0144) y sacalos al final.

1. **Aviso al finalizar.** Una visita de TEST-001 hoy, con un procedimiento con reporte sin tildar y otro sin reporte. «Finalizar atención» desde la fila de Visitas → aparece el modal y lista **sólo** el que tiene reporte. Sin tildarlo, «Continuar» → el aviso «Van a quedar pendientes» lo nombra → «Finalizar» → la visita pasa a fin de atención y queda **completa** (no «realizada»), con el procedimiento marcado. Con dos con reporte: tildar uno → queda tildado de verdad (su reporte arranca) y sólo el otro queda para otro día. Tildar todos → «Continuar» finaliza directo, sin segundo paso. «Cancelar» → no se tilda, no se marca, no se finaliza. Repetí desde el detalle abierto desde la ficha (sin `onAdvance`). Y una visita sin nada pendiente → finaliza sin modal.
2. **La visita con marcas.** En su detalle: la caja «Queda para otro día · 1 procedimiento» con «Se hace hoy». Apretalo → vuelve a la lista y se puede tildar. Volvé a dejarlo con el botón «Dejar para otro día» (sin fecha).
3. **Pendientes.** La fila en «Procedimientos por retomar»; el filtro Estado «Por retomar» la deja sola; el filtro de protocolo la alcanza; la tarjeta de TEST-QA (si hay más de un protocolo con pendientes) dice «Por retomar 1». «Agendar» abre el flujo en «Continuar pendientes» con la visita elegida y la fecha editable.
4. **Continuar una parte.** Con dos marcados, retomá uno para mañana → la continuación aparece como «Continuación de …» con ese procedimiento; el otro sigue en Pendientes.
5. **Agregar visita desde Visitas.** Botón en la cabecera → estudio TEST-QA → cada una de las cuatro opciones muestra su lista (con los números). «Una visita del estudio» trae una visita futura de TEST-001 a hoy.
6. **Retest.** Desde la ficha: «Retest» → elegir la visita atendida → ofrece lo tildado y lo sin reporte, no lo que tiene reporte y no se tildó. Agendarlo → se titula «Retest de …». Intentá borrar la visita de origen desde su editor → «Esta visita tiene un retest. Borralo primero.».
7. **Limpieza.** Borrá exactamente lo que creaste (retest, continuaciones, marcas que queden —con «Se hace hoy»—, procedimientos temporales del estudio) y dejá las visitas de TEST-001 con las fechas que tenían. Verificá recargando que TEST-001 quedó como al principio.

- [ ] **Paso 3: PR B**

Push y PR por la API REST, base `main` (si partiste de la rama de la PR A, reapuntala a `main` cuando la A entre). Título «Coordinación: pendientes por retomar y retest atado a una visita». En el cuerpo: qué cambia para quien usa la app (los cuatro flujos, en una línea cada uno), «**requiere la NNNN aplicada** (PR A)», el QA hecho con sus 7 puntos, y el pie `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Incluí en esta PR la marca **Aplicada en prod (fecha)** de la NNNN en `supabase/README.md`.

---

## Fuera de este plan (anotar en `TODOS.md` si no está)

- La campana de notificaciones y los conteos de Inicio no cuentan los procedimientos por retomar: sólo Pendientes (spec §4). Si el Director los quiere ahí, es un cambio aparte.
- Un procedimiento que no se va a hacer nunca no tiene salida propia en el aviso al finalizar: queda pendiente (spec, «Fuera de alcance»).
- Gerencia sin rol de Coordinación no ve el botón «Agregar visita» (la regla del front es `canClinical`); el servidor sí la dejaría.
