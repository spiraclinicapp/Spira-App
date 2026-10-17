import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { MODULES } from '../modules/registry'
import { baseDeTutoriales, publicados, visiblesPara } from './catalogo'
import type { Meta, Publicado } from './catalogo'
import type { PestañaPanel } from './panel'
import { PREGUNTAS } from './preguntas'
import META from './tutoriales.meta.json'
import { TUTORIALES } from './tutoriales'
import { leerVistos, marcarVisto as guardarVisto } from './visto'

/* ============================================================================
   El estado de la Ayuda: el panel y los «vistos». Plan: docs/plan-tutoriales.md, «Capas y foco» (DD8a: un solo
   dueño en AppShell); desde la Ayuda v2 (docs/plan-ayuda-manual.md, E2) el video se mira ADENTRO del panel y ya
   no hay un reproductor aparte.

   ── POR QUÉ UN HOOK EN AppShell Y NO UN PROVIDER QUE ENVUELVA ──
   Las capas tienen un orden que importa: el panel va ANTES del Feedback en el DOM (comparten `--spira-z-drawer` y
   el orden decide quién queda arriba), y el Feedback lo monta el shell. Un provider que dibujara su capa al final
   la pondría DESPUÉS del Feedback, y el «Contanos» del panel abriría el Feedback debajo del panel. Por eso el
   estado vive en `useEstadoAyuda` (llamado desde AppShell), el shell coloca `<AyudaCapas>` donde corresponde, y
   el contexto sólo reparte las acciones a quien las necesite adentro de la app (la píldora del título y la
   tarjeta de `Pistas`, por `puente.ts`).

   ── A DÓNDE ABRE ──
   · `abrirPanel()` (el «?» del riel, el menú de la cuenta): en Inicio.
   · `abrirPanel({ preguntaId })` (el buscador global): en la pestaña del módulo de la pregunta, con la pregunta
     abierta y, si su tutorial está publicado, ese tutorial cargado (así la pregunta aparece debajo de su video).
   · `abrirTutorial(id, { segundo })` (la bajada, el globo, el buscador): en la pestaña del módulo del tutorial,
     con ese tutorial cargado; con `segundo`, arranca a reproducir desde ahí («Ver en grande» de la tarjeta).
   ============================================================================ */

export interface AyudaApi {
  /** Los tutoriales publicados que este usuario ve, en el orden del catálogo. Vacío hasta el primer video. */
  tutoriales: Publicado[]
  /** De dónde se bajan los videos (el Storage del proyecto de la app). */
  base: string
  vistos: ReadonlySet<string>
  marcarVisto: (id: string) => void
  abrirPanel: (o?: { preguntaId?: string | null }) => void
  abrirTutorial: (id: string, o?: { segundo?: number }) => void
}

const AyudaContext = createContext<AyudaApi | null>(null)
export const AyudaContextProvider = AyudaContext.Provider

/** Para las piezas de adentro de la app. Afuera del shell (el login) no hay Ayuda: devuelve null. */
export function useAyuda(): AyudaApi | null {
  return useContext(AyudaContext)
}

/** Con qué abre el panel. `clave` cambia en cada pedido: remonta el panel si ya estaba abierto (arranca en lo pedido). */
export interface EstadoPanel {
  pestaña: PestañaPanel
  tutorialId: string | null
  preguntaId: string | null
  /** Arrancar a reproducir desde este segundo. 0 = no reproducir solo. */
  segundo: number
  clave: number
}

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

  const abrirPanel = useCallback((o: { preguntaId?: string | null } = {}) => {
    const pregunta = o.preguntaId ? PREGUNTAS.find((p) => p.id === o.preguntaId) : undefined
    const tutorialId = pregunta?.tutorial && tutoriales.some((t) => t.id === pregunta.tutorial) ? pregunta.tutorial : null
    setPanel((prev) => ({
      pestaña: pregunta?.modulo ?? 'inicio',
      tutorialId,
      preguntaId: pregunta?.id ?? null,
      segundo: 0,
      clave: (prev?.clave ?? 0) + 1,
    }))
  }, [tutoriales])

  const abrirTutorial = useCallback((id: string, o: { segundo?: number } = {}) => {
    const tutorial = tutoriales.find((t) => t.id === id)
    if (!tutorial) return
    setPanel((prev) => ({
      pestaña: tutorial.modulo,
      tutorialId: id,
      preguntaId: null,
      segundo: o.segundo ?? 0,
      clave: (prev?.clave ?? 0) + 1,
    }))
  }, [tutoriales])

  /* Estable a propósito: el Drawer vuelve a correr su efecto de foco cada vez que cambia `onClose`, y una
     función nueva en cada redibujo del shell le movía el foco a quien estuviera escribiendo en el buscador. */
  const cerrarPanel = useCallback(() => setPanel(null), [])

  const api = useMemo<AyudaApi>(() => ({ tutoriales, base, vistos, marcarVisto, abrirPanel, abrirTutorial }),
    [tutoriales, base, vistos, marcarVisto, abrirPanel, abrirTutorial])

  return { api, panel, cerrarPanel }
}
