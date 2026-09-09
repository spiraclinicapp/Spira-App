import type { CSSProperties } from 'react'
import { btnOutline } from '../../../components/buttons'
import { PatientLink, PatientLinkArrow } from '../../../components/PatientLink'
import type { HistorialFilaRow } from '../../../data/pharma'
import { agruparPorDia, detalleDeFila, tituloDeFila } from '../../../data/pharma'
import { badgeDeHistorial, CHIP_AMBULATORIA } from './estados'
import { dayGroupLabel, fromNow } from '../../../lib/dates'

/**
 * Historial agrupado por día (vista 2 del handoff). A diferencia del tablero, acá el orden es
 * cronológico y no por estado: la pregunta que responde es "qué pasó", no "qué falta hacer".
 *
 * Se agrupa por `ordenado_por` —el `updated_at` de la solicitud, el `created_at` de la salida— y
 * no por la fecha de alta: una solicitud de ayer entregada hoy pertenece al día en que se trabajó,
 * que es lo que la farmacéutica busca cuando revisa la jornada.
 *
 * Paginado de verdad (`hasMore` + "Cargar más"): la versión vieja de esta pantalla traía todo el
 * histórico sin límite.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 * │ DOS FUENTES, UN SOLO RENGLÓN (0117)                                                       │
 * │                                                                                           │
 * │ Desde la revisión del 2026-09-08 acá también viven las SALIDAS AMBULATORIAS: entregas a   │
 * │ alguien que no es paciente de ningún estudio. Antes se miraban en un bloque aparte al pie │
 * │ de Stock, y eso obligaba a mirar en dos lados para responder una sola pregunta.           │
 * │                                                                                           │
 * │ Vienen INTERCALADAS por día, no en una sección propia: en una lista cronológica, apartar  │
 * │ una clase de fila es decir que pasó en otro momento. Lo que las distingue es el chip azul  │
 * │ "Ambulatoria" —con la palabra, no sólo el color— y que el nombre no lleva link, porque no  │
 * │ hay ficha que abrir.                                                                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function HistorialPorDias({ rows, hasMore, loading, onOpen, onOpenPatient, onMore }: {
  rows: HistorialFilaRow[]
  hasMore: boolean
  loading: boolean
  onOpen: (f: HistorialFilaRow) => void
  onOpenPatient?: (f: HistorialFilaRow) => (() => void) | undefined
  onMore: () => void
}) {
  const grupos = agruparPorDia(rows, dayGroupLabel)

  return (
    <div style={wrap}>
      {grupos.map((g) => (
        <section key={g.dia} style={{ marginBottom: 22 }}>
          <header style={cabecera}>
            <span className="spira-eyebrow">{g.dia}</span>
            <span style={linea} />
            <span className="spira-mono" style={contador}>{g.filas.length}</span>
          </header>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {g.filas.map((f) => <Fila key={f.id} f={f} onOpen={() => onOpen(f)} onOpenPatient={onOpenPatient?.(f)} />)}
          </div>
        </section>
      ))}

      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 8 }}>
          <button type="button" onClick={onMore} disabled={loading} style={{ ...btnOutline, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Cargando…' : 'Cargar más'}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Un renglón, con las dos formas.
 *
 * La geometría es la MISMA para las dos —mismas columnas, mismo alto, mismos estilos— y lo único
 * que ramifica es qué va en cada lugar. Dibujar la ambulatoria con otra caja la sacaría de la
 * grilla y haría que la lista se leyera como dos listas apiladas.
 */
