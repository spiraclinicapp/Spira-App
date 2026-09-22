import { useState } from 'react'
import { Modal } from '../../../components/Modal'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { fieldLabelStyle } from '../../../components/FormField'
import { diaMes, esDiaDeCorteValido, guardarDiaCorte, periodoDe, periodoSiguiente } from '../../../data/pharma'
import { AvisoLinea, errorTexto } from './piezas'

const DIAS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))

/**
 * El día de corte de toda Farmacia (R4, RD15): desplegable del 1 al 31, nunca texto libre. Si se cambia con
 * uno ya cargado, avisa cómo queda el período en curso; los pedidos ya emitidos conservan el suyo.
 */
export function DiaDeCorte({ actual, hoy, accentSolid, onClose, onGuardado }: {
  actual: number | null
  hoy: string
  accentSolid: string
  onClose: () => void
  onGuardado: () => void
}) {
  const [dia, setDia] = useState(actual == null ? '' : String(actual))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const n = Number(dia)
  const valido = dia !== '' && esDiaDeCorteValido(n)
  const cambia = valido && n !== actual
  const nuevo = valido ? periodoDe(hoy, n) : null
  const cortes = nuevo
    ? [nuevo, periodoSiguiente(nuevo, n), periodoSiguiente(periodoSiguiente(nuevo, n), n)].map((p) => diaMes(p.hasta))
    : []

  async function guardar() {
    if (!cambia || guardando) return
    setGuardando(true); setError(null)
    const r = await guardarDiaCorte(n)
    setGuardando(false)
    if (r.error) { setError(r.error); return }
    onGuardado()
  }

  return (
    <Modal
      title="Día de corte" subtitle="El día del mes en que cierra cada período. Vale para todos los estudios."
      onClose={guardando ? () => {} : onClose} maxWidth={428}
    >
      <div style={{ ...fieldLabelStyle, marginBottom: 6 }}>Día del mes</div>
      <div style={{ width: 120 }}>
        <SearchableSelect value={dia} onChange={setDia} options={DIAS} placeholder="Elegí" searchable="never" entity="día" />
      </div>
      {cambia && actual != null && nuevo && (
        <div style={{ marginTop: 12 }}>
          <AvisoLinea tono="warn" texto={`Si lo cambiás ahora, el período en curso pasa a ser del ${diaMes(nuevo.desde)} al ${diaMes(nuevo.hasta)}. Los pedidos ya emitidos conservan su período.`} />
        </div>
      )}
      {cortes.length > 0 && (
        <p style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', margin: '6px 0 0', lineHeight: 1.5 }}>
          Próximos cortes: <span className="spira-mono">{cortes.join(' · ')}</span>. Si un mes no tiene ese día, corta el último.
        </p>
      )}
      {error && <p role="alert" style={{ ...errorTexto, marginTop: 12 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button type="button" onClick={onClose} disabled={guardando} style={btnOutline}>Cancelar</button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => void guardar()} disabled={!cambia || guardando} style={{ ...btnPrimary(accentSolid), opacity: !cambia || guardando ? 0.6 : 1 }}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Modal>
  )
}
