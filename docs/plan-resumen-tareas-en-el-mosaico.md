# Plan — Resumen de Coordinación: la tarjeta de Tareas y el acceso que faltaba

Handoff de origen: **`docs/design_handoff_resumen_tareas_enfoque/`**. El Director apuntó a la copia
de `Downloads\Spira — Identidad Visual (6)\`; se compararon las dos y **son idénticas** (sólo cambia
CRLF). La del repo además tiene `Icons.jsx` y `SpiraVilanos.jsx`, que al bundle original le
faltaban: **se trabaja con la del repo**.

**Mock:** [`docs/mock-resumen-tareas-en-el-mosaico.html`](mock-resumen-tareas-en-el-mosaico.html) —
las dos pantallas con los tokens vivos, y el alternador "Lo mío / Todo" funcionando. Ábrilo antes de
implementar: **midiéndolo se dio vuelta una decisión de esta review** (ver la corrección 12).

Revisión: `/plan-eng-review`, 2026-09-06. Diecisiete decisiones (D1–D3 de alcance, 1–14 de review),
ninguna abierta. **Dos se dieron vuelta al ver el mock**: la 3 (por medición) y la D3 (por el
Director). Las dos quedan escritas con su motivo, para que no se relean como indecisión. Segunda pasada sobre el mismo handoff: la primera fue
[`plan-resumen-coordinacion-enfoque.md`](plan-resumen-coordinacion-enfoque.md) (2026-09-01), que
aplicó la capa de interacción y dejó Tareas afuera porque **no existía**. Ahora existe (0108/0109).

> **EL HANDOFF ES MÁS VIEJO QUE LA PANTALLA, y eso cambia el pedido.** Se dibujó el 2026-09-01.
> Después entraron a producción el alternador **"Lo mío / Todo"** (2026-09-05), el rename
> **Alertas → Pendientes**, la tarjeta **Próximas visitas de un día** y la clase de alerta
> `por_reprogramar`. El mock no tiene ninguna de esas cosas, y su variante A tampoco tiene
> Dispensaciones. **Copiarlo literal sería una regresión, no un rediseño.** Este plan aplica lo que
> el handoff todavía AGREGA y conserva lo que la pantalla aprendió después.

---

## Alcance acordado

| | Decisión | Elegida |
|---|---|---|
| **D1** | Hasta dónde llevar el Resumen hacia el handoff | **B** — la tarjeta de Tareas + el dato "asignadas a mí". Sin migraciones |
| **D2** | Dónde vive la tarjeta de Tareas | **A** — arriba a la derecha (espíritu de la variante A del handoff) |
| **D3** | El acceso a Tareas (P1 del shell) | **B** — Tareas pasa a ser **submódulo de Coordinación**. Inicio NO se toca |

> **D3 se dio vuelta al ver el mock (Director, 2026-09-06):** *"Esto no va en el Inicio. El Inicio
> sigue como está ahora, eso pasaría a ir en Coordinación por ahora."* Se había elegido A (dibujar
> el panel de submódulos en Inicio) sobre un tablero dibujado; verlo bastó para descartarlo.
> **Y el cambio simplifica el PR**, no lo agranda: se cae la modificación del shell, se cae la
> medición de los 220 px que era el riesgo nº 1, y el "Ver todas" de la tarjeta deja de cruzar de
> módulo. El "por ahora" está asumido: el día que Farmacia o gerencia necesiten tareas, hay que
> volver sobre esto (ver *NO está en alcance*).

**Fuera:** la tarjeta "Pacientes", el KPI "Alertas activas", la variante C (riel fijo) y la
fidelidad literal al mock. Ver *NO está en alcance*.

---

## Lo que YA EXISTE (y por lo tanto no se reimplementa)

El 90% del handoff entró el 2026-09-01. Este PR agrega una tarjeta a un molde ya resuelto.

| Pieza del handoff | Dónde vive hoy | Qué falta |
|---|---|---|
| KPI navegable con chip de destino | `KpiCard` — `TrackResumenView.tsx:96` | Sólo el subtítulo nuevo |
| Renglón a ancho completo + hover | `filaAncha` — `TrackResumenView.tsx:46` | Nada |
| Revelado de destino con teclado | `.spira-dest` / `ChipDestino` — línea 70 | Nada |
| Pie "Ver todo" que navega | `VerMas` — línea 162 | Nada |
| Pie "Ver más" que despliega | `VerMasLocal` — línea 209 | Nada |
| Tag de estado integrado en la oración | `SolicitudRow` — línea 470 | Nada |
| Vacío honesto del ámbito | `VacioDelAmbito` — línea 258 | Nada |
| Reglas puras de una tarea | `views/tareas/estados.ts` | `etiquetaDeVencimiento` (T3) |
| Datos de tareas + modal de alta | `data/tareas.ts`, `views/tareas/TareaModal.tsx` | Nada. Se reusan tal cual |
| Reglas de ámbito por tarjeta | `views/resumen/ambito.ts` | La quinta: `esTareaMia` (T2) |
| Coordinador de la visita | `v_track_visits` (`0102:168`), `TrackVisitRow` (`visits.ts:51`) | Nada. **No hace falta migración** |

**Dos entradas de `TODOS.md` están equivocadas y este PR las corrige** (T8):

1. *"KPI Visitas asignadas a mí (falta el coordinador en v_track_visits)"* — el coordinador **sí**
   está proyectado desde la 0065 y declarado en `visits.ts:51`, cuyo comentario dice literalmente
   que "esa ausencia hizo creer que la vista no los tenía". No hace falta ninguna migración.
2. *"`/inicio/alertas` funciona escrita a mano"* — **no funciona**: `inicio/alertas` no está en
   `REGISTERED_VIEWS` (`registryKeys.ts:14`), así que `resolveView` cae al `Placeholder`.

---

## Las once decisiones de la review

| # | Hallazgo | Elegida |
|---|---|---|
| 1 | El KPI "Visitas asignadas a mí" contaría un campo casi siempre nulo en visitas futuras | **B** — el KPI se queda "Próximas visitas"; el dato va al subtítulo, sólo si > 0 |
| 2 | La tarjeta de Tareas y el alternador "Lo mío / Todo" | **C** — el alternador filtra por asignación |
| 3 | Columnas desparejas y eje del mosaico contradicho | **A**, luego **corregida por la 12** |
| 4 | Dibujar el panel de Inicio destapa `inicio/alertas` | **A** — sacar "Pendientes" de los submódulos de Inicio |
| 5 | La tríada cargando/error/vacío está copiada 4 veces | **A** — extraer `CuerpoDeTarjeta` y migrar las cinco |
| 6 | `TrackResumenView.tsx` pasa de 1200 líneas | **A** — sólo `TareasCard` sale a archivo propio |
| 7 | Dónde vive la regla de ámbito de las tareas | **A** — `views/resumen/ambito.ts`, con test |
| 8 | Qué hace una fila de la tarjeta | **B** — tilde para marcar hecha + el texto lleva a Tareas |
| 9 | ¿Va "+ Nueva tarea" en la tarjeta? | **A** — sí, en el pie, como el handoff |
| 10 | El verbo "venció / vence" está inline y sin test | **A** — extraer `etiquetaDeVencimiento` con test |
| 11 | `useMyTasks` trae el histórico completo | **A** — reusar y filtrar en el cliente con `estaHecha` |
| 12 | **Corrección de la 3**, medida al dibujar el mock | **A (3B)** — Próximas visitas se queda a la derecha; ninguna tarjeta se muda |
| 13 | Qué pasa con `inicio/tareas` al mudar la pantalla | **A** — se retiran `tareas` y `alertas` del módulo Inicio: una pantalla, una dirección |
| 14 | Dónde va Tareas en el menú de Coordinación | **A** — último, después de Pendientes. Ningún renglón existente se mueve |

---

## Layout resultante

```
┌─ KPIs — grid auto-fit minmax(190px,1fr), gap 14 ─────────────────────────────┐
│ Protocolos     │ Pacientes     │ Reportes       │ Próximas visitas           │
│ activos        │ activos       │ vencidos       │ sub: "N asignadas a mí"    │
│ → Pacientes    │ → Pacientes   │ → Pendientes   │      (sólo si N > 0)       │
│                │               │                │ → Visitas                  │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ Mosaico — grid 1fr 1fr, gap 14, align-items: start ─────────────────────────┐
│  LOS DESVÍOS DEL ESTUDIO           │  LO TUYO Y LO QUE VIENE                 │
│  ┌──────────────────────────────┐  │  ┌───────────────────────────────────┐  │
│  │ Reportes pendientes    271px │  │  │ Tareas personales  ← NUEVA  280px │  │
│  │  lo que hay que cerrar       │  │  │  lo que anotaste vos              │  │
│  └──────────────────────────────┘  │  └───────────────────────────────────┘  │
│  ┌──────────────────────────────┐  │  ┌───────────────────────────────────┐  │
│  │ Pendientes             289px │  │  │ Dispensaciones solicit.     171px │  │
│  │  lo que se pasó              │  │  │  lo que le pediste a Farmacia     │  │
│  └──────────────────────────────┘  │  └───────────────────────────────────┘  │
│                                    │  ┌───────────────────────────────────┐  │
│                                    │  │ Próximas visitas            214px │  │
│                                    │  │  quién viene, un día              │  │
│                                    │  └───────────────────────────────────┘  │
│            603 px                  │              721 px                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Ninguna tarjeta existente cambia de columna: sólo se inserta Tareas arriba a la derecha.**

