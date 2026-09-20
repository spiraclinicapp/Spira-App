import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import type { TrackVisitRow } from '../../data/visits'
import { dotVisual, flowWindow, orderVisits, visitStateLabel, visitTitle, ventanaDeVisita, desvioDias, fueraDeVentana, ventanaAbierta } from '../../lib/visits'
import { dotColor } from '../visitStates'
import { ayudaDeRotulo, GLOSARIO } from '../../lib/glosario'
import { formatShortAR, todayISO } from '../../lib/dates'
import { VisitDot } from './VisitDot'

/**
 * Cronograma vertical: las visitas del paciente (programadas + sueltas). Por fila: pelotita de
 * estado (gris vacía sin atender, contorno verde con punto atendida, relleno verde con check
 * completa — sin número, ver `VisitDot`), título de la visita ("V5 W4", "VNP"), día con su ventana,
 * fecha y
 * pill del estado operativo.
 *
 * EL VERDE DE LA FILA DICE "LA VENTANA ESTÁ ABIERTA" (Director, 2026-09-20). Hasta ese día pintaba
 * la visita "actual" —la primera sin `real_date`—, sin mirar una sola fecha: una V18 de la semana 56
 * salía verde con la cita a un mes de distancia. Un color prendido siempre no es una señal. Ahora lo
 * decide `ventanaAbierta`, y lo que marca es lo único accionable: ésta se puede hacer HOY.
 * La marca de "acá está parado el paciente" no se pierde — se la queda la pelotita, que ya la tenía.
 *
 * Si se pasa `onOpen`, cada fila abre el detalle de la visita (`VisitDetail`) — el MISMO que la vista
 * del día, sincronizado por leer de la misma fuente. La fila se vuelve `role="button"` (a11y + el
 * "levante" al hover del CSS global) y muestra un chevron como affordance de que se puede abrir.
 */
