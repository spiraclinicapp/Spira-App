# Handoff: Resumen de Coordinación — mosaico — Spira

## Overview
Reestructura del **Resumen de Coordinación** (`track` › `resumen`, hoy `src/views/TrackResumenView.tsx`). Reemplaza los 4 KPIs + próximas visitas + alertas por un **mosaico de 6 bloques** en grilla de 3 columnas:

| Bloque | Ancho | Qué muestra |
| --- | --- | --- |
| **Tu día** | 1 col × 2 filas | Las visitas de hoy con su estado operativo |
| **Ahora mismo** | 1 col | En sala de espera / con el médico + espera más larga |
| **Atajos** | 1 col | 4 acciones, lista vertical |
| **Pendientes de cierre** | 2 col | Checklist con progreso |
| **Pedidos de medicación** | 1 col | Pedidos de tus protocolos y su estado |
| **Lo prioritario** | 2 col | Alertas vigentes con acción por fila |

**Decisión de fondo:** este resumen es **de Coordinación, no de Inicio.** Los pendientes de cierre, la sala de espera y los pedidos de medicación son del coordinador; a Farmacia o Laboratorio no le dicen nada. El Resumen de Inicio queda pendiente de definición (ver *Qué falta decidir*).

## About the Design Files
`reference/ResumenTrack.dc.html` es la **fuente visual**: markup con estilos inline y tokens reales, abrible en el navegador. **No es código de producción.** Recrear en React dentro de `src/views/` con los componentes, hooks y convenciones que ya existen (`Icon`, `EmptyState`, `VisitChip`, `.spira-row-link`, `card`/`cardTitle`/`btnOutline` de `TrackResumenView`).

El archivo contiene, además del mosaico completo, **tres tratamientos de la tarjeta de medicación** al pie (estado por chip / botón "Ver visita" / sin pedidos abiertos). El elegido para producción es el **1 (chip por fila)**; los otros dos quedan como referencia de estados alternativos.

## Fidelity
**Alta fidelidad** en colores, tipografía, medidas, radios y jerarquía. Los **datos son de muestra**. El shell (top bar, rail, panel de submódulos, breadcrumb) se dibujó solo como contexto: **no se toca nada de `AppShell.tsx`**.

## Grilla
```
display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:14px
```
- **Tu día**: `gridRow: span 2`, `display:flex; flexDirection:column` y el link del pie con `marginTop:auto` (empareja la altura contra Ahora mismo + Atajos).
- **Pendientes de cierre** y **Lo prioritario**: `gridColumn: span 2`.
- Orden en el DOM: Tu día · Ahora mismo · Atajos · Pendientes · Medicación · Lo prioritario.
- Tarjeta base: la constante `card` que ya existe (`white` + `1px line` + `radius-lg` + `18px 20px`).

## Bloques, uno por uno

### Tu día
Fuente: `useVisitsForDay(todayISO())` — el mismo hook que usa `InicioResumenView`, con **el mismo orden** (llegados primero por `arrived_at` asc, pendientes al final).

Cada fila: punto de color 7px + nombre del paciente + rótulo de estado a la derecha; debajo, `visitTitle(v)` + `protocol_code` en 12.5px `ink-soft`, con `padding-left:15px` para alinear bajo el nombre.

Color del punto y rótulo salen del estado operativo que ya define `visitStates.tsx` (`OperationalStageChip`): esperando → `warn` / `acc-deep-warn`; con el médico → `track` / `primary`; sin empezar → `faint` / `muted`; finalizada → `good`, pero **el rótulo en `ink-2`, no en `good`** (el verde a 11.5px no llega a AA).

Fila pulsable → `onNavigate('track','visitas',{ visitId, visitDate })`. Usar `rowButton` + `className="spira-row-link spira-no-press"`.

### Ahora mismo
Dos números grandes (`font-display` 700, 38px, `-.03em`) separados por una regla de 1px × 44px: **en sala de espera** (`acc-deep-warn`) y **con el médico** (`ink`). Al pie, tras un `border-top`: la espera más larga en minutos y de quién.

