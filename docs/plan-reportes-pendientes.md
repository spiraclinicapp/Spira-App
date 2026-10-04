# Plan — Reportes pendientes (submódulo + widget del Resumen)

Handoff: [`docs/design_handoff_reportes_pendientes/`](design_handoff_reportes_pendientes/README.md) (v2, 2026-10-03).
Revisado con `/plan-eng-review` el 2026-10-03, con segunda opinión independiente. Todas las decisiones
de abajo las tomó el Director en esa revisión; el handoff manda en todo lo que este plan no corrige
explícitamente.

## Qué se construye

1. **PR1 — Submódulo nuevo** `Coordinación › Reportes` (key `reportes-pendientes`): selector de
   estudios, tres filtros, búsqueda y una tabla con **una fila por paciente + visita** que se despliega
   en sus reportes.
2. **PR2 — Rediseño del widget** «Reportes pendientes» del Resumen de Coordinación: los pacientes más
   urgentes, desplegables, con acción compacta y un pie que lleva al submódulo.

**Sin migraciones.** Todo sale de `v_protocol_report_status` (0090 → 0144) y de la RPC
`set_report_stage`, que ya acepta cualquier etapa → cualquier etapa. La dependencia (#372,
`AtajoProtocolos`) ya está en `main`.

## Decisiones (con el porqué)

