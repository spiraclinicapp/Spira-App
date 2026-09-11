import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { elapsedMinutes, elapsedShort } from '../../lib/dates'

/**
 * Umbrales de tono de la espera. Recalibrados respecto al handoff original (que traía 30/60min,
 * pensado para triage minuto a minuto): esta cola espera HORAS, no minutos — con 30/60min TODA
 * fila real quedaría en "danger" y el color dejaría de comunicar nada ("color con intención").
 * Ajustables acá si no calzan con el ritmo real del centro.
 */
const WAIT_GOOD_MAX_MIN = 60   // < 1h
const WAIT_WARN_MAX_MIN = 180  // 1h–3h; ≥3h = danger

type Tone = 'good' | 'warn' | 'danger'

/**
 * Hex LITERAL de cada tono (y de "sin dato"/faint). Necesario porque `var(--spira-good)33` no es
 * CSS válido — un alfa de 2 dígitos solo se puede sufijar a un hex de verdad, no a una referencia
 * `var()`. Se usa SÓLO para fondos y bordes con tinte (alpha-suffix); la tinta del texto y del ícono
 * sale de `TONE_TINTA`, más abajo, que no es el mismo mapa — ver ahí por qué.
 * Exportado para que el StatCard "Espera más larga" de DoctorQueueView use el MISMO tono/hex.
 *
 * ⚠️ Ese StatCard usa este hex para el TINTE y para el ÍCONO a la vez, porque su prop `color` es
 * una sola. Medido, su ícono queda en 2,61:1 con `danger` en oscuro y en 2,09:1 con el gris de "sin
 * dato" en claro — el mismo defecto que este archivo acaba de arreglar, pero del otro lado de una
 * API que pide un hex literal. Anotado en `TODOS.md`.
 */
export const TONE_HEX: Record<Tone, string> = {
  good: '#5C8A5A',
  warn: '#B0823F',
  danger: '#A6483B',
}
export const FAINT_HEX = '#A6B0AC'

/** Tono por umbral de espera (compartido con el StatCard "Espera más larga" de DoctorQueueView). */
export function waitTone(mins: number | null): Tone | null {
  if (mins === null) return null
  if (mins < WAIT_GOOD_MAX_MIN) return 'good'
  if (mins < WAIT_WARN_MAX_MIN) return 'warn'
  return 'danger'
}

/**
 * Tiempo esperando al médico, con tinte por umbral. `iso` = `wants_doctor_at` (migración 0049);
 * `null` → "—" (marcada antes de la 0049 o dato no disponible; NUNCA se inventa un tiempo).
 * Urgencia = ícono + color ESTÁTICOS (sin pulso animado — preferencia de calma del sistema).
 * El padre re-renderiza cada 15s (reloj vivo); acá solo se recalcula contra `Date.now()` real.
 */
/* La TINTA del valor, por tono. Separada del hex del tinte y con dos correcciones respecto de lo
   que había (2026-09-11), las dos medidas sobre el tinte real (`TONE_HEX + '12'`) con el umbral que
   corresponde: el valor va en 19px/800, que para WCAG es texto GRANDE y pide 3:1, no 4,5.

     tono        antes                          ahora
     good        3,71 claro · 3,72 oscuro  ✅   sin cambio
     warn        3,19 claro · 4,27 oscuro  ✅   sin cambio
     danger      5,26 claro · 2,63 oscuro  ❌   5,26 · 7,31  ✅   acc-deep-danger
     sin dato    3,28 claro · 2,78 oscuro  ❌   4,93 · 5,50  ✅   muted

   `good` y `warn` NO se tocan: PASAN. Con el umbral de texto normal habrían fallado, y barrer este
   archivo "igual que MotivoChip" —mismo patrón `colorVar` + `colorHex`— habría movido dos tonos
   sanos. El tamaño de la tipografía cambia el veredicto, no el patrón.

   `danger` fallaba sólo en oscuro porque `--spira-danger` no se redefine para ese tema; es el mismo
   defecto que ya se arregló en los avisos de Ajustes y en los chips de motivo.

   El caso SIN DATO no se arregla con un `acc-deep-*` —no hay uno gris— y `--spira-faint` no alcanza:
   el tinte es un gris CLARO (#A6B0AC al 7%) y sobre la card oscura queda casi del mismo valor. Va
   `--spira-muted`, que además es el tono que ya usa el rótulo "esperando" de abajo: cuando no hay
   dato, valor y rótulo pesan igual, que es exactamente lo que corresponde — no hay nada que
   destacar. */
const TONE_TINTA: Record<Tone, string> = {
  good: 'var(--spira-good)',
  warn: 'var(--spira-warn)',
  danger: 'var(--spira-acc-deep-danger)',
}

export function WaitBadge({ iso }: { iso: string | null }) {
  const mins = iso ? elapsedMinutes(iso) : null
  const tone = waitTone(mins)
  const colorVar = tone ? TONE_TINTA[tone] : 'var(--spira-muted)'
  const colorHex = tone ? TONE_HEX[tone] : FAINT_HEX
  const display = iso && mins !== null ? elapsedShort(iso) : '—'
  const critical = tone === 'danger'

  return (
    <div style={{ ...badge, background: `${colorHex}12`, borderColor: `${colorHex}33` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
        {critical && <Icon name="alert" size={12} color={colorVar} />}
        <span style={{ ...valueStyle, color: colorVar }}>{display}</span>
      </div>
      <span style={labelStyle}>esperando</span>
    </div>
  )
}

const badge: CSSProperties = {
  flex: '0 0 auto', width: 92, borderRadius: 14, padding: '10px 8px',
  border: '1px solid', textAlign: 'center',
}
const valueStyle: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontWeight: 800, fontSize: 19,
  fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, whiteSpace: 'nowrap',
}
const labelStyle: CSSProperties = {
  display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--spira-muted)', marginTop: 3,
}
