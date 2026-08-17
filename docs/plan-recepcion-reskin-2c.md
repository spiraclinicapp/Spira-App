# Plan · Recepción — reskin "2c"

**Handoff:** [`design_handoff_recepcion_2c/`](design_handoff_recepcion_2c/) (copiado al repo el 2026-08-16;
referencia principal: `Recepcion - Submodulo 2c.html`).
**Origen:** el Director reportó que la pantalla "no se entendía bien qué era".
**Revisado con:** `/plan-eng-review` — 11 decisiones cerradas, listadas abajo.

---

## Qué ya existe (no se reconstruye)

`RecepcionView.tsx` (434 líneas) ya resuelve la mayor parte de lo que el handoff describe:

| Pieza del handoff | Estado |
|---|---|
| Buscador, chips de ámbito, rango 7/30, "Más filtros" | ✅ existe, y "Más filtros" es **más completo** que el mock (protocolo · medicamento · desde/hasta) |
| Agrupación por día con daybar | ✅ existe (`groupByDay`) |
| Tabla de renglones, las 6 columnas exactas | ✅ existe, con severidad de vencimiento derivada (`estadoFromExpiry`) |
| Botón Verificar con gating `pharma:leader` | ✅ existe (RPC `verify_reception`) |
| Card sin renglones para IP | ✅ existe (`total_kits`) |
| Highlight de la recepción recién creada | ✅ existe, y el mock no lo contempla — **se conserva** |

**El reskin es reorganización visual de la card**, no una feature nueva. Lo que sí es nuevo son
dos datos que el mock muestra y la base no tiene (folio y nombre del verificador).

---

## Decisiones cerradas (no re-discutir)

| # | Decisión |
|---|---|
| **D1** | **El folio es real**: columna `folio` con secuencia + backfill. Nada de derivarlo del uuid. |
| **D2** | **`verified_by_name` desnormalizado**, sellado por el trigger de verificación. La RLS de `users` es `id = auth.uid() or has_module('gerencia')`: un join deja a la farmacéutica sin nombre y **la cuenta de QA no lo reproduce** porque tiene gerencia. |
| **D3** | **Dos grupos de chips**: un toggle "Pendientes" (estado) + los cuatro de ámbito, **conservando Investigación**. El mock los mezclaba en un radiogroup y borraba Investigación. |
| **D4** | **Scroll horizontal, no colapso de columnas.** Revierte la sugerencia del handoff: en una vista auditable no se esconde un dato por el ancho de la ventana. La decisión ya estaba tomada y comentada en el código. |
| **A1** | **Sin hora inventada.** `reception_date` es `date`. La fecha va sola; `created_at` puede mostrarse aparte y rotulado **"Cargada"**, nunca como hora de llegada. |
| **A2** | **Tabla HTML real** (`table-layout: fixed`) + **una sola constante** con los seis anchos y sus alineaciones, consumida por los `<col>`, los `<th>` **y los `<td>`**. ⚠️ **Revisada el 2026-08-17:** el encabezado del documento ya **no** comparte esta grilla — ver G9. |
| **G9** | **El encabezado se compone solo; no imita una fila de tabla.** La primera versión alineaba el folio con "Medicamento" y la fecha con "Código", como pedía el handoff. Alineaba al píxel y **hacía ruido igual**: son dos sistemas peleando en la misma franja —uno identifica un documento, el otro enumera renglones—, y alinearlos no los une, los superpone. |
| **G10** | **La tabla: seis columnas iguales, todo centrado.** Se llegó después de tres intentos de emparejar los huecos moviendo porcentajes. El motivo de que ninguno cerrara: **ese hueco se mide dos veces y da distinto** —el título decía "MEDICAMENTO" (93px) y el dato "Salbutral 100 mcg" (187px), los dos anclados al MISMO borde—, así que emparejar los títulos desemparejaba los valores. Barridas 121 combinaciones, la suma de ambos errores nunca bajó de ~70px. Con seis columnas iguales y todo centrado los ejes quedan equiespaciados **por construcción** (medido: 214 × 5) y el sobrante de cada columna se reparte mitad y mitad a cada lado. |
| **G11** | **Ficha de procedencia en grilla de dos columnas.** Ámbito arriba, fecha abajo, la barra de color abarcando las dos (toma su alto de `align-items: stretch`, no de un valor fijo). Las dos etiquetas comparten tamaño y peso; sólo cambia el color, que en el ámbito codifica el origen. Medido: etiquetas y valores terminan cada par en el mismo eje. **Sin protocolo (ambulatoria) el ámbito ocupa las dos columnas**: una celda de menos corría toda la grilla y "Recibido" trepaba al lado del ámbito — se veía bien en las cards con protocolo y mal en la ambulatoria. |
| **A3** | **El resumen se muestra siempre**, cambiando el verbo: pendiente → "trae N medicamentos · M unidades"; verificada → "N medicamentos · M unidades **ingresadas**". |
| **C1** | **Colores del handoff**: protocolo → `--spira-primary` (petróleo), investigación → `--spira-pharma-solid` (ámbar), ambulatoria → `--spira-contable` (azul). Hoy están cruzados y protocolo tiene letra ámbar sobre fondo petróleo. |
| **C2** | **Extraer a `views/pharma/recepcion/`**, igual que `dispensaciones/`. Mover primero, agregar después: dos commits. |
| **T1** | **Tests de los derivados nuevos + los dos que ya corren sin cobertura** (`estadoFromExpiry`, `groupByDay`). |
| **P1** | **Techo + aviso**, reusando el patrón `TECHO_FILAS`/`truncado` de `reports.ts`. |

