# Pharma Tajada 1a — Capa de datos (`src/data/pharma/`) · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o superpowers:executing-plans. Pasos con checkbox.

**Goal:** Escribir la capa de datos de Pharma 1a: hooks de lectura + mutaciones por RPC contra el schema de la 0032, calcando el patrón de `src/data/patients.ts`.

**Architecture:** Varios archivos por entidad bajo una **subcarpeta de módulo** `src/data/pharma/` (co-localizado para portabilidad), con un barrel `index.ts`. Cada archivo importa SOLO primitivas del Core (`lib/supabase`, `lib/useSupabaseQuery`) — sin tocar Track ni otros módulos.

**Tech Stack:** TypeScript strict, Supabase JS, React hooks. Gate: `npm run typecheck` (no hay tests).

**Spec:** [`docs/superpowers/specs/2026-06-24-pharma-1a-medicacion-farmacia-design.md`](../specs/2026-06-24-pharma-1a-medicacion-farmacia-design.md) · **Migración base ya aplicada:** `0032`.

## Global Constraints (del proyecto)
- **Tipos a mano** por fila/input, con comentario citando la migración (sin tipos generados).
- **Lecturas** = hooks `useXxx()` sobre `useSupabaseQuery(queryFn, deps)`. **Mutaciones** = funciones `async` → `supabase.rpc(...)` (o `.from().update()` directo), que devuelven `{ error: string | null; code?: string }`.
- **Errores Postgres → mensajes serenos** en castellano (`23505`/`23502`/`23514`/`42501`/`foreign_key`).
- **RLS filtra en silencio:** tras un `update`/`delete` directo, 0 filas = sin permiso (no éxito).
- **Importar solo del Core** (`../../lib/...`), nunca de `../track` ni otros módulos.

## Contrato del Core (checklist de portabilidad)
Para llevar este módulo a otro sistema, hay que proveer: **primitivas** `lib/supabase` (cliente) + `lib/useSupabaseQuery` (hook genérico, sin deps externas); **schema** las migraciones de Pharma (0002 sección Pharma + 0032) + las tablas/funciones del Core que referencian (`protocols`, `users`, y para Tajada 2 `patient_visits`/`enrollments`; funciones `has_min_role`/`has_module`/`audit_row`/`auth.uid()`; enums). El front de Pharma (esta carpeta + `src/views/pharma/`) se copia tal cual; lo demás es el contrato a cumplir.

## File Structure (`src/data/pharma/`)
| Archivo | Responsabilidad |
|---|---|
| `errors.ts` | `pharmaErrorMessage(code, raw)` compartido (DRY). |
| `drugs.ts` | `useDrugs()` (lista global) · `createDrug(name)`. |
| `medications.ts` | `useMedications()` (catálogo + droga) · `useMedicationVariants(drugId)` · `createMedication(input)` · `resolveCode(code)` (escáner GTIN→medicamento). |
| `protocolMedications.ts` | `useProtocolMedications(protocolId)` (asignados al protocolo) · `assignMedicationToProtocol(protocolId, medicationId)`. |
| `stock.ts` | `useStock(protocolId)` (sobre `v_medication_stock`) · `useLots(medicationId, protocolId)` · `adjustStock(lotId, delta, reason)`. |
| `receptions.ts` | `useReceptions(protocolId)` · `createReception(input)` · `verifyReception(receptionId)`. |
| `index.ts` | Barrel: re-exporta la superficie pública del módulo. |

---

### Task 1: `errors.ts` (helper compartido)
**Files:** Create `src/data/pharma/errors.ts`
- [ ] **Step 1 — Escribir el helper:**
```ts
/** Traduce códigos de Postgres a mensajes serenos para el módulo Pharma. */
export function pharmaErrorMessage(code: string | undefined, raw: string): string {
  if (code === '23505') return 'Ya existe un registro con ese valor único (código o lote repetido).'
  if (code === '23502') return 'Faltan datos obligatorios. Revisá el formulario.'
  if (code === '23514') return 'Un valor no es válido (cantidad o stock fuera de rango).'
  if (code === '42501') return 'No tenés permiso para esta acción.'
  if (code === '23503') return 'El registro referenciado no existe o ya no está disponible.'
  return raw || 'No pudimos completar la acción. Probá de nuevo.'
}
```
- [ ] **Step 2 — `npm run typecheck`** → verde.
- [ ] **Step 3 — Commit:** `git add src/data/pharma/errors.ts && git commit -m "feat(pharma): data — helper de errores"`

### Task 2: `drugs.ts`
**Files:** Create `src/data/pharma/drugs.ts`
**Interfaces (produce):** `DrugRow {id,name}` · `useDrugs(): QueryResult<DrugRow[]>` · `createDrug(name): Promise<{error;code?;id?}>`
- [ ] **Step 1 — Escribir** (patrón `patients.ts`; RPC `create_drug(p_name)` → uuid):
```ts
import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

/** Droga / principio activo (tabla drugs, global). Migración 0032. */
export interface DrugRow { id: string; name: string }

export function useDrugs() {
  return useSupabaseQuery<DrugRow[]>(
    (c) => c.from('drugs').select('id, name').order('name').returns<DrugRow[]>(),
    [],
  )
}

export async function createDrug(name: string): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('create_drug', { p_name: name })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}
```
- [ ] **Step 2 — typecheck** → verde. **Step 3 — Commit** `feat(pharma): data — drogas`.

