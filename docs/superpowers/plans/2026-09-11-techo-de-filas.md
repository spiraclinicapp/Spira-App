# El techo de filas, completo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`2026-09-11-techo-de-filas-design.md`](../specs/2026-09-11-techo-de-filas-design.md) — leelo antes de empezar. Las decisiones D1–D3 se citan por número.

**Goal:** que las cinco consultas de Farmacia › Estadísticas participen del techo que bloquea la impresión —hoy `rechazados` y `vencidos` quedan afuera y sus números se imprimen cortos sin aviso— y que el aviso diga cuáles cortaron y qué control sirve para achicarlas.

**Architecture:** una función pura nueva en su propio archivo, que recibe las cinco consultas con su techo y con qué control achica cada una, y devuelve el aviso ya resuelto (`detalle` + `consejo`) o `null`. `ReportesView` arma las candidatas y la usa; la escalera de ternarios desaparece.

**Tech Stack:** React 18 + TypeScript strict, Vite, vitest (entorno `node`, sin jsdom). Sin librerías nuevas.

## Global Constraints

- **Rama:** `fix/techo-de-filas-completo`, ya creada desde `main` limpio, con el spec commiteado. **Verificá la rama antes de cada commit** (hay un hook que bloquea `main`). **Stagear siempre POR RUTA**, nunca `git add -A` ni `.`: el árbol es compartido con el Director.
- **El gate de verificación es `npm run build`** (`tsc --noEmit && vitest run && vite build`). Verde antes de cada commit. Hoy son **916 tests**.
- **Qué se testea:** sólo lo que falla **en silencio** (regla de `CLAUDE.md`, que tiene prioridad sobre el TDD por defecto). Acá eso es **la función pura de la Task 1, y nada más**. El aviso en pantalla se verifica mirando.
- **vitest corre en entorno `node`**: sin jsdom, sin testing-library, y no se agregan.
- **Idioma:** comentarios y copy de UI en **castellano rioplatense**. Los comentarios del repo explican el **porqué**, no el qué — igualá esa densidad.
- **Copy de UI:** el submódulo se llama **Estadísticas**; los módulos, **Coordinación** y **Farmacia**.
- **Errores y avisos: mensajes serenos.** El aviso le habla a la farmacéutica, no al desarrollador.
- **No se toca `TECHO_FILAS`** (5.000), ni `invariantes()`, ni la línea de consistencia, ni la base. **Sin migración.**
- **Portón único (D1):** cualquiera de las cinco bloquea las 15 hojas. Está decidido con el Director, con su costo aceptado.

## Estructura de archivos

| Archivo | Qué hace | Task |
|---|---|---|
| `src/views/pharma/reportes/truncamiento.ts` | **Crear.** `FuenteDeDatos`, `Truncamiento` y la función pura `truncamiento()` | 1 |
| `src/views/pharma/reportes/truncamiento.test.ts` | **Crear.** Los nueve casos: `null`, la enumeración con 1/2/3 fuentes, y las cuatro ramas del consejo | 1 |
| `src/views/pharma/reportes/ReportesView.tsx` | **Modificar.** Arma las cinco candidatas, reemplaza la escalera de ternarios y el texto del `Aviso` | 2 |

---

### Task 1: La función pura y sus tests

**Files:**
- Create: `src/views/pharma/reportes/truncamiento.ts`
- Test: `src/views/pharma/reportes/truncamiento.test.ts`

**Interfaces:**
- Consumes: `formatNumberAR` de `src/lib/numbers.ts` (ya existe).
- Produces, y la Task 2 usa estos nombres exactos:
  - `interface FuenteDeDatos { que: string; total: number | null; truncado: boolean; porRango: boolean; porProtocolo: boolean; motivo?: string }`
  - `interface Truncamiento { detalle: string; consejo: string }`
  - `function truncamiento(fuentes: FuenteDeDatos[]): Truncamiento | null`

