# Plan de implementación — Rediseño del submódulo Dispensaciones

> Fuente de diseño: `design_handoff_dispensaciones/` (README + `Dispensaciones - Tablero.html` + 6 capturas).
> El prototipo HTML es **referencia de diseño**, no código a portar. La fuente de verdad visual son
> las capturas y los tokens; la fuente de verdad de comportamiento es este plan.

## 1. El problema real

El handoff **no es un rediseño de UI**. Es un cambio del modelo de dominio con una UI nueva encima.

Hoy la dispensación es **un solo paso atómico**: `resolve_dispensation`
(`supabase/migrations/0050_pharma_dispensacion.sql:275`) crea la dispensación en `en_preparacion`,
elige el lote FEFO y la deja `entregada` en la misma transacción. Los estados intermedios existen
en el enum `dispensation_status` desde la `0001` pero **nunca se materializan**.

El rediseño exige cuatro estados persistidos, con trabajo humano y tiempo real entre cada uno.

```
HOY (una transacción)                    OBJETIVO (cuatro estados persistidos)

  solicitada                               solicitada
      │                                        │  [Preparar]
      │ resolve_dispensation()                 ▼
      │   ├── crea dispensations               preparando ◄──┐
      │   ├── FEFO                                │  escaneo │ [Cancelar preparación]
      │   ├── descuenta stock                     │  N ítems │
      │   └── marca atendida                      ▼          │
      ▼                                        lista ────────┘
   atendida                                      │  comprobante N° + FEFO + stock descontado
                                                 │  [Entregar]
                                                 ▼
                                              entregada
                                                 │
                                        (rechazada = rama terminal desde
                                         solicitada o preparando)
```

## 2. Decisiones tomadas (Director, 2026-07-18)

| # | Decisión | Elegido |
|---|---|---|
| D1 | Fraccionamiento | **Dos fases.** F1 = modelo de 4 estados + Kanban + drawer. F2 = alta manual + historial + filtros. |
| D2 | Alta manual desde Pharma | **Con visita**, elegida en el alta. `visit_id` sigue siendo NOT NULL. |
| D3 | Semántica de Rechazar | **Dos acciones separadas.** `Rechazar` sigue terminal con motivo; se agrega `Cancelar preparación` (vuelve a Solicitadas, limpia escaneos). |
| D4 | Stock | **Descontar al marcar lista.** `Entregar` solo sella y fecha. Cancelar desde *Lista* devuelve el stock. |

## 3. Decisiones de diseño derivadas (mías, con su porqué)

### 3.1 El estado *Preparando* vive en `dispensation_requests`, no en `dispensations`

`dispensations.correlative_number` es un `serial` (`0002_tables.sql:302`) — **se consume en el INSERT**.
Si la fila naciera al empezar a preparar, cada preparación cancelada quemaría un número de comprobante
y dejaría huecos en la numeración de la nota fuente. Inaceptable para ANMAT.

**Por lo tanto:** la fila `dispensations` nace **al marcar lista**, con el lote FEFO ya resuelto.
Antes de eso, todo el estado de preparación (incluido el escaneo) vive en la solicitud.

### 3.2 El escaneo se persiste, si no la UI miente

El escaneo de hoy es estado de React que muere al cerrar el modal
(`src/views/pharma/DispensacionesView.tsx:194`). El Kanban muestra `2/3 escaneados` en la card,
fuera del drawer: si no se persiste, el contador es una mentira apenas se recarga la página.
Choca de frente con la regla de honestidad de datos del proyecto.

**Por lo tanto:** `dispensation_request_items` gana `scanned_at` + `scanned_by`.

### 3.3 El descuento de stock se mueve de `entregada` a `lista`

`apply_dispensation_stock` (`0003_functions_triggers.sql:151`) es un trigger AFTER UPDATE que
descuenta al pasar a `entregada`. Con D4 hay que moverlo a `lista` y agregarle la rama inversa
(devolver stock al volver `lista → en_preparacion`).

El trigger de inmutabilidad (`0003_functions_triggers.sql:276`) solo bloquea revertir **desde
`entregada`**, así que `lista → en_preparacion` está permitido. No hay que tocarlo.

