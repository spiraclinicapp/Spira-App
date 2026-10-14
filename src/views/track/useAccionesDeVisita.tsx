import { useState } from 'react'
import { avisar } from '../../components/AvisoGlobal'
import { markArrived, markNoShow, registrarLlegadaAdelantada, retrocederEtapa } from '../../data/dayVisits'
import type { DayVisitRow } from '../../data/dayVisits'
import { deleteVisitEvent } from '../../data/visitEvents'
import type { TrackVisitRow } from '../../data/visits'
import { OPERATIONAL_STAGES } from '../visitStates'
import type { ClaveAccion } from './accionesDeVisita'
import { formatDayMonth } from '../../lib/dates'
import { PedirRetestModal } from './PedirRetestModal'
import { RescheduleModal } from './RescheduleModal'
import { VinoOtroDiaModal } from './VinoOtroDiaModal'

/**
 * Lo que HACE cada acción del menú del botón de etapa (`BotonEtapa` dibuja y avisa la clave; esto la
 * ejecuta). Lo usan la fila de Visitas y el modal de la visita: una sola implementación, así el mismo
 * «Volver» no puede hacer una cosa en la lista y otra en el modal.
 *
 *   ejecutar(visita, clave)   volver · no vino · copiar · eliminar → RPC + aviso + `onCambio`
 *                             reprogramar · retest · vino otro día → abre su modal (en `capas`)
 *   llegar(visita, mueve)     la llegada confirmada fuera de fecha (`llegadaFueraDeFecha`)
 *   ocupado                   id de la visita con una mutación en vuelo
 *   capas                     los modales que abre; van donde el que lo usa monta sus capas
 *
 * Los avisos van por `avisar` (el aviso global del shell) y no por un toast propio: «Eliminar» desde el
 * modal lo cierra, y un toast de adentro se iría con él antes de leerse. Los errores suben a `onError`,
 * que los muestra en el banner de cada pantalla, como el resto de sus acciones.
 */
export function useAccionesDeVisita({ acento, onCambio, onError, onEliminada, onCargadaEn }: {
  acento: string
  /** Algo cambió: refrescar lo que se muestra. */
  onCambio: () => void
  /** `null` = limpiar el error anterior. */
  onError: (mensaje: string | null) => void
  /** La visita ya no existe (el modal se cierra). Sin esto, sólo `onCambio`. */
  onEliminada?: (visita: DayVisitRow) => void
  /**
   * Se cargó en otra fecha (`fecha`, ISO). La lista de Visitas lleva el día ahí: la visita deja el día que
   * se estaba mirando —ahora es de ese otro— y sin esto desaparecía con un «falta finalizarla» y no había
   * cómo llegar a ella. El modal de la visita no lo necesita: sigue abierto sobre la misma visita.
   */
  onCargadaEn?: (fecha: string) => void
}) {
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [reprogramando, setReprogramando] = useState<TrackVisitRow | null>(null)
  const [retestDe, setRetestDe] = useState<DayVisitRow | null>(null)
  const [otroDiaDe, setOtroDiaDe] = useState<DayVisitRow | null>(null)

  /** Corre una mutación de `visita` con el ocupado, el error y el aviso de todas. `listo` puede ser
   *  una función: se lee DESPUÉS de la mutación (el aviso de «Volver» nombra a dónde volvió). */
  const correr = async (visita: DayVisitRow, mutacion: () => Promise<{ error: string | null }>, listo: string | (() => string)) => {
    setOcupado(visita.id)
    onError(null)
    const res = await mutacion()
    setOcupado(null)
    if (res.error) { onError(res.error); return false }
    avisar(typeof listo === 'function' ? listo() : listo)
    return true
  }

  const ejecutar = async (visita: DayVisitRow, clave: ClaveAccion) => {
    switch (clave) {
      case 'reprogramar': setReprogramando(visita); return
      case 'retest': setRetestDe(visita); return
      case 'vino-otro-dia': setOtroDiaDe(visita); return
      case 'copiar': {
        if (!visita.patient_code) return
        try {
          await navigator.clipboard.writeText(visita.patient_code)
          avisar('ID copiado')
        } catch {
          // Sin acceso al portapapeles (permiso denegado, contexto no seguro): se dice, no se finge.
          onError('No se pudo copiar: el navegador no dio acceso al portapapeles.')
        }
        return
      }
      case 'no-vino':
        if (await correr(visita, () => markNoShow(visita.id, true), 'Falta registrada. La visita queda por reprogramar.')) onCambio()
        return
      case 'deshacer-no-vino':
        if (await correr(visita, () => markNoShow(visita.id, false), 'Falta deshecha.')) onCambio()
        return
      case 'volver': {
        // El aviso nombra la etapa a la que volvió, como el ítem que se tocó («Volver a Concurrió»).
        let destino: string | null = null
        const ok = await correr(visita, async () => {
          const r = await retrocederEtapa(visita.id, visita.operational_stage)
          destino = r.destino ? OPERATIONAL_STAGES[r.destino]?.short ?? null : null
          return r
        }, () => (destino ? `Volvió a ${destino}` : 'Volvió a la etapa anterior'))
        if (ok) onCambio()
        return
      }
      case 'eliminar':
        if (await correr(visita, () => deleteVisitEvent(visita.id), 'Visita eliminada')) {
          if (onEliminada) onEliminada(visita)
          else onCambio()
        }
        return
    }
  }

  /** La llegada confirmada fuera de fecha: adelantada (mueve la citación a hoy) o la de siempre. */
  const llegar = async (visita: DayVisitRow, mueveFecha: boolean) => {
    const ok = await correr(
      visita,
      () => (mueveFecha ? registrarLlegadaAdelantada(visita.id) : markArrived(visita.id)),
      mueveFecha ? 'Llegada registrada. La visita quedó para hoy.' : 'Llegada registrada.',
    )
    if (ok) onCambio()
  }

  const capas = (
    <>
      {reprogramando && (
        <RescheduleModal
          visit={reprogramando}
          accentSolid={acento}
          onClose={() => setReprogramando(null)}
          onDone={() => { setReprogramando(null); avisar('Visita reprogramada'); onCambio() }}
        />
      )}
      {retestDe && (
        <PedirRetestModal
          visit={retestDe}
          accent={acento}
          onClose={() => setRetestDe(null)}
          onDone={(mensaje) => { setRetestDe(null); avisar(mensaje); onCambio() }}
        />
      )}
      {otroDiaDe && (
        <VinoOtroDiaModal
          visit={otroDiaDe}
          accent={acento}
          onClose={() => setOtroDiaDe(null)}
          onDone={(fecha) => {
            setOtroDiaDe(null)
            avisar(`Visita cargada el ${formatDayMonth(fecha)}. Falta finalizarla.`)
            onCargadaEn?.(fecha)
            onCambio()
          }}
        />
      )}
    </>
  )

  return { ejecutar, llegar, ocupado, capas, reprogramar: setReprogramando }
}
