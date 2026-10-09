import type { CSSProperties } from 'react'

/**
 * Estilos de Coordinación › Estadísticas. Subconjunto de `views/pharma/reportes/estilos.ts` —
 * mismos tokens (radio 16, card plana, realce por elevación), sin cruzar el import de Farmacia a
 * Coordinación por lo mismo que documenta `rango.ts`. Si un tercer reporte necesita este mismo
 * juego, ahí conviene extraerlo a un lugar común.
 */

/* Sin borde abajo (Director, 2026-10-09): la primera sección arranca con su propia línea a 28px, y
   las dos juntas se leían como una doble raya. La línea que sigue al título es el agrupador de la
   casa (la misma de los días de Recepción); la barra de filtros no necesita otra para separarse. */
export const filtrosFila: CSSProperties = {
  display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
  padding: '2px 0 0', marginBottom: 12,
}

export const sectionHead: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 12px',
}

export const sectionTitle: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontSize: 16.5, fontWeight: 700,
  letterSpacing: '-0.01em', margin: 0,
}

export const sectionRule: CSSProperties = { flex: 1, height: 1, background: 'var(--spira-line)' }

export const sectionHint: CSSProperties = { fontSize: 12, color: 'var(--spira-ink-soft)' }

export const tablaWrap: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16,
  overflowX: 'auto',
}

export const tabla: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }

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

export const subLine: CSSProperties = { fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 2 }

export const dash: CSSProperties = { color: 'var(--spira-muted)' }

export const barTrack: CSSProperties = {
  background: 'var(--spira-surface)', border: '1px solid var(--spira-line)',
  borderRadius: 999, overflow: 'hidden', height: 6, width: '100%',
}

export const barFill = (pct: number, color: string): CSSProperties => ({
  width: `${pct}%`, height: '100%', background: color, borderRadius: 999,
})

/** Fila expandible: clickeable, sin la elevación de `.spira-row-link` (nueve columnas, no es un
 *  link a otra pantalla — abre/cierra en el lugar). */
export const filaExpandible: CSSProperties = { cursor: 'pointer' }

export const chevron: CSSProperties = { transition: 'transform .15s', display: 'inline-flex' }
export const chevronAbierto: CSSProperties = { transform: 'rotate(90deg)' }

export const filaDetalle: CSSProperties = { background: 'var(--spira-surface)' }

export const detalleInner: CSSProperties = { padding: '14px 16px 16px 46px', display: 'flex', flexDirection: 'column', gap: 9 }

/** La caja de aviso ámbar (informe cortado por el techo de filas). */
export const avisoCaja: CSSProperties = {
  display: 'flex', gap: 9, alignItems: 'flex-start', margin: '0 0 16px', padding: '11px 14px',
  background: 'var(--spira-surface)', border: '1px solid var(--spira-line-2)', borderRadius: 10,
  fontSize: 12.5, lineHeight: 1.5, color: 'var(--spira-acc-deep-warn)',
}
