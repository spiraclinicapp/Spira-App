# Handoff: Tabla de Stock — filas, columnas y conector de lotes

## Overview
Especificación de la tabla de stock de Spira Farmacia: fila de medicamento (simple o con lotes desplegables), sus columnas de datos, y el conector visual que alinea los lotes desplegados con la fila madre.

## About the Design Files
Los archivos HTML en este bundle son **referencias de diseño**, no código de producción. Muestran layout, medidas y comportamiento exactos. La tarea es recrear este diseño en el stack real de la app (framework/librerías existentes), respetando los valores de este documento.

## Fidelity
**Alta fidelidad (hifi)**: medidas, colores y tipografía son finales. Implementar pixel-perfect.

## Estructura de la fila (`.row` / `.med-summary` / `.lot-row`)

Todas usan `display:flex; align-items:center; gap:14px`. Los mismos anchos fijos de columna deben repetirse en los tres tipos de fila para que todo alinee verticalmente:

| Elemento | Ancho | Notas |
|---|---|---|
| `.chev` (flecha expandir) | auto (~15px) | Solo en fila resumen de medicamento con lotes. Rota 90° cuando está abierto. |
| `.pillsq` (ícono droga) | 40×40px, radius 11px | Fondo `rgba(15,95,87,.13)` |
| `.name` (nombre + droga) | `flex:1 1 240px; min-width:0` | Única columna flexible — absorbe todo el espacio restante. Nombre en `.mname` (nowrap + ellipsis), droga en `.mdrug` debajo. |
| `.col.ean` (Código EAN13) | 170px fijo | |
| `.col.lote` (Lote) | 96px fijo | |
| `.col.venc` (Vencimiento) | 150px fijo | |
| `.col.stock` (Stock) | **138px fijo** | Columna con más prioridad visual: número más grande (ver tipografía). |
| `.kebab` (menú ⋮) | 36×36px, radius 9px | `margin-left:auto`; siempre el último ítem del flex row. |

Padding del contenedor de fila: `13px 16px` (`.row`/`.med-summary`), `11px 16px` (`.lot-row`).
Gap entre columnas: `14px` en todos los casos.

**Regla crítica de alineación:** cada tipo de fila debe tener exactamente un elemento con `flex:1 1 auto` (o equivalente) antes de las columnas fijas — `.name` en las filas con medicamento, `.lot-indent` en las filas de lote — para que el punto de inicio de `.col.ean` caiga siempre en la misma coordenada X, sin importar el ancho del contenedor.

## Tipografía de valores por columna

- Eyebrow (label de columna): `10.5px`, `weight 700`, `letter-spacing .14em`, uppercase, color `var(--muted) #7C8C87`.
- `.ean-v`, `.lote-v`, `.venc-v`: `IBM Plex Mono`, `13–13.5px`, `margin-top:3px`.
- `.stock-v`: valor en `Schibsted Grotesk`, `weight 700`, **`21px`** (más grande que el resto de las columnas — jerarquía intencional), unidad ("u.") en `12px` color muted, junto a badge de estado si aplica.
- `.mname`: `15px`, `weight 600`. `.mdrug`: `12px`, color muted.

## Conector de lotes desplegados (`.lot-indent`)

Cuando una fila de medicamento tiene varios lotes (`.medgroup`), al desplegar se muestran `.lot-row` sin columna de nombre. Para que sus columnas alineen con la fila resumen y para no dejar el espacio vacío, cada `.lot-row` lleva un `.lot-indent` (spacer `flex:1 1 auto`) con un conector visual tipo árbol:

```css
.lot-indent{position:relative;flex:1 1 auto;align-self:stretch}
.lot-indent::before{content:'';position:absolute;left:49px;top:-11px;bottom:-11px;width:1px;background:var(--line2)}
.lot-row:last-child .lot-indent::before{bottom:50%}
.lot-indent::after{content:'';position:absolute;left:45.5px;top:50%;width:7px;height:7px;border-radius:99px;background:var(--surface);border:1.5px solid var(--line2);transform:translateY(-50%)}
```

- `left:49px` en la línea y `left:45.5px` en el punto: coordenada X que hace coincidir el conector con el centro del ícono (`.pillsq`) de la fila resumen de arriba.
- La línea corre de borde a borde vertical del `.lot-row` (`top:-11px; bottom:-11px`, compensando el padding del row) para verse continua entre lotes consecutivos.
- En el **último** lote del grupo, la línea se corta a la mitad (`bottom:50%`) — no debe sobresalir después del último nodo.
- El nodo (`::after`) es un círculo hueco de 7px con relleno `var(--surface)` (mismo color de fondo que el `.lot-row`, para que se vea "recortado" sobre la línea) y borde `1.5px solid var(--line2)`.

## Design Tokens usados

```css
--ink:#14302E; --primary:#0F5F57; --paper:#F4F1EA; --surface:#FBFAF6; --white:#fff;
--muted:#7C8C87; --faint:#A6B0AC; --line:#E4DECF; --line2:#D8CBB0;
--warn:#B0823F; --danger:#A6483B; --pharma:#A8842F;
--fdisp:'Schibsted Grotesk'; --ftext:'Hanken Grotesk'; --fmono:'IBM Plex Mono';
```

## Files

- `Stock - Selector de protocolos + tabla.html` — pantalla completa con la tabla implementada (fuente de verdad de estilos y markup).
- `Conector - variantes.html` — 4 variantes visuales exploradas para el conector de lotes; la variante elegida y aplicada es la **1 (línea continua + nodo)**, ya documentada arriba.
