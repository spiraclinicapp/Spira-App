import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../components/Icon'
import { usePopover } from '../components/usePopover'
import { useAyuda } from './AyudaProvider'
import { duracionCorta, duracionHablada } from './catalogo'
import type { Publicado } from './catalogo'
import { TarjetaTutorial } from './TarjetaTutorial'

/* ============================================================================
   AyudaTutorial — la píldora «▶ Cómo se hace 1:20» al lado del título de la vista, y su globo. Plan:
   docs/plan-tutoriales.md, D7, DD5 y DD8d; mock: docs/mock-tutoriales.html, recuadro 2.

   Una píldora con palabras y no un ▶ suelto: se entiende sin pasar el mouse (en tablet no hay hover), y la
   duración dice cuánto tiempo pide. La dibuja `AppShell`, HERMANA del `h1` (adentro, el nombre accesible del
   título pasaría a ser «Dispensaciones Cómo se hace 1:20»).

   ── POR QUÉ UN GLOBO NUEVO Y NO `InfoTip` NI `Pistas` ──
   Los dos son `role="tooltip"` y cierran con el blur: un botón adentro no se puede usar (en tablet el toque
   le saca el foco al disparador y el globo se desmonta antes del clic; con teclado no se llega). Esto es un
   disclosure: abre con clic, el foco entra al play, cierra con Esc o con un clic afuera, y el foco vuelve a la
   píldora. Comparte `usePopover` (portal, Esc en capas, popovers anidados) con el resto de la casa.
   ============================================================================ */

const ANCHO = 400

export function AyudaTutorial({ tutorial, acento }: { tutorial: Publicado; acento: string }) {
  const ayuda = useAyuda()
  const [abierto, setAbierto] = useState(false)
  const cerrar = useCallback(() => setAbierto(false), [])
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(abierto, cerrar)
  const playRef = useRef<HTMLButtonElement>(null)
  const idGlobo = useId()

  /* Al abrir, el foco al play; al cerrar, de vuelta a la píldora, pero sólo si quedó suelto: si el clic que
     cerró fue en otro campo, el foco es de ese campo (la misma regla que el `Modal`, `reglasDeFoco.ts`). */
  const estuvoAbierto = useRef(false)
  useEffect(() => {
    if (abierto) { playRef.current?.focus(); estuvoAbierto.current = true; return }
    if (estuvoAbierto.current && (document.activeElement == null || document.activeElement === document.body)) triggerRef.current?.focus()
    estuvoAbierto.current = false
  }, [abierto, pos != null, triggerRef])

  if (!ayuda) return null
  const dur = duracionCorta(tutorial.meta.duracionMs)

  /* La flecha apunta al centro de la píldora, arriba o abajo según para dónde haya abierto el globo. */
  const r = triggerRef.current?.getBoundingClientRect()
  const arriba = !!(pos && r && pos.top < r.top)
  const flecha = pos && r ? Math.min(ANCHO - 26, Math.max(16, r.left + r.width / 2 - pos.left - 5)) : 34

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="spira-pildora-tutorial"
        aria-expanded={abierto}
        aria-controls={abierto ? idGlobo : undefined}
        aria-haspopup="dialog"
        aria-label={`Cómo se hace: ${tutorial.titulo}, ${duracionHablada(tutorial.meta.duracionMs)}`}
        onClick={() => setAbierto((a) => !a)}
        style={pildora}
      >
        <span aria-hidden="true" style={{ ...discoChico, background: acento }}>
          <Icon name="play" size={9} color="var(--spira-on-accent)" fill="var(--spira-on-accent)" stroke={1} style={{ marginLeft: 1 }} />
        </span>
        Cómo se hace
        <span aria-hidden="true" className="spira-mono" style={{ color: 'var(--spira-muted)', fontWeight: 500 }}>{dur}</span>
      </button>

      {abierto && pos && createPortal(
        <div ref={popRef} id={idGlobo} role="dialog" aria-label={tutorial.titulo} style={{ ...globo, top: pos.top + (arriba ? -4 : 4), left: pos.left }}>
          <span aria-hidden="true" style={{ ...punta, left: flecha, ...(arriba ? puntaAbajo : puntaArriba) }} />
          <TarjetaTutorial
            tutorial={tutorial}
            base={ayuda.base}
            acento={acento}
            visto={ayuda.vistos.has(tutorial.id)}
            onVisto={() => ayuda.marcarVisto(tutorial.id)}
            playRef={playRef}
            onVerEnGrande={(segundo) => {
              // El foco va a la píldora ANTES de abrir la Ayuda: así el `Drawer` la toma como su disparador y
              // se lo devuelve al cerrar (el botón «Ver en grande» desaparece con el globo).
              triggerRef.current?.focus()
              setAbierto(false)
              ayuda.abrirTutorial(tutorial.id, { segundo })
            }}
          />
        </div>,
        document.body,
      )}
    </>
  )
}

/* —— estilos (mock, recuadro 2) —— */
const pildora: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px 0 9px', borderRadius: 999,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)', background: 'var(--spira-white)',
  color: 'var(--spira-ink)', font: '600 12.5px/1 var(--spira-font-text)', cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto',
}
const discoChico: CSSProperties = { width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center' }
const globo: CSSProperties = {
  position: 'fixed', zIndex: 'var(--spira-z-popover)', width: ANCHO, padding: 14,
  background: 'var(--spira-white)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  borderRadius: 12, boxShadow: 'var(--spira-shadow-lg)',
}
const punta: CSSProperties = {
  position: 'absolute', width: 10, height: 10, background: 'var(--spira-white)', transform: 'rotate(45deg)',
  borderStyle: 'solid', borderColor: 'var(--spira-line-2)', borderWidth: 0,
}
const puntaArriba: CSSProperties = { top: -6, borderLeftWidth: 1, borderTopWidth: 1 }
const puntaAbajo: CSSProperties = { bottom: -6, borderRightWidth: 1, borderBottomWidth: 1 }
