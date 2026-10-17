import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { MODULES } from '../modules/registry'
import { baseDeTutoriales, publicados, visiblesPara } from './catalogo'
import type { Meta, Publicado } from './catalogo'
import META from './tutoriales.meta.json'
import { TUTORIALES } from './tutoriales'
import { leerVistos, marcarVisto as guardarVisto } from './visto'

/* ============================================================================
   El estado de la Ayuda: el panel, el reproductor y los «vistos». Plan: docs/plan-tutoriales.md, «Capas y
   foco» (DD8a: un solo dueño en AppShell).

   ── POR QUÉ UN HOOK EN AppShell Y NO UN PROVIDER QUE ENVUELVA ──
   Las capas tienen un orden que importa: el panel y el reproductor van ANTES del Feedback en el DOM (comparten
   `--spira-z-drawer` y el orden decide quién queda arriba), y el Feedback lo monta el shell. Un provider que
   dibujara sus capas al final las pondría DESPUÉS del Feedback, y el «Contanos» del panel abriría el Feedback
   debajo del panel. Por eso el estado vive en `useEstadoAyuda` (llamado desde AppShell), el shell coloca
   `<AyudaCapas>` donde corresponde, y el contexto sólo reparte las acciones a quien las necesite adentro de la
   app (la píldora del título; en T5b, la tarjeta de `Pistas`).

   ── NADA SE MONTA ADENTRO DE OTRA CAPA ──
   El fondo del `Drawer` lleva `backdropFilter`, que encierra a cualquier hijo `position: fixed` en sus 440 px.
   Panel, reproductor y Feedback son hermanos; el reproductor va después del panel, así queda arriba.
   ============================================================================ */

export type PestañaAyuda = 'preguntas' | 'tutoriales'

export interface AyudaApi {
  /** Los tutoriales publicados que este usuario ve, en el orden del catálogo. Vacío hasta el primer video. */
  tutoriales: Publicado[]
  /** De dónde se bajan los videos (el Storage del proyecto de la app). */
  base: string
  vistos: ReadonlySet<string>
  marcarVisto: (id: string) => void
  abrirPanel: (o?: { pestaña?: PestañaAyuda; preguntaId?: string | null }) => void
  /** Abre el reproductor. `segundo` = arrancar ahí («Ver en grande» sigue donde iba la tarjeta). */
  abrirTutorial: (id: string, o?: { segundo?: number }) => void
}

const AyudaContext = createContext<AyudaApi | null>(null)
export const AyudaContextProvider = AyudaContext.Provider

/** Para las piezas de adentro de la app. Afuera del shell (el login) no hay Ayuda: devuelve null. */
export function useAyuda(): AyudaApi | null {
  return useContext(AyudaContext)
}

export interface EstadoPanel { preguntaId: string | null; pestaña: PestañaAyuda }
export interface EstadoReproductor { id: string; segundo: number }

/** Lo que el panel recuerda entre una apertura y otra, dentro de la sesión (plan: pestaña y alcance; la búsqueda no). */
export interface MemoriaPanel { pestaña: PestañaAyuda; todos: boolean | null }

export function useEstadoAyuda(isAllowed: (moduleKey: string) => boolean, supabaseUrl: string, uid: string | null) {
  /* Depende de QUÉ módulos tiene la persona y no de la identidad de `isAllowed`: en AppShell es una función
     nueva en cada redibujo, y con ella la lista (y el contexto entero) cambiaría en cada render del shell. */
  const permitidos = MODULES.map((m) => m.key).filter(isAllowed).join(',')
  const tutoriales = useMemo(
    () => visiblesPara(publicados(TUTORIALES, META as Meta), (k) => permitidos.split(',').includes(k)),
    [permitidos],
  )
  const base = useMemo(() => baseDeTutoriales(supabaseUrl), [supabaseUrl])
  /* Por usuario (`visto.ts`): si en la misma pestaña entra otra persona, se relee lo suyo. */
  const [vistos, setVistos] = useState<ReadonlySet<string>>(() => leerVistos(uid))
  useEffect(() => { setVistos(leerVistos(uid)) }, [uid])
  const [panel, setPanel] = useState<EstadoPanel | null>(null)
  const [reproductor, setReproductor] = useState<EstadoReproductor | null>(null)
  const memoria = useRef<MemoriaPanel>({ pestaña: 'preguntas', todos: null })

  /* Se suma a lo que hay en memoria y no se reemplaza por lo guardado: sin almacenamiento (o sin usuario), lo
     guardado está vacío y reemplazar borraba lo visto antes en esta misma pestaña. Guardar es idempotente, así que
     el doble llamado del modo estricto no cambia nada. */
  const marcarVisto = useCallback((id: string) => {
    setVistos((prev) => {
      if (prev.has(id)) return prev
      guardarVisto(id, uid)
      return new Set([...prev, id])
    })
  }, [uid])
  const abrirPanel = useCallback((o: { pestaña?: PestañaAyuda; preguntaId?: string | null } = {}) => {
    // Una pregunta pedida (desde el buscador) se muestra en Preguntas, aunque la última vez quedara en Tutoriales.
    const pestaña = o.preguntaId ? 'preguntas' : o.pestaña ?? memoria.current.pestaña
    setPanel({ preguntaId: o.preguntaId ?? null, pestaña })
  }, [])
  const abrirTutorial = useCallback((id: string, o: { segundo?: number } = {}) => {
    setReproductor({ id, segundo: o.segundo ?? 0 })
  }, [])
  /* Estables a propósito: el Drawer vuelve a correr su efecto de foco cada vez que cambia `onClose`, y una
     función nueva en cada redibujo del shell le movía el foco a quien estuviera escribiendo en el buscador. */
  const cerrarPanel = useCallback(() => setPanel(null), [])
  const cerrarReproductor = useCallback(() => setReproductor(null), [])

  const api = useMemo<AyudaApi>(() => ({ tutoriales, base, vistos, marcarVisto, abrirPanel, abrirTutorial }),
    [tutoriales, base, vistos, marcarVisto, abrirPanel, abrirTutorial])

  return { api, panel, reproductor, memoria, cerrarPanel, cerrarReproductor }
}
