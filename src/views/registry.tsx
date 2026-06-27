import { Placeholder } from './Placeholder'
import { InicioResumenView } from './InicioResumenView'
import { ProtocolsView } from './ProtocolsView'
import { TrackResumenView } from './TrackResumenView'
import { AgendaView } from './AgendaView'
import { TemplatesView } from './TemplatesView'
import { DayVisitsView } from './DayVisitsView'
import { DoctorQueueView } from './DoctorQueueView'
import { TrackAlertsView } from './TrackAlertsView'
import { MedicamentosView } from './pharma/MedicamentosView'
import { RecepcionView } from './pharma/RecepcionView'
import type { ViewComponent } from './types'

/**
 * Vistas reales por clave "<moduleKey>/<subKey>". Lo que no esté listado acá
 * cae al Placeholder, así los submódulos aún no portados siguen funcionando.
 * Protocolos es compartida por Track y Pharma (los pacientes viven adentro).
 */
const VIEW_REGISTRY: Record<string, ViewComponent> = {
  'inicio/resumen': InicioResumenView,
  'track/resumen': TrackResumenView,
  'track/protocolos': ProtocolsView,
  'track/visitas': DayVisitsView,
  'track/para-ver-medico': DoctorQueueView,
  'track/agenda': AgendaView,
  'track/alertas': TrackAlertsView,
  'track/plantillas': TemplatesView,
  'pharma/protocolos': ProtocolsView,
  'pharma/medicamentos': MedicamentosView,
  'pharma/recepcion': RecepcionView,
}

export function resolveView(moduleKey: string, subKey: string): ViewComponent {
  return VIEW_REGISTRY[`${moduleKey}/${subKey}`] ?? Placeholder
}
