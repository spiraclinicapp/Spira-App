# El nombre del paciente lleva a su ficha · Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usá `superpowers:subagent-driven-development` (recomendada)
> o `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Spec:** [`../specs/2026-08-24-link-ficha-paciente-design.md`](../specs/2026-08-24-link-ficha-paciente-design.md)
**Mock:** [`../../mock-flecha-paciente.html`](../../mock-flecha-paciente.html)

**Goal:** Que el nombre y el IVRS del paciente abran su ficha en las quince pantallas donde
aparecen, con una flecha ↗ que aparece al apuntar.

**Architecture:** Un primitivo (`PatientLink`) + un hook (`useAbrirFicha`) + una clase CSS
(`.spira-link-arrow`), consumidos por cada vista. La navegación reusa la maquinaria que ya existe:
`onNavigate(module.key, 'protocolos', { patientId, protocolId }, back)`. Se suma `protocolId` al
`NavTarget` para que la ficha abra bajo el protocolo de la fila de la que saliste.

**Tech Stack:** React 18 + TypeScript strict, Vite, CSS con variables (sin Tailwind), Lucide vía
`components/Icon.tsx`, vitest.

## Global Constraints

- **Sin migraciones.** Lo único que toca datos es agregar `id` a dos embeds de un `select`.
- **La flecha nunca se pinta de petróleo.** Va en `--spira-muted` y solo cambia su opacidad. El
  color es para significado clínico (regla del Director, 2026-08-06).
- **El realce va en CSS, no en `onMouseEnter`.** Y donde el borde vaya inline, en longhands.
- **Sin `onOpen`, `PatientLink` devuelve el texto pelado** — sin caja ni foco de teclado. Un botón
  que no hace nada es peor que no tener botón.
- **La flecha va afuera del span con `text-overflow: ellipsis`**, como hermana con `flex: 0 0 auto`.
- **Copy de UI en castellano rioplatense.** Comentarios densos y explicativos (el porqué, no el qué).
- **Verificación:** `npm run build` verde (`tsc --noEmit && vitest run && vite build`).
- **Rama:** `feat/link-a-la-ficha-del-paciente`. Stagear **por ruta**, nunca `git add -A`.

## La regla de colocación de la flecha

Una sola por par de links, **al final del par**:

| Situación | Aire | Dónde |
|---|---|---|
| El par está **apilado** en un bloque propio de identidad | `gap: 16px` | Al costado del bloque, centrada vertical |
| El par **comparte renglón** con otros datos | `margin-left: 8px` | Justo después del segundo link |
| El par **no es contiguo** (nombre y código en líneas distintas, con otros datos en el medio) | `margin-left: 8px` | Después del **segundo** link del par, sea cual sea |

El `.spira-link-group` va en el ancestro común más chico que contenga a los dos links y a la flecha.

---

## Task 1: Cimientos — ícono, CSS, `PatientLink`, y el modal estrena la flecha

**Files:**
- Modify: `src/components/Icon.tsx` (mapa `ICONS`)
- Modify: `src/styles/tokens.css` (después de `.spira-link-group`, ~línea 645)
- Create: `src/components/PatientLink.tsx`
- Modify: `src/views/track/VisitHeader.tsx:100-115` y borrar el `PatientLink` local (~185-197)

**Interfaces:**
- Produces: `PatientLink({ onOpen?: () => void, label: string, children: ReactNode })` y
  `PatientLinkArrow({ size?: number })` desde `src/components/PatientLink.tsx`.
- Produces: clase CSS `.spira-link-arrow`.
- Produces: `IconName` gana el valor `'arrowUpRight'`.

- [ ] **Step 1: Agregar el ícono**

En `src/components/Icon.tsx`, dentro del objeto `ICONS`, justo después de la línea de
`externalLink`:

```tsx
  /* Salto a otra pantalla DENTRO de Spira (el nombre del paciente → su ficha). NO es
     `externalLink`, que dibuja el marco de "se abre en otra pestaña" y acá mentiría: no se sale
     de la app. Dos trazos y nada más — es una marca de 12px que acompaña texto, no un ícono de
     botón. */
  arrowUpRight: (<><path d="M7 7h10v10" /><path d="M7 17 17 7" /></>),
```

- [ ] **Step 2: Agregar la clase CSS**

En `src/styles/tokens.css`, inmediatamente después del bloque `.spira-link-group:has(...)`:

```css
/* —— La flecha del texto que navega ——
   Marca de destino para el par nombre + Nº de sujeto. Aparece SOLO al apuntar o al enfocar por
   teclado: en una lista de veinte alertas, una flecha permanente por renglón son cuarenta marcas
   compitiendo con la señal que esa pantalla sí tiene que dar (el color de la severidad).

   No cambia de color al aparecer, solo de opacidad: pintar el hover rompe la regla de la casa —el
   color dice significado clínico, el realce dice elevación—. Y `pointer-events: none` porque
   apuntar la flecha no puede contar como apuntar el link: sin eso queda un blanco que se subraya
   pero no se puede clickear.

   El hueco lo reserva el `gap`/`margin` de quien la usa, presente desde el primer render, así que
   al aparecer no corre nada. Donde `:has()` no exista, la flecha simplemente nunca aparece y el
   subrayado sigue funcionando — misma degradación que ya declara `.spira-link-group`. */
.spira-link-arrow {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  color: var(--spira-muted);
  opacity: 0;
  pointer-events: none;
  /* Para los contenedores que NO son flex: varias filas alinean su identidad con un div de
     texto corrido que ya lleva su propio ellipsis (`identityLine` de la cola del medico y de
     las atendidas), y volverlos flex les romperia ese truncado. Con `vertical-align` la flecha
     se para bien en los dos casos: dentro de un flex manda el `align-items` del padre, dentro
     de texto manda esto. */
  vertical-align: middle;
  transition: opacity 0.14s var(--spira-ease-out);
}
.spira-link-group:has(.spira-textlink:hover) .spira-link-arrow,
.spira-link-group:has(.spira-textlink:focus-visible) .spira-link-arrow {
  opacity: 0.75;
}
@media (prefers-reduced-motion: reduce) {
  .spira-link-arrow { transition: none; }
}
```

- [ ] **Step 3: Crear el componente**

`src/components/PatientLink.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * Un dato del paciente que además abre su ficha.
 *
 * Nació local en `VisitHeader` (encabezado de la visita) y se extrajo cuando el gesto se llevó a
 * las quince pantallas que muestran nombre + Nº de sujeto.
 *
 * SIN `onOpen` DEVUELVE EL TEXTO PELADO, sin caja ni foco de teclado: un botón que no hace nada es
 * peor que no tener botón. De eso se apoyan los casos donde no hay a dónde ir — un paciente sin
 * `patient_id` en las filas de Estadísticas, una farmacéutica sin el módulo desde la campana.
 *
 * El estilo vive en `.spira-textlink` (tokens.css): hereda tipografía y color, y solo se subraya al
 * apuntarlo o enfocarlo, para que el nombre siga leyéndose como el nombre. `.spira-no-press` lo pone
 * ESTE componente y no quien lo usa: es un `<button>`, así que sin esa marca hereda la
 * micro-interacción global y el texto se levanta 1px al pasarle el mouse — bien para un botón, un
 * salto para un nombre en medio de un bloque de identidad.
 */
