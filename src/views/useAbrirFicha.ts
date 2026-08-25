import type { ModuleDef } from '../modules/registry'
import type { NavTarget, ReturnTo } from './types'

/**
 * Abrir la ficha de un paciente desde cualquier vista.
 *
 * VA AL MÓDULO EN EL QUE YA ESTÁS (`module.key`), nunca a `'track'` fijo. Los pacientes viven
 * dentro de Protocolos, y esa ruta existe en los DOS módulos operativos (`track/protocolos` y
 * `pharma/protocolos`, misma `ProtocolsView`), así que ir al propio módulo evita tener que
 * preguntar permisos: si estás viendo esta pantalla, ese módulo lo tenés. Con `'track'` fijo, una
 * farmacéutica sin el módulo Coordinación se comería un `navigate` descartado EN SILENCIO por
 * `isAllowed` — un link que no hace nada y no dice por qué.
 *
 * Devuelve `undefined` cuando la vista no recibió `onNavigate`, y con eso `PatientLink` cae solo a
 * texto pelado: no hay que acordarse de chequearlo en cada llamada.
 *
 * `volver` es una función y no un objeto porque el pasaje suele depender de la fila (el nombre del
 * paciente en el `hint`, la visita a reabrir en el `target`), y se resuelve recién al hacer clic.
 */
export function useAbrirFicha({ module, onNavigate, volver }: {
  module: ModuleDef
  onNavigate?: (moduleKey: string, subKey: string, target?: NavTarget, back?: ReturnTo) => void
  /** Pasaje de vuelta para ESTE clic. Omitilo y no hay botón de volver. */
  volver?: (patientId: string) => ReturnTo | undefined
}) {
  if (!onNavigate) return undefined
  return (patientId: string, protocolId?: string) => {
    onNavigate(module.key, 'protocolos', { patientId, protocolId }, volver?.(patientId))
  }
}
