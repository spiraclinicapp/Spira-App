import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'

/**
 * Tono + urgencia por motivo. Catálogo real = `MOTIVOS` de `doctorMotivos.ts` (migración 0047):
 * Evento adverso / Síntomas reportados / Laboratorio fuera de rango / Consulta clínica / Otro.
 * "Evento adverso" es el único urgente (chip + ícono de alerta). Motivo libre no reconocido →
 * tono muted por default (defensivo; el catálogo puede crecer).
 *
 * `colorHex` (literal) para el FONDO con alfa — `var(--spira-x)33` no es CSS válido, un alfa de
 * 2 dígitos solo se puede sufijar a un hex real. `colorVar` para el TEXTO y el ícono.
 *
 * ── POR QUÉ EL TEXTO SALE DE LA FAMILIA `--spira-acc-deep-*` (2026-09-11) ──
 * Antes salía de `--spira-danger` / `--spira-warn` / `--spira-track`, que suenan a "el token del
 * tema" y no lo son del todo: NINGUNO de los tres se redefine para el tema oscuro. Se quedan en su
 * hex claro sobre una card casi negra. Los `--spira-acc-deep-*` son los únicos acentos con versión
 * aclarada, que es exactamente para esto.
 *
 * Medido sobre el tinte real de cada chip (`colorHex + '1A'` sobre la card), umbral AA 4,5:1 porque
 * el pill es 12px/600 — texto normal, no grande:
 *
 *     motivo                token viejo              token nuevo
 *     Evento adverso        5,02 claro · 2,56 oscuro ❌   5,02 · 7,12 ✅   acc-deep-danger
 *     Síntomas / Lab        3,09 claro · 4,08 oscuro ❌   6,25 · 9,10 ✅   acc-deep-warn
 *     Consulta clínica      4,29 claro · 3,01 oscuro ❌   6,61 · 10,29 ✅  acc-deep-track
 *     Otro                  4,67 claro · 5,44 oscuro ✅   sin cambio       muted
 *
 * "Evento adverso" es el caso que más duele: es el ÚNICO urgente de la lista y era el peor en
 * oscuro. Y "Consulta clínica" es el que sólo aparece si se miden todos: fallaba en los dos temas y
 * no estaba en el radar, que buscaba ámbar.
 *
 * `Otro` se queda en `--spira-muted` a propósito: ése SÍ tiene versión oscura y ya pasa en los dos.
 * Cambiarlo sería mover un color que no tiene ningún problema.
 *
 * ⚠️ El `colorHex` NO se toca: el fondo teñido es para lo que ese hex sirve, y ahí el hex crudo es
 * lo correcto. Es la misma división que documenta `alertSeverity.ts`.
 *
 * El hermano `WaitBadge.tsx` tiene el mismo patrón `colorVar` + `colorHex` pero NO el mismo
 * veredicto: su valor va en 19px/800, que es texto GRANDE (umbral 3:1), así que `good` y `warn`
 * pasan y no hay que tocarlos. Ver `TODOS.md`.
 */
const MOTIVO_TONE: Record<string, { colorVar: string; colorHex: string; urgente?: boolean }> = {
  'Evento adverso':              { colorVar: 'var(--spira-acc-deep-danger)', colorHex: '#A6483B', urgente: true },
  'Síntomas reportados':         { colorVar: 'var(--spira-acc-deep-warn)',   colorHex: '#B0823F' },
  'Laboratorio fuera de rango':  { colorVar: 'var(--spira-acc-deep-warn)',   colorHex: '#B0823F' },
  'Consulta clínica':            { colorVar: 'var(--spira-acc-deep-track)',  colorHex: '#2E7D74' },
  'Otro':                        { colorVar: 'var(--spira-muted)',           colorHex: '#7C8C87' },
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
