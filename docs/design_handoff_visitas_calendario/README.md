# Handoff: Visitas — Vistas Mes / Semana / Día

## Overview
Rediseño del submódulo **Visitas** de Spira Coordinación. Incluye:

1. **Encabezado reorganizado** (variante "A · Barra"): título + acción primaria arriba, y debajo una barra con navegación de período, fecha/contadores y selector de vista.
2. **Tres vistas de calendario**: **Mes**, **Semana** y **Día** (lista agrupada por estado).
3. **Barra de filtros** con un único botón "Filtros" que abre un **panel de dos columnas** (categorías ↔ opciones), conteo en vivo y **fichas de filtros activos** debajo de la barra.
4. **Fila de visita (vista Día)** con Coord./Médico a la derecha y el botón **"Atención médica"** siempre visible (deshabilitado cuando no corresponde), más la acción principal del estado.

## About the Design Files
Los archivos de este paquete son **referencias de diseño hechas en HTML** (prototipo React + Babel en el navegador): muestran el aspecto y comportamiento esperados, **no son código de producción para copiar tal cual**. La tarea es **recrear estos diseños en el entorno real de la app Spira** (React/TS del repo), usando sus componentes, tokens (`spira-app-tokens.css`) y patrones existentes.

Para abrir el prototipo: `prototipo/Visitas - Vistas calendario.html` en un navegador (necesita internet para React/Babel/Google Fonts).

> La barra oscura flotante al pie del prototipo (Encabezado / Filtros angostos / Panel de filtros) es **sólo de exploración**. **No se implementa.** La configuración elegida es: **A · Barra + Un solo botón + Dos columnas**.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, espaciados, radios, sombras y estados son finales. Recrear pixel-perfect con los tokens de Spira.

---

## Referencias visuales (`screenshots/`)
Capturas a ~1440px de ancho de viewport (sidebar incluido), salvo las angostas.

| Archivo | Qué muestra |
|---|---|
| `01-dia.png` | Vista Día — referencia principal de la fila de visita y grupos |
| `02-semana.png` | Vista Semana (L–V) |
| `03-mes.png` | Vista Mes, celda estilo "Lista" |
| `04-selector-fecha.png` | Mini-calendario abierto desde la fecha del encabezado |
| `05-filtros-dos-columnas.png` | Panel de filtros abierto, categoría Estado |
| `06-filtros-categoria-medico.png` | Panel con un filtro de Estado ya aplicado, categoría Médico (conteos en vivo, opciones en 0 atenuadas) |
| `07-fichas-filtro-activo.png` | Panel cerrado con ficha de filtro activo + badge en el botón |
| `08-angosto-760.png` | Contenedor ≈760px: fila de visita en 2 renglones |
| `09-angosto-540.png` | Contenedor ≈540px: fila apilada, labels de vista ocultos |
| `alternativas/*` | Variantes descartadas (sólo contexto, **no implementar**) |

---

## Layout general
- Shell existente de Spira (top bar 58px, riel 64px, panel de submódulos 232px). **No cambia.**
- Contenido: `padding: 22px 26px 40px`, `max-width: 1240px`, columna flex con `gap: 18px`.
- Orden vertical: **Encabezado → Barra de herramientas (Nav/Fecha/Vistas) → Fila de filtros → Fichas activas → Vista**.

## 1. Encabezado (variante A · Barra)

### 1.1 Fila de título
- Flex, `align-items: flex-end`, `gap: 16px`, `flex-wrap: wrap`.
- Izquierda (columna, `gap: 2px`):
  - **Migas**: "Spira Coordinación › **Visitas**" — 13px, `--spira-ink-soft`; "Visitas" en `--spira-ink`, 600. Chevron 13px.
  - **Título** "Visitas": Schibsted Grotesk 28px / 800, `letter-spacing: -.01em`, `--spira-ink`.
