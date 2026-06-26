# Tajada 1a — Medicación de Farmacia (Spira Pharma)

Spec de diseño · 2026-06-24 · **rev 2026-06-25 (modelo: catálogo global + asignación explícita)**

## 1. Contexto y alcance

Spira Pharma hoy es un **cascarón**: el módulo y sus submódulos están en `src/modules/registry.ts`, pero en `src/views/registry.tsx` solo `pharma/protocolos` resuelve a una vista real (reusa `ProtocolsView` de Track); el resto cae a `Placeholder`. La base de datos **ya modela el dominio de farmacia** (migraciones 0002–0009): catálogo, stock por lote, recepción, dispensación, movimientos inmutables y vistas. El monolito `farmaclinic` se usa como **especificación de producto, no se adopta código**.

Esta spec cubre la **Tajada 1a: Medicación de Farmacia** (comercial, EAN-13). Es el cimiento del módulo: sin stock no hay nada que dispensar.

**Entra:** catálogo global (droga + medicamento + GTIN), asignación de medicamentos a protocolos, stock por lote y por protocolo, recepción (espejo de Visitas), lectora de ingreso (EAN-13), ajuste manual de stock con motivo.

**No entra (después):** 1b Medicación de Protocolo (sponsor, DataMatrix); Tajada 2 Dispensación + redispensación + lectora de egreso.

## 2. Decisiones del brainstorm (cerradas)

- Reescribir el dominio sobre el Core; cero líneas del monolito.
- **Catálogo de medicación GLOBAL** (un medicamento = un producto, único por GTIN), NO por protocolo. El **protocolo vive en el stock** (lotes/recepciones) y en una **asignación explícita** `protocol_medications`. (Cambio respecto de la 1ª versión, que ataba `medications.protocol_id` — ver §2bis.)
- **Trazabilidad por lote completa** (lote + vencimiento + protocolo, en el lote).
- La **farmacéutica hace todo** el flujo de recepción (crear + cargar + verificar). Rol `leader+` de pharma.
- **Principio de UI (Director):** máximo desplegable / valores preestablecidos, mínimo texto libre.
- **Autorellenado con memoria:** droga/medicamento del código + catálogo sembrado; lote/vto desde `medication_lots`.
- Pharma es **central** (ve todos los protocolos).
- Dispensación (Tajada 2): modelo **híbrido**. Fuera de esta spec, pero el modelo de coherencia que define §3 la afecta.

## 2bis. Por qué el catálogo global (nota de diseño)

La 1ª versión del schema (revisada adversarialmente) ató `medications.protocol_id` y enforced coherencia medicamento↔protocolo (A13/A14 de `schema-review.md`). **Lo revertimos a propósito:** el mismo producto físico (mismo GTIN) se usa en varios protocolos y un GTIN es único global, así que el catálogo pasa a ser global. La coherencia por protocolo **no se pierde, se reubica**: a la **asignación explícita** (`protocol_medications`) y al **lote** (el lote dispensado debe pertenecer al protocolo de la visita), lo cual es más preciso para la trazabilidad de ANMAT. Se hace **ahora** porque las tablas de Pharma están vacías en prod → es puro cambio de schema, sin migración de datos (**confirmado 2026-06-25**, §10).

## 3. Modelo de datos

### Ya existe, se mantiene
- `medication_receptions` (id, protocol_id, received_by, reception_date, status `reception_status`, verified_by, verified_at, notes) — ya es por protocolo.
- `reception_items` (reception_id, medication_id, lot_number, expiry_date, quantity > 0, `unique(reception_id, medication_id, lot_number)`).
- `stock_movements` (inmutable, ANMAT — medication_id, lot_id, …; el protocolo se deriva por el lote). `protocol_alerts`. Triggers `set_reception_verified`, `audit_row`, `set_updated_at`.

### Net-new (`0032`)
- **`drugs`** (id, name) — principio activo / monodroga, **global**.
- **`protocol_medications`** (id, protocol_id→protocols, medication_id→medications, created_at, `unique(protocol_id, medication_id)`) — **qué medicamentos usa cada protocolo** (allow-list, se siembra del Excel). Es el ancla de coherencia.
- **`medication_codes`** (id, medication_id, code, code_type, `unique(code)`) — GTIN/EAN → medicamento, **único global**.

