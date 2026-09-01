# Handoff: Resumen — Tareas enfoque (variantes de layout, KPI links y tags de estado)

## Overview
Explora el layout del mosaico "Resumen" dentro del módulo Coordinación de Spira: dónde vive el widget "Tareas personales" respecto al resto de cards (Reportes pendientes, Alertas, Dispensaciones solicitadas, Pacientes), y el tratamiento visual de dos patrones recurrentes en las cards: (1) el link "ir al módulo" que aparece al pasar el mouse sobre un KPI o un footer "Ver todo", y (2) los tags de estado en los renglones de lista (vence 25/08, atrasada, urgente, preparando…).

## About the Design Files
Los archivos de este bundle son **referencias de diseño hechas en HTML** — prototipos que muestran el look & behavior deseado, no código para copiar tal cual. La tarea es **recrear estos diseños en el entorno real del código de Spira** (el stack/framework que use la app), respetando sus componentes y convenciones existentes.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, espaciados e interacciones (hover) están definidos y deben respetarse con precisión.

## Screens / Views

### Pantalla base: Resumen (mosaico de Coordinación)
Shell de la app: header (60px) con logo Spira + separador + ícono/nombre del módulo activo ("Coordinación") a la izquierda, buscador (210×38px) + avatar circular (32px, iniciales) a la derecha. Debajo, dos columnas fijas: rail de iconos (64px) + sidebar de submódulos (216px, fondo `surface`, item activo con fondo `accent+"1f"`), y el área de contenido a la derecha (scrollable).

Header de contenido: breadcrumb "Spira Coordinación › Resumen" (12.5px, `muted`) + título "Resumen" (24px, Schibsted Grotesk 700). Debajo, 4 KPIs en grid de 4 columnas, luego el mosaico de cards en 2 columnas (gap 14px).

**4 variantes de layout exploradas** (dónde vive "Tareas personales"):
- **A** — Tareas personales como card ancha de 2 columnas internas (vencida / próxima), a la derecha junto a Pacientes; Reportes + Alertas a la izquierda.
- **B** — Tareas personales como columna vertical completa a la derecha (ocupa todo el alto), lista simple de 4 ítems + botón "Nueva tarea".
- **C** — Tareas personales como "riel" fijo de ancho 300px pegado al borde derecho de toda la pantalla (fuera de las columnas del mosaico), corre toda la altura.
- **D** — Tareas personales como card compacta (360px) ubicada junto al título "Resumen" (arriba a la derecha), el resto del mosaico ocupa el ancho completo.

Ver capturas: `screenshots/01-variante.png` (A), `02-variante.png` (B), `03-variante.png` (C), `04-variante.png` (D).

### Componente: KPI card (Stat)
4 cards en grid: "Protocolos activos", "Pacientes activos", "Alertas activas", "Visitas asignadas a mí". Cada card: fondo blanco, borde 1px `line`, radius 16px, padding 18×20px.
- Fila título: punto de color (7px, según `tone`) + label (13px, 600, `muted`) a la izquierda; al hacer **hover sobre toda la card**, aparece a la derecha de esta misma fila el nombre del módulo destino + flecha (12px, 700, color `accent` = `#2E7D74`), animando `opacity 0→1` y `translateX(-4px)→0` en 150ms. Sin hover, ese espacio no existe (no reserva espacio en blanco).
- Valor grande: 34px, Schibsted Grotesk 700, letter-spacing -0.02em.
- Sub texto: 12px, `faint`.
- Hover en toda la card: `box-shadow: 0 4px 14px rgba(20,48,46,.12)` + `translateY(-1px)`.
- Mapeo de destino: Protocolos→Pacientes, Pacientes activos→Pacientes, Alertas activas→Alertas, Visitas asignadas→Visitas.

Variantes de este patrón exploradas y descartadas (ver `screenshots/kpi_link_variantes.png` y source `Resumen - Link de ubicación (variantes).html`): reemplazo del renglón inferior (crossfade), extensión inline del texto secundario, reemplazo del título, solo flecha sin texto, "Ver" corto, chip con fondo. **La elegida es la descrita arriba** (arrow + nombre del módulo, a la derecha de la fila de título, visible solo en hover).

### Componente: Row (renglón de lista, dentro de Reportes / Alertas / Dispensaciones)
Cada ítem de lista es su propio link independiente (no toda la card). Al pasar el mouse SOLO sobre ese renglón:
- Fondo cambia a `surface` (`#FBFAF6`), transición `background .15s`.
- El renglón se extiende de borde a borde de la card vía `margin: 0 -20px; padding: 11px 20px` (cancela el padding horizontal de la card, 20px).
- Border-top 1px `line` entre renglones (el primero de la lista no lo lleva).
- A la derecha del renglón: ícono flecha (`arrowRight`, 15px, color `muted`) — visible permanentemente como indicador de que el renglón tiene link (no aparece solo en hover; lo que cambia con el hover es el fondo).
- La card entera **ya no** tiene hover de elevación/lift — ese comportamiento se movió al renglón.