export function PatientLink({ onOpen, label, children }: {
  onOpen?: () => void
  label: string
  children: ReactNode
}) {
  if (!onOpen) return <>{children}</>
  return (
    <button
      type="button"
      className="spira-textlink spira-no-press"
      onClick={(e) => { e.stopPropagation(); onOpen() }}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  )
}

/**
 * La marca de destino del par. UNA sola por paciente, no una por dato: el destino no es "el nombre"
 * ni "el número", es el paciente, que son los dos juntos.
 *
 * `aria-hidden` porque es decoración: lo que se va a abrir ya lo dicen el `aria-label` y el `title`
 * de los links. Va SIEMPRE afuera del span que se trunca —el nombre lleva `text-overflow: ellipsis`
 * en todas las listas y adentro se cortaría antes que el nombre—, y el hueco lo reserva el
 * `gap`/`margin` de quien la coloca, para que al aparecer no corra nada.
 */
export function PatientLinkArrow({ size = 12 }: { size?: number }) {
  return (
    <span className="spira-link-arrow" aria-hidden="true">
      <Icon name="arrowUpRight" size={size} stroke={2.4} />
    </span>
  )
}
```

- [ ] **Step 4: El modal de visita usa el compartido y estrena la flecha**

En `src/views/track/VisitHeader.tsx`:

1. Agregar el import: `import { PatientLink, PatientLinkArrow } from '../../components/PatientLink'`
2. **Borrar** la función `PatientLink` local (el bloque con su comentario, ~líneas 178-197).
3. Reemplazar el bloque `<div className="spira-link-group">` por:

```tsx
          {/* Nombre y Nº de sujeto abren la MISMA ficha, así que se resaltan juntos: apuntar
              cualquiera de los dos los subraya a los dos (`.spira-link-group`, tokens.css). Si cada
              uno se subrayara solo, se leerían como dos destinos distintos. Siguen siendo dos
              disparadores y no uno que los envuelva: así el resalte lo dispara el texto y no el
              aire alrededor, y cada dato conserva su caja.
              La flecha es UNA para el par y se para al costado del bloque, no colgando de una
              palabra: lo que se abre es el paciente, que son los dos datos juntos. 16px de aire
              porque a menos se lee como un tercer dato de la identidad (mock del 2026-08-24). */}
          <div className="spira-link-group" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={nm}>
                <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${visit.patient_name}`}>
                  {visit.patient_name}
                </PatientLink>
              </h2>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 5 }}>
                <b className="spira-mono" style={pid}>
                  {visit.patient_code
                    ? <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${visit.patient_code}`}>{visit.patient_code}</PatientLink>
                    : 'Sin IVRS'}
                </b>
              </div>
            </div>
            {onOpenPatient && <PatientLinkArrow size={16} />}
          </div>
```

- [ ] **Step 5: Verificar**

```bash
npm run build
```

Esperado: verde. En el preview (puerto 5250), abrir una visita desde Coordinación › Visitas:
apuntar el nombre subraya nombre **y** número y aparece la flecha a la derecha del bloque; nada se
corre al aparecer; con `Tab` la flecha también aparece.

- [ ] **Step 6: Commit**

```bash
git add src/components/Icon.tsx src/styles/tokens.css src/components/PatientLink.tsx src/views/track/VisitHeader.tsx
git commit -m "feat(ui): PatientLink compartido y la flecha de destino en el modal de visita"
```

---

## Task 2: `resolverFichaDestino` + `NavTarget.protocolId`

**Files:**
- Modify: `src/views/protocolsNav.ts` (agregar la función al final)
- Test: `src/views/protocolsNav.test.ts` (agregar el `describe`)
- Modify: `src/views/types.ts` (interface `NavTarget`)
- Modify: `src/views/ProtocolsView.tsx:163-177` (el `useEffect` del target)

**Interfaces:**
- Produces: `resolverFichaDestino(patient: PatientRow | undefined, protocolIdPedido?: string): Nav | null`
- Produces: `NavTarget.protocolId?: string`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `src/views/protocolsNav.test.ts`:

```ts
describe('resolverFichaDestino', () => {
  /**
   * POR QUÉ ESTE TEST Y NO OTRO: es lo único de esta feature que falla EN SILENCIO. Que un link no
   * navegue se ve mirando; que la ficha abra bajo el protocolo EQUIVOCADO no — la pantalla queda
   * impecable, con el nombre correcto, y el cronograma que muestra es el de otro ensayo.
   */
  const proto = (id: string, code: string) => ({ id, code, name: code })
  const paciente = (protocolIds: string[]): PatientRow => ({
    id: 'pac-1', code: 'ARG-04-017', full_name: 'Susana Rodriguez', status: 'activo',
    birth_date: null, sex: null, fertility: null, treating_physician: null,
    enrollments: protocolIds.map((pid, i) => ({
      id: `enr-${i}`, enrollment_date: '2026-01-01', randomization_date: null, protocol: proto(pid, `P${i}`),
    })),
  })

  it('con dos protocolos, gana el pedido y no el primero', () => {
    expect(resolverFichaDestino(paciente(['pa', 'pb']), 'pb'))
      .toEqual({ mode: 'patient', protocolId: 'pb', patientId: 'pac-1' })
  })

  it('si el protocolo pedido no es suyo, cae a la heurística en vez de abrir uno ajeno', () => {
    expect(resolverFichaDestino(paciente(['pa', 'pb']), 'pz'))
      .toEqual({ mode: 'patient', protocolId: 'pa', patientId: 'pac-1' })
  })

  it('sin protocolo pedido, la heurística queda intacta (el camino del buscador global)', () => {
    expect(resolverFichaDestino(paciente(['pa', 'pb'])))
      .toEqual({ mode: 'patient', protocolId: 'pa', patientId: 'pac-1' })
  })

  it('sin enrolamiento visible manda a Todos los pacientes, nunca a una ficha sin contexto', () => {
    const sinProtocolo: PatientRow = { ...paciente([]), enrollments: [
      { id: 'e', enrollment_date: '2026-01-01', randomization_date: null, protocol: null },
    ] }
    expect(resolverFichaDestino(sinProtocolo, 'pa')).toEqual({ mode: 'all' })
  })

  it('sin paciente no hay destino', () => {
    expect(resolverFichaDestino(undefined, 'pa')).toBeNull()
  })
})
```

Y al import del archivo agregar `resolverFichaDestino` y
`import type { PatientRow } from '../data/patients'`.

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run src/views/protocolsNav.test.ts
```

Esperado: FAIL — `resolverFichaDestino is not a function`.

- [ ] **Step 3: Implementar**

Al final de `src/views/protocolsNav.ts`:

