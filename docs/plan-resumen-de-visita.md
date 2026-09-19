# Resumen de la visita y Reportes pendientes — plan

> **Handoff:** [`docs/design_handoff_resumen_visita/`](design_handoff_resumen_visita/) (HTML desempaquetado +
> 3 capturas; el bundle original de 1,8 MB quedó afuera: traía fuentes embebidas que el repo ya tiene).
> **Revisado con `/plan-eng-review` el 2026-09-19.** Las 14 decisiones de abajo son del Director; el
> resto de este documento las ejecuta. Si algo de acá contradice una decisión, gana la decisión.

## Qué pide el handoff, en una línea

El panel **Procedimientos** del modal de visita se parte en dos: **Resumen de la visita** (una tira de
indicadores: cuántos procedimientos, si lleva sangre, si lleva kit IP, cuántos reportes faltan) y
**Reportes pendientes** (sólo los procedimientos que dejan reporte, con el tilde en la banda y un bloque
por reporte). La **fila de Visitas del día** suma la misma tira en versión compacta, para armar la agenda
sin abrir cada visita.

## Decisiones (2026-09-19)

| # | Tema | Decisión |
|---|------|----------|
| D1 | Procedimientos sin reporte | **Cambia la regla de cierre**: la visita cierra con los procedimientos CON reporte hechos + reportes evolucionados + IP resuelto. Los sin reporte dejan de tener tilde y dejan de frenar el «Completa» (0135). |
| D2 | Salidas del IP («No corresponde», «Se entregó en otra visita», «Deshacer») | **Se mudan a la sección «Producto en investigación» de Dispensación.** |
| D3 | «Lleva sangre» sin cargar | **Tres estados: sí / no / sin definir (`null`).** Sin definir ⇒ la gota no se dibuja. |
| D4 | Alcance | **Dos PRs + tres desvíos** (ver «Desvíos deliberados»). |
| D5 | Datos de los dos paneles | **Contenedor único**: `VisitProcedures` carga una vez y dibuja los dos paneles como hijos puros. |
| D6 | Fuente de «Kit IP» | **`v_visit_ip_status` también en la fila del día** + regla pura compartida. |
| D7 | Listado al pasar el mouse | **`usePopover` + hook de intención compartido con `InfoTip`.** El clic en «N proc.» no abre la visita. |
| D8 | Tachado del realizado | **Se tacha**, como el handoff (la premisa vieja —TemplatesView— ya no existe; Tareas ya tacha lo hecho). |
| D9 | Retroceder e Historial en el bloque | **Se mantienen, discretos.** |
| D10 | «informes» vs «reportes» | **«reportes» en todo.** |
| D11 | Visita sin procedimientos | **Fila: nada. Modal: el vacío explicado** (decisión del 2026-08-06). |
| D12 | Código que queda muerto | **Se borra en la PR del front.** |
| D13 | Probar la 0135 | **Ensayo en PGlite** con el SQL real, 4 casos, antes de pasar el archivo. |
| D14 | Consultas de la lista del día | **En paralelo**, reportes embebidos con la relación **nombrada**. |

## Lo que ya existe (y se reusa)

| Necesidad del handoff | Ya existe | Uso |
|---|---|---|
| «N por cargar» / «reportes por cargar» | `esReportePendiente` (`reportes/estados.ts:119`) | Es literalmente la regla del §7. |
| Desmarcado bloqueado | `canUntickProcedure` (`estados.ts:163`), espejo del guard de la 0090 | Tal cual. |
| Plazos «Vence en…» / «Vencido hace…» | `dueLabel`, `isOverdue` | Tal cual. |
| Tintes AA de pendiente/vencido | `TONO_PILDORA` (`VisitProcedures.tsx:426`) | Se muda a `reportes/tonos.ts` y suma descargado/evolucionado/neutro. |
| Tilde optimista + refetch al volver a la pestaña | `VisitProcedures` (`settled`, `run`, efecto de `focus`) | Se conserva en el contenedor (D5). |
| Estado del IP, única fuente | `v_visit_ip_status` (0119) + `useVisitIpStatus` + `bumpIpEstado` | Modal y fila (D6). |
| Salidas del IP | `IpDeliveryRow` (acciones + formulario) | Se extrae `IpSalidas` y se monta en `SeccionIp` (D2). |
| Popover por encima de todo, flip, Esc | `usePopover`, `InfoTip` (gracia WCAG 1.4.13) | Base del listado (D7). |
| Procedimientos del día en lote | `useDayProceduresSummary` | Se reescribe (D12, D14). |
| Rótulo sin link de plataforma | `ReportCard` (rótulo inerte «· sin link») | Se conserva: el handoff no cubre el caso. |
| Tokens del §9 | `tokens.css` (`--spira-ink-soft #465A57`, `--spira-acc-deep-*`) | **Se usan los del repo**, no los hex del handoff (más viejos). |

