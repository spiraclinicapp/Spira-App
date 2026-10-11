# Pistas propias — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:executing-plans (o subagent-driven-development).
> Los pasos usan checkboxes (`- [ ]`).

**Objetivo:** que todos los `title` de ayuda de la app se dibujen con la pista de papel de Spira en
vez del globo negro del navegador, sin tocar los ~180 sitios que los usan.

**Arquitectura:** un componente `<Pistas />` montado una vez en la raíz (`App.tsx`) escucha
`pointerover/out`, `focusin/out`, `pointerdown`, `keydown`, `scroll` y `resize` en `document`. Saca el
`title` del elemento mientras está apuntado (para que no salga el nativo) y dibuja una sola pista
portaleada a `body`. Las reglas que pueden fallar en silencio (qué forma toma, dónde se ubica, la
demora, el `aria-describedby`) viven en `pistas.ts` como funciones puras con tests.

**Stack:** React 18 + TypeScript strict, CSS en `tokens.css`, vitest (entorno node, sin DOM).

**Spec:** [`docs/superpowers/specs/2026-10-09-tooltip-propio-design.md`](../specs/2026-10-09-tooltip-propio-design.md) ·
**Mock:** [`docs/mock-tooltip-propio.html`](../../mock-tooltip-propio.html) (aprobado: propuesta A, papel — Director, 2026-10-09).

## Restricciones globales

- Aspecto A (papel): fondo `--spira-white`, borde `1px solid --spira-line-2`, radio 10 (8 en rótulo), Inter 12,5/1,4, ancho máx. 280 px.
- Tiempos: `DEMORA_MS = 450`, `TIBIA_MS = 400`, gracia `GRACIA_MS` (140) de `useHoverIntent`.
- Posición: abajo y centrada, hueco 6 px, flip arriba si no entra, margen 8 px contra la ventana.
- Excluidos siempre: `<iframe>` y `[data-pista="nativa"]`.
- Comentarios y nombres en castellano rioplatense, con el porqué. Sin dependencias nuevas.
- Montaje: en `App.tsx`, **afuera** de `Gate`, para que cubra también el Login. (El spec decía
  `AppShell`; la raíz es mejor por ese motivo y no cambia nada más.)

## Foco de la revisión