```ts
/**
 * A qué posición de esta vista lleva "abrir la ficha del paciente X".
 *
 * La ficha necesita un protocolo de CONTEXTO —el cronograma, las visitas y la adherencia son del
 * enrolamiento, no de la persona—, y un paciente puede estar en varios. De ahí las dos entradas:
 *
 * - `protocolIdPedido` lo trae quien te mandó acá cuando lo sabe: las quince pantallas de nombre +
 *   IVRS muestran el protocolo en la MISMA fila que el nombre, así que no hay por qué adivinarlo.
 *   Sin esto, abrir la ficha desde una alerta de alguien enrolado en dos ensayos mostraba el
 *   cronograma del otro: la pantalla queda perfecta y el dato es de otro protocolo.
 * - Sin él —el buscador global, que resuelve una persona y no un enrolamiento— cae al enrolamiento
 *   primario, que es el mismo criterio que usa "Todos los pacientes".
 *
 * Un `protocolIdPedido` que el paciente NO tiene se ignora y cae a la heurística: abrir la ficha
 * bajo un protocolo ajeno sería peor que abrirla bajo el primario. Mismo criterio que
 * `resolveShortId` ante un empate — nunca se elige un destino al azar.
 */
export function resolverFichaDestino(
  patient: PatientRow | undefined,
  protocolIdPedido?: string,
): Nav | null {
  if (!patient) return null
  const propios = patient.enrollments.filter((e) => e.protocol != null)
  const pedido = protocolIdPedido
    ? propios.find((e) => e.protocol!.id === protocolIdPedido)
    : undefined
  const protocolId = (pedido ?? propios[0])?.protocol?.id ?? null
  /* Sin protocolo visible no hay ficha que abrir, pero al menos lo dejamos en "Todos los
     pacientes" —donde sí figura—, no en la grilla de protocolos, que sería desconcertante. */
  return protocolId ? { mode: 'patient', protocolId, patientId: patient.id } : { mode: 'all' }
}
```

Y arriba del archivo: `import type { PatientRow } from '../data/patients'`.

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run src/views/protocolsNav.test.ts
```

Esperado: PASS, 5 tests nuevos.

- [ ] **Step 5: Sumar `protocolId` al `NavTarget`**

En `src/views/types.ts`, dentro de `interface NavTarget`, después de `patientId`:

```ts
  /**
   * Protocolo bajo el cual abrir la ficha. Lo manda quien conoce el contexto —las pantallas que
   * muestran nombre + IVRS traen el protocolo en la misma fila—; el buscador global lo omite,
   * porque resuelve una persona y no un enrolamiento. Ver `resolverFichaDestino`.
   */
  protocolId?: string
```

- [ ] **Step 6: `ProtocolsView` consume la función**

Reemplazar el cuerpo del `useEffect` de `navTarget` (líneas ~163-177) por:

```tsx
  useEffect(() => {
    if (!navTarget?.patientId) return
    if (patients.loading || protocols.loading) return
    const pt = (patients.data ?? []).find((p) => p.id === navTarget.patientId)
    const destino = resolverFichaDestino(pt, navTarget.protocolId)
    if (destino) { setNav(destino, { resolviendoTarget: true }); llegada.current = navKey(destino) }
    onTargetConsumed?.()
  }, [navTarget, patients.loading, patients.data, protocols.loading, onTargetConsumed])
```

Conservar el comentario largo que está arriba del efecto (sigue vigente: explica por qué se espera
a los dos datasets y por qué se consume una sola vez). Agregar `resolverFichaDestino` al import de
`./protocolsNav`.

- [ ] **Step 7: Verificar y commitear**

```bash
npm run build
```

```bash
git add src/views/protocolsNav.ts src/views/protocolsNav.test.ts src/views/types.ts src/views/ProtocolsView.tsx
git commit -m "feat(nav): la ficha abre bajo el protocolo de contexto, no bajo el primero"
```

---

## Task 3: `useAbrirFicha`

**Files:**
- Create: `src/views/useAbrirFicha.ts`

**Interfaces:**
- Consumes: `NavTarget`, `ReturnTo`, `ViewProps` de `./types`; `ModuleDef` de `../modules/registry`.
- Produces: `useAbrirFicha({ module, onNavigate, volver }) => ((patientId: string, protocolId?: string) => void) | undefined`

- [ ] **Step 1: Crear el hook**

`src/views/useAbrirFicha.ts`:

```ts
import type { ModuleDef } from '../modules/registry'
import type { NavTarget, ReturnTo } from './types'

/**
 * Abrir la ficha de un paciente desde cualquier vista.
 *
 * VA AL MÓDULO EN EL QUE YA ESTÁS (`module.key`), nunca a `'track'` fijo. Los pacientes viven
 * dentro de Protocolos, y esa ruta existe en los DOS módulos operativos (`track/protocolos` y
 * `pharma/protocolos`, misma `ProtocolsView`), así que ir al propio módulo evita tener que
 * preguntar permisos: si estás viendo esta pantalla, ese módulo lo tenés. Con `'track'` fijo, una
 * farmacéutica sin el módulo Coordinación se comería un `navigate` descartado EN SILENCIO por
 * `isAllowed` — un link que no hace nada y no dice por qué.
 *
 * Devuelve `undefined` cuando la vista no recibió `onNavigate`, y con eso `PatientLink` cae solo a
 * texto pelado: no hay que acordarse de chequearlo en cada llamada.
 *
 * `volver` es una función y no un objeto porque el pasaje suele depender de la fila (el nombre del
 * paciente en el `hint`, la visita a reabrir en el `target`), y se resuelve recién al hacer clic.
 */
