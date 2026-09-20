import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { fieldInput, fieldLabelStyle } from '../../../components/FormField'
import { configurarReposicion } from '../../../data/pharma'
import type { ModoReposicion, RenglonDelPeriodo } from '../../../data/pharma'
import { chip, chipActivo } from '../reportes/estilos'
import { errorTexto, plural } from './piezas'

const MODOS: { valor: ModoReposicion; label: string }[] = [
  { valor: 'mensual', label: 'Por mes' },
  { valor: 'a_demanda', label: 'A demanda' },
  { valor: 'no_se_compra', label: 'No se compra' },
]

/**
 * Cómo se repone un medicamento del estudio (D2-D4, D25), mudado tal cual de la card de Estadísticas. Por
 * función (`configurar_reposicion`, 0125) porque la tabla exige leader para escribir y esto es de Farmacia
 * operator (D12). Se abre dentro del renglón, en el lugar de la boleta.
 */
export function CargarReposicion({ r, accentSolid, onCancelar, onGuardado }: {
  r: RenglonDelPeriodo
  accentSolid: string
  onCancelar: () => void
  onGuardado: () => void
}) {
  const [modo, setModo] = useState<ModoReposicion>(r.modo ?? 'mensual')
  const [cantidad, setCantidad] = useState(() => {
    if (r.modo === 'mensual') return String(r.envasesPorMes ?? 1)
    if (r.modo === 'a_demanda') return String(r.stockFijo ?? 0)
    return '1'
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const n = Number(cantidad)
  const valida = modo === 'no_se_compra' || (Number.isInteger(n) && (modo === 'mensual' ? n >= 1 : n >= 0))

  async function guardar() {
    if (!valida || guardando) return
    setGuardando(true); setError(null)
    const res = await configurarReposicion({
      protocolMedicationId: r.protocolMedicationId,
      modo,
      envasesPorMes: modo === 'mensual' ? n : null,
      stockFijo: modo === 'a_demanda' ? n : null,
    })
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    onGuardado()
  }

  function teclasModo(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = MODOS.findIndex((x) => x.valor === modo)
    const j = (i + (e.key === 'ArrowRight' ? 1 : MODOS.length - 1)) % MODOS.length
    setModo(MODOS[j].valor)
    ;(e.currentTarget.children[j] as HTMLElement | undefined)?.focus()
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void guardar() }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancelar() } }}
      style={{ paddingTop: 8 }}
    >
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div id={`modo-${r.clave}`} style={{ ...fieldLabelStyle, marginBottom: 6 }}>Cómo se repone</div>
          <div role="radiogroup" aria-labelledby={`modo-${r.clave}`} onKeyDown={teclasModo} style={{ display: 'inline-flex', gap: 7 }}>
            {MODOS.map((m) => (
              <button
                key={m.valor} type="button" role="radio" aria-checked={modo === m.valor} tabIndex={modo === m.valor ? 0 : -1}
                onClick={() => setModo(m.valor)} style={{ ...chip, ...(modo === m.valor ? chipActivo : null) }}
                autoFocus={m.valor === modo}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {modo !== 'no_se_compra' && (
          <label style={{ display: 'block' }}>
            <div style={{ ...fieldLabelStyle, marginBottom: 6 }}>{modo === 'mensual' ? 'Envases por mes, por paciente' : 'Tener siempre en el estante'}</div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number" inputMode="numeric" min={modo === 'mensual' ? 1 : 0} step={1}
                value={cantidad} onChange={(e) => setCantidad(e.target.value)}
                style={{ ...fieldInput, width: 96 }} className="spira-mono"
              />
              <span style={{ fontSize: 13, color: 'var(--spira-ink-soft)' }}>{n === 1 ? 'envase' : 'envases'}</span>
            </span>
          </label>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', marginTop: 12, maxWidth: 560, lineHeight: 1.45 }}>
        {modo === 'mensual' && <>{plural(r.pacientes, 'paciente lo tiene', 'pacientes lo tienen')} habilitado. Un paciente con otra cantidad se cambia desde su ficha.</>}
        {modo === 'a_demanda' && <>Para lo que no se usa todos los meses, como el rescate. No mira pacientes.</>}
        {modo === 'no_se_compra' && <>Lo manda el sponsor o no se repone: queda fuera de la cuenta.</>}
      </div>
      {error && <p role="alert" style={{ ...errorTexto, marginTop: 12 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="submit" disabled={!valida || guardando} style={{ ...btnPrimary(accentSolid), opacity: !valida || guardando ? 0.6 : 1 }}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancelar} style={btnOutline}>Cancelar</button>
      </div>
    </form>
  )
}
