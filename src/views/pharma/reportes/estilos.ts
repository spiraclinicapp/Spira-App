import type { CSSProperties } from 'react'

/**
 * Estilos compartidos de Reportes.
 *
 * Viven acá porque los usan cinco archivos de la carpeta y repetirlos era la duplicación más
 * grande del rediseño. Tres desvíos del handoff quedaron fijados en estas constantes, por decisión
 * del design review:
 *
 *  · RADIO 16, no 14. Es `--spira-radius-lg`, el radio de card del sistema.
 *  · CARD PLANA en reposo, sin sombra. DESIGN.md: "plano por defecto; sombra solo si la card de
 *    verdad flota". El handoff ponía `--shadow-sm` en las nueve y con eso todo flota y nada resalta.
 *  · REALCE POR ELEVACIÓN, nunca por color. El handoff cambiaba borde y texto a acento en el
 *    hover; la regla del sistema es levante de 1px más sombra, y el color queda para significado.
 *
 * Y una cuarta que no es del handoff sino del repo: los rótulos van en `ink-soft` (5,84:1) y no en
 * `faint` (2,23:1 sobre blanco, la mitad del mínimo que pide AA para texto normal). `faint` queda
 * para los guiones de celda vacía y los separadores, que son marcas de ausencia, no texto.
 */

/** Card en reposo: borde, sin sombra. */
export const card: CSSProperties = {
  background: 'var(--spira-white)',
  border: '1px solid var(--spira-line)',
  borderRadius: 16,
}

/** Rótulo en versalita. Es `.spira-eyebrow` del sistema, con su tamaño y tracking. */
export const eyebrow: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '0.11em',
  textTransform: 'uppercase', color: 'var(--spira-ink-soft)',
}

/** Número grande de tarjeta (display, tabular). */
export const bigNumber: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontSize: 34, fontWeight: 800,
  letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
}

/** Sufijo de unidad al lado del número grande. */
export const unidadSufijo: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontSize: 13, fontWeight: 600,
  color: 'var(--spira-muted)', marginLeft: 5, letterSpacing: 0,
}

/** Pie de tarjeta: separado por una línea y pegado abajo, para que las tres alineen. */
export const cardFooter: CSSProperties = {
  borderTop: '1px solid var(--spira-line)', paddingTop: 9, marginTop: 'auto',
  fontSize: 12, color: 'var(--spira-ink-soft)', lineHeight: 1.45,
}

/** Cabecera de sección: título, regla y acciones. */
export const sectionHead: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 12px',
}

export const sectionTitle: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontSize: 16.5, fontWeight: 700,
  letterSpacing: '-0.01em', margin: 0,
}

export const sectionRule: CSSProperties = { flex: 1, height: 1, background: 'var(--spira-line)' }

export const sectionHint: CSSProperties = { fontSize: 12, color: 'var(--spira-ink-soft)' }

/** Encabezado de tabla. `ink-soft`, no `faint`: es texto que alguien lee. */
export const th: CSSProperties = {
  textAlign: 'left', padding: '12px 16px 9px', borderBottom: '1px solid var(--spira-line-2)',
  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--spira-ink-soft)', whiteSpace: 'nowrap',
}

export const td: CSSProperties = {
  padding: '13px 16px', borderBottom: '1px solid var(--spira-line)', verticalAlign: 'middle',
}

export const tdNum: CSSProperties = { ...td, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }

export const tfootTd: CSSProperties = {
  padding: '11px 16px', background: 'var(--spira-surface)',
  borderTop: '1px solid var(--spira-line-2)', fontWeight: 700, fontSize: 12.5,
}

/** Segunda línea de celda (producto y sponsor debajo del código). */
export const subLine: CSSProperties = { fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 2 }

/** Guion de celda vacía. Acá SÍ va `faint`: es una marca de ausencia, no texto que se lee. */
export const dash: CSSProperties = { color: 'var(--spira-faint)' }

export const tabla: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }

/** Track de barra (participación, balance). */
export const barTrack: CSSProperties = {
  background: 'var(--spira-surface)', border: '1px solid var(--spira-line)',
  borderRadius: 999, overflow: 'hidden',
}

/**
 * Botón de impresión de un bloque. Va con `className="spira-card-link"`, que le pone el borde y
 * la sombra del hover; el levante de 1px se lo da la micro-interacción global de tokens.css por
 * ser un `button`. NO cambia de color al pasar el mouse: el realce es la elevación, y el color se
 * reserva para significado.
 *
 * OJO: acá NO va `border`. La clase lo declara, y un borde inline le gana por especificidad y
 * deja el hover sin efecto (es el gotcha de abreviada vs longhand que documenta tokens.css:490).
 */
export const printBtn: CSSProperties = {
  width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center',
  background: 'var(--spira-white)', color: 'var(--spira-muted)', cursor: 'pointer', padding: 0,
}

/**
 * Fila de tabla: se RESALTA, no se levanta (tokens.css:513 — "una fila transparente que se mueve
 * 1px no tiene nada que elevar y lee como temblor"). Acá el resaltado es sólo ayuda de lectura
 * para cruzar una fila de nueve columnas: las filas de estas tablas no son clickeables.
 */
export const rowHover = 'spira-row-link spira-no-press'