function Fila({ f, onOpen, onOpenPatient }: { f: HistorialFilaRow; onOpen: () => void; onOpenPatient?: () => void }) {
  const meta = badgeDeHistorial(f)
  const ambulatoria = f.tipo === 'ambulatoria'
  /* El link vive donde hay ficha, y esa verdad la dice el DATO (`destinatario_id`), no el tipo:
     una de protocolo cuyo paciente no se pudo resolver degrada al mismo texto pelado. */
  const conFicha = !ambulatoria && f.destinatario_id !== null && onOpenPatient !== undefined

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        // Solo si el evento nació en la fila misma: sin esta guarda, Enter sobre el link del
        // paciente dispara SU acción y además abre el cajón.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() }
      }}
      style={fila}
      aria-label={`${tituloDeFila(f)}, ${meta.label}`}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="spira-link-group" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* En la de protocolo el título es el CÓDIGO y el nombre va al lado; en la ambulatoria
              no hay código que sellar, así que la identidad de la fila es la persona que retiró
              (ver `tituloDeFila`). Por eso el nombre sube al lugar de display en ese caso, y
              abajo no se repite. */}
          <span style={titulo}>{tituloDeFila(f)}</span>

          {!ambulatoria && (
            <span style={{ fontSize: 13, color: 'var(--spira-ink)' }}>
              · <PatientLink onOpen={conFicha ? onOpenPatient : undefined} label={`Abrir la ficha de ${f.destinatario}`}>
                  {f.destinatario}
                </PatientLink>
            </span>
          )}

          {/* El IVRS del paciente, o el documento de quien retiró. El placeholder va AFUERA del
              link: un guion no es un destino clickeable. En la ambulatoria el documento es
              OPCIONAL (0116), así que puede no haber nada — y ahí no se dibuja nada, en vez de
              un "Sin documento" que sugiere que faltó cargarlo. */}
          {f.destinatario_ref
            ? (
              <span className="spira-mono" style={ref}>
                {conFicha
                  ? <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${f.destinatario_ref}`}>{f.destinatario_ref}</PatientLink>
                  : f.destinatario_ref}
              </span>
              )
            : !ambulatoria && <span className="spira-mono" style={ref}>Sin IVRS</span>}

          {conFicha && <PatientLinkArrow />}

          {ambulatoria
            ? <span style={{ ...chip, background: CHIP_AMBULATORIA.tint, color: CHIP_AMBULATORIA.color }}>{CHIP_AMBULATORIA.label}</span>
            : <span className="spira-mono" style={chipProto}>{f.protocol_code ?? '—'}</span>}
        </div>
        <div style={linea2}>{detalleDeFila(f)}</div>
      </div>

      <span style={{ ...badge, background: meta.tint, color: meta.color }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color }} />
        {meta.label}
      </span>

      <span style={{ fontSize: 11.5, color: 'var(--spira-muted)', minWidth: 64, textAlign: 'right' }}>
        {fromNow(f.ordenado_por)}
      </span>

      {/* Sin CTA acá: el historial es para mirar. Lo accionable vive en el tablero; si algo sigue
          pendiente, la fila abre el cajón igual.
          La columna del comprobante queda vacía en la ambulatoria y eso es lo correcto: no emite
          ninguno, y poner un guion sugeriría que se le perdió el número. */}
      <span className="spira-mono" style={{ fontSize: 11.5, color: 'var(--spira-muted)', minWidth: 54, textAlign: 'right' }}>
        {f.correlativo !== null ? `N° ${f.correlativo}` : ''}
      </span>
    </div>
  )
}

const wrap: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }

const cabecera: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, marginBottom: 11,
}

const linea: CSSProperties = { flex: 1, height: 1, background: 'var(--spira-line)' }

const contador: CSSProperties = {
  fontSize: 12, fontWeight: 700, color: 'var(--spira-muted)',
  background: 'var(--spira-surface)', borderRadius: 999, padding: '2px 9px',
}

const fila: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px',
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 13,
  cursor: 'pointer', textAlign: 'left',
}

const titulo: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontSize: 15, fontWeight: 700, color: 'var(--spira-ink)',
}

const ref: CSSProperties = { fontSize: 12, color: 'var(--spira-muted)' }

const linea2: CSSProperties = {
  fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 3,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}

const chip: CSSProperties = {
  fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
}

const chipProto: CSSProperties = {
  ...chip,
  background: 'rgba(15, 95, 87, 0.14)', color: 'var(--spira-acc-deep-track)',
}

const badge: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600,
  padding: '4px 10px', borderRadius: 999, flex: '0 0 auto',
}
