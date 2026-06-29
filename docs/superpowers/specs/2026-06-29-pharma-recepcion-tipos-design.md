# Pharma — Recepción tipada (Farmacia Protocolo / Ambulatoria) + wizard · Diseño

> Cierra el **modelo de los tipos de recepción** y rediseña la recepción como **wizard de
> pantalla propia**. Reemplaza `NewReceptionModal`. Sale de una conversación de diseño
> (2026-06-29) que corrigió el Paso 0 del [wizard previo](2026-06-28-pharma-wizard-recepcion-design.md):
> no son 2 paradigmas (base/IP) sino **3 tipos**, y uno de ellos no tiene protocolo.
>
> **Estado:** diseñado, aprobado, sin implementar. **Fecha:** 2026-06-29 · **Rama:**
> `feat/pharma-recepcion-wizard` · **Migración base aplicada:** `0034` → esta agrega la **`0035`**.

## Qué cambia respecto de specs previas

- El [wizard de recepción 28/06](2026-06-28-pharma-wizard-recepcion-design.md) planteaba el Paso 0
  como **protocolo + tipo (investigación / base)**. **Corrección:** el Paso 0 elige **tipo
  (obligatorio)** entre **tres**, y el protocolo es un sub-campo de uno de ellos.
- El [modelo IP vs base 28/06](2026-06-28-pharma-modelo-ip-vs-base-design.md) decidió que el tipo
  viviría en `protocol_medications.kind` (fijo por medicamento-en-protocolo). **Eso no alcanza:**
  *Farmacia Ambulatoria* no tiene protocolo, y un mismo medicamento puede tener stock de protocolo
  **y** de ambulatoria. Por eso el tipo pasa a ser propiedad de **la recepción y del lote (ámbito
  del stock)**, no del medicamento-en-protocolo. Esa decisión previa queda **superada** para el
  alcance de base/ambulatoria; el `kind` propio del IP se resolverá en su ciclo.

## Los tres tipos de recepción

| Tipo (`reception_kind`) | Qué es | ¿Protocolo? | Catálogo / stock |
|---|---|---|---|
| `protocolo` | Medicación de un protocolo (catálogo nombrado, "medicación de base" de la 1a) | **Sí** (obligatorio) | Catálogo global nombrado; stock por (medicamento, protocolo) |
| `investigacion` | Producto de investigación (IP) | Sí | **Fuera de alcance acá** (paradigma propio: unidad rastreable, cegado, código único/repetido) |
| `ambulatoria` | Farmacia general del centro, no atada a un protocolo | **No** | Mismo catálogo global nombrado; stock propio (sin protocolo), **sin allow-list** |

## Decisiones de dominio cerradas (2026-06-29)

1. **Alcance de esta spec:** se diseñan e implementan **`protocolo` + `ambulatoria`**. `investigacion`
   aparece en el selector **deshabilitado ("próximamente")**; su flujo y schema son **su propio
   ciclo** (sigue con las preguntas abiertas del modelo IP, decisión de Pablo).
2. **Farmacia Ambulatoria = farmacia general del centro, sin protocolo.**
3. **Catálogo compartido, sin allow-list para ambulatoria:** los dos tipos usan el mismo catálogo
   global (`drugs` → `medications` → `medication_codes` + `linkCode`). En ambulatoria se puede recibir
   **cualquier** medicamento del catálogo (no hay lista curada).
4. **Stock segregado por ámbito:** un mismo medicamento puede tener stock de cada protocolo **y** de
   ambulatoria, contados por separado (requisito GCP/ANMAT).
5. **Declaración de medicación del protocolo: auto-asignación implícita.** En `protocolo`, escanear o
   agregar un medicamento lo asigna solo al protocolo (`protocol_medications`) en el momento de
   recibirlo — el operador no pre-declara nada a mano. El form explícito
   [`AssignMedicationForm`](../../../src/views/pharma/AssignMedicationForm.tsx) queda disponible para
   pre-declarar/curar, pero no es obligatorio.

## Modelo de datos — migración `0035`

Enfoque elegido: **tipo (enum) + `protocol_id` nullable** en recepciones y lotes (descartados: tabla
de ámbito separada — over-engineering; protocolo centinela — contamina `protocols`).

### Enum
```sql
create type public.reception_kind as enum ('protocolo', 'investigacion', 'ambulatoria');
```

### `medication_receptions`
- `+ tipo reception_kind not null default 'protocolo'` (el default backfillea las filas existentes;
  hoy todas son de protocolo).
- `protocol_id` → **nullable** (`drop not null`).
- `CHECK`: `(tipo = 'ambulatoria') = (protocol_id is null)` — ambulatoria ⇔ sin protocolo;
  protocolo/investigacion ⇒ protocolo obligatorio.

