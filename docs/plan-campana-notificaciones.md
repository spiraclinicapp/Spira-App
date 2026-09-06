# Plan — La campana de notificaciones

**Fecha:** 2026-09-06 · **Origen:** `docs/design_handoff_notificaciones/` (handoff del 05/09/2026)
**Reemplaza:** `src/shell/NotificationsMenu.tsx` · **Migraciones:** ninguna
**Estado:** revisado con `/plan-eng-review` (12 decisiones + outside voice). Listo para implementar.

El pedido tenía dos mitades: *"la campanita se ve totalmente rota"* y *"el desplegable no tiene
ningún funcionamiento"*. El handoff ataca la primera; la segunda es literal —las filas son `<div>`
sin `onClick` y no hay forma de sacarse una alerta de encima—. Este plan hace las dos, **en un solo
PR** (decisión D8), junto con tres bugs que el handoff no vio.

---

## 1. Los tres bugs vivos (están en producción ahora)

### 1.1 El cuadrado del ícono de reportes se dibuja sin fondo

```
NotificationsMenu.tsx:166   const c = 'var(--spira-primary)'
NotificationsMenu.tsx:172   background: c + '18'    →   "var(--spira-primary)18"
```

Concatenar un sufijo de alpha sobre un `var()` produce **CSS inválido**: la declaración se descarta
en silencio y el fondo queda transparente. Las filas de visita no tienen el problema porque ahí `c`
es un hex crudo de `VISIT_STATES` y `'#A6483B' + '18'` sí es un hex de 8 dígitos válido.

**Cura:** `color-mix(in srgb, <token> 9%, transparent)`. Nunca más concatenación sobre un token.

### 1.2 Dos de las cuatro clases de alerta se anuncian con el rótulo equivocado

```
NotificationsMenu.tsx:52-56
  computed_status === 'ventana_vencida'
    ? 'Ventana vencida…'
    : 'Reporte de procedimiento fuera de plazo'
```

`useVisitAlerts` (`src/data/visits.ts:117`) trae **tres** estados —`ventana_vencida`,
`item_vencido`, `por_reprogramar`—. El ternario manda los dos últimos al rótulo de reporte. Hoy la
campana le dice al coordinador que hay un reporte de procedimiento pendiente cuando en realidad el
paciente **no se presentó**.

### 1.3 El badge tapa la campana

```
badgeStyle:  minWidth 16 + padding 0 4px (8) + border 2px × 2 (4)   con box-sizing: content-box
             →  28 × 20 px   sobre un botón de 38 × 38, anclado top:4 right:4
             →  ocupa x∈[6,34] y∈[4,24];  el ícono está en x∈[10,28] y∈[10,28]
```

El badge se come los dos tercios superiores de la campana. **Ojo:** el handoff §1 atribuye esto a que
*"el contador es un hermano del ícono en un flex, no un hijo posicionado del botón"* — **eso es falso
contra este código**. `bellBtn` tiene `position:'relative'` y el badge `position:'absolute'` desde el
primer commit (`3a9d017`). Lo que falla es el **tamaño**, no el posicionamiento. La corrección que
propone el handoff (punto de 8 px) es correcta; su diagnóstico, no.

---

## 2. Lo que YA existe y no se reconstruye