### 3.4 Los tokens del repo ganan sobre el handoff

El handoff pide Hanken Grotesk (texto) e IBM Plex Mono (códigos). `src/styles/tokens.css:44` las
descartó explícitamente ("ya no IBM Plex Mono"); el repo usa Inter con `tabular-nums` vía `.spira-mono`.

**No se agregan familias tipográficas nuevas por un submódulo.** Todo lo demás del handoff
(`--ink`, `--primary`, `--paper`, `--pharma-solid`, sombras, radios) ya coincide token a token con
`tokens.css`, solo cambia el prefijo `--spira-`.

Colores de estado del Kanban que **sí** son nuevos y hay que agregar a `tokens.css`:

```
--spira-disp-solicitada: #7C8C87   (= --spira-muted, alias semántico)
--spira-disp-preparando: #3A6B8C   (= --spira-contable)
--spira-disp-lista:      #2E7D74   (= --spira-track)
--spira-disp-entregada:  #4E7A3F   (nuevo)
```

### 3.5 El shell no se toca

Topbar, rail, lista de submódulos y breadcrumb del handoff **ya existen** en `src/shell/AppShell.tsx`.
Cero trabajo ahí. Tampoco hacen falta dependencias nuevas: `Drawer`, `usePopover`, `FilterDropdown`,
`DateNavButton`, `SearchableSelect`, `PrivacyAvatar`, `ScanField` y `Modal` ya están en el repo.

---

## 4. Fase 1 — Modelo de 4 estados + Kanban + drawer

### 4.1 Base de datos

**Dos migraciones, no una.** `ALTER TYPE ... ADD VALUE` no puede usar el valor nuevo en la misma
transacción que lo crea (Postgres da `unsafe use of new value of enum type`). Como las migraciones se
aplican a mano pegando el archivo en el dashboard, meter todo junto **falla al correr**.

#### `0053_dispensacion_estado_preparando.sql` — un solo statement

```sql
alter type request_status add value if not exists 'preparando' after 'solicitada';
```

> Aplicar **sola y primero**. Confirmar que corrió antes de pegar la 0054.

#### `0054_dispensacion_flujo_cuatro_estados.sql`

Contenido, en orden:

1. **Columnas de escaneo** en `dispensation_request_items`:
   `scanned_at timestamptz`, `scanned_by uuid references users(id)`.
   Nullable — las filas legacy quedan sin escaneo, que es la verdad.
2. **Columnas de preparación** en `dispensation_requests`:
   `prepared_by uuid references users(id)`, `preparation_started_at timestamptz`.
3. **`apply_dispensation_stock` reescrita** (`create or replace`): descuenta en
   `* → lista`, devuelve en `lista → en_preparacion`, y **no hace nada** en `lista → entregada`.
   Deja el `stock_movements` correspondiente en ambos sentidos.
4. **Cinco RPCs nuevas**, todas `security definer`, `revoke all from public`,
   `grant execute to authenticated`, con `has_min_role('pharma','operator')`:

| RPC | Firma | Qué hace |
|---|---|---|
| `start_dispensation_preparation` | `(p_request_id uuid) → void` | `solicitada → preparando`. Sella `prepared_by`/`preparation_started_at`. `for update` sobre la solicitud. |
| `scan_dispensation_item` | `(p_request_id uuid, p_code text) → table(item_id uuid, medication_name text, remaining int)` | Resuelve el EAN contra `medication_codes`, lo matchea contra un ítem pendiente, sella `scanned_at`/`scanned_by`. Errores nominativos (ver §4.4). |
| `unscan_dispensation_item` | `(p_item_id uuid) → void` | Deshace un escaneo. Necesario: hoy no hay forma de corregir un escaneo equivocado sin cancelar toda la preparación. |
| `mark_dispensation_ready` | `(p_request_id uuid) → table(dispensation_id uuid, correlative_number int)` | **El corazón.** Exige todos los ítems escaneados; crea `dispensations` (`en_preparacion`), inserta `dispensation_items` con FEFO, pasa a `lista` (descuenta stock), deja la solicitud en `preparando`. |
| `deliver_dispensation` | `(p_dispensation_id uuid) → void` | `lista → entregada` (dispara `set_delivered_at`) + solicitud → `atendida`. |
| `cancel_dispensation_preparation` | `(p_request_id uuid) → void` | Vuelve a `solicitada`: limpia escaneos, y si ya había `dispensations` en `lista`, la revierte a `en_preparacion` (devuelve stock), borra sus ítems y la elimina. |

