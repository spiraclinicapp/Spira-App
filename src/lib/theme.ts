import { useCallback, useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'spira-theme'

/** Lee la preferencia guardada (default: claro). */
export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Aplica el tema al <html> (data-theme) y lo persiste. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* almacenamiento no disponible — se ignora */
  }
}

/** Hook de tema: devuelve el tema actual y un toggle claro/oscuro. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)
  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      return next
    })
  }, [])
  return { theme, toggle }
}