**Por qué esta función lleva test y el resto de la tanda no:** un consejo equivocado **se lee
perfecto**. Está bien redactado, en castellano, y manda a la farmacéutica a tocar un control que no
achica nada mientras la impresión sigue bloqueada. No hay error, no hay nada torcido en pantalla, y
nadie tiene con qué compararlo.

- [ ] **Step 1: Escribir los tests que fallan**

Creá `src/views/pharma/reportes/truncamiento.test.ts` con exactamente esto:

```ts
import { describe, expect, it } from 'vitest'
import { truncamiento } from './truncamiento'
import type { FuenteDeDatos } from './truncamiento'

/**
 * El aviso de truncamiento.
 *
 * POR QUÉ ESTO LLEVA TEST Y EL AVISO EN PANTALLA NO: un consejo equivocado se lee perfecto. Está
 * bien redactado y bien formateado, y manda a la farmacéutica a tocar un control que no achica
 * nada — con la impresión bloqueada y sin nada que se vea mal. La falla es silenciosa; la del
 * aviso, visible.
 *
 * LA ASIMETRÍA QUE ESTAS PRUEBAS FIJAN: no todas las consultas responden a los dos controles. A
 * `vencidos` no la achica el rango (un lote está vencido HOY, no "durante julio") y a las salidas
 * ambulatorias no las achica el protocolo (no tienen). Si las dos truncan a la vez, ningún control
 * por separado alcanza.
 */

/** Fuente sana por defecto: no truncada y achicable por los dos controles. */
function fuente(over: Partial<FuenteDeDatos> = {}): FuenteDeDatos {
  return {
    que: over.que ?? 'dispensaciones',
    total: over.total ?? 6000,
    truncado: over.truncado ?? true,
    porRango: over.porRango ?? true,
    porProtocolo: over.porProtocolo ?? true,
    motivo: over.motivo,
  }
}

const SALIDAS = fuente({
  que: 'salidas ambulatorias',
  porProtocolo: false,
  motivo: 'una salida ambulatoria no tiene protocolo',
})

const VENCIDOS = fuente({
  que: 'lotes vencidos',
  porRango: false,
  motivo: 'un lote está vencido hoy, no durante el período',
})

describe('truncamiento', () => {
  it('sin ninguna truncada devuelve null', () => {
    // Es lo que apaga el aviso Y desbloquea la impresión: si devolviera un objeto vacío en vez de
    // null, la pantalla quedaría avisando de un corte que no existe y sin poder imprimir nunca.
    const r = truncamiento([
      fuente({ truncado: false }),
      fuente({ que: 'recepciones', truncado: false }),
    ])
    expect(r).toBeNull()
  })

  it('ignora las fuentes sanas y nombra sólo las que cortaron', () => {
    const r = truncamiento([
      fuente({ truncado: false }),
      fuente({ que: 'recepciones', total: 7200 }),
    ])
    expect(r?.detalle).toBe('7.200 en recepciones')
  })
})

describe('truncamiento · la enumeración', () => {
  it('con UNA fuente no mete conjunción', () => {
    expect(truncamiento([fuente({ total: 5001 })])?.detalle).toBe('5.001 en dispensaciones')
  })

  it('con DOS usa "y", sin coma', () => {
    const r = truncamiento([fuente({ total: 6000 }), fuente({ que: 'recepciones', total: 7200 })])
    expect(r?.detalle).toBe('6.000 en dispensaciones y 7.200 en recepciones')
  })

  it('con TRES usa comas y la "y" sólo antes de la última', () => {
    const r = truncamiento([
      fuente({ total: 6000 }),
      fuente({ que: 'recepciones', total: 7200 }),
      fuente({ que: 'pedidos rechazados o cancelados', total: 5100 }),
    ])
    expect(r?.detalle).toBe(
      '6.000 en dispensaciones, 7.200 en recepciones y 5.100 en pedidos rechazados o cancelados',
    )
  })
})

describe('truncamiento · el consejo', () => {
  it('si todo lo cortado responde a los dos controles, ofrece los dos', () => {
    const r = truncamiento([fuente(), fuente({ que: 'recepciones' })])
    expect(r?.consejo).toBe('Acotá el rango o filtrá por protocolo.')
  })

  it('si algo no responde al protocolo, manda al rango y dice por qué el otro no sirve', () => {
    const r = truncamiento([SALIDAS])
    expect(r?.consejo).toBe(
      'Acotá el rango. Filtrar por protocolo no achica salidas ambulatorias: una salida ambulatoria no tiene protocolo.',
    )
  })

  it('si algo no responde al rango, manda al protocolo y dice por qué el otro no sirve', () => {
    const r = truncamiento([VENCIDOS])
    expect(r?.consejo).toBe(
      'Filtrá por protocolo. Acotar el rango no achica lotes vencidos: un lote está vencido hoy, no durante el período.',
    )
  })

  it('si cada una responde a un control distinto, pide los DOS', () => {
    // El caso incómodo, y el que un consejo fijo resolvía mal: por separado ninguno alcanza.
    const r = truncamiento([SALIDAS, VENCIDOS])
    expect(r?.consejo).toBe(
      'Acotá el rango y filtrá por protocolo: cada una de estas listas responde a uno de los dos.',
    )
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/views/pharma/reportes/truncamiento.test.ts`
Expected: FAIL en la transformación del archivo, porque `./truncamiento` no existe todavía (`Failed to resolve import "./truncamiento"` o equivalente). **Si pasa, algo está mal:** revisá que hayas guardado el archivo.

