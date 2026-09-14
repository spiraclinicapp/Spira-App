import { useState } from 'react'
import type { CSSProperties } from 'react'
import { SearchableSelect } from '../../components/SearchableSelect'
import { IP_MAX_BYTES, IP_MIME_TYPES, formatBytes } from '../../data/pharma'
import type { CandidatoOtroRow } from '../../data/pharma'
import { ConstanciaDropzone, ConstanciaPendiente } from './ConstanciaIp'
import { EntregarEnPartes, partesInvalidas } from './EntregarEnPartes'

/** Lo que el formulario suma a la solicitud: un «Otro» con su receta, todavía sin mandar. */
export interface OtroElegido {
  medication_id: string
  name: string
  quantity: number
  quantity_indicated: number | null
  receta: File
}

/**
 * «Otro medicamento» (0124, D7, D20, mock 3): un medicamento del catálogo del protocolo que el
 * paciente no tiene habilitado, con receta obligatoria.
 *
 * NO SE PIDE COMO UN RENGLÓN: viaja como pedido de habilitación, y Farmacia lo habilita al tomar el
 * pedido (el candado de la 0050 no se afloja, 0076:21). Por eso vive en su propio formulario y no es
 * una opción más del desplegable de la medicación habilitada.
 *
 * La receta se elige acá y se sube recién al solicitar, igual que la constancia del IP: la solicitud
 * es UN acto. Se valida lo que se puede sin red (tamaño y formato), y se ve antes de mandar, porque el
 * error típico es adjuntar la receta de otro paciente.
 */
export function FormularioOtro({ candidatos, loading, error, inicial, excluidos, accent, onVolver, onAgregar }: {
  candidatos: readonly CandidatoOtroRow[]
  loading: boolean
  error: string | null
  /** «Pedir de nuevo» (D23): medicamento y cantidad cargados; falta sólo la receta nueva. */
  inicial: { medicationId: string; quantity: number; quantityIndicated: number | null } | null
  /** Medicamentos que ya están en lo que se va a mandar: no se ofrecen dos veces. */
  excluidos: ReadonlySet<string>
  accent: string
  onVolver: () => void
  onAgregar: (o: OtroElegido) => void
}) {
  const [medId, setMedId] = useState(inicial?.medicationId ?? '')
  const [qty, setQty] = useState(String(inicial?.quantity ?? 1))
  const [enPartes, setEnPartes] = useState(inicial?.quantityIndicated != null)
  const [indicado, setIndicado] = useState(inicial?.quantityIndicated != null ? String(inicial.quantityIndicated) : '')
  const [receta, setReceta] = useState<File | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const opciones = candidatos.filter((c) => !excluidos.has(c.medication_id))
  const elegido = opciones.find((c) => c.medication_id === medId) ?? null
  const qtyNum = parseInt(qty, 10)
  const falta = !elegido ? 'Elegí el medicamento'
    : !Number.isFinite(qtyNum) || qtyNum <= 0 ? 'Completá la cantidad'
    : partesInvalidas(enPartes, indicado, qtyNum) ? 'Revisá el total indicado'
    : !receta ? 'Falta la receta'
    : null

  function elegirReceta(f: File) {
    if (f.size > IP_MAX_BYTES) { setErr(`La receta pesa ${formatBytes(f.size)} y el máximo es 10 MB.`); return }
    if (!IP_MIME_TYPES.includes(f.type)) { setErr('Formato no admitido. Se aceptan PDF, JPG, PNG y WEBP.'); return }
    setErr(null)
    setReceta(f)
  }

  function agregar() {
    if (falta || !elegido || !receta) return
    onAgregar({
      medication_id: elegido.medication_id,
      name: elegido.nombre,
      quantity: qtyNum,
      quantity_indicated: enPartes ? parseInt(indicado, 10) : null,
      receta,
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}>Otro medicamento</span>
        <button type="button" onClick={onVolver} style={linkBtn}>Volver a la lista</button>
      </div>

      {error ? (
        <div style={{ ...muted, color: 'var(--spira-acc-deep-danger)' }} role="alert">{error}</div>
      ) : !loading && opciones.length === 0 ? (
        // D20: sólo lo que tiene stock vigente en el protocolo. Sin nada, se dice y no se ofrece un
        // desplegable vacío.
        <div style={muted}>No hay otro medicamento con stock en este protocolo.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <SearchableSelect
                value={medId}
                onChange={(v) => { setMedId(v); setErr(null) }}
                options={opciones.map((c) => ({
                  value: c.medication_id,
                  label: c.nombre,
                  desc: `${c.en_estante} en stock`,
                }))}
                placeholder={loading ? 'Cargando…' : 'Medicamento…'}
                searchPlaceholder="Buscar…"
                disabled={loading}
              />
            </div>
            <input
              type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)}
              placeholder="Cant." aria-label="Cantidad a entregar hoy" style={cantInput}
            />
          </div>

          <EntregarEnPartes
            activo={enPartes} onActivo={setEnPartes} indicado={indicado} onIndicado={setIndicado}
            cantidad={qtyNum} accent={accent}
          />

          {/* Una sola frase: de dónde sale y hasta cuándo vale (R6). */}
          <div style={{ ...muted, fontSize: 12, marginTop: 8 }}>
            {elegido ? `${elegido.en_estante} en stock · ` : ''}Farmacia lo habilita sólo para esta entrega.
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink-soft)', margin: '12px 0 7px' }}>
            Receta o indicación
          </div>
          {receta ? (
            <ConstanciaPendiente file={receta} accent={accent} onQuitar={() => { setReceta(null); setErr(null) }} />
          ) : (
            <ConstanciaDropzone accent={accent} busy={false} onFile={elegirReceta} que="la receta" />
          )}
        </>
      )}

      {err && <div style={{ ...muted, color: 'var(--spira-acc-deep-danger)', marginTop: 8 }} role="alert">{err}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <button type="button" onClick={onVolver} style={secundario}>Cancelar</button>
        <div style={{ flex: 1 }} />
        {falta && <span style={{ fontSize: 12, color: 'var(--spira-muted)' }}>{falta}</span>}
        <button
          type="button" onClick={agregar} disabled={!!falta}
          style={{ ...secundario, background: 'var(--spira-surface)', opacity: falta ? 0.6 : 1, cursor: falta ? 'default' : 'pointer' }}
        >
          Agregar
        </button>
      </div>
    </div>
  )
}

const muted: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)', lineHeight: 1.4 }

const linkBtn: CSSProperties = {
  marginLeft: 'auto', background: 'transparent', border: 'none', padding: '2px 0', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, color: 'var(--spira-muted)',
}

const cantInput: CSSProperties = {
  width: 74, height: 44, borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  padding: '0 12px', fontFamily: 'var(--spira-font-text)', fontSize: 14, color: 'var(--spira-ink)',
}

const secundario: CSSProperties = {
  height: 36, padding: '0 14px', borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  color: 'var(--spira-ink)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13,
}
