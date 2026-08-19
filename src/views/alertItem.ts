import type { CSSProperties } from 'react'

/**
 * La superficie de un ítem de alerta, compartida por las tres pantallas que muestran alertas:
 * el resumen de Inicio, el de Coordinación y la vista de Alertas.
 *
 * POR QUÉ ES UNA SUPERFICIE Y NO UN RENGLÓN: el fondo y el borde teñidos por severidad SON la
 * señal — es lo que hace que una ventana vencida se distinga de un pendiente sin leer una palabra,
 * y hay una leyenda al pie que lo explica ("Ventana vencida (roja) · Ítem vencido (ámbar)"). Por
 * eso una alerta no usa la fila de visitas: comparten el tipo de dato (las dos son `TrackVisitRow`)
 * pero no la forma. Al ser superficie, se eleva al hover vía `.spira-card-link`, a diferencia de
 * las filas de visita, que se resaltan sin moverse.
 *
 * El borde va en LONGHANDS a propósito: pisa el borde neutro que `.spira-card-link` trae por
 * defecto —que acá borraría la señal de estado— y deja seguro que alguien override sólo el
 * `borderColor` más adelante. Con la abreviada, al apagarse ese estado React vacía la longhand
 * sin restaurar el color y el borde se cae (ver CLAUDE.md).
 */
export function alertItemStyle(
  tone: string,
  /** La vista de Alertas superpone un botón de descartar arriba a la derecha: el texto necesita
   *  aire para no correr por debajo. Los resúmenes no lo tienen. */
  opts: { conBotonDescartar?: boolean } = {},
): CSSProperties {
  return {
    display: 'flex', gap: 11, width: '100%', padding: '12px 13px', borderRadius: 11,
    ...(opts.conBotonDescartar ? { paddingRight: 42 } : null),
    background: tone + '0E',
    borderWidth: 1, borderStyle: 'solid', borderColor: tone + '30',
    textAlign: 'left', cursor: 'pointer',
    fontFamily: 'var(--spira-font-text)', color: 'var(--spira-ink)',
  }
}
