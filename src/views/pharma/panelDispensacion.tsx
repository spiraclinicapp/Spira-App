import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'

/* Las piezas que comparten las partes de la tarjeta de Dispensación de la visita: el panel
   (`VisitDispensationPanel`), la sección del producto en investigación (`SeccionIp`) y el historial
   plegado (`HistorialPlegado`). Vivían privadas en el panel; la Tanda 3a lo partió (plan R9) y copiar
   los estilos a cada archivo habría sido tres tarjetas esperando a divergir. */

// Tintes con rgba() literal (no se puede concatenar alfa a un var(--x)). --spira-danger #A6483B,
// --spira-warn #B0823F.
export const DANGER_TINT = 'rgba(166, 72, 59, 0.10)'
// Tres alfas del mismo ámbar, una por caja, tal como las midió el mock (cada una contra el peso y
// el tamaño de SU texto): .14 para el aviso "Falta la constancia" (texto en tinta, ver `warnBox` en
// `SeccionIp`), .15 para el aviso de dispensación reciente en tono de alerta (`AvisoReciente`), y .20
// para las píldoras "Incompleta" y "Sin solicitar" (más saturada porque ahí el color SÍ es la
// etiqueta — por eso su tinta es el ámbar PROFUNDO de tokens y no `--spira-warn`).
export const WARN_TINT = 'rgba(176, 130, 63, 0.14)'
export const WARN_TINT_AVISO = 'rgba(176, 130, 63, 0.15)'
export const WARN_TINT_PILL = 'rgba(176, 130, 63, 0.20)'

export const muted: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)' }

/** Renglón de la tarjeta sobre papel blanco, con su propio borde (mock `.item`). */
export const itemRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '8px 12px',
  border: '1px solid var(--spira-line)', borderRadius: 11, background: 'var(--spira-white)',
}

/** Botón chico y secundario de adentro de la tarjeta: «Pedir fuera de cronograma» y «Pedir el saldo»
 *  (mock de la Tanda 3). Mismo alto que la píldora de acción del mock: 32px. */
export const btnChico: CSSProperties = {
  flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 12px',
  borderRadius: 8, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, color: 'var(--spira-ink)',
}

export const pillBase: CSSProperties = {
  flex: '0 0 auto', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--spira-radius-pill)',
}

/** Rótulo de subsección: `ink-soft`, no el `faint` del `.spira-eyebrow` — ese da 2,1:1 sobre
 *  `surface` y acá es la división PRIMARIA de la tarjeta (concomitante vs. IP), no una nota al pie. */
const subLabel: CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '.13em', textTransform: 'uppercase',
  color: 'var(--spira-ink-soft)',
}

/**
 * El MISMO rótulo, en ámbar, para la excepción. La excepción se integra por ESTRUCTURA —mismo ritmo
 * de rótulo, contenido y filete—, no por una caja aparte: la primera versión colgaba un formulario
 * encima de la tarjeta y el Director la rechazó por eso (mock §4). Lo único que la distingue es el
 * color del rótulo.
 *
 * El ámbar va por `--spira-acc-deep-warn` y no por `--spira-warn`: como todo color "profundo" de
 * tokens, se INVIERTE en oscuro (en claro oscurece para leerse sobre papel; en oscuro aclara). El
 * ámbar oscuro sobre card oscura da 2,39:1, así que el token es también la decisión de contraste.
 */
const subLabelExc: CSSProperties = {
  ...subLabel, color: 'var(--spira-acc-deep-warn)', display: 'inline-flex',
  alignItems: 'center', gap: 6,
}

/**
 * Una subsección de la tarjeta partida. El filete separa; no hay cajas anidadas (mock v6, §2).
 * `excepcion` no cambia el ritmo —ese es justamente el punto—, solo tiñe el rótulo y le antepone
 * el ícono.
 */
export function Sub({ label, first, excepcion, children }: {
  label: string
  first?: boolean
  excepcion?: boolean
  children: ReactNode
}) {
  return (
    <div style={first ? undefined : { marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--spira-line)' }}>
      <div style={{ ...(excepcion ? subLabelExc : subLabel), marginBottom: 9 }}>
        {/* `info` (círculo) y no `alert` (triángulo): el rótulo señala una EXCEPCIÓN, no un error.
            El triángulo queda reservado para el aviso que sí puede estar marcando un problema. */}
        {excepcion && <Icon name="info" size={12} stroke={2.4} />}
        {label}
      </div>
      {children}
    </div>
  )
}