1. **El elemento apuntado se desmonta** (una fila que se va al cambiar de día): la pista no puede quedar flotando. Se cierra en el siguiente `pointerover` sin objetivo. Lo cubre la Tarea 3 (QA).
2. **Título con salto de línea o URL larga** («Abrir Medidata… — https://…»): no desborda los 280 px (`overflow-wrap: anywhere`, `pre-line`). Tarea 2 (CSS) + QA.
3. **Esc con un modal abierto**: cierra solo la pista; el segundo Esc cierra el modal. Tarea 3.
4. **Pista adentro de un menú abierto**: apuntar una opción con `title` no cierra el menú. Tarea 3.
5. **Botón deshabilitado**: el «por qué no» aparece (R1 del spec). Tarea 3; si Edge no avisa, `data-pista="nativa"` en esos sitios.

---

### Tarea 1: reglas puras (`pistas.ts`)

**Archivos:**
- Crear: `src/components/pistas.ts`
- Test: `src/components/pistas.test.ts`

**Interfaces que produce:**
- `type FormaPista = 'termino' | 'rotulo' | 'frase'`
- `formaDePista(d: { texto: string; esTermino: boolean; textoVisible: string; cortado: boolean }): FormaPista | null`
- `esRotulo(texto: string): boolean`
- `ubicarPista(el: {top; bottom; left; width}, pista: {width; height}, ventana: {width; height}): { top: number; left: number }`
- `demoraDeApertura(ahora: number, ultimoCierre: number, hayAbierta: boolean): number`
- `sumarId(actual: string | null, id: string): string` · `quitarId(actual: string | null, id: string): string | null`
- constantes `DEMORA_MS`, `TIBIA_MS`, `ID_PISTA`

- [ ] **Paso 1: tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { DEMORA_MS, demoraDeApertura, esRotulo, formaDePista, quitarId, sumarId, ubicarPista } from './pistas'

const base = { texto: '', esTermino: false, textoVisible: '', cortado: false }

describe('formaDePista', () => {
  it('un término del glosario va con título, aunque la definición sea corta', () => {
    expect(formaDePista({ ...base, texto: 'Qué porcentaje…', esTermino: true, textoVisible: 'Adherencia' })).toBe('termino')
  })
  it('el nombre que repite el texto visible sólo se explica si está cortado', () => {
    const nombre = { ...base, texto: 'Juan Pérez', textoVisible: 'Juan Pérez' }
    expect(formaDePista(nombre)).toBeNull()
    expect(formaDePista({ ...nombre, cortado: true })).toBe('rotulo')
  })
  it('compara sin espacios de más (el JSX deja saltos alrededor del texto)', () => {
    expect(formaDePista({ ...base, texto: 'Juan Pérez', textoVisible: '\n  Juan Pérez  ' })).toBeNull()
  })
  it('un rótulo corto de ícono es rótulo; una oración es frase', () => {
    expect(formaDePista({ ...base, texto: 'Cerrar (Esc)' })).toBe('rotulo')
    expect(formaDePista({ ...base, texto: 'La fecha real cayó fuera de la ventana del cronograma' })).toBe('frase')
  })
  it('sin texto no hay pista', () => {
    expect(formaDePista({ ...base, texto: '   ' })).toBeNull()
  })
})

describe('esRotulo', () => {
  it('acepta el atajo entre paréntesis', () => {
    expect(esRotulo('Visita anterior (↑)')).toBe(true)
  })
  it('rechaza lo que tiene puntuación de oración, saltos o es largo', () => {
    expect(esRotulo('Fuera de ventana. La ventana es el rango…')).toBe(false)
    expect(esRotulo('Commit 1a2b3c4\nBuild de producción')).toBe(false)
    expect(esRotulo('Abrir el portal del sponsor en una pestaña nueva')).toBe(false)
  })
})

describe('ubicarPista', () => {
  const ventana = { width: 1000, height: 800 }
  it('abajo y centrada, a 6 px', () => {
    expect(ubicarPista({ top: 100, bottom: 120, left: 400, width: 40 }, { width: 100, height: 30 }, ventana))
      .toEqual({ top: 126, left: 370 })
  })
  it('arriba si abajo no entra', () => {
    expect(ubicarPista({ top: 760, bottom: 780, left: 400, width: 40 }, { width: 100, height: 30 }, ventana).top).toBe(724)
  })
  it('se queda abajo si tampoco entra arriba (no se sale por el techo)', () => {
    expect(ubicarPista({ top: 10, bottom: 790, left: 400, width: 40 }, { width: 100, height: 30 }, ventana).top).toBe(796)
  })
  it('nunca a menos de 8 px de los bordes', () => {
    expect(ubicarPista({ top: 100, bottom: 120, left: 0, width: 20 }, { width: 280, height: 30 }, ventana).left).toBe(8)
    expect(ubicarPista({ top: 100, bottom: 120, left: 990, width: 10 }, { width: 280, height: 30 }, ventana).left).toBe(712)
  })
})

describe('demoraDeApertura', () => {
  it('la primera pista espera; la que sigue a otra recién cerrada sale ya', () => {
    expect(demoraDeApertura(10_000, -Infinity, false)).toBe(DEMORA_MS)
    expect(demoraDeApertura(10_000, 9_800, false)).toBe(0)
    expect(demoraDeApertura(10_000, 9_000, false)).toBe(DEMORA_MS)
    expect(demoraDeApertura(10_000, -Infinity, true)).toBe(0)
  })
})

describe('sumarId / quitarId', () => {
  it('suma sin pisar lo que había y lo devuelve como estaba', () => {
    expect(sumarId(null, 'p')).toBe('p')
    expect(sumarId('ayuda', 'p')).toBe('ayuda p')
    expect(sumarId('ayuda p', 'p')).toBe('ayuda p')
    expect(quitarId('ayuda p', 'p')).toBe('ayuda')
    expect(quitarId('p', 'p')).toBeNull()
  })
})
```

- [ ] **Paso 2:** `npx vitest run src/components/pistas.test.ts` → falla (no existe el módulo).
- [ ] **Paso 3: implementación** (`src/components/pistas.ts`)

```ts
export type FormaPista = 'termino' | 'rotulo' | 'frase'
export const DEMORA_MS = 450
export const TIBIA_MS = 400
export const ID_PISTA = 'spira-pista'
const HUECO = 6
const MARGEN = 8

export function esRotulo(texto: string): boolean {
  const t = texto.trim()
  if (t.length > 32 || t.includes('\n')) return false
  return !/[.:;]/.test(t.replace(/\([^)]*\)/g, ''))
}

