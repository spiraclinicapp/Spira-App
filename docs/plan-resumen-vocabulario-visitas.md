# PLAN — El vocabulario de Visitas del día en las pantallas de resumen

Port del lenguaje visual del handoff `handoff_visitas_dia/HANDOFF - Visitas dia.md` a las
**dos pantallas de resumen** de la app. Producido con `/plan-eng-review` (2026-08-18).

> **No es implementar el handoff: ya está implementado.** `DayVisitsView` + `DayVisitRowItem`
> son ese handoff rebindeado al schema real (PRs #25-#32, migración 0065). Lo que falta es que
> el resto de la app hable ese idioma. El trabajo es **extraer y reusar**, no reescribir.

## Decisiones tomadas (Director, 2026-08-18)

| # | Tema | Decisión |
|---|---|---|
| D1 | Alcance | **Las dos pantallas**, con UNA fila compartida: `inicio/resumen` y `track/resumen`. |
| D2 | Forma de la fila | **Renglón con separador**, no la tarjeta del handoff. Cambia el CONTENIDO (nombre titular, ProtoTag, tag de visita, chip), no el contenedor. |
| D3 | Procedimientos | **Sí**, `ProcDots` — pero solo donde el dato se mueve (ver E2). |
| D4 | Ubicación | `views/track/visitAtoms.tsx` → `views/visitAtoms.tsx`. La fila nueva a `views/VisitSummaryRow.tsx`. Precedente: `views/visitStates.tsx`. |
| D5 | Chip de estado | **Slot explícito** (`chip: ReactNode`). La fila NO elige el eje. |
| D8 | Gate de error | **Por bloque**, como ya hace Inicio. Procedimientos nunca bloquea. |
| D11 | Ordenamientos | Extraer `ordenarDia` y `priorizarAlertas` a `views/visitRules.ts`, con tests. |
| D12 | Gate de carga | **Por bloque** también (con el matiz de la nota #8, abajo). |
| D13 | ProcDots tardío | La fila **crece** cuando llegan. Sin alto reservado. |
| D15 | Conteos caros | A `TODOS.md`, no a este PR. |
| D17 | Ancho de la fila | Chip en `compact` + el rótulo Presencial/Telefónica **sale** de la fila (ícono `phone` solo para las telefónicas). El nombre baja a **15px**, debajo del `cardTitle` de 16. |
| D18 | Contraste | El texto de `ProtoTag`, `OperationalStageChip` y `VisitChip` pasa a `--spira-ink`; el tono queda en el fondo (14%) y en el punto. **Commit aparte.** |
| D19 | Estados | Tabla completa de carga / vacío / error / parcial en el plan (abajo). |

### Revisadas después de la voz externa

La voz externa encontró ocho cosas; verifiqué las ocho contra el código y las ocho dan. Cuatro
cambiaron decisiones ya tomadas — quedan acá, con lo que las movió.

| # | Antes | Ahora | Por qué |
|---|---|---|---|
| **E1** | D6: la misma fila dibuja visitas **y** alertas | **REVERTIDO.** La fila cubre visitas; las alertas conservan su **superficie teñida**, y se unifica `alertItemStyle` entre `TrackResumenView`, `TrackAlertsView` e Inicio | `TrackAlertsView.tsx:34` es un **quinto consumidor** que el plan no veía, y su comentario dice que la tinta **es** la señal de severidad. Además el hover de `.spira-row-link` escribe `background-color`: renglón y tinta se pisan. |
| **E2** | D3/D9: ProcDots y contadores en las dos pantallas | **ProcDots y contadores solo en el DÍA** (Inicio › "Tu día" y Visitas del día). El bloque de 7 días recibe el resto del vocabulario | `useUpcomingVisits` filtra `.is('real_date', null)` (`visits.ts:68`): son visitas que no ocurrieron, así que `done` es estructuralmente 0 y los puntos repiten el catálogo del cuadro. Y `operational_stage` **no existe** en `TrackVisitRow`: los contadores ni compilan ahí. |
| **E3** | D10: "no vino" sale de "por llegar" | **REVERTIDO.** Tres contadores, un solo eje, exactamente como hoy | `DayVisitsView.tsx:172-173` ya lo había decidido y escrito: *"«No vino» no es una etapa del recorrido (es un estado clínico), así que no tiene contador propio"*. Sacarlo sin un cuarto contador rompe la aritmética en silencio; agregarlo desincroniza con el badge del filtro Estado (`countBy`, línea 118). |
| **E4** | D7: extraer 4 constantes a `views/resumenStyles.ts` | **Converger `btnOutline` al canónico** de `components/buttons.ts`. `card`/`cardTitle`/`TIPO_LABEL` → `TODOS.md` | El canónico ya existe (`buttons.ts:8`, height 40 + **longhands**) y las copias del resumen son un **fork** (height 38 + borde **abreviado**, justo el gotcha contra el que advierte su comentario). `card` está duplicado en **siete** archivos y `pharma/reportes/estilos.ts:22` ya exporta otro: es un barrido que no entra en un PR de presentación. |

### Notas de la voz externa que NO cambiaron nada

- **D13 queda validado, no roto.** `useSupabaseQuery.ts:54` hace `setLoading(dataRef.current === null)` y `useDayProceduresSummary` devuelve `{}` con input vacío, así que ese hook **nunca** reporta `loading` y `procs === undefined` es ambiguo entre "no consulté" y "no tiene". Reservar alto habría exigido tocar el hook del que ya depende Visitas del día. "La fila crece" es la única opción que no lo necesita.
- **D12 sirve, pero menos de lo prometido.** "Tus módulos" usa `visits.length` para la bajada de la tarjeta de Coordinación (`InicioResumenView.tsx:158`), así que ese bloque sigue esperando a `day`: aparece enseguida y su subtítulo llega después. Y `alertsQ` son **tres** consultas (`alertDismissals.ts:161`), o sea el "bloque" de alertas son tres estados a combinar a mano.
- **Presupuesto de ancho — riesgo abierto, resuelto midiendo.** El vocabulario se diseñó para una fila de ~1200px (`DayVisitRowItem.tsx:105-117`) y se muda a columnas de grilla `1fr 1fr` (Inicio) y `1.5fr 1fr` (Coordinación) con 20px de padding: ~400-550px útiles. El titular de 17px + ProtoTag + IVRS + tag de visita puede truncar justo los identificadores que venía a mostrar, y `ProcDots` hace `flexWrap`. **Gate del paso 3:** medir el ancho real en el preview ANTES de fijar los tamaños; si no entra, cae primero el IVRS de la línea 2 (está en el chip y en la ficha), después el `visitName`.

## Revisión de diseño (2026-08-18)

`/plan-design-review` corrido **contra el sistema existente, no contra mockups generados**: el
lenguaje visual ya está decidido (handoff + `DayVisitRowItem` + `DESIGN.md`), así que generar una
tercera fuente visual habría competido con las otras dos. Lo que no se sabía era si ENTRA, y eso
se mide.

| # | Dimensión | Antes | Después |
|---|---|---|---|
| 1 | Arquitectura de información | 4/10 | 9/10 (D17) |
| 2 | Cobertura de estados | 3/10 | 9/10 (D19) |
| 3 | Recorrido y arco emocional | 6/10 | 6/10 — sin storyboard; aceptado, la pantalla es de vistazo |
| 4 | Riesgo de AI slop | 8/10 | 8/10 — clasificado APP UI, ningún rechazo duro aplica |
| 5 | Alineación con el sistema | 4/10 | 9/10 (D17 + D18) |
| 6 | Responsive y accesibilidad | 2/10 | 8/10 (D17 + D18); el desktop-only queda como no-objetivo |

### El presupuesto de ancho, medido

Con los valores REALES del shell (rail 64 + submenú 220 + padding 26×2 = 336) y las fuentes
reales cargadas en el preview:

```
                       bloque de contenido = columna − (tipo 59 + chip 144 + gaps 22)
viewport   Inicio col   →bloque    Track izq  →bloque    Track der
─────────────────────────────────────────────────────────────────────
1366        468          243        570        345        366
1440        505          280        614        389        396
1536        553          328        672        447        434
1920        745          520        902        677        588
```

| pieza | px medidos |
|---|---|
| Línea 1 · nombre típico ("Mariño, Carlos Adolfo") a 17px | 180 |
| Línea 1 · nombre real largo a 17px | 351 |
| Línea 2 completa (ATLAS-7 + #0320040058 + V6 + "Visita 6 · Semana 24") | **340** |
| Línea 3 · ProcDots ×4 | 289 |

**El vocabulario no entraba hasta los 1920px.** A 1440 sobraban 280 para 340. D17 lo resuelve
por sustracción, no por achique: el chip `compact` devuelve ~34px y sacar el rótulo de tipo
devuelve 70 → el bloque pasa a **384px a 1440** y a **350 a 1366**, con los 340 adentro.

**Y una inversión de jerarquía que no dependía del ancho:** el nombre a 17px Display 700 le ganaba
al título de su propia tarjeta (`cardTitle`, 16px). En Visitas del día 17px está bien porque la
fila ES el contenido de la página; adentro de una tarjeta, no. Por eso baja a 15.

### Contraste, medido con la fórmula de WCAG

El patrón `color: tono; background: tono + "16"` (texto del tono sobre el tono al 9%) queda por
debajo de 4.5:1 casi en todas partes. Card clara `#FFFFFF`, card oscura `#212121`:

| familia | fallan en claro | fallan en oscuro |
|---|---|---|
| `PROTO_TONES` (etiqueta de protocolo) | 3 de 5 | **5 de 5** |
| `OPERATIONAL_STAGES` (chip operativo) | 2 de 4 | **4 de 4** |
| `VISIT_STATES` (chip clínico) | 3 de 7 | **7 de 7** |

En oscuro la mayoría cae entre 2.58 y 3.04. Los chips son 12px peso 600 → texto NORMAL para WCAG,
umbral 4.5:1 (el de "texto grande" arranca en 18.66px bold, no aplica).

**Es PRE-EXISTENTE** —ya está en producción en Visitas del día, la cola del médico y Alertas— pero
el plan lo propagaba a cuatro bloques más. D18 lo corrige en la raíz: el texto pasa a `ink` y el
color se queda donde significa, en el fondo teñido y en el punto.

### Un acierto que conviene dejar escrito

El handoff §6 pide un **riel de color de 4px a la izquierda** de la fila. `DESIGN.md` lo prohíbe:
*"Don't usar `border-left`/`border-right` de color como franja de acento en cards o alertas"*.
D2 lo evitó y `DayVisitRowItem` ya lo había sacado en su momento. **No reponerlo** porque el
handoff lo pida: en este punto el handoff y el sistema no coinciden, y manda el sistema.

## Lo que YA existe (se reusa, no se reinventa)

```
handoff §         ya vive en                                     acción
─────────────────────────────────────────────────────────────────────────────
§6 fila           views/track/DayVisitRowItem.tsx                patrón de referencia
§6 etiqueta       visitAtoms.tsx → ProtoTag + protoTone()        REUSAR (se muda)
§3 puntos proc    visitAtoms.tsx → ProcDots                      REUSAR (se muda)
§6 responsables   visitAtoms.tsx → Persona                       REUSAR (se muda)
§2 estados        views/visitStates.tsx → OperationalStageChip   REUSAR (Inicio ya lo usa)
§2 estados        views/visitStates.tsx → VisitChip              REUSAR (Track ya lo usa)
§4 contadores     DayVisitsView.tsx:174-176 (INLINE)             EXTRAER
                  components/buttons.ts → btnOutline             CONVERGER (E4)
                  TrackAlertsView.tsx:34 → alertItemStyle        UNIFICAR (E1)
                  data/procedures.ts → useDayProceduresSummary   REUSAR tal cual
                  lib/visits.ts → visitTitle() / visitCode()     REUSAR tal cual
                  tokens.css → .spira-row-link / .spira-card-link REUSAR tal cual
```

Nada de esto se reconstruye. El único código realmente nuevo es la fila compartida y las
tres reglas puras.

## NO está en alcance

| Qué | Por qué |
|---|---|
| Filtros multi, agrupador, buscador (handoff §5, §8) | Un resumen no filtra: lleva a la vista que filtra. |
| Modal de detalle y navegación con ↑↓ (§7) | El resumen navega con `onNavigate`, no abre modal. Es la definición de la pantalla. |
| La fila-tarjeta con riel y sombra (§6, contenedor) | D2: el resumen es lista de vistazo, no de trabajo. |
| Contador de "no vino" (§4.3) | E3: contradice una decisión documentada y desincroniza con el filtro Estado. |
| ProcDots y contadores en el bloque de 7 días | E2: `done` es estructuralmente 0 ahí y `operational_stage` no está en el tipo. |
| Token `violet` y la escala de 7 tonos de procedimiento (§3) | `visitAtoms` ya decidió no portarla: el catálogo real de procedimientos es texto libre. |
| Converger `card` (7 archivos) y `TIPO_LABEL` | E4 → `TODOS.md`. Es un barrido de sistema de diseño, no presentación del resumen. |
| Conteo server-side de recepciones y pacientes | D15 → `TODOS.md`. Es capa de datos en un PR de presentación. |
| Tests de componente | No hay `jsdom` ni `testing-library` en `devDependencies`. Lo visual se verifica mirando. |
| Mobile y tablet | Spira es una app de escritorio clínico (el shell asume rail 64 + submenú 220 + contenido). No hay media query para las grillas del resumen y no se agrega: sería diseñar un viewport que nadie usa. |
| Barrido de contraste del resto de la app | D20 → `TODOS.md`. D18 cubre los tres componentes que el resumen propaga; el patrón es del sistema y su auditoría es otro trabajo. |

## Mapa de archivos

```
NUEVOS
  src/views/VisitSummaryRow.tsx     fila de VISITAS (2 consumidores: Tu día · Próximas 7 días)
  src/views/alertItem.tsx           alertItemStyle unificado (3 consumidores)          ← E1
  src/views/visitRules.ts           contarVisitas · ordenarDia · priorizarAlertas
  src/views/visitRules.test.ts      T1-T12
  src/views/visitAtoms.test.ts      T13-T15 (protoTone)

MUDADO
  src/views/track/visitAtoms.tsx → src/views/visitAtoms.tsx

CAMBIADOS
  src/views/InicioResumenView.tsx      fila + contadores + procs + gates por bloque
  src/views/TrackResumenView.tsx       fila + gates por bloque (sin procs ni contadores)
  src/views/TrackAlertsView.tsx        importa alertItem + btnOutline canónico          ← E1/E4
  src/views/DayVisitsView.tsx          consume contarVisitas(filtered)   ← riesgo de regresión
  src/views/track/DayVisitRowItem.tsx  solo el import de visitAtoms
```

Diez archivos, dos componentes nuevos. La cuenta subió respecto del primer borrador porque E1
sumó `TrackAlertsView`: el duplicado real de alertas estaba ahí, no contra las visitas.

## La fila compartida — contrato

```
   InicioResumen · Tu día ────────┐     ┌────────────────────────────┐      ProtoTag
                                  ├────>│     VisitSummaryRow        │────> ProcDots
   TrackResumen · Próximas 7d ────┘     │ (ciega al módulo y al eje) │      Persona
                                        └────────────────────────────┘
                                                    ▲
                                           chip: ReactNode
                                         LA PANTALLA lo arma

   InicioResumen · Lo prioritario ─┐
   TrackResumen · Alertas ─────────┼───> alertItem  (superficie teñida por severidad)
   TrackAlertsView ────────────────┘
```

```ts
interface VisitSummaryRowProps {
  visit: TrackVisitRow          // DayVisitRow la extiende: sirve para los dos bloques
  chip: ReactNode               // D5: la pantalla decide el eje, la fila NO
  procs?: DayProcedureSummary   // D3/D13: ausente = sin tercera línea (y así se queda)
  coordinador?: string | null   // solo las visitas del día lo tienen (migración 0065)
  medico?: string | null
  onClick: () => void
  ariaLabel: string
}
```

**Por qué el chip va por slot y no por detección:** `views/visitStates.tsx:44` dice
*"Eje distinto de VISIT_STATES (clínico): no mezclar"*. Una visita "no vino" tiene
`computed_status = 'por_reprogramar'` y a la vez `operational_stage = 'por_llegar'`: los dos
son verdad y significan cosas distintas. Si la fila dedujera el eje de la forma del dato, el
día que una consulta de 7 días empiece a traer `operational_stage` la fila mostraría "Por
llegar" para visitas de la semana que viene — y se vería bien haciéndolo.

**Límite contra el componente-con-banderas:** una prop opcional nueva solo si la piden **los
dos** consumidores. Si la pide uno solo, ese bloque compone alrededor de la fila, no adentro.
Este límite es la lección de E1: la primera versión tenía cuatro consumidores y siete props, y
el cuarto (alertas) no compartía forma de verdad — compartía tipo de dato, que no es lo mismo.

## Reglas puras y cobertura

```
views/visitRules.ts                              [NUEVO · puro · TESTEABLE]
│
├─ contarVisitas(rows: DayVisitRow[]) ─────────────────────────────────
│   │  ⚠ recibe la lista YA FILTRADA. DayVisitsView cuenta sobre
│   │    `filtered` (:174-176), no sobre `rows`. Pasarle el crudo
│   │    cambia el encabezado sin que se vea ningún error.
│   │  ⚠ tipada sobre DayVisitRow, NO TrackVisitRow: `operational_stage`
│   │    solo existe ahí (E2).
│   ├─ rows = []                    → 0/0/0                       [T1]
│   ├─ por_llegar                   → porLlegar++                 [T2]
│   ├─ concurrio_al_centro          → enCentro++                  [T3]
│   ├─ inicio_atencion              → enCentro++                  [T4]
│   ├─ fin_atencion                 → finalizadas++               [T5]
│   └─ computed_status por_reprogramar
│        → NO altera el conteo operativo (E3: sigue en porLlegar)  [T6]
│
├─ ordenarDia(rows) ───────────────────────────────────────────────────
│   ├─ dos con arrived_at           → ascendente                  [T7]
│   ├─ uno sin arrived_at           → ese va al final             [T8]
│   ├─ ninguno con arrived_at       → patient_code ascendente     [T9]
│   └─ patient_code null            → '' , no explota             [T10]
│
└─ priorizarAlertas(rows) ─────────────────────────────────────────────
    ├─ ventana_vencida primero                                    [T11]
    └─ estable dentro del grupo (preserva el orden por fecha)      [T12]

views/visitAtoms.tsx                             [MUDADO]
└─ protoTone(id)
    ├─ mismo id → mismo tono                                      [T13]
    ├─ siempre ∈ PROTO_TONES                                      [T14]
    └─ valores fijados para 3 ids: el hash como CONTRATO          [T15]
```

**T1-T6 son obligatorios por regla de regresión**, no por preferencia: `DayVisitsView` ya
tiene esos contadores funcionando, y la extracción puede cambiarlos en silencio. **T6 cambió
de sentido con E3**: ahora fija que `por_reprogramar` NO altera el conteo, o sea protege el
comportamiento actual en vez de introducir uno nuevo.

**T15 es el test que parece de más y no lo es:** `protoTone` es un hash sobre el id del
protocolo. Si alguien lo "mejora", **todos** los protocolos cambian de color de golpe. Nada
falla, nada se ve roto, y la memoria visual del usuario se rompe entera. Fijar tres valores
convierte el hash en un contrato que hay que romper a propósito.

## Modos de falla

| Codepath nuevo | Cómo falla en producción | ¿Test? | ¿Manejo? | ¿Silenciosa? |
|---|---|---|---|---|
| `contarVisitas` sobre la lista equivocada | alguien le pasa `rows` en vez de `filtered` | **sí** (T1-T6) | n/a | sí → **el test es la única red** |
| `protoTone` | cambia el hash y se reordenan todos los colores | **sí** (T13-T15) | n/a | sí |
| `ordenarDia` con nulos | `arrived_at` null se ordena primero → atendés en el orden equivocado | **sí** (T7-T10) | n/a | sí |
| `priorizarAlertas` | un comparador no estable reordena dentro del grupo | **sí** (T11-T12) | n/a | sí |
| `useDayProceduresSummary` en Inicio | la RLS filtra en silencio → mapa vacío | no | ProcDots no se pinta (D8) | sí, **benigna**: ausencia, no dato falso |
| Chip del eje equivocado | una pantalla pasa el chip que no va | **no testeable** (sin jsdom) | n/a | sí → cubierto por diseño (D5) + verificación visual |
| Fila truncada por ancho | el titular corta el IVRS en la columna angosta | no | n/a | **no**: se ve mirando → gate del paso 3 |

**Sin gaps críticos:** los dos modos silenciosos sin test están cubiertos estructuralmente —
la fila no tiene con qué equivocarse de eje (solo la pantalla puede), y el ancho se resuelve
midiendo antes de fijar tamaños.

## Estados de carga y error (D8 + D12)

```
InicioResumenView                          hoy            plan
──────────────────────────────────────────────────────────────────────
tarjetas de módulos (registry)             espera 5 ∥     aparecen ya;
                                                          la bajada de Coordinación
                                                          llega con `day` (nota #8)
Tu día (visitas)                           gate global    esqueleto propio
Lo prioritario (alertas)                   gate global    esqueleto propio (3 consultas)
tarjeta de Farmacia (recepciones)          gate global    esqueleto propio
ProcDots                                   —              NUNCA bloquea

TrackResumenView                           hoy            plan
──────────────────────────────────────────────────────────────────────
KPIs                                       gate global    esqueleto propio
Próximas visitas                           gate global    esqueleto propio
Alertas                                    gate global    esqueleto propio
```

`TrackResumenView.tsx:83` hoy hace `protocols.error || patients.error || upcoming.error ||
alerts.error` y borra la pantalla entera. `InicioResumenView.tsx:69` ya dejó `recepQ.error`
afuera del gate a propósito. Este plan lleva el criterio de Inicio a las dos vistas, para
carga y para error.

## Estados de interacción (D19)

Qué VE el usuario en cada celda. Los vacíos actuales se transcriben literales: son copy bueno y
una reescritura sin esto los pierde.

| bloque | carga | vacío | error |
|---|---|---|---|
| Tus módulos (Inicio) | se pinta ya; la bajada de Coordinación llega con `day` | n/a | n/a |
| Tu día (Inicio) | 3 filas fantasma del alto real | «No hay visitas hoy.» + `calendar` 16 `faint` | «No pudimos cargar las visitas.» + Reintentar |
| Lo prioritario (Inicio) | 3 filas fantasma | «Sin alertas. Todo al día.» + `check` 16 `good` | «No pudimos cargar las alertas.» + Reintentar |
| Farmacia (Inicio) | la tarjeta sin bajada | n/a | sin bajada, nunca «Próximamente» |
| KPIs (Coordinación) | 4 tarjetas con el número en fantasma | n/a | «—» en el número, la tarjeta se pinta |
| Próximas 7 días | 3 filas fantasma | «Sin visitas en los próximos 7 días.» | «No pudimos cargar las visitas.» + Reintentar |
| Alertas (Coordinación) | 3 tarjetas fantasma | «Sin alertas. Todo al día.» + `check` 16 `good` | «No pudimos cargar las alertas.» + Reintentar |
| ProcDots | **nada** — llega tarde y la fila crece (D13) | no se pinta la línea | no se pinta la línea |

**La fila fantasma:** mismo alto y mismos bloques que la fila real, en `--spira-line`, radio 6,
**sin pulso ni shimmer** — `DESIGN.md` prohíbe el bounce y el realce por animación decorativa, y
la regla del Director es que nada pulsa. Un fantasma quieto ya comunica "esto va a llenarse".

**Los errores por bloque no repiten el mismo texto**: cada uno nombra lo que no pudo cargar. Un
«No pudimos cargar el resumen» repetido tres veces en la misma pantalla se lee como un solo
error roto, no como tres bloques independientes.

## Orden de implementación

```
PASO 1 ── Mudanza y extracción (sin cambio visible salvo el alto del botón)
   ├─ visitAtoms.tsx → views/            + actualizar el import de DayVisitRowItem
   ├─ btnOutline → components/buttons.ts (3 copias)   ← E4: cambia 38→40 px
   ├─ views/alertItem.tsx                (3 copias)   ← E1
   └─ views/visitRules.ts + tests        + DayVisitsView consume contarVisitas(filtered)
   ⇒ GATE: `npm run build` verde. Los contadores de Visitas del día, IDÉNTICOS.

PASO 2 ── La fila compartida
   └─ views/VisitSummaryRow.tsx          (todavía sin consumidores)

PASO 3 ── Los dos bloques de visitas
   ├─ InicioResumenView · Tu día
   └─ TrackResumenView · Próximas 7 días
   ⇒ GATE DE ANCHO: medir en el preview antes de fijar tamaños (nota de la voz externa).

PASO 4 ── Gates por bloque, contadores y ProcDots
   ├─ carga y error por bloque en las dos vistas
   └─ contadores + useDayProceduresSummary SOLO en Inicio · Tu día
```

El paso 1 es puro refactor: **primero hacer fácil el cambio, después hacer el cambio**. Si el
build queda verde y los contadores de Visitas del día no se movieron, el paso 1 fue correcto.

**Paralelización:** ninguna. Los cuatro pasos tocan `src/views/` y cada uno depende del
anterior. Secuencial, sin oportunidad de worktrees.

## Verificación

1. `npm run build` verde (typecheck + los 199 tests + los ~15 nuevos + build).
2. Preview en el 5250, logueado: las dos pantallas de resumen, Alertas y Visitas del día.
3. A ojo: el nombre del paciente titular sin truncar en las dos columnas, el tono de protocolo
   estable entre recargas, los contadores de Visitas del día iguales a los de antes, y las
   alertas con la misma cara en las tres pantallas.
4. Ojo con el gotcha del preview: `preview_screenshot` se cuelga. Evidencia por DOM.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | NOT RUN | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | NOT AVAILABLE | `codex` no instalado en esta máquina |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 10 issues, 0 critical gaps, 15 decisiones |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score 5/10 → 8.2/10, 4 decisiones (D17-D20) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | NOT RUN | — |

- **CODEX:** no corrió. `codex` no está instalado y la máquina tiene WDAC activo. La voz externa
  del eng review la hizo un subagente Claude, con autorización explícita del Director (D14).
- **CROSS-MODEL:** no aplica — mismo modelo. Aun así la voz externa produjo 8 hallazgos, los 8
  verificados contra el código, y 4 revirtieron o acotaron decisiones (D6, D7, D9, D10).
- **DESIGN:** corrido contra `DESIGN.md` + `tokens.css` + medición real en el preview, sin generar
  mockups (D16): el lenguaje visual ya estaba decidido y una tercera fuente visual habría
  competido con el handoff y con la implementación viva. Cerró el gate de ancho que el eng review
  había dejado abierto, y destapó que el patrón de chips teñidos está debajo de WCAG AA en toda
  la app (16 combinaciones medidas).
- **VERDICT:** ENG + DESIGN CLEARED — listo para implementar. El gate de ancho quedó CERRADO con
  números; ya no hay que medirlo durante el paso 3, solo verificar que la implementación coincida.

NO UNRESOLVED DECISIONS
