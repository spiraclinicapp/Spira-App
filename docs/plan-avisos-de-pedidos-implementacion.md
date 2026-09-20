# Avisos de pedidos de dispensación — plan de implementación

> **Para quien lo ejecute (agente o persona):** las tareas van en orden y cada una termina con algo
> verificable. Los pasos usan checkbox (`- [ ]`) para ir tildando. El *qué* y el *por qué* están en
> [`plan-avisos-de-pedidos.md`](plan-avisos-de-pedidos.md); acá está el *cómo*, con el código.

**Objetivo:** que la campana muestre el estado vivo de los pedidos de dispensación —los tuyos si
coordinás, los que entran si estás en Farmacia— y que cada movimiento emita un popup.

**Arquitectura:** una consulta liviana que se repregunta cada 30 s vive en `AppShell` y baja por
props a dos consumidores: el bloque de cards del panel y la pila de popups. Comparar la foto
anterior con la nueva —y decidir qué es un movimiento— es una función pura con test. No se toca la
base.

**Stack:** React 18 + TypeScript strict, Vite, Supabase JS, vitest. Sin react-router, sin
react-query, sin Tailwind.

## Restricciones globales

- **Cero migraciones.** Ninguna columna ni embed de la 0121, 0123 o 0124 entra en la consulta nueva.
- **Castellano rioplatense** en comentarios, nombres de dominio y copy. Comentarios densos, que
  expliquen el *porqué*; igualá el tono del archivo que estés tocando.
- **TypeScript strict.** Tipos a mano, sin generados.
- **Sin Tailwind ni CSS-in-JS.** Estilos inline (`CSSProperties`) o clases de `src/styles/tokens.css`.
  **Este plan no toca `tokens.css`** — el Director tiene cambios sin commitear ahí.
- **Íconos** siempre vía `components/Icon.tsx` (Lucide).
- **Realce = elevación** (~1px + sombra), nunca un borde de color. El color se reserva para
  significado.
- **Rama propia**, nunca `main` (hay un hook que lo bloquea). Stagear **por ruta**: `git add <archivo>`,
  nunca `-A` ni `.` — el árbol tiene cambios ajenos.
- **El gate es `npm run build`** (typecheck + vitest + build) en verde, más verlo andar en el navegador.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/data/pharma/dispensationModel.ts` *(modificar)* | Gana la interfaz `PedidoAviso`: la fila aplanada que consumen la capa de datos y el shell. Va acá, y no en ninguno de los dos, porque es el archivo puro de este dominio — el mismo lugar y el mismo motivo que `alertDismissalModel.ts`. |
| `src/views/pharma/dispensaciones/estados.ts` *(modificar)* | Gana `EstadoVisible` y `estadoVisible()`, la clave del estado que el usuario ve. `badgeDeEstado` pasa a derivarse de ella, así no pueden divergir. |
| `src/shell/avisosPedidos.ts` *(crear)* | Las reglas puras: qué es un movimiento, qué avisa, qué dice, cómo se reparten los pedidos en bloques. Sin Supabase ni DOM. |
| `src/shell/avisosPedidos.test.ts` *(crear)* | Los tests de lo anterior. |
| `src/data/pharma/avisosDePedidos.ts` *(crear)* | La consulta liviana, su reloj de 30 s y el aplanado de la fila. |
| `src/components/Toast.tsx` *(modificar)* | Tres props opcionales: `tono`, `onClick` y `apilado`. Los ocho usos actuales no cambian. |
| `src/shell/AvisosDePedidos.tsx` *(crear)* | La pila de popups, portaleada a `document.body`. |
| `src/shell/NotificationsMenu.tsx` *(modificar)* | El bloque de cards, arriba, con encabezado y fuera del contador. |
| `src/shell/AppShell.tsx` *(modificar)* | Llama al hook una sola vez y reparte. |

---

## Tarea 1 — El estado visible, en un solo lugar

**Archivos:**
- Modificar: `src/views/pharma/dispensaciones/estados.ts:113-136`
- Test: `src/views/pharma/dispensaciones/estados.test.ts`

**Interfaces:**
- Produce: `type EstadoVisible = 'solicitada' | 'preparando' | 'lista' | 'entregada' | 'rechazada' | 'cancelada'`
  y `estadoVisible(solicitud: RequestStatus, dispensacion: string | null): EstadoVisible`.
- Consume: `STATUS_META`, `COLUMN_META`, `Badge` (ya están en ese archivo).

**Por qué acá y no en el shell.** `badgeDeEstado` ya responde exactamente esta pregunta —en qué
estado está el pedido, mirando los dos crudos— y su comentario explica por qué es una sola función y
no dos. Si el shell escribiera la suya, serían dos ramas que hoy se ven iguales y divergen en el
primer estado nuevo, en silencio y sólo en una de las dos pantallas. `estadoVisible` devuelve la
**clave**; `badgeDeEstado` pasa a ser la tabla que la traduce a etiqueta y color.

⚠️ **Espeja a `badgeDeEstado`, no a `columnOf`.** El spec dice "sobre `columnOf`" y no es lo correcto:
`columnOf` devuelve `null` para `atendida` sin dispensación, mientras que `badgeDeEstado` lo muestra
como "Entregada" — y eso es lo que la app ya le dice hoy al usuario en el badge de Track y en el
historial. El aviso tiene que decir lo mismo que la pantalla de al lado.

- [ ] **Paso 1: escribir el test que falla**

Agregar al final de `src/views/pharma/dispensaciones/estados.test.ts`:

```ts
describe('estadoVisible', () => {
  /* La clave del estado que el usuario VE, que no es ninguna de las dos columnas crudas: `lista` y
     `entregada` viven en la dispensación, y `atendida` es la misma palabra para las dos. Este par
     es lo único que los avisos de pedidos tienen que distinguir, así que va con test. */
  it('distingue lista de entregada dentro de atendida', () => {
    expect(estadoVisible('atendida', 'lista')).toBe('lista')
    expect(estadoVisible('atendida', 'entregada')).toBe('entregada')
  })

  it('una preparación ya lista se lee lista, no preparando', () => {
    expect(estadoVisible('preparando', 'lista')).toBe('lista')
    expect(estadoVisible('preparando', null)).toBe('preparando')
  })

  it('los estados sin dispensación se leen tal cual', () => {
    expect(estadoVisible('solicitada', null)).toBe('solicitada')
    expect(estadoVisible('rechazada', null)).toBe('rechazada')
    expect(estadoVisible('cancelada', null)).toBe('cancelada')
  })

  /* REGRESIÓN: `atendida` sin dispensación no debería existir, y si aparece se lee "Entregada" —
     que es lo que `badgeDeEstado` viene mostrando. El riesgo de tocarlo es que el aviso diga una
     cosa y el badge de al lado otra. */
  it('atendida sin dispensación se lee entregada, como el badge', () => {
    expect(estadoVisible('atendida', null)).toBe('entregada')
  })

  it('badgeDeEstado sigue dando lo mismo para los seis casos', () => {
    expect(badgeDeEstado('atendida', 'lista').label).toBe('Lista para retirar')
    expect(badgeDeEstado('atendida', 'entregada')).toEqual(STATUS_META.atendida)
    expect(badgeDeEstado('preparando', null)).toEqual(STATUS_META.preparando)
    expect(badgeDeEstado('solicitada', null)).toEqual(STATUS_META.solicitada)
    expect(badgeDeEstado('rechazada', null)).toEqual(STATUS_META.rechazada)
    expect(badgeDeEstado('cancelada', null)).toEqual(STATUS_META.cancelada)
  })
})
```

Y sumar `badgeDeEstado` y `estadoVisible` al import que ya está en la línea 3 del archivo:

```ts
import { badgeDeEstado, badgeDeHistorial, badgeOf, estadoVisible, primerPendiente, readyBlockedReason, requisitos, STATUS_META } from './estados'
```

- [ ] **Paso 2: correrlo y ver que falla**

```bash
npx vitest run src/views/pharma/dispensaciones/estados.test.ts
```

Esperado: FAIL — `estadoVisible is not a function` / error de TypeScript por el import.

- [ ] **Paso 3: implementar**

En `src/views/pharma/dispensaciones/estados.ts`, **reemplazar** el cuerpo actual de `badgeDeEstado`
(líneas 131-136) por esto, dejando intacto el comentario de cabecera que ya tiene:

```ts
/**
 * El estado que el usuario VE, como CLAVE y no como etiqueta.
 *
 * Existe porque hay tres consumidores que necesitan la misma respuesta en formas distintas: el
 * badge quiere etiqueta y color, los avisos de pedidos quieren comparar el estado de ahora contra
 * el de hace 30 segundos, y una comparación no se hace sobre un texto de interfaz —el día que
 * "Lista para retirar" cambie de redacción, todos los avisos se dispararían de nuevo—.
 *
 * `badgeDeEstado` se deriva de acá. Si fueran dos reglas paralelas, divergirían en el primer estado
 * nuevo, en silencio, y sólo en una de las dos pantallas.
 */