## Arquitectura

### Flujo de datos del modal

```
VisitDetail ──(visit.protocol_id)──► VisitProcedures  ← contenedor ÚNICO (D5)
                                      │  useVisitProcedureStatus(visitId, visitDefId, protocolId)
                                      │     ├─ protocol_activities (visit_def_id)   ┐
                                      │     ├─ visit_procedure_completions (visit)  ├ en paralelo
                                      │     └─ protocol_procedures (protocol_id) ── ┘ → draws_blood
                                      │  useVisitReportStatus(visitId)   (v_protocol_report_status)
                                      │  useVisitIpStatus(visitId)       (v_visit_ip_status; escucha bumpIpEstado)
                                      │  optDone / pending               (tilde optimista)
                                      │
                                      │  reportesVista = reportes con completed := doneOf(procedimiento)
                                      │  resumen = resumenDeVisita(items, ip)      ← resumenVisita.ts (puro)
                                      │  porCargar = porCargar(reportesVista)      ← UNA función, dos lugares
                                      ▼
                     ┌────────────────┴─────────────────┐
              <ResumenVisita/>                    <ReportesPendientes/>
   IndicadoresVisita variante="modal"      banda-tilde (role=checkbox) por procedimiento
   + ProcedimientosTip (hover/foco)        + ReportCard variante="visita" por reporte
   vacío ⇒ texto explicado (D11)           sin reportes ⇒ no se renderiza; error ⇒ SÍ (con el error)
```

`reportesVista` aplica el tilde optimista **una sola vez**, en el contenedor: la sublínea («Realizado · 1
reporte pendiente»), el badge y el resumen cambian en el mismo render que el tilde. Sin esto, al tildar la
sublínea diría «reportes al día» hasta que vuelve la consulta. Mientras el procedimiento está en vuelo
(`pending`), el botón de avanzar del reporte queda inactivo: la RPC rechaza avanzar un reporte de un
procedimiento que el servidor todavía no ve realizado.

### Flujo de datos de la fila del día

```
DayVisitsView (rows)
  ├─ useDayProceduresSummary(rows)            ─┐ corren a la vez (D14)
  │    Promise.all([                            │
  │      protocol_activities .in(visit_def_id)  │
  │      protocol_procedures .in(protocol_id)   │  ← protocolos: de las filas, sin esperar a nadie
  │        select procedure_id, draws_blood,    │
  │               report_definitions!protocol_procedure_id(id)
  │    ])                                       │
  └─ useVisitsIpStatus(visitIds)  (visitIp.ts, escucha bumpIpEstado)
                                               ─┘
  armarResumenesDelDia(rows, asignaciones, pps, ips)  ← puro, con test
        → Record<visitId, ResumenVisita | null>
  DayVisitRowItem ─► IndicadoresVisita variante="fila" (null ⇒ no dibuja nada, D11)
```

`visit_procedure_completions` sale de la consulta del día (D12): la fila ya no muestra realizados.

### Regla de «lleva kit IP» (D6)

`llevaKitIp(ip) = ip !== null && ip.cierre === null`. La visita tiene fila en `v_visit_ip_status` (la
vista ya decide cronograma, valor sellado y pedidos fuera de cronograma) y no la cerraron por excepción.
La entrega del IP cuenta como un procedimiento más en el total y en el listado (va primera, como hoy)
sólo cuando `llevaKitIp` es verdadero.

### Regla de sangre (D3)

`draws_blood` por procedimiento del estudio: `true` / `false` / `null`. Por visita:

```
algún procedimiento true                     → 'si'   («Lleva sangre» / «Sangre»)
todos false (y hay al menos uno)             → 'no'   («No lleva sangre» / «Sin sangre», ícono apagado)
cualquier otro caso (hay null, ninguno true) → null   → la gota NO se dibuja
```

### Estados del reporte (§7) — `tagDeReporte`

