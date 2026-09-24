# Visitas con procedimientos propios (retest, VNP y continuación) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que un retest o una VNP lleven su propia lista de procedimientos (con reportes, vencimientos y cierre), y que una visita se pueda desdoblar pasando lo pendiente a una continuación trazable.

**Architecture:** una tabla nueva `visit_added_procedures` guarda lo que una visita lleva además de su cronograma, y de dónde vino. La vista `v_visit_procedures` calcula la **lista efectiva** de cada visita (cronograma − lo diferido + lo agregado), y las tres vistas que hoy calculan «qué debe una visita» pasan a leer de ella. En el front, un solo hook de lectura y un bloque nuevo en el panel «Resumen de la visita».

**Tech Stack:** Postgres/Supabase (SQL a mano en el editor), React 18 + TypeScript strict, Vite, vitest. PGlite (Postgres en WASM) como banco descartable fuera del repo.

**Spec:** `docs/superpowers/specs/2026-09-23-visitas-retest-y-continuacion-design.md` (PR #310). Leelo antes de empezar.

## Global Constraints

- **Dos PRs, en este orden.** **PR A** = sólo la migración + su fila en el índice (Tareas 1-5). El Director la aplica en prod. **PR B** = el front (Tareas 6-13), que se mergea **después** de que la migración esté aplicada. La migración es **aditiva**: el front viejo sigue andando con ella (lee `select('*')`, y `register_visit_event` conserva los cuatro parámetros viejos con el quinto por defecto). El front nuevo **no** anda sin ella.
- **Numeración: no fijes el número en ningún documento.** Se toma el siguiente libre en `origin/main` al pushear (decisión D18). En este plan, `NNNN` es ese número; la Tarea 1 lo resuelve y lo deja en la variable `$MIG`.
- **`NNNN` / `vNNNN` en el código que copies** (SQL y comentarios del front) se reemplaza por el número real. La Tarea 5 cuenta los que quedan en la migración; en el front, `git grep -n "NNNN" -- src` antes de la PR B tiene que salir vacío.
- **Migraciones inmutables.** Una vez que el Director la aplica, no se edita: cualquier corrección es un archivo nuevo.
- **Nunca dos signos peso pegados dentro de un comentario SQL** (el editor de Supabase invierte la paridad del dollar-quoting). Los cuerpos de función usan `$fn$`.
- **Toda vista que se recrea lleva `with (security_invoker = true)`**: `create or replace view` reemplaza las opciones, y omitirlo saltea la RLS en silencio.
- **Si `create or replace view` falla por columnas, no se fuerza con `cascade`**: se corta y se revisa.
- **Worktree propio, rama propia**, `git add` por ruta. El hook `branch-guard` mira la carpeta del proyecto: commiteá con `cd "<ruta-del-worktree>" && git commit ...`.
- **Copy de UI** en castellano rioplatense; en la UI se dice **Coordinación**, nunca «Track». Avisos cortos, sin tecnicismos.
- **Realce = elevación** (levante ~1px + `--spira-shadow-sm/md`), nunca borde de color. Bordes inline en longhands.
- **Datos reales en prod.** El QA se hace sólo sobre el protocolo **TEST-QA** / paciente **TEST-001**, y se borra exactamente lo que se crea.
- **Gate de verificación:** `npm run build` en verde (tsc + vitest + vite build) y QA en el preview (puerto **5250**, `spira-dev` de `.claude/launch.json`). `vitest` también corre los tests de otros worktrees: el conteo local sale inflado, lo que importa es 0 fallas.

## Mapa de archivos

**PR A — base**
- Crear: `supabase/migrations/NNNN_visitas_con_procedimientos_propios.sql` — tabla, vista de lista efectiva, recableado de 4 vistas, 3 RPC, 2 guardas, sondas.
- Modificar: `supabase/README.md` — fila del índice (CI la exige).
- Banco descartable, **no se commitea**: `$BANCO/esquema.sql`, `$BANCO/verificar.mjs`.

**PR B — front**
- Modificar: `src/lib/visits.ts` (título de la continuación), `src/lib/visitTitle.test.ts`, `src/data/visits.ts` (tipo), `src/views/track/VisitHeader.tsx`.
- Modificar: `src/data/procedures.ts` (lectura por lista efectiva), `src/views/track/resumenVisita.ts` + `.test.ts` (tira del día por visita).
- Crear: `src/data/continuaciones.ts` (lecturas, RPC y mensajes), `src/views/track/continuacion.ts` + `.test.ts` (reglas puras).
- Modificar: `src/data/visitEvents.ts` (retest en cualquier etapa, procedimientos al agendar, error del borrado).
- Crear: `src/views/track/SelectorProcedimientos.tsx`. Modificar: `src/views/track/RegisterVisitFlow.tsx`.
- Crear: `src/views/track/DesdoblamientoVisita.tsx`, `PasarPendientesModal.tsx`, `EditarProcedimientosModal.tsx`, `DeshacerContinuacionModal.tsx` (todos en `src/views/track/`).
- Modificar: `src/views/track/PanelResumenVisita.tsx`, `src/views/track/VisitProcedures.tsx`, `src/views/track/VisitDetail.tsx`, `src/components/Modal.tsx`.
- Modificar: `src/data/reportStatus.ts`, `src/views/track/reportes/ReportCard.tsx`, `src/views/track/reportes/ReportesPendientesView.tsx`.
- Crear: mock en `docs/mocks/visitas-continuacion/` (Tarea 6).

---

# PR A — La base

> **Ejecutada el 2026-09-23 como `0144`.** El archivo de la migración es la fuente de verdad; difiere
> de este texto en lo que corrigieron las revisiones: (1) `v_patient_visits` se recrea con la lista de
> columnas VIVA (bloque `do` + `execute format`), porque la 0143 sumó columnas a `patient_visits` y `pv.*`
> daba `42P16`; (2) `vap_origen_fk` es `on delete set null` y la prohibición de borrar una visita que
> pasó procedimientos a otra vive en la guarda `trg_guard_borrar_visita` (helper `visita_paso_procedimientos`);
> (3) `register_visit_event` acepta un retest vacío (compat con el front desplegado); (4)
> `set_added_procedures` sólo edita retest y VNP; (5) `revoke … from public, anon` en las funciones nuevas.

### Tarea 1: Rama, número y banco de pruebas PGlite

**Files:**
- Create: `$BANCO/esquema.sql`, `$BANCO/verificar.mjs` (fuera del repo)

**Interfaces:**
- Produces: `$REPO` (raíz del worktree), `$BANCO` (directorio del banco), `$MIG` (ruta de la migración, todavía vacía). `verificar.mjs` exporta nada: se corre como `node verificar.mjs "$REPO" "$MIG"` y sale con código 1 si falla algún chequeo. Las Tareas 2-4 le agregan bloques de tests al final.

- [ ] **Paso 1: Worktree y rama desde `origin/main`**

Desde la carpeta del proyecto (no la del Director si ya estás en un worktree):
```bash
git fetch origin && git worktree add -b feat/visitas-procedimientos-propios-base .claude/worktrees/visitas-base origin/main
```
Expected: `Preparing worktree (new branch 'feat/visitas-procedimientos-propios-base')`. Trabajá desde ahí de acá en adelante.

- [ ] **Paso 2: Resolver el número**

```bash
export REPO="$(git rev-parse --show-toplevel)" && git fetch origin && git ls-tree --name-only origin/main supabase/migrations/ | tail -1
```
Expected: la última migración de `origin/main` (al escribir este plan, `0143_estadisticas_equipo.sql`). El número es el siguiente. Buscá que nadie lo tenga reservado, **con el número pelado y en todo `docs/`**:
```bash
N=0144; git grep -n "$N" origin/main -- docs supabase TODOS.md; for b in $(git branch -r | grep -v HEAD); do git ls-tree --name-only "$b" supabase/migrations/ | grep "^supabase/migrations/$N" && echo "  ↑ en $b"; done
```
(reemplazá `0144` por el que corresponda). Expected: sin resultados. Si aparece una reserva, **pará y preguntale al Director** (regla «lo listo va primero»).
```bash
export MIG="$REPO/supabase/migrations/${N}_visitas_con_procedimientos_propios.sql" && echo "MIG=$MIG"
```

- [ ] **Paso 3: Montar el banco**

PGlite no es dependencia del repo y no se agrega.
```bash
export BANCO="$(dirname "$(mktemp -u)")/pglite-visitas" && mkdir -p "$BANCO" && cd "$BANCO" && npm init -y >/dev/null && npm i @electric-sql/pglite --no-save && echo "BANCO=$BANCO"
```
Expected: instala sin errores. Si la shell se reinicia, volvé a exportar `$REPO`, `$BANCO`, `$MIG` y `N`.

- [ ] **Paso 4: Escribir el esquema de juguete**

Tiene las tablas y funciones que tocan la migración **y** las versiones vivas de las vistas que se recrean (0126, 0137), con los mismos `on delete` que prod. Crear `$BANCO/esquema.sql`:

```sql
-- Roles de Supabase que PGlite no trae: sin ellos el primer grant aborta el exec entero.
create role anon;
create role authenticated;
grant usage on schema public to authenticated;

create schema if not exists auth;
grant usage on schema auth to authenticated;
-- auth.uid() de juguete: se apunta a cada persona con `set spira.uid = '...'`.
create or replace function auth.uid() returns uuid language sql stable as $f$
  select nullif(current_setting('spira.uid', true), '')::uuid
$f$;
grant execute on function auth.uid() to authenticated;

create type visit_kind   as enum ('programada','firma','screening','firma_screening','randomizacion','vnp','retest');
create type visit_status as enum ('futura','proxima','realizada','completa','item_vencido','ventana_vencida','en_atencion','por_reprogramar');
create type visit_type   as enum ('presencial','telefonica');

create table public.users (id uuid primary key, full_name text not null);
-- Roles de juguete: (persona, módulo, rol). En prod es user_module_roles.
create table public.modulos (user_id uuid not null, modulo text not null, rol text not null);
create or replace function public.has_module(m text) returns boolean language sql stable security definer as $f$
  select exists (select 1 from public.modulos where user_id = auth.uid() and modulo = m)
$f$;
create or replace function public.has_min_role(m text, r text) returns boolean language sql stable security definer as $f$
  select exists (select 1 from public.modulos
                 where user_id = auth.uid() and modulo = m
                   and (rol = r or rol = 'admin' or (r = 'operator' and rol = 'leader')))
$f$;

create table public.protocols (id uuid primary key, code text not null, name text not null);
create table public.patients (
  id uuid primary key, code text, full_name text not null, sex text, birth_date date,
  fertility text, treating_physician text);
create table public.enrollments (
  id uuid primary key,
  protocol_id uuid not null references public.protocols(id),
  patient_id uuid not null references public.patients(id),
  status text not null default 'activo',
  randomization_date date,
  enrollment_date date not null default current_date,
  ivrs_code text);
create table public.protocol_coordinators (protocol_id uuid not null, user_id uuid not null);
create or replace function public.is_assigned_coordinator(p uuid) returns boolean language sql stable security definer as $f$
  select exists (select 1 from public.protocol_coordinators where protocol_id = p and user_id = auth.uid())
$f$;

create table public.visit_definitions (
  id uuid primary key, protocol_id uuid not null, code text, name text not null,
  visit_type visit_type not null default 'presencial', sort_order int, offset_days int,
  dispenses boolean default false, dispenses_ip boolean default false,
  role text not null default 'comun', date_mode text not null default 'automatica');
create table public.patient_visits (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id),
  visit_def_id uuid references public.visit_definitions(id),
  kind visit_kind not null default 'programada',
  estimated_date date, real_date date, window_start date, window_end date, notes text,
  arrived_at timestamptz, ready_at timestamptz, left_at timestamptz,
  wants_doctor boolean not null default false, doctor_seen_at timestamptz, doctor_motivo text,
  wants_doctor_at timestamptz, doctor_marked_by uuid,
  coordinator_id uuid, coordinator_name text, no_show_at timestamptz, no_show_by uuid,
  treating_physician text, attended_at timestamptz, lleva_ip boolean);
-- Copia de 0006: la usan las policies de prod y el esquema la necesita para cargar la 0137.
create or replace function public.coordina_visita(v_visit_id uuid)
returns boolean language sql security definer stable as $f$
  select exists (
    select 1 from public.patient_visits pv
    join public.enrollments e            on e.id = pv.enrollment_id
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
    where pv.id = v_visit_id and pc.user_id = auth.uid())
$f$;
create table public.visit_comments (id uuid primary key default gen_random_uuid(), visit_id uuid not null);

create table public.procedures (id uuid primary key, code text, name text not null, category text);
create table public.protocol_procedures (
  id uuid primary key default gen_random_uuid(), protocol_id uuid not null,
  procedure_id uuid not null references public.procedures(id), draws_blood boolean,
  unique (protocol_id, procedure_id));
create table public.protocol_activities (
  id uuid primary key default gen_random_uuid(), protocol_id uuid not null,
  visit_def_id uuid not null references public.visit_definitions(id),
  procedure_id uuid not null references public.procedures(id),
  suggested_order int, created_at timestamptz not null default now());
create table public.report_definitions (
  id uuid primary key default gen_random_uuid(),
  protocol_procedure_id uuid not null references public.protocol_procedures(id),
  name text not null, platform text, link text, eta_hours int, notes text, sort_order int);
create table public.visit_procedure_completions (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.patient_visits(id) on delete cascade,
  procedure_id uuid not null references public.procedures(id) on delete restrict,
  completed_by uuid default auth.uid(),
  completed_at timestamptz not null default now(),
  unique (visit_id, procedure_id));
create table public.report_status (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.patient_visits(id) on delete cascade,
  report_definition_id uuid not null references public.report_definitions(id) on delete cascade,
  stage text not null default 'pendiente', updated_by uuid, updated_by_name text,
  updated_at timestamptz default now(),
  unique (visit_id, report_definition_id));
create table public.report_status_history (id uuid primary key default gen_random_uuid(), report_status_id uuid);
-- Sin IP abierto en ninguna visita: la rama del IP de v_patient_visits no participa de estas pruebas.
create view public.v_visit_ip_status as
  select null::uuid as visit_id, false as sellada, false as abierto where false;

create table public.audit_log (id bigserial primary key, table_name text, row_id uuid, op text);
-- Mismo acceso a `old.id`/`new.id` que la 0003: si la tabla nueva no tuviera `id`, esto revienta.
create or replace function public.audit_row() returns trigger language plpgsql security definer as $f$
begin
  insert into public.audit_log (table_name, row_id, op)
  values (tg_table_name, case when tg_op = 'DELETE' then old.id else new.id end, tg_op);
  return coalesce(new, old);
end $f$;

-- El rol de la app lee todo y escribe lo que el front escribe directo. En prod lo acota la RLS; acá
-- se prueban las guardas, no las policies.
grant select on all tables in schema public to authenticated;
grant insert, delete on public.visit_procedure_completions to authenticated;
grant delete on public.patient_visits to authenticated;
```

- [ ] **Paso 5: Escribir el arnés de `verificar.mjs`**

Crear `$BANCO/verificar.mjs`. Carga el esquema, las vistas **vivas** de prod copiadas de sus migraciones (así el `create or replace` de la migración se prueba contra las columnas reales), la migración, y corre los bloques de tests que las Tareas 2-4 van agregando al final, antes de la última línea.

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
/** Corre `fn` como el rol de la app y con la persona dada; vuelve a superusuario al terminar. */
const como = async (uid, fn) => {
  await db.exec(`set spira.uid = '${uid}'; set role authenticated;`)
  try { return await fn() } finally { await db.exec(`reset role; set spira.uid = '${U.coord}';`) }
}

const U = { coord: '11111111-1111-1111-1111-111111111111', ajena: '22222222-2222-2222-2222-222222222222' }
const P = 'aaaaaaaa-0000-0000-0000-000000000001'
const PAC = 'bbbbbbbb-0000-0000-0000-000000000001'
const E = 'cccccccc-0000-0000-0000-000000000001'   // randomizado hace 60 días
const E2 = 'cccccccc-0000-0000-0000-000000000002'  // sin randomizar
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

- [ ] **Paso 6: Crear la migración con su cabecera y correr el banco vacío**

Crear `$MIG` con esta cabecera (las secciones se agregan en las Tareas 2-4):

```sql
-- Spira · Migración NNNN — Visitas con procedimientos propios: retest, VNP y continuación
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-09-23-visitas-retest-y-continuacion-design.md
-- Plan: docs/superpowers/plans/2026-09-23-visitas-retest-y-continuacion.md
--
-- QUÉ RESUELVE. Un retest o una VNP no podían llevar procedimientos: todo lo que calcula «qué debe
-- esta visita» salía del cronograma (protocol_activities por visit_def_id) y una visita suelta no
-- tiene definición. Y no había forma de desdoblar una visita: si la V3 se cortaba, lo pendiente no
-- tenía adónde ir.
--
-- CÓMO. Una tabla con lo que una visita lleva ADEMÁS de su cronograma, y de qué visita vino
-- (visit_added_procedures). Una vista con la LISTA EFECTIVA de cada visita (v_visit_procedures):
-- el cronograma, menos lo que esta visita pasó a otra, más lo agregado. Las cuatro vistas que
-- calculaban lo que una visita debe pasan a leer de ahí, sin cambiar sus columnas; dos suman
-- columnas AL FINAL. Así el retest hereda reportes, vencimientos y cierre sin reglas nuevas.
--
-- POR QUÉ DIFERIR SACA Y NO SÓLO ANOTA. Desde la 0137 una visita queda «Realizada» mientras tenga
-- un reporte sin evolucionar. Si la V3 siguiera debiendo el laboratorio que pasó a otro día, ese
-- reporte quedaría pendiente para siempre y la V3 no cerraría nunca.
--
-- ORDEN DE DESPLIEGUE: ADITIVA, va PRIMERO. El front viejo lee las vistas con select('*') (las
-- columnas nuevas le sobran) y llama a register_visit_event con cuatro parámetros, que siguen
-- andando: el quinto tiene default. El front nuevo (PR B) NO anda sin esta migración.
--
-- APLICAR a mano en el SQL Editor de Supabase, después de la NNNN-1. IDEMPOTENTE: si algo corta a
-- la mitad, se vuelve a correr el archivo entero. Las sondas del final se MIRAN, no alcanza con el
-- "Success". Registrar en supabase/README.md al confirmarse en prod.
--
-- Probada con PGlite sobre un esquema de juguete, contra las versiones vivas de las vistas.
-- ============================================================================
```
Reemplazá `NNNN` y `NNNN-1` por los números reales. Correr:
```bash
cd "$BANCO" && node verificar.mjs "$REPO" "$MIG"
```
Expected: `Todo en verde` (todavía no hay tests) y código 0. Si falla al cargar `0137` o `0126`, el esquema de juguete no tiene alguna columna que esas vistas usan: agregala en `esquema.sql`.

---

### Tarea 2: La tabla, las funciones auxiliares y la lista efectiva

**Files:**
- Modify: `$MIG` (secciones 1-3)
- Modify: `$BANCO/verificar.mjs` (bloque de la Tarea 2)

**Interfaces:**
- Produces: tabla `public.visit_added_procedures(id, visit_id, procedure_id, deferred_from_visit_id, added_by, added_at)` con constraints **nombradas** `vap_visita_fk`, `vap_origen_fk`, `vap_procedimiento_fk`, `vap_visita_procedimiento_unico`, `vap_origen_distinto` (el front busca `vap_origen_fk` en el mensaje de error, y embebe por `vap_visita_fk`).
- Produces: `public.puede_registrar_visitas(p_protocol_id uuid) → boolean`, `public.procedimiento_diferido(p_visit_id uuid, p_procedure_id uuid) → boolean`, `public.visita_tiene_realizados(p_visit_id uuid) → boolean`.
- Produces: vista `public.v_visit_procedures(visit_id uuid, procedure_id uuid, suggested_order int, origen text, deferred_from_visit_id uuid, procedure_code text, procedure_name text, procedure_category text)`. `origen` ∈ `'cronograma' | 'agregado' | 'diferido'`.

- [ ] **Paso 1: Escribir los tests (fallan)**

Agregar en `verificar.mjs`, en el lugar marcado:

```js
// ── Tarea 2 · la tabla y la lista efectiva ──────────────────────────────────────────────────────
{
  ok('T2 · la V3 lleva lo de su cronograma', (await lista(V3)) === 'LAB:cronograma,VIT:cronograma', await lista(V3))

  const C1 = (await uno(`insert into public.patient_visits (enrollment_id, kind, estimated_date)
                         values ('${E}', 'vnp', current_date + 7) returning id`)).id
  await db.exec(`insert into public.visit_added_procedures (visit_id, procedure_id, deferred_from_visit_id)
                 values ('${C1}', '${PR.lab}', '${V3}')`)
  ok('T2 · lo diferido sale de la V3', (await lista(V3)) === 'VIT:cronograma', await lista(V3))
  ok('T2 · y entra en la continuación', (await lista(C1)) === 'LAB:diferido', await lista(C1))
  ok('T2 · la auditoría registra la fila (la tabla tiene id)',
    Number((await uno(`select count(*) from public.audit_log where table_name = 'visit_added_procedures'`)).count) === 1)

  await db.exec(`delete from public.patient_visits where id = '${C1}'`)
  ok('T2 · borrar la continuación devuelve lo diferido', (await lista(V3)) === 'LAB:cronograma,VIT:cronograma', await lista(V3))

  // Cadena V3 → C1 → C2: C1 pasa a C2 lo que había recibido de la V3.
  const C1b = (await uno(`insert into public.patient_visits (enrollment_id, kind, estimated_date)
                          values ('${E}', 'vnp', current_date + 7) returning id`)).id
  const C2 = (await uno(`insert into public.patient_visits (enrollment_id, kind, estimated_date)
                         values ('${E}', 'vnp', current_date + 14) returning id`)).id
  await db.exec(`insert into public.visit_added_procedures (visit_id, procedure_id, deferred_from_visit_id) values
                 ('${C1b}', '${PR.lab}', '${V3}'), ('${C2}', '${PR.lab}', '${C1b}')`)
  ok('T2 · cadena: la V3 sigue sin deberlo', (await lista(V3)) === 'VIT:cronograma', await lista(V3))
  ok('T2 · cadena: C1 ya no lo debe', (await lista(C1b)) === '', await lista(C1b))
  ok('T2 · cadena: C2 lo debe', (await lista(C2)) === 'LAB:diferido', await lista(C2))
  await falla('T2 · no se borra una visita que pasó cosas a otra',
    () => db.exec(`delete from public.patient_visits where id = '${C1b}'`), 'vap_origen_fk')
  await falla('T2 · una visita no se difiere a sí misma',
    () => db.exec(`insert into public.visit_added_procedures (visit_id, procedure_id, deferred_from_visit_id)
                   values ('${C2}', '${PR.vit}', '${C2}')`), 'vap_origen_distinto')

  await db.exec(`delete from public.patient_visits where id = '${C2}'; delete from public.patient_visits where id = '${C1b}';`)
  ok('T2 · limpio: la V3 vuelve a su cronograma', (await lista(V3)) === 'LAB:cronograma,VIT:cronograma', await lista(V3))
}
```

- [ ] **Paso 2: Correr y ver que falla**

```bash
cd "$BANCO" && node verificar.mjs "$REPO" "$MIG"
```
Expected: se corta con `relation "public.v_visit_procedures" does not exist`.

- [ ] **Paso 3: Escribir las secciones 1-3 de la migración**

Agregar al final de `$MIG`:

```sql
-- 1 · La tabla: lo que una visita lleva ADEMÁS de su cronograma -----------------------------------
-- Para una visita suelta (retest, VNP), que no tiene cronograma, es todo lo que lleva.
-- `deferred_from_visit_id` = la visita de la que vino: nulo si se agregó a mano.
--
-- LAS DOS FK A patient_visits TIRAN PARA LADOS OPUESTOS, y a propósito:
--   · vap_visita_fk, CASCADE: borrar la continuación borra sus filas, y con eso lo diferido vuelve a
--     figurar pendiente en la visita de origen. Nadie tiene que acordarse de devolverlo.
--   · vap_origen_fk, RESTRICT: en una cadena V3 → C1 → C2, borrar C1 dejaría a C2 con un origen
--     que no existe mientras la V3 recupera el procedimiento: el mismo procedimiento pendiente en
--     dos visitas. No se borra una visita que pasó cosas a otra mientras la otra exista.
-- Las constraints van NOMBRADAS: el front reconoce el bloqueo por `vap_origen_fk` y embebe la
-- visita destino por `vap_visita_fk` (con dos FK a la misma tabla, el embed sin nombre es ambiguo).
-- `id` es la clave aunque la unicidad sea (visita, procedimiento): audit_row() resuelve `old.id`
-- al planificar (0003, pasó con la 0111).
create table if not exists public.visit_added_procedures (
  id                     uuid primary key default gen_random_uuid(),
  visit_id               uuid not null,
  procedure_id           uuid not null,
  deferred_from_visit_id uuid,
  added_by               uuid not null default auth.uid() references public.users(id),
  added_at               timestamptz not null default now(),
  constraint vap_visita_fk         foreign key (visit_id)               references public.patient_visits(id) on delete cascade,
  constraint vap_origen_fk         foreign key (deferred_from_visit_id) references public.patient_visits(id) on delete restrict,
  constraint vap_procedimiento_fk  foreign key (procedure_id)           references public.procedures(id)     on delete restrict,
  constraint vap_visita_procedimiento_unico unique (visit_id, procedure_id),
  constraint vap_origen_distinto   check (deferred_from_visit_id is distinct from visit_id)
);
create index if not exists ix_vap_origen on public.visit_added_procedures (deferred_from_visit_id)
  where deferred_from_visit_id is not null;
comment on table public.visit_added_procedures is
  'Procedimientos que una visita lleva además de su cronograma, y de qué visita vinieron (continuación). Se escribe sólo por RPC. NNNN.';

-- RLS: se ve si se ve la visita. El subselect corre con la RLS de patient_visits de quien consulta,
-- así que el alcance es exactamente el de la visita, sin copiar su regla.
alter table public.visit_added_procedures enable row level security;
drop policy if exists "ver procedimientos agregados" on public.visit_added_procedures;
create policy "ver procedimientos agregados" on public.visit_added_procedures for select using (
  exists (select 1 from public.patient_visits pv where pv.id = visit_added_procedures.visit_id));
revoke all on public.visit_added_procedures from anon;
revoke insert, update, delete, truncate, references, trigger on public.visit_added_procedures from authenticated;
grant select on public.visit_added_procedures to authenticated;

drop trigger if exists trg_audit_vap on public.visit_added_procedures;
create trigger trg_audit_vap after insert or update or delete
  on public.visit_added_procedures for each row execute function public.audit_row();


-- 2 · Tres preguntas que se hacen las RPC y las guardas --------------------------------------------
-- SECURITY DEFINER las tres: responden igual para cualquiera que pregunte, sin depender de qué
-- filas le deja ver su RLS.

-- Quién puede agendar o cambiar visitas de un estudio. Es la regla de register_visit_event (0030),
-- sacada a una función para que las tres RPC de esta migración digan lo mismo.
create or replace function public.puede_registrar_visitas(p_protocol_id uuid)
returns boolean language sql security definer stable set search_path = pg_catalog, public as $fn$
  select public.has_module('gerencia') or public.has_min_role('track', 'admin')
      or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(p_protocol_id));
$fn$;

-- Si esta visita pasó ESTE procedimiento a otra.
create or replace function public.procedimiento_diferido(p_visit_id uuid, p_procedure_id uuid)
returns boolean language sql security definer stable set search_path = pg_catalog, public as $fn$
  select exists (select 1 from public.visit_added_procedures a
                 where a.deferred_from_visit_id = p_visit_id and a.procedure_id = p_procedure_id);
$fn$;

-- Si la visita tiene algún procedimiento marcado como realizado.
create or replace function public.visita_tiene_realizados(p_visit_id uuid)
returns boolean language sql security definer stable set search_path = pg_catalog, public as $fn$
  select exists (select 1 from public.visit_procedure_completions c where c.visit_id = p_visit_id);
$fn$;

revoke all on function public.puede_registrar_visitas(uuid) from public;
revoke all on function public.procedimiento_diferido(uuid, uuid) from public;
revoke all on function public.visita_tiene_realizados(uuid) from public;
grant execute on function public.puede_registrar_visitas(uuid) to authenticated;
grant execute on function public.procedimiento_diferido(uuid, uuid) to authenticated;
grant execute on function public.visita_tiene_realizados(uuid) to authenticated;


-- 3 · La LISTA EFECTIVA de cada visita -------------------------------------------------------------
-- Lo del cronograma que esta visita NO pasó a otra, más lo agregado que esta visita NO pasó a otra.
-- La segunda condición es la que hace andar la cadena V3 → C1 → C2: la fila de C1 que vino de la V3
-- sigue existiendo (así la V3 sigue sin deberlo), pero C1 tampoco lo debe porque lo pasó a C2.
-- Trae el nombre del procedimiento para que el front no tenga que embeber sobre una vista con
-- `union`, donde PostgREST no puede inferir la relación.
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
                  where d.deferred_from_visit_id = a.visit_id and d.procedure_id = a.procedure_id);

comment on view public.v_visit_procedures is
  'Lista efectiva de procedimientos de cada visita: cronograma − lo que pasó a otra visita + lo agregado. Única fuente de «qué debe esta visita». NNNN.';
revoke all on public.v_visit_procedures from anon;
grant select on public.v_visit_procedures to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_visit_procedures from authenticated;
```

- [ ] **Paso 4: Correr y ver que pasa**

```bash
cd "$BANCO" && node verificar.mjs "$REPO" "$MIG"
```
Expected: todas las líneas `✓ T2 · …` y `Todo en verde`.

- [ ] **Paso 5: Commit**

```bash
cd "$REPO" && git add "supabase/migrations/${N}_visitas_con_procedimientos_propios.sql" && git commit -m "feat(base): lista efectiva de procedimientos por visita (tabla + vista)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 3: Recablear las vistas que calculan «qué debe esta visita»

**Files:**
- Modify: `$MIG` (secciones 4-6)
- Modify: `$BANCO/verificar.mjs` (bloque de la Tarea 3)

**Interfaces:**
- Consumes: `v_visit_procedures` (Tarea 2).
- Produces: `v_patient_visits` y `v_procedure_report_alerts` con **las mismas columnas**. `v_protocol_report_status` suma **al final** `visit_kind visit_kind`. `v_track_visits` suma **al final** `origin_visit_id uuid, origin_code text, origin_name text, origin_kind visit_kind` (null salvo en una continuación).

- [ ] **Paso 1: Escribir los tests (fallan)**

Agregar en `verificar.mjs`, después del bloque de la Tarea 2:

```js
// ── Tarea 3 · el recableado ─────────────────────────────────────────────────────────────────────
{
  const estado = async (v) => (await uno(`select computed_status from public.v_patient_visits where id = $1`, [v])).computed_status

  await db.exec(`update public.patient_visits set real_date = current_date - 2 where id = '${V3}'`)
  ok('T3 · atendida con un reporte sin hacer: Realizada', (await estado(V3)) === 'realizada', await estado(V3))

  const C1 = (await uno(`insert into public.patient_visits (enrollment_id, kind, estimated_date)
                         values ('${E}', 'vnp', current_date + 7) returning id`)).id
  await db.exec(`insert into public.visit_added_procedures (visit_id, procedure_id, deferred_from_visit_id)
                 values ('${C1}', '${PR.lab}', '${V3}')`)
  ok('T3 · con el laboratorio pasado a otro día, la V3 CIERRA', (await estado(V3)) === 'completa', await estado(V3))

  const t = await uno(`select origin_visit_id, origin_code, origin_name, origin_kind from public.v_track_visits where id = $1`, [C1])
  ok('T3 · la continuación sabe de dónde viene',
    t.origin_visit_id === V3 && t.origin_name === 'V3 W4' && t.origin_kind === 'programada', JSON.stringify(t))
  const t3 = await uno(`select origin_visit_id from public.v_track_visits where id = $1`, [V3])
  ok('T3 · una visita que no es continuación no tiene origen', t3.origin_visit_id === null, JSON.stringify(t3))

  const rep = async (v) => (await db.query(`select report_name, visit_kind from public.v_protocol_report_status where visit_id = $1`, [v])).rows
  ok('T3 · el reporte del laboratorio ya no es de la V3', (await rep(V3)).length === 0, JSON.stringify(await rep(V3)))
  const repC = await rep(C1)
  ok('T3 · es de la continuación, que se reconoce por su tipo',
    repC.length === 1 && repC[0].report_name === 'Informe de laboratorio' && repC[0].visit_kind === 'vnp', JSON.stringify(repC))

  // Un retest con un hemograma hecho hace 72 h y el informe (48 h) sin descargar: vencido.
  const R = (await uno(`insert into public.patient_visits (enrollment_id, kind, estimated_date, real_date)
                        values ('${E}', 'retest', current_date - 3, current_date - 3) returning id`)).id
  await db.exec(`insert into public.visit_added_procedures (visit_id, procedure_id) values ('${R}', '${PR.hem}');
                 insert into public.visit_procedure_completions (visit_id, procedure_id, completed_at)
                   values ('${R}', '${PR.hem}', now() - interval '72 hours');`)
  ok('T3 · un retest con el informe vencido: item_vencido', (await estado(R)) === 'item_vencido', await estado(R))
  ok('T3 · y aparece en las alertas de reportes',
    Number((await uno(`select count(*) from public.v_procedure_report_alerts where visit_id = $1`, [R])).count) === 1)

  const opciones = (await db.query(`select c.relname, c.reloptions::text as o from pg_class c
    where c.relname in ('v_visit_procedures','v_patient_visits','v_track_visits','v_procedure_report_alerts','v_protocol_report_status')`)).rows
  ok('T3 · las cinco vistas corren con los permisos de quien consulta',
    opciones.length === 5 && opciones.every((r) => (r.o ?? '').includes('security_invoker=true')), JSON.stringify(opciones))
  const viejas = (await db.query(`select viewname from pg_views where schemaname = 'public'
    and definition ilike '%protocol_activities%' order by 1`)).rows.map((r) => r.viewname)
  ok('T3 · sólo v_visit_procedures lee el cronograma', viejas.join(',') === 'v_visit_procedures', viejas.join(','))

  await db.exec(`delete from public.patient_visits where id in ('${R}', '${C1}');
                 update public.patient_visits set real_date = null where id = '${V3}';`)
}
```

- [ ] **Paso 2: Correr y ver que falla**

```bash
cd "$BANCO" && node verificar.mjs "$REPO" "$MIG"
```
Expected: `✗ T3 · con el laboratorio pasado a otro día, la V3 CIERRA` (sigue en `realizada`) y el script se corta en `origin_visit_id` (`column does not exist`).

- [ ] **Paso 3: Escribir las secciones 4-6 de la migración**

Agregar al final de `$MIG`:

```sql
-- 4 · v_patient_visits: las ramas 5 y 6 leen la lista efectiva ---------------------------------
-- Copia de la 0137 salvo los dos `exists` de reportes, que pasan de
--     protocol_activities pa ... where pa.visit_def_id = pv.visit_def_id
-- a  v_visit_procedures vp ... where vp.visit_id = pv.id.
-- Efecto: la V3 deja de deber lo que pasó a otro día (y cierra), y un retest pasa a deber lo suyo.
-- Mismas columnas: `create or replace`, sin drop, y v_track_visits no se entera.
create or replace view public.v_patient_visits with (security_invoker = true) as
select
  pv.*,
  ( case
      -- 1 · En el centro hoy y sin cerrar la atención (anclado a la hora argentina, 0120).
      when pv.ready_at is null and pv.arrived_at is not null
       and (pv.arrived_at at time zone 'America/Argentina/Buenos_Aires')::date
         = (now()          at time zone 'America/Argentina/Buenos_Aires')::date
        then 'en_atencion'
      -- 2 · Ventana vencida. `current_date` es UTC: inconsistencia PREEXISTENTE (0004), sin tocar.
      when pv.real_date is null and current_date > pv.window_end then 'ventana_vencida'
      -- 3 · Faltó y todavía no tiene fecha nueva.
      when pv.real_date is null and pv.no_show_at is not null    then 'por_reprogramar'
      -- 4 · Pendiente.
      when pv.real_date is null                                  then 'proxima'
      -- 5 · Un reporte de un procedimiento hecho, en 'pendiente' y fuera de plazo.
      when exists (
        select 1
        from public.v_visit_procedures vp
        join public.enrollments e          on e.id  = pv.enrollment_id
        join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                          and pp.procedure_id = vp.procedure_id
        join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
        join public.visit_procedure_completions vpc
             on vpc.visit_id = pv.id and vpc.procedure_id = vp.procedure_id
        left join public.report_status rs
             on rs.visit_id = pv.id and rs.report_definition_id = rd.id
        where vp.visit_id = pv.id
          and rd.eta_hours is not null
          and coalesce(rs.stage, 'pendiente') = 'pendiente'
          and now() > vpc.completed_at + (rd.eta_hours * interval '1 hour')
      ) then 'item_vencido'
      -- 6 · Atendida con pendientes: un reporte sin evolucionar, o el IP abierto (0120).
      when exists (
        select 1
        from public.v_visit_procedures vp
        join public.enrollments e          on e.id  = pv.enrollment_id
        join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                          and pp.procedure_id = vp.procedure_id
        join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
        left join public.report_status rs
             on rs.visit_id = pv.id and rs.report_definition_id = rd.id
        where vp.visit_id = pv.id
          and coalesce(rs.stage, 'pendiente') <> 'evolucionado'
      ) or exists (
        select 1 from public.v_visit_ip_status s
        where s.visit_id = pv.id and s.sellada and s.abierto
      ) then 'realizada'
      else 'completa'
    end )::visit_status as computed_status,
  ( case
      when pv.ready_at   is not null then 'fin_atencion'
      when pv.real_date  is not null then 'inicio_atencion'
      when pv.arrived_at is not null then 'concurrio_al_centro'
      else 'por_llegar'
    end ) as operational_stage
from public.patient_visits pv;

comment on view public.v_patient_visits is
  'patient_visits + estado clínico + recorrido operativo. NNNN: los reportes que la visita debe salen de v_visit_procedures (lista efectiva), no del cronograma. Resto como la 0137.';
revoke all on public.v_patient_visits from anon;
grant select on public.v_patient_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_patient_visits from authenticated;


-- 5 · Las dos vistas de reportes leen la lista efectiva ------------------------------------------
-- Copias de la 0126 con el mismo cambio de join. v_protocol_report_status suma `visit_kind` AL
-- FINAL: el tablero nombraba la visita por su definición, y un retest no tiene.
create or replace view public.v_procedure_report_alerts with (security_invoker = true) as
select
  pv.id              as visit_id,
  rd.id              as report_definition_id,
  vp.procedure_id,
  rd.name            as report_name,
  rd.platform,
  p.name             as procedure_name,
  rd.eta_hours,
  vpc.completed_at,
  (vpc.completed_at + (rd.eta_hours * interval '1 hour')) as report_due_at,
  e.protocol_id, e.patient_id,
  pr.code  as protocol_code, pr.name as protocol_name,
  coalesce(e.ivrs_code, pac.code) as patient_code,  pac.full_name as patient_name,
  vd.name  as visit_name,    vd.code as visit_code,
  coalesce(pv.treating_physician, pac.treating_physician) as treating_physician,
  pv.coordinator_id,
  pv.coordinator_name
from public.patient_visits pv
join public.enrollments e          on e.id  = pv.enrollment_id
join public.v_visit_procedures vp  on vp.visit_id = pv.id
join public.protocol_procedures pp on pp.protocol_id = e.protocol_id
                                  and pp.procedure_id = vp.procedure_id
join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
join public.procedures p           on p.id  = vp.procedure_id
join public.protocols pr           on pr.id = e.protocol_id
join public.patients pac           on pac.id = e.patient_id
join public.visit_procedure_completions vpc
     on vpc.visit_id = pv.id and vpc.procedure_id = vp.procedure_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
left join public.report_status rs     on rs.visit_id = pv.id and rs.report_definition_id = rd.id
where rd.eta_hours is not null
  and coalesce(rs.stage, 'pendiente') = 'pendiente'
  and now() > vpc.completed_at + (rd.eta_hours * interval '1 hour');

comment on view public.v_procedure_report_alerts is
  'Reportes vencidos. NNNN: los procedimientos salen de v_visit_procedures (lista efectiva). patient_code = IVRS de la inscripción (0126).';

create or replace view public.v_protocol_report_status with (security_invoker = true) as
select
  pv.id as visit_id,
  rd.id                as report_definition_id,
  rd.name              as report_name,
  rd.platform,
  rd.link,
  rd.eta_hours,
  rd.notes,
  rd.sort_order,
  vp.procedure_id,
  p.name               as procedure_name,
  p.code               as procedure_code,
  p.category           as procedure_category,
  vp.suggested_order   as procedure_order,
  vpc.completed_at,
  (vpc.id is not null)                                as completed,
  (pv.real_date is not null or vpc.id is not null)    as visita_iniciada,
  case when rd.eta_hours is null or vpc.completed_at is null then null
       else vpc.completed_at + (rd.eta_hours * interval '1 hour') end as due_at,
  coalesce(rs.stage, 'pendiente') as stage,
  rs.id                as report_status_id,
  rs.updated_at,
  rs.updated_by_name,
  e.protocol_id,
  e.patient_id,
  pv.visit_def_id,
  pr.code              as protocol_code,
  coalesce(e.ivrs_code, pac.code)             as patient_code,
  pac.full_name        as patient_name,
  vd.code              as visit_code,
  vd.name              as visit_name,
  vd.sort_order        as visit_sort_order,
  (select count(*) from public.report_status_history h where h.report_status_id = rs.id) as history_count,
  pv.coordinator_id,
  pv.coordinator_name,
  -- NNNN: al final para no alterar el orden anterior. Nombra la visita cuando no tiene definición.
  pv.kind              as visit_kind
from public.patient_visits pv
join public.enrollments e             on e.id  = pv.enrollment_id
join public.v_visit_procedures vp     on vp.visit_id = pv.id
join public.protocol_procedures pp    on pp.protocol_id = e.protocol_id and pp.procedure_id = vp.procedure_id
join public.report_definitions rd     on rd.protocol_procedure_id = pp.id
join public.procedures p              on p.id  = vp.procedure_id
join public.protocols pr              on pr.id = e.protocol_id
join public.patients pac              on pac.id = e.patient_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
left join public.visit_procedure_completions vpc
       on vpc.visit_id = pv.id and vpc.procedure_id = vp.procedure_id
left join public.report_status rs     on rs.visit_id = pv.id and rs.report_definition_id = rd.id;

comment on view public.v_protocol_report_status is
  'Tablero «Reportes pendientes». NNNN: los procedimientos salen de v_visit_procedures (lista efectiva) y suma visit_kind al final. patient_code = IVRS de la inscripción (0126).';


-- 6 · v_track_visits: la visita de origen de una continuación, al final --------------------------
-- Copia de la 0126 + cuatro columnas AL FINAL, para que el front arme «Continuación de V3» sin una
-- segunda consulta. Una continuación tiene un solo origen (set_added_procedures no agrega con
-- origen), así que el `limit 1` no elige entre dos.
create or replace view public.v_track_visits with (security_invoker = true) as
select
  v.id, v.enrollment_id, v.visit_def_id, v.estimated_date, v.real_date,
  v.window_start, v.window_end, v.notes, v.computed_status,
  vd.code as visit_code, vd.name as visit_name,
  coalesce(vd.visit_type, 'presencial') as visit_type, vd.sort_order,
  e.protocol_id, e.patient_id, e.status as enrollment_status,
  e.randomization_date as enrollment_randomization_date,
  pr.code as protocol_code, pr.name as protocol_name,
  coalesce(e.ivrs_code, pa.code) as patient_code, pa.full_name as patient_name,
  pa.sex, pa.birth_date,
  pa.fertility,
  vd.offset_days, e.enrollment_date,
  coalesce(v.treating_physician, pa.treating_physician) as treating_physician,
  v.coordinator_id, v.coordinator_name,
  v.kind,
  v.arrived_at, v.ready_at, v.left_at, v.no_show_at,
  v.attended_at,
  v.wants_doctor,
  v.doctor_seen_at,
  v.doctor_motivo,
  v.wants_doctor_at, v.doctor_marked_by,
  coalesce(vd.dispenses, false) as dispenses,
  coalesce(vd.dispenses_ip, false) as dispenses_ip,
  v.operational_stage,
  vd.role, vd.date_mode,
  (select count(*) from public.visit_comments vc where vc.visit_id = v.id) as comments_count,
  -- NNNN: al final para no alterar el orden anterior.
  ori.visit_id as origin_visit_id,
  ovd.code     as origin_code,
  ovd.name     as origin_name,
  opv.kind     as origin_kind
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id
left join lateral (
  select a.deferred_from_visit_id as visit_id
  from public.visit_added_procedures a
  where a.visit_id = v.id and a.deferred_from_visit_id is not null
  order by a.added_at
  limit 1
) ori on true
left join public.patient_visits opv    on opv.id = ori.visit_id
left join public.visit_definitions ovd on ovd.id = opv.visit_def_id;

comment on view public.v_track_visits is
  'Visitas de Coordinación. patient_code = IVRS de la inscripción (0126). NNNN: suma origin_* al final (la visita de la que viene una continuación).';
```

- [ ] **Paso 4: Correr y ver que pasa**

```bash
cd "$BANCO" && node verificar.mjs "$REPO" "$MIG"
```
Expected: `✓` en todo T2 y T3, `Todo en verde`. Si falla un `create or replace view` con `cannot drop columns from view` o `cannot change name of view column`, la copia no respeta el orden de la vista viva: compará línea a línea con la 0126/0137, **no** agregues `drop ... cascade`.

- [ ] **Paso 5: Commit**

```bash
cd "$REPO" && git add "supabase/migrations/${N}_visitas_con_procedimientos_propios.sql" && git commit -m "feat(base): las vistas de estado y reportes leen la lista efectiva

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 4: Las RPC y las guardas

**Files:**
- Modify: `$MIG` (secciones 7-10)
- Modify: `$BANCO/verificar.mjs` (bloque de la Tarea 4)

**Interfaces:**
- Consumes: `puede_registrar_visitas`, `procedimiento_diferido`, `visita_tiene_realizados`, `v_visit_procedures` (Tarea 2).
- Produces (las llama el front de la PR B, por parámetros **nombrados**):
  - `register_visit_event(p_enrollment_id uuid, p_kind visit_kind, p_date date, p_notes text default null, p_procedure_ids uuid[] default '{}') → uuid`
  - `diferir_procedimientos(p_visita_origen uuid, p_procedure_ids uuid[], p_fecha date) → uuid` (id de la continuación)
  - `set_added_procedures(p_visit_id uuid, p_procedure_ids uuid[]) → void`
- Produces (mensajes que el front muestra tal cual, errcode `23514`): «Elegí al menos un procedimiento para el retest», «Ese procedimiento no es de este estudio», «Solo se pasan a otro día los procedimientos que esta visita todavía no hizo», «Ese procedimiento pasó a otra visita: se marca allá», «Esta visita ya tiene procedimientos marcados como realizados. Desmarcalos antes de borrarla.», «No se puede quitar un procedimiento que ya está marcado como realizado», «Un retest lleva al menos un procedimiento», «Los procedimientos de una visita del cronograma se editan en el cronograma del protocolo».

- [ ] **Paso 1: Escribir los tests (fallan)**

Agregar en `verificar.mjs`, después del bloque de la Tarea 3:

```js
// ── Tarea 4 · RPC y guardas, como la coordinadora ───────────────────────────────────────────────
{
  const rpc = (sql, params = []) => como(U.coord, () => db.query(sql, params))
  const idDe = (res) => Object.values(res.rows[0])[0]

  // Alta de un retest ANTES de randomizar (E2 no randomizó), con su hemograma.
  const R2 = idDe(await rpc(`select public.register_visit_event(
      p_enrollment_id => $1, p_kind => 'retest', p_date => current_date + 3, p_notes => null,
      p_procedure_ids => array[$2]::uuid[])`, [E2, PR.hem]))
  ok('T4 · retest antes de randomizar, con su procedimiento', (await lista(R2)) === 'HEM:agregado', await lista(R2))
  await falla('T4 · un retest vacío se rechaza',
    () => rpc(`select public.register_visit_event(p_enrollment_id => $1, p_kind => 'retest', p_date => current_date)`, [E]),
    'al menos un procedimiento')
  await falla('T4 · un procedimiento de otro estudio se rechaza',
    () => rpc(`select public.register_visit_event(p_enrollment_id => $1, p_kind => 'vnp', p_date => current_date,
               p_procedure_ids => array[$2]::uuid[])`, [E, PR.ecg]), 'no es de este estudio')
  // La llamada del front VIEJO: cuatro parámetros nombrados, sin el quinto.
  const vnp = idDe(await rpc(`select public.register_visit_event(p_enrollment_id => $1, p_kind => 'vnp',
      p_date => current_date + 1, p_notes => null)`, [E]))
  ok('T4 · la llamada vieja de cuatro parámetros sigue andando', !!vnp)
  ok('T4 · register_visit_event quedó con una sola firma',
    Number((await uno(`select count(*) from pg_proc where proname = 'register_visit_event'`)).count) === 1)

  // Pasar el laboratorio de la V3 a otro día.
  const C = idDe(await rpc(`select public.diferir_procedimientos($1, array[$2]::uuid[], current_date + 7)`, [V3, PR.lab]))
  ok('T4 · diferir saca el laboratorio de la V3', (await lista(V3)) === 'VIT:cronograma', await lista(V3))
  ok('T4 · y la continuación nace con él', (await lista(C)) === 'LAB:diferido', await lista(C))
  await falla('T4 · lo diferido no se tilda en la V3',
    () => rpc(`insert into public.visit_procedure_completions (visit_id, procedure_id) values ($1, $2)`, [V3, PR.lab]),
    'pasó a otra visita')
  await rpc(`insert into public.visit_procedure_completions (visit_id, procedure_id) values ($1, $2)`, [V3, PR.vit])
  await falla('T4 · lo ya hecho no se difiere',
    () => rpc(`select public.diferir_procedimientos($1, array[$2]::uuid[], current_date + 7)`, [V3, PR.vit]),
    'todavía no hizo')
  await falla('T4 · lo que la visita no lleva no se difiere',
    () => rpc(`select public.diferir_procedimientos($1, array[$2]::uuid[], current_date + 7)`, [V3, PR.hem]),
    'todavía no hizo')
  await falla('T4 · una persona sin permiso no difiere',
    () => como(U.ajena, () => db.query(`select public.diferir_procedimientos($1, array[$2]::uuid[], current_date + 7)`, [V3, PR.lab])),
    'No tenés permiso')
  await falla('T4 · los procedimientos de una visita del cronograma no se editan acá',
    () => rpc(`select public.set_added_procedures($1, '{}'::uuid[])`, [V3]), 'cronograma')

  // Cadena: la continuación pasa el laboratorio a otra, y después se edita sin tocarlo.
  const C2 = idDe(await rpc(`select public.diferir_procedimientos($1, array[$2]::uuid[], current_date + 14)`, [C, PR.lab]))
  await rpc(`select public.set_added_procedures($1, '{}'::uuid[])`, [C])
  ok('T4 · editar C1 no suelta lo que C1 pasó a C2', (await lista(C2)) === 'LAB:diferido' && (await lista(V3)) === 'VIT:cronograma',
    `C2=${await lista(C2)} V3=${await lista(V3)}`)
  await rpc(`select public.set_added_procedures($1, '{}'::uuid[])`, [C2])
  ok('T4 · quitarlo de C2 lo devuelve a C1', (await lista(C)) === 'LAB:diferido', await lista(C))

  // Guardas del borrado y de la edición de un retest con algo hecho.
  await rpc(`insert into public.visit_procedure_completions (visit_id, procedure_id) values ($1, $2)`, [R2, PR.hem])
  await falla('T4 · no se borra una suelta con procedimientos realizados',
    () => rpc(`delete from public.patient_visits where id = $1`, [R2]), 'marcados como realizados')
  await falla('T4 · no se quita lo ya realizado',
    () => rpc(`select public.set_added_procedures($1, '{}'::uuid[])`, [R2]), 'ya está marcado como realizado')
  const R3 = idDe(await rpc(`select public.register_visit_event(p_enrollment_id => $1, p_kind => 'retest',
      p_date => current_date + 5, p_procedure_ids => array[$2]::uuid[])`, [E, PR.hem]))
  await falla('T4 · un retest no se queda sin procedimientos',
    () => rpc(`select public.set_added_procedures($1, '{}'::uuid[])`, [R3]), 'al menos un procedimiento')

  // Limpieza como superusuario (la guarda del borrado deja pasar a postgres, como en el editor).
  await db.exec(`delete from public.visit_procedure_completions where visit_id in ('${V3}', '${R2}');
                 delete from public.patient_visits where id in ('${C2}');
                 delete from public.patient_visits where id in ('${C}', '${R2}', '${R3}', '${vnp}');`)
  ok('T4 · limpio: la V3 vuelve a su cronograma', (await lista(V3)) === 'LAB:cronograma,VIT:cronograma', await lista(V3))
}
```

- [ ] **Paso 2: Correr y ver que falla**

```bash
cd "$BANCO" && node verificar.mjs "$REPO" "$MIG"
```
Expected: se corta en el primer `register_visit_event` con `p_procedure_ids` (`function ... does not exist`).

- [ ] **Paso 3: Escribir las secciones 7-10 de la migración**

Agregar al final de `$MIG`:

```sql
-- 7 · register_visit_event: procedimientos propios, y el retest en cualquier etapa ------------------
-- Cuerpo de la 0030 con tres cambios: (a) la authz sale de puede_registrar_visitas (misma regla);
-- (b) se va el «Retest es solo post-randomización» — el retest de screening es el más común;
-- (c) recibe p_procedure_ids y los guarda en visit_added_procedures.
-- La firma cambia, así que va el DROP de la vieja: `create or replace` con un parámetro más deja
-- una sobrecarga viva, y la llamada de cuatro argumentos resolvería a la vieja en silencio. El
-- quinto parámetro tiene default: el front viejo, que manda cuatro, sigue andando con la nueva.
drop function if exists public.register_visit_event(uuid, visit_kind, date, text);
create or replace function public.register_visit_event(
  p_enrollment_id uuid, p_kind visit_kind, p_date date, p_notes text default null,
  p_procedure_ids uuid[] default '{}'
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
  if p_kind = 'retest' and cardinality(v_procs) = 0 then
    raise exception 'Elegí al menos un procedimiento para el retest' using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(v_procs) as t(x)
             where not exists (select 1 from public.protocol_procedures pp
                               where pp.protocol_id = v_protocol and pp.procedure_id = t.x)) then
    raise exception 'Ese procedimiento no es de este estudio' using errcode = 'check_violation';
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
  insert into public.patient_visits (enrollment_id, kind, estimated_date, notes)
  values (p_enrollment_id, p_kind, p_date, nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_visit;

  insert into public.visit_added_procedures (visit_id, procedure_id, added_by)
  select v_visit, t.x, v_uid from unnest(v_procs) as t(x);

  -- Anclaje legacy (sólo protocolos SIN cuadro: el cutover de arriba bloquea este kind si hay cuadro).
  if p_kind = 'randomizacion' then
    update public.enrollments set randomization_date = p_date where id = p_enrollment_id;
  end if;

  return v_visit;
end $fn$;
revoke all on function public.register_visit_event(uuid, visit_kind, date, text, uuid[]) from public;
grant execute on function public.register_visit_event(uuid, visit_kind, date, text, uuid[]) to authenticated;


-- 8 · diferir_procedimientos: pasar lo pendiente de una visita a una continuación ------------------
-- Crea la continuación (una VNP con fecha propia) y sus filas en una sola transacción. Sólo acepta
-- lo que la visita todavía DEBE (su lista efectiva) y NO hizo: lo hecho ya tiene su reporte en
-- marcha, y lo que no lleva no tiene nada que pasar.
create or replace function public.diferir_procedimientos(
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
    raise exception 'Elegí qué procedimientos pasan a otro día' using errcode = 'check_violation';
  end if;

  -- El lock serializa dos «pasar a otro día» simultáneos sobre la misma visita: sin él, los dos
  -- verían el procedimiento pendiente y lo mandarían a dos continuaciones distintas.
  select pv.enrollment_id, e.protocol_id into v_enrollment, v_protocol
  from public.patient_visits pv
  join public.enrollments e on e.id = pv.enrollment_id
  where pv.id = p_visita_origen
  for update of pv;
  if v_enrollment is null then raise exception 'Esa visita ya no existe' using errcode = '23503'; end if;
  if not public.puede_registrar_visitas(v_protocol) then
    raise exception 'No tenés permiso para cambiar las visitas de este paciente' using errcode = '42501';
  end if;

  if exists (
    select 1 from unnest(v_procs) as t(x)
    where not exists (select 1 from public.v_visit_procedures vp
                      where vp.visit_id = p_visita_origen and vp.procedure_id = t.x)
       or exists (select 1 from public.visit_procedure_completions c
                  where c.visit_id = p_visita_origen and c.procedure_id = t.x)
  ) then
    raise exception 'Solo se pasan a otro día los procedimientos que esta visita todavía no hizo' using errcode = 'check_violation';
  end if;

  insert into public.patient_visits (enrollment_id, kind, estimated_date)
  values (v_enrollment, 'vnp', p_fecha)
  returning id into v_visit;

  insert into public.visit_added_procedures (visit_id, procedure_id, deferred_from_visit_id, added_by)
  select v_visit, t.x, p_visita_origen, v_uid from unnest(v_procs) as t(x);

  return v_visit;
end $fn$;
revoke all on function public.diferir_procedimientos(uuid, uuid[], date) from public;
grant execute on function public.diferir_procedimientos(uuid, uuid[], date) to authenticated;


-- 9 · set_added_procedures: editar lo que lleva una visita suelta ---------------------------------
-- Reemplaza la lista de una visita SIN cronograma. Quitar un procedimiento que vino de otra visita
-- es devolvérselo (se borra la fila). Lo que ESTA visita ya pasó a otra no está en su lista
-- efectiva, así que la pantalla no lo manda: se conserva, porque borrarlo lo dejaría pendiente en
-- dos visitas a la vez. Lo agregado acá nunca trae origen: una continuación no junta dos.
create or replace function public.set_added_procedures(p_visit_id uuid, p_procedure_ids uuid[])
returns void language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_uid uuid := auth.uid();
  v_kind visit_kind; v_def uuid; v_protocol uuid;
  v_procs uuid[] := coalesce(array(select distinct t.x from unnest(p_procedure_ids) as t(x) where t.x is not null), '{}');
begin
  if v_uid is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select pv.kind, pv.visit_def_id, e.protocol_id into v_kind, v_def, v_protocol
  from public.patient_visits pv
  join public.enrollments e on e.id = pv.enrollment_id
  where pv.id = p_visit_id
  for update of pv;
  if v_protocol is null then raise exception 'Esa visita ya no existe' using errcode = '23503'; end if;
  if not public.puede_registrar_visitas(v_protocol) then
    raise exception 'No tenés permiso para cambiar las visitas de este paciente' using errcode = '42501';
  end if;
  if v_def is not null then
    raise exception 'Los procedimientos de una visita del cronograma se editan en el cronograma del protocolo' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.visit_added_procedures a
             join public.visit_procedure_completions c on c.visit_id = a.visit_id and c.procedure_id = a.procedure_id
             where a.visit_id = p_visit_id and not (a.procedure_id = any (v_procs))) then
    raise exception 'No se puede quitar un procedimiento que ya está marcado como realizado' using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(v_procs) as t(x)
             where not exists (select 1 from public.protocol_procedures pp
                               where pp.protocol_id = v_protocol and pp.procedure_id = t.x)) then
    raise exception 'Ese procedimiento no es de este estudio' using errcode = 'check_violation';
  end if;

  delete from public.visit_added_procedures a
  where a.visit_id = p_visit_id
    and not (a.procedure_id = any (v_procs))
    and not public.procedimiento_diferido(p_visit_id, a.procedure_id);

  insert into public.visit_added_procedures (visit_id, procedure_id, added_by)
  select p_visit_id, t.x, v_uid from unnest(v_procs) as t(x)
  on conflict on constraint vap_visita_procedimiento_unico do nothing;

  if v_kind = 'retest' and not exists (select 1 from public.visit_added_procedures a where a.visit_id = p_visit_id) then
    raise exception 'Un retest lleva al menos un procedimiento' using errcode = 'check_violation';
  end if;
end $fn$;
revoke all on function public.set_added_procedures(uuid, uuid[]) from public;
grant execute on function public.set_added_procedures(uuid, uuid[]) to authenticated;


-- 10 · Guardas --------------------------------------------------------------------------------------
-- NO son security definer: con definer, current_user sería siempre el dueño y la excepción de
-- postgres de la segunda dejaría pasar a todos. Las preguntas las hacen las funciones de la
-- sección 2, que sí son definer, así no dependen de la RLS de quien escribe.

-- (a) Lo que una visita pasó a otra no se tilda en ella. El tilde es un insert directo desde el
--     front (toggleVisitProcedure), así que la regla tiene que vivir en la base.
create or replace function public.guard_tildar_diferido()
returns trigger language plpgsql set search_path = pg_catalog, public as $fn$
begin
  if public.procedimiento_diferido(new.visit_id, new.procedure_id) then
    raise exception 'Ese procedimiento pasó a otra visita: se marca allá' using errcode = 'check_violation';
  end if;
  return new;
end $fn$;
drop trigger if exists trg_guard_tildar_diferido on public.visit_procedure_completions;
create trigger trg_guard_tildar_diferido before insert
  on public.visit_procedure_completions for each row execute function public.guard_tildar_diferido();

-- (b) Una visita suelta con procedimientos hechos no se borra: el cascade se llevaría los tildes y
--     sus reportes sin que nadie lo decida. postgres pasa (limpiezas a mano desde el editor), y la
--     pregunta va PRIMERO, antes de leer nada.
create or replace function public.guard_borrar_suelta_con_realizados()
returns trigger language plpgsql set search_path = pg_catalog, public as $fn$
begin
  if current_user = 'postgres' then return old; end if;
  if old.visit_def_id is null and public.visita_tiene_realizados(old.id) then
    raise exception 'Esta visita ya tiene procedimientos marcados como realizados. Desmarcalos antes de borrarla.' using errcode = 'check_violation';
  end if;
  return old;
end $fn$;
drop trigger if exists trg_guard_borrar_suelta on public.patient_visits;
create trigger trg_guard_borrar_suelta before delete
  on public.patient_visits for each row execute function public.guard_borrar_suelta_con_realizados();
```

- [ ] **Paso 4: Correr y ver que pasa**

```bash
cd "$BANCO" && node verificar.mjs "$REPO" "$MIG"
```
Expected: `✓` en T2, T3 y T4, `Todo en verde`.

- [ ] **Paso 5: Commit**

```bash
cd "$REPO" && git add "supabase/migrations/${N}_visitas_con_procedimientos_propios.sql" && git commit -m "feat(base): agendar con procedimientos, pasar pendientes a otro día y sus guardas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 5: Sondas, índice y PR A

**Files:**
- Modify: `$MIG` (sección 11)
- Modify: `supabase/README.md`

**Interfaces:**
- Produces: la PR A, lista para que el Director aplique la migración.

- [ ] **Paso 1: Cerrar la migración con el reload y las sondas**

Agregar al final de `$MIG`:

```sql
-- 11 · Recarga de PostgREST y sondas ----------------------------------------------------------------
notify pgrst, 'reload schema';

-- Sonda 1: las cinco vistas corren con los permisos de QUIEN CONSULTA. Las cinco tienen que decir
-- {security_invoker=true}; una sin eso saltea la RLS por estudio en silencio.
select c.relname, c.reloptions
from pg_class c
where c.oid in ('public.v_visit_procedures'::regclass, 'public.v_patient_visits'::regclass,
                'public.v_track_visits'::regclass, 'public.v_procedure_report_alerts'::regclass,
                'public.v_protocol_report_status'::regclass)
order by 1;

-- Sonda 2: ninguna vista calcula «qué debe la visita» por el camino viejo. Tiene que devolver UNA
-- sola fila, v_visit_procedures. Si aparece otra, es una vista que sigue leyendo el cronograma
-- directo: avisar antes de desplegar el front.
select viewname from pg_views
where schemaname = 'public' and definition ilike '%protocol_activities%'
order by 1;

-- Sonda 3: register_visit_event quedó con UNA sola firma (la de cinco parámetros). Tiene que dar 1.
select count(*) as firmas from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'register_visit_event';
```

- [ ] **Paso 2: Chequeos del archivo**

```bash
cd "$BANCO" && node verificar.mjs "$REPO" "$MIG" && node -e "
const t = require('fs').readFileSync(process.argv[1], 'utf8');
const marcas = (t.match(/\\\$[a-z]*\\\$/g) || []).length;
console.log('marcadores de dollar-quote:', marcas, marcas % 2 === 0 ? '(par, bien)' : '(IMPAR: revisar comentarios)');
console.log('create or replace view:', (t.match(/create or replace view/g) || []).length, '(esperado 5)');
console.log('create or replace function:', (t.match(/create or replace function/g) || []).length, '(esperado 8)');
console.log('placeholders NNNN sin reemplazar:', (t.match(/NNNN/g) || []).length, '(esperado 0)');
" "$MIG"
```
Expected: `Todo en verde`, marcadores **par**, 5 vistas, 8 funciones, `0` placeholders. Si quedó algún `NNNN` en los `comment on`, reemplazalo por el número.

- [ ] **Paso 3: Fila del índice**

`supabase/README.md` está en CRLF: editalo con la herramienta Edit (no con Node ni `sed`). Agregá, después de la última fila de la tabla del índice:

```markdown
| NNNN | `visitas_con_procedimientos_propios.sql` — **Visitas con procedimientos propios: retest, VNP y continuación** (spec `docs/superpowers/specs/2026-09-23-visitas-retest-y-continuacion-design.md`, plan `docs/superpowers/plans/2026-09-23-visitas-retest-y-continuacion.md`). **ADITIVA, va PRIMERO** (antes del front de la PR B, que no anda sin ella). Tabla `visit_added_procedures` (lo que una visita lleva además de su cronograma y de qué visita vino) y vista `v_visit_procedures` (lista efectiva). **Recrea cuatro vistas** con `create or replace` y `security_invoker`: `v_patient_visits` y `v_procedure_report_alerts` sin cambiar columnas, `v_protocol_report_status` + `visit_kind` al final, `v_track_visits` + `origin_*` al final. **`register_visit_event` cambia de firma** (drop + create; el quinto parámetro tiene default y el front viejo sigue andando) y deja de rechazar el retest antes de randomizar. RPC nuevas `diferir_procedimientos` y `set_added_procedures`; guardas `trg_guard_tildar_diferido` y `trg_guard_borrar_suelta`. ⚠️ **Las tres sondas del final se miran**: cinco vistas con `security_invoker=true`, UNA sola vista que lee `protocol_activities` (`v_visit_procedures`) y `firmas = 1`. |
```
con `NNNN` reemplazado. Verificá que el diff sea de **una** línea:
```bash
cd "$REPO" && git diff --stat supabase/README.md && node scripts/check-migraciones.mjs
```
Expected: `1 file changed, 1 insertion(+)` y el chequeo sin errores.

- [ ] **Paso 4: Commit, número todavía libre y push**

```bash
cd "$REPO" && git add supabase/README.md "supabase/migrations/${N}_visitas_con_procedimientos_propios.sql" && git commit -m "feat(base): sondas de la ${N} y su fila en el índice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git fetch origin && git ls-tree --name-only origin/main supabase/migrations/ | tail -1
```
Expected: la última de `origin/main` sigue siendo la anterior a `N`. Si alguien tomó el número, renumerá (archivo, `NNNN` adentro, fila del índice) antes de pushear.
```bash
git -c credential.interactive=false push -u origin feat/visitas-procedimientos-propios-base
```

- [ ] **Paso 5: Abrir la PR A**

Por la API REST con el token de `git credential fill` (`username=spiraclinicapp`), como en `ci-y-pr-operativa`. Título: `feat(base): visitas con procedimientos propios — migración ${N}`. La descripción dice, en este orden:
- que es **sólo la migración** y va **primero**, antes de la PR B;
- que el número puede correrse si otra migración se mergea antes;
- las tres sondas y qué tienen que devolver;
- el pie `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Paso 6: Pasarle el SQL al Director**

En el chat, junto con el link de la PR: «Está listo el SQL de la `N`. Es aditiva y va **antes** del front: aplicala cuando quieras, el front actual sigue andando. Mirá las tres sondas del final». Cuando confirme «aplicada», marcá la fila del índice con `**Aplicada en prod (AAAA-MM-DD)**` en una PR aparte (o en la PR B, si todavía no se mergeó), y verificá por la API que `diferir_procedimientos` responde (sin sesión, PostgREST contesta `401`/`42501` y no `PGRST202`).

---

# PR B — El front

> **No empieces la PR B hasta que la migración esté aplicada en prod** (o, como mínimo, hasta que la PR A esté mergeada): el QA de la Tarea 13 la necesita. Creá la rama desde `origin/main` con la PR A adentro:
> ```bash
> git fetch origin && git worktree add -b feat/visitas-procedimientos-propios-front .claude/worktrees/visitas-front origin/main
> ```

### Tarea 6: Mock en el repo (gate del Director)

**Files:**
- Create: `docs/mocks/visitas-continuacion/index.html`

**Interfaces:**
- Produces: la aprobación del Director del copy y la disposición de: el paso «¿Qué lleva?» del modal «Agendar visita», el bloque «Pasaron a otra visita» y los botones del panel «Resumen de la visita», y el modal «Pasar pendientes a otro día». **Si el Director cambia algo, corregí las Tareas 10-11 antes de implementarlas.**

- [ ] **Paso 1: Armar el mock**

Usá la skill `impeccable` (`/impeccable shape`) con `PRODUCT.md` y `DESIGN.md` como contexto. Un HTML estático, con los tokens de `src/styles/tokens.css`, que muestre las tres pantallas con datos de ejemplo: una V3 con «Laboratorio» y «Hemograma» pasados al 25/9, su continuación «Continuación de V3 W4», y un retest con «Hemograma». El copy es el de las Tareas 10-11.

- [ ] **Paso 2: Pedir el visto bueno**

Mostrale el mock al Director con el preview o como artifact, y esperá su «sí». No implementes UI antes.

- [ ] **Paso 3: Commit**

```bash
git add docs/mocks/visitas-continuacion/index.html && git commit -m "docs(mock): pasar pendientes a otro día y procedimientos del retest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 7: El título de una continuación

**Files:**
- Modify: `src/lib/visits.ts:22-63` y `:105-107`
- Modify: `src/data/visits.ts:19-74` (tipo `TrackVisitRow`)
- Modify: `src/views/track/VisitHeader.tsx:96`
- Test: `src/lib/visitTitle.test.ts`

**Interfaces:**
- Produces: `VisitTitleFields` con `origin_visit_id?`, `origin_code?`, `origin_name?`, `origin_kind?` (opcionales). `visitTitle(v)` → `'Continuación de <título del origen>'`; `visitCode(v: VisitTitleFields)` → `'Cont. <código del origen>'`. `TrackVisitRow` con los mismos cuatro campos opcionales.

- [ ] **Paso 1: Escribir los tests (fallan)**

En `src/lib/visitTitle.test.ts`, cambiar el import a:
```ts
import { visitCode, visitTitle, visitTitleConSemanaAparte } from './visits'
```
y agregar al final:
```ts
/**
 * La continuación (vNNNN): una VNP que nació de pasar pendientes de otra visita a otro día. Se
 * nombra por la visita de la que viene. Falla en silencio si vuelve a decir «VNP»: la lista del día
 * mostraría dos VNP sin relación aparente con la V3 que quedó a medias.
 */
describe('continuación', () => {
  const cont = (campos: Partial<TrackVisitRow>) =>
    v({ kind: 'vnp', origin_visit_id: 'v3', origin_kind: 'programada', ...campos })

  it('se nombra por el título de la visita de la que viene', () => {
    expect(visitTitle(cont({ origin_code: null, origin_name: 'V3 W4' }))).toBe('Continuación de V3 W4')
    expect(visitTitle(cont({ origin_code: 'V3', origin_name: 'V3' }))).toBe('Continuación de V3')
  })

  it('el rótulo compacto también', () => {
    expect(visitCode(cont({ origin_code: null, origin_name: 'V3 W4' }))).toBe('Cont. V3 W4')
  })

  it('si el origen es una suelta, se nombra por su tipo', () => {
    expect(visitTitle(cont({ origin_kind: 'retest' }))).toBe('Continuación de Retest')
    expect(visitCode(cont({ origin_kind: 'screening' }))).toBe('Cont. Scr')
  })

  it('sin origen sigue siendo VNP, y un origen a medio cargar no inventa nada', () => {
    expect(visitTitle(v({ kind: 'vnp' }))).toBe('VNP')
    expect(visitTitle(v({ kind: 'vnp', origin_visit_id: 'v3', origin_kind: null }))).toBe('VNP')
    expect(visitCode(v({ kind: 'vnp' }))).toBe('VNP')
  })
})
```

- [ ] **Paso 2: Correr y ver que falla**

```bash
npx vitest run src/lib/visitTitle.test.ts
```
Expected: FAIL — tsc/vitest se quejan de `origin_visit_id` inexistente en `TrackVisitRow`, o `Expected 'Continuación de V3 W4', received 'VNP'`.

- [ ] **Paso 3: Implementar**

En `src/data/visits.ts`, dentro de `interface TrackVisitRow`, después de `enrollment_randomization_date: string | null`:
```ts
  /**
   * Continuación (vNNNN, `v_track_visits`): la visita de la que vinieron sus procedimientos y el
   * título de esa visita. `null` en toda visita que no es continuación. Opcionales porque varios
   * tests y el mostrador de Farmacia arman filas sin ellos.
   */
  origin_visit_id?: string | null
  origin_code?: string | null
  origin_name?: string | null
  origin_kind?: VisitKind | null
```
(`VisitKind` ya está importado en ese archivo; si no, `import type { VisitKind } from '../lib/visitLabels'`).

En `src/lib/visits.ts`, reemplazar la interfaz `VisitTitleFields` por:
```ts
export interface VisitTitleFields {
  visit_code: string | null
  visit_name: string | null
  kind: VisitKind
  /**
   * La visita de la que viene una continuación (vNNNN). OPCIONALES: `visitas_dispensables` (el
   * desplegable de Farmacia) no los trae, y ahí una continuación se lee «VNP», que es lo que es.
   */
  origin_visit_id?: string | null
  origin_code?: string | null
  origin_name?: string | null
  origin_kind?: VisitKind | null
}
```
Después de `function tituloDeDefinicion(...) { ... }`, agregar:
```ts
/**
 * El nombre de la visita de la que viene una continuación, o '' si no es continuación. Se arma con
 * la MISMA regla que cualquier título (la definición, y si no hay, el tipo), para que «V3 W4» diga
 * lo mismo en la continuación que en la V3.
 */
function origenDeContinuacion(v: VisitTitleFields, corto: boolean): string {
  if (!v.origin_visit_id || !v.origin_kind) return ''
  const origen = { visit_code: v.origin_code ?? null, visit_name: v.origin_name ?? null, kind: v.origin_kind }
  return tituloDeDefinicion(origen) || (corto ? KIND_SHORT : KIND_LABELS)[v.origin_kind]
}
```
Reemplazar el cuerpo de `visitTitle`:
```ts
export function visitTitle(v: VisitTitleFields): string {
  const origen = origenDeContinuacion(v, false)
  return tituloDeDefinicion(v) || (origen ? `Continuación de ${origen}` : KIND_LABELS[v.kind])
}
```
y `visitCode` (la firma pasa a `VisitTitleFields`; `TrackVisitRow` sigue encajando):
```ts
export function visitCode(v: VisitTitleFields): string {
  const origen = origenDeContinuacion(v, true)
  return tituloDeDefinicion(v) || (origen ? `Cont. ${origen}` : KIND_SHORT[v.kind])
}
```

En `src/views/track/VisitHeader.tsx:96`, reemplazar:
```tsx
          {code ? `Visita ${code}` : visitTitle(visit)}
```
por:
```tsx
          {/* Una continuación se titula entera: «Visita Cont. V3» no es un nombre. */}
          {code && !visit.origin_visit_id ? `Visita ${code}` : visitTitle(visit)}
```

- [ ] **Paso 4: Correr y ver que pasa**

```bash
npx vitest run src/lib/visitTitle.test.ts && npx tsc --noEmit
```
Expected: PASS y typecheck limpio.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/visits.ts src/lib/visitTitle.test.ts src/data/visits.ts src/views/track/VisitHeader.tsx && git commit -m "feat(coordinacion): la continuación se nombra por la visita de la que viene

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 8: El front lee la lista efectiva

**Files:**
- Modify: `src/data/procedures.ts:147-313` (`VisitProcedureStatus`, `useVisitProcedureStatus`, `DayAsignacionRow`, `useDayProcedureRows`)
- Modify: `src/views/track/resumenVisita.ts:115-183`
- Modify: `src/views/track/VisitProcedures.tsx:62` (sólo la llamada al hook)
- Test: `src/views/track/resumenVisita.test.ts:99-148`

**Interfaces:**
- Produces: `type OrigenProcedimiento = 'cronograma' | 'agregado' | 'diferido'`; `VisitProcedureStatus` suma `origen: OrigenProcedimiento` y `deferred_from_visit_id: string | null`; `useVisitProcedureStatus(visitId: string | null, protocolId: string | null)` (**sin** `visitDefId`).
- Produces: `DayAsignacionRow` / `AsignacionDelDia` = `{ visit_id: string; procedure_id: string; name: string }`; `useDayProcedureRows(visits: { id: string; protocol_id: string }[])`; `armarResumenesDelDia(visitas: readonly { id: string; protocol_id: string }[], ...)`.

- [ ] **Paso 1: Reescribir los tests de la tira del día (fallan)**

En `src/views/track/resumenVisita.test.ts`, reemplazar el `describe('armarResumenesDelDia', ...)` entero por:
```ts
describe('armarResumenesDelDia', () => {
  const visitas = [
    { id: 'v1', protocol_id: 'P1' },
    { id: 'v2', protocol_id: 'P1' },
    { id: 'v3', protocol_id: 'P2' },
  ]
  const asignaciones = [
    { visit_id: 'v1', procedure_id: 'lab', name: 'Laboratorio' },
    { visit_id: 'v3', procedure_id: 'lab', name: 'Laboratorio' },
  ]

  it('cada visita toma SU lista, aunque dos compartan cuadro', () => {
    // v2 es del mismo cuadro que v1 pero pasó su laboratorio a otro día: su lista efectiva ya no lo
    // trae. Cruzar por cuadro (como hasta vNNNN) le volvería a dibujar la gota.
    const out = armarResumenesDelDia(visitas, asignaciones, [{ protocol_id: 'P1', procedure_id: 'lab', draws_blood: true, tieneReporte: false }], [])
    expect(out.v1?.total).toBe(1)
    expect(out.v1?.sangre).toBe('si')
    expect(out.v2).toBeNull()
  })

  it('el MISMO procedimiento del catálogo toma la sangre de SU estudio', () => {
    const out = armarResumenesDelDia(visitas, asignaciones, [
      { protocol_id: 'P1', procedure_id: 'lab', draws_blood: true, tieneReporte: false },
      { protocol_id: 'P2', procedure_id: 'lab', draws_blood: false, tieneReporte: false },
    ], [])
    expect(out.v1?.sangre).toBe('si')
    expect(out.v3?.sangre).toBe('no')
  })

  it('un procedimiento sin fila en el cuadro del estudio queda SIN DEFINIR, nunca en «no lleva»', () => {
    const out = armarResumenesDelDia(visitas, asignaciones, [], [])
    expect(out.v1?.sangre).toBeNull()
  })

  it('un retest con procedimientos propios tiene resumen', () => {
    const out = armarResumenesDelDia([{ id: 'r1', protocol_id: 'P1' }], [{ visit_id: 'r1', procedure_id: 'hem', name: 'Hemograma' }], [], [])
    expect(out.r1?.total).toBe(1)
  })

  it('una visita sin procedimientos y sin IP no tiene resumen', () => {
    const out = armarResumenesDelDia([{ id: 'v9', protocol_id: 'P1' }], asignaciones, [], [])
    expect(out.v9).toBeNull()
  })

  it('una visita sin procedimientos CON IP sí lo tiene', () => {
    const out = armarResumenesDelDia([{ id: 'v9', protocol_id: 'P1' }], asignaciones, [], [{ visit_id: 'v9', cierre: null }])
    expect(out.v9?.kitIp).toBe(true)
    expect(out.v9?.total).toBe(1)
  })

  it('el IP se cruza por visita, no por estudio', () => {
    const out = armarResumenesDelDia(visitas, asignaciones, [], [{ visit_id: 'v2', cierre: null }])
    expect(out.v1?.kitIp).toBe(false)
    expect(out.v2?.kitIp).toBe(true)
  })
})
```

- [ ] **Paso 2: Correr y ver que falla**

```bash
npx vitest run src/views/track/resumenVisita.test.ts
```
Expected: FAIL (`out.v1?.total` es `undefined`: la función todavía agrupa por `visit_def_id`).

- [ ] **Paso 3: `armarResumenesDelDia` por visita**

En `src/views/track/resumenVisita.ts`, reemplazar la interfaz `AsignacionDelDia` por:
```ts
/** Un procedimiento que una visita del día lleva, de su lista efectiva (`v_visit_procedures`, vNNNN). */
export interface AsignacionDelDia {
  visit_id: string
  procedure_id: string
  name: string
}
```
y la función `armarResumenesDelDia` (con su comentario) por:
```ts
/**
 * Los resúmenes de todas las visitas de un día, unidos en el cliente.
 *
 * Las asignaciones vienen POR VISITA (la lista efectiva, vNNNN) y no por cuadro: dos visitas del
 * mismo cuadro pueden llevar cosas distintas si una pasó pendientes a otro día, y una suelta (retest,
 * VNP) lleva lo suyo sin tener cuadro. El cruce con las marcas va SIEMPRE por (estudio,
 * procedimiento): el catálogo es global y un día mezcla estudios.
 */
export function armarResumenesDelDia(
  visitas: readonly { id: string; protocol_id: string }[],
  asignaciones: readonly AsignacionDelDia[],
  delEstudio: readonly ProcedimientoDelEstudio[],
  ips: readonly IpDelDia[],
): Record<string, ResumenVisita | null> {
  const porVisita = new Map<string, AsignacionDelDia[]>()
  for (const a of asignaciones) {
    const lista = porVisita.get(a.visit_id) ?? []
    lista.push(a)
    porVisita.set(a.visit_id, lista)
  }

  const marcas = new Map<string, ProcedimientoDelEstudio>()
  for (const p of delEstudio) marcas.set(clave(p.protocol_id, p.procedure_id), p)

  const ipPorVisita = new Map<string, IpDelDia>()
  for (const ip of ips) ipPorVisita.set(ip.visit_id, ip)

  const out: Record<string, ResumenVisita | null> = {}
  for (const v of visitas) {
    const procs: ProcedimientoDeVisita[] = (porVisita.get(v.id) ?? []).map((a) => {
      // Sin fila en el cuadro del estudio, la sangre queda SIN DEFINIR. `false` sería afirmar que no
      // lleva algo que nadie definió.
      const marca = marcas.get(clave(v.protocol_id, a.procedure_id))
      return {
        procedure_id: a.procedure_id,
        name: a.name,
        draws_blood: marca?.draws_blood ?? null,
        tieneReporte: marca?.tieneReporte ?? false,
      }
    })
    out[v.id] = resumenDeVisita(procs, ipPorVisita.get(v.id) ?? null)
  }
  return out
}
```

- [ ] **Paso 4: Los dos hooks de `procedures.ts`**

En `src/data/procedures.ts`, en la interfaz `VisitProcedureStatus` (la que empieza en la línea 147), agregar antes de `completed: boolean`:
```ts
  /** De dónde sale en ESTA visita (vNNNN): su cronograma, agregado a mano, o pasado desde otra visita. */
  origen: OrigenProcedimiento
  /** La visita de la que vino, si `origen === 'diferido'`. */
  deferred_from_visit_id: string | null
```
y arriba de la interfaz:
```ts
export type OrigenProcedimiento = 'cronograma' | 'agregado' | 'diferido'
```
Reemplazar `useVisitProcedureStatus` (con su comentario) por:
```ts
/**
 * Procedimientos de una visita con estado realizado. Lee la LISTA EFECTIVA (`v_visit_procedures`,
 * vNNNN): el cronograma menos lo que la visita pasó a otro día, más lo agregado — que es lo único que
 * tiene una visita suelta. TRES consultas en paralelo unidas en el cliente, sin embeds (se vuelven
 * ambiguos apenas alguien agrega una FK) y cada una con su RLS.
 */
export function useVisitProcedureStatus(
  visitId: string | null,
  /** El estudio de la visita: sin él no se puede saber si el procedimiento lleva sangre (0134),
   *  porque esa marca es POR ESTUDIO y el catálogo de procedimientos es global. */
  protocolId: string | null,
) {
  return useSupabaseQuery<VisitProcedureStatus[]>(
    async (c) => {
      if (!visitId) return { data: [], error: null }
      const [asg, compRes, sangreRes] = await Promise.all([
        c
          .from('v_visit_procedures')
          .select('procedure_id, suggested_order, origen, deferred_from_visit_id, procedure_code, procedure_name, procedure_category')
          .eq('visit_id', visitId)
          .order('suggested_order', { ascending: true, nullsFirst: false })
          .order('procedure_name', { ascending: true }),
        c.from('visit_procedure_completions').select('procedure_id, completed_at').eq('visit_id', visitId),
        protocolId
          ? c.from('protocol_procedures').select('procedure_id, draws_blood').eq('protocol_id', protocolId)
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
      const sangre = new Map<string, boolean | null>(
        ((sangreRes.data ?? []) as { procedure_id: string; draws_blood: boolean | null }[]).map((r) => [r.procedure_id, r.draws_blood]),
      )

      const merged: VisitProcedureStatus[] = rows.map((r) => ({
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
      }))
      return { data: merged, error: null }
    },
    [visitId, protocolId],
  )
}
```
Reemplazar la interfaz `DayAsignacionRow` por:
```ts
/** Un procedimiento que lleva una visita del día (su lista efectiva, vNNNN). */
export interface DayAsignacionRow {
  visit_id: string
  procedure_id: string
  name: string
}
```
y `useDayProcedureRows` por (el comentario de arriba se conserva, cambiando «qué lleva cada cuadro de visita» por «qué lleva cada visita del día»):
```ts
export function useDayProcedureRows(visits: { id: string; protocol_id: string }[]) {
  const visitIds = [...new Set(visits.map((v) => v.id))].sort()
  const protocolIds = [...new Set(visits.map((v) => v.protocol_id))].sort()
  const depKey = visitIds.join(',') + '|' + protocolIds.join(',')
  return useSupabaseQuery<{ asignaciones: DayAsignacionRow[]; delEstudio: DayEstudioRow[] }>(
    async (c) => {
      if (visitIds.length === 0) return { data: { asignaciones: [], delEstudio: [] }, error: null }
      const [asg, pp] = await Promise.all([
        c
          .from('v_visit_procedures')
          .select('visit_id, procedure_id, procedure_name, suggested_order')
          .in('visit_id', visitIds)
          .order('suggested_order', { ascending: true, nullsFirst: false })
          .order('procedure_name', { ascending: true }),
        c
          .from('protocol_procedures')
          .select('protocol_id, procedure_id, draws_blood, report_definitions!protocol_procedure_id(id)')
          .in('protocol_id', protocolIds),
      ])
      if (asg.error) return { data: null, error: asg.error }
      if (pp.error) return { data: null, error: pp.error }

      const asignaciones: DayAsignacionRow[] = ((asg.data ?? []) as unknown as {
        visit_id: string; procedure_id: string; procedure_name: string
      }[]).map((r) => ({ visit_id: r.visit_id, procedure_id: r.procedure_id, name: r.procedure_name }))

      const delEstudio: DayEstudioRow[] = ((pp.data ?? []) as unknown as {
        protocol_id: string; procedure_id: string; draws_blood: boolean | null; report_definitions: { id: string }[] | null
      }[]).map((r) => ({
        protocol_id: r.protocol_id,
        procedure_id: r.procedure_id,
        draws_blood: r.draws_blood,
        tieneReporte: (r.report_definitions ?? []).length > 0,
      }))

      return { data: { asignaciones, delEstudio }, error: null }
    },
    [depKey],
  )
}
```
En `src/views/track/VisitProcedures.tsx:62`, cambiar la llamada a:
```ts
  const { data, loading, error, refetch } = useVisitProcedureStatus(visitId, protocolId)
```
y el comentario del efecto de foco (líneas ~84-88) de «salen de `protocol_activities` por `visit_def_id`» a «salen de la lista efectiva (`v_visit_procedures`): el cuadro del estudio, que se edita en otra pantalla, más lo agregado».

- [ ] **Paso 5: Correr y ver que pasa**

```bash
npx vitest run src/views/track/resumenVisita.test.ts && npx tsc --noEmit
```
Expected: PASS y typecheck limpio. `DayVisitsView.tsx` sigue compilando sin cambios: sus filas tienen `id` y `protocol_id`.

- [ ] **Paso 6: Commit**

```bash
git add src/data/procedures.ts src/views/track/resumenVisita.ts src/views/track/resumenVisita.test.ts src/views/track/VisitProcedures.tsx && git commit -m "feat(coordinacion): procedimientos y tira del día salen de la lista efectiva

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 9: Capa de datos de la continuación, reglas puras y errores

**Files:**
- Create: `src/data/continuaciones.ts`
- Create: `src/views/track/continuacion.ts`
- Test: `src/views/track/continuacion.test.ts`
- Modify: `src/data/visitEvents.ts` (kinds, alta con procedimientos, error del borrado)

> **Cambio respecto de la primera versión del plan (revisión final de la PR A, 2026-09-23):** en la 0144,
> `vap_origen_fk` es `on delete set null` y la app no puede borrar una visita que pasó procedimientos a
> otra porque lo frena la guarda `trg_guard_borrar_visita` con un 23514 en castellano («…Deshacé primero
> esa continuación.»). Por eso ya no hay que reconocer un 23503 de `vap_origen_fk`: se fueron
> `bloqueadaPorContinuacion`, `MENSAJE_BLOQUEO_CONTINUACION` y los cambios en `visitDefinitions.ts` (los
> borrados del sistema ya no se traban). Y `register_visit_event` acepta un retest vacío (compat con el front
> desplegado): la regla «al menos uno» al crear vive sólo en el front (`faltanProcedimientos`).

**Interfaces:**
- Produces (`src/data/continuaciones.ts`): `interface DiferidoRow { procedure_id; procedure_name; visit_id; estimated_date: string | null; real_date: string | null }`; `useDiferidosDeVisita(visitId: string | null)`; `diferirProcedimientos(visitaOrigen: string, procedureIds: string[], fecha: string) → Promise<{ id: string | null; error: string | null }>`; `setAddedProcedures(visitId: string, procedureIds: string[]) → Promise<{ error: string | null }>`.
- Produces (`src/views/track/continuacion.ts`): `diferibles<T extends { procedure_id: string }>(items: readonly T[], hecho: (procedureId: string) => boolean): T[]`; `interface DestinoDeDiferidos { visit_id: string; fecha: string | null; procedimientos: string[] }`; `agruparDiferidos(rows: readonly DiferidoRow[]): DestinoDeDiferidos[]`; `faltanProcedimientos(kind: VisitKind, procedureIds: readonly string[]): string | null`.
- Produces (`src/data/visitEvents.ts`): `registerVisitEvent(enrollmentId, kind, date, notes, procedureIds: string[] = [])`; `availableEventKinds` ofrece `'retest'` en toda etapa.

- [ ] **Paso 1: Escribir los tests de las reglas puras (fallan)**

Crear `src/views/track/continuacion.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { agruparDiferidos, diferibles, faltanProcedimientos } from './continuacion'

/**
 * Las reglas de «pasar pendientes a otro día» que fallan en silencio:
 *  · ofrecer para diferir algo ya tildado (el servidor lo rechaza, pero con el tilde optimista puesto
 *    la pantalla lo ofrecería un instante y el error se leería como un bug);
 *  · agrupar mal los destinos: dos pases al mismo día se leerían como dos visitas, y uno sin fecha
 *    quedaría primero, antes que los que sí la tienen;
 *  · dejar agendar un retest vacío, que el servidor rechaza sin que la pantalla haya avisado.
 */
describe('diferibles', () => {
  const items = [{ procedure_id: 'lab' }, { procedure_id: 'vit' }, { procedure_id: 'hem' }]

  it('ofrece sólo lo que todavía no se hizo, contando el tilde optimista', () => {
    const hecho = (id: string) => id === 'vit'
    expect(diferibles(items, hecho).map((p) => p.procedure_id)).toEqual(['lab', 'hem'])
  })

  it('con todo hecho no ofrece nada', () => {
    expect(diferibles(items, () => true)).toEqual([])
  })
})

describe('agruparDiferidos', () => {
  const fila = (visit_id: string, procedure_name: string, estimated_date: string | null, real_date: string | null = null) =>
    ({ procedure_id: procedure_name, procedure_name, visit_id, estimated_date, real_date })

  it('junta por visita destino y ordena los nombres', () => {
    const out = agruparDiferidos([fila('c1', 'Laboratorio', '2026-09-25'), fila('c1', 'Hemograma', '2026-09-25')])
    expect(out).toEqual([{ visit_id: 'c1', fecha: '2026-09-25', procedimientos: ['Hemograma', 'Laboratorio'] }])
  })

  it('la fecha real le gana a la estimada: la continuación ya se hizo', () => {
    expect(agruparDiferidos([fila('c1', 'Laboratorio', '2026-09-25', '2026-09-26')])[0].fecha).toBe('2026-09-26')
  })

  it('ordena por fecha, y lo que no tiene fecha va al final', () => {
    const out = agruparDiferidos([
      fila('c3', 'ECG', null), fila('c2', 'Hemograma', '2026-10-02'), fila('c1', 'Laboratorio', '2026-09-25'),
    ])
    expect(out.map((d) => d.visit_id)).toEqual(['c1', 'c2', 'c3'])
  })
})

describe('faltanProcedimientos', () => {
  it('un retest necesita al menos uno', () => {
    expect(faltanProcedimientos('retest', [])).toBe('Elegí al menos un procedimiento para el retest.')
    expect(faltanProcedimientos('retest', ['hem'])).toBeNull()
  })

  it('una VNP puede ir vacía: una consulta es una visita válida', () => {
    expect(faltanProcedimientos('vnp', [])).toBeNull()
  })
})
```

- [ ] **Paso 2: Correr y ver que falla**

```bash
npx vitest run src/views/track/continuacion.test.ts
```
Expected: FAIL — `Failed to resolve import "./continuacion"`.

- [ ] **Paso 3: `src/data/continuaciones.ts`**

```ts
import { supabase } from '../lib/supabase'
import { useSupabaseQuery } from '../lib/useSupabaseQuery'

/**
 * Continuaciones: lo que una visita pasó a otro día (vNNNN, `visit_added_procedures`).
 *
 * Las escrituras van por RPC (`diferir_procedimientos`, `set_added_procedures`): crear la
 * continuación y sus filas es una sola operación, y las reglas (sólo lo que la visita debe y no
 * hizo; un retest no se queda vacío) viven en el servidor. La tabla no acepta escrituras directas.
 */

/** Un procedimiento que ESTA visita pasó a otra, con la fecha de la otra. */
export interface DiferidoRow {
  procedure_id: string
  procedure_name: string
  /** La continuación a la que pasó. */
  visit_id: string
  estimated_date: string | null
  real_date: string | null
}

/**
 * Lo que una visita pasó a otro día. El destino va EMBEBIDO por la FK nombrada `vap_visita_fk`: la
 * tabla tiene dos FK a `patient_visits` (destino y origen) y el embed sin nombre sería ambiguo —
 * PostgREST respondería 300 y voltearía la consulta entera.
 */
export function useDiferidosDeVisita(visitId: string | null) {
  return useSupabaseQuery<DiferidoRow[]>(
    async (c) => {
      if (!visitId) return { data: [], error: null }
      const { data, error } = await c
        .from('visit_added_procedures')
        .select('procedure_id, visit_id, procedure:procedures(name), destino:patient_visits!vap_visita_fk(estimated_date, real_date)')
        .eq('deferred_from_visit_id', visitId)
      if (error) return { data: null, error }
      const rows = (data ?? []) as unknown as {
        procedure_id: string
        visit_id: string
        procedure: { name: string } | null
        destino: { estimated_date: string | null; real_date: string | null } | null
      }[]
      return {
        data: rows.map((r) => ({
          procedure_id: r.procedure_id,
          procedure_name: r.procedure?.name ?? 'Procedimiento',
          visit_id: r.visit_id,
          estimated_date: r.destino?.estimated_date ?? null,
          real_date: r.destino?.real_date ?? null,
        })),
        error: null,
      }
    },
    [visitId],
  )
}

/** Traduce el error de las RPC de continuación (patrón `*ErrorMessage` del repo). */
function continuacionErrorMessage(code?: string, raw?: string): string {
  if (code === '42501') return 'No tenés permiso para cambiar las visitas de este paciente.'
  if (code === '23502') return 'La fecha es obligatoria.'
  // 23514: las RPC ya hablan en castellano y en términos del dominio («…que esta visita todavía no hizo»).
  if (code === '23514' && raw) return raw
  return 'No pudimos guardar el cambio. Probá de nuevo.'
}

/** Pasa procedimientos de una visita a una continuación nueva. Devuelve el id de la continuación. */
export async function diferirProcedimientos(
  visitaOrigen: string, procedureIds: string[], fecha: string,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('diferir_procedimientos', {
    p_visita_origen: visitaOrigen, p_procedure_ids: procedureIds, p_fecha: fecha,
  })
  if (error) return { id: null, error: continuacionErrorMessage(error.code, error.message) }
  return { id: data as string, error: null }
}

/** Reemplaza lo que lleva una visita suelta. Quitar algo que vino de otra visita se lo devuelve. */
export async function setAddedProcedures(
  visitId: string, procedureIds: string[],
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_added_procedures', {
    p_visit_id: visitId, p_procedure_ids: procedureIds,
  })
  if (error) return { error: continuacionErrorMessage(error.code, error.message) }
  return { error: null }
}
```

- [ ] **Paso 4: `src/views/track/continuacion.ts`**

```ts
import type { DiferidoRow } from '../../data/continuaciones'
import type { VisitKind } from '../../lib/visitLabels'

/**
 * Reglas puras de «pasar pendientes a otro día» y de los procedimientos propios de un retest.
 * Tienen test (`continuacion.test.ts`): si quedan al revés, no se ve mal, se ve raro.
 */

/**
 * Lo que se puede pasar a otro día: lo que la visita lleva y todavía no se hizo. `hecho` es el
 * mismo `doneOf` del panel, con el tilde optimista puesto. La lista que entra ya es la efectiva, así
 * que lo que ya pasó a otra visita ni aparece.
 */
export function diferibles<T extends { procedure_id: string }>(
  items: readonly T[], hecho: (procedureId: string) => boolean,
): T[] {
  return items.filter((p) => !hecho(p.procedure_id))
}

/** Una continuación vista desde la visita de origen: a qué visita, cuándo y qué. */
export interface DestinoDeDiferidos {
  visit_id: string
  /** La fecha real si ya se hizo; si no, la agendada. */
  fecha: string | null
  procedimientos: string[]
}

/** Agrupa lo diferido por visita destino, ordenado por fecha (sin fecha, al final). */
export function agruparDiferidos(rows: readonly DiferidoRow[]): DestinoDeDiferidos[] {
  const porVisita = new Map<string, DestinoDeDiferidos>()
  for (const r of rows) {
    const d = porVisita.get(r.visit_id) ?? { visit_id: r.visit_id, fecha: r.real_date ?? r.estimated_date, procedimientos: [] }
    d.procedimientos.push(r.procedure_name)
    porVisita.set(r.visit_id, d)
  }
  const out = [...porVisita.values()]
  for (const d of out) d.procedimientos.sort((a, b) => a.localeCompare(b, 'es'))
  return out.sort((a, b) => {
    if (a.fecha === b.fecha) return a.visit_id.localeCompare(b.visit_id)
    if (a.fecha === null) return 1
    if (b.fecha === null) return -1
    return a.fecha.localeCompare(b.fecha)
  })
}

/** El aviso si a la visita le faltan procedimientos, o `null`. Espeja la regla del servidor. */
export function faltanProcedimientos(kind: VisitKind, procedureIds: readonly string[]): string | null {
  if (kind === 'retest' && procedureIds.length === 0) return 'Elegí al menos un procedimiento para el retest.'
  return null
}
```

- [ ] **Paso 5: Correr y ver que pasa**

```bash
npx vitest run src/views/track/continuacion.test.ts
```
Expected: PASS.

- [ ] **Paso 6: `visitEvents.ts`**

En `src/data/visitEvents.ts`:

1. (Sin import nuevo.)
2. `PRE_RANDO_KINDS` pasa a `['firma', 'screening', 'firma_screening', 'vnp', 'retest', 'randomizacion']`.
3. En el comentario de `availableEventKinds`, «VNP siempre, Retest solo post-rando» → «VNP y Retest siempre (desde vNNNN el retest también va antes de randomizar: el de screening es el más común)». En el cuerpo:
   ```ts
     if (protocolHasCuadro) return ['vnp', 'retest'] // pre-rando con cuadro: screening/rando van por el cuadro
   ```
   y reemplazar `out.push('vnp') // ilimitada` por:
   ```ts
     out.push('vnp', 'retest') // ilimitadas
   ```
4. En `eventError`, antes del `return` final:
   ```ts
     // 23514: el RPC habla en castellano y en términos del dominio («Elegí al menos un procedimiento…»).
     if (code === '23514' && raw) return raw
   ```
5. Reemplazar `registerVisitEvent` por:
   ```ts
   /**
    * Registra una visita suelta. El retest y la VNP pueden llevar procedimientos del estudio
    * (vNNNN); el retest, al menos uno. Las reglas las valida el RPC server-side.
    */
   export async function registerVisitEvent(
     enrollmentId: string, kind: VisitKind, date: string, notes: string | null, procedureIds: string[] = [],
   ): Promise<{ error: string | null }> {
     const { error } = await supabase.rpc('register_visit_event', {
       p_enrollment_id: enrollmentId, p_kind: kind, p_date: date, p_notes: notes, p_procedure_ids: procedureIds,
     })
     if (error) return { error: eventError(error.code, error.message) }
     return { error: null }
   }
   ```
6. En `deleteVisitEvent`, reemplazar `if (error) return { error: error.message }` por:
   ```ts
     if (error) {
       // 23503: un pedido de dispensación apunta a la visita (on delete restrict, 0002).
       if (error.code === '23503') return { error: 'No se puede borrar: la visita ya tiene un pedido de dispensación.' }
       // 23514 de la guarda de la 0144, ya en castellano: «…Deshacé primero esa continuación.» o
       // «…marcados como realizados…».
       return { error: error.message }
     }
   ```

- [ ] **Paso 7: Verificar y commit**

```bash
npx tsc --noEmit && npx vitest run src/views/track/continuacion.test.ts
git add src/data/continuaciones.ts src/views/track/continuacion.ts src/views/track/continuacion.test.ts src/data/visitEvents.ts && git commit -m "feat(coordinacion): datos y reglas de la continuación; retest en cualquier etapa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: typecheck limpio y PASS.

---

### Tarea 10: Agendar un retest o una VNP con sus procedimientos

**Files:**
- Create: `src/views/track/SelectorProcedimientos.tsx`
- Modify: `src/views/track/RegisterVisitFlow.tsx`

**Interfaces:**
- Consumes: `useEstudioProcedimientos(protocolId)` (`src/data/protocolProcedures.ts:88`), `faltanProcedimientos` y `registerVisitEvent(…, procedureIds)` (Tarea 9).
- Produces: `SelectorProcedimientos({ protocolId: string; value: readonly string[]; onChange: (ids: string[]) => void; bloqueados?: ReadonlySet<string>; accent: string })`.

- [ ] **Paso 1: `SelectorProcedimientos.tsx`**

```tsx
import { useMemo } from 'react'
import { useEstudioProcedimientos } from '../../data/protocolProcedures'

/**
 * Casillas con los procedimientos DEL ESTUDIO, agrupados por categoría. Es una lista cerrada, sin
 * texto libre (regla del Director: valores preestablecidos contra errores de tipeo). Sólo los del
 * estudio, porque de `protocol_procedures` cuelgan los reportes: uno del catálogo global no traería
 * ninguno, y el servidor lo rechaza igual.
 *
 * `bloqueados` = no se pueden destildar (ya están marcados como realizados en la visita).
 */
export function SelectorProcedimientos({ protocolId, value, onChange, bloqueados, accent }: {
  protocolId: string
  value: readonly string[]
  onChange: (ids: string[]) => void
  bloqueados?: ReadonlySet<string>
  accent: string
}) {
  const q = useEstudioProcedimientos(protocolId)
  const grupos = useMemo(() => {
    const porCategoria = new Map<string, { procedure_id: string; name: string }[]>()
    for (const p of q.data ?? []) {
      const categoria = p.category?.trim() || 'Otros'
      const lista = porCategoria.get(categoria) ?? []
      lista.push({ procedure_id: p.procedure_id, name: p.name })
      porCategoria.set(categoria, lista)
    }
    return [...porCategoria.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([categoria, procs]) => ({ categoria, procs: procs.sort((a, b) => a.name.localeCompare(b.name, 'es')) }))
  }, [q.data])

  const elegidos = new Set(value)
  const alternar = (id: string) => {
    if (bloqueados?.has(id)) return
    const next = new Set(elegidos)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

  const aviso = { fontSize: 12.5, color: 'var(--spira-muted)', lineHeight: 1.45, padding: '2px 0' } as const
  if (q.error) return <div style={{ ...aviso, color: 'var(--spira-acc-deep-danger)' }}>No se pudieron cargar los procedimientos: {q.error}</div>
  if (q.loading && !q.data) return <div style={aviso}>Cargando procedimientos del estudio…</div>
  if (grupos.length === 0) {
    return <div style={aviso}>Este estudio todavía no tiene procedimientos cargados. Se cargan en «Procedimientos» del protocolo.</div>
  }

  return (
    <div style={{ maxHeight: 260, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {grupos.map(({ categoria, procs }) => (
        <div key={categoria}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--spira-muted)', marginBottom: 4 }}>
            {categoria}
          </div>
          {procs.map((p) => {
            const bloqueado = bloqueados?.has(p.procedure_id) ?? false
            return (
              <label
                key={p.procedure_id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 13.5, color: 'var(--spira-ink)', cursor: bloqueado ? 'default' : 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={elegidos.has(p.procedure_id)}
                  disabled={bloqueado}
                  onChange={() => alternar(p.procedure_id)}
                  style={{ accentColor: accent }}
                />
                {p.name}
                {bloqueado && <span style={{ fontSize: 11.5, color: 'var(--spira-muted)' }}>· realizado</span>}
              </label>
            )
          })}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Paso 2: `RegisterVisitFlow.tsx`**

1. Imports: agregar `import { SelectorProcedimientos } from './SelectorProcedimientos'` y `import { faltanProcedimientos } from './continuacion'`.
2. En el comentario de cabecera, «Post-randomización (cualquier caso): solo VNP / Retest sueltas.» → «Post-randomización (cualquier caso): solo VNP / Retest sueltas. Retest y VNP llevan sus procedimientos del estudio (vNNNN); el retest, al menos uno.»
3. Después de `const [error, setError] = useState<string | null>(null)`:
   ```ts
     /** Procedimientos del retest o la VNP (vNNNN). Se conservan si se cambia de tipo y se vuelve. */
     const [procs, setProcs] = useState<string[]>([])
   ```
4. Después de `const isRandoEvent = choice === 'evt:randomizacion'`:
   ```ts
     const kindElegido = choice.startsWith('evt:') ? (choice.slice(4) as VisitKind) : null
     const llevaProcedimientos = kindElegido === 'vnp' || kindElegido === 'retest'
   ```
5. En `submit`, después del `if (!choice) { ... }`:
   ```ts
       if (kindElegido && llevaProcedimientos) {
         const falta = faltanProcedimientos(kindElegido, procs)
         if (falta) { setError(falta); return }
       }
   ```
   y la llamada a `registerVisitEvent` pasa a:
   ```ts
         : await registerVisitEvent(enrollmentId, choice.slice(4) as VisitKind, date, notes.trim() || null, llevaProcedimientos ? procs : [])
   ```
6. En el JSX, después del bloque `{choice.startsWith('evt:') && ( <FormField label="Nota"> … )}`:
   ```tsx
             {llevaProcedimientos && (
               <FormField label="¿Qué lleva?">
                 <SelectorProcedimientos protocolId={protocolId} value={procs} onChange={setProcs} accent={accentSolid} />
               </FormField>
             )}
   ```
7. En los dos `<Modal title="Agendar visita" …>`, agregar `maxWidth={480}` (la lista de casillas necesita el ancho).

- [ ] **Paso 3: Verificar y commit**

```bash
npx tsc --noEmit
git add src/views/track/SelectorProcedimientos.tsx src/views/track/RegisterVisitFlow.tsx && git commit -m "feat(coordinacion): el retest y la VNP se agendan con sus procedimientos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: typecheck limpio. La verificación en pantalla va en la Tarea 13.

---

### Tarea 11: Pasar pendientes a otro día, editar y deshacer

**Files:**
- Create: `src/views/track/DesdoblamientoVisita.tsx`, `src/views/track/PasarPendientesModal.tsx`, `src/views/track/EditarProcedimientosModal.tsx`, `src/views/track/DeshacerContinuacionModal.tsx`
- Modify: `src/views/track/PanelResumenVisita.tsx`, `src/views/track/VisitProcedures.tsx`, `src/views/track/VisitDetail.tsx`, `src/components/Modal.tsx`

**Interfaces:**
- Nota: «Editar procedimientos» se ofrece sólo en retest y VNP (la continuación es una VNP), igual que lo que acepta `set_added_procedures` en la 0144.
- Consumes: `useDiferidosDeVisita`, `diferirProcedimientos`, `setAddedProcedures` (Tarea 9); `diferibles`, `agruparDiferidos`, `faltanProcedimientos`, `DestinoDeDiferidos` (Tarea 9); `deleteVisitEvent` (Tarea 9); `SelectorProcedimientos` (Tarea 10).
- Produces: `VisitProcedures` con props nuevas `visitKind: VisitKind`, `originVisitId: string | null`, `onAbrirVisita?: (visitId: string) => void`, `onCambio?: () => void`; `PanelResumenVisita` con `pie?: ReactNode`; `modalesAbiertos(): number` exportada de `Modal.tsx`.

- [ ] **Paso 1: `DesdoblamientoVisita.tsx`** (presentación pura)

```tsx
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { btnOutline } from '../../components/buttons'
import { formatAR } from '../../lib/dates'
import type { DestinoDeDiferidos } from './continuacion'

/**
 * El pie del panel «Resumen de la visita» cuando la visita se desdobló (vNNNN):
 *  · en la visita de origen, un bloque por cada continuación — qué pasó, a qué día, y cómo abrirla
 *    o deshacerla;
 *  · en la continuación, de dónde viene;
 *  · y los dos botones de acción: pasar pendientes a otro día, y editar lo que lleva una suelta.
 *
 * Cada destino tiene su BOTÓN con nombre para abrirlo: el bloque no es un link, porque la tarjeta
 * de una visita lleva a esa visita y no a otra (regla del Director).
 */
export function DesdoblamientoVisita({
  destinos, origenVisitId, puedePasar, puedeEditar, readOnly, onPasar, onEditar, onAbrirVisita, onDeshacer,
}: {
  destinos: readonly DestinoDeDiferidos[]
  /** Si esta visita es una continuación, la visita de la que viene. */
  origenVisitId: string | null
  puedePasar: boolean
  puedeEditar: boolean
  readOnly: boolean
  onPasar: () => void
  onEditar: () => void
  onAbrirVisita?: (visitId: string) => void
  onDeshacer: (destino: DestinoDeDiferidos) => void
}) {
  const hayAcciones = !readOnly && (puedePasar || puedeEditar)
  if (!origenVisitId && destinos.length === 0 && !hayAcciones) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
      {origenVisitId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--spira-ink-2)' }}>Sigue con lo que quedó pendiente de otra visita.</span>
          {onAbrirVisita && (
            <button type="button" style={btnChico} onClick={() => onAbrirVisita(origenVisitId)}>
              Abrir la visita de origen
            </button>
          )}
        </div>
      )}

      {destinos.map((d) => (
        <div key={d.visit_id} style={caja}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Icon name="arrowRight" size={15} color="var(--spira-muted)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}>
              Pasaron a otra visita · {d.procedimientos.length} {d.procedimientos.length === 1 ? 'procedimiento' : 'procedimientos'}
              {d.fecha ? ` · ${formatAR(d.fecha)}` : ''}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 4, lineHeight: 1.45 }}>
            {d.procedimientos.join(' · ')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {onAbrirVisita && (
              <button type="button" style={btnChico} onClick={() => onAbrirVisita(d.visit_id)}>
                {d.fecha ? `Abrir la visita del ${formatAR(d.fecha)}` : 'Abrir la visita'}
              </button>
            )}
            {!readOnly && (
              <button type="button" style={btnChico} onClick={() => onDeshacer(d)}>Deshacer</button>
            )}
          </div>
        </div>
      ))}

      {hayAcciones && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {puedePasar && <button type="button" style={btnChico} onClick={onPasar}>Pasar pendientes a otro día</button>}
          {puedeEditar && <button type="button" style={btnChico} onClick={onEditar}>Editar procedimientos</button>}
        </div>
      )}
    </div>
  )
}

const btnChico: CSSProperties = { ...btnOutline, height: 32, padding: '0 12px', fontSize: 13 }
/** Superficie por elevación, sin borde de color (regla del realce). */
const caja: CSSProperties = {
  padding: '10px 12px', borderRadius: 10, background: 'var(--spira-paper)', boxShadow: 'var(--spira-shadow-sm)',
}
```

- [ ] **Paso 2: `PasarPendientesModal.tsx`**

```tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { FormField } from '../../components/FormField'
import { DateField } from '../../components/DateField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { diferirProcedimientos } from '../../data/continuaciones'
import { addDaysISO, todayISO, yearsFromTodayISO } from '../../lib/dates'

/**
 * «Pasar pendientes a otro día»: elige qué pasa y a qué fecha, y crea la continuación (vNNNN).
 * Ninguna casilla viene marcada: lo que se difiere se elige a propósito. La fecha arranca en mañana,
 * que es el caso común, y admite el pasado para registrar una continuación que ya ocurrió.
 */
export function PasarPendientesModal({ visitId, pendientes, accent, onClose, onDone }: {
  visitId: string
  pendientes: readonly { procedure_id: string; name: string }[]
  accent: string
  onClose: () => void
  onDone: (continuacionId: string) => void
}) {
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [fecha, setFecha] = useState<string>(addDaysISO(todayISO(), 1))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const alternar = (id: string) => setElegidos((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (elegidos.size === 0) { setError('Elegí qué procedimientos pasan a otro día.'); return }
    setBusy(true)
    setError(null)
    const res = await diferirProcedimientos(visitId, [...elegidos], fecha)
    setBusy(false)
    if (res.error || !res.id) { setError(res.error ?? 'No pudimos crear la visita. Probá de nuevo.'); return }
    onDone(res.id)
  }

  return (
    <Modal
      title="Pasar pendientes a otro día"
      subtitle="Se crea una visita nueva con lo que elijas. Esta visita cierra con lo que se hizo."
      onClose={onClose}
      maxWidth={480}
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="¿Qué pasa a otro día?">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {pendientes.map((p) => (
              <label key={p.procedure_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 13.5, color: 'var(--spira-ink)', cursor: 'pointer' }}>
                <input type="checkbox" checked={elegidos.has(p.procedure_id)} onChange={() => alternar(p.procedure_id)} style={{ accentColor: accent }} />
                {p.name}
              </label>
            ))}
          </div>
        </FormField>
        <FormField label="Fecha de la nueva visita">
          <DateField value={fecha} onChange={setFecha} min={yearsFromTodayISO(-2)} max={yearsFromTodayISO(2)} />
        </FormField>
        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accent), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Pasando…' : 'Pasar a otro día'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
```
Antes de escribirlo, confirmá la firma de `DateField`: `onChange` recibe el ISO (`src/components/DateField.tsx:32`). Si recibe `string | null`, usá `onChange={(v) => v && setFecha(v)}`.

- [ ] **Paso 3: `EditarProcedimientosModal.tsx`**

```tsx
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { setAddedProcedures } from '../../data/continuaciones'
import type { VisitKind } from '../../lib/visitLabels'
import { SelectorProcedimientos } from './SelectorProcedimientos'
import { faltanProcedimientos } from './continuacion'

/**
 * «Editar procedimientos» de una visita suelta (retest, VNP, continuación). Lo ya realizado no se
 * puede quitar; quitar algo que vino de otra visita se lo devuelve (lo explica el servidor).
 */
export function EditarProcedimientosModal({ visitId, protocolId, kind, actuales, accent, onClose, onDone }: {
  visitId: string
  protocolId: string
  kind: VisitKind
  actuales: readonly { procedure_id: string; completed: boolean }[]
  accent: string
  onClose: () => void
  onDone: () => void
}) {
  const [elegidos, setElegidos] = useState<string[]>(() => actuales.map((p) => p.procedure_id))
  const bloqueados = useMemo(() => new Set(actuales.filter((p) => p.completed).map((p) => p.procedure_id)), [actuales])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const falta = faltanProcedimientos(kind, elegidos)
    if (falta) { setError(falta); return }
    setBusy(true)
    setError(null)
    const res = await setAddedProcedures(visitId, elegidos)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone()
  }

  return (
    <Modal title="Editar procedimientos" onClose={onClose} maxWidth={480}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SelectorProcedimientos protocolId={protocolId} value={elegidos} onChange={setElegidos} bloqueados={bloqueados} accent={accent} />
        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accent), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Paso 4: `DeshacerContinuacionModal.tsx`**

```tsx
import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { deleteVisitEvent } from '../../data/visitEvents'
import { formatAR } from '../../lib/dates'
import type { DestinoDeDiferidos } from './continuacion'

/**
 * Deshacer una continuación = borrarla. El `on delete cascade` de `vap_visita_fk` devuelve sus
 * procedimientos a esta visita solo. Si la continuación ya tiene algo hecho o un pedido de
 * dispensación, el servidor lo frena con un mensaje claro.
 */
export function DeshacerContinuacionModal({ destino, accent, onClose, onDone }: {
  destino: DestinoDeDiferidos
  accent: string
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cuando = destino.fecha ? `del ${formatAR(destino.fecha)}` : 'nueva'

  const deshacer = async () => {
    setBusy(true)
    setError(null)
    const res = await deleteVisitEvent(destino.visit_id)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone()
  }

  return (
    <Modal title="Deshacer" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13.5, color: 'var(--spira-ink)', lineHeight: 1.5 }}>
          Se borra la visita {cuando} y {destino.procedimientos.length === 1 ? 'su procedimiento vuelve' : 'sus procedimientos vuelven'} a esta visita.
        </div>
        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="button" disabled={busy} onClick={() => void deshacer()} style={{ ...btnPrimary(accent), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Deshaciendo…' : 'Deshacer'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Paso 5: `PanelResumenVisita.tsx`**

Agregar `import type { ReactNode } from 'react'`. En los props, agregar:
```ts
  /** Lo que va debajo de la tira: el desdoblamiento y sus acciones (vNNNN). */
  pie?: ReactNode
```
En el JSX, justo antes de `</Panel>`, agregar `{pie}`. Y reemplazar el texto del vacío de una suelta:
```tsx
            : 'Esta visita todavía no lleva procedimientos.'}
```
(en lugar de `'Las visitas sueltas no tienen procedimientos del cuadro.'`). Actualizar el comentario del prop `visitDefId`: «Null = visita suelta: lleva sólo lo que se le agregó (vNNNN).»

- [ ] **Paso 6: `VisitProcedures.tsx`**

1. Imports nuevos:
   ```ts
   import type { VisitKind } from '../../lib/visitLabels'
   import { useDiferidosDeVisita } from '../../data/continuaciones'
   import { agruparDiferidos, diferibles } from './continuacion'
   import type { DestinoDeDiferidos } from './continuacion'
   import { DesdoblamientoVisita } from './DesdoblamientoVisita'
   import { PasarPendientesModal } from './PasarPendientesModal'
   import { EditarProcedimientosModal } from './EditarProcedimientosModal'
   import { DeshacerContinuacionModal } from './DeshacerContinuacionModal'
   ```
2. Firma: agregar a la desestructuración y al tipo:
   ```ts
   export function VisitProcedures({ visitId, visitDefId, visitKind, originVisitId, protocolId, accent, readOnly, onAbrirVisita, onCambio }: {
     visitId: string
     visitDefId: string | null
     /** Tipo de la visita: el retest no se puede quedar sin procedimientos. */
     visitKind: VisitKind
     /** Si es una continuación, la visita de la que viene (`origin_visit_id`, vNNNN). */
     originVisitId: string | null
     protocolId: string
     accent: string
     readOnly: boolean
     /** Abre otra visita encima (la continuación o su origen). */
     onAbrirVisita?: (visitId: string) => void
     /** Algo cambió que el encabezado de la visita también muestra (el estado). */
     onCambio?: () => void
   }) {
   ```
3. Después de `const ipQ = useVisitIpStatus(visitId)`:
   ```ts
     /* Lo que esta visita pasó a otro día (vNNNN). Se relee con lo demás al volver a la pestaña. */
     const diferidos = useDiferidosDeVisita(visitId)
     const [modal, setModal] = useState<'pasar' | 'editar' | null>(null)
     const [deshacer, setDeshacer] = useState<DestinoDeDiferidos | null>(null)
   ```
4. En el efecto de foco, sumar `diferidos.refetch()` dentro de `refrescar` y `diferidos.refetch` a sus dependencias.
5. Después de `const porCargarEnResumen = …`:
   ```ts
     const pendientes = useMemo(
       () => diferibles(items, doneOf).map((p) => ({ procedure_id: p.procedure_id, name: p.name })),
       // eslint-disable-next-line react-hooks/exhaustive-deps
       [items, optDone],
     )
     const destinos = useMemo(() => agruparDiferidos(diferidos.data ?? []), [diferidos.data])

     /** Después de pasar, editar o deshacer: cambia la lista, los reportes, el bloque y el estado. */
     const alCambiar = () => {
       refetch()
       reportes.refetch()
       diferidos.refetch()
       onCambio?.()
     }
   ```
6. En el JSX, a `<PanelResumenVisita … />` sumarle:
   ```tsx
           pie={
             <DesdoblamientoVisita
               destinos={destinos}
               origenVisitId={originVisitId}
               puedePasar={pendientes.length > 0}
               puedeEditar={visitKind === 'vnp' || visitKind === 'retest'}
               readOnly={readOnly}
               onPasar={() => setModal('pasar')}
               onEditar={() => setModal('editar')}
               onAbrirVisita={onAbrirVisita}
               onDeshacer={setDeshacer}
             />
           }
   ```
   y después de `<ReportesPendientes … />`, antes de `</>`:
   ```tsx
         {modal === 'pasar' && (
           <PasarPendientesModal
             visitId={visitId}
             pendientes={pendientes}
             accent={accent}
             onClose={() => setModal(null)}
             onDone={() => { setModal(null); alCambiar() }}
           />
         )}
         {modal === 'editar' && (
           <EditarProcedimientosModal
             visitId={visitId}
             protocolId={protocolId}
             kind={visitKind}
             actuales={items.map((p) => ({ procedure_id: p.procedure_id, completed: doneOf(p.procedure_id) }))}
             accent={accent}
             onClose={() => setModal(null)}
             onDone={() => { setModal(null); alCambiar() }}
           />
         )}
         {deshacer && (
           <DeshacerContinuacionModal
             destino={deshacer}
             accent={accent}
             onClose={() => setDeshacer(null)}
             onDone={() => { setDeshacer(null); alCambiar() }}
           />
         )}
   ```

- [ ] **Paso 7: `Modal.tsx` — cuántos hay abiertos**

En `src/components/Modal.tsx`, después de `const abiertos: object[] = []`:
```ts
/**
 * Cuántos `Modal` hay abiertos. Lo usa el detalle de visita, que NO es un `Modal` y escucha Escape
 * por su cuenta: con uno de estos abierto encima, el Esc es del de arriba y la visita queda.
 */
export function modalesAbiertos(): number {
  return abiertos.length
}
```

- [ ] **Paso 8: `VisitDetail.tsx` — abrir la continuación o su origen encima**

1. Import: `import { modalesAbiertos } from '../../components/Modal'`, y `useRef` en el import de `react`.
2. Después de `const [recitar, setRecitar] = useState<DayVisitRow | null>(null)` (línea 122):
   ```ts
     /** Otra visita abierta ENCIMA de ésta (la continuación o su origen, vNNNN). Cerrarla vuelve acá. */
     const [otraVisita, setOtraVisita] = useState<string | null>(null)
     /* Los `Modal` que ya estaban abiertos cuando se montó esta visita (si se abrió desde uno). El Esc
        es nuestro sólo si no se abrió ninguno más encima: un modal hijo lo consume y la visita queda. */
     const modalesAlMontar = useRef(modalesAbiertos())
   ```
3. En el `onKey` del efecto de teclado, reemplazar `      if (doctorOpen) return` por:
   ```ts
         if (doctorOpen || otraVisita || modalesAbiertos() > modalesAlMontar.current) return
   ```
   y en el arreglo de dependencias (`[onClose, onChanged, onPrev, onNext, canNav, doctorOpen]`) sumar `otraVisita`.
4. En el montaje de `<VisitProcedures` (línea ~287):
   ```tsx
                     <VisitProcedures
                       visitId={visit.id}
                       visitDefId={visit.visit_def_id}
                       visitKind={visit.kind}
                       originVisitId={visit.origin_visit_id ?? null}
                       protocolId={visit.protocol_id}
                       accent={accent}
                       readOnly={readOnly}
                       onAbrirVisita={setOtraVisita}
                       onCambio={refrescar}
                     />
   ```
5. Después del bloque `{recitar && ( … )}`, antes del `</>` final:
   ```tsx
       {/* La continuación o su origen, encima. Es el MISMO componente: se edita igual y cerrarlo
           vuelve a esta visita, que se refresca por si el desdoblamiento cambió. */}
       {otraVisita && (
         <VisitDetail
           visitId={otraVisita}
           accent={accent}
           onClose={() => setOtraVisita(null)}
           onChanged={refrescar}
           onOpenPatient={onOpenPatient}
         />
       )}
   ```

- [ ] **Paso 9: Verificar y commit**

```bash
npx tsc --noEmit && npx vitest run src/views/track
git add src/views/track/DesdoblamientoVisita.tsx src/views/track/PasarPendientesModal.tsx src/views/track/EditarProcedimientosModal.tsx src/views/track/DeshacerContinuacionModal.tsx src/views/track/PanelResumenVisita.tsx src/views/track/VisitProcedures.tsx src/views/track/VisitDetail.tsx src/components/Modal.tsx && git commit -m "feat(coordinacion): pasar pendientes a otro día, editar procedimientos y deshacer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: typecheck limpio, tests en verde.

---

### Tarea 12: El tablero de reportes nombra las visitas sueltas

**Files:**
- Modify: `src/data/reportStatus.ts:20-70` (`ReportStatusRow`)
- Modify: `src/views/track/reportes/ReportCard.tsx:86`
- Modify: `src/views/track/reportes/ReportesPendientesView.tsx:211`

**Interfaces:**
- Consumes: `v_protocol_report_status.visit_kind` (Tarea 3).
- Produces: `ReportStatusRow.visit_kind: VisitKind`.

- [ ] **Paso 1: El tipo**

En `src/data/reportStatus.ts`, dentro de `ReportStatusRow`, después de `coordinator_name`:
```ts
  /** Tipo de la visita (vNNNN). Nombra en el tablero a las que no tienen definición: retest, VNP. */
  visit_kind: VisitKind
```
con `import type { VisitKind } from '../lib/visitLabels'`.

- [ ] **Paso 2: Los dos rótulos**

En `ReportCard.tsx:86`, reemplazar `{row.visit_code ?? '—'}` por:
```tsx
              {/* Una suelta no tiene definición: sin código NI nombre, el rótulo es su tipo (vNNNN). */}
              {row.visit_code ?? (row.visit_name ? '—' : KIND_SHORT[row.visit_kind])}
```
y en `ReportesPendientesView.tsx:211`, reemplazar `{r.visit_code ?? '—'}` por:
```tsx
                  {r.visit_code ?? (r.visit_name ? '—' : KIND_SHORT[r.visit_kind])}
```
Los dos archivos importan `import { KIND_SHORT } from '../../../lib/visitLabels'`.

- [ ] **Paso 3: Verificar y commit**

```bash
npx tsc --noEmit
git add src/data/reportStatus.ts src/views/track/reportes/ReportCard.tsx src/views/track/reportes/ReportesPendientesView.tsx && git commit -m "feat(coordinacion): el tablero de reportes nombra el retest y la VNP

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 13: Build, QA en el navegador y PR B

**Files:** ninguno nuevo.

- [ ] **Paso 1: El gate**

```bash
npm run build
```
Expected: tsc limpio, vitest con 0 fallas, `vite build` verde, y el bundle en el orden de **~1,5 MB** (si pesa ~300 kB falta el `.env` y el build está roto aunque pase).

- [ ] **Paso 2: QA en el preview** (con la migración ya aplicada en prod)

`preview_start` con `spira-dev` (puerto 5250). El Director se loguea; vos **no** ingresás contraseñas. Todo sobre el protocolo **TEST-QA**, paciente **TEST-001**. Anotá los ids de lo que creás, para borrar exactamente eso al final. Hacé clicks con `element.click()` desde `javascript_tool` y esperá 4-5 s después de navegar: el panel oculto renderiza lento.

Verificá, leyendo el DOM (no screenshots, que se cuelgan):
1. **Retest antes de randomizar** (en una inscripción de TEST-001 sin randomizar): «Agendar visita» ofrece Retest; con Retest elegido aparece «¿Qué lleva?»; sin casillas marcadas, «Agendar visita» avisa «Elegí al menos un procedimiento para el retest.»; con un procedimiento, se crea y su detalle lo muestra en el resumen.
2. **Pasar pendientes**: en una visita del cronograma de TEST-001 con procedimientos sin tildar, «Pasar pendientes a otro día» → elegir uno, fecha → aparece el bloque «Pasaron a otra visita · 1 procedimiento · dd/mm/aaaa» y el procedimiento ya no figura en la visita.
3. **La continuación**: «Abrir la visita del …» abre encima una visita titulada «Continuación de …» con ese procedimiento; Esc la cierra y deja la de origen abierta.
4. **Tildar lo diferido**: ya no se ofrece en la visita de origen.
5. **Deshacer**: «Deshacer» → confirmar → el bloque desaparece y el procedimiento vuelve a la visita de origen.
6. **Tira del día**: en «Visitas del día», la visita de origen y la continuación muestran cada una su lista.

- [ ] **Paso 3: Limpieza**

Borrá **sólo** lo que creaste (por id): las continuaciones con «Deshacer», el retest desde la base si hace falta. Nunca por tipo ni en lote.

- [ ] **Paso 4: PR B**

`git grep -n "NNNN" -- src` tiene que salir vacío. Push de la rama y PR por la API. La descripción: qué hace, que **depende de la migración `N` ya aplicada**, el resultado del QA (los seis puntos) y el pie `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. El Director mergea.

- [ ] **Paso 5: Memoria**

Crear la memoria del proyecto `plan-visitas-retest-y-continuacion.md` (estado: en qué PR quedó cada parte, número de la migración y si está aplicada) y su renglón en `MEMORY.md`.