- [ ] **Step 3: Escribir la función**

Creá `src/views/pharma/reportes/truncamiento.ts` con exactamente esto:

```ts
import { formatNumberAR } from '../../../lib/numbers'

/**
 * El aviso de truncamiento de Estadísticas: qué consultas cortaron y qué hacer al respecto.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO. Las cinco consultas piden `count: 'exact'` con un techo de filas
 * porque PostgREST corta por `max-rows` devolviendo **200 OK**: sin el conteo, un rango largo daría
 * totales cortos sin ningún error, y esos totales se imprimen y se firman. Lo que faltaba era que
 * el aviso supiera CUÁL cortó y QUÉ control la achica.
 *
 * LA ASIMETRÍA, que es lo que hace que esto no sea un `if`: los dos controles de la pantalla no
 * sirven para todas las consultas.
 *
 *   · A `vencidos` NO la achica el rango: es un corte AL DÍA DE HOY, no del período.
 *   · A las salidas ambulatorias NO las achica el protocolo: no tienen (0116).
 *
 * Y si esas dos truncan a la vez, ningún control por separado alcanza. Por eso cada fuente declara
 * a qué responde, como dato al lado de su rótulo: ahí se lee y se corrige junto, en vez de quedar
 * implícito en una escalera de ternarios.
 *
 * Es puro a propósito —sin React, sin Supabase— porque el consejo es lo que falla en silencio: uno
 * equivocado se lee perfecto y manda a tocar un control inerte con la impresión bloqueada.
 */

export interface FuenteDeDatos {
  /** Cómo se nombra en el aviso, en plural y en minúscula: "dispensaciones", "lotes vencidos". */
  que: string
  /** Filas que la base dice que hay. Nunca es null cuando `truncado` es true (ver abajo). */
  total: number | null
  truncado: boolean
  /** ¿Acotar el período achica esta lista? */
  porRango: boolean
  /** ¿Filtrar por protocolo achica esta lista? */
  porProtocolo: boolean
  /** Por qué esta lista no responde a uno de los dos controles. Sólo para las que tienen un `false`. */
  motivo?: string
}

export interface Truncamiento {
  /** Las fuentes que cortaron, con su número: "6.000 en dispensaciones y 7.200 en recepciones". */
  detalle: string
  /** Qué hacer, ya resuelto contra la asimetría. Termina en punto. */
  consejo: string
}

/** "a", "a y b", "a, b y c" — la coma sólo aparece a partir de tres. */
function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/**
 * Devuelve `null` si ninguna consulta cortó — y ese null es lo que apaga el aviso Y desbloquea la
 * impresión, así que no puede ser un objeto vacío.
 *
 * `total ?? 0` no es una red contra el null: `conTecho` sólo levanta `truncado` cuando el conteo
 * exacto llegó y superó el techo, así que una fuente en esta lista siempre tiene número. El
 * fallback está para que el tipo cierre sin un `!`.
 */
export function truncamiento(fuentes: FuenteDeDatos[]): Truncamiento | null {
  const cortadas = fuentes.filter((f) => f.truncado)
  if (cortadas.length === 0) return null

  const detalle = enumerar(cortadas.map((f) => `${formatNumberAR(f.total ?? 0)} en ${f.que}`))

  const sinProtocolo = cortadas.filter((f) => !f.porProtocolo)
  const sinRango = cortadas.filter((f) => !f.porRango)

  /* Las cuatro ramas salen de la UNIÓN de lo que cortó, no de la primera fuente: ofrecer un control
     que no achica NADA de lo que cortó es peor que no decir nada, porque la farmacéutica lo usa,
     no pasa nada, y sigue sin poder imprimir. */
  const consejo =
    sinProtocolo.length === 0 && sinRango.length === 0
      ? 'Acotá el rango o filtrá por protocolo.'
      : sinRango.length === 0
        ? `Acotá el rango. Filtrar por protocolo no achica ${enumerar(sinProtocolo.map((f) => f.que))}: ${enumerar(sinProtocolo.map((f) => f.motivo ?? 'no responde a ese control'))}.`
        : sinProtocolo.length === 0
          ? `Filtrá por protocolo. Acotar el rango no achica ${enumerar(sinRango.map((f) => f.que))}: ${enumerar(sinRango.map((f) => f.motivo ?? 'no responde a ese control'))}.`
          : 'Acotá el rango y filtrá por protocolo: cada una de estas listas responde a uno de los dos.'

  return { detalle, consejo }
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/views/pharma/reportes/truncamiento.test.ts`
Expected: PASS, **9 tests**.

