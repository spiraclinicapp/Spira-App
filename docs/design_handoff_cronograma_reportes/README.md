# Handoff · Cronograma, Procedimientos del estudio y Reportes (con checklist de reportes)

**Prototipos incluidos en esta carpeta:**
- `Cronograma - Procedimientos y Reportes.html` — protocolo ACT18301, 3 tabs: Pacientes / Cronograma / Reportes pendientes.
- `Visita - Modal con Reportes.html` — recreación del modal real de visita (AIRLYMPUS · ACT18301 · Visita V5) con el desglose de reportes integrado en "Procedimientos".
- `colors_and_type.css` — tokens usados (`--spira-*`), ya cargados por ambos HTML.

Abrí los HTML directamente en el navegador para interactuar (son standalone, React vía CDN). Las capturas de `screenshots/` son el estado real de estos archivos — no son mockups aparte.

---

## 1 · Qué resuelve

Hoy el catálogo de procedimientos (`procedures`) tiene un flag binario `has_report`. Un procedimiento (ej. una extracción de sangre) puede generar **varios reportes distintos**, cada uno en una **plataforma distinta** (IQVIA, LabCorp, Clario, Roche 4G), con su propio tiempo de espera. Este prototipo:

1. Agrega una sección **"Procedimientos del estudio"** donde se arma el catálogo con tiempos y se define, por procedimiento, **qué reportes lleva** (nombre, plataforma, link directo, ETA, notas).
2. Agrega un **tablero de "Reportes pendientes"** a nivel protocolo, con estado en 3 etapas (**Pendiente → Descargado → Evolucionado**), enlaces directos a cada plataforma, historial de quién y cuándo tocó cada reporte, y cierre automático de la visita cuando todos sus reportes quedan evolucionados.
3. Integra el mismo desglose de reportes **dentro del modal real de Visita**, en la card de "Procedimientos".

---

## 2 · Mapa de pantallas

```
App (protocolo ACT18301)
├── Tab "Pacientes"           → placeholder, fuera de alcance de este prototipo
├── Tab "Cronograma"
│   ├── Sub-tab "Visitas"                    → tabla de visitas (sin cambios de fondo)
│   └── Sub-tab "Procedimientos del estudio" → catálogo + modal "Editar procedimiento"
└── Tab "Reportes pendientes" → tablero kanban (Pendiente / Descargado / Evolucionado)
```

Estado por defecto al abrir el archivo: tab **"Reportes pendientes"** (`captura 01-cronograma.png`).

---

## 3 · Modelo de datos (prototipo → sugerido para backend)

```
procedures (catálogo global, ya existe)
  id, code, name, category, requires_dispensation, min_estimated

report_definitions (NUEVO — reemplaza has_report/report_eta_hours booleanos)
  id, procedure_id, protocol_id, name, platform, link, eta_hours, notes
  # "known reports" del combobox = SELECT DISTINCT name, platform, eta_hours
  #   FROM report_definitions WHERE protocol_id = :protocolo

report_status (NUEVO — una fila por reporte de una visita realizada)
  id, visit_id, report_definition_id, status ('pendiente'|'descargado'|'evolucionado')
  due_at        # completed_at del procedimiento + eta_hours
  updated_at, updated_by

report_status_history (NUEVO — log de auditoría)
  id, report_status_id, stage, by (user_id), at (timestamp)

visit_closure (NUEVO, o columna en patient_visits)
  visit_id, closed_at, closed_by
  # se setea cuando TODOS los report_status de esa visita = 'evolucionado'
  # Y todos los procedimientos con reporte están marcados realizados.
```

**Plataformas** (enum sugerido): `iqvia`, `labcorp`, `clario`, `roche4g`, `otro`. Colores usados en el prototipo (para badges, NO para chips de UI genérica — son específicos de plataforma):

| Plataforma | Color |
|---|---|
| IQVIA | `#3A6B8C` |
| LabCorp | `#5C8A5A` |
| Clario | `#B0823F` |
| Roche 4G | `#A6483B` |
| Otra plataforma | `#7C8C87` |

**Categorías de procedimiento** (ya existentes, para referencia de color):
Elegibilidad `#2E7D74` · Evaluación clínica `#14302E` · Cardio-respiratorio `#3A6B8C` · Laboratorio `#5C8A5A` · Cuestionarios `#B0823F` · Medicación `#A8842F` · Seguridad `#A6483B`.

---

## 4 · Cronograma › Procedimientos del estudio