5. **`resolve_dispensation` NO se borra.** Se deja marcada como deprecada con un `comment on function`.
   Borrarla es una migración aparte, después de verificar que nada la llama.

**Reuso, no reescritura:** el bloque FEFO de `mark_dispensation_ready` es literalmente el de
`resolve_dispensation` (`0050:306-324`), incluido el `for update of ml` y el error explícito cuando
ningún lote cubre solo. No se toca el índice `idx_med_lots_fefo` (`0050:161`) ni las 4 policies RLS
de `patient_medications`.

#### Máquina de estados completa (a embeber como comentario ASCII en la 0054)

```
                       ┌──────────────────────────────────────────┐
                       │  dispensation_requests.status            │
                       └──────────────────────────────────────────┘

   solicitada ──start_dispensation_preparation()──► preparando ──┐
       ▲                                                │        │
       │                                        scan/unscan_     │
       │                                        dispensation_    │
       │                                        item() * N       │
       │                                                │        │
       └──cancel_dispensation_preparation()──────────────┘        │
                (limpia scanned_at, revierte y borra              │
                 la dispensation si ya existía)                   │
                                                                  │
                                          mark_dispensation_ready()
                                                                  │
       reject_dispensation_request()                               ▼
   ────────────────────────────────► rechazada          ┌──────────────────────┐
   (terminal, motivo obligatorio,                       │ dispensations.status │
    desde solicitada o preparando)                      └──────────────────────┘
                                                          en_preparacion
                                                                │ (mismo statement)
                                                                ▼
                                                             lista  ← stock DESCONTADO acá
                                                                │      correlative_number asignado
                                            deliver_dispensation()
                                                                ▼
                                                            entregada  ← solo sella delivered_at
                                                                        (irreversible: trigger 0003:276)
```

### 4.2 Capa de datos — `src/data/pharma/dispensations.ts`

Se **extiende**, no se reescribe. Lo que hay (`REQUEST_COLS`, `useVisitDispensations`,
`createDispensationRequest`, `cancelDispensationRequest`, `rejectDispensationRequest`) queda igual.

Cambios:

- `RequestStatus` suma `'preparando'`.
- `RequestItemRow` suma `scanned_at: string | null` y `scanned_by: string | null`.
- `DispensationRequestRow` suma `prepared_by` / `preparation_started_at`.
- `REQUEST_COLS` suma esos campos al select (no cambia la forma de los embeds).
- `usePharmaDispensations(statuses?)` — **pasarle argumentos de verdad**. Hoy la vista la llama sin
  ninguno y trae todo el histórico de todos los protocolos **sin `.limit()`**
  (`dispensations.ts:99-107`). El Kanban solo necesita los cuatro estados vivos del día; el
  histórico es la Fase 2. Se agrega `.limit()` y filtro por fecha.
- Seis funciones nuevas, una por RPC, con la firma `async (…) => { error, code? }` del patrón del
  archivo, y sus mensajes traducidos vía `pharmaErrorMessage` (`src/data/pharma/errors.ts`).

### 4.3 Frontend

`DispensacionesView.tsx` (313 líneas) se **reescribe**. `RequestRow`, `ResolveModal` y `RejectModal`
desaparecen absorbidos por el Kanban y el drawer. Es una reescritura genuina, no un parche: la lista
vertical de cards y el modal de un paso no sobreviven a un flujo de cuatro estados.

Archivos (todos en `src/views/pharma/dispensaciones/`):

