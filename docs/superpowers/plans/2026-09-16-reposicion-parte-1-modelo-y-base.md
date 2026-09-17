# Reposición de corte a corte · Parte 1: modelo, datos y migración 0128 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar lista y aplicada en prod la base del submódulo Reposición: la cuenta de corte a corte con sus tests, los hooks y mutaciones, y la migración `0128` (día de corte, pedidos de medicación, recepción de un pedido), sin tocar lo que hoy usa la card de Estadísticas.

**Architecture:** Tres módulos puros nuevos en `src/data/pharma/` (período, pedidos, reposición del período) que reusan las reglas del modelo del 14/09 sin romperlo. Una función `SECURITY DEFINER` trae los datos crudos y TypeScript hace la cuenta (D11). La `0128` es **aditiva**: se aplica antes que el front, y la `0125` queda intacta hasta la `0129` (Parte 2).

**Tech Stack:** TypeScript strict, React 19 (sólo hooks), Supabase (PostgREST + plpgsql), vitest, PGlite para probar el SQL.

**Spec:** [`docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md`](../specs/2026-09-16-reposicion-submodulo-design.md)

## Global Constraints

- Comentarios, nombres de dominio y copy en **castellano rioplatense**, con la densidad de comentarios del código vecino (el porqué, no el qué).
- **Fechas `YYYY-MM-DD` sin zona horaria** en todo el modelo; el «hoy» siempre por parámetro, en hora AR. Tests con fechas fijas: **CI corre en UTC**.
- Modelos **puros**: no importan `lib/supabase` (patrón `*Model.ts`).
- Copy de avisos: una frase, sin tecnicismos. «envases» completo, nunca «env.».
- **La `0125` y todo lo que usa `ComprasDelMes.tsx` siguen funcionando** al final de este plan: nada se borra ni cambia de firma de forma incompatible.
- SQL: calificar todo; `gen_random_uuid()`, nunca `uuid_generate_v4()`; **cero pares de signos peso pegados en comentarios**; cada función nueva con `revoke all … from public`; sentencias idempotentes (el editor de Supabase no comparte sesión ni transacción).
- Git: rama de trabajo, **nunca commitear en `main`**; stagear **por ruta**; commits terminan con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- `supabase/README.md` es CRLF: editarlo con la herramienta Edit, nunca reescribirlo desde Node.
- Tests puntuales con `npx vitest run <archivo>`: `npm run test` suma los worktrees de otras sesiones.

## Mapa de archivos

| Archivo | Qué hace | Tarea |
|---|---|---|
| `src/data/pharma/periodoDeCorte.ts` (nuevo) | El período de corte a corte: `periodoDe`, siguiente, anterior, días al corte | 1 |
| `src/data/pharma/periodoDeCorte.test.ts` (nuevo) | Bordes de mes, bisiesto, cruce de año, continuidad | 1 |
| `src/data/pharma/pedidosMedicacionModel.ts` (nuevo) | Faltante por renglón, estado del pedido, lo ya pedido, qué recibir | 2 |
| `src/data/pharma/pedidosMedicacionModel.test.ts` (nuevo) | | 2 |
| `src/data/pharma/reposicionModel.ts` | Sólo tipos: tres funciones aceptan un `Pick` para servir a los dos JSON | 3 |
| `src/data/pharma/reposicionPeriodoModel.ts` (nuevo) | JSON de `reposicion_del_periodo`, libro, boleta, armado por estudio, borrador del pedido | 3 |
| `src/data/pharma/reposicionPeriodoModel.test.ts` (nuevo) | | 3 |
| `src/data/pharma/index.ts` | Exporta los tres módulos nuevos | 3 |
| `supabase/migrations/0128_reposicion_de_corte_a_corte.sql` (nuevo) | Día de corte, dos tablas, `pedido_id`, cuatro funciones, `create_reception` | 4 |
| `supabase/README.md` | Fila de la 0128 | 4 |
| `<scratchpad>/pglite-0128/probar.mjs` (fuera del repo) | Corre la 0128 dos veces en PGlite y prueba sus caminos | 4 |
| `src/data/pharma/reposicion.ts` | `useDiaCorte`, `useReposicionDelPeriodo`, `guardarDiaCorte`, emitir, anular, cerrar faltante | 5 |
| `src/data/pharma/receptions.ts` | `pedido_id` opcional en `createReception` | 5 |
| `<scratchpad>/sondas-0128.mjs` (fuera del repo) | Sondas sin sesión después de aplicar | 6 |

`<scratchpad>` = `C:\Users\Tutuca\AppData\Local\Temp\claude\C--Users-Tutuca-Desktop-Spira-Spira-App\70f54b9a-6220-4939-957b-f9b3b49b9184\scratchpad`. Si la sesión es otra, usar su carpeta temporal: estos dos scripts no se commitean (precedente: las sondas de la 0125).

---

### Task 1: El período de corte a corte

**Files:**
- Create: `src/data/pharma/periodoDeCorte.ts`
- Test: `src/data/pharma/periodoDeCorte.test.ts`

**Interfaces:**
- Consumes: `sumarDias(iso: string, dias: number): string` y `diaMes(iso: string): string` de `./reposicionModel` (existen).
- Produces:
  - `interface Periodo { desde: string; hasta: string }`
  - `ultimoDiaDelMes(anio: number, mes: number): number`
  - `corteDelMes(anio: number, mes: number, diaCorte: number): string`
  - `periodoDe(hoy: string, diaCorte: number): Periodo`
  - `periodoSiguiente(p: Periodo, diaCorte: number): Periodo`
  - `periodoAnterior(p: Periodo, diaCorte: number): Periodo`
  - `enCurso(p: Periodo, hoy: string): boolean`
  - `diasHastaElCorte(hoy: string, p: Periodo): number`
  - `textoPeriodo(p: Periodo): string` → `'29/08 → 28/09'`
  - `esDiaDeCorteValido(n: number): boolean`

- [ ] **Step 1: Crear la rama de trabajo**

Desde la rama del diseño (trae el spec y este plan):

```bash
cd "C:/Users/Tutuca/Desktop/Spira/Spira App"
git fetch origin
git switch docs/reposicion-submodulo-diseno
git switch -c feat/reposicion-periodo-base
git branch --show-current
```

Expected: `feat/reposicion-periodo-base`

- [ ] **Step 2: Escribir el test que falla**

`src/data/pharma/periodoDeCorte.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  corteDelMes, diasHastaElCorte, enCurso, esDiaDeCorteValido, periodoAnterior, periodoDe, periodoSiguiente,
  textoPeriodo, ultimoDiaDelMes,
} from './periodoDeCorte'
import { sumarDias } from './reposicionModel'

/**
 * El período de corte a corte (spec 2026-09-16, R4).
 *
 * Se testea porque un período mal armado no se ve: la pantalla dibuja igual de prolijo un «01/03 → 30/03»
 * que un «04/03 → 30/03», y lo retirado de esos tres días desaparece de la cuenta sin avisar.
 */

describe('corteDelMes', () => {
  it('recorta el día al último del mes', () => {
    expect(corteDelMes(2026, 2, 31)).toBe('2026-02-28')
    expect(corteDelMes(2028, 2, 30)).toBe('2028-02-29')
    expect(corteDelMes(2026, 4, 31)).toBe('2026-04-30')
    expect(corteDelMes(2026, 9, 28)).toBe('2026-09-28')
  })
  it('cruza el año hacia los dos lados', () => {
    expect(corteDelMes(2026, 13, 28)).toBe('2027-01-28')
    expect(corteDelMes(2026, 0, 28)).toBe('2025-12-28')
  })
})

describe('periodoDe (R4)', () => {
  it('corte 28: a mitad de septiembre va del 29/08 al 28/09', () => {
    expect(periodoDe('2026-09-16', 28)).toEqual({ desde: '2026-08-29', hasta: '2026-09-28' })
  })
  it('el día de corte todavía es del período que termina', () => {
    expect(periodoDe('2026-09-28', 28)).toEqual({ desde: '2026-08-29', hasta: '2026-09-28' })
  })
  it('el día siguiente al corte empieza el período nuevo', () => {
    expect(periodoDe('2026-09-29', 28)).toEqual({ desde: '2026-09-29', hasta: '2026-10-28' })
  })
  it('cruza el año', () => {
    expect(periodoDe('2026-12-29', 28)).toEqual({ desde: '2026-12-29', hasta: '2027-01-28' })
  })
  it('corte 31: febrero corta el 28, y el 29 en bisiesto', () => {
    expect(periodoDe('2027-02-15', 31)).toEqual({ desde: '2027-02-01', hasta: '2027-02-28' })
    expect(periodoDe('2027-03-01', 31)).toEqual({ desde: '2027-03-01', hasta: '2027-03-31' })
    expect(periodoDe('2028-02-29', 31)).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' })
  })
  it('corte 30: el 31 de enero ya es del período de febrero', () => {
    expect(periodoDe('2027-01-31', 30)).toEqual({ desde: '2027-01-31', hasta: '2027-02-28' })
  })
  it('corte 1: el período va del 2 al 1', () => {
    expect(periodoDe('2026-09-01', 1)).toEqual({ desde: '2026-08-02', hasta: '2026-09-01' })
    expect(periodoDe('2026-09-02', 1)).toEqual({ desde: '2026-09-02', hasta: '2026-10-01' })
  })
})

describe('períodos seguidos', () => {
  it('corte 30: después de febrero viene del 01/03 al 30/03, y antes, del 31/12 al 30/01', () => {
    const feb = { desde: '2027-01-31', hasta: '2027-02-28' }
    expect(periodoSiguiente(feb, 30)).toEqual({ desde: '2027-03-01', hasta: '2027-03-30' })
    expect(periodoAnterior(feb, 30)).toEqual({ desde: '2026-12-31', hasta: '2027-01-30' })
  })
  for (const dia of [1, 15, 28, 29, 30, 31]) {
    it(`corte ${dia}: dos años de períodos sin huecos ni superposiciones`, () => {
      let p = periodoDe('2026-01-10', dia)
      for (let i = 0; i < 24; i++) {
        const sig = periodoSiguiente(p, dia)
        expect(sig.desde).toBe(sumarDias(p.hasta, 1))
        expect(periodoAnterior(sig, dia)).toEqual(p)
        const [y, m, d] = sig.hasta.split('-').map(Number)
        expect(d).toBe(Math.min(dia, ultimoDiaDelMes(y, m)))
        p = sig
      }
    })
  }
})

describe('ayudas de pantalla', () => {
  const p = { desde: '2026-08-29', hasta: '2026-09-28' }
  it('enCurso incluye los dos bordes', () => {
    expect(enCurso(p, '2026-08-29')).toBe(true)
    expect(enCurso(p, '2026-09-28')).toBe(true)
    expect(enCurso(p, '2026-09-29')).toBe(false)
  })
  it('días hasta el corte', () => {
    expect(diasHastaElCorte('2026-09-16', p)).toBe(12)
    expect(diasHastaElCorte('2026-09-28', p)).toBe(0)
  })
  it('texto del período', () => {
    expect(textoPeriodo(p)).toBe('29/08 → 28/09')
  })
  it('día de corte válido: entero del 1 al 31', () => {
    expect([1, 28, 31].every((n) => esDiaDeCorteValido(n))).toBe(true)
    expect([0, 32, 2.5, Number.NaN].some((n) => esDiaDeCorteValido(n))).toBe(false)
  })
})
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `npx vitest run src/data/pharma/periodoDeCorte.test.ts`
Expected: FAIL — `Failed to resolve import "./periodoDeCorte"`.

- [ ] **Step 4: Implementar**

`src/data/pharma/periodoDeCorte.ts`:

```ts
import { diaMes, sumarDias } from './reposicionModel'

/**
 * ┌─ El período de corte a corte (docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md, R4) ─┐
 *
 * Como el resumen de la tarjeta de crédito: Farmacia carga UN día de corte (p. ej. el 28) y el período va
 * del día siguiente al corte anterior hasta el día de corte, inclusive. Lo que pasa después del corte es
 * del período siguiente.
 *
 *   corte 28:   29/08 ────────────── 28/09 │ 29/09 ────────────── 28/10
 *                       P0 (en curso)      │   P1 (el que se compra)
 *
 * Si el día cargado no existe en un mes (29, 30 o 31), el corte de ese mes es su último día: con corte 31,
 * febrero corta el 28 (el 29 en bisiesto) y abril el 30. Sin esa regla, un «31/02» pasa por `Date` como
 * «03/03» y el período de marzo arranca tres días tarde, sin ningún error a la vista.
 *
 * Fechas `YYYY-MM-DD` y SIN zona horaria: el «hoy» lo pone el llamador en hora AR (CI corre en UTC).
 * └────────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

export interface Periodo {
  /** Primer día, inclusive. */
  desde: string
  /** Día de corte, inclusive. */
  hasta: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Último día del mes (`mes` de 1 a 12). */
export function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

/** El día de corte de un mes, recortado a su último día. `mes` de 1 a 12; admite 0 y 13 para cruzar el año. */
export function corteDelMes(anio: number, mes: number, diaCorte: number): string {
  const total = anio * 12 + (mes - 1)
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return `${y}-${pad(m)}-${pad(Math.min(diaCorte, ultimoDiaDelMes(y, m)))}`
}

/** El período que contiene a `hoy`. */
export function periodoDe(hoy: string, diaCorte: number): Periodo {
  const [y, m] = hoy.split('-').map(Number)
  const corteEste = corteDelMes(y, m, diaCorte)
  if (hoy <= corteEste) return { desde: sumarDias(corteDelMes(y, m - 1, diaCorte), 1), hasta: corteEste }
  return { desde: sumarDias(corteEste, 1), hasta: corteDelMes(y, m + 1, diaCorte) }
}

/** El período que empieza el día después del corte de `p`. */
export function periodoSiguiente(p: Periodo, diaCorte: number): Periodo {
  return periodoDe(sumarDias(p.hasta, 1), diaCorte)
}

/** El período que termina el día antes de que empiece `p`. */
export function periodoAnterior(p: Periodo, diaCorte: number): Periodo {
  return periodoDe(sumarDias(p.desde, -1), diaCorte)
}

export function enCurso(p: Periodo, hoy: string): boolean {
  return p.desde <= hoy && hoy <= p.hasta
}

const diaUTC = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Días que faltan para el corte (0 el mismo día del corte). */
export function diasHastaElCorte(hoy: string, p: Periodo): number {
  return Math.round((diaUTC(p.hasta) - diaUTC(hoy)) / 86_400_000)
}

/** `29/08 → 28/09`. */
export function textoPeriodo(p: Periodo): string {
  return `${diaMes(p.desde)} → ${diaMes(p.hasta)}`
}

/** Lo que acepta la columna `farmacia_ajustes.dia_corte` (0128). */
export function esDiaDeCorteValido(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 31
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run src/data/pharma/periodoDeCorte.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 6: Commit**

```bash
git add src/data/pharma/periodoDeCorte.ts src/data/pharma/periodoDeCorte.test.ts
git commit -m "feat(reposicion): el período de corte a corte

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Los pedidos de medicación

**Files:**
- Create: `src/data/pharma/pedidosMedicacionModel.ts`
- Test: `src/data/pharma/pedidosMedicacionModel.test.ts`

**Interfaces:**
- Consumes: `diaMes` de `./reposicionModel`; `Periodo` de `./periodoDeCorte` (Task 1).
- Produces (la forma de las filas es la del JSON de `reposicion_del_periodo`, Task 4):
  - `type MotivoCierre = 'no_lo_tiene' | 'discontinuado' | 'no_hace_falta'`, `MOTIVOS_CIERRE`
  - `type MotivoAnulacion = 'por_error' | 'rehecho'`, `MOTIVOS_ANULACION`
  - `interface PedidoMedicacionInsumo`, `interface PedidoItemInsumo`
  - `type EstadoPedido = 'sin_recibir' | 'en_parte' | 'recibido' | 'anulado'`
  - `interface RenglonPedido extends PedidoItemInsumo { faltante: number }`
  - `interface PedidoMedicacion extends PedidoMedicacionInsumo { renglones; estado; pedidoTotal; recibidoTotal; faltanteTotal; faltoCerrado; conRecepcionSinVerificar }`
  - `faltanteDe(item: PedidoItemInsumo): number`
  - `armarPedidos(pedidos: readonly PedidoMedicacionInsumo[], items: readonly PedidoItemInsumo[]): PedidoMedicacion[]`
  - `etiquetaEstado(p: PedidoMedicacion): string`
  - `yaPedidoDe(pedidos: readonly PedidoMedicacion[], protocolId: string, medicationId: string): { envases: number; pedidos: { numero: number; emitido_el: string }[] }`
  - `textoDePedidos(pedidos: readonly { numero: number; emitido_el: string }[]): string`
  - `pedidosParaRecibir(pedidos: readonly PedidoMedicacion[]): PedidoMedicacion[]`
  - `pedidoDestacado(pedidos: readonly PedidoMedicacion[], proximo: Periodo): PedidoMedicacion | null`
  - `renglonesParaRecibir(p: PedidoMedicacion): { medicationId: string; nombre: string; cantidad: number }[]`

- [ ] **Step 1: Escribir el test que falla**

`src/data/pharma/pedidosMedicacionModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  armarPedidos, etiquetaEstado, faltanteDe, pedidoDestacado, pedidosParaRecibir, renglonesParaRecibir, textoDePedidos,
  yaPedidoDe,
  type PedidoItemInsumo, type PedidoMedicacionInsumo,
} from './pedidosMedicacionModel'

/**
 * Pedidos de medicación (spec 2026-09-16, R8-R11).
 *
 * Se testea porque el estado del pedido se DEDUCE de lo recibido y nadie lo marca a mano: un faltante mal
 * contado deja envases «en camino» para siempre y la compra sale corta, sin nada en pantalla que lo delate.
 */

