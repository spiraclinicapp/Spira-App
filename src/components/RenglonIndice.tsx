import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { avance, seccionActiva } from '../lib/seccionActiva'
import './RenglonIndice.css'

export interface EntradaIndice {
  /** El `id` del título de la sección en la página. Ese título lleva `scrollMarginTop: ALTO_RENGLON`. */
  id: string
  label: string
}

/** Cuánto más abajo del renglón tiene que pasar un título para que su sección cuente como empezada:
 *  lo que mide el renglón más un respiro, para que la marca cambie cuando el título se ESCONDE debajo
 *  y no cuando todavía se lee. Es también el `scroll-margin-top` con el que aterriza un salto. */
export const ALTO_RENGLON = 72

/** El ancestro que scrollea: en la app es `.spira-content`, pero se busca y no se asume. */
function contenedorDeScroll(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const { overflowY } = getComputedStyle(n)
    if (overflowY === 'auto' || overflowY === 'scroll') return n
  }
  return null
}

const sinMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * El renglón que acompaña al bajar por una pantalla larga de secciones: el índice de la página, una
 * línea que dice cuánto se leyó y, a la derecha, una de dos cosas (Director, 2026-10-12; mock en
 * `docs/design_handoff_estadisticas_filtros/indice.html`, variante 2):
 *
 *  · `acciones`: algo FIJO que vale para toda la página y conviene tener a mano en cualquier altura
 *    (Farmacia › Estadísticas: «Imprimir informe completo»).
 *  · `local`: los controles de UNA sección, que entran sólo mientras esa sección es la actual, con un
 *    rótulo que dice su alcance (Coordinación › Estadísticas: los filtros del detalle visita por
 *    visita, «sólo esta tabla»).
 *
 * Una pantalla usa una o la otra; las dos juntas no se diseñaron (los locales flotan a la derecha,
 * justo donde irían las acciones).
 *
 * Lo que vale para TODA la página (el período, un recorte por protocolo) no va acá: va en la cabecera,
 * junto al título, que el shell dibuja fuera del área que scrollea. El lugar de cada control dice su
 * alcance.
 *
 * El seguimiento del scroll es estado PROPIO de este componente, a propósito: re-renderizar la vista
 * entera en cada cuadro del scroll recalcularía todas sus tablas. La línea de avance ni siquiera pasa
 * por React —se escribe directo en su `transform`—, y la sección actual sólo se guarda cuando cambia.
 * La regla de cuál es la actual vive aparte y con test (`lib/seccionActiva.ts`).
 */
