import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { setDateFormat } from './dates'
import { applyTheme, resolveTheme, systemMql } from './theme'
import type { Theme } from './theme'
import { parsePrefs, PREFS_DEFAULT } from './prefsModel'
import type { Prefs } from './prefsModel'

export { parsePrefs, PREFS_DEFAULT } from './prefsModel'
export type { DateFormat, HomeView, Prefs, ThemePref } from './prefsModel'

/* ============================================================================
   Preferencias del usuario (Ajustes › Preferencias), migración 0093.

   LA VERDAD ES LA CUENTA, NO LA MÁQUINA. El tema se guardaba en localStorage y "funcionaba", pero
   en una clínica donde dos coordinadoras comparten la computadora eso significa que comparten las
   preferencias: la que entra segunda hereda el tema de la primera. Ahora la fuente de verdad es
   `user_preferences`, y localStorage queda como CACHÉ: sirve para pintar el primer frame sin
   parpadeo (antes de que haya sesión siquiera) y como red de contención si la base no responde.

   DEGRADACIÓN: si la tabla todavía no existe —el front nuevo desplegado antes de aplicar la 0093—
   el provider cae a modo local y sigue funcionando exactamente como antes, sin un error en la cara.
   Es la misma estrategia que usa `auth.tsx` con las columnas de la 0045.
   ========================================================================== */


const CACHE_KEY = 'spira:prefs'
/** Clave del tema anterior a la 0093. Se lee una vez para no perder la elección que ya hizo la
    gente en su máquina; después manda la cuenta. */
const LEGACY_THEME_KEY = 'spira-theme'



/** Lee el caché local. Incluye la migración del tema viejo (`spira-theme`), una sola vez. */
export function readCache(): Prefs {
  try {
    const crudo = localStorage.getItem(CACHE_KEY)
    if (crudo) return parsePrefs(JSON.parse(crudo))
    const legacy = localStorage.getItem(LEGACY_THEME_KEY)
    if (legacy) return parsePrefs({ theme: legacy })
  } catch {
    /* almacenamiento no disponible o JSON roto: los defaults sirven igual */
  }
  return PREFS_DEFAULT
}

/* ─── El último módulo usado ───
   Va en localStorage y NO en la tabla, a propósito: no es una preferencia sino un rastro de por
   dónde ibas, y tiene sentido POR MÁQUINA. En el escritorio de farmacia querés volver a Farmacia
   aunque en la sala de coordinación uses Coordinación con la misma cuenta. La preferencia (si
   arrancar en Inicio o en el último) sí es de la cuenta; el último módulo concreto, no. */
const LAST_MODULE_KEY = 'spira:ultimo-modulo'

export function readLastModule(): string | null {
  try {
    return localStorage.getItem(LAST_MODULE_KEY)
  } catch {
    return null
  }
}

export function writeLastModule(moduleKey: string): void {
  try {
    localStorage.setItem(LAST_MODULE_KEY, moduleKey)
  } catch {
    /* almacenamiento no disponible — se pierde el rastro, no pasa nada grave */
  }
}

function writeCache(p: Prefs): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(p))
  } catch {
    /* almacenamiento no disponible — se ignora, la verdad está en la base */
  }
}

interface PrefsState {
  prefs: Prefs
  /** El tema RESUELTO (claro/oscuro): lo usa el ícono del botón de la barra. */
  theme: Theme
  /** Guarda un subconjunto de preferencias. Devuelve el error, o null. */
  savePrefs: (cambios: Partial<Prefs>) => Promise<{ error: string | null }>
  /** Atajo del botón de la top bar: alterna sobre lo que SE VE, no sobre la preferencia. */
  toggleTheme: () => void
  /** true = la 0093 todavía no está aplicada; las preferencias no salen de esta máquina. */
  soloLocal: boolean
}

const PrefsContext = createContext<PrefsState | undefined>(undefined)

