import type { ReceptionKind } from '../../../data/pharma'

/**
 * Los tres ámbitos de una recepción, con su etiqueta y su color.
 *
 * Vive acá y no dentro de la vista porque lo usan las dos piezas: los chips de filtro de la
 * toolbar y la card de cada recepción. Una sola definición evita que la etiqueta del chip y la
 * de la card se separen.
 */
export const KIND_CHIP: Record<ReceptionKind, { label: string; color: string; bg: string }> = {
  protocolo:     { label: 'Protocolo',     color: 'var(--spira-pharma-solid)', bg: 'rgba(15, 95, 87,.14)' },
  investigacion: { label: 'Investigación', color: 'var(--spira-primary)',      bg: 'rgba(15,95,87,.10)' },
  ambulatoria:   { label: 'Ambulatoria',   color: 'var(--spira-contable)',     bg: 'rgba(58,107,140,.12)' },
}