### Alterado (`0032`)
- **`medications`**: **drop `protocol_id`**, **add `drug_id`→drugs**. Queda global: (id, drug_id, name, unit, low_stock_threshold, created_by, timestamps).
- **`medication_lots`**: **add `protocol_id`→protocols**; el `unique` pasa de `(medication_id, lot_number)` a **`(medication_id, protocol_id, lot_number)`** (el mismo lote recibido para dos protocolos = dos filas). Mantiene `(id, medication_id)` para el FK compuesto de dispensation_items/stock_movements.

### Triggers a reescribir (`0032`)
- **`apply_reception_stock`**: el lote hereda `protocol_id = reception.protocol_id`; se quita el check viejo (`medications.protocol_id`); se agrega que la medicación esté **asignada** al protocolo (`exists protocol_medications`).
- **`check_request_item_protocol`**: la medicación solicitada debe estar **asignada** al protocolo de la visita (`protocol_medications`).
- **`check_dispensation_item_protocol`**: el **lote** dispensado debe pertenecer al protocolo de la visita (`medication_lots.protocol_id`).
- **`v_medication_stock`**: stock por **(medicamento, protocolo)** (agrupa por medication+protocol; el protocolo sale de los lotes).

### RLS (`0032`)
- `medications` / `drugs` / `medication_codes` (catálogo global): SELECT pharma/gerencia/contable; INSERT/UPDATE = pharma `leader` (como hoy). Sin scope por protocolo.
- `protocol_medications`: SELECT pharma/gerencia; escribe pharma `leader`.
- `medication_lots` / recepciones: policies pharma ya existen (central); confirmar.

## 4. RPCs (`0032`) — todas `SECURITY DEFINER` + authz pharma + auditadas
- `create_drug(name)` → uuid. leader+.
- `create_medication(drug_id, name, unit, low_stock_threshold=5, gtin?)` → uuid. **Global, sin protocol_id.** Guarda el GTIN en `medication_codes`. leader+.
- `assign_medication_to_protocol(protocol_id, medication_id)` → void — upsert en `protocol_medications`. leader+. (El seed del Excel lo hace en masa.)
- `create_reception(protocol_id, reception_date, notes, items[])` → uuid — crea recepción (`pendiente`, `received_by=auth.uid()`) + `reception_items`, atómico; valida que cada medicamento esté asignado al protocolo. `items[] = {medication_id, lot_number, expiry_date, quantity}`. leader+.
- `verify_reception(reception_id)` → void — `pendiente → verificada`, guarda de una sola vez; los triggers ingresan stock a lotes con su `protocol_id`. leader+.
- `adjust_stock(lot_id, quantity_delta, reason)` → void — el lote ya identifica medicamento+protocolo; `reason` obligatorio → `stock_movements`; check `≥ 0`. leader+.
- Errores Postgres → mensajes serenos (`23505`, `23514`, `42501`), patrón de `data/`.

## 5. Capa de datos — `src/data/pharma*.ts`
Patrón de `patients.ts`/`protocols.ts`:
- **Lecturas:** hooks `useXxx()` sobre `v_medication_stock` (por medicamento+protocolo), `medications`+`drugs`, `medication_lots`, `protocol_medications`, `medication_receptions`+`reception_items`, `medication_codes`.
- **Mutaciones:** funciones async vía `supabase.rpc(...)` a las RPCs de §4.
- **Tipos a mano** por fila/input, citando la 0032.
- **Helpers:** variantes por droga (mismo `drug_id`), GTIN→medicamento, lote→vencimiento, medicamentos asignados a un protocolo.

## 6. Vistas y UX (regla: desplegable > texto libre)

### `pharma/medicamentos` (catálogo + stock)
- El catálogo es **global**; el stock se muestra **por protocolo** (filtro protocolo = desplegable, vía lotes). Filtros: protocolo, estado de stock (todos/bajo/sin/por vencer/vencido), droga. Único texto libre: buscador por nombre.
- **Alta de medicamento** (modal, global): droga = desplegable (editable con variantes), nombre, unidad = desplegable, umbral default 5, GTIN por escaneo. **Sin selector de protocolo** (es global).
- **Asignar medicamento a protocolo:** acción que escribe `protocol_medications` (se siembra del Excel; se ajusta on-demand).
- **Ajuste de stock** (modal): lote = desplegable (identifica medicamento+protocolo); delta +/–; motivo = desplegable de motivos preestablecidos + nota opcional.

