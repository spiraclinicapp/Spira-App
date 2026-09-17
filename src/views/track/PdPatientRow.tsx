import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { EstadoPaciente } from '../../components/EstadoPaciente'
import { PatientLink } from '../../components/PatientLink'
import { ivrsDelEstudio } from '../../lib/ivrs'
import { inscripcionDelEstudio } from '../../lib/inscripcion'
import type { PatientRow } from '../../data/patients'
import type { TrackVisitRow } from '../../data/visits'
import { orderVisits, todaySplit, ubicacionDeHoy, visitShortLabel } from '../../lib/visits'
import { GLOSARIO } from '../../lib/glosario'
import { formatDayMonth, todayISO } from '../../lib/dates'
import { PdFullSchedule } from './PdFullSchedule'

const microLabel: CSSProperties = { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }

/**
 * Fila de paciente del Detalle de Protocolo. Plegada: identidad (nombre + IVRS + médico) +
 * tracker Anterior→Actualidad→Próxima, con la bandera de estado apoyada en la esquina superior
 * derecha y el enlace "Resumen" al pie de esa misma columna. Click en la fila abre la FICHA del
 * paciente —el destino de la tarjeta es el paciente, que es lo que la tarjeta muestra—; el
 * enlace "Resumen" despliega el tracker horizontal completo sin salir de la lista
 * (stopPropagation). El nombre y el IVRS van además como `.spira-textlink`: la fila entera es un
 * `<div>` con `onClick` (no un `button`, para no anidar el de "Resumen" adentro), así que el par
 * nombre/IVRS es la puerta a la ficha que sí alcanza el teclado.
 */
