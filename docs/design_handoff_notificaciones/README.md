# Handoff: Campana de notificaciones

Producto: **Spira** (topbar global, todos los módulos).
Feature: menú de notificaciones de la campana — rediseño completo del panel y de sus filas.
Reemplaza: `src/shell/NotificationsMenu.tsx`.
Idioma de la UI: **español rioplatense** (voseo: "No tenés alertas nuevas", "Estás al día").
Fecha del handoff: 05/09/2026.

---

## 1. Overview

La campana del topbar abre un panel de 440 px anclado al borde derecho del botón. El panel lista las alertas activas del usuario —**reportes pendientes** y **ventanas de visita vencidas**— una caja por alerta, y cierra con un pie que lleva a la vista completa de alertas.

Tres cosas cambian respecto de la versión actual:

1. **El badge de la campana deja de verse roto.** El número desaparece: el indicador es un punto de 8 px, hijo posicionado del propio botón.
2. **La fila entera es un link** a la ficha del paciente, no solo el nombre.
3. **Se puede descartar una alerta** desde la lista, con confirmación y motivo obligatorio.

El objetivo de diseño es **repetibilidad visual**: cada fila es una caja con la misma grilla de 4 columnas, de modo que ícono, nombre, motivo, protocolo, fecha y acción caen exactamente en la misma vertical de arriba a abajo. Ninguna caja cambia de alto por el largo del contenido.

---

## 2. Archivos de este bundle

| Archivo | Qué es |
|---|---|
| `Notificaciones - Anatomia.html` | **Empezar por acá.** Especificación visual completa: medidas, tokens, estados, animación, variantes evaluadas, casos límite. 15 secciones con ejemplos renderizados. |
| `Notificaciones - Prototipo.html` | Prototipo interactivo. Permite alternar los 3 armados de caja y los 4 botones de descarte que se evaluaron, y probar el flujo de descarte. |
| `spira-app-tokens.css` | Los tokens del design system Spira, por referencia. |

**Son referencias de diseño en HTML/CSS/JS plano.** Muestran el aspecto y el comportamiento buscados; **no son código de producción para copiar tal cual**. La tarea es recrearlos en React con los patrones del codebase.

Cosas del prototipo que **no** viajan a producción:

- Todo se re-renderiza con `list.innerHTML = ...` en un `render()` global y el estado vive en `let items`. En producción: estado de componente/query.
- Los links usan `alert()` en vez de navegar. En producción: la navegación real a la ficha del paciente.
- Los datos (5 alertas) son mock. Ver §7.
- El prototipo tiene cuatro filas de chips arriba para elegir variante. **No son parte del diseño** — son el selector del ejercicio. Lo elegido es: armado **A**, botón **tacho**, indicador **solo punto**, encabezado **“5 pendientes”**.

---

## 3. Fidelidad

**Alta fidelidad.** Colores, tipografía, espaciados, radios, estados y copy están definitivos. Recrear pixel-perfect.

La UI está construida sobre el design system **Spira** y no introduce ningún hex nuevo. Si el codebase ya tiene los tokens —los tiene, en `src/styles/tokens.css`— usar los del codebase. Los íconos existen todos en `src/components/Icon.tsx`: `bell`, `clipboardCheck`, `alertCircle`, `trash`, `arrowRight`, `check`. **No pegar SVGs sueltos.**

---

## 4. Estructura

```
button.bell            38 × 38, radio 10, position relative   ← ancla del badge
└── Icon "bell"        18 px, trazo 1.8, color --ink
└── span.badge         absolute top:5 right:4, punto de 8 px

div.panel              440 × max 520, radio 14, sombra --sh-md
                       absolute, top: 100% + 8px, right: 0
├── .phead             cabecera fija — título + píldora de conteo
├── .plist             flex:1, overflow-y:auto, max-alto 420, pad 10, gap 8
│   └── .card × n      una caja por alerta  ← §5
├── .footersep         hairline 1 px --line
└── .footbtn           "Ver todas las alertas →"  → Track › Alertas

div.reasonpop          246 px, radio 12 — popover de confirmación
                       fixed, z-index 200, montado en document.body (portal)
```

### 4.1 Campana y badge

- Botón 38 × 38, radio 10, fondo transparente. Hover: `background: var(--surface)`.
- **El indicador es un punto, no un contador.** `position:absolute; top:5px; right:4px`, 8 × 8 px, radio 999, `background: var(--danger)`, anillo `2px solid var(--white)` con `box-sizing: content-box`. Sin texto.
- **En cero no se dibuja** (`display:none`).

El número exacto vive en la cabecera del panel y en la lista; repetirlo sobre el ícono a 9 px lo volvía ilegible. El punto responde la única pregunta que se hace desde el topbar: *¿tengo algo?*

