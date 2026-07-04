# Handoff: Medicamentos (Spira Pharma)

## Overview
Vista del apartado **Medicamentos** del módulo **Spira Pharma** — el catálogo de medicamentos de la farmacia clínica. El usuario primero elige un origen (Farmacia Protocolo o Farmacia Ambulatoria) desde una **prevista**, y al seleccionar entra al listado correspondiente. Comparte la identidad visual y los patrones de la vista de **Recepción** (mismo shell, mismas cards).

## About the Design Files
Los archivos de este bundle son **referencias de diseño creadas en HTML** — prototipos que muestran el aspecto y el comportamiento buscado, **no código de producción para copiar tal cual**. La tarea es **recrear estos diseños en el entorno del codebase destino** (React, Vue, etc.) usando sus patrones y librerías establecidas. Si aún no hay entorno, elegir el framework más apropiado e implementar ahí.

Los prototipos usan un pequeño runtime propio (`support.js`) con tags `<x-dc>`, `<sc-if>`, `<sc-for>` y `<dc-import>`. **No hay que portar ese runtime** — es solo el andamiaje del prototipo. Interesa la UI, el layout y la lógica de navegación descriptos abajo.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, espaciado e interacciones son finales. Recrear la UI pixel-perfect usando las librerías/patrones del codebase. Todos los tokens exactos están en la sección Design Tokens.

## Screens / Views

La vista vive dentro del **shell de Spira Pharma** (top bar 60px + riel de módulos 64px + panel de submódulos 208px + área de contenido). En el panel de submódulos, **Medicamentos** queda activo (tinte ámbar `rgba(201,162,74,.14)`, texto `--spira-pharma-solid`). El contenido tiene 3 estados: **Prevista**, **Farmacia Protocolo** y **Farmacia Ambulatoria**.

### 1. Prevista (menú de apartados)
- **Purpose**: elegir el origen del medicamento antes de entrar al listado.
- **Layout**: header (breadcrumb `Spira Pharma › Medicamentos` + título `Medicamentos` 24px + botón `Nuevo medicamento` a la derecha). Debajo, eyebrow `ELEGÍ EL APARTADO` y un grid de 2 columnas (`grid-template-columns:1fr 1fr; gap:16px; max-width:760px`).
- **Components** — dos cards clickeables (`<button>`), cada una:
  - Card: `background:#FFFFFF`, `border:1px solid var(--spira-line)`, `border-radius:16px`, `box-shadow:var(--spira-shadow-sm)`, columna vertical, `overflow:hidden`, cursor pointer.
  - Cabecera: ícono 48×48 `border-radius:13px` sobre fondo de acento tenue + título 19px display 700.
    - **Farmacia Protocolo**: ícono documento (Lucide `file-text`), fondo `rgba(168,132,47,.14)`, stroke `--spira-pharma-solid`.
    - **Farmacia Ambulatoria**: ícono pastilla (Lucide `pill`), fondo `rgba(58,107,140,.12)`, stroke `--spira-contable`.
  - Descripción: 13.5px `--spira-muted`, line-height 1.5.
    - Protocolo: "Medicación del estudio, agrupada por protocolo. Con trazabilidad por lote y vencimiento."
    - Ambulatoria: "Medicación de farmacia general, sin protocolo. Listado único de todos los medicamentos."
  - Footer con `border-top:1px solid var(--spira-line)`, padding `13px 20px`, `justify-content:space-between`: conteo a la izquierda (12.5px `--spira-faint`) + acción `Entrar →` (13.5px 600, color de acento del apartado, flecha Lucide `arrow-right`).
    - Protocolo: "3 protocolos · 5 medicamentos".
    - Ambulatoria: "6 medicamentos".
  - **Click** en la card → entra al listado correspondiente.

