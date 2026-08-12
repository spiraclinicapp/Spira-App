# Handoff: Dispensación — Paso a paso (cajón lateral)

Producto: **Spira Pharma** (módulo de farmacia).
Feature: pantalla de dispensación de medicamentos, versión "paso a paso B".
Idioma de la UI: **español rioplatense** (voseo: "Escaneá", "Imprimí", "Marcar lista").
Fecha del handoff: 11/08/2026.

---

## 1. Overview

Un farmacéutico abre una dispensación pendiente desde la bandeja de trabajo y la resuelve en un **cajón lateral (drawer) de 720 px anclado a la derecha**, sin perder de vista la lista detrás.

El flujo tiene tres pasos y siempre muestra **un paso a la vez** en el área de trabajo, con un riel vertical a la izquierda que da contexto de dónde está y qué falta:

1. **Preparar y escanear** — imprimir la constancia del investigador principal (IP) y confirmar cada unidad de cada medicamento con el lector de código de barras.
2. **Lista para retirar** — comprobante emitido, se imprime para el mostrador.
3. **Entregar** — se entrega al paciente, se descuenta stock.

El objetivo de diseño es **velocidad con lector de código de barras**: el foco vive en el input de escaneo, el lector escribe y envía `Enter` solo, y cada pasada suma una unidad. El farmacéutico no debería tener que tocar el mouse en el camino feliz.

---

## 2. About the Design Files

**Los archivos de este bundle son referencias de diseño hechas en HTML/CSS/JS plano.** Son prototipos que muestran el aspecto y el comportamiento buscados; **no son código de producción para copiar tal cual**.

La tarea es **recrear estos diseños en el entorno del codebase de destino** (React, Vue, SwiftUI, nativo, etc.) usando sus patrones y librerías ya establecidos. Si todavía no hay entorno definido, elegir el framework más apropiado para el proyecto e implementarlo ahí.

Cosas del prototipo que **no** deben viajar a producción:

- Todo se re-renderiza con `el.innerHTML = ...` en un solo `render()`, y el estado vive en un objeto global `S`. En producción esto debe ser estado de componente/store con render declarativo.
- Los handlers son atributos `onclick="..."` en strings de HTML. Reemplazar por handlers reales.
- La función `print()` del prototipo **sombrea `window.print`**. En producción usar otro nombre (`printIpConsent()`).
- `barcode()` dibuja un código de barras **decorativo** (barras pseudoaleatorias derivadas de los dígitos, no un EAN-13 real). Si hay que mostrar un código escaneable, usar una librería de EAN-13 de verdad.
- Los datos (3 medicamentos, participante, protocolo, constancia PDF) son **mock**. Ver §7 para el modelo de datos.

---

## 3. Fidelity

**High-fidelity (hifi).** Colores, tipografía, espaciados, radios, estados y copy están definitivos. Recrear pixel-perfect usando los componentes existentes del codebase donde equivalgan.

Dos aclaraciones de fidelidad:

- La UI está construida sobre el design system **Spira** (`colors_and_type.css`, incluido). Si el codebase ya tiene esos tokens, usar los del codebase — no re-declarar hex sueltos.
- El **visor de PDF** del prototipo es una maqueta: renderiza una "hoja" HTML escalada con `transform: scale()`. En producción es un visor de PDF real (pdf.js o el visor nativo del sistema). Lo que hay que respetar es el **chrome del visor** (barra oscura, controles, zoom, botón Imprimir destacado), no la técnica.

---

## 4. Layout general del cajón

```
body: fondo #E9E4D8, display:flex, justify-content:flex-end
└── .cajon  720 × 100vh, bg var(--paper) #F4F1EA
    box-shadow: -18px 0 48px rgba(20,48,46,.14)
    overflow hidden, position relative  ← ancla del visor y del toast
    │
    ├── .hd        header fijo   (flex:0 0 auto)
    ├── .split     flex:1, display:flex, min-height:0
    │   ├── .rail  240 px fijos, riel de proceso
    │   └── .work  flex:1
    │       ├── .body  flex:1, overflow-y:auto   ← el paso actual
    │       └── .ft    footer fijo con acciones
    ├── .viewer   overlay absoluto (visor de constancia), z-index 20
    └── .toast    absoluto, z-index 15
```

**No hay bordes laterales en el cajón** (decisión explícita): la separación con el fondo la da la sombra izquierda.

### 4.1 Header `.hd`

- `background: #FFFFFF`, `border-bottom: 1px solid var(--line)`, `padding: 16px 22px 15px`.
- `.hd-top`: flex, `align-items:flex-start`, `gap:10px`.
- Título `h2`: **Schibsted Grotesk 700, 17px, letter-spacing −0.01em**, sin margen. Texto: `D-1046 · Preparando` / `· Lista para retirar` / `· Entregada` (según paso).
- Subtítulo `.sub`: flex wrap, `gap:8px`, `margin-top:5px`, **12.5px**, color `var(--muted)`. Items separados por puntos `.d` (3×3 px, círculo, `background: var(--line2)`):
  `Susana Rodríguez` (color `--ink`, weight 600) · `03200070001` · `ACT18301` · `Fuera de cronograma`
