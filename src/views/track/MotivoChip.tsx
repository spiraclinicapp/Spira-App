import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'

/**
 * Tono + urgencia por motivo. Catálogo real = `MOTIVOS` de `doctorMotivos.ts` (migración 0047):
 * Evento adverso / Síntomas reportados / Laboratorio fuera de rango / Consulta clínica / Otro.
 * "Evento adverso" es el único urgente (chip + ícono de alerta). Motivo libre no reconocido →
 * tono muted por default (defensivo; el catálogo puede crecer).
 *
 * `colorHex` (literal) para el fondo con alfa — `var(--spira-x)33` no es CSS válido, un alfa de
 * 2 dígitos solo se puede sufijar a un hex real. `colorVar` para texto/ícono (sólido, reactivo al
 * tema). Mismos hex que `TONE_HEX` de `WaitBadge.tsx` (good/warn/danger); track/muted no viven ahí.
 */
const MOTIVO_TONE: Record<string, { colorVar: string; colorHex: string; urgente?: boolean }> = {
  'Evento adverso':              { colorVar: 'var(--spira-danger)', colorHex: '#A6483B', urgente: true },
  'Síntomas reportados':         { colorVar: 'var(--spira-warn)',   colorHex: '#B0823F' },
  'Laboratorio fuera de rango':  { colorVar: 'var(--spira-warn)',   colorHex: '#B0823F' },
  'Consulta clínica':            { colorVar: 'var(--spira-track)',  colorHex: '#2E7D74' },
  'Otro':                        { colorVar: 'var(--spira-muted)',  colorHex: '#7C8C87' },
}
const DEFAULT_TONE = { colorVar: 'var(--spira-muted)', colorHex: '#7C8C87' }

/** Pill de motivo de derivación al médico. `motivo` null → no renderiza nada. */
export function MotivoChip({ motivo }: { motivo: string | null }) {
  if (!motivo) return null
  const tone = MOTIVO_TONE[motivo] ?? DEFAULT_TONE
  return (
    <span style={{ ...pill, color: tone.colorVar, background: tone.colorHex + '1A' }}>
      {tone.urgente && <Icon name="alert" size={12} color={tone.colorVar} />}
      {motivo}
    </span>
  )
}

const pill: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  fontSize: 12, fontWeight: 600, borderRadius: 'var(--spira-radius-pill)',
  padding: '2px 10px', whiteSpace: 'nowrap',
}
