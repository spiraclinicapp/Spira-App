import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import type { DispensationLineRow, RequestItemRow } from '../../../data/pharma'
import { fraccion, unidadesEscaneadas } from '../../../data/pharma'

/**
 * Fila de un renglón, compartida por los cuatro paneles del cajón.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │▓▓▓▓▓▓▓▓▓▓░░░░░░░░  ← .fill: el avance en unidades, de fondo   │
 *   │ ◕  Alvetide 92/22 mcg      │ FÁRMACO          [Sustituir]    │
 *   │2/3 inhalador · falta 1 u.  │ Salmeterol +                    │
 *   │                            │ fluticasona                     │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Dos fuentes distintas según el momento:
 *   · Mientras se prepara → `RequestItemRow` (lo PEDIDO). El lote todavía no se eligió, así que
 *     dice "por asignar (FEFO)": es la verdad, no un placeholder.
 *   · Desde que está lista → `DispensationLineRow` (lo PREPARADO), con lote y vencimiento reales
 *     tomados del snapshot que se imprime en el comprobante.
 *
 * El MODO es explícito y no se deduce de que un campo venga en null. Antes `scanned: boolean | null`
 * hacía doble trabajo —el dato y el modo— y con `null` significando "solo lectura"; sumarle el dial
 * y la sustitución lo volvía ilegible.
 */
export function ItemRow({
  name, dosis, drug, unidades, quantity, pct, lot, modo, onUnscan, accionExtra,
}: {
  name: string
  dosis: string | null
  /** Principio activo, columna FÁRMACO. Se eligió el fármaco y no el lote: habilita sustituir rápido
   *  y el lote no aporta a la decisión del mostrador. */
  drug: string | null
  /** Unidades ya confirmadas con el lector. */
  unidades: number
  quantity: number
  /** Fracción completa (0..1) para el anillo del dial. La calcula `fraccion()` en el modelo, que es
   *  donde está testeada la guarda del `quantity: 0` — recalcularla acá sería una segunda
   *  definición de "cuánto va", con su propio agujero por descubrir. */
  pct: number
  /** Lote real, o null si todavía no se asignó (se muestra la leyenda FEFO). */
  lot: string | null
  /** `'escaneo'` = se está preparando (dial, deshacer, sustituir). `'lectura'` = ya no se toca. */
  modo: 'escaneo' | 'lectura'
  onUnscan?: () => void
  /** Botón propio a la derecha (hoy: Sustituir). Solo se dibuja en modo escaneo. */
  accionExtra?: React.ReactNode
}) {
  const completo = unidades >= quantity
  const faltan = Math.max(quantity - unidades, 0)

  return (
    <div style={{ ...row, ...(completo ? rowFull : {}) }}>
      {/* Barra de avance DE FONDO, no una barrita aparte: la fila entera se va llenando, que es la
          señal más barata de leer de reojo mientras se pasan cajas por el lector. */}
      {modo === 'escaneo' && (
        <div aria-hidden style={{ ...fill, width: `${pct * 100}%` }} />
      )}

      <div style={inner}>
        {modo === 'escaneo' ? (
          <Dial unidades={unidades} quantity={quantity} completo={completo} pct={pct} />
        ) : (
          <span style={{ color: 'var(--spira-faint)', flex: '0 0 auto', display: 'flex' }}>
            <Icon name="barcode" size={16} />
          </span>
        )}

        <div style={{ flex: '1 1 auto', minWidth: 150 }}>
          <div style={nombre} title={name}>{name}</div>
          <div style={meta}>
            {modo === 'escaneo' ? (
              <>
                {dosis && <>{dosis} · </>}
                {completo ? 'completo' : faltan === 1 ? 'falta 1 u.' : `faltan ${faltan} u.`}
              </>
            ) : (
              <>
                {dosis && <>{dosis} · </>}
                <span className="spira-mono">{lot ? `lote ${lot}` : '— por asignar (FEFO)'}</span>
              </>
            )}
          </div>
        </div>

        {/* Columna FÁRMACO. Solo cuando hay droga cargada: un rótulo con la celda vacía ocupa el
            mismo ancho y no dice nada. */}
        {drug && (
          <div style={{ ...fcol, borderLeftColor: completo ? 'rgba(92, 138, 90, 0.26)' : 'var(--spira-line)' }}>
            <div className="spira-eyebrow" style={{ fontSize: 9.5, letterSpacing: '0.11em' }}>Fármaco</div>
            {/* Envuelve en varias líneas, NO trunca: "Salmeterol + fluticasona" cortado a
                "Salmeterol + fluti…" pierde justo la parte que distingue una alternativa de otra. */}
            <div style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.25 }}>{drug}</div>
          </div>
        )}

        {modo === 'lectura' ? (
          <span className="spira-mono" style={cantidad}>
            {quantity}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--spira-muted)' }}> u.</span>
          </span>
        ) : completo ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
            <Icon name="check" size={16} color="var(--spira-good)" stroke={2.4} />
            {/* Corregir un escaneo equivocado sin cancelar toda la preparación. Vuelve el renglón
                a cero: es lo que hace "Cancelar" en el mock, y con el conteo por unidad dejar el
                renglón a medias sería adivinar cuál de las pasadas estuvo mal. */}
            {onUnscan && (
              <button type="button" onClick={onUnscan} title={`Deshacer el escaneo de ${name}`} style={cancelBtn}>
                Cancelar
              </button>
            )}
          </span>
        ) : (
          accionExtra ?? null
        )}
      </div>
    </div>
  )
}

