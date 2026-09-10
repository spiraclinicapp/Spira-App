import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { usePopover } from './usePopover'

/* ============================================================================
   InfoTip — el ⓘ que explica el valor de al lado.

   Estrena una pieza que la app no tenía: hasta hoy las pistas se daban con el `title` nativo
   (167 usos, ver `Termino.tsx`), que sigue siendo lo correcto para una línea suelta. Esto es para
   la otra clase de pista: TÍTULO + CUERPO —"Administrador" / "Ve y edita todo el módulo"— que el
   globito del navegador no sabe dibujar, tarda un segundo en aparecer y, sobre todo, NO se abre
   con el foco del teclado.

   ── POR QUÉ SOBRE `usePopover` Y NO UN `position:absolute` PROPIO ──
   Porque el ⓘ vive DENTRO de otro popover: el menú de niveles de la consola de accesos lleva uno
   por opción. Un panel portaleado a `body` le cae "afuera" a su menú padre, que cerraría en el
   `mousedown` —antes de que el click llegue— y la opción no se podría ni elegir. Es exactamente lo
   que pasó con el mes/año del calendario. `usePopover` mantiene el REGISTRO de popovers abiertos
   (`abiertos`) que reconstruye el parentesco lógico que el portal corta, así que apoyarse en él no
   es comodidad: es la única forma de que el ⓘ adentro del menú no rompa el menú. Y de yapa hereda
   el portal (esquiva el `backdrop-filter` del modal de Ajustes), el flip y la reubicación en
   scroll/resize.

   ── WCAG 2.1 AA · 1.4.13 (Content on Hover or Focus) ──
   Una pista que aparece al apuntar tiene que cumplir tres cosas, y las tres están acá:
     · DESCARTABLE  → Esc la cierra (lo pone `usePopover`) sin mover el foco.
     · APUNTABLE    → se puede llevar el mouse ADENTRO del panel sin que se cierre. Por eso el
                      cierre por `mouseleave` pasa por un timer de gracia que el propio panel
                      cancela al recibir el mouse. Sin eso, un cuerpo de tres renglones que el
                      usuario quiere releer despacio se le escapa al cruzar el hueco de 6px.
     · PERSISTENTE  → no se cierra sola por tiempo.

   ── Y ABRE TAMBIÉN POR CLICK ──
   No es un capricho ni un extra: en una tablet no hay `hover`, así que sin el click el ⓘ sería un
   ícono que no hace absolutamente nada. Un control que no puede cumplir lo que promete es lo mismo
   que un botón muerto, y esta app no los tiene.
   ============================================================================ */

/** Ancho FIJO del panel. Fijo y no `max-content` a propósito: con un ancho conocido, la cuenta del
 *  caret es exacta aunque el panel se recorte contra el borde de la ventana. */
const ANCHO = 250
/** Cuánto sobrevive el panel después de que el mouse sale, para poder entrar en él. */
const GRACIA_MS = 140

interface Props {
  /** El nombre de lo que se explica. Va en negrita, arriba. */
  titulo: string
  /** Qué significa, en castellano. Envuelve: es una frase, no un rótulo. */
  cuerpo: string
  /** Tamaño del ícono. 14 es el del handoff para el escudito; 15 lee mejor al lado de un campo. */
  size?: number
  /** Qué anuncia el lector de pantalla al llegar al ícono. Por defecto nombra el título. */
  etiqueta?: string
  color?: string
  /** Con qué ícono se dispara. El default es el ⓘ, pero a veces el disparador ES el dato: el
   *  escudito de quien administra los accesos explica lo que él mismo significa, y ponerle un ⓘ al
   *  lado sería dibujar dos íconos para una sola idea. */
  icono?: IconName
}