export function useAbrirFicha({ module, onNavigate, volver }: {
  module: ModuleDef
  onNavigate?: (moduleKey: string, subKey: string, target?: NavTarget, back?: ReturnTo) => void
  /** Pasaje de vuelta para ESTE clic. Omitilo y no hay botón de volver. */
  volver?: (patientId: string) => ReturnTo | undefined
}) {
  if (!onNavigate) return undefined
  return (patientId: string, protocolId?: string) => {
    onNavigate(module.key, 'protocolos', { patientId, protocolId }, volver?.(patientId))
  }
}
```

- [ ] **Step 2: Verificar que compila**

```bash
npm run typecheck
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/views/useAbrirFicha.ts
git commit -m "feat(nav): useAbrirFicha, que navega al modulo en el que ya estas"
```

---

## Task 4: Pacientes — la fila del protocolo

**Files:**
- Modify: `src/views/track/PdPatientRow.tsx:79-95`

**Interfaces:**
- Consumes: `PatientLink`, `PatientLinkArrow` (Task 1).

Hoy el nombre navega pero el IVRS es un `<span>` muerto. Se empareja con el resto de la app.

- [ ] **Step 1: Reemplazar el bloque de identidad**

Cambiar el `<div style={{ minWidth: 0 }}>` interno (el que contiene el `<button>` del nombre, el
IVRS y el médico) por:

```tsx
            {/* Nombre y IVRS abren los dos la ficha —el mismo par que el encabezado de la visita—,
                así que van en un `.spira-link-group` y comparten UNA flecha. La flecha va al final
                del par y no al costado del bloque: la fila es una rejilla de tres columnas
                (identidad · tracker · acciones) y al costado quedaría pegada al tracker, leyéndose
                como parte de él. */}
            <div className="spira-link-group" style={{ minWidth: 0 }}>
              <div style={{ maxWidth: '100%', fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <PatientLink onOpen={() => onOpen(patient.id)} label={`Abrir la ficha de ${patient.full_name}`}>
                  {patient.full_name}
                </PatientLink>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, marginTop: 2 }}>
                <span className="spira-mono" style={{ fontSize: 13, color: patient.code ? 'var(--spira-muted)' : 'var(--spira-faint)', whiteSpace: 'nowrap' }}>
                  {patient.code
                    ? <PatientLink onOpen={() => onOpen(patient.id)} label={`Abrir la ficha del sujeto ${patient.code}`}>{patient.code}</PatientLink>
                    : 'Sin IVRS'}
                </span>
                <PatientLinkArrow />
                {protocolCode && (
                  <span className="spira-mono" style={{ fontSize: 11.5, padding: '1px 8px', borderRadius: 'var(--spira-radius-pill)', background: accent + '14', color: accent, whiteSpace: 'nowrap', flex: '0 0 auto' }}>{protocolCode}</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{medico}</div>
            </div>
```

Agregar el import de `PatientLink`/`PatientLinkArrow` desde `'../../components/PatientLink'`.

> El `stopPropagation` ya no va acá: lo hace `PatientLink` por dentro. La fila sigue abriendo la
> ficha con su `onClick`, y el link llega al mismo lado — el `stopPropagation` evita que se
> disparen los dos.

Actualizar el comentario de cabecera del componente (líneas 12-19): donde dice "El nombre va además
como `.spira-textlink`", que diga que **el nombre y el IVRS** lo son.

- [ ] **Step 2: Verificar**

```bash
npm run build
```

En el preview, Coordinación › Pacientes › un protocolo: apuntar el nombre subraya los dos y
enciende la flecha; clic en el IVRS abre la ficha; `Tab` alcanza los dos.

- [ ] **Step 3: Commit**

```bash
git add src/views/track/PdPatientRow.tsx
git commit -m "feat(pacientes): el IVRS de la fila tambien abre la ficha, con la flecha del par"
```

---

## Task 5: Alertas de Coordinación

**Files:**
- Modify: `src/views/TrackAlertsView.tsx` (las dos listas: ~228-265 y ~266-310)

**Interfaces:**
- Consumes: `PatientLink`, `PatientLinkArrow` (Task 1), `useAbrirFicha` (Task 3).

Las dos tarjetas son hoy `<button className="spira-card-link">` y hay que convertirlas: un
`<button>` no puede contener otro.

- [ ] **Step 1: Cablear el hook**

Dentro del componente, después de los otros hooks:

```tsx
  /* La vuelta reabre la alerta: esta vista SÍ consume `navTarget` (`useUrlEntity`), así que
     prometerlo es honesto — a diferencia de la cola del médico, que no lo consume y solo ofrece
     volver a la pantalla. */
  const abrirFicha = useAbrirFicha({
    module,
    onNavigate,
    volver: () => ({ moduleKey: module.key, subKey: submodule.key, label: 'Volver a Alertas', hint: 'Volver a la lista de alertas' }),
  })
```

Y agregar `module`, `submodule`, `onNavigate` a la desestructuración de `ViewProps` si no están.

- [ ] **Step 2: Convertir la tarjeta de reportes**

Cambiar el `<button type="button" className="spira-card-link" onClick={() => setOpenVisitId(r.visit_id)} ...>`
por:

```tsx
                <div
                  role="button"
                  tabIndex={0}
                  className="spira-card-link"
                  onClick={() => setOpenVisitId(r.visit_id)}
                  onKeyDown={(e) => {
                    // Solo si el evento nació en la tarjeta misma: sin esta guarda, Enter sobre el
                    // link del nombre abre la ficha Y la visita.
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenVisitId(r.visit_id) }
                  }}
                  aria-label={`Abrir la visita de ${r.patient_name} — reporte de procedimiento pendiente`}
                  style={alertItemStyle(c, { conBotonDescartar: true })}
                >
```

Y su cierre `</button>` por `</div>`.

- [ ] **Step 3: Los links en la tarjeta de reportes**

Reemplazar la línea del nombre y la del código por:

```tsx
                    <div className="spira-link-group" style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                        <PatientLink onOpen={abrirFicha && (() => abrirFicha(r.patient_id, r.protocol_id))} label={`Abrir la ficha de ${r.patient_name}`}>
                          {r.patient_name}
                        </PatientLink>
                      </span>
                      <span style={code}>
                        {r.patient_code
                          ? <PatientLink onOpen={abrirFicha && (() => abrirFicha(r.patient_id, r.protocol_id))} label={`Abrir la ficha del sujeto ${r.patient_code}`}>{r.patient_code}</PatientLink>
                          : '—'}
                      </span>
                      <PatientLinkArrow />
                      <span style={{ color: 'var(--spira-faint)', fontWeight: 400 }}>· <span style={code}>{r.protocol_code}</span></span>
                    </div>
```

- [ ] **Step 4: Repetir en la tarjeta de visitas**

Mismo cambio de contenedor, con `setOpenVisitId(a.id)` y
`aria-label={`Abrir la visita de ${a.patient_name} — ${VISIT_STATES[a.computed_status].label}`}`:

```tsx
                <div
                  role="button"
                  tabIndex={0}
                  className="spira-card-link"
                  onClick={() => setOpenVisitId(a.id)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenVisitId(a.id) }
                  }}
                  aria-label={`Abrir la visita de ${a.patient_name} — ${VISIT_STATES[a.computed_status].label}`}
                  style={alertItemStyle(c, { conBotonDescartar: true })}
                >
```

Y el bloque de identidad, con `a` en vez de `r`:

```tsx
                    <div className="spira-link-group" style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                        <PatientLink onOpen={abrirFicha && (() => abrirFicha(a.patient_id, a.protocol_id))} label={`Abrir la ficha de ${a.patient_name}`}>
                          {a.patient_name}
                        </PatientLink>
                      </span>
                      <span style={code}>
                        {a.patient_code
                          ? <PatientLink onOpen={abrirFicha && (() => abrirFicha(a.patient_id, a.protocol_id))} label={`Abrir la ficha del sujeto ${a.patient_code}`}>{a.patient_code}</PatientLink>
                          : '—'}
                      </span>
                      <PatientLinkArrow />
                      <span style={{ color: 'var(--spira-faint)', fontWeight: 400 }}>· <span style={code}>{a.protocol_code}</span></span>
                    </div>
```

- [ ] **Step 5: Verificar**

```bash
npm run build
```

En el preview, Coordinación › Alertas, con al menos una alerta:
- La tarjeta sigue elevándose al hover igual que antes (la clase no cambió, y la
  micro-interacción global ya matchea `[role='button']`).
- Clic en el nombre → ficha. Clic en cualquier otro lado de la tarjeta → visita.
- `Tab` hasta la tarjeta + `Enter` → visita. `Tab` hasta el nombre + `Enter` → ficha, **y la
  visita no se abre**.
- El botón de descartar sigue funcionando.

- [ ] **Step 6: Commit**

```bash
git add src/views/TrackAlertsView.tsx
git commit -m "feat(alertas): el nombre y el IVRS abren la ficha del paciente"
```

---

## Task 6: Resumen de Coordinación

**Files:**
- Modify: `src/views/VisitSummaryRow.tsx:56-90`
- Modify: `src/views/TrackResumenView.tsx:110-125` (pasar el prop) y `:151-172` (panel de alertas)

**Interfaces:**
- Consumes: `PatientLink`, `PatientLinkArrow`, `useAbrirFicha`.
- Produces: `VisitSummaryRow` gana el prop `onOpenPatient?: () => void`.

- [ ] **Step 1: `VisitSummaryRow` — nuevo prop y conversión del contenedor**

Agregar a la firma:

```tsx
  /** Abrir la ficha del paciente. Sin esto, nombre e IVRS quedan como texto (ver `PatientLink`). */
  onOpenPatient?: () => void
