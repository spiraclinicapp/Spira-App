import { AyudaPanel } from './AyudaPanel'
import type { useEstadoAyuda } from './AyudaProvider'

/* ============================================================================
   La capa de la Ayuda: el panel. AppShell la pone ANTES del Feedback, así el «Contanos» del panel queda arriba
   de todo (ver la cabecera de `AyudaProvider.tsx`). Desde la Ayuda v2 el video se mira adentro del panel: el
   reproductor aparte (`TutorialModal`) ya no existe.
   ============================================================================ */

export function AyudaCapas({ estado, vista, isAllowed, onContanos }: {
  estado: ReturnType<typeof useEstadoAyuda>
  /** La pantalla donde está el usuario, `"<modulo>/<sub>"`. */
  vista: string | null
  isAllowed: (moduleKey: string) => boolean
  onContanos: (buscaba: string) => void
}) {
  const { api, panel, cerrarPanel } = estado
  if (!panel) return null
  return (
    <AyudaPanel
      /* La `clave` lo remonta si piden otra cosa con el panel ya abierto (otra pregunta desde el buscador, otro
         tutorial desde la bajada): así arranca en lo pedido y no en lo que quedó. */
      key={panel.clave}
      isAllowed={isAllowed}
      vista={vista}
      tutoriales={api.tutoriales}
      base={api.base}
      vistos={api.vistos}
      onVisto={api.marcarVisto}
      inicial={panel}
      onContanos={onContanos}
      onClose={cerrarPanel}
    />
  )
}
