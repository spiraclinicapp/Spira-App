import { AyudaDrawer } from './AyudaDrawer'
import type { useEstadoAyuda } from './AyudaProvider'
import { TutorialModal } from './TutorialModal'

/* ============================================================================
   Las capas de la Ayuda, en el orden en que se apilan: el panel y, ARRIBA de él, el reproductor (comparten
   `--spira-z-drawer`, y el orden del DOM decide). AppShell las pone ANTES del Feedback, así el «Contanos» del
   panel queda arriba de todo. Ver la cabecera de `AyudaProvider.tsx`.

   Desde el panel, el reproductor se abre con el panel DEBAJO, abierto: al cerrar el video, el foco vuelve a la
   fila desde la que se abrió (el `Modal` devuelve el foco a su disparador).
   ============================================================================ */

export function AyudaCapas({ estado, moduleKey, isAllowed, accent, onContanos }: {
  estado: ReturnType<typeof useEstadoAyuda>
  moduleKey: string
  isAllowed: (moduleKey: string) => boolean
  accent: string
  onContanos: (buscaba: string) => void
}) {
  const { api, panel, reproductor, memoria, cerrarPanel, cerrarReproductor } = estado
  const enReproduccion = reproductor ? api.tutoriales.find((t) => t.id === reproductor.id) ?? null : null

  return (
    <>
      {panel && (
        <AyudaDrawer
          /* La `key` lo remonta si piden otra cosa con el panel ya abierto: otra pregunta desde el buscador, o la
             pestaña Tutoriales desde el final del último video. Así arranca en lo pedido. */
          key={`${panel.preguntaId ?? 'panel'}-${panel.pestaña}`}
          moduleKey={moduleKey}
          isAllowed={isAllowed}
          accent={accent}
          preguntaInicial={panel.preguntaId}
          pestañaInicial={panel.pestaña}
          memoria={memoria}
          tutoriales={api.tutoriales}
          base={api.base}
          vistos={api.vistos}
          onAbrirTutorial={(id) => api.abrirTutorial(id)}
          onContanos={onContanos}
          onClose={cerrarPanel}
        />
      )}
      {enReproduccion && reproductor && (
        <TutorialModal
          key={`${reproductor.id}-${reproductor.segundo}`}
          inicial={enReproduccion}
          segundo={reproductor.segundo}
          tutoriales={api.tutoriales}
          base={api.base}
          onVisto={api.marcarVisto}
          onTodos={() => { cerrarReproductor(); api.abrirPanel({ pestaña: 'tutoriales' }) }}
          onClose={cerrarReproductor}
        />
      )}
    </>
  )
}
