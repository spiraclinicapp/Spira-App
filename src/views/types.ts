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
 * Pasaje de vuelta: cómo volver a DONDE ESTABAS, adjuntado por quien te mandó a otro lado.
 *
 * El shell no tiene historial —la navegación es estado, no rutas—, así que un salto profundo
 * (abrir la ficha de un paciente desde el modal de una visita) te deja sin retorno: hay que
 * rehacer el camino a mano, incluido el día que estabas mirando y la visita que tenías abierta.
 * En vez de inventar un historial genérico —con toda su ambigüedad sobre qué significa "atrás"
 * cuando varias vistas tienen navegación interna propia—, el que navega adjunta el boleto y el
 * shell lo muestra. Explícito y sin sorpresas: hay "volver" solo cuando alguien lo ofreció.
 *
 * El shell lo guarda APARTE de `navTarget`, que la vista destino consume y limpia al llegar: si
 * viajara adentro, el botón de volver desaparecería apenas la ficha termina de abrirse.
 */
export interface ReturnTo {
  moduleKey: string
  subKey: string
  /** Qué reabrir al volver (ej. la misma visita, en su día). */
  target?: NavTarget
  /**
   * Texto del botón. CORTO y fijo ("Volver a la visita"): comparte fila con la miga, que en la
   * ficha de un paciente ya es larga, y un label que crece con el nombre del paciente le come el
   * ancho a la ubicación, que es la información principal de esa línea.
   */
  label: string
  /** Detalle para el tooltip ("Volver a la visita de Susana Rodriguez"): dice a CUÁL se vuelve,
   *  sin gastar ancho. Sin esto, el tooltip repite el label. */
  hint?: string
}

/**
 * Props que recibe toda vista de contenido. Da el módulo activo (acento, nombre,
 * ícono) y el submódulo. La auth/roles se acceden vía useAuth() dentro de la vista.
 */
export interface ViewProps {
  module: ModuleDef
  submodule: SubModule
  /** Navegar a otro módulo/submódulo (lo provee el shell). El 3er arg abre una entidad
   *  concreta al llegar (ej. la ficha de un paciente); el 4º deja un pasaje de vuelta a
   *  donde estabas. Opcional: no todas las vistas navegan. */
  onNavigate?: (moduleKey: string, subKey: string, target?: NavTarget, back?: ReturnTo) => void
  /** Abre el popover "Acerca de" del pie del riel, que es donde viven las novedades completas.
   *  Lo usa el "Ver todas" de la card de Novedades en Inicio › Resumen. Opcional. */
  onOpenAbout?: () => void
  /** Registrar/limpiar el encabezado contextual del shell. Opcional. */
  setHeader?: (header: ViewHeader | null) => void
  /** Entidad a abrir al montar/actualizar (la puso un `onNavigate` con objetivo). null = ninguna. */
  navTarget?: NavTarget | null
  /** La vista avisa que ya consumió `navTarget` (el shell lo limpia para no reabrirlo). */
  onTargetConsumed?: () => void
  /**
   * La vista avisa que el usuario se fue, POR ADENTRO, de donde la navegación lo había dejado —y
   * el shell descarta el pasaje de vuelta.
   *
   * Hace falta porque varias vistas navegan sin cambiar de submódulo: los pacientes viven dentro
   * de Protocolos, así que ir de una ficha a la grilla, o a otro paciente, no pasa por el shell.
   * Sin este aviso el chip de "Volver a la visita de X" sobrevive a esos paseos y termina
   * ofreciendo volver a algo que ya no tiene nada que ver con lo que estás mirando: sigue
   * funcionando, pero miente sobre de dónde venís, que es peor que no estar.
   *
   * Solo lo llaman las vistas que consumen un `navTarget`, y una sola vez por llegada.
   */
  onNavigatedAway?: () => void
}

export type ViewComponent = (props: ViewProps) => ReactElement