export function RenglonIndice({ entradas, local, acciones }: {
  entradas: readonly EntradaIndice[]
  local?: { id: string; rotulo: string; contenido: ReactNode }
  acciones?: ReactNode
}) {
  const renglonRef = useRef<HTMLDivElement>(null)
  const indiceRef = useRef<HTMLElement>(null)
  const avanceRef = useRef<HTMLElement>(null)
  const [actual, setActual] = useState<string | null>(entradas[0]?.id ?? null)
  const [despegado, setDespegado] = useState(false)
  const ids = entradas.map((e) => e.id).join('|')

  useLayoutEffect(() => {
    const renglon = renglonRef.current
    const sc = contenedorDeScroll(renglon)
    if (!renglon || !sc) return
    let cuadro = 0
    const medir = () => {
      cuadro = 0
      const techo = sc.getBoundingClientRect().top
      const posiciones = ids.split('|').flatMap((id) => {
        const el = id ? document.getElementById(id) : null
        return el ? [{ id, top: el.getBoundingClientRect().top - techo }] : []
      })
      const alFondo = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2
      setActual(seccionActiva(posiciones, ALTO_RENGLON, alFondo))
      setDespegado(sc.scrollTop > 4)
      if (avanceRef.current) avanceRef.current.style.transform = `scaleX(${avance(sc.scrollTop, sc.scrollHeight, sc.clientHeight)})`
    }
    const pedir = () => { if (!cuadro) cuadro = requestAnimationFrame(medir) }
    medir()
    sc.addEventListener('scroll', pedir, { passive: true })
    // El alto de la página cambia sin scroll: llegan los datos, se abre una fila, se filtra una tabla.
    const ro = new ResizeObserver(pedir)
    if (renglon.parentElement) ro.observe(renglon.parentElement)
    return () => {
      sc.removeEventListener('scroll', pedir)
      ro.disconnect()
      if (cuadro) cancelAnimationFrame(cuadro)
    }
  }, [ids])

  const conLocal = Boolean(local && actual === local.id)

  /* Cuando el índice no entra, la sección actual no puede quedar fuera de la vista: el índice se corre
     hasta ella. A mano y no con `scrollIntoView`, que también movería la página. Y se marca qué lado
     quedó recortado, para el desvanecido del CSS. Corre después de que los controles locales entran o
     salen: eso es lo que le cambia el ancho al índice. */
  useLayoutEffect(() => {
    const nav = indiceRef.current
    if (!nav) return
    const marcar = () => {
      nav.classList.toggle('corta-izq', nav.scrollLeft > 1)
      nav.classList.toggle('corta-der', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1)
    }
    const boton = nav.querySelector<HTMLElement>('[aria-current]')
    if (boton && nav.scrollWidth > nav.clientWidth) {
      const izq = boton.offsetLeft - nav.offsetLeft
      const der = izq + boton.offsetWidth
      if (izq < nav.scrollLeft) nav.scrollLeft = izq - 12
      else if (der > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = der - nav.clientWidth + 12
    }
    marcar()
    nav.addEventListener('scroll', marcar, { passive: true })
    const ro = new ResizeObserver(marcar)
    ro.observe(nav)
    return () => { nav.removeEventListener('scroll', marcar); ro.disconnect() }
  }, [actual, conLocal])

  /* Los controles locales flotan a la derecha, fuera del flujo (ver `RenglonIndice.css`): el lugar que
     el índice les cede mientras se ven sale de su ancho REAL, que cambia con lo que muestren. */
  useLayoutEffect(() => {
    const renglon = renglonRef.current
    const grupo = renglon?.querySelector<HTMLElement>('.spira-renglon-local')
    if (!renglon || !grupo) return
    const fijar = () => renglon.style.setProperty('--ancho-local', `${grupo.offsetWidth}px`)
    fijar()
    const ro = new ResizeObserver(fijar)
    ro.observe(grupo)
    return () => ro.disconnect()
  }, [local?.id])

  /* Si el foco estaba en un control local y el renglón lo esconde (se volvió a subir con la rueda), el
     foco no puede quedar en un control invisible: vuelve al cuerpo de la página. */
  useEffect(() => {
    if (conLocal) return
    const grupo = renglonRef.current?.querySelector('.spira-renglon-local')
    if (grupo?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
  }, [conLocal])

  function ir(id: string) {
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: sinMovimiento() ? 'auto' : 'smooth' })
  }

  return (
    <div ref={renglonRef} className={'spira-renglon' + (despegado ? ' despegado' : '') + (conLocal ? ' con-local' : '')}>
      <nav ref={indiceRef} className="spira-renglon-indice" aria-label="Secciones de la página">
        {entradas.map((e) => (
          <button
            key={e.id}
            type="button"
            className="spira-no-press"
            aria-current={e.id === actual ? 'location' : undefined}
            onClick={() => ir(e.id)}
          >
            {e.label}
          </button>
        ))}
      </nav>
      {acciones && <div className="spira-renglon-acciones">{acciones}</div>}
      {local && (
        <div className="spira-renglon-local" inert={!conLocal}>
          <span className="spira-renglon-rotulo">{local.rotulo}</span>
          {local.contenido}
        </div>
      )}
      <span className="spira-renglon-avance" aria-hidden="true"><i ref={avanceRef} /></span>
    </div>
  )
}