export type EstadoVisible = 'solicitada' | 'preparando' | 'lista' | 'entregada' | 'rechazada' | 'cancelada'

export function estadoVisible(solicitud: RequestStatus, dispensacion: string | null): EstadoVisible {
  if (solicitud === 'atendida' || solicitud === 'preparando') {
    if (dispensacion === 'lista') return 'lista'
    if (dispensacion === 'entregada') return 'entregada'
  }
  /* `atendida` sin dispensación no debería pasar, y si pasa se lee "Entregada": es lo que este
     mismo código viene mostrando desde siempre en el badge de Track y en el historial. */
  return solicitud === 'atendida' ? 'entregada' : solicitud
}

/** La traducción de cada estado visible a etiqueta y color. Una sola tabla para toda la casa. */
const BADGE_POR_ESTADO: Record<EstadoVisible, Badge> = {
  solicitada: STATUS_META.solicitada,
  preparando: STATUS_META.preparando,
  lista: { label: 'Lista para retirar', color: COLUMN_META.lista.color, tint: COLUMN_META.lista.tint },
  entregada: STATUS_META.atendida,
  rechazada: STATUS_META.rechazada,
  cancelada: STATUS_META.cancelada,
}

export function badgeDeEstado(solicitud: RequestStatus, dispensacion: string | null): Badge {
  return BADGE_POR_ESTADO[estadoVisible(solicitud, dispensacion)]
}
```

- [ ] **Paso 4: correr los tests y ver que pasan**

```bash
npx vitest run src/views/pharma/dispensaciones/estados.test.ts
```

Esperado: PASS, incluidos los tests viejos de `badgeOf` y `badgeDeHistorial` (son los que prueban
que el refactor no cambió nada).

- [ ] **Paso 5: typecheck y commit**

```bash
npm run typecheck
```

```bash
git add src/views/pharma/dispensaciones/estados.ts src/views/pharma/dispensaciones/estados.test.ts
git commit -m "refactor(pharma): el estado visible del pedido sale de una sola tabla"
```

---

## Tarea 2 — Las reglas de los avisos

**Archivos:**
- Modificar: `src/data/pharma/dispensationModel.ts` (agregar `PedidoAviso` al final)
- Crear: `src/shell/avisosPedidos.ts`
- Test: `src/shell/avisosPedidos.test.ts`

**Interfaces:**
- Consume: `estadoVisible`, `EstadoVisible`, `badgeDeEstado` (Tarea 1); `isoDayAR` de `lib/dates`.
- Produce: `PedidoAviso` (en `dispensationModel.ts`), y en `avisosPedidos.ts`: `estadoDe`, `AVISA`,
  `Instantanea`, `instantanea`, `Movimiento`, `detectarMovimientos`, `textoDeAviso`, `rotuloDeCard`,
  `fechaDeCard`, `pedidosVigentes`, `repartir`.

**Dónde vive el tipo y por qué.** `PedidoAviso` va en `dispensationModel.ts`, no en el shell ni en
el archivo de la consulta. Lo necesitan los dos: la capa de datos lo produce y las reglas lo
consumen, y las reglas **no pueden importar nada que arrastre el cliente de Supabase** —lee `window`
al cargarse y vitest no monta el módulo—. `dispensationModel.ts` es exactamente el archivo puro de
este dominio y ya tiene `RequestStatus`; es el mismo reparto que `alertDismissalModel.ts`.

- [ ] **Paso 1: declarar el tipo compartido**

Al final de `src/data/pharma/dispensationModel.ts`:

```ts
/**
 * Un pedido, aplanado para los avisos (campana y popups).
 *
 * NO es `DispensationRequestRow` recortada: es otra forma, con el contexto ya resuelto a strings.
 * La consulta de los avisos pide lo mínimo —nada de renglones, constancias ni habilitaciones— y
 * aplana acá para que las reglas, las cards y los popups lean todos la misma fila.
 *
 * Vive en este archivo, que es puro, porque lo comparten la capa de datos (que importa Supabase) y
 * las reglas del shell (que no pueden importarlo, o no se pueden testear). Mismo motivo por el que
 * existe `alertDismissalModel.ts`.
 */
export interface PedidoAviso {
  id: string
  status: RequestStatus
  /** Estado de la dispensación ejecutada, si ya hay una. `null` = todavía no. */
  dispensacion: string | null
  updated_at: string
  visit_id: string
  visit_code: string | null
  requested_by: string
  patient_id: string
  patient_name: string
  /** IVRS de ESTA inscripción (0062), no el del estudio madre. */
  patient_code: string | null
  protocol_id: string
  protocol_code: string
}
```

- [ ] **Paso 2: escribir el test que falla**

Crear `src/shell/avisosPedidos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  detectarMovimientos, fechaDeCard, instantanea, pedidosVigentes, repartir, rotuloDeCard, textoDeAviso,
} from './avisosPedidos'
import { formatAR } from '../lib/dates'
import type { PedidoAviso } from '../data/pharma/dispensationModel'

/**
 * Las reglas de los avisos de pedidos.
 *
 * ACÁ ESTÁ EL MODO DE FALLA MUDO DE TODA LA FEATURE: `detectarMovimientos`. Si la siembra no anda,
 * cada vez que alguien abre la app le caen diez popups de movimientos viejos; si la comparación
 * queda al revés, el popup no sale nunca. Los dos se ven exactamente igual desde afuera — una
 * pantalla que no hace nada— y ninguno tira un error.
 *
 * Lo visual (la pila, la cascada, el color) no está acá: falla de manera visible.
 */

const p = (campos: Partial<PedidoAviso>): PedidoAviso => ({
  id: 'r1',
  status: 'solicitada',
  dispensacion: null,
  updated_at: '2026-09-20T13:00:00-03:00',
  visit_id: 'v1',
  visit_code: 'V3',
  requested_by: 'coord-1',
  patient_id: 'p1',
  patient_name: 'Juan Pérez',
  patient_code: 'LTS-004',
  protocol_id: 'proto-1',
  protocol_code: 'LTS17231',
  ...campos,
})

