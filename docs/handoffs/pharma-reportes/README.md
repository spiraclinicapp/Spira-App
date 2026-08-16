# Handoff: Spira Pharma · Reportes

## Overview

Pantalla de **Reportes** del módulo Pharma (farmacia de investigación clínica, Fundación
Scherbovsky). Es la vista de cierre de período: el farmacéutico elige un rango de fechas,
lee el resumen de movimientos (unidades dispensadas / ingresadas / balance), inspecciona la
evolución diaria y la composición por origen, y desde ahí **imprime** cualquier bloque como
hoja formal o exporta el detalle a Excel.

Tres capacidades que la distinguen de un dashboard genérico:

1. **Cada bloque es imprimible por separado.** Cada KPI, cada tabla y cada sección tiene su
   propio botón de impresión que arma una hoja A4 con encabezado institucional, período y
   filtros declarados. No hay "imprimir la pantalla": hay 14 reportes distintos.
2. **Dos tablas abren una ventana de reporte ampliado** (Ingresos por categoría, Consumo por
   paciente) con descripción en prosa, banda de indicadores, tabla con más columnas que la
   de pantalla, y botón de impresión.
3. **El recorte de filtros es global y se declara en cada hoja impresa** — regla de negocio,
   no decoración: el período y los filtros aparecen textualmente en el encabezado del papel.

## About the Design Files

Los archivos de este bundle son **referencias de diseño hechas en HTML**: prototipos que
muestran el aspecto y el comportamiento buscados, **no código de producción para copiar**.

La tarea es **recrear estos diseños dentro del entorno existente del codebase destino**
(React, Vue, Angular, lo que ya exista) usando sus patrones, su router, su capa de datos y
sus componentes ya establecidos. Si todavía no hay entorno, elegir el framework adecuado e
implementar allí.

En particular:

- El HTML usa `onclick=""` inline y funciones globales porque es un prototipo estático.
  En producción eso son handlers del framework.
- Los datos están hardcodeados (arrays y filas `<tr>` literales). En producción vienen de
  la API; ver *Data contract* más abajo, que es la parte más importante de este documento.
- Los gráficos están dibujados con SVG generado a mano en un IIFE. Se pueden reimplementar
  con la librería de charts del codebase **siempre que se respeten las decisiones visuales
  documentadas** (barras diferenciadas por fin de semana, media móvil de 7 días, grilla de
  5 líneas con tope fijo en 160).
- El sistema de impresión usa un `<div class="sheet">` oculto que se rellena y se muestra
  sólo en `@media print`. Es un patrón válido y se puede portar tal cual, o reemplazar por
  una ruta/vista de impresión dedicada. Ver *Sistema de impresión*.

## Fidelity

**High-fidelity (hifi).** Colores, tipografías, tamaños, espaciados, radios, estados hover y
copy están definitivos. Reproducir pixel-perfect con los componentes del codebase. Todo valor
numérico de este README está tomado del archivo fuente, no estimado.

- Ancho de diseño: **1440 px**, alto **1000 px** (`viewport="1440x1000"`).
- La pantalla es una app de altura fija: `height:100vh`, sin scroll de página; **sólo `.content`
  scrollea**.
- Único breakpoint declarado: `max-width:1180px` (ver *Responsive*).

---

## Design Tokens

Declarados en `:root`. Nombres tal como están en el prototipo; mapearlos a los tokens del
codebase si ya existen equivalentes.

### Color

| Token | Hex | Uso |
|---|---|---|
| `--ink` | `#14302E` | Texto principal, fondo de tooltip |
| `--primary` | `#0F5F57` | Verde Spira. Avatar, logo, línea de media móvil, categoría "Investigación" |
| `--paper` | `#F4F1EA` | Fondo de la app |
| `--surface` | `#FBFAF6` | Fondo de submódulos, inputs, `tfoot`, bandas de la modal |
| `--white` | `#FFF` | Tarjetas, tablas, topbar, rail |
| `--muted` | `#7C8C87` | Texto secundario, íconos inactivos |
| `--faint` | `#A6B0AC` | Encabezados de tabla, labels de KPI, placeholders, guiones "—" |
| `--line` | `#E4DECF` | Bordes y separadores por defecto |
| `--line2` | `#D8CBB0` | Borde de controles, borde inferior de `thead`, `tfoot` top |
| `--good` | `#5C8A5A` | Positivo: balance, estado "Entregada", barra de ingresadas |
| `--warn` | `#B0823F` | Rechazadas/canceladas |
| `--danger` | `#A6483B` | Vencimientos, estado "Rechazada" |
| `--pharma` | `#C9A24A` | Dorado Pharma claro: barras del gráfico (día hábil), borde del rango |
| `--pharma-solid` | `#A8842F` | Dorado Pharma sólido: acento de módulo, botones, links, barras de participación |
| `--on-accent` | `#F4F1EA` | Texto sobre fondos de acento |

Colores no tokenizados usados literalmente:

| Hex | Uso |
|---|---|
| `#DFD4B4` | Barras de fin de semana en el gráfico diario |
| `#3A6B8C` | Azul "Farmacia ambulatoria" (segmento del stack y categoría de tabla) |
| `#2E7D74` | Punto de estado "Lista para retirar" |
| `#EAE4D5` | Líneas de grilla del gráfico (todas menos la base) |
| `rgba(168,132,47,.14)` | Fondo de ítem de navegación activo y chips activos |
| `rgba(168,132,47,.16)` | Fondo del ícono de módulo en la topbar |
| `rgba(201,162,74,.07)` | Fondo de la caja de rango de fechas |
| `rgba(201,162,74,.08)` | Fondo hover del botón de impresión |
| `rgba(201,162,74,.05)` | Fondo hover de fila de tabla |
| `rgba(201,162,74,.15)` | Relleno del área bajo el sparkline |
| `rgba(20,48,46,.34)` | Backdrop de la modal |
| `rgba(20,48,46,.20)` | Sombra de la ventana modal |

### Tipografía

Dos familias de Google Fonts:

```
Schibsted Grotesk — 400 500 600 700 800   → --fdisp (display)
Inter             — 400 500 600 700       → --ftext (texto)
```

`-webkit-font-smoothing:antialiased` global. Base del body: **Inter 14px**, color `--ink`.

Escala completa, por elemento:

| Elemento | Familia | Tamaño | Peso | Otros |
|---|---|---|---|---|
| Logo "Spira" | display | 20px | 700 | — |
| Nombre de módulo "Pharma" | text | 14.5px | 600 | — |
| H1 "Reportes" | display | 26px | 700 | `letter-spacing:-.02em` |
| Breadcrumb | text | 12.5px | 400 / 600 (actual) | — |
| `.eyebrow` (label "Submódulos") | text | 10.5px | 700 | `letter-spacing:.16em`, uppercase, `--faint` |
| Ítem de navegación | text | 13.5px | 500 (600 activo) | — |
| `h2` de sección | display | 16.5px | 700 | `letter-spacing:-.01em` |
| Hint de sección | text | 12px | 400 | `--muted` |
| Label de KPI hero (`.hcard .k`) | text | 10.5px | 700 | `letter-spacing:.11em`, uppercase, `--faint` |
| Valor de KPI hero (`.hcard .v`) | display | **36px** | 800 | `letter-spacing:-.03em`, `line-height:1`, tabular |
| Sufijo del valor (`small`) | display | 13px | 600 | `--muted`, `margin-left:4px` |
| Footer de KPI (`.hcard .f`) | text | 12px | 400 | `--muted` |
| `.delta` (▲ 12%) | text | 11.5px | 600 | `--good` / `--danger` |
| Label de tira (`.scell .k`) | text | 12.5px | 400 | `--muted`, `line-height:1.35` |
| Valor de tira (`.scell .v`) | display | 21px | 700 | tabular |
| Valor textual de tira (`.scell .n`) | display | 14.5px | 700 | `line-height:1.3` |
| Título de chart (`.chead .t`) | display | 14px | 700 | — |
| Leyenda de chart | text | 11.5px | 400 | `--muted` |
| `thead th` de tabla | text | **10px** | 700 | `letter-spacing:.1em`, uppercase, `--faint`, nowrap |
| `tbody td` | text | 13px | 400 | — |
| `.sub` (segunda línea de celda) | text | 11.5px | 400 | `--muted`, `margin-top:2px` |
| `tfoot td` | text | 12.5px | 700 | — |
| Tabla `.dense` (detalle) | text | 12.5px | — | — |
| `.mini th` | text | 9.5px | 700 | `letter-spacing:.1em`, uppercase, `--faint` |
| `.mini td` | text | 12px | 400 | tabular |
| `.cat` (categoría) | text | 10.5px | 700 | `letter-spacing:.09em`, uppercase |
| `.st` (estado) | text | 12.5px | 600 (500 en `.pend`) | — |
| Título de modal (`.mt`) | display | 18px | 700 | `letter-spacing:-.01em` |
| Subtítulo de modal (`.ms`) | text | 12px | 400 | `--muted` |
| Prosa de modal (`.mbody p`) | text | 13px | 400 | `line-height:1.6` |
| `h4` de modal | text | 10.5px | 700 | `letter-spacing:.11em`, uppercase, `--faint` |
| Botones (`.btn-primary`, `.btn-outline`) | text | 14px | 600 | 13.5px dentro de la modal |
| Chips de preset | text | 13px | 600 | — |
| Tooltip | text | 11.5px | 600 | tabular |

**`font-variant-numeric: tabular-nums` en todo número** — clase `.num`, `.r`, `.c`, y en
`.hcard .v`, `.scell .v`, `.mini td`, `.shr .p`, `.brow .v2`, tooltip. No es opcional: las
columnas numéricas deben alinearse verticalmente.

### Espaciado, radios, sombras

| Valor | Uso |
|---|---|
| Radio `7px` | Ícono de módulo, botones de impresión chicos (`.pb`) |
| Radio `8px` | Tooltip, segmentos del stack |
| Radio `9px` | Ítems de navegación, `.printbtn`, `.mx` |
| Radio `10px` | Controles de filtro, botones, `.mtbl`, `.mband` |
| Radio `11px` | Botones del rail |
| Radio `14px` | **Todas las tarjetas y tablas** (`.hcard`, `.chart`, `.comp`, `.tbl`, `.strip`) |
| Radio `16px` | Ventana modal |
| Radio `999px` | Chips de preset, tracks de barras |
| Gap `12px` | Grid principal entre tarjetas y entre columnas |
| Sombra `--shadow-sm` | `0 1px 2px rgba(20,48,46,.06)` — todas las tarjetas |
| Sombra de modal | `0 18px 40px rgba(20,48,46,.20)` |
| Padding de `.content` | `18px 30px 48px` |
| Padding de celda | `13px 16px` (`12px 16px 9px` en `thead`; `10px 12px` en `.dense`) |
| Margen de `.sec-head` | `30px 0 12px` |

---

## Layout — el shell

`.app` es una columna flex de `100vh`, `min-height:0`:

```
┌──────────────────────────────────────────────────────────────┐
│ .topbar   height 60px, flex 0 0 60px                         │
├────┬────────────┬────────────────────────────────────────────┤
│rail│ .submods   │ .main (flex:1, min-width:0)                │
│64px│ 212px      │  ├ .main-head  padding 20px 30px 0         │
│    │            │  └ .content    flex:1; overflow:auto       │
└────┴────────────┴────────────────────────────────────────────┘
```

### Topbar (60px, fondo blanco, borde inferior `--line`)

De izquierda a derecha, `gap:14px`, `padding:0 20px`:

1. **Marca**: vilano Spira en SVG 24×29 (trazo `#0F5F57`, `stroke-width` 1.6 / 1.4) + "Spira"
   en display 20px/700, `gap:9px`.
2. Divisor vertical 1×26px `--line`.
3. **Módulo activo**: cuadrado 26×26 radio 7 con fondo `rgba(168,132,47,.16)` y el ícono de
   píldora en `#A8842F` 15×15; a la derecha "Pharma" 14.5px/600.
4. `margin-left:auto` → grupo derecho, `gap:8px`:
   - **Buscador falso**: 250×38, borde `--line2`, radio 10, fondo `--surface`, texto
     "Buscar…" en `--faint` 13.5px, y al final un `<span class="kbd">Ctrl K</span>` (11px,
     fondo blanco, borde `--line`, radio 6, padding `1px 6px`).
   - Dos `icon-btn` 38×38 radio 10 sin fondo: luna (tema) y campana (notificaciones), trazo
     `--muted` 1.8.
   - **Avatar**: círculo 32px `--primary` con "SC" en display 12.5px/700 color `--on-accent`,
     nombre "Spira Clinic" 13.5px/600, chevron.

### Rail de módulos (64px, blanco, borde derecho)

Columna centrada, `padding:14px 0`, `gap:6px`. Botones 40×40 radio 11. Cinco íconos: grid
(Inicio), actividad (Track), **píldora (Pharma — activo)**, candado (Admin), `.spacer`
flex:1, y ayuda al pie. Activo: fondo `rgba(168,132,47,.14)`, trazo `#A8842F`.

### Submódulos (212px, `--surface`, borde derecho)

`padding:20px 14px`, `gap:2px`. Contenido exacto:

```
SUBMÓDULOS                      (.eyebrow, padding 0 8px 10px)
Protocolos y pacientes          (ícono documento)
MEDICAMENTOS                    (.sec eyebrow, padding 14px 8px 6px)
  ┌ .grp — borde izquierdo 1px --line2, margin-left 11px, padding-left 3px
  │ Recepción                   (ícono clipboard-check)
  │ Stock                       (ícono píldora)
  │ Dispensación                (ícono caja)
  └
───────────────────────────────  (div 1px --line, margin 16px 10px 8px)
Reportes  ← ACTIVO              (ícono bar-chart)
```

Ítem: `padding:9px 10px`, radio 9, `gap:11px`, íconos 17×17, `white-space:nowrap`. Activo:
fondo `rgba(168,132,47,.14)`, color `#A8842F`, peso 600.

### Main head

