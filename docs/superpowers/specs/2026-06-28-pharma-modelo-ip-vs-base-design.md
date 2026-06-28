# Pharma — Modelo de dominio: medicación de base vs producto de investigación (IP)

> **Qué es esto.** Un documento de **modelo de dominio**, no un plan de implementación. Surge de
> una conversación de diseño (2026-06-28) que destapó que Pharma necesita soportar **dos
> paradigmas** distintos de medicación, y que el modelo actual (migración 0032) cubre solo uno.
> Es la fuente de verdad para decidir, después, la arquitectura de datos y el orden de trabajo.
>
> **Estado:** captura lo definido + las preguntas abiertas. No cierra el schema del IP (faltan
> datos de dominio, marcados abajo). No toca código.

**Fecha:** 2026-06-28 · **Rama:** `feat/pharma-1a` · **Migración base aplicada:** `0032`.

## Por qué este documento

Veníamos a cerrar `linkCode` (asociar un código de barra a un medicamento del catálogo). Al
revisar el flujo real de **recepción**, salieron dos cosas que cambian el fondo:

1. La recepción real es **masiva** y se piensa como un **wizard de pantalla propia**, no un popup.
2. El **producto de investigación (IP)** no encaja en el modelo "catálogo de medicamentos
   nombrados" sobre el que está construido todo Pharma hoy.

El segundo punto **reabre el modelo de datos**. Este doc lo deja escrito antes de construir nada,
para no edificar la recepción de una forma que después choque con el IP.

## Los dos paradigmas

### Medicación de base
Producto **nombrado y conocido** (Atorvastatina 20 mg, Losartán 50 mg…), con **código de barra
repetido** entre unidades (un GTIN por producto). Encaja en el modelo actual:
`drugs` → `medications` (nombre) → `medication_codes` (código→medicamento) → `protocol_medications`
(asignación) → `medication_lots` (stock = cantidad por lote). **Esto es lo que cubre la 0032 / la
"Tajada 1a".** `linkCode` y el catálogo nombrado **aplican acá.**

### Producto de investigación (IP)
La identidad es **código + protocolo**. Tiene reglas propias que el modelo actual **no banca**:

- **El código puede ser repetido o único por unidad**, y eso depende **del kit puntual** (no del
  laboratorio en general). "Fijo" = el mismo código en todas las unidades (se comporta como un
  producto). "Cicla" = cada unidad un código distinto (tipo número de kit/medicación).
- **El nombre/droga es opcional y diferido.** El IP suele llegar **cegado** (solo número/código,
  sin decir qué es). Se puede **conocer después**, si el estudio pasa a **etiqueta abierta** en
  alguna etapa. Es un apartado que se completa cuando se sabe, **igual que el lote y el
  vencimiento** — no un dato fijo al momento de recibir.
- **Lote + vencimiento** se registran, igual que en base.
- **IP de código único:** cada unidad se rastrea **individualmente por su código** — el stock es la
  lista de unidades, no un número. Esto es lo que da sentido a los códigos únicos: trazabilidad
  **kit → paciente** y randomización (IVRS/IWRS). **No** es cantidad agregada.

## Choques con el schema actual (lo que habrá que cambiar)