| Pieza | Dónde | Qué hace el plan con ella |
|---|---|---|
| Descarte completo: RPC `dismiss_alert` (0070/0092/0107), `dismissAlert()`, `restoreAlert()`, `DISMISS_REASONS` | `src/data/alertDismissals.ts`, `alertDismissalModel.ts` | **Se reusa tal cual.** §6 del handoff es sólo UI: cero migración, cero capa de datos |
| `DismissModal` funcionando (motivo de catálogo, "Otro" obligatorio, errores traducidos) | `TrackAlertsView.tsx:630` | Se le **extrae la regla pura** (D6); el chrome de cada pantalla queda propio |
| `PROTO_TONES` + `protoTone(id)` + `<ProtoTag>` — el color del protocolo, por hash, con contraste ya medido | `visitAtoms.tsx:16-46` | **Se reusa** para el chip de la columna de datos (D7) |
| `severidadMaxima()` + `SEVERIDAD_TINTA` + `GRAVEDAD`, con 13 tests | `alertSeverity.ts` | **Da el color del punto** (D10) y el orden |
| `priorizarAlertas()`, con test | `visitRules.ts` | Sigue ordenando el recorte por gravedad |
| `usePopover` con la cura del popover anidado (registro `abiertos`) | `components/usePopover.ts` | **Lo adopta el panel** (D3) |
| `nombreDeDestino(DESTINO_PENDIENTES)` — el pie rotulado desde el registry | `views/resumen/destinos.ts` | **Se conserva** (D4) |
| `MAX_NOTIFICACIONES` = 10 + "las N restantes" | `NotificationsMenu.tsx:16` | **Se conserva** (D4) |
| `<PatientLink>` / `<PatientLinkArrow>` | `components/PatientLink.tsx` | Siguen siendo el camino de teclado |
| `Icon` con `bell`, `clipboardCheck`, `alertCircle`, `clock`, `calendar`, `trash`, `arrowRight`, `check` | `components/Icon.tsx` | Todos existen. Cero SVG suelto |

**El handoff no nombra ninguna de estas nueve piezas.** Está escrito como greenfield y no lo es — el
mismo patrón que ya costó una reescritura en "Dispensación · orden y claridad" y en "Visitas ·
encabezado".

---

## 3. Decisiones del review

| # | Decisión | Elegido |
|---|---|---|
| D2 | Cuántas clases de alerta | **Cuatro**, ícono y color desde `VISIT_STATES` + `alertSeverity`. Se aparta de §5.2 del handoff |
| D3 | Contención del popover de descarte | **`usePopover`**, sumando el panel a su registro de contención |
| D4 | El pie y el recorte | **Se conservan** el rótulo por registry y `MAX_NOTIFICACIONES`; del handoff se toma sólo la estética |
| D5 | Tono de la fecha | **`--spira-muted`** (4,97:1 medido en el peor fondo). El guion de "sin fecha" queda en `--faint` |
| D6 | DRY del diálogo de descarte | **Regla pura extraída con test**; cada pantalla dibuja su chrome |
| D7 | Chip de protocolo | **Reusar `<ProtoTag>`** (`protoTone` por hash, texto en tinta, fondo al 24%) |
| D8 | Alcance | **Un solo PR**: los tres bugs se arreglan adentro de la reescritura |
| D9 | El tacho | **Sólo con `isAllowed('track')`** — nadie descarta lo que no puede restaurar |
| D10 | Color del punto | **`severidadMaxima()`**, no `--danger` fijo |
| D11 | Punto cuando sólo hay reportes | **Verde del tipo reporte** — cuarto grado explícito, el más bajo |
| D12 | UI optimista | **No.** Botón ocupado durante el RPC; `bumpDismissals()` ya refetchea |

---

## 4. Arquitectura

### 4.1 Flujo de datos (no cambia)

```
  v_track_visits ──┐                                        ┌── visitAlerts  (3 estados)
  (RLS por proto)  ├─→ useVisitAlerts() ────────┐           │
                   │                            ├─→ useActiveAlerts() ──→ NotificationsMenu
  v_procedure_     ├─→ useProcedureReport       │   (filtra las         │
  report_alerts ───┘   Alerts() ────────────────┤    archivadas)        ├── reportAlerts
                                                │                       │
  alert_dismissals ──→ useAlertDismissals() ────┘                       └── dismissals
         ▲                                                                     │
         │                                                                     │
         └───── dismissAlert() ──→ rpc dismiss_alert ──→ bumpDismissals() ─────┘
                (SECURITY DEFINER;                        (avisa a las 3
                 el servidor calcula el ancla)             instancias montadas)

  Los MISMOS datos alimentan la campana, el resumen de Inicio y la vista de Pendientes.
  Si los tres no cuentan igual, el badge deja de ser creíble — por eso el filtro vive
  una sola vez, en useActiveAlerts.
```

### 4.2 Máquina de estados del panel