describe('detectarMovimientos', () => {
  it('la primera carga no avisa nada (la siembra)', () => {
    const movs = detectarMovimientos(null, [p({ id: 'a' }), p({ id: 'b' }), p({ id: 'c' })], 'otro')
    expect(movs).toEqual([])
  })

  it('un pedido que pasa a lista avisa una vez, y sólo una', () => {
    const antes = instantanea([p({ id: 'a', status: 'preparando' })])
    const ahora = [p({ id: 'a', status: 'atendida', dispensacion: 'lista' })]
    expect(detectarMovimientos(antes, ahora, 'coord-1')).toHaveLength(1)
    // La vuelta siguiente, con la foto ya actualizada, no repite.
    expect(detectarMovimientos(instantanea(ahora), ahora, 'coord-1')).toEqual([])
  })

  it('un updated_at nuevo con el mismo estado no es un movimiento', () => {
    const antes = instantanea([p({ id: 'a', status: 'preparando' })])
    const ahora = [p({ id: 'a', status: 'preparando', updated_at: '2026-09-20T18:00:00-03:00' })]
    expect(detectarMovimientos(antes, ahora, 'coord-1')).toEqual([])
  })

  it('un pedido que desaparece de la lista no avisa', () => {
    const antes = instantanea([p({ id: 'a' }), p({ id: 'b' })])
    expect(detectarMovimientos(antes, [p({ id: 'a' })], 'coord-1')).toEqual([])
  })

  it('no te avisa del pedido que cargaste vos', () => {
    const antes: Record<string, never> = {}
    const movs = detectarMovimientos(antes, [p({ id: 'a', requested_by: 'yo' })], 'yo')
    expect(movs).toEqual([])
  })

  it('pero sí del pedido que cargó otro (es lo que ve Farmacia)', () => {
    const movs = detectarMovimientos({}, [p({ id: 'a', requested_by: 'coord-1' })], 'farma-1')
    expect(movs).toHaveLength(1)
    expect(textoDeAviso(movs[0]).titulo).toBe('Pedido nuevo')
  })

  it('tampoco te avisa de tu propia cancelación, pero sí de un rechazo de Farmacia', () => {
    const antes = instantanea([p({ id: 'a', requested_by: 'yo' })])
    const cancelado = [p({ id: 'a', requested_by: 'yo', status: 'cancelada' })]
    const rechazado = [p({ id: 'a', requested_by: 'yo', status: 'rechazada' })]
    expect(detectarMovimientos(antes, cancelado, 'yo')).toEqual([])
    expect(detectarMovimientos(antes, rechazado, 'yo')).toHaveLength(1)
  })
})

describe('pedidosVigentes', () => {
  const hoy = '2026-09-20'

  it('lo abierto queda, sin importar de cuándo sea', () => {
    const viejo = p({ id: 'a', status: 'atendida', dispensacion: 'lista', updated_at: '2026-09-15T10:00:00-03:00' })
    expect(pedidosVigentes([viejo], hoy)).toHaveLength(1)
  })

  it('lo cerrado queda sólo si se cerró hoy', () => {
    const deHoy = p({ id: 'a', status: 'atendida', dispensacion: 'entregada', updated_at: '2026-09-20T09:00:00-03:00' })
    const deAyer = p({ id: 'b', status: 'rechazada', updated_at: '2026-09-19T09:00:00-03:00' })
    expect(pedidosVigentes([deHoy, deAyer], hoy).map((x) => x.id)).toEqual(['a'])
  })

  /* El borde del día se mide en hora argentina, no en la del navegador ni en la del CI (que corre
     en UTC): una entrega de las 22:00 de ayer no puede aparecer como de hoy. */
  it('el corte del día es en hora argentina', () => {
    const anoche = p({ id: 'a', status: 'rechazada', updated_at: '2026-09-20T01:30:00Z' })
    expect(pedidosVigentes([anoche], hoy)).toEqual([])
  })
})

describe('repartir', () => {
  it('lo mío va a mi bloque y lo de otros, sólo si es nuevo, al de Farmacia', () => {
    const mio = p({ id: 'a', requested_by: 'yo', status: 'preparando' })
    const ajenoNuevo = p({ id: 'b', requested_by: 'otro', status: 'solicitada' })
    const ajenoEnCurso = p({ id: 'c', requested_by: 'otro', status: 'preparando' })
    const { mios, nuevos } = repartir([mio, ajenoNuevo, ajenoEnCurso], 'yo')
    expect(mios.map((x) => x.id)).toEqual(['a'])
    expect(nuevos.map((x) => x.id)).toEqual(['b'])
  })

  /* Quien tiene los dos módulos —el Director, el usuario de QA— podría ver el mismo pedido dos
     veces. Es tuyo antes que nuevo. */
  it('un pedido propio y sin tomar aparece una sola vez', () => {
    const { mios, nuevos } = repartir([p({ id: 'a', requested_by: 'yo' })], 'yo')
    expect(mios).toHaveLength(1)
    expect(nuevos).toEqual([])
  })
})

describe('fechaDeCard', () => {
  it('de hoy muestra la hora; de otro día, la fecha', () => {
    const hoy = p({ updated_at: '2026-09-20T14:05:00-03:00' })
    const antes = p({ updated_at: '2026-09-18T14:05:00-03:00' })
    expect(fechaDeCard(hoy, '2026-09-20')).toBe('14:05')
    expect(fechaDeCard(antes, '2026-09-20')).toBe(formatAR('2026-09-18'))
  })
})

describe('rotuloDeCard', () => {
  it('Farmacia lee "Pedido nuevo" donde Coordinación lee "Solicitada"', () => {
    const fila = p({})
    expect(rotuloDeCard(fila, true)).toBe('Pedido nuevo · V3')
    expect(rotuloDeCard(fila, false)).toBe('Solicitada · V3')
  })

  it('sin código de visita no inventa uno', () => {
    expect(rotuloDeCard(p({ visit_code: null }), false)).toBe('Solicitada · Visita')
  })
})
```

- [ ] **Paso 3: correrlo y ver que falla**

```bash
npx vitest run src/shell/avisosPedidos.test.ts
```

Esperado: FAIL — no existe el módulo `./avisosPedidos`.

- [ ] **Paso 4: implementar**

Crear `src/shell/avisosPedidos.ts`:

```ts
import { formatAR, formatTimeAR, isoDayAR } from '../lib/dates'
import { badgeDeEstado, estadoVisible } from '../views/pharma/dispensaciones/estados'
import type { EstadoVisible } from '../views/pharma/dispensaciones/estados'
import type { PedidoAviso } from '../data/pharma/dispensationModel'

/**
 * Las reglas de los avisos de pedidos de dispensación, sin JSX y sin Supabase.
 *
 * Mismo reparto que `notificaciones.ts` y por el mismo motivo: lo que puede quedar al revés SIN
 * VERSE vive acá, con test. Un popup que no sale y un popup que sale de más se ven iguales desde
 * afuera —una pantalla que no hace nada, o que hace ruido— y ninguno de los dos tira un error.
 *
 * Ver `docs/plan-avisos-de-pedidos.md` (D9, D10, D3).
 */

export type { EstadoVisible, PedidoAviso }

/** En qué estado lo ve el usuario. La regla vive en `estados.ts`, con el badge que la muestra. */
export function estadoDe(p: PedidoAviso): EstadoVisible {
  return estadoVisible(p.status, p.dispensacion)
}

/**
 * Qué movimientos emiten popup.
 *
 * ES UNA TABLA Y NO UN `if` A PROPÓSITO: la decisión de avisar los tres pasos de un pedido normal
 * se tomó sabiendo que son tres popups, y el día que canse hay que poder apagar uno cambiando un
 * `true` por un `false`, sin tocar ninguna otra cosa.
 */
