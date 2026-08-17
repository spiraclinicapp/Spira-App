# Handoff: Recepción (Spira Pharma) — reskin, formato de card "2c"

## Overview
Pantalla **Recepción** del módulo Pharma de Spira. Lista las recepciones de medicación agrupadas por día. Cada recepción es una *card documento* que combina, en un solo bloque: estado de verificación, identificación de la recepción (folio, fecha de ingreso, origen/protocolo) y el detalle de renglones de medicamento en tabla.

El reskin de esta iteración resuelve tres cosas:
1. Estado como **banda superior de color** en la card (pendiente / verificada), con el resumen de contenido a la derecha.
2. Origen (protocolo / ambulatoria / investigación) como **barra vertical de color + etiqueta + código**, sin label redundante, alineada a la derecha del header.
3. **Estructura rígida**: el header de la card usa exactamente la misma grilla de columnas que la tabla que está debajo, y las columnas centradas comparten eje con su título.

## About the Design Files
Los archivos `.html` de este bundle son **referencias de diseño creadas en HTML** — prototipos que muestran la apariencia y el comportamiento buscados, **no código de producción para copiar tal cual**. La tarea es **recrear estos diseños en el entorno existente del codebase destino** (React, Vue, SwiftUI, etc.), usando sus patrones, librerías y sistema de estilos. Si todavía no hay entorno definido, elegir el framework más apropiado e implementar ahí.

## Fidelity
**High-fidelity (hifi).** Colores, tipografía, espaciados y estados están definitivos. Reproducir la UI con exactitud usando las librerías del codebase. Los valores exactos están más abajo en *Design Tokens*; las medidas de cada bloque en *Screens / Views*.

---

## Screens / Views

### 1. Recepción — listado (pantalla completa)
**Purpose:** el farmacéutico revisa lo que llegó, verifica cada recepción e ingresa la medicación a stock.

**Layout (shell):** columna vertical de `100vh`.
- **Topbar**: `height 60px`, fondo `--white`, `border-bottom 1px --line`, `padding 0 20px`, `gap 14px`. Contiene marca "Spira" (logo gota+flecha, 24×29, trazo `--primary`), separador vertical `1px × 26px --line`, chip de módulo "Pharma" (ícono 26×26, `radius 7px`, fondo `rgba(168,132,47,.16)`), y a la derecha: buscador global (`250×38`, `radius 10px`, borde `--line2`, fondo `--surface`, atajo `Ctrl K` en `kbd`), botón campana (`38×38`, `radius 10px`), avatar (círculo `32px` `--primary`, iniciales `SC`, texto "Spira Clinic" 13.5px/600).
- **Body**: fila con `rail` + `submods` + `main`.
  - **Rail de módulos**: `width 64px`, fondo `--white`, `border-right 1px --line`, `padding 14px 0`, `gap 6px`; botones `40×40`, `radius 11px`; activo = fondo `rgba(168,132,47,.14)`, ícono `--pharma-solid`.
  - **Nav de submódulos**: `width 212px`, fondo `--surface`, `border-right 1px --line`, `padding 20px 14px`, `gap 2px`. Label "Submódulos" en estilo eyebrow. Ítems: `padding 9px 10px`, `radius 9px`, `gap 11px`, `13.5px/500`; activo = fondo `rgba(168,132,47,.14)`, texto `--pharma-solid`, `600`. Orden: Resumen, Protocolos, Medicamentos, **Recepción (activo)**, Dispensaciones, Reportes.
  - **Main**: header (`padding 22px 30px 0`) con breadcrumb `Spira Pharma › Recepción` (12.5px, `--muted`, actual en `--ink`/600), `h1` "Recepción" (`--fdisp` 700, `26px`, `letter-spacing -.02em`) y botón primario "Nueva recepción" a la derecha (`height 40px`, `padding 0 16px`, `radius 10px`, fondo `--pharma-solid`, texto `--on-accent` 13.5px/600, ícono `+`).
  - **Content**: `padding 18px 30px 40px`, `overflow auto`.