| # | Decisión | Por qué |
|---|---|---|
| D1 | **Dos PRs**: PR1 el submódulo, PR2 el widget. El tablero kanban de la ficha del protocolo **se queda**. Se saca el **ciclo del chip** (§7.4 del handoff). | El ciclo es un gesto escondido que salta de evolucionado a pendiente; «Deshacer» ya cubre la corrección. |
| D2 | **Link al portal + «Marcar descargado»**, no «Descargar». Sin link, se dice «sin link» como en `ReportCard`. | Spira sólo guarda el link: los informes viven en IQVIA/LabCorp. Un botón «Descargar» que no baja nada finge (app auditable). |
| D3 + 10A | **Vencido se decide por INSTANTE con `isOverdue`** y sólo sobre lo **sin descargar**. El día calendario AR (`isoDayAR`) sólo arma el texto «Vence en N días» / «Vence hoy». Si todo lo que falta está descargado: «Falta evolucionar», neutro. | El modal, el kanban y el submódulo tienen que decir lo mismo del mismo reporte. Decidir por día dejaba horas en que el submódulo decía «Vence hoy» y el modal «Vencido hace 13 h». (Nota: el KPI «Reportes vencidos» cuenta VISITAS `item_vencido`, otra cosa; no se toca y sigue llevando a Pendientes.) |
| D4 | **Nombre primero, IVRS en mono secundario** (no «N° paciente» en display). | Regla de identidad del 2026-08-04. `patient_code` ya es el IVRS de la inscripción (0126). |
| 1A | Tras el OK de la RPC se **parcha la etapa en memoria** (overlay `Map<visit|def, etapa>` sobre `q.data`, sin refetch). Las visitas que se cierran durante la sesión quedan en **`retenidas`** con «Todo evolucionado» / «Listo», **sin moverse de su lugar**, hasta desmontar la vista. | Con refetch la visita cerrada desaparece de golpe (contra §3) y cada clic recarga todo. `useSupabaseQuery` no expone `setData`. El overlay se limpia en el próximo fetch. |
| 2A | El widget **respeta Lo mío / Todo** (`esReporteMio`). La N del pie («Ver los N pacientes…») cuenta lo que muestra el **destino** (el submódulo, sin ámbito). | Coherencia con las demás tarjetas; el número describe a dónde se va. |
| 3A | Key **`reportes-pendientes`** (la `reportes` es de Estadísticas y `SUB_SLUG` es global). Descriptor **«Informes por evolucionar»**, medido con la fuente cargada contra 145 px (respaldo: «Informes pendientes»). URL **`?protocolo=<ids>`** con `codecs.list` + `navTarget.protocolFilter`, igual que Pendientes. Se saca «arranca abierto si se llega desde el widget» (no tiene disparador). | Un solo formato de filtro de estudio en la app. |
| 4A | El rótulo de la etapa `pendiente` pasa a **«Sin descargar» en toda la app**: `STAGE_META`, el **literal propio** de `tagDeReporte`, los aria «Volver a…» y las entradas del historial de `ReportCard`. La base sigue diciendo `pendiente`. | «Pendiente» pasa a ser la UNIDAD (sin descargar + descargado). Dos nombres para la misma etapa harían ambiguo todo el copy. |
| 5A | Colores con **`tonos.ts` / `estiloTag`** (+ variante punteada para «sin descargar») y la barra con **`color-mix` sobre tokens**. Nada de los rgba del mock. | Ya medidos AA y con versión oscura. |
| 6A | Lógica pura en **`views/track/reportes/porPaciente.ts`** (con test) y piezas React en **`views/track/reportes/piezasPaciente.tsx`**. Se borra el `ReportesCard` viejo. | Una sola copia de las reglas de plazo/conteo; `porPaciente.ts` usa `estados.ts`, no lo reescribe. |
| 7A | La fila es **`div role="button"` + `aria-expanded`** y el nombre es un **`PatientLink`** a la ficha, con la guarda de teclado de la lista de cerradas. | No se pierde el camino a la ficha que existe hoy. |
| 8A | `porPaciente.test.ts` (casos abajo), `now` fijo, fechas con `-03:00` y un caso a las **22:30 AR**. QA en el preview **sólo con TEST-QA / TEST-001**. | CI corre en UTC; los tests de fecha ya mintieron una vez. |
| 9A + 11A | `useReportesPendientes` con **columnas explícitas** y **paginado con `todasLasPaginas`**, orden estable `visit_id, report_definition_id`. El acotado en dos pasos queda en `TODOS.md`. | PostgREST corta en 1.000 filas con 200 OK (ya pasó con las visitas el 2026-09-28); hoy son ~690. |
| 12A | El widget muestra **3 filas** (`MAX_FILAS`), desplegables y con acciones. Se **mide** el alto con un paciente abierto antes de mergear PR2. | El mosaico del Resumen está medido (Reportes 271 px, desbalance 118 px en 1536×864). Esto da vuelta, a sabiendas, el «sin acciones en la tarjeta» del comentario de `ReportesCard`. |
| 13A | **Sin «visita del dd/mm»** en el renglón del informe. | La vista sólo trae `completed_at` = cuándo se tildó (`default now()`, 0064), no la fecha de la visita. Mostrarlo inventa un dato. |
| 14A | (a) «N pac.» y «Ver los N» cuentan **`patient_id` distintos**. (b) El cierre se juzga con la **lista completa antes de filtrar `esTarjeta`**, como `repartirTablero`. (c) ver 4A. (d) Una visita retenida **mantiene viva la tarjeta de su estudio** (no aparece «ya no tiene pendientes» con la fila a la vista). (e) Orden completo, abajo. (f) Mover un reporte desde el widget refresca también las alertas (KPI); cerrar el modal de visita refresca los reportes. (g) Continuaciones rotuladas con `KIND_SHORT` (límite conocido, TODO). | Hallazgos de la segunda opinión, verificados en el código. |

### Desvíos menores del mock, aceptados por reusar `AtajoProtocolos`