Breadcrumb "Spira Pharma › **Reportes**" (12.5px, chevron `--faint` 14px), debajo H1
"Reportes" (display 26px/700, `margin:4px 0 0`). A la derecha, `margin-left:auto`, botón
primario **"Imprimir informe completo"** (40px alto, `padding:0 16px`, radio 10, fondo
`--pharma-solid`, texto `--on-accent` 14px/600, ícono impresora 16px, `gap:8px`).

> **Detalle de alineación que hay que preservar.** Un IIFE al final del script suma al
> `padding-right` del `.main-head` el ancho de la barra de scroll de `.content`
> (`30 + (offsetWidth - clientWidth)`), y lo recalcula en `resize`. Sin eso, el botón de la
> cabecera queda desalineado respecto del contenido cuando aparece el scroll. En el codebase
> destino puede resolverse con `scrollbar-gutter: stable` en `.content` si el soporte alcanza.

---

## Sección 1 — Filtros

Fila flex, `gap:10px`, `flex-wrap:wrap`, `padding:2px 0 16px`, borde inferior `--line`,
`margin-bottom:10px`.

| Control | Especificación |
|---|---|
| **Rango de fechas** | `.rangebox` — 38px alto, borde `1px solid --pharma`, fondo `rgba(201,162,74,.07)`, radio 10, display 14px/700 color `--pharma-solid`. Ícono calendario + `07/07/2026 – 06/08/2026` (en `.num`) + chevron. Es el disparador del date-picker. |
| **Presets** | Tres chips 34px alto, radio 999, `padding:0 14px`, 13px/600. `30 días` activo (fondo `rgba(168,132,47,.14)`, color `--pharma-solid`, borde `rgba(168,132,47,.35)`); `Mes en curso` y `Año` inactivos (blanco, borde `--line2`, color `--muted`). |
| Divisor | `.vdiv` 1×24px |
| **Filtros** | `.sel` 38px, borde `--line2`, radio 10, blanco: ícono embudo + "Filtros" (display 14px/700) + chevron. Abre el panel de filtros (documentado aparte en *Reportes - Filtros.html*). |
| Hint | "Sin filtros aplicados — el informe sale con todo el período", 12.5px `--muted` |

Debajo, `.appliedline` (12px `--muted`, `margin-bottom:20px`), copy **exacto**:

> Lo que elijas en **Filtros** vale para todo el apartado: cada reporte que imprimas sale con
> ese mismo recorte declarado en el encabezado de la hoja. El reporte de dispensaciones declara
> sólo el período, como el formato acordado.

---

## Sección 2 — Resumen del período

Cabecera: `h2` "Resumen del período" + regla + hint "Cada indicador se imprime solo desde su
ícono" + botón de impresión (`printReport('resumen')`).

### 2a. Tres KPI hero — `.hero`, `grid-template-columns:repeat(3,1fr)`, `gap:12px`

Tarjeta: blanco, borde `--line`, radio 14, `padding:14px 16px 12px`, `--shadow-sm`, columna
flex `gap:10px`, `position:relative`. Botón de impresión `.pb` absoluto en `top:9px;right:9px`,
26×26, radio 7, `opacity:.5` → `1` y color `--pharma-solid` en `:hover` de la tarjeta.

| # | Label | Valor | Contenido inferior |
|---|---|---|---|
| 1 | UNIDADES DISPENSADAS | `3.482` + `u.` | `.row`: valor + **sparkline de área** (`#sp1`). Footer: "214 dispensaciones · 112 u./día" + `.delta up` "▲ 12% vs. período anterior" |
| 2 | UNIDADES INGRESADAS | `4.150` + `u.` | `.row`: valor + **sparkline de barras** (`#sp2`). Footer: "26 recepciones verificadas · 6 semanas" |
| 3 | BALANCE DEL PERÍODO | `+668` + `u. de saldo`, color `--good` | Dos `.brow`: `Ingresadas / track 100% #5C8A5A / 4.150` y `Dispensadas / track 83.9% #A8842F / 3.482`. Footer: "el stock cerró el período en positivo" |

`.brow`: fila 12.5px, `gap:10px` — label `width:82px` 11.5px `--muted`; track `flex:1`,
`min-width:70px`, alto 10px, radio 999, fondo `--surface`, borde `--line`; valor
`width:52px`, alineado a la derecha, 600, tabular.

`.f` (footer de tarjeta): borde superior `--line`, `padding-top:9px`, `margin-top:auto` —
importante para que las tres tarjetas alineen sus footers.

### 2b. Tira de seis indicadores — `.strip`

Truco de grilla: `background:var(--line)` + `gap:1px` + `overflow:hidden` produce hairlines
sin bordes por celda. `grid-template-columns:repeat(3,1fr)` → 2 filas × 3. Radio 14,
`margin-top:12px`.

Celda `.scell`: blanco, `padding:12px 15px`, `min-height:66px`, flex con `align-items:center`,
`gap:14px`; label `flex:1` con `padding-right:24px`; valor alineado a la derecha con
`padding-right:30px` (deja aire para el botón de impresión absoluto).

| Label | Valor | Nota |
|---|---|---|
| Pacientes distintos atendidos | `96` | |
| Tiempo promedio de preparación | `41` + `min` | |
| Droga más dispensada | `Empagliflozina 25 mg` / `640 u. · 18,4%` | usa `.n` (14.5px) + segunda línea en Inter 11.5px/500 `--muted` |
| Protocolo con más dispensaciones | `SCH-2401` / `68 disp. · 31,8%` | idem |
| Rechazadas o canceladas | `7` + `· 3,3%` | `.scell.warn` → valor en `--warn` |
| Stock inmovilizado por vencimiento | `210` + `u.` | `.scell.danger` → valor en `--danger` |

---

## Sección 3 — Evolución y composición

`.chartrow`: `grid-template-columns:1.62fr 1fr`, `gap:12px`, `align-items:stretch`.

### 3a. Gráfico "Unidades dispensadas por día" (izquierda)

Tarjeta blanca radio 14, `padding:15px 18px 8px`.

Cabecera `.chead`: título display 14px/700 + leyenda a la derecha (`margin-left:auto`,
`gap:14px`, 11.5px `--muted`), con tres marcas: cuadrado 11px radio 3 `#C9A24A` "Día hábil",
cuadrado `#DFD4B4` "Fin de semana", y línea de 15px con `border-top:2.2px solid --primary`
"Media 7 días".

**Geometría del SVG** (`viewBox="0 0 1000 250"`, `width:100%`, `height:auto`):

```
W=1000  H=250  L=42 (margen izq)  R=12  T=18  B=32
MAX=160  (tope fijo del eje Y — no se autoescala)
n=31 días;  iw=(W-L-R)/n = 30.5;  bw=iw*0.6 = 18.3
barra_x(i) = L + iw*i + (iw-bw)/2
centro_x(i) = L + iw*i + iw/2
y(v) = T + (H-T-B)*(1 - v/MAX)
```

Orden de dibujo:

1. **Grilla**: 5 líneas horizontales en `0, 40, 80, 120, 160`. La de `0` en `#D8CBB0`, las
   demás en `#EAE4D5`, 1px. Etiqueta numérica a la izquierda (`x = L-8`, `text-anchor:end`,
   10.5px, `#A6B0AC`).