| Archivo | ~Líneas | Qué |
|---|---|---|
| `DispensacionesView.tsx` | 140 | Orquesta: query, filtros, toolbar, board vs drawer. |
| `DispensacionesToolbar.tsx` | 90 | Buscador pill + `FilterDropdown` de protocolo + `DateNavButton` + toggle Historial. |
| `KanbanBoard.tsx` | 70 | Grid de 4 columnas, cabeceras con punto + contador, scroll por columna, vacío. |
| `KanbanCard.tsx` | 110 | La card del handoff §"Card de solicitud", con la jerarquía exacta: nº paciente arriba junto al avatar, nº dispensación abajo junto a las unidades. |
| `DispensacionDrawer.tsx` | 120 | Cabecera + `StepBar` + ruteo por estado al panel correspondiente. |
| `StepBar.tsx` | 40 | Los 3 segmentos (Preparar+escanear / Lista / Entregar). |
| `PanelPreparando.tsx` | 150 | `ScanField` + checklist de ítems + nota FEFO + footer (Rechazar / Cancelar preparación / Marcar lista). |
| `PanelLista.tsx` | 90 | Comprobante teal + nota + ítems con lote real + Imprimir / Entregar. |
| `PanelEntregada.tsx` | 70 | Comprobante verde + ítems + Cerrar / Imprimir. |
| `PanelRechazada.tsx` | 40 | Banner rojo con el motivo + ítems + Cerrar. |
| `ItemRow.tsx` | 60 | Fila de ítem compartida por los cuatro paneles. |
| `ComprobanteImprimible.tsx` | 90 | Hoja del comprobante bajo `@media print` (§6.5.10). |
| `estados.ts` | 40 | **Un solo `STATUS_META`.** Hoy está duplicado en `DispensacionesView.tsx:25-30` y `VisitDispensationPanel.tsx:22-27` — se unifica acá y ambos lo importan. |

`Toast`: el handoff pide toasts inferior-centro. **Verificar primero si el repo ya tiene uno**; si no,
es un componente más en `src/components/`, no dentro de este submódulo.

`VisitDispensationPanel.tsx` (Track): cambio mínimo — mostrar el estado `preparando` en su badge,
importando `estados.ts`. Nada más.

### 4.4 Casos borde que el prototipo ignora

Estos son los que hacen la diferencia entre una demo y algo que aguanta un turno de farmacia:

| Caso | Qué hace el prototipo | Qué hay que hacer |
|---|---|---|
| **Dos farmacéuticas preparan la misma solicitud** | Nada, es single-user | `for update` en `start_dispensation_preparation` + mostrar `prepared_by` en la card cuando no sos vos. |
| **El lote FEFO no cubre la cantidad** | No existe | Ya está resuelto en `0050:324` con un error explícito; hay que **mostrarlo bien** en el drawer, no como error crudo. |
| **Se escanea un EAN que no está en catálogo** | Error genérico | `resolveCode` ya distingue; mensaje: "Ese código de barras no está en el catálogo." |
| **Se escanea el medicamento equivocado** | Error nominativo | Portarlo tal cual: "Ese código es {X}, pero falta escanear {Y}." |
| **Se escanea de más el mismo medicamento** | No contempla `qty > 1` bien | Definir: ¿un escaneo por unidad o uno por renglón? **Recomiendo uno por renglón** (es lo que hace hoy `ResolveModal`) y dejarlo escrito en la nota del drawer. |
| **Escaneo equivocado ya confirmado** | Solo se puede resetear todo | `unscan_dispensation_item` + una X por ítem confirmado. |
| **La medicación se desactiva mientras se prepara** | No existe | `check_dispensation_item_protocol` (`0050:122-128`) ya lo bloquea al insertar los ítems. Traducir ese error a castellano sereno. |
| **Se marca lista y el paciente no viene nunca** | No existe | El stock queda descontado. `cancel_dispensation_preparation` desde *Lista* lo devuelve — el botón tiene que existir en `PanelLista`, no solo en `PanelPreparando`. |
| **Cero solicitudes del día** | "Sin dispensaciones" | Igual, por columna, más un `EmptyState` global si el tablero entero está vacío. |
| **Impresión del comprobante** | `toast('enviado a impresión')` | **No existe backend de impresión.** Ver §6 — no se puede fingir. |

### 4.5 Verificación de Fase 1

