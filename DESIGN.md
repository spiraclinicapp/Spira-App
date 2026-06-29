---
name: Spira
description: Sistema de diseño "Sereno" — petróleo + papel cálido, calma clínica auditable.
colors:
  ink: "#14302E"
  primary: "#0F5F57"
  paper: "#F4F1EA"
  surface: "#FBFAF6"
  white: "#FFFFFF"
  muted: "#7C8C87"
  faint: "#A6B0AC"
  line: "#E4DECF"
  line-2: "#D8CBB0"
  good: "#5C8A5A"
  warn: "#B0823F"
  danger: "#A6483B"
  track: "#2E7D74"
  pharma: "#C9A24A"
  pharma-solid: "#A8842F"
  lab: "#5C8A5A"
  contable: "#3A6B8C"
  on-accent: "#F4F1EA"
  brand-mark: "#0F5F57"
typography:
  display:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "10.5px"
    fontWeight: 700
    letterSpacing: "0.16em"
rounded:
  sm: "8px"
  md: "10px"
  lg: "16px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-outline:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "44px"
  card:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.lg}"
    padding: "22px 24px"
  badge-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "38px"
    width: "38px"
---

# Design System: Spira

## 1. Overview

**Creative North Star: "Sereno"**

Spira es la plataforma modular de investigación clínica de la Fundación Scherbovsky. El
sistema visual existe para que coordinadoras, farmacéuticas y médicos operen un flujo regulado
(ANMAT / ICH-GCP), con datos sensibles y a veces bajo presión de tiempo, **sin que la pantalla
sume tensión**. El nombre viene de *spirare* (respirar); el isotipo es el vilano del diente de
león. Todo el sistema persigue la misma sensación: **respirar tranquilidad** — confianza clínica
y calma, nunca alarma, nunca frialdad.

En la práctica eso es una paleta de baja saturación (petróleo sobre papel cálido), tipografía
con jerarquía clara pero sin gritar, mucho aire, color usado con intención y movimiento apenas
perceptible. La densidad es media: cabe información real sin amontonarla. Cada módulo (Track,
Pharma, Lab, Contable) tiene su acento dentro de la misma familia cromática, así que todo se
siente la misma app aunque cambie de contexto.

Lo que el sistema **rechaza explícitamente**: el SaaS cripto/fintech oscuro (glows, gradientes
violeta/cyan, tarjetas-métrica gigantes); el software médico legacy (gris institucional, tablas
infinitas, rojo de alarma por todos lados); la app de consumo gamificada (emojis, ilustraciones,
saturación alta); y la landing de startup genérica (eyebrows por sección, cards idénticas,
gradientes, copy marketinero). Si una pantalla se pudiera confundir con cualquiera de esas
cuatro, está mal.

**Key Characteristics:**
- Petróleo `#0F5F57` sobre papel cálido `#F4F1EA`; baja saturación, mucho aire.
- Schibsted Grotesk para títulos/números, Inter para cuerpo y datos. Sin italic.
- Color con intención: marca, acento del módulo activo, estados. Nunca decorativo.
- Plano con borde por defecto; sombra cálida suave solo en overlays y foco.
- Movimiento sutil: lo pulsable se levanta ~1px al hover y se asienta al pulsar.
- Tema claro y oscuro; los acentos y el primario se mantienen en ambos.

## 2. Colors: La paleta Sereno

Verdes petróleo de baja saturación sobre neutros cálidos; los acentos por módulo conviven en la
misma familia (verdes, ámbar, azul acero apagados). El color se reserva para significar, no para
decorar.

### Primary
- **Petróleo** (`#0F5F57`): color de marca. Rellenos sólidos de marca (avatar de usuario, login),
  outline de foco por teclado, isotipo en tema claro. Es el ancla cromática de todo el sistema.
- **Petróleo tinta** (`#14302E`): el `ink`. Color de texto principal sobre papel y de los títulos;
  también el extremo oscuro de sombras y backdrops (`rgba(20,48,46,…)`).

