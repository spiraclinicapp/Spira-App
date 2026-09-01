import { Placeholder } from './Placeholder'
import { InicioResumenView } from './InicioResumenView'
import { ProtocolsView } from './ProtocolsView'
import { TrackResumenView } from './TrackResumenView'
import { AgendaView } from './AgendaView'
import { DayVisitsView } from './DayVisitsView'
import { DoctorQueueView } from './DoctorQueueView'
import { TrackAlertsView } from './TrackAlertsView'
import { MedicamentosView } from './pharma/MedicamentosView'
import { RecepcionView } from './pharma/RecepcionView'
import { DispensacionesView } from './pharma/DispensacionesView'
import { ReportesView } from './pharma/reportes/ReportesView'
import type { RegisteredView } from './registryKeys'
import type { ViewComponent } from './types'

export { isViewRegistered } from './registryKeys'

/**
 * Vistas reales por clave "<moduleKey>/<subKey>". Lo que no esté listado acá
 * cae al Placeholder, así los submódulos aún no portados siguen funcionando.
 * Protocolos es compartida por Track y Pharma (los pacientes viven adentro).
 *
 * El tipo es `Record<RegisteredView, …>` y no `Record<string, …>` a propósito: las claves las fija
 * `registryKeys.ts`, que es lo que pueden importar los tests (este archivo arrastra toda la app y
 * no carga fuera del navegador). Con el Record cerrado, olvidarse de registrar una vista o dejar
 * una clave huérfana es un error de compilación, no un Placeholder que aparece en producción.
 */
const VIEW_REGISTRY: Record<RegisteredView, ViewComponent> = {
  'inicio/resumen': InicioResumenView,
  'track/resumen': TrackResumenView,
  'track/protocolos': ProtocolsView,
  'track/visitas': DayVisitsView,
  'track/para-ver-medico': DoctorQueueView,
  'track/agenda': AgendaView,
  'track/alertas': TrackAlertsView,
  'pharma/protocolos': ProtocolsView,
  'pharma/medicamentos': MedicamentosView,
  'pharma/recepcion': RecepcionView,
  'pharma/dispensaciones': DispensacionesView,
  'pharma/reportes': ReportesView,
}

/* El cast es necesario y acotado: la clave se arma con dos strings cualesquiera (vienen de la URL),
   así que no se puede indexar el Record de claves literales sin ensancharlo. El `?? Placeholder`
   sigue siendo el que cubre lo no registrado. */
export function resolveView(moduleKey: string, subKey: string): ViewComponent {
  return (VIEW_REGISTRY as Record<string, ViewComponent>)[`${moduleKey}/${subKey}`] ?? Placeholder
}
