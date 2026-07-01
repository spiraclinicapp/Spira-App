# Pharma — Producto de Investigación (IP): modelo, recepción y stock

Spec de diseño · 2026-06-30 · **Rama:** `feat/pharma-ip` · **Migración base aplicada:** `0036`.
**Revisada con `/autoplan`** (CEO + Diseño + Ingeniería) el 2026-06-30 — ver §11.

> **Qué es esto.** El diseño cerrado del **Producto de Investigación (IP)** en Pharma: el modelo
> de datos por unidad, su **recepción** (rama nueva del wizard) y su **stock**. Sale de la charla
> de dominio con el Director (que confirmó el flujo real con Pablo) y reemplaza las preguntas
> abiertas del documento de modelo [`2026-06-28-pharma-modelo-ip-vs-base-design.md`](2026-06-28-pharma-modelo-ip-vs-base-design.md),
> que queda como contexto histórico.
>
> **Fuera de alcance (Tajada 2):** la **dispensación por kit** (atar la unidad a paciente/visita
> según randomización, comprobante, lectora de egreso). Se construye después, pero el modelo ya
> nace con las columnas-gancho (nullable) para no reabrir la tabla — ver §3.
>
> **⚠️ Blocker antes de aplicar la 0037:** conseguir un **escaneo real de un kit del sponsor** que
> confirme qué Application Identifier del DataMatrix trae el N° de kit (ver §4bis y §9).

## 1. Resumen

La medicación de base (productos comerciales nombrados, código repetido) ya está modelada y
funcionando: `drugs` → `medications` → `medication_codes` → `protocol_medications` →
`medication_lots` (stock = **cantidad** por lote). El **IP es otro paradigma** y **no** se mete en
ese modelo: se rastrea **unidad por unidad** (una fila por kit), con identidad propia. Esta spec
agrega una entidad nueva (`ip_units`) **sin tocar** la base, una rama de recepción en el wizard, y
una vista de stock por unidad.

## 2. Dominio (cerrado con el Director)

Lo definido en la conversación de diseño, punto por punto:

1. **Todo el IP se rastrea por unidad.** Una fila por kit. **No** hay stock por cantidad para IP
   (vale tanto para el IP de código ciclado como para el de código fijo: confirmado que el fijo
   *también* va unidad por unidad, por accountability ANMAT).
2. **La identidad de la unidad es el N° de kit/medicación** (IVRS/IWRS), un identificador **aparte**
   del código de barra. Se guarda el N° de kit **y** el código crudo escaneado.
3. **El kit es la unidad dispensable** — un solo nivel. No se rastrean sub-unidades (frascos/blisters)
   dentro del kit.
4. **El N° de kit entra por escaneo**, una unidad por beep. El código de cada unidad (DataMatrix
   GS1) trae **kit + lote + vencimiento** juntos → se capturan automáticamente. Esto **acopla el
   parser de la Tajada 1b** a este trabajo (ver §4bis).
5. **El lote y el vencimiento son por unidad** (vienen en el código de cada kit), no un dato de
   envío.
6. **La droga es opcional y por unidad.** Un mismo envío puede traer kits **cegados** (droga
   desconocida, `drug_id = NULL`) y kits de **etiqueta abierta** (droga conocida), para distintos
   pacientes/etapas. La droga del kit abierto se carga **en la recepción, en el momento del escaneo**
   (ver §4).
7. **No hay "revelar" droga.** El kit cegado **se usa cegado** y en el centro nunca se sabe qué era.
   Cuando un paciente pasa a etiqueta abierta, el sponsor **manda medicación nueva, no ciega**, para
   ese paciente: entra como sus propias unidades con la droga ya conocida. El `drug_id` se setea al
   recibir y **no se modifica después** como flujo de dominio. *(Supuesto confirmado para los
   protocolos activos de Pablo; no cubre el unblinding de emergencia — ver §11.)*
