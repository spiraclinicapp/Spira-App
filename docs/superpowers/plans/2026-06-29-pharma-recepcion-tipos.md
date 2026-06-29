# Recepción tipada (Farmacia Protocolo / Ambulatoria) + wizard — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: usá superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Rediseñar la recepción de medicación de Pharma como un wizard de pantalla propia de 4 pasos que soporta dos tipos (Farmacia Protocolo y Farmacia Ambulatoria), persistiendo el tipo y el stock segregado por ámbito.

**Architecture:** Una migración de schema (`0035`) agrega un enum `reception_kind` + columna `tipo` y `protocol_id` nullable en `medication_receptions` y `medication_lots`, con el trigger/RPC ramificados por ámbito. El frontend reemplaza `NewReceptionModal` por un `ReceptionWizard` a pantalla completa dentro de `RecepcionView`, reusando la capa de datos de recepción y el catálogo nombrado global. Sin react-router/react-query (estado propio del shell).

**Tech Stack:** React 19 + TypeScript strict · Vite · Supabase (PostgreSQL + RLS + RPC `SECURITY DEFINER`) · CSS con variables (tokens "Sereno") · íconos Lucide.

**Spec fuente:** [`docs/superpowers/specs/2026-06-29-pharma-recepcion-tipos-design.md`](../specs/2026-06-29-pharma-recepcion-tipos-design.md) (datos + flujo + review de diseño).

## Modelo de verificación (este repo NO tiene tests)

El gate de cada tarea **no es pytest/jest** sino:
1. **`npm run typecheck`** verde (tsc --noEmit) — gate obligatorio.
2. **Migración aplicada a mano** por el Director en el SQL Editor de Supabase (no hay SQL directo a prod desde el agente). Las tareas de frontend typecheckean sin la migración, pero la **verificación en runtime** la necesita aplicada.
3. **Verificación en navegador** detrás del login con el usuario **pharma-leader** (`lautaro.molina.scherbovsky`), usando solo registros `TEST-*` y borrándolos después (regla dura #1 del repo). Las preview tools nativas llegan hasta el login; lo de adentro lo verifica el Director.

Donde el template diría "escribí el test que falla / corré pytest", acá va "escribí el código / corré `npm run typecheck` / verificá en navegador".

## Global Constraints

- **TypeScript strict**; tipos a mano (interfaces por fila/input), con comentarios que citan la migración.
- **Migraciones inmutables y numeradas**: la nueva es `supabase/migrations/0035_pharma_recepcion_tipos.sql`. **Nunca** editar una ya aplicada ni renumerar. Idempotente (`if not exists` / guardas), aplicada **a mano** después de la `0034`.
- **Mutaciones vía RPC** (`supabase.rpc`) para altas atómicas con authz server-side; lecturas con hooks `useXxx()` sobre `useSupabaseQuery`.
- **Errores → mensajes serenos en castellano** vía `pharmaErrorMessage` (23505 duplicado, 23502 faltante, 42501 permiso/RLS, check_violation coherencia). RLS filtra en silencio: 0 filas tras update/delete = sin permiso.
- **Estilo "Sereno"**: reusar `btnPrimary`/`btnOutline` ([components/buttons.ts](../../../src/components/buttons.ts)), `FormField`/`fieldInput` ([components/FormField.tsx](../../../src/components/FormField.tsx)), `EmptyState`, `Modal`, `Icon` (Lucide). Acento Pharma `var(--spira-pharma-solid)` (#A8842F). Sin Tailwind/CSS-in-JS. Castellano rioplatense, voseo, sentence case, sin emoji.
- **A11y WCAG 2.1 AA**: foco visible, `−/+` con `aria-label` y target ≥44px, validación/errores en `aria-live`, `aria-disabled` en "Investigación".

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/0035_pharma_recepcion_tipos.sql` | Crear | Enum `reception_kind`; `tipo` + `protocol_id` nullable + CHECK en recepciones y lotes; índice parcial ambulatoria; RPC `create_reception` re-firmada; trigger `apply_reception_stock` ramificado; vista `v_medication_stock` con `tipo`. |
| `src/data/pharma/receptions.ts` | Modificar | `ReceptionKind`; `tipo` + `protocol_id` nullable en `ReceptionRow`/inputs; `createReception` manda `p_tipo`; `useReceptions(tipo, protocolId?)`. |
| `src/data/pharma/index.ts` | Modificar (si hace falta) | Re-exportar `ReceptionKind` si no sale por wildcard. |
| `src/components/Stepper.tsx` | Crear | Stepper de pasos (activo/hecho/pendiente), navegable a pasos completados. |
| `src/components/SegmentedControl.tsx` | Crear | Selector segmentado genérico (opciones, una deshabilitable con badge). |
| `src/views/pharma/MedicationPicker.tsx` | Crear | Desplegable con búsqueda/typeahead sobre el catálogo. |
| `src/views/pharma/ReceptionWizard.tsx` | Crear | Contenedor del wizard: estado, navegación, stepper, descarte. |
| `src/views/pharma/wizard/Step0Setup.tsx` | Crear | Paso 0: tipo + protocolo. |
| `src/views/pharma/wizard/Step1Scan.tsx` | Crear | Paso 1: escaneo/conteo + linkCode + agregar a mano. |
| `src/views/pharma/wizard/Step2Lots.tsx` | Crear | Paso 2: lotes/vencimientos + multi-lote + resto. |
| `src/views/pharma/wizard/Step3Summary.tsx` | Crear | Paso 3: fecha/notas/resumen + crear. |
| `src/views/pharma/RecepcionView.tsx` | Modificar | Selector de ámbito; render del wizard a pantalla completa; badge de tipo; resaltado de la recepción nueva. |
| `src/views/pharma/NewReceptionModal.tsx` | Borrar | Reemplazado por el wizard. |

---

## Task 1: Migración 0035 — schema de recepción tipada

**Files:**
- Create: `supabase/migrations/0035_pharma_recepcion_tipos.sql`

**Interfaces:**
- Produces: enum `public.reception_kind`; `medication_receptions.tipo` + `protocol_id` nullable; `medication_lots.tipo` + `protocol_id` nullable; RPC `create_reception(reception_kind, uuid, date, text, jsonb)`; vista `v_medication_stock` con columna `tipo`.

- [ ] **Step 1: Escribir la migración** (idempotente, patrón de la 0032)

```sql
-- Spira · Migración 0035 — Pharma: recepción tipada (protocolo / investigacion / ambulatoria)
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0034. IDEMPOTENTE.
-- Reabre el ámbito del stock: el "tipo" vive en la recepción y el lote; ambulatoria no lleva
-- protocolo. Las tablas de Pharma ya tienen datos (catálogo + verificación TEST-*): el default
-- 'protocolo' backfillea y los protocol_id existentes (no nulos) cumplen el CHECK.
-- ============================================================================

-- 1 · Enum del tipo de recepción/ámbito
do $$ begin
  if not exists (select 1 from pg_type where typname = 'reception_kind') then
    create type public.reception_kind as enum ('protocolo', 'investigacion', 'ambulatoria');
  end if;
end $$;

-- 2 · medication_receptions: tipo + protocol_id nullable + CHECK
alter table public.medication_receptions
  add column if not exists tipo public.reception_kind not null default 'protocolo';
alter table public.medication_receptions alter column protocol_id drop not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'medication_receptions_tipo_protocol_chk') then
    alter table public.medication_receptions add constraint medication_receptions_tipo_protocol_chk
      check ((tipo = 'ambulatoria') = (protocol_id is null));
  end if;
end $$;

-- 3 · medication_lots: tipo + protocol_id nullable + CHECK + índice parcial para ambulatoria
alter table public.medication_lots
  add column if not exists tipo public.reception_kind not null default 'protocolo';
alter table public.medication_lots alter column protocol_id drop not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'medication_lots_tipo_protocol_chk') then
    alter table public.medication_lots add constraint medication_lots_tipo_protocol_chk
      check ((tipo = 'ambulatoria') = (protocol_id is null));
  end if;