**Captura:** `03-cronograma.png` (lista) y `04-cronograma.png` (modal de edición abierto).

- Tabla agrupada por categoría (mismo agrupador visual que el modal de "Procedimientos de la visita" ya existente). Cada fila: nombre + "~N min" muted debajo, píldora **"N reportes"** (o "Sin reportes" en muted si no tiene), hasta 3 puntitos de color de plataforma junto a la píldora, código en mono, botón eliminar.
- **Tocar el nombre del procedimiento** (no la píldora) abre el modal **"Editar procedimiento"** — único punto de entrada, reemplaza el viejo panel de reportes separado.
- Buscador arriba (nombre/iniciales/categoría) + botón sólido **"+ Procedimiento"** que despliega un form inline (mismos campos que el modal, sin la sección de reportes — un procedimiento nuevo no tiene reportes hasta guardarse).

### Modal "Editar procedimiento" — anatomía exacta

```
┌──────────────────────────────────────────────┐
│ [ícono lápiz 34×34, bg accent 12%]  Editar     │ ← header, borde inferior, padding 18px 20px 14px
│  procedimiento                            [x]  │
├──────────────────────────────────────────────┤
│ Nombre                                         │
│ [input boxeado h:36 ancho completo]            │
│                                                 │
│ Iniciales (110px)     Categoría (resto)        │
│ [input mono centrado] [botón boxeado: punto +   │
│                         label + flecha ›, rota  │
│                         90° = ▾. Click abre      │
│                         popover con la lista]    │
│                                                 │
│ Demora estimada                                │
│ [<select> boxeado: 5/10/15/20/30/45/60/90 min  │
│  + "Otra…" → aparece input numérico debajo]     │
│ Cuánto dura el procedimiento en promedio, de    │
│ principio a fin.                    ← helper 11px muted │
│ ──────────────────────────────────  ← divisoria (borde superior, padding-top 16px) │
│ 📄 Reportes (N)                                │
│ [fila reporte: nombre + notas | badge plataforma │
│  con link ↗ | "~Xh" | lápiz | tacho]            │
│ + Agregar reporte  (botón punteado, abre el      │
│   form de abajo)                                │
├──────────────────────────────────────────────┤
│                            [Cancelar] [Guardar  │ ← footer ÚNICO para todo el modal
│                                        cambios]  │   (borde superior + fondo surface)
└──────────────────────────────────────────────┘
```

Medidas: modal `width: min(620px, 100%)`, `border-radius: 18px`, `box-shadow: var(--spira-shadow-lg)`. Body con scroll interno si el contenido no entra (`overflow-y:auto`). Un solo footer de acciones para **todo** el modal (datos del procedimiento + reportes) — no hay un "Guardar" separado para los reportes; agregar/editar/eliminar un reporte impacta al toque (no queda pendiente de "Guardar cambios").

**Categoría** es un desplegable real: botón con el mismo boxeado que un input (`height:36`, borde `var(--spira-line-2)`, radius 8), punto de color + label a la izquierda, flecha a la derecha. Al click, un popover absoluto debajo (`border-radius:9`, `shadow-sm`, `max-height:220px` con scroll) lista las 7 categorías con su punto de color; la actual queda resaltada con `background: var(--spira-surface)`.

**Demora estimada** es un `<select>` nativo boxeado (mismo alto/borde que los inputs) con presets `5,10,15,20,30,45,60,90` minutos + opción **"Otra…"**; elegir "Otra…" revela un input numérico angosto (120px) debajo para cargar cualquier valor. Siempre con el texto de ayuda gris debajo.

---

## 5 · Form "Agregar / editar reporte"

**Captura:** `04-cronograma.png` ya lo muestra embebido; abrí "Agregar reporte" para ver el form completo (mismos campos que en el reporte existente "Hematología completa" de la captura).

Todos los campos con **label arriba, control boxeado abajo, ayuda gris debajo** cuando corresponde. Sin recuadro de color envolviendo el form (se sacó a pedido — antes tenía un borde+fondo verde que "ahogaba").

