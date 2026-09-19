# El desenlace del IP en una visita cerrada — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la sección «Producto en investigación» de una visita diga qué pasó con el IP, con la misma frase que la fila de Procedimientos. Las visitas históricas lo dicen honesto; la sección tiene su propia puerta para registrar la entrega, y el aviso de entrega repetida no aparece sobre una entrega ya hecha.

**Architecture:** Todo en el front, sin SQL:
- una frase compartida, `desenlaceIp`, en `ipEstado.ts`;
- tres ramas nuevas en el modelo puro de la sección (`seccionIpModel.ts`), más tres funciones puras chicas;
- un hook que lee la marca `lleva_ip` de la visita;
- el cableado en `SeccionIp`, en el panel de Dispensación y en la fila de Procedimientos.

**Tech Stack:** TypeScript strict, React 19, Supabase (PostgREST), vitest.

**Spec:** [`docs/superpowers/specs/2026-09-19-desenlace-ip-visita-cerrada-design.md`](../specs/2026-09-19-desenlace-ip-visita-cerrada-design.md). Sus decisiones E1-E5 no se re-discuten.

## Global Constraints

- **Copy literal:** los textos del spec van tal cual. Son:
  - «Sin entregar: no se pidió a Farmacia.»
  - «Todavía no se pidió a Farmacia.»
  - «Sin entregar: Farmacia rechazó el pedido.»
  - «Farmacia rechazó el pedido.»
  - «Pedido a Farmacia el {fecha y hora}, sin entregar todavía.»
  - «Pedido a Farmacia, sin entregar todavía.»
  - «Visita anterior al registro del IP en Spira.»
  - «Sin entrega registrada.»
  - «Registrar la entrega»
  - «Se carga desde Dispensación.»
  - «Se pide desde Dispensación.»
  - «Se marca cuando Farmacia confirma la entrega.»
- **Sin SQL.** No se crea ninguna migración: la `0135` no se podría pushear hasta que existan la `0133` y la `0134` de Reposición.
- **Idioma:** comentarios y nombres en castellano rioplatense, con la densidad del código vecino (el porqué, no el qué).
- **Qué se testea:** lo que falla en silencio (criterio de `src/views/pharma/dispensaciones/estados.test.ts`). El botón y los textos en pantalla se verifican en el preview.
- **Fechas en tests:** los timestamps van en `+00:00`, como los manda PostgREST. **CI corre en UTC** y `formatDateTimeAR` usa la hora local, así que ningún test compara la hora exacta.
- **Estilo:** el realce es elevación, nunca un borde verde. El botón nuevo usa `btnChico` de `panelDispensacion.ts`, el mismo de «Registrar entrega».
- **Git:**
  - se trabaja en el worktree de la sesión (`C:/Users/Tutuca/Desktop/Spira/Spira App/.claude/worktrees/unruffled-dubinsky-186253`), en la rama `feat/desenlace-ip`, que ya trae el spec y este plan;
  - antes del primer commit, `git rev-parse --show-toplevel` tiene que dar esa carpeta;
  - se stagea por ruta, nunca `-A`;
  - los commits terminan con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Tests puntuales:** `npx vitest run <archivo>`. `npm run test` suma los worktrees de otras sesiones.
- **Prod tiene datos reales:** en el preview no se carga ni se envía nada. «Registrar la entrega» se toca sólo para ver que abre el modo corrección, y el modal se cierra sin enviar.

## Mapa de archivos

| Archivo | Qué cambia | Task |
|---|---|---|
| `src/views/track/ipEstado.ts` | `desenlaceIp(row, terminada)` nueva; `detalleIp(row, terminada)` = desenlace + indicación | 1 |
| `src/views/track/ipEstado.test.ts` | Tests de las dos, con el candado de «una sola voz» | 1 |
| `src/views/track/IpDeliveryRow.tsx` | Recibe `terminada` y la pasa a `detalleIp` | 1 |
| `src/views/track/VisitProcedures.tsx` | Recibe `terminada` y se la pasa a la fila | 1 |
| `src/views/track/VisitDetail.tsx` | Le pasa `terminada = visit.ready_at !== null` a `VisitProcedures` | 1 |
| `src/views/pharma/VisitDispensationPanel.tsx` | Task 1: el cierre usa `desenlaceIp`. Task 2: marca histórica, puerta y aviso | 1, 2 |
| `src/data/visitIp.ts` | `MarcaIpRow` y `useMarcaIp(visitId)` | 2 |
| `src/views/pharma/seccionIpModel.ts` | `sin_constancia` se parte en `desenlace`, `historica` y `sin_registro`; `esVisitaHistorica`, `ofrecerRegistrarIp`, `mostrarAvisoIp` | 2 |
| `src/views/pharma/seccionIpModel.test.ts` | Tests de lo anterior | 2 |
| `src/views/pharma/SeccionIp.tsx` | Dibuja las tres ramas nuevas; `cierre` pasa a `desenlace`; prop `onRegistrarEntrega` | 2 |

---

### Task 1: Una sola frase para el IP (`desenlaceIp`) y la fila de Procedimientos

**Files:**
- Modify: `src/views/track/ipEstado.ts` (la función `detalleIp`)
- Modify: `src/views/track/ipEstado.test.ts`
- Modify: `src/views/track/IpDeliveryRow.tsx`, `src/views/track/VisitProcedures.tsx`, `src/views/track/VisitDetail.tsx`
- Modify: `src/views/pharma/VisitDispensationPanel.tsx` (un import y una línea)

**Interfaces:**
- Consumes: `VisitIpStatusRow`, `EstadoIp` (de `src/data/visitIp.ts`); `formatDateAR`, `formatDateTimeAR` (de `src/lib/dates.ts`).
- Produces:
  - `export function desenlaceIp(row: VisitIpStatusRow, terminada: boolean): string`
  - `export function detalleIp(row: VisitIpStatusRow, terminada: boolean): string`, que siempre empieza con `desenlaceIp(row, terminada)`
  - `IpDeliveryRow({ row, accent, readOnly, terminada })` y `VisitProcedures({ visitId, visitDefId, accent, readOnly, terminada })`

- [ ] **Step 1: Rama y carpeta**

```bash
cd "C:/Users/Tutuca/Desktop/Spira/Spira App/.claude/worktrees/unruffled-dubinsky-186253"
git rev-parse --show-toplevel
git branch --show-current
```

Expected: la carpeta del worktree y `feat/desenlace-ip`.

- [ ] **Step 2: Los tests que fallan**

En `src/views/track/ipEstado.test.ts`, cambiar el import:

```ts
import {
  accionesIp, cierreListo, cuentaIp, desenlaceIp, detalleIp, ipHecho, MOTIVOS_NO_CORRESPONDE, motivoAlertaIp, rotuloMotivo,
} from './ipEstado'
```