### Secondary — acentos por módulo
Cada módulo toma un acento de la misma familia; el acento "solid" da contraste suficiente para
texto papel encima.
- **Teal Track** (`#2E7D74`): módulo de coordinación clínica.
- **Ámbar Pharma** (`#C9A24A`, relleno sólido `#A8842F`): farmacia de investigación.
- **Salvia Lab** (`#5C8A5A`): muestras y análisis.
- **Azul acero Contable** (`#3A6B8C`): facturación y costos (elegido para no chocar con el ámbar).

### Tertiary — semánticos
- **Bien** (`#5C8A5A`): éxito / estado correcto.
- **Atención** (`#B0823F`): advertencia, ámbar tostado (no amarillo estridente).
- **Riesgo** (`#A6483B`): error / acción destructiva, terracota apagado (no rojo de alarma).

### Neutral
- **Papel cálido** (`#F4F1EA`): fondo del producto y de paneles de formulario. También `on-accent`
  (texto sobre acento, constante en ambos temas).
- **Superficie** (`#FBFAF6`): fondos sutiles (tintes de hover, chips).
- **Blanco** (`#FFFFFF`): cards, inputs, top bar.
- **Apagado** (`#7C8C87`) / **tenue** (`#A6B0AC`): texto secundario y terciario; íconos inactivos.
- **Línea** (`#E4DECF`) divisores y bordes de card; **Línea 2** (`#D8CBB0`) bordes de input.

### Named Rules
**La regla del color con intención.** El color significa algo: marca, acento del módulo activo, o
estado. Nunca es decorativo. Si un color no comunica una de esas tres cosas, sobra.

**La regla del acento apagado.** Atención es ámbar tostado y Riesgo es terracota, no amarillo ni
rojo de semáforo. El estado se nota por contexto + ícono + texto, no por saturación.

## 3. Typography

**Display Font:** Schibsted Grotesk (fallback `system-ui, sans-serif`)
**Body Font:** Inter (fallback `system-ui, sans-serif`)
**Mono:** Inter con `font-variant-numeric: tabular-nums` (clase `.spira-mono`) — no hay familia
mono aparte; las cifras y códigos usan Inter con números tabulares.

**Character:** Schibsted Grotesk es un grotesco con personalidad para títulos, marca y números
(peso 700, tracking apretado −0.02em); Inter es el caballo de batalla neutro para UI y datos. El
par es deliberado y se preserva como identidad, aunque Inter sea una elección "segura": la marca
ya está comprometida con él.

### Hierarchy
- **Display / H1** (Schibsted Grotesk 700, 40px, line-height 1.05, −0.02em): título de página.
- **Headline / H2** (Schibsted Grotesk 700, 24px, −0.02em): secciones, títulos de modal (~20px).
- **Title / H3** (Schibsted Grotesk 700, 17px): subtítulos, encabezados de card.
- **Body** (Inter 400, 14px, line-height 1.5): texto y controles. Descriptivos a ~13.5px muted.
- **Label de campo** (Inter 600, 12.5px, color muted): label de formulario en columna.
- **Eyebrow / rótulo** (Inter 700, 10.5px, tracking 0.16em, MAYÚSCULAS, color faint): rótulos como
  "SUBMÓDULOS", "SOLO LECTURA". Es el único uso de mayúsculas con tracking.

### Named Rules
**La regla sin italic.** El italic suena demasiado editorial para lo clínico; no se usa. El énfasis
va por peso o tamaño.

**La regla del rótulo, no del eyebrow.** Las MAYÚSCULAS con tracking son para rótulos puntuales
("SOLO LECTURA"), nunca un eyebrow decorativo arriba de cada sección.

**La regla de los números tabulares.** Cifras, códigos de estudio y lote van en `.spira-mono`
(Inter + tabular-nums) para que alineen en columnas y no "bailen".

## 4. Elevation