export function InfoTip({ titulo, cuerpo, size = 15, etiqueta, color, icono = 'info' }: Props) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | null>(null)
  const tipId = useId()

  const cancelarCierre = useCallback(() => {
    if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null }
  }, [])

  const cerrar = useCallback(() => { cancelarCierre(); setOpen(false) }, [cancelarCierre])

  const cerrarConGracia = useCallback(() => {
    cancelarCierre()
    timer.current = window.setTimeout(() => { timer.current = null; setOpen(false) }, GRACIA_MS)
  }, [cancelarCierre])

  const abrir = useCallback(() => { cancelarCierre(); setOpen(true) }, [cancelarCierre])

  // El timer no puede sobrevivir al desmontaje: un `setOpen` sobre un componente que ya no está es
  // un aviso en consola y, peor, esconde que el panel quedó vivo un instante de más.
  useEffect(() => cancelarCierre, [cancelarCierre])

  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(open, cerrar)

  /* El caret apunta al ÍCONO, no al centro del panel: `usePopover` recorta el panel contra el borde
     de la ventana, así que cerca de un margen el panel se corre y el centro deja de coincidir. Se
     mide la distancia real entre el centro del disparador y el borde izquierdo del panel, y se
     limita para que la punta no se salga por las esquinas redondeadas. `arriba` sale de comparar
     las dos cajas: es la única forma de saber que `usePopover` flipeó. */
  const [caret, setCaret] = useState<{ left: number; arriba: boolean }>({ left: ANCHO / 2, arriba: false })
  useLayoutEffect(() => {
    if (!pos) return
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.max(14, Math.min(r.left + r.width / 2 - pos.left, ANCHO - 14))
    const arriba = pos.top < r.top
    setCaret((c) => (c.left === left && c.arriba === arriba ? c : { left, arriba }))
  }, [pos, triggerRef])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="spira-no-press"
        aria-label={etiqueta ?? `Qué significa «${titulo}»`}
        /* `aria-describedby` y NO `aria-expanded`: esto no despliega una región, describe al
           control de al lado. Es lo que la APG pide para un tooltip. */
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={abrir}
        onMouseLeave={cerrarConGracia}
        onFocus={abrir}
        onBlur={cerrar}
        onClick={() => (open ? cerrar() : abrir())}
        style={{ ...disparador, width: size + 6, height: size + 6 }}
      >
        <Icon name={icono} size={size} color={color ?? 'var(--spira-faint)'} />
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          id={tipId}
          role="tooltip"
          className="spira-infotip"
          onMouseEnter={cancelarCierre}
          onMouseLeave={cerrarConGracia}
          style={{ ...panel, top: pos.top, left: pos.left }}
        >
          {/* El caret es un cuadrado rotado 45° que sólo muestra dos de sus lados: los otros dos
              quedan tapados por el panel. Va con el mismo fondo y borde que él, así se lee como una
              punta del panel y no como una pieza pegada encima. */}
          <span
            aria-hidden
            style={{
              ...punta,
              left: caret.left - 5,
              ...(caret.arriba
                ? { bottom: -6, borderTop: 'none', borderLeft: 'none' }
                : { top: -6, borderBottom: 'none', borderRight: 'none' }),
            }}
          />
          <div style={tituloEstilo}>{titulo}</div>
          <div style={cuerpoEstilo}>{cuerpo}</div>
        </div>,
        document.body,
      )}
    </>
  )
}

/* —— estilos —— */

/** El disparador no lleva fondo ni borde: es el ícono y nada más (§06 del handoff — "ícono suelto,
 *  nunca pill"). `spira-no-press` lo deja fuera del levante al pulsar: un ⓘ que se hunde parece un
 *  botón que hace algo, y no hace nada más que explicar. */
const disparador: CSSProperties = {
  flex: '0 0 auto', display: 'grid', placeItems: 'center', padding: 0,
  border: 'none', background: 'transparent', borderRadius: '50%', cursor: 'help',
}

const panel: CSSProperties = {
  position: 'fixed', zIndex: 'var(--spira-z-popover)', width: ANCHO,
  background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)', borderRadius: 11,
  boxShadow: '0 12px 30px rgba(20, 48, 46, .16)', padding: '10px 13px 11px',
}

const punta: CSSProperties = {
  position: 'absolute', width: 10, height: 10, transform: 'rotate(45deg)',
  background: 'var(--spira-white)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
}

const tituloEstilo: CSSProperties = {
  fontSize: 13, fontWeight: 700, color: 'var(--spira-ink)', letterSpacing: '-0.01em',
}

const cuerpoEstilo: CSSProperties = {
  fontSize: 12.5, lineHeight: 1.4, color: 'var(--spira-muted)', marginTop: 3, whiteSpace: 'normal',
}
