import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, Ref } from 'react'
import { Icon } from '../components/Icon'
import { duracionCorta, duracionHablada, urlDelTutorial } from './catalogo'
import type { Publicado } from './catalogo'
import { useVideoTutorial } from './useVideoTutorial'

/* ============================================================================
   TarjetaTutorial — el tutorial en chico: título, dos renglones y el video PAUSADO, con play adentro y con
   sonido. Plan: docs/plan-tutoriales.md, DD10; mock: docs/mock-tutoriales.html, recuadros 2 y 2b.

   Es UNA sola pieza para dos lugares: el globo de la píldora «Cómo se hace» (T5, `AyudaTutorial`) y el tooltip
   de los controles clave del flujo (T5b, desde `Pistas`). Por eso no sabe de dónde la abrieron: el marco (el
   popover, el ✕ de la fijada, la flecha) lo pone quien la monta.

   Nunca arranca sola: el sonido empieza con el play. «Ver en grande» pasa al reproductor EN EL MISMO SEGUNDO.
   ============================================================================ */

export function TarjetaTutorial({ tutorial, base, acento, titulo = tutorial.titulo, texto = tutorial.descripcion, visto, onVisto, onVerEnGrande, onArranca, playRef }: {
  tutorial: Publicado
  base: string
  /** El acento del módulo del tutorial: el disco de play y el progreso. */
  acento: string
  /** En el tooltip (T5b), el nombre del control; en el globo, el del tutorial. */
  titulo?: string
  /** En el tooltip, el texto del `title`; en el globo, la descripción del catálogo. */
  texto?: string
  visto: boolean
  onVisto: () => void
  onVerEnGrande: (segundo: number) => void
  /** Le dieron play. En el tooltip (T5b) es lo que FIJA la tarjeta: deja de cerrarse al sacar el mouse. */
  onArranca?: () => void
  /** Para que quien la abre ponga el foco en el play (plan, «Teclado»). */
  playRef?: Ref<HTMLButtonElement>
}) {
  const v = useVideoTutorial({ src: urlDelTutorial(base, tutorial, 'video.mp4'), onVisto })
  /* Silencio propio: el control del sistema queda afuera de la tarjeta, y el video arranca con sonido (DD10). */
  const [mudo, setMudo] = useState(false)

  /* El navegador pone los subtítulos al pie del video, y ahí van NUESTROS controles (los del sistema los corren
     solos; éstos no): quedaban tapados por la barra. Se suben cuatro renglones, como en el mock. Con listeners
     nativos y no con el `onLoad` de React, que en un `<track>` no llega (QA de T5b); y también en cada cambio
     de subtítulo, por si los renglones cargan después del primer `load`. */
  const trackRef = useRef<HTMLTrackElement>(null)
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const subir = () => { for (const cue of Array.from(el.track.cues ?? [])) (cue as VTTCue).line = -4 }
    el.addEventListener('load', subir)
    el.track.addEventListener('cuechange', subir)
    return () => { el.removeEventListener('load', subir); el.track.removeEventListener('cuechange', subir) }
  }, [])
  const dur = duracionCorta(tutorial.meta.duracionMs)
  const nombrePlay = `Reproducir el tutorial ${tutorial.titulo}, ${duracionHablada(tutorial.meta.duracionMs)}`
  const enMarcha = v.estado === 'reproduciendo' || v.estado === 'pausado' || v.estado === 'cargando'
  const falla = v.estado === 'noDisponible' || v.estado === 'sinRed'
  const total = Number.isFinite(v.duracion) ? v.duracion : tutorial.meta.duracionMs / 1000

  return (
    <div style={{ width: 372 }}>
      <h3 style={tituloStyle}>{titulo}</h3>
      <p style={textoStyle}>{texto}</p>

      <div style={medio}>
        {!falla && (
          <video
            {...v.props}
            poster={urlDelTutorial(base, tutorial, 'poster.jpg')}
            preload="none"
            playsInline
            crossOrigin="anonymous"
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', background: 'var(--spira-paper)' }}
            aria-label={`Tutorial: ${tutorial.titulo}`}
          >
            <track ref={trackRef} kind="captions" src={urlDelTutorial(base, tutorial, 'subtitulos.vtt')} srcLang="es" label="Español" default />
          </video>
        )}

        {v.estado === 'inicio' && (
          <span style={velo}>
            <button ref={playRef} type="button" onClick={() => { onArranca?.(); v.reproducir() }} aria-label={nombrePlay} title={nombrePlay} style={disco(acento)}>
              <Icon name="play" size={16} color="var(--spira-on-accent)" fill="var(--spira-on-accent)" stroke={1} style={{ marginLeft: 2 }} />
            </button>
            <span className="spira-mono" style={chipDur}>{dur}</span>
          </span>
        )}

        {enMarcha && (
          <span style={controles}>
            <button
              type="button"
              onClick={v.estado === 'reproduciendo' ? v.pausar : v.reproducir}
              aria-label={v.estado === 'reproduciendo' ? 'Pausar' : 'Seguir'}
              title={v.estado === 'reproduciendo' ? 'Pausar' : 'Seguir'}
              className="spira-no-press"
              style={ctrlBtn}
            >
              <Icon name={v.estado === 'reproduciendo' ? 'pause' : 'play'} size={12} color="#FFFFFF" fill="#FFFFFF" stroke={1} />
            </button>
            <span className="spira-mono" style={{ whiteSpace: 'nowrap' }}>{duracionCorta(v.tiempo * 1000)} / {dur}</span>
            <span aria-hidden="true" style={barraT}>
              <span style={{ ...barraLlena, width: `${Math.min(100, (v.tiempo / total) * 100)}%` }} />
            </span>
            <button
              type="button"
              onClick={() => { const el = v.props.ref.current; if (el) { el.muted = !mudo; setMudo(!mudo) } }}
              aria-pressed={mudo}
              aria-label="Silenciar"
              title={mudo ? 'Activar el sonido' : 'Silenciar'}
              className="spira-no-press"
              style={ctrlBtn}
            >
              <Icon name={mudo ? 'volumeOff' : 'volume'} size={13} color="#FFFFFF" />
            </button>
            {v.estado === 'cargando' && <span style={{ position: 'absolute', left: 12, bottom: 34, fontSize: 11.5 }}>Cargando…</span>}
          </span>
        )}

        {v.estado === 'terminado' && (
          <span style={{ ...velo, background: 'rgba(244, 241, 234, 0.94)', gap: 8 }}>
            <button type="button" onClick={v.reproducir} style={btnChico('out')}>
              <Icon name="rotateCcw" size={14} color="var(--spira-ink)" /> Volver a ver
            </button>
            <button type="button" onClick={() => onVerEnGrande(0)} style={btnChico('prim', acento)}>Ver en grande</button>
          </span>
        )}

        {falla && (
          <span style={{ ...velo, background: 'var(--spira-paper)', flexDirection: 'column', textAlign: 'center', padding: 16, gap: 6 }}>
            <strong style={{ fontSize: 13.5, color: 'var(--spira-ink)' }}>
              {v.estado === 'noDisponible' ? 'Este video todavía no está disponible' : 'No se pudo cargar el video'}
            </strong>
            {v.estado === 'sinRed' && (
              <>
                <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>Revisá la conexión y probá de nuevo.</span>
                <button type="button" onClick={v.reintentar} style={btnChico('out')}>
                  <Icon name="rotateCcw" size={14} color="var(--spira-ink)" /> Reintentar
                </button>
              </>
            )}
          </span>
        )}
      </div>

      <div style={pie}>
        {visto && !enMarcha ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--spira-muted)' }}>
            <Icon name="check" size={14} color="var(--spira-good)" stroke={2.2} /> Ya lo viste
          </span>
        ) : <span />}
        {!falla && (
          <button type="button" onClick={() => onVerEnGrande(v.estado === 'terminado' ? 0 : v.tiempo)} style={enlace}>
            <Icon name="maximize" size={13} color="currentColor" /> Ver en grande
          </button>
        )}
      </div>
    </div>
  )
}