Reemplazar el `describe('detalleIp — la segunda línea', …)` entero, desde su línea `describe(` hasta el `})` que lo cierra, por:

```ts
describe('desenlaceIp — qué pasó con el IP, en una frase (spec 2026-09-19, E1)', () => {
  it('sin pedir: en una visita terminada es un pendiente; en una que no terminó, todavía no', () => {
    expect(desenlaceIp(fila({ estado: 'sin_pedir' }), true)).toBe('Sin entregar: no se pidió a Farmacia.')
    expect(desenlaceIp(fila({ estado: 'sin_pedir' }), false)).toBe('Todavía no se pidió a Farmacia.')
  })

  it('rechazado: lo mismo, con Farmacia como sujeto', () => {
    expect(desenlaceIp(fila({ estado: 'rechazado' }), true)).toBe('Sin entregar: Farmacia rechazó el pedido.')
    expect(desenlaceIp(fila({ estado: 'rechazado' }), false)).toBe('Farmacia rechazó el pedido.')
  })

  it('pedido: con la fecha del pedido si la hay, y sin ella no inventa una', () => {
    // Sin comparar la hora: formatDateTimeAR usa la hora local y el CI corre en UTC.
    const con = desenlaceIp(fila({ estado: 'pedido', pedido_at: '2026-09-17T20:27:00+00:00' }), true)
    expect(con).toMatch(/^Pedido a Farmacia el .+, sin entregar todavía\.$/)
    expect(con).toContain('2026')
    expect(desenlaceIp(fila({ estado: 'pedido' }), true)).toBe('Pedido a Farmacia, sin entregar todavía.')
  })

  it('entregado nombra a quién confirmó y los kits, en singular y plural', () => {
    const uno = desenlaceIp(fila({ estado: 'entregado', entregado_por_name: 'Laura Pérez', entregado_at: '2026-09-12T17:30:00+00:00', entregado_ip_kits: 1 }), true)
    expect(uno).toContain('Entregado por Laura Pérez')
    expect(uno).toContain('· 1 kit.')
    const dos = desenlaceIp(fila({ estado: 'entregado', entregado_por_name: 'Laura Pérez', entregado_ip_kits: 2 }), true)
    expect(dos).toContain('· 2 kits.')
  })

  it('una entrega anterior a la 0119 (sin nombre guardado) no inventa a nadie', () => {
    const d = desenlaceIp(fila({ estado: 'entregado', entregado_at: '2026-08-20T12:00:00+00:00', entregado_ip_kits: 2 }), true)
    expect(d.startsWith('Entregado el ')).toBe(true)
    expect(d).not.toContain(' por ')
  })

  it('entregado en otra visita nombra cuál, y cae a "otra visita" si no tiene código', () => {
    expect(desenlaceIp(fila({ estado: 'entregado_en_otra_visita', otra_visita_code: 'VNP', otra_visita_ip_kits: 1 }), true))
      .toContain('Entregado en VNP')
    expect(desenlaceIp(fila({ estado: 'entregado_en_otra_visita' }), true)).toContain('Entregado en otra visita')
  })

  it('"No corresponde · otro" muestra lo que se contó, no la palabra "Otro"', () => {
    const d = desenlaceIp(fila({ estado: 'no_corresponde', cierre_motivo: 'otro', cierre_detalle: 'Pasó a extensión abierta', cerrado_por_name: 'Ana' }), true)
    expect(d).toBe('No corresponde: Pasó a extensión abierta. Lo marcó Ana.')
  })

  it('"No corresponde" con motivo de lista usa su rótulo', () => {
    expect(desenlaceIp(fila({ estado: 'no_corresponde', cierre_motivo: 'discontinuo_tratamiento' }), true))
      .toBe('No corresponde: Discontinuó el tratamiento.')
  })
})

describe('detalleIp — la segunda línea de la fila', () => {
  it('UNA SOLA VOZ: en todos los estados empieza con la frase de la sección', () => {
    // El candado del spec (E1): si alguien reescribe una de las dos, la fila y la sección vuelven a
    // decir cosas distintas de la misma visita, y en pantalla no se nota.
    for (const e of TODOS) {
      for (const terminada of [true, false]) {
        const row = fila({ estado: e })
        expect(detalleIp(row, terminada).startsWith(desenlaceIp(row, terminada)), `${e} · terminada=${terminada}`).toBe(true)
      }
    }
  })

  it('lo que queda por hacer dice dónde: «carga» en una visita terminada, «pide» en una que no', () => {
    expect(detalleIp(fila({ estado: 'sin_pedir' }), true)).toBe('Sin entregar: no se pidió a Farmacia. Se carga desde Dispensación.')
    expect(detalleIp(fila({ estado: 'sin_pedir' }), false)).toBe('Todavía no se pidió a Farmacia. Se pide desde Dispensación.')
    expect(detalleIp(fila({ estado: 'rechazado' }), true)).toBe('Sin entregar: Farmacia rechazó el pedido. Se carga desde Dispensación.')
    expect(detalleIp(fila({ estado: 'pedido' }), true)).toBe('Pedido a Farmacia, sin entregar todavía. Se marca cuando Farmacia confirma la entrega.')
  })

  it('lo que ya se resolvió no agrega indicación', () => {
    for (const e of ['entregado', 'entregado_en_otra_visita', 'no_corresponde'] as EstadoIp[]) {
      const row = fila({ estado: e })
      expect(detalleIp(row, true)).toBe(desenlaceIp(row, true))
    }
  })

  it('cada estado tiene su texto, sin caer a vacío', () => {
    for (const e of TODOS) {
      for (const terminada of [true, false]) {
        const d = detalleIp(fila({ estado: e }), terminada)
        expect(d.trim(), `${e} sin texto`).not.toBe('')
        expect(d, `${e} filtra un null`).not.toMatch(/undefined|null/)
      }
    }
  })
})
```

- [ ] **Step 3: Correr los tests y ver que fallan**

Run: `npx vitest run src/views/track/ipEstado.test.ts`
Expected: FAIL, porque `desenlaceIp` no existe todavía y los textos nuevos no coinciden.

- [ ] **Step 4: La implementación**

En `src/views/track/ipEstado.ts`, reemplazar la función `detalleIp` entera (desde `/** La segunda línea de la fila: qué pasó, cuándo y quién. */` hasta su `}` de cierre) por:

```ts
/**
 * Qué pasó con el IP de la visita, en UNA frase (spec 2026-09-19, E1). La dicen igual la sección
 * «Producto en investigación» de Dispensación y la fila de Procedimientos (`detalleIp`, que le suma
 * dónde se resuelve). Antes cada una decía lo suyo: «Sin pedir» en la fila y «Sin constancia
 * cargada.» en la sección, sobre la misma visita.
 *
 * `terminada` = la visita tiene fin de atención (`ready_at`), la misma señal con la que la tarjeta
 * decide si está cerrada (`vistaVisitaCerrada`). En una que todavía no terminó, «sin entregar» sonaría
 * a problema, y la base tiene cientos así: las próximas visitas del cronograma.
 */
export function desenlaceIp(row: VisitIpStatusRow, terminada: boolean): string {
  switch (row.estado) {
    case 'sin_pedir':
      return terminada ? 'Sin entregar: no se pidió a Farmacia.' : 'Todavía no se pidió a Farmacia.'
    case 'rechazado':
      return terminada ? 'Sin entregar: Farmacia rechazó el pedido.' : 'Farmacia rechazó el pedido.'
    case 'pedido':
      return row.pedido_at
        ? `Pedido a Farmacia el ${formatDateTimeAR(row.pedido_at)}, sin entregar todavía.`
        : 'Pedido a Farmacia, sin entregar todavía.'
    case 'entregado': {
      const quien = row.entregado_por_name ? ` por ${row.entregado_por_name}` : ''
      const cuando = row.entregado_at ? ` el ${formatDateTimeAR(row.entregado_at)}` : ''
      return `Entregado${quien}${cuando}${kits(row.entregado_ip_kits)}.`
    }
    case 'entregado_en_otra_visita': {
      const donde = row.otra_visita_code ?? row.otra_visita_name ?? 'otra visita'
      const cuando = row.otra_visita_entregado_at ? ` el ${formatDateAR(row.otra_visita_entregado_at)}` : ''
      return `Entregado en ${donde}${cuando}${kits(row.otra_visita_ip_kits)}.`
    }
    case 'no_corresponde': {
      const motivo = row.cierre_motivo === 'otro' && row.cierre_detalle
        ? row.cierre_detalle
        : rotuloMotivo(row.cierre_motivo)
      const quien = row.cerrado_por_name ? ` Lo marcó ${row.cerrado_por_name}.` : ''
      return `No corresponde: ${motivo}.${quien}`
    }
  }
}

/**
 * La segunda línea de la fila de Procedimientos: el desenlace y, si queda algo por hacer, dónde.
 * SIEMPRE empieza con `desenlaceIp` (hay un test que lo exige). En una visita terminada lo pendiente
 * se «carga», porque lo que se registra es una entrega que ya pasó; en una que no terminó, se «pide».
 */
export function detalleIp(row: VisitIpStatusRow, terminada: boolean): string {
  const desenlace = desenlaceIp(row, terminada)
  switch (row.estado) {
    case 'sin_pedir':
    case 'rechazado':
      return `${desenlace} ${terminada ? 'Se carga desde Dispensación.' : 'Se pide desde Dispensación.'}`
    case 'pedido':
      return `${desenlace} Se marca cuando Farmacia confirma la entrega.`
    default:
      return desenlace
  }
}
```

- [ ] **Step 5: Correr los tests y ver que pasan**

Run: `npx vitest run src/views/track/ipEstado.test.ts`
Expected: PASS, todos.

- [ ] **Step 6: La fila recibe `terminada`**

En `src/views/track/IpDeliveryRow.tsx`, cambiar la firma:

```tsx
export function IpDeliveryRow({ row, accent, readOnly, terminada }: {
  row: VisitIpStatusRow
  accent: string
  readOnly: boolean
  /** La visita tiene fin de atención: cambia cómo se dice lo pendiente (`desenlaceIp`). */
  terminada: boolean
}) {
```

Reemplazar `{detalleIp(row)}` por `{detalleIp(row, terminada)}`.

En el comentario de arriba de esa línea, reemplazar `("Entregado por…", "Sin pedir…")` por `("Entregado por…", "Sin entregar…")`.

En `src/views/track/VisitProcedures.tsx`, cambiar la firma:

```tsx
export function VisitProcedures({ visitId, visitDefId, accent, readOnly, terminada }: {
  visitId: string
  visitDefId: string | null
  accent: string
  readOnly: boolean
  /** Fin de atención puesto (`ready_at`): la fila del IP dice lo pendiente como pendiente (spec 2026-09-19). */
  terminada: boolean
}) {
```

Reemplazar:

```tsx
    ? <IpDeliveryRow row={ip} accent={accent} readOnly={readOnly} />
```

por:

```tsx
    ? <IpDeliveryRow row={ip} accent={accent} readOnly={readOnly} terminada={terminada} />
```

En `src/views/track/VisitDetail.tsx`, reemplazar:

```tsx
                  <VisitProcedures visitId={visit.id} visitDefId={visit.visit_def_id} accent={accent} readOnly={readOnly} />
```

por:

```tsx
                  <VisitProcedures visitId={visit.id} visitDefId={visit.visit_def_id} accent={accent} readOnly={readOnly} terminada={visit.ready_at !== null} />
```

- [ ] **Step 7: El panel usa la frase nueva para el cierre**

En `src/views/pharma/VisitDispensationPanel.tsx`, reemplazar el import `import { detalleIp } from '../track/ipEstado'` por:

```ts
import { desenlaceIp } from '../track/ipEstado'
```

y reemplazar:

```tsx
            cierre={ipCerrada && ipQ.data ? detalleIp(ipQ.data) : null}
```

por:

```tsx
            cierre={ipCerrada && ipQ.data ? desenlaceIp(ipQ.data, visit.ready_at !== null) : null}
```

Para los dos cierres, `desenlaceIp` da el mismo texto que daba `detalleIp`, así que en pantalla no cambia nada.

- [ ] **Step 8: Typecheck y tests del módulo**

Run: `npx tsc --noEmit`
Expected: sin errores. Si alguna otra llamada a `detalleIp` o a `VisitProcedures` aparece como error, es un llamador que no está en este plan: agregarle el argumento `terminada` con la misma regla, `ready_at !== null`.

Run: `npx vitest run src/views/track src/views/pharma`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd "C:/Users/Tutuca/Desktop/Spira/Spira App/.claude/worktrees/unruffled-dubinsky-186253"
git add src/views/track/ipEstado.ts src/views/track/ipEstado.test.ts src/views/track/IpDeliveryRow.tsx src/views/track/VisitProcedures.tsx src/views/track/VisitDetail.tsx src/views/pharma/VisitDispensationPanel.tsx
git commit -m "feat(ip): una sola frase para el desenlace del IP

La fila de Procedimientos y el cierre de la sección del IP salen de
desenlaceIp. En una visita terminada lo pendiente se dice «Sin entregar»;
en una que no terminó, «Todavía no se pidió».

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: La sección del IP dice qué pasó: desenlace, histórica, puerta y aviso

