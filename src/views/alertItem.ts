import type { CSSProperties } from 'react'

/**
 * La superficie de un ítem de alerta. **La usa una sola pantalla: la vista de Alertas**
 * (`TrackAlertsView`), en sus dos listas — las alertas de visita y los reportes pendientes.
 *
 * (El comentario anterior decía "las tres pantallas: el resumen de Inicio, el de Coordinación y la
 * vista de Alertas", y hacía rato que no era cierto: Inicio dejó de listar alertas —sólo cuenta— y
 * el Resumen de Coordinación pasó a filas planas con la cabecera teñida en el rediseño del
 * 2026-09-01. Se corrige acá porque un comentario stale desorienta más que la falta de comentario:
 * este mismo decía "tres" cuando eran dos, y esa cuenta se usó para dimensionar un cambio.)
 *
 * POR QUÉ ES UNA SUPERFICIE Y NO UN RENGLÓN, que sigue siendo cierto donde vive: el fondo y el
 * borde teñidos por severidad SON la señal — es lo que hace que una ventana vencida se distinga de
 * un pendiente sin leer una palabra, y hay una leyenda al pie que lo explica ("Ventana vencida
 * (roja) · Ítem vencido (ámbar)"). Por eso una alerta no usa la fila de visitas: comparten el tipo
 * de dato (las dos son `TrackVisitRow`) pero no la forma. Al ser superficie, se eleva al hover vía
 * `.spira-card-link`, a diferencia de las filas de visita, que se resaltan sin moverse.
 *
 * Y POR QUÉ EL RESUMEN YA NO LA USA: son dos problemas distintos. Acá la lista es larga y mezcla
 * tipos, así que cada ítem tiene que gritar su gravedad por sí solo. En el Resumen son dos o tres
 * alertas miradas de reojo dentro de un mosaico de tarjetas, y ahí tres bloques teñidos compiten
 * con las tarjetas vecinas en vez de informar; el color se concentra en la cabecera
 * (`AlertCardHeader`) y las filas quedan planas con su punto.
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