La tarjeta de estudio es `TarjetaProtocolo` (#372): código + **estado del protocolo**, nombre, separador,
cuerpo propio y pie. Por eso: radio 16 (no 14), padding 16/18, grilla `auto-fill minmax(260px)` (no 4
columnas fijas), seleccionado con borde de 1 px del acento + tinte (excepción ya documentada en
DESIGN.md) y **«Ver todos» como tarjeta** (decisión del Director del 2026-10-03), no como link en la
cabecera. El cuerpo es el del handoff: cifra 26 px (roja si hay algún paciente vencido), `pendientes ·
N pac.`, barra apilada y leyenda.

## Flujo de datos

```
v_protocol_report_status ──(useReportesPendientes: columnas justas + todasLasPaginas)──► rows
                                                                                          │
                overlay local  Map<visit|def, etapa>  ◄── aplicarEtapa() ◄── setReportStage() OK
                                                                                          │
                                                                                          ▼
                        agruparPorVisita(rows, retenidas)
                          · cierre juzgado con la lista COMPLETA (incluye no tildados)
                          · cerradas fuera, salvo `retenidas`; después filtra esTarjeta
                                                                                          │
              ┌───────────────────────────────────────────────────────────────────────────┼───────────────────────┐
              ▼                                                                           ▼                       ▼
   resumenPorEstudio(visitas)                                         filtrar(visitas, sel, filtros, q)   ámbito → ordenar → 3
   (tarjetas: NO miran filtros; retenidas mantienen la tarjeta)        └► ordenar() └► tabla              (widget, PR2)
```

`PacienteVisita = { visitId, protocolId, protocolCode, patientId, patientName, ivrs, visitLabel,
reportes: ReportStatusRow[], plazo: Plazo, conteo, retenida }`.

`Plazo` = `{ tipo: 'vencido'|'hoy'|'pronto'|'lejos'|'falta-evolucionar'|'sin-plazo'|'listo', dias }`.
`tipo` vencido ⇔ algún reporte sin descargar con `isOverdue` (instante); entre los no vencidos, `dias`
por día calendario AR sobre el `due_at` más temprano sin descargar: 0 → hoy, 1…3 → pronto, > 3 → lejos.
Tonos: vencido → danger/700 · hoy y pronto → warn/500 · lejos → ink-soft/500 · el resto neutro.

**Orden:** vencido (el más viejo primero) → hoy → pronto → lejos (por `due_at` asc) → falta evolucionar
→ sin plazo. Una retenida conserva su posición.

## Archivos

PR1 (submódulo)
- `src/views/track/reportes/porPaciente.ts` + `porPaciente.test.ts` — **nuevo**
- `src/views/track/reportes/piezasPaciente.tsx` — **nuevo** (barra, conteo, plazo, chip, acción)
- `src/views/track/reportes/ReportesPorPacienteView.tsx` — **nuevo** (la pantalla)
- `src/modules/registry.ts`, `src/views/registryKeys.ts`, `src/views/registry.tsx` — registro
- `src/views/track/reportes/estados.ts`, `panelDeReportes.ts`, `ReportCard.tsx` (+ tests) — «Sin descargar» (4A)
- `src/views/track/reportes/tonos.ts` — variante punteada
- `src/data/reportStatus.ts` — columnas explícitas + paginado (9A/11A)

PR2 (widget)
- `src/views/TrackResumenView.tsx` — reemplaza `ReportesCard` por el widget nuevo sobre las mismas piezas; refrescos (14f)

## Tests (`porPaciente.test.ts`)

1. agrupar: los no tildados no son fila pero **cuentan para el cierre** · 2. visita toda evolucionada
fuera · 3. …salvo en `retenidas` · 4. etapa desconocida = sin descargar · 5. vacío · 6. plazo = mínimo
`due_at` entre sin descargar · 7. sólo descargados → «Falta evolucionar» aunque el `due_at` haya pasado ·
8. `due_at` null → «Sin plazo» · 9. los cuatro tonos · 10. borde exacto `now === due_at` no vence ·
11. vence hoy 09:00, mirado 22:30 AR → **vencido** (y coincide con `isOverdue`), corriendo en UTC ·
12. vence mañana 09:00, mirado 22:30 AR → «Vence en 1 día» · 13. orden completo de arriba, retenida
quieta · 14. conteo con partes en 0 omitidas y ambas en 0 · 15. resumen por estudio: vencidos y «pac.»
cuentan PACIENTES distintos, no dependen de filtros, la retenida mantiene la tarjeta · 16. filtros: O
adentro, Y entre · 17. Antigüedad, bordes −7 y 0 · 18. búsqueda sin tildes por nombre o IVRS; opciones
de Informe = tipos presentes en lo elegido · 19. `aplicarEtapa` cambia sólo esa fila (las demás, misma
referencia). Además: actualizar los tests de `panelDeReportes` («Pendiente» → «Sin descargar»).

QA en el preview (TEST-QA): elegir/sumar/quitar estudio y la URL · los tres filtros + búsqueda + Limpiar ·
Marcar descargado / Evolucionar / Deshacer actualizan barra, conteo, tarjeta y menús al instante · el
último Evolucionar deja «Todo evolucionado» en su lugar · error de RPC deja todo igual con mensaje sereno ·
doble clic = un pedido · cuenta de sólo lectura sin botones · los dos vacíos · tema oscuro · PR2: alto
del widget con un paciente abierto en 1536×864.

## Fallas posibles en producción

| Camino | Falla realista | Test | Manejo | ¿Visible? |
|---|---|---|---|---|
| consulta | > 1.000 filas | — | `todasLasPaginas` | no aplica |
| `aplicarEtapa` | la RPC devuelve 42501 (RLS) | — | no se aplica el overlay, error sereno | sí |
| overlay | otra sesión mueve el mismo reporte | — | se corrige al volver a entrar (mismo límite que el TODO de la campana) | tarde |
| widget | el reporte se movió desde el modal | — | refresco en `onChanged` (14f) | sí |
| plazo | corte UTC vs AR | #11, #12 | vencido por instante | lo cubren los tests |
| cierre | visita con un procedimiento sin tildar | #1 | se juzga con la lista completa | no se esconde |
| selector | último paciente de un estudio retenido | #15 | la tarjeta sigue | sí |

Sin brechas críticas: ninguna falla es silenciosa y sin test ni manejo a la vez.

## NO entra

- **Paginación de la TABLA** (> 50 pacientes, §8 del handoff): con los volúmenes de hoy no hace falta; se mide en QA.
- **Plegar el selector con «Ver más»** (> 8 estudios, §8): si hace falta, va en `AtajoProtocolos` para las tres pantallas.
- **Retirar el kanban** de la ficha del protocolo (D1) · **ciclo del chip** (D1).
- **KPI «Reportes vencidos»**: sigue contando visitas `item_vencido` y llevando a Pendientes.
- **Fecha real de la visita** en el renglón (13A).
- **Acotar la consulta en dos pasos** y **rotular continuaciones** → `TODOS.md`.

## Lo que ya existe y se reusa

`useReportesPendientes` + `setReportStage` · `estados.ts` (`esTarjeta`, `esReportePendiente`,
`isOverdue`, `isStage`, la regla de cierre de `repartirTablero`) · `tonos.ts` · `AtajoProtocolos` /
`TarjetaProtocolo` / `reglasAtajoProtocolos` · `MultiFilterMenu` + `FilterBar` · `useUrlState` +
`codecs.list` · `todasLasPaginas` · `PatientLink` · `esReporteMio` / `filtrarPorAmbito` · `MAX_FILAS`.

## Paralelización

Secuencial, sin oportunidad de paralelizar: PR2 consume las piezas y el módulo puro de PR1.

## Implementation Tasks

- [ ] **T1 (P1, humano ~3 h / CC ~20 min)** — datos — columnas explícitas + `todasLasPaginas` en `useReportesPendientes`
  - Surgió de: Rendimiento 9A + segunda opinión 11A · Archivos: `src/data/reportStatus.ts` · Verificar: `npm run build`, red del navegador
- [ ] **T2 (P1, humano ~4 h / CC ~30 min)** — reglas — `porPaciente.ts` + 19 tests
  - Surgió de: 6A, D3/10A, 14A, 8A · Archivos: `src/views/track/reportes/porPaciente{,.test}.ts` · Verificar: `npm run test`
- [ ] **T3 (P1, humano ~30 min / CC ~5 min)** — copy — «Sin descargar» en toda la app
  - Surgió de: 4A + 14c · Archivos: `estados.ts`, `panelDeReportes.ts`, `ReportCard.tsx`, tests · Verificar: `npm run test`
- [ ] **T4 (P1, humano ~4 h / CC ~40 min)** — UI — piezas + `ReportesPorPacienteView` + registro + overlay/retenidas
  - Surgió de: D2, D4, 1A, 3A, 5A, 7A, 13A · Verificar: `npm run build` + QA en TEST-QA
- [ ] **T5 (P1, humano ~3 h / CC ~30 min)** — widget (PR2) — 3 filas desplegables, ámbito, pie, refrescos
  - Surgió de: 2A, 12A, 14f · Archivos: `src/views/TrackResumenView.tsx` · Verificar: medir alto en 1536×864

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | Codex no instalado; segunda opinión con subagente Claude |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 14 issues + 4 de alcance, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** la segunda opinión (subagente Claude) encontró 10 puntos; 5 se convirtieron en decisiones (10A, 11A, 12A, 13A, 14A) y corrigieron dos errores del plan (vencido por día; 9A sin paginar).
- **VERDICT:** ENG CLEARED — listo para implementar PR1.

NO UNRESOLVED DECISIONS
