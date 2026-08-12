import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import type { BoardColumn, DispensationRequestRow } from '../../../data/pharma'
import { COLUMN_META, PASOS, readyBlockedReason, requisitos } from './estados'

/**
 * El riel de proceso del cajón: dónde estás, qué falta, y qué te bloquea.
 *
 * REEMPLAZA A `StepBar`, la barra horizontal de tres tramos. El cambio no es decorativo: la barra
 * decía en qué paso estabas y nada más, así que el motivo del bloqueo vivía suelto arriba de los
 * botones, a media pantalla de distancia del trabajo que lo resolvía. Acá los requisitos del paso
 * actual se despliegan DENTRO de su nodo, con su contador, y el pie del riel resume el bloqueo.
 *
 *   ○ Preparar y escanear        ← nodo actual: halo petróleo
 *   │  ┌───────────────────────┐
 *   │  │ ✓ Constancia impresa  │ ← .ok
 *   │  │ ◉ Alvetide       1/3  │ ← .on = el primero pendiente, resaltado
 *   │  │ ○ Ibuprofeno     0/2  │
 *   │  └───────────────────────┘
 *   ○ Lista para retirar
 *   │
 *   ○ Entregar
 *   ─────────────────────────────
 *   ● Faltan 4 unidades por escanear   ← .railfoot
 *
 * Los requisitos NO se calculan acá: salen de `requisitos()`, la misma función de la que el pie del
 * panel deriva su motivo. Si se calcularan dos veces, el riel podría decir "falta uno" mientras el
 * botón está habilitado.
 */
