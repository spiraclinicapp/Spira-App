# Salida ambulatoria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que la farmacia pueda entregar medicación ambulatoria a alguien que no es paciente de ningún estudio y puede no figurar en el sistema.

**Architecture:** tabla propia `ambulatory_dispensations` + un RPC `SECURITY DEFINER` que en una transacción inserta la fila, descuenta el lote y escribe el asiento en `stock_movements` con un `reference_type` nuevo. El front suma un renglón al kebab de Farmacia Ambulatoria, un modal y una lista de últimas salidas. No se toca `dispensation_requests`.

**Tech Stack:** Postgres/Supabase (RPC plpgsql, RLS), React 19 + TypeScript strict, Vite, vitest. CSS con variables de `tokens.css`, íconos Lucide vía `components/Icon.tsx`.

**Spec:** [`../specs/2026-09-08-dispensacion-ambulatoria-design.md`](../specs/2026-09-08-dispensacion-ambulatoria-design.md) · **Mock:** [`../../mock-salida-ambulatoria.html`](../../mock-salida-ambulatoria.html)

## Global Constraints

- **Migración nueva = archivo nuevo numerado.** La última aplicada es la `0115`; ésta es la **`0116`**. Nunca editar ni renumerar una ya aplicada.
- **Paridad de `$$`:** la cantidad de marcadores de dollar-quote en el texto crudo del `.sql` tiene que ser **par**. Nunca dos signos peso pegados dentro de un comentario.
- **Dentro de una función con `set search_path` acotado, calificar todo** lo que no sea de `public` ni `pg_catalog`. Para uuid en runtime, `gen_random_uuid()` (está en `pg_catalog`), nunca `uuid_generate_v4()`.
- **Toda tabla con trigger de auditoría necesita columna `id`** — `audit_row()` resuelve `old.id` al planificar.
- **Idioma:** comentarios, nombres de dominio y copy de UI en castellano rioplatense. Comentarios densos, explicando el porqué.
- **Errores → mensajes serenos en castellano**, traducidos por `pharmaErrorMessage`.
- **Realce = elevación** (`--spira-shadow-sm/md`), nunca borde de color. Foco de inputs suave.
- **Ambulatoria es azul:** `--spira-acc-deep-blue` (`#3A6B8C`), definido en `views/pharma/recepcion/ambitos.ts`. No inventar tokens.
- **Stagear por ruta** (`git add <archivos>`), nunca `git add -A`: el working copy es compartido.
- **Gate:** `npm run build` verde (tsc + 830 tests + vite build) antes de decir que algo anda.

---

## Corrección al spec, antes de empezar

El spec lista tres cosas a testear y una de ellas **no se puede testear con vitest**: *"el signo del asiento (`quantity_delta` negativo)"* vive en el RPC, y este proyecto no tiene harness de SQL (`TODOS.md` › "Base · el proyecto no puede testear su propio SQL"). Se verifica en el QA de la Tarea 6, mirando que `quantity_on_hand` baje y el movimiento sea negativo.

Los tres tests puros que **sí** se escriben están en las tareas 3 y 4.

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0116_salida_ambulatoria.sql` | **Crear.** Tabla, RLS, trigger de auditoría, CHECK de `reference_type` ensanchado, RPC y vista de lectura |
| `src/data/team.ts` | **Modificar.** Recibe `RosterRow` + `useTeamRoster` (hoy en `data/tareas.ts`, que es de Coordinación) |
| `src/data/tareas.ts` | **Modificar.** Deja de definirlos; los importa de `team.ts` |
| `src/views/tareas/TareaModal.tsx` | **Modificar.** Actualiza el import |
| `src/data/pharma/ambulatoria.ts` | **Crear.** Tipos, `useSalidasAmbulatorias()`, `dispensarAmbulatoria()` y las reglas puras |
| `src/data/pharma/ambulatoria.test.ts` | **Crear.** Los dos tests de reglas puras |
| `src/data/pharma/index.ts` | **Modificar.** Una línea de re-export |
| `src/views/pharma/SalidaAmbulatoriaModal.tsx` | **Crear.** El modal |
| `src/views/pharma/salidaAmbulatoria.ts` | **Crear.** `filaDeSalida()`, presentación pura |
| `src/views/pharma/salidaAmbulatoria.test.ts` | **Crear.** El tercer test puro |
| `src/views/pharma/MedicamentosView.tsx` | **Modificar.** Renglón del kebab + montaje del modal + lista de últimas salidas |
| `supabase/README.md`, `CLAUDE.md`, `TODOS.md` | **Modificar.** Índice de migraciones, número de la última, cerrar la entrada |

---

## Task 1: Mudar el padrón del equipo a la capa Core

`useTeamRoster` vive hoy en `src/data/tareas.ts`, que es el módulo de Coordinación. Farmacia lo necesita para el desplegable de autorizante, y un import de Pharma hacia `data/tareas` describiría una relación entre módulos que no existe. Es "make the change easy, then make the easy change": el refactor va **solo**, antes de la feature.

**Por qué importa que sea ese hook y no `useTeamAccess`:** `v_team_access` está cerrada a gerencia por RLS y **devuelve una sola fila —la propia— para todos los demás, en silencio**. Con esa fuente, la farmacéutica vería únicamente su propio nombre en el desplegable y no habría error que lo explicara. La vista `v_team_roster` (`0109`) existe exactamente por este problema.

**Files:**
- Modify: `src/data/team.ts`
- Modify: `src/data/tareas.ts:55-60` (la interfaz) y `:105-120` (el hook)
- Modify: `src/views/tareas/TareaModal.tsx` (el import)

**Interfaces:**
- Produces: `RosterRow { id: string; full_name: string; puesto: string | null }` y `useTeamRoster(): QueryResult<RosterRow[]>`, ahora exportados desde `src/data/team.ts`.

- [ ] **Step 1: Leer los tres archivos y mover el bloque**

Cortar de `src/data/tareas.ts` la interfaz `RosterRow` y la función `useTeamRoster` **con sus comentarios completos** (incluido el párrafo que explica por qué no se usa `v_team_access` — ese comentario es el que evita que alguien lo "simplifique" en seis meses). Pegarlos al final de `src/data/team.ts`.

- [ ] **Step 2: Arreglar los imports**

En `src/data/tareas.ts`, borrar las definiciones movidas. En `src/views/tareas/TareaModal.tsx`, cambiar el import de `useTeamRoster` para que apunte a `../../data/team`.

**No re-exportar desde `tareas.ts` para mantener compatibilidad.** Eso deja dos fuentes y es exactamente el antipatrón que se rechazó hoy con `MOTIVOS_FUERA_CRONOGRAMA`.

- [ ] **Step 3: Verificar que no quedó ningún importador viejo**

```bash
grep -rn "useTeamRoster\|RosterRow" src/
```
Esperado: solo `src/data/team.ts` (definición), `src/data/tareas.ts` (si todavía lo usa, importándolo) y `src/views/tareas/TareaModal.tsx`. Ninguno importando de `data/tareas`.

- [ ] **Step 4: Gate**

```bash
npm run build
```
Esperado: `830 tests` verdes, build ok. Es un movimiento puro: si algo se rompe, es un import mal apuntado.

- [ ] **Step 5: Commit**

```bash
git add src/data/team.ts src/data/tareas.ts src/views/tareas/TareaModal.tsx
git commit -m "refactor(core): el padrón del equipo se muda a data/team

