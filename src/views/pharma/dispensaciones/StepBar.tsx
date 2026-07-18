import type { BoardColumn } from '../../../data/pharma'

const STEPS: { key: BoardColumn; label: string }[] = [
  { key: 'preparando', label: 'Preparar + escanear' },
  { key: 'lista', label: 'Lista para retirar' },
  { key: 'entregada', label: 'Entregar' },
]

/**
 * Los tres pasos del cajón. La barra de cada paso cumplido o actual toma el ámbar de Pharma; el
 * actual además lleva el texto en ámbar. Es orientación, no un control: no se puede clickear para
 * saltar de paso, porque el avance depende del trabajo real (escanear, entregar).
 */
export function StepBar({ current }: { current: BoardColumn }) {
  const idx = STEPS.findIndex((s) => s.key === current)
  return (
    <div
      style={{ display: 'flex', gap: 8, padding: '0 22px 14px' }}
      role="list"
      aria-label={`Paso ${Math.max(idx + 1, 1)} de ${STEPS.length}`}
    >
      {STEPS.map((s, i) => {
        const done = i < idx
        const cur = i === idx
        return (
          <div key={s.key} role="listitem" style={{ flex: 1 }} aria-current={cur ? 'step' : undefined}>
            <div
              style={{
                height: 3, borderRadius: 2, marginBottom: 7,
                background: done || cur ? 'var(--spira-pharma-solid)' : 'var(--spira-line)',
              }}
            />
            <span style={{ fontSize: 11.5, fontWeight: cur ? 700 : 400, color: cur ? 'var(--spira-pharma-solid)' : 'var(--spira-muted)' }}>
              {s.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
