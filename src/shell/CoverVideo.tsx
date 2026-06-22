import { useEffect, useRef, useState } from 'react'

const YT_ID = 'QeTZRAqycfY'
const START = 11 // arranca (y reloopea) en el segundo 11

/* Miniatura estática del video. Sirve de poster de fondo del card (si el iframe de YouTube no
   carga —firewall del centro, sin red— igual se ve la imagen) y de imagen en reduced-motion. */
export const COVER_POSTER = `https://i.ytimg.com/vi/${YT_ID}/maxresdefault.jpg`

/* Tipos mínimos de la IFrame Player API (el repo no tiene @types/youtube). */
type YTPlayer = {
  mute: () => void
  unMute: () => void
  playVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  destroy: () => void
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: unknown) => YTPlayer
}
declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

/**
 * Video de fondo del panel de marca, HÍBRIDO: arranca en MUTE + autoplay + loop (arrancando y
 * reloopeando en el seg. 11, sin controles), y al clickearlo activa/silencia el sonido (botón de
 * bocina). El loop nativo de YouTube reinicia en 0, no en `start` → al terminar (ENDED=0) hacemos
 * seekTo(START). El iframe lleva pointer-events:none para que el click lo capture nuestro botón.
 * Respeta `prefers-reduced-motion` → miniatura estática que linkea al video (no autoplay).
 */
export function CoverVideo() {
  const ref = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const [reduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    if (reduced) return
    let cancelled = false

    const create = () => {
      const el = ref.current
      const YT = window.YT
      if (cancelled || !el || !YT?.Player) return
      playerRef.current = new YT.Player(el, {
        videoId: YT_ID,
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          autoplay: 1, mute: 1, controls: 0, start: START, rel: 0,
          modestbranding: 1, playsinline: 1, disablekb: 1, fs: 0, iv_load_policy: 3,
        },
        events: {
          onReady: (e: { target: YTPlayer }) => { e.target.mute(); e.target.playVideo() },
          onStateChange: (e: { data: number; target: YTPlayer }) => {
            if (e.data === 0) { e.target.seekTo(START, true); e.target.playVideo() } // 0 = ENDED → reloop desde START
          },
        },
      })
    }

    if (window.YT?.Player) {
      create()
    } else {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => { prev?.(); create() }
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const s = document.createElement('script')
        s.src = 'https://www.youtube.com/iframe_api'
        document.head.appendChild(s)
      }
    }

    return () => {
      cancelled = true
      try { playerRef.current?.destroy() } catch { /* el iframe ya pudo desmontarse */ }
      playerRef.current = null
    }
  }, [reduced])

  const toggleSound = () => {
    const p = playerRef.current
    if (!p) return
    if (muted) { p.unMute(); p.playVideo(); setMuted(false) } else { p.mute(); setMuted(true) }
  }

  if (reduced) {
    return (
      <a
        className="spira-auth-cover-hit spira-no-press"
        href={`https://www.youtube.com/watch?v=${YT_ID}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ver el video institucional de la Fundación Scherbovsky"
      >
        <img src={COVER_POSTER} alt="Video institucional de la Fundación Scherbovsky" />
      </a>
    )
  }

  return (
    <button
      type="button"
      className="spira-auth-cover-hit spira-no-press"
      onClick={toggleSound}
      aria-label={muted ? 'Activar el sonido del video' : 'Silenciar el video'}
    >
      <div ref={ref} />
      <span className="spira-auth-cover-sound" aria-hidden="true">
        {muted ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4z" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a9 9 0 0 1 0 14" />
          </svg>
        )}
      </span>
    </button>
  )
}