end $$;
-- El unique (medication_id, protocol_id, lot_number) de la 0032 sigue valiendo para protocol_id no-null
-- (los NULL no participan). Agregamos el parcial para ambulatoria:
create unique index if not exists medication_lots_ambulatoria_lot_key
  on public.medication_lots (medication_id, lot_number) where protocol_id is null;

-- 4 · Trigger: copia tipo + protocolo; allow-list solo con protocolo; upsert ramificado
create or replace function public.apply_reception_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_lot_id uuid;
begin
  if new.status = 'verificada' and old.status is distinct from 'verificada' then
    for r in select * from public.reception_items where reception_id = new.id loop
      if new.protocol_id is not null then
        if not exists (select 1 from public.protocol_medications pm
                       where pm.medication_id = r.medication_id and pm.protocol_id = new.protocol_id) then
          raise exception 'El medicamento % no está asignado al protocolo % de la recepción',
            r.medication_id, new.protocol_id using errcode = 'check_violation';
        end if;
        insert into public.medication_lots (medication_id, protocol_id, tipo, lot_number, expiry_date, quantity_on_hand)
        values (r.medication_id, new.protocol_id, new.tipo, r.lot_number, r.expiry_date, r.quantity)
        on conflict (medication_id, protocol_id, lot_number) do update
          set quantity_on_hand = medication_lots.quantity_on_hand + excluded.quantity_on_hand,
              expiry_date       = coalesce(medication_lots.expiry_date, excluded.expiry_date)
        returning id into v_lot_id;
      else
        insert into public.medication_lots (medication_id, protocol_id, tipo, lot_number, expiry_date, quantity_on_hand)
        values (r.medication_id, null, new.tipo, r.lot_number, r.expiry_date, r.quantity)
        on conflict (medication_id, lot_number) where protocol_id is null do update
          set quantity_on_hand = medication_lots.quantity_on_hand + excluded.quantity_on_hand,
              expiry_date       = coalesce(medication_lots.expiry_date, excluded.expiry_date)
        returning id into v_lot_id;
      end if;
      insert into public.stock_movements
        (medication_id, lot_id, movement_type, quantity_delta, reference_id, reference_type, created_by)
      values
        (r.medication_id, v_lot_id, 'recepcion', r.quantity, new.id, 'reception',
         coalesce(new.verified_by, new.received_by));
    end loop;
  end if;
  return new;
end;
$$;