Se evaluaron ocho tratamientos —badge de 14, 16 y 18 px, badge cuadrado, punto, punto con pulso, contador al lado del ícono y campana teñida—. Están renderizados y justificados uno por uno en §2 de la anatomía; el prototipo los deja alternar.

### 4.2 Cabecera del panel

- Padding `13px 15px 11px`, sin borde inferior propio: el hairline lo aporta el `border-top` de `.plist`.
- Título: **Schibsted Grotesk 700, 15 px**. Texto: `Notificaciones`.
- Píldora de conteo: Inter 700 / 11.5 px, `color: var(--danger)`, `background: rgba(166,72,59,.10)`, radio 999, padding `2px 8px`, `white-space: nowrap`. **También se oculta en cero.**
- Texto de la píldora: **`5 pendientes`** (singular: `1 pendiente`). El número solo no alcanzaba —"5" al lado de "Notificaciones" no dice de qué—. Alternativas evaluadas y disponibles en el prototipo: `5 sin resolver`, `Pendientes: 5`, o sin texto (el punto de la campana ya avisa).

### 4.3 Pie

- Ancho completo, padding 12, fondo transparente, hover `--surface`.
- Inter 600 / 13 px en `--primary`, con `Icon name="arrowRight"` a 15 px.
- Texto: `Ver todas las alertas`. Destino: la vista completa de alertas de Track.

### 4.4 Animación de despliegue

Única animación del componente. El panel crece desde la esquina donde está la campana:

| Propiedad | De → a | Duración |
|---|---|---|
| `opacity` del panel | 0 → 1 | 160 ms |
| `transform` del panel | `scale(.95) translateY(-8px)` → `none` | 190 ms |
| Cajas de la lista | `opacity 0 / translateY(-5px)` → `none` | 260 ms, retardo `i × 22 ms` |

- `transform-origin: top right` — el panel sale de la campana, no del centro.
- Curva `cubic-bezier(.2,.8,.3,1)`: arranca rápido, frena suave.
- **Nada se anima al cerrar.** El panel desaparece de una; una salida animada retrasa la respuesta a un clic que ya fue dado.
- `prefers-reduced-motion` cancela la transición y la cascada: el panel aparece sin más.

---

## 5. La caja de alerta

Grilla de 4 columnas, idéntica en todas las filas:

```
grid-template-columns: 32px  minmax(0,1fr)  76px  22px
column-gap: 11px      padding: 11px       min-height: 66px
radio: 10px           border: 1px solid var(--line)
```

| Columna | Ancho | Contenido |
|---|---|---|
| 1 · Ícono | `32px` | Tipo de alerta. Cuadrado 32 px, radio 8, fondo del color del tipo al 9 % |
| 2 · Cuerpo | `minmax(0,1fr)` | L1: nombre + código. L2: motivo |
| 3 · Datos | `76px` | Chip de protocolo arriba, fecha abajo, ambos `justify-self:end` |
| 4 · Acción | `22px` | Tacho. **Columna reservada siempre**, con o sin hover |

### 5.1 Tipografía interna

| Elemento | Estilo |
|---|---|
| Nombre | Inter 600 · 12 px · `--ink` |
| Código de sujeto | Inter 600 · 12 px · `--muted` · `font-variant-numeric: tabular-nums` |
| Motivo | Inter 400 · 12 px · `--muted` · line-height 1.35 |
| Chip de protocolo | Inter 700 · 11 px · padding `2px 7px` · radio 99 |
| Fecha | Inter 500 · 11 px · `--faint` · tabular-nums |

### 5.2 Los dos tipos de alerta

| Tipo | Ícono | Color | Origen |
|---|---|---|---|
| Reporte pendiente | `clipboardCheck` | `--primary` #0F5F57 | `ProcedureReportAlertRow` |
| Ventana vencida | `alertCircle` | `--danger` #A6483B | `TrackVisitRow` |

El tipo se codifica **en el ícono y su color**, nunca solo en el color. El fondo del cuadrado es el color del tipo al 9 % (sufijo hex `18`).

**El color del chip de protocolo es el del protocolo**, y es independiente del tipo de alerta: una alerta de reporte de un protocolo en rojo lleva chip rojo con ícono verde.

### 5.3 Estados

| Estado | Cambios |
|---|---|
| Reposo | borde `--line`, fondo `--white`, sin sombra |
| Hover | borde `--line2`, fondo `--surface`, sombra `--sh-sm`, transición 140 ms |
| Foco (Tab) | `outline: 2px solid var(--primary)`, offset 2 px |
| Link interno en hover/foco | nombre y código se subrayan, `text-underline-offset: 3px`, sin cambio de color |

