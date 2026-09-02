# Plan · Stock: agrupación por medicamento + selector de protocolos

> Handoff: [`docs/design_handoff_stock_table_rows/`](design_handoff_stock_table_rows/)
> (copiado desde Downloads el 2026-09-01, según la regla de CLAUDE.md).
> Revisado con `/plan-eng-review` el 2026-09-01. Sin migraciones.

## Qué es esto

El handoff se pidió como "un reskin", pero **cambia el grano de la lista**. Hoy
Farmacia › Stock lista *una fila por lote*, plana, agrupada por protocolo. El mock mete un
nivel intermedio, el **medicamento**, con sus lotes plegados adentro y un conector de árbol
que los ata a la fila madre. Y agrega arriba una grilla de tarjetas de protocolo que enfoca
la tabla.

```
HOY (LoteRow, plano)                    DESPUÉS (dos formas de fila)
─────────────────────────────           ──────────────────────────────────
▸ ACT18301 · AIRLYMPUS                  ▸ ACT18301 · AIRLYMPUS
  [IpCard 54 kits]                        [IpCard 54 kits]
  ┌ Alvetide · TEST01   · 4 u ┐           ┌ ⌄ Alvetide  2 lotes  —  9 u ┐ ← MedGroup
  ├ Alvetide · DFA-6545 · 5 u ┤           │   ├─● TEST01   · 4 u        │   (resumen +
  └ Symbicort · DFA-9278 · 9 u ┘          │   └─● DFA-6545 · 5 u        │    conector)
                                          └ Symbicort · DFA-9278 · 9 u ┘ ← LoteRow (1 lote)
```

El problema real que resuelve: hoy "Alvetide 92/22" aparece dos veces, con el mismo nombre y
el mismo EAN, y hay que sumar de cabeza para saber cuánto hay.

## Lo que YA existe y no se construye

| Sub-problema del mock | Ya está |
|---|---|
| Grupo por protocolo, cabecera y contador | `ProtocoloGroups` + `contador()` |
| `.ipcard` (54 kits · 1 recepción · IRT) | `IpCard` — idéntica, mismo copy |
| `.badge.low` / `.badge.out` | `stockBadgeLow` / `stockBadgeOut` — mismos hex |
| Tarjeta de protocolo | `renderCard` de `ProtocolsView` |
| Toolbar (buscador · Vencimiento · Protocolo · Limpiar) | Ya está, y Protocolo es multi y vive en la URL |
| Datos de las tarjetas | `useProtocols` + `useProtocolLots` + `useIpStockAll`, **ya en vuelo** |

**Net-new real:** la fila resumen, el conector, la grilla de tarjetas, y las reglas puras.

## Decisiones tomadas — NO re-discutir

| # | Decisión |
|---|---|
| D1 | Alcance **completo**: filas + agrupación + tarjetas selectoras. |
| D2 | **Geometría del mock, tokens vivos.** El mock es fuente de verdad de anchos, gaps y el conector; NO de color ni tipografía (ver §Traducción). |
| D3 | Las tarjetas **escriben el filtro que ya existe** (`protoCodes`, multi, en la URL). Un solo estado. |
| D4 | La fila resumen hereda el **peor estado** de sus lotes y la **fecha más próxima**; el grupo **arranca abierto** si hay vencido o por vencer. |
| D5 | **Ambulatoria también agrupa.** `LoteRow` tiene dos consumidores y la vista no puede tener dos gramáticas. |
| D6 | Si un lote matchea la búsqueda, el grupo abre **con TODOS sus lotes** y se resalta el match. El resumen sigue diciendo el stock real. |
| D7 | Kebab del **resumen** = acciones del medicamento (asignar/modificar/copiar EAN). Kebab del **lote** = ajustar stock. |
| D8 | "Bajo" en el resumen = **algún lote suyo está bajo**, con el mismo ≤5 de hoy. El `low_stock_threshold` de la 0032 queda anotado en `TODOS.md` como decisión aparte. |
| D9 | La **regla pura** va a `src/views/pharma/stock/agrupacion.ts` + `.test.ts`. Los componentes se quedan en `MedicamentosView`. |
| D10 | Los offsets del conector se escriben con **`calc()` sobre custom properties**, no como literales comentados. |
| D11 | La fila resumen es un **`<button>` de verdad**; el kebab es su hermano, no va anidado. |
| D12 | Se borra el `Eyebrow` local y se usa la clase global **`.spira-eyebrow`**. |
| D13 | El auto-despliegue fija el estado **inicial**; el clic del usuario lo pisa; **se recalcula** al cambiar búsqueda o filtro. |
| D14 | Con filtro de vencimiento activo, el resumen **recalcula sobre lo filtrado** y la columna Lote dice **"1 de 2 lotes"**. |