No hay suite de tests en el repo; el gate es `npm run typecheck` verde + verificación logueada
en el preview (puerto 5250). Recorrido obligatorio, con datos `TEST-*` creados por la sesión:

1. Solicitud nace en Track (`VisitDispensationPanel`) → aparece en **Solicitadas**.
2. `Preparar` → pasa a **Preparando**, drawer abre con foco en el input de escaneo.
3. Escanear un EAN inválido → error correcto. Escanear el medicamento equivocado → error nominativo.
4. **Recargar la página con 1/2 escaneado** → la card sigue diciendo `1/2`. Este es el test que
   prueba que el escaneo se persistió de verdad.
5. Completar escaneo → `Marcar lista` se habilita → comprobante N° aparece y **el stock del lote bajó**
   (verificar en `MedicamentosView`).
6. `Cancelar preparación` desde *Lista* → **el stock vuelve**, el comprobante desaparece, la solicitud
   vuelve a Solicitadas.
7. Rehacer y `Entregar` → **Entregada**, `delivered_at` sellado, stock **no** vuelve a bajar.
8. Borrar exactamente los registros `TEST-*` creados.

---

## 5. Fase 2 — Alta manual + historial + filtros

Se abre **después** de que la Fase 1 esté mergeada y verificada en prod.

- **Alta manual (D2):** botón `Nueva dispensación` → drawer con `SearchableSelect` de paciente →
  `SearchableSelect` de visita dispensadora del paciente (filtrada por `visit_definitions.dispenses`)
  → ítems desde `patient_medications` **activas** de ese enrollment. Reusa
  `create_dispensation_request` (`0050:169`) sin tocarla, salvo la authz: hoy excluye a Pharma
  (`0050:177-180`), hay que ampliarla en una migración nueva.
  **Nota:** el prototipo ofrece un select libre de medicamentos; acá tiene que ser el candado de
  `patient_medications`, si no el trigger `check_request_item_protocol` (`0050:87-93`) lo rechaza.
- **Historial por días:** vista `.listview` agrupada por día. Necesita paginación real
  (`usePharmaDispensations` sin `.limit()` es una bomba de tiempo a los 2000 registros).
- **Filtros de protocolo y fecha** aplicados server-side, no en cliente.

---

## 6. Lo que queda explícitamente FUERA de alcance

Nombrado para que no se cuele ni se olvide:

- **Generación server-side / PDF del comprobante.** El botón `Imprimir` **sí entra** en Fase 1, vía
  `window.print()` (ver §6.5.10). Lo que queda fuera es el PDF generado en el servidor y el envío a
  una impresora de red sin diálogo. Con `window.print()` la farmacéutica pasa por el diálogo del
  navegador, que es aceptable y no finge nada.
- **Partición de lotes** (cuando ningún lote solo cubre la cantidad). Sigue bloqueando con el error
  explícito de `0050:324`.
- **Realtime.** El handoff no lo pide; el tablero se refresca al mutar. Suscripción realtime sobre
  `dispensations` es una mejora posterior.
- **Escaneo por unidad** (vs. por renglón).
- **Borrar `resolve_dispensation`.** Migración aparte, después de confirmar cero llamadas.

---

## 6.5 Especificación de diseño (lo que el mock no dibuja)

El handoff resuelve el visual en reposo. Esto cubre lo demás. **El mock manda en todo lo visual;
esto solo agrega lo que no está especificado.**

### 6.5.1 Escaneo diseñado para el hardware, no para el mouse

Un escáner de código de barras es un teclado que tipea rápido y manda `Enter`. Si el foco se
pierde, el escaneo se pierde o se escribe en otro campo. En alto volumen eso pasa decenas de
veces por turno.

- **Foco pegajoso:** el input de escaneo recupera el foco solo al perderlo (`onBlur` → refocus),
  salvo que el foco haya ido a un control real del drawer (botón, otro input).
- **Captura global dentro del drawer:** una tecla imprimible con el drawer de *Preparando* abierto
  redirige al input de escaneo aunque el foco esté en otro lado. La farmacéutica puede escanear
  sin mirar la pantalla.
