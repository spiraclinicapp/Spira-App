# URLs de navegación — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado)
> o `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Spec:** [`2026-08-23-urls-navegacion-design.md`](../specs/2026-08-23-urls-navegacion-design.md)

**Objetivo:** que la URL sea la fuente de verdad de dónde estás parado en Spira — módulo, submódulo,
entidad abierta, día, filtros y búsqueda — con back/forward del navegador y links compartibles.

**Arquitectura:** una capa propia sobre la History API, sin react-router. Toda la lógica vive en
funciones **puras** en `src/lib/router.ts` (parseo, serialización, codecs, mapas slug↔key); el hook
`useUrlState` de `src/lib/useUrlState.ts` es una cáscara fina que las conecta a React vía
`useSyncExternalStore`. El shell deriva `moduleKey`/`subKey` de la URL en vez de `useState`, y cada
vista cambia sus `useState` direccionables por `useUrlState`.

**Stack:** React 19, TypeScript strict, Vite 8, vitest 4. **Cero dependencias nuevas.**

## Restricciones globales

- **`npm run build` verde es el gate.** Corre `tsc --noEmit && vitest run && vite build`. Nada se da por
  hecho sin eso más verificación en el navegador.
- **vitest corre en entorno `node`.** No hay jsdom, ni happy-dom, ni testing-library, y **no se agregan**.
  Consecuencia de diseño, no accidente: todo lo que pueda fallar en silencio va en funciones puras de
  `router.ts`; `useUrlState.ts` no lleva lógica propia y por eso no necesita tests.
- **Qué se testea:** solo lo que falla en silencio (criterio de `CLAUDE.md` y del cabezal de
  `src/views/pharma/dispensaciones/estados.test.ts`). Un mapa slug↔key al revés no se ve mal en
  pantalla: te lleva a otro lado. Eso va con test. Lo visible se verifica mirando.
- **Las `key` internas no se tocan nunca.** `track`, `pharma`, `protocolos`, `medicamentos`, `reportes`
  cuelgan de un enum de Postgres, de la RLS y del `audit_log`. El slug es presentación.
- **Sin migraciones.** Ninguna tarea toca la base.
- **Idioma:** comentarios, nombres de dominio y copy en castellano rioplatense, con la densidad
  explicativa del código existente (el porqué, no el qué).
- **Estilo:** CSS con variables de `src/styles/tokens.css`, íconos Lucide vía `components/Icon.tsx`.
  El realce de estado es elevación, nunca borde de color.
- **Git:** rama por PR, **stagear siempre por ruta** (`git add <archivos>`, nunca `-A` ni `.`) — el
  working copy es compartido con el Director y suele tener cambios ajenos.
- **El nombre del paciente no va a la URL ni al `document.title`.** Nunca, en ninguna tarea.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/router.ts` *(nuevo)* | **Todo lo puro.** Mapas slug↔key, `parseUrl`, `buildUrl`, codecs, `readParam`, `writeParam`, `shortId`, `resolveShortId`. Único lugar del repo que arma o interpreta URLs. |
| `src/lib/router.test.ts` *(nuevo)* | Tests de lo anterior. |
| `src/lib/useUrlState.ts` *(nuevo)* | Cáscara React: `useUrlSnapshot`, `useUrlLocation`, `useUrlState`, `pushUrl`, `replaceUrl`. Sin lógica propia. |
| `src/shell/NotFoundView.tsx` *(nuevo)* | Pantalla serena de "no existe / sin acceso". |
| `src/lib/auth.tsx` *(modificar)* | Limpiar solo los parámetros de Supabase, no el query entero. |
| `src/shell/AppShell.tsx` *(modificar)* | `moduleKey`/`subKey` derivados de la URL; `selectModule`/`navigate` escriben la URL. |
| `src/views/*.tsx` *(modificar)* | Cada vista: `useState` → `useUrlState` según el §4.3 del spec. |

**Fases (una por PR).** El 1 y el 2 son el piso; el 3, 4 y 5 son independientes entre sí.

| Fase | PR | Tareas |
|---|---|---|
| A | 1 — Andamiaje | 1, 2, 3 |
| B | 2 — Shell | 4, 5, 6 |
| C | 3 — Pacientes | 7, 8 |
| D | 4 — Coordinación | 9, 10, 11 |
| E | 5 — Farmacia | 12, 13, 14, 15 |

---

# FASE A · PR 1 — Andamiaje

Rama: `feat/urls-andamiaje`. No se ve nada en pantalla al terminar. Es correcto.

---

### Task 1: `router.ts` — mapas, parseo y serialización

**Archivos:**
- Crear: `src/lib/router.ts`
- Test: `src/lib/router.test.ts`

**Interfaces:**
- Consume: `MODULES` de `src/modules/registry.ts` (para validar submódulos y resolver el default).
- Produce:
  - `interface UrlState { moduleKey: string; subKey: string; path: string[]; query: Record<string, string> }`
  - `parseUrl(pathname: string, search: string): UrlState | null` — `null` = ruta desconocida
  - `buildUrl(state: UrlState): string`
  - `moduleSlug(key: string): string` · `subSlug(moduleKey: string, subKey: string): string`

- [ ] **Paso 1: escribir el test que falla**

Crear `src/lib/router.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildUrl, parseUrl } from './router'

/**
 * El mapeo entre la URL y el estado de navegación.
 *
 * POR QUÉ ESTAS FUNCIONES Y NO OTRAS: son las que fallan EN SILENCIO. Si un slug queda mapeado a la
 * key equivocada, la pantalla no se ve mal — se ve perfecta, y es la pantalla de otra cosa. Nadie
 * agarra eso mirando. El resto (que el back del navegador ande, que un filtro se restaure) falla de
 * manera visible y se verifica en el navegador.
 *
 * Sin base y sin DOM: son funciones puras sobre dos strings.
 */

describe('parseUrl · módulo y submódulo', () => {
  it('la raíz es Inicio › Resumen', () => {
    expect(parseUrl('/', '')).toEqual({ moduleKey: 'inicio', subKey: 'resumen', path: [], query: {} })
  })

  it('traduce el slug visible a la key interna', () => {
    expect(parseUrl('/coordinacion/pacientes', '')).toMatchObject({ moduleKey: 'track', subKey: 'protocolos' })
    expect(parseUrl('/farmacia/stock', '')).toMatchObject({ moduleKey: 'pharma', subKey: 'medicamentos' })
    expect(parseUrl('/farmacia/estadisticas', '')).toMatchObject({ moduleKey: 'pharma', subKey: 'reportes' })
  })

  it('un módulo sin submódulo cae al primero del módulo', () => {
    expect(parseUrl('/coordinacion', '')).toMatchObject({ moduleKey: 'track', subKey: 'resumen' })
    expect(parseUrl('/farmacia', '')).toMatchObject({ moduleKey: 'pharma', subKey: 'protocolos' })
  })

  it('una ruta desconocida es null (no un redirect mudo)', () => {
    expect(parseUrl('/farmaceutica', '')).toBeNull()
    expect(parseUrl('/coordinacion/inventado', '')).toBeNull()
  })

  it('guarda los segmentos que siguen al submódulo', () => {
    expect(parseUrl('/coordinacion/pacientes/EFC18244/32000740001', '')).toMatchObject({
      moduleKey: 'track', subKey: 'protocolos', path: ['EFC18244', '32000740001'],
    })
  })

  it('lee el query', () => {
    expect(parseUrl('/coordinacion/visitas', '?dia=2026-08-22&estado=pendiente')).toMatchObject({
      query: { dia: '2026-08-22', estado: 'pendiente' },
    })
  })
})

describe('buildUrl', () => {
  it('emite el slug visible, no la key interna', () => {
    expect(buildUrl({ moduleKey: 'track', subKey: 'protocolos', path: [], query: {} }))
      .toBe('/coordinacion/pacientes')
    expect(buildUrl({ moduleKey: 'pharma', subKey: 'medicamentos', path: [], query: {} }))
      .toBe('/farmacia/stock')
  })

  it('Inicio › Resumen es la raíz', () => {
    expect(buildUrl({ moduleKey: 'inicio', subKey: 'resumen', path: [], query: {} })).toBe('/')
  })

  it('arma path y query', () => {
    expect(buildUrl({
      moduleKey: 'track', subKey: 'visitas', path: [], query: { dia: '2026-08-22' },
    })).toBe('/coordinacion/visitas?dia=2026-08-22')
  })

  it('ida y vuelta sobre las rutas del spec', () => {
    const rutas = [
      '/',
      '/coordinacion/pacientes',
      '/coordinacion/pacientes/todos',
      '/coordinacion/pacientes/EFC18244',
      '/coordinacion/pacientes/EFC18244/32000740001',
      '/coordinacion/visitas',
      '/coordinacion/para-ver-medico',
      '/coordinacion/alertas',
      '/coordinacion/agenda',
      '/farmacia/pacientes',
      '/farmacia/recepcion',
      '/farmacia/stock',
      '/farmacia/dispensaciones',
      '/farmacia/dispensaciones/D-0417',
      '/farmacia/estadisticas',
    ]
    for (const ruta of rutas) {
      const [pathname, search] = ruta.split('?')
      const estado = parseUrl(pathname, search ? `?${search}` : '')
      expect(estado, `no parseó ${ruta}`).not.toBeNull()
      expect(buildUrl(estado!), `no volvió a ${ruta}`).toBe(ruta)
    }
  })
})
```

