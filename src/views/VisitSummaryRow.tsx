import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { PatientLink, PatientLinkArrow } from '../components/PatientLink'
import { visitCode } from '../lib/visits'
import { KIND_LABELS } from '../lib/visitLabels'
import type { TrackVisitRow } from '../data/visits'
import type { DayProcedureSummary } from '../data/procedures'
import { ProtoTag, ProcDots } from './visitAtoms'

/**
 * Fila de VISITA de los resúmenes: la usan "Tu día" (Inicio) y "Próximas visitas · 7 días"
 * (Coordinación). Trae el vocabulario de Visitas del día —nombre de titular, etiqueta de
 * protocolo, pastilla de visita— a una columna que es menos de la mitad de ancha.
 *
 * NO dibuja alertas, aunque una alerta sea también un `TrackVisitRow`. Comparten el tipo de dato
 * pero no la forma: la alerta se señala con una superficie teñida por severidad (ver
 * `alertItem.ts`), y eso no es un renglón. Compartir tipo no es compartir forma.
 *
 * EL PRESUPUESTO DE ANCHO manda acá, y está medido, no estimado. Con el shell real (riel 64 +
 * submenú 220 + padding 26×2) una columna de la grilla `1fr 1fr` deja ~505 px a 1440 de viewport,
 * y de ahí hay que descontar el chip. El vocabulario de la línea 2 mide 340 px con las fuentes
 * reales. Por eso:
 *
 *   · el chip va SIEMPRE en `compact` (lo manda la pantalla, ver abajo): 144 → ~110 px;
 *   · NO hay rótulo "Presencial/Telefónica" (59 px). Lo telefónico se marca con un ícono de 13 px
 *     al lado del nombre, que es el único caso que cambia lo que hacés con la visita;
 *   · el nombre va a 15 px y no a los 17 del handoff. Adentro de una tarjeta cuyo título es de
 *     16 px, 17 invertía la jerarquía: el renglón le ganaba a su propio encabezado. En Visitas del
 *     día 17 está bien porque ahí la fila ES el contenido de la página.
 *
 * Antes de agregarle un dato a esta fila, medilo. Coordinador y médico NO entran: son ~206 px y
 * se comen el arreglo entero.
 */
export function VisitSummaryRow({
  visit, chip, procs, accent, onClick, ariaLabel, onOpenPatient,
}: {
  visit: TrackVisitRow
  /**
   * El chip de estado, YA ARMADO por la pantalla. La fila no lo elige: hay dos ejes que no se
   * mezclan —el operativo (por llegar → fin de atención) y el clínico (pendiente, ventana
   * vencida, por reprogramar)— y cuál corresponde depende de qué está mirando la pantalla, no de
   * qué campos trae la fila. Si la fila lo dedujera del dato, el día que una consulta de 7 días
   * empiece a traer `operational_stage` mostraría "Por llegar" para visitas de la semana que
   * viene, y se vería bien haciéndolo.
   */
  chip: ReactNode
  /** Resumen de procedimientos. `undefined` = esta visita no tiene, o todavía no llegaron: la
   *  línea simplemente no se pinta y la fila crece cuando llega (no reservamos alto porque la
   *  mayoría de las visitas no tiene procedimientos). */
  procs?: DayProcedureSummary
  accent: string
  onClick: () => void
  ariaLabel: string
  /** Abrir la ficha del paciente. Sin esto, nombre e IVRS quedan como texto (ver `PatientLink`). */
  onOpenPatient?: () => void
}) {
  const codigo = visitCode(visit)
  const nombreVisita = visit.visit_name ?? KIND_LABELS[visit.kind]

  return (
    <div
      role="button"
      tabIndex={0}
      className="spira-row-link spira-no-press"
      onClick={onClick}
      onKeyDown={(e) => {
        // La guarda de siempre: sin ella, Enter sobre el nombre abre la ficha Y la visita.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
      }}
      aria-label={ariaLabel}
      style={fila}
    >
      <div className="spira-link-group" style={{ flex: 1, minWidth: 0 }}>
        {/* línea 1 — el paciente es el titular */}
        <div style={linea1}>
          {visit.visit_type === 'telefonica' && (
            <Icon name="phone" size={13} color="var(--spira-faint)" style={{ flex: '0 0 auto' }} />
          )}
          <span style={nombre}>
            <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${visit.patient_name}`}>
              {visit.patient_name}
            </PatientLink>
          </span>
        </div>

        {/* línea 2 — de qué visita hablamos. Envuelve en vez de recortar: un IVRS cortado a la
            mitad parece completo y no lo es, y es el número que el paciente dice por teléfono. */}
        <div style={linea2}>
          <ProtoTag code={visit.protocol_code} protocolId={visit.protocol_id} />
          {visit.patient_code && (
            <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
              <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${visit.patient_code}`}>
                {visit.patient_code}
              </PatientLink>
            </span>
          )}
          <PatientLinkArrow />
          {codigo && <span style={pastillaVisita}>{codigo}</span>}
          <span style={{ fontSize: 12.5, color: 'var(--spira-faint)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nombreVisita}
          </span>
        </div>

        {/* línea 3 — qué le exige la visita al día. Solo si hay procedimientos. */}
        {procs && procs.names.length > 0 && (
          <div style={{ marginTop: 7 }}>
            <ProcDots names={procs.names} accent={accent} />
          </div>
        )}
      </div>

      <span style={{ flex: '0 0 auto' }}>{chip}</span>
    </div>
  )
}

/* El separador de arriba es de la fila, así que la fila NO se levanta al hover (`.spira-no-press`):
   moverla partiría la línea de 1px que la separa de la anterior. Se resalta y se queda quieta.
   Sin radio por lo mismo, y sin `background` inline — inline le ganaría por especificidad al hover
   de la clase y el resaltado no se vería nunca. El borde va en longhands: cada fila le suma su
   `borderTopWidth` y mezclar la abreviada con las longhand deja el borde roto (ver CLAUDE.md). */
const fila: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', width: '100%',
  borderWidth: 0, borderTopWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
  textAlign: 'left', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', color: 'var(--spira-ink)',
}

const linea1: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
}

/* 15 px y no 17: ver el comentario de cabecera sobre la jerarquía contra el título de la tarjeta. */
const nombre: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15,
  letterSpacing: '-0.01em', lineHeight: 1.25,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}

const linea2: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 5, minWidth: 0,
}

/* La pastilla de la visita es el elemento de MÁS contraste de la fila (tinta sobre papel, al revés
   que todo lo demás): es lo que se lee de un vistazo cuando escaneás la columna — V6, EOT, VNP. */
const pastillaVisita: CSSProperties = {
  padding: '2px 8px', borderRadius: 6, background: 'var(--spira-ink)', color: 'var(--spira-paper)',
  fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', flex: '0 0 auto',
}