- [ ] **Step 5: Correr el gate entero**

Run: `npm run build`
Expected: verde, **925 tests** (916 + 9).

- [ ] **Step 6: Commit**

```bash
git add src/views/pharma/reportes/truncamiento.ts src/views/pharma/reportes/truncamiento.test.ts
git commit -m "feat(reportes): la regla del aviso de truncamiento, pura y con tests

Los dos controles de la pantalla no sirven para todas las consultas: a vencidos
no la achica el rango (es un corte al dia de hoy) y a las salidas ambulatorias no
las achica el protocolo (no tienen). Si las dos cortan a la vez, ninguno por
separado alcanza.

Cada fuente declara a que responde, como dato al lado de su rotulo, y el consejo
sale de la UNION de lo que corto. Lleva tests porque un consejo equivocado se lee
perfecto: manda a tocar un control inerte con la impresion bloqueada, sin que
nada se vea mal.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Cablearla en la pantalla

**Files:**
- Modify: `src/views/pharma/reportes/ReportesView.tsx`

**Interfaces:**
- Consumes: `truncamiento(fuentes)` y el tipo `FuenteDeDatos` de la Task 1.
- Produces: la constante local `corte` (tipo `Truncamiento | null`) y `truncado`, que alimenta `puedeImprimir` igual que hoy.

**El cambio en una línea:** hoy hay una escalera de tres ternarios que nombra **la primera** consulta
que cortó y deja `rechazados` y `vencidos` afuera del techo. Pasa a ser una lista de las **cinco**
candidatas y una llamada.

- [ ] **Step 1: Importar la función**

En `src/views/pharma/reportes/ReportesView.tsx`, debajo del import de `./serie` (que ya existe), agregá:

```ts
import { truncamiento } from './truncamiento'
```

- [ ] **Step 2: Reemplazar la escalera de ternarios**

Buscá el bloque que hoy dice, empezando por su comentario:

```ts
  /* Cuál consulta cortó, y con cuántas filas. Antes el aviso citaba SIEMPRE el total de `items`
```

y termina en:

```ts
  const truncado = fuenteTruncada !== null
```

Reemplazá **todo ese bloque** (el comentario, la escalera de ternarios y la línea de `truncado`) por:

```ts
  /* Las CINCO consultas con su techo, y a qué control responde cada una — que no es simétrico.
     `rechazados` y `vencidos` no participaban del techo, y sus dos números se imprimen: en la hoja
     del resumen, en la propia y en el informe completo. Un techo alcanzado ahí salía como número
     corto en una hoja firmada, sin aviso.
     El `motivo` viaja al lado del rótulo a propósito: es lo que el consejo le dice a la
     farmacéutica cuando uno de los dos controles no le va a servir. */
  const corte = truncamiento([
    { que: 'dispensaciones', total: items.total, truncado: items.truncado, porRango: true, porProtocolo: true },
    { que: 'recepciones', total: recepciones.total, truncado: recepciones.truncado, porRango: true, porProtocolo: true },
    { que: 'pedidos rechazados o cancelados', total: rechazados.total, truncado: rechazados.truncado, porRango: true, porProtocolo: true },
    {
      que: 'salidas ambulatorias',
      total: salidas.total, truncado: salidas.truncado,
      porRango: true, porProtocolo: false,
      motivo: 'una salida ambulatoria no tiene protocolo',
    },
    {
      que: 'lotes vencidos',
      total: vencidos.total, truncado: vencidos.truncado,
      porRango: false, porProtocolo: true,
      motivo: 'un lote está vencido hoy, no durante el período',
    },
  ])
  const truncado = corte !== null