- [ ] **Paso 2: correr el test y verificar que falla**

```bash
npx vitest run src/lib/router.test.ts
```

Esperado: FAIL — `Failed to resolve import "./router"`.

- [ ] **Paso 3: escribir `src/lib/router.ts`**

```ts
import { MODULES } from '../modules/registry'

/**
 * El mapeo entre la URL y el estado de navegación de Spira. TODO lo que interpreta o arma una URL
 * vive acá y es una función pura: es lo que permite testearlo sin DOM (vitest corre en entorno node)
 * y lo que hace que cambiar el vocabulario de las URLs sea tocar un archivo y no cazar strings por
 * todo el repo.
 *
 * SLUG ≠ KEY. En la URL van los nombres visibles en castellano (Coordinación, Farmacia, Pacientes,
 * Stock, Estadísticas); en el código y en la base siguen las keys de siempre (track, pharma,
 * protocolos, medicamentos, reportes), que cuelgan de un enum de Postgres, de la RLS y del audit_log
 * y por eso no se renombran. Este archivo es el único traductor entre los dos vocabularios.
 */

export interface UrlState {
  /** Key INTERNA del módulo ('track' | 'pharma' | 'inicio' | …), no el slug. */
  moduleKey: string
  /** Key INTERNA del submódulo ('protocolos' | 'medicamentos' | …). */
  subKey: string
  /** Segmentos que siguen al submódulo: ['EFC18244', '32000740001']. */
  path: string[]
  query: Record<string, string>
}

/* Módulo: key interna → slug visible. Lab y Contable todavía no existen como vista, pero tienen
   slug igual: la URL los reconoce y el guard de acceso los manda a la pantalla de §8 del spec. */
const MODULE_SLUG: Record<string, string> = {
  inicio: 'inicio',
  track: 'coordinacion',
  pharma: 'farmacia',
  lab: 'lab',
  contable: 'contable',
}

/* Submódulo: key interna → slug visible. Solo los tres que se renombraron en pantalla; el resto es
   identidad. No hay colisiones posibles porque el módulo ya desambigua (hay 'alertas' en Inicio y en
   Coordinación, y las dos son 'alertas'). */
const SUB_SLUG: Record<string, string> = {
  protocolos: 'pacientes',
  medicamentos: 'stock',
  reportes: 'estadisticas',
}

const MODULE_KEY: Record<string, string> = invertir(MODULE_SLUG)
const SUB_KEY: Record<string, string> = invertir(SUB_SLUG)

function invertir(mapa: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(mapa).map(([k, v]) => [v, k]))
}

export function moduleSlug(key: string): string {
  return MODULE_SLUG[key] ?? key
}

export function subSlug(_moduleKey: string, subKey: string): string {
  return SUB_SLUG[subKey] ?? subKey
}

/**
 * URL → estado de navegación. `null` = la ruta no existe; el shell muestra la pantalla de "esa
 * dirección no existe" en vez de un redirect mudo (si te mandaron un link roto, tenés que enterarte).
 */
export function parseUrl(pathname: string, search: string): UrlState | null {
  const query = Object.fromEntries(new URLSearchParams(search))
  const segmentos = pathname.split('/').filter(Boolean).map(decodeURIComponent)

  // La raíz es la home: Inicio › Resumen.
  if (segmentos.length === 0) return { moduleKey: 'inicio', subKey: 'resumen', path: [], query }

  const [slugModulo, slugSub, ...resto] = segmentos
  const moduleKey = MODULE_KEY[slugModulo]
  if (!moduleKey) return null

  const mod = MODULES.find((m) => m.key === moduleKey)
  if (!mod) return null

  // Módulo sin submódulo: cae al primero, igual que hace selectModule en el shell.
  if (!slugSub) return { moduleKey, subKey: mod.submodules[0].key, path: [], query }

  const subKey = SUB_KEY[slugSub] ?? slugSub
  if (!mod.submodules.some((s) => s.key === subKey)) return null

  return { moduleKey, subKey, path: resto, query }
}

/** Estado de navegación → URL. Es el ÚNICO lugar del repo que arma una URL de Spira. */
export function buildUrl(state: UrlState): string {
  const partes: string[] = []

  // Inicio › Resumen se escribe como la raíz, no como /inicio/resumen: es la home.
  const esHome = state.moduleKey === 'inicio' && state.subKey === 'resumen' && state.path.length === 0
  if (!esHome) {
    partes.push(moduleSlug(state.moduleKey))
    partes.push(subSlug(state.moduleKey, state.subKey))
    partes.push(...state.path)
  }

  const pathname = '/' + partes.map(encodeURIComponent).join('/')
  const query = new URLSearchParams(state.query).toString()
  return query ? `${pathname}?${query}` : pathname
}
```

- [ ] **Paso 4: correr el test y verificar que pasa**

```bash
npx vitest run src/lib/router.test.ts
```

Esperado: PASS, 10 tests.

- [ ] **Paso 5: commit**

```bash
git add src/lib/router.ts src/lib/router.test.ts
git commit -m "feat(router): parseo y serializacion de URLs (slug <-> key)"
```

---

### Task 2: `router.ts` — codecs e identificadores cortos

**Archivos:**
- Modificar: `src/lib/router.ts`
- Test: `src/lib/router.test.ts`

**Interfaces:**
- Produce:
  - `interface Codec<T> { parse(raw: string): T | null; format(value: T): string }`
  - `codecs: { str: Codec<string>; list: Codec<string[]>; num: Codec<number>; bool: Codec<boolean> }`
  - `oneOf<T extends string>(valores: readonly T[]): Codec<T>`
  - `readParam<T>(query, key, def: T, codec: Codec<T>): T`
  - `writeParam<T>(query, key, value: T, def: T, codec: Codec<T>): Record<string, string>`
  - `shortId(uuid: string): string` · `resolveShortId<T extends { id: string }>(filas: T[], token: string): T | null`

- [ ] **Paso 1: escribir el test que falla**

Agregar al final de `src/lib/router.test.ts`:

```ts
import { codecs, oneOf, readParam, resolveShortId, shortId, writeParam } from './router'

describe('codecs', () => {
  it('lista: coma como separador, sin vacíos', () => {
    expect(codecs.list.parse('a,b')).toEqual(['a', 'b'])
    expect(codecs.list.parse('')).toEqual([])
    expect(codecs.list.format(['a', 'b'])).toBe('a,b')
  })

  it('bool: 1/0, cualquier otra cosa es inválida', () => {
    expect(codecs.bool.parse('1')).toBe(true)
    expect(codecs.bool.parse('0')).toBe(false)
    expect(codecs.bool.parse('si')).toBeNull()
  })

  it('num: descarta lo que no es número', () => {
    expect(codecs.num.parse('7')).toBe(7)
    expect(codecs.num.parse('ayer')).toBeNull()
  })

  it('oneOf: solo acepta los valores del enum', () => {
    const c = oneOf(['tablero', 'historial'] as const)
    expect(c.parse('historial')).toBe('historial')
    expect(c.parse('inventado')).toBeNull()
  })
})

describe('readParam · un valor inválido cae al default, no rompe', () => {
  it('devuelve el default cuando el parámetro no está', () => {
    expect(readParam({}, 'dia', '2026-08-23', codecs.str)).toBe('2026-08-23')
  })

  it('devuelve el default cuando el valor es inválido', () => {
    expect(readParam({ agrupar: 'inventado' }, 'agrupar', 'operativo', oneOf(['operativo', 'estado'] as const)))
      .toBe('operativo')
  })

  it('devuelve el valor cuando es válido', () => {
    expect(readParam({ dia: '2026-08-22' }, 'dia', '2026-08-23', codecs.str)).toBe('2026-08-22')
  })
})

describe('writeParam · lo que está en su default no se escribe', () => {
  it('omite el valor por default', () => {
    expect(writeParam({}, 'dia', '2026-08-23', '2026-08-23', codecs.str)).toEqual({})
  })

  it('escribe el valor distinto del default', () => {
    expect(writeParam({}, 'dia', '2026-08-22', '2026-08-23', codecs.str)).toEqual({ dia: '2026-08-22' })
  })

  it('borra el parámetro al volver al default', () => {
    expect(writeParam({ dia: '2026-08-22' }, 'dia', '2026-08-23', '2026-08-23', codecs.str)).toEqual({})
  })

  it('una lista vacía es el default y no se escribe', () => {
    expect(writeParam({ estado: 'activo' }, 'estado', [], [], codecs.list)).toEqual({})
  })
})

describe('identificadores cortos', () => {
  const filas = [{ id: '8f3a2c1d-0000-4000-8000-000000000001' }, { id: 'a71c4e05-0000-4000-8000-000000000002' }]

  it('shortId son los primeros 8', () => {
    expect(shortId('8f3a2c1d-0000-4000-8000-000000000001')).toBe('8f3a2c1d')
  })

  it('resuelve por prefijo y por uuid completo', () => {
    expect(resolveShortId(filas, '8f3a2c1d')?.id).toBe(filas[0].id)
    expect(resolveShortId(filas, filas[1].id)?.id).toBe(filas[1].id)
  })

  it('con dos filas empatadas no devuelve ninguna', () => {
    const empate = [{ id: 'aaaaaaaa-0000-4000-8000-000000000001' }, { id: 'aaaaaaaa-0000-4000-8000-000000000002' }]
    expect(resolveShortId(empate, 'aaaaaaaa')).toBeNull()
  })

  it('sin coincidencias devuelve null', () => {
    expect(resolveShortId(filas, 'ffffffff')).toBeNull()
  })
})
```