```
                     click campana
      ┌── CERRADO ──────────────────→ ABIERTO ──┐
      │      ▲                          │  ▲    │ click tacho
      │      │  Esc / click afuera /    │  │    ▼
      │      │  navegar                 │  │  CONFIRMANDO (popover, portal a body)
      │      └──────────────────────────┘  │    │
      │                                    │    ├─ Cancelar / click afuera ─→ ABIERTO
      │                                    │    ├─ Esc ────────────────────→ ABIERTO   ⚠ ver nota
      │                                    │    └─ Descartar (motivo ok) ──→ ARCHIVANDO
      │                                    │                                     │
      │                                    └─────────────────────────────────────┘
      │                                       vuelve el RPC → refetch → la fila sale
      │                                       el PANEL SIGUE ABIERTO
      └── (nunca se cierra por descartar)

  ⚠ NOTA — §8 del handoff pide que Esc cierre "el panel y cualquier popover abierto".
    usePopover decidió lo contrario A PROPÓSITO (`conDescendienteAbierto`, línea 124):
    Esc cierra el de ADENTRO, uno por vez. Se sigue el repo, no el handoff: con la regla
    del handoff, un Esc para corregir un motivo mal elegido te tira el panel entero y el
    formulario a medio llenar.

  ⚠ EL DEFECTO QUE ESTE DIAGRAMA EVITA: el cierre del panel se decide hoy por
    `rootRef.current.contains(e.target)` (líneas 100-107). Un popover portaleado a
    document.body NO está adentro de rootRef → cada click en un motivo cierra el panel
    entero, y como cierra en el `mousedown`, la opción se desmonta antes del `click`:
    el motivo ni siquiera se elige. Es el mismo defecto que usePopover.ts:5-19 documenta
    para el calendario, medido en el navegador el 2026-08-31. Por eso D3.
```

### 4.3 La caja de alerta

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │ ┌──────┐  Jorge Pelaitay  032001500002 ↗       ┌─────────┐             │  min-height 66
  │ │ ICON │                                       │ LTS17231│  ← ProtoTag │
  │ │ 32px │  V1 — Ventana vencida el 02 Jul 2026  └─────────┘        [🗑] │
  │ └──────┘                                        02 Jul 2026        22  │
  └────────────────────────────────────────────────────────────────────────┘
     32px   │       minmax(0, 1fr)              │    76px     │   22px
            └── column-gap 11 ── padding 11 ── radio 10 ── border 1px --line

  La columna 4 se reserva SIEMPRE, con o sin hover y con o sin permiso (D9): si
  apareciera sólo a veces, las cajas no alinearían entre sí, que es el principio
  entero del diseño.

  ⚠ DESBORDE DE LA COLUMNA 3 — `protocol_code` es texto libre en la base y los
    códigos del mock son de 8 caracteres. La columna es fija de 76 px: el ProtoTag
    necesita `overflow:hidden` + `text-overflow:ellipsis`, o un código de 12+ se
    sale y pisa el cuerpo. El handoff promete "ninguna caja cambia de alto" (se
    cumple) y "todo cae en la misma vertical" (no se cumple sin esto).
```

---

## 5. El módulo de reglas puras

Dos archivos nuevos, ambos con test. Es lo único de este PR que `npm run build` puede verificar.

### 5.1 `src/data/alertDismissalModel.ts` (se AMPLÍA, no se crea)

Ya vive ahí `DISMISS_REASONS`. Se le suma la regla que hoy está inline en `DismissModal`:

```ts
/** ¿El descarte está listo para confirmarse? Motivo elegido y, si es "otro", explicación. */
export function descarteListo(reason: string, detail: string): boolean
```

Los **dos** consumidores la importan: el popover de la campana y el `DismissModal` de Pendientes. Es
DRY donde importa — si las dos copias se desincronizan, una de las dos pantallas deja archivar sin
explicación, y el motivo es lo que se lee después en la auditoría.

### 5.2 `src/shell/notificaciones.ts` (nuevo) + `notificaciones.test.ts`

```ts
/** Las cuatro clases que la campana muestra. */
export type ClaseDeAlerta = 'reporte' | 'ventana_vencida' | 'por_reprogramar' | 'item_vencido'

/** Ícono, tono y rótulo de una clase. Una sola tabla; nadie escribe un ternario propio. */
export const CLASES: Record<ClaseDeAlerta, { icono: IconName; tono: string; rotulo: string }>