**Sin decidir, resuelto por defecto** (avisá si preferís otra cosa): la barra ambulatoria va **sin
código** (ambulatoria es `protocol_id IS NULL`; el "AMB-2291" del mock no existe), y la nota de la
card IP usa **`storage_location`** en lugar de la "excursión de temperatura" del mock, que no tiene
campo detrás.

### Decisiones de diseño (`/plan-design-review`)

| # | Decisión |
|---|---|
| **G1** | **Verificar pide confirmación y avisa después.** Un diálogo corto que resume qué va a ingresar ("van a entrar 2 medicamentos · 15 unidades a stock") + `Toast` al confirmar, el mismo de Dispensaciones. La acción **es irreversible** ([verify_reception](supabase/migrations/0032_pharma_catalogo_global.sql:279) rechaza la segunda vez) y el reskin la hace más prominente: la red va con ella. |
| **G2** | **Tema oscuro con `--spira-acc-deep-*`.** La banda pendiente usa `--spira-acc-deep-warn`; se crea **`--spira-acc-deep-good`** con su valor aclarado para oscuro. **Nada de `--warn-ink`/`--good-ink`**: un `color-mix` con `ink` es invisible al invertir el tema, que es exactamente el problema que esa familia de tokens ya resuelve. |
| **G3** | **Inter y `.spira-mono`.** Se conserva Schibsted Grotesk para los display (el mock ya lo pide bien). **No se cargan** Hanken Grotesk ni IBM Plex Mono: la tipografía es identidad de marca y un submódulo no la cambia. |
| **G4** | **El error de verificación va en la card**, en el lugar del texto de contexto de su banda, con el botón otra vez disponible. Hoy va a un box en el tope de la lista, que puede quedar fuera de pantalla. |
| **G5** | **Banda de tres elementos**: rótulo de estado · resumen · botón **a 38px** (el alto del sistema; el mock pedía 30). Se saca "La medicación todavía no entró a stock", que repite lo que el rótulo ya dice. |
| **G6** | **Las dos celdas del encabezado llevan rótulo: RECEPCIÓN y RECIBIDO.** Revierte la primera versión, que los sacaba los dos. El motivo es que en la card conviven **dos fechas** — *recibido* (cuándo llegó la mercadería) en el encabezado e *ingresada a stock* en la banda —, y **pueden ser días distintos**, porque el pedido queda apoyado hasta que alguien lo cuenta. Con eso, el rótulo deja de ser decoración y pasa a ser desambiguación, que es lo que `DESIGN.md` sí permite: *"las MAYÚSCULAS con tracking son para rótulos puntuales, nunca un eyebrow decorativo"*. Decisión del Director, 2026-08-17. |
| **G8** | **Sin barra de color a la izquierda del folio.** El mock la ponía (`border-left: 3px solid`) y sale por pedido del Director. **Al sacarla hay que devolver el `padding-left` a 20**: estaba en 17 justamente para compensar los 3px del borde, y dejarlo corría el folio y rompía la alineación con "Medicamento". La barra del **ámbito**, a la derecha, se mantiene: esa sí codifica un dato. |
| **G7** | **El encabezado alinea por la base, no por el centro.** Con rótulo en una celda y no en la otra, centrar cada una dejaba el folio flotando 3px sobre la fecha. Pegadas abajo con el mismo padding inferior, las bases coinciden. El bloque de origen se centra aparte: no tiene línea base que alinear. |

### Estados de la card