- [ ] **Paso 2: correr el test y verificar que falla**

```bash
npx vitest run src/lib/router.test.ts
```

Esperado: FAIL — `codecs is not exported`.

- [ ] **Paso 3: agregar el código a `src/lib/router.ts`**

Agregar al final del archivo:

```ts
/* ─────────────────────────────────────────────────────────────────────────────
   CODECS — cómo va y vuelve cada tipo de valor en el query string.
   Puros y chiquitos a propósito: son lo que permite que useUrlState no tenga
   lógica propia y por lo tanto no necesite jsdom para testearse.
   ───────────────────────────────────────────────────────────────────────────── */

export interface Codec<T> {
  /** `null` = el valor crudo es inválido → quien llama cae al default. */
  parse(raw: string): T | null
  format(value: T): string
}

export const codecs = {
  str: {
    parse: (raw: string) => raw,
    format: (v: string) => v,
  } as Codec<string>,

  /* Multi-valor separado por coma: ?estado=pendiente,en-curso */
  list: {
    parse: (raw: string) => raw.split(',').filter(Boolean),
    format: (v: string[]) => v.join(','),
  } as Codec<string[]>,

  num: {
    parse: (raw: string) => (raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : null),
    format: (v: number) => String(v),
  } as Codec<number>,

  /* 1/0 y no true/false: más corto en la barra y sin ambigüedad de mayúsculas. */
  bool: {
    parse: (raw: string) => (raw === '1' ? true : raw === '0' ? false : null),
    format: (v: boolean) => (v ? '1' : '0'),
  } as Codec<boolean>,
}

/** Codec de enum: cualquier valor fuera de la lista es inválido y cae al default. */
export function oneOf<T extends string>(valores: readonly T[]): Codec<T> {
  return {
    parse: (raw: string) => (valores.includes(raw as T) ? (raw as T) : null),
    format: (v: T) => v,
  }
}

/**
 * Lee un parámetro. Un valor ausente, desconocido o inválido cae al default EN SILENCIO: una URL
 * vieja, mal tipeada o recortada por WhatsApp tiene que abrir la pantalla, no un error.
 */
export function readParam<T>(query: Record<string, string>, key: string, def: T, codec: Codec<T>): T {
  const crudo = query[key]
  if (crudo === undefined) return def
  const valor = codec.parse(crudo)
  return valor === null ? def : valor
}

/**
 * Escribe un parámetro sobre una copia del query. **Lo que está en su default no se escribe** — y si
 * vuelve al default, se borra. Es lo que mantiene `/coordinacion/visitas` dictable en vez de una tira
 * de veinte parámetros redundantes.
 */
export function writeParam<T>(
  query: Record<string, string>,
  key: string,
  value: T,
  def: T,
  codec: Codec<T>,
): Record<string, string> {
  const salida = { ...query }
  const esDefault = codec.format(value) === codec.format(def)
  if (esDefault) delete salida[key]
  else salida[key] = codec.format(value)
  return salida
}

/* ─────────────────────────────────────────────────────────────────────────────
   IDENTIFICADORES CORTOS — para lo que no tiene código legible.
   Los usa el paciente sin IVRS (nullable desde la 0021: se asigna en randomización) y la visita
   abierta (su visit_code es "V3" y se repite entre pacientes, así que no identifica).
   ───────────────────────────────────────────────────────────────────────────── */

/** Los primeros 8 caracteres del uuid. 4.300 millones de combinaciones sobre miles de filas. */
export function shortId(uuid: string): string {
  return uuid.slice(0, 8)
}

/**
 * Resuelve un token (prefijo corto o uuid completo) contra las filas ya cargadas.
 *
 * Si DOS filas empatan devuelve `null` y quien llama muestra "no se encontró". Nunca elige una: en
 * una ficha clínica, abrir la del paciente equivocado es peor que no abrir ninguna.
 */
export function resolveShortId<T extends { id: string }>(filas: T[], token: string): T | null {
  const candidatas = filas.filter((f) => f.id === token || f.id.startsWith(token))
  return candidatas.length === 1 ? candidatas[0] : null
}
```

- [ ] **Paso 4: correr los tests y verificar que pasan**

```bash
npx vitest run src/lib/router.test.ts
```

Esperado: PASS, 26 tests.

- [ ] **Paso 5: commit**

```bash
git add src/lib/router.ts src/lib/router.test.ts
git commit -m "feat(router): codecs, defaults omitidos e identificadores cortos"
```

---

### Task 3: `useUrlState` + la corrección de `auth.tsx`

Van juntas porque el bug de `auth.tsx` solo se manifiesta cuando existe algo en el query, y el hook es
lo que lo pone ahí. Separarlas dejaría un commit que rompe el flujo de recuperación de contraseña.

**Archivos:**
- Crear: `src/lib/useUrlState.ts`
- Modificar: `src/lib/auth.tsx:99-125`

**Interfaces:**
- Consume: `UrlState`, `parseUrl`, `buildUrl`, `readParam`, `writeParam`, `Codec`, `codecs` (Tasks 1-2).
- Produce:
  - `useUrlLocation(): UrlState | null`
  - `pushUrl(state: UrlState): void` · `replaceUrl(state: UrlState): void`
  - `useUrlState<T>(key: string, def: T, opts?: { codec?: Codec<T>; mode?: 'push' | 'replace' }): [T, (v: T) => void]`

- [ ] **Paso 1: crear `src/lib/useUrlState.ts`**

```ts
import { useCallback, useSyncExternalStore } from 'react'
import type { Codec, UrlState } from './router'
import { buildUrl, codecs, parseUrl, readParam, writeParam } from './router'

/**
 * La cáscara React de la capa de ruteo. **No lleva lógica propia**: todo lo que decide algo vive en
 * `router.ts` como función pura, que es lo que permite testearlo — vitest corre en entorno node, sin
 * jsdom, y no se agrega uno solo para esto.
 *
 * La URL es un store externo (la History API), así que se lee con useSyncExternalStore: React 19 se
 * encarga de que todos los consumidores vean el mismo valor en el mismo render.
 */

const suscriptores = new Set<() => void>()

function avisar() {
  suscriptores.forEach((fn) => fn())
}

function suscribir(fn: () => void): () => void {
  suscriptores.add(fn)
  return () => suscriptores.delete(fn)
}

/* popstate = el usuario tocó atrás/adelante. Nuestros propios push/replace avisan a mano, porque el
   navegador NO emite popstate cuando el cambio lo hace el script. */
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', avisar)
}

function snapshot(): string {
  if (typeof window === 'undefined') return '/'
  return window.location.pathname + window.location.search
}

/** La URL cruda como string. Sirve de clave de memo: cambia cuando cambia cualquier parte. */
export function useUrlSnapshot(): string {
  return useSyncExternalStore(suscribir, snapshot, () => '/')
}

/** El estado de navegación actual. `null` = la ruta no existe (el shell muestra la pantalla serena). */
export function useUrlLocation(): UrlState | null {
  const crudo = useUrlSnapshot()
  const [pathname, search] = crudo.split('?')
  return parseUrl(pathname, search ? `?${search}` : '')
}

/** Apila una entrada de historial: el "atrás" del navegador vuelve a la anterior. */
export function pushUrl(state: UrlState): void {
  window.history.pushState(null, '', buildUrl(state))
  avisar()
}

/** Reemplaza la entrada actual: no ensucia el historial (filtros, día, búsqueda). */
export function replaceUrl(state: UrlState): void {
  window.history.replaceState(null, '', buildUrl(state))
  avisar()
}

/**
 * Un campo de estado que vive en la URL. Misma firma que `useState`, para que adoptar una vista sea
 * sustitución línea por línea y el diff se lea.
 *
 * `mode` decide si el cambio apila historial. Por default REEMPLAZA: los filtros, la búsqueda y el
 * día no son navegación, y si apilaran, salir de Visitas del día después de un rato trabajando serían
 * quince "atrás". Se pasa 'push' para lo que sí es navegación (la entidad abierta).
 */
export function useUrlState<T>(
  key: string,
  def: T,
  opts: { codec?: Codec<T>; mode?: 'push' | 'replace' } = {},
): [T, (valor: T) => void] {
  const codec = (opts.codec ?? codecs.str) as Codec<T>
  const mode = opts.mode ?? 'replace'
  const crudo = useUrlSnapshot()

  const [pathname, search] = crudo.split('?')
  const estado = parseUrl(pathname, search ? `?${search}` : '')
  const valor = estado ? readParam(estado.query, key, def, codec) : def

  const setValor = useCallback(
    (nuevo: T) => {
      const [p, s] = (window.location.pathname + window.location.search).split('?')
      const actual = parseUrl(p, s ? `?${s}` : '')
      if (!actual) return
      const siguiente: UrlState = { ...actual, query: writeParam(actual.query, key, nuevo, def, codec) }
      if (mode === 'push') pushUrl(siguiente)
      else replaceUrl(siguiente)
    },
    // `def` y `codec` son estables en la práctica (literales del render); se omiten a propósito para
    // no recrear el setter en cada render y disparar efectos de las vistas que lo tienen en deps.
    [key, mode], // eslint-disable-line react-hooks/exhaustive-deps
  )

  return [valor, setValor]
}
```