8. **El IP no se mapea a un catálogo nombrado.** A diferencia de la base, no hay `linkCode` ni
   `medications`/`medication_codes` para el IP cegado. Si la unidad trae un GTIN de producto, se
   guarda como dato secundario (`gtin`), pero la identidad la da el N° de kit + protocolo.
9. **Un bucket de IP por protocolo.** El centro ve el IP agrupado por protocolo, sin distinguir
   productos/brazos (llega cegado). *(La agrupación por brazo/dosis se evaluó y se difirió — §11.)*

Como la identidad es el N° de kit y siempre se escanea por unidad, el viejo eje *"código fijo vs
ciclado"* **deja de ser un fork del modelo**: toda unidad tiene su fila igual.

## 3. Modelo de datos

Entidad nueva por unidad. La base (`medications` + `medication_lots` por cantidad) **no se toca**.

```sql
-- Estado de la unidad de IP. Extensible: la Tajada 2 usará 'dispensada' al entregar el kit.
create type public.ip_unit_status as enum ('pendiente','en_stock','dispensada','devuelta','baja');

-- Unidades de Producto de Investigación (kits). Una fila = una unidad rastreable.
create table public.ip_units (
  id           uuid primary key default uuid_generate_v4(),
  protocol_id  uuid not null references public.protocols(id) on delete restrict,
  reception_id uuid not null references public.medication_receptions(id) on delete restrict,
  kit_number   text not null check (btrim(kit_number) <> ''),  -- N° de kit/medicación (IVRS)
  raw_code     text,                 -- código crudo escaneado (lo que leyó la pistola)
  gtin         text,                 -- GTIN de producto si vino (secundario; NO mapea a catálogo)
  lot_number   text,                 -- lote (del DataMatrix)
  expiry_date  date,                 -- vencimiento (del DataMatrix)
  drug_id      uuid references public.drugs(id) on delete restrict,  -- droga: opcional/por unidad. NULL = cegado
  status       public.ip_unit_status not null default 'pendiente',
  -- Ganchos de dispensación (Tajada 2). Nullable; se completan al entregar el kit a un paciente.
  -- Se modelan ahora para no reabrir la tabla; la UI de la Tajada 1 los ignora.
  dispensed_to_enrollment_id uuid references public.enrollments(id) on delete restrict,
  dispensed_visit_id         uuid references public.patient_visits(id) on delete restrict,
  dispensed_at               timestamptz,
  created_by   uuid not null references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (protocol_id, kit_number)   -- identidad = N° de kit + protocolo
);
-- Índices de apoyo (el unique ya cubre las queries por protocolo; no se duplica protocol_id suelto).
create index ip_units_reception_idx on public.ip_units (reception_id);  -- lo usa el trigger de verify
create index ip_units_status_idx    on public.ip_units (status);        -- filtro de stock
create index ip_units_expiry_idx    on public.ip_units (expiry_date);   -- filtro por vencimiento
```

Más dos triggers espejo de los patrones del repo (**van en la 0037**, ver §7):
`trg_ip_units_updated_at` (`set_updated_at`) y **`trg_audit_ip_units`** (`audit_row`, insert/update/delete
→ `audit_log`). El de auditoría es **obligatorio**: es lo que sostiene la accountability por unidad.

**Decisiones de modelado (YAGNI explícito):**

- **La unidad cuelga del `protocol_id` directo**, no de un "producto IP" ni de `medications` /
  `protocol_medications`. Como el IP llega cegado, el centro ve **un bucket de IP por protocolo**.
- **Sin flag persistido de "abierto/ciego".** Lo determina `drug_id` por unidad: cargado = abierto,
  `NULL` = cegado.
- **Identidad = `unique(protocol_id, kit_number)`.** El `raw_code` **no** es único (en IP fijo el
  código de producto se repite; el que manda es el N° de kit). El `check (btrim <> '')` evita que un
  parseo fallido meta un kit vacío.
- **Auditoría por `audit_log`** (vía `trg_audit_ip_units`), no por `stock_movements` (su
  `medication_id` es `NOT NULL` y no aplica al IP). Para la recepción, el `INSERT` de las unidades +
  la transición `pendiente→en_stock` en `audit_log` alcanzan. **El libro de movimientos unificado
  (generalizar `stock_movements` o `ip_unit_movements`) se decide al construir la dispensación —
  ver §11.**