### Task 3: `medications.ts`
**Files:** Create `src/data/pharma/medications.ts`
**Interfaces:** `MedicationRow {id,name,unit,low_stock_threshold,drug:{id,name}|null}` · `useMedications()` · `useMedicationVariants(drugId)` · `NewMedicationInput {drug_id,name,unit,low_stock_threshold,gtin?}` · `createMedication(input)` · `resolveCode(code): Promise<MedicationRow|null>`
- [ ] **Step 1 — Escribir.** Lectura del catálogo con join a droga; RPC `create_medication(p_drug_id,p_name,p_unit,p_low_stock_threshold,p_gtin)` → uuid; `resolveCode` busca en `medication_codes` por `code` (`.maybeSingle()`) y trae el medicamento. Tipos a mano citando 0032. `useMedicationVariants(drugId)` = `useMedications` filtrado por `drug_id` (deps `[drugId]`).
```ts
// firma RPC exacta:
await supabase.rpc('create_medication', {
  p_drug_id: input.drug_id, p_name: input.name, p_unit: input.unit,
  p_low_stock_threshold: input.low_stock_threshold, p_gtin: input.gtin ?? null,
})
// resolveCode:
const { data } = await supabase.from('medication_codes')
  .select('medication:medications(id, name, unit, low_stock_threshold, drug:drugs(id,name))')
  .eq('code', code).maybeSingle()
```
- [ ] **Step 2 — typecheck** → verde. **Step 3 — Commit** `feat(pharma): data — medicamentos + resolución de código`.

### Task 4: `protocolMedications.ts`
**Files:** Create `src/data/pharma/protocolMedications.ts`
**Interfaces:** `useProtocolMedications(protocolId)` (medicamentos asignados, join a medication+drug; deps `[protocolId]`) · `assignMedicationToProtocol(protocolId, medicationId)` (RPC `assign_medication_to_protocol(p_protocol_id,p_medication_id)`).
- [ ] **Step 1 — Escribir** (mismo patrón). **Step 2 — typecheck.** **Step 3 — Commit** `feat(pharma): data — asignación protocolo-medicamento`.

### Task 5: `stock.ts`
**Files:** Create `src/data/pharma/stock.ts`
**Interfaces:** `StockRow {medication_id,protocol_id,name,unit,low_stock_threshold,total_stock,is_low_stock}` (de `v_medication_stock`) · `useStock(protocolId)` (deps `[protocolId]`, filtra `.eq('protocol_id', protocolId)`) · `LotRow {id,medication_id,protocol_id,lot_number,expiry_date,quantity_on_hand}` · `useLots(medicationId, protocolId)` · `adjustStock(lotId, delta, reason)` (RPC `adjust_stock(p_lot_id,p_quantity_delta,p_reason)`).
- [ ] **Step 1 — Escribir.** **Step 2 — typecheck.** **Step 3 — Commit** `feat(pharma): data — stock por lote + ajuste`.

### Task 6: `receptions.ts`
**Files:** Create `src/data/pharma/receptions.ts`
**Interfaces:** `ReceptionRow {id,protocol_id,reception_date,status,verified_at,notes, items:ReceptionItem[]}` · `useReceptions(protocolId)` · `ReceptionItemInput {medication_id,lot_number,expiry_date,quantity}` · `createReception(input)` (RPC `create_reception(p_protocol_id,p_reception_date,p_notes,p_items)`, `p_items` = `JSON` array) · `verifyReception(receptionId)` (RPC `verify_reception(p_reception_id)`).
- [ ] **Step 1 — Escribir.** Nota: `p_items` se pasa como array JS (supabase-js lo serializa a jsonb). **Step 2 — typecheck.** **Step 3 — Commit** `feat(pharma): data — recepciones (crear/verificar)`.

### Task 7: `index.ts` (barrel) + verificación final
**Files:** Create `src/data/pharma/index.ts`
- [ ] **Step 1 — Re-exportar** la superficie pública: `export * from './drugs'` … etc. (incluye `errors` solo si se usa fuera).
- [ ] **Step 2 — `npm run build`** (typecheck + build de producción) → verde.
- [ ] **Step 3 — Commit** `feat(pharma): data — barrel del módulo`.

## Self-Review (hecho)
- Cada archivo importa solo `../../lib/*` + `./errors` → contrato del Core respetado. ✔
- Firmas de RPC == las de la 0032 (`p_*`). ✔
- Lecturas devuelven `QueryResult<T>`; mutaciones `{error,code?}` (+`id?` donde la RPC devuelve uuid). ✔
- Tipos a mano citando 0032; sin placeholders. ✔

## Próximos planes (no en este)
- Vistas `src/views/pharma/` (`medicamentos` + `recepcion` espejo de Visitas) — consumen esta capa.
- Sembrado (script Node desde Excel + top 100-200).