| Campo | Control | Comportamiento |
|---|---|---|
| **Nombre del reporte** | Combobox real (`NameCombo`) | Escribir autocompleta inline (el resto del texto sugerido queda seleccionado — seguís tipeando y lo reemplaza, patrón "autocomplete" de barra de direcciones). Un clic en el campo o en la flecha derecha despliega la lista completa de reportes ya usados **en otros procedimientos de este protocolo**, con su plataforma a la derecha de cada opción. Si no hay coincidencia, deja cargar un nombre nuevo libremente ("se creará «X» como nuevo"). Elegir uno existente autocompleta Plataforma y Demora. |
| **Plataforma** | `<select>` boxeado | IQVIA / LabCorp / Clario / Roche 4G / Otra plataforma. |
| **Link directo a la plataforma** | input boxeado + botón "↻" | Se autocompleta con la URL de la plataforma elegida. Si el usuario lo edita a mano, aparece un botón circular de "restablecer" (ícono refresh) para volver al link default de la plataforma. Deja de autocompletarse solo mientras el usuario no toque "restablecer". |
| **¿Cuánto tarda en estar listo?** | Chips `1 hora / 24 horas / 48 horas / 72 horas` + input numérico "otra (h)" | Click en un chip fija el valor (chip queda con borde+fondo accent). El input numérico siempre visible al lado para cualquier valor custom. Ayuda debajo: "Tiempo desde que se realiza el procedimiento hasta que el reporte aparece en la plataforma." |
| **Notas o instrucciones** *(opcional)* | textarea boxeada, resize vertical | El "(opcional)" va en el label, en gris, para no generar la sensación de campo obligatorio. |

Botones: **Cancelar** (outline) / **Guardar reporte** (sólido accent) — deshabilitado hasta que Nombre tenga texto.

---

## 6 · Tab "Reportes pendientes" — tablero kanban

**Capturas:** `01-cronograma.png` (tablero por defecto) y `06-cronograma.png` (una tarjeta con el historial desplegado).

### Header de la vista
Contador **"N reportes en curso"** + badge rojo **"N vencidos"** (solo si hay) a la izquierda. A la derecha, 3 controles: **filtro por visita** (`<select>`: Todas las visitas / V1…V8), **filtro por plataforma** (`<select>`), y **"Actuando como"** (`<select>` con 3 usuarios de ejemplo — determina a quién se le atribuye cada cambio de estado en el historial).

### Las 3 columnas
`Pendiente` (punto gris/muted) · `Descargado` (punto `#3A6B8C`) · `Evolucionado` (punto accent sólido `var(--spira-primary)`). Cada columna: header con punto de color + label + contador, `min-height:220px`, fondo `var(--spira-surface)`; se resalta con borde accent y fondo `rgba(46,125,116,.06)` cuando se arrastra una tarjeta encima (drop target).

**Solo aparecen tarjetas de procedimientos ya marcados "realizado"** en su visita — si el procedimiento no está realizado, ese reporte todavía no existe como tarjeta (nada que gestionar).

### Anatomía de la tarjeta (`KanbanCard`)
```
┌────────────────────────────────┐
│ ACT18301 · V3  Randomización    │ ← protocolo (muted) · código visita (mono, accent) · nombre visita
│ Herrera, Marisol            [📎]│ ← nombre paciente 14px bold + botón "ver procedimientos de la visita"
│ ACT18301-004                    │ ← código paciente, mono, muted
│                                  │
│ Hematología completa            │ ← nombre del REPORTE, 13.5px bold
│ Extracción de sangre — Hemat…   │ ← nombre del procedimiento, muted, 11px
│                                  │
│ [ Abrir en LabCorp ↗ ]           │ ← botón ancho completo, bg color-plataforma al 11%, texto color-plataforma
│ Vence en 32 h / Vencido hace…   │ ← 10.5px, rojo si vencido
│                                  │
│ [ Marcar descargado ]      [↺]  │ ← botón primario (color de la ETAPA SIGUIENTE) + botón "retroceder etapa"
│ 📋 Historial (2)            ⌄   │ ← toggle; expandido lista "fecha hora · Etapa · Persona"
└────────────────────────────────┘
```

**Botón "ver procedimientos de la visita" (📎, esquina sup. derecha):** abre el mismo modal transfer-list de `Cronograma › Visitas` para esa visita puntual, con los procedimientos ya asignados — permite saltar directo a ajustar el cronograma sin salir de la vista de reportes.

**Botón de plataforma:** es un link real (`<a target="_blank">`), no solo un badge — un clic abre la plataforma en pestaña nueva, con la URL cargada desde la definición del reporte.

**Avance de etapa — dos formas, ambas activas:**
1. **Botón principal** ("Marcar descargado" → "Marcar evolucionado"): siempre en el color de la etapa a la que avanza (`#3A6B8C` descargado, accent sólido evolucionado). Al llegar a "Evolucionado" el botón desaparece y queda un rótulo fijo "✓ Evolucionado".
2. **Arrastrar la tarjeta** a cualquier columna (drag & drop nativo) — permite saltar directo de Pendiente a Evolucionado si hace falta corregir.

