import type { ReactElement } from 'react'
import type { ModuleDef, SubModule } from '../modules/registry'

/**
 * Props que recibe toda vista de contenido. Da el módulo activo (acento, nombre,
 * ícono) y el submódulo. La auth/roles se acceden vía useAuth() dentro de la vista.
 */
export interface ViewProps {
  module: ModuleDef
  submodule: SubModule
}

export type ViewComponent = (props: ViewProps) => ReactElement