2. **Barras**: `rx="3"`, fill `#C9A24A` en día hábil y `#DFD4B4` si el índice está en el set
   de fin de semana.
3. **Media móvil de 7 días**: promedio de la ventana `[max(0,i-6) … i]` — ventana truncada al
   inicio, no se descartan los primeros días. Path `#0F5F57`, `stroke-width:2.2`,
   `stroke-linejoin/linecap:round`, sin relleno.
4. **Etiquetas del eje X**: cada 3 días, formato `d/m` (07/7, 10/7, 13/7…), centradas en
   `y = H-11`, 10px `#A6B0AC`.
5. **Zonas de hover**: 31 `<rect class="hz" data-i="i">` transparentes de ancho `iw` y alto
   `H-T-B`, encima de todo, para capturar el mouse por columna (no por barra).

**Tooltip** (`.tip`): absoluto dentro de `.chartwrap`, fondo `--ink`, texto `#F4F1EA`, radio 8,
`padding:6px 10px`, 11.5px/600, `transform:translate(-50%,-135%)`, `transition:opacity .12s`,
`pointer-events:none`, `z-index:4`. Se posiciona escalando la coordenada SVG por
`rect.width / 1000`. Texto: `"07/7 · 104 u."`, y `" · fin de semana"` si aplica.

### 3b. Mini tabla semanal (dentro de la misma tarjeta, debajo del gráfico)

`table.mini`, borde superior `--line`, `margin-top:10px`. Se **genera por JS** agrupando la
serie diaria. Columnas: `Semana · Días · Unidades · Prom./día · Máximo · Mínimo · % del total`.
Primera columna alineada a la izquierda con `padding-left:0`; el resto a la derecha.

En la celda de Unidades, además del número, una micro-barra `.mbar` (52×4px, radio 2, fondo
`--line`, relleno `--pharma-solid`) cuyo ancho es `unidades / máximo_semanal`.

Valores resultantes (verificar contra la implementación):

| Semana | Días | Unidades | Prom./día | Máx | Mín | % |
|---|---|---|---|---|---|---|
| 07 – 13 jul | 7 | 742 | 106 | 148 | 42 | 21,3% |
| 14 – 20 jul | 7 | 787 | 112 | 152 | 49 | 22,6% |
| 21 – 27 jul | 7 | 780 | 111 | 149 | 51 | 22,4% |
| 28 jul – 03 ago | 7 | 824 | 118 | 157 | 54 | 23,7% |
| 04 – 06 ago | 3 | 349 | 116 | 150 | 75 | 10,0% |
| **Total del período** | **31** | **3.482** | **112** | **157** | **42** | **100,0%** |

`tfoot` sin borde, peso 700, 12px.

### 3c. Composición del período (derecha) — `.comp`

Tarjeta blanca radio 14, `padding:15px 17px`, columna flex `gap:15px`. Título display 14px/700.

**Barra apilada** `.stack`: alto 28px, radio 8, `overflow:hidden`, tres segmentos con `title`:

| Segmento | Ancho | Color | Leyenda |
|---|---|---|---|
| Farmacia protocolo | 66.5% | `#A8842F` | `2.316 u. · 66,5%` |
| Farmacia ambulatoria | 28.3% | `#3A6B8C` | `986 u. · 28,3%` |
| Producto de investigación | 5.2% | `#0F5F57` | `180 u. · 5,2%` |

Leyenda `.stlg` (`margin-top:11px`, `gap:7px`, 12.5px): cuadrado 9px radio 3 + nombre
(`flex:1`, `--muted`) + valor (600, tabular).

**Ranking** `.rank`: borde superior `--line`, `padding-top:14px`, `gap:11px`. Cada `.rk` es un
grid `1fr auto` con la barra ocupando toda la fila siguiente (`grid-column:1/-1`, alto 7px,
radio 999, fondo `--surface`, borde `--line`, relleno `--pharma-solid`):

```
SCH-2401 · Cardio-Prevent III   31,8%
SCH-2312 · Glyco-Advance        24,3%
SCH-2405 · Respira-2            15,9%
SCH-2208 · Onco-Bridge          11,7%
Otros 2 orígenes                16,3%   ← label en --muted, barra en --faint
```

---

## Tablas

Shell común `.tbl`: blanco, borde `--line`, radio 14, `overflow:hidden`, `--shadow-sm`.
`table{width:100%;border-collapse:collapse;font-size:13px}`.

| Parte | Estilo |
|---|---|
| `thead th` | `text-align:left`, `padding:12px 16px 9px`, borde inferior **`--line2`**, 10px/700, `letter-spacing:.1em`, uppercase, `--faint`, nowrap |
| `tbody td` | `padding:13px 16px`, borde inferior `--line`, `vertical-align:middle` |
| última fila | sin borde inferior |
| hover de fila | `background:rgba(201,162,74,.05)` en todas las celdas |
| `tfoot td` | `padding:11px 16px`, fondo `--surface`, borde superior `--line2`, 700, 12.5px |
| `.tbl.dense` | celdas `10px 12px` / 12.5px; `th` `11px 12px 8px` |

Utilidades de alineación:

- `.r` → `text-align:right` + tabular
- `.c` → `text-align:center` + tabular

> **Decisión de diseño reciente y deliberada:** las columnas numéricas de conteo usan **`.c`
> (centrado)**, no `.r`, en las cuatro tablas donde el encabezado es mucho más ancho que el
> número ("DISPENSACIONES" sobre "68"). Alineado a la derecha, el número quedaba visualmente
> desconectado de su título. Las columnas de **Participación** siguen en `.r` porque su
> contenido es una barra con porcentaje que debe pegarse al borde derecho. Respetar esta
> distinción: es intencional, no una inconsistencia.

### 4. Dispensaciones por protocolo (`#t-protocolos`)

Columnas: `Protocolo` (izq) · `Dispensaciones` (c) · `Unidades` (c) · `Pacientes` (c) ·
`Participación` (r, `width:190px`).

Celda de protocolo: `.strong` (600) con el código, y `.sub` debajo (11.5px `--muted`,
`margin-top:2px`) con producto y sponsor.

| Protocolo | Sub | Disp. | Unid. | Pac. | Part. |
|---|---|---|---|---|---|
| SCH-2401 | Cardio-Prevent III · Boehringer | 68 | 1.120 | 31 | 31,8% |
| SCH-2312 | Glyco-Advance · Novo | 52 | 890 | 24 | 24,3% |
| SCH-2405 | Respira-2 · AstraZeneca | 34 | 512 | 16 | 15,9% |
| SCH-2208 | Onco-Bridge · Roche · producto de investigación | 25 | 402 | 11 | 11,7% |
| SCH-2410 | Neuro-Path I · Lundbeck | 18 | 318 | 8 | 8,4% |
| Farmacia ambulatoria | sin protocolo | 17 | 240 | 6 | 7,9% |
| **Total** | | **214** | **3.482** | **96** | **100%** |