### `pharma/recepcion` (espejo de Visitas)
- Cola de recepciones por estado (pendiente/verificada) + detalle al costado. La maneja la farmacéutica.
- **Nueva recepción:** protocolo = desplegable; los renglones se eligen entre los **medicamentos asignados a ese protocolo** (desplegable filtrado por `protocol_medications`). Renglones:
  - **Escaneo (EAN-13):** GTIN → medicamento → droga (sale sola). Si el medicamento **no está asignado** a este protocolo, "¿lo asigno?" (on-demand) → `protocol_medications`. Lote/vto del DataMatrix si lo hubiera; si es EAN-13, autorelleno desde `medication_lots` o carga una vez (lote / vto date picker) y queda en memoria.
  - **Manual:** medicamento = desplegable (asignados al protocolo); varios lotes bajo el mismo medicamento en filas rápidas.
  - **Autorellenados editables:** droga/medicamento editables → desplegable de variantes (otros productos de la misma droga; todas las drogas). Sin texto libre.
- **Verificar:** botón → `verify_reception`; confirmación clara e irreversible (queda en `audit_log`); el stock entra al lote con su protocolo.

### Lectora
- Campo "Escaneá acá" siempre enfocado en recepción; pistola tipea código + Enter; renglón con feedback. Para 1a alcanza un lector EAN-13; el 2D/imager (DataMatrix) se necesita en 1b.
- `medication_codes.code` único global. GTIN no mapeado → asignar/crear una vez → se guarda.
- **Sembrado (3 capas):** (1) el **Excel curado** de la Fundación siembra el catálogo global (drugs + medications + medication_codes) **y** `protocol_medications` (la asignación), vía script de Node idempotente (no horneado en la migración); (2) top **100-200** medicaciones más conocidas; (3) **on-demand** como red de seguridad para lo que no esté.

## 7. Errores y casos borde
- **Doble escaneo del mismo lote:** no duplica renglón (`unique(reception_id, medication_id, lot_number)`); la UI suma cantidad. El mismo lote para otro protocolo = otra fila (el `unique` de lotes incluye protocolo).
- **Re-verificar recepción:** guarda de una sola vez en `verify_reception`.
- **Medicación no asignada al protocolo:** la recepción/solicitud la rechaza (vía `protocol_medications`); en recepción ofrece asignarla on-demand.
- **GTIN no mapeado:** se pregunta una vez y se guarda.
- **Lote vencido / por vencer:** badge de color; en recepción avisa, no bloquea (el bloqueo de dispensar vencido es Tajada 2).
- **Ajuste a negativo:** imposible (`quantity_on_hand ≥ 0`).
- **Permisos:** catálogo + recepción + ajuste = farmacéutica (leader+); lecturas por RLS (0 filas = sin permiso).

## 8. Fuera de alcance / a futuro
- **1b Medicación de Protocolo** (DataMatrix del sponsor; mapeo del IP la primera vez).
- **Tajada 2:** dispensación híbrida + redispensación + lectora de egreso + cola de la farmacéutica (usa la coherencia por lote definida acá).
- **UX/visual:** `/design-consultation` → `/design-shotgun` → `/design-review`. Verificación visual por preview nativo (smoke test pendiente) o el usuario (browser de gstack bloqueado por WDAC).

## 9. Verificación
- `npm run typecheck` verde + `npm run build`.
- Recorrido manual: alta de medicamento (global) → asignar a protocolo → recepción con escaneo y manual → verificar → ver stock por lote y protocolo → ajuste con motivo → confirmar `audit_log` y `stock_movements`. Con registros `TEST-*` (prod tiene datos reales; borrar exactamente esos).

## 10. A confirmar al implementar
- **Tablas de Pharma vacías en prod: CONFIRMADO (2026-06-25).** El cambio de modelo (drop `medications.protocol_id` + add `medication_lots.protocol_id`) es **puro schema, sin migración de datos**.
- RLS de pharma `SELECT` sobre las tablas de stock/catálogo.
- Fuente y depuración del Excel + las top 100-200.
- Contenido real del código de barras con hardware (EAN vs DataMatrix).
- Afinado fino de los gates de rol.
