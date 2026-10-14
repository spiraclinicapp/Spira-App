import { useCallback, useEffect, useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'
import { motivoDelError } from './catalogo'
import { alcanzaParaVisto } from './visto'

/* ============================================================================
   Lo que comparten la tarjeta (el globo de la píldora; en T5b, el tooltip) y el reproductor: el estado del
   `<video>`, el «visto», y que suene UNO SOLO a la vez. Plan: docs/plan-tutoriales.md, «Estados».

   Nunca arranca solo: el sonido empieza con el play de quien mira (la tarjeta lo pide con un clic; el
   reproductor, porque se abrió para eso). Y cuando se desmonta, el video se va con él: no queda nada sonando.
   ============================================================================ */

export type EstadoVideo = 'inicio' | 'cargando' | 'reproduciendo' | 'pausado' | 'terminado' | 'noDisponible' | 'sinRed'

/** La marca con la que se reconocen los videos de tutoriales en la página (para pausar los demás). */
const MARCA = 'data-tutorial-video'

export function useVideoTutorial({ src, segundoInicial = 0, onVisto }: {
  src: string
  segundoInicial?: number
  onVisto: () => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [estado, setEstado] = useState<EstadoVideo>('inicio')
  const [tiempo, setTiempo] = useState(0)
  const [duracion, setDuracion] = useState(NaN)
  const avisado = useRef(false)
  const onVistoRef = useRef(onVisto)
  onVistoRef.current = onVisto

  const avisarSiAlcanza = (actual: number, total: number, terminado = false) => {
    if (avisado.current || !alcanzaParaVisto(actual, total, terminado)) return
    avisado.current = true
    onVistoRef.current()
  }

  const props = {
    ref,
    src,
    [MARCA]: '',
    onLoadedMetadata: (e: SyntheticEvent<HTMLVideoElement>) => {
      const v = e.currentTarget
      setDuracion(v.duration)
      if (segundoInicial > 0 && segundoInicial < v.duration) v.currentTime = segundoInicial
    },
    onPlay: (e: SyntheticEvent<HTMLVideoElement>) => {
      // Uno solo a la vez: el que arranca pausa a los demás (otra tarjeta, el reproductor).
      document.querySelectorAll<HTMLVideoElement>(`video[${MARCA}]`).forEach((otro) => { if (otro !== e.currentTarget) otro.pause() })
      setEstado('reproduciendo')
    },
    onPlaying: () => setEstado('reproduciendo'),
    onWaiting: () => setEstado('cargando'),
    onPause: (e: SyntheticEvent<HTMLVideoElement>) => { if (!e.currentTarget.ended) setEstado('pausado') },
    onEnded: (e: SyntheticEvent<HTMLVideoElement>) => {
      setEstado('terminado')
      avisarSiAlcanza(e.currentTarget.currentTime, e.currentTarget.duration, true)
    },
    onTimeUpdate: (e: SyntheticEvent<HTMLVideoElement>) => {
      const v = e.currentTarget
      setTiempo(v.currentTime)
      avisarSiAlcanza(v.currentTime, v.duration)
    },
    onError: () => {
      // El `<video>` no dice el status del error: se le pregunta al archivo (ver `motivoDelError`).
      setEstado('cargando')
      fetch(src, { method: 'HEAD' })
        .then((r) => setEstado(r.ok ? 'sinRed' : motivoDelError(r.status)))
        .catch(() => setEstado('sinRed'))
    },
  }

  const reproducir = useCallback(() => {
    const v = ref.current
    if (!v) return
    if (v.ended) v.currentTime = 0
    v.play().catch(() => { /* lo cuenta `onError` */ })
  }, [])
  const pausar = useCallback(() => ref.current?.pause(), [])
  const reintentar = useCallback(() => {
    const v = ref.current
    if (!v) return
    setEstado('cargando')
    v.load()
    v.play().catch(() => {})
  }, [])
  const irA = useCallback((segundo: number) => {
    const v = ref.current
    if (!v) return
    v.currentTime = segundo
    if (v.paused) v.play().catch(() => {})
  }, [])

  /* Otro src (el reproductor pasó al «siguiente»): empieza de cero, también el aviso de visto. */
  useEffect(() => {
    avisado.current = false
    setEstado('inicio')
    setTiempo(0)
    setDuracion(NaN)
  }, [src])

  return { props, estado, tiempo, duracion, reproducir, pausar, reintentar, irA }
}