export function PdPatientRow({ patient, visits, accent, protocolId, protocolCode, onOpen, onOpenVisit }: {
  patient: PatientRow
  visits: TrackVisitRow[]
  accent: string
  /**
   * Protocolo de esta fila. Con él, el número de sujeto que se muestra es el de ESA inscripción
   * (`ivrsDelEstudio`) y no el del estudio madre: la misma persona en dos estudios tiene dos IVRS, y
   * hasta el 2026-09-15 la lista de LTS17231 mostraba los de ACT18301. Sin él —ninguna pantalla hoy—
   * cae al del paciente.
   */
  protocolId?: string
  /** Código del protocolo, opcional: se muestra como chip junto al IVRS en listas
   * cruza-protocolos (Todos los pacientes). El tablero de un protocolo lo omite. */
  protocolCode?: string
  onOpen: (patientId: string) => void
  /** Abrir el detalle de UNA visita del cronograma desplegado. Sin esto las filas quedan inertes
   *  (es lo que hacía el tracker horizontal, que no abría nada). */
  onOpenVisit?: (visitId: string) => void
}) {
  const [open, setOpen] = useState(false)
  /* "Hoy" en la línea de tiempo: anterior, hoy, próxima. */
  const today = todayISO()
  const { prev: prevByDate, next, todayVisit } = todaySplit(visits, today)
  /* "Anterior" = la visita inmediatamente anterior a la de hoy en la SECUENCIA, aunque sea del
     mismo día (p. ej. screening + run-in el mismo día: la anterior es la previa, no "—"). Si hoy
     no hay visita, la última con fecha pasada (lo que da todaySplit). */
  const ordered = orderVisits(visits)
  const todayIdx = todayVisit ? ordered.findIndex((v) => v.id === todayVisit.id) : -1
  const prev = todayIdx > 0 ? (ordered[todayIdx - 1] ?? null) : prevByDate
  const flowCurrentId = todayVisit?.id ?? next?.id ?? prev?.id ?? null
  const medico = patient.treating_physician ?? '—'
  const ivrs = protocolId ? ivrsDelEstudio(patient, protocolId) : patient.code
  /* El estado que se muestra es el de ESTA inscripción, no el de la persona: la misma persona en
     dos estudios puede estar cerrada en uno y activa en el otro. Es exactamente el bug del
     2026-09-16 (baja en ACT18301 → se veía de baja en LTS17231). Sin `protocolId` —ninguna
     pantalla hoy— no hay estudio en contexto y cae a "sin dato", que se lee como abierta. */
  const estadoInscripcion = protocolId ? (inscripcionDelEstudio(patient, protocolId)?.status ?? null) : null
  /* La fila solo se despliega si hay algo que trackear; sin visitas no hay tracker que mostrar. */
  const expandable = visits.length > 0

  /* Etiqueta de la celda del tracker: el código para las programadas; el tipo (Scr/Firma/Rando…)
     para las sueltas. La fecha sale de la estimada (programadas) o la real (sueltas). */
  const cell = (v: typeof prev) => {
    if (!v) return '—'
    const label = visitShortLabel(v)
    const fecha = v.estimated_date ?? v.real_date
    return fecha ? `${label} · ${formatDayMonth(fecha)}` : label
  }

  const col = (label: string, value: string, isNow: boolean) => (
    <div style={{ minWidth: 88, textAlign: 'center' }}>
      <div style={{ ...microLabel, color: isNow ? accent : 'var(--spira-muted)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--spira-font-text)', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, marginTop: 3, whiteSpace: 'nowrap', color: isNow ? 'var(--spira-ink)' : 'var(--spira-muted)', fontWeight: isNow ? 700 : 400 }}>{value}</div>
    </div>
  )
  const arrow = <Icon name="arrowRight" size={15} color={accent} style={{ flex: '0 0 auto', marginTop: 8 }} />

  /* EL REALCE VIVE EN `.spira-card-link`, NO EN `onMouseEnter`. Antes esta tarjeta llevaba un
     `useState` de hover que escribía `--spira-shadow-md` inline: esa es la sombra del MODAL
     (`0 12px 32px`), tres veces la escala de un levante de 1px, y `tokens.css` documenta en diez
     renglones por qué ese desajuste "hacía ver la animación pegoteada" — para eso existe
     `--spira-shadow-hover` (`0 4px 14px`), que es la que ya usaba el Resumen. Dos gestos idénticos
     con dos sombras distintas es de las cosas que el ojo registra y no puede explicar. La clase
     trae borde, sombra correcta y la transición sincronizada con el levante. */
  return (
    <div
      className="spira-card-link"
      style={{ position: 'relative', borderRadius: 14, background: 'var(--spira-white)', marginBottom: 10 }}
    >
      {/* El estado del paciente, antes de entrar: la bandera apoyada en la esquina superior derecha,
          con la palabra escrita (verde abierta, rojo cerrada). ABSOLUTA y fuera del renglón del
          nombre a propósito: la versión anterior lo ponía delante del nombre y, como el nombre es un
          botón que no se puede cortar a la mitad, en columnas angostas el nombre entero desaparecía
          detrás de un "…". Acá no ocupa lugar en la grilla, así que no le quita un píxel a nada.
          Y la esquina es toda suya: «Resumen» —que antes vivía ahí, como botón con borde— bajó al
          pie de la misma columna. El radio de la clase (13 = 14 de la tarjeta − 1 del borde) es el
          de esta tarjeta, así que no hay nada que pasarle. */}
      <EstadoPaciente estado={estadoInscripcion} />
      <div onClick={() => onOpen(patient.id)} style={{ cursor: 'pointer', padding: '13px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
          {/* identidad */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            {/* Nombre e IVRS abren los dos la ficha —el mismo par que el encabezado de la visita—,
                así que van en un `.spira-link-group` y se subrayan juntos al apuntar cualquiera.

                SIN flecha, a diferencia de las otras catorce pantallas (Director, 2026-08-25):
                acá la fila ENTERA ya abre la ficha, así que una marca de "esto lleva a otro lado"
                no distingue nada —todo lleva al mismo lado— y solo suma ruido. Es el mismo
                criterio por el que la flecha no va en la esquina de una tarjeta: habla del
                DESTINO, y donde el destino es único no hay nada que anunciar. En Visitas o
                Alertas sí va, porque ahí la fila abre la VISITA y el nombre abre otra cosa. */}
            <div className="spira-link-group" style={{ minWidth: 0 }}>
              <div style={{ maxWidth: '100%', fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <PatientLink onOpen={() => onOpen(patient.id)} label={`Abrir la ficha de ${patient.full_name}`}>
                  {patient.full_name}
                </PatientLink>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, marginTop: 2 }}>
                {/* `title` sin subrayado punteado: el IVRS se repite en las diez filas de la lista
                    y marcarlo diez veces no enseña nada —la definición es la misma— pero sí
                    convierte la columna en un texto resaltado. La marca visual del glosario se gasta
                    una sola vez, en los rótulos de KPI de la ficha del protocolo. */}
                <span className="spira-mono" title={GLOSARIO.ivrs} style={{ fontSize: 13, color: 'var(--spira-muted)', whiteSpace: 'nowrap', cursor: 'help' }}>
                  {ivrs
                    ? <PatientLink onOpen={() => onOpen(patient.id)} label={`Abrir la ficha del sujeto ${ivrs}`}>{ivrs}</PatientLink>
                    : 'Sin IVRS'}
                </span>
                {protocolCode && (
                  <span className="spira-mono" style={{ fontSize: 11.5, padding: '1px 8px', borderRadius: 'var(--spira-radius-pill)', background: accent + '14', color: accent, whiteSpace: 'nowrap', flex: '0 0 auto' }}>{protocolCode}</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{medico}</div>
            </div>
          </div>
          {/* tracker Anterior → Actualidad → Próxima sobre la línea de tiempo (sueltas + cronograma).
              "Actualidad" es la fecha de hoy; el detalle "a medio llenar" vive en el flow desplegado. */}
          {expandable ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              {col('Anterior', cell(prev), false)}{arrow}
              {col('Actualidad', todayVisit ? cell(todayVisit) : formatDayMonth(today), true)}{arrow}
              {col('Próxima', cell(next), false)}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>Sin visitas registradas</div>
          )}
          {/* acción: solo el desplegable del recorrido. Abrir la ficha es el gesto de la fila
              entera (el `onClick` de arriba), así que no lleva botón propio. Sin visitas no hay
              resumen que desplegar y el enlace directamente no está — la fila igual abre la ficha.

              VA AL PIE DE LA COLUMNA, no al centro: `alignSelf: 'end'` con 1px de respiro deja la
              base del enlace a la altura de la del renglón del médico, así que la tarjeta se lee en
              dos esquinas —estado arriba, acción abajo— en vez de amontonar las dos cosas en la
              misma. Era un botón con caja y se disputaba esos ~90px con la bandera de estado; sin
              caja mide ~78×17 y el subrayado del hover alcanza como señal (ver
              `.spira-disclosure-link`). El color es el acento del módulo y el subrayado lo sigue con
              `currentColor`; el giro del chevron y el estado abierto viven en el CSS, atados a
              `aria-expanded`, que es el mismo dato que lee el lector de pantalla. */}
          <div style={{ justifySelf: 'end', alignSelf: 'end', paddingBottom: 1, display: 'flex', justifyContent: 'flex-end' }}>
            {expandable && (
              <button
                type="button"
                className="spira-disclosure-link spira-no-press"
                aria-expanded={open}
                onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
                title={open ? 'Ocultar el recorrido de visitas' : 'Ver el recorrido de visitas'}
                style={{ color: accent }}
              >
                Resumen
                <Icon name="chevronDown" size={14} color="currentColor" />
              </button>
            )}
          </div>
        </div>
      </div>
      {/* EL PADDING IZQUIERDO ERA 70 Y AHORA ES 16, igual que el del bloque de identidad de arriba.
          Con 70 la línea de tiempo arrancaba 54 px más adentro que todo el resto de la tarjeta y
          terminaba al ras del borde derecho: no estaba alineada a nada, y eso se lee como que el
          bloque no pertenece a esta caja. Fue lo primero que el Director marcó como "no me termina
          de cerrar", antes incluso que el desborde. */}
      {open && expandable && (
        <div style={{ padding: '6px 16px 16px' }}>
          <PdFullSchedule
            visits={visits}
            currentId={flowCurrentId}
            accent={accent}
            ventana={3}
            pie={ubicacionDeHoy(visits, today)}
            onOpen={onOpenVisit}
          />
        </div>
      )}
    </div>
  )
}