```
procedimiento sin tildar ─► Sin empezar (neutro, clock, sin acciones: aviso)
          │ tildar
          ▼
      pendiente ──(now > due_at)──► Vencido (rojo, alertCircle)
          │ Marcar descargado
          ▼
      descargado (azul #3A6B8C, download)
          │ Marcar evolucionado
          ▼
      evolucionado (verde, check) — sin avance; Retroceder sigue (D9)
```

Etapa desconocida (schema más nuevo que el front) ⇒ se trata como `pendiente`, como hoy `ReportCard`.

### Regla de cierre de la visita (D1) — 0135

Hoy `v_patient_visits.computed_status` (0120, rama `realizada`) tiene tres `exists`: (1) algún procedimiento
del cuadro sin completar; (2) algún reporte sin evolucionar; (3) IP abierto en visita sellada. La 0135
**saca el (1)**. No se pierde nada: un procedimiento CON reporte y sin tildar ya lo atrapa el (2) (su reporte
tampoco está evolucionado: `set_report_stage` exige el procedimiento realizado y el guard de la 0090 impide
destildar con reportes avanzados). Queda exactamente la regla de `visitClosed` (`estados.ts:139`), que es
su espejo en el front.

`create or replace view` **sin** `drop … cascade`: `patient_visits` no cambió desde la 0120, así que `pv.*`
expande igual y la lista de columnas es idéntica. No hay que recrear `v_track_visits` (que la 0126 y la
0130 recrearon después). Si el `create or replace` fallara por columnas, **se para** y se revisa: no se
improvisa un `cascade`.

## PR 1 — base (migración primero: es aditiva)

- **`0134_procedimiento_lleva_sangre.sql`**: `alter table public.protocol_procedures add column if not
  exists draws_blood boolean;` sin default (`null` = sin definir, D3) + `comment on column`. RLS: la
  política «editar procedimientos del estudio» (0089) ya es `for all` para gerencia / track-operator, y
  la auditoría (`trg_audit_protocol_procedures`) ya existe y la tabla tiene `id`. Idempotente, sin
  placeholders, sin dos signos peso seguidos en comentarios. **La 0133 está reservada por Reposición
  parte 2**: antes de pushear, `git grep` de los dos números contra `origin/*`.
- **`data/protocolProcedures.ts`**: `draws_blood: boolean | null` en `EstudioProcedimiento` (+ el select)
  y `setDrawsBlood(protocolProcedureId, valor)`: `update … .select('id')`; **0 filas = sin permiso**.
- **`procedimientos/ProcedureEditModal.tsx`**: «¿Lleva extracción de sangre?» con `SegmentedControl`
  Sí / No / Sin definir. En `guardar()`: catálogo → sangre (si cambió) → reportes, cortando en el
  primer error, igual que hoy.
- **`procedimientos/ProceduresCatalog.tsx`** (P2): la gota en la lista cuando es `true` y «sangre sin
  definir» en tinta atenuada cuando es `null`. Sin esto, qué falta configurar no se ve sin abrir cada
  procedimiento.
- Índice de `supabase/README.md` al confirmarse aplicada.

## PR 2 — el rediseño

1. **Reglas puras + tests primero** (TDD):
   - `views/track/resumenVisita.ts`: `sangreDeVisita`, `llevaKitIp`, `resumenDeVisita`, `porCargar`,
     `armarResumenesDelDia`.
   - `views/track/reportes/estados.ts`: `tagDeReporte`, `sublineaProcedimiento`, `badgePorCargar`,
     `constanciaDeReporte`, `estadoPanelReportes`. Se borra `pildoraDeReportes` con sus tests (D12).
   - `views/track/reportes/tonos.ts`: los tintes (ex `TONO_PILDORA`), texto siempre en `--spira-acc-deep-*`
     (el `tono + tono16` falla AA; ver memoria de chips teñidos).
2. **Datos**: `useVisitProcedureStatus` suma `protocolId` y `draws_blood` (tres consultas en paralelo);
   `useDayProceduresSummary` se reescribe (D14) y pierde `done`/`total`; `useVisitsIpStatus(visitIds)` en
   `data/visitIp.ts`, escuchando `useIpVersion`.
3. **`components/useHoverIntent.ts`**: `abrir`, `cerrar`, `cerrarConGracia`, `cancelarCierre` + limpieza al
   desmontar, extraídos de `InfoTip` (que pasa a usarlo sin cambiar de comportamiento).