Botón **"↺" (retroceder)** siempre visible, por si hay que deshacer un estado por error.

**Historial:** cada cambio de etapa (incluida la creación) queda log-eado con `{ etapa, quién, cuándo }`. El toggle "Historial (N)" lo despliega como lista simple `fecha/hora · Etapa · Nombre`. La persona que figura en las acciones nuevas es la seleccionada en "Actuando como" (cabecera de la vista).

### Cierre automático de visita
Cuando **todos** los procedimientos-con-reporte de una visita están (a) marcados realizados y (b) sus reportes en "Evolucionado", esa visita:
- Desaparece de las 3 columnas del tablero (ya no hay nada pendiente que mostrar).
- Aparece en una sección aparte al pie, **"✓ Visitas cerradas · alerta finalizada"**, con una fila por visita: código de visita, nombre del paciente, y **"Visita realizada · cerrada por {persona} · {fecha/hora}"** — la persona y fecha son las del último reporte que se marcó evolucionado (el que gatilló el cierre).

Esto es el equivalente visual de "marcar la visita como realizada y cerrar la alerta de reporte" pedido: no hace falta una acción manual aparte, el cierre es automático y qu​eda auditado.

---

## 7 · Integración en el modal real de Visita

**Capturas:** `01-visita-modal.png` (estado inicial) → `02` (procedimiento marcado realizado, reporte desplegado, en Pendiente) → `03` (Descargado) → `04` (Evolucionado + historial).

Dentro de la card **"Procedimientos"** del modal de visita (idéntica al diseño real que trajiste — header con contador "X/Y realizados", filas con checkbox):

- Cada procedimiento con reportes definidos suma una **píldora "N reporte(s)"** con flecha a la derecha del nombre — el desglose se abre/cierra con esa píldora, **independiente** del checkbox.
- **Tildar el checkbox "realizado" YA NO abre el desglose automáticamente** — solo activa el plazo (arranca a correr la ETA para calcular vencimiento/alertas). Ajuste explícito pedido: antes se auto-expandía, ahora el usuario decide cuándo desplegar.
- Si se despliega el desglose **antes** de marcar el procedimiento como realizado, se ve el aviso: *"Se habilita al marcar el procedimiento como realizado."*
- Una vez realizado, el desglose muestra la misma tarjeta de reporte que en el tablero: nombre + notas, botón **"Abrir en {plataforma} ↗"**, texto de vencimiento/estado, botón de avance de etapa + retroceder, e "Historial (N)" expandible — **el mismo componente y las mismas reglas que en `Reportes pendientes`**, no una versión aparte.

---

## 8 · Tokens y estilos usados (todos ya en `colors_and_type.css`)

- Acento del módulo Track: `var(--spira-track)` (texto/bordes) y `var(--spira-primary)` (rellenos sólidos, botones primarios, etapa "Evolucionado").
- Etapa "Descargado": color fijo `#3A6B8C` (no es un token — está hardcodeado como `DOWNLOAD_COLOR` en el JS; si se agrega un token de sistema para "info/en progreso", migrar ahí).
- Vencido / alerta: `#A6483B` (mismo rojo que la categoría "Seguridad").
- Radios: 8–9px en inputs y botones chicos, 12–14px en cards internas, 16–18px en modales.
- Tipografía: `var(--spira-font-text)` cuerpo, `spira-mono` para códigos (visita, paciente, iniciales), `spira-h2`/`spira-eyebrow` para títulos y micro-labels.
- Sombras: `var(--spira-shadow-sm)` en popovers/dropdowns, `var(--spira-shadow-lg)` en modales.

---

## 9 · Pendientes / preguntas para producto (sin resolver en este prototipo)

- ¿El link de la plataforma es el mismo para todo el protocolo, o varía por sitio/investigador dentro del mismo protocolo? El prototipo asume uno solo por protocolo.
- ¿"Actuando como" debería tomarse del usuario logueado real en vez de un selector manual? En el prototipo es manual para poder demostrar el historial con varias personas.
- Permisos: ¿quién puede mover un reporte a "Evolucionado" — cualquier coordinador, o requiere un rol específico (ej. solo quien evolucionó al paciente en la HC)?
- ¿El cierre automático de visita debe poder reabrirse manualmente si se detecta un error después de cerrada?
