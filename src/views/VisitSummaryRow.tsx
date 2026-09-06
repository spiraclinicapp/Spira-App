import type { ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { PatientLink, PatientLinkArrow } from '../components/PatientLink'
import { visitTitle } from '../lib/visits'
import type { TrackVisitRow } from '../data/visits'
import { FilaDeResumen } from './resumen/piezas'

/**
 * Fila de VISITA del mosaico del Resumen ("Próximas visitas").
 *
 * ES UNA FILA DEL MOSAICO ANTES QUE UNA FILA DE VISITA, y ése es todo el cambio del 2026-09-06.
 * Venía escrita a mano con el vocabulario de *Visitas del día* —nombre en la fuente display,
 * etiqueta de protocolo teñida, pastilla de visita en tinta plena— y era la única de las cinco
 * tarjetas que no usaba el canon de `FilaDeResumen`. Medido contra sus cuatro hermanas: cuatro pesos
 * tipográficos contra uno, cinco tamaños contra dos, tres cajas con fondo teñido contra cero, dos
 * familias contra una y 69 px de alto contra 56. El Director lo reportó como "tiene mucha negrita o
 * algo que no hace que se parezca al resto", que es exactamente lo que la medición dice.
 *
 * POR QUÉ LA PASTILLA DE VISITA NO VUELVE. En Visitas del día y en la cola del médico va en tinta
 * plena con una razón escrita en `visitAtoms.tsx`: "es el dato que se busca al escanear la lista".
 * Allá es cierto — la fila ES el contenido de la página y se escanea por código de visita. Acá es
 * falso: se escanea por NOMBRE DE PACIENTE, y el código es contexto. Tenía el elemento de más
 * contraste de toda la pantalla puesto en el dato menos importante del renglón. La regla que se
 * lleva de acá: copiar un tratamiento visual arrastra su premisa, y la premisa no siempre viaja.
 *
 * Y ARRASTRABA UN DEFECTO REAL: la pastilla salía de `visitCode()` y el texto de al lado de
 * `visit.visit_name` crudo, salteando `visitTitle()`, que es quien tiene la regla que colapsa
 * "V21 - V21". Con datos de producción se veía `[V21] V21` en las tres filas — un dato impreso dos
 * veces, que en una app auditable se lee como error de carga. `visitTitle()` lo resuelve solo.
 *
 * NO dibuja alertas, aunque una alerta sea también un `TrackVisitRow`. Comparten el tipo de dato
 * pero no la forma: la alerta se señala con una superficie teñida por severidad (ver
 * `alertItem.ts`), y eso no es un renglón. Compartir tipo no es compartir forma.
 */
export function VisitSummaryRow({
  visit, chip, primera, onClick, ariaLabel, onOpenPatient,
}: {
  visit: TrackVisitRow
  /**
   * El chip de estado, YA ARMADO por la pantalla. La fila no lo elige: hay dos ejes que no se
   * mezclan —el operativo (por llegar → fin de atención) y el clínico (pendiente, ventana
   * vencida, por reprogramar)— y cuál corresponde depende de qué está mirando la pantalla, no de
   * qué campos trae la fila. Si la fila lo dedujera del dato, el día que una consulta de 7 días
   * empiece a traer `operational_stage` mostraría "Por llegar" para visitas de la semana que
   * viene, y se vería bien haciéndolo.
   *
   * `null` es un valor esperado y frecuente: ver por qué en `ProximasVisitasCard`.
   */
  chip: ReactNode
  primera: boolean
  onClick: () => void
  ariaLabel: string
  /** Abrir la ficha del paciente. Sin esto, nombre e IVRS quedan como texto (ver `PatientLink`). */
  onOpenPatient?: () => void
}) {
  return (
    <FilaDeResumen
      primera={primera}
      onAbrir={onClick}
      ariaLabel={ariaLabel}
      derecha={chip}
      titular={
        <>
          {visit.visit_type === 'telefonica' && (
            <Icon name="phone" size={13} color="var(--spira-faint)" style={{ flex: '0 0 auto' }} />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${visit.patient_name}`}>
              {visit.patient_name}
            </PatientLink>
          </span>
          {onOpenPatient && <PatientLinkArrow />}
        </>
      }
      /* De qué visita hablamos, en el orden en que se pregunta: cuál visita es, de qué protocolo, de
         qué sujeto. Todo texto, sin una sola caja — el canon de la línea 2. */
      detalle={
        <>
          {visitTitle(visit)}
          <span style={{ color: 'var(--spira-faint)' }}> · </span>
          <span className="spira-mono">{visit.protocol_code}</span>
          {visit.patient_code && (
            <>
              <span style={{ color: 'var(--spira-faint)' }}> · </span>
              <span className="spira-mono">
                <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${visit.patient_code}`}>
                  {visit.patient_code}
                </PatientLink>
              </span>
            </>
          )}
        </>
      }
    />
  )
}