- [ ] **Paso 2: corregir el limpiado de URL en `auth.tsx`**

En `src/lib/auth.tsx`, reemplazar la línea 125:

```ts
      // Limpiamos hash y query para que el aviso no reaparezca al recargar.
      window.history.replaceState(null, '', window.location.pathname)
```

por:

```ts
      // Limpiamos el hash y SOLO los parámetros de Supabase: desde que la navegación vive en la URL
      // (ver src/lib/router.ts), el query lleva el estado de la pantalla —el día, los filtros, la
      // entidad abierta— y borrarlo entero se lo llevaba puesto. Un error de auth no tiene por qué
      // devolverte a la pantalla sin filtrar.
      const limpio = new URLSearchParams(window.location.search)
      for (const p of ['error', 'error_code', 'error_description']) limpio.delete(p)
      const qs = limpio.toString()
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
```

- [ ] **Paso 3: verificar que compila y que la suite sigue verde**

```bash
npm run build
```

Esperado: `tsc --noEmit` sin errores, los 307 tests previos + los 26 nuevos en verde, build OK.

- [ ] **Paso 4: commit**

```bash
git add src/lib/useUrlState.ts src/lib/auth.tsx
git commit -m "feat(router): hook useUrlState y limpiado selectivo de la URL en auth"
```

- [ ] **Paso 5: abrir el PR 1**

Sin `gh` en esta máquina: API REST de GitHub con `git credential fill` + script Node (ver `CLAUDE.md`).
Título: `feat(router): andamiaje de URLs de navegación`. El PR no cambia nada visible; decirlo en el
cuerpo para que quien revise no busque el efecto en pantalla.

---

# FASE B · PR 2 — El shell

Rama: `feat/urls-shell` (apilada sobre `feat/urls-andamiaje` si el 1 no está mergeado; verificar con
`git merge-base` que la rama hija esté apuntando donde corresponde — GitHub NO reapunta una PR apilada
si la base no se borra al mergear).

Al terminar: `/coordinacion/visitas` funciona, F5 mantiene la pantalla, y el atrás camina entre
pantallas.

---

### Task 4: el shell deriva módulo y submódulo de la URL

**Archivos:**
- Modificar: `src/shell/AppShell.tsx:95-96` (los `useState`), `:150-175` (`selectModule` / `navigate`),
  `:395` (el `onClick` del panel de submódulos)

**Interfaces:**
- Consume: `useUrlLocation`, `pushUrl` (Task 3); `parseUrl`, `buildUrl` (Task 1).
- Produce: nada nuevo hacia afuera. **La firma de `navigate` y `selectModule` no cambia** — las ocho
  vistas, el `CommandPalette`, el `NotificationsMenu` y el `ReturnTo` las consumen y no se tocan.

- [ ] **Paso 1: reemplazar los `useState` de navegación**

En `src/shell/AppShell.tsx`, reemplazar:

```tsx
  const [moduleKey, setModuleKey] = useState('inicio')
  const [subKey, setSubKey] = useState('resumen')
```

por:

```tsx
  /* Dónde estás parado sale de la URL, no de un useState: es lo que hace que F5 te deje donde estabas
     y que un link lleve a cualquier pantalla. `null` = la ruta no existe → NotFoundView (Task 5). */
  const urlLocation = useUrlLocation()
  const moduleKey = urlLocation?.moduleKey ?? 'inicio'
  const subKey = urlLocation?.subKey ?? 'resumen'
```

Agregar el import:

```tsx
import { pushUrl, useUrlLocation } from '../lib/useUrlState'
```

- [ ] **Paso 2: `selectModule` escribe la URL**

Reemplazar el cuerpo de `selectModule`:

```tsx
  const selectModule = (key: string) => {
    const m = MODULES.find((x) => x.key === key)
    if (!m || !isAllowed(m.key)) return
    setSettingsSection(null) // navegar cierra Ajustes (era un overlay encima)
    setNavTarget(null) // navegación manual: sin objetivo pendiente
    setReturnTo(null)  // …ni camino de vuelta: te fuiste por tu cuenta
    /* La URL reemplaza a los dos useState de antes. Va con push: cambiar de módulo ES navegar, así
       que el atrás del navegador tiene que poder volver. */
    pushUrl({ moduleKey: key, subKey: m.submodules[0].key, path: [], query: {} })
  }
```

- [ ] **Paso 3: `navigate` escribe la URL**

Reemplazar las dos últimas líneas del cuerpo de `navigate`:

```tsx
    setModuleKey(mKey)
    setSubKey(sKey)
```

por:

```tsx
    pushUrl({ moduleKey: mKey, subKey: sKey, path: [], query: {} })
```

- [ ] **Paso 4: el panel de submódulos escribe la URL**

Reemplazar el `onClick` del botón de submódulo:

```tsx
                    onClick={() => { setSubKey(s.key); setSettingsSection(null); setNavTarget(null); setReturnTo(null) }}
```

por:

```tsx
                    onClick={() => {
                      setSettingsSection(null); setNavTarget(null); setReturnTo(null)
                      pushUrl({ moduleKey, subKey: s.key, path: [], query: {} })
                    }}
```

- [ ] **Paso 5: verificar en el navegador**

```bash
npm run build
```

Después, preview en el 5250 (`.claude/launch.json`; el 5173 suele ser del Director). Comprobar por
snapshot del DOM — **no por `preview_screenshot`, que se cuelga 30s en este entorno**:

- Entrar a Farmacia › Stock → la barra dice `/farmacia/stock`
- F5 → sigue en Stock, no vuelve a Inicio
- Atrás → vuelve al submódulo anterior
- Pegar `/coordinacion/para-ver-medico` → abre esa pantalla

- [ ] **Paso 6: commit**

```bash
git add src/shell/AppShell.tsx
git commit -m "feat(shell): modulo y submodulo salen de la URL"
```

---

### Task 5: pantalla de "no existe / sin acceso"

**Archivos:**
- Crear: `src/shell/NotFoundView.tsx`
- Modificar: `src/shell/AppShell.tsx` (el guard, arriba del render)

**Interfaces:**
- Consume: `useUrlLocation` (Task 3), `MODULES` (registry), `Icon`, `Vilano`.
- Produce: `NotFoundView({ motivo }: { motivo: 'ruta' | 'acceso' })`

- [ ] **Paso 1: crear `src/shell/NotFoundView.tsx`**

```tsx
import { Icon } from '../components/Icon'
import { Vilano } from '../components/Vilano'

/**
 * Pantalla serena para una URL que no lleva a ninguna parte.
 *
 * UN SOLO MENSAJE PARA "no existe" Y "no tenés acceso" a un recurso, a propósito: distinguirlos
 * convierte la URL en un oráculo — probando códigos de protocolo se averigua cuáles existen aunque la
 * RLS no los deje ver. Los MÓDULOS sí se distinguen (`motivo='acceso'`), porque el candado del riel
 * ya dice públicamente que ese módulo existe y no es tuyo: ahí ocultarlo no protege nada y confunde.
 */
export function NotFoundView({ motivo }: { motivo: 'ruta' | 'acceso' }) {
  const titulo = motivo === 'acceso' ? 'No tenés acceso a esta sección' : 'Esa dirección no existe'
  const detalle =
    motivo === 'acceso'
      ? 'Si creés que deberías poder verla, pedile acceso a quien coordina tu módulo.'
      : 'Puede que el link esté incompleto o que la pantalla haya cambiado de nombre.'

  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: '48px 24px' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ opacity: 0.5 }}><Vilano size={44} /></div>
        <div
          style={{
            fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 20,
            letterSpacing: '-0.02em', marginTop: 14, color: 'var(--spira-ink)',
          }}
        >
          {titulo}
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--spira-ink-soft)', marginTop: 7 }}>
          {detalle}
        </div>
        {/* Un <a> real y no un botón: es una dirección, y así se puede abrir en otra pestaña. */}
        <a
          href="/"
          className="spira-card-link"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 20, height: 38,
            padding: '0 15px', borderRadius: 10, border: '1px solid var(--spira-line-2)',
            background: 'var(--spira-white)', color: 'var(--spira-ink)',
            fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, textDecoration: 'none',
          }}
        >
          <Icon name="arrowLeft" size={15} color="var(--spira-ink)" /> Volver al inicio
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Paso 2: cablear el guard en `AppShell.tsx`**

Justo antes del `return` del componente, después de calcular `mod`/`sub`:

```tsx
  /* Guard de ruta. Va acá y no adentro del <main>: una URL que no existe no tiene módulo, así que el
     top bar y los rieles no tendrían qué mostrar. `urlLocation === null` es "la ruta no existe";
     `!isAllowed` cubre tanto el módulo sin rol como los `proximamente` (Lab, Contable). */
  const rutaInvalida = urlLocation === null
  const sinAcceso = !rutaInvalida && !isAllowed(moduleKey)
  if (rutaInvalida || sinAcceso) {
    return (
      <div style={{ height: '100%', background: 'var(--spira-paper)', color: 'var(--spira-ink)' }}>
        <NotFoundView motivo={rutaInvalida ? 'ruta' : 'acceso'} />
      </div>
    )
  }