useTeamRoster vivía en data/tareas (Coordinación) y Farmacia lo necesita para el
desplegable de autorizante de la salida ambulatoria. Un import de Pharma hacia
data/tareas describiría una relación entre módulos que no existe.

Sin re-export de compatibilidad: dos fuentes es el antipatrón que se rechazó hoy
con MOTIVOS_FUERA_CRONOGRAMA."
```

---

## Task 2: La migración 0116

**Files:**
- Create: `supabase/migrations/0116_salida_ambulatoria.sql`

**Interfaces:**
- Produces: tabla `ambulatory_dispensations`; vista `v_ambulatory_dispensations`; RPC `dispensar_ambulatoria(uuid, integer, text, text, uuid, text) returns uuid`; valor `'ambulatoria'` aceptado en `stock_movements.reference_type`.

- [ ] **Step 1: Escribir el archivo**

```sql
-- ============================================================================
-- 0116 — Salida ambulatoria: entregar medicación a alguien que no es paciente
--
-- Spec: docs/superpowers/specs/2026-09-08-dispensacion-ambulatoria-design.md
--
-- EL HUECO: desde la 0035 el stock ambulatorio ENTRA (recepción tipada, lotes con protocol_id
-- NULL) y no sale nunca, porque toda dispensación de la app cuelga de
-- dispensation_requests.visit_id, que es not null contra patient_visits. El caso real: "viene el
-- director y te dice dale un Seretide a él; puede que sea el hijo del director, que no figura en
-- ningún lado". No hay paciente, ni enrolamiento, ni protocolo.
--
-- TABLA PROPIA Y NO AFLOJAR dispensation_requests: el FEFO de la 0050:316 filtra
-- ml.protocol_id = v_protocol_id, que con NULL nunca matchea. Decisión del 2026-08-15,
-- reconfirmada el 2026-09-08.
--
-- ADITIVA: ningún front desplegado consulta nada de esto. Va ANTES del deploy.
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0115. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · La tabla -------------------------------------------------------------------------------
-- `id` NO es decorativo: audit_row() (0003) hace `case when tg_op = 'DELETE' then old.id else
-- new.id end` y Postgres resuelve `old.id` AL PLANIFICAR. Sin esa columna, la primera escritura
-- revienta con 42703 señalando el cuerpo de audit_row y no esta tabla (pasó con la 0111).
--
-- gen_random_uuid() y no uuid_generate_v4(): la primera vive en pg_catalog y no depende del
-- search_path. Como default da igual (Postgres lo resuelve por OID al hacer el DDL), pero deja
-- el archivo entero libre de la trampa de la 0113.
--
-- Los NOMBRES van como SNAPSHOT además de la FK, igual que task_assignees.user_name (0108): si
-- la cuenta se da de baja o cambia de nombre, la salida sigue diciendo quién la autorizó el día
-- que pasó. La FK queda para poder preguntar "qué autorizó esta persona" sin parsear texto.
create table if not exists public.ambulatory_dispensations (
  id                 uuid primary key default gen_random_uuid(),
  medication_id      uuid not null references public.medications(id) on delete restrict,
  lot_id             uuid not null references public.medication_lots(id) on delete restrict,
  quantity           integer not null check (quantity > 0),
  recipient_name     text not null check (btrim(recipient_name) <> ''),
  recipient_document text,
  authorized_by      uuid not null references public.users(id) on delete restrict,
  authorized_by_name text not null,
  dispensed_by       uuid not null default auth.uid() references public.users(id) on delete restrict,
  dispensed_by_name  text not null,
  notes              text,
  created_at         timestamptz not null default now(),
  -- El lote tiene que ser del MISMO medicamento. Mismo candado compuesto que dispensation_items.
  constraint fk_amb_disp_lot_med foreign key (lot_id, medication_id)
    references public.medication_lots (id, medication_id) on delete restrict
);
comment on table public.ambulatory_dispensations is
  'Entrega de medicación ambulatoria a alguien que NO es paciente de investigación. Acto único:
   no tiene estados, ni escaneo, ni comprobante. Inmutable: se corrige con un ajuste de stock. 0116.';

create index if not exists idx_amb_disp_created on public.ambulatory_dispensations (created_at desc);
create index if not exists idx_amb_disp_lot     on public.ambulatory_dispensations (lot_id);

drop trigger if exists trg_audit_ambulatory_dispensations on public.ambulatory_dispensations;
create trigger trg_audit_ambulatory_dispensations
  after insert or update or delete on public.ambulatory_dispensations
  for each row execute function public.audit_row();


-- 2 · RLS: se LEE con pharma o gerencia; no se escribe por tabla ------------------------------
-- Sin policies de insert/update/delete a propósito: la única puerta de escritura es el RPC de
-- abajo, que es SECURITY DEFINER y hace el descuento de stock en la misma transacción.
alter table public.ambulatory_dispensations enable row level security;