export function PrefsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user?.id ?? null

  const [prefs, setPrefs] = useState<Prefs>(readCache)
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(readCache().theme))
  const [soloLocal, setSoloLocal] = useState(false)

  /* ─── Por qué el formato de fecha recarga la app ───
     `dates.ts` guarda el formato en una variable de módulo, así que `formatAR` no es reactiva: un
     re-render la vuelve a llamar y toma el valor nuevo, pero hay UI que no se re-renderiza aunque
     el árbol entero lo haga. El caso concreto: varias vistas registran su encabezado con
     `setHeader({ content: <DateNavButton …/> })` desde un efecto, o sea guardan un ELEMENTO YA
     CONSTRUIDO en el estado del shell; ese elemento queda congelado hasta que el efecto vuelva a
     correr por sus propias deps (el día, el acento), y el formato no está entre ellas. Resultado:
     la mitad de las fechas cambiaban y la otra mitad no, hasta que el usuario navegara.
     Y aunque se resolviera eso, quedan formateadores ad-hoc fuera de `dates.ts` (ver TODOS.md,
     "converger el formateo de fecha") que tampoco lo respetarían.
     Recargar es la única salida que deja TODA la app en el mismo formato al mismo tiempo. Es
     aceptable porque es una acción rara y deliberada, y porque desde que Ajustes vive en la URL la
     recarga te devuelve exactamente donde estabas, con Ajustes abierto en Preferencias.
     El caché SIEMPRE se escribe antes de recargar (lo hace `aplicar`), así que al volver `main.tsx`
     pinta el formato nuevo y no hay forma de entrar en un ciclo de recargas. */
  const formatoAlArrancar = useRef(readCache().dateFormat)

  /* Aplica una preferencia a los tres lugares donde se nota: el DOM (tema), la variable de módulo
     de `dates.ts` (formato de fecha) y el caché. El re-render que hace que las fechas ya pintadas
     cambien de formato lo dispara el `setPrefs` de abajo, no esto: `dates.ts` no es reactivo, pero
     todo lo que lo consume cuelga de este provider. */
  const aplicar = useCallback((p: Prefs) => {
    applyTheme(p.theme)
    setDateFormat(p.dateFormat)
    setTheme(resolveTheme(p.theme))
    writeCache(p)
  }, [])

  /* Traer las preferencias de la cuenta al haber sesión. Mientras tanto se ve el caché, que es lo
     que main.tsx ya pintó: no hay parpadeo salvo que la cuenta diga algo distinto de esta máquina,
     y en ese caso el parpadeo ES la información (estas no son tus preferencias). */
  useEffect(() => {
    if (!userId) return
    let activo = true
    void (async () => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('theme, date_format, home_view')
        .eq('user_id', userId)
        .maybeSingle()
      if (!activo) return
      if (error) {
        /* La tabla no existe todavía (front desplegado antes de la 0093): modo local, sin ruido.
           Cualquier otro error también cae acá y tiene el mismo remedio — seguir con lo que hay en
           esta máquina es siempre mejor que dejar al usuario sin tema. */
        setSoloLocal(true)
        return
      }
      if (data) {
        const p = parsePrefs(data)
        setPrefs(p)
        aplicar(p)
        /* La cuenta dice un formato distinto del que esta máquina venía usando: es la primera vez
           que entrás acá, o lo cambiaste desde otra computadora. `aplicar` ya dejó el caché al día,
           así que recargar es seguro y hace que los encabezados ya registrados no queden con el
           formato viejo (ver la nota larga de arriba). */
        if (p.dateFormat !== formatoAlArrancar.current) {
          formatoAlArrancar.current = p.dateFormat
          window.location.reload()
          return
        }
      } else {
        /* Sin fila: primera vez de esta persona. Se sube lo que tenga esta máquina (que puede ser
           el tema que ya venía eligiendo antes de la 0093) en vez de imponerle los defaults. */
        const local = readCache()
        await supabase.from('user_preferences').upsert({
          user_id: userId, theme: local.theme, date_format: local.dateFormat, home_view: local.homeView,
        })
      }
    })()
    return () => { activo = false }
  }, [userId, aplicar])

  /* Con preferencia 'system', seguir al sistema operativo en vivo. Sin este listener, 'sistema'
     sería un snapshot al montar y no "según tu sistema". */
  useEffect(() => {
    if (prefs.theme !== 'system') return
    const mql = systemMql()
    if (!mql) return
    const onChange = () => {
      const next: Theme = mql.matches ? 'dark' : 'light'
      document.documentElement.dataset.theme = next
      setTheme(next)
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [prefs.theme])

  /* El valor previo, para poder volver atrás si la escritura falla. Va en un ref y no en el estado
     porque no se dibuja: es solo memoria del optimismo. */
  const previo = useRef<Prefs>(prefs)

  const savePrefs = useCallback<PrefsState['savePrefs']>(async (cambios) => {
    const siguiente = { ...prefs, ...cambios }
    previo.current = prefs

    // Optimista: el control responde en el acto. Si la escritura falla, se revierte abajo.
    setPrefs(siguiente)
    aplicar(siguiente)

    // Sin cuenta o sin tabla, el caché es todo: no hay nada que escribir, pero el formato de fecha
    // igual necesita su recarga para que la app quede pareja.
    if (!userId || soloLocal) {
      if (siguiente.dateFormat !== previo.current.dateFormat) {
        formatoAlArrancar.current = siguiente.dateFormat
        window.location.reload()
      }
      return { error: null }
    }

    const { error } = await supabase.from('user_preferences').upsert({
      user_id: userId,
      theme: siguiente.theme,
      date_format: siguiente.dateFormat,
      home_view: siguiente.homeView,
    })

    if (error) {
      /* Se revierte de verdad — control incluido. Dejar el control mostrando algo que no se guardó
         es la clase de mentira chica que este proyecto no acepta: el usuario se iría creyendo que
         eligió una cosa y volvería mañana a encontrar otra. */
      setPrefs(previo.current)
      aplicar(previo.current)
      return { error: 'No pudimos guardar la preferencia. Probá de nuevo en un momento.' }
    }

    /* Guardado y confirmado: si lo que cambió fue el formato de fecha, recargamos para que la app
       entera quede en el mismo formato (ver la nota larga arriba). El caché ya está escrito, así
       que al volver se pinta el formato nuevo desde el primer frame. */
    if (siguiente.dateFormat !== previo.current.dateFormat) {
      formatoAlArrancar.current = siguiente.dateFormat
      window.location.reload()
    }
    return { error: null }
  }, [prefs, userId, soloLocal, aplicar])

  const toggleTheme = useCallback(() => {
    void savePrefs({ theme: theme === 'dark' ? 'light' : 'dark' })
  }, [theme, savePrefs])

  const value = useMemo<PrefsState>(
    () => ({ prefs, theme, savePrefs, toggleTheme, soloLocal }),
    [prefs, theme, savePrefs, toggleTheme, soloLocal],
  )

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export function usePrefs(): PrefsState {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs debe usarse dentro de <PrefsProvider>')
  return ctx
}