4. **`views/ProcedimientosTip.tsx`**: disparador `<span tabIndex={0}>` con `border-bottom: 1px dotted
   var(--spira-line-2)`, `cursor: help`, sin chevrón; `aria-describedby` al panel `role="tooltip"`. Panel
   340px, radio 14, `--spira-shadow-md`, `max-height: 300px` con scroll, viñeta de 5px, marcas (gota /
   kit / hoja) y pie con la leyenda. Abre con hover y con foco (en tablet el toque da foco). En la fila,
   `onClick={e => e.stopPropagation()}`: no abre la visita.
5. **`views/visitAtoms.tsx`**: `IndicadoresVisita({ resumen, variante: 'fila' | 'modal', porCargar? })`.
   Ícono 14 + texto 12.5/600, `gap: 6px`, `nowrap`; separación por `gap` (fila `8px 18px`, modal `10px
   20px`), sin divisores. Se borra `ProcDots` (D12).
6. **`DayVisitRowItem.tsx`**: la tira reemplaza a `ProcDots` (`margin-top: 9px`). **La anatomía de la fila
   no cambia** (D4): el tag del estudio no sube ni cambia de color.
7. **`VisitProcedures.tsx`** (contenedor, D5) + **`ResumenVisita.tsx`** + **`ReportesPendientes.tsx`**:
   - Banda = `<button role="checkbox" aria-checked>` a todo el ancho, `min-height: 44px`, fondo
     `--spira-surface`, casilla 20×20, nombre 12.5/600 **tachado** al tildar (D8), sublínea en
     `--spira-ink-soft` (D10), gota a la derecha si `draws_blood`.
   - Bloqueado: `aria-disabled`, `cursor: default`, `title` con el motivo **y además** el aviso en línea al
     tocarla (un `title` no llega ni al teclado ni al toque). Nunca `disabled` (el foco se va al body).
   - Badge `N por cargar` (ámbar, texto `--spira-acc-deep-warn`) / `Al día` (neutro).
   - El indicador de reportes del resumen sólo aparece si la visita tiene alguna definición de reporte.
8. **`reportes/ReportCard.tsx`**, variante `visita` (la del tablero no cambia): grilla nombre+plataforma /
   tag; fila de acciones `Abrir en {plataforma}` (blanco, borde `line-2`, `externalLink`) + avance (fondo
   `--spira-track`) + Retroceder como ícono (D9); constancia a la derecha (`margin-left: auto`); Historial
   como enlace chico debajo si `history_count > 0` (D9); sin tildar ⇒ el aviso «Se habilita al marcar el
   procedimiento como realizado.»; plataforma sin link ⇒ el rótulo inerte de hoy. La fila de acciones
   envuelve a 560px.
9. **IP (D2)**: `views/track/IpSalidas.tsx` sale de `IpDeliveryRow` (acciones + formulario, mismo estado y
   mismas RPC); `SeccionIp` recibe `salidas: ReactNode | null` y `VisitDispensationPanel` le pasa
   `<IpSalidas row={ipQ.data} readOnly={readOnly} />`. Se borra `IpDeliveryRow`. Se corrige el comentario
   de `SeccionIp.tsx:127` («Deshacerlo es de la fila de Procedimientos»).
10. **`VisitDetail.tsx`**: la grilla sigue `1fr 1fr` (D4). Se actualiza el diagrama ASCII del comentario
    (línea 41: «Procedimientos │ Dispensación» → «Resumen + Reportes pendientes │ Dispensación»).
11. **`0135_regla_de_cierre_sin_procedimientos_sin_reporte.sql`**: ensayada en PGlite (D13). Se aplica
    **justo después del deploy de la PR 2**: sólo cambia qué valores ya conocidos emite la vista, así que
    ningún front se rompe en el orden inverso, pero así el tilde que desaparece y la regla que lo deja de
    pedir entran juntos.
12. Comentarios que quedan viejos: `lib/visits.ts:279` («pendiente hoy son los procedimientos sin
    tildar…»), cabecera de `VisitProcedures`, `estados.ts` (píldora), `SeccionIp.tsx:127`.

## Desvíos deliberados del handoff

- **Fila del día sin reordenar** (D4): el tag del estudio sigue en el renglón de datos con su tono por
  protocolo. `ProtoTag` y `VisitCodeTag` se comparten con la cola del médico, y el Director pidió el
  2026-08-25 que se vean igual en las dos.
- **Grilla del modal `1fr 1fr`**, no `1.18fr .82fr` (D4): con 1.18/.82 Dispensación cae a ~435px, y su
  formulario de cuatro piezas por renglón necesita los ~527 de hoy.
