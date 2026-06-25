# Tajada 1a — Medicación de Farmacia (Spira Pharma)

Spec de diseño · 2026-06-24 · brainstorm

## 1. Contexto y alcance

Spira Pharma hoy es un **cascarón**: el módulo y sus submódulos están en `src/modules/registry.ts`, pero en `src/views/registry.tsx` solo `pharma/protocolos` resuelve a una vista real (reusa `ProtocolsView` de Track); el resto cae a `Placeholder`. La base de datos, en cambio, **ya modela todo el dominio de farmacia** (migraciones 0002–0009): catálogo, stock por lote, recepción, dispensación, movimientos de stock inmutables y vistas. El monolito `farmaclinic` se usa como **especificación de producto, no se adopta código**.

Esta spec cubre la **Tajada 1a: Medicación de Farmacia** (medicación comercial, con código de barras EAN-13). Es la primera tajada vertical del módulo y el cimiento: sin stock no hay nada que dispensar.

**Entra:** catálogo (droga + medicamento + GTIN), stock por lote (lote + vencimiento + cantidad), módulo de Recepción (espejo de Visitas, se registra al llegar → verificar → ingresa stock), lectora de ingreso (EAN-13), ajuste manual de stock con motivo.

**No entra (después):** 1b Medicación de Protocolo (producto del sponsor, con DataMatrix); Tajada 2 Dispensación + redispensación + lectora de egreso.

## 2. Decisiones del brainstorm (cerradas)

- Reescribir el dominio sobre el Core; cero líneas del monolito.
- La medicación de farmacia **pertenece a un protocolo** (`medications.protocol_id`).
- **Trazabilidad por lote completa**, también para farmacia (lote + vencimiento por lote).
- La **farmacéutica hace todo** el flujo de recepción (crear + cargar + verificar). Rol: `leader+` del módulo pharma.
- **Principio de UI (Director):** máximo desplegable / valores preestablecidos, mínimo texto libre, para evitar errores del operador.
- **Autorellenado con memoria:** droga y medicamento salen del código + catálogo sembrado; lote y vencimiento se autorellenan desde `medication_lots` (que ya guarda lote→vencimiento).
- Pharma es **central** (ve todos los protocolos), distinto del aislamiento por protocolo de Track.
- Dispensación (Tajada 2): modelo **híbrido** (Track solicita → Pharma ejecuta, + manual desde Pharma para redispensación). Fuera de esta spec.

## 3. Modelo de datos

### Ya existe (no se toca la mecánica)
- `medications` (id, protocol_id, name, unit, low_stock_threshold, created_by, timestamps) — catálogo, sin stock.
- `medication_lots` (id, medication_id, lot_number, expiry_date, quantity_on_hand ≥ 0, `unique(medication_id, lot_number)`) — stock por lote. **Es también la "memoria" lote→vencimiento.**
- `medication_receptions` (id, protocol_id, received_by, reception_date, status `reception_status`, verified_by, verified_at, notes) + `reception_items` (reception_id, medication_id, lot_number, expiry_date, quantity > 0, `unique(reception_id, medication_id, lot_number)`).
- `stock_movements` (inmutable, audit trail ANMAT). `protocol_alerts` (umbrales). Vista `v_medication_stock` (total por medicamento + flag stock bajo).
- Triggers existentes: `apply_reception_stock` (al verificar, ingresa stock a lotes + graba movimiento), `set_reception_verified`, `audit_row`, `set_updated_at`.

### Net-new en migración `0032`
- **`drugs`** (id, name) — principio activo / monodroga, **global**.
- **`medications.drug_id`** → `drugs` (nullable al inicio para no romper filas; se completa al sembrar/editar).
- **`medication_codes`** (id, medication_id, code, code_type) — mapeo GTIN/EAN → medicamento; soporta varias presentaciones/códigos por medicamento.
- **A verificar antes de cablear:** que la RLS dé al rol pharma `SELECT` sobre `medications` / `medication_lots` / `medication_receptions` / `reception_items` / `v_medication_stock` (0010/0028 abrieron lecturas a pharma/admin; confirmar). Si falta, sumar policies en la 0032.

## 4. RPCs (`0032`) — todas `SECURITY DEFINER` + authz pharma + auditadas

- `create_drug(name)` → uuid — alta puntual de droga (o se siembra). Rol leader+.
- `create_medication(protocol_id, drug_id, name, unit, low_stock_threshold=5, gtin?)` → uuid — alta de producto; guarda GTIN en `medication_codes` si viene. **No carga stock.** Rol leader+.
- `create_reception(protocol_id, reception_date, notes, items[])` → uuid — crea recepción (`status='pendiente'`, `received_by=auth.uid()`) + `reception_items`, atómico. `items[] = {medication_id, lot_number, expiry_date, quantity}`. Rol leader+.
- `verify_reception(reception_id)` → void — `pendiente → verificada`, con guarda de una sola vez. Los triggers ingresan el stock. Rol leader+.
- `adjust_stock(medication_id, lot_id, quantity_delta, reason)` → void — ajuste manual con `reason` obligatorio → `stock_movements`; el check `quantity_on_hand ≥ 0` impide negativo. Rol leader+.
- Errores Postgres → mensajes serenos (`23505` duplicado, `23514` cantidad/stock inválido, `42501` permiso), patrón de `data/`.

