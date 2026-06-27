# Pharma Tajada 1a — Vista `pharma/medicamentos` · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Pasos con checkbox.

**Goal:** Construir la vista `pharma/medicamentos`: catálogo global + stock por protocolo, con alta de medicamento, asignación a protocolo y ajuste de stock — todo con desplegables, mínimo texto libre.

**Architecture:** Una vista contenedora + 3 modales bajo `src/views/pharma/`, que consumen la capa `src/data/pharma/`. Sigue los patrones del repo (ver Explore: `ProtocolsView`/`NewProtocolForm`/`DayVisitsView`, `Modal`/`FormField`/`fieldInput`/`btnPrimary`/`btnOutline`/`Icon`/`EmptyState`).

**Tech Stack:** React + TS, CSS con variables (sin Tailwind), Lucide vía `Icon`. Gate: `npm run typecheck` + `npm run build` + verificación visual (preview nativo o el usuario).

**Spec:** [`docs/superpowers/specs/2026-06-24-pharma-1a-medicacion-farmacia-design.md`](../specs/2026-06-24-pharma-1a-medicacion-farmacia-design.md) · **Capa de datos:** `src/data/pharma/` (commit `f6b081c`).

## Global Constraints (del proyecto)
- **Desplegables sobre texto libre** (preferencia del Director). Texto libre solo lo inevitable (nombre del producto, nota opcional, buscador).
- Vista recibe `ViewProps` (`module`, `submodule`, `onNavigate`, `setHeader`); se registra en `src/views/registry.tsx` con la clave `'pharma/medicamentos'`.
- Datos por hooks de `data/pharma` (`{data,loading,error,refetch}`) + mutaciones que devuelven `{error,code?}`.
- Estilos: `accent`/`accentSolid` del módulo (Pharma = ámbar); errores con `var(--spira-danger)`; `fieldInput`, `btnPrimary(accentSolid)`, `btnOutline`. CSS con variables, nada de Tailwind.
- **Importar solo del Core + de `data/pharma`** (portabilidad).

## File Structure (`src/views/pharma/`)
| Archivo | Responsabilidad |
|---|---|
| `MedicamentosView.tsx` | Vista contenedora: selector de protocolo + lista de stock + toolbar + abre los modales. |
| `NewMedicationForm.tsx` | Modal alta de medicamento global (droga desplegable + alta de droga inline; unidad desplegable; umbral; GTIN opcional; checkbox "asignar a este protocolo"). |
| `AssignMedicationForm.tsx` | Modal: asignar un medicamento del catálogo (desplegable) al protocolo seleccionado. |
| `AdjustStockModal.tsx` | Modal: ajustar stock de un lote (lote desplegable + delta +/- + motivo desplegable + nota). |
| (modificar) `src/views/registry.tsx` | Registrar `'pharma/medicamentos': MedicamentosView`. |

**Constantes (en `MedicamentosView.tsx` o un `constants.ts` del módulo):**
- `UNIDADES = ['vial','comprimidos','ampollas','ml','sobres','frascos']` (desplegable de unidad).
- `MOTIVOS_AJUSTE = ['Recuento de inventario','Rotura','Vencimiento','Devolución','Otro']` (desplegable de motivo).

---

### Task 1: `MedicamentosView.tsx` (contenedora) + registro
**Files:** Create `src/views/pharma/MedicamentosView.tsx` · Modify `src/views/registry.tsx`
**Consume:** `useProtocols` (`data/protocols`), `useStock` (`data/pharma`). **Produce:** `MedicamentosView: ViewComponent`.
- [ ] **Step 1 — Escribir la vista.** Estructura (patrón `ProtocolsView`):
  - `const { hasMinRole } = useAuth()`; `const canManage = hasMinRole('pharma','leader')`.
  - **Selector de protocolo** (desplegable, arriba): `useProtocols()` → `<select>` con `fieldInput`; estado `protocolId`. Si no hay protocolo elegido, `EmptyState` "Elegí un protocolo".
  - **Stock** = `useStock(protocolId)`. loading/error/empty con el patrón (Icon `alertCircle`, fondo danger, botón Reintentar).
  - **Toolbar:** buscador por nombre + filtro de stock (desplegable: `todos` / `stock bajo` / `sin stock`) + (si `canManage`) botones `Nuevo medicamento` y `Asignar a este protocolo` (`btnPrimary(accentSolid)` / `btnOutline`).
  - **Filas** (de `StockRow`): nombre + droga (chip) + unidad + `total_stock` con **badge** de color: `sin stock` (danger) si `total_stock===0`, `bajo` (warn) si `is_low_stock`, si no `var(--spira-good)`. Acción por fila (si `canManage`): `Ajustar` → abre `AdjustStockModal` con `{medicationId, protocolId, name}`.
  - Estados de modal: `const [creating,setCreating]=useState(false)`, `[assigning,setAssigning]`, `[adjusting,setAdjusting]=useState<{medicationId;name}|null>(null)`. Al cerrar con éxito → `stock.refetch()`.