export const AVISA: Record<EstadoVisible, boolean> = {
  solicitada: true,
  preparando: true,
  lista: true,
  entregada: true,
  rechazada: true,
  cancelada: true,
}

/** La foto de "dónde estaba cada pedido", por id. */
export type Instantanea = Record<string, EstadoVisible>

export function instantanea(pedidos: readonly PedidoAviso[]): Instantanea {
  const foto: Instantanea = {}
  for (const p of pedidos) foto[p.id] = estadoDe(p)
  return foto
}

export interface Movimiento {
  pedido: PedidoAviso
  estado: EstadoVisible
}

/**
 * Qué se movió entre dos fotos.
 *
 * `previo === null` es LA SIEMBRA: todavía no hay con qué comparar, así que no avisa nada. Sin
 * esto, abrir la app dispararía un popup por cada pedido abierto — movimientos que pasaron ayer,
 * anunciados como si acabaran de ocurrir.
 *
 * Recorre `actual` y nunca `previo`: un pedido que DESAPARECIÓ de la lista no se movió a ningún
 * lado que podamos afirmar (salió de la ventana de "hoy", o dejó de cumplir el filtro), y anunciar
 * un desenlace que no vimos sería inventar.
 */
export function detectarMovimientos(
  previo: Instantanea | null,
  actual: readonly PedidoAviso[],
  uid: string | null,
): Movimiento[] {
  if (previo === null) return []
  const movimientos: Movimiento[] = []
  for (const pedido of actual) {
    const estado = estadoDe(pedido)
    if (!AVISA[estado]) continue
    if (previo[pedido.id] === estado) continue
    if (loHicisteVos(pedido, estado, uid)) continue
    movimientos.push({ pedido, estado })
  }
  return movimientos
}

/**
 * Los dos únicos movimientos que hace quien PIDE: crear el pedido y cancelarlo. El resto los hace
 * Farmacia (tomarlo, dejarlo listo, entregarlo) o son su rechazo, que sí hay que avisar.
 *
 * Se decide por `requested_by` y no por quién tocó el botón, porque la fila no guarda al actor de
 * cada transición. Para las dos que importan alcanza: `cancel_dispensation_request` es de Track y
 * `reject_dispensation_request` es de Farmacia (`data/pharma/dispensations.ts`).
 */
function loHicisteVos(pedido: PedidoAviso, estado: EstadoVisible, uid: string | null): boolean {
  if (!uid || pedido.requested_by !== uid) return false
  return estado === 'solicitada' || estado === 'cancelada'
}

/** Lo que dice el popup. Una frase, sin tecnicismos y sin el id del pedido. */
const TITULO: Record<EstadoVisible, string> = {
  solicitada: 'Pedido nuevo',
  preparando: 'Lo están preparando',
  lista: 'Lista para retirar',
  entregada: 'Entregada',
  rechazada: 'Pedido rechazado',
  cancelada: 'Pedido cancelado',
}

export function textoDeAviso(m: Movimiento): { titulo: string; detalle: string } {
  return {
    titulo: TITULO[m.estado],
    detalle: `${m.pedido.patient_name} · ${m.pedido.visit_code ?? 'Visita'}`,
  }
}

/**
 * El segundo renglón de la card.
 *
 * `comoFarmacia` cambia UNA sola cosa: un pedido sin tomar es "Solicitada" para quien lo pidió y
 * "Pedido nuevo" para quien lo tiene que atender. Es la misma fila leída desde dos lugares del
 * circuito, no dos estados.
 */
export function rotuloDeCard(p: PedidoAviso, comoFarmacia: boolean): string {
  const estado = estadoDe(p)
  const base = comoFarmacia && estado === 'solicitada'
    ? TITULO.solicitada
    : badgeDeEstado(p.status, p.dispensacion).label
  return `${base} · ${p.visit_code ?? 'Visita'}`
}

/**
 * La fecha que muestra la card, en la misma columna donde las alertas muestran la suya.
 *
 * ESPEJA A `fechaDeVisita` y `fechaDeIp` (`notificaciones.ts`) en la intención: la columna no puede
 * quedar vacía o el chip de protocolo se corre y las cajas dejan de alinear entre sí, que es lo
 * único que el diseño del panel promete.
 *
 * De hoy → la HORA del último movimiento ("14:05"), que es lo que estás siguiendo. De otro día → la
 * fecha, porque una hora sola sobre un pedido de anteayer se lee como si acabara de pasar.
 */
export function fechaDeCard(p: PedidoAviso, hoy: string): string {
  const dia = isoDayAR(p.updated_at)
  return dia === hoy ? formatTimeAR(p.updated_at) : formatAR(dia)
}

/**
 * Qué pedidos siguen mereciendo una card (D3).
 *
 * Lo ABIERTO queda siempre, por viejo que sea: un pedido listo que nadie retiró hace tres días es
 * justamente el que hay que ver. Lo CERRADO queda sólo si se cerró hoy — si se borrara en el
 * instante del desenlace, un rechazo desaparecería antes de que alguien lo leyera.
 *
 * `hoy` entra como parámetro y no se lee del reloj adentro: así el test puede afirmar el borde del
 * día, que es en hora argentina y no en la del navegador ni en la del CI.
 */
export function pedidosVigentes(pedidos: readonly PedidoAviso[], hoy: string): PedidoAviso[] {
  return pedidos.filter((p) => {
    const estado = estadoDe(p)
    if (estado === 'solicitada' || estado === 'preparando' || estado === 'lista') return true
    return isoDayAR(p.updated_at) === hoy
  })
}

/**
 * Los dos bloques del panel.
 *
 * Un pedido propio y sin tomar cae en los dos lados, y va a "Tus pedidos": es tuyo antes que nuevo,
 * y de lo tuyo no se te avisa. No es un caso de laboratorio — el Director tiene los cinco módulos y
 * el usuario de QA también.
 */
export function repartir(
  pedidos: readonly PedidoAviso[],
  uid: string | null,
): { mios: PedidoAviso[]; nuevos: PedidoAviso[] } {
  const mios = pedidos.filter((p) => uid !== null && p.requested_by === uid)
  const nuevos = pedidos.filter(
    (p) => !(uid !== null && p.requested_by === uid) && estadoDe(p) === 'solicitada',
  )
  return { mios, nuevos }
}
```

- [ ] **Paso 5: correr los tests y ver que pasan**

```bash
npx vitest run src/shell/avisosPedidos.test.ts
```

Esperado: PASS, 15 tests.

- [ ] **Paso 6: commit**

```bash
git add src/data/pharma/dispensationModel.ts src/shell/avisosPedidos.ts src/shell/avisosPedidos.test.ts
git commit -m "feat(avisos): las reglas de los avisos de pedidos, con test"
```

---

## Tarea 3 — La consulta y su reloj

**Archivos:**
- Crear: `src/data/pharma/avisosDePedidos.ts`

**Interfaces:**
- Consume: `PedidoAviso` (Tarea 2), `useSupabaseQuery`, `addDaysISO` / `todayISO` de `lib/dates`.
- Produce: `usePedidosParaAvisar({ uid, verCoordinacion, verFarmacia }): QueryResult<PedidoAviso[]>`
  y `INTERVALO_MS`.

Sin test: es entrada/salida contra Supabase, como el resto de los hooks de `data/`. Se verifica en
el navegador (Tarea 7).

- [ ] **Paso 1: escribir el archivo**

Crear `src/data/pharma/avisosDePedidos.ts`:

```ts
import { useEffect } from 'react'
import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import type { QueryResult } from '../../lib/useSupabaseQuery'
import { addDaysISO, todayISO } from '../../lib/dates'
import type { PedidoAviso, RequestStatus } from './dispensationModel'

