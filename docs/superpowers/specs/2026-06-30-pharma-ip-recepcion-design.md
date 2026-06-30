# Pharma — Producto de Investigación (IP): modelo, recepción y stock

Spec de diseño · 2026-06-30 · **Rama:** `feat/pharma-ip` · **Migración base aplicada:** `0036`.

> **Qué es esto.** El diseño cerrado del **Producto de Investigación (IP)** en Pharma: el modelo
> de datos por unidad, su **recepción** (rama nueva del wizard) y su **stock**. Sale de la charla
> de dominio con el Director (que confirmó el flujo real con Pablo) y reemplaza las preguntas
> abiertas del documento de modelo [`2026-06-28-pharma-modelo-ip-vs-base-design.md`](2026-06-28-pharma-modelo-ip-vs-base-design.md),
> que queda como contexto histórico.
>
> **Fuera de alcance (Tajada 2):** la **dispensación por kit** (atar la unidad a paciente/visita
> según randomización, comprobante, lectora de egreso). Se dejan ganchos, no se construye acá.

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
   parser de la Tajada 1b** a este trabajo.
5. **El lote y el vencimiento son por unidad** (vienen en el código de cada kit), no un dato de
   envío.
6. **La droga es opcional y por unidad.** Un mismo envío puede traer kits **cegados** (droga
   desconocida, `drug_id = NULL`) y kits de **etiqueta abierta** (droga conocida), para distintos
   pacientes/etapas. La droga del kit abierto se carga **en la recepción**.
7. **No hay "revelar" droga.** El kit cegado **se usa cegado** y en el centro nunca se sabe qué era.
   Cuando un paciente pasa a etiqueta abierta, el sponsor **manda medicación nueva, no ciega**, para
   ese paciente: entra como sus propias unidades con la droga ya conocida. El `drug_id` se setea al
   recibir y **no se modifica después** como flujo de dominio.
8. **El IP no se mapea a un catálogo nombrado.** A diferencia de la base, no hay `linkCode` ni
   `medications`/`medication_codes` para el IP cegado. Si la unidad trae un GTIN de producto, se
   guarda como dato secundario (`gtin`), pero la identidad la da el N° de kit + protocolo.

Como la identidad es el N° de kit y siempre se escanea por unidad, el viejo eje *"código fijo vs
ciclado"* **deja de ser un fork del modelo**: toda unidad tiene su fila igual.

## 3. Modelo de datos

Entidad nueva por unidad. La base (`medications` + `medication_lots` por cantidad) **no se toca**.

```sql
-- Estado de la unidad de IP. Extensible: la Tajada 2 sumará el flujo de dispensación.
create type public.ip_unit_status as enum ('pendiente','en_stock','dispensada','devuelta','baja');

-- Unidades de Producto de Investigación (kits). Una fila = una unidad rastreable.
create table public.ip_units (
  id           uuid primary key default uuid_generate_v4(),
  protocol_id  uuid not null references public.protocols(id) on delete restrict,
  reception_id uuid not null references public.medication_receptions(id) on delete restrict,
  kit_number   text not null,        -- N° de kit/medicación (IVRS) — identidad de dominio
  raw_code     text,                 -- código crudo escaneado (lo que leyó la pistola)
  gtin         text,                 -- GTIN de producto si vino (secundario; NO mapea a catálogo)
  lot_number   text,                 -- lote (del DataMatrix)
  expiry_date  date,                 -- vencimiento (del DataMatrix)
  drug_id      uuid references public.drugs(id),  -- droga: opcional/por unidad. NULL = cegado
  status       public.ip_unit_status not null default 'pendiente',
  created_by   uuid not null references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (protocol_id, kit_number)   -- identidad = N° de kit + protocolo
);
```

**Decisiones de modelado (YAGNI explícito):**

- **La unidad cuelga del `protocol_id` directo**, no de un "producto IP" ni de `medications` /
  `protocol_medications`. Como el IP llega cegado, el centro ve **un bucket de IP por protocolo** y
  no necesita distinguir productos. Si en el futuro hay >1 IP nombrado por protocolo, se agrega una
  etiqueta de agrupación; hoy no.
- **Sin flag persistido de "abierto/ciego".** Lo determina `drug_id` por unidad: cargado = abierto,
  `NULL` = cegado. No hace falta un flag de estudio para esta spec.
- **Identidad = `unique(protocol_id, kit_number)`.** El `raw_code` **no** es único (en IP fijo el
  código de producto se repite; el que manda es el N° de kit).