## Lo que NO entra

- **Usar `low_stock_threshold` / `is_low_stock` de `v_medication_stock` (0032).** Esa vista
  incluye medicamentos asignados con stock CERO, así que cambiaría *qué filas se listan*, no
  sólo cómo se rotulan. Es otra decisión. → `TODOS.md`.
- **Renombrar el apartado o tocar el menú de Screen A.**
- **El Catálogo.** No tiene lotes; `CatalogoRow` no se toca.
- Sin migraciones. Sin cambios de RLS.

## Arquitectura

```
useProtocolLots()  ──►  LotDetailRow[]  ──►  pasaFiltros(busqueda, filtro)
       │ (1 query, todos los protocolos)              │
       │                                              ▼
       │                              agruparPorMedicamento()   ← agrupacion.ts (puro)
       │                                              │
       │                              ┌───────────────┴───────────────┐
       │                              ▼                               ▼
       │                        lotes.length === 1              lotes.length > 1
       │                          <LoteRow>                      <MedGroup>
       │                                                          ├ resumen  (button)
       │                                                          └ lotes    (conector)
       ▼
useProtocols() + useIpStockAll()  ──►  <ProtocoloCards>  ──►  setProtoCodes([...])
       (ya en vuelo, sin query nueva)                            └► mismo estado que
                                                                    el MultiFilterMenu
```

**Nada de esto agrega una consulta.** Los tres hooks ya se llaman en
`MedicamentosView.tsx:125/133/134`.

## Reglas puras · `src/views/pharma/stock/agrupacion.ts`

```ts
export interface GrupoMedicamento {
  medicationId: string       // clave del grupo — NUNCA el nombre (hay homónimos)
  name: string
  drugName: string | null
  code: string | null        // EAN13: uno por medicamento (ver LotDetailRow.code)
  lotes: LotDetailRow[]      // conserva el orden de la query (name asc, expiry asc)
}

agruparPorMedicamento(lotes: LotDetailRow[]): GrupoMedicamento[]
stockTotal(g: GrupoMedicamento): number                 // suma quantity_on_hand
estadoDelGrupo(g: GrupoMedicamento): Estado             // peor: vencido > pronto > ok
vencimientoDelGrupo(g: GrupoMedicamento): string | null // la fecha MÁS PRÓXIMA; null si todas null
nivelDelGrupo(g): 'ok' | 'bajo' | 'agotado'
debeAbrirse(g: GrupoMedicamento, busqueda: string): boolean
```

Dos reglas derivadas que hay que escribir explícitas porque no son obvias:

- **`nivelDelGrupo`**: `'agotado'` sólo si **todos** los lotes están en 0 (un lote en 0 junto a
  otro en 10 no es un medicamento agotado). `'bajo'` si **algún** lote está bajo y no está
  agotado — D8. Un total de 9 repartido en lotes de 4 y 5 SÍ es "Bajo".
- **`estadoDelGrupo`** reusa `estadoDe()` de `expiryState`, ya testeada. No se reimplementa.

## Geometría del conector (D10)

Los números del handoff no son elegidos, se derivan. La línea cae en el **centro del ícono**
de la fila resumen:

```
 fila resumen │←16→│ chev 15 │←14→│  pillsq 40  │←14→│ nombre …
              pad            gap        ▲        gap
                                     centro
 fila de lote │←16→│ · · · · · · · · · │ · · · · · · · ·
              pad                      x = 15 + 14 + 20 = 49
```

El padding cancela porque las dos filas comparten los mismos 16px horizontales. Si eso deja
de ser cierto, el `calc()` hay que rehacerlo.