drop policy if exists "pharma ve las salidas ambulatorias" on public.ambulatory_dispensations;
create policy "pharma ve las salidas ambulatorias"
  on public.ambulatory_dispensations for select to authenticated
  using (public.has_module('pharma') or public.has_module('gerencia'));


-- 3 · stock_movements.reference_type acepta 'ambulatoria' -------------------------------------
-- NO se reusa 'dispensation': dejaría reference_id apuntando a DOS tablas distintas
-- (dispensations y ambulatory_dispensations), y cualquier join que resuelva ese id por una de
-- ellas devolvería filas de menos, en silencio.
--
-- Se busca la constraint por su DEFINICIÓN y no por nombre, que es el patrón de la 0113: el
-- nombre depende de cómo la generó Postgres y dropear por un nombre que no existe no falla,
-- deja la constraint vieja en pie y el insert de más abajo revienta recién en runtime.
do $mig$
declare v_con text;
begin
  select con.conname into v_con
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where nsp.nspname = 'public' and rel.relname = 'stock_movements'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) ilike '%reference_type%';
  if v_con is not null then
    execute format('alter table public.stock_movements drop constraint %I', v_con);
  end if;
end $mig$;

alter table public.stock_movements
  add constraint stock_movements_reference_type_valido
  check (reference_type is null or reference_type in
         ('reception','dispensation','ajuste_manual','devolucion','vencimiento','reasignacion','ambulatoria'));

comment on column public.stock_movements.reference_type is
  'De qué tabla es reference_id. ambulatoria = ambulatory_dispensations (0116). El movement_type
   de una salida ambulatoria es dispensacion: es una entrega. Quien quiera SOLO las de protocolo
   tiene que filtrar también por reference_type.';


-- 4 · La vista de lectura ---------------------------------------------------------------------
-- security_invoker: la RLS de la tabla ya decide quién ve qué. No joinea `users` — los nombres
-- viajan como snapshot en la propia fila, así que la vista no depende de poder leer esa tabla.
create or replace view public.v_ambulatory_dispensations
with (security_invoker = true) as
select ad.id,
       ad.created_at,
       ad.quantity,
       ad.recipient_name,
       ad.recipient_document,
       ad.authorized_by_name,
       ad.dispensed_by_name,
       ad.notes,
       ad.medication_id,
       m.name  as medication_name,
       m.dosis as medication_dosis,
       m.unit  as medication_unit,
       ml.lot_number
  from public.ambulatory_dispensations ad
  join public.medications     m  on m.id  = ad.medication_id
  join public.medication_lots ml on ml.id = ad.lot_id;

revoke all on public.v_ambulatory_dispensations from anon;
grant select on public.v_ambulatory_dispensations to authenticated;