```

Cambiar el `<button type="button" className="spira-row-link spira-no-press" ...>` por:

```tsx
    <div
      role="button"
      tabIndex={0}
      className="spira-row-link spira-no-press"
      onClick={onClick}
      onKeyDown={(e) => {
        // La guarda de siempre: sin ella, Enter sobre el nombre abre la ficha Y la visita.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
      }}
      aria-label={ariaLabel}
      style={fila}
    >
```

y su cierre por `</div>`.

- [ ] **Step 2: `VisitSummaryRow` — el par y la flecha**

El nombre está en la línea 1 y el IVRS en la línea 2, así que el `.spira-link-group` va en el
`<div style={{ flex: 1, minWidth: 0 }}>` que las contiene, y la flecha va **después del segundo
link del par** (el IVRS), que es donde el par termina:

```tsx
      <div className="spira-link-group" style={{ flex: 1, minWidth: 0 }}>
        {/* línea 1 — el paciente es el titular */}
        <div style={linea1}>
          {visit.visit_type === 'telefonica' && (
            <Icon name="phone" size={13} color="var(--spira-faint)" style={{ flex: '0 0 auto' }} />
          )}
          <span style={nombre}>
            <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${visit.patient_name}`}>
              {visit.patient_name}
            </PatientLink>
          </span>
        </div>

        {/* línea 2 — de qué visita hablamos. Envuelve en vez de recortar: un IVRS cortado a la
            mitad parece completo y no lo es, y es el número que el paciente dice por teléfono. */}
        <div style={linea2}>
          <ProtoTag code={visit.protocol_code} protocolId={visit.protocol_id} />
          {visit.patient_code && (
            <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
              <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${visit.patient_code}`}>
                {visit.patient_code}
              </PatientLink>
            </span>
          )}
          <PatientLinkArrow />
          {codigo && <span style={pastillaVisita}>{codigo}</span>}
```

(el resto de la línea 2 y la línea 3 quedan igual; solo cambia el cierre del `</div>` exterior, que
ahora cierra el `.spira-link-group`).

- [ ] **Step 3: `TrackResumenView` — cablear el hook y pasar el prop**

```tsx
  const abrirFicha = useAbrirFicha({
    module,
    onNavigate,
    volver: () => ({ moduleKey: module.key, subKey: submodule.key, label: 'Volver al resumen', hint: 'Volver al resumen de Coordinación' }),
  })
```

y en el `<VisitSummaryRow ... />`, agregar:

```tsx
                      onOpenPatient={abrirFicha && (() => abrirFicha(v.patient_id, v.protocol_id))}
```

- [ ] **Step 4: `TrackResumenView` — el panel de alertas**

Convertir el `<button ... className="spira-card-link" onClick={() => onNavigate?.('track', 'alertas', { visitId: a.id })}>`:

```tsx
                  <div
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    className="spira-card-link"
                    onClick={() => onNavigate?.('track', 'alertas', { visitId: a.id })}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate?.('track', 'alertas', { visitId: a.id }) }
                    }}
                    aria-label={`Abrir en Alertas la visita de ${a.patient_name} — ${VISIT_STATES[a.computed_status].label}`}
                    style={alertItemStyle(c)}
                  >
```

y su bloque de identidad:

```tsx
                      <div className="spira-link-group" style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                          <PatientLink onOpen={abrirFicha && (() => abrirFicha(a.patient_id, a.protocol_id))} label={`Abrir la ficha de ${a.patient_name}`}>
                            {a.patient_name}
                          </PatientLink>
                        </span>
                        <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', fontWeight: 400 }}>
                          <PatientLink onOpen={abrirFicha && (() => abrirFicha(a.patient_id, a.protocol_id))} label={`Abrir la ficha del sujeto ${a.patient_code}`}>
                            {a.patient_code}
                          </PatientLink>
                        </span>
                        <PatientLinkArrow />
                        <span style={{ color: 'var(--spira-faint)', fontWeight: 400 }}>· <span className="spira-mono" style={{ fontSize: 12.5 }}>{a.protocol_code}</span></span>
                      </div>
```

Cerrar con `</div>` en vez de `</button>`.

- [ ] **Step 5: Verificar y commitear**

```bash
npm run build
```

En el preview, Coordinación › Resumen: las filas de próximas visitas siguen **resaltándose sin
levantarse** (`.spira-row-link` + `.spira-no-press`, sin cambios), y las tarjetas de alerta siguen
elevándose.

```bash
git add src/views/VisitSummaryRow.tsx src/views/TrackResumenView.tsx
git commit -m "feat(resumen): el paciente de las proximas visitas y de las alertas abre su ficha"
```

---

## Task 7: Visitas del día

**Files:**
- Modify: `src/views/track/DayVisitRowItem.tsx:103-116` (+ el prop nuevo)
- Modify: `src/views/track/AttendedRow.tsx:26-38` (+ el prop nuevo)
- Modify: `src/views/DayVisitsView.tsx` (pasar el prop a las dos)

**Interfaces:**
- Produces: `DayVisitRowItem` y `AttendedRow` ganan `onOpenPatient?: () => void`.

El contenedor de `DayVisitRowItem` **ya es** `<div role="button">` con la guarda correcta, y
`AttendedRow` es un `<div>` inerte: no hay conversión que hacer en ninguna de las dos.

- [ ] **Step 1: `DayVisitRowItem` — el par y la flecha**

Agregar el prop `onOpenPatient?: () => void` a la firma, y envolver el bloque central:

```tsx
      {/* bloque central */}
      <div className="spira-link-group" style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--spira-ink)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${visit.patient_name}`}>
            {visit.patient_name}
          </PatientLink>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <ProtoTag code={visit.protocol_code} protocolId={visit.protocol_id} />
          <span className="spira-mono" style={{ fontSize: 12.5, color: visit.patient_code ? 'var(--spira-muted)' : 'var(--spira-faint)' }}>
            {visit.patient_code
              ? <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${visit.patient_code}`}>{visit.patient_code}</PatientLink>
              : 'Sin IVRS'}
          </span>
          <PatientLinkArrow />
```

(el resto de esa línea —el chip de la visita y `visitName`— queda igual).

- [ ] **Step 2: `AttendedRow` — separar el nombre del motivo**

Hoy el nombre va concatenado: `{visit.patient_name}{visit.doctor_motivo ? ` · ${visit.doctor_motivo}` : ''}`.
Hay que separarlo para que solo el nombre sea link. Agregar el prop `onOpenPatient?: () => void` y
reemplazar el bloque:

```tsx
      <div className="spira-link-group" style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="spira-mono" style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>
            {visit.patient_code
              ? <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${visit.patient_code}`}>{visit.patient_code}</PatientLink>
              : 'Sin IVRS'}
          </span>
          <span className="spira-mono" style={{ ...protocolPill, color: 'var(--spira-muted)' }}>
            {visit.protocol_code}
          </span>
        </div>
        <div style={identityLine}>
          <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${visit.patient_name}`}>
            {visit.patient_name}
          </PatientLink>
          <PatientLinkArrow />
          {visit.doctor_motivo ? ` · ${visit.doctor_motivo}` : ''}
        </div>
      </div>