-- 5 · RPC create_reception re-firmada (drop de la vieja firma + nueva con p_tipo)
drop function if exists public.create_reception(uuid, date, text, jsonb);
create or replace function public.create_reception(
  p_tipo public.reception_kind, p_protocol_id uuid, p_reception_date date, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_item jsonb;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para crear recepciones' using errcode = '42501'; end if;
  if (p_tipo = 'ambulatoria') <> (p_protocol_id is null) then
    raise exception 'El tipo % es incompatible con el protocolo indicado', p_tipo using errcode = 'check_violation';
  end if;
  insert into public.medication_receptions (tipo, protocol_id, received_by, reception_date, status, notes)
  values (p_tipo, p_protocol_id, auth.uid(), p_reception_date, 'pendiente', p_notes)
  returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if p_protocol_id is not null then
      if not exists (select 1 from public.protocol_medications pm
                     where pm.medication_id = (v_item->>'medication_id')::uuid and pm.protocol_id = p_protocol_id) then
        raise exception 'Medicamento % no está asignado al protocolo', v_item->>'medication_id' using errcode = 'check_violation';
      end if;
    end if;
    insert into public.reception_items (reception_id, medication_id, lot_number, expiry_date, quantity)
    values (v_id, (v_item->>'medication_id')::uuid, v_item->>'lot_number',
            nullif(v_item->>'expiry_date','')::date, (v_item->>'quantity')::integer);
  end loop;
  return v_id;
end;
$$;
grant execute on function public.create_reception(public.reception_kind, uuid, date, text, jsonb) to authenticated;

-- 6 · Vista de stock: gana columna 'tipo' (al final) + ámbito ambulatoria por UNION ALL
create or replace view public.v_medication_stock
with (security_invoker = true) as
select
  m.id as medication_id, pm.protocol_id, m.name, m.unit, m.low_stock_threshold,
  coalesce(sum(ml.quantity_on_hand), 0)                                   as total_stock,
  coalesce(sum(ml.quantity_on_hand), 0) <= m.low_stock_threshold          as is_low_stock,
  coalesce(ml.tipo, 'protocolo')::public.reception_kind                   as tipo
from public.protocol_medications pm
join public.medications m on m.id = pm.medication_id
left join public.medication_lots ml
  on ml.medication_id = pm.medication_id and ml.protocol_id = pm.protocol_id
group by m.id, pm.protocol_id, ml.tipo
union all
select
  m.id, null::uuid, m.name, m.unit, m.low_stock_threshold,
  coalesce(sum(ml.quantity_on_hand), 0),
  coalesce(sum(ml.quantity_on_hand), 0) <= m.low_stock_threshold,
  'ambulatoria'::public.reception_kind
from public.medications m
join public.medication_lots ml on ml.medication_id = m.id and ml.protocol_id is null
group by m.id;
comment on view public.v_medication_stock is 'Stock por (medicamento, ámbito): protocolo sobre la asignación + ambulatoria (protocol_id null). Columna tipo. 0035.';
```

- [ ] **Step 2: Revisar el SQL** contra la 0032 (nombres de constraint, orden de dependencias, `security_invoker`). No aplicar desde el agente.

- [ ] **Step 3: Pedirle al Director que la aplique a mano** en el SQL Editor de Supabase (después de la 0034) y confirme: `select unnest(enum_range(null::reception_kind));` devuelve los 3 valores; `\d medication_lots` muestra `tipo` y `protocol_id` nullable.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0035_pharma_recepcion_tipos.sql
git commit -m "feat(pharma): migración 0035 — recepción tipada (protocolo/ambulatoria)"
```

---

## Task 2: Capa de datos — `receptions.ts`

**Files:**
- Modify: `src/data/pharma/receptions.ts`
- Check: `src/data/pharma/index.ts` (re-export)

**Interfaces:**
- Consumes: RPC `create_reception(reception_kind, uuid, date, text, jsonb)` (Task 1).
- Produces: `export type ReceptionKind`; `NewReceptionInput { tipo, protocol_id: string | null, ... }`; `ReceptionRow { tipo, protocol_id: string | null, ... }`; `useReceptions(tipo: ReceptionKind, protocolId: string | null)`; `createReception(input)`.

- [ ] **Step 1: Agregar el tipo y ampliar las interfaces**

```ts
/** Ámbito/tipo de la recepción (enum `reception_kind`, migración 0035). */
export type ReceptionKind = 'protocolo' | 'investigacion' | 'ambulatoria'
```

En `ReceptionRow` agregar `tipo: ReceptionKind` y cambiar `protocol_id: string` → `protocol_id: string | null`. En `RECEPTION_COLS` agregar `tipo` a la lista de columnas seleccionadas.

- [ ] **Step 2: `useReceptions` filtra por ámbito**

```ts
/** Recepciones de un ámbito (cola; más nuevas primero), con sus renglones.
 *  protocolo/investigacion → filtra por tipo + protocolo; ambulatoria → por tipo (sin protocolo). */
export function useReceptions(tipo: ReceptionKind, protocolId: string | null) {
  return useSupabaseQuery<ReceptionRow[]>(
    (c) => {
      let q = c.from('medication_receptions').select(RECEPTION_COLS).eq('tipo', tipo)
      if (tipo === 'ambulatoria') q = q.is('protocol_id', null)
      else if (protocolId) q = q.eq('protocol_id', protocolId)
      return q.order('reception_date', { ascending: false }).returns<ReceptionRow[]>()
    },
    [tipo, protocolId],
  )
}
```

- [ ] **Step 3: `NewReceptionInput` + `createReception` mandan `tipo`**

```ts
export interface NewReceptionInput {
  tipo: ReceptionKind
  protocol_id: string | null
  reception_date: string
  notes: string | null
  items: ReceptionItemInput[]
}

export async function createReception(
  input: NewReceptionInput,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('create_reception', {
    p_tipo: input.tipo,
    p_protocol_id: input.protocol_id,
    p_reception_date: input.reception_date,
    p_notes: input.notes,
    p_items: input.items,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}
```

- [ ] **Step 4: Re-export.** Confirmar en `src/data/pharma/index.ts` que `ReceptionKind` se exporta (si el index re-exporta con `export *` desde `receptions`, ya sale; si lista nombres, agregar `ReceptionKind`).

- [ ] **Step 5: typecheck** → `npm run typecheck`. Esperado: rojo en `RecepcionView`/`NewReceptionModal` (todavía llaman a la firma vieja) — se arregla en Tasks 9-10. El archivo `receptions.ts` en sí compila.

- [ ] **Step 6: Commit**

```bash
git add src/data/pharma/receptions.ts src/data/pharma/index.ts
git commit -m "feat(pharma): capa de datos de recepción tipada (tipo + protocolo opcional)"
```

---

## Task 3: Primitivas de UI — `Stepper` y `SegmentedControl`

**Files:**
- Create: `src/components/Stepper.tsx`
- Create: `src/components/SegmentedControl.tsx`

**Interfaces:**
- Produces: `<Stepper steps={string[]} current={number} maxReached={number} onJump={(i)=>void} accent={string} />`; `<SegmentedControl<T> options={{value,label,disabled?,badge?}[]} value={T} onChange={(v:T)=>void} accent={string} />`.

- [ ] **Step 1: `Stepper.tsx`** — paso activo en acento Pharma, hechos con check (Icon `check`), pendientes en muted; click solo a pasos `<= maxReached`. Usa tokens Sereno; hereda la micro-interacción salvo en pendientes (`.spira-no-press` en los no-clickeables).

```tsx
import type { CSSProperties } from 'react'
import { Icon } from './Icon'

interface StepperProps { steps: string[]; current: number; maxReached: number; onJump: (i: number) => void; accent: string }

export function Stepper({ steps, current, maxReached, onJump, accent }: StepperProps) {
  return (
    <div role="list" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        const reachable = i <= maxReached && i !== current
        const dotBg = active || done ? accent : 'var(--spira-surface)'
        const dotColor = active || done ? 'var(--spira-on-accent)' : 'var(--spira-muted)'
        return (
          <div key={label} role="listitem" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => reachable && onJump(i)}
              disabled={!reachable}
              aria-current={active ? 'step' : undefined}
              className={reachable ? undefined : 'spira-no-press'}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent',
                padding: '6px 4px', cursor: reachable ? 'pointer' : 'default', minHeight: 44,
              }}
            >
              <span style={{ ...dot, background: dotBg, color: dotColor, border: active || done ? 'none' : '1px solid var(--spira-line-2)' }}>
                {done ? <Icon name="check" size={14} color="var(--spira-on-accent)" /> : i + 1}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: active ? 700 : 600, color: active ? 'var(--spira-ink)' : 'var(--spira-muted)' }}>{label}</span>
            </button>
            {i < steps.length - 1 && <span style={{ width: 24, height: 1, background: 'var(--spira-line)' }} />}
          </div>
        )
      })}
    </div>
  )
}
const dot: CSSProperties = { width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flex: '0 0 auto' }
```

- [ ] **Step 2: `SegmentedControl.tsx`** — opciones en fila; seleccionada = tinte de acento + borde acento; una opción puede ir `disabled` con `badge` ("próximamente") y `aria-disabled`. Targets ≥44px.

```tsx
import type { CSSProperties } from 'react'

interface Option<T extends string> { value: T; label: string; disabled?: boolean; badge?: string }
interface Props<T extends string> { options: Option<T>[]; value: T | ''; onChange: (v: T) => void; accent: string }

export function SegmentedControl<T extends string>({ options, value, onChange, accent }: Props<T>) {
  return (
    <div role="radiogroup" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={o.disabled || undefined}
            disabled={o.disabled}
            onClick={() => !o.disabled && onChange(o.value)}
            className={o.disabled ? 'spira-no-press' : undefined}
            style={{
              minHeight: 44, padding: '10px 16px', borderRadius: 'var(--spira-radius-md)',
              border: `1px solid ${selected ? accent : 'var(--spira-line-2)'}`,
              background: selected ? accent + '14' : 'var(--spira-white)',
              color: o.disabled ? 'var(--spira-faint)' : 'var(--spira-ink)',
              fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 14,
              cursor: o.disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {o.label}
            {o.badge && <span style={badge}>{o.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
const badge: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--spira-faint)', border: '1px solid var(--spira-line-2)', borderRadius: 999, padding: '1px 7px' }
```

- [ ] **Step 3: typecheck** → `npm run typecheck` (los componentes nuevos compilan; aún sin usar).
- [ ] **Step 4: Commit**

```bash
git add src/components/Stepper.tsx src/components/SegmentedControl.tsx
git commit -m "feat(pharma): primitivas Stepper y SegmentedControl (tokens Sereno)"
```

---

## Task 4: Primitiva — `MedicationPicker` (typeahead)

**Files:**
- Create: `src/views/pharma/MedicationPicker.tsx`

**Interfaces:**
- Consumes: `useMedications()` (existe). Tipo `MedicationRow` de `data/pharma/medications.ts` (`{ id, name, drug?: { name } | null }`).
- Produces: `<MedicationPicker onPick={(medicationId: string) => void} accent={string} />`.

- [ ] **Step 1: Implementar** — input `fieldInput` que filtra el catálogo por nombre/droga (case-insensitive); lista desplegable (máx ~8 visibles, scroll) con `position: fixed`/portal-safe (acá alcanza un contenedor `position: relative` + lista `absolute` dentro del wizard, que no tiene `overflow: hidden`). Al elegir, limpia el input y llama `onPick`. Teclado: ↑/↓ y Enter (al menos Enter sobre el primer match).

```tsx
import { useMemo, useRef, useState } from 'react'
import { fieldInput } from '../../components/FormField'
import { useMedications } from '../../data/pharma'

interface Props { onPick: (medicationId: string) => void; accent: string }

export function MedicationPicker({ onPick, accent }: Props) {
  const meds = useMedications()
  const all = meds.data ?? []
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return all.slice(0, 8)
    return all.filter((m) => m.name.toLowerCase().includes(t) || (m.drug?.name?.toLowerCase().includes(t) ?? false)).slice(0, 8)
  }, [q, all])

  const pick = (id: string) => { onPick(id); setQ(''); setOpen(false) }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) { e.preventDefault(); pick(matches[0].id) } if (e.key === 'Escape') setOpen(false) }}
        placeholder="Buscar medicamento por nombre o droga…"
        aria-label="Buscar medicamento para agregar a mano"
        style={fieldInput}
      />
      {open && matches.length > 0 && (
        <ul role="listbox" style={listBox}>
          {matches.map((m) => (
            <li key={m.id}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(m.id) }} style={itemBtn(accent)}>
                <span style={{ fontWeight: 600, color: 'var(--spira-ink)' }}>{m.name}</span>
                {m.drug && <span style={{ color: 'var(--spira-muted)' }}> · {m.drug.name}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
const listBox = { position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20, listStyle: 'none', margin: 0, padding: 4, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 'var(--spira-radius-md)', boxShadow: 'var(--spira-shadow-md)', maxHeight: 280, overflow: 'auto' } as const
const itemBtn = (accent: string) => ({ width: '100%', textAlign: 'left' as const, border: 'none', background: 'transparent', padding: '10px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 14, minHeight: 44 })
```

- [ ] **Step 2: typecheck** → `npm run typecheck`.
- [ ] **Step 3: Commit**

```bash
git add src/views/pharma/MedicationPicker.tsx
git commit -m "feat(pharma): MedicationPicker con typeahead sobre el catálogo"
```

---

## Task 5: `ReceptionWizard` — contenedor, estado, navegación, Paso 0

**Files:**
- Create: `src/views/pharma/ReceptionWizard.tsx`
- Create: `src/views/pharma/wizard/Step0Setup.tsx`

**Interfaces:**
- Consumes: `Stepper`, `SegmentedControl`, `useProtocols` (de `data/protocols`), `ReceptionKind`.
- Produces: `<ReceptionWizard accentSolid initialTipo initialProtocolId onClose={()=>void} onCreated={()=>void} />`. Tipo de estado compartido (exportado para los Steps):

```ts
export interface LotDraft { key: number; lotNumber: string; expiryDate: string; quantity: string }
export interface CountedMed { medicationId: string; name: string; quantity: number; lots: LotDraft[] }
```

- [ ] **Step 1: Estado + navegación + chrome del wizard.** El contenedor maneja: `step` (0-3), `maxReached`, `tipo`, `protocolId`, `meds: CountedMed[]`, `receptionDate`, `notes`. Validación por paso (`canAdvance`). "Cancelar" y cambiar tipo con `meds.length > 0` piden confirmación (reusar `Modal`). Render del Step actual.

```tsx
import { useState } from 'react'
import { Stepper } from '../../components/Stepper'
import { Modal } from '../../components/Modal'
import { btnOutline, btnPrimary } from '../../components/buttons'
import type { ReceptionKind } from '../../data/pharma'
import { Step0Setup } from './wizard/Step0Setup'
// (Step1Scan, Step2Lots, Step3Summary se importan en Tasks 6-8)

export interface LotDraft { key: number; lotNumber: string; expiryDate: string; quantity: string }
export interface CountedMed { medicationId: string; name: string; quantity: number; lots: LotDraft[] }

const STEPS = ['Setup', 'Escaneo', 'Lotes', 'Resumen']

interface Props { accentSolid: string; initialTipo: ReceptionKind; initialProtocolId: string; onClose: () => void; onCreated: (id: string) => void }

export function ReceptionWizard({ accentSolid, initialTipo, initialProtocolId, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0)
  const [maxReached, setMaxReached] = useState(0)
  const [tipo, setTipo] = useState<ReceptionKind>(initialTipo)
  const [protocolId, setProtocolId] = useState(initialProtocolId)
  const [meds, setMeds] = useState<CountedMed[]>([])
  const [receptionDate, setReceptionDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState<null | (() => void)>(null)

  const hasData = meds.length > 0
  const guard = (action: () => void) => { if (hasData) setConfirmDiscard(() => action); else action() }

  const canAdvance = (): boolean => {
    if (step === 0) return tipo === 'ambulatoria' || (tipo === 'protocolo' && !!protocolId)
    if (step === 1) return meds.length > 0 && meds.every((m) => m.quantity > 0)
    if (step === 2) return meds.every((m) => m.lots.every((l) => l.lotNumber.trim()) && m.lots.reduce((s, l) => s + (Number(l.quantity) || 0), 0) === m.quantity)
    return !!receptionDate
  }
  const goto = (i: number) => { setStep(i); setMaxReached((m) => Math.max(m, i)) }
  const next = () => canAdvance() && goto(step + 1)
  const back = () => setStep((s) => Math.max(0, s - 1))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Stepper steps={STEPS} current={step} maxReached={maxReached} onJump={goto} accent={accentSolid} />
        <button type="button" onClick={() => guard(onClose)} style={{ ...btnOutline, marginLeft: 'auto' }}>Cancelar</button>
      </div>

      {step === 0 && (
        <Step0Setup
          accentSolid={accentSolid} tipo={tipo} protocolId={protocolId}
          onTipo={(t) => guard(() => { setTipo(t); if (t === 'ambulatoria') setProtocolId(''); setMeds([]) })}
          onProtocol={setProtocolId}
        />
      )}
      {/* step === 1 → <Step1Scan ... /> (Task 6) */}
      {/* step === 2 → <Step2Lots ... /> (Task 7) */}
      {/* step === 3 → <Step3Summary ... onCreated={onCreated} /> (Task 8) */}

      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--spira-line)', paddingTop: 14 }}>
        <button type="button" onClick={back} disabled={step === 0} style={{ ...btnOutline, opacity: step === 0 ? 0.5 : 1 }}>Atrás</button>
        {step < 3 && (
          <button type="button" onClick={next} disabled={!canAdvance()} style={{ ...btnPrimary(accentSolid), opacity: canAdvance() ? 1 : 0.6 }}>Siguiente</button>
        )}
      </div>

      {confirmDiscard && (
        <Modal title="¿Descartar la recepción en curso?" onClose={() => setConfirmDiscard(null)}>
          <p style={{ fontSize: 14, color: 'var(--spira-muted)', lineHeight: 1.5 }}>Cargaste medicamentos en esta recepción. Si seguís, se pierden.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={() => setConfirmDiscard(null)} style={btnOutline}>Volver</button>
            <button type="button" onClick={() => { const a = confirmDiscard; setConfirmDiscard(null); a?.() }} style={btnPrimary('var(--spira-danger)')}>Descartar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
```

- [ ] **Step 2: `Step0Setup.tsx`** — `SegmentedControl` de tipo (Protocolo · Investigación *disabled badge "próximamente"* · Ambulatoria) + desplegable de protocolo (obligatorio) solo si `tipo === 'protocolo'`.

```tsx
import { SegmentedControl } from '../../../components/SegmentedControl'
import { FormField, fieldInput } from '../../../components/FormField'
import { useProtocols } from '../../../data/protocols'
import type { ReceptionKind } from '../../../data/pharma'

interface Props { accentSolid: string; tipo: ReceptionKind; protocolId: string; onTipo: (t: ReceptionKind) => void; onProtocol: (id: string) => void }

export function Step0Setup({ accentSolid, tipo, protocolId, onTipo, onProtocol }: Props) {
  const protocols = useProtocols()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <FormField label="Tipo de recepción">
        <SegmentedControl
          accent={accentSolid}
          value={tipo}
          onChange={onTipo}
          options={[
            { value: 'protocolo', label: 'Farmacia Protocolo' },
            { value: 'investigacion', label: 'Producto Investigación', disabled: true, badge: 'próximamente' },
            { value: 'ambulatoria', label: 'Farmacia Ambulatoria' },
          ]}
        />
      </FormField>
      {tipo === 'protocolo' && (
        <FormField label="Protocolo">
          <select value={protocolId} onChange={(e) => onProtocol(e.target.value)} required style={fieldInput}>
            <option value="" disabled>Elegí un protocolo</option>
            {(protocols.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </FormField>
      )}
    </div>
  )
}
```

- [ ] **Step 3: typecheck** → `npm run typecheck` (los `{/* step === N */}` comentados todavía no rompen; el wizard renderiza Paso 0 + navegación).
- [ ] **Step 4: Commit**

```bash
git add src/views/pharma/ReceptionWizard.tsx src/views/pharma/wizard/Step0Setup.tsx
git commit -m "feat(pharma): wizard de recepción — contenedor, navegación y Paso 0"
```

---

## Task 6: Paso 1 — Escaneo (contar)

**Files:**
- Create: `src/views/pharma/wizard/Step1Scan.tsx`
- Modify: `src/views/pharma/ReceptionWizard.tsx` (montar Step1)

**Interfaces:**
- Consumes: `resolveCode`, `linkCode`, `assignMedicationToProtocol`, `useMedications`, `MedicationPicker`, `EmptyState`, `CountedMed`, `ReceptionKind`.
- Produces: `<Step1Scan tipo protocolId accentSolid meds setMeds />` (controla `meds: CountedMed[]`).

- [ ] **Step 1: Implementar Step1Scan.** Input escáner con `autoFocus` (Enter dispara `handleScan`). `resolveCode` → conocido: `bump(med)` (+1; si `tipo==='protocolo'` y no asignado, `assignMedicationToProtocol` antes); desconocido → panel ámbar `linkCode` (mismo patrón que la modal vieja: `unknownCode` + select del catálogo + "Asociar y agregar"; si `tipo==='protocolo'` asigna al protocolo). Lista en vivo con `−/+` (`aria-label` "Restar uno"/"Sumar uno", ≥44px) y quitar. Vacío → `EmptyState`/copy cálido "Escaneá el primer medicamento…". "Agregar a mano" con `MedicationPicker`. Reusar el estilo del panel ámbar (`linkPanel`) y el rojo de error del archivo viejo como referencia.

```tsx
import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Icon } from '../../../components/Icon'
import { fieldInput, FormField } from '../../../components/FormField'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { EmptyState } from '../../../components/EmptyState'
import { MedicationPicker } from '../MedicationPicker'
import { resolveCode, linkCode, assignMedicationToProtocol, useMedications } from '../../../data/pharma'
import type { ReceptionKind } from '../../../data/pharma'
import type { CountedMed } from '../ReceptionWizard'

interface Props { tipo: ReceptionKind; protocolId: string; accentSolid: string; meds: CountedMed[]; setMeds: React.Dispatch<React.SetStateAction<CountedMed[]>> }

export function Step1Scan({ tipo, protocolId, accentSolid, meds, setMeds }: Props) {
  const catalog = useMedications(); const all = catalog.data ?? []
  const [scan, setScan] = useState(''); const [msg, setMsg] = useState<string | null>(null)
  const [unknown, setUnknown] = useState<string | null>(null); const [linkId, setLinkId] = useState(''); const [linkErr, setLinkErr] = useState<string | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  const ensureAssigned = async (medicationId: string): Promise<string | null> => {
    if (tipo !== 'protocolo') return null
    const r = await assignMedicationToProtocol(protocolId, medicationId); return r.error
  }
  const bump = (medicationId: string, name: string, delta = 1) => {
    setMeds((prev) => {
      const i = prev.findIndex((m) => m.medicationId === medicationId)
      if (i === -1) return delta > 0 ? [...prev, { medicationId, name, quantity: 1, lots: [] }] : prev
      const next = [...prev]; const q = Math.max(0, next[i].quantity + delta)
      if (q === 0) return next.filter((_, j) => j !== i)
      next[i] = { ...next[i], quantity: q }; return next
    })
  }
  const handleScan = async () => {
    const code = scan.trim(); if (!code) return; setScan(''); setMsg(null)
    const med = await resolveCode(code)
    if (!med) { setUnknown(code); setLinkId(''); setLinkErr(null); return }
    const aerr = await ensureAssigned(med.id); if (aerr) { setMsg(aerr); return }
    bump(med.id, med.name); setMsg(`+1 ${med.name}`)
  }
  const confirmLink = async () => {
    if (!unknown || !linkId) return
    const res = await linkCode(unknown, linkId); if (res.error) { setLinkErr(res.error); return }
    const aerr = await ensureAssigned(linkId); if (aerr) { setLinkErr(aerr); return }
    const m = all.find((x) => x.id === linkId); if (m) bump(m.id, m.name)
    setUnknown(null); setLinkId(''); setMsg('Código guardado y +1')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); void handleScan() } }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <FormField label="Escáner (código de barras)">
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={onKey} autoFocus className="spira-mono" placeholder="Escaneá o tipeá el código y Enter" style={{ ...fieldInput, flex: 1 }} />
          <button type="button" onClick={() => void handleScan()} style={btnOutline}>Buscar</button>
        </div>
      </FormField>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }} aria-live="polite">{msg}</div>}

      {unknown && (
        <div style={linkPanel}>
          <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>Código <span className="spira-mono" style={{ color: 'var(--spira-ink)', fontWeight: 600 }}>{unknown}</span> sin asociar. ¿A qué medicamento corresponde?</span>
          <select value={linkId} onChange={(e) => setLinkId(e.target.value)} style={{ ...fieldInput, height: 38 }}>
            <option value="" disabled>Elegí el medicamento</option>
            {all.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {linkErr && <div style={errorBox} aria-live="assertive">{linkErr}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void confirmLink()} disabled={!linkId} style={{ ...btnPrimary(accentSolid), height: 38, opacity: linkId ? 1 : 0.6 }}>Asociar y agregar</button>
            <button type="button" onClick={() => setUnknown(null)} style={{ ...btnOutline, height: 38 }}>No asociar</button>
          </div>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--spira-line)', paddingTop: 12 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)' }}>Agregar a mano</span>
        <div style={{ marginTop: 6 }}>
          <MedicationPicker accent={accentSolid} onPick={async (id) => { const m = all.find((x) => x.id === id); if (!m) return; const e = await ensureAssigned(id); if (e) { setMsg(e); return } bump(id, m.name) }} />
        </div>
      </div>

      {meds.length === 0 ? (
        <EmptyState accent={accentSolid} icon="package" title="Escaneá el primer medicamento" description="Cada beep suma uno. Ajustá la cantidad con − / + si hace falta." minHeight={200} />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {meds.map((m) => (
            <li key={m.medicationId} style={rowCard}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{m.name}</span>
              <button type="button" aria-label="Restar uno" onClick={() => bump(m.medicationId, m.name, -1)} style={qtyBtn}>−</button>
              <span className="spira-mono" style={{ minWidth: 28, textAlign: 'center', fontWeight: 700 }}>{m.quantity}</span>
              <button type="button" aria-label="Sumar uno" onClick={() => bump(m.medicationId, m.name, +1)} style={qtyBtn}>+</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
const linkPanel = { border: '1px solid rgba(176,130,63,0.38)', background: 'rgba(176,130,63,0.10)', borderRadius: 10, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 10 } as const
const errorBox = { fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166,72,59,0.10)', borderRadius: 8, padding: '8px 12px' } as const
const rowCard = { display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--spira-line)', borderRadius: 12, background: 'var(--spira-white)', padding: '10px 14px' } as const
const qtyBtn = { width: 44, height: 44, borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', cursor: 'pointer', fontSize: 18, fontWeight: 700, lineHeight: 1 } as const
```

- [ ] **Step 2: Montar en el wizard.** En `ReceptionWizard.tsx`, importar `Step1Scan` y reemplazar el comentario `{/* step === 1 */}` por `{step === 1 && <Step1Scan tipo={tipo} protocolId={protocolId} accentSolid={accentSolid} meds={meds} setMeds={setMeds} />}`.
- [ ] **Step 3: typecheck** → `npm run typecheck`.
- [ ] **Step 4: Commit**

```bash
git add src/views/pharma/wizard/Step1Scan.tsx src/views/pharma/ReceptionWizard.tsx
git commit -m "feat(pharma): wizard Paso 1 — escaneo con conteo + linkCode + agregar a mano"
```

---

## Task 7: Paso 2 — Lotes y vencimientos

**Files:**
- Create: `src/views/pharma/wizard/Step2Lots.tsx`
- Modify: `src/views/pharma/ReceptionWizard.tsx` (montar Step2 + sembrar lote default al entrar)

**Interfaces:**
- Consumes: `CountedMed`, `LotDraft`. Produces: `<Step2Lots meds setMeds accentSolid />`.

- [ ] **Step 1: Sembrar el lote default al entrar al Paso 2.** En `ReceptionWizard.next()`, al pasar de step 1 a 2, para cada med sin lotes crear uno con la cantidad total:

```ts
const seedLots = (list: CountedMed[]): CountedMed[] =>
  list.map((m) => (m.lots.length ? m : { ...m, lots: [{ key: 1, lotNumber: '', expiryDate: '', quantity: String(m.quantity) }] }))
// en next(): if (step === 1) setMeds(seedLots)
```

- [ ] **Step 2: Implementar Step2Lots.** Por medicamento: filas de lote (lote `spira-mono`, vencimiento `type=date`, cantidad), acción "Dividir en varios lotes" (agrega `LotDraft`), quitar lote (si >1). **Resto en vivo** = `quantity - Σ lots.quantity`: si ≠ 0, línea de validación "Faltan/Sobran N" (`aria-live`) y el wizard bloquea Siguiente (ya está en `canAdvance`). Vencimiento pasado/próximo → aviso ámbar (no bloquea). Lote duplicado dentro del mismo medicamento → rojo.

```tsx
import type { CountedMed, LotDraft } from '../ReceptionWizard'
import { fieldInput } from '../../../components/FormField'
import { btnOutline } from '../../../components/buttons'
import { Icon } from '../../../components/Icon'

interface Props { meds: CountedMed[]; setMeds: React.Dispatch<React.SetStateAction<CountedMed[]>>; accentSolid: string }
const today = () => new Date().toISOString().slice(0, 10)

export function Step2Lots({ meds, setMeds, accentSolid }: Props) {
  const patch = (mi: string, key: number, p: Partial<LotDraft>) =>
    setMeds((prev) => prev.map((m) => m.medicationId !== mi ? m : { ...m, lots: m.lots.map((l) => l.key === key ? { ...l, ...p } : l) }))
  const addLot = (mi: string) =>
    setMeds((prev) => prev.map((m) => m.medicationId !== mi ? m : { ...m, lots: [...m.lots, { key: Math.max(0, ...m.lots.map((l) => l.key)) + 1, lotNumber: '', expiryDate: '', quantity: '0' }] }))
  const delLot = (mi: string, key: number) =>
    setMeds((prev) => prev.map((m) => m.medicationId !== mi || m.lots.length <= 1 ? m : { ...m, lots: m.lots.filter((l) => l.key !== key) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {meds.map((m) => {
        const sum = m.lots.reduce((s, l) => s + (Number(l.quantity) || 0), 0)
        const rest = m.quantity - sum
        const lotNums = m.lots.map((l) => l.lotNumber.trim()).filter(Boolean)
        const dup = new Set(lotNums).size !== lotNums.length
        return (
          <div key={m.medicationId} style={{ border: '1px solid var(--spira-line)', borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, flex: 1 }}>{m.name}</span>
              <span style={{ fontSize: 12.5, color: rest === 0 ? 'var(--spira-good)' : 'var(--spira-warn)' }} aria-live="polite">
                {rest === 0 ? 'Cantidad cubierta' : rest > 0 ? `Faltan ${rest}` : `Sobran ${-rest}`}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {m.lots.map((l) => {
                const past = l.expiryDate && l.expiryDate < today()
                return (
                  <div key={l.key} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 0.7fr auto', gap: 8, alignItems: 'center' }}>
                    <input value={l.lotNumber} onChange={(e) => patch(m.medicationId, l.key, { lotNumber: e.target.value })} placeholder="Lote" className="spira-mono" style={{ ...fieldInput, height: 38 }} />
                    <input type="date" value={l.expiryDate} onChange={(e) => patch(m.medicationId, l.key, { expiryDate: e.target.value })} style={{ ...fieldInput, height: 38, borderColor: past ? 'var(--spira-warn)' : undefined }} />
                    <input type="number" min={0} value={l.quantity} onChange={(e) => patch(m.medicationId, l.key, { quantity: e.target.value })} style={{ ...fieldInput, height: 38 }} />
                    <button type="button" aria-label="Quitar lote" onClick={() => delLot(m.medicationId, l.key)} disabled={m.lots.length <= 1} style={{ width: 44, height: 44, borderRadius: 8, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', cursor: m.lots.length <= 1 ? 'default' : 'pointer', opacity: m.lots.length <= 1 ? 0.5 : 1 }}>
                      <Icon name="x" size={16} color="var(--spira-muted)" />
                    </button>
                  </div>
                )
              })}
            </div>
            {dup && <div style={{ fontSize: 12.5, color: 'var(--spira-danger)', marginTop: 6 }} aria-live="assertive">Hay lotes repetidos en este medicamento.</div>}
            {m.lots.some((l) => l.expiryDate && l.expiryDate < today()) && <div style={{ fontSize: 12.5, color: 'var(--spira-warn)', marginTop: 6 }}>Hay un lote con vencimiento pasado — revisalo (no bloquea).</div>}
            <button type="button" onClick={() => addLot(m.medicationId)} style={{ ...btnOutline, height: 34, marginTop: 8 }}>
              <Icon name="plus" size={15} color="var(--spira-muted)" /> Dividir en varios lotes
            </button>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Endurecer `canAdvance` del Paso 2** para incluir "sin lotes duplicados" (además del resto = 0 y lote no vacío que ya está): en el wizard, el chequeo del step 2 ya cubre suma y lote no vacío; agregar que no haya duplicados por medicamento.
- [ ] **Step 4: Montar Step2** (`{step === 2 && <Step2Lots .../>}`).
- [ ] **Step 5: typecheck** → `npm run typecheck`.
- [ ] **Step 6: Commit**

```bash
git add src/views/pharma/wizard/Step2Lots.tsx src/views/pharma/ReceptionWizard.tsx
git commit -m "feat(pharma): wizard Paso 2 — lotes/vencimientos con multi-lote y resto en vivo"
```

---

## Task 8: Paso 3 — Resumen + confirmar

**Files:**
- Create: `src/views/pharma/wizard/Step3Summary.tsx`
- Modify: `src/views/pharma/ReceptionWizard.tsx` (montar Step3 + pasar `onCreated`)

**Interfaces:**
- Consumes: `createReception`, `CountedMed`, `ReceptionKind`. Produces: `<Step3Summary tipo protocolId meds receptionDate notes setReceptionDate setNotes accentSolid onCreated />`.

- [ ] **Step 1: Implementar Step3Summary.** Fecha (`type=date`) + notas + repaso (lista de medicamentos con sus lotes) + botón "Crear recepción" (busy "Creando…"). Arma items planos y llama `createReception`; error → `errorBox` (`pharmaErrorMessage` ya traduce); éxito → `onCreated(id)`.

```tsx
import { useState } from 'react'
import { FormField, fieldInput } from '../../../components/FormField'
import { btnPrimary } from '../../../components/buttons'
import { createReception } from '../../../data/pharma'
import type { ReceptionKind } from '../../../data/pharma'
import type { CountedMed } from '../ReceptionWizard'

interface Props {
  tipo: ReceptionKind; protocolId: string; meds: CountedMed[]; receptionDate: string; notes: string
  setReceptionDate: (v: string) => void; setNotes: (v: string) => void; accentSolid: string; onCreated: (id: string) => void
}

export function Step3Summary({ tipo, protocolId, meds, receptionDate, notes, setReceptionDate, setNotes, accentSolid, onCreated }: Props) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    setBusy(true); setError(null)
    const items = meds.flatMap((m) => m.lots.map((l) => ({ medication_id: m.medicationId, lot_number: l.lotNumber.trim(), expiry_date: l.expiryDate || null, quantity: Number(l.quantity) })))
    const res = await createReception({ tipo, protocol_id: tipo === 'ambulatoria' ? null : protocolId, reception_date: receptionDate, notes: notes.trim() || null, items })
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onCreated(res.id!)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 620 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="Fecha de recepción"><input type="date" value={receptionDate} onChange={(e) => setReceptionDate(e.target.value)} required style={fieldInput} /></FormField>
        <div style={{ flex: 1 }}><FormField label="Notas (opcional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Remito, observaciones…" style={fieldInput} /></FormField></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {meds.map((m) => (
          <div key={m.medicationId} style={{ border: '1px solid var(--spira-line)', borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ fontWeight: 600 }}>{m.name} · {m.quantity}</div>
            {m.lots.map((l) => <div key={l.key} style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>lote {l.lotNumber || '—'}{l.expiryDate && ` · vence ${l.expiryDate}`} · {l.quantity}</div>)}
          </div>
        ))}
      </div>
      {error && <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166,72,59,0.10)', borderRadius: 8, padding: '8px 12px' }} aria-live="assertive">{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => void submit()} disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1 }}>{busy ? 'Creando…' : 'Crear recepción'}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Montar Step3** en el wizard: `{step === 3 && <Step3Summary tipo={tipo} protocolId={protocolId} meds={meds} receptionDate={receptionDate} notes={notes} setReceptionDate={setReceptionDate} setNotes={setNotes} accentSolid={accentSolid} onCreated={onCreated} />}`. (El botón "Crear" vive en el Paso 3, no en la barra; en `step === 3` no se renderiza "Siguiente".)
- [ ] **Step 3: typecheck** → `npm run typecheck`.
- [ ] **Step 4: Commit**

```bash
git add src/views/pharma/wizard/Step3Summary.tsx src/views/pharma/ReceptionWizard.tsx
git commit -m "feat(pharma): wizard Paso 3 — resumen y creación de la recepción"
```

---

## Task 9: Rewiring de `RecepcionView` (ámbito + wizard a pantalla completa)

**Files:**
- Modify: `src/views/pharma/RecepcionView.tsx`

**Interfaces:**
- Consumes: `ReceptionWizard`, `useReceptions(tipo, protocolId)`, `ReceptionKind`.

- [ ] **Step 1: Estado de ámbito + cola.** Reemplazar el estado de `protocolId`-único por `tipo: ReceptionKind` (default `'protocolo'`) + `protocolId`. El selector de arriba: un `SegmentedControl` chico (Protocolo / Ambulatoria) + el desplegable de protocolo solo cuando `tipo==='protocolo'`. La cola usa `useReceptions(tipo, tipo==='ambulatoria' ? null : protocolId)`. Para ambulatoria no hace falta elegir protocolo para ver la cola.

- [ ] **Step 2: Wizard a pantalla completa.** Reemplazar `{creating && <NewReceptionModal .../>}` por: si `creating`, `return <ReceptionWizard accentSolid={accentSolid} initialTipo={tipo} initialProtocolId={protocolId} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setHighlightId(id); receptions.refetch() }} />` (la cola se oculta). Quitar el import de `NewReceptionModal`.

- [ ] **Step 3: Badge de tipo + resaltado.** En `ReceptionCard`, agregar un badge con `r.tipo` (Protocolo/Ambulatoria). Pasar `highlight={r.id === highlightId}` y resaltar con `boxShadow: 'var(--spira-shadow-sm)'` + borde acento por ~unos segundos (o hasta el próximo refetch). `highlightId` es estado local nuevo.

- [ ] **Step 4: typecheck** → `npm run typecheck` (debería quedar verde salvo el import de `NewReceptionModal` que se elimina en Task 10; si lo quitaste acá, ya verde).

- [ ] **Step 5: Verificación en navegador** (Director, pharma-leader, datos `TEST-*`): Protocolo → Paso 0 (tipo+protocolo) → escanear/contar (auto-asigna) → multi-lote que cierra → crear → verificar → sube el stock del protocolo. Ambulatoria → sin protocolo → recibir cualquier medicamento → crear → verificar → stock ambulatorio queda. Borrar los `TEST-*` después.

- [ ] **Step 6: Commit**

```bash
git add src/views/pharma/RecepcionView.tsx
git commit -m "feat(pharma): RecepcionView ámbito-aware + wizard a pantalla completa"
```

---

## Task 10: Borrar `NewReceptionModal` + cierre

**Files:**
- Delete: `src/views/pharma/NewReceptionModal.tsx`

- [ ] **Step 1: Borrar el archivo** y confirmar que nadie lo importa (`grep -r NewReceptionModal src/`).
- [ ] **Step 2: typecheck final** → `npm run typecheck` verde.
- [ ] **Step 3: Verificación final en navegador** (Director): el flujo completo de ambas ramas anda; la cola muestra ambos ámbitos; los badges y el resaltado funcionan. Limpieza de `TEST-*`.
- [ ] **Step 4: Commit**

```bash
git rm src/views/pharma/NewReceptionModal.tsx
git commit -m "chore(pharma): eliminar NewReceptionModal (reemplazada por el wizard)"
```

---

## Fuera de alcance (deferido, con razón)

- **Producto Investigación (IP):** selector deshabilitado; su flujo/schema es su propio ciclo (modelo IP, 5 preguntas abiertas para Pablo).
- **Vista de stock de ambulatoria:** la vista `v_medication_stock` ya expone `tipo` y las filas de ambulatoria, pero la UI para verlas (filtro por ámbito en `MedicamentosView`) queda como follow-up. Hoy ambulatoria se recibe y el stock queda registrado, pero no hay pantalla para mirarlo.
- **Dispensación (Tajada 2)** y **DataMatrix del sponsor.**

## Self-Review (hecho)

- **Cobertura del spec:** taxonomía 3 tipos (Task 5 selector) ✓; persistencia del tipo + protocolo opcional (Task 1) ✓; stock segregado/índice parcial (Task 1) ✓; catálogo compartido sin allow-list para ambulatoria (Task 1 RPC/trigger) ✓; wizard 4 pasos con todos los estados/decisiones de la review (Tasks 5-8) ✓; cola ámbito-aware + badge + resaltado (Task 9) ✓; borrado de la modal (Task 10) ✓; responsive/a11y plegados en cada componente (44px, aria-label, aria-live, autofocus) ✓.
- **Placeholders:** sin "TODO"; cada paso trae código real.
- **Consistencia de tipos:** `CountedMed`/`LotDraft` definidos en `ReceptionWizard` y consumidos por los Steps; `ReceptionKind` desde `data/pharma`; `createReception` firma `{ tipo, protocol_id, ... }` consistente con la RPC `(p_tipo, p_protocol_id, ...)`.
- **Gate:** `npm run typecheck` por tarea (no hay tests); migración a mano; verificación en navegador por el Director.
