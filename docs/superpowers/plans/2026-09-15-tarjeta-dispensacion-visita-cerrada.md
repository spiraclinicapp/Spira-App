# La tarjeta de Dispensación en una visita cerrada — Plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usá `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Spec:** [`docs/superpowers/specs/2026-09-15-tarjeta-dispensacion-visita-cerrada-design.md`](../specs/2026-09-15-tarjeta-dispensacion-visita-cerrada-design.md)

**Objetivo:** que la tarjeta de Dispensación de una visita con fin de atención muestre qué pasó en vez de invitar a dispensar, y ofrezca corregirlo.

**Arquitectura:** la decisión de qué mostrar sale a un modelo puro nuevo (`visitaCerradaModel.ts`), al estilo de `seccionIpModel.ts` e `historialPlegadoModel.ts`, que es el patrón que este panel ya usa. `VisitDispensationPanel.tsx` (1202 líneas) sólo lo consume y pinta. Sin migraciones: todo sale de datos que la tarjeta ya consulta.

**Stack:** React 19 + TypeScript strict, sin router ni react-query. Vitest. CSS con variables de `src/styles/tokens.css`, íconos Lucide vía `components/Icon.tsx`.

## Restricciones globales

- **Castellano rioplatense** en comentarios, nombres de dominio y copy. Comentarios densos y explicativos: el porqué, no el qué.
- **Copy exacto, sin variantes:**
  - Cerrada con entrega: rótulo de estado `Dispensada el DD/MM`.
  - Cerrada sin entrega: `En esta visita no se entregó medicación.`
  - Acción con entrega: `Corregir entrega` · sin entrega: `Registrar entrega`.
  - Al abrir la corrección: `La entrega anterior queda registrada. Lo que cargues acá la corrige.`
  - Pie: `Ver pedido anterior` / `Ver pedidos anteriores`; resumen `N pedido anterior` / `N pedidos anteriores`.
- **El corte es `ready_at`** (fin de atención), NUNCA `real_date`.
- **`readOnly` sigue significando permisos.** El modo «visita cerrada» es independiente y se combina, no lo reemplaza.
- **El realce es elevación, nunca borde de color.** La acción de corrección es sobria, no un botón primario.
- **Sin migraciones. Sin tocar la base.**
- **Gate:** `npm run build` (typecheck + vitest + build) verde antes de dar algo por hecho.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/views/pharma/visitaCerradaModel.ts` **(nuevo)** | Modelo puro: dado `ready_at` y los pedidos, qué estado tiene la sección concomitante y qué pedidos ya se muestran arriba |
| `src/views/pharma/visitaCerradaModel.test.ts` **(nuevo)** | Sus tests |
| `src/views/pharma/historialPlegadoModel.ts` | Copy «pedido anterior» + excluir del pie lo que ya se muestra arriba |
| `src/views/pharma/historialPlegadoModel.test.ts` | Tests del copy y de la exclusión |
| `src/views/pharma/HistorialPlegado.tsx` | Rótulo del toggle + prop `excluir` |
| `src/views/pharma/VisitDispensationPanel.tsx` | Consume el modelo, pinta los estados cerrados, apaga las acciones |
| `src/views/track/VisitDetail.tsx` | Nada: ya pasa el `visit` completo. Sólo se ensancha el tipo del prop en el panel |

---

### Task 1: El modelo puro de la visita cerrada

**Archivos:**
- Crear: `src/views/pharma/visitaCerradaModel.ts`
- Test: `src/views/pharma/visitaCerradaModel.test.ts`

**Interfaces:**
- Consume: `PedidoHistorial`, `columnOf`, `activeDispensation`, `cantidadConPartes`, `partesDeRenglon` (ya existen).
- Produce: `vistaVisitaCerrada(entrada): VistaCerrada`, con los tipos `VistaCerrada`, `EstadoConcomitante`, `RenglonEntregado`. Las tareas 2, 3 y 4 los usan.

- [ ] **Paso 1: escribir el test que falla**

Crear `src/views/pharma/visitaCerradaModel.test.ts`:

```ts
/* Estas reglas deciden QUÉ muestra la tarjeta de una visita terminada, y al revés no se ven: una
   visita cerrada con entrega que cayera en «sin_entrega» se lee como una tarjeta prolija que miente
   («en esta visita no se entregó medicación» sobre una que sí). Por eso van testeadas. */