**Pero hay que reescribir el comentario de `TrackResumenView.tsx:700`.** Hoy declara
"izquierda = TRABAJO PROPIO; derecha = lo que no depende de vos", y una tarea personal es trabajo
propio: con Tareas a la derecha ese diagrama pasaría a mentir. El eje nuevo, que sí se sostiene:
**izquierda = los desvíos del estudio** (reportes que cerrar, pendientes que resolver) ·
**derecha = lo tuyo y lo que viene** (tus tareas, lo que le pediste a Farmacia, quién llega mañana).

> **CORRECCIÓN (decisión 12).** La review había recomendado **mudar "Próximas visitas" a la
> izquierda** para emparejar las columnas, estimando que las cinco tarjetas miden parecido.
> El mock (`docs/mock-resumen-tareas-en-el-mosaico.html`) las midió y la recomendación se dio
> vuelta:
>
> | | Mudándola (3A) | Dejándola (3B) |
> |---|---|---|
> | Columna izquierda | 831 px | **603 px** |
> | Columna derecha | 494 px | **721 px** |
> | **Desbalance** | 337 px | **118 px** |
> | Alto total del contenido | 1050 px | **939 px** |
>
> Dispensaciones mide **171 px** —dos filas y ningún pie—, no ~230 como se estimó. Mudarla dejaba
> "Próximas visitas" **entera debajo de la línea de flotación** en 1536×864. Se dejó donde estaba.
> Es la regla de la casa aplicada a la propia review: **medí, no estimes.**

---

## Flujo de datos

```
                            TrackResumenView
                                   │
   ┌───────────┬───────────┬───────┼────────┬─────────────┬──────────────┐
   ▼           ▼           ▼       ▼        ▼             ▼              ▼
useProtocols usePatients useUpcoming useActive useSolicitudes useReportes  useMyTasks
                          Visits    Alerts    Pendientes    Pendientes    ← REUSADO
   │           │           │         │            │             │           │
   └───────────┴───────────┴─────────┴────────────┴─────────────┴───────────┘
                                   │
                    filtrarPorAmbito(ambitoEfectivo, filas, esMia)
                                   │
   ┌──────────┬──────────┬─────────┼──────────┬───────────────┐
   ▼          ▼          ▼         ▼          ▼               ▼
esDeMis    esMiaSin   loPediYo  loAtendiYo  esTareaMia    loAtendiYo
Protocolos  Atender                         ← NUEVA (T2)   (para el sub del KPI)
   │          │          │         │          │
   ▼          ▼          ▼         ▼          ▼
Próximas  Pendientes Dispensac. Reportes   Tareas
visitas
                                   │
                                   ▼
        CuerpoDeTarjeta(loading, error, que, vacío) ← NUEVO (T1), lo usan las CINCO
```

**Sin gate global**, como hasta ahora: cada bloque carga y falla por su cuenta. `useMyTasks` que
falla deja las otras cuatro tarjetas intactas.

---

## Máquina de estados de la fila de una tarea

