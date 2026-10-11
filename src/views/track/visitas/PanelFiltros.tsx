import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../../components/Icon'
import type { IconName } from '../../../components/Icon'
import { usePopover } from '../../../components/usePopover'
import { CATEGORIAS, SIN_FILTROS, conteoFacetado, opcionesDe, pasaFiltros, totalFiltros } from './filtrosVisitas'
import type { CategoriaFiltro, FilaFiltrable, Filtros } from './filtrosVisitas'
import { ORDEN_ESTADOS, colorEstado } from './estados'

export const CATEGORIA: Record<CategoriaFiltro, { label: string; icon: IconName }> = {
  estado: { label: 'Estado', icon: 'filter' },
  protocolo: { label: 'Protocolo', icon: 'file' },
  medico: { label: 'Médico', icon: 'users' },
  coordinador: { label: 'Coordinador', icon: 'user' },
}

/**
 * El botón «Filtros» y su panel de dos columnas (handoff §2 y §2.1): categorías a la izquierda,
 * opciones con su conteo facetado a la derecha.
 *
 * Marcar APLICA EN EL ACTO —la lista de atrás cambia mientras se tilda— y «Ver N visitas» sólo cierra:
 * el número del botón es el mismo que va a quedar en pantalla, así que no promete nada que la lista
 * no muestre ya.
 *
 * Reemplaza a los cuatro menús sueltos (Estado / Protocolo / Médico / Coordinador) que ocupaban la
 * fila y la partían en dos en una notebook. Las reglas de filtrado no cambiaron: viven en
 * `filtrosVisitas.ts`, con test.
 */
export function PanelFiltros({ base, filtros, onChange, rotulo, acento }: {
  /** Las visitas del período (ya con la búsqueda aplicada) sobre las que se cuenta. */
  base: FilaFiltrable[]
  filtros: Filtros
  onChange: (f: Filtros) => void
  /** Etiqueta legible de un valor (el id de un protocolo → su código, etc.). */
  rotulo: (cat: CategoriaFiltro, valor: string) => string
  /** El `accentSolid` del módulo. El panel vive en `body` (portal), fuera del `--vcal-acc` que fija la
   *  vista, así que lo vuelve a fijar acá: sin él, «Ver N visitas» caería al teal de 4,33:1. */
  acento: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [cat, setCat] = useState<CategoriaFiltro>('estado')
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(abierto, () => setAbierto(false))
  const total = totalFiltros(filtros)
  const resultado = base.filter((v) => pasaFiltros(v, filtros)).length

  /* Al abrir, el foco entra a la categoría activa: con teclado, el panel no puede quedar abierto con el
     foco todavía en el botón de atrás (Esc lo cierra; lo maneja `usePopover`). */
  const catRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { if (abierto && pos) catRef.current?.focus() }, [abierto, pos !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  const opciones = opcionesDe(base, filtros, cat)
  const ordenadas = cat === 'estado'
    ? [...opciones].sort((a, b) => ordenEstado(a) - ordenEstado(b))
    : [...opciones].sort((a, b) => rotulo(cat, a).localeCompare(rotulo(cat, b), 'es'))
  const toggle = (valor: string) => {
    const sel = filtros[cat]
    onChange({ ...filtros, [cat]: sel.includes(valor) ? sel.filter((x) => x !== valor) : [...sel, valor] })
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={'vcal-filter' + (total > 0 ? ' con-filtros' : '')}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        onClick={() => setAbierto((o) => !o)}
        title="Estado, protocolo, médico y coordinador"
      >
        <Icon name="filter" size={15} color="var(--spira-muted)" />
        Filtros
        {total > 0 && <span className="vcal-badge" aria-label={`${total} ${total === 1 ? 'filtro puesto' : 'filtros puestos'}`}>{total}</span>}
        <Icon name="chevronDown" size={14} color="var(--spira-muted)" style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {/* PORTALEADO, como todos los popovers de la casa (ver `usePopover`): dibujado adentro de la
          fila, un ancestro con `transform` —la fila se levanta al apuntar el botón— lo correría. */}
      {abierto && pos && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="Filtros"
          className="vcal-fpanel vcal-pop"
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 'var(--spira-z-popover)', '--vcal-acc': acento } as CSSProperties}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '170px minmax(0, 1fr)', minHeight: 260 }}>
            <div className="vcal-fcats" role="tablist" aria-orientation="vertical" aria-label="Categorías">
              {CATEGORIAS.map((k) => (
                <button
                  key={k}
                  ref={k === cat ? catRef : undefined}
                  type="button"
                  role="tab"
                  aria-selected={cat === k}
                  className="vcal-fcat spira-no-press"
                  onClick={() => setCat(k)}
                >
                  <Icon name={CATEGORIA[k].icon} size={15} color={cat === k ? 'var(--spira-track)' : 'currentColor'} />
                  <span style={{ flex: 1 }}>{CATEGORIA[k].label}</span>
                  {filtros[k].length > 0 && <span className="vcal-badge">{filtros[k].length}</span>}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }} role="tabpanel" aria-label={CATEGORIA[cat].label}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px 6px', minHeight: 20 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--spira-ink-soft)' }}>
                  {CATEGORIA[cat].label}
                </span>
                {filtros[cat].length > 0 && (
                  <button type="button" className="vcal-link spira-no-press" style={{ marginLeft: 'auto' }} onClick={() => onChange({ ...filtros, [cat]: [] })}>
                    Quitar
                  </button>
                )}
              </div>
              <div className="spira-scroll" style={{ display: 'flex', flexDirection: 'column', padding: '0 6px 8px', overflow: 'auto', maxHeight: 240 }}>
                {ordenadas.length === 0 && (
                  <span style={{ padding: '8px', fontSize: 13, color: 'var(--spira-ink-soft)' }}>No hay visitas en este período.</span>
                )}
                {ordenadas.map((valor) => {
                  const on = filtros[cat].includes(valor)
                  const n = conteoFacetado(base, filtros, cat, valor)
                  return (
                    /* Una opción en 0 se atenúa pero NO se deshabilita: marcarla es válido (y dice
                       honestamente que no hay ninguna), y una marcada en 0 tiene que poder destildarse. */
                    <label key={valor} className="vcal-fopt" style={{ opacity: n || on ? 1 : 0.5 }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(valor)} />
                      <span className={'vcal-check' + (on ? ' on' : '')} aria-hidden="true">
                        {on && <Icon name="check" size={12} color="var(--spira-on-accent)" stroke={3} />}
                      </span>
                      {cat === 'estado' && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 9, flexShrink: 0, background: colorEstado(valor) }} />}
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: on ? 600 : 500 }}>
                        {rotulo(cat, valor)}
                      </span>
                      <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-ink-soft)' }}>{n}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: '1px solid var(--spira-line)' }}>
            <button
              type="button"
              className="vcal-link spira-no-press"
              style={{ fontSize: 13, color: total ? 'var(--spira-ink-2)' : undefined, padding: '0 4px' }}
              disabled={!total}
              onClick={() => onChange(SIN_FILTROS)}
            >
              Limpiar todo
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" className="vcal-btn-cta" style={{ width: 'auto', height: 34, padding: '0 16px' }} onClick={() => setAbierto(false)}>
              Ver {resultado} {resultado === 1 ? 'visita' : 'visitas'}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

