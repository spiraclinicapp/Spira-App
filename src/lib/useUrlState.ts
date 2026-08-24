import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
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
  const destino = buildUrl(state)
  /* Si la URL no cambia no hay nada que apilar: clickear el submódulo en el que ya estás dejaría
     una entrada idéntica y el "atrás" no haría nada visible. Cuando el click sí cambia algo (por
     ejemplo limpia los filtros), la URL difiere y el push corre normal. */
  if (destino === window.location.pathname + window.location.search) return
  window.history.pushState(null, '', destino)
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
): [string, (valor: string | ((prev: string) => string)) => void]
export function useUrlState<T>(
  key: string,
  def: T,
  opts: { codec: Codec<T>; mode?: 'push' | 'replace' },
): [T, (valor: T | ((prev: T) => T)) => void]
export function useUrlState<T>(
  key: string,
  def: T,
  opts: { codec?: Codec<T>; mode?: 'push' | 'replace' } = {},
): [T, (valor: T | ((prev: T) => T)) => void] {
  const codec = (opts.codec ?? codecs.str) as Codec<T>
  const mode = opts.mode ?? 'replace'
  const crudo = useUrlSnapshot()

  /* Memoizado por el mismo motivo que `useUrlLocation`, y acá pesa más: los codecs de lista
     (`codecs.list`, `listOf`) devuelven un ARRAY NUEVO en cada parseo. Sin memo, un filtro multi
     cambia de identidad en cada render, y una vista que lo ponga en las deps de un `useEffect` con
     `setState` adentro entra en loop. `def` y `codec` quedan fuera de las deps: son literales del
     render (`''`, `[]`, `codecs.list`) y meterlos acá volvería a calcular `valor` en CADA render,
     deshaciendo el memo. Es seguro igual: acá arriba no se necesita el truco de ref que sí hace
     falta en `setValor` (más abajo), porque en esta app un `def` que cambia entre renders SIEMPRE lo
     hace por otro parámetro de la URL (el preset de Estadísticas, p. ej.), y ese cambio ya mueve
     `crudo` — así que este `useMemo` recalcula de todos modos y ve el `def` vigente. */
  const valor = useMemo(() => {
    const estado = parseHref(crudo)
    return estado ? readParam(estado.query, key, def, codec) : def
  }, [crudo, key])

  /* El setter (abajo) necesita el `def`/`codec` VIGENTES al momento de escribir, no los del render en
     que se creó — y a diferencia de `valor`, acá no hay ningún `crudo` que lo salve: el `useCallback`
     de más abajo tiene que quedar ESTABLE (varias vistas ponen el setter en las deps de un efecto), así
     que `def`/`codec` no pueden ir en sus deps. La salida es un ref actualizado en cada render: el
     setter sigue siendo la misma función siempre, pero lee estos valores frescos en vez de los que
     cerró la primera vez. Sin esto, leer y escribir podían usar defaults DISTINTOS — no se notaba
     porque hasta ahora todos los `def` de la app son literales estructuralmente iguales entre renders,
     pero la Fase E lo rompe: Estadísticas deriva `desde`/`hasta` de un default que cambia con el preset
     elegido, y el setter viejo seguía escribiendo contra el preset con el que se había montado. */
  const defCodecRef = useRef({ def, codec })
  defCodecRef.current = { def, codec }

  const setValor = useCallback(
    (nuevo: T | ((prev: T) => T)) => {
      const { def, codec } = defCodecRef.current
      const actual = parseHref(window.location.pathname + window.location.search)
      if (!actual) return
      /* Aceptamos el updater de `useState` (`setX(v => !v)`) y no sólo el valor: la firma promete ser
         la de `useState` y varias vistas tienen toggles escritos así. Se resuelve contra lo que hay
         en la URL AHORA —no contra el valor del render— por el mismo motivo por el que el resto de
         este setter relee `window.location`: dos actualizaciones seguidas tienen que componer. */
      const previo = readParam(actual.query, key, def, codec)
      /* `typeof nuevo === 'function'` es seguro ACÁ porque ningún `T` de este proyecto es invocable
         (son strings, arrays de strings, números y booleanos): si algún día se usa este hook con un
         `T` que sea función, este chequeo lo confundiría con un updater. No es el caso hoy. */
      const valorFinal = typeof nuevo === 'function' ? (nuevo as (prev: T) => T)(previo) : nuevo
      const siguiente: UrlState = { ...actual, query: writeParam(actual.query, key, valorFinal, def, codec) }
      if (mode === 'push') pushUrl(siguiente)
      else replaceUrl(siguiente)
    },
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
 * `|| null`?").
 *
 * ABRIR apila historial (`push`): el atrás del navegador cierra la entidad, que es lo que el usuario
 * espera del gesto. CERRAR reemplaza (`replace`), no apila: si cerrar también apilara, el historial
 * quedaría `[ficha, ficha?visita=X, ficha]` y el atrás REABRIRÍA el cajón que el usuario acaba de
 * cerrar — costaría dos "atrás" por cada visita abierta y cerrada. Por eso son DOS instancias de
 * `useUrlState` sobre la misma clave, una fija en cada modo: cada una ya trae resuelta la lectura del
 * query y la escritura con push/replace, así que no hay que reimplementar ese cableado acá — solo
 * elegir cuál `setValor` llamar según si `id` es `null`.
 *
 * El setter NO acepta updater (`(prev) => next`) como el de `useUrlState`: una entidad abierta se
 * ABRE o se CIERRA, no se transforma a partir de sí misma —no hay un `setEntidad(prev => ...)` con
 * sentido, porque abrir siempre necesita el id de afuera (el que se clickeó) y cerrar siempre es
 * `null`—. Si algún día aparece un caso que sí necesite leer el valor previo, se agrega ahí.
 *
 * Devuelve TRES elementos, no dos: el segundo (`abrir`) es para cuando el usuario ABRE algo con una
 * acción —apila, el atrás cierra, es la navegación de verdad—. El tercero (`moverA`) también escribe
 * un id pero en REPLACE, para los casos que no son "entrar" a la pantalla: moverse de una entidad a
 * otra sin salir de donde estás (el stepper ↑↓ de Visitas del día — recorrer quince visitas con el
 * segundo setter apilaba QUINCE entradas, y el atrás no sacaba de la pantalla, reabría la visita 14,
 * después la 13…) y resolver un `navTarget` que el shell YA apiló al traerte hasta acá (abrir ahí con
 * el segundo setter apila una SEGUNDA entrada y el atrás queda a mitad de camino — el mismo problema
 * que la Fase C ya había resuelto para `useUrlPath` con su `mode: 'replace'`, y que acá faltaba
 * resolver igual). `moverA` reusa `cerrar` tal cual —es el mismo `useUrlState` en modo replace sobre
 * esta clave— porque escribir un id con él hace exactamente lo mismo que abrir, solo que sin apilar.
 */
export function useUrlEntity(key: string): [
  string | null,
  (id: string | null) => void,
  (id: string | null) => void,
] {
  const [valor, abrir] = useUrlState(key, '', { mode: 'push' })
  const [, cerrar] = useUrlState(key, '', { mode: 'replace' })
  /* `useCallback` y no una flecha inline: `setValor` (el de `useUrlState`) ya está memoizado —según
     sus propios comentarios— justamente porque varias vistas lo van a poner en las deps de un efecto.
     Sin esto, `useUrlPath` (abajo) conservaba esa propiedad y `useUrlEntity` la perdía sin avisar: de
     los dos helpers, uno quedaba estable y el otro no. */
  const setEntidad = useCallback((id: string | null) => (id === null ? cerrar('') : abrir(id)), [abrir, cerrar])
  const moverA = useCallback((id: string | null) => cerrar(id ?? ''), [cerrar])
  return [valor || null, setEntidad, moverA]
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
export function useUrlPath(): [
  string[],
  (path: string[], opts?: { conservar?: string[]; mode?: 'push' | 'replace' }) => void,
] {
  const ubicacion = useUrlLocation()
  const path = useMemo(() => ubicacion?.path ?? [], [ubicacion])
  const setPath = useCallback(
    (siguiente: string[], opts: { conservar?: string[]; mode?: 'push' | 'replace' } = {}) => {
      /* Se relee la URL del momento en vez de cerrar sobre `ubicacion`: el setter suele viajar en las
         deps de un efecto y tiene que escribir sobre el estado de AHORA, no sobre el del render en que
         se creó. */
      const actual = parseHref(window.location.pathname + window.location.search)
      if (!actual) return
      const query = Object.fromEntries(
        Object.entries(actual.query).filter(([k]) => opts.conservar?.includes(k)),
      )
      const siguienteState = { ...actual, path: siguiente, query }
      /* `mode` existe por un caso puntual: cuando la vista está RESOLVIENDO un objetivo que le dejó el
         shell (un `navTarget` del buscador global), no está navegando — el shell ya apiló su entrada al
         traerte hasta acá. Apilar una segunda dejaría el "atrás" a mitad de camino: te devolvería a la
         grilla en vez de a la pantalla desde la que buscaste. Ahí va `replace`; en todo lo demás, `push`. */
      if (opts.mode === 'replace') replaceUrl(siguienteState)
      else pushUrl(siguienteState)
    },
    [],
  )
  return [path, setPath]
}