```
                     ┌───────────────────────────────────────────────┐
                     │  REPOSO                                       │
                     │  fila: fondo transparente                     │
                     │  tilde: contorno line-2, fondo blanco         │
                     └────────┬───────────────────────┬──────────────┘
          :hover / :focus-visible                     │ click en el TILDE
          sobre la FILA        │                      │ (e.stopPropagation)
                               ▼                      ▼
       ┌────────────────────────────────┐   ┌────────────────────────────────┐
       │  REALZADA                      │   │  OCUPADA (por id, no global)   │
       │  fondo `surface`, sin levante  │   │  tilde deshabilitado, 50%      │
       │  (.spira-row-link .no-press)   │   │  las otras filas siguen vivas  │
       └────────┬───────────────────────┘   └───────┬────────────────────────┘
                │ click en el TEXTO                 │ set_task_done resuelve
                ▼                                   ├── ok  → refetch
       onNavigate('inicio','tareas')                └── err → aviso en la tarjeta
       + pasaje de vuelta al Resumen                        (la fila no miente)

  EL SERVIDOR DECIDE QUÉ CIERRA: en `cualquiera` set_task_done cierra la tarea; en
  `cada_uno` cierra sólo TU parte. La tarjeta no decide nada — sólo dibuja lo que
  `estaHecha` / `cerreYoMiParte` le dicen.

  El tilde va en un <button> ANIDADO, así que la fila es <div role="button"> y no
  <button>: botón dentro de botón es HTML inválido, y además el título necesita
  `text-overflow: ellipsis`, que adentro de un <button> corta EN SECO.
```

---

## Tareas de implementación

### T0 — 🔴 BUG DE PRODUCCIÓN: las filas del Resumen están corridas 20 px a la izquierda
**Lo encontró el Director mirando el mock, y está en la app desde el 2026-09-01.**

`filaAncha` (`TrackResumenView.tsx:47`) declara `width: '100%'` junto con `margin: '0 -20px'`.
**Con un ancho explícito, el margen negativo DERECHO queda inerte:** el izquierdo corre la caja
20 px, pero el derecho no puede ensancharla porque el ancho ya está fijado. Medido en el mock, que
copiaba el mismo CSS:

| | aire izquierdo | aire derecho |
|---|---|---|
| Banda teñida de Pendientes (sin `width`) | 1 px | 1 px |
| **Fila** | **1 px** | **41 px** |
| **Pie "Ver más"** | **1 px** | **41 px** |

Afecta a los **cinco** usos de `filaAncha`: los dos pies (`:179`, `:222`), las filas de Reportes
(`:370`), las de Dispensaciones (`:449`) y las de Pendientes (`:855`). El síntoma es el que se ve:
todo el contenido de la tarjeta se lee corrido a la izquierda, y encima **no coincide con la banda
teñida de la cabecera**, que no declara ancho y por eso sí sangra pareja — de ahí que el defecto
salte justamente en la tarjeta de Pendientes, la única que tiene las dos cosas.

- **Arreglo:** `width: 'calc(100% + 40px)'` en `filaAncha`, **con el comentario que explique por
  qué**. Sin ese comentario, el próximo que lo lea lo "simplifica" de vuelta a `100%` y el defecto
  reaparece: las tres declaraciones, por separado, se ven correctas.
- `VisitSummaryRow` **no** está afectada: usa `padding: '11px 0'` sin márgenes negativos
  (`VisitSummaryRow.tsx:138`), así que su contenido ya cae a 20/20. No se toca.
- **Se puede shipear solo y primero.** Es una línea, arregla producción y no depende de nada de
  este plan. Si va aparte, T1 se apoya en él.
- **Sin test:** es geometría, se verifica midiendo en el navegador (`getBoundingClientRect` de la
  fila contra la tarjeta, los dos lados). Es exactamente lo que el criterio de la casa manda mirar
  en vez de testear — pero *midiendo*, porque leyendo el código las tres declaraciones parecen bien.

### T1 — `CuerpoDeTarjeta`: la tríada de estados, una sola vez (decisión 5A)
- Componente nuevo en `src/views/resumenEstados.tsx` (donde ya viven `FilasFantasma` y
  `ErrorBloque`): recibe `loading`, `error`, `que`, `onReintentar`, `vacio`, `vacioDelAmbito` y
  `children`, y resuelve la escalera que hoy está copiada en `TrackResumenView.tsx:343, 822, 960` y
  `1024`.
- Migrar las **cuatro** tarjetas existentes + la nueva. Es un cambio mecánico: verificable leyendo
  el diff.
- **Sin test de render** (criterio de la casa): la regresión de esto se verifica mirando, en el
  preview, las cuatro tarjetas en sus tres estados.

### T2 — `esTareaMia` en `views/resumen/ambito.ts` + test (decisiones 2C, 7A)
- `esTareaMia(asignados, userId)` — `true` si soy asignado. **Con la guarda del `userId` nulo**, por
  el mismo motivo que `loAtendiYo` (`ambito.ts:78`): sin ella, un `null === null` durante el render
  en que la sesión no resolvió declara mías tareas ajenas.
- Significado: **"Lo mío" = las que tengo que hacer yo. "Todo" = eso más las que creé y delegué**,
  que es exactamente lo que la RLS de la 0108 devuelve. Rima con la columna donde vive la tarjeta:
  a la derecha está lo que depende de otro.
- Una tarea que creé y me asigné a mí mismo cae en las dos (el RPC me asigna cuando `p_assignees`
  viene vacío — ver `data/tareas.ts`, `NuevaTarea.assignees`).
- `ambito.test.ts`: sin sesión → false; soy asignado → true; la creé y la delegué → false; lista de
  asignados vacía → false.

### T3 — `etiquetaDeVencimiento` en `views/tareas/estados.ts` + test (decisión 10A)
- Mueve la regla que hoy vive inline en `TareasView.tsx:277`
  (`{t.due_date < hoy ? 'venció' : 'vence'} {formatAR(t.due_date)}`) a una función pura, **con su
  comentario**: el tiempo verbal sale de la FECHA y no del estado — una tarea hecha tarde igual
  dice "venció".
- Devuelve `{ texto, vencida }` para que el color no lo decida quien la llama (mismo criterio que
  `dueLabel` en reportes: así es imposible pintar de rojo un texto que dice "vence en 3 días").
- Cuatro casos en el test: pasada, hoy, futura, sin fecha.
- Consumirla desde `TareasView` **y** desde la tarjeta nueva.

### T4 — `src/views/resumen/TareasCard.tsx` (decisiones 6A, 8B, 9A, 11A)
- Cabecera: ícono `clipboardCheck`, título "Tareas personales", contador de pendientes al margen.
- Filas: **hasta `MAX_FILAS` (3)**, sobre `filas.filter(t => !estaHecha(t, t.task_assignees))`. El
  orden ya lo da el hook (`due_date` asc, `nullsFirst: false`), que es exactamente el orden de
  urgencia: vencidas, hoy, próximas, y las sin fecha al final.