**RLS** (Pharma es central — ve todos los protocolos):

- `SELECT` → `has_module('pharma') or has_module('gerencia')`.
- `INSERT` / `UPDATE` → `has_module('pharma')` (**operator+**, igual que `medication_lots` en la 0006).
- `DELETE` → `has_module('gerencia')`.
- `grant select, insert, update on public.ip_units to authenticated` (PostgREST lo exige aunque la
  RLS filtre). La **creación pasa por el RPC `SECURITY DEFINER` `leader+`** (§4), que bypassa la RLS;
  las policies de tabla son la red de fondo y habilitan el `update` de `status` de la Tajada 2.

## 4. Recepción del IP (rama "investigación" del wizard)

El wizard de recepción ya existe (pantalla propia, 4 pasos, ámbito-aware). El ámbito **"Producto
Investigación"** ya está en el `SegmentedControl` del Paso 0 pero **deshabilitado** (`disabled`,
badge "próximamente"): esta spec lo **habilita**. El valor `'investigacion'` ya existe en el enum
`reception_kind` (0035).

- **Paso 0 · Setup.** Quitar `disabled`/badge del ámbito "Producto Investigación"; exige protocolo.
  Bifurca el resto del wizard. **También** hay que sumar el ámbito al `SegmentedControl` de
  [`RecepcionView`](../../../src/views/pharma/RecepcionView.tsx) (hoy solo tiene Protocolo/Ambulatoria),
  para que la cola filtre por IP. Nombre único en los tres lugares: **"Producto Investigación"**.
- **Paso 1 · Escaneo, unidad por unidad.** Campo "Escaneá acá" siempre enfocado, **fuera del scroll**
  (sticky top junto a un **contador "N unidades" fijo**), porque la lista crece 1:1 con los kits
  (puede ser larga: 50–200). Cada beep:
  - el **parser GS1** (§4bis) descompone el string → `{ gtin, kit_number, lote, vto }`;
  - agrega **una fila arriba** (la última escaneada visible sin scrollear), con un **realce ~1.5 s**
    (reusar el patrón `highlight` de `ReceptionCard`) — **sin ×N**;
  - **selector de droga por fila** (typeahead `DrugPicker`, opcional): la farmacéutica etiqueta el
    kit **abierto** ahí mismo, mientras lo tiene en la mano; el cegado queda sin droga;
  - **doble escaneo del mismo kit** → no duplica, avisa sereno. Dedup por `kit_number`; si el parseo
    no dio kit, dedup por `raw_code` y mostrar el `raw_code` en la fila;
  - string que no parsea como GS1 → **fallback deliberadamente incómodo** ("Cargar a mano", un click
    extra) que deja la fila **marcada como carga manual** para auditoría. Nunca es el camino feliz.
- **Paso 2 · Revisión.** Tabla de unidades con N° de kit / lote / vto (prellenados del scan; lote/vto
  editables como **corrección**, vto siempre `<input type="date">`). Repaso y corrección masiva de
  droga: checkbox por fila + "seleccionar las sin droga" + "aplicar droga a las seleccionadas" (abre
  el mismo `DrugPicker`). La fila sin droga muestra un chip **"Cegado"** (neutro, no warning): es un
  estado válido y final, no un campo pendiente. Label del stepper para esta rama: **"Revisión"**.
- **Paso 3 · Resumen + confirmar.** Fecha + notas + **resumen agregado** (total de unidades, cuántas
  con droga / cuántas cegadas, rango de vencimientos / cuántas por vencer) — no listar 200 filas.
  Botón "Crear N unidades…" con estado de submit (disabled mientras crea). → "Crear recepción".

