import { useEffect, useRef, useState } from 'react'

const YT_ID = 'cJALP1onzAY'
const START = 11 // arranca (y reloopea) en el segundo 11

/* Tipos mínimos de la IFrame Player API (el repo no tiene @types/youtube). */
type YTPlayer = {
  mute: () => void
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
 * Video de fondo del panel de marca: el institucional en MUTE, autoplay y loop, arrancando y
 * RELOOPEANDO en el segundo 11, sin controles (decorativo). Usa la IFrame Player API porque el
 * `loop` nativo de YouTube reinicia en 0, no en `start`: al terminar (estado ENDED = 0) hacemos
 * seekTo(START). Respeta `prefers-reduced-motion` → muestra una miniatura estática en su lugar.
 * El <iframe>/imagen lo estiliza `.spira-auth-cover-card iframe|img` (llena el card 16:9).
 */
export function CoverVideo() {
  const ref = useRef<HTMLDivElement>(null)
  const [reduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    if (reduced) return
    let player: YTPlayer | undefined
    let cancelled = false

    const create = () => {
      const el = ref.current
      const YT = window.YT
      if (cancelled || !el || !YT?.Player) return
      player = new YT.Player(el, {
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
      // Encadena el callback global por si otro componente ya lo registró; carga el script una vez.
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
      try { player?.destroy() } catch { /* el iframe ya pudo desmontarse */ }
    }
  }, [reduced])

  if (reduced) {
    return <img src={`https://i.ytimg.com/vi/${YT_ID}/maxresdefault.jpg`} alt="Video institucional de la Fundación Scherbovsky" />
  }
  // La API reemplaza este div por el <iframe>.
  return <div ref={ref} />
}
