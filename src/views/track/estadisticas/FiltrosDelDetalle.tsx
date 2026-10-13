import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../../components/Icon'
import type { IconName } from '../../../components/Icon'
import { usePopover } from '../../../components/usePopover'
import { formatAR } from '../../../lib/dates'
import { FILTROS_VACIOS, filtrarDetalle, opcionesDetalle } from './agregadosEquipo'
import type { FilaDetalle, FiltrosDetalle } from './agregadosEquipo'
import { ESPERA_OPCIONES } from './Equipo'
import '../visitas/visitas.css'
import './estadisticas.css'

type Categoria = 'coord' | 'est' | 'tipo' | 'esp' | 'fecha'

const CATEGORIAS: { k: Categoria; label: string; icon: IconName }[] = [
  { k: 'coord', label: 'Coordinadora', icon: 'users' },
  { k: 'est', label: 'Estudio', icon: 'file' },
  { k: 'tipo', label: 'Tipo de visita', icon: 'activity' },
  { k: 'esp', label: 'Espera', icon: 'clock' },
  { k: 'fecha', label: 'Día', icon: 'calendar' },
]

/** Cuántos de los cinco del panel están puestos. La búsqueda y el orden viven afuera: no cuentan acá. */
const puestos = (f: FiltrosDetalle) => CATEGORIAS.filter((c) => f[c.k]).length

/**
 * El «Filtros» del detalle visita por visita, para el renglón que acompaña (`RenglonEstadisticas`).
 * Junta en un panel los cinco desplegables que ocupaban una caja entera al pie (coordinadora, estudio,
 * tipo, espera y día). Es el panel de Visitas (`visitas/PanelFiltros.tsx`) —mismas clases, mismo
 * comportamiento— con una diferencia de fondo: acá cada categoría admite UN valor, porque las reglas
 * del detalle (`filtrarDetalle`, con test) son de valor único. La marca es redonda, de opción, y
 * tocar la elegida la saca.
 *
 * Aplica en el acto, como en Visitas: la tabla cambia mientras se elige, «Ver N visitas» sólo cierra
 * y «Cancelar» vuelve a como estaba al abrir. Cada opción dice cuántas visitas quedarían si se la
 * eligiera, contando los demás filtros puestos (incluida la búsqueda).
 */