- **Auditoría por `audit_log` transversal** (inmutable). **No** se usa `stock_movements`: su
  `medication_id` es `NOT NULL` y no aplica al IP. La cadena de accountability ANMAT sale de las
  transiciones de `status` + el `audit_log`.

**RLS** (Pharma es central — ve todos los protocolos):

- `SELECT` → pharma / gerencia (lectura).
- `INSERT` / `UPDATE` → pharma `leader+` (mismo criterio que `medication_lots` / recepciones).
- Sin scope por protocolo (Pharma central).

## 4. Recepción del IP (rama "investigación" del wizard)

El wizard de recepción ya existe (pantalla propia, 4 pasos, ámbito-aware). Se agrega la tercera rama.
El valor `'investigacion'` **ya existe** en el enum `reception_kind` (migración 0035), sin flujo
cableado: esta spec lo cablea.

- **Paso 0 · Setup.** El `SegmentedControl` de ámbito suma **"Farmacia Investigación"** →
  `tipo='investigacion'`, exige **protocolo** (desplegable). Bifurca el resto del wizard.
- **Paso 1 · Escaneo, unidad por unidad.** Campo "Escaneá acá" siempre enfocado. Cada beep:
  - el **parser GS1** descompone el string → `{ gtin (01), kit_number, lote (10), vto (17) }`;
  - agrega **una fila** (un kit) a la lista en vivo — **sin ×N**;
  - **doble escaneo del mismo kit** → no duplica, avisa sereno;
  - string que no parsea como GS1 → fallback para reintentar o cargar el N° de kit a mano
    (excepcional).
- **Paso 2 · Revisión + droga.** Tabla de unidades con N° de kit / lote / vto (prellenados del scan,
  editables). Selector de **droga por fila** (typeahead sobre `drugs`, opcional), con atajo
  **"aplicar a las seleccionadas"** para cuando varias comparten droga. La que no se conoce queda
  cegada (`NULL`).
- **Paso 3 · Resumen + confirmar.** Fecha de recepción + notas + repaso → "Crear recepción".

### RPCs / trigger

- **`create_ip_reception(p_protocol_id uuid, p_reception_date date, p_notes text, p_units jsonb)`
  → uuid** (nueva, `leader+`). Crea la `medication_receptions` (`tipo='investigacion'`, `pendiente`,
  `received_by = auth.uid()`) + una `ip_units` por unidad en estado `pendiente`. Cada elemento de
  `p_units` = `{ kit_number, raw_code, gtin, lot_number, expiry_date, drug_id? }` — la **droga viaja
  por unidad**. El `unique(protocol_id, kit_number)` rebota un kit ya registrado en el protocolo
  (aunque sea de otra recepción) con un `23505` → mensaje sereno *"Ese N° de kit ya está registrado
  en el protocolo"*: accountability gratis.
- **`verify_reception(reception_id)` no cambia** (ya hace `pendiente → verificada`, lo que dispara el
  trigger).
- **Extensión del trigger `apply_reception_stock`:** si `new.tipo = 'investigacion'`, en vez de tocar
  `medication_lots`, marca las `ip_units` de esa recepción `pendiente → en_stock`
  (`update ... where reception_id = new.id and status = 'pendiente'`). La rama de base queda igual.

### Parser GS1 (Tajada 1b, ahora en scope)

Util puro `parseGs1(raw)` (en `src/lib/gs1.ts`) que lee los Application Identifiers separados por
FNC1 — `(01)` GTIN, `(17)` vencimiento `YYMMDD`, `(10)` lote (variable), `(21)` serial (variable).

⚠️ **A confirmar contra un escaneo real del sponsor:** qué AI trae el N° de kit. Lo más probable es
el serial `(21)`, pero algunos estudios usan un AI propio del rango `(90–99)`. Mientras tanto se
mapea `kit_number = serial(21)` y se guarda `raw_code` para poder re-mapear sin perder datos.

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
  (u.expiry_date is not null and u.expiry_date <  current_date)      as vencida,
  (u.expiry_date is not null and u.expiry_date <  current_date + 30) as por_vencer
