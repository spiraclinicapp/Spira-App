import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { avance, seccionActiva } from './seccionActiva'
import './estadisticas.css'

export interface EntradaIndice {
  /** El `id` del título de la sección en la página (ver `Seccion` en la vista). */
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
 * El renglón que acompaña al bajar por Estadísticas (Director, 2026-10-12; mock en
 * `docs/design_handoff_estadisticas_filtros/indice.html`, variante 2): el índice de la página, una
 * línea que dice cuánto se leyó y, cuando la sección actual es el detalle, los filtros del detalle.
 *
 * Reemplaza al «doble filtro» que molestaba: el período arriba de todo y los siete controles del
 * detalle al pie, dos barras que parecían la misma cosa y no lo eran. El período subió a la cabecera
 * (fija, la dibuja el shell); los del detalle aparecen acá SÓLO mientras se mira esa tabla, rotulados
 * «sólo esta tabla», que es su alcance real.
 *
 * El seguimiento del scroll es estado PROPIO de este componente, a propósito: re-renderizar la vista
 * entera en cada cuadro del scroll recalcularía todas las tablas. La línea de avance ni siquiera pasa
 * por React —se escribe directo en su `transform`—, y la sección actual sólo se guarda cuando cambia.
 */
export function RenglonEstadisticas({ entradas, idDetalle, detalle }: {
  entradas: readonly EntradaIndice[]
  /** La sección cuyos filtros entran al renglón. Sin ella (sin zona Equipo), el renglón es sólo índice. */
  idDetalle?: string
  detalle?: ReactNode
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
        const el = document.getElementById(id)
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
    // El alto de la página cambia sin scroll: llegan los datos, se abre una fila, se filtra el detalle.
    const ro = new ResizeObserver(pedir)
    if (renglon.parentElement) ro.observe(renglon.parentElement)
    return () => {
      sc.removeEventListener('scroll', pedir)
      ro.disconnect()
      if (cuadro) cancelAnimationFrame(cuadro)
    }
  }, [ids])

  const conDetalle = Boolean(idDetalle && actual === idDetalle)

  /* Cuando el índice no entra (tablet, con los filtros del detalle a la vista), la sección actual no
     puede quedar fuera de la vista: el índice se corre hasta ella. A mano y no con `scrollIntoView`,
     que también movería la página. Y se marca qué lado quedó recortado, para el desvanecido del CSS.
     Corre después de que los filtros entran o salen: eso es lo que le cambia el ancho al índice. */
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
  }, [actual, conDetalle])

  /* Los filtros del detalle flotan a la derecha, fuera del flujo (ver `estadisticas.css`): el lugar
     que el índice les cede mientras se ven sale de su ancho REAL, que cambia con el número del botón
     y con la búsqueda que se achica en angosto. */
  useLayoutEffect(() => {
    const renglon = renglonRef.current
    const grupo = renglon?.querySelector<HTMLElement>('.est-renglon-detalle')
    if (!renglon || !grupo) return
    const fijar = () => renglon.style.setProperty('--ancho-detalle', `${grupo.offsetWidth}px`)
    fijar()
    const ro = new ResizeObserver(fijar)
    ro.observe(grupo)
    return () => ro.disconnect()
  }, [idDetalle])

  /* Si el foco estaba en un filtro del detalle y el renglón lo esconde (se volvió a subir con la
     rueda), el foco no puede quedar en un control invisible: vuelve al cuerpo de la página. */
  useEffect(() => {
    if (conDetalle) return
    const grupo = renglonRef.current?.querySelector('.est-renglon-detalle')
    if (grupo?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
  }, [conDetalle])

  function ir(id: string) {
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: sinMovimiento() ? 'auto' : 'smooth' })
  }

  return (
    <div ref={renglonRef} className={'est-renglon' + (despegado ? ' despegado' : '') + (conDetalle ? ' con-detalle' : '')}>
      <nav ref={indiceRef} className="est-indice" aria-label="Secciones de la página">
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
      {idDetalle && detalle && (
        <div className="est-renglon-detalle" inert={!conDetalle}>
          <span className="est-renglon-alcance">sólo esta tabla</span>
          {detalle}
        </div>
      )}
      <span className="est-avance" aria-hidden="true"><i ref={avanceRef} /></span>
    </div>
  )
}