### 2. Farmacia Protocolo (listado agrupado por protocolo)
- **Purpose**: ver los medicamentos de estudio, agrupados por protocolo, con lote y vencimiento.
- **Layout**: header con **botón Volver** (flecha izquierda, 38×38, `border:1px solid var(--spira-line-2)`, radius 10px) + breadcrumb `Spira Pharma › Medicamentos › Farmacia Protocolo` + título `Farmacia Protocolo`. Luego toolbar y lista scrolleable (`margin:16px 24px 22px; overflow:auto; gap:22px` entre grupos).
- **Toolbar** (`display:flex; gap:10px; flex-wrap:wrap`):
  - Buscador pill (flex:1, min-width 230px, alto 40px, `border-radius:99px`, borde `--spira-line-2`), ícono lupa + placeholder "Buscar por nombre, monodroga o lote…".
  - Chips (alto 34px, `border-radius:99px`): "Todos" activo (fondo `rgba(168,132,47,.14)`, texto `--spira-pharma-solid`, borde `rgba(168,132,47,.35)`), "Vigentes", "Vence pronto" (punto `--spira-pharma-solid`), "Vencidos" (punto `--spira-danger`).
  - Botón "Más filtros" a la derecha (ícono Lucide `sliders-horizontal`).
- **Grupo** (uno por protocolo): encabezado con ícono documento 26×26, código de protocolo en **monoespaciada** color `--spira-pharma-solid` (ej. `EFC18244`), nombre del ensayo 13.5px 600 ink (ej. `THESEUS`), línea divisoria flexible, y conteo a la derecha ("2 medicamentos").
- **Fila de medicamento** (card): ver **Fila de medicamento** abajo.

### 3. Farmacia Ambulatoria (listado plano)
- **Purpose**: ver todos los medicamentos de farmacia general, sin agrupar.
- **Layout**: igual header (Volver + breadcrumb `… › Farmacia Ambulatoria` + título) y toolbar idénticos. La lista es **plana** (`gap:9px`), precedida por un encabezado único: eyebrow `TODOS LOS MEDICAMENTOS` + divisor + conteo ("6 medicamentos").
- **Fila de medicamento**: idéntica a la de Protocolo.

### Fila de medicamento (compartida)
`<div>` card horizontal: `display:flex; align-items:center; gap:14px; padding:13px 16px; background:#FFFFFF; border:1px solid var(--spira-line); border-radius:14px; box-shadow:var(--spira-shadow-sm); cursor:pointer`. Contenido, de izquierda a derecha:
1. Ícono pastilla (Lucide `pill`) 20px, en cuadro 40×40 `border-radius:11px` fondo `rgba(168,132,47,.13)`, stroke `--spira-pharma-solid`.
2. Bloque principal (`flex:1 1 300px`): **nombre comercial** 15px 600 (ej. "Alvetide 184/22 mcg", con ellipsis) + **monodroga** 12.5px `--spira-muted` (ej. "Budesonide / Formoterol").
3. Columna **Lote** (`flex:0 0 150px`): label eyebrow 11px `--spira-faint` "LOTE" + valor en monoespaciada 13.5px ink (ej. `L-2291`).
4. Columna **Vencimiento** (`flex:0 0 170px`): label "VENCIMIENTO" + fecha monoespaciada tabular-nums (ej. `31/12/2027`) + **badge de estado** opcional (pill 10.5px 700):
   - `ok` → sin badge, fecha color ink.
   - `pronto` → badge "Vence pronto", texto/borde `--spira-pharma-solid`, fondo `rgba(168,132,47,.14)`; fecha color `--spira-pharma-solid`.
   - `vencido` → badge "Vencido", texto `--spira-danger`, fondo `rgba(178,58,52,.12)`; fecha color `--spira-danger`.
5. Chevron derecho (Lucide `chevron-right`) 17px, stroke `--spira-faint`.

## Interactions & Behavior
- **Navegación prevista → apartado**: click en card Protocolo → estado `protocolo`; click en card Ambulatoria → estado `ambulatoria`.
- **Volver**: botón flecha (o el breadcrumb) → vuelve a `menu` (prevista).
- La toolbar (buscador + chips) solo se muestra dentro de un apartado, no en la prevista.
- El botón "Nuevo medicamento" está siempre presente en el header.
- **El estado de vencimiento** se calcula respecto a la fecha actual: futuro lejano = `ok`, próximo = `pronto`, pasado = `vencido`. (En el prototipo está hardcodeado por ítem; en producción derivarlo de la fecha real.)
- Transiciones sutiles (opacidad/posición .12–.18s), sin animaciones llamativas. Hover: tinte de acento ~8–16% o fondo `--spira-surface`.