/** El motivo que se lee en la segunda línea de la caja. */
export function motivoDeAlerta(a: TrackVisitRow): string

/** La fecha de la columna de datos, o null cuando no aplica (se dibuja "—"). */
export function fechaDeAlerta(a: TrackVisitRow | ProcedureReportAlertRow): string | null

/** El color del punto de la campana sobre el conjunto entero. Envuelve severidadMaxima
 *  y agrega el cuarto grado —reportes solos— que esa función no conoce (D11). */
export function tonoDelPunto(
  visitas: TrackVisitRow[],
  reportes: ProcedureReportAlertRow[],
): string | null

/** "1 pendiente" / "5 pendientes". Va acá y no inline: es la única regla nueva
 *  del handoff que se puede testear. */
export function textoDePildora(n: number): string
```

### 5.3 `SEVERIDAD_ICONO` en `alertSeverity.ts` — converge los mapeos que ya discrepan

**Al implementarlo aparecieron TRES tablas escritas a mano, no dos**, y ninguna coincidía con otra:

```
  AlertCardHeader.tsx:84          ventana_vencida → alertCircle │ item_vencido → clock │ por_reprogramar → bell
  TrackAlertsView.tsx:542         ventana_vencida → alertCircle │ TODO LO DEMÁS → clock
  PendientesProtocoloCards.tsx    ventana_vencida → alertCircle │ TODO LO DEMÁS → clock  ← y su comentario
                                  decía "el ícono espeja al de la campana"
```

Una cuarta en la campana serían cuatro verdades sobre lo mismo. Va **una sola**, en
`alertSeverity.ts`, junto a `SEVERIDAD_TINTA`:

```ts
export const SEVERIDAD_ICONO: Record<AlertSeverity, IconName> = {
  ventana_vencida: 'alertCircle',
  por_reprogramar: 'calendar',   // ← cambia respecto de las tres
  item_vencido:    'clock',
}

/** La cuarta clase, que no es una severidad de visita. El literal andaba suelto en tres pantallas. */
export const ICONO_REPORTE: IconName = 'clipboardCheck'
```

**Dos defectos que la convergencia destapó, además del ícono compartido:**

1. `TrackAlertsView` y `PendientesProtocoloCards` resolvían por DOS vías, así que **"no vino" y
   "pendiente vencido" salían con el mismo glifo**: el color los distinguía y el ícono no.
2. En `PendientesProtocoloCards`, `p.peor` es `null` cuando los únicos pendientes de un protocolo son
   **reportes**, y ese caso también caía en el reloj. Es el mismo hueco que D11 tapó en el punto de la
   campana; acá lo cierra `ICONO_REPORTE`.

**Cambio visible fuera del alcance, declarado a propósito:** `por_reprogramar` pasa de `bell` a
`calendar` en la cabecera de la tarjeta de alertas, y de `clock` a `calendar` en la lista de
Pendientes y en las tarjetas de protocolo. `bell` es además el ícono del submódulo —el que esa misma
cabecera usa para decir "ninguna alerta"—, así que el mismo glifo significaba dos cosas.
**Mirarlo en el QA visual.**

---

## 6. Cobertura de tests

```
CÓDIGO                                                  FLUJOS DE USUARIO
[~] src/data/alertDismissalModel.ts                     [+] Abrir el panel
  └── descarteListo()                                     ├── [GAP] [ojo] Punto oculto en cero
      ├── [GAP] motivo vacío → false                      ├── [GAP] [ojo] Cascada de 22 ms
      ├── [GAP] motivo + no-otro → true                   └── [GAP] [ojo] reduced-motion cancela
      ├── [GAP] otro + detalle vacío → false
      ├── [GAP] otro + sólo espacios → false            [+] Descartar una alerta
      └── [GAP] otro + detalle → true                     ├── [GAP] [ojo] Popover NO cierra el panel ← CRÍTICO
                                                          ├── [GAP] [ojo] Descartar off sin motivo