```

Agregar el import:

```tsx
import { NotFoundView } from './NotFoundView'
```

- [ ] **Paso 3: verificar en el navegador**

```bash
npm run build
```

- `/farmaceutica` → "Esa dirección no existe"
- `/lab/muestras` → "No tenés acceso a esta sección" (Lab es `proximamente`)
- "Volver al inicio" lleva a `/`
- El tema oscuro no rompe el contraste (medir con `getComputedStyle`, no a ojo)

- [ ] **Paso 4: commit**

```bash
git add src/shell/NotFoundView.tsx src/shell/AppShell.tsx
git commit -m "feat(shell): pantalla serena para ruta inexistente o sin acceso"
```

---

### Task 6: título de pestaña sin PII + logout a la raíz

**Archivos:**
- Modificar: `src/shell/AppShell.tsx` (un `useEffect` nuevo), `src/shell/UserMenu.tsx:90`

**Interfaces:**
- Consume: `mod`, `sub` (ya calculados en el shell).

- [ ] **Paso 1: agregar el efecto**

Después del `useLayoutEffect` que limpia el encabezado:

```tsx
  /* Título de la pestaña. GENÉRICO a propósito: el título se filtra al historial y a la barra de
     tareas igual que la URL, así que dice la PANTALLA, nunca de quién. El nombre del paciente no sale
     de la vista. (Decisión heredada del spec de ruteo de junio, que sigue valiendo.) */
  useEffect(() => {
    document.title = moduleKey === 'inicio' ? 'Spira' : `Spira — ${sub.name}`
  }, [moduleKey, sub.name])
```

- [ ] **Paso 2: verificar**

```bash
npm run build
```

Abrir una ficha de paciente y confirmar en el navegador que el título dice `Spira — Pacientes` y **no**
el nombre de la persona.

- [ ] **Paso 3: el logout vuelve a la raíz**

En `src/shell/UserMenu.tsx:90`, reemplazar:

```tsx
  const onLogout = () => { close(); void signOut() }
```

por:

```tsx
  /* Cerrar sesión vuelve a la raíz, no te deja en la URL donde estabas. Es una máquina compartida de
     clínica: si el próximo que entra encuentra la barra con el protocolo y el IVRS del paciente que
     miraba el anterior, la sesión se cerró pero el dato quedó a la vista. F5, el atrás y los links sí
     mantienen el lugar — esto es solo el logout. */
  const onLogout = () => {
    close()
    window.history.replaceState(null, '', '/')
    void signOut()
  }
```

`replaceState` y no `pushUrl`: no queremos que el atrás del navegador vuelva a la URL de la sesión
recién cerrada.

- [ ] **Paso 4: verificar el recorrido de sesión completo**

```bash
npm run build
```

- Cerrar sesión desde una ficha de paciente → la barra queda en `/`, no en la ficha
- Atrás después del logout → no vuelve a la ficha
- Deep link estando deslogueado: pegar `/farmacia/stock` sin sesión → Login → al entrar, cae en Stock
  (la URL sobrevive sola: `App.tsx` monta `Login` sin tocarla — confirmarlo, no asumirlo)

- [ ] **Paso 5: commit**

```bash
git add src/shell/AppShell.tsx src/shell/UserMenu.tsx
git commit -m "feat(shell): titulo de pestana sin PII y logout que vuelve a la raiz"
```

- [ ] **Paso 6: abrir el PR 2**

Título: `feat(shell): la navegación vive en la URL`. En el cuerpo, la lista de verificación en vivo del
Paso 5 de la Task 4 — es lo que va a querer probar quien revise.

---

# FASE C · PR 3 — Pacientes

Rama: `feat/urls-pacientes`. Al terminar, el ejemplo del Director está vivo:
`/coordinacion/pacientes/EFC18244/32000740001`.

---

### Task 7: la navegación interna de `ProtocolsView` sale del path

**Archivos:**
- Modificar: `src/views/ProtocolsView.tsx:25-30` (el tipo `Nav`), `:113` (el `useState<Nav>`) y sus
  llamadores (`setNav`)

**Interfaces:**
- Consume: `useUrlLocation`, `pushUrl` (Task 3); `shortId`, `resolveShortId` (Task 2); `ProtocolRow`,
  `PatientRow` (ya importados en la vista).
- Produce: nada hacia afuera. El tipo `Nav` sigue existiendo con la misma forma; cambia de dónde sale.

- [ ] **Paso 1: escribir las funciones puras de esta vista y su test**

Crear `src/views/protocolsNav.ts`:

```ts
import { resolveShortId, shortId } from '../lib/router'
import type { PatientRow } from '../data/patients'
import type { ProtocolRow } from '../data/protocols'

/* El mismo tipo Nav que ya usaba la vista; ahora se deriva del path de la URL en vez de un useState. */
export type Nav =
  | { mode: 'list' }
  | { mode: 'all' }
  | { mode: 'protocol'; protocolId: string }
  | { mode: 'patient'; protocolId: string; patientId: string }

/**
 * Los segmentos de la URL → posición interna de la vista.
 *
 * Acepta el código legible Y el uuid: una URL vieja con uuid tiene que seguir andando cuando ese
 * paciente recibe su IVRS más adelante (que es lo que le pasa a TODO paciente de screening).
 * `null` = el path apunta a algo que no está entre las filas visibles → la vista muestra "no se
 * encontró", que es lo mismo que ve quien no tiene permiso: distinguirlos filtraría qué existe.
 */
export function navDesdePath(path: string[], protocolos: ProtocolRow[], pacientes: PatientRow[]): Nav | null {
  if (path.length === 0) return { mode: 'list' }
  if (path[0] === 'todos') return { mode: 'all' }

  const protocolo = protocolos.find((p) => p.code === path[0]) ?? resolveShortId(protocolos, path[0])
  if (!protocolo) return null
  if (path.length === 1) return { mode: 'protocol', protocolId: protocolo.id }

  const token = path[1]
  const paciente =
    pacientes.find((p) => p.code === token) ??
    resolveShortId(pacientes, token.startsWith('p-') ? token.slice(2) : token)
  if (!paciente) return null

  return { mode: 'patient', protocolId: protocolo.id, patientId: paciente.id }
}

/**
 * Posición interna → segmentos de la URL. Se ESCRIBE siempre el legible: el código del protocolo, y
 * el IVRS del paciente si lo tiene. Sin IVRS va `p-` + los 8 primeros del uuid — el prefijo evita que
 * se confunda con un IVRS, que es numérico.
 */
export function pathDesdeNav(nav: Nav, protocolos: ProtocolRow[], pacientes: PatientRow[]): string[] {
  if (nav.mode === 'list') return []
  if (nav.mode === 'all') return ['todos']

  const protocolo = protocolos.find((p) => p.id === nav.protocolId)
  const segProtocolo = protocolo?.code ?? shortId(nav.protocolId)
  if (nav.mode === 'protocol') return [segProtocolo]

  const paciente = pacientes.find((p) => p.id === nav.patientId)
  const segPaciente = paciente?.code ?? `p-${shortId(nav.patientId)}`
  return [segProtocolo, segPaciente]
}
```

Crear `src/views/protocolsNav.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { PatientRow } from '../data/patients'
import type { ProtocolRow } from '../data/protocols'
import { navDesdePath, pathDesdeNav } from './protocolsNav'

/**
 * El ida y vuelta entre el path de la URL y la posición interna de Pacientes.
 *
 * POR QUÉ ESTA FUNCIÓN: falla en silencio. Si resuelve al paciente equivocado, la ficha se ve
 * impecable — con los datos de otra persona. En una app clínica eso es lo peor que puede pasar, y no
 * lo agarra nadie mirando la pantalla.
 */

const proto = (over: Partial<ProtocolRow> = {}): ProtocolRow => ({
  id: '11111111-0000-4000-8000-000000000001', code: 'EFC18244', name: 'Estudio', sponsor: null,
  status: 'activo', description: null, principal_investigator: null, specialty: null, internal_code: null,
  ...over,
})

