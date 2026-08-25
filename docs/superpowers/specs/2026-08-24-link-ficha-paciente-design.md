# Spec · El nombre del paciente lleva a su ficha, en toda la app

**Fecha:** 2026-08-24
**Autor:** Lautaro Molina (con Claude)
**Módulo:** Transversal (Coordinación / Farmacia / shell)
**Estado:** Diseño aprobado por el Director. Pendiente: review del spec → plan.
**Mock de diseño:** [`../../mock-flecha-paciente.html`](../../mock-flecha-paciente.html)
· publicado en https://claude.ai/code/artifact/f43db883-f709-4217-96be-c625fac02213

---

## 1. Objetivo

Que **donde se nombra a un paciente, se llegue a su paciente**. Hoy eso solo pasa en dos lugares
—el encabezado del modal de visita ([`VisitHeader`](../../../src/views/track/VisitHeader.tsx)) y la
fila de [`PdPatientRow`](../../../src/views/track/PdPatientRow.tsx)—; en las otras trece pantallas
que muestran nombre + IVRS, el mismo dato es texto muerto.

El pedido del Director (2026-08-24) nació de dos pantallas concretas —Alertas y Dispensación— con
la pregunta abierta de dónde más aplicaba. El relevamiento encontró trece, y la decisión fue
cubrirlas **todas**: el criterio tiene que ser uno solo, o el mismo dato se comporta distinto según
la pantalla y deja de ser aprendible.

**No hay migraciones.** Todo el dato necesario ya viaja en las filas; el único cambio de datos es
agregar `id` a dos embeds de un `select` de Farmacia.

---

## 2. Alcance

### 2.1 Las trece pantallas

**Coordinación — 8 pantallas, 9 sitios** (Alertas lleva dos listas)

| Pantalla | Archivo | Contenedor hoy |
|---|---|---|
| Alertas · lista de reportes | [`TrackAlertsView.tsx:241`](../../../src/views/TrackAlertsView.tsx) | `<button class="spira-card-link">` ⚠️ |
| Alertas · lista de visitas | [`TrackAlertsView.tsx:287`](../../../src/views/TrackAlertsView.tsx) | `<button class="spira-card-link">` ⚠️ |
| Resumen · próximas visitas | [`VisitSummaryRow.tsx:71`](../../../src/views/VisitSummaryRow.tsx) | `<button class="spira-row-link">` ⚠️ |
| Resumen · panel de alertas | [`TrackResumenView.tsx:165`](../../../src/views/TrackResumenView.tsx) | `<button class="spira-card-link">` ⚠️ |
| Visitas del día · fila | [`DayVisitRowItem.tsx:106`](../../../src/views/track/DayVisitRowItem.tsx) | `<div role="button">` ✅ |
| Visitas del día · atendidas | [`AttendedRow.tsx:36`](../../../src/views/track/AttendedRow.tsx) | `<div>` inerte ✅ |
| Para ver médico · tarjeta | [`DoctorQueueView.tsx:257`](../../../src/views/DoctorQueueView.tsx) | `<div>` con botones ✅ |
| Reportes pendientes | [`ReportCard.tsx:76`](../../../src/views/track/reportes/ReportCard.tsx) | `<div>` con botones ✅ |
| Agenda · píldora de visita | [`AgendaView.tsx:105`](../../../src/views/AgendaView.tsx) | `<button>` **solo si** `movable` ⚠️ |

**Farmacia — 4**

| Pantalla | Archivo | Contenedor hoy |
|---|---|---|
| Dispensaciones · tarjeta del tablero | [`KanbanCard.tsx:74`](../../../src/views/pharma/dispensaciones/KanbanCard.tsx) | `<div role="button">` ✅ |
| Dispensaciones · encabezado del cajón | [`DispensacionDrawer.tsx:156`](../../../src/views/pharma/dispensaciones/DispensacionDrawer.tsx) | `<div>` inerte ✅ |
| Dispensaciones · historial por días | [`HistorialPorDias.tsx:74`](../../../src/views/pharma/dispensaciones/HistorialPorDias.tsx) | `<div role="button">` ✅ |
| Estadísticas · tabla de dispensaciones | [`Tablas.tsx:155`](../../../src/views/pharma/reportes/Tablas.tsx) | `<td>` ✅ |

