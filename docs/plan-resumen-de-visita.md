# Resumen de la visita y Reportes pendientes — plan

> **Handoff:** [`docs/design_handoff_resumen_visita/`](design_handoff_resumen_visita/) (HTML desempaquetado +
> 3 capturas; el bundle original de 1,8 MB quedó afuera: traía fuentes embebidas que el repo ya tiene).
> **Revisado con `/plan-eng-review` el 2026-09-19**, con voz externa. Las 20 decisiones de abajo son del
> Director; el resto de este documento las ejecuta. Si algo de acá contradice una decisión, gana la decisión.

## Qué pide el handoff, en una línea

El panel **Procedimientos** del modal de visita se parte en dos: **Resumen de la visita** (una tira de
indicadores: cuántos procedimientos, si lleva sangre, si lleva kit IP, cuántos reportes faltan) y
**Reportes pendientes** (sólo los procedimientos que dejan reporte, con el tilde en la banda y un bloque
por reporte). La **fila de Visitas del día** suma la misma tira en versión compacta, para armar la agenda
sin abrir cada visita.

## Decisiones (2026-09-19)

| # | Tema | Decisión |
|---|------|----------|
| D1 | Procedimientos sin reporte | **Cambia la regla de cierre**: la visita cierra con los procedimientos CON reporte hechos + reportes evolucionados + IP resuelto. Los sin reporte dejan de tener tilde y dejan de frenar el «Completa». |
| D2 | Salidas del IP («No corresponde», «Se entregó en otra visita», «Deshacer») | **Se mudan a la sección «Producto en investigación» de Dispensación.** |
| D3 | «Lleva sangre» sin cargar | **Tres estados: sí / no / sin definir (`null`).** Sin definir ⇒ la gota no se dibuja. |
| D4 | Alcance | **PRs separadas + tres desvíos** (ver «Desvíos deliberados»). |
| D5 | Datos de los dos paneles | **Contenedor único**: `VisitProcedures` carga una vez y dibuja los dos paneles como hijos puros. |
| D6 | Fuente de «Kit IP» | **`v_visit_ip_status` también en la fila del día** + regla pura compartida. |
| D7 | Listado al pasar el mouse | **`usePopover` + hook de intención compartido con `InfoTip`.** Nada adentro del listado abre la visita. |
| D8 | Tachado del realizado | **Se tacha**, como el handoff (la premisa vieja —TemplatesView— ya no existe; Tareas ya tacha lo hecho). |
| D9 | Retroceder e Historial en el bloque | **Se mantienen, discretos.** |
| D10 | «informes» vs «reportes» | **«reportes» en todo.** |
| D11 | Visita sin procedimientos | **Fila: nada. Modal: el vacío explicado** (decisión del 2026-08-06). |
| D12 | Código que queda muerto | **Se borra en la PR del front.** |
| D13 | Probar la regla de cierre | **Ensayo en PGlite** con el SQL real, 4 casos + sonda de `security_invoker`, antes de pasar el archivo. |
| D14 | Consultas de la lista del día | **En paralelo**, reportes embebidos con la relación **nombrada**. |
| D15 (OV1) | Visitas ya cargadas bajo la regla nueva | **Se decide con el conteo**: antes de escribir la migración de cierre, un `SELECT` de solo lectura dice cuántas visitas pasarían a «Completa», por protocolo. Con ese número se elige entre recalcular todo y cortar por fecha. |
| D16 (OV2) | Autor en la constancia | **Sin autor**: «Descargado hoy 15:10». La base guarda el autor del ÚLTIMO movimiento —retroceder lo pisa— y nombrarlo como quien descargó sería un dato falso. El quién está en el Historial (D9). |
| D17 (OV3) | Listado en tablet | **El clic también lo abre y cierra**, como `InfoTip`. Nunca abre la visita. |
| D18 (OV4) | Números de migración | **Se toman al pushear.** Reposición parte 2 tiene reservadas la 0133 y la 0134 (ésta, destructiva, va última y se renumera al final). La regla de cierre va en **PR propia**, después del deploy del front. |
| D19 (OV5) | Carga de «lleva sangre» | **Antes de la PR 2**: Coordinación carga Sí/No en los 4 protocolos desde el editor de la PR 1. **El deploy de la PR 2 espera** a que el catálogo no muestre ningún «sin definir» en esos protocolos. |
| D20 (OV6) | Correcciones de la voz externa | Aplicadas: cruce por (estudio, procedimiento) en la fila; `security_invoker` en la vista; `IpSalidas` explica el estado; el panel del listado frena clic y teclado; dos datos corregidos. |