El wizard comparte estado (`ReceptionWizard`): hay que **ramificar por `tipo`** el `STEPS` (label
"Revisión" en IP), el `canAdvance` (IP: Paso 1 válido = ≥1 unidad; Paso 2 siempre válido; Paso 3 =
fecha) y `seedLots` (no aplica a IP). El estado del wizard IP es una lista de **unidades**
(`IpUnitDraft[]`), no el `CountedMed[]` por-cantidad de la base.

### RPCs / trigger

- **`create_ip_reception(p_protocol_id uuid, p_reception_date date, p_notes text, p_units jsonb)`
  → uuid** (nueva, `leader+`, `SECURITY DEFINER`, **atómica**). Cada elemento de `p_units` =
  `{ kit_number, raw_code, gtin, lot_number, expiry_date, drug_id? }` — la **droga viaja por unidad**.
  - **Pre-valida duplicados antes de insertar:** busca en `ip_units` los `kit_number` del lote que ya
    existan en el protocolo; si hay, `raise ... using errcode = 'check_violation'` **listando los
    kits ofensores** (con el passthrough del 23514, el mensaje llega tal cual al operador). Así un kit
    re-registrado no hace rollback ciego de las 200 unidades con un mensaje inútil.
  - Crea la `medication_receptions` (`tipo='investigacion'`, `pendiente`, `received_by = auth.uid()`)
    + una `ip_units` por unidad en estado `pendiente`.
- **`verify_reception(reception_id)` no cambia** (ya hace `pendiente → verificada` con `for update` +
  guarda de doble verificación).
- **Extensión del trigger `apply_reception_stock`** — rama IP **explícita y con `return` temprano**,
  antes del loop de `reception_items` (si no, no ejecuta o rompe):

  ```sql
  if new.status = 'verificada' and old.status is distinct from 'verificada' then
    if new.tipo = 'investigacion' then
      update public.ip_units set status = 'en_stock', updated_at = now()
       where reception_id = new.id and status = 'pendiente';   -- idempotente: solo las pendientes
      return new;   -- NO entra al loop de reception_items ni toca stock_movements
    end if;
    -- ... rama de base actual (0035), sin cambios ...
  end if;
  ```

### Mensajes de error

El kit duplicado sale del RPC como `check_violation` con texto propio que **cita el kit**
(*"Estos N° de kit ya están registrados en el protocolo: KIT-X, KIT-Y"*). Ojo: `pharmaErrorMessage`
para `23505` hoy es genérico y **no** tiene passthrough — por eso el RPC usa `check_violation`
(que sí pasa por el passthrough del 23514), en vez de depender del `23505`.

## 4bis. Parser GS1 (Tajada 1b — ahora en scope) · ⚠️ blocker

Util puro `parseGs1(raw)` en `src/lib/gs1.ts`. Es el **corazón del flujo IP** (de él dependen las 3
columnas autocompletadas + la dedup + el `unique`), así que se especifica con criterios de
aceptación, no como "util trivial":

- **AIs de longitud fija sin FNC1:** `(01)` GTIN = 14 díg., `(17)` vto = 6 díg. — vienen **pegados**
  al siguiente AI. Solo los de longitud variable (`10` lote, `21` serial) terminan en **FNC1 (GS,
  `\x1d`)** o en fin de string. Se necesita la tabla de longitudes fijas de los AIs comunes.
- **Nota operativa:** hay que **configurar el lector 2D para que emita FNC1**; muchos no lo hacen por
  default. Sin FNC1, lote y serial no se pueden separar.
- **`(17)` `YYMMDD` con `DD=00`** = fin de mes (válido en farma) → mapear al último día del mes.
- **Año `YY`** → ventana de pivote ±50 años (no cablear `"20"+YY`).
- **GTIN-14 vs EAN-13 pelado:** un EAN-13 suelto (sin AIs) **no** es GS1 → cae al fallback.
- **Devolver TODOS los AIs parseados** (`Record<ai, value>`), no solo los 4 conocidos, para poder
  **re-mapear `kit_number`** sin re-escanear cuando se confirme el AI real.
- Campos faltantes → `null` (lote/vto editables en el Paso 2).