- **`Drawer.tsx:39` enfoca el primer focusable**, que es el ✕ del header. Hay que pasarle un
  `initialFocusRef` o equivalente para que el drawer de *Preparando* arranque en el input.
- Respetar `prefers-reduced-motion` y no robar el foco cuando hay un diálogo de error abierto.

### 6.5.2 Nada de estado por color solo (WCAG 2.1 AA)

El indicador `n/total escaneados` del mock es azul si incompleto y verde si completo. Color solo.
Es la misma falla que ya se corrigió en el rediseño de Medicamentos.

**Fix:** el color se mantiene (lo pide el mock) **más** un ícono de forma distinta —
código de barras mientras falta, check cuando está completo — más el texto `1/2` que ya está.
Tres señales, no una. Aplica igual al badge de estado del historial: punto de color **+** etiqueta.

### 6.5.3 Ningún botón deshabilitado mudo

`Marcar lista para retirar` gris sin explicación obliga a pensar. Debajo del botón, en `muted`
12.5px, el motivo concreto:

- 1 ítem pendiente → `Falta escanear Lierbron 400/12 mcg`
- 2+ pendientes → `Faltan 2 ítems por escanear`
- Habilitado → el texto desaparece

Mismo criterio en `Crear y preparar` (Fase 2): `Ingresá el código de paciente` / `Agregá al menos
un medicamento`.

### 6.5.4 Jerarquía de las dos acciones negativas

`Rechazar` (terminal, con motivo, queda en el audit_log) y `Cancelar preparación` (reversible)
no pueden tener el mismo peso.

```
┌─ footer del drawer (Preparando) ──────────────────────────┐
│                                                            │
│  Rechazar        Cancelar preparación   [ Marcar lista ]   │
│  ↑ texto plano   ↑ outline              ↑ sólido ámbar     │
│    muted, sin        (reversible)         (avanza)         │
│    borde                                                   │
│  ↑ lo más terminal = lo menos prominente                   │
└────────────────────────────────────────────────────────────┘
```

`Rechazar` abre confirmación con motivo obligatorio (ya existe). `Cancelar preparación` también
confirma **si ya se marcó lista**, porque devuelve stock.

### 6.5.5 Dos zonas de click en una card

La card entera abre el drawer y el CTA hace `stopPropagation`. Un click 2px afuera del botón hace
algo distinto — en apuro es un error recurrente. Mitigaciones, sin cambiar el layout del mock:

- El CTA ocupa el ancho completo del pie de la card (ya lo hace el mock) con alto mínimo **40px**.
- Al hover del CTA, la card **no** toma su hover de elevación: solo se resalta el botón. Deja claro
  que son dos objetivos.
- El resto de la card lleva `cursor: pointer`; el botón, su propio `:focus-visible`.
- Tab llega primero a la card (`role="button"`) y después al CTA; ambos accionables con Enter.

### 6.5.6 Estados de carga y vacío

| Situación | Qué se ve |
|---|---|
| Cargando el tablero | Esqueleto: las 4 columnas con su cabecera real y 2 cards fantasma en `--spira-surface`. Nada de texto "Cargando…" ni spinner centrado. |
| Columna vacía, tablero con datos | `Sin dispensaciones` centrado en `--spira-faint`, como el mock. Sin ícono: cuatro `EmptyState` con círculo serían ruido. |
| Tablero entero vacío | Un solo `EmptyState` (el del repo) reemplazando la grilla: "Sin dispensaciones hoy", con el botón `Nueva dispensación` como acción. |
| Búsqueda/filtro sin resultados | `Sin resultados para "{q}"` + acción `Limpiar filtros`. Distinto de "no hay nada", que es otra cosa. |
| Error de carga | Caja de tinte danger con el mensaje sereno + `Reintentar`. |

### 6.5.7 Toast: componente nuevo, on-brand

No existe en el repo ni en DESIGN.md. Va a `src/components/Toast.tsx`, no dentro del submódulo.

- Inferior-centro, fondo `--spira-ink`, texto `--spira-paper`, radio `--spira-radius-md`,
  sombra `--spira-shadow-lg`, ícono de check en `--spira-good`. Autooculta a 2.4s.
