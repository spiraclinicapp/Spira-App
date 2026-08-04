import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'

/**
 * Piezas base de la fila/modal de "Visitas del día" v2 (portadas del prototipo `visitas-v2`,
 * con tokens de Spira). No usan la paleta LIGHT/DARK del prototipo: los tonos de protocolo son
 * constantes en ambos temas (igual criterio que OPERATIONAL_STAGES / los acentos de módulo),
 * y todo lo demás sale de tokens.css.
 */

/* Tonos estables para la etiqueta de protocolo. Constantes en los dos temas: se usan como
   `tono + alpha` (fondo tenue) sobre white/surface, igual que los chips de estado. */
const PROTO_TONES = ['#3A6B8C', '#2E7D74', '#6B5CA5', '#A8842F', '#5C8A5A'] as const

/** Tono estable de un protocolo (hash del id → paleta): el color no cambia entre sesiones. */
export function protoTone(protocolId: string): string {
  let h = 0
  for (let i = 0; i < protocolId.length; i++) h = (h * 31 + protocolId.charCodeAt(i)) >>> 0
  return PROTO_TONES[h % PROTO_TONES.length]
}

/** Etiqueta de protocolo: pastilla con el código del estudio sobre su tono al 9 %. */
export function ProtoTag({ code, protocolId }: { code: string; protocolId: string }) {
  const tone = protoTone(protocolId)
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 7,
        background: tone + '16', color: tone, fontFamily: 'var(--spira-font-display)',
        fontSize: 13, fontWeight: 700, letterSpacing: '0.01em', whiteSpace: 'nowrap',
      }}
    >
      {code}
    </span>
  )
}

/**
 * Tags de procedimiento en la fila — variante `punto` del handoff: punto + nombre, en `muted`,
 * con wrap. Monocromo (el punto en `accent`): el catálogo real de procedimientos es de texto libre,
 * no tiene los 7 tonos/letras fijos del prototipo de demo → no se inventa una escala de color.
 */
export function ProcDots({ names, accent }: { names: string[]; accent: string }) {
  if (names.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {names.map((n, i) => (
        <span
          key={i}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600,
            color: 'var(--spira-muted)', whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, flex: '0 0 auto' }} />
          {n}
        </span>
      ))}
    </div>
  )
}

/** Responsable de la visita (Coord. / Médico): ícono + rol + nombre. `null` cae a "Sin asignar". */
export function Persona({ role, name, icon }: { role: string; name: string | null; icon: IconName }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
        color: 'var(--spira-muted)', whiteSpace: 'nowrap', minWidth: 0,
      }}
    >
      <Icon name={icon} size={13} color="var(--spira-faint)" />
      <span style={{ color: 'var(--spira-faint)', flex: '0 0 auto' }}>{role}</span>
      <span
        style={{
          color: name ? 'var(--spira-ink)' : 'var(--spira-faint)', fontWeight: name ? 600 : 400,
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {name ?? 'Sin asignar'}
      </span>
    </span>
  )
}
