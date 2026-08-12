# Plan · Dispensación — orden y claridad (paso a paso B)

**Handoff de origen:** [`design_handoff_dispensacion_pasoapaso/README.md`](../design_handoff_dispensacion_pasoapaso/README.md)
**Rama:** `feat/dispensacion-orden-y-claridad`
**Revisado con:** `/plan-eng-review` — 2026-08-11
**Última migración aplicada al empezar:** 0074

---

## 0 · Qué es esto, en una línea

El cajón de dispensación ya existe y funciona en producción desde la 0054. Este plan **no lo
construye: lo rediseña**, y de paso destapa tres cosas que el modelo de datos actual no puede
expresar (unidades, impresión, sustitución).

El handoff está escrito como si fuera greenfield ("recrear estos diseños en el entorno del
codebase de destino"). No lo es. La mitad de §8 —el foco del lector, el `gate()`, la validación
del escaneo— ya está resuelta, y en algunos casos con más cuidado que el prototipo.

---

## 1 · Qué ya existe (y NO se rehace)

| El handoff lo pide como nuevo | Ya vive en |
|---|---|
| Máquina de 3 pasos + ruteo por estado | `columnOf()` + `DispensacionDrawer.tsx:91-108` |
| Foco que sobrevive al re-render (§8.1) | `PanelPreparando.tsx:51-64` — **más** que el prototipo: captura global de teclas imprimibles |
| `gate()` con prioridades (§8.2) | `readyBlockedReason()` en `estados.ts:132` |
| Validación del escaneo contra el catálogo | RPC `scan_dispensation_item` (0054), server-side |
| Visor + descargar + imprimir la constancia | `ConstanciaIp.tsx` + `ipDocuments.ts` |
| Alternativas por principio activo (§5.5) | `useMedicationVariants(drugId)` en `medications.ts:54` |
| Columna FÁRMACO (§5.4) | `drugs` + `medications.drug_id` (0032) — solo falta pedirlo en el `select` |
| Toast de 2600 ms (§8.4) | `onToast` que ya baja desde `DispensacionesView` |

**Lo único net-new de verdad:** el riel vertical, el dial por renglón, el conteo por unidad, la
sustitución, el gate de impresión, y el visor con zoom.

---

## 2 · Decisiones tomadas en la review

| # | Decisión | Por qué |
|---|---|---|
| **D1** | Handoff **completo**, incluida la sustitución | Elección del Director sobre cuatro alcances |
| **A1** | Sustituir **habilita** la alternativa en `patient_medications` en la misma RPC atómica | Ver §3.1 — sin esto la sustitución la rechaza Postgres |
| **A2** | El vocabulario del handoff se adopta **también en el tablero** (`COLUMN_META`) | Un solo idioma en tablero, riel, historial y badges de Track |
| **A3** | "Imprimir" sella una **aserción**, nombrada como tal en el `audit_log` | El navegador no puede confirmar que se imprimió (§3.2) |
| **A4** | Acento **petróleo en todo Pharma** (18 archivos) | El ámbar de identidad y el de advertencia están a 4 dígitos hex (§3.3) |
| **CQ4** | El `⋯` lleva las **tres** acciones: Rechazar, Reasignar, Ver historial | Reasignar e historial se construyen de verdad; nada inerte |
| **T3** | **Vitest** para el dominio puro (primera suite del proyecto) | La lógica que puede fallar en silencio es pura y barata de testear |
| **P1** | Refetch **dirigido a un pedido**, no al tablero entero | Una pasada por unidad multiplicaba ×6 el refetch (§3.4) |

### Resueltas sin consulta (consecuencias mecánicas)

- **A5** — `readyBlockedReason()` → `requisitos(r): Requisito[]`. El riel pinta la lista completa y
  el pie deriva de ahí el primero pendiente. **Una** fuente de verdad, no dos que se desincronizan.
- **A6** — El visor se ancla al cajón (§7), así que `viewer`/`zoom` viven en `DispensacionDrawer`.
- **A7** — **Front primero, migración después** (regla dura de `CLAUDE.md` §3; la 0068 ya mordió al
  revés). Backfill de filas en vuelo: `scanned_units = quantity where scanned_at is not null`.
- **CQ1** — `ItemRow` pasa de `scanned: boolean | null` (donde `null` era un modo escondido) a
  `modo: 'escaneo' | 'lectura'`. Explícito antes que astuto.
- **CQ2** — "Fuera de cronograma" **conserva su motivo** (chip + texto). El handoff lo aplana a un
  ítem del subtítulo porque no conocía la decisión D11; ese texto sale impreso en el comprobante.
- **CQ3** — El riel **no se dibuja** en `rechazada` ni en "todavía no se tomó": están fuera del flujo
  de tres pasos y el handoff no los modela.
- **T1** — Sustituir **resetea `scanned_units = 0`** (ver §3.5).
- **T2** — El incremento del escaneo es **atómico en la base**, nunca leer-sumar-escribir.
- **P2** — `useMedicationVariants(null)` hoy **trae el catálogo entero**; se agrega guarda.
- **P3** — El stock de las alternativas va en **una** consulta filtrada por ids.

---

## 3 · Los cinco hallazgos que cambian el diseño

### 3.1 · La sustitución choca con el doble enforcement de la 0050

`[P1]` · confianza 9/10 · `supabase/migrations/0050:87-91` y `:122-126`

```
                 ┌──────────────────────────────────────────────┐
handoff §5.5 ──► │ alternativas = mismo drug_id  +  hay stock    │
                 └──────────────────────────────────────────────┘
                                    ✗ CHOCA
                 ┌──────────────────────────────────────────────┐
   0050:87   ──► │ trigger: el medicamento TIENE que estar en    │
                 │ patient_medications, ACTIVO, para ese         │
                 │ enrolamiento — si no, raise exception         │
                 └──────────────────────────────────────────────┘
```

`patient_medications` suele tener **una** presentación por droga y por paciente, así que la
alternativa que ofrece el handoff es, casi siempre, justo la que el trigger rechaza.

**Resolución (A1):** una RPC `substitute_dispensation_item` que en **una** transacción:

```
substitute_dispensation_item(p_item_id, p_medication_id, p_reason)
  │
  ├─ 1. valida: misma droga que el renglón actual          → si no, 'otra droga, requiere IP'
  ├─ 2. valida: el pedido sigue en preparando              → si no, 'ya se emitió el comprobante'
  ├─ 3. upsert patient_medications (enrollment, med) activa  ← LA HABILITACIÓN
  ├─ 4. update dispensation_request_items
  │        set medication_id = nuevo, scanned_units = 0      ← T1: resetea el conteo
  └─ 5. el trigger de audit_log sella los dos cambios juntos
```

El candado **no se afloja**: sigue siendo imposible dispensar algo no habilitado. Lo que cambia es
que habilitar pasa a ser un acto explícito, con motivo, hecho por quien la RLS ya autoriza
(`"pharma asigna medicación"` for insert, 0050:149).

La UI lo dice antes de que pase: *"Usar este también habilita Ventolin para Susana Rodríguez"*.

### 3.2 · El gate "constancia impresa" afirma algo que no se puede observar

`[P1]` · confianza 9/10 · `ipDocuments.ts:203`

`frame.contentWindow?.print()` abre el diálogo. `afterprint` (línea 213) dispara cuando el diálogo
**se cierra** — imprimió o canceló, el navegador no distingue. **No hay API web que confirme una
impresión.**

**Resolución (A3):** se persiste `printed_at` + `printed_by`, pero el `audit_log` lo registra como
**"marcó la constancia como impresa"**, una aserción de la persona, no una confirmación del
dispositivo. Cero fricción en un flujo cuyo objetivo declarado es no tocar el mouse, y el registro
dice exactamente lo que sabe.

### 3.3 · Los dos ámbares de Pharma

`[P2]` · confianza 8/10 · `tokens.css:30,40`

```
--spira-warn:         #B0823F   ← advertencia
--spira-pharma-solid: #A8842F   ← identidad de Pharma
                       ^^^^^^
                       4 dígitos hex de distancia: indistinguibles en pantalla
```

Esto explica la decisión §13.10 del handoff ("el ámbar queda sólo como color de advertencia"). No es
una preferencia de esta pantalla: es una colisión sistémica.

**Resolución (A4):** petróleo (`--spira-primary`) en los 18 archivos que hoy usan el ámbar de
identidad. `--spira-warn` queda para lo que de verdad advierte.

### 3.4 · Una pasada por unidad multiplica el refetch del tablero

`[P1]` · confianza 9/10 · `DispensacionesView.tsx:335` + `dispensations.ts:198-226`

```
onChanged={() => q.refetch()}
                 └─ useDispensationBoard(day) = DOS consultas, REQUEST_COLS completo
                    (items + medications + dispensations + dispensation_items
                     + ip_documents + visit → enrollment → patient + protocol)

hoy:      1 pasada por RENGLÓN  → pedido de 3 ítems  =  3 refetch  =  6 consultas
después:  1 pasada por UNIDAD   → pedido de 6 u.     =  6 refetch  = 12 consultas
                                                          ↑
                                        en el camino más caliente de la pantalla,
                                        bloqueando el contador en cada pasada
```

**Resolución (P1):** tras cada pasada se recarga **solo ese pedido por id**; el tablero se refetchea
al cerrar el cajón. El servidor sigue siendo la única fuente de verdad del contador — en un sistema
auditable no se muestra una unidad que la base no confirmó.

### 3.5 · Sustituir un renglón ya escaneado parcialmente

`[P1]` · confianza 9/10 · destapado por el mapa de tests, **ausente del handoff**

Si un ítem tiene 2 de 3 unidades escaneadas y se sustituye, esas 2 unidades quedan contadas contra
un producto que **ya no es ese**. El contador diría `2/3` sobre medicación que nunca pasó por el
lector. El prototipo no lo ve porque no persiste unidades.

**Resolución (T1):** `scanned_units = 0` en el mismo `update` de la sustitución (paso 4 de §3.1).

---

## 4 · Modelo de datos — qué cambia

```
dispensation_request_items
  scanned_at    timestamptz  ──┐
  scanned_by    uuid          ─┼─► se CONSERVAN (última pasada, quién)
+ scanned_units int not null default 0     ← el conteo real
                                              backfill: = quantity donde scanned_at is not null

dispensation_ip_documents
+ printed_at    timestamptz               ← aserción, no confirmación (§3.2)
+ printed_by    uuid

dispensation_requests
  (sin columnas nuevas — reasignar reescribe prepared_by)
```

### RPCs

| RPC | Estado | Qué cambia |
|---|---|---|
| `scan_dispensation_item` | **modificada** | `scanned_units = scanned_units + 1` atómico; el error "ya completo" pasa a comparar contra `quantity` |
| `unscan_dispensation_item` | **modificada** | resta 1 con guarda de piso en 0; sin guarda hay underflow a −1 |
| `mark_dispensation_ready` | **modificada** | el gate compara `Σ scanned_units` contra `Σ quantity`, no renglones |
| `substitute_dispensation_item` | **nueva** | §3.1 |
| `reassign_dispensation_preparation` | **nueva** | pasa `prepared_by` a otra farmacéutica sin soltar a Solicitadas |
| `mark_ip_document_printed` | **nueva** | sella la aserción de §3.2 |
| `dispensation_audit_trail` | **nueva** | historial del pedido legible por **pharma** (el precedente `HistorialMedicacionModal` va por una RPC solo-gerencia; esta necesita candado propio) |

### Orden de aplicación (regla dura, `CLAUDE.md` §3)

```
1. Deploy del FRONT (tolera scanned_units ausente: cae a scanned_at)
2. Migración 0075 — scanned_units + printed_at/printed_by + backfill
3. Migración 0076 — substitute_dispensation_item
4. Migración 0077 — reassign + audit_trail
```

Al revés deja el cajón roto en producción, que es lo que pasó con la 0068 el 2026-08-05.

---

## 5 · Arquitectura de componentes

```
DispensacionDrawer  (720px, sin bordes laterales, sombra izquierda)
│  estado: viewer, zoom            ← A6: el visor se ancla ACÁ, no al panel
│
├── Header .hd        título = ESTADO · subtítulo · chip "Fuera de cronograma" + MOTIVO (CQ2)
│                     └── ⋯ Rechazar · Reasignar · Ver historial   (CQ4)
│
├── .split ────────────────────────────────────────────────────
│   ├── RailProceso   240px   ← NUEVO. lee requisitos(r) (A5)
│   │     ├── espina continua + tramo recorrido
│   │     ├── nodo actual con halo
│   │     └── .reqs = requisitos del paso actual, con n/qty
│   │        (no se dibuja en rechazada / no tomada — CQ3)
│   │
│   └── .work
│       ├── PanelPreparando  │ PanelLista │ PanelEntregada │ PanelRechazada
│       │   ├── ipcard (miniatura → visor, Ver/Descargar/Imprimir)
│       │   ├── ScanField  (ya existe, se reusa)
│       │   ├── .ctop  contador de UNIDADES
│       │   └── ItemRow × n   modo: 'escaneo' | 'lectura'   (CQ1)
│       │       ├── dial conic-gradient
│       │       ├── columna FÁRMACO
│       │       └── PanelSustitucion (desplegable en la misma tarjeta)
│       └── .ft   footer
│
└── VisorConstancia  overlay absoluto, zoom 0.4–1.6 paso .15, Esc cierra
```

### La colisión de foco que el handoff no ve

El handoff dice *"No se enfoca [el input] mientras el visor está abierto"* (§5.2). Pero
`PanelPreparando.tsx:51-64` tiene una **captura global** que redirige cualquier tecla imprimible al
campo de escaneo. Con el visor abierto, esas dos reglas se pelean.

**Resolución:** la captura global se apaga mientras `viewer === true`, y al cerrar el visor el foco
vuelve al campo (el prototipo ya hace lo segundo).

---

## 6 · Tests (primera suite del proyecto)

Vitest, solo dominio puro — sin jsdom, sin navegador, sin mocks de Supabase.

| Archivo | Qué cubre |
|---|---|
| `estados.test.ts` | `requisitos()`: sin IP / IP sin constancia / sin imprimir / impresa; items 0 / parcial / completo; singular vs plural |
| `unidades.test.ts` | `uTot`/`uOk`/`allOk`/`nextItem`; `pct` con `qty = 0` (división por cero) |
| `sufijos.test.ts` | `· completo` / `· faltan N u.` / `· falta 1 u.` / `· sustituido` |
| `zoom.test.ts` | clamp 0.4–1.6, paso ±0.15, "Ajustar" → 0.78 |

Se suma `"test": "vitest run"` y el CI (`.github/workflows/ci.yml`) lo corre junto al build.

Lo que **no** cubre y se verifica en el preview: foco del lector, Esc en el visor, panel de
sustitución, y el camino feliz completo con el lector.

---

## 7 · Modos de falla

| Camino nuevo | Cómo falla en producción | ¿Test? | ¿Manejo? | ¿La ve la usuaria? |
|---|---|---|---|---|
| Escaneo por unidad | Dos farmacéuticas suman a la vez y se pierde una pasada | E2E | **sí** — incremento atómico en la base (T2) | sí, el contador es el de la base |
| `unscan` en 0 | `scanned_units = −1`, el dial se rompe | sí | **sí** — guarda de piso | no llega a pasar |
| Sustituir escaneado | 2 u. contadas contra otro producto | E2E | **sí** — reset a 0 (T1) | sí, el dial vuelve a 0/3 |
| Sustituir tras marcar lista | Stock ya descontado, el pedido se corrompe | E2E | **sí** — la RPC lo rechaza | sí, mensaje sereno |
| Alternativa sin droga asignada | `useMedicationVariants(null)` baja el catálogo entero | sí | **sí** — guarda (P2) | sí, "sin droga asignada" |
| `mark_ip_document_printed` falla | El requisito queda pendiente pese al click | no | **sí** — error visible | sí |
| Reasignar a quien no puede | La otra persona no tiene el módulo | no | **sí** — RLS + mensaje | sí |

**Cero gaps críticos** (ninguna falla queda sin test *y* sin manejo *y* silenciosa).

---

## 8 · Paralelización

| Carril | Pasos | Toca | Depende de |
|---|---|---|---|
| **A** | Recolor petróleo de Pharma (A4) | `src/views/pharma/**`, `tokens.css` | — |
| **B** | Migraciones 0075-0077 + capa de datos | `supabase/migrations/`, `src/data/pharma/` | — |
| **C** | Riel + visor + layout del cajón | `dispensaciones/`, `components/Drawer.tsx` | — |
| **D** | ItemRow + dial + FÁRMACO + sustitución | `dispensaciones/ItemRow`, `PanelSustitucion` | B |
| **E** | Vitest + tests | `src/**/*.test.ts`, `package.json`, CI | C, D |

**A choca con C y D** (los tres tocan `views/pharma/dispensaciones/`). Orden real:

```
B ──────────────► D ──┐
                      ├──► E
     C ───────────────┘
          A al final, en una pasada mecánica sobre el árbol ya estabilizado
```

Hacer A primero garantiza conflictos: recolorea archivos que C y D están reescribiendo.

---

## 9 · NO está en alcance

| Fuera | Por qué |
|---|---|
| **Tablet / responsive** | El handoff §8.6 dice explícitamente que no está diseñado. Diseñar antes de implementar |
| **Volver atrás de un paso** | §14 lo deja abierto. Hoy `cancelDispensationPreparation` cubre el caso real |
| **Más de un EAN por producto** | §14 abierto; el modelo actual asume uno y no hay caso real todavía |
| **Motivo obligatorio en la sustitución** | §14 abierto. Se implementa el campo **opcional**; volverlo obligatorio es un `not null` después |
| **Código de barras EAN-13 real** | §2: el del prototipo es decorativo. La constancia es un PDF del backend |
| **Recolor de Track** | A4 alcanza a Pharma. Track tiene su propio acento y no está en discusión |
| **Migrar `resolve_dispensation`** | RPC deprecada viva en la base; borrarla es otro PR |

---

## 10 · Tareas

- [ ] **T1 (P1)** — datos — Migración 0075: `scanned_units` + `printed_at`/`printed_by` + backfill
- [ ] **T2 (P1)** — datos — Reescribir `scan`/`unscan`/`mark_ready` a unidades, incremento atómico
- [ ] **T3 (P1)** — datos — Migración 0076: `substitute_dispensation_item` (§3.1, con reset a 0)
- [ ] **T4 (P2)** — datos — Migración 0077: `reassign_dispensation_preparation` + `dispensation_audit_trail`
- [ ] **T5 (P1)** — dominio — `readyBlockedReason()` → `requisitos(r): Requisito[]` (A5)
- [ ] **T6 (P1)** — UI — `RailProceso` con espina, halo y `.reqs`
- [ ] **T7 (P1)** — UI — Cajón a 720 + `.split` + footer; `StepBar` se retira
- [ ] **T8 (P1)** — UI — `ItemRow`: `modo`, dial, columna FÁRMACO, sufijos de estado (CQ1)
- [ ] **T9 (P1)** — UI — `PanelSustitucion` + aviso de habilitación
- [ ] **T10 (P2)** — UI — `VisorConstancia` con zoom, Esc, y apagado de la captura global (§5)
- [ ] **T11 (P2)** — UI — Menú `⋯` con Rechazar / Reasignar / Ver historial (CQ4)
- [ ] **T12 (P2)** — datos — Refetch dirigido a un pedido (P1) + guarda de `useMedicationVariants` (P2)
- [ ] **T13 (P2)** — copy — `COLUMN_META` con `estado` y `paso`; tablero, riel, historial y badges (A2)
- [ ] **T14 (P3)** — estilo — Recolor petróleo de los 18 archivos (A4) — **último**
- [ ] **T15 (P2)** — tests — Vitest + los 4 archivos de §6 + script npm + CI

**Verificación de cada uno:** `npm run typecheck` verde + `npm test` verde + comprobación en el
preview (5250). Sin las tres, no está hecho.