export function PdFullSchedule({ visits, currentId, accent, onOpen, ventana, pie }: {
  visits: TrackVisitRow[]
  currentId: string | null
  accent: string
  onOpen?: (visitId: string) => void
  /**
   * Mostrar sólo ±`ventana` visitas alrededor de la actual, con controles para traer el resto.
   * Sin esto se muestran todas, que es el modo de la ficha del paciente (una card entera para el
   * cronograma). El listado de pacientes lo usa en 3: ahí el cronograma vive DENTRO de una fila que
   * se despliega, y trece visitas empujarían la fila siguiente fuera de vista.
   */
  ventana?: number
  /** Una línea al pie (hoy: `ubicacionDeHoy`). Ver por qué existe en `lib/visits.ts`. */
  pie?: string
}) {
  const ordered = orderVisits(visits)
  const today = todayISO()
  const clickable = !!onOpen
  const [expandido, setExpandido] = useState(false)

  /* La misma ventana de ±3 que dibujaba el tracker horizontal, pero acá el "+N" PUEDE CUMPLIR:
     una lista crece hacia abajo, donde hay espacio. En la versión horizontal las pastillas "+N"
     eran un `<div>` sin `onClick` — le decían al usuario "hay 7 más de ese lado" y no le daban
     forma de verlas, que es peor que no decírselo. */
  const recorte = ventana != null && !expandido ? flowWindow(visits, currentId, ventana) : null
  const visibles = recorte ? recorte.window : ordered

  const masBtn = (cuantas: number, texto: string) => (
    <button
      type="button"
      className="spira-row-link spira-no-press"
      onClick={() => setExpandido(true)}
      aria-label={`Mostrar las ${cuantas} visitas ${texto}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 4px',
        border: 'none', background: 'transparent', textAlign: 'left',
        fontFamily: 'var(--spira-font-text)', fontSize: 12, fontWeight: 600,
        color: 'var(--spira-acc-deep-track)', cursor: 'pointer',
      }}
    >
      <Icon name={texto === 'anteriores' ? 'chevronUp' : 'chevronDown'} size={14} stroke={2.4} />
      {cuantas} {cuantas === 1 ? 'visita' : 'visitas'} {texto}
    </button>
  )

  return (
    <div>
      {recorte && recorte.moreBefore > 0 && masBtn(recorte.moreBefore, 'anteriores')}
      {visibles.map((v, k) => {
        const cur = v.id === currentId
        const estColor = dotColor(dotVisual(v), accent)
        const estLabel = visitStateLabel(v, today)
        /* El título, entero y tal como lo escribieron en el cuadro ("V5 W4"). Antes acá se
           colapsaba el nombre cuando no decía más que la semana, porque el renglón de abajo
           repetía esa misma semana; desde que abajo va el DÍA con su ventana, no hay repetición
           que evitar y el título se muestra completo. */
        const label = visitTitle(v)
        const ayuda = ayudaDeRotulo(label)
        const vent = ventanaDeVisita(v)
        const desv = desvioDias(v.estimated_date, v.real_date)
        const fuera = fueraDeVentana(v.real_date, v.window_start, v.window_end)
        const enVentana = ventanaAbierta(v, today)
        /* Superficie teñida, que es la forma que ya usa la app para decir "esto significa algo"
           (las alertas). NO un borde de color: el borde señala pulsabilidad, y el realce por estado
           en Spira es tinte o elevación. El 8% + `--spira-acc-deep-track` para el texto es el único
           par medido para AA — el acento a secas sobre su propio tinte da 4,14:1 y el código va a
           14,5px en negrita, donde AA pide 4,5. Concatenar alfa es válido porque `accent` llega
           como hex crudo de `registry.ts` (sobre un `var(--…)` no se dibujaría nada). */
        const rowStyle: CSSProperties = {
          display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '11px 4px',
          /* El separador lo lleva la fila de arriba, así que la primera no lo tiene — salvo que
             arriba haya quedado el control de "N visitas anteriores", que sí es una fila. */
          borderTop: k || (recorte && recorte.moreBefore > 0) ? '1px solid var(--spira-line)' : 'none',
          background: enVentana ? accent + '14' : 'transparent',
          textAlign: 'left', color: 'inherit', font: 'inherit',
          cursor: clickable ? 'pointer' : 'default',
        }
        /* El código en tinta salvo con la ventana abierta. `cur` ya no lo pinta: dejaba el acento
           prendido sobre la próxima pendiente estuviera donde estuviera en el calendario. */
        const codigoColor = enVentana ? 'var(--spira-acc-deep-track)' : 'var(--spira-ink)'
        const inner = (
          <>
            <VisitDot visit={v} today={today} size={26} isToday={cur} accent={accent} />
            <div style={{ minWidth: 0, flex: 1 }}>
              {/* Las visitas SUELTAS se rotulan con una abreviatura que la app da por sabida —VNP,
                  Scr, Rando, F+S—, así que ésas se marcan como término del glosario. Las del
                  cronograma ("V5 - Screening") no: `ayudaDeRotulo` devuelve `undefined` y el
                  renglón queda como estaba. Marcar algo que no lo necesita es ruido. */}
              {ayuda ? (
                <abbr
                  className="spira-termino"
                  title={ayuda}
                  /* `inline-block` + `maxWidth` y NO `block`: en bloque la caja ocupa los 480 px de
                     la columna, así que el `cursor: help` aparecía sobre el espacio vacío a la
                     derecha de la palabra — una pista de ayuda flotando sobre la nada. Así abraza
                     el texto y sigue truncando si el rótulo no entra. */
                  style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14.5, color: codigoColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', maxWidth: '100%', verticalAlign: 'bottom' }}
                >
                  {label}
                </abbr>
              ) : (
                <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14.5, color: codigoColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
              )}
              {/* El día lleva `title` y NO subrayado: se repite en cada renglón, y marcar los
                  siete volvería la columna un texto resaltado. La explicación está cuando se la
                  busca; la señal se gasta donde rinde. */}
              {vent != null && (
                <div title={GLOSARIO.dia} style={{ fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 1, cursor: 'help', width: 'fit-content' }}>
                  {vent}
                </div>
              )}
            </div>
            <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', minWidth: 78, textAlign: 'right', whiteSpace: 'nowrap', lineHeight: 1.25 }}>
              {v.real_date ? (
                <>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', color: 'var(--spira-ink)' }}>
                    {formatShortAR(v.real_date)}
                    {/* El `title` explica qué ES una ventana, no repite el `aria-label`: este ícono
                        es el lugar donde alguien nuevo se topa con el concepto por primera vez y se
                        pregunta qué tiene de malo esa fecha. */}
                    {fuera && <span role="img" aria-label="Fuera de ventana" title={`Fuera de ventana. ${GLOSARIO.ventana}`} style={{ display: 'inline-flex' }}><Icon name="alert" size={12} color="var(--spira-danger)" /></span>}
                  </span>
                  {/* "prog" y no "est" (2026-09-14): `estimated_date` es la fecha PROGRAMADA, y desde que
                      el encabezado de la visita llama "Fecha estimada" a la del protocolo, "est" acá
                      nombraba otra fecha que la que muestra. */}
                  <span title={v.estimated_date ? `Programada para el ${formatShortAR(v.estimated_date)}` : undefined} style={{ display: 'block', fontSize: 10.5, color: 'var(--spira-muted)' }}>
                    prog {v.estimated_date ? formatShortAR(v.estimated_date) : '—'}{desv != null ? ` · ${desv > 0 ? '+' : ''}${desv} d` : ''}
                  </span>
                </>
              ) : (
                v.estimated_date ? formatShortAR(v.estimated_date) : '—'
              )}
            </span>
            {/* Con la ventana abierta la pastilla ya dice "En ventana" sola (`visitStateLabel`),
                pero su color sale de la pelotita, que para una visita sin atender es GRIS: la
                palabra quedaba en gris sobre una fila verde. Acá se la tiñe, y con eso el color
                deja de ser la única señal (WCAG 1.4.1) — que es la razón de ser de la palabra. */}
            <span style={{ fontSize: 11.5, fontWeight: 600, color: enVentana ? 'var(--spira-acc-deep-track)' : estColor, background: enVentana ? accent + '1F' : estColor + '16', padding: '3px 10px', borderRadius: 'var(--spira-radius-pill)', whiteSpace: 'nowrap', minWidth: 86, textAlign: 'center' }}>
              {estLabel}
            </span>
            {clickable && <Icon name="chevronRight" size={16} color="var(--spira-faint)" style={{ flex: '0 0 auto' }} />}
          </>
        )

        if (!clickable) {
          return <div key={v.id} style={rowStyle}>{inner}</div>
        }
        return (
          <div
            key={v.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen!(v.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen!(v.id) } }}
            title="Abrir el detalle de la visita"
            style={{ ...rowStyle, borderRadius: 10 }}
          >
            {inner}
          </div>
        )
      })}
      {recorte && recorte.moreAfter > 0 && masBtn(recorte.moreAfter, 'siguientes')}
      {pie && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--spira-line)', fontSize: 11.5, color: 'var(--spira-muted)' }}>
          {pie}
        </div>
      )}
    </div>
  )
}