**Shell — 1**

| Pantalla | Archivo | Contenedor hoy |
|---|---|---|
| Campana de notificaciones | [`NotificationsMenu.tsx:138`](../../../src/shell/NotificationsMenu.tsx) | `<div>` inerte ✅ |

La cuenta de la columna derecha: **cuatro sitios** llevan `<button>` y hay que convertirlos (§5),
más el caso condicional de la Agenda. Los otros nueve aceptan el link tal como están.

### 2.2 Dónde NO va

- **Comprobante imprimible y constancia de IP.** Son documentos que se imprimen, y el paciente va
  cegado por IVRS por política, no por descuido —
  ver [`ComprobanteImprimible.tsx:12`](../../../src/views/pharma/dispensaciones/ComprobanteImprimible.tsx).
- **Modales de confirmación** (`ConfirmarAvance`, `RescheduleModal`). Son un "¿seguro?": el nombre
  está ahí para que confirmes sobre quién actuás, no para irte a otro lado a mitad de la decisión.
- **La ficha del paciente**, obviamente, y el desplegable de Nueva dispensación (es una elección,
  no un dato).

---

## 3. La flecha ↗ (diseño aprobado)

Aprobado sobre mock, en tres rondas: **una sola flecha, al costado del bloque de identidad, que
aparece solo al apuntar, con 16px de aire en los layouts apilados y 8px en los de una línea.**

### 3.1 Qué se decidió y contra qué

| Decisión | Alternativas descartadas | Por qué |
|---|---|---|
| Aparece **solo al apuntar** (o al enfocar por teclado) | Siempre visible, tenue | En una lista de veinte alertas, la marca permanente son cuarenta flechitas compitiendo con la señal que esas pantallas sí tienen que dar: el color de la severidad. |
| **Una sola** para el grupo | Una por dato · solo en el nombre | El destino no es "el nombre" ni "el número": es el paciente, que son los dos juntos. Una por dato duplica la marca; solo-en-el-nombre desbalancea el par y deja el número navegando en secreto. |
| Al **costado del bloque**, centrada | En el borde de la tarjeta | Una flecha en la esquina habla del **contenedor**, y en Alertas, Visitas del día y el tablero el contenedor lleva a la visita o a la dispensación, no al paciente. Ahí prometería el destino equivocado. |
| **16px / 8px** de aire | 10 / 2 · 22 / 14 | Con la flecha a la misma distancia que separa nombre de número (8px), se lee como un tercer dato de la fila. Despegada, se lee como el destino del grupo. A 22 / 14 flota sola en el renglón y se afloja la relación con el paciente. |

### 3.2 Reglas que la flecha no puede romper

- **Nunca se pinta de petróleo.** Marcar el hover con color rompe la regla de la casa (Director,
  2026-08-06): el color dice significado clínico, el realce dice elevación. La flecha va en
  `--spira-muted` y lo único que cambia es su opacidad.
- **Va afuera del span que se trunca.** El nombre lleva `text-overflow: ellipsis` en todas las
  listas. Adentro de ese span, la flecha se cortaría antes que el nombre; va como hermana con
  `flex: 0 0 auto`.
- **El hueco se reserva de antemano.** Lo aporta el `gap` del contenedor, presente desde el primer
  render. La flecha solo pasa de `opacity: 0` a `0.75` — nada se corre al aparecer.
- **`pointer-events: none`.** Apuntar la flecha no cuenta como apuntar el link: sin esto queda un
  blanco que se subraya pero no se puede clickear.
- **`aria-hidden`.** Es decoración: el destino ya lo dicen el `aria-label` y el `title` del link.

### 3.3 CSS

Va en [`tokens.css`](../../../src/styles/tokens.css), junto a `.spira-textlink` y
`.spira-link-group`, que es donde ya vive este vocabulario:

```css
.spira-link-arrow {
  display: inline-flex; align-items: center; flex: 0 0 auto;
  color: var(--spira-muted); opacity: 0; pointer-events: none;
  transition: opacity 0.14s var(--spira-ease-out);
}
.spira-link-group:has(.spira-textlink:hover) .spira-link-arrow,
.spira-link-group:has(.spira-textlink:focus-visible) .spira-link-arrow { opacity: 0.75; }
```

`prefers-reduced-motion: reduce` apaga la transición, no la aparición — igual que ya hacen
`.spira-card-link` y `.spira-row-link`.

Donde `:has()` no exista, la flecha nunca aparece y el subrayado sigue funcionando: se pierde el
adorno, no la navegación. Es la misma degradación que ya declara `.spira-link-group`.

### 3.4 El ícono

Entra **`arrowUpRight`** en [`Icon.tsx`](../../../src/components/Icon.tsx) (Lucide, dos trazos:
`M7 7h10v10` + `M7 17 17 7`).

No se reusa `externalLink`, que ya está en el catálogo: ese es el de "abre en otra pestaña" y acá
mentiría — no se sale de Spira.

Tamaños por contexto: **16px** en el encabezado del modal (nombre de 23px), **12px** en los
renglones de 13,5px.

---

## 4. Piezas nuevas

### 4.1 `src/components/PatientLink.tsx`

Extrae, sin cambiarle nada, el `PatientLink` que hoy vive local en
[`VisitHeader.tsx:194`](../../../src/views/track/VisitHeader.tsx): un `<button>` con
`.spira-textlink .spira-no-press`.

**Sin `onOpen` devuelve el texto pelado**, sin caja ni foco de teclado. Ese fallback es lo que hace
honesto todo lo demás: donde no hay a dónde ir, el dato queda como texto y no como un botón que no
hace nada. Se apoya en él —§7— cada caso de dato incompleto.

Se exporta también `PatientLinkArrow`, el `<span class="spira-link-arrow" aria-hidden>` con el
ícono, para que ninguna vista lo arme a mano y el tamaño quede en un solo lugar.

La composición la arma cada vista, porque los layouts son distintos y ese es su asunto: el par de
links dentro de un `.spira-link-group`, y la flecha como hermana con el `gap` del §3.1.

### 4.2 `useAbrirFicha({ module, onNavigate, volver })`

Devuelve `(patientId, protocolId) => void`, o `undefined` si no hay `onNavigate` — con lo cual el
`PatientLink` cae solo a texto.

Navega a **`module.key` + `'protocolos'`**, nunca a `'track'` fijo. Es lo que ya hace
[`DayVisitsView.tsx:509`](../../../src/views/DayVisitsView.tsx), y es lo que permite que esto
funcione en Farmacia: `pharma/protocolos` existe en
[`registry.tsx:28`](../../../src/views/registry.tsx) y comparte `ProtocolsView`, así que una
farmacéutica sin el módulo Coordinación llega igual a la ficha. Si el link apuntara a `track`,
[`AppShell.navigate`](../../../src/shell/AppShell.tsx) lo descartaría **en silencio** por
`isAllowed` y el link quedaría muerto sin decir nada.

La campana es el único caso aparte: vive en el shell, no recibe `module`, y ya toma `onNavigate` +
`isAllowed`. Ahí se navega a `track/protocolos` **con guard explícito**: sin el módulo, el nombre
queda como texto.

### 4.3 `NavTarget.protocolId` (nuevo campo, opcional)

Hoy [`ProtocolsView.tsx:167`](../../../src/views/ProtocolsView.tsx) resuelve el protocolo de
contexto tomando *el primer enrolamiento visible*. Para el buscador global no hay alternativa —un
resultado de paciente no sabe de qué protocolo hablás—, pero **las trece pantallas de este spec sí
lo saben**: el protocolo viaja en la misma fila que el nombre.

Sin pasarlo, abrir la ficha desde una alerta de un paciente enrolado en dos protocolos mostraría el
cronograma del otro. En una app clínica eso no es una molestia de navegación: es un dato equivocado
en pantalla.

