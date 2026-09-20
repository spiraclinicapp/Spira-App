import type { CSSProperties } from 'react'

/**
 * Los tonos del tag de estado de un reporte.
 *
 * EL TINTE ES OPACO —mezclado contra `--spira-white`— y no un hex con alfa, MEDIDO: un tag vive
 * sobre el papel del panel, y el rojo al 10 % transparente sobre papel da 4,50:1 justo en el borde
 * del AA (11,5px/700 es texto normal) y al 16 % cae a 4,13. Contra blanco no depende del fondo: al
 * 12 % da ~4,9:1 el rojo y ~6,1:1 el ámbar en claro, y más de 7:1 los dos en oscuro.
 *
 * EL TEXTO SALE SIEMPRE DE UN `--spira-acc-deep-*` y nunca del color crudo: el color sobre su propio
 * tinte queda por debajo del 4,5:1 que pide WCAG (el handoff lo pedía así; está medido en el repo
 * sobre 16 combinaciones). Son además los únicos acentos con versión para el tema oscuro.
 *
 * Vienen de `TONO_PILDORA` (la píldora «N reportes» que el rediseño retira) y suman las dos etapas
 * que antes no tenían tag: descargado y evolucionado.
 */
export type TonoReporte = 'neutro' | 'pendiente' | 'vencido' | 'descargado' | 'evolucionado'

interface Tinte { texto: string; fondo: string; borde: string }

const tinte = (hex: string, texto: string): Tinte => ({
  texto,
  fondo: `color-mix(in srgb, ${hex} 12%, var(--spira-white))`,
  borde: `color-mix(in srgb, ${hex} 30%, var(--spira-white))`,
})

export const TONOS: Record<Exclude<TonoReporte, 'neutro'>, Tinte> = {
  pendiente: tinte('#B0823F', 'var(--spira-acc-deep-warn)'),
  vencido: tinte('#A6483B', 'var(--spira-acc-deep-danger)'),
  // Azul de "archivo en mano": el sistema no tiene un color de «en curso» y el hex vive acá, igual
  // que en `STAGE_META`. Si algún día aparece ese token, este es el único lugar a cambiar.
  descargado: tinte('#3A6B8C', 'var(--spira-acc-deep-blue)'),
  evolucionado: tinte('#5C8A5A', 'var(--spira-acc-deep-good)'),
}

/**
 * El tag de estado: alto 24, radio pill, texto 11,5/700.
 *
 * El neutro («Sin empezar») va sin tinte —borde de línea y tinta atenuada—: todavía no hay nada que
 * señalar, y teñirlo lo pondría a competir con los estados que sí piden algo. El color acá es
 * SIGNIFICADO (falta, venció, está en curso, se cerró), que es para lo que la casa lo reserva.
 */
export function estiloTag(tono: TonoReporte): CSSProperties {
  const t = tono === 'neutro' ? null : TONOS[tono]
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5, flex: '0 0 auto',
    height: 24, padding: '0 9px', borderRadius: 'var(--spira-radius-pill)',
    borderWidth: 1, borderStyle: 'solid', borderColor: t ? t.borde : 'var(--spira-line)',
    background: t ? t.fondo : 'transparent',
    color: t ? t.texto : 'var(--spira-ink-soft)',
    fontFamily: 'var(--spira-font-text)', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
  }
}