### Componente: footer "Ver todo"
Al pie de Reportes pendientes y Alertas (no en Dispensaciones solicitadas, que no tiene módulo propio → sin "Ver todo").
- Fila con `justify-content: space-between`, mismo ancho-completo (`margin: 0 -20px; padding: 11px 20px`), border-top 1px `line`.
- Izquierda: texto fijo **"Ver todo"** (12.5px, 600, color `primary` = `#0F5F57`), siempre visible.
- Derecha: nombre real del módulo + flecha (color `accent`), oculto por defecto (`opacity: 0; translateX(-4px)`), aparece con `opacity 1; translateX(0)` en 150ms — **el hover se dispara únicamente al poner el mouse sobre el texto "Ver todo"** (el listener vive en ese `<span>`, no en toda la fila).
- Reportes pendientes → label "Reportes pendientes". Alertas → label "Alertas".

### Tags de estado (en renglones de Reportes / Dispensaciones)
Se descartó el pill sólido con fondo de color (`background: tone+"1a"; color: tone; border-radius: 999px`) que se usaba antes. **Patrón elegido:** el estado se integra en la línea secundaria del ítem, separado por punto medio (` · `), sin contenedor propio:
```
<span style="color:muted">auditoría el 27 de agosto</span><span style="color:faint"> · </span><span style="color:warnDeep; font-weight:700">vence 25/08</span>
```
Colores de estado usados: `vence 25/08` y `urgente` → `warnDeep` (`#8A631F`); `atrasada` → `danger` (`#A6483B`); `en revisión`/`solicitada` → `muted`; `preparando` → `#3A6B8C`.

Estados reales de Dispensaciones (tomados del modal de solicitud de dispensación de medicación de la app, no inventados): **Solicitadas → Preparando → Listas → Entregadas.** Los dos ítems de ejemplo en el mosaico usan "preparando" y "solicitada".

Variantes exploradas y descartadas (ver `screenshots/tags_estado_variantes.png` y source `Resumen - Tags de estado (variantes).html`): pill sólido (original), outline, versalita trackeada mono, solo ícono sin texto. **La elegida es la integrada en la oración**, descrita arriba.

## Interactions & Behavior
- **KPI card**: hover en toda la card → eleva (shadow + translateY) y revela link de módulo a la derecha del título.
- **Row (renglón de lista)**: hover en el renglón individual → solo fondo `surface`; flecha de link siempre visible, no depende de hover.
- **Footer "Ver todo"**: hover exclusivamente sobre el texto "Ver todo" → revela nombre del módulo + flecha a la derecha, en la misma fila.
- Todas las transiciones usan 150ms, sin easing custom (`ease` por default).
- Ningún estado reserva espacio en blanco cuando no está en hover (usar `opacity`/`transform`, nunca cambiar `display` ni el flujo).

## State Management
No hay estado de servidor relevante para esta pieza de diseño — todo es UI local (hover). Los `onClick` de las cards de KPI hoy solo hacen `console.log("navegar a:", to)`; el desarrollador debe conectarlos a la navegación real del router de Spira hacia cada submódulo (Pacientes, Alertas, Visitas, Reportes).

## Design Tokens
Tomados de `source/spiraTokens.jsx` (`window.SPIRA`):
- `ink` #14302E · `primary` #0F5F57 · `paper` #F4F1EA · `surface` #FBFAF6 · `white` #FFFFFF
- `muted` #7C8C87 · `faint` #A6B0AC · `line` #E4DECF · `line2` #D8CBB0
- `good` #5C8A5A · `warn` #B0823F · `danger` #A6483B
- accent usado en estas cards (no es un token global, definido en el archivo): `#2E7D74`
- `warnDeep` (definido en el archivo, para tags): `#8A631F`
- Fuente display: 'Schibsted Grotesk' (600/700) · Fuente texto: 'Hanken Grotesk' (400–700) · Mono: 'IBM Plex Mono'
- Radios: cards 16px, chips/pills 999px (círculo), inputs 10px
- Sombra de card en hover: `0 4px 14px rgba(20,48,46,.12)`

## Assets
Sin imágenes/fotos. Los íconos son de `source/Icons.jsx` (set propio, trazo `stroke-width` variable, `arrowRight`, `clock`, `alert`, `clipboardCheck`, `users`, `activity`, etc.), y el isotipo "Vilano" de `source/SpiraVilanos.jsx`.

## Files
- `source/Resumen - Tareas enfoque (variantes).html` — las 4 variantes de layout completas (A/B/C/D), con los componentes Stat, Row, VerTodo, Reportes, Alertas, Dispensaciones, Pacientes, TareasA/B/Compact ya resueltos.
- `source/Resumen - Link de ubicación (variantes).html` — exploración descartada del link de KPI (8 variantes).
- `source/Resumen - Tags de estado (variantes).html` — exploración descartada de tags de estado (5 variantes).
- `source/spiraTokens.jsx`, `source/Icons.jsx`, `source/SpiraVilanos.jsx` — tokens, íconos e isotipo compartidos que cargan los tres HTML anteriores.
- `screenshots/` — capturas de referencia de cada variante y de las exploraciones descartadas.
