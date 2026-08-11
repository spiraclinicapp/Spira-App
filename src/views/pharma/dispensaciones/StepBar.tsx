import type { BoardColumn } from '../../../data/pharma'
import { COLUMN_META } from './estados'

/**
 * Los pasos NO tienen texto propio: son los nombres de las columnas del tablero
 * (`COLUMN_META[...].one`), que es de donde viene la farmacéutica al abrir el cajón.
 *
 * Tenerlos escritos aparte hacía que la barra dijera "Preparar + escanear · Lista para retirar ·
 * Entregar" —dos verbos y un estado— mientras las columnas de atrás decían "Preparando · Listas ·
 * Entregadas". Tres vocabularios para tres pasos, en la misma pantalla.
 */
const STEPS: BoardColumn[] = ['preparando', 'lista', 'entregada']

/**
 * Los tres pasos del cajón. La barra de cada paso cumplido o actual toma el ámbar de Pharma; el
 * actual además lleva el texto en ámbar. Es orientación, no un control: no se puede clickear para
 * saltar de paso, porque el avance depende del trabajo real (escanear, entregar).
 */
export function StepBar({ current }: { current: BoardColumn }) {
  const idx = STEPS.indexOf(current)
  return (
    <div
      style={{ display: 'flex', gap: 8, padding: '0 22px 14px' }}
      role="list"
      aria-label={`Paso ${Math.max(idx + 1, 1)} de ${STEPS.length}`}
    >
      {STEPS.map((key, i) => {
        const done = i < idx
        const cur = i === idx
        return (
          <div key={key} role="listitem" style={{ flex: 1 }} aria-current={cur ? 'step' : undefined}>
            <div
              style={{
                height: 3, borderRadius: 2, marginBottom: 7,
                background: done || cur ? 'var(--spira-pharma-solid)' : 'var(--spira-line)',
              }}
            />
            <span style={{ fontSize: 11.5, fontWeight: cur ? 700 : 400, color: cur ? 'var(--spira-pharma-solid)' : 'var(--spira-muted)' }}>
              {COLUMN_META[key].one}
            </span>
          </div>
        )
      })}
    </div>
  )
}