**Toolbar** (`margin-bottom 20px`, `gap 10px`, wrap):
- Buscador "Buscar recepción…": `flex 1`, `min-width 230px`, `max-width 340px`, `height 40px`, `radius 999px`, borde `--line2`, sombra `--sh-sm`, ícono lupa a `left 13px`, texto 13.5px, placeholder `--faint`.
- Chips de filtro (`height 34px`, `padding 0 15px`, `radius 999px`, borde `--line2`, texto 13px/500 `--muted`): **Todas** (seleccionado: fondo `rgba(168,132,47,.14)`, borde transparente, texto `--pharma-solid` 600), Pendientes, Protocolo, Ambulatoria. Separador vertical. Chips de rango: 7 días, 30 días.
- A la derecha: botón outline "Más filtros" (`height 36px`, `padding 0 13px`, `radius 10px`, borde `--line2`, fondo `--white`, 13px).

**Agrupación por día** (`.group + .group { margin-top: 26px }`):
- **Daybar**: `align-items baseline`, `gap 11px`, `padding 0 2px 10px`. Fecha en `--fdisp` 700 `14px` ("Miércoles 22 de julio"); regla `height 1px` `--line2` con `opacity .7` que ocupa el espacio libre; conteo a la derecha 12px `--muted` ("2 recepciones · 24 unidades").

### 2. Card de recepción (`.doc`) — el componente central del reskin
Contenedor: `background --white`, `border 1px --line`, `radius 16px`, `box-shadow --sh-sm`, `overflow hidden`, `margin-bottom 14px`, `display flex; flex-direction column`. Orden interno fijo: **banda de estado → header → tabla (o nota)**.

**a) Banda de estado (`.c-bar`)** — `padding 9px 20px`, `gap 12px`, `border-bottom 1px --line`, `align-items center`.
- Pendiente: fondo `rgba(176,130,63,.13)`, color de texto `--warn-ink` (= `color-mix(in oklab, var(--warn) 78%, var(--ink))`), ícono reloj 15px `currentColor` stroke 2.2.
- Verificada: fondo `rgba(92,138,90,.10)`, color `--good-ink` (= `color-mix(in oklab, var(--good) 78%, var(--ink))`), ícono check 15px stroke 2.6.
- `.lbl` (estado): 11px, `700`, `letter-spacing .14em`, uppercase. Textos: "Pendiente de verificar" / "Verificada".
- `.txt` (contexto): 12.5px `--muted`. Pendiente → "La medicación todavía no entró a stock." Verificada → "Ingresada a stock por M. Álvarez · 22 jul 08:19".
- **Solo si está verificada**, `.cont` a la derecha (`margin-left auto`), 12.5px `--muted`, mismo estilo que `.txt`: resumen de contenido — "2 medicamentos · 15 unidades", "24 kits". Las pendientes **no** muestran resumen.
- **Solo si está pendiente**, botón `.btn-v` a la derecha (`margin-left auto`): `height 30px`, `padding 0 13px`, `radius 8px`, fondo `--good`, texto `--on-accent` 12.5px/600, ícono check, label "Verificar e ingresar a stock".

**b) Header del documento (`.dhead`) — grilla rígida**
Este es el punto clave del reskin: **el header no es un flex libre, es un grid con las mismas columnas que la tabla**.

