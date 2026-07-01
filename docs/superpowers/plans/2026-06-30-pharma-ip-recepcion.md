# Producto de Investigación (IP) — Recepción y Stock · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sumar a Pharma el Producto de Investigación (IP): recibir medicación del sponsor **unidad por unidad** (kits, con N° de kit + lote + vto del DataMatrix), y ver su stock como lista de unidades — sin tocar el modelo por-cantidad de la medicación de base.

**Architecture:** Entidad nueva `ip_units` (una fila = un kit) colgada del protocolo, con ganchos nullable para la dispensación futura (Tajada 2). La recepción es la **tercera rama** del wizard existente (`tipo='investigacion'`): escaneo por unidad con parser GS1, droga opcional por fila. El alta va por RPC `create_ip_reception` (atómico, `leader+`); el trigger de verificación existente se extiende con una rama IP que promueve las unidades a `en_stock`. El stock es una vista `v_ip_units` mostrada como cards.

**Tech Stack:** React 19 + TS strict + Vite + Supabase (Postgres, RLS, `SECURITY DEFINER`, `audit_log`). Sin react-router/react-query. CSS con variables (tokens "Sereno"), íconos Lucide.

## Global Constraints

- **Gate de verificación (manda sobre el TDD de la skill):** el repo **no tiene suite de tests** (ver `CLAUDE.md`). La verificación por tarea es **`npm run typecheck` en verde** + **verificación en navegador por el Director** donde el cambio sea observable (el preview es una sesión aparte detrás del login; el agente no la puede manejar). No hay pasos `pytest`.
- **Migraciones = a mano, inmutables, numeradas.** La 0037 se **escribe** en esta tajada pero la **aplica el Director** en el dashboard de Supabase (no hay SQL programático a prod). La última aplicada es la 0036. La 0037 debe ser **idempotente**.
- **⚠️ Blocker de dominio:** el AI del DataMatrix que trae el N° de kit **no está confirmado**. El parser usa `serial (21)` por default y guarda `raw_code` + el mapa completo de AIs para re-mapear. **No aplicar la 0037 en prod ni cerrar la tajada hasta validar con un escaneo real del sponsor** (Task 12).
- **Idioma:** comentarios, dominio y copy en castellano rioplatense; igualar la densidad de comentarios del código existente.
- **Errores serenos:** traducir códigos Postgres a texto calmo; reusar `pharmaErrorMessage`. El kit duplicado llega como `check_violation` con texto propio (no `23505`).
- **Privacidad:** las vistas que muestren pacientes usan `PrivacyAvatar` (no aplica a esta tajada; la dispensación por paciente es Tajada 2).

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `supabase/migrations/0037_pharma_ip_units.sql` | enum, tabla `ip_units`, triggers, RLS, RPC `create_ip_reception`, extensión de `apply_reception_stock`, vista `v_ip_units` | Crear |
| `src/lib/gs1.ts` | Parser puro de DataMatrix GS1 (`parseGs1`) | Crear |
| `src/data/pharma/ipUnits.ts` | Tipos + `useIpUnits()` + `createIpReception()` | Crear |
| `src/data/pharma/index.ts` | Barrel: re-export `ipUnits` | Modificar |
| `src/views/pharma/DrugPicker.tsx` | Typeahead sobre `drugs` (devuelve `drug_id`) | Crear |
| `src/views/pharma/wizard/Step0Setup.tsx` | Habilitar el ámbito "Producto Investigación" | Modificar |
| `src/views/pharma/RecepcionView.tsx` | Sumar el ámbito IP al SegmentedControl de la cola | Modificar |
| `src/views/pharma/ReceptionWizard.tsx` | Estado `ipUnits` + ramificar `STEPS`/`canAdvance`/`seedLots` y render por `tipo` | Modificar |
| `src/views/pharma/wizard/Step1ScanIp.tsx` | Escaneo por unidad (GS1 + droga por fila + fallback) | Crear |
| `src/views/pharma/wizard/Step2ReviewIp.tsx` | Revisión + corrección de lote/vto + droga masiva | Crear |
| `src/views/pharma/wizard/Step3SummaryIp.tsx` | Resumen agregado + `createIpReception` | Crear |
| `src/views/pharma/MedicamentosView.tsx` | Ámbito "Investigación" → lista de `v_ip_units` (cards) | Modificar |

---

## Task 1: Migración 0037 — schema, RLS, RPC, trigger, vista

**Files:**
- Create: `supabase/migrations/0037_pharma_ip_units.sql`

**Interfaces:**
- Produces: tabla `ip_units`; enum `ip_unit_status`; RPC `create_ip_reception(uuid, date, text, jsonb) → uuid`; vista `v_ip_units`; extensión del trigger `apply_reception_stock` (rama `tipo='investigacion'`).

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Spira · Migración 0037 — Pharma: Producto de Investigación (IP), rastreo por unidad.
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0036. IDEMPOTENTE.
-- Entidad nueva ip_units (una fila = un kit). NO toca la base (medications/medication_lots).
-- ⚠️ El AI del N° de kit no está confirmado: validar con un escaneo real antes de confiar el unique.
-- ============================================================================

-- 1 · Enum del estado de la unidad (extensible; Tajada 2 usa 'dispensada').
do $$ begin
  if not exists (select 1 from pg_type where typname = 'ip_unit_status') then
    create type public.ip_unit_status as enum ('pendiente','en_stock','dispensada','devuelta','baja');
  end if;
end $$;

-- 2 · Tabla ip_units. Identidad = protocolo + N° de kit. Ganchos de dispensación nullable (Tajada 2).
create table if not exists public.ip_units (
  id           uuid primary key default uuid_generate_v4(),
  protocol_id  uuid not null references public.protocols(id) on delete restrict,
  reception_id uuid not null references public.medication_receptions(id) on delete restrict,
  kit_number   text not null check (btrim(kit_number) <> ''),
  raw_code     text,
  gtin         text,
  lot_number   text,
  expiry_date  date,
  drug_id      uuid references public.drugs(id) on delete restrict,
  status       public.ip_unit_status not null default 'pendiente',
  dispensed_to_enrollment_id uuid references public.enrollments(id) on delete restrict,
  dispensed_visit_id         uuid references public.patient_visits(id) on delete restrict,
  dispensed_at               timestamptz,
  created_by   uuid not null references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (protocol_id, kit_number)
);
comment on table public.ip_units is 'Unidades de Producto de Investigación (kits). Una fila = una unidad rastreable. Identidad = protocolo + kit_number. 0037.';

