import type { CSSProperties } from 'react'
import { formatNumberAR, formatPctAR, sharePct } from '../../../lib/numbers'
import type { FilaProtocolo } from './agregados'
import { card, eyebrow } from './estilos'

/**
 * La composición del período: los kits de investigación y el ranking por protocolo.
 *
 * EL HANDOFF TENÍA ACÁ UNA BARRA APILADA DE TRES CATEGORÍAS y no está. No es una simplificación:
 * esas tres categorías no existen del lado de la salida. `reception_kind` (0035) es
 * `protocolo` / `investigacion` / `ambulatoria`; la ambulatoria todavía no puede DISPENSAR (quedó
 * como feature propia) y la investigación se mide en kits, en su propio eje. En el eje de unidades
 * queda una sola categoría, así que la barra sería un único segmento al 100%: un adorno que dice
 * "todo es todo". La barra vuelve el día que exista la dispensación ambulatoria.
 *
 * Lo que sí es real y ya estaba: el reparto por protocolo. Es la composición de verdad del período.
 */

export function Composicion({ protocolos, kits, unidades }: {
  protocolos: FilaProtocolo[]
  kits: number
  unidades: number
}) {
  const top = protocolos.slice(0, 4)
  const resto = protocolos.slice(4)
  const pctResto = resto.reduce((a, f) => a + f.pct, 0)

  return (
    <div style={{ ...card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 15 }}>
      <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 14, fontWeight: 700 }}>
        Composición del período
      </div>

      {/* Los kits van en su propio bloque y con su unidad escrita. Es la manera de que nadie los
          lea como si fueran unidades: un kit puede tener treinta comprimidos adentro, y su
          composición la declara el sponsor, no Spira (principio de la 0038). */}
      <div style={ipBox}>
        <div style={eyebrow}>Producto de investigación</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 21, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatNumberAR(kits)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--spira-muted)' }}>
            {kits === 1 ? 'kit entregado' : 'kits entregados'}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 7, lineHeight: 1.5 }}>
          Va aparte porque un kit no es una unidad. Las {formatNumberAR(unidades)} u. de arriba no
          lo incluyen.
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--spira-line)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={eyebrow}>Reparto por protocolo</div>
        {protocolos.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
            Sin dispensaciones en el período.
          </div>
        )}
        {top.map((f) => (
          <Fila
            key={f.protocolCode}
            nombre={f.protocolName ? `${f.protocolCode} · ${f.protocolName}` : f.protocolCode}
            pct={f.pct}
          />
        ))}
        {resto.length > 0 && (
          <Fila
            nombre={`Otros ${resto.length} ${resto.length === 1 ? 'protocolo' : 'protocolos'}`}
            pct={pctResto}
            atenuado
          />
        )}
      </div>
    </div>
  )
}

function Fila({ nombre, pct, atenuado }: { nombre: string; pct: number; atenuado?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 10px', fontSize: 12.5 }}>
      <span style={{ color: atenuado ? 'var(--spira-muted)' : undefined, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {nombre}
      </span>
      <span style={{ fontWeight: 600, color: atenuado ? 'var(--spira-muted)' : undefined, fontVariantNumeric: 'tabular-nums' }}>
        {formatPctAR(pct)}
      </span>
      <span style={{ gridColumn: '1/-1', height: 7, borderRadius: 999, background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', overflow: 'hidden' }}>
        <span style={{
          display: 'block', height: '100%', width: `${sharePct(pct, 100)}%`,
          background: atenuado ? 'var(--spira-faint)' : 'var(--spira-pharma-solid)',
        }} />
      </span>
    </div>
  )
}

const ipBox: CSSProperties = {
  border: '1px solid var(--spira-line)', borderRadius: 10,
  background: 'var(--spira-surface)', padding: '12px 14px',
}