[+] src/shell/notificaciones.ts        (NUEVO)            ├── [GAP] [ojo] "Otro" despliega el campo
  ├── CLASES                                              ├── [GAP] [ojo] Esc cierra el popover, NO el panel
  │   └── [GAP] las 4 clases: ícono/tono/rótulo           ├── [GAP] [ojo] Vuelve el RPC → la fila sale
  ├── motivoDeAlerta()                    ← REGRESIÓN     └── [GAP] [ojo] Sin Coordinación NO hay tacho
  │   ├── [GAP] ventana_vencida → "Ventana vencida…"
  │   ├── [GAP] por_reprogramar → NO dice "reporte"     [+] Estados vacíos y límite
  │   └── [GAP] item_vencido    → NO dice "reporte"       ├── [GAP] [ojo] 0 alertas → "Estás al día"
  ├── fechaDeAlerta()                                     ├── [GAP] [ojo] 43 → tope 10 + "las 33 restantes"
  │   ├── [GAP] ventana → window_end                      ├── [GAP] [ojo] Nombre de 40 → elipsis + title
  │   ├── [GAP] sin ventana → estimated_date              └── [GAP] [ojo] protocol_code de 12 → no pisa
  │   └── [GAP] reporte → report_due_at
  ├── tonoDelPunto()
  │   ├── [GAP] con ventana vencida → danger
  │   ├── [GAP] sólo "no vino" → su grado
  │   ├── [GAP] sólo reportes → verde       ← D11
  │   └── [GAP] nada → null (no se dibuja)
  └── textoDePildora()
      ├── [GAP] 1 → "1 pendiente"
      └── [GAP] 5 → "5 pendientes"

[=] src/views/alertSeverity.ts
  └── SEVERIDAD_ICONO   (NUEVO)
      ├── [GAP] cubre todas las severidades de GRAVEDAD
      └── [GAP] todos los nombres existen en Icon

COBERTURA OBJETIVO: 22/22 reglas puras con test · 15 comportamientos visuales por ojo (ver TODOS.md)
```

**REGLA DE REGRESIÓN (obligatoria).** `motivoDeAlerta()` corrige un rótulo que **hoy está mal en
producción**. Sus tres tests son **CRÍTICOS** y no se negocian: los dos que afirman que
`por_reprogramar` e `item_vencido` **no** dicen "reporte" son la prueba de que el bug quedó cerrado.

---

## 7. Modos de falla

| Codepath | Falla realista | ¿Test? | ¿Manejo? | ¿Se ve? |
|---|---|---|---|---|
| Popover portaleado dentro del panel | El click en un motivo cierra el panel entero | No (visual) | **Sí** — D3, `usePopover` | Sí, ruidoso |
| `dismissAlert` | La migración no está aplicada → `PGRST202` | No | Sí, `dismissErrorMessage` lo traduce | Sí, texto sereno |
| `dismissAlert` | RLS deniega → `42501` | No | Sí | Sí |
| `dismissAlert` | Doble clic en Descartar | No | **Sí** — botón ocupado (D12) | El botón se apaga |
| `tonoDelPunto` | Sólo reportes → `severidadMaxima` da `null` | **Sí** (D11) | Sí, fallback explícito | — |
| `CLASES[status]` | Llega un `computed_status` fuera de las 4 | **Sí** | Fallback al grado más bajo, nunca `undefined.tono` | Sin fallback: **pantalla en blanco** |
| `useAlertDismissals` | La tabla no existe | No | Sí — el error no se propaga a propósito | No, y está bien |
| Columna de 76 px | `protocol_code` largo | No (visual) | **Falta** — `overflow:hidden` en el ProtoTag | Sí, pisa el cuerpo |

**Gap crítico cerrado:** `CLASES[status]` sin fallback es la única falla que sería **silenciosa y
fatal** (un `undefined.tono` desmonta el árbol y deja el topbar en blanco). Va con fallback y con test.

---

## 8. NO está en alcance

| Diferido | Por qué |
|---|---|
| **UI optimista al descartar** (§6.3) | D12: gana ~200 ms y cuesta reconciliar claves compuestas contra el refetch. El modo de falla —la fila que reaparece sola— es silencioso |
| **Render tests / `@testing-library`** | Es infraestructura de test nueva adentro de un PR que ya reescribe un componente. Capturado en `TODOS.md` |
| **Paleta por protocolo nueva** | Ya existe `PROTO_TONES`; estrenar otra sería una decisión de design system dentro de un fix |
| **Marcar como leído** | Sigue siendo fase 2, igual que en `TrackAlertsView`. El handoff no lo pide |
| **Responsive del panel** | El handoff fija 440 px y no diseña pantalla chica. No se inventa un responsive sin mock — ya costó una reescritura en este repo |
| **Auditar los 36 usos de `--spira-faint` como color** | El muestreo dice que son separadores `·` (decoración, está bien). Sin evidencia de un problema real, no se abre el barrido |
| **Regenerar el bundle de tokens del handoff** | Es coordinación con diseño, no código. Capturado en `TODOS.md` |

---

## 9. Orden de implementación

Un solo PR (D8), pero en este orden — cada paso deja el árbol verde:

```
  1. alertSeverity.ts      SEVERIDAD_ICONO + su test          ← nada depende todavía
  2. alertDismissalModel   descarteListo() + tests            ← nada depende todavía
  3. TrackAlertsView       DismissModal importa descarteListo ← el refactor ANTES del feature
  4. shell/notificaciones  el módulo puro + sus 22 tests      ← todavía sin consumidor
  5. NotificationsMenu     la reescritura, consumiendo 1-4
  6. tokens.css            .spira-notif-* : caja, cascada, reduced-motion
  7. AlertCardHeader       adopta SEVERIDAD_ICONO             ← el cambio bell → calendar