- Cada fila: `<div role="button" tabIndex={0} className="spira-row-link spira-no-press">` con
  - el **tilde** (`<button>` anidado, `e.stopPropagation()`, `aria-pressed`, deshabilitado por id
    mientras espera al servidor — nunca un booleano global, o tildar una fila apaga las otras dos);
  - el **título** con `text-overflow: ellipsis` (fuera de cualquier `<button>`);
  - la línea secundaria: `estimated_minutes` + ` · ` + `etiquetaDeVencimiento`, integrada en la
    oración y sin pill, como el resto del mosaico;
  - la guarda `if (e.target !== e.currentTarget) return` en `onKeyDown`, o Enter sobre el tilde
    dispara las dos acciones.
- **UNA TAREA DELEGADA NO LLEVA TILDE** (apareció dibujando el mock, y hay que absorberlo).
  `set_task_done` cierra la parte de un **asignado**: si la creaste y se la encargaste a otra
  persona, no sos asignado y el RPC te rechaza. Un tilde que rebota es peor que no tenerlo — es la
  misma regla por la que `puedeEditar` existe (no OFRECER un botón que va a fallar). En ámbito
  "Todo" esas filas van **sin** el control, conservando su ancho para que el texto no salte, y su
  línea secundaria dice de quién es ("le pedí a M. Duarte"). El `esTareaMia` de T2 ya distingue
  los dos casos: **la misma función decide el filtro y decide si va el tilde**, así que no puede
  haber una fila filtrada como propia y dibujada como ajena.
- Pie: **"Ver todas"** a la izquierda (con `ChipDestino` del submódulo real, leído del registry) y
  **"+ Nueva tarea"** a la derecha, que abre `TareaModal`. El modal trae `useTeamRoster` adentro:
  **no consulta nada mientras está cerrado**.
- El destino de "Ver todas" es **`track/tareas`** (D3=B): queda **dentro de Coordinación**, así que
  no hace falta pasaje de vuelta ni hay riesgo de que `isAllowed` descarte la navegación en
  silencio. Con la versión anterior del plan cruzaba a Inicio y las dos cosas había que resolverlas.
- Vacío del ámbito: `avisoDeAmbito('No tenés tareas asignadas.', hayTareasEnTodo)`, con el mismo
  criterio de vacío que usa la tarjeta (no un `.length > 0` crudo — ver `ReportesCard`).
- Error de escritura: aviso dentro de la tarjeta, sin tocar la fila. Una fila que se tilda sola y
  vuelve sería peor que un error visible.

### T5 — `TrackResumenView.tsx` (decisiones 1B, 12)
- Monta `useMyTasks()` y `TareasCard` **al tope de la columna derecha**. La grilla `1fr 1fr` y las
  cuatro tarjetas actuales **no se tocan**: es una inserción, no un reacomodo.
- **Reescribir el comentario del mosaico** (`:700`) con el eje nuevo. Un diagrama stale es peor que
  ninguno.
- Subtítulo del KPI de visitas:
  `asignadasAMi = upcomingRows.filter(v => loAtendiYo(v, userId)).length` — **reusando
  `loAtendiYo`**, que ya tiene la guarda del nulo y su test; escribir `=== userId` a mano acá
  reintroduce el bug que esa función existe para evitar. Se cuenta sobre `upcomingRows` (ya
  filtradas por ámbito) y no sobre el dato crudo: el número y su subtítulo tienen que contar lo
  mismo.
- El sub **reemplaza** a "próximos 7 días" cuando hay asignadas, no lo acompaña: "3 asignadas a mí ·
  próximos 7 días" mide ~190px y la tarjeta de KPI tiene ~150px útiles. **Medirlo** (T7).
- `onChanged` del modal de visita no toca tareas; el refetch de tareas lo dispara la tarjeta.

### T6 — El acceso: Tareas pasa a Coordinación (decisiones D3=B, 4A, 13, 14)
**`AppShell.tsx` NO SE TOCA.** La condición de `:420` queda como está, y su comentario también:
"oculto en Inicio (su única vista es Resumen, la home)" **vuelve a ser cierto** en cuanto Tareas se
mude — que es la parte elegante de esta decisión. El panel oculto de Inicio deja de ser un defecto
sin escribir una línea de shell.

- `modules/registry.ts`, módulo **track**: agregar como **último** submódulo (decisión 14)
  `{ key: 'tareas', name: 'Tareas', icon: 'clipboardCheck', hint: 'Lo que anotaste vos' }`.
  El descriptor está **medido con la fuente cargada: 109,7 px** sobre los 145 disponibles (el
  control de la medición, "Información de pacientes", dio 137,89 px — exacto al valor que documenta
  ese archivo, así que el método es el correcto).
- `views/registryKeys.ts`: `'inicio/tareas'` → `'track/tareas'` en `REGISTERED_VIEWS`.
  `views/registry.tsx`: la misma sustitución en `VIEW_REGISTRY`, apuntando a `TareasView`.
  **El `Record<RegisteredView, …>` obliga a que las dos listas cambien juntas** o no compila.
- `modules/registry.ts`, módulo **inicio** (decisión 13): sacar `tareas` **y** `alertas` de sus
  submódulos. Inicio queda con Resumen y nada más. `alertas` nunca tuvo vista; `tareas` se mudó.
- Barrer lo que queda huérfano: `HIDE_ACTION` (`AppShell.tsx:55`) lista `'inicio/tareas'` e
  `'inicio/alertas'` — la primera pasa a `'track/tareas'`, la segunda se va. Revisar además el
  buscador global (`searchIndex.ts`) y la preferencia `homeView` (0105): si alguien tuviera
  `inicio/tareas` guardada como pantalla de inicio, **tiene que degradar a `inicio/resumen`**, no
  a una ruta que ya no resuelve.
- `TareasView` recibe `module` del shell, así que **hereda solo el acento de Coordinación** (#2B766D
  en vez del petróleo de Inicio). No hay nada que cambiar en la vista; sí hay que **mirarla**: su
  `EmptyState` y el botón "Nueva tarea" del encabezado se pintan con ese acento.
- **Test de invariante (REGRESIÓN — obligatorio):** todo submódulo de un módulo no-`proximamente`
  tiene vista registrada. Va junto a `destinos.test.ts`, que hoy sólo cubre los cuatro destinos de
  los KPIs. Es la clase de defecto que mordió **dos veces en dos días** — `inicio/tareas` ayer,
  `inicio/alertas` hoy. La dirección inversa NO se testea: `track/agenda` está registrada y fuera
  del menú a propósito.

### T7 — Mediciones obligatorias, antes de dar T5 y T6 por terminados
Notebook de referencia **1536×864**, peor caso con datos reales. Medir el **alto de la fila**, no
`offsetTop` de los hijos.

