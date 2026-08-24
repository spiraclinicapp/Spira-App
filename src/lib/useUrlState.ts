import { useCallback, useMemo, useSyncExternalStore } from 'react'
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

/**
 * El estado de navegación actual. `null` = la ruta no existe (el shell muestra la pantalla serena).
 *
 * Memoizado contra la URL cruda: `parseUrl` devuelve un OBJETO NUEVO en cada llamada, así que sin
 * esto la identidad cambiaría en cada render y toda vista que lo ponga en las deps de un efecto se
 * re-ejecutaría siempre. Con la URL quieta, la referencia queda quieta.
 */
export function useUrlLocation(): UrlState | null {
  const crudo = useUrlSnapshot()
  return useMemo(() => {
    const [pathname, search] = crudo.split('?')
    return parseUrl(pathname, search ? `?${search}` : '')
  }, [crudo])
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

  /* Memoizado por el mismo motivo que `useUrlLocation`, y acá pesa más: los codecs de lista
     (`codecs.list`, `listOf`) devuelven un ARRAY NUEVO en cada parseo. Sin memo, un filtro multi
     cambia de identidad en cada render, y una vista que lo ponga en las deps de un `useEffect` con
     `setState` adentro entra en loop. `def` y `codec` quedan fuera de las deps por lo mismo que en
     `setValor`: son literales del render. */
  const valor = useMemo(() => {
    const [pathname, search] = crudo.split('?')
    const estado = parseUrl(pathname, search ? `?${search}` : '')
    return estado ? readParam(estado.query, key, def, codec) : def
  }, [crudo, key])

  const setValor = useCallback(
    (nuevo: T) => {
      const [p, s] = (window.location.pathname + window.location.search).split('?')
      const actual = parseUrl(p, s ? `?${s}` : '')
      if (!actual) return
      const siguiente: UrlState = { ...actual, query: writeParam(actual.query, key, nuevo, def, codec) }
      if (mode === 'push') pushUrl(siguiente)
      else replaceUrl(siguiente)
    },
    /* `def` y `codec` quedan FUERA de las deps a propósito: son literales del render (`''`, `[]`,
       `codecs.list`), así que su identidad cambia en cada render y meterlos acá recrearía el setter
       cada vez — y varias vistas lo pasan en el array de dependencias de sus efectos. Lo que el
       setter lee de ellos se resuelve en el momento de escribir, no cuando se creó. */
    [key, mode],
  )

  return [valor, setValor]
}
