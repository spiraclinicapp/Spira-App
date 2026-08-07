import type { ReactElement, ReactNode } from 'react'
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
  /**
   * Contenido libre para la fila del encabezado (junto al título, a la derecha), cuando las
   * acciones no entran en el molde de botón simple (label+ícono) — ej. un filtro + selector de
   * fecha. Si está presente, reemplaza `actions`/el botón genérico de esa fila.
   */
  content?: ReactNode
}

/**
 * Objetivo de navegación: entidad concreta a abrir al llegar a la vista destino, no solo
 * el módulo/submódulo. Hoy paciente (buscador global → ficha directa) y visita (las filas del
 * resumen de Inicio → el detalle de esa visita); extensible a protocolo, etc. La vista lo
 * consume una vez (ver `navTarget`/`onTargetConsumed`).
 */
export interface NavTarget {
  patientId?: string
  /** Visita concreta a abrir (su modal en "Visitas del día"). */
  visitId?: string
  /**
   * Día (ISO) al que tiene que saltar "Visitas del día" para que `visitId` esté en la lista:
   * esa vista carga UN día, y una visita en alerta suele ser de una fecha pasada. Sin esto,
   * la visita simplemente no estaría cargada y no habría nada que abrir.
   */
  visitDate?: string
}

/**
 * Props que recibe toda vista de contenido. Da el módulo activo (acento, nombre,
 * ícono) y el submódulo. La auth/roles se acceden vía useAuth() dentro de la vista.
 */
export interface ViewProps {
  module: ModuleDef
  submodule: SubModule
  /** Navegar a otro módulo/submódulo (lo provee el shell). El 3er arg abre una entidad
   *  concreta al llegar (ej. la ficha de un paciente). Opcional: no todas las vistas navegan. */
  onNavigate?: (moduleKey: string, subKey: string, target?: NavTarget) => void
  /** Registrar/limpiar el encabezado contextual del shell. Opcional. */
  setHeader?: (header: ViewHeader | null) => void
  /** Entidad a abrir al montar/actualizar (la puso un `onNavigate` con objetivo). null = ninguna. */
  navTarget?: NavTarget | null
  /** La vista avisa que ya consumió `navTarget` (el shell lo limpia para no reabrirlo). */
  onTargetConsumed?: () => void
}

export type ViewComponent = (props: ViewProps) => ReactElement