```

> `identityLine` (AttendedRow.tsx:75) se deja EXACTAMENTE como está: texto corrido con su propio
> `text-overflow: ellipsis`. Volverlo flex le rompería ese truncado; la flecha se para sola por el
> `vertical-align` del Task 1. Y queda ANTES del motivo, así que si la línea no entra, lo que se
> corta es el motivo y no la marca de destino.

- [ ] **Step 3: `DayVisitsView` — cablear**

```tsx
  const abrirFicha = useAbrirFicha({
    module,
    onNavigate,
    volver: (patientId) => ({
      moduleKey: module.key,
      subKey: submodule.key,
      // Esta vista SÍ consume `navTarget`, así que la vuelta puede prometer el día que estabas
      // mirando. La visita concreta no: desde la LISTA no hay ninguna abierta.
      target: { visitDate: date },
      label: 'Volver a las visitas',
      hint: `Volver a las visitas del día`,
    }),
  })
```

y pasarlo a las dos filas:

```tsx
              onOpenPatient={abrirFicha && (() => abrirFicha(v.patient_id, v.protocol_id))}
```

- [ ] **Step 4: Verificar y commitear**

```bash
npm run build
```

En el preview, Coordinación › Visitas: `Enter` sobre la fila abre el modal; `Enter` sobre el
nombre abre la ficha y **no** el modal (la guarda ya estaba). Volver deja el día correcto.

```bash
git add src/views/track/DayVisitRowItem.tsx src/views/track/AttendedRow.tsx src/views/DayVisitsView.tsx
git commit -m "feat(visitas): el paciente de la fila y de las atendidas abre su ficha"
```

---

## Task 8: Para ver médico y Reportes pendientes

**Files:**
- Modify: `src/views/DoctorQueueView.tsx:253-270` (+ el prop en la tarjeta)
- Modify: `src/views/track/reportes/ReportCard.tsx:73-82` (+ el prop)
- Modify: `src/views/track/reportes/ReportesPendientesView.tsx` (pasar el prop)

Ninguno de los dos contenedores es un `<button>`: no hay conversión.

- [ ] **Step 1: `DoctorQueueView` — la tarjeta de la cola**

Acá el IVRS va **primero** (línea 1) y el nombre **después** (línea 2), así que la flecha va tras
el nombre, que es donde el par termina. Y hay que separar el nombre de los datos concatenados:

```tsx
      <div className="spira-link-group" style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="spira-mono" style={{ fontSize: 15, fontWeight: 700, color: visit.patient_code ? 'var(--spira-ink)' : 'var(--spira-faint)' }}>
            {visit.patient_code
              ? <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${visit.patient_code}`}>{visit.patient_code}</PatientLink>
              : 'Sin IVRS'}
          </span>
          <span className="spira-mono" style={{ ...protocolPill, background: accent + '16', color: accent }}>
            {visit.protocol_code}
          </span>
          {vcode && <span style={visitChip}>{vcode}</span>}
        </div>
        <div style={identityLine}>
          <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${visit.patient_name}`}>
            {visit.patient_name}
          </PatientLink>
          <PatientLinkArrow />
          {demographics ? ` · ${demographics}` : ''}
          {visit.treating_physician ? ` · ${visit.treating_physician}` : ''}
        </div>
```

Agregar `onOpenPatient?: () => void` a la firma de la tarjeta y cablear el hook en la vista:

```tsx
  const abrirFicha = useAbrirFicha({
    module,
    onNavigate,
    // Sin `target`: esta vista NO consume `navTarget`, así que prometer que reabre el modal sería
    // mentir (mismo criterio que el `onOpenPatient` del VisitDetail de acá abajo).
    volver: () => ({ moduleKey: module.key, subKey: submodule.key, label: 'Volver a la cola', hint: 'Volver a Para ver médico' }),
  })
```

- [ ] **Step 2: `ReportCard` — el par apilado**

Nombre e IVRS están apilados en un `<span style={{ flex: 1, minWidth: 0 }}>`: es un bloque propio
de identidad, así que la flecha va **al costado, con 16px** (la regla de colocación).

```tsx
          <div className="spira-link-group" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 3 }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--spira-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${row.patient_name}`}>
                    {row.patient_name}
                  </PatientLink>
                </span>
                <span className="spira-mono" style={{ display: 'block', fontSize: 11, color: 'var(--spira-muted)' }}>
                  {row.patient_code
                    ? <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${row.patient_code}`}>{row.patient_code}</PatientLink>
                    : '—'}
                </span>
              </span>
              <PatientLinkArrow />
            </span>
```

(el `<button>` de "ver la visita" y el cierre quedan igual).

Agregar `onOpenPatient?: () => void` a la firma de `ReportCard`, y en
`ReportesPendientesView.tsx` cablear el hook igual que en el paso 1 —
`label: 'Volver a Reportes'` — y pasarlo con `abrirFicha(row.patient_id, row.protocol_id)`.

- [ ] **Step 3: Verificar y commitear**

```bash
npm run build
```

```bash
git add src/views/DoctorQueueView.tsx src/views/track/reportes/ReportCard.tsx src/views/track/reportes/ReportesPendientesView.tsx
git commit -m "feat(cola y reportes): el paciente abre su ficha desde las dos pantallas"
```

---

## Task 9: Agenda

**Files:**
- Modify: `src/views/AgendaView.tsx:100-132`

La píldora es `<button>` **solo cuando la visita es reagendable** y `<div>` cuando no. Se unifica:
una píldora con dos anatomías según el estado es una trampa para el próximo que la toque.

- [ ] **Step 1: Unificar el contenedor**

Reemplazar el bloque `return movable ? (...) : (...)` por:

```tsx
                  return (
                    <div
                      key={v.id}
                      {...(movable ? {
                        role: 'button',
                        tabIndex: 0,
                        onClick: () => setMoving(v),
                        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
                          // La guarda de siempre: el nombre del paciente es un link adentro.
                          if (e.target !== e.currentTarget) return
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMoving(v) }
                        },
                        title: 'Reagendar visita',
                      } : null)}
                      style={{ ...cardStyle, ...(movable ? { cursor: 'pointer' } : null) }}
                    >
                      {inner}
                    </div>
                  )
```

Importar `KeyboardEvent` como tipo desde `react`. El `font: 'inherit'` y `color: 'inherit'` del
`<button>` viejo ya no hacen falta: un `<div>` los hereda solo.

- [ ] **Step 2: El par y la flecha en `inner`**

```tsx
                  const inner = (
                    <>
                      <div className="spira-link-group" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                          <PatientLink onOpen={abrirFicha && (() => abrirFicha(v.patient_id, v.protocol_id))} label={`Abrir la ficha de ${v.patient_name}`}>
                            {v.patient_name}
                          </PatientLink>
                        </span>
                        <span className="spira-mono" style={{ fontSize: 12, color: c, fontWeight: 500, flex: '0 0 auto' }}>
                          <PatientLink onOpen={abrirFicha && (() => abrirFicha(v.patient_id, v.protocol_id))} label={`Abrir la ficha del sujeto ${v.patient_code}`}>
                            {v.patient_code}
                          </PatientLink>
                        </span>
                        <PatientLinkArrow />
                        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4 }}>
                          {v.visit_type === 'telefonica' && <Icon name="phone" size={13} color="var(--spira-muted)" />}
                          {v.real_date !== null && <Icon name="check" size={14} color={c} />}
                        </span>
                      </div>