## 5. Capa de datos — `src/data/pharma*.ts`

Patrón de `patients.ts`/`protocols.ts`:
- **Lecturas:** hooks `useXxx()` sobre `useSupabaseQuery` contra `v_medication_stock`, `medications`+`drugs`, `medication_lots`, `medication_receptions`+`reception_items`, `medication_codes`.
- **Mutaciones:** funciones async vía `supabase.rpc(...)` a las RPCs de §4.
- **Tipos a mano** por fila/input, citando la 0032.
- **Helpers:** variantes por droga (medications con mismo `drug_id`), lookup GTIN→medicamento, lookup lote→vencimiento.

## 6. Vistas y UX (regla: desplegable > texto libre)

### `pharma/medicamentos` (catálogo + stock)
- Lista estilo Track. Filtros por desplegable: protocolo, estado de stock (todos/bajo/sin/por vencer/vencido), **droga** (para ver variantes). Único texto libre: buscador por nombre.
- Stock por lote de `v_medication_stock`; badges de color (bajo/por vencer/vencido) vía `protocol_alerts`.
- **Alta de medicamento** (modal): protocolo = desplegable; **droga** autorellenada (editable con desplegable de drogas); nombre del producto = del catálogo o texto una vez si es nuevo; unidad = desplegable; umbral = número default 5; GTIN = por escaneo.
- **Ajuste de stock** (modal): medicamento + lote = desplegables; delta +/–; **motivo = desplegable de motivos preestablecidos** + nota opcional.

### `pharma/recepcion` (espejo de Visitas)
- Cola de recepciones como "Visitas del día" pero de recepciones: estado (pendiente/verificada) en color + detalle al costado. La maneja la farmacéutica.
- **Nueva recepción:** protocolo = desplegable, fecha = date picker, notas opcional. Renglones:
  - **Escaneo primero (EAN-13):** scan → GTIN → medicamento (catálogo sembrado) → droga (sale sola). Lote/vencimiento: del DataMatrix si lo hubiera; si es EAN-13, se autorellenan si el lote ya existe, o se cargan una vez (lote texto, vencimiento date picker) y quedan en memoria (`medication_lots`).
  - **Manual:** medicamento = desplegable del protocolo; varios lotes bajo el mismo medicamento en filas rápidas (lote / vencimiento / cantidad).
  - **Autorellenados editables:** droga y medicamento se pueden modificar; al editar se abre **desplegable de variantes** (medicamento → otros productos de la misma droga; droga → todas las drogas). Sin texto libre.
- **Verificar:** botón → `verify_reception`; confirmación clara e irreversible (queda en `audit_log`).

### Lectora
- Campo "Escaneá acá" siempre enfocado en recepción; la pistola tipea código + Enter; aparece el renglón con feedback. Para 1a alcanza un lector de EAN-13; el 2D/imager (DataMatrix) se necesita en 1b.
- GTIN no mapeado → preguntar una vez (desplegable) → guardar en `medication_codes`.
- Catálogo sembrable desde vademécum / GS1 Argentina (GTIN → producto → monodroga); **fuente exacta a confirmar al implementar**.

## 7. Errores y casos borde
- **Doble escaneo del mismo lote:** no duplica renglón (`unique(reception_id, medication_id, lot_number)`); la UI suma cantidad.
- **Re-verificar recepción:** guarda de una sola vez en `verify_reception` → no ingresa stock dos veces.
- **GTIN no mapeado:** se pregunta una vez y se guarda.
- **Lote vencido / por vencer:** badge de color; en recepción **avisa pero no bloquea** (el bloqueo duro de dispensar vencido es de la Tajada 2).
- **Ajuste a negativo:** imposible (`quantity_on_hand ≥ 0`); traducir a "no podés dejar el stock bajo cero".
- **Permisos:** crear/verificar/ajustar = farmacéutica (leader+); lecturas por RLS (0 filas = sin permiso, no error).

## 8. Fuera de alcance / a futuro
- **1b Medicación de Protocolo** (DataMatrix del sponsor; mapeo del producto en investigación la primera vez).
- **Tajada 2:** dispensación híbrida + redispensación + lectora de egreso + cola de la farmacéutica.
- **UX/visual:** `/design-consultation` fija el sistema sobre `tokens.css`; `/design-shotgun` sobre las pantallas hero; `/design-review` para pulir. Verificación visual por preview nativo (smoke test pendiente) o el usuario (el browser de gstack está bloqueado por WDAC).

## 9. Verificación
- `npm run typecheck` verde (el gate) + `npm run build`.
- Recorrido manual: alta de medicamento → recepción con escaneo y manual → verificar → ver stock por lote → ajuste con motivo → confirmar `audit_log` y `stock_movements`. Con registros `TEST-*` (prod tiene datos reales; borrar exactamente esos).

## 10. A confirmar al implementar
- RLS pharma `SELECT` sobre las tablas de stock.
- Fuente exacta de la base sembrable (vademécum / GS1).
- Contenido real del código en una caja/gun (EAN vs DataMatrix) con hardware real.
- Afinado fino de los gates de rol.
