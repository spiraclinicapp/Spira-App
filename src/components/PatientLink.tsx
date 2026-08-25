import type { ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * Un dato del paciente que además abre su ficha.
 *
 * Nació local en `VisitHeader` (encabezado de la visita) y se extrajo cuando el gesto se llevó a
 * las quince pantallas que muestran nombre + Nº de sujeto.
 *
 * SIN `onOpen` DEVUELVE EL TEXTO PELADO, sin caja ni foco de teclado: un botón que no hace nada es
 * peor que no tener botón. De eso se apoyan los casos donde no hay a dónde ir — un paciente sin
 * `patient_id` en las filas de Estadísticas, una farmacéutica sin el módulo desde la campana.
 *
 * El estilo vive en `.spira-textlink` (tokens.css): hereda tipografía y color, y solo se subraya al
 * apuntarlo o enfocarlo, para que el nombre siga leyéndose como el nombre. `.spira-no-press` lo pone
 * ESTE componente y no quien lo usa: es un `<button>`, así que sin esa marca hereda la
 * micro-interacción global y el texto se levanta 1px al pasarle el mouse — bien para un botón, un
 * salto para un nombre en medio de un bloque de identidad.
 */
export function PatientLink({ onOpen, label, children }: {
  onOpen?: () => void
  label: string
  children: ReactNode
}) {
  if (!onOpen) return <>{children}</>
  return (
    <button
      type="button"
      className="spira-textlink spira-no-press"
      onClick={(e) => { e.stopPropagation(); onOpen() }}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  )
}

/**
 * La marca de destino del par. UNA sola por paciente, no una por dato: el destino no es "el nombre"
 * ni "el número", es el paciente, que son los dos juntos.
 *
 * `aria-hidden` porque es decoración: lo que se va a abrir ya lo dicen el `aria-label` y el `title`
 * de los links. Va SIEMPRE afuera del span que se trunca —el nombre lleva `text-overflow: ellipsis`
 * en todas las listas y adentro se cortaría antes que el nombre—, y el hueco lo reserva el
 * `gap`/`margin` de quien la coloca, para que al aparecer no corra nada.
 */
export function PatientLinkArrow({ size = 12 }: { size?: number }) {
  return (
    <span className="spira-link-arrow" aria-hidden="true">
      <Icon name="arrowUpRight" size={size} stroke={2.4} />
    </span>
  )
}