- Dos `.icobtn` a la derecha: 32×32, `border-radius:9px`, transparente, color `--muted`.
  Hover: `background: var(--surface)`, `border-color: var(--line)`, `color: var(--ink)`.
  Primero = menú `⋯` (tooltip "Rechazar, reasignar, historial"), segundo = cerrar `✕`.

### 4.2 Riel de proceso `.rail`

- `width: 240px`, `background: var(--surface)` #FBFAF6, `border-right: 1px solid var(--line)`, `padding: 18px 15px`, columna flex, scroll vertical propio.
- Eyebrow "PROCESO" arriba (`.eyebrow`, `margin-bottom:16px`).
- `.rflow` es el contenedor de los 3 nodos y dibuja la **espina continua**:
  - `::before` — línea de fondo: `position:absolute; left:11.5px; top:14px; bottom:14px; width:1.5px; background: var(--line)`.
  - `i.prog` — tramo recorrido: mismo `left/top/width`, `background: rgba(46,125,116,.5)`, **altura según paso**: `0%` en paso 1, `38%` en paso 2, `76%` en paso 3.
- `.rnode`: flex, `gap:11px`, `padding-bottom:16px` (el último 0).
- `.dot` (nodo): **24×24**, círculo, centrado con flex, **12px / weight 700 / line-height 1 / tabular-nums**, tipografía de texto (no mono — se probó mono y se descartó: se veía fino y descentrado), `border: 1.5px solid var(--line2)`, `color: var(--faint)`, `background: var(--surface)`, `z-index:1`.
  - `.rnode.cur .dot`: `background`+`border-color` `var(--ph)` (petróleo), `color:#fff`, `box-shadow: 0 0 0 3px rgba(15,95,87,.16)` ← halo del paso actual.
  - `.rnode.done .dot`: `background: rgba(46,125,116,.14)`, `border-color: rgba(46,125,116,.5)`, `color: var(--teal)`, y **muestra un tilde en vez del número**.
- `.tt` (label del nodo): 13px, `color: var(--muted)`, `line-height:1.3`, `padding-top:3px`.
  `.cur .tt` → `color: var(--ink)`, weight 700. `.done .tt` → `color: var(--ink-soft)` #3D5D59.
- **Requisitos del paso actual** (`.reqs`) — sólo se renderizan dentro del nodo actual, agrupados en una tarjeta blanca: `margin-top:9px`, `background:#fff`, `border:1px solid var(--line)`, `border-radius:10px`, `overflow:hidden`.
  - `.req`: flex, `gap:8px`, `padding:7px 9px`, **11.5px**, `color: var(--muted)`, `line-height:1.25`; separador `border-top:1px solid var(--line)` entre filas.
  - Glifo `.gl` 13×13: aro `.ring` 9×9 `border:1.5px solid var(--line2)` para pendiente; ícono tilde para cumplido.
  - Contador `.ct` a la derecha: **IBM Plex Mono 10.5px**, `color: var(--faint)`. Formato `n/total`.
  - Estados: **`.on`** = primer pendiente → `color:--ink`, weight 600, `background: rgba(15,95,87,.08)`, aro con `border-color: var(--ph)` y `border-width:2.5px`, `.ct` en `var(--deep)`. **`.ok`** = cumplido → `color:--ink-soft`, glifo y `.ct` en `var(--good)`.
  - Con contador, el texto trunca con ellipsis (`.req.hasct .tx`).
  - Contenido en paso 1: `Constancia del IP impresa` + una fila por medicamento con su `n/qty`.
  - Contenido en paso 2: `Comprobante N° 1046` (ok) + `Imprimir para el mostrador` (on).
- `.railfoot` (pegado abajo con `margin-top:auto`, `padding-top:18px`, 11.5px, `color:--ink-soft`): resumen del bloqueo. Con pendientes muestra un punto ámbar `.pend` (7×7, `background: var(--warn)`, `margin-top:4px`) + el texto del gate; sin pendientes muestra tilde verde + `Sin pendientes`.

### 4.3 Footer `.ft`

`background:#fff`, `border-top:1px solid var(--line)`, `padding:13px 22px`, `.ftrow` flex con `gap:10px` y un `.spacer{flex:1}` separando izquierda de derecha.

| Paso | Izquierda | Derecha |
|---|---|---|
| Preparar y escanear | `Cancelar` (`.btn.ghost`) | `Marcar lista para retirar` (`.btn.teal`, **disabled mientras haya gate**) |
| Lista para retirar | `Imprimir comprobante` (`.btn.out` + ícono impresora) | `Entregar al paciente →` (`.btn.teal`) |
| Entregada | `Reiniciar demo` (`.btn.ghost`, sólo del prototipo) | `Imprimir comprobante` (`.btn.out`) |

---

## 5. Paso 1 — Preparar y escanear (pantalla principal)

Orden vertical dentro de `.body` (`padding: 20px 22px 24px`):

