import { Placeholder } from './Placeholder'
import { PatientsView } from './track/PatientsView'
import type { ViewComponent } from './types'

/**
 * Vistas reales por clave "<moduleKey>/<subKey>". Lo que no esté listado acá
 * cae al Placeholder, así los submódulos aún no portados siguen funcionando.
 */
const VIEW_REGISTRY: Record<string, ViewComponent> = {
  'track/pacientes': PatientsView,
}

export function resolveView(moduleKey: string, subKey: string): ViewComponent {
  return VIEW_REGISTRY[`${moduleKey}/${subKey}`] ?? Placeholder
}