-- 5 · El RPC ----------------------------------------------------------------------------------
-- Atómico: valida, inserta, descuenta el lote y escribe el asiento en una sola transacción.
-- `for update` sobre el lote cierra la carrera de dos entregas simultáneas del mismo lote.
create or replace function public.dispensar_ambulatoria(
  p_lot_id             uuid,
  p_quantity           integer,
  p_recipient_name     text,
  p_recipient_document text,
  p_authorized_by      uuid,
  p_notes              text default null
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public as $fn$
declare
  v_med         uuid;
  v_protocol    uuid;
  v_disponible  integer;
  v_autoriza    text;
  v_dispensa    text;
  v_id          uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para entregar medicación' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero' using errcode = 'check_violation';
  end if;
  if p_recipient_name is null or btrim(p_recipient_name) = '' then
    raise exception 'Poné el nombre de quien retira la medicación' using errcode = 'check_violation';
  end if;

  -- Quien autoriza tiene que ser una cuenta ACTIVA: el padrón que ve el front sólo ofrece activas
  -- (v_team_roster, 0109), pero el candado va donde no se puede saltear.
  select u.full_name into v_autoriza
    from public.users u where u.id = p_authorized_by and u.is_active;
  if v_autoriza is null then
    raise exception 'Quien autoriza no es una cuenta activa' using errcode = '23503';
  end if;

  select u.full_name into v_dispensa from public.users u where u.id = auth.uid();

  select ml.medication_id, ml.protocol_id, ml.quantity_on_hand
    into v_med, v_protocol, v_disponible
    from public.medication_lots ml
   where ml.id = p_lot_id
     for update;
  if not found then
    raise exception 'Ese lote no existe' using errcode = '23503';
  end if;
  -- El ámbito ambulatorio son los lotes con protocol_id NULL (0035). Entregar producto de un
  -- sponsor a alguien que no es su paciente sería un desvío: el candado va acá, no en la UI.
  if v_protocol is not null then
    raise exception 'Ese lote no es de la farmacia ambulatoria' using errcode = 'check_violation';
  end if;
  if v_disponible < p_quantity then
    raise exception 'Stock insuficiente en el lote (% disponible, % requerido)',
      v_disponible, p_quantity using errcode = 'check_violation';
  end if;

  insert into public.ambulatory_dispensations
      (medication_id, lot_id, quantity, recipient_name, recipient_document,
       authorized_by, authorized_by_name, dispensed_by, dispensed_by_name, notes)
    values
      (v_med, p_lot_id, p_quantity, btrim(p_recipient_name),
       nullif(btrim(coalesce(p_recipient_document, '')), ''),
       p_authorized_by, v_autoriza, auth.uid(), coalesce(v_dispensa, 'Farmacia'),
       nullif(btrim(coalesce(p_notes, '')), ''))
    returning id into v_id;

  update public.medication_lots
     set quantity_on_hand = quantity_on_hand - p_quantity,
         updated_at = now()
   where id = p_lot_id;

  -- quantity_delta NEGATIVO: es una salida. Si quedara positivo, una entrega SUMARÍA stock y el
  -- inventario se inflaría sin que nada se vea mal en pantalla.
  insert into public.stock_movements
      (medication_id, lot_id, movement_type, quantity_delta,
       reference_id, reference_type, reason, created_by)
    values
      (v_med, p_lot_id, 'dispensacion', -p_quantity,
       v_id, 'ambulatoria', 'Entrega ambulatoria a ' || btrim(p_recipient_name), auth.uid());

  return v_id;
end; $fn$;

comment on function public.dispensar_ambulatoria(uuid, integer, text, text, uuid, text) is
  'Entrega ambulatoria: inserta la fila, descuenta el lote y escribe el asiento, atómico.
   Sólo lotes con protocol_id NULL. pharma operator+. 0116.';

revoke all on function public.dispensar_ambulatoria(uuid, integer, text, text, uuid, text) from public;
grant execute on function public.dispensar_ambulatoria(uuid, integer, text, text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Verificar la paridad de los dollar-quote**

```bash
grep -o '\$mig\$\|\$fn\$' supabase/migrations/0116_salida_ambulatoria.sql | wc -l
```
Esperado: `4` (dos marcadores por bloque, dos bloques). Si da impar, el editor de Supabase va a partir las funciones por sus `;` internos y tirar un error lejísimo del problema real.

- [ ] **Step 3: Barrer los consumidores de `movement_type = 'dispensacion'`**

Es el chequeo que el spec dejó anotado. Confirmar que ninguno esté usando ese valor con el significado "de protocolo":

```bash
grep -rn "movement_type.*dispensacion\|'dispensacion'" src/ supabase/migrations/ | grep -v 0116
```
Si aparece alguno que asuma protocolo, calificarlo también por `reference_type = 'dispensation'`. **Anotar el resultado del barrido en el commit**, aunque sea "ninguno".

- [ ] **Step 4: NO aplicar todavía**

La migración se le pasa al Director; el agente no tiene acceso SQL a producción. Se aplica **antes** del deploy del front (es aditiva).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0116_salida_ambulatoria.sql
git commit -m "feat(db): 0116 — salida ambulatoria

Tabla propia, RPC atómico y reference_type nuevo 'ambulatoria'. No se toca
dispensation_requests: el FEFO de la 0050 filtra por protocol_id y con NULL
nunca matchea.

movement_type reusa 'dispensacion' (es una entrega) para evitar el ALTER TYPE
en archivo aparte. Barrido de consumidores: <resultado del Step 3>.

ADITIVA: va antes del deploy."
```

---

## Task 3: La capa de datos

**Files:**
- Create: `src/data/pharma/ambulatoria.ts`
- Create: `src/data/pharma/ambulatoria.test.ts`
- Modify: `src/data/pharma/index.ts`

**Interfaces:**
- Consumes: `RosterRow` de `data/team` (Task 1); `LotDetailRow` de `data/pharma/stock`; el RPC de la Task 2.
- Produces:
  - `SalidaAmbulatoriaRow` (fila de `v_ambulatory_dispensations`)
  - `useSalidasAmbulatorias(limit?: number): QueryResult<SalidaAmbulatoriaRow[]>`
  - `dispensarAmbulatoria(input: SalidaAmbulatoriaInput): Promise<{ error: string | null; code?: string; id?: string }>`
  - `lotesEntregables(lots: LotDetailRow[]): LotDetailRow[]`
  - `bloqueoDeEntrega(f: FormularioSalida): string | null`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { lotesEntregables, bloqueoDeEntrega } from './ambulatoria'
import type { LotDetailRow } from './stock'

/**
 * Las dos reglas puras de la salida ambulatoria.
 *
 * Se testean porque fallan EN SILENCIO. `lotesEntregables` al revés ofrecería un lote de
 * protocolo: el RPC lo rechaza, pero recién al confirmar y con la persona esperando en el
 * mostrador — y peor, ofrecer producto de un sponsor ya es el error, aunque la base lo frene.
 * `bloqueoDeEntrega` demasiado permisivo manda al servidor un pedido que va a rebotar; demasiado
 * estricto bloquea el botón sin decir por qué.
 */
const lote = (campos: Partial<LotDetailRow>): LotDetailRow =>
  ({ lot_id: 'l1', medication_id: 'm1', protocol_id: null, tipo: 'ambulatoria',
     name: 'Seretide', quantity_on_hand: 10, ...campos }) as LotDetailRow

describe('lotesEntregables', () => {
  it('deja pasar solo los lotes SIN protocolo', () => {
    const out = lotesEntregables([
      lote({ lot_id: 'amb' }),
      lote({ lot_id: 'proto', protocol_id: 'p1', tipo: 'protocolo' }),
    ])
    expect(out.map((l) => l.lot_id)).toEqual(['amb'])
  })

  it('descarta los que están en cero: no hay nada que entregar', () => {
    const out = lotesEntregables([lote({ lot_id: 'vacio', quantity_on_hand: 0 }), lote({ lot_id: 'ok' })])
    expect(out.map((l) => l.lot_id)).toEqual(['ok'])
  })

  it('tolera la lista vacía', () => {
    expect(lotesEntregables([])).toEqual([])
  })
})

describe('bloqueoDeEntrega', () => {
  const ok = { cantidad: 1, disponible: 10, nombre: 'Juan Pérez', autorizanteId: 'u1' }

  it('sin bloqueo cuando está todo', () => {
    expect(bloqueoDeEntrega(ok)).toBeNull()
  })

  it('pide el nombre de quien retira, y no acepta espacios', () => {
    expect(bloqueoDeEntrega({ ...ok, nombre: '' })).toBe('Poné el nombre de quien retira la medicación.')
    expect(bloqueoDeEntrega({ ...ok, nombre: '   ' })).toBe('Poné el nombre de quien retira la medicación.')
  })

  it('pide quién autoriza', () => {
    expect(bloqueoDeEntrega({ ...ok, autorizanteId: '' })).toBe('Elegí quién autorizó la entrega.')
  })

  it('rechaza cantidades que no son un entero positivo', () => {
    expect(bloqueoDeEntrega({ ...ok, cantidad: 0 })).toBe('La cantidad tiene que ser mayor que cero.')
    expect(bloqueoDeEntrega({ ...ok, cantidad: -3 })).toBe('La cantidad tiene que ser mayor que cero.')
    expect(bloqueoDeEntrega({ ...ok, cantidad: 1.5 })).toBe('La cantidad tiene que ser un número entero.')
  })

  it('no deja entregar más de lo que hay', () => {
    expect(bloqueoDeEntrega({ ...ok, cantidad: 11, disponible: 10 }))
      .toBe('No hay tanto stock: quedan 10 u. en el lote.')
  })

  it('el orden de los bloqueos sigue el orden del formulario', () => {
    // Con todo mal, avisa por lo PRIMERO que falta yendo de arriba hacia abajo. Un mensaje que
    // salta al último campo hace que la persona corrija de a saltos.
    expect(bloqueoDeEntrega({ cantidad: 0, disponible: 10, nombre: '', autorizanteId: '' }))
      .toBe('La cantidad tiene que ser mayor que cero.')
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
npx vitest run src/data/pharma/ambulatoria.test.ts
```
Esperado: FAIL — `Failed to resolve import "./ambulatoria"`.

- [ ] **Step 3: Escribir el módulo**

```ts
import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'
import type { LotDetailRow } from './stock'

/**
 * Salida ambulatoria: entregar medicación a alguien que NO es paciente de investigación.
 *
 * Es un acto único, no una dispensación de protocolo: no tiene estados, ni escaneo, ni
 * comprobante. Esa ceremonia existe porque el producto de investigación es rastreable unidad por
 * unidad ante ANMAT; acá esa razón no aplica, y copiarla haría que no se use — y el stock volvería
 * a salir sin registrarse, que es peor.
 *
 * Ver docs/superpowers/specs/2026-09-08-dispensacion-ambulatoria-design.md
 */

/** Fila de `v_ambulatory_dispensations` (0116). */
export interface SalidaAmbulatoriaRow {
  id: string
  created_at: string
  quantity: number
  recipient_name: string
  recipient_document: string | null
  /** Snapshot del nombre al momento de la entrega: sobrevive a una baja o a un renombre. */
  authorized_by_name: string
  dispensed_by_name: string
  notes: string | null
  medication_id: string
  medication_name: string
  medication_dosis: string | null
  medication_unit: string
  lot_number: string
}

const SALIDA_COLS =
  'id, created_at, quantity, recipient_name, recipient_document, authorized_by_name, ' +
  'dispensed_by_name, notes, medication_id, medication_name, medication_dosis, ' +
  'medication_unit, lot_number'

/** Las últimas salidas ambulatorias, más recientes primero. */
export function useSalidasAmbulatorias(limit = 20) {
  return useSupabaseQuery<SalidaAmbulatoriaRow[]>(
    (c) =>
      c
        .from('v_ambulatory_dispensations')
        .select(SALIDA_COLS)
        .order('created_at', { ascending: false })
        .limit(limit)
        .returns<SalidaAmbulatoriaRow[]>(),
    [limit],
  )
}

/**
 * Los lotes que se pueden entregar: ambulatorios (sin protocolo) y con unidades.
 *
 * El filtro por `protocol_id === null` es EXPLÍCITO y no "sin filtro": la diferencia entre esas
 * dos cosas es ofrecerle a la farmacéutica producto de un sponsor para dárselo a alguien que no
 * es su paciente. El RPC lo rechaza igual, pero ofrecerlo ya es el error.
 */
export function lotesEntregables(lots: LotDetailRow[]): LotDetailRow[] {
  return lots.filter((l) => l.protocol_id === null && l.quantity_on_hand > 0)
}

/** Lo que el modal necesita saber para decidir si puede enviar. */
export interface FormularioSalida {
  cantidad: number
  disponible: number
  nombre: string
  autorizanteId: string
}

/**
 * Por qué NO se puede entregar todavía, o null si se puede.
 *
 * El orden sigue el del formulario, de arriba hacia abajo: un mensaje que salta al último campo
 * hace que la persona corrija de a saltos. Los mismos candados viven en el RPC — esto sólo evita
 * mandar un pedido que va a rebotar.
 */
export function bloqueoDeEntrega(f: FormularioSalida): string | null {
  if (!Number.isFinite(f.cantidad) || f.cantidad <= 0) return 'La cantidad tiene que ser mayor que cero.'
  if (!Number.isInteger(f.cantidad)) return 'La cantidad tiene que ser un número entero.'
  if (f.cantidad > f.disponible) return `No hay tanto stock: quedan ${f.disponible} u. en el lote.`
  if (f.nombre.trim() === '') return 'Poné el nombre de quien retira la medicación.'
  if (f.autorizanteId === '') return 'Elegí quién autorizó la entrega.'
  return null
}

/** Entrada del RPC `dispensar_ambulatoria` (0116). */
export interface SalidaAmbulatoriaInput {
  lotId: string
  quantity: number
  recipientName: string
  recipientDocument: string | null
  authorizedBy: string
  notes: string | null
}

/**
 * Registra una entrega ambulatoria (RPC `dispensar_ambulatoria`, 0116, pharma operator+).
 *
 * Atómico: la base inserta la fila, descuenta el lote y escribe el asiento en `stock_movements`
 * en una sola transacción. El front nunca escribe el libro directo.
 */
export async function dispensarAmbulatoria(
  input: SalidaAmbulatoriaInput,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('dispensar_ambulatoria', {
    p_lot_id: input.lotId,
    p_quantity: input.quantity,
    p_recipient_name: input.recipientName,
    p_recipient_document: input.recipientDocument,
    p_authorized_by: input.authorizedBy,
    p_notes: input.notes,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}
```

- [ ] **Step 4: Sumar el re-export**

En `src/data/pharma/index.ts`, después de `export * from './stock'`:

```ts
export * from './ambulatoria'
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
npx vitest run src/data/pharma/ambulatoria.test.ts
```
Esperado: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add src/data/pharma/ambulatoria.ts src/data/pharma/ambulatoria.test.ts src/data/pharma/index.ts
git commit -m "feat(pharma): capa de datos de la salida ambulatoria

lotesEntregables y bloqueoDeEntrega salen como funciones puras con test: las dos
fallan en silencio. La primera al revés ofrecería un lote de protocolo — que el
RPC rechaza, pero ofrecerlo ya es el error."
```

---

## Task 4: El modal

**Files:**
- Create: `src/views/pharma/salidaAmbulatoria.ts`
- Create: `src/views/pharma/salidaAmbulatoria.test.ts`
- Create: `src/views/pharma/SalidaAmbulatoriaModal.tsx`

**Interfaces:**
- Consumes: `lotesEntregables`, `bloqueoDeEntrega`, `dispensarAmbulatoria` (Task 3); `useTeamRoster` de `data/team` (Task 1); `LotDetailRow`.
- Produces:
  - `filaDeSalida(s: SalidaAmbulatoriaRow): { fecha: string; medicamento: string; cantidad: string; quien: string }`
  - `<SalidaAmbulatoriaModal lots={LotDetailRow[]} lotePreseleccionado={string | null} onClose={() => void} onDone={() => void} />`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from 'vitest'
import { filaDeSalida } from './salidaAmbulatoria'
import type { SalidaAmbulatoriaRow } from '../../data/pharma'

/**
 * Cómo se lee un renglón del historial de salidas.
 *
 * Es presentación pura, y se testea porque los cuatro pedazos salen de campos distintos y un
 * cruce (la cantidad del medicamento equivocado, el autorizante donde va quien recibe) se lee
 * perfectamente bien en pantalla y es falso.
 */
const s = (campos: Partial<SalidaAmbulatoriaRow>): SalidaAmbulatoriaRow =>
  ({ id: 's1', created_at: '2026-09-08T14:30:00Z', quantity: 1,
     recipient_name: 'Juan Pérez', recipient_document: null,
     authorized_by_name: 'Lautaro Molina', dispensed_by_name: 'Ana Farmacia',
     notes: null, medication_id: 'm1', medication_name: 'Seretide',
     medication_dosis: '25/250 mcg', medication_unit: 'u.', lot_number: 'L-4471',
     ...campos }) as SalidaAmbulatoriaRow

describe('filaDeSalida', () => {
  it('arma las cuatro partes del renglón', () => {
    const f = filaDeSalida(s({}))
    expect(f.medicamento).toBe('Seretide 25/250 mcg')
    expect(f.cantidad).toBe('1 u.')
    expect(f.quien).toBe('a Juan Pérez · autorizó Lautaro Molina')
  })

  it('recorta el timestamp antes de formatear la fecha', () => {
    // `formatDayMonth` espera YYYY-MM-DD y hace `iso.split('-')`: pasarle el timestamptz crudo
    // deja "08T14:30:00Z sep" en pantalla. `created_at` es timestamptz, así que hay que recortar.
    expect(filaDeSalida(s({ created_at: '2026-09-08T14:30:00Z' })).fecha).toBe('08 sep')
  })

  it('sin dosis no deja el espacio colgado', () => {
    expect(filaDeSalida(s({ medication_dosis: null })).medicamento).toBe('Seretide')
  })

  it('usa la unidad del medicamento, no una fija', () => {
    expect(filaDeSalida(s({ quantity: 30, medication_unit: 'comp.' })).cantidad).toBe('30 comp.')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run src/views/pharma/salidaAmbulatoria.test.ts
```
Esperado: FAIL — `Failed to resolve import "./salidaAmbulatoria"`.

- [ ] **Step 3: Escribir el helper**

```ts
import { formatDayMonth } from '../../lib/dates'
import type { SalidaAmbulatoriaRow } from '../../data/pharma'

/**
 * Las cuatro partes de un renglón del historial de salidas ambulatorias.
 *
 * Vive afuera del componente porque es lo único testeable de la lista: los pedazos salen de
 * campos distintos de la misma fila, y un cruce se lee perfecto en pantalla siendo falso.
 */
export function filaDeSalida(s: SalidaAmbulatoriaRow): {
  fecha: string
  medicamento: string
  cantidad: string
  quien: string
} {
  const dosis = s.medication_dosis?.trim()
  return {
    // `.slice(0, 10)` NO es decorativo: formatDayMonth espera YYYY-MM-DD y hace `iso.split('-')`.
    // Con el timestamptz crudo, el tercer pedazo es "08T14:30:00Z" y la fila muestra basura.
    fecha: formatDayMonth(s.created_at.slice(0, 10)),
    medicamento: dosis ? `${s.medication_name} ${dosis}` : s.medication_name,
    cantidad: `${s.quantity} ${s.medication_unit}`,
    quien: `a ${s.recipient_name} · autorizó ${s.authorized_by_name}`,
  }
}
```

> **Verificado el 2026-09-08:** `formatDayMonth` existe (`src/lib/dates.ts:153`) y devuelve `"08 sep"`. **Recibe `YYYY-MM-DD`, no un timestamp** — de ahí el `.slice(0, 10)`, que tiene su propio test.

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run src/views/pharma/salidaAmbulatoria.test.ts
```
Esperado: PASS, 3 tests.

- [ ] **Step 5: Escribir el modal**

Espejar `src/views/pharma/ReasignarStockModal.tsx` en estructura, estilos y manejo de error. Contrato:

```tsx
export function SalidaAmbulatoriaModal({ lots, lotePreseleccionado, accentSolid, onClose, onDone }: {
  /** Los lotes del medicamento (o del grupo). Se filtran con `lotesEntregables`. */
  lots: LotDetailRow[]
  /** Abierto desde una fila de lote viene puesto; desde el grupo, null y se elige. */
  lotePreseleccionado: string | null
  accentSolid: string
  onClose: () => void
  onDone: () => void
})
```

Requisitos concretos:
1. **Campos, en este orden:** Cantidad (`input type=number`, ancho 96px) · Quién recibe (obligatorio) · Documento (opcional) · Quién autoriza (`SearchableSelect` con `useTeamRoster()`, `entity="persona"`) · Notas (opcional).
2. **Selector de lote** sólo cuando `lotePreseleccionado === null`: `SearchableSelect` sobre `lotesEntregables(lots)`, ordenado por vencimiento ascendente (FEFO), etiqueta `L-4471 · vence 03/2027 · 14 u.`.
3. **Cabecera** con medicamento, lote elegido, vencimiento y `Disponible: N u.`, como en el mock.
4. **El botón se deshabilita con `bloqueoDeEntrega(...)` y el motivo se muestra debajo**, igual que `PanelNuevaDispensacion`. Nunca un botón deshabilitado mudo.
5. **Nota fija** al pie del cuerpo: *"La entrega queda registrada en el libro de stock y no se puede editar ni borrar. Si te equivocás, se corrige con un ajuste."*
6. **Al confirmar:** `dispensarAmbulatoria(...)`; con error, mostrarlo en el `errBox` y **no** cerrar; con éxito, `onDone()`.
7. **Estilos:** copiar los `CSSProperties` de `ReasignarStockModal`. Realce por elevación, nunca borde de color.

- [ ] **Step 6: Gate**

```bash
npm run build
```
Esperado: `842 tests` (830 + 9 de la Task 3 + 3 de ésta), build ok.

- [ ] **Step 7: Commit**

```bash
git add src/views/pharma/salidaAmbulatoria.ts src/views/pharma/salidaAmbulatoria.test.ts src/views/pharma/SalidaAmbulatoriaModal.tsx
git commit -m "feat(pharma): modal de salida ambulatoria

El desplegable de autorizante sale de useTeamRoster (v_team_roster, 0109) y NO
de useTeamAccess, que está cerrada a gerencia y le mostraría a la farmacéutica
únicamente su propio nombre, en silencio."
```

---

## Task 5: Cablearlo a Medicamentos

**Files:**
- Modify: `src/views/pharma/MedicamentosView.tsx` (kebab del grupo ~`:942`, kebab de lote, y el apartado `ambulatoria` ~`:531`)

**Interfaces:**
- Consumes: `SalidaAmbulatoriaModal` (Task 4), `useSalidasAmbulatorias` y `filaDeSalida` (Tasks 3 y 4).

- [ ] **Step 1: Estado y handlers**

Espejar exactamente el patrón de `openReasignarGrupo` / `openReasignarLote` (`:253-257`):

```tsx
const [entregando, setEntregando] = useState<{ lots: LotDetailRow[]; lotePreseleccionado: string | null } | null>(null)
const openEntregarGrupo = (grupo: GrupoVisible) => { setDropdownId(null); setEntregando({ lots: grupo.lotes, lotePreseleccionado: null }) }
const openEntregarLote  = (row: LotDetailRow)   => { setDropdownId(null); setEntregando({ lots: [row], lotePreseleccionado: row.lot_id }) }
```

> Leer cómo `openReasignarGrupo` obtiene los lotes del grupo y usar la MISMA fuente. Si el campo no se llama `grupo.lotes`, usar el que corresponda.

- [ ] **Step 2: El renglón del kebab**

**Sólo en el apartado `ambulatoria`.** Va **primero**, arriba de "Reasignar stock": es la acción más frecuente sobre stock ambulatorio.

```tsx
{apartado === 'ambulatoria' && (
  <button type="button" onClick={() => onEntregarGrupo(grupo)}>
    <Icon name="arrowUpRight" size={15} /> Entregar
  </button>
)}
```

> **Verificado el 2026-09-08:** `arrowUpRight` existe en el set de `components/Icon.tsx`. El resto del renglón (clases, tamaños) se copia del de "Reasignar stock" que está al lado.

- [ ] **Step 3: Montar el modal**

Junto al montaje de `ReasignarStockModal` (~`:380`):

```tsx
{entregando && (
  <SalidaAmbulatoriaModal
    lots={entregando.lots}
    lotePreseleccionado={entregando.lotePreseleccionado}
    accentSolid="var(--spira-pharma-solid)"
    onClose={() => setEntregando(null)}
    onDone={() => { setEntregando(null); lotesQ.refetch(); salidasQ.refetch() }}
  />
)}
```

> `lotesQ` es el hook de lotes que ya usa la vista — usar su nombre real. El refetch de los dos es lo que hace que el stock baje y la salida aparezca sin recargar.

- [ ] **Step 4: La lista de últimas salidas**

Debajo del listado de stock, **sólo en el apartado `ambulatoria`**:

```tsx
{apartado === 'ambulatoria' && (
  <div style={card}>
    <p className="spira-eyebrow" style={{ marginBottom: 12 }}>Últimas salidas</p>
    {salidasQ.loading ? (
      <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '6px 2px' }}>Cargando…</div>
    ) : (salidasQ.data ?? []).length === 0 ? (
      <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '18px 2px' }}>
        Todavía no se entregó nada por farmacia ambulatoria.
      </div>
    ) : (
      (salidasQ.data ?? []).map((s) => {
        const f = filaDeSalida(s)
        return (
          <div key={s.id} style={histRow}>
            <span style={histFecha}>{f.fecha}</span>
            <span style={histMed}>{f.medicamento}</span>
            <span style={histQty}>{f.cantidad}</span>
            <span style={histQuien}>{f.quien}</span>
          </div>
        )
      })
    )}
  </div>
)}
```

Los estilos (`histRow`, `histFecha`, `histMed`, `histQty`, `histQuien`) se copian del mock `docs/mock-salida-ambulatoria.html`, sección 3, traducidos a `CSSProperties`.

- [ ] **Step 5: Gate**

```bash
npm run build
```
Esperado: `842 tests` verdes, build ok.

- [ ] **Step 6: Verificar en el preview**

Levantar el preview y confirmar, con el panel oculto y `javascript_tool` (nada de screenshots, se cuelgan):
- El renglón "Entregar" aparece en el kebab **solo** en Farmacia Ambulatoria, y **no** en Farmacia Protocolo.
- El modal abre con la cabecera del medicamento correcto.
- Con el nombre vacío, el botón está deshabilitado y el motivo se lee debajo.

Esperar 4-5 s después de cada `navigate` y confirmar `aria-expanded` antes de contar `[role="option"]`.

- [ ] **Step 7: Commit**

```bash
git add src/views/pharma/MedicamentosView.tsx
git commit -m "feat(pharma): 'Entregar' en el kebab de Farmacia Ambulatoria + últimas salidas"
```

---

## Task 6: Cierre — QA logueado, documentación y despliegue

**Files:**
- Modify: `supabase/README.md` (fila de la 0116), `CLAUDE.md` (la última aplicada pasa a `0116`), `TODOS.md` (cerrar la entrada de dispensación ambulatoria)

- [ ] **Step 1: Registrar la migración**

Fila nueva en el índice de `supabase/README.md`, **sin** la marca "Aplicada en prod" hasta que el Director confirme. Actualizar el número en `CLAUDE.md` (línea 63).

```bash
node scripts/check-migraciones.mjs
```
Esperado: `✓ 116 migraciones, índice al día.`

- [ ] **Step 2: Cerrar la entrada de `TODOS.md`**

Marcar "Pharma · dispensación ambulatoria" como HECHA con la fecha y la versión, siguiendo la convención del archivo (`## ~~Título~~ — HECHO el ...`). **No borrarla**: el contexto de por qué se diseñó así sigue valiendo.