1. **`medications.name` es `NOT NULL`** ([0002:223](../../../supabase/migrations/0002_tables.sql#L223))
   → no aguanta un IP cegado sin nombre.
2. **El stock es cantidad por lote** (`medication_lots.quantity_on_hand`,
   [0002:233](../../../supabase/migrations/0002_tables.sql#L233)) → no contempla el IP de código
   único, donde cada unidad es una entidad rastreable, no un número.
3. **`medication_codes.code` es único global** ([0032:45](../../../supabase/migrations/0032_pharma_catalogo_global.sql#L45))
   y mapea a **un** medicamento nombrado → no modela un IP cuyo código es único por unidad (cada
   código sería su propia unidad, no un mapeo a catálogo).

## Decisiones tomadas en la conversación

- **El tipo (investigación / base) vive en `protocol_medications.kind`** — fijo por
  medicamento-en-protocolo, transversal a recepción, dispensación, stock y reportes. Requiere
  migración nueva. (Descartado: tipo por recepción o por lote.)
- **La recepción se rediseña como wizard de pantalla propia** dentro del submódulo Recepción que
  ya existe (no popup, no submódulo nuevo). Reemplaza `NewReceptionModal`.
- **El Paso 0 del wizard bifurca el flujo** según el tipo elegido (IP vs base), no solo filtra.
- **`linkCode` y el catálogo nombrado aplican a la base**, no al IP cegado. El spec previo
  [`2026-06-28-pharma-1a-linkcode-design.md`](2026-06-28-pharma-1a-linkcode-design.md) queda
  **absorbido** acá: su panel de asociación es una pieza del flujo de **base**.

## El wizard de recepción (UX ya acordada)

Pantalla propia, cuatro pasos. Fiel a los tokens de Spira (ver mockups de la conversación).

- **Paso 0 · Setup.** Elegir **protocolo** + **tipo** (investigación / base). Bifurca el resto.
- **Paso 1 · Escaneo (contar).** Pistola de código de barras; la lista se arma en vivo.
  - **Base / IP repetido:** cada beep **suma 1** a la cantidad del medicamento; cantidad editable
    con `−/+` (caja grande sin escanear N veces). Si el código no se reconoce → panel ámbar de
    asociación al catálogo (el `linkCode`), que asigna **con el tipo del Paso 0**.
  - **IP único:** cada beep agrega **una unidad rastreable** (un renglón por código); no hay "×N".
- **Paso 2 · Lotes y vencimientos.** Un lote por medicamento, con acción **"dividir en varios
  lotes"** (multi-lote, para trazabilidad ANMAT). Para IP, además, el apartado de **droga/nombre**
  (opcional, si se conoce).
- **Paso 3 · Resumen + confirmar.** Fecha de recepción + notas, repaso de todo, y "Crear
  recepción".

## Direcciones de modelado a evaluar (NO decididas)

Para el IP, a alto nivel, hay que elegir entre (o combinar):

- **Generalizar `medications`:** `name` nullable + `kind`. Sirve para IP cegado **repetido** y para
  base. Problema: el IP de **código único** no puede ser "un medicamento por unidad" (explota el
  catálogo).
- **Concepto separado de "unidad/kit":** para el IP de código único, una entidad por unidad
  (código único + protocolo + lote + vencimiento + estado de ciego + droga opcional), distinta del
  stock-por-cantidad de `medication_lots`. La dispensación de IP único sería **por unidad/código**.

La elección depende de las preguntas abiertas de abajo. **Se resuelve en la fase de arquitectura,
no acá.**

## Preguntas abiertas (a cerrar antes de diseñar el schema)

1. ¿Hay un **número de kit / medicación** (IVRS) **aparte** del código de barra, o el código de
   barra **es** ese identificador?
2. **Conteo por modo:** confirmado repetido = suma, único = una unidad por beep. ¿Algún caso
   mixto?
3. **Lote/vencimiento en el IP único:** ¿varias unidades comparten lote/vencimiento (se cargan una
   vez para el grupo) o cada unidad trae el suyo (p. ej. DataMatrix GS1)?
4. **Dispensación por kit** (Tajada 2): cómo se ata la unidad de IP a la randomización y al
   paciente. Define qué hay que registrar en la recepción para que después cierre.
5. **DataMatrix / GS1** (Tajada 1b): un escaneo trae GTIN + serial + lote + vencimiento juntos →
   podría autocompletar los Pasos 1 y 2 del IP. Relación con este modelo.

## Implicancias de alcance y secuenciación

- La **"Tajada 1a" cubre solo la medicación de base** (catálogo nombrado, ya construido: 0032 +
  capa de datos + vistas). Pendiente de la 1a "de base": sembrado + verificación funcional + el
  panel `linkCode`.
- El **IP es un rediseño fundacional** (schema + capa de datos + wizard con bifurcación). Es más
  grande que la 1a y se **solapa con "medicación de protocolo"** (anotada como Tajada 1b) y con la
  **dispensación** (Tajada 2).
- Camino sugerido (a confirmar): cerrar la base con el modelo actual entrega valor ya; el IP
  arranca como su propio ciclo de diseño → plan, con este doc de base. Documentar **no** obliga a
  un orden; informa la decisión.

## Referencias

- Modelo actual: [`0002_tables.sql` §7 Pharma](../../../supabase/migrations/0002_tables.sql#L215) ·
  [`0032_pharma_catalogo_global.sql`](../../../supabase/migrations/0032_pharma_catalogo_global.sql).
- Capa de datos: [`src/data/pharma/`](../../../src/data/pharma) · Vistas:
  [`src/views/pharma/`](../../../src/views/pharma).
- Spec absorbido: [`2026-06-28-pharma-1a-linkcode-design.md`](2026-06-28-pharma-1a-linkcode-design.md).
- Handoff: [`docs/bitacora/handoff-2026-06-27.md`](../../bitacora/handoff-2026-06-27.md).
- Memoria: `pharma-ip-vs-base-modelo`.
