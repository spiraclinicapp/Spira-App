import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { Codec, UrlState } from './router'
import { buildUrl, codecs, parseHref, readParam, writeParam } from './router'

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
 * Memoizado contra la URL cruda: `parseHref` devuelve un OBJETO NUEVO en cada llamada, así que sin
 * esto la identidad cambiaría en cada render y toda vista que lo ponga en las deps de un efecto se
 * re-ejecutaría siempre. Con la URL quieta, la referencia queda quieta.
 */
export function useUrlLocation(): UrlState | null {
  const crudo = useUrlSnapshot()
  return useMemo(() => parseHref(crudo), [crudo])
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
 *
 * DOS SOBRECARGAS y no una firma con `codec?`: la implementación castea a `Codec<T>` el codec de
 * string que usa por default, así que sin esto un `useUrlState<Preset>('periodo', '30dias')` —al que
 * se le olvidó el codec— compilaba, y `?periodo=inventado` entraba tipado como `Preset` sin pasar por
 * ninguna validación. El string es el único tipo que puede ir sin codec, porque para él ese default
 * ES el codec correcto; cualquier otro lo exige.
 */
export function useUrlState(
  key: string,
  def: string,
  opts?: { mode?: 'push' | 'replace' },
): [string, (valor: string) => void]
export function useUrlState<T>(
  key: string,
  def: T,
  opts: { codec: Codec<T>; mode?: 'push' | 'replace' },
): [T, (valor: T) => void]
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
    const estado = parseHref(crudo)
    return estado ? readParam(estado.query, key, def, codec) : def
  }, [crudo, key])

  const setValor = useCallback(
    (nuevo: T) => {
      const actual = parseHref(window.location.pathname + window.location.search)
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

/**
 * La entidad abierta en la vista (una visita, un cajón): un id o nada.
 *
 * Existe porque `parse` usa `null` como centinela de "valor inválido", así que `null` no puede ser
 * además un valor legítimo y la ausencia se representa con `''`. Sin este helper, cada vista que abre
 * algo repite el mismo adaptador entre `''` y `null` y se hace la misma pregunta ("¿me acordé del
 * `|| null`?"). Acá vive también la decisión de que abrir una entidad APILA historial: el atrás del
 * navegador la cierra, que es lo que el usuario espera del gesto.
 */
export function useUrlEntity(key: string): [string | null, (id: string | null) => void] {
  const [valor, setValor] = useUrlState(key, '', { mode: 'push' })
  /* `useCallback` y no una flecha inline: `setValor` (el de `useUrlState`) ya está memoizado —según
     sus propios comentarios— justamente porque varias vistas lo van a poner en las deps de un efecto.
     Sin esto, `useUrlPath` (abajo) conservaba esa propiedad y `useUrlEntity` la perdía sin avisar: de
     los dos helpers, uno quedaba estable y el otro no. */
  const setEntidad = useCallback((id: string | null) => setValor(id ?? ''), [setValor])
  return [valor || null, setEntidad]
}

/**
 * Los segmentos propios de la vista (el protocolo y el paciente, el código de la dispensación).
 *
 * Por default el cambio de path **descarta todo el query**, que es la misma regla que aplica el
 * shell al navegar: los filtros y la entidad abierta describen la pantalla de la que te vas, no la
 * que abrís —un `?visita=` arrastrado a otra ficha abriría la visita de otro paciente, porque el
 * detalle trae sus datos por id—. Volver con el atrás del navegador los recupera igual, porque
 * quedaron en la entrada anterior del historial.
 *
 * `conservar` es una LISTA DE CLAVES, no un booleano, a propósito: cada navegación **declara** qué
 * parámetros le pertenecen, en vez de decidir todo-o-nada. Un booleano ata dos decisiones que son
 * distintas —"conservá mis filtros" (Dispensaciones abre el cajón sobre un tablero filtrado por
 * `dia`/`vista`/`protocolo`/`buscar` y necesita que sobrevivan; Pacientes tiene `buscar`/`estado` que
 * hoy ya sobreviven entrar a un protocolo y volver) y "soltá la entidad abierta" (no arrastrar el
 * `?visita=` de la pantalla anterior a otra ficha)—. Si los DOS consumidores previstos van a
 * necesitar `true`, el default seguro de un booleano (`false`) no se activaría nunca en la práctica.
 * Y poniendo los dos en `true` se reabre justo el escenario que el helper quería evitar. Con la
 * lista, cada vista pide EXACTAMENTE lo suyo: nada de todo-o-nada. El default sigue siendo descartar
 * (`conservar` ausente o vacío).
 */
export function useUrlPath(): [string[], (path: string[], opts?: { conservar?: string[] }) => void] {
  const ubicacion = useUrlLocation()
  const path = useMemo(() => ubicacion?.path ?? [], [ubicacion])
  const setPath = useCallback((siguiente: string[], opts: { conservar?: string[] } = {}) => {
    /* Se relee la URL del momento en vez de cerrar sobre `ubicacion`: el setter suele viajar en las
       deps de un efecto y tiene que escribir sobre el estado de AHORA, no sobre el del render en que
       se creó. */
    const actual = parseHref(window.location.pathname + window.location.search)
    if (!actual) return
    const query = Object.fromEntries(
      Object.entries(actual.query).filter(([k]) => opts.conservar?.includes(k)),
    )
    pushUrl({ ...actual, path: siguiente, query })
  }, [])
  return [path, setPath]
}