/* —— estilos (mock, recuadros 2 y 2b) —— */
const tituloStyle: CSSProperties = { font: '700 14px/1.25 var(--spira-font-display)', letterSpacing: '-0.01em', margin: '0 0 4px', color: 'var(--spira-ink)' }
const textoStyle: CSSProperties = { margin: '0 0 12px', color: 'var(--spira-muted)', fontSize: 13, lineHeight: 1.45 }
const medio: CSSProperties = {
  position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 9, overflow: 'hidden',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)', background: 'var(--spira-paper)',
}
/* Lo que va SOBRE el video va en tinta translúcida, igual en los dos temas (plan, «Tema oscuro»). */
const velo: CSSProperties = { position: 'absolute', inset: 0, background: 'rgba(20, 48, 46, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const disco = (acento: string): CSSProperties => ({
  width: 44, height: 44, borderRadius: '50%', border: 'none', background: acento, display: 'grid', placeItems: 'center',
  boxShadow: '0 4px 14px rgba(20, 48, 46, 0.25)', cursor: 'pointer',
})
const chipDur: CSSProperties = {
  position: 'absolute', right: 7, bottom: 7, background: 'rgba(20, 48, 46, 0.78)', color: '#F4F1EA',
  font: '600 11px/1 var(--spira-font-text)', padding: '4px 6px', borderRadius: 6,
}
const controles: CSSProperties = {
  position: 'absolute', left: 0, right: 0, bottom: 0, height: 28, background: 'rgba(20, 48, 46, 0.55)',
  display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', color: '#FFFFFF', font: '600 11px var(--spira-font-text)',
}
const ctrlBtn: CSSProperties = { width: 22, height: 22, border: 'none', borderRadius: 5, background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0, flex: '0 0 auto' }
const barraT: CSSProperties = { position: 'relative', flex: 1, height: 4, borderRadius: 4, background: 'rgba(255, 255, 255, 0.4)', overflow: 'hidden' }
const barraLlena: CSSProperties = { position: 'absolute', left: 0, top: 0, bottom: 0, background: '#FFFFFF', borderRadius: 4 }
const pie: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: 12.5 }
const enlace: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', padding: 0, cursor: 'pointer',
  font: '600 12.5px var(--spira-font-text)', color: 'var(--spira-acc-deep-track)',
}
const btnChico = (tipo: 'out' | 'prim', acento?: string): CSSProperties => ({
  height: 32, padding: '0 12px', borderRadius: 9, font: '600 13px var(--spira-font-text)', display: 'inline-flex', alignItems: 'center', gap: 6,
  cursor: 'pointer', whiteSpace: 'nowrap',
  ...(tipo === 'prim'
    ? { background: acento, color: 'var(--spira-on-accent)', borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent' }
    : { background: 'var(--spira-white)', color: 'var(--spira-ink)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)' }),
})