const cab = (p: Partial<PedidoMedicacionInsumo> = {}): PedidoMedicacionInsumo => ({
  id: 'ped-14', numero: 14, protocol_id: 'endura', periodo_desde: '2026-09-29', periodo_hasta: '2026-10-28',
  emitido_el: '2026-09-28', emitido_por_nombre: 'Lautaro Molina',
  anulado_at: null, anulado_por_nombre: null, anulado_motivo: null, ...p,
})
const item = (p: Partial<PedidoItemInsumo> = {}): PedidoItemInsumo => ({
  id: 'it-seretide', pedido_id: 'ped-14', medication_id: 'seretide', medication_name: 'Seretide 250/50', presentacion: 'Aerosol',
  calculado: 4, pedido: 6, cerrado_at: null, cerrado_por_nombre: null, cerrado_motivo: null, recibido: 0, sin_verificar: 0, ...p,
})
const salbutral = (p: Partial<PedidoItemInsumo> = {}) =>
  item({ id: 'it-salbu', medication_id: 'salbu', medication_name: 'Salbutral 100 mcg', calculado: 7, pedido: 7, ...p })
const CERRADO = { cerrado_at: '2026-10-05T14:00:00+00:00', cerrado_por_nombre: 'Lautaro Molina', cerrado_motivo: 'no_lo_tiene' as const }
const ANULADO = { anulado_at: '2026-09-28T15:00:00+00:00', anulado_por_nombre: 'Lautaro Molina', anulado_motivo: 'por_error' as const }
const PROXIMO = { desde: '2026-09-29', hasta: '2026-10-28' }

describe('faltanteDe', () => {
  it('es lo pedido menos lo recibido', () => {
    expect(faltanteDe(item())).toBe(6)
    expect(faltanteDe(item({ recibido: 4 }))).toBe(2)
  })
  it('recibir de más no da negativo', () => {
    expect(faltanteDe(item({ recibido: 8 }))).toBe(0)
  })
  it('un renglón cerrado con «No va a llegar» no tiene faltante (R11)', () => {
    expect(faltanteDe(item({ recibido: 5, ...CERRADO }))).toBe(0)
  })
})

describe('estado del pedido', () => {
  const uno = (c: Partial<PedidoMedicacionInsumo>, items: PedidoItemInsumo[]) => armarPedidos([cab(c)], items)[0]

  it('sin nada recibido: sin recibir', () => {
    const p = uno({}, [item(), salbutral()])
    expect(p).toMatchObject({ estado: 'sin_recibir', pedidoTotal: 13, faltanteTotal: 13, recibidoTotal: 0 })
    expect(etiquetaEstado(p)).toBe('sin recibir')
  })
  it('algo recibido y algo faltante: recibido en parte', () => {
    const p = uno({}, [item({ recibido: 6 }), salbutral({ recibido: 2 })])
    expect(p).toMatchObject({ estado: 'en_parte', faltanteTotal: 5, recibidoTotal: 8 })
    expect(etiquetaEstado(p)).toBe('recibido en parte')
  })
  it('todo recibido: recibido', () => {
    const p = uno({}, [item({ recibido: 6 })])
    expect(p.estado).toBe('recibido')
    expect(etiquetaEstado(p)).toBe('recibido')
  })
  it('lo que no va a llegar cierra el pedido y dice cuánto faltó', () => {
    const p = uno({}, [item({ recibido: 5, ...CERRADO })])
    expect(p).toMatchObject({ estado: 'recibido', faltanteTotal: 0, faltoCerrado: 1 })
    expect(etiquetaEstado(p)).toBe('recibido · faltó 1')
  })
  it('un pedido anulado no tiene faltante', () => {
    const p = uno(ANULADO, [item()])
    expect(p).toMatchObject({ estado: 'anulado', faltanteTotal: 0 })
    expect(etiquetaEstado(p)).toBe('anulado')
  })
  it('avisa si tiene una recepción sin verificar', () => {
    expect(uno({}, [item({ sin_verificar: 6 })]).conRecepcionSinVerificar).toBe(true)
    expect(uno({}, [item()]).conRecepcionSinVerificar).toBe(false)
  })
  it('ordena los pedidos del más nuevo al más viejo y los renglones por nombre', () => {
    const ps = armarPedidos(
      [cab({ id: 'ped-13', numero: 13 }), cab()],
      [salbutral(), item(), item({ id: 'it-13', pedido_id: 'ped-13' })],
    )
    expect(ps.map((p) => p.numero)).toEqual([14, 13])
    expect(ps[0].renglones.map((r) => r.medication_name)).toEqual(['Salbutral 100 mcg', 'Seretide 250/50'])
  })
})

describe('lo ya pedido de un medicamento (R9)', () => {
  const pedidos = () => armarPedidos(
    [
      cab({ id: 'ped-13', numero: 13, emitido_el: '2026-08-28' }),
      cab(),
      cab({ id: 'ped-15', numero: 15, ...ANULADO }),
      cab({ id: 'ped-16', numero: 16, protocol_id: 'lts' }),
    ],
    [
      item({ id: 'i13', pedido_id: 'ped-13', pedido: 4, recibido: 3 }),
      item(),
      item({ id: 'i15', pedido_id: 'ped-15' }),
      item({ id: 'i16', pedido_id: 'ped-16' }),
    ],
  )
  it('suma el faltante de los pedidos abiertos del estudio, el más viejo primero', () => {
    expect(yaPedidoDe(pedidos(), 'endura', 'seretide')).toEqual({
      envases: 7,
      pedidos: [{ numero: 13, emitido_el: '2026-08-28' }, { numero: 14, emitido_el: '2026-09-28' }],
    })
  })
  it('otro medicamento no tiene nada pedido', () => {
    expect(yaPedidoDe(pedidos(), 'endura', 'salbu')).toEqual({ envases: 0, pedidos: [] })
  })
})

describe('textoDePedidos', () => {
  it('uno, dos y tres pedidos', () => {
    expect(textoDePedidos([{ numero: 14, emitido_el: '2026-09-28' }])).toBe('Pedido Nº 14 del 28/09')
    expect(textoDePedidos([{ numero: 13, emitido_el: '2026-08-28' }, { numero: 14, emitido_el: '2026-09-28' }])).toBe('Pedidos Nº 13 y Nº 14')
    expect(textoDePedidos([
      { numero: 12, emitido_el: '2026-07-28' }, { numero: 13, emitido_el: '2026-08-28' }, { numero: 14, emitido_el: '2026-09-28' },
    ])).toBe('Pedidos Nº 12, Nº 13 y Nº 14')
  })
})

describe('Recepción: qué se puede recibir (R10)', () => {
  it('sólo los pedidos no anulados con faltante, del más viejo al más nuevo', () => {
    const ps = armarPedidos(
      [cab({ id: 'ped-11', numero: 11 }), cab({ id: 'ped-12', numero: 12 }), cab({ id: 'ped-13', numero: 13, ...ANULADO }), cab()],
      [
        item({ id: 'i11', pedido_id: 'ped-11' }),
        item({ id: 'i12', pedido_id: 'ped-12', recibido: 6 }),
        item({ id: 'i13', pedido_id: 'ped-13' }),
        item(),
      ],
    )
    expect(pedidosParaRecibir(ps).map((p) => p.numero)).toEqual([11, 14])
  })
  it('precarga sólo los renglones con faltante, con lo que falta', () => {
    const p = armarPedidos([cab()], [
      item({ recibido: 2 }),
      salbutral({ recibido: 7 }),
      item({ id: 'it-monte', medication_id: 'monte', medication_name: 'Montelukast 10 mg', pedido: 3, ...CERRADO }),
    ])[0]
    expect(renglonesParaRecibir(p)).toEqual([{ medicationId: 'seretide', nombre: 'Seretide 250/50', cantidad: 4 }])
  })
})

