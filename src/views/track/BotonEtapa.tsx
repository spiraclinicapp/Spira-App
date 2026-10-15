import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { Icon } from '../../components/Icon'
import { focoSiguiente, teclaDelMenu } from '../../components/teclasDelMenu'
import { usePopover } from '../../components/usePopover'
import type { AccionDeVisita, ClaveAccion, LlegadaFueraDeFecha } from './accionesDeVisita'
import './botonEtapa.css'

/** La cara principal: avanza a la etapa siguiente, como siempre. */
export interface CaraPrincipal {
  rotulo: string
  habilitada: boolean
  /** Por qué está apagada (quién hace esta marca). */
  pista?: string
  onClick: () => void
  /**
   * Si está, el clic NO avanza: abre esta confirmación en el lugar del menú (llegada de una visita que
   * no está citada para hoy, `llegadaFueraDeFecha`). `onConfirmar` hace la llegada que corresponda.
   * Con `vinoEseDia` y `onVinoEseDia`, ofrece además cargarla con la fecha en que vino (0158).
   */
  confirmar?: LlegadaFueraDeFecha & { rotulo: string; onConfirmar: () => void; onVinoEseDia?: () => void }
}

/**
 * ┌─ Botón de etapa dividido ────────────────────────────────────────────────────────────────────┐
 *
 * Handoff `docs/design_handoff_boton_etapa/` (§1-§3). El MISMO componente en la fila de Visitas y en la
 * barra del modal de la visita:
 *
 *   ┌──────────────────────────┬──────┐
 *   │  Iniciar atención   →    │  ⌄   │     cara principal: avanza (igual que antes)
 *   └──────────────────────────┴──────┘     flecha: abre el menú de acciones sobre la visita
 *
 * Sin etapa siguiente (Completa), `cara` es null y queda un único botón secundario «Acciones».
 *
 * Qué ofrece el menú y por qué algo está apagado NO se decide acá: llega hecho (`acciones`, de
 * `accionesDeVisita`), así la fila y el modal no pueden decir cosas distintas de la misma visita. Este
 * componente sólo dibuja, confirma y avisa la clave elegida (`onAccion`); el que lo usa la ejecuta.
 *
 * El menú va PORTALEADO a `body` con `usePopover` (alineado a la derecha del botón): la fila y la
 * tarjeta del modal recortan lo que se sale de su caja. Por el portal, sus clics y teclas viajan igual
 * por el árbol de React hasta la fila —que se abre con clic y con Enter—, así que se frenan acá.
 *
 * Teclado (handoff §3): Enter o ↓ en la flecha abre y enfoca el primer ítem habilitado; ↑/↓ recorren
 * sólo los habilitados, con vuelta (`focoSiguiente`); Esc cierra y devuelve el foco a la flecha.
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function BotonEtapa({
  tamano, cara, acciones, encabezado, rotuloVisita, etiqueta, ocupado, acento, onAccion,
}: {
  tamano: 'fila' | 'modal'
  cara: CaraPrincipal | null
  acciones: AccionDeVisita[]
  /** El renglón de arriba del menú: «VISITA V2 W4 ········ Concurrió · 2 de 4». */
  encabezado: { visita: string; etapa: string }
  /** Cómo se nombra la visita en «¿Eliminar la visita V2 W4?». */
  rotuloVisita: string
  /** Para el lector de pantalla: «Más acciones de la visita de Juan Pérez». */
  etiqueta: string
  /** Hay una mutación en vuelo: los dos botones se apagan. */
  ocupado: boolean
  /** El `accentSolid` del módulo: el relleno del botón (AA con texto papel). */
  acento: string
  onAccion: (clave: ClaveAccion) => void
}) {
  const [abierto, setAbierto] = useState<'menu' | 'llegada' | null>(null)
  /** La acción que está preguntando «¿seguro?» en el lugar de su ítem: Eliminar, o una con `confirmar`. */
  const [confirmando, setConfirmando] = useState<ClaveAccion | null>(null)
  const masRef = useRef<HTMLButtonElement | null>(null)
  const popNodo = useRef<HTMLDivElement | null>(null)

  const cerrar = useCallback(() => { setAbierto(null); setConfirmando(null) }, [])
  const { triggerRef, popRef, pos } = usePopover<HTMLDivElement, HTMLDivElement>(abierto !== null, cerrar, true, 'end')
  const refPop = useCallback((n: HTMLDivElement | null) => { popRef(n); popNodo.current = n }, [popRef])

  /** Lo que se recorre con ↑/↓: los ítems habilitados y, si hay una confirmación abierta, sus botones. */
  const enfocables = () => Array.from(popNodo.current?.querySelectorAll<HTMLElement>(
    '[role="menuitem"]:not([aria-disabled="true"]), .spira-split-confirma button',
  ) ?? [])

  /* El foco entra al popover cuando ya está pintado (`pos`): a la confirmación de llegada, el botón que
     confirma; a la de una acción del menú, el suyo («Eliminar», handoff §3); al menú, su primer ítem
     habilitado. */
  const montado = pos !== null
  useEffect(() => {
    if (!abierto || !montado) return
    const n = popNodo.current
    if (!n) return
    const destino = abierto === 'llegada' ? n.querySelector<HTMLElement>('[data-confirmar]')
      : confirmando ? n.querySelector<HTMLElement>('[data-confirma-accion]')
      : enfocables()[0]
    destino?.focus({ preventScroll: true })
  }, [abierto, montado, confirmando])

  /* Si mientras la confirmación de llegada está abierta los datos se refrescan y la visita ya no la
     necesita (otra pestaña registró la llegada, la citación pasó a hoy), se cierra: no hay nada que
     confirmar, y abajo no puede caer en el menú. */
  const confirmaLlegada = !!cara?.confirmar
  useEffect(() => {
    if (abierto === 'llegada' && !confirmaLlegada) cerrar()
  }, [abierto, confirmaLlegada, cerrar])

  const volverALaFlecha = () => { cerrar(); masRef.current?.focus() }

  /* Teclas dentro del popover. Se frenan para que no las lean la fila (Enter la abre) ni el modal (↑↓
     navegan visitas); el Esc lo resuelve el menú y no sigue, una capa por vez (`teclaDelMenu`). Tab
     cierra: el foco sale del menú y no tiene por qué quedar abierto detrás. */
  const tecladoDelPop = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); volverALaFlecha(); return }
    if (e.key === 'Tab') { e.stopPropagation(); volverALaFlecha(); return }
    e.stopPropagation()
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const lista = enfocables()
      const i = focoSiguiente(lista.length, lista.indexOf(document.activeElement as HTMLElement), e.key === 'ArrowDown' ? 1 : -1)
      lista[i]?.focus()
    }
  }

  /* En la flecha se frenan sólo las teclas que son de ella: Enter y Espacio la pulsan, ↓ abre el menú
     (o entra a él) y ↑ no tiene que navegar visitas por debajo. El resto —j/k, Tab— sigue a la capa de
     atrás, que en el modal navega entre visitas. La fila no necesita el freno: sólo reacciona a teclas
     nacidas en ella misma, y el clic lo corta el contenedor. */
  const tecladoDeLaFlecha = (e: KeyboardEvent<HTMLButtonElement>) => {
    const que = teclaDelMenu(e.key, abierto !== null)
    if (que === 'dejar-pasar') return
    if (que === 'cerrar-menu') { e.stopPropagation(); cerrar(); return }
    if (!['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
    e.stopPropagation()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (abierto === 'menu') enfocables()[0]?.focus()
      else { setConfirmando(null); setAbierto('menu') }
    }
  }

  const alternarMenu = () => {
    setConfirmando(null)
    setAbierto((a) => (a === 'menu' ? null : 'menu'))
  }

  const pulsarCara = () => {
    if (!cara) return
    if (cara.confirmar) {
      setConfirmando(null)
      setAbierto((a) => (a === 'llegada' ? null : 'llegada'))
      return
    }
    cerrar()
    cara.onClick()
  }

  const elegir = (a: AccionDeVisita) => {
    if (!a.habilitada) return
    // Eliminar pregunta siempre; el resto, si la regla lo pide (`confirmar`: «Volver» sobre una marca de
    // otro día, 0160). La pregunta va en el lugar del ítem, sin abrir otra capa.
    if (a.clave === 'eliminar' || a.confirmar) { setConfirmando(a.clave); return }
    // Cerrar ANTES de ejecutar: varias acciones abren un modal, y un menú abierto quedaría flotando
    // encima. El foco vuelve a la flecha; si la acción abre un modal, ése lo toma después.
    volverALaFlecha()
    onAccion(a.clave)
  }

  const itemDe = (a: AccionDeVisita) => (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={a.habilitada ? undefined : true}
      className={`spira-split-item spira-no-press${a.peligro ? ' spira-split-item--peligro' : ''}`}
      onClick={() => elegir(a)}
    >
      <Icon name={a.icono} size={16} color="currentColor" />
      <span className="spira-split-tx">
        {a.titulo}
        {a.bajada && <span className="spira-split-sub">{a.bajada}</span>}
      </span>
      {a.aparte && <span className="spira-split-aparte">{a.aparte}</span>}
    </button>
  )

  /* La pregunta en el lugar del ítem. Eliminar arma su texto acá (necesita el nombre de la visita) y
     confirma en rojo; el resto trae el suyo de la regla y confirma con su propio título («Volver a Por
     llegar»), que es lo que va a pasar. */
  const confirmacionDe = (a: AccionDeVisita) => {
    const borrar = a.clave === 'eliminar'
    const pregunta = borrar ? `¿Eliminar la visita ${rotuloVisita}?` : a.confirmar?.pregunta
    const detalle = borrar ? 'Se borra con sus registros. No se puede deshacer.' : a.confirmar?.detalle
    return (
      <div className="spira-split-confirma" role="group" aria-label={borrar ? 'Confirmar la eliminación' : `Confirmar: ${a.titulo}`}>
        <p>
          {pregunta}
          <span>{detalle}</span>
        </p>
        <div className="spira-split-fila">
          <button type="button" className="spira-split-btn spira-no-press" onClick={() => setConfirmando(null)}>Cancelar</button>
          <button
            type="button"
            data-confirma-accion
            className={`spira-split-btn ${borrar ? 'spira-split-btn--peligro' : 'spira-split-btn--primario'} spira-no-press`}
            onClick={() => { volverALaFlecha(); onAccion(a.clave) }}
          >
            {borrar ? 'Eliminar' : a.titulo}
          </button>
        </div>
      </div>
    )
  }

  const frenar = (e: MouseEvent) => e.stopPropagation()
  const guardando = ocupado && !!cara?.habilitada
  const variable = { '--split-acc': acento } as CSSProperties

  return (
    <>
      <div
        ref={triggerRef}
        className={`spira-split spira-split--${tamano}${cara ? '' : ' spira-split--acciones'}${abierto ? ' abierto' : ''}`}
        style={variable}
        onClick={frenar}
      >
        {cara && (
          <button
            type="button"
            className={`spira-split-main spira-no-press${cara.habilitada ? '' : ' apagada'}${guardando ? ' guardando' : ''}`}
            disabled={!cara.habilitada || ocupado}
            title={cara.habilitada ? undefined : cara.pista}
            onClick={pulsarCara}
          >
            {guardando ? 'Guardando…' : cara.rotulo}
            <Icon name="arrowRight" size={16} color="currentColor" />
          </button>
        )}
        <button
          ref={masRef}
          type="button"
          className="spira-split-more spira-no-press"
          aria-haspopup="menu"
          aria-expanded={abierto === 'menu'}
          aria-label={etiqueta}
          title={cara ? 'Más acciones' : undefined}
          disabled={ocupado}
          onClick={alternarMenu}
          onKeyDown={tecladoDeLaFlecha}
        >
          {!cara && 'Acciones'}
          <Icon name="chevronDown" size={16} color="currentColor" />
        </button>
      </div>

      {abierto && pos && !(abierto === 'llegada' && !cara?.confirmar) && createPortal(
        abierto === 'llegada' && cara?.confirmar ? (
          <div
            ref={refPop}
            role="dialog"
            aria-label="Marcar la llegada fuera de fecha"
            className="spira-split-pop spira-split-pop--confirmar"
            style={{ ...variable, top: pos.top, left: pos.left }}
            onMouseDown={frenar}
            onClick={frenar}
            onKeyDown={tecladoDelPop}
          >
            <div className="spira-split-confirma">
              <p>
                {cara.confirmar.antes}{cara.confirmar.fecha && <> <b>{cara.confirmar.fecha}</b></>}.
                <span>{cara.confirmar.detalle}</span>
              </p>
              {cara.confirmar.vinoEseDia && cara.confirmar.onVinoEseDia && (
                <button
                  type="button"
                  className="spira-split-otro"
                  onClick={() => { const c = cara.confirmar; cerrar(); c?.onVinoEseDia?.() }}
                >
                  ¿Vino el {cara.confirmar.vinoEseDia}? Cargala con esa fecha
                </button>
              )}
              <div className="spira-split-fila">
                <button type="button" className="spira-split-btn spira-no-press" onClick={volverALaFlecha}>Cancelar</button>
                <button
                  type="button"
                  data-confirmar
                  className="spira-split-btn spira-split-btn--primario spira-no-press"
                  onClick={() => { const c = cara.confirmar; cerrar(); c?.onConfirmar() }}
                >
                  {cara.confirmar.rotulo}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            ref={refPop}
            role="menu"
            aria-label={etiqueta}
            className="spira-split-pop"
            style={{ ...variable, top: pos.top, left: pos.left }}
            onMouseDown={frenar}
            onClick={frenar}
            onKeyDown={tecladoDelPop}
          >
            <div className="spira-split-cab">
              <b>Visita {encabezado.visita}</b>
              <span>{encabezado.etapa}</span>
            </div>
            {acciones.map((a) => (
              <Fragment key={a.clave}>
                {a.clave === 'eliminar' && <div className="spira-split-sep" role="separator" />}
                {confirmando === a.clave ? confirmacionDe(a) : itemDe(a)}
              </Fragment>
            ))}
          </div>
        ),
        document.body,
      )}
    </>
  )
}