create index if not exists ip_units_reception_idx on public.ip_units (reception_id);
create index if not exists ip_units_status_idx    on public.ip_units (status);
create index if not exists ip_units_expiry_idx    on public.ip_units (expiry_date);

-- 3 · Triggers espejo del patrón del repo (0003): updated_at + auditoría.
drop trigger if exists trg_ip_units_updated_at on public.ip_units;
create trigger trg_ip_units_updated_at before update on public.ip_units
  for each row execute function public.set_updated_at();
drop trigger if exists trg_audit_ip_units on public.ip_units;
create trigger trg_audit_ip_units after insert or update or delete on public.ip_units
  for each row execute function public.audit_row();

-- 4 · RLS: Pharma es central. Lectura pharma/gerencia; escritura operator+; borrado gerencia.
alter table public.ip_units enable row level security;
drop policy if exists "pharma/gerencia ven IP" on public.ip_units;
create policy "pharma/gerencia ven IP" on public.ip_units for select
  using (public.has_module('pharma') or public.has_module('gerencia'));
drop policy if exists "pharma inserta IP" on public.ip_units;
create policy "pharma inserta IP" on public.ip_units for insert
  with check (public.has_module('pharma'));
drop policy if exists "pharma edita IP" on public.ip_units;
create policy "pharma edita IP" on public.ip_units for update
  using (public.has_module('pharma')) with check (public.has_module('pharma'));
drop policy if exists "gerencia borra IP" on public.ip_units;
create policy "gerencia borra IP" on public.ip_units for delete
  using (public.has_module('gerencia'));
grant select, insert, update, delete on public.ip_units to authenticated;

-- 5 · Extensión del trigger apply_reception_stock: rama IP con RETURN temprano (no entra al loop de
-- reception_items ni toca stock_movements). La rama de base (0035) queda idéntica.
create or replace function public.apply_reception_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_lot_id uuid;
begin
  if new.status = 'verificada' and old.status is distinct from 'verificada' then
    -- Rama IP: promover las unidades pendientes de esta recepción a stock. Idempotente.
    if new.tipo = 'investigacion' then
      update public.ip_units set status = 'en_stock', updated_at = now()
       where reception_id = new.id and status = 'pendiente';
      return new;
    end if;
    -- Rama base (0035): cantidad por lote.
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

