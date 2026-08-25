import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'

/**
 * Vocabulario visual de una visita: la etiqueta del protocolo, los puntos de procedimiento y el
 * responsable. Lo comparten Visitas del día y los dos resúmenes, por eso vive en `views/` y no
 * en `views/track/` — mismo criterio que `visitStates.tsx`.
 *
 * Portado del prototipo `visitas-v2` del handoff, pero con tokens de Spira: NO usa la paleta
 * LIGHT/DARK del prototipo. Los tonos de protocolo son constantes en ambos temas (igual criterio
 * que OPERATIONAL_STAGES y los acentos de módulo) y todo lo demás sale de tokens.css.
 */

/* Tonos estables para la etiqueta de protocolo. Constantes en los dos temas: se usan como
   `tono + alpha` (fondo tenue) sobre white/surface, igual que los chips de estado. */
export const PROTO_TONES = ['#3A6B8C', '#2E7D74', '#6B5CA5', '#A8842F', '#5C8A5A'] as const

/** Tono estable de un protocolo (hash del id → paleta): el color no cambia entre sesiones. */
export function protoTone(protocolId: string): string {
  let h = 0
  for (let i = 0; i < protocolId.length; i++) h = (h * 31 + protocolId.charCodeAt(i)) >>> 0
  return PROTO_TONES[h % PROTO_TONES.length]
}

/**
 * Etiqueta de protocolo: el código del estudio sobre su tono.
 *
 * El TEXTO va en tinta, no en el tono. Escribir el tono sobre el tono al 9 % daba entre 3.2:1 y
 * 5.1:1 en claro y entre 2.6:1 y 4.1:1 en oscuro — por debajo del 4.5:1 que pide WCAG AA para
 * texto normal (13 px bold lo es; "grande" arranca en 18.66 px). El color no se pierde: se queda
 * en el fondo, que es donde significa "este protocolo", y el fondo sube a 14 % para que se lea.
 */
export function ProtoTag({ code, protocolId }: { code: string; protocolId: string }) {
  const tone = protoTone(protocolId)
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 7,
        background: tone + '24', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-display)',
        fontSize: 13, fontWeight: 700, letterSpacing: '0.01em', whiteSpace: 'nowrap',
      }}
    >
      {code}
    </span>
  )
}

/**
 * Etiqueta del código de visita ("V20", "Scr"): tinta plena, el contraste más alto de la fila.
 *
 * Va en negativo y no teñida como el protocolo, porque dice otra cosa: el protocolo identifica un
 * estudio —y por eso su color varía y significa—, mientras que el código de visita ubica a esta
 * visita en SU cronograma. Es el dato que se busca al escanear la lista, así que se lleva el peso.
 *
 * Vive acá, junto a `ProtoTag`, desde que la cola del médico adoptó el mismo par (pedido del
 * Director, 2026-08-25): los dos chips tienen que verse igual en las dos pantallas, y tenerlos
 * inline en cada vista es justo cómo se habían separado.
 */
export function VisitCodeTag({ code }: { code: string }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 6,
        background: 'var(--spira-ink)', color: 'var(--spira-paper)',
        fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap',
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