| Estado | Qué ve el usuario |
|---|---|
| **Pendiente** | Banda ámbar (`acc-deep-warn`) · rótulo · resumen "trae N medicamentos · M unidades" · botón "Verificar e ingresar a stock" (38px) |
| **Verificando** | Botón en "Verificando…", deshabilitado. El resto de la card intacto. |
| **Error** | La banda conserva el ámbar y el mensaje **reemplaza al resumen**; el botón vuelve a estar disponible. Sin recuadro en el tope de la lista. |
| **Verificada** | Banda verde (`acc-deep-good`) · "Ingresada a stock por {nombre} · {fecha hora}" · resumen "N medicamentos · M unidades ingresadas" · sin botón |
| **IP sin renglones** | Igual, y en lugar de tabla la nota con `storage_location` |
| **Lista vacía / filtrada** | `EmptyState` ya existente, con los dos textos que ya distinguen "sin recepciones" de "nada con esos filtros" |
| **Cargando** | `EmptyState` "Cargando… / Un momento." (unificado en la v0.36.1) |

### Accesibilidad — resuelto sin pregunta

- La card **no** es clickeable: el único control es el botón, así que el orden natural del DOM ya da un recorrido correcto por teclado. No se agrega `tabindex`.
- Cada `<table>` lleva `aria-label` con el folio ("Renglones de la recepción Nº 1043"), para que el lector de pantalla distinga una de otra en una lista de cuatro.
- El color **nunca es el único portador**: el estado lleva rótulo en texto, el ámbito lleva su nombre al lado de la barra, y el vencimiento ya combina forma + color vía `ESTADO_CFG`.
- `--spira-acc-deep-good` se verifica ≥ 4.5:1 sobre el tinte verde **en los dos temas** antes de fijarlo.

---

## Estructura de la card

```
┌─────────────────────────────────────────────────────────────────────┐
│ ● PENDIENTE DE VERIFICAR   La medicación todavía no      [✓ Verificar│ ← banda (c-bar)
│                            entró a stock.  trae 2 med · 9 u.  e ingresar]│
├──────────────┬───────────────────┬──────┬─────────┬──────────┬──────┤
│▎RECEPCIÓN    │ INGRESADA         │      │         │ ▎Protocolo│      │ ← header (grid)
│ Nº 1043      │ 22 jul 2026       │      │         │ ▎EFC18420 │      │
├──────────────┼───────────────────┼──────┼─────────┼──────────┼──────┤
│ MEDICAMENTO  │ CÓDIGO / EAN      │ LOTE │ VENCE   │ LABORAT. │ CANT.│ ← thead
│ Trelegy…     │ 7795373012288     │ TRE… │ ⚠ 30 jun│   GSK    │  4 u.│
└──────────────┴───────────────────┴──────┴─────────┴──────────┴──────┘
  29%              16%               12%    15%       16%        12%
  └──────────────── UNA constante compartida por header y <col> ───────┘
```

El header **no** es un flex: es un `grid` con las mismas seis columnas que la tabla. Si los
porcentajes viven en dos lugares, la alineación se rompe en el primer retoque y nadie se entera
(A2 existe justamente para eso).

## Flujo de datos

```
useReceptions(tipo)            ← + .limit(TECHO_FILAS) y conteo (P1)
   │  select: ... folio, verified_by_name, items(... codes(code, code_type))
   ▼                                   ↑ nuevos          ↑ nuevo (qualifier "interno")
filtros client-side  ──► coincideBusqueda(r, q)   ◄── + EAN, + folio   [PURO, test]
   │                     estado (D3) · ámbito · rango · Más filtros
   ▼
groupByDay ──► totalesDelDia(rows)  "2 recepciones · 24 unidades"      [PURO, test]
   │
   ▼
ReceptionCard
   ├── banda   ◄── resumenContenido(r)  verbo según estado (A3)        [PURO, test]
   ├── header  ◄── folio · fecha (sin hora, A1) · barra de ámbito (C1)
   └── tabla   ◄── estadoFromExpiry(it.expiry_date, hoy)               [PURO, test]
```

---

## Migración (una sola, aditiva)

`0085_recepcion_folio_y_verificador.sql`:

1. `folio` — secuencia + `not null` tras backfill por `created_at` (el orden de carga es el único
   criterio defendible: `reception_date` puede repetirse y es retroactivo).
2. `verified_by_name text` — desnormalizado, sellado en el trigger `set_reception_verified` que ya
   corre al pasar a `verificada`. Las verificadas viejas se backfillean desde `users` **dentro de la
   migración** (corre como owner, la RLS no aplica).