**Dejar viva la parte que NO se hizo:** que estas salidas aparezcan en Reportes de Farmacia. Sigue siendo su propia tanda, y la entrada ya explica por qué (la vista `0083` arranca `from dispensations`).

- [ ] **Step 3: QA logueado contra producción**

⚠️ **Producción tiene datos reales.** Usar el mismo método que el 2026-09-08: protocolo `TEST-*` propio si hace falta stock, o un lote ambulatorio real entregando **1 unidad** y devolviéndola después con un ajuste — y anotando el ajuste como corrección de QA.

Verificar:
1. La entrega se registra y aparece en "Últimas salidas".
2. **`quantity_on_hand` baja** en el lote. (Es la mitad del test que no se puede escribir en vitest.)
3. **El asiento es negativo** en `stock_movements`, con `reference_type = 'ambulatoria'`.
4. Un lote de protocolo **no** se ofrece en el selector.

- [ ] **Step 4: Anotar el agujero de authz que el QA NO cubre**

La cuenta de QA tiene los cinco módulos, así que entra por `gerencia` y **nunca ejercita** la rama `has_min_role('pharma','operator')` del RPC nuevo. Sumar `dispensar_ambulatoria` al DISPARADOR 2 de la entrada "El scopeo de la RLS nunca se probó con una cuenta acotada" en `TODOS.md`.