```

Los pasos 1-4 son **puro refactor y reglas**: si el 5 se complica, lo de arriba ya vale por sí solo.
Es "make the change easy, then make the easy change".

**Paralelización:** secuencial. Los siete pasos convergen en `NotificationsMenu.tsx` y tres de ellos
tocan `views/`. No hay dos carriles independientes.

---

## 10. Implementation Tasks

Sintetizadas de los hallazgos. P1 bloquea el merge; P2 va en la misma rama; P3 es seguimiento.

- [ ] **T1 (P1, human: ~20min / CC: ~3min)** — `NotificationsMenu` — reemplazar `c + '18'` por `color-mix`
  - Surgido en: §1.1 — `NotificationsMenu.tsx:172` produce CSS inválido, en producción
  - Archivos: `src/shell/NotificationsMenu.tsx`
  - Verificar: el cuadrado del ícono de un reporte pendiente tiene fondo verde tenue
- [ ] **T2 (P1, human: ~1h / CC: ~10min)** — `shell/notificaciones` — `motivoDeAlerta()` con las 4 clases + 3 tests de regresión
  - Surgido en: §1.2 — `NotificationsMenu.tsx:52-56` rotula `por_reprogramar` como reporte
  - Archivos: `src/shell/notificaciones.ts`, `src/shell/notificaciones.test.ts`
  - Verificar: `npx vitest run src/shell/notificaciones.test.ts`
- [ ] **T3 (P1, human: ~2h / CC: ~20min)** — `NotificationsMenu` — panel a `usePopover` + registro de contención
  - Surgido en: D3 / outside voice #1 — el popover portaleado cierra el panel entero
  - Archivos: `src/shell/NotificationsMenu.tsx`, `src/components/usePopover.ts`
  - Verificar: en el preview, elegir un motivo no cierra el panel
- [ ] **T4 (P1, human: ~30min / CC: ~5min)** — `alertDismissalModel` — extraer `descarteListo()` + 5 tests
  - Surgido en: D6 — la regla está inline en `TrackAlertsView.tsx:640`
  - Archivos: `src/data/alertDismissalModel.ts`, `.test.ts`, `src/views/TrackAlertsView.tsx`
  - Verificar: `npm run build`
- [ ] **T5 (P1, human: ~4h / CC: ~45min)** — `NotificationsMenu` — la reescritura: punto, grilla de 4 columnas, caja-link, tacho gateado, popover
  - Surgido en: el handoff §4-§6, con D2/D4/D5/D7/D9/D10/D11/D12 aplicadas
  - Archivos: `src/shell/NotificationsMenu.tsx`, `src/styles/tokens.css`
  - Verificar: los 15 ítems del checklist de §12, a ojo, en el preview logueado
- [ ] **T6 (P2, human: ~45min / CC: ~10min)** — `alertSeverity` — `SEVERIDAD_ICONO` y converger los dos mapeos
  - Surgido en: §5.3 — `AlertCardHeader.tsx:84` y `TrackAlertsView.tsx:542` discrepan hoy
  - Archivos: `src/views/alertSeverity.ts`, `.test.ts`, `AlertCardHeader.tsx`, `TrackAlertsView.tsx`
  - Verificar: la cabecera de "no vino" muestra `calendar`, no `bell`
- [ ] **T7 (P2, human: ~15min / CC: ~3min)** — `visitAtoms` — `overflow:hidden` + elipsis en `ProtoTag`
  - Surgido en: §4.3 / outside voice #12 — la columna de 76 px no tiene plan de desborde
  - Archivos: `src/views/visitAtoms.tsx`
  - Verificar: un `protocol_code` de 14 caracteres no pisa el cuerpo de la caja
- [ ] **T8 (P2, human: ~20min / CC: ~5min)** — `NotificationsMenu` — `aria-label` de la campana conserva el conteo
  - Surgido en: el punto reemplaza al número; §9 del handoff no lo menciona
  - Archivos: `src/shell/NotificationsMenu.tsx`
  - Verificar: el lector de pantalla sigue diciendo cuántas hay aunque el badge no lo escriba

---

## GSTACK REVIEW REPORT

| Runs | Status | Findings |
|---|---|---|
| Step 0 — desafío de alcance | issues_found | 9 piezas ya existentes que el handoff no nombra; 3 datos pedidos que no existen como el handoff cree; deriva de paleta en 3 tokens |
| 1 — Arquitectura | issues_found | 3 (D1→D7 chip de protocolo, D2 clases de alerta, D3 contención del popover) |
| 2 — Calidad de código | issues_found | 3 (D4 pie y recorte, D5 contraste de la fecha, D6 DRY del descarte) |
| 3 — Tests | issues_found | 22 reglas puras sin cobertura; 1 regresión CRÍTICA (`motivoDeAlerta`); 15 comportamientos no verificables por CI |
| 4 — Performance | issues_found | 1 (D12 UI optimista). La cascada queda acotada por `MAX_NOTIFICACIONES` |
| Outside voice (subagente Claude; codex no instalado) | issues_found | 17 hallazgos. 2 nuevos verificados por mí: el `c + '18'` inválido en prod y la existencia de `PROTO_TONES` |

**CROSS-MODEL absorbido:**

- **Tensión de alcance (outside voice #17):** argumentó que tres de los cuatro cambios son inversión
  en una superficie de tres segundos y que un parche de 20 líneas alcanza. Se presentó como D8. El
  Director eligió **un solo PR con todo**: el pedido incluía "el desplegable no tiene ningún
  funcionamiento", que el parche no resuelve. Decisión tomada, no se re-litiga.
- **Corrección propia:** en D1 afirmé que no existía color por protocolo. Falso — `PROTO_TONES` /
  `protoTone` / `<ProtoTag>` existen en `visitAtoms.tsx:16`. Se corrigió y se re-preguntó como D7.
- **Discrepancia menor con el outside voice:** dijo que el badge es 16×16. Son **28×20** —
  `content-box` + `padding 0 4px` + `border 2px`. La conclusión (está roto) es la misma.

**VERDICT:** APROBADO CON CAMBIOS. El handoff es la referencia visual; **no** es la especificación
funcional. Siete de sus afirmaciones son falsas contra este código (el diagnóstico del badge, "dos
tipos de alerta", "los reportes no tienen vencimiento", el color del protocolo, la fórmula del chip,
el nombre del destino, `--faint` cumpliendo AA) y su §8 pide explícitamente un comportamiento de `Esc`
que este repo ya rechazó. Implementar con las 12 decisiones de §3, no al pie de la letra.

**UNRESOLVED DECISIONS:**

- El cambio de ícono `bell` → `calendar` en `AlertCardHeader` para "no vino" (§5.3) es visible fuera
  del alcance de la campana. Se implementa, pero hay que mirarlo en el QA visual antes del merge.
