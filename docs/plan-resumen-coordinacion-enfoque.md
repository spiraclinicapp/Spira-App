# Plan — Resumen de Coordinación: enfoque, hovers y links

Handoff de origen: **`docs/design_handoff_resumen_tareas_enfoque/`** (copiado al repo el 2026-09-01
desde `Downloads\Spira — Identidad Visual (6)\`, que es la copia de la que hay que desconfiar).
La autoridad es `source/Resumen - Tareas enfoque (variantes).html`.

Dos cosas del bundle original conviene saberlas antes de abrirlo:

- **Venía incompleto.** El README lista `source/Icons.jsx` y `source/SpiraVilanos.jsx`, y los tres
  HTML los cargan con `<script src="...">`, pero no estaban: el mock abría en blanco. Se completó
  con las copias de `docs/identidad-visual/`, verificando antes que tuvieran los diez íconos que el
  mock usa (`arrowRight`, `clipboardCheck`, `chevronRight`, `dashboard`, `activity`, `users`,
  `clock`, `search`, `bell`, `home`) y `Vilano1`.
- **Las tres capturas de hover son el mismo archivo** (`01/02/03-hover.png`, md5 idéntico) y ninguna
  muestra un estado revelado. No documentan tres hovers distintos: para el comportamiento, el HTML.

Revisión: `/plan-eng-review`, 2026-09-01. Once decisiones tomadas (D1–D11), ninguna abierta.

> **El handoff está escrito como greenfield y no lo es** — el tercer caso seguido. Dibuja un Resumen
> que la base todavía no puede alimentar: "Tareas personales" (sujeto de las cuatro variantes) no
> tiene tabla ni migración ni RLS; "Visitas asignadas a mí" necesita `coordinator_id` en
> `v_track_visits`; "1 alerta por vencer" no es un estado que exista; "12 pacientes vistos hoy" no
> tiene consulta; y "Ver todo → Reportes" apunta a un submódulo que no está en el registry.
> Lo que **sí** aporta, y es lo que este plan aplica, es la capa de interacción.

---

## Alcance acordado (D1 = opción B)

Se aplica **la capa de interacción completa + las cards cuyo dato existe de verdad**, sin migraciones.

- Hover de renglón, revelado de destino, tags de estado integrados en la oración, footer "Ver todo",
  KPIs navegables.
- Card nueva **"Dispensaciones solicitadas"** (el dato ya existe).
- Rediseño de la card de **Alertas**, extendido a las tres pantallas que la muestran.
- **Fuera:** Tareas personales, "Visitas asignadas a mí", el estado "por vencer", la card
  "Pacientes" y el submódulo Reportes de Coordinación (ver *NOT in scope*).

---

## Lo que YA EXISTE (y por lo tanto no se reimplementa)

Éste es el hallazgo central de la revisión: **el sistema de diseño ya implementa casi todo lo que el
handoff describe como nuevo.** El mock lo escribe con `React.useState` + `onMouseEnter`; en Spira
eso está prohibido y además ya está resuelto en CSS.

| Pieza del handoff | Dónde vive hoy | Qué falta |
|---|---|---|
| Hover de fila → fondo `surface`, .15s | `.spira-row-link` — `tokens.css:655` (0.14s) | Nada. Se usa tal cual. Sólo se le agrega `:focus-visible` |
| Revelado `opacity 0→1` | `.spira-link-arrow` — `tokens.css:747` | El `translateX(-4px)→0` |
| Hover de tarjeta → levante + sombra | `.spira-card-link` — `tokens.css:629` | Sólo la intensidad de la sombra (D6) |
| Fila que lleva a SU ítem, con teclado | `VisitSummaryRow` — `role/tabIndex/onKeyDown` | Nada |
| Link de texto + flecha de destino | `PatientLink` / `PatientLinkArrow` | Nada |
| Degradación cuando no hay destino | `PatientLink` sin `onOpen` → texto pelado | Nada. Se replica el criterio |
| Cola de dispensaciones pendientes | `useDispensationBoard` — usado en Inicio | Un hook liviano propio (D10) |
| Superficie de alerta teñida por severidad | `alertItemStyle` — compartida por 3 pantallas | Rediseño (D4) |

**Regla que gobierna todo lo anterior:** el realce va en CSS, nunca en `onMouseEnter`. Escribir
`borderColor`/`boxShadow` a mano desde un handler sobre un `border` abreviado deja el borde roto
(React vacía los longhand en el render siguiente). El mock hace exactamente eso en `Row`, `Stat` y
`VerTodo`: **no se porta ese código, se porta el diseño.**

---

## Las diez decisiones

| # | Decisión | Elegida |
|---|---|---|
| D1 | Alcance del handoff | **B** — interacción + cards con dato real, sin migraciones |
| D2 | "Próximas visitas · 7 días" | **B** — mosaico parejo `1fr 1fr`, la card se queda |
| D3 | Flecha permanente de renglón | **C** — no se agrega; el hover sigue siendo la señal |
| D4 | Card de Alertas | **C** — cabecera por severidad máxima, en las **tres** pantallas |
| D5 | Destino del renglón de dispensación | **A** — a la visita (`track/visitas` + `visitId`) |
| D6 | Sombra del hover de tarjeta | **B** — token nuevo, global en `.spira-card-link` |
| D7 | Patrón de revelado de destino | **A** — clase única + unificar `.spira-link-arrow` |
| D8 | Mapeo KPI → destino | **A** — los cuatro navegan, rótulo real del registry |
| D9 | Cobertura de tests | **A** — tres reglas puras + guarda contra el registry |
| D10 | Consulta de dispensaciones | **A** — hook de lectura propio y liviano |
| D11 | Footer "Ver todo" | **Sólo Alertas** — es la única card cuya lista completa existe como submódulo |

---

## Layout resultante

D2 eligió el mosaico parejo. Su enunciado mencionaba una card "Pacientes" que el alcance B deja
afuera (métrica inventada), así que con tres cards la realización honesta del mosaico parejo es:

```
┌──────────────────────────────────────────────────────────────────────┐
│  KPIs — grid 4 col, gap 14                                            │
│  ┌────────────┬────────────┬────────────┬────────────┐               │
│  │ Protocolos │ Pacientes  │ Pendientes │ Próximas   │  ← los 4 navegan
│  │ activos    │ activos    │ vencidos   │ visitas    │    (D8)
│  │ → Pacientes│ → Pacientes│ → Alertas  │ → Visitas  │
│  └────────────┴────────────┴────────────┴────────────┘               │
├──────────────────────────────────────────────────────────────────────┤
│  Mosaico — grid 1fr 1fr, gap 14, align-items: start                   │
│  ┌─────────────────────────┐  ┌─────────────────────────┐            │
│  │ Próximas visitas · 7d   │  │ Alertas                 │            │
│  │  (agrupadas por día)    │  │  cabecera teñida por    │            │
│  │  filas: VisitSummaryRow │  │  severidad MÁXIMA       │            │
│  │  ⚠ RE-MEDIR EL ANCHO    │  │  filas + "Ver todo"     │            │
│  │                         │  └─────────────────────────┘            │
│  │                         │  ┌─────────────────────────┐            │
│  │                         │  │ Dispensaciones          │            │
│  │                         │  │  solicitadas            │            │
│  │                         │  │  fila → SU visita (D5)  │            │
│  └─────────────────────────┘  └─────────────────────────┘            │
└──────────────────────────────────────────────────────────────────────┘
```

**El riesgo n.º 1 de este plan está en ese `⚠`.** Pasar de `1.5fr 1fr` a `1fr 1fr` angosta la columna
de visitas ~85px, y el comentario de cabecera de `VisitSummaryRow` avisa que el vocabulario de la
línea 2 mide **340px con las fuentes reales** y que el presupuesto ya estaba al límite a ~505px. Hay
que **medirlo, no estimarlo**, en la notebook de referencia (1536×864 → 1185px de contenido) y en el
**peor caso** (nombre largo + IVRS + código de visita + nombre de visita), antes de dar la fila por
buena. Si no entra, la salida no es achicar la letra: es sacar un dato de la línea 2.

---

## Flujo de datos

```
                      TrackResumenView
                            │
     ┌──────────┬───────────┼─────────────┬──────────────────┐
     ▼          ▼           ▼             ▼                  ▼
useProtocols usePatients useUpcoming  useActiveAlerts  useSolicitudes
                          Visits                        Pendientes ← NUEVO (D10)
     │          │           │             │                  │
     │          │           │             │                  │
     ▼          ▼           ▼             ▼                  ▼
  ┌────────────────────┐  ┌──────────┐ ┌──────────────┐ ┌──────────────┐
  │ KPIs (4)           │  │ Card     │ │ Card Alertas │ │ Card Dispens.│
  │ cargando → "—"     │  │ Visitas  │ │ severidad-   │ │              │
  │ (nunca 0 al cargar)│  │          │ │ Maxima()     │ │              │
  └─────────┬──────────┘  └────┬─────┘ └──────┬───────┘ └──────┬───────┘
            │                  │              │                │
            ▼                  ▼              ▼                ▼
    onNavigate(módulo,   onNavigate(track,  onNavigate(track, onNavigate(track,
      destinos[k])        visitas,{visitId})  alertas,{...})    visitas,{visitId})
                                                                     ▲
                                          D5: NO a pharma/dispensaciones —
                                          isAllowed lo descartaría en silencio
                                          para quien no tenga Farmacia.

Sin gate global: cada bloque carga y falla por su cuenta (se conserva el criterio
actual — media pantalla es muchísimo mejor que una vacía).
```

## Máquina de estados del realce (lo que el handoff llama "clickover")

```
                    ┌──────────────────────────────────────────┐
                    │  REPOSO                                   │
                    │  tarjeta: sin sombra   fila: fondo transp.│
                    │  chip de destino: opacity 0, translateX-4 │
                    └───────────┬──────────────────┬────────────┘
                    :hover      │                  │  :focus-visible
                                ▼                  ▼
        ┌───────────────────────────────┐  ┌──────────────────────────┐
        │  REALZADO (tarjeta)           │  │  REALZADO (teclado)      │
        │  translateY(-1px)             │  │  MISMO estado visual     │
        │  box-shadow: shadow-hover ★   │  │  ★ D7: el revelado       │
        │  chip: opacity 1, translateX0 │  │    también dispara acá   │
        └───────────┬───────────────────┘  └──────────────────────────┘
                    │ :active
                    ▼
        ┌───────────────────────────────┐
        │  PULSADO — translateY(0)      │   ← micro-interacción global
        └───────────────────────────────┘

  prefers-reduced-motion: reduce
     → el ESTADO se mantiene (sombra, fondo, opacidad: son señal, no adorno)
     → el RECORRIDO desaparece (transition: none; el levante ya vive
       en el bloque no-preference y no corre)

  La fila NO se levanta nunca: carga el separador de arriba y moverla
  partiría la línea de 1px. Se resalta y se queda quieta (`.spira-no-press`).
```

---

## Tareas de implementación

### T1 — `tokens.css`: sombra de hover (D6)
- Agregar `--spira-shadow-hover: 0 4px 14px rgba(20, 48, 46, 0.12)` junto a las otras sombras
  (`tokens.css:178`), **con su variante para tema oscuro** — sobre el fondo oscuro una sombra a 12%
  de tinta petróleo casi no se ve; subir alpha o usar negro.
- `.spira-card-link:hover` (`tokens.css:639`) pasa de `--spira-shadow-sm` a `--spira-shadow-hover`.
- **No tocar `--spira-shadow-sm`**: aparece en ~20 lugares y en la mayoría es la sombra *en reposo*
  de una tarjeta, no la de hover.
- Reescribir el comentario de `tokens.css:625-631`: hoy fundamenta la sombra chica y va a quedar
  contradiciendo al código. El fundamento nuevo es que lo que se descartó fue la `md` (`0 12px 32px`,
  sombra de overlay) y no ésta, que es tres veces menor. **Diagramas y comentarios stale son peores
  que ninguno.**

### T2 — `tokens.css`: revelado unificado y foco de fila (D7 + a11y)
- Clase nueva de revelado de destino: `opacity 0→1` + `translateX(-4px)→0`, 0.15s, disparada por
  `:hover` **y** `:focus-visible` del contenedor. Nunca cambia `display` ni el flujo.
- `.spira-link-arrow` suma el mismo `translateX`. Es `transform`: no mueve el layout ni pelea con el
  truncado. **Verificar visualmente en al menos Visitas del día, la cola del médico y Alertas** — la
  clase vive en ~15 pantallas.
- `.spira-row-link` gana `:focus-visible` con el mismo resaltado que `:hover`. Hoy la fila se marca
  con el mouse y **no** con el teclado.
- Todo lo nuevo entra al bloque `prefers-reduced-motion: reduce` existente.

### T3 — `src/views/resumen/destinos.ts` + test (D8, D9)
- Mapa puro KPI → `{ moduleKey, subKey }`. El **rótulo del chip se lee de `MODULES`**, nunca se
  escribe a mano: si mañana se renombra un submódulo, el chip lo sigue solo.
- `destinos.test.ts`: cada destino existe en `MODULES` **y** `isViewRegistered(...)` es `true`.
  Sin esa guarda, un `subKey` mal escrito cae al `Placeholder` (`registry.tsx:36`) sin un solo error.

### T4 — `src/views/alertSeverity.ts` + test (D4, D9)
- `severidadMaxima(alertas): 'ventana_vencida' | 'item_vencido' | null`. `ventana_vencida` gana
  siempre; `null` con lista vacía.
- Test con los cuatro casos: vacía, sólo ámbar, sólo roja, mezcla. **Es la regla más peligrosa del
  plan**: invertida, la card muestra ámbar habiendo una ventana vencida y se ve perfecta.

### T5 — Card de Alertas, en las TRES pantallas (D4)
- Componente compartido nuevo con la cabecera: ícono + título + contador, teñida por
  `severidadMaxima()` — **nunca fija en rojo**. Sin alertas: tono neutro y el mensaje actual
  ("Sin alertas. Todo al día").
- Filas planas con punto de color, sustituyendo la superficie teñida. `alertItemStyle` se reescribe
  o se retira; su comentario de cabecera (`alertItem.ts:6-11`) **queda obsoleto y hay que reescribirlo**:
  hoy explica por qué la señal es la superficie, y la señal pasa a ser el punto + la cabecera.
- Consumidores a actualizar: `InicioResumenView`, `TrackResumenView`, `TrackAlertsView`.
- **Riesgo declarado:** `TrackAlertsView` superpone el botón de descartar arriba a la derecha
  (`conBotonDescartar` reserva `paddingRight: 42`) y tiene además la lista de descartadas. Sobre una
  fila plana ese botón necesita otra ubicación. Es la parte más cara de la tarea y la que más QA pide.
- La leyenda del pie ("Ventana vencida (roja) · Ítem vencido (ámbar)") pasa a referirse al punto.

### T6 — `useSolicitudesPendientes()` + tono por estado (D10, D9)
- Hook de lectura liviano en la capa de datos: `dispensation_requests` filtrado por
  `['solicitada','preparando']`, con `id, status, created_at, visit_id` y los embeds mínimos de
  medicación y paciente. **Desambiguar la FK explícitamente** (`medications!medication_id`): una FK
  nueva sobre una tabla embebida vuelve ambiguo el embed y PostgREST voltea la consulta entera
  (`PGRST201`) — ya tiró prod el 2026-08-13.
- Mapa puro `estado → tono` con su test de completitud (toda clave de `RequestStatus` tiene tono).
  Los cuatro estados reales son **Solicitadas → Preparando → Listas → Entregadas**.
- **La RLS scopea en silencio:** un usuario de Coordinación ve sólo las solicitudes de los protocolos
  que coordina (`0006_rls_policies.sql:252`), mientras Farmacia y gerencia ven todo. El copy del
  contador tiene que ser honesto con eso. **La cuenta de QA tiene los cinco módulos y no reproduce
  la diferencia** — hay que probarlo con una cuenta sólo de Coordinación.

### T7 — `TrackResumenView.tsx` (D2, D3, D5, D8)
- `KpiCard` pasa de `<div>` inerte a navegable: `role="button"` + `tabIndex={0}` + `onKeyDown`
  (Enter/Espacio, con la guarda `e.target !== e.currentTarget`) + `aria-label` + `.spira-card-link`
  + el revelado de T2. **Mudar un gesto a un `<div onClick>` sin esto deja el destino sin camino de
  teclado, y no se ve mirando.**
- Grilla del mosaico a `1fr 1fr` (D2).
- Card "Dispensaciones solicitadas": filas con hover, tag de estado integrado en la línea secundaria
  (` · ` como separador, sin pill de fondo), destino = la visita (D5).
- Footer "Ver todo" **únicamente en Alertas** → `track/alertas` (D11). Fila con
  `justify-content: space-between`, ancho completo (`margin: 0 -20px; padding: 11px 20px`),
  `border-top`; a la izquierda el texto fijo "Ver todo" en `primary`, a la derecha el rótulo del
  submódulo revelado con la clase de T2.
  **Va en un `<button>`, no en un `<span>`**: el mock pone el listener en el `<span>` y no le da
  ningún `onClick` — o sea que ahí es decorativo, y un pie que parece un link y no navega es
  justamente lo que no se hace en esta app. Como es un botón, hereda la micro-interacción global y
  se levanta 1px: lleva `.spira-no-press` (mismo criterio que `PatientLink`), porque el realce de
  este pie es el revelado del rótulo, no un salto.
  **Ni Visitas ni Dispensaciones lo llevan,** y por razones distintas: el submódulo Visitas muestra
  **el día**, no los próximos siete, así que un "Ver todo" ahí prometería una lista que esa pantalla
  no da; y la card de Dispensaciones no tiene submódulo propio alcanzable para quien coordina — su
  destino por fila ya es la visita (D5). Un único footer en todo el mosaico es el resultado correcto:
  el pie aparece donde hay una lista completa a la que ir, no como adorno de cierre de tarjeta.
- Tags de estado: se retira el pill sólido con fondo y se pasa al patrón integrado en la oración.
  **Ojo con el contraste**: el handoff usa `warnDeep #8A631F` y `danger #A6483B` a 12px/700 sobre
  papel — 12px es texto NORMAL para WCAG (4,5:1), no grande. Medir los dos temas antes de mergear.
- **Sin flecha fija de renglón** (D3): la señal de fila sigue siendo el fondo al apuntar.

### T8 — Re-medición del presupuesto de ancho
Obligatoria, antes de dar T7 por terminado. Notebook de referencia 1536×864 (1185px de contenido),
peor caso con datos reales. Medir el **alto de la fila**, no `offsetTop` de los hijos: con
`align-items: center` y alturas distintas cada elemento tiene su propio top y contar renglones así
ya dio un falso positivo.

### T9 — Verificación
`npm run build` verde (typecheck + vitest + build) **y** verificación en el preview (puerto 5250).
`preview_screenshot` se cuelga: la evidencia va por snapshot/DOM/estilos computados. Al medir un
`:hover`, apagar antes la transición del elemento — con el documento oculto `getComputedStyle`
devuelve el valor inicial aunque la regla aplique, y se diagnostica un bug que no existe.

---

## Modos de falla

| Codepath nuevo | Falla realista en producción | ¿Test? | ¿Manejo de error? | ¿Silenciosa? |
|---|---|---|---|---|
| Mapeo KPI → destino | `subKey` mal escrito o renombrado → `Placeholder` vacío | **Sí** (T3) | No hace falta: rompe el build | Sería silenciosa sin el test |
| `severidadMaxima()` | Comparación invertida → ámbar habiendo ventana vencida | **Sí** (T4) | No aplica | **Sí — y clínica** |
| Tono por estado de dispensación | Estado nuevo en el enum sin tono → tag sin color | **Sí** (T6) | No aplica | Semi |
| `useSolicitudesPendientes` | RLS filtra a cero para un rol sin `coordina_visita` | No (es RLS) | La card muestra su vacío | **Sí** — mitigado por copy honesto + QA con cuenta acotada |
| Destino de la fila de dispensación | Visita borrada o inaccesible → navegación descartada | No | **Falta**: degradar a fila inerte si no hay `visit_id` | Sí si no se degrada |
| Revelado en `.spira-link-arrow` | El `translateX` corre algo en una de las ~15 pantallas | No | No aplica | No — se ve mirando |
| Card de Alertas en `TrackAlertsView` | El botón de descartar queda encima del texto de la fila plana | No | No aplica | No — se ve mirando |

**Brecha crítica:** ninguna. La única que empezaba a serlo (fila de dispensación sin destino
navegable) queda cerrada por D5 + la degradación explícita, que es tarea de T7.

---

## Plan de pruebas

### Pantallas / rutas afectadas
- `track/resumen` — el objeto del cambio.
- `inicio/resumen` — por la card de Alertas (D4) y por `.spira-card-link` (D6).
- `track/alertas` — por la card de Alertas (D4).
- **Toda la app** — `.spira-card-link` (sombra) y `.spira-link-arrow` (deslizamiento) son globales.

### Interacciones a verificar
1. Hover sobre cada KPI → levante + sombra nueva + chip de destino deslizando desde la izquierda.
2. **Tab** por los cuatro KPIs → mismo realce y mismo chip que con el mouse; Enter navega.
3. Hover sobre una fila de visita → fondo `surface`, sin levante, sin partir el separador.
4. Hover sobre el nombre del paciente → subrayado en nombre **e** IVRS + flecha con deslizamiento.
5. Click en el nombre → ficha del paciente; click en el resto de la fila → la visita. Dos destinos,
   sin que uno dispare al otro (guarda `e.target !== e.currentTarget`).
6. Cabecera de Alertas: con una sola alerta ámbar debe verse **ámbar**, no roja.
7. Fila de dispensación → abre SU visita, con el panel de dispensación visible.
8. "Ver todo" en Alertas → revela el rótulo al apuntar y navega al submódulo.

### Casos borde
- Las tres listas **vacías** a la vez (centro sin actividad): ninguna card debe colapsar ni mentir.
- Las tres **cargando**: los KPIs muestran `—`, nunca `0`.
- Una consulta **falla** y las otras no: se conserva el criterio de bloques independientes.
- Nombre de paciente muy largo + IVRS + código de visita: el ellipsis tiene que funcionar (cuidado
  con meter texto en un `<button>` dentro de un contenedor con `text-overflow`: corta **en seco**).
- Alerta sin `patient_code` (`—`) y sin `abrirFicha`: no debe quedar una flecha reservando ancho.
- Usuario **sin** el módulo Farmacia: la card de dispensaciones sigue siendo navegable (por D5).
- `prefers-reduced-motion: reduce`: los estados se mantienen, los recorridos desaparecen.
- Tema **oscuro**: sombra nueva visible, y los tonos de los tags por encima de 4,5:1.

### Caminos críticos
`Coordinación › Resumen` es la primera pantalla de la jornada de quien coordina. Una alerta que se
muestre con severidad menor a la real es el peor resultado posible de este PR — de ahí T4 y su test.

---

## NO está en alcance (considerado y diferido)

| Diferido | Por qué |
|---|---|
| **Tareas personales** (variantes A/B/C/D) | No existe nada: ni tabla, ni RLS, ni audit, ni CRUD. Es una feature con su propio plan, y ya tiene casa reservada (`inicio/tareas`, hoy `Placeholder`) |
| KPI "Visitas asignadas a mí" | `v_track_visits` no expone `coordinator_id`; hace falta migración |
| Alerta "por vencer" | El estado no existe. Lo más cercano es `windows_due_7d`, que es KPI por protocolo |
| Card "Reportes pendientes" + submódulo Reportes de Coordinación | El tablero es por protocolo y no hay `track/reportes` en el registry: el "Ver todo" no tendría a dónde ir |
| Card "Pacientes · 12 vistos hoy" | Métrica inventada, sin consulta que la sostenga |
| Variante C del layout (riel fijo de 300px) | Vive fuera de las columnas del mosaico: es un cambio del shell, no de la vista |
| Tests de render (jsdom + Testing Library) | Contradice el criterio de la casa; si se adoptan, merecen su propio PR |

---

## Paralelización

| Paso | Módulos que toca | Depende de |
|---|---|---|
| T1 sombra | `src/styles/` | — |
| T2 revelado + foco | `src/styles/` | T1 (mismo archivo) |
| T3 destinos + test | `src/views/resumen/` (nuevo) | — |
| T4 severidad + test | `src/views/` (archivo nuevo) | — |
| T5 card de Alertas ×3 | `src/views/` (3 vistas + `alertItem`) | T4 |
| T6 hook + tono | `src/data/pharma/` | — |
| T7 TrackResumenView | `src/views/` | T1, T2, T3, T6 |
| T8 re-medición | — (verificación) | T7 |

```
Lane A: T1 → T2            (secuencial, comparten tokens.css)
Lane B: T3                 (independiente, archivos nuevos)
Lane C: T4 → T5            (secuencial, T5 consume severidadMaxima)
Lane D: T6                 (independiente, data/pharma)
        ─────────────────────────────────────────────
        A + B + C + D en paralelo → merge → T7 → T8 → T9
```

⚠ **Conflicto declarado:** las lanes **C** (T5) y la tarea **T7** tocan las dos
`TrackResumenView.tsx`. Si se paralelizan hay merge conflict garantizado — T7 va **después** del
merge de C, no en paralelo.

---

## GSTACK REVIEW REPORT

| Runs | Status | Findings |
|---|---|---|
| Step 0 — Scope challenge | ✅ completo | Complexity check DISPARÓ (≈20 archivos, 2-3 migraciones, feature nueva). Alcance reducido a B por decisión del Director |
| 1 — Arquitectura | ✅ completo | 5 hallazgos, 5 resueltos (D2, D3, D4, D5, D6) |
| 2 — Calidad de código | ✅ completo | 2 hallazgos, 2 resueltos (D7, D8) |
| 3 — Tests | ✅ completo | 1 hallazgo, resuelto (D9). 3 reglas puras nuevas con cobertura |
| 4 — Performance | ✅ completo | 1 hallazgo, resuelto (D10) |
| Outside voice (codex) | ⏭️ omitido | `codex` no está instalado en esta máquina |
| TODOS.md | ✅ actualizado | 2 entradas nuevas |
| Handoff al repo | ✅ hecho | Copiado a `docs/`, y completado con `Icons.jsx` + `SpiraVilanos.jsx`, que faltaban |

**Hallazgos por severidad:** 1×P0 (card de visitas borrada del mosaico), 4×P1, 4×P2. Ninguno abierto.

**Confianza:** los nueve hallazgos se emitieron con la línea de código que los motiva citada
(`file:line`), según el pre-emit gate. Ninguno quedó por debajo de 8/10.

**VERDICT: APROBADO CON CONDICIONES.** El plan es implementable tal como está. Tres condiciones
bloqueantes antes de dar por buena la implementación: (1) la re-medición del ancho de
`VisitSummaryRow` en la notebook de referencia (T8) — si no entra, se saca un dato de la línea 2, no
se achica la letra; (2) el rediseño de la card de Alertas tiene que resolver la reubicación del botón
de descartar en `TrackAlertsView` antes de mergear; (3) el copy y el alcance de la card de
dispensaciones tienen que verificarse con una cuenta **sólo de Coordinación**, porque la de QA tiene
los cinco módulos y tapa el scoping de la RLS.

NO UNRESOLVED DECISIONS
