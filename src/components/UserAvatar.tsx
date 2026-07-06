import { Icon } from './Icon'

/* ============================================================================
   UserAvatar — avatar de usuario, fuente ÚNICA (top bar, menú, "Mi cuenta").

   Círculo de tinte petróleo suave + aro esmeralda apoyado sobre el borde + badge de
   check (la "pelotita"). El aro y la pelotita llevan el verde (--spira-avatar-ring,
   emerald-600 claro / emerald-400 oscuro); las iniciales van del mismo verde pero
   ATENUADAS (opacity) para que pasen desapercibidas.

   Centrado a prueba de balas: las iniciales viven en una capa `position:absolute;
   inset:0` que llena el círculo interior y las centra con flex (el nodo de texto
   suelto en un grid/inline no siempre queda parejo).
   ============================================================================ */

export function UserAvatar({ initials, size }: { initials: string; size: number }) {
  const badge = Math.round(size * 0.36)          // diámetro de la pelotita
  const check = Math.round(badge * 0.62)         // ícono de check adentro
  const ring = size > 40 ? 2 : 1.5               // borde blanco que la separa del avatar
  const font = size <= 32 ? 10 : size <= 40 ? 11.5 : 17.5

  return (
    <span
      style={{
        position: 'relative', display: 'inline-block', width: size, height: size, flex: '0 0 auto',
        borderRadius: '50%', background: 'rgba(15, 95, 87, 0.12)', border: '2px solid var(--spira-avatar-ring)',
        verticalAlign: 'middle',
      }}
    >
      <span
        style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: font, lineHeight: 1,
          color: 'var(--spira-avatar-ring)', opacity: 0.6,
        }}
      >
        {initials}
      </span>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', bottom: -1, right: -1, width: badge, height: badge, borderRadius: '50%',
          background: 'var(--spira-avatar-ring)', border: `${ring}px solid var(--spira-white)`,
          display: 'grid', placeItems: 'center',
        }}
      >
        <Icon name="check" size={check} color="#fff" stroke={3} />
      </span>
    </span>
  )
}