```

(la segunda línea del `inner` queda igual). Cablear `abrirFicha` con
`label: 'Volver a la agenda'`.

- [ ] **Step 3: Verificar y commitear**

```bash
npm run build
```

> La Agenda está fuera del menú (comentada en `modules/registry.ts`), así que para verla en el
> preview hay que entrar por la URL directa `/coordinacion/agenda`.

```bash
git add src/views/AgendaView.tsx
git commit -m "feat(agenda): el paciente de la pildora abre su ficha, con una sola anatomia"
```

---

## Task 10: Farmacia — la capa de datos

**Files:**
- Modify: `src/data/pharma/dispensations.ts:65-75` (los dos `CONTEXTO`) y la interface
  `DispensationRequestRow`

**Interfaces:**
- Produces: `r.enrollment.patient.id` y `r.protocol.id` disponibles en `DispensationRequestRow`.

- [ ] **Step 1: Agregar `id` a los embeds**

```ts
const CONTEXTO =
  'visit_code, ' +
  'enrollment:enrollments!enrollment_id(patient:patients(id, code, full_name)), ' +
  'protocol:protocols!protocol_id(id, code, name)'

const CONTEXTO_INNER =
  'visit_code, ' +
  'enrollment:enrollments!enrollment_id!inner(patient:patients!inner(id, code, full_name)), ' +
  'protocol:protocols!protocol_id!inner(id, code, name)'
```

Y en el comentario de arriba del bloque, agregar:

```
 * El `id` del paciente y del protocolo viajan para que el nombre de las tres pantallas de
 * Dispensaciones abra su ficha, y bajo el protocolo correcto. Agregar una COLUMNA a un embed no
 * toca FKs, así que no aplica el PGRST201 de la 0076: ese lo dispara una FK nueva sobre una tabla
 * ya embebida, no un `select` más ancho.
```

- [ ] **Step 2: Los tipos**

En la interface del paciente y del protocolo embebidos dentro de `DispensationRequestRow`, agregar
`id: string` a cada uno.

- [ ] **Step 3: Verificar y commitear**

```bash
npm run typecheck
```

```bash
git add src/data/pharma/dispensations.ts
git commit -m "feat(pharma): el id de paciente y protocolo viajan en el contexto de la solicitud"
```

---

## Task 11: Farmacia — las tres pantallas de Dispensaciones

**Files:**
- Modify: `src/views/pharma/dispensaciones/KanbanCard.tsx:60-80`
- Modify: `src/views/pharma/dispensaciones/DispensacionDrawer.tsx:152-160`
- Modify: `src/views/pharma/dispensaciones/HistorialPorDias.tsx:59-80`
- Modify: `src/views/pharma/DispensacionesView.tsx` (cablear el hook y pasar el prop)

**Interfaces:**
- Consumes: `r.enrollment.patient.id`, `r.protocol.id` (Task 10).

- [ ] **Step 1: `KanbanCard` — la guarda que falta**

Bug preexistente: sin ella, `Enter` sobre el botón de avanzar dispara la acción **y** abre el cajón.

```tsx
      onKeyDown={(e) => {
        // Solo si el evento nació en la tarjeta misma: sin esta guarda, Enter sobre un control
        // interno —el botón de avanzar, ahora también el link del paciente— dispara SU acción y
        // además abre el cajón.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() }
      }}
```

- [ ] **Step 2: `KanbanCard` — el par y la flecha**

```tsx
      {/* 1 · paciente + protocolo */}
      <div className="spira-link-group" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${r.enrollment?.patient?.full_name ?? 'el paciente'}`}>
            {r.enrollment?.patient?.full_name ?? '—'}
          </PatientLink>
        </span>
        <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', flex: '0 0 auto' }}>
          <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${r.enrollment?.patient?.code ?? ''}`}>
            {r.enrollment?.patient?.code ?? '—'}
          </PatientLink>
        </span>
        <PatientLinkArrow />
        <span className="spira-mono" style={protoChip}>{r.protocol?.code ?? '—'}</span>
      </div>
```

Agregar `onOpenPatient?: () => void` a la firma.

- [ ] **Step 3: `DispensacionDrawer` — el encabezado**

```tsx
              <div className="spira-link-group" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 5, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--spira-ink)', fontWeight: 600 }}>
                  <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${paciente?.full_name ?? 'el paciente'}`}>
                    {paciente?.full_name ?? '—'}
                  </PatientLink>
                </span>
                <span style={dot} />
                <span className="spira-mono">
                  <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${paciente?.code ?? ''}`}>
                    {paciente?.code ?? '—'}
                  </PatientLink>
                </span>
                <PatientLinkArrow />
                <span style={dot} />
                <span className="spira-mono">{protocolo?.code ?? '—'}</span>
```

(el resto del subtítulo queda igual). Agregar `onOpenPatient?: () => void` a la firma.

- [ ] **Step 4: `HistorialPorDias` — la fila**

El contenedor ya es `<div role="button">`, pero **le falta la guarda**: agregarla igual que en el
paso 1. Después, el par:

```tsx
        <div className="spira-link-group" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 15, fontWeight: 700, color: 'var(--spira-ink)' }}>
            {disp?.dispensation_code ?? 'Solicitud'}
          </span>
          <span style={{ fontSize: 13, color: 'var(--spira-ink)' }}>
            · <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${r.enrollment?.patient?.full_name ?? 'el paciente'}`}>
                {r.enrollment?.patient?.full_name ?? '—'}
              </PatientLink>
          </span>
          <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-muted)' }}>
            <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${r.enrollment?.patient?.code ?? ''}`}>
              {r.enrollment?.patient?.code ?? 'Sin IVRS'}
            </PatientLink>
          </span>
          <PatientLinkArrow />
          <span className="spira-mono" style={chipProto}>{r.protocol?.code ?? '—'}</span>
        </div>
```

- [ ] **Step 5: `DispensacionesView` — cablear las tres**

```tsx
  const abrirFicha = useAbrirFicha({
    module,
    onNavigate,
    volver: () => ({ moduleKey: module.key, subKey: submodule.key, label: 'Volver a Dispensaciones', hint: 'Volver al tablero de dispensaciones' }),
  })
```

y pasar a cada una, **cayendo a `undefined` cuando el embed vino en null** (RLS o dato incompleto),
que es lo que hace que el `PatientLink` degrade a texto:

```tsx
  const abrirPacienteDe = (r: DispensationRequestRow) => {
    const pid = r.enrollment?.patient?.id
    return abrirFicha && pid ? () => abrirFicha(pid, r.protocol?.id) : undefined
  }