**La fila no se levanta.** Igual que `.spira-row-link` en el resto de la app: el hover resalta con fondo y borde, no con `translateY` ni sombra grande.

### 5.4 Truncado

Todo el contenido variable trunca en una línea con elipsis. **Ninguna caja crece de alto.**

| Caso | Comportamiento |
|---|---|
| Nombre largo | `text-overflow: ellipsis`; el código no se desplaza (`flex: 0 0 auto`) |
| Motivo largo | una línea con `…`; el texto completo en el `title` |
| Sin fecha | se dibuja un `—` en `--faint` |

El guion es deliberado: las alertas de reporte pendiente no tienen vencimiento, y dejar la celda vacía haría que el chip de protocolo se corriera hacia abajo, rompiendo la alineación entre filas.

---

## 6. Descarte de una alerta

### 6.1 El botón

`Icon name="trash"` a 15 px, trazo 1.7, dentro de un botón de 22 × 22 con radio 50 %.

- Reposo: `color: var(--faint)`, fondo transparente.
- Hover: `color: var(--danger)`, `background: rgba(166,72,59,.12)`.
- **Siempre visible.** Decisión explícita: el hit target no debe depender del hover, y en touch un botón que aparece en hover es un botón que no existe.

Se evaluaron y descartaron: cruz fina (se lee como "cerrar el panel"), kebab (suma un clic para una sola acción) y una celda propia con divisor vertical (corta la simetría de la lista). Están renderizadas en §7 y §11 de la anatomía.

### 6.2 El popup de confirmación

Descartar una alerta se registra con motivo y autor, así que **no se borra en seco**. El tacho abre un popover:

- 246 px, radio 12, padding 12, sombra `--sh-md`, `position: fixed`, `z-index: 200`.
- Anclado a la izquierda del tacho: `left = botón.left − 256`, tope 4 px por encima del botón.
- **Volteo:** si no entra abajo, se alinea su base con la base del botón. Nunca se corta contra el viewport.
- **Va en portal.** Si se anida dentro de `.plist`, el `overflow-y` del scroll lo recorta.

Contenido:

| Elemento | Estilo | Texto |
|---|---|---|
| Título | Schibsted Grotesk 700 · 13.5 px | `¿Descartar esta alerta?` |
| Bajada | Inter 400 · 11.5 px · `--muted` | `Se archiva con motivo y autor; si la condición cambia, vuelve a aparecer.` |
| Label | Inter 700 · 10 px · tracking .12em · uppercase · `--faint` | `Motivo` |
| Opción | 12 px · pad `6px 8px` · radio 7 · hover `--surface` | ver catálogo |
| Opción elegida | borde y texto `--primary`, fondo primary 7 %, peso 600 | |
| Acciones | alto 30 px, `flex:1` cada una | `Cancelar` · `Descartar` |

`Descartar` es `--danger` sólido y **arranca deshabilitado** (opacidad 45 %) hasta que hay un motivo elegido.

Catálogo de motivos (de `dismiss_alert`):

1. Ya resuelta fuera del sistema
2. La visita se reprogramó
3. No aplica a este protocolo
4. Cargada por error
5. Otro (explicar)

**"Otro" pide texto.** En producción esa opción despliega un campo obligatorio antes de habilitar `Descartar`. El prototipo no lo implementa.

### 6.3 Comportamiento

Al confirmar: la fila sale de la lista, el badge y la píldora decrementan, el popup cierra y **el panel sigue abierto**. La UI es optimista — saca la fila de inmediato y revierte si la escritura falla.

`Cancelar` o clic afuera cierran el popup sin cambios.

---

## 7. Datos

La fuente no cambia. Las alertas se derivan de lo que ya existe:

- `ProcedureReportAlertRow` (`src/data/reports.ts`) → reportes pendientes.
- `TrackVisitRow` (`src/data/visits.ts`) → ventanas vencidas.
- Los descartes se leen y escriben con `src/data/alertDismissals.ts` y el modelo de `src/data/alertDismissalModel.ts`.

Forma de cada fila en el prototipo:

```js
{
  id: 3,
  kind: 'ventana',              // 'reporte' | 'ventana'
  patient: 'Jorge Pelaitay',
  code: '032001500002',         // código de sujeto
  proto: 'LTS17231',
  protoColor: 'var(--primary)', // color del protocolo, no del tipo de alerta
  reason: 'V1 — Ventana vencida',
  when: '02 Jul 2026'           // '' cuando no aplica → se dibuja '—'
}
```

---

## 8. Interacciones

