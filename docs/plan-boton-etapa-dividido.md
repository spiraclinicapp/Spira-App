# Plan · Botón de etapa dividido (Visitas y modal de visita)

Handoff: [`docs/design_handoff_boton_etapa/`](design_handoff_boton_etapa/) (copiado del Downloads del Director
el 2026-10-13, antes de implementar). Revisado con `/plan-eng-review` el mismo día. El Director pidió elegir
siempre la opción recomendada: cada decisión de abajo está **auto-decidida** y lleva su porqué.

## Qué cambia

El botón que avanza la etapa pasa a ser un **botón dividido**: la cara principal avanza (igual que hoy) y la
flecha abre un menú con las acciones sobre la visita. Mismo componente en la **fila de Visitas (Día)** y en la
**barra de acción del modal de visita** (que también se abre desde Estudios y pacientes → cronograma).

```
 fila de Visitas                                     barra del modal
 ┌ estado ┬ datos ─────────┬ personas ┬ acciones ──────────────────────────┐   (el ⋮ final se va)
 │ chip   │ nombre · llegó │ Coord.   │ [Atención médica] [Iniciar →|⌄]   │
 └────────┴────────────────┴──────────┴───────────────────────────────────┘

 [cara principal] ──click──► pideConfirmacion?  ──no──► avanzar (igual que hoy)
                                  │ sí (llegada y la citación ≠ hoy)
                                  ▼
                       popover «Esta visita está agendada para el 28 oct…»
                                  │ Registrar llegada hoy
                                  ▼
                       citación futura y coordina → registrar_llegada_adelantada (0155); si no, mark_arrived

 [⌄] ──► menú (portal, usePopover align:'end')
          ├ Volver a <etapa>   ──► RPC retroceder_etapa_visita (0155)        ┐ fin_atencion:
          │   (o «Pedir retest» en Completa ──► PedirRetestModal ──► register_visit_event 'retest')
          ├ Reprogramar        ──► RescheduleModal (el de la ficha)            │
          ├ Marcar / deshacer «no vino» ──► mark_no_show (lo que vivía en el ⋮) │
          ├ Copiar ID de paciente ──► portapapeles + toast «ID copiado»        │
          ├────────                                                            │
          └ Eliminar visita ──► confirmación EN el menú ──► deleteVisitEvent   ┘
```

## Step 0 · Alcance

**Lo que ya existe y se reusa (no se reconstruye):**

| Pieza del handoff | Qué existe | Uso |
|---|---|---|
| Avanzar etapa | `NEXT_STEP`, `advanceRole`, `markArrived`/`startVisitAttention`/`markReady`, `ConfirmarAvance`, aviso al finalizar | Igual que hoy |
| Reprogramar | `RescheduleModal` (el de «Reprogramar» del encabezado de la ficha) | El ítem lo abre |
| Copiar ID | `navigator.clipboard` (ya en el ⋮) | + toast |
| No vino | `markNoShow` (ya en el ⋮) | Pasa al menú |
| Eliminar | `deleteVisitEvent` + policy «track borra visitas sueltas» (0022) + guardas 0144/0145 | Sólo sueltas |
| Pedir retest | `register_visit_event(..., 'retest', p_retest_of)` (0145), `procedimientosRepetibles`, `visitasParaRetest`, `CasillasDeProcedimientos` | Mismo RPC y mismas reglas |
| Menú | `usePopover` (portal, Esc, click afuera, `hayPopoverAbierto`), `.spira-menu-item`, `teclasDelMenu` | Base del menú |
| Toast | `components/Toast.tsx` | Confirmaciones |

**Lo que falta en el backend:** no hay RPC para **retroceder una marca** (deuda anotada en `TODOS.md`,
«Visitas · retroceder una etapa…», parte (a)) ni para **marcar la llegada moviendo la citación** en un solo
paso. Van en la migración **0155**, aditiva.

