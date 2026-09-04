/**
 * A dónde te lleva Spira: qué módulo abre al entrar y a dónde va el logo del top bar.
 *
 * Vive acá —y no adentro de `AppShell`— porque son reglas PURAS, sin React ni Supabase, y son
 * exactamente la clase de cosa que falla **en silencio**: si el destino se resuelve mal, la app no
 * se ve rota, simplemente te deja en un lugar que no elegiste. Y si la degradación falla, te deja
 * en un módulo al que no tenés acceso, que es peor: la pantalla dice "no tenés acceso" apenas
 * entrás, como si el sistema estuviera roto.
 *
 * El catálogo de módulos se INYECTA en vez de importar `MODULES` acá: mismo criterio que
 * `describeAccess` en `roles.ts`, para poder probar estas reglas con un catálogo controlado y no
 * contra los módulos que existan hoy.
 */

import type { HomeView } from './prefsModel'

/** Lo que estas reglas necesitan saber de un módulo. Estructural a propósito: `ModuleDef` trae
 *  acentos, íconos y descriptores que acá no pintan nada. */
export interface ModuloDeInicio {
  key: string
  name: string
  /** Módulo todavía no construido: nadie lo puede abrir, tenga el rol que tenga. */
  proximamente?: boolean
  submodules: { key: string }[]
}

/** La clave del módulo home. Es el único que no pide rol: lo tiene todo el mundo por definición
 *  del shell, y por eso es también el destino de reserva cuando lo elegido ya no se puede abrir. */
export const MODULO_HOME = 'inicio'

/** El valor de `homeView` que NO es un módulo: "seguime a donde estuve". */
export const HOME_ULTIMO = 'ultimo'

/**
 * ¿Esta persona puede ABRIR este módulo?
 *
 * Era una función local de `AppShell` (`isAllowed`) y se mudó acá cuando Preferencias necesitó la
 * misma respuesta para armar su desplegable. Tenerla escrita dos veces es la clase de duplicación
 * que se desincroniza sin que nada deje de compilar — y de los dos lados gobierna un acceso.
 */
export function moduloHabilitado(
  key: string,
  userModules: readonly string[],
  modulos: readonly ModuloDeInicio[],
): boolean {
  if (key === MODULO_HOME) return true
  const m = modulos.find((x) => x.key === key)
  if (!m || m.proximamente) return false
  return userModules.includes(key)
}

/**
 * Los módulos que se pueden elegir como pantalla de inicio: los que esta persona puede abrir.
 *
 * Incluye Inicio, que siempre está y es el default. NO incluye "el último que usé": eso no es un
 * módulo sino una regla, y quien arma el control la agrega aparte — mezclarlas acá obligaría a esta
 * función a devolver una opción que no tiene módulo detrás.
 */
export function modulosElegibles(
  userModules: readonly string[],
  modulos: readonly ModuloDeInicio[],
): { key: string; name: string }[] {
  return modulos
    .filter((m) => moduloHabilitado(m.key, userModules, modulos))
    .map((m) => ({ key: m.key, name: m.name }))
}

/**
 * El destino de inicio, ya resuelto a una pantalla concreta.
 *
 * **Siempre devuelve un destino que se puede abrir.** Ese es el contrato entero, y el motivo por el
 * que esto es una función y no un `if` en el `onClick` del logo: el valor guardado puede haber
 * envejecido de tres maneras distintas —te revocaron el módulo, el rastro del último apunta a algo
 * que ya no existe, o la fila trae un valor que esta versión no conoce— y en las tres el usuario
 * tiene que terminar en Inicio, no en un cartel de "no tenés acceso".
 *
 * `ultimo` es el rastro por MÁQUINA que guarda `prefs.tsx` en localStorage (ver el porqué allá):
 * se lee sólo cuando la preferencia es `'ultimo'`.
 *
 * PASARLE `ultimo: null` A PROPÓSITO es la forma de decir "no sigas el rastro", y así lo usa el
 * logo del top bar: `'ultimo'` describe dónde ABRIR la sesión, y como el rastro se reescribe en
 * cada cambio de módulo, un logo que lo siguiera llevaría siempre al módulo donde ya estás parado
 * — un botón que no hace nada. Con `null`, esa preferencia cae por la misma puerta que todo lo
 * demás y el logo vuelve a Inicio, que es lo que hacía siempre.
 */
export function resolveHome(
  homeView: HomeView,
  ultimo: string | null,
  userModules: readonly string[],
  modulos: readonly ModuloDeInicio[],
): { moduleKey: string; subKey: string } {
  const destino = homeView === HOME_ULTIMO ? ultimo : homeView
  const elegido = destino ? modulos.find((m) => m.key === destino) : undefined

  if (elegido && elegido.submodules[0] && moduloHabilitado(elegido.key, userModules, modulos)) {
    return { moduleKey: elegido.key, subKey: elegido.submodules[0].key }
  }

  /* La reserva. `MODULO_HOME` primero y `modulos[0]` después: en el registro real son el mismo, pero
     un catálogo sin Inicio no puede tumbar la navegación entera. Si ni eso hay, el destino vacío es
     preferible a inventar una clave — quien llame cae a su propio default (en el shell, la URL
     inválida ya tiene su pantalla). */
  const reserva = modulos.find((m) => m.key === MODULO_HOME) ?? modulos[0]
  return { moduleKey: reserva?.key ?? MODULO_HOME, subKey: reserva?.submodules[0]?.key ?? '' }
}