**Orden de despliegue: migración PRIMERO.** Es puramente aditiva — dos columnas escalares que
ningún front desplegado consulta —, así que el que no funciona sin ella es el front nuevo.
**No agrega ninguna FK**, así que no toca el embed de PostgREST (el incidente de la 0076).

Al confirmar el Director que está aplicada: registrarla en `supabase/README.md` y actualizar el
número en `CLAUDE.md`.

---

## NOT in scope

| Fuera | Por qué |
|---|---|
| El flujo de alta (`ReceptionWizard`) | El propio handoff lo declara fuera de alcance. |
| Hora real de llegada de la mercadería | Requiere campo nuevo en el wizard y cambiar el tipo de una columna con datos reales (A1, opción C). Si hace falta, es su propia feature. |
| Código de ambulatoria (tipo "AMB-2291") | No existe el concepto: ambulatoria es ausencia de protocolo. Inventarlo es modelo de dominio nuevo, no reskin. |
| Excursión de temperatura | No hay campo. Sumarlo es una feature de cadena de frío con su propio handoff. |
| Colapso responsive de columnas | Rechazado en D4. |
| Reescribir "Más filtros" | Ya existe y supera al mock. |
| Paginación real de la lista | P1 pone techo + aviso, que es lo proporcionado hoy. Paginar es su propio trabajo. |

---

## Modos de falla

| Ruta nueva | Cómo falla en producción | ¿Test? | ¿Manejo? | ¿Se ve? |
|---|---|---|---|---|
| `verified_by_name` vía join en vez de columna | La farmacéutica ve "—"; el Director ve el nombre | — | D2 lo elimina de raíz | ❌ **silencioso** |
| `resumenContenido` contando renglones | "2 medicamentos" con un medicamento en dos lotes | ✅ T1 | — | ❌ **silencioso** |
| Lista truncada por `max-rows` | La daybar afirma un total incompleto | — | ✅ P1 avisa | ❌ sin P1 sería silencioso |
| Header y tabla desalineados | El reskin pierde su razón de ser | — | ✅ A2, constante única | ✅ visible |
| `folio` sin backfill | Cards viejas sin número | — | `not null` tras backfill | ✅ visible |
| Búsqueda sin EAN | El usuario escanea un código y "no hay resultados" | ✅ T1 | — | ❌ **silencioso** |

**Los cuatro silenciosos quedan cubiertos** por D2, T1 y P1. Sin ellos serían gaps críticos: la
combinación "no hay test + no hay manejo + no se ve" es exactamente lo que dejó a la farmacéutica
sin historial durante días.

---

## Implementation Tasks

- [ ] **T1 (P1, human: ~1h / CC: ~10min)** — base — Migración `0085`: `folio` (secuencia + backfill
      por `created_at`) y `verified_by_name` (sellado en `set_reception_verified` + backfill).
  - Surfaced by: Step 0 — el mock muestra folio y verificador; ninguno existe. D1 + D2.
  - Files: `supabase/migrations/0085_recepcion_folio_y_verificador.sql`, `supabase/README.md`
  - Verify: el SQL corre tal cual en el editor de Supabase; paridad par de dollar-quotes.
- [ ] **T2 (P1, human: ~30min / CC: ~5min)** — datos — Sumar `folio`, `verified_by_name` y
      `code_type` al `select`; `.limit(TECHO_FILAS)` + flag `truncado`.
  - Surfaced by: P1 — `receptions.ts` no tiene techo y el reskin agrega totales visibles.
  - Files: `src/data/pharma/receptions.ts`
  - Verify: `npm run typecheck`
- [ ] **T3 (P2, human: ~40min / CC: ~8min)** — vista — Mover la card y los estilos a
      `views/pharma/recepcion/`, **sin cambios de comportamiento** (commit propio).
  - Surfaced by: C2 — el archivo supera 600 líneas con el reskin.
  - Files: `src/views/pharma/recepcion/*`, `src/views/pharma/RecepcionView.tsx`
  - Verify: `npm run build` verde y la pantalla idéntica antes/después.
- [ ] **T4 (P1, human: ~1h / CC: ~12min)** — lógica — `recepcion/derivados.ts`:
      `resumenContenido`, `coincideBusqueda` (con EAN y folio), `totalesDelDia`. **Medicamentos
      distintos por `medication_id`, no `items.length`.**
  - Surfaced by: Test review — `unique (reception_id, medication_id, lot_number)` permite el mismo
    medicamento en dos lotes.
  - Files: `src/views/pharma/recepcion/derivados.ts`
  - Verify: `npm run test`