**Files:**
- Modify: `src/data/visitIp.ts` (suma `MarcaIpRow` y `useMarcaIp`)
- Modify (reescritura entera, es corto): `src/views/pharma/seccionIpModel.ts`, `src/views/pharma/seccionIpModel.test.ts`
- Modify: `src/views/pharma/SeccionIp.tsx`, `src/views/pharma/VisitDispensationPanel.tsx`

**Interfaces:**
- Consumes: `desenlaceIp(row, terminada)` (Task 1); `EstadoIp`, `useVisitIpStatus` (de `src/data/visitIp.ts`).
- Produces:
  - `export interface MarcaIpRow { lleva_ip: boolean | null; real_date: string | null; attended_at: string | null }`
  - `export function useMarcaIp(visitId: string | null): QueryResult<MarcaIpRow | null>`
  - `ContenidoIp` sin `sin_constancia`, con `desenlace`, `historica` y `sin_registro`
  - `SituacionIp` con dos campos nuevos: `estadoIp: EstadoIp | null` y `historica: boolean`
  - `esVisitaHistorica(marca: MarcaIpRow | null): boolean`
  - `ofrecerRegistrarIp(contenido: ContenidoIp, estadoIp: EstadoIp | null): boolean`
  - `mostrarAvisoIp(contenido: ContenidoIp, estadoIp: EstadoIp | null): boolean`
  - `SeccionIp`: la prop `cierre` pasa a llamarse `desenlace: string | null`, y se suma `onRegistrarEntrega: (() => void) | null`

- [ ] **Step 1: El test del modelo, entero**

`src/views/pharma/seccionIpModel.test.ts`, entero:

```ts
import { describe, expect, it } from 'vitest'
import { contenidoSeccionIp, esVisitaHistorica, mostrarAvisoIp, ofrecerRegistrarIp } from './seccionIpModel'
import type { SituacionIp } from './seccionIpModel'

/**
 * Qué muestra la sección del producto en investigación (plan D18 y R11, Tanda 3a; spec del
 * 2026-09-19 para el desenlace).
 *
 * Se testea porque cada rama se ve prolija aunque sea la equivocada: un dropzone sobre una visita
 * que ya se cerró como «No corresponde», «Visita anterior al registro del IP» sobre una del 17/09 con
 * el IP sin entregar, o el aviso de entrega repetida sobre la propia entrega.
 */

const base: SituacionIp = {
  hayArchivo: false,
  hayPedidoAbierto: false,
  pedidoAbiertoLaAcepta: false,
  entregadoConConstancia: false,
  cargando: false,
  cerrada: false,
  prevista: false,
  readOnly: false,
  estadoIp: null,
  historica: false,
}
const con = (s: Partial<SituacionIp>) => contenidoSeccionIp({ ...base, ...s })

describe('contenidoSeccionIp', () => {
  it('sin cronograma, sin pedido y sin cierre: el estado vacío que ofrece pedirlo', () => {
    expect(con({})).toBe('no_prevista')
    expect(con({ readOnly: true })).toBe('no_prevista')
  })

  it('prevista y con permiso de carga: el dropzone, aunque haya estado o sea histórica', () => {
    expect(con({ prevista: true })).toBe('adjuntar')
    expect(con({ prevista: true, estadoIp: 'sin_pedir', historica: true })).toBe('adjuntar')
  })

  it('prevista en lectura, con fila en v_visit_ip_status: el desenlace', () => {
    expect(con({ prevista: true, readOnly: true, estadoIp: 'sin_pedir' })).toBe('desenlace')
    expect(con({ prevista: true, readOnly: true, estadoIp: 'rechazado' })).toBe('desenlace')
    // Entregado SIN constancia (entregas viejas): la frase «Entregado por…», no un papel que falta.
    expect(con({ prevista: true, readOnly: true, estadoIp: 'entregado' })).toBe('desenlace')
  })

  it('prevista en lectura, sin fila: histórica si se fechó antes de la 0119, si no «sin registro»', () => {
    expect(con({ prevista: true, readOnly: true, historica: true })).toBe('historica')
    expect(con({ prevista: true, readOnly: true })).toBe('sin_registro')
  })

  it('el estado de la vista le gana a la marca histórica: si la base sabe algo, se dice eso', () => {
    expect(con({ prevista: true, readOnly: true, estadoIp: 'pedido', historica: true })).toBe('desenlace')
  })

  it('una histórica sin IP previsto sigue en el estado vacío', () => {
    expect(con({ historica: true, readOnly: true })).toBe('no_prevista')
  })

  it('con un cierre de la 0119 no se ofrece nada, aunque el cronograma lo prevea', () => {
    expect(con({ cerrada: true, prevista: true })).toBe('cierre')
    expect(con({ cerrada: true })).toBe('cierre')
    expect(con({ cerrada: true, prevista: true, readOnly: true, estadoIp: 'no_corresponde', historica: true })).toBe('cierre')
  })

  it('mientras carga no se afirma nada: ni dropzone, ni cierre, ni «anterior al registro»', () => {
    expect(con({ cargando: true, prevista: true })).toBe('cargando')
    expect(con({ cargando: true })).toBe('cargando')
    expect(con({ cargando: true, prevista: true, readOnly: true, historica: true })).toBe('cargando')
  })

  it('lo que ya pasó se muestra aunque haya cierre: la constancia es nota fuente', () => {
    expect(con({ entregadoConConstancia: true, cerrada: true })).toBe('entregado')
    expect(con({ entregadoConConstancia: true, prevista: true, readOnly: true, estadoIp: 'entregado' })).toBe('entregado')
    expect(con({ hayPedidoAbierto: true, pedidoAbiertoLaAcepta: true, cerrada: true })).toBe('en_curso')
  })

  it('un pedido abierto que no toma la constancia no abre el dropzone: dice el pedido', () => {
    expect(con({ hayPedidoAbierto: true, prevista: true, estadoIp: 'pedido' })).toBe('desenlace')
    expect(con({ hayPedidoAbierto: true, prevista: true })).toBe('sin_registro')
    // Sin cronograma: el estado vacío, que abre la excepción y manda el IP en su propio pedido.
    expect(con({ hayPedidoAbierto: true })).toBe('no_prevista')
  })

  it('la constancia elegida y sin enviar manda sobre todo', () => {
    expect(con({ hayArchivo: true, entregadoConConstancia: true, cerrada: true })).toBe('pendiente')
  })
})

describe('esVisitaHistorica — la marca de la 0119', () => {
  it('fechada y sin marca: anterior al registro del IP', () => {
    expect(esVisitaHistorica({ lleva_ip: null, real_date: '2026-09-02', attended_at: null })).toBe(true)
    expect(esVisitaHistorica({ lleva_ip: null, real_date: null, attended_at: '2026-09-02T13:00:00+00:00' })).toBe(true)
  })

  it('con la marca puesta, en verdadero o en falso, no es histórica', () => {
    expect(esVisitaHistorica({ lleva_ip: true, real_date: '2026-09-17', attended_at: null })).toBe(false)
    expect(esVisitaHistorica({ lleva_ip: false, real_date: '2026-09-17', attended_at: null })).toBe(false)
  })

  it('sin fechar no es histórica: la marca se pone recién al fecharla', () => {
    expect(esVisitaHistorica({ lleva_ip: null, real_date: null, attended_at: null })).toBe(false)
  })

  it('sin la fila (la RLS filtra en silencio) no se afirma nada', () => {
    expect(esVisitaHistorica(null)).toBe(false)
  })
})

describe('ofrecerRegistrarIp — la puerta de la sección (E3)', () => {
  it('sí con el IP sin pedir o rechazado', () => {
    expect(ofrecerRegistrarIp('desenlace', 'sin_pedir')).toBe(true)
    expect(ofrecerRegistrarIp('desenlace', 'rechazado')).toBe(true)
  })

  it('no con un pedido vivo en Farmacia, ni con una entrega hecha', () => {
    expect(ofrecerRegistrarIp('desenlace', 'pedido')).toBe(false)
    expect(ofrecerRegistrarIp('desenlace', 'entregado')).toBe(false)
  })

  it('no fuera del desenlace: ni en las históricas, ni donde ya hay dropzone', () => {
    expect(ofrecerRegistrarIp('historica', null)).toBe(false)
    expect(ofrecerRegistrarIp('sin_registro', null)).toBe(false)
    expect(ofrecerRegistrarIp('adjuntar', 'sin_pedir')).toBe(false)
  })
})

describe('mostrarAvisoIp — el aviso de entrega repetida (E4)', () => {
  it('no sobre una entrega ya a la vista ni sobre un cierre', () => {
    expect(mostrarAvisoIp('entregado', 'entregado')).toBe(false)
    expect(mostrarAvisoIp('cierre', 'no_corresponde')).toBe(false)
    expect(mostrarAvisoIp('desenlace', 'entregado')).toBe(false)
  })

  it('sí mientras se pide, aunque la visita ya tenga su entrega: es justo una segunda', () => {
    expect(mostrarAvisoIp('pendiente', 'entregado')).toBe(true)
    expect(mostrarAvisoIp('adjuntar', 'sin_pedir')).toBe(true)
    expect(mostrarAvisoIp('en_curso', 'pedido')).toBe(true)
  })
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run src/views/pharma/seccionIpModel.test.ts`
Expected: FAIL, porque `esVisitaHistorica`, `ofrecerRegistrarIp` y `mostrarAvisoIp` no existen y `SituacionIp` no tiene los campos nuevos.

