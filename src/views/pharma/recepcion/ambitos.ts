import type { ReceptionKind } from '../../../data/pharma'

/**
 * Los tres ámbitos de una recepción, con su etiqueta y su color.
 *
 * Vive acá y no dentro de la vista porque lo usan las dos piezas: los chips de filtro de la
 * toolbar y la barra de origen de cada card. Una sola definición evita que se separen.
 *
 * SOBRE LOS COLORES. El handoff "2c" pedía protocolo petróleo e investigación ÁMBAR, y el ámbar
 * ya no está disponible: el 2026-08-11 se sacó de la identidad de Farmacia justamente porque era
 * indistinguible de `--spira-warn` (ver tokens.css), y quedó reservado para advertencia. En esta
 * pantalla eso pesa el doble, porque la columna "Vence" pinta de ámbar los lotes próximos a
 * vencer dentro de la misma card: "esto es investigación" y "esto vence pronto" se verían igual.
 *
 * Investigación toma el teal (decisión del Director, 2026-08-17). No es su acento de módulo, pero
 * acá el color sólo separa ámbitos ENTRE SÍ y la barra siempre lleva la etiqueta al lado, así que
 * el color nunca es el único portador del significado.
 */
export const KIND_CHIP: Record<ReceptionKind, { label: string; color: string; bg: string }> = {
  protocolo:     { label: 'Protocolo',     color: 'var(--spira-primary)',  bg: 'rgba(15,95,87,.12)' },
  investigacion: { label: 'Investigación', color: 'var(--spira-track)',    bg: 'rgba(46,125,116,.14)' },
  ambulatoria:   { label: 'Ambulatoria',   color: 'var(--spira-contable)', bg: 'rgba(58,107,140,.12)' },
}
