import type { CSSProperties } from 'react'
import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import type { IconName } from '../../../components/Icon'
import type { BoardColumn, DispensationRequestRow } from '../../../data/pharma'
import { activeDispensation, constanciaVigente, pendingScans, totalUnits } from '../../../data/pharma'
import { chipExcepcion, COLUMN_META, scanSignal } from './estados'
import { fromNow } from '../../../lib/dates'

/**
 * Card de una solicitud en el tablero. Anatomía del handoff, respetada al pie:
 *
 *   ┌──────────────────────────────────────┐
 *   │ (av) P-204              [RG-3041]    │  ← paciente arriba, junto al avatar
 *   │ Alvetide 92/22 mcg, Donepecilo 10 mg │
 *   │ 3 u. · D-1046 · hace 4 min           │  ← nº de dispensación abajo, con las unidades
 *   │ ▣ 1/2 escaneados                     │  ← solo en Preparando / Listas
 *   │ ┌──────────────────────────────────┐ │
 *   │ │            Preparar              │ │  ← CTA a ancho completo
 *   │ └──────────────────────────────────┘ │
 *   └──────────────────────────────────────┘
 *
 * La jerarquía nº-paciente-arriba / nº-dispensación-abajo es una decisión explícita del handoff
 * ("respetar esta jerarquía"): la farmacéutica busca por paciente, no por número de trámite.
 *
 * DOS ZONAS DE CLICK. La card entera abre el cajón y el CTA avanza el estado. Para que no se
 * pisen: el CTA frena la propagación, ocupa el ancho completo con 40px de alto, y al pasarle el
 * mouse la card NO toma su hover de elevación (solo se resalta el botón). Así se ve que son dos
 * objetivos distintos y no un accidente de 2px.
 */