import { describe, expect, it } from 'vitest'
import { vistaVisitaCerrada } from './visitaCerradaModel'
import type { PedidoHistorial } from './historialPlegadoModel'

const pedido = (over: Partial<PedidoHistorial> = {}): PedidoHistorial => ({
  id: 'r1', status: 'atendida', created_at: '2026-08-26T12:00:00+00:00',
  updated_at: '2026-08-26T12:30:00+00:00', rejection_reason: null, includes_ip: false,
  items: [], dispensations: [], habilitaciones: [],
  ...over,
} as PedidoHistorial)

const entregado = (items: unknown[], correlativo = 19): PedidoHistorial =>
  pedido({
    items: items as PedidoHistorial['items'],
    dispensations: [{
      id: 'd1', status: 'entregada', delivered_at: '2026-08-26T12:30:00+00:00',
      correlative_number: correlativo, ip_kits: null,
    }] as PedidoHistorial['dispensations'],
  })

/* `partesDeRenglon` sólo lee `quantity_indicated` y `saldo_de_item_id`, los dos con `?? null`, así
   que un renglón sin partes da «x1» — que es lo que esperan estos tests. */
const item = (name: string, quantity = 1) => ({
  id: `i-${name}`, quantity, medication: { name }, quantity_indicated: null, saldo_de_item_id: null,
})