- [ ] **Step 3: La marca en la capa de datos**

En `src/data/visitIp.ts`, debajo de la función `useVisitIpStatus` (después de su `}` de cierre), agregar:

```ts
/** La marca `lleva_ip` de una visita (0119), con lo que dice si ya está fechada. */
export interface MarcaIpRow {
  /** NULL = fechada antes de la 0119 (o todavía sin fechar): ahí Spira no registraba el IP. */
  lleva_ip: boolean | null
  real_date: string | null
  attended_at: string | null
}

/**
 * La marca `lleva_ip` de UNA visita, para saber si es anterior al registro del IP (spec 2026-09-19,
 * E2 y E5). Se lee aparte porque `v_track_visits` no la trae y sumarla sería una migración, y
 * `v_visit_ip_status` no tiene fila para esas visitas: justamente las que no llevan la marca.
 *
 * `patient_visits` la puede leer Coordinación (policy «ver visitas de mis protocolos», 0006). Farmacia
 * no, pero este hook sólo corre en el detalle de visita de Coordinación. Si la RLS filtra, vuelve
 * `null` sin error, y `esVisitaHistorica(null)` no afirma nada. No escucha `bumpIpEstado`: la marca se
 * sella al fechar la visita, y una visita que se fecha con el modal abierto no es histórica en ninguna
 * de las dos lecturas.
 */
export function useMarcaIp(visitId: string | null): QueryResult<MarcaIpRow | null> {
  return useSupabaseQuery<MarcaIpRow | null>(
    async (c) => {
      if (!visitId) return { data: null, error: null }
      const { data, error } = await c
        .from('patient_visits')
        .select('lleva_ip, real_date, attended_at')
        .eq('id', visitId)
        .maybeSingle()
      if (error) return { data: null, error }
      return { data: (data as MarcaIpRow | null) ?? null, error: null }
    },
    [visitId],
    traducir,
  )
}
```

- [ ] **Step 4: El modelo, entero**

`src/views/pharma/seccionIpModel.ts`, entero:

```ts
/**
 * ┌─ Qué muestra la sección «Producto en investigación» de la tarjeta (plan D18 y R11, Tanda 3a) ─┐
 *
 * La sección existe SIEMPRE. Antes aparecía sólo si el cronograma preveía IP, y la salida para
 * pedirlo fuera de cronograma era un botón suelto al pie, pegado al historial, que se leía como un
 * pedido más. Ahora el estado vacío de la sección es el que la ofrece.
 *
 *   contenido      cuándo (en este orden)                                     qué se ve
 *   pendiente      hay una constancia elegida y sin enviar                     la vista previa
 *   en_curso       un pedido abierto la acepta                                 la constancia o el dropzone
 *   entregado      un pedido entregado la tiene                                constancia + desenlace
 *   cargando       alguna de las lecturas no volvió                            nada
 *   cierre         la visita tiene un cierre de la 0119                        el cierre, y nada que ofrecer
 *   adjuntar       prevista y se puede cargar                                  el dropzone
 *   desenlace      prevista, en lectura, con fila en `v_visit_ip_status`       la frase + «Registrar la entrega»
 *   historica      prevista, en lectura, sin fila, fechada antes de la 0119    «Visita anterior al registro…»
 *   sin_registro   prevista, en lectura, sin fila y no histórica               «Sin entrega registrada.»
 *   no_prevista    nada de lo anterior                                         «El cronograma no lo pide…»
 *
 * «Prevista» = el cronograma, un pedido abierto con el IP sellado o la excepción abierta. «En lectura»
 * = sin permiso de carga, con la visita terminada y sin corregir, o contra un pedido abierto que no
 * toma la constancia.
 *
 * El CIERRE (`v_visit_ip_status`, 0119) va antes que ofrecer nada: «No corresponde» o «Entregado en
 * otra visita» dicen que esta visita no lleva su propio IP, y la base ya no le sella `includes_ip` a
 * un pedido nuevo (0121:134). Ofrecer el dropzone ahí prometería algo que no existe. Lo real que ya
 * pasó —una constancia en curso o entregada— se muestra igual: es nota fuente.
 *
 * DESENLACE, HISTÓRICA Y SIN REGISTRO (spec del 2026-09-19). Antes las tres eran «Sin constancia
 * cargada.», que describe un papel que falta y no qué pasó con el IP. Decía lo mismo de una visita de
 * agosto —cuando Spira no registraba el IP y el dato vivía en papel— que de una del 17/09 con el IP
 * sin entregar, que es un pendiente real. Ahora la frase es la de `v_visit_ip_status`, la misma de la
 * fila de Procedimientos (`desenlaceIp`), y la histórica lo dice honesto y sin acción.
 *
 * POR QUÉ ES PURO Y CON TEST. Cada rama se dibuja prolija aunque sea la equivocada: un dropzone
 * sobre una visita cerrada, «anterior al registro» sobre una visita con el IP sin entregar, o el
 * aviso de entrega repetida sobre la propia entrega. Ver el criterio en `dispensaciones/estados.test.ts`.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import type { EstadoIp, MarcaIpRow } from '../../data/visitIp'

export type ContenidoIp =
  | 'pendiente'
  | 'en_curso'
  | 'entregado'
  | 'cargando'
  | 'cierre'
  | 'adjuntar'
  | 'desenlace'
  | 'historica'
  | 'sin_registro'
  | 'no_prevista'

export interface SituacionIp {
  hayArchivo: boolean
  hayPedidoAbierto: boolean
  /** El pedido abierto, tal como está sellado, acepta la constancia (o la excepción está abierta). */
  pedidoAbiertoLaAcepta: boolean
  entregadoConConstancia: boolean
  /** Alguna lectura (pedidos, estado del IP, marca de la 0119) todavía no volvió. */
  cargando: boolean
  /** `v_visit_ip_status` dice `no_corresponde` o `entregado_en_otra_visita`. */
  cerrada: boolean
  prevista: boolean
  readOnly: boolean
  /** El `estado` de `v_visit_ip_status`; `null` = la visita no tiene fila en la vista. */
  estadoIp: EstadoIp | null
  /** Fechada antes de la 0119 (`esVisitaHistorica`). */
  historica: boolean
}

export function contenidoSeccionIp(s: SituacionIp): ContenidoIp {
  if (s.hayArchivo) return 'pendiente'
  if (s.hayPedidoAbierto && s.pedidoAbiertoLaAcepta) return 'en_curso'
  if (s.entregadoConConstancia) return 'entregado'
  if (s.cargando) return 'cargando'
  if (s.cerrada) return 'cierre'
  if (s.prevista) {
    if (!s.readOnly && !s.hayPedidoAbierto) return 'adjuntar'
    // En lectura. Si la base sabe algo del IP de esta visita, se dice eso —aunque la visita sea
    // vieja—; si no sabe nada, la marca de la 0119 separa «no se registraba» de «no hay registro».
    if (s.estadoIp) return 'desenlace'
    return s.historica ? 'historica' : 'sin_registro'
  }
  return 'no_prevista'
}

/**
 * Si la visita es anterior al registro del IP: fechada y con `lleva_ip` vacío. Es el corte de la 0119
 * («sellada» quiere decir «fechada después de la 0119»), sin fecha literal y sin la trampa del huso.
 * Sin la fila —la RLS filtra en silencio— NO es histórica: nunca se afirma «anterior al registro» sin
 * haber visto la marca.
 */
export function esVisitaHistorica(marca: MarcaIpRow | null): boolean {
  if (!marca) return false
  return marca.lleva_ip === null && (marca.real_date !== null || marca.attended_at !== null)
}

/**
 * Si la sección trae su propia puerta, «Registrar la entrega» (spec 2026-09-19, E3). Sólo con el IP
 * sin entregar y sin nada vivo en Farmacia: con `pedido` lo resuelve Farmacia, el mismo criterio que
 * `accionesIp`. El panel le suma la condición del botón de concomitante: permiso, visita cerrada y
 * sin estar corrigiendo.
 */
export function ofrecerRegistrarIp(contenido: ContenidoIp, estadoIp: EstadoIp | null): boolean {
  return contenido === 'desenlace' && (estadoIp === 'sin_pedir' || estadoIp === 'rechazado')
}

/**
 * Si va el aviso de entrega repetida (spec 2026-09-19, E4). Existe para frenar un segundo pedido; con
 * la entrega ya a la vista, o con un cierre, advertía sobre la propia entrega. Mira el CONTENIDO y no
 * sólo el estado: con la entrega hecha y el modo corrección abierto, elegir una constancia nueva pasa
 * a `pendiente`, y ahí el aviso vuelve a hacer falta. Es justo una segunda entrega.
 */
export function mostrarAvisoIp(contenido: ContenidoIp, estadoIp: EstadoIp | null): boolean {
  if (contenido === 'entregado' || contenido === 'cierre') return false
  return !(contenido === 'desenlace' && estadoIp === 'entregado')
}
```

- [ ] **Step 5: Correr el test del modelo y ver que pasa**

Run: `npx vitest run src/views/pharma/seccionIpModel.test.ts`
Expected: PASS, todos. (El typecheck todavía falla en `SeccionIp.tsx` y en el panel, que siguen nombrando `sin_constancia`: se arregla en los dos pasos que siguen.)

- [ ] **Step 6: `SeccionIp` dibuja las ramas nuevas**

En `src/views/pharma/SeccionIp.tsx`:

1. El comentario de `lineaStyle`: reemplazar `/** Una línea de texto de la sección: el estado vacío, el cierre, "Sin constancia cargada.". */` por:

```ts
/** Una línea de texto de la sección: el estado vacío, el cierre, el desenlace. */
```

2. En la desestructuración de props, reemplazar `constanciaIncompleta, entregado, cierre, onPedirFueraDeCronograma,` por:

```tsx
  constanciaIncompleta, entregado, desenlace, onRegistrarEntrega, onPedirFueraDeCronograma,
```

3. En el tipo de las props, reemplazar:

```tsx
  /** El cierre de la 0119, dicho en palabras (`detalleIp`). */
  cierre: string | null
```

por:

```tsx
  /** Qué pasó con el IP, en la frase de `v_visit_ip_status` (`desenlaceIp`): el cierre y el desenlace. */
  desenlace: string | null
  /** La puerta de la sección (spec 2026-09-19, E3): abre el modo corrección. `null` = no se ofrece. */
  onRegistrarEntrega: (() => void) | null
```

4. En el `case 'cierre':`, reemplazar `{cierre ?? 'Se cerró sin entrega en esta visita.'}` por `{desenlace ?? 'Se cerró sin entrega en esta visita.'}`.