export function formaDePista(d: { texto: string; esTermino: boolean; textoVisible: string; cortado: boolean }): FormaPista | null {
  const texto = d.texto.trim()
  if (!texto) return null
  if (d.esTermino) return 'termino'
  if (texto === d.textoVisible.trim()) return d.cortado ? 'rotulo' : null
  return esRotulo(texto) ? 'rotulo' : 'frase'
}

export function ubicarPista(
  el: { top: number; bottom: number; left: number; width: number },
  pista: { width: number; height: number },
  ventana: { width: number; height: number },
): { top: number; left: number } {
  const abajo = el.bottom + HUECO
  const arriba = el.top - HUECO - pista.height
  const top = abajo + pista.height > ventana.height - MARGEN && arriba >= MARGEN ? arriba : abajo
  const centrada = el.left + el.width / 2 - pista.width / 2
  const left = Math.max(MARGEN, Math.min(centrada, ventana.width - MARGEN - pista.width))
  return { top, left }
}

export function demoraDeApertura(ahora: number, ultimoCierre: number, hayAbierta: boolean): number {
  return hayAbierta || ahora - ultimoCierre < TIBIA_MS ? 0 : DEMORA_MS
}

export function sumarId(actual: string | null, id: string): string {
  const ids = (actual ?? '').split(/\s+/).filter(Boolean)
  return ids.includes(id) ? ids.join(' ') : [...ids, id].join(' ')
}