describe('vistaVisitaCerrada', () => {
  it('con la visita abierta no opina: la tarjeta sigue operando como siempre', () => {
    const v = vistaVisitaCerrada({ readyAt: null, pedidos: [entregado([item('Trelegy')])] })
    expect(v.concomitante).toEqual({ tipo: 'abierta' })
    expect(v.yaMostrados).toEqual([])
  })

  it('cerrada y con entrega: la fecha del desenlace y un renglón por medicamento', () => {
    const v = vistaVisitaCerrada({
      readyAt: '2026-08-26T13:00:00+00:00',
      pedidos: [entregado([item('Trelegy Ellipta (92) 92/55/22 mcg')])],
    })
    expect(v.concomitante).toEqual({
      tipo: 'entregada',
      fecha: '26/08',
      renglones: [{
        id: 'i-Trelegy Ellipta (92) 92/55/22 mcg',
        nombre: 'Trelegy Ellipta (92) 92/55/22 mcg',
        cantidad: 'x1',
        comprobante: 19,
      }],
    })
    expect(v.yaMostrados).toEqual(['r1'])
  })

  it('cerrada sin ningún pedido: no se entregó medicación', () => {
    const v = vistaVisitaCerrada({ readyAt: '2026-08-26T13:00:00+00:00', pedidos: [] })
    expect(v.concomitante).toEqual({ tipo: 'sin_entrega' })
    expect(v.yaMostrados).toEqual([])
  })

  it('cerrada con un pedido CANCELADO: no se entregó, y el pie lo sigue mostrando', () => {
    const v = vistaVisitaCerrada({
      readyAt: '2026-08-26T13:00:00+00:00',
      pedidos: [pedido({ status: 'cancelada', items: [item('Frevia')] as PedidoHistorial['items'] })],
    })
    expect(v.concomitante).toEqual({ tipo: 'sin_entrega' })
    expect(v.yaMostrados).toEqual([])
  })

  /* Una entrega SÓLO de producto en investigación no es medicación concomitante entregada. Si
     cayera en «entregada» la sección quedaría con el rótulo puesto y cero renglones debajo. */
  it('cerrada con una entrega que es sólo de IP: la sección concomitante dice que no hubo', () => {
    const v = vistaVisitaCerrada({
      readyAt: '2026-08-26T13:00:00+00:00',
      pedidos: [pedido({
        includes_ip: true, items: [],
        dispensations: [{ id: 'd1', status: 'entregada', delivered_at: '2026-08-26T12:30:00+00:00', correlative_number: 19, ip_kits: 2 }] as PedidoHistorial['dispensations'],
      })],
    })
    expect(v.concomitante).toEqual({ tipo: 'sin_entrega' })
    expect(v.yaMostrados).toEqual([])
  })

  it('dos entregas: los renglones van juntos y la fecha es la del desenlace más nuevo', () => {
    const viejo = { ...entregado([item('Frevia')], 18), id: 'r0' } as PedidoHistorial
    viejo.dispensations = [{ id: 'd0', status: 'entregada', delivered_at: '2026-08-20T12:00:00+00:00', correlative_number: 18, ip_kits: null }] as PedidoHistorial['dispensations']
    const v = vistaVisitaCerrada({
      readyAt: '2026-08-26T13:00:00+00:00',
      pedidos: [viejo, entregado([item('Salbutral')], 19)],
    })
    expect(v.concomitante).toMatchObject({ tipo: 'entregada', fecha: '26/08' })
    expect(v.concomitante.tipo === 'entregada' && v.concomitante.renglones.map((r) => r.nombre))
      .toEqual(['Salbutral', 'Frevia'])
    expect([...v.yaMostrados].sort()).toEqual(['r0', 'r1'])
  })
})
```

- [ ] **Paso 2: correr el test y verificar que falla**

Ejecutar: `npx vitest run src/views/pharma/visitaCerradaModel.test.ts`
Esperado: FAIL — `Failed to resolve import "./visitaCerradaModel"`.

- [ ] **Paso 3: escribir el modelo**

Crear `src/views/pharma/visitaCerradaModel.ts`:

```ts
/* ┌─ Qué muestra la tarjeta de Dispensación cuando la visita YA TERMINÓ ────────────────────────┐
   Spec: docs/superpowers/specs/2026-09-15-tarjeta-dispensacion-visita-cerrada-design.md

   La tarjeta sólo distinguía QUIÉN mira (`readOnly`: la ficha es lectura, el día es operable) y no
   si la visita terminó, así que sobre una visita cerrada hace un mes seguía ofreciendo «Elegir
   medicación». En una visita terminada el gesto normal es leer, no cargar.

   EL CORTE ES `ready_at` Y NO `real_date`: la fecha real se pone al EMPEZAR a atender, y ahí
   todavía falta dispensar — cortar ahí apagaría la tarjeta justo cuando más se usa. `ready_at` es
   el «Realizada 26 Ago 2026 10:00» del encabezado: la atención se cerró.

   Esto vive acá y no adentro del panel (1202 líneas) por el mismo motivo que `seccionIpModel` y
   `historialPlegadoModel`: la regla se puede leer entera y testear sin montar React.
   └─────────────────────────────────────────────────────────────────────────────────────────────┘ */
import { activeDispensation, cantidadConPartes, columnOf, partesDeRenglon } from '../../data/pharma'
import type { DispensationRequestRow } from '../../data/pharma'
import { formatShortAR, isoDayAR } from '../../lib/dates'
import type { PedidoHistorial } from './historialPlegadoModel'

/** Un medicamento entregado en la visita, como se lee en la tarjeta. */
export interface RenglonEntregado {
  id: string
  nombre: string
  /** «x2», «x1 de 2», «x1 saldo» — el mismo formato corto que usa el resto del panel. */
  cantidad: string
  /** N° del comprobante. `null` si la dispensación no llegó a emitirlo. */
  comprobante: number | null
}

export type EstadoConcomitante =
  /** La visita sigue abierta: la tarjeta opera como siempre y este modelo no opina. */
  | { tipo: 'abierta' }
  /** Terminó y nadie entregó medicación concomitante. */
  | { tipo: 'sin_entrega' }
  /** Terminó y se entregó. `fecha` es `dd/mm` del desenlace más nuevo. */
  | { tipo: 'entregada'; fecha: string; renglones: RenglonEntregado[] }

