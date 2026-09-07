import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './auth'
import { aEntry, fetchPlatforms } from '../data/platforms'
import type { PlatformRow } from '../data/platforms'
import { PLATFORMS_SEED, setPlatformCatalog } from '../views/track/procedimientos/reportes'

/* ============================================================================
   El catálogo de plataformas, traído una vez y compartido.

   ── POR QUÉ UN PROVIDER Y UNA VARIABLE DE MÓDULO A LA VEZ ──
   `platformMeta()` se llama desde funciones puras y desde `.map()`s en cinco lugares, así que el
   dato tiene que ser accesible SIN un hook — de ahí la variable de módulo de `reportes.ts`. Pero
   una variable de módulo sola no es reactiva: cambiarla no repinta nada.

   El par resuelve las dos mitades. Este provider escribe la variable (`setPlatformCatalog`) Y
   guarda las filas en su propio estado, así que cuando la consulta llega, el subárbol re-renderiza
   y todos los `platformMeta(...)` se recalculan con el catálogo nuevo. Es exactamente lo que hace
   `prefs.tsx` con `setDateFormat` de `lib/dates.ts`.

   ── LO QUE SE VE MIENTRAS TANTO ──
   El respaldo de `reportes.ts`: las cinco plataformas de siempre, sin URL. No hay parpadeo salvo
   que la base diga algo distinto —una plataforma nueva, o una URL cargada—, y en ese caso el
   parpadeo ES la información.

   ── SI FALLA ──
   No rompe nada: el respaldo sigue en pie y la app funciona como antes de la 0111, sin URLs. El
   error se guarda para que Ajustes › Plataformas pueda explicarlo; ninguna otra pantalla lo mira,
   porque en ninguna otra es un problema que el usuario pueda resolver.
   ============================================================================ */

interface PlatformsState {
  /** El catálogo entero, activas y retiradas, tal como vino de la base. */
  filas: PlatformRow[]
  cargando: boolean
  /** Mensaje en castellano, o `null`. Sólo lo mira la sección de Ajustes. */
  error: string | null
  /** Vuelve a traer el catálogo y a repartirlo. Lo llama la sección al guardar. */
  refrescar: () => Promise<void>
}

const PlatformsContext = createContext<PlatformsState | undefined>(undefined)

export function PlatformsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user?.id ?? null

  const [filas, setFilas] = useState<PlatformRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const traer = useCallback(async () => {
    setCargando(true)
    const { data, error: err } = await fetchPlatforms()
    setError(err)
    if (data) {
      setFilas(data)
      /* Repartir ANTES de bajar `cargando`: el re-render que dispara `setCargando(false)` ya tiene
         que encontrar la variable de módulo con el catálogo nuevo, o los `platformMeta()` de ese
         render usarían todavía el respaldo y habría un repintado de más. */
      setPlatformCatalog(data.map(aEntry))
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    if (!userId) return
    void traer()
  }, [userId, traer])

  /* Al cerrar sesión, el catálogo vuelve al respaldo. Es higiene, no seguridad —los nombres de los
     portales no son dato sensible—: si la próxima sesión es de otra persona en la misma máquina,
     no arranca mirando el catálogo de la anterior antes de que llegue el suyo. */
  useEffect(() => {
    if (userId) return
    setPlatformCatalog(PLATFORMS_SEED)
    setFilas([])
  }, [userId])

  return (
    <PlatformsContext.Provider value={{ filas, cargando, error, refrescar: traer }}>
      {children}
    </PlatformsContext.Provider>
  )
}

export function usePlatforms(): PlatformsState {
  const ctx = useContext(PlatformsContext)
  if (!ctx) throw new Error('usePlatforms debe usarse dentro de <PlatformsProvider>')
  return ctx
}