- **`role="status"` + `aria-live="polite"`** — si no, la confirmación de que se generó el
  comprobante N° 1044 es invisible para un lector de pantalla.
- Entrada/salida de 0.15s, sin bounce (DESIGN.md: movimiento corto que se asienta).
- Pausa el autoocultado al hover.

### 6.5.8 Responsive

La farmacéutica trabaja en desktop, pero el ancho no está garantizado. En la captura a 1280px los
nombres de medicamento ya ocupan tres líneas.

| Ancho | Comportamiento |
|---|---|
| ≥1440px | 4 columnas `1fr`, como el mock. |
| 1100–1439px | 4 columnas, `min-width: 240px`, scroll horizontal del tablero si no entran. Las columnas **no** se comprimen más allá de eso: una card ilegible es peor que un scroll. |
| <1100px | Vista de historial por defecto (Fase 2). El Kanban de 4 columnas no funciona; forzarlo sería fingir. |

El alto es `100vh` sin scroll de página: el scroll vive en las columnas y en el drawer.

### 6.5.9 Riesgos de diseño aceptados por el Director (2026-07-18)

Documentados para que nadie los "arregle" por su cuenta más adelante:

- **Colores de estado fieles al mock.** `Preparando #3A6B8C` y `Listas #2E7D74` coinciden con los
  acentos de Contable y Track. Consecuencia: teal y azul significan cosas distintas según la
  pantalla. Decisión tomada a favor de la fidelidad al mock.
- **Rechazadas solo en el historial.** El tablero tiene 4 columnas y 5 estados. Una solicitud
  rechazada sale del tablero del día; se encuentra cambiando a la vista historial.

### 6.5.10 Impresión del comprobante (`window.print()`)

El comprobante **es la nota fuente**: se imprime, se sella y se firma con la medicación al momento
del retiro, y va a la carpeta del paciente. No es un adorno de la UI, es un documento regulatorio.
Por eso la hoja impresa se diseña, no se deja que el navegador imprima la pantalla.

**Componente:** `ComprobanteImprimible.tsx`, renderizado dentro de `PanelLista` y `PanelEntregada`,
oculto en pantalla (`display: none`) y visible solo bajo `@media print`. El resto de la app
(shell, rail, drawer, scrim) se oculta en print.

**Contenido de la hoja** — A4 vertical, una dispensación por hoja:

```
┌──────────────────────────────────────────────────────────┐
│  (vilano)  Spira · Fundación Scherbovsky                 │
│            Farmacia de investigación                      │
│                                                           │
│  COMPROBANTE DE DISPENSACIÓN            N° 1044          │
│  ────────────────────────────────────────────────────    │
│  Paciente   P-188          Protocolo   ACT18301          │
│  Solicitud  D-1041         Origen      Coordinación      │
│  Fecha de entrega  17/07/2026                            │
│                                                           │
│  MEDICACIÓN ENTREGADA                                     │
│  ────────────────────────────────────────────────────    │
│  Alvetide 92/22 mcg                                       │
│    lote TEST01 · vence 03/2027 · 1 u.                    │
│                                                           │
│  ────────────────────────────────────────────────────    │
│  Dispensó                     Retiró                      │
│                                                           │
│  ______________________       ______________________      │
│  aclaración y sello           aclaración y firma          │
└──────────────────────────────────────────────────────────┘
```

**Reglas:**

- **Identificación por código IVRS, nunca por nombre.** La política de privacidad de paciente es
  transversal (`components/PrivacyAvatar.tsx`) y el código es el identificador válido en la carpeta.
- **Lote y vencimiento del snapshot**, no del lote vivo: `dispensation_items.lot_number` y
  `expiry_date` se copian justamente para que el comprobante impreso no cambie si el lote se
  modifica después (`0002_tables.sql:311-313`).
- **Espacio de sello y firma obligatorio.** Es el punto del documento.
- Negro sobre blanco, sin fondos ni acentos de color: la paleta Sereno es para pantalla. Se imprime
  en una láser monocromo.