- [ ] **Step 5: Orden de despliegue**

La 0116 es **aditiva**: ningún front desplegado la consulta. Se aplica **ANTES** del deploy.

```
1 · el Director aplica 0116_salida_ambulatoria.sql
2 · verificar el contrato sin sesión (abajo)
3 · merge + deploy del front
```

**Verificar el paso 1 antes de dar el deploy por cerrado** — es la lección de la 0114, que se aplicó tarde y dejó un botón inerte en producción:

```bash
# con los nombres correctos → 401/42501 (existe, sin permiso)
# si da 404/PGRST202 → la migración NO está aplicada
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "$VITE_SUPABASE_URL/rest/v1/rpc/dispensar_ambulatoria" \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" -H 'Content-Type: application/json' \
  -d '{"p_lot_id":"00000000-0000-0000-0000-000000000000","p_quantity":1,"p_recipient_name":"x","p_recipient_document":null,"p_authorized_by":"00000000-0000-0000-0000-000000000000"}'
```

- [ ] **Step 6: Commit y PR**

```bash
git add supabase/README.md CLAUDE.md TODOS.md
git commit -m "docs: registrar la 0116 y cerrar la entrada de dispensación ambulatoria"
```

PR por la API REST de GitHub (`gh` no está instalado); el Director mergea.