- **Tokens del repo**, no los hex del §9 (D4).
- **«reportes»** en la sublínea, no «informes» (D10).
- **Retroceder e Historial** siguen en el bloque (D9).
- **Vacío explicado** en el Resumen del modal (D11).
- **Botón de avance en `--spira-track`** en la variante `visita`, como el mock; el tablero conserva el
  color de la etapa de destino.
- **Desmarcado bloqueado**: además del `title`, el aviso en línea al tocar (accesibilidad).

## Tests

Criterio de la casa: se testea lo que falla **en silencio**; lo visible se verifica mirando.

```
REGLAS PURAS                                                   ARCHIVO
resumenVisita.test.ts
  sangreDeVisita   true gana · todos false → 'no' · hay null y ningún true → null · vacío → null
  llevaKitIp       null → no · cierre no_corresponde → no · entregado_en_otra_visita → no · abierto/entregado → sí
  resumenDeVisita  sin procedimientos y sin IP → null (la fila no dibuja) · sólo IP → total 1
                   el IP cuenta en el total SÓLO si llevaKitIp · orden: IP primero, después el cronograma
  porCargar        cuenta descargados · no cuenta sin tildar · el tilde optimista SUBE el conteo
  armarResumenesDelDia  dos visitas del mismo cuadro comparten asignaciones · procedimiento sin fila en
                   protocol_procedures → sangre null (nunca 'no') · visita suelta (sin visit_def_id)
estados.test.ts
  tagDeReporte     los 5 estados + etapa desconocida → Pendiente · borde exacto del plazo NO es vencido
  sublineaProcedimiento  3 textos × singular/plural · tildado sin pendientes → «reportes al día»
  constanciaDeReporte    «Descargado hoy 15:10 · Dra. Bertossi» · «Evolucionado 16 Sep · A. Duarte»
                   sin autor → sin « · » colgando · fila optimista (completed sin due_at, con eta) → ''
                   ⚠ CRÍTICO: «hoy» por DÍA ARGENTINO. Caso 22:30 AR = 01:30 UTC del día siguiente,
                   con timestamps en la forma que manda PostgREST (+00:00), no -03:00 (ver memorias de
                   CI en UTC y de test con dato de forma equivocada)
  estadoPanelReportes    cargando · error ⇒ SE MUESTRA con el error (regresión: un error no puede
                   esconder el panel) · sin filas ⇒ oculto · con filas ⇒ lista
  badgePorCargar   0 → «Al día» neutro · n → «n por cargar»
```

**Regresiones obligatorias** (cambia comportamiento existente): `porCargar` cuenta descargados igual que el
tablero; `estadoPanelReportes` no esconde por error; el guard del destilde sigue (tests existentes); los
tests de `ipEstado` siguen verdes después de mudar las salidas.

**SQL (D13)** — ensayo en PGlite con el texto real de la 0135 sobre un esquema de juguete:

| Caso | Esperado |
|---|---|
| Sólo procedimientos sin reporte, ninguno tildado, atendida | `completa` |
| Un procedimiento con reporte sin tildar | `realizada` |
| Reportes evolucionados, IP abierto en visita sellada | `realizada` |
| Todo resuelto | `completa` |

**En el navegador** (preview, QA logueado): tildar ⇒ tachado + conteo sube en badge y resumen en el
mismo gesto · destilde bloqueado con reporte descargado · procedimiento con dos reportes, estados
independientes · listado por hover, por foco (Tab) y sin reacción al clic · clic en «N proc.» no abre la
visita · visita sin procedimientos: la fila no dibuja tira · visita sin reportes: no hay panel · 560px
envuelve · salidas del IP desde Dispensación y el «Kit IP» del resumen se va al marcar «No corresponde» ·
editor Sí/No/Sin definir guarda y la fila cambia · tema oscuro de los tags.

## Modos de falla

| Camino nuevo | Falla realista | ¿Test? | ¿Manejo? | ¿Se ve? |
|---|---|---|---|---|
| Sangre en la fila | procedimiento sin fila en `protocol_procedures` → afirma «Sin sangre» | sí (`armarResumenesDelDia`) | null ⇒ no se dibuja | — |
| Kit IP en la fila | RLS de un rol acotado devuelve 0 filas de `v_visit_ip_status` | no (el usuario de QA tiene los 5 módulos) | — | silencioso: falta «Kit IP». **Mitigación:** el modal ya lee esa vista para los mismos usuarios, así que un agujero ya se vería allá. Verificar con una cuenta de Coordinación sola si hay una a mano. |
| Panel de reportes | la consulta falla | sí (`estadoPanelReportes`) | muestra el error | sí |
| Tilde optimista | avanzar un reporte antes de que el servidor vea el tilde | — | botón inactivo mientras `pending` | sí |
| 0135 | `create or replace` rechaza por columnas | ensayo PGlite | se para, sin cascade | error en el editor |
| Popover | queda abierto al desmontar la fila (cambio de día) | — | limpieza del timer en `useHoverIntent` | — |
| Editor de sangre | RLS filtra el update | — | 0 filas = «sin permiso» | sí |