1. **El subtítulo del KPI** ("N asignadas a mí") en la tarjeta más angosta de la grilla auto-fit.
2. **La fila de tarea** con título largo: que el ellipsis funcione y el tilde no lo empuje.
3. **La barra de submódulos de Coordinación con seis renglones.** El descriptor ya está medido
   (109,7 px), pero el rótulo suma un renglón a una barra que hoy tiene cinco: hay que mirarla
   entera en la notebook de referencia, no sólo el texto nuevo.

> El riesgo nº 1 del plan **desapareció** con D3=B: era medir `Inicio › Resumen` con 220 px menos,
> y ya no se toca Inicio.

### T8 — `TODOS.md` — ✅ HECHO EN LA REVIEW (2026-09-06)
Ya aplicado, no hace falta repetirlo al implementar:
- **Corregida** la entrada del KPI: el coordinador ya está proyectado (`0102:168`) y declarado
  (`visits.ts:51`); no hace falta migración. El contra real es otro y quedó escrito.
- **Corregida** la entrada del shell: `/inicio/alertas` **no** funciona escrita a mano.
- **Anotada** la decisión (opción 1) en la entrada *"Shell · Inicio no tiene barra de submódulos"*.
  **Esa entrada se cierra cuando el PR mergee, no antes** — es lo único de T8 que queda pendiente.
- **Agregadas** las tres entradas nuevas de *Deuda que queda anotada*.

### T9 — Verificación
`npm run build` verde (typecheck + vitest + build) **y** verificación en el navegador. La tarjeta
escribe en la base, así que **esto exige QA logueado**: el banco de pruebas temporal no alcanza.

---

## Modos de falla

| Codepath nuevo | Falla realista en producción | ¿Test? | ¿Manejo de error? | ¿Silenciosa? |
|---|---|---|---|---|
| `esTareaMia` | Guarda del nulo omitida → tareas ajenas como propias | **Sí** (T2) | No aplica | **Sí** |
| `esTareaMia` | Comparación invertida → "Lo mío" muestra lo delegado | **Sí** (T2) | No aplica | **Sí** |
| `etiquetaDeVencimiento` | "vence" sobre una fecha pasada | **Sí** (T3) | No aplica | **Sí** |
| Filtro de hechas en la tarjeta | Se filtra por `completed_at` en vez de `estaHecha` → una grupal cerrada por todos sigue apareciendo | Indirecto (`estaHecha` ya testeada) | No aplica | **Sí** |
| Sub del KPI | `=== userId` escrito a mano sin guarda → cuenta toda visita sin coordinador | **Sí**, si se reusa `loAtendiYo` | No aplica | **Sí** — mitigado por T5 |
| Submódulo sin vista registrada | Un renglón del menú lleva al `Placeholder` | **Sí** (T6, invariante) | No aplica | **Sí** — ya pasó dos veces |
| `setTaskDone` desde la tarjeta | RPC rechaza (permiso, red) | No (es servidor) | **Sí**: aviso en la tarjeta, la fila no cambia | No |
| `useMyTasks` falla | La tarjeta muestra su error; las otras cuatro siguen | No | **Sí** (`CuerpoDeTarjeta`) | No |
| Ruta `inicio/tareas` retirada | Alguien la tiene guardada como `homeView` y aterriza en una ruta muerta | **No aplica** — al implementar se comprobó que **no puede pasar**: `homeView` guarda una CLAVE DE MÓDULO, no una ruta, y `resolverInicio` (`lib/home.ts:95`) entra por `submodules[0]`, que para Inicio sigue siendo `resumen` | — | No |
| Ruta `inicio/tareas` escrita a mano | Un favorito viejo deja de resolver | **Sí** (`router.test.ts`) | `parseUrl` devuelve `null` y el shell cae a su default: la ruta se RECHAZA en vez de caer al `Placeholder` | No |
| Sexto renglón del menú | El rótulo o el descriptor envuelven en la barra de 220px | No | No aplica | No — se ve mirando (T7.3), y el descriptor ya está medido |
| `CuerpoDeTarjeta` en 4 tarjetas | Una pierde su `que=` o su `vacioDelAmbito` | No (criterio de la casa) | No aplica | **Sí** — mitigado por el QA de T9 |

**Brechas críticas: ninguna.** Las dos que empezaban a serlo —el filtro de hechas y el sub del
KPI— quedan cerradas reusando funciones ya testeadas en vez de reescribirlas.

---

## Plan de pruebas

### Pantallas / rutas afectadas
- `track/resumen` — el objeto del cambio.
- `track/tareas` — la ruta nueva; la misma vista, ahora alcanzable con el mouse por primera vez.
- `inicio/tareas` — **deja de existir**. Confirmar que degrada a algo sensato y no a una pantalla rota.
- `inicio/resumen` — **no cambia** (D3=B). Se mira igual, para confirmar que sigue sin barra y entero.
- El resto del Resumen — `CuerpoDeTarjeta` toca las cuatro tarjetas existentes.

### Interacciones a verificar (con sesión, con datos reales)
1. La tarjeta muestra mis tres tareas más urgentes, vencidas primero y las sin fecha al final.
2. **Tildar** una tarea desde la tarjeta la cierra y desaparece de la lista; las otras filas siguen
   habilitadas mientras esa espera al servidor.
3. Una tarea en modo **`cada_uno`** tildada por mí NO desaparece si falta otro asignado.
4. **"Lo mío"** muestra sólo las asignadas a mí; **"Todo"** suma las que creé y delegué.
5. **"+ Nueva tarea"** abre el modal, guarda, y la tarjeta se actualiza sin recargar.
6. **"Ver todas"** revela el rótulo al apuntarlo y lleva a `Coordinación › Tareas`, sin salir del módulo.
7. El **subtítulo del KPI** aparece sólo cuando hay visitas asignadas, y el número coincide con el
   filtro de coordinador de Visitas del día.
8. **"Tareas" aparece último en el menú de Coordinación** y abre la pantalla real, no el `Placeholder`.
   La vista se pinta con el acento de Coordinación (botón "Nueva tarea" del encabezado, `EmptyState`).
9. **`Inicio` sigue exactamente igual**: sin barra de submódulos y con su Resumen a ancho completo.
   Y `/inicio/tareas` escrita a mano **ya no lleva a ningún lado raro**.
10. Las cuatro tarjetas viejas siguen mostrando bien sus tres estados después de `CuerpoDeTarjeta`.

