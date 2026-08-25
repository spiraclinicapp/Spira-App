import type { CSSProperties } from 'react'
import { useState } from 'react'
import { PatientLink, PatientLinkArrow } from '../../../components/PatientLink'
import { Icon } from '../../../components/Icon'
import type { IconName } from '../../../components/Icon'
import type { BoardColumn, DispensationRequestRow } from '../../../data/pharma'
import { activeDispensation, constanciaVigente, pendingScans, totalUnits } from '../../../data/pharma'
import { chipExcepcion, COLUMN_META, readyBlockedReason, scanSignal } from './estados'
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
export function KanbanCard({ r, column, canOperate, onOpen, onOpenPatient, onAdvance, busy }: {
  r: DispensationRequestRow
  column: BoardColumn
  canOperate: boolean
  onOpen: () => void
  onOpenPatient?: () => void
  onAdvance: () => void
  busy: boolean
}) {
  const [hover, setHover] = useState(false)
  const [ctaHover, setCtaHover] = useState(false)

  const disp = activeDispensation(r)
  const meds = r.items.map((i) => i.medication?.name ?? 'Medicamento').join(', ')
  const pending = pendingScans(r)
  const cta = ctaFor(column, r)

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
      onKeyDown={(e) => {
        // Solo si el evento nació en la tarjeta misma: sin esta guarda, Enter sobre un control
        // interno —el botón de avanzar, ahora también el link del paciente— dispara SU acción y
        // además abre el cajón.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setCtaHover(false) }}
      style={card}
      aria-label={`${disp?.dispensation_code ?? 'Solicitud'}, paciente ${r.enrollment?.patient?.code ?? 'sin código'}, ${COLUMN_META[column].estado}`}
    >
      {/* 1 · paciente + protocolo */}
      <div className="spira-link-group" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${r.enrollment?.patient?.full_name ?? 'el paciente'}`}>
            {r.enrollment?.patient?.full_name ?? '—'}
          </PatientLink>
        </span>
        <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', flex: '0 0 auto' }}>
          <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${r.enrollment?.patient?.code ?? ''}`}>
            {r.enrollment?.patient?.code ?? '—'}
          </PatientLink>
        </span>
        {onOpenPatient && <PatientLinkArrow />}
        <span className="spira-mono" style={protoChip}>{r.protocol?.code ?? '—'}</span>
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, color: 'var(--spira-acc-deep-warn)' }}>
            {r.items.length > 0 && '· '}<Icon name="flask" size={11} /> IP
          </span>
        )}
        {disp?.dispensation_code && <span className="spira-mono">· {disp.dispensation_code}</span>}
        <span>· {fromNow(r.created_at)}</span>
      </div>

      {/* La que tiene IP y todavía no tiene constancia lo dice ACÁ, no recién al abrir el cajón: es
          la única de la columna que no se puede terminar, y quien la resuelve es Coordinación. */}
      {r.includes_ip && constanciaVigente(r) === null && (
        <Signal icon="fileText" color="var(--spira-acc-deep-warn)" label="Falta la constancia del IP" />
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
          disabled={busy || cta.disabled}
          onClick={(e) => { e.stopPropagation(); onAdvance() }}
          onMouseEnter={() => setCtaHover(true)}
          onMouseLeave={() => setCtaHover(false)}
          style={{
            width: '100%', height: 40, marginTop: 10, border: 'none', borderRadius: 10,
            background: cta.bg, color: cta.fg, fontFamily: 'var(--spira-font-text)',
            // 13 y no 13.5: "Marcar lista para retirar" es la etiqueta más larga del juego y a 13.5
            // rozaba los bordes en una columna de 220px, que es el piso del tablero.
            fontWeight: 600, fontSize: 13, cursor: busy ? 'default' : 'pointer',
            // El deshabilitado conserva su color y baja a 0.6, la convención del sistema y la misma
            // que usa el botón del cajón: es el mismo botón, apagado, no otro botón.
            opacity: busy || cta.disabled ? 0.6 : 1,
            // Y DEJA PASAR EL CLIC. Un `disabled` a secas no dispara el evento ni lo deja burbujear
            // (comprobado en el navegador), así que el objetivo más grande y más obvio de la card
            // se volvía una zona muerta: el clic no marcaba lista —correcto— pero tampoco abría el
            // cajón, que es justo donde está escrito por qué no se puede. Con esto el clic cae en
            // la card y abre el cajón. Solo cuando está bloqueado: durante `busy` el botón sí tiene
            // que tragarse el clic para no disparar dos veces.
            pointerEvents: cta.disabled && !busy ? 'none' : undefined,
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

/**
 * Qué botón muestra la card según la columna. null = sin acción (Entregadas).
 *
 * **UN NOMBRE POR ACCIÓN, EL MISMO ADENTRO Y AFUERA** (Director, 2026-08-11). Estas etiquetas son,
 * carácter por carácter, las de los botones del cajón: la card y el panel hacen exactamente lo
 * mismo, y llamarlo distinto de cada lado obliga a deducir que son la misma cosa. Llegó a haber
 * cinco strings para dos acciones ("Marcar lista", "Marcar lista para retirar", "Continuar",
 * "Marcar entregada", "Marcar como entregado"). Si cambia una, cambian las dos.
 *
 * El bloqueo también se espeja: cuando la acción no se puede hacer, el botón va **deshabilitado con
 * el mismo texto**, igual que en el cajón, y el motivo lo dice la línea de señal de acá arriba
 * ("0/1 escaneados", "Falta la constancia del IP"). Antes cambiaba de nombre a "Continuar" —dos
 * palabras para dos estados de un mismo botón— y no se puede leer como "esto está frenado".
 * Para entrar a resolverlo está la card entera, que abre el cajón.
 */
function ctaFor(column: BoardColumn, r: DispensationRequestRow): {
  label: string; bg: string; fg: string; disabled?: boolean
} | null {
  if (column === 'solicitada') {
    return { label: 'Preparar', bg: 'var(--spira-pharma-solid)', fg: 'var(--spira-on-accent)' }
  }
  if (column === 'preparando') {
    return {
      label: 'Marcar lista para retirar',
      bg: COLUMN_META.lista.color, fg: '#fff',
      disabled: readyBlockedReason(r) !== null,
    }
  }
  if (column === 'lista') {
    // El botón no entrega nada: la entrega la hace la farmacéutica en el mostrador, con la
    // medicación en la mano. Acá se REGISTRA que ya ocurrió.
    return { label: 'Marcar como entregado', bg: COLUMN_META.lista.color, fg: '#fff' }
  }
  return null
}

const protoChip: CSSProperties = {
  marginLeft: 'auto', fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
  background: 'rgba(15, 95, 87, 0.14)', color: 'var(--spira-pharma-solid)',
}
