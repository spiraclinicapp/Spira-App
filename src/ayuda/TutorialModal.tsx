import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { MODULES } from '../modules/registry'
import { capituloActual, duracionCorta, progresoDelCapitulo, siguienteDe, urlDelTutorial } from './catalogo'
import type { Publicado } from './catalogo'
import { useVideoTutorial } from './useVideoTutorial'

/* ============================================================================
   TutorialModal — el reproductor. Plan: docs/plan-tutoriales.md, «Piezas» (Reproductor, Pantalla final) y
   «Estados»; mock: docs/mock-tutoriales.html, recuadros 3 y 5.

   - El video va LIMITADO POR ALTO (`max-height: calc(100vh - 240px)`, el ancho sale del 16:9): así entra
     entero en una tablet apaisada de 1024×768 (DD8c). Los capítulos van a la derecha desde 1100 px y, por
     debajo, en una fila horizontal bajo el video: un solo quiebre (`.spira-repro__*` en tokens.css).
   - La pantalla final REEMPLAZA el área del video: no se superpone a sus controles, y sobrevive a salir de la
     pantalla completa nativa del iPad.
   - El foco inicial va al `<video>` (DD9, `initialFocusRef`), y al cerrar vuelve a quien lo abrió (el `Modal`).
   - Sin reproducción automática del siguiente: se ofrece al terminar, y se elige.

   ── POR QUÉ NO SE CARGA DIFERIDO (`React.lazy`) ──
   El plan lo dejaba para el reproductor, pero no tiene dependencias propias (es un `<video>` nativo y unos
   pocos KB), y la app no usa `lazy` en ningún lado: estrenarlo sumaba un estado de error («no se pudo abrir»)
   sin ganar nada que se note. La misma decisión que el panel de Ayuda en T3.
   ============================================================================ */