from public.ip_units u
join public.protocols p on p.id = u.protocol_id
left join public.drugs d on d.id = u.drug_id;
```

**UI** (consistente con lo existente): en la vista de stock, el ámbito **"Investigación"** muestra la
**lista de unidades** (no la tabla por cantidad): N° de kit, lote, vto (badge por vencer / vencido),
**droga o "Cegado"**, estado. Filtros con desplegables (protocolo, estado de vencimiento,
droga/cegado) + **contador de unidades en stock** arriba. Único texto libre: buscador por N° de kit.

## 6. Capa de datos y vistas

- `src/data/pharma/ipUnits.ts`: hook `useIpUnits()` (lee `v_ip_units`) + `createIpReception()`
  (RPC). Tipos a mano por fila/input citando la 0037. Reusa `pharmaErrorMessage` (ya con el
  passthrough del `23514` y el `23505` del kit duplicado).
- `src/lib/gs1.ts`: parser puro `parseGs1()`.
- Wizard: extender `Step0Setup` (tercer ámbito), ramificar `Step1Scan` (modo unidad) y `Step2Lots`
  (por unidad + droga), `Step3Summary` para IP.
- Vista de stock: ámbito "Investigación" con la lista de `v_ip_units`.

## 7. Migración

**`0037_pharma_ip_units.sql`** (la última aplicada es la 0036), **idempotente**, aplicada **a mano**
por el Director en el dashboard de Supabase, en orden (regla dura: no hay SQL programático a prod;
migraciones inmutables y numeradas):

- enum `ip_unit_status`;
- tabla `ip_units` + `unique(protocol_id, kit_number)` + índices de apoyo (`protocol_id`,
  `reception_id`, `status`, `expiry_date`);
- RLS (pharma central);
- RPC `create_ip_reception` + grant a `authenticated`;
- extensión del trigger `apply_reception_stock` (rama `tipo='investigacion'`);
- vista `v_ip_units`.

El enum `reception_kind` **no** se toca (`'investigacion'` ya existe de la 0035).

## 8. Errores y casos borde

- **Kit duplicado en el protocolo** (re-escaneo o re-recepción del mismo N° de kit): el
  `unique(protocol_id, kit_number)` lo rebota (`23505`) → mensaje sereno. Es la red de accountability.
- **Doble escaneo en la misma sesión:** la UI no agrega fila repetida (dedup por `kit_number` en
  memoria) y avisa.
- **Código que no parsea GS1:** fallback de carga a mano del N° de kit; no se pierde el `raw_code`.
- **Unidad sin droga (cegada):** estado normal, no es error; se muestra "Cegado".
- **Lote/vto faltantes en el código:** editables a mano en el Paso 2.
- **Permisos:** crear recepción de IP = pharma `leader+`; lecturas por RLS (0 filas = sin permiso).

## 9. Alcance, secuenciación y riesgos

**Entra en esta spec:** modelo (`ip_units`), recepción del IP (rama del wizard + `create_ip_reception`
+ trigger), stock del IP (`v_ip_units` + UI), y el **parser GS1** (Tajada 1b).

**Queda para la Tajada 2 (dispensación), con ganchos listos:** atar la unidad a paciente/visita
(`status en_stock → dispensada`) según randomización (IVRS), comprobante, y lectora de egreso. El
`status` extensible y el `id` estable de la unidad son el gancho; no se construye acá.

**Riesgos:**

- ⚠️ **Contenido real del DataMatrix del sponsor** (qué AI trae el N° de kit) → confirmar con un
  escaneo real. Mitigado: se guarda `raw_code` y el `kit_number` es re-mapeable.
- **Hardware:** hace falta un **lector 2D / imager** (no alcanza el láser EAN-13 de la 1a).
- **Verificación funcional:** detrás del login (pharma-leader, registros `TEST-*`), la hace el
  Director — el preview es una sesión de navegador aparte.

## 10. Referencias

- Modelo de dominio previo (contexto): [`2026-06-28-pharma-modelo-ip-vs-base-design.md`](2026-06-28-pharma-modelo-ip-vs-base-design.md).
- Recepción tipada + wizard (base sobre la que se ramifica): [`2026-06-29-pharma-recepcion-tipos-design.md`](2026-06-29-pharma-recepcion-tipos-design.md) ·
  migración [`0035_pharma_recepcion_tipos.sql`](../../../supabase/migrations/0035_pharma_recepcion_tipos.sql).
- Schema Pharma: [`0002_tables.sql` §7-8](../../../supabase/migrations/0002_tables.sql) ·
  [`0032_pharma_catalogo_global.sql`](../../../supabase/migrations/0032_pharma_catalogo_global.sql).
- Capa de datos / vistas: [`src/data/pharma/`](../../../src/data/pharma) · [`src/views/pharma/`](../../../src/views/pharma).
- Memoria: `pharma-ip-vs-base-modelo`, `pharma-port-plan`.