const paciente = (over: Partial<PatientRow> = {}): PatientRow => ({
  id: '22222222-0000-4000-8000-000000000002', code: '32000740001', full_name: 'TEST Paciente',
  status: 'activo', birth_date: null, sex: null, fertility: null, treating_physician: null,
  enrollments: [], ...over,
})

describe('navDesdePath', () => {
  const protocolos = [proto()]
  const pacientes = [paciente()]

  it('sin segmentos es la grilla', () => {
    expect(navDesdePath([], protocolos, pacientes)).toEqual({ mode: 'list' })
  })

  it('"todos" es la lista completa', () => {
    expect(navDesdePath(['todos'], protocolos, pacientes)).toEqual({ mode: 'all' })
  })

  it('resuelve el protocolo por código', () => {
    expect(navDesdePath(['EFC18244'], protocolos, pacientes))
      .toEqual({ mode: 'protocol', protocolId: protocolos[0].id })
  })

  it('resuelve el paciente por IVRS', () => {
    expect(navDesdePath(['EFC18244', '32000740001'], protocolos, pacientes))
      .toEqual({ mode: 'patient', protocolId: protocolos[0].id, patientId: pacientes[0].id })
  })

  it('resuelve el paciente sin IVRS por su prefijo p-', () => {
    const sinIvrs = [paciente({ code: null })]
    expect(navDesdePath(['EFC18244', 'p-22222222'], protocolos, sinIvrs))
      .toEqual({ mode: 'patient', protocolId: protocolos[0].id, patientId: sinIvrs[0].id })
  })

  it('lo que no está entre las filas visibles es null', () => {
    expect(navDesdePath(['NOEXISTE'], protocolos, pacientes)).toBeNull()
    expect(navDesdePath(['EFC18244', '99999999999'], protocolos, pacientes)).toBeNull()
  })
})

describe('pathDesdeNav · se escribe siempre el legible', () => {
  const protocolos = [proto()]
  const pacientes = [paciente()]

  it('protocolo por código', () => {
    expect(pathDesdeNav({ mode: 'protocol', protocolId: protocolos[0].id }, protocolos, pacientes))
      .toEqual(['EFC18244'])
  })

  it('paciente con IVRS', () => {
    expect(pathDesdeNav(
      { mode: 'patient', protocolId: protocolos[0].id, patientId: pacientes[0].id }, protocolos, pacientes,
    )).toEqual(['EFC18244', '32000740001'])
  })

  it('paciente sin IVRS cae al identificador corto con prefijo', () => {
    const sinIvrs = [paciente({ code: null })]
    expect(pathDesdeNav(
      { mode: 'patient', protocolId: protocolos[0].id, patientId: sinIvrs[0].id }, protocolos, sinIvrs,
    )).toEqual(['EFC18244', 'p-22222222'])
  })

  it('ida y vuelta: el path que emite vuelve a la misma posición', () => {
    const nav = { mode: 'patient', protocolId: protocolos[0].id, patientId: pacientes[0].id } as const
    expect(navDesdePath(pathDesdeNav(nav, protocolos, pacientes), protocolos, pacientes)).toEqual(nav)
  })
})
```

- [ ] **Paso 2: correr el test y verificar que falla**

```bash
npx vitest run src/views/protocolsNav.test.ts
```

Esperado: FAIL — `Failed to resolve import "./protocolsNav"`. Después de crear el archivo del Paso 1,
volver a correr: PASS, 10 tests.

- [ ] **Paso 3: cablear la vista**

En `src/views/ProtocolsView.tsx`, borrar la definición local de `Nav` (líneas 25-30) e importar la
nueva, junto con el resto:

```tsx
import { navDesdePath, pathDesdeNav } from './protocolsNav'
import type { Nav } from './protocolsNav'
import { pushUrl, useUrlLocation } from '../lib/useUrlState'
```

Reemplazar el `useState<Nav>`:

```tsx
  const [nav, setNav] = useState<Nav>({ mode: 'list' })
```

por:

```tsx
  /* La posición interna sale del path de la URL. Mientras los datos cargan el path no se puede
     resolver todavía (no sabemos si ese código existe), así que se muestra la grilla — que es lo que
     ya se veía antes en ese instante. `null` tras la carga = el path apunta a algo que no está. */
  const urlLocation = useUrlLocation()
  const cargando = protocols.loading || patients.loading
  const navResuelto = navDesdePath(urlLocation?.path ?? [], protocols.data ?? [], patients.data ?? [])
  const nav: Nav = navResuelto ?? { mode: 'list' }
  const navRoto = !cargando && navResuelto === null

  const setNav = (siguiente: Nav) => {
    const actual = urlLocation
    if (!actual) return
    /* Push y no replace: moverse entre la grilla, un protocolo y una ficha ES navegar, así que el
       atrás del navegador tiene que poder deshacerlo. */
    pushUrl({ ...actual, path: pathDesdeNav(siguiente, protocols.data ?? [], patients.data ?? []) })
  }
```

`protocols` y `patients` son los `QueryResult` que la vista ya tiene (`useProtocols()` / `usePatients()`).
La forma es `{ data: T | null; loading: boolean; error: string | null; refetch: () => void }`
(`src/lib/useSupabaseQuery.ts:6`).

- [ ] **Paso 4: mostrar la pantalla serena cuando el path no resuelve**

Arriba del `return` de la vista:

```tsx
  if (navRoto) return <NotFoundView motivo="ruta" />
```

con `import { NotFoundView } from '../shell/NotFoundView'`.

- [ ] **Paso 5: verificar en el navegador**

```bash
npm run build
```

- Entrar a un protocolo → la barra muestra su código
- Abrir una ficha → la barra muestra código + IVRS
- F5 en la ficha → sigue en la ficha
- Atrás → vuelve al protocolo; atrás otra vez → a la grilla
- Pegar un código inexistente → pantalla serena, no la grilla en silencio
- Abrir un paciente en screening (sin IVRS) → la barra muestra `p-xxxxxxxx` y F5 lo mantiene

- [ ] **Paso 6: commit**

```bash
git add src/views/protocolsNav.ts src/views/protocolsNav.test.ts src/views/ProtocolsView.tsx
git commit -m "feat(pacientes): protocolo y ficha en la URL"
```

---

### Task 8: búsqueda, filtro de estado y visita abierta en la ficha

**Archivos:**
- Modificar: `src/views/ProtocolsView.tsx:118` (`search`), `:121` (`fEstado`)
- Modificar: `src/views/PatientFichaView.tsx:62` (`openVisitId`)

**Interfaces:**
- Consume: `useUrlState`, `codecs` (Tasks 2-3).

- [ ] **Paso 1: sustituir en `ProtocolsView.tsx`**

```tsx
  const [search, setSearch] = useState('')
  const [fEstado, setFEstado] = useState<ProtocolStatus[]>([])
```

por:

```tsx
  const [search, setSearch] = useUrlState('buscar', '')
  const [fEstado, setFEstado] = useUrlState<ProtocolStatus[]>('estado', [], { codec: codecs.list as Codec<ProtocolStatus[]> })
```

Imports: `import { codecs } from '../lib/router'`, `import type { Codec } from '../lib/router'`,
`import { useUrlState } from '../lib/useUrlState'`.

- [ ] **Paso 2: sustituir en `PatientFichaView.tsx`**

```tsx
  const [openVisitId, setOpenVisitId] = useState<string | null>(null)
```

por:

```tsx
  /* La visita abierta va con push: abrirla es navegar, y el atrás tiene que cerrarla.
     UUID COMPLETO, no corto: `VisitDetail` trae sus propios datos por id, así que puede abrir una
     visita que NO esté entre las filas cargadas. Un identificador corto habría que resolverlo contra
     esas filas y rompería justamente eso (ver el comentario de TrackAlertsView.tsx:84). */
  const [visitaId, setVisitaId] = useUrlState('visita', '', { mode: 'push' })
  const openVisitId = visitaId || null
  const setOpenVisitId = (id: string | null) => setVisitaId(id ?? '')