```css
.spira-medgroup {
  --fila-gap: 14px;  --chev: 15px;  --pill: 40px;
  --nodo: 7px;       --lote-pad-y: 11px;
  --conector-x: calc(var(--chev) + var(--fila-gap) + var(--pill) / 2);  /* = 49px */
}
.spira-lot-indent { position: relative; flex: 1 1 auto; align-self: stretch; }
.spira-lot-indent::before {          /* la línea, de borde a borde del row */
  content: ''; position: absolute; width: 1px; background: var(--spira-line-2);
  left: var(--conector-x);
  top: calc(-1 * var(--lote-pad-y)); bottom: calc(-1 * var(--lote-pad-y));
}
.spira-lot-row:last-child .spira-lot-indent::before { bottom: 50%; }
.spira-lot-indent::after {           /* el nodo, recortado sobre la línea */
  content: ''; position: absolute; top: 50%; transform: translateY(-50%);
  left: calc(var(--conector-x) - var(--nodo) / 2);
  width: var(--nodo); height: var(--nodo); border-radius: 999px;
  background: var(--spira-surface); border: 1.5px solid var(--spira-line-2);
}
```

**Va a `tokens.css` sí o sí:** `::before`/`::after` no existen en objetos de estilo de React,
que es como está escrito el resto del archivo.

**Regla de alineación (la crítica del handoff):** cada forma de fila debe tener **exactamente
un** ítem flexible antes de las columnas fijas — `.name` en las filas con medicamento,
`.spira-lot-indent` en las de lote. Así el inicio de la columna EAN cae en la misma X en las
tres, sea cual sea el ancho.

### Presupuesto de ancho (notebook de referencia, 1185px de contenido)

```
1185 − 48 (padding 24 del contenedor) = 1137 exterior de la fila
1137 − 32 (padding 16 de la fila)     = 1105 interior
fijos: 40+170+96+150+138+36 = 630   gaps: 6×14 = 84   →  714
nombre = 1105 − 714 = 391px      (med-summary: −29 por chevron+gap = 362px)
```

Holgado contra el `flex-basis: 240px`. El nombre es el único con `min-width: 0`, así que
absorbe todo el déficit: por debajo de ~1063px de viewport empieza a truncar con ellipsis, y
eso es correcto. **A verificar en pantalla**, no por esta cuenta.

## Traducción de tokens (D2)