- [ ] **T5 (P1, human: ~1h / CC: ~10min)** — tests — Cubrir los derivados de T4 + `estadoFromExpiry`
      + `groupByDay`, que hoy corren en prod sin cobertura.
  - Surfaced by: T1 (decisión) — cobertura 0/9 en rutas puras.
  - Files: `src/views/pharma/recepcion/derivados.test.ts`, `src/views/pharma/expiryState.test.ts`,
    `src/lib/dates.test.ts`
  - Verify: `npm run test`
- [ ] **T6 (P1, human: ~3h / CC: ~30min)** — vista — El reskin: banda de estado, header en grilla,
      tabla real con la constante compartida, barra de ámbito con los colores de C1. Aplica **G3**
      (Inter + `.spira-mono`), **G5** (banda de tres, botón 38px) y **G6** (sin los dos rótulos).
  - Surfaced by: el handoff. A2 + A3 + C1 + G3 + G5 + G6.
  - Files: `src/views/pharma/recepcion/ReceptionCard.tsx`, `.../columnas.ts`
  - Verify: comparar contra `Recepcion - Submodulo 2c.html` en el preview.
- [ ] **T9 (P1, human: ~30min / CC: ~6min)** — tokens — Crear `--spira-acc-deep-good` en los dos
      temas (claro oscurecido, oscuro **aclarado**) y verificar ≥ 4.5:1 sobre el tinte verde.
  - Surfaced by: G2 — `--warn-ink` del handoff es invisible en tema oscuro.
  - Files: `src/styles/tokens.css`
  - Verify: medir el contraste en los dos temas con `getComputedStyle` en el preview.
- [ ] **T10 (P1, human: ~1h / CC: ~12min)** — vista — Confirmación antes de verificar (con el
      resumen de lo que ingresa) + `Toast` al confirmar + el error dentro de la banda de su card.
  - Surfaced by: G1 + G4 — acción irreversible sin red, y el error lejos de la card.
  - Files: `src/views/pharma/recepcion/`, `src/components/Modal.tsx` (uso), `Toast`
  - Verify: forzar un error de verificación en el preview y confirmar que sale en la card.
- [ ] **T11 (P2, human: ~15min / CC: ~4min)** — a11y — `aria-label` por tabla con el folio.
  - Surfaced by: Pass 6 — cuatro tablas idénticas para un lector de pantalla.
  - Files: `src/views/pharma/recepcion/ReceptionCard.tsx`
  - Verify: leer el árbol de accesibilidad en el preview.
- [ ] **T7 (P2, human: ~30min / CC: ~6min)** — vista — Chips en dos grupos: toggle "Pendientes" +
      los cuatro de ámbito.
  - Surfaced by: D3 — el mock mezcla dos ejes y borra Investigación.
  - Files: `src/views/pharma/RecepcionView.tsx`
  - Verify: cruzar "Pendientes" con cada ámbito en el preview.
- [ ] **T8 (P3, human: ~15min / CC: ~3min)** — docs — Bitácora, handoff y registro de la `0085` una
      vez confirmada en prod.
  - Files: `docs/bitacora/`, `supabase/README.md`, `CLAUDE.md`

## Paralelización

| Paso | Módulos | Depende de |
|---|---|---|
| T1 | `supabase/` | — |
| T2 | `src/data/pharma/` | T1 |
| T3 | `src/views/pharma/` | — |
| T4, T5 | `src/views/pharma/recepcion/` | T3 |
| T6, T7 | `src/views/pharma/recepcion/` | T3, T2 |

```
Lane A: T1 → T2                    (base, después datos)
Lane B: T3 → T4 → T5               (mover, derivar, testear)
Lane C: T9                         (tokens — independiente de todo)
Lane D: T6 → T7 → T10 → T11        (espera A, B y C)

Arrancan A, B y C en paralelo. D cuando cierran las tres.
```

**Conflicto:** B y D tocan `views/pharma/recepcion/`. No van en worktrees paralelos — T6 necesita
los derivados de T4. Secuencial dentro de la carpeta. T9 toca solo `tokens.css`, así que sí puede
ir en paralelo real.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | Codex no instalado |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 11 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 6/10 → 9/10, 6 decisiones |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **VERDICT:** ENG + DESIGN CLEARED — listo para implementar. Sin outside voice (Codex ausente y los
  subagentes están desactivados en esta sesión); las dos revisiones son de un solo modelo.

NO UNRESOLVED DECISIONS