**⚠️ Blocker:** el AI que trae el N° de kit **no está confirmado** (lo más probable es el serial
`(21)`, pero algunos estudios usan un AI propio `90–99`). Hay que validar con **un escaneo real de un
kit del sponsor antes de aplicar la 0037** — porque el `unique(protocol_id, kit_number)` se aplica
sobre ese campo, y re-mapearlo después puede violar el `unique` retroactivamente (dos filas que
parecían distintas colapsan). Mientras tanto: `kit_number = serial(21)`, se guarda `raw_code` y el
mapa completo de AIs.

## 5. Stock del IP

El stock de IP **no es una cantidad**: es la **lista de unidades en stock**. Vista propia, separada
de `v_medication_stock`.

```sql
create view public.v_ip_units with (security_invoker = true) as
select
  u.id, u.protocol_id, p.code as protocol_code,
  u.kit_number, u.lot_number, u.expiry_date,
  u.drug_id, d.name as drug_name,                                            -- NULL = cegado
  u.status,
  (u.expiry_date is not null and u.expiry_date <  current_date)                              as vencida,
  (u.expiry_date is not null and u.expiry_date >= current_date
                             and u.expiry_date <  current_date + 30)                          as por_vencer
from public.ip_units u
join public.protocols p on p.id = u.protocol_id
left join public.drugs d on d.id = u.drug_id;
```

- `por_vencer` **excluye** las ya vencidas (`>= current_date`), para que no prendan los dos badges.
  El umbral `30` es un literal por ahora; el camino futuro para hacerlo configurable es
  `protocol_alerts` (no se implementa acá).
- `security_invoker` → el rol invocador necesita `SELECT` en `ip_units`, `protocols` y `drugs`.
  **Verificar** que la RLS de `protocols` deje a pharma ver todos los protocolos (Pharma es central);
  si algún rol pharma quedara scopeado por coordinador, el `join` (inner) ocultaría unidades en
  silencio. Confirmar o usar `left join` defensivo.

**UI** (consistente con lo existente): en la vista de stock, el ámbito **"Producto Investigación"**
muestra la **lista de unidades como cards** (mismo patrón `rowCard` que
[`MedicamentosView`](../../../src/views/pharma/MedicamentosView.tsx), **no una `<table>`** densa — lo
prohíbe "Sereno"): una card por unidad con N° de kit (`.spira-mono`, prominente) + lote/vto + chip de
**droga o "Cegado"** + badge de estado/vencimiento a la derecha. Estados obligatorios (reusar
`EmptyState`/`errorBox`, como las vistas hermanas): **loading**, **error + Reintentar**, **vacío**
("Todavía no hay unidades de IP en stock para este filtro."), y el gating de protocolo sin elegir.
Filtros con desplegables (protocolo, estado de vencimiento, droga/cegado) + contador arriba. Con
muchas unidades, el filtro por protocolo es obligatorio (como hoy) para no listar todo. Único texto
libre: buscador por N° de kit.

## 6. Capa de datos y vistas

- `src/data/pharma/ipUnits.ts` (re-exportado desde `data/pharma/index.ts`, patrón barrel):
  hook `useIpUnits()` (lee `v_ip_units`) + `createIpReception()` (RPC). Tipos a mano por fila/input
  citando la 0037. Reusa `pharmaErrorMessage` — recordando que el kit duplicado llega como
  `check_violation` con texto propio (§4), no como `23505` genérico.
- `src/lib/gs1.ts`: parser puro `parseGs1()` (§4bis).
- `src/views/pharma/DrugPicker.tsx`: typeahead **sobre `drugs`** (devuelve `drug_id`), clonando el
  comportamiento visual y de teclado del [`MedicationPicker`](../../../src/views/pharma/MedicationPicker.tsx)
  actual (Enter elige el primero, Escape/click-afuera cierran, foco sobrio). **No** reusar
  `MedicationPicker` tal cual: busca en `medications`, modelo distinto.
