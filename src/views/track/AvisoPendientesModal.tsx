import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { FormField } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { CasillasDeProcedimientos } from './CasillasDeProcedimientos'
import type { ProcedimientoElegible } from './retomar'

/**
 * El aviso al tocar «Finalizar atención» con procedimientos que dejan reporte sin tildar (v0145).
 *
 * SE TILDA LO QUE SE HIZO, no lo que queda (Director, 2026-09-27: «vos marcás los que sí hiciste y
 * si le das a continuar avisa que estos van a quedar pendientes»). Es la misma pregunta que ya hace
 * la visita —¿qué se hizo?—, así que tildar acá es tildar de verdad: arranca el plazo del reporte.
 * Lo que queda sin tildar pasa a «para otro día», con un segundo paso que lo nombra antes de
 * finalizar: marcar algo como pendiente sin decirlo sería la postergación silenciosa que esto viene
 * a evitar. No hay «finalizar sin pasarlos»: lo que no se hizo, queda.
 *
 * Mientras guarda no se cierra: un Esc a mitad de camino dejaría tildes o marcas puestas sin
 * finalizar. Cerrar antes de «Finalizar» cancela todo: no se tilda ni se marca nada.
 */
export function AvisoPendientesModal({ pendientes, accent, onFinalizar, onClose }: {
  pendientes: readonly ProcedimientoElegible[]
  accent: string
  /** Tilda `hechos`, deja el resto para otro día y finaliza. Devuelve el error a mostrar, o `null`. */
  onFinalizar: (hechos: string[]) => Promise<string | null>
  onClose: () => void
}) {
  const [hechos, setHechos] = useState<Set<string>>(new Set())
  const [paso, setPaso] = useState<'hechos' | 'aviso'>('hechos')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const quedan = pendientes.filter((p) => !hechos.has(p.procedure_id))

  const finalizar = async () => {
    setBusy(true); setError(null)
    const e = await onFinalizar([...hechos])
    setBusy(false)
    if (e) setError(e)
  }
  const continuar = () => {
    if (quedan.length === 0) { void finalizar(); return }
    setPaso('aviso')
  }

  const errorBox = error && (
    <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
  )
  const primario = { ...btnPrimary(accent), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }

  return (
    <Modal
      title={paso === 'hechos' ? 'Esta visita tiene procedimientos sin marcar' : 'Van a quedar pendientes'}
      subtitle={paso === 'hechos'
        ? 'Marcá los que se hicieron. Lo que no marques queda para otro día.'
        : 'Estos procedimientos quedan para otro día. Los vas a encontrar en Pendientes.'}
      onClose={busy ? () => {} : onClose}
      maxWidth={480}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {paso === 'hechos' ? (
          <FormField label="¿Qué se hizo?">
            <CasillasDeProcedimientos items={pendientes} elegidos={hechos} onChange={setHechos} accent={accent} />
          </FormField>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, color: 'var(--spira-ink)' }}>
            {quedan.map((p) => <li key={p.procedure_id}>{p.name}</li>)}
          </ul>
        )}
        {errorBox}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          {paso === 'hechos' ? (
            <>
              <button type="button" onClick={onClose} disabled={busy} style={btnOutline}>Cancelar</button>
              <button type="button" onClick={continuar} disabled={busy} style={primario}>
                {busy ? 'Guardando…' : 'Continuar'}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { setPaso('hechos'); setError(null) }} disabled={busy} style={btnOutline}>Volver</button>
              <button type="button" onClick={() => void finalizar()} disabled={busy} style={primario}>
                {busy ? 'Guardando…' : 'Finalizar'}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