- Sin `position: fixed` ni sombras (el navegador las ignora o las imprime feo).
- El botón `Imprimir` llama a `window.print()` y nada más. **No cambia el estado** de la
  dispensación: imprimir no es entregar, y se puede reimprimir cuantas veces haga falta.

**Verificación:** imprimir a PDF desde el navegador y revisar que entre en una hoja, que no salgan
el rail ni el drawer, y que el N° de comprobante y los lotes coincidan con la pantalla.

## 7. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| `ALTER TYPE ADD VALUE` falla si se pega junto con el resto | **Alta** — la migración no corre | Dos archivos separados (§4.1), aplicar la `0053` sola y confirmar. |
| Mover el descuento de stock de `entregada` a `lista` rompe datos legacy | **Alta** | El cambio es en el trigger, no retroactivo: las filas ya `entregada` no se re-procesan. Verificar contra `stock_movements` en el preview antes de dar por buena la migración. |
| Reescritura de `DispensacionesView` con el Director trabajando en paralelo | Media | Rama `feat/pharma-dispensacion` ya activa; stagear **por ruta**, nunca `git add -A`. |
| El submódulo tiene hoy trabajo sin commitear (0052 + `HistorialMedicacionModal`) | Media | **Commitear y mergear eso primero**, antes de empezar. Ver `git status`. |
| Estimar el Kanban como "solo CSS" | Media | Son ~1000 líneas de TSX nuevas y 6 RPCs. No es una tarde. |

---

## 8. Orden de ejecución

```
  0. Cerrar lo pendiente: commitear 0052 + HistorialMedicacionModal, mergear.
     │
  1. 0053 (enum) ──► aplicar en prod ──► confirmar ──► registrar en supabase/README.md
     │
  2. 0054 (columnas + trigger + 6 RPCs) ──► aplicar ──► registrar
     │
  3. Capa de datos: dispensations.ts + estados.ts (unifica el STATUS_META duplicado)
     │
  4. UI: KanbanBoard/Card ──► Drawer + 4 paneles ──► Toolbar
     │
  5. typecheck verde + recorrido §4.5 logueado en el preview
     │
  6. PR de Fase 1 ──► el Director mergea
     │
  7. Fase 2 (§5) arranca sobre main
```

## GSTACK REVIEW REPORT

| Run | Status | Findings |
|---|---|---|
| plan-eng-review (2026-07-18) | issues_found | 4 decisiones de dominio elevadas al Director (faseo, alta manual con visita, semántica del rechazo, momento del descuento de stock). 3 hallazgos de schema no evidentes desde el mock: `correlative_number` es `serial` (huecos si la fila nace temprano), escaneo no persistido (la card mentiría al recargar), `ALTER TYPE ADD VALUE` no usable en la misma transacción (obliga a partir en 0053 + 0054). |
| plan-design-review (2026-07-18) | issues_found | 11 hallazgos. 3 elevados como decisión (colisión cromática, dónde viven las Rechazadas, foco del escáner). 8 resueltos en el plan (§6.5): color-solo WCAG, botón deshabilitado mudo, jerarquía de acciones negativas, doble zona de click, carga/vacío, Toast on-brand con `aria-live`, responsive, `Drawer.tsx:39` enfoca el ✕ en vez del input. |

**Mockups:** no generados, deliberadamente. Existe un mock hifi aprobado (`design_handoff_dispensaciones/`) y CLAUDE.md prohíbe implementar desviándose de un mock existente. Generar variantes habría trabajado contra una decisión ya tomada.

**Rating de diseño:** 6/10 al abrir el review → 9/10 al cerrarlo. No llega a 10 por los dos riesgos aceptados de §6.5.9, que son decisión explícita del Director, no omisiones.

**VERDICT: APROBADO PARA IMPLEMENTAR**, condicionado a los dos bloqueos operativos de abajo. Sin objeciones de arquitectura ni de diseño pendientes.

**Cierre de bloqueos (2026-07-18):** el trabajo sin commitear del submódulo quedó commiteado en
`feat/pharma-dispensacion`; la implementación arranca en rama propia. El botón `Imprimir` entra en
Fase 1 con `window.print()` y hoja de estilos dedicada (§6.5.10).

NO UNRESOLVED DECISIONS