## State Management
- `medScreen`: `'menu' | 'protocolo' | 'ambulatoria'` (default `'menu'`). Deriva:
  - `isMedMenu = medScreen === 'menu'`
  - `medInSub = medScreen !== 'menu'`
  - `isMedProto`, `isMedAmbu`
  - `medSubName` = "Farmacia Protocolo" / "Farmacia Ambulatoria" para breadcrumb y título.
- Handlers: `enterProto`, `enterAmbu`, `medBack`.
- **Data**: en producción, listar medicamentos por protocolo (para el modo protocolo) y el catálogo general (para ambulatoria). Cada medicamento: `{ comercial, mono (monodroga), lote, vto (vencimiento), estado, proto?, ensayo? }`.

## Design Tokens
Tomados del sistema **Spira — Identidad Visual** (`colors_and_type.css`). Valores clave:
- **Marca / acentos**: primario petróleo `#0F5F57`; Pharma acento `#C9A24A` (`--spira-pharma`), Pharma relleno sólido `#A8842F` (`--spira-pharma-solid`, botones/íconos); Contable azul acero `#3A6B8C` (`--spira-contable`).
- **Neutros (tema claro)**: ink `#14302E`, papel `#F4F1EA`, blanco `#FFFFFF`, surface tenue, muted / faint (grises de texto). Líneas: `--spira-line` `#E4DECF` (divisores/cards), `--spira-line-2` `#D8CBB0` (inputs).
- **Semánticos**: danger ≈ `#B23A34` (usado como `rgba(178,58,52,.12)` en badge vencido), good salvia.
- **Tinte de acento**: hover/activo con `rgba(201,162,74,.14)` (submenú) / `rgba(168,132,47,.13–.14)` (íconos, chips, cards).
- **Tipografía**: display/números **Schibsted Grotesk** 700; cuerpo/UI **Hanken Grotesk** 400–600; códigos y datos (lote, fechas, protocolo) **IBM Plex Mono**. Sin italic.
- **Radios**: 8–10px controles, 11–14px cards de fila, 16px cards grandes, 99px (pill) chips/badges.
- **Sombras**: suaves y cálidas — `--spira-shadow-sm` en cards/filas; nada duro.
- **Escala tipográfica usada**: título 24px, card grande 19px, fila 15px, cuerpo 13.5px, monodroga 12.5px, eyebrow 11px (tracking .12em, mayúsculas), badge 10.5px.
- **Íconos**: set **Lucide** (línea, trazo ~1.9px, viewBox 24×24, `currentColor`). Usados: `pill`, `file-text`, `search`, `sliders-horizontal`, `plus`, `arrow-left`, `arrow-right`, `chevron-right`. El isotipo es el **vilano** (SVG propio en `assets/`).
- **Tema oscuro**: el sistema lo soporta vía `[data-theme="dark"]` en un ancestro (fondo petróleo-carbón `#0E1B1A`, superficies `#142523`). Los acentos y el primario se mantienen; el texto sobre acento usa `--spira-on-accent`. **Esta vista se fija en tema claro.**

## Assets
- Íconos: **Lucide** (licencia ISC) — inline SVG en el prototipo. Usar el set de íconos del codebase destino.
- Isotipo del vilano: `assets/spira-vilano-petrol.svg` (en el proyecto).
- Sin emoji, sin imágenes bitmap.

## Files
- `Recepcion-Final-v2.dc.html` — prototipo principal. La vista de Medicamentos es el bloque con id **`3a`** (buscar el comentario `3a — Medicamentos`). La lógica (`medScreen`, listas de medicamentos, cálculo de estado de vencimiento) está en el `<script data-dc-script>` al final del archivo.
- `SpiraChromeMed.dc.html` — el shell de Spira Pharma con el submódulo **Medicamentos** activo (top bar, riel de módulos, panel de submódulos). El área `<main>` recibe el contenido.
- `support.js` — runtime del prototipo (andamiaje, no portar).
- Sistema de diseño completo (tokens, componentes, tema oscuro): carpeta `_ds/spira-identidad-visual-8ae23286-bc63-4c58-b239-3382adb8fc91/` del proyecto (`colors_and_type.css`).