## Lo que ya existe (y se reusa)

| Necesidad del handoff | Ya existe | Uso |
|---|---|---|
| «N por cargar» / «reportes por cargar» | `esReportePendiente` (`reportes/estados.ts:119`) | Es literalmente la regla del §7. |
| Desmarcado bloqueado | `canUntickProcedure` (`estados.ts:163`), espejo del guard de la 0090 | Tal cual. |
| Plazos «Vence en…» / «Vencido hace…» | `dueLabel`, `isOverdue` | Tal cual. |
| Tintes AA de pendiente/vencido | `TONO_PILDORA` (`VisitProcedures.tsx:426`) | Se muda a `reportes/tonos.ts` y suma descargado/evolucionado/neutro. |
| Tilde optimista + refetch al volver a la pestaña | `VisitProcedures` (`settled`, `run`, efecto de `focus`) | Se conserva en el contenedor (D5). |
| Estado del IP, única fuente | `v_visit_ip_status` (0119) + `useVisitIpStatus` + `bumpIpEstado` | Modal y fila (D6). |
| Salidas del IP + estado en palabras | `IpDeliveryRow` (acciones + formulario), `detalleIp` | Se extrae `IpSalidas` y se monta en `SeccionIp` (D2, D20). |
| Popover por encima de todo, flip, Esc | `usePopover`, `InfoTip` (gracia WCAG 1.4.13, abre por clic en tablet) | Base del listado (D7, D17). |
| Procedimientos del día en lote | `useDayProceduresSummary` | Se reescribe (D12, D14). |
| Constancia «Descargado <fecha>» sin autor | `ReportCard.tsx:155` | Se conserva el criterio (D16). |
| Rótulo sin link de plataforma | `ReportCard` (rótulo inerte «· sin link») | Se conserva: el handoff no cubre el caso. |
| Tokens del §9 | `tokens.css` (`--spira-ink-soft #465A57`, `--spira-acc-deep-*`) | **Se usan los del repo**, no los hex del handoff (más viejos). |

## Secuencia de lanzamiento

```
Reposición: 0133 en main (su PR A)
        │  (el CI exige números contiguos: nada nuestro pasa antes)
        ▼
PR 1 ─ migración «lleva sangre» (siguiente número libre; aditiva ⇒ se aplica ANTES del deploy)
     + editor Sí/No/Sin definir + marca «sin definir» en el catálogo
        │
        ▼
Carga de sangre en LTS17231 · ACT18301 · 222714 · Victorion  (Coordinación, desde la app; audit_log)
        │  gate: el catálogo no muestra «sin definir» en esos 4
        ▼
PR 2 ─ el rediseño (modal + fila + listado + salidas del IP)   → deploy
        │
        ▼
Conteo de solo lectura (D15) → el Director elige: recalcular todo o corte por fecha
        │
        ▼
PR 3 ─ migración «regla de cierre» (siguiente número libre), aplicada JUSTO DESPUÉS de mergear.
       El archivo no se pushea antes del deploy de la PR 2 (regla de la casa).
```

Entre la PR 2 y la PR 3, las visitas con procedimientos sin reporte siguen «con pendientes» (ya no hay
tilde que los cierre). Es derivado, no se pierde nada, y dura lo que tarde el conteo.

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
   + ProcedimientosTip (hover/foco/clic)   + ReportCard variante="visita" por reporte
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
  │        select visit_def_id, protocol_id, procedure_id, suggested_order, procedure:procedures(name)
  │      protocol_procedures .in(protocol_id)   │  ← protocolos: de las filas, sin esperar a nadie
  │        select protocol_id, procedure_id, draws_blood,
  │               report_definitions!protocol_procedure_id(id)
  │    ])                                       │
  └─ useVisitsIpStatus(visitIds)  (visitIp.ts, escucha bumpIpEstado)
                                               ─┘
  armarResumenesDelDia(rows, asignaciones, pps, ips)  ← puro, con test
        · cruza SIEMPRE por (protocol_id, procedure_id): el catálogo `procedures` es global y un día
          mezcla estudios; por procedure_id solo, la sangre de un estudio se pinta en otro (D20)
        → Record<visitId, ResumenVisita | null>
  DayVisitRowItem ─► IndicadoresVisita variante="fila" (null ⇒ no dibuja nada, D11)