```

- [ ] **Step 6: Verificar y commitear**

```bash
npm run build
```

En el preview, Farmacia › Dispensaciones: el nombre abre la ficha **sin salir de Farmacia** — la
miga tiene que decir Farmacia › Pacientes, no Coordinación. `Enter` sobre el nombre no abre el
cajón.

```bash
git add src/views/pharma/dispensaciones/KanbanCard.tsx src/views/pharma/dispensaciones/DispensacionDrawer.tsx src/views/pharma/dispensaciones/HistorialPorDias.tsx src/views/pharma/DispensacionesView.tsx
git commit -m "feat(dispensaciones): el paciente abre su ficha desde el tablero, el cajon y el historial"
```

---

## Task 12: Estadísticas y la campana

**Files:**
- Modify: `src/views/pharma/reportes/Tablas.tsx:151-160`
- Modify: `src/views/pharma/reportes/ReportesView.tsx` (cablear y pasar)
- Modify: `src/shell/NotificationsMenu.tsx:132-168`

- [ ] **Step 1: `Tablas` — la tabla de dispensaciones**

Las dos celdas del par son `<td>` separadas, así que el `.spira-link-group` va en el `<tr>`: los
únicos `.spira-textlink` de esa fila son esos dos. La flecha va en la celda del código, que cierra
el par.

```tsx
              <tr key={f.dispensationId} className={`${rowHover} spira-link-group`}>
                <td style={{ ...tdDense, fontVariantNumeric: 'tabular-nums' }}>{f.numero}</td>
                <td style={{ ...tdDense, fontVariantNumeric: 'tabular-nums' }}>{formatAR(f.fecha)}</td>
                <td style={{ ...tdDense, fontVariantNumeric: 'tabular-nums' }}>{formatTimeAR(f.deliveredAt)}</td>
                <td style={tdDense}>
                  {f.pacienteNombre
                    ? <PatientLink onOpen={onOpenPaciente?.(f)} label={`Abrir la ficha de ${f.pacienteNombre}`}>{f.pacienteNombre}</PatientLink>
                    : <span style={dash}>—</span>}
                </td>
                <td style={{ ...tdDense, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {f.pacienteCodigo
                      ? <PatientLink onOpen={onOpenPaciente?.(f)} label={`Abrir la ficha del sujeto ${f.pacienteCodigo}`}>{f.pacienteCodigo}</PatientLink>
                      : <span style={dash}>—</span>}
                    <PatientLinkArrow />
                  </span>
                </td>
```

Agregar a la firma de la tabla:

```tsx
  /** Cómo abrir la ficha del paciente de una fila. Devuelve `undefined` para las filas sólo-IP,
   *  que no tienen `patient_id`: ahí el nombre queda como texto (ver `PatientLink`). */
  onOpenPaciente?: (f: FilaDetalle) => (() => void) | undefined
```

En `ReportesView.tsx`, cablear con `label: 'Volver a Estadísticas'` y:

```tsx
        onOpenPaciente={(f) => (abrirFicha && f.pacienteId ? () => abrirFicha(f.pacienteId!, f.protocolId ?? undefined) : undefined)}
```

Los dos ids **todavía no existen** en la fila: `FilaDetalle` (`agregados.ts:230`) hoy solo lleva
`pacienteNombre`/`pacienteCodigo`/`protocolCode`. Agregarlos a la interface y al armado, que ya
recibe la fila cruda con los dos campos:

```ts
export interface FilaDetalle {
  dispensationId: string
  numero: number
  fecha: string
  deliveredAt: string
  /** Para abrir la ficha desde la tabla. Null en las filas de dispensación sólo-IP. */
  pacienteId: string | null
  pacienteNombre: string | null
  pacienteCodigo: string | null
  /** Protocolo de contexto de la ficha (ver `resolverFichaDestino`). */
  protocolId: string | null
  protocolCode: string | null
  visitaCodigo: string | null
  medicamentos: string
  unidades: number
  kits: number
}
```

y en el armado de `detalle()`, junto a los que ya están:

```ts
        pacienteId: it.patient_id,
        pacienteNombre: it.patient_name,
        pacienteCodigo: it.patient_code,
        protocolId: it.protocol_id,
        protocolCode: it.protocol_code,
```

- [ ] **Step 2: `NotificationsMenu` — las dos listas**

Las filas son `<div>` inertes: no hay contenedor que convertir. La campana navega a
`track/protocolos` (no hay `module` acá), **con guard**: sin el módulo, texto pelado.

```tsx
  const abrirFicha = (patientId: string, protocolId: string) =>
    (isAllowed('track')
      ? () => { setOpen(false); onNavigate('track', 'protocolos', { patientId, protocolId }) }
      : undefined)
```

> `setOpen(false)` antes de navegar: el popover queda flotando sobre la pantalla nueva si no.

Y en las dos listas, el bloque `rowTitle`:

```tsx
                        <div className="spira-link-group" style={rowTitle}>
                          <span style={{ fontSize: 12.5, color: 'var(--spira-ink)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                            <PatientLink onOpen={abrirFicha(r.patient_id, r.protocol_id)} label={`Abrir la ficha de ${r.patient_name}`}>
                              {r.patient_name}
                            </PatientLink>
                          </span>
                          <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', fontWeight: 600 }}>
                            {r.patient_code
                              ? <PatientLink onOpen={abrirFicha(r.patient_id, r.protocol_id)} label={`Abrir la ficha del sujeto ${r.patient_code}`}>{r.patient_code}</PatientLink>
                              : '—'}
                          </span>
                          <PatientLinkArrow />
                          <span style={{ color: 'var(--spira-faint)' }}>·</span>
                          <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', fontWeight: 600 }}>{r.protocol_code}</span>
                        </div>
```

Idéntico en la segunda lista, con `a` en vez de `r`.

> `rowTitle` (NotificationsMenu.tsx:222) YA es `display: flex` con `alignItems: center` y `gap: 7`:
> no hay que tocarlo.

- [ ] **Step 3: Verificar y commitear**

```bash
npm run build
```

```bash
git add src/views/pharma/reportes/Tablas.tsx src/views/pharma/reportes/ReportesView.tsx src/shell/NotificationsMenu.tsx
git commit -m "feat(estadisticas y campana): el paciente abre su ficha desde las dos"
```

---

## Verificación final

Con `npm run build` verde, recorrer el preview (puerto 5250) con la checklist del §11 del spec:

- [ ] La flecha aparece al apuntar y **nada se corre** al aparecer, en las quince pantallas.
- [ ] El nombre **y** el número navegan, y se subrayan juntos.
- [ ] `Tab` alcanza nombre, número y contenedor; `Enter` sobre el nombre abre la **ficha**,
      `Enter` sobre el contenedor abre la **visita** — nunca las dos.
- [ ] La ficha abre bajo el protocolo **de la fila de la que saliste** (probar con un paciente
      enrolado en dos).
- [ ] El chip de "Volver" dice a dónde vuelve, y vuelve ahí.
- [ ] Tema oscuro: la flecha se ve, y sigue sin ser petróleo.
- [ ] Desde Farmacia, la ficha abre **dentro de Farmacia** (mirar la miga).
- [ ] Con nombres largos: la flecha no se corta ni desaparece con el ellipsis.