```

No hace falta importar nada de `router.ts` para esto: solo `import { useUrlState } from '../lib/useUrlState'`.

- [ ] **Paso 3: verificar en el navegador**

```bash
npm run build
```

- Escribir en el buscador → aparece `?buscar=` y **no** se apila historial (atrás sale de la vista, no
  borra letra por letra)
- Filtrar por estado → `?estado=activo`
- Vaciar el filtro → el parámetro desaparece de la barra
- Abrir una visita en la ficha → `?visita=xxxxxxxx`; atrás la cierra
- F5 con la visita abierta → vuelve a abrirse

- [ ] **Paso 4: commit**

```bash
git add src/views/ProtocolsView.tsx src/views/PatientFichaView.tsx
git commit -m "feat(pacientes): busqueda, filtro de estado y visita abierta en la URL"
```

- [ ] **Paso 5: abrir el PR 3**

Título: `feat(pacientes): protocolo, ficha y filtros en la URL`. Poner en el cuerpo la URL del ejemplo
del Director, que a partir de este PR existe de verdad.

---

# FASE D · PR 4 — Coordinación

Rama: `feat/urls-coordinacion`. Independiente de la Fase E: se pueden hacer en cualquier orden, o en
paralelo.

Las tres tareas siguen el mismo molde: sustituir `useState` por `useUrlState` según el §4.3 del spec,
`npm run build`, verificar en el navegador, commitear. **El código de cada sustitución está completo
abajo — no hay que deducirlo de la tarea anterior.**

---

### Task 9: Visitas del día

**Archivos:**
- Modificar: `src/views/DayVisitsView.tsx:56` y `:61-70`

**Interfaces:**
- Consume: `useUrlState` (Task 3); `codecs`, `oneOf` (Task 2).

- [ ] **Paso 1: sustituir los ocho campos**

```tsx
  const [date, setDate] = useState(todayISO())
  const [q, setQ] = useState('')
  const [fEstado, setFEstado] = useState<string[]>([])
  const [fProto, setFProto] = useState<string[]>([])
  const [fMed, setFMed] = useState<string[]>([])
  const [fCoord, setFCoord] = useState<string[]>([])
  const [group, setGroup] = useState<GroupBy>('operativo')
```

por:

```tsx
  /* Todo esto vive en la URL (ver docs/superpowers/specs/2026-08-23-urls-navegacion-design.md §4.3).
     Van en modo 'replace' —el default del hook— porque filtrar y cambiar de día NO es navegar: si
     apilaran, salir de esta vista después de un rato trabajando serían quince "atrás". */
  const [date, setDate] = useUrlState('dia', todayISO())
  const [q, setQ] = useUrlState('buscar', '')
  const [fEstado, setFEstado] = useUrlState<string[]>('estado', [], { codec: codecs.list })
  const [fProto, setFProto] = useUrlState<string[]>('protocolo', [], { codec: codecs.list })
  const [fMed, setFMed] = useUrlState<string[]>('medicacion', [], { codec: codecs.list })
  const [fCoord, setFCoord] = useUrlState<string[]>('coordinadora', [], { codec: codecs.list })
  const [group, setGroup] = useUrlState<GroupBy>('agrupar', 'operativo', {
    codec: oneOf(['operativo', 'estado', 'protocolo', 'medico', 'coordinador', 'ninguno'] as const),
  })
```

Imports: `import { codecs, oneOf } from '../lib/router'`,
`import { useUrlState } from '../lib/useUrlState'`.

- [ ] **Paso 2: la visita abierta**

`openVisit` guarda la fila entera, no el id, así que se deriva:

```tsx
  const [openVisit, setOpenVisit] = useState<DayVisitRow | null>(null)
```

por:

```tsx
  /* Push: abrir el detalle de una visita ES navegar, y el atrás tiene que cerrarlo. Va el UUID
     completo y la FILA se deriva de las ya cargadas: si la visita no es del día que estás mirando,
     no hay nada que abrir y queda en null — que es exactamente el comportamiento de antes. */
  const [visitaId, setVisitaId] = useUrlState('visita', '', { mode: 'push' })
  const openVisit = visitaId ? (rows.find((r) => r.id === visitaId) ?? null) : null
  const setOpenVisit = (v: DayVisitRow | null) => setVisitaId(v?.id ?? '')
```

> **Dónde va este bloque:** `rows` se define en la línea 84 (`const rows = day.data ?? []`), *después*
> de los `useState` que estás reemplazando. Este bloque tiene que quedar **debajo** de esa línea o
> TypeScript tira "Block-scoped variable used before its declaration". Los otros seis campos sí van
> donde estaban.

- [ ] **Paso 3: verificar en el navegador**

```bash
npm run build
```

- Cambiar de día → `?dia=…`, y el atrás **no** recorre los días
- Aplicar los cuatro filtros → los cuatro parámetros aparecen; al vaciarlos desaparecen
- Abrir una visita → `?visita=…`; atrás la cierra
- Copiar la URL con día + filtros + visita, pegarla en otra pestaña → misma pantalla

- [ ] **Paso 4: commit**

```bash
git add src/views/DayVisitsView.tsx
git commit -m "feat(visitas): dia, filtros y visita abierta en la URL"
```

---

### Task 10: Para ver médico

**Archivos:**
- Modificar: `src/views/DoctorQueueView.tsx:41-42` y `:45`

- [ ] **Paso 1: sustituir**

```tsx
  const [date, setDate] = useState(todayISO())
  const [status, setStatus] = useState<Status>('todos')
  const [openVisitId, setOpenVisitId] = useState<string | null>(null)
```

por:

```tsx
  const [date, setDate] = useUrlState('dia', todayISO())
  const [status, setStatus] = useUrlState<Status>('estado', 'todos', {
    codec: oneOf(['todos', 'faltan', 'atendidos'] as const),
  })
  /* Push: el detalle de la visita es navegación; el atrás lo cierra. UUID completo (ver Task 8). */
  const [visitaId, setVisitaId] = useUrlState('visita', '', { mode: 'push' })
  const openVisitId = visitaId || null
  const setOpenVisitId = (id: string | null) => setVisitaId(id ?? '')
```

Imports: `import { oneOf } from '../lib/router'`, `import { useUrlState } from '../lib/useUrlState'`.

**El modal de comentarios (`commentsVisit`) NO se toca**: queda como estado local. `?visita=` abre el
detalle, que es el nivel de lectura que importa; el sub-modal no gana parámetro propio (spec §7).

- [ ] **Paso 2: verificar en el navegador**

```bash
npm run build
```

Día, filtro de estado y visita abierta en la barra; F5 los mantiene; el atrás no recorre los días.

- [ ] **Paso 3: commit**

```bash
git add src/views/DoctorQueueView.tsx
git commit -m "feat(cola medico): dia, estado y visita abierta en la URL"
```

---

### Task 11: Alertas

**Archivos:**
- Modificar: `src/views/TrackAlertsView.tsx:82-83`, `:87` y `:89`

- [ ] **Paso 1: sustituir**

```tsx
  const [protocolFilter, setProtocolFilter] = useState<string>('all')
  const [ageDays, setAgeDays] = useState<number>(0)
  const [openVisitId, setOpenVisitId] = useState<string | null>(null)
  const [showDismissed, setShowDismissed] = useState(false)
```

por:

```tsx
  const [protocolFilter, setProtocolFilter] = useUrlState('protocolo', 'all')
  const [ageDays, setAgeDays] = useUrlState('antiguedad', 0, { codec: codecs.num })
  const [showDismissed, setShowDismissed] = useUrlState('descartadas', false, { codec: codecs.bool })
  /* Push: el detalle de la visita es navegación; el atrás lo cierra. UUID completo, y acá se ve por
     qué: el comentario de la línea 84 dice que VisitDetail trae sus datos por id y que POR ESO una
     alerta se puede abrir aunque los filtros la dejen fuera. Acortar el id obligaría a resolverlo
     contra las filas visibles y mataría esa propiedad. */
  const [visitaId, setVisitaId] = useUrlState('visita', '', { mode: 'push' })
  const openVisitId = visitaId || null
  const setOpenVisitId = (id: string | null) => setVisitaId(id ?? '')
```

Imports: `import { codecs } from '../lib/router'`, `import { useUrlState } from '../lib/useUrlState'`.

**`dismissing`, `reason`, `detail`, `busy` y `err` NO se tocan**: son un formulario de acción (spec §7).

- [ ] **Paso 2: verificar en el navegador**

```bash
npm run build
```

Los tres filtros en la barra; `?descartadas=1` al activar el toggle; F5 los mantiene.

- [ ] **Paso 3: commit**

```bash
git add src/views/TrackAlertsView.tsx
git commit -m "feat(alertas): filtros y visita abierta en la URL"
```

- [ ] **Paso 4: abrir el PR 4**

Título: `feat(coordinación): día, filtros y visita abierta en la URL`.

---

# FASE E · PR 5 — Farmacia

Rama: `feat/urls-farmacia`. Independiente de la Fase D.

---

### Task 12: Dispensaciones

**Archivos:**
- Modificar: `src/views/pharma/DispensacionesView.tsx:42`, `:46`, `:48-50`, `:54`

**Interfaces:**
- Consume: `useUrlState`, `useUrlLocation`, `pushUrl`, `codecs`, `oneOf`.

- [ ] **Paso 1: sustituir los filtros**

```tsx
  const [day, setDay] = useState(todayISO())
  const [protoSel, setProtoSel] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [vista, setVista] = useState<'tablero' | 'historial'>('tablero')
```

por:

```tsx
  const [day, setDay] = useUrlState('dia', todayISO())
  const [protoSel, setProtoSel] = useUrlState<string[]>('protocolo', [], { codec: codecs.list })
  const [query, setQuery] = useUrlState('buscar', '')
  const [vista, setVista] = useUrlState<'tablero' | 'historial'>('vista', 'tablero', {
    codec: oneOf(['tablero', 'historial'] as const),
  })
