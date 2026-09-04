/**
 * El modelo de las preferencias del usuario: qué valores existen y cómo se valida lo que llega.
 *
 * Aparte de `prefs.tsx` para poder testearlo — ese archivo trae React, el cliente de Supabase y el
 * contexto de auth, nada de lo cual se puede montar en un test de node. Acá solo hay datos y una
 * función pura, que es exactamente la parte que puede fallar sin que se note.
 */

/* `ThemePref` sigue viviendo en `theme.ts` —es de él, junto con `resolveTheme`— y se reexporta acá
   para que quien consuma las preferencias tenga los tres tipos en un solo import. Definirlo de nuevo
   compilaría igual (son estructuralmente idénticos) y sería una copia esperando a divergir. */
export type { ThemePref } from './theme'
import type { ThemePref } from './theme'

export type DateFormat = 'dmy' | 'iso' | 'dmesy'

/**
 * Dónde abre Spira al entrar y a dónde lleva el logo del top bar: la **clave de un módulo** del
 * shell, o `'ultimo'` (el último que usaste en esta máquina, que no es un módulo sino una regla).
 *
 * Nació con dos valores (`'inicio' | 'ultimo'`) y se abrió a los módulos el 2026-09-04, a pedido
 * del Director. `'inicio'` sigue siendo válido y sigue siendo el default porque **ya era una clave
 * de módulo**: no hubo que traducir ninguna fila.
 *
 * ⚠️ Esta lista está escrita en TRES lugares y los tres tienen que decir lo mismo: acá, el
 * `check` de `user_preferences.home_view` (migración 0105) y `MODULES` en `modules/registry.ts`.
 * Un módulo nuevo en el registro no se puede elegir como inicio hasta que entre en las otras dos.
 * Es el costo que la 0093 aceptó a propósito al tipar cada preferencia en vez de usar un `jsonb`.
 * Que el valor sea *elegible* es otra pregunta, y la contesta `modulosElegibles` en `home.ts`:
 * acá sólo decimos qué se admite guardar.
 */
export type HomeView = 'ultimo' | 'inicio' | 'track' | 'pharma' | 'lab' | 'contable'

export interface Prefs {
  theme: ThemePref
  dateFormat: DateFormat
  homeView: HomeView
}

/** Los defaults son el comportamiento VIGENTE antes de esta feature: nadie ve un cambio por el
    solo hecho de que esto exista. Espejo de los `default` de la migración 0093. */
export const PREFS_DEFAULT: Prefs = { theme: 'light', dateFormat: 'dmy', homeView: 'inicio' }

const THEMES: ThemePref[] = ['light', 'dark', 'system']
const FORMATS: DateFormat[] = ['dmy', 'iso', 'dmesy']
const HOMES: HomeView[] = ['ultimo', 'inicio', 'track', 'pharma', 'lab', 'contable']

/**
 * Valida un objeto cualquiera —una fila de la base, un JSON del caché, la respuesta de una versión
 * vieja— contra los valores admitidos, campo por campo. Lo que no reconoce cae a su default.
 *
 * Se testea porque falla en silencio: dejar pasar un valor inválido no rompe nada, simplemente hace
 * que la app se comporte de una manera que nadie eligió. Un `theme: 'oscuro'` (en castellano, que es
 * el error natural) tiene que caer a 'light' y no dejar el tema en un estado que ningún control de
 * la pantalla puede representar.
 */
export function parsePrefs(raw: unknown): Prefs {
  if (typeof raw !== 'object' || raw === null) return PREFS_DEFAULT
  const o = raw as Record<string, unknown>
  const uno = <T extends string>(valor: unknown, validos: T[], def: T): T =>
    (typeof valor === 'string' && (validos as string[]).includes(valor) ? (valor as T) : def)
  return {
    /* Se aceptan las dos formas de nombrar cada campo: la de la base (snake_case, como llega de
       PostgREST) y la del front (camelCase, como quedó en el caché). Así una y otra fuente entran
       por la misma puerta y no hay dos parseos que puedan divergir. */
    theme: uno(o.theme, THEMES, PREFS_DEFAULT.theme),
    dateFormat: uno(o.dateFormat ?? o.date_format, FORMATS, PREFS_DEFAULT.dateFormat),
    homeView: uno(o.homeView ?? o.home_view, HOMES, PREFS_DEFAULT.homeView),
  }
}