```css
.dhead{display:grid;grid-template-columns:29% 16% 12% 15% 16% 12%;align-items:center;
       background:var(--surface);border-bottom:1px solid var(--line)}
.dhead>*{padding:15px 20px 16px}          /* mismo padding lateral que th/td */
.dfolio{padding-left:17px;border-left:3px solid var(--primary)}  /* 17 + 3 = 20px */
.dcol{grid-column:2/4}                     /* ocupa col 2+3 para no cortar la fecha */
.c-orig{grid-column:5/7;justify-self:end}  /* borde derecho = borde de "Cantidad" */
```
- El padding lateral de las celdas del header es **20px**, idéntico al de `th`/`td`; por eso el texto de cada celda cae exactamente sobre el título de su columna.
- `.dfolio` compensa su borde de 3px con `padding-left:17px` para que el texto siga arrancando a 20px.
- Contenido celda 1: `.k` "Recepción" (10.5px/700, `letter-spacing .1em`, uppercase, `--muted`… en el folio se usa color `--primary`) + `.v` "Nº 1043" (`--fdisp` 700, `21px`, `margin-top 3px`, `font-variant-numeric tabular-nums`).
- Contenido celda 2–3 (`.dcol`): `.k` "Ingresada" (10.5px/700, `.1em`, uppercase, `--muted`) + `.v` fecha·hora (13.5px/500, `margin-top 2px`, `nowrap`) — p. ej. "22 jul 2026 · 09:14".
- Contenido celda 5–6 (`.c-orig`): `display flex`, `gap 10px`, `padding-left 11px`, `border-left 3px solid` con el color del destino; `.kind` 12.5px/600 en ese mismo color; `.pcode` 13.5px/500 `tabular-nums`, `letter-spacing .01em`, color `color-mix(in oklab, var(--muted) 40%, var(--ink))`. **Sin label** tipo "Protocolo:" — la barra de color es el indicador.
  - protocolo → `--primary` `#0F5F57`, texto "Protocolo" + código `EFC18419`
  - ambulatoria (`.amb`) → `--contable` `#3A6B8C`, "Ambulatoria" + `AMB-2291`
  - investigación (`.inv`) → `--pharma-solid` `#A8842F`, "Investigación" + `ACT18301`

**c) Tabla de renglones**
```css
table{border-collapse:collapse;width:100%;table-layout:fixed}  /* fixed es obligatorio */
th{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);
   font-weight:700;text-align:left;padding:9px 20px;white-space:nowrap}
td{padding:12px 20px;font-size:13px;vertical-align:middle}
.doc thead th{border-bottom:1px solid var(--line);padding-top:12px;background:var(--white)}
.doc tbody tr+tr td{border-top:1px solid var(--line)}
.doc tbody tr:last-child td{padding-bottom:15px}
```
`table-layout: fixed` es **requisito**: sin él el navegador ignora los anchos porcentuales de `th` y la grilla del header deja de coincidir.

Columnas y alineación (los porcentajes suman 100 y son los mismos del `.dhead`):

| # | Columna | Ancho | Alineación | Contenido |
|---|---------|-------|-----------|-----------|
| 1 | Medicamento | 29% | izquierda | `.mname` 13.5px/600 + `.mdrug` (monodroga) 11.5px `--muted`, `margin-top 1px` |
| 2 | Código / EAN | 16% | izquierda | `.ean` 13px/500 `tabular-nums`, `letter-spacing .01em`; código interno corto lleva `.qual` "interno" 11.5px `--muted`, `margin-left 5px` |
| 3 | Lote | 12% | **centrada** (`.c-c`) | `.lote`: chip `height 23px`, `padding 0 9px`, `radius 6px`, fondo `--surface`, borde `1px --line`, `--fmono` 12px |
| 4 | Vence | 15% | izquierda | `.venc` 13px/500 `tabular-nums`, `gap 6px`, `nowrap`; `.venc.w` = `--warn` con ícono triángulo, `.venc.d` = `--danger` con ícono círculo-alerta; normal sin ícono |
| 5 | Laboratorio | 16% | **centrada** (`.c-c`) | `.lab` 12.5px `--muted`; ausencia = "— sin cargar —" |
| 6 | Cantidad | 12% | derecha (`.c-r`) | `.qty`: `b` en `--fdisp` 700 `15px` + `i` unidad 11px `--muted`, `margin-left 3px`, `tabular-nums` |

**Regla de alineación adoptada:** en las columnas cuyo título es más ancho (o más angosto) que su valor —Lote y Laboratorio— se centra **título y valor** (`text-align:center` en `th` y `td`), de modo que compartan el mismo eje vertical. Las demás quedan alineadas al borde (izquierda; Cantidad a la derecha).

**d) Card sin renglones (`.dnote`)**
Cuando la recepción no tiene renglones de medicamento (p. ej. kits de investigación), en lugar de la tabla va una nota: `padding 13px 20px`, 12.5px `--muted`, `gap 9px`, ícono info 15px `--muted`. Texto usado: "Producto de investigación: cargamento inicial de kits, sin renglones de medicamento. Sin excursión de temperatura."