1. `h3.h6` **Preparar y escanear** — Schibsted Grotesk 700, 16px, `letter-spacing −0.005em`, `margin:0 0 4px`.
2. `p.lede` — 13px, `color:--muted`, `line-height:1.5`, `margin-bottom:16px`:
   "Dos requisitos: la constancia impresa y cada medicamento confirmado con el lector."
3. **Tarjeta de la constancia del IP** (`.ipcard`).
4. **Campo de escaneo** (`.scan`).
5. Hint o error.
6. **Contador de unidades** (`.ctop`).
7. **Lista de medicamentos** (`.groups` con `.ccard` por medicamento).
8. Nota al pie (`.note`).

### 5.1 Tarjeta de la constancia del IP — `.ipcard`

`display:flex; gap:13px; padding:13px 14px; border-radius:12px; margin-bottom:16px; align-items:center`.

- Pendiente: `background: rgba(15,95,87,.09)`, `border: 1px solid rgba(15,95,87,.30)`.
- Impresa (`.ok`): `background: rgba(46,125,116,.08)`, `border-color: rgba(46,125,116,.26)`.

Contenido:

- **Miniatura `.thumb`** — 62×80, `border-radius:5px`, `overflow:hidden`, `background:#fff`, `border:1px solid var(--line2)`, `box-shadow: 0 2px 6px rgba(20,48,46,.10)`, `cursor: zoom-in`. Adentro, la hoja real renderizada a `width:620px` con `transform: scale(.1)` y `transform-origin: top left` (en producción: primera página del PDF). Hover: `border-color: var(--ph)` y aparece un overlay `.zoom` (`background: rgba(20,48,46,.42)`, ícono expandir blanco, `opacity 0→1` en `.14s`). Click → abre el visor.
- **Título `.t1`** — 13.5px weight 600, flex con `gap:7px`:
  - pendiente: ícono alerta en `var(--deep)` + "Falta imprimir la constancia del IP"
  - impresa: ícono matraz en `var(--teal)` + "Constancia del IP impresa"
- **Subtítulo `.t2`** — 11.5px `--muted`, truncado: `Constancia IP — Susana Rodríguez.pdf`
- **Tres botones** (`.btn.sm`, `gap:7px`, `margin-top:9px`), en este orden:
  1. `Ver` (`.out`, ícono ojo) → abre el visor
  2. `Descargar` (`.out`, ícono descarga) → descarga el PDF
  3. `Imprimir` — `.pri` (petróleo lleno) mientras no se imprimió; una vez impresa pasa a `.out` y el label cambia a **`Imprimir de nuevo`**

### 5.2 Campo de escaneo — `.scan`

`display:flex; align-items:center; gap:10px` (el botón queda **centrado vertical** respecto al input, no estirado).

- `input`: `flex:1`, **height 52px**, `border-radius:12px`, `border:1px solid var(--line2)`, `background:#fff`, `padding:0 16px`, **15px**, `font-variant-numeric: tabular-nums`, tipografía de texto (se probó mono y se descartó), `outline:none`.
  `placeholder`: `Escaneá o tipeá el código…`, color `var(--faint)`.
  Focus: `border-color: var(--ph)` + `box-shadow: 0 0 0 4px rgba(15,95,87,.14)`.
- Botón `Confirmar`: `.btn.pri` (42px, petróleo) con ícono de barras a la izquierda.
- **El input se auto-enfoca** al montar y **se re-enfoca después de cada render** si tenía el foco (ver §6.1). No se enfoca mientras el visor está abierto.
- `Enter` en el input = confirmar (así trabaja el lector, que teclea y manda Enter solo).

Debajo, **hint** `.hint` (12px, `--muted`, `margin-top:11px`):
`El lector escribe y confirma solo · una pasada por unidad` → cuando está todo, `Todo escaneado`.

Si hay error, el hint se **reemplaza** por `.err`: flex `gap:8px`, `padding:10px 12px`, `border-radius:10px`, 12.5px, `line-height:1.4`, `background: rgba(166,72,59,.08)`, `border:1px solid rgba(166,72,59,.28)`, `color: var(--danger)`, con ícono de alerta.

### 5.3 Contador de unidades — `.ctop`

`display:flex; align-items:baseline; gap:10px; margin:18px 0 12px`.

- `.k` — **23px, weight 700, letter-spacing −0.01em, tabular-nums**, tipografía de texto: `0/6`.
- `.l` — 12.5px `--muted`: `unidades escaneadas`.
- `.r` — `margin-left:auto`, 12px weight 600, `color: var(--deep)`: `Faltan 6`. Cuando está completo: texto `Completo` y `color: var(--good)`.

Cuenta **unidades**, no líneas: `Σ qty` de todos los items (en el mock, 1 + 3 + 2 = 6).

### 5.4 Fila de medicamento — `.ccard`

Una tarjeta por medicamento, `.groups` las apila con `gap:10px`, `margin-top:16px`.

`.ccard`: `position:relative`, `background:#fff`, `border:1px solid var(--line)`, `border-radius:12px`, `overflow:hidden`.
- `.fill` — barra de progreso de fondo: `absolute; left:0; top:0; bottom:0; background: rgba(92,138,90,.13); width: <pct>%; transition: width .18s`.
- Completa (`.full`): `border-color: rgba(92,138,90,.4)`.