```

**No muevas nada más de ese bloque.** Las líneas de `cargando` y `error` que están justo arriba
quedan como están, y `puedeImprimir` sigue leyendo `truncado` sin cambios.

- [ ] **Step 3: Reemplazar el texto del aviso**

Buscá el bloque del JSX que hoy empieza con `{fuenteTruncada && (` y reemplazalo entero por:

```tsx
      {corte && (
        <Aviso>
          El período trae más registros de los que la pantalla puede leer de una: {corte.detalle}.{' '}
          {corte.consejo} Con el informe cortado los totales saldrían mal y no se pueden imprimir.
        </Aviso>
      )}
```

El `consejo` ya viene terminado en punto, así que la última oración arranca en mayúscula y el texto
cierra bien.

- [ ] **Step 4: Verificar que no quedó ninguna referencia a la variable vieja**

Run: `grep -n "fuenteTruncada" src/views/pharma/reportes/ReportesView.tsx`
Expected: **sin resultados** (código de salida 1). Si aparece alguna, quedó una referencia sin migrar.

- [ ] **Step 5: Correr el gate entero**

Run: `npm run build`
Expected: verde, **925 tests**. Si `tsc` se queja de que `formatNumberAR` ya no se usa, **no lo
borres sin mirar**: lo usan varios bloques más del archivo.

- [ ] **Step 6: Commit**

```bash
git add src/views/pharma/reportes/ReportesView.tsx
git commit -m "fix(reportes): rechazados y vencidos entran al techo de filas

Las dos consultas nunca participaron del calculo que bloquea la impresion --en
main ya era solo items || recepciones-- y sus numeros se imprimen en la hoja del
resumen, en la propia y en el informe completo. Un techo alcanzado ahi salia como
numero corto en una hoja firmada, sin aviso.

La escalera de tres ternarios, que ademas nombraba solo la primera que corto, se
reemplaza por las cinco candidatas y una llamada a truncamiento().

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Verificación en el navegador y PR

**Files:** ninguno, salvo que la verificación encuentre algo.

**Esta tarea la hace el controlador, no un subagente:** necesita la sesión logueada del preview.

- [ ] **Step 1: Levantar el preview y llegar a Estadísticas**

El preview usa el **5250** (`.claude/launch.json`); el 5173 suele ser del Director. La pantalla pide
**≥1024px** de ancho: si no, muestra el estado "El informe necesita más ancho". Llegá **clickeando**
(Farmacia → Estadísticas), no pegando la URL.

Gotchas: `preview_screenshot` se cuelga — verificá por snapshot/eval. Renderiza lento: esperá 4-5 s
después de navegar. Para clickear, `element.click()` desde `javascript_tool`.

- [ ] **Step 2: Comprobar que el camino feliz no cambió**

Con datos reales ninguna consulta llega a 5.000, así que **el aviso no tiene que aparecer** y la
impresión tiene que seguir habilitada. Es el caso que más importa: esta tanda no puede haber
bloqueado nada que antes se imprimía.

Verificá que no hay `Aviso` de truncamiento en la pantalla y que los botones de imprimir siguen
habilitados.

- [ ] **Step 3: Ver el aviso dibujado, sin fabricar datos**

No hay volumen real para truncar, y **no se fabrican filas**: la base es de producción. La regla ya
está cubierta por los 9 tests; lo que falta ver es que el aviso **se dibuje bien y que la impresión
quede bloqueada**.

Para eso, bajá `TECHO_FILAS` a `1` en `src/data/pharma/reports.ts`, mirá la pantalla, y **revertí el
cambio** — `git diff` tiene que quedar vacío antes de commitear nada. Con el techo en 1 tienen que
verse las tres cosas:

1. El aviso nombrando **varias** consultas, con sus números y la conjunción bien puesta.
2. El consejo correspondiente al caso (con las cinco cortadas cae en la rama mixta: pide los dos
   controles).
3. **Los botones de imprimir deshabilitados**, incluido el de "Imprimir informe completo".

Probá además con **un protocolo elegido**: ahí las salidas ambulatorias salen del recorte y el
conjunto de fuentes cortadas cambia, así que el consejo tiene que cambiar con él.

- [ ] **Step 4: Abrir la PR**

No hay `gh` en esta máquina: API REST de GitHub con `git credential fill` + script Node. No podés
self-mergear — creás la PR y el Director mergea. El cuerpo dice: qué número podía salir mal, la
asimetría de los controles, las tres decisiones del spec, y la evidencia de la verificación.

Terminá el cuerpo con:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 5: Cerrar la entrada de `TODOS.md`**

La entrada `## Estadísticas de Farmacia · el techo de filas no cubre dos consultas que SÍ se imprimen`
queda cerrada: marcala como hecha con la fecha y la PR, igual que se hizo con la de dispensación
ambulatoria. **Ojo:** la otra entrada nueva (`dos remates finos del bloque de salidas ambulatorias`)
menciona en su punto 2 que `fuenteTruncada` nombra sólo la primera consulta — **eso también queda
resuelto por esta tanda**, así que sacá ese punto y dejá el 1, que sigue abierto.

---

## Lo que este plan NO hace, a propósito

- **No toca `TECHO_FILAS`.** El número no está en discusión.
- **No declara por hoja qué consulta usa** (D1 del spec): el portón sigue siendo único, con su costo
  aceptado — un `vencidos` truncado bloquea el reporte de dispensaciones, que no lo usa.
- **No toca `invariantes()`** ni la línea de consistencia: son otra cosa (que los agregados cierren
  entre sí) y no tienen relación con el techo.
- **No toca la base.** Sin migración, sin SQL.