### Datos de ejemplo del prototipo (útiles para replicar 1:1)
- **Miércoles 22 de julio · 2 recepciones · 24 unidades**
  - Nº 1043 — pendiente — Protocolo EFC18420 — ingresada 22 jul 2026 · 09:14. Renglones: *Trelegy Ellipta 92/55/22 mcg* (Fluticasona + Umeclidinio + Vilanterol), EAN 7795373012288, lote TRE-4412, vence 30 jun 2026 (vencido → `.d`), GSK, 4 u. · *Salbutral 100 mcg* (Salbutamol), EAN 7795373019041, lote LOTE-11, vence 15 sep 2026 (próximo → `.w`), Roemmers, 5 u.
  - Nº 1042 — verificada (M. Álvarez · 22 jul 08:19) — 2 medicamentos · 15 unidades — Protocolo EFC18419 — ingresada 22 jul 2026 · 08:02. Renglones: *Alvetide 184/22 mcg*, código `01` + "interno", lote LOTE-8, vence 15 jul 2027, "— sin cargar —", 6 u. · *Salbutral 100 mcg*, EAN 7795373012288, lote LOTE-9, vence 16 jul 2027, Roemmers, 9 u.
- **Martes 21 de julio · 2 recepciones · 42 unidades**
  - Nº 1041 — verificada (J. Pereyra · 21 jul 16:40) — 2 medicamentos · 18 unidades — Ambulatoria AMB-2291 — ingresada 21 jul 2026 · 16:12. Renglones: *Donepecilo 10 mg*, EAN 7790987650012, lote DNP-77, vence 08 jun 2027, Roemmers, 12 u. · *Salbutamol 100 mcg*, EAN 7791122334455, lote SB-204, vence 28 jul 2026 (`.w`), Gador, 6 u.
  - Nº 1040 — verificada (M. Álvarez · 21 jul 10:05) — 24 kits — Investigación ACT18301 — ingresada 21 jul 2026 · 09:48 — sin tabla, con `.dnote`.

---

## Interactions & Behavior
- **Verificar e ingresar a stock** (botón en la banda pendiente): acción principal de la card. Al confirmarse, la card pasa de estado pendiente → verificada: la banda cambia de ámbar a verde, el botón se reemplaza por el texto "Ingresada a stock por <usuario> · <fecha hora>" y aparece a la derecha el resumen de contenido. Es el único cambio de estado del listado.
- **Chips de filtro**: selección única en el grupo de estado/origen (Todas / Pendientes / Protocolo / Ambulatoria) y en el de rango (7 / 30 días); filtran el listado y recalculan los conteos de cada daybar.
- **Buscador**: filtra por folio, medicamento, EAN, lote y código de protocolo.
- **Nueva recepción**: abre el flujo de alta (fuera del alcance de este handoff).
- **Hover**: chips y botones outline elevan a `--surface`; filas de tabla pueden usar un hover sutil (`--surface`) si el codebase ya lo hace. En el prototipo no hay animaciones: transiciones cortas (120–160ms, ease-out) son suficientes y opcionales.
- **Vencimientos**: la coloración es derivada, no un campo — vencido → `.venc.d` (`--danger`, ícono alerta circular); ≤ 90 días → `.venc.w` (`--warn`, ícono triángulo); resto → sin color ni ícono.
- **Responsive**: diseñado para escritorio a 1440×900 y más ancho. Por debajo de ~1100px la grilla de 6 columnas se aprieta; la estrategia sugerida es colapsar Laboratorio y luego Código/EAN, manteniendo siempre la coincidencia entre `.dhead` y la tabla (si se cambian los anchos, cambiarlos en los dos lugares — idealmente desde una única fuente de verdad).