**Celda de participación** `.shr`: grid `justify-items:end`, `gap:6px`, `min-width:112px`,
`margin-left:auto`. Arriba el porcentaje (12.5px/600 tabular), debajo un track de **3px** de
alto, radio 2, fondo `--line`, con relleno `--pharma-solid` de ancho = el porcentaje.

### 5. Medicamentos más dispensados (`#t-medicamentos`)

Columnas: `Droga y presentación` (izq) · `Categoría` (izq) · `Unidades` (c) ·
`Dispensaciones` (c) · `Participación` (r, 190px).

Categoría con `.cat` (10.5px/700, `letter-spacing:.09em`, uppercase): `Protocolo` en
`--muted`, `.cat.amb` "Ambulatoria" en `#3A6B8C`, `.cat.ip` "Investigación" en `--primary`.

| Droga | Categoría | Unid. | Disp. | Part. | Ancho de barra |
|---|---|---|---|---|---|
| Empagliflozina 25 mg comp. | Protocolo | 640 | 42 | 18,4% | 100% |
| Metformina 850 mg comp. | Protocolo | 585 | 39 | 16,8% | 91% |
| Atorvastatina 40 mg comp. | Protocolo | 470 | 31 | 13,5% | 73% |
| Rivaroxabán 20 mg comp. | Protocolo | 388 | 26 | 11,1% | 61% |
| Insulina glargina 100 UI/ml | Protocolo | 296 | 22 | 8,5% | 46% |
| Losartán 50 mg comp. | Ambulatoria | 265 | 18 | 7,6% | 41% |
| Enalapril 10 mg comp. | Ambulatoria | 198 | 14 | 5,7% | 31% |
| Kit de investigación · SCH-2208 | Investigación | 180 | 12 | 5,2% | 28% |
| Otros 11 medicamentos (label en `--muted`) | — | 460 | 10 | 13,2% | 72% |
| **Total** (colspan 2) | | **3.482** | **214** | **100%** | |

> Ojo: acá la barra está normalizada **contra el máximo de la columna** (640 = 100%), no
> contra el total. Es una decisión distinta de la tabla de protocolos, donde la barra es el
> porcentaje absoluto. Mantener ambas: en un ranking de dominancia la barra relativa lee mejor.

### 6. Detalle de dispensaciones (`#t-detalle`, `.tbl.dense`)

Cabecera de sección: `h2` + regla + hint "214 registros en el período" + botón `.btn-outline`
**"Excel"** + botón de impresión (`printReport('detalle')`).

10 columnas, todas alineadas a la izquierda: `N° · Fecha · Hora · Paciente · Código ·
Protocolo · Visita · Medicamentos · Sponsor · Estado`. `N°`, `Fecha`, `Hora` y `Código` llevan
`.num`. Los campos vacíos se muestran como `—` en `--faint`, nunca en blanco.

**Estado** — patrón `.st`: `inline-flex`, `gap:7px`, 12.5px/600, con un punto de 7px
(`border-radius:50%`, `flex:0 0 7px`) antes del texto. Tres variantes:

| Estado | Color del punto | Estilo del texto |
|---|---|---|
| Entregada | `#5C8A5A` | `.st` (peso 600, hereda `--ink`) |
| Lista para retirar | `#2E7D74` | `.st.pend` → `--muted`, peso 500 |
| Rechazada | `#A6483B` | `.st.bad` → `--danger` |

> Se eligió punto + texto en lugar de pill/badge para bajar el peso visual en una tabla densa
> de 10 columnas. No reemplazar por chips de fondo coloreado.

14 filas en pantalla, de la 1058 a la 1045 (06/08 → 30/07). `tfoot` con `colspan="10"`:
"Mostrando las 14 más recientes · el reporte impreso y el Excel salen con las 214 del período".

### 7 y 8. Par inferior — `.two` (`grid-template-columns:1fr 1fr`, `gap:12px`)

**Ingresos por categoría** (`#t-ingresos`) — `Categoría` (izq) · `Recepciones` (c) ·
`Unidades` (c):

```
Farmacia Protocolo           18   3.120
Farmacia Ambulatoria          6     810
Producto de investigación     2     220
Total                        26   4.150
```

**Consumo por paciente** (`#t-consumo`), con hint "SCH-2401" en la cabecera — `Paciente` (izq)
· `Dispensaciones` (c) · `Unidades` (c) · `Última` (c):

```
2401-014        6    112   04/08
2401-003        5     98   31/07
2401-021        5     90   28/07
2401-007        4     76   22/07
+27 pacientes del protocolo (--muted)   48   744   —
Total          68  1.120   31 pac.
```

Los botones de estas dos secciones **no imprimen directamente**: llaman a
`abrirReporte('ingresos')` / `abrirReporte('consumo')` y abren la ventana modal.

---

## Ventana de reporte (modal)

Sólo las dos tablas del par inferior la usan. Es un patrón de "reporte ampliado": lo que en
pantalla es un resumen de 3 columnas, en la ventana se explica y se abre a 6 columnas.

### Estructura y medidas

```
.modal      position:fixed; inset:0; z-index:40; flex centrado; padding:40px 24px
 ├ .mbk     backdrop rgba(20,48,46,.34) — cierra al click
 └ .mwin    max-width 720px; max-height 100%; blanco; borde --line2; radio 16
             sombra 0 18px 40px rgba(20,48,46,.20); columna flex; overflow:hidden
    ├ .mhead   padding 18px 20px 14px; borde inferior --line
    │   título (display 18px/700) + subtítulo (12px --muted) + .mx cerrar (32px, radio 9)
    ├ .mbody   padding 18px 20px 20px; overflow:auto; columna flex gap 16px
    └ .mfoot   padding 13px 20px; borde superior --line; fondo --surface
        nota (11.5px --muted, flex:1) + "Cerrar" (outline) + "Imprimir reporte" (primary)
        ambos botones a 36px de alto y 13.5px
```

Subtítulo, generado: `"Período " + RANGO + " · " + FILTROS` →
`Período 07/07/2026 – 06/08/2026 · Protocolo: todos · Categoría: todas · Medicamento: todos ·
Estado: todos`.
Nota del pie: "La hoja impresa sale con el mismo recorte declarado arriba".

Bloques disponibles dentro del cuerpo:

- **Prosa** `<p>`: 13px, `line-height:1.6`, color `--ink`.
- **Banda de indicadores** `.mband`: grid de 3 con el mismo truco de `gap:1px` sobre fondo
  `--line`; celdas en `--surface` con `padding:10px 13px`; label 9.5px/700 uppercase `--faint`,
  valor display 15px/700 tabular.
- **Subtítulo** `h4`: 10.5px/700 uppercase `--faint`, con `margin-bottom:8px`.
- **Tabla** envuelta en `.mtbl` (borde `--line`, radio 10, `overflow:hidden`). Estas tablas
  usan `.r` (derecha), no `.c`.

### Contenido — Ingresos por categoría

Título: "Ingresos por categoría". Prosa:

> Las 26 recepciones del período quedaron verificadas contra remito y orden de compra. Cada
> lote se cargó con su vencimiento y su ubicación de depósito; las diferencias de conteo se
> registran como observación del lote y no modifican el stock hasta que farmacia las concilia.

