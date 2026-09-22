# Handoff: Protocolo — acceso a «Cronograma y procedimientos»

## Overview
Ubicación y tratamiento del botón **«Cronograma y procedimientos»** en la ficha lateral del detalle de protocolo (`src/views/ProtocolDetailView.tsx`, columna izquierda de 316px).

**Decisión: C3 + D1** — franja de media altura bajo la identidad del estudio, **teñida en teal** (fondo 8%, borde 32%), con el rótulo completo y el contador de visitas al costado.

Qué cambia respecto de hoy: el botón deja de ser un `actBtn` de 40px idéntico a «Exportar reporte» / «Editar protocolo» y pasa a una franja de 34px con color propio. Gana presencia sin robarle aire a Sponsor/Investigador y deja de leerse como una acción más de la lista.

## About the Design Files
`source/Protocolo - Ubicación del cronograma (variantes).html` es una **referencia de diseño en HTML** (abrir en el navegador; trae `colors_and_type.css` al lado). No es código para copiar: la implementación va en el componente real respetando `actBtn`, `Icon` y los tokens de la app.

## Fidelity
**Alta fidelidad** para la opción elegida (medidas, colores y tipografía son normativos). El resto de las variantes queda documentado como registro de la exploración.

## Especificación de la opción elegida (C3 + D1)

Ubicación: inmediatamente **debajo del bloque de identidad** (tile 46px + código + nombre) y **antes** del filete que abre los datos del estudio. `marginTop: 12`.

```
alto:            34px            (antes 40)
ancho:           100% de la ficha
radio:           8px
fondo:           color-mix(in srgb, #2E7D74 8%, #FFFFFF)
borde:           1px solid color-mix(in srgb, #2E7D74 32%, #FFFFFF)
padding:         0 10px
gap:             8px
ícono:           calendar, 14px, #2E7D74
rótulo:          «Cronograma y procedimientos» — 12px / 600 / --spira-ink / white-space: nowrap
contador:        «17 visitas» — 11px / 400 / --spira-ink-soft / margin-left:auto / nowrap
chevron:         chevronRight 13px, #2E7D74
hover:           .spira-card-link (borde a #2E7D74 45% + shadow-sm), 140ms
```

Reglas:
- El rótulo **nunca** se parte en dos líneas (`nowrap`); si el ancho no alcanza, se recorta el contador, no el rótulo.
- El contador sale del cronograma real del protocolo (`17 visitas`); si el estudio no tiene cronograma cargado, se omite el contador — no se muestra «0 visitas».
- Visible sólo con `canManageSchedule`, igual que hoy.
- La columna de identidad (código + nombre) lleva `overflow:hidden; text-overflow:ellipsis` para que un código largo nunca invada lo que esté a su derecha.

Captura: `screenshots/06-color-D1-D2.png` (D1 a la izquierda; D2 al lado, para comparar).

## Variantes exploradas

### Ubicación dentro del panel
| | Opción | Resultado |
|---|---|---|
| A | Bajo la identidad, botón de 40px (**actual**) | Visible, pero empuja los datos y se lee igual que Exportar/Editar |
| B | Primero dentro de «Acciones» | Ordena la ficha, pero queda al fondo |
| C | Chip junto al código | Compacto; obliga a acortar el rótulo — **base de la decisión** |
| D | Sección «Definición del estudio» (Cronograma + Procedimientos) | Separa definición de acciones; ocupa más alto |
| E | Primario fijo al pie | La más fuerte; sólo si el cronograma fuera la entrada principal |
| F | Fuera de la ficha, en la barra de la columna derecha | Libera la ficha pero se aleja de la identidad |

Capturas: `01-ficha-A-B.png`, `02-ubicaciones-C-D.png`, `03-ubicaciones-E-F.png`.

### Accesos compactos (sobre la idea de C)
C1 sólo ícono · C2 enlace bajo el nombre · **C3 franja de media altura (elegida)** · C4 identidad partida · C5 dos chips · C6 tile con rótulo corto · C7 tile vertical con versalita · C8 tile con rótulo completo en una línea · C9 dos tiles con texto.
Capturas: `04-compactas-C8-C9.png`, `05-compactas-C1-C5.png`.

### Tratamientos de color de la franja
| | | |
|---|---|---|
| **D1** | **Teñida** (teal 8% / borde 32%, rótulo en tinta) | **elegida** |
| D2 | Teal sólido, texto blanco | demasiado peso para la ficha |
| D3 | Contorno teal sobre blanco | señala acción sin mancha de color |
| D4 | Ícono en caja teal, franja neutra | acento mínimo |
| D5 | Teñida con el contador en píldora teal sólida | el número compite con el rótulo |

Capturas: `06-color-D1-D2.png`, `07-color-D5.png`.

## Accesibilidad
- Texto del rótulo en `--spira-ink` sobre el tinte al 8%: contraste muy por encima de 4.5:1.
- El acento nunca queda como único portador de significado: hay ícono, palabra y chevron.
- Altura de 34px con el ancho completo de la ficha: área de clic cómoda aunque la franja sea baja.
- El `title`/`aria-label` no reemplaza al rótulo: el texto va siempre visible (fue el motivo de descartar C1).

## Files
```
design_handoff_protocolo_cronograma/
├── README.md
├── screenshots/
│   ├── 01-ficha-A-B.png
│   ├── 02-ubicaciones-C-D.png
│   ├── 03-ubicaciones-E-F.png
│   ├── 04-compactas-C8-C9.png
│   ├── 05-compactas-C1-C5.png
│   ├── 06-color-D1-D2.png      ← la elegida (D1, a la izquierda)
│   └── 07-color-D5.png
└── source/
    ├── Protocolo - Ubicación del cronograma (variantes).html
    └── colors_and_type.css
```