Se deriva de las mismas visitas del día: `arrived_at` presente y sin pasar al médico → esperando; en atención → con el médico. La espera más larga es `now - min(arrived_at)` de los que esperan. Si nadie espera, la línea del pie se omite (no poner "0 min").

### Atajos
Lista vertical, `gap:8`, ítems de `11px 13px` con borde `line`, radio 12, ícono en el acento del módulo. Los cuatro: **Nueva visita · Registrar llegada · Buscar paciente · Cargar procedimientos**. Son los del coordinador; no aparece "Nueva dispensación".

El `+` del encabezado (personalizar) es **decorativo por ahora** — dejarlo sin acción o quitarlo hasta que exista la preferencia.

### Pendientes de cierre
Checklist con barra de progreso en el encabezado (`120×6`, radio 999, relleno en el acento) y "N de M hechas". Cada ítem: checkbox 18×18 (radio 6, borde `line-2`; hecho = relleno acento + check blanco), título 13.5/600, sub 12px `ink-soft`, y a la derecha un chip de plazo (`vence el DD/MM` en ámbar · `atrasada` en rojo · `sin fecha` en texto plano). Los hechos van con `text-decoration:line-through` y texto `muted`.

⚠️ **No hay fuente de datos.** No existe tabla de tareas. Dos caminos:
1. **Derivarlos** de lo que ya está en el schema — visitas sin firmar, alertas de ventana vencida, constancias de IP faltantes (`ipDocuments.ts`) — y componer la lista en el cliente. El check sería el atajo a la acción, no un estado persistido.
2. **Crear la tabla** (`tasks`: título, tipo, entidad relacionada, due date, done_at, asignado) y un hook `useClosingTasks()`.

Recomiendo (1) para la primera versión: sin tabla nueva, y todos los ítems son accionables porque apuntan a algo real.

### Pedidos de medicación
El bloque nuevo. **Qué pide el coordinador:** ver los pedidos de medicación de **sus protocolos asignados** y en qué estado están.

Reglas:
- Se listan los pedidos en estado **Solicitada**, **En preparación** y **Lista para retirar**.
- **Lo entregado sale de la vista rápida.** Al pie, en 12px `ink-soft`: "Cada fila abre la visita donde se pidió. Las retiradas salen de la lista: **N retiradas hoy**."
- **El coordinador no ve Dispensaciones.** Ninguna fila ni link va a `pharma`. Cada fila abre **la visita en la que se solicitó esa medicación**.

Mapeo contra el modelo real (`data/pharma/dispensationModel.ts`):

```ts
import { columnOf } from '../data/pharma/dispensationModel'

// columnOf(r): 'solicitada' | 'preparando' | 'lista' | 'entregada' | null
const CHIP = {
  solicitada: { label: 'Solicitada',        bg: 'rgba(176,130,63,.12)', fg: 'var(--spira-acc-deep-warn)' },
  preparando: { label: 'En preparación',    bg: 'rgba(46,125,116,.12)', fg: 'var(--spira-primary)' },
  lista:      { label: 'Lista para retirar',bg: 'rgba(92,138,90,.14)',  fg: 'var(--spira-ink-2)' },
}
// 'entregada' y null (rechazada/cancelada) NO se listan.
```

El chip de **Solicitada** escala a ámbar cuando el pedido lleva más de un día sin pasar a preparación (`created_at`). *Umbral a confirmar* — hoy está puesto en 1 día.

Fila → `onNavigate('track','visitas',{ visitId: r.visit_id, visitDate: <fecha de esa visita> })`. El `visit_id` ya viene en `DispensationRequestRow`; la **fecha** hay que traerla en el select (o resolverla con el id de visita) porque `DayVisitsView` carga un solo día y sin `visitDate` la visita no está en la lista.

⚠️ **Falta el hook.** `usePharmaDispensations()` es la cola central de Farmacia (todos los protocolos, y la vista es de otro módulo). Hace falta uno nuevo en `data/pharma/dispensations.ts`:

```ts
/** Pedidos abiertos de los protocolos del coordinador. RLS ya recorta por centro;
 *  el filtro por protocolos asignados va en la query. */
export function useCoordinatorRequests() // status in ('solicitada','preparando') + dispensación 'lista'
```
Traer en el select: `visit_id`, fecha estimada/real de la visita, `patient_name`, `visit_code`, `protocol_code`, `status`, `created_at` y `dispensations(status)`. Verificar que las policies de RLS dejen a un rol de `track` leer `dispensation_requests` de sus protocolos — si no, hace falta una policy o una vista de solo lectura.

**Vacío:** encabezado sin tinte, check verde y "Ningún pedido abierto en tus protocolos." (variante 3 del archivo de referencia).

### Lo prioritario
Alertas vigentes: `useActiveAlerts()` (las mismas que la campana — deja afuera las descartadas), críticas primero, igual que hoy.

Cambia el tratamiento: en vez de tarjetas teñidas, **filas** — punto de severidad, motivo + paciente, código de paciente y protocolo en `muted`, y un botón de contorno (28px de alto) con el verbo: **Reprogramar** (ventana vencida) o **Agendar** (por vencer). Chip "N vencidas" en el encabezado.

Si el verbo todavía no tiene flujo propio, el botón navega a Alertas como hoy (`onNavigate('track','alertas',{ visitId })`) — pero entonces poner "Ver" y no un verbo que promete más de lo que hace.

## Estados
Copiar tal cual el patrón de `TrackResumenView`:
- **Loading**: `<EmptyState accent={accent} icon={submodule.icon} title="Cargando resumen…" description="Un momento." />` mientras cualquier hook cargue.
- **Error**: bloque rojo + botón "Reintentar" que llama a todos los `refetch()`.
- **Vacío por tarjeta**: cada bloque resuelve el suyo en 13px `muted` (no ocultar la tarjeta). Ninguna tarjeta se pinta si el módulo no está disponible para el usuario.

## Interacción
- Filas de lista (Tu día, Medicación, Lo prioritario, Pendientes): `.spira-row-link .spira-no-press` — **se resaltan, no se levantan**, y sin radio, porque el separador de 1px es del borde de arriba de la fila.
- Ítems de Atajos: son superficies con borde propio → `.spira-card-link` (sí se elevan).
- `aria-label` explícito en cada fila, con el patrón que ya usan las otras vistas: `Abrir la visita de {paciente} — {visitTitle}`.

## Design Tokens
```
ACENTO MÓDULO  var(--spira-track) #2E7D74 — es Coordinación, no el petróleo de Inicio
COLOR          ink #14302E · ink-2 (títulos de fila) · ink-soft (texto secundario)
               muted #7C8C87 · faint #A6B0AC · line #E4DECF · line-2 #D8CBB0
               surface #FBFAF6 · white #FFFFFF
SEMÁNTICOS     good #5C8A5A · warn #B0823F · danger #A6483B · acc-deep-warn (ámbar legible)
               onAccent #F4F1EA
TINTES         acento @ .10–.14 para encabezados de tarjeta y chips
TIPO           display 'Schibsted Grotesk' 700 (títulos, números) · text 'Hanken Grotesk'
               mono 'IBM Plex Mono' (códigos de paciente/protocolo, `font-variant-numeric: tabular-nums`)
RADIOS         tarjetas 16 (radius-lg) · botones 9–12 · chips y barras 999 · checkbox 6
TAMAÑOS        título de tarjeta 16 · número grande 38 · fila 13–13.5 · sub 12–12.5
               rótulo de sección 10.5 uppercase .16em 700 faint
GAP            grilla 14 · listas verticales 8–10
```
⚠️ Ningún hex literal en el código: todo por token. Los chips usan `rgba()` del acento correspondiente porque no hay token de tinte.

## Qué falta decidir
1. **Pendientes de cierre**: ¿derivados del schema o tabla nueva? (recomendación arriba).
2. **Umbral de escalado** del chip "Solicitada" a ámbar — hoy, 1 día.
3. **El Resumen de Inicio**: si este mosaico se muda a Coordinación, Inicio queda con las tarjetas de módulos. Puede quedar como hub mínimo o eliminarse y entrar directo al módulo del rol.
4. **Personalizar el tablero** (el `+` de Atajos): sin diseño ni persistencia todavía.