Sistema **plano con borde** por defecto, con sombra cálida y suave reservada para lo que de verdad
flota. Las superficies en reposo (cards, inputs, top bar) se separan por **borde** `--spira-line`
y color, no por sombra. La profundidad aparece solo en dos momentos: **overlays** (el modal) y
**foco interactivo** (el buscador, que se eleva ~1px con una sombra tenue en vez de un recuadro
duro). Se prefiere el borde antes que la sombra fuerte; la elevación es mínima y siempre cálida.

### Shadow Vocabulary
- **sm** (`box-shadow: 0 1px 2px rgba(20,48,46,0.06)`): elevación apenas perceptible para cards que
  necesitan despegarse un punto del papel.
- **md** (`box-shadow: 0 12px 32px rgba(20,48,46,0.10)`): overlays — la card del modal.
- **lg** (`box-shadow: 0 18px 40px rgba(20,48,46,0.14)`): popovers/menús que flotan más alto.
- **foco buscador** (`box-shadow: 0 5px 14px rgba(20,48,46,0.10)` + `translateY(-1px)`): foco sobrio
  sin outline duro (sigue siendo accesible por teclado).

### Named Rules
**La regla del borde antes que la sombra.** En reposo, separá con borde `--spira-line`, no con
sombra. La sombra es para lo que flota (modales) o reacciona (foco), nunca decorativa.

**La regla de la sombra cálida.** Toda sombra usa `rgba(20,48,46,…)` (petróleo tinta), nunca negro
puro. Una sombra fría delata el sistema.

## 5. Components

### Buttons
- **Shape:** radio 10px (`{rounded.md}`); alto 40px (acciones de formulario/vista) o 38px (acciones
  del encabezado y botones de ícono).
- **Primary** (`btnPrimary(accentSolid)` en [buttons.ts](src/components/buttons.ts)): relleno
  **sólido del módulo activo** (p. ej. petróleo, ámbar `#A8842F`, teal), texto papel
  (`--spira-on-accent`), Inter 600 14px, sin borde, padding `0 16px`.
- **Outline / secundario** (`btnOutline`): fondo blanco, borde 1px `--spira-line-2`, texto ink. El
  patrón por defecto para acciones no primarias.
- **Destructivo:** `btnPrimary('var(--spira-danger)')` — mismo relleno sólido, en terracota.
- **Icon button:** 38×38, fondo transparente, radio 10, ícono ink/muted. Para acciones del top bar.
- **Hover / Focus:** todo botón hereda la micro-interacción global (levante de ~1px al hover, se
  asienta al pulsar); foco visible por teclado vía `:focus-visible` (outline 2px primary). Los
  deshabilitados no se mueven y bajan a `opacity 0.6–0.7`.

### Inputs / Fields
- **Style:** alto 44px, padding `0 14px`, radio 10px, borde 1px `--spira-line-2`, fondo blanco,
  texto ink, Inter 14px (`fieldInput` en [FormField.tsx](src/components/FormField.tsx)).
- **Label:** en columna, arriba del control, Inter 600 12.5px color muted (sentence case).
- **Focus:** el buscador usa foco sobrio (sombra cálida tenue + levante 1px, sin outline); los demás
  controles, el outline accesible por defecto.
- **Doctrina de entrada:** preferir desplegables / valores preestablecidos al texto libre — el error
  del operador es un riesgo regulatorio (ver Do's and Don'ts).

### Cards / Containers
- **Corner Style:** 16px (`{rounded.lg}`).
- **Background:** blanco o `surface`; el papel cálido es el fondo de la página, no de la card.
- **Border:** 1px `--spira-line` (es lo que las separa, más que la sombra).
- **Shadow Strategy:** plano por defecto (ver Elevation); sombra solo si la card de verdad flota.
- **Internal Padding:** ~22–24px.
- **Card "hero" del dashboard:** puede ir en el acento pleno del módulo, con texto en papel.