```

Imports: `import { codecs, oneOf } from '../../lib/router'`,
`import { pushUrl, useUrlLocation, useUrlState } from '../../lib/useUrlState'`.

**`pagina` y `acumuladas` NO se tocan** (spec §7): restaurar la paginación acumulativa implicaría
refetchear N páginas para que la URL no mienta sobre lo que estás viendo.

- [ ] **Paso 2: el cajón abierto va en el path, no en el query**

Tiene código legible propio (`dispensation_code`), así que va como segmento:

```tsx
  const [openId, setOpenId] = useState<string | null>(null)
```

por:

```tsx
  /* El cajón va en el PATH y no en el query porque la dispensación tiene código legible propio:
     /farmacia/dispensaciones/D-0417. Push, como toda entidad abierta: el atrás lo cierra. */
  const urlLocation = useUrlLocation()
  const codigoAbierto = urlLocation?.path[0] ?? null
  const openId = codigoAbierto
    ? (all.find((d) => d.dispensation_code === codigoAbierto)?.id ?? null)
    : null
  const setOpenId = (id: string | null) => {
    if (!urlLocation) return
    const codigo = id ? all.find((d) => d.id === id)?.dispensation_code : null
    pushUrl({ ...urlLocation, path: codigo ? [codigo] : [] })
  }
```

> **Dónde va este bloque:** `all` se define en la línea 61 (`const all = useMemo(() => q.data ?? [], [q.data])`),
> *después* del `useState` que estás reemplazando. Este bloque tiene que quedar **debajo** de esa
> línea o TypeScript tira "Block-scoped variable used before its declaration".
>
> **Antes de empezar:** confirmar que `dispensation_code` viene en las filas del tablero. En
> `src/data/pharma/dispensations.ts:84` figura para las dispensaciones embebidas; si la query del
> tablero (`useDispensationBoard`) no lo trae, agregarlo a su `select` — es una columna más, sin
> migración.

- [ ] **Paso 3: verificar en el navegador**

```bash
npm run build
```

- Abrir un cajón → `/farmacia/dispensaciones/D-xxxx`; atrás lo cierra; F5 lo reabre
- Cambiar a Historial → `?vista=historial`
- Día, protocolo y búsqueda en la barra, sin apilar historial

- [ ] **Paso 4: commit**

```bash
git add src/views/pharma/DispensacionesView.tsx
git commit -m "feat(dispensaciones): tablero, filtros y cajon abierto en la URL"
```

---

### Task 13: Stock

**Archivos:**
- Modificar: `src/views/pharma/MedicamentosView.tsx:74-77`

- [ ] **Paso 1: sustituir**

```tsx
  const [apartado, setApartado] = useState<Apartado>('menu')
  const [filtro, setFiltro] = useState<EstadoFilter>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [protoSel, setProtoSel] = useState<string[]>([])
```

por:

```tsx
  /* El apartado va con PUSH: moverse entre el menú y un apartado es navegar dentro de Stock, y el
     atrás tiene que volver al menú. Los filtros van con replace, como en el resto de la app. */
  const [apartado, setApartado] = useUrlState<Apartado>('apartado', 'menu', {
    codec: oneOf(['menu', 'protocolo', 'ambulatoria', 'catalogo'] as const), mode: 'push',
  })
  const [filtro, setFiltro] = useUrlState<EstadoFilter>('estado', 'todos', {
    codec: oneOf(['todos', 'vigentes', 'pronto', 'vencido'] as const),
  })
  const [busqueda, setBusqueda] = useUrlState('buscar', '')
  const [protoSel, setProtoSel] = useUrlState<string[]>('protocolo', [], { codec: codecs.list })
```

Imports: `import { codecs, oneOf } from '../../lib/router'`,
`import { useUrlState } from '../../lib/useUrlState'`.

**`creating`, `editing`, `deleting`, `codigo`, `ajuste`, `dropdownId` y `toast` NO se tocan** (spec §7).

- [ ] **Paso 2: verificar en el navegador**

```bash
npm run build
```

Entrar a un apartado → `?apartado=…` y el atrás vuelve al menú de Stock. Filtros en la barra sin apilar.

- [ ] **Paso 3: commit**

```bash
git add src/views/pharma/MedicamentosView.tsx
git commit -m "feat(stock): apartado y filtros en la URL"
```

---

### Task 14: Recepción

**Archivos:**
- Modificar: `src/views/pharma/RecepcionView.tsx:49-56`

- [ ] **Paso 1: sustituir**

```tsx
  const [fEstados, setFEstados] = useState<ReceptionStatus[]>([])
  const [fTipos, setFTipos] = useState<ReceptionKind[]>([])
  const [fMeds, setFMeds] = useState<string[]>([])
  const [fProtoSel, setFProtoSel] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
```

por:

```tsx
  const [fEstados, setFEstados] = useUrlState<ReceptionStatus[]>('estado', [], { codec: codecs.list as Codec<ReceptionStatus[]> })
  const [fTipos, setFTipos] = useUrlState<ReceptionKind[]>('tipo', [], { codec: codecs.list as Codec<ReceptionKind[]> })
  const [fMeds, setFMeds] = useUrlState<string[]>('medicamento', [], { codec: codecs.list })
  const [fProtoSel, setFProtoSel] = useUrlState<string[]>('protocolo', [], { codec: codecs.list })
  const [q, setQ] = useUrlState('buscar', '')
  const [desde, setDesde] = useUrlState('desde', '')
  const [hasta, setHasta] = useUrlState('hasta', '')
```

Imports: `import { codecs } from '../../lib/router'`, `import type { Codec } from '../../lib/router'`,
`import { useUrlState } from '../../lib/useUrlState'`.

**El wizard (`creating`) NO se toca** — es el caso testigo del spec §7: una URL que promete devolverte
una recepción a medio cargar y te devuelve un wizard vacío miente, y esto es una app auditable.

- [ ] **Paso 2: verificar en el navegador**

```bash
npm run build
```

Los seis filtros y el rango de fechas en la barra; F5 los mantiene; abrir el wizard **no** cambia la URL.

- [ ] **Paso 3: commit**

```bash
git add src/views/pharma/RecepcionView.tsx
git commit -m "feat(recepcion): filtros y rango de fechas en la URL"
```

---

### Task 15: Estadísticas

**Archivos:**
- Modificar: `src/views/pharma/reportes/ReportesView.tsx:51-54` y `:181`

- [ ] **Paso 1: sustituir**

```tsx
  const [preset, setPreset] = useState<Preset>('30dias')
  const [rango, setRango] = useState(() => rangoDePreset('30dias'))
  const [protoSel, setProtoSel] = useState<string[]>([])
```

por:

```tsx
  /* El rango NO se guarda aparte: se deriva del preset, y solo cuando el preset es 'custom' viajan
     desde/hasta. Guardar los dos sería poder contradecirse — una URL que dice periodo=anio con un
     rango de tres días. */
  const [preset, setPreset] = useUrlState<Preset>('periodo', '30dias', {
    codec: oneOf(['30dias', 'mesEnCurso', 'anio', 'custom'] as const),
  })
  const [desde, setDesde] = useUrlState('desde', '')
  const [hasta, setHasta] = useUrlState('hasta', '')
  const rango = preset === 'custom' && desde && hasta ? { desde, hasta } : rangoDePreset(
    preset === 'custom' ? '30dias' : preset,
  )
  const setRango = (r: { desde: string; hasta: string }) => { setDesde(r.desde); setHasta(r.hasta) }
  const [protoSel, setProtoSel] = useUrlState<string[]>('protocolo', [], { codec: codecs.list })
```

Imports: `import { codecs, oneOf } from '../../../lib/router'`,
`import { useUrlState } from '../../../lib/useUrlState'`.

> **Nota:** revisar la línea 181 (`setPreset('custom')`) y el resto de los llamadores de `setRango`:
> con este cambio, elegir un rango a mano tiene que setear **primero** `desde`/`hasta` y después
> `preset='custom'`, o el render intermedio deriva el rango del preset viejo.

- [ ] **Paso 2: verificar en el navegador**

```bash
npm run build
```

- Cada preset → `?periodo=…`; el de 30 días (default) **no** escribe nada
- Elegir un rango a mano → `?periodo=custom&desde=…&hasta=…`
- F5 mantiene el período y los números de los gráficos son los mismos

- [ ] **Paso 3: commit**

```bash
git add src/views/pharma/reportes/ReportesView.tsx
git commit -m "feat(estadisticas): periodo, rango y protocolo en la URL"
```

- [ ] **Paso 4: abrir el PR 5**

Título: `feat(farmacia): filtros y entidad abierta en la URL`.

---

## Cierre

Con los cinco PRs mergeados, correr una vez el recorrido completo del §10 del spec sobre el preview de
Vercel (no solo local): F5 profundo, atrás/adelante, deep link deslogueado, link a módulo sin rol, y el
título de la pestaña sin nombres. Después, `cierre-jornada` para la bitácora y el bump de versión.

**Pendiente conocido que este plan NO cubre** (spec §12): modales como rutas, "recordar dónde estabas"
en localStorage, y deep links en notificaciones o WhatsApp.