- Wizard: extender `Step0Setup` (habilitar ámbito), ramificar `Step1Scan`/`Step2Lots` (o componentes
  IP propios), `Step3Summary` para IP, y ramificar `STEPS`/`canAdvance`/`seedLots` en `ReceptionWizard`.
- Vista de stock: ámbito "Producto Investigación" con la lista de `v_ip_units` (cards + estados).

## 7. Migración

**`0037_pharma_ip_units.sql`** (la última aplicada es la 0036), **idempotente**, aplicada **a mano**
por el Director en el dashboard de Supabase, en orden (regla dura: no hay SQL programático a prod;
migraciones inmutables y numeradas). Contenido:

- enum `ip_unit_status`;
- tabla `ip_units` (con las columnas-gancho de dispensación, `check(btrim(kit_number)<>'')`,
  `unique(protocol_id, kit_number)`, FKs `on delete restrict`) + índices `reception_id` / `status` /
  `expiry_date`;
- **`trg_ip_units_updated_at`** (`set_updated_at`) y **`trg_audit_ip_units`** (`audit_row`);
- RLS (SELECT pharma/gerencia; INSERT/UPDATE `has_module('pharma')`; DELETE gerencia) + grants;
- RPC `create_ip_reception` (con pre-validación de duplicados) + grant a `authenticated`;
- extensión del trigger `apply_reception_stock` (rama `tipo='investigacion'` con `return` temprano);
- vista `v_ip_units`.

El enum `reception_kind` **no** se toca (`'investigacion'` ya existe de la 0035).

## 8. Errores y casos borde

- **Kit duplicado en el protocolo** (re-escaneo o re-recepción): el RPC lo **pre-valida** y aborta
  listando los kits (§4). Es la red de accountability.
- **Doble escaneo en la misma sesión:** dedup en memoria por `kit_number` (o `raw_code` si no hubo
  kit); no agrega fila repetida y avisa.
- **Código que no parsea GS1:** fallback de carga a mano marcado; no se pierde el `raw_code`.
- **Unidad sin droga (cegada):** estado normal, no error; chip "Cegado".
- **Lote/vto faltantes en el código:** editables (corrección) en el Paso 2.
- **Recepción de IP mal cargada:** ver §11 (flujo de baja/corrección — decisión pendiente).
- **Permisos:** crear recepción de IP = pharma `leader+` (RPC); lecturas por RLS (0 filas = sin
  permiso). Las escrituras de la Tajada 1 van por RPC (error explícito, no 0-filas-silenciosas).

## 9. Alcance, secuenciación y riesgos

**Entra en esta spec:** modelo (`ip_units` con ganchos de dispensación nullable), recepción del IP
(rama del wizard + `create_ip_reception` + trigger), stock del IP (`v_ip_units` + UI), y el **parser
GS1** (Tajada 1b).

**Queda para la Tajada 2 (dispensación):** completar los ganchos (`dispensed_to_*`,
`status en_stock → dispensada`) según randomización (IVRS), comprobante, lectora de egreso, y la
decisión del **libro de movimientos unificado** (§11). El modelo ya nace preparado.

**Riesgos:**

- 🔴 **Parser GS1 = blocker** (no "mitigado"): confirmar el AI del N° de kit con un escaneo real del
  sponsor **antes de aplicar la 0037** (§4bis).
- **Hardware:** hace falta un **lector 2D / imager** (no alcanza el láser EAN-13 de la 1a), y hay que
  **configurarlo para emitir FNC1**.
- **Trazabilidad kit→paciente / `kitCode` de Track:** ver §11.
- **Verificación funcional:** detrás del login (pharma-leader, registros `TEST-*`), la hace el
  Director — el preview es una sesión de navegador aparte.

## 10. Referencias

- Modelo de dominio previo (contexto): [`2026-06-28-pharma-modelo-ip-vs-base-design.md`](2026-06-28-pharma-modelo-ip-vs-base-design.md).
- Recepción tipada + wizard (base sobre la que se ramifica): [`2026-06-29-pharma-recepcion-tipos-design.md`](2026-06-29-pharma-recepcion-tipos-design.md) ·
  migración [`0035_pharma_recepcion_tipos.sql`](../../../supabase/migrations/0035_pharma_recepcion_tipos.sql).