---

## Self-review

**Cobertura del spec:** las siete decisiones tienen tarea. D1 tabla propia → T2. D2 nombre+documento → T2 (columnas) y T4 (campos). D3 autorizante FK por desplegable → T1 (la fuente legible) + T2 (la FK y el candado de cuenta activa) + T4 (el selector). D4 acto único → T2 (un RPC, sin estados) y T4 (un modal). D5 kebab de Ambulatoria → T5. D6 lista de últimas salidas → T2 (vista), T3 (hook), T4 (`filaDeSalida`), T5 (render). D7 sólo lotes ambulatorios → T2 (el candado del RPC) y T3 (`lotesEntregables`).

**Fuera de alcance del spec, respetado:** sin comprobante imprimible, sin ficha de persona, sin tocar Reportes, sin editar ni anular.

**Consistencia de tipos:** `LotDetailRow` (existente) se consume en T3 y T4 con los campos `lot_id`, `protocol_id`, `quantity_on_hand`, `lot_number`, `expiry_date`. `SalidaAmbulatoriaRow` se define en T3 y se consume en T4 (`filaDeSalida`) y T5 (render) con los mismos nombres. `bloqueoDeEntrega` usa `FormularioSalida` en T3 y T4. `dispensarAmbulatoria` recibe `SalidaAmbulatoriaInput` en T3 y se llama en T4.

**Las dos verificaciones abiertas se resolvieron al escribir el plan**, no se dejaron para el implementador: `arrowUpRight` existe en `Icon.tsx`, y `formatDayMonth` existe en `dates.ts:153` — **pero recibe `YYYY-MM-DD`, no un timestamp**. Pasarle `created_at` crudo dejaría `"08T14:30:00Z sep"` en la fila. El `.slice(0, 10)` y su test salieron de ese chequeo: la primera versión del plan tenía el bug.

**Sigue habiendo tres cosas que el implementador tiene que leer y no adivinar**, marcadas en su paso: cómo `openReasignarGrupo` obtiene los lotes del grupo (T5 Step 1), el nombre real del hook de lotes de la vista (T5 Step 3), y los estilos de `ReasignarStockModal` a copiar (T4 Step 5). No son huecos del plan: son "seguí el patrón de al lado", y el patrón está nombrado con archivo y línea.

**Corrección al spec, ya anotada arriba:** el test del signo del asiento no puede ser un test de vitest; se verifica en el QA (T6 Step 3, punto 3).