Sin brechas críticas (ninguna es a la vez sin test, sin manejo y silenciosa, salvo la de RLS, que tiene
mitigación y verificación manual).

## Fuera de alcance

- **Reordenar la fila del día y recolorear el tag del estudio**: toca átomos compartidos con la cola del
  médico (D4).
- **Grilla 1.18/.82 del modal** (D4).
- **Volumen o cantidad de tubos**: el handoff lo descartó; el indicador es binario.
- **Retirar las filas de `visit_procedure_completions` de procedimientos sin reporte**: quedan como
  historia auditada; no molestan y borrarlas sería borrar registro.
- **Refresco entre sesiones** (Farmacia entrega en otra pestaña): ya está en `TODOS.md`.
- **Test permanente de SQL con PGlite** (D13).

## Paralelización

| Paso | Módulos | Depende de |
|---|---|---|
| PR 1: 0134 + editor | `supabase/`, `data/`, `views/track/procedimientos/` | — |
| Reglas puras + tests | `views/track/` (nuevos), `reportes/` | — |
| `useHoverIntent` + `ProcedimientosTip` | `components/`, `views/` | — |
| Salidas del IP | `views/track/`, `views/pharma/` | — |
| Contenedor + paneles + fila | `views/track/`, `views/`, `data/` | reglas, tip, PR 1 aplicada |
| 0135 + ensayo | `supabase/` | — |

Carriles: **A** PR 1 (sola, sale primero). **B** reglas puras → contenedor/paneles/fila (secuencial,
comparten `views/track/`). **C** `useHoverIntent` + tip (independiente). **D** salidas del IP (toca
`views/pharma/`). **E** 0135 + ensayo. B, C, D y E pueden ir en paralelo; B y D comparten `views/track/`
(archivos distintos: `IpSalidas.tsx` vs los paneles), conflicto bajo. En la práctica es un PR 2 de una
sola persona: la paralelización sirve para ordenar, no para repartir.

## Tareas

- [ ] **T1 (P1, humano ~2 h / CC ~15 min)** — base — 0134 `draws_blood` nullable + `setDrawsBlood` + editor Sí/No/Sin definir. *Verificar:* `npm run build`; guardar en el editor y releer.
- [ ] **T2 (P2, humano ~1 h / CC ~10 min)** — catálogo — marca de sangre y «sin definir» en la lista.
- [ ] **T3 (P1, humano ~3 h / CC ~25 min)** — reglas — `resumenVisita.ts` + adiciones de `estados.ts` + `tonos.ts`, con tests (incluido el caso UTC). *Verificar:* `npm run test`.
- [ ] **T4 (P1, humano ~2 h / CC ~15 min)** — datos — `useVisitProcedureStatus` con sangre, `useDayProceduresSummary` en paralelo con relación nombrada, `useVisitsIpStatus`.
- [ ] **T5 (P1, humano ~2 h / CC ~15 min)** — popover — `useHoverIntent` (InfoTip lo usa) + `ProcedimientosTip`.
- [ ] **T6 (P1, humano ~4 h / CC ~30 min)** — modal — contenedor + `ResumenVisita` + `ReportesPendientes` + `ReportCard` variante visita.
- [ ] **T7 (P1, humano ~1 h / CC ~10 min)** — fila — `IndicadoresVisita` en `DayVisitRowItem`.
- [ ] **T8 (P1, humano ~2 h / CC ~15 min)** — IP — `IpSalidas` en `SeccionIp`; borrar `IpDeliveryRow`.
- [ ] **T9 (P1, humano ~1 h / CC ~15 min)** — 0135 + ensayo PGlite (4 casos).
- [ ] **T10 (P2, humano ~30 min / CC ~5 min)** — limpieza (D12) y comentarios viejos (paso 12).
- [ ] **T11 (P1)** — QA en el navegador (lista de arriba) + `npm run build` verde.