### `medication_lots` (ámbito del stock)
- `+ tipo reception_kind not null default 'protocolo'`, `protocol_id` → **nullable**, mismo `CHECK`.
- Unicidad:
  - se **mantiene** `unique (medication_id, protocol_id, lot_number)` (sigue valiendo para filas con
    protocolo; los `NULL` no participan).
  - se **agrega** `create unique index ... on medication_lots (medication_id, lot_number) where
    protocol_id is null` (un lote por (medicamento, lote) en ambulatoria).
  - el `unique (id, medication_id)` que soporta los FK compuestos queda **intacto**.

### Vista `v_medication_stock`
- Gana una columna `tipo` **al final** (compatible con `create or replace`).
- `UNION ALL`: la parte por protocolo de hoy (sobre `protocol_medications`) + una parte de ambulatoria
  (`medications` con lotes de `protocol_id is null`, agrupado por medicamento; `protocol_id` = null,
  `tipo` = 'ambulatoria').
- La [`MedicamentosView`](../../../src/views/pharma/MedicamentosView.tsx) actual **no se rompe**:
  filtra por protocolo y las filas de ambulatoria tienen `protocol_id null` (quedan fuera). Ver el
  stock ambulatorio es un follow-up (fuera de alcance).

### RPC `create_reception` (cambia la firma)
- `drop function if exists public.create_reception(uuid, date, text, jsonb)` y crear:
  `create_reception(p_tipo reception_kind, p_protocol_id uuid, p_reception_date date, p_notes text, p_items jsonb)`.
- Valida coherencia tipo↔protocolo (espejo del `CHECK`).
- **Allow-list solo para `protocolo`/`investigacion`** (cada item debe estar en `protocol_medications`
  del protocolo). En `ambulatoria` **no corre** (catálogo abierto).
- Inserta la recepción con `tipo`. `reception_items` no cambia (multi-lote = varios renglones del
  mismo medicamento con distinto lote; el `unique (reception_id, medication_id, lot_number)` lo banca).
- `grant execute` de la nueva firma a `authenticated`.

### Trigger `apply_reception_stock`
- Copia `new.tipo` y `new.protocol_id` al lote.
- En `ambulatoria` saltea el chequeo de allow-list.
- El `upsert` al lote se ramifica según haya protocolo: con protocolo, `on conflict (medication_id,
  protocol_id, lot_number)`; sin protocolo (ambulatoria), `on conflict` sobre el índice parcial
  `(medication_id, lot_number) where protocol_id is null`.
- `stock_movements` se inserta igual (referencia a la recepción).

### Notas de migración
- Las tablas de Pharma **ya tienen datos** en prod (catálogo + la verificación `TEST-*`): el
  `default 'protocolo'` hace el backfill correcto y los `protocol_id` existentes (no nulos) cumplen
  el `CHECK`.
- Se aplica **a mano** en el SQL Editor de Supabase, después de la `0034` (regla del repo).
- `verify_reception` y `adjust_stock` **no cambian**.

## Wizard de recepción (ramas `protocolo` y `ambulatoria`)

**Dónde vive.** Dentro del submódulo Recepción ([`RecepcionView`](../../../src/views/pharma/RecepcionView.tsx)):
al tocar "Nueva recepción", el **wizard ocupa la pantalla** (la cola se oculta); al crear o cancelar,
vuelve a la cola. Reemplaza y **borra** `NewReceptionModal`. Tokens de Spira Pharma (acento ámbar),
stepper de 4 pasos, micro-interacción estándar.

**La cola se vuelve ámbito-aware.** El selector de arriba pasa de "Protocolo" a **ámbito**: *Farmacia
Protocolo* (+ sub-desplegable de protocolo) o *Farmacia Ambulatoria*, y muestra las recepciones de ese
bucket (para poder verificar también las de ambulatoria). Cada tarjeta de recepción gana un **badge de
tipo**.

**Paso 0 · Setup.** Selector de **tipo (obligatorio)**: Farmacia Protocolo · Producto Investigación
*(deshabilitado, "próximamente")* · Farmacia Ambulatoria. Si es Protocolo → **sub-desplegable de
protocolo obligatorio**. Si es Ambulatoria → sin protocolo. "Siguiente" bloqueado hasta que sea
válido. Se pre-rellena con el ámbito que estaba seleccionado en la cola, pero hay que confirmarlo.