### Casos borde
- **Sin ninguna tarea**: vacío honesto, sin prometer "Ver todas" cuando del otro lado tampoco hay.
- **Sólo tareas delegadas**: en "Lo mío" el vacío ofrece "Ver todo"; en "Todo" aparecen.
- **Todas hechas**: la tarjeta no lista ninguna y lo dice; no muestra hechas como pendientes.
- **Título muy largo**: ellipsis con puntos suspensivos, no corte en seco.
- **Tarea sin fecha y sin duración estimada**: la línea secundaria no queda con un ` · ` colgado.
- **Sesión sin resolver** (`userId` null): la tarjeta no adopta tareas ajenas.
- **Cuenta sin Coordinación** (gerencia, farmacia): **pierde el acceso por clic a Tareas.** Es el
  costo asumido de D3=B y el Director lo aceptó con un "por ahora" explícito. Verificar que la
  pantalla no quede rota para esa cuenta, sólo inalcanzable — y que no le aparezca un renglón que
  no puede abrir.
- **Tema oscuro** y `prefers-reduced-motion: reduce`.

### Caminos críticos
`Coordinación › Resumen` es la primera pantalla de la jornada de quien coordina, y ahora **escribe**.
El peor resultado posible de este PR es una tarea que se muestre como pendiente estando cerrada, o
al revés — de ahí que el filtro de hechas pase por `estaHecha` y no por una segunda definición.

---

## NO está en alcance (considerado y diferido)

| Diferido | Por qué |
|---|---|
| **Tarjeta "Pacientes"** | El dato existe (`useVisitsForDay`), pero el mock la resuelve con avatares de INICIALES — el `PrivacyAvatar` retirado el 2026-08-04. Portarla bien exige rediseñarla. Anotada en `TODOS.md` |
| **KPI "Alertas activas"** del handoff | Ya se consideró y se descartó a conciencia el 2026-09-01 (`destinos.ts:48`): "los pendientes vencidos de Pendientes" no dice nada |
| **KPI propio "Visitas asignadas a mí"** | El campo casi nunca está poblado en visitas futuras (hallazgo 1). Entra como tarjeta el día que el equipo asigne coordinador por adelantado |
| **Variante C del handoff** (riel fijo 300px) | Vive fuera de las columnas del mosaico: es un cambio del shell, no de la vista. Ya diferida el 2026-09-01 por lo mismo |
| **Variante D** (tarjeta compacta junto al título) | `setHeader({content})` guarda un elemento ya construido y no se repinta: la tarjeta quedaría congelada con las tareas del primer render |
| **Fidelidad literal al mock** | Borraría el alternador de ámbito, Próximas visitas y (en la variante A) Dispensaciones — tres decisiones posteriores al handoff |
| **Sacar las otras cuatro tarjetas a archivos propios** | ~700 líneas de movimiento sobre un working copy compartido. Anotado en `TODOS.md` |
| **Acotar `useMyTasks`** | El filtro obvio está mal (ver *Deuda*). Con el volumen de hoy no hace falta. Anotado en `TODOS.md` |
| **Tareas para quien NO tiene Coordinación** | Consecuencia directa de D3=B, y el "por ahora" del Director. Gerencia y Farmacia pierden el acceso por clic. Las tareas son personales y cruzan módulos, así que esto vuelve el día que alguien de Farmacia las pida. Las salidas serían el panel en Inicio (lo que se acaba de descartar) o Tareas como módulo propio del riel |
| **Dibujar el panel de submódulos en Inicio** | Se descartó al VER el mock. Con Tareas mudada, Inicio queda con una sola vista y su panel oculto deja de ser un defecto |
| **Tests de render (jsdom + Testing Library)** | Contradice el criterio de la casa; si se adoptan, merecen su propio PR |

---

## Deuda que queda anotada en `TODOS.md`

1. **Las otras cuatro tarjetas del mosaico siguen dentro de `TrackResumenView.tsx`** — este PR crea
   a propósito la mezcla (cuatro adentro, una afuera). Conviene una ventana sin trabajo paralelo
   sobre el Resumen.
2. **`useMyTasks` crece sin techo** — y el atajo obvio está mal: `completed_at is null` en el
   servidor deja pasar como pendientes las grupales en modo `cada_uno` que ya cerró todo el mundo,
   porque ese cierre vive en `task_assignees`. Cualquier acotación tiene que respetar los dos modos.
3. **La tarjeta "Pacientes" del handoff** — con el conflicto de las iniciales documentado, para no
   volver a analizarlo.

---

## Paralelización

| Paso | Módulos que toca | Depende de |
|---|---|---|
| **T0** ancho de `filaAncha` | `src/views/TrackResumenView.tsx` | — · **puede ir solo y primero** |
| T1 `CuerpoDeTarjeta` | `src/views/` (`resumenEstados` + `TrackResumenView`) | T0 (mismo archivo) |
| T2 `esTareaMia` + test | `src/views/resumen/` | — |
| T3 `etiquetaDeVencimiento` + test | `src/views/tareas/` (+ `TareasView`) | — |
| T4 `TareasCard` | `src/views/resumen/` (archivo nuevo) | T2, T3 |
| T5 `TrackResumenView` | `src/views/` | T1, T4 |
| T6 Acceso + invariante | `src/modules/`, `src/views/` (registryKeys + registry), `src/shell/` (sólo `HIDE_ACTION`) | — |
| T7 Mediciones | — (verificación) | T5, T6 |
| T8 `TODOS.md` | raíz | — |

```
T0 va PRIMERO y puede shipear solo — es un arreglo de producción de una línea.

Lane A: T2 → T4            (T4 consume esTareaMia)
Lane B: T3                 (independiente: views/tareas/)
Lane C: T6                 (independiente: registry + registryKeys)
Lane D: T8                 (independiente: TODOS.md)
        ─────────────────────────────────────────────
T0 → A + B + C + D en paralelo → merge → T1 → T5 → T7 → T9
```

⚠ **Conflicto declarado:** **T1 y T5 tocan las dos `TrackResumenView.tsx`**, y T4 escribe un archivo
que T5 importa. T1 va DESPUÉS del merge de las lanes y ANTES de T5, no en paralelo. Y ojo con el
working copy compartido: stagear por ruta, nunca `git add -A`.

---

## Implementation Tasks

Sintetizadas de los hallazgos de arriba. Cada una nace de uno concreto.

- [ ] **T0 (P1, human: ~15min / CC: ~3min)** — `TrackResumenView.tsx` — 🔴 arreglar el ancho de `filaAncha` (bug de producción)
  - Surgió en: el Director mirando el mock — `filaAncha` (`:47`) combina `width:'100%'` con `margin:'0 -20px'`, y el margen derecho queda inerte
  - Archivos: `src/views/TrackResumenView.tsx`
  - Verificar: medir en el navegador la fila contra su tarjeta, los dos lados; tienen que dar iguales