## State Management
- `receptions[]`: `{ id, folio, status: 'pending'|'verified', receivedAt, verifiedBy?, verifiedAt?, origin: { kind: 'protocol'|'ambulatory'|'research', code }, lines[], note? }`
- `lines[]`: `{ name, drug, code, codeIsInternal, lot, expiresAt, lab?, qty, unit }`
- Derivados (no persistidos): resumen por card (`n medicamentos · n unidades`, o texto libre tipo "24 kits"), conteos por día en la daybar, severidad de vencimiento.
- Filtros de UI: `query`, `statusFilter`, `rangeFilter`.
- Agrupación: recepciones ordenadas por fecha descendente y agrupadas por día calendario.

## Design Tokens
```
Colores
--ink        #14302E   texto principal
--primary    #0F5F57   verde institucional / protocolo
--paper      #F4F1EA   fondo de app
--surface    #FBFAF6   fondos sutiles (header de card, nav)
--white      #FFFFFF   cards, topbar
--muted      #7C8C87   texto secundario
--faint      #A6B0AC   placeholders, eyebrow
--line       #E4DECF   bordes internos
--line2      #D8CBB0   bordes de control
--good       #5C8A5A   verificado / acción de verificar
--warn       #B0823F   pendiente / vencimiento próximo
--danger     #A6483B   vencido
--pharma-solid #A8842F módulo Pharma / investigación
--contable   #3A6B8C   ambulatoria
--on-accent  #F4F1EA   texto sobre acentos
--warn-ink   color-mix(in oklab, var(--warn) 78%, var(--ink))
--good-ink   color-mix(in oklab, var(--good) 78%, var(--ink))
Tintes: pendiente rgba(176,130,63,.13) · verificada rgba(92,138,90,.10) · activo pharma rgba(168,132,47,.14)

Tipografía
--fdisp  'Schibsted Grotesk' 400–800  → h1, folio, cantidades, fecha del día, marca
--ftext  'Hanken Grotesk' 400–700     → todo el texto de UI
--fmono  'IBM Plex Mono' 400–500      → lotes
Escala: 26/700 h1 · 21/700 folio · 15/700 cantidad · 14.5/600 módulo · 13.5/500-600 valores
        13 celdas · 12.5 secundario · 11.5 monodroga/qualifier · 11/700 label de estado (.14em)
        10.5/700 titulillos y th (.1em) · eyebrow 10.5/700 (.16em)
Números: font-variant-numeric: tabular-nums en folio, EAN, fechas, cantidades y códigos.

Espaciado
2 · 6 · 9 · 10 · 12 · 14 · 18 · 20 · 26 · 30 px
Padding lateral de card: 20px (th, td, .c-bar y celdas de .dhead — no cambiar por separado)
Content: 18px 30px 40px · gap entre cards 14px · entre grupos 26px

Radios
6 (chip de lote) · 7 · 8 (btn verificar) · 9 · 10 (botones/inputs) · 11 · 16 (card) · 999 (pills)

Sombras
--sh-sm  0 1px 2px rgba(20,48,46,.06)
--sh-md  0 12px 32px rgba(20,48,46,.10)

Grilla de columnas (compartida header + tabla)
29% / 16% / 12% / 15% / 16% / 12%   con table-layout: fixed
```

## Assets
- Sin imágenes ni assets binarios. Todos los íconos son **SVG inline, 24×24 viewBox**, stroke sin relleno, `stroke-width` 1.6–2.6 según tamaño de render (15–20px), `stroke-linecap/linejoin: round` donde aplica. Si el codebase ya tiene un set de íconos (Lucide, Phosphor, etc.), usar el equivalente y respetar grosor y tamaño.
- El logo de Spira es la gota con flecha descendente dibujada en SVG en el topbar y en el rail.
- Fuentes desde Google Fonts: Schibsted Grotesk, Hanken Grotesk, IBM Plex Mono.

## Files
- `Recepcion - Submodulo 2c.html` — pantalla completa: shell, toolbar, dos grupos por día, cuatro cards (una pendiente, dos verificadas con tabla, una verificada sin renglones). **Referencia principal.**
- `Recepcion - Reskin 1a (estado y EAN).html` — exploración previa de la card aislada: banda de estado, tratamiento de EAN/código interno y variantes del bloque de origen.