```

`visit_procedure_completions` sale de la consulta del día (D12): la fila ya no muestra realizados.

El embed `report_definitions!protocol_procedure_id(id)` es **el primero** de esa tabla: el comentario de la
`0111:30` («`report_definitions` NO se embebe en ningún lado») queda viejo. Quien agregue una FK nueva
entre `protocol_procedures` y `report_definitions` tiene que saber que existe; por eso va nombrado.

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

### Regla de cierre de la visita (D1) — PR 3

Hoy `v_patient_visits.computed_status` (0120, rama `realizada`) tiene tres `exists`: (1) algún procedimiento
del cuadro sin completar; (2) algún reporte sin evolucionar; (3) IP abierto en visita sellada. La migración
**saca el (1)**. Para los procedimientos CON reporte no cambia nada: uno sin tildar ya lo atrapa el (2) (su
reporte tampoco está evolucionado: `set_report_stage` exige el procedimiento realizado y el guard de la 0090
impide destildar con reportes avanzados). Queda exactamente la regla de `visitClosed` (`estados.ts:139`),
su espejo en el front.

**Lo que SÍ cambia, dicho sin rodeos** (voz externa, puntos 2 y 8):
- **Visitas ya cargadas.** Las atendidas que hoy dicen «con pendientes» sólo por un tilde sin reporte pasan a
  «Completa» (ficha, cronograma, pelotita de `dotVisual`). La casa lo evitó seis veces («una migración de
  estado no reescribe la historia», 0120). Por eso D15: primero el conteo, después la decisión. Si el
  Director elige el **corte por fecha**, la vista conserva la condición (1) para las visitas con
  `real_date` anterior a una fecha guardada por la propia migración en una tabla de una fila (sin
  placeholders: la fecha la escribe `now()` al aplicar).
- **Rastro de lo omitido.** Un procedimiento sin reporte que no se hizo deja de dejar señal en Spira. Se
  documenta como desviación de protocolo (0130) o en el eCRF del sponsor.

**Forma de la migración:** `create or replace view public.v_patient_visits with (security_invoker = true)`
**sin** `drop … cascade`. `patient_visits` no cambió desde la 0120, así que `pv.*` expande igual y la lista de
columnas es idéntica; no hay que recrear `v_track_visits` (la recreó la 0126 después; la 0130 sólo la lee).
**El `with (security_invoker = true)` es obligatorio**: `create or replace view` reemplaza las opciones de
la vista por las escritas, y sin él la vista pasa a correr con los permisos del dueño y se saltea la RLS
por protocolo, sin ningún error. Si el `create or replace` fallara por columnas, **se para** y se revisa: no
se improvisa un `cascade`. Sonda al final del archivo:
`select reloptions from pg_class where oid = 'public.v_patient_visits'::regclass;` ⇒ `{security_invoker=true}`.

## PR 1 — base (migración primero: es aditiva)

- **Migración «lleva sangre»** (número: el siguiente libre al pushear, D18): `alter table
  public.protocol_procedures add column if not exists draws_blood boolean;` sin default (`null` = sin
  definir, D3) + `comment on column`. RLS: la política «editar procedimientos del estudio» (0089) ya es
  `for all` para gerencia / track-operator, la auditoría (`trg_audit_protocol_procedures`) ya existe y la
  tabla tiene `id`. Idempotente, sin placeholders, sin dos signos peso seguidos en comentarios. Antes de
  pushear: `git grep` del número contra `origin/*` **incluyendo `docs/superpowers/plans/`** (ahí vivía la
  reserva de la 0134 que esta revisión no vio).
- **`data/protocolProcedures.ts`**: `draws_blood: boolean | null` en `EstudioProcedimiento` (+ el select)
  y `setDrawsBlood(protocolProcedureId, valor)`: `update … .select('id')`; **0 filas = sin permiso**.
- **`procedimientos/ProcedureEditModal.tsx`**: «¿Lleva extracción de sangre?» con `SegmentedControl`
  Sí / No / Sin definir. En `guardar()`: catálogo → sangre (si cambió) → reportes, cortando en el
  primer error, igual que hoy.
- **`procedimientos/ProceduresCatalog.tsx`** (P1, es el gate de D19): la gota en la lista cuando es `true`
  y «sangre sin definir» en tinta atenuada cuando es `null`.
- Índice de `supabase/README.md` al confirmarse aplicada.

## PR 2 — el rediseño

1. **Reglas puras + tests primero** (TDD):
   - `views/track/resumenVisita.ts`: `sangreDeVisita`, `llevaKitIp`, `resumenDeVisita`, `porCargar`,
     `armarResumenesDelDia`.
   - `views/track/reportes/estados.ts`: `tagDeReporte`, `sublineaProcedimiento`, `badgePorCargar`,
     `constanciaDeReporte` (sin autor, D16), `estadoPanelReportes`. Se borra `pildoraDeReportes` con sus
     tests (D12).
   - `views/track/reportes/tonos.ts`: los tintes (ex `TONO_PILDORA`), texto siempre en `--spira-acc-deep-*`
     (el `tono + tono16` falla AA; ver memoria de chips teñidos).
2. **Datos**: `useVisitProcedureStatus` suma `protocolId` y `draws_blood` (tres consultas en paralelo);
   `useDayProceduresSummary` se reescribe (D14, cruce por estudio) y pierde `done`/`total`;
   `useVisitsIpStatus(visitIds)` en `data/visitIp.ts`, escuchando `useIpVersion`.
3. **`components/useHoverIntent.ts`**: `abrir`, `cerrar`, `cerrarConGracia`, `cancelarCierre` + limpieza al
   desmontar, extraídos de `InfoTip` (que pasa a usarlo sin cambiar de comportamiento).
4. **`views/ProcedimientosTip.tsx`**: disparador `<span tabIndex={0}>` con `border-bottom: 1px dotted
   var(--spira-line-2)`, `cursor: help`, sin chevrón; `aria-describedby` al panel `role="tooltip"`. Panel
   340px, radio 14, `--spira-shadow-md`, `max-height: 300px` con scroll, viñeta de 5px, marcas (gota /
   kit / hoja) y pie con la leyenda. **Abre con hover, con foco y con clic; cierra con clic, Esc o saliendo
   con el mouse (D17).** En la fila, el disparador **y el panel** frenan `onClick` y `onKeyDown`
   (`stopPropagation`): los eventos de React atraviesan el portal, y un clic adentro del listado llegaba a
   la fila y abría la visita (D20).
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
8. **`reportes/ReportCard.tsx`**, variante `visita` (la del tablero no cambia; ver TODOS): grilla
   nombre+plataforma / tag; fila de acciones `Abrir en {plataforma}` (blanco, borde `line-2`,
   `externalLink`) + avance (fondo `--spira-track`) + Retroceder como ícono (D9); constancia a la derecha
   (`margin-left: auto`, sin autor, D16); Historial como enlace chico debajo si `history_count > 0` (D9);
   sin tildar ⇒ el aviso «Se habilita al marcar el procedimiento como realizado.»; plataforma sin link ⇒ el
   rótulo inerte de hoy. La fila de acciones envuelve a 560px.
9. **IP (D2, D20)**: `views/track/IpSalidas.tsx` sale de `IpDeliveryRow`: **el estado en palabras
   (`detalleIp`)** + acciones + formulario, mismo estado y mismas RPC. Sin el `detalleIp`, un IP abierto en una
   visita ya cerrada dice sólo «Sin constancia cargada.» (`seccionIpModel.ts:61`) y nada explica por qué la
   visita no cierra —lo que la 0120 advierte—. `SeccionIp` recibe `salidas: ReactNode | null` y
   `VisitDispensationPanel` le pasa `<IpSalidas row={ipQ.data} readOnly={readOnly} />`. Se borra
   `IpDeliveryRow`. Se corrige el comentario de `SeccionIp.tsx:127` («Deshacerlo es de la fila de
   Procedimientos»).
10. **`VisitDetail.tsx`**: la grilla sigue `1fr 1fr` (D4). Se actualiza el diagrama ASCII del comentario
    (línea 41: «Procedimientos │ Dispensación» → «Resumen + Reportes pendientes │ Dispensación»).
11. Comentarios que quedan viejos: `lib/visits.ts:279` («pendiente hoy son los procedimientos sin
    tildar…»; se corrige en la PR 3, cuando la regla cambia de verdad), cabecera de `VisitProcedures`,
    `estados.ts` (píldora), `SeccionIp.tsx:127`.

## PR 3 — regla de cierre (después del deploy de la PR 2)

1. **Conteo (D15)**, de solo lectura, para el editor de Supabase: cuántas visitas con `computed_status =
   'realizada'` quedarían `completa` sin la condición (1), por protocolo. Sin placeholders.
2. El Director elige: **recalcular todo** o **corte por fecha**.
3. Migración (número libre al pushear, D18), ensayada en PGlite (D13), con `security_invoker` y su sonda.
4. `lib/visits.ts:279` y la cabecera de `estados.ts` (espejo de la regla) al día.
5. Se aplica **justo después de mergear**; el archivo no se pushea antes del deploy de la PR 2.

## Desvíos deliberados del handoff

- **Fila del día sin reordenar** (D4): el tag del estudio sigue en el renglón de datos con su tono por
  protocolo. `ProtoTag` y `VisitCodeTag` se comparten con la cola del médico, y el Director pidió el
  2026-08-25 que se vean igual en las dos.
- **Grilla del modal `1fr 1fr`**, no `1.18fr .82fr` (D4): con 1.18/.82 Dispensación cae a ~435px, y su
  formulario de cuatro piezas por renglón necesita los ~527 de hoy.
- **Tokens del repo**, no los hex del §9 (D4).
- **Dispensación sí cambia** (D2): el handoff dice «columna derecha (Dispensación, sin cambios)», pero las
  salidas del IP y su estado en palabras se mudan ahí porque el panel donde vivían desaparece.
- **«reportes»** en la sublínea, no «informes» (D10).
- **Retroceder e Historial** siguen en el bloque (D9).
- **Constancia sin autor** (D16): «Descargado hoy 15:10», no «… · Dra. Bertossi».
- **El listado abre también con el clic** (D17): el handoff dice «no reacciona al clic»; se conserva su
  motivo —que no parezca un botón: sin chevrón ni cápsula— y en tablet el hover no existe.
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
                   · MISMO procedimiento del catálogo en DOS estudios con sangre distinta → cada visita
                     toma la de SU estudio (D20)
estados.test.ts
  tagDeReporte     los 5 estados + etapa desconocida → Pendiente · borde exacto del plazo NO es vencido
  sublineaProcedimiento  3 textos × singular/plural · tildado sin pendientes → «reportes al día»
  constanciaDeReporte    «Descargado hoy 15:10» · «Evolucionado 16 Sep» · nunca un nombre (D16)
                   · fila optimista (completed sin due_at, con eta) → ''
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

**SQL (D13)** — ensayo en PGlite con el texto real de la migración de cierre sobre un esquema de juguete:

| Caso | Esperado |
|---|---|
| Sólo procedimientos sin reporte, ninguno tildado, atendida | `completa` (o `realizada` si es anterior al corte, si se elige corte) |
| Un procedimiento con reporte sin tildar | `realizada` |
| Reportes evolucionados, IP abierto en visita sellada | `realizada` |
| Todo resuelto | `completa` |
| Sonda `reloptions` de `v_patient_visits` | `{security_invoker=true}` |

**En el navegador** (preview, QA logueado): tildar ⇒ tachado + conteo sube en badge y resumen en el
mismo gesto · destilde bloqueado con reporte descargado · procedimiento con dos reportes, estados
independientes · listado por hover, por foco (Tab) y por clic · **clic en «N proc.» y clic ADENTRO del
listado no abren la visita** · con el preview en ancho de tablet (touch emulado), el toque abre el
listado · visita sin procedimientos: la fila no dibuja tira · visita sin reportes: no hay panel · 560px
envuelve · salidas del IP desde Dispensación, con el estado en palabras, y el «Kit IP» del resumen se va al
marcar «No corresponde» · editor Sí/No/Sin definir guarda y la fila cambia · un día con dos estudios que
comparten un procedimiento · tema oscuro de los tags.

## Modos de falla

| Camino nuevo | Falla realista | ¿Test? | ¿Manejo? | ¿Se ve? |
|---|---|---|---|---|
| Sangre en la fila | procedimiento sin fila en `protocol_procedures` → afirma «Sin sangre» | sí (`armarResumenesDelDia`) | null ⇒ no se dibuja | — |
| Sangre en la fila | cruce sólo por `procedure_id` pinta la sangre de otro estudio | sí («dos estudios») | cruce por (estudio, procedimiento) | — |
| Sangre al lanzar | nadie cargó el dato: la gota no aparece nunca | — | gate D19 + marca en el catálogo | sí (catálogo) |
| Kit IP en la fila | RLS de un rol acotado devuelve 0 filas de `v_visit_ip_status` | no (el usuario de QA tiene los 5 módulos) | — | silencioso: falta «Kit IP». **Mitigación:** el modal ya lee esa vista para los mismos usuarios, así que un agujero ya se vería allá. Verificar con una cuenta de Coordinación sola si hay una a mano. |
| Panel de reportes | la consulta falla | sí (`estadoPanelReportes`) | muestra el error | sí |
| Tilde optimista | avanzar un reporte antes de que el servidor vea el tilde | — | botón inactivo mientras `pending` | sí |
| Listado en la fila | clic adentro del panel llega a la fila por el portal | QA | `stopPropagation` en el panel | sí |
| Regla de cierre | la vista pierde `security_invoker` y se saltea la RLS | sonda PGlite + sonda en el archivo | `with (security_invoker = true)` | **silencioso** sin la sonda |
| Regla de cierre | `create or replace` rechaza por columnas | ensayo PGlite | se para, sin cascade | error en el editor |
| Constancia | nombra a quien retrocedió como autor | sí («nunca un nombre») | sin autor (D16) | — |
| Popover | queda abierto al desmontar la fila (cambio de día) | — | limpieza del timer en `useHoverIntent` | — |
| Editor de sangre | RLS filtra el update | — | 0 filas = «sin permiso» | sí |

Sin brechas críticas: las dos silenciosas tienen sonda (`security_invoker`) o mitigación y verificación
manual (RLS del IP en la fila).

## Fuera de alcance

- **Reordenar la fila del día y recolorear el tag del estudio**: toca átomos compartidos con la cola del
  médico (D4). Descartado también como TODO.
- **Grilla 1.18/.82 del modal** (D4).
- **Autor del último avance en la constancia** (D16, opción B): pediría una migración que distinga avance
  de retroceso en el historial.
- **Tablero de Reportes con el lenguaje nuevo**: anotado en `TODOS.md`, espera un mock.
- **Volumen o cantidad de tubos**: el handoff lo descartó; el indicador es binario.
- **Retirar las filas de `visit_procedure_completions` de procedimientos sin reporte**: quedan como
  historia auditada; no molestan y borrarlas sería borrar registro.
- **Refresco entre sesiones** (Farmacia entrega en otra pestaña): ya está en `TODOS.md`.
- **Test permanente de SQL con PGlite** (D13).

## Paralelización

| Paso | Módulos | Depende de |
|---|---|---|
| PR 1: migración sangre + editor + catálogo | `supabase/`, `data/`, `views/track/procedimientos/` | 0133 de Reposición en main |
| Carga de sangre (Coordinación) | — (datos, desde la app) | PR 1 aplicada |
| Reglas puras + tests | `views/track/` (nuevos), `reportes/` | — |
| `useHoverIntent` + `ProcedimientosTip` | `components/`, `views/` | — |
| Salidas del IP | `views/track/`, `views/pharma/` | — |
| Contenedor + paneles + fila | `views/track/`, `views/`, `data/` | reglas, tip, PR 1 aplicada |
| PR 3: conteo + migración de cierre | `supabase/`, `lib/` | deploy de la PR 2 |

Carriles: **A** PR 1 → carga de sangre. **B** reglas puras → contenedor/paneles/fila (secuencial,
comparten `views/track/`). **C** `useHoverIntent` + tip. **D** salidas del IP (toca `views/pharma/`). B, C
y D pueden avanzar mientras A espera la 0133; B y D comparten `views/track/` (archivos distintos:
`IpSalidas.tsx` vs los paneles), conflicto bajo. **E** PR 3, al final. En la práctica la PR 2 es de una
sola persona: la paralelización sirve para ordenar, no para repartir.

## Tareas

- [ ] **T1 (P1, humano ~2 h / CC ~15 min)** — base — migración `draws_blood` nullable (número libre al pushear) + `setDrawsBlood` + editor Sí/No/Sin definir. *Verificar:* `npm run build`; guardar en el editor y releer.
- [ ] **T2 (P1, humano ~1 h / CC ~10 min)** — catálogo — marca de sangre y «sin definir» en la lista (gate de D19).
- [ ] **T3 (P1, Coordinación)** — datos — cargar Sí/No en los 4 protocolos; gate del deploy de la PR 2.
- [ ] **T4 (P1, humano ~3 h / CC ~25 min)** — reglas — `resumenVisita.ts` + adiciones de `estados.ts` + `tonos.ts`, con tests (incluidos el caso UTC y «dos estudios»). *Verificar:* `npm run test`.
- [ ] **T5 (P1, humano ~2 h / CC ~15 min)** — datos — `useVisitProcedureStatus` con sangre, `useDayProceduresSummary` en paralelo con relación nombrada y cruce por estudio, `useVisitsIpStatus`.
- [ ] **T6 (P1, humano ~2 h / CC ~15 min)** — popover — `useHoverIntent` (InfoTip lo usa) + `ProcedimientosTip` (hover/foco/clic, `stopPropagation` en disparador y panel).
- [ ] **T7 (P1, humano ~4 h / CC ~30 min)** — modal — contenedor + `ResumenVisita` + `ReportesPendientes` + `ReportCard` variante visita.
- [ ] **T8 (P1, humano ~1 h / CC ~10 min)** — fila — `IndicadoresVisita` en `DayVisitRowItem`.
- [ ] **T9 (P1, humano ~2 h / CC ~15 min)** — IP — `IpSalidas` (con `detalleIp`) en `SeccionIp`; borrar `IpDeliveryRow`.
- [ ] **T10 (P2, humano ~30 min / CC ~5 min)** — limpieza (D12) y comentarios viejos (PR 2, paso 11).
- [ ] **T11 (P1)** — QA en el navegador (lista de arriba) + `npm run build` verde.
- [ ] **T12 (P1, humano ~30 min / CC ~5 min)** — PR 3 — conteo de solo lectura para el Director (D15).
- [ ] **T13 (P1, humano ~1 h / CC ~15 min)** — PR 3 — migración de cierre según D15, `security_invoker` + sonda, ensayo PGlite (5 filas de la tabla de SQL).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | ISSUES_FOUND (subagente de Claude; Codex no instalado) | 12 hallazgos: 3 P1, 6 P2, 3 P3; los 12 incorporados (D15–D20) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES_OPEN (PLAN) | 26 issues (14 de la revisión + 12 de la voz externa), 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** la voz externa confirmó la viabilidad de `create or replace` sin cascade, la redundancia de la condición (1) para procedimientos con reporte, que nada más depende de tildar los sin reporte, y la factibilidad de D2. Discrepó en tres puntos, resueltos por el Director: visitas ya cargadas (D15), autor de la constancia (D16) y clic en tablet (D17). Agregó tres P1 que la revisión no vio: la reserva de la 0134 por Reposición (D18), el cruce entre estudios en la fila y el `security_invoker` que se pierde al reemplazar la vista (D20).
- **VERDICT:** ENG con una decisión abierta y agendada (D15, se decide con el conteo en la PR 3). PR 1 y PR 2 listas para implementar; la PR 3 espera el conteo.

**UNRESOLVED DECISIONS:**
- D15: recalcular todas las visitas o cortar por fecha — se decide con el conteo de solo lectura (T12), antes de escribir la migración de cierre.
