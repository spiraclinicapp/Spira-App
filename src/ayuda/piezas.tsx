import { Fragment } from 'react'
import { Icon } from '../components/Icon'
import { pedazosDeAyuda } from './texto'

/* Piezas chicas que comparten el panel de Ayuda y, en E3/E5, la bajada y el manual. Estilos en `ayuda.css`. */

/**
 * El disco del play (handoff §2, «Estados del play»): relleno y con halo mientras el tutorial no se vio, en
 * contorno cuando ya se vio. Es decorativo (`aria-hidden`): el nombre accesible lo pone el botón que lo contiene,
 * que sabe qué se va a reproducir. El halo se apaga solo con `prefers-reduced-motion` (`ayuda.css`).
 */
export function DiscoPlay({ visto, tamaño = 'md' }: { visto: boolean; tamaño?: 'sm' | 'md' | 'lg' }) {
  const lado = tamaño === 'lg' ? 18 : tamaño === 'sm' ? 8 : 10
  return (
    <span
      aria-hidden="true"
      className={`spira-ayuda-disco spira-ayuda-disco--${tamaño} ${visto ? 'spira-ayuda-disco--visto' : 'spira-ayuda-disco--nuevo'}`}
    >
      <Icon name="play" size={lado} color="currentColor" fill="currentColor" stroke={1} />
    </span>
  )
}

/**
 * Un texto de la Ayuda: lo que va entre «» como rótulo de botón y lo que coincide con `termino` resaltado
 * (`texto.ts`). Con `parrafos`, una línea en blanco separa párrafos, como en las respuestas de `preguntas.ts`.
 */
export function TextoAyuda({ texto, termino = '', parrafos = false }: { texto: string; termino?: string; parrafos?: boolean }) {
  const linea = (t: string) => pedazosDeAyuda(t, termino).map((p, i) => {
    const contenido = p.marcado ? <mark className="spira-ayuda-mark">{p.texto}</mark> : p.texto
    return p.rotulo
      ? <span key={i} className="spira-ayuda-rotulo">{contenido}</span>
      : <Fragment key={i}>{contenido}</Fragment>
  })
  if (!parrafos) return <>{linea(texto)}</>
  return <>{texto.split(/\n\s*\n/).map((par, i) => <p key={i}>{linea(par)}</p>)}</>
}