**Paso 1 · Escaneo (contar).** Pistola de código de barras → cada beep **suma 1** a la cantidad de
ese medicamento; lista en vivo abajo con `−/+` y cantidad editable (caja grande sin escanear N veces).
- Código desconocido → panel ámbar `linkCode` (reusado) para asociarlo al catálogo.
- En **protocolo**: escanear/agregar **auto-asigna** el medicamento al protocolo (implícito).
- En **ambulatoria**: catálogo abierto, sin auto-asignar.
- "Agregar a mano" por desplegable como fallback si falla la pistola.

**Paso 2 · Lotes y vencimientos.** Por cada medicamento contado, **un lote por defecto** con la
cantidad total; acción **"dividir en varios lotes"** (lote + vencimiento + subcantidad) para
trazabilidad ANMAT, con un **resto en vivo** que debe cerrar en la cantidad del Paso 1 (si no cierra,
no deja avanzar). El vencimiento es opcional por lote.

**Paso 3 · Resumen + confirmar.** Fecha de recepción + notas + repaso completo de lo que ingresa →
**"Crear recepción"**: arma los `items` planos (un renglón por lote) y llama a `createReception` con
`tipo` + protocolo (o sin protocolo en ambulatoria).

**Navegación.** Atrás/Siguiente por paso; Cancelar vuelve a la cola. Cambiar el tipo en el Paso 0
resetea el estado dependiente (no arrastra renglones de otro ámbito).

## Capa de datos (frontend)

- [`receptions.ts`](../../../src/data/pharma/receptions.ts): `NewReceptionInput` y `ReceptionRow`
  ganan `tipo` (+ `protocol_id` nullable); `createReception` manda `p_tipo`; `useReceptions(tipo,
  protocolId?)` filtra por ámbito.
- [`RecepcionView`](../../../src/views/pharma/RecepcionView.tsx): selector de ámbito; render del
  wizard a pantalla completa en vez de la modal; badge de tipo en la tarjeta.
- **Nuevo** `src/views/pharma/ReceptionWizard.tsx` (con su stepper interno).
- Se **borra** `src/views/pharma/NewReceptionModal.tsx`.
- Reuso intacto: `resolveCode`, `linkCode`, `assignMedicationToProtocol`, `useProtocolMedications`,
  `useMedications`.

## Fuera de alcance (a propósito)

- El flujo de **Producto Investigación** (selector deshabilitado; es su propio ciclo de diseño →
  plan, con el [modelo IP](2026-06-28-pharma-modelo-ip-vs-base-design.md) y sus 5 preguntas abiertas).
- La **vista de stock de ambulatoria** (la `MedicamentosView` sigue por protocolo; ver el stock
  ambulatorio es un follow-up).
- Dispensación (Tajada 2) y DataMatrix del sponsor.

## Verificación

- `npm run typecheck` **verde** (el gate del repo; no hay suite de tests).
- Migración **0035** aplicada **a mano** en prod, después de la 0034.
- Prueba a mano detrás del login (usuario **pharma-leader**) con registros `TEST-*`, en **ambas
  ramas**:
  - **Protocolo:** Paso 0 (tipo+protocolo) → escanear/contar (auto-asigna) → multi-lote que cierra →
    crear → verificar → **el stock del protocolo sube**.
  - **Ambulatoria:** Paso 0 (sin protocolo) → recibir cualquier medicamento → crear → verificar →
    **el stock ambulatorio queda registrado** (sin protocolo), separado del de protocolo.
- Limpieza posterior de los `TEST-*` creados (pendiente heredado del handoff 28/06).

## Preguntas abiertas (para el ciclo del IP, no de esta spec)

Las 5 del [modelo IP](2026-06-28-pharma-modelo-ip-vs-base-design.md): número de kit vs código de
barra, conteo por modo (repetido/único), lote/vencimiento por unidad, dispensación por kit
(Tajada 2), DataMatrix/GS1 (Tajada 1b).

## Referencias

- Wizard previo (corregido acá): [`2026-06-28-pharma-wizard-recepcion-design.md`](2026-06-28-pharma-wizard-recepcion-design.md).
- Modelo IP (ciclo aparte): [`2026-06-28-pharma-modelo-ip-vs-base-design.md`](2026-06-28-pharma-modelo-ip-vs-base-design.md).
- Schema actual: [`0002_tables.sql` §7](../../../supabase/migrations/0002_tables.sql) ·
  [`0032_pharma_catalogo_global.sql`](../../../supabase/migrations/0032_pharma_catalogo_global.sql).
- Capa de datos: [`src/data/pharma/`](../../../src/data/pharma) · Vistas: [`src/views/pharma/`](../../../src/views/pharma).
- Memorias: `pharma-ip-vs-base-modelo`, `pharma-port-plan`, `spira-crear-usuario-y-rol`.