export function FiltrosDelDetalle({ filas, filtros, setFiltros, acento }: {
  filas: FilaDetalle[]
  filtros: FiltrosDetalle
  setFiltros: (f: FiltrosDetalle) => void
  /** El `accentSolid` del módulo: el panel vive en `body` (portal) y vuelve a fijar `--vcal-acc`. */
  acento: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [cat, setCat] = useState<Categoria>('coord')
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(abierto, () => setAbierto(false), true, 'end')
  const n = puestos(filtros)
  const resultado = useMemo(() => filtrarDetalle(filas, filtros).length, [filas, filtros])

  const alAbrir = useRef<FiltrosDetalle>(filtros)
  const cancelar = () => {
    setFiltros(alAbrir.current)
    setAbierto(false)
    triggerRef.current?.focus()
  }

  const catRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { if (abierto && pos) catRef.current?.focus() }, [abierto, pos !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  const opciones = useMemo(() => opcionesDetalle(filas), [filas])
  const valores: { value: string; label: string; titulo?: string }[] =
    cat === 'coord' ? opciones.coordinadoras
      : cat === 'est' ? opciones.estudios.map((e) => ({ value: e.value, label: e.value, titulo: e.nombre }))
        : cat === 'tipo' ? opciones.tipos
          : cat === 'esp' ? ESPERA_OPCIONES.filter((o) => o.value)
            : opciones.fechas.map((d) => ({ value: d, label: formatAR(d) }))

  const poner = (valor: string) => setFiltros({ ...filtros, [cat]: filtros[cat] === valor ? '' : valor } as FiltrosDetalle)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={'vcal-filter' + (n > 0 ? ' con-filtros' : '')}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        onClick={() => { if (!abierto) alAbrir.current = filtros; setAbierto(!abierto) }}
      >
        <Icon name="filter" size={15} color="var(--spira-muted)" />
        Filtros
        {n > 0 && <span className="vcal-badge" aria-label={`${n} ${n === 1 ? 'filtro puesto' : 'filtros puestos'}`}>{n}</span>}
        <Icon name="chevronDown" size={14} color="var(--spira-muted)" style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {abierto && pos && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="Filtros del detalle"
          className="vcal-fpanel vcal-pop"
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 'var(--spira-z-popover)', '--vcal-acc': acento } as CSSProperties}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '170px minmax(0, 1fr)', minHeight: 260 }}>
            <div className="vcal-fcats" role="tablist" aria-orientation="vertical" aria-label="Categorías">
              {CATEGORIAS.map((c) => (
                <button
                  key={c.k}
                  ref={c.k === cat ? catRef : undefined}
                  type="button"
                  role="tab"
                  aria-selected={cat === c.k}
                  className="vcal-fcat spira-no-press"
                  onClick={() => setCat(c.k)}
                >
                  <Icon name={c.icon} size={15} color={cat === c.k ? 'var(--spira-track)' : 'currentColor'} />
                  <span style={{ flex: 1 }}>{c.label}</span>
                  {filtros[c.k] && <span className="vcal-badge">1</span>}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }} role="tabpanel" aria-label={CATEGORIAS.find((c) => c.k === cat)?.label}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px 6px', minHeight: 20 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--spira-ink-soft)' }}>
                  {CATEGORIAS.find((c) => c.k === cat)?.label}
                </span>
                {filtros[cat] && (
                  <button type="button" className="vcal-link spira-no-press" style={{ marginLeft: 'auto' }} onClick={() => setFiltros({ ...filtros, [cat]: '' })}>
                    Quitar
                  </button>
                )}
              </div>
              <div className="spira-scroll" role="radiogroup" aria-label={CATEGORIAS.find((c) => c.k === cat)?.label} style={{ display: 'flex', flexDirection: 'column', padding: '0 6px 8px', overflow: 'auto', maxHeight: 240 }}>
                {valores.length === 0 && (
                  <span style={{ padding: '8px', fontSize: 13, color: 'var(--spira-ink-soft)' }}>No hay visitas atendidas en este período.</span>
                )}
                {valores.map((o) => {
                  const on = filtros[cat] === o.value
                  const cuantas = filtrarDetalle(filas, { ...filtros, [cat]: o.value } as FiltrosDetalle).length
                  return (
                    /* Una opción en 0 se atenúa pero se puede elegir: dice, honestamente, que no hay. */
                    <label key={o.value} className="vcal-fopt" style={{ opacity: cuantas || on ? 1 : 0.5 }} title={o.titulo}>
                      <input
                        type="radio"
                        name={`detalle-${cat}`}
                        checked={on}
                        onChange={() => {}}
                        onClick={() => poner(o.value)}
                      />
                      <span className={'vcal-check est-radio' + (on ? ' on' : '')} aria-hidden="true" />
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: on ? 600 : 500 }}>
                        {o.label}
                        {o.titulo && <span style={{ fontWeight: 400, color: 'var(--spira-ink-soft)' }}> · {o.titulo}</span>}
                      </span>
                      <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-ink-soft)' }}>{cuantas}</span>
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
              style={{ fontSize: 13, color: n ? 'var(--spira-ink-2)' : undefined, padding: '0 4px' }}
              disabled={!n}
              onClick={() => setFiltros({ ...FILTROS_VACIOS, q: filtros.q, orden: filtros.orden })}
            >
              Limpiar todo
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" className="vcal-btn-cta secundario" style={{ width: 'auto', height: 34, padding: '0 14px' }} onClick={cancelar}>
              Cancelar
            </button>
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