`.in` (contenido): `position:relative; display:flex; align-items:center; gap:12px; padding:14px 15px`. De izquierda a derecha:

1. **Dial `.dial`** — 50×50 círculo. El anillo es un `conic-gradient(<color> <pct>turn, var(--line) <pct>turn)` donde `<color>` = `var(--ph)` en progreso y `var(--good)` cuando está completo. El centro se "vacía" con `::after` (`inset:4px`, círculo, `background:#fff`; en tarjeta completa `#F1F6F0`). Texto `n/qty` centrado con flex, **13px weight 700 tabular-nums**, `color: var(--deep)`; completo → `color: var(--good)`.
2. **`.nmcol`** (`flex:1 1 auto; min-width:150px`):
   - `.nm` — **14.5px weight 600**, `line-height:1.25`, **una línea con ellipsis** (`white-space:nowrap; overflow:hidden; text-overflow:ellipsis`).
   - `.mt` — 11.5px `--muted`, `margin-top:3px`. Contenido = forma farmacéutica + sufijo de estado:
     `inhalador` → `inhalador · completo` / `· faltan 2 u.` / `· falta 1 u.` / `· sustituido`.
3. **`.fcol` — columna FÁRMACO** (`border-left:1px solid var(--line)`, `padding-left:12px`, `flex:0 1 92px`, `min-width:0`). Se eligió mostrar **fármaco (droga)** y no lote, para habilitar sustituciones rápidas.
   - `.lbl` — 9.5px weight 700, `letter-spacing .11em`, uppercase, `color: var(--faint)`: `FÁRMACO`
   - `.val` — 12.5px, `margin-top:2px`, `line-height:1.25`: `Salmeterol + fluticasona` (**envuelve en varias líneas**, no trunca).
   - Con tarjeta completa el borde izquierdo pasa a `rgba(92,138,90,.26)`.
4. **Acción a la derecha**:
   - Incompleta → botón `Sustituir` (`.sust`: `border:1px solid var(--line2)`, `background:#fff`, 12px weight 600, `padding:6px 9px`, `border-radius:8px`, `white-space:nowrap`. Hover: `border-color:--ph`, `color:--deep`. Abierto `.on`: relleno `var(--ph)`, texto `var(--on)`).
   - Completa → tilde `.tick` en `var(--good)` y, en el paso 1, un botón `Cancelar` (`.cancel`: sin borde, transparente, 12px weight 600, `color:--muted`; hover `color: var(--danger)` + `background: rgba(166,72,59,.09)`) que devuelve el contador a 0.
   - En pasos 2 y 3 no hay ni `Sustituir` ni `Cancelar` (lista sólo lectura).

### 5.5 Panel de sustitución — `.swap`

Se despliega **dentro de la misma tarjeta**, debajo de `.in`: `padding:12px 14px 13px`, `background: var(--surface)`, `border-top:1px solid var(--line2)`.

- `.swaplb` — eyebrow 10.5px weight 700, `letter-spacing .12em`, uppercase, `--faint`: `MISMO FÁRMACO · ` + `<b>` con la droga en minúscula (el `<b>` va 11.5px, `letter-spacing .02em`, sin uppercase, `color:--ink-soft`).
- Cada alternativa `.alt`: flex `gap:11px`, `padding:9px 11px`, `background:#fff`, `border:1px solid var(--line)`, `border-radius:9px`; `margin-top:7px` entre ellas.
  - `.anm` 13px weight 600 (nombre comercial o genérico), `.amt` 11px `--muted` (forma + stock).
  - Botón `.pick` a la derecha (`margin-left:auto`, 30px, `padding:0 11px`, `border-radius:8px`, sin borde, `background: var(--ph)`, `color: var(--on)`, 12px weight 600): **`Usar este`**.
  - **Alternativa bloqueada `.alt.no`**: `opacity:.55`, botón `Bloqueado` deshabilitado (`background: var(--surface)`, `border:1px solid var(--line)`, `color: var(--faint)`, `cursor:default`). Se usa para **otra concentración**, que requiere autorización del IP.
- `.swapfoot` — 11.5px `--muted`, punto ámbar + "La sustitución queda registrada en la trazabilidad de la dispensación."

Al elegir una alternativa: se reemplaza el nombre del item, se marca `swapped` (el `.mt` pasa a decir `· sustituido`), se cierra el panel, vuelve el foco al input y se dispara el toast `Sustituido por <nombre> · registrado en trazabilidad`.

> **Pendiente de producto, decidir antes de implementar:** si la sustitución exige un **campo de motivo obligatorio**. Hoy el prototipo sustituye en un click. Si se requiere motivo, el panel necesita un select/textarea + validación antes de habilitar `Usar este`.

### 5.6 Nota al pie — `.note`

flex `gap:9px`, `align-items:flex-start`, `margin-top:16px`, `padding:11px 13px`, `border-radius:10px`, `background: var(--surface)`, `border:1px solid var(--line)`, 12px `--muted`, `line-height:1.45`, con ícono reloj:
"Al marcar lista se emite el comprobante y se descuenta el stock. Los kits de IP se declaran al entregar."

