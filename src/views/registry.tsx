import { Placeholder } from './Placeholder'
import { ProtocolsView } from './ProtocolsView'
import { TrackResumenView } from './TrackResumenView'
import type { ViewComponent } from './types'

/**
 * Vistas reales por clave "<moduleKey>/<subKey>". Lo que no esté listado acá
 * cae al Placeholder, así los submódulos aún no portados siguen funcionando.
 * Protocolos es compartida por Track y Pharma (los pacientes viven adentro).
 */
const VIEW_REGISTRY: Record<string, ViewComponent> = {
  'track/resumen': TrackResumenView,
  'track/protocolos': ProtocolsView,
  'pharma/protocolos': ProtocolsView,
}

export function resolveView(moduleKey: string, subKey: string): ViewComponent {
  return VIEW_REGISTRY[`${moduleKey}/${subKey}`] ?? Placeholder
}
