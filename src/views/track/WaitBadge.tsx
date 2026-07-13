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
 * `var()`. Se usa para fondos/bordes con tinte (alpha-suffix); para texto/ícono sólidos se sigue
 * usando el `var(--spira-*)` correspondiente (así se mantiene reactivo al tema claro/oscuro).
 * Exportado para que el StatCard "Espera más larga" de DoctorQueueView use el MISMO tono/hex.
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
export function WaitBadge({ iso }: { iso: string | null }) {
  const mins = iso ? elapsedMinutes(iso) : null
  const tone = waitTone(mins)
  const colorVar = tone ? `var(--spira-${tone})` : 'var(--spira-faint)'
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