export interface VistaCerrada {
  concomitante: EstadoConcomitante
  /** Los pedidos que la sección de arriba ya muestra: el pie no los repite. */
  yaMostrados: readonly string[]
}

export interface EntradaVistaCerrada {
  /** Fin de atención de la visita. `null` = la visita no se cerró. */
  readyAt: string | null
  pedidos: readonly PedidoHistorial[]
}

/** Instantes comparados como números: PostgREST recorta los ceros de la fracción. */
const ms = (ts: string) => Date.parse(ts)
/** `dd/mm` en hora argentina. `isoDayAR` y no un recorte: después de las 21:00 el UTC ya es mañana. */
const diaCorto = (ts: string) => formatShortAR(isoDayAR(ts))

export function vistaVisitaCerrada({ readyAt, pedidos }: EntradaVistaCerrada): VistaCerrada {
  if (!readyAt) return { concomitante: { tipo: 'abierta' }, yaMostrados: [] }

  // Sólo lo ENTREGADO. Un pedido cancelado o rechazado no es una entrega, y sigue viviendo en el pie.
  const entregados = pedidos
    .filter((r) => columnOf(r as DispensationRequestRow) === 'entregada')
    .map((r) => ({ r, d: activeDispensation(r as DispensationRequestRow) }))
    .filter((x) => x.d?.delivered_at)
    .sort((a, b) => ms(b.d!.delivered_at!) - ms(a.d!.delivered_at!))

  /* Los renglones son los del PEDIDO, que es donde vive la medicación concomitante. El producto en
     investigación no tiene renglón: viaja en `includes_ip` + `ip_kits`, y lo muestra su propia
     sección. Por eso una entrega sólo de IP deja esta lista vacía, y eso es correcto. */
  const renglones: RenglonEntregado[] = entregados.flatMap(({ r, d }) =>
    r.items.map((it) => ({
      id: it.id,
      nombre: it.medication?.name ?? 'Medicamento',
      cantidad: cantidadConPartes(it.quantity, partesDeRenglon(it), 'corto'),
      comprobante: d && d.status !== 'en_preparacion' ? d.correlative_number : null,
    })),
  )

  if (!renglones.length) return { concomitante: { tipo: 'sin_entrega' }, yaMostrados: [] }

  return {
    concomitante: { tipo: 'entregada', fecha: diaCorto(entregados[0].d!.delivered_at!), renglones },
    // Sólo los que APORTARON renglón: si un pedido entregado no tiene ninguno (era sólo IP), arriba
    // no se muestra nada suyo y sacarlo del pie lo haría desaparecer de la tarjeta entera.
    yaMostrados: entregados.filter(({ r }) => r.items.length > 0).map(({ r }) => r.id),
  }
}
```

- [ ] **Paso 4: correr los tests y verificar que pasan**

Ejecutar: `npx vitest run src/views/pharma/visitaCerradaModel.test.ts`
Esperado: PASS, 6 tests.

- [ ] **Paso 5: commit**

```bash
git add src/views/pharma/visitaCerradaModel.ts src/views/pharma/visitaCerradaModel.test.ts
git commit -m "feat(pharma): modelo de la tarjeta de Dispensación con la visita cerrada"
```

---

### Task 2: El pie deja de llamarse «historial»

**Archivos:**
- Modificar: `src/views/pharma/historialPlegadoModel.ts` (función `historialPlegado`)
- Modificar: `src/views/pharma/HistorialPlegado.tsx` (rótulo del toggle, prop `excluir`)
- Test: `src/views/pharma/historialPlegadoModel.test.ts`

**Interfaces:**
- Consume: nada de la Task 1.
- Produce: `historialPlegado(pedidos, excluir?: readonly string[])`. `HistorialPlegado` acepta `excluir?: readonly string[]`. La Task 3 los usa.

- [ ] **Paso 1: escribir los tests que fallan**

El archivo **ya existe** y trae sus propios helpers: `pedido({ ...campos, disp })` (con `id` autogenerado `r1`, `r2`… salvo que se lo pases) e `item(name, quantity)`. Usalos: no dupliques helpers.

Agregar al final de `src/views/pharma/historialPlegadoModel.test.ts`:

```ts
describe('historialPlegado · «pedido anterior»', () => {
  it('dice «pedido anterior» y no «pedido cerrado»: el pedido puede ser de hoy', () => {
    const h = historialPlegado([
      pedido({ items: [item('Frevia', 1)], disp: { status: 'entregada', delivered_at: '2026-09-13T13:00:00+00:00', n: 19 } }),
    ])
    expect(h?.resumen).toBe('1 pedido anterior · entregado el 13/09')
  })

  it('en plural, «pedidos anteriores»', () => {
    const h = historialPlegado([
      pedido({ items: [item('Frevia', 1)], disp: { status: 'entregada', delivered_at: '2026-09-12T13:00:00+00:00', n: 18 } }),
      pedido({ items: [item('Salbutral', 1)], disp: { status: 'entregada', delivered_at: '2026-09-13T13:00:00+00:00', n: 19 } }),
    ])
    expect(h?.resumen).toBe('2 pedidos anteriores · el último, entregado el 13/09')
  })

  it('excluye lo que la sección de arriba ya muestra', () => {
    const p = pedido({ id: 'ya-mostrado', items: [item('Frevia', 1)], disp: { status: 'entregada', delivered_at: '2026-09-13T13:00:00+00:00', n: 19 } })
    expect(historialPlegado([p], ['ya-mostrado'])).toBeNull()
  })

  it('excluir uno no se lleva puestos a los demás', () => {
    const entregado = pedido({ id: 'ya-mostrado', items: [item('Frevia', 1)], disp: { status: 'entregada', delivered_at: '2026-09-13T13:00:00+00:00', n: 19 } })
    const cancelado = pedido({ id: 'cancelado', status: 'cancelada', updated_at: '2026-09-12T13:00:00+00:00', items: [item('Salbutral', 1)] })
    const h = historialPlegado([entregado, cancelado], ['ya-mostrado'])
    expect(h?.renglones.map((r) => r.id)).toEqual(['cancelado'])
    expect(h?.resumen).toBe('1 pedido anterior · cancelado el 12/09')
  })
})
```

- [ ] **Paso 2: correr y verificar que falla**

Ejecutar: `npx vitest run src/views/pharma/historialPlegadoModel.test.ts`
Esperado: FAIL — el resumen dice `1 pedido cerrado · …`, y el test de exclusión falla porque `historialPlegado` todavía toma un solo argumento.

- [ ] **Paso 3: cambiar el copy y sumar la exclusión**

En `src/views/pharma/historialPlegadoModel.ts`, reemplazar la firma y las dos primeras líneas del cuerpo de `historialPlegado`:

```ts
/**
 * El historial de la visita. Recibe TODOS los pedidos (también los abiertos): el rechazo deja de
 * estar vigente apenas hay uno nuevo en curso, y eso sólo se sabe mirando los abiertos.
 * `null` = no queda nada que resumir y no va la línea.
 *
 * `excluir` son los pedidos que la tarjeta ya muestra arriba con la visita cerrada
 * (`visitaCerradaModel`). La misma entrega dos veces en la misma tarjeta se lee como DOS entregas.
 */