El campo se usa si el paciente está enrolado en ese protocolo; si no —o si no viene—, cae a la
heurística actual. **La heurística no se toca**: sigue siendo el camino del buscador.

---

## 5. Los contenedores que hay que convertir

Cuatro sitios llevan hoy un `<button>` que abre la visita, y un `<button>` no puede contener otro
—el DOM lo desarma, no es una discusión de estilo—:

1. [`TrackAlertsView`](../../../src/views/TrackAlertsView.tsx) · lista de reportes
2. [`TrackAlertsView`](../../../src/views/TrackAlertsView.tsx) · lista de visitas
3. [`TrackResumenView`](../../../src/views/TrackResumenView.tsx) · panel de alertas
4. [`VisitSummaryRow`](../../../src/views/VisitSummaryRow.tsx)

Más [`AgendaView`](../../../src/views/AgendaView.tsx), donde la píldora es `<button>` **solo cuando
la visita es reagendable** (`movable`) y `<div>` cuando no. Se unifica al mismo patrón para que la
píldora no tenga dos anatomías según el estado.

**Pasan a `<div role="button" tabIndex={0} onKeyDown>`**, con el patrón que ya está escrito en
[`DayVisitRowItem.tsx:73`](../../../src/views/track/DayVisitRowItem.tsx) — incluida la guarda que
ahí ya existe:

```tsx
onKeyDown={(e) => {
  if (e.target !== e.currentTarget) return   // sin esto, Enter sobre el link del nombre
  if (e.key === 'Enter' || e.key === ' ') {  // abre TAMBIÉN la visita
    e.preventDefault(); onOpen()
  }
}}
```

**No hay regresión visual.** La micro-interacción global de
[`tokens.css:533`](../../../src/styles/tokens.css) matchea
`:where(button, a[href], [role='button'], summary)` — el `role="button"` ya está contemplado —, y
`.spira-card-link` / `.spira-row-link` son selectores de clase, indiferentes al tag. El levante, la
sombra y el resaltado siguen igual.

### 5.1 Arreglo que entra de arrastre

[`KanbanCard.tsx:65`](../../../src/views/pharma/dispensaciones/KanbanCard.tsx) **no tiene esa
guarda** y ya hoy tiene un botón interno de avanzar: Enter sobre él dispara la acción **y** abre el
cajón. Con links adentro empeora. Se agrega la guarda.

---

## 6. Farmacia: el embed necesita `id`

[`dispensations.ts:67`](../../../src/data/pharma/dispensations.ts) trae
`patient:patients(code, full_name)` y `protocol:protocols!protocol_id(code, name)` — sin `id`, que
es justo lo que hace falta para navegar.

```
'enrollment:enrollments!enrollment_id(patient:patients(id, code, full_name)), ' +
'protocol:protocols!protocol_id(id, code, name)'
```

Mismo cambio en `CONTEXTO_INNER`. Agregar una **columna** a un embed no toca FKs, así que no aplica
el gotcha de la 0076 (`PGRST201` por embed ambiguo): eso lo dispara una FK nueva, no un `select` más
ancho. Los embeds ya están calificados por FK y siguen estándolo.

`DispensationRequestRow` refleja los dos campos nuevos.

---

## 7. Datos: qué trae cada fuente

Verificado fuente por fuente. Todo lo necesario ya viaja:

| Fuente | Consumidores | `patient_id` | `protocol_id` |
|---|---|---|---|
| `TrackVisitRow` / `DayVisitRow` | Visitas del día, Alertas, Resumen ×2, Para ver médico, Agenda, campana | ✅ | ✅ |
| `ReportStatusRow` | Reportes pendientes, Alertas de reportes | ✅ | ✅ |
| `DispensationRequestRow` | Tablero, cajón, historial | tras §6 | tras §6 |
| `ReportDispensationRow` | Estadísticas | ✅ *nullable* | ✅ |

**Los dos casos donde puede faltar** caen al texto pelado del §4.1, nunca a un botón inerte:

- Estadísticas: `patient_id` es `string | null` (filas de dispensación sólo-IP).
- Cualquier paciente sin enrolamiento con protocolo visible: `ProtocolsView` ya lo contempla y lo
  deja en "Todos los pacientes" en vez de abrir una ficha sin contexto.

---

## 8. Pasaje de vuelta

Cada pantalla adjunta su `ReturnTo`, y **solo promete lo que puede cumplir**. La regla ya está
escrita en [`DoctorQueueView.tsx:216`](../../../src/views/DoctorQueueView.tsx): una vista que no
consume `navTarget` no puede ofrecer reabrir lo que tenías abierto, porque *prometerlo sería
mentir*.

- **Consumen `navTarget` → vuelven con la entidad**: Visitas del día (ya lo hace: visita + día) y
  Alertas (usa `useUrlEntity`).
- **No lo consumen → vuelven a la pantalla y nada más**: Resumen ×2, Para ver médico, Reportes,
  Agenda, las tres de Dispensaciones, Estadísticas, campana.

Labels **cortos y fijos** ("Volver a Alertas"), con el detalle en el `hint` — el label comparte fila
con la miga, que en la ficha de un paciente ya es larga, y uno que crezca con el nombre del paciente
le come el ancho a la ubicación.

---

## 9. Tests

El criterio del repo es testear **lo que falla en silencio** (ver la cabecera de
[`estados.test.ts`](../../../src/views/pharma/dispensaciones/estados.test.ts)). Que un link navegue
falla a la vista y se verifica mirando; no lleva test.

Lo que sí: **la resolución del protocolo de contexto**. Hoy vive inline en un `useEffect` de
`ProtocolsView` y con el §4.3 pasa a tener dos entradas. Se extrae como función pura
—`resolverFichaDestino(patient, protocolIdPedido)`— y se cubre:

1. Paciente en **dos** protocolos + `protocolId` pedido → gana el pedido, no el primero.
2. `protocolId` que el paciente **no** tiene → cae a la heurística, no devuelve un protocolo ajeno.
3. Sin `protocolId` → heurística intacta (el caso del buscador global, que no debe cambiar).
4. Paciente **sin** enrolamiento visible → `{ mode: 'all' }`, nunca una ficha sin contexto.

El caso 2 es el que justifica el test: es exactamente el modo en que esto fallaría sin ruido —
mostrando el cronograma del protocolo equivocado, con todo lo demás correcto en pantalla.

---

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Enter sobre el link abre **también** la visita | La guarda `e.target !== e.currentTarget` en los cinco contenedores convertidos, y el arreglo del §5.1 |
| La flecha se corta con el nombre truncado | Va afuera del span, `flex: 0 0 auto` (§3.2) |
| Link muerto en Farmacia por falta de rol | Se navega a `module.key`, no a `track` (§4.2); la campana lleva guard de `isAllowed` |
| Ficha abierta bajo el protocolo equivocado | `NavTarget.protocolId` (§4.3), con el caso 2 del §9 cubriéndolo |
| El chip de "Volver" sobrevive a paseos internos | Ya resuelto: `onNavigatedAway` de `ProtocolsView`. No se toca |
| Regresión visual al convertir los contenedores | Ninguna esperada (§5), pero entra en la verificación |

---

## 11. Verificación

`npm run build` verde (typecheck + tests + build) **y** revisión en el navegador, que es el gate del
proyecto. En el preview, por pantalla:

1. La flecha aparece al apuntar y **nada se corre** al aparecer.
2. El nombre **y** el número navegan, y los dos se subrayan juntos.
3. `Tab` alcanza el nombre, el número y el contenedor; `Enter` sobre el nombre abre la **ficha**,
   `Enter` sobre el contenedor abre la **visita** — nunca las dos.
4. La ficha abre bajo el protocolo **de la fila de la que saliste**.
5. El chip de "Volver" dice a dónde vuelve, y vuelve ahí.
6. Tema oscuro: la flecha se ve, y sigue sin ser petróleo.

Con nombres largos, para el truncado, y con un paciente enrolado en dos protocolos, para el §4.3.