describe('pedido destacado en la tarjeta (R2)', () => {
  it('el más nuevo con faltante', () => {
    const ps = armarPedidos(
      [cab({ id: 'ped-12', numero: 12, periodo_desde: '2026-07-29' }), cab({ id: 'ped-13', numero: 13, periodo_desde: '2026-08-29' })],
      [item({ id: 'i12', pedido_id: 'ped-12', recibido: 6 }), item({ id: 'i13', pedido_id: 'ped-13', recibido: 2 })],
    )
    expect(pedidoDestacado(ps, PROXIMO)?.numero).toBe(13)
  })
  it('o el emitido para el período que viene, aunque ya esté recibido', () => {
    const ps = armarPedidos([cab()], [item({ recibido: 6 })])
    expect(pedidoDestacado(ps, PROXIMO)?.numero).toBe(14)
  })
  it('nada que mostrar: uno viejo y recibido, o uno anulado', () => {
    expect(pedidoDestacado(armarPedidos([cab({ periodo_desde: '2026-07-29' })], [item({ recibido: 6 })]), PROXIMO)).toBeNull()
    expect(pedidoDestacado(armarPedidos([cab(ANULADO)], [item()]), PROXIMO)).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/data/pharma/pedidosMedicacionModel.test.ts`
Expected: FAIL — `Failed to resolve import "./pedidosMedicacionModel"`.

- [ ] **Step 3: Implementar**

`src/data/pharma/pedidosMedicacionModel.ts`:

```ts
import { diaMes } from './reposicionModel'
import type { Periodo } from './periodoDeCorte'

/**
 * ┌─ Pedidos de medicación (docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md, R8-R11) ─┐
 *
 * Farmacia arma un pedido por estudio, lo imprime con número, va a la farmacia y vuelve con la
 * medicación. La Recepción lo recibe, y el estado del pedido SE DEDUCE de lo recibido: nadie marca
 * «llegó» a mano.
 *
 *   por renglón:  recibido = Σ recepciones VERIFICADAS de ese pedido y medicamento   (lo trae la 0128)
 *                 faltante = cerrado («No va a llegar») ? 0 : max(0, pedido − recibido)
 *   por pedido:   anulado → anulado · faltante 0 → recibido · algo recibido → en parte · si no → sin recibir
 *
 * Una recepción anulada deja de sumar en la base, así que el pedido vuelve a tener faltante solo.
 * Lo ya pedido (faltante abierto) se descuenta de la compra (R9).
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

export type MotivoCierre = 'no_lo_tiene' | 'discontinuado' | 'no_hace_falta'
export type MotivoAnulacion = 'por_error' | 'rehecho'

/** Los mismos valores que el check de `pedido_medicacion_items.cerrado_motivo` (0128). */
export const MOTIVOS_CIERRE: readonly { value: MotivoCierre; label: string }[] = [
  { value: 'no_lo_tiene', label: 'La farmacia no lo tiene' },
  { value: 'discontinuado', label: 'Lo discontinuaron' },
  { value: 'no_hace_falta', label: 'Ya no hace falta' },
]

/** Los mismos valores que el check de `pedidos_medicacion.anulado_motivo` (0128). */
export const MOTIVOS_ANULACION: readonly { value: MotivoAnulacion; label: string }[] = [
  { value: 'por_error', label: 'Se emitió por error' },
  { value: 'rehecho', label: 'Se rehízo con otras cantidades' },
]

/** Una fila de `pedidos_medicacion` (0128). */
export interface PedidoMedicacionInsumo {
  id: string
  /** Correlativo y legible («Nº 14»). */
  numero: number
  protocol_id: string
  /** El período PARA el que se pidió (el que se compraba al emitirlo). */
  periodo_desde: string
  periodo_hasta: string
  /** Día de emisión en hora AR. */
  emitido_el: string
  /** Snapshot del nombre: la RLS de `users` sólo expone la fila propia (mismo muro que la 0085). */
  emitido_por_nombre: string | null
  anulado_at: string | null
  anulado_por_nombre: string | null
  anulado_motivo: MotivoAnulacion | null
}

/** Un renglón de `pedido_medicacion_items` (0128), con lo recibido ya sumado por la función. */
export interface PedidoItemInsumo {
  id: string
  pedido_id: string
  medication_id: string
  medication_name: string
  /** `medications.unit`, que en la app es la presentación. */
  presentacion: string | null
  /** Lo que había calculado Spira al emitir; null = estaba sin cargar. */
  calculado: number | null
  pedido: number
  cerrado_at: string | null
  cerrado_por_nombre: string | null
  cerrado_motivo: MotivoCierre | null
  /** Σ de recepciones verificadas con este pedido y medicamento. */
  recibido: number
  /** Σ de recepciones pendientes (sin verificar) con este pedido y medicamento. */
  sin_verificar: number
}

export type EstadoPedido = 'sin_recibir' | 'en_parte' | 'recibido' | 'anulado'

export interface RenglonPedido extends PedidoItemInsumo {
  faltante: number
}

export interface PedidoMedicacion extends PedidoMedicacionInsumo {
  renglones: RenglonPedido[]
  estado: EstadoPedido
  pedidoTotal: number
  recibidoTotal: number
  faltanteTotal: number
  /** Lo que se dio por cerrado sin llegar («recibido · faltó 1»). */
  faltoCerrado: number
  /** Hay una recepción cargada y sin verificar: la Recepción lo avisa para no recibir dos veces. */
  conRecepcionSinVerificar: boolean
}

export function faltanteDe(item: PedidoItemInsumo): number {
  if (item.cerrado_at) return 0
  return Math.max(0, item.pedido - item.recibido)
}

/** Junta cabeceras y renglones y deduce el estado. Del más nuevo al más viejo. */
export function armarPedidos(
  pedidos: readonly PedidoMedicacionInsumo[],
  items: readonly PedidoItemInsumo[],
): PedidoMedicacion[] {
  const porPedido = new Map<string, PedidoItemInsumo[]>()
  for (const it of items) porPedido.set(it.pedido_id, [...(porPedido.get(it.pedido_id) ?? []), it])

  return pedidos
    .map((p): PedidoMedicacion => {
      const renglones = (porPedido.get(p.id) ?? [])
        .map((it) => ({ ...it, faltante: p.anulado_at ? 0 : faltanteDe(it) }))
        .sort((a, b) => a.medication_name.localeCompare(b.medication_name, 'es'))
      const faltanteTotal = renglones.reduce((s, r) => s + r.faltante, 0)
      const recibidoTotal = renglones.reduce((s, r) => s + r.recibido, 0)
      const estado: EstadoPedido = p.anulado_at ? 'anulado'
        : faltanteTotal === 0 ? 'recibido'
          : recibidoTotal > 0 ? 'en_parte'
            : 'sin_recibir'
      return {
        ...p,
        renglones,
        estado,
        pedidoTotal: renglones.reduce((s, r) => s + r.pedido, 0),
        recibidoTotal,
        faltanteTotal,
        faltoCerrado: renglones.filter((r) => r.cerrado_at).reduce((s, r) => s + Math.max(0, r.pedido - r.recibido), 0),
        conRecepcionSinVerificar: renglones.some((r) => r.sin_verificar > 0),
      }
    })
    .sort((a, b) => b.numero - a.numero)
}

export function etiquetaEstado(p: PedidoMedicacion): string {
  if (p.estado === 'anulado') return 'anulado'
  if (p.estado === 'en_parte') return 'recibido en parte'
  if (p.estado === 'sin_recibir') return 'sin recibir'
  return p.faltoCerrado > 0 ? `recibido · faltó ${p.faltoCerrado}` : 'recibido'
}

/** Lo pedido y todavía sin recibir de un medicamento en un estudio: se descuenta de la compra (R9). */
export function yaPedidoDe(
  pedidos: readonly PedidoMedicacion[],
  protocolId: string,
  medicationId: string,
): { envases: number; pedidos: { numero: number; emitido_el: string }[] } {
  const abiertos = pedidos
    .filter((p) => p.estado !== 'anulado' && p.protocol_id === protocolId)
    .map((p) => ({
      p,
      faltante: p.renglones.filter((r) => r.medication_id === medicationId).reduce((s, r) => s + r.faltante, 0),
    }))
    .filter((x) => x.faltante > 0)
    .sort((a, b) => a.p.numero - b.p.numero)
  return {
    envases: abiertos.reduce((s, x) => s + x.faltante, 0),
    pedidos: abiertos.map((x) => ({ numero: x.p.numero, emitido_el: x.p.emitido_el })),
  }
}

/** «Pedido Nº 14 del 28/09» · «Pedidos Nº 13 y Nº 14» · «Pedidos Nº 12, Nº 13 y Nº 14». */
export function textoDePedidos(pedidos: readonly { numero: number; emitido_el: string }[]): string {
  if (pedidos.length === 0) return ''
  if (pedidos.length === 1) return `Pedido Nº ${pedidos[0].numero} del ${diaMes(pedidos[0].emitido_el)}`
  const numeros = pedidos.map((p) => `Nº ${p.numero}`)
  return `Pedidos ${numeros.slice(0, -1).join(', ')} y ${numeros[numeros.length - 1]}`
}

/** «Recibir un pedido»: los no anulados con faltante, del más viejo al más nuevo. */
export function pedidosParaRecibir(pedidos: readonly PedidoMedicacion[]): PedidoMedicacion[] {
  return pedidos.filter((p) => p.estado !== 'anulado' && p.faltanteTotal > 0).sort((a, b) => a.numero - b.numero)
}

/**
 * El pedido que muestra la tarjeta del estudio: el más nuevo que tenga faltante abierto o que sea para el
 * período que viene. Uno emitido el día de corte ya aparece ese día, y sigue apareciendo mientras falte algo.
 */
export function pedidoDestacado(pedidos: readonly PedidoMedicacion[], proximo: Periodo): PedidoMedicacion | null {
  return [...pedidos]
    .filter((p) => p.estado !== 'anulado')
    .sort((a, b) => b.numero - a.numero)
    .find((p) => p.faltanteTotal > 0 || p.periodo_desde === proximo.desde) ?? null
}

/** Los renglones con los que arranca el asistente de recepción: lo que falta de cada uno. */
export function renglonesParaRecibir(p: PedidoMedicacion): { medicationId: string; nombre: string; cantidad: number }[] {
  return p.renglones
    .filter((r) => r.faltante > 0)
    .map((r) => ({ medicationId: r.medication_id, nombre: r.medication_name, cantidad: r.faltante }))
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/data/pharma/pedidosMedicacionModel.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/pharma/pedidosMedicacionModel.ts src/data/pharma/pedidosMedicacionModel.test.ts
git commit -m "feat(reposicion): pedidos de medicación y su estado deducido

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: La reposición del período (libro, boleta, grilla y borrador del pedido)

**Files:**
- Modify: `src/data/pharma/reposicionModel.ts` (sólo tipos de `sigueEnElMes`, `terminoCronograma`, `presentacionesDuplicadas`, `estanteAlComienzo`)
- Create: `src/data/pharma/reposicionPeriodoModel.ts`
- Modify: `src/data/pharma/index.ts`
- Test: `src/data/pharma/reposicionPeriodoModel.test.ts`

**Interfaces:**
- Consumes:
  - de `./reposicionModel`: `diaMes`, `sumarDias`, `estanteAlComienzo`, `presentacionesDuplicadas`, `sigueEnElMes`, `terminoCronograma`, tipos `Aviso`, `EstadoRenglon`, `EstudioInsumo`, `LoteInsumo`, `ModoReposicion`, `PacienteInsumo`;
  - de Task 1: `Periodo`, `enCurso`, `periodoSiguiente`;
  - de Task 2: `armarPedidos`, `pedidoDestacado`, `textoDePedidos`, `yaPedidoDe`, `PedidoItemInsumo`, `PedidoMedicacion`, `PedidoMedicacionInsumo`.
- Produces:
  - `interface RenglonPeriodoInsumo`, `type PacientePeriodoInsumo`, `interface MovimientoInsumo`, `interface InsumosDelPeriodo` (la forma exacta del JSON de `reposicion_del_periodo`)
  - `interface Libro { habia; entro; salio; ajustes; hay }`, `libroDe(mov: MovimientoInsumo | undefined, enEstanteHoy: number): Libro`
  - `type TipoLineaBoleta`, `interface LineaBoleta { tipo; titulo; aclaracion; signo: '' | '+' | '−'; valor }`, `interface Boleta { lineas; aComprar }`
  - `interface RenglonDelPeriodo`, `type EstadoTarjeta = 'comprar' | 'cubierto' | 'todo_sin_cargar' | 'sin_medicacion'`, `interface EstudioReposicion`, `interface ReposicionDelPeriodo`
  - `armarReposicionDelPeriodo(insumos: InsumosDelPeriodo, hoy: string, periodo: Periodo, diaCorte: number): ReposicionDelPeriodo`
  - `interface RenglonBorrador { medicationId; nombre; presentacion; calculado: number | null; pedir: number }`
  - `borradorDelPedido(e: EstudioReposicion): RenglonBorrador[]`
  - `renglonesAEmitir(b: readonly RenglonBorrador[]): { medication_id: string; calculado: number | null; pedido: number }[]`
  - `cambiosDelBorrador(b: readonly RenglonBorrador[]): string[]`

- [ ] **Step 1: Aflojar los tipos de cuatro reglas del modelo del 14/09**

El JSON nuevo trae `retirado_periodo` en lugar de `retirado_mes`, así que un `PacienteInsumo` completo ya no sirve de parámetro. Las cuatro funciones sólo leen algunos campos: se tipan con `Pick` y los llamadores actuales (`ComprasDelMes`, sus tests) siguen compilando igual.

En `src/data/pharma/reposicionModel.ts`, reemplazar:

```ts
/** D16 + D23: el paciente cuenta en el mes que empieza en `desde`. */
export function sigueEnElMes(p: PacienteInsumo, desde: string): boolean {
```

por:

```ts
/** Lo que miran las reglas de cronograma: sirve igual para el JSON del mes (0125) y el del período (0128). */
type ConCronograma = Pick<PacienteInsumo, 'enrollment_status' | 'tiene_cronograma' | 'ultima_programada'>

/** D16 + D23: el paciente cuenta en el mes que empieza en `desde`. */
export function sigueEnElMes(p: ConCronograma, desde: string): boolean {
```

Reemplazar:

```ts
export function terminoCronograma(p: PacienteInsumo, desde: string): boolean {
```

por:

```ts
export function terminoCronograma(p: ConCronograma, desde: string): boolean {
```

Reemplazar:

```ts
export function presentacionesDuplicadas(pacientes: readonly PacienteInsumo[]): Set<string> {
  const porClave = new Map<string, PacienteInsumo[]>()
```

por:

```ts
export function presentacionesDuplicadas(
  pacientes: readonly Pick<PacienteInsumo, 'patient_medication_id' | 'enrollment_id' | 'drug_id' | 'habilitacion_id' | 'ultimo_retiro' | 'asignado_el'>[],
): Set<string> {
  const porClave = new Map<string, (typeof pacientes)[number][]>()
```

Reemplazar:

```ts
export function estanteAlComienzo(lotes: readonly LoteInsumo[], pendiente: number, hoy: string, mes: Mes): Estante {
```

por:

```ts
export function estanteAlComienzo(lotes: readonly LoteInsumo[], pendiente: number, hoy: string, mes: Pick<Mes, 'desde' | 'hasta'>): Estante {
```

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx vitest run src/data/pharma/reposicionModel.test.ts`
Expected: PASS (los mismos tests de antes).

- [ ] **Step 2: Escribir el test que falla**

`src/data/pharma/reposicionPeriodoModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  armarReposicionDelPeriodo, borradorDelPedido, cambiosDelBorrador, libroDe, renglonesAEmitir,
  type InsumosDelPeriodo, type MovimientoInsumo, type PacientePeriodoInsumo, type RenglonPeriodoInsumo,
} from './reposicionPeriodoModel'
import type { EstudioInsumo, LoteInsumo } from './reposicionModel'
import type { PedidoItemInsumo, PedidoMedicacionInsumo } from './pedidosMedicacionModel'
import type { Periodo } from './periodoDeCorte'

/**
 * La reposición de corte a corte (spec 2026-09-16, R3, R6, R7, R8).
 *
 * Se testea porque un número mal contado se dibuja igual de prolijo: comprar de menos deja pacientes sin
 * medicación y de más se vence en el estante. Los ejemplos son los que vio el Director en los bocetos.
 * Fechas fijas: CI corre en UTC.
 */

const HOY = '2026-09-16'
const CORTE = 28
const P0: Periodo = { desde: '2026-08-29', hasta: '2026-09-28' }

const estudio = (p: Partial<EstudioInsumo> = {}): EstudioInsumo => ({ id: 'endura', code: '222714', name: 'ENDURA', status: 'activo', ...p })
const renglon = (p: Partial<RenglonPeriodoInsumo> = {}): RenglonPeriodoInsumo => ({
  protocol_medication_id: 'pm-seretide', protocol_id: 'endura', medication_id: 'seretide', medication_name: 'Seretide 250/50',
  presentacion: 'Aerosol', drug_id: 'fluti', modo: 'mensual', envases_por_mes: 1, stock_fijo: null, ...p,
})
let n = 0
const paciente = (p: Partial<PacientePeriodoInsumo> = {}): PacientePeriodoInsumo => {
  n += 1
  return {
    patient_medication_id: `pmed-${n}`, enrollment_id: `enr-${n}`, protocol_id: 'endura', medication_id: 'seretide', drug_id: 'fluti',
    patient_name: `Paciente ${String(n).padStart(2, '0')}`, enrollment_status: 'activo', envases_por_mes: null, habilitacion_id: null,
    asignado_el: '2026-03-01', tiene_cronograma: false, ultima_programada: null, retirado_periodo: 1, ultimo_retiro: '2026-09-05', ...p,
  }
}
/** `cuantos` pacientes con 1 envase por mes, de los que `retiraron` ya retiraron este período. */
const grupo = (cuantos: number, retiraron: number) =>
  Array.from({ length: cuantos }, (_, i) => paciente({ retirado_periodo: i < retiraron ? 1 : 0 }))
const lote = (p: Partial<LoteInsumo> = {}): LoteInsumo => ({
  protocol_id: 'endura', medication_id: 'seretide', lot_number: 'L1', expiry_date: '2027-06-30', quantity: 8, ...p,
})
const mov = (p: Partial<MovimientoInsumo> = {}): MovimientoInsumo => ({
  protocol_id: 'endura', medication_id: 'seretide', entro: 0, salio: 0, ajustes: 0, desde_inicio: 0, ...p,
})
const cab = (p: Partial<PedidoMedicacionInsumo> = {}): PedidoMedicacionInsumo => ({
  id: 'ped-14', numero: 14, protocol_id: 'endura', periodo_desde: '2026-09-29', periodo_hasta: '2026-10-28',
  emitido_el: '2026-09-15', emitido_por_nombre: 'Lautaro Molina', anulado_at: null, anulado_por_nombre: null, anulado_motivo: null, ...p,
})
const item = (p: Partial<PedidoItemInsumo> = {}): PedidoItemInsumo => ({
  id: 'it-1', pedido_id: 'ped-14', medication_id: 'seretide', medication_name: 'Seretide 250/50', presentacion: 'Aerosol',
  calculado: 6, pedido: 6, cerrado_at: null, cerrado_por_nombre: null, cerrado_motivo: null, recibido: 0, sin_verificar: 0, ...p,
})
const insumos = (p: Partial<InsumosDelPeriodo> = {}): InsumosDelPeriodo => ({
  estudios: [estudio()], renglones: [renglon()], pacientes: [], lotes: [], movimientos: [], pedidos: [], pedido_items: [],
  sin_medicacion: [], ...p,
})
const armar = (i: InsumosDelPeriodo, periodo: Periodo = P0) => armarReposicionDelPeriodo(i, HOY, periodo, CORTE)
const seretide = (i: InsumosDelPeriodo) => armar(i).estudios[0].renglones[0]
const resumenBoleta = (i: InsumosDelPeriodo) =>
  seretide(i).boleta?.lineas.map((l) => [l.tipo, l.signo, l.valor, l.aclaracion])

describe('libroDe', () => {
  it('había + entró − salió + ajustes = hay', () => {
    expect(libroDe(mov({ entro: 15, salio: 12, ajustes: -1, desde_inicio: 2 }), 8))
      .toEqual({ habia: 6, entro: 15, salio: 12, ajustes: -1, hay: 8 })
  })
  it('sin movimientos, lo que había es lo que hay', () => {
    expect(libroDe(undefined, 8)).toEqual({ habia: 8, entro: 0, salio: 0, ajustes: 0, hay: 8 })
  })
})

describe('la cuenta del período (R3, R7)', () => {
  it('el ejemplo del Director: había 5, entraron 15, salieron 12, quedan 8 → comprar 4', () => {
    const r = seretide(insumos({ pacientes: grupo(12, 12), lotes: [lote()], movimientos: [mov({ entro: 15, salio: 12, desde_inicio: 3 })] }))
    expect(r.libro).toEqual({ habia: 5, entro: 15, salio: 12, ajustes: 0, hay: 8 })
    expect(r).toMatchObject({ estado: 'comprar', comprar: 4 })
    expect(r.boleta).toEqual({
      aComprar: 4,
      lineas: [
        { tipo: 'hacen_falta', titulo: 'Hacen falta para el próximo período', signo: '', valor: 12, aclaracion: '12 pacientes, 1 envase por mes' },
        { tipo: 'quedan_al_corte', titulo: 'Van a quedar en el estante al corte', signo: '−', valor: 8, aclaracion: 'hay 8 y ya retiraron todos' },
      ],
    })
  })
  it('la boleta A: 8 pacientes, hay 5 y 4 todavía no retiraron → comprar 7', () => {
    const i = insumos({ pacientes: grupo(8, 4), lotes: [lote({ quantity: 5 })] })
    expect(seretide(i).comprar).toBe(7)
    expect(resumenBoleta(i)).toEqual([
      ['hacen_falta', '', 8, '8 pacientes, 1 envase por mes'],
      ['quedan_al_corte', '−', 1, 'hay 5, y 4 pacientes todavía no retiraron'],
    ])
  })
  it('si el estante no alcanza para terminar el período, lo que falta se suma (D31)', () => {
    const i = insumos({ pacientes: grupo(8, 4), lotes: [lote({ quantity: 3 })] })
    expect(seretide(i).comprar).toBe(9)
    expect(resumenBoleta(i)).toEqual([
      ['hacen_falta', '', 8, '8 pacientes, 1 envase por mes'],
      ['faltan_este_periodo', '+', 1, '4 pacientes todavía no retiraron y en el estante no alcanza'],
    ])
  })
  it('con cantidad propia lo dice, y el singular se respeta', () => {
    const i = insumos({ pacientes: [paciente({ envases_por_mes: 2 }), paciente(), paciente()] })
    expect(seretide(i).comprar).toBe(5)
    expect(resumenBoleta(i)).toEqual([
      ['hacen_falta', '', 4, '3 pacientes (1 con cantidad propia)'],
      ['faltan_este_periodo', '+', 1, '1 paciente todavía no retiró y en el estante no alcanza'],
    ])
  })
})

describe('lo ya pedido (R9, R11)', () => {
  const base = { pacientes: grupo(12, 12), lotes: [lote()] }
  it('se resta y, si cubre todo, el renglón queda en camino', () => {
    const r = seretide(insumos({ ...base, pedidos: [cab()], pedido_items: [item()] }))
    expect(r).toMatchObject({ estado: 'en_camino', comprar: 0 })
    expect(r.boleta?.lineas.at(-1)).toEqual({
      tipo: 'ya_pedido', titulo: 'Ya pedido, sin recibir', signo: '−', valor: 6, aclaracion: 'Pedido Nº 14 del 15/09',
    })
  })
  it('lo recibido de un pedido ya no se resta como pedido', () => {
    expect(seretide(insumos({ ...base, pedidos: [cab()], pedido_items: [item({ recibido: 4 })] })).comprar).toBe(2)
  })
  it('ni un renglón cerrado ni un pedido anulado descuentan', () => {
    const cerrado = item({ cerrado_at: '2026-09-16T12:00:00+00:00', cerrado_motivo: 'no_lo_tiene' })
    expect(seretide(insumos({ ...base, pedidos: [cab()], pedido_items: [cerrado] })).comprar).toBe(4)
    const anulado = cab({ anulado_at: '2026-09-16T12:00:00+00:00', anulado_motivo: 'por_error' })
    expect(seretide(insumos({ ...base, pedidos: [anulado], pedido_items: [item()] })).comprar).toBe(4)
  })
})

describe('a demanda y renglones sin cuenta', () => {
  it('a demanda: tener siempre N menos lo que queda', () => {
    const i = insumos({ renglones: [renglon({ modo: 'a_demanda', envases_por_mes: null, stock_fijo: 5 })], lotes: [lote({ quantity: 2 })] })
    expect(seretide(i).comprar).toBe(3)
    expect(resumenBoleta(i)).toEqual([['tener_siempre', '', 5, 'a demanda'], ['quedan_al_corte', '−', 2, 'hay 2']])
  })
  it('sin cargar y no se compra no tienen boleta ni número', () => {
    expect(seretide(insumos({ renglones: [renglon({ modo: null, envases_por_mes: null })] })))
      .toMatchObject({ estado: 'sin_cargar', comprar: 0, boleta: null })
    expect(seretide(insumos({ renglones: [renglon({ modo: 'no_se_compra', envases_por_mes: null })] })))
      .toMatchObject({ estado: 'no_se_compra', comprar: 0, boleta: null })
  })
  it('en un período anterior hay libro pero no cuenta (R6)', () => {
    const rep = armar(
      insumos({ pacientes: grupo(12, 0), lotes: [lote()], movimientos: [mov({ entro: 10, salio: 4, ajustes: -1, desde_inicio: 8 })] }),
      { desde: '2026-07-29', hasta: '2026-08-28' },
    )
    expect(rep.enCurso).toBe(false)
    expect(rep.estudios[0].renglones[0]).toMatchObject({
      comprar: 0, boleta: null, libro: { habia: 0, entro: 10, salio: 4, ajustes: -1, hay: 5 },
    })
  })
})

describe('vencimientos', () => {
  it('lo vencido está en el «hay» del libro pero no en la boleta', () => {
    const r = seretide(insumos({ pacientes: grupo(12, 12), lotes: [lote(), lote({ lot_number: 'L0', expiry_date: '2026-09-01', quantity: 2 })] }))
    expect(r.libro.hay).toBe(10)
    expect(r.comprar).toBe(4)
    expect(r.boleta?.lineas[1].aclaracion).toBe('hay 8 y ya retiraron todos, sin contar 2 vencidos')
  })
  it('lo que vence antes del próximo período no queda al corte', () => {
    const r = seretide(insumos({ pacientes: grupo(12, 12), lotes: [lote({ quantity: 5 }), lote({ lot_number: 'L2', expiry_date: '2026-09-25', quantity: 3 })] }))
    expect(r.comprar).toBe(7)
    expect(r.boleta?.lineas[1]).toMatchObject({ valor: 5, aclaracion: 'hay 8 y ya retiraron todos, 3 vencen antes del próximo período' })
  })
  it('un lote que vence durante el próximo período cuenta y avisa', () => {
    const r = seretide(insumos({ pacientes: grupo(12, 12), lotes: [lote({ expiry_date: '2026-10-10' })] }))
    expect(r.comprar).toBe(4)
    expect(r.avisos).toContainEqual({ tipo: 'vence', ambar: true, texto: 'Vence el 10/10: lote L1, 8 envases' })
  })
})

describe('la grilla (R2)', () => {
  it('ordena por código, saca los cerrados y dice el estado de cada tarjeta', () => {
    const rep = armar(insumos({
      estudios: [
        estudio({ id: 'lts', code: 'LTS17231', name: 'LTS17231' }),
        estudio(),
        estudio({ id: 'vic', code: 'CKJX839D12302', name: 'Victorion' }),
        estudio({ id: 'viejo', code: 'AAA-1', status: 'cerrado' }),
      ],
      renglones: [
        renglon(),
        renglon({ protocol_medication_id: 'pm-lts', protocol_id: 'lts' }),
        renglon({ protocol_medication_id: 'pm-lts-monte', protocol_id: 'lts', medication_id: 'monte', medication_name: 'Montelukast 10 mg', drug_id: 'monte', modo: null, envases_por_mes: null }),
      ],
      pacientes: grupo(12, 12),
      lotes: [lote(), lote({ protocol_id: 'lts', quantity: 20 })],
      sin_medicacion: [{ protocol_id: 'endura', enrolamientos: 3 }],
    }))
    expect(rep.estudios.map((e) => [e.estudio.code, e.estadoTarjeta])).toEqual([
      ['222714', 'comprar'], ['CKJX839D12302', 'sin_medicacion'], ['LTS17231', 'cubierto'],
    ])
    expect(rep.estudios[0]).toMatchObject({ resumen: { envases: 4, medicamentos: 1, sinCargar: 0, reponibles: 1 }, sinMedicacionHabilitada: 3 })
    expect(rep.estudios[2].resumen).toMatchObject({ envases: 0, sinCargar: 1, reponibles: 2 })
  })
  it('todo sin cargar se dice aparte', () => {
    expect(armar(insumos({ renglones: [renglon({ modo: null, envases_por_mes: null })] })).estudios[0].estadoTarjeta).toBe('todo_sin_cargar')
  })
  it('sólo «no se compra» es no tener medicación para reponer', () => {
    expect(armar(insumos({ renglones: [renglon({ modo: 'no_se_compra', envases_por_mes: null })] })).estudios[0].estadoTarjeta).toBe('sin_medicacion')
  })
  it('destaca el pedido con faltante', () => {
    expect(armar(insumos({ pedidos: [cab()], pedido_items: [item()] })).estudios[0].destacado?.numero).toBe(14)
  })
})

describe('armar el pedido (R8)', () => {
  const conTodo = () => armar(insumos({
    renglones: [
      renglon(),
      renglon({ protocol_medication_id: 'pm-monte', medication_id: 'monte', medication_name: 'Montelukast 10 mg', presentacion: 'Comprimidos', drug_id: 'monte', modo: null, envases_por_mes: null }),
      renglon({ protocol_medication_id: 'pm-tio', medication_id: 'tio', medication_name: 'Tiotropio 18 mcg', presentacion: 'Cápsulas', drug_id: 'tio', modo: 'no_se_compra', envases_por_mes: null }),
    ],
    pacientes: grupo(12, 12),
    lotes: [lote()],
  })).estudios[0]

  it('arranca en lo calculado, lo sin cargar en cero y sin lo que no se compra', () => {
    expect(borradorDelPedido(conTodo())).toEqual([
      { medicationId: 'monte', nombre: 'Montelukast 10 mg', presentacion: 'Comprimidos', calculado: null, pedir: 0 },
      { medicationId: 'seretide', nombre: 'Seretide 250/50', presentacion: 'Aerosol', calculado: 4, pedir: 4 },
    ])
  })
  it('emite sólo los renglones con cantidad entera mayor a cero', () => {
    const b = borradorDelPedido(conTodo()).map((r) => (r.medicationId === 'seretide' ? { ...r, pedir: 6 } : { ...r, pedir: 1.5 }))
    expect(renglonesAEmitir(b)).toEqual([{ medication_id: 'seretide', calculado: 4, pedido: 6 }])
  })
  it('dice qué se cambió respecto de lo calculado; lo sin cargar se pide a mano', () => {
    const b = borradorDelPedido(conTodo()).map((r) => (r.medicationId === 'seretide' ? { ...r, pedir: 6 } : { ...r, pedir: 2 }))
    expect(cambiosDelBorrador(b)).toEqual(['Seretide 250/50: pedís 6, Spira calculó 4.'])
    expect(renglonesAEmitir(b)).toEqual([
      { medication_id: 'monte', calculado: null, pedido: 2 },
      { medication_id: 'seretide', calculado: 4, pedido: 6 },
    ])
  })
})
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `npx vitest run src/data/pharma/reposicionPeriodoModel.test.ts`
Expected: FAIL — `Failed to resolve import "./reposicionPeriodoModel"`.

- [ ] **Step 4: Implementar**

`src/data/pharma/reposicionPeriodoModel.ts`:

```ts
import {
  diaMes, estanteAlComienzo, presentacionesDuplicadas, sigueEnElMes, sumarDias, terminoCronograma,
} from './reposicionModel'
import type { Aviso, EstadoRenglon, EstudioInsumo, LoteInsumo, ModoReposicion, PacienteInsumo } from './reposicionModel'
import { enCurso, periodoSiguiente } from './periodoDeCorte'
import type { Periodo } from './periodoDeCorte'
import { armarPedidos, pedidoDestacado, textoDePedidos, yaPedidoDe } from './pedidosMedicacionModel'
import type { PedidoItemInsumo, PedidoMedicacion, PedidoMedicacionInsumo } from './pedidosMedicacionModel'

/**
 * ┌─ Reposición de corte a corte (docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md) ─────┐
 *
 * La misma cuenta del 14/09 (reposicionModel.ts, «para todos», D8), medida por PERÍODO en vez de por mes
 * calendario, más el libro de lo que entró y salió y la boleta que la explica.
 *
 *   P0 = el período en curso · P1 = el siguiente (el que se compra)
 *
 *   LIBRO de un período, por medicamento (R3, R6):
 *     había = en el estante hoy − todo lo que se movió desde el inicio del período
 *     hay   = había + entró − salió + ajustes             (período cerrado: lo que quedó al corte)
 *
 *   BOLETA de P0 (R7), cada renglón sólo si aplica:
 *       Hacen falta para el próximo período     Σ mensual de los pacientes que siguen en P1
 *     (o Tener siempre                         stock fijo, a demanda)
 *     + Faltan para terminar este período      lo pendiente de P0 que el estante no cubre     D31
 *     − Van a quedar en el estante al corte    FEFO: lo vigente menos lo pendiente de P0      D15
 *     − Ya pedido, sin recibir                 faltante abierto de los pedidos                 R9
 *     = A comprar                              nunca negativo
 *
 * El texto de la boleta sale de ACÁ y no de la vista: el Director rechazó la versión en prosa («Hoy hay 8 y
 * ya retiraron los 12…») por confusa, y la aclaración de cada renglón es parte de lo que se testea.
 * └────────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

// ═══════════════════════════ El JSON de `reposicion_del_periodo` (0128) ═══════════════════════════

/** Un renglón de `protocol_medications` con lo que se cargó para reponerlo. */
export interface RenglonPeriodoInsumo {
  protocol_medication_id: string
  protocol_id: string
  medication_id: string
  medication_name: string
  /** `medications.unit`, que en la app es la presentación. */
  presentacion: string | null
  drug_id: string | null
  modo: ModoReposicion | null
  envases_por_mes: number | null
  stock_fijo: number | null
}

/** Una asignación activa, igual que en la 0125 salvo lo retirado, que se mide en el período pedido. */
export type PacientePeriodoInsumo = Omit<PacienteInsumo, 'retirado_mes'> & {
  /** Neto retirado entre `p_desde` y `p_hasta` (hora AR), en lista o entregada. */
  retirado_periodo: number
}

/** Lo que se movió en el estante de un medicamento del estudio, con el protocolo por el LOTE. */
export interface MovimientoInsumo {
  protocol_id: string
  medication_id: string
  /** Recepciones menos anulaciones de recepción, dentro del período. */
  entro: number
  /** Dispensaciones menos devoluciones, dentro del período (positivo = salió). */
  salio: number
  /** Ajustes manuales, reasignaciones y bajas por vencimiento, con su signo, dentro del período. */
  ajustes: number
  /** Todo lo movido desde el inicio del período hasta hoy, con su signo. */
  desde_inicio: number
}

export interface InsumosDelPeriodo {
  estudios: EstudioInsumo[]
  renglones: RenglonPeriodoInsumo[]
  pacientes: PacientePeriodoInsumo[]
  /** Todos los lotes de protocolo con stock, VENCIDOS INCLUIDOS (el libro cuenta lo físico). */
  lotes: LoteInsumo[]
  movimientos: MovimientoInsumo[]
  pedidos: PedidoMedicacionInsumo[]
  pedido_items: PedidoItemInsumo[]
  /** Enrolamientos en screening/activo sin ninguna medicación habilitada, por estudio. */
  sin_medicacion: { protocol_id: string; enrolamientos: number }[]
}

// ═══════════════════════════ El libro ═══════════════════════════

export interface Libro {
  habia: number
  entro: number
  salio: number
  ajustes: number
  hay: number
}

export function libroDe(mov: MovimientoInsumo | undefined, enEstanteHoy: number): Libro {
  const entro = mov?.entro ?? 0
  const salio = mov?.salio ?? 0
  const ajustes = mov?.ajustes ?? 0
  const habia = enEstanteHoy - (mov?.desde_inicio ?? 0)
  return { habia, entro, salio, ajustes, hay: habia + entro - salio + ajustes }
}

// ═══════════════════════════ La boleta y el armado ═══════════════════════════

export type TipoLineaBoleta = 'hacen_falta' | 'tener_siempre' | 'faltan_este_periodo' | 'quedan_al_corte' | 'ya_pedido'

export interface LineaBoleta {
  tipo: TipoLineaBoleta
  titulo: string
  /** La explicación chica debajo del renglón. */
  aclaracion: string
  signo: '' | '+' | '−'
  valor: number
}

export interface Boleta {
  lineas: LineaBoleta[]
  aComprar: number
}

export interface RenglonDelPeriodo {
  clave: string
  protocolMedicationId: string
  medicationId: string
  nombre: string
  presentacion: string | null
  modo: ModoReposicion | null
  /** Lo cargado en el estudio, para abrir el formulario con el valor actual. */
  envasesPorMes: number | null
  stockFijo: number | null
  estado: EstadoRenglon
  /** Envases a comprar para P1 (0 si no aplica o si el período no está en curso). */
  comprar: number
  libro: Libro
  /** null: sin cargar, no se compra, o período que no está en curso. */
  boleta: Boleta | null
  avisos: Aviso[]
}

export type EstadoTarjeta = 'comprar' | 'cubierto' | 'todo_sin_cargar' | 'sin_medicacion'

export interface EstudioReposicion {
  estudio: EstudioInsumo
  /** Por nombre de medicamento. */
  renglones: RenglonDelPeriodo[]
  /** Del más nuevo al más viejo. */
  pedidos: PedidoMedicacion[]
  destacado: PedidoMedicacion | null
  resumen: {
    envases: number
    medicamentos: number
    sinCargar: number
    /** Renglones que no son «no se compra». */
    reponibles: number
  }
  estadoTarjeta: EstadoTarjeta
  sinMedicacionHabilitada: number
}

export interface ReposicionDelPeriodo {
  hoy: string
  periodo: Periodo
  /** El período siguiente al pedido: el que se compra cuando `periodo` está en curso. */
  proximo: Periodo
  enCurso: boolean
  /** Por código, sin los cerrados. */
  estudios: EstudioReposicion[]
}

const envasesTxt = (n: number) => `${n} ${n === 1 ? 'envase' : 'envases'}`
const pacientesTxt = (n: number) => `${n} ${n === 1 ? 'paciente' : 'pacientes'}`
const retiraronTxt = (n: number) => (n === 1 ? 'retiró' : 'retiraron')
const nombres = (ps: readonly { patient_name: string }[]) => {
  const unicos = [...new Set(ps.map((p) => p.patient_name))].sort((a, b) => a.localeCompare(b, 'es'))
  return unicos.length <= 3 ? unicos.join(', ') : `${unicos.slice(0, 3).join(', ')} y ${unicos.length - 3} más`
}

interface Contexto {
  insumos: InsumosDelPeriodo
  hoy: string
  periodo: Periodo
  proximo: Periodo
  actual: boolean
  pedidos: PedidoMedicacion[]
  duplicados: Set<string>
  noventaDias: string
}

function armarRenglon(r: RenglonPeriodoInsumo, ctx: Contexto): RenglonDelPeriodo {
  const lotes = ctx.insumos.lotes.filter((l) => l.protocol_id === r.protocol_id && l.medication_id === r.medication_id)
  const mov = ctx.insumos.movimientos.find((m) => m.protocol_id === r.protocol_id && m.medication_id === r.medication_id)
  const base = {
    clave: r.protocol_medication_id,
    protocolMedicationId: r.protocol_medication_id,
    medicationId: r.medication_id,
    nombre: r.medication_name,
    presentacion: r.presentacion,
    modo: r.modo,
    envasesPorMes: r.envases_por_mes,
    stockFijo: r.stock_fijo,
    libro: libroDe(mov, lotes.reduce((s, l) => s + l.quantity, 0)),
  }
  if (r.modo == null) return { ...base, estado: 'sin_cargar', comprar: 0, boleta: null, avisos: [] }
  if (r.modo === 'no_se_compra') return { ...base, estado: 'no_se_compra', comprar: 0, boleta: null, avisos: [] }
  if (!ctx.actual) return { ...base, estado: 'alcanza', comprar: 0, boleta: null, avisos: [] }

  const lineas: LineaBoleta[] = []
  const avisos: Aviso[] = []
  let pendiente = 0
  let pendientes = 0
  let pacientesDelPeriodo = 0

  if (r.modo === 'mensual') {
    const asignaciones = ctx.insumos.pacientes.filter(
      (p) => p.protocol_id === r.protocol_id && p.medication_id === r.medication_id && !p.habilitacion_id,
    )
    const suman = asignaciones.filter((p) => !ctx.duplicados.has(p.patient_medication_id))
    const mensual = (p: PacientePeriodoInsumo) => p.envases_por_mes ?? r.envases_por_mes ?? 0

    const delPeriodo = suman.filter((p) => sigueEnElMes(p, ctx.periodo.desde))
    pacientesDelPeriodo = delPeriodo.length
    for (const p of delPeriodo) {
      const falta = Math.max(0, mensual(p) - p.retirado_periodo)
      pendiente += falta
      if (falta > 0) pendientes += 1
    }

    const delProximo = suman.filter((p) => sigueEnElMes(p, ctx.proximo.desde))
    const propios = delProximo.filter((p) => p.envases_por_mes != null).length
    lineas.push({
      tipo: 'hacen_falta',
      titulo: 'Hacen falta para el próximo período',
      signo: '',
      valor: delProximo.reduce((s, p) => s + mensual(p), 0),
      aclaracion: delProximo.length === 0 ? 'ningún paciente lo recibe'
        : propios > 0 ? `${pacientesTxt(delProximo.length)} (${propios} con cantidad propia)`
          : `${pacientesTxt(delProximo.length)}, ${envasesTxt(r.envases_por_mes ?? 0)} por mes`,
    })

    const terminaron = asignaciones.filter((p) => terminoCronograma(p, ctx.proximo.desde))
    if (terminaron.length) avisos.push({ tipo: 'termino_cronograma', ambar: false, texto: `Terminó su cronograma y no suma: ${nombres(terminaron)}` })
    const sinRetiros = delProximo.filter((p) => !p.ultimo_retiro || p.ultimo_retiro.slice(0, 10) < ctx.noventaDias)
    if (sinRetiros.length) avisos.push({ tipo: 'sin_retiros', ambar: false, texto: `Sin retiros en 90 días, suma igual: ${nombres(sinRetiros)}` })
    const dobles = asignaciones.filter((p) => ctx.duplicados.has(p.patient_medication_id))
    if (dobles.length) avisos.push({ tipo: 'dos_presentaciones', ambar: true, texto: `Tiene otra presentación habilitada, suma una sola: ${nombres(dobles)}` })
    const varios = suman.filter((p) => mensual(p) > 0 && p.retirado_periodo > mensual(p))
    if (varios.length) avisos.push({ tipo: 'varios_meses', ambar: false, texto: `Se llevó más de un mes en este período: ${nombres(varios)}` })
  } else {
    lineas.push({ tipo: 'tener_siempre', titulo: 'Tener siempre', signo: '', valor: r.stock_fijo ?? 0, aclaracion: 'a demanda' })
  }

  const est = estanteAlComienzo(lotes, pendiente, ctx.hoy, ctx.proximo)
  const vencidos = lotes.filter((l) => l.expiry_date != null && l.expiry_date < ctx.hoy).reduce((s, l) => s + l.quantity, 0)
  // Lo vigente que no se lleva lo pendiente de P0 y tampoco llega vivo al inicio de P1.
  const vencenAntes = est.vigenteHoy - (pendiente - est.faltaEsteMes) - est.alComienzo

  if (est.faltaEsteMes > 0) {
    lineas.push({
      tipo: 'faltan_este_periodo',
      titulo: 'Faltan para terminar este período',
      signo: '+',
      valor: est.faltaEsteMes,
      aclaracion: `${pacientesTxt(pendientes)} todavía no ${retiraronTxt(pendientes)} y en el estante no alcanza`,
    })
  }
  if (est.alComienzo > 0) {
    const partes = [
      pacientesDelPeriodo === 0 ? `hay ${est.vigenteHoy}`
        : pendientes > 0 ? `hay ${est.vigenteHoy}, y ${pacientesTxt(pendientes)} todavía no ${retiraronTxt(pendientes)}`
          : `hay ${est.vigenteHoy} y ya retiraron todos`,
    ]
    if (vencenAntes > 0) partes.push(`${vencenAntes} ${vencenAntes === 1 ? 'vence' : 'vencen'} antes del próximo período`)
    if (vencidos > 0) partes.push(`sin contar ${vencidos} ${vencidos === 1 ? 'vencido' : 'vencidos'}`)
    lineas.push({ tipo: 'quedan_al_corte', titulo: 'Van a quedar en el estante al corte', signo: '−', valor: est.alComienzo, aclaracion: partes.join(', ') })
  }

  const ya = yaPedidoDe(ctx.pedidos, r.protocol_id, r.medication_id)
  if (ya.envases > 0) {
    lineas.push({ tipo: 'ya_pedido', titulo: 'Ya pedido, sin recibir', signo: '−', valor: ya.envases, aclaracion: textoDePedidos(ya.pedidos) })
  }
  for (const v of est.vencenEnElMes) {
    avisos.push({ tipo: 'vence', ambar: true, texto: `Vence el ${diaMes(v.expiry_date)}: lote ${v.lot_number}, ${envasesTxt(v.quantity)}` })
  }

  const comprar = Math.max(0, lineas.reduce((s, l) => (l.signo === '−' ? s - l.valor : s + l.valor), 0))
  const estado: EstadoRenglon = comprar > 0 ? 'comprar' : ya.envases > 0 ? 'en_camino' : 'alcanza'
  return { ...base, estado, comprar, boleta: { lineas, aComprar: comprar }, avisos }
}

export function armarReposicionDelPeriodo(
  insumos: InsumosDelPeriodo,
  hoy: string,
  periodo: Periodo,
  diaCorte: number,
): ReposicionDelPeriodo {
  const proximo = periodoSiguiente(periodo, diaCorte)
  const actual = enCurso(periodo, hoy)
  const pedidos = armarPedidos(insumos.pedidos, insumos.pedido_items)
  const ctx: Contexto = {
    insumos, hoy, periodo, proximo, actual, pedidos,
    duplicados: presentacionesDuplicadas(insumos.pacientes),
    noventaDias: sumarDias(hoy, -90),
  }

  const estudios = insumos.estudios
    .filter((e) => e.status !== 'cerrado')
    .sort((a, b) => a.code.localeCompare(b.code, 'es'))
    .map((estudio): EstudioReposicion => {
      const renglones = insumos.renglones
        .filter((r) => r.protocol_id === estudio.id)
        .map((r) => armarRenglon(r, ctx))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      const reponibles = renglones.filter((r) => r.estado !== 'no_se_compra').length
      const sinCargar = renglones.filter((r) => r.estado === 'sin_cargar').length
      const aComprar = renglones.filter((r) => r.comprar > 0)
      const envases = aComprar.reduce((s, r) => s + r.comprar, 0)
      const pedidosDelEstudio = pedidos.filter((p) => p.protocol_id === estudio.id)
      return {
        estudio,
        renglones,
        pedidos: pedidosDelEstudio,
        destacado: pedidoDestacado(pedidosDelEstudio, proximo),
        resumen: { envases, medicamentos: aComprar.length, sinCargar, reponibles },
        estadoTarjeta: reponibles === 0 ? 'sin_medicacion'
          : sinCargar === reponibles ? 'todo_sin_cargar'
            : envases > 0 ? 'comprar'
              : 'cubierto',
        sinMedicacionHabilitada: insumos.sin_medicacion.find((s) => s.protocol_id === estudio.id)?.enrolamientos ?? 0,
      }
    })

  return { hoy, periodo, proximo, enCurso: actual, estudios }
}

// ═══════════════════════════ «Armar pedido» (R8) ═══════════════════════════

export interface RenglonBorrador {
  medicationId: string
  nombre: string
  presentacion: string | null
  /** Lo que calculó Spira; null = estaba sin cargar. */
  calculado: number | null
  pedir: number
}

/** Arranca en lo calculado; lo sin cargar en cero para pedirlo a mano; «no se compra» no aparece. */
export function borradorDelPedido(e: EstudioReposicion): RenglonBorrador[] {
  return e.renglones
    .filter((r) => r.estado !== 'no_se_compra')
    .map((r) => ({
      medicationId: r.medicationId,
      nombre: r.nombre,
      presentacion: r.presentacion,
      calculado: r.modo == null ? null : r.comprar,
      pedir: r.modo == null ? 0 : r.comprar,
    }))
}

/** Lo que viaja a `emitir_pedido_medicacion`: sólo cantidades enteras mayores a cero. */
export function renglonesAEmitir(b: readonly RenglonBorrador[]): { medication_id: string; calculado: number | null; pedido: number }[] {
  return b
    .filter((r) => Number.isInteger(r.pedir) && r.pedir > 0)
    .map((r) => ({ medication_id: r.medicationId, calculado: r.calculado, pedido: r.pedir }))
}

/** «Seretide 250/50: pedís 6, Spira calculó 4.» */
export function cambiosDelBorrador(b: readonly RenglonBorrador[]): string[] {
  return b
    .filter((r) => r.calculado != null && Number.isInteger(r.pedir) && r.pedir !== r.calculado)
    .map((r) => `${r.nombre}: pedís ${r.pedir}, Spira calculó ${r.calculado}.`)
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run src/data/pharma/reposicionPeriodoModel.test.ts`
Expected: PASS, 22 tests.

Si falla un número, **no ajustar la expectativa**: los ejemplos son los que aprobó el Director. Revisar la cuenta contra el diagrama del comentario de cabecera.

- [ ] **Step 6: Exportar desde el barrel**

En `src/data/pharma/index.ts`, reemplazar:

```ts
export * from './reposicionModel'
export * from './reposicion'
```

por:

```ts
export * from './reposicionModel'
export * from './periodoDeCorte'
export * from './pedidosMedicacionModel'
export * from './reposicionPeriodoModel'
export * from './reposicion'
```

Run: `npx tsc --noEmit`
Expected: sin errores. Un `Module ... has already exported a member named` indica un nombre repetido entre módulos del barrel: renombrar en el módulo nuevo, nunca en el viejo.

- [ ] **Step 7: Commit**

```bash
git add src/data/pharma/reposicionModel.ts src/data/pharma/reposicionPeriodoModel.ts src/data/pharma/reposicionPeriodoModel.test.ts src/data/pharma/index.ts
git commit -m "feat(reposicion): la cuenta de corte a corte, con libro y boleta

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Migración 0128, probada en PGlite

**Files:**
- Create: `supabase/migrations/0128_reposicion_de_corte_a_corte.sql`
- Modify: `supabase/README.md` (fila nueva después de la 0127)
- Create (fuera del repo): `<scratchpad>/pglite-0128/probar.mjs`

**Interfaces:**
- Consumes: la forma de `InsumosDelPeriodo`, `PedidoMedicacionInsumo`, `PedidoItemInsumo` (Tasks 2 y 3); los motivos de `MOTIVOS_CIERRE` y `MOTIVOS_ANULACION` (Task 2).
- Produces (lo que llama la Task 5):
  - `public.reposicion_del_periodo(p_desde date, p_hasta date, p_hoy date, p_protocol_id uuid default null) → jsonb`
  - `public.emitir_pedido_medicacion(p_protocol_id uuid, p_desde date, p_hasta date, p_emitido_el date, p_renglones jsonb) → jsonb {id, numero}`
  - `public.anular_pedido_medicacion(p_pedido_id uuid, p_motivo text) → void`
  - `public.cerrar_faltante_pedido(p_item_id uuid, p_motivo text) → void`
  - `public.create_reception(p_tipo, p_protocol_id, p_reception_date, p_notes, p_items, p_pedido_id uuid default null) → uuid`
  - columna `farmacia_ajustes.dia_corte integer`

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/0128_reposicion_de_corte_a_corte.sql`:

```sql
-- Spira · Migración 0128 — Reposición de corte a corte: día de corte, pedidos de medicación y recepción
-- de un pedido.
-- Spec: docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md (R4, R8-R11, R13).
-- Plan: docs/superpowers/plans/2026-09-16-reposicion-parte-1-modelo-y-base.md.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0127.
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ✅ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. Nada de esto rompe lo que el front desplegado pide:
--    · farmacia_ajustes.dia_corte es nueva y nullable (el front pide demora_compra_dias por nombre);
--    · dos tablas nuevas que ningún front consulta;
--    · medication_receptions.pedido_id, nullable. Su FK NO deja ambiguo ningún embed actual (buscado en
--      src el 2026-09-16): el único embed desde medication_receptions es protocol:protocols(code), y
--      pedidos_medicacion no referencia a medication_receptions, así que no es un puente entre las dos;
--    · create_reception suma p_pedido_id con default null AL FINAL. El front desplegado la llama por
--      nombre con cinco argumentos y resuelve a la nueva por el default. La firma vieja se BORRA antes:
--      create or replace con otra firma deja una sobrecarga viva y PostgREST contestaría PGRST203
--      (ambigua) a la llamada vieja. Entre el drop y el create no hay transacción que abarque las dos
--      (el editor no comparte sesión): si el create fallara, Recepción queda sin función hasta volver a
--      correr el archivo. Por eso se probó entera en PGlite antes de pasarla;
--    · insumos_de_reposicion y reposicion_pedidos (0125), que usa la card de Estadísticas, NO se tocan:
--      se borran en la 0129, DESPUÉS del deploy del front.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · El día de corte (R4) -----------------------------------------------------------------------
-- Se escribe con update directo de operator: la policy y el trigger que sella al autor ya existen (0125).
alter table public.farmacia_ajustes
  add column if not exists dia_corte integer;
alter table public.farmacia_ajustes drop constraint if exists farmacia_ajustes_dia_corte_chk;
alter table public.farmacia_ajustes add constraint farmacia_ajustes_dia_corte_chk
  check (dia_corte is null or dia_corte between 1 and 31);

comment on column public.farmacia_ajustes.dia_corte is
  'Día del mes en que corta el período de reposición (R4). En un mes sin ese día, corta el último (lo resuelve src/data/pharma/periodoDeCorte.ts). NULL = sin cargar: la pantalla lo pide. 0128.';


-- 2 · Pedidos de medicación (R8, R9) -------------------------------------------------------------
-- Número correlativo y legible, como el folio de las recepciones (0085): el uuid no se puede dictar
-- por teléfono ni escribir en una hoja. Un pedido rechazado a mitad de camino consume un número: los
-- huecos en la numeración no significan nada.
create sequence if not exists public.pedidos_medicacion_numero_seq;

create table if not exists public.pedidos_medicacion (
  id                 uuid primary key default gen_random_uuid(),
  numero             integer not null unique default nextval('public.pedidos_medicacion_numero_seq'),
  protocol_id        uuid not null references public.protocols(id) on delete restrict,
  periodo_desde      date not null,
  periodo_hasta      date not null,
  emitido_el         date not null,
  emitido_por        uuid not null references public.users(id) on delete restrict,
  emitido_por_nombre text,
  anulado_at         timestamptz,
  anulado_por_nombre text,
  anulado_motivo     text,
  created_at         timestamptz not null default now(),
  constraint pedidos_medicacion_periodo_chk check (periodo_desde <= periodo_hasta),
  constraint pedidos_medicacion_anulado_chk check (
    (anulado_at is null and anulado_motivo is null)
    or (anulado_at is not null and anulado_motivo in ('por_error', 'rehecho'))
  )
);
alter sequence public.pedidos_medicacion_numero_seq owned by public.pedidos_medicacion.numero;

comment on table public.pedidos_medicacion is
  'Pedido de medicación de un estudio, impreso con número (R8). periodo_desde/hasta = el período para el que se pidió. El estado se deduce de las recepciones con pedido_id. Sin escritura directa. 0128.';

create index if not exists pedidos_medicacion_protocol_idx on public.pedidos_medicacion (protocol_id);

drop trigger if exists trg_audit_pedidos_medicacion on public.pedidos_medicacion;
create trigger trg_audit_pedidos_medicacion
  after insert or update or delete on public.pedidos_medicacion
  for each row execute function public.audit_row();

alter table public.pedidos_medicacion enable row level security;
drop policy if exists "ver pedidos de medicacion" on public.pedidos_medicacion;
create policy "ver pedidos de medicacion" on public.pedidos_medicacion for select
  using (public.has_min_role('pharma', 'viewer') or public.has_module('gerencia'));

revoke all on public.pedidos_medicacion from anon;
revoke insert, update, delete, truncate on public.pedidos_medicacion from authenticated;
grant select on public.pedidos_medicacion to authenticated;


-- 3 · Renglones del pedido (R8, R11) -------------------------------------------------------------
-- calculado = lo que dio la cuenta al emitir (null si estaba sin cargar); pedido = lo que se pidió de
-- verdad. Lo recibido NO se guarda acá: se suma de las recepciones verificadas, así una recepción
-- anulada deja de contar sola.
create table if not exists public.pedido_medicacion_items (
  id                 uuid primary key default gen_random_uuid(),
  pedido_id          uuid not null references public.pedidos_medicacion(id) on delete restrict,
  medication_id      uuid not null references public.medications(id) on delete restrict,
  calculado          integer check (calculado is null or calculado >= 0),
  pedido             integer not null check (pedido > 0),
  cerrado_at         timestamptz,
  cerrado_por_nombre text,
  cerrado_motivo     text,
  constraint pedido_medicacion_items_unico unique (pedido_id, medication_id),
  constraint pedido_medicacion_items_cerrado_chk check (
    (cerrado_at is null and cerrado_motivo is null)
    or (cerrado_at is not null and cerrado_motivo in ('no_lo_tiene', 'discontinuado', 'no_hace_falta'))
  )
);

comment on table public.pedido_medicacion_items is
  'Renglones de un pedido de medicación: calculado (la cuenta al emitir) y pedido. cerrado_* = «No va a llegar» (R11). 0128.';

drop trigger if exists trg_audit_pedido_medicacion_items on public.pedido_medicacion_items;
create trigger trg_audit_pedido_medicacion_items
  after insert or update or delete on public.pedido_medicacion_items
  for each row execute function public.audit_row();

alter table public.pedido_medicacion_items enable row level security;
drop policy if exists "ver renglones de pedidos de medicacion" on public.pedido_medicacion_items;
create policy "ver renglones de pedidos de medicacion" on public.pedido_medicacion_items for select
  using (public.has_min_role('pharma', 'viewer') or public.has_module('gerencia'));

revoke all on public.pedido_medicacion_items from anon;
revoke insert, update, delete, truncate on public.pedido_medicacion_items from authenticated;
grant select on public.pedido_medicacion_items to authenticated;


-- 4 · La recepción sabe a qué pedido responde (R10) ----------------------------------------------
alter table public.medication_receptions
  add column if not exists pedido_id uuid references public.pedidos_medicacion(id) on delete restrict;
alter table public.medication_receptions drop constraint if exists medication_receptions_pedido_tipo_chk;
alter table public.medication_receptions add constraint medication_receptions_pedido_tipo_chk
  check (pedido_id is null or tipo = 'protocolo');
create index if not exists medication_receptions_pedido_idx
  on public.medication_receptions (pedido_id) where pedido_id is not null;

comment on column public.medication_receptions.pedido_id is
  'El pedido de medicación que se está recibiendo (R10). Sólo recepciones de protocolo. Lo pone create_reception. 0128.';


-- 5 · emitir_pedido_medicacion (R8) --------------------------------------------------------------
-- Todo el pedido en una llamada: cabecera y renglones entran juntos o no entra nada.
-- p_desde/p_hasta: el período para el que se pide. p_emitido_el: el día en hora AR (lo manda el front).
-- p_renglones: [{ "medication_id": uuid, "calculado": int | null, "pedido": int }, …]
create or replace function public.emitir_pedido_medicacion(
  p_protocol_id uuid,
  p_desde       date,
  p_hasta       date,
  p_emitido_el  date,
  p_renglones   jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_id     uuid;
  v_numero integer;
  v_nombre text;
  v_r      jsonb;
  v_hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para emitir pedidos' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período del pedido no es válido' using errcode = '22023';
  end if;
  if p_emitido_el is null or p_emitido_el > v_hoy then
    raise exception 'La fecha del pedido no puede ser futura' using errcode = '22023';
  end if;
  if not exists (select 1 from public.protocols pr where pr.id = p_protocol_id and pr.status <> 'cerrado') then
    raise exception 'Ese estudio no existe o está cerrado' using errcode = 'P0002';
  end if;
  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El pedido está vacío' using errcode = '22023';
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();

  insert into public.pedidos_medicacion (protocol_id, periodo_desde, periodo_hasta, emitido_el, emitido_por, emitido_por_nombre)
  values (p_protocol_id, p_desde, p_hasta, p_emitido_el, auth.uid(), v_nombre)
  returning id, numero into v_id, v_numero;

  for v_r in select value from jsonb_array_elements(p_renglones) loop
    if not exists (
      select 1 from public.protocol_medications pmx
       where pmx.protocol_id = p_protocol_id
         and pmx.medication_id = (v_r->>'medication_id')::uuid
    ) then
      raise exception 'Un medicamento del pedido no es de este estudio' using errcode = 'P0002';
    end if;
    if coalesce((v_r->>'pedido')::integer, 0) <= 0 then
      raise exception 'Cada renglón del pedido necesita una cantidad' using errcode = '22023';
    end if;
    insert into public.pedido_medicacion_items (pedido_id, medication_id, calculado, pedido)
    values (v_id, (v_r->>'medication_id')::uuid, (v_r->>'calculado')::integer, (v_r->>'pedido')::integer);
  end loop;

  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$fn$;
revoke all on function public.emitir_pedido_medicacion(uuid, date, date, date, jsonb) from public;
grant execute on function public.emitir_pedido_medicacion(uuid, date, date, date, jsonb) to authenticated;


-- 6 · anular_pedido_medicacion (R9) --------------------------------------------------------------
-- Sólo sin recepciones (salvo anuladas): lo que ya entró al estante tiene que poder rastrearse a su pedido.
-- El for update serializa contra create_reception, que toma el pedido for share.
create or replace function public.anular_pedido_medicacion(p_pedido_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_anulado timestamptz;
  v_nombre  text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para anular pedidos' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('por_error', 'rehecho') then
    raise exception 'Elegí un motivo para anular' using errcode = '22023';
  end if;

  select pe.anulado_at into v_anulado from public.pedidos_medicacion pe where pe.id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido ya no está' using errcode = 'P0002';
  end if;
  if v_anulado is not null then
    raise exception 'Ese pedido ya está anulado' using errcode = '23514';
  end if;
  if exists (select 1 from public.medication_receptions mr where mr.pedido_id = p_pedido_id and mr.status <> 'anulada') then
    raise exception 'Este pedido ya tiene recepciones: no se puede anular' using errcode = '23514';
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();
  update public.pedidos_medicacion pe
     set anulado_at = now(), anulado_por_nombre = v_nombre, anulado_motivo = p_motivo
   where pe.id = p_pedido_id;
end;
$fn$;
revoke all on function public.anular_pedido_medicacion(uuid, text) from public;
grant execute on function public.anular_pedido_medicacion(uuid, text) to authenticated;


-- 7 · cerrar_faltante_pedido: «No va a llegar» (R11) ---------------------------------------------
create or replace function public.cerrar_faltante_pedido(p_item_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_item     public.pedido_medicacion_items%rowtype;
  v_anulado  timestamptz;
  v_recibido integer;
  v_nombre   text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para cerrar lo que falta de un pedido' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('no_lo_tiene', 'discontinuado', 'no_hace_falta') then
    raise exception 'Elegí un motivo' using errcode = '22023';
  end if;

  select * into v_item from public.pedido_medicacion_items it where it.id = p_item_id for update;
  if not found then
    raise exception 'Ese renglón ya no está' using errcode = 'P0002';
  end if;
  select pe.anulado_at into v_anulado from public.pedidos_medicacion pe where pe.id = v_item.pedido_id;
  if v_anulado is not null then
    raise exception 'Ese pedido está anulado' using errcode = '23514';
  end if;
  if v_item.cerrado_at is not null then
    raise exception 'Lo que falta de ese renglón ya está cerrado' using errcode = '23514';
  end if;

  select coalesce(sum(ri.quantity), 0)::integer into v_recibido
    from public.reception_items ri
    join public.medication_receptions mr on mr.id = ri.reception_id
   where mr.pedido_id = v_item.pedido_id
     and mr.status = 'verificada'
     and ri.medication_id = v_item.medication_id;
  if v_recibido >= v_item.pedido then
    raise exception 'Ese renglón ya se recibió entero' using errcode = '23514';
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();
  update public.pedido_medicacion_items it
     set cerrado_at = now(), cerrado_por_nombre = v_nombre, cerrado_motivo = p_motivo
   where it.id = p_item_id;
end;
$fn$;
revoke all on function public.cerrar_faltante_pedido(uuid, text) from public;
grant execute on function public.cerrar_faltante_pedido(uuid, text) to authenticated;


-- 8 · create_reception con pedido (R10) ----------------------------------------------------------
-- Cuerpo de la 0040 sin cambios, más la validación del pedido y la columna pedido_id.
drop function if exists public.create_reception(public.reception_kind, uuid, date, text, jsonb);

create or replace function public.create_reception(
  p_tipo           public.reception_kind,
  p_protocol_id    uuid,
  p_reception_date date,
  p_notes          text,
  p_items          jsonb,
  p_pedido_id      uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id              uuid;
  v_item            jsonb;
  v_pedido_protocol uuid;
  v_pedido_anulado  timestamptz;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para crear recepciones' using errcode = '42501'; end if;
  if (p_tipo = 'ambulatoria') <> (p_protocol_id is null) then
    raise exception 'El tipo % es incompatible con el protocolo indicado', p_tipo using errcode = 'check_violation';
  end if;
  if p_pedido_id is not null then
    select pe.protocol_id, pe.anulado_at into v_pedido_protocol, v_pedido_anulado
      from public.pedidos_medicacion pe where pe.id = p_pedido_id for share;
    if not found then
      raise exception 'Ese pedido ya no está' using errcode = 'P0002';
    end if;
    if v_pedido_anulado is not null then
      raise exception 'Ese pedido está anulado: no se puede recibir' using errcode = 'check_violation';
    end if;
    if p_tipo <> 'protocolo' or v_pedido_protocol is distinct from p_protocol_id then
      raise exception 'La recepción tiene que ser del mismo estudio que el pedido' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.medication_receptions (tipo, protocol_id, received_by, reception_date, status, notes, pedido_id)
  values (p_tipo, p_protocol_id, auth.uid(), p_reception_date, 'pendiente', p_notes, p_pedido_id)
  returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Asignación = consecuencia de recibir (0040): si no estaba asociado, se asocia acá.
    -- Ambulatoria (protocol_id null) no asocia.
    if p_protocol_id is not null then
      insert into public.protocol_medications (protocol_id, medication_id)
      values (p_protocol_id, (v_item->>'medication_id')::uuid)
      on conflict (protocol_id, medication_id) do nothing;
    end if;
    insert into public.reception_items (reception_id, medication_id, lot_number, expiry_date, quantity)
    values (v_id, (v_item->>'medication_id')::uuid, v_item->>'lot_number',
            nullif(v_item->>'expiry_date','')::date, (v_item->>'quantity')::integer);
  end loop;
  return v_id;
end;
$fn$;
revoke all on function public.create_reception(public.reception_kind, uuid, date, text, jsonb, uuid) from public;
grant execute on function public.create_reception(public.reception_kind, uuid, date, text, jsonb, uuid) to authenticated;


-- 9 · reposicion_del_periodo: los datos crudos de la pantalla (D11, R3, R6) -----------------------
-- La FORMA del JSON es la de InsumosDelPeriodo en src/data/pharma/reposicionPeriodoModel.ts: si se
-- cambia una, se cambia la otra. SECURITY DEFINER porque Farmacia no tiene select sobre patient_visits
-- (0006:162): una vista security_invoker le devolvería cero pacientes sin ningún error.
-- p_hoy y los bordes del período los manda el front en hora AR (current_date en Supabase es UTC), y los
-- movimientos se cortan por su día EN HORA AR: uno de las 23:30 del día de corte es de ese período.
-- p_protocol_id null = todos los estudios no cerrados (la grilla); con valor = uno (la pantalla del estudio).
create or replace function public.reposicion_del_periodo(
  p_desde       date,
  p_hasta       date,
  p_hoy         date,
  p_protocol_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_min_role('pharma', 'viewer') or public.has_module('gerencia')) then
    raise exception 'No tenés permiso para ver la reposición' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hoy is null or p_desde > p_hasta then
    raise exception 'El período no es válido' using errcode = '22023';
  end if;

  with
  estudios as (
    select p.id, p.code, p.name, p.status::text as status
      from public.protocols p
     where p.status <> 'cerrado'
       and (p_protocol_id is null or p.id = p_protocol_id)
  ),
  -- Movimientos de protocolo con su día en hora AR. El protocolo sale del LOTE: stock_movements no lo
  -- tiene (D32). Un ajuste sin lote no se puede atribuir a un estudio y queda afuera.
  movs as (
    select ml.protocol_id, sm.medication_id, sm.movement_type, sm.quantity_delta, sm.reference_type,
           sm.reference_id,
           (sm.created_at at time zone 'America/Argentina/Buenos_Aires')::date as dia
      from public.stock_movements sm
      join public.medication_lots ml on ml.id = sm.lot_id
      join estudios es on es.id = ml.protocol_id
     where ml.tipo = 'protocolo'
  ),
  -- Lo dispensado por enrolamiento: «ya retiró» (D14), dicho del período.
  retiros as (
    select mv.medication_id, dr.enrollment_id, -mv.quantity_delta as neto, mv.dia
      from movs mv
      left join public.dispensations d on d.id = mv.reference_id
      left join public.dispensation_requests dr on dr.id = d.request_id
     where mv.reference_type = 'dispensation'
       and mv.movement_type in ('dispensacion', 'devolucion')
  ),
  renglones as (
    select pmx.id as protocol_medication_id, pmx.protocol_id, pmx.medication_id,
           m.name as medication_name, m.unit as presentacion, m.drug_id,
           pmx.reposicion_modo as modo, pmx.envases_por_mes, pmx.stock_fijo
      from public.protocol_medications pmx
      join estudios es on es.id = pmx.protocol_id
      join public.medications m on m.id = pmx.medication_id
  ),
  cronograma as (
    select pv.enrollment_id, max(pv.estimated_date) as ultima
      from public.patient_visits pv
      join public.visit_definitions vd on vd.id = pv.visit_def_id
      join public.enrollments e on e.id = pv.enrollment_id
      join estudios es on es.id = e.protocol_id
     where pv.kind = 'programada'
       and vd.date_mode = 'automatica'
     group by pv.enrollment_id
  ),
  pacientes as (
    select pm.id as patient_medication_id, pm.enrollment_id, e.protocol_id, pm.medication_id, m.drug_id,
           pa.full_name as patient_name, e.status::text as enrollment_status,
           pm.envases_por_mes, pm.habilitacion_id, pm.created_at as asignado_el,
           (cr.enrollment_id is not null) as tiene_cronograma, cr.ultima as ultima_programada,
           coalesce((select sum(rt.neto) from retiros rt
                      where rt.enrollment_id = pm.enrollment_id and rt.medication_id = pm.medication_id
                        and rt.dia between p_desde and p_hasta), 0)::integer as retirado_periodo,
           (select max(rt.dia) from retiros rt
             where rt.enrollment_id = pm.enrollment_id and rt.medication_id = pm.medication_id
               and rt.neto > 0) as ultimo_retiro
      from public.patient_medications pm
      join public.enrollments e on e.id = pm.enrollment_id
      join estudios es on es.id = e.protocol_id
      join public.patients pa on pa.id = e.patient_id
      join public.medications m on m.id = pm.medication_id
      left join cronograma cr on cr.enrollment_id = pm.enrollment_id
     where pm.active
  ),
  -- Vencidos incluidos: el libro cuenta lo físico y la boleta filtra lo vigente en TypeScript.
  lotes as (
    select ml.protocol_id, ml.medication_id, ml.lot_number, ml.expiry_date, ml.quantity_on_hand as quantity
      from public.medication_lots ml
      join estudios es on es.id = ml.protocol_id
     where ml.tipo = 'protocolo'
       and ml.quantity_on_hand > 0
  ),
  movimientos as (
    select mv.protocol_id, mv.medication_id,
           coalesce(sum(mv.quantity_delta) filter (
             where mv.movement_type in ('recepcion', 'anulacion_recepcion') and mv.dia <= p_hasta), 0)::integer as entro,
           coalesce(-sum(mv.quantity_delta) filter (
             where mv.movement_type in ('dispensacion', 'devolucion') and mv.dia <= p_hasta), 0)::integer as salio,
           coalesce(sum(mv.quantity_delta) filter (
             where mv.movement_type in ('ajuste_manual', 'reasignacion', 'vencimiento') and mv.dia <= p_hasta), 0)::integer as ajustes,
           coalesce(sum(mv.quantity_delta), 0)::integer as desde_inicio
      from movs mv
     where mv.dia >= p_desde
     group by mv.protocol_id, mv.medication_id
  ),
  pedidos as (
    select pe.id, pe.numero, pe.protocol_id, pe.periodo_desde, pe.periodo_hasta, pe.emitido_el,
           pe.emitido_por_nombre, pe.anulado_at, pe.anulado_por_nombre, pe.anulado_motivo
      from public.pedidos_medicacion pe
      join estudios es on es.id = pe.protocol_id
  ),
  pedido_items as (
    select it.id, it.pedido_id, it.medication_id, m.name as medication_name, m.unit as presentacion,
           it.calculado, it.pedido, it.cerrado_at, it.cerrado_por_nombre, it.cerrado_motivo,
           coalesce((select sum(ri.quantity) from public.reception_items ri
                       join public.medication_receptions mr on mr.id = ri.reception_id
                      where mr.pedido_id = it.pedido_id and mr.status = 'verificada'
                        and ri.medication_id = it.medication_id), 0)::integer as recibido,
           coalesce((select sum(ri.quantity) from public.reception_items ri
                       join public.medication_receptions mr on mr.id = ri.reception_id
                      where mr.pedido_id = it.pedido_id and mr.status = 'pendiente'
                        and ri.medication_id = it.medication_id), 0)::integer as sin_verificar
      from public.pedido_medicacion_items it
      join pedidos pe on pe.id = it.pedido_id
      join public.medications m on m.id = it.medication_id
  ),
  sin_medicacion as (
    select e.protocol_id, count(*)::integer as enrolamientos
      from public.enrollments e
      join estudios es on es.id = e.protocol_id
     where e.status in ('screening', 'activo')
       and not exists (
         select 1 from public.patient_medications pm
          where pm.enrollment_id = e.id and pm.active and pm.habilitacion_id is null)
     group by e.protocol_id
  )
  select jsonb_build_object(
    'estudios',       coalesce((select jsonb_agg(to_jsonb(x)) from estudios x), '[]'::jsonb),
    'renglones',      coalesce((select jsonb_agg(to_jsonb(x)) from renglones x), '[]'::jsonb),
    'pacientes',      coalesce((select jsonb_agg(to_jsonb(x)) from pacientes x), '[]'::jsonb),
    'lotes',          coalesce((select jsonb_agg(to_jsonb(x)) from lotes x), '[]'::jsonb),
    'movimientos',    coalesce((select jsonb_agg(to_jsonb(x)) from movimientos x), '[]'::jsonb),
    'pedidos',        coalesce((select jsonb_agg(to_jsonb(x)) from pedidos x), '[]'::jsonb),
    'pedido_items',   coalesce((select jsonb_agg(to_jsonb(x)) from pedido_items x), '[]'::jsonb),
    'sin_medicacion', coalesce((select jsonb_agg(to_jsonb(x)) from sin_medicacion x), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$fn$;
revoke all on function public.reposicion_del_periodo(date, date, date, uuid) from public;
grant execute on function public.reposicion_del_periodo(date, date, date, uuid) to authenticated;
```

- [ ] **Step 2: Preparar PGlite en la carpeta temporal**

```bash
mkdir -p "<scratchpad>/pglite-0128"
cd "<scratchpad>/pglite-0128"
npm init -y >/dev/null
npm install @electric-sql/pglite
```

Expected: `added 1 package`.

- [ ] **Step 3: Escribir el banco de pruebas**

`<scratchpad>/pglite-0128/probar.mjs`:

```js
// Corre la 0128 DOS veces sobre un esquema de juguete con las columnas y FKs que usa, y prueba sus caminos.
// No es parte del repo: es la verificación previa a pasarle el SQL al Director (memoria probar-sql-con-pglite).
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const REPO = 'C:/Users/Tutuca/Desktop/Spira/Spira App'
const migracion = readFileSync(`${REPO}/supabase/migrations/0128_reposicion_de_corte_a_corte.sql`, 'utf8')

let fallas = 0
const ok = (cond, msg) => {
  if (cond) console.log('  ✓', msg)
  else { fallas += 1; console.log('  ✗', msg) }
}

// El editor de Supabase rastrea el dollar-quoting SIN ignorar comentarios (0071): los marcadores tienen que ser pares.
const marcadores = migracion.match(/\$[A-Za-z_]*\$/g) ?? []
ok(marcadores.length % 2 === 0, `marcadores de dollar-quote pares (${marcadores.length})`)
ok(!/--[^\n]*\$\$/.test(migracion), 'ningún comentario con dos signos peso pegados')

const db = new PGlite()
const q = (sql, params) => db.query(sql, params)
const uno = async (sql, params) => (await q(sql, params)).rows[0]
async function falla(sql, params, esperado, msg) {
  try {
    await q(sql, params)
    ok(false, `${msg} (no falló)`)
  } catch (e) {
    ok(String(e.message).includes(esperado), `${msg} → ${e.message}`)
  }
}
const como = (uid, rol) => q(`select set_config('test.uid', $1, false), set_config('test.rol', $2, false)`, [uid ?? '', rol ?? ''])

const U = '00000000-0000-0000-0000-00000000000a'
const P1 = '00000000-0000-0000-0000-0000000000b1'
const P2 = '00000000-0000-0000-0000-0000000000b2'
const P3 = '00000000-0000-0000-0000-0000000000b3'
const M1 = '00000000-0000-0000-0000-0000000000c1'
const M2 = '00000000-0000-0000-0000-0000000000c2'
const L1 = '00000000-0000-0000-0000-0000000000d1'
const PA = '00000000-0000-0000-0000-0000000000e1'
const E1 = '00000000-0000-0000-0000-0000000000e2'
const R1 = '00000000-0000-0000-0000-0000000000e3'
const D1 = '00000000-0000-0000-0000-0000000000e4'

await db.exec(`
  create schema auth;
  create role anon;
  create role authenticated;
  create function auth.uid() returns uuid language sql stable as $f$
    select nullif(current_setting('test.uid', true), '')::uuid
  $f$;
  create function public.has_min_role(mod text, min_role text) returns boolean language sql stable as $f$
    select mod = 'pharma' and case current_setting('test.rol', true)
      when 'leader' then min_role in ('viewer', 'operator', 'leader')
      when 'operator' then min_role in ('viewer', 'operator')
      when 'viewer' then min_role = 'viewer'
      else false end
  $f$;
  create function public.has_module(mod text) returns boolean language sql stable as $f$
    select mod = 'gerencia' and current_setting('test.rol', true) = 'gerencia'
  $f$;

  create type protocol_status as enum ('activo', 'pausado', 'cerrado');
  create type enrollment_status as enum ('screening', 'activo', 'completado', 'discontinuado');
  create type public.reception_kind as enum ('protocolo', 'investigacion', 'ambulatoria');
  create type reception_status as enum ('pendiente', 'verificada', 'con_observaciones', 'anulada');
  create type stock_movement_type as enum ('recepcion', 'dispensacion', 'ajuste_manual', 'devolucion', 'vencimiento', 'anulacion_recepcion', 'reasignacion');

  create table public.audit_log (id bigserial primary key, actor_id uuid, action text, entity_type text, entity_id uuid,
    before_data jsonb, after_data jsonb, db_role text, created_at timestamptz default now());
  create function public.audit_row() returns trigger language plpgsql security definer set search_path = public as $f$
  declare v_actor uuid;
  begin
    v_actor := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
    insert into public.audit_log (actor_id, action, entity_type, entity_id, before_data, after_data, db_role)
    values (v_actor, tg_op, tg_table_name, (case when tg_op = 'DELETE' then old.id else new.id end),
      case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
      case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end, session_user);
    return coalesce(new, old);
  end;
  $f$;

  create table public.users (id uuid primary key, full_name text);
  create table public.protocols (id uuid primary key, code text, name text, status protocol_status not null default 'activo');
  create table public.medications (id uuid primary key, name text, unit text, drug_id uuid);
  create table public.protocol_medications (id uuid primary key default gen_random_uuid(),
    protocol_id uuid not null references public.protocols(id) on delete restrict,
    medication_id uuid not null references public.medications(id) on delete restrict,
    reposicion_modo text, envases_por_mes integer, stock_fijo integer, unique (protocol_id, medication_id));
  create table public.patients (id uuid primary key, full_name text);
  create table public.enrollments (id uuid primary key, patient_id uuid references public.patients(id),
    protocol_id uuid references public.protocols(id), status enrollment_status not null default 'activo');
  create table public.patient_medications (id uuid primary key default gen_random_uuid(),
    enrollment_id uuid references public.enrollments(id), medication_id uuid references public.medications(id),
    active boolean not null default true, envases_por_mes integer, habilitacion_id uuid, created_at timestamptz not null default now());
  create table public.visit_definitions (id uuid primary key, date_mode text);
  create table public.patient_visits (id uuid primary key default gen_random_uuid(), enrollment_id uuid references public.enrollments(id),
    visit_def_id uuid references public.visit_definitions(id), kind text, estimated_date date);
  create table public.medication_lots (id uuid primary key default gen_random_uuid(),
    medication_id uuid not null references public.medications(id), protocol_id uuid references public.protocols(id),
    tipo public.reception_kind not null default 'protocolo', lot_number text not null, expiry_date date,
    quantity_on_hand integer not null default 0);
  create table public.dispensation_requests (id uuid primary key default gen_random_uuid(), enrollment_id uuid references public.enrollments(id));
  create table public.dispensations (id uuid primary key default gen_random_uuid(), request_id uuid references public.dispensation_requests(id));
  create table public.stock_movements (id uuid primary key default gen_random_uuid(), medication_id uuid not null,
    lot_id uuid references public.medication_lots(id), movement_type stock_movement_type not null, quantity_delta integer not null,
    reference_id uuid, reference_type text, created_at timestamptz not null default now());
  create table public.medication_receptions (id uuid primary key default gen_random_uuid(),
    tipo public.reception_kind not null default 'protocolo', protocol_id uuid references public.protocols(id) on delete restrict,
    received_by uuid references public.users(id), reception_date date not null, status reception_status not null default 'pendiente',
    notes text, created_at timestamptz not null default now());
  create table public.reception_items (id uuid primary key default gen_random_uuid(),
    reception_id uuid not null references public.medication_receptions(id) on delete cascade,
    medication_id uuid not null references public.medications(id), lot_number text not null, expiry_date date,
    quantity integer not null check (quantity > 0));
  create table public.farmacia_ajustes (id uuid primary key default gen_random_uuid(), unica boolean not null default true unique check (unica),
    demora_compra_dias integer, updated_at timestamptz not null default now(), updated_by uuid);
  insert into public.farmacia_ajustes (unica) values (true);

  -- La create_reception de la 0040, con su firma: la 0128 tiene que reemplazarla sin dejar sobrecarga.
  create function public.create_reception(p_tipo public.reception_kind, p_protocol_id uuid, p_reception_date date, p_notes text, p_items jsonb)
  returns uuid language plpgsql as $f$ begin return null; end $f$;
`)

await db.exec(`
  insert into public.users values ('${U}', 'Lautaro Molina');
  insert into public.protocols values ('${P1}', '222714', 'ENDURA', 'activo'), ('${P2}', 'LTS17231', 'LTS17231', 'activo'), ('${P3}', 'VIEJO', 'Viejo', 'cerrado');
  insert into public.medications values ('${M1}', 'Seretide 250/50', 'Aerosol', null), ('${M2}', 'Salbutral 100 mcg', 'Aerosol', null);
  insert into public.protocol_medications (protocol_id, medication_id, reposicion_modo, envases_por_mes) values ('${P1}', '${M1}', 'mensual', 1);
  insert into public.medication_lots (id, medication_id, protocol_id, lot_number, expiry_date, quantity_on_hand) values ('${L1}', '${M1}', '${P1}', 'L1', '2027-06-30', 8);
  insert into public.patients values ('${PA}', 'Paciente Uno');
  insert into public.enrollments values ('${E1}', '${PA}', '${P1}', 'activo');
  insert into public.patient_medications (enrollment_id, medication_id) values ('${E1}', '${M1}');
  insert into public.dispensation_requests (id, enrollment_id) values ('${R1}', '${E1}');
  insert into public.dispensations (id, request_id) values ('${D1}', '${R1}');
  insert into public.stock_movements (medication_id, lot_id, movement_type, quantity_delta, reference_id, reference_type, created_at) values
    ('${M1}', '${L1}', 'recepcion',      5, null,    'reception',     '2026-08-28 23:30:00-03'),
    ('${M1}', '${L1}', 'dispensacion',  -1, '${D1}', 'dispensation', '2026-08-30 12:00:00-03'),
    ('${M1}', '${L1}', 'recepcion',     15, null,    'reception',     '2026-09-01 12:00:00-03'),
    ('${M1}', '${L1}', 'dispensacion', -12, null,    'dispensation', '2026-09-10 12:00:00-03'),
    ('${M1}', '${L1}', 'ajuste_manual', -1, null,    'ajuste_manual', '2026-09-28 23:30:00-03');
`)

console.log('Aplicar la 0128 (primera vez)')
await db.exec(migracion)
console.log('Aplicar la 0128 (segunda vez: idempotente)')
await db.exec(migracion)

const sobrecargas = await uno(`select count(*)::int as n from pg_proc where proname = 'create_reception'`)
ok(sobrecargas.n === 1, `una sola create_reception (hay ${sobrecargas.n})`)

console.log('reposicion_del_periodo')
await como(null, '')
await falla(`select public.reposicion_del_periodo('2026-08-29', '2026-09-28', '2026-09-16')`, [], 'No autenticado', 'sin sesión')
await como(U, '')
await falla(`select public.reposicion_del_periodo('2026-08-29', '2026-09-28', '2026-09-16')`, [], 'No tenés permiso', 'sin módulo')
await como(U, 'gerencia')
ok((await uno(`select public.reposicion_del_periodo('2026-08-29', '2026-09-28', '2026-09-16') as j`)).j.estudios.length === 2, 'gerencia lee; los cerrados no aparecen')
await como(U, 'viewer')
let j = (await uno(`select public.reposicion_del_periodo('2026-08-29', '2026-09-28', '2026-09-16') as j`)).j
const mv = j.movimientos.find((m) => m.medication_id === M1)
ok(mv && mv.entro === 15, `entró 15: la recepción de las 23:30 del 28/08 es del período anterior (dio ${mv?.entro})`)
ok(mv && mv.salio === 13, `salió 13 (dio ${mv?.salio})`)
ok(mv && mv.ajustes === -1, `el ajuste de las 23:30 del día de corte es de este período (dio ${mv?.ajustes})`)
ok(mv && mv.desde_inicio === 1, `desde el inicio: 15 − 13 − 1 = 1 (dio ${mv?.desde_inicio})`)
ok(j.pacientes.length === 1 && j.pacientes[0].retirado_periodo === 1, 'lo retirado el 30/08 cuenta en el período que empezó el 29/08')
ok(j.lotes.length === 1 && j.renglones.length === 1, 'lotes y renglones del estudio')
j = (await uno(`select public.reposicion_del_periodo('2026-08-29', '2026-09-28', '2026-09-16', $1::uuid) as j`, [P2])).j
ok(j.estudios.length === 1 && j.estudios[0].code === 'LTS17231', 'filtra por estudio')
await falla(`select public.reposicion_del_periodo('2026-09-28', '2026-08-29', '2026-09-16')`, [], 'no es válido', 'período al revés')

console.log('emitir_pedido_medicacion')
const renglones = JSON.stringify([{ medication_id: M1, calculado: 4, pedido: 6 }])
const emitir = (protocolo, r, dia = '2026-09-16') =>
  uno(`select public.emitir_pedido_medicacion($1::uuid, '2026-09-29', '2026-10-28', $3::date, $2::jsonb) as j`, [protocolo, r, dia])
await falla(`select public.emitir_pedido_medicacion($1::uuid, '2026-09-29', '2026-10-28', '2026-09-16', $2::jsonb)`, [P1, renglones], 'No tenés permiso', 'viewer no emite')
await como(U, 'operator')
await falla(`select public.emitir_pedido_medicacion($1::uuid, '2026-09-29', '2026-10-28', '2026-09-16', '[]'::jsonb)`, [P1], 'vacío', 'pedido vacío')
await falla(`select public.emitir_pedido_medicacion($1::uuid, '2026-09-29', '2026-10-28', '2026-09-16', $2::jsonb)`, [P1, JSON.stringify([{ medication_id: M2, calculado: null, pedido: 3 }])], 'no es de este estudio', 'medicamento de otro estudio')
await falla(`select public.emitir_pedido_medicacion($1::uuid, '2026-09-29', '2026-10-28', '2099-01-01', $2::jsonb)`, [P1, renglones], 'futura', 'fecha futura')
await falla(`select public.emitir_pedido_medicacion($1::uuid, '2026-09-29', '2026-10-28', '2026-09-16', $2::jsonb)`, [P3, renglones], 'cerrado', 'estudio cerrado')
ok((await uno(`select count(*)::int as n from public.pedidos_medicacion`)).n === 0, 'los rechazos no dejan cabecera')
const p1 = (await emitir(P1, renglones)).j
ok(typeof p1.numero === 'number' && typeof p1.id === 'string', `emite con número (Nº ${p1.numero})`)
ok((await uno(`select emitido_por_nombre as n from public.pedidos_medicacion where id = $1`, [p1.id])).n === 'Lautaro Molina', 'sella el nombre de quien emite')

console.log('create_reception')
await como(U, 'leader')
const itemsRec = (lote, cantidad) => JSON.stringify([{ medication_id: M1, lot_number: lote, expiry_date: '2027-01-01', quantity: cantidad }])
const vieja = await uno(
  `select public.create_reception(p_tipo => 'protocolo', p_protocol_id => $1::uuid, p_reception_date => '2026-09-16', p_notes => null, p_items => $2::jsonb) as id`,
  [P1, itemsRec('L9', 1)],
)
ok(typeof vieja.id === 'string', 'la llamada vieja, por nombre y con cinco argumentos, sigue andando')
await falla(
  `select public.create_reception(p_tipo => 'protocolo', p_protocol_id => $1::uuid, p_reception_date => '2026-09-30', p_notes => null, p_items => $2::jsonb, p_pedido_id => $3::uuid)`,
  [P2, itemsRec('L2', 4), p1.id], 'mismo estudio', 'recepción de otro estudio',
)
const rec = await uno(
  `select public.create_reception(p_tipo => 'protocolo', p_protocol_id => $1::uuid, p_reception_date => '2026-09-30', p_notes => null, p_items => $2::jsonb, p_pedido_id => $3::uuid) as id`,
  [P1, itemsRec('L2', 4), p1.id],
)
await como(U, 'viewer')
let it = (await uno(`select public.reposicion_del_periodo('2026-08-29', '2026-09-28', '2026-09-16', $1::uuid) as j`, [P1])).j.pedido_items[0]
ok(it.sin_verificar === 4 && it.recibido === 0, 'una recepción pendiente suma como sin verificar')
await q(`update public.medication_receptions set status = 'verificada' where id = $1`, [rec.id])
it = (await uno(`select public.reposicion_del_periodo('2026-08-29', '2026-09-28', '2026-09-16', $1::uuid) as j`, [P1])).j.pedido_items[0]
ok(it.recibido === 4 && it.sin_verificar === 0, 'verificada suma como recibida')

console.log('anular y cerrar faltante')
await como(U, 'operator')
await falla(`select public.anular_pedido_medicacion($1::uuid, 'por_error')`, [p1.id], 'ya tiene recepciones', 'no se anula con recepciones')
await falla(`select public.cerrar_faltante_pedido($1::uuid, 'otro')`, [it.id], 'motivo', 'motivo inválido')
await q(`select public.cerrar_faltante_pedido($1::uuid, 'no_lo_tiene')`, [it.id])
ok((await uno(`select cerrado_motivo as m from public.pedido_medicacion_items where id = $1`, [it.id])).m === 'no_lo_tiene', 'cierra lo que falta con su motivo')
await falla(`select public.cerrar_faltante_pedido($1::uuid, 'no_lo_tiene')`, [it.id], 'ya está cerrado', 'no se cierra dos veces')
const p2 = (await emitir(P1, JSON.stringify([{ medication_id: M1, calculado: null, pedido: 2 }]))).j
await q(`select public.anular_pedido_medicacion($1::uuid, 'por_error')`, [p2.id])
ok((await uno(`select anulado_motivo as m from public.pedidos_medicacion where id = $1`, [p2.id])).m === 'por_error', 'anula sin recepciones')
await falla(`select public.anular_pedido_medicacion($1::uuid, 'por_error')`, [p2.id], 'ya está anulado', 'no se anula dos veces')
await como(U, 'leader')
await falla(
  `select public.create_reception(p_tipo => 'protocolo', p_protocol_id => $1::uuid, p_reception_date => '2026-09-30', p_notes => null, p_items => $2::jsonb, p_pedido_id => $3::uuid)`,
  [P1, itemsRec('L3', 2), p2.id], 'anulado', 'no se recibe un pedido anulado',
)

console.log('auditoría y segunda corrida')
const auditados = await uno(`select count(*)::int as n from public.audit_log where entity_type in ('pedidos_medicacion', 'pedido_medicacion_items')`)
ok(auditados.n >= 5, `pedidos y renglones auditados (${auditados.n} filas)`)
await db.exec(migracion)
ok((await uno(`select count(*)::int as n from pg_proc where proname = 'create_reception'`)).n === 1, 'tercera corrida: sigue habiendo una sola create_reception')
ok((await uno(`select count(*)::int as n from public.pedidos_medicacion`)).n === 2, 'tercera corrida: los pedidos siguen ahí')

console.log(fallas === 0 ? '\nTODO VERDE' : `\n${fallas} FALLAS`)
process.exit(fallas === 0 ? 0 : 1)
```

- [ ] **Step 4: Correr el banco y verificar que pasa entero**

Run: `node "<scratchpad>/pglite-0128/probar.mjs"`
Expected: todas las líneas con `✓` y al final `TODO VERDE`.

Si falla, corregir **la migración** y volver a correr. Si fallan justo las dos líneas de «23:30» y todo lo demás pasa, verificar primero que PGlite tenga la zona horaria: `select now() at time zone 'America/Argentina/Buenos_Aires'` tiene que devolver una hora, no un error. Sin esa zona el banco no puede probar el corte por día AR y hay que decírselo al Director junto con el SQL. Si una falla es del esquema de juguete (una columna que falta), agregarla copiando el tipo y el `on delete` de la migración que la creó.

- [ ] **Step 5: Registrar la 0128 en el índice**

En `supabase/README.md`, con la herramienta Edit (el archivo es CRLF), reemplazar:

```
Spec: `docs/superpowers/specs/2026-09-15-baja-por-estudio-design.md`. **Aplicada en prod (2026-09-16).** |
```

por:

```
Spec: `docs/superpowers/specs/2026-09-15-baja-por-estudio-design.md`. **Aplicada en prod (2026-09-16).** |
| 0128 | `reposicion_de_corte_a_corte.sql` — **Reposición de corte a corte: día de corte, pedidos de medicación y recepción de un pedido** (`docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md`). ADITIVA: va **antes** del front. `farmacia_ajustes.dia_corte` (1-31; null = sin cargar). Tablas `pedidos_medicacion` (número correlativo por secuencia, estudio, período para el que se pide, quién emitió, anulación con motivo de lista) y `pedido_medicacion_items` (calculado y pedido; «No va a llegar» con motivo), auditadas, sin escritura directa. `medication_receptions.pedido_id` (sólo recepciones de protocolo). Funciones: `emitir_pedido_medicacion` (atómica), `anular_pedido_medicacion` (sólo sin recepciones), `cerrar_faltante_pedido` y `reposicion_del_periodo` (SECURITY DEFINER; lotes, libro del período cortado por día AR, pacientes con lo retirado en el período, pedidos con lo recibido y lo sin verificar; forma de `reposicionPeriodoModel.ts`). `create_reception` suma `p_pedido_id` con default null: se borra antes la firma de cinco argumentos para no dejar sobrecarga. `insumos_de_reposicion` y `reposicion_pedidos` (0125) quedan intactas hasta la 0129. Probada con PGlite (dos corridas). |
```

Run: `node scripts/check-migraciones.mjs`
Expected: `✓ 128 migraciones, índice al día.`

Run: `git diff --stat supabase/README.md`
Expected: `1 file changed, 1 insertion(+)`. Si dice cientos de líneas, se cambiaron los finales de línea: `git checkout supabase/README.md` y repetir con Edit.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0128_reposicion_de_corte_a_corte.sql supabase/README.md
git commit -m "feat(db): 0128 — reposición de corte a corte y pedidos de medicación

Aditiva: va antes del front. Probada en PGlite con dos corridas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Capa de datos

**Files:**
- Modify: `src/data/pharma/reposicion.ts` (agregar al final, sin tocar lo existente)
- Modify: `src/data/pharma/receptions.ts:172-205` (`NewReceptionInput` y `createReception`)

**Interfaces:**
- Consumes: `Periodo` (Task 1), `MotivoAnulacion` y `MotivoCierre` (Task 2), `InsumosDelPeriodo` (Task 3), las funciones de la 0128 (Task 4).
- Produces (lo que usa la Parte 2):
  - `useDiaCorte(): QueryResult<{ diaCorte: number | null }>`
  - `useReposicionDelPeriodo(periodo: Periodo | null, protocolId?: string | null): QueryResult<InsumosDelPeriodo | null>`
  - `guardarDiaCorte(dia: number): Promise<Resultado>`
  - `emitirPedidoMedicacion(input: { protocolId: string; periodo: Periodo; emitidoEl: string; renglones: { medication_id: string; calculado: number | null; pedido: number }[] }): Promise<Resultado & { id?: string; numero?: number }>`
  - `anularPedidoMedicacion(pedidoId: string, motivo: MotivoAnulacion): Promise<Resultado>`
  - `cerrarFaltantePedido(itemId: string, motivo: MotivoCierre): Promise<Resultado>`
  - `NewReceptionInput.pedido_id?: string | null`

- [ ] **Step 1: Hooks y mutaciones de reposición**

En `src/data/pharma/reposicion.ts`, reemplazar la línea de imports:

```ts
import type { InsumosReposicion, ModoReposicion } from './reposicionModel'
```

por:

```ts
import type { InsumosReposicion, ModoReposicion } from './reposicionModel'
import type { Periodo } from './periodoDeCorte'
import type { MotivoAnulacion, MotivoCierre } from './pedidosMedicacionModel'
import type { InsumosDelPeriodo } from './reposicionPeriodoModel'
```

Y agregar al final del archivo:

```ts
// ═══════════════════════════ De corte a corte (0128) ═══════════════════════════
// docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md. Lo de arriba (mes calendario, demora,
// «Ya lo pedí») es de la card de Estadísticas y se va con ella en la Parte 2.

/**
 * El día de corte de Farmacia (R4). Envuelto en un objeto porque `null` es un valor con significado
 * («sin cargar»: la pantalla lo pide) y no tiene que confundirse con «todavía no llegó».
 */
export function useDiaCorte() {
  return useSupabaseQuery<{ diaCorte: number | null }>(
    async (c) => {
      const { data, error } = await c.from('farmacia_ajustes').select('dia_corte').eq('unica', true).maybeSingle()
      if (error) return { data: null, error }
      return { data: { diaCorte: (data as { dia_corte: number | null } | null)?.dia_corte ?? null }, error: null }
    },
    [],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}

/**
 * Los datos crudos de un período (`reposicion_del_periodo`, 0128). La cuenta la hace
 * `armarReposicionDelPeriodo` (D11). Sin período todavía (falta el día de corte) no pide nada.
 * `protocolId` null = todos los estudios no cerrados (la grilla).
 */
export function useReposicionDelPeriodo(periodo: Periodo | null, protocolId: string | null = null) {
  return useSupabaseQuery<InsumosDelPeriodo | null>(
    async (c) => {
      if (!periodo) return { data: null, error: null }
      const { data, error } = await c.rpc('reposicion_del_periodo', {
        p_desde: periodo.desde,
        p_hasta: periodo.hasta,
        p_protocol_id: protocolId,
      })
      if (error) return { data: null, error }
      return { data: data as InsumosDelPeriodo, error: null }
    },
    // Los bordes y no el objeto: un período recalculado en cada render cambia de identidad.
    [periodo?.desde, periodo?.hasta, protocolId],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}

/** El día de corte (R4). Update directo: 0 filas = sin permiso (RLS). */
export async function guardarDiaCorte(dia: number): Promise<Resultado> {
  const { data, error } = await supabase
    .from('farmacia_ajustes')
    .update({ dia_corte: dia })
    .eq('unica', true)
    .select('id')
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para cambiar el día de corte.' }
  return { error: null }
}

/** «Emitir e imprimir» (R8): cabecera y renglones en una llamada atómica. Devuelve el número para la hoja. */
export async function emitirPedidoMedicacion(input: {
  protocolId: string
  /** El período PARA el que se pide (P1). */
  periodo: Periodo
  /** Hoy en hora AR. */
  emitidoEl: string
  renglones: { medication_id: string; calculado: number | null; pedido: number }[]
}): Promise<Resultado & { id?: string; numero?: number }> {
  const { data, error } = await supabase.rpc('emitir_pedido_medicacion', {
    p_protocol_id: input.protocolId,
    p_desde: input.periodo.desde,
    p_hasta: input.periodo.hasta,
    p_emitido_el: input.emitidoEl,
    p_renglones: input.renglones,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  const r = data as { id: string; numero: number }
  return { error: null, id: r.id, numero: r.numero }
}

/** Anular un pedido emitido (R9). La base lo rechaza si ya tiene recepciones. */
export async function anularPedidoMedicacion(pedidoId: string, motivo: MotivoAnulacion): Promise<Resultado> {
  const { error } = await supabase.rpc('anular_pedido_medicacion', { p_pedido_id: pedidoId, p_motivo: motivo })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/** «No va a llegar» (R11): cierra lo que falta de un renglón, que vuelve a la compra. */
export async function cerrarFaltantePedido(itemId: string, motivo: MotivoCierre): Promise<Resultado> {
  const { error } = await supabase.rpc('cerrar_faltante_pedido', { p_item_id: itemId, p_motivo: motivo })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}
```

- [ ] **Step 2: La recepción de un pedido**

En `src/data/pharma/receptions.ts`, dentro de `interface NewReceptionInput`, reemplazar:

```ts
  items: ReceptionItemInput[]
}
```

por:

```ts
  items: ReceptionItemInput[]
  /** El pedido de medicación que se está recibiendo (0128, R10). Sólo recepciones de protocolo. */
  pedido_id?: string | null
}
```

Y en `createReception`, reemplazar:

```ts
    p_items: input.items,
  })
```

por:

```ts
    p_items: input.items,
    // Sólo cuando hay pedido: sin él, la llamada es la misma de siempre y no depende de la 0128.
    ...(input.pedido_id ? { p_pedido_id: input.pedido_id } : {}),
  })
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/data/pharma/reposicion.ts src/data/pharma/receptions.ts
git commit -m "feat(reposicion): hooks y mutaciones de corte a corte

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Gate, PR, aplicación y sondas

**Files:**
- Create (fuera del repo): `<scratchpad>/sondas-0128.mjs`
- Modify: `supabase/README.md` (marca «Aplicada en prod», en una rama nueva)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: PR mergeada, 0128 aplicada y registrada. Es el punto de partida de la Parte 2.

- [ ] **Step 1: Gate completo**

Run: `npm run build`
Expected: typecheck sin errores, vitest verde (≥ 1159 + 60 tests nuevos; si el número se dispara, son los worktrees de otras sesiones: confirmar con `npx vitest run --exclude ".claude/worktrees/**"`), `vite build` terminado.

- [ ] **Step 2: Push**

```bash
git -c credential.interactive=false push -u origin feat/reposicion-periodo-base
```

Expected: `branch 'feat/reposicion-periodo-base' set up to track 'origin/feat/reposicion-periodo-base'`.
Si responde `Cannot prompt` o `could not read Password`: GCM perdió la credencial (memoria `gotcha-git-tres-cuentas-github`). Pedirle al Director que corra ese mismo `git push` en su terminal y seguir cuando confirme.

- [ ] **Step 3: Abrir la PR por API**

`<scratchpad>/crear-pr-0128.mjs`:

```js
import { execSync } from 'node:child_process'

const salida = execSync('git -c credential.interactive=false credential fill', {
  input: 'protocol=https\nhost=github.com\nusername=spiraclinicapp\n\n',
  cwd: 'C:/Users/Tutuca/Desktop/Spira/Spira App',
}).toString()
const token = salida.match(/^password=(.*)$/m)?.[1]
if (!token) throw new Error('Sin token: pedirle al Director un git push desde su terminal')

const body = `## Qué trae

Parte 1 del submódulo **Reposición** ([spec](docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md), [plan](docs/superpowers/plans/2026-09-16-reposicion-parte-1-modelo-y-base.md)). **Sin pantallas todavía**: la card de Estadísticas sigue igual.

- La cuenta de **corte a corte**, con el libro (había · entró · salió · hay) y la **boleta** que la explica, con los ejemplos de los bocetos como tests.
- Los **pedidos de medicación**, con el estado deducido de lo recibido.
- Los hooks y mutaciones que va a usar la pantalla.
- La migración **0128**, probada en PGlite con dos corridas.

## ⚠️ Orden de despliegue

La **0128 es ADITIVA: se aplica apenas se mergea esta PR**, antes de cualquier front. No toca lo que usa la card de Estadísticas (\`insumos_de_reposicion\`, \`reposicion_pedidos\`). Reemplaza \`create_reception\` por una con un parámetro opcional más; la Recepción de hoy la sigue llamando igual.

Después de aplicarla corro las sondas sin sesión y registro «Aplicada en prod» en una PR aparte.

🤖 Generated with [Claude Code](https://claude.com/claude-code)`

const r = await fetch('https://api.github.com/repos/spiraclinicapp/Spira-App/pulls', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'spira-agent' },
  body: JSON.stringify({
    title: 'Reposición de corte a corte · parte 1: modelo, datos y migración 0128',
    head: 'feat/reposicion-periodo-base',
    base: 'main',
    body,
  }),
})
const json = await r.json()
console.log(r.status, json.html_url ?? json.message)
```

Run: `node "<scratchpad>/crear-pr-0128.mjs"`
Expected: `201 https://github.com/spiraclinicapp/Spira-App/pull/<N>`

- [ ] **Step 4: Avisarle al Director y esperar**

En el chat, en una sola frase clara: la PR está abierta, **la 0128 se aplica apenas se mergea** (va antes del front), y el archivo está en `supabase/migrations/0128_reposicion_de_corte_a_corte.sql` de `main` una vez mergeada. No seguir hasta que confirme «aplicada».

- [ ] **Step 5: Traer `main` al local**

```bash
git fetch origin
git switch main
git pull --ff-only
ls supabase/migrations/0128_reposicion_de_corte_a_corte.sql
```

Expected: el archivo existe.

- [ ] **Step 6: Sondas sin sesión**

`<scratchpad>/sondas-0128.mjs`:

```js
// Sondas SIN SESIÓN después de aplicar la 0128. No escriben nada: prueban que cada objeto existe y que
// create_reception no quedó ambigua. Un 401/42501 o «No autenticado» = existe; 404/PGRST202/PGRST205/
// 42703 = falta; PGRST203 = sobrecarga ambigua.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('C:/Users/Tutuca/Desktop/Spira/Spira App/.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const CERO = '00000000-0000-0000-0000-000000000000'

const rpc = async (nombre, body) => {
  const r = await fetch(`${url}/rest/v1/rpc/${nombre}`, { method: 'POST', headers: h, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json().catch(() => null) }
}
const get = async (ruta) => {
  const r = await fetch(`${url}/rest/v1/${ruta}`, { headers: h })
  return { status: r.status, body: await r.json().catch(() => null) }
}
const FALTA = new Set(['PGRST202', 'PGRST203', 'PGRST205', '42703', '42883'])
const existe = (r) => r.status !== 404 && !FALTA.has(r.body?.code)

const casos = [
  ['reposicion_del_periodo', await rpc('reposicion_del_periodo', { p_desde: '2026-08-29', p_hasta: '2026-09-28' }), existe],
  ['emitir_pedido_medicacion', await rpc('emitir_pedido_medicacion', { p_protocol_id: CERO, p_desde: '2026-09-29', p_hasta: '2026-10-28', p_emitido_el: '2026-09-16', p_renglones: [] }), existe],
  ['anular_pedido_medicacion', await rpc('anular_pedido_medicacion', { p_pedido_id: CERO, p_motivo: 'por_error' }), existe],
  ['cerrar_faltante_pedido', await rpc('cerrar_faltante_pedido', { p_item_id: CERO, p_motivo: 'no_lo_tiene' }), existe],
  ['create_reception con 5 argumentos (la del front desplegado)', await rpc('create_reception', { p_tipo: 'protocolo', p_protocol_id: CERO, p_reception_date: '2026-09-16', p_notes: null, p_items: [] }), existe],
  ['create_reception con pedido', await rpc('create_reception', { p_tipo: 'protocolo', p_protocol_id: CERO, p_reception_date: '2026-09-16', p_notes: null, p_items: [], p_pedido_id: CERO }), existe],
  ['tabla pedidos_medicacion', await get('pedidos_medicacion?select=id&limit=1'), existe],
  ['tabla pedido_medicacion_items', await get('pedido_medicacion_items?select=id&limit=1'), existe],
  ['columna medication_receptions.pedido_id', await get('medication_receptions?select=pedido_id&limit=1'), existe],
  ['columna farmacia_ajustes.dia_corte', await get('farmacia_ajustes?select=dia_corte&limit=1'), existe],
  ['CONTROL: función inventada tiene que faltar', await rpc('funcion_que_no_existe_0128', {}), (r) => !existe(r)],
  ['CONTROL: columna inventada tiene que faltar', await get('farmacia_ajustes?select=columna_inventada&limit=1'), (r) => !existe(r)],
]

let fallas = 0
for (const [nombre, r, pasa] of casos) {
  const bien = pasa(r)
  if (!bien) fallas += 1
  console.log(bien ? '✓' : '✗', nombre, '→', r.status, r.body?.code ?? '', r.body?.message ?? '')
}
console.log(fallas === 0 ? '\nTODO VERDE' : `\n${fallas} FALLAS`)
process.exit(fallas === 0 ? 0 : 1)
```

Run: `node "<scratchpad>/sondas-0128.mjs"`
Expected: doce `✓` (los dos controles incluidos) y `TODO VERDE`.

Si `create_reception con 5 argumentos` da `PGRST203`: quedó la sobrecarga. Pasarle al Director, tal cual:

```sql
drop function if exists public.create_reception(public.reception_kind, uuid, date, text, jsonb);
```

y volver a correr las sondas.

- [ ] **Step 7: Registrar «Aplicada en prod»**

```bash
git switch -c docs/0128-aplicada
```

En `supabase/README.md`, con Edit, reemplazar:

```
Probada con PGlite (tres corridas). |
```

por (con la fecha que confirmó el Director):

```
Probada con PGlite (tres corridas). **Aplicada en prod (AAAA-MM-DD).** |
```

La fecha va **literal** (por ejemplo `2026-09-17`): el control de CI busca exactamente `Aplicada en prod (\d{4}-\d{2}-\d{2})`.

Run: `node scripts/check-migraciones.mjs`
Expected: `✓ 128 migraciones, índice al día.`

```bash
git add supabase/README.md
git commit -m "docs(db): 0128 aplicada en prod

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git -c credential.interactive=false push -u origin docs/0128-aplicada
```

Abrir la PR con el mismo script del Step 3, cambiando `title` («docs(db): 0128 aplicada en prod»), `head` (`docs/0128-aplicada`) y `body` (una línea con el resultado de las sondas).

- [ ] **Step 8: Dejar el local en `main`**

Después de que el Director mergee la PR del Step 7:

```bash
git fetch origin
git switch main
git pull --ff-only
git status -sb
```

Expected: `## main...origin/main` sin cambios.

---

## Desviaciones durante la ejecución

Lo que terminó distinto de lo escrito arriba, para quien lea este plan como referencia y no como bitácora:

- **Helpers exportados, no duplicados.** Donde el plan escribía una cuenta que ya existía en otro archivo
  del módulo (`reposicionModel.ts`), se exportó y se reusó (`diaMes`, `envasesTxt`, `estanteAlComienzo`,
  `nombresDePacientes`, `presentacionesDuplicadas`, `sigueEnElMes`, `sumarDias`, `terminoCronograma`) en
  vez de copiar el cuerpo en `reposicionPeriodoModel.ts`.
- **`p_hoy` afuera.** `reposicion_del_periodo` nunca lo necesitó —el corte lo hacen `p_desde`/`p_hasta`
  solos, cortando los movimientos por su día en hora AR— así que se sacó de la firma antes de aplicar
  nada; no hay una firma vieja con `p_hoy` conviviendo. `useReposicionDelPeriodo` quedó
  `(periodo, protocolId = null)`, sin `hoy` (ya corregido arriba, Task 5 Step 1).
- **El trigger de validación de `pedido_id` (Task 4, sección 5 de la 0128) es SIN `SECURITY DEFINER`, y
  corta por rol ANTES del `FOR SHARE`.** No es lo que este plan detalla: el guard necesita distinguir
  quién escribe (`current_user`), y con `SECURITY DEFINER` esa distinción se pierde (siempre sería el
  owner). Y el chequeo de rol tiene que ir ANTES del lock porque un `FOR SHARE` exige privilegio `UPDATE`
  sobre la tabla, que `authenticated` no tiene — si se intentara el lock primero, un PATCH directo fallaría
  con un `permission denied` genérico de Postgres en vez del mensaje de dominio en castellano.
- **`EstadoRenglonPeriodo` con `'sin_cuenta'`, no contemplado acá.** Surgió del review final (2026-09-17):
  en un período que no está en curso (R6), mostrar `'alcanza'`/`'cubierto'` sin haber calculado nada es un
  dato inventado presentado como real (regla de honestidad, CLAUDE.md). Ver `src/data/pharma/reposicionPeriodoModel.ts`.
- **`pedidoDestacado` por SUPERPOSICIÓN de período, no por igualdad de `periodo_desde`.** También del
  review final: si Farmacia cambia el día de corte después de emitir un pedido, la igualdad exacta dejaba
  de reconocerlo como «el pedido de este período».
- **La boleta también avisa con todo vencido.** El renglón «Van a quedar en el estante al corte» ahora
  aparece (con valor 0 si corresponde) cuando hay vencidos o algo que vence antes del próximo período,
  aunque no quede nada vigente — antes callaba, y la cuenta no cerraba a la vista.

---

## Después de este plan

Con la 0128 en prod y el modelo en `main`:

1. **Mock al repo** (`docs/design_handoff_reposicion_submodulo/`) partiendo de los bocetos de la sesión del 16/09 (grilla, estudio, boleta A, armar pedido, hoja, Recibir un pedido), y `/plan-design-review`. Es la regla del repo: no se implementa UI sin mock.
2. **Plan de la Parte 2** (front + `0129`), escrito contra el mock aprobado: submódulo en `registry`, vistas en `src/views/pharma/reposicion/`, «Recibir un pedido» en Recepción, salida de la card de Estadísticas, y la `0129` de limpieza, que **no se pushea hasta que el front esté desplegado**.
