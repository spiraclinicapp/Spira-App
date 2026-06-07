/* Vilano1 ("Sereno") — el isotipo de Spira: la semilla del diente de león.
   Geometría procedural (no a ojo). Es la MARCA, no un ícono de UI. */

const rad = (deg: number) => (deg * Math.PI) / 180

interface VilanoProps {
  size?: number
  /** Por defecto toma el color de marca del tema (claro: petróleo · oscuro: menta). */
  color?: string
  stroke?: number
}

export function Vilano({ size = 120, color = 'var(--spira-brand-mark)', stroke = 1.4 }: VilanoProps) {
  const cx = 100
  const cy = 118
  const R = 86
  const N = 19
  const spread = 150
  const filaments = Array.from({ length: N }, (_, i) => {
    const a = rad(-90 - spread / 2 + (spread * i) / (N - 1))
    return { ex: cx + R * Math.cos(a), ey: cy + R * Math.sin(a), a }
  })

  return (
    <svg
      width={size}
      height={size * 1.2}
      viewBox="0 0 200 240"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
    >
      {filaments.map((f, i) => {
        const tufts = [-16, 0, 16]
          .map((d) => {
            const ta = f.a + rad(d)
            return `M ${f.ex} ${f.ey} L ${f.ex + 9 * Math.cos(ta)} ${f.ey + 9 * Math.sin(ta)}`
          })
          .join(' ')
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={f.ex} y2={f.ey} opacity="0.85" />
            <path d={tufts} strokeWidth={stroke * 0.7} opacity="0.6" />
            <circle cx={f.ex} cy={f.ey} r="1.1" fill={color} stroke="none" opacity="0.5" />
          </g>
        )
      })}
      <line x1={cx} y1={cy} x2={cx} y2={196} opacity="0.9" />
      <path d="M 100 196 C 96 206 96 216 100 224 C 104 216 104 206 100 196 Z" fill={color} stroke="none" opacity="0.92" />
    </svg>
  )
}
