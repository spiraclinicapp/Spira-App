import type { CSSProperties } from 'react'
import { InfoTip } from '../../components/InfoTip'

const indicadoInline: CSSProperties = {
  width: 60, height: 36, borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', padding: '0 10px', fontFamily: 'var(--spira-font-text)', fontSize: 14,
  color: 'var(--spira-ink)',
}

/**
 * «Entregar en partes» (D8): la casilla, su ⓘ y, tildada, una línea con el total indicado y el saldo
 * que queda. La cantidad de arriba sigue siendo lo que se entrega hoy; por envases, nunca dosis.
 *
 * Rediseñado por pedido del Director (2026-09-14): «En partes · entregar … de [2] envases» no se
 * entendía. El rótulo dice la acción entera, el porqué vive en el ⓘ, y adentro queda una sola línea
 * que siempre se lee. Lo comparten el selector de la medicación habilitada y el de «Otro» (0124).
 */
export function EntregarEnPartes({ activo, onActivo, indicado, onIndicado, cantidad, accent }: {
  activo: boolean
  onActivo: (v: boolean) => void
  indicado: string
  onIndicado: (v: string) => void
  /** Lo que se entrega hoy, ya parseado (NaN si el campo no es un número). */
  cantidad: number
  accent: string
}) {
  const ind = parseInt(indicado, 10)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 13, color: 'var(--spira-ink)' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
          <input
            type="checkbox" checked={activo}
            onChange={(e) => { onActivo(e.target.checked); if (!e.target.checked) onIndicado('') }}
            style={{ width: 16, height: 16, margin: 0, accentColor: accent }}
          />
          Entregar en partes
        </label>
        <InfoTip
          titulo="Entregar en partes"
          cuerpo="Para lo que se da de a poco. Hoy se entrega la cantidad de arriba y lo que falta queda como saldo, para pedirlo en otra visita con un clic."
          size={14}
        />
      </div>
      {activo && (
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingLeft: 24, fontSize: 13 }}>
          <span style={{ color: 'var(--spira-ink-soft)' }}>Total indicado</span>
          <input
            type="number" min={2} value={indicado} autoFocus onChange={(e) => onIndicado(e.target.value)}
            aria-label="Total de envases indicados" style={indicadoInline}
          />
          <span style={{ color: 'var(--spira-ink-soft)' }}>envases</span>
          {Number.isFinite(ind) && Number.isFinite(cantidad) && cantidad > 0 && (
            <span style={{ fontSize: 12.5, fontWeight: 600, color: ind > cantidad ? 'var(--spira-ink-soft)' : 'var(--spira-acc-deep-warn)' }}>
              {ind > cantidad ? `· queda ${ind - cantidad} de saldo` : `· tiene que ser más de ${cantidad}`}
            </span>
          )}
        </div>
      )}
    </>
  )
}

/** «En partes» con lo indicado sin completar, o no mayor a lo de hoy: «Agregar» no lo deja pasar. */
export function partesInvalidas(activo: boolean, indicado: string, cantidad: number): boolean {
  const ind = parseInt(indicado, 10)
  return activo && (!Number.isFinite(ind) || !Number.isFinite(cantidad) || ind <= cantidad)
}