/**
 * Los pedidos de dispensación que alimentan la campana y los popups (plan de avisos, D1).
 *
 * SE REPREGUNTA, NO HAY REALTIME. Cada 30 s mientras la pestaña está a la vista. El realtime de
 * Supabase daría el aviso instantáneo, pero exige habilitar estas tablas en la publicación a mano
 * en el dashboard de producción y manejar la reconexión cuando la notebook se suspende — y de todos
 * modos habría que repreguntar, porque el payload trae la fila cruda, sin paciente ni protocolo.
 * Medio minuto de demora no cambia ninguna decisión.
 */

/* El huso fijo de Argentina, igual que en `dispensations.ts`: la ventana no puede depender de la
   zona del navegador. */
const AR_OFFSET = '-03:00'

/** Cada cuánto se repregunta. */
export const INTERVALO_MS = 30_000

/**
 * Hasta cuántos días para atrás se miran los pedidos ya cerrados.
 *
 * No es la ventana que se MUESTRA —eso lo decide `pedidosVigentes`, que deja sólo los de hoy— sino
 * un techo para que la consulta no crezca sin límite con los meses. Siete días cubre de sobra el
 * caso que importa: un pedido listo que nadie retiró.
 */
const DIAS_ATRAS = 7

/**
 * Las columnas, al hueso.
 *
 * NO SE USA `REQUEST_COLS`, y no es por rendimiento: esa lista pide columnas y embeds de la 0121,
 * 0123 y 0124, y cualquiera de ellas sin aplicar voltea la consulta ENTERA (42703 / PGRST200). Acá
 * sólo entran columnas viejas, así que esta consulta no tiene ventana de despliegue.
 *
 * Tampoco embebe `patient_visits`: Farmacia no tiene policy de select sobre esa tabla (0006:162) y
 * el join le devolvería cero filas en silencio. Por eso el código de visita viaja desnormalizado en
 * la solicitud.
 */
const COLS =
  'id, status, updated_at, visit_id, visit_code, requested_by, ' +
  'dispensations:dispensations(status), ' +
  'enrollment:enrollments!enrollment_id(ivrs_code, patient:patients(id, full_name)), ' +
  'protocol:protocols!protocol_id(id, code)'

/** La fila como la devuelve PostgREST, antes de aplanarla. */
interface FilaCruda {
  id: string
  status: RequestStatus
  updated_at: string
  visit_id: string
  visit_code: string | null
  requested_by: string
  dispensations: { status: string }[] | null
  enrollment: { ivrs_code: string | null; patient: { id: string; full_name: string } | null } | null
  protocol: { id: string; code: string } | null
}

/* El embed puede venir nulo si a alguien le falta el alcance para leerlo. NO se inventa un nombre:
   un guion dice "esto no lo pude ver", y "Paciente" diría que así se llama. */
function aplanar(f: FilaCruda): PedidoAviso {
  return {
    id: f.id,
    status: f.status,
    dispensacion: f.dispensations?.[0]?.status ?? null,
    updated_at: f.updated_at,
    visit_id: f.visit_id,
    visit_code: f.visit_code,
    requested_by: f.requested_by,
    patient_id: f.enrollment?.patient?.id ?? '',
    patient_name: f.enrollment?.patient?.full_name ?? '—',
    patient_code: f.enrollment?.ivrs_code ?? null,
    protocol_id: f.protocol?.id ?? '',
    protocol_code: f.protocol?.code ?? '—',
  }
}

/**
 * Los pedidos del alcance de quien mira, con su reloj.
 *
 * Son DOS o TRES consultas y no una con `or(...)`, por lo mismo que `useDispensationBoard`: los
 * filtros no son parejos. Lo abierto va sin fecha (un pedido de ayer sin atender tiene que seguir a
 * la vista) y lo cerrado con techo. Meterlo todo en un `or` obligaría a escribir un timestamp con
 * huso adentro de una cadena de PostgREST, que es exactamente donde se rompe sin avisar.
 */
