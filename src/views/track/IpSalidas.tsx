import { useState } from 'react'
import type { CSSProperties } from 'react'
import { SearchableSelect } from '../../components/SearchableSelect'
import type { SelectOption } from '../../components/SearchableSelect'
import { cerrarIpDeVisita, reabrirIpDeVisita, useEntregasIpDelEnrolamiento } from '../../data/visitIp'
import type { MotivoNoCorresponde, VisitIpStatusRow } from '../../data/visitIp'
import { formatDateAR } from '../../lib/dates'
import { accionesIp, cierreListo, MOTIVOS_NO_CORRESPONDE } from './ipEstado'

type TipoCierre = 'no_corresponde' | 'entregado_en_otra_visita'

const TIPOS: SelectOption[] = [
  { value: 'no_corresponde', label: 'No corresponde entregarlo' },
  { value: 'entregado_en_otra_visita', label: 'Se entregó en otra visita' },
]

/**
 * Las dos salidas explícitas del producto en investigación (plan `dispensacion-base-e-imp`, D2 y
 * D11): «No corresponde entregarlo» y «Se entregó en otra visita», más el deshacer.
 *
 * VIVEN EN LA SECCIÓN «Producto en investigación» DE DISPENSACIÓN, que es donde se cuenta todo lo
 * del IP. Antes eran la cola de la fila del IP en el panel de Procedimientos; ese panel se retiró
 * con el rediseño del modal (plan `resumen-de-visita`, D2) y, sin mudarlas, un IP que no
 * correspondía no se podía cerrar desde ningún lado — y un IP abierto frena el «Completa» de la
 * visita.
 *
 * NO REPITE EL ESTADO: la sección ya lo dice arriba con `desenlaceIp`, la misma frase para todos los
 * lugares. Acá va sólo lo que se puede HACER, plegado detrás de un botón con nombre: son la
 * excepción y no pueden competir con la regla (que es pedirlo a Farmacia).
 */
export function IpSalidas({ row, accent, readOnly }: {
  row: VisitIpStatusRow
  accent: string
  readOnly: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<TipoCierre | null>(null)
  const [motivo, setMotivo] = useState<MotivoNoCorresponde | null>(null)
  const [detalle, setDetalle] = useState('')
  const [entrega, setEntrega] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const { puedeCerrar, puedeDeshacer } = accionesIp(row.estado, readOnly)

  // Las entregas del enrolamiento se piden recién cuando hacen falta: casi nadie abre este camino.
  const entregasQ = useEntregasIpDelEnrolamiento(row.enrollment_id, row.visit_id, abierto && tipo === 'entregado_en_otra_visita')
  const opcionesEntrega: SelectOption[] = (entregasQ.data ?? []).map((e) => ({
    value: e.dispensation_id,
    label: `${e.visit_code ?? 'Visita'} · ${formatDateAR(e.delivered_at)} · ${e.ip_kits} ${e.ip_kits === 1 ? 'kit' : 'kits'}`,
  }))

  const listo = cierreListo(tipo, motivo, detalle, entrega)

  const limpiar = () => {
    setAbierto(false); setTipo(null); setMotivo(null); setDetalle(''); setEntrega(null); setErr(null)
  }

  async function guardar() {
    if (!tipo || !listo || busy) return
    setBusy(true); setErr(null)
    const res = await cerrarIpDeVisita({ visitId: row.visit_id, kind: tipo, motivo, detalle, dispensationId: entrega })
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    limpiar()
  }

  async function deshacer() {
    if (busy) return
    setBusy(true); setErr(null)
    const res = await reabrirIpDeVisita(row.visit_id)
    setBusy(false)
    if (res.error) setErr(res.error)
  }

  if (!puedeCerrar && !puedeDeshacer) return null

  return (
    <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!abierto && (
        <div style={{ display: 'flex', gap: 8 }}>
          {puedeCerrar && (
            <button type="button" className="spira-no-press" onClick={() => setAbierto(true)} style={pill}>
              No se entrega acá
            </button>
          )}
          {puedeDeshacer && (
            <button type="button" className="spira-no-press" onClick={() => void deshacer()} disabled={busy} style={pill}>
              {busy ? 'Deshaciendo…' : 'Deshacer'}
            </button>
          )}
        </div>
      )}

      {err && !abierto && <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)' }}>{err}</div>}

      {abierto && (
        <>
          <SearchableSelect
            options={TIPOS}
            value={tipo ?? ''}
            onChange={(v) => { setTipo(v as TipoCierre); setErr(null) }}
            placeholder="Elegí qué pasó"
            searchable="never"
          />

          {tipo === 'no_corresponde' && (
            <>
              <SearchableSelect
                options={MOTIVOS_NO_CORRESPONDE.map((m) => ({ value: m.value, label: m.label }))}
                value={motivo ?? ''}
                onChange={(v) => setMotivo(v as MotivoNoCorresponde)}
                placeholder="Elegí el motivo"
                searchable="never"
              />
              {motivo === 'otro' && (
                <input
                  value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                  placeholder="Contá brevemente el motivo"
                  maxLength={200}
                  style={input}
                />
              )}
            </>
          )}

          {tipo === 'entregado_en_otra_visita' && (
            entregasQ.loading
              ? <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>Buscando entregas de este paciente…</div>
              : opcionesEntrega.length === 0
                ? <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>No hay otra entrega de producto en investigación para elegir.</div>
                : (
                  <SearchableSelect
                    options={opcionesEntrega}
                    value={entrega ?? ''}
                    onChange={setEntrega}
                    placeholder="Elegí la entrega"
                    searchable="never"
                  />
                )
          )}

          {err && <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)' }}>{err}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={limpiar} disabled={busy} style={btnQuiet}>Cancelar</button>
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={!listo || busy}
              style={{ ...btnSolid, background: accent, opacity: !listo || busy ? 0.55 : 1, cursor: !listo || busy ? 'default' : 'pointer' }}
            >
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const pill: CSSProperties = {
  flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px',
  borderRadius: 'var(--spira-radius-pill)',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'transparent', color: 'var(--spira-ink)',
  fontFamily: 'var(--spira-font-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
}

const input: CSSProperties = {
  height: 40, borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', padding: '0 12px',
  fontFamily: 'var(--spira-font-text)', fontSize: 13.5, color: 'var(--spira-ink)',
}

const btnQuiet: CSSProperties = {
  height: 34, padding: '0 14px', borderRadius: 9, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)',
  fontFamily: 'var(--spira-font-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}

const btnSolid: CSSProperties = {
  height: 34, padding: '0 16px', borderRadius: 9, border: 'none', color: 'var(--spira-on-accent)',
  fontFamily: 'var(--spira-font-text)', fontSize: 13, fontWeight: 700,
}
