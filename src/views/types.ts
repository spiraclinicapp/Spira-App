import type { ReactElement } from 'react'
import type { ModuleDef, SubModule } from '../modules/registry'

/**
 * Props que recibe toda vista de contenido. Da el módulo activo (acento, nombre,
 * ícono) y el submódulo. La auth/roles se acceden vía useAuth() dentro de la vista.
 */
export interface ViewProps {
  module: ModuleDef
  submodule: SubModule
  /** Navegar a otro módulo/submódulo (lo provee el shell). Opcional: no todas las vistas navegan. */
  onNavigate?: (moduleKey: string, subKey: string) => void
}

export type ViewComponent = (props: ViewProps) => ReactElement