---

## 6. Pasos 2 y 3

### 6.1 Paso 2 — Lista para retirar

1. **Tarjeta de comprobante `.comp`** — `border:1px solid rgba(46,125,116,.4)`, `background: rgba(46,125,116,.09)`, `border-radius:14px`, `padding:20px`, centrada. Ícono recibo 24px en `var(--teal)`, luego `.n` = **Schibsted Grotesk 700, 38px, letter-spacing −0.02em, tabular-nums**, `color: var(--teal)`: `N° 1046`; y `.l` 12px `--ink-soft`: `Comprobante de dispensación`.
2. `.note` en variante teal (`background: rgba(46,125,116,.08)`, `border-color: rgba(46,125,116,.28)`, `color:--ink-soft`), ícono info: "Verificada y con comprobante emitido. Imprimilo para el mostrador: al retirar se entrega sellado y firmado."
3. Eyebrow `CONTENIDO VERIFICADO` (`margin:20px 0 9px`) + la lista de medicamentos en modo sólo lectura.

### 6.2 Paso 3 — Entregada

Igual que el paso 2 pero la tarjeta de comprobante va en **verde** (`border-color: rgba(92,138,90,.42)`, `background: rgba(92,138,90,.10)`, ícono y número en `var(--good)`), eyebrow `ENTREGADO 11/08/2026 · 17:41 · FARMACIA`, y `.note` neutra con ícono reloj: "Stock descontado y kits de producto en investigación declarados con la constancia firmada."

---

## 7. Visor de la constancia — `.viewer`

Overlay dentro del cajón (no del viewport): `position:absolute; inset:0; background: rgba(20,48,46,.62); backdrop-filter: blur(3px); z-index:20; opacity 0→1 en .16s`; con `pointer-events:none` cuando está cerrado.

- **Barra `.vbar`** — `background: var(--ink)`, `color: var(--paper)`, `padding:11px 16px`, flex `gap:10px`:
  - Nombre `.fn` 13px weight 600 (truncado) + meta `.fm` 11.5px `rgba(244,241,234,.6)`: `1,0 MB · 1 página · subido 11/08/2026 17:12 por Coordinación`.
  - `.vzoom` — grupo `− <nivel> +` con `border:1px solid rgba(244,241,234,.22)`, `border-radius:8px`; botones 26×26; nivel en **mono 11.5px**, `min-width:42px`, formato `78%`. Paso de zoom **±0.15**, límites **0.4–1.6**.
  - `.vbtn` `Ajustar` → vuelve a `0.78`.
  - `.vbtn` sólo-ícono `Descargar`.
  - `.vbtn` `Imprimir` — con clase `.solid` (relleno petróleo) mientras la constancia **no** se imprimió; después queda outline.
  - `.vbtn` cerrar `✕` (tooltip "Cerrar (Esc)").
  - `.vbtn` base: 30px, `min-width:30px`, `padding:0 9px`, `border-radius:8px`, `border:1px solid rgba(244,241,234,.22)`, transparente, `color:--paper`, 12.5px weight 600; hover `background: rgba(244,241,234,.14)`.
- **Área `.vscroll`** — `flex:1; overflow:auto; padding:22px; display:flex; justify-content:center`. La hoja `.vpage`: `width:620px`, `transform-origin: top center`, `box-shadow: 0 18px 44px rgba(0,0,0,.34)`, `align-self:flex-start`, escalada con `transform: scale(zoom)`.
- **Escape cierra el visor** (listener global). Al cerrar, el foco vuelve al input de escaneo.

### 7.1 La hoja (constancia del IP)

Documento A4-ish de 620 px de ancho, `padding:30px 34px 34px`, fondo blanco. Estructura: cabecera con marca **Spira** (Schibsted Grotesk 800, 19px) + bajada `PRODUCTO EN INVESTIGACIÓN` y bloque derecho con protocolo/sitio/N° de constancia, separados por `border-bottom:1.5px solid var(--ink)`; título `h1` 16.5px; grilla de 4 campos (`dt` 9.5px uppercase `--faint`, `dd` 12.5px weight 500, cada campo con `border-bottom:1px solid var(--line)`); tabla de productos (`th` 9.5px uppercase con `border-bottom:1px solid var(--ink)`, `td` 12px con divisor `var(--line)`) donde cada kit muestra su código de barras; párrafo de declaración `.decl` (11.5px, `line-height:1.6`, `border-left:2px solid var(--line2)`, `padding-left:12px`); dos bloques de firma `.sig` (`border-top:1px solid var(--ink)`); pie `.sfoot` 9.5px `--faint`.

En producción esto **es un PDF generado por el backend**, no HTML. El HTML de la hoja sirve como especificación de contenido y jerarquía del documento.

---

## 8. Interactions & Behavior

### 8.1 Escaneo (el corazón de la pantalla)

`scan(value)`:

1. Se toma el **siguiente item pendiente** (`nextItem()` = primer item con `n < qty`).
2. Si el valor viene **vacío** (click en `Confirmar` sin texto, atajo de demo) → suma 1 al siguiente pendiente y limpia el error.
3. Si viene con valor:
   - No coincide con ningún `ean` de la dispensación → error `Código <v> — no corresponde a ningún producto de esta dispensación.`
   - Coincide pero ese item ya está completo → error `<nombre> ya tiene sus N unidades. Escaneá <siguiente pendiente>`
   - Coincide y falta → **suma 1 unidad** a ese item (no al "siguiente": el escaneo manda) y limpia el error.
4. Se limpia el input, se re-renderiza, se re-enfoca el input.
5. Si con esa pasada quedó todo completo → toast `Las 6 unidades están escaneadas`.

Puntos importantes para la implementación:

- **Una pasada = una unidad.** Un item con `qty: 3` requiere tres pasadas del mismo código.
- El **foco debe sobrevivir al re-render**. En el prototipo se guarda si el elemento activo tenía `data-scan` y se re-enfoca después. En React: `ref` + `useEffect`, o input controlado que no se desmonte.
- El error **no bloquea**: sigue permitiendo escanear. Se limpia con el siguiente escaneo válido.
- Códigos de prueba del mock: `7791234567890` (Alvetide, 1 u.), `7791122334455` (Ibuprofeno, 3 u.), `7790987654321` (Donepecilo, 2 u.).

### 8.2 Gate / validación de avance

`gate()` devuelve el primer bloqueo, en este orden de prioridad:

1. `Falta imprimir la constancia del IP` — si no se imprimió.
2. `Falta escanear las 6 unidades` — si no se escaneó **ninguna**.
3. `Faltan N unidades por escanear` / `Falta 1 unidad por escanear` — parcial (singular/plural correcto).
4. `null` = sin pendientes.

El texto del gate se muestra en `.railfoot`, y **mientras haya gate el botón primario del footer está `disabled`** (`opacity:.45; cursor:default; filter:none`).

### 8.3 Transiciones de paso

- `Marcar lista para retirar` → `step: 'lista'` + toast `Comprobante N° 1046 emitido`.
- `Entregar al paciente` → `step: 'entregada'` + toast `Entregada · stock descontado`.
- No hay "volver atrás" en el prototipo. Definir si producción necesita revertir un paso (probablemente sí, con permiso).

### 8.4 Toast

`position:absolute; left:50%; bottom:96px; transform:translateX(-50%)`, `background: var(--ink)`, `color: var(--paper)`, `padding:11px 16px`, `border-radius:10px`, 13px, ícono tilde, `box-shadow: 0 12px 32px rgba(20,48,46,.2)`, `z-index:15`.
Entra con `opacity .2s` + `translateY(-4px)`, **se cierra solo a los 2600 ms**. Un solo toast a la vez (el timer se reinicia).

### 8.5 Transiciones y duraciones (todas las del diseño)

| Qué | Propiedad | Duración |
|---|---|---|
| Relleno de progreso de la tarjeta | `width` | 180 ms |
| Overlay de zoom en la miniatura | `opacity` | 140 ms |
| Visor abrir/cerrar | `opacity` | 160 ms |
| Toast | `opacity`, `transform` | 200 ms |

Sin easing declarado (default del navegador). Los hovers de botón usan `filter: brightness(1.07)` en los rellenos.

### 8.6 Responsive

El diseño está pensado para **escritorio de farmacia, cajón de 720 px fijo**. No hay breakpoints. Si hay que soportar tablet, la ruta natural es: cajón full-width y riel colapsado a una tira horizontal de 3 pasos arriba del contenido. **No está diseñado — hay que diseñarlo antes de implementarlo.**

Accesibilidad a resolver en la implementación (el prototipo no lo cubre):

- El input de escaneo necesita `<label>` (visualmente oculto) y `aria-describedby` apuntando al hint.
- Los errores deben ir en un `role="status"` / `aria-live="polite"`, igual que el toast.
- El riel debería ser una lista (`<ol>`) con `aria-current="step"` en el nodo actual.
- El visor es un modal: focus trap, `role="dialog"`, `aria-modal`, devolver el foco al disparador (el prototipo ya devuelve el foco al input).
- Contraste: `--muted` #7C8C87 sobre blanco da ~3.4:1 — válido para 12px+ en uso secundario, **no** usarlo para texto crítico.

---

## 9. State Management

Estado del prototipo (objeto `S`) traducido a lo que necesita producción:

```
step:     'prep' | 'lista' | 'entregada'
printed:  boolean            ← constancia del IP impresa
code:     string             ← valor del input de escaneo
err:      string | null      ← error de escaneo
toast:    string | null      ← mensaje efímero (2600 ms)
viewer:   boolean            ← visor de constancia abierto
zoom:     number             ← 0.4 … 1.6, default 0.78
swap:     number | null      ← índice del item con el panel de sustitución abierto
items:    Item[]
```

