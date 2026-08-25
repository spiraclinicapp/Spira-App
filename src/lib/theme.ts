/**
 * El tema, reducido a lo que de verdad es suyo: resolver una preferencia a claro/oscuro y pintarla
 * en el DOM.
 *
 * **La persistencia se mudó a `lib/prefs.tsx`** (migración 0093): el tema dejó de guardarse en
 * localStorage —donde era una preferencia de la MÁQUINA, compartida por todos los que se sientan en
 * esa computadora— y pasó a ser una preferencia de la CUENTA, junto con el formato de fecha y la
 * pantalla de arranque. Este archivo ya no guarda nada; `prefs.tsx` lo llama cuando corresponde y
 * mantiene el caché local que evita el parpadeo del primer frame.
 */

/** Tema efectivamente aplicado al shell (lo que se ve). */
export type Theme = 'light' | 'dark'
/** Preferencia del usuario. 'system' se resuelve contra prefers-color-scheme.
    Se persiste la PREFERENCIA (no el tema resuelto): si guardáramos el resuelto,
    'system' quedaría congelado al valor del momento y perdería su gracia. */
export type ThemePref = 'light' | 'dark' | 'system'

/** Media query del modo oscuro del sistema (null en entornos sin matchMedia).
    Exportada porque `prefs.tsx` la necesita para seguir al sistema en vivo. */
export function systemMql(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null
  return window.matchMedia('(prefers-color-scheme: dark)')
}

/** Resuelve una preferencia a un tema concreto (claro/oscuro). */
export function resolveTheme(pref: ThemePref): Theme {
  if (pref === 'system') return systemMql()?.matches ? 'dark' : 'light'
  return pref
}

/** Pinta una preferencia en `<html data-theme>`. No persiste nada — de eso se encarga `prefs.tsx`.
    Lo llama `main.tsx` antes del primer render (con el caché) para que no haya parpadeo. */
export function applyTheme(pref: ThemePref): void {
  document.documentElement.dataset.theme = resolveTheme(pref)
}