export function RailProceso({ r, actual }: {
  r: DispensationRequestRow
  actual: BoardColumn
}) {
  const idx = PASOS.indexOf(actual)
  const reqs = requisitos(r)
  const bloqueo = readyBlockedReason(r)
  // El primer pendiente es el único que va resaltado: es lo que hay que hacer AHORA. Resaltar todos
  // los pendientes convierte la lista en una pared de urgencias y no dice por dónde empezar.
  const idPrimerPendiente = reqs.find((q) => !q.cumplido)?.id ?? null

  return (
    <div style={rail}>
      <div className="spira-eyebrow" style={{ marginBottom: 16 }}>Proceso</div>

      {/* La espina es un pseudo-elemento en CSS real (`.spira-rail-flow::before`), no un div: así el
          tramo recorrido se apila encima sin pelearse por el z-index con los nodos. */}
      <ol className="spira-rail-flow" style={flow}>
        {/* Tramo recorrido. Alto por paso, como el mock: 0% en el primero (no hay nada atrás),
            38% en el segundo, 76% en el tercero. */}
        <i aria-hidden style={{ ...prog, height: `${[0, 38, 76][Math.max(idx, 0)]}%` }} />

        {PASOS.map((key, i) => {
          const done = i < idx
          const cur = i === idx
          return (
            <li key={key} style={node} aria-current={cur ? 'step' : undefined}>
              <span
                style={{
                  ...dot,
                  ...(done ? dotDone : {}),
                  ...(cur ? dotCur : {}),
                }}
              >
                {/* Cumplido muestra tilde en vez del número: el número ya no informa nada. */}
                {done ? <Icon name="check" size={13} stroke={2.6} /> : i + 1}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...tt, ...(done ? ttDone : {}), ...(cur ? ttCur : {}) }}>
                  {COLUMN_META[key].paso}
                </div>

                {/* Los requisitos se despliegan SOLO en el nodo actual y SOLO mientras se prepara.
                    `requisitos()` enumera lo que hace falta para marcar lista: la constancia y las
                    unidades a escanear. En "Lista para retirar" y "Entregar" eso ya es historia, y
                    colgarlo del nodo actual leería como si hiciera falta escanear para poder
                    entregar — un requisito inventado sobre trabajo que ya se hizo.
                    El mock define requisitos propios para el paso 2 ("Comprobante emitido ✓",
                    "Imprimir para el mostrador"), pero ninguno BLOQUEA: se puede entregar sin
                    imprimir. Un tilde que no gatea nada convierte la lista en decoración, así que
                    esa fila no se dibuja — el comprobante ya se ve, y grande, en el panel. */}
                {cur && actual === 'preparando' && reqs.length > 0 && (
                  <ul style={reqsCard}>
                    {reqs.map((q, j) => {
                      const on = q.id === idPrimerPendiente
                      return (
                        <li
                          key={q.id}
                          style={{
                            ...req,
                            ...(j > 0 ? { borderTop: '1px solid var(--spira-line)' } : {}),
                            ...(q.cumplido ? reqOk : {}),
                            ...(on ? reqOn : {}),
                          }}
                        >
                          <span style={glifo}>
                            {q.cumplido
                              ? <Icon name="check" size={13} color="var(--spira-good)" stroke={2.6} />
                              : <span style={{ ...aro, ...(on ? aroOn : {}) }} />}
                          </span>

                          <span style={reqTexto} title={q.texto}>{q.texto}</span>

                          {q.conteo && (
                            <span
                              className="spira-mono"
                              style={{
                                ...ct,
                                color: q.cumplido
                                  ? 'var(--spira-good)'
                                  : on ? 'var(--spira-primary-deep)' : 'var(--spira-faint)',
                              }}
                            >
                              {q.conteo.hechas}/{q.conteo.total}
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {/* Pie: el resumen del bloqueo. Es el MISMO texto que el pie del panel, leído de la misma
          función — no una segunda redacción que pueda quedar desfasada. */}
      <div style={railFoot} role="status">
        {bloqueo ? (
          <>
            <span aria-hidden style={pend} />
            <span>{bloqueo.text}</span>
          </>
        ) : (
          <>
            <Icon name="check" size={13} color="var(--spira-good)" stroke={2.6} />
            <span>Sin pendientes</span>
          </>
        )}
      </div>
    </div>
  )
}

const rail: CSSProperties = {
  width: 240, flex: '0 0 240px', background: 'var(--spira-surface)',
  borderRight: '1px solid var(--spira-line)', padding: '18px 15px',
  display: 'flex', flexDirection: 'column', overflowY: 'auto',
}

const flow: CSSProperties = {
  position: 'relative', listStyle: 'none', margin: 0, padding: 0,
}

const prog: CSSProperties = {
  position: 'absolute', left: 11.5, top: 14, width: 1.5,
  background: 'rgba(46, 125, 116, 0.5)', transition: 'height 0.18s',
}

const node: CSSProperties = {
  display: 'flex', gap: 11, paddingBottom: 16, position: 'relative',
}

const dot: CSSProperties = {
  width: 24, height: 24, flex: '0 0 auto', borderRadius: '50%',
  display: 'grid', placeItems: 'center',
  // Tipografía de TEXTO y no mono: se probó mono y se descartó (handoff §10, decisión 8) porque a
  // 12px se veía fino y ópticamente descentrado dentro del círculo.
  fontFamily: 'var(--spira-font-text)', fontSize: 12, fontWeight: 700, lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
  border: '1.5px solid var(--spira-line-2)', color: 'var(--spira-faint)',
  background: 'var(--spira-surface)', zIndex: 1,
}

const dotCur: CSSProperties = {
  background: 'var(--spira-primary)', borderColor: 'var(--spira-primary)', color: '#fff',
  boxShadow: '0 0 0 3px rgba(15, 95, 87, 0.16)',
}

const dotDone: CSSProperties = {
  background: 'rgba(46, 125, 116, 0.14)', borderColor: 'rgba(46, 125, 116, 0.5)',
  color: 'var(--spira-track)',
}

const tt: CSSProperties = {
  fontSize: 13, color: 'var(--spira-muted)', lineHeight: 1.3, paddingTop: 3,
}
const ttCur: CSSProperties = { color: 'var(--spira-ink)', fontWeight: 700 }
const ttDone: CSSProperties = { color: 'var(--spira-ink-soft)' }

const reqsCard: CSSProperties = {
  listStyle: 'none', margin: '9px 0 0', padding: 0,
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 10, overflow: 'hidden',
}

const req: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px',
  fontSize: 11.5, color: 'var(--spira-muted)', lineHeight: 1.25,
}

const reqOk: CSSProperties = { color: 'var(--spira-ink-soft)' }

const reqOn: CSSProperties = {
  color: 'var(--spira-ink)', fontWeight: 600, background: 'rgba(15, 95, 87, 0.08)',
}

const glifo: CSSProperties = {
  width: 13, height: 13, flex: '0 0 auto', display: 'grid', placeItems: 'center',
}

const aro: CSSProperties = {
  width: 9, height: 9, borderRadius: '50%',
  // Longhands y NUNCA la abreviada `border`: el resaltado del primer pendiente cambia color y grosor,
  // y mezclar abreviada con longhand deja el borde roto al salir del estado (ver CLAUDE.md).
  borderWidth: 1.5, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
}

const aroOn: CSSProperties = { borderWidth: 2.5, borderColor: 'var(--spira-primary)' }

/** Con contador, el texto trunca: el `n/total` es lo que no puede perderse. */
const reqTexto: CSSProperties = {
  flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}

const ct: CSSProperties = { fontSize: 10.5, flex: '0 0 auto' }

const railFoot: CSSProperties = {
  marginTop: 'auto', paddingTop: 18, display: 'flex', alignItems: 'flex-start', gap: 8,
  fontSize: 11.5, color: 'var(--spira-ink-soft)', lineHeight: 1.35,
}

const pend: CSSProperties = {
  width: 7, height: 7, flex: '0 0 auto', borderRadius: '50%',
  background: 'var(--spira-warn)', marginTop: 4,
}