```
Item {
  nm:      string    // nombre comercial mostrado — cambia al sustituir
  ds:      string    // forma farmacéutica: 'inhalador' | 'comprimidos' | …
  drug:    string    // fármaco / droga (columna FÁRMACO)
  qty:     number    // unidades requeridas
  n:       number    // unidades ya escaneadas
  ean:     string    // código de barras esperado
  swapped: boolean   // fue sustituido
  alts:    Alt[]     // { nm, mt, no?: 1 }  — no:1 = bloqueado (requiere autorización del IP)
}
```

Derivados (calcular, no guardar): `uTot = Σ qty`, `uOk = Σ n`, `allOk`, `nextItem`, `gate()`, `pct = n/qty`.

### Datos que hay que traer del backend

- Dispensación: id (`D-1046`), estado, participante (nombre, N° `03200070001`), protocolo (`ACT18301`), flag `Fuera de cronograma`, N° de comprobante (`1046`).
- Items con `qty`, fármaco, forma, y **los códigos válidos por item** (puede haber más de un EAN válido por producto en la vida real — el prototipo asume uno).
- Alternativas por fármaco con stock disponible, y la regla de **bloqueo por concentración distinta** (requiere autorización del IP).
- Documento de la constancia: nombre, tamaño, páginas, quién y cuándo lo subió, URL, estado de impresión.

### Efectos / endpoints implicados

- Imprimir constancia → registrar `printed` (auditoría: quién y cuándo).
- Sustituir item → registrar en trazabilidad de la dispensación.
- Marcar lista → emitir comprobante + descontar stock.
- Entregar → cerrar dispensación, timestamp, declarar kits de IP.

---

## 10. Design Tokens

Todos vienen de `colors_and_type.css` (Spira · identidad "Sereno"). Se incluye el archivo completo en el bundle.

### Color

| Token | Hex | Uso en esta pantalla |
|---|---|---|
| `--spira-ink` | `#14302E` | texto principal, barra del visor, toast |
| `--spira-primary` | `#0F5F57` | **acento petróleo**: botón primario, nodo actual, foco, tarjeta IP pendiente |
| `--spira-paper` | `#F4F1EA` | fondo del cajón |
| `--spira-surface` | `#FBFAF6` | riel, notas, panel de sustitución |
| `--spira-white` | `#FFFFFF` | header, footer, tarjetas |
| `--spira-muted` | `#7C8C87` | texto secundario |
| `--spira-faint` | `#A6B0AC` | texto terciario, placeholder, eyebrows |
| `--spira-line` | `#E4DECF` | divisores y bordes de tarjeta |
| `--spira-line-2` | `#D8CBB0` | bordes de input y de botón outline |
| `--spira-good` | `#5C8A5A` | completado, tildes, progreso de tarjeta |
| `--spira-warn` | `#B0823F` | punto de pendiente |
| `--spira-danger` | `#A6483B` | errores, cancelar |
| `--spira-track` | `#2E7D74` | comprobante, botón de avance, tramo recorrido del riel |
| `--spira-on-accent` | `#F4F1EA` | texto sobre relleno de acento |

Locales de la pantalla:

| Alias | Valor | Nota |
|---|---|---|
| `--ph` | `var(--spira-primary)` | acento del módulo. **Antes era el ámbar `--spira-pharma-solid` #A8842F; se cambió a petróleo por pedido.** |
| `--deep` | `#0B4A44` | petróleo profundo para texto de énfasis sobre fondo claro (antes `#8A6520`) |
| `--ink-soft` | `#3D5D59` | texto de apoyo |
| fondo de página | `#E9E4D8` | sólo el lienzo detrás del cajón, simula la lista |

Tintes derivados usados literalmente en el CSS: `rgba(15,95,87,.08 / .09 / .14 / .16 / .30)` (petróleo), `rgba(46,125,116,.08 / .09 / .14 / .26 / .28 / .4 / .5)` (teal), `rgba(92,138,90,.10 / .13 / .18 / .24 / .26 / .34 / .4 / .42)` (verde), `rgba(166,72,59,.08 / .09 / .28)` (rojo), `rgba(20,48,46,.06 / .10 / .14 / .42 / .62)` (sombras y velos), `rgba(244,241,234,.14 / .22 / .6 / .85)` (sobre fondo oscuro), `#F1F6F0` (centro del dial completo).

### Tipografía

| Rol | Familia | Uso |
|---|---|---|
| Display | **Schibsted Grotesk** 400–800 | `h2` del header, `h6` de sección, número de comprobante, marca de la hoja |
| Texto / UI | **Hanken Grotesk** 400–700 | todo el resto, incluidos **los números del riel, del dial y del contador** |
| Mono | **IBM Plex Mono** 400–500 | sólo códigos: contador `n/total` del riel, número de código de barras, nivel de zoom |

Escala usada (px): 9.5 · 10.5 · 11 · 11.5 · 12 · 12.5 · 13 · 13.5 · 14 · 14.5 · 15 · 16 · 16.5 · 17 · 19 · 23 · 38.
Eyebrows: 9.5–10.5px, weight 700, `letter-spacing` .09–.16em, uppercase.
Números: siempre `font-variant-numeric: tabular-nums`.

> Decisión de tipografía a respetar: **los números de UI (riel, dial, contador) NO van en mono.** Se probó y se descartó por verse finos y ópticamente descentrados. Van en Hanken Grotesk 700 con tabular-nums.