export function KanbanCard({ r, column, canOperate, onOpen, onAdvance, busy }: {
  r: DispensationRequestRow
  column: BoardColumn
  canOperate: boolean
  onOpen: () => void
  onAdvance: () => void
  busy: boolean
}) {
  const [hover, setHover] = useState(false)
  const [ctaHover, setCtaHover] = useState(false)

  const disp = activeDispensation(r)
  const meds = r.items.map((i) => i.medication?.name ?? 'Medicamento').join(', ')
  const pending = pendingScans(r)
  const cta = ctaFor(column, pending)

  const card: CSSProperties = {
    background: 'var(--spira-white)',
    border: `1px solid ${hover && !ctaHover ? 'var(--spira-line-2)' : 'var(--spira-line)'}`,
    borderRadius: 12,
    padding: '12px 13px',
    boxShadow: hover && !ctaHover ? 'var(--spira-shadow-md)' : 'var(--spira-shadow-sm)',
    cursor: 'pointer',
    transition: 'box-shadow .15s, border-color .15s',
    textAlign: 'left',
    width: '100%',
    display: 'block',
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setCtaHover(false) }}
      style={card}
      aria-label={`${disp?.dispensation_code ?? 'Solicitud'}, paciente ${r.visit?.enrollment?.patient?.code ?? 'sin código'}, ${COLUMN_META[column].one}`}
    >
      {/* 1 · paciente + protocolo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          {r.visit?.enrollment?.patient?.full_name ?? '—'}
        </span>
        <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', flex: '0 0 auto' }}>
          {r.visit?.enrollment?.patient?.code ?? '—'}
        </span>
        <span className="spira-mono" style={protoChip}>{r.visit?.enrollment?.protocol?.code ?? '—'}</span>
      </div>

      {/* 1b · la excepción viaja hasta acá (D11). Una dispensación fuera de cronograma le cambia el
          trabajo a la farmacéutica —ahí sí tiene motivo para chequear dos veces— y enterarse recién
          al abrir el cajón es enterarse tarde. El motivo completo va adentro; en la card, el aviso. */}
      {r.off_schedule && (
        <div style={{ ...chipExcepcion, marginBottom: 6 }}>
          <Icon name="info" size={11} stroke={2.4} />
          Fuera de cronograma
        </div>
      )}

      {/* 2 · qué se dispensa. Con cero renglones (IP solo) la línea quedaría VACÍA: se dice qué es,
          que además es la información que hace entendible el "0 u." que no mostramos abajo. */}
      <div style={{ fontSize: 12.5, color: 'var(--spira-ink)', lineHeight: 1.4, marginBottom: 5 }}>
        {meds || (r.includes_ip ? 'Producto en investigación' : '—')}
      </div>

      {/* 3 · unidades · código de dispensación · cuándo llegó
          El código (D-1-180726-YM) se sella al marcar lista, así que en Solicitadas y Preparando
          todavía no existe: ahí la card no muestra ninguno en vez de inventar un provisorio.
          Las unidades solo si hay renglones: "0 u." en un pedido de IP solo no es un dato, es una
          resta mal hecha (el IP no se cuenta en unidades sino en kits, y recién al entregar). */}
      <div style={{ display: 'flex', gap: 5, fontSize: 11, color: 'var(--spira-muted)', flexWrap: 'wrap' }}>
        {r.items.length > 0 && <span>{totalUnits(r)} u.</span>}
        {r.includes_ip && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, color: 'var(--spira-acc-deep-pharma)' }}>
            {r.items.length > 0 && '· '}<Icon name="flask" size={11} /> IP
          </span>
        )}
        {disp?.dispensation_code && <span className="spira-mono">· {disp.dispensation_code}</span>}
        <span>· {fromNow(r.created_at)}</span>
      </div>

      {/* La que tiene IP y todavía no tiene constancia lo dice ACÁ, no recién al abrir el cajón: es
          la única de la columna que no se puede terminar, y quien la resuelve es Coordinación. */}
      {r.includes_ip && constanciaVigente(r) === null && (
        <Signal icon="fileText" color="var(--spira-acc-deep-pharma)" label="Falta la constancia del IP" />
      )}

      {/* 4 · señal de estado: ícono + color + texto (nunca color solo)
          Sin renglones no hay escaneo: "0/0 escaneados" con el tilde de completo sobre un pedido de
          IP solo dice que se terminó algo que nunca existió. */}
      {column === 'preparando' && r.items.length > 0 && (
        <Signal {...scanSignal(pending, r.items.length)} />
      )}
      {column === 'lista' && disp && (
        <Signal icon="check" color={COLUMN_META.lista.color} label={`Verificada · Comp. N° ${disp.correlative_number}`} />
      )}

      {/* 5 · CTA o comprobante */}
      {cta && canOperate ? (
        <button
          type="button"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); onAdvance() }}
          onMouseEnter={() => setCtaHover(true)}
          onMouseLeave={() => setCtaHover(false)}
          style={{
            width: '100%', height: 40, marginTop: 10, border: 'none', borderRadius: 10,
            background: cta.bg, color: cta.fg, fontFamily: 'var(--spira-font-text)',
            fontWeight: 600, fontSize: 13.5, cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Un momento…' : cta.label}
        </button>
      ) : column === 'entregada' && disp ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, fontSize: 11.5, color: 'var(--spira-muted)' }}>
          <Icon name="receipt" size={13} />
          Comp. N° <b className="spira-mono">{disp.correlative_number}</b>
        </div>
      ) : null}
    </div>
  )
}

function Signal({ icon, color, label }: { icon: IconName; color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11.5, color, fontWeight: 600 }}>
      <Icon name={icon} size={13} />
      {label}
    </div>
  )
}

/** Qué botón muestra la card según la columna. null = sin acción (Entregadas). */
function ctaFor(column: BoardColumn, pending: number): { label: string; bg: string; fg: string } | null {
  if (column === 'solicitada') {
    return { label: 'Preparar', bg: 'var(--spira-pharma-solid)', fg: 'var(--spira-on-accent)' }
  }
  if (column === 'preparando') {
    return pending === 0
      ? { label: 'Marcar lista', bg: COLUMN_META.lista.color, fg: '#fff' }
      : { label: 'Continuar', bg: COLUMN_META.preparando.color, fg: '#fff' }
  }
  if (column === 'lista') {
    return { label: 'Entregar', bg: COLUMN_META.lista.color, fg: '#fff' }
  }
  return null
}

const protoChip: CSSProperties = {
  marginLeft: 'auto', fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
  background: 'rgba(168, 132, 47, 0.14)', color: 'var(--spira-pharma-solid)',
}