Banda: `Recepciones 26` · `Unidades ingresadas 4.150 u.` · `Lotes cargados 36`.

"Detalle por categoría" — `Categoría · Recepciones · Lotes · Unidades · Participación · Última`:

```
Farmacia Protocolo          18   24   3.120   75,2%   05/08
Farmacia Ambulatoria         6    9     810   19,5%   04/08
Producto de investigación    2    3     220    5,3%   29/07
Total                       26   36   4.150    100%
```

"Observaciones del período" — tabla sin `thead`, valor a la derecha en 600:

```
Recepciones con observación abierta               3
Unidades rechazadas en la verificación           40
Lotes con desvío de temperatura en el traslado    1
```

### Contenido — Consumo por paciente · SCH-2401

Prosa:

> 31 pacientes activos en Cardio-Prevent III. El consumo se calcula sobre las dispensaciones
> entregadas; los envases devueltos al cierre de cada visita se descuentan del total y la
> adherencia se estima contra las unidades previstas por el esquema del protocolo.

Banda: `Dispensaciones 68` · `Unidades entregadas 1.120 u.` · `Adherencia promedio 92%`.

"Pacientes con mayor consumo" — `Paciente · Visitas · Dispensaciones · Unidades · Última ·
Adherencia`:

```
2401-014                      6    6    112   04/08   98%
2401-003                      5    5     98   31/07   95%
2401-021                      5    5     90   28/07   92%
2401-007                      4    4     76   22/07   90%
2401-018                      4    4     72   21/07   88%
+26 pacientes del protocolo  44   44    672     —     91%
Total · 31 pacientes         68   68  1.120     —     92%
```

### Comportamiento

- Abre por click en el botón de impresión de la sección → `abrirReporte(key)`.
- Cierra por: botón `.mx`, botón "Cerrar", click en el backdrop, tecla **Escape**.
- "Imprimir reporte" **cierra la modal y luego dispara la impresión** de la clave declarada en
  `data-print` del template (`ingresadas` / `consumo`). Ese orden importa: la modal está
  oculta en `@media print`, pero cerrarla antes evita cualquier flash.
- `mbody.scrollTop = 0` al abrir.
- En producción: trap de foco y devolución del foco al disparador al cerrar (el prototipo no
  lo implementa; `role="dialog"`, `aria-modal="true"` y `aria-labelledby` sí están).

---

## Sistema de impresión

Es la mitad del valor de la pantalla. **14 reportes** distintos, todos disparados por
`printReport(key)`.

### Mecánica

1. Existe un `<div class="sheet" id="sheet" aria-hidden="true">` con `display:none`.
2. `printReport(key)` lo rellena con HTML y llama a `window.print()`.
3. En `@media print`: `.app` y `.modal` pasan a `display:none !important`, y `.sheet` a
   `display:block !important` con `color:#000; background:#fff`. `@page{margin:16mm}`.

### Estructura de la hoja estándar

```
Spira · Fundación Scherbovsky            (display 17px/700)
Farmacia de investigación                (11px)          ── borde inferior negro
────────────────────────────────────────────────────────
TÍTULO DEL REPORTE          emitido dd/mm/aaaa   ── borde inferior negro
Período   07/07/2026 – 06/08/2026
Filtros   Protocolo: todos · Categoría: todas · …
<cuerpo>
```

El cuerpo se compone con dos helpers:

- `kv([[label, valor], …])` → tabla de dos columnas (label 46%, valor en 700), separadores
  `1px solid #999`.
- `seccion(titulo, id)` → clona el `<table>` real de la pantalla (`#id table`) bajo un título
  en 11px/700 uppercase, dentro de un `<section style="break-inside:avoid">`.

Que la hoja **reutilice el DOM de la tabla** es intencional: garantiza que papel y pantalla no
divergan. En el codebase destino, el equivalente es renderizar la vista de impresión desde el
mismo dataset/componente, nunca desde una copia de los datos.

Estilos de impresión de las tablas clonadas: `thead th` fondo transparente y borde negro,
`tbody td` borde `#999`, `padding:6px 8px 6px 0`; y **se ocultan los adornos** — las barras de
`.shr .t`, los puntos de `.st i`, los colores de `.cat` (todo pasa a negro sobre transparente).
La celda `.shr` deja sólo el porcentaje alineado a la derecha.

### Catálogo de reportes

| Clave | Título impreso | Disparador | Cuerpo |
|---|---|---|---|
| `resumen` | RESUMEN DEL PERÍODO | ícono de la sección Resumen | 9 pares clave-valor |
| `dispensadas` | UNIDADES DISPENSADAS | KPI hero 1 | 4 pares + tabla de protocolos |
| `ingresadas` | UNIDADES INGRESADAS | KPI hero 2 / modal Ingresos | 2 pares + tabla de ingresos |
| `balance` | BALANCE DEL PERÍODO | KPI hero 3 | 3 pares |
| `pacientes` | PACIENTES ATENDIDOS | tira 1 | 2 pares + tabla de protocolos |
| `tiempos` | TIEMPO DE PREPARACIÓN | tira 2 | 3 pares |
| `medicamentos` | MEDICAMENTOS MÁS DISPENSADOS | tira 3 / sección 5 | tabla de medicamentos |
| `protocolos` | DISPENSACIONES POR PROTOCOLO | tira 4 / sección 4 | tabla de protocolos |
| `rechazadas` | DISPENSACIONES RECHAZADAS O CANCELADAS | tira 5 | 4 pares |
| `vencidos` | STOCK INMOVILIZADO POR VENCIMIENTO | tira 6 | 2 pares |
| `evolucion` | EVOLUCIÓN DIARIA | sección Evolución | 4 pares |
| `consumo` | CONSUMO POR PACIENTE · SCH-2401 | modal Consumo | tabla de consumo |
| `todo` | INFORME DE FARMACIA DEL PERÍODO | botón de la cabecera | resumen + las 5 tablas |
| `detalle` | REPORTE DE DISPENSACIONES | sección 6 | **hoja especial**, ver abajo |

Textos de los pares clave-valor (copy exacto, respetar):

- **resumen**: Unidades dispensadas `3.482 u. en 214 dispensaciones` · Unidades ingresadas
  `4.150 u. en 26 recepciones verificadas` · Balance del período `+668 u. de saldo` · Droga más
  dispensada `Empagliflozina 25 mg comp. — 640 u. (18,4%)` · Protocolo con más dispensaciones
  `SCH-2401 Cardio-Prevent III — 68 (31,8%)` · Pacientes distintos atendidos `96` · Tiempo
  promedio de preparación `41 min` · Rechazadas o canceladas `7 (3,3%)` · Stock inmovilizado
  por vencimiento `210 u. en 3 lotes`
- **dispensadas**: Total del período `3.482 u.` · Dispensaciones `214` · Variación vs. período
  anterior `+12%` · Promedio diario `112 u.`
- **tiempos**: Promedio del período `41 min` · Variación vs. período anterior `−6 min`
  (signo menos U+2212) · Muestra `207 dispensaciones entregadas`