**Complejidad:** toca más de 8 archivos y suma dos componentes (botón dividido + popup de retest). Se evaluó
partir en dos PRs (UI con lo existente / migración + retest). **D1 → una sola PR** (recomendada): el costo
marginal es bajo, el Director la pidió entera y la migración es aditiva (no rompe nada desplegado); el camino
diario (llegada del día) no depende de ella.

## Decisiones (todas auto-decididas con la recomendada)

**D1 · Alcance completo en una PR.** Ver arriba.

**D2 · «Volver a la etapa anterior» = RPC `retroceder_etapa_visita(p_visit_id, p_desde)` (0155).**
- Quién: **el mismo rol que hace la marca, la deshace.** Llegada → recepción (gerencia o track operator+,
  como `mark_arrived`); inicio de atención → quien coordina el estudio o gerencia (como
  `start_visit_attention`). Era lo que bloqueaba el TODO («qué rol puede deshacer una marca»): el handoff del
  Director es esa decisión, y la regla simétrica no habilita a nadie que hoy no pueda marcar.
- `p_desde` es la etapa que la pantalla mostraba: si ya cambió (otra pestaña, doble click), la base rechaza en
  vez de retroceder dos etapas.
- Qué borra: `concurrio_al_centro` → `arrived_at`; `inicio_atencion` → `real_date` + `attended_at` (la etapa
  se deriva de `real_date`, 0068/0069). El coordinador sellado por la 0102 queda (no se sabe cuál había antes).
- Destino nombrado: desde En atención vuelve a **Concurrió** si hay llegada, o a **Por llegar** si no (visitas
  viejas fechadas sin marcar la llegada). «Volver a …» siempre nombra el destino real.
- Desde **Completa no se vuelve** (el handoff pone «Pedir retest» en ese lugar).
- **Guardas** (la base rechaza con un mensaje en castellano): procedimientos marcados como realizados, pedido de
  dispensación, IP entregado o cerrado, retest o continuación que dependen de esta visita, y —al deshacer la
  llegada— atención médica pedida o ya dada. Volver atrás nunca deja registros huérfanos de algo que «no pasó».
- Reemplaza el anexo «retroceder» del TODO; el **historial** (parte b) sigue pendiente.

**D3 · Registrar la llegada fuera de fecha mueve la citación a hoy (RPC `registrar_llegada_adelantada`; ajustada después de la revisión, ver abajo).**
Recomendado por un motivo concreto: `motivosDelDia` mantiene la citación cuando la llegada es ANTERIOR al día
citado, así que sin mover la fecha la visita aparecería hoy (llegó) y también el 28 (como si se la esperara).
Atómico en la base porque `mark_arrived` lo puede hacer cualquier operador y la fecha sólo quien coordina (RLS):
en dos llamadas quedaba a medias. Si la citación ES hoy, sigue el `mark_arrived` de siempre, así el camino diario
no depende de la 0155. La confirmación va en el mismo lugar que el menú (popover), en la fila y en el modal.
Para Iniciar / Finalizar fuera de fecha, el modal sigue con `ConfirmarAvance` (sin cambios, como dice el handoff).

**D4 · Eliminar sólo visitas sueltas.** La base no deja borrar las del cronograma (policy de la 0022: programadas
y randomización no). En ésas el ítem va deshabilitado con su porqué («Las visitas del cronograma no se borran»).
Mostrarlo habilitado y que la base lo rechace sería un botón que miente.

**D5 · «Pedir retest» = popup sobre el mismo RPC del alta manual.** Procedimientos = `procedimientosRepetibles`
de esa visita (lo hecho), **sin preselección** (decisión 9 del spec de la 0145: no se sabe qué salió mal; la
columna «resultado» del mock no existe en el modelo y no se inventa). Motivo: chips del mock guardados al frente
de la nota («Motivo: Muestra no válida. …»): no hay columna y la lista está «a validar» (handoff §6), así que no
se le da schema todavía. Cuándo: Hoy · Próxima visita (la próxima del cronograma sin atender, si hay) · Elegir
fecha. Mismo límite que el alta manual: visita atendida en los últimos 60 días e inscripción en curso; si no,
el ítem va deshabilitado con el porqué. La lista de casillas es `CasillasDeProcedimientos` con una variante
`lista` (filas con borde, como el mock): un solo componente para los cinco modales que eligen procedimientos.