export function historialPlegado(
  pedidos: readonly PedidoHistorial[],
  excluir: readonly string[] = [],
): HistorialPlegado | null {
  const fuera = new Set(excluir)
  const cerrados = pedidos
    .filter((r) => !fuera.has(r.id))
    .filter(estaCerrado)
```

Y reemplazar la línea del rótulo:

```ts
  // «anterior» y no «cerrado»/«historial»: el pedido puede ser de hoy, y «historial» suena a archivo
  // viejo. «Anterior» es cierto en los dos casos (Director, 2026-09-15).
  const cuantos = `${n} ${n === 1 ? 'pedido anterior' : 'pedidos anteriores'}`
```

⚠️ `rechazoVigente(pedidos)` sigue mirando **todos** los pedidos, sin excluir: un rechazo deja de estar vigente por lo que pasó después, no por lo que la tarjeta muestre arriba.

- [ ] **Paso 4: cambiar el rótulo del toggle**

En `src/views/pharma/HistorialPlegado.tsx`, reemplazar la firma del componente:

```tsx
export function HistorialPlegado({ requests, excluir }: {
  requests: readonly DispensationRequestRow[]
  /** Pedidos que la tarjeta ya muestra arriba (visita cerrada). No se repiten acá. */
  excluir?: readonly string[]
}) {
  /** `null` = lo que diga la regla (desplegado con un rechazo vigente); después manda la mano. */
  const [abierto, setAbierto] = useState<boolean | null>(null)
  const h = historialPlegado(requests, excluir)
```

Y el texto del botón:

```tsx
          {desplegado ? 'Ocultar' : h.renglones.length === 1 ? 'Ver pedido anterior' : 'Ver pedidos anteriores'}
```

- [ ] **Paso 5: actualizar las seis aserciones viejas**

El copy cambió a propósito, así que seis aserciones que ya existen quedan en rojo. En `historialPlegadoModel.test.ts`, líneas **48, 55, 66, 74, 83 y 93**, reemplazar dentro de las cadenas esperadas:

- `pedidos cerrados` → `pedidos anteriores`
- `pedido cerrado` → `pedido anterior`

⚠️ **Sólo las cadenas esperadas, no los nombres de los tests.** El test de la línea 35 se llama «sin pedidos cerrados no hay línea» y así queda: «cerrado» sigue siendo la regla interna (`estaCerrado`), lo que cambió es el copy que ve el usuario. Confundir las dos cosas deja el archivo diciendo que la regla se llama distinto de como se llama.

- [ ] **Paso 6: correr los tests y verificar que pasan**

Ejecutar: `npx vitest run src/views/pharma/historialPlegadoModel.test.ts`
Esperado: PASS, incluidos los cuatro nuevos.

- [ ] **Paso 7: commit**

```bash
git add src/views/pharma/historialPlegadoModel.ts src/views/pharma/historialPlegadoModel.test.ts src/views/pharma/HistorialPlegado.tsx
git commit -m "feat(pharma): el pie de la tarjeta dice «pedido anterior», no «historial»"
```

---

### Task 3: La sección de medicación concomitante en la visita cerrada

**Archivos:**
- Modificar: `src/views/pharma/VisitDispensationPanel.tsx`

**Interfaces:**
- Consume: `vistaVisitaCerrada`, `VistaCerrada` (Task 1); `HistorialPlegado` con `excluir` (Task 2).
- Produce: nada para tareas posteriores salvo la constante local `cerrada`, que la Task 4 reusa.

- [ ] **Paso 1: ensanchar el tipo del prop**

En `src/views/pharma/VisitDispensationPanel.tsx`, en la firma de `VisitDispensationPanel`:

```tsx
export function VisitDispensationPanel({ visit, accent, readOnly }: {
  /** `ready_at` = fin de atención. Con la visita cerrada la tarjeta muestra qué pasó en vez de
   *  invitar a dispensar (spec del 2026-09-15). NO se usa `real_date`: esa se pone al EMPEZAR a
   *  atender, y ahí todavía falta dispensar. */
  visit: { id: string; enrollment_id: string; protocol_id: string; dispenses: boolean; dispenses_ip: boolean; ready_at: string | null }
  accent: string
  readOnly: boolean
}) {
```

`VisitDetail.tsx:267` ya pasa el `visit` completo, que trae `ready_at` (`src/data/visits.ts:58`). No hay que tocarlo.

- [ ] **Paso 2: calcular la vista**

Debajo de donde el panel ya tiene `requests` disponible (buscá `const requests`), agregar:

```tsx
  /* La visita terminada muestra qué pasó y no invita a cargar. `cerrada` NO reemplaza a `readOnly`,
     que sigue significando permisos: se combinan. En la ficha de un paciente las dos son ciertas. */
  const vista = vistaVisitaCerrada({ readyAt: visit.ready_at, pedidos: requests })
  const cerrada = vista.concomitante.tipo !== 'abierta'
  /** Con la visita cerrada, cargar deja de ser lo normal y pasa a ser una corrección explícita. */
  const [corrigiendo, setCorrigiendo] = useState(false)
  const puedeCargar = !readOnly && (!cerrada || corrigiendo)
```

Y el import arriba:

```tsx
import { vistaVisitaCerrada } from './visitaCerradaModel'
```

- [ ] **Paso 3: pintar los dos estados cerrados**

Dentro de `<Sub label="Medicación concomitante" first>`, ANTES del bloque `{openMedItems.length > 0 && (`, agregar:

```tsx
            {vista.concomitante.tipo === 'entregada' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 9 }}>
                <div style={{ ...muted, padding: '2px 0' }}>Dispensada el {vista.concomitante.fecha}</div>
                {vista.concomitante.renglones.map((r) => (
                  <div key={r.id} style={itemRow}>
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.nombre}>
                      {r.nombre}
                    </span>
                    <span className="spira-mono" style={{ color: 'var(--spira-ink-soft)', flex: '0 0 auto' }}>{r.cantidad}</span>
                    {r.comprobante !== null && (
                      <span className="spira-mono" style={{ flex: '0 0 auto', fontSize: 12, color: 'var(--spira-muted)' }}>N° {r.comprobante}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {vista.concomitante.tipo === 'sin_entrega' && (
              <div style={{ ...muted, padding: '2px 0', marginBottom: 9 }}>En esta visita no se entregó medicación.</div>
            )}
```

- [ ] **Paso 4: reemplazar la invitación por la corrección**

Reemplazar el bloque del botón «Elegir medicación» (buscá `{!readOnly && !soliciting && (`) por:

```tsx
            {/* Con la visita cerrada, cargar no es el gesto normal: primero hay que decir que se está
                corrigiendo. La acción va sobria a propósito — sobre una visita terminada se lee, no
                se carga. Dos rótulos y no uno: donde no hay entrega no hay nada que corregir, y donde
                la hay «registrar» suena a que todavía no se registró (Director, 2026-09-15). */}
            {!readOnly && cerrada && !corrigiendo && (
              <button type="button" onClick={() => { setCorrigiendo(true); setSoliciting(true); setErr(null) }} style={btnChico}>
                {vista.concomitante.tipo === 'entregada' ? 'Corregir entrega' : 'Registrar entrega'}
              </button>
            )}

            {!readOnly && cerrada && corrigiendo && (
              <div style={{ ...muted, padding: '2px 0', marginBottom: 9 }}>
                La entrega anterior queda registrada. Lo que cargues acá la corrige.
              </div>
            )}

            {puedeCargar && !soliciting && (
              <button type="button" onClick={() => { setSoliciting(true); setErr(null) }} style={addBtn}>
                <Icon name="plus" size={16} color={accent} /> Elegir medicación
              </button>
            )}
```

Y en la línea siguiente, cambiar la guarda del formulario de `{!readOnly && soliciting && (` a `{puedeCargar && soliciting && (`.

- [ ] **Paso 5: excluir del pie lo que ya se muestra arriba**

Reemplazar `<HistorialPlegado requests={requests} />` por:

```tsx
          <HistorialPlegado requests={requests} excluir={vista.yaMostrados} />
```

- [ ] **Paso 6: verificar que compila y que nada se rompió**

Ejecutar: `npm run build`
Esperado: typecheck sin errores, todos los tests PASS, build OK.

- [ ] **Paso 7: commit**

```bash
git add src/views/pharma/VisitDispensationPanel.tsx
git commit -m "feat(pharma): la visita cerrada muestra qué se dispensó y ofrece corregirlo"
```

---

### Task 4: El producto en investigación deja de invitar

**Archivos:**
- Modificar: `src/views/pharma/VisitDispensationPanel.tsx` (la llamada a `contenidoSeccionIp` y el prop de `SeccionIp`)

**Interfaces:**
- Consume: la constante `cerrada` de la Task 3.
- Produce: nada.

- [ ] **Paso 1: que el contenido se calcule como lectura**

En la llamada a `contenidoSeccionIp` (~línea 777), cambiar la línea `readOnly,` por:

```tsx
    /* Con la visita terminada el IP se lee, no se carga: es el mismo criterio que la sección de
       arriba, y arreglar sólo la mitad dejaría la incoherencia 60px más abajo en la misma tarjeta.
       `contenidoSeccionIp` ya sabe hacerlo: con `readOnly` una visita prevista cae en
       «sin_constancia» (estado de lectura) en vez de «adjuntar». */
    readOnly: readOnly || (cerrada && !corrigiendo),
```

- [ ] **Paso 2: apagar «Pedir fuera de cronograma»**

En el `<SeccionIp ... />` (~línea 1093), cambiar:

```tsx
            onPedirFueraDeCronograma={readOnly || (cerrada && !corrigiendo) ? null : () => { setFueraCronograma(true); setErr(null) }}
```

`SeccionIp` ya trata `null` como «no ofrecer», que es lo que hace hoy en la ficha del paciente. No hay que tocar `SeccionIp.tsx`.

- [ ] **Paso 3: verificar**

Ejecutar: `npm run build`
Esperado: verde.

- [ ] **Paso 4: commit**

```bash
git add src/views/pharma/VisitDispensationPanel.tsx
git commit -m "feat(pharma): el producto en investigación tampoco invita en una visita cerrada"
```

---

### Task 5: Verificación en el navegador

**Archivos:** ninguno (verificación).

- [ ] **Paso 1: levantar el preview**

Usar la preview tool con `{name: "spira"}` de `.claude/launch.json` (puerto 5250 — el 5173 es del Director, no competir).

⚠️ `preview_screenshot` se cuelga casi siempre en este proyecto. Verificar por **snapshot / eval / estilos computados** y presentar evidencia de DOM. El documento oculto renderiza LENTO: esperar 4-5 s después de un `navigate` antes de leer, o parece un cuelgue. Para apuntar, `element.click()` por selector desde `javascript_tool`, no coordenadas.

- [ ] **Paso 2: los tres casos**

Con la sesión del Director ya abierta (el agente no ingresa contraseñas), abrir:

1. **Cerrada con entrega** — ENDURA 707401, V5 del 26/08. Esperado: «Dispensada el 26/08», un renglón `Trelegy Ellipta (92) 92/55/22 mcg · x1 · N° 19`, botón **Corregir entrega**, sin «Elegir medicación», sin «Pedir fuera de cronograma», y **sin pie** (el único pedido ya está arriba).
2. **Cerrada sin entrega** — cualquier visita realizada de Victorion. Esperado: «En esta visita no se entregó medicación.» y botón **Registrar entrega**.
3. **Abierta** — una visita sin fin de atención. Esperado: idéntica a hoy, con «Elegir medicación».

- [ ] **Paso 3: la corrección**

En el caso 1, click en «Corregir entrega». Esperado: aparece «La entrega anterior queda registrada. Lo que cargues acá la corrige.», y debajo el flujo de siempre (Elegir → Agregar → Solicitar).

- [ ] **Paso 4: gate final**

Ejecutar: `npm run build`
Esperado: verde. **No afirmar que anda sin esto más la verificación en el navegador.**

- [ ] **Paso 5: commit y PR**

```bash
git add docs/superpowers/specs/2026-09-15-tarjeta-dispensacion-visita-cerrada-design.md docs/superpowers/plans/2026-09-15-tarjeta-dispensacion-visita-cerrada.md
git commit -m "docs: spec y plan de la tarjeta de Dispensación en visita cerrada"
```

Abrir la PR contra `main` (sin `gh`: API REST + `git credential fill`). El Director mergea.

---

## Fuera de alcance

- **Anular una entrega.** `guard_dispensation_immutable` (0003) prohíbe revertir una dispensación `entregada`, y es a propósito. La corrección sólo suma.
- **Declarar «no correspondía entregar».** Descartado en la spec: la medicación de base no tiene alerta que apagar.
- **Migraciones.** Ninguna.