export function usePedidosParaAvisar({ uid, verCoordinacion, verFarmacia }: {
  uid: string | null
  verCoordinacion: boolean
  verFarmacia: boolean
}): QueryResult<PedidoAviso[]> {
  const desde = addDaysISO(todayISO(), -DIAS_ATRAS)

  const query = useSupabaseQuery<PedidoAviso[]>(
    async (c) => {
      const porId = new Map<string, PedidoAviso>()

      if (verCoordinacion && uid) {
        const abiertos = await c
          .from('dispensation_requests')
          .select(COLS)
          .eq('requested_by', uid)
          .in('status', ['solicitada', 'preparando', 'atendida'])
          .returns<FilaCruda[]>()
        if (abiertos.error) return { data: null, error: abiertos.error }

        const cerrados = await c
          .from('dispensation_requests')
          .select(COLS)
          .eq('requested_by', uid)
          .gte('updated_at', `${desde}T00:00:00${AR_OFFSET}`)
          .returns<FilaCruda[]>()
        if (cerrados.error) return { data: null, error: cerrados.error }

        for (const f of [...(abiertos.data ?? []), ...(cerrados.data ?? [])]) porId.set(f.id, aplanar(f))
      }

      if (verFarmacia) {
        const nuevos = await c
          .from('dispensation_requests')
          .select(COLS)
          .eq('status', 'solicitada')
          .returns<FilaCruda[]>()
        if (nuevos.error) return { data: null, error: nuevos.error }
        for (const f of nuevos.data ?? []) if (!porId.has(f.id)) porId.set(f.id, aplanar(f))
      }

      return { data: [...porId.values()], error: null }
    },
    [uid, verCoordinacion, verFarmacia, desde],
  )

  const { refetch } = query

  /* El reloj va ENCIMA del hook genérico y no adentro: `useSupabaseQuery` lo usa media app y no
     tiene por qué aprender a repreguntar sola. Con la pestaña oculta se apaga —no tiene sentido
     consultar para nadie— y al volver refresca de una, sin esperar los 30 s. */
  useEffect(() => {
    let id: number | undefined
    const detener = () => {
      if (id !== undefined) { window.clearInterval(id); id = undefined }
    }
    const arrancar = () => { detener(); id = window.setInterval(refetch, INTERVALO_MS) }
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'hidden') { detener(); return }
      refetch()
      arrancar()
    }
    if (document.visibilityState === 'visible') arrancar()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      detener()
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [refetch])

  return query
}
```

- [ ] **Paso 2: typecheck**

```bash
npm run typecheck
```

Esperado: sin errores. (Si `tsc` se queja de que `PedidoAviso` no existe, la Tarea 2 quedó a medias.)

- [ ] **Paso 3: commit**

```bash
git add src/data/pharma/avisosDePedidos.ts
git commit -m "feat(avisos): consulta liviana de pedidos, con refresco cada 30 s"
```

---

## Tarea 4 — El Toast aprende tono, click y apilado

**Archivos:**
- Modificar: `src/components/Toast.tsx`

**Interfaces:**
- Produce: `Toast` con tres props opcionales nuevas — `tono?: { icono: IconName; color: string }`,
  `onClick?: () => void` y `apilado?: boolean`.

**Regla:** los ocho usos actuales (`DispensacionesView`, `RecepcionView`, `MedicamentosView`,
`DispensacionDrawer`, `PanelLista`, `PanelPreparando`, `SeccionHabilitacion`, `DeleteMedicationModal`)
**no se tocan**. Si alguno necesita cambiar, el cambio está mal hecho.

- [ ] **Paso 1: modificar el componente**

En `src/components/Toast.tsx`, reemplazar la firma y el `return` por:

```tsx
export function Toast({ message, onDone, duration = 2400, tono, onClick, apilado = false }: {
  message: string
  onDone: () => void
  duration?: number
  /**
   * Ícono y color del glifo. Por defecto, el check verde de "listo": este componente nació para
   * confirmar lo que acabás de hacer. Los avisos de pedidos no confirman nada tuyo, y un check
   * verde sobre "Pedido rechazado" diría lo contrario de lo que pasó.
   */
  tono?: { icono: IconName; color: string }
  /** Si el aviso lleva a algún lado. Sin esto, el toast es texto y no debe parecer pulsable. */
  onClick?: () => void
  /**
   * Lo ubica el CONTENEDOR, no el toast.
   *
   * De fábrica cada toast se planta solo al pie y centrado (`position: fixed`), que es lo correcto
   * cuando es uno y confirma una acción. La pila de avisos muestra hasta tres a la vez y los apila
   * abajo a la derecha: si cada uno siguiera plantándose solo, los tres caerían exactamente en el
   * mismo lugar, uno encima del otro.
   */
  apilado?: boolean
}) {
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = setTimeout(onDone, duration)
    return () => clearTimeout(t)
  }, [paused, duration, onDone, message])

  const icono = tono?.icono ?? 'check'
  const color = tono?.color ?? 'var(--spira-good)'
  const base = onClick ? { ...wrap, cursor: 'pointer' } : wrap
  /* El contenedor de la pila va con `pointer-events: none` para no tapar la pantalla de atrás, así
     que el toast tiene que volver a habilitarlos para sí mismo — si no, no se puede ni clickear ni
     pausar con el mouse. */
  const estilo: CSSProperties = apilado
    ? { ...base, position: 'static', left: 'auto', bottom: 'auto', transform: 'none', pointerEvents: 'auto' }
    : base

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={onClick}
      style={estilo}
    >
      <Icon name={icono} size={16} color={color} />
      <span>{message}</span>
    </div>
  )
}
```

Y sumar el import del tipo arriba del archivo:

```tsx
import type { IconName } from './Icon'
```

- [ ] **Paso 2: verificar que no se rompió ningún uso**

```bash
npm run typecheck
```

Esperado: sin errores.

- [ ] **Paso 3: commit**

```bash
git add src/components/Toast.tsx
git commit -m "feat(toast): tono e interacción opcionales, sin tocar los usos existentes"
```

---

## Tarea 5 — La pila de popups

**Archivos:**
- Crear: `src/shell/AvisosDePedidos.tsx`

**Interfaces:**
- Consume: `detectarMovimientos`, `instantanea`, `textoDeAviso`, `Movimiento`, `Instantanea`
  (Tarea 2); `PedidoAviso` (Tarea 2, en `dispensationModel.ts`); `badgeDeEstado` (Tarea 1);
  `Toast` con `apilado` (Tarea 4).
- Produce: `<AvisosDePedidos pedidos uid enPantallaDelTablero onAbrir />`.

- [ ] **Paso 1: escribir el componente**

Crear `src/shell/AvisosDePedidos.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Toast } from '../components/Toast'
import { badgeDeEstado } from '../views/pharma/dispensaciones/estados'
import { detectarMovimientos, instantanea, textoDeAviso } from './avisosPedidos'
import type { Instantanea, Movimiento } from './avisosPedidos'
import type { PedidoAviso } from '../data/pharma/dispensationModel'

/**
 * Los popups de movimiento de un pedido.
 *
 * VIVE EN EL SHELL, no en una vista, porque el aviso tiene que llegar estés donde estés: el sentido
 * entero es enterarte de que tu pedido está listo mientras hacés otra cosa.
 *
 * SE PORTALEA A `document.body`. Un `position: fixed` adentro de un ancestro con `backdrop-filter`
 * deja de medirse contra la ventana y aterriza en cualquier lado; ya nos pasó con los popovers.
 *
 * ABAJO A LA DERECHA y no al pie centrado, que es donde vive el `Toast` de confirmación
 * ("comprobante N° 1044 generado"): dos avisos en el mismo lugar se pisan, y son cosas distintas —
 * uno confirma lo que hiciste, el otro te cuenta lo que hizo otro.
 */

/** Cuántos se ven a la vez. El resto espera su turno. */
const MAX_VISIBLES = 3
/** Más que el toast de confirmación (2,4 s): este aviso no lo provocaste vos y llega sin que lo estés mirando. */
const DURACION_MS = 6000

const claveDe = (m: Movimiento) => `${m.pedido.id}:${m.estado}`

export function AvisosDePedidos({ pedidos, uid, enPantallaDelTablero, onAbrir }: {
  /** `null` mientras la consulta no volvió. */
  pedidos: PedidoAviso[] | null
  uid: string | null
  /** D11: parado en el tablero de Dispensaciones, el popup no salta — la pantalla ya lo dice. */
  enPantallaDelTablero: boolean
  onAbrir: (p: PedidoAviso) => void
}) {
  /* La foto anterior. `null` = todavía no se sembró, y eso es lo que hace que la primera carga no
     dispare nada. Va en un ref y no en estado: cambiarla no tiene que volver a renderizar. */
  const anterior = useRef<Instantanea | null>(null)
  const [cola, setCola] = useState<Movimiento[]>([])

  useEffect(() => {
    if (pedidos === null) return
    const movimientos = detectarMovimientos(anterior.current, pedidos, uid)
    /* La foto se actualiza SIEMPRE, incluso cuando no se muestra el popup: si no, al salir del
       tablero caerían de golpe todos los movimientos que pasaron mientras lo mirabas. */
    anterior.current = instantanea(pedidos)
    if (movimientos.length === 0 || enPantallaDelTablero) return
    setCola((previa) => [...previa, ...movimientos])
  }, [pedidos, uid, enPantallaDelTablero])

  const visibles = cola.slice(0, MAX_VISIBLES)
  const esperando = cola.length - visibles.length

  if (visibles.length === 0) return null

  return createPortal(
    <div style={pila}>
      {esperando > 0 && <div style={resto}>y {esperando} más</div>}
      {visibles.map((m) => {
        const { titulo, detalle } = textoDeAviso(m)
        const badge = badgeDeEstado(m.pedido.status, m.pedido.dispensacion)
        return (
          <Toast
            key={claveDe(m)}
            message={`${titulo} — ${detalle}`}
            duration={DURACION_MS}
            tono={{ icono: 'box', color: badge.color }}
            apilado
            onClick={() => { setCola((c) => c.filter((x) => claveDe(x) !== claveDe(m))); onAbrir(m.pedido) }}
            onDone={() => setCola((c) => c.filter((x) => claveDe(x) !== claveDe(m)))}
          />
        )
      })}
    </div>,
    document.body,
  )
}

/* El `Toast` trae su propio `position: fixed` centrado al pie. Acá se lo reubica desde el contenedor
   —`position: static` sobre los hijos— para no duplicar el componente entero por una coordenada. */
const pila: CSSProperties = {
  position: 'fixed', right: 22, bottom: 22, zIndex: 95,
  display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
  pointerEvents: 'none',
}