- [ ] **T1 (P2, human: ~1h / CC: ~10min)** — `views/resumenEstados.tsx` — extraer `CuerpoDeTarjeta` y migrar las cinco tarjetas
  - Surgió en: Calidad de código — la tríada está copiada en `TrackResumenView.tsx:343, 822, 960, 1024`
  - Archivos: `src/views/resumenEstados.tsx`, `src/views/TrackResumenView.tsx`
  - Verificar: `npm run build` + las cuatro tarjetas en sus tres estados en el preview
- [ ] **T2 (P1, human: ~45min / CC: ~8min)** — `views/resumen/ambito.ts` — `esTareaMia` + test
  - Surgió en: Arquitectura hallazgo 2 — `TrackResumenView.tsx:583` ("el ámbito manda sobre toda la pantalla")
  - Archivos: `src/views/resumen/ambito.ts`, `src/views/resumen/ambito.test.ts`
  - Verificar: `npx vitest run ambito`
- [ ] **T3 (P1, human: ~30min / CC: ~6min)** — `views/tareas/estados.ts` — `etiquetaDeVencimiento` + test
  - Surgió en: Tests hallazgo 10 — la regla vive inline en `TareasView.tsx:277`, sin test
  - Archivos: `src/views/tareas/estados.ts`, `src/views/tareas/estados.test.ts`, `src/views/TareasView.tsx`
  - Verificar: `npx vitest run estados`
- [ ] **T4 (P1, human: ~4h / CC: ~30min)** — `views/resumen/TareasCard.tsx` — la tarjeta
  - Surgió en: alcance D1=B / D2=A, y hallazgos 8B, 9A, 11A
  - Archivos: `src/views/resumen/TareasCard.tsx`
  - Verificar: QA logueado (tildar, alta, los dos modos de cierre)
- [ ] **T5 (P1, human: ~2h / CC: ~15min)** — `TrackResumenView.tsx` — mosaico 3/2, sub del KPI, comentario del eje
  - Surgió en: hallazgos 1B y 3A
  - Archivos: `src/views/TrackResumenView.tsx`
  - Verificar: `npm run build` + medición T7.1
- [ ] **T6 (P1, human: ~1h / CC: ~10min)** — registry — Tareas a Coordinación, retirar las de Inicio, test de invariante
  - Surgió en: alcance D3=B (reversión del Director sobre el mock) + hallazgo 4A y decisiones 13/14
  - Archivos: `src/modules/registry.ts`, `src/views/registryKeys.ts`, `src/views/registry.tsx`, `src/shell/AppShell.tsx` (sólo `HIDE_ACTION`), `src/views/resumen/destinos.test.ts`
  - Verificar: `npx vitest run destinos` + entrar a Tareas con el mouse desde el menú de Coordinación
- [ ] **T7 (P2, human: ~40min / CC: ~15min)** — verificación — las tres mediciones en 1536×864
  - Surgió en: hallazgo 3A (ancho del sub) y el sexto renglón del menú
  - Archivos: — (medición en el preview)
  - Verificar: DOM + estilos computados; nunca `preview_screenshot`, que se cuelga
- [ ] **T8 (P3, human: ~30min / CC: ~5min)** — `TODOS.md` — dos correcciones, un cierre, tres altas
  - Surgió en: "Lo que YA EXISTE" — las dos entradas equivocadas
  - Archivos: `TODOS.md`
  - Verificar: lectura

---

## Estado de la implementación (2026-09-06)

Rama `feat/tareas-en-el-resumen`, **sin migraciones**. `npm run build` verde: typecheck +
**704 tests** (+14) + build.

**Verificado con banco de pruebas temporal** (borrado antes de commitear), porque el Resumen exige
sesión y el preview es un navegador aparte del del Director. Se montaron los seis estados de la
tarjeta y se midió:

| Qué | Resultado |
|---|---|
| **T0 — geometría de la fila y del pie** | izquierda **1 px**, derecha **1 px**. El defecto de producción, cerrado |
| Tarea delegada | sin tilde, y la línea dice "le pediste a M. Duarte" |
| Alineación de títulos | 51 px en las dos filas: el hueco reservado funciona, el texto no salta |
| Tarea `cada_uno` cerrada por todos | la tarjeta dice "No te queda nada pendiente" — la trampa del hallazgo 11, cerrada |
| Verbo del vencimiento | "venció 04/09" para la pasada, "vence 06/09" para la de hoy |
| Título largo | trunca con puntos suspensivos |
| Cargando · error · vacío del ámbito | los tres, con su copy |

**Dos afirmaciones del plan las desmintió la implementación**, y quedan escritas arriba: el modo de
falla de `homeView` no existe, y `parseUrl` ya rechaza la ruta retirada en vez de dejarla caer al
`Placeholder` (tiene test desde ahora).

### T7 — las mediciones, hechas en la pantalla real (sesión del Director, 1536×864)

El ancho de contenido medido dio **1185 px**, exacto al valor que documenta el repo: el método
mide bien.

| # | Qué | Medido | |
|---|---|---|---|
| **T7.1** | Subtítulo del KPI de visitas | caja **244 px**; el texto más largo posible ("137 asignadas a mí") mide **111,42 px** | ✅ entra con el doble de margen |
| **T7.2** | Título largo en la fila de tarea | texto **572 px** contra una caja de **514** → trunca, con puntos suspensivos | ✅ |
| **T7.3** | Barra de submódulos con seis renglones | los seis miden **51,41 px** de alto (ninguno envuelve); descriptor más ancho **137,89 px** sobre 145 | ✅ |
| — | **T0, con datos reales** | fila **1/1**, pie **1/1** | ✅ el defecto de producción, cerrado |
| — | Columnas del mosaico | izquierda **513,5 px**, derecha **602,25 px** → **88,75 px** de desbalance | ✅ mejor que los 118 del mock |
| — | Ancho de tarjeta | **585,5 px** = (1185 − 14) / 2 | ✅ |
| — | Alineación del título | **51 px**, con tilde y sin tilde | ✅ |

**Y una confirmación empírica del hallazgo 1:** con datos de producción el subtítulo dice
"próximos 7 días", o sea **`asignadasAMi === 0`**. El campo no está poblado en ninguna visita
futura. Un KPI propio "Visitas asignadas a mí" habría mostrado un cero permanente, que es
exactamente lo que la decisión 1B evitó.

### QA logueado — hecho, con una tarea `TEST-*` creada y borrada

- **El alta desde el pie de la tarjeta**: abre `TareaModal`, el padrón del equipo carga, se crea y
  la tarjeta se refresca sola. ✅
- **El tilde contra `set_task_done`**: la fila desaparece y la tarjeta vuelve a "No te queda nada
  pendiente". ✅