5. Reemplazar el caso entero:

```tsx
    case 'sin_constancia':
      cuerpo = <div style={{ ...muted, padding: '2px 0' }}>Sin constancia cargada.</div>
      break
```

por:

```tsx
    case 'desenlace':
      // Lo que dice `v_visit_ip_status`, con la MISMA frase que la fila de Procedimientos (spec del
      // 2026-09-19, E1). Con el IP sin entregar va su propia puerta (E3): abre el modo corrección de la
      // tarjeta, el mismo que «Registrar entrega» de concomitante, que nadie iba a buscar ahí para el IP.
      // El armado del renglón es el de `no_prevista`: texto con base de 200px y el botón que baja en
      // una tarjeta angosta.
      cuerpo = (
        <div style={{ ...lineaStyle, flexWrap: 'wrap', rowGap: 8 }}>
          <span style={{ flex: '1 1 200px', minWidth: 0 }}>{desenlace ?? 'Sin entrega registrada.'}</span>
          {onRegistrarEntrega && (
            <button
              type="button" onClick={onRegistrarEntrega} style={btnChico}
              aria-label="Registrar la entrega del producto en investigación"
            >
              Registrar la entrega
            </button>
          )}
        </div>
      )
      break
    case 'historica':
      // Fechada antes de la 0119, cuando Spira no registraba el IP: el dato vivía en papel y la base no
      // sabe qué pasó. Se dice eso y nada más (E2): sin acción y sin alerta.
      cuerpo = <div style={{ ...muted, padding: '2px 0' }}>Visita anterior al registro del IP en Spira.</div>
      break
    case 'sin_registro':
      // Prevista y sin nada en la base. El caso raro es una visita fechada después de la 0119 con la marca
      // en falso y el cronograma tildado más tarde. También es el resguardo si la marca no se pudo leer.
      cuerpo = <div style={{ ...muted, padding: '2px 0' }}>Sin entrega registrada.</div>
      break
```

El «Sin constancia cargada.» de la rama `en_curso` **queda como está**: ahí un pedido abierto acepta la constancia y todavía no la tiene, así que sí falta un papel.

- [ ] **Step 7: El panel cablea la marca, la puerta y el aviso**

En `src/views/pharma/VisitDispensationPanel.tsx`:

1. Imports. Reemplazar `import { bumpIpEstado, useVisitIpStatus } from '../../data/visitIp'` por:

```ts
import { bumpIpEstado, useMarcaIp, useVisitIpStatus } from '../../data/visitIp'
```

y reemplazar `import { contenidoSeccionIp } from './seccionIpModel'` por:

```ts
import { contenidoSeccionIp, esVisitaHistorica, mostrarAvisoIp, ofrecerRegistrarIp } from './seccionIpModel'
```

2. Debajo de `const ipQ = useVisitIpStatus(visit.id)`, agregar:

```ts
  /** La marca de la 0119, para decir «Visita anterior al registro del IP» sólo cuando es cierto (spec del
   *  2026-09-19, E2). Aparte porque `v_track_visits` no la trae. */
  const marcaQ = useMarcaIp(visit.id)
```

3. Debajo de `const puedeCargar = !readOnly && (!cerrada || corrigiendo)`, agregar:

```ts
  /**
   * Cuándo se ofrece corregir una visita terminada, y el gesto que lo abre. Lo usan DOS puertas:
   * «Registrar entrega» / «Corregir entrega» de concomitante y «Registrar la entrega» de la sección
   * del IP (spec 2026-09-19, E3). Una sola condición y un solo gesto, para que las dos no puedan
   * divergir. `!== 'cargando'`: mientras la lectura de pedidos no vuelve, no se sabe si hubo entrega
   * (Hallazgo 1, revisión final 2026-09-15).
   */
  const puedeCorregir = !readOnly && cerrada && !corrigiendo && vista.concomitante.tipo !== 'cargando'
  const abrirCorreccion = () => { setCorrigiendo(true); setSoliciting(true); setErr(null) }
```

4. El botón de concomitante usa lo mismo. Reemplazar:

```tsx
            {!readOnly && cerrada && !corrigiendo && vista.concomitante.tipo !== 'cargando' && (
              <button type="button" onClick={() => { setCorrigiendo(true); setSoliciting(true); setErr(null) }} style={btnChico}>
```

por:

```tsx
            {puedeCorregir && (
              <button type="button" onClick={abrirCorreccion} style={btnChico}>
```

5. El cálculo del contenido. Reemplazar el bloque entero, desde `const ipCerrada = …` hasta el `})` que cierra `contenidoSeccionIp({`, por:

```ts
  const ipCerrada = ipQ.data?.estado === 'no_corresponde' || ipQ.data?.estado === 'entregado_en_otra_visita'
  const estadoIp = ipQ.data?.estado ?? null
  const contenidoIp = contenidoSeccionIp({
    hayArchivo: archivo !== null,
    hayPedidoAbierto: ipEnCurso,
    pedidoAbiertoLaAcepta: ipAceptaAdjunto,
    entregadoConConstancia: constanciaEntregada !== null && reqEntregado !== null,
    // Tratar el error igual que la carga, misma razón que la sección de arriba: una consulta que
    // FALLA deja `data` en `null` para siempre, y sin esto la sección leía ese cero como un hecho
    // y afirmaba "El cronograma no lo pide" o «Sin entrega registrada.» sobre una visita que sí
    // llevó producto en investigación. La marca de la 0119 entra por lo mismo: sin ella, un instante
    // de «Sin entrega registrada.» antes de saber que era «anterior al registro».
    cargando: reqQ.loading || ipQ.loading || marcaQ.loading || !!reqQ.error || !!ipQ.error || !!marcaQ.error,
    cerrada: ipCerrada,
    prevista: ipPrevisto,
    /* Con la visita terminada el IP se lee, no se carga: es el mismo criterio que la sección de
       arriba, y arreglar sólo la mitad dejaría la incoherencia 60px más abajo en la misma tarjeta.
       `contenidoSeccionIp` ya sabe hacerlo: con `readOnly` una visita prevista cae en el desenlace,
       la histórica o «sin registro» (estados de lectura) en vez de «adjuntar». */
    readOnly: readOnly || (cerrada && !corrigiendo),
    estadoIp,
    historica: esVisitaHistorica(marcaQ.data),
  })
```

6. En la llamada a `<SeccionIp`, reemplazar la línea del aviso:

```tsx
              aviso: <AvisoIpReciente query={ctxQ} aviso={avisoIp(ctxQ.data ?? [], ahora)} />,
```

por:

```tsx
              // Sin el aviso sobre una entrega ya hecha (spec 2026-09-19, E4): advertía sobre sí misma.
              aviso: mostrarAvisoIp(contenidoIp, estadoIp)
                ? <AvisoIpReciente query={ctxQ} aviso={avisoIp(ctxQ.data ?? [], ahora)} />
                : null,
```

7. En la misma llamada, reemplazar:

```tsx
            cierre={ipCerrada && ipQ.data ? desenlaceIp(ipQ.data, visit.ready_at !== null) : null}
```

por:

```tsx
            desenlace={ipQ.data ? desenlaceIp(ipQ.data, visit.ready_at !== null) : null}
            onRegistrarEntrega={puedeCorregir && ofrecerRegistrarIp(contenidoIp, estadoIp) ? abrirCorreccion : null}
```

- [ ] **Step 8: Typecheck y tests**

Run: `npx tsc --noEmit`
Expected: sin errores. Si alguno nombra `sin_constancia`, buscarlo con `git grep -n "sin_constancia" src` y cambiarlo según la tabla del modelo: tiene que quedar **cero** apariciones.

Run: `npx vitest run src/views/track src/views/pharma`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd "C:/Users/Tutuca/Desktop/Spira/Spira App/.claude/worktrees/unruffled-dubinsky-186253"
git add src/data/visitIp.ts src/views/pharma/seccionIpModel.ts src/views/pharma/seccionIpModel.test.ts src/views/pharma/SeccionIp.tsx src/views/pharma/VisitDispensationPanel.tsx
git commit -m "feat(ip): la sección del IP dice qué pasó, con su propia puerta

«Sin constancia cargada.» se parte en el desenlace de v_visit_ip_status,
«Visita anterior al registro del IP en Spira.» (lleva_ip vacío, leído
con useMarcaIp) y «Sin entrega registrada.». «Registrar la entrega» abre
el mismo modo corrección que concomitante, y el aviso de entrega repetida
ya no sale sobre una entrega hecha.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Gate, verificación en el preview y PR

**Files:**
- Create (fuera del repo): `<scratchpad>/crear-pr.mjs`, `<scratchpad>/pr-desenlace-ip.md`

**Interfaces:**
- Consumes: las Tasks 1 y 2 commiteadas.
- Produces: la PR abierta, con la evidencia del preview en el cuerpo.

- [ ] **Step 1: Gate completo**

Run: `npm run build`
Expected: typecheck sin errores, vitest verde y `vite build` terminado. Si vitest levanta tests de otros worktrees y alguno falla, confirmarlo con `npx vitest run --exclude ".claude/worktrees/**"`: ese es el conteo que vale.

- [ ] **Step 2: Verificar en el preview, sólo lectura**

El preview `spira-dev` (5250) sirve este worktree. Levantarlo con `preview_start { name: 'spira-dev' }`, y comprobar con `fetch('/src/views/pharma/seccionIpModel.ts')` que el archivo trae `esVisitaHistorica`. **El Director se loguea**; el agente no ingresa contraseñas.

Abrir cada visita con `history.pushState` + `popstate` desde `javascript_tool`, esperar 5 s y leer el texto del diálogo:

| Visita | URL | Qué tiene que decir |
|---|---|---|
| Fontana Toledo V1 (terminada, sin pedir) | `/coordinacion/pacientes/LTS17231/032001500006?visita=3846a947-89ce-414d-94d2-ee970742d575` | Sección: «Sin entregar: no se pidió a Farmacia.» y el botón «Registrar la entrega». Fila: «Sin entregar: no se pidió a Farmacia. Se carga desde Dispensación.» y «No se entrega acá» |
| Calderon V4 (histórica) | `/coordinacion/pacientes/LTS17231/032001500001?visita=66bd5bf3-6220-47be-ba46-ae144fc2a138` | Sección: «Visita anterior al registro del IP en Spira.», sin botón. Sin fila del IP en Procedimientos |
| Azcurra V3 (entregada) | `/coordinacion/pacientes/222714/707406?visita=d805f6c5-bccb-4ff4-abe8-aeb5a9d3e428` | La constancia y el pedido, **sin** «Ya se entregó producto en investigación…» |
| Una visita agendada con IP (por ejemplo, Calderon V5) | abrirla desde el cronograma de la ficha de Calderon | Fila: «Todavía no se pidió a Farmacia. Se pide desde Dispensación.» |

Después, en Fontana V1, tocar «Registrar la entrega» con `element.click()` y confirmar que la sección pasa al dropzone y que desaparecen las dos puertas. **No elegir archivo ni enviar nada**: cerrar el modal con Escape y volver a abrir la visita, para ver que sigue diciendo «Sin entregar…», porque no se guardó nada.

Consola: interceptar `console.error` antes de abrir cada visita (el buffer sobrevive a los reloads) y confirmar que no hay errores nuevos. Evidencia: el texto leído de cada diálogo y un `screenshot` de Fontana V1.

- [ ] **Step 3: Push y PR**

```bash
cd "C:/Users/Tutuca/Desktop/Spira/Spira App/.claude/worktrees/unruffled-dubinsky-186253"
git -c credential.interactive=false push -u origin feat/desenlace-ip
```

`<scratchpad>/crear-pr.mjs`:

```js
// node crear-pr.mjs <rama> <título> <archivo del cuerpo>: abre la PR por la API REST (no hay `gh`).
// El token sale del helper de git con la cuenta del repo y va directo a la cabecera: nunca se imprime.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const [head, title, archivo] = process.argv.slice(2)
const salida = execFileSync('git', ['-c', 'credential.interactive=false', 'credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\nusername=spiraclinicapp\n\n', encoding: 'utf8', timeout: 20000,
})
const token = salida.match(/^password=(.*)$/m)?.[1]
if (!token) { console.error('sin token'); process.exit(1) }
const r = await fetch('https://api.github.com/repos/spiraclinicapp/Spira-App/pulls', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'spira-agente' },
  body: JSON.stringify({ title, head, base: 'main', body: readFileSync(archivo, 'utf8') }),
})
const j = await r.json()
console.log(r.status, j.html_url ?? j.message)
```

`<scratchpad>/pr-desenlace-ip.md`: qué trae (los tres arreglos, con la tabla «Cómo queda en pantalla» del spec), que **no tiene SQL**, la evidencia del Step 2 y los links al spec y al plan. Termina con:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Run: `node "<scratchpad>/crear-pr.mjs" feat/desenlace-ip "El desenlace del IP en una visita cerrada" "<scratchpad>/pr-desenlace-ip.md"`
Expected: `201 https://github.com/spiraclinicapp/Spira-App/pull/<N>`

- [ ] **Step 4: Avisar**

En el chat: la PR, que no lleva migración, y que el deploy lo hace Vercel al mergear. Después del merge y del deploy, **sale versión** (skill `cierre-jornada`, modo release): el cambio llega al bundle.