export function quitarId(actual: string | null, id: string): string | null {
  const ids = (actual ?? '').split(/\s+/).filter((x) => x && x !== id)
  return ids.length ? ids.join(' ') : null
}
```

(con comentarios de cabecera en el tono de la casa: el porqué de cada regla.)

- [ ] **Paso 4:** `npx vitest run src/components/pistas.test.ts` → pasa.
- [ ] **Paso 5:** commit `feat(pistas): reglas puras de forma, ubicación y demora`.

### Tarea 2: el componente, el CSS y el montaje

**Archivos:**
- Crear: `src/components/Pistas.tsx`
- Modificar: `src/styles/tokens.css` (después del bloque del InfoTip), `src/App.tsx`,
  comentarios de cabecera de `src/components/Termino.tsx` e `InfoTip.tsx`.

**Consume:** todo lo de la Tarea 1 y `GRACIA_MS` de `./useHoverIntent`.
**Produce:** `export function Pistas(): ReactPortal | null`, sin props.

- [ ] **Paso 1: CSS** — en `tokens.css`, a continuación de `.spira-infotip`:

```css
.spira-pista {
  position: fixed; top: 0; left: 0; z-index: var(--spira-z-popover);
  width: max-content; max-width: 280px;
  background: var(--spira-white); color: var(--spira-ink);
  border: 1px solid var(--spira-line-2); border-radius: 10px;
  box-shadow: 0 8px 22px rgba(20, 48, 46, .14);
  padding: 7px 11px 8px;
  font: 400 12.5px/1.4 var(--spira-font-text);
  text-align: left; white-space: pre-line; overflow-wrap: anywhere;
}
.spira-pista[data-forma='rotulo'] { padding: 4px 9px 5px; font-weight: 600; border-radius: 8px; }
.spira-pista[data-forma='termino'] { padding: 9px 12px 10px; }
.spira-pista-titulo { display: block; font-size: 13px; font-weight: 700; letter-spacing: -0.01em; margin-bottom: 2px; }
.spira-pista-cuerpo { display: block; color: var(--spira-muted); }
@media (prefers-reduced-motion: no-preference) {
  .spira-pista { animation: spInfoTipIn 0.12s cubic-bezier(0.2, 0.8, 0.3, 1) both; }
}
```

- [ ] **Paso 2: `Pistas.tsx`** — estado de React solo para lo que se dibuja (`{ el, forma, texto, titulo }`);
  la máquina (dueño, pendiente, timers, último cierre) en un `useRef`; los listeners en un único
  `useEffect([])`. Reglas:
  - `objetivo(n)`: `n.closest('[title], [data-pista-texto]')`, descartando `IFRAME`, `[data-pista="nativa"]` y lo que esté adentro del panel.
  - `pointerover` (no touch): adentro del panel → cancela el cierre. Sin objetivo → si hay pista, `cerrarConGracia`. Mismo dueño → cancela el cierre. Si no: restaura el pendiente anterior, guarda el `title` (`data-pista-texto`), y agenda `mostrar` con `demoraDeApertura`.
  - `pointerout` (no touch): del panel hacia afuera (y no al dueño) → `cerrarConGracia`. Del objetivo hacia adentro suyo o al panel → nada. Si no: cancela la apertura; si era el dueño `cerrarConGracia`, si no restaura.
  - `focusin`: si el objetivo ES el elemento enfocado y `:focus-visible` → `mostrar` ya. `focusout` del dueño → `cerrar`.
  - `pointerdown` (captura): en el panel → nada. Touch sobre `.spira-termino` que no esté adentro de `button, a, [role="button"]` → alterna. Cualquier otro → `cerrar` (sin cortar la propagación).
  - `keydown` (captura en `document`): Esc con pista abierta → `stopPropagation()` + `cerrar`.
  - `scroll` (captura en `window`), `resize`, `blur` de la ventana → `cerrar`.
  - `mostrar(el)`: arma la forma con `formaDePista` (`cortado = scrollWidth > clientWidth + 1`), suma `ID_PISTA` al `aria-describedby`. `cerrar()`: lo quita, restaura el `title` **solo si no hay uno** (R2), marca el último cierre.
  - Ubicación: `useLayoutEffect` sobre la pista abierta → mide el panel y escribe `top/left` en su `style` antes del pintado.
  - Al desmontar: limpia timers, restaura el `title` del dueño y del pendiente.
- [ ] **Paso 3: montaje** — en `App.tsx`, `<Pistas />` al lado de `<Gate />`, adentro de `AuthProvider`.
- [ ] **Paso 4: comentarios** — `Termino.tsx` (la frase de los «167 usos»: ahora la pista la dibuja `Pistas`) e `InfoTip.tsx` (el globito del navegador ya no es lo que se ve).
- [ ] **Paso 5:** `npm run build` verde. Commit `feat(pistas): la pista de papel reemplaza al globo del navegador`.

### Tarea 3: QA en el navegador con un banco temporal

**Archivos (temporales, se borran antes del commit):** `harness-pistas.html`, `src/__harness__/pistas.tsx`.

- [ ] **Paso 1:** banco con las piezas reales: `<Pistas />`, `Termino` dentro de una fila-botón (como los KPI), íconos con `title`, un botón deshabilitado con motivo, dos nombres (cortado y entero), un título con URL larga y uno con salto de línea, un `Modal` real con su «Cerrar», y un `ActionMenu` abierto con una opción con `title`.
- [ ] **Paso 2:** Vite propio del worktree en el **5251** y Edge headless con `playwright-core` (hover real, documento visible). Verificar los cinco puntos del «Foco de la revisión» + teclado (Tab muestra, clic no) + tema oscuro, con capturas.
- [ ] **Paso 3:** si R1 falla, `data-pista="nativa"` en los sitios del «por qué no» (`PanelSustitucion`, `ArmarPedido`, `Resumen`, `ProcedureEditModal`, `MenuAcciones`, `AccionesDeCuenta`, `VisitDispensationPanel`).
- [ ] **Paso 4:** borrar el banco, `npm run build` verde, commit de lo que haya cambiado y PR.