- **"Ver todas"** llega a `/coordinacion/tareas`, con el submódulo marcado en el menú y el botón
  "Nueva tarea" en el encabezado. ✅
- La tarea de prueba se **borró** desde el menú ⋮ de la pantalla de Tareas; no quedó ningún `TEST-`.

**No observado, no "verificado":** el estado deshabilitado del tilde mientras espera al servidor
—la RPC volvió antes de los 400 ms de la sonda—, y el campo de fecha del modal, que no tomó el
valor puesto con el setter nativo (tiene su propio parseo; **no es de esta tarjeta**, pero conviene
mirarlo alguna vez a mano).

### Lo que queda

- **Los dos modos de cierre** (`cualquiera` / `cada_uno`) con una tarea de verdad de dos personas.
  La regla está testeada y se verificó en el banco, pero no contra el servidor.
- **Una cuenta sin Coordinación** (gerencia/Farmacia): confirmar que Tareas le queda inalcanzable
  pero no rota — es el costo asumido de D3=B. La cuenta con la que se probó tiene Coordinación y,
  además, **no coordina ningún protocolo**, así que tampoco dibujó el alternador "Lo mío / Todo":
  el filtro de ámbito de tareas **no se ejercitó en pantalla** (sí en sus tests).

---

## GSTACK REVIEW REPORT

| Runs | Status | Findings |
|---|---|---|
| Step 0 — Scope challenge | ✅ completo | Complexity check DISPARÓ en la lectura máxima (~10 archivos + decisión de shell). Alcance fijado por el Director: D1=B, D2=A, D3=A |
| 1 — Arquitectura | ✅ completo | 4 hallazgos, 4 resueltos (1B, 2C, 3A, 4A) |
| 2 — Calidad de código | ✅ completo | 3 hallazgos, 3 resueltos (5A, 6A, 7A) |
| 3 — Tests | ✅ completo | Diagrama emitido: 16 caminos, 15 gaps (3 visuales). 3 hallazgos resueltos (8B, 9A, 10A) + 1 test de REGRESIÓN obligatorio |
| 4 — Performance | ✅ completo | 1 hallazgo, resuelto (11A) — con trampa de corrección adentro |
| Outside voice | ⏭️ omitido | `codex` no está instalado en esta máquina; la sesión no levanta subagentes sin pedido explícito |
| TODOS.md | ✅ 3 altas + 2 correcciones + 1 cierre | Las dos entradas viejas estaban equivocadas |
| Handoff confirmado | ✅ hecho | Downloads y `docs/` son idénticos (sólo CRLF); se usa el del repo, que está completo |
| Mock | ✅ al repo antes de implementar | `mock-resumen-tareas-en-el-mosaico.html`, con los tokens vivos. **Dio vuelta DOS decisiones** (la 3 por medición, la D3 por el Director), destapó el caso de la tarea delegada sin tilde y **encontró un bug de producción** (T0) |

**Hallazgos por severidad:** 5×P1, 3×P2, 3×P3, más 1 corrección de la propia review. Ninguno abierto.

**Confianza:** los once hallazgos se emitieron con la línea que los motiva citada (`file:line`),
según el pre-emit gate. El más bajo quedó en 8/10; cinco en 9/10 y dos en 10/10.

**Una recomendación de esta review resultó equivocada, y la desmintió una MEDICIÓN.** El hallazgo 3
proponía mudar "Próximas visitas" de columna para emparejar el mosaico, apoyado en estimar las
alturas de las tarjetas. Medidas en el mock, Dispensaciones resultó ser de **171 px** —dos filas y
ningún pie— contra los ~230 supuestos, y con eso mudar la tarjeta pasaba de emparejar a
**desbalancear 337 px** y a empujar una tarjeta entera debajo de la línea de flotación. Corregido en
la decisión 12. Es la tercera vez en el proyecto que una estimación de alto o de ancho se cae al
medirla: **en esta app, cualquier afirmación sobre píxeles se mide antes de escribirla.**

**Dos hallazgos cambiaron el alcance respecto de lo que el pedido asumía:** (1) `coordinator_id`
**ya** está en `v_track_visits` (`0102:168`), así que la entrada de `TODOS.md` que pedía una
migración era falsa — pero el campo casi nunca está poblado en visitas futuras, así que el KPI
literal habría mostrado 0 permanente; (2) `inicio/alertas` figura en el menú y **no** tiene vista,
o sea que arreglar el acceso habría creado el defecto inverso al que venía a arreglar.

**Y una decisión de alcance la dio vuelta el Director mirando el mock.** D3 era "dibujar el panel de
submódulos en Inicio"; al verlo dibujado la respuesta fue *"esto no va en el Inicio"*, y Tareas pasó
a ser submódulo de **Coordinación**. **El PR se achicó con eso:** se cae la modificación del shell,
se cae la medición de los 220 px que era el riesgo nº 1, el "Ver todas" deja de cruzar de módulo, y
el panel oculto de Inicio deja de ser un defecto sin tocar una línea. Es el argumento entero a favor
de dibujar antes de implementar: **un tablero se descarta en diez segundos y una implementación no.**

**Y el mock encontró un bug que está en producción desde el 2026-09-01** (T0): las filas y los pies
del Resumen están corridos 20 px a la izquierda y quedan 40 px cortos a la derecha, porque
`filaAncha` combina `width: '100%'` con `margin: '0 -20px'` y el margen negativo derecho no puede
ensanchar una caja de ancho fijo. Lo vio el Director apenas abrió el mock; **leyendo el código las
tres declaraciones se ven correctas**, y por eso pasó dos reviews sin que nadie lo notara. Es una
línea y se puede shipear solo, antes que todo lo demás.

**VERDICT: APROBADO CON CONDICIONES.** El plan es implementable tal como está, sin migraciones y
**sin tocar el shell**. Tres condiciones bloqueantes antes de dar la implementación por buena:
(1) el test de invariante submódulo⇔vista de T6, que no es opcional (regla de regresión) y que ahora
además cubre el retiro de `inicio/tareas`; (2) ~~que `homeView` degrade~~ — **descartado al
implementar: no puede pasar.** `homeView` guarda una clave de MÓDULO y no una ruta, así que nadie
pudo haber guardado `inicio/tareas` como pantalla de inicio (`lib/home.ts:92-96`). Era el único modo
de falla silencioso que se le atribuía a este cambio y no existe; (3) QA **logueado**, porque la
tarjeta escribe en la base y el banco de pruebas temporal no puede ejercitar `set_task_done` contra
el servidor.

NO UNRESOLVED DECISIONS