### Radios

`5px` miniatura · `7px` botón cancelar · `8px` botones chicos, alternativas, grupo de zoom · `9px` iconbutton, `.alt` · `10px` `.btn`, notas, errores, `.reqs`, toast · `11px` `.item` · `12px` `.ccard`, `.ipcard`, input de escaneo · `14px` `.comp` · `50%` círculos · el sistema además define `--spira-radius-*` (8/10/16/999).

### Sombras

- Cajón: `-18px 0 48px rgba(20,48,46,.14)`
- Miniatura: `0 2px 6px rgba(20,48,46,.10)`
- Hoja en el visor: `0 18px 44px rgba(0,0,0,.34)`
- Toast: `0 12px 32px rgba(20,48,46,.2)`
- Halo de foco input: `0 0 0 4px rgba(15,95,87,.14)` · Halo nodo actual: `0 0 0 3px rgba(15,95,87,.16)`

### Espaciado

Escala base de 4 (`--spira-space-*`), pero la pantalla usa valores ópticos finos: paddings de `7px 9px` (req), `9px 11px` (alt), `11px 13px` (nota), `12px 13px`/`13px 14px` (tarjetas), `14px 15px` (fila de medicamento), `13px 22px` (footer), `16px 22px 15px` (header), `18px 15px` (riel), `20px 22px 24px` (body). Gaps: 7/8/9/10/11/12/13 px.

---

## 11. Assets

- **Íconos**: todos SVG inline, stroke `currentColor`, dibujados a mano en el prototipo (objeto `I` en `dispensacion-b.js`): `x, dots, bar (barras), check, flask, print, eye, expand, down, info, alert, clock, pill, receipt, arrow`. Tamaños 14–24 px, `stroke-width` 1.6–2.4. **Reemplazar por el icon set del codebase** manteniendo tamaño y grosor óptico.
- **Código de barras**: generado por la función `barcode(code, height, scale)` — decorativo. Ver §2.
- **Fuentes**: Google Fonts vía `@import` en `colors_and_type.css` (Schibsted Grotesk, Hanken Grotesk, IBM Plex Mono). En producción self-hostear.
- **Sin imágenes ni logos externos.** La marca "Spira" de la hoja es texto.

---

## 12. Files

En este bundle:

| Archivo | Qué es |
|---|---|
| `Dispensación - Paso a paso B.html` | **La pantalla.** Todo el CSS de la pantalla está en su `<style>`. |
| `dispensacion-b.js` | Estado, lógica de escaneo, gate, render, íconos, hoja de la constancia. |
| `colors_and_type.css` | Tokens del design system Spira (color, tipografía, radios, sombras, espaciado, tema oscuro). |
| `referencias/Dispensación - Droga en la fila (variantes).html` | Exploración de cómo mostrar el fármaco en la fila. La variante elegida es la que está implementada (columna `FÁRMACO` con borde izquierdo). |
| `referencias/Dispensación - Lista de escaneo (variantes).html` | Exploración de la lista de escaneo (agrupación, contadores, tratamiento de completados). |

Para verlo: abrir el HTML en un navegador. Camino de demo: `Imprimir` en la tarjeta del IP → escanear `7791234567890`, `7791122334455` ×3, `7790987654321` ×2 (Enter en cada uno) → `Marcar lista para retirar` → `Entregar al paciente`. `Reiniciar demo` vuelve al inicio.

---

## 13. Decisiones de diseño, para no re-litigar

1. **Un paso a la vez** en el área de trabajo; el riel da el contexto. Se descartó mostrar los tres pasos expandidos.
2. **Riel con espina continua**: tramo recorrido en teal, paso actual con halo, requisitos en una tarjeta blanca agrupada dentro del nodo. Tilde para cumplidos, aro para el siguiente.
3. **Columna FÁRMACO, no lote.** Habilita sustituir rápido; el lote no aporta a la decisión del mostrador.
4. **Sustituciones**: sólo equivalentes del mismo fármaco. **Otra concentración queda bloqueada** y necesita autorización del IP.
5. **Contador por unidad, no por línea** (`0/6`), porque un item puede requerir varias pasadas.
6. **Sin bordes laterales en el cajón**; la sombra hace la separación.
7. **Sin mención de FEFO** en esta pantalla (se quitó deliberadamente).
8. **Números de UI en la tipografía de texto**, no mono (ver §10).
9. **Botón `Descargar`** entre `Ver` e `Imprimir` en la tarjeta del IP.
10. **Acento petróleo** en toda la pantalla; el ámbar queda sólo como color de advertencia (punto de pendiente).

## 14. Abierto / a definir con producto

- ¿La sustitución requiere **campo de motivo obligatorio**? (§5.5)
- Apariencia final de la **lista para retirar** (paso 2) — está resuelta pero fue lo último en revisarse.
- ¿Se puede **volver atrás** de un paso, y con qué permiso? (§8.3)
- Comportamiento en **tablet** (§8.6).
- ¿Un producto puede tener **más de un EAN válido**? El prototipo asume uno por item.