- Derecha: **"Agregar visita"** (primario) — alto 40px, padding `0 18px`, 14.5px/700, ícono `plus` 17px, radio 10px, fondo `--spira-track` (#2E7D74) → hover `--spira-primary` (#0F5F57), texto blanco.

### 1.2 Barra de herramientas
Contenedor con `container-type: inline-size`. Dentro, grid `auto minmax(0,1fr) auto`, `gap: 16px`, `padding: 12px 14px`, radio 14px, fondo `--spira-surface` (#FBFAF6), borde 1px `--spira-line` (#E4DECF).

**a) Navegación (izquierda)** — grupo segmentado de 38px de alto, radio 10px, borde 1px `--spira-line-2` (#D8CBB0), fondo blanco, `overflow: hidden`:
- `‹` (36px ancho) · **Hoy** (padding `0 14px`, 13.5px/600, separadores 1px `--spira-line` a ambos lados) · `›` (36px).
- "Hoy" se **deshabilita** cuando el período visible ya contiene hoy (texto `--spira-ink-soft`); si no, texto `--spira-acc-deep-track` (#0F5F57).
- Hover de cada botón: fondo `rgba(124,140,135,.12)`.
- Tooltips: "Anterior (←)", "Siguiente (→)".

**b) Período (centro, botón que abre el mini-calendario)**:
- Línea 1: etiqueta principal — Schibsted 20px/700, `--spira-ink`, nowrap con ellipsis · año 14px `--spira-ink-soft` · chevron 15px `--spira-muted`.
- Línea 2: **contadores del período** (12.5px, `--spira-ink-soft`, `gap: 12px`, nowrap, overflow hidden): "**N** visitas", "● **N** por llegar" (punto `--spira-warn` #B0823F), "● **N** en el centro" (punto `--spira-track`), "● **N** finalizadas" (punto `--spira-good` #5C8A5A). Números en 700, `--spira-ink-2`, tabular-nums. Contadores en 0 se ocultan (salvo el total).
- Botón: padding `4px 8px` con margen negativo igual (alineado ópticamente), radio 10px, hover `rgba(124,140,135,.10)`.
- Formatos de etiqueta:
  - Día: "Jueves 8 de octubre" + "2026"
  - Semana: "5 – 9 oct" (si cruza meses: "29 sep – 3 oct") + año
  - Mes: "Octubre" + "2026"

**c) Selector de vista (derecha)** — `role="tablist"`. Contenedor: padding 3px, `gap: 2px`, radio 11px, fondo `rgba(124,140,135,.14)`. Cada tab: alto 32px, padding `0 14px`, radio 8px, 13.5px/600, ícono 15px + label.
- Orden fijo: **Mes · Semana · Día** (íconos `month`, `week`, `list`). Siempre a la derecha, nunca se mueve.
- Activo: fondo blanco, texto `--spira-ink`, sombra `0 1px 2px rgba(20,48,46,.12), 0 0 0 1px var(--spira-line)`.
- Inactivo: transparente, `--spira-ink-soft`; hover → `--spira-ink`.
- Contenedor < 560px: se ocultan los labels (sólo íconos, padding `0 10px`).

### 1.3 Mini-calendario (selector de fecha)
- Popover absoluto `top: calc(100% + 6px)`, ancho 268px, padding 12px, radio 12px, fondo blanco, borde `--spira-line`, sombra `0 12px 32px rgba(20,48,46,.14)`. Entrada `vc-menu`: opacidad 0→1 + `translateY(-4px)`→0, 140ms ease-out.
- Cabecera: `‹` "Octubre 2026" `›` (13.5px/700). Grid 7 columnas, encabezados L M M J V S D (11px/700 `--spira-ink-soft`). 6 semanas (42 celdas) empezando en lunes.
- Celda: 32px alto, radio 8px, 13px. Fuera de mes: `--spira-faint`. Hoy: anillo inset 1.5px `--spira-track`, 700. Seleccionado: fondo `--spira-track`, texto `--spira-on-accent`. Días con visitas: punto de 3px abajo al centro. Hover: outline 1px `--spira-line-2`.
- Click fuera cierra (overlay fijo transparente). Elegir un día cambia la fecha y cierra; **no cambia la vista**.

## 2. Fila de filtros
Contenedor con `container-type: inline-size`; fila flex `gap: 8px`, `nowrap`.

- **Botón "Filtros"** (38px alto, padding `0 12px`, radio 10px, borde 1px `--spira-line-2`, fondo blanco, 14px/600, ícono `filter` 15px + chevron 14px `--spira-muted`).
  - Con filtros aplicados: badge con el total (20px alto, pill, fondo `--spira-track`, texto blanco 11px/700).
  - **Profundidad por sombra, nunca borde verde** (regla de la casa):
    - con filtros: `0 1px 2px rgba(20,48,46,.08), 0 3px 8px rgba(20,48,46,.10)`
    - abierto: `0 1px 2px rgba(20,48,46,.08), 0 6px 16px rgba(20,48,46,.14)` + `translateY(-1px)`
  - Hover: borde `--spira-muted`. `aria-expanded` refleja el estado.
- **Separador** vertical 1px × 22px `--spira-line` (sólo en vista Día).
- **"Ordenar por: En el centro"** (sólo vista Día): mismo estilo de botón, peso 500, ícono `sliders`; el valor en **bold**. Contenedor < 900px oculta el prefijo "Ordenar por:"; < 660px oculta también el valor (queda sólo ícono + chevron).
- **Buscador** (a la derecha, `margin-left: auto`): `flex: 1 1 220px`, `min-width: 120px`, `max-width: 340px`, alto 38px, radio 10px, borde `--spira-line-2`, ícono lupa 15px `--spira-muted`, placeholder "Paciente o protocolo…". El input tiene `min-width: 0` y ellipsis: **nunca salta de línea ni empuja el layout**. Busca en nombre, código, protocolo y tag.

### 2.1 Panel de filtros — Dos columnas
- Popover bajo el botón: ancho `min(500px, 100vw - 40px)`, radio 14px, borde `--spira-line`, sombra `0 16px 40px rgba(20,48,46,.16)`, entrada `vc-menu`.
- Grid `170px | 1fr`, `min-height: 260px`.
- **Columna izquierda (categorías)**: fondo `--spira-surface`, borde derecho `--spira-line`, padding 8px, `gap: 2px`. Ítems 36px, radio 8px, 13.5px/600, ícono 15px:
  - Estado (`filter`), Protocolo (`file`), Médico (`users`), Coordinador (`user`).
  - Activa: fondo blanco + `0 0 0 1px var(--spira-line)`, ícono en `--spira-track`, texto `--spira-ink`. Inactiva: transparente, `--spira-ink-2`, hover `rgba(124,140,135,.10)`.
  - Badge con cantidad seleccionada en la categoría.
- **Columna derecha (opciones)**:
  - Rótulo de categoría: 11.5px/700, `letter-spacing: .06em`, MAYÚSCULAS, `--spira-ink-soft`; a la derecha "Quitar" (12.5px/600 `--spira-acc-deep-track`) si hay selección.
  - Lista con scroll (`max-height: 240px`). Fila 34px, radio 8px, hover `rgba(124,140,135,.08)`: checkbox 18px (radio 5px; vacío: borde 1.5px `--spira-line-2`; marcado: fondo `--spira-track` + check blanco 12px trazo 3) · (en Estado: punto 7px del color del estado) · etiqueta (500; 600 si marcada; ellipsis) · conteo 12px `--spira-ink-soft` a la derecha.
  - **Conteo en vivo, facetado**: cada número cuenta las visitas del período que pasan los filtros de las *otras* categorías. Opciones en 0 y no marcadas: `opacity: .5`.
  - Orden alfabético por etiqueta. "Coordinador" incluye la opción "Sin asignar".
- **Pie**: borde superior `--spira-line`, padding `10px 12px`. "Limpiar todo" (texto 13px/600, deshabilitado en `--spira-faint` si no hay filtros) · botón primario 34px **"Ver N visitas"** / "Ver 1 visita" (cierra el panel).
- Marcar/desmarcar **aplica en tiempo real** (la lista detrás se actualiza al instante); el botón "Ver" sólo cierra.
- Click fuera cierra.

### 2.2 Fichas de filtros activos
Debajo de la fila de filtros (`margin-top: -8px` para pegarse), flex wrap `gap: 6px`. Sólo si hay filtros.
- Ficha: 28px alto, pill, padding `0 4px 0 10px`, fondo `--spira-tint-track` (rgba(46,125,116,.10)), 12.5px, texto `--spira-acc-deep-track`. Contenido: "Categoría:" (en `--spira-ink-soft`) + **valor** (600) + botón × (20px) que quita ese valor.
- Al final: "Limpiar todo" (12.5px/600 `--spira-ink-soft`).

## 3. Vista Día
- Contenedor `container-type: inline-size`, columna `gap: 14px`.
- **Grupos** en orden: **En el centro** (estados `inicio`, `concurrio`) · **Por llegar** (`por_llegar`) · **Finalizadas** (`fin`, `no_vino`). Grupos vacíos se ocultan; si hay un solo grupo, se omite su encabezado.
- Encabezado de grupo: label Schibsted 12.5px/700 MAYÚSCULAS `letter-spacing: .04em` `--spira-ink-soft` (nowrap) · conteo 12px · línea 1px `--spira-line` que llena el resto. Padding `0 2px 9px`.
- Vacío: "No hay visitas este día" centrado, Schibsted 17px/700 `--spira-ink-soft`, padding 60px.

### 3.1 Fila de visita (tarjeta)
Tarjeta: fondo blanco, borde 1px `--spira-line` (hover `--spira-line-2`, transición 150ms), radio 14px, padding `14px 16px`, separación 8px.

Grid **`112px | minmax(240px,1fr) | minmax(0,210px) | auto | 28px`**, `gap: 14px`, `align-items: center`:

1. **Estado** (104px): pill 24px alto, padding `0 10px`, 12.5px/600 `--spira-ink-2`, fondo = color del estado al 12% (`#RRGGBB1F`), punto 6px del color; nowrap. Debajo, barra de progreso 3px (pista `--spira-line`, relleno color del estado al `pct`).
2. **Datos** (columna `gap: 6px`):
   - Nombre: Schibsted 17px/700 `--spira-ink` + "llegó HH:MM" (12px tabular `--spira-ink-soft`) si llegó.
   - Protocolo (chip 12.5px/700, padding `2px 8px`, radio 6px, fondo `rgba(124,140,135,.16)`) · código (tabular `--spira-ink-soft`) · tag de visita "V5 W10" (chip oscuro: fondo `--spira-ink`, texto `--spira-paper`). Chips nowrap.
   - Metadatos 12.5px/600 `--spira-ink-2`, `gap: 14px`: `clipboard` "N proc." (ícono `--spira-track`) · `drop` "Con sangre"/"Sin sangre" (ícono `--spira-danger` / `--spira-faint`) · `pill` "Kit IP" (ícono `--spira-warn`, sólo si aplica).
3. **Personas** (alineado a la derecha, `justify-self: end`): grid `auto | 1fr`, `gap: 4px 8px`, 12.5px.
   - Label con ícono 13px a la izquierda, alineado a la derecha, `--spira-ink-soft`: `user` "Coord." / `users` "Médico".
   - Valor 600 `--spira-ink-2`. Coordinador vacío → "Sin asignar" en 400 `--spira-ink-soft`. Médico con ellipsis.
4. **Acciones** (flex `gap: 8px`, `justify-content: flex-end`):
   - **"Atención médica"** (secundario, **siempre presente en todas las filas**):
     - 38px alto, padding `0 14px`, radio 10px, fondo blanco, borde 1px **#E6CDBF** (arena cálida), 13.5px/600 `--spira-ink-2`, ícono `users` 15px, `gap: 7px`.
     - Hover: borde **#C9876A**, fondo **#FDF6F2**.
     - **Habilitado sólo** en `concurrio` y `inicio` (paciente en el centro).
     - **Deshabilitado** (oscurecido) en `por_llegar`, `fin`, `no_vino`: fondo `rgba(124,140,135,.12)`, borde transparente, texto `--spira-faint`, `cursor: not-allowed`, sin levante.
     - Tooltip (title): habilitado "Solicitar atención médica"; por llegar "Disponible cuando el paciente llegue"; finalizada "La visita ya no está en el centro".
     - Copy: **"Atención médica"** (reemplaza el antiguo "Quiere médico", pedido de Dirección).
     - Los colores #E6CDBF / #C9876A / #FDF6F2 no existen como tokens; se sugiere crear `--spira-med-line`, `--spira-med-line-hover`, `--spira-med-bg-hover` (y sus pares en oscuro).
   - **Acción principal del estado** — slot de **ancho fijo 160px** (para que "Atención médica" quede en la misma posición en todas las filas, incluidas las finalizadas):
     - `por_llegar` → "Marcar llegada →" · `concurrio` → "Iniciar atención →" · `inicio` → "Fin de atención →" (primario 38px, centrado, ícono `arrowR` 15px).
     - `no_vino` → "Reprogramar" (botón secundario neutro, 160px, borde `--spira-line-2`).
     - `fin` → **espacio vacío de 160px** reservado (no colapsa).
5. **Más** (`⋯`): botón ícono 28×28.

**Responsive de la fila (container queries sobre la lista):**
- **≤ 860px**: grid `112px | 1fr | auto | 28px`. Renglón 1: estado · datos (ocupa cols 2–3) · ⋯. Renglón 2: personas (col 2, alineado a la izquierda) · acciones (col 3). Ver `08-angosto-760.png`.
- **≤ 560px**: una columna + ⋯ a la derecha del primer renglón; todo apilado, acciones alineadas a la izquierda. Ver `09-angosto-540.png`.

## 4. Vista Semana
- Grid de 5 columnas (L–V; 7 si se habilita fin de semana), `minmax(0,1fr)`, borde 1px `--spira-line`, radio 14px, fondo blanco. Separadores verticales 1px.
- Columna `min-height: 440px`; hoy con fondo `rgba(46,125,116,.04)`.
- **Encabezado de día** (botón, lleva a vista Día de esa fecha): padding `10px 12px`, borde inferior `--spira-line`, hover `rgba(124,140,135,.06)`. "LUN" 11.5px/700 MAYÚS `letter-spacing .06em` (hoy en `--spira-acc-deep-track`) · número Schibsted 20px/700 en círculo 32px (hoy: fondo `--spira-track`, texto `--spira-on-accent`) · "N visitas" / "—" a la derecha 12px tabular. Día seleccionado: subrayado inset 2px `--spira-track`.
- **Tarjeta de visita** (padding `8px 9px`, radio 9px, borde `--spira-line`, fondo `--spira-surface`; hover: borde `--spira-line-2`, fondo blanco): punto + estado 11.5px/600 + hora de llegada a la derecha · nombre 13.5px/600 ellipsis (tachado si `no_vino`) · chips protocolo y tag en tamaño `sm` (11px, padding `1px 6px`, radio 5px). Finalizadas con `opacity: .78`. Click → vista Día de esa fecha.

## 5. Vista Mes
- Cabecera de días (Lun…Vie / …Dom) en `--spira-surface`, 11.5px/700 MAYÚS, padding `9px 12px`.
- Celdas: `min-height: 118px`, padding `8px 10px`, bordes internos 1px `--spira-line`; fuera de mes `opacity: .45`; seleccionada fondo `rgba(46,125,116,.06)`; hover `rgba(124,140,135,.06)`. Click → vista Día.
- Número del día Schibsted 14px/700 en círculo 26px (hoy relleno `--spira-track`) + total a la derecha 11.5px.
- Contenido estilo **"Lista"** (por defecto): hasta 3 filas (punto de estado 6px · "R. Aguero" 12px ellipsis · "V2" 11px tabular a la derecha) + "+N más" (11.5px/600 `--spira-acc-deep-track`).
- Alternativa **"Resumen"** (opcional): conteos por grupo con punto de color.

## Interactions & Behavior
- **Atajos de teclado** (ignorados cuando el foco está en un input): `←`/`→` período anterior/siguiente · `T` o `H` hoy · `D` Día · `S` Semana · `M` Mes.
- **Paso de navegación**: Día ±1 día · Semana ±7 días · Mes ±1 mes.
- Click en día (Semana/Mes) → setea fecha y cambia a vista Día.
- Persistir vista y fecha (en el prototipo, `localStorage` clave `vc-state`); en la app, preferentemente en la URL (`?vista=dia&fecha=2026-10-08`).
- Popovers (fecha y filtros): animación `vc-menu` 140ms ease-out; cierre con click fuera. Sugerido: también con `Esc` y foco atrapado en el panel.
- Micro-interacción global de Spira: botones habilitados se levantan 1px en hover (ya existe en `spira-app-tokens.css`); los deshabilitados no.
- Transiciones: bordes de tarjeta 150ms; fondos de segmentos 150ms; sombras del botón de filtros 150ms.
- Respetar `prefers-reduced-motion` (ya contemplado por los tokens).

## State Management
```ts
view: 'mes' | 'semana' | 'dia'           // default 'dia'
date: string /* ISO YYYY-MM-DD */        // default hoy
q: string                                // búsqueda
filters: { estado: Stage[]; proto: string[]; med: string[]; coord: (string|'∅')[] }
filtersOpen: boolean
pickerOpen: boolean
showWeekend: boolean                     // default false
```
Derivados:
- `period = [desde, hasta]` según vista (Semana: lunes → viernes, o domingo con fin de semana; Mes: 1 → último día).
- `visitasPeriodo = visitas.filter(búsqueda).filter(filtros).filter(en período)`.
- Conteo facetado del panel: aplicar todos los filtros **excepto** la categoría en edición.
- Contadores del encabezado por grupo: `llegar`, `centro`, `fin`.

Estados de visita (`stage`):
| key | label | color | pct | acción principal | grupo |
|---|---|---|---|---|---|
| `por_llegar` | Por llegar | #7C8C87 | 14 | Marcar llegada | llegar |
| `concurrio` | Concurrió | #2E7D74 | 40 | Iniciar atención | centro |
| `inicio` | En atención | #2E7D74 | 70 | Fin de atención | centro |
| `fin` | Realizada | #5C8A5A | 100 | — | fin |
| `no_vino` | No vino | #A6483B | 0 | Reprogramar | fin |

Datos por visita: `id, date, name, code, proto, tag ('V5 W10'), med, coord|null, stage, procs, blood, kit, arrived?`.

API: una consulta por rango (`desde`, `hasta`) que traiga las visitas del período visible; filtros y búsqueda pueden resolverse en cliente para el rango (son decenas/centenas de filas).

## Design Tokens
Todos vienen de `spira-app-tokens.css` (incluido). Usados en esta pantalla:

**Color**
- `--spira-ink` #14302E · `--spira-ink-2` #2A4744 · `--spira-ink-soft` #556966
- `--spira-primary` #0F5F57 · `--spira-track` #2E7D74 · `--spira-acc-deep-track` #0F5F57
- `--spira-paper` #F4F1EA · `--spira-surface` #FBFAF6 · `--spira-white` #FFFFFF
- `--spira-muted` #7C8C87 · `--spira-faint` #A6B0AC
- `--spira-line` #E4DECF · `--spira-line-2` #D8CBB0
- `--spira-good` #5C8A5A · `--spira-warn` #B0823F · `--spira-danger` #A6483B
- `--spira-tint-track` rgba(46,125,116,.10) · `--spira-on-accent` #F4F1EA
- Nuevos (botón Atención médica): #E6CDBF borde · #C9876A borde hover · #FDF6F2 fondo hover
- Neutros translúcidos recurrentes: `rgba(124,140,135,.06 / .08 / .10 / .12 / .14 / .16)` para hovers, pistas y chips.

**Tipografía**
- Display: Schibsted Grotesk — 28/800 (título), 20/700 (período, nº de día semana), 17/700 (nombre en fila, vacío), 14/700 (nº día mes), 12.5/700 MAYÚS (grupos).
- Texto: Inter — 14.5 / 14 / 13.5 / 13 / 12.5 / 12 / 11.5 / 11. Pesos 400/500/600/700. Números con `font-variant-numeric: tabular-nums` (`.spira-mono`).

**Radios**: 5 (chip sm, checkbox) · 6 (chips) · 8 (tabs, ítems de lista, celdas picker) · 9 (tarjeta semana) · 10 (botones, inputs) · 11 (contenedor tabs) · 12 (picker) · 14 (tarjetas, barra, paneles, grillas) · 99 (pills).

**Sombras**
- Tab activo: `0 1px 2px rgba(20,48,46,.12), 0 0 0 1px var(--spira-line)`
- Filtros con selección: `0 1px 2px rgba(20,48,46,.08), 0 3px 8px rgba(20,48,46,.10)`
- Filtros abierto: `0 1px 2px rgba(20,48,46,.08), 0 6px 16px rgba(20,48,46,.14)`
- Mini-calendario: `0 12px 32px rgba(20,48,46,.14)`
- Panel filtros: `0 16px 40px rgba(20,48,46,.16)`

**Espaciado**: gaps 2 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 12 · 14 · 16 · 18 · 20.

**Alturas de control**: 38px (botones, inputs, nav) · 40px (Agregar visita) · 34px (Ver N visitas) · 32px (tabs, celdas picker) · 28–30px (fichas) · 24px (pill de estado).

## Assets
- Íconos: trazo estilo Lucide (24×24, `stroke-width 1.8`, round caps/joins), definidos inline en `prototipo/visitas-calendario/atoms.jsx` (`menu, search, chevD/L/R, calendar, check, plus, filter, file, users, user, sliders, grid, activity, clock, fileText, clipboard, bar, pill, info, arrowR, more, list, week, month, drop`). Usar la librería de íconos que ya tenga el repo (si es `lucide-react`, los nombres coinciden casi 1:1).
- Fuentes: Schibsted Grotesk e Inter (Google Fonts, importadas por los tokens).
- Logo del shell: placeholder; usar el isotipo real del repo.
- No hay imágenes.

## Files
```
design_handoff_visitas_calendario/
├─ README.md                              ← este documento
├─ screenshots/                           ← referencias visuales (ver tabla)
│  └─ alternativas/                       ← variantes descartadas
└─ prototipo/
   ├─ Visitas - Vistas calendario.html    ← entrada + CSS de clases (vc-*) y container queries
   ├─ spira-app-tokens.css                ← tokens Spira
   └─ visitas-calendario/
      ├─ app.jsx         ← App: encabezado, barra, filtros (FilterPanel, ActiveChips), atajos, estado
      ├─ views.jsx       ← DayView/DayRow, WeekView/WeekCard, MonthView, StatusPill
      ├─ atoms.jsx       ← Icon, utilidades de fecha (D), Shell
      ├─ data.js         ← datos de ejemplo + definición de STAGES
      └─ tweaks-panel.jsx← panel de exploración (no implementar)
```
Componentes a ignorar en la implementación: `FilterChipsPanel`, `FilterMenuPanel`, encabezados B y C, la barra flotante oscura y `TweaksPanel`.