**D6 · Lo que vivía en el ⋮ pasa al menú.** «Marcar como no vino» / «Deshacer “no vino”» entran después de
Reprogramar. En rojo sólo Eliminar (el handoff reserva el rojo para eso). Con «no vino» la cara principal sigue
siendo **Reprogramar** (decisión del handoff de calendario).

**D7 · Variantes del botón.** Completa → botón secundario «Acciones». Sin permiso para avanzar → la cara
principal se ve apagada con la pista de quién lo hace (antes, hueco o bloque punteado). Modal de solo lectura
(rol sin operación en Coordinación) → queda el candado de hoy.

**D8 · Token `--spira-track-hover: #256A62`** (el del handoff). La base del botón es el `accentSolid` de
Coordinación (#2B766D, AA), no el #2E7D74 del mock, por el mismo motivo AA que ya documenta `VisitActionBar`.

**D9 · Colores del mock → tokens de la app.** El mock usa #7C8C87 / #A6B0AC / #556966; la app los tiene
oscurecidos para AA (`--spira-muted` / `--spira-faint` / `--spira-ink-soft`). Se usan los tokens.

**D10 · Numeración.** La 0155 la tenía prevista el plan de tutoriales (T6, bucket) y todavía no existe. Se toma
acá; si T6 llega después, CI (`check-migraciones`) la frena por número repetido y pasa a 0156. Avisado en la PR.

## Revisión

**1 · Arquitectura.** Lógica de qué ofrece el menú en un módulo puro (`accionesDeVisita.ts`) usado por la fila
y el modal: si cada pantalla decidiera sola, dirían cosas distintas del mismo permiso (el motivo de
`visitPermissions`). Las mutaciones nuevas viven en `data/dayVisits.ts`. El modal ejecuta sus acciones él
mismo (como `avanzarAhora`), porque se abre desde siete pantallas. Falla realista: front desplegado antes de la
0155 → «Volver» y la llegada fuera de fecha devuelven PGRST202; se traduce a «Falta aplicar una actualización
de la base (0155)». El orden correcto es **migración primero** (aditiva).

**2 · Calidad.** DRY: el menú y sus reglas son uno; el popover reusa `usePopover`; las casillas reusan el
componente compartido. Diagramas en código: el comentario de `VisitActionBar` y el del `VisitDetail` hablan
del «anexo con chevron» que no estaba — se actualizan. El ⋮ de la fila y su `accionesDe` se borran.

**3 · Tests** (vitest; criterio de la casa: lo que falla en silencio).

```
accionesDeVisita.ts
  ├ itemVolver(stage, visita)      destino real (Concurrió vs Por llegar), bajada con hora, deshabilitado en la 1ª
  ├ itemReprogramar                sólo Por llegar; bajada «Hoy para el …» / «Ya concurrió» / «completa»; sin permiso
  ├ itemNoVino                     marcar / deshacer / ausente según etapa y marca
  ├ itemEliminar                   suelta sí; cronograma/randomización no; sin permiso
  ├ itemRetest                     sólo Completa; >60 días; inscripción fuera de curso; sin permiso
  ├ itemCopiar                     sin IVRS → deshabilitado
  └ pideConfirmarLlegada(v, hoy)   por_llegar y citación ≠ hoy (incluye null) → sí; hoy → no; otras etapas → no
retest
  ├ notaDelRetest(motivo, comentario)   compone / omite vacíos
  └ proximaVisitaDe(visitas, origen, hoy) la próxima del cronograma sin atender, misma inscripción
SQL (banco PGlite): retroceder y registrar_llegada_adelantada — cada transición, cada guarda, p_desde viejo, permisos
```

Flujos de usuario (verificación en el navegador, no test): abrir/cerrar el menú con mouse y teclado (Enter/↓,
↑/↓ con vuelta, Esc devuelve el foco), confirmar eliminación en el menú, popover de llegada, popup de retest,
fila sin ⋮ en los tres anchos.

**4 · Performance.** El menú se monta sólo abierto (no 60 menús por día). El popup de retest consulta
procedimientos y visitas del paciente sólo al abrirse. Sin N+1: no se agrega ninguna consulta por fila.

## Después de la revisión externa y del review de código (2026-10-14)

La segunda opinión (subagente independiente) y el review de código cambiaron cinco cosas, todas con la
opción recomendada:

- **D2 · sólo marcas del mismo día.** Deshacer el inicio de una visita vieja borraba su `real_date`:
  volvía a encender la ventana vencida, bajaba los KPI y le devolvía la fecha a `sync_protocol_schedule`.
  Un inicio sin sello (anterior a la 0102) tampoco se deshace.
- **D3 · se mueve sólo la citación FUTURA**, con una RPC renombrada a `registrar_llegada_adelantada` que
  guarda la citación anterior (`citacion_antes_de_adelantar`) y la devuelve si la llegada se deshace. Una
  citación pasada no se toca (#460: llegar tarde la da por cumplida). Si hoy cae fuera de la ventana, la
  confirmación lo dice. Permiso: el de mover fechas (gerencia o quien coordina el estudio); el resto de
  Recepción registra la llegada sin mover la fecha, como antes.
- **Guarda de dispensación** sólo con un pedido preparándose o atendido: uno solicitado se puede hacer antes
  de que el paciente llegue y no tiene por qué frenar deshacer una llegada equivocada.
- **Permiso `coordina`** (coordinar ESE estudio, sin el atajo de admin) para deshacer el inicio y para
  adelantar: `canClinical` deja pasar a un admin que no coordina y la base lo rechazaría.
- **`AvisoGlobal`**: el aviso al pie vive en el shell, porque «Eliminar» desde el modal lo cierra.

Se mantuvo el handoff en un punto que la revisión cuestionó: **borrar visitas sueltas completas** (el
handoff lo pide explícito; la base ya frena las que tienen procedimientos, continuación o retest, y todo
queda en `audit_log`). Y quedó afuera, a propósito: restaurar el «No vino» que borra la llegada
adelantada al deshacerla (caso muy raro; la marca queda en `audit_log`).

## NOT in scope

- **Historial de la visita** (parte b del TODO): exponer `audit_log` fuera de gerencia es una decisión de
  gobernanza, no de UI.
- **Columna `motivo` del retest** y resultado por procedimiento: la lista está a validar (handoff §6).
- **Retroceder desde Completa** (deshacer el fin de atención): el handoff no lo pide.

## Implementation Tasks

- [ ] **T1 (P1)** — base — migración 0155 (`retroceder_etapa_visita`, `registrar_llegada_adelantada`) + índice + banco PGlite
- [ ] **T2 (P1)** — reglas — `accionesDeVisita.ts` + test
- [ ] **T3 (P1)** — UI — `BotonEtapa` (split + menú + confirmaciones + teclado) + CSS + token
- [ ] **T4 (P1)** — fila — `DayVisitRowItem` sin ⋮, `DayVisitsView` cablea acciones + toasts
- [ ] **T5 (P1)** — modal — `VisitActionBar` + `VisitDetail` cablean las mismas acciones
- [ ] **T6 (P1)** — retest — `PedirRetestModal` + variante de casillas + test de nota/próxima visita
- [ ] **T7 (P2)** — docs — `TODOS.md` (parte a resuelta), `supabase/README.md`

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 10 decisiones, todas auto-decididas con la recomendada; 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **VERDICT:** ENG CLEARED — listo para implementar.

NO UNRESOLVED DECISIONS