### Modal / Dialog
- Backdrop `rgba(20,48,46,0.32)` + `backdrop-filter: blur(2px)`; card blanca, borde 1px `--spira-line`,
  radio 16, sombra **md**. Encabezado fijo + cuerpo scrolleable; cierra con Escape, click afuera y
  botón ✕ (32×32). Accesible (`role="dialog"`, `aria-modal`). Ver [Modal.tsx](src/components/Modal.tsx).

### Navigation
- **Top bar** unificado de ancho completo (alto 60, fondo blanco, borde inferior `--spira-line`).
  Logo = hub: el vilano + "Spira" (display 21px) vuelve al inicio. Chip del módulo activo con su
  acento al ~10–18% de fondo.
- **Dos niveles:** riel de módulos + panel de submódulos. El ítem activo toma el **acento del módulo**
  (texto + ícono + indicador); inactivo en `muted`.
- **`.spira-no-press`:** la navegación se señala por resaltado, **no** por el levante de 1px (se
  excluye a propósito de la micro-interacción global).

### Empty / State cards
- Card centrada (`EmptyState`), círculo de ícono 52×52 radio 14 teñido con `accent + '14'` (~8%),
  ícono en el acento (stroke 1.9), título H3 + descripción muted. Para vacío / cargando / sin acceso.

### Signature — la micro-interacción de pulsado
El gesto que define el sistema: todo lo pulsable (`button`, `a[href]`, `[role=button]`, `summary`)
se levanta `translateY(-1px)` al hover y vuelve a 0 al `:active`, vía una regla global en
[tokens.css](src/styles/tokens.css) bajo `@media (prefers-reduced-motion: no-preference)`. Es la
señal universal de "esto se toca" que no depende del cursor. Opt-out con `.spira-no-press`.

### Iconografía
Lucide (íconos de línea), trazo ~1.8–1.9, `currentColor`, vía [Icon.tsx](src/components/Icon.tsx).
Un ícono por módulo y submódulo; toma el acento del módulo cuando está activo, gris cuando no. El
vilano es la marca (isotipo), no un ícono de UI. **Sin emoji, sin unicode como íconos.**

## 6. Do's and Don'ts

### Do:
- **Do** usar petróleo `#0F5F57` sobre papel cálido `#F4F1EA` como base; baja saturación y mucho aire.
- **Do** reservar el color para significar (marca, acento del módulo activo, estado); el acento del
  módulo activo manda el tono de la pantalla.
- **Do** separar superficies en reposo con borde `--spira-line`; usar sombra cálida (`rgba(20,48,46,…)`)
  solo en overlays y foco.
- **Do** preferir **desplegables y valores preestablecidos** al texto libre — el error del operador
  es un riesgo regulatorio, no un detalle de UX.
- **Do** escribir copy en español rioplatense con voseo ("Ingresá", "Respirá tranquilidad"), sentence
  case en títulos y botones; cifras y códigos en `.spira-mono` (tabular-nums).
- **Do** dejar que lo pulsable se levante ~1px al hover; mantener foco visible por teclado.

### Don't:
- **Don't** parecerte al **SaaS cripto/fintech oscuro**: nada de glows, gradientes violeta/cyan ni
  tarjetas-métrica gigantes.
- **Don't** parecerte al **software médico legacy**: nada de gris institucional, tablas infinitas ni
  rojo de alarma por todos lados.
- **Don't** parecerte a una **app de consumo gamificada**: sin emojis, ilustraciones, saturación alta
  ni confeti.
- **Don't** parecerte a una **landing de startup genérica**: sin eyebrows en mayúscula sobre cada
  sección, cards idénticas en grilla, gradientes ni copy marketinero.
- **Don't** usar gradientes, texturas, glassmorphism decorativo ni `background-clip: text`.
- **Don't** usar `border-left`/`border-right` de color como franja de acento en cards o alertas.
- **Don't** usar italic, emoji, ni íconos en unicode.
- **Don't** animar con bounce ni elastic; el movimiento es corto (.12–.18s) y se asienta.
- **Don't** usar sombras negras o duras; toda sombra es cálida y mínima.