| Gesto | Resultado |
|---|---|
| Clic en la campana | abre/cierra el panel |
| Clic afuera · `Esc` | cierra el panel y cualquier popover abierto |
| Clic en la caja | navega a la ficha del paciente y cierra el panel |
| Clic en nombre o código | mismo destino; existen como botones aparte para teclado |
| Clic en el tacho | abre el popup; **no propaga** a la fila |
| Clic en un motivo | lo marca y habilita `Descartar` |
| `Descartar` | saca la alerta, decrementa el badge, cierra el popup |
| `Cancelar` · clic afuera | cierra el popup sin cambios |
| `Tab` | recorre caja → nombre → código → tacho, fila por fila |

---

## 9. Accesibilidad

- El nombre y el código deben seguir siendo **`<PatientLink>`**, no texto plano: son los targets de teclado de la fila. La caja clickeable es una comodidad de mouse, no el único camino.
- El outline de foco nunca se remueve.
- Cada tacho lleva `title="Eliminar notificación"` (o `aria-label` equivalente).
- El motivo largo va completo en el `title` de la línea truncada.
- Contraste: `--muted` sobre `--white` y sobre `--surface` cumple 4.5:1 a 12 px. `--faint` se usa solo para fechas de 11 px y el ícono del tacho en reposo, ambos con refuerzo redundante (el dato también está en la fila; el tacho tiene `title`).

---

## 10. Estado vacío

Sin alertas: el badge desaparece de la campana, la píldora de conteo desaparece de la cabecera y la lista se reemplaza por el mensaje. El pie se mantiene.

- Círculo de 42 px, `background: rgba(92,138,90,.12)`, con `Icon name="check"` a 20 px trazo 2.2 en `--good`.
- `Estás al día` — Inter 600 · 14 px.
- `No tenés alertas nuevas.` — Inter 400 · 12.5 px · `--muted`.
- Padding del bloque: `30px 16px 34px`, centrado.

---

## 11. Tokens

Todos de `src/styles/tokens.css`. No hay hex nuevos.

| Token | Valor | Uso acá |
|---|---|---|
| `--spira-ink` | #14302E | nombre, títulos |
| `--spira-acc-deep-track` | #0F5F57 | reporte pendiente, links, pie |
| `--spira-acc-deep-danger` | #A6483B | ventana vencida, badge, descartar |
| `--spira-good` | #5C8A5A | estado vacío |
| `--spira-muted` | #61706C | motivo, código |
| `--spira-faint` | #838C89 | fecha, tacho en reposo |
| `--spira-line` | #E4DECF | bordes, hairlines |
| `--spira-line2` | #D8CBB0 | borde en hover |
| `--spira-surface` | #FBFAF6 | fondo en hover |
| `--spira-font-display` | Schibsted Grotesk | títulos |
| `--spira-font-text` | Inter | todo lo demás |

Radios: panel 14 · popup 12 · caja 10 · ícono 8 (32 px) y 7 (28 px) · badge y chips 999.
Sombras: `--sh-md` `0 14px 34px rgba(20,48,46,.14)` (panel, popup) · `--sh-sm` `0 1px 2px rgba(20,48,46,.06)` (caja en hover).
Movimiento: 190 ms el despliegue del panel · 260 ms la cascada de cajas (22 ms de retardo entre una y otra) · 140 ms el hover de la caja · 120 ms el tacho. Nada más se anima, y nada se anima al cerrar.

---

## 12. Checklist de implementación

- [ ] Punto de 8 px como hijo absoluto del botón de la campana; oculto en 0; sin número.
- [ ] Píldora de la cabecera con el texto `N pendientes` (singular en 1).
- [ ] Animación de despliegue con `transform-origin: top right` y cascada de 22 ms; sin animación de cierre; `prefers-reduced-motion` respetado.
- [ ] Panel 440 px anclado a la derecha, cabecera y pie fijos, lista con scroll a 420 px.
- [ ] Caja con la grilla `32px minmax(0,1fr) 76px 22px` y la columna de acción **siempre** reservada.
- [ ] `—` cuando no hay fecha.
- [ ] Fila entera navegable + `<PatientLink>` en nombre y código.
- [ ] Truncado a una línea en nombre y motivo, con `title` completo.
- [ ] Íconos vía `<Icon>`, no SVGs sueltos.
- [ ] Tacho siempre visible, 22 px, hover en `--danger`.
- [ ] Popup en portal, con volteo, motivo obligatorio, `Descartar` deshabilitado sin motivo.
- [ ] "Otro (explicar)" despliega el campo de texto obligatorio.
- [ ] Escritura por `dismiss_alert` con motivo y autor; UI optimista con reversión.
- [ ] Estado vacío con `Estás al día`.
- [ ] Chip de protocolo con el color del protocolo, no del tipo de alerta.