| Mock | Vivo | Nota |
|---|---|---|
| `--ink` `--primary` `--surface` `--white` | `--spira-ink` `--spira-primary` `--spira-surface` `--spira-white` | igual |
| `--line` `--line2` | `--spira-line` `--spira-line-2` | igual |
| `--muted: #7C8C87` | `--spira-muted` = **#61706C** | el mock trae el tono PRE-recalibración (3,12:1) |
| `--faint: #A6B0AC` | `--spira-faint` = **#838C89** | y **no se usa para texto** |
| `--pharma: #A8842F` (identidad) | `--spira-pharma` = **#0F5F57** | Farmacia es petróleo desde el 2026-08-11 |
| `.stock-v b` en `--pharma` (stock bajo) | **`--spira-acc-deep-warn`** (#6E5620) | ver §Bug abajo |
| `--warn-ink` / `--danger-ink` | `stockBadgeLow` / `stockBadgeOut` | ya existen, mismos valores |
| `Hanken Grotesk` | `--spira-font-text` (Inter) | |
| `IBM Plex Mono` | `--spira-font-mono` (Inter) vía `.spira-mono` | decisión explícita en `tokens.css:166` |
| `Schibsted Grotesk` | `--spira-font-display` | ya coincide |
| `.pcard.sel` (borde + aro dorado) | idioma de `MultiFilterMenu`: borde de acento + tinte + tilde | la selección es *significado*; el hover sigue siendo elevación |

⚠️ Al pintar el tinte de la tarjeta seleccionada, `accent + '12'` es **válido** porque
`module.accent` es un hex crudo de `registry.ts`, no un `var()`. No lo "arregles" a
`var(--spira-pharma) + '12'`: eso produce CSS inválido que se descarta en silencio.

### Bug que este cambio arregla de paso

`MedicamentosView.tsx:723` — `const color = out ? danger : low ? 'var(--spira-pharma-solid)' : ink`.
Cuando Farmacia pasó de ámbar a petróleo (2026-08-11), el número de un lote bajo dejó de
verse como advertencia y pasó a verse como identidad de módulo, mientras el badge "Bajo" al
lado siguió ámbar. El comentario de `:796` dice justo lo contrario de lo que el código hace.
Pasa a `--spira-acc-deep-warn`.

## Archivos

| Archivo | Qué |
|---|---|
| `src/views/pharma/stock/agrupacion.ts` | **nuevo** — las seis reglas puras |
| `src/views/pharma/stock/agrupacion.test.ts` | **nuevo** — 19 casos + 4 regresiones |
| `src/views/pharma/MedicamentosView.tsx` | `MedGroup`, `ProtocoloCards`, `LoteRow` reskin, kebab repartido, `Eyebrow` borrado, comentario de cabecera + diagrama |
| `src/styles/tokens.css` | `.spira-medgroup`, `.spira-lot-row`, `.spira-lot-indent` |
| `docs/plan-stock-agrupacion-por-medicamento.md` | este archivo |
| `docs/design_handoff_stock_table_rows/` | el bundle |
| `TODOS.md` | el umbral configurable de la 0032 (P2) |

**Mantenimiento de comentarios (obligatorio, mismo commit):** `MedicamentosView.tsx:86-91`
dice *"Ambulatoria (por-lote, plano)"* y *"La lista de stock es POR LOTE"*. Las dos dejan de
ser ciertas. Se reescriben y se les suma el diagrama ASCII de las tres formas de fila.

## Tests

```
CODE PATHS                                              USER FLOWS
[+] stock/agrupacion.ts                                 [+] Stock › Protocolo
  ├── agruparPorMedicamento()                             ├── Desplegar/plegar con el mouse
  │   ├── 0 lotes → []                                    ├── Desplegar/plegar con teclado
  │   ├── 1 lote → grupo simple (LoteRow)                 ├── Tildar tarjeta → filtra la tabla
  │   ├── N lotes mismo med → MedGroup                    ├── Destildar → vuelve a todos
  │   ├── clave = medication_id, NO name                  └── Deep-link ?protocolo=ACT18301
  │   └── preserva el orden de la query                       → tarjeta marcada + tabla filtrada
  ├── stockTotal()  ├── suma  └── un lote en 0
  ├── estadoDelGrupo()                                  [+] Bordes
  │   ├── todos ok → ok                                   ├── TODOS los lotes en 0 → "Agotado"
  │   ├── ok+pronto → pronto                              ├── uno en 0 y uno en 10 → NO agotado
  │   ├── pronto+vencido → vencido                        ├── sin vencimiento → "—" sin ícono
  │   └── expiry null → ok                                └── protocolo sin lotes → EmptyState
  ├── vencimientoDelGrupo()
  │   ├── dos fechas → la menor                         [+] REGRESIONES (críticas)
  │   ├── null + fecha → la fecha                         ├── R1 buscar un nº de lote lo muestra
  │   └── todas null → null                               ├── R2 buscar un EAN lo encuentra
  ├── nivelDelGrupo()                                     ├── R3 Ambulatoria lista todos sus lotes
  │   ├── 4 y 5 → bajo (aunque sumen 9)                   └── R4 un vencido se ve SIN interacción
  │   ├── 9 solo → ok
  │   └── agotado ≠ algún-lote-en-0
  └── debeAbrirse()
      ├── hay vencido → true       (D4)
      ├── hay por_vencer → true    (D4)
      ├── hay match de búsqueda → true (D6)
      └── sano y sin búsqueda → false

Reusado sin re-testear: estadoDe() ← expiryState.test.ts
COBERTURA OBJETIVO: 23/23 reglas puras. Los flujos se verifican EN PANTALLA (fallan visible).
```

**Las cuatro regresiones son obligatorias.** R1/R2 porque `MedicamentosView.tsx:441` hoy hace
buscables `lot_number` y `code` y devuelve una fila visible; R3 porque D5 cambia la forma de
Ambulatoria; R4 porque hoy un vencido se ve sin desplegar nada.

Los tests de despliegue van contra `debeAbrirse` (pura), **no** contra el DOM: lo que puede
fallar en silencio es la regla, no el chevron.

## Verificación

```bash
npm run build                    # typecheck + vitest + build. El gate.
```

En pantalla (**QA logueado**, las siete son necesarias):

1. **Farmacia › Stock › Protocolo** — un medicamento con 2+ lotes se pliega, el conector
   apunta al centro del ícono de arriba, la línea se corta a la mitad en el último lote.
2. **El mismo, con teclado** — Tab llega a la fila resumen, Enter/Espacio la despliega, el
   foco se ve. Tab sigue al kebab, que es un botón aparte.
3. **Buscar un número de lote** que viva en un grupo — el grupo abre con TODOS sus lotes.
4. **Filtrar "Vencidos"** sobre un medicamento con un vencido y uno vigente — el resumen dice
   "1 de 2 lotes" y suma sólo el vencido.
5. **Farmacia › Stock › Ambulatoria** — misma gramática de fila que Protocolo.
6. **Tildar y destildar una tarjeta**, y recargar con el `?protocolo=` puesto.
7. **Tema oscuro** — el conector y el nodo tienen que verse (`--spira-line-2` en oscuro es
   `#3A3A3A`, sobre `--spira-surface` `#1C1C1C`).

Ojo con el preview: es un documento oculto, así que las transiciones están pausadas y el
`:hover` medido con `getComputedStyle` devuelve el valor inicial. Apagá la transición antes
de medir, o vas a diagnosticar un bug que no existe.

## GSTACK REVIEW REPORT

| Runs | Status | Findings |
|---|---|---|
| Step 0 · Desafío de alcance | ✅ completo | 5 (paleta vieja, fuentes, tonos pre-AA, copy "Tus protocolos", bug de `StockCell`) |
| §1 Arquitectura | ✅ completo | 4 → D5, D6, D7, D8 |
| §2 Calidad de código | ✅ completo | 6 → D9, D10, D11, D12 + 2 requisitos sin decisión (comentario stale, conector a CSS) |
| §3 Tests | ✅ completo | 2 → D13, D14 · 23 reglas puras · **4 regresiones obligatorias** |
| §4 Performance | ✅ completo | 0 — cero queries nuevas, sin N+1, `useUrlState` ya usa `replace` |
| Outside voice | ⚠️ no corrió | `codex` no está instalado en esta máquina |

**Hallazgos por severidad:**

- `[P1] (10/10)` `MedicamentosView.tsx:403` — `LoteRow` tiene dos consumidores; el mock dibuja uno. → D5
- `[P1] (10/10)` `MedicamentosView.tsx:441` — buscar por `lot_number`/`code` es una **regresión** al plegar. → D6, R1/R2
- `[P1] (10/10)` `MedicamentosView.tsx:191` — `setAjuste({ lotId: row.lot_id })`: "Ajustar stock" no tiene lote en el resumen. → D7
- `[P1] (10/10)` `MedicamentosView.tsx:86-91` — comentario de cabecera que este cambio deja falso. → requisito
- `[P1] (10/10)` mock `.med-summary` es `<div onclick>` con el kebab anidado — sin teclado y HTML inválido. → D11
- `[P1] (9/10)` `tokens.css:76-84` — el mock pinta la identidad de Farmacia en ámbar; la app es petróleo desde el 2026-08-11. → D2
- `[P2] (9/10)` `MedicamentosView.tsx:723` — el número de stock bajo salió petróleo al mover el acento del módulo. **Bug vivo**, se arregla acá.
- `[P2] (9/10)` `tokens.css:38-45` — `--muted`/`--faint` del mock son los tonos que la PR #95 retiró por no llegar a AA. → D2
- `[P2] (8/10)` `tokens.css:166` — el mock pide IBM Plex Mono; el repo lo cambió por Inter a propósito. → D2
- `[P2] (8/10)` `MedicamentosView.tsx:722` vs `stock.ts:20` — ≤5 a mano contra el `low_stock_threshold` de la 0032. → D8, diferido a `TODOS.md`
- `[P2] (10/10)` tres definiciones del mismo eyebrow. → D12
- `[P3] (7/10)` copy "Tus protocolos": Farmacia es central, ve todos. → "Protocolos con stock"

**VERDICT: LISTO PARA IMPLEMENTAR.** 14 decisiones cerradas, alcance acotado a 6 archivos, sin
migraciones, sin queries nuevas. Los tres choques del handoff con decisiones ya tomadas
(paleta, fuentes, tonos) están traducidos y documentados. Las cuatro regresiones tienen test.
CODEX: no absorbido — el binario no está instalado en esta máquina.

**UNRESOLVED DECISIONS:**

- La voz de afuera no corrió: `codex` no está instalado y no lancé un subagente por mi cuenta. Decime si querés que lo haga, o instalá `npm install -g @openai/codex`.
