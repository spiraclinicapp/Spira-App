import type { ReactElement } from 'react'
import type { ModuleDef, SubModule } from '../modules/registry'
import type { IconName } from '../components/Icon'

/** Miga extra del breadcrumb del encabezado (ej. el código del protocolo). Clickeable si trae onClick. */
export interface ViewHeaderCrumb {
  label: string
  mono?: boolean
  onClick?: () => void
}

/** Botón de acción del encabezado (reemplaza el botón genérico del shell). */
export interface ViewHeaderAction {
  key: string
  label: string
  icon: IconName
  onClick: () => void
  /** true = botón sólido con el acento; si no, ghost (contorno). */
  primary?: boolean
}

/**
 * Encabezado contextual que una vista le pide al shell: hace clickeable el nombre
 * del submódulo (rootOnClick), suma migas (el código del protocolo/paciente) y
 * reemplaza el botón de acción por las acciones de la vista. null = encabezado genérico.
 */
export interface ViewHeader {
  rootOnClick?: () => void
  crumbs?: ViewHeaderCrumb[]
  actions?: ViewHeaderAction[]
}

/**
 * Props que recibe toda vista de contenido. Da el módulo activo (acento, nombre,
 * ícono) y el submódulo. La auth/roles se acceden vía useAuth() dentro de la vista.
 */
export interface ViewProps {
  module: ModuleDef
  submodule: SubModule
  /** Navegar a otro módulo/submódulo (lo provee el shell). Opcional: no todas las vistas navegan. */
  onNavigate?: (moduleKey: string, subKey: string) => void
  /** Registrar/limpiar el encabezado contextual del shell. Opcional. */
  setHeader?: (header: ViewHeader | null) => void
}

export type ViewComponent = (props: ViewProps) => ReactElement