- **rechazadas**: Total `7` · Sobre el total de pedidos `3,3%` · Rechazadas por farmacia `4` ·
  Canceladas por coordinación `3`
- **evolucion**: Días del período `31` · Promedio diario `112 u.` · Día de mayor movimiento
  `02/08 — 157 u.` · Día de menor movimiento `10/07 — 42 u.`
- **pacientes**: Pacientes distintos `96` · Dispensaciones por paciente `2,2 promedio`
- **vencidos**: Unidades inmovilizadas `210 u.` · Lotes vencidos en el período `3`

### Hoja especial: reporte de dispensaciones (`detalle`)

Formato acordado con la Fundación; no lleva el encabezado estándar sino el suyo
(`r.full === true` salta el header genérico):

```
Spira · Fundación Scherbovsky
Farmacia de investigación — reporte de dispensaciones     ── borde inferior negro
┌──────────────┬──────────────────┬─────────────────┐   .band, borde negro, divisores #999
│ PERÍODO      │ TOTAL REGISTROS  │ GENERADO POR    │
│ 7/7/2026 —   │ 214              │ María Rodríguez │
│ 6/8/2026     │                  │                 │
└──────────────┴──────────────────┴─────────────────┘
<tabla .dtbl de 10 columnas>
Spira · Pharma — Fundación Scherbovsky          dd/mm/aaaa   ── .foot, 9px, #666
```

- Este reporte **declara sólo el período, no los filtros** (a diferencia de todos los demás).
  Es requisito del formato acordado, está explicitado en el copy de `.appliedline`.
- El rango se escribe en formato corto y con em dash: `7/7/2026 — 6/8/2026` (`RANGO_CORTO`),
  distinto del `RANGO` de pantalla `07/07/2026 – 06/08/2026` (en dash). Los dos formatos son
  intencionales.
- `.dtbl`: 10px, `thead th` **fondo negro y texto blanco** con `print-color-adjust:exact`,
  8.5px uppercase `letter-spacing:.06em`; `tbody td` borde `#BBB`, `padding:5px 7px`,
  `vertical-align:top`.
- Estado vacío: una fila con `colspan="10"`, centrada, `padding:26px 0`, color `#666`, texto
  "Sin dispensaciones en el período".
- Las filas se leen del DOM (`filasDetalle()` recorre `#t-detalle tbody tr` y toma
  `textContent`). En producción: pedir las 214 filas al backend, no las 14 de pantalla.

### Export a Excel

`exportExcel()` arma un HTML con `<table border="1">` y lo descarga como
`.xls` (`application/vnd.ms-excel`) con BOM UTF-8, nombre
`dispensaciones_07-07-2026_06-08-2026.xls`. Cabecera del archivo: título, Período, Filtros,
Generado por, fila vacía, encabezados, filas.

En producción esto debería ser un endpoint que genere un `.xlsx` real con el dataset completo;
el nombre de archivo con el rango y el bloque de metadatos arriba de la tabla sí conviene
conservarlos.

---

## Data contract

Lo que el backend necesita entregar para una petición
`GET /pharma/reportes?desde=…&hasta=…&<filtros>`:

```ts
type Reportes = {
  periodo: { desde: string; hasta: string; dias: number };     // 2026-07-07 → 2026-08-06, 31
  filtros: { protocolo, categoria, medicamento, estado };       // "todos" cuando no hay recorte
  generadoPor: string;                                          // "María Rodríguez"

  resumen: {
    unidadesDispensadas: number;  // 3482
    dispensaciones: number;       // 214
    promedioDiario: number;       // 112
    variacionPct: number;         // +12
    unidadesIngresadas: number;   // 4150
    recepciones: number;          // 26
    balance: number;              // +668
    pacientesDistintos: number;   // 96
    tiempoPrepMin: number;        // 41
    tiempoPrepDeltaMin: number;   // -6
    rechazadas: number;           // 7
    rechazadasPct: number;        // 3.3
    unidadesInmovilizadas: number;// 210
    lotesVencidos: number;        // 3
    dropMasDispensada: { nombre, unidades, pct };
    protocoloTop: { codigo, dispensaciones, pct };
  };

  serieDiaria: { fecha: string; unidades: number; finDeSemana: boolean }[];  // 31 items
  sparklineIngresos: number[];                                              // 6 semanas

  composicion: { etiqueta: string; unidades: number; pct: number; color: string }[]; // 3
  rankingProtocolos: { etiqueta: string; pct: number }[];                            // 5 (última agregada)

  porProtocolo: { codigo, producto, sponsor, dispensaciones, unidades, pacientes, pct }[];
  porMedicamento: { nombre, categoria: 'protocolo'|'ambulatoria'|'investigacion',
                    unidades, dispensaciones, pct }[];
  ingresosPorCategoria: { categoria, recepciones, lotes, unidades, pct, ultima }[];
  consumoPorPaciente: { codigo, visitas, dispensaciones, unidades, ultima, adherenciaPct }[];

  detalle: { nro, fecha, hora, paciente, codigo, protocolo, visita,
             medicamentos, sponsor, estado: 'entregada'|'lista'|'rechazada' }[];
};
```

Reglas de consistencia que el prototipo respeta y la implementación debe mantener:

- `serieDiaria` suma exactamente `resumen.unidadesDispensadas` (**3.482**).
- `porProtocolo` y `porMedicamento` suman `3.482` unidades y `214` dispensaciones.
- `porProtocolo` suma `96` pacientes.
- `ingresosPorCategoria` suma `4.150` unidades y `26` recepciones.
- `balance = unidadesIngresadas − unidadesDispensadas`.
- `promedioDiario = round(3482 / 31) = 112`.
- Los agregados ("Otros 11 medicamentos", "Otros 2 orígenes", "+27 pacientes del protocolo")
  son filas calculadas, no registros: se muestran en `--muted` y siempre al final.

Serie diaria del prototipo (desde 07/07/2026, un valor por día):

```
104 131 58 42 126 148 133 | 119 141 61 49 152 138 127 | 144 122 66 51 130 149 118
136 128 72 54 142 157 135 | 124 150 75
```

Índices de fin de semana (0-based): `2 3 9 10 16 17 23 24 30`. Máximo 157 (02/08), mínimo
42 (10/07). En producción el flag de fin de semana se deriva de la fecha, no de un set fijo.

Formato numérico: **es-AR** — punto como separador de miles, coma decimal (`3.482`, `31,8%`,
`2,2 promedio`). Fechas `dd/mm/aaaa` en tablas y `dd/mm` en columnas cortas.

---

## State Management

Estado mínimo de la pantalla:

| Estado | Valores | Efecto |
|---|---|---|
| `rango` | `{desde, hasta}` | recarga todo; se muestra en `.rangebox` y en cada hoja impresa |
| `preset` | `30dias` \| `mesEnCurso` \| `anio` \| `custom` | chip activo; ajusta `rango` |
| `filtros` | protocolo, categoría, medicamento, estado | recarga todo; se serializa a la línea `FILTROS` |
| `modalAbierta` | `null` \| `'ingresos'` \| `'consumo'` | ventana de reporte |
| `hoverDia` | `null` \| índice 0–30 | tooltip del gráfico |
| `reporteEnCurso` | clave de `REPORTES` | qué se imprime al confirmar desde la modal |