/**
 * El dial: un anillo `conic-gradient` con el centro vaciado por un pseudo-círculo blanco encima.
 * Se dibuja con dos capas y no con un SVG porque son dos divs y cero dependencias.
 */
function Dial({ unidades, quantity, completo, pct }: {
  unidades: number
  quantity: number
  completo: boolean
  pct: number
}) {
  const color = completo ? 'var(--spira-good)' : 'var(--spira-primary)'
  return (
    <span
      style={{
        ...dial,
        background: `conic-gradient(${color} ${pct}turn, var(--spira-line) ${pct}turn)`,
      }}
      aria-hidden
    >
      <span style={{ ...dialCentro, background: completo ? '#F1F6F0' : 'var(--spira-white)' }}>
        {/* Tipografía de TEXTO, no mono (handoff §10, decisión 8): en mono se veía fino y
            ópticamente descentrado dentro del círculo. */}
        <span style={{ ...dialTexto, color: completo ? 'var(--spira-good)' : 'var(--spira-primary-deep)' }}>
          {unidades}/{quantity}
        </span>
      </span>
    </span>
  )
}

/**
 * Adapta un renglón pedido.
 *
 * `modo` es un parámetro y no algo fijo: la MISMA fila se muestra durante la preparación (con dial
 * y acciones) y en el panel de una solicitud rechazada, donde ya no se toca nada.
 */
export function fromRequestItem(i: RequestItemRow, modo: 'escaneo' | 'lectura' = 'escaneo') {
  return {
    name: i.medication?.name ?? 'Medicamento',
    dosis: i.medication?.dosis ?? null,
    drug: i.medication?.drug?.name ?? null,
    unidades: unidadesEscaneadas(i),
    quantity: i.quantity,
    pct: fraccion(i),
    lot: null,
    modo,
  }
}

/** Adapta un renglón ya preparado (con lote real del snapshot). */
export function fromDispensationLine(l: DispensationLineRow) {
  return {
    name: l.medication?.name ?? 'Medicamento',
    dosis: null,
    drug: null,
    unidades: l.quantity,
    quantity: l.quantity,
    // Un renglón ya preparado está completo por definición: lo que se ve es lo que se entregó.
    pct: 1,
    lot: l.lot_number,
    modo: 'lectura' as const,
  }
}

const row: CSSProperties = {
  position: 'relative', background: 'var(--spira-white)',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
  borderRadius: 12, overflow: 'hidden',
}

const rowFull: CSSProperties = { borderColor: 'rgba(92, 138, 90, 0.4)' }

const fill: CSSProperties = {
  position: 'absolute', left: 0, top: 0, bottom: 0,
  background: 'rgba(92, 138, 90, 0.13)', transition: 'width 0.18s',
}

const inner: CSSProperties = {
  position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 15px',
}

const dial: CSSProperties = {
  width: 50, height: 50, flex: '0 0 auto', borderRadius: '50%',
  display: 'grid', placeItems: 'center',
}

const dialCentro: CSSProperties = {
  width: 42, height: 42, borderRadius: '50%', display: 'grid', placeItems: 'center',
}

const dialTexto: CSSProperties = {
  fontFamily: 'var(--spira-font-text)', fontSize: 13, fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
}

const nombre: CSSProperties = {
  fontSize: 14.5, fontWeight: 600, lineHeight: 1.25, color: 'var(--spira-ink)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}

const meta: CSSProperties = { fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 3 }

const fcol: CSSProperties = {
  flex: '0 1 92px', minWidth: 0, paddingLeft: 12,
  borderLeftWidth: 1, borderLeftStyle: 'solid',
}

const cantidad: CSSProperties = {
  fontSize: 13, fontWeight: 700, color: 'var(--spira-ink)', flex: '0 0 auto',
}

const cancelBtn: CSSProperties = {
  border: 'none', background: 'transparent', borderRadius: 7, padding: '4px 7px',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12,
  color: 'var(--spira-muted)', cursor: 'pointer',
}