- [ ] **Step 2 — Registrar** en `registry.tsx`: import + `'pharma/medicamentos': MedicamentosView,`.
- [ ] **Step 3 — `npm run typecheck`** → verde (los modales aún no existen: en este paso, comentar sus usos o crear stubs; recomendado: implementar Task 2-4 antes de cablear los `onClick`, o usar placeholders `() => {}`). **Step 4 — Commit** `feat(pharma): vista medicamentos (lista + stock por protocolo)`.

### Task 2: `NewMedicationForm.tsx`
**Files:** Create `src/views/pharma/NewMedicationForm.tsx`
**Consume:** `useDrugs`, `createDrug`, `createMedication`, `assignMedicationToProtocol`. **Props:** `{ accentSolid, protocolId, onClose, onCreated }`.
- [ ] **Step 1 — Escribir** (patrón `NewProtocolForm`):
  - **Droga:** `useDrugs()` → `<select>`; opción extra "＋ Nueva droga" que revela un `<input>` para el nombre (se crea con `createDrug` al enviar y se usa su `id`). Sin texto libre salvo ese caso.
  - **Nombre del producto:** `<input>` (texto, inevitable).
  - **Unidad:** `<select>` con `UNIDADES`.
  - **Umbral de stock bajo:** `<input type="number">` default 5.
  - **GTIN (opcional):** `<input>` (el escaneo masivo es en Recepción).
  - **Checkbox** "Asignar a este protocolo" (default checked) → tras `createMedication`, si está, `assignMedicationToProtocol(protocolId, newId)`.
  - Submit: validar droga elegida/creada; `createMedication(...)`; manejar `{error}` con el mensaje serenado (ya viene de la capa de datos). On success → `onCreated()`.
- [ ] **Step 2 — typecheck.** **Step 3 — Commit** `feat(pharma): alta de medicamento`.

### Task 3: `AssignMedicationForm.tsx`
**Files:** Create `src/views/pharma/AssignMedicationForm.tsx`
**Consume:** `useMedications`, `assignMedicationToProtocol`. **Props:** `{ accentSolid, protocolId, onClose, onAssigned }`.
- [ ] **Step 1 — Escribir.** `useMedications()` (catálogo global) → `<select>` (con buscador simple por nombre si conviene); al enviar `assignMedicationToProtocol(protocolId, medicationId)`; `{error}` → mensaje; on success `onAssigned()`.
- [ ] **Step 2 — typecheck.** **Step 3 — Commit** `feat(pharma): asignar medicamento a protocolo`.

### Task 4: `AdjustStockModal.tsx`
**Files:** Create `src/views/pharma/AdjustStockModal.tsx`
**Consume:** `useLots`, `adjustStock`. **Props:** `{ accentSolid, medicationId, protocolId, medicationName, onClose, onAdjusted }`.
- [ ] **Step 1 — Escribir.** `useLots(medicationId, protocolId)` → `<select>` de lotes (mostrar `lot_number` + vto + `quantity_on_hand`). `delta` = `<input type="number">` (puede ser negativo). `motivo` = `<select>` con `MOTIVOS_AJUSTE`. `nota` = `<input>` opcional. Submit `adjustStock(lotId, delta, motivo + (nota? ' — '+nota : ''))`; `{error}` → mensaje (incluye el caso "stock negativo" que ya serena la capa). On success `onAdjusted()`.
- [ ] **Step 2 — typecheck.** **Step 3 — Commit** `feat(pharma): ajuste de stock`.

### Task 5: Cablear modales + verificación visual
- [ ] **Step 1 — Cablear** los `onClick` de `MedicamentosView` a los 3 modales (reemplazar placeholders); cada `onCreated/onAssigned/onAdjusted` cierra el modal y hace `stock.refetch()`.
- [ ] **Step 2 — `npm run build`** → verde.
- [ ] **Step 3 — Verificación visual.** Probar las **preview tools nativas** (`preview_start` → `preview_snapshot`/`preview_screenshot`) sobre `pharma/medicamentos`. Si arrancan, capturo y reviso (es además el smoke-test pendiente de las preview tools en esta máquina). Si no arrancan, dejo `npm run dev` y lo mirás vos. **Probar los RPC con un usuario pharma-leader** (no como postgres) — alta de droga/medicamento, asignación, ajuste — con datos `TEST-*`.
- [ ] **Step 4 — Commit** `feat(pharma): cablear modales de medicamentos`.

## Self-Review (hecho)
- Cobertura: lista+stock (Task 1), alta (2), asignación (3), ajuste (4), cableado+verif (5). ✔
- Desplegables: protocolo, unidad, droga, lote, motivo, filtro de stock → todos `<select>`. Texto libre solo nombre/GTIN/nota/buscador. ✔ (principio del Director)
- Importa solo Core + `data/pharma`. ✔
- Tipos/props consistentes con el mapa del Explore (Modal/FormField/fieldInput/btnPrimary). ✔

## Próximo plan (no en este)
- Vista `pharma/recepcion` (cola espejo de Visitas + escáner EAN-13 + autorellenado con memoria + crear/verificar + filas multi-lote).
- Sembrado (script Node desde Excel + top 100-200).