const resto: CSSProperties = {
  fontFamily: 'var(--spira-font-text)', fontSize: 11.5, color: 'var(--spira-muted)',
}
```

- [ ] **Paso 2: typecheck**

```bash
npm run typecheck
```

Esperado: sin errores. Todavía no se ve nada: el componente no está montado (eso es la Tarea 6).

- [ ] **Paso 3: commit**

```bash
git add src/shell/AvisosDePedidos.tsx
git commit -m "feat(avisos): la pila de popups de movimiento de un pedido"
```

---

## Tarea 6 — El bloque de cards en la campana

**Archivos:**
- Modificar: `src/shell/NotificationsMenu.tsx`

**Interfaces:**
- Consume: `repartir`, `rotuloDeCard`, `PedidoAviso` (Tarea 2); `badgeDeEstado` (Tarea 1);
  `tinte` (ya está en `notificaciones.ts`).
- Produce: `NotificationsMenu` con tres props nuevas: `pedidos: PedidoAviso[] | null`,
  `uid: string | null`, `onAbrirTablero: () => void`.

**Lo que NO cambia:** `count`, `punto`, `ocultas`, el pie y el cupo de 10 de las alertas clínicas.
Los pedidos tienen su propio bloque y su propio cupo.

- [ ] **Paso 1: sumar los imports y las props**

```tsx
import { fechaDeCard, repartir, rotuloDeCard } from './avisosPedidos'
import type { PedidoAviso } from '../data/pharma/dispensationModel'
import { badgeDeEstado } from '../views/pharma/dispensaciones/estados'
import { todayISO } from '../lib/dates'
```

```tsx
interface NotificationsMenuProps {
  onNavigate: (moduleKey: string, subKey: string, target?: NavTarget, back?: ReturnTo) => void
  isAllowed: (moduleKey: string) => boolean
  /** Los pedidos de dispensación del alcance de quien mira. `null` mientras la consulta no volvió. */
  pedidos: PedidoAviso[] | null
  /**
   * Por qué no se pudieron traer, si falló.
   *
   * NO ALCANZA CON NO MOSTRAR NADA. Si la RLS filtra o la consulta se cae, una lista vacía se lee
   * como "no tenés pedidos", que es exactamente el falso negativo que este aviso existe para
   * evitar. Mismo criterio que `AvisosDeEntrega`: nunca se calla.
   */
  errorPedidos: string | null
  /** Para saber cuáles son tuyos. */
  uid: string | null
  /** Ir al tablero de Dispensaciones (lo usa el bloque de Farmacia). */
  onAbrirTablero: () => void
}
```

Y la firma del componente, que hoy desestructura sólo dos props:

```tsx
export function NotificationsMenu({ onNavigate, isAllowed, pedidos, errorPedidos, uid, onAbrirTablero }: NotificationsMenuProps) {
```

- [ ] **Paso 2: repartir los pedidos y contar el vacío**

Debajo de `const puedeCoordinar = isAllowed('track')`:

```tsx
  /* Los pedidos van en su PROPIO bloque y NO entran en `count`.
     El punto de la campana y el contador de Pendientes son el mismo número y tienen que seguir
     coincidiendo — es lo que esta pantalla promete y lo que el comentario de arriba explica—, y un
     pedido en curso no es un pendiente clínico: de él te enteraste por el popup. La contracara es
     que el panel puede mostrar cinco cards con el punto apagado, y por eso el bloque va rotulado:
     sin el encabezado, esa diferencia se lee como una incoherencia. */
  const { mios, nuevos } = repartir(pedidos ?? [], uid)
  const sinPedidos = mios.length === 0 && nuevos.length === 0
```

y cambiar la línea de `vacio`:

```tsx
  /* El error de los pedidos cuenta como "hay algo que mostrar": si no, un fallo de la consulta
     caería en el estado vacío ("Estás al día") y diría que no pasa nada justo cuando no sabemos. */
  const vacio = cajas.length === 0 && sinPedidos && errorPedidos === null
```

- [ ] **Paso 3: dibujar los bloques**

Adentro de `<div className="spira-notif-lista spira-scroll">`, **antes** del `cajas.map(...)` y
dentro de la rama que hoy renderiza la lista (o sea, junto al `map`, no en el `else` del vacío):

```tsx
              <>
                {errorPedidos && (
                  <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', padding: '4px 2px' }}>
                    No pudimos ver el estado de los pedidos de dispensación.
                  </div>
                )}
                {mios.length > 0 && (
                  <BloqueDePedidos
                    titulo="Tus pedidos"
                    pedidos={mios}
                    comoFarmacia={false}
                    abrirPedido={(p) => { setOpen(false); setVisitaAbierta(p.visit_id) }}
                    verMas={null}
                  />
                )}
                {nuevos.length > 0 && (
                  <BloqueDePedidos
                    titulo="Pedidos nuevos"
                    pedidos={nuevos}
                    comoFarmacia
                    abrirPedido={() => { setOpen(false); onAbrirTablero() }}
                    verMas={() => { setOpen(false); onAbrirTablero() }}
                  />
                )}
                {cajas.map((c, i) => (
                  <CajaDeAlerta
                    key={c.key}
                    caja={c}
                    indice={i}
                    abrirVisita={abrirVisita(c.visitId)}
                    abrirPaciente={abrirFicha(c.patientId, c.protocolId)}
                    puedeDescartar={puedeCoordinar}
                  />
                ))}
              </>
```

(El `map` es el que ya estaba, palabra por palabra; lo único nuevo es el fragmento que lo envuelve
junto a los bloques.)

- [ ] **Paso 4: escribir los dos componentes nuevos**

Al final de `NotificationsMenu.tsx`, junto a `CajaDeAlerta`:

```tsx
/** Cuántas cards de pedido entran. Cupo PROPIO: no le compiten los 10 lugares a las alertas
 *  clínicas, que es lo que pasaría si compartieran lista — una tarde movida de Farmacia empujaría
 *  una ventana vencida fuera del panel. */
const MAX_PEDIDOS = 5

/**
 * Un bloque de cards de pedidos, con su rótulo.
 *
 * El rótulo no es decorativo: estas cards NO suman al punto de la campana, y sin una palabra que
 * las separe de los pendientes clínicos, el panel se lee como si el contador estuviera mal.
 */
function BloqueDePedidos({ titulo, pedidos, comoFarmacia, abrirPedido, verMas }: {
  titulo: string
  pedidos: PedidoAviso[]
  comoFarmacia: boolean
  abrirPedido: (p: PedidoAviso) => void
  /** El "y N más" sólo lleva a algún lado si existe una pantalla que los liste. Coordinación no
   *  tiene una, y un link que promete una lista que no hay es peor que no tener link. */
  verMas: (() => void) | null
}) {
  const visibles = pedidos.slice(0, MAX_PEDIDOS)
  const ocultos = pedidos.length - visibles.length
  const hoy = todayISO()
  return (
    <>
      <div className="spira-eyebrow" style={{ padding: '2px 2px 0' }}>{titulo}</div>
      {visibles.map((p) => (
        <CajaDePedido key={p.id} pedido={p} comoFarmacia={comoFarmacia} hoy={hoy} abrir={() => abrirPedido(p)} />
      ))}
      {ocultos > 0 && (
        verMas
          ? (
            <button type="button" onClick={verMas} className="spira-notif-all" style={{ fontSize: 12 }}>
              y {ocultos} más
            </button>
          )
          : <div style={{ fontSize: 11.5, color: 'var(--spira-muted)', padding: '0 2px 2px' }}>y {ocultos} más</div>
      )}
    </>
  )
}

/**
 * Una card de pedido. MISMA grilla que `CajaDeAlerta` (las clases `spira-notif-*`), porque lo que
 * este panel promete es que todas las filas se leen igual: ícono, cuerpo, datos y acción en la
 * misma vertical. La cuarta columna se reserva vacía — un pedido no se archiva (no hay ✕), pero si
 * la columna desapareciera, los dos bloques dejarían de alinear entre sí.
 */
function CajaDePedido({ pedido, comoFarmacia, hoy, abrir }: {
  pedido: PedidoAviso
  comoFarmacia: boolean
  /** El día de hoy en ISO, para decidir si la fecha se muestra como hora. Entra por parámetro para
   *  no leer el reloj una vez por card. */
  hoy: string
  abrir: () => void
}) {
  const badge = badgeDeEstado(pedido.status, pedido.dispensacion)
  const motivo = rotuloDeCard(pedido, comoFarmacia)
  return (
    <div
      className="spira-notif-caja spira-notif-caja--link spira-no-press"
      role="button"
      tabIndex={0}
      onClick={abrir}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir() }
      }}
      aria-label={`Abrir el pedido de ${pedido.patient_name} — ${motivo}`}
    >
      <span className="spira-notif-icono" style={{ background: tinte(badge.color, 9) }}>
        <Icon name="box" size={16} color={badge.color} />
      </span>

      <div className="spira-notif-cuerpo">
        <div className="spira-notif-l1">
          <span className="spira-notif-nombre" title={pedido.patient_name}>{pedido.patient_name}</span>
          <span className="spira-mono spira-notif-codigo">{pedido.patient_code ?? '—'}</span>
        </div>
        <div className="spira-notif-motivo" title={motivo}>{motivo}</div>
      </div>

      <div className="spira-notif-datos">
        <ProtoTag code={pedido.protocol_code} protocolId={pedido.protocol_id} compacto />
        <span className="spira-notif-fecha">{fechaDeCard(pedido, hoy)}</span>
      </div>

      {/* Sin ✕: un pedido no se archiva, se apaga solo cuando se cierra. La columna igual se
          reserva, o las cajas de los dos bloques no alinearían. */}
      <div className="spira-notif-accion" />
    </div>
  )
}
```

- [ ] **Paso 5: typecheck**

```bash
npm run typecheck
```

Esperado: un error en `AppShell.tsx` — `NotificationsMenu` ahora pide tres props que nadie le pasa.
Eso lo cierra la Tarea 7.

- [ ] **Paso 6: commit**

```bash
git add src/shell/NotificationsMenu.tsx
git commit -m "feat(campana): bloque de pedidos de dispensación, fuera del contador"
```

---

## Tarea 7 — Cablearlo y verlo andar

**Archivos:**
- Modificar: `src/shell/AppShell.tsx:90-92, 367`

**Interfaces:**
- Consume: `usePedidosParaAvisar` (Tarea 3), `pedidosVigentes` (Tarea 2), `AvisosDePedidos` (Tarea 5),
  `NotificationsMenu` (Tarea 6).

- [ ] **Paso 1: sumar los imports**

```tsx
import { AvisosDePedidos } from './AvisosDePedidos'
import { usePedidosParaAvisar } from '../data/pharma/avisosDePedidos'
import { pedidosVigentes } from './avisosPedidos'
import { todayISO } from '../lib/dates'
```

- [ ] **Paso 2: llamar al hook, una sola vez**

Después de `const isAllowed = (key: string) => moduloHabilitado(key, userModules, MODULES)` (línea 182):

```tsx
  /* Los avisos de pedidos de dispensación. UNA sola consulta para los dos consumidores —la campana
     y la pila de popups—: si cada uno tuviera la suya, serían dos relojes desfasados contando lo
     mismo, que es el bug que `alertSignal.ts` existe para evitar en las alertas clínicas. */
  const { session } = useAuth()
  const uid = session?.user.id ?? null
  const pedidosQuery = usePedidosParaAvisar({
    uid,
    verCoordinacion: isAllowed('track'),
    verFarmacia: isAllowed('pharma'),
  })
  /* El filtro de "qué sigue mereciendo una card" es puro y vive con su test: lo abierto queda
     siempre, lo cerrado sólo si se cerró hoy. */
  const pedidos = pedidosQuery.data === null ? null : pedidosVigentes(pedidosQuery.data, todayISO())