-- 6 · RPC create_ip_reception: atómico, leader+. Pre-valida kits duplicados en el protocolo.
create or replace function public.create_ip_reception(
  p_protocol_id uuid, p_reception_date date, p_notes text, p_units jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_unit jsonb; v_dupes text;
begin
  if not public.has_min_role('pharma','leader') then
    raise exception 'Sin permiso para crear recepciones de investigación' using errcode = '42501';
  end if;
  if p_protocol_id is null then
    raise exception 'El Producto de Investigación requiere un protocolo' using errcode = 'check_violation';
  end if;
  -- Pre-validar: listar los N° de kit que ya existan en el protocolo (accountability), antes de insertar.
  select string_agg(u.kit_number, ', ') into v_dupes
    from public.ip_units u
   where u.protocol_id = p_protocol_id
     and u.kit_number in (select btrim(e->>'kit_number') from jsonb_array_elements(p_units) e);
  if v_dupes is not null then
    raise exception 'Estos N° de kit ya están registrados en el protocolo: %', v_dupes using errcode = 'check_violation';
  end if;
  insert into public.medication_receptions (tipo, protocol_id, received_by, reception_date, status, notes)
  values ('investigacion', p_protocol_id, auth.uid(), p_reception_date, 'pendiente', p_notes)
  returning id into v_id;
  for v_unit in select * from jsonb_array_elements(p_units) loop
    insert into public.ip_units
      (protocol_id, reception_id, kit_number, raw_code, gtin, lot_number, expiry_date, drug_id, status, created_by)
    values (
      p_protocol_id, v_id,
      btrim(v_unit->>'kit_number'),
      nullif(v_unit->>'raw_code',''),
      nullif(v_unit->>'gtin',''),
      nullif(v_unit->>'lot_number',''),
      nullif(v_unit->>'expiry_date','')::date,
      nullif(v_unit->>'drug_id','')::uuid,
      'pendiente', auth.uid()
    );
  end loop;
  return v_id;
end;
$$;
grant execute on function public.create_ip_reception(uuid, date, text, jsonb) to authenticated;

-- 7 · Vista de stock del IP: fila por unidad. por_vencer excluye las ya vencidas.
create or replace view public.v_ip_units with (security_invoker = true) as
select
  u.id, u.protocol_id, p.code as protocol_code,
  u.kit_number, u.lot_number, u.expiry_date,
  u.drug_id, d.name as drug_name,
  u.status,
  (u.expiry_date is not null and u.expiry_date <  current_date)                             as vencida,
  (u.expiry_date is not null and u.expiry_date >= current_date
                             and u.expiry_date <  current_date + 30)                         as por_vencer
from public.ip_units u
join public.protocols p on p.id = u.protocol_id
left join public.drugs d on d.id = u.drug_id;
comment on view public.v_ip_units is 'Stock de IP: una fila por unidad (kit). drug_name NULL = cegado. 0037.';
```

- [ ] **Step 2: Verificar el SQL de forma estática (sin aplicar a prod)**

Releer el archivo contra la 0035 (que la rama base quedó idéntica) y contra el patrón de la 0033 (triggers de auditoría). Confirmar: enum guardado, `create table if not exists`, `drop policy if exists` antes de cada `create policy`, `create or replace` en función/vista. **No** aplicar a prod acá.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0037_pharma_ip_units.sql
git commit -m "feat(pharma): migración 0037 — Producto de Investigación (ip_units, RPC, vista, trigger)"
```

- [ ] **Step 4: Marcar para el Director** que la 0037 queda **pendiente de aplicar a mano** (bloqueada por el escaneo real del sponsor, Task 12) — anotarlo en el handoff.

---

## Task 2: Parser GS1 (`src/lib/gs1.ts`)

**Files:**
- Create: `src/lib/gs1.ts`

**Interfaces:**
- Produces: `parseGs1(raw: string): Gs1Parsed` con `interface Gs1Parsed { ais: Record<string,string>; gtin?: string; kitNumber?: string; lotNumber?: string; expiryDate?: string /* YYYY-MM-DD */; isGs1: boolean }`.

- [ ] **Step 1: Implementar el parser**

```ts
/**
 * Parser puro de DataMatrix GS1 (Tajada 1b). Descompone la cadena que emite el lector 2D en sus
 * Application Identifiers (AIs). Sin dependencias, sin estado.
 *
 * Ojo (documentado en la spec): los AIs de longitud FIJA (01 GTIN=14, 17 vto=6) vienen pegados al
 * siguiente AI; solo los de longitud VARIABLE (10 lote, 21 serial) terminan en el separador FNC1
 * (GS, \x1d) o en fin de string. El lector 2D DEBE estar configurado para emitir FNC1.
 *
 * ⚠️ El AI del N° de kit no está confirmado con el sponsor: por ahora kitNumber = serial (21).
 * Se devuelve el mapa COMPLETO de AIs para poder re-mapear sin re-escanear.
 */
export interface Gs1Parsed {
  ais: Record<string, string>
  gtin?: string
  kitNumber?: string
  lotNumber?: string
  expiryDate?: string // YYYY-MM-DD
  isGs1: boolean
}

const GS = '\x1d' // FNC1 / Group Separator
// Longitud fija (en dígitos) de los AIs de interés. Los que no están acá son de longitud variable.
const FIXED_LEN: Record<string, number> = { '01': 14, '17': 6, '11': 6, '15': 6, '13': 6 }

/** YYMMDD → YYYY-MM-DD. DD=00 = fin de mes. Año con ventana de pivote ±50 respecto del actual. */
function gs1Date(yymmdd: string): string | undefined {
  if (!/^\d{6}$/.test(yymmdd)) return undefined
  const yy = Number(yymmdd.slice(0, 2))
  const mm = Number(yymmdd.slice(2, 4))
  let dd = Number(yymmdd.slice(4, 6))
  const nowYY = new Date().getFullYear() % 100
  // Pivote: si yy está más de 50 años adelante del actual, es del siglo pasado.
  const century = yy - nowYY > 50 ? 1900 : 2000
  const year = century + yy
  if (mm < 1 || mm > 12) return undefined
  if (dd === 0) dd = new Date(year, mm, 0).getDate() // último día del mes
  const p = (n: number) => String(n).padStart(2, '0')
  return `${year}-${p(mm)}-${p(dd)}`
}

export function parseGs1(raw: string): Gs1Parsed {
  const s = (raw ?? '').trim()
  const ais: Record<string, string> = {}
  let i = 0
  let matched = false
  while (i < s.length) {
    if (s[i] === GS) { i++; continue }
    const ai2 = s.slice(i, i + 2)
    const len = FIXED_LEN[ai2]
    if (len !== undefined) {
      const value = s.slice(i + 2, i + 2 + len)
      if (value.length < len) break // truncado; cortamos sin romper
      ais[ai2] = value
      i += 2 + len
      matched = true
    } else if (ai2 === '10' || ai2 === '21') {
      // Longitud variable: hasta el próximo FNC1 o fin de string.
      let end = s.indexOf(GS, i + 2)
      if (end === -1) end = s.length
      ais[ai2] = s.slice(i + 2, end)
      i = end
      matched = true
    } else {
      // AI desconocido o cadena que no es GS1 (ej. EAN-13 pelado): no seguimos parseando.
      break
    }
  }
  const gtin = ais['01']
  const lotNumber = ais['10'] || undefined
  const expiryDate = ais['17'] ? gs1Date(ais['17']) : undefined
  const kitNumber = ais['21'] || undefined // ⚠️ supuesto: el N° de kit viene en el serial (21)
  return { ais, gtin, kitNumber, lotNumber, expiryDate, isGs1: matched && Object.keys(ais).length > 0 }
}
```

- [ ] **Step 2: Verificación estática rápida (sin adoptar framework de tests)**

Correr una comprobación de una sola vez con node (no queda en el repo):
```bash
node -e "const {parseGs1}=require('./src/lib/gs1.ts');" 2>/dev/null || \
npx tsx -e "import {parseGs1} from './src/lib/gs1'; \
 const r=parseGs1('010759912345678817251231'+String.fromCharCode(29)+'10LOT42'+String.fromCharCode(29)+'21KIT-007'); \
 console.log(JSON.stringify(r)); \
 console.assert(r.gtin==='07599123456788'&&r.lotNumber==='LOT42'&&r.kitNumber==='KIT-007'&&r.expiryDate==='2025-12-31','FALLA'); \
 const e=parseGs1('7791234567890'); console.assert(!e.isGs1,'EAN-13 no debería ser GS1');"
```
Esperado: imprime el objeto parseado y **ninguna** aserción falla. (Si `tsx` no está, alcanza con leer y razonar el caso; el gate duro es el typecheck del Step 3.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: verde (sin errores).

- [ ] **Step 4: Commit**

```bash
git add src/lib/gs1.ts
git commit -m "feat(pharma): parser puro GS1/DataMatrix (kit + lote + vto)"
```

---

## Task 3: Capa de datos `ipUnits.ts`

**Files:**
- Create: `src/data/pharma/ipUnits.ts`
- Modify: `src/data/pharma/index.ts`

**Interfaces:**
- Consumes: `useSupabaseQuery` (`src/lib/useSupabaseQuery`), `supabase` (`src/lib/supabase`), `pharmaErrorMessage` (`./errors`).
- Produces: `interface IpUnitRow`; `interface IpUnitInput`; `useIpUnits(protocolId: string | null)`; `createIpReception(input): Promise<{ error: string | null; code?: string; id?: string }>`.

- [ ] **Step 1: Escribir `ipUnits.ts`**

```ts
import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

/** Fila de la vista v_ip_units (stock de IP por unidad). Migración 0037. */
export interface IpUnitRow {
  id: string
  protocol_id: string
  protocol_code: string
  kit_number: string
  lot_number: string | null
  expiry_date: string | null
  drug_id: string | null
  drug_name: string | null   // null = cegado
  status: 'pendiente' | 'en_stock' | 'dispensada' | 'devuelta' | 'baja'
  vencida: boolean
  por_vencer: boolean
}

/** Unidad a recibir (una por kit escaneado). drug_id '' o null = cegado. */
export interface IpUnitInput {
  kit_number: string
  raw_code?: string | null
  gtin?: string | null
  lot_number?: string | null
  expiry_date?: string | null // YYYY-MM-DD
  drug_id?: string | null
}

export interface CreateIpReceptionInput {
  protocolId: string
  receptionDate: string
  notes: string | null
  units: IpUnitInput[]
}

/** Stock de IP en un protocolo (unidades en_stock). Lee v_ip_units. */
export function useIpUnits(protocolId: string | null) {
  return useSupabaseQuery<IpUnitRow[]>(async () => {
    if (!protocolId) return { data: [], error: null }
    return await supabase
      .from('v_ip_units')
      .select('*')
      .eq('protocol_id', protocolId)
      .eq('status', 'en_stock')
      .order('expiry_date', { ascending: true, nullsFirst: false })
  }, [protocolId])
}

/**
 * Crea una recepción de IP (atómica) vía RPC. Las unidades entran 'pendiente'; verificar la
 * recepción (verify_reception) las promueve a 'en_stock' (trigger apply_reception_stock, rama IP).
 * El kit duplicado en el protocolo llega como check_violation con texto propio (lista los kits).
 */
export async function createIpReception(
  input: CreateIpReceptionInput,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('create_ip_reception', {
    p_protocol_id: input.protocolId,
    p_reception_date: input.receptionDate,
    p_notes: input.notes,
    p_units: input.units,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}
```

- [ ] **Step 2: Sumar al barrel `index.ts`**

Modificar `src/data/pharma/index.ts` — agregar la línea (mantener orden alfabético-ish del bloque):
```ts
export * from './ipUnits'
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add src/data/pharma/ipUnits.ts src/data/pharma/index.ts
git commit -m "feat(pharma): capa de datos del IP (useIpUnits + createIpReception)"
```

---

## Task 4: `DrugPicker` (typeahead sobre `drugs`)

**Files:**
- Create: `src/views/pharma/DrugPicker.tsx`

**Interfaces:**
- Consumes: `useDrugs()` (`../../data/pharma`, ya existe; devuelve filas `{ id, name }`).
- Produces: `<DrugPicker accent onPick placeholder? />` con `onPick(drugId: string, drugName: string)`.

**Note:** Clonar el comportamiento visual y de teclado de `src/views/pharma/MedicationPicker.tsx` (Enter elige el primero, Escape/click-afuera cierran, foco sobrio sin borde verde, hover con `accent+'1a'`). La diferencia es la fuente de datos (`useDrugs` en vez de `useMedications`) y que devuelve `drug_id`.

- [ ] **Step 1: Escribir `DrugPicker.tsx`** (siguiendo el patrón de `MedicationPicker`)

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { fieldInput } from '../../components/FormField'
import { useDrugs } from '../../data/pharma'

interface Props {
  accent: string
  onPick: (drugId: string, drugName: string) => void
  placeholder?: string
}

/**
 * Typeahead sobre el catálogo de drogas (principio activo). Espeja MedicationPicker pero sobre
 * `drugs`: usado para etiquetar la droga de un kit de etiqueta abierta. Sin texto libre de destino:
 * solo elige de la lista. Enter elige el primero; Escape / click-afuera cierran.
 */
export function DrugPicker({ accent, onPick, placeholder }: Props) {
  const drugs = useDrugs()
  const all = drugs.data ?? []
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return all.slice(0, 8)
    return all.filter((d) => d.name.toLowerCase().includes(s)).slice(0, 8)
  }, [q, all])

  // Cerrar al clickear afuera (mismo criterio que MedicationPicker).
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const pick = (id: string, name: string) => { onPick(id, name); setQ(''); setOpen(false) }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) { e.preventDefault(); pick(matches[0].id, matches[0].name) }
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={placeholder ?? 'Droga (opcional)'}
        className="spira-search-input"
        style={{ ...fieldInput, height: 38 }}
      />
      {open && matches.length > 0 && (
        <div style={listBox}>
          {matches.map((d) => (
            <button
              key={d.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(d.id, d.name)}
              style={itemBtn}
              onMouseEnter={(e) => (e.currentTarget.style.background = accent + '1a')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const listBox = {
  position: 'absolute', top: 42, left: 0, right: 0, zIndex: 20, background: 'var(--spira-white)',
  border: '1px solid var(--spira-line-2)', borderRadius: 10, boxShadow: 'var(--spira-shadow-sm)',
  overflow: 'hidden', display: 'flex', flexDirection: 'column',
} as const
const itemBtn = {
  textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent',
  cursor: 'pointer', fontSize: 13.5, color: 'var(--spira-ink)',
} as const
```

*(Si `MedicationPicker` expone nombres de clase/estilo distintos, igualarlos exactamente al leer ese archivo.)*

- [ ] **Step 2: Typecheck** — `npm run typecheck` → verde.
- [ ] **Step 3: Commit**

```bash
git add src/views/pharma/DrugPicker.tsx
git commit -m "feat(pharma): DrugPicker (typeahead sobre catálogo de drogas)"
```

---

## Task 5: Habilitar el ámbito "Producto Investigación" (Paso 0 + cola)

**Files:**
- Modify: `src/views/pharma/wizard/Step0Setup.tsx`
- Modify: `src/views/pharma/RecepcionView.tsx`

**Interfaces:**
- Produces: el ámbito `'investigacion'` seleccionable en ambos SegmentedControl; el Paso 0 exige protocolo para IP (igual que protocolo).

- [ ] **Step 1: `Step0Setup.tsx` — habilitar el ámbito y exigir protocolo en IP**

Reemplazar la opción `investigacion` (quitar `disabled`/`badge`) y extender la condición del selector de protocolo:
```tsx
options={[
  { value: 'protocolo' as ReceptionKind, label: 'Farmacia Protocolo' },
  { value: 'investigacion' as ReceptionKind, label: 'Producto Investigación' },
  { value: 'ambulatoria' as ReceptionKind, label: 'Farmacia Ambulatoria' },
]}
```
Y cambiar el gate del selector de protocolo para que aparezca también en IP:
```tsx
{(tipo === 'protocolo' || tipo === 'investigacion') && (
  <FormField label="Protocolo">
    {/* ...select de protocolos idéntico al actual... */}
  </FormField>
)}
```

- [ ] **Step 2: `RecepcionView.tsx` — sumar el ámbito IP a la cola**

En `ambitoControl`, agregar la opción y ajustar el gating/lectura para tratar `investigacion` como "requiere protocolo" (igual que `protocolo`):
```tsx
options={[
  { value: 'protocolo', label: 'Farmacia Protocolo' },
  { value: 'investigacion', label: 'Producto Investigación' },
  { value: 'ambulatoria', label: 'Farmacia Ambulatoria' },
]}
```
Y donde hoy dice `tipo === 'protocolo'` para exigir protocolo y para `useReceptions`, cambiar a `tipo !== 'ambulatoria'`:
```tsx
const receptions = useReceptions(tipo, tipo === 'ambulatoria' ? null : protocolId || null)
// ...gating:
if (tipo !== 'ambulatoria' && !protocolId) { /* EmptyState "Elegí un protocolo" */ }
// ...protocolSelect:
const protocolSelect = tipo !== 'ambulatoria' ? ( /* ...igual... */ ) : null
```
El `tipoLabel` de `ReceptionCard` ya incluye `investigacion: 'Investigación'` (no tocar).

- [ ] **Step 3: Typecheck** — `npm run typecheck` → verde.
- [ ] **Step 4: Verificación en navegador (Director):** en Pharma → Recepción aparece el ámbito "Producto Investigación", pide protocolo, y "Nueva recepción" abre el wizard con `tipo='investigacion'`.
- [ ] **Step 5: Commit**

```bash
git add src/views/pharma/wizard/Step0Setup.tsx src/views/pharma/RecepcionView.tsx
git commit -m "feat(pharma): habilitar el ámbito Producto Investigación en el wizard y la cola"
```

---

## Task 6: Ramificar `ReceptionWizard` por tipo (estado + navegación)

**Files:**
- Modify: `src/views/pharma/ReceptionWizard.tsx`

**Interfaces:**
- Consumes: `Step1ScanIp`, `Step2ReviewIp`, `Step3SummaryIp` (Tasks 7-9) — importarlos.
- Produces: `export interface IpUnitDraft`; estado `ipUnits`; `STEPS`/`canAdvance` ramificados por `tipo`; render de los pasos IP cuando `tipo==='investigacion'`.

- [ ] **Step 1: Definir el draft y el estado IP**

Agregar el tipo (junto a `CountedMed`/`LotDraft`):
```tsx
/** Borrador de una unidad de IP escaneada (Paso 1 del wizard, rama investigación). */
export interface IpUnitDraft {
  key: number
  kitNumber: string
  rawCode: string
  gtin: string
  lotNumber: string
  expiryDate: string
  drugId: string      // '' = cegado
  drugName: string    // etiqueta para mostrar
  manual: boolean     // cargado a mano (fallback GS1)
}
```
Y en el componente:
```tsx
const [ipUnits, setIpUnits] = useState<IpUnitDraft[]>([])
const isIp = tipo === 'investigacion'
```

- [ ] **Step 2: Ramificar `STEPS`, `canAdvance`, `seedLots`, `hasData` y el `guard`**

```tsx
const STEPS = isIp ? ['Setup', 'Escaneo', 'Revisión', 'Resumen'] : ['Setup', 'Escaneo', 'Lotes', 'Resumen']

const hasData = isIp ? ipUnits.length > 0 : meds.length > 0

const canAdvance = (): boolean => {
  if (step === 0) return tipo === 'ambulatoria' || (!!protocolId)   // protocolo E investigación exigen protocolo
  if (isIp) {
    if (step === 1) return ipUnits.length > 0
    if (step === 2) return true                                     // droga opcional; lote/vto editables
    return !!receptionDate
  }
  if (step === 1) return meds.length > 0 && meds.every((m) => m.quantity > 0)
  if (step === 2) return meds.every((m) => { /* ...lógica de base actual, sin cambios... */ return true })
  return !!receptionDate
}
```
*(Repetir la lógica de base del Paso 2 tal cual está hoy; solo se envuelve en la rama `!isIp`.)*
El `goto` con `seedLots` **solo** aplica a base: envolver `if (i >= 2 && !isIp) setMeds(seedLots)`.
El `guard` de cambio de tipo debe limpiar ambos: al cambiar `tipo`, `setMeds([]); setIpUnits([])`.

- [ ] **Step 3: Render de los pasos por tipo**

```tsx
{step === 1 && (isIp
  ? <Step1ScanIp accentSolid={accentSolid} units={ipUnits} setUnits={setIpUnits} />
  : <Step1Scan tipo={tipo} protocolId={protocolId} accentSolid={accentSolid} meds={meds} setMeds={setMeds} />)}
{step === 2 && (isIp
  ? <Step2ReviewIp accentSolid={accentSolid} units={ipUnits} setUnits={setIpUnits} />
  : <Step2Lots meds={meds} setMeds={setMeds} accentSolid={accentSolid} />)}
{step === 3 && (isIp
  ? <Step3SummaryIp protocolId={protocolId} units={ipUnits} receptionDate={receptionDate} notes={notes} setReceptionDate={setReceptionDate} setNotes={setNotes} accentSolid={accentSolid} onCreated={onCreated} />
  : <Step3Summary tipo={tipo} protocolId={protocolId} meds={meds} receptionDate={receptionDate} notes={notes} setReceptionDate={setReceptionDate} setNotes={setNotes} accentSolid={accentSolid} onCreated={onCreated} />)}
```
El modal de descarte debe mirar `hasData` (ya ramificado).

- [ ] **Step 4: Typecheck** — verde (los imports de Step*Ip fallan hasta las Tasks 7-9; hacer esta task **después** o dejar los imports y completar en orden). *Nota de ejecución: implementar Tasks 7-9 antes de correr el typecheck final de esta task, o crear stubs mínimos.*
- [ ] **Step 5: Commit**

```bash
git add src/views/pharma/ReceptionWizard.tsx
git commit -m "feat(pharma): ReceptionWizard ramificado por tipo (rama investigación)"
```

---

## Task 7: `Step1ScanIp` — escaneo por unidad

**Files:**
- Create: `src/views/pharma/wizard/Step1ScanIp.tsx`

**Interfaces:**
- Consumes: `parseGs1` (`../../../lib/gs1`), `DrugPicker` (`../DrugPicker`), `IpUnitDraft` (`../ReceptionWizard`).
- Produces: `<Step1ScanIp accentSolid units setUnits />`.

- [ ] **Step 1: Implementar el paso**

```tsx
import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { fieldInput, FormField } from '../../../components/FormField'
import { EmptyState } from '../../../components/EmptyState'
import { DrugPicker } from '../DrugPicker'
import { parseGs1 } from '../../../lib/gs1'
import type { IpUnitDraft } from '../ReceptionWizard'

interface Props { accentSolid: string; units: IpUnitDraft[]; setUnits: React.Dispatch<React.SetStateAction<IpUnitDraft[]>> }

export function Step1ScanIp({ accentSolid, units, setUnits }: Props) {
  const [scan, setScan] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)
  const nextKey = useRef(1)

  // Agrega una unidad arriba (última escaneada visible). Dedup por kit_number, o por raw_code si no hubo kit.
  const addUnit = (u: Omit<IpUnitDraft, 'key'>) => {
    setUnits((prev) => {
      const dupe = prev.some((p) =>
        (u.kitNumber && p.kitNumber === u.kitNumber) ||
        (!u.kitNumber && u.rawCode && p.rawCode === u.rawCode))
      if (dupe) { setMsg('Esa unidad ya fue escaneada.'); return prev }
      setMsg(`+1 ${u.kitNumber || u.rawCode || 'unidad'}`)
      return [{ ...u, key: nextKey.current++ }, ...prev]
    })
  }

  const handleScan = () => {
    const code = scan.trim(); if (!code) return; setScan(''); setMsg(null)
    const p = parseGs1(code)
    if (!p.isGs1 || !p.kitNumber) {
      // Fallback: no parseó como GS1 o no trajo N° de kit → carga marcada como manual.
      addUnit({ kitNumber: '', rawCode: code, gtin: p.gtin ?? '', lotNumber: p.lotNumber ?? '', expiryDate: p.expiryDate ?? '', drugId: '', drugName: '', manual: true })
      setMsg('No se reconoció el N° de kit — cargá el dato a mano en Revisión.')
    } else {
      addUnit({ kitNumber: p.kitNumber, rawCode: code, gtin: p.gtin ?? '', lotNumber: p.lotNumber ?? '', expiryDate: p.expiryDate ?? '', drugId: '', drugName: '', manual: false })
    }
    scanRef.current?.focus()
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); handleScan() } }

  const setDrug = (key: number, drugId: string, drugName: string) =>
    setUnits((prev) => prev.map((u) => u.key === key ? { ...u, drugId, drugName } : u))
  const remove = (key: number) => setUnits((prev) => prev.filter((u) => u.key !== key))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Escáner + contador: sticky, fuera del scroll de la lista. */}
      <div style={{ position: 'sticky', top: 0, background: 'var(--spira-white)', zIndex: 5, paddingBottom: 8 }}>
        <FormField label="Escáner (DataMatrix del kit)">
          <input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={onKey} autoFocus
            className="spira-mono spira-search-input" placeholder="Escaneá el kit y Enter" style={{ ...fieldInput }} />
        </FormField>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span aria-live="polite" style={{ fontSize: 12.5, color: 'var(--spira-muted)', minHeight: 18 }}>{msg ?? ''}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>{units.length} {units.length === 1 ? 'unidad' : 'unidades'}</span>
        </div>
      </div>

      {units.length === 0 ? (
        <EmptyState accent={accentSolid} icon="box" title="Escaneá el primer kit" description="Cada beep agrega una unidad. El código trae kit, lote y vencimiento." minHeight={200} />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 460, overflowY: 'auto' }}>
          {units.map((u) => (
            <li key={u.key} style={rowCard}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="spira-mono" style={{ fontWeight: 700 }}>{u.kitNumber || <span style={{ color: 'var(--spira-warn)' }}>Sin N° de kit</span>}{u.manual && <span style={manualTag}>manual</span>}</div>
                <div style={{ fontSize: 12, color: 'var(--spira-muted)' }}>{u.lotNumber ? `lote ${u.lotNumber}` : 'sin lote'}{u.expiryDate ? ` · vence ${u.expiryDate}` : ''}</div>
              </div>
              <div style={{ width: 220 }}>
                {u.drugId
                  ? <span style={chip} onClick={() => setDrug(u.key, '', '')} title="Quitar droga">{u.drugName} ✕</span>
                  : <DrugPicker accent={accentSolid} onPick={(id, name) => setDrug(u.key, id, name)} placeholder="Cegado — o elegí droga" />}
              </div>
              <button type="button" aria-label="Quitar unidad" onClick={() => remove(u.key)} style={delBtn}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const rowCard = { display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--spira-line)', borderRadius: 12, background: 'var(--spira-white)', padding: '10px 14px' } as const
const chip = { display: 'inline-block', fontSize: 12.5, padding: '4px 10px', borderRadius: 999, background: 'var(--spira-surface)', color: 'var(--spira-ink)', cursor: 'pointer' } as const
const manualTag = { marginLeft: 8, fontSize: 11, color: 'var(--spira-warn)', border: '1px solid var(--spira-warn)', borderRadius: 6, padding: '1px 6px' } as const
const delBtn = { width: 36, height: 36, borderRadius: 8, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', cursor: 'pointer', color: 'var(--spira-muted)' } as const
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → verde.
- [ ] **Step 3: Verificación en navegador (Director):** escanear (o tipear) varias cadenas GS1 de prueba → cada una suma una fila arriba; re-escanear la misma → avisa y no duplica; una cadena no-GS1 → fila marcada "manual"; elegir droga en una fila la etiqueta, dejar otra "Cegado".
- [ ] **Step 4: Commit**

```bash
git add src/views/pharma/wizard/Step1ScanIp.tsx
git commit -m "feat(pharma): wizard IP Paso 1 — escaneo por unidad (GS1 + droga por fila)"
```

---

## Task 8: `Step2ReviewIp` — revisión + corrección + droga masiva

**Files:**
- Create: `src/views/pharma/wizard/Step2ReviewIp.tsx`

**Interfaces:**
- Consumes: `DrugPicker`, `IpUnitDraft`.
- Produces: `<Step2ReviewIp accentSolid units setUnits />`.

- [ ] **Step 1: Implementar el paso**

```tsx
import { useState } from 'react'
import { fieldInput } from '../../../components/FormField'
import { btnOutline } from '../../../components/buttons'
import { DrugPicker } from '../DrugPicker'
import type { IpUnitDraft } from '../ReceptionWizard'

interface Props { accentSolid: string; units: IpUnitDraft[]; setUnits: React.Dispatch<React.SetStateAction<IpUnitDraft[]>> }

export function Step2ReviewIp({ accentSolid, units, setUnits }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const patch = (key: number, p: Partial<IpUnitDraft>) =>
    setUnits((prev) => prev.map((u) => u.key === key ? { ...u, ...p } : u))
  const toggle = (key: number) =>
    setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  const selectBlind = () => setSelected(new Set(units.filter((u) => !u.drugId).map((u) => u.key)))
  const applyDrug = (drugId: string, drugName: string) =>
    setUnits((prev) => prev.map((u) => selected.has(u.key) ? { ...u, drugId, drugName } : u))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Barra de acción masiva de droga. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={selectBlind} style={btnOutline}>Seleccionar las sin droga</button>
        <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>{selected.size} seleccionadas</span>
        {selected.size > 0 && (
          <div style={{ width: 240 }}>
            <DrugPicker accent={accentSolid} onPick={applyDrug} placeholder="Aplicar droga a las seleccionadas" />
          </div>
        )}
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
        {units.map((u) => (
          <li key={u.key} style={rowCard}>
            <input type="checkbox" checked={selected.has(u.key)} onChange={() => toggle(u.key)} aria-label="Seleccionar unidad" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 1.4fr', gap: 8, flex: 1, alignItems: 'center' }}>
              <input value={u.kitNumber} onChange={(e) => patch(u.key, { kitNumber: e.target.value })} placeholder="N° de kit" className="spira-mono" style={{ ...fieldInput, height: 36 }} />
              <input value={u.lotNumber} onChange={(e) => patch(u.key, { lotNumber: e.target.value })} placeholder="Lote" className="spira-mono" style={{ ...fieldInput, height: 36 }} />
              <input type="date" value={u.expiryDate} onChange={(e) => patch(u.key, { expiryDate: e.target.value })} style={{ ...fieldInput, height: 36 }} />
              {u.drugId
                ? <span style={chip} onClick={() => patch(u.key, { drugId: '', drugName: '' })} title="Quitar droga">{u.drugName} ✕</span>
                : <span style={cegadoChip}>Cegado</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

const rowCard = { display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--spira-line)', borderRadius: 12, background: 'var(--spira-white)', padding: '10px 12px' } as const
const chip = { fontSize: 12.5, padding: '4px 10px', borderRadius: 999, background: 'var(--spira-surface)', color: 'var(--spira-ink)', cursor: 'pointer', textAlign: 'center' } as const
const cegadoChip = { fontSize: 12.5, padding: '4px 10px', borderRadius: 999, background: 'var(--spira-surface)', color: 'var(--spira-muted)', textAlign: 'center' } as const
```

- [ ] **Step 2: Typecheck** — verde.
- [ ] **Step 3: Verificación (Director):** corregir un lote/vto; "seleccionar las sin droga" marca solo las cegadas; aplicar droga masiva las etiqueta; las que quedan sin droga muestran chip "Cegado" (neutro, no error).
- [ ] **Step 4: Commit**

```bash
git add src/views/pharma/wizard/Step2ReviewIp.tsx
git commit -m "feat(pharma): wizard IP Paso 2 — revisión + corrección + droga masiva"
```

---

## Task 9: `Step3SummaryIp` — resumen agregado + creación

**Files:**
- Create: `src/views/pharma/wizard/Step3SummaryIp.tsx`

**Interfaces:**
- Consumes: `createIpReception` (`../../../data/pharma`), `IpUnitDraft`.
- Produces: `<Step3SummaryIp protocolId units receptionDate notes setReceptionDate setNotes accentSolid onCreated />`.

- [ ] **Step 1: Implementar el paso**

```tsx
import { useMemo, useState } from 'react'
import { fieldInput, FormField } from '../../../components/FormField'
import { btnPrimary } from '../../../components/buttons'
import { createIpReception } from '../../../data/pharma'
import type { IpUnitDraft } from '../ReceptionWizard'

interface Props {
  protocolId: string
  units: IpUnitDraft[]
  receptionDate: string
  notes: string
  setReceptionDate: (d: string) => void
  setNotes: (n: string) => void
  accentSolid: string
  onCreated: (id: string) => void
}

export function Step3SummaryIp({ protocolId, units, receptionDate, notes, setReceptionDate, setNotes, accentSolid, onCreated }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const agg = useMemo(() => {
    const conDroga = units.filter((u) => u.drugId).length
    const today = new Date().toISOString().slice(0, 10)
    const porVencer = units.filter((u) => u.expiryDate && u.expiryDate < today).length
    return { total: units.length, conDroga, cegadas: units.length - conDroga, porVencer }
  }, [units])

  const create = async () => {
    if (!protocolId || !receptionDate || units.length === 0) return
    // Guard: toda unidad necesita N° de kit (el fallback manual pudo quedar vacío).
    const sinKit = units.filter((u) => !u.kitNumber.trim()).length
    if (sinKit > 0) { setError(`Hay ${sinKit} unidad(es) sin N° de kit. Completá en Revisión.`); return }
    setBusy(true); setError(null)
    const res = await createIpReception({
      protocolId,
      receptionDate,
      notes: notes.trim() || null,
      units: units.map((u) => ({
        kit_number: u.kitNumber.trim(),
        raw_code: u.rawCode || null,
        gtin: u.gtin || null,
        lot_number: u.lotNumber || null,
        expiry_date: u.expiryDate || null,
        drug_id: u.drugId || null,
      })),
    })
    setBusy(false)
    if (res.error) { setError(res.error); return }
    if (res.id) onCreated(res.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>
      <FormField label="Fecha de recepción">
        <input type="date" value={receptionDate} onChange={(e) => setReceptionDate(e.target.value)} style={fieldInput} />
      </FormField>
      <FormField label="Notas (opcional)">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" style={fieldInput} />
      </FormField>

      <div style={{ border: '1px solid var(--spira-line)', borderRadius: 12, padding: '12px 14px', fontSize: 13.5 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{agg.total} unidades</div>
        <div style={{ color: 'var(--spira-muted)' }}>{agg.conDroga} con droga · {agg.cegadas} cegadas{agg.porVencer ? ` · ${agg.porVencer} vencidas/por vencer` : ''}</div>
      </div>

      {error && <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166,72,59,0.10)', borderRadius: 8, padding: '8px 12px' }} aria-live="assertive">{error}</div>}

      <button type="button" onClick={() => void create()} disabled={busy || units.length === 0} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1 }}>
        {busy ? `Creando ${agg.total} unidades…` : 'Crear recepción'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — verde (ahora sí, con Tasks 6-8 en su lugar).
- [ ] **Step 3: Verificación (Director):** crear una recepción IP con 3-4 `TEST-KIT-*` → vuelve a la cola con la recepción resaltada; **Verificar** la recepción → las unidades pasan a stock (Task 10). Probar el rebote: re-recibir un `TEST-KIT-*` ya cargado → mensaje que lista el kit.
- [ ] **Step 4: Commit**

```bash
git add src/views/pharma/wizard/Step3SummaryIp.tsx
git commit -m "feat(pharma): wizard IP Paso 3 — resumen agregado y creación atómica"
```

---

## Task 10: Stock del IP en `MedicamentosView`

**Files:**
- Modify: `src/views/pharma/MedicamentosView.tsx`

**Interfaces:**
- Consumes: `useIpUnits` (`../../data/pharma`), `IpUnitRow`, `SegmentedControl`.
- Produces: ámbito "Investigación" que lista `v_ip_units` como cards (con estados loading/error/vacío/gating).

- [ ] **Step 1: Sumar el ámbito y la lista IP**

Agregar un `SegmentedControl` de ámbito arriba (Base / Investigación). Para "Investigación", usar `useIpUnits(protocolId)` y renderizar cards `IpUnitCard`. Reusar el `protocolSelect`, los estados (loading/error/vacío) y los estilos (`rowCard`, `badgeStyle`, `errorBox`) ya presentes en el archivo.

```tsx
// nuevo estado
const [ambito, setAmbito] = useState<'base' | 'investigacion'>('base')
const ip = useIpUnits(ambito === 'investigacion' ? (protocolId || null) : null)

// control de ámbito (arriba del protocolSelect)
const ambitoControl = (
  <SegmentedControl<'base' | 'investigacion'>
    accent={accentSolid} value={ambito} onChange={setAmbito}
    options={[{ value: 'base', label: 'Medicación de base' }, { value: 'investigacion', label: 'Producto Investigación' }]}
  />
)
```

Rama de render para `ambito === 'investigacion'` (después del gating de protocolo, espejando la estructura de la base): loading → EmptyState "Cargando…"; error → `errorBox` + Reintentar; vacío → EmptyState "Sin unidades en stock"; si hay filas → lista de `IpUnitCard`. Filtro por estado de vencimiento (todas / por vencer / vencidas) con `<select>` y buscador por N° de kit (reusar `searchWrap`/`searchInput`).

```tsx
function IpUnitCard({ u }: { u: IpUnitRow }) {
  const badge = u.vencida
    ? { label: 'Vencida', color: 'var(--spira-danger)', bg: 'rgba(166,72,59,0.10)' }
    : u.por_vencer
      ? { label: 'Por vencer', color: 'var(--spira-warn)', bg: 'rgba(176,130,63,0.12)' }
      : { label: 'En stock', color: 'var(--spira-good)', bg: 'rgba(92,138,90,0.12)' }
  return (
    <div style={rowCard}>
      <div style={{ minWidth: 0 }}>
        <div className="spira-mono" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--spira-ink)' }}>{u.kit_number}</div>
        <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>
          {u.lot_number ? `lote ${u.lot_number}` : 'sin lote'}{u.expiry_date ? ` · vence ${u.expiry_date}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
        <span style={{ ...badgeStyle, color: 'var(--spira-muted)', background: 'var(--spira-surface)' }}>{u.drug_name ?? 'Cegado'}</span>
        <span style={{ ...badgeStyle, color: badge.color, background: badge.bg }}>{badge.label}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — verde.
- [ ] **Step 3: Verificación (Director):** en Pharma → Medicamentos, ámbito "Producto Investigación" + protocolo → aparecen las unidades verificadas en Task 9 como cards (N° de kit, lote/vto, droga o "Cegado", badge de vencimiento). El filtro y el buscador por kit funcionan.
- [ ] **Step 4: Commit**

```bash
git add src/views/pharma/MedicamentosView.tsx
git commit -m "feat(pharma): stock del IP — lista de unidades por protocolo (v_ip_units)"
```

---

## Task 11: Cierre — typecheck + build + checklist de verificación

**Files:** (ninguno nuevo)

- [ ] **Step 1: Typecheck + build completos**

Run: `npm run build`
Expected: `tsc --noEmit` verde + build de Vite OK.

- [ ] **Step 2: Escribir el checklist de verificación en navegador para el Director** (en el handoff de la jornada), incluyendo:
  - Aplicar la **0037** a mano (bloqueada por Task 12).
  - Login pharma-leader, `TEST-*`. Recepción IP: escanear/tipear varias cadenas GS1 → contar; re-escaneo dedup; no-GS1 → manual; droga por fila + masiva; crear; verificar; stock IP sube; rebote de kit duplicado lista el kit.
  - Borrar los `TEST-*`.

- [ ] **Step 3: Commit** (si hubo ajustes del build)

```bash
git add -A
git commit -m "chore(pharma): cierre de la tajada IP — build verde"
```

---

## Task 12: ⚠️ Validación del parser con escaneo real (BLOCKER de la 0037)

**Files:** posiblemente `src/lib/gs1.ts` (ajuste del AI del kit).

- [ ] **Step 1:** Conseguir del Director/Pablo **el string crudo de un DataMatrix real de un kit del sponsor** (de un protocolo activo).
- [ ] **Step 2:** Pasarlo por `parseGs1` y confirmar qué AI trae el N° de kit. Si **no** es el `(21)`, ajustar el mapeo de `kitNumber` en `gs1.ts` al AI correcto (el mapa `ais` ya trae todo; es un cambio de una línea) y verificar contra 2-3 kits más.
- [ ] **Step 3:** Confirmar que el lector 2D está **configurado para emitir FNC1** (si no, lote y serial no se separan).
- [ ] **Step 4:** Recién ahí, dar luz verde para **aplicar la 0037 en prod** y confiar en el `unique(protocol_id, kit_number)`.
- [ ] **Step 5: Commit** (si hubo ajuste)

```bash
git add src/lib/gs1.ts
git commit -m "fix(pharma): mapear el N° de kit al AI real del DataMatrix del sponsor"
```

---

## Self-Review (cobertura de la spec)

- **Modelo `ip_units` + ganchos de dispensación + triggers + RLS + índices** → Task 1. ✓
- **RPC `create_ip_reception` con pre-validación de duplicados** → Task 1. ✓
- **Extensión del trigger con `return` temprano** → Task 1. ✓
- **Vista `v_ip_units` con `por_vencer` sin solape** → Task 1. ✓
- **Parser GS1 (AIs fijos/variables, FNC1, DD=00, pivote YY, mapa completo)** → Task 2. ✓
- **Capa de datos + barrel** → Task 3. ✓
- **DrugPicker sobre `drugs`** → Task 4. ✓
- **Habilitar ámbito IP (Paso 0 + cola), unificar "Producto Investigación"** → Task 5. ✓
- **Ramificar wizard por tipo (STEPS/canAdvance/seedLots/estado)** → Task 6. ✓
- **Escaneo por unidad (fila arriba, contador sticky, dedup, droga por fila, fallback marcado)** → Task 7. ✓
- **Revisión + corrección lote/vto + droga masiva + chip "Cegado"** → Task 8. ✓
- **Resumen agregado + creación atómica + estado de submit + guard de kit** → Task 9. ✓
- **Stock IP como cards con estados/filtros** → Task 10. ✓
- **Mensaje del kit duplicado vía `check_violation`** → Task 1 (RPC) + Task 3 (pharmaErrorMessage). ✓
- **Blocker: escaneo real del sponsor antes de aplicar la 0037** → Task 12 + Global Constraints. ✓
- **Fuera de alcance (Tajada 2):** dispensación por kit, ledger unificado, kitCode de Track, unblinding, flujo de baja — no hay tareas (correcto, diferido en la spec §11).