export function TutorialModal({ inicial, segundo, tutoriales, base, onVisto, onTodos, onClose }: {
  inicial: Publicado
  /** Dónde arranca («Ver en grande» sigue donde iba la tarjeta). */
  segundo: number
  /** Los que ve el usuario, en orden: de acá sale «Siguiente». */
  tutoriales: readonly Publicado[]
  base: string
  onVisto: (id: string) => void
  /** «Todos los tutoriales», al terminar el último: cierra y abre el panel en Tutoriales. */
  onTodos: () => void
  onClose: () => void
}) {
  /* «Ver siguiente» cambia de video en el MISMO modal: el tutorial es estado propio, no prop. */
  const [tutorial, setTutorial] = useState(inicial)
  const [desde, setDesde] = useState(segundo)
  const v = useVideoTutorial({ src: urlDelTutorial(base, tutorial, 'video.mp4'), segundoInicial: desde, onVisto: () => onVisto(tutorial.id) })
  const siguiente = siguienteDe(tutoriales, tutorial.id)
  const modulo = MODULES.find((m) => m.key === tutorial.modulo)
  const acento = modulo?.accentSolid ?? 'var(--spira-primary)'
  const capitulos = tutorial.meta.capitulos
  const ms = v.tiempo * 1000
  const actual = capituloActual(capitulos, ms)

  /* Se abrió para mirarlo: arranca solo (con el gesto de quien lo abrió todavía fresco, el navegador lo deja
     sonar). Y al pasar al siguiente, también: lo eligió con «Ver siguiente». */
  const { reproducir } = v
  useEffect(() => { reproducir() }, [tutorial.id, reproducir])

  const pasarA = (t: Publicado) => { setDesde(0); setTutorial(t) }
  const falla = v.estado === 'noDisponible' || v.estado === 'sinRed'

  return (
    <Modal
      title={tutorial.titulo}
      onClose={onClose}
      maxWidth={920}
      initialFocusRef={v.props.ref}
      junto={<span style={chipModulo(acento)}>{modulo?.name ?? 'General'}</span>}
    >
      <div className="spira-repro__cuerpo">
        <div className="spira-repro__video">
          {/* Sigue montado debajo de la pantalla final: «Volver a ver» lo reproduce de nuevo. */}
          {!falla && (
            <video
              key={tutorial.id}
              {...v.props}
              poster={urlDelTutorial(base, tutorial, 'poster.jpg')}
              controls
              preload="metadata"
              playsInline
              crossOrigin="anonymous"
              aria-label={`Tutorial: ${tutorial.titulo}`}
              style={{ display: 'block', width: '100%', height: '100%', background: 'var(--spira-paper)' }}
            >
              <track kind="captions" src={urlDelTutorial(base, tutorial, 'subtitulos.vtt')} srcLang="es" label="Español" default />
            </video>
          )}

          {v.estado === 'terminado' && (
            <div style={areaFin}>
              {siguiente ? (
                <div style={{ textAlign: 'center', maxWidth: 340 }}>
                  <p className="spira-eyebrow" style={{ margin: '0 0 6px' }}>Siguiente</p>
                  <strong style={{ fontSize: 16, color: 'var(--spira-ink)' }}>{siguiente.titulo}</strong>
                  <p style={{ margin: '4px 0 16px', fontSize: 13, color: 'var(--spira-muted)' }}>
                    <span className="spira-mono">{duracionCorta(siguiente.meta.duracionMs)}</span> · {MODULES.find((m) => m.key === siguiente.modulo)?.name ?? 'General'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button type="button" onClick={v.reproducir} style={btn('out')}><Icon name="rotateCcw" size={15} color="var(--spira-ink)" /> Volver a ver</button>
                    <button type="button" onClick={() => pasarA(siguiente)} style={btn('prim', acento)}>Ver siguiente</button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', maxWidth: 340, display: 'grid', gap: 12, justifyItems: 'center' }}>
                  <strong style={{ fontSize: 16, color: 'var(--spira-ink)' }}>Terminaste este tutorial</strong>
                  <button type="button" onClick={v.reproducir} style={btn('out')}><Icon name="rotateCcw" size={15} color="var(--spira-ink)" /> Volver a ver</button>
                  <button type="button" onClick={onTodos} style={enlace}>Todos los tutoriales</button>
                </div>
              )}
            </div>
          )}

          {falla && (
            <div style={areaFin}>
              <div style={{ textAlign: 'center', maxWidth: 340, display: 'grid', gap: 6, justifyItems: 'center' }}>
                <strong style={{ fontSize: 15, color: 'var(--spira-ink)' }}>
                  {v.estado === 'noDisponible' ? 'Este video todavía no está disponible' : 'No se pudo cargar el video'}
                </strong>
                <span style={{ fontSize: 13, color: 'var(--spira-muted)' }}>
                  {v.estado === 'noDisponible'
                    ? 'Mientras tanto, la transcripción de abajo cuenta los mismos pasos.'
                    : 'Revisá la conexión y probá de nuevo.'}
                </span>
                {v.estado === 'sinRed' && (
                  <button type="button" onClick={v.reintentar} style={{ ...btn('out'), marginTop: 6 }}><Icon name="rotateCcw" size={15} color="var(--spira-ink)" /> Reintentar</button>
                )}
              </div>
            </div>
          )}
        </div>

        {capitulos.length > 0 && (
          <nav className="spira-repro__capitulos" aria-label="Capítulos">
            <p className="spira-eyebrow spira-repro__rotulo">Capítulos</p>
            {capitulos.map((c, i) => {
              const esActual = i === actual
              return (
                <button
                  key={c.inicioMs}
                  type="button"
                  className="spira-repro__cap spira-no-press"
                  aria-current={esActual ? 'true' : undefined}
                  aria-label={`Ir a ${duracionCorta(c.inicioMs)}, ${c.titulo}`}
                  onClick={() => v.irA(c.inicioMs / 1000)}
                  disabled={falla}
                  style={{ fontWeight: esActual ? 600 : 400 }}
                >
                  <span className="spira-mono" style={{ color: esActual ? 'var(--spira-ink)' : 'var(--spira-muted)', fontSize: 12, minWidth: 32 }}>{duracionCorta(c.inicioMs)}</span>
                  <span>{c.titulo}</span>
                  {esActual && (
                    <span aria-hidden="true" style={barrita}>
                      <span style={{ ...barritaLlena, background: acento, width: `${progresoDelCapitulo(capitulos, i, ms, tutorial.meta.duracionMs) * 100}%` }} />
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        )}
      </div>

      <div style={pieRepro}>
        <details style={{ flex: 1, minWidth: 0 }}>
          <summary style={resumenTranscripcion}>Leer la transcripción</summary>
          <div style={cajaTranscripcion}>
            {tutorial.meta.transcripcion.map((linea, i) => <p key={i} style={{ margin: i ? '6px 0 0' : 0 }}>{linea}</p>)}
          </div>
        </details>
        {siguiente && (
          <span style={{ fontSize: 12.5, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>
            Siguiente: <b style={{ color: 'var(--spira-ink)', fontWeight: 600 }}>{siguiente.titulo}</b>
          </span>
        )}
      </div>
    </Modal>
  )
}

/* —— estilos (mock, recuadros 3 y 5) —— */
const chipModulo = (acento: string): CSSProperties => ({
  font: '600 11.5px/1 var(--spira-font-text)', padding: '5px 8px', borderRadius: 999, whiteSpace: 'nowrap',
  background: 'var(--spira-surface)', color: acento === 'var(--spira-primary)' ? 'var(--spira-ink)' : 'var(--spira-acc-deep-track)',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
})
const areaFin: CSSProperties = {
  position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 20,
  background: 'var(--spira-paper)', borderRadius: 10,
}
const btn = (tipo: 'out' | 'prim', acento?: string): CSSProperties => ({
  height: 36, padding: '0 14px', borderRadius: 10, font: '600 13.5px var(--spira-font-text)', display: 'inline-flex', alignItems: 'center', gap: 7,
  cursor: 'pointer', whiteSpace: 'nowrap',
  ...(tipo === 'prim'
    ? { background: acento, color: 'var(--spira-on-accent)', borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent' }
    : { background: 'var(--spira-white)', color: 'var(--spira-ink)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)' }),
})
const enlace: CSSProperties = {
  border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: '600 13px var(--spira-font-text)', color: 'var(--spira-acc-deep-track)',
}
const barrita: CSSProperties = { position: 'absolute', left: 8, right: 8, bottom: 2, height: 2, borderRadius: 2, background: 'var(--spira-line)', overflow: 'hidden' }
const barritaLlena: CSSProperties = { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 }
const pieRepro: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 16, marginTop: 14, paddingTop: 12,
  borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--spira-line)',
}
const resumenTranscripcion: CSSProperties = { cursor: 'pointer', color: 'var(--spira-acc-deep-track)', fontWeight: 600, fontSize: 13 }
/* Caja propia con scroll: abierta, la transcripción no empuja el video fuera de la vista (DD8c). */
const cajaTranscripcion: CSSProperties = {
  marginTop: 8, maxHeight: 160, overflow: 'auto', fontSize: 13, lineHeight: 1.55, color: 'var(--spira-muted)', maxWidth: 640,
}