Notas:

- `filtros` es **global al apartado**, no por tabla. Todo reporte impreso hereda el recorte.
- La tabla de detalle muestra 14 filas fijas ("las más recientes"); paginación o "ver todas"
  no están diseñados. Si el backend devuelve las 214, definir con diseño antes de agregar
  paginación.
- Faltan por diseñar: **loading**, **error** y **vacío** de la pantalla completa. El único
  estado vacío resuelto es el de la hoja impresa de detalle. Pedir esas pantallas antes de
  implementarlas por cuenta propia.

## Interactions & Behavior

| Elemento | Interacción |
|---|---|
| `.rangebox` | abre selector de rango (no diseñado en este archivo) |
| Chips de preset | selección única; recalculan el rango |
| `.sel` "Filtros" | abre el panel de filtros — ver `Reportes - Filtros.html` |
| `.printbtn` de sección | `printReport(clave)` directo, sin confirmación |
| `.pb` de KPI / tira | idem, para su métrica |
| `.printbtn` de Ingresos y Consumo | abren la **modal**, no imprimen |
| Botón "Excel" | descarga inmediata |
| Botón "Imprimir informe completo" | `printReport('todo')` |
| Gráfico | hover por columna → tooltip; `mouseleave` del contenedor lo oculta |
| Fila de tabla | hover `rgba(201,162,74,.05)`; **no hay click de fila diseñado** |
| Modal | Escape / backdrop / `.mx` / "Cerrar" cierran; "Imprimir" cierra y luego imprime |

Estados hover explícitos: `.printbtn:hover` y `.mx:hover` → borde y color `--pharma-solid`
(el primero además fondo `rgba(201,162,74,.08)`); `.btn-outline:hover` → borde y texto
`--pharma-solid`; `.hcard:hover .pb` / `.scell:hover .pb` → `opacity:1` + color acento;
`a:hover` → `--ink`. Transición declarada: sólo la del tooltip (`opacity .12s`). No hay
animaciones de entrada; no agregar.

## Responsive

Un único breakpoint: **`max-width:1180px`** → dentro de los KPI hero, `.hcard .row` pasa a
columna (`flex-direction:column; align-items:stretch; gap:8px`) y el sparkline ocupa el ancho
completo. El resto del layout no está diseñado para tablet o móvil. Si el codebase lo exige,
pedir esos diseños.

Detalles que sostienen el layout en anchos angostos y hay que preservar: `min-width:0` en
`.main`, `white-space:nowrap` en `thead th` y en los controles de filtro, `flex-wrap:wrap` en
`.filters` y en la leyenda del gráfico, `min-width:70px` en `.brow .track`,
`min-width:84px` en `.hcard .spark`, `min-width:112px` en `.shr`.

## Accessibility

Lo que ya está: `lang="es"`, `role="dialog"` + `aria-modal` + `aria-labelledby` en la modal,
`aria-hidden` en la hoja de impresión, `title` en los botones de ícono, cierre por Escape.

Lo que falta y hay que agregar en producción:

- Focus trap en la modal y devolución del foco al disparador.
- `aria-label` explícito en cada botón de impresión (hoy sólo `title="Imprimir"`, ambiguo
  cuando hay nueve en pantalla): "Imprimir unidades dispensadas", etc.
- El gráfico SVG necesita `role="img"` + `aria-label`, o mejor: la mini tabla semanal ya es su
  equivalente textual — asociarla explícitamente.
- Los estados se distinguen por color **y texto**, lo cual ya cumple; mantenerlo así.
- Contraste: `--faint` (`#A6B0AC`) sobre blanco queda por debajo de 4.5:1. Se aceptó para
  labels de 10px en 700, pero **no usarlo para texto de lectura**.
- `aria-pressed` en los chips de preset y `aria-current` en la navegación activa.

## Assets

Sin imágenes ni sprites. Todo ícono es **SVG inline**, `viewBox="0 0 24 24"`, `fill="none"`,
`stroke-width:1.8` (el logo usa 1.6/1.4), `stroke-linecap`/`linejoin:round`, tamaños 14 / 15 /
16 / 17 / 18 / 20 px según contexto. El set corresponde a íconos de trazo estándar (línea
Lucide/Feather): grid, activity, pill, lock, help-circle, file-text, clipboard-check, package,
bar-chart, calendar, filter, chevron-down, chevron-right, search, moon, bell, printer, x.

El **vilano Spira** de la topbar sí es una marca propia: SVG 24×29 en `#0F5F57`. Está también
como archivo en `assets/vilano-mark.svg` y variantes en el proyecto de identidad. Usar el
asset de marca del codebase si ya existe; no redibujarlo.

Fuentes: Google Fonts (`Schibsted Grotesk`, `Inter`) con `preconnect` a
`fonts.googleapis.com` y `fonts.gstatic.com`. En producción, self-hosting.

## Files

| Archivo | Qué es |
|---|---|
| `Pharma - Reportes.html` | **La referencia principal.** Autocontenido: markup, CSS, gráficos y sistema de impresión. Abrir en el navegador; probar `Ctrl/Cmd+P` desde cada botón de impresión y las dos modales. |
| `colors_and_type.css` | Tokens de color y tipografía del design system Spira, para cotejar nombres |

En el proyecto de diseño, contexto adicional relacionado (no incluido en este bundle):
`Pharma - Subnav.html` (navegación del módulo), `Reportes - Filtros.html` (el panel de
filtros), `Recepcion - Pulida.html` y `Dispensación - Paso a paso B.html` (las pantallas que
alimentan estos datos), `Manual de Marca.html` (identidad completa).

## Implementation checklist

1. Tokens: verificar que los 13 colores, las 2 familias y los radios existan en el codebase;
   agregar los que falten con estos nombres.
2. Shell: topbar + rail + submódulos + main con `.content` como único scroller.
3. Compensación del scrollbar en `.main-head` (o `scrollbar-gutter:stable`).
4. Barra de filtros con rango, presets y disparador del panel.
5. Los 3 KPI hero, incluidos los dos sparklines y las barras del balance.
6. La tira de 6 indicadores con el patrón de hairline por `gap`.
7. Gráfico diario: barras con distinción de fin de semana, media móvil de 7 días con ventana
   truncada, grilla de tope fijo 160, tooltip por columna.
8. Mini tabla semanal derivada de la serie diaria, con micro-barras.
9. Panel de composición: stack de 3 + ranking de 5.
10. Las 5 tablas, respetando `.c` en conteos y `.r` en participación.
11. Estados como punto + texto (3 variantes).
12. Modal de reporte ampliado para Ingresos y Consumo, con focus trap.
13. Sistema de impresión: 14 claves, hoja estándar + hoja especial de detalle, reutilizando el
    mismo dataset que la pantalla.
14. Export a Excel con metadatos en la cabecera.
15. Pendiente de diseño antes de implementar: loading, error, vacío, responsive < 1180px,
    paginación del detalle.