const ordenEstado = (v: string) => {
  const i = ORDEN_ESTADOS.indexOf(v)
  return i === -1 ? ORDEN_ESTADOS.length : i
}

/**
 * Las fichas de los filtros puestos (handoff §2.2), debajo de la fila: una por valor, con su ×. Es lo
 * que deja ver QUÉ está filtrando la lista sin abrir el panel — el badge del botón sólo dice cuántos.
 */
export function FichasFiltros({ filtros, onChange, rotulo }: {
  filtros: Filtros
  onChange: (f: Filtros) => void
  rotulo: (cat: CategoriaFiltro, valor: string) => string
}) {
  const items = CATEGORIAS.flatMap((c) => filtros[c].map((valor) => ({ c, valor })))
  if (items.length === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: -8 }}>
      {items.map(({ c, valor }) => (
        <span key={c + valor} className="vcal-ficha">
          <span style={{ color: 'var(--spira-ink-soft)' }}>{CATEGORIA[c].label}:</span>
          <b style={{ fontWeight: 600 }}>{rotulo(c, valor)}</b>
          <button
            type="button"
            className="vcal-ficha-x spira-no-press"
            aria-label={`Quitar ${CATEGORIA[c].label.toLowerCase()} ${rotulo(c, valor)}`}
            onClick={() => onChange({ ...filtros, [c]: filtros[c].filter((x) => x !== valor) })}
          >
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      <button
        type="button"
        className="vcal-link spira-no-press"
        style={{ color: 'var(--spira-ink-soft)', padding: '0 6px' }}
        onClick={() => onChange(SIN_FILTROS)}
      >
        Limpiar todo
      </button>
    </div>
  )
}