```

⚠️ `useAuth()` ya se llama en la línea 92 (`const { modules: userModules } = useAuth()`). **No
agregues una segunda llamada**: cambiá esa línea por

```tsx
  const { modules: userModules, session } = useAuth()
```

y borrá el `const { session } = useAuth()` del bloque de arriba.

- [ ] **Paso 3: pasarle las props a la campana**

Línea 367:

```tsx
          <NotificationsMenu
            onNavigate={navigate}
            isAllowed={isAllowed}
            pedidos={pedidos}
            errorPedidos={pedidosQuery.error}
            uid={uid}
            onAbrirTablero={() => navigate('pharma', 'dispensaciones')}
          />
```

- [ ] **Paso 4: montar la pila de popups**

Al final del `return` de `AppShell`, junto a los otros overlays (el buscador, Ajustes, el modal de
feedback), **fuera** del árbol de la barra superior:

```tsx
      {/* Los popups de movimiento de un pedido. Van acá y no adentro de la campana porque tienen
          que aparecer estés donde estés, con el panel cerrado. */}
      <AvisosDePedidos
        pedidos={pedidos}
        uid={uid}
        enPantallaDelTablero={moduleKey === 'pharma' && subKey === 'dispensaciones'}
        onAbrir={(p) => {
          if (isAllowed('pharma')) { navigate('pharma', 'dispensaciones'); return }
          navigate('track', 'protocolos', { patientId: p.patient_id, protocolId: p.protocol_id })
        }}
      />
```

- [ ] **Paso 5: el gate completo**

```bash
npm run build
```

Esperado: typecheck sin errores, vitest en verde (los de `avisosPedidos` y `estados` incluidos) y el
build de producción terminado.

- [ ] **Paso 6: verlo en el navegador**

Levantar el preview (`.claude/launch.json`, puerto 5250 — **no** el 5173, que suele estar ocupado por
el dev server del Director) y, logueado:

1. Abrir una visita y **pedir una dispensación**. La campana tiene que mostrar la card en "Tus
   pedidos", con el ámbar de Solicitada. **Sin popup**: lo pediste vos.
2. Ir al tablero de Dispensaciones y **tomar el pedido**. El popup no salta mientras estás ahí (D11).
3. Volver a cualquier otra pantalla y **marcarlo listo** desde otra sesión o esperando el refresco:
   tiene que llegar el popup "Lista para retirar", abajo a la derecha, y la card tiene que cambiar
   de rótulo y de color.
4. Recargar la página: **ningún popup** (la siembra).

Ojo con el preview oculto: renderiza lento (esperá 4-5 s después de un `navigate`) y los timers van
a ~1/min, así que el refresco de 30 s no se puede cronometrar ahí — verificalo con la pestaña
visible, o bajá `INTERVALO_MS` a mano mientras probás y volvelo a 30 s antes de commitear.

Y la regla dura: **si hace falta crear datos, que sea una visita/paciente `TEST-*` propio**, y se
borra exactamente ése. Nunca en lote.

- [ ] **Paso 7: commit**

```bash
git add src/shell/AppShell.tsx
git commit -m "feat(avisos): cablear los avisos de pedidos en el shell"
```

---

## Cierre

- [ ] `npm run build` en verde.
- [ ] PR contra `main` (por API REST; no hay `gh` en esta máquina, y el merge lo hace el Director).
- [ ] Anotar en `docs/plan-avisos-de-pedidos.md` lo que se haya decidido distinto durante la
      implementación — en particular si "Preparando" terminó apagado en `AVISA`.
