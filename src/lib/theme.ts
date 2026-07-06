import { useCallback, useEffect, useState } from 'react'

/** Tema efectivamente aplicado al shell (lo que se ve). */
export type Theme = 'light' | 'dark'
/** Preferencia del usuario. 'system' se resuelve contra prefers-color-scheme.
    Se persiste la PREFERENCIA (no el tema resuelto): si guardáramos el resuelto,
    'system' quedaría congelado al valor del momento y perdería su gracia. */
export type ThemePref = 'light' | 'dark' | 'system'

const KEY = 'spira-theme'

/** Media query del modo oscuro del sistema (null en entornos sin matchMedia). */
function systemMql(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null
  return window.matchMedia('(prefers-color-scheme: dark)')
}

/** Lee la preferencia guardada. Default 'system': la primera vez respetamos el SO. */
export function getStoredPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'dark' || v === 'light' || v === 'system') return v
  } catch {
    /* almacenamiento no disponible */
  }
  return 'system'
}

/** Resuelve una preferencia a un tema concreto (claro/oscuro). */
export function resolveTheme(pref: ThemePref): Theme {
  if (pref === 'system') return systemMql()?.matches ? 'dark' : 'light'
  return pref
}

/** Aplica una preferencia: la resuelve, la pinta en <html data-theme> y persiste
    la PREFERENCIA. Lo llama main.tsx antes del primer render (evita parpadeo). */
export function applyTheme(pref: ThemePref): void {
  document.documentElement.dataset.theme = resolveTheme(pref)
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* almacenamiento no disponible — se ignora */
  }
}

/** Hook de tema. Devuelve:
    - `pref`  → la preferencia (claro/oscuro/sistema): la usa el segmented de Ajustes.
    - `theme` → el tema RESUELTO (claro/oscuro): lo usa el ícono del botón de la barra.
    - `setPref` → fija una preferencia explícita (incluye 'system').
    - `toggle` → alterna sobre lo que se VE (no sobre la preferencia): en modo 'system'
                 resuelto a oscuro, el botón ofrece 'claro', no 'oscuro'. */
export function useTheme(): {
  pref: ThemePref
  theme: Theme
  setPref: (pref: ThemePref) => void
  toggle: () => void
} {
  const [pref, setPrefState] = useState<ThemePref>(getStoredPref)
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme(getStoredPref()))

  const setPref = useCallback((next: ThemePref) => {
    applyTheme(next)
    setPrefState(next)
    setThemeState(resolveTheme(next))
  }, [])

  /* Con preferencia 'system', reaccionar en vivo si el SO cambia de claro a oscuro
     (sin este listener, 'sistema' sería un snapshot al montar, no "según tu sistema"). */
  useEffect(() => {
    if (pref !== 'system') return
    const mql = systemMql()
    if (!mql) return
    const onChange = () => {
      const next: Theme = mql.matches ? 'dark' : 'light'
      document.documentElement.dataset.theme = next
      setThemeState(next)
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [pref])

  const toggle = useCallback(() => {
    setPref(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setPref])

  return { pref, theme, setPref, toggle }
}