- Schema Pharma: [`0002_tables.sql` §7-8](../../../supabase/migrations/0002_tables.sql) ·
  [`0032_pharma_catalogo_global.sql`](../../../supabase/migrations/0032_pharma_catalogo_global.sql) ·
  RLS [`0006_rls_policies.sql`](../../../supabase/migrations/0006_rls_policies.sql).
- `kitCode` legacy de texto libre en Track: [`DispenseModal.tsx`](../../../src/views/track/DispenseModal.tsx).
- Capa de datos / vistas: [`src/data/pharma/`](../../../src/data/pharma) · [`src/views/pharma/`](../../../src/views/pharma).
- Memoria: `pharma-ip-vs-base-modelo`, `pharma-port-plan`.

## 11. Revisión `/autoplan` (2026-06-30) — decisiones y pendientes

Revisión adversarial con tres voces independientes (CEO, Diseño, Ingeniería) + verificación directa
del código. Veredicto: el **modelo de dominio es correcto**; los ajustes fueron de ejecución y de
límites de alcance. Decisiones del Director en el gate:

- **Ganchos de dispensación en la 0037: SÍ** (`dispensed_to_enrollment_id`, `dispensed_visit_id`,
  `dispensed_at`, nullable) — para no reabrir la tabla en la Tajada 2. *(CEO HIGH-1.)*
- **Agrupación por brazo/dosis (`kit_group`): NO por ahora** — se mantiene un bucket por protocolo
  (§2.9). Revisitar si un protocolo activo obliga a distinguir brazos en la farmacia. *(CEO HIGH-2,
  diferido.)*
- **Auditoría: `audit_log` + `trg_audit_ip_units` ahora**; el **libro de movimientos unificado**
  (generalizar `stock_movements` con `medication_id` nullable + `ip_unit_id`, o `ip_unit_movements`)
  se decide al construir la dispensación. *(CEO CRITICAL-3 / Eng M3, diferido con decisión explícita.)*
- **Droga cargada en el escaneo, por fila** (Paso 1), con corrección masiva en el Paso 2. *(Diseño H1.)*

Fixes mecánicos ya incorporados arriba: `return` temprano del trigger (Eng C1), pre-validación de kit
duplicado (Eng H1), RLS a **operator+** (Eng H2), mensaje vía `check_violation` (Eng L5), `por_vencer`
sin solape (Eng M1), `trg_audit`/`trg_updated_at` en la migración (Eng M3/L3), `check` de kit no vacío
+ `on delete restrict` + índices (Eng L1/L2/L4), criterios del parser GS1 + reclasificado blocker
(CEO HIGH-3 / Eng M4), y toda la especificación de UI faltante (Diseño C1/C2/H2/H3/H4/M2/M3/M4/M5).

**Pendientes que NO cierra esta spec (para Pablo / Tajada 2):**

1. 🔴 **Escaneo real del sponsor** que confirme el AI del N° de kit — condición para aplicar la 0037.
2. **Trazabilidad kit→paciente:** es lo que ANMAT audita (Drug Accountability Log) y queda en Tajada 2.
   Gestionar la expectativa: la Tajada 1 sola **no** es entregable a un monitor.
3. **`kitCode` de Track:** hoy `DispenseModal.tsx` captura un "Código de kit" de **texto libre** al
   dispensar. Al construir la dispensación del IP, ese campo debería referenciar `ip_units.kit_number`
   (o documentarse por qué coexisten). Decisión de producto.
4. **Unblinding de emergencia:** el modelo asume que la droga no se modifica tras recibir (§2.7). Si
   algún protocolo permite des-cegar un kit existente, habrá que sumar el flujo (y su asiento de
   auditoría).
5. **Flujo de baja/corrección** de una recepción de IP mal cargada (`status='baja'` + motivo): definir
   en la Tajada 2 o como follow-up chico.
